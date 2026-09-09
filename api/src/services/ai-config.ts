import { promises as fs } from "fs";
import path from "path";

export type AiConfig = {
  enabled: boolean;
  baseUrl: string;
  model: string;
};

const DEFAULT_CONFIG: AiConfig = {
  enabled: true,
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:8b",
};

const CONFIG_PATH = path.resolve(process.cwd(), "data", "ai-config.json");

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function validateLocalOllamaUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("La URL de Ollama no es válida");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error("Por privacidad, Tutor UTAMED sólo permite Ollama ejecutándose en este equipo (localhost/127.0.0.1)");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("La URL de Ollama debe usar http o https");
  }
}

export async function readAiConfig(): Promise<AiConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const saved = JSON.parse(raw) as Partial<AiConfig>;
    const config: AiConfig = {
      enabled: saved.enabled ?? DEFAULT_CONFIG.enabled,
      baseUrl: normalizeBaseUrl(saved.baseUrl || DEFAULT_CONFIG.baseUrl),
      model: (saved.model || DEFAULT_CONFIG.model).trim(),
    };
    validateLocalOllamaUrl(config.baseUrl);
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("No se pudo leer la configuración de IA; se usarán valores por defecto:", error);
    }
    return DEFAULT_CONFIG;
  }
}

export async function writeAiConfig(input: Partial<AiConfig>): Promise<AiConfig> {
  const current = await readAiConfig();
  const next: AiConfig = {
    enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    baseUrl: normalizeBaseUrl(typeof input.baseUrl === "string" ? input.baseUrl : current.baseUrl),
    model: (typeof input.model === "string" ? input.model : current.model).trim(),
  };

  validateLocalOllamaUrl(next.baseUrl);
  if (!next.model) throw new Error("Debes indicar un modelo de Ollama");

  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
