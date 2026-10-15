import { PrismaClient } from "@prisma/client";

// SQLite local es la única fuente de datos en cada equipo.
// Google Drive intercambia únicamente copias cifradas, nunca una base de datos en vivo.
export const prisma = new PrismaClient();
