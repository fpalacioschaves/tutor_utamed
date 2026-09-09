import { prisma } from "../lib/prisma";

export type AiDataUsage = {
  matriculas: number;
  sesiones: number;
  observacionesClase: number;
  actividades: number;
  actividadesCalificadas: number;
  tutorias: number;
  seguimientos: number;
  incidencias: number;
  comunicaciones: number;
  truncado: boolean;
};

const MAX_ITEMS = {
  sessions: 80,
  activities: 80,
  tutorials: 30,
  followUps: 40,
  incidents: 30,
  communications: 30,
};

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function compactText(value: string | null | undefined) {
  return value?.trim() || null;
}

export async function buildStudentAiContext(studentId: number) {
  const student = await prisma.alumno.findUnique({
    where: { id: studentId },
    include: {
      matriculas: {
        include: { asignatura: { include: { cursoAcademico: true } } },
        orderBy: { fechaAlta: "desc" },
      },
    },
  });

  if (!student) return null;

  const activeSubjectIds = student.matriculas
    .filter((item) => item.activa)
    .map((item) => item.asignaturaId);

  const [recordsAll, currentActivities, deliveries, tutorialsAll, followUpsAll, incidentsAll, communicationsAll] = await Promise.all([
    prisma.registroSesion.findMany({
      where: { alumnoId: studentId },
      include: { sesion: { include: { asignatura: true, unidad: true } } },
      orderBy: { sesion: { inicio: "desc" } },
    }),
    activeSubjectIds.length
      ? prisma.actividad.findMany({
          where: { asignaturaId: { in: activeSubjectIds }, activa: true },
          include: { asignatura: true, unidad: true },
          orderBy: [{ fechaLimite: "desc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    prisma.entrega.findMany({
      where: { alumnoId: studentId },
      include: { actividad: { include: { asignatura: true, unidad: true } } },
    }),
    prisma.tutoriaIndividual.findMany({
      where: { alumnoId: studentId },
      include: { asignatura: true },
      orderBy: [{ inicio: "desc" }, { fechaSolicitud: "desc" }],
    }),
    prisma.seguimiento.findMany({
      where: { alumnoId: studentId },
      include: { asignatura: true, actividad: true, incidencia: true },
      orderBy: { fechaObjetivo: "desc" },
    }),
    prisma.incidencia.findMany({
      where: { alumnoId: studentId },
      include: { asignatura: true },
      orderBy: { fecha: "desc" },
    }),
    prisma.comunicacion.findMany({
      where: { alumnoId: studentId },
      include: { asignatura: true },
      orderBy: { fecha: "desc" },
    }),
  ]);

  const deliveryByActivity = new Map(deliveries.map((delivery) => [delivery.actividadId, delivery]));
  const activityMap = new Map<number, (typeof currentActivities)[number]>();
  for (const activity of currentActivities) activityMap.set(activity.id, activity);
  for (const delivery of deliveries) {
    if (!activityMap.has(delivery.actividadId)) activityMap.set(delivery.actividadId, delivery.actividad);
  }

  const activitiesAll = Array.from(activityMap.values()).sort((a, b) => {
    const aDate = a.fechaLimite?.getTime() ?? a.createdAt.getTime();
    const bDate = b.fechaLimite?.getTime() ?? b.createdAt.getTime();
    return bDate - aDate;
  });

  const records = recordsAll.slice(0, MAX_ITEMS.sessions);
  const activities = activitiesAll.slice(0, MAX_ITEMS.activities);
  const tutorials = tutorialsAll.slice(0, MAX_ITEMS.tutorials);
  const followUps = followUpsAll.slice(0, MAX_ITEMS.followUps);
  const incidents = incidentsAll.slice(0, MAX_ITEMS.incidents);
  const communications = communicationsAll.slice(0, MAX_ITEMS.communications);

  const activityRows = activities.map((activity) => {
    const delivery = deliveryByActivity.get(activity.id);
    return {
      fechaLimite: iso(activity.fechaLimite),
      asignatura: activity.asignatura.nombre,
      unidad: activity.unidad ? `U${activity.unidad.orden} ${activity.unidad.titulo}` : null,
      titulo: activity.titulo,
      estado: delivery?.estado ?? "PENDIENTE",
      fechaEntrega: iso(delivery?.fechaEntrega),
      calificacion: delivery?.calificacion ?? null,
      observacion: compactText(delivery?.observacion),
    };
  });

  const context = {
    alumno: {
      nombre: `${student.nombre} ${student.apellidos}`,
      activo: student.activo,
      notasGenerales: compactText(student.notasGenerales),
    },
    matriculas: student.matriculas.map((item) => ({
      asignatura: item.asignatura.nombre,
      curso: item.asignatura.cursoAcademico.nombre,
      activa: item.activa,
      fechaAlta: iso(item.fechaAlta),
      fechaBaja: iso(item.fechaBaja),
    })),
    sesiones: records.map((record) => ({
      fecha: iso(record.sesion.inicio),
      asignatura: record.sesion.asignatura.nombre,
      unidad: record.sesion.unidad ? `U${record.sesion.unidad.orden} ${record.sesion.unidad.titulo}` : null,
      tipo: record.sesion.tipo,
      tema: compactText(record.sesion.tema || record.sesion.titulo),
      asistencia: record.estadoAsistencia,
      observacion: compactText(record.observacion),
    })),
    actividades: activityRows,
    tutorias: tutorials.map((item) => ({
      fechaSolicitud: iso(item.fechaSolicitud),
      inicio: iso(item.inicio),
      asignatura: item.asignatura?.nombre ?? "General",
      estado: item.estado,
      motivo: compactText(item.motivo),
      observaciones: compactText(item.observaciones),
      acuerdos: compactText(item.acuerdos),
    })),
    seguimientos: followUps.map((item) => ({
      fechaObjetivo: iso(item.fechaObjetivo),
      asignatura: item.asignatura?.nombre ?? "General",
      estado: item.estado,
      descripcion: item.descripcion,
      fechaCompletado: iso(item.fechaCompletado),
      actividad: item.actividad?.titulo ?? null,
      incidencia: item.incidencia?.titulo ?? null,
    })),
    incidencias: incidents.map((item) => ({
      fecha: iso(item.fecha),
      asignatura: item.asignatura?.nombre ?? "General",
      titulo: item.titulo,
      descripcion: item.descripcion,
      estado: item.estado,
      resolucion: compactText(item.resolucion),
      fechaResolucion: iso(item.fechaResolucion),
    })),
    comunicaciones: communications.map((item) => ({
      fecha: iso(item.fecha),
      asignatura: item.asignatura?.nombre ?? "General",
      canal: item.canal,
      motivo: compactText(item.motivo),
      resumen: compactText(item.resumen),
    })),
  };

  const usage: AiDataUsage = {
    matriculas: student.matriculas.length,
    sesiones: recordsAll.length,
    observacionesClase: recordsAll.filter((item) => item.observacion?.trim()).length,
    actividades: activitiesAll.length,
    actividadesCalificadas: activitiesAll.filter((activity) => typeof deliveryByActivity.get(activity.id)?.calificacion === "number").length,
    tutorias: tutorialsAll.length,
    seguimientos: followUpsAll.length,
    incidencias: incidentsAll.length,
    comunicaciones: communicationsAll.length,
    truncado:
      recordsAll.length > MAX_ITEMS.sessions ||
      activitiesAll.length > MAX_ITEMS.activities ||
      tutorialsAll.length > MAX_ITEMS.tutorials ||
      followUpsAll.length > MAX_ITEMS.followUps ||
      incidentsAll.length > MAX_ITEMS.incidents ||
      communicationsAll.length > MAX_ITEMS.communications,
  };

  return { context, usage };
}
