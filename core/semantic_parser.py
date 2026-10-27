"""
Semantic Meaning & Intent Parser for J.A.R.V.I.S.
Extracts real physical intent from natural, colloquial, or fragmented speech.
"""

import re
from typing import Optional, Dict, Any, List


class SemanticIntentParser:
    @staticmethod
    def parse_intent(text: str) -> List[Dict[str, Any]]:
        """
        Parses text and extracts hardware actions based on true semantic meaning.
        Returns a list of actionable commands.
        """
        raw = text.lower().strip()
        # Clean filler phrases (e.g. "hey jarvis", "please", "can you", "could you", "i want you to")
        cleaned = re.sub(r"\b(hey|hello|hi|yo|ok|please|can you|could you|would you|i want you to|just|my boy|buddy)\b", "", raw)
        cleaned = re.sub(r"\bjarvis\b", "", cleaned).strip()

        intents = []

        # -------------------------------------------------------------
        # 1. SCENES & GLOBAL WORKSHOP PRESETS
        # -------------------------------------------------------------
        if any(p in raw for p in ["goodnight", "good night", "going to bed", "bedtime", "heading to sleep", "sleep mode"]):
            intents.append({"type": "scene", "name": "night_mode"})
            return intents

        if any(p in raw for p in ["all off", "turn off everything", "power off all", "everything off", "kill everything", "shut down everything", "shut down workshop"]):
            intents.append({"type": "scene", "name": "all_off"})
            return intents

        if any(p in raw for p in ["all on", "turn on everything", "everything on", "wake everything", "activate everything", "let's work", "start the workshop", "good morning"]):
            intents.append({"type": "scene", "name": "all_on"})
            return intents

        # -------------------------------------------------------------
        # 2. LIGHTS / ROOM ILLUMINATION
        # -------------------------------------------------------------
        # Positive illumination intents: "light up", "turn on light", "make it bright", "too dark", "illuminate", "lights on"
        light_on_triggers = [
            "light up", "illuminate", "too dark", "make it bright", "brighten", "lights on",
            "bring light", "can't see", "cant see"
        ]
        has_light_word = bool(re.search(r"\b(light|lights|room light|main light|ceiling light|illumination)\b", raw))
        has_bulb_word = bool(re.search(r"\b(bulb|desk light|desk bulb|table lamp|reading light|lamp)\b", raw))
        has_turn_on = bool(re.search(r"\b(turn on|switch on|power on|enable|activate|start|on)\b", raw))
        has_turn_off = bool(re.search(r"\b(turn off|switch off|power off|disable|deactivate|kill|stop|off|darken|lights out|extinguish)\b", raw))

        # Room Light ON
        if any(t in raw for t in light_on_triggers) or (has_light_word and has_turn_on and not has_turn_off and not has_bulb_word):
            intents.append({"type": "device", "device": "light", "state": "ON"})
        # Room Light OFF
        elif has_light_word and has_turn_off and not has_bulb_word:
            intents.append({"type": "device", "device": "light", "state": "OFF"})

        # Desk Bulb ON / OFF
        if has_bulb_word and has_turn_on and not has_turn_off:
            intents.append({"type": "device", "device": "bulb", "state": "ON"})
        elif has_bulb_word and has_turn_off:
            intents.append({"type": "device", "device": "bulb", "state": "OFF"})

        # -------------------------------------------------------------
        # 3. FAN / COOLING / VENTILATION
        # -------------------------------------------------------------
        has_fan_word = bool(re.search(r"\b(fan|breeze|cooling|blades|ventilation)\b", raw))
        fan_on_triggers = ["it's hot", "its hot", "hot in here", "warm in here", "cool down the room", "cool down", "spin up the fan", "start the fan"]
        fan_off_triggers = ["it's cold", "its cold", "freezing in here", "turn off the fan", "stop the fan"]

        if any(t in raw for t in fan_on_triggers) or (has_fan_word and has_turn_on and not has_turn_off):
            intents.append({"type": "device", "device": "fan", "state": "ON"})
        elif any(t in raw for t in fan_off_triggers) or (has_fan_word and has_turn_off):
            intents.append({"type": "device", "device": "fan", "state": "OFF"})

        # -------------------------------------------------------------
        # 4. WORKSTATION / PC CONTROLS
        # -------------------------------------------------------------
        has_pc_word = bool(re.search(r"\b(pc|desktop|rig|computer|workstation|machine)\b", raw))
        has_laptop_word = bool(re.search(r"\b(laptop|notebook)\b", raw))

        wake_words = ["wake", "wake up", "boot", "boot up", "turn on", "start up", "fire up", "power on", "bring online", "rev up"]
        sleep_words = ["sleep", "suspend", "nap", "rest", "standby", "put to sleep"]
        shutdown_words = ["shutdown", "shut down", "power off", "kill power", "turn off"]

        # Desktop PC
        if has_pc_word:
            if any(w in raw for w in wake_words):
                intents.append({"type": "computer", "computer": "desktop_pc", "action": "wake"})
            elif any(s in raw for s in sleep_words):
                intents.append({"type": "computer", "computer": "desktop_pc", "action": "sleep"})
            elif any(d in raw for d in shutdown_words):
                intents.append({"type": "computer", "computer": "desktop_pc", "action": "shutdown"})

        # Work Laptop
        if has_laptop_word:
            if any(w in raw for w in wake_words):
                intents.append({"type": "computer", "computer": "work_laptop", "action": "wake"})
            elif any(s in raw for s in sleep_words + shutdown_words):
                intents.append({"type": "computer", "computer": "work_laptop", "action": "sleep"})

        return intents
