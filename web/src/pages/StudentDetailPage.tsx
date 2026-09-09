import { useEffect, useMemo, useState } from "react";
import type { AiAnalysisMode, AiAnalysisResponse, AttendanceState, StudentDetailResponse } from "../types";

type Props = {
  studentId: number;
  onBack: () => void;
};

const attendanceLabels: Record<AttendanceState, string> = {
  PRESENTE: "Presente",
  AUSENTE: "Ausencia no justificada",
  RETRASO: "Retraso",
  SALIDA_ANTICIPADA: "Salida anticipada",
  AUSENCIA_JUSTIFICADA: "Ausencia justificada",
};

const deliveryLabels: Record<string, string> = {
  PENDIENTE: "Pendiente",
  ENTREGADA: "Entregada",
  CORREGIDA: "Corregida",
  NO_ENTREGADA: "No entregada",
  RETRASADA: "Retrasada",
};

const tutorialLabels: Record<string, string> = {
  SOLICITADA: "Solicitada",
  PROGRAMADA: "Programada",
  REALIZADA: "Realizada",
  CANCELADA: "Cancelada",
  NO_PRESENTADO: "No presentado",
};

const followUpLabels: Record<string, string> = {
  PENDIENTE: "Pendiente",
  REALIZADO: "Realizado",
  CANCELADO: "Cancelado",
};

const incidentLabels: Record<string, string> = {
  ABIERTA: "Abierta",
  EN_SEGUIMIENTO: "En seguimiento",
  RESUELTA: "Resuelta",
};

function timelineStateLabel(tipo: string, estado: string | null) {
  if (!estado) return null;
  if (tipo === "SESION") return attendanceLabels[estado as AttendanceState] ?? estado;
  if (tipo === "ACTIVIDAD") return deliveryLabels[estado] ?? estado;
  if (tipo === "TUTORIA_INDIVIDUAL") return tutorialLabels[estado] ?? estado;
  if (tipo === "SEGUIMIENTO") return followUpLabels[estado] ?? estado;
  if (tipo === "INCIDENCIA") return incidentLabels[estado] ?? estado;
  return estado;
}


type TimelineFilter =
  | "TODO"
  | "SESION"
  | "ACTIVIDAD"
  | "TUTORIA_INDIVIDUAL"
  | "SEGUIMIENTO"
  | "INCIDENCIA"
  | "COMUNICACION";

const timelineTabs: Array<{ value: TimelineFilter; label: string }> = [
  { value: "TODO", label: "Todo" },
  { value: "SESION", label: "Clases / asistencia" },
  { value: "ACTIVIDAD", label: "Actividades" },
  { value: "TUTORIA_INDIVIDUAL", label: "Tutorías" },
  { value: "SEGUIMIENTO", label: "Seguimientos" },
  { value: "INCIDENCIA", label: "Incidencias" },
  { value: "COMUNICACION", label: "Comunicaciones" },
];

const timelineTypeLabels: Record<string, string> = {
  SESION: "Clase / asistencia",
  ACTIVIDAD: "Actividad",
  TUTORIA_INDIVIDUAL: "Tutoría individual",
  SEGUIMIENTO: "Seguimiento",
  INCIDENCIA: "Incidencia",
  COMUNICACION: "Comunicación",
};

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function dateOnly(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state compact-empty"><strong>{text}</strong></div>;
}

function attendanceMetric(count: number, percentage: number | null) {
  return percentage == null ? String(count) : `${count} (${percentage}%)`;
}

