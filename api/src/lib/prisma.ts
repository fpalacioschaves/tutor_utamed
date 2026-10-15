import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// La conexión local sigue siendo la predeterminada hasta verificar la migración.
// Solo se activa Turso cuando la variable explícita está configurada.
const remote = process.env.TUTOR_DATABASE_MODE === "turso";

if (remote && (!process.env.TURSO_DATABASE_URL?.startsWith("libsql://") || !process.env.TURSO_AUTH_TOKEN)) {
  throw new Error("Turso no está configurado. Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN.");
}

export const prisma = remote
  ? new PrismaClient({
      adapter: new PrismaLibSQL({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN!,
      }),
    })
  : new PrismaClient();
