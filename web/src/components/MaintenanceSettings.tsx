import { useEffect, useState } from "react";

type CleanupImpact = {
  students: number;
  enrollments: number;
  sessions: number;
  attendanceRecords: number;
  submissions: number;
  tutorials: number;
  followUps: number;
  incidents: number;
  communications: number;
  totalOperationalRecords: number;
};

type CleanupPreview = {
  delete: CleanupImpact;
  preserve: {
    courses: number;
    groups: number;
    subjects: number;
    units: number;
    activities: number;
    localTeachingMaterials: boolean;
    settings: boolean;
  };
};

const LABELS: Array<[keyof CleanupImpact, string]> = [
  ["students", "Alumnos"],
  ["enrollments", "Matrículas"],
  ["sessions", "Sesiones"],
  ["attendanceRecords", "Registros de asistencia"],
  ["submissions", "Entregas"],
  ["tutorials", "Tutorías individuales"],
  ["followUps", "Seguimientos"],
  ["incidents", "Incidencias"],
  ["communications", "Comunicaciones"],
];

export function MaintenanceSettings() {
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPreview() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/maintenance/cleanup-preview");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo comprobar qué datos hay que limpiar");
      setPreview(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo comprobar qué datos hay que limpiar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
  }, []);

  async function cleanup() {
    if (!preview) return;
    const lines = LABELS
      .filter(([key]) => key !== "totalOperationalRecords" && preview.delete[key] > 0)
      .map(([key, label]) => `• ${label}: ${preview.delete[key]}`);

    const warning = [
      "¿Eliminar todas las sesiones y alumnos actuales?",
      "",
      ...(lines.length ? lines : ["No hay registros operativos que eliminar."]),
      "",
      "SE CONSERVARÁN:",
      `• ${preview.preserve.subjects} asignaturas`,
      `• ${preview.preserve.units} unidades/contenidos`,
      `• ${preview.preserve.activities} actividades`,
      `• ${preview.preserve.groups} grupos`,
      `• ${preview.preserve.courses} cursos académicos`,
      "• Todos los documentos y materiales docentes locales",
      "• La configuración de la aplicación",
      "",
      "Antes de borrar nada se creará automáticamente una copia de seguridad completa.",
    ].join("\n");

    if (!window.confirm(warning)) return;

    setCleaning(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/maintenance/cleanup-demo-data", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudieron eliminar los datos de prueba");
      setMessage("Sesiones y alumnos eliminados correctamente. Asignaturas, unidades, actividades y materiales se han conservado.");
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron eliminar los datos de prueba");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <section className="panel maintenance-settings-panel">
      <div className="panel-heading maintenance-heading">
        <div>
          <p className="eyebrow">PREPARACIÓN DE DATOS REALES</p>
          <h3>Borrar sesiones y alumnos</h3>
          <p className="muted">
            Elimina las sesiones y los alumnos actuales, junto con los datos dependientes necesarios, sin tocar asignaturas, unidades, actividades ni materiales docentes.
          </p>
        </div>
        <button className="danger-button" type="button" onClick={() => void cleanup()} disabled={loading || cleaning || !preview}>
          {cleaning ? "Borrando…" : "Borrar sesiones y alumnos"}
        </button>
      </div>

      {message && <div className="notice-banner success" role="status">{message}</div>}
      {error && <div className="notice-banner error" role="alert">{error}</div>}

      {loading ? (
        <p className="muted">Comprobando datos actuales…</p>
      ) : preview ? (
        <>
          <div className="maintenance-summary">
            <div>
              <span>Registros que se eliminarían</span>
              <strong>{preview.delete.totalOperationalRecords}</strong>
            </div>
            <div>
              <span>Asignaturas que se conservan</span>
              <strong>{preview.preserve.subjects}</strong>
            </div>
            <div>
              <span>Unidades que se conservan</span>
              <strong>{preview.preserve.units}</strong>
            </div>
          </div>
          <p className="backup-note">
            La limpieza crea primero una copia automática completa. Los documentos asociados a las unidades permanecen en su almacenamiento local.
          </p>
        </>
      ) : null}
    </section>
  );
}
