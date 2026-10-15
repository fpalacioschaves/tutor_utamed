# Transferencia cifrada entre equipos con Google Drive

## Estado de esta versión

Transferencia **manual** de copias completas, no sincronización automática ni simultánea.

## Requisitos

- Tutor UTAMED actualizado en los dos equipos.
- Google Drive para ordenadores instalado, con la misma cuenta.
- Una carpeta en Mi unidad sincronizada y marcada como disponible sin conexión.
- Una contraseña de al menos 12 caracteres, conocida por el usuario y **no almacenada** por Tutor UTAMED.

## Primer equipo

1. Abre Configuración → Google Drive.
2. Escribe la ruta local **absoluta** de la carpeta sincronizada.
3. Guarda la carpeta.
4. Introduce una contraseña de cifrado.
5. Pulsa «Guardar copia cifrada en Drive».
6. Espera a que Google Drive confirme que ese archivo terminó de sincronizarse.
7. Deja de modificar datos en el primer equipo.

## Segundo equipo

1. Abre Google Drive para ordenadores y espera a que todos los archivos estén descargados.
2. Abre Tutor UTAMED → Configuración → Google Drive.
3. Configura la ruta correspondiente **en este equipo**, que puede ser distinta.
4. Introduce la misma contraseña.
5. Pulsa «Actualizar listado» y «Recuperar» sobre la última copia.
6. En «Copias de seguridad» usa «Restaurar» para activar la copia recuperada. Se crea una copia de seguridad previa automáticamente.
7. Comprueba los datos y comienza a trabajar.

## Seguridad y límites

- No se copia `dev.db` a la carpeta Drive: sólo paquetes `.utamed.enc` cifrados.
- Se utiliza AES-256-GCM y derivación de clave con scrypt y sal aleatoria.
- La configuración de la carpeta es local por dispositivo: `local-private/drive-sync-settings.json`.
- Los datos restaurados incluyen `dev.db`, `local-content` y `local-data`.
- No trabajes en dos equipos a la vez: aún no existe un bloqueo distribuido ni resolución automática de conflictos.
- La aplicación no puede garantizar desde el sistema de archivos que Google Drive haya terminado su sincronización: verifica ese estado en Google Drive.
- El usuario debe seleccionar la copia correcta. Restaurar una copia antigua reemplaza el estado actual, aunque se crea una copia local de seguridad previa.
- Esta fase tiene un límite de 150 MB de archivos originales por exportación.
- La carpeta de Drive no es una copia de seguridad completa si no se conservan versiones: mantén también las copias locales y protege tu cuenta Google.
- No olvides la contraseña: sin ella los paquetes cifrados no pueden recuperarse.
