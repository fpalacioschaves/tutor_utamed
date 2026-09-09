import { Router } from "express";
import { buildAlerts, ensureAlertSettings, updateAlertSettings } from "../services/alerts";

export const alertsRouter = Router();

function intValue(value: unknown, name: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} debe ser un número entero entre ${min} y ${max}.`);
  }
  return parsed;
}

function boolValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

alertsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await buildAlerts());
  } catch (error) {
    next(error);
  }
});

alertsRouter.get("/settings", async (_req, res, next) => {
  try {
    res.json(await ensureAlertSettings());
  } catch (error) {
    next(error);
  }
});

alertsRouter.put("/settings", async (req, res, next) => {
  try {
    const current = await ensureAlertSettings();
    const body = req.body ?? {};
    const updated = await updateAlertSettings({
      ...current,
      ausenciasConsecutivasActiva: boolValue(body.ausenciasConsecutivasActiva, current.ausenciasConsecutivasActiva),
      ausenciasConsecutivasUmbral: intValue(body.ausenciasConsecutivasUmbral ?? current.ausenciasConsecutivasUmbral, "El umbral de ausencias", 1, 20),
      actividadesPendientesActiva: boolValue(body.actividadesPendientesActiva, current.actividadesPendientesActiva),
      actividadesPendientesUmbral: intValue(body.actividadesPendientesUmbral ?? current.actividadesPendientesUmbral, "El umbral de actividades pendientes", 1, 50),
      seguimientosVencidosActiva: boolValue(body.seguimientosVencidosActiva, current.seguimientosVencidosActiva),
      tutoriasSinProgramarActiva: boolValue(body.tutoriasSinProgramarActiva, current.tutoriasSinProgramarActiva),
      tutoriasSinProgramarDias: intValue(body.tutoriasSinProgramarDias ?? current.tutoriasSinProgramarDias, "Los días de tutoría sin programar", 1, 365),
      incidenciasAbiertasActiva: boolValue(body.incidenciasAbiertasActiva, current.incidenciasAbiertasActiva),
      incidenciasAbiertasDias: intValue(body.incidenciasAbiertasDias ?? current.incidenciasAbiertasDias, "Los días de incidencia abierta", 1, 365),
    });
    res.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message.includes("debe ser")) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});
