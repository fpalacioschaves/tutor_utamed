import { Router } from "express";
import { prisma } from "../lib/prisma";

export const followUpsRouter = Router();

const STATES = new Set(["PENDIENTE", "REALIZADO", "CANCELADO"]);

function nullableDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function decorate<T extends { fechaObjetivo: Date; estado: string }>(row: T) {
  return {
    ...row,
    vencido: row.estado === "PENDIENTE" && row.fechaObjetivo.getTime() < Date.now(),
  };
}

followUpsRouter.get("/", async (req, res, next) => {
  try {
    const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
    const rows = await prisma.seguimiento.findMany({
      where: studentId ? { alumnoId: studentId } : undefined,
      include: {
        alumno: true,
        asignatura: true,
        tutoriaIndividual: true,
        sesion: { include: { asignatura: true } },
        actividad: true,
        incidencia: true,
      },
      orderBy: { fechaObjetivo: "asc" },
    });

    rows.sort((a, b) => {
      const rank = (estado: string) => estado === "PENDIENTE" ? 0 : estado === "REALIZADO" ? 1 : 2;
      const byStatus = rank(a.estado) - rank(b.estado);
      if (byStatus !== 0) return byStatus;
      return a.fechaObjetivo.getTime() - b.fechaObjetivo.getTime();
    });

    res.json(rows.map(decorate));
  } catch (error) {
    next(error);
  }
});

followUpsRouter.post("/", async (req, res, next) => {
  try {
    const { alumnoId, asignaturaId, sesionId, tutoriaIndividualId, actividadId, incidenciaId, descripcion, fechaObjetivo } = req.body;
    if (!Number.isInteger(Number(alumnoId)) || !descripcion || !String(descripcion).trim() || !fechaObjetivo) {
      res.status(400).json({ error: "Alumno, descripción y fecha objetivo son obligatorios" });
      return;
    }
    const target = nullableDate(fechaObjetivo);
    if (!target) {
      res.status(400).json({ error: "Fecha objetivo no válida" });
      return;
    }

    const row = await prisma.seguimiento.create({
      data: {
        alumnoId: Number(alumnoId),
        asignaturaId: asignaturaId ? Number(asignaturaId) : null,
        sesionId: sesionId ? Number(sesionId) : null,
        tutoriaIndividualId: tutoriaIndividualId ? Number(tutoriaIndividualId) : null,
        actividadId: actividadId ? Number(actividadId) : null,
        incidenciaId: incidenciaId ? Number(incidenciaId) : null,
        descripcion: String(descripcion).trim(),
        fechaObjetivo: target,
      },
      include: {
        alumno: true,
        asignatura: true,
        tutoriaIndividual: true,
        sesion: { include: { asignatura: true } },
        actividad: true,
        incidencia: true,
      },
    });
    res.status(201).json(decorate(row));
  } catch (error) {
    next(error);
  }
});

followUpsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de seguimiento no válido" });
      return;
    }
    const { alumnoId, asignaturaId, descripcion, fechaObjetivo, estado } = req.body;
    if (!Number.isInteger(Number(alumnoId)) || !descripcion || !String(descripcion).trim() || !fechaObjetivo) {
      res.status(400).json({ error: "Alumno, descripción y fecha objetivo son obligatorios" });
      return;
    }
    if (!STATES.has(estado)) {
      res.status(400).json({ error: "Estado de seguimiento no válido" });
      return;
    }
    const target = nullableDate(fechaObjetivo);
    if (!target) {
      res.status(400).json({ error: "Fecha objetivo no válida" });
      return;
    }

    const row = await prisma.seguimiento.update({
      where: { id },
      data: {
        alumnoId: Number(alumnoId),
        asignaturaId: asignaturaId ? Number(asignaturaId) : null,
        descripcion: String(descripcion).trim(),
        fechaObjetivo: target,
        estado,
        fechaCompletado: estado === "REALIZADO" ? new Date() : null,
      },
      include: {
        alumno: true,
        asignatura: true,
        tutoriaIndividual: true,
        sesion: { include: { asignatura: true } },
        actividad: true,
        incidencia: true,
      },
    });
    res.json(decorate(row));
  } catch (error) {
    next(error);
  }
});

followUpsRouter.patch("/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;
    if (!Number.isInteger(id) || !STATES.has(estado)) {
      res.status(400).json({ error: "Datos no válidos" });
      return;
    }
    const row = await prisma.seguimiento.update({
      where: { id },
      data: {
        estado,
        fechaCompletado: estado === "REALIZADO" ? new Date() : null,
      },
      include: {
        alumno: true,
        asignatura: true,
        tutoriaIndividual: true,
        sesion: { include: { asignatura: true } },
        actividad: true,
        incidencia: true,
      },
    });
    res.json(decorate(row));
  } catch (error) {
    next(error);
  }
});
