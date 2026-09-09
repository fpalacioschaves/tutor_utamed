import { Router } from "express";
import { prisma } from "../lib/prisma";

export const subjectsRouter = Router();

subjectsRouter.get("/", async (req, res, next) => {
  try {
    const courseId = req.query.courseId ? Number(req.query.courseId) : undefined;
    const subjects = await prisma.asignatura.findMany({
      where: courseId ? { cursoAcademicoId: courseId } : undefined,
      orderBy: [{ activa: "desc" }, { nombre: "asc" }],
      include: {
        cursoAcademico: true,
        _count: { select: { matriculas: { where: { activa: true, alumno: { activo: true } } }, sesiones: true, unidades: true, actividades: true } },
      },
    });
    res.json(subjects);
  } catch (error) {
    next(error);
  }
});

subjectsRouter.post("/", async (req, res, next) => {
  try {
    const { cursoAcademicoId, nombre, codigo, grupo } = req.body;
    if (!cursoAcademicoId || !nombre || !String(nombre).trim()) {
      res.status(400).json({ error: "cursoAcademicoId y nombre son obligatorios" });
      return;
    }

    const courseId = Number(cursoAcademicoId);
    const cleanName = String(nombre).trim();
    const cleanGroup = typeof grupo === "string" ? grupo.trim() : "";

    const duplicate = await prisma.asignatura.findFirst({
      where: { cursoAcademicoId: courseId, nombre: cleanName, grupo: cleanGroup },
    });
    if (duplicate) {
      res.status(409).json({ error: "Ya existe una asignatura con ese nombre y grupo en el curso" });
      return;
    }

    const subject = await prisma.asignatura.create({
      data: {
        cursoAcademicoId: courseId,
        nombre: cleanName,
        codigo: codigo ? String(codigo).trim() || null : null,
        grupo: cleanGroup,
      },
      include: {
        cursoAcademico: true,
        _count: { select: { matriculas: { where: { activa: true, alumno: { activo: true } } }, sesiones: true, unidades: true, actividades: true } },
      },
    });
    res.status(201).json(subject);
  } catch (error) {
    next(error);
  }
});

subjectsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de asignatura no válido" });
      return;
    }

    const existing = await prisma.asignatura.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Asignatura no encontrada" });
      return;
    }

    const { nombre, codigo, grupo, activa } = req.body;
    if (!nombre || !String(nombre).trim()) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }

    const cleanName = String(nombre).trim();
    const cleanGroup = typeof grupo === "string" ? grupo.trim() : "";

    const duplicate = await prisma.asignatura.findFirst({
      where: {
        cursoAcademicoId: existing.cursoAcademicoId,
        nombre: cleanName,
        grupo: cleanGroup,
        NOT: { id },
      },
    });
    if (duplicate) {
      res.status(409).json({ error: "Ya existe una asignatura con ese nombre y grupo en el curso" });
      return;
    }

    const subject = await prisma.asignatura.update({
      where: { id },
      data: {
        nombre: cleanName,
        codigo: codigo ? String(codigo).trim() || null : null,
        grupo: cleanGroup,
        activa: typeof activa === "boolean" ? activa : existing.activa,
      },
      include: {
        cursoAcademico: true,
        _count: { select: { matriculas: { where: { activa: true, alumno: { activo: true } } }, sesiones: true, unidades: true, actividades: true } },
      },
    });

    res.json(subject);
  } catch (error) {
    next(error);
  }
});

subjectsRouter.get("/:id/units", async (req, res, next) => {
  try {
    const subjectId = Number(req.params.id);
    if (!Number.isInteger(subjectId)) {
      res.status(400).json({ error: "Identificador de asignatura no válido" });
      return;
    }

    const subject = await prisma.asignatura.findUnique({ where: { id: subjectId } });
    if (!subject) {
      res.status(404).json({ error: "Asignatura no encontrada" });
      return;
    }

    const units = await prisma.unidad.findMany({
      where: { asignaturaId: subjectId },
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      include: { _count: { select: { sesiones: true, actividades: true } } },
    });

    res.json(units);
  } catch (error) {
    next(error);
  }
});

subjectsRouter.post("/:id/units", async (req, res, next) => {
  try {
    const subjectId = Number(req.params.id);
    if (!Number.isInteger(subjectId)) {
      res.status(400).json({ error: "Identificador de asignatura no válido" });
      return;
    }

    const subject = await prisma.asignatura.findUnique({ where: { id: subjectId } });
    if (!subject) {
      res.status(404).json({ error: "Asignatura no encontrada" });
      return;
    }

    const { orden, titulo, descripcion, activa = true } = req.body;
    const numericOrder = Number(orden);
    if (!Number.isInteger(numericOrder) || numericOrder < 1 || !titulo || !String(titulo).trim()) {
      res.status(400).json({ error: "El orden debe ser un entero mayor que 0 y el título es obligatorio" });
      return;
    }

    const duplicateOrder = await prisma.unidad.findUnique({
      where: { asignaturaId_orden: { asignaturaId: subjectId, orden: numericOrder } },
    });
    if (duplicateOrder) {
      res.status(409).json({ error: `Ya existe una unidad con el orden ${numericOrder}` });
      return;
    }

    const unit = await prisma.unidad.create({
      data: {
        asignaturaId: subjectId,
        orden: numericOrder,
        titulo: String(titulo).trim(),
        descripcion: descripcion ? String(descripcion).trim() || null : null,
        activa: Boolean(activa),
      },
      include: { _count: { select: { sesiones: true, actividades: true } } },
    });

    res.status(201).json(unit);
  } catch (error) {
    next(error);
  }
});

subjectsRouter.put("/:subjectId/units/:unitId", async (req, res, next) => {
  try {
    const subjectId = Number(req.params.subjectId);
    const unitId = Number(req.params.unitId);
    if (!Number.isInteger(subjectId) || !Number.isInteger(unitId)) {
      res.status(400).json({ error: "Identificador no válido" });
      return;
    }

    const existing = await prisma.unidad.findFirst({ where: { id: unitId, asignaturaId: subjectId } });
    if (!existing) {
      res.status(404).json({ error: "Unidad no encontrada" });
      return;
    }

    const { orden, titulo, descripcion, activa } = req.body;
    const numericOrder = Number(orden);
    if (!Number.isInteger(numericOrder) || numericOrder < 1 || !titulo || !String(titulo).trim()) {
      res.status(400).json({ error: "El orden debe ser un entero mayor que 0 y el título es obligatorio" });
      return;
    }

    const duplicateOrder = await prisma.unidad.findFirst({
      where: { asignaturaId: subjectId, orden: numericOrder, NOT: { id: unitId } },
    });
    if (duplicateOrder) {
      res.status(409).json({ error: `Ya existe otra unidad con el orden ${numericOrder}` });
      return;
    }

    const unit = await prisma.unidad.update({
      where: { id: unitId },
      data: {
        orden: numericOrder,
        titulo: String(titulo).trim(),
        descripcion: descripcion ? String(descripcion).trim() || null : null,
        activa: typeof activa === "boolean" ? activa : existing.activa,
      },
      include: { _count: { select: { sesiones: true, actividades: true } } },
    });

    res.json(unit);
  } catch (error) {
    next(error);
  }
});
