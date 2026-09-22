import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

// SOLO cambios aditivos sobre SQLite. ANTES de alterar un solo dato:
// copia online SQLite (incluye WAL), prueba de integridad y recuentos de
// TODAS las tablas. No se ejecuta db push, setup, seed ni se borra nada.
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = join(apiRoot, "prisma", "dev.db");
if (!existsSync(databasePath)) {
  console.error(`ABORTADO: no existe la base SQLite ${databasePath}`);
  process.exit(1);
}
function counts(db) {
  return Object.fromEntries(db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all().map(({ name }) => [
    name, Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n),
  ]));
}
function integrity(db) {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw new Error("SQLite no supera PRAGMA integrity_check");
}
const columnsToEnsure = [
  ["estado", '"estado" TEXT NOT NULL DEFAULT \'PROGRAMADA\''],
  ["motivo", '"motivo" TEXT'],
  ["observaciones", '"observaciones" TEXT'],
  ["acuerdos", '"acuerdos" TEXT'],
];
let source;
let snapshot;
let writer;
try {
  source = new DatabaseSync(databasePath, { readOnly: true });
  const tables = new Set(source.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'",
  ).all().map((row) => row.name));
  for (const table of ["alumnos", "sesiones", "grupos", "asignaturas", "matriculas"]) {
    if (!tables.has(table)) throw new Error(`Falta la tabla ${table}; no se altera la base.`);
  }
  const tableExists = tables.has("reservas_bloques_tutoria");
  const columns = tableExists
    ? new Set(source.prepare('PRAGMA table_info("reservas_bloques_tutoria")').all().map(row => row.name))
    : new Set();
  const missing = columnsToEnsure.filter(([name]) => !columns.has(name));
  if (tableExists && !missing.length) {
    console.log(`Esquema de tutorías actualizado; no se modifica ${databasePath}`);
  } else {
    integrity(source);
    const before = counts(source);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const copyPath = join(apiRoot, "prisma",
      `dev.pre-reservas-${stamp}-${randomUUID().slice(0, 8)}.db`);
    console.log("Guardando copia completa SQLite antes de añadir la estructura de tutorías...");
    await backup(source, copyPath);
    snapshot = new DatabaseSync(copyPath, { readOnly: true });
    integrity(snapshot);
    if (JSON.stringify(counts(snapshot)) !== JSON.stringify(before))
      throw new Error("La copia no conserva los registros originales.");
    snapshot.close(); snapshot = undefined;
    source.close(); source = undefined;
    writer = new DatabaseSync(databasePath, { timeout: 5000 });
    writer.exec("PRAGMA foreign_keys=ON");
    writer.exec("BEGIN IMMEDIATE");
    try {
      if (!tableExists) {
        writer.exec(`
          CREATE TABLE "reservas_bloques_tutoria" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "sesion_id" INTEGER NOT NULL,
            "bloque" INTEGER NOT NULL,
            "alumno_id" INTEGER NOT NULL,
            "estado" TEXT NOT NULL DEFAULT 'PROGRAMADA',
            "motivo" TEXT,
            "observaciones" TEXT,
            "acuerdos" TEXT,
            "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" DATETIME NOT NULL,
            CONSTRAINT "reservas_bloques_tutoria_sesion_id_fkey"
              FOREIGN KEY ("sesion_id") REFERENCES "sesiones" ("id")
              ON DELETE RESTRICT ON UPDATE CASCADE,
            CONSTRAINT "reservas_bloques_tutoria_alumno_id_fkey"
              FOREIGN KEY ("alumno_id") REFERENCES "alumnos" ("id")
              ON DELETE RESTRICT ON UPDATE CASCADE
          );
          CREATE UNIQUE INDEX "reservas_bloques_tutoria_sesion_id_bloque_key"
            ON "reservas_bloques_tutoria" ("sesion_id", "bloque");
          CREATE UNIQUE INDEX "reservas_bloques_tutoria_sesion_id_alumno_id_key"
            ON "reservas_bloques_tutoria" ("sesion_id", "alumno_id");
          CREATE INDEX "reservas_bloques_tutoria_alumno_id_idx"
            ON "reservas_bloques_tutoria" ("alumno_id");
        `);
      } else {
        for (const [name, definition] of missing) {
          console.log(`Añadiendo campo no destructivo: ${name}`);
          writer.exec(`ALTER TABLE "reservas_bloques_tutoria" ADD COLUMN ${definition}`);
        }
      }
      const after = counts(writer);
      for (const [table, total] of Object.entries(before)) {
        if (after[table] !== total)
          throw new Error(`Se ha modificado el recuento de ${table}: ${total} -> ${after[table]}`);
      }
      if (!tableExists && after.reservas_bloques_tutoria !== 0)
        throw new Error("La tabla de reservas recién creada no está vacía.");
      integrity(writer);
      writer.exec("COMMIT");
      console.log(`Esquema de tutorías actualizado; respaldo verificado: ${copyPath}`);
      console.log(`Conservados: ${before.alumnos} alumnos, ${before.sesiones} sesiones`);
    } catch (error) {
      writer.exec("ROLLBACK");
      throw error;
    }
  }
} catch (error) {
  console.error("ABORTADO, sin reinicializar la base: " +
    (error instanceof Error ? error.message : String(error)));
  console.error("Conserva dev.db y todos sus respaldos.");
  process.exitCode = 1;
} finally {
  writer?.close(); snapshot?.close(); source?.close();
}
