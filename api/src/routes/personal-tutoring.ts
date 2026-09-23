import { Router } from "express";
import { prisma } from "../lib/prisma";
import { GUIAS, personalTutoringOverview } from "../services/personal-tutoring";

export const personalTutoringRouter = Router();

personalTutoringRouter.get("/", async (_req, res, next) => {
  try { res.json(await personalTutoringOverview()); }
  catch (error) { next(error); }
});

// La selección de los alumnos se hace SOLO en la instalación local.
// No se importa ni se incorpora ningún documento ni dato real al repositorio.
personalTutoringRouter.patch("/students/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1 ||
      typeof req.body.tutorizadoPersonalmente !== "boolean") {
      res.status(400).json({ error: "Alumno o marca tutorial no válidos." }); return;
    }
    const existing = await prisma.alumno.findUnique({ where: { id }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Alumno no encontrado." }); return; }
    const alumno = await prisma.alumno.update({
      where: { id }, data: { tutorizadoPersonalmente: req.body.tutorizadoPersonalmente },
      select: { id: true, tutorizadoPersonalmente: true },
    });
    res.json(alumno);
  } catch (error) { next(error); }
});

personalTutoringRouter.put("/students/:id/contacts/:number", async (req, res, next) => {
  try {
    const alumnoId = Number(req.params.id);
    const numero = Number(req.params.number);
    const { fecha, medio, observaciones, acuerdos } = req.body ?? {};
    if (!Number.isSafeInteger(alumnoId) || alumnoId < 1 ||
      !GUIAS.some(guia => guia.numero === numero)) {
      res.status(400).json({ error: "Alumno o contacto no válido." }); return;
    }
    if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      !Number.isFinite(Date.parse(fecha)) ||
      new Date(fecha).toISOString().slice(0, 10) !== fecha ||
      fecha < "2026-09-01" || fecha > "2027-07-31") {
      res.status(400).json({ error: "La fecha debe pertenecer al curso 2026-2027." }); return;
    }
    if (typeof medio !== "string" || !medio.trim() || medio.trim().length > 80 ||
      (observaciones != null && typeof observaciones !== "string") ||
      (acuerdos != null && typeof acuerdos !== "string")) {
      res.status(400).json({ error: "Medio u observaciones no válidos." }); return;
    }
    const alumno = await prisma.alumno.findUnique({
      where: { id: alumnoId }, select: { activo: true, tutorizadoPersonalmente: true },
    });
    if (!alumno) { res.status(404).json({ error: "Alumno no encontrado." }); return; }
    if (!alumno.activo || !alumno.tutorizadoPersonalmente) {
      res.status(409).json({ error: "El alumno debe estar activo y asignado a tu seguimiento personalizado." });
      return;
    }
    const payload = {
      fecha: new Date(fecha + "T12:00:00.000Z"), medio: medio.trim(),
      observaciones: typeof observaciones === "string" ? observaciones.trim() || null : null,
      acuerdos: typeof acuerdos === "string" ? acuerdos.trim() || null : null,
    };
    const contact = await prisma.contactoPersonal.upsert({
      where: { alumnoId_numero: { alumnoId, numero } },
      create: { alumnoId, numero, ...payload },
      update: payload,
    });
    res.json(contact);
  } catch (error) { next(error); }
});

personalTutoringRouter.delete("/students/:id/contacts/:number", async (req, res, next) => {
  try {
    const alumnoId = Number(req.params.id), numero = Number(req.params.number);
    if (!Number.isSafeInteger(alumnoId) || alumnoId < 1 ||
      !GUIAS.some(guia => guia.numero === numero)) {
      res.status(400).json({ error: "Identificadores no válidos." }); return;
    }
    const existing = await prisma.contactoPersonal.findUnique({
      where: { alumnoId_numero: { alumnoId, numero } }, select: { id: true },
    });
    if (!existing) { res.status(404).json({ error: "Contacto no registrado." }); return; }
    await prisma.contactoPersonal.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (error) { next(error); }
});
