import { Router } from "express";
import { exportDrivePackage, importDrivePackage, listDrivePackages, readDriveConfig, writeDriveConfig } from "../services/drive-sync";

export const driveSyncRouter = Router();

function respondError(res: any, error: unknown) {
  res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo realizar la operación" });
}
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
