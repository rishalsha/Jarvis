#!/bin/bash
# ==============================================================
# J.A.R.V.I.S. Neural Core Launcher
# Stark Industries // Serving Sir Rishal
# ==============================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  INITIALIZING J.A.R.V.I.S. PROTOCOLS // STARK INDUSTRIES"
echo "=========================================================="

# 1. Ensure Ollama service is active
if ! systemctl is-active --quiet ollama; then
    echo "[-] Starting Ollama local neural service..."
    echo kjkj | sudo -S systemctl start ollama
    sleep 2
fi

# 2. Check Python Virtualenv
if [ ! -d "$DIR/venv" ]; then
    echo "[!] Virtualenv missing. Creating now..."
    python3 -m venv "$DIR/venv"
    "$DIR/venv/bin/pip" install --upgrade pip
    "$DIR/venv/bin/pip" install fastapi uvicorn websockets paho-mqtt requests
fi

echo "[+] Activating J.A.R.V.I.S. neural virtualenv..."
source "$DIR/venv/bin/activate"

# 3. Launch Server
echo "[+] Booting J.A.R.V.I.S. Core on port 8000..."
exec python3 "$DIR/server.py"
