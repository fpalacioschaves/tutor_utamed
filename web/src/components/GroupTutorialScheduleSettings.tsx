import { useEffect, useState } from "react";

type TutorialSlot = {
  id: string;
  code: string;
  subjectName: string;
  subjectId: number;
  group: "DAM" | "DAW";
  day: number;
  weekday: string;
  start: string;
  end: string;
  planned: number;
  existing: number;
  toCreate: number;
};

type TutorialPreview = {
  course: { nombre: string };
  firstDate: string;
  lastDate: string;
  slots: TutorialSlot[];
  totalPlanned: number;
  existing: number;
  toCreate: number;
  nonTeaching: Array<{ from: string; through: string; label: string }>;
  overlapWarnings: string[];
};

function formatDay(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function GroupTutorialScheduleSettings() {
  const [preview, setPreview] = useState<TutorialPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPreview() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/group-tutorial-schedule/preview");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo calcular el horario de tutorías");
      setPreview(body as TutorialPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo calcular el horario de tutorías");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
  }, []);

  async function importSchedule() {
    if (!preview || preview.toCreate === 0) return;

    const confirmation = [
      "¿Importar el horario semanal de tutorías de 1.º DAM y DAW?",
      "",
      `${preview.totalPlanned} tutorías previstas, de las que ${preview.toCreate} son nuevas.`,
      `Periodo: ${formatDay(preview.firstDate)} – ${formatDay(preview.lastDate)}.`,
      "Se excluyen los festivos, los días no lectivos y las vacaciones del Excel.",
      "",
      ...preview.slots.map((slot) =>
        `• ${slot.weekday} ${slot.start}–${slot.end} · ${slot.subjectName} · ${slot.group}`,
      ),
      "",
      ...preview.overlapWarnings.map((warning) => `AVISO: ${warning}`),
      "",
      "Se creará una copia de seguridad completa antes de insertar las tutorías.",
      "No se modificarán las asignaturas, unidades, materiales ni las clases compartidas DAM/DAW.",
    ].join("\n");

    if (!window.confirm(confirmation)) return;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/group-tutorial-schedule/import", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron importar las tutorías");
      setMessage(`Tutorías importadas: ${body.created} nuevas. Las ${body.existing} ya existentes se han conservado sin duplicarlas.`);
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron importar las tutorías");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel group-tutorial-settings-panel">
      <div className="panel-heading group-tutorial-settings-heading">
        <div>
          <p className="eyebrow">TUTORÍAS PERIÓDICAS · 1.º FP</p>
          <h3>Horario de tutorías DAM / DAW</h3>
          <p className="muted">
            Ocho franjas semanales diferenciadas por módulo y ciclo. Se generan únicamente en días lectivos, sin duplicar las sesiones de clase compartidas.
          </p>
        </div>
        <button
          className="primary"
          type="button"
          onClick={() => void importSchedule()}
          disabled={loading || saving || !preview || preview.toCreate === 0}
        >
          {saving ? "Importando tutorías…" : preview?.toCreate === 0 ? "Tutorías ya importadas" : "Importar tutorías"}
        </button>
      </div>

      {message && <div className="notice-banner success" role="status">{message}</div>}
      {error && <div className="notice-banner error" role="alert">{error}</div>}

      {loading ? (
        <p className="muted">Comprobando fechas lectivas, asignaturas y tutorías existentes…</p>
      ) : preview ? (
        <>
          <div className="academic-import-summary">
            <div><span>Franjas semanales</span><strong>{preview.slots.length}</strong></div>
            <div><span>Tutorías previstas</span><strong>{preview.totalPlanned}</strong></div>
            <div><span>Ya importadas</span><strong>{preview.existing}</strong></div>
            <div><span>Pendientes</span><strong>{preview.toCreate}</strong></div>
          </div>

          <p className="backup-note">
            Desde {formatDay(preview.firstDate)} hasta {formatDay(preview.lastDate)}. Las clases comunes de DAM/DAW se mantienen como un único grupo; las tutorías se identifican individualmente como DAM o DAW.
          </p>

          <div className="unit-allocation-table-wrap">
            <table className="unit-allocation-table group-tutorial-table">
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Horario</th>
                  <th>Asignatura</th>
                  <th>Grupo</th>
                  <th>Sesiones</th>
                  <th>Pendientes</th>
                </tr>
              </thead>
              <tbody>
                {preview.slots.map((slot) => (
                  <tr key={slot.id}>
                    <td>{slot.weekday}</td>
                    <td>{slot.start}–{slot.end}</td>
                    <td><strong>{slot.subjectName}</strong></td>
                    <td><span className="tag">{slot.group}</span></td>
                    <td>{slot.planned}</td>
                    <td>{slot.toCreate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.overlapWarnings.map((warning) => (
            <div className="notice-banner warning group-tutorial-warning" role="status" key={warning}>
              <strong>Solapamiento de horario:</strong> {warning}
            </div>
          ))}

          <details className="group-tutorial-exclusions">
            <summary>Festivos y periodos no lectivos excluidos ({preview.nonTeaching.length})</summary>
            <div>
              {preview.nonTeaching.map((period) => (
                <p key={period.from}>
                  {formatDay(period.from)}
                  {period.through !== period.from ? ` – ${formatDay(period.through)}` : ""}
                  {" · "}{period.label}
                </p>
              ))}
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
