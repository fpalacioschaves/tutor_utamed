// Prueba de regresión ejecutada ÚNICAMENTE sobre SQLite temporal de GitHub Actions.
// Nunca usarla contra los datos locales de la instalación del profesor.
import { DatabaseSync } from "node:sqlite";
import { spawn, execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(apiRoot, "..");
const file = join(apiRoot, "prisma", "dev.db");
const db = new DatabaseSync(file);
const read = (handle) => Number(handle.prepare("SELECT COUNT(*) AS total FROM alumnos").get().total);

if (read(db) !== 1) throw Error("La base temporal debe contener exactamente un alumno inicial.");
const originalId = Number(db.prepare("SELECT id FROM alumnos").get().id);
// Construye el esquema LEGADO en una base de prueba efímera. SQLite no
// permite DROP COLUMN sobre una columna que participa en una FOREIGN KEY.
db.exec(`
  PRAGMA foreign_keys=OFF;
  BEGIN IMMEDIATE;
  CREATE TABLE "alumnos_legacy" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "email" TEXT,
    "identificador_externo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT 1,
    "notas_generales" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
  );
  INSERT INTO "alumnos_legacy" (
    id,nombre,apellidos,email,identificador_externo,activo,notas_generales,created_at,updated_at
  ) SELECT
    id,nombre,apellidos,email,identificador_externo,activo,notas_generales,created_at,updated_at
  FROM "alumnos";
  DROP TABLE "alumnos";
  ALTER TABLE "alumnos_legacy" RENAME TO "alumnos";
  CREATE UNIQUE INDEX "alumnos_email_key" ON "alumnos"("email");
  CREATE INDEX "alumnos_apellidos_nombre_idx" ON "alumnos"("apellidos","nombre");
  COMMIT;
  PRAGMA foreign_keys=ON;
`);
if (db.prepare("PRAGMA table_info(alumnos)").all().some(({ name }) => name === "grupo_id")) {
  throw Error("No se ha construido la base heredada.");
}
db.close();

execFileSync("npm", ["run", "db:repair-student-groups", "-w", "api"], { cwd: root, stdio: "inherit" });

const restored = new DatabaseSync(file, { readOnly: true });
if (!restored.prepare("PRAGMA table_info(alumnos)").all().some(({ name }) => name === "grupo_id")) {
  throw Error("La columna grupo_id sigue sin existir después de la reparación");
}
if (read(restored) !== 1 || Number(restored.prepare("SELECT id FROM alumnos").get().id) !== originalId) {
  throw Error("La reparación alteró el alumno existente");
}
const copies = readdirSync(join(apiRoot, "prisma")).filter(name => name.startsWith("dev.pre-grupo-id-") && name.endsWith(".db"));
if (copies.length !== 1) throw Error("La reparación no ha generado exactamente un respaldo nuevo");
const copy = new DatabaseSync(join(apiRoot, "prisma", copies[0]), { readOnly: true });
if (read(copy) !== 1) throw Error("La copia no conserva al alumno anterior");
if (copy.prepare("PRAGMA table_info(alumnos)").all().some(({ name }) => name === "grupo_id")) {
  throw Error("La copia no representa el estado anterior a la reparación");
}
copy.close();
restored.close();

// El esquema legado simulado no contiene las columnas nuevas de seguimiento
// personal. Aplicar también su migración ADITIVA antes de probar la API actual.
execFileSync("npm", ["run", "db:repair-personal-tutoring", "-w", "api"], {
  cwd: root, stdio: "inherit",
});

const port = 39761;
const server = spawn(process.execPath, [join(apiRoot, "dist", "server.js")], {
  cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "pipe",
});
let output = "";
server.stderr.on("data", (chunk) => { output += String(chunk); });
const url = `http://localhost:${port}`;
async function request(path, options) {
  const response = await fetch(url + path, options);
  const body = await response.json();
  if (!response.ok) throw Error(`${path}: HTTP ${response.status} ${JSON.stringify(body)} ${output}`);
  return body;
}
try {
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    try { await request("/api/health"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  if (!ready) throw Error("La API de prueba no ha arrancado: " + output);
  const beforeStudents = await request("/api/students");
  const subjects = await request("/api/subjects");
  const groups = await request("/api/groups");
  if (beforeStudents.length !== 1 || subjects.length !== 3 || groups.length !== 2) {
    throw Error(`Listados no disponibles: alumnos=${beforeStudents.length}, asignaturas=${subjects.length}, grupos=${groups.length}`);
  }
  const group = groups.find(item => item.nombre === "DAM");
  const created = await request("/api/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Comprobación", apellidos: "DAM",
      grupoId: group.id, asignaturaIds: [subjects[0].id],
    }),
  });
  if (created.grupoId !== group.id || created.matriculas.length !== 1) {
    throw Error("Alta y matrícula de alumno DAM incorrectas");
  }
  const afterStudents = await request("/api/students");
  if (afterStudents.length !== 2) throw Error("El alumno preexistente no aparece tras crear otro");
  console.log("REGRESIÓN SUPERADA: alumno anterior conservado, copia íntegra, DAM/DAW y asignaturas visibles, alta y matrícula correctas.");
} finally {
  server.kill();
}
