import { useEffect, useMemo, useState, type FormEvent } from "react";
import { UnitMaterialTools } from "../components/UnitMaterialTools";
import "../contents.css";

type UnitState = "PENDIENTE" | "EN_CURSO" | "IMPARTIDA";

type SubjectOption = {
  id: number;
  nombre: string;
  grupo: string;
  activa: boolean;
};

type UnitItem = {
  id: number;
  asignaturaId: number;
  orden: number;
  titulo: string;
  descripcion: string | null;
  estado: UnitState;
  observaciones: string | null;
  horasPrevistas: number | null;
  activa: boolean;
  _count: { sesiones: number; actividades: number };
};

type ContentsResponse = {
  asignatura: SubjectOption;
  unidades: UnitItem[];
};

const STATE_LABELS: Record<UnitState, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  IMPARTIDA: "Impartida",
};

function unitStateClass(state: UnitState) {
  if (state === "IMPARTIDA") return "content-state content-state-done";
  if (state === "EN_CURSO") return "content-state content-state-current";
  return "content-state content-state-pending";
}

export function ContentsPage() {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "">("");
  const [contents, setContents] = useState<ContentsResponse | null>(null);
  const [editingUnit, setEditingUnit] = useState<UnitItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadSubjects() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/subjects");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron cargar las asignaturas");
      }
      const data: SubjectOption[] = await response.json();
      setSubjects(data);
      setSelectedSubjectId((current) => {
        if (current !== "" && data.some((subject) => subject.id === current)) return current;
        return data.find((subject) => subject.activa)?.id ?? data[0]?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las asignaturas");
    } finally {
      setLoading(false);
    }
  }

  async function loadContents(subjectId: number) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/contents?subjectId=${subjectId}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron cargar los contenidos");
      }
      setContents(await response.json());
    } catch (err) {
      setContents(null);
      setError(err instanceof Error ? err.message : "No se pudieron cargar los contenidos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubjects();
  }, []);

  useEffect(() => {
    setEditorOpen(false);
    setEditingUnit(null);
    setMessage("");
    if (selectedSubjectId !== "") void loadContents(selectedSubjectId);
    else setContents(null);
  }, [selectedSubjectId]);

  const units = contents?.unidades ?? [];
  const summary = useMemo(() => ({
    total: units.length,
    pending: units.filter((unit) => unit.estado === "PENDIENTE").length,
    current: units.filter((unit) => unit.estado === "EN_CURSO").length,
    done: units.filter((unit) => unit.estado === "IMPARTIDA").length,
  }), [units]);

  const nextOrder = useMemo(() => {
    if (units.length === 0) return 1;
    return Math.max(...units.map((unit) => unit.orden)) + 1;
  }, [units]);

  function beginNewUnit() {
    setEditingUnit(null);
    setEditorOpen(true);
    setError("");
    setMessage("");
  }

  function beginEditUnit(unit: UnitItem) {
    setEditingUnit(unit);
    setEditorOpen(true);
    setError("");
    setMessage("");
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingUnit(null);
    setError("");
  }

  async function saveUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedSubjectId === "") return;

    const form = new FormData(event.currentTarget);
    const payload = {
      asignaturaId: selectedSubjectId,
      orden: Number(form.get("orden")),
      titulo: form.get("titulo"),
      descripcion: form.get("descripcion"),
      estado: form.get("estado"),
      horasPrevistas: form.get("horasPrevistas") || null,
      observaciones: form.get("observaciones"),
      activa: form.get("activa") === "on",
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        editingUnit ? `/api/contents/units/${editingUnit.id}` : "/api/contents/units",
        {
          method: editingUnit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la unidad");
      }

      const wasEditing = Boolean(editingUnit);
      closeEditor();
      await loadContents(selectedSubjectId);
      setMessage(wasEditing ? "Unidad actualizada correctamente." : "Unidad creada correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la unidad");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUnit(unit: UnitItem) {
    if (!window.confirm(`¿Eliminar la unidad “${unit.titulo}”?`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/contents/units/${unit.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo eliminar la unidad");
      }
      if (selectedSubjectId !== "") await loadContents(selectedSubjectId);
      setMessage("Unidad eliminada correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la unidad");
    }
  }

  return (
    <>
      <header className="page-header contents-page-header">
        <div>
          <p className="eyebrow">PROGRAMACIÓN DOCENTE</p>
          <h2>Contenidos</h2>
          <p>Cada unidad puede incluir material docente privado y usarlo con Ollama para preparar ejercicios, prácticas, explicaciones y repasos.</p>
        </div>
        <div className="contents-header-actions">
          <label>
            Asignatura
            <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value ? Number(event.target.value) : "")}>
              {subjects.length === 0 && <option value="">Sin asignaturas</option>}
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.nombre}{subject.grupo ? ` · ${subject.grupo}` : ""}{subject.activa ? "" : " (inactiva)"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {message && <p className="notice-banner success" role="status">{message}</p>}
      {error && <p className="notice-banner error" role="alert">{error}</p>}

      <section className="contents-summary" aria-label="Resumen de contenidos">
        <article><span>Unidades</span><strong>{summary.total}</strong></article>
        <article><span>Pendientes</span><strong>{summary.pending}</strong></article>
        <article><span>En curso</span><strong>{summary.current}</strong></article>
        <article><span>Impartidas</span><strong>{summary.done}</strong></article>
      </section>

      <section className="contents-toolbar panel">
        <div>
          <p className="eyebrow">UNIDADES DIDÁCTICAS</p>
          <h3>{contents?.asignatura.nombre ?? "Contenidos de la asignatura"}</h3>
        </div>
        <div className="form-actions">
          <button className="primary" type="button" onClick={beginNewUnit} disabled={selectedSubjectId === ""}>Nueva unidad</button>
          {selectedSubjectId !== "" && <button className="text-button" type="button" onClick={() => void loadContents(selectedSubjectId)}>Actualizar</button>}
        </div>
      </section>

      {editorOpen && contents && (
        <section className="panel contents-editor">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editingUnit ? "EDITANDO UNIDAD" : "NUEVA UNIDAD"}</p>
              <h3>{editingUnit ? editingUnit.titulo : "Añadir unidad"}</h3>
            </div>
            <button className="text-button" type="button" onClick={closeEditor}>Cerrar</button>
          </div>
          <form className="form-stack" onSubmit={saveUnit} key={editingUnit?.id ?? `unit-${nextOrder}`}>
            <div className="contents-form-row contents-form-row-three">
              <label>
                Orden
                <input name="orden" type="number" min="1" step="1" required defaultValue={editingUnit?.orden ?? nextOrder} />
              </label>
              <label>
                Estado
                <select name="estado" defaultValue={editingUnit?.estado ?? "PENDIENTE"}>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="EN_CURSO">En curso</option>
                  <option value="IMPARTIDA">Impartida</option>
                </select>
              </label>
              <label>
                Horas previstas
                <input name="horasPrevistas" type="number" min="0" step="0.5" defaultValue={editingUnit?.horasPrevistas ?? ""} placeholder="Opcional" />
              </label>
            </div>
            <label>
              Título
              <input name="titulo" required defaultValue={editingUnit?.titulo ?? ""} placeholder="Ej. Estructuras de control" />
            </label>
            <label>
              Descripción
              <textarea name="descripcion" rows={3} defaultValue={editingUnit?.descripcion ?? ""} placeholder="Opcional" />
            </label>
            <label>
              Observaciones del profesor
              <textarea name="observaciones" rows={4} defaultValue={editingUnit?.observaciones ?? ""} placeholder="Dificultades, repaso pendiente, incidencias didácticas…" />
            </label>
            <label className="inline-check">
              <input name="activa" type="checkbox" defaultChecked={editingUnit?.activa ?? true} />
              <span>Unidad activa</span>
            </label>
            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editingUnit ? "Guardar cambios" : "Crear unidad"}</button>
              <button className="secondary" type="button" onClick={closeEditor}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      <section className="contents-roadmap">
        {loading ? (
          <div className="panel"><p className="muted">Cargando contenidos…</p></div>
        ) : !contents ? (
          <div className="panel empty-state compact-empty"><strong>No hay contenidos para mostrar</strong><p>Selecciona o crea una asignatura.</p></div>
        ) : units.length === 0 ? (
          <div className="panel empty-state compact-empty">
            <strong>Esta asignatura todavía no tiene unidades.</strong>
            <p>Añade la primera unidad cuando tengas preparada la estructura real de la asignatura.</p>
            <button className="primary" type="button" onClick={beginNewUnit}>Crear primera unidad</button>
          </div>
        ) : (
          <div className="panel content-unassigned">
            <div className="content-units">
              {units.map((unit) => (
                <article className={unit.activa ? "content-unit" : "content-unit content-unit-inactive"} key={unit.id}>
                  <div className="content-unit-number">U{unit.orden}</div>
                  <div className="content-unit-main">
                    <div className="content-unit-title-line">
                      <strong>{unit.titulo}</strong>
                      <span className={unitStateClass(unit.estado)}>{STATE_LABELS[unit.estado]}</span>
                      {!unit.activa && <span className="status-pill muted-status">Inactiva</span>}
                    </div>
                    {unit.descripcion && <p>{unit.descripcion}</p>}
                    <div className="content-unit-meta">
                      {unit.horasPrevistas !== null && <span>{unit.horasPrevistas} h previstas</span>}
                      <span>{unit._count.sesiones} sesiones</span>
                      <span>{unit._count.actividades} actividades</span>
                    </div>
                    {unit.observaciones && <p className="content-unit-notes"><strong>Observaciones:</strong> {unit.observaciones}</p>}
                  </div>
                  <div className="content-unit-actions">
                    <button className="secondary compact-button" type="button" onClick={() => beginEditUnit(unit)}>Editar</button>
                    <button className="text-button content-delete" type="button" onClick={() => void deleteUnit(unit)}>Eliminar</button>
                  </div>
                  <UnitMaterialTools unit={unit} />
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
