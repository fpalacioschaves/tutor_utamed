import { Router } from "express";
import { prisma } from "../lib/prisma";
import { createBackup } from "./backups";

export const maintenanceRouter = Router();

async function getCleanupImpact() {
  const [
    students,
    enrollments,
    sessions,
    attendanceRecords,
    activities,
    submissions,
    tutorials,
    followUps,
    incidents,
    communications,
  ] = await Promise.all([
    prisma.alumno.count(),
    prisma.matricula.count(),
    prisma.sesion.count(),
    prisma.registroSesion.count(),
    prisma.actividad.count(),
    prisma.entrega.count(),
    prisma.tutoriaIndividual.count(),
    prisma.seguimiento.count(),
    prisma.incidencia.count(),
    prisma.comunicacion.count(),
  ]);

  return {
    students,
    enrollments,
    sessions,
    attendanceRecords,
    activities,
    submissions,
    tutorials,
    followUps,
    incidents,
    communications,
    totalOperationalRecords:
      students +
      enrollments +
      sessions +
      attendanceRecords +
      activities +
      submissions +
      tutorials +
      followUps +
      incidents +
      communications,
  };
}

maintenanceRouter.get("/cleanup-preview", async (_req, res, next) => {
  try {
    const impact = await getCleanupImpact();
    const [courses, groups, subjects, units] = await Promise.all([
      prisma.cursoAcademico.count(),
      prisma.grupo.count(),
      prisma.asignatura.count(),
      prisma.unidad.count(),
    ]);

    res.json({
      delete: impact,
      preserve: {
        courses,
        groups,
        subjects,
        units,
        localTeachingMaterials: true,
        settings: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

maintenanceRouter.post("/cleanup-demo-data", async (_req, res, next) => {
  try {
    const before = await getCleanupImpact();
    const safetyBackup = await createBackup("PRE_CLEANUP");

    await prisma.$transaction([
      prisma.seguimiento.deleteMany(),
      prisma.registroSesion.deleteMany(),
      prisma.entrega.deleteMany(),
      prisma.tutoriaIndividual.deleteMany(),
      prisma.incidencia.deleteMany(),
      prisma.comunicacion.deleteMany(),
      prisma.matricula.deleteMany(),
      prisma.actividad.deleteMany(),
      prisma.sesion.deleteMany(),
      prisma.alumno.deleteMany(),
    ]);

    res.json({
      ok: true,
      deleted: before,
      safetyBackup,
      preserved: [
        "Cursos académicos",
        "Grupos",
        "Asignaturas",
        "Unidades y contenidos",
        "Documentos y materiales docentes locales",
        "Configuración de la aplicación",
      ],
      message: "Datos de prueba eliminados. La estructura académica y los materiales docentes se han conservado.",
    });
  } catch (error) {
    next(error);
  }
});
