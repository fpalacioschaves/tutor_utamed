// Prueba destructiva SOLO para una copia EFÍMERA en el runner de CI.
// No ejecutar con alumnos reales. Simula reservas antiguas sin notas.
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(api, "..");
const dir = join(api, "prisma");
const file = join(dir, "dev.db");
const db = new DatabaseSync(file);
const rows = () => db.prepare(
  "SELECT id,sesion_id,bloque,alumno_id FROM reservas_bloques_tutoria ORDER BY id",
).all();
const count = (name) => Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n);
const initial = rows();
if (initial.length !== 1) throw Error("Se esperaba una reserva previa en la prueba.");
const students = count("alumnos");
const sessions = count("sesiones");
for (const column of ["acuerdos", "observaciones", "motivo", "estado"]) {
  db.exec(`ALTER TABLE reservas_bloques_tutoria DROP COLUMN "${column}"`);
}
db.close();
execFileSync("npm", ["run", "db:repair-tutorial-bookings", "-w", "api"], {
  cwd: root, stdio: "inherit",
});
const actual = new DatabaseSync(file, { readOnly: true });
const columns = new Set(actual.prepare("PRAGMA table_info(reservas_bloques_tutoria)")
  .all().map((item) => item.name));
if (["estado", "motivo", "observaciones", "acuerdos"].some((name) => !columns.has(name)))
  throw Error("La migración no ha añadido toda la información nueva.");
if (Number(actual.prepare("SELECT COUNT(*) AS n FROM alumnos").get().n) !== students
  || Number(actual.prepare("SELECT COUNT(*) AS n FROM sesiones").get().n) !== sessions)
  throw Error("La migración ha alterado alumnos/sesiones existentes.");
const after = actual.prepare(
  "SELECT id,sesion_id,bloque,alumno_id FROM reservas_bloques_tutoria ORDER BY id",
).all();
if (JSON.stringify(after) !== JSON.stringify(initial))
  throw Error("La migración ha cambiado o borrado reservas antiguas.");
const copies = readdirSync(dir).filter(name => name.startsWith("dev.pre-reservas-") && name.endsWith(".db"));
if (copies.length !== 2) throw Error("No se ha generado un nuevo respaldo previo a la migración.");
const previous = new DatabaseSync(join(dir, copies[1]), { readOnly: true });
if (previous.prepare("PRAGMA table_info(reservas_bloques_tutoria)")
  .all().some((item) => item.name === "acuerdos"))
  throw Error("La copia de seguridad no contiene el esquema anterior.");
previous.close(); actual.close();
console.log("MIGRACIÓN DE TUTORÍAS OK: alumnos, sesiones y reservas preexistentes intactos.");
