import { useEffect, useRef, useState } from "react";

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

type TeachingMode = "EXERCISES" | "SOLVED_EXERCISE" | "PRACTICE" | "EXPLANATION" | "REVIEW";

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

const AI_ACTIONS: Array<{ mode: TeachingMode; label: string }> = [
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
      setMessage(files.length === 1 ? "Material añadido correctamente." : `${files.length} materiales añadidos correctamente.`);
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
        throw new Error(body.error ?? "No se pudo generar el recurso docente");
      }
      setAiResult(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el recurso docente");
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
                <strong>Material docente local</strong>
                <small>Se guarda únicamente en este ordenador y nunca en GitHub.</small>
              </div>
              <label className={uploading ? "secondary compact-button disabled" : "secondary compact-button upload-label"}>
                {uploading ? "Añadiendo…" : "+ Añadir material"}
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
            )}
          </section>

          <section className="unit-tools-section unit-ai-section">
            <div className="unit-tools-heading">
              <div>
                <strong>Herramientas docentes con Ollama</strong>
                <small>La IA utiliza la descripción de la unidad y el texto extraído de los materiales locales.</small>
              </div>
            </div>

            <label className="unit-ai-instruction">
              Instrucción adicional (opcional)
              <textarea
                rows={2}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Ej. Nivel inicial, sin usar arrays todavía; prepara la práctica para 45 minutos…"
              />
            </label>

            <div className="unit-ai-actions">
              {AI_ACTIONS.map((action) => (
                <button
                  className={action.mode === "EXERCISES" ? "primary compact-button" : "secondary compact-button"}
                  key={action.mode}
                  type="button"
                  disabled={aiLoading !== null}
                  onClick={() => void generate(action.mode)}
                >
                  {aiLoading === action.mode ? "Generando…" : action.label}
                </button>
              ))}
            </div>

            {aiResult && (
              <article className="unit-ai-result">
                <div className="unit-ai-result-heading">
                  <div>
                    <strong>Resultado generado</strong>
                    <small>
                      Modelo: {aiResult.model} · {aiResult.sources.length} material{aiResult.sources.length === 1 ? "" : "es"} utilizado{aiResult.sources.length === 1 ? "" : "s"}
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
