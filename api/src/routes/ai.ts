import { Router } from "express";
import { buildStudentAiContext } from "../services/student-ai-context";
import { readAiConfig, validateLocalOllamaUrl, writeAiConfig } from "../services/ai-config";

export const aiRouter = Router();

type AnalysisMode = "SUMMARY" | "TUTORIAL" | "EVOLUTION";

function cleanModelOutput(value: string) {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function modeInstruction(mode: AnalysisMode) {
  if (mode === "TUTORIAL") {
    return `Prepara la próxima tutoría individual del alumno. Organiza la respuesta en: 1) asuntos prioritarios, 2) evidencias concretas recientes, 3) acuerdos o seguimientos anteriores que conviene comprobar, 4) preguntas útiles para la tutoría y 5) próximos pasos razonables. No inventes problemas ni atribuyas causas que los datos no demuestran.`;
  }
  if (mode === "EVOLUTION") {
    return `Analiza la evolución académica del alumno a lo largo del tiempo. Señala tendencias observables en asistencia, actividades/calificaciones, observaciones de clase, tutorías, seguimientos e incidencias. Distingue claramente entre mejora, empeoramiento, estabilidad o falta de datos. No atribuyas causas psicológicas, personales o familiares salvo que estén literalmente registradas.`;
  }
  return `Redacta un resumen académico actual del alumno. Incluye situación general, asistencia separando ausencias justificadas y no justificadas, actividades y notas, dificultades o avances que aparezcan de forma reiterada en las observaciones, tutorías, seguimientos e incidencias pendientes. Termina con una sección breve de asuntos que requieren atención. Si no hay datos suficientes para algo, dilo.`;
}

function systemPrompt(mode: AnalysisMode) {
  return `Eres el asistente académico privado de un profesor. Analizas exclusivamente los datos estructurados que te proporciona Tutor UTAMED.

REGLAS OBLIGATORIAS:
- No inventes hechos, notas, diagnósticos, explicaciones ni motivos.
- No hagas inferencias sobre salud, personalidad, familia, capacidad intelectual ni circunstancias personales.
- No confundas ausencia justificada con ausencia no justificada: trátalas siempre por separado.
- Si un dato no aparece, responde que no consta o que no hay información suficiente.
- Cuando afirmes una tendencia, apóyala en evidencias concretas (fechas, actividades, observaciones o recuentos cuando existan).
- No decidas aprobados/suspensos ni sustituyas el criterio profesional del profesor.
- Responde en español, con redacción clara, directa y útil para un profesor.
- No muestres razonamiento interno ni cadenas de pensamiento.

TAREA:
${modeInstruction(mode)}`;
}

async function ollamaRequest(url: string, init: RequestInit, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

aiRouter.get("/config", async (_req, res, next) => {
  try {
    res.json(await readAiConfig());
  } catch (error) {
    next(error);
  }
});

aiRouter.put("/config", async (req, res) => {
  try {
    const config = await writeAiConfig({
      enabled: req.body.enabled,
      baseUrl: req.body.baseUrl,
      model: req.body.model,
    });
    res.json(config);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo guardar la configuración de IA" });
  }
});

aiRouter.post("/test", async (req, res) => {
  try {
    const saved = await readAiConfig();
    const baseUrl = String(req.body.baseUrl || saved.baseUrl).trim().replace(/\/+$/, "");
    const model = String(req.body.model || saved.model).trim();
    validateLocalOllamaUrl(baseUrl);

    const response = await ollamaRequest(`${baseUrl}/api/tags`, { method: "GET" }, 10_000);
    if (!response.ok) throw new Error(`Ollama respondió con HTTP ${response.status}`);
    const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = (body.models ?? []).map((item) => item.name || item.model).filter((item): item is string => Boolean(item));
    const modelAvailable = model ? models.some((item) => item === model || item.startsWith(`${model}:`)) : true;
    res.json({ ok: true, models, modelAvailable });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Ollama no respondió a tiempo"
      : error instanceof Error ? error.message : "No se pudo conectar con Ollama";
    res.status(503).json({ error: message });
  }
});

aiRouter.post("/students/:id/analyze", async (req, res, next) => {
  try {
    const studentId = Number(req.params.id);
    const mode = String(req.body.mode || "SUMMARY").toUpperCase() as AnalysisMode;
    if (!Number.isInteger(studentId)) {
      res.status(400).json({ error: "Identificador de alumno no válido" });
      return;
    }
    if (!(["SUMMARY", "TUTORIAL", "EVOLUTION"] as string[]).includes(mode)) {
      res.status(400).json({ error: "Tipo de análisis no válido" });
      return;
    }

    const config = await readAiConfig();
    if (!config.enabled) {
      res.status(409).json({ error: "La IA está desactivada en Configuración de IA" });
      return;
    }
    validateLocalOllamaUrl(config.baseUrl);

    const studentData = await buildStudentAiContext(studentId);
    if (!studentData) {
      res.status(404).json({ error: "Alumno no encontrado" });
      return;
    }

    const response = await ollamaRequest(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt(mode) },
          {
            role: "user",
            content: `Estos son los únicos datos que puedes utilizar. Analízalos según la tarea indicada.\n\nDATOS DEL ALUMNO:\n${JSON.stringify(studentData.context, null, 2)}`,
          },
        ],
        options: { temperature: 0.15 },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama respondió con HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }

    const body = (await response.json()) as { message?: { content?: string }; response?: string };
    const content = cleanModelOutput(body.message?.content || body.response || "");
    if (!content) throw new Error("Ollama no devolvió contenido");

    res.json({
      mode,
      model: config.model,
      content,
      dataUsed: studentData.usage,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "La IA ha tardado demasiado en responder"
      : error instanceof Error ? error.message : "No se pudo generar el análisis";
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      res.status(503).json({ error: "No se puede conectar con Ollama. Comprueba que está ejecutándose en tu equipo." });
      return;
    }
    if (message.startsWith("Ollama respondió")) {
      res.status(502).json({ error: message });
      return;
    }
    next(error);
  }
});
