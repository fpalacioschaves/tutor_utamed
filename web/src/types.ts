export type Summary = {
  course: { id: number; nombre: string } | null;
  students: number;
  subjects: number;
  sessionsToday: number;
  tutorialsToday: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  requestedTutorials: number;
  openIncidents: number;
  automaticAlerts: number;
  today: {
    sessions: Array<{
      id: number;
      tipo: "CLASE" | "TUTORIA_GRUPAL";
      titulo: string | null;
      tema: string | null;
      inicio: string;
      fin: string;
      estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA";
      asignatura: Subject;
      _count: { registros: number };
    }>;
    tutorials: Array<{
      id: number;
      fechaSolicitud: string;
      inicio: string | null;
      fin: string | null;
      estado: "SOLICITADA" | "PROGRAMADA" | "REALIZADA" | "CANCELADA" | "NO_PRESENTADO";
      motivo: string | null;
      alumno: StudentSummary;
      asignatura: Subject | null;
    }>;
  };
  attention: {
    followUps: Array<{
      id: number;
      descripcion: string;
      fechaObjetivo: string;
      alumno: StudentSummary;
      asignatura: Subject | null;
    }>;
    tutorials: Array<{
      id: number;
      fechaSolicitud: string;
      motivo: string | null;
      alumno: StudentSummary;
      asignatura: Subject | null;
    }>;
    incidents: Array<{
      id: number;
      fecha: string;
      titulo: string;
      descripcion: string;
      estado: "ABIERTA" | "EN_SEGUIMIENTO" | "RESUELTA";
      alumno: StudentSummary;
      asignatura: Subject | null;
    }>;
  };
};

export type Subject = {
  id: number;
  nombre: string;
  grupo: string;
  activa?: boolean;
};

export type Unit = {
  id: number;
  orden: number;
  titulo: string;
  descripcion: string | null;
  activa: boolean;
  _count?: { sesiones: number; actividades: number };
};

export type Session = {
  id: number;
  tipo: "CLASE" | "TUTORIA_GRUPAL";
  titulo: string | null;
  tema: string | null;
  inicio: string;
  fin: string;
  estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA";
  asignatura: Subject;
  unidad: Unit | null;
  _count?: { registros: number };
};

export type AttendanceState =
  | "PRESENTE"
  | "AUSENTE"
  | "RETRASO"
  | "SALIDA_ANTICIPADA"
  | "AUSENCIA_JUSTIFICADA";

export type SessionRecord = {
  id?: number;
  estadoAsistencia: AttendanceState | null;
  observacion: string | null;
};

export type StudentInSession = {
  id: number;
  nombre: string;
  apellidos: string;
  email: string | null;
  registro: SessionRecord | null;
};

export type SessionDetail = Session & {
  alumnos: StudentInSession[];
};

