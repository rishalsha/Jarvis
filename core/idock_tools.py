"""
iDock Hardware & IoT Control Tool for J.A.R.V.I.S.
Handles MQTT communication with Tasmota relays, ESP32 WoL, and PC Agents.
"""

import json
import socket
import logging
import time
import uuid
import threading
import paho.mqtt.client as mqtt

logger = logging.getLogger("Jarvis.iDock")

DEVICES = {
    "fan": {"channel": "POWER1", "name": "Room Fan"},
    "room_fan": {"channel": "POWER1", "name": "Room Fan"},
    "ceiling_fan": {"channel": "POWER1", "name": "Room Fan"},
    "light": {"channel": "POWER2", "name": "Room Light"},
    "room_light": {"channel": "POWER2", "name": "Room Light"},
    "main_light": {"channel": "POWER2", "name": "Room Light"},
    "bulb": {"channel": "POWER3", "name": "Desk Bulb"},
    "room_bulb": {"channel": "POWER3", "name": "Desk Bulb"},
    "desk_bulb": {"channel": "POWER3", "name": "Desk Bulb"},
}

COMPUTERS = {
    "desktop_pc": {
        "name": "Desktop PC",
        "mac": "04:7c:16:b7:5e:96",
        "topic": "desktop_pc"
    },
    "pc": {
        "name": "Desktop PC",
        "mac": "04:7c:16:b7:5e:96",
        "topic": "desktop_pc"
    },
    "desktop": {
        "name": "Desktop PC",
        "mac": "04:7c:16:b7:5e:96",
        "topic": "desktop_pc"
    },
    "work_laptop": {
        "name": "Work Laptop",
        "mac": "30:e3:a4:8e:ff:ee",
        "topic": "work_laptop"
    },
    "laptop": {
        "name": "Work Laptop",
        "mac": "30:e3:a4:8e:ff:ee",
        "topic": "work_laptop"
    }
}


class IDockController:
    def __init__(self, host="140.245.207.229", port=1883):
        self.host = host
        self.port = port
        self.client_id = f"jarvis_idock_{uuid.uuid4().hex[:8]}"
        self.client = None
        self.connected = False
        self.device_states = {"fan": "UNKNOWN", "light": "UNKNOWN", "bulb": "UNKNOWN"}
        self._init_mqtt()

    def _init_mqtt(self):
        try:
            self.client = mqtt.Client(client_id=self.client_id)
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
            client.subscribe("stat/room_light/+")
            client.subscribe("stat/+/status")
            client.publish("cmnd/room_light/POWER0", "")
        else:
            logger.error(f"MQTT connect returned error code: {rc}")

    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        logger.warning(f"Disconnected from iDock MQTT broker (rc={rc}).")

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
        """Control fan, light, or bulb (state: ON, OFF, TOGGLE)."""
        key = device_name.lower().strip().replace(" ", "_")
        dev = DEVICES.get(key)
        if not dev:
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
            topic = f"cmnd/room_light/{dev['channel']}"
            self.client.publish(topic, action_state)
            logger.info(f"Published MQTT: {topic} -> {action_state}")
            return {
                "success": True,
                "device": dev["name"],
                "state": action_state,
                "message": f"{dev['name']} has been powered {action_state.lower()}, sir."
            }
        except Exception as e:
            return {"success": False, "message": f"Hardware error communicating with {dev['name']}: {e}"}

    def control_computer(self, computer_name: str, action: str) -> dict:
        """Control PC or Laptop: wake, sleep, or shutdown."""
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
        comp_topic = comp["topic"]
        mac = comp["mac"]

        if action in ["wake", "turn_on", "power_on", "boot", "start"]:
            def send_burst():
                # 1. Local UDP broadcast
                self._send_udp_wol(mac)
                # 2. MQTT agent wake topic
                self.client.publish(f"cmnd/{comp_topic}/wake", mac)
                # 3. ESP32 WoL Relay
                self.client.publish("cmnd/esp32_wol/wake", mac)
                # 4. Tasmota WoL (both lowercase and uppercase MAC)
                self.client.publish("cmnd/room_light/WakeOnLan", mac)
                self.client.publish("cmnd/room_light/WakeOnLan", mac.upper())

            # First burst
            send_burst()

            # Second burst in background after 400ms to guarantee packet delivery
            def delayed_burst():
                time.sleep(0.4)
                send_burst()
            threading.Thread(target=delayed_burst, daemon=True).start()

            logger.info(f"Published multi-burst WoL requests for {comp['name']} ({mac})")
            return {
                "success": True,
                "computer": comp["name"],
                "action": "wake",
                "message": f"Transmitting Wake-on-LAN magic packet to {comp['name']} now, sir."
            }

        elif action in ["sleep", "suspend", "hibernate"]:
            topic = f"cmnd/{comp_topic}/power"
            self.client.publish(topic, "sleep")
            logger.info(f"Published MQTT: {topic} -> sleep")
            return {
                "success": True,
                "computer": comp["name"],
                "action": "sleep",
                "message": f"Instructing {comp['name']} to enter sleep mode, sir."
            }

        elif action in ["shutdown", "power_off", "turn_off"]:
            topic = f"cmnd/{comp_topic}/power"
            self.client.publish(topic, "shutdown")
            logger.info(f"Published MQTT: {topic} -> shutdown")
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
        if "night" in scene or "sleep" in scene or "bedtime" in scene:
            self.control_device("light", "OFF")
            self.control_device("bulb", "OFF")
            self.control_device("fan", "ON")
            self.control_computer("pc", "sleep")
            return {"success": True, "message": "Night atmosphere engaged. Lights extinguished, fan active, and workstation resting, sir."}

        elif "all" in scene and ("on" in scene or "wake" in scene):
            self.control_device("fan", "ON")
            self.control_device("light", "ON")
            self.control_device("bulb", "ON")
            self.control_computer("pc", "wake")
            return {"success": True, "message": "All room systems and workstations are being powered on, sir."}

        elif "all" in scene and ("off" in scene or "shutdown" in scene):
            self.control_device("fan", "OFF")
            self.control_device("light", "OFF")
            self.control_device("bulb", "OFF")
            self.control_computer("pc", "sleep")
            return {"success": True, "message": "Powering down all room accessories and placing systems into standby, sir."}

        return {"success": False, "message": f"Scene preset '{scene_name}' is not configured, sir."}

    def _send_udp_wol(self, mac_address: str):
        try:
            clean_mac = bytes.fromhex(mac_address.replace(":", "").replace("-", ""))
            packet = b"\xff" * 6 + clean_mac * 16
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            destinations = [
                ("192.168.1.255", 9),
                ("192.168.1.255", 7),
                ("255.255.255.255", 9),
                ("255.255.255.255", 7),
            ]
            for _ in range(3):
                for addr, port in destinations:
                    sock.sendto(packet, (addr, port))
                time.sleep(0.05)
            sock.close()
        except Exception as e:
            logger.warning(f"UDP WoL error: {e}")
