import { AIConfigInline } from "../components/AIConfigInline";
import { BackupSettings } from "../components/BackupSettings";

export function SettingsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">AJUSTES GENERALES</p>
          <h2>Configuración</h2>
          <p>Centraliza aquí las configuraciones generales y las herramientas de mantenimiento de Tutor UTAMED.</p>
        </div>
      </header>

      <BackupSettings />

      <section className="panel">
        <div className="unit-tools-heading">
          <div>
            <strong>Inteligencia artificial local</strong>
            <small>Configuración global de Ollama para toda la aplicación.</small>
          </div>
        </div>
        <AIConfigInline />
      </section>
    </>
  );
}
