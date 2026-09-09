import { Router } from "express";
import {
  absoluteGeneratedResourcePath,
  getGeneratedResource,
  listGeneratedResources,
  removeGeneratedResource,
} from "../services/generated-resource-storage";

export const resourcesRouter = Router();

resourcesRouter.get("/", async (req, res, next) => {
  try {
    const unitIdRaw = req.query.unitId;
    if (unitIdRaw === undefined) {
      res.json(await listGeneratedResources());
      return;
    }

    const unitId = Number(unitIdRaw);
    if (!Number.isInteger(unitId) || unitId < 1) {
      res.status(400).json({ error: "unitId no válido" });
      return;
    }

    res.json(await listGeneratedResources(unitId));
  } catch (error) {
    next(error);
  }
});

resourcesRouter.get("/:id/file", async (req, res, next) => {
  try {
    const resource = await getGeneratedResource(req.params.id);
    if (!resource) {
      res.status(404).json({ error: "Recurso no encontrado" });
      return;
    }

    const absolutePath = absoluteGeneratedResourcePath(resource);
    res.type("text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${resource.title}.md`)}`);
    res.sendFile(absolutePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

resourcesRouter.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await removeGeneratedResource(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Recurso no encontrado" });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
