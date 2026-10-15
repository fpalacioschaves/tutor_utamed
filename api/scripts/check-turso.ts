import "dotenv/config";
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url?.startsWith("libsql://") || !authToken) {
    console.error("Configura TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en api/.env (nunca en GitHub).");
    process.exitCode = 1;
    return;
  }
  const client = createClient({ url, authToken });
  try {
    const response = await client.execute("SELECT 1 AS conexion");
    if (Number(response.rows[0]?.conexion) !== 1) throw new Error("Respuesta inesperada");
    const schema = await client.execute("SELECT COUNT(*) AS tablas FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    console.log("Conexión de solo lectura a Turso: correcta.");
    console.log("Tablas en base remota:", String(schema.rows[0]?.tablas ?? "?"));
    console.log("No se ha creado, borrado ni importado ningún dato.");
  } finally {
    client.close();
  }
}
main().catch(error => {
  console.error("Error de conexión a Turso:", error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
