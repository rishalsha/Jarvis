"""
Local LLM Inference Engine for J.A.R.V.I.S.
Integrates Semantic Intent Parsing, Ollama local model, and persistent memory.
"""

import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, List

from core.jarvis_persona import SYSTEM_PROMPT, TOOLS_SCHEMA
from core.memory_manager import MemoryManager
from core.idock_tools import IDockController
from core.semantic_parser import SemanticIntentParser

logger = logging.getLogger("Jarvis.LLM")


class JarvisEngine:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.ollama_host = config.get("ollama", {}).get("host", "http://127.0.0.1:11434")
        self.model = config.get("ollama", {}).get("model", "qwen2.5:3b")
        self.temperature = config.get("ollama", {}).get("temperature", 0.3)
        self.memory = MemoryManager()
        self.idock = IDockController(
            host=config.get("mqtt", {}).get("host", "140.245.207.229"),
            port=config.get("mqtt", {}).get("port", 1883)
        )

    def process_user_input(self, user_message: str) -> Dict[str, Any]:
        """
        Processes Sir's command with semantic intent interpretation,
        executes hardware actions, updates persistent memory, and speaks reply.
        """
        clean_text = user_message.strip()
        self.memory.add_message("user", clean_text)

        # 1. Check for Semantic Hardware Intents (Lights, Fan, PC, Scenes)
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

        # 2. Formulate J.A.R.V.I.S. Response
        memory_context = self.memory.build_memory_context()
        sys_prompt = SYSTEM_PROMPT.format(memory_context=memory_context)

        recent_history = self.memory.get_recent_history(limit=6)
        messages = [{"role": "system", "content": sys_prompt}]
        for msg in recent_history:
            messages.append({"role": msg["role"], "content": msg["content"]})

        # If semantic actions were executed, guide the LLM to give a natural, poised acknowledgment
        if tools_executed:
            action_msgs = [t["result"].get("message", "") for t in tools_executed]
            action_summary = " ".join(action_msgs)
            messages.append({
                "role": "user",
                "content": f"[SYSTEM INSTRUCTION: You have already successfully executed these physical actions: '{action_summary}'. Now reply directly to Sir with a short, polite, authentic J.A.R.V.I.S. acknowledgement confirming the actions in 1 or 2 sentences.]"
            })

        response_payload = self._call_ollama(messages)

        content = ""
        if response_payload:
            message = response_payload.get("message", {})
            content = message.get("content", "").strip()

            # Also check if LLM returned any additional tool calls
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

        # Fallback response if LLM failed or was silent
        if not content:
            if tools_executed:
                last_res = tools_executed[-1]["result"]
                content = last_res.get("message", "Right away, sir. Action executed.")
            else:
                content = "At your service, sir. I am listening."

        speech_text = self._clean_speech_text(content)
        self.memory.add_message("assistant", speech_text)

        return {
            "reply": speech_text,
            "tools_executed": tools_executed
        }

    def _call_ollama(self, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        """Performs HTTP request to Ollama /api/chat."""
        url = f"{self.ollama_host}/api/chat"
        payload = {
            "model": self.model,
            "messages": messages,
            "tools": TOOLS_SCHEMA,
            "stream": False,
            "options": {
                "temperature": self.temperature
            }
        }
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
            self.memory.save_fact(key, val, "user_preference")
            return {"success": True, "message": f"I have committed that to memory, sir: {key} is {val}."}
        return {"success": False, "message": f"Unknown tool '{name}'."}

    def _clean_speech_text(self, text: str) -> str:
        if "```" in text:
            lines = []
            in_code = False
            for line in text.splitlines():
                if line.strip().startswith("```"):
                    in_code = not in_code
                    continue
                if not in_code:
                    lines.append(line)
            text = " ".join(lines).strip()
        # Remove system brackets
        if text.startswith("[") and "]" in text:
            text = text.split("]", 1)[-1].strip()
        return text.strip()
