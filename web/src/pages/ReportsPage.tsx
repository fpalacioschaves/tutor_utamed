import { useEffect, useMemo, useState } from "react";
import type {
  AttendanceReportResponse,
  StudentDetailResponse,
  StudentSummary,
  Subject,
  SubjectOverviewReportResponse,
} from "../types";

type ReportTab = "student" | "attendance" | "overview";

type SubjectOption = Subject & {
  activa?: boolean;
  cursoAcademico?: { id: number; nombre: string };
};

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENTE: "Presente",
  AUSENTE: "Ausencia no justificada",
  RETRASO: "Retraso",
  SALIDA_ANTICIPADA: "Salida anticipada",
  AUSENCIA_JUSTIFICADA: "Ausencia justificada",
};

const DELIVERY_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  ENTREGADA: "Entregada",
  CORREGIDA: "Corregida",
  NO_ENTREGADA: "No entregada",
  RETRASADA: "Retrasada",
};

const TUTORIAL_LABELS: Record<string, string> = {
  SOLICITADA: "Solicitada",
  PROGRAMADA: "Programada",
  REALIZADA: "Realizada",
  CANCELADA: "Cancelada",
  NO_PRESENTADO: "No presentado",
};

const FOLLOWUP_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  REALIZADO: "Realizado",
  CANCELADO: "Cancelado",
};

