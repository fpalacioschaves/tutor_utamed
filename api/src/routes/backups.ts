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

type BackupKind = "MANUAL" | "PRE_RESTORE";

type BackupManifest = {
  name: string;
  createdAt: string;
  relativePath: string;
  sizeBytes: number;
  kind?: BackupKind;
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

function resolveBackupDirectory(name: string) {
  if (!/^backup-[0-9A-Za-z._-]+$/.test(name)) {
    throw new Error("Nombre de copia de seguridad no válido");
  }

  const directory = path.resolve(BACKUPS_ROOT, name);
  const rootWithSeparator = path.resolve(BACKUPS_ROOT) + path.sep;
  if (!directory.startsWith(rootWithSeparator)) {
    throw new Error("Ruta de copia de seguridad no válida");
  }
  return directory;
}

async function readBackupManifest(directory: string): Promise<BackupManifest | null> {
  const manifestPath = path.join(directory, "manifest.json");
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8")) as BackupManifest;
  } catch {
    return null;
  }
}

async function inferBackupManifest(directory: string, name: string): Promise<BackupManifest> {
  const stat = await fs.stat(directory);
  return {
    name,
    createdAt: stat.birthtime.toISOString(),
    relativePath: path.relative(REPO_ROOT, directory),
    sizeBytes: await directorySize(directory),
    kind: "MANUAL",
    includes: {
      database: await exists(path.join(directory, "dev.db")),
      localContent: await exists(path.join(directory, "local-content")),
      localData: await exists(path.join(directory, "local-data")),
    },
  };
}

async function getManifest(directory: string, name: string) {
  return (await readBackupManifest(directory)) ?? inferBackupManifest(directory, name);
}

async function validateSqliteFile(filePath: string) {
  if (!(await exists(filePath))) throw new Error("La copia no contiene la base de datos.");
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    const result = await handle.read(header, 0, header.length, 0);
    if (result.bytesRead < 16 || header.toString("utf8") !== "SQLite format 3\u0000") {
      throw new Error("La base de datos incluida en la copia no tiene un formato SQLite válido.");
    }
  } finally {
    await handle.close();
  }
}

async function flushDatabase() {
  try {
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(FULL)");
  } catch {
    // La base puede no estar usando WAL; en ese caso no hay nada que vaciar.
  }
}

async function createBackup(kind: BackupKind = "MANUAL") {
  const createdAt = new Date();
  const name = backupName(createdAt);
  const directory = path.join(BACKUPS_ROOT, name);

  if (!(await exists(DATABASE_PATH))) {
    throw new Error("No se encontró la base de datos local que hay que copiar.");
  }

  await fs.mkdir(directory, { recursive: true });

  try {
    await flushDatabase();
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
      sizeBytes: 0,
      kind,
      includes: {
        database: databaseCopied,
        localContent: localContentCopied,
        localData: localDataCopied,
      },
    };

    await fs.writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    manifest.sizeBytes = await directorySize(directory);
    await fs.writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return manifest;
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    try {
      await prisma.$connect();
    } catch {
      // El error original es el que debe llegar al manejador general.
    }
    throw error;
  }
}

async function validateBackupContents(directory: string, manifest: BackupManifest) {
  await validateSqliteFile(path.join(directory, "dev.db"));

  if (manifest.includes.localContent && !(await exists(path.join(directory, "local-content")))) {
    throw new Error("La copia indica que contiene materiales, pero esa carpeta no está disponible.");
  }
  if (manifest.includes.localData && !(await exists(path.join(directory, "local-data")))) {
    throw new Error("La copia indica que contiene datos locales, pero esa carpeta no está disponible.");
  }
}

async function replaceDirectoryFromBackup(sourceDirectory: string, targetDirectory: string, included: boolean) {
  await fs.rm(targetDirectory, { recursive: true, force: true });
  if (included) {
    await fs.cp(sourceDirectory, targetDirectory, { recursive: true });
  }
}

async function applyBackup(directory: string, manifest: BackupManifest) {
  await validateBackupContents(directory, manifest);
  let disconnected = false;

  try {
    await flushDatabase();
    await prisma.$disconnect();
    disconnected = true;

    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      await fs.rm(`${DATABASE_PATH}${suffix}`, { force: true }).catch(() => undefined);
    }

    await fs.copyFile(path.join(directory, "dev.db"), DATABASE_PATH);

    for (const suffix of ["-journal", "-wal", "-shm"]) {
      const source = path.join(directory, `dev.db${suffix}`);
      if (await exists(source)) {
        await fs.copyFile(source, `${DATABASE_PATH}${suffix}`);
      }
    }

    await replaceDirectoryFromBackup(
      path.join(directory, "local-content"),
      LOCAL_CONTENT_PATH,
      manifest.includes.localContent,
    );
    await replaceDirectoryFromBackup(
      path.join(directory, "local-data"),
      LOCAL_DATA_PATH,
      manifest.includes.localData,
    );

    await prisma.$connect();
    disconnected = false;
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch (error) {
    if (disconnected) {
      await prisma.$connect().catch(() => undefined);
    }
    throw error;
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
      backups.push(await getManifest(directory, entry.name));
    }

    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ backupsRoot: path.relative(REPO_ROOT, BACKUPS_ROOT), backups });
  } catch (error) {
    next(error);
  }
});

backupsRouter.post("/", async (_req, res, next) => {
  try {
    res.status(201).json(await createBackup("MANUAL"));
  } catch (error) {
    next(error);
  }
});

backupsRouter.post("/:name/restore", async (req, res, next) => {
  try {
    const name = String(req.params.name || "");
    const directory = resolveBackupDirectory(name);
    if (!(await exists(directory))) {
      res.status(404).json({ error: "La copia de seguridad seleccionada no existe." });
      return;
    }

    const manifest = await getManifest(directory, name);
    if (!manifest.includes.database) {
      res.status(409).json({ error: "La copia seleccionada no contiene una base de datos restaurable." });
      return;
    }

    await validateBackupContents(directory, manifest);

    // Antes de sustituir nada se guarda siempre una copia del estado actual.
    // Así el usuario puede volver atrás incluso después de una restauración equivocada.
    const safetyBackup = await createBackup("PRE_RESTORE");

    try {
      await applyBackup(directory, manifest);
    } catch (restoreError) {
      const safetyDirectory = resolveBackupDirectory(safetyBackup.name);
      try {
        await applyBackup(safetyDirectory, safetyBackup);
      } catch (rollbackError) {
        const restoreMessage = restoreError instanceof Error ? restoreError.message : "Error desconocido";
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : "Error desconocido";
        throw new Error(`La restauración falló (${restoreMessage}) y tampoco se pudo recuperar automáticamente el estado anterior (${rollbackMessage}).`);
      }
      throw restoreError;
    }

    res.json({
      restored: manifest,
      safetyBackup,
      message: "Copia restaurada correctamente. Se creó una copia automática del estado anterior antes de restaurar.",
    });
  } catch (error) {
    next(error);
  }
});
