import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Subject } from "../types";

type SubjectOption = Subject & { activa?: boolean };

type Student = {
  id: number;
  nombre: string;
  apellidos: string;
  email: string | null;
  identificadorExterno?: string | null;
  notasGenerales?: string | null;
  activo?: boolean;
  matriculas: Array<{ id: number; asignatura: SubjectOption }>;
};

export function StudentsPage({ onOpenStudent }: { onOpenStudent: (id: number) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ACTIVE");
  const formPanelRef = useRef<HTMLElement | null>(null);

  async function load() {
    setError("");
    try {
      const [studentsResponse, subjectsResponse] = await Promise.all([
        fetch("/api/students"),
        fetch("/api/subjects"),
      ]);
      if (!studentsResponse.ok || !subjectsResponse.ok) throw new Error("No se pudieron cargar los alumnos");
      setStudents(await studentsResponse.json());
      setSubjects(await subjectsResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar alumnos");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return students.filter((student) => {
      const active = student.activo !== false;
      if (statusFilter === "ACTIVE" && !active) return false;
      if (statusFilter === "INACTIVE" && active) return false;
      if (subjectFilter !== "" && !student.matriculas.some((enrollment) => enrollment.asignatura.id === subjectFilter)) return false;
      if (!query) return true;
      const haystack = [student.nombre, student.apellidos, student.email ?? "", student.identificadorExterno ?? "", ...student.matriculas.map((item) => item.asignatura.nombre)]
        .join(" ")
        .toLocaleLowerCase("es");
      return haystack.includes(query);
    });
  }, [students, search, subjectFilter, statusFilter]);

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const subjectIds = data.getAll("asignaturas").map(Number);

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        nombre: data.get("nombre"),
        apellidos: data.get("apellidos"),
        email: data.get("email"),
        identificadorExterno: data.get("identificadorExterno"),
        notasGenerales: data.get("notasGenerales"),
        activo: data.get("activo") === "on",
        asignaturaIds: subjectIds,
      };

      const response = await fetch(editing ? `/api/students/${editing.id}` : "/api/students", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? (editing ? "No se pudo actualizar el alumno" : "No se pudo crear el alumno"));
      }

      const wasEditing = Boolean(editing);
      formElement.reset();
      setEditing(null);
      setMessage(wasEditing ? "Alumno actualizado correctamente." : "Alumno creado correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el alumno");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(student: Student) {
    setEditing(student);
    setError("");
    setMessage("");
    requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function cancelEdit(form?: HTMLFormElement | null) {
    setEditing(null);
    form?.reset();
    setError("");
    setMessage("");
  }

  const activeSubjects = subjects.filter((subject) => subject.activa !== false);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">SEGUIMIENTO</p>
          <h2>Alumnos</h2>
          <p>Alta, edición de datos y matrícula en tus asignaturas.</p>
        </div>
      </header>

      <section className="content-grid students-grid">
        <article className="panel" ref={formPanelRef}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editing ? "EDITANDO" : "NUEVO"}</p>
              <h3>{editing ? `${editing.apellidos}, ${editing.nombre}` : "Alta de alumno"}</h3>
            </div>
          </div>
          <form className="form-stack" onSubmit={saveStudent} key={editing?.id ?? "new"}>
            <div className="form-row">
              <label>
                Nombre
                <input name="nombre" required defaultValue={editing?.nombre ?? ""} autoComplete="off" />
              </label>
              <label>
                Apellidos
                <input name="apellidos" required defaultValue={editing?.apellidos ?? ""} autoComplete="off" />
              </label>
            </div>
            <div className="form-row">
              <label>
                Correo
                <input name="email" type="email" placeholder="Opcional" defaultValue={editing?.email ?? ""} />
              </label>
              <label>
                Identificador externo
                <input name="identificadorExterno" placeholder="Opcional" defaultValue={editing?.identificadorExterno ?? ""} />
              </label>
            </div>
            <label>
              Notas generales
              <textarea name="notasGenerales" rows={4} placeholder="Información general que quieras conservar sobre el alumno" defaultValue={editing?.notasGenerales ?? ""} />
            </label>
            <fieldset className="subject-checks">
              <legend>Asignaturas</legend>
              {activeSubjects.length === 0 ? <p className="muted">No hay asignaturas activas.</p> : activeSubjects.map((subject) => {
                const checked = editing?.matriculas.some((enrollment) => enrollment.asignatura.id === subject.id) ?? false;
                return (
                  <label key={subject.id}>
                    <input type="checkbox" name="asignaturas" value={subject.id} defaultChecked={checked} />
                    <span>{subject.nombre}</span>
                  </label>
                );
              })}
            </fieldset>
            {editing && (
              <label className="inline-check">
                <input type="checkbox" name="activo" defaultChecked={editing.activo !== false} />
                Alumno activo
              </label>
            )}
            {!editing && <input type="hidden" name="activo" value="on" />}
            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar alumno"}
              </button>
              {editing && (
                <button className="secondary" type="button" onClick={(event) => cancelEdit(event.currentTarget.form)}>
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
            <div><p className="eyebrow">REGISTRADOS</p><h3>{visibleStudents.length} de {students.length} alumnos</h3></div>
          </div>

          <div className="list-toolbar" aria-label="Filtrar alumnos">
            <label className="search-field">
              <span>Buscar</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, correo, identificador o asignatura" />
            </label>
            <label>
              Asignatura
              <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value ? Number(event.target.value) : "")}>
                <option value="">Todas</option>
                {activeSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.nombre}</option>)}
              </select>
            </label>
            <label>
              Estado
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="ACTIVE">Activos</option>
                <option value="ALL">Todos</option>
                <option value="INACTIVE">Inactivos</option>
              </select>
            </label>
          </div>

          {students.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay alumnos todavía</strong><p>Crea el primero para poder probar una sesión.</p></div>
          ) : visibleStudents.length === 0 ? (
            <div className="empty-state compact-empty"><strong>No hay alumnos que coincidan con los filtros.</strong><p>Prueba con otro término o elimina algún filtro.</p></div>
          ) : (
            <div className="student-list">
              {visibleStudents.map((student) => (
                <article className={`student-row ${student.activo === false ? "is-inactive" : ""}`} key={student.id}>
                  <div className="student-main-data">
                    <div className="entity-title-line">
                      <strong>{student.apellidos}, {student.nombre}</strong>
                      {student.activo === false && <span className="status-pill muted-status">Inactivo</span>}
                    </div>
                    <small>{student.email || "Sin correo"}</small>
                    {student.identificadorExterno && <small>ID: {student.identificadorExterno}</small>}
                    <div className="subject-tags">
                      {student.matriculas.length === 0 ? <span className="tag muted-tag">Sin matrícula</span> : student.matriculas.map((enrollment) => (
                        <span className="tag" key={enrollment.id}>{enrollment.asignatura.nombre}</span>
                      ))}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button className="primary compact-button" type="button" onClick={() => onOpenStudent(student.id)}>
                      Ver ficha
                    </button>
                    <button className="secondary compact-button" type="button" onClick={() => startEditing(student)}>
                      Editar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
