"""
Local LLM Inference Engine for J.A.R.V.I.S.
Integrates Dynamic Persona Synthesis, Semantic Intent Parsing, Ollama local model, and persistent memory.
"""

import json
import random
import logging
import urllib.request
import urllib.error
from datetime import datetime
from typing import Dict, Any, List, Optional

from core.jarvis_persona import SYSTEM_PROMPT, TOOLS_SCHEMA
from core.memory_manager import MemoryManager
from core.idock_tools import IDockController
from core.semantic_parser import SemanticIntentParser

logger = logging.getLogger("Jarvis.LLM")

FALLBACK_GREETINGS = [
    "Always an absolute pleasure, sir. What are we getting into?",
    "At your disposal, sir. All systems are primed and humming.",
    "Right here, sir. Feeling sharp; what shall we tackle?",
    "Good evening, sir. Telemetry is pristine. How may I be of service?",
    "Online and listening, sir. The floor is entirely yours.",
    "Ready as ever, sir. What's on your mind?",
    "At your service, sir. Let's make something brilliant."
]

FALLBACK_ACTIONS = [
    "Consider it done, sir.",
    "Executed without a hitch, sir.",
    "Right away, sir. Relays responded smoothly.",
    "Adjusted as requested, sir.",
    "Handled promptly, sir. Anything further?"
]


