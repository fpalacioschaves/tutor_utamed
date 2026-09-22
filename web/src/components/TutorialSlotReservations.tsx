import { useEffect, useState } from "react";

type Student = { id: number; nombre: string; apellidos: string; activo?: boolean };
type Reservation = {
  id: number;
  alumnoId: number;
  observaciones: string | null;
  alumno: Student;
};
type Block = {
  index: number;
  inicio: string;
  fin: string;
  reserva: Reservation | null;
};
type Availability = {
  grupoTutoria: string | null;
  canReserve: boolean;
  reason: string | null;
  candidates: Student[];
  blocks: Block[];
};
type Draft = { alumnoId: string; observaciones: string };

function hour(iso: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function TutorialSlotReservations({ sessionId }: { sessionId: number }) {
  const [data, setData] = useState<Availability | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/sessions/${sessionId}/slots`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "No se han podido consultar los bloques.");
    const next = body as Availability;
    setData(next);
    setDrafts(Object.fromEntries(next.blocks.map((block) => [
      block.index,
      { alumnoId: block.reserva ? String(block.reserva.alumnoId) : "", observaciones: block.reserva?.observaciones ?? "" },
    ])));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    setError("");
    setMessage("");
    fetch(`/api/sessions/${sessionId}/slots`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "No se han podido cargar los bloques.");
        if (!active) return;
        const next = body as Availability;
        setData(next);
        setDrafts(Object.fromEntries(next.blocks.map((block) => [
          block.index,
          { alumnoId: block.reserva ? String(block.reserva.alumnoId) : "", observaciones: block.reserva?.observaciones ?? "" },
        ])));
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Error de consulta"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId]);

  function patch(index: number, value: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [index]: { alumnoId: current[index]?.alumnoId ?? "", observaciones: current[index]?.observaciones ?? "", ...value },
    }));
    setMessage("");
  }

  async function reserve(block: Block) {
    const draft = drafts[block.index];
    if (!draft?.alumnoId) {
      setError("Selecciona el alumno que ocupa este bloque.");
      return;
    }
    setBusy(block.index);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/slots/${block.index}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumnoId: Number(draft.alumnoId), observaciones: draft.observaciones }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar la reserva.");
      await load();
      setMessage(`Reserva guardada: ${hour(block.inicio)}–${hour(block.fin)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la reserva");
    } finally {
      setBusy(null);
    }
  }

  async function release(block: Block) {
    if (!block.reserva) return;
    if (!window.confirm(`¿Liberar la reserva de ${block.reserva.alumno.apellidos}, ${block.reserva.alumno.nombre} (${hour(block.inicio)}–${hour(block.fin)})?`)) return;
    setBusy(block.index);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/slots/${block.index}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo liberar el bloque.");
      await load();
      setMessage(`Bloque de ${hour(block.inicio)}–${hour(block.fin)} liberado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo liberar el bloque");
    } finally {
      setBusy(null);
    }
  }

  const reserved = data?.blocks.filter((block) => block.reserva).length ?? 0;

  return (
    <section className="panel tutorial-slots-panel" aria-label="Reservas de tutoría">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">TUTORÍA · AGENDA DEL PROFESOR</p>
          <h3>Reservas de 15 minutos {data?.grupoTutoria ? `· 1.º ${data.grupoTutoria}` : ""}</h3>
          <p className="muted">Traslada aquí las reservas que recibas en Google Calendar. No se sincronizan ni se comunican automáticamente.</p>
        </div>
        {data && <span className="tag">{reserved} / {data.blocks.length} reservados</span>}
      </div>

      {loading && <p className="muted">Consultando bloques…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="save-message success" role="status">{message}</p>}
      {data?.reason && <div className="notice-banner warning" role="status">{data.reason}</div>}
      {data?.canReserve && data.candidates.length === 0 && (
        <p className="muted">No hay alumnos activos matriculados en esta asignatura y asignados al grupo {data.grupoTutoria}. Comprueba los grupos y matrículas en Alumnos.</p>
      )}

      {data?.blocks.length ? (
        <div className="tutorial-slot-list">
          {data.blocks.map((block) => {
            const draft = drafts[block.index] ?? { alumnoId: "", observaciones: "" };
            const original = block.reserva;
            const unchanged = draft.alumnoId === (original ? String(original.alumnoId) : "")
              && draft.observaciones.trim() === (original?.observaciones ?? "");
            const currentStudent = original && !data.candidates.some((student) => student.id === original.alumnoId)
              ? original.alumno : null;
            return (
              <article key={block.index} className="tutorial-slot-row">
                <div className="tutorial-slot-time">
                  <strong>{hour(block.inicio)}–{hour(block.fin)}</strong>
                  <span className={original ? "status-pill session-state-realizada" : "tag muted-tag"}>
                    {original ? "Reservado" : "Libre"}
                  </span>
                </div>
                <label>
                  Alumno
                  <select value={draft.alumnoId} disabled={!data.canReserve || busy !== null}
                    onChange={(event) => patch(block.index, { alumnoId: event.target.value })}>
                    <option value="">Selecciona un alumno</option>
                    {currentStudent && <option value={currentStudent.id}>{currentStudent.apellidos}, {currentStudent.nombre} (reserva anterior)</option>}
                    {data.candidates.map((student) => (
                      <option key={student.id} value={student.id}>{student.apellidos}, {student.nombre}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Observaciones (opcional)
                  <input value={draft.observaciones} maxLength={2000} disabled={!data.canReserve || busy !== null}
                    onChange={(event) => patch(block.index, { observaciones: event.target.value })}
                    placeholder="Asunto o información de la reserva" />
                </label>
                <div className="tutorial-slot-actions">
                  <button className="primary compact-button" type="button"
                    disabled={!data.canReserve || busy !== null || !draft.alumnoId || unchanged}
                    onClick={() => void reserve(block)}>
                    {busy === block.index ? "Guardando…" : original ? "Actualizar" : "Reservar"}
                  </button>
                  {original && (
                    <button className="secondary compact-button" type="button"
                      disabled={!data.canReserve || busy !== null} onClick={() => void release(block)}>Liberar</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : !loading && data && !data.reason ? <p className="muted">No se han generado bloques.</p> : null}
    </section>
  );
}
