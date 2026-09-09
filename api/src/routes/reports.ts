import { Router } from "express";
import { prisma } from "../lib/prisma";

export const reportsRouter = Router();

const ATTENDANCE_STATES = [
  "PRESENTE",
  "AUSENTE",
  "RETRASO",
  "SALIDA_ANTICIPADA",
  "AUSENCIA_JUSTIFICADA",
] as const;

type AttendanceRow = { estadoAsistencia: (typeof ATTENDANCE_STATES)[number] | null };

function summarizeAttendance(rows: AttendanceRow[]) {
  const counts = Object.fromEntries(ATTENDANCE_STATES.map((state) => [state, 0])) as Record<(typeof ATTENDANCE_STATES)[number], number>;
  let registrados = 0;

  for (const row of rows) {
    if (!row.estadoAsistencia) continue;
    registrados += 1;
    counts[row.estadoAsistencia] += 1;
  }

  const porcentajes = Object.fromEntries(
    ATTENDANCE_STATES.map((state) => [
      state,
      registrados ? Math.round((counts[state] / registrados) * 1000) / 10 : null,
    ]),
  ) as Record<(typeof ATTENDANCE_STATES)[number], number | null>;

  return {
    registrados,
    ...counts,
    porcentajes,
  };
}

async function getSubject(subjectId: number) {
  return prisma.asignatura.findUnique({
    where: { id: subjectId },
    include: { cursoAcademico: true },
  });
}

reportsRouter.get("/attendance/:subjectId", async (req, res, next) => {
  try {
    const subjectId = Number(req.params.subjectId);
    if (!Number.isInteger(subjectId)) {
      res.status(400).json({ error: "Identificador de asignatura no válido" });
      return;
    }

    const subject = await getSubject(subjectId);
    if (!subject) {
      res.status(404).json({ error: "Asignatura no encontrada" });
      return;
    }

    const [enrollments, records, sessionsWithAttendance] = await Promise.all([
      prisma.matricula.findMany({
        where: { asignaturaId: subjectId, activa: true, alumno: { activo: true } },
        include: { alumno: true },
        orderBy: { alumno: { apellidos: "asc" } },
      }),
      prisma.registroSesion.findMany({
        where: {
          sesion: { asignaturaId: subjectId, estado: { not: "CANCELADA" } },
          alumno: { activo: true, matriculas: { some: { asignaturaId: subjectId, activa: true } } },
          estadoAsistencia: { not: null },
        },
        include: { alumno: true, sesion: true },
        orderBy: { sesion: { inicio: "asc" } },
      }),
      prisma.sesion.findMany({
        where: {
          asignaturaId: subjectId,
          estado: { not: "CANCELADA" },
          registros: { some: { estadoAsistencia: { not: null } } },
        },
        select: { id: true, inicio: true, tipo: true, titulo: true },
        orderBy: { inicio: "asc" },
      }),
    ]);

    const byStudent = new Map<number, typeof records>();
    for (const record of records) {
      const current = byStudent.get(record.alumnoId) ?? [];
      current.push(record);
      byStudent.set(record.alumnoId, current);
    }

    const students = enrollments.map((enrollment) => {
      const studentRecords = byStudent.get(enrollment.alumnoId) ?? [];
      return {
        alumno: {
          id: enrollment.alumno.id,
          nombre: enrollment.alumno.nombre,
          apellidos: enrollment.alumno.apellidos,
          email: enrollment.alumno.email,
        },
        resumen: summarizeAttendance(studentRecords),
      };
    });

    res.json({
      asignatura: {
        id: subject.id,
        nombre: subject.nombre,
        grupo: subject.grupo,
        codigo: subject.codigo,
        cursoAcademico: { id: subject.cursoAcademico.id, nombre: subject.cursoAcademico.nombre },
      },
      sesionesConAsistencia: sessionsWithAttendance.length,
      alumnos: students,
      resumenGlobal: summarizeAttendance(records),
    });
  } catch (error) {
    next(error);
  }
});

