# Preparación de Turso

La aplicación continúa utilizando SQLite local por defecto. No actives todavía el modo remoto: la base Turso sigue vacía y faltan las pruebas de migración.

En el archivo privado api/.env configura TURSO_DATABASE_URL y TURSO_AUTH_TOKEN. Este archivo está excluido de Git.

Para comprobar la conexión sin modificar datos, ejecuta desde la raíz:

npm install
npm run turso:check -w api

El comando realiza exclusivamente consultas SELECT, sin crear tablas ni importar alumnos.

Pendiente: copia verificable de las bases PC y Mac, diagnóstico de duplicados, migración del esquema y los datos, compatibilidad de fechas, control de copias/restauraciones locales y plan para materiales adjuntos.

Nunca publiques el token.
