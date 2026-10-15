// Contrasta las matrículas y campos académicos de las tres parejas de fichas.
// No cambia datos ni muestra nombres, correos ni observaciones privadas.
import { DatabaseSync } from "node:sqlite";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "prisma", "dev.db");
const pairs = [[31,34],[30,33],[32,35]];
let db;
try {
  db = new DatabaseSync(file, { readOnly: true, fileMustExist: true });
  const students = db.prepare("SELECT id, email, grupo_id, notas_generales, identificador_externo, tutorizado_personalmente FROM alumnos WHERE id = ?");
  const enrollments = db.prepare("SELECT m.asignatura_id AS id, a.nombre AS nombre, m.activa AS activa, m.fecha_baja AS fecha_baja FROM matriculas m LEFT JOIN asignaturas a ON a.id = m.asignatura_id WHERE m.alumno_id = ? ORDER BY m.asignatura_id");
  const linked = ["registros_sesion","entregas","tutorias_individuales","seguimientos","incidencias","comunicaciones","hilos_comunicacion","reservas_bloques_tutoria","contactos_personales"];
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name));
  const linkQueries = linked.filter(table => tables.has(table)).map(table=>({table,stmt:db.prepare('SELECT COUNT(*) AS n FROM "'+table+'" WHERE alumno_id = ?')}));
  for (const [discard, keep] of pairs) {
    const a=students.get(discard), b=students.get(keep);
    if (!a || !b) throw new Error("Falta una de las fichas " + discard + "/" + keep);
    const first=enrollments.all(discard), second=enrollments.all(keep);
    const ids1=first.map(x=>x.id),ids2=second.map(x=>x.id);
    const same=JSON.stringify(ids1)===JSON.stringify(ids2);
    console.log("\nPAREJA "+discard+" / "+keep);
    console.log("Conservar "+keep+": correo "+(b.email?"presente":"ausente")+"; descartar "+discard+": correo "+(a.email?"presente":"ausente"));
    console.log("Mismas asignaturas matriculadas: "+(same?"SÍ":"NO"));
    for(const m of first)console.log("  Ficha "+discard+" | asignatura "+m.id+" ("+(m.nombre||"sin nombre")+") | activa="+m.activa+" | baja="+(m.fecha_baja??"no"));
    for(const m of second)console.log("  Ficha "+keep+" | asignatura "+m.id+" ("+(m.nombre||"sin nombre")+") | activa="+m.activa+" | baja="+(m.fecha_baja??"no"));
    for (const key of ["grupo_id","notas_generales","identificador_externo","tutorizado_personalmente"]){
      const va=a[key],vb=b[key];
      console.log("Campo "+key+": "+(va===vb?"igual": "DISTINTO")+" | "+discard+"="+(va==null||va===""?"vacío":"con valor")+" | "+keep+"="+(vb==null||vb===""?"vacío":"con valor"));
    }
    for(const q of linkQueries){
      const ca=Number(q.stmt.get(discard).n),cb=Number(q.stmt.get(keep).n);
      if(ca||cb)console.log("Registros "+q.table+": "+discard+"="+ca+", "+keep+"="+cb);
    }
    if(!same)console.log("ATENCIÓN: no fusionar automáticamente; las asignaturas difieren.");
  }
  console.log("\nAuditoría terminada. No se ha escrito ni borrado nada.");
} catch(e) {
  console.error("ERROR: "+(e instanceof Error?e.message:String(e)));
  process.exitCode=1;
} finally {db?.close();}
