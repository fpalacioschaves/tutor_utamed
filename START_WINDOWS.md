# Inicio en Windows — Tutor UTAMED v0.16.0

## Aplicación

Abre `cmd` en la carpeta del proyecto y ejecuta:

```cmd
npm install
npm run dev
```

Después abre:

```text
http://localhost:5173
```

Si vienes de v0.15.0, copia primero tu base de datos:

```text
api\prisma\dev.db
```

No ejecutes `npm run setup`.

## IA local (opcional)

La aplicación funciona sin IA. Para activar las funciones inteligentes necesitas Ollama ejecutándose en tu ordenador.

Descarga un modelo, por ejemplo:

```cmd
ollama pull qwen3:8b
```

Después entra en el módulo `IA` de Tutor UTAMED y pulsa `Comprobar conexión`.

Configuración predeterminada:

```text
URL: http://127.0.0.1:11434
Modelo: qwen3:8b
```

Desde la ficha de un alumno aparecerán los botones:

```text
Resumen académico
Preparar tutoría
Analizar evolución
```
