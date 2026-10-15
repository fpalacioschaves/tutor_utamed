# Tutor UTAMED

Aplicación web local y privada para el seguimiento docente y tutorial del alumnado de UTAMED.

Tecnologías principales:

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- Prisma + SQLite

## Arranque normal

Desde la raíz del proyecto:

```cmd
npm install
npm run dev
```

Abre:

```text
http://localhost:5173
```

## Datos locales

La base de datos de trabajo se mantiene en:

```text
api\prisma\dev.db
```

Los archivos docentes asociados a las unidades se almacenan localmente en `local-content/` y su registro en `local-data/`. Estas rutas están excluidas de Git para evitar publicar información privada o ficheros de trabajo.

## Funcionalidades

Tutor UTAMED centraliza, entre otras áreas:

- alumnado y matrículas;
- asignaturas y contenidos;
- sesiones y asistencia;
- actividades y calificaciones;
- tutorías académicas;
- seguimiento personalizado del Docente-Tutor;
- seguimientos, incidencias y comunicaciones;
- calendario, alertas e informes;
- copias de seguridad, mantenimiento e importación de horarios.
