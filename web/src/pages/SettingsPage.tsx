import { AIConfigInline } from "../components/AIConfigInline";

export function SettingsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">AJUSTES GENERALES</p>
          <h2>Configuración</h2>
          <p>Centraliza aquí las pequeñas configuraciones generales de Tutor UTAMED. Iremos añadiendo nuevos bloques cuando sean necesarios.</p>
        </div>
      </header>

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
