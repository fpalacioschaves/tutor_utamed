import { BackupSettings } from "../components/BackupSettings";

export function SettingsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">SEGURIDAD DE DATOS</p>
          <h2>Configuración</h2>
          <p>Gestiona las copias de seguridad de Tutor UTAMED. Las herramientas de carga inicial y limpieza masiva ya no están disponibles.</p>
        </div>
      </header>
      <BackupSettings />
    </>
  );
}
