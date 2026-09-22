import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, backup } from "node:sqlite";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = join(apiRoot, "prisma", "dev.db");
const backupRoot = join(apiRoot, "prisma");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(backupRoot, `dev.pre-update-${timestamp}.db`);

if (!existsSync(databasePath)) {
  console.error(`ABORTADO: no existe la base original: ${databasePath}`);
  console.error("NO se creará ninguna base nueva ni se actualizará el esquema.");
  process.exit(1);
}

let original;
let snapshot;
try {
  original = new DatabaseSync(databasePath, { readOnly: true });

  const integrity = original.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
    throw new Error("SQLite no supera PRAGMA integrity_check. No se actualizará.");
  }

  const required = ["alumnos", "grupos", "cursos_academicos", "matriculas"];
  const tables = new Set(
    original.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );
  for (const name of required) {
    if (!tables.has(name)) throw new Error(`Falta la tabla ${name}. No se actualizará la base.`);
  }
  const counts = Object.fromEntries(required.map((name) => [
    name, Number(original.prepare(`SELECT COUNT(*) AS total FROM "${name}"`).get().total),
  ]));

  mkdirSync(backupRoot, { recursive: true });
  // Backup online de SQLite: consolida también las transacciones WAL. Copiar
  // únicamente dev.db con fs.copyFile NO sirve como respaldo si existe -wal.
  await backup(original, backupPath);
  snapshot = new DatabaseSync(backupPath, { readOnly: true });
  for (const [name, count] of Object.entries(counts)) {
    const copied = Number(snapshot.prepare(`SELECT COUNT(*) AS total FROM "${name}"`).get().total);
    if (copied !== count) throw new Error(`Copia incorrecta: ${name}: ${count} -> ${copied}`);
  }
  const copyIntegrity = snapshot.prepare("PRAGMA integrity_check").get().integrity_check;
  if (copyIntegrity !== "ok") throw new Error("La copia no supera PRAGMA integrity_check.");
  console.log(`COPIA VERIFICADA: ${backupPath}`);
  console.log(`Recuentos originales: ${JSON.stringify(counts)}`);
  if (counts.alumnos === 0) {
    console.warn("ATENCIÓN: LA BASE QUE ESTÁS ACTUALIZANDO CONTIENE CERO ALUMNOS.");
    console.warn("Comprueba que es la instalación correcta antes de introducir nuevos datos.");
  }
} catch (error) {
  console.error("ABORTADO: NO se ha actualizado la base. " + (error instanceof Error ? error.message : String(error)));
  console.error("No borres la base actual ni las copias anteriores.");
  process.exitCode = 1;
} finally {
  snapshot?.close();
  original?.close();
}
