/**
 * J.A.R.V.I.S. Voice Recognition, Speech Synthesis & WebSocket Controller
 * Implements Paul Bettany British voice modulation, Marvel HUD chimes, and wake-word detection.
 */

class JarvisVoiceManager {
  constructor() {
    this.ws = null;
    this.recognition = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.wakeWords = ["jarvis", "hey jarvis", "ok jarvis"];
    this.audioCtx = null;
    this.britishVoice = null;

    this.initAudioContext();
    this.initWebSocket();
    this.initSpeechSynthesis();
    this.initSpeechRecognition();
    this.initClock();
    this.initUI();
  }

  initAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      this.audioCtx = new AudioCtx();
    }
  }

  /**
   * Synthesizes authentic Stark Industries HUD glass chime (dual harmonic frequency)
   */
  playJarvisChime() {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const now = this.audioCtx.currentTime;

    // Harmonic 1: High glass tone (880Hz -> A5)
    const osc1 = this.audioCtx.createOscillator();
    const gain1 = this.audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(this.audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Harmonic 2: Resonant chime (1760Hz -> A6)
    const osc2 = this.audioCtx.createOscillator();
    const gain2 = this.audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760, now + 0.05);
    gain2.gain.setValueAtTime(0.08, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(this.audioCtx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.45);
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to J.A.R.V.I.S. neural stream.');
      this.updateStatus('Neural Core Online // Ready, sir.');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = jsonParseSafe(event.data);
        this.handleServerMessage(data);
      } catch (e) {
        console.error('WS Parse Error:', e);
      }
    };

    this.ws.onclose = () => {
      this.updateStatus('Reconnecting to neural stream...');
      setTimeout(() => this.initWebSocket(), 3000);
    };
  }

  handleServerMessage(data) {
    if (!data) return;

    if (data.type === 'init') {
      const chipIot = document.getElementById('chip-iot-label');
      if (chipIot && data.mqtt_connected) {
        chipIot.innerText = 'iDOCK IOT: LINKED';
      }
    } else if (data.type === 'state_change') {
      this.setUIState(data.state);
      if (data.user_text) {
        this.appendTranscript('Sir', data.user_text);
      }
    } else if (data.type === 'jarvis_speech') {
      const reply = data.reply || 'At your command, sir.';
      this.appendTranscript('J.A.R.V.I.S.', reply);
      this.speakAsJarvis(reply);

      // If tools were executed, update IoT indicators
      if (data.tools && data.tools.length > 0) {
        data.tools.forEach(t => {
          console.log('Action complete:', t);
        });
      }
    }
  }

  initSpeechSynthesis() {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported in this browser.');
      return;
    }

    const selectVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // Search for British male voices to match Paul Bettany's cadence
      const preferred = [
        'Google UK English Male',
        'en-GB-Neural2-B',
        'Daniel',
        'Oliver',
        'Arthur',
        'en-GB'
      ];

      for (let p of preferred) {
        const found = voices.find(v => v.name.includes(p) || (v.lang === 'en-GB' && v.name.toLowerCase().includes('male')));
        if (found) {
          this.britishVoice = found;
          console.log('Selected J.A.R.V.I.S. voice:', found.name);
          break;
        }
      }
      if (!this.britishVoice) {
        this.britishVoice = voices.find(v => v.lang.startsWith('en-GB')) || voices[0];
      }
    };

    selectVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = selectVoice;
    }
  }

  speakAsJarvis(text) {
    if (!('speechSynthesis' in window) || !text) return;

    window.speechSynthesis.cancel(); // Stop any pending speech
    this.isSpeaking = true;
    this.setUIState('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.britishVoice) {
      utterance.voice = this.britishVoice;
    }

    // Paul Bettany voice modulation parameters
    utterance.lang = 'en-GB';
    utterance.rate = 0.98;   // Measured, deliberate British cadence
    utterance.pitch = 0.92;  // Slightly deeper, calm resonance
    utterance.volume = 1.0;

    utterance.onend = () => {
      this.isSpeaking = false;
      this.setUIState('idle');
    };

    utterance.onerror = (err) => {
      console.error('Speech synthesis error:', err);
      this.isSpeaking = false;
      this.setUIState('idle');
    };

    window.speechSynthesis.speak(utterance);
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available in this browser.');
      this.updateStatus('Voice input not supported; manual input enabled, sir.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      const micBtn = document.getElementById('mic-toggle-btn');
      if (micBtn) micBtn.classList.add('listening');
    };

    this.recognition.onresult = (event) => {
      if (this.isSpeaking) return; // Don't transcribe Jarvis's own voice

      const lastIdx = event.results.length - 1;
      const transcript = event.results[lastIdx][0].transcript.trim();
      const lower = transcript.toLowerCase();

      console.log('Voice heard:', transcript);

      // Check for wake word invocation or active conversation
      const hasWakeWord = this.wakeWords.some(w => lower.includes(w));

      if (hasWakeWord) {
        this.playJarvisChime();
        let cleanedCommand = transcript;
        // Strip wake word from command if command followed immediately
        for (let w of this.wakeWords) {
          if (lower.startsWith(w)) {
            cleanedCommand = transcript.substring(w.length).replace(/^[,.\s]+/, '');
            break;
          }
        }

        if (cleanedCommand.length > 1) {
          this.sendUserSpeech(cleanedCommand);
        } else {
          // Just said "Jarvis"
          this.setUIState('listening');
          this.speakAsJarvis("At your service, sir. How may I assist you?");
        }
      } else if (this.isListening) {
        // Continuous input mode
        this.sendUserSpeech(transcript);
      }
    };

    this.recognition.onerror = (e) => {
      console.warn('Speech recognition status:', e.error);
    };

    this.recognition.onend = () => {
      // Auto-restart continuous listening unless stopped
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {}
      }
    };

    // Auto-start listening on first user interaction
    const startOnce = () => {
      this.startListening();
      if (visualizer) visualizer.initMicAudio();
      window.removeEventListener('click', startOnce);
      window.removeEventListener('keydown', startOnce);
    };
    window.addEventListener('click', startOnce);
    window.addEventListener('keydown', startOnce);
  }

  startListening() {
    if (!this.recognition) return;
    try {
      this.recognition.start();
      this.isListening = true;
      this.updateStatus('Awaiting Sir\'s invocation ("Jarvis")...');
    } catch (e) {}
  }

  stopListening() {
    if (!this.recognition) return;
    this.isListening = false;
    this.recognition.stop();
    const micBtn = document.getElementById('mic-toggle-btn');
    if (micBtn) micBtn.classList.remove('listening');
  }

  toggleListening() {
    if (this.isListening) {
      this.stopListening();
      this.updateStatus('Microphone standby, sir.');
    } else {
      this.startListening();
      this.playJarvisChime();
      if (visualizer) visualizer.initMicAudio();
    }
  }

  sendUserSpeech(text) {
    if (!text || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'user_speech',
      text: text
    }));
  }

  setUIState(state) {
    if (visualizer) visualizer.setState(state);

    const coreBtn = document.getElementById('core-trigger-btn');
    const coreSub = document.getElementById('core-sub');
    const marker = document.getElementById('status-marker');

    if (coreBtn) {
      coreBtn.className = 'core-trigger-btn state-' + state;
    }

    if (state === 'listening') {
      if (coreSub) coreSub.innerText = 'LISTENING';
      if (marker) marker.style.color = '#00f3ff';
      this.updateStatus('Hearing your voice, sir...');
    } else if (state === 'thinking') {
      if (coreSub) coreSub.innerText = 'PROCESSING';
      if (marker) marker.style.color = '#ffaa00';
      this.updateStatus('Processing neural logic and executing actions, sir...');
    } else if (state === 'speaking') {
      if (coreSub) coreSub.innerText = 'SPEAKING';
      if (marker) marker.style.color = '#00f3ff';
      this.updateStatus('J.A.R.V.I.S. transmitting response...');
    } else {
      if (coreSub) coreSub.innerText = 'STANDBY';
      if (marker) marker.style.color = '#00f3ff';
      this.updateStatus('Awaiting Sir\'s invocation ("Jarvis")...');
    }
  }

  appendTranscript(speaker, text) {
    const box = document.getElementById('transcript-box');
    if (!box) return;
    box.innerHTML = `
      <div class="hud-log-entry">
        <span class="speaker-tag">${speaker}:</span>
        <span class="speech-content">${text}</span>
      </div>
    `;
  }

  updateStatus(text) {
    const el = document.getElementById('status-text');
    if (el) el.innerText = text;
  }

  initClock() {
    const timeEl = document.getElementById('hud-time');
    const dateEl = document.getElementById('hud-date');

    const update = () => {
      const now = new Date();
      if (timeEl) {
        timeEl.innerText = now.toLocaleTimeString('en-US', { hour12: false });
      }
      if (dateEl) {
        const options = { weekday: 'short', month: 'short', day: 'numeric' };
        dateEl.innerText = `${now.toLocaleDateString('en-US', options).toUpperCase()} // SIR RISHAL`;
      }
    };
    update();
    setInterval(update, 1000);
  }

  initUI() {
    const coreBtn = document.getElementById('core-trigger-btn');
    if (coreBtn) {
      coreBtn.onclick = () => {
        this.playJarvisChime();
        this.setUIState('listening');
        this.speakAsJarvis("Yes, sir? I am listening.");
        if (visualizer) visualizer.initMicAudio();
      };
    }

    const micBtn = document.getElementById('mic-toggle-btn');
    if (micBtn) {
      micBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleListening();
      };
    }
  }
}

function sendQuickText(text) {
  if (window.jarvisVoice) {
    window.jarvisVoice.playJarvisChime();
    window.jarvisVoice.sendUserSpeech(text);
  }
}

function handleFormSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('command-input');
  if (!input) return;
  const val = input.value.trim();
  if (val && window.jarvisVoice) {
    window.jarvisVoice.sendUserSpeech(val);
    input.value = '';
  }
}

function jsonParseSafe(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

// Global voice manager instance
window.addEventListener('DOMContentLoaded', () => {
  window.jarvisVoice = new JarvisVoiceManager();
});
