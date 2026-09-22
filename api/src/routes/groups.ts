import { Router } from "express";
import { prisma } from "../lib/prisma";

export const groupsRouter = Router();

function positiveInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

groupsRouter.get("/", async (req, res, next) => {
  try {
    const courseId = req.query.courseId ? positiveInteger(req.query.courseId) : null;
    const groups = await prisma.grupo.findMany({
      where: courseId ? { cursoAcademicoId: courseId } : undefined,
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      include: {
        cursoAcademico: true,
        _count: { select: { asignaturas: true, alumnos: true } },
      },
    });
    res.json(groups);
  } catch (error) {
    next(error);
  }
});

// Solo crea los dos grupos de primer curso en un curso YA existente.
// No crea una base nueva, ni alumnos, ni asignaturas; no modifica matrícula.
groupsRouter.post("/ensure-dam-daw", async (_req, res, next) => {
  try {
    const course = await prisma.cursoAcademico.findUnique({
      where: { nombre: "2026/2027" },
      select: { id: true },
    });
    if (!course) {
      res.status(409).json({
        error: "En esta base SQLite no existe el curso 2026/2027. No se ha creado ni modificado ningún grupo. Comprueba que la aplicación está usando tu base de datos original.",
      });
      return;
    }

    const groups = await prisma.$transaction(async (tx) => {
      const result = [];
      for (const nombre of ["DAM", "DAW"] as const) {
        const group = await tx.grupo.upsert({
          where: { cursoAcademicoId_nombre: { cursoAcademicoId: course.id, nombre } },
          create: { cursoAcademicoId: course.id, nombre, activo: true },
          update: {},
          include: { cursoAcademico: true },
        });
        result.push(group);
      }
      return result;
    });
    res.json({ groups });
  } catch (error) {
    next(error);
  }
});

groupsRouter.post("/", async (req, res, next) => {
  try {
    const cursoAcademicoId = positiveInteger(req.body?.cursoAcademicoId);
    const nombre = cleanText(req.body?.nombre);
    const descripcion = cleanText(req.body?.descripcion) || null;

    if (!cursoAcademicoId || !nombre) {
      res.status(400).json({ error: "cursoAcademicoId y nombre son obligatorios" });
      return;
    }

    const course = await prisma.cursoAcademico.findUnique({ where: { id: cursoAcademicoId } });
    if (!course) {
      res.status(404).json({ error: "Curso académico no encontrado" });
      return;
    }

    const duplicate = await prisma.grupo.findUnique({
      where: { cursoAcademicoId_nombre: { cursoAcademicoId, nombre } },
    });
    if (duplicate) {
      res.status(409).json({ error: "Ya existe un grupo con ese nombre en el curso académico" });
      return;
    }

    const group = await prisma.grupo.create({
      data: {
        cursoAcademicoId,
        nombre,
        descripcion,
        activo: typeof req.body?.activo === "boolean" ? req.body.activo : true,
      },
      include: { cursoAcademico: true, _count: { select: { asignaturas: true, alumnos: true } } },
    });

    res.status(201).json(group);
  } catch (error) {
    next(error);
  }
});

groupsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Identificador de grupo no válido" });
      return;
    }

    const existing = await prisma.grupo.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Grupo no encontrado" });
      return;
    }

    const nombre = cleanText(req.body?.nombre);
    const descripcion = cleanText(req.body?.descripcion) || null;
    if (!nombre) {
      res.status(400).json({ error: "El nombre del grupo es obligatorio" });
      return;
    }

    const duplicate = await prisma.grupo.findFirst({
      where: {
        cursoAcademicoId: existing.cursoAcademicoId,
        nombre,
        NOT: { id },
      },
    });
    if (duplicate) {
      res.status(409).json({ error: "Ya existe otro grupo con ese nombre en el curso académico" });
      return;
    }

    const group = await prisma.$transaction(async (tx) => {
      const updated = await tx.grupo.update({
        where: { id },
        data: {
          nombre,
          descripcion,
          activo: typeof req.body?.activo === "boolean" ? req.body.activo : existing.activo,
        },
      });

      // Se mantiene sincronizado el campo histórico Asignatura.grupo para
      // no romper pantallas ni datos creados antes del modelo Grupo.
      await tx.asignatura.updateMany({
        where: { grupoId: id },
        data: { grupo: nombre },
      });

      return tx.grupo.findUnique({
        where: { id },
        include: { cursoAcademico: true, _count: { select: { asignaturas: true, alumnos: true } } },
      });
    });

    res.json(group);
  } catch (error) {
    next(error);
  }
});

groupsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Identificador de grupo no válido" });
      return;
    }

    const group = await prisma.grupo.findUnique({
      where: { id },
      include: { _count: { select: { asignaturas: true, alumnos: true } } },
    });
    if (!group) {
      res.status(404).json({ error: "Grupo no encontrado" });
      return;
    }
    if (group._count.asignaturas > 0 || group._count.alumnos > 0) {
      res.status(409).json({ error: "No puedes eliminar un grupo con alumnos o asignaturas asociados. Puedes marcarlo como inactivo." });
      return;
    }

    await prisma.grupo.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
