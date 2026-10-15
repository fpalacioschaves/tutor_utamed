import { Router } from "express";
import { acknowledgeCurrentData, driveSyncStatus, exportDrivePackage, importDrivePackage, listDrivePackages, readDriveConfig, writeDriveConfig } from "../services/drive-sync";

import { restorePreparedDriveBackup } from "./backups";

export const driveSyncRouter = Router();

function respondError(res: any, error: unknown) {
  res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo realizar la operación" });
}
driveSyncRouter.get("/status", async (_req, res) => {
  try { res.json(await driveSyncStatus()); } catch (error) { respondError(res, error); }
});
driveSyncRouter.get("/settings", async (_req, res) => {
  try { res.json(await readDriveConfig()); } catch (error) { respondError(res, error); }
});
driveSyncRouter.put("/settings", async (req, res) => {
  try { res.json(await writeDriveConfig(req.body?.folder)); } catch (error) { respondError(res, error); }
});
driveSyncRouter.get("/packages", async (_req, res) => {
  try { res.json(await listDrivePackages()); } catch (error) { respondError(res, error); }
});
driveSyncRouter.post("/export", async (req, res) => {
  try { res.status(201).json(await exportDrivePackage(req.body?.passphrase)); }
  catch (error) { respondError(res, error); }
});
driveSyncRouter.post("/import", async (req, res) => {
  try { res.status(201).json(await importDrivePackage(req.body?.name, req.body?.passphrase)); }
  catch (error) { respondError(res, error); }
});

driveSyncRouter.post("/acknowledge", async (req, res) => {
  try { res.json(await acknowledgeCurrentData(req.body?.expectedLatest)); }
  catch (error) { respondError(res, error); }
});

// Un solo paso: descifrar la copia mas reciente y restaurarla con respaldo previo.
driveSyncRouter.post("/resume", async (req, res) => {
  try {
    const status = await driveSyncStatus();
    const expected = req.body?.expectedLatest;
    if (!status.configured || !status.latest || expected !== status.latest) {
      throw new Error("Google Drive ha cambiado o no está preparado. Actualiza antes de continuar.");
    }
    if (!status.needsReview) {
      throw new Error("Este equipo ya registra la última copia. No es necesario restaurar.");
    }
    const staged = await importDrivePackage(status.latest, req.body?.passphrase);
    const check = await driveSyncStatus();
    if (check.latest !== expected) {
      throw new Error("La copia más reciente cambió mientras se descifraba. No se ha restaurado.");
    }
    res.json(await restorePreparedDriveBackup(staged.name));
  } catch (error) { respondError(res, error); }
});
