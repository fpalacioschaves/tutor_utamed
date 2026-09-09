import { useEffect, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { SessionDetailPage } from "./pages/SessionDetailPage";
import { SessionsPage } from "./pages/SessionsPage";
import { StudentsPage } from "./pages/StudentsPage";
import { StudentDetailPage } from "./pages/StudentDetailPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { ActivityDetailPage } from "./pages/ActivityDetailPage";
import { TutorialsPage } from "./pages/TutorialsPage";
import { FollowUpsPage } from "./pages/FollowUpsPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { CommunicationsPage } from "./pages/CommunicationsPage";
import { SubjectsPage } from "./pages/SubjectsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { AISettingsPage } from "./pages/AISettingsPage";

type View = "dashboard" | "sessions" | "students" | "subjects" | "activities" | "tutorials" | "followups" | "incidents" | "communications" | "alerts" | "ai" | "reports" | "placeholder";

const NAV_ITEMS = ["Dashboard", "Sesiones", "Alumnos", "Asignaturas", "Actividades", "Tutorías", "Seguimientos", "Incidencias", "Comunicaciones", "Alertas", "IA", "Informes"];

function App() {
  const [view, setView] = useState<View>("dashboard");
  const [activeLabel, setActiveLabel] = useState("Dashboard");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [apiStatus, setApiStatus] = useState<"checking" | "ok" | "error">("checking");
  const [detailDirty, setDetailDirty] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) throw new Error();
        setApiStatus("ok");
      })
      .catch(() => setApiStatus("error"));
  }, []);

  function navigate(label: string) {
    if (detailDirty && !window.confirm("Hay cambios sin guardar. ¿Quieres salir y descartarlos?")) return;
    setDetailDirty(false);
    setSessionId(null);
    setStudentId(null);
    setActivityId(null);
    setActiveLabel(label);
    if (label === "Dashboard") setView("dashboard");
    else if (label === "Sesiones") setView("sessions");
    else if (label === "Alumnos") setView("students");
    else if (label === "Asignaturas") setView("subjects");
    else if (label === "Actividades") setView("activities");
    else if (label === "Tutorías") setView("tutorials");
    else if (label === "Seguimientos") setView("followups");
    else if (label === "Incidencias") setView("incidents");
    else if (label === "Comunicaciones") setView("communications");
    else if (label === "Alertas") setView("alerts");
    else if (label === "IA") setView("ai");
    else if (label === "Informes") setView("reports");
    else setView("placeholder");
  }

  function openSession(id: number) {
    setStudentId(null);
    setActivityId(null);
    setSessionId(id);
    setView("sessions");
    setActiveLabel("Sesiones");
  }

  function openStudent(id: number) {
    setSessionId(null);
    setActivityId(null);
    setStudentId(id);
    setView("students");
    setActiveLabel("Alumnos");
  }


  function openActivity(id: number) {
    setSessionId(null);
    setStudentId(null);
    setActivityId(id);
    setView("activities");
    setActiveLabel("Actividades");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">UTAMED</p>
          <h1>Tutor</h1>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <button className={activeLabel === item ? "nav-item active" : "nav-item"} key={item} type="button" onClick={() => navigate(item)}>
              {item}
            </button>
          ))}
        </nav>
        <div className={`api-status ${apiStatus}`}>
          <span />
          {apiStatus === "checking" && "Comprobando API"}
          {apiStatus === "ok" && "API conectada"}
          {apiStatus === "error" && "API sin conexión"}
        </div>
      </aside>

      <main>
        {sessionId !== null ? (
          <SessionDetailPage sessionId={sessionId} onDirtyChange={setDetailDirty} onBack={() => { setDetailDirty(false); setSessionId(null); }} />
        ) : studentId !== null ? (
          <StudentDetailPage studentId={studentId} onBack={() => setStudentId(null)} />
        ) : activityId !== null ? (
          <ActivityDetailPage activityId={activityId} onDirtyChange={setDetailDirty} onBack={() => { setDetailDirty(false); setActivityId(null); }} />
        ) : view === "dashboard" ? (
          <DashboardPage
            onOpenSessions={() => navigate("Sesiones")}
            onOpenSession={openSession}
            onOpenStudent={openStudent}
            onOpenTutorials={() => navigate("Tutorías")}
            onOpenFollowUps={() => navigate("Seguimientos")}
            onOpenIncidents={() => navigate("Incidencias")}
            onOpenAlerts={() => navigate("Alertas")}
          />
        ) : view === "sessions" ? (
          <SessionsPage onOpenSession={openSession} />
        ) : view === "students" ? (
          <StudentsPage onOpenStudent={openStudent} />
        ) : view === "subjects" ? (
          <SubjectsPage />
        ) : view === "activities" ? (
          <ActivitiesPage onOpenActivity={openActivity} />
        ) : view === "tutorials" ? (
          <TutorialsPage />
        ) : view === "followups" ? (
          <FollowUpsPage />
        ) : view === "incidents" ? (
          <IncidentsPage />
        ) : view === "communications" ? (
          <CommunicationsPage />
        ) : view === "alerts" ? (
          <AlertsPage onOpenStudent={openStudent} />
        ) : view === "ai" ? (
          <AISettingsPage />
        ) : view === "reports" ? (
          <ReportsPage />
        ) : (
          <section className="panel placeholder-panel">
            <p className="eyebrow">PRÓXIMAMENTE</p>
            <h2>{activeLabel}</h2>
            <p>Este módulo está previsto en el MVP, pero todavía no está implementado en esta versión.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
