import io
import os
import wave
import time
import logging
import asyncio

logger = logging.getLogger("JarvisTTS")

class JarvisTTS:
    """Ultra-fast local neural TTS engine for J.A.R.V.I.S."""
    def __init__(self, piper_model_path: str = "/home/rishal/Jarvis/models/piper/en_GB-alan-medium.onnx"):
        self.piper_model_path = piper_model_path
        self.piper_voice = None
        self._init_piper()

    def _init_piper(self):
        if os.path.exists(self.piper_model_path):
            try:
                from piper.voice import PiperVoice
                t0 = time.time()
                self.piper_voice = PiperVoice.load(self.piper_model_path)
                logger.info(f"Loaded Piper voice model in {(time.time() - t0)*1000:.1f}ms: {self.piper_model_path}")
            except Exception as e:
                logger.error(f"Failed to load Piper model: {e}")
                self.piper_voice = None
        else:
            logger.warning(f"Piper model not found at {self.piper_model_path}")

    def synthesize_piper_wav(self, text: str, speed_scale: float = 0.80) -> bytes:
        """Synthesizes text to WAV bytes in ~70-90ms with brisk, crisp British cadence (length_scale=0.80)."""
        if not self.piper_voice:
            raise RuntimeError("Piper voice model is not initialized.")
        
        from piper.config import SynthesisConfig
        syn_config = SynthesisConfig(length_scale=speed_scale)
        clean_text = text.replace("*", "").replace("#", "").strip()
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as wav_file:
            self.piper_voice.synthesize_wav(clean_text, wav_file, syn_config=syn_config)
        return buf.getvalue()

    async def synthesize_edge_mp3(self, text: str) -> bytes:
        """Synthesizes using Microsoft Edge Neural en-GB-RyanNeural at faster speed (+20%)."""
        import edge_tts
        clean_text = text.replace("*", "").replace("#", "").strip()
        communicate = edge_tts.Communicate(clean_text, "en-GB-RyanNeural", pitch="-1Hz", rate="+20%")
        buf = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.extend(chunk["data"])
        return bytes(buf)

# Global singleton
tts_engine = JarvisTTS()
