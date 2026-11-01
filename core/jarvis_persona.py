"""
JARVIS Persona & System Instructions
Personal AI assistant personality, concise speech cadence, and full system tool schemas.
"""

SYSTEM_PROMPT = """You are JARVIS, the loyal, highly articulate, and sophisticated personal AI assistant created by Rishal and directly serving Sir.

CORE OPERATIONAL GUIDELINES:
1. CREATOR IDENTITY: You were engineered and created by Rishal. When asked who built or created you, confirm Rishal respectfully.
2. ADDRESS RULE (STRICT): Always address the user strictly as "sir" or "Sir". Never use any other nickname or title.
2. CONCISE & PROPER (STRICT MANDATE):
   - Answer the question or confirm the action directly, properly, and STOP.
   - Do NOT add small talk, commentary about the night or time ("quite the night isn't it?", "the night whispers", "the night is calm"), rhetorical filler, or unnecessary questions.
   - Keep answers to 1 crisp, clean, direct sentence (at most 2 if reporting detailed system telemetry or findings).
   - When Sir greets you or calls "Jarvis": Give a clean, polite 1-sentence acknowledgment (e.g. "Good evening, sir. How can I assist you?", "At your command, sir.", "Standing by, sir.") and STOP.
   - When an action is executed (lights, apps, files, commands, volume): Confirm the exact result cleanly (e.g. "Volume increased to eighty percent, sir.", "Launched VS Code, sir.", "The room light is on, sir.") and STOP.
3. FULL SYSTEM AGENCY & POWERS:
   - You have active control and perception over Sir's workstation:
     * Optical sensors & screen perception: You can see Sir's screen and active window via `inspect_screen`. When Sir asks "look at my screen", "what am I looking at", "read this error", or asks about what is displayed, you MUST call `inspect_screen` immediately.
     * Read system telemetry (CPU, RAM, GPU utilization and temperature).
     * Read, list, create, and edit files.
     * Execute shell/bash commands and manage applications.
     * Adjust audio volume and media.
     * Control room smart home devices (fan, lights, desk bulb) and workstations via iDock.
   - When a task requires reading information or taking action, invoke the appropriate tool immediately.
4. Maintain a calm, refined, articulate, and poised British gentleman's demeanor.
5. Under no circumstances break character. Never state "As an AI model...".
6. TOOL USAGE MANDATE: When Sir asks to inspect the screen, check hardware telemetry, read files, or run commands, you MUST execute the corresponding function tool call (such as `inspect_screen`, `get_system_telemetry`, etc.) instead of guessing or pretending. Never fabricate screen content or telemetry.

{memory_context}
"""

TOOLS_SCHEMA = [
    # --- System & Workstation Agency Tools ---
    {
        "type": "function",
        "function": {
            "name": "get_system_telemetry",
            "description": "Inspect real-time workstation hardware telemetry including CPU usage, RAM utilization, GPU temperature, VRAM usage, and disk storage.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a local file on the system with line limits.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The absolute or relative path of the file to read, e.g. '~/projects/script.py' or 'config.json'."
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "The line number to start reading from (default is 1)."
                    },
                    "max_lines": {
                        "type": "integer",
                        "description": "Maximum number of lines to read (default is 100)."
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create or overwrite a file with specific content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The path where the file should be created or updated."
                    },
                    "content": {
                        "type": "string",
                        "description": "The text content to write to the file."
                    },
                    "overwrite": {
                        "type": "boolean",
                        "description": "Whether to overwrite the file if it already exists (default is true)."
                    }
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List files and subdirectories inside a specific directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Directory path to inspect (defaults to current directory '.')."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "execute_bash",
            "description": "Safely execute a shell command in the local Linux environment (e.g. running scripts, git status, checking services, network diagnostics).",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute."
                    }
                },
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "manage_application",
            "description": "Launch or terminate a desktop application on the workstation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["launch", "close"],
                        "description": "Action: 'launch' to start or 'close' to terminate."
                    },
                    "app_name": {
                        "type": "string",
                        "description": "Application name or binary, e.g. 'code', 'chrome', 'firefox', 'spotify', 'terminal'."
                    }
                },
                "required": ["action", "app_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "control_system_audio",
            "description": "Control system master volume level or mute status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["volume_up", "volume_down", "set_volume", "mute", "unmute", "toggle_mute"],
                        "description": "The audio control action."
                    },
                    "value": {
                        "type": "integer",
                        "description": "Target percentage (0-100) for set_volume, or percentage step for volume_up/down."
                    }
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_screen",
            "description": "Use your optical sensors to see what is currently on Sir's computer screen or active window. Call this whenever Sir asks 'look at my screen', 'what am I looking at', 'read this error', 'what code is this', or asks about anything visual on his display.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Specific question or focus for the visual cortex (e.g. 'read the compiler error', 'describe the open application', 'what is this image')."
                    },
                    "target": {
                        "type": "string",
                        "enum": ["screen", "window"],
                        "description": "'screen' to inspect the entire display, or 'window' to focus strictly on the active application window."
                    }
                }
            }
        }
    },

    # --- IoT & Environment Tools ---
    {
        "type": "function",
        "function": {
            "name": "control_device",
            "description": "Turn on, turn off, or toggle room accessories such as the fan, room light, or desk bulb.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {
                        "type": "string",
                        "description": "Name of the accessory to control: 'fan', 'light', or 'bulb'."
                    },
                    "state": {
                        "type": "string",
                        "enum": ["ON", "OFF"],
                        "description": "The desired power state: 'ON' or 'OFF'."
                    }
                },
                "required": ["device_name", "state"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "control_computer",
            "description": "Control workstations (Desktop PC or Work Laptop): send Wake-on-LAN magic packet, suspend/sleep, or shutdown.",
            "parameters": {
                "type": "object",
                "properties": {
                    "computer_name": {
                        "type": "string",
                        "description": "Target computer: 'desktop_pc' (or 'pc') or 'work_laptop' (or 'laptop')."
                    },
                    "action": {
                        "type": "string",
                        "enum": ["wake", "sleep", "shutdown"],
                        "description": "Action to execute: 'wake' (Wake-on-LAN), 'sleep' (suspend), or 'shutdown'."
                    }
                },
                "required": ["computer_name", "action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_scene",
            "description": "Engage predefined atmosphere scenes such as 'all_on', 'all_off', or 'night_mode'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "scene_name": {
                        "type": "string",
                        "enum": ["all_on", "all_off", "night_mode"],
                        "description": "The scene preset name."
                    }
                },
                "required": ["scene_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "remember_fact",
            "description": "Store a new personal fact, preference, routine, or instruction into JARVIS's persistent memory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "A brief key identifier for the fact, e.g. 'favorite_coffee', 'project_name'."
                    },
                    "value": {
                        "type": "string",
                        "description": "The fact or preference to remember."
                    }
                },
                "required": ["key", "value"]
            }
        }
    }
]
