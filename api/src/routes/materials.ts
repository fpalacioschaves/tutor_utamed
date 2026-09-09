import { Router } from "express";
import { prisma } from "../lib/prisma";
import {
  absoluteMaterialPath,
  getStoredMaterial,
  listMaterials,
  removeMaterial,
  saveMaterial,
} from "../services/material-storage";

export const materialsRouter = Router();

materialsRouter.get("/", async (req, res, next) => {
  try {
    const unitId = Number(req.query.unitId);
    if (!Number.isInteger(unitId) || unitId < 1) {
      res.status(400).json({ error: "unitId es obligatorio" });
      return;
    }

    const unit = await prisma.unidad.findUnique({ where: { id: unitId }, select: { id: true } });
    if (!unit) {
      res.status(404).json({ error: "Unidad no encontrada" });
      return;
    }

    res.json(await listMaterials(unitId));
  } catch (error) {
    next(error);
  }
});

materialsRouter.post("/", async (req, res, next) => {
  try {
    const unitId = Number(req.body?.unitId);
    const originalName = typeof req.body?.originalName === "string" ? req.body.originalName : "";
    const base64 = typeof req.body?.base64 === "string" ? req.body.base64 : "";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : undefined;

    if (!Number.isInteger(unitId) || unitId < 1 || !originalName.trim() || !base64) {
      res.status(400).json({ error: "unitId, originalName y base64 son obligatorios" });
      return;
    }

    const unit = await prisma.unidad.findUnique({ where: { id: unitId }, select: { id: true } });
    if (!unit) {
      res.status(404).json({ error: "Unidad no encontrada" });
      return;
    }

    const material = await saveMaterial({ unitId, originalName, mimeType, base64 });
    res.status(201).json(material);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el material";
    if (message.includes("25 MB") || message.includes("vacío") || message.includes("nombre")) {
      res.status(400).json({ error: message });
      return;
    }
    next(error);
  }
});

materialsRouter.get("/:id/file", async (req, res, next) => {
  try {
    const material = await getStoredMaterial(req.params.id);
    if (!material) {
      res.status(404).json({ error: "Material no encontrado" });
      return;
    }

    const absolutePath = absoluteMaterialPath(material);
    res.type(material.mimeType || material.extension || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(material.originalName)}`);
    res.sendFile(absolutePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

materialsRouter.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await removeMaterial(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Material no encontrado" });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
