import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createBackup } from "../routes/backups";

const ROOT = path.resolve(__dirname, "../../..");
const BACKUPS = path.join(ROOT, "local-backups");
const CONFIG = path.join(ROOT, "local-data", "drive-sync-settings.json");
const EXT = ".utamed.enc";
const MAX_RAW_BYTES = 150 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 170 * 1024 * 1024;

type SyncConfig = { folder: string };
type Entry = { name: string; data: string };
type Bundle = { format: "utamed-backup-v1"; createdAt: string; entries: Entry[] };
type Envelope = { format: "utamed-encrypted-v1"; salt: string; iv: string; tag: string; ciphertext: string };

function checkPassphrase(passphrase: unknown): asserts passphrase is string {
  if (typeof passphrase !== "string" || passphrase.length < 12) {
    throw new Error("La contraseña de cifrado debe tener al menos 12 caracteres.");
  }
}
function basenameSafe(name: string) {
  if (!/^tutor-utamed-[0-9TZ-]+-[a-f0-9]{12}\.utamed\.enc$/.test(name)) {
    throw new Error("Nombre de archivo de sincronización no válido.");
  }
  return name;
}
async function isDirectory(folder: string) {
  const stat = await fs.stat(folder).catch(() => null);
  return Boolean(stat?.isDirectory());
}
export async function readDriveConfig(): Promise<SyncConfig> {
  try {
    const parsed = JSON.parse(await fs.readFile(CONFIG, "utf8"));
    return { folder: typeof parsed.folder === "string" ? parsed.folder : "" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { folder: "" };
    throw error;
  }
}
export async function writeDriveConfig(value: unknown): Promise<SyncConfig> {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error("Indica la ruta absoluta de una carpeta local sincronizada por Google Drive para ordenadores.");
  }
  const folder = path.resolve(value);
  if (folder === path.parse(folder).root || folder.startsWith(ROOT + path.sep)) {
    throw new Error("La carpeta de Drive debe estar fuera del proyecto y no puede ser la raíz de un disco.");
  }
  if (!(await isDirectory(folder))) throw new Error("La carpeta indicada no existe o no está disponible.");
  const cfg = { folder };
  await fs.mkdir(path.dirname(CONFIG), { recursive: true });
  await fs.writeFile(CONFIG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return cfg;
}
async function configuredFolder() {
  const { folder } = await readDriveConfig();
  if (!folder || !(await isDirectory(folder))) throw new Error("Configura primero una carpeta de Google Drive disponible en este equipo.");
  return folder;
}
async function collectFiles(root: string) {
  const result: Entry[] = [];
  let total = 0;
  async function walk(directory: string, relative: string) {
    for (const dirent of await fs.readdir(directory, { withFileTypes: true })) {
      if (dirent.isSymbolicLink()) throw new Error("La copia contiene un enlace simbólico no permitido.");
      const rel = relative ? relative + "/" + dirent.name : dirent.name;
      const absolute = path.join(directory, dirent.name);
      if (dirent.isDirectory()) {
        await walk(absolute, rel);
      } else if (dirent.isFile()) {
        const size = (await fs.stat(absolute)).size;
        total += size;
        if (total > MAX_RAW_BYTES) throw new Error("La copia supera el límite de 150 MB para esta primera versión.");
        result.push({ name: rel, data: (await fs.readFile(absolute)).toString("base64") });
      }
    }
  }
  await walk(root, "");
  return result;
}
function encrypt(bundle: Bundle, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: Envelope = {
    format: "utamed-encrypted-v1",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return Buffer.from(JSON.stringify(envelope), "utf8");
}
function decrypt(buffer: Buffer, passphrase: string): Bundle {
  let envelope: Envelope;
  try { envelope = JSON.parse(buffer.toString("utf8")) as Envelope; }
  catch { throw new Error("No es un archivo de sincronización válido."); }
  if (envelope.format !== "utamed-encrypted-v1") throw new Error("Versión de copia cifrada no compatible.");
  try {
    const salt = Buffer.from(envelope.salt, "base64");
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error("Datos criptográficos incorrectos");
    const decipher = createDecipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
    decipher.setAuthTag(tag);
    const compressed = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    const bundle = JSON.parse(gunzipSync(compressed, { maxOutputLength: 220 * 1024 * 1024 }).toString("utf8")) as Bundle;
    if (bundle.format !== "utamed-backup-v1" || !Array.isArray(bundle.entries)) throw new Error("Estructura no reconocida");
    return bundle;
  } catch {
    throw new Error("No se pudo descifrar la copia. Comprueba la contraseña y la integridad del archivo.");
  }
}
export async function listDrivePackages() {
  const folder = await configuredFolder();
  const names = (await fs.readdir(folder)).filter(name => name.endsWith(EXT));
  const items = [];
  for (const name of names) {
    if (!/^tutor-utamed-[0-9TZ-]+-[a-f0-9]{12}\.utamed\.enc$/.test(name)) continue;
    const stat = await fs.lstat(path.join(folder, name));
    if (stat.isFile()) items.push({ name, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() });
  }
  return items.sort((a,b)=>b.name.localeCompare(a.name));
}
export async function exportDrivePackage(passphrase: unknown) {
  checkPassphrase(passphrase);
  const folder = await configuredFolder();
  const backup = await createBackup("MANUAL");
  const backupDirectory = path.join(BACKUPS, backup.name);
  const bundle: Bundle = { format: "utamed-backup-v1", createdAt: backup.createdAt, entries: await collectFiles(backupDirectory) };
  const encrypted = encrypt(bundle, passphrase);
  if (encrypted.length > MAX_PACKAGE_BYTES) throw new Error("La copia cifrada es demasiado grande para la primera versión.");
  const name = "tutor-utamed-" + backup.createdAt.replace(/[:.]/g, "-") + "-" + randomBytes(6).toString("hex") + EXT;
  const destination = path.join(folder, name);
  const temp = destination + ".pending";
  try {
    await fs.writeFile(temp, encrypted, { flag: "wx" });
    await fs.rename(temp, destination);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
  return { name, createdAt: backup.createdAt, sizeBytes: encrypted.length, localBackup: backup.name };
}
export async function importDrivePackage(nameValue: unknown, passphrase: unknown) {
  checkPassphrase(passphrase);
  const name = basenameSafe(String(nameValue || ""));
  const folder = await configuredFolder();
  const source = path.join(folder, name);
  const stat = await fs.lstat(source);
  if (!stat.isFile() || stat.size > MAX_PACKAGE_BYTES) throw new Error("El archivo es demasiado grande o no es válido.");
  const bundle = decrypt(await fs.readFile(source), passphrase);
  const sourceManifest = bundle.entries.find(e => e.name === "manifest.json");
  const sourceDatabase = bundle.entries.find(e => e.name === "dev.db");
  if (!sourceManifest || !sourceDatabase || !Buffer.from(sourceDatabase.data, "base64").subarray(0,16).equals(Buffer.from("SQLite format 3\u0000"))) {
    throw new Error("La copia no contiene una base de datos válida.");
  }
  const manifest = JSON.parse(Buffer.from(sourceManifest.data, "base64").toString("utf8"));
  if (!manifest?.includes?.database || typeof manifest.createdAt !== "string") throw new Error("Manifiesto de copia inválido.");
  // Cada recuperación crea una copia local nueva sin sobrescribir ningún archivo.
  const restoreName = "backup-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomBytes(4).toString("hex");
  const staging = path.join(BACKUPS, restoreName);
  await fs.mkdir(staging, { recursive: false });
  try {
    let total = 0;
    const seen = new Set<string>();
    for (const entry of bundle.entries) {
      if (!entry || typeof entry.name !== "string" || typeof entry.data !== "string") throw new Error("Entrada inválida.");
      const parts = entry.name.split("/");
      if (parts.some(p => !p || p === "." || p === ".." || p.includes("\\") || p.includes(":"))) throw new Error("Ruta de archivo no permitida.");
      const rel = parts.join("/");
      if (seen.has(rel)) throw new Error("Archivo duplicado en la copia.");
      seen.add(rel);
      const data = Buffer.from(entry.data, "base64");
      total += data.length;
      if (total > MAX_RAW_BYTES) throw new Error("La copia excede el límite de tamaño.");
      const target = path.resolve(staging, ...parts);
      if (!target.startsWith(staging + path.sep)) throw new Error("Ruta fuera de copia.");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data, { flag: "wx" });
    }
    manifest.name = restoreName;
    manifest.relativePath = path.join("local-backups", restoreName);
    manifest.kind = "MANUAL";
    await fs.writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2));
    return { name: restoreName, createdAt: bundle.createdAt };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}
