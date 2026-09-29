import { Router } from "express";
import { prisma } from "../lib/prisma";

export const communicationsRouter = Router();

const DIRECTIONS = new Set(["ENTRANTE", "SALIENTE"]);

function parseDate(value: unknown) {
  if (!value) return new Date();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseOptionalId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDirection(value: unknown) {
  const direction = String(value ?? "SALIENTE").toUpperCase();
  return DIRECTIONS.has(direction) ? direction as "ENTRANTE" | "SALIENTE" : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

async function fullThread(id: number) {
  return prisma.hiloComunicacion.findUnique({
    where: { id },
    include: {
      alumno: true,
      asignatura: true,
      interacciones: {
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      },
    },
  });
}

// ---------------------------------------------------------------------------
// HILOS
// ---------------------------------------------------------------------------

communicationsRouter.get("/threads", async (_req, res, next) => {
  try {
    const threads = await prisma.hiloComunicacion.findMany({
      include: {
        alumno: true,
        asignatura: true,
        interacciones: {
          orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    threads.sort((a, b) => {
      const aDate = a.interacciones[0]?.fecha ?? a.createdAt;
      const bDate = b.interacciones[0]?.fecha ?? b.createdAt;
      return bDate.getTime() - aDate.getTime();
    });

    res.json(threads);
  } catch (error) {
    next(error);
  }
});

communicationsRouter.get("/threads/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador de hilo no válido" });
      return;
    }

    const thread = await fullThread(id);
    if (!thread) {
      res.status(404).json({ error: "Hilo de comunicación no encontrado" });
      return;
    }

    res.json(thread);
  } catch (error) {
    next(error);
  }
});

communicationsRouter.post("/threads", async (req, res, next) => {
  try {
    const {
      alumnoId,
      asignaturaId,
      asunto,
      fecha,
      direccion,
      canal,
      resumen,
      observaciones,
    } = req.body;

    const studentId = Number(alumnoId);
    const subjectId = parseOptionalId(asignaturaId);
    const direction = parseDirection(direccion);
    const subject = cleanText(asunto);
    const channel = cleanText(canal);
    const summary = cleanText(resumen);
    const notes = cleanText(observaciones);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      res.status(400).json({ error: "Debes seleccionar un alumno" });
      return;
    }
    if (!subject) {
      res.status(400).json({ error: "El asunto del hilo es obligatorio" });
      return;
    }
    if (!direction) {
      res.status(400).json({ error: "El tipo de interacción debe ser entrante o saliente" });
      return;
    }
    if (!channel) {
      res.status(400).json({ error: "El canal es obligatorio" });
      return;
    }
    if (!summary) {
      res.status(400).json({ error: "El contenido o resumen es obligatorio" });
      return;
    }

    const threadId = await prisma.$transaction(async (tx) => {
      const thread = await tx.hiloComunicacion.create({
        data: {
          alumnoId: studentId,
          asignaturaId: subjectId,
          asunto: subject,
        },
      });

      await tx.comunicacion.create({
        data: {
          hiloId: thread.id,
          alumnoId: studentId,
          asignaturaId: subjectId,
          fecha: parseDate(fecha),
          direccion: direction,
          canal: channel,
          motivo: subject,
          resumen: summary,
          observaciones: notes,
        },
      });

      return thread.id;
    });

    res.status(201).json(await fullThread(threadId));
  } catch (error) {
    next(error);
  }
});

communicationsRouter.post("/threads/:id/interactions", async (req, res, next) => {
  try {
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId) || threadId <= 0) {
      res.status(400).json({ error: "Identificador de hilo no válido" });
      return;
    }

    const thread = await prisma.hiloComunicacion.findUnique({ where: { id: threadId } });
    if (!thread) {
      res.status(404).json({ error: "Hilo de comunicación no encontrado" });
      return;
    }

    const { fecha, direccion, canal, resumen, observaciones } = req.body;
    const direction = parseDirection(direccion);
    const channel = cleanText(canal);
    const summary = cleanText(resumen);
    const notes = cleanText(observaciones);

    if (!direction) {
      res.status(400).json({ error: "El tipo de interacción debe ser entrante o saliente" });
      return;
    }
    if (!channel) {
      res.status(400).json({ error: "El canal es obligatorio" });
      return;
    }
    if (!summary) {
      res.status(400).json({ error: "El contenido o resumen es obligatorio" });
      return;
    }

    const interaction = await prisma.comunicacion.create({
      data: {
        hiloId: thread.id,
        alumnoId: thread.alumnoId,
        asignaturaId: thread.asignaturaId,
        fecha: parseDate(fecha),
        direccion: direction,
        canal: channel,
        motivo: thread.asunto,
        resumen: summary,
        observaciones: notes,
      },
      include: { alumno: true, asignatura: true, hilo: true },
    });

    res.status(201).json(interaction);
  } catch (error) {
    next(error);
  }
});

