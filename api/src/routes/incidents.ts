import { Router } from "express";
import { prisma } from "../lib/prisma";

export const incidentsRouter = Router();

const STATES = new Set(["ABIERTA", "EN_SEGUIMIENTO", "RESUELTA"]);

function parseDate(value: unknown) {
  if (!value) return new Date();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function nullableDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

incidentsRouter.get("/", async (req, res, next) => {
  try {
    const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
    const incidents = await prisma.incidencia.findMany({
      where: studentId ? { alumnoId: studentId } : undefined,
      include: {
        alumno: true,
        asignatura: true,
        sesion: { include: { asignatura: true } },
        _count: { select: { seguimientos: true } },
      },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    });
    res.json(incidents);
  } catch (error) {
    next(error);
  }
});

incidentsRouter.post("/", async (req, res, next) => {
  try {
    const { alumnoId, asignaturaId, sesionId, fecha, titulo, descripcion, estado, resolucion, fechaResolucion } = req.body;
    if (!Number.isInteger(Number(alumnoId))) {
      res.status(400).json({ error: "Debes seleccionar un alumno" });
      return;
    }
    if (!titulo || !String(titulo).trim()) {
      res.status(400).json({ error: "El título es obligatorio" });
      return;
    }
    if (!descripcion || !String(descripcion).trim()) {
      res.status(400).json({ error: "La descripción es obligatoria" });
      return;
    }
    if (estado && !STATES.has(estado)) {
      res.status(400).json({ error: "Estado de incidencia no válido" });
      return;
    }

    const finalState = estado ?? "ABIERTA";
    const incident = await prisma.incidencia.create({
      data: {
        alumnoId: Number(alumnoId),
        asignaturaId: asignaturaId ? Number(asignaturaId) : null,
        sesionId: sesionId ? Number(sesionId) : null,
        fecha: parseDate(fecha),
        titulo: String(titulo).trim(),
        descripcion: String(descripcion).trim(),
        estado: finalState,
        resolucion: typeof resolucion === "string" ? resolucion.trim() || null : null,
        fechaResolucion: finalState === "RESUELTA" ? (nullableDate(fechaResolucion) ?? new Date()) : null,
      },
      include: {
        alumno: true,
        asignatura: true,
        sesion: { include: { asignatura: true } },
        _count: { select: { seguimientos: true } },
      },
    });
    res.status(201).json(incident);
  } catch (error) {
    next(error);
  }
});

incidentsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de incidencia no válido" });
      return;
    }

    const { alumnoId, asignaturaId, sesionId, fecha, titulo, descripcion, estado, resolucion, fechaResolucion } = req.body;
    if (!Number.isInteger(Number(alumnoId))) {
      res.status(400).json({ error: "Debes seleccionar un alumno" });
      return;
    }
    if (!titulo || !String(titulo).trim()) {
      res.status(400).json({ error: "El título es obligatorio" });
      return;
    }
    if (!descripcion || !String(descripcion).trim()) {
      res.status(400).json({ error: "La descripción es obligatoria" });
      return;
    }
    if (!STATES.has(estado)) {
      res.status(400).json({ error: "Estado de incidencia no válido" });
      return;
    }

    const incident = await prisma.incidencia.update({
      where: { id },
      data: {
        alumnoId: Number(alumnoId),
        asignaturaId: asignaturaId ? Number(asignaturaId) : null,
        sesionId: sesionId ? Number(sesionId) : null,
        fecha: parseDate(fecha),
        titulo: String(titulo).trim(),
        descripcion: String(descripcion).trim(),
        estado,
        resolucion: typeof resolucion === "string" ? resolucion.trim() || null : null,
        fechaResolucion: estado === "RESUELTA" ? (nullableDate(fechaResolucion) ?? new Date()) : null,
      },
      include: {
        alumno: true,
        asignatura: true,
        sesion: { include: { asignatura: true } },
        _count: { select: { seguimientos: true } },
      },
    });
    res.json(incident);
  } catch (error) {
    next(error);
  }
});

incidentsRouter.patch("/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { estado, resolucion } = req.body;
    if (!Number.isInteger(id) || !STATES.has(estado)) {
      res.status(400).json({ error: "Datos de incidencia no válidos" });
      return;
    }

    const incident = await prisma.incidencia.update({
      where: { id },
      data: {
        estado,
        resolucion: typeof resolucion === "string" ? resolucion.trim() || null : undefined,
        fechaResolucion: estado === "RESUELTA" ? new Date() : null,
      },
      include: {
        alumno: true,
        asignatura: true,
        sesion: { include: { asignatura: true } },
        _count: { select: { seguimientos: true } },
      },
    });
    res.json(incident);
  } catch (error) {
    next(error);
  }
});
