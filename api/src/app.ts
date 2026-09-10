import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { coursesRouter } from "./routes/courses";
import { groupsRouter } from "./routes/groups";
import { contentsRouter } from "./routes/contents";
import { dashboardRouter } from "./routes/dashboard";
import { enrollmentsRouter } from "./routes/enrollments";
import { studentsRouter } from "./routes/students";
import { subjectsRouter } from "./routes/subjects";
import { reportsRouter } from "./routes/reports";
import { sessionsRouter } from "./routes/sessions";
import { activitiesRouter } from "./routes/activities";
import { tutorialsRouter } from "./routes/tutorials";
import { followUpsRouter } from "./routes/followups";
import { incidentsRouter } from "./routes/incidents";
import { communicationsRouter } from "./routes/communications";
import { alertsRouter } from "./routes/alerts";
import { aiRouter } from "./routes/ai";
import { unitAiRouter } from "./routes/unit-ai";
import { materialsRouter } from "./routes/materials";
import { calendarRouter } from "./routes/calendar";

export const app = express();

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "36mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "Tutor UTAMED API", version: "0.18.0" });
});

app.use("/api/courses", coursesRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/contents", contentsRouter);
app.use("/api/materials", materialsRouter);
app.use("/api/subjects", subjectsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/tutorials", tutorialsRouter);
app.use("/api/follow-ups", followUpsRouter);
app.use("/api/incidents", incidentsRouter);
app.use("/api/communications", communicationsRouter);
app.use("/api/alerts", alertsRouter);
// Esta ruta debe ir antes del router general de IA: intercepta exclusivamente
// /api/ai/units/:id/generate con el nuevo contexto por relevancia.
app.use("/api/ai/units", unitAiRouter);
app.use("/api/ai", aiRouter);
app.use("/api/students", studentsRouter);
app.use("/api/enrollments", enrollmentsRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({ error: "Ya existe un registro con esos datos." });
      return;
    }
    if (error.code === "P2003") {
      res.status(400).json({ error: "La operación hace referencia a un dato que no existe o ya no está disponible." });
      return;
    }
  }

  res.status(500).json({ error: "Error interno del servidor" });
};

app.use(errorHandler);
