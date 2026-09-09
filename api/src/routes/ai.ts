import { Router } from "express";
import { prisma } from "../lib/prisma";
import { buildStudentAiContext } from "../services/student-ai-context";
import { buildUnitAssociatedFilesContext } from "../services/unit-material-context";
import { readAiConfig, validateLocalOllamaUrl, writeAiConfig } from "../services/ai-config";

export const aiRouter = Router();

type AnalysisMode = "SUMMARY" | "TUTORIAL" | "EVOLUTION";
type TeachingMode = "CUSTOM" | "EXERCISES" | "SOLVED_EXERCISE" | "PRACTICE" | "EXPLANATION" | "REVIEW";

const TEACHING_MODES = new Set<TeachingMode>([
  "CUSTOM",
  "EXERCISES",
  "SOLVED_EXERCISE",
  "PRACTICE",
  "EXPLANATION",
  "REVIEW",
]);

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

function teachingInstruction(mode: TeachingMode) {
  if (mode === "CUSTOM") {
    return `Atiende exactamente la petición libre del profesor. Puede pedir una explicación, ejercicios sobre una temática concreta, una práctica, ejemplos, un resumen, una comparación o cualquier otro recurso docente. La petición concreta aparecerá en el mensaje del usuario. Responde basándote en los archivos asociados a esta unidad y no amplíes el temario por tu cuenta.`;
  }
  if (mode === "SOLVED_EXERCISE") {
    return `Crea un ejercicio representativo de dificultad media y después ofrece una solución completa y explicada paso a paso para el profesor. No utilices conocimientos que no aparezcan en los materiales.`;
  }
  if (mode === "PRACTICE") {
    return `Diseña una práctica de aproximadamente 60 minutos. Incluye objetivo, conocimientos previos estrictamente necesarios, enunciado para el alumnado, tareas ordenadas, criterios de comprobación y una solución guía completa separada al final.`;
  }
  if (mode === "EXPLANATION") {
    return `Prepara una explicación docente clara y progresiva de la unidad. Empieza por la idea general, desarrolla los conceptos en orden, incorpora ejemplos compatibles con los materiales y termina señalando errores frecuentes que puedan deducirse del contenido. No añadas temario posterior.`;
  }
  if (mode === "REVIEW") {
    return `Prepara un repaso breve de la unidad: ideas esenciales, relaciones entre conceptos, cinco preguntas de comprobación y tres ejercicios cortos. Añade al final una guía de respuestas para el profesor.`;
  }
  return `Genera cinco ejercicios progresivos, desde una aplicación básica hasta una tarea integradora. Para cada ejercicio indica qué se practica y redacta el enunciado. Después incluye una sección separada con solución o guía de solución para el profesor.`;
}

function teachingSystemPrompt(mode: TeachingMode) {
  return `Eres un asistente privado de preparación docente para un profesor de Formación Profesional.

REGLAS OBLIGATORIAS:
- Trabaja exclusivamente con la unidad y los materiales locales suministrados.
- Considera conjuntamente todos los archivos asociados a la unidad que Tutor UTAMED te proporciona.
- Si el profesor pide una temática concreta, localízala dentro de esos materiales y céntrate en ella.
- No introduzcas conceptos, APIs, sintaxis, patrones o contenidos que no estén presentes o claramente presupuestos por esos materiales.
- Si la petición no puede responderse con el material disponible, indícalo claramente en vez de inventar contenido.
- Los ejercicios y prácticas deben ser realizables con lo que aparece en los materiales de la unidad.
- Distingue claramente el material destinado al alumnado de las soluciones o notas destinadas al profesor cuando corresponda.
- Responde en español y con formato claro para poder reutilizar el resultado en clase.
- No muestres razonamiento interno ni cadenas de pensamiento.

TAREA:
${teachingInstruction(mode)}`;
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

function handleAiError(error: unknown) {
  const message = error instanceof Error && error.name === "AbortError"
    ? "La IA ha tardado demasiado en responder"
    : error instanceof Error ? error.message : "No se pudo generar el contenido";

  if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
    return { status: 503, message: "No se puede conectar con Ollama. Comprueba que está ejecutándose en tu equipo." };
  }
  if (message.startsWith("Ollama respondió")) return { status: 502, message };
  return { status: 500, message };
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

aiRouter.post("/units/:id/generate", async (req, res) => {
  try {
    const unitId = Number(req.params.id);
    const mode = String(req.body?.mode || "CUSTOM").toUpperCase() as TeachingMode;
    const extraInstruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim().slice(0, 4000) : "";

    if (!Number.isInteger(unitId)) {
      res.status(400).json({ error: "Identificador de unidad no válido" });
      return;
    }
    if (!TEACHING_MODES.has(mode)) {
      res.status(400).json({ error: "Tipo de generación docente no válido" });
      return;
    }
    if (mode === "CUSTOM" && !extraInstruction) {
      res.status(400).json({ error: "Escribe qué quieres pedir a la IA sobre esta unidad" });
      return;
    }

    const unit = await prisma.unidad.findUnique({
      where: { id: unitId },
      include: { asignatura: { select: { nombre: true, grupo: true } } },
    });
    if (!unit) {
      res.status(404).json({ error: "Unidad no encontrada" });
      return;
    }

    const config = await readAiConfig();
    if (!config.enabled) {
      res.status(409).json({ error: "La IA está desactivada. Actívala primero en la pantalla IA." });
      return;
    }
    validateLocalOllamaUrl(config.baseUrl);

    const materials = await buildUnitAssociatedFilesContext(unitId);
    const unitContext = [
      `Asignatura: ${unit.asignatura.nombre}${unit.asignatura.grupo ? ` · ${unit.asignatura.grupo}` : ""}`,
      `Unidad: U${unit.orden} · ${unit.titulo}`,
      unit.descripcion ? `Descripción de la unidad: ${unit.descripcion}` : "",
      unit.observaciones ? `Observaciones del profesor: ${unit.observaciones}` : "",
      unit.horasPrevistas !== null ? `Horas previstas: ${unit.horasPrevistas}` : "",
    ].filter(Boolean).join("\n");

    if (!materials.text) {
      res.status(409).json({
        error: "Esta unidad no tiene archivos asociados preparados para IA. Añade o procesa al menos un material antes de consultar.",
      });
      return;
    }

    const professorRequest = extraInstruction
      ? `PETICIÓN DEL PROFESOR:\n${extraInstruction}\n\n`
      : "";

    const response = await ollamaRequest(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages: [
          { role: "system", content: teachingSystemPrompt(mode) },
          {
            role: "user",
            content: `${unitContext}\n\n${professorRequest}ARCHIVOS ASOCIADOS A LA UNIDAD:${materials.text}`,
          },
        ],
        options: { temperature: mode === "CUSTOM" ? 0.2 : 0.25 },
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
      sources: materials.sources,
      truncated: materials.truncated,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const handled = handleAiError(error);
    res.status(handled.status).json({ error: handled.message });
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
    const handled = handleAiError(error);
    if (handled.status !== 500) {
      res.status(handled.status).json({ error: handled.message });
      return;
    }
    next(error);
  }
});
