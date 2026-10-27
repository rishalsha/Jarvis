/**
 * J.A.R.V.I.S. Holographic Canvas & Web Audio Reactive Visualizer
 * Simulates Marvel Arc Reactor, rotating orbital HUD rings, and real-time audio waveforms.
 */

class JarvisVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.state = 'idle'; // 'idle', 'listening', 'thinking', 'speaking'
    this.rotation = 0;
    this.rotationSpeed = 0.008;
    this.pulse = 0;
    this.audioData = new Uint8Array(64);
    this.analyser = null;
    this.audioContext = null;
    this.micStream = null;

    this.initCanvasSize();
    window.addEventListener('resize', () => this.initCanvasSize());
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
      this.rotationSpeed = 0.025;
    } else {
      this.rotationSpeed = 0.008;
    }
  }

  async initMicAudio() {
    if (this.analyser) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const source = this.audioContext.createMediaStreamSource(this.micStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);
      this.audioData = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (e) {
      console.warn('Microphone audio context initialisation deferred:', e);
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.rotation += this.rotationSpeed;
    this.pulse += 0.05;

    // Grab live audio levels
    let avgAudio = 0;
    if (this.analyser && (this.state === 'listening' || this.state === 'speaking')) {
      this.analyser.getByteFrequencyData(this.audioData);
      let sum = 0;
      for (let i = 0; i < this.audioData.length; i++) {
        sum += this.audioData[i];
      }
      avgAudio = sum / this.audioData.length / 255;
    } else if (this.state === 'speaking') {
      // Simulate speech harmonics if synthetic TTS is playing
      avgAudio = 0.35 + Math.sin(this.pulse * 3) * 0.25 + Math.cos(this.pulse * 5) * 0.15;
    }

    const cx = this.centerX;
    const cy = this.centerY;
    const baseRadius = 85 + (avgAudio * 25);

    // Primary Colors
    let strokeColor = 'rgba(0, 243, 255, 0.5)';
    let glowColor = '#00f3ff';
    if (this.state === 'thinking') {
      strokeColor = 'rgba(255, 170, 0, 0.6)';
      glowColor = '#ffaa00';
    } else if (this.state === 'listening') {
      strokeColor = 'rgba(0, 243, 255, 0.85)';
      glowColor = '#00f3ff';
    }

    // 1. Ambient Holographic Halo
    const grad = this.ctx.createRadialGradient(cx, cy, 30, cx, cy, baseRadius + 50);
    grad.addColorStop(0, 'rgba(0, 243, 255, 0.0)');
    grad.addColorStop(0.7, this.state === 'thinking' ? 'rgba(255, 170, 0, 0.05)' : 'rgba(0, 243, 255, 0.08)');
    grad.addColorStop(1, 'transparent');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, baseRadius + 60, 0, Math.PI * 2);
    this.ctx.fill();

    // 2. Concentric Orbital Rings (Outer HUD)
    this.drawSegmentedRing(cx, cy, baseRadius + 45, this.rotation * 0.7, 6, 0.2, strokeColor, 1.5);
    this.drawSegmentedRing(cx, cy, baseRadius + 30, -this.rotation * 1.2, 12, 0.08, strokeColor, 2);
    this.drawSegmentedRing(cx, cy, baseRadius + 18, this.rotation * 1.5, 24, 0.04, strokeColor, 1);

    // 3. Audio Frequency Waveform around Perimeter
    this.drawAudioFrequencyRing(cx, cy, baseRadius + 12, avgAudio, glowColor);

    // 4. Inner Energy Ticks
    this.drawRadialTicks(cx, cy, baseRadius - 5, this.rotation * 0.5, 36, 6, strokeColor);

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

  drawAudioFrequencyRing(cx, cy, radius, avgAudio, color) {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = 2;
    const bars = 48;
    const step = (Math.PI * 2) / bars;

    for (let i = 0; i < bars; i++) {
      const dataIdx = Math.floor((i / bars) * (this.audioData.length / 2));
      const val = (this.audioData[dataIdx] || 0) / 255;
      const barHeight = Math.max(2, val * 35 + (avgAudio * 15));

      const angle = i * step;
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

// Global visualizer instance
let visualizer = null;
window.addEventListener('DOMContentLoaded', () => {
  visualizer = new JarvisVisualizer('jarvis-canvas');
});
