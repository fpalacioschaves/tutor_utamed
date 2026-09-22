# DAM / DAW: grupo académico de cada alumno

## Alcance

La tabla `grupos` ya existía para cursos y asignaturas. Ahora `alumnos.grupo_id`
es una referencia opcional a `grupos.id`. No se duplican las asignaturas
compartidas de DAM y DAW. Las tutorías y las sesiones **no** se modifican
en esta fase.

## Actualización de la base local (SQLite)

1. Cierra Tutor UTAMED y conserva la base `api/prisma/dev.db`.
2. Actualiza el código del repositorio (`git pull` tras incorporar los cambios).
3. Ejecuta `INICIAR_TUTOR_UTAMED.bat` como de costumbre. El arranque invoca
   `npm run db:update` y aplica el esquema sin forzar un reinicio de datos.
   Alternativamente, con la aplicación cerrada, ejecuta `npm run db:update`.
4. El proceso guarda **una sola vez**, si existía la base,
   `api/prisma/dev.pre-grupos.db`, antes de cambiar el esquema. Esa copia
   está excluida de GitHub. No la borres hasta comprobar los alumnos.
5. Se crean los grupos DAM y DAW para cada curso activo. En alumnado sin
   grupo se revisa `notas_generales` y se asigna un único grupo solo cuando
   hay una coincidencia inequívoca con DAM o DAW y un curso identificable
   por sus matrículas (o un único curso activo si carece de matrículas).
6. En pantalla **Alumnos** puedes filtrar, revisar y corregir el grupo;
   la ficha individual muestra el mismo dato.

## Salvaguardas

- El proceso no modifica las notas generales originales ni altera
  matrículas, asistencias, actividades ni tutorías.
- Nunca reemplaza un grupo ya asignado (ni siquiera en posteriores arranques).
- Si la descripción menciona ambos grupos o ninguno, el alumno queda
  **sin asignar**, y el comando informa de sus ID para revisión manual.
- El script es idempotente: se puede ejecutar de nuevo sin duplicar grupos.
- Para restaurar la copia previa, cierra la aplicación y conserva por
  separado la base actual antes de sustituir `dev.db`.
- La base SQLite real permanece exclusivamente en el equipo del profesor;
  la copia no se publica ni se adjunta al repositorio.
