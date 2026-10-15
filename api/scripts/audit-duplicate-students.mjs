// Auditoría estrictamente de solo lectura de posibles alumnos duplicados.
// Ejecutar desde la raíz: node api/scripts/audit-duplicate-students.mjs
import { DatabaseSync } from "node:sqlite";
import { resolve, dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "prisma", "dev.db");
if (!existsSync(path)) {
  console.error("ABORTADO: no existe api/prisma/dev.db. No se ha creado ninguna base.");
  process.exit(1);
}

const normalize = (value) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
let db;
try {
  db = new DatabaseSync(path, { readOnly: true });
  const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check;
  if (integrity !== "ok") throw new Error("La base SQLite no supera la comprobación de integridad.");
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(x => x.name));
  if (!tables.has("alumnos")) throw new Error("Falta la tabla alumnos.");
  const rows = db.prepare("SELECT id, nombre, apellidos, email, identificador_externo FROM alumnos ORDER BY apellidos, nombre, id").all();
  const counters = [
    ["Matriculas", "matriculas"], ["Asistencias", "registros_sesion"],
    ["Entregas", "entregas"], ["Tutorias individuales", "tutorias_individuales"],
    ["Seguimientos", "seguimientos"], ["Incidencias", "incidencias"],
    ["Comunicaciones", "comunicaciones"], ["Hilos", "hilos_comunicacion"],
    ["Reservas", "reservas_bloques_tutoria"], ["Contactos personales", "contactos_personales"]
  ].filter(([, table]) => tables.has(table)).map(([label, table]) => ({
    label, stmt: db.prepare('SELECT COUNT(*) AS total FROM "' + table + '" WHERE alumno_id = ?')
  }));
  const indexes = new Map();
  for (const student of rows) {
    const keys = [];
    const name = normalize(student.nombre) + "|" + normalize(student.apellidos);
    if (normalize(student.nombre) && normalize(student.apellidos)) keys.push(["Nombre y apellidos", name]);
    if (normalize(student.email)) keys.push(["Correo", normalize(student.email)]);
    if (normalize(student.identificador_externo)) keys.push(["Identificador externo", normalize(student.identificador_externo)]);
    for (const [type, key] of keys) {
      const match = type + "|" + key;
      if (!indexes.has(match)) indexes.set(match, { type, members: [] });
      indexes.get(match).members.push(student);
    }
  }
  const groups = [...indexes.values()].filter(x => x.members.length > 1);
  console.log("DIAGNÓSTICO LOCAL SOLO LECTURA");
  console.log("Alumnos totales: " + rows.length);
  console.log("Grupos de coincidencias potenciales: " + groups.length);
  if (!groups.length) console.log("No hay coincidencias exactas tras normalizar nombres, correos o identificadores.");
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    console.log("\nCoincidencia " + (i + 1) + " (" + group.type + "), " + group.members.length + " fichas:");
    for (const student of group.members) {
      console.log("  Ficha ID " + student.id + " | " + student.nombre + " " + student.apellidos + " | correo: " + (student.email || "(sin correo)"));
      for (const item of counters) {
        const count = Number(item.stmt.get(student.id)?.total || 0);
        if (count) console.log("    " + item.label + ": " + count);
      }
    }
  }
  console.log("\nFIN. No se han realizado escrituras, eliminaciones ni fusiones.");
  console.log("Este diagnóstico detecta coincidencias; NO confirma identidad ni determina qué ficha conservar.");
} catch (error) {
  console.error("ABORTADO: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  db?.close();
}
