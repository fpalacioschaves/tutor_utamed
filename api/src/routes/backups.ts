import { Router } from "express";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "../lib/prisma";

export const backupsRouter = Router();

const REPO_ROOT = path.resolve(__dirname, "../../..");
const BACKUPS_ROOT = path.join(REPO_ROOT, "local-backups");
const DATABASE_PATH = path.join(REPO_ROOT, "api", "prisma", "dev.db");
const LOCAL_CONTENT_PATH = path.join(REPO_ROOT, "local-content");
const LOCAL_DATA_PATH = path.join(REPO_ROOT, "local-data");

type BackupManifest = {
  name: string;
  createdAt: string;
  relativePath: string;
  sizeBytes: number;
  includes: {
    database: boolean;
    localContent: boolean;
    localData: boolean;
  };
};

async function exists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(source: string, destination: string) {
  if (!(await exists(source))) return false;
  await fs.cp(source, destination, { recursive: true });
  return true;
}

async function directorySize(target: string): Promise<number> {
  const stat = await fs.stat(target);
  if (stat.isFile()) return stat.size;
  const entries = await fs.readdir(target, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    total += await directorySize(path.join(target, entry.name));
  }
  return total;
}

function backupName(date: Date) {
  return `backup-${date.toISOString().replace(/[:.]/g, "-")}`;
}

async function readBackupManifest(directory: string): Promise<BackupManifest | null> {
  const manifestPath = path.join(directory, "manifest.json");
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8")) as BackupManifest;
  } catch {
    return null;
  }
}

backupsRouter.get("/", async (_req, res, next) => {
  try {
    await fs.mkdir(BACKUPS_ROOT, { recursive: true });
    const entries = await fs.readdir(BACKUPS_ROOT, { withFileTypes: true });
    const backups: BackupManifest[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("backup-")) continue;
      const directory = path.join(BACKUPS_ROOT, entry.name);
      const manifest = await readBackupManifest(directory);
      if (manifest) {
        backups.push(manifest);
        continue;
      }

      const stat = await fs.stat(directory);
      backups.push({
        name: entry.name,
        createdAt: stat.birthtime.toISOString(),
        relativePath: path.relative(REPO_ROOT, directory),
        sizeBytes: await directorySize(directory),
        includes: {
          database: await exists(path.join(directory, "dev.db")),
          localContent: await exists(path.join(directory, "local-content")),
          localData: await exists(path.join(directory, "local-data")),
        },
      });
    }

    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ backupsRoot: path.relative(REPO_ROOT, BACKUPS_ROOT), backups });
  } catch (error) {
    next(error);
  }
});

backupsRouter.post("/", async (_req, res, next) => {
  const createdAt = new Date();
  const name = backupName(createdAt);
  const directory = path.join(BACKUPS_ROOT, name);

  try {
    if (!(await exists(DATABASE_PATH))) {
      res.status(409).json({ error: "No se encontró la base de datos local que hay que copiar." });
      return;
    }

    await fs.mkdir(directory, { recursive: true });

    // En SQLite cerramos primero las conexiones de Prisma para que la copia
    // se haga con todos los cambios ya escritos en disco.
    try {
      await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(FULL)");
    } catch {
      // La base puede no estar usando WAL; en ese caso no hay nada que vaciar.
    }

    await prisma.$disconnect();

    let databaseCopied = false;
    let localContentCopied = false;
    let localDataCopied = false;

    try {
      await fs.copyFile(DATABASE_PATH, path.join(directory, "dev.db"));
      databaseCopied = true;

      for (const suffix of ["-journal", "-wal", "-shm"]) {
        const sidecar = `${DATABASE_PATH}${suffix}`;
        if (await exists(sidecar)) {
          await fs.copyFile(sidecar, path.join(directory, `dev.db${suffix}`));
        }
      }

      localContentCopied = await copyIfExists(LOCAL_CONTENT_PATH, path.join(directory, "local-content"));
      localDataCopied = await copyIfExists(LOCAL_DATA_PATH, path.join(directory, "local-data"));
    } finally {
      await prisma.$connect();
    }

    const manifest: BackupManifest = {
      name,
      createdAt: createdAt.toISOString(),
      relativePath: path.relative(REPO_ROOT, directory),
      sizeBytes: await directorySize(directory),
      includes: {
        database: databaseCopied,
        localContent: localContentCopied,
        localData: localDataCopied,
      },
    };

    await fs.writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    manifest.sizeBytes = await directorySize(directory);
    await fs.writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    res.status(201).json(manifest);
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    try {
      await prisma.$connect();
    } catch {
      // El manejador general informará del fallo original.
    }
    next(error);
  }
});
