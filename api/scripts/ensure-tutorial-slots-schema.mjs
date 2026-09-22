import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

// Migración ADITIVA para sesiones ya existentes. NO ejecuta reset, seed
// ni prisma db push en el ordenador del docente.
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(apiRoot, "prisma", "dev.db");
if (!existsSync(file)) {
  console.error(`ABORTADO: no existe ${file}; no se creará una base nueva.`);
  process.exit(1);
}

function counts(db) {
  return Object.fromEntries(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
      .map(({ name }) => {
        const quoted = '"' + name.replaceAll('"', '""') + '"';
        return [name, Number(db.prepare(`SELECT COUNT(*) AS total FROM ${quoted}`).get().total)];
      }),
  );
}

function integrity(db, label) {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") {
    throw new Error(`${label}: error de integridad SQLite.`);
  }
}

let source;
let snapshot;
let writer;
try {
  source = new DatabaseSync(file, { readOnly: true });
  const names = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({ name }) => name));
  for (const name of ["alumnos", "sesiones", "grupos", "matriculas"]) {
    if (!names.has(name)) throw new Error(`La base carece de ${name}. No se modificará.`);
  }
  if (names.has("reservas_tutoria")) {
    const expected = ["id", "sesion_id", "bloque_inicio", "alumno_id", "observaciones", "created_at", "updated_at"];
    const columns = new Set(source.prepare("PRAGMA table_info(reservas_tutoria)").all().map(({ name }) => name));
    if (expected.some((name) => !columns.has(name))) {
      throw new Error("La tabla de reservas existente no tiene la estructura esperada. No se modificará.");
    }
    console.log("Bloques de tutoría: estructura existente comprobada; no se ha modificado SQLite.");
  } else {
    integrity(source, "Base original");
    const before = counts(source);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const copyPath = join(apiRoot, "prisma", `dev.pre-reservas-${stamp}-${randomUUID().slice(0, 8)}.db`);
    await backup(source, copyPath); // Consolida también datos aún pendientes en WAL.
    snapshot = new DatabaseSync(copyPath, { readOnly: true });
    integrity(snapshot, "Respaldo");
    if (JSON.stringify(counts(snapshot)) !== JSON.stringify(before)) {
      throw new Error("El respaldo no conserva los recuentos; se cancela la actualización.");
    }
    snapshot.close();
    snapshot = undefined;
    source.close();
    source = undefined;

    writer = new DatabaseSync(file, { timeout: 5000 });
    writer.exec("BEGIN IMMEDIATE");
    try {
      writer.exec(`
        CREATE TABLE "reservas_tutoria" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "sesion_id" INTEGER NOT NULL,
          "bloque_inicio" DATETIME NOT NULL,
          "alumno_id" INTEGER NOT NULL,
          "observaciones" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "reservas_tutoria_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "reservas_tutoria_alumno_id_fkey" FOREIGN KEY ("alumno_id") REFERENCES "alumnos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX "reservas_tutoria_sesion_id_bloque_inicio_key"
          ON "reservas_tutoria"("sesion_id","bloque_inicio");
        CREATE INDEX "reservas_tutoria_alumno_id_idx" ON "reservas_tutoria"("alumno_id");
      `);
      const after = counts(writer);
      for (const [table, count] of Object.entries(before)) {
        if (after[table] !== count) throw new Error(`Recuento inesperado en ${table}; se revierte.`);
      }
      if (after.reservas_tutoria !== 0) throw new Error("La nueva tabla de reservas no está vacía.");
      integrity(writer, "Base con reservas");
      writer.exec("COMMIT");
      console.log(`Reservas habilitadas sin modificar alumnos ni sesiones. Respaldo comprobado: ${copyPath}`);
    } catch (error) {
      writer.exec("ROLLBACK");
      throw error;
    }
  }
} catch (error) {
  console.error("ABORTADO: " + (error instanceof Error ? error.message : String(error)));
  console.error("No borres el archivo dev.db ni sus copias.");
  process.exitCode = 1;
} finally {
  writer?.close();
  snapshot?.close();
  source?.close();
}
