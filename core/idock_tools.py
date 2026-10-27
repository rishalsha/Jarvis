"""
iDock Hardware & IoT Control Tool for J.A.R.V.I.S.
Handles MQTT communication with Tasmota relays, ESP32 WoL, and PC Agents.
"""

import json
import socket
import logging
import paho.mqtt.client as mqtt

logger = logging.getLogger("Jarvis.iDock")

# Device mapping
DEVICES = {
    "fan": {"topic": "cmnd/room_light/POWER1", "name": "Room Fan"},
    "room_fan": {"topic": "cmnd/room_light/POWER1", "name": "Room Fan"},
    "ceiling_fan": {"topic": "cmnd/room_light/POWER1", "name": "Room Fan"},
    "light": {"topic": "cmnd/room_light/POWER2", "name": "Room Light"},
    "room_light": {"topic": "cmnd/room_light/POWER2", "name": "Room Light"},
    "main_light": {"topic": "cmnd/room_light/POWER2", "name": "Room Light"},
    "bulb": {"topic": "cmnd/room_light/POWER3", "name": "Desk Bulb"},
    "room_bulb": {"topic": "cmnd/room_light/POWER3", "name": "Desk Bulb"},
    "desk_bulb": {"topic": "cmnd/room_light/POWER3", "name": "Desk Bulb"},
}

COMPUTERS = {
    "desktop_pc": {
        "name": "Desktop PC",
        "mac": "04:7c:16:b7:5e:96",
        "topic": "desktop_pc/action",
        "state_topic": "desktop_pc/state"
    },
    "pc": {
        "name": "Desktop PC",
        "mac": "04:7c:16:b7:5e:96",
        "topic": "desktop_pc/action",
        "state_topic": "desktop_pc/state"
    },
    "desktop": {
        "name": "Desktop PC",
        "mac": "04:7c:16:b7:5e:96",
        "topic": "desktop_pc/action",
        "state_topic": "desktop_pc/state"
    },
    "work_laptop": {
        "name": "Work Laptop",
        "mac": "30:e3:a4:8e:ff:ee",
        "topic": "work_laptop/action",
        "state_topic": "work_laptop/state"
    },
    "laptop": {
        "name": "Work Laptop",
        "mac": "30:e3:a4:8e:ff:ee",
        "topic": "work_laptop/action",
        "state_topic": "work_laptop/state"
    }
}


