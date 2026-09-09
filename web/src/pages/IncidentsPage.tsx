import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Incident, IncidentState, StudentSummary, Subject } from "../types";

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function nowLocalInput() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const STATUS_LABELS: Record<IncidentState, string> = {
  ABIERTA: "Abierta",
  EN_SEGUIMIENTO: "En seguimiento",
  RESUELTA: "Resuelta",
};

type FilterState = "ALL" | IncidentState;

export function IncidentsPage() {
  const [rows, setRows] = useState<Incident[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<FilterState>("ALL");
  const [filterSubjectId, setFilterSubjectId] = useState<number | "">("");
  const formPanelRef = useRef<HTMLElement | null>(null);

  async function load() {
    setError("");
    try {
      const [rowsResponse, studentsResponse, subjectsResponse] = await Promise.all([
        fetch("/api/incidents"),
        fetch("/api/students"),
        fetch("/api/subjects"),
      ]);
      if (!rowsResponse.ok || !studentsResponse.ok || !subjectsResponse.ok) throw new Error("No se pudieron cargar las incidencias");
      setRows(await rowsResponse.json());
      setStudents(await studentsResponse.json());
      setSubjects(await subjectsResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar incidencias");
    }
  }

  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => ({
    abiertas: rows.filter((row) => row.estado === "ABIERTA").length,
    seguimiento: rows.filter((row) => row.estado === "EN_SEGUIMIENTO").length,
    resueltas: rows.filter((row) => row.estado === "RESUELTA").length,
  }), [rows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return rows.filter((row) => {
      if (filterState !== "ALL" && row.estado !== filterState) return false;
      if (filterSubjectId !== "" && row.asignatura?.id !== filterSubjectId) return false;
      if (!query) return true;
      return [row.alumno.apellidos, row.alumno.nombre, row.titulo, row.descripcion, row.resolucion ?? "", row.asignatura?.nombre ?? ""]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query);
    });
  }, [rows, search, filterState, filterSubjectId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const estado = String(data.get("estado")) as IncidentState;
    const payload = {
      alumnoId: Number(data.get("alumnoId")),
      asignaturaId: data.get("asignaturaId") || null,
      fecha: data.get("fecha"),
      titulo: data.get("titulo"),
      descripcion: data.get("descripcion"),
      estado,
      resolucion: data.get("resolucion"),
      fechaResolucion: estado === "RESUELTA" ? data.get("fechaResolucion") || new Date().toISOString() : null,
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const wasEditing = Boolean(editing);
      const response = await fetch(editing ? `/api/incidents/${editing.id}` : "/api/incidents", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la incidencia");
      }
      formElement.reset();
      setEditing(null);
      setMessage(wasEditing ? "Incidencia actualizada correctamente." : "Incidencia creada correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la incidencia");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(row: Incident, estado: IncidentState) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/incidents/${row.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!response.ok) throw new Error("No se pudo cambiar el estado de la incidencia");
      setMessage(`Incidencia ${STATUS_LABELS[estado].toLocaleLowerCase("es")}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la incidencia");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(row: Incident) {
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
        <div><p className="eyebrow">SITUACIONES A CONTROLAR</p><h2>Incidencias</h2><p>Registra problemas concretos, deja constancia de su evolución y ciérralos cuando estén resueltos.</p></div>
      </header>

      <section className="tutorial-kpis">
        <article className="mini-stat danger-stat"><span>Abiertas</span><strong>{counts.abiertas}</strong></article>
        <article className="mini-stat"><span>En seguimiento</span><strong>{counts.seguimiento}</strong></article>
        <article className="mini-stat"><span>Resueltas</span><strong>{counts.resueltas}</strong></article>
      </section>

      <section className="content-grid incidents-grid">
        <article className="panel" ref={formPanelRef}>
          <div className="panel-heading"><div><p className="eyebrow">{editing ? "EDITANDO" : "NUEVA"}</p><h3>{editing ? "Editar incidencia" : "Nueva incidencia"}</h3></div></div>
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
            <label>Fecha<input name="fecha" type="datetime-local" required defaultValue={toLocalInput(editing?.fecha ?? null) || nowLocalInput()} /></label>
            <label>Título<input name="titulo" required defaultValue={editing?.titulo ?? ""} placeholder="Ej.: tres entregas consecutivas pendientes" /></label>
            <label>Descripción<textarea name="descripcion" required rows={4} defaultValue={editing?.descripcion ?? ""} /></label>
            <label>Estado
              <select name="estado" defaultValue={editing?.estado ?? "ABIERTA"}>
                <option value="ABIERTA">Abierta</option>
                <option value="EN_SEGUIMIENTO">En seguimiento</option>
                <option value="RESUELTA">Resuelta</option>
              </select>
            </label>
            <label>Resolución<textarea name="resolucion" rows={3} defaultValue={editing?.resolucion ?? ""} placeholder="Déjalo vacío mientras no esté resuelta." /></label>
            {editing?.estado === "RESUELTA" && <label>Fecha de resolución<input name="fechaResolucion" type="datetime-local" defaultValue={toLocalInput(editing.fechaResolucion)} /></label>}
            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear incidencia"}</button>
              {editing && <button className="secondary" type="button" onClick={() => { setEditing(null); setError(""); setMessage(""); }}>Cancelar</button>}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="save-message success" role="status">{message}</p>}
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">REGISTRO</p><h3>{visibleRows.length} de {rows.length} incidencias</h3></div><button className="text-button" type="button" onClick={() => void load()}>Actualizar</button></div>

          <div className="list-toolbar" aria-label="Filtrar incidencias">
            <label className="search-field"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Alumno, título o descripción" /></label>
            <label>Estado
              <select value={filterState} onChange={(event) => setFilterState(event.target.value as FilterState)}>
                <option value="ALL">Todos</option>
                <option value="ABIERTA">Abiertas</option>
                <option value="EN_SEGUIMIENTO">En seguimiento</option>
                <option value="RESUELTA">Resueltas</option>
              </select>
            </label>
            <label>Asignatura
              <select value={filterSubjectId} onChange={(event) => setFilterSubjectId(event.target.value ? Number(event.target.value) : "")}>
                <option value="">Todas</option>
                {subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.nombre}</option>)}
              </select>
            </label>
          </div>

          {rows.length === 0 ? <div className="empty-state compact-empty"><strong>No hay incidencias</strong><p>Las situaciones que necesiten un seguimiento especial aparecerán aquí.</p></div> : visibleRows.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay incidencias que coincidan con los filtros.</strong></div>
          ) : (
            <div className="incident-list">
              {visibleRows.map((row) => (
                <article className={`incident-card incident-${row.estado.toLowerCase()}`} key={row.id}>
                  <div className="incident-head">
                    <div><strong>{row.titulo}</strong><small>{row.alumno.apellidos}, {row.alumno.nombre} · {row.asignatura?.nombre ?? "General"}</small></div>
                    <span className={`status-pill ${row.estado === "RESUELTA" ? "ok" : row.estado === "ABIERTA" ? "danger" : ""}`}>{STATUS_LABELS[row.estado]}</span>
                  </div>
                  <div className="incident-date">{formatDate(row.fecha)}</div>
                  <p className="incident-description">{row.descripcion}</p>
                  {row.resolucion && <div className="incident-resolution"><b>Resolución</b><p>{row.resolucion}</p>{row.fechaResolucion && <small>{formatDate(row.fechaResolucion)}</small>}</div>}
                  <div className="tutorial-actions">
                    <button className="secondary compact-button" type="button" onClick={() => startEditing(row)}>Editar</button>
                    {row.estado === "ABIERTA" && <button className="secondary compact-button" type="button" disabled={saving} onClick={() => void changeStatus(row, "EN_SEGUIMIENTO")}>Pasar a seguimiento</button>}
                    {row.estado !== "RESUELTA" && <button className="primary compact-button" type="button" disabled={saving} onClick={() => { setEditing({ ...row, estado: "RESUELTA" }); setError(""); setMessage(""); requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>Resolver</button>}
                    {row.estado === "RESUELTA" && <button className="secondary compact-button" type="button" disabled={saving} onClick={() => void changeStatus(row, "ABIERTA")}>Reabrir</button>}
                    {(row._count?.seguimientos ?? 0) > 0 && <small>{row._count?.seguimientos} seguimiento(s) vinculado(s)</small>}
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
