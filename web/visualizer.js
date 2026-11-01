/**
 * J.A.R.V.I.S. Holographic Canvas, Background Neural Links & Sound Visualizer
 * Core interactive Ultron Arc Reactor HUD and dynamic, sound-reactive Neural Synaptic Link field.
 */

// =========================================================================
// 1. BACKGROUND NEURAL LINK & SYNAPSE NETWORK (Full Window Canvas)
// =========================================================================
class NeuralSynapseVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.nodes = [];
    this.pulses = [];
    this.pointer = { x: -1000, y: -1000, active: false };
    this.nodeCount = 68;
    this.maxLinkDist = 145;
    this.audioEnergy = 0;

    this.resize();
    this.initNodes();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.active = true;
    });
    window.addEventListener('pointerleave', () => {
      this.pointer.active = false;
    });
    window.addEventListener('pointerdown', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.active = true;
      this.burstPulses(this.pointer.x, this.pointer.y);
    });

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  initNodes() {
    this.nodes = [];
    for (let i = 0; i < this.nodeCount; i++) {
      this.nodes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.65,
        vy: (Math.random() - 0.5) * 0.65,
        radius: 1.5 + Math.random() * 2.2,
        pulseOffset: Math.random() * Math.PI * 2,
        glowEnergy: 0,
        isGolden: Math.random() < 0.18 // 18% golden synaptic relay hubs
      });
    }
  }

  burstPulses(x, y) {
    for (let node of this.nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200) {
        node.glowEnergy = 1.0;
      }
    }
  }

  setAudioEnergy(energy) {
    this.audioEnergy = energy;
    if (energy > 0.20 && Math.random() < 0.40) {
      const idx1 = Math.floor(Math.random() * this.nodes.length);
      const n1 = this.nodes[idx1];
      for (let j = 0; j < this.nodes.length; j++) {
        const n2 = this.nodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 30 && dist < this.maxLinkDist) {
          this.pulses.push({
            x1: n1.x, y1: n1.y,
            x2: n2.x, y2: n2.y,
            progress: 0,
            speed: 0.035 + (energy * 0.07),
            color: n1.isGolden ? '#ffaa00' : '#00f3ff'
          });
          break;
        }
      }
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const boost = Math.min(1.0, this.audioEnergy * 2.2);

    // 1. Update Positions
    for (let node of this.nodes) {
      const speedMult = 1.0 + (boost * 1.6);
      node.x += node.vx * speedMult;
      node.y += node.vy * speedMult;

      if (node.x < 0) node.x = this.width;
      if (node.x > this.width) node.x = 0;
      if (node.y < 0) node.y = this.height;
      if (node.y > this.height) node.y = 0;

      if (node.glowEnergy > 0) {
        node.glowEnergy *= 0.94;
      }
    }

    // 2. Draw Synaptic Links
    for (let i = 0; i < this.nodes.length; i++) {
      const n1 = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n2 = this.nodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.maxLinkDist) {
          const alpha = (1 - (dist / this.maxLinkDist)) * (0.28 + (boost * 0.45));
          this.ctx.beginPath();
          this.ctx.moveTo(n1.x, n1.y);
          this.ctx.lineTo(n2.x, n2.y);

          if (n1.isGolden || n2.isGolden) {
            this.ctx.strokeStyle = `rgba(255, 170, 0, ${alpha * 0.9})`;
            this.ctx.lineWidth = 1 + (boost * 1.2);
          } else {
            this.ctx.strokeStyle = `rgba(0, 243, 255, ${alpha})`;
            this.ctx.lineWidth = 0.8 + (boost * 0.8);
          }
          this.ctx.stroke();
        }
      }

      // Pointer direct link
      if (this.pointer.active) {
        const pdx = this.pointer.x - n1.x;
        const pdy = this.pointer.y - n1.y;
        const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pdist < 140) {
          const pAlpha = (1 - (pdist / 140)) * 0.45;
          this.ctx.beginPath();
          this.ctx.moveTo(n1.x, n1.y);
          this.ctx.lineTo(this.pointer.x, this.pointer.y);
          this.ctx.strokeStyle = `rgba(0, 243, 255, ${pAlpha})`;
          this.ctx.lineWidth = 1.2;
          this.ctx.stroke();
        }
      }
    }

    // 3. Draw Action Potential Pulses
    for (let pIdx = this.pulses.length - 1; pIdx >= 0; pIdx--) {
      const p = this.pulses[pIdx];
      p.progress += p.speed;

      const px = p.x1 + (p.x2 - p.x1) * p.progress;
      const py = p.y1 + (p.y2 - p.y1) * p.progress;

      this.ctx.beginPath();
      this.ctx.arc(px, py, 2.5 + (boost * 2), 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 8;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      if (p.progress >= 1.0) {
        this.pulses.splice(pIdx, 1);
      }
    }

    // 4. Draw Synaptic Node Orbs
    for (let node of this.nodes) {
      const pulseSize = node.radius + (boost * 3.5) + (node.glowEnergy * 2.5);
      const color = node.isGolden ? '#ffaa00' : '#00f3ff';

      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, pulseSize, 0, Math.PI * 2);
      this.ctx.fillStyle = color;
      if (boost > 0.2 || node.glowEnergy > 0.2) {
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 10 + (boost * 15);
      }
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    requestAnimationFrame(this.animate);
  }
}


