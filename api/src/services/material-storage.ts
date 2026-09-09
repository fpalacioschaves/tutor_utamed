import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { inflateRawSync } from "zlib";

export type MaterialExtractionStatus = "READY" | "UNSUPPORTED" | "EMPTY" | "ERROR";

export type StoredMaterial = {
  id: string;
  unitId: number;
  originalName: string;
  storedName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  relativePath: string;
  extractedTextPath: string | null;
  extractionStatus: MaterialExtractionStatus;
  extractionMessage: string | null;
  extractedChars: number;
  createdAt: string;
};

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONTENT_ROOT = path.join(REPO_ROOT, "local-content");
const DATA_ROOT = path.join(REPO_ROOT, "local-data");
const TEXT_ROOT = path.join(DATA_ROOT, "material-text");
const REGISTRY_PATH = path.join(DATA_ROOT, "materials.json");
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 400_000;
const MAX_AI_CONTEXT_CHARS = 70_000;

const PLAIN_TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".json", ".csv", ".sql", ".js", ".jsx", ".ts", ".tsx",
  ".java", ".php", ".css", ".scss", ".py", ".xml", ".html", ".htm", ".xhtml",
]);

const MARKUP_EXTENSIONS = new Set([".xml", ".html", ".htm", ".xhtml"]);

async function ensureStorage() {
  await Promise.all([
    fs.mkdir(CONTENT_ROOT, { recursive: true }),
    fs.mkdir(DATA_ROOT, { recursive: true }),
    fs.mkdir(TEXT_ROOT, { recursive: true }),
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

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function markupToText(value: string) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeText(value: string) {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim().slice(0, MAX_EXTRACTED_CHARS);
}

type ZipEntry = { name: string; data: Buffer };

function findEndOfCentralDirectory(buffer: Buffer) {
  const signature = 0x06054b50;
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) === signature) return index;
  }
  return -1;
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error("El archivo ZIP no tiene una estructura reconocible");

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  let expandedBytes = 0;

  for (let count = 0; count < totalEntries; count += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");

    cursor += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/") || uncompressedSize > 8 * 1024 * 1024) continue;
    if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else continue;

    expandedBytes += data.length;
    if (expandedBytes > 30 * 1024 * 1024) throw new Error("El archivo comprimido es demasiado grande al descomprimirse");
    entries.push({ name, data });
  }

  return entries;
}

function extractZipText(buffer: Buffer, extension: string) {
  const entries = readZipEntries(buffer);
  const selected: ZipEntry[] = [];

  if (extension === ".docx") {
    for (const entry of entries) {
      if (/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(entry.name)) selected.push(entry);
    }
  } else if (extension === ".odt") {
    const content = entries.find((entry) => entry.name.toLowerCase() === "content.xml");
    if (content) selected.push(content);
  } else {
    for (const entry of entries) {
      const lower = entry.name.toLowerCase();
      if (/\.(html?|xhtml|xml|txt|md|markdown)$/i.test(lower) && !lower.includes("meta-inf/")) selected.push(entry);
    }
  }

  const text = selected
    .map((entry) => {
      const raw = entry.data.toString("utf8");
      const ext = path.extname(entry.name).toLowerCase();
      return MARKUP_EXTENSIONS.has(ext) || ext === ".xml" ? markupToText(raw) : raw;
    })
    .filter(Boolean)
    .join("\n\n");

  return normalizeText(text);
}

function extractText(buffer: Buffer, extension: string) {
  if (PLAIN_TEXT_EXTENSIONS.has(extension)) {
    const raw = buffer.toString("utf8");
    return normalizeText(MARKUP_EXTENSIONS.has(extension) ? markupToText(raw) : raw);
  }

  if ([".docx", ".odt", ".elp", ".zip"].includes(extension)) {
    return extractZipText(buffer, extension);
  }

  return "";
}

function publicMaterial(material: StoredMaterial) {
  const { relativePath: _relativePath, extractedTextPath: _extractedTextPath, storedName: _storedName, ...publicFields } = material;
  return publicFields;
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

  let extractedTextPath: string | null = null;
  let extractionStatus: MaterialExtractionStatus = "UNSUPPORTED";
  let extractionMessage: string | null = "Archivo guardado. Este formato no tiene extracción automática de texto.";
  let extractedChars = 0;

  try {
    const text = extractText(buffer, extension);
    if (text) {
      const textFile = `${id}.txt`;
      const absoluteTextPath = path.join(TEXT_ROOT, textFile);
      await fs.writeFile(absoluteTextPath, text, "utf8");
      extractedTextPath = path.relative(REPO_ROOT, absoluteTextPath);
      extractedChars = text.length;
      extractionStatus = "READY";
      extractionMessage = null;
    } else if (PLAIN_TEXT_EXTENSIONS.has(extension) || [".docx", ".odt", ".elp", ".zip"].includes(extension)) {
      extractionStatus = "EMPTY";
      extractionMessage = "El archivo se guardó, pero no se encontró texto utilizable.";
    }
  } catch (error) {
    extractionStatus = "ERROR";
    extractionMessage = error instanceof Error ? error.message : "No se pudo extraer el texto";
  }

  const material: StoredMaterial = {
    id,
    unitId: input.unitId,
    originalName,
    storedName,
    extension,
    mimeType: input.mimeType?.trim() || "application/octet-stream",
    sizeBytes: buffer.length,
    relativePath: path.relative(REPO_ROOT, absolutePath),
    extractedTextPath,
    extractionStatus,
    extractionMessage,
    extractedChars,
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

export function absoluteMaterialPath(material: StoredMaterial) {
  const absolute = path.resolve(REPO_ROOT, material.relativePath);
  const contentRoot = path.resolve(CONTENT_ROOT) + path.sep;
  if (!absolute.startsWith(contentRoot)) throw new Error("Ruta local de material no válida");
  return absolute;
}

export async function removeMaterial(id: string) {
  const materials = await readRegistry();
  const material = materials.find((item) => item.id === id);
  if (!material) return false;

  await fs.rm(absoluteMaterialPath(material), { force: true }).catch(() => undefined);
  if (material.extractedTextPath) {
    const textPath = path.resolve(REPO_ROOT, material.extractedTextPath);
    await fs.rm(textPath, { force: true }).catch(() => undefined);
  }

  await writeRegistry(materials.filter((item) => item.id !== id));
  return true;
}

export async function buildUnitMaterialContext(unitId: number) {
  const materials = (await readRegistry())
    .filter((material) => material.unitId === unitId && material.extractionStatus === "READY" && material.extractedTextPath)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const sources: Array<{ id: string; name: string; extractedChars: number }> = [];
  const chunks: string[] = [];
  let usedChars = 0;
  let truncated = false;

  for (const material of materials) {
    if (!material.extractedTextPath) continue;
    const textPath = path.resolve(REPO_ROOT, material.extractedTextPath);
    const raw = await fs.readFile(textPath, "utf8").catch(() => "");
    if (!raw) continue;

    const header = `\n\n===== MATERIAL: ${material.originalName} =====\n`;
    const remaining = MAX_AI_CONTEXT_CHARS - usedChars - header.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const slice = raw.slice(0, remaining);
    if (slice.length < raw.length) truncated = true;
    chunks.push(`${header}${slice}`);
    usedChars += header.length + slice.length;
    sources.push({ id: material.id, name: material.originalName, extractedChars: slice.length });
    if (truncated) break;
  }

  return { text: chunks.join(""), sources, truncated };
}
