// Prueba de integración únicamente sobre SQLite EFÍMERA de GitHub Actions.
// Nunca ejecutar en la base del profesor.
import { DatabaseSync } from "node:sqlite";
import { spawn, execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(api, "..");
const file = join(api, "prisma", "dev.db");
const open = () => new DatabaseSync(file);
const studentCount = (db) => Number(db.prepare("SELECT COUNT(*) AS n FROM alumnos").get().n);
const sessionCount = (db) => Number(db.prepare("SELECT COUNT(*) AS n FROM sesiones").get().n);

const existing = open();
if (!existing.prepare("SELECT name FROM sqlite_master WHERE name='reservas_bloques_tutoria'").get())
  throw Error("No existe la tabla inicial que debe tener la base de prueba");
if (Number(existing.prepare("SELECT COUNT(*) AS n FROM reservas_bloques_tutoria").get().n) !== 0)
  throw Error("La tabla inicial no está vacía");
const beforeStudents = studentCount(existing);
const beforeSessions = sessionCount(existing);
existing.exec("DROP TABLE reservas_bloques_tutoria");
existing.close();

execFileSync("npm", ["run", "db:repair-tutorial-bookings", "-w", "api"], { cwd: root, stdio: "inherit" });
const check = open();
if (!check.prepare("SELECT name FROM sqlite_master WHERE name='reservas_bloques_tutoria'").get())
  throw Error("No se ha restaurado la tabla de reservas");
if (studentCount(check) !== beforeStudents || sessionCount(check) !== beforeSessions)
  throw Error("La migración ha alterado alumnos o sesiones");
const backups = readdirSync(join(api, "prisma")).filter(name =>
  name.startsWith("dev.pre-reservas-") && name.endsWith(".db"),
);
if (backups.length !== 1) throw Error("No hay exactamente una copia pre-reservas");
const snapshot = new DatabaseSync(join(api, "prisma", backups[0]), { readOnly: true });
if (studentCount(snapshot) !== beforeStudents || sessionCount(snapshot) !== beforeSessions)
  throw Error("La copia no conserva alumnos y sesiones");
if (snapshot.prepare("SELECT name FROM sqlite_master WHERE name='reservas_bloques_tutoria'").get())
  throw Error("La copia no es anterior a la reparación");
snapshot.close();
check.close();

const port = 39762;
const server = spawn(process.execPath, [join(api, "dist", "server.js")], {
  cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "pipe",
});
let errors = "";
server.stderr.on("data", (chunk) => { errors += String(chunk); });
const rootUrl = `http://localhost:${port}`;
async function request(route, options, expected = 200) {
  const response = await fetch(rootUrl + route, options);
  const body = await response.json().catch(() => ({}));
  if (response.status !== expected)
    throw Error(`${route}: se esperaba ${expected}; llegó ${response.status}: ${JSON.stringify(body)} ${errors}`);
  return body;
}
const json = (method, value) => ({
  method, headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { await request("/api/health"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  if (!ready) throw Error("API no disponible " + errors);

  const students = await request("/api/students");
  const subjects = await request("/api/subjects");
  const groups = await request("/api/groups");
  if (students.length !== beforeStudents || subjects.length !== 3 || groups.length !== 2)
    throw Error("El respaldo original de alumnos/asignaturas/grupos no está íntegro.");

  const subject = subjects[0];
  const dam = groups.find(group => group.nombre === "DAM");
  const daw = groups.find(group => group.nombre === "DAW");
  const damA = await request("/api/students", json("POST", {
    nombre: "A", apellidos: "DAM", grupoId: dam.id, asignaturaIds: [subject.id],
  }), 201);
  const damB = await request("/api/students", json("POST", {
    nombre: "B", apellidos: "DAM", grupoId: dam.id, asignaturaIds: [subject.id],
  }), 201);
  const dawStudent = await request("/api/students", json("POST", {
    nombre: "C", apellidos: "DAW", grupoId: daw.id, asignaturaIds: [subject.id],
  }), 201);

  async function sessionAt(end) {
    const session = await request("/api/sessions", json("POST", {
      asignaturaId: subject.id, tipo: "TUTORIA_GRUPAL", categoria: "TUTORIA_DUDAS",
      titulo: "Tutoria DAM prueba", inicio: "2026-11-16T16:00:00Z", fin: end,
    }), 201);
    // El endpoint genérico mantiene el campo histórico grupo_tutoria como
    // dato exclusivo del importador. Simulamos esa importación solo en CI.
    const db = open();
    db.prepare("UPDATE sesiones SET grupo_tutoria = 'DAM' WHERE id = ?").run(session.id);
    db.close();
    return session;
  }

  const session = await sessionAt("2026-11-16T16:45:00Z");
  const route = `/api/sessions/${session.id}/booking-slots`;
  const initial = await request(route);
  if (initial.slots.length !== 3 || initial.alumnosElegibles.some(item => item.id === dawStudent.id)
    || !initial.alumnosElegibles.some(item => item.id === damA.id))
    throw Error("Los bloques de 45 minutos o el filtro DAM no funcionan.");
  const assign = (block, alumnoId) => request(`${route}/${block}`, json("PUT", { alumnoId }));
  await assign(0, damA.id);
  await assign(1, damB.id);
  await request(`${route}/2`, json("PUT", { alumnoId: damA.id }), 409);
  await request(`${route}/2`, json("PUT", { alumnoId: dawStudent.id }), 400);
  await request(`${route}/3`, json("PUT", { alumnoId: damA.id }), 400);
  await request(`/api/sessions/${session.id}`, { method: "DELETE" }, 409);

  const wouldLoseReservedBlock = {
    asignaturaId: subject.id, unidadId: null, tipo: "TUTORIA_GRUPAL",
    categoria: "TUTORIA_DUDAS", inicio: "2026-11-16T16:00:00Z",
    fin: "2026-11-16T16:15:00Z", estado: "PROGRAMADA",
  };
  await request(`/api/sessions/${session.id}`, json("PUT", wouldLoseReservedBlock), 409);
  await assign(0, null);
  const result = await request(route);
  if (result.slots[0].reserva !== null || result.slots[1].reserva?.alumnoId !== damB.id)
    throw Error("Liberar un bloque ha modificado otra reserva.");
  const hour = await sessionAt("2026-11-16T17:00:00Z");
  const hourSlots = await request(`/api/sessions/${hour.id}/booking-slots`);
  if (hourSlots.slots.length !== 4) throw Error("60 minutos no generan cuatro bloques.");
  const finalDb = open();
  if (studentCount(finalDb) !== beforeStudents + 3 || sessionCount(finalDb) !== beforeSessions + 2)
    throw Error("Se ha perdido información previa durante las reservas.");
  finalDb.close();
  console.log("RESERVAS OK: copia íntegra, 45/60 min, grupos, alta, conflicto, liberar, horario y antiguos alumnos.");
} finally {
  server.kill();
}
