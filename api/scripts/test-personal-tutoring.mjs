// PRUEBA DESTRUCTIVA SOLO EN LA SQLite SINTÉTICA DEL RUNNER DE CI.
// Nunca ejecutar sobre la base de alumnos de la instalación del profesor.
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";

const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(api, "..");
const dbPath = join(api, "prisma", "dev.db");
const db = new DatabaseSync(dbPath);
const tableCount = name => Number(db.prepare('SELECT COUNT(*) AS n FROM "' + name + '"').get().n);
const original = { alumnos: tableCount("alumnos"), sesiones: tableCount("sesiones"),
  reservas: tableCount("reservas_bloques_tutoria"), tutorias: tableCount("tutorias_individuales") };
if (original.alumnos === 0) throw Error("La prueba requiere un alumno sintético de los pasos CI anteriores.");
if (tableCount("contactos_personales") !== 0) throw Error("La prueba requiere contactos personales vacíos.");
// Emular esquema antiguo con alumnos, sesiones y tutorías previamente creados.
db.exec('DROP TABLE "contactos_personales"');
db.exec('ALTER TABLE "alumnos" DROP COLUMN "tutorizado_personalmente"');
db.close();

execFileSync("npm", ["run", "db:repair-personal-tutoring", "-w", "api"], {
  cwd: root, stdio: "inherit",
});
const actual = new DatabaseSync(dbPath);
for (const [table, count] of Object.entries(original)) {
  const name = table === "reservas" ? "reservas_bloques_tutoria" :
    table === "tutorias" ? "tutorias_individuales" : table;
  if (tableCountOn(actual, name) !== count) throw Error("No se preservaron registros de " + name);
}
function tableCountOn(connection, table) {
  return Number(connection.prepare('SELECT COUNT(*) AS n FROM "' + table + '"').get().n);
}
if (!actual.prepare('PRAGMA table_info("alumnos")').all()
  .some(col => col.name === "tutorizado_personalmente"))
  throw Error("No se ha añadido marca personal");
if (tableCountOn(actual, "contactos_personales") !== 0) throw Error("La tabla nueva no está vacía");
if (actual.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
  throw Error("Integridad de SQLite no verificada");
const backups = readdirSync(join(api, "prisma")).filter(name => name.startsWith("dev.pre-personal-"));
if (!backups.length) throw Error("No hay copia de seguridad de la migración");
const safe = new DatabaseSync(join(api, "prisma", backups.at(-1)), { readOnly: true });
if (tableCountOn(safe, "alumnos") !== original.alumnos)
  throw Error("La copia no conserva los alumnos existentes");
safe.close();
const student = actual.prepare("SELECT id FROM alumnos ORDER BY id LIMIT 1").get().id;
actual.close();

// Comprobar API y que las tutorías de asignaturas no se contabilizan como C1–C5.
const require = createRequire(import.meta.url);
const { app } = require("../dist/app.js");
const { prisma } = require("../dist/lib/prisma.js");
const server = app.listen(0);
try {
  const origin = "http://127.0.0.1:" + server.address().port;
  const request = async (method, path, body) => {
    const response = await fetch(origin + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = response.status === 204 ? null : await response.json();
    return { status: response.status, value };
  };
  const address = "/api/personal-tutoring/students/" + student;
  let result = await request("GET", "/api/personal-tutoring");
  if (result.status !== 200 || result.value.totalAlumnos !== 0) throw Error("Sin marcados se esperan cero alumnos");
  result = await request("PUT", address + "/contacts/1", {
    fecha: "2026-09-23", medio: "Teléfono",
  });
  if (result.status !== 409) throw Error("No se debe registrar contacto de alumno no asignado");
  result = await request("PATCH", address, { tutorizadoPersonalmente: true });
  if (result.status !== 200) throw Error("No se pudo marcar alumno sintético");
  result = await request("PUT", address + "/contacts/1", { fecha: "2026-13-44", medio: "Teléfono" });
  if (result.status !== 400) throw Error("Aceptada fecha imposible");
  result = await request("PUT", address + "/contacts/6", { fecha: "2026-09-23", medio: "Teléfono" });
  if (result.status !== 400) throw Error("Aceptado un contacto fuera de C1-C5");
  result = await request("PUT", address + "/contacts/1", {
    fecha: "2026-09-23", medio: "Teléfono", observaciones: "Caso sintético",
  });
  if (result.status !== 200 || result.value.numero !== 1) throw Error("No se pudo guardar C1");
  result = await request("PUT", address + "/contacts/1", {
    fecha: "2026-09-24", medio: "Videollamada", observaciones: "Corrección sintética",
  });
  if (result.status !== 200) throw Error("No se pudo corregir C1");
  result = await request("GET", "/api/personal-tutoring");
  if (result.value.totalAlumnos !== 1 || result.value.periodos[0].realizados !== 1 ||
    result.value.periodos[0].pendientes !== 0 || result.value.periodos[1].pendientes !== 1)
    throw Error("Los recuentos de contactos no son independientes");
  const detail = await request("GET", "/api/students/" + student + "/detail");
  if (detail.status !== 200 || detail.value.contactosPersonales.length !== 1 ||
    !detail.value.cronologia.some(item => item.tipo === "CONTACTO_PERSONAL"))
    throw Error("El contacto no aparece separado en la ficha");
  result = await request("GET", "/api/dashboard/summary");
  if (result.status !== 200 || result.value.personalTutoring.totalAlumnos !== 1)
    throw Error("No aparece el seguimiento en el dashboard");
  result = await request("DELETE", address + "/contacts/1");
  if (result.status !== 204) throw Error("No se pudo corregir un registro");
  result = await request("GET", "/api/personal-tutoring");
  if (result.value.periodos[0].pendientes !== 1) throw Error("La eliminación no actualizó pendientes");
  console.log("SEGUIMIENTO PERSONAL OK: migración aditiva, API, cinco plazos y separación académica.");
} finally {
  await prisma.$disconnect();
  await new Promise(resolve => server.close(resolve));
}
