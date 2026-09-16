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

type UnitAllocationStrategy = "HORAS_PREVISTAS" | "EQUILIBRADO";

type AllocationUnit = {
  id: number;
  orden: number;
  titulo: string;
  horasPrevistas: number | null;
  sessions: number;
  from: number | null;
  to: number | null;
};

type AllocationSubject = {
  code: string;
  subject: { id: number; nombre: string };
  ready: boolean;
  issues: string[];
  strategy: UnitAllocationStrategy | null;
  units: AllocationUnit[];
  sessionCount: number;
  changesNeeded: number;
  alreadyCorrect: number;
};

type UnitAllocationPreview = {
  ready: boolean;
  totalTheoreticalSessions: number;
  changesNeeded: number;
  alreadyCorrect: number;
  subjects: AllocationSubject[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function strategyLabel(strategy: UnitAllocationStrategy | null) {
  if (strategy === "HORAS_PREVISTAS") return "Proporcional a horas previstas";
  if (strategy === "EQUILIBRADO") return "Reparto equilibrado";
  return "Pendiente";
}

function sessionRange(unit: AllocationUnit) {
  if (!unit.from || !unit.to || unit.sessions === 0) return "Sin asignar";
  if (unit.from === unit.to) return `Sesión teórica ${unit.from}`;
  return `Sesiones teóricas ${unit.from}–${unit.to}`;
}

export function AcademicScheduleImportSettings() {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [allocationPreview, setAllocationPreview] = useState<UnitAllocationPreview | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(true);
  const [allocationApplying, setAllocationApplying] = useState(false);
  const [allocationError, setAllocationError] = useState("");
  const [allocationMessage, setAllocationMessage] = useState("");

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

  async function loadAllocationPreview() {
    setAllocationLoading(true);
    setAllocationError("");
    try {
      const response = await fetch("/api/academic-schedule/unit-allocation-preview");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo preparar el reparto de unidades");
      setAllocationPreview(body);
    } catch (err) {
      setAllocationPreview(null);
      setAllocationError(err instanceof Error ? err.message : "No se pudo preparar el reparto de unidades");
    } finally {
      setAllocationLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
    void loadAllocationPreview();
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
      await Promise.all([loadPreview(), loadAllocationPreview()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el calendario");
    } finally {
      setImporting(false);
    }
  }

  async function applyUnitAllocation() {
    if (!allocationPreview || !allocationPreview.ready || allocationPreview.changesNeeded === 0) return;

    const subjectLines = allocationPreview.subjects.map((item) => (
      `• ${item.subject.nombre}: ${item.units.length} unidades · ${strategyLabel(item.strategy)} · ${item.changesNeeded} asociaciones a aplicar`
    ));

    const warning = [
      "¿Asignar las unidades a las sesiones teóricas?",
      "",
      `${allocationPreview.totalTheoreticalSessions} sesiones teóricas en total.`,
      `${allocationPreview.changesNeeded} asociaciones se crearán o modificarán.`,
      "",
      ...subjectLines,
      "",
      "Solo se modificarán las sesiones teóricas. Presentación, repasos, simulacro y tutoría/dudas no consumen ninguna de las 22 sesiones teóricas.",
      "Antes de aplicar el reparto se creará automáticamente una copia de seguridad.",
    ].join("\n");

    if (!window.confirm(warning)) return;

    setAllocationApplying(true);
    setAllocationError("");
    setAllocationMessage("");
    try {
      const response = await fetch("/api/academic-schedule/unit-allocation-apply", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo aplicar el reparto de unidades");
      setAllocationMessage(
        body.updated > 0
          ? `Reparto aplicado correctamente: ${body.updated} sesiones teóricas asociadas a sus unidades.`
          : "El reparto ya estaba aplicado correctamente.",
      );
      await loadAllocationPreview();
    } catch (err) {
      setAllocationError(err instanceof Error ? err.message : "No se pudo aplicar el reparto de unidades");
    } finally {
      setAllocationApplying(false);
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

      <div className="unit-allocation-section">
        <div className="panel-heading unit-allocation-heading">
          <div>
            <p className="eyebrow">UNIDADES → 22 SESIONES TEÓRICAS</p>
            <h3>Reparto de unidades por asignatura</h3>
            <p className="muted">
              Asocia cada sesión teórica con una unidad. Si todas las unidades tienen horas previstas se usa un reparto proporcional; si no, se reparte de forma equilibrada.
            </p>
          </div>
          <button
            className="primary"
            type="button"
            disabled={
              allocationLoading ||
              allocationApplying ||
              !allocationPreview ||
              !allocationPreview.ready ||
              allocationPreview.changesNeeded === 0
            }
            onClick={() => void applyUnitAllocation()}
          >
            {allocationApplying
              ? "Asignando…"
              : allocationPreview?.changesNeeded === 0 && allocationPreview?.ready
                ? "Reparto ya aplicado"
                : "Aplicar reparto"}
          </button>
        </div>

        {allocationMessage && <div className="notice-banner success" role="status">{allocationMessage}</div>}
        {allocationError && <div className="notice-banner error" role="alert">{allocationError}</div>}

        {allocationLoading ? (
          <p className="muted">Calculando el reparto de las unidades…</p>
        ) : allocationPreview ? (
          <>
            <div className="academic-import-summary">
              <div>
                <span>Sesiones teóricas detectadas</span>
                <strong>{allocationPreview.totalTheoreticalSessions}</strong>
              </div>
              <div>
                <span>Asociaciones por aplicar</span>
                <strong>{allocationPreview.changesNeeded}</strong>
              </div>
              <div>
                <span>Ya correctas</span>
                <strong>{allocationPreview.alreadyCorrect}</strong>
              </div>
            </div>

            <div className="unit-allocation-subjects">
              {allocationPreview.subjects.map((item) => (
                <article className="unit-allocation-subject" key={item.code}>
                  <header>
                    <div>
                      <h4>{item.subject.nombre}</h4>
                      <small>
                        {item.sessionCount} sesiones teóricas · {item.units.length} unidades · {strategyLabel(item.strategy)}
                      </small>
                    </div>
                    <span className="tag">
                      {item.ready ? `${item.changesNeeded} cambios` : "Revisar"}
                    </span>
                  </header>

                  {!item.ready ? (
                    item.issues.map((issue) => <p className="unit-allocation-issue" key={issue}>{issue}</p>)
                  ) : (
                    <div className="unit-allocation-table-wrap">
                      <table className="unit-allocation-table">
                        <thead>
                          <tr>
                            <th>Unidad</th>
                            <th>Horas previstas</th>
                            <th>Sesiones</th>
                            <th>Bloque teórico</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.units.map((unit) => (
                            <tr key={unit.id}>
                              <td><strong>U{unit.orden} · {unit.titulo}</strong></td>
                              <td>{unit.horasPrevistas ?? "—"}</td>
                              <td>{unit.sessions}</td>
                              <td>{sessionRange(unit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              ))}
            </div>

            {!allocationPreview.ready && (
              <p className="backup-note">
                El reparto no se puede aplicar hasta que las tres asignaturas tengan exactamente 22 sesiones teóricas importadas y al menos una unidad activa.
              </p>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
