// Consolidación controlada de tres fichas de alumnos. Por defecto: SOLO SIMULACIÓN.
// Con --apply exige cierre de la app, comprobaciones, copia SQLite verificada y transacción.
// Ejecutar desde raíz: node api/scripts/consolidate-known-duplicates.mjs
// Para aplicar tras revisar: node api/scripts/consolidate-known-duplicates.mjs --apply
import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const filename=join(apiRoot,"prisma","dev.db");
const pairs=[[31,34],[30,33],[32,35]];
const apply=process.argv.includes("--apply");
if(process.argv.some(x=>x.startsWith("--")&&x!=="--apply"))throw new Error("Argumento desconocido.");
if(!existsSync(filename))throw new Error("No existe SQLite local. Se cancela.");
let db;
try{
  db=new DatabaseSync(filename,{readOnly:!apply,fileMustExist:true});
  if(db.prepare("PRAGMA integrity_check").get()?.integrity_check!=="ok")throw new Error("SQLite no supera integrity_check");
  const studentStmt=db.prepare("SELECT * FROM alumnos WHERE id=?");
  const enrollStmt=db.prepare("SELECT * FROM matriculas WHERE alumno_id=? ORDER BY asignatura_id");
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  const allReferences=[];
  for(const table of names){
    if(!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(table))continue;
    const fks=db.prepare('PRAGMA foreign_key_list("'+table+'")').all();
    if(fks.some(f=>f.table==="alumnos"))allReferences.push({table,columns:[...new Set(fks.filter(f=>f.table==="alumnos").map(f=>f.from))]});
  }
  // No operamos si existen referencias inesperadas: nunca se debe perder historia académica.
  for(const [drop,keep] of pairs){
    const a=studentStmt.get(drop),b=studentStmt.get(keep);
    if(!a||!b)throw new Error("Falta la pareja "+drop+"/"+keep);
    const name=x=>[x.nombre,x.apellidos].map(v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()).join("|");
    if(name(a)!==name(b)||!b.email||a.email)throw new Error("Identidad/correo no encaja para "+drop+"/"+keep);
    for(const field of Object.keys(a).filter(x=>!["id","email","created_at","updated_at"].includes(x))){
      if(a[field]!==b[field])throw new Error("Campo de alumno distinto: "+field+" en pareja "+drop+"/"+keep);
    }
    const first=enrollStmt.all(drop),second=enrollStmt.all(keep);
    if(first.length!==3||second.length!==3)throw new Error("Cantidad inesperada de matrículas "+drop+"/"+keep);
    for(let j=0;j<first.length;j++){
      const x=first[j],y=second[j];
      for(const field of ["asignatura_id","activa","fecha_baja"]){
        if(x[field]!==y[field])throw new Error("Matrículas diferentes: "+field+" en pareja "+drop+"/"+keep);
      }
    }
    for(const {table,columns} of allReferences){
      for(const column of columns){
        const count=Number(db.prepare('SELECT COUNT(*) AS n FROM "'+table+'" WHERE "'+column+'"=?').get(drop).n);
        if(table==="matriculas"&&column==="alumno_id"){if(count!==3)throw new Error("Matrículas inesperadas");continue;}
        if(count!==0)throw new Error("La ficha "+drop+" tiene "+count+" registros asociados en "+table+"."+column+". Cancelado.");
      }
    }
    console.log("Verificada "+drop+" -> "+keep+"; tres matrículas equivalentes; ninguna otra referencia.");
  }
  if(!apply){
    console.log("SIMULACIÓN: no se ha modificado nada. Para aplicar se necesita una ejecución explícita con --apply.");
  }else{
    // Antes de modificar, crear copia verificada por API de backup de SQLite: incluye WAL.
    const dir=join(apiRoot,"prisma");
    mkdirSync(dir,{recursive:true});
    const target=join(dir,"dev.before-consolidation-"+new Date().toISOString().replace(/[:.]/g,"-")+".db");
    await backup(db,target);
    const check=new DatabaseSync(target,{readOnly:true,fileMustExist:true});
    try{
      if(check.prepare("PRAGMA integrity_check").get()?.integrity_check!=="ok")throw new Error("La copia no supera integridad");
      const original=Number(db.prepare("SELECT COUNT(*) AS n FROM alumnos").get().n);
      const copied=Number(check.prepare("SELECT COUNT(*) AS n FROM alumnos").get().n);
      if(original!==copied)throw new Error("La copia no conserva el número de alumnos");
    }finally{check.close();}
    console.log("COPIA VERIFICADA: "+target);
    db.exec("BEGIN IMMEDIATE");
    try{
      for(const [drop] of pairs){
        db.prepare("DELETE FROM matriculas WHERE alumno_id=?").run(drop);
        const removed=db.prepare("DELETE FROM alumnos WHERE id=?").run(drop);
        if(Number(removed.changes)!==1)throw new Error("No se eliminó exactamente una ficha "+drop);
      }
      if(db.prepare("PRAGMA foreign_key_check").all().length)throw new Error("Claves foráneas inconsistentes");
      if(db.prepare("PRAGMA integrity_check").get()?.integrity_check!=="ok")throw new Error("Error de integridad final");
      db.exec("COMMIT");
      console.log("CONSOLIDACIÓN REALIZADA. Alumnos: "+db.prepare("SELECT COUNT(*) AS n FROM alumnos").get().n);
      console.log("Matrículas: "+db.prepare("SELECT COUNT(*) AS n FROM matriculas").get().n);
    }catch(e){db.exec("ROLLBACK");throw e;}
  }
}catch(error){
  console.error("ABORTADO: "+(error instanceof Error?error.message:String(error)));
  process.exitCode=1;
}finally{db?.close();}
