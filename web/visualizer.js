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
    // Spawns electrical synaptic bursts outward from touch/click point
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
    if (energy > 0.35 && Math.random() < 0.25) {
      // Spawn random action potential along an active link
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
            speed: 0.035 + (energy * 0.04),
            color: n1.isGolden ? '#ffaa00' : '#00f3ff'
          });
          break;
        }
      }
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    const boost = this.audioEnergy; // 0.0 to 1.0 live audio boost

    // 1. Update and draw nodes
    for (let node of this.nodes) {
      node.x += node.vx * (1 + boost * 0.8);
      node.y += node.vy * (1 + boost * 0.8);

      // Bounce off screen boundaries with padding
      if (node.x < 10) { node.x = 10; node.vx *= -1; }
      if (node.x > this.width - 10) { node.x = this.width - 10; node.vx *= -1; }
      if (node.y < 10) { node.y = 10; node.vy *= -1; }
      if (node.y > this.height - 10) { node.y = this.height - 10; node.vy *= -1; }

      // Decay glow
      if (node.glowEnergy > 0) node.glowEnergy -= 0.02;

      // Pointer proximity pull
      if (this.pointer.active) {
        const pdx = this.pointer.x - node.x;
        const pdy = this.pointer.y - node.y;
        const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pdist < 180 && pdist > 5) {
          node.x += (pdx / pdist) * 0.45;
          node.y += (pdy / pdist) * 0.45;
        }
      }
    }

    // 2. Draw Synaptic Link Connectors (Axons)
    const len = this.nodes.length;
    for (let i = 0; i < len; i++) {
      const n1 = this.nodes[i];
      for (let j = i + 1; j < len; j++) {
        const n2 = this.nodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.maxLinkDist) {
          const proximityAlpha = (1 - (dist / this.maxLinkDist));
          const alpha = Math.min(0.85, proximityAlpha * (0.28 + (boost * 0.55)));
          
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

    // 3. Draw Action Potential Pulses (Traveling Neural Signals)
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
    this.state = 'listening'; // 'listening', 'thinking', 'speaking', 'muted'
    this.rotation = 0;
    this.rotationSpeed = 0.015;
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
      this.rotationSpeed = 0.028;
    } else if (newState === 'muted') {
      this.rotationSpeed = 0.003;
    } else {
      this.rotationSpeed = 0.012;
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
    if (this.analyser && this.state !== 'muted') {
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

    // Feed live audio energy to background Neural Synapse Network
    if (window.neuralVisualizer) {
      window.neuralVisualizer.setAudioEnergy(avgAudio);
    }

    const cx = this.centerX;
    const cy = this.centerY;
    const baseRadius = 85 + (avgAudio * 25);

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

    // 1. Ambient Holographic Halo
    const grad = this.ctx.createRadialGradient(cx, cy, 30, cx, cy, baseRadius + 50);
    grad.addColorStop(0, 'rgba(0, 243, 255, 0.0)');
    if (this.state === 'muted') {
      grad.addColorStop(0.7, 'rgba(255, 59, 48, 0.08)');
    } else if (this.state === 'thinking') {
      grad.addColorStop(0.7, 'rgba(255, 170, 0, 0.07)');
    } else {
      grad.addColorStop(0.7, 'rgba(0, 243, 255, 0.09)');
    }
    grad.addColorStop(1, 'transparent');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, baseRadius + 60, 0, Math.PI * 2);
    this.ctx.fill();

    // 2. Concentric Orbital Rings (Outer HUD)
    this.drawSegmentedRing(cx, cy, baseRadius + 45, this.rotation * 0.7, 6, 0.2, strokeColor, 1.5);
    this.drawSegmentedRing(cx, cy, baseRadius + 30, -this.rotation * 1.2, 12, 0.08, strokeColor, 2);
    this.drawSegmentedRing(cx, cy, baseRadius + 18, this.rotation * 1.5, 24, 0.04, strokeColor, 1);

    // 3. Audio Frequency Waveform around Perimeter (if unmuted)
    if (this.state !== 'muted') {
      this.drawAudioFrequencyRing(cx, cy, baseRadius + 12, avgAudio, glowColor);
    } else {
      // Muted indicator ring
      this.drawSegmentedRing(cx, cy, baseRadius + 12, this.rotation * 0.2, 8, 0.15, 'rgba(255, 59, 48, 0.4)', 1.5);
    }

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

// Global visualizer instances
let visualizer = null;
let neuralVisualizer = null;

window.addEventListener('DOMContentLoaded', () => {
  window.neuralVisualizer = new NeuralSynapseVisualizer('neural-canvas');
  window.visualizer = new JarvisVisualizer('jarvis-canvas');
});
