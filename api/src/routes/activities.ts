import { Router } from "express";
import { prisma } from "../lib/prisma";

export const activitiesRouter = Router();

async function validateUnitForSubject(asignaturaId: number, unidadId: unknown) {
  if (unidadId === null || unidadId === undefined || unidadId === "") return null;
  const numericUnitId = Number(unidadId);
  if (!Number.isInteger(numericUnitId)) return undefined;
  const unit = await prisma.unidad.findFirst({
    where: { id: numericUnitId, asignaturaId },
    select: { id: true },
  });
  return unit ? numericUnitId : undefined;
}

const DELIVERY_STATES = new Set([
  "PENDIENTE",
  "ENTREGADA",
  "CORREGIDA",
  "NO_ENTREGADA",
  "RETRASADA",
]);

activitiesRouter.get("/", async (req, res, next) => {
  try {
    const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
    const activities = await prisma.actividad.findMany({
      where: {
        activa: true,
        ...(subjectId ? { asignaturaId: subjectId } : {}),
      },
      include: {
        asignatura: true,
        unidad: true,
        _count: { select: { entregas: true } },
      },
      orderBy: [
        { fechaLimite: "desc" },
        { createdAt: "desc" },
      ],
    });

    res.json(activities);
  } catch (error) {
    next(error);
  }
});

activitiesRouter.post("/", async (req, res, next) => {
  try {
    const { asignaturaId, unidadId, titulo, descripcion, fechaPublicacion, fechaLimite } = req.body;

    if (!asignaturaId || !titulo || !String(titulo).trim()) {
      res.status(400).json({ error: "asignaturaId y título son obligatorios" });
      return;
    }

    const numericSubjectId = Number(asignaturaId);
    const validatedUnitId = await validateUnitForSubject(numericSubjectId, unidadId);
    if (validatedUnitId === undefined) {
      res.status(400).json({ error: "La unidad seleccionada no pertenece a la asignatura" });
      return;
    }

    const activity = await prisma.actividad.create({
      data: {
        asignaturaId: numericSubjectId,
        unidadId: validatedUnitId,
        titulo: String(titulo).trim(),
        descripcion: descripcion ? String(descripcion).trim() : null,
        fechaPublicacion: fechaPublicacion ? new Date(fechaPublicacion) : null,
        fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
      },
      include: { asignatura: true, unidad: true },
    });

    res.status(201).json(activity);
  } catch (error) {
    next(error);
  }
});

activitiesRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de actividad no válido" });
      return;
    }

    const { asignaturaId, unidadId, titulo, descripcion, fechaPublicacion, fechaLimite } = req.body;
    if (!asignaturaId || !titulo || !String(titulo).trim()) {
      res.status(400).json({ error: "asignaturaId y título son obligatorios" });
      return;
    }

    const numericSubjectId = Number(asignaturaId);
    const validatedUnitId = await validateUnitForSubject(numericSubjectId, unidadId);
    if (validatedUnitId === undefined) {
      res.status(400).json({ error: "La unidad seleccionada no pertenece a la asignatura" });
      return;
    }

    const existing = await prisma.actividad.findUnique({
      where: { id },
      include: { _count: { select: { entregas: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: "Actividad no encontrada" });
      return;
    }

    if (existing._count.entregas > 0 && existing.asignaturaId !== numericSubjectId) {
      res.status(409).json({
        error: "No puedes cambiar la asignatura de una actividad que ya tiene registros de alumnos",
      });
      return;
    }

    const activity = await prisma.actividad.update({
      where: { id },
      data: {
        asignaturaId: numericSubjectId,
        unidadId: validatedUnitId,
        titulo: String(titulo).trim(),
        descripcion: descripcion ? String(descripcion).trim() : null,
        fechaPublicacion: fechaPublicacion ? new Date(fechaPublicacion) : null,
        fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
      },
      include: {
        asignatura: true,
        unidad: true,
        _count: { select: { entregas: true } },
      },
    });

    res.json(activity);
  } catch (error) {
    next(error);
  }
});

