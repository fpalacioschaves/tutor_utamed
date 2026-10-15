// Crea una copia SQLite consistente para importar en Turso. No altera la base original.
// Desde la raiz: node api/scripts/prepare-turso-snapshot.mjs
import { DatabaseSync, backup } from "node:sqlite";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const repo=resolve(dirname(fileURLToPath(import.meta.url)),"..","..");
const origin=join(repo,"api","prisma","dev.db");
const folder=join(repo,"local-private","turso-migration");
const destination=join(folder,"tutor-utamed-migracion.db");
if(!existsSync(origin))throw new Error("ABORTADO: no se encuentra la base local.");
if(existsSync(destination))throw new Error("ABORTADO: ya existe la copia; no se sobrescribe: "+destination);
mkdirSync(folder,{recursive:true});
let source,snapshot;
try{
  source=new DatabaseSync(origin,{readOnly:true,fileMustExist:true});
  if(source.prepare("PRAGMA integrity_check").get()?.integrity_check!=="ok")throw new Error("La base original no supera integrity_check.");
  const tableNames=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  if(!tableNames.includes("alumnos")||!tableNames.includes("matriculas"))throw new Error("Faltan tablas esenciales.");
  const counts=new Map(tableNames.map(table=>[table,Number(source.prepare('SELECT COUNT(*) AS n FROM "'+table.replaceAll('"','""')+'"').get().n)]));
  if(counts.get("alumnos")!==30||counts.get("matriculas")!==90)throw new Error("Recuentos inesperados; se esperaba 30 alumnos y 90 matrículas. No se crea copia.");
  await backup(source,destination);
  snapshot=new DatabaseSync(destination,{fileMustExist:true});
  if(snapshot.prepare("PRAGMA integrity_check").get()?.integrity_check!=="ok")throw new Error("La copia no supera integridad.");
  for(const [table,count] of counts){
    const current=Number(snapshot.prepare('SELECT COUNT(*) AS n FROM "'+table.replaceAll('"','""')+'"').get().n);
    if(current!==count)throw new Error("Recuento distinto en la tabla "+table);
  }
  if(snapshot.prepare("PRAGMA foreign_key_check").all().length)throw new Error("La copia contiene relaciones inconsistentes.");
  // Turso recomienda WAL; alteramos solamente la copia, jamás el archivo original.
  snapshot.prepare("PRAGMA journal_mode=WAL").get();
  snapshot.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  console.log("COPIA VERIFICADA:",destination);
  console.log("Tablas:",tableNames.length);
  console.log("Alumnos:",counts.get("alumnos"));
  console.log("Matrículas:",counts.get("matriculas"));
  console.log("INFORMACIÓN PRIVADA: no compartas este archivo ni lo subas a GitHub.");
  console.log("No se han modificado los datos originales ni se ha importado nada a Turso.");
}catch(error){
  console.error("ABORTADO: "+(error instanceof Error?error.message:String(error)));
  process.exitCode=1;
}finally{snapshot?.close();source?.close();}
