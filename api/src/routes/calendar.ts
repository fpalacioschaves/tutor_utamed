import { Router } from "express";
import { prisma } from "../lib/prisma";

export const calendarRouter = Router();

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

calendarRouter.get("/", async (req, res, next) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    if (!from || !to || to <= from) {
      res.status(400).json({ error: "Debes indicar un rango de fechas válido" });
      return;
    }

    const [sessions, tutorials] = await Promise.all([
      prisma.sesion.findMany({
        where: {
          inicio: { gte: from, lt: to },
        },
        include: {
          asignatura: { select: { id: true, nombre: true, grupo: true } },
          unidad: { select: { id: true, orden: true, titulo: true } },
        },
        orderBy: { inicio: "asc" },
      }),
      prisma.tutoriaIndividual.findMany({
        where: {
          inicio: { not: null, gte: from, lt: to },
        },
        include: {
          alumno: { select: { id: true, nombre: true, apellidos: true } },
          asignatura: { select: { id: true, nombre: true, grupo: true } },
        },
        orderBy: { inicio: "asc" },
      }),
    ]);

    const events = [
      ...sessions.map((session) => ({
        id: `session-${session.id}`,
        entityId: session.id,
        source: "SESSION" as const,
        type: session.tipo,
        title: session.titulo
          || (session.tipo === "TUTORIA_GRUPAL" ? `Tutoría grupal · ${session.asignatura.nombre}` : session.unidad?.titulo || session.asignatura.nombre),
        subtitle: [
          session.asignatura.nombre,
          session.asignatura.grupo || null,
          session.unidad ? `U${session.unidad.orden} · ${session.unidad.titulo}` : null,
        ].filter(Boolean).join(" · "),
        start: session.inicio.toISOString(),
        end: session.fin.toISOString(),
        status: session.estado,
        subject: session.asignatura,
        unit: session.unidad,
        student: null,
      })),
      ...tutorials.map((tutorial) => ({
        id: `tutorial-${tutorial.id}`,
        entityId: tutorial.id,
        source: "TUTORIAL" as const,
        type: "TUTORIA_INDIVIDUAL" as const,
        title: `${tutorial.alumno.nombre} ${tutorial.alumno.apellidos}`,
        subtitle: [
          "Tutoría individual",
          tutorial.asignatura?.nombre || "General",
          tutorial.motivo || null,
        ].filter(Boolean).join(" · "),
        start: tutorial.inicio!.toISOString(),
        end: tutorial.fin?.toISOString() ?? null,
        status: tutorial.estado,
        subject: tutorial.asignatura,
        unit: null,
        student: tutorial.alumno,
      })),
    ].sort((a, b) => a.start.localeCompare(b.start));

    res.json({ from: from.toISOString(), to: to.toISOString(), events });
  } catch (error) {
    next(error);
  }
});
