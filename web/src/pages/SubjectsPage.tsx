import { useEffect, useMemo, useState, type FormEvent } from "react";
import "../academic.css";

type Course = {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
  _count: { asignaturas: number; grupos: number };
};

type Group = {
  id: number;
  cursoAcademicoId: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  cursoAcademico: { id: number; nombre: string };
  _count: { asignaturas: number };
};

type SubjectAdmin = {
  id: number;
  cursoAcademicoId: number;
  grupoId: number | null;
  nombre: string;
  codigo: string | null;
  grupo: string;
  activa: boolean;
  cursoAcademico: { id: number; nombre: string };
  grupoAsignado: Group | null;
  _count: {
    matriculas: number;
    sesiones: number;
    unidades: number;
    actividades: number;
  };
};

function toDateInput(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return response.json() as Promise<T>;
}

export function SubjectsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<SubjectAdmin[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | "">("");
  const [subjectCourseId, setSubjectCourseId] = useState<number | "">("");

  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editingSubject, setEditingSubject] = useState<SubjectAdmin | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadAll(preferredCourseId?: number) {
    setLoading(true);
    setError("");
    try {
      const [coursesResponse, groupsResponse, subjectsResponse] = await Promise.all([
        fetch("/api/courses"),
        fetch("/api/groups"),
        fetch("/api/subjects"),
      ]);

      const [courseData, groupData, subjectData] = await Promise.all([
        readResponse<Course[]>(coursesResponse, "No se pudieron cargar los cursos académicos"),
        readResponse<Group[]>(groupsResponse, "No se pudieron cargar los grupos"),
        readResponse<SubjectAdmin[]>(subjectsResponse, "No se pudieron cargar las asignaturas"),
      ]);

      setCourses(courseData);
      setGroups(groupData);
      setSubjects(subjectData);

      const wanted = preferredCourseId ?? selectedCourseId;
      const nextCourse = wanted !== "" && courseData.some((course) => course.id === wanted)
        ? wanted
        : courseData.find((course) => course.activo)?.id ?? courseData[0]?.id ?? "";
      setSelectedCourseId(nextCourse);
      setSubjectCourseId((current) => current !== "" ? current : nextCourse);
    } catch (err) {
      const text = err instanceof Error ? err.message : "No se pudo cargar la estructura académica";
      setError(text === "Failed to fetch"
        ? "No se puede conectar con la API. Reinicia Tutor UTAMED y comprueba que la base de datos está actualizada."
        : text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const visibleGroups = useMemo(
    () => selectedCourseId === "" ? [] : groups.filter((group) => group.cursoAcademicoId === selectedCourseId),
    [groups, selectedCourseId],
  );

  const visibleSubjects = useMemo(
    () => selectedCourseId === "" ? subjects : subjects.filter((subject) => subject.cursoAcademicoId === selectedCourseId),
    [subjects, selectedCourseId],
  );

  const subjectGroups = useMemo(
    () => subjectCourseId === "" ? [] : groups.filter((group) => group.cursoAcademicoId === subjectCourseId && group.activo),
    [groups, subjectCourseId],
  );

  function resetEditors() {
    setEditingCourse(null);
    setEditingGroup(null);
    setEditingSubject(null);
    setError("");
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      nombre: form.get("nombre"),
      fechaInicio: form.get("fechaInicio"),
      fechaFin: form.get("fechaFin"),
      activo: form.get("activo") === "on",
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(editingCourse ? `/api/courses/${editingCourse.id}` : "/api/courses", {
        method: editingCourse ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = await readResponse<Course>(response, "No se pudo guardar el curso académico");
      const wasEditing = Boolean(editingCourse);
      resetEditors();
      await loadAll(saved.id);
      setSubjectCourseId(saved.id);
      setMessage(wasEditing ? "Curso académico actualizado." : "Curso académico creado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el curso académico");
    } finally {
      setSaving(false);
    }
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedCourseId === "") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      cursoAcademicoId: editingGroup?.cursoAcademicoId ?? selectedCourseId,
      nombre: form.get("nombre"),
      descripcion: form.get("descripcion"),
      activo: form.get("activo") === "on",
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(editingGroup ? `/api/groups/${editingGroup.id}` : "/api/groups", {
        method: editingGroup ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await readResponse<Group>(response, "No se pudo guardar el grupo");
      const wasEditing = Boolean(editingGroup);
      resetEditors();
      await loadAll(Number(selectedCourseId));
      setMessage(wasEditing ? "Grupo actualizado." : "Grupo creado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el grupo");
    } finally {
      setSaving(false);
    }
  }

  async function saveSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      cursoAcademicoId: Number(subjectCourseId),
      grupoId: form.get("grupoId") || null,
      nombre: form.get("nombre"),
      codigo: form.get("codigo"),
      activa: form.get("activa") === "on",
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(editingSubject ? `/api/subjects/${editingSubject.id}` : "/api/subjects", {
        method: editingSubject ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = await readResponse<SubjectAdmin>(response, "No se pudo guardar la asignatura");
      const wasEditing = Boolean(editingSubject);
      resetEditors();
      setSelectedCourseId(saved.cursoAcademicoId);
      setSubjectCourseId(saved.cursoAcademicoId);
      await loadAll(saved.cursoAcademicoId);
      setMessage(wasEditing ? "Asignatura actualizada." : "Asignatura creada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la asignatura");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">ESTRUCTURA ACADÉMICA</p>
          <h2>Asignaturas</h2>
          <p>Configura primero el curso académico, después los grupos si los necesitas y, por último, las asignaturas.</p>
        </div>
      </header>

      {message && <p className="notice-banner success" role="status">{message}</p>}
      {error && <p className="notice-banner error" role="alert">{error}</p>}

      <section className="academic-course-selector panel">
        <div>
          <p className="eyebrow">CURSO DE TRABAJO</p>
          <h3>{selectedCourseId === "" ? "Sin curso académico" : courses.find((course) => course.id === selectedCourseId)?.nombre}</h3>
        </div>
        <label>
          Curso académico
          <select value={selectedCourseId} onChange={(event) => {
            const value = event.target.value ? Number(event.target.value) : "";
            setSelectedCourseId(value);
            setSubjectCourseId(value);
            resetEditors();
          }}>
            {courses.length === 0 && <option value="">No hay cursos</option>}
            {courses.map((course) => <option key={course.id} value={course.id}>{course.nombre}{course.activo ? " · activo" : ""}</option>)}
          </select>
        </label>
      </section>

      <section className="academic-management-grid">
        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">1 · CURSO ACADÉMICO</p><h3>{editingCourse ? "Editar curso" : "Nuevo curso"}</h3></div>
          </div>
          <form className="form-stack" onSubmit={saveCourse} key={editingCourse?.id ?? "new-course"}>
            <label>Nombre<input name="nombre" required defaultValue={editingCourse?.nombre ?? ""} placeholder="Ej. 2026/2027" /></label>
            <div className="form-row">
              <label>Inicio<input name="fechaInicio" type="date" required defaultValue={editingCourse ? toDateInput(editingCourse.fechaInicio) : ""} /></label>
              <label>Fin<input name="fechaFin" type="date" required defaultValue={editingCourse ? toDateInput(editingCourse.fechaFin) : ""} /></label>
            </div>
            <label className="inline-check"><input name="activo" type="checkbox" defaultChecked={editingCourse?.activo ?? true} /><span>Curso activo</span></label>
            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editingCourse ? "Guardar curso" : "Crear curso"}</button>
              {editingCourse && <button className="secondary" type="button" onClick={resetEditors}>Cancelar</button>}
            </div>
          </form>
          <div className="academic-mini-list">
            {courses.map((course) => (
              <button className={course.id === selectedCourseId ? "academic-list-row selected" : "academic-list-row"} type="button" key={course.id} onClick={() => { setSelectedCourseId(course.id); setSubjectCourseId(course.id); setEditingCourse(course); setEditingGroup(null); setEditingSubject(null); }}>
                <span><strong>{course.nombre}</strong><small>{toDateInput(course.fechaInicio)} → {toDateInput(course.fechaFin)}</small></span>
                <span>{course._count.grupos} grupos · {course._count.asignaturas} asignaturas</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">2 · GRUPOS</p><h3>{editingGroup ? "Editar grupo" : "Nuevo grupo"}</h3></div>
          </div>
          {selectedCourseId === "" ? (
            <div className="empty-state compact-empty"><strong>Crea primero un curso académico.</strong></div>
          ) : (
            <>
              <form className="form-stack" onSubmit={saveGroup} key={editingGroup?.id ?? `new-group-${selectedCourseId}`}>
                <label>Nombre<input name="nombre" required defaultValue={editingGroup?.nombre ?? ""} placeholder="Ej. 1º DAM" /></label>
                <label>Descripción<textarea name="descripcion" rows={2} defaultValue={editingGroup?.descripcion ?? ""} placeholder="Opcional" /></label>
                <label className="inline-check"><input name="activo" type="checkbox" defaultChecked={editingGroup?.activo ?? true} /><span>Grupo activo</span></label>
                <div className="form-actions">
                  <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editingGroup ? "Guardar grupo" : "Crear grupo"}</button>
                  {editingGroup && <button className="secondary" type="button" onClick={resetEditors}>Cancelar</button>}
                </div>
              </form>
              <div className="academic-mini-list">
                {visibleGroups.length === 0 ? <p className="muted">No hay grupos. Es opcional: puedes crear asignaturas sin grupo.</p> : visibleGroups.map((group) => (
                  <button className="academic-list-row" type="button" key={group.id} onClick={() => { setEditingGroup(group); setEditingCourse(null); setEditingSubject(null); }}>
                    <span><strong>{group.nombre}</strong><small>{group.descripcion || "Sin descripción"}</small></span>
                    <span>{group._count.asignaturas} asignaturas</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </article>
      </section>

      <section className="panel academic-subjects-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">3 · ASIGNATURAS</p><h3>{editingSubject ? "Editar asignatura" : "Nueva asignatura"}</h3></div>
          <span className="section-count">{visibleSubjects.length}</span>
        </div>

        {courses.length === 0 ? (
          <div className="empty-state compact-empty"><strong>No puedes crear asignaturas todavía.</strong><p>Crea primero el curso académico.</p></div>
        ) : (
          <div className="academic-subject-layout">
            <form className="form-stack" onSubmit={saveSubject} key={editingSubject?.id ?? `new-subject-${subjectCourseId}`}>
              <label>
                Curso académico
                <select value={subjectCourseId} onChange={(event) => setSubjectCourseId(event.target.value ? Number(event.target.value) : "")} required>
                  <option value="" disabled>Selecciona un curso</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.nombre}</option>)}
                </select>
              </label>
              <label>
                Grupo
                <select name="grupoId" defaultValue={editingSubject?.grupoId ?? ""}>
                  <option value="">Sin grupo</option>
                  {subjectGroups.map((group) => <option key={group.id} value={group.id}>{group.nombre}</option>)}
                </select>
                <small className="muted">El grupo es opcional. Se crea y gestiona en el bloque anterior.</small>
              </label>
              <label>Nombre<input name="nombre" required defaultValue={editingSubject?.nombre ?? ""} placeholder="Ej. Programación" /></label>
              <label>Código<input name="codigo" defaultValue={editingSubject?.codigo ?? ""} placeholder="Opcional" /></label>
              <label className="inline-check"><input name="activa" type="checkbox" defaultChecked={editingSubject?.activa ?? true} /><span>Asignatura activa</span></label>
              <div className="form-actions">
                <button className="primary" type="submit" disabled={saving || subjectCourseId === ""}>{saving ? "Guardando…" : editingSubject ? "Guardar asignatura" : "Crear asignatura"}</button>
                {editingSubject && <button className="secondary" type="button" onClick={resetEditors}>Cancelar</button>}
              </div>
            </form>

            <div className="subject-admin-list">
              {loading ? <p className="muted">Cargando…</p> : visibleSubjects.length === 0 ? (
                <div className="empty-state compact-empty"><strong>No hay asignaturas en este curso.</strong></div>
              ) : visibleSubjects.map((subject) => (
                <article className="subject-admin-card" key={subject.id}>
                  <div className="subject-select">
                    <div className="subject-card-title">
                      <strong>{subject.nombre}</strong>
                      <span className={subject.activa ? "status-pill ok" : "status-pill muted-status"}>{subject.activa ? "Activa" : "Inactiva"}</span>
                    </div>
                    <small>{subject.codigo || "Sin código"} · {subject.grupoAsignado?.nombre || "Sin grupo"} · {subject.cursoAcademico.nombre}</small>
                    <div className="subject-card-stats">
                      <span><strong>{subject._count.matriculas}</strong> alumnos</span>
                      <span><strong>{subject._count.unidades}</strong> unidades</span>
                      <span><strong>{subject._count.sesiones}</strong> sesiones</span>
                      <span><strong>{subject._count.actividades}</strong> actividades</span>
                    </div>
                  </div>
                  <button className="secondary compact-button" type="button" onClick={() => { setEditingSubject(subject); setSubjectCourseId(subject.cursoAcademicoId); setEditingCourse(null); setEditingGroup(null); }}>
                    Editar
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
