import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

// Reparación ESTRICTAMENTE aditiva del cambio grupo_id que introdujo el PR #22.
// No se invoca prisma db push, setup, seed ni se reemplaza ninguna base.
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = join(apiRoot, "prisma", "dev.db");

if (!existsSync(databasePath)) {
  console.error(`ABORTADO: falta la base SQLite: ${databasePath}`);
  process.exit(1);
}

function counts(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  return Object.fromEntries(tables.map(({ name }) => {
    const quoted = '"' + name.replaceAll('"', '""') + '"';
    return [name, Number(db.prepare(`SELECT COUNT(*) AS total FROM ${quoted}`).get().total)];
  }));
}

function verify(db, label) {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") {
    throw new Error(`${label}: PRAGMA integrity_check no es correcto`);
  }
}

let original;
let copy;
let writer;
try {
  original = new DatabaseSync(databasePath, { readOnly: true });
  const tables = new Set(original.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({ name }) => name));
  for (const name of ["alumnos", "grupos", "cursos_academicos", "asignaturas", "matriculas"]) {
    if (!tables.has(name)) throw new Error(`La base carece de ${name}; se rechaza reparar una base nueva/incompleta`);
  }
  const columns = new Set(original.prepare("PRAGMA table_info(alumnos)").all().map(({ name }) => name));
  if (columns.has("grupo_id")) {
    console.log(`Esquema de alumnos correcto: ${databasePath}`);
  } else {
    verify(original, "Base original");
    const before = counts(original);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(apiRoot, "prisma", `dev.pre-grupo-id-${stamp}-${randomUUID().slice(0, 8)}.db`);
    console.log(`Se ha detectado alumnos sin columna grupo_id. Alumnos existentes: ${before.alumnos}`);
    console.log("Haciendo una copia SQLite íntegra ANTES de reparar el esquema...");
    await backup(original, backupPath);
    copy = new DatabaseSync(backupPath, { readOnly: true });
    verify(copy, "Copia");
    const copied = counts(copy);
    if (JSON.stringify(before) !== JSON.stringify(copied)) {
      throw new Error("La copia no conserva todos los recuentos: no se modifica la base");
    }
    copy.close();
    copy = undefined;
    original.close();
    original = undefined;

    writer = new DatabaseSync(databasePath, { timeout: 5000 });
    writer.exec("BEGIN IMMEDIATE");
    try {
      // SQLite permite añadir FK opcional: todos los alumnos existentes
      // quedan intactos, con grupo_id NULL hasta que se les asigne grupo.
      writer.exec('ALTER TABLE "alumnos" ADD COLUMN "grupo_id" INTEGER REFERENCES "grupos"("id")');
      writer.exec('CREATE INDEX IF NOT EXISTS "alumnos_grupo_id_idx" ON "alumnos"("grupo_id")');
      const after = counts(writer);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        throw new Error("Los recuentos han cambiado: se revierte la reparación");
      }
      verify(writer, "Base reparada");
      writer.exec("COMMIT");
      console.log(`Esquema reparado sin eliminar alumnos. Copia verificada: ${backupPath}`);
    } catch (error) {
      writer.exec("ROLLBACK");
      throw error;
    }
  }
} catch (error) {
  console.error("No se ha podido validar o reparar el esquema: " + (error instanceof Error ? error.message : String(error)));
  console.error("NO borres dev.db ni las copias de seguridad.");
  process.exitCode = 1;
} finally {
  writer?.close();
  copy?.close();
  original?.close();
}
