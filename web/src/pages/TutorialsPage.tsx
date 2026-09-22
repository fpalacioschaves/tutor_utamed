import { useEffect, useMemo, useState } from "react";
import { TutorialBookingSlots } from "../components/TutorialBookingSlots";
import type { Tutorial } from "../types";

type ScheduledTutorial = {
  id: number;
  inicio: string;
  fin: string;
  estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA";
  grupoTutoria: string | null;
  titulo: string | null;
  asignatura: { id: number; nombre: string; cursoAcademicoId: number };
  _count: { reservasTutoria: number };
};

type Props = {
  focusedSessionId?: number | null;
  focusedDate?: string | null;
};

const dayFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid",
});
const timeFormatter = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
});
const monthFormatter = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid",
});
const labels = {
  PROGRAMADA: "Programada", REALIZADA: "Realizada",
  CANCELADA: "Cancelada", NO_PRESENTADO: "No presentado", SOLICITADA: "Solicitada",
};

function firstMonth(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function TutorialsPage({ focusedSessionId = null, focusedDate = null }: Props) {
  const [month, setMonth] = useState(() => firstMonth(focusedDate ?? new Date()));
  const [schedule, setSchedule] = useState<ScheduledTutorial[]>([]);
  const [historical, setHistorical] = useState<Tutorial[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(focusedSessionId);
  const [group, setGroup] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [onlyReserved, setOnlyReserved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archiveError, setArchiveError] = useState("");

  useEffect(() => {
    if (focusedDate) setMonth(firstMonth(focusedDate));
    if (focusedSessionId !== null) setSelectedId(focusedSessionId);
  }, [focusedSessionId, focusedDate]);

  async function loadSchedule() {
    setLoading(true); setError("");
    try {
      const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
      const response = await fetch(`/api/tutorials/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No se ha podido cargar el horario de tutorías.");
      setSchedule(data as ScheduledTutorial[]);
    } catch (cause) {
      setSchedule([]);
      setError(cause instanceof Error ? cause.message : "No se ha podido cargar el horario.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadSchedule(); }, [month]);

  useEffect(() => {
    void fetch("/api/tutorials", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "No se pudo consultar el histórico anterior.");
        setHistorical(body as Tutorial[]);
      }).catch((cause: unknown) =>
        setArchiveError(cause instanceof Error ? cause.message : "Error en el histórico anterior."));
  }, []);

  const subjects = useMemo(() => {
    const map = new Map<number, string>();
    for (const session of schedule) map.set(session.asignatura.id, session.asignatura.nombre);
    return [...map].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [schedule]);

  const filtered = useMemo(() => schedule.filter((item) =>
    (!group || item.grupoTutoria?.toUpperCase() === group)
    && (!subjectId || item.asignatura.id === Number(subjectId))
    && (!onlyReserved || item._count.reservasTutoria > 0)), [schedule, group, subjectId, onlyReserved]);

  const booked = schedule.reduce((sum, item) => sum + item._count.reservasTutoria, 0);
  const moveMonth = (step: number) => {
    setSelectedId(null);
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1));
  };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">ATENCIÓN PERSONALIZADA · DAM / DAW</p>
          <h2>Tutorías</h2>
          <p>Fechas y horarios ya fijados. Selecciona un turno de 15 minutos y traslada la reserva de Google Calendar a un alumno.</p>
        </div>
      </header>

      <section className="panel fixed-tutorial-schedule" aria-label="Horarios cerrados de tutorías">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">HORARIO IMPORTADO</p>
            <h3>Tutorías de {monthFormatter.format(month)}</h3>
            <p className="muted">{schedule.length} franjas de tutoría · {booked} turnos reservados</p>
          </div>
          <div className="row-actions">
            <button className="secondary compact-button" type="button" onClick={() => moveMonth(-1)}>← Mes anterior</button>
            <button className="secondary compact-button" type="button" onClick={() => { setSelectedId(null); setMonth(firstMonth(new Date())); }}>Mes actual</button>
            <button className="secondary compact-button" type="button" onClick={() => moveMonth(1)}>Mes siguiente →</button>
          </div>
        </div>
        <div className="list-toolbar" aria-label="Filtrar tutorías">
          <label>Grupo
            <select value={group} onChange={(event) => { setGroup(event.target.value); setSelectedId(null); }}>
              <option value="">DAM y DAW</option>
              <option value="DAM">1.º DAM</option>
              <option value="DAW">1.º DAW</option>
            </select>
          </label>
          <label>Asignatura
            <select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setSelectedId(null); }}>
              <option value="">Todas las asignaturas</option>
              {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="fixed-tutorial-check">
            <input type="checkbox" checked={onlyReserved}
              onChange={(event) => setOnlyReserved(event.target.checked)} />
            Solo con alumnos reservados
          </label>
          <button className="secondary compact-button" type="button" onClick={() => void loadSchedule()}>
            Actualizar
          </button>
        </div>

        {error && <div className="notice-banner error" role="alert">{error}</div>}
        {loading ? <p className="muted">Consultando las fechas existentes…</p> :
          filtered.length === 0 && !error ? (
            <div className="empty-state compact-empty">
              <strong>No hay tutorías en este período con esos filtros.</strong>
              <p>Los horarios se leen de la base de datos; no se crean tutorías nuevas ni se cambian fechas desde aquí.</p>
            </div>
          ) : (
            <div className="fixed-tutorial-date-list">
              {filtered.map((item) => {
                const expanded = selectedId === item.id;
                const day = dayFormatter.format(new Date(item.inicio));
                return (
                  <article className={expanded ? "fixed-tutorial-date expanded" : "fixed-tutorial-date"} key={item.id}>
                    <button className="fixed-tutorial-date-trigger" type="button"
                      aria-expanded={expanded} onClick={() => setSelectedId(expanded ? null : item.id)}>
                      <span><strong>{day}</strong>
                        <small>{item.asignatura.nombre} · 1.º {item.grupoTutoria ?? "Sin grupo"}</small></span>
                      <span className="fixed-tutorial-time">
                        {timeFormatter.format(new Date(item.inicio))}–{timeFormatter.format(new Date(item.fin))}
                      </span>
                      <span className="tag">{item._count.reservasTutoria} reservados</span>
                      <span>{expanded ? "Ocultar turnos ↑" : "Ver turnos →"}</span>
                    </button>
                    {expanded && (
                      <div className="fixed-tutorial-date-content">
                        {item.estado === "CANCELADA" && (
                          <div className="notice-banner warning">La franja está cancelada; no se pueden asignar nuevos alumnos.</div>
                        )}
                        <TutorialBookingSlots sessionId={item.id} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
      </section>

      <details className="panel tutorial-legacy-archive">
        <summary>Histórico de tutorías individuales anterior ({historical.length})</summary>
        <p className="muted">
          Se conserva sin cambiar fechas ni borrar registros. Las nuevas citas se asignan exclusivamente
          a los turnos de 15 minutos del horario importado.
        </p>
        {archiveError && <div className="notice-banner error" role="alert">{archiveError}</div>}
        {historical.map((tutorial) => (
          <article className="fixed-tutorial-legacy" key={tutorial.id}>
            <strong>{tutorial.alumno.apellidos}, {tutorial.alumno.nombre}</strong>
            <span>{tutorial.asignatura?.nombre ?? "General"} · {tutorial.inicio
              ? dateFormatter.format(new Date(tutorial.inicio))
              : "Sin hora programada"}</span>
            <span>{labels[tutorial.estado]}</span>
            {tutorial.motivo && <p>Motivo: {tutorial.motivo}</p>}
            {tutorial.observaciones && <p>Observaciones: {tutorial.observaciones}</p>}
            {tutorial.acuerdos && <p>Acuerdos: {tutorial.acuerdos}</p>}
          </article>
        ))}
      </details>
    </>
  );
}
