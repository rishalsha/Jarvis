/**
 * J.A.R.V.I.S. Voice Engine, Intelligent Pause Detection & Voice Interruption (Barge-In)
 * - Master Mic Mute/Unmute by tapping the central Ultron Arc Reactor.
 * - Listens until Sir actually finishes speaking (1100ms natural pause detection or isFinal).
 * - Instant Voice Interruption (Barge-In): Stops J.A.R.V.I.S. speech immediately when Sir starts talking.
 * - Live Dual-Channel Captions (Hearing & Speaking).
 */

class JarvisVoiceManager {
  constructor() {
    this.ws = null;
    this.recognition = null;
    this.isListening = true;
    this.isSpeaking = false;
    this.isRecognitionActive = false;
    this.isMicMuted = false;
    this.restartTimer = null;
    this.audioCtx = null;
    this.britishVoice = null;
    this.currentAudio = null;
    this.interimDebounceTimer = null;
    this.lastInterimTranscript = '';
    this.lastProcessedText = '';
    this.lastProcessedTime = 0;
    this.speakingWords = [];
    this.accumulatedSpeech = '';
    this.speechDispatchTimer = null;
    this.speakingWatchdog = null;
    this.lastSpokenText = '';
    this.recentSpokenHistory = [];
    this.echoGuardUntil = 0;
    this.activeConversationUntil = 0;

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
   * Synthesizes authentic HUD glass chime (dual harmonic frequency)
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

  /**
   * Mute Tone: Subdued low-frequency electrical power-down chirp
   */
  playMuteTone() {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.26);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * Interruption Chime: Subtle click when Sir cuts in
   */
  playInterruptionChime() {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.1);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Master Mic Toggle: Touching the Ultron Arc Reactor mutes/unmutes the microphone
   */
  toggleMicMute() {
    this.isMicMuted = !this.isMicMuted;

    if (this.isMicMuted) {
      this.cancelSpeakingAudio();
      this.playMuteTone();
      if (this.recognition) {
        try { this.recognition.abort(); } catch(e) {}
      }
      this.isRecognitionActive = false;
      this.setUIState('muted');

      const tag = document.getElementById('hearing-live-tag');
      if (tag) {
        tag.innerText = 'MUTED';
        tag.style.color = '#ff3b30';
        tag.style.borderColor = '#ff3b30';
      }
      this.updateStatus('Ultron Core Muted. Tap Ultron to activate microphone, sir.');
    } else {
      this.playJarvisChime();
      this.setUIState('listening');

      const tag = document.getElementById('hearing-live-tag');
      if (tag) {
        tag.innerText = 'LISTENING';
        tag.style.color = '#00f3ff';
        tag.style.borderColor = 'rgba(0, 243, 255, 0.3)';
      }
      this.updateStatus('Ultron Active // Always listening for Sir. Tap Ultron to mute.');
      if (visualizer) visualizer.initMicAudio();
      this.startContinuousListening();
    }
  }

  /**
   * Halts any currently active speech audio immediately (Barge-In)
   */
  cancelSpeakingAudio() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch(e) {}
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.speakingWatchdog) {
      clearTimeout(this.speakingWatchdog);
      this.speakingWatchdog = null;
    }
    this.isSpeaking = false;
    // Re-enable microphone track if previously deafened
    if (window.jarvisMicStream) {
      window.jarvisMicStream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
    }
    this.finalizeSpeakingCaption();
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
      if (!this.isMicMuted) {
        this.setUIState(data.state);
      }
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
      const preferred = ['Google UK English Male', 'en-GB-Neural2-B', 'Daniel', 'Oliver', 'Arthur', 'en-GB'];
      for (let p of preferred) {
        const found = voices.find(v => v.name.includes(p) || (v.lang === 'en-GB' && v.name.toLowerCase().includes('male')));
        if (found) {
          this.britishVoice = found;
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

    this.cancelSpeakingAudio();

    this.lastSpokenText = text;
    if (!this.recentSpokenHistory) this.recentSpokenHistory = [];
    this.recentSpokenHistory.unshift({ text: text, time: Date.now() });
    if (this.recentSpokenHistory.length > 8) this.recentSpokenHistory.pop();

    this.isSpeaking = true;
    this.activeConversationUntil = 0; // Terminate open conversation window during output
    this.pauseRecognitionForSpeech();

    // HARD HARDWARE DEAFENING: Disable microphone audio tracks so loud speakers can't feed back
    if (window.jarvisMicStream) {
      window.jarvisMicStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
    }

    this.setUIState('speaking');
    this.initSpeakingCaption(text);

    // Safety watchdog: ensure isSpeaking is NEVER hung or stuck for more than 15s
    if (this.speakingWatchdog) clearTimeout(this.speakingWatchdog);
    this.speakingWatchdog = setTimeout(() => {
      if (this.isSpeaking) {
        console.warn("[Watchdog] Resetting hung isSpeaking state.");
        this.cancelSpeakingAudio();
        this.scheduleRecognitionRestart(100);
      }
    }, 15000);

    try {
      // 1. Ultra-fast local neural Piper synthesis (~75ms, length_scale 0.80)
      const ttsUrl = `/api/tts?text=${encodeURIComponent(text)}&engine_type=piper`;
      const response = await fetch(ttsUrl);
      if (!response.ok) throw new Error("TTS endpoint error: " + response.status);

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.playbackRate = 1.10; // Snappy, brisk AI cadence
      this.currentAudio = audio;

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
        if (this.speakingWatchdog) {
          clearTimeout(this.speakingWatchdog);
          this.speakingWatchdog = null;
        }
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.isSpeaking = false;
        // 1200ms room reverb cooldown: wait for loud speaker acoustic decay
        this.echoGuardUntil = Date.now() + 1200;
        this.finalizeSpeakingCaption();

        setTimeout(() => {
          if (!this.isSpeaking && !this.isMicMuted) {
            if (window.jarvisMicStream) {
              window.jarvisMicStream.getAudioTracks().forEach(track => {
                track.enabled = true;
              });
            }
            this.setUIState('listening');
            this.scheduleRecognitionRestart(100);
          }
        }, 1200);
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
      if (!this.isMicMuted) this.setUIState('listening');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.britishVoice) {
      utterance.voice = this.britishVoice;
    }

    utterance.lang = 'en-GB';
    utterance.rate = 1.15;   // Faster, articulate British cadence
    utterance.pitch = 0.95;  // Calm, grounded resonance
    utterance.volume = 1.0;

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        this.highlightSpeakingWord(event.charIndex);
      }
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.echoGuardUntil = Date.now() + 1200;
      this.finalizeSpeakingCaption();
      setTimeout(() => {
        if (!this.isSpeaking && !this.isMicMuted) {
          if (window.jarvisMicStream) {
            window.jarvisMicStream.getAudioTracks().forEach(track => {
              track.enabled = true;
            });
          }
          this.setUIState('listening');
          this.scheduleRecognitionRestart(100);
        }
      }, 1200);
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.echoGuardUntil = Date.now() + 1200;
      this.finalizeSpeakingCaption();
      setTimeout(() => {
        if (!this.isSpeaking && !this.isMicMuted) {
          if (window.jarvisMicStream) {
            window.jarvisMicStream.getAudioTracks().forEach(track => {
              track.enabled = true;
            });
          }
          this.setUIState('listening');
          this.scheduleRecognitionRestart(100);
        }
      }, 1200);
    };

