import { useEffect, useState } from "react";

type BackupInfo = {
  name: string;
  createdAt: string;
  relativePath: string;
  sizeBytes: number;
  includes: {
    database: boolean;
    localContent: boolean;
    localData: boolean;
  };
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function BackupSettings() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupsRoot, setBackupsRoot] = useState("local-backups");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/backups");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar las copias de seguridad");
      setBackups(Array.isArray(body.backups) ? body.backups : []);
      setBackupsRoot(body.backupsRoot || "local-backups");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las copias de seguridad");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createBackup() {
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/backups", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo crear la copia de seguridad");
      setMessage("Copia de seguridad creada correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la copia de seguridad");
    } finally {
      setCreating(false);
    }
  }

  const latest = backups[0] ?? null;

  return (
    <section className="panel backup-settings-panel">
      <div className="panel-heading backup-heading">
        <div>
          <p className="eyebrow">SEGURIDAD DE DATOS</p>
          <h3>Copias de seguridad</h3>
          <p className="muted">Guarda una copia local de la base de datos, los materiales docentes y los datos auxiliares de Tutor UTAMED.</p>
        </div>
        <button className="primary" type="button" onClick={() => void createBackup()} disabled={creating}>
          {creating ? "Creando copia…" : "Crear copia de seguridad"}
        </button>
      </div>

      {message && <div className="notice-banner success" role="status">{message}</div>}
      {error && <div className="notice-banner error" role="alert">{error}</div>}

      <div className="backup-summary">
        <div>
          <span>Última copia</span>
          <strong>{latest ? formatDate(latest.createdAt) : "Todavía no hay copias"}</strong>
        </div>
        <div>
          <span>Copias guardadas</span>
          <strong>{backups.length}</strong>
        </div>
        <div>
          <span>Carpeta local</span>
          <strong>{backupsRoot}</strong>
        </div>
      </div>

      <p className="backup-note">Las copias se guardan únicamente en tu equipo y esta carpeta está excluida de GitHub. La restauración automática la añadiremos como una función independiente con sus propias comprobaciones de seguridad.</p>

      {loading ? (
        <p className="muted">Comprobando copias existentes…</p>
      ) : backups.length > 0 ? (
        <div className="backup-list">
          {backups.slice(0, 6).map((backup) => (
            <article className="backup-row" key={backup.name}>
              <div>
                <strong>{formatDate(backup.createdAt)}</strong>
                <small>{backup.relativePath}</small>
              </div>
              <div className="backup-tags">
                {backup.includes.database && <span className="tag">Base de datos</span>}
                {backup.includes.localContent && <span className="tag">Materiales</span>}
                {backup.includes.localData && <span className="tag">Datos locales</span>}
                <span>{formatBytes(backup.sizeBytes)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <strong>Aún no has creado ninguna copia.</strong>
          <p>Haz una antes de empezar a cargar información real del curso.</p>
        </div>
      )}
    </section>
  );
}
