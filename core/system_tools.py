"""
J.A.R.V.I.S. System Tools & Desktop Actuators
Allows J.A.R.V.I.S. to read system telemetry, inspect files, execute safe bash commands,
launch/close applications, control system audio, and modify files.
"""

import os
import re
import shlex
import psutil
import logging
import subprocess
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger("Jarvis.SystemTools")

# Blacklisted dangerous shell patterns to protect the host OS
COMMAND_BLACKLIST = [
    r"\brm\s+-[rf]{1,2}\s+/\b",
    r"\bmkfs\b",
    r"\bdd\s+if=",
    r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;",  # fork bomb
    r">(\s*)/dev/sd[a-z]",
    r"\bshutdown\s+-h\s+now\b",
    r"\binit\s+0\b",
]

class SystemTools:
    @staticmethod
    def get_system_telemetry() -> Dict[str, Any]:
        """Collects real-time hardware telemetry: CPU, RAM, Disk, and GPU stats."""
        try:
            cpu_pct = psutil.cpu_percent(interval=0.1)
            cpu_count = psutil.cpu_count(logical=True)
            vmem = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            gpu_data = None
            try:
                smi = subprocess.check_output(
                    ['nvidia-smi', '--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
                    text=True,
                    timeout=3
                ).strip()
                if smi:
                    parts = [p.strip() for p in smi.split(',')]
                    if len(parts) >= 5:
                        gpu_data = {
                            "model": parts[0],
                            "temperature_c": int(parts[1]),
                            "utilization_pct": int(parts[2]),
                            "vram_used_mb": int(parts[3]),
                            "vram_total_mb": int(parts[4]),
                        }
            except Exception as e:
                gpu_data = f"Unavailable: {e}"

            # Check battery if available
            battery = None
            if hasattr(psutil, "sensors_battery"):
                b = psutil.sensors_battery()
                if b:
                    battery = {
                        "percent": b.percent,
                        "power_plugged": b.power_plugged,
                        "secsleft": b.secsleft
                    }

            return {
                "status": "success",
                "cpu": {
                    "usage_percent": cpu_pct,
                    "logical_cores": cpu_count
                },
                "memory": {
                    "used_gb": round(vmem.used / (1024**3), 2),
                    "total_gb": round(vmem.total / (1024**3), 2),
                    "percent": vmem.percent
                },
                "disk": {
                    "used_gb": round(disk.used / (1024**3), 2),
                    "total_gb": round(disk.total / (1024**3), 2),
                    "percent": disk.percent
                },
                "gpu": gpu_data,
                "battery": battery,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
        except Exception as e:
            logger.error(f"Error fetching telemetry: {e}")
            return {"status": "error", "message": str(e)}

    @staticmethod
    def read_file(path: str, start_line: int = 1, max_lines: int = 100) -> Dict[str, Any]:
        """Safely reads the contents of a local file with line limits."""
        try:
            expanded_path = os.path.abspath(os.path.expanduser(path))
            if not os.path.exists(expanded_path):
                return {"status": "error", "message": f"File does not exist: {path}"}
            if os.path.isdir(expanded_path):
                return {"status": "error", "message": f"Path is a directory, not a file: {path}"}

            with open(expanded_path, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()

            total_lines = len(lines)
            start_idx = max(0, start_line - 1)
            end_idx = min(total_lines, start_idx + max_lines)
            selected_lines = lines[start_idx:end_idx]

            formatted_content = "".join([f"{start_idx + i + 1}: {line}" for i, line in enumerate(selected_lines)])

            return {
                "status": "success",
                "path": expanded_path,
                "total_lines": total_lines,
                "start_line": start_line,
                "returned_lines": len(selected_lines),
                "content": formatted_content
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @staticmethod
    def write_file(path: str, content: str, overwrite: bool = True) -> Dict[str, Any]:
        """Creates or updates a file on disk."""
        try:
            expanded_path = os.path.abspath(os.path.expanduser(path))
            parent_dir = os.path.dirname(expanded_path)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)

            if os.path.exists(expanded_path) and not overwrite:
                return {"status": "error", "message": f"File already exists and overwrite is False: {path}"}

            with open(expanded_path, "w", encoding="utf-8") as f:
                f.write(content)

            return {
                "status": "success",
                "path": expanded_path,
                "bytes_written": len(content.encode("utf-8")),
                "message": f"File written successfully to {expanded_path}"
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @staticmethod
    def list_directory(path: str = ".", max_items: int = 40) -> Dict[str, Any]:
        """Lists files and directories inside a specified directory."""
        try:
            expanded_path = os.path.abspath(os.path.expanduser(path))
            if not os.path.exists(expanded_path):
                return {"status": "error", "message": f"Directory does not exist: {path}"}
            if not os.path.isdir(expanded_path):
                return {"status": "error", "message": f"Path is not a directory: {path}"}

            items = []
            for entry in os.scandir(expanded_path):
                try:
                    is_dir = entry.is_dir()
                    size = 0 if is_dir else entry.stat().st_size
                    items.append({
                        "name": entry.name,
                        "type": "directory" if is_dir else "file",
                        "size_bytes": size
                    })
                except Exception:
                    continue

            # Sort directories first, then alphabetical
            items.sort(key=lambda x: (0 if x["type"] == "directory" else 1, x["name"].lower()))
            total_items = len(items)

            return {
                "status": "success",
                "directory": expanded_path,
                "total_items": total_items,
                "items": items[:max_items]
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @staticmethod
    def execute_bash(command: str, timeout: int = 15) -> Dict[str, Any]:
        """Safely executes a shell command in the local environment and captures stdout/stderr."""
        clean_cmd = command.strip()
        if not clean_cmd:
            return {"status": "error", "message": "Empty command."}

        # Check safety blacklist
        for pattern in COMMAND_BLACKLIST:
            if re.search(pattern, clean_cmd, re.IGNORECASE):
                logger.warning(f"Blocked dangerous command: {clean_cmd}")
                return {
                    "status": "error",
                    "message": "Security Alert: Command rejected by safety policy."
                }

        try:
            logger.info(f"Executing bash command: {clean_cmd}")
            proc = subprocess.run(
                clean_cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout,
                cwd=os.path.expanduser("~")
            )

            stdout_trimmed = proc.stdout[:2000] if proc.stdout else ""
            stderr_trimmed = proc.stderr[:1000] if proc.stderr else ""

            return {
                "status": "success" if proc.returncode == 0 else "failed",
                "exit_code": proc.returncode,
                "stdout": stdout_trimmed,
                "stderr": stderr_trimmed
            }
        except subprocess.TimeoutExpired:
            return {
                "status": "timeout",
                "message": f"Command timed out after {timeout} seconds."
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }

    @staticmethod
    def manage_application(action: str, app_name: str) -> Dict[str, Any]:
        """Launches or terminates a desktop application (e.g. code, google-chrome, firefox, spotify)."""
        clean_app = app_name.strip().lower()
        if not clean_app:
            return {"status": "error", "message": "No application specified."}

        # Common aliases
        app_aliases = {
            "chrome": "google-chrome-stable",
            "vscode": "code",
            "vs code": "code",
            "terminal": "x-terminal-emulator",
            "files": "nautilus",
            "file manager": "nautilus",
            "browser": "google-chrome-stable"
        }
        cmd_name = app_aliases.get(clean_app, clean_app)

        try:
            if action in ["launch", "open", "start"]:
                # Detached background launch
                subprocess.Popen(
                    shlex.split(cmd_name),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True
                )
                return {
                    "status": "success",
                    "message": f"Application '{cmd_name}' initiated, sir."
                }
            elif action in ["kill", "close", "stop"]:
                # Terminate processes matching the name
                killed = 0
                for proc in psutil.process_iter(['name', 'cmdline']):
                    try:
                        p_name = proc.info.get('name') or ''
                        p_cmd = " ".join(proc.info.get('cmdline') or [])
                        if clean_app in p_name.lower() or clean_app in p_cmd.lower():
                            proc.terminate()
                            killed += 1
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

                return {
                    "status": "success",
                    "message": f"Closed {killed} instances of '{clean_app}', sir."
                }
            else:
                return {"status": "error", "message": f"Unsupported action: {action}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @staticmethod
    def control_system_audio(action: str, value: Optional[int] = None) -> Dict[str, Any]:
        """Controls system sound volume and mute status via pactl."""
        try:
            if action == "volume_up":
                step = value or 5
                subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"+{step}%"], check=True)
                return {"status": "success", "message": f"Volume increased by {step}%, sir."}
            elif action == "volume_down":
                step = value or 5
                subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"-{step}%"], check=True)
                return {"status": "success", "message": f"Volume decreased by {step}%, sir."}
            elif action == "set_volume":
                vol = min(150, max(0, value if value is not None else 50))
                subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{vol}%"], check=True)
                return {"status": "success", "message": f"Master volume set to {vol}%, sir."}
            elif action in ["mute", "unmute", "toggle_mute"]:
                arg = "1" if action == "mute" else ("0" if action == "unmute" else "toggle")
                subprocess.run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", arg], check=True)
                return {"status": "success", "message": f"Audio mute toggled, sir."}
            else:
                return {"status": "error", "message": f"Unknown audio action {action}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @staticmethod
    def inspect_screen(query: str = "Describe what is on my screen", target: str = "screen") -> Dict[str, Any]:
        """
        Activates J.A.R.V.I.S.'s visual cortex. Captures the primary display or focused window,
        extracts verbatim text with local OCR, and understands visual content with a local vision model.
        """
        try:
            from core.vision_engine import vision_engine
            return vision_engine.inspect_screen(query=query, target=target)
        except Exception as e:
            logger.error(f"Error in inspect_screen tool: {e}")
            return {"status": "error", "message": f"Optical sensor failure: {e}"}
