import { Router } from "express";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const databaseStatusRouter = Router();

const ROOT = path.resolve(__dirname, "../../..");
const DB_DIRECTORY = path.join(ROOT, "api", "prisma");
const CURRENT = path.join(DB_DIRECTORY, "dev.db");
const BACKUPS = path.join(ROOT, "local-backups");

function readCounts(file: string) {
  if (!existsSync(file)) return null;
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const tables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
        .map((row) => String(row.name)),
    );
    const count = (name: string) => tables.has(name)
      ? Number(db!.prepare(`SELECT COUNT(*) AS total FROM "${name}"`).get()?.total ?? 0)
      : null;
    return { alumnos: count("alumnos"), matriculas: count("matriculas"), grupos: count("grupos") };
  } catch {
    return { alumnos: null, matriculas: null, grupos: null };
  } finally {
    db?.close();
  }
}

// Solo lectura: NO restaura, modifica ni crea archivos.
databaseStatusRouter.get("/", (_req, res) => {
  const candidates: Array<{ path: string; counts: ReturnType<typeof readCounts> }> = [];
  if (existsSync(DB_DIRECTORY)) {
    for (const entry of readdirSync(DB_DIRECTORY)) {
      if (entry === "dev.pre-grupos.db" || /^dev\.(?:pre-update-|pre-grupo-id-|pre-reservas-).*\.db$/.test(entry)) {
        const file = path.join(DB_DIRECTORY, entry);
        candidates.push({ path: file, counts: readCounts(file) });
      }
    }
  }
  if (existsSync(BACKUPS)) {
    for (const entry of readdirSync(BACKUPS, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("backup-")) continue;
      const file = path.join(BACKUPS, entry.name, "dev.db");
      if (existsSync(file)) candidates.push({ path: file, counts: readCounts(file) });
    }
  }

  res.json({
    path: CURRENT,
    counts: readCounts(CURRENT),
    candidates,
    warning: "Consulta de solo lectura. Un recuento vacío NO demuestra que otros archivos SQLite hayan desaparecido.",
  });
});
