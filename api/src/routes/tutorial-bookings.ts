import { Router } from "express";
import { prisma } from "../lib/prisma";

export const tutorialBookingsRouter = Router();
const FIFTEEN_MINUTES = 15 * 60 * 1000;

function positiveInteger(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sessionBlockCount(session: { inicio: Date; fin: Date }) {
  const duration = session.fin.getTime() - session.inicio.getTime();
  return duration > 0 && duration % FIFTEEN_MINUTES === 0
    ? duration / FIFTEEN_MINUTES
    : null;
}

function isPersonalBookingSession(session: { tipo: string; categoria: string; grupoTutoria: string | null }) {
  return session.tipo === "TUTORIA_GRUPAL"
    && session.categoria === "TUTORIA_DUDAS"
    && ["DAM", "DAW"].includes(session.grupoTutoria?.trim().toUpperCase() ?? "");
}

tutorialBookingsRouter.get("/:id/booking-slots", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) { res.status(400).json({ error: "Sesión no válida" }); return; }

    const session = await prisma.sesion.findUnique({
      where: { id },
      include: { asignatura: true },
    });
    if (!session) { res.status(404).json({ error: "Sesión no encontrada" }); return; }
    if (session.categoria !== "TUTORIA_DUDAS" || session.tipo !== "TUTORIA_GRUPAL") {
      res.status(400).json({ error: "Esta sesión no es una tutoría reservable" });
      return;
    }

    const total = sessionBlockCount(session);
    const reservations = await prisma.reservaBloqueTutoria.findMany({
      where: { sesionId: id },
      include: { alumno: { select: { id: true, nombre: true, apellidos: true, activo: true } } },
      orderBy: { bloque: "asc" },
    });
    const byIndex = new Map(reservations.map((reservation) => [reservation.bloque, reservation]));
    const groupName = session.grupoTutoria?.trim().toUpperCase() ?? "";
    const group = ["DAM", "DAW"].includes(groupName)
      ? await prisma.grupo.findFirst({
        where: { nombre: groupName, cursoAcademicoId: session.asignatura.cursoAcademicoId },
      })
      : null;

    const eligibleStudents = group
      ? await prisma.alumno.findMany({
        where: {
          activo: true,
          grupoId: group.id,
          matriculas: { some: { asignaturaId: session.asignaturaId, activa: true } },
        },
        select: { id: true, nombre: true, apellidos: true },
        orderBy: [{ apellidos: "asc" }, { nombre: "asc" }],
      })
      : [];

    const warning = total === null
      ? "El horario de esta tutoría no admite bloques completos de 15 minutos."
      : !group
        ? "Esta sesión no tiene un grupo DAM/DAW válido del curso académico de la asignatura."
        : null;

    const slots = Array.from({ length: total ?? 0 }, (_, bloque) => {
      const inicio = new Date(session.inicio.getTime() + bloque * FIFTEEN_MINUTES);
      const fin = new Date(inicio.getTime() + FIFTEEN_MINUTES);
      const reservation = byIndex.get(bloque);
      return {
        bloque,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
        reserva: reservation
          ? {
            id: reservation.id,
            alumnoId: reservation.alumnoId,
            alumno: reservation.alumno,
          }
          : null,
      };
    });

    res.json({
      sesionId: id,
      grupo: group?.nombre ?? session.grupoTutoria,
      asignatura: session.asignatura.nombre,
      estado: session.estado,
      slots,
      alumnosElegibles: eligibleStudents,
      warning,
    });
  } catch (error) {
    next(error);
  }
});

tutorialBookingsRouter.put("/:id/booking-slots/:block", async (req, res, next) => {
  try {
    const sessionId = positiveInteger(req.params.id);
    const bloque = Number(req.params.block);
    if (!sessionId || !Number.isInteger(bloque) || bloque < 0) {
      res.status(400).json({ error: "Sesión o bloque no válido" });
      return;
    }

    const session = await prisma.sesion.findUnique({
      where: { id: sessionId },
      include: { asignatura: true },
    });
    if (!session) { res.status(404).json({ error: "Sesión no encontrada" }); return; }
    if (!isPersonalBookingSession(session)) {
      res.status(409).json({ error: "Solo se pueden reservar tutorías/dudas con grupo DAM o DAW." });
      return;
    }
    const count = sessionBlockCount(session);
    if (count === null || bloque >= count) {
      res.status(400).json({ error: "El bloque no pertenece al horario de 15 minutos de esta tutoría." });
      return;
    }

    const input = req.body?.alumnoId;
    if (input === null) {
      await prisma.reservaBloqueTutoria.deleteMany({ where: { sesionId: sessionId, bloque } });
      res.json({ bloque, reserva: null });
      return;
    }
    if (session.estado === "CANCELADA") {
      res.status(409).json({ error: "No se pueden reservar bloques en una tutoría cancelada." });
      return;
    }

    const alumnoId = positiveInteger(input);
    if (!alumnoId) {
      res.status(400).json({ error: "Selecciona un alumno válido o elige Libre para eliminar la reserva." });
      return;
    }

    const group = await prisma.grupo.findFirst({
      where: {
        nombre: session.grupoTutoria!.trim().toUpperCase(),
        cursoAcademicoId: session.asignatura.cursoAcademicoId,
      },
    });
    if (!group) {
      res.status(409).json({ error: "El grupo de esta tutoría no existe en el curso académico de la asignatura." });
      return;
    }
    const student = await prisma.alumno.findFirst({
      where: {
        id: alumnoId, activo: true, grupoId: group.id,
        matriculas: { some: { asignaturaId: session.asignaturaId, activa: true } },
      },
      select: { id: true },
    });
    if (!student) {
      res.status(400).json({
        error: "El alumno debe estar activo, matriculado en esta asignatura y pertenecer al grupo DAM/DAW de la tutoría.",
      });
      return;
    }

    const alreadyAssigned = await prisma.reservaBloqueTutoria.findFirst({
      where: { sesionId: sessionId, alumnoId, NOT: { bloque } },
    });
    if (alreadyAssigned) {
      res.status(409).json({ error: "Este alumno ya tiene otro bloque reservado en la misma tutoría." });
      return;
    }

    const reservation = await prisma.reservaBloqueTutoria.upsert({
      where: { sesionId_bloque: { sesionId: sessionId, bloque } },
      update: { alumnoId },
      create: { sesionId: sessionId, bloque, alumnoId },
      include: { alumno: { select: { id: true, nombre: true, apellidos: true, activo: true } } },
    });
    res.json({ bloque, reserva: { id: reservation.id, alumnoId, alumno: reservation.alumno } });
  } catch (error) {
    next(error);
  }
});
