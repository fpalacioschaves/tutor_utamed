import { useEffect, useState } from "react";
import type { AiConfig } from "../types";

const DEFAULT_CONFIG: AiConfig = {
  enabled: true,
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:8b",
};

export function AISettingsPage() {
  const [config, setConfig] = useState<AiConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/ai/config")
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar la configuración de IA");
        setConfig(await response.json());
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar la configuración de IA"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/ai/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar la configuración");
      setConfig(body);
      setMessage("Configuración guardada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setError("");
    setMessage("");
    setModels([]);
    try {
      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo conectar con Ollama");
      setModels(body.models ?? []);
      setMessage(body.modelAvailable
        ? `Ollama conectado. El modelo ${config.model} está disponible.`
        : `Ollama conectado, pero no encuentro ${config.model}. Elige uno de los modelos instalados o descárgalo en Ollama.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar con Ollama");
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <p className="muted">Cargando configuración de IA…</p>;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">INTELIGENCIA ARTIFICIAL LOCAL</p>
          <h2>Configuración de IA</h2>
          <p>La IA se ejecuta con Ollama en este mismo ordenador. Los datos del alumnado no se envían a servicios externos.</p>
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <section className="panel ai-config-panel">
        <div className="ai-privacy-note">
          <strong>Privacidad</strong>
          <p>Tutor UTAMED sólo acepta una URL local de Ollama (localhost o 127.0.0.1). Así evitamos que nombres, notas u observaciones salgan del equipo.</p>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))}
          />
          <span>Activar funciones de IA</span>
        </label>

        <div className="form-grid ai-config-grid">
          <label>
            URL de Ollama
            <input
              value={config.baseUrl}
              onChange={(event) => setConfig((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="http://127.0.0.1:11434"
            />
          </label>
          <label>
            Modelo
            <input
              value={config.model}
              onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
              placeholder="qwen3:8b"
              list="ollama-models"
            />
            <datalist id="ollama-models">
              {models.map((model) => <option key={model} value={model} />)}
            </datalist>
          </label>
        </div>

        <div className="button-row">
          <button type="button" className="secondary" disabled={testing} onClick={() => void test()}>
            {testing ? "Comprobando…" : "Comprobar conexión"}
          </button>
          <button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>

        {models.length > 0 && (
          <div className="ai-model-list">
            <strong>Modelos detectados en Ollama</strong>
            <div className="subject-tags">
              {models.map((model) => <span className="tag" key={model}>{model}</span>)}
            </div>
          </div>
        )}
      </section>

      <section className="panel ai-help-panel">
        <p className="eyebrow">CÓMO SE UTILIZA</p>
        <h3>La IA trabaja desde la ficha de cada alumno</h3>
        <p>En cada ficha aparecerán tres acciones: Resumen académico, Preparar tutoría y Analizar evolución. El backend reúne los datos del alumno, construye un contexto estructurado y se lo entrega únicamente al modelo local.</p>
      </section>
    </>
  );
}
