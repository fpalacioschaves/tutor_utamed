import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { StudentSummary, Subject, Tutorial, TutorialState } from "../types";

const STATUS_LABELS: Record<TutorialState, string> = {
  SOLICITADA: "Solicitada",
  PROGRAMADA: "Programada",
  REALIZADA: "Realizada",
  CANCELADA: "Cancelada",
  NO_PRESENTADO: "No presentado",
};

type FilterState = "ALL" | TutorialState;

type TutorialDeletionImpact = {
  followUps: number;
  hasLinkedData: boolean;
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function nowLocalInput() {
  return toLocalInput(new Date().toISOString());
}

function formatDate(value: string | null) {
  if (!value) return "Sin programar";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function TutorialsPage() {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [editing, setEditing] = useState<Tutorial | null>(null);
  const [followUpFor, setFollowUpFor] = useState<Tutorial | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<FilterState>("ALL");
  const [filterSubjectId, setFilterSubjectId] = useState<number | "">("");
  const formPanelRef = useRef<HTMLElement | null>(null);

  async function load() {
    setError("");
    try {
      const [tutorialsResponse, studentsResponse, subjectsResponse] = await Promise.all([
        fetch("/api/tutorials"),
        fetch("/api/students"),
        fetch("/api/subjects"),
      ]);
      if (!tutorialsResponse.ok || !studentsResponse.ok || !subjectsResponse.ok) throw new Error("No se pudieron cargar las tutorías");
      setTutorials(await tutorialsResponse.json());
      setStudents(await studentsResponse.json());
      setSubjects(await subjectsResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar tutorías");
    }
  }

  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => ({
    solicitadas: tutorials.filter((item) => item.estado === "SOLICITADA").length,
    programadas: tutorials.filter((item) => item.estado === "PROGRAMADA").length,
    realizadas: tutorials.filter((item) => item.estado === "REALIZADA").length,
  }), [tutorials]);

  const visibleTutorials = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return tutorials.filter((tutorial) => {
      if (filterState !== "ALL" && tutorial.estado !== filterState) return false;
      if (filterSubjectId !== "" && tutorial.asignatura?.id !== filterSubjectId) return false;
      if (!query) return true;
      return [
        tutorial.alumno.apellidos,
        tutorial.alumno.nombre,
        tutorial.motivo ?? "",
        tutorial.observaciones ?? "",
        tutorial.acuerdos ?? "",
        tutorial.asignatura?.nombre ?? "",
      ].join(" ").toLocaleLowerCase("es").includes(query);
    });
  }, [tutorials, search, filterState, filterSubjectId]);

  async function saveTutorial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const payload = {
      alumnoId: Number(data.get("alumnoId")),
      asignaturaId: data.get("asignaturaId") || null,
      fechaSolicitud: data.get("fechaSolicitud"),
      inicio: data.get("inicio") || null,
      fin: data.get("fin") || null,
      estado: data.get("estado"),
      motivo: data.get("motivo"),
      observaciones: data.get("observaciones"),
      acuerdos: data.get("acuerdos"),
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const wasEditing = Boolean(editing);
      const response = await fetch(editing ? `/api/tutorials/${editing.id}` : "/api/tutorials", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la tutoría");
      }
      formElement.reset();
      setEditing(null);
      setMessage(wasEditing ? "Tutoría actualizada correctamente." : "Tutoría creada correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la tutoría");
    } finally {
      setSaving(false);
    }
  }

  async function createFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!followUpFor) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alumnoId: followUpFor.alumno.id,
          asignaturaId: followUpFor.asignatura?.id ?? null,
          tutoriaIndividualId: followUpFor.id,
          descripcion: data.get("descripcion"),
          fechaObjetivo: data.get("fechaObjetivo"),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo crear el seguimiento");
      }
      setFollowUpFor(null);
      setMessage("Seguimiento creado desde la tutoría.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el seguimiento");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTutorial(tutorial: Tutorial) {
    setError("");
    setMessage("");

    try {
      const impactResponse = await fetch(`/api/tutorials/${tutorial.id}/delete-impact`);
      const impactBody = await impactResponse.json().catch(() => ({}));
      if (!impactResponse.ok) throw new Error(impactBody.error ?? "No se pudo comprobar la tutoría");

      const impact = impactBody as TutorialDeletionImpact;
      const linkedWarning = impact.followUps > 0
        ? `\n\nTambién se eliminarán ${impact.followUps} seguimiento${impact.followUps === 1 ? "" : "s"} vinculado${impact.followUps === 1 ? "" : "s"} a esta tutoría.`
        : "";
      const date = formatDate(tutorial.inicio ?? tutorial.fechaSolicitud);
      const confirmed = window.confirm(
        `¿Borrar definitivamente la tutoría de ${tutorial.alumno.nombre} ${tutorial.alumno.apellidos} (${date})?${linkedWarning}\n\nEsta acción no se puede deshacer.`,
      );
      if (!confirmed) return;

      setDeletingId(tutorial.id);
      const response = await fetch(`/api/tutorials/${tutorial.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo borrar la tutoría");

      if (editing?.id === tutorial.id) setEditing(null);
      if (followUpFor?.id === tutorial.id) setFollowUpFor(null);
      setMessage("Tutoría eliminada correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la tutoría");
    } finally {
      setDeletingId(null);
    }
  }

  function startEditing(tutorial: Tutorial) {
    setEditing(tutorial);
    setFollowUpFor(null);
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
        <div>
          <p className="eyebrow">ATENCIÓN PERSONALIZADA</p>
          <h2>Tutorías individuales</h2>
          <p>Registra solicitudes, programación, lo tratado, acuerdos y el seguimiento posterior de cada alumno.</p>
        </div>
      </header>

      <section className="tutorial-kpis">
        <article className="mini-stat"><span>Solicitadas</span><strong>{counts.solicitadas}</strong></article>
        <article className="mini-stat"><span>Programadas</span><strong>{counts.programadas}</strong></article>
        <article className="mini-stat"><span>Realizadas</span><strong>{counts.realizadas}</strong></article>
      </section>

      {error && <div className="notice-banner error" role="alert">{error}</div>}
      {message && <div className="notice-banner success" role="status">{message}</div>}

      <section className="content-grid tutorials-grid">
        <article className="panel" ref={formPanelRef}>
          <div className="panel-heading"><div><p className="eyebrow">{editing ? "EDITANDO" : "NUEVA"}</p><h3>{editing ? "Editar tutoría" : "Nueva tutoría"}</h3></div></div>
          <form className="form-stack" onSubmit={saveTutorial} key={editing?.id ?? "new"}>
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
            <div className="form-row">
              <label>Fecha de solicitud<input name="fechaSolicitud" type="datetime-local" required defaultValue={editing ? toLocalInput(editing.fechaSolicitud) : nowLocalInput()} /></label>
              <label>Estado
                <select name="estado" defaultValue={editing?.estado ?? "SOLICITADA"}>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>Inicio<input name="inicio" type="datetime-local" defaultValue={toLocalInput(editing?.inicio ?? null)} /></label>
              <label>Fin<input name="fin" type="datetime-local" defaultValue={toLocalInput(editing?.fin ?? null)} /></label>
            </div>
            <label>Motivo<textarea name="motivo" rows={3} defaultValue={editing?.motivo ?? ""} placeholder="Qué solicita o qué quieres tratar" /></label>
            <label>Observaciones<textarea name="observaciones" rows={4} defaultValue={editing?.observaciones ?? ""} placeholder="Qué se ha tratado en la tutoría" /></label>
            <label>Acuerdos<textarea name="acuerdos" rows={3} defaultValue={editing?.acuerdos ?? ""} placeholder="Tareas, compromisos o próximos pasos" /></label>
            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving || deletingId !== null}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar tutoría"}</button>
              {editing && <button className="secondary" type="button" disabled={deletingId !== null} onClick={() => { setEditing(null); setError(""); setMessage(""); }}>Cancelar</button>}
            </div>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">HISTÓRICO</p><h3>{visibleTutorials.length} de {tutorials.length} tutorías</h3></div><button className="text-button" type="button" onClick={() => void load()}>Actualizar</button></div>

          <div className="list-toolbar" aria-label="Filtrar tutorías">
            <label className="search-field"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Alumno, motivo, acuerdos…" /></label>
            <label>Estado
              <select value={filterState} onChange={(event) => setFilterState(event.target.value as FilterState)}>
                <option value="ALL">Todos</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Asignatura
              <select value={filterSubjectId} onChange={(event) => setFilterSubjectId(event.target.value ? Number(event.target.value) : "")}>
                <option value="">Todas</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.nombre}</option>)}
              </select>
            </label>
          </div>

          {tutorials.length === 0 ? <div className="empty-state compact-empty"><strong>No hay tutorías individuales</strong><p>Registra la primera cuando un alumno la solicite.</p></div> : visibleTutorials.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay tutorías que coincidan con los filtros.</strong></div>
          ) : (
            <div className="tutorial-list">
              {visibleTutorials.map((tutorial) => (
                <article className="tutorial-card" key={tutorial.id}>
                  <div className="tutorial-card-head">
                    <div><span className="tag">{tutorial.asignatura?.nombre ?? "General"}</span><strong>{tutorial.alumno.apellidos}, {tutorial.alumno.nombre}</strong><small>{formatDate(tutorial.inicio ?? tutorial.fechaSolicitud)}</small></div>
                    <span className={`status-pill tutorial-${tutorial.estado.toLowerCase()}`}>{STATUS_LABELS[tutorial.estado]}</span>
                  </div>
                  {tutorial.motivo && <div className="tutorial-text"><b>Motivo</b><p>{tutorial.motivo}</p></div>}
                  {tutorial.observaciones && <div className="tutorial-text"><b>Observaciones</b><p>{tutorial.observaciones}</p></div>}
                  {tutorial.acuerdos && <div className="tutorial-text"><b>Acuerdos</b><p>{tutorial.acuerdos}</p></div>}
                  <div className="tutorial-actions">
                    <button className="secondary compact-button" type="button" disabled={deletingId !== null} onClick={() => startEditing(tutorial)}>Editar</button>
                    <button className="primary compact-button" type="button" disabled={deletingId !== null} onClick={() => { setFollowUpFor(followUpFor?.id === tutorial.id ? null : tutorial); setEditing(null); setError(""); setMessage(""); }}>Crear seguimiento</button>
                    <button className="secondary compact-button content-delete" type="button" disabled={deletingId !== null || saving} onClick={() => void deleteTutorial(tutorial)}>
                      {deletingId === tutorial.id ? "Borrando…" : "Borrar tutoría"}
                    </button>
                    {(tutorial._count?.seguimientos ?? 0) > 0 && <small>{tutorial._count?.seguimientos} seguimiento(s) vinculado(s)</small>}
                  </div>
                  {followUpFor?.id === tutorial.id && (
                    <form className="inline-followup" onSubmit={createFollowUp}>
                      <label>Qué quieres comprobar<textarea name="descripcion" required rows={2} defaultValue={tutorial.acuerdos ?? ""} /></label>
                      <label>Fecha objetivo<input name="fechaObjetivo" required type="datetime-local" /></label>
                      <div className="form-actions"><button className="primary compact-button" type="submit" disabled={saving}>Guardar seguimiento</button><button className="secondary compact-button" type="button" onClick={() => setFollowUpFor(null)}>Cancelar</button></div>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
