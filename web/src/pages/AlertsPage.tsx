import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AlertRuleKey, AlertSettings, AlertsResponse, AutomaticAlert } from "../types";

const RULE_LABELS: Record<AlertRuleKey, string> = {
  AUSENCIAS_CONSECUTIVAS: "Ausencias consecutivas",
  ACTIVIDADES_PENDIENTES: "Actividades pendientes",
  SEGUIMIENTO_VENCIDO: "Seguimiento vencido",
  TUTORIA_SIN_PROGRAMAR: "Tutoría sin programar",
  INCIDENCIA_ABIERTA: "Incidencia abierta",
};

const EMPTY_COUNTS: Record<AlertRuleKey, number> = {
  AUSENCIAS_CONSECUTIVAS: 0,
  ACTIVIDADES_PENDIENTES: 0,
  SEGUIMIENTO_VENCIDO: 0,
  TUTORIA_SIN_PROGRAMAR: 0,
  INCIDENCIA_ABIERTA: 0,
};

function studentName(alert: AutomaticAlert) {
  return `${alert.alumno.apellidos}, ${alert.alumno.nombre}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AlertsPage({ onOpenStudent }: { onOpenStudent: (id: number) => void }) {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [search, setSearch] = useState("");
  const [rule, setRule] = useState<AlertRuleKey | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/alerts");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron calcular las alertas");
      }
      const body: AlertsResponse = await response.json();
      setData(body);
      setSettings(body.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron calcular las alertas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visibleAlerts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return (data?.alerts ?? []).filter((alert) => {
      if (rule !== "ALL" && alert.regla !== rule) return false;
      if (!query) return true;
      return `${studentName(alert)} ${alert.asignatura?.nombre ?? ""} ${alert.titulo} ${alert.detalle}`
        .toLocaleLowerCase("es")
        .includes(query);
    });
  }, [data, rule, search]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/alerts/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la configuración");
      }
      setMessage("Reglas de alerta actualizadas. Las alertas se han recalculado con los nuevos valores.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  const counts = data?.counts ?? EMPTY_COUNTS;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">DETECCIÓN AUTOMÁTICA</p>
          <h2>Alertas</h2>
          <p>Situaciones objetivas que requieren tu atención. Las reglas son transparentes y las decides tú.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Calculando…" : "Recalcular"}</button>
      </header>

      {error && <p className="notice-banner error" role="alert">{error}</p>}
      {message && <p className="notice-banner success" role="status">{message}</p>}

      <section className="alert-stats">
        <article className="mini-stat danger-stat"><span>Total activas</span><strong>{data?.total ?? 0}</strong></article>
        <article className="mini-stat"><span>Ausencias</span><strong>{counts.AUSENCIAS_CONSECUTIVAS}</strong></article>
        <article className="mini-stat"><span>Actividades</span><strong>{counts.ACTIVIDADES_PENDIENTES}</strong></article>
        <article className="mini-stat"><span>Seguimientos</span><strong>{counts.SEGUIMIENTO_VENCIDO}</strong></article>
        <article className="mini-stat"><span>Tutorías</span><strong>{counts.TUTORIA_SIN_PROGRAMAR}</strong></article>
        <article className="mini-stat"><span>Incidencias</span><strong>{counts.INCIDENCIA_ABIERTA}</strong></article>
      </section>

      <section className="panel alerts-list-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">ATENCIÓN</p><h3>{visibleAlerts.length} de {data?.total ?? 0} alertas</h3></div>
        </div>

        <div className="list-toolbar alerts-toolbar">
          <label className="search-field"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Alumno, asignatura o motivo" /></label>
          <label>Tipo
            <select value={rule} onChange={(event) => setRule(event.target.value as AlertRuleKey | "ALL")}>
              <option value="ALL">Todas</option>
              {Object.entries(RULE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <span className="result-count">{visibleAlerts.length} resultados</span>
        </div>

        {loading ? (
          <p className="dashboard-ok">Calculando alertas…</p>
        ) : visibleAlerts.length === 0 ? (
          <div className="empty-state compact-empty"><strong>No hay alertas con estos criterios.</strong><p>Cuando una regla se cumpla aparecerá aquí automáticamente.</p></div>
        ) : (
          <div className="automatic-alert-list">
            {visibleAlerts.map((alert) => (
              <article className="automatic-alert-card" key={alert.id}>
                <div className="automatic-alert-head">
                  <div>
                    <span className={`alert-rule rule-${alert.regla.toLocaleLowerCase()}`}>{RULE_LABELS[alert.regla]}</span>
                    <h4>{alert.titulo}</h4>
                  </div>
                  <time>{formatDate(alert.fecha)}</time>
                </div>
                <button className="student-link" type="button" onClick={() => onOpenStudent(alert.alumno.id)}>{studentName(alert)}</button>
                {alert.asignatura && <strong className="automatic-alert-subject">{alert.asignatura.nombre}</strong>}
                <p>{alert.detalle}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {settings && (
        <section className="panel alert-settings-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">CONFIGURACIÓN</p><h3>Reglas de detección</h3><p>Una regla desactivada deja de generar alertas. Los umbrales se pueden cambiar cuando quieras.</p></div>
          </div>
          <form onSubmit={saveSettings} className="alert-settings-form">
            <article className="alert-setting-card">
              <label className="alert-toggle"><input type="checkbox" checked={settings.ausenciasConsecutivasActiva} onChange={(e) => setSettings({ ...settings, ausenciasConsecutivasActiva: e.target.checked })} /><span>Ausencias no justificadas consecutivas</span></label>
              <p>Las ausencias justificadas se mantienen separadas y no cuentan para esta regla.</p>
              <label>Generar alerta a partir de<input type="number" min={1} max={20} value={settings.ausenciasConsecutivasUmbral} onChange={(e) => setSettings({ ...settings, ausenciasConsecutivasUmbral: Number(e.target.value) })} disabled={!settings.ausenciasConsecutivasActiva} /><span>ausencias consecutivas</span></label>
            </article>

            <article className="alert-setting-card">
              <label className="alert-toggle"><input type="checkbox" checked={settings.actividadesPendientesActiva} onChange={(e) => setSettings({ ...settings, actividadesPendientesActiva: e.target.checked })} /><span>Actividades vencidas pendientes</span></label>
              <p>Cuenta actividades cuya fecha límite ya ha pasado y que siguen pendientes o no entregadas.</p>
              <label>Generar alerta a partir de<input type="number" min={1} max={50} value={settings.actividadesPendientesUmbral} onChange={(e) => setSettings({ ...settings, actividadesPendientesUmbral: Number(e.target.value) })} disabled={!settings.actividadesPendientesActiva} /><span>actividades</span></label>
            </article>

            <article className="alert-setting-card simple-rule">
              <label className="alert-toggle"><input type="checkbox" checked={settings.seguimientosVencidosActiva} onChange={(e) => setSettings({ ...settings, seguimientosVencidosActiva: e.target.checked })} /><span>Seguimientos vencidos</span></label>
              <p>Genera una alerta cuando llega la fecha objetivo y el seguimiento continúa pendiente.</p>
            </article>

            <article className="alert-setting-card">
              <label className="alert-toggle"><input type="checkbox" checked={settings.tutoriasSinProgramarActiva} onChange={(e) => setSettings({ ...settings, tutoriasSinProgramarActiva: e.target.checked })} /><span>Tutorías solicitadas sin programar</span></label>
              <label>Generar alerta después de<input type="number" min={1} max={365} value={settings.tutoriasSinProgramarDias} onChange={(e) => setSettings({ ...settings, tutoriasSinProgramarDias: Number(e.target.value) })} disabled={!settings.tutoriasSinProgramarActiva} /><span>días</span></label>
            </article>

            <article className="alert-setting-card">
              <label className="alert-toggle"><input type="checkbox" checked={settings.incidenciasAbiertasActiva} onChange={(e) => setSettings({ ...settings, incidenciasAbiertasActiva: e.target.checked })} /><span>Incidencias abiertas demasiado tiempo</span></label>
              <label>Generar alerta después de<input type="number" min={1} max={365} value={settings.incidenciasAbiertasDias} onChange={(e) => setSettings({ ...settings, incidenciasAbiertasDias: Number(e.target.value) })} disabled={!settings.incidenciasAbiertasActiva} /><span>días</span></label>
            </article>

            <div className="form-actions alert-settings-actions"><button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar reglas"}</button></div>
          </form>
        </section>
      )}
    </>
  );
}
