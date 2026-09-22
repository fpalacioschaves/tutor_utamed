import { Router } from "express";
import { prisma } from "../lib/prisma";

export const tutorialSlotsRouter = Router();
const FIFTEEN_MINUTES = 15 * 60 * 1000;

function positiveId(input: unknown) {
  const n = Number(input);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function getTutorial(id: number) {
  return prisma.sesion.findUnique({
    where: { id },
    include: { asignatura: { select: { cursoAcademicoId: true } } },
  });
}

function getTimes(session: { inicio: Date; fin: Date }) {
  const start = session.inicio.getTime();
  const duration = session.fin.getTime() - start;
  if (duration < FIFTEEN_MINUTES || duration % FIFTEEN_MINUTES !== 0 || duration > 12 * 60 * 60 * 1000) {
    return null;
  }
  return Array.from({ length: duration / FIFTEEN_MINUTES }, (_, index) => ({
    index,
    inicio: new Date(start + index * FIFTEEN_MINUTES),
    fin: new Date(start + (index + 1) * FIFTEEN_MINUTES),
  }));
}

function usable(session: { categoria: string; tipo: string; grupoTutoria: string | null }) {
  return session.categoria === "TUTORIA_DUDAS" && session.tipo === "TUTORIA_GRUPAL"
    && Boolean(session.grupoTutoria?.trim());
}

tutorialSlotsRouter.get("/:id/slots", async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Identificador de tutoría no válido." });
      return;
    }
    const session = await getTutorial(id);
    if (!session) {
      res.status(404).json({ error: "No existe la sesión." });
      return;
    }
    if (session.categoria !== "TUTORIA_DUDAS" || session.tipo !== "TUTORIA_GRUPAL") {
      res.status(400).json({ error: "Los bloques de 15 minutos solo corresponden a tutorías / dudas." });
      return;
    }
    const times = getTimes(session);
    const group = session.grupoTutoria?.trim() || null;
    const reason = !group
      ? "Esta tutoría no tiene grupo académico asignado. Asígnalo desde Editar sesión."
      : !times
        ? "La duración de esta tutoría debe ser un múltiplo exacto de 15 minutos."
        : null;

    const [reservations, candidates] = await Promise.all([
      prisma.reservaTutoria.findMany({
        where: { sesionId: id },
        include: { alumno: { select: { id: true, nombre: true, apellidos: true, activo: true } } },
        orderBy: { bloqueInicio: "asc" },
      }),
      group ? prisma.alumno.findMany({
        where: {
          activo: true,
          grupo: {
            nombre: group,
            cursoAcademicoId: session.asignatura.cursoAcademicoId,
          },
          matriculas: { some: { asignaturaId: session.asignaturaId, activa: true } },
        },
        select: { id: true, nombre: true, apellidos: true },
        orderBy: [{ apellidos: "asc" }, { nombre: "asc" }],
      }) : Promise.resolve([]),
    ]);
    const byTime = new Map(reservations.map((row) => [row.bloqueInicio.getTime(), row]));
    res.json({
      sesionId: id,
      grupoTutoria: group,
      canReserve: !reason && session.estado !== "CANCELADA",
      reason: reason || (session.estado === "CANCELADA" ? "La sesión está cancelada. Las reservas se conservan en consulta." : null),
      candidates,
      blocks: (times ?? []).map((block) => ({
        index: block.index,
        inicio: block.inicio,
        fin: block.fin,
        reserva: byTime.get(block.inicio.getTime()) ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

tutorialSlotsRouter.put("/:id/slots/:index", async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    const index = Number(req.params.index);
    const alumnoId = positiveId(req.body?.alumnoId);
    if (!id || !Number.isSafeInteger(index) || index < 0 || !alumnoId) {
      res.status(400).json({ error: "Sesión, bloque o alumno no válido." });
      return;
    }
    const session = await getTutorial(id);
    if (!session) {
      res.status(404).json({ error: "No existe la sesión." });
      return;
    }
    const times = getTimes(session);
    if (!usable(session) || !times || !times[index]) {
      res.status(400).json({ error: "La sesión no tiene un grupo o bloques de 15 minutos válidos." });
      return;
    }
    if (session.estado === "CANCELADA") {
      res.status(409).json({ error: "La tutoría está cancelada; no se pueden cambiar sus reservas." });
      return;
    }
    const student = await prisma.alumno.findFirst({
      where: {
        id: alumnoId,
        activo: true,
        grupo: {
          nombre: session.grupoTutoria!,
          cursoAcademicoId: session.asignatura.cursoAcademicoId,
        },
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
    const observations = typeof req.body?.observaciones === "string"
      ? req.body.observaciones.trim().slice(0, 2000) || null
      : null;
    const reservation = await prisma.reservaTutoria.upsert({
      where: { sesionId_bloqueInicio: { sesionId: id, bloqueInicio: times[index].inicio } },
      create: { sesionId: id, bloqueInicio: times[index].inicio, alumnoId, observaciones: observations },
      update: { alumnoId, observaciones: observations },
      include: { alumno: { select: { id: true, nombre: true, apellidos: true, activo: true } } },
    });
    res.json(reservation);
  } catch (error) {
    next(error);
  }
});

tutorialSlotsRouter.delete("/:id/slots/:index", async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    const index = Number(req.params.index);
    if (!id || !Number.isSafeInteger(index) || index < 0) {
      res.status(400).json({ error: "Sesión o bloque no válido." });
      return;
    }
    const session = await getTutorial(id);
    if (!session) {
      res.status(404).json({ error: "No existe la sesión." });
      return;
    }
    const times = getTimes(session);
    if (!usable(session) || !times || !times[index]) {
      res.status(400).json({ error: "La tutoría no contiene ese bloque." });
      return;
    }
    if (session.estado === "CANCELADA") {
      res.status(409).json({ error: "La tutoría está cancelada; no se pueden cambiar sus reservas." });
      return;
    }
    await prisma.reservaTutoria.deleteMany({
      where: { sesionId: id, bloqueInicio: times[index].inicio },
    });
    res.json({ released: true });
  } catch (error) {
    next(error);
  }
});
