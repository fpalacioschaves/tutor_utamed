import { useEffect, useRef, useState } from "react";
import { AIConfigInline } from "./AIConfigInline";

type MaterialItem = {
  id: string;
  unitId: number;
  originalName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: "READY" | "UNSUPPORTED" | "EMPTY" | "ERROR";
  extractionMessage: string | null;
  extractedChars: number;
  createdAt: string;
};

type TeachingMode = "CUSTOM" | "EXERCISES" | "SOLVED_EXERCISE" | "PRACTICE" | "EXPLANATION" | "REVIEW";

type AiResult = {
  mode: TeachingMode;
  model: string;
  content: string;
  sources: Array<{ id: string; name: string; extractedChars: number }>;
  truncated: boolean;
  generatedAt: string;
};

type Props = {
  unit: {
    id: number;
    orden: number;
    titulo: string;
  };
};

const AI_ACTIONS: Array<{ mode: Exclude<TeachingMode, "CUSTOM">; label: string }> = [
  { mode: "EXERCISES", label: "Generar ejercicios" },
  { mode: "SOLVED_EXERCISE", label: "Ejercicio resuelto" },
  { mode: "PRACTICE", label: "Crear práctica" },
  { mode: "EXPLANATION", label: "Preparar explicación" },
  { mode: "REVIEW", label: "Generar repaso" },
];

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function extractionLabel(material: MaterialItem) {
  if (material.extractionStatus === "READY") return `${material.extractedChars.toLocaleString("es-ES")} caracteres preparados para IA`;
  if (material.extractionStatus === "EMPTY") return "Sin texto utilizable";
  if (material.extractionStatus === "ERROR") return "Error al procesar el texto";
  return "Guardado · sin extracción automática";
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function UnitMaterialTools({ unit }: Props) {
  const [open, setOpen] = useState(false);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [aiLoading, setAiLoading] = useState<TeachingMode | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [instruction, setInstruction] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function loadMaterials() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/materials?unitId=${unit.id}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron cargar los materiales");
      }
      setMaterials(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los materiales");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadMaterials();
  }, [open, unit.id]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} supera el máximo de 25 MB`);
        const base64 = await fileToDataUrl(file);
        const response = await fetch("/api/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitId: unit.id,
            originalName: file.name,
            mimeType: file.type || "application/octet-stream",
            base64,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `No se pudo guardar ${file.name}`);
        }
      }
      if (inputRef.current) inputRef.current.value = "";
      await loadMaterials();
      setMessage(files.length === 1 ? "Material asociado correctamente." : `${files.length} materiales asociados correctamente.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron añadir los materiales");
    } finally {
      setUploading(false);
    }
  }

  async function deleteMaterial(material: MaterialItem) {
    if (!window.confirm(`¿Eliminar el material “${material.originalName}” de esta unidad?`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/materials/${material.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo eliminar el material");
      }
      await loadMaterials();
      setMessage("Material eliminado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el material");
    }
  }

  async function generate(mode: TeachingMode) {
    if (mode === "CUSTOM" && !instruction.trim()) {
      setError("Escribe qué quieres pedir a la IA sobre esta unidad.");
      return;
    }

    setAiLoading(mode);
    setAiResult(null);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/ai/units/${unit.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, instruction }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo generar la respuesta");
      }
      setAiResult(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la respuesta");
    } finally {
      setAiLoading(null);
    }
  }

  async function copyResult() {
    if (!aiResult) return;
    try {
      await navigator.clipboard.writeText(aiResult.content);
      setMessage("Resultado copiado al portapapeles.");
    } catch {
      setMessage("No se pudo copiar automáticamente. Puedes seleccionar el texto manualmente.");
    }
  }

  const readyMaterials = materials.filter((material) => material.extractionStatus === "READY");

  return (
    <div className="unit-material-tools">
      <button className="unit-tools-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>Material docente e IA</span>
        <span>{open ? "Cerrar" : "Abrir"}</span>
      </button>

      {open && (
        <div className="unit-tools-body">
          <section className="unit-tools-section">
            <div className="unit-tools-heading">
              <div>
                <strong>Archivos asociados a esta unidad</strong>
                <small>Puede haber uno o varios. Se guardan únicamente en este ordenador y nunca en GitHub.</small>
              </div>
              <label className={uploading ? "secondary compact-button disabled" : "secondary compact-button upload-label"}>
                {uploading ? "Añadiendo…" : "+ Asociar archivos"}
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  disabled={uploading}
                  accept=".txt,.md,.markdown,.html,.htm,.xhtml,.xml,.json,.csv,.sql,.js,.jsx,.ts,.tsx,.java,.php,.css,.py,.docx,.odt,.elp,.zip,.pdf"
                  onChange={(event) => void uploadFiles(event.target.files)}
                />
              </label>
            </div>

            {loading ? (
              <p className="muted">Cargando materiales…</p>
            ) : materials.length === 0 ? (
              <div className="unit-material-empty">Todavía no hay archivos asociados a esta unidad.</div>
            ) : (
              <>
                <p className="muted">
                  {materials.length} archivo{materials.length === 1 ? "" : "s"} asociado{materials.length === 1 ? "" : "s"} · {readyMaterials.length} preparado{readyMaterials.length === 1 ? "" : "s"} para IA
                </p>
                <div className="unit-material-list">
                  {materials.map((material) => (
                    <article className="unit-material-row" key={material.id}>
                      <div>
                        <strong>{material.originalName}</strong>
                        <small>{formatBytes(material.sizeBytes)} · {extractionLabel(material)}</small>
                        {material.extractionMessage && <small className="material-warning">{material.extractionMessage}</small>}
                      </div>
                      <div className="row-actions">
                        <a className="secondary compact-button material-link" href={`/api/materials/${material.id}/file`} target="_blank" rel="noreferrer">Abrir</a>
                        <button className="text-button content-delete" type="button" onClick={() => void deleteMaterial(material)}>Eliminar</button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="unit-tools-section unit-ai-section">
            <div className="unit-tools-heading">
              <div>
                <strong>Preguntar a la IA sobre esta unidad</strong>
                <small>Ollama utilizará automáticamente todos los archivos de esta unidad que estén preparados para IA.</small>
              </div>
              <button
                className="secondary compact-button"
                type="button"
                onClick={() => setConfigOpen((value) => !value)}
              >
                {configOpen ? "Ocultar configuración" : "Configurar IA"}
              </button>
            </div>

            {configOpen && <AIConfigInline onClose={() => setConfigOpen(false)} />}

            <label className="unit-ai-instruction">
              ¿Qué quieres hacer con esta unidad?
              <textarea
                rows={4}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Ej. Genera 4 ejercicios únicamente sobre arrays bidimensionales; prepara una explicación de XPath; crea una práctica de 45 minutos sobre esta temática…"
              />
            </label>

            <div className="unit-ai-actions">
              <button
                className="primary compact-button"
                type="button"
                disabled={aiLoading !== null || !instruction.trim() || readyMaterials.length === 0}
                onClick={() => void generate("CUSTOM")}
              >
                {aiLoading === "CUSTOM" ? "Consultando…" : "Preguntar a la IA"}
              </button>
            </div>

            <div className="unit-ai-presets">
              <small className="muted">Accesos rápidos opcionales</small>
              <div className="unit-ai-actions">
                {AI_ACTIONS.map((action) => (
                  <button
                    className="secondary compact-button"
                    key={action.mode}
                    type="button"
                    disabled={aiLoading !== null || readyMaterials.length === 0}
                    onClick={() => void generate(action.mode)}
                  >
                    {aiLoading === action.mode ? "Generando…" : action.label}
                  </button>
                ))}
              </div>
            </div>

            {readyMaterials.length === 0 && materials.length > 0 && (
              <p className="material-warning">Ningún archivo de esta unidad está preparado todavía para IA.</p>
            )}

            {aiResult && (
              <article className="unit-ai-result">
                <div className="unit-ai-result-heading">
                  <div>
                    <strong>Respuesta de la IA</strong>
                    <small>
                      Modelo: {aiResult.model} · {aiResult.sources.length} archivo{aiResult.sources.length === 1 ? "" : "s"} utilizado{aiResult.sources.length === 1 ? "" : "s"}
                      {aiResult.truncated ? " · contexto recortado por longitud" : ""}
                    </small>
                  </div>
                  <button className="secondary compact-button" type="button" onClick={() => void copyResult()}>Copiar</button>
                </div>
                <pre>{aiResult.content}</pre>
              </article>
            )}
          </section>

          {error && <p className="notice-banner error" role="alert">{error}</p>}
          {message && <p className="save-message success" role="status">{message}</p>}
        </div>
      )}
    </div>
  );
}
