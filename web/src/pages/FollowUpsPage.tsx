import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { FollowUp, FollowUpState, StudentSummary, Subject } from "../types";

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const STATUS_LABELS: Record<FollowUpState, string> = {
  PENDIENTE: "Pendiente",
  REALIZADO: "Realizado",
  CANCELADO: "Cancelado",
};

type FilterState = "ALL" | "OVERDUE" | FollowUpState;

export function FollowUpsPage() {
  const [rows, setRows] = useState<FollowUp[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<FilterState>("PENDIENTE");
  const [filterSubjectId, setFilterSubjectId] = useState<number | "">("");
  const formPanelRef = useRef<HTMLElement | null>(null);

  async function load() {
    setError("");
    try {
      const [rowsResponse, studentsResponse, subjectsResponse] = await Promise.all([
        fetch("/api/follow-ups"),
        fetch("/api/students"),
        fetch("/api/subjects"),
      ]);
      if (!rowsResponse.ok || !studentsResponse.ok || !subjectsResponse.ok) throw new Error("No se pudieron cargar los seguimientos");
      setRows(await rowsResponse.json());
      setStudents(await studentsResponse.json());
      setSubjects(await subjectsResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar seguimientos");
    }
  }

  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => ({
    pendientes: rows.filter((row) => row.estado === "PENDIENTE").length,
    vencidos: rows.filter((row) => row.vencido).length,
    realizados: rows.filter((row) => row.estado === "REALIZADO").length,
  }), [rows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return rows.filter((row) => {
      if (filterState === "OVERDUE" && !row.vencido) return false;
      if (filterState !== "ALL" && filterState !== "OVERDUE" && row.estado !== filterState) return false;
      if (filterSubjectId !== "" && row.asignatura?.id !== filterSubjectId) return false;
      if (!query) return true;
      return `${row.alumno.apellidos} ${row.alumno.nombre} ${row.descripcion} ${row.asignatura?.nombre ?? ""} ${origin(row)}`
        .toLocaleLowerCase("es")
        .includes(query);
    });
  }, [rows, search, filterState, filterSubjectId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const payload = {
      alumnoId: Number(data.get("alumnoId")),
      asignaturaId: data.get("asignaturaId") || null,
      descripcion: data.get("descripcion"),
      fechaObjetivo: data.get("fechaObjetivo"),
      estado: editing?.estado ?? "PENDIENTE",
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const wasEditing = Boolean(editing);
      const response = await fetch(editing ? `/api/follow-ups/${editing.id}` : "/api/follow-ups", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar el seguimiento");
      }
      formElement.reset();
      setEditing(null);
      setMessage(wasEditing ? "Seguimiento actualizado correctamente." : "Seguimiento creado correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el seguimiento");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: number, estado: FollowUpState) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/follow-ups/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!response.ok) throw new Error("No se pudo cambiar el estado");
      setMessage(estado === "REALIZADO" ? "Seguimiento marcado como realizado." : "Seguimiento actualizado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el seguimiento");
    } finally {
      setSaving(false);
    }
  }

  function origin(row: FollowUp) {
    if (row.tutoriaIndividual) return "Tutoría individual";
    if (row.actividad) return `Actividad: ${row.actividad.titulo}`;
    if (row.sesion) return "Sesión de clase";
    if (row.incidencia) return `Incidencia: ${row.incidencia.titulo}`;
    return "Seguimiento manual";
  }

  function startEditing(row: FollowUp) {
    setEditing(row);
    setError("");
    setMessage("");
    requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const activeStudents = students.filter((student) => student.activo !== false);
  const formStudents = editing && !activeStudents.some((student) => student.id === editing.alumno.id)
    ? [...activeStudents, editing.alumno]
    : activeStudents;
  const activeSubjects = subjects.filter((subject) => subject.activa !== false);
  const formSubjects = editing?.asignatura && !activeSubjects.some((subject) => subject.id === editing.asignatura?.id)
    ? [...activeSubjects, editing.asignatura]
    : activeSubjects;

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">PRÓXIMAS ACTUACIONES</p><h2>Seguimientos</h2><p>Todo aquello que necesitas volver a comprobar con un alumno, con fecha y estado claros.</p></div>
      </header>

      <section className="tutorial-kpis">
        <article className="mini-stat"><span>Pendientes</span><strong>{counts.pendientes}</strong></article>
        <article className="mini-stat danger-stat"><span>Vencidos</span><strong>{counts.vencidos}</strong></article>
        <article className="mini-stat"><span>Realizados</span><strong>{counts.realizados}</strong></article>
      </section>

      <section className="content-grid followups-grid">
        <article className="panel" ref={formPanelRef}>
          <div className="panel-heading"><div><p className="eyebrow">{editing ? "EDITANDO" : "NUEVO"}</p><h3>{editing ? "Editar seguimiento" : "Nuevo seguimiento"}</h3></div></div>
          <form className="form-stack" onSubmit={save} key={editing?.id ?? "new"}>
            <label>Alumno
              <select name="alumnoId" required defaultValue={editing?.alumno.id ?? ""}>
                <option value="" disabled>Selecciona un alumno</option>
                {formStudents.map((student) => <option value={student.id} key={student.id}>{student.apellidos}, {student.nombre}{student.activo === false ? " (inactivo)" : ""}</option>)}
              </select>
            </label>
            <label>Asignatura
              <select name="asignaturaId" defaultValue={editing?.asignatura?.id ?? ""}>
                <option value="">General / sin asignatura</option>
                {formSubjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.nombre}{subject.activa === false ? " (inactiva)" : ""}</option>)}
              </select>
            </label>
            <label>Qué debes comprobar<textarea name="descripcion" required rows={4} defaultValue={editing?.descripcion ?? ""} /></label>
            <label>Fecha objetivo<input name="fechaObjetivo" type="datetime-local" required defaultValue={toLocalInput(editing?.fechaObjetivo ?? null)} /></label>
            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear seguimiento"}</button>
              {editing && <button className="secondary" type="button" onClick={() => { setEditing(null); setError(""); setMessage(""); }}>Cancelar</button>}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="save-message success" role="status">{message}</p>}
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">AGENDA</p><h3>{visibleRows.length} de {rows.length} seguimientos</h3></div><button className="text-button" type="button" onClick={() => void load()}>Actualizar</button></div>

          <div className="list-toolbar" aria-label="Filtrar seguimientos">
            <label className="search-field"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Alumno, descripción u origen" /></label>
            <label>Estado
              <select value={filterState} onChange={(event) => setFilterState(event.target.value as FilterState)}>
                <option value="PENDIENTE">Pendientes</option>
                <option value="OVERDUE">Vencidos</option>
                <option value="REALIZADO">Realizados</option>
                <option value="CANCELADO">Cancelados</option>
                <option value="ALL">Todos</option>
              </select>
            </label>
            <label>Asignatura
              <select value={filterSubjectId} onChange={(event) => setFilterSubjectId(event.target.value ? Number(event.target.value) : "")}>
                <option value="">Todas</option>
                {subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.nombre}</option>)}
              </select>
            </label>
          </div>

          {rows.length === 0 ? <div className="empty-state compact-empty"><strong>No hay seguimientos</strong><p>Cuando haya algo que revisar más adelante aparecerá aquí.</p></div> : visibleRows.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay seguimientos que coincidan con los filtros.</strong></div>
          ) : (
            <div className="followup-list">
              {visibleRows.map((row) => (
                <article className={`followup-card ${row.vencido ? "overdue" : ""}`} key={row.id}>
                  <div className="followup-head">
                    <div><strong>{row.alumno.apellidos}, {row.alumno.nombre}</strong><small>{row.asignatura?.nombre ?? "General"} · {origin(row)}</small></div>
                    <span className={`status-pill ${row.vencido ? "danger" : row.estado === "REALIZADO" ? "ok" : row.estado === "CANCELADO" ? "muted-status" : ""}`}>{row.vencido ? "Vencido" : STATUS_LABELS[row.estado]}</span>
                  </div>
                  <p className="followup-description">{row.descripcion}</p>
                  <div className="followup-date"><b>Fecha objetivo:</b> {formatDate(row.fechaObjetivo)}</div>
                  <div className="tutorial-actions">
                    {row.estado === "PENDIENTE" && <button className="primary compact-button" type="button" disabled={saving} onClick={() => void changeStatus(row.id, "REALIZADO")}>Marcar realizado</button>}
                    <button className="secondary compact-button" type="button" onClick={() => startEditing(row)}>Editar</button>
                    {row.estado === "PENDIENTE" && <button className="secondary compact-button" type="button" disabled={saving} onClick={() => void changeStatus(row.id, "CANCELADO")}>Cancelar</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
