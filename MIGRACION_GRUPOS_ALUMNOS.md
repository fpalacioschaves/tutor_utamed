# Tutor UTAMED — seguridad SQLite y grupos DAM/DAW

## Qué pasó

El código anterior añadía los grupos al modelo Alumno, pero el arranque
actualizaba automáticamente el esquema y podía crear una base nueva vacía
si faltaba `api/prisma/dev.db`. La URL de la CLI de Prisma también se
configuraba por separado mediante `DATABASE_URL`; eso permitía que la
herramienta de actualización y la aplicación trabajaran sobre rutas distintas.

El archivo `dev.db`, cualquier respaldo `dev.pre-grupos.db` y
`local-backups` están excluidos de GitHub. Subir código no recupera
ni modifica por sí mismo una base que está en el equipo del profesor.

## Cambios de seguridad

- `INICIAR_TUTOR_UTAMED.bat` **no crea una base nueva** si falta `dev.db`.
- El arranque habitual **no aplica cambios de esquema ni reasigna alumnos**.
- El comando `db:reset` queda deshabilitado.
- La ruta SQLite de Prisma ORM v6 se define una sola vez en
  `api/prisma/schema.prisma`: `file:./dev.db`.
- `npm run db:update` genera antes una copia SQLite consolidada mediante
  la API de respaldo de SQLite; comprueba integridad y los recuentos de
  alumnos, matrículas, grupos y cursos; si no se puede respaldar, aborta.
  El archivo `dev.pre-update-<fecha>.db` se guarda junto a `dev.db`,
  sin sustituir las copias que ya existan.
- La asignación desde notas a grupos **no es automática al arrancar**.
  Existe como operación aparte: `npm run db:assign-groups -w api`.
  No la ejecutes hasta localizar y verificar la base que contiene tus alumnos.

## Selector DAM / DAW

En **Alumnos**, cuando faltan DAM o DAW del curso 2026/2027, aparece
«Crear grupos DAM y DAW». Esta acción crea solamente esos grupos
en un curso académico 2026/2027 **ya existente**. No toca alumnos,
matrículas, sesiones, tutorías ni contenidos. Si el curso no existe,
muestra un error; NO crea un curso falso para ocultar que se ha abierto
una base distinta de la original.

Si la base abierta contiene cero alumnos, la pantalla muestra la ruta
exacta del archivo y los recuentos de las copias locales que encuentre.
Es una consulta de solo lectura; no ejecuta una restauración.

## Datos perdidos

Esta revisión de código **no recupera** los alumnos que falten en el
archivo actual. Solo una base anterior que contenga esos datos permitiría
restaurarlos. Nunca sustituyas la base actual sin conservar antes los
archivos y sin comprobar los datos del archivo candidato.
