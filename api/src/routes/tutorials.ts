import { Router } from "express";
import { prisma } from "../lib/prisma";

export const tutorialsRouter = Router();

const STATES = new Set(["SOLICITADA", "PROGRAMADA", "REALIZADA", "CANCELADA", "NO_PRESENTADO"]);

function nullableDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getTutorialDeletionImpact(tutorialId: number) {
  const followUps = await prisma.seguimiento.count({
    where: { tutoriaIndividualId: tutorialId },
  });

  return {
    followUps,
    hasLinkedData: followUps > 0,
  };
}

tutorialsRouter.get("/", async (req, res, next) => {
  try {
    const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
    const tutorials = await prisma.tutoriaIndividual.findMany({
      where: studentId ? { alumnoId: studentId } : undefined,
      include: {
        alumno: true,
        asignatura: true,
        _count: { select: { seguimientos: true } },
      },
      orderBy: [{ inicio: "desc" }, { fechaSolicitud: "desc" }],
    });
    res.json(tutorials);
  } catch (error) {
    next(error);
  }
});

tutorialsRouter.post("/", async (req, res, next) => {
  try {
    const { alumnoId, asignaturaId, fechaSolicitud, inicio, fin, estado, motivo, observaciones, acuerdos } = req.body;
    if (!Number.isInteger(Number(alumnoId))) {
      res.status(400).json({ error: "Debes seleccionar un alumno" });
      return;
    }
    if (estado && !STATES.has(estado)) {
      res.status(400).json({ error: "Estado de tutoría no válido" });
      return;
    }

    const tutorial = await prisma.tutoriaIndividual.create({
      data: {
        alumnoId: Number(alumnoId),
        asignaturaId: asignaturaId ? Number(asignaturaId) : null,
        fechaSolicitud: nullableDate(fechaSolicitud) ?? new Date(),
        inicio: nullableDate(inicio),
        fin: nullableDate(fin),
        estado: estado ?? "SOLICITADA",
        motivo: typeof motivo === "string" ? motivo.trim() || null : null,
        observaciones: typeof observaciones === "string" ? observaciones.trim() || null : null,
        acuerdos: typeof acuerdos === "string" ? acuerdos.trim() || null : null,
      },
      include: { alumno: true, asignatura: true, _count: { select: { seguimientos: true } } },
    });
    res.status(201).json(tutorial);
  } catch (error) {
    next(error);
  }
});

tutorialsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de tutoría no válido" });
      return;
    }
    const { alumnoId, asignaturaId, fechaSolicitud, inicio, fin, estado, motivo, observaciones, acuerdos } = req.body;
    if (!Number.isInteger(Number(alumnoId))) {
      res.status(400).json({ error: "Debes seleccionar un alumno" });
      return;
    }
    if (!STATES.has(estado)) {
      res.status(400).json({ error: "Estado de tutoría no válido" });
      return;
    }

    const tutorial = await prisma.tutoriaIndividual.update({
      where: { id },
      data: {
        alumnoId: Number(alumnoId),
        asignaturaId: asignaturaId ? Number(asignaturaId) : null,
        fechaSolicitud: nullableDate(fechaSolicitud) ?? new Date(),
        inicio: nullableDate(inicio),
        fin: nullableDate(fin),
        estado,
        motivo: typeof motivo === "string" ? motivo.trim() || null : null,
        observaciones: typeof observaciones === "string" ? observaciones.trim() || null : null,
        acuerdos: typeof acuerdos === "string" ? acuerdos.trim() || null : null,
      },
      include: { alumno: true, asignatura: true, _count: { select: { seguimientos: true } } },
    });
    res.json(tutorial);
  } catch (error) {
    next(error);
  }
});

tutorialsRouter.get("/:id/delete-impact", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de tutoría no válido" });
      return;
    }

    const existing = await prisma.tutoriaIndividual.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ error: "Tutoría no encontrada" });
      return;
    }

    res.json(await getTutorialDeletionImpact(id));
  } catch (error) {
    next(error);
  }
});

tutorialsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de tutoría no válido" });
      return;
    }

    const existing = await prisma.tutoriaIndividual.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ error: "Tutoría no encontrada" });
      return;
    }

    const impact = await getTutorialDeletionImpact(id);

    await prisma.$transaction([
      prisma.seguimiento.deleteMany({ where: { tutoriaIndividualId: id } }),
      prisma.tutoriaIndividual.delete({ where: { id } }),
    ]);

    res.json({ deleted: true, impact });
  } catch (error) {
    next(error);
  }
});
