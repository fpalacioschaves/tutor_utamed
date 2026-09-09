import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Activity, Subject, Unit } from "../types";

type Props = {
  onOpenActivity: (id: number) => void;
};

type SubjectOption = Subject & { activa?: boolean };
type DueFilter = "ALL" | "WITH_DATE" | "WITHOUT_DATE" | "OVERDUE" | "UPCOMING";

function formatDate(value: string | null) {
  if (!value) return "Sin fecha límite";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function toLocalInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function ActivitiesPage({ onOpenActivity }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "">("");
  const [selectedUnitId, setSelectedUnitId] = useState<number | "">("");
  const [editing, setEditing] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState<number | "">("");
  const [dueFilter, setDueFilter] = useState<DueFilter>("ALL");
  const formPanelRef = useRef<HTMLElement | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [activitiesResponse, subjectsResponse] = await Promise.all([
        fetch("/api/activities"),
        fetch("/api/subjects"),
      ]);
      if (!activitiesResponse.ok || !subjectsResponse.ok) throw new Error("No se pudieron cargar las actividades");
      setActivities(await activitiesResponse.json());
      setSubjects(await subjectsResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar actividades");
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

  const visibleActivities = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    const now = Date.now();
    return activities.filter((activity) => {
      if (filterSubjectId !== "" && activity.asignatura.id !== filterSubjectId) return false;
      const due = activity.fechaLimite ? new Date(activity.fechaLimite).getTime() : null;
      if (dueFilter === "WITH_DATE" && due === null) return false;
      if (dueFilter === "WITHOUT_DATE" && due !== null) return false;
      if (dueFilter === "OVERDUE" && (due === null || due >= now)) return false;
      if (dueFilter === "UPCOMING" && (due === null || due < now)) return false;
      if (!query) return true;
      return [activity.titulo, activity.descripcion ?? "", activity.asignatura.nombre, activity.unidad?.titulo ?? ""]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query);
    });
  }, [activities, search, filterSubjectId, dueFilter]);

  function startEditing(activity: Activity) {
    setEditing(activity);
    setSelectedSubjectId(activity.asignatura.id);
    setSelectedUnitId(activity.unidad?.id ?? "");
    setError("");
    setMessage("");
    requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function cancelEditing() {
    setEditing(null);
    setSelectedSubjectId("");
    setSelectedUnitId("");
    setUnits([]);
    setError("");
    setMessage("");
  }

  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      asignaturaId: Number(selectedSubjectId),
      unidadId: selectedUnitId === "" ? null : Number(selectedUnitId),
      titulo: form.get("titulo"),
      descripcion: form.get("descripcion"),
      fechaPublicacion: form.get("fechaPublicacion") || null,
      fechaLimite: form.get("fechaLimite") || null,
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const wasEditing = Boolean(editing);
      const response = await fetch(editing ? `/api/activities/${editing.id}` : "/api/activities", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la actividad");
      }
      formElement.reset();
      setEditing(null);
      setSelectedSubjectId("");
      setSelectedUnitId("");
      setUnits([]);
      setMessage(wasEditing ? "Actividad actualizada correctamente." : "Actividad creada correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la actividad");
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
          <p className="eyebrow">SEGUIMIENTO ACADÉMICO</p>
          <h2>Actividades</h2>
          <p>Crea actividades, vincúlalas a su unidad y registra después el trabajo, la nota y tus observaciones de cada alumno.</p>
        </div>
      </header>

      <section className="content-grid activities-grid">
        <article className="panel" ref={formPanelRef}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editing ? "EDITANDO" : "NUEVA"}</p>
              <h3>{editing ? "Editar actividad" : "Nueva actividad"}</h3>
            </div>
          </div>

          <form className="form-stack" onSubmit={saveActivity} key={editing?.id ?? "new"}>
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
                {formSubjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.nombre}{subject.activa === false ? " (inactiva)" : ""}</option>)}
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
              {selectedSubjectId !== "" && !loadingUnits && units.length === 0 && (
                <small className="muted">Esta asignatura todavía no tiene unidades.</small>
              )}
            </label>

            <label>
              Título
              <input name="titulo" required defaultValue={editing?.titulo ?? ""} placeholder="Ej. Práctica de arrays" />
            </label>

            <label>
              Descripción
              <textarea name="descripcion" rows={4} defaultValue={editing?.descripcion ?? ""} placeholder="Opcional" />
            </label>

            <div className="form-row">
              <label>
                Publicación
                <input name="fechaPublicacion" type="datetime-local" defaultValue={toLocalInputValue(editing?.fechaPublicacion ?? null)} />
              </label>
              <label>
                Fecha límite
                <input name="fechaLimite" type="datetime-local" defaultValue={toLocalInputValue(editing?.fechaLimite ?? null)} />
              </label>
            </div>

            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving || formSubjects.length === 0 || selectedSubjectId === ""}>
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear actividad"}
              </button>
              {editing && (
                <button className="secondary" type="button" onClick={cancelEditing}>
                  Cancelar
                </button>
              )}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="save-message success" role="status">{message}</p>}
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">REGISTRADAS</p><h3>{visibleActivities.length} de {activities.length} actividades</h3></div>
            <button className="text-button" type="button" onClick={() => void load()}>Actualizar</button>
          </div>

          <div className="list-toolbar" aria-label="Filtrar actividades">
            <label className="search-field">
              <span>Buscar</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, descripción, unidad o asignatura" />
            </label>
            <label>
              Asignatura
              <select value={filterSubjectId} onChange={(event) => setFilterSubjectId(event.target.value ? Number(event.target.value) : "")}>
                <option value="">Todas</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.nombre}</option>)}
              </select>
            </label>
            <label>
              Fecha límite
              <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value as DueFilter)}>
                <option value="ALL">Todas</option>
                <option value="UPCOMING">Próximas</option>
                <option value="OVERDUE">Vencidas</option>
                <option value="WITH_DATE">Con fecha</option>
                <option value="WITHOUT_DATE">Sin fecha</option>
              </select>
            </label>
          </div>

          {loading ? (
            <p className="muted">Cargando actividades…</p>
          ) : activities.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay actividades todavía</strong><p>Crea la primera para comenzar el seguimiento académico.</p></div>
          ) : visibleActivities.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay actividades que coincidan con los filtros.</strong><p>Prueba con otra búsqueda o elimina algún filtro.</p></div>
          ) : (
            <div className="activity-list">
              {visibleActivities.map((activity) => (
                <article className="activity-row-card" key={activity.id}>
                  <button className="activity-open" type="button" onClick={() => onOpenActivity(activity.id)}>
                    <div className="activity-main">
                      <span className="tag">{activity.asignatura.nombre}</span>
                      <strong>{activity.titulo}</strong>
                      <small>{activity.unidad ? `U${activity.unidad.orden} · ${activity.unidad.titulo}` : "Sin unidad"}</small>
                      <small>{activity.descripcion || "Sin descripción"}</small>
                    </div>
                    <div className="activity-meta">
                      <span>{formatDate(activity.fechaLimite)}</span>
                      <small>{activity._count?.entregas ?? 0} registros guardados</small>
                    </div>
                  </button>
                  <button className="secondary compact-button" type="button" onClick={() => startEditing(activity)}>
                    Editar
                  </button>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
