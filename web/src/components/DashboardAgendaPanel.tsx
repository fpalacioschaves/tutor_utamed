import { useEffect, useMemo, useState } from "react";

type AgendaEvent = {
  id: string;
  entityId: number;
  source: "SESSION" | "TUTORIAL";
  type: "CLASE" | "TUTORIA_GRUPAL" | "TUTORIA_INDIVIDUAL";
  title: string;
  subtitle: string;
  start: string;
  end: string | null;
  status: string;
};

type AgendaRange = "TODAY" | "TOMORROW" | "WEEK";

type Props = {
  onOpenSession: (id: number) => void;
  onOpenTutorials: () => void;
  onOpenCalendar: () => void;
};

const RANGE_LABELS: Record<AgendaRange, string> = {
  TODAY: "Hoy",
  TOMORROW: "Mañana",
  WEEK: "Próximos 7 días",
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function inRange(value: string, start: Date, end: Date) {
  const time = new Date(value).getTime();
  return time >= start.getTime() && time < end.getTime();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDay(value: string) {
  const text = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value));
  return text.replace(".", "");
}

function typeLabel(type: AgendaEvent["type"]) {
  if (type === "TUTORIA_GRUPAL") return "Tutoría grupal";
  if (type === "TUTORIA_INDIVIDUAL") return "Tutoría individual";
  return "Clase";
}

export function DashboardAgendaPanel({ onOpenSession, onOpenTutorials, onOpenCalendar }: Props) {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [range, setRange] = useState<AgendaRange>("TODAY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const today = startOfDay(new Date());
      const end = addDays(today, 8);
      const params = new URLSearchParams({ from: today.toISOString(), to: end.toISOString() });
      const response = await fetch(`/api/calendar?${params.toString()}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo cargar la agenda");
      setEvents(Array.isArray(body.events) ? body.events : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la agenda");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleEvents = useMemo(() => {
    const today = startOfDay(new Date());
    let start = today;
    let end = addDays(today, 1);

    if (range === "TOMORROW") {
      start = addDays(today, 1);
      end = addDays(today, 2);
    } else if (range === "WEEK") {
      end = addDays(today, 7);
    }

    return events
      .filter((event) => event.status !== "CANCELADA" && inRange(event.start, start, end))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events, range]);

  return (
    <article className="panel dashboard-agenda-panel dashboard-upcoming-agenda">
      <div className="panel-heading dashboard-agenda-heading">
        <div>
          <p className="eyebrow">AGENDA INMEDIATA</p>
          <h3>{RANGE_LABELS[range]}</h3>
        </div>
        <button className="text-button" type="button" onClick={onOpenCalendar}>Abrir calendario</button>
      </div>

      <div className="dashboard-agenda-tabs" role="group" aria-label="Periodo de agenda">
        {(Object.keys(RANGE_LABELS) as AgendaRange[]).map((item) => (
          <button className={range === item ? "active" : ""} type="button" key={item} onClick={() => setRange(item)}>
            {RANGE_LABELS[item]}
          </button>
        ))}
        <button className="dashboard-agenda-refresh" type="button" onClick={() => void load()} disabled={loading}>Actualizar</button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? (
        <p className="muted">Cargando agenda…</p>
      ) : visibleEvents.length === 0 ? (
        <div className="empty-state compact-empty">
          <strong>No hay clases ni tutorías programadas en este periodo.</strong>
        </div>
      ) : (
        <div className="dashboard-agenda-list">
          {visibleEvents.map((event) => (
            <button
              className={`dashboard-agenda-item dashboard-agenda-${event.type.toLowerCase().replaceAll("_", "-")}`}
              type="button"
              key={event.id}
              onClick={() => event.source === "SESSION" ? onOpenSession(event.entityId) : onOpenTutorials()}
            >
              <time>
                {range === "WEEK" && <small>{formatDay(event.start)}</small>}
                {formatTime(event.start)}
              </time>
              <div className="dashboard-agenda-copy">
                <span className="tag">{typeLabel(event.type)}</span>
                <strong>{event.title}</strong>
                <small>{event.subtitle}</small>
              </div>
              <span className="dashboard-agenda-action">Abrir</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
