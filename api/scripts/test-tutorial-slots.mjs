// Prueba EXCLUSIVAMENTE para la base efímera creada por GitHub Actions.
import { DatabaseSync } from "node:sqlite";
import { spawn, execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dbPath = join(root, "api", "prisma", "dev.db");
const db = new DatabaseSync(dbPath);
const count = (handle, table) => Number(handle.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n);
if (count(db, "alumnos") !== 2 || count(db, "sesiones") !== 0) {
  throw Error("No se ha creado la base temporal esperada; prueba abortada.");
}
db.exec("DROP TABLE reservas_tutoria");
db.close();

execFileSync("npm", ["run", "db:prepare-tutorial-slots", "-w", "api"], { cwd: root, stdio: "inherit" });
const check = new DatabaseSync(dbPath, { readOnly: true });
if (count(check, "alumnos") !== 2 || count(check, "sesiones") !== 0 || count(check, "reservas_tutoria") !== 0) {
  throw Error("La migración aditiva ha modificado datos existentes.");
}
const copies = readdirSync(join(root, "api", "prisma"))
  .filter(name => name.startsWith("dev.pre-reservas-") && name.endsWith(".db"));
if (copies.length !== 1) throw Error("La migración no creó exactamente un respaldo nuevo.");
const copy = new DatabaseSync(join(root, "api", "prisma", copies[0]), { readOnly: true });
if (count(copy, "alumnos") !== 2 || count(copy, "sesiones") !== 0) throw Error("Respaldo incompleto.");
if (copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservas_tutoria'").get()) {
  throw Error("El respaldo no es previo a la migración.");
}
copy.close();
check.close();

const port = 39762;
const server = spawn(process.execPath, [join(root, "api", "dist", "server.js")], {
  cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "pipe",
});
let serverErrors = "";
server.stderr.on("data", data => { serverErrors += String(data); });
const base = `http://localhost:${port}`;
async function http(path, options) {
  const response = await fetch(base + path, options);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}
async function success(path, options) {
  const result = await http(path, options);
  if (result.status < 200 || result.status >= 300) {
    throw Error(`${path}: HTTP ${result.status} ${JSON.stringify(result.body)} ${serverErrors}`);
  }
  return result.body;
}
function put(path, obj) {
  return { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
function post(path, obj) {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { await success("/api/health"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  if (!ready) throw Error("API no ha arrancado: " + serverErrors);
  const subjects = await success("/api/subjects");
  const groups = await success("/api/groups");
  const students = await success("/api/students");
  const subject = subjects.find(row => row.nombre === "Programación");
  const dam = groups.find(row => row.nombre === "DAM");
  const daw = groups.find(row => row.nombre === "DAW");
  const student = students.find(row => row.grupoId === dam.id);
  if (!subject || !dam || !daw || !student) throw Error("No hay datos temporales de DAM/DAW.");

  const other = await success("/api/students", post("/api/students", {
    nombre: "Prueba", apellidos: "DAW", grupoId: daw.id, asignaturaIds: [subject.id],
  }));
  await success(`/api/students/${student.id}`, put(`/api/students/${student.id}`, {
    nombre: student.nombre, apellidos: student.apellidos, grupoId: dam.id, asignaturaIds: [subject.id],
  }));

  const session = await success("/api/sessions", post("/api/sessions", {
    asignaturaId: subject.id, tipo: "TUTORIA_GRUPAL", categoria: "TUTORIA_DUDAS",
    grupoTutoria: "DAM", inicio: "2026-09-28T15:00:00.000Z", fin: "2026-09-28T16:00:00.000Z",
  }));
  const slots = await success(`/api/sessions/${session.id}/slots`);
  if (slots.blocks.length !== 4 || slots.candidates.length !== 1 ||
      slots.candidates[0].id !== student.id || slots.blocks.some(row => row.reserva)) {
    throw Error("La sesión de 60 minutos no genera cuatro bloques libres filtrados por DAM.");
  }

  const invalidGroup = await http(`/api/sessions/${session.id}/slots/0`, put("", { alumnoId: other.id }));
  if (invalidGroup.status !== 400) throw Error("Se ha permitido reservar a alumno DAW en tutoría DAM.");
  const invalidBlock = await http(`/api/sessions/${session.id}/slots/4`, put("", { alumnoId: student.id }));
  if (invalidBlock.status !== 400) throw Error("Se ha permitido un bloque inexistente.");
  const booked = await success(`/api/sessions/${session.id}/slots/0`,
    put("", { alumnoId: student.id, observaciones: "Reserva trasladada de Google Calendar" }));
  if (booked.alumnoId !== student.id) throw Error("No se ha asignado alumno al bloque.");
  await success(`/api/sessions/${session.id}/slots/1`, put("", { alumnoId: student.id }));
  const bookedSlots = await success(`/api/sessions/${session.id}/slots`);
  if (bookedSlots.blocks.filter(row => row.reserva).length !== 2 ||
      bookedSlots.blocks[0].reserva.observaciones !== "Reserva trasladada de Google Calendar") {
    throw Error("No se han persistido dos reservas independientes.");
  }
  const deletionImpact = await success(`/api/sessions/${session.id}/delete-impact`);
  if (deletionImpact.reservations !== 2) throw Error("El impacto de borrado no cuenta reservas.");
  const blockedDelete = await http(`/api/sessions/${session.id}`, { method: "DELETE" });
  if (blockedDelete.status !== 409) throw Error("Se ha permitido borrar una sesión con reservas.");
  const blockedMove = await http(`/api/sessions/${session.id}`, put("", {
    asignaturaId: subject.id, tipo: "TUTORIA_GRUPAL", categoria: "TUTORIA_DUDAS",
    grupoTutoria: "DAM", inicio: "2026-09-28T15:15:00.000Z", fin: "2026-09-28T16:15:00.000Z",
  }));
  if (blockedMove.status !== 409) throw Error("Se ha permitido mover tutoría reservada.");
  await success(`/api/sessions/${session.id}/slots/0`, { method: "DELETE" });
  const remaining = await success(`/api/sessions/${session.id}/slots`);
  if (remaining.blocks[0].reserva || !remaining.blocks[1].reserva) throw Error("Liberar un bloque borró más reservas.");
  await success(`/api/sessions/${session.id}/slots/1`, { method: "DELETE" });

  const short = await success("/api/sessions", post("/api/sessions", {
    asignaturaId: subject.id, tipo: "TUTORIA_GRUPAL", categoria: "TUTORIA_DUDAS",
    grupoTutoria: "DAW", inicio: "2026-09-29T09:00:00.000Z", fin: "2026-09-29T09:45:00.000Z",
  }));
  const shortSlots = await success(`/api/sessions/${short.id}/slots`);
  if (shortSlots.blocks.length !== 3 || shortSlots.candidates.length !== 1 ||
      shortSlots.candidates[0].id !== other.id) throw Error("45 minutos no generan tres bloques de DAW.");

  const finalStudents = await success("/api/students");
  if (finalStudents.length !== 3 || !finalStudents.some(row => row.id === student.id)) {
    throw Error("Pruebas de reservas alteraron alumnos existentes.");
  }
  console.log("RESERVAS VERIFICADAS: respaldo previo, 45/60 min, grupo y matrícula, alta, liberación, protección de sesión y alumnado.");
} finally {
  server.kill();
}
