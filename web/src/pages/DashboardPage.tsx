import { useEffect, useState } from "react";
import { DashboardAgendaPanel } from "../components/DashboardAgendaPanel";
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
  personalTutoring: { totalAlumnos: 0, destacada: {
    numero: 1, titulo: "Inicio de curso", momento: "", inicio: null, fin: "2026-10-02", contenido: "",
    total: 0, realizados: 0, pendientes: 0, fueraPlazo: 0, estado: "COMPLETO",
  }, periodos: [] },
  today: { sessions: [], tutorials: [] },
  attention: { followUps: [], tutorials: [], incidents: [] },
};

type Props = {
  onOpenSessions: () => void;
  onOpenSession: (id: number) => void;
  onOpenStudent: (id: number) => void;
  onOpenTutorials: () => void;
  onOpenTutorialSchedule: (id: number, start: string) => void;
  onOpenFollowUps: () => void;
  onOpenPersonalTutoring: (numero?: number) => void;
  onOpenIncidents: () => void;
  onOpenAlerts: () => void;
  onOpenCalendar: () => void;
};

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
  onOpenTutorialSchedule,
  onOpenFollowUps,
  onOpenPersonalTutoring,
  onOpenIncidents,
  onOpenAlerts,
  onOpenCalendar,
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
          <small>Solo clases, sin tutorías</small>
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

      {summary.personalTutoring.totalAlumnos > 0 && (
        <section className={summary.personalTutoring.destacada.estado === "VENCIDO" ?
          "panel personal-dashboard-alert is-overdue" : "panel personal-dashboard-alert"}
          aria-label="Seguimiento tutorial personalizado">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SEGUIMIENTO PERSONALIZADO · DOCENTE-TUTOR</p>
              <h3>Contacto C{summary.personalTutoring.destacada.numero} · {summary.personalTutoring.destacada.titulo}</h3>
              <p>{summary.personalTutoring.destacada.momento}</p>
              <p className="personal-alert-count">
                Te restan {summary.personalTutoring.destacada.pendientes} alumnos para el contacto
                n.º {summary.personalTutoring.destacada.numero}.
              </p>
              <p className="muted">{summary.personalTutoring.destacada.realizados} realizados de {summary.personalTutoring.totalAlumnos} asignados
                {summary.personalTutoring.destacada.estado === "VENCIDO" ? " · Plazo vencido" : ""}</p>
            </div>
            <button className="primary" type="button"
              onClick={() => onOpenPersonalTutoring(summary.personalTutoring.destacada.numero)}>
              Ver alumnos pendientes
            </button>
          </div>
          <div className="personal-alert-periods">
            {summary.personalTutoring.periodos.filter(p => p.estado === "VENCIDO").map(p =>
              <button className="secondary compact-button" key={p.numero} type="button"
                onClick={() => onOpenPersonalTutoring(p.numero)}>
                C{p.numero}: {p.pendientes} pendientes fuera de plazo
              </button>)}
          </div>
        </section>
      )}

      <section className="dashboard-main-grid">
        <DashboardAgendaPanel
          onOpenSession={onOpenSession}
          onOpenTutorials={onOpenTutorials}
          onOpenTutorialSchedule={onOpenTutorialSchedule}
          onOpenCalendar={onOpenCalendar}
        />

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

      <div className="dashboard-footer-actions">
        <button className="text-button" type="button" onClick={onOpenSessions}>Ver todas las sesiones</button>
      </div>
    </>
  );
}
