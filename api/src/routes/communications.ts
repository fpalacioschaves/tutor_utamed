import { Router } from "express";
import { prisma } from "../lib/prisma";

export const communicationsRouter = Router();

function parseDate(value: unknown) {
  if (!value) return new Date();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

communicationsRouter.get("/", async (req, res, next) => {
  try {
    const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
    const communications = await prisma.comunicacion.findMany({
      where: studentId ? { alumnoId: studentId } : undefined,
      include: { alumno: true, asignatura: true },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    });
    res.json(communications);
  } catch (error) {
    next(error);
  }
});

communicationsRouter.post("/", async (req, res, next) => {
  try {
    const { alumnoId, asignaturaId, fecha, canal, motivo, resumen } = req.body;
    if (!Number.isInteger(Number(alumnoId))) {
      res.status(400).json({ error: "Debes seleccionar un alumno" });
      return;
    }
    if (!canal || !String(canal).trim()) {
      res.status(400).json({ error: "El canal es obligatorio" });
      return;
    }

    const communication = await prisma.comunicacion.create({
      data: {
        alumnoId: Number(alumnoId),
        asignaturaId: asignaturaId ? Number(asignaturaId) : null,
        fecha: parseDate(fecha),
        canal: String(canal).trim(),
        motivo: typeof motivo === "string" ? motivo.trim() || null : null,
        resumen: typeof resumen === "string" ? resumen.trim() || null : null,
      },
      include: { alumno: true, asignatura: true },
    });
    res.status(201).json(communication);
  } catch (error) {
    next(error);
  }
});

communicationsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { alumnoId, asignaturaId, fecha, canal, motivo, resumen } = req.body;
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de comunicación no válido" });
      return;
    }
    if (!Number.isInteger(Number(alumnoId))) {
      res.status(400).json({ error: "Debes seleccionar un alumno" });
      return;
    }
    if (!canal || !String(canal).trim()) {
      res.status(400).json({ error: "El canal es obligatorio" });
      return;
    }

    const communication = await prisma.comunicacion.update({
      where: { id },
      data: {
        alumnoId: Number(alumnoId),
        asignaturaId: asignaturaId ? Number(asignaturaId) : null,
        fecha: parseDate(fecha),
        canal: String(canal).trim(),
        motivo: typeof motivo === "string" ? motivo.trim() || null : null,
        resumen: typeof resumen === "string" ? resumen.trim() || null : null,
      },
      include: { alumno: true, asignatura: true },
    });
    res.json(communication);
  } catch (error) {
    next(error);
  }
});