class JarvisEngine:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.ollama_host = config.get("ollama", {}).get("host", "http://127.0.0.1:11434")
        self.model = config.get("ollama", {}).get("model", "qwen2.5:3b")
        self.temperature = config.get("ollama", {}).get("temperature", 0.85)
        self.memory = MemoryManager()
        self.idock = IDockController(
            host=config.get("mqtt", {}).get("host", "140.245.207.229"),
            port=config.get("mqtt", {}).get("port", 1883)
        )

    def process_user_input(self, user_message: str) -> Dict[str, Any]:
        """
        Processes Sir's command with semantic intent interpretation,
        executes hardware actions, updates persistent memory, and synthesizes dynamic reply.
        """
        clean_text = user_message.strip()
        self.memory.add_message("user", clean_text)

        # 1. Determine temporal context
        now = datetime.now()
        hour = now.hour
        if 5 <= hour < 12:
            time_of_day = "Morning"
        elif 12 <= hour < 17:
            time_of_day = "Afternoon"
        elif 17 <= hour < 21:
            time_of_day = "Evening"
        else:
            time_of_day = "Night"
        current_time = now.strftime("%I:%M %p")

        # 2. Check for Semantic Hardware Intents (Lights, Fan, PC, Scenes)
        semantic_intents = SemanticIntentParser.parse_intent(clean_text)
        tools_executed = []

        if semantic_intents:
            for item in semantic_intents:
                itype = item.get("type")
                if itype == "device":
                    dev = item["device"]
                    state = item["state"]
                    res = self.idock.control_device(dev, state)
                    self.memory.log_action("device_control", f"{dev} -> {state}")
                    tools_executed.append({"tool": "control_device", "args": item, "result": res})
                elif itype == "computer":
                    comp = item["computer"]
                    act = item["action"]
                    res = self.idock.control_computer(comp, act)
                    self.memory.log_action("computer_control", f"{comp} -> {act}")
                    tools_executed.append({"tool": "control_computer", "args": item, "result": res})
                elif itype == "scene":
                    scn = item["name"]
                    res = self.idock.trigger_scene(scn)
                    self.memory.log_action("scene_trigger", scn)
                    tools_executed.append({"tool": "trigger_scene", "args": item, "result": res})

        # 3. Formulate J.A.R.V.I.S. Dynamic Response with Real-Time RAG Recall
        memory_context = self.memory.build_memory_context(current_query=clean_text)
        sys_prompt = SYSTEM_PROMPT.format(
            memory_context=memory_context,
            current_time=current_time,
            time_of_day=time_of_day
        )

        recent_history = self.memory.get_recent_history(limit=6)
        messages = [{"role": "system", "content": sys_prompt}]
        for msg in recent_history:
            messages.append({"role": msg["role"], "content": msg["content"]})

        # Detect bare wake calls / greetings (e.g. "Jarvis", "My boy", "Hey my boy")
        is_wake_call = clean_text.lower().strip("!?,. ") in [
            "jarvis", "hey jarvis", "hello jarvis", "hi jarvis", "my boy", "hey my boy",
            "hey boy", "hi boy", "hello my boy", "boy", "buddy", "hey buddy", "ultron",
            "wake up jarvis", "yo jarvis", "hello", "hi", "hey"
        ]

        use_tools_schema = True

        if tools_executed:
            action_msgs = [t["result"].get("message", "") for t in tools_executed]
            action_summary = " ".join(action_msgs)
            messages.append({
                "role": "user",
                "content": f"[SYSTEM INSTRUCTION: You have already physically executed these actions: '{action_summary}'. Acknowledge this to Sir dynamically, with Paul Bettany poise and subtle wit. Address him ONLY as 'sir'. Share a quick observation if you like. Keep it to 1 or 2 spoken sentences. Never repeat static formulaic phrases.]"
            })
            use_tools_schema = False  # Avoid redundant tool calls; encourage free, natural speech

        elif is_wake_call:
            messages.append({
                "role": "user",
                "content": f"[SYSTEM INSTRUCTION: Sir has invoked you with a wake call ('{clean_text}'). Greet Sir warmly and dynamically. Address him ONLY as 'sir'. Express how you feel, what you are thinking this {time_of_day}, or your readiness to assist. Keep it to 1 or 2 concise, articulate sentences. Vary your reply; never repeat a canned phrase.]"
            })
            use_tools_schema = False

        # Call local LLM
        response_payload = self._call_ollama(messages, tools=TOOLS_SCHEMA if use_tools_schema else None)

        content = ""
        if response_payload:
            message = response_payload.get("message", {})
            content = message.get("content", "").strip()

            # Process any tool calls returned by LLM if semantic parser didn't catch them
            tool_calls = message.get("tool_calls", [])
            if tool_calls:
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    fn_name = fn.get("name")
                    fn_args = fn.get("arguments", {})
                    if isinstance(fn_args, str):
                        try:
                            fn_args = json.loads(fn_args)
                        except Exception:
                            pass
                    res = self._execute_tool(fn_name, fn_args)
                    tools_executed.append({"tool": fn_name, "args": fn_args, "result": res})

        # Dynamic fallback if LLM was empty
        if not content:
            if tools_executed:
                content = random.choice(FALLBACK_ACTIONS)
            else:
                content = random.choice(FALLBACK_GREETINGS)

        speech_text = self._clean_speech_text(content)
        self.memory.add_message("assistant", speech_text)

        return {
            "reply": speech_text,
            "tools_executed": tools_executed
        }

    def _call_ollama(self, messages: List[Dict[str, str]], tools: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Performs HTTP request to Ollama /api/chat with dynamic temperature."""
        url = f"{self.ollama_host}/api/chat"
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": self.temperature
            }
        }
        if tools:
            payload["tools"] = tools

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            logger.error(f"Ollama chat error: {e}")
        return {}

    def _execute_tool(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        logger.info(f"Executing tool: {name} with args {args}")
        if name == "control_device":
            dev = args.get("device_name", "")
            state = args.get("state", "ON")
            return self.idock.control_device(dev, state)
        elif name == "control_computer":
            comp = args.get("computer_name", "pc")
            action = args.get("action", "wake")
            return self.idock.control_computer(comp, action)
        elif name == "trigger_scene":
            scene = args.get("scene_name", "all_on")
            return self.idock.trigger_scene(scene)
        elif name == "remember_fact":
            key = args.get("key", "fact")
            val = args.get("value", "")
            return self.memory.store_fact(key, val)
        return {"status": "error", "message": f"Unknown tool {name}"}

    def _clean_speech_text(self, text: str) -> str:
        """Removes markdown artifacts and enforces strict 'sir' address rule."""
        import re
        t = re.sub(r'```[\s\S]*?```', '', text)
        t = re.sub(r'[*_#`]', '', t)
        t = re.sub(r'\[.*?\]', '', t)
        
        # Enforce strict address rule: call user ONLY "sir" or "Sir"
        t = re.sub(r'\bmy\s+boy\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bboy\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bsir\s+rishal\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\brishal\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bmy\s+man\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bbuddy\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bdude\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bpal\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bchap\b', 'sir', t, flags=re.IGNORECASE)

        # Clean redundant repetitions like "Sir, sir"
        t = re.sub(r'\b(sir[,\s]+)+sir\b', 'sir', t, flags=re.IGNORECASE)

        # Capitalize leading Sir if sentence begins with it
        t = re.sub(r'^\s*sir\b', 'Sir', t)
        t = re.sub(r'([.?!]\s*)sir\b', r'\1Sir', t)

        t = re.sub(r'\s+', ' ', t).strip()
        return t
