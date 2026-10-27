# J.A.R.V.I.S. // Stark Industries Personal AI Companion

A voice-interactive personal AI assistant modeled after **Marvel's J.A.R.V.I.S.** (voiced by Paul Bettany). Built for **Sir Rishal**, with local GPU inference, persistent long-term memory, an interactive holographic Arc Reactor HUD, and real-time smart home / workstation control through iDock.

---

## 🚀 Key Features

1. **Local Neural Brain (Ollama on NVIDIA RTX 3060 12GB)**:
   - Zero-latency local LLM inference (`qwen2.5:3b` / `llama3.2:3b` / `qwen2.5:7b`).
   - 100% private, free, and offline. Fits entirely inside the GPU's 12GB VRAM.

2. **Persistent Long-Term Memory**:
   - SQLite memory database stored at `memory/jarvis_memory.db`.
   - Remembers Sir's name, preferences, routines, past conversations, and action history across all sessions.

3. **Marvel Holographic HUD & Sound Visualizer**:
   - Real-time Web Audio API sound-wave reactivity.
   - Arc Reactor / Ultron / Jarvis rotating concentric orbital rings.
   - **Interactive States**:
     - **Standby**: Ambient cyan pulse.
     - **Listening**: Concentric rings expand and frequency bars bounce dynamically to your voice.
     - **Thinking**: Fast golden amber orbital spin while computing actions.
     - **Speaking**: Visualizer vibrates and oscillates in sync with Jarvis's vocal response.

4. **Authentic British Voice Modulation**:
   - Styled after Paul Bettany's J.A.R.V.I.S.: calm, deliberate cadence, refined British accent, respectful tone (*"At your service, sir"*, *"Right away, sir"*).
   - Real-time synthesized dual-harmonic Stark HUD glass chime on invocation.

5. **Direct iDock Hardware & IoT Control**:
   - **Room Fan**: *"Jarvis, turn on the fan"* / *"Turn off the fan"*
   - **Room Light**: *"Jarvis, turn on the light"*
   - **Desk Bulb**: *"Jarvis, toggle the desk bulb"*
   - **Workstations**:
     - *"Jarvis, wake my desktop PC"* (Transmits Wake-on-LAN magic packet)
     - *"Jarvis, put my PC to sleep"* (Sends suspend command)
     - *"Jarvis, shut down the computer"*
   - **Atmosphere Scenes**:
     - *"Jarvis, engage night mode"* (Dims lights, keeps fan running, puts PC to sleep)
     - *"Jarvis, activate all systems"* (Powers on fan, lights, and PC)

---

## 📂 Project Architecture

```
/home/rishal/Jarvis/
├── start.sh              # 1-click launcher script
├── config.json           # Model choice, MQTT host, voice parameters
├── server.py             # FastAPI & WebSocket backend
├── venv/                 # Self-contained Python virtual environment
├── memory/
│   └── jarvis_memory.db  # Persistent SQLite user profile & chat history
├── core/
│   ├── llm_engine.py     # Ollama local inference & tool execution
│   ├── jarvis_persona.py # Marvel J.A.R.V.I.S. personality & function schemas
│   ├── idock_tools.py    # MQTT bridge for Tasmota & PC Agents
│   └── memory_manager.py # Long-term memory query & update engine
└── web/
    ├── index.html        # Holographic HUD interface
    ├── style.css         # Futuristic obsidian & cyan holographic stylesheet
    ├── visualizer.js     # Web Audio API reactive arc reactor canvas
    └── voice.js          # Speech recognition, wake words & British TTS
```

---

## ⚡ Quick Start

```bash
# 1. Navigate to the project directory
cd /home/rishal/Jarvis

# 2. Launch J.A.R.V.I.S.
./start.sh
```

Then open your browser at **[http://localhost:8000](http://localhost:8000)**.

- Say **"Jarvis"** or click the glowing central Arc Reactor core.
- You will hear the Stark HUD chime and J.A.R.V.I.S. will acknowledge: *"At your service, sir."*
- Give any voice command or type into the HUD console.

---

## 🔄 Scaling Up Local Models

To upgrade to a larger model anytime:

```bash
ollama pull qwen2.5:7b
# or
ollama pull llama3.2:3b
```

Update `"model": "qwen2.5:7b"` inside `config.json` and restart `./start.sh`.
