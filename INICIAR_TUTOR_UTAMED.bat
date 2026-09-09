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

if not exist api\prisma\dev.db (
  echo Primera ejecucion: creando la base de datos local...
  call npm run setup
  if errorlevel 1 goto :error
  echo.
) else (
  echo Comprobando esquema de base de datos y Prisma Client...
  call npm run db:update
  if errorlevel 1 goto :error
  echo Base de datos preparada.
  echo.
)

echo Arrancando Tutor UTAMED...
echo Web: http://localhost:5173
echo API: http://localhost:3000
echo.
call npm run dev
exit /b 0

:error
echo.
echo No se ha podido completar el arranque. Revisa el error mostrado arriba.
pause
exit /b 1
