import { useEffect, useRef, useState, type FormEvent } from "react";

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

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectAdmin[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [editingSubject, setEditingSubject] = useState<SubjectAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSubject, setSavingSubject] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const subjectFormRef = useRef<HTMLElement | null>(null);

  async function loadSubjects() {
    setLoading(true);
    setError("");
    try {
      const [subjectsResponse, coursesResponse] = await Promise.all([
        fetch("/api/subjects"),
        fetch("/api/courses"),
      ]);
      if (!subjectsResponse.ok || !coursesResponse.ok) throw new Error("No se pudieron cargar las asignaturas");
      setSubjects(await subjectsResponse.json());
      setCourses(await coursesResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar asignaturas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubjects();
  }, []);

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
      const wasEditing = Boolean(editingSubject);
      setEditingSubject(null);
      formElement.reset();
      await loadSubjects();
      setMessage(wasEditing ? "Asignatura actualizada correctamente." : "Asignatura creada correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la asignatura");
    } finally {
      setSavingSubject(false);
    }
  }

  function beginEditing(subject: SubjectAdmin) {
    setEditingSubject(subject);
    setError("");
    setMessage("");
    requestAnimationFrame(() => subjectFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function cancelEditing() {
    setEditingSubject(null);
    setError("");
    setMessage("");
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">ESTRUCTURA DOCENTE</p>
          <h2>Asignaturas</h2>
          <p>Gestiona las asignaturas del curso. Los temas y las unidades se organizan desde la pantalla Contenidos.</p>
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

          <form
            className="form-stack"
            onSubmit={saveSubject}
            key={editingSubject?.id ?? `new-subject-${courses.find((course) => course.activo)?.id ?? courses[0]?.id ?? "none"}`}
          >
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
                <button className="secondary" type="button" onClick={cancelEditing}>
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
            <div>
              <p className="eyebrow">CONFIGURADAS</p>
              <h3>{subjects.length} asignaturas</h3>
            </div>
            <button className="text-button" type="button" onClick={() => void loadSubjects()}>Actualizar</button>
          </div>

          {loading ? (
            <p className="muted">Cargando asignaturas…</p>
          ) : subjects.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay asignaturas</strong><p>Crea la primera para comenzar.</p></div>
          ) : (
            <div className="subject-admin-list">
              {subjects.map((subject) => (
                <article className="subject-admin-card" key={subject.id}>
                  <div className="subject-select">
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
                  </div>
                  <button className="secondary compact-button" type="button" onClick={() => beginEditing(subject)}>
                    Editar
                  </button>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
