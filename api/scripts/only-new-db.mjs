import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "prisma", "dev.db");
if (existsSync(file)) {
  console.error(`ABORTADO: ya existe una base de datos en ${file}`);
  console.error("setup es EXCLUSIVAMENTE para una instalación nueva. No se sobrescribirá.");
  process.exit(1);
}
console.log("Instalación nueva confirmada: no hay base de datos previa en esta carpeta.");
