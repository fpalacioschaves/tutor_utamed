import { useEffect, useState } from "react";

type Student = { id: number; nombre: string; apellidos: string; activo?: boolean };
type BookingState = "PROGRAMADA" | "REALIZADA" | "CANCELADA" | "NO_PRESENTADO";
type Reservation = {
  id: number;
  alumnoId: number;
  alumno: Student;
  estado: BookingState;
  motivo: string | null;
  observaciones: string | null;
  acuerdos: string | null;
};
type Slot = { bloque: number; inicio: string; fin: string; reserva: Reservation | null };
type BookingData = {
  sesionId: number;
  grupo: string | null;
  asignatura: string;
  estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA";
  slots: Slot[];
  alumnosElegibles: Student[];
  warning: string | null;
};
type Draft = {
  estado: BookingState;
  motivo: string;
  observaciones: string;
  acuerdos: string;
};
const states: Array<[BookingState, string]> = [
  ["PROGRAMADA", "Programada"], ["REALIZADA", "Realizada"],
  ["NO_PRESENTADO", "No presentado"], ["CANCELADA", "Cancelada"],
];
const time = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
});

function initialDraft(reservation: Reservation): Draft {
  return {
    estado: reservation.estado,
    motivo: reservation.motivo ?? "",
    observaciones: reservation.observaciones ?? "",
    acuerdos: reservation.acuerdos ?? "",
  };
}

