import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export type StoredMaterial = {
  id: string;
  unitId: number;
  originalName: string;
  storedName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  relativePath: string;
  createdAt: string;
  // Campo legado para poder limpiar textos extraídos por versiones anteriores.
  extractedTextPath?: string | null;
};

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONTENT_ROOT = path.join(REPO_ROOT, "local-content");
const DATA_ROOT = path.join(REPO_ROOT, "local-data");
const REGISTRY_PATH = path.join(DATA_ROOT, "materials.json");
const MAX_FILE_BYTES = 25 * 1024 * 1024;

async function ensureStorage() {
  await Promise.all([
    fs.mkdir(CONTENT_ROOT, { recursive: true }),
    fs.mkdir(DATA_ROOT, { recursive: true }),
  ]);
}

async function readRegistry(): Promise<StoredMaterial[]> {
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

async function writeRegistry(materials: StoredMaterial[]) {
  await ensureStorage();
  const temporary = `${REGISTRY_PATH}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(materials, null, 2)}\n`, "utf8");
  await fs.rename(temporary, REGISTRY_PATH);
}

function publicMaterial(material: StoredMaterial) {
  return {
    id: material.id,
    unitId: material.unitId,
    originalName: material.originalName,
    extension: material.extension,
    mimeType: material.mimeType,
    sizeBytes: material.sizeBytes,
    createdAt: material.createdAt,
  };
}

export function absoluteMaterialPath(material: StoredMaterial) {
  const absolute = path.resolve(REPO_ROOT, material.relativePath);
  const contentRoot = path.resolve(CONTENT_ROOT) + path.sep;
  if (!absolute.startsWith(contentRoot)) throw new Error("Ruta local de material no válida");
  return absolute;
}

export async function listMaterials(unitId: number) {
  const materials = await readRegistry();
  return materials
    .filter((material) => material.unitId === unitId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicMaterial);
}

export async function saveMaterial(input: {
  unitId: number;
  originalName: string;
  mimeType?: string;
  base64: string;
}) {
  await ensureStorage();
  const originalName = path.basename(input.originalName.trim());
  if (!originalName) throw new Error("El archivo necesita un nombre");

  const base64 = input.base64.includes(",") ? input.base64.slice(input.base64.indexOf(",") + 1) : input.base64;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) throw new Error("El archivo está vacío");
  if (buffer.length > MAX_FILE_BYTES) throw new Error("El archivo supera el máximo de 25 MB");

  const extension = path.extname(originalName).toLowerCase().slice(0, 12);
  const id = randomUUID();
  const storedName = `${id}${extension}`;
  const unitDirectory = path.join(CONTENT_ROOT, `unit-${input.unitId}`);
  await fs.mkdir(unitDirectory, { recursive: true });

  const absolutePath = path.join(unitDirectory, storedName);
  await fs.writeFile(absolutePath, buffer);

  const material: StoredMaterial = {
    id,
    unitId: input.unitId,
    originalName,
    storedName,
    extension,
    mimeType: input.mimeType?.trim() || "application/octet-stream",
    sizeBytes: buffer.length,
    relativePath: path.relative(REPO_ROOT, absolutePath),
    createdAt: new Date().toISOString(),
  };

  const materials = await readRegistry();
  materials.push(material);
  await writeRegistry(materials);
  return publicMaterial(material);
}

export async function getStoredMaterial(id: string) {
  const materials = await readRegistry();
  return materials.find((material) => material.id === id) ?? null;
}

export async function removeMaterial(id: string) {
  const materials = await readRegistry();
  const material = materials.find((item) => item.id === id);
  if (!material) return false;

  await fs.rm(absoluteMaterialPath(material), { force: true }).catch(() => undefined);

  if (material.extractedTextPath) {
    const legacyTextPath = path.resolve(REPO_ROOT, material.extractedTextPath);
    const legacyDataRoot = path.resolve(DATA_ROOT) + path.sep;
    if (legacyTextPath.startsWith(legacyDataRoot)) {
      await fs.rm(legacyTextPath, { force: true }).catch(() => undefined);
    }
  }

  await writeRegistry(materials.filter((item) => item.id !== id));
  return true;
}
