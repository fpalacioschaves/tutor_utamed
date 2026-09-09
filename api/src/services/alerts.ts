import { prisma } from "../lib/prisma";

export type AlertRuleKey =
  | "AUSENCIAS_CONSECUTIVAS"
  | "ACTIVIDADES_PENDIENTES"
  | "SEGUIMIENTO_VENCIDO"
  | "TUTORIA_SIN_PROGRAMAR"
  | "INCIDENCIA_ABIERTA";

export type AlertItem = {
  id: string;
  regla: AlertRuleKey;
  titulo: string;
  detalle: string;
  fecha: Date;
  alumno: { id: number; nombre: string; apellidos: string; email: string | null };
  asignatura: { id: number; nombre: string; grupo: string } | null;
  referenciaId: number | null;
};

export type AlertSettings = {
  id: number;
  ausenciasConsecutivasActiva: boolean;
  ausenciasConsecutivasUmbral: number;
  actividadesPendientesActiva: boolean;
  actividadesPendientesUmbral: number;
  seguimientosVencidosActiva: boolean;
  tutoriasSinProgramarActiva: boolean;
  tutoriasSinProgramarDias: number;
  incidenciasAbiertasActiva: boolean;
  incidenciasAbiertasDias: number;
  updatedAt: Date;
};

export const DEFAULT_ALERT_SETTINGS: Omit<AlertSettings, "updatedAt"> = {
  id: 1,
  ausenciasConsecutivasActiva: true,
  ausenciasConsecutivasUmbral: 2,
  actividadesPendientesActiva: true,
  actividadesPendientesUmbral: 3,
  seguimientosVencidosActiva: true,
  tutoriasSinProgramarActiva: true,
  tutoriasSinProgramarDias: 5,
  incidenciasAbiertasActiva: true,
  incidenciasAbiertasDias: 10,
};

type RawAlertSettings = {
  id: number;
  ausencias_consecutivas_activa: number;
  ausencias_consecutivas_umbral: number;
  actividades_pendientes_activa: number;
  actividades_pendientes_umbral: number;
  seguimientos_vencidos_activa: number;
  tutorias_sin_programar_activa: number;
  tutorias_sin_programar_dias: number;
  incidencias_abiertas_activa: number;
  incidencias_abiertas_dias: number;
  updated_at: string | Date;
};

