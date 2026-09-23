import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

// Solo ampliación del esquema local; nunca db push, reset o seed al arrancar.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "prisma", "dev.db");
if (!existsSync(file)) {
  console.error("ABORTADO: no existe la base SQLite " + file);
  process.exit(1);
}
const total = db => Object.fromEntries(db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
).all().map(row => [row.name, Number(db.prepare(
  'SELECT COUNT(*) AS n FROM "' + row.name.replaceAll('"', '""') + '"',
).get().n)]));
const integrity = db => {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw Error("Falló la comprobación de integridad SQLite");
};
let source, copy, writer;
try {
  source = new DatabaseSync(file, { readOnly: true });
  integrity(source);
  const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all().map(row => row.name));
  if (!tables.has("alumnos")) throw Error("No existe la tabla alumnos");
  const cols = new Set(source.prepare('PRAGMA table_info("alumnos")').all().map(row => row.name));
  const addFlag = !cols.has("tutorizado_personalmente");
  const addContacts = !tables.has("contactos_personales");
  if (!addFlag && !addContacts) {
    const required = ["alumno_id", "numero", "fecha", "medio", "observaciones", "acuerdos"];
    const present = new Set(source.prepare('PRAGMA table_info("contactos_personales")')
      .all().map(row => row.name));
    if (required.some(col => !present.has(col))) throw Error("La tabla contactos_personales tiene un esquema inesperado");
    console.log("Seguimiento personal: esquema ya actualizado; no se ha modificado la base.");
  } else {
    const before = total(source);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(root, "prisma", "dev.pre-personal-" + stamp + "-" + randomUUID().slice(0, 8) + ".db");
    await backup(source, path); // Backup online, también si hay WAL activo.
    copy = new DatabaseSync(path, { readOnly: true });
    integrity(copy);
    if (JSON.stringify(total(copy)) !== JSON.stringify(before)) throw Error("La copia no conserva todos los registros");
    copy.close(); copy = undefined;
    source.close(); source = undefined;
    writer = new DatabaseSync(file, { timeout: 5000 });
    writer.exec("PRAGMA foreign_keys=ON");
    writer.exec("BEGIN IMMEDIATE");
    try {
      if (addFlag) writer.exec(
        'ALTER TABLE "alumnos" ADD COLUMN "tutorizado_personalmente" BOOLEAN NOT NULL DEFAULT 0',
      );
      if (addContacts) writer.exec(`
        CREATE TABLE "contactos_personales" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "alumno_id" INTEGER NOT NULL,
          "numero" INTEGER NOT NULL CHECK ("numero" BETWEEN 1 AND 5),
          "fecha" DATETIME NOT NULL,
          "medio" TEXT NOT NULL,
          "observaciones" TEXT,
          "acuerdos" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL,
          FOREIGN KEY ("alumno_id") REFERENCES "alumnos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX "contactos_personales_alumno_numero_key"
          ON "contactos_personales" ("alumno_id", "numero");
        CREATE INDEX "contactos_personales_numero_fecha_idx"
          ON "contactos_personales" ("numero", "fecha");
      `);
      const after = total(writer);
      for (const [table, amount] of Object.entries(before)) {
        if (after[table] !== amount) throw Error("Recuento modificado en " + table);
      }
      if (addContacts && after.contactos_personales !== 0) throw Error("Tabla nueva no está vacía");
      integrity(writer);
      writer.exec("COMMIT");
      console.log("Seguimiento personal preparado sin perder alumnos, sesiones ni tutorías. Copia: " + path);
    } catch (error) {
      writer.exec("ROLLBACK");
      throw error;
    }
  }
} catch (error) {
  console.error("ABORTADO sin reinicializar datos: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  writer?.close(); copy?.close(); source?.close();
}
