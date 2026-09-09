import { Router } from "express";
import { prisma } from "../lib/prisma";

export const sessionsRouter = Router();

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

const ATTENDANCE_STATES = new Set([
  "PRESENTE",
  "AUSENTE",
  "RETRASO",
  "SALIDA_ANTICIPADA",
  "AUSENCIA_JUSTIFICADA",
]);

sessionsRouter.get("/", async (req, res, next) => {
  try {
    const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

    const sessions = await prisma.sesion.findMany({
      where: {
        ...(subjectId ? { asignaturaId: subjectId } : {}),
        ...(from || to
          ? {
              inicio: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { inicio: "asc" },
      include: {
        asignatura: true,
        unidad: true,
        _count: { select: { registros: true } },
      },
    });

    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post("/", async (req, res, next) => {
  try {
    const {
      asignaturaId,
      unidadId,
      tipo = "CLASE",
      titulo,
      inicio,
      fin,
      estado = "PROGRAMADA",
      observacionesGenerales,
    } = req.body;

    if (!asignaturaId || !inicio || !fin) {
      res.status(400).json({ error: "asignaturaId, inicio y fin son obligatorios" });
      return;
    }

    if (!new Set(["CLASE", "TUTORIA_GRUPAL"]).has(tipo)) {
      res.status(400).json({ error: "Tipo de sesión no válido" });
      return;
    }

    const start = new Date(inicio);
    const end = new Date(fin);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      res.status(400).json({ error: "Las fechas de inicio y fin no son válidas" });
      return;
    }

    const numericSubjectId = Number(asignaturaId);
    const validatedUnitId = await validateUnitForSubject(numericSubjectId, unidadId);
    if (validatedUnitId === undefined) {
      res.status(400).json({ error: "La unidad seleccionada no pertenece a la asignatura" });
      return;
    }

    const session = await prisma.sesion.create({
      data: {
        asignaturaId: numericSubjectId,
        unidadId: validatedUnitId,
        tipo,
        titulo: titulo || null,
        tema: null,
        inicio: start,
        fin: end,
        estado,
        origen: "MANUAL",
        observacionesGenerales: observacionesGenerales || null,
      },
      include: { asignatura: true, unidad: true },
    });

    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

sessionsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de sesión no válido" });
      return;
    }

    const {
      asignaturaId,
      unidadId,
      tipo,
      titulo,
      inicio,
      fin,
      estado,
      observacionesGenerales,
    } = req.body;

    if (!asignaturaId || !inicio || !fin) {
      res.status(400).json({ error: "asignaturaId, inicio y fin son obligatorios" });
      return;
    }

    if (!new Set(["CLASE", "TUTORIA_GRUPAL"]).has(tipo)) {
      res.status(400).json({ error: "Tipo de sesión no válido" });
      return;
    }

    if (estado && !new Set(["PROGRAMADA", "REALIZADA", "CANCELADA"]).has(estado)) {
      res.status(400).json({ error: "Estado de sesión no válido" });
      return;
    }

    const start = new Date(inicio);
    const end = new Date(fin);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      res.status(400).json({ error: "Las fechas de inicio y fin no son válidas" });
      return;
    }

    const numericSubjectId = Number(asignaturaId);
    const validatedUnitId = await validateUnitForSubject(numericSubjectId, unidadId);
    if (validatedUnitId === undefined) {
      res.status(400).json({ error: "La unidad seleccionada no pertenece a la asignatura" });
      return;
    }

    const existing = await prisma.sesion.findUnique({
      where: { id },
      include: { _count: { select: { registros: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: "Sesión no encontrada" });
      return;
    }

    if (existing._count.registros > 0 && existing.asignaturaId !== numericSubjectId) {
      res.status(409).json({
        error: "No puedes cambiar la asignatura de una sesión que ya tiene asistencia u observaciones registradas",
      });
      return;
    }

    const session = await prisma.sesion.update({
      where: { id },
      data: {
        asignaturaId: numericSubjectId,
        unidadId: validatedUnitId,
        tipo,
        titulo: titulo ? String(titulo).trim() : null,
        // El campo tema se conserva únicamente por compatibilidad con
        // sesiones antiguas. Ya no se edita como dato separado.
        tema: existing.tema,
        inicio: start,
        fin: end,
        estado: estado || existing.estado,
        observacionesGenerales: observacionesGenerales ? String(observacionesGenerales).trim() : null,
      },
      include: { asignatura: true, unidad: true, _count: { select: { registros: true } } },
    });

    res.json(session);
  } catch (error) {
    next(error);
  }
});

sessionsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de sesión no válido" });
      return;
    }

    const session = await prisma.sesion.findUnique({
      where: { id },
      include: { asignatura: true, unidad: true },
    });

    if (!session) {
      res.status(404).json({ error: "Sesión no encontrada" });
      return;
    }

    const [enrollments, records] = await Promise.all([
      prisma.matricula.findMany({
        where: {
          asignaturaId: session.asignaturaId,
          activa: true,
          alumno: { activo: true },
        },
        include: { alumno: true },
        orderBy: [{ alumno: { apellidos: "asc" } }, { alumno: { nombre: "asc" } }],
      }),
      prisma.registroSesion.findMany({
        where: { sesionId: id },
        include: { alumno: true },
      }),
    ]);

    const recordsByStudent = new Map(records.map((record) => [record.alumnoId, record]));
    const studentsById = new Map(enrollments.map(({ alumno }) => [alumno.id, alumno]));
    for (const record of records) studentsById.set(record.alumnoId, record.alumno);

    const alumnos = Array.from(studentsById.values())
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, "es"))
      .map((alumno) => ({
        ...alumno,
        registro: recordsByStudent.get(alumno.id) ?? null,
      }));

    res.json({ ...session, alumnos });
  } catch (error) {
    next(error);
  }
});

sessionsRouter.put("/:id/records", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId)) {
      res.status(400).json({ error: "Identificador de sesión no válido" });
      return;
    }

    const session = await prisma.sesion.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ error: "Sesión no encontrada" });
      return;
    }

    const records = Array.isArray(req.body?.records) ? req.body.records : null;
    if (!records) {
      res.status(400).json({ error: "Debes enviar un array records" });
      return;
    }

    for (const record of records) {
      if (!Number.isInteger(Number(record.alumnoId))) {
        res.status(400).json({ error: "Todos los registros necesitan alumnoId" });
        return;
      }
      if (record.estadoAsistencia && !ATTENDANCE_STATES.has(record.estadoAsistencia)) {
        res.status(400).json({ error: `Estado de asistencia no válido: ${record.estadoAsistencia}` });
        return;
      }
    }

    const result = await prisma.$transaction(
      records.map((record) => {
        const alumnoId = Number(record.alumnoId);
        const observation = typeof record.observacion === "string" ? record.observacion.trim() || null : null;
        const entry = record.horaEntrada ? new Date(record.horaEntrada) : null;
        const exit = record.horaSalida ? new Date(record.horaSalida) : null;
        const empty = !record.estadoAsistencia && !observation && !entry && !exit;

        if (empty) {
          return prisma.registroSesion.deleteMany({ where: { sesionId: sessionId, alumnoId } });
        }

        return prisma.registroSesion.upsert({
          where: { sesionId_alumnoId: { sesionId: sessionId, alumnoId } },
          update: {
            estadoAsistencia: record.estadoAsistencia || null,
            horaEntrada: entry,
            horaSalida: exit,
            observacion: observation,
          },
          create: {
            sesionId: sessionId,
            alumnoId,
            estadoAsistencia: record.estadoAsistencia || null,
            horaEntrada: entry,
            horaSalida: exit,
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
