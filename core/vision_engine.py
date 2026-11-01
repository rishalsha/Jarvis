"""
J.A.R.V.I.S. Visual Cortex & Screen Perception Engine
Combines Wayland/Hyprland capture (grim), high-accuracy local OCR (tesseract),
and local Vision-Language Models (Moondream/LLaVA via Ollama) to give J.A.R.V.I.S. real-time sight.
"""

import os
import json
import base64
import logging
import subprocess
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

logger = logging.getLogger("Jarvis.VisionEngine")


class VisionEngine:
    def __init__(self, model_name: Optional[str] = None, host: Optional[str] = None):
        config_path = os.path.join(os.path.dirname(__file__), "..", "config.json")
        cfg = {}
        if os.path.exists(config_path):
            try:
                with open(config_path, "r") as f:
                    cfg = json.load(f)
            except Exception:
                pass

        self.model = model_name or cfg.get("vision", {}).get("model", "moondream")
        self.host = (host or cfg.get("ollama", {}).get("host", "http://127.0.0.1:11434")).rstrip("/")

    def get_active_window_info(self) -> Dict[str, Any]:
        """Queries Hyprland IPC for the currently focused window geometry and metadata."""
        try:
            res = subprocess.check_output(["hyprctl", "activewindow", "-j"], text=True, timeout=2)
            data = json.loads(res)
            return {
                "title": data.get("title", ""),
                "class": data.get("class", ""),
                "at": data.get("at", [0, 0]),
                "size": data.get("size", [1920, 1080])
            }
        except Exception as e:
            logger.debug(f"Hyprland active window lookup note: {e}")
            return {"title": "Desktop", "class": "Root", "at": [0, 0], "size": [1920, 1080]}

    def capture_frame(self, target: str = "screen") -> Optional[str]:
        """
        Captures a frame using grim.
        target='window' or target='active_window': captures specifically the focused application.
        target='screen': captures the entire primary display.
        """
        out_path = f"/tmp/jarvis_frame_{os.getpid()}.jpg"
        try:
            if target in ["window", "active_window"]:
                win = self.get_active_window_info()
                at = win.get("at", [0, 0])
                size = win.get("size", [1920, 1080])
                geo = f"{at[0]},{at[1]} {size[0]}x{size[1]}"
                cmd = ["grim", "-g", geo, "-t", "jpeg", "-q", "80", out_path]
            else:
                cmd = ["grim", "-t", "jpeg", "-q", "80", out_path]

            subprocess.run(cmd, check=True, timeout=4)
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                return out_path
            return None
        except Exception as e:
            logger.error(f"Failed to capture frame: {e}")
            return None

    def extract_ocr_text(self, img_path: str, max_chars: int = 1500) -> str:
        """Runs fast local Tesseract OCR to extract verbatim text, code, or terminal output."""
        try:
            res = subprocess.check_output(
                ["tesseract", img_path, "stdout"],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=4
            ).strip()
            # Clean empty lines
            lines = [line.strip() for line in res.splitlines() if line.strip()]
            cleaned = "\n".join(lines)
            if len(cleaned) > max_chars:
                return cleaned[:max_chars] + "\n...[truncated]..."
            return cleaned
        except Exception as e:
            logger.debug(f"OCR extraction note: {e}")
            return ""

    def query_vlm(self, img_path: str, prompt: str) -> str:
        """Sends frame to local Vision-Language Model in Ollama (Moondream/LLaVA)."""
        try:
            with open(img_path, "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode("utf-8")

            payload = {
                "model": self.model,
                "prompt": prompt,
                "images": [img_b64],
                "stream": False
            }

            url = f"{self.host}/api/generate"
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )

            with urllib.request.urlopen(req, timeout=25) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data.get("response", "").strip()
        except Exception as e:
            logger.error(f"VLM inference error: {e}")
        return ""

    def inspect_screen(self, query: str = "Describe what is on my screen", target: str = "screen") -> Dict[str, Any]:
        """
        High-level vision perception method for JARVIS.
        Combines active window detection, OCR verbatim text, and VLM visual understanding.
        """
        win_info = self.get_active_window_info()
        img_path = self.capture_frame(target=target)

        if not img_path or not os.path.exists(img_path):
            return {
                "success": False,
                "message": "Optical sensors failed to grab screen frame, sir."
            }

        try:
            # 1. Verbatim Text / Code extraction
            ocr_text = self.extract_ocr_text(img_path)

            # 2. Semantic Visual Layout Analysis via VLM
            vlm_prompt = (
                f"Describe what is displayed on the screen clearly and concisely. "
                f"Focus on the main applications, windows, and content."
            )
            if query and "describe" not in query.lower():
                vlm_prompt = query

            visual_summary = self.query_vlm(img_path, vlm_prompt)

            # Clean up temp file
            try:
                os.remove(img_path)
            except Exception:
                pass

            return {
                "success": True,
                "target": target,
                "focused_app": win_info.get("class", ""),
                "window_title": win_info.get("title", ""),
                "visual_summary": visual_summary or "Screen frame analyzed.",
                "visible_text_ocr": ocr_text if ocr_text else "(No readable text detected)"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Visual processing error: {e}"
            }


# Global singleton instance
vision_engine = VisionEngine()
