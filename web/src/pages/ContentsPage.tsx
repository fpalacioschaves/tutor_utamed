import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  temaId: number | null;
  orden: number;
  titulo: string;
  descripcion: string | null;
  estado: UnitState;
  observaciones: string | null;
  horasPrevistas: number | null;
  activa: boolean;
  _count: { sesiones: number; actividades: number };
};

type TopicItem = {
  id: number;
  asignaturaId: number;
  orden: number;
  titulo: string;
  descripcion: string | null;
  activo: boolean;
  unidades: UnitItem[];
};

type ContentsResponse = {
  asignatura: SubjectOption;
  temas: TopicItem[];
  unidadesSinTema: UnitItem[];
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [topicEditorOpen, setTopicEditorOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<TopicItem | null>(null);
  const [unitEditorOpen, setUnitEditorOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitItem | null>(null);
  const [newUnitTopicId, setNewUnitTopicId] = useState<number | "">("");

  async function loadSubjects() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/subjects");
      if (!response.ok) throw new Error("No se pudieron cargar las asignaturas");
      const data: SubjectOption[] = await response.json();
      setSubjects(data);
      setSelectedSubjectId((current) => {
        if (current !== "" && data.some((subject) => subject.id === current)) return current;
        return data.find((subject) => subject.activa)?.id ?? data[0]?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar las asignaturas");
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
      setError(err instanceof Error ? err.message : "Error al cargar los contenidos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubjects();
  }, []);

  useEffect(() => {
    setTopicEditorOpen(false);
    setEditingTopic(null);
    setUnitEditorOpen(false);
    setEditingUnit(null);
    setNewUnitTopicId("");
    setMessage("");
    if (selectedSubjectId !== "") void loadContents(selectedSubjectId);
    else setContents(null);
  }, [selectedSubjectId]);

  const allUnits = useMemo(() => {
    if (!contents) return [];
    return [...contents.temas.flatMap((topic) => topic.unidades), ...contents.unidadesSinTema];
  }, [contents]);

  const summary = useMemo(() => ({
    topics: contents?.temas.length ?? 0,
    units: allUnits.length,
    pending: allUnits.filter((unit) => unit.estado === "PENDIENTE").length,
    current: allUnits.filter((unit) => unit.estado === "EN_CURSO").length,
    done: allUnits.filter((unit) => unit.estado === "IMPARTIDA").length,
  }), [contents, allUnits]);

  const nextTopicOrder = useMemo(() => {
    if (!contents || contents.temas.length === 0) return 1;
    return Math.max(...contents.temas.map((topic) => topic.orden)) + 1;
  }, [contents]);

  const nextUnitOrder = useMemo(() => {
    if (allUnits.length === 0) return 1;
    return Math.max(...allUnits.map((unit) => unit.orden)) + 1;
  }, [allUnits]);

  function beginNewTopic() {
    setEditingTopic(null);
    setTopicEditorOpen(true);
    setUnitEditorOpen(false);
    setEditingUnit(null);
    setError("");
    setMessage("");
  }

  function beginEditTopic(topic: TopicItem) {
    setEditingTopic(topic);
    setTopicEditorOpen(true);
    setUnitEditorOpen(false);
    setEditingUnit(null);
    setError("");
    setMessage("");
  }

  function beginNewUnit(topicId?: number) {
    setEditingUnit(null);
    setNewUnitTopicId(topicId ?? contents?.temas[0]?.id ?? "");
    setUnitEditorOpen(true);
    setTopicEditorOpen(false);
    setEditingTopic(null);
    setError("");
    setMessage("");
  }

  function beginEditUnit(unit: UnitItem) {
    setEditingUnit(unit);
    setNewUnitTopicId(unit.temaId ?? "");
    setUnitEditorOpen(true);
    setTopicEditorOpen(false);
    setEditingTopic(null);
    setError("");
    setMessage("");
  }

  function closeEditors() {
    setTopicEditorOpen(false);
    setEditingTopic(null);
    setUnitEditorOpen(false);
    setEditingUnit(null);
    setNewUnitTopicId("");
    setError("");
  }

  async function saveTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedSubjectId === "") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      asignaturaId: selectedSubjectId,
      orden: Number(form.get("orden")),
      titulo: form.get("titulo"),
      descripcion: form.get("descripcion"),
      activo: form.get("activo") === "on",
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        editingTopic ? `/api/contents/topics/${editingTopic.id}` : "/api/contents/topics",
        {
          method: editingTopic ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar el tema");
      }
      const wasEditing = Boolean(editingTopic);
      closeEditors();
      await loadContents(selectedSubjectId);
      setMessage(wasEditing ? "Tema actualizado correctamente." : "Tema creado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el tema");
    } finally {
      setSaving(false);
    }
  }

  async function saveUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedSubjectId === "") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      temaId: Number(form.get("temaId")),
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
      closeEditors();
      await loadContents(selectedSubjectId);
      setMessage(wasEditing ? "Unidad actualizada correctamente." : "Unidad creada correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la unidad");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTopic(topic: TopicItem) {
    if (!window.confirm(`¿Eliminar el tema “${topic.titulo}”?`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/contents/topics/${topic.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo eliminar el tema");
      }
      if (selectedSubjectId !== "") await loadContents(selectedSubjectId);
      setMessage("Tema eliminado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el tema");
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
          <p>Organiza cada asignatura en temas y unidades y registra manualmente el avance real del curso.</p>
        </div>
        <div className="contents-header-actions">
          <label>
            Asignatura
            <select
              value={selectedSubjectId}
              onChange={(event) => setSelectedSubjectId(event.target.value ? Number(event.target.value) : "")}
            >
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
        <article><span>Temas</span><strong>{summary.topics}</strong></article>
        <article><span>Unidades</span><strong>{summary.units}</strong></article>
        <article><span>Pendientes</span><strong>{summary.pending}</strong></article>
        <article><span>En curso</span><strong>{summary.current}</strong></article>
        <article><span>Impartidas</span><strong>{summary.done}</strong></article>
      </section>

      <section className="contents-toolbar panel">
        <div>
          <p className="eyebrow">ESTRUCTURA</p>
          <h3>{contents?.asignatura.nombre ?? "Contenidos de la asignatura"}</h3>
        </div>
        <div className="form-actions">
          <button className="secondary" type="button" onClick={beginNewTopic} disabled={selectedSubjectId === ""}>Nuevo tema</button>
          <button className="primary" type="button" onClick={() => beginNewUnit()} disabled={!contents || contents.temas.length === 0}>Nueva unidad</button>
          {selectedSubjectId !== "" && <button className="text-button" type="button" onClick={() => void loadContents(selectedSubjectId)}>Actualizar</button>}
        </div>
      </section>

      {topicEditorOpen && (
        <section className="panel contents-editor">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editingTopic ? "EDITANDO TEMA" : "NUEVO TEMA"}</p>
              <h3>{editingTopic ? editingTopic.titulo : "Añadir tema"}</h3>
            </div>
            <button className="text-button" type="button" onClick={closeEditors}>Cerrar</button>
          </div>
          <form className="form-stack" onSubmit={saveTopic} key={editingTopic?.id ?? `topic-${nextTopicOrder}`}>
            <div className="contents-form-row">
              <label>
                Orden
                <input name="orden" type="number" min="1" step="1" required defaultValue={editingTopic?.orden ?? nextTopicOrder} />
              </label>
              <label>
                Título
                <input name="titulo" required defaultValue={editingTopic?.titulo ?? ""} placeholder="Ej. Estructuras de control" />
              </label>
            </div>
            <label>
              Descripción
              <textarea name="descripcion" rows={3} defaultValue={editingTopic?.descripcion ?? ""} placeholder="Opcional" />
            </label>
            <label className="inline-check">
              <input name="activo" type="checkbox" defaultChecked={editingTopic?.activo ?? true} />
              <span>Tema activo</span>
            </label>
            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editingTopic ? "Guardar cambios" : "Crear tema"}</button>
              <button className="secondary" type="button" onClick={closeEditors}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      {unitEditorOpen && contents && (
        <section className="panel contents-editor">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editingUnit ? "EDITANDO UNIDAD" : "NUEVA UNIDAD"}</p>
              <h3>{editingUnit ? editingUnit.titulo : "Añadir unidad"}</h3>
            </div>
            <button className="text-button" type="button" onClick={closeEditors}>Cerrar</button>
          </div>
          <form className="form-stack" onSubmit={saveUnit} key={editingUnit?.id ?? `unit-${nextUnitOrder}-${newUnitTopicId}`}>
            <div className="contents-form-row contents-form-row-three">
              <label>
                Tema
                <select name="temaId" required value={newUnitTopicId} onChange={(event) => setNewUnitTopicId(event.target.value ? Number(event.target.value) : "")}>
                  <option value="" disabled>Selecciona un tema</option>
                  {contents.temas.map((topic) => <option key={topic.id} value={topic.id}>T{topic.orden} · {topic.titulo}</option>)}
                </select>
              </label>
              <label>
                Orden de unidad
                <input name="orden" type="number" min="1" step="1" required defaultValue={editingUnit?.orden ?? nextUnitOrder} />
              </label>
              <label>
                Estado
                <select name="estado" defaultValue={editingUnit?.estado ?? "PENDIENTE"}>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="EN_CURSO">En curso</option>
                  <option value="IMPARTIDA">Impartida</option>
                </select>
              </label>
            </div>
            <label>
              Título
              <input name="titulo" required defaultValue={editingUnit?.titulo ?? ""} placeholder="Ej. Condicionales" />
            </label>
            <label>
              Descripción
              <textarea name="descripcion" rows={3} defaultValue={editingUnit?.descripcion ?? ""} placeholder="Opcional" />
            </label>
            <label>
              Horas previstas
              <input name="horasPrevistas" type="number" min="0" step="0.5" defaultValue={editingUnit?.horasPrevistas ?? ""} placeholder="Opcional" />
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
              <button className="primary" type="submit" disabled={saving || newUnitTopicId === ""}>{saving ? "Guardando…" : editingUnit ? "Guardar cambios" : "Crear unidad"}</button>
              <button className="secondary" type="button" onClick={closeEditors}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      <section className="contents-roadmap">
        {loading ? (
          <div className="panel"><p className="muted">Cargando contenidos…</p></div>
        ) : !contents ? (
          <div className="panel empty-state compact-empty"><strong>No hay contenidos para mostrar</strong><p>Selecciona o crea una asignatura.</p></div>
        ) : contents.temas.length === 0 && contents.unidadesSinTema.length === 0 ? (
          <div className="panel empty-state compact-empty">
            <strong>Esta asignatura todavía no tiene contenidos.</strong>
            <p>Crea el primer tema y, después, añade sus unidades.</p>
            <button className="primary" type="button" onClick={beginNewTopic}>Crear primer tema</button>
          </div>
        ) : (
          <>
            {contents.temas.map((topic) => {
              const done = topic.unidades.filter((unit) => unit.estado === "IMPARTIDA").length;
              return (
                <details className={topic.activo ? "content-topic" : "content-topic content-topic-inactive"} key={topic.id} open>
                  <summary>
                    <div className="content-topic-number">T{topic.orden}</div>
                    <div className="content-topic-title">
                      <strong>{topic.titulo}</strong>
                      <small>{topic.descripcion || "Sin descripción"}</small>
                    </div>
                    <div className="content-topic-progress">
                      <span>{done}/{topic.unidades.length} impartidas</span>
                      {!topic.activo && <span className="status-pill muted-status">Inactivo</span>}
                    </div>
                    <div className="content-topic-actions" onClick={(event) => event.stopPropagation()}>
                      <button className="secondary compact-button" type="button" onClick={() => beginNewUnit(topic.id)}>Añadir unidad</button>
                      <button className="secondary compact-button" type="button" onClick={() => beginEditTopic(topic)}>Editar</button>
                      <button className="text-button content-delete" type="button" onClick={() => void deleteTopic(topic)}>Eliminar</button>
                    </div>
                  </summary>

                  <div className="content-units">
                    {topic.unidades.length === 0 ? (
                      <div className="content-empty-unit">Este tema todavía no contiene unidades.</div>
                    ) : topic.unidades.map((unit) => (
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
                      </article>
                    ))}
                  </div>
                </details>
              );
            })}

            {contents.unidadesSinTema.length > 0 && (
              <section className="panel content-unassigned">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">PENDIENTES DE CLASIFICAR</p>
                    <h3>Unidades sin tema</h3>
                  </div>
                  <span className="section-count">{contents.unidadesSinTema.length}</span>
                </div>
                <p className="muted">Son unidades creadas antes de incorporar la estructura por temas. Edítalas para asignarlas al tema correspondiente.</p>
                <div className="content-units">
                  {contents.unidadesSinTema.map((unit) => (
                    <article className="content-unit" key={unit.id}>
                      <div className="content-unit-number">U{unit.orden}</div>
                      <div className="content-unit-main">
                        <div className="content-unit-title-line">
                          <strong>{unit.titulo}</strong>
                          <span className={unitStateClass(unit.estado)}>{STATE_LABELS[unit.estado]}</span>
                        </div>
                        {unit.descripcion && <p>{unit.descripcion}</p>}
                      </div>
                      <div className="content-unit-actions">
                        <button className="primary compact-button" type="button" onClick={() => beginEditUnit(unit)} disabled={contents.temas.length === 0}>Asignar a tema</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </>
  );
}