export type StudentDetailResponse = {
  alumno: {
    id: number;
    nombre: string;
    apellidos: string;
    email: string | null;
    identificadorExterno: string | null;
    notasGenerales: string | null;
    activo: boolean;
    matriculas: Array<{
      id: number;
      activa: boolean;
      fechaAlta: string;
      fechaBaja: string | null;
      asignatura: Subject & {
        codigo?: string | null;
        cursoAcademico: { id: number; nombre: string };
      };
    }>;
  };
  asistencia: {
    global: AttendanceSummary;
    porAsignatura: Array<{
      asignatura: Subject;
      matriculaActiva: boolean;
      resumen: AttendanceSummary;
    }>;
    registros: Array<{
      id: number;
      estadoAsistencia: AttendanceState | null;
      observacion: string | null;
      horaEntrada: string | null;
      horaSalida: string | null;
      sesion: Session & {
        unidad: Unit | null;
      };
    }>;
  };
  actividades: Array<{
    id: number;
    titulo: string;
    descripcion: string | null;
    fechaPublicacion: string | null;
    fechaLimite: string | null;
    asignatura: Subject;
    unidad: { id: number; titulo: string } | null;
    entrega: null | {
      id: number;
      estado: "PENDIENTE" | "ENTREGADA" | "CORREGIDA" | "NO_ENTREGADA" | "RETRASADA";
      fechaEntrega: string | null;
      calificacion: number | null;
      observacion: string | null;
    };
  }>;
  tutorias: Array<{
    id: number;
    fechaSolicitud: string;
    inicio: string | null;
    fin: string | null;
    estado: "SOLICITADA" | "PROGRAMADA" | "REALIZADA" | "CANCELADA" | "NO_PRESENTADO";
    motivo: string | null;
    observaciones: string | null;
    acuerdos: string | null;
    asignatura: Subject | null;
  }>;
  seguimientos: Array<{
    id: number;
    descripcion: string;
    fechaObjetivo: string;
    estado: "PENDIENTE" | "REALIZADO" | "CANCELADO";
    fechaCompletado: string | null;
    asignatura: Subject | null;
    sesion: { id: number; inicio: string; titulo: string | null; tipo: string } | null;
    actividad: { id: number; titulo: string } | null;
    incidencia: { id: number; titulo: string } | null;
  }>;
  incidencias: Array<{
    id: number;
    fecha: string;
    titulo: string;
    descripcion: string;
    estado: "ABIERTA" | "EN_SEGUIMIENTO" | "RESUELTA";
    resolucion: string | null;
    fechaResolucion: string | null;
    asignatura: Subject | null;
    sesion: { id: number; inicio: string } | null;
  }>;
  comunicaciones: Array<{
    id: number;
    fecha: string;
    canal: string;
    motivo: string | null;
    resumen: string | null;
    asignatura: Subject | null;
  }>;
  cronologia: Array<{
    id: string;
    fecha: string;
    tipo: string;
    asignatura: string | null;
    titulo: string;
    detalle: string | null;
    estado: string | null;
    calificacion?: number | null;
  }>;
};

export type AttendanceSummary = {
  registrados: number;
  PRESENTE: number;
  AUSENTE: number;
  RETRASO: number;
  SALIDA_ANTICIPADA: number;
  AUSENCIA_JUSTIFICADA: number;
  porcentajes: {
    PRESENTE: number | null;
    AUSENTE: number | null;
    RETRASO: number | null;
    SALIDA_ANTICIPADA: number | null;
    AUSENCIA_JUSTIFICADA: number | null;
  };
};

export type DeliveryState = "PENDIENTE" | "ENTREGADA" | "CORREGIDA" | "NO_ENTREGADA" | "RETRASADA";

export type Activity = {
  id: number;
  titulo: string;
  descripcion: string | null;
  fechaPublicacion: string | null;
  fechaLimite: string | null;
  activa: boolean;
  asignatura: Subject;
  unidad: Unit | null;
  _count?: { entregas: number };
};

export type ActivityDelivery = {
  id?: number;
  estado: DeliveryState;
  fechaEntrega: string | null;
  calificacion: number | null;
  observacion: string | null;
};

export type StudentInActivity = {
  id: number;
  nombre: string;
  apellidos: string;
  email: string | null;
  entrega: ActivityDelivery | null;
};

export type ActivityDetail = Activity & {
  alumnos: StudentInActivity[];
};

export type StudentSummary = {
  id: number;
  nombre: string;
  apellidos: string;
  email: string | null;
  activo?: boolean;
  matriculas?: Array<{ id: number; asignatura: Subject }>;
};

export type TutorialState = "SOLICITADA" | "PROGRAMADA" | "REALIZADA" | "CANCELADA" | "NO_PRESENTADO";

export type Tutorial = {
  id: number;
  fechaSolicitud: string;
  inicio: string | null;
  fin: string | null;
  estado: TutorialState;
  motivo: string | null;
  observaciones: string | null;
  acuerdos: string | null;
  alumno: StudentSummary;
  asignatura: Subject | null;
  _count?: { seguimientos: number };
};

export type FollowUpState = "PENDIENTE" | "REALIZADO" | "CANCELADO";

export type FollowUp = {
  id: number;
  descripcion: string;
  fechaObjetivo: string;
  estado: FollowUpState;
  fechaCompletado: string | null;
  vencido: boolean;
  alumno: StudentSummary;
  asignatura: Subject | null;
  tutoriaIndividual: { id: number; motivo: string | null; inicio: string | null } | null;
  sesion: { id: number; titulo: string | null; inicio: string; asignatura: Subject } | null;
  actividad: { id: number; titulo: string } | null;
  incidencia: { id: number; titulo: string } | null;
};

