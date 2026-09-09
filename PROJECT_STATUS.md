# Tutor UTAMED — Estado del proyecto

Versión: **0.16.0**

## Novedad principal: IA local con Ollama

La aplicación incorpora un asistente de IA que funciona exclusivamente contra una instancia local de Ollama.

### Configuración

Nuevo módulo `IA` en el menú lateral:

- activar/desactivar las funciones de IA;
- configurar la URL local de Ollama;
- elegir el modelo;
- comprobar conexión;
- listar modelos instalados.

Por privacidad, el backend sólo admite `localhost`, `127.0.0.1` o loopback IPv6 como servidor Ollama.

### IA dentro de la ficha del alumno

Cada ficha 360º incorpora tres acciones:

1. **Resumen académico**
2. **Preparar tutoría**
3. **Analizar evolución**

El backend construye un contexto estructurado únicamente con datos existentes en Tutor UTAMED:

- matrículas;
- sesiones, asistencia y observaciones libres de clase;
- actividades, entregas y calificaciones;
- tutorías individuales y acuerdos;
- seguimientos;
- incidencias;
- comunicaciones.

La respuesta muestra también los recuentos de datos utilizados.

### Restricciones deliberadas

- La IA no consulta Internet.
- No se envían datos a servicios cloud.
- No debe inventar hechos ni diagnosticar al alumno.
- Ausencias justificadas y no justificadas se mantienen separadas.
- Las respuestas de IA no se guardan todavía en la base de datos: se generan bajo demanda.

## Base de datos

No hay cambios en el esquema de SQLite en v0.16.0. Se puede reutilizar directamente `api/prisma/dev.db` de v0.15.0.

## Próxima fase sugerida

Usar la IA con expedientes de prueba y ajustar prompts, longitud y modelo según la calidad real de las respuestas.