activitiesRouter.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de actividad no válido" });
      return;
    }

    const activity = await prisma.actividad.findUnique({
      where: { id },
      include: { asignatura: true, unidad: true },
    });
    if (!activity) {
      res.status(404).json({ error: "Actividad no encontrada" });
      return;
    }

    const [enrollments, deliveries] = await Promise.all([
      prisma.matricula.findMany({
        where: { asignaturaId: activity.asignaturaId, activa: true, alumno: { activo: true } },
        include: { alumno: true },
        orderBy: [{ alumno: { apellidos: "asc" } }, { alumno: { nombre: "asc" } }],
      }),
      prisma.entrega.findMany({
        where: { actividadId: id },
        include: { alumno: true },
      }),
    ]);

    const deliveriesByStudent = new Map(deliveries.map((delivery) => [delivery.alumnoId, delivery]));
    const studentsById = new Map(enrollments.map(({ alumno }) => [alumno.id, alumno]));
    for (const delivery of deliveries) studentsById.set(delivery.alumnoId, delivery.alumno);

    const alumnos = Array.from(studentsById.values())
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, "es"))
      .map((alumno) => ({
        ...alumno,
        entrega: deliveriesByStudent.get(alumno.id) ?? null,
      }));

    res.json({ ...activity, alumnos });
  } catch (error) {
    next(error);
  }
});

activitiesRouter.put("/:id/deliveries", async (req, res, next) => {
  try {
    const activityId = Number(req.params.id);
    if (!Number.isInteger(activityId)) {
      res.status(400).json({ error: "Identificador de actividad no válido" });
      return;
    }

    const activity = await prisma.actividad.findUnique({ where: { id: activityId } });
    if (!activity) {
      res.status(404).json({ error: "Actividad no encontrada" });
      return;
    }

    const deliveries = Array.isArray(req.body?.deliveries) ? req.body.deliveries : null;
    if (!deliveries) {
      res.status(400).json({ error: "Debes enviar un array deliveries" });
      return;
    }

    for (const delivery of deliveries) {
      if (!Number.isInteger(Number(delivery.alumnoId))) {
        res.status(400).json({ error: "Todos los registros necesitan alumnoId" });
        return;
      }
      if (!DELIVERY_STATES.has(delivery.estado)) {
        res.status(400).json({ error: `Estado de actividad no válido: ${delivery.estado}` });
        return;
      }
      if (delivery.calificacion !== null && delivery.calificacion !== undefined && delivery.calificacion !== "") {
        const grade = Number(delivery.calificacion);
        if (!Number.isFinite(grade) || grade < 0 || grade > 10) {
          res.status(400).json({ error: "Las calificaciones deben estar entre 0 y 10" });
          return;
        }
      }
    }

    const result = await prisma.$transaction(
      deliveries.map((delivery) => {
        const alumnoId = Number(delivery.alumnoId);
        const grade = delivery.calificacion === null || delivery.calificacion === undefined || delivery.calificacion === ""
          ? null
          : Number(delivery.calificacion);
        const date = delivery.fechaEntrega ? new Date(delivery.fechaEntrega) : null;
        const observation = typeof delivery.observacion === "string" ? delivery.observacion.trim() || null : null;
        const emptyPending = delivery.estado === "PENDIENTE" && !date && grade === null && !observation;

        if (emptyPending) {
          return prisma.entrega.deleteMany({
            where: { actividadId: activityId, alumnoId },
          });
        }

        return prisma.entrega.upsert({
          where: {
            actividadId_alumnoId: { actividadId: activityId, alumnoId },
          },
          update: {
            estado: delivery.estado,
            fechaEntrega: date,
            calificacion: grade,
            observacion: observation,
          },
          create: {
            actividadId: activityId,
            alumnoId,
            estado: delivery.estado,
            fechaEntrega: date,
            calificacion: grade,
            observacion: observation,
          },
        });
      }),
    );

    res.json({ saved: result.length });
  } catch (error) {
    next(error);
  }
});
