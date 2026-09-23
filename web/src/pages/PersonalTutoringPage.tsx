import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PersonalOverview } from "../types";
import "../personal-tutoring.css";

type Draft = { fecha: string; medio: string; observaciones: string; acuerdos: string };
function localToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function blank(): Draft { return { fecha: localToday(), medio: "Teléfono", observaciones: "", acuerdos: "" }; }
function recordDraft(alumno: PersonalOverview["alumnos"][number], numero: number): Draft {
  const item = alumno.contactosPersonales.find(c => c.numero === numero);
  return item ? {
    fecha: item.fecha.slice(0, 10), medio: item.medio,
    observaciones: item.observaciones ?? "", acuerdos: item.acuerdos ?? "",
  } : blank();
}
function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return day + "/" + month + "/" + year;
}

export function PersonalTutoringPage({
  focusedContact, onOpenStudents, onOpenStudent,
}: {
  focusedContact?: number | null;
  onOpenStudents: () => void;
  onOpenStudent: (id: number) => void;
}) {
  const [data, setData] = useState<PersonalOverview | null>(null);
  const [selectedNumber, setSelectedNumber] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [onlyPending, setOnlyPending] = useState(Boolean(focusedContact));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const firstLoad = useRef(true);

  async function load() {
    const response = await fetch("/api/personal-tutoring", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body.error ?? "No se pudo cargar el seguimiento personal.");
    const overview = body as PersonalOverview;
    setData(overview);
    if (firstLoad.current) {
      firstLoad.current = false;
      const number = focusedContact ?? overview.destacada.numero;
      setSelectedNumber(number);
      const first = overview.alumnos.find(a => !a.contactosPersonales.some(c => c.numero === number)) ?? overview.alumnos[0];
      if (first) {
        setSelectedStudent(first.id);
        setDraft(recordDraft(first, number));
      }
    }
  }
  useEffect(() => { void load().catch((err: unknown) =>
    setError(err instanceof Error ? err.message : "No se pudieron cargar los contactos.")); }, []);
  useEffect(() => {
    if (focusedContact && data && focusedContact !== selectedNumber) {
      choose(data.alumnos.find(a => a.id === selectedStudent) ?? data.alumnos[0], focusedContact);
    }
  }, [focusedContact]);

  function choose(alumno: PersonalOverview["alumnos"][number] | undefined, numero: number) {
    if (!alumno) return;
    setSelectedStudent(alumno.id);
    setSelectedNumber(numero);
    setDraft(recordDraft(alumno, numero));
    setError(""); setMessage("");
  }
  const guia = data?.periodos.find(p => p.numero === selectedNumber);
  const alumno = data?.alumnos.find(a => a.id === selectedStudent);
  const contact = alumno?.contactosPersonales.find(c => c.numero === selectedNumber);
  const visible = (data?.alumnos ?? []).filter(a =>
    !onlyPending || !a.contactosPersonales.some(c => c.numero === selectedNumber));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!alumno) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(
        `/api/personal-tutoring/students/${alumno.id}/contacts/${selectedNumber}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error ?? "No se pudo guardar el contacto.");
      await load();
      setMessage(`Contacto C${selectedNumber} guardado correctamente en la base local.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Error al guardar."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!alumno || !contact || !window.confirm(
      `¿Eliminar el registro del contacto C${selectedNumber} de este alumno? Los datos no podrán recuperarse desde la aplicación.`,
    )) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(
        `/api/personal-tutoring/students/${alumno.id}/contacts/${selectedNumber}`, { method: "DELETE" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Error(body.error ?? "No se pudo eliminar el contacto.");
      }
      setDraft(blank());
      await load();
      setMessage("Registro corregido: vuelve a constar como pendiente.");
    } catch (err) { setError(err instanceof Error ? err.message : "Error al eliminar."); }
    finally { setSaving(false); }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">DOCENTE-TUTOR · CURSO 2026-2027</p>
          <h2>Seguimiento personalizado</h2>
          <p>Cinco contactos programados con tus alumnos asignados. Independientes de las tutorías académicas individuales y grupales.</p>
        </div>
        <button className="secondary" type="button"
          onClick={() => void load().catch((err: unknown) => setError(String(err)))}>Actualizar</button>
      </header>

      {error && <div className="notice-banner error" role="alert">{error}</div>}
      {message && <p className="save-message success" role="status">{message}</p>}
      {!data ? <section className="panel">Cargando seguimientos…</section> : data.totalAlumnos === 0 ? (
        <section className="panel">
          <h3>Todavía no has marcado alumnos tutorizados</h3>
          <p>Marca a los alumnos que UTAMED te ha asignado en el listado local de Alumnos. No se importará ningún PDF ni se añadirán datos personales al repositorio.</p>
          <button className="primary" type="button" onClick={onOpenStudents}>Ir a Alumnos</button>
        </section>
      ) : (
        <>
          <section className="personal-periods" aria-label="Cinco contactos oficiales">
            {data.periodos.map(p => (
              <button type="button" key={p.numero}
                className={p.numero === selectedNumber ? "panel personal-period selected" : "panel personal-period"}
                onClick={() => choose(data.alumnos.find(a => a.id === selectedStudent) ?? data.alumnos[0], p.numero)}>
                <span className="eyebrow">CONTACTO C{p.numero}</span>
                <strong>{p.titulo}</strong>
                <small>{p.momento}</small>
                <span className="personal-count">{p.realizados}/{p.total} realizados</span>
                <span className={p.estado === "VENCIDO" ? "status-pill danger" : "status-pill"}>
                  {p.pendientes === 0 ? "Completado" : p.estado === "VENCIDO" ? "Fuera de plazo" :
                    p.estado === "PROXIMO" ? "Próximo" : "En plazo"} · {p.pendientes} pendientes
                </span>
              </button>
            ))}
          </section>
          {guia && (
            <section className="panel personal-guide" aria-label="Guion del contacto">
              <p className="eyebrow">GUION DE UTAMED · CONTACTO {guia.numero}</p>
              <h3>{guia.titulo}</h3>
              <p><strong>Momento:</strong> {guia.momento}</p>
              <p><strong>Contenido mínimo:</strong> {guia.contenido}</p>
              {guia.fueraPlazo > 0 && <p className="muted">{guia.fueraPlazo} contacto(s) registrados fuera del intervalo previsto.</p>}
            </section>
          )}
          <div className="personal-layout">
            <section className="panel">
              <div className="panel-heading">
                <div><p className="eyebrow">ALUMNOS ASIGNADOS</p>
                  <h3>{visible.length} de {data.totalAlumnos}</h3></div>
              </div>
              <label className="inline-check personal-filter">
                <input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />
                Solo pendientes del contacto C{selectedNumber}
              </label>
              {visible.length === 0 ? <p className="dashboard-ok">Todos los alumnos tienen registrado este contacto.</p> :
                <div className="personal-student-list">
                  {visible.map(a => {
                    const entry = a.contactosPersonales.find(c => c.numero === selectedNumber);
                    return <button type="button" key={a.id}
                      className={a.id === selectedStudent ? "personal-student selected" : "personal-student"}
                      onClick={() => choose(a, selectedNumber)}>
                      <span><strong>{a.apellidos}, {a.nombre}</strong><small>{a.grupo?.nombre ?? "Sin grupo"}</small></span>
                      <span className={entry ? "status-pill ok" : "status-pill"}>
                        {entry ? formatDate(entry.fecha.slice(0, 10)) : "Pendiente"}
                      </span>
                    </button>;
                  })}
                </div>}
            </section>
            <section className="panel personal-form-panel">
              {!alumno ? <p>Selecciona un alumno.</p> : <>
                <p className="eyebrow">CONTACTO C{selectedNumber} · REGISTRO INDIVIDUAL</p>
                <h3>{alumno.nombre} {alumno.apellidos}</h3>
                <p className="muted">{contact ? "Contacto registrado; puedes corregirlo." : "Pendiente de registrar."}</p>
                <form className="form-stack" onSubmit={save}>
                  <label>Fecha real del contacto
                    <input type="date" required min="2026-09-01" max="2027-07-31"
                      value={draft.fecha} onChange={e => setDraft(d => ({ ...d, fecha: e.target.value }))} />
                  </label>
                  <label>Medio utilizado
                    <select value={draft.medio} onChange={e => setDraft(d => ({ ...d, medio: e.target.value }))}>
                      <option>Teléfono</option><option>Videollamada</option><option>Correo electrónico</option>
                      <option>Mensajería</option><option>Presencial</option><option>Otro</option>
                    </select>
                  </label>
                  <label>Observaciones de la conversación
                    <textarea rows={5} value={draft.observaciones} onChange={e => setDraft(d => ({ ...d, observaciones: e.target.value }))} />
                  </label>
                  <label>Acuerdos o actuaciones pendientes
                    <textarea rows={3} value={draft.acuerdos} onChange={e => setDraft(d => ({ ...d, acuerdos: e.target.value }))} />
                  </label>
                  <p className="muted">El guion anterior es solo una referencia. No hay casillas ni calificaciones por pregunta.</p>
                  <div className="row-actions">
                    <button className="primary" type="submit" disabled={saving}>
                      {saving ? "Guardando…" : contact ? "Guardar corrección" : "Registrar contacto"}
                    </button>
                    {contact && <button className="secondary" type="button" onClick={() => void remove()} disabled={saving}>Eliminar registro</button>}
                    <button className="secondary" type="button" onClick={() => onOpenStudent(alumno.id)}>Ver ficha del alumno</button>
                  </div>
                </form>
              </>}
            </section>
          </div>
        </>
      )}
    </>
  );
}
