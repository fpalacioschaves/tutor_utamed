import { useEffect, useState } from "react";

type Copy = { name: string; modifiedAt: string; sizeBytes: number };
type SyncStatus = { configured: boolean; latest: string | null; current: string | null; needsReview: boolean; reason: string };

export function DriveSyncSettings() {
  const [folder, setFolder] = useState("");
  const [ready, setReady] = useState(false);
  const [copies, setCopies] = useState<Copy[]>([]);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sync, setSync] = useState<SyncStatus | null>(null);

  async function call(route: string, method = "GET", data?: object) {
    const res = await fetch("/api/drive-sync/" + route, {
      method, headers: { "Content-Type": "application/json" },
      body: data ? JSON.stringify(data) : undefined,
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Error de transferencia");
    return result;
  }
  async function refresh() {
    const rows = await call("packages");
    setCopies(rows);
    setSync(await call("status"));
  }
  useEffect(() => {
    void call("settings").then(data => {
      setFolder(data.folder || "");
      setReady(Boolean(data.folder));
      if (data.folder) void refresh().catch(() => undefined);
    }).catch(() => undefined);
  }, []);
  async function perform(action: () => Promise<string>) {
    setBusy(true); setStatus("");
    try { setStatus(await action()); }
    catch (err) { setStatus(err instanceof Error ? err.message : "Operación fallida"); }
    finally { setBusy(false); }
  }
  return (
    <section className="panel">
      <h3>Google Drive · Datos cifrados en ambos equipos</h3>
      <p>En el equipo donde acabes: «Guardar y terminar». En el otro: «Continuar aquí». La contraseña es la misma en ambos y Google Drive debe haber terminado de sincronizar. No trabajes en ambos equipos simultáneamente.</p>
      {sync && <p role="status" className={sync.needsReview ? "notice-banner warning" : "backup-note"}><strong>{sync.needsReview ? "Revisar antes de trabajar: " : "Estado: "}</strong>{sync.reason}</p>}
      {sync?.needsReview && sync.latest && (
        <div className="backup-note">
          <p>Si ya tienes en este equipo los datos correctos y has añadido registros nuevos, puedes conservarlos sin restaurar una copia antigua. Se hará una copia de seguridad antes de confirmar.</p>
          <button className="secondary" type="button" disabled={busy} onClick={() => {
            if (!window.confirm("Confirma únicamente si este equipo contiene los datos que quieres conservar y ninguna otra máquina tiene cambios posteriores pendientes de subir. Se creará primero una copia de seguridad local. ¿Continuar?")) return;
            void perform(async () => {
              const result = await call("acknowledge", "POST", { expectedLatest: sync.latest });
              await refresh();
              return "Datos actuales confirmados sin reemplazarlos. Copia de seguridad: " + result.safetyBackup + ". Ya puedes usar Guardar y terminar.";
            });
          }}>Confirmar datos actuales</button>
        </div>
      )}
      <div className="form-stack">
        <label>Carpeta local de Google Drive
          <input value={folder} onChange={e => { setFolder(e.target.value); setReady(false); }} placeholder="Ruta completa a la carpeta sincronizada" />
        </label>
        <button className="secondary" type="button" disabled={busy} onClick={() => void perform(async () => {
          await call("settings", "PUT", { folder }); setReady(true); await refresh();
          return "Carpeta configurada.";
        })}>Guardar carpeta</button>
        <label>Contraseña privada para cifrar las copias (mínimo 12 caracteres)
          <input type="password" autoComplete="off" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
        </label>
        <p>La contraseña no se almacena. Debes utilizar la misma en los dos equipos.</p>
        <button className="primary" type="button" disabled={busy || !ready || passphrase.length < 12 || !sync?.latest} onClick={() => {
          if (!sync?.latest) return;
          if (!window.confirm("Se restaurará la última copia cifrada de Google Drive. Se guardará automáticamente una copia de seguridad de los datos que hay ahora en este equipo. Si has hecho cambios locales sin subirlos, detente. ¿Continuar?")) return;
          void perform(async () => {
            const result = await call("resume", "POST", { passphrase, expectedLatest: sync.latest });
            await refresh();
            return "Recuperación completada. Respaldo local: " + result.safetyBackup + ". Recarga la página para ver los datos recuperados.";
          });
        }}>{busy ? "Recuperando…" : "Continuar aquí · recuperar última copia"}</button>
        <button className="primary" type="button" disabled={busy || !ready || passphrase.length < 12 || Boolean(sync?.needsReview)} onClick={() => void perform(async () => {
          if (!window.confirm("¿Has terminado de trabajar y guardado los cambios? Se generará la copia para continuar en el otro equipo.")) return "Operación cancelada.";
          const result = await call("export", "POST", { passphrase }); await refresh();
          return "Copia cifrada creada: " + result.name + ". Espera a que Google Drive termine la sincronización.";
        })}>{busy ? "Guardando…" : "Guardar y terminar en este equipo"}</button>
        <button className="secondary" type="button" disabled={busy || !ready} onClick={() => void perform(async () => {
          await refresh(); return "Listado actualizado.";
        })}>Actualizar listado</button>
        {copies.slice(0, 20).map(copy => (
          <div className="backup-row" key={copy.name}>
            <div><strong>{new Date(copy.modifiedAt).toLocaleString("es-ES")}</strong><small>{copy.name}</small></div>
            <button className="secondary" type="button" disabled={busy || passphrase.length < 12} onClick={() => {
              if (!window.confirm("¿Descifrar esta copia en las copias locales? Los datos activos no se cambiarán hasta que la restaures desde Copias de seguridad.")) return;
              void perform(async () => {
                const result = await call("import", "POST", { name: copy.name, passphrase });
                return "Copia recuperada como " + result.name + ". Restaúrala desde Copias de seguridad.";
              });
            }}>Recuperar</button>
          </div>
        ))}
        {status && <p role="status">{status}</p>}
        <p className="backup-note">Protección: la recuperación guarda el estado anterior y se cancela si cambia la copia seleccionada. Google Drive puede tardar en descargar archivos; esta aplicación no puede detectar cambios que todavía no hayan llegado a Drive ni impedir el uso simultáneo de dos equipos.</p>
      </div>
    </section>
  );
}
