import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

// Evolución aditiva del módulo Comunicaciones:
// - crea los hilos,
// - añade metadatos de interacción,
// - conserva y agrupa cada comunicación histórica existente en su propio hilo.
// Nunca ejecuta db push, reset ni seed al arrancar.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "prisma", "dev.db");

if (!existsSync(file)) {
  console.error("ABORTADO: no existe la base SQLite " + file);
  process.exit(1);
}

function tableCounts(db) {
  return Object.fromEntries(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map(({ name }) => [
        name,
        Number(db.prepare('SELECT COUNT(*) AS n FROM "' + String(name).replaceAll('"', '""') + '"').get().n),
      ]),
  );
}

function integrity(db) {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") {
    throw new Error("SQLite no supera PRAGMA integrity_check");
  }
}

let source;
let snapshot;
let writer;

try {
  source = new DatabaseSync(file, { readOnly: true });
  integrity(source);

  const tables = new Set(
    source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name),
  );

  for (const table of ["alumnos", "asignaturas", "comunicaciones"]) {
    if (!tables.has(table)) throw new Error("Falta la tabla " + table + "; no se altera la base.");
  }

  const threadTableExists = tables.has("hilos_comunicacion");
  const communicationColumns = new Set(
    source.prepare('PRAGMA table_info("comunicaciones")').all().map((row) => row.name),
  );
  const missingColumns = [
    ["hilo_id", '"hilo_id" INTEGER'],
    ["direccion", '"direccion" TEXT NOT NULL DEFAULT \'SALIENTE\''],
    ["observaciones", '"observaciones" TEXT'],
  ].filter(([name]) => !communicationColumns.has(name));

  const legacyCount = communicationColumns.has("hilo_id")
    ? Number(source.prepare('SELECT COUNT(*) AS n FROM "comunicaciones" WHERE "hilo_id" IS NULL').get().n)
    : Number(source.prepare('SELECT COUNT(*) AS n FROM "comunicaciones"').get().n);

  if (threadTableExists && missingColumns.length === 0 && legacyCount === 0) {
    console.log("Comunicaciones: esquema de hilos ya actualizado; no se ha modificado la base.");
  } else {
    const before = tableCounts(source);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(
      root,
      "prisma",
      "dev.pre-communications-" + stamp + "-" + randomUUID().slice(0, 8) + ".db",
    );

    await backup(source, backupPath);
    snapshot = new DatabaseSync(backupPath, { readOnly: true });
    integrity(snapshot);
    if (JSON.stringify(tableCounts(snapshot)) !== JSON.stringify(before)) {
      throw new Error("La copia de seguridad no conserva todos los registros originales.");
    }
    snapshot.close();
    snapshot = undefined;
    source.close();
    source = undefined;

    writer = new DatabaseSync(file, { timeout: 5000 });
    writer.exec("PRAGMA foreign_keys=ON");
    writer.exec("BEGIN IMMEDIATE");

    try {
      if (!threadTableExists) {
        writer.exec(`
          CREATE TABLE "hilos_comunicacion" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "alumno_id" INTEGER NOT NULL,
            "asignatura_id" INTEGER,
            "asunto" TEXT NOT NULL,
            "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" DATETIME NOT NULL,
            CONSTRAINT "hilos_comunicacion_alumno_id_fkey"
              FOREIGN KEY ("alumno_id") REFERENCES "alumnos" ("id")
              ON DELETE RESTRICT ON UPDATE CASCADE,
            CONSTRAINT "hilos_comunicacion_asignatura_id_fkey"
              FOREIGN KEY ("asignatura_id") REFERENCES "asignaturas" ("id")
              ON DELETE SET NULL ON UPDATE CASCADE
          );
        `);
      }

      const currentColumns = new Set(
        writer.prepare('PRAGMA table_info("comunicaciones")').all().map((row) => row.name),
      );
      for (const [name, definition] of missingColumns) {
        if (!currentColumns.has(name)) {
          writer.exec('ALTER TABLE "comunicaciones" ADD COLUMN ' + definition);
        }
      }

      writer.exec(`
        CREATE INDEX IF NOT EXISTS "hilos_comunicacion_alumno_id_created_at_idx"
          ON "hilos_comunicacion" ("alumno_id", "created_at");
        CREATE INDEX IF NOT EXISTS "hilos_comunicacion_asignatura_id_idx"
          ON "hilos_comunicacion" ("asignatura_id");
        CREATE INDEX IF NOT EXISTS "comunicaciones_hilo_id_fecha_idx"
          ON "comunicaciones" ("hilo_id", "fecha");
      `);

      const legacyRows = writer.prepare(`
        SELECT "id", "alumno_id", "asignatura_id", "fecha", "motivo"
        FROM "comunicaciones"
        WHERE "hilo_id" IS NULL
        ORDER BY "id"
      `).all();

      const insertThread = writer.prepare(`
        INSERT INTO "hilos_comunicacion"
          ("alumno_id", "asignatura_id", "asunto", "created_at", "updated_at")
        VALUES (?, ?, ?, ?, ?)
      `);
      const attachCommunication = writer.prepare(`
        UPDATE "comunicaciones"
        SET "hilo_id" = ?, "direccion" = COALESCE(NULLIF("direccion", ''), 'SALIENTE')
        WHERE "id" = ?
      `);

      for (const row of legacyRows) {
        const asunto = typeof row.motivo === "string" && row.motivo.trim()
          ? row.motivo.trim()
          : "Comunicación";
        const fecha = row.fecha || new Date().toISOString();
        const result = insertThread.run(row.alumno_id, row.asignatura_id, asunto, fecha, fecha);
        attachCommunication.run(result.lastInsertRowid, row.id);
      }

      const unattached = Number(
        writer.prepare('SELECT COUNT(*) AS n FROM "comunicaciones" WHERE "hilo_id" IS NULL').get().n,
      );
      if (unattached !== 0) {
        throw new Error("Quedan comunicaciones históricas sin hilo.");
      }

      const after = tableCounts(writer);
      for (const [table, amount] of Object.entries(before)) {
        if (after[table] !== amount) {
          throw new Error("Se ha modificado el recuento de " + table + ": " + amount + " -> " + after[table]);
        }
      }

      integrity(writer);
      writer.exec("COMMIT");
      console.log(
        "Comunicaciones preparadas con hilos sin perder registros. " +
        legacyRows.length + " comunicaciones históricas agrupadas. Copia: " + backupPath,
      );
    } catch (error) {
      writer.exec("ROLLBACK");
      throw error;
    }
  }
} catch (error) {
  console.error(
    "ABORTADO sin reinicializar datos: " + (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
} finally {
  writer?.close();
  snapshot?.close();
  source?.close();
}
