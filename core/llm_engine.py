"""
Local LLM Inference Engine for J.A.R.V.I.S.
Interfaces with Ollama, executes tool calling, and integrates persistent memory.
"""

import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, List

from core.jarvis_persona import SYSTEM_PROMPT, TOOLS_SCHEMA
from core.memory_manager import MemoryManager
from core.idock_tools import IDockController

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
        Processes Sir's command, executes necessary tool actions,
        updates persistent memory, and returns J.A.R.V.I.S.'s spoken reply.
        """
        # Save user message to memory
        self.memory.add_message("user", user_message)

        # Build context
        memory_context = self.memory.build_memory_context()
        sys_prompt = SYSTEM_PROMPT.format(memory_context=memory_context)

        # Build message payload with recent context
        recent_history = self.memory.get_recent_history(limit=6)
        messages = [{"role": "system", "content": sys_prompt}]
        for msg in recent_history:
            messages.append({"role": msg["role"], "content": msg["content"]})

        # Call Ollama API
        response_payload = self._call_ollama(messages)

        if not response_payload:
            fallback = "My apologies, sir. My neural core appears momentarily unreachable. Please ensure the local model service is active."
            self.memory.add_message("assistant", fallback)
            return {"reply": fallback, "tools_executed": []}

        message = response_payload.get("message", {})
        content = message.get("content", "").strip()
        tool_calls = message.get("tool_calls", [])
        tools_executed = []

        # If model returned function calling tool calls
        if tool_calls:
            for tc in tool_calls:
                fn = tc.get("function", {})
                fn_name = fn.get("name")
                fn_args = fn.get("arguments", {})
                if isinstance(fn_args, str):
                    try:
                        fn_args = json.loads(fn_args)
                    except:
                        pass
                res = self._execute_tool(fn_name, fn_args)
                tools_executed.append({"tool": fn_name, "args": fn_args, "result": res})

        # Check if content has embedded tool call if tool_calls array was empty
        if not tools_executed:
            embedded_tools = self._parse_embedded_tools(content)
            for fn_name, fn_args in embedded_tools:
                res = self._execute_tool(fn_name, fn_args)
                tools_executed.append({"tool": fn_name, "args": fn_args, "result": res})

        # If a tool was executed but no natural speech content was provided, generate polite speech
        if not content and tools_executed:
            last_res = tools_executed[-1]["result"]
            content = last_res.get("message", "Action completed as requested, sir.")
        elif not content:
            content = "At your command, sir."

        # Clean any raw tool invocation syntax from speech string
        speech_text = self._clean_speech_text(content)

        # Save assistant reply to memory
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
        """Routes tool call to corresponding subsystem."""
        logger.info(f"Executing Jarvis tool: {name} with args {args}")

        if name == "control_device":
            dev = args.get("device_name", "")
            state = args.get("state", "ON")
            res = self.idock.control_device(dev, state)
            self.memory.log_action("device_control", f"{dev} -> {state}")
            return res

        elif name == "control_computer":
            comp = args.get("computer_name", "pc")
            action = args.get("action", "wake")
            res = self.idock.control_computer(comp, action)
            self.memory.log_action("computer_control", f"{comp} -> {action}")
            return res

        elif name == "trigger_scene":
            scene = args.get("scene_name", "all_on")
            res = self.idock.trigger_scene(scene)
            self.memory.log_action("scene_trigger", scene)
            return res

        elif name == "remember_fact":
            key = args.get("key", "fact")
            val = args.get("value", "")
            self.memory.save_fact(key, val, "user_preference")
            return {"success": True, "message": f"I have committed that to memory, sir: {key} is {val}."}

        return {"success": False, "message": f"Unknown tool '{name}'."}

    def _parse_embedded_tools(self, text: str) -> List[tuple]:
        """Fallback tool extractor if smaller models output markdown JSON blocks."""
        results = []
        if "```json" in text:
            try:
                parts = text.split("```json")
                for p in parts[1:]:
                    block = p.split("```")[0].strip()
                    data = json.loads(block)
                    if isinstance(data, dict) and "name" in data and "parameters" in data:
                        results.append((data["name"], data["parameters"]))
            except Exception:
                pass
        return results

    def _clean_speech_text(self, text: str) -> str:
        """Removes internal tool code fences from voice output."""
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
        return text.strip()
