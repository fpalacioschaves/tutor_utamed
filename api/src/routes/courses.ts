import { Router } from "express";
import { prisma } from "../lib/prisma";

export const coursesRouter = Router();

function positiveInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

coursesRouter.get("/", async (_req, res, next) => {
  try {
    const courses = await prisma.cursoAcademico.findMany({
      orderBy: [{ activo: "desc" }, { fechaInicio: "desc" }],
      include: {
        _count: { select: { asignaturas: true, grupos: true } },
      },
    });
    res.json(courses);
  } catch (error) {
    next(error);
  }
});

coursesRouter.post("/", async (req, res, next) => {
  try {
    const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
    const fechaInicio = parseDate(req.body?.fechaInicio);
    const fechaFin = parseDate(req.body?.fechaFin);
    const activo = typeof req.body?.activo === "boolean" ? req.body.activo : true;

    if (!nombre || !fechaInicio || !fechaFin) {
      res.status(400).json({ error: "Nombre, fecha de inicio y fecha de fin son obligatorios" });
      return;
    }
    if (fechaFin <= fechaInicio) {
      res.status(400).json({ error: "La fecha de fin debe ser posterior a la fecha de inicio" });
      return;
    }

    const course = await prisma.$transaction(async (tx) => {
      if (activo) {
        await tx.cursoAcademico.updateMany({ data: { activo: false } });
      }
      return tx.cursoAcademico.create({
        data: { nombre, fechaInicio, fechaFin, activo },
        include: { _count: { select: { asignaturas: true, grupos: true } } },
      });
    });

    res.status(201).json(course);
  } catch (error) {
    next(error);
  }
});

coursesRouter.put("/:id", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Identificador de curso no válido" });
      return;
    }

    const existing = await prisma.cursoAcademico.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Curso académico no encontrado" });
      return;
    }

    const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
    const fechaInicio = parseDate(req.body?.fechaInicio);
    const fechaFin = parseDate(req.body?.fechaFin);
    const activo = typeof req.body?.activo === "boolean" ? req.body.activo : existing.activo;

    if (!nombre || !fechaInicio || !fechaFin) {
      res.status(400).json({ error: "Nombre, fecha de inicio y fecha de fin son obligatorios" });
      return;
    }
    if (fechaFin <= fechaInicio) {
      res.status(400).json({ error: "La fecha de fin debe ser posterior a la fecha de inicio" });
      return;
    }

    const course = await prisma.$transaction(async (tx) => {
      if (activo) {
        await tx.cursoAcademico.updateMany({ where: { NOT: { id } }, data: { activo: false } });
      }
      return tx.cursoAcademico.update({
        where: { id },
        data: { nombre, fechaInicio, fechaFin, activo },
        include: { _count: { select: { asignaturas: true, grupos: true } } },
      });
    });

    res.json(course);
  } catch (error) {
    next(error);
  }
});

coursesRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Identificador de curso no válido" });
      return;
    }

    const course = await prisma.cursoAcademico.findUnique({
      where: { id },
      include: { _count: { select: { asignaturas: true, grupos: true } } },
    });
    if (!course) {
      res.status(404).json({ error: "Curso académico no encontrado" });
      return;
    }
    if (course._count.asignaturas > 0 || course._count.grupos > 0) {
      res.status(409).json({ error: "No puedes eliminar un curso que contiene grupos o asignaturas. Puedes marcarlo como inactivo." });
      return;
    }

    await prisma.cursoAcademico.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
