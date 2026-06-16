@echo off
title Iniciando Olli Local
echo ===================================================
echo     Olli - Editor de Actas y Reuniones
echo ===================================================
echo  Buscando e inicializando servidor local...
echo.

:: Obtener el directorio actual del script
cd /d "%~dp0"

:: Verificar si existe node_modules, si no, sugerir instalarlo
if not exist "node_modules\" (
    echo [ALERT] No se detecto la carpeta 'node_modules'.
    echo Instalando los modulos requeridos... esto puede tomar un minuto...
    call npm install
)

:: Abrir el navegador automaticamente a los 3 segundos de levantar el build
echo Lanzando ventana en tu navegador predeterminado...
start http://localhost:3000

:: Lanzar el servidor en vivo
echo Levantando servicios de IA de forma local...
call npm run dev

pause
