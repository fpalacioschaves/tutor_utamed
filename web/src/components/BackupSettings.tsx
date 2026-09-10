import { useEffect, useState } from "react";

type BackupInfo = {
  name: string;
  createdAt: string;
  relativePath: string;
  sizeBytes: number;
  kind?: "MANUAL" | "PRE_RESTORE";
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
  const [restoring, setRestoring] = useState<string | null>(null);
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

  async function restoreBackup(backup: BackupInfo) {
    const warning = [
      `¿Restaurar la copia del ${formatDate(backup.createdAt)}?`,
      "",
      "Los datos actuales de Tutor UTAMED serán sustituidos por los guardados en esa copia.",
      "Antes de hacerlo se creará automáticamente una nueva copia del estado actual, por si necesitas volver atrás.",
      "",
      "Esta operación afecta a la base de datos, los materiales y los datos locales incluidos en la copia.",
    ].join("\n");

    if (!window.confirm(warning)) return;

    setRestoring(backup.name);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/backups/${encodeURIComponent(backup.name)}/restore`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo restaurar la copia de seguridad");

      const safetyDate = body.safetyBackup?.createdAt ? formatDate(body.safetyBackup.createdAt) : null;
      window.alert(
        safetyDate
          ? `Copia restaurada correctamente.\n\nAntes de restaurar se guardó automáticamente el estado anterior (${safetyDate}). La aplicación se recargará ahora.`
          : "Copia restaurada correctamente. La aplicación se recargará ahora.",
      );
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar la copia de seguridad");
      setRestoring(null);
    }
  }

  const latest = backups[0] ?? null;
  const busy = creating || restoring !== null;

  return (
    <section className="panel backup-settings-panel">
      <div className="panel-heading backup-heading">
        <div>
          <p className="eyebrow">SEGURIDAD DE DATOS</p>
          <h3>Copias de seguridad</h3>
          <p className="muted">Guarda y recupera el estado local de Tutor UTAMED: base de datos, materiales docentes y datos auxiliares.</p>
        </div>
        <button className="primary" type="button" onClick={() => void createBackup()} disabled={busy}>
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

      <p className="backup-note">Al restaurar una copia, el estado actual se guarda automáticamente en una nueva copia antes de sustituir nada. Las copias permanecen únicamente en tu equipo y la carpeta está excluida de GitHub.</p>

      {loading ? (
        <p className="muted">Comprobando copias existentes…</p>
      ) : backups.length > 0 ? (
        <div className="backup-list">
          {backups.slice(0, 8).map((backup) => (
            <article className="backup-row" key={backup.name}>
              <div>
                <strong>{formatDate(backup.createdAt)}</strong>
                <small>{backup.relativePath}</small>
              </div>
              <div className="backup-actions">
                <div className="backup-tags">
                  {backup.kind === "PRE_RESTORE" && <span className="tag backup-safety-tag">Automática antes de restaurar</span>}
                  {backup.includes.database && <span className="tag">Base de datos</span>}
                  {backup.includes.localContent && <span className="tag">Materiales</span>}
                  {backup.includes.localData && <span className="tag">Datos locales</span>}
                  <span>{formatBytes(backup.sizeBytes)}</span>
                </div>
                <button
                  className="secondary compact-button backup-restore-button"
                  type="button"
                  disabled={busy || !backup.includes.database}
                  onClick={() => void restoreBackup(backup)}
                >
                  {restoring === backup.name ? "Restaurando…" : "Restaurar"}
                </button>
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
