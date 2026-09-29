import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  CommunicationInteraction,
  CommunicationThread,
  StudentSummary,
  Subject,
} from "../types";

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
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function directionLabel(direction: CommunicationInteraction["direccion"]) {
  return direction === "ENTRANTE" ? "Recibida" : "Enviada";
}

function latestInteraction(thread: CommunicationThread) {
  return thread.interacciones[0] ?? null;
}

export function CommunicationsPage() {
  const [threads, setThreads] = useState<CommunicationThread[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [editingInteraction, setEditingInteraction] = useState<CommunicationInteraction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filterStudentId, setFilterStudentId] = useState<number | "">("");
  const [filterChannel, setFilterChannel] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function load() {
    setError("");
    try {
      const [threadsResponse, studentsResponse, subjectsResponse] = await Promise.all([
        fetch("/api/communications/threads"),
        fetch("/api/students"),
        fetch("/api/subjects"),
      ]);
      if (!threadsResponse.ok || !studentsResponse.ok || !subjectsResponse.ok) {
        throw new Error("No se pudieron cargar las comunicaciones");
      }

      const threadRows = await threadsResponse.json() as CommunicationThread[];
      setThreads(threadRows);
      setStudents(await studentsResponse.json());
      setSubjects(await subjectsResponse.json());

      setSelectedThreadId((current) => {
        if (current !== null && threadRows.some((thread) => thread.id === current)) return current;
        return threadRows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar comunicaciones");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  const activeStudents = students.filter((student) => student.activo !== false);
  const activeSubjects = subjects.filter((subject) => subject.activa !== false);

  const channels = useMemo(
    () => Array.from(new Set(
      threads.flatMap((thread) => thread.interacciones.map((interaction) => interaction.canal.trim()))
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b, "es")),
    [threads],
  );

  const totalInteractions = useMemo(
    () => threads.reduce((total, thread) => total + thread.interacciones.length, 0),
    [threads],
  );

  const thisMonth = useMemo(() => {
    const now = new Date();
    return threads.reduce((total, thread) => total + thread.interacciones.filter((interaction) => {
      const date = new Date(interaction.fecha);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }).length, 0);
  }, [threads]);

  const visibleThreads = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59.999") : null;

    return threads.filter((thread) => {
      if (filterStudentId !== "" && thread.alumno.id !== filterStudentId) return false;

      if (filterChannel && !thread.interacciones.some((interaction) => interaction.canal === filterChannel)) {
        return false;
      }

      if (from || to) {
        const hasInteractionInRange = thread.interacciones.some((interaction) => {
          const date = new Date(interaction.fecha);
          if (from && date < from) return false;
          if (to && date > to) return false;
          return true;
        });
        if (!hasInteractionInRange) return false;
      }

      if (!query) return true;

      return [
        thread.asunto,
        thread.alumno.nombre,
        thread.alumno.apellidos,
        thread.asignatura?.nombre ?? "",
        ...thread.interacciones.flatMap((interaction) => [
          interaction.canal,
          interaction.resumen ?? "",
          interaction.observaciones ?? "",
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query);
    });
  }, [threads, search, filterStudentId, filterChannel, dateFrom, dateTo]);

  async function createThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      alumnoId: Number(data.get("alumnoId")),
      asignaturaId: data.get("asignaturaId") || null,
      asunto: data.get("asunto"),
      fecha: data.get("fecha"),
      direccion: data.get("direccion"),
      canal: data.get("canal"),
      resumen: data.get("resumen"),
      observaciones: data.get("observaciones"),
    };

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/communications/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo crear el hilo");

      setSelectedThreadId(body.id);
      setNewThreadOpen(false);
      setMessage("Hilo de comunicación creado correctamente.");
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el hilo");
    } finally {
      setSaving(false);
    }
  }

  async function saveInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      fecha: data.get("fecha"),
      direccion: data.get("direccion"),
      canal: data.get("canal"),
      resumen: data.get("resumen"),
      observaciones: data.get("observaciones"),
    };

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        editingInteraction
          ? `/api/communications/interactions/${editingInteraction.id}`
          : `/api/communications/threads/${selectedThread.id}/interactions`,
        {
          method: editingInteraction ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo guardar la interacción");
      }

      form.reset();
      setEditingInteraction(null);
      setMessage(editingInteraction
        ? "Interacción actualizada correctamente."
        : "Interacción añadida al hilo.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la interacción");
    } finally {
      setSaving(false);
    }
  }

  function selectThread(id: number) {
    setSelectedThreadId(id);
    setEditingInteraction(null);
    setError("");
    setMessage("");
  }

  function clearFilters() {
    setSearch("");
    setFilterStudentId("");
    setFilterChannel("");
    setDateFrom("");
    setDateTo("");
  }

  const chronologicalInteractions = selectedThread
    ? [...selectedThread.interacciones].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
    )
    : [];

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">CONTACTO CON EL ALUMNADO</p>
          <h2>Comunicaciones</h2>
          <p>Organiza cada asunto como un hilo y conserva en él todo el intercambio con el alumno.</p>
        </div>
        <button
          className="primary"
          type="button"
          onClick={() => {
            setNewThreadOpen((open) => !open);
            setEditingInteraction(null);
            setError("");
            setMessage("");
          }}
        >
          {newThreadOpen ? "Cerrar nueva comunicación" : "+ Nueva comunicación"}
        </button>
      </header>

      <section className="tutorial-kpis communications-kpis">
        <article className="mini-stat"><span>Hilos</span><strong>{threads.length}</strong></article>
        <article className="mini-stat"><span>Interacciones</span><strong>{totalInteractions}</strong></article>
        <article className="mini-stat"><span>Este mes</span><strong>{thisMonth}</strong></article>
        <article className="mini-stat">
          <span>Alumnos con contacto</span>
          <strong>{new Set(threads.map((thread) => thread.alumno.id)).size}</strong>
        </article>
      </section>

      {newThreadOpen && (
        <section className="panel communication-new-thread-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">NUEVO HILO</p>
              <h3>Nueva comunicación</h3>
              <p className="muted">El asunto identifica el hilo. Después podrás añadir todas las respuestas y seguimientos dentro de él.</p>
            </div>
          </div>

          <form className="form-stack communication-thread-form" onSubmit={createThread}>
            <div className="communication-form-grid">
              <label>Alumno
                <select name="alumnoId" required defaultValue="">
                  <option value="" disabled>Selecciona un alumno</option>
                  {activeStudents.map((student) => (
                    <option value={student.id} key={student.id}>
                      {student.apellidos}, {student.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label>Asignatura
                <select name="asignaturaId" defaultValue="">
                  <option value="">General / sin asignatura</option>
                  {activeSubjects.map((subject) => (
                    <option value={subject.id} key={subject.id}>{subject.nombre}</option>
                  ))}
                </select>
              </label>

              <label className="communication-form-wide">Asunto
                <input name="asunto" required placeholder="Ej.: Convalidación IPE I" />
              </label>

              <label>Tipo
                <select name="direccion" defaultValue="SALIENTE" required>
                  <option value="SALIENTE">Saliente · enviada por mí</option>
                  <option value="ENTRANTE">Entrante · recibida del alumno</option>
                </select>
              </label>

              <label>Canal
                <input name="canal" list="communication-channels" required placeholder="Email, teléfono, Teams…" />
              </label>

              <label>Fecha y hora
                <input name="fecha" type="datetime-local" required defaultValue={nowLocalInput()} />
              </label>

              <label className="communication-form-wide">Contenido / resumen
                <textarea
                  name="resumen"
                  rows={4}
                  required
                  placeholder="Qué se comunicó o qué respondió el alumno."
                />
              </label>

              <label className="communication-form-wide">Observaciones
                <textarea
                  name="observaciones"
                  rows={3}
                  placeholder="Notas internas adicionales, si hacen falta."
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Crear hilo"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setNewThreadOpen(false);
                  setError("");
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      {error && <p className="form-error communication-global-message" role="alert">{error}</p>}
      {message && <p className="save-message success communication-global-message" role="status">{message}</p>}

      <datalist id="communication-channels">
        <option value="Email" />
        <option value="Teléfono" />
        <option value="Campus" />
        <option value="Teams" />
        <option value="WhatsApp" />
        <option value="Videollamada" />
      </datalist>

      <section className="panel communications-filter-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">HISTÓRICO</p>
            <h3>{visibleThreads.length} de {threads.length} hilos</h3>
          </div>
          <button className="text-button" type="button" onClick={() => void load()}>Actualizar</button>
        </div>

        <div className="list-toolbar communications-toolbar" aria-label="Filtrar comunicaciones">
          <label className="search-field">
            <span>Buscar</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Alumno, asunto o texto"
            />
          </label>

          <label>Alumno
            <select
              value={filterStudentId}
              onChange={(event) => setFilterStudentId(event.target.value ? Number(event.target.value) : "")}
            >
              <option value="">Todos</option>
              {students.map((student) => (
                <option value={student.id} key={student.id}>{student.apellidos}, {student.nombre}</option>
              ))}
            </select>
          </label>

          <label>Canal
            <select value={filterChannel} onChange={(event) => setFilterChannel(event.target.value)}>
              <option value="">Todos</option>
              {channels.map((channel) => <option value={channel} key={channel}>{channel}</option>)}
            </select>
          </label>

          <label>Desde
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>

          <label>Hasta
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>

          <button className="secondary compact-button" type="button" onClick={clearFilters}>
            Limpiar
          </button>
        </div>
      </section>

      <section className="communications-workspace">
        <article className="panel communications-thread-list-panel">
          {threads.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No hay comunicaciones</strong>
              <p>Crea una comunicación para iniciar el primer hilo.</p>
            </div>
          ) : visibleThreads.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No hay hilos que coincidan con los filtros.</strong>
            </div>
          ) : (
            <div className="communication-thread-list">
              {visibleThreads.map((thread) => {
                const latest = latestInteraction(thread);
                const active = thread.id === selectedThreadId;
                return (
                  <button
                    className={`communication-thread-card ${active ? "active" : ""}`}
                    type="button"
                    key={thread.id}
                    onClick={() => selectThread(thread.id)}
                  >
                    <span className="communication-thread-card-head">
                      <strong>{thread.asunto}</strong>
                      <small>{thread.interacciones.length} {thread.interacciones.length === 1 ? "interacción" : "interacciones"}</small>
                    </span>
                    <span className="communication-thread-student">
                      {thread.alumno.apellidos}, {thread.alumno.nombre}
                    </span>
                    <span className="communication-thread-meta">
                      <span>{thread.asignatura?.nombre ?? "General"}</span>
                      <span>{latest ? formatDate(latest.fecha) : "Sin interacciones"}</span>
                    </span>
                    {latest && (
                      <span className="communication-thread-preview">
                        {latest.direccion === "ENTRANTE" ? "↓" : "↑"} {latest.canal} · {latest.resumen ?? "Sin resumen"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </article>

        <article className="panel communication-thread-detail-panel">
          {!selectedThread ? (
            <div className="empty-state">
              <strong>Selecciona un hilo</strong>
              <p>Aquí aparecerá el histórico completo de la conversación.</p>
            </div>
          ) : (
            <>
              <div className="communication-thread-detail-head">
                <div>
                  <p className="eyebrow">HILO DE COMUNICACIÓN</p>
                  <h3>{selectedThread.asunto}</h3>
                  <p>
                    <strong>{selectedThread.alumno.nombre} {selectedThread.alumno.apellidos}</strong>
                    {" · "}
                    {selectedThread.asignatura?.nombre ?? "General"}
                  </p>
                </div>
                <span className="section-count">{selectedThread.interacciones.length}</span>
              </div>

              <div className="communication-conversation" aria-label="Histórico del hilo">
                {chronologicalInteractions.map((interaction) => (
                  <article
                    className={`communication-interaction ${interaction.direccion.toLowerCase()}`}
                    key={interaction.id}
                  >
                    <div className="communication-interaction-head">
                      <div>
                        <span className={`communication-direction ${interaction.direccion.toLowerCase()}`}>
                          {interaction.direccion === "ENTRANTE" ? "↓" : "↑"} {directionLabel(interaction.direccion)}
                        </span>
                        <strong>{interaction.canal}</strong>
                      </div>
                      <time>{formatDate(interaction.fecha)}</time>
                    </div>

                    <p className="communication-interaction-summary">
                      {interaction.resumen || "Sin resumen."}
                    </p>

                    {interaction.observaciones && (
                      <div className="communication-interaction-notes">
                        <strong>Observaciones</strong>
                        <p>{interaction.observaciones}</p>
                      </div>
                    )}

                    <div className="communication-interaction-actions">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setEditingInteraction(interaction);
                          setError("");
                          setMessage("");
                        }}
                      >
                        Editar interacción
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <section className="communication-reply-panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">{editingInteraction ? "EDITANDO" : "SEGUIMIENTO"}</p>
                    <h4>{editingInteraction ? "Editar interacción" : "Añadir interacción"}</h4>
                  </div>
                </div>

                <form
                  className="form-stack"
                  onSubmit={saveInteraction}
                  key={`${selectedThread.id}-${editingInteraction?.id ?? "new"}`}
                >
                  <div className="communication-form-grid">
                    <label>Tipo
                      <select
                        name="direccion"
                        defaultValue={editingInteraction?.direccion ?? "SALIENTE"}
                        required
                      >
                        <option value="SALIENTE">Saliente · enviada por mí</option>
                        <option value="ENTRANTE">Entrante · recibida del alumno</option>
                      </select>
                    </label>

                    <label>Canal
                      <input
                        name="canal"
                        list="communication-channels"
                        required
                        defaultValue={editingInteraction?.canal ?? ""}
                        placeholder="Email, teléfono, Teams…"
                      />
                    </label>

                    <label>Fecha y hora
                      <input
                        name="fecha"
                        type="datetime-local"
                        required
                        defaultValue={
                          editingInteraction ? toLocalInput(editingInteraction.fecha) : nowLocalInput()
                        }
                      />
                    </label>

                    <label className="communication-form-wide">Contenido / resumen
                      <textarea
                        name="resumen"
                        rows={4}
                        required
                        defaultValue={editingInteraction?.resumen ?? ""}
                        placeholder="Respuesta, seguimiento o nueva información."
                      />
                    </label>

                    <label className="communication-form-wide">Observaciones
                      <textarea
                        name="observaciones"
                        rows={3}
                        defaultValue={editingInteraction?.observaciones ?? ""}
                        placeholder="Notas internas adicionales."
                      />
                    </label>
                  </div>

                  <div className="form-actions">
                    <button className="primary" type="submit" disabled={saving}>
                      {saving
                        ? "Guardando…"
                        : editingInteraction
                          ? "Guardar cambios"
                          : "Añadir al hilo"}
                    </button>
                    {editingInteraction && (
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => {
                          setEditingInteraction(null);
                          setError("");
                          setMessage("");
                        }}
                      >
                        Cancelar edición
                      </button>
                    )}
                  </div>
                </form>
              </section>
            </>
          )}
        </article>
      </section>
    </>
  );
}