    window.speechSynthesis.speak(utterance);
  }

  pauseRecognitionForSpeech() {
    if (this.recognition && this.isRecognitionActive) {
      try {
        this.recognition.abort();
      } catch (e) {}
      this.isRecognitionActive = false;
    }
    this.accumulatedSpeech = '';
    this.lastInterimTranscript = '';
    if (this.speechDispatchTimer) {
      clearTimeout(this.speechDispatchTimer);
      this.speechDispatchTimer = null;
    }
  }

  isAcousticEcho(text) {
    if (!text) return false;
    const cleanLower = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!cleanLower) return false;

    const candidates = [];
    if (this.lastSpokenText) candidates.push(this.lastSpokenText);
    if (this.recentSpokenHistory) {
      for (let item of this.recentSpokenHistory) {
        if (Date.now() - item.time < 25000) {
          candidates.push(item.text);
        }
      }
    }

    const capturedWords = cleanLower.split(/\s+/).filter(w => w.length > 2);

    for (let candidate of candidates) {
      const spokenLower = candidate.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      if (!spokenLower) continue;

      // 1. Direct Substring Match
      if (cleanLower.length >= 4 && (spokenLower.includes(cleanLower) || cleanLower.includes(spokenLower))) {
        return true;
      }

      // 2. Word Overlap Ratio (>= 33% words match)
      if (capturedWords.length > 0) {
        const spokenWords = new Set(spokenLower.split(/\s+/));
        let matched = 0;
        for (const w of capturedWords) {
          if (spokenWords.has(w)) matched++;
        }
        if ((matched / capturedWords.length) >= 0.33) {
          return true;
        }
      }
    }

    return false;
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
    this.recognition.interimResults = true; // Enables live real-time hearing captions
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isRecognitionActive = true;
      const tag = document.getElementById('hearing-live-tag');
      if (tag && !this.isMicMuted) {
        tag.innerText = 'LISTENING';
        tag.style.color = '#00f3ff';
      }
    };

    this.recognition.onresult = (event) => {
      if (this.isMicMuted) return;

      // HARD ACOUSTIC ECHO SHIELD:
      // Completely discard any input received while JARVIS is speaking or within the reverb window
      if (this.isSpeaking || Date.now() < this.echoGuardUntil) {
        this.accumulatedSpeech = '';
        this.lastInterimTranscript = '';
        if (this.speechDispatchTimer) {
          clearTimeout(this.speechDispatchTimer);
          this.speechDispatchTimer = null;
        }
        return;
      }

      let interimTranscript = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunk += text + ' ';
        } else {
          interimTranscript += text;
        }
      }

      // Append finalized chunks to our accumulated thought buffer
      if (finalChunk.trim()) {
        const piece = finalChunk.trim();
        if (this.accumulatedSpeech) {
          this.accumulatedSpeech += ' ' + piece;
        } else {
          this.accumulatedSpeech = piece;
        }
      }

      const activeSpeech = (this.accumulatedSpeech + (interimTranscript ? ' ' + interimTranscript : '')).trim();

      // Update live hearing captions
      if (activeSpeech) {
        this.updateHearingCaption(activeSpeech, false);
      }

      // INTELLIGENT NATURAL SENTENCE COMPLETION:
      // Rather than cutting off at micro-pauses (e.g. "can you ..."),
      // evaluate whether Sir is in the middle of a sentence or has completed his instruction.
      if (activeSpeech) {
        if (this.speechDispatchTimer) clearTimeout(this.speechDispatchTimer);

        const cleanSpeech = activeSpeech.toLowerCase().trim();
        const isBareWakeCall = /^(jarvis|hey jarvis|hello jarvis|hi jarvis|my boy|hey my boy|ultron|buddy)$/i.test(cleanSpeech);
        const isDanglingFiller = /\b(in|can you|could you|would you|the|to|a|an|i want|please|hey|um|uh|and|so|check|make|wake|turn|how|what|why|is)\s*$/i.test(cleanSpeech);

        // Bare wake calls respond promptly (~650ms).
        // Trailing connectors/fillers wait longer (~1300ms) to let Sir finish speaking.
        // Complete sentences wait 850ms of silence before dispatch.
        const delay = isBareWakeCall ? 650 : (isDanglingFiller ? 1300 : 850);

        this.speechDispatchTimer = setTimeout(() => {
          const phraseToProcess = this.accumulatedSpeech.trim() || activeSpeech;
          this.accumulatedSpeech = '';

          if (phraseToProcess && !this.isMicMuted) {
            // Drop isolated micro-noises or fillers with no command
            if (/^(in|a|the|to|um|uh|so)$/i.test(phraseToProcess)) {
              console.log('[*] Ignored ambient micro-noise:', phraseToProcess);
              return;
            }
            this.updateHearingCaption(phraseToProcess, true);
            this.handleCapturedSpeech(phraseToProcess);
          }
        }, delay);
      }
    };

    this.recognition.onerror = (e) => {
      if (e.error !== 'no-speech') {
        console.warn('Speech Recognition error/notice:', e.error);
      }
      this.isRecognitionActive = false;
      // Chrome automatically drops recognition on network, audio-capture, or abort
      if (!this.isSpeaking && !this.isMicMuted) {
        const delay = (e.error === 'network') ? 500 : 150;
        this.scheduleRecognitionRestart(delay);
      }
    };

    this.recognition.onend = () => {
      this.isRecognitionActive = false;
      const tag = document.getElementById('hearing-live-tag');
      if (tag && !this.isSpeaking && !this.isMicMuted) {
        tag.innerText = 'LISTENING';
        tag.style.color = '#00f3ff';
      }
      if (!this.isSpeaking && !this.isMicMuted) {
        this.scheduleRecognitionRestart(80);
      }
    };

    // Watchdog heartbeat: auto-revive recognition if Chrome drops it
    setInterval(() => {
      if (!this.isSpeaking && !this.isRecognitionActive && !this.isMicMuted) {
        this.startContinuousListening();
      }
    }, 1500);

    // Attempt immediate start
    this.startContinuousListening();

    // Auto-boot on first user gesture (ensures audio context & mic unlock)
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
    if (!transcript || this.isMicMuted) return;
    const clean = transcript.trim();
    if (!clean) return;

    // 1. HARD ACOUSTIC ECHO SHIELD: Drop if speaking, in reverb cooldown, or matches JARVIS's own speech
    if (this.isSpeaking || Date.now() < this.echoGuardUntil || this.isAcousticEcho(clean)) {
      console.log('[*] Shielded against speaker acoustic echo:', clean);
      this.activeConversationUntil = 0; // Terminate conversation window immediately on detected echo
      return;
    }

    // 2. Deduplication guard: ignore duplicate triggers within 1200ms
    const now = Date.now();
    if (this.lastProcessedText.toLowerCase() === clean.toLowerCase() && (now - this.lastProcessedTime) < 1200) {
      return;
    }
    this.lastProcessedText = clean;
    this.lastProcessedTime = now;

    console.log('[*] Verified Speech Captured from Sir:', clean);

    const lower = clean.toLowerCase();
    const match = lower.match(this.wakeWordRegex);
    const inActiveConversation = (now < this.activeConversationUntil);

    if (match) {
      // Sir explicitly called wake word -> open 5-second active conversation window
      this.activeConversationUntil = now + 5000;
      this.playJarvisChime();
      this.setUIState('listening');

      const matchedPhrase = match[0];
      let remainingCommand = clean.substring(match.index + matchedPhrase.length).replace(/^[,.\s]+/, '').trim();

      if (remainingCommand.length > 1) {
        this.sendUserSpeech(remainingCommand);
      } else {
        // Bare wake call ("Jarvis", etc.)
        this.sendUserSpeech(clean);
      }
    } else if (inActiveConversation) {
      // Follow-up within active window: guard against common greeting loopbacks
      if (/^(good\s+(morning|afternoon|evening|night)|how\s+can\s+i|at\s+your\s+service|yes\s+sir|how\s+are\s+you)\b/i.test(clean)) {
        console.log('[*] Shielded against greeting loopback in active conversation:', clean);
        return;
      }
      this.activeConversationUntil = now + 5000;
      this.sendUserSpeech(clean);
    } else {
      // Ambient sound/speaker chatter without wake word: discard
      console.log('[*] Ignored non-wake sound outside active conversation:', clean);
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
        if (tag && !this.isMicMuted) {
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

    words.forEach((chunk) => {
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
    let activeId = null;
    for (let w of this.speakingWords) {
      if (charIndex >= w.index) {
        activeId = w.elId;
      } else {
        break;
      }
    }
    if (activeId) {
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
    if (this.isMicMuted) return;
    this.restartTimer = setTimeout(() => {
      this.startContinuousListening();
    }, delayMs);
  }

  startContinuousListening() {
    if (!this.recognition || this.isSpeaking || this.isRecognitionActive || this.isMicMuted) return;
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
    if (this.isMicMuted && state !== 'speaking' && state !== 'thinking') {
      state = 'muted';
    }

    if (visualizer) visualizer.setState(state);

    const coreBtn = document.getElementById('core-trigger-btn');
    const coreText = document.getElementById('core-text');
    const coreSub = document.getElementById('core-sub');
    const marker = document.getElementById('status-marker');

    if (coreBtn) {
      coreBtn.className = 'core-trigger-btn state-' + state;
    }

    if (state === 'muted') {
      if (coreText) coreText.innerText = 'ULTRON';
      if (coreSub) coreSub.innerText = 'MIC MUTED';
      if (marker) marker.style.color = '#ff3b30';
      this.updateStatus('Ultron Core Muted. Tap Ultron to activate microphone, sir.');
    } else if (state === 'listening') {
      if (coreText) coreText.innerText = 'ULTRON';
      if (coreSub) coreSub.innerText = 'MIC ACTIVE';
      if (marker) marker.style.color = '#00f3ff';
      this.updateStatus('Ultron Active // Always listening for Sir. Tap Ultron to mute.');
    } else if (state === 'thinking') {
      if (coreText) coreText.innerText = 'J.A.R.V.I.S.';
      if (coreSub) coreSub.innerText = 'COMPUTING';
      if (marker) marker.style.color = '#ffaa00';
      this.updateStatus('Interpreting semantic intent & executing actions, sir...');
    } else if (state === 'speaking') {
      if (coreText) coreText.innerText = 'J.A.R.V.I.S.';
      if (coreSub) coreSub.innerText = 'SPEAKING';
      if (marker) marker.style.color = '#00f3ff';
      this.updateStatus('Transmitting response to Sir...');
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
        dateEl.innerText = `${now.toLocaleDateString('en-US', options).toUpperCase()} // SIR`;
      }
    };
    update();
    setInterval(update, 1000);
  }

  initUI() {
    // Touching the Ultron Arc Reactor directly unlocks AudioContext & toggles Mic Mute / Unmute
    const coreBtn = document.getElementById('core-trigger-btn');
    if (coreBtn) {
      coreBtn.onclick = (e) => {
        e.preventDefault();

        // Unlock visualizer AudioContext immediately on touch/click
        if (window.visualizer) {
          if (window.visualizer.audioContext && window.visualizer.audioContext.state === 'suspended') {
            window.visualizer.audioContext.resume();
          }
          window.visualizer.initMicAudio();
        }

        this.toggleMicMute();
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