// =========================================================================
// 2. CENTRAL HOLOGRAPHIC ULTRON ARC REACTOR & WAVEFORM VISUALIZER
// =========================================================================
class JarvisVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.coreBtn = document.getElementById('core-trigger-btn');
    this.coreSub = document.getElementById('core-sub');
    this.state = 'listening'; // 'listening', 'thinking', 'speaking', 'muted'
    this.rotation = 0;
    this.rotationSpeed = 0.015;
    this.pulse = 0;

    // Web Audio Analyzer state
    this.analyser = null;
    this.audioContext = null;
    this.micStream = null;
    this.gainNode = null;
    this.frequencyData = new Uint8Array(128);
    this.timeDomainData = new Uint8Array(256);
    this.smoothedEnergy = 0;

    this.initCanvasSize();
    window.addEventListener('resize', () => this.initCanvasSize());

    // Auto-setup interaction hooks to unlock Web Audio API immediately
    const unlockUserAudio = () => {
      this.initMicAudio();
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
    };
    window.addEventListener('pointerdown', unlockUserAudio);
    window.addEventListener('click', unlockUserAudio);
    window.addEventListener('keydown', unlockUserAudio);

    // Initial direct attempt
    this.initMicAudio();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initCanvasSize() {
    const wrap = this.canvas.parentElement;
    const size = Math.min(wrap.clientWidth, wrap.clientHeight, 400);
    this.canvas.width = size * 2; // retina scaling
    this.canvas.height = size * 2;
    this.ctx.scale(2, 2);
    this.width = size;
    this.height = size;
    this.centerX = size / 2;
    this.centerY = size / 2;
  }

  setState(newState) {
    this.state = newState;
    if (newState === 'thinking') {
      this.rotationSpeed = 0.045;
    } else if (newState === 'listening') {
      this.rotationSpeed = 0.018;
    } else if (newState === 'speaking') {
      this.rotationSpeed = 0.028;
    } else if (newState === 'muted') {
      this.rotationSpeed = 0.003;
    } else {
      this.rotationSpeed = 0.012;
    }
  }

  async initMicAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
        window.jarvisAudioContext = this.audioContext;
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      if (!this.micStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            autoGainControl: true,
            noiseSuppression: false
          },
          video: false
        });
      }

      if (this.micStream && !this.analyser) {
        const source = this.audioContext.createMediaStreamSource(this.micStream);

        // 4.5x Pre-Gain Hardware Amplifier for high-sensitivity visual response
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.setValueAtTime(4.5, this.audioContext.currentTime);

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.40; // High responsiveness to spoken words

        source.connect(this.gainNode);
        this.gainNode.connect(this.analyser);
        // Do not connect to destination (no speaker loopback)

        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.timeDomainData = new Uint8Array(this.analyser.fftSize);
        console.log('[Visualizer] Microphone live frequency analyzer connected with 4.5x visual gain.');
      }
    } catch (e) {
      console.warn('Microphone audio context initialisation deferred:', e);
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.pulse += 0.05;

    // 1. Compute Live Audio Metrics
    let rawAudioEnergy = 0;
    if (this.analyser && this.state !== 'muted') {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        // Will unlock on interaction
      } else {
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeDomainData);

        // Frequency energy across vocal bins (1 to 70)
        let sum = 0;
        let peak = 0;
        const binCount = Math.min(70, this.frequencyData.length);
        for (let i = 1; i < binCount; i++) {
          const v = this.frequencyData[i];
          sum += v;
          if (v > peak) peak = v;
        }
        const freqAvg = (sum / (binCount - 1)) / 140;

        // Waveform RMS energy (time-domain displacement)
        let waveSum = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
          const sample = (this.timeDomainData[i] - 128) / 128;
          waveSum += sample * sample;
        }
        const waveRms = Math.sqrt(waveSum / this.timeDomainData.length) * 2.2;

        rawAudioEnergy = Math.max(freqAvg, waveRms);
      }
    } else if (this.state === 'speaking') {
      rawAudioEnergy = 0.35 + Math.sin(this.pulse * 3) * 0.22 + Math.cos(this.pulse * 5) * 0.15;
    }

    // Fast Attack, Smooth Release dynamics
    if (rawAudioEnergy > this.smoothedEnergy) {
      this.smoothedEnergy = (this.smoothedEnergy * 0.3) + (rawAudioEnergy * 0.7); // Rapid attack
    } else {
      this.smoothedEnergy = (this.smoothedEnergy * 0.82) + (rawAudioEnergy * 0.18); // Smooth release
    }

    const micBoost = Math.min(1.0, this.smoothedEnergy * 2.5);

    // Increase ring rotation speed dynamically when speaking
    const dynamicRotationSpeed = this.rotationSpeed + (micBoost * 0.045);
    this.rotation += dynamicRotationSpeed;

    // Feed live audio energy to background Neural Synapse Network
    if (window.neuralVisualizer) {
      window.neuralVisualizer.setAudioEnergy(micBoost);
    }

    const cx = this.centerX;
    const cy = this.centerY;
    const baseRadius = 85 + (micBoost * 22);

    // Color palette based on state
    let strokeColor = 'rgba(0, 243, 255, 0.5)';
    let glowColor = '#00f3ff';
    if (this.state === 'thinking') {
      strokeColor = 'rgba(255, 170, 0, 0.6)';
      glowColor = '#ffaa00';
    } else if (this.state === 'speaking') {
      strokeColor = 'rgba(0, 243, 255, 0.9)';
      glowColor = '#00f3ff';
    } else if (this.state === 'muted') {
      strokeColor = 'rgba(255, 59, 48, 0.5)';
      glowColor = '#ff3b30';
    }

    // =========================================================================
    // 2. DYNAMIC LIVE ULTRON BUTTON PHYSICAL REACTION (DOM Sync)
    // =========================================================================
    if (this.coreBtn) {
      if (this.state === 'muted') {
        this.coreBtn.style.transform = 'scale(1.0)';
        this.coreBtn.style.boxShadow = '0 0 25px rgba(255, 59, 48, 0.4), inset 0 0 15px rgba(255, 59, 48, 0.3)';
        this.coreBtn.style.borderColor = '#ff3b30';
      } else {
        // High visibility dynamic scaling: from 1.00 up to 1.25
        const scaleVal = 1.0 + (micBoost * 0.25);
        const glowSpread = 30 + Math.round(micBoost * 85);
        const insetSpread = 18 + Math.round(micBoost * 45);

        this.coreBtn.style.transform = `scale(${scaleVal.toFixed(3)})`;
        this.coreBtn.style.boxShadow = `0 0 ${glowSpread}px ${glowColor}, inset 0 0 ${insetSpread}px ${glowColor}`;
        this.coreBtn.style.borderColor = glowColor;

        if (this.coreSub && this.state === 'listening') {
          if (micBoost > 0.08) {
            this.coreSub.innerText = 'HEARING SIR';
            this.coreSub.style.color = '#30d158';
            this.coreSub.style.textShadow = '0 0 12px #30d158';
          } else {
            this.coreSub.innerText = 'MIC ACTIVE';
            this.coreSub.style.color = 'rgba(0, 243, 255, 0.85)';
            this.coreSub.style.textShadow = '0 0 6px #00f3ff';
          }
        }
      }
    }

    // =========================================================================
    // 3. CANVAS HOLOGRAPHIC VISUALIZER RINGS
    // =========================================================================
    // A. Ambient Holographic Halo
    const grad = this.ctx.createRadialGradient(cx, cy, 30, cx, cy, baseRadius + 60);
    grad.addColorStop(0, 'rgba(0, 243, 255, 0.0)');
    if (this.state === 'muted') {
      grad.addColorStop(0.7, 'rgba(255, 59, 48, 0.08)');
    } else if (this.state === 'thinking') {
      grad.addColorStop(0.7, 'rgba(255, 170, 0, 0.07)');
    } else {
      const haloAlpha = 0.08 + (micBoost * 0.20);
      grad.addColorStop(0.7, `rgba(0, 243, 255, ${haloAlpha.toFixed(3)})`);
    }
    grad.addColorStop(1, 'transparent');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, baseRadius + 75, 0, Math.PI * 2);
    this.ctx.fill();

    // B. Concentric Orbital Rings (Outer HUD)
    this.drawSegmentedRing(cx, cy, baseRadius + 45, this.rotation * 0.7, 6, 0.2, strokeColor, 1.5 + (micBoost * 1.5));
    this.drawSegmentedRing(cx, cy, baseRadius + 30, -this.rotation * 1.2, 12, 0.08, strokeColor, 2 + (micBoost * 1.5));
    this.drawSegmentedRing(cx, cy, baseRadius + 18, this.rotation * 1.5, 24, 0.04, strokeColor, 1);

    // C. Live Oscilloscope Time-Domain Waveform Ring & Equalizer Bars
    if (this.state !== 'muted') {
      this.drawOscilloscopeRing(cx, cy, baseRadius + 4, micBoost, glowColor);
      this.drawAudioFrequencyRing(cx, cy, baseRadius + 14, micBoost, glowColor);
    } else {
      // Muted indicator ring
      this.drawSegmentedRing(cx, cy, baseRadius + 12, this.rotation * 0.2, 8, 0.15, 'rgba(255, 59, 48, 0.4)', 1.5);
    }

    // D. Inner Energy Radial Ticks
    this.drawRadialTicks(cx, cy, baseRadius - 8, this.rotation * 0.5, 36, 6 + (micBoost * 8), strokeColor);

    requestAnimationFrame(this.animate);
  }

  drawSegmentedRing(cx, cy, radius, rotation, segments, gap, color, lineWidth) {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    const arcLen = (Math.PI * 2) / segments;

    for (let i = 0; i < segments; i++) {
      const start = rotation + (i * arcLen) + (gap / 2);
      const end = rotation + ((i + 1) * arcLen) - (gap / 2);
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, start, end);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawRadialTicks(cx, cy, radius, rotation, count, tickLength, color) {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    const step = (Math.PI * 2) / count;

    for (let i = 0; i < count; i++) {
      const angle = rotation + (i * step);
      const x1 = cx + Math.cos(angle) * (radius - tickLength);
      const y1 = cy + Math.sin(angle) * (radius - tickLength);
      const x2 = cx + Math.cos(angle) * radius;
      const y2 = cy + Math.sin(angle) * radius;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  /**
   * Draws a live undulating circular oscilloscope wave reacting to time-domain audio.
   */
  drawOscilloscopeRing(cx, cy, radius, boost, color) {
    if (!this.timeDomainData || this.timeDomainData.length === 0) return;

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2.0 + (boost * 2.0);
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 10 + (boost * 15);
    this.ctx.beginPath();

    const points = 128;
    const step = (Math.PI * 2) / points;
    const dataLen = this.timeDomainData.length;

    for (let i = 0; i <= points; i++) {
      const dataIdx = Math.floor((i % points) * (dataLen / points));
      // Normalize from 0..255 (128 is center silence) to -1.0 .. 1.0
      const rawVal = (this.timeDomainData[dataIdx] - 128) / 128;
      const waveOffset = rawVal * (20 + (boost * 35));

      const angle = (i * step) + (this.rotation * 0.8);
      const r = radius + waveOffset;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Draws 64 radial frequency equalizer bars around the Ultron perimeter.
   */
  drawAudioFrequencyRing(cx, cy, radius, boost, color) {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 8 + (boost * 14);

    const bars = 64;
    const step = (Math.PI * 2) / bars;

    for (let i = 0; i < bars; i++) {
      const dataIdx = Math.floor((i / bars) * (this.frequencyData.length * 0.7));
      const val = (this.frequencyData[dataIdx] || 0) / 255;
      const barHeight = Math.max(4, (val * 55) + (boost * 25));

      const angle = (i * step) - (this.rotation * 0.5);
      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      const x2 = cx + Math.cos(angle) * (radius + barHeight);
      const y2 = cy + Math.sin(angle) * (radius + barHeight);

      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }
}

// Global visualizer boots
function bootVisualizers() {
  if (!window.neuralVisualizer) {
    window.neuralVisualizer = new NeuralSynapseVisualizer('neural-canvas');
  }
  if (!window.visualizer) {
    window.visualizer = new JarvisVisualizer('jarvis-canvas');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootVisualizers);
} else {
  bootVisualizers();
}
