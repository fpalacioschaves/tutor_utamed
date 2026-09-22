import { useEffect, useState } from "react";

type Student = { id: number; nombre: string; apellidos: string };
type Slot = {
  bloque: number;
  inicio: string;
  fin: string;
  reserva: { id: number; alumnoId: number; alumno: Student & { activo: boolean } } | null;
};
type BookingData = {
  sesionId: number;
  grupo: string | null;
  asignatura: string;
  estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA";
  slots: Slot[];
  alumnosElegibles: Student[];
  warning: string | null;
};

const timeFormatter = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
});

export function TutorialBookingSlots({ sessionId }: { sessionId: number }) {
  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBlock, setSavingBlock] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    void fetch(`/api/sessions/${sessionId}/booking-slots`, {
      cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los bloques");
      if (!controller.signal.aborted) setData(body as BookingData);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Error al cargar reservas");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [sessionId]);

  async function assign(bloque: number, alumnoId: number | null) {
    if (!data || savingBlock !== null) return;
    setSavingBlock(bloque);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/booking-slots/${bloque}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumnoId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar la reserva");
      const updated = body as { bloque: number; reserva: Slot["reserva"] };
      setData((current) => current && current.sesionId === sessionId
        ? { ...current, slots: current.slots.map((slot) =>
          slot.bloque === updated.bloque ? { ...slot, reserva: updated.reserva } : slot,
        ) }
        : current);
      setMessage(alumnoId === null ? "Bloque liberado." : "Reserva guardada correctamente.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la reserva");
    } finally {
      setSavingBlock(null);
    }
  }

  if (loading) return <section className="panel tutorial-booking-panel"><h3>Reservas de 15 minutos</h3><p>Cargando bloques…</p></section>;

  return (
    <section className="panel tutorial-booking-panel" aria-label="Reservas de tutoría por bloques">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">TUTORÍA INDIVIDUAL POR TURNOS</p>
          <h3>Reservas de 15 minutos</h3>
          <p className="muted">Traslada aquí las reservas de Google Calendar. Un alumno por bloque, sin modificar la sesión.</p>
        </div>
        {data && <strong>{data.slots.filter((slot) => slot.reserva).length}/{data.slots.length} reservados</strong>}
      </div>
      {data?.grupo && <p className="muted">Asignatura: {data.asignatura} · Grupo: 1.º {data.grupo}</p>}
      {data?.warning && <div className="notice-banner warning" role="alert">{data.warning}</div>}
      {error && <div className="notice-banner error" role="alert">{error}</div>}
      {message && <div className="notice-banner success" role="status">{message}</div>}
      {!data && !error && <p>No se han podido obtener los bloques.</p>}
      {data && data.alumnosElegibles.length === 0 && data.slots.length > 0 && !data.warning && (
        <p className="muted">No hay alumnos elegibles: comprueba que estén activos, matriculados en esta asignatura y asignados al grupo {data.grupo}.</p>
      )}
      {data && data.estado === "CANCELADA" && (
        <p className="muted">La tutoría está cancelada. Se conservan las reservas, pero solo puedes liberar bloques.</p>
      )}
      {data && data.slots.length > 0 && (
        <div className="tutorial-booking-grid">
          {data.slots.map((slot) => {
            const occupiedIds = new Set(data.slots
              .filter((item) => item.bloque !== slot.bloque && item.reserva)
              .map((item) => item.reserva!.alumnoId));
            const currentStudent = slot.reserva?.alumno;
            const selectable = data.alumnosElegibles.filter((student) => !occupiedIds.has(student.id));
            const currentIsEligible = !currentStudent || selectable.some((student) => student.id === currentStudent.id);
            return (
              <div className="tutorial-booking-row" key={slot.bloque}>
                <div>
                  <strong>{timeFormatter.format(new Date(slot.inicio))}–{timeFormatter.format(new Date(slot.fin))}</strong>
                  <span className={slot.reserva ? "tag" : "tag muted-tag"}>{slot.reserva ? "Reservado" : "Libre"}</span>
                </div>
                <label>
                  <span>Alumno</span>
                  <select
                    aria-label={`Alumno del bloque ${slot.bloque + 1}`}
                    value={slot.reserva?.alumnoId ?? ""}
                    disabled={savingBlock !== null || Boolean(data.warning)}
                    onChange={(event) => void assign(slot.bloque, event.target.value ? Number(event.target.value) : null)}
                  >
                    <option value="">— Libre —</option>
                    {!currentIsEligible && currentStudent && (
                      <option value={currentStudent.id}>
                        {currentStudent.apellidos}, {currentStudent.nombre} (reserva anterior)
                      </option>
                    )}
                    {selectable.map((student) => (
                      <option key={student.id} value={student.id} disabled={data.estado === "CANCELADA"}>{student.apellidos}, {student.nombre}</option>
                    ))}
                  </select>
                </label>
                {savingBlock === slot.bloque && <small>Guardando…</small>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
