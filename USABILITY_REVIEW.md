# Revisión integral de usabilidad y consistencia — v0.13

## Alcance
Se ha revisado el flujo completo del MVP: navegación, alumnos, asignaturas/unidades, sesiones y asistencia, actividades, ficha 360º, tutorías, seguimientos, incidencias, comunicaciones, dashboard e informes.

## Problemas corregidos en esta versión

### 1. Pérdida accidental de cambios
- Las pantallas de sesión y actividad avisan si se intenta salir con cambios sin guardar.
- La protección funciona también al navegar desde el menú lateral, no sólo con el botón Volver o al cerrar el navegador.
- El estado "Cambios sin guardar" es visible y los botones de guardado se deshabilitan cuando no hay nada que guardar.

### 2. Listas que crecerán durante el curso
Se han añadido buscadores y filtros a:
- alumnos;
- sesiones;
- actividades;
- tutorías;
- seguimientos;
- incidencias;
- comunicaciones.

Se muestra además el número de resultados filtrados.

### 3. Scroll y navegación en pantallas largas
- Se elimina el scroll interno artificial de la lista de sesiones.
- El menú lateral permanece accesible en escritorio.
- La ficha 360º incorpora navegación interna fija por secciones.
- Se añade acceso directo a Matrícula, que existía como sección pero faltaba en la navegación interna.
- La pantalla de sesión usa el mismo patrón de guardado inferior no superpuesto que Actividades.

### 4. Edición más predecible
- Al pulsar Editar en listas largas, el formulario correspondiente se lleva a la vista.
- Se muestran mensajes de éxito y error de forma coherente.
- Asignaturas y unidades se ajustan al mismo patrón de edición.

### 5. Consistencia de estados y textos
- Se normalizan etiquetas legibles de asistencia, tutorías, seguimientos e incidencias.
- Se corrige el encabezado duplicado de asistencia en la ficha del alumno.
- Se usa de forma consistente "Ausencia justificada".
- Las sesiones canceladas son de solo lectura para asistencia/observaciones.

### 6. Alumnos y asignaturas inactivos
- Un alumno inactivo deja de aparecer en las listas operativas de sesiones y actividades.
- Los registros históricos ya guardados se siguen conservando y mostrando.
- Los formularios nuevos de tutorías, seguimientos, incidencias y comunicaciones priorizan alumnos y asignaturas activos; al editar un registro histórico se conserva la opción antigua aunque esté inactiva.
- El contador de alumnos de cada asignatura refleja matrículas activas de alumnos activos.

### 7. Ficha 360º realmente histórica
- El resumen de asistencia por asignatura incluye también matrículas históricas, identificadas como tales.
- Las actividades con evidencia histórica del alumno siguen apareciendo aunque el alumno ya no esté matriculado actualmente en esa asignatura.
- Se mantiene el histórico completo de matrícula, asistencia, observaciones, entregas, tutorías, seguimientos, incidencias y comunicaciones.

### 8. Registros vacíos que contaminaban el histórico
- Pasar lista ya no crea registros vacíos para todos los alumnos cuando sólo se modifica uno.
- Una fila de asistencia totalmente vacía se elimina en lugar de quedar como un falso evento histórico.
- Una actividad en estado Pendiente sin fecha, nota ni observación se considera el estado por defecto y no crea una entrega vacía.
- Esto evita cronologías llenas de eventos sin contenido y hace que los contadores de registros tengan significado real.

### 9. Actividades
- Al volver una actividad a Pendiente o No entregada se limpia la fecha de entrega para evitar combinaciones incoherentes.
- Se elimina un botón Volver duplicado en el detalle de actividad.
- La lista puede crecer sin que el guardado tape a los últimos alumnos.

### 10. Informes
- El botón Imprimir/Guardar PDF sólo se habilita cuando existe un informe generado.
- Si se cambia el alumno o la asignatura seleccionados se invalida el informe anterior para impedir imprimir datos de una selección previa por error.

### 11. Errores de API
- La API informa de la versión correcta 0.13.0.
- Los conflictos de datos únicos y referencias inválidas devuelven mensajes legibles en vez de caer siempre en "Error interno del servidor".

### 12. Accesibilidad básica
- Estados de foco visibles para teclado.
- Controles deshabilitados claramente diferenciados.
- Mejor respuesta visual de botones y filtros.
- Tablas largas mantienen cabeceras visibles mientras se desplazan.

## Decisiones que no se han cambiado deliberadamente
- No se han añadido indicadores numéricos de participación/comprensión: las observaciones de clase siguen siendo texto libre.
- No se han añadido acciones masivas de asistencia que puedan sobrescribir a toda la clase.
- No se ha cambiado el esquema SQLite; la base `dev.db` de v0.12 es reutilizable.
- No se ha implementado aún la importación del calendario porque falta el fichero real del centro.

## Mejoras recomendadas para una fase posterior
Estas no bloquean el uso actual, pero conviene abordarlas después de probar la v0.13 con datos reales:

1. Gestión explícita de cursos académicos para crear/cerrar 2027/2028 desde la interfaz.
2. Copia de seguridad y restauración desde la propia aplicación.
3. Navegación con URL/historial del navegador para poder usar Atrás/Adelante y enlaces directos.
4. Política de archivo/eliminación de registros introducidos por error, especialmente comunicaciones y actividades duplicadas.
5. Definir contigo el criterio exacto del porcentaje de asistencia respecto a las ausencias justificadas.
6. Importación de calendario y, si UTAMED facilita un formato adecuado, importación inicial de alumnado.

## Validación técnica realizada
- Revisión estática de los flujos y consultas afectadas.
- Transpilación sintáctica de los 33 archivos TypeScript/TSX: 0 errores sintácticos.
- No se ha podido ejecutar en este entorno una instalación completa de npm para el typecheck/build integral porque la conexión al registro npm agotó el tiempo de espera.


## Decisión cerrada después de la revisión — asistencia

Las ausencias justificadas se computan como una categoría independiente de las ausencias no justificadas. También se mantienen separadas presencia, retraso y salida anticipada. Se elimina el porcentaje agregado que fusionaba varios estados bajo una única cifra de asistencia. Implementado en v0.13.1.
