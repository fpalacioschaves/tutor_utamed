import { useEffect, useState } from "react";
import type { AiConfig } from "../types";

type Props = {
  onClose?: () => void;
};

const DEFAULT_CONFIG: AiConfig = {
  enabled: true,
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:8b",
};

export function AIConfigInline({ onClose }: Props = {}) {
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
      setMessage("Configuración de IA guardada.");
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
        : `Ollama conectado, pero no encuentro ${config.model}. Elige uno de los modelos instalados.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar con Ollama");
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <p className="muted">Cargando configuración de IA…</p>;

  return (
    <div className="ai-config-panel">
      <div className="unit-tools-heading">
        <div>
          <strong>Configuración general de IA</strong>
          <small>Esta configuración afecta a todas las unidades y a las demás funciones de IA de Tutor UTAMED.</small>
        </div>
        {onClose && (
          <button className="secondary compact-button" type="button" onClick={onClose}>Cerrar configuración</button>
        )}
      </div>

      <div className="ai-privacy-note">
        <strong>Privacidad</strong>
        <p>La IA utiliza Ollama en este ordenador. Tutor UTAMED solo admite una dirección local de Ollama.</p>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}

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
            list="ollama-models-inline"
          />
          <datalist id="ollama-models-inline">
            {models.map((model) => <option key={model} value={model} />)}
          </datalist>
        </label>
      </div>

      <div className="button-row">
        <button type="button" className="secondary compact-button" disabled={testing} onClick={() => void test()}>
          {testing ? "Comprobando…" : "Comprobar conexión"}
        </button>
        <button type="button" className="primary compact-button" disabled={saving} onClick={() => void save()}>
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
    </div>
  );
}
