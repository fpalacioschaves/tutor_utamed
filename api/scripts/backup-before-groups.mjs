import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// npm workspace api/ es el directorio de trabajo de este comando.
// Esta copia solo se hace una vez y nunca sobrescribe la base anterior.
const original = resolve("prisma", "dev.db");
const backup = resolve("prisma", "dev.pre-grupos.db");
if (existsSync(original) && !existsSync(backup)) {
  copyFileSync(original, backup);
  console.log("Copia previa conservada en api/prisma/dev.pre-grupos.db");
}