export function StudentDetailPage({ studentId, onBack }: Props) {
  const [data, setData] = useState<StudentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("TODO");
  const [aiResult, setAiResult] = useState<AiAnalysisResponse | null>(null);
  const [aiLoading, setAiLoading] = useState<AiAnalysisMode | null>(null);
  const [aiError, setAiError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/students/${studentId}/detail`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo cargar la ficha del alumno");
      }
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la ficha del alumno");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setAiResult(null);
    setAiError("");
    void load();
  }, [studentId]);

  async function runAi(mode: AiAnalysisMode) {
    setAiLoading(mode);
    setAiError("");
    try {
      const response = await fetch(`/api/ai/students/${studentId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo generar el análisis con IA");
      setAiResult(body);
      window.setTimeout(() => document.getElementById("ia")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "No se pudo generar el análisis con IA");
    } finally {
      setAiLoading(null);
    }
  }

  const activityStats = useMemo(() => {
    if (!data) return { total: 0, completed: 0, average: null as number | null };
    const completed = data.actividades.filter((activity) => activity.entrega && ["ENTREGADA", "CORREGIDA", "RETRASADA"].includes(activity.entrega.estado)).length;
    const grades = data.actividades
      .map((activity) => activity.entrega?.calificacion)
      .filter((grade): grade is number => typeof grade === "number");
    return {
      total: data.actividades.length,
      completed,
      average: grades.length ? Math.round((grades.reduce((sum, grade) => sum + grade, 0) / grades.length) * 100) / 100 : null,
    };
  }, [data]);


  const timelineCounts = useMemo(() => {
    const counts: Record<TimelineFilter, number> = {
      TODO: 0,
      SESION: 0,
      ACTIVIDAD: 0,
      TUTORIA_INDIVIDUAL: 0,
      SEGUIMIENTO: 0,
      INCIDENCIA: 0,
      COMUNICACION: 0,
    };
    if (!data) return counts;
    counts.TODO = data.cronologia.length;
    for (const item of data.cronologia) {
      if (item.tipo in counts && item.tipo !== "TODO") {
        counts[item.tipo as Exclude<TimelineFilter, "TODO">] += 1;
      }
    }
    return counts;
  }, [data]);

  const filteredTimeline = useMemo(() => {
    if (!data) return [];
    if (timelineFilter === "TODO") return data.cronologia;
    return data.cronologia.filter((item) => item.tipo === timelineFilter);
  }, [data, timelineFilter]);

  if (loading) return <p className="muted">Cargando ficha del alumno…</p>;
  if (!data) return <div className="panel"><p>{error || "Alumno no encontrado"}</p><button className="secondary" onClick={onBack}>Volver</button></div>;

  const { alumno } = data;
  const pendingFollowUps = data.seguimientos.filter((item) => item.estado === "PENDIENTE").length;
  const observations = data.asistencia.registros.filter((record) => record.observacion?.trim());

  return (
    <>
      <header className="page-header student-detail-header">
        <div>
          <button className="back-button" type="button" onClick={onBack}>← Alumnos</button>
          <p className="eyebrow">FICHA COMPLETA DEL ALUMNO</p>
          <h2>{alumno.nombre} {alumno.apellidos}</h2>
          <p>{alumno.email || "Sin correo registrado"}</p>
        </div>
        <div className="subject-tags student-detail-subjects">
          {alumno.matriculas.filter((item) => item.activa).map((enrollment) => (
            <span className="tag" key={enrollment.id}>{enrollment.asignatura.nombre}</span>
          ))}
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}

      <nav className="student-section-nav" aria-label="Secciones de la ficha del alumno">
        <a href="#resumen">Resumen</a>
        <a href="#ia">IA</a>
        <a href="#matriculas">Matrícula</a>
        <a href="#asistencia">Asistencia</a>
        <a href="#observaciones">Observaciones</a>
        <a href="#actividades">Actividades</a>
        <a href="#tutorias">Tutorías</a>
        <a href="#seguimientos">Seguimientos</a>
        <a href="#incidencias">Incidencias</a>
        <a href="#comunicaciones">Comunicaciones</a>
        <a href="#cronologia">Cronología</a>
      </nav>

      <section className="student-summary-grid" id="resumen">
        <article className="panel student-identity-card">
          <p className="eyebrow">DATOS</p>
          <dl className="detail-list">
            <div><dt>Nombre</dt><dd>{alumno.nombre}</dd></div>
            <div><dt>Apellidos</dt><dd>{alumno.apellidos}</dd></div>
            <div><dt>Correo</dt><dd>{alumno.email || "—"}</dd></div>
            <div><dt>Identificador externo</dt><dd>{alumno.identificadorExterno || "—"}</dd></div>
            <div><dt>Estado</dt><dd>{alumno.activo ? "Activo" : "Inactivo"}</dd></div>
          </dl>
          <div className="general-notes">
            <strong>Notas generales</strong>
            <p>{alumno.notasGenerales || "Sin notas generales."}</p>
          </div>
        </article>

        <div className="student-kpi-grid">
          <article className="mini-stat"><span>Sesiones registradas</span><strong>{data.asistencia.global.registrados}</strong><small>{data.asistencia.global.PRESENTE} presentes · {data.asistencia.global.AUSENTE} no justificadas · {data.asistencia.global.AUSENCIA_JUSTIFICADA} justificadas</small></article>
          <article className="mini-stat"><span>Actividades</span><strong>{activityStats.completed}/{activityStats.total}</strong><small>entregadas o resueltas</small></article>
          <article className="mini-stat"><span>Nota media</span><strong>{activityStats.average ?? "—"}</strong><small>sólo actividades calificadas</small></article>
          <article className="mini-stat"><span>Tutorías</span><strong>{data.tutorias.length}</strong><small>individuales registradas</small></article>
          <article className="mini-stat"><span>Seguimientos</span><strong>{pendingFollowUps}</strong><small>pendientes</small></article>
          <article className="mini-stat"><span>Incidencias</span><strong>{data.incidencias.filter((item) => item.estado !== "RESUELTA").length}</strong><small>abiertas o en seguimiento</small></article>
        </div>
      </section>

      <section className="student-section ai-student-section" id="ia">
        <div className="section-title">
          <div><p className="eyebrow">INTELIGENCIA ARTIFICIAL LOCAL</p><h3>Asistente sobre este alumno</h3></div>
          <span className="status-pill">Ollama local</span>
        </div>
        <p className="muted">La IA recibe únicamente los datos que ya existen en esta ficha. No puede acceder a Internet ni a información externa sobre el alumno.</p>
        <div className="ai-action-grid">
          <button type="button" disabled={aiLoading !== null} onClick={() => void runAi("SUMMARY")}>
            {aiLoading === "SUMMARY" ? "Generando resumen…" : "Resumen académico"}
          </button>
          <button type="button" className="secondary" disabled={aiLoading !== null} onClick={() => void runAi("TUTORIAL")}>
            {aiLoading === "TUTORIAL" ? "Preparando tutoría…" : "Preparar tutoría"}
          </button>
          <button type="button" className="secondary" disabled={aiLoading !== null} onClick={() => void runAi("EVOLUTION")}>
            {aiLoading === "EVOLUTION" ? "Analizando evolución…" : "Analizar evolución"}
          </button>
        </div>

        {aiError && <p className="form-error">{aiError}</p>}

        {aiResult && (
          <article className="ai-result-card">
            <div className="data-card-title">
              <strong>{aiResult.mode === "SUMMARY" ? "Resumen académico" : aiResult.mode === "TUTORIAL" ? "Preparación de tutoría" : "Análisis de evolución"}</strong>
              <span className="status-pill">{aiResult.model}</span>
            </div>
            <div className="ai-result-text">{aiResult.content}</div>
            <div className="ai-data-used">
              <strong>Datos utilizados</strong>
              <div className="subject-tags">
                <span className="tag">{aiResult.dataUsed.sesiones} sesiones</span>
                <span className="tag">{aiResult.dataUsed.observacionesClase} observaciones</span>
                <span className="tag">{aiResult.dataUsed.actividades} actividades</span>
                <span className="tag">{aiResult.dataUsed.actividadesCalificadas} calificadas</span>
                <span className="tag">{aiResult.dataUsed.tutorias} tutorías</span>
                <span className="tag">{aiResult.dataUsed.seguimientos} seguimientos</span>
                <span className="tag">{aiResult.dataUsed.incidencias} incidencias</span>
                <span className="tag">{aiResult.dataUsed.comunicaciones} comunicaciones</span>
              </div>
              {aiResult.dataUsed.truncado && <p className="muted">El expediente es muy extenso; se han enviado al modelo los registros más recientes de cada categoría.</p>}
            </div>
          </article>
        )}
      </section>

      <section className="student-section" id="matriculas">
        <div className="section-title"><div><p className="eyebrow">MATRÍCULA</p><h3>Asignaturas</h3></div></div>
        {alumno.matriculas.length === 0 ? <Empty text="No hay matrículas registradas." /> : (
          <div className="data-cards">
            {alumno.matriculas.map((enrollment) => (
              <article className="data-card" key={enrollment.id}>
                <div className="data-card-title"><strong>{enrollment.asignatura.nombre}</strong><span className={enrollment.activa ? "status-pill ok" : "status-pill muted-status"}>{enrollment.activa ? "Activa" : "Baja"}</span></div>
                <p>Curso: {enrollment.asignatura.cursoAcademico.nombre}</p>
                <p>Alta: {dateOnly(enrollment.fechaAlta)}{enrollment.fechaBaja ? ` · Baja: ${dateOnly(enrollment.fechaBaja)}` : ""}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="student-section" id="asistencia">
        <div className="section-title"><div><p className="eyebrow">ASISTENCIA</p><h3>Resumen por asignatura</h3></div></div>
        {data.asistencia.porAsignatura.length === 0 ? <Empty text="No hay asignaturas para calcular la asistencia." /> : (
          <div className="attendance-summary-grid">
            {data.asistencia.porAsignatura.map(({ asignatura, matriculaActiva, resumen }) => (
              <article className={`attendance-subject-card ${matriculaActiva ? "" : "is-inactive"}`} key={asignatura.id}>
                <div><strong>{asignatura.nombre}{matriculaActiva ? "" : " · histórica"}</strong><span>{resumen.registrados} registros</span></div>
                <dl>
                  <div><dt>Presente</dt><dd>{attendanceMetric(resumen.PRESENTE, resumen.porcentajes.PRESENTE)}</dd></div>
                  <div><dt>Ausencia no justificada</dt><dd>{attendanceMetric(resumen.AUSENTE, resumen.porcentajes.AUSENTE)}</dd></div>
                  <div><dt>Retraso</dt><dd>{attendanceMetric(resumen.RETRASO, resumen.porcentajes.RETRASO)}</dd></div>
                  <div><dt>Salida anticipada</dt><dd>{attendanceMetric(resumen.SALIDA_ANTICIPADA, resumen.porcentajes.SALIDA_ANTICIPADA)}</dd></div>
                  <div><dt>Ausencia justificada</dt><dd>{attendanceMetric(resumen.AUSENCIA_JUSTIFICADA, resumen.porcentajes.AUSENCIA_JUSTIFICADA)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}

        <div className="section-subtitle"><h4>Histórico de asistencia</h4></div>
        {data.asistencia.registros.length === 0 ? <Empty text="Todavía no hay asistencia registrada." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Asignatura</th><th>Sesión</th><th>Asistencia</th><th>Observación</th></tr></thead>
              <tbody>
                {data.asistencia.registros.map((record) => (
                  <tr key={record.id}>
                    <td>{dateTime(record.sesion.inicio)}</td>
                    <td>{record.sesion.asignatura.nombre}</td>
                    <td>{record.sesion.tipo === "TUTORIA_GRUPAL" ? "Tutoría grupal" : "Clase"}{record.sesion.tema ? ` · ${record.sesion.tema}` : ""}</td>
                    <td>{record.estadoAsistencia ? attendanceLabels[record.estadoAsistencia] : "Sin registrar"}</td>
                    <td className="long-cell">{record.observacion || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="student-section" id="observaciones">
        <div className="section-title"><div><p className="eyebrow">CLASES</p><h3>Todas las observaciones</h3></div><span className="section-count">{observations.length}</span></div>
        {observations.length === 0 ? <Empty text="No hay observaciones de clase registradas." /> : (
          <div className="timeline-list observations-list">
            {observations.map((record) => (
              <article className="timeline-item" key={record.id}>
                <div className="timeline-date">{dateTime(record.sesion.inicio)}</div>
                <div className="timeline-body"><div className="timeline-heading"><strong>{record.sesion.asignatura.nombre}</strong><span>{record.estadoAsistencia ? attendanceLabels[record.estadoAsistencia] : "Sin asistencia"}</span></div><p>{record.observacion}</p></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="student-section" id="actividades">
        <div className="section-title"><div><p className="eyebrow">TRABAJO ACADÉMICO</p><h3>Actividades y calificaciones</h3></div><span className="section-count">{data.actividades.length}</span></div>
        {data.actividades.length === 0 ? <Empty text="No hay actividades registradas en sus asignaturas." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Actividad</th><th>Asignatura</th><th>Fecha límite</th><th>Estado</th><th>Entrega</th><th>Nota</th><th>Observación</th></tr></thead>
              <tbody>
                {data.actividades.map((activity) => (
                  <tr key={activity.id}>
                    <td><strong>{activity.titulo}</strong>{activity.unidad && <small className="block-note">{activity.unidad.titulo}</small>}</td>
                    <td>{activity.asignatura.nombre}</td>
                    <td>{dateOnly(activity.fechaLimite)}</td>
                    <td>{activity.entrega ? deliveryLabels[activity.entrega.estado] : "Pendiente"}</td>
                    <td>{dateTime(activity.entrega?.fechaEntrega ?? null)}</td>
                    <td className="grade-cell">{activity.entrega?.calificacion ?? "—"}</td>
                    <td className="long-cell">{activity.entrega?.observacion || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="student-section" id="tutorias">
        <div className="section-title"><div><p className="eyebrow">ACOMPAÑAMIENTO</p><h3>Tutorías individuales</h3></div><span className="section-count">{data.tutorias.length}</span></div>
        {data.tutorias.length === 0 ? <Empty text="No hay tutorías individuales registradas." /> : (
          <div className="data-cards">
            {data.tutorias.map((tutorial) => (
              <article className="data-card" key={tutorial.id}>
                <div className="data-card-title"><strong>{tutorial.motivo || "Tutoría individual"}</strong><span className="status-pill">{tutorialLabels[tutorial.estado] ?? tutorial.estado}</span></div>
                <p><b>Asignatura:</b> {tutorial.asignatura?.nombre || "General"}</p>
                <p><b>Solicitada:</b> {dateTime(tutorial.fechaSolicitud)} · <b>Programada:</b> {dateTime(tutorial.inicio)}</p>
                {tutorial.observaciones && <p><b>Observaciones:</b> {tutorial.observaciones}</p>}
                {tutorial.acuerdos && <p><b>Acuerdos:</b> {tutorial.acuerdos}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="student-section" id="seguimientos">
        <div className="section-title"><div><p className="eyebrow">PENDIENTES</p><h3>Seguimientos</h3></div><span className="section-count">{data.seguimientos.length}</span></div>
        {data.seguimientos.length === 0 ? <Empty text="No hay seguimientos registrados." /> : (
          <div className="data-cards">
            {data.seguimientos.map((item) => {
              const overdue = item.estado === "PENDIENTE" && new Date(item.fechaObjetivo).getTime() < Date.now();
              return (
                <article className="data-card" key={item.id}>
                  <div className="data-card-title"><strong>{item.descripcion}</strong><span className={`status-pill ${overdue ? "danger" : ""}`}>{overdue ? "Vencido" : (followUpLabels[item.estado] ?? item.estado)}</span></div>
                  <p><b>Fecha objetivo:</b> {dateTime(item.fechaObjetivo)}</p>
                  <p><b>Asignatura:</b> {item.asignatura?.nombre || "General"}</p>
                  {item.actividad && <p><b>Actividad:</b> {item.actividad.titulo}</p>}
                  {item.incidencia && <p><b>Incidencia:</b> {item.incidencia.titulo}</p>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="student-section" id="incidencias">
        <div className="section-title"><div><p className="eyebrow">INCIDENCIAS</p><h3>Histórico de incidencias</h3></div><span className="section-count">{data.incidencias.length}</span></div>
        {data.incidencias.length === 0 ? <Empty text="No hay incidencias registradas." /> : (
          <div className="data-cards">
            {data.incidencias.map((incident) => (
              <article className="data-card" key={incident.id}>
                <div className="data-card-title"><strong>{incident.titulo}</strong><span className="status-pill">{incidentLabels[incident.estado] ?? incident.estado}</span></div>
                <p>{incident.descripcion}</p>
                <p><b>Fecha:</b> {dateTime(incident.fecha)} · <b>Asignatura:</b> {incident.asignatura?.nombre || "General"}</p>
                {incident.resolucion && <p><b>Resolución:</b> {incident.resolucion}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="student-section" id="comunicaciones">
        <div className="section-title"><div><p className="eyebrow">CONTACTOS</p><h3>Comunicaciones</h3></div><span className="section-count">{data.comunicaciones.length}</span></div>
        {data.comunicaciones.length === 0 ? <Empty text="No hay comunicaciones registradas." /> : (
          <div className="timeline-list">
            {data.comunicaciones.map((communication) => (
              <article className="timeline-item" key={communication.id}>
                <div className="timeline-date">{dateTime(communication.fecha)}</div>
                <div className="timeline-body"><div className="timeline-heading"><strong>{communication.motivo || "Comunicación"}</strong><span>{communication.canal}</span></div><p>{communication.asignatura?.nombre || "General"}</p>{communication.resumen && <p>{communication.resumen}</p>}</div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="student-section" id="cronologia">
        <div className="section-title">
          <div><p className="eyebrow">HISTORIAL</p><h3>Cronología</h3></div>
          <span className="section-count">{timelineCounts[timelineFilter]}</span>
        </div>

        {data.cronologia.length === 0 ? <Empty text="Todavía no hay eventos en la cronología." /> : (
          <>
            <div className="timeline-tabs" role="tablist" aria-label="Filtrar cronología por tipo">
              {timelineTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={timelineFilter === tab.value}
                  className={`timeline-tab ${timelineFilter === tab.value ? "active" : ""}`}
                  onClick={() => setTimelineFilter(tab.value)}
                >
                  <span>{tab.label}</span>
                  <strong>{timelineCounts[tab.value]}</strong>
                </button>
              ))}
            </div>

            {filteredTimeline.length === 0 ? (
              <Empty text="No hay elementos de este tipo en la cronología." />
            ) : (
              <div className="timeline-list filtered-timeline">
                {filteredTimeline.map((item) => (
                  <article className="timeline-item" key={item.id}>
                    <div className="timeline-date">{dateTime(item.fecha)}</div>
                    <div className="timeline-body">
                      <div className="timeline-heading">
                        <strong>{item.titulo}</strong>
                        <span>{timelineTypeLabels[item.tipo] ?? item.tipo.replaceAll("_", " ")}</span>
                      </div>
                      <p>{item.asignatura || "General"}{timelineStateLabel(item.tipo, item.estado) ? ` · ${timelineStateLabel(item.tipo, item.estado)}` : ""}{typeof item.calificacion === "number" ? ` · Nota ${item.calificacion}` : ""}</p>
                      {item.detalle && <p>{item.detalle}</p>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
