import { Router } from "express";
import { prisma } from "../lib/prisma";

export const subjectsRouter = Router();

function positiveInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function nullableText(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

async function resolveGroup(courseId: number, groupIdValue: unknown) {
  if (groupIdValue === null || groupIdValue === undefined || groupIdValue === "") {
    return { id: null as number | null, name: "" };
  }

  const groupId = positiveInteger(groupIdValue);
  if (!groupId) return null;

  const group = await prisma.grupo.findFirst({
    where: { id: groupId, cursoAcademicoId: courseId },
    select: { id: true, nombre: true },
  });
  return group ? { id: group.id, name: group.nombre } : null;
}

subjectsRouter.get("/", async (req, res, next) => {
  try {
    const courseId = req.query.courseId ? Number(req.query.courseId) : undefined;
    const subjects = await prisma.asignatura.findMany({
      where: courseId ? { cursoAcademicoId: courseId } : undefined,
      orderBy: [{ activa: "desc" }, { nombre: "asc" }],
      include: {
        cursoAcademico: true,
        grupoAsignado: true,
        _count: {
          select: {
            matriculas: { where: { activa: true, alumno: { activo: true } } },
            sesiones: true,
            unidades: true,
            actividades: true,
          },
        },
      },
    });
    res.json(subjects);
  } catch (error) {
    next(error);
  }
});

subjectsRouter.post("/", async (req, res, next) => {
  try {
    const courseId = positiveInteger(req.body?.cursoAcademicoId);
    const cleanName = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";

    if (!courseId || !cleanName) {
      res.status(400).json({ error: "Debes seleccionar un curso académico e indicar el nombre de la asignatura" });
      return;
    }

    const course = await prisma.cursoAcademico.findUnique({ where: { id: courseId } });
    if (!course) {
      res.status(404).json({ error: "Curso académico no encontrado" });
      return;
    }

    const resolvedGroup = await resolveGroup(courseId, req.body?.grupoId);
    if (!resolvedGroup) {
      res.status(400).json({ error: "El grupo seleccionado no pertenece al curso académico" });
      return;
    }

    const duplicate = await prisma.asignatura.findFirst({
      where: {
        cursoAcademicoId: courseId,
        nombre: cleanName,
        grupo: resolvedGroup.name,
      },
    });
    if (duplicate) {
      res.status(409).json({ error: "Ya existe esa asignatura en el mismo curso y grupo" });
      return;
    }

    const subject = await prisma.asignatura.create({
      data: {
        cursoAcademicoId: courseId,
        grupoId: resolvedGroup.id,
        grupo: resolvedGroup.name,
        nombre: cleanName,
        codigo: nullableText(req.body?.codigo),
        activa: typeof req.body?.activa === "boolean" ? req.body.activa : true,
      },
      include: {
        cursoAcademico: true,
        grupoAsignado: true,
        _count: {
          select: {
            matriculas: { where: { activa: true, alumno: { activo: true } } },
            sesiones: true,
            unidades: true,
            actividades: true,
          },
        },
      },
    });
    res.status(201).json(subject);
  } catch (error) {
    next(error);
  }
});

subjectsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Identificador de asignatura no válido" });
      return;
    }

    const existing = await prisma.asignatura.findUnique({
      where: { id },
      include: { _count: { select: { matriculas: true, sesiones: true, actividades: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: "Asignatura no encontrada" });
      return;
    }

    const courseId = positiveInteger(req.body?.cursoAcademicoId) ?? existing.cursoAcademicoId;
    const cleanName = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
    if (!cleanName) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }

    if (
      courseId !== existing.cursoAcademicoId &&
      (existing._count.matriculas > 0 || existing._count.sesiones > 0 || existing._count.actividades > 0)
    ) {
      res.status(409).json({ error: "No puedes cambiar de curso una asignatura que ya tiene alumnos, sesiones o actividades" });
      return;
    }

    const course = await prisma.cursoAcademico.findUnique({ where: { id: courseId } });
    if (!course) {
      res.status(404).json({ error: "Curso académico no encontrado" });
      return;
    }

    const resolvedGroup = await resolveGroup(courseId, req.body?.grupoId);
    if (!resolvedGroup) {
      res.status(400).json({ error: "El grupo seleccionado no pertenece al curso académico" });
      return;
    }

    const duplicate = await prisma.asignatura.findFirst({
      where: {
        cursoAcademicoId: courseId,
        nombre: cleanName,
        grupo: resolvedGroup.name,
        NOT: { id },
      },
    });
    if (duplicate) {
      res.status(409).json({ error: "Ya existe esa asignatura en el mismo curso y grupo" });
      return;
    }

    const subject = await prisma.asignatura.update({
      where: { id },
      data: {
        cursoAcademicoId: courseId,
        grupoId: resolvedGroup.id,
        grupo: resolvedGroup.name,
        nombre: cleanName,
        codigo: nullableText(req.body?.codigo),
        activa: typeof req.body?.activa === "boolean" ? req.body.activa : existing.activa,
      },
      include: {
        cursoAcademico: true,
        grupoAsignado: true,
        _count: {
          select: {
            matriculas: { where: { activa: true, alumno: { activo: true } } },
            sesiones: true,
            unidades: true,
            actividades: true,
          },
        },
      },
    });

    res.json(subject);
  } catch (error) {
    next(error);
  }
});

subjectsRouter.get("/:id/units", async (req, res, next) => {
  try {
    const subjectId = positiveInteger(req.params.id);
    if (!subjectId) {
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
    const subjectId = positiveInteger(req.params.id);
    const numericOrder = positiveInteger(req.body?.orden);
    const title = typeof req.body?.titulo === "string" ? req.body.titulo.trim() : "";

    if (!subjectId || !numericOrder || !title) {
      res.status(400).json({ error: "El orden debe ser un entero mayor que 0 y el título es obligatorio" });
      return;
    }

    const subject = await prisma.asignatura.findUnique({ where: { id: subjectId } });
    if (!subject) {
      res.status(404).json({ error: "Asignatura no encontrada" });
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
        titulo: title,
        descripcion: nullableText(req.body?.descripcion),
        activa: typeof req.body?.activa === "boolean" ? req.body.activa : true,
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
    const subjectId = positiveInteger(req.params.subjectId);
    const unitId = positiveInteger(req.params.unitId);
    const numericOrder = positiveInteger(req.body?.orden);
    const title = typeof req.body?.titulo === "string" ? req.body.titulo.trim() : "";

    if (!subjectId || !unitId || !numericOrder || !title) {
      res.status(400).json({ error: "Identificador, orden y título no válidos" });
      return;
    }

    const existing = await prisma.unidad.findFirst({ where: { id: unitId, asignaturaId: subjectId } });
    if (!existing) {
      res.status(404).json({ error: "Unidad no encontrada" });
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
        titulo: title,
        descripcion: nullableText(req.body?.descripcion),
        activa: typeof req.body?.activa === "boolean" ? req.body.activa : existing.activa,
      },
      include: { _count: { select: { sesiones: true, actividades: true } } },
    });

    res.json(unit);
  } catch (error) {
    next(error);
  }
});
