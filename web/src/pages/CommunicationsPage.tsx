import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Communication, StudentSummary, Subject } from "../types";

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function nowLocalInput() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function CommunicationsPage() {
  const [rows, setRows] = useState<Communication[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [editing, setEditing] = useState<Communication | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState<number | "">("");
  const formPanelRef = useRef<HTMLElement | null>(null);

  async function load() {
    setError("");
    try {
      const [rowsResponse, studentsResponse, subjectsResponse] = await Promise.all([
        fetch("/api/communications"),
        fetch("/api/students"),
        fetch("/api/subjects"),
      ]);
      if (!rowsResponse.ok || !studentsResponse.ok || !subjectsResponse.ok) throw new Error("No se pudieron cargar las comunicaciones");
      setRows(await rowsResponse.json());
      setStudents(await studentsResponse.json());
      setSubjects(await subjectsResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar comunicaciones");
    }
  }

  useEffect(() => { void load(); }, []);

  const thisMonth = useMemo(() => {
    const now = new Date();
    return rows.filter((row) => {
      const date = new Date(row.fecha);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }).length;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return rows.filter((row) => {
      if (filterSubjectId !== "" && row.asignatura?.id !== filterSubjectId) return false;
      if (!query) return true;
      return [row.alumno.apellidos, row.alumno.nombre, row.canal, row.motivo ?? "", row.resumen ?? "", row.asignatura?.nombre ?? ""]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query);
    });
  }, [rows, search, filterSubjectId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const payload = {
      alumnoId: Number(data.get("alumnoId")),
      asignaturaId: data.get("asignaturaId") || null,
      fecha: data.get("fecha"),
      canal: data.get("canal"),
      motivo: data.get("motivo"),
      resumen: data.get("resumen"),
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const wasEditing = Boolean(editing);
      const response = await fetch(editing ? `/api/communications/${editing.id}` : "/api/communications", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la comunicación");
      }
      formElement.reset();
      setEditing(null);
      setMessage(wasEditing ? "Comunicación actualizada correctamente." : "Comunicación registrada correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la comunicación");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(row: Communication) {
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
        <div><p className="eyebrow">CONTACTO CON EL ALUMNADO</p><h2>Comunicaciones</h2><p>Deja constancia de correos, mensajes, llamadas o cualquier contacto relevante con un alumno.</p></div>
      </header>

      <section className="tutorial-kpis">
        <article className="mini-stat"><span>Total</span><strong>{rows.length}</strong></article>
        <article className="mini-stat"><span>Este mes</span><strong>{thisMonth}</strong></article>
        <article className="mini-stat"><span>Alumnos con contacto</span><strong>{new Set(rows.map((row) => row.alumno.id)).size}</strong></article>
      </section>

      <section className="content-grid communications-grid">
        <article className="panel" ref={formPanelRef}>
          <div className="panel-heading"><div><p className="eyebrow">{editing ? "EDITANDO" : "NUEVA"}</p><h3>{editing ? "Editar comunicación" : "Nueva comunicación"}</h3></div></div>
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
            <label>Canal<input name="canal" required defaultValue={editing?.canal ?? ""} placeholder="Correo, campus, Teams, teléfono…" /></label>
            <label>Motivo<input name="motivo" defaultValue={editing?.motivo ?? ""} placeholder="Ej.: actividades pendientes" /></label>
            <label>Resumen<textarea name="resumen" rows={5} defaultValue={editing?.resumen ?? ""} placeholder="Qué se trató, respuesta del alumno, próximos pasos…" /></label>
            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Registrar comunicación"}</button>
              {editing && <button className="secondary" type="button" onClick={() => { setEditing(null); setError(""); setMessage(""); }}>Cancelar</button>}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="save-message success" role="status">{message}</p>}
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">HISTÓRICO</p><h3>{visibleRows.length} de {rows.length} comunicaciones</h3></div><button className="text-button" type="button" onClick={() => void load()}>Actualizar</button></div>

          <div className="list-toolbar" aria-label="Filtrar comunicaciones">
            <label className="search-field"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Alumno, canal, motivo o texto" /></label>
            <label>Asignatura
              <select value={filterSubjectId} onChange={(event) => setFilterSubjectId(event.target.value ? Number(event.target.value) : "")}>
                <option value="">Todas</option>
                {subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.nombre}</option>)}
              </select>
            </label>
          </div>

          {rows.length === 0 ? <div className="empty-state compact-empty"><strong>No hay comunicaciones</strong><p>Los contactos relevantes con los alumnos aparecerán aquí.</p></div> : visibleRows.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay comunicaciones que coincidan con los filtros.</strong></div>
          ) : (
            <div className="communication-list">
              {visibleRows.map((row) => (
                <article className="communication-card" key={row.id}>
                  <div className="communication-head">
                    <div><strong>{row.alumno.apellidos}, {row.alumno.nombre}</strong><small>{row.asignatura?.nombre ?? "General"}</small></div>
                    <span className="communication-channel">{row.canal}</span>
                  </div>
                  <div className="communication-date">{formatDate(row.fecha)}</div>
                  {row.motivo && <h4>{row.motivo}</h4>}
                  <p>{row.resumen || "Sin resumen."}</p>
                  <div className="tutorial-actions"><button className="secondary compact-button" type="button" onClick={() => startEditing(row)}>Editar</button></div>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
