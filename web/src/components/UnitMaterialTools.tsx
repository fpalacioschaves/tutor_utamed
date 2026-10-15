import { useEffect, useRef, useState } from "react";

type MaterialItem = {
  id: string;
  unitId: number;
  originalName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type Props = {
  unit: {
    id: number;
    orden: number;
    titulo: string;
  };
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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

  return (
    <div className="unit-material-tools">
      <button className="unit-tools-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>Material docente</span>
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
                  {materials.length} archivo{materials.length === 1 ? "" : "s"} asociado{materials.length === 1 ? "" : "s"}
                </p>
                <div className="unit-material-list">
                  {materials.map((material) => (
                    <article className="unit-material-row" key={material.id}>
                      <div>
                        <strong>{material.originalName}</strong>
                        <small>{formatBytes(material.sizeBytes)}</small>
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

          {error && <p className="notice-banner error" role="alert">{error}</p>}
          {message && <p className="save-message success" role="status">{message}</p>}
        </div>
      )}
    </div>
  );
}
