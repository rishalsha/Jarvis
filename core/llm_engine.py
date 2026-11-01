"""
Local LLM Inference Engine for J.A.R.V.I.S.
Integrates Multi-Step ReAct Agent Loop, Dynamic Persona Synthesis, System Agency,
Semantic Intent Parsing, Ollama local model, and persistent memory.
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
from core.system_tools import SystemTools

logger = logging.getLogger("Jarvis.LLM")

FALLBACK_GREETINGS = [
    "At your service, sir. How can I assist you?",
    "Good evening, sir. How may I help?",
    "Online and standing by, sir.",
    "At your disposal, sir.",
    "Right here, sir. How can I assist you?"
]

FALLBACK_ACTIONS = [
    "Consider it done, sir.",
    "Executed, sir.",
    "Right away, sir.",
    "Completed as requested, sir.",
    "Handled promptly, sir."
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
        Processes Sir's command using an autonomous multi-step ReAct agent loop:
        1. Fast-path semantic intent handling for instant hardware control.
        2. RAG memory retrieval & temporal prompt formation.
        3. Multi-turn Tool calling cycle (read telemetry, read/write files, shell commands, IoT).
        4. Synthesizes concise British gentleman voice response.
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
        messages: List[Dict[str, Any]] = [{"role": "system", "content": sys_prompt}]
        for msg in recent_history:
            messages.append({"role": msg["role"], "content": msg["content"]})

        # Detect bare wake calls / greetings
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
                "content": f"[SYSTEM INSTRUCTION: You have already physically executed: '{action_summary}'. Give a direct, proper 1-sentence confirmation to Sir and stop. Do NOT add small talk, commentary about the night, rhetorical questions, or extra filler. Address Sir ONLY as 'sir'. Example: 'The room light is on, sir.']"
            })
            use_tools_schema = False

        elif is_wake_call:
            messages.append({
                "role": "user",
                "content": f"[SYSTEM INSTRUCTION: Sir has called your name ('{clean_text}'). Acknowledge Sir with a crisp, polite 1-sentence greeting and ask how you can help, then stop. Address Sir ONLY as 'sir'. Do NOT add small talk or commentary about the night. Example: 'Good evening, sir. How can I assist you?']"
            })
            use_tools_schema = False

        # 4. Multi-Turn ReAct Agent Execution Loop
        max_turns = 4
        turn = 0
        content = ""

        while turn < max_turns:
            turn += 1
            response_payload = self._call_ollama(messages, tools=TOOLS_SCHEMA if use_tools_schema else None)
            if not response_payload:
                break

            message = response_payload.get("message", {})
            tool_calls = message.get("tool_calls", [])

            if not tool_calls:
                # Agent reached a direct verbal conclusion
                content = message.get("content", "").strip()
                break

            # The agent decided to invoke one or more tools
            messages.append(message)
            for tc in tool_calls:
                fn = tc.get("function", {})
                fn_name = fn.get("name")
                fn_args = fn.get("arguments", {})
                if isinstance(fn_args, str):
                    try:
                        fn_args = json.loads(fn_args)
                    except Exception:
                        pass

                logger.info(f"Agent Loop [Turn {turn}]: Calling '{fn_name}' with args {fn_args}")
                tool_result = self._execute_tool(fn_name, fn_args)
                tools_executed.append({"tool": fn_name, "args": fn_args, "result": tool_result})

                # Build tool observation message for Ollama
                tool_msg: Dict[str, Any] = {
                    "role": "tool",
                    "name": fn_name,
                    "content": json.dumps(tool_result) if isinstance(tool_result, (dict, list)) else str(tool_result)
                }
                if "id" in tc:
                    tool_msg["tool_call_id"] = tc["id"]
                messages.append(tool_msg)

        # Dynamic fallback if LLM response was empty
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

    def _call_ollama(self, messages: List[Dict[str, Any]], tools: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Performs HTTP request to Ollama /api/chat with dynamic temperature."""
        url = f"{self.ollama_host}/api/chat"
        payload: Dict[str, Any] = {
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
        try:
            # System Agency Tools
            if name == "get_system_telemetry":
                return SystemTools.get_system_telemetry()
            elif name == "read_file":
                path = args.get("path", "")
                start_line = args.get("start_line", 1)
                max_lines = args.get("max_lines", 100)
                return SystemTools.read_file(path, start_line=start_line, max_lines=max_lines)
            elif name == "write_file":
                path = args.get("path", "")
                content = args.get("content", "")
                overwrite = args.get("overwrite", True)
                res = SystemTools.write_file(path, content, overwrite=overwrite)
                self.memory.log_action("file_write", path)
                return res
            elif name == "list_directory":
                path = args.get("path", ".")
                return SystemTools.list_directory(path)
            elif name == "execute_bash":
                cmd = args.get("command", "")
                res = SystemTools.execute_bash(cmd)
                self.memory.log_action("shell_execution", cmd)
                return res
            elif name == "manage_application":
                action = args.get("action", "launch")
                app_name = args.get("app_name", "")
                res = SystemTools.manage_application(action, app_name)
                self.memory.log_action("app_management", f"{action} {app_name}")
                return res
            elif name == "control_system_audio":
                action = args.get("action", "volume_up")
                val = args.get("value")
                return SystemTools.control_system_audio(action, val)

            # IoT & Relays
            elif name == "control_device":
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
        except Exception as e:
            logger.error(f"Error executing tool {name}: {e}")
            return {"status": "error", "message": str(e)}

        return {"status": "error", "message": f"Unknown tool {name}"}

    def _clean_speech_text(self, text: str) -> str:
        """Removes markdown artifacts, code blocks, and enforces strict 'sir' address rule."""
        import re
        t = re.sub(r'```[\s\S]*?```', '', text)
        t = re.sub(r'[*_#`]', '', t)
        t = re.sub(r'\[.*?\]', '', t)
        
        # Enforce strict address rule: call user vocatively ONLY "sir" or "Sir"
        t = re.sub(r'\bmy\s+boy\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bboy\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bsir\s+rishal\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\b(hello|hi|hey|good\s+morning|good\s+evening|good\s+afternoon),\s*rishal\b', r'\1, sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bmy\s+man\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bbuddy\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bdude\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bpal\b', 'sir', t, flags=re.IGNORECASE)
        t = re.sub(r'\bchap\b', 'sir', t, flags=re.IGNORECASE)

        # Remove unsolicited atmospheric fluff or rhetorical commentary about the night or time
        night_patterns = [
            r'[,.]?\s*quite\s+the\s+night[^.?!]*[.?!]?',
            r'[,.]?\s*a\s+quiet\s+night[^.?!]*[.?!]?',
            r'[,.]?\s*the\s+night\s+(?:whispers|is\s+young|unfolds|deepens|is\s+calm|is\s+peaceful|is\s+quiet|beckons)[^.?!]*[.?!]?',
            r'[,.]?\s*(?:isn\'t\s+it|is\s+it\s+not)\??',
            r'[,.]?\s*what\s+a\s+(?:quiet\s+)?night[^.?!]*[.?!]?',
        ]
        for pattern in night_patterns:
            t = re.sub(pattern, '.', t, flags=re.IGNORECASE)

        # Clean redundant repetitions like "Sir, sir"
        t = re.sub(r'\b(sir[,\s]+)+sir\b', 'sir', t, flags=re.IGNORECASE)

        # Capitalize leading Sir if sentence begins with it
        t = re.sub(r'^\s*sir\b', 'Sir', t)
        t = re.sub(r'([.?!]\s*)sir\b', r'\1Sir', t)

        # Clean up repeated punctuation and extra spaces
        t = re.sub(r'\.\s*\.+', '.', t)
        t = re.sub(r'\s+([,.:?!])', r'\1', t)
        t = re.sub(r'\s+', ' ', t).strip()
        return t
