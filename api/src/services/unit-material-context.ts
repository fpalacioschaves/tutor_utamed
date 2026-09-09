import { promises as fs } from "fs";
import path from "path";

type StoredMaterialRecord = {
  id: string;
  unitId: number;
  originalName: string;
  extractedTextPath: string | null;
  extractionStatus: "READY" | "UNSUPPORTED" | "EMPTY" | "ERROR";
  createdAt: string;
};

type LoadedMaterial = {
  material: StoredMaterialRecord;
  text: string;
};

type RankedChunk = {
  material: StoredMaterialRecord;
  text: string;
  score: number;
  index: number;
};

const REPO_ROOT = path.resolve(__dirname, "../../..");
const DATA_ROOT = path.join(REPO_ROOT, "local-data");
const TEXT_ROOT = path.resolve(DATA_ROOT, "material-text");
const REGISTRY_PATH = path.join(DATA_ROOT, "materials.json");

// El contexto debe ser suficientemente pequeño para que un Ollama con ventana
// modesta no recorte la petición del profesor. La selección por relevancia permite
// trabajar con PDFs grandes sin enviar el documento completo en cada consulta.
const MAX_AI_CONTEXT_CHARS = 12_000;
const CHUNK_SIZE = 1_400;
const CHUNK_OVERLAP = 180;
const MAX_CHUNKS_PER_FILE = 5;

const STOP_WORDS = new Set([
  "para", "como", "con", "sin", "del", "las", "los", "una", "uno", "unos", "unas", "que", "por", "sobre",
  "esta", "este", "estos", "estas", "unidad", "tema", "tematica", "contenido", "contenidos", "archivo", "archivos",
  "haz", "hacer", "dame", "quiero", "puedes", "podrias", "genera", "generar", "crea", "crear", "prepara", "preparar",
  "explica", "explicar", "resume", "resumir", "ejercicio", "ejercicios", "practica", "practicas", "ejemplo", "ejemplos",
  "pregunta", "preguntas", "solo", "solamente", "unicamente", "usando", "utiliza", "utilizando", "material", "profesor",
]);

