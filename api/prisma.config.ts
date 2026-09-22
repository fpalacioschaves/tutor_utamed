import { defineConfig } from "prisma/config";

// Prisma ORM v6: la URL SQLite está definida en prisma/schema.prisma
// como file:./dev.db, relativa al esquema => api/prisma/dev.db.
// No sobreescribir datasource.url desde aquí ni usar DATABASE_URL externo.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
