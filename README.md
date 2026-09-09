# Tutor UTAMED v0.16.0

Aplicación web local y privada para el seguimiento docente de alumnos de UTAMED.

Tecnologías:

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- Prisma + SQLite
- Ollama local para las funciones de IA

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

Si reutilizas una base de datos de una versión anterior, copia antes:

```text
api\prisma\dev.db
```

No es necesario ejecutar `npm run setup` ni `npm run db:update` para pasar de v0.15.0 a v0.16.0.

## Activar la IA

Tutor UTAMED utiliza Ollama en el propio ordenador. La aplicación principal funciona aunque Ollama no esté instalado o esté apagado; en ese caso sólo las funciones de IA estarán indisponibles.

### 1. Instalar Ollama

Instala Ollama para Windows desde su distribución oficial.

### 2. Descargar un modelo

En `cmd`:

```cmd
ollama pull qwen3:8b
```

Puedes utilizar otro modelo instalado y configurarlo después desde Tutor UTAMED.

### 3. Comprobar Ollama

Ollama utiliza por defecto:

```text
http://127.0.0.1:11434
```

En Tutor UTAMED abre:

```text
IA
```

Pulsa `Comprobar conexión`. Si el modelo está instalado aparecerá como disponible.

### 4. Utilizar IA con un alumno

Abre:

```text
Alumnos → Ver ficha → IA
```

Dispones de:

- Resumen académico
- Preparar tutoría
- Analizar evolución

El análisis se realiza bajo demanda y sólo con los datos registrados en la aplicación.

## Privacidad de IA

El backend rechaza URLs de Ollama externas al equipo. Sólo permite direcciones loopback (`localhost`, `127.0.0.1` o equivalente IPv6), evitando que los datos académicos se envíen por esta funcionalidad a un servidor remoto.