async function readRegistry(): Promise<StoredMaterialRecord[]> {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function safeTextPath(relativePath: string) {
  const absolute = path.resolve(REPO_ROOT, relativePath);
  const allowedRoot = `${TEXT_ROOT}${path.sep}`;
  if (!absolute.startsWith(allowedRoot)) throw new Error("Ruta local de texto de material no válida");
  return absolute;
}

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function queryTerms(query: string) {
  const normalized = normalizeForSearch(query);
  return Array.from(new Set(
    normalized
      .split(/[^a-z0-9_+#.-]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)),
  )).slice(0, 24);
}

function splitIntoChunks(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + CHUNK_SIZE);

    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf("\n\n", end);
      const sentenceBreak = normalized.lastIndexOf(". ", end);
      const candidate = Math.max(paragraphBreak, sentenceBreak);
      if (candidate > start + Math.floor(CHUNK_SIZE * 0.55)) {
        end = candidate + (candidate === sentenceBreak ? 1 : 0);
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }

  return chunks;
}

function scoreChunk(chunk: string, terms: string[], normalizedQuery: string) {
  if (terms.length === 0) return 0;
  const normalized = normalizeForSearch(chunk);
  let score = 0;

  for (const term of terms) {
    let position = normalized.indexOf(term);
    let occurrences = 0;
    while (position >= 0 && occurrences < 8) {
      occurrences += 1;
      position = normalized.indexOf(term, position + term.length);
    }
    if (occurrences > 0) score += 4 + Math.min(occurrences, 4) * 2;
  }

  const matchedTerms = terms.filter((term) => normalized.includes(term)).length;
  score += matchedTerms * matchedTerms;

  const compactQuery = normalizedQuery.trim();
  if (compactQuery.length >= 8 && compactQuery.length <= 120 && normalized.includes(compactQuery)) {
    score += 25;
  }

  return score;
}

function distributedFallback(ranked: RankedChunk[]) {
  const byFile = new Map<string, RankedChunk[]>();
  for (const chunk of ranked) {
    const items = byFile.get(chunk.material.id) ?? [];
    items.push(chunk);
    byFile.set(chunk.material.id, items);
  }

  const result: RankedChunk[] = [];
  const added = new Set<string>();
  const positions = [0, 0.5, 1, 0.25, 0.75];

  for (const items of byFile.values()) {
    items.sort((a, b) => a.index - b.index);
    for (const ratio of positions) {
      const target = Math.round((items.length - 1) * ratio);
      const chunk = items[target];
      if (!chunk) continue;
      const key = `${chunk.material.id}:${chunk.index}`;
      if (!added.has(key)) {
        added.add(key);
        result.push(chunk);
      }
    }
  }

  for (const chunk of ranked) {
    const key = `${chunk.material.id}:${chunk.index}`;
    if (!added.has(key)) {
      added.add(key);
      result.push(chunk);
    }
  }

  return result;
}

function rankChunks(materials: LoadedMaterial[], query: string) {
  const terms = queryTerms(query);
  const normalizedQuery = normalizeForSearch(query);
  const ranked: RankedChunk[] = [];

  for (const item of materials) {
    const chunks = splitIntoChunks(item.text);
    chunks.forEach((chunk, index) => {
      ranked.push({
        material: item.material,
        text: chunk,
        score: scoreChunk(chunk, terms, normalizedQuery),
        index,
      });
    });
  }

  if (terms.length === 0 || ranked.every((chunk) => chunk.score === 0)) {
    return distributedFallback(ranked);
  }

  return ranked.sort((a, b) => b.score - a.score || a.index - b.index);
}

export async function buildUnitAssociatedFilesContext(unitId: number, query = "") {
  const materials = (await readRegistry())
    .filter((material) => (
      material.unitId === unitId
      && material.extractionStatus === "READY"
      && Boolean(material.extractedTextPath)
    ))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const loaded = await Promise.all(materials.map(async (material) => {
    if (!material.extractedTextPath) return { material, text: "" };
    const text = await fs.readFile(safeTextPath(material.extractedTextPath), "utf8").catch(() => "");
    return { material, text: text.trim() };
  }));

  const usable = loaded.filter((item) => item.text.length > 0);
  if (usable.length === 0) {
    return {
      text: "",
      sources: [] as Array<{ id: string; name: string; extractedChars: number }>,
      truncated: false,
    };
  }

  const finalRequest = query.trim()
    ? `\n\n===== PETICIÓN PRIORITARIA DEL PROFESOR =====\n${query.trim()}\n===== FIN DE LA PETICIÓN =====\n`
    : "";
  const contextBudget = Math.max(4_000, MAX_AI_CONTEXT_CHARS - finalRequest.length);
  const ranked = rankChunks(usable, query);
  const selected: RankedChunk[] = [];
  const selectedKeys = new Set<string>();
  const countByFile = new Map<string, number>();
  let usedChars = 0;

  function trySelect(chunk: RankedChunk) {
    const key = `${chunk.material.id}:${chunk.index}`;
    if (selectedKeys.has(key)) return false;
    const fileCount = countByFile.get(chunk.material.id) ?? 0;
    if (fileCount >= MAX_CHUNKS_PER_FILE) return false;

    const header = `\n\n===== ${chunk.material.originalName} · fragmento ${chunk.index + 1} =====\n`;
    if (usedChars + header.length + chunk.text.length > contextBudget) return false;

    selected.push(chunk);
    selectedKeys.add(key);
    countByFile.set(chunk.material.id, fileCount + 1);
    usedChars += header.length + chunk.text.length;
    return true;
  }

  // Garantiza al menos el fragmento más relevante de cada archivo asociado.
  for (const item of usable) {
    const bestForFile = ranked.find((chunk) => chunk.material.id === item.material.id);
    if (bestForFile) trySelect(bestForFile);
  }

  for (const chunk of ranked) {
    trySelect(chunk);
  }

  // Una vez seleccionados por relevancia, los presentamos en orden documental.
  selected.sort((a, b) => {
    const fileOrder = a.material.createdAt.localeCompare(b.material.createdAt);
    return fileOrder || a.index - b.index;
  });

  const sourcesMap = new Map<string, { id: string; name: string; extractedChars: number }>();
  const chunks = selected.map((chunk) => {
    const current = sourcesMap.get(chunk.material.id) ?? {
      id: chunk.material.id,
      name: chunk.material.originalName,
      extractedChars: 0,
    };
    current.extractedChars += chunk.text.length;
    sourcesMap.set(chunk.material.id, current);
    return `\n\n===== ${chunk.material.originalName} · fragmento ${chunk.index + 1} =====\n${chunk.text}`;
  });

  const totalOriginalChars = usable.reduce((sum, item) => sum + item.text.length, 0);
  const totalSelectedChars = selected.reduce((sum, item) => sum + item.text.length, 0);

  return {
    // La petición se repite al final deliberadamente: así permanece visible incluso
    // si Ollama tuviera que recortar parte del principio del prompt.
    text: `${chunks.join("")}${finalRequest}`,
    sources: Array.from(sourcesMap.values()),
    truncated: totalSelectedChars < totalOriginalChars,
  };
}
