import { Router } from "express";
import { prisma } from "../lib/prisma";

export const enrollmentsRouter = Router();

enrollmentsRouter.post("/", async (req, res, next) => {
  try {
    const { alumnoId, asignaturaId } = req.body;
    if (!alumnoId || !asignaturaId) {
      res.status(400).json({ error: "alumnoId y asignaturaId son obligatorios" });
      return;
    }

    const enrollment = await prisma.matricula.upsert({
      where: {
        alumnoId_asignaturaId: {
          alumnoId: Number(alumnoId),
          asignaturaId: Number(asignaturaId),
        },
      },
      update: { activa: true, fechaBaja: null },
      create: { alumnoId: Number(alumnoId), asignaturaId: Number(asignaturaId) },
      include: { alumno: true, asignatura: true },
    });
    res.status(201).json(enrollment);
  } catch (error) {
    next(error);
  }
});

enrollmentsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de matrícula no válido" });
      return;
    }

    const enrollment = await prisma.matricula.update({
      where: { id },
      data: { activa: false, fechaBaja: new Date() },
    });
    res.json(enrollment);
  } catch (error) {
    next(error);
  }
});
