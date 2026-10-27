/**
 * J.A.R.V.I.S. Continuous Always-Listening Voice Engine & Ultron Reactive HUD
 * Listens 24/7 for wake calls ("Jarvis", "Hey Jarvis", "My boy", "Hey my boy", etc.)
 * Provides real-time Web Audio API sound reactivity and Paul Bettany British TTS.
 */

class JarvisVoiceManager {
  constructor() {
    this.ws = null;
    this.recognition = null;
    this.isListening = true;
    this.isSpeaking = false;
    this.isRecognitionActive = false;
    this.restartTimer = null;
    this.audioCtx = null;
    this.britishVoice = null;
    this.interimDebounceTimer = null;
    this.lastInterimTranscript = '';
    this.lastProcessedText = '';
    this.lastProcessedTime = 0;

    // Wake words regex (Jarvis, my boy, hey my boy, Ultron, buddy, etc.)
    this.wakeWordRegex = /\b(jarvis|hey jarvis|hello jarvis|hi jarvis|ok jarvis|yo jarvis|wake up jarvis|my boy|hey my boy|hey boy|hi boy|hello my boy|boy|buddy|hey buddy|my man|ultron|computer|assistant)\b/i;

    this.initAudioContext();
    this.initWebSocket();
    this.initSpeechSynthesis();
    this.initAlwaysListeningRecognition();
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

    // Harmonic 1: Glass tone (880Hz -> A5)
    const osc1 = this.audioCtx.createOscillator();
    const gain1 = this.audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(this.audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Harmonic 2: Resonant chime (1760Hz -> A6)
    const osc2 = this.audioCtx.createOscillator();
    const gain2 = this.audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760, now + 0.04);
    gain2.gain.setValueAtTime(0.09, now + 0.04);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(this.audioCtx.destination);
    osc2.start(now + 0.04);
    osc2.stop(now + 0.45);
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[+] J.A.R.V.I.S. Neural Stream Connected.');
      this.updateStatus('Neural Core Active // Always Listening for Sir...');
      const chipCore = document.getElementById('chip-core-label');
      if (chipCore) chipCore.innerText = 'NEURAL CORE: ONLINE';
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
      setTimeout(() => this.initWebSocket(), 2500);
    };
  }

  handleServerMessage(data) {
    if (!data) return;

    if (data.type === 'init') {
      const chipIot = document.getElementById('chip-iot-label');
      if (chipIot) {
        chipIot.innerText = data.mqtt_connected ? 'iDOCK IOT: LINKED' : 'iDOCK IOT: CONNECTING';
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
    }
  }

  initSpeechSynthesis() {
    if (!('speechSynthesis' in window)) return;

    const selectVoice = () => {
      const voices = window.speechSynthesis.getVoices();
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
          console.log('[+] Selected J.A.R.V.I.S. Voice:', found.name);
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

  async speakAsJarvis(text) {
    if (!text) return;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch(e) {}
      this.currentAudio = null;
    }

    this.isSpeaking = true;
    this.setUIState('speaking');
    this.initSpeakingCaption(text);

    try {
      // 1. Ultra-fast local neural Piper synthesis (~75ms, sub-100ms response)
      const ttsUrl = `/api/tts?text=${encodeURIComponent(text)}&engine_type=piper`;
      const response = await fetch(ttsUrl);
      if (!response.ok) throw new Error("TTS endpoint error: " + response.status);

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      // Pipe to Web Audio visualizer if available
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      // Word tracking for live speaking captions
      const totalWords = this.speakingWords ? this.speakingWords.length : 1;
      audio.ontimeupdate = () => {
        if (audio.duration && this.speakingWords && this.speakingWords.length > 0) {
          const progress = audio.currentTime / audio.duration;
          const wordIdx = Math.min(Math.floor(progress * totalWords), totalWords - 1);
          const active = this.speakingWords[wordIdx];
          if (active) {
            const prev = document.querySelectorAll('.caption-word.highlight');
            prev.forEach(el => el.classList.remove('highlight'));
            const activeEl = document.getElementById(active.elId);
            if (activeEl) activeEl.classList.add('highlight');
          }
        }
      };

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.isSpeaking = false;
        this.setUIState('idle');
        this.finalizeSpeakingCaption();
        this.scheduleRecognitionRestart(100);
      };

      audio.onerror = (err) => {
        console.warn("Audio playback error, falling back to Web Speech:", err);
        this.fallbackWebSpeech(text);
      };

      await audio.play();

    } catch (e) {
      console.warn("Fast Piper TTS failed or offline, falling back:", e);
      this.fallbackWebSpeech(text);
    }
  }

  fallbackWebSpeech(text) {
    if (!('speechSynthesis' in window) || !text) {
      this.isSpeaking = false;
      this.setUIState('idle');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.britishVoice) {
      utterance.voice = this.britishVoice;
    }

    utterance.lang = 'en-GB';
    utterance.rate = 0.98;   // British deliberate cadence
    utterance.pitch = 0.92;  // Calm, grounded resonance
    utterance.volume = 1.0;

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        this.highlightSpeakingWord(event.charIndex);
      }
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.setUIState('idle');
      this.finalizeSpeakingCaption();
      this.scheduleRecognitionRestart(100);
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.setUIState('idle');
      this.finalizeSpeakingCaption();
      this.scheduleRecognitionRestart(100);
    };

    window.speechSynthesis.speak(utterance);
  }

  initAlwaysListeningRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available in this browser.');
      this.updateStatus('Voice recognition not supported in browser; manual entry active, sir.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true; // Enables live real-time hearing captions!
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isRecognitionActive = true;
      const micBtn = document.getElementById('mic-toggle-btn');
      if (micBtn) micBtn.classList.add('listening');
      const tag = document.getElementById('hearing-live-tag');
      if (tag) {
        tag.innerText = 'LISTENING';
        tag.style.color = '#00f3ff';
      }
    };

    this.recognition.onresult = (event) => {
      if (this.isSpeaking) return; // Ignore audio feedback while Jarvis speaks

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += text + ' ';
        } else {
          interimTranscript += text;
        }
      }

      // Stream live real-time words to caption HUD
      if (interimTranscript) {
        this.updateHearingCaption(interimTranscript, false);
        this.lastInterimTranscript = interimTranscript.trim();

        // FAST-COMMIT: Don't wait 2 seconds for Chrome's sluggish cloud finalizer!
        // As soon as Sir pauses for 450ms, commit the phrase immediately!
        if (this.interimDebounceTimer) clearTimeout(this.interimDebounceTimer);
        this.interimDebounceTimer = setTimeout(() => {
          if (this.lastInterimTranscript && !this.isSpeaking) {
            const textToProcess = this.lastInterimTranscript;
            this.lastInterimTranscript = '';
            this.updateHearingCaption(textToProcess, true);
            this.handleCapturedSpeech(textToProcess);
          }
        }, 450);
      }

      // When the browser finalizes the phrase
      if (finalTranscript.trim()) {
        if (this.interimDebounceTimer) clearTimeout(this.interimDebounceTimer);
        this.lastInterimTranscript = '';
        const clean = finalTranscript.trim();
        this.updateHearingCaption(clean, true);
        this.handleCapturedSpeech(clean);
      }
    };

    this.recognition.onerror = (e) => {
      if (e.error !== 'no-speech') {
        console.warn('Speech Recognition notice:', e.error);
      }
      if (e.error === 'network') {
        this.scheduleRecognitionRestart(300);
      }
    };

    this.recognition.onend = () => {
      this.isRecognitionActive = false;
      const tag = document.getElementById('hearing-live-tag');
      if (tag && !this.isSpeaking) {
        tag.innerText = 'RECONNECTING';
        tag.style.color = 'rgba(0, 243, 255, 0.5)';
      }
      if (!this.isSpeaking) {
        this.scheduleRecognitionRestart(50);
      }
    };

    // Watchdog heartbeat: auto-revive recognition if Chrome drops it
    setInterval(() => {
      if (!this.isSpeaking && !this.isRecognitionActive) {
        this.startContinuousListening();
      }
    }, 2000);

    // Auto-boot on first user gesture
    const startMic = () => {
      this.startContinuousListening();
      if (visualizer) visualizer.initMicAudio();
      window.removeEventListener('click', startMic);
      window.removeEventListener('keydown', startMic);
    };
    window.addEventListener('click', startMic);
    window.addEventListener('keydown', startMic);
  }

  handleCapturedSpeech(transcript) {
    if (!transcript) return;
    const clean = transcript.trim();
    if (!clean) return;

    // Deduplication guard: ignore duplicate triggers within 2.0s
    const now = Date.now();
    if (this.lastProcessedText.toLowerCase() === clean.toLowerCase() && (now - this.lastProcessedTime) < 2000) {
      return;
    }
    this.lastProcessedText = clean;
    this.lastProcessedTime = now;

    console.log('[*] Fast Speech Captured:', clean);

    const lower = clean.toLowerCase();
    const match = lower.match(this.wakeWordRegex);

    if (match) {
      this.playJarvisChime();
      this.setUIState('listening');

      const matchedPhrase = match[0];
      let remainingCommand = clean.substring(match.index + matchedPhrase.length).replace(/^[,.\s]+/, '').trim();

      if (remainingCommand.length > 1) {
        this.sendUserSpeech(remainingCommand);
      } else {
        this.setUIState('listening');
        this.speakAsJarvis("At your service, sir. I am listening.");
      }
    } else {
      this.sendUserSpeech(clean);
    }
  }

  updateHearingCaption(text, isFinal) {
    const box = document.getElementById('caption-hearing-text');
    const card = document.getElementById('hearing-card');
    const tag = document.getElementById('hearing-live-tag');

    if (!box) return;

    if (card) card.classList.add('active');

    if (isFinal) {
      box.innerHTML = `<span class="caption-speech" style="color: #ffffff; font-weight: 600;">"${escapeHtml(text)}"</span>`;
      if (tag) {
        tag.innerText = 'CAPTURED';
        tag.style.color = '#30d158';
        tag.style.borderColor = '#30d158';
      }
      setTimeout(() => {
        if (card) card.classList.remove('active');
        if (tag) {
          tag.innerText = 'LISTENING';
          tag.style.color = '#00f3ff';
          tag.style.borderColor = 'rgba(0, 243, 255, 0.3)';
        }
      }, 2000);
    } else {
      box.innerHTML = `<span class="caption-speech" style="color: #00f3ff;">"${escapeHtml(text)}</span><span class="interim-cursor"></span>"`;
      if (tag) {
        tag.innerText = 'HEARING...';
        tag.style.color = '#00f3ff';
      }
    }
  }

  initSpeakingCaption(text) {
    const box = document.getElementById('caption-speaking-text');
    const card = document.getElementById('speaking-card');
    const tag = document.getElementById('speaking-live-tag');

    if (!box) return;
    if (card) card.classList.add('speaking-active');
    if (tag) {
      tag.innerText = 'TRANSMITTING';
      tag.style.color = '#00f3ff';
      tag.style.borderColor = '#00f3ff';
    }

    // Split text into word spans with char indices for live highlight
    this.speakingWords = [];
    let html = '"';
    let currentIdx = 0;
    const words = text.split(/(\s+)/);

    words.forEach((chunk, i) => {
      if (/\S/.test(chunk)) {
        html += `<span class="caption-word" id="sword-${this.speakingWords.length}">${escapeHtml(chunk)}</span>`;
        this.speakingWords.push({ index: currentIdx, elId: `sword-${this.speakingWords.length}` });
      } else {
        html += chunk;
      }
      currentIdx += chunk.length;
    });
    html += '"';

    box.innerHTML = html;
  }

  highlightSpeakingWord(charIndex) {
    if (!this.speakingWords) return;
    // Find closest word
    let activeId = null;
    for (let w of this.speakingWords) {
      if (charIndex >= w.index) {
        activeId = w.elId;
      } else {
        break;
      }
    }
    if (activeId) {
      // Remove previous highlights
      const prev = document.querySelectorAll('.caption-word.highlight');
      prev.forEach(el => el.classList.remove('highlight'));
      const activeEl = document.getElementById(activeId);
      if (activeEl) activeEl.classList.add('highlight');
    }
  }

  finalizeSpeakingCaption() {
    const card = document.getElementById('speaking-card');
    const tag = document.getElementById('speaking-live-tag');
    if (card) card.classList.remove('speaking-active');
    if (tag) {
      tag.innerText = 'STANDBY';
      tag.style.color = 'rgba(0, 243, 255, 0.7)';
      tag.style.borderColor = 'rgba(0, 243, 255, 0.3)';
    }
    const prev = document.querySelectorAll('.caption-word.highlight');
    prev.forEach(el => el.classList.remove('highlight'));
  }

  scheduleRecognitionRestart(delayMs) {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.startContinuousListening();
    }, delayMs);
  }

  startContinuousListening() {
    if (!this.recognition || this.isSpeaking || this.isRecognitionActive) return;
    try {
      this.recognition.start();
    } catch (e) {
      if (e.name !== 'InvalidStateError') {
        console.warn('Recognition start notice:', e.message);
      }
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
    const coreText = document.getElementById('core-text');
    const coreSub = document.getElementById('core-sub');
    const marker = document.getElementById('status-marker');

    if (coreBtn) {
      coreBtn.className = 'core-trigger-btn state-' + state;
    }

    if (state === 'listening') {
      if (coreText) coreText.innerText = 'ULTRON';
      if (coreSub) coreSub.innerText = 'HEARING YOU';
      if (marker) marker.style.color = '#00f3ff';
      this.updateStatus('Hearing your voice, sir...');
    } else if (state === 'thinking') {
      if (coreText) coreText.innerText = 'J.A.R.V.I.S.';
      if (coreSub) coreSub.innerText = 'EXECUTING';
      if (marker) marker.style.color = '#ffaa00';
      this.updateStatus('Interpreting semantic intent & executing actions, sir...');
    } else if (state === 'speaking') {
      if (coreText) coreText.innerText = 'J.A.R.V.I.S.';
      if (coreSub) coreSub.innerText = 'SPEAKING';
      if (marker) marker.style.color = '#00f3ff';
      this.updateStatus('Transmitting response to Sir...');
    } else {
      if (coreText) coreText.innerText = 'J.A.R.V.I.S.';
      if (coreSub) coreSub.innerText = 'ALWAYS LISTENING';
      if (marker) marker.style.color = '#00f3ff';
      this.updateStatus('Always Listening // Call "Jarvis" or "My boy" anytime, sir.');
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
        this.playJarvisChime();
        this.setUIState('listening');
        if (visualizer) visualizer.initMicAudio();
        this.startContinuousListening();
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('DOMContentLoaded', () => {
  window.jarvisVoice = new JarvisVoiceManager();
});
