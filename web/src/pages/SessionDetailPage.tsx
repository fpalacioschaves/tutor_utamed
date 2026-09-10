import { useEffect, useMemo, useState } from "react";
import type { AttendanceState, SessionDetail } from "../types";

type Props = {
  sessionId: number;
  onBack: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type DraftRecord = {
  alumnoId: number;
  estadoAsistencia: AttendanceState | null;
  observacion: string;
};

type AttendanceFilter = "ALL" | "UNREGISTERED" | AttendanceState;

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceState; label: string }> = [
  { value: "PRESENTE", label: "Presente" },
  { value: "AUSENTE", label: "Ausente" },
  { value: "RETRASO", label: "Retraso" },
  { value: "SALIDA_ANTICIPADA", label: "Salida anticipada" },
  { value: "AUSENCIA_JUSTIFICADA", label: "Ausencia justificada" },
];

const SESSION_STATUS_LABELS: Record<SessionDetail["estado"], string> = {
  PROGRAMADA: "Programada",
  REALIZADA: "Realizada",
  CANCELADA: "Cancelada",
};

export function SessionDetailPage({ sessionId, onBack, onDirtyChange }: Props) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [records, setRecords] = useState<DraftRecord[]>([]);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("ALL");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error("No se pudo cargar la sesión");
      const data = (await response.json()) as SessionDetail;
      const nextRecords = data.alumnos.map((student) => ({
        alumnoId: student.id,
        estadoAsistencia: student.registro?.estadoAsistencia ?? null,
        observacion: student.registro?.observacion ?? "",
      }));
      setSession(data);
      setRecords(nextRecords);
      setBaseline(JSON.stringify(nextRecords));
      setSuccess(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al cargar la sesión");
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [sessionId]);

  const dirty = useMemo(() => baseline !== "" && JSON.stringify(records) !== baseline, [records, baseline]);

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

  const studentsById = useMemo(
    () => new Map(session?.alumnos.map((student) => [student.id, student]) ?? []),
    [session],
  );

  const pendingAttendance = records.filter((record) => record.estadoAsistencia === null).length;
  const visibleRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return records.filter((record) => {
      const student = studentsById.get(record.alumnoId);
      if (!student) return false;
      if (attendanceFilter === "UNREGISTERED" && record.estadoAsistencia !== null) return false;
      if (attendanceFilter !== "ALL" && attendanceFilter !== "UNREGISTERED" && record.estadoAsistencia !== attendanceFilter) return false;
      if (!query) return true;
      return `${student.apellidos} ${student.nombre} ${student.email ?? ""}`.toLocaleLowerCase("es").includes(query);
    });
  }, [records, studentsById, search, attendanceFilter]);

  function updateRecord(alumnoId: number, patch: Partial<DraftRecord>) {
    if (session?.estado === "CANCELADA") return;
    setRecords((current) => current.map((record) => (record.alumnoId === alumnoId ? { ...record, ...patch } : record)));
    setMessage("");
    setSuccess(false);
  }

  async function save() {
    if (!dirty || session?.estado === "CANCELADA") return;
    setSaving(true);
    setMessage("");
    setSuccess(false);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/records`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar");
      }
      setBaseline(JSON.stringify(records));
      setMessage("Asistencia y observaciones guardadas correctamente.");
      setSuccess(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar");
      setSuccess(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSession() {
    if (!session) return;

    const date = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.inicio));
    const warning = dirty
      ? "\n\nAdemás, hay cambios de asistencia sin guardar que se perderán."
      : "";
    if (!window.confirm(`¿Borrar definitivamente esta sesión de ${session.asignatura.nombre} del ${date}?${warning}\n\nEsta acción no se puede deshacer.`)) return;

    setDeleting(true);
    setMessage("");
    setSuccess(false);
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo borrar la sesión");
      }
      onDirtyChange?.(false);
      onBack();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo borrar la sesión");
      setSuccess(false);
    } finally {
      setDeleting(false);
    }
  }

  function handleBack() {
    if (dirty && !window.confirm("Hay cambios sin guardar en esta sesión. ¿Quieres salir y descartarlos?")) return;
    onBack();
  }

  if (loading) return <section className="panel"><p className="muted">Cargando sesión…</p></section>;
  if (!session) return <div className="panel"><p className="form-error">{message || "Sesión no encontrada"}</p><button className="secondary" onClick={handleBack}>Volver</button></div>;

  const cancelled = session.estado === "CANCELADA";

  return (
    <>
      <header className="page-header session-header">
        <div>
          <button className="back-button" type="button" onClick={handleBack}>← Sesiones</button>
          <div className="entity-title-line">
            <p className="eyebrow">{session.tipo === "CLASE" ? "CLASE" : "TUTORÍA GRUPAL"}</p>
            <span className={`status-pill session-state-${session.estado.toLowerCase()}`}>{SESSION_STATUS_LABELS[session.estado]}</span>
          </div>
          <h2>{session.asignatura.nombre}</h2>
          <p>{new Intl.DateTimeFormat("es-ES", { dateStyle: "full", timeStyle: "short" }).format(new Date(session.inicio))}</p>
          {session.unidad && <p className="session-topic">Unidad: U{session.unidad.orden} · {session.unidad.titulo}</p>}
          {session.tema && <p className="session-topic">Tema: {session.tema}</p>}
        </div>
        <div className="header-actions attendance-summary">
          {!cancelled && (
            <span className={pendingAttendance === 0 ? "attendance-complete" : "attendance-pending"}>
              {pendingAttendance === 0 ? "Asistencia completa" : `${pendingAttendance} sin registrar`}
            </span>
          )}
          {dirty && <span className="unsaved-pill">Cambios sin guardar</span>}
          <button className="secondary content-delete" type="button" disabled={saving || deleting} onClick={() => void deleteSession()}>
            {deleting ? "Borrando…" : "Borrar sesión"}
          </button>
          <button className="primary" type="button" disabled={saving || deleting || !dirty || cancelled} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      </header>

      {cancelled && (
        <div className="notice-banner warning" role="status">
          Esta sesión está cancelada. La asistencia queda en modo consulta; si necesitas modificarla, cambia primero el estado de la sesión en Sesiones.
        </div>
      )}

      {message && <div className={`notice-banner ${success ? "success" : "error"}`} role={success ? "status" : "alert"}>{message}</div>}

      <section className="detail-toolbar" aria-label="Filtrar alumnado de la sesión">
        <label className="search-field">
          <span>Buscar alumno</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o correo" />
        </label>
        <label>
          Asistencia
          <select value={attendanceFilter} onChange={(event) => setAttendanceFilter(event.target.value as AttendanceFilter)}>
            <option value="ALL">Todos</option>
            <option value="UNREGISTERED">Sin registrar</option>
            {ATTENDANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <span className="result-count">{visibleRecords.length} de {records.length} alumnos</span>
      </section>

      {records.length === 0 ? (
        <div className="panel empty-state"><strong>No hay alumnos matriculados en esta asignatura.</strong></div>
      ) : visibleRecords.length === 0 ? (
        <div className="panel empty-state"><strong>No hay alumnos que coincidan con los filtros.</strong></div>
      ) : (
        <section className="attendance-list">
          {visibleRecords.map((record) => {
            const student = studentsById.get(record.alumnoId);
            if (!student) return null;
            return (
              <article className={`student-session-card ${cancelled ? "read-only-card" : ""}`} key={record.alumnoId}>
                <div className="student-heading">
                  <div>
                    <strong>{student.apellidos}, {student.nombre}</strong>
                    {student.email && <small>{student.email}</small>}
                  </div>
                </div>

                <div className="attendance-block">
                  <span className="field-label">Asistencia</span>
                  <div className="attendance-buttons" aria-label={`Asistencia de ${student.nombre}`}>
                    {ATTENDANCE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={cancelled}
                        className={record.estadoAsistencia === option.value ? `attendance active attendance-${option.value.toLowerCase()}` : "attendance"}
                        onClick={() => updateRecord(record.alumnoId, { estadoAsistencia: option.value })}
                      >
                        {option.label}
                      </button>
                    ))}
                    {record.estadoAsistencia !== null && (
                      <button
                        type="button"
                        disabled={cancelled}
                        className="attendance attendance-clear"
                        onClick={() => updateRecord(record.alumnoId, { estadoAsistencia: null })}
                      >
                        Sin registrar
                      </button>
                    )}
                  </div>
                </div>

                <label className="observation-field">
                  Observaciones de la clase
                  <textarea
                    rows={3}
                    disabled={cancelled}
                    value={record.observacion}
                    placeholder="Escribe sólo si hay algo que merezca quedar registrado…"
                    onChange={(event) => updateRecord(record.alumnoId, { observacion: event.target.value })}
                  />
                </label>
              </article>
            );
          })}
        </section>
      )}

      {!cancelled && (
        <div className="activity-save-footer">
          <span className={success ? "save-message success" : "save-message"}>{message || (dirty ? "Hay cambios sin guardar." : "Todo guardado.")}</span>
          <button className="primary" type="button" disabled={saving || deleting || !dirty} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      )}
    </>
  );
}
