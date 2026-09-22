import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "prisma", "dev.db");
if (!existsSync(file)) {
  console.error(`NO SE ARRANCA: falta la base SQLite: ${file}`);
  console.error("Se ha impedido generar una base vacía. Busca tu dev.db original.");
  process.exit(1);
}
