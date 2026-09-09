import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Session, Subject, Unit } from "../types";

type Props = {
  onOpenSession: (id: number) => void;
};

type SubjectOption = Subject & { activa?: boolean };
type PeriodFilter = "ALL" | "UPCOMING" | "PAST";

const SESSION_STATUS_LABELS: Record<Session["estado"], string> = {
  PROGRAMADA: "Programada",
  REALIZADA: "Realizada",
  CANCELADA: "Cancelada",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toLocalInputValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SessionsPage({ onOpenSession }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "">("");
  const [selectedUnitId, setSelectedUnitId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState<number | "">("");
  const [filterType, setFilterType] = useState<"" | Session["tipo"]>("");
  const [filterState, setFilterState] = useState<"" | Session["estado"]>("");
  const [period, setPeriod] = useState<PeriodFilter>("ALL");
  const formPanelRef = useRef<HTMLElement | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [sessionsResponse, subjectsResponse] = await Promise.all([
        fetch("/api/sessions"),
        fetch("/api/subjects"),
      ]);
      if (!sessionsResponse.ok || !subjectsResponse.ok) throw new Error("No se pudieron cargar los datos");
      setSessions(await sessionsResponse.json());
      setSubjects(await subjectsResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar sesiones");
    } finally {
      setLoading(false);
    }
  }

  async function loadUnits(subjectId: number) {
    setLoadingUnits(true);
    try {
      const response = await fetch(`/api/subjects/${subjectId}/units`);
      if (!response.ok) throw new Error("No se pudieron cargar las unidades");
      const data: Unit[] = await response.json();
      setUnits(data);
    } catch (err) {
      setUnits([]);
      setError(err instanceof Error ? err.message : "No se pudieron cargar las unidades");
    } finally {
      setLoadingUnits(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (selectedSubjectId === "") {
      setUnits([]);
      setSelectedUnitId("");
      return;
    }
    void loadUnits(selectedSubjectId);
  }, [selectedSubjectId]);

  const visibleSessions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    const now = Date.now();

    return sessions
      .filter((session) => {
        if (filterSubjectId !== "" && session.asignatura.id !== filterSubjectId) return false;
        if (filterType && session.tipo !== filterType) return false;
        if (filterState && session.estado !== filterState) return false;

        const start = new Date(session.inicio).getTime();
        if (period === "UPCOMING" && start < now) return false;
        if (period === "PAST" && start >= now) return false;

        if (!query) return true;
        const haystack = [
          session.asignatura.nombre,
          session.titulo ?? "",
          session.tema ?? "",
          session.unidad?.titulo ?? "",
          session.tipo === "CLASE" ? "clase" : "tutoría grupal",
        ].join(" ").toLocaleLowerCase("es");
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const aTime = new Date(a.inicio).getTime();
        const bTime = new Date(b.inicio).getTime();
        return period === "UPCOMING" ? aTime - bTime : bTime - aTime;
      });
  }, [sessions, search, filterSubjectId, filterType, filterState, period]);

  function startCreating() {
    setEditing(null);
    setSelectedSubjectId("");
    setSelectedUnitId("");
    setUnits([]);
    setError("");
    setMessage("");
    setShowForm(true);
    requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function startEditing(session: Session) {
    setEditing(session);
    setSelectedSubjectId(session.asignatura.id);
    setSelectedUnitId(session.unidad?.id ?? "");
    setError("");
    setMessage("");
    setShowForm(true);
    requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setSelectedSubjectId("");
    setSelectedUnitId("");
    setUnits([]);
    setError("");
  }

  async function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      asignaturaId: Number(selectedSubjectId),
      unidadId: selectedUnitId === "" ? null : Number(selectedUnitId),
      tipo: form.get("tipo"),
      titulo: form.get("titulo"),
      tema: form.get("tema"),
      inicio: form.get("inicio"),
      fin: form.get("fin"),
      estado: form.get("estado") || "PROGRAMADA",
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const wasEditing = Boolean(editing);
      const response = await fetch(editing ? `/api/sessions/${editing.id}` : "/api/sessions", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? (editing ? "No se pudo actualizar la sesión" : "No se pudo crear la sesión"));
      }

      formElement.reset();
      setEditing(null);
      setSelectedSubjectId("");
      setSelectedUnitId("");
      setUnits([]);
      setShowForm(false);
      setMessage(wasEditing ? "Sesión actualizada correctamente." : "Sesión creada correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la sesión");
    } finally {
      setSaving(false);
    }
  }

  const activeSubjects = subjects.filter((subject) => subject.activa !== false);
  const formSubjects = editing && !activeSubjects.some((subject) => subject.id === editing.asignatura.id)
    ? [...activeSubjects, editing.asignatura as SubjectOption]
    : activeSubjects;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">DOCENCIA</p>
          <h2>Sesiones</h2>
          <p>Consulta todas las clases y tutorías grupales, abre una sesión para pasar asistencia y edítala cuando lo necesites.</p>
        </div>
        <button className="primary" type="button" onClick={startCreating}>Nueva sesión</button>
      </header>

      {message && <p className="notice-banner success" role="status">{message}</p>}

      {showForm && (
        <section className="panel session-form-panel" ref={formPanelRef}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editing ? "EDITANDO" : "NUEVA"}</p>
              <h3>{editing ? "Editar sesión" : "Nueva sesión"}</h3>
            </div>
            <button className="text-button" type="button" onClick={closeForm}>Cerrar</button>
          </div>

          <form className="form-stack session-form-grid" onSubmit={saveSession} key={editing?.id ?? "new"}>
            <label>
              Asignatura
              <select
                name="asignaturaId"
                required
                value={selectedSubjectId}
                onChange={(event) => {
                  const value = event.target.value ? Number(event.target.value) : "";
                  setSelectedSubjectId(value);
                  setSelectedUnitId("");
                }}
              >
                <option value="" disabled>Selecciona una asignatura</option>
                {formSubjects.map((subject) => (
                  <option value={subject.id} key={subject.id}>{subject.nombre}{subject.activa === false ? " (inactiva)" : ""}</option>
                ))}
              </select>
            </label>

            <label>
              Unidad
              <select
                name="unidadId"
                value={selectedUnitId}
                disabled={selectedSubjectId === "" || loadingUnits}
                onChange={(event) => setSelectedUnitId(event.target.value ? Number(event.target.value) : "")}
              >
                <option value="">Sin unidad específica</option>
                {units.map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    U{unit.orden} · {unit.titulo}{unit.activa ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tipo
              <select name="tipo" defaultValue={editing?.tipo ?? "CLASE"}>
                <option value="CLASE">Clase</option>
                <option value="TUTORIA_GRUPAL">Tutoría grupal</option>
              </select>
            </label>

            <label>
              Estado
              <select name="estado" defaultValue={editing?.estado ?? "PROGRAMADA"}>
                <option value="PROGRAMADA">Programada</option>
                <option value="REALIZADA">Realizada</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </label>

            <label>
              Título
              <input name="titulo" placeholder="Opcional" defaultValue={editing?.titulo ?? ""} />
            </label>

            <label>
              Tema
              <input name="tema" placeholder="Ej. Arrays" defaultValue={editing?.tema ?? ""} />
            </label>

            <label>
              Inicio
              <input name="inicio" type="datetime-local" required defaultValue={editing ? toLocalInputValue(editing.inicio) : ""} />
            </label>

            <label>
              Fin
              <input name="fin" type="datetime-local" required defaultValue={editing ? toLocalInputValue(editing.fin) : ""} />
            </label>

            <div className="form-actions session-form-actions">
              <button className="primary" disabled={saving || formSubjects.length === 0 || selectedSubjectId === ""} type="submit">
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear sesión"}
              </button>
              <button className="secondary" type="button" onClick={closeForm}>Cancelar</button>
            </div>
            {error && <p className="form-error session-form-error" role="alert">{error}</p>}
          </form>
        </section>
      )}

      <section className="panel sessions-list-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">TODAS LAS SESIONES</p>
            <h3>{visibleSessions.length} de {sessions.length}</h3>
          </div>
          <button className="text-button" type="button" onClick={() => void load()}>Actualizar</button>
        </div>

        <div className="list-toolbar list-toolbar-wide" aria-label="Filtrar sesiones">
          <label className="search-field">
            <span>Buscar</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Asignatura, tema, título o unidad" />
          </label>
          <label>
            Periodo
            <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodFilter)}>
              <option value="ALL">Todas</option>
              <option value="UPCOMING">Próximas</option>
              <option value="PAST">Pasadas</option>
            </select>
          </label>
          <label>
            Asignatura
            <select value={filterSubjectId} onChange={(event) => setFilterSubjectId(event.target.value ? Number(event.target.value) : "")}>
              <option value="">Todas</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.nombre}</option>)}
            </select>
          </label>
          <label>
            Tipo
            <select value={filterType} onChange={(event) => setFilterType(event.target.value as typeof filterType)}>
              <option value="">Todos</option>
              <option value="CLASE">Clase</option>
              <option value="TUTORIA_GRUPAL">Tutoría grupal</option>
            </select>
          </label>
          <label>
            Estado
            <select value={filterState} onChange={(event) => setFilterState(event.target.value as typeof filterState)}>
              <option value="">Todos</option>
              <option value="PROGRAMADA">Programada</option>
              <option value="REALIZADA">Realizada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p className="muted">Cargando sesiones…</p>
        ) : error && !showForm ? (
          <p className="notice-banner error" role="alert">{error}</p>
        ) : sessions.length === 0 ? (
          <div className="empty-state compact-empty"><strong>Aún no hay sesiones</strong><p>Crea la primera sesión con el botón “Nueva sesión”.</p></div>
        ) : visibleSessions.length === 0 ? (
          <div className="empty-state compact-empty"><strong>No hay sesiones que coincidan con los filtros.</strong><p>Cambia el periodo o elimina algún filtro.</p></div>
        ) : (
          <div className="sessions-table-wrap">
            <table className="data-table sessions-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Horario</th>
                  <th>Asignatura</th>
                  <th>Tipo</th>
                  <th>Unidad / tema</th>
                  <th>Estado</th>
                  <th>Registros</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((session) => (
                  <tr key={session.id} className={session.estado === "CANCELADA" ? "is-inactive" : ""}>
                    <td>{new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(session.inicio))}</td>
                    <td>{formatTime(session.inicio)}–{formatTime(session.fin)}</td>
                    <td><strong>{session.asignatura.nombre}</strong></td>
                    <td>{session.tipo === "CLASE" ? "Clase" : "Tutoría grupal"}</td>
                    <td>
                      <strong>{session.unidad ? `U${session.unidad.orden} · ${session.unidad.titulo}` : "Sin unidad"}</strong>
                      <small className="block-note">{session.tema || session.titulo || "Sin tema indicado"}</small>
                    </td>
                    <td><span className={`status-pill session-state-${session.estado.toLowerCase()}`}>{SESSION_STATUS_LABELS[session.estado]}</span></td>
                    <td>{session._count?.registros ?? 0}</td>
                    <td>
                      <div className="row-actions sessions-row-actions">
                        <button className="primary compact-button" type="button" onClick={() => onOpenSession(session.id)}>Abrir</button>
                        <button className="secondary compact-button" type="button" onClick={() => startEditing(session)}>Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
