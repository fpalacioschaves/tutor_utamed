import { useEffect, useMemo, useState } from "react";

type CalendarEventType = "CLASE" | "TUTORIA_GRUPAL" | "TUTORIA_INDIVIDUAL";
type CalendarEvent = {
  id: string;
  entityId: number;
  source: "SESSION" | "TUTORIAL";
  type: CalendarEventType;
  title: string;
  subtitle: string;
  start: string;
  end: string | null;
  status: string;
  subject: { id: number; nombre: string; grupo: string } | null;
  unit: { id: number; orden: number; titulo: string } | null;
  student: { id: number; nombre: string; apellidos: string } | null;
};

type Props = {
  onOpenSession: (id: number) => void;
  onOpenTutorial: (id: number) => void;
};

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const TYPE_LABELS: Record<CalendarEventType, string> = {
  CLASE: "Clase",
  TUTORIA_GRUPAL: "Tutoría grupal",
  TUTORIA_INDIVIDUAL: "Tutoría individual",
};

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfCalendarGrid(month: Date) {
  const first = startOfMonth(month);
  const mondayIndex = (first.getDay() + 6) % 7;
  return addDays(first, -mondayIndex);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatMonth(date: Date) {
  const text = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatSelectedDate(date: Date) {
  const text = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function CalendarPage({ onOpenSession, onOpenTutorial }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const gridStart = useMemo(() => startOfCalendarGrid(month), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)), [gridStart]);
  const gridEnd = useMemo(() => addDays(gridStart, 42), [gridStart]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      from: gridStart.toISOString(),
      to: gridEnd.toISOString(),
    });

    fetch(`/api/calendar?${params.toString()}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el calendario");
        return body as { events?: CalendarEvent[] };
      })
      .then((body) => {
        if (!cancelled) setEvents(body.events ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el calendario");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [gridStart, gridEnd]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dateKey(new Date(event.start));
      const list = grouped.get(key) ?? [];
      list.push(event);
      grouped.set(key, list);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.start.localeCompare(b.start));
    return grouped;
  }, [events]);

  const selectedEvents = eventsByDay.get(dateKey(selectedDate)) ?? [];
  const todayKey = dateKey(new Date());

  function moveMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelectedDate(next);
  }

  function goToday() {
    const today = new Date();
    setMonth(startOfMonth(today));
    setSelectedDate(today);
  }

  function openEvent(event: CalendarEvent) {
    if (event.source === "SESSION") onOpenSession(event.entityId);
    else onOpenTutorial(event.entityId);
  }

  return (
    <>
      <header className="page-header calendar-page-header">
        <div>
          <p className="eyebrow">AGENDA DOCENTE</p>
          <h2>Calendario</h2>
          <p>Clases y tutorías reunidas en una sola vista. Los cambios realizados en Sesiones o Tutorías aparecen aquí automáticamente.</p>
        </div>
      </header>

      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div className="calendar-navigation">
            <button className="secondary compact-button" type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior">‹</button>
            <button className="secondary compact-button" type="button" onClick={goToday}>Hoy</button>
            <button className="secondary compact-button" type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente">›</button>
          </div>
          <h3>{formatMonth(month)}</h3>
          <div className="calendar-legend" aria-label="Tipos de evento">
            {(Object.keys(TYPE_LABELS) as CalendarEventType[]).map((type) => (
              <span className={`calendar-legend-item type-${type.toLowerCase().replaceAll("_", "-")}`} key={type}>
                <i />{TYPE_LABELS[type]}
              </span>
            ))}
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {loading && <p className="muted calendar-loading">Cargando calendario…</p>}

        <div className="calendar-grid" role="grid" aria-label={formatMonth(month)}>
          {WEEKDAYS.map((day) => <div className="calendar-weekday" role="columnheader" key={day}>{day}</div>)}
          {days.map((day) => {
            const key = dateKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const outside = day.getMonth() !== month.getMonth();
            const selected = key === dateKey(selectedDate);
            return (
              <div
                className={`calendar-day${outside ? " outside-month" : ""}${key === todayKey ? " today" : ""}${selected ? " selected" : ""}`}
                key={key}
                role="gridcell"
                tabIndex={0}
                onClick={() => setSelectedDate(day)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedDate(day); }}
              >
                <div className="calendar-day-number"><span>{day.getDate()}</span>{dayEvents.length > 0 && <small>{dayEvents.length}</small>}</div>
                <div className="calendar-day-events">
                  {dayEvents.map((event) => (
                    <button
                      type="button"
                      className={`calendar-event type-${event.type.toLowerCase().replaceAll("_", "-")}${event.status === "CANCELADA" ? " cancelled" : ""}`}
                      key={event.id}
                      title={`${formatTime(event.start)} · ${event.title} · ${event.subtitle}`}
                      onClick={(clickEvent) => { clickEvent.stopPropagation(); openEvent(event); }}
                    >
                      <span className="calendar-event-time">{formatTime(event.start)}</span>
                      <span className="calendar-event-title">{event.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel calendar-agenda-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">DÍA SELECCIONADO</p>
            <h3>{formatSelectedDate(selectedDate)}</h3>
          </div>
          <span className="tag">{selectedEvents.length} evento{selectedEvents.length === 1 ? "" : "s"}</span>
        </div>

        {selectedEvents.length === 0 ? (
          <div className="empty-state compact-empty"><strong>No hay eventos programados para este día.</strong></div>
        ) : (
          <div className="calendar-agenda-list">
            {selectedEvents.map((event) => (
              <button className={`calendar-agenda-item type-${event.type.toLowerCase().replaceAll("_", "-")}`} type="button" key={event.id} onClick={() => openEvent(event)}>
                <span className="calendar-agenda-time">{formatTime(event.start)}{event.end ? ` – ${formatTime(event.end)}` : ""}</span>
                <span className="calendar-agenda-main"><strong>{event.title}</strong><small>{event.subtitle}</small></span>
                <span className="calendar-agenda-type">{TYPE_LABELS[event.type]}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
