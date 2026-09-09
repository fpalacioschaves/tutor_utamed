import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export type GeneratedTeachingMode = "EXERCISES" | "SOLVED_EXERCISE" | "PRACTICE" | "EXPLANATION" | "REVIEW";

export type GeneratedResource = {
  id: string;
  unitId: number;
  mode: GeneratedTeachingMode;
  title: string;
  model: string;
  instruction: string | null;
  sources: Array<{ id: string; name: string; extractedChars: number }>;
  relativePath: string;
  createdAt: string;
};

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONTENT_ROOT = path.join(REPO_ROOT, "local-content", "generated-resources");
const DATA_ROOT = path.join(REPO_ROOT, "local-data");
const REGISTRY_PATH = path.join(DATA_ROOT, "generated-resources.json");

async function ensureStorage() {
  await Promise.all([
    fs.mkdir(CONTENT_ROOT, { recursive: true }),
    fs.mkdir(DATA_ROOT, { recursive: true }),
  ]);
}

async function readRegistry(): Promise<GeneratedResource[]> {
  await ensureStorage();
  try {
    const raw = await fs.readFile(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeRegistry(resources: GeneratedResource[]) {
  await ensureStorage();
  const temporary = `${REGISTRY_PATH}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(resources, null, 2)}\n`, "utf8");
  await fs.rename(temporary, REGISTRY_PATH);
}

function publicResource(resource: GeneratedResource) {
  const { relativePath: _relativePath, ...publicFields } = resource;
  return publicFields;
}

function modeLabel(mode: GeneratedTeachingMode) {
  if (mode === "SOLVED_EXERCISE") return "Ejercicio resuelto";
  if (mode === "PRACTICE") return "Práctica";
  if (mode === "EXPLANATION") return "Explicación docente";
  if (mode === "REVIEW") return "Repaso";
  return "Ejercicios";
}

function safeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase() || "recurso";
}

export async function saveGeneratedResource(input: {
  unitId: number;
  unitOrder: number;
  unitTitle: string;
  mode: GeneratedTeachingMode;
  model: string;
  instruction?: string;
  sources: Array<{ id: string; name: string; extractedChars: number }>;
  content: string;
}) {
  await ensureStorage();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const title = `${modeLabel(input.mode)} · U${input.unitOrder} · ${input.unitTitle}`;
  const directory = path.join(CONTENT_ROOT, `unit-${input.unitId}`);
  await fs.mkdir(directory, { recursive: true });

  const stamp = createdAt.replace(/[:.]/g, "-");
  const filename = `${stamp}-${safeFilePart(modeLabel(input.mode))}-${id.slice(0, 8)}.md`;
  const absolutePath = path.join(directory, filename);
  const markdown = [
    `# ${title}`,
    "",
    `Generado: ${createdAt}`,
    `Modelo: ${input.model}`,
    input.sources.length ? `Fuentes: ${input.sources.map((source) => source.name).join(", ")}` : "Fuentes: descripción de la unidad",
    input.instruction?.trim() ? `Instrucción adicional: ${input.instruction.trim()}` : "",
    "",
    input.content.trim(),
    "",
  ].filter(Boolean).join("\n");

  await fs.writeFile(absolutePath, markdown, "utf8");

  const resource: GeneratedResource = {
    id,
    unitId: input.unitId,
    mode: input.mode,
    title,
    model: input.model,
    instruction: input.instruction?.trim() || null,
    sources: input.sources,
    relativePath: path.relative(REPO_ROOT, absolutePath),
    createdAt,
  };

  const resources = await readRegistry();
  resources.push(resource);
  await writeRegistry(resources);
  return publicResource(resource);
}

export async function listGeneratedResources(unitId?: number) {
  const resources = await readRegistry();
  return resources
    .filter((resource) => unitId === undefined || resource.unitId === unitId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicResource);
}

export async function getGeneratedResource(id: string) {
  const resources = await readRegistry();
  return resources.find((resource) => resource.id === id) ?? null;
}

export function absoluteGeneratedResourcePath(resource: GeneratedResource) {
  const absolute = path.resolve(REPO_ROOT, resource.relativePath);
  const root = path.resolve(CONTENT_ROOT) + path.sep;
  if (!absolute.startsWith(root)) throw new Error("Ruta local de recurso no válida");
  return absolute;
}

export async function removeGeneratedResource(id: string) {
  const resources = await readRegistry();
  const resource = resources.find((item) => item.id === id);
  if (!resource) return false;

  await fs.rm(absoluteGeneratedResourcePath(resource), { force: true }).catch(() => undefined);
  await writeRegistry(resources.filter((item) => item.id !== id));
  return true;
}
