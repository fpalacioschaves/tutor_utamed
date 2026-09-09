import { useEffect, useMemo, useState } from "react";
import type { ActivityDetail, DeliveryState } from "../types";

type Props = {
  activityId: number;
  onBack: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type Draft = {
  estado: DeliveryState;
  fechaEntrega: string;
  calificacion: string;
  observacion: string;
};

type StateFilter = "ALL" | DeliveryState;

const deliveryLabels: Record<DeliveryState, string> = {
  PENDIENTE: "Pendiente",
  ENTREGADA: "Entregada",
  CORREGIDA: "Corregida",
  NO_ENTREGADA: "No entregada",
  RETRASADA: "Retrasada",
};

const states: DeliveryState[] = ["PENDIENTE", "ENTREGADA", "CORREGIDA", "NO_ENTREGADA", "RETRASADA"];

function dateOnlyInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
}

export function ActivityDetailPage({ activityId, onBack, onDirtyChange }: Props) {
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("ALL");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/activities/${activityId}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo cargar la actividad");
      }
      const data: ActivityDetail = await response.json();
      const nextDrafts = Object.fromEntries(data.alumnos.map((student) => [student.id, {
        estado: student.entrega?.estado ?? "PENDIENTE",
        fechaEntrega: dateOnlyInput(student.entrega?.fechaEntrega ?? null),
        calificacion: student.entrega?.calificacion === null || student.entrega?.calificacion === undefined ? "" : String(student.entrega.calificacion),
        observacion: student.entrega?.observacion ?? "",
      }]));
      setActivity(data);
      setDrafts(nextDrafts);
      setBaseline(JSON.stringify(nextDrafts));
      setSuccess(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo cargar la actividad");
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [activityId]);

  const dirty = useMemo(() => baseline !== "" && JSON.stringify(drafts) !== baseline, [drafts, baseline]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const summary = useMemo(() => {
    const values = Object.values(drafts);
    return {
      total: values.length,
      completed: values.filter((item) => ["ENTREGADA", "CORREGIDA", "RETRASADA"].includes(item.estado)).length,
      corrected: values.filter((item) => item.estado === "CORREGIDA").length,
      pending: values.filter((item) => item.estado === "PENDIENTE").length,
    };
  }, [drafts]);

  const visibleStudents = useMemo(() => {
    if (!activity) return [];
    const query = search.trim().toLocaleLowerCase("es");
    return activity.alumnos.filter((student) => {
      const draft = drafts[student.id];
      if (!draft) return false;
      if (stateFilter !== "ALL" && draft.estado !== stateFilter) return false;
      if (!query) return true;
      return `${student.apellidos} ${student.nombre} ${student.email ?? ""}`.toLocaleLowerCase("es").includes(query);
    });
  }, [activity, drafts, search, stateFilter]);

  function updateDraft(studentId: number, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [studentId]: { ...current[studentId], ...patch },
    }));
    setMessage("");
    setSuccess(false);
  }

  function setState(studentId: number, estado: DeliveryState) {
    const current = drafts[studentId];
    const needsDate = ["ENTREGADA", "CORREGIDA", "RETRASADA"].includes(estado);
    updateDraft(studentId, {
      estado,
      fechaEntrega: needsDate
        ? (current.fechaEntrega || new Date().toISOString().slice(0, 10))
        : "",
    });
  }

  async function saveAll() {
    if (!activity || !dirty) return;
    setSaving(true);
    setMessage("");
    setSuccess(false);
    try {
      const deliveries = activity.alumnos.map((student) => {
        const draft = drafts[student.id];
        return {
          alumnoId: student.id,
          estado: draft.estado,
          fechaEntrega: draft.fechaEntrega ? `${draft.fechaEntrega}T12:00:00` : null,
          calificacion: draft.calificacion === "" ? null : Number(draft.calificacion),
          observacion: draft.observacion,
        };
      });

      const response = await fetch(`/api/activities/${activity.id}/deliveries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveries }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron guardar los registros");
      }
      setBaseline(JSON.stringify(drafts));
      setMessage("Seguimiento de la actividad guardado correctamente.");
      setSuccess(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudieron guardar los registros");
      setSuccess(false);
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (dirty && !window.confirm("Hay cambios sin guardar en esta actividad. ¿Quieres salir y descartarlos?")) return;
    onBack();
  }

  if (loading) return <section className="panel"><p className="muted">Cargando actividad…</p></section>;
  if (!activity) return <section className="panel"><button className="secondary" type="button" onClick={handleBack}>Volver</button><p className="form-error">{message || "Actividad no encontrada"}</p></section>;

  return (
    <>
      <header className="page-header activity-detail-header">
        <div>
          <button className="back-button" type="button" onClick={handleBack}>← Actividades</button>
          <p className="eyebrow">{activity.asignatura.nombre}</p>
          <h2>{activity.titulo}</h2>
          {activity.unidad && <p className="session-topic">Unidad: U{activity.unidad.orden} · {activity.unidad.titulo}</p>}
          <p>{activity.descripcion || "Sin descripción"}</p>
          <div className="activity-detail-meta">
            <span>Publicación: {formatDate(activity.fechaPublicacion)}</span>
            <span>Fecha límite: {formatDate(activity.fechaLimite)}</span>
          </div>
        </div>
        <div className="header-actions">
          {dirty && <span className="unsaved-pill">Cambios sin guardar</span>}
          <button
            className="primary"
            type="button"
            onClick={() => void saveAll()}
            disabled={saving || activity.alumnos.length === 0 || !dirty}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </header>

      {message && <div className={`notice-banner ${success ? "success" : "error"}`} role={success ? "status" : "alert"}>{message}</div>}

      <section className="activity-summary-grid">
        <article className="mini-stat"><span>Alumnos</span><strong>{summary.total}</strong></article>
        <article className="mini-stat"><span>Entregadas</span><strong>{summary.completed}</strong></article>
        <article className="mini-stat"><span>Corregidas</span><strong>{summary.corrected}</strong></article>
        <article className="mini-stat"><span>Pendientes</span><strong>{summary.pending}</strong></article>
      </section>

      <section className="detail-toolbar" aria-label="Filtrar alumnado de la actividad">
        <label className="search-field">
          <span>Buscar alumno</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o correo" />
        </label>
        <label>
          Estado
          <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as StateFilter)}>
            <option value="ALL">Todos</option>
            {states.map((state) => <option key={state} value={state}>{deliveryLabels[state]}</option>)}
          </select>
        </label>
        <span className="result-count">{visibleStudents.length} de {activity.alumnos.length} alumnos</span>
      </section>

      <section className="student-section activity-students-section">
        <div className="section-title">
          <div>
            <h3>Seguimiento por alumno</h3>
            <p className="muted">Marca el estado, añade nota y escribe sólo las observaciones que necesites.</p>
          </div>
          <span className="section-count">{visibleStudents.length}</span>
        </div>

        {activity.alumnos.length === 0 ? (
          <div className="empty-state compact-empty"><strong>No hay alumnos matriculados</strong></div>
        ) : visibleStudents.length === 0 ? (
          <div className="empty-state compact-empty"><strong>No hay alumnos que coincidan con los filtros.</strong></div>
        ) : (
          <div className="activity-student-list">
            {visibleStudents.map((student) => {
              const draft = drafts[student.id];
              return (
                <article className="activity-student-card" key={student.id}>
                  <div className="activity-student-heading">
                    <div>
                      <strong>{student.apellidos}, {student.nombre}</strong>
                      <small>{student.email || "Sin correo"}</small>
                    </div>
                    <div className="delivery-buttons">
                      {states.map((state) => (
                        <button
                          className={`delivery-state delivery-${state.toLowerCase()} ${draft.estado === state ? "active" : ""}`}
                          type="button"
                          key={state}
                          onClick={() => setState(student.id, state)}
                        >
                          {deliveryLabels[state]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="activity-student-fields">
                    <label>
                      Fecha de entrega
                      <input type="date" value={draft.fechaEntrega} onChange={(event) => updateDraft(student.id, { fechaEntrega: event.target.value })} />
                    </label>
                    <label>
                      Nota
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        placeholder="—"
                        value={draft.calificacion}
                        onChange={(event) => updateDraft(student.id, { calificacion: event.target.value })}
                      />
                    </label>
                    <label className="activity-observation">
                      Observaciones
                      <textarea rows={2} value={draft.observacion} onChange={(event) => updateDraft(student.id, { observacion: event.target.value })} placeholder="Opcional" />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="activity-save-footer">
        <span className={success ? "save-message success" : "save-message"}>{message || (dirty ? "Hay cambios sin guardar." : "Todo guardado.")}</span>
        <button className="primary" type="button" onClick={() => void saveAll()} disabled={saving || activity.alumnos.length === 0 || !dirty}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </>
  );
}
