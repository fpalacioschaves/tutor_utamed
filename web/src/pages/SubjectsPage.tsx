import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type Course = {
  id: number;
  nombre: string;
  activo: boolean;
};

type SubjectAdmin = {
  id: number;
  cursoAcademicoId: number;
  nombre: string;
  codigo: string | null;
  grupo: string;
  activa: boolean;
  cursoAcademico: { id: number; nombre: string };
  _count: {
    matriculas: number;
    sesiones: number;
    unidades: number;
    actividades: number;
  };
};

type UnitAdmin = {
  id: number;
  asignaturaId: number;
  orden: number;
  titulo: string;
  descripcion: string | null;
  activa: boolean;
  _count: {
    sesiones: number;
    actividades: number;
  };
};

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectAdmin[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [units, setUnits] = useState<UnitAdmin[]>([]);
  const [editingSubject, setEditingSubject] = useState<SubjectAdmin | null>(null);
  const [editingUnit, setEditingUnit] = useState<UnitAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);
  const [error, setError] = useState("");
  const [unitError, setUnitError] = useState("");
  const [message, setMessage] = useState("");
  const [unitMessage, setUnitMessage] = useState("");
  const subjectFormRef = useRef<HTMLElement | null>(null);
  const unitFormRef = useRef<HTMLFormElement | null>(null);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId) ?? null,
    [subjects, selectedSubjectId],
  );

  const nextUnitOrder = useMemo(() => {
    if (units.length === 0) return 1;
    return Math.max(...units.map((unit) => unit.orden)) + 1;
  }, [units]);

  async function loadSubjects(preferredId?: number) {
    setLoading(true);
    setError("");
    try {
      const [subjectsResponse, coursesResponse] = await Promise.all([
        fetch("/api/subjects"),
        fetch("/api/courses"),
      ]);
      if (!subjectsResponse.ok || !coursesResponse.ok) throw new Error("No se pudieron cargar las asignaturas");
      const subjectData: SubjectAdmin[] = await subjectsResponse.json();
      const courseData: Course[] = await coursesResponse.json();
      setSubjects(subjectData);
      setCourses(courseData);

      const candidate = preferredId ?? selectedSubjectId;
      if (candidate && subjectData.some((subject) => subject.id === candidate)) {
        setSelectedSubjectId(candidate);
      } else {
        setSelectedSubjectId(subjectData[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar asignaturas");
    } finally {
      setLoading(false);
    }
  }

  async function loadUnits(subjectId: number) {
    setLoadingUnits(true);
    setUnitError("");
    try {
      const response = await fetch(`/api/subjects/${subjectId}/units`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron cargar las unidades");
      }
      setUnits(await response.json());
    } catch (err) {
      setUnitError(err instanceof Error ? err.message : "Error al cargar unidades");
      setUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  }

  useEffect(() => {
    void loadSubjects();
  }, []);

  useEffect(() => {
    setEditingUnit(null);
    if (selectedSubjectId !== null) void loadUnits(selectedSubjectId);
    else setUnits([]);
  }, [selectedSubjectId]);

  async function saveSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const payload = {
      cursoAcademicoId: Number(data.get("cursoAcademicoId")),
      nombre: data.get("nombre"),
      codigo: data.get("codigo"),
      grupo: data.get("grupo"),
      activa: data.get("activa") === "on",
    };

    setSavingSubject(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(editingSubject ? `/api/subjects/${editingSubject.id}` : "/api/subjects", {
        method: editingSubject ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la asignatura");
      }
      const saved: SubjectAdmin = await response.json();
      const wasEditing = Boolean(editingSubject);
      setEditingSubject(null);
      formElement.reset();
      await loadSubjects(saved.id);
      setMessage(wasEditing ? "Asignatura actualizada correctamente." : "Asignatura creada correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la asignatura");
    } finally {
      setSavingSubject(false);
    }
  }

  async function saveUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSubjectId) return;
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const payload = {
      orden: Number(data.get("orden")),
      titulo: data.get("titulo"),
      descripcion: data.get("descripcion"),
      activa: data.get("activa") === "on",
    };

    setSavingUnit(true);
    setUnitError("");
    setUnitMessage("");
    try {
      const response = await fetch(
        editingUnit
          ? `/api/subjects/${selectedSubjectId}/units/${editingUnit.id}`
          : `/api/subjects/${selectedSubjectId}/units`,
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
      setEditingUnit(null);
      formElement.reset();
      await Promise.all([loadUnits(selectedSubjectId), loadSubjects(selectedSubjectId)]);
      setUnitMessage(wasEditing ? "Unidad actualizada correctamente." : "Unidad creada correctamente.");
    } catch (err) {
      setUnitError(err instanceof Error ? err.message : "No se pudo guardar la unidad");
    } finally {
      setSavingUnit(false);
    }
  }

  function selectSubject(subject: SubjectAdmin) {
    setSelectedSubjectId(subject.id);
    setEditingUnit(null);
    setUnitError("");
    setUnitMessage("");
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">ESTRUCTURA DOCENTE</p>
          <h2>Asignaturas y unidades</h2>
          <p>Edita tus asignaturas y organiza las unidades didácticas que usarás después en sesiones y actividades.</p>
        </div>
      </header>

      <section className="content-grid subjects-admin-grid">
        <article className="panel" ref={subjectFormRef}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editingSubject ? "EDITANDO" : "NUEVA"}</p>
              <h3>{editingSubject ? "Editar asignatura" : "Nueva asignatura"}</h3>
            </div>
          </div>

          <form className="form-stack" onSubmit={saveSubject} key={editingSubject?.id ?? `new-subject-${courses.find((course) => course.activo)?.id ?? courses[0]?.id ?? "none"}`}>
            <label>
              Curso académico
              <select
                name="cursoAcademicoId"
                required
                defaultValue={editingSubject?.cursoAcademicoId ?? courses.find((course) => course.activo)?.id ?? courses[0]?.id ?? ""}
                disabled={Boolean(editingSubject)}
              >
                <option value="" disabled>Selecciona el curso</option>
                {courses.map((course) => <option value={course.id} key={course.id}>{course.nombre}</option>)}
              </select>
            </label>
            {editingSubject && <input type="hidden" name="cursoAcademicoId" value={editingSubject.cursoAcademicoId} />}

            <label>
              Nombre
              <input name="nombre" required defaultValue={editingSubject?.nombre ?? ""} placeholder="Ej. Programación" />
            </label>

            <div className="form-row">
              <label>
                Código
                <input name="codigo" defaultValue={editingSubject?.codigo ?? ""} placeholder="Opcional" />
              </label>
              <label>
                Grupo
                <input name="grupo" defaultValue={editingSubject?.grupo ?? ""} placeholder="Opcional" />
              </label>
            </div>

            <label className="inline-check">
              <input type="checkbox" name="activa" defaultChecked={editingSubject?.activa ?? true} />
              <span>Asignatura activa</span>
            </label>

            <div className="form-actions">
              <button className="primary" type="submit" disabled={savingSubject || courses.length === 0}>
                {savingSubject ? "Guardando…" : editingSubject ? "Guardar cambios" : "Crear asignatura"}
              </button>
              {editingSubject && (
                <button className="secondary" type="button" onClick={(event) => { setEditingSubject(null); event.currentTarget.form?.reset(); setError(""); setMessage(""); }}>
                  Cancelar
                </button>
              )}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="save-message success" role="status">{message}</p>}
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">CONFIGURADAS</p><h3>{subjects.length} asignaturas</h3></div>
            <button className="text-button" type="button" onClick={() => void loadSubjects()}>Actualizar</button>
          </div>

          {loading ? (
            <p className="muted">Cargando asignaturas…</p>
          ) : subjects.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay asignaturas</strong><p>Crea la primera para comenzar.</p></div>
          ) : (
            <div className="subject-admin-list">
              {subjects.map((subject) => (
                <article className={selectedSubjectId === subject.id ? "subject-admin-card selected" : "subject-admin-card"} key={subject.id}>
                  <button className="subject-select" type="button" onClick={() => selectSubject(subject)}>
                    <div className="subject-card-title">
                      <strong>{subject.nombre}{subject.grupo ? ` · ${subject.grupo}` : ""}</strong>
                      <span className={subject.activa ? "status-pill ok" : "status-pill muted-status"}>{subject.activa ? "Activa" : "Inactiva"}</span>
                    </div>
                    <small>{subject.codigo || "Sin código"} · {subject.cursoAcademico.nombre}</small>
                    <div className="subject-card-stats">
                      <span><strong>{subject._count.matriculas}</strong> alumnos</span>
                      <span><strong>{subject._count.unidades}</strong> unidades</span>
                      <span><strong>{subject._count.sesiones}</strong> sesiones</span>
                      <span><strong>{subject._count.actividades}</strong> actividades</span>
                    </div>
                  </button>
                  <button className="secondary compact-button" type="button" onClick={() => { setEditingSubject(subject); setError(""); setMessage(""); requestAnimationFrame(() => subjectFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>
                    Editar
                  </button>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="student-section units-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">UNIDADES DIDÁCTICAS</p>
            <h3>{selectedSubject ? selectedSubject.nombre : "Selecciona una asignatura"}</h3>
          </div>
          {selectedSubject && <span className="section-count">{units.length}</span>}
        </div>

        {!selectedSubject ? (
          <div className="empty-state compact-empty"><strong>No hay asignatura seleccionada</strong><p>Selecciona una asignatura para gestionar sus unidades.</p></div>
        ) : (
          <div className="units-admin-layout">
            <form className="form-stack unit-form" ref={unitFormRef} onSubmit={saveUnit} key={editingUnit?.id ?? `new-unit-${selectedSubject.id}-${nextUnitOrder}`}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{editingUnit ? "EDITANDO" : "NUEVA"}</p>
                  <h3>{editingUnit ? `Unidad ${editingUnit.orden}` : "Nueva unidad"}</h3>
                </div>
              </div>

              <div className="unit-order-title">
                <label>
                  Orden
                  <input name="orden" type="number" min="1" step="1" required defaultValue={editingUnit?.orden ?? nextUnitOrder} />
                </label>
                <label>
                  Título
                  <input name="titulo" required defaultValue={editingUnit?.titulo ?? ""} placeholder="Ej. Arrays" />
                </label>
              </div>

              <label>
                Descripción
                <textarea name="descripcion" rows={4} defaultValue={editingUnit?.descripcion ?? ""} placeholder="Opcional" />
              </label>

              <label className="inline-check">
                <input type="checkbox" name="activa" defaultChecked={editingUnit?.activa ?? true} />
                <span>Unidad activa</span>
              </label>

              <div className="form-actions">
                <button className="primary" type="submit" disabled={savingUnit}>
                  {savingUnit ? "Guardando…" : editingUnit ? "Guardar cambios" : "Crear unidad"}
                </button>
                {editingUnit && (
                  <button className="secondary" type="button" onClick={(event) => { setEditingUnit(null); event.currentTarget.form?.reset(); setUnitError(""); setUnitMessage(""); }}>
                    Cancelar
                  </button>
                )}
              </div>
              {unitError && <p className="form-error" role="alert">{unitError}</p>}
              {unitMessage && <p className="save-message success" role="status">{unitMessage}</p>}
            </form>

            <div className="unit-list-wrap">
              {loadingUnits ? (
                <p className="muted">Cargando unidades…</p>
              ) : units.length === 0 ? (
                <div className="empty-state compact-empty"><strong>Aún no hay unidades</strong><p>Crea la primera unidad de {selectedSubject.nombre}.</p></div>
              ) : (
                <div className="unit-list">
                  {units.map((unit) => (
                    <article className={unit.activa ? "unit-card" : "unit-card inactive"} key={unit.id}>
                      <div className="unit-number">U{unit.orden}</div>
                      <div className="unit-main">
                        <div className="unit-title-line">
                          <strong>{unit.titulo}</strong>
                          {!unit.activa && <span className="status-pill muted-status">Inactiva</span>}
                        </div>
                        {unit.descripcion && <p>{unit.descripcion}</p>}
                        <small>{unit._count.sesiones} sesiones · {unit._count.actividades} actividades</small>
                      </div>
                      <button className="secondary compact-button" type="button" onClick={() => { setEditingUnit(unit); setUnitError(""); setUnitMessage(""); requestAnimationFrame(() => unitFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>
                        Editar
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
