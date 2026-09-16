import { useEffect, useState } from "react";

type SubjectMatch = {
  code: string;
  expectedName: string;
  time: string;
  alternatives: number;
  subject: {
    id: number;
    nombre: string;
    codigo: string | null;
    grupo: string;
    grupoId: number | null;
  };
};

type ImportPreview = {
  course: { id: number; nombre: string };
  groupMode: string;
  weeklyDays: number;
  totalPlanned: number;
  existing: number;
  toCreate: number;
  toSynchronize: number;
  firstDate: string;
  lastDate: string;
  subjects: SubjectMatch[];
  omitted: string[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function AcademicScheduleImportSettings() {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPreview() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/academic-schedule/preview");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo preparar la importación del calendario");
      setPreview(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo preparar la importación del calendario");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
  }, []);

  async function importSchedule() {
    if (!preview) return;

    const subjectLines = preview.subjects.map(
      (item) => `• ${item.time} · ${item.subject.nombre}`,
    );

    const warning = [
      "¿Importar el calendario real de clases 2026/2027?",
      "",
      `${preview.weeklyDays} miércoles lectivos · ${preview.toCreate} sesiones nuevas · ${preview.toSynchronize} sesiones existentes que se sincronizarán.`,
      "1.º DAM y 1.º DAW se tratarán como un único grupo: no se duplicarán sesiones.",
      "",
      ...subjectLines,
      "",
      "Antes de importar se creará automáticamente una copia de seguridad completa.",
      "Las sesiones ya importadas no se duplicarán: se actualizarán con su categoría real (teórica, repaso, simulacro, etc.) y con los hitos del Excel.",
    ].join("\n");

    if (!window.confirm(warning)) return;

    setImporting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/academic-schedule/import", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo importar el calendario");
      setMessage(
        `Temporalización sincronizada: ${body.created ?? 0} sesiones creadas y ${body.updated ?? 0} sesiones actualizadas.`,
      );
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el calendario");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="panel academic-import-panel">
      <div className="panel-heading academic-import-heading">
        <div>
          <p className="eyebrow">CALENDARIO REAL 2026/2027</p>
          <h3>Temporalización y horario DAM/DAW</h3>
          <p className="muted">
            Importa tus sesiones de los miércoles combinando la temporalización académica con tu horario real. DAM y DAW comparten un único grupo.
          </p>
        </div>
        <button
          className="primary"
          type="button"
          disabled={loading || importing || !preview}
          onClick={() => void importSchedule()}
        >
          {importing ? "Sincronizando…" : preview?.toCreate === 0 ? "Sincronizar temporalización" : "Importar y sincronizar"}
        </button>
      </div>

      {message && <div className="notice-banner success" role="status">{message}</div>}
      {error && <div className="notice-banner error" role="alert">{error}</div>}

      {loading ? (
        <p className="muted">Comprobando asignaturas y sesiones existentes…</p>
      ) : preview ? (
        <>
          <div className="academic-import-summary">
            <div>
              <span>Miércoles lectivos</span>
              <strong>{preview.weeklyDays}</strong>
            </div>
            <div>
              <span>Sesiones previstas</span>
              <strong>{preview.totalPlanned}</strong>
            </div>
            <div>
              <span>Pendientes de importar</span>
              <strong>{preview.toCreate}</strong>
            </div>
            <div>
              <span>Ya importadas / a sincronizar</span>
              <strong>{preview.toSynchronize}</strong>
            </div>
            <div>
              <span>Grupo</span>
              <strong>{preview.groupMode}</strong>
            </div>
          </div>

          <div className="academic-import-subjects">
            {preview.subjects.map((item) => (
              <div key={item.code}>
                <span>{item.time}</span>
                <strong>{item.subject.nombre}</strong>
                <small>
                  Código {item.code}
                  {item.subject.grupo ? ` · ${item.subject.grupo}` : ""}
                  {item.alternatives > 1 ? " · se ha seleccionado una sola asignatura para evitar duplicados" : ""}
                </small>
              </div>
            ))}
          </div>

          <p className="backup-note">
            Periodo de sesiones: {formatDate(preview.firstDate)} – {formatDate(preview.lastDate)}. Se omiten vacaciones de Navidad, Semana Santa y las semanas finales reservadas a evaluación/exámenes.
          </p>
        </>
      ) : null}
    </section>
  );
}
