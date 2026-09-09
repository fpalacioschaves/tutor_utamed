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

const REPO_ROOT = path.resolve(__dirname, "../../..");
const DATA_ROOT = path.join(REPO_ROOT, "local-data");
const TEXT_ROOT = path.resolve(DATA_ROOT, "material-text");
const REGISTRY_PATH = path.join(DATA_ROOT, "materials.json");
const MAX_AI_CONTEXT_CHARS = 70_000;

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

export async function buildUnitAssociatedFilesContext(unitId: number) {
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

  const chunks: string[] = [];
  const sources: Array<{ id: string; name: string; extractedChars: number }> = [];
  let usedChars = 0;
  let truncated = false;

  for (let index = 0; index < usable.length; index += 1) {
    const { material, text } = usable[index];
    const header = `\n\n===== ARCHIVO ASOCIADO ${index + 1}/${usable.length}: ${material.originalName} =====\n`;
    const remainingFiles = usable.length - index;
    const remainingGlobal = MAX_AI_CONTEXT_CHARS - usedChars - header.length;

    if (remainingGlobal <= 0) {
      truncated = true;
      break;
    }

    const currentLimit = Math.max(1, Math.floor(remainingGlobal / remainingFiles));
    const slice = text.slice(0, currentLimit);

    if (slice.length < text.length) truncated = true;
    chunks.push(`${header}${slice}`);
    usedChars += header.length + slice.length;
    sources.push({ id: material.id, name: material.originalName, extractedChars: slice.length });
  }

  return { text: chunks.join(""), sources, truncated };
}
