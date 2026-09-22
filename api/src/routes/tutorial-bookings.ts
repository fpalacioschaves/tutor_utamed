import { Router } from "express";
import { prisma } from "../lib/prisma";

export const tutorialBookingsRouter = Router();
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const BOOKING_STATES = new Set(["PROGRAMADA", "REALIZADA", "CANCELADA", "NO_PRESENTADO"]);

async function ensureBookingsAvailable() {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='reservas_bloques_tutoria'",
  );
  return rows.length > 0;
}

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

    if (!(await ensureBookingsAvailable())) {
      res.status(503).json({
        error: "La base abierta aún no tiene la tabla de reservas. Cierra Tutor UTAMED y arranca de nuevo con INICIAR_TUTOR_UTAMED.bat; no ejecutes setup ni reset.",
      });
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

    // Solo alumnado del grupo de la tutoría. No se muestra un listado
    // colectivo de asistencia ni el alumnado del otro ciclo.
    const eligibleStudents = group
      ? await prisma.alumno.findMany({
        where: { activo: true, grupoId: group.id },
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
            estado: reservation.estado,
            motivo: reservation.motivo,
            observaciones: reservation.observaciones,
            acuerdos: reservation.acuerdos,
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

    if (!(await ensureBookingsAvailable())) {
      res.status(503).json({
        error: "No se ha creado la tabla de reservas de esta instalación. Cierra y vuelve a arrancar Tutor UTAMED, sin ejecutar setup ni reset.",
      });
      return;
    }
    const current = await prisma.reservaBloqueTutoria.findUnique({
      where: { sesionId_bloque: { sesionId: sessionId, bloque } },
    });
    const input = req.body?.alumnoId;
    if (input === null) {
      if (current && (current.motivo || current.observaciones || current.acuerdos)
          && req.body?.confirmReplace !== true) {
        res.status(409).json({ error: "Este turno tiene notas o acuerdos. Confirma expresamente su eliminación antes de liberarlo." });
        return;
      }
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
      where: { id: alumnoId, activo: true, grupoId: group.id },
      select: { id: true },
    });
    if (!student) {
      res.status(400).json({
        error: "El alumno debe estar activo y pertenecer al grupo DAM/DAW de esta tutoría.",
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

    if (current && current.alumnoId !== alumnoId
        && (current.motivo || current.observaciones || current.acuerdos)
        && req.body?.confirmReplace !== true) {
      res.status(409).json({
        error: "El turno tiene notas o acuerdos del alumno anterior. Confirma expresamente su sustitución.",
      });
      return;
    }

    const reservation = await prisma.reservaBloqueTutoria.upsert({
      where: { sesionId_bloque: { sesionId: sessionId, bloque } },
      update: current?.alumnoId === alumnoId
        ? { alumnoId }
        : { alumnoId, estado: "PROGRAMADA", motivo: null, observaciones: null, acuerdos: null },
      create: { sesionId: sessionId, bloque, alumnoId },
      include: { alumno: { select: { id: true, nombre: true, apellidos: true, activo: true } } },
    });
    res.json({ bloque, reserva: {
      id: reservation.id, alumnoId, alumno: reservation.alumno,
      estado: reservation.estado, motivo: reservation.motivo,
      observaciones: reservation.observaciones, acuerdos: reservation.acuerdos,
    } });
  } catch (error) {
    next(error);
  }
});

tutorialBookingsRouter.patch("/:id/booking-slots/:block/notes", async (req, res, next) => {
  try {
    const sesionId = positiveInteger(req.params.id);
    const bloque = Number(req.params.block);
    if (!sesionId || !Number.isInteger(bloque) || bloque < 0) {
      res.status(400).json({ error: "Sesión o turno no válido." });
      return;
    }
    if (!(await ensureBookingsAvailable())) {
      res.status(503).json({ error: "La tabla de reservas todavía no está disponible en la base SQLite abierta." });
      return;
    }
    const session = await prisma.sesion.findUnique({ where: { id: sesionId } });
    if (!session || !isPersonalBookingSession(session)) {
      res.status(404).json({ error: "Tutoría no encontrada." });
      return;
    }
    const reservation = await prisma.reservaBloqueTutoria.findUnique({
      where: { sesionId_bloque: { sesionId, bloque } },
    });
    if (!reservation) {
      res.status(404).json({ error: "Este turno no está reservado para ningún alumno." });
      return;
    }
    const { estado, motivo, observaciones, acuerdos } = req.body ?? {};
    if (!BOOKING_STATES.has(estado)) {
      res.status(400).json({ error: "Estado de tutoría individual no válido." });
      return;
    }
    if ([motivo, observaciones, acuerdos].some((value) =>
      typeof value !== "string" || value.length > 20000)) {
      res.status(400).json({ error: "Los campos de tutoría deben ser texto de hasta 20.000 caracteres." });
      return;
    }
    const updated = await prisma.reservaBloqueTutoria.update({
      where: { id: reservation.id },
      data: {
        estado,
        motivo: motivo.trim() || null,
        observaciones: observaciones.trim() || null,
        acuerdos: acuerdos.trim() || null,
      },
      include: { alumno: { select: { id: true, nombre: true, apellidos: true, activo: true } } },
    });
    res.json({ bloque, reserva: {
      id: updated.id, alumnoId: updated.alumnoId, alumno: updated.alumno,
      estado: updated.estado, motivo: updated.motivo,
      observaciones: updated.observaciones, acuerdos: updated.acuerdos,
    } });
  } catch (error) { next(error); }
});