export type IncidentState = "ABIERTA" | "EN_SEGUIMIENTO" | "RESUELTA";

export type Incident = {
  id: number;
  fecha: string;
  titulo: string;
  descripcion: string;
  estado: IncidentState;
  resolucion: string | null;
  fechaResolucion: string | null;
  alumno: StudentSummary;
  asignatura: Subject | null;
  sesion: {
    id: number;
    inicio: string;
    titulo: string | null;
    tema: string | null;
    asignatura: Subject;
  } | null;
  _count?: { seguimientos: number };
};

export type Communication = {
  id: number;
  fecha: string;
  canal: string;
  motivo: string | null;
  resumen: string | null;
  alumno: StudentSummary;
  asignatura: Subject | null;
};

export type AttendanceReportResponse = {
  asignatura: Subject & {
    codigo: string | null;
    cursoAcademico: { id: number; nombre: string };
  };
  sesionesConAsistencia: number;
  resumenGlobal: AttendanceSummary;
  alumnos: Array<{
    alumno: StudentSummary;
    resumen: AttendanceSummary;
  }>;
};

export type SubjectOverviewReportResponse = {
  asignatura: Subject & {
    codigo: string | null;
    cursoAcademico: { id: number; nombre: string };
  };
  totales: {
    alumnos: number;
    actividades: number;
    tutorias: number;
    seguimientosPendientes: number;
    seguimientosVencidos: number;
    incidenciasAbiertas: number;
  };
  alumnos: Array<{
    alumno: StudentSummary;
    asistencia: AttendanceSummary;
    actividades: {
      total: number;
      registradas: number;
      sinRegistro: number;
      PENDIENTE: number;
      ENTREGADA: number;
      CORREGIDA: number;
      NO_ENTREGADA: number;
      RETRASADA: number;
      notaMedia: number | null;
    };
    tutorias: number;
    seguimientosPendientes: number;
    seguimientosVencidos: number;
    incidenciasAbiertas: number;
    ultimaObservacion: { fecha: string; texto: string } | null;
  }>;
};

export type AlertRuleKey =
  | "AUSENCIAS_CONSECUTIVAS"
  | "ACTIVIDADES_PENDIENTES"
  | "SEGUIMIENTO_VENCIDO"
  | "TUTORIA_SIN_PROGRAMAR"
  | "INCIDENCIA_ABIERTA";

export type AlertSettings = {
  id: number;
  ausenciasConsecutivasActiva: boolean;
  ausenciasConsecutivasUmbral: number;
  actividadesPendientesActiva: boolean;
  actividadesPendientesUmbral: number;
  seguimientosVencidosActiva: boolean;
  tutoriasSinProgramarActiva: boolean;
  tutoriasSinProgramarDias: number;
  incidenciasAbiertasActiva: boolean;
  incidenciasAbiertasDias: number;
  updatedAt: string;
};

export type AutomaticAlert = {
  id: string;
  regla: AlertRuleKey;
  titulo: string;
  detalle: string;
  fecha: string;
  alumno: StudentSummary;
  asignatura: Subject | null;
  referenciaId: number | null;
};

export type AlertsResponse = {
  settings: AlertSettings;
  alerts: AutomaticAlert[];
  counts: Record<AlertRuleKey, number>;
  total: number;
};

export type AiConfig = {
  enabled: boolean;
  baseUrl: string;
  model: string;
};

export type AiDataUsage = {
  matriculas: number;
  sesiones: number;
  observacionesClase: number;
  actividades: number;
  actividadesCalificadas: number;
  tutorias: number;
  seguimientos: number;
  incidencias: number;
  comunicaciones: number;
  truncado: boolean;
};

export type AiAnalysisMode = "SUMMARY" | "TUTORIAL" | "EVOLUTION";

export type AiAnalysisResponse = {
  mode: AiAnalysisMode;
  model: string;
  content: string;
  dataUsed: AiDataUsage;
  generatedAt: string;
};
