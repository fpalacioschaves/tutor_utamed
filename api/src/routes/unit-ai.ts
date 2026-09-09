import { Router } from "express";
import { prisma } from "../lib/prisma";
import { buildUnitAssociatedFilesContext } from "../services/unit-material-context";
import { readAiConfig, validateLocalOllamaUrl } from "../services/ai-config";

export const unitAiRouter = Router();

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

function taskForMode(mode: TeachingMode) {
  if (mode === "SOLVED_EXERCISE") {
    return "Crea un ejercicio representativo de dificultad media y ofrece después una solución completa y explicada paso a paso. Usa únicamente contenidos presentes en los archivos de esta unidad.";
  }
  if (mode === "PRACTICE") {
    return "Diseña una práctica de aproximadamente 60 minutos basada únicamente en los archivos de esta unidad. Incluye objetivo, enunciado para el alumnado, tareas ordenadas y solución guía separada.";
  }
  if (mode === "EXPLANATION") {
    return "Prepara una explicación docente clara y progresiva de esta unidad, con ejemplos compatibles con los archivos asociados y sin introducir temario posterior.";
  }
  if (mode === "REVIEW") {
    return "Prepara un repaso de esta unidad con ideas esenciales, cinco preguntas de comprobación y tres ejercicios cortos con guía de respuestas.";
  }
  if (mode === "EXERCISES") {
    return "Genera cinco ejercicios progresivos basados únicamente en los archivos de esta unidad e incluye al final una guía de solución para el profesor.";
  }
  return "";
}

function systemPrompt() {
  return `Eres un asistente privado de preparación docente para un profesor de Formación Profesional.

REGLAS OBLIGATORIAS:
- La PETICIÓN ACTUAL DEL PROFESOR es la instrucción principal y debes responder exactamente a ella.
- Trabaja únicamente con los fragmentos de los archivos asociados a la unidad que aparecen en el mensaje.
- Si el profesor pide una temática concreta, céntrate exclusivamente en esa temática.
- No conviertas una petición libre en un resumen genérico de la unidad.
- No introduzcas conceptos, APIs, sintaxis, patrones o contenidos que no estén presentes o claramente presupuestos por los materiales.
- Si los fragmentos disponibles no permiten responder, dilo claramente en vez de inventar.
- Distingue el material destinado al alumnado de las soluciones o notas para el profesor cuando corresponda.
- Responde en español.
- No muestres razonamiento interno ni cadenas de pensamiento.`;
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

unitAiRouter.post("/:id/generate", async (req, res) => {
  try {
    const unitId = Number(req.params.id);
    const mode = String(req.body?.mode || "CUSTOM").toUpperCase() as TeachingMode;
    const freeRequest = typeof req.body?.instruction === "string" ? req.body.instruction.trim().slice(0, 4000) : "";

    if (!Number.isInteger(unitId) || unitId < 1) {
      res.status(400).json({ error: "Identificador de unidad no válido" });
      return;
    }
    if (!TEACHING_MODES.has(mode)) {
      res.status(400).json({ error: "Tipo de generación docente no válido" });
      return;
    }

    const request = mode === "CUSTOM" ? freeRequest : (freeRequest || taskForMode(mode));
    if (!request) {
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

    // La consulta concreta se usa para localizar los fragmentos relevantes dentro
    // de los PDF/documentos asociados, en lugar de enviar siempre el inicio del archivo.
    const materials = await buildUnitAssociatedFilesContext(unitId, request);
    if (!materials.text) {
      res.status(409).json({
        error: "Esta unidad no tiene archivos asociados preparados para IA. Añade o procesa al menos un material antes de consultar.",
      });
      return;
    }

    const unitContext = [
      `Asignatura: ${unit.asignatura.nombre}${unit.asignatura.grupo ? ` · ${unit.asignatura.grupo}` : ""}`,
      `Unidad: U${unit.orden} · ${unit.titulo}`,
      unit.descripcion ? `Descripción: ${unit.descripcion}` : "",
    ].filter(Boolean).join("\n");

    const userPrompt = `${unitContext}\n\nFRAGMENTOS RELEVANTES DE LOS ARCHIVOS ASOCIADOS:${materials.text}\n\n===== PETICIÓN ACTUAL DEL PROFESOR =====\n${request}\n===== FIN DE LA PETICIÓN =====\n\nResponde ahora a esta petición concreta. No hagas un resumen general salvo que se haya solicitado explícitamente.`;

    const response = await ollamaRequest(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: userPrompt },
        ],
        options: {
          temperature: mode === "CUSTOM" ? 0.15 : 0.2,
          num_ctx: 8192,
        },
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