function normalizeAlertSettings(row: RawAlertSettings): AlertSettings {
  return {
    id: row.id,
    ausenciasConsecutivasActiva: Boolean(row.ausencias_consecutivas_activa),
    ausenciasConsecutivasUmbral: row.ausencias_consecutivas_umbral,
    actividadesPendientesActiva: Boolean(row.actividades_pendientes_activa),
    actividadesPendientesUmbral: row.actividades_pendientes_umbral,
    seguimientosVencidosActiva: Boolean(row.seguimientos_vencidos_activa),
    tutoriasSinProgramarActiva: Boolean(row.tutorias_sin_programar_activa),
    tutoriasSinProgramarDias: row.tutorias_sin_programar_dias,
    incidenciasAbiertasActiva: Boolean(row.incidencias_abiertas_activa),
    incidenciasAbiertasDias: row.incidencias_abiertas_dias,
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

/**
 * Garantiza que la configuración de alertas exista incluso si el usuario
 * arranca una copia actualizada sin haber regenerado todavía Prisma Client.
 * Usamos SQL sólo para esta tabla de configuración, evitando que un cliente
 * Prisma antiguo deje `prisma.configuracionAlertas` como undefined.
 */
export async function ensureAlertSettings(): Promise<AlertSettings> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS configuracion_alertas (
      id INTEGER NOT NULL PRIMARY KEY,
      ausencias_consecutivas_activa INTEGER NOT NULL DEFAULT 1,
      ausencias_consecutivas_umbral INTEGER NOT NULL DEFAULT 2,
      actividades_pendientes_activa INTEGER NOT NULL DEFAULT 1,
      actividades_pendientes_umbral INTEGER NOT NULL DEFAULT 3,
      seguimientos_vencidos_activa INTEGER NOT NULL DEFAULT 1,
      tutorias_sin_programar_activa INTEGER NOT NULL DEFAULT 1,
      tutorias_sin_programar_dias INTEGER NOT NULL DEFAULT 5,
      incidencias_abiertas_activa INTEGER NOT NULL DEFAULT 1,
      incidencias_abiertas_dias INTEGER NOT NULL DEFAULT 10,
      updated_at DATETIME NOT NULL
    )
  `);

  await prisma.$executeRaw`
    INSERT OR IGNORE INTO configuracion_alertas (
      id,
      ausencias_consecutivas_activa,
      ausencias_consecutivas_umbral,
      actividades_pendientes_activa,
      actividades_pendientes_umbral,
      seguimientos_vencidos_activa,
      tutorias_sin_programar_activa,
      tutorias_sin_programar_dias,
      incidencias_abiertas_activa,
      incidencias_abiertas_dias,
      updated_at
    ) VALUES (
      ${DEFAULT_ALERT_SETTINGS.id},
      ${DEFAULT_ALERT_SETTINGS.ausenciasConsecutivasActiva ? 1 : 0},
      ${DEFAULT_ALERT_SETTINGS.ausenciasConsecutivasUmbral},
      ${DEFAULT_ALERT_SETTINGS.actividadesPendientesActiva ? 1 : 0},
      ${DEFAULT_ALERT_SETTINGS.actividadesPendientesUmbral},
      ${DEFAULT_ALERT_SETTINGS.seguimientosVencidosActiva ? 1 : 0},
      ${DEFAULT_ALERT_SETTINGS.tutoriasSinProgramarActiva ? 1 : 0},
      ${DEFAULT_ALERT_SETTINGS.tutoriasSinProgramarDias},
      ${DEFAULT_ALERT_SETTINGS.incidenciasAbiertasActiva ? 1 : 0},
      ${DEFAULT_ALERT_SETTINGS.incidenciasAbiertasDias},
      ${new Date()}
    )
  `;

  const rows = await prisma.$queryRaw<RawAlertSettings[]>`
    SELECT * FROM configuracion_alertas WHERE id = 1 LIMIT 1
  `;
  if (!rows[0]) throw new Error("No se pudo inicializar la configuración de alertas.");
  return normalizeAlertSettings(rows[0]);
}

export async function updateAlertSettings(settings: AlertSettings): Promise<AlertSettings> {
  await ensureAlertSettings();
  await prisma.$executeRaw`
    UPDATE configuracion_alertas SET
      ausencias_consecutivas_activa = ${settings.ausenciasConsecutivasActiva ? 1 : 0},
      ausencias_consecutivas_umbral = ${settings.ausenciasConsecutivasUmbral},
      actividades_pendientes_activa = ${settings.actividadesPendientesActiva ? 1 : 0},
      actividades_pendientes_umbral = ${settings.actividadesPendientesUmbral},
      seguimientos_vencidos_activa = ${settings.seguimientosVencidosActiva ? 1 : 0},
      tutorias_sin_programar_activa = ${settings.tutoriasSinProgramarActiva ? 1 : 0},
      tutorias_sin_programar_dias = ${settings.tutoriasSinProgramarDias},
      incidencias_abiertas_activa = ${settings.incidenciasAbiertasActiva ? 1 : 0},
      incidencias_abiertas_dias = ${settings.incidenciasAbiertasDias},
      updated_at = ${new Date()}
    WHERE id = 1
  `;
  return ensureAlertSettings();
}

function subtractDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

export async function buildAlerts() {
  const now = new Date();
  const settings = await ensureAlertSettings();

  const activeEnrollments = await prisma.matricula.findMany({
    where: {
      activa: true,
      alumno: { activo: true },
      asignatura: { activa: true },
    },
    include: {
      alumno: { select: { id: true, nombre: true, apellidos: true, email: true } },
      asignatura: { select: { id: true, nombre: true, grupo: true } },
    },
  });

  const enrollmentByKey = new Map(
    activeEnrollments.map((enrollment) => [
      `${enrollment.alumnoId}:${enrollment.asignaturaId}`,
      enrollment,
    ]),
  );

  const alerts: AlertItem[] = [];

  if (settings.ausenciasConsecutivasActiva) {
    const records = await prisma.registroSesion.findMany({
      where: {
        estadoAsistencia: { not: null },
        alumno: { activo: true },
        sesion: {
          inicio: { lte: now },
          estado: { not: "CANCELADA" },
          asignatura: { activa: true },
        },
      },
      include: {
        alumno: { select: { id: true, nombre: true, apellidos: true, email: true } },
        sesion: {
          select: {
            inicio: true,
            asignatura: { select: { id: true, nombre: true, grupo: true } },
          },
        },
      },
    });

    const grouped = new Map<string, typeof records>();
    for (const record of records) {
      const key = `${record.alumnoId}:${record.sesion.asignatura.id}`;
      if (!enrollmentByKey.has(key)) continue;
      const current = grouped.get(key) ?? [];
      current.push(record);
      grouped.set(key, current);
    }

    for (const [key, group] of grouped) {
      group.sort((a, b) => b.sesion.inicio.getTime() - a.sesion.inicio.getTime());
      let consecutive = 0;
      for (const record of group) {
        if (record.estadoAsistencia === "AUSENTE") consecutive += 1;
        else break;
      }
      if (consecutive < settings.ausenciasConsecutivasUmbral) continue;
      const enrollment = enrollmentByKey.get(key)!;
      alerts.push({
        id: `ausencias-${enrollment.alumnoId}-${enrollment.asignaturaId}`,
        regla: "AUSENCIAS_CONSECUTIVAS",
        titulo: `${consecutive} ausencias no justificadas consecutivas`,
        detalle: `El alumno acumula ${consecutive} ausencias no justificadas consecutivas en ${enrollment.asignatura.nombre}.`,
        fecha: group[0].sesion.inicio,
        alumno: enrollment.alumno,
        asignatura: enrollment.asignatura,
        referenciaId: null,
      });
    }
  }

  if (settings.actividadesPendientesActiva && activeEnrollments.length > 0) {
    const activities = await prisma.actividad.findMany({
      where: {
        activa: true,
        fechaLimite: { not: null, lte: now },
        asignatura: { activa: true },
      },
      select: { id: true, asignaturaId: true, titulo: true, fechaLimite: true },
    });

    const activityIds = activities.map((activity) => activity.id);
    const studentIds = [...new Set(activeEnrollments.map((enrollment) => enrollment.alumnoId))];
    const deliveries = activityIds.length === 0
      ? []
      : await prisma.entrega.findMany({
          where: { actividadId: { in: activityIds }, alumnoId: { in: studentIds } },
          select: { actividadId: true, alumnoId: true, estado: true },
        });
    const deliveryByKey = new Map(deliveries.map((delivery) => [`${delivery.alumnoId}:${delivery.actividadId}`, delivery]));
    const activitiesBySubject = new Map<number, typeof activities>();
    for (const activity of activities) {
      const current = activitiesBySubject.get(activity.asignaturaId) ?? [];
      current.push(activity);
      activitiesBySubject.set(activity.asignaturaId, current);
    }

    for (const enrollment of activeEnrollments) {
      const subjectActivities = activitiesBySubject.get(enrollment.asignaturaId) ?? [];
      const pending = subjectActivities.filter((activity) => {
        const delivery = deliveryByKey.get(`${enrollment.alumnoId}:${activity.id}`);
        return !delivery || delivery.estado === "PENDIENTE" || delivery.estado === "NO_ENTREGADA";
      });
      if (pending.length < settings.actividadesPendientesUmbral) continue;
      const oldestDeadline = pending
        .map((activity) => activity.fechaLimite)
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? now;
      alerts.push({
        id: `actividades-${enrollment.alumnoId}-${enrollment.asignaturaId}`,
        regla: "ACTIVIDADES_PENDIENTES",
        titulo: `${pending.length} actividades pendientes`,
        detalle: `Tiene ${pending.length} actividades vencidas sin resolver en ${enrollment.asignatura.nombre}.`,
        fecha: oldestDeadline,
        alumno: enrollment.alumno,
        asignatura: enrollment.asignatura,
        referenciaId: null,
      });
    }
  }

  if (settings.seguimientosVencidosActiva) {
    const followUps = await prisma.seguimiento.findMany({
      where: {
        estado: "PENDIENTE",
        fechaObjetivo: { lt: now },
        alumno: { activo: true },
      },
      include: {
        alumno: { select: { id: true, nombre: true, apellidos: true, email: true } },
        asignatura: { select: { id: true, nombre: true, grupo: true } },
      },
    });
    for (const followUp of followUps) {
      alerts.push({
        id: `seguimiento-${followUp.id}`,
        regla: "SEGUIMIENTO_VENCIDO",
        titulo: "Seguimiento vencido",
        detalle: followUp.descripcion,
        fecha: followUp.fechaObjetivo,
        alumno: followUp.alumno,
        asignatura: followUp.asignatura,
        referenciaId: followUp.id,
      });
    }
  }

  if (settings.tutoriasSinProgramarActiva) {
    const cutoff = subtractDays(now, settings.tutoriasSinProgramarDias);
    const tutorials = await prisma.tutoriaIndividual.findMany({
      where: {
        estado: "SOLICITADA",
        fechaSolicitud: { lte: cutoff },
        alumno: { activo: true },
      },
      include: {
        alumno: { select: { id: true, nombre: true, apellidos: true, email: true } },
        asignatura: { select: { id: true, nombre: true, grupo: true } },
      },
    });
    for (const tutorial of tutorials) {
      alerts.push({
        id: `tutoria-${tutorial.id}`,
        regla: "TUTORIA_SIN_PROGRAMAR",
        titulo: `Tutoría sin programar desde hace más de ${settings.tutoriasSinProgramarDias} días`,
        detalle: tutorial.motivo || "Tutoría individual solicitada y todavía no programada.",
        fecha: tutorial.fechaSolicitud,
        alumno: tutorial.alumno,
        asignatura: tutorial.asignatura,
        referenciaId: tutorial.id,
      });
    }
  }

  if (settings.incidenciasAbiertasActiva) {
    const cutoff = subtractDays(now, settings.incidenciasAbiertasDias);
    const incidents = await prisma.incidencia.findMany({
      where: {
        estado: { in: ["ABIERTA", "EN_SEGUIMIENTO"] },
        fecha: { lte: cutoff },
        alumno: { activo: true },
      },
      include: {
        alumno: { select: { id: true, nombre: true, apellidos: true, email: true } },
        asignatura: { select: { id: true, nombre: true, grupo: true } },
      },
    });
    for (const incident of incidents) {
      alerts.push({
        id: `incidencia-${incident.id}`,
        regla: "INCIDENCIA_ABIERTA",
        titulo: `Incidencia abierta desde hace más de ${settings.incidenciasAbiertasDias} días`,
        detalle: `${incident.titulo}: ${incident.descripcion}`,
        fecha: incident.fecha,
        alumno: incident.alumno,
        asignatura: incident.asignatura,
        referenciaId: incident.id,
      });
    }
  }

  alerts.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const counts: Record<AlertRuleKey, number> = {
    AUSENCIAS_CONSECUTIVAS: 0,
    ACTIVIDADES_PENDIENTES: 0,
    SEGUIMIENTO_VENCIDO: 0,
    TUTORIA_SIN_PROGRAMAR: 0,
    INCIDENCIA_ABIERTA: 0,
  };
  for (const alert of alerts) counts[alert.regla] += 1;

  return { settings, alerts, counts, total: alerts.length };
}
