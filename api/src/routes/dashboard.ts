import { Router } from "express";
import { prisma } from "../lib/prisma";
import { buildAlerts } from "../services/alerts";

export const dashboardRouter = Router();

function dayBounds(reference = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

dashboardRouter.get("/summary", async (_req, res, next) => {
  try {
    const now = new Date();
    const { start: startOfDay, end: endOfDay } = dayBounds(now);

    const [
      activeCourse,
      students,
      subjects,
      sessionsToday,
      pendingFollowUps,
      overdueFollowUpsCount,
      requestedTutorialsCount,
      openIncidentsCount,
      tutorialsTodayCount,
      todaySessions,
      todayTutorials,
      overdueFollowUps,
      requestedTutorials,
      openIncidents,
      automaticAlerts,
    ] = await Promise.all([
      prisma.cursoAcademico.findFirst({
        where: { activo: true },
        orderBy: { fechaInicio: "desc" },
        select: { id: true, nombre: true },
      }),
      prisma.alumno.count({ where: { activo: true } }),
      prisma.asignatura.count({ where: { activa: true } }),
      prisma.sesion.count({
        where: {
          inicio: { gte: startOfDay, lte: endOfDay },
          estado: { not: "CANCELADA" },
        },
      }),
      prisma.seguimiento.count({ where: { estado: "PENDIENTE" } }),
      prisma.seguimiento.count({
        where: { estado: "PENDIENTE", fechaObjetivo: { lt: now } },
      }),
      prisma.tutoriaIndividual.count({ where: { estado: "SOLICITADA" } }),
      prisma.incidencia.count({ where: { estado: { in: ["ABIERTA", "EN_SEGUIMIENTO"] } } }),
      prisma.tutoriaIndividual.count({
        where: {
          inicio: { gte: startOfDay, lte: endOfDay },
          estado: { in: ["PROGRAMADA", "REALIZADA"] },
        },
      }),
      prisma.sesion.findMany({
        where: {
          inicio: { gte: startOfDay, lte: endOfDay },
          estado: { not: "CANCELADA" },
        },
        orderBy: { inicio: "asc" },
        include: {
          asignatura: { select: { id: true, nombre: true, grupo: true } },
          _count: { select: { registros: true } },
        },
      }),
      prisma.tutoriaIndividual.findMany({
        where: {
          inicio: { gte: startOfDay, lte: endOfDay },
          estado: { in: ["PROGRAMADA", "REALIZADA"] },
        },
        orderBy: { inicio: "asc" },
        include: {
          alumno: { select: { id: true, nombre: true, apellidos: true, email: true } },
          asignatura: { select: { id: true, nombre: true, grupo: true } },
        },
      }),
      prisma.seguimiento.findMany({
        where: { estado: "PENDIENTE", fechaObjetivo: { lt: now } },
        orderBy: { fechaObjetivo: "asc" },
        take: 6,
        include: {
          alumno: { select: { id: true, nombre: true, apellidos: true, email: true } },
          asignatura: { select: { id: true, nombre: true, grupo: true } },
        },
      }),
      prisma.tutoriaIndividual.findMany({
        where: { estado: "SOLICITADA" },
        orderBy: { fechaSolicitud: "asc" },
        take: 6,
        include: {
          alumno: { select: { id: true, nombre: true, apellidos: true, email: true } },
          asignatura: { select: { id: true, nombre: true, grupo: true } },
        },
      }),
      prisma.incidencia.findMany({
        where: { estado: { in: ["ABIERTA", "EN_SEGUIMIENTO"] } },
        orderBy: { fecha: "desc" },
        take: 6,
        include: {
          alumno: { select: { id: true, nombre: true, apellidos: true, email: true } },
          asignatura: { select: { id: true, nombre: true, grupo: true } },
        },
      }),
      buildAlerts(),
    ]);

    res.json({
      course: activeCourse,
      students,
      subjects,
      sessionsToday,
      tutorialsToday: tutorialsTodayCount,
      pendingFollowUps,
      overdueFollowUps: overdueFollowUpsCount,
      requestedTutorials: requestedTutorialsCount,
      openIncidents: openIncidentsCount,
      automaticAlerts: automaticAlerts.total,
      today: {
        sessions: todaySessions,
        tutorials: todayTutorials,
      },
      attention: {
        followUps: overdueFollowUps,
        tutorials: requestedTutorials,
        incidents: openIncidents,
      },
    });
  } catch (error) {
    next(error);
  }
});