reportsRouter.get("/subject-overview/:subjectId", async (req, res, next) => {
  try {
    const subjectId = Number(req.params.subjectId);
    if (!Number.isInteger(subjectId)) {
      res.status(400).json({ error: "Identificador de asignatura no válido" });
      return;
    }

    const subject = await getSubject(subjectId);
    if (!subject) {
      res.status(404).json({ error: "Asignatura no encontrada" });
      return;
    }

    const [enrollments, attendanceRecords, activities, deliveries, tutorials, followUps, incidents, observations] = await Promise.all([
      prisma.matricula.findMany({
        where: { asignaturaId: subjectId, activa: true, alumno: { activo: true } },
        include: { alumno: true },
        orderBy: { alumno: { apellidos: "asc" } },
      }),
      prisma.registroSesion.findMany({
        where: {
          sesion: { asignaturaId: subjectId, estado: { not: "CANCELADA" } },
          alumno: { activo: true, matriculas: { some: { asignaturaId: subjectId, activa: true } } },
          estadoAsistencia: { not: null },
        },
        include: { sesion: true },
      }),
      prisma.actividad.findMany({
        where: { asignaturaId: subjectId, activa: true },
        select: { id: true },
      }),
      prisma.entrega.findMany({
        where: {
          actividad: { asignaturaId: subjectId, activa: true },
          alumno: { activo: true, matriculas: { some: { asignaturaId: subjectId, activa: true } } },
        },
      }),
      prisma.tutoriaIndividual.findMany({
        where: {
          asignaturaId: subjectId,
          alumno: { activo: true, matriculas: { some: { asignaturaId: subjectId, activa: true } } },
        },
        select: { alumnoId: true, estado: true },
      }),
      prisma.seguimiento.findMany({
        where: {
          asignaturaId: subjectId,
          estado: "PENDIENTE",
          alumno: { activo: true, matriculas: { some: { asignaturaId: subjectId, activa: true } } },
        },
        select: { alumnoId: true, fechaObjetivo: true },
      }),
      prisma.incidencia.findMany({
        where: {
          asignaturaId: subjectId,
          estado: { in: ["ABIERTA", "EN_SEGUIMIENTO"] },
          alumno: { activo: true, matriculas: { some: { asignaturaId: subjectId, activa: true } } },
        },
        select: { alumnoId: true },
      }),
      prisma.registroSesion.findMany({
        where: {
          sesion: { asignaturaId: subjectId, estado: { not: "CANCELADA" } },
          alumno: { activo: true, matriculas: { some: { asignaturaId: subjectId, activa: true } } },
          observacion: { not: null },
        },
        include: { sesion: true },
        orderBy: { sesion: { inicio: "desc" } },
      }),
    ]);

    const activityIds = new Set(activities.map((activity) => activity.id));
    const now = new Date();

    const rows = enrollments.map((enrollment) => {
      const studentId = enrollment.alumnoId;
      const studentAttendance = attendanceRecords.filter((record) => record.alumnoId === studentId);
      const studentDeliveries = deliveries.filter((delivery) => delivery.alumnoId === studentId && activityIds.has(delivery.actividadId));
      const deliveryCounts = {
        PENDIENTE: 0,
        ENTREGADA: 0,
        CORREGIDA: 0,
        NO_ENTREGADA: 0,
        RETRASADA: 0,
      };
      for (const delivery of studentDeliveries) deliveryCounts[delivery.estado] += 1;

      const grades = studentDeliveries
        .map((delivery) => delivery.calificacion)
        .filter((grade): grade is number => grade !== null);

      const latestObservation = observations.find((record) => record.alumnoId === studentId && record.observacion?.trim());
      const studentFollowUps = followUps.filter((followUp) => followUp.alumnoId === studentId);

      return {
        alumno: {
          id: enrollment.alumno.id,
          nombre: enrollment.alumno.nombre,
          apellidos: enrollment.alumno.apellidos,
          email: enrollment.alumno.email,
        },
        asistencia: summarizeAttendance(studentAttendance),
        actividades: {
          total: activities.length,
          registradas: studentDeliveries.length,
          sinRegistro: Math.max(activities.length - studentDeliveries.length, 0),
          ...deliveryCounts,
          notaMedia: grades.length ? Math.round((grades.reduce((sum, grade) => sum + grade, 0) / grades.length) * 100) / 100 : null,
        },
        tutorias: tutorials.filter((tutorial) => tutorial.alumnoId === studentId).length,
        seguimientosPendientes: studentFollowUps.length,
        seguimientosVencidos: studentFollowUps.filter((followUp) => followUp.fechaObjetivo < now).length,
        incidenciasAbiertas: incidents.filter((incident) => incident.alumnoId === studentId).length,
        ultimaObservacion: latestObservation
          ? {
              fecha: latestObservation.sesion.inicio,
              texto: latestObservation.observacion,
            }
          : null,
      };
    });

    res.json({
      asignatura: {
        id: subject.id,
        nombre: subject.nombre,
        grupo: subject.grupo,
        codigo: subject.codigo,
        cursoAcademico: { id: subject.cursoAcademico.id, nombre: subject.cursoAcademico.nombre },
      },
      totales: {
        alumnos: enrollments.length,
        actividades: activities.length,
        tutorias: tutorials.length,
        seguimientosPendientes: followUps.length,
        seguimientosVencidos: followUps.filter((followUp) => followUp.fechaObjetivo < now).length,
        incidenciasAbiertas: incidents.length,
      },
      alumnos: rows,
    });
  } catch (error) {
    next(error);
  }
});