const INCIDENT_LABELS: Record<string, string> = {
  ABIERTA: "Abierta",
  EN_SEGUIMIENTO: "En seguimiento",
  RESUELTA: "Resuelta",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function percent(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
}

function grade(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

function attendanceStat(count: number, percentage: number | null) {
  return percentage == null ? String(count) : `${count} (${percent(percentage)})`;
}

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("student");
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [studentId, setStudentId] = useState<number | "">("");
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [studentReport, setStudentReport] = useState<StudentDetailResponse | null>(null);
  const [attendanceReport, setAttendanceReport] = useState<AttendanceReportResponse | null>(null);
  const [overviewReport, setOverviewReport] = useState<SubjectOverviewReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/students"), fetch("/api/subjects")])
      .then(async ([studentsResponse, subjectsResponse]) => {
        if (!studentsResponse.ok || !subjectsResponse.ok) throw new Error("No se pudieron cargar alumnos y asignaturas");
        const [studentData, subjectData] = await Promise.all([studentsResponse.json(), subjectsResponse.json()]);
        const activeStudents = (studentData as Array<StudentSummary & { activo?: boolean }>).filter((student) => student.activo !== false);
        const activeSubjects = (subjectData as SubjectOption[]).filter((subject) => subject.activa !== false);
        setStudents(activeStudents);
        setSubjects(activeSubjects);
        setStudentId(activeStudents[0]?.id ?? "");
        setSubjectId(activeSubjects[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los datos"));
  }, []);

  useEffect(() => {
    setError("");
    if (tab === "student" && studentId !== "") void loadStudentReport(studentId);
    if (tab === "attendance" && subjectId !== "") void loadAttendanceReport(subjectId);
    if (tab === "overview" && subjectId !== "") void loadOverviewReport(subjectId);
  }, [tab]);

  async function loadStudentReport(id: number) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/students/${id}/detail`);
      if (!response.ok) throw new Error("No se pudo generar el informe del alumno");
      setStudentReport(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el informe");
    } finally {
      setLoading(false);
    }
  }

  async function loadAttendanceReport(id: number) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/attendance/${id}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo generar el informe de asistencia");
      }
      setAttendanceReport(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el informe");
    } finally {
      setLoading(false);
    }
  }

  async function loadOverviewReport(id: number) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/subject-overview/${id}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo generar el informe general");
      }
      setOverviewReport(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el informe");
    } finally {
      setLoading(false);
    }
  }

  const studentGradeAverage = useMemo(() => {
    if (!studentReport) return null;
    const values = studentReport.actividades
      .map((activity) => activity.entrega?.calificacion)
      .filter((value): value is number => value !== null && value !== undefined);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }, [studentReport]);

  const hasReport = tab === "student" ? Boolean(studentReport) : tab === "attendance" ? Boolean(attendanceReport) : Boolean(overviewReport);

  function printReport() {
    if (!hasReport) return;
    window.print();
  }

  return (
    <>
      <header className="page-header reports-page-header no-print">
        <div>
          <p className="eyebrow">ANÁLISIS Y DOCUMENTACIÓN</p>
          <h2>Informes</h2>
          <p>Consulta una vista preparada para lectura, impresión o guardado como PDF desde el navegador.</p>
        </div>
        <button className="primary" type="button" onClick={printReport} disabled={loading || !hasReport}>
          Imprimir / Guardar PDF
        </button>
      </header>

      <section className="panel report-controls no-print">
        <div className="report-tabs" role="tablist" aria-label="Tipo de informe">
          <button className={tab === "student" ? "active" : ""} type="button" onClick={() => setTab("student")}>Alumno completo</button>
          <button className={tab === "attendance" ? "active" : ""} type="button" onClick={() => setTab("attendance")}>Asistencia por asignatura</button>
          <button className={tab === "overview" ? "active" : ""} type="button" onClick={() => setTab("overview")}>Seguimiento de clase</button>
        </div>

        {tab === "student" ? (
          <div className="report-selector">
            <label>
              Alumno
              <select value={studentId} onChange={(event) => { setStudentId(event.target.value ? Number(event.target.value) : ""); setStudentReport(null); setError(""); }}>
                <option value="" disabled>Selecciona un alumno</option>
                {students.map((student) => <option value={student.id} key={student.id}>{student.apellidos}, {student.nombre}</option>)}
              </select>
            </label>
            <button className="secondary" type="button" disabled={studentId === "" || loading} onClick={() => studentId !== "" && void loadStudentReport(studentId)}>
              Generar informe
            </button>
          </div>
        ) : (
          <div className="report-selector">
            <label>
              Asignatura
              <select value={subjectId} onChange={(event) => { setSubjectId(event.target.value ? Number(event.target.value) : ""); setAttendanceReport(null); setOverviewReport(null); setError(""); }}>
                <option value="" disabled>Selecciona una asignatura</option>
                {subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.nombre}{subject.grupo ? ` · ${subject.grupo}` : ""}</option>)}
              </select>
            </label>
            <button
              className="secondary"
              type="button"
              disabled={subjectId === "" || loading}
              onClick={() => subjectId !== "" && (tab === "attendance" ? void loadAttendanceReport(subjectId) : void loadOverviewReport(subjectId))}
            >
              Generar informe
            </button>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
      </section>

      {loading ? <section className="panel"><p className="muted">Generando informe…</p></section> : null}

      {!loading && tab === "student" && studentReport ? (
        <StudentReport report={studentReport} gradeAverage={studentGradeAverage} />
      ) : null}

      {!loading && tab === "attendance" && attendanceReport ? (
        <AttendanceReport report={attendanceReport} />
      ) : null}

      {!loading && tab === "overview" && overviewReport ? (
        <SubjectOverviewReport report={overviewReport} />
      ) : null}
    </>
  );
}

function ReportHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="print-report-header">
      <div>
        <p className="eyebrow">TUTOR UTAMED</p>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <small>Generado: {new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short" }).format(new Date())}</small>
    </div>
  );
}

function StudentReport({ report, gradeAverage }: { report: StudentDetailResponse; gradeAverage: number | null }) {
  const { alumno } = report;
  return (
    <article className="panel report-document printable-report">
      <ReportHeader title={`${alumno.apellidos}, ${alumno.nombre}`} subtitle="Informe completo de seguimiento del alumno" />

      <section className="report-section">
        <h3>Datos y matrícula</h3>
        <div className="report-summary-grid">
          <div><span>Correo</span><strong>{alumno.email || "—"}</strong></div>
          <div><span>Identificador</span><strong>{alumno.identificadorExterno || "—"}</strong></div>
          <div><span>Sesiones registradas</span><strong>{report.asistencia.global.registrados}</strong></div>
          <div><span>Nota media registrada</span><strong>{grade(gradeAverage)}</strong></div>
        </div>
        <p className="report-subjects"><b>Asignaturas:</b> {alumno.matriculas.filter((item) => item.activa).map((item) => item.asignatura.nombre).join(", ") || "—"}</p>
        {alumno.notasGenerales ? <div className="report-note"><b>Notas generales</b><p>{alumno.notasGenerales}</p></div> : null}
      </section>

      <section className="report-section">
        <h3>Asistencia</h3>
        <div className="report-summary-grid compact">
          <div><span>Registros</span><strong>{report.asistencia.global.registrados}</strong></div>
          <div><span>Presente</span><strong>{attendanceStat(report.asistencia.global.PRESENTE, report.asistencia.global.porcentajes.PRESENTE)}</strong></div>
          <div><span>Ausencia no justificada</span><strong>{attendanceStat(report.asistencia.global.AUSENTE, report.asistencia.global.porcentajes.AUSENTE)}</strong></div>
          <div><span>Retraso</span><strong>{attendanceStat(report.asistencia.global.RETRASO, report.asistencia.global.porcentajes.RETRASO)}</strong></div>
          <div><span>Salida anticipada</span><strong>{attendanceStat(report.asistencia.global.SALIDA_ANTICIPADA, report.asistencia.global.porcentajes.SALIDA_ANTICIPADA)}</strong></div>
          <div><span>Ausencia justificada</span><strong>{attendanceStat(report.asistencia.global.AUSENCIA_JUSTIFICADA, report.asistencia.global.porcentajes.AUSENCIA_JUSTIFICADA)}</strong></div>
        </div>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead><tr><th>Asignatura</th><th>Registros</th><th>Presente</th><th>Aus. no just.</th><th>Retraso</th><th>Salida ant.</th><th>Justificada</th></tr></thead>
            <tbody>
              {report.asistencia.porAsignatura.map((row) => (
                <tr key={row.asignatura.id}>
                  <td>{row.asignatura.nombre}</td>
                  <td>{row.resumen.registrados}</td>
                  <td>{attendanceStat(row.resumen.PRESENTE, row.resumen.porcentajes.PRESENTE)}</td>
                  <td>{attendanceStat(row.resumen.AUSENTE, row.resumen.porcentajes.AUSENTE)}</td>
                  <td>{attendanceStat(row.resumen.RETRASO, row.resumen.porcentajes.RETRASO)}</td>
                  <td>{attendanceStat(row.resumen.SALIDA_ANTICIPADA, row.resumen.porcentajes.SALIDA_ANTICIPADA)}</td>
                  <td>{attendanceStat(row.resumen.AUSENCIA_JUSTIFICADA, row.resumen.porcentajes.AUSENCIA_JUSTIFICADA)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h3>Histórico de asistencia y observaciones de clase</h3>
        {report.asistencia.registros.length === 0 ? <p className="muted">No hay registros de asistencia.</p> : (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>Fecha</th><th>Asignatura</th><th>Unidad</th><th>Asistencia</th><th>Observación</th></tr></thead>
              <tbody>
                {report.asistencia.registros.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDateTime(record.sesion.inicio)}</td>
                    <td>{record.sesion.asignatura.nombre}</td>
                    <td>{record.sesion.unidad ? `U${record.sesion.unidad.orden} · ${record.sesion.unidad.titulo}` : "—"}</td>
                    <td>{record.estadoAsistencia ? ATTENDANCE_LABELS[record.estadoAsistencia] : "Sin registrar"}</td>
                    <td className="report-long-cell">{record.observacion || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="report-section">
        <h3>Actividades</h3>
        {report.actividades.length === 0 ? <p className="muted">No hay actividades registradas.</p> : (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>Actividad</th><th>Asignatura</th><th>Unidad</th><th>Estado</th><th>Entrega</th><th>Nota</th><th>Observación</th></tr></thead>
              <tbody>
                {report.actividades.map((activity) => (
                  <tr key={activity.id}>
                    <td>{activity.titulo}</td>
                    <td>{activity.asignatura.nombre}</td>
                    <td>{activity.unidad?.titulo ?? "—"}</td>
                    <td>{activity.entrega ? DELIVERY_LABELS[activity.entrega.estado] : "Sin registro"}</td>
                    <td>{formatDate(activity.entrega?.fechaEntrega)}</td>
                    <td>{grade(activity.entrega?.calificacion)}</td>
                    <td className="report-long-cell">{activity.entrega?.observacion || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="report-two-columns">
        <div className="report-section">
          <h3>Tutorías individuales</h3>
          {report.tutorias.length === 0 ? <p className="muted">Sin tutorías registradas.</p> : report.tutorias.map((tutorial) => (
            <div className="report-entry" key={tutorial.id}>
              <strong>{formatDateTime(tutorial.inicio ?? tutorial.fechaSolicitud)} · {tutorial.asignatura?.nombre ?? "General"}</strong>
              <span>{TUTORIAL_LABELS[tutorial.estado] ?? tutorial.estado}</span>
              {tutorial.motivo ? <p><b>Motivo:</b> {tutorial.motivo}</p> : null}
              {tutorial.observaciones ? <p><b>Observaciones:</b> {tutorial.observaciones}</p> : null}
              {tutorial.acuerdos ? <p><b>Acuerdos:</b> {tutorial.acuerdos}</p> : null}
            </div>
          ))}
        </div>

        <div className="report-section">
          <h3>Seguimientos</h3>
          {report.seguimientos.length === 0 ? <p className="muted">Sin seguimientos registrados.</p> : report.seguimientos.map((followUp) => (
            <div className="report-entry" key={followUp.id}>
              <strong>{formatDateTime(followUp.fechaObjetivo)} · {followUp.asignatura?.nombre ?? "General"}</strong>
              <span>{FOLLOWUP_LABELS[followUp.estado] ?? followUp.estado}</span>
              <p>{followUp.descripcion}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="report-two-columns">
        <div className="report-section">
          <h3>Incidencias</h3>
          {report.incidencias.length === 0 ? <p className="muted">Sin incidencias.</p> : report.incidencias.map((incident) => (
            <div className="report-entry" key={incident.id}>
              <strong>{formatDate(incident.fecha)} · {incident.titulo}</strong>
              <span>{INCIDENT_LABELS[incident.estado] ?? incident.estado}</span>
              <p>{incident.descripcion}</p>
              {incident.resolucion ? <p><b>Resolución:</b> {incident.resolucion}</p> : null}
            </div>
          ))}
        </div>

        <div className="report-section">
          <h3>Comunicaciones</h3>
          {report.comunicaciones.length === 0 ? <p className="muted">Sin comunicaciones.</p> : report.comunicaciones.map((communication) => (
            <div className="report-entry" key={communication.id}>
              <strong>{formatDateTime(communication.fecha)} · {communication.canal}</strong>
              <span>{communication.asignatura?.nombre ?? "General"}</span>
              {communication.motivo ? <p><b>Motivo:</b> {communication.motivo}</p> : null}
              {communication.resumen ? <p>{communication.resumen}</p> : null}
            </div>
          ))}
        </div>
      </section>

    </article>
  );
}

function AttendanceReport({ report }: { report: AttendanceReportResponse }) {
  return (
    <article className="panel report-document printable-report">
      <ReportHeader title={`Asistencia · ${report.asignatura.nombre}`} subtitle={`${report.asignatura.cursoAcademico.nombre}${report.asignatura.grupo ? ` · ${report.asignatura.grupo}` : ""}`} />
      <section className="report-section">
        <div className="report-summary-grid compact">
          <div><span>Alumnos</span><strong>{report.alumnos.length}</strong></div>
          <div><span>Sesiones con asistencia</span><strong>{report.sesionesConAsistencia}</strong></div>
          <div><span>Registros</span><strong>{report.resumenGlobal.registrados}</strong></div>
          <div><span>Presentes</span><strong>{attendanceStat(report.resumenGlobal.PRESENTE, report.resumenGlobal.porcentajes.PRESENTE)}</strong></div>
          <div><span>Ausencias no justificadas</span><strong>{attendanceStat(report.resumenGlobal.AUSENTE, report.resumenGlobal.porcentajes.AUSENTE)}</strong></div>
          <div><span>Ausencias justificadas</span><strong>{attendanceStat(report.resumenGlobal.AUSENCIA_JUSTIFICADA, report.resumenGlobal.porcentajes.AUSENCIA_JUSTIFICADA)}</strong></div>
          <div><span>Retrasos</span><strong>{attendanceStat(report.resumenGlobal.RETRASO, report.resumenGlobal.porcentajes.RETRASO)}</strong></div>
          <div><span>Salidas anticipadas</span><strong>{attendanceStat(report.resumenGlobal.SALIDA_ANTICIPADA, report.resumenGlobal.porcentajes.SALIDA_ANTICIPADA)}</strong></div>
        </div>
        <div className="report-table-wrap">
          <table className="report-table attendance-report-table">
            <thead><tr><th>Alumno</th><th>Reg.</th><th>Presente</th><th>Aus. no just.</th><th>Retraso</th><th>Salida ant.</th><th>Justificada</th></tr></thead>
            <tbody>
              {report.alumnos.map((row) => (
                <tr key={row.alumno.id}>
                  <td><strong>{row.alumno.apellidos}, {row.alumno.nombre}</strong></td>
                  <td>{row.resumen.registrados}</td>
                  <td>{attendanceStat(row.resumen.PRESENTE, row.resumen.porcentajes.PRESENTE)}</td>
                  <td>{attendanceStat(row.resumen.AUSENTE, row.resumen.porcentajes.AUSENTE)}</td>
                  <td>{attendanceStat(row.resumen.RETRASO, row.resumen.porcentajes.RETRASO)}</td>
                  <td>{attendanceStat(row.resumen.SALIDA_ANTICIPADA, row.resumen.porcentajes.SALIDA_ANTICIPADA)}</td>
                  <td>{attendanceStat(row.resumen.AUSENCIA_JUSTIFICADA, row.resumen.porcentajes.AUSENCIA_JUSTIFICADA)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}

function SubjectOverviewReport({ report }: { report: SubjectOverviewReportResponse }) {
  return (
    <article className="panel report-document printable-report landscape-report">
      <ReportHeader title={`Seguimiento · ${report.asignatura.nombre}`} subtitle={`${report.asignatura.cursoAcademico.nombre}${report.asignatura.grupo ? ` · ${report.asignatura.grupo}` : ""}`} />
      <section className="report-section">
        <div className="report-summary-grid">
          <div><span>Alumnos</span><strong>{report.totales.alumnos}</strong></div>
          <div><span>Actividades</span><strong>{report.totales.actividades}</strong></div>
          <div><span>Tutorías</span><strong>{report.totales.tutorias}</strong></div>
          <div><span>Seguimientos pendientes</span><strong>{report.totales.seguimientosPendientes}</strong></div>
          <div><span>Vencidos</span><strong>{report.totales.seguimientosVencidos}</strong></div>
          <div><span>Incidencias abiertas</span><strong>{report.totales.incidenciasAbiertas}</strong></div>
        </div>
        <div className="report-table-wrap">
          <table className="report-table overview-report-table">
            <thead>
              <tr><th>Alumno</th><th>Pres.</th><th>Aus. no just.</th><th>Just.</th><th>Retr.</th><th>Sal. ant.</th><th>Corregidas</th><th>Entregadas</th><th>Pend./sin reg.</th><th>No entreg.</th><th>Nota media</th><th>Tutorías</th><th>Seguim.</th><th>Incid.</th><th>Última observación</th></tr>
            </thead>
            <tbody>
              {report.alumnos.map((row) => (
                <tr key={row.alumno.id}>
                  <td><strong>{row.alumno.apellidos}, {row.alumno.nombre}</strong></td>
                  <td>{row.asistencia.PRESENTE}</td>
                  <td>{row.asistencia.AUSENTE}</td>
                  <td>{row.asistencia.AUSENCIA_JUSTIFICADA}</td>
                  <td>{row.asistencia.RETRASO}</td>
                  <td>{row.asistencia.SALIDA_ANTICIPADA}</td>
                  <td>{row.actividades.CORREGIDA}</td>
                  <td>{row.actividades.ENTREGADA + row.actividades.RETRASADA}</td>
                  <td>{row.actividades.PENDIENTE + row.actividades.sinRegistro}</td>
                  <td>{row.actividades.NO_ENTREGADA}</td>
                  <td>{grade(row.actividades.notaMedia)}</td>
                  <td>{row.tutorias}</td>
                  <td>{row.seguimientosPendientes}{row.seguimientosVencidos ? ` (${row.seguimientosVencidos} venc.)` : ""}</td>
                  <td>{row.incidenciasAbiertas}</td>
                  <td className="report-long-cell">{row.ultimaObservacion ? `${formatDate(row.ultimaObservacion.fecha)} · ${row.ultimaObservacion.texto}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
