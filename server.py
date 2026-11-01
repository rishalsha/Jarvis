"""
J.A.R.V.I.S. Neural Core Server
FastAPI & WebSocket server linking Web Audio HUD, Ollama local model, and iDock IoT.
"""

import os
import json
import asyncio
import logging
import time
import re
from collections import deque
from difflib import SequenceMatcher
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from core.llm_engine import JarvisEngine
from core.tts_engine import tts_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("Jarvis.Server")

# Load configuration
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
with open(CONFIG_PATH, "r") as f:
    config = json.load(f)

app = FastAPI(title="J.A.R.V.I.S. AI Core")
engine = JarvisEngine(config)

# Connected WebSockets (for live HUD broadcast)
connected_clients: Set[WebSocket] = set()

# Acoustic Echo Prevention Shield
recent_assistant_speeches = deque(maxlen=10)
last_processed_user_text = ""
last_processed_user_time = 0.0


def is_backend_acoustic_echo(user_text: str) -> bool:
    """
    Detects if the incoming speech from the client is a verbatim runaway echo.
    Because the frontend physically cuts the microphone while Jarvis is thinking
    and speaking, short phrases, commands, and answers ('list files', 'yes please')
    are never false-flagged as echos.
    """
    if not user_text:
        return False

    clean_user = re.sub(r'[^a-zA-Z0-9\s]', '', user_text).lower().strip()
    # Anything under 15 characters cannot be a full-sentence speaker echo
    if len(clean_user) < 15:
        return False

    now = time.time()
    for item in recent_assistant_speeches:
        ts = item["time"]
        clean_speech = item["clean"]

        # Only check within 15 seconds
        if (now - ts) > 15.0:
            continue

        # Near-identical full-sentence match
        sim = SequenceMatcher(None, clean_user, clean_speech).ratio()
        if sim >= 0.85:
            return True

    return False


@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    """Guarantees browser HUD never caches stale JS/CSS during live system use."""
    response = await call_next(request)
    if request.url.path.endswith((".js", ".html", ".css")):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


class ChatRequest(BaseModel):
    message: str


@app.get("/api/status")
async def get_status():
    """Returns J.A.R.V.I.S. neural core and hardware status."""
    return {
        "status": "ONLINE",
        "assistant": config.get("assistant_name", "JARVIS"),
        "model": engine.model,
        "mqtt_connected": engine.idock.connected,
        "device_states": engine.idock.device_states,
        "memory_items": len(engine.memory.get_all_facts())
    }


@app.post("/api/chat")
async def chat_api(req: ChatRequest):
    """Direct HTTP chat query."""
    res = engine.process_user_input(req.message)
    return res


@app.get("/api/tts")
async def get_tts_audio(text: str, engine_type: str = "piper"):
    """
    Ultra-fast TTS endpoint.
    'piper': In-memory local neural ONNX synthesis (~75ms).
    'edge': Microsoft Edge Neural en-GB-RyanNeural (~500ms).
    """
    if not text:
        return Response(status_code=400)
    try:
        if engine_type == "edge":
            audio_bytes = await tts_engine.synthesize_edge_mp3(text)
            return Response(content=audio_bytes, media_type="audio/mpeg")
        else:
            loop = asyncio.get_running_loop()
            wav_bytes = await loop.run_in_executor(None, tts_engine.synthesize_piper_wav, text)
            return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    logger.info("HUD Web client connected to J.A.R.V.I.S. neural stream.")

    # Send initial greeting state
    await websocket.send_json({
        "type": "init",
        "assistant": config.get("assistant_name", "JARVIS"),
        "user_name": config.get("user_name", "Sir"),
        "status": "READY",
        "mqtt_connected": engine.idock.connected,
        "device_states": engine.idock.device_states
    })

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except Exception:
                continue

            msg_type = msg.get("type")

            if msg_type == "user_speech":
                text = msg.get("text", "").strip()
                if not text:
                    continue

                now = time.time()
                # Deduplication shield within 1.2s
                global last_processed_user_text, last_processed_user_time
                if text.lower() == last_processed_user_text.lower() and (now - last_processed_user_time) < 1.2:
                    continue
                last_processed_user_text = text
                last_processed_user_time = now

                # HARD ACOUSTIC ECHO SHIELD (BACKEND DEFENSE):
                # If this text matches words Jarvis spoke recently out of loud speakers, drop it immediately
                if is_backend_acoustic_echo(text):
                    logger.warning(f"[ECHO SHIELD] Discarded speaker acoustic loopback: '{text}'")
                    await websocket.send_json({
                        "type": "state_change",
                        "state": "listening"
                    })
                    continue

                logger.info(f"Received speech from Sir: '{text}'")

                # 1. Inform HUD: Jarvis is thinking
                await websocket.send_json({
                    "type": "state_change",
                    "state": "thinking",
                    "user_text": text
                })

                # 2. Process via Local LLM engine (run in thread to not block async loop)
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(None, engine.process_user_input, text)

                reply_text = result.get("reply", "At your service, sir.")
                tools_run = result.get("tools_executed", [])

                logger.info(f"Jarvis reply: '{reply_text}'")

                # Track assistant speech for echo shield
                clean_reply = re.sub(r'[^a-zA-Z0-9\s]', '', reply_text).lower().strip()
                recent_assistant_speeches.append({
                    "time": time.time(),
                    "raw": reply_text,
                    "clean": clean_reply,
                    "word_set": set([w for w in clean_reply.split() if len(w) > 2])
                })

                # 3. Inform HUD: Jarvis is speaking response
                await websocket.send_json({
                    "type": "jarvis_speech",
                    "reply": reply_text,
                    "tools": tools_run,
                    "device_states": engine.idock.device_states
                })

            elif msg_type == "wake_triggered":
                # User said "Jarvis" or clicked voice button
                await websocket.send_json({
                    "type": "state_change",
                    "state": "listening"
                })

    except WebSocketDisconnect:
        connected_clients.remove(websocket)
        logger.info("HUD Web client disconnected.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if websocket in connected_clients:
            connected_clients.remove(websocket)


# Mount Web View directory
WEB_DIR = os.path.join(os.path.dirname(__file__), "web")
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    host = config.get("server", {}).get("host", "0.0.0.0")
    port = config.get("server", {}).get("port", 8000)
    print(f"\n=======================================================")
    print(f"  J.A.R.V.I.S. ONLINE - Ready at http://localhost:{port}")
    print(f"=======================================================\n")
    uvicorn.run(app, host=host, port=port, log_level="info")
