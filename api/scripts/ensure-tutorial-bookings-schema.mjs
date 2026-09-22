import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

// SOLO añade la tabla de reservas si falta. Nunca resetea el esquema, las
// sesiones ni los alumnos. El respaldo online consolida también SQLite WAL.
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = join(apiRoot, "prisma", "dev.db");
if (!existsSync(databasePath)) {
  console.error(`ABORTADO: no existe ${databasePath}`);
  process.exit(1);
}

function counts(db) {
  return Object.fromEntries(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all().map(({ name }) => [
        name,
        Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n),
      ]),
  );
}
function integrity(db) {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw new Error("PRAGMA integrity_check ha fallado");
}

let source;
let snapshot;
let writer;
try {
  source = new DatabaseSync(databasePath, { readOnly: true });
  const tables = new Set(
    source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name),
  );
  if (tables.has("reservas_bloques_tutoria")) {
    console.log("Esquema de reservas de tutorías disponible.");
  } else {
    for (const table of ["alumnos", "sesiones", "grupos", "asignaturas", "matriculas"]) {
      if (!tables.has(table)) throw new Error(`Falta ${table}; no se altera la base.`);
    }
    integrity(source);
    const before = counts(source);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const copyPath = join(apiRoot, "prisma", `dev.pre-reservas-${stamp}-${randomUUID().slice(0, 8)}.db`);
    await backup(source, copyPath);
    snapshot = new DatabaseSync(copyPath, { readOnly: true });
    integrity(snapshot);
    if (JSON.stringify(counts(snapshot)) !== JSON.stringify(before))
      throw new Error("La copia no conserva íntegros los registros originales.");
    snapshot.close(); snapshot = undefined;
    source.close(); source = undefined;

    writer = new DatabaseSync(databasePath, { timeout: 5000 });
    writer.exec("PRAGMA foreign_keys=ON");
    writer.exec("BEGIN IMMEDIATE");
    try {
      writer.exec(`
        CREATE TABLE "reservas_bloques_tutoria" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "sesion_id" INTEGER NOT NULL,
          "bloque" INTEGER NOT NULL,
          "alumno_id" INTEGER NOT NULL,
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
        CREATE INDEX "reservas_bloques_tutoria_alumno_id_idx"
          ON "reservas_bloques_tutoria" ("alumno_id");
      `);
      const after = counts(writer);
      for (const [table, count] of Object.entries(before)) {
        if (after[table] !== count) throw new Error(`Cambió el número de registros de ${table}`);
      }
      if (after.reservas_bloques_tutoria !== 0) throw new Error("La nueva tabla no está vacía.");
      integrity(writer);
      writer.exec("COMMIT");
      console.log(`Tabla de reservas añadida. Copia SQLite verificada: ${copyPath}`);
      console.log(`Alumnos y sesiones conservados: ${before.alumnos} / ${before.sesiones}`);
    } catch (error) {
      writer.exec("ROLLBACK");
      throw error;
    }
  }
} catch (error) {
  console.error("ABORTADO sin reinicializar datos: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  writer?.close(); snapshot?.close(); source?.close();
}
