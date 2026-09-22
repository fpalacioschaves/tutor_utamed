import { defineConfig } from "prisma/config";

// La CLI y Prisma Client deben apuntar a LA MISMA base SQLite:
// api/prisma/dev.db. Nunca usar DATABASE_URL de otro proyecto.
// Esta URL es relativa a api/prisma.config.ts (no a schema.prisma).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: "file:./prisma/dev.db",
  },
});
