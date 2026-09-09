@echo off
setlocal
cd /d "%~dp0"

echo ===============================================
echo            TUTOR UTAMED - ARRANQUE
echo ===============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado o no esta en PATH.
  echo Instala Node.js 22.12 o superior y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm no esta disponible.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primera ejecucion: instalando dependencias...
  call npm install
  if errorlevel 1 goto :error
  echo.
)

if not exist node_modules\pdf-parse\package.json (
  if not exist api\node_modules\pdf-parse\package.json (
    echo Instalando soporte local para lectura de PDF...
    call npm install -w api --package-lock=false --no-audit --no-fund
    if errorlevel 1 goto :pdf_dependency_error
    echo Soporte PDF instalado.
    echo.
  )
)

if not exist api\prisma\dev.db (
  echo Primera ejecucion: creando la base de datos local...
  call npm run setup
  if errorlevel 1 goto :error
  echo.
) else (
  call :stop_old_api

  echo Comprobando esquema de base de datos y Prisma Client...
  call npm run db:update
  if errorlevel 1 (
    echo.
    echo Prisma no pudo actualizarse en el primer intento.
    echo Esperando a que Windows libere los archivos y reintentando...
    timeout /t 2 /nobreak >nul
    call :stop_old_api
    call npm run db:update
    if errorlevel 1 goto :prisma_error
  )
  echo Base de datos preparada.
  echo.
)

echo Arrancando Tutor UTAMED...
echo Web: http://localhost:5173
echo API: http://localhost:3000
echo.
call npm run dev
exit /b 0

:stop_old_api
set "API_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  set "API_PID=%%P"
  echo Cerrando una instancia anterior de Tutor UTAMED API ^(PID %%P^)...
  taskkill /PID %%P /F >nul 2>&1
)
if defined API_PID timeout /t 1 /nobreak >nul
exit /b 0

:pdf_dependency_error
echo.
echo ERROR: No se ha podido instalar el soporte local para PDF.
echo Comprueba tu conexion a Internet y vuelve a ejecutar este archivo.
pause
exit /b 1

:prisma_error
echo.
echo ERROR: Windows sigue bloqueando el motor de Prisma.
echo Cierra cualquier ventana anterior de Tutor UTAMED y vuelve a ejecutar este archivo.
echo Si persiste, reinicia Windows una sola vez para liberar la DLL bloqueada.
pause
exit /b 1

:error
echo.
echo No se ha podido completar el arranque. Revisa el error mostrado arriba.
pause
exit /b 1
