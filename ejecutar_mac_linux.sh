#!/bin/bash
# ===================================================
#     MeetingBrain - Editor de Actas y Reuniones
# ===================================================
echo "Iniciando MeetingBrain local..."

# Ir al directorio del script
cd "$(dirname "$0")"

# Verificar si existe node_modules
if [ ! -d "node_modules" ]; then
    echo "[ALERT] No se detectó la carpeta 'node_modules'."
    echo "Instalando módulos de Node.js... esto puede tardar un minuto..."
    npm install
fi

# Abrir el navegador por defecto
if [ "$(uname)" == "Darwin" ]; then
    # es macOS
    open http://localhost:3000
elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
    # es Linux
    xdg-open http://localhost:3000
fi

# Iniciar servidor local
npm run dev
