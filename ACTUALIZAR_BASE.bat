@echo off
cd /d "%~dp0"
echo Actualizando esquema y Prisma Client...
call npm run db:update
if errorlevel 1 (
  echo.
  echo ERROR: No se pudo actualizar la base de datos.
  pause
  exit /b 1
)
echo.
echo Base de datos y Prisma Client actualizados correctamente.
pause
