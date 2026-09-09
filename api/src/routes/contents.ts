import { Router } from "express";
import { prisma } from "../lib/prisma";

export const contentsRouter = Router();

type UnitState = "PENDIENTE" | "EN_CURSO" | "IMPARTIDA";

const UNIT_STATES = new Set<UnitState>(["PENDIENTE", "EN_CURSO", "IMPARTIDA"]);

function positiveInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function nullableText(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function optionalHours(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

contentsRouter.get("/", async (req, res, next) => {
  try {
    const subjectId = positiveInteger(req.query.subjectId);
    if (!subjectId) {
      res.status(400).json({ error: "subjectId es obligatorio y debe ser un entero positivo" });
      return;
    }

    const subject = await prisma.asignatura.findUnique({
      where: { id: subjectId },
      include: {
        temas: {
          orderBy: [{ orden: "asc" }, { titulo: "asc" }],
          include: {
            unidades: {
              orderBy: [{ orden: "asc" }, { titulo: "asc" }],
              include: { _count: { select: { sesiones: true, actividades: true } } },
            },
          },
        },
        unidades: {
          where: { temaId: null },
          orderBy: [{ orden: "asc" }, { titulo: "asc" }],
          include: { _count: { select: { sesiones: true, actividades: true } } },
        },
      },
    });

    if (!subject) {
      res.status(404).json({ error: "Asignatura no encontrada" });
      return;
    }

    res.json({
      asignatura: {
        id: subject.id,
        nombre: subject.nombre,
        grupo: subject.grupo,
        activa: subject.activa,
      },
      temas: subject.temas,
      unidadesSinTema: subject.unidades,
    });
  } catch (error) {
    next(error);
  }
});

contentsRouter.post("/topics", async (req, res, next) => {
  try {
    const asignaturaId = positiveInteger(req.body?.asignaturaId);
    const orden = positiveInteger(req.body?.orden);
    const titulo = nullableText(req.body?.titulo);

    if (!asignaturaId || !orden || !titulo) {
      res.status(400).json({ error: "asignaturaId, orden y título son obligatorios" });
      return;
    }

    const subject = await prisma.asignatura.findUnique({ where: { id: asignaturaId }, select: { id: true } });
    if (!subject) {
      res.status(404).json({ error: "Asignatura no encontrada" });
      return;
    }

    const duplicateOrder = await prisma.tema.findUnique({
      where: { asignaturaId_orden: { asignaturaId, orden } },
    });
    if (duplicateOrder) {
      res.status(409).json({ error: `Ya existe un tema con el orden ${orden}` });
      return;
    }

    const topic = await prisma.tema.create({
      data: {
        asignaturaId,
        orden,
        titulo,
        descripcion: nullableText(req.body?.descripcion),
        activo: typeof req.body?.activo === "boolean" ? req.body.activo : true,
      },
      include: { unidades: true },
    });

    res.status(201).json(topic);
  } catch (error) {
    next(error);
  }
});

contentsRouter.put("/topics/:id", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    const orden = positiveInteger(req.body?.orden);
    const titulo = nullableText(req.body?.titulo);

    if (!id || !orden || !titulo) {
      res.status(400).json({ error: "Identificador, orden y título son obligatorios" });
      return;
    }

    const existing = await prisma.tema.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Tema no encontrado" });
      return;
    }

    const duplicateOrder = await prisma.tema.findFirst({
      where: { asignaturaId: existing.asignaturaId, orden, NOT: { id } },
    });
    if (duplicateOrder) {
      res.status(409).json({ error: `Ya existe otro tema con el orden ${orden}` });
      return;
    }

    const topic = await prisma.tema.update({
      where: { id },
      data: {
        orden,
        titulo,
        descripcion: nullableText(req.body?.descripcion),
        activo: typeof req.body?.activo === "boolean" ? req.body.activo : existing.activo,
      },
      include: { unidades: { orderBy: [{ orden: "asc" }, { titulo: "asc" }] } },
    });

    res.json(topic);
  } catch (error) {
    next(error);
  }
});

contentsRouter.delete("/topics/:id", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Identificador de tema no válido" });
      return;
    }

    const topic = await prisma.tema.findUnique({
      where: { id },
      include: { _count: { select: { unidades: true } } },
    });
    if (!topic) {
      res.status(404).json({ error: "Tema no encontrado" });
      return;
    }
    if (topic._count.unidades > 0) {
      res.status(409).json({ error: "No puedes eliminar un tema que todavía contiene unidades" });
      return;
    }

    await prisma.tema.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