class IDockController:
    def __init__(self, host="140.245.207.229", port=1883):
        self.host = host
        self.port = port
        self.client = None
        self.connected = False
        self.device_states = {"fan": "UNKNOWN", "light": "UNKNOWN", "bulb": "UNKNOWN"}
        self._init_mqtt()

    def _init_mqtt(self):
        try:
            self.client = mqtt.Client(client_id="jarvis_idock_controller")
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message
            self.client.connect_async(self.host, self.port, 60)
            self.client.loop_start()
        except Exception as e:
            logger.error(f"Failed to connect MQTT: {e}")

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.connected = True
            logger.info("Connected to iDock MQTT broker.")
            # Subscribe to device state updates
            client.subscribe("stat/room_light/+")
            client.subscribe("+/state")
            # Query initial power states
            client.publish("cmnd/room_light/POWER0", "")
        else:
            logger.error(f"MQTT connect returned error code: {rc}")

    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        logger.warning("Disconnected from iDock MQTT broker.")

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        payload = msg.payload.decode('utf-8', errors='ignore')
        if topic == "stat/room_light/POWER1":
            self.device_states["fan"] = payload
        elif topic == "stat/room_light/POWER2":
            self.device_states["light"] = payload
        elif topic == "stat/room_light/POWER3":
            self.device_states["bulb"] = payload

    def control_device(self, device_name: str, state: str) -> dict:
        """Control smart home accessories: fan, light, or bulb (state: ON, OFF, TOGGLE)."""
        key = device_name.lower().strip().replace(" ", "_")
        dev = DEVICES.get(key)
        if not dev:
            # Fuzzy match
            for k, d in DEVICES.items():
                if k in key or key in k:
                    dev = d
                    break

        if not dev:
            return {"success": False, "message": f"I could not locate an accessory named '{device_name}', sir."}

        action_state = state.upper()
        if action_state in ["TURN ON", "START", "ACTIVATE", "ENABLE"]:
            action_state = "ON"
        elif action_state in ["TURN OFF", "STOP", "DEACTIVATE", "DISABLE"]:
            action_state = "OFF"

        try:
            self.client.publish(dev["topic"], action_state)
            return {
                "success": True,
                "device": dev["name"],
                "state": action_state,
                "message": f"{dev['name']} has been powered {action_state.lower()}, sir."
            }
        except Exception as e:
            return {"success": False, "message": f"Hardware error communicating with {dev['name']}: {e}"}

    def control_computer(self, computer_name: str, action: str) -> dict:
        """Control PC or Laptop: wake (Wake-on-LAN), sleep, or shutdown."""
        key = computer_name.lower().strip().replace(" ", "_")
        comp = COMPUTERS.get(key)
        if not comp:
            for k, c in COMPUTERS.items():
                if k in key or key in k:
                    comp = c
                    break

        if not comp:
            return {"success": False, "message": f"Workstation '{computer_name}' is not recognized in system specs, sir."}

        action = action.lower().strip()

        if action in ["wake", "turn_on", "power_on", "boot", "start"]:
            # Send WoL magic packet via local UDP broadcast & ESP32 MQTT relay
            mac = comp["mac"]
            self._send_udp_wol(mac)
            self.client.publish("cmnd/esp32_wol/wake", mac)
            self.client.publish("cmnd/room_light/wake", mac)
            return {
                "success": True,
                "computer": comp["name"],
                "action": "wake",
                "message": f"Transmitting Wake-on-LAN magic packet to {comp['name']} now, sir."
            }

        elif action in ["sleep", "suspend", "hibernate"]:
            payload = json.dumps({"action": "suspend"})
            self.client.publish(comp["topic"], payload)
            return {
                "success": True,
                "computer": comp["name"],
                "action": "sleep",
                "message": f"Instructing {comp['name']} to enter sleep mode, sir."
            }

        elif action in ["shutdown", "power_off", "turn_off"]:
            payload = json.dumps({"action": "shutdown"})
            self.client.publish(comp["topic"], payload)
            return {
                "success": True,
                "computer": comp["name"],
                "action": "shutdown",
                "message": f"Initiating system shutdown sequence for {comp['name']}, sir."
            }

        return {"success": False, "message": f"Unsupported action '{action}' for workstation {comp['name']}, sir."}

    def trigger_scene(self, scene_name: str) -> dict:
        """Trigger predefined atmosphere presets (e.g. all_on, all_off, night_mode)."""
        scene = scene_name.lower().strip()
        if "all" in scene and ("on" in scene or "wake" in scene):
            self.control_device("fan", "ON")
            self.control_device("light", "ON")
            self.control_device("bulb", "ON")
            self.control_computer("pc", "wake")
            return {"success": True, "message": "All room systems and workstations are being activated, sir."}

        elif "all" in scene and ("off" in scene or "shutdown" in scene):
            self.control_device("fan", "OFF")
            self.control_device("light", "OFF")
            self.control_device("bulb", "OFF")
            self.control_computer("pc", "sleep")
            return {"success": True, "message": "Powering down all room accessories and placing systems into standby, sir."}

        elif "night" in scene or "sleep" in scene or "bedtime" in scene:
            self.control_device("light", "OFF")
            self.control_device("bulb", "OFF")
            self.control_device("fan", "ON")
            self.control_computer("pc", "sleep")
            return {"success": True, "message": "Night atmosphere engaged. Lights dimmed and fan kept active for your comfort, sir."}

        return {"success": False, "message": f"Scene preset '{scene_name}' is not configured, sir."}

    def _send_udp_wol(self, mac_address: str):
        try:
            clean_mac = mac_address.replace(":", "").replace("-", "")
            if len(clean_mac) != 12:
                return
            mac_bytes = bytes.fromhex(clean_mac)
            magic_packet = b"\xff" * 6 + mac_bytes * 16
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.sendto(magic_packet, ("255.255.255.255", 9))
            sock.close()
        except Exception as e:
            logger.warning(f"UDP WoL error: {e}")
