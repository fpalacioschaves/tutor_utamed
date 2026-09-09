import { Router } from "express";
import { prisma } from "../lib/prisma";

export const coursesRouter = Router();

coursesRouter.get("/", async (_req, res, next) => {
  try {
    const courses = await prisma.cursoAcademico.findMany({
      orderBy: { fechaInicio: "desc" },
      include: { _count: { select: { asignaturas: true } } },
    });
    res.json(courses);
  } catch (error) {
    next(error);
  }
});

coursesRouter.post("/", async (req, res, next) => {
  try {
    const { nombre, fechaInicio, fechaFin, activo = true } = req.body;
    if (!nombre || !fechaInicio || !fechaFin) {
      res.status(400).json({ error: "nombre, fechaInicio y fechaFin son obligatorios" });
      return;
    }

    const course = await prisma.cursoAcademico.create({
      data: {
        nombre,
        fechaInicio: new Date(fechaInicio),
        fechaFin: new Date(fechaFin),
        activo,
      },
    });
    res.status(201).json(course);
  } catch (error) {
    next(error);
  }
});
