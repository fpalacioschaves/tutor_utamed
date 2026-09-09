import { useEffect, useMemo, useState } from "react";
import type { Summary } from "../types";

const EMPTY_SUMMARY: Summary = {
  course: null,
  students: 0,
  subjects: 0,
  sessionsToday: 0,
  tutorialsToday: 0,
  pendingFollowUps: 0,
  overdueFollowUps: 0,
  requestedTutorials: 0,
  openIncidents: 0,
  automaticAlerts: 0,
  today: { sessions: [], tutorials: [] },
  attention: { followUps: [], tutorials: [], incidents: [] },
};

type Props = {
  onOpenSessions: () => void;
  onOpenSession: (id: number) => void;
  onOpenStudent: (id: number) => void;
  onOpenTutorials: () => void;
  onOpenFollowUps: () => void;
  onOpenIncidents: () => void;
  onOpenAlerts: () => void;
};

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function studentName(student: { nombre: string; apellidos: string }) {
  return `${student.apellidos}, ${student.nombre}`;
}

export function DashboardPage({
  onOpenSessions,
  onOpenSession,
  onOpenStudent,
  onOpenTutorials,
  onOpenFollowUps,
  onOpenIncidents,
  onOpenAlerts,
}: Props) {
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/summary");
      if (!response.ok) throw new Error("No se pudo cargar el dashboard");
      setSummary(await response.json());
    } catch (err) {
      setSummary(EMPTY_SUMMARY);
      setError(err instanceof Error ? err.message : "No se pudo cargar el dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const agenda = useMemo(() => {
    const sessions = summary.today.sessions.map((session) => ({
      key: `session-${session.id}`,
      kind: "session" as const,
      date: session.inicio,
      session,
    }));
    const tutorials = summary.today.tutorials.map((tutorial) => ({
      key: `tutorial-${tutorial.id}`,
      kind: "tutorial" as const,
      date: tutorial.inicio ?? tutorial.fechaSolicitud,
      tutorial,
    }));
    return [...sessions, ...tutorials].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [summary]);

  const todayLabel = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <>
      <header className="page-header dashboard-header">
        <div>
          <p className="eyebrow">{summary.course?.nombre ? `Curso ${summary.course.nombre}` : "Tutor UTAMED"}</p>
          <h2>Dashboard</h2>
          <p className="dashboard-today">{todayLabel}</p>
          <p>Tu agenda docente y los asuntos que requieren atención, sin tener que buscarlos módulo por módulo.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </header>

      {error && <p className="form-error dashboard-error">{error}</p>}

      <section className="dashboard-stats" aria-label="Resumen de hoy">
        <article>
          <span>Alumnos</span>
          <strong>{summary.students}</strong>
          <small>{summary.subjects} asignaturas activas</small>
        </article>
        <article>
          <span>Sesiones hoy</span>
          <strong>{summary.sessionsToday}</strong>
          <small>Clases y tutorías grupales</small>
        </article>
        <article>
          <span>Tutorías hoy</span>
          <strong>{summary.tutorialsToday}</strong>
          <small>Individuales programadas</small>
        </article>
        <article className={summary.overdueFollowUps > 0 ? "attention-stat" : ""}>
          <span>Seguimientos vencidos</span>
          <strong>{summary.overdueFollowUps}</strong>
          <small>{summary.pendingFollowUps} pendientes en total</small>
        </article>
        <article className={summary.requestedTutorials > 0 ? "attention-stat" : ""}>
          <span>Tutorías solicitadas</span>
          <strong>{summary.requestedTutorials}</strong>
          <small>Sin programar todavía</small>
        </article>
        <article className={summary.openIncidents > 0 ? "attention-stat" : ""}>
          <span>Incidencias abiertas</span>
          <strong>{summary.openIncidents}</strong>
          <small>Abiertas o en seguimiento</small>
        </article>
        <article className={summary.automaticAlerts > 0 ? "attention-stat" : ""}>
          <span>Alertas automáticas</span>
          <strong>{summary.automaticAlerts}</strong>
          <small>Según tus reglas configuradas</small>
        </article>
      </section>

      <section className="dashboard-main-grid">
        <article className="panel dashboard-agenda-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">HOY</p>
              <h3>Agenda</h3>
            </div>
            <button className="text-button" type="button" onClick={onOpenSessions}>Ver todas las sesiones</button>
          </div>

          {agenda.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No tienes sesiones ni tutorías individuales programadas para hoy.</strong>
              <p>Cuando existan aparecerán aquí ordenadas por hora.</p>
            </div>
          ) : (
            <div className="dashboard-agenda-list">
              {agenda.map((item) => {
                if (item.kind === "session") {
                  const session = item.session;
                  return (
                    <button className="dashboard-agenda-item" type="button" key={item.key} onClick={() => onOpenSession(session.id)}>
                      <time>{formatTime(session.inicio)}</time>
                      <div className="dashboard-agenda-copy">
                        <span className="tag">{session.tipo === "TUTORIA_GRUPAL" ? "Tutoría grupal" : "Clase"}</span>
                        <strong>{session.asignatura.nombre}</strong>
                        <small>{session.titulo || session.tema || "Sesión académica"}</small>
                      </div>
                      <span className="dashboard-agenda-action">Pasar lista / abrir</span>
                    </button>
                  );
                }

                const tutorial = item.tutorial;
                return (
                  <button className="dashboard-agenda-item" type="button" key={item.key} onClick={onOpenTutorials}>
                    <time>{formatTime(tutorial.inicio)}</time>
                    <div className="dashboard-agenda-copy">
                      <span className="tag tutorial-programada">Tutoría individual</span>
                      <strong>{studentName(tutorial.alumno)}</strong>
                      <small>{tutorial.asignatura?.nombre ?? "General"}{tutorial.motivo ? ` · ${tutorial.motivo}` : ""}</small>
                    </div>
                    <span className="dashboard-agenda-action">Abrir tutorías</span>
                  </button>
                );
              })}
            </div>
          )}
        </article>

        <article className="panel dashboard-priority-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ATENCIÓN</p>
              <h3>Prioridad inmediata</h3>
            </div>
          </div>

          <div className="priority-summary-list">
            <button type="button" onClick={onOpenFollowUps}>
              <span>Seguimientos vencidos</span><strong>{summary.overdueFollowUps}</strong>
            </button>
            <button type="button" onClick={onOpenTutorials}>
              <span>Tutorías por programar</span><strong>{summary.requestedTutorials}</strong>
            </button>
            <button type="button" onClick={onOpenIncidents}>
              <span>Incidencias abiertas</span><strong>{summary.openIncidents}</strong>
            </button>
            <button type="button" onClick={onOpenAlerts}>
              <span>Alertas automáticas</span><strong>{summary.automaticAlerts}</strong>
            </button>
          </div>
        </article>
      </section>

      <section className="dashboard-attention-grid">
        <article className="panel attention-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">SEGUIMIENTOS</p><h3>Vencidos</h3></div>
            <button className="text-button" type="button" onClick={onOpenFollowUps}>Ver todos</button>
          </div>
          {summary.attention.followUps.length === 0 ? (
            <p className="dashboard-ok">No hay seguimientos vencidos.</p>
          ) : (
            <div className="dashboard-action-list">
              {summary.attention.followUps.map((followUp) => (
                <article key={followUp.id} className="dashboard-action-item danger-item">
                  <div className="dashboard-action-head">
                    <button type="button" className="student-link" onClick={() => onOpenStudent(followUp.alumno.id)}>{studentName(followUp.alumno)}</button>
                    <span>Venció {formatDateTime(followUp.fechaObjetivo)}</span>
                  </div>
                  <strong>{followUp.asignatura?.nombre ?? "General"}</strong>
                  <p>{followUp.descripcion}</p>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="panel attention-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">TUTORÍAS</p><h3>Solicitadas</h3></div>
            <button className="text-button" type="button" onClick={onOpenTutorials}>Ver todas</button>
          </div>
          {summary.attention.tutorials.length === 0 ? (
            <p className="dashboard-ok">No hay tutorías pendientes de programar.</p>
          ) : (
            <div className="dashboard-action-list">
              {summary.attention.tutorials.map((tutorial) => (
                <article key={tutorial.id} className="dashboard-action-item">
                  <div className="dashboard-action-head">
                    <button type="button" className="student-link" onClick={() => onOpenStudent(tutorial.alumno.id)}>{studentName(tutorial.alumno)}</button>
                    <span>Solicitada {formatDateTime(tutorial.fechaSolicitud)}</span>
                  </div>
                  <strong>{tutorial.asignatura?.nombre ?? "General"}</strong>
                  {tutorial.motivo && <p>{tutorial.motivo}</p>}
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="panel attention-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">INCIDENCIAS</p><h3>Abiertas</h3></div>
            <button className="text-button" type="button" onClick={onOpenIncidents}>Ver todas</button>
          </div>
          {summary.attention.incidents.length === 0 ? (
            <p className="dashboard-ok">No hay incidencias abiertas.</p>
          ) : (
            <div className="dashboard-action-list">
              {summary.attention.incidents.map((incident) => (
                <article key={incident.id} className="dashboard-action-item warning-item">
                  <div className="dashboard-action-head">
                    <button type="button" className="student-link" onClick={() => onOpenStudent(incident.alumno.id)}>{studentName(incident.alumno)}</button>
                    <span>{formatDateTime(incident.fecha)}</span>
                  </div>
                  <strong>{incident.titulo}</strong>
                  <p>{incident.descripcion}</p>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