contentsRouter.post("/units", async (req, res, next) => {
  try {
    const temaId = positiveInteger(req.body?.temaId);
    const orden = positiveInteger(req.body?.orden);
    const titulo = nullableText(req.body?.titulo);
    const horasPrevistas = optionalHours(req.body?.horasPrevistas);
    const estado = String(req.body?.estado ?? "PENDIENTE") as UnitState;

    if (!temaId || !orden || !titulo) {
      res.status(400).json({ error: "temaId, orden y título son obligatorios" });
      return;
    }
    if (horasPrevistas === undefined) {
      res.status(400).json({ error: "Las horas previstas deben ser un número igual o mayor que 0" });
      return;
    }
    if (!UNIT_STATES.has(estado)) {
      res.status(400).json({ error: "Estado de unidad no válido" });
      return;
    }

    const topic = await prisma.tema.findUnique({ where: { id: temaId }, select: { asignaturaId: true } });
    if (!topic) {
      res.status(404).json({ error: "Tema no encontrado" });
      return;
    }

    const duplicateOrder = await prisma.unidad.findUnique({
      where: { asignaturaId_orden: { asignaturaId: topic.asignaturaId, orden } },
    });
    if (duplicateOrder) {
      res.status(409).json({ error: `Ya existe una unidad con el orden ${orden} en esta asignatura` });
      return;
    }

    const unit = await prisma.unidad.create({
      data: {
        asignaturaId: topic.asignaturaId,
        temaId,
        orden,
        titulo,
        descripcion: nullableText(req.body?.descripcion),
        estado,
        observaciones: nullableText(req.body?.observaciones),
        horasPrevistas,
        activa: typeof req.body?.activa === "boolean" ? req.body.activa : true,
      },
      include: {
        tema: true,
        _count: { select: { sesiones: true, actividades: true } },
      },
    });

    res.status(201).json(unit);
  } catch (error) {
    next(error);
  }
});

contentsRouter.put("/units/:id", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    const temaId = positiveInteger(req.body?.temaId);
    const orden = positiveInteger(req.body?.orden);
    const titulo = nullableText(req.body?.titulo);
    const horasPrevistas = optionalHours(req.body?.horasPrevistas);
    const estado = String(req.body?.estado ?? "PENDIENTE") as UnitState;

    if (!id || !temaId || !orden || !titulo) {
      res.status(400).json({ error: "Identificador, temaId, orden y título son obligatorios" });
      return;
    }
    if (horasPrevistas === undefined) {
      res.status(400).json({ error: "Las horas previstas deben ser un número igual o mayor que 0" });
      return;
    }
    if (!UNIT_STATES.has(estado)) {
      res.status(400).json({ error: "Estado de unidad no válido" });
      return;
    }

    const existing = await prisma.unidad.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Unidad no encontrada" });
      return;
    }

    const topic = await prisma.tema.findUnique({ where: { id: temaId }, select: { asignaturaId: true } });
    if (!topic || topic.asignaturaId !== existing.asignaturaId) {
      res.status(400).json({ error: "El tema seleccionado no pertenece a la asignatura de la unidad" });
      return;
    }

    const duplicateOrder = await prisma.unidad.findFirst({
      where: { asignaturaId: existing.asignaturaId, orden, NOT: { id } },
    });
    if (duplicateOrder) {
      res.status(409).json({ error: `Ya existe otra unidad con el orden ${orden} en esta asignatura` });
      return;
    }

    const unit = await prisma.unidad.update({
      where: { id },
      data: {
        temaId,
        orden,
        titulo,
        descripcion: nullableText(req.body?.descripcion),
        estado,
        observaciones: nullableText(req.body?.observaciones),
        horasPrevistas,
        activa: typeof req.body?.activa === "boolean" ? req.body.activa : existing.activa,
      },
      include: {
        tema: true,
        _count: { select: { sesiones: true, actividades: true } },
      },
    });

    res.json(unit);
  } catch (error) {
    next(error);
  }
});

contentsRouter.delete("/units/:id", async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Identificador de unidad no válido" });
      return;
    }

    const unit = await prisma.unidad.findUnique({
      where: { id },
      include: { _count: { select: { sesiones: true, actividades: true } } },
    });
    if (!unit) {
      res.status(404).json({ error: "Unidad no encontrada" });
      return;
    }
    if (unit._count.sesiones > 0 || unit._count.actividades > 0) {
      res.status(409).json({
        error: "No puedes eliminar una unidad vinculada a sesiones o actividades. Puedes marcarla como inactiva.",
      });
      return;
    }

    await prisma.unidad.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
