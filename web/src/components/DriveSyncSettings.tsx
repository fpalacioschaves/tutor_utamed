import { useEffect, useState } from "react";

type Copy = { name: string; modifiedAt: string; sizeBytes: number };

export function DriveSyncSettings() {
  const [folder, setFolder] = useState("");
  const [ready, setReady] = useState(false);
  const [copies, setCopies] = useState<Copy[]>([]);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

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
      <h3>Google Drive · Transferencia manual cifrada</h3>
      <p>Instala Google Drive para ordenadores y utiliza una carpeta sincronizada disponible sin conexión. No trabajes en ambos equipos al mismo tiempo.</p>
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
        <button className="primary" type="button" disabled={busy || !ready || passphrase.length < 12} onClick={() => void perform(async () => {
          const result = await call("export", "POST", { passphrase }); await refresh();
          return "Copia cifrada creada: " + result.name + ". Espera a que Google Drive termine la sincronización.";
        })}>Guardar copia cifrada en Drive</button>
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
      </div>
    </section>
  );
}