communicationsRouter.put("/interactions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador de interacción no válido" });
      return;
    }

    const current = await prisma.comunicacion.findUnique({
      where: { id },
      include: { hilo: true },
    });
    if (!current) {
      res.status(404).json({ error: "Interacción no encontrada" });
      return;
    }

    const { fecha, direccion, canal, resumen, observaciones } = req.body;
    const direction = parseDirection(direccion);
    const channel = cleanText(canal);
    const summary = cleanText(resumen);
    const notes = cleanText(observaciones);

    if (!direction) {
      res.status(400).json({ error: "El tipo de interacción debe ser entrante o saliente" });
      return;
    }
    if (!channel) {
      res.status(400).json({ error: "El canal es obligatorio" });
      return;
    }
    if (!summary) {
      res.status(400).json({ error: "El contenido o resumen es obligatorio" });
      return;
    }

    const interaction = await prisma.comunicacion.update({
      where: { id },
      data: {
        fecha: parseDate(fecha),
        direccion: direction,
        canal: channel,
        motivo: current.hilo?.asunto ?? current.motivo,
        resumen: summary,
        observaciones: notes,
      },
      include: { alumno: true, asignatura: true, hilo: true },
    });

    res.json(interaction);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// ENDPOINTS PLANOS ANTERIORES
// Se conservan para no romper otras pantallas ni integraciones existentes.
// Cada alta nueva crea automáticamente un hilo con una primera interacción.
// ---------------------------------------------------------------------------

communicationsRouter.get("/", async (req, res, next) => {
  try {
    const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
    const communications = await prisma.comunicacion.findMany({
      where: studentId ? { alumnoId: studentId } : undefined,
      include: { alumno: true, asignatura: true, hilo: true },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    });
    res.json(communications);
  } catch (error) {
    next(error);
  }
});

communicationsRouter.post("/", async (req, res, next) => {
  try {
    const {
      alumnoId,
      asignaturaId,
      fecha,
      direccion,
      canal,
      motivo,
      resumen,
      observaciones,
    } = req.body;

    const studentId = Number(alumnoId);
    const subjectId = parseOptionalId(asignaturaId);
    const direction = parseDirection(direccion);
    const channel = cleanText(canal);
    const subject = cleanText(motivo) ?? "Comunicación";
    const summary = cleanText(resumen);
    const notes = cleanText(observaciones);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      res.status(400).json({ error: "Debes seleccionar un alumno" });
      return;
    }
    if (!direction) {
      res.status(400).json({ error: "El tipo de interacción debe ser entrante o saliente" });
      return;
    }
    if (!channel) {
      res.status(400).json({ error: "El canal es obligatorio" });
      return;
    }

    const communicationId = await prisma.$transaction(async (tx) => {
      const thread = await tx.hiloComunicacion.create({
        data: {
          alumnoId: studentId,
          asignaturaId: subjectId,
          asunto: subject,
        },
      });
      const communication = await tx.comunicacion.create({
        data: {
          hiloId: thread.id,
          alumnoId: studentId,
          asignaturaId: subjectId,
          fecha: parseDate(fecha),
          direccion: direction,
          canal: channel,
          motivo: subject,
          resumen: summary,
          observaciones: notes,
        },
      });
      return communication.id;
    });

    const communication = await prisma.comunicacion.findUnique({
      where: { id: communicationId },
      include: { alumno: true, asignatura: true, hilo: true },
    });
    res.status(201).json(communication);
  } catch (error) {
    next(error);
  }
});

communicationsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const {
      alumnoId,
      asignaturaId,
      fecha,
      direccion,
      canal,
      motivo,
      resumen,
      observaciones,
    } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador de comunicación no válido" });
      return;
    }

    const current = await prisma.comunicacion.findUnique({ where: { id } });
    if (!current) {
      res.status(404).json({ error: "Comunicación no encontrada" });
      return;
    }

    const studentId = alumnoId === undefined ? current.alumnoId : Number(alumnoId);
    const subjectId = asignaturaId === undefined ? current.asignaturaId : parseOptionalId(asignaturaId);
    const direction = parseDirection(direccion ?? current.direccion);
    const channel = cleanText(canal ?? current.canal);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      res.status(400).json({ error: "Debes seleccionar un alumno" });
      return;
    }
    if (!direction || !channel) {
      res.status(400).json({ error: "Dirección y canal son obligatorios" });
      return;
    }

    const communication = await prisma.comunicacion.update({
      where: { id },
      data: {
        alumnoId: studentId,
        asignaturaId: subjectId,
        fecha: fecha === undefined ? current.fecha : parseDate(fecha),
        direccion: direction,
        canal: channel,
        motivo: motivo === undefined ? current.motivo : cleanText(motivo),
        resumen: resumen === undefined ? current.resumen : cleanText(resumen),
        observaciones: observaciones === undefined ? current.observaciones : cleanText(observaciones),
      },
      include: { alumno: true, asignatura: true, hilo: true },
    });

    res.json(communication);
  } catch (error) {
    next(error);
  }
});
