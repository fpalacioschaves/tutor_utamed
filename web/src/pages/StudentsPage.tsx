import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Subject } from "../types";

type SubjectOption = Subject & { activa?: boolean };

type GroupOption = {
  id: number;
  cursoAcademicoId: number;
  nombre: string;
  activo: boolean;
  cursoAcademico: { id: number; nombre: string };
};

type DatabaseStatus = {
  path: string;
  counts: { alumnos: number | null; matriculas: number | null; grupos: number | null } | null;
  candidates: Array<{
    path: string;
    counts: { alumnos: number | null; matriculas: number | null; grupos: number | null } | null;
  }>;
};

type Student = {
  id: number;
  nombre: string;
  apellidos: string;
  email: string | null;
  identificadorExterno?: string | null;
  notasGenerales?: string | null;
  grupoId: number | null;
  grupo: GroupOption | null;
  activo?: boolean;
  matriculas: Array<{ id: number; asignatura: SubjectOption }>;
};

export function StudentsPage({ onOpenStudent }: { onOpenStudent: (id: number) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingGroups, setCreatingGroups] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<number | "">("");
  const [groupFilter, setGroupFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ACTIVE");
  const formPanelRef = useRef<HTMLElement | null>(null);

  async function load() {
    setError("");
    try {
      const [studentsResponse, subjectsResponse, groupsResponse, statusResponse] = await Promise.all([
        fetch("/api/students", { cache: "no-store" }),
        fetch("/api/subjects", { cache: "no-store" }),
        fetch("/api/groups", { cache: "no-store" }),
        fetch("/api/database/status", { cache: "no-store" }),
      ]);
      if (!studentsResponse.ok || !subjectsResponse.ok || !groupsResponse.ok) {
        const failedResponse = [studentsResponse, subjectsResponse, groupsResponse]
          .find((response) => !response.ok)!;
        const body = await failedResponse.json().catch(() => ({}));
        throw new Error(body.error ?? `Error HTTP ${failedResponse.status} al cargar los alumnos o grupos`);
      }
      setStudents(await studentsResponse.json());
      setSubjects(await subjectsResponse.json());
      setGroups(await groupsResponse.json());
      setDatabaseStatus(statusResponse.ok ? await statusResponse.json() : null);
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
      if (groupFilter !== "" && student.grupoId !== groupFilter) return false;
      if (!query) return true;
      const haystack = [student.nombre, student.apellidos, student.email ?? "", student.identificadorExterno ?? "", ...student.matriculas.map((item) => item.asignatura.nombre)]
        .join(" ")
        .toLocaleLowerCase("es");
      return haystack.includes(query);
    });
  }, [students, search, subjectFilter, groupFilter, statusFilter]);

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
        grupoId: data.get("grupoId") || null,
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
  const selectableGroups = groups.filter((group) => group.activo || group.id === editing?.grupoId);
  const missingDefaultGroups = ["DAM", "DAW"].filter((name) =>
    !groups.some((group) => group.nombre.toUpperCase() === name && group.cursoAcademico.nombre === "2026/2027"),
  );

  async function ensureDefaultGroups() {
    setCreatingGroups(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/groups/ensure-dam-daw", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudieron preparar los grupos DAM y DAW");
      await load();
      setMessage("Grupos DAM y DAW disponibles. Selecciona el grupo de cada alumno.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron preparar los grupos");
    } finally {
      setCreatingGroups(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">SEGUIMIENTO</p>
          <h2>Alumnos</h2>
          <p>Alta, edición de datos y matrícula en tus asignaturas.</p>
        </div>
      </header>

      {databaseStatus?.counts?.alumnos === 0 && (
        <div className="notice-banner warning" role="alert">
          <strong>La base SQLite que está utilizando esta instalación contiene 0 alumnos.</strong>
          <p>Archivo utilizado: <code>{databaseStatus.path}</code></p>
          {databaseStatus.candidates.length > 0 ? (
            <>
              <p>Archivos locales encontrados (consulta de solo lectura; no se ha restaurado ninguno):</p>
              {databaseStatus.candidates.map((candidate) => (
                <p key={candidate.path}><code>{candidate.path}</code> · {candidate.counts?.alumnos ?? "?"} alumnos</p>
              ))}
            </>
          ) : <p>No se han encontrado copias dentro de esta instalación. Esto no descarta otras carpetas de Tutor UTAMED.</p>}
          <p>No ejecutes «Restaurar» ni sustituyas archivos sin verificar primero que la copia contiene tus datos.</p>
        </div>
      )}

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
            {missingDefaultGroups.length > 0 && (
              <div className="notice-banner warning" role="status">
                No están disponibles todos los grupos DAM y DAW del curso 2026/2027 en la base actual.
                <button className="secondary compact-button" type="button"
                  disabled={creatingGroups} onClick={() => void ensureDefaultGroups()}>
                  {creatingGroups ? "Preparando grupos…" : "Crear grupos DAM y DAW"}
                </button>
                <small>Esta acción únicamente crea los grupos ausentes; no modifica alumnos ni matrículas.</small>
              </div>
            )}
            <label>
              Grupo académico
              <select name="grupoId" defaultValue={editing?.grupoId ?? ""} required={selectableGroups.length > 0}>
                <option value="">Sin asignar</option>
                {selectableGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.nombre} · {group.cursoAcademico.nombre}</option>
                ))}
              </select>
            </label>
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
              <button className="primary" type="submit" disabled={saving || selectableGroups.length === 0}>
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

          <div className="list-toolbar students-filter-toolbar" aria-label="Filtrar alumnos">
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
              Grupo
              <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value ? Number(event.target.value) : "")}>
                <option value="">Todos</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.nombre} · {group.cursoAcademico.nombre}</option>)}
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
                      <span className="tag">{student.grupo?.nombre ?? "Sin grupo"}</span>
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
