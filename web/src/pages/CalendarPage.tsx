import { useEffect, useMemo, useState, type FormEvent } from "react";

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

type SubjectOption = { id: number; nombre: string; grupo: string; activa?: boolean };
type StudentOption = { id: number; nombre: string; apellidos: string; activo?: boolean };
type QuickCreateMode = "SESSION" | "TUTORIAL" | null;

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
  const [quickMode, setQuickMode] = useState<QuickCreateMode>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickMessage, setQuickMessage] = useState("");
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);

  const gridStart = useMemo(() => startOfCalendarGrid(month), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)), [gridStart]);
  const gridEnd = useMemo(() => addDays(gridStart, 42), [gridStart]);

  async function loadEvents() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        from: gridStart.toISOString(),
        to: gridEnd.toISOString(),
      });
      const response = await fetch(`/api/calendar?${params.toString()}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el calendario");
      setEvents(body.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el calendario");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
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
  const activeSubjects = subjects.filter((subject) => subject.activa !== false);
  const activeStudents = students.filter((student) => student.activo !== false);

  function moveMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelectedDate(next);
    setQuickMode(null);
    setQuickMessage("");
  }

  function goToday() {
    const today = new Date();
    setMonth(startOfMonth(today));
    setSelectedDate(today);
    setQuickMode(null);
    setQuickMessage("");
  }

  function openEvent(event: CalendarEvent) {
    if (event.source === "SESSION") onOpenSession(event.entityId);
    else onOpenTutorial(event.entityId);
  }

  async function loadQuickData() {
    if (subjects.length > 0 && students.length > 0) return;
    setQuickLoading(true);
    setError("");
    try {
      const [subjectsResponse, studentsResponse] = await Promise.all([
        fetch("/api/subjects"),
        fetch("/api/students"),
      ]);
      if (!subjectsResponse.ok || !studentsResponse.ok) throw new Error("No se pudieron cargar los datos para crear el evento");
      setSubjects(await subjectsResponse.json());
      setStudents(await studentsResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los datos para crear el evento");
    } finally {
      setQuickLoading(false);
    }
  }

  function startQuickCreate(mode: Exclude<QuickCreateMode, null>) {
    setQuickMode(mode);
    setQuickMessage("");
    setError("");
    void loadQuickData();
  }

  async function saveQuickEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickMode) return;

    const data = new FormData(event.currentTarget);
    const day = dateKey(selectedDate);
    const startTime = String(data.get("startTime") || "");
    const endTime = String(data.get("endTime") || "");
    if (!startTime) {
      setError("Debes indicar una hora de inicio.");
      return;
    }

    const start = `${day}T${startTime}`;
    const end = endTime ? `${day}T${endTime}` : null;

    setQuickSaving(true);
    setError("");
    setQuickMessage("");
    try {
      let response: Response;
      if (quickMode === "SESSION") {
        if (!end) throw new Error("Debes indicar la hora de fin de la sesión.");
        response = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asignaturaId: Number(data.get("subjectId")),
            unidadId: null,
            tipo: data.get("sessionType") || "CLASE",
            titulo: data.get("title"),
            inicio: start,
            fin: end,
            estado: "PROGRAMADA",
          }),
        });
      } else {
        response = await fetch("/api/tutorials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alumnoId: Number(data.get("studentId")),
            asignaturaId: data.get("subjectId") || null,
            fechaSolicitud: new Date().toISOString(),
            inicio: start,
            fin: end,
            estado: "PROGRAMADA",
            motivo: data.get("reason"),
          }),
        });
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo crear el evento");

      setQuickMode(null);
      setQuickMessage(quickMode === "SESSION" ? "Sesión creada correctamente." : "Tutoría creada correctamente.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el evento");
    } finally {
      setQuickSaving(false);
    }
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

        {error && !quickMode && <p className="form-error" role="alert">{error}</p>}
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
                onClick={() => { setSelectedDate(day); setQuickMode(null); setQuickMessage(""); }}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                    setSelectedDate(day);
                    setQuickMode(null);
                    setQuickMessage("");
                  }
                }}
              >
                <div className="calendar-day-number"><span>{day.getDate()}</span>{dayEvents.length > 0 && <small>{dayEvents.length}</small>}</div>
                <div className="calendar-day-events">
                  {dayEvents.map((calendarEvent) => (
                    <button
                      type="button"
                      className={`calendar-event type-${calendarEvent.type.toLowerCase().replaceAll("_", "-")}${calendarEvent.status === "CANCELADA" ? " cancelled" : ""}`}
                      key={calendarEvent.id}
                      title={`${formatTime(calendarEvent.start)} · ${calendarEvent.title} · ${calendarEvent.subtitle}`}
                      onClick={(clickEvent) => { clickEvent.stopPropagation(); openEvent(calendarEvent); }}
                    >
                      <span className="calendar-event-time">{formatTime(calendarEvent.start)}</span>
                      <span className="calendar-event-title">{calendarEvent.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel calendar-agenda-panel">
        <div className="panel-heading calendar-selected-heading">
          <div>
            <p className="eyebrow">DÍA SELECCIONADO</p>
            <h3>{formatSelectedDate(selectedDate)}</h3>
          </div>
          <div className="calendar-day-actions">
            <span className="tag">{selectedEvents.length} evento{selectedEvents.length === 1 ? "" : "s"}</span>
            <button className="secondary compact-button" type="button" onClick={() => startQuickCreate("SESSION")}>+ Nueva sesión</button>
            <button className="secondary compact-button" type="button" onClick={() => startQuickCreate("TUTORIAL")}>+ Nueva tutoría</button>
          </div>
        </div>

        {quickMessage && <div className="notice-banner success" role="status">{quickMessage}</div>}

        {quickMode && (
          <form className="calendar-quick-form" onSubmit={saveQuickEvent}>
            <div className="calendar-quick-form-heading">
              <div>
                <p className="eyebrow">ALTA RÁPIDA</p>
                <strong>{quickMode === "SESSION" ? "Nueva sesión" : "Nueva tutoría individual"}</strong>
                <small>{formatSelectedDate(selectedDate)}</small>
              </div>
              <button className="text-button" type="button" onClick={() => { setQuickMode(null); setError(""); }}>Cerrar</button>
            </div>

            {quickLoading ? <p className="muted">Cargando datos…</p> : quickMode === "SESSION" ? (
              <div className="calendar-quick-fields">
                <label>Asignatura
                  <select name="subjectId" required defaultValue="">
                    <option value="" disabled>Selecciona una asignatura</option>
                    {activeSubjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.nombre}{subject.grupo ? ` · ${subject.grupo}` : ""}</option>)}
                  </select>
                </label>
                <label>Tipo
                  <select name="sessionType" defaultValue="CLASE">
                    <option value="CLASE">Clase</option>
                    <option value="TUTORIA_GRUPAL">Tutoría grupal</option>
                  </select>
                </label>
                <label>Hora inicio<input name="startTime" type="time" required /></label>
                <label>Hora fin<input name="endTime" type="time" required /></label>
                <label className="calendar-quick-wide">Título<input name="title" placeholder="Opcional" /></label>
              </div>
            ) : (
              <div className="calendar-quick-fields">
                <label>Alumno
                  <select name="studentId" required defaultValue="">
                    <option value="" disabled>Selecciona un alumno</option>
                    {activeStudents.map((student) => <option value={student.id} key={student.id}>{student.apellidos}, {student.nombre}</option>)}
                  </select>
                </label>
                <label>Asignatura
                  <select name="subjectId" defaultValue="">
                    <option value="">General / sin asignatura</option>
                    {activeSubjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.nombre}{subject.grupo ? ` · ${subject.grupo}` : ""}</option>)}
                  </select>
                </label>
                <label>Hora inicio<input name="startTime" type="time" required /></label>
                <label>Hora fin<input name="endTime" type="time" /></label>
                <label className="calendar-quick-wide">Motivo<input name="reason" placeholder="Opcional" /></label>
              </div>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-actions">
              <button className="primary compact-button" type="submit" disabled={quickSaving || quickLoading}>{quickSaving ? "Guardando…" : "Crear evento"}</button>
              <button className="secondary compact-button" type="button" onClick={() => { setQuickMode(null); setError(""); }}>Cancelar</button>
            </div>
          </form>
        )}

        {selectedEvents.length === 0 ? (
          <div className="empty-state compact-empty"><strong>No hay eventos programados para este día.</strong></div>
        ) : (
          <div className="calendar-agenda-list">
            {selectedEvents.map((calendarEvent) => (
              <button className={`calendar-agenda-item type-${calendarEvent.type.toLowerCase().replaceAll("_", "-")}`} type="button" key={calendarEvent.id} onClick={() => openEvent(calendarEvent)}>
                <span className="calendar-agenda-time">{formatTime(calendarEvent.start)}{calendarEvent.end ? ` – ${formatTime(calendarEvent.end)}` : ""}</span>
                <span className="calendar-agenda-main"><strong>{calendarEvent.title}</strong><small>{calendarEvent.subtitle}</small></span>
                <span className="calendar-agenda-type">{TYPE_LABELS[calendarEvent.type]}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