export function TutorialBookingSlots({ sessionId }: { sessionId: number }) {
  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function reload() {
    const response = await fetch(`/api/sessions/${sessionId}/booking-slots`, {
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "No se han podido consultar los turnos.");
    setData(body as BookingData);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setData(null); setEditing(null); setDraft(null);
    void fetch(`/api/sessions/${sessionId}/booking-slots`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "No se han podido cargar los turnos.");
        if (!cancelled) setData(body as BookingData);
      }).catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Error al cargar tutorías.");
      }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  async function assign(slot: Slot, alumnoId: number | null) {
    if (!data || saving !== null || slot.reserva?.alumnoId === alumnoId) return;
    const hasNotes = Boolean(slot.reserva?.motivo || slot.reserva?.observaciones || slot.reserva?.acuerdos);
    if (hasNotes && !window.confirm(
      "Este turno tiene anotaciones del alumno anterior. Cambiar o liberar la reserva eliminará esas anotaciones. ¿Continuar?",
    )) return;
    setSaving(slot.bloque); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/booking-slots/${slot.bloque}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumnoId, confirmReplace: hasNotes }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se ha guardado el turno.");
      setEditing(null); setDraft(null);
      await reload();
      setMessage(alumnoId === null ? "El turno ha quedado libre." : "Cita individual guardada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha guardado el turno.");
    } finally { setSaving(null); }
  }

  async function saveNotes(slot: Slot) {
    if (!draft || !slot.reserva || saving !== null) return;
    setSaving(slot.bloque); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/booking-slots/${slot.bloque}/notes`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se han guardado las observaciones.");
      await reload();
      setEditing(null); setDraft(null);
      setMessage("Tutoría y acuerdos guardados en la ficha del alumno.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se han guardado las observaciones.");
    } finally { setSaving(null); }
  }

  if (loading) return <p className="muted">Cargando turnos individuales de 15 minutos…</p>;

  return (
    <div className="individual-tutorials" aria-label="Turnos individuales de tutoría">
      {error && <div className="notice-banner error" role="alert">{error}</div>}
      {message && <div className="notice-banner success" role="status">{message}</div>}
      {data?.warning && <div className="notice-banner warning" role="alert">{data.warning}</div>}
      {data && (
        <>
          <p className="muted">
            {data.slots.filter((slot) => slot.reserva).length} de {data.slots.length} turnos reservados.
            {" "}Cada turno corresponde a <strong>un solo alumno</strong>.
          </p>
          {data.alumnosElegibles.length === 0 && !data.warning && (
            <div className="notice-banner warning" role="status">
              No hay alumnos asignados al grupo {data.grupo} en esta base.
              Revisa el grupo en sus fichas de Alumnos; no se mostrarán alumnos del otro ciclo.
            </div>
          )}
          <div className="fixed-tutorial-slots">
            {data.slots.map((slot) => {
              const current = slot.reserva;
              const otherIds = new Set(data.slots
                .filter((item) => item.bloque !== slot.bloque && item.reserva)
                .map((item) => item.reserva!.alumnoId));
              const candidates = data.alumnosElegibles.filter((student) => !otherIds.has(student.id));
              const studentMissing = current && !candidates.some((student) => student.id === current.alumnoId);
              return (
                <article className={current ? "fixed-tutorial-slot booked" : "fixed-tutorial-slot"} key={slot.bloque}>
                  <div className="fixed-tutorial-slot-head">
                    <strong>{time.format(new Date(slot.inicio))}–{time.format(new Date(slot.fin))}</strong>
                    <span className={current ? "tag" : "tag muted-tag"}>{current ? "Reservado" : "Libre"}</span>
                    {current && <span className="fixed-tutorial-name">{current.alumno.apellidos}, {current.alumno.nombre}</span>}
                  </div>
                  <label className="fixed-tutorial-picker">
                    <span>Alumno de 1.º {data.grupo ?? "DAM/DAW"}</span>
                    <select
                      aria-label={`Alumno del turno ${time.format(new Date(slot.inicio))}`}
                      value={current?.alumnoId ?? ""}
                      disabled={saving !== null || Boolean(data.warning)}
                      onChange={(event) => void assign(slot, event.target.value ? Number(event.target.value) : null)}
                    >
                      <option value="">— Turno libre —</option>
                      {studentMissing && <option value={current.alumnoId}>
                        {current.alumno.apellidos}, {current.alumno.nombre} (reserva existente)
                      </option>}
                      {candidates.map((student) => (
                        <option key={student.id} value={student.id} disabled={data.estado === "CANCELADA" && student.id !== current?.alumnoId}>
                          {student.apellidos}, {student.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  {current && (
                    <div className="fixed-tutorial-details">
                      <span>Estado: {states.find(([value]) => value === current.estado)?.[1] ?? current.estado}</span>
                      {(current.motivo || current.observaciones || current.acuerdos) && (
                        <p>{current.motivo && `Motivo: ${current.motivo}\n`}
                          {current.observaciones && `Observaciones: ${current.observaciones}\n`}
                          {current.acuerdos && `Acuerdos: ${current.acuerdos}`}</p>
                      )}
                      {editing === slot.bloque && draft ? (
                        <div className="fixed-tutorial-editor">
                          <label>Estado
                            <select value={draft.estado}
                              onChange={(event) => setDraft({ ...draft, estado: event.target.value as BookingState })}>
                              {states.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                          <label>Motivo
                            <textarea rows={2} value={draft.motivo} onChange={(event) => setDraft({ ...draft, motivo: event.target.value })} />
                          </label>
                          <label>Qué se ha tratado
                            <textarea rows={3} value={draft.observaciones} onChange={(event) => setDraft({ ...draft, observaciones: event.target.value })} />
                          </label>
                          <label>Acuerdos y próximos pasos
                            <textarea rows={2} value={draft.acuerdos} onChange={(event) => setDraft({ ...draft, acuerdos: event.target.value })} />
                          </label>
                          <div className="form-actions">
                            <button className="primary compact-button" type="button" disabled={saving !== null}
                              onClick={() => void saveNotes(slot)}>Guardar tutoría</button>
                            <button className="secondary compact-button" type="button" disabled={saving !== null}
                              onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button className="secondary compact-button" type="button" disabled={saving !== null}
                          onClick={() => { setEditing(slot.bloque); setDraft(initialDraft(current)); setMessage(""); }}>
                          Gestionar esta tutoría
                        </button>
                      )}
                    </div>
                  )}
                  {saving === slot.bloque && <small>Guardando…</small>}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
