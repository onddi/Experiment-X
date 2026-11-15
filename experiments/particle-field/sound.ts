// Particle sound: the field plays back. Loaded only when Sound is switched on,
// so with it off there is no audio context, no nodes and no per-frame work.
//
// Six layers, all synthesised (no samples):
//   chimes   a note when a particle bounces off an edge or obstacle
//   drone    a pad that follows the field's speed and spread
//   grains   tiny noise grains from random particles: rain, wind, crackle
//   scan     a line sweeps across and plays the particles it crosses
//   touch    your finger plays a gliding tone; bursts add a drum hit
// Everything snaps to a scale and shares one reverb, and the number of notes
// is capped so thousands of particles can't turn into noise.

export type SndScale = 'pentatonic' | 'major' | 'minor' | 'dorian' | 'blues' | 'japanese' | 'whole';
export type SndTimbre = 'bell' | 'pluck' | 'marimba' | 'glass';
export type SndMusic = 'free' | 'room' | 'along';

const SCALES: Record<SndScale, number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  blues: [0, 3, 5, 6, 7, 10],
  japanese: [0, 1, 5, 7, 8],
  whole: [0, 2, 4, 6, 8, 10],
};

export interface SoundParams {
  vol: number;
  scale: SndScale;
  root: number; // 0 = C … 11 = B
  timbre: SndTimbre;
  hits: number;
  drone: number;
  grain: number;
  scan: number;
  scanSecs: number;
  touch: number;
  reverb: number;
  music: SndMusic;
}

export interface SoundFrame {
  dt: number; // seconds
  n: number;
  w: number;
  h: number;
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  dead: ArrayLike<number> | null;
  speed: number; // 0..1, how busy the field is
  spread: number; // 0..1, how spread out
  // Bounces since last frame: x, y, impact (0..1) triples.
  hits: number[];
  touch: { x: number; y: number; down: boolean };
  thump: number; // a burst happened (0..1 strength)
  pulse: number; // the music's kick envelope (0 without music)
  bpm: number;
  musicOn: boolean;
}

const MAX_VOICES = 28;
// Token bucket: at most this many notes a second across chimes and scan.
const NOTE_RATE = 24;

export class ParticleSound {
  private ctx: AudioContext;
  private master: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private noise: AudioBuffer;
  private voices = 0;
  private tokens = NOTE_RATE;
  private grainDebt = 0;
  private lastThump = 0;
  private p: SoundParams;
  private droneOsc: OscillatorNode[] = [];
  private dronePan: StereoPannerNode[] = [];
  private droneFilter: BiquadFilterNode;
  private droneGain: GainNode;
  private droneKey = '';
  private touchOsc: OscillatorNode;
  private touchOsc2: OscillatorNode;
  private touchFilter: BiquadFilterNode;
  private touchGain: GainNode;
  private touchPan: StereoPannerNode;
  private lastTouch = { x: 0, y: 0 };
  private touchSpeed = 0;
  /** Where the scanline is, 0..1 across the screen. */
  scanX = 0;
  private scanBefore = 0;

  constructor(p: SoundParams) {
    this.p = p;
    // iOS mutes Web Audio with the ring switch unless the page says it plays media.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'interactive' }));
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(2.6);
    this.wet = ctx.createGain();
    this.wet.connect(verb);
    verb.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Drone: three detuned saws through a low-pass, the outer two panned apart.
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 300;
    this.droneFilter.Q.value = 0.8;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter.connect(this.droneGain);
    this.send(this.droneGain, 0.6);
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = (k - 1) * 7;
      const pan = ctx.createStereoPanner();
      o.connect(pan).connect(this.droneFilter);
      o.start();
      this.droneOsc.push(o);
      this.dronePan.push(pan);
    }

    // Touch: a sine with a soft triangle an octave up, gliding between scale notes.
    this.touchOsc = ctx.createOscillator();
    this.touchOsc2 = ctx.createOscillator();
    this.touchOsc2.type = 'triangle';
    this.touchFilter = ctx.createBiquadFilter();
    this.touchFilter.type = 'lowpass';
    this.touchFilter.frequency.value = 1500;
    this.touchGain = ctx.createGain();
    this.touchGain.gain.value = 0;
    this.touchPan = ctx.createStereoPanner();
    const t2 = ctx.createGain();
    t2.gain.value = 0.3;
    this.touchOsc.connect(this.touchFilter);
    this.touchOsc2.connect(t2).connect(this.touchFilter);
    this.touchFilter.connect(this.touchGain).connect(this.touchPan);
    this.send(this.touchPan, 0.5);
    this.touchOsc.start();
    this.touchOsc2.start();
    this.set(p);
  }

  /** Browsers start audio suspended until a tap; call from a user gesture. */
  resume() {
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  set(p: SoundParams) {
    this.p = p;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(p.vol * 0.9, t, 0.08);
    this.wet.gain.setTargetAtTime(p.reverb * 0.8, t, 0.1);
    this.dry.gain.setTargetAtTime(1 - p.reverb * 0.35, t, 0.1);
  }

  /** Fade out and stop using the CPU (Pause, a hidden tab, Sound off). */
  sleep() {
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    window.setTimeout(() => {
      if (this.master.gain.value < 0.01) void this.ctx.suspend().catch(() => {});
    }, 300);
  }

  wake() {
    this.resume();
    this.set(this.p);
  }

  close() {
    void this.ctx.close().catch(() => {});
  }

  private impulse(sec: number) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * sec);
    const b = this.ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return b;
  }

  private send(node: AudioNode, wet = 1) {
    node.connect(this.dry);
    if (wet === 1) node.connect(this.wet);
    else {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.wet);
    }
  }

  // Scale degree (any integer) to frequency, from C3 + root.
  private freq(deg: number, base = 48) {
    const sc = SCALES[this.p.scale];
    const L = sc.length;
    const oct = Math.floor(deg / L);
    const semi = sc[((deg % L) + L) % L] + 12 * oct;
    return 440 * Math.pow(2, (base + this.p.root + semi - 69) / 12);
  }

  // Height on screen to a degree across three octaves (top = high).
  private degAt(y: number, h: number) {
    const L = SCALES[this.p.scale].length;
    return Math.round((1 - Math.min(1, Math.max(0, y / h))) * (L * 3 - 1));
  }

  private note(deg: number, vel: number, pan: number) {
    if (this.voices >= MAX_VOICES || this.tokens < 1 || vel < 0.02) return;
    this.tokens--;
    this.voices++;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = this.freq(deg);
    const tb = this.p.timbre;
    // Low notes ring longer, like real bars and strings.
    const decay = (tb === 'pluck' ? 0.5 : tb === 'marimba' ? 0.6 : tb === 'glass' ? 1.8 : 1.4) * (1.3 - Math.min(1, f / 1600) * 0.6);
    const ratio = tb === 'bell' ? 2.76 : tb === 'glass' ? 4.07 : tb === 'marimba' ? 3.9 : 2;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = tb === 'pluck' ? 'triangle' : 'sine';
    o1.frequency.value = f;
    o2.frequency.value = f * ratio;
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    const peak = vel * 0.22;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    // The overtone dies first, so the strike is bright and the tail pure.
    g2.gain.setValueAtTime(tb === 'pluck' ? 0.15 : 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + decay * 0.3);
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    o1.connect(g);
    o2.connect(g2).connect(g);
    g.connect(pn);
    this.send(pn);
    o1.start(t);
    o2.start(t);
    o1.stop(t + decay + 0.05);
    o2.stop(t + decay + 0.05);
    o1.onended = () => {
      this.voices--;
      pn.disconnect();
    };
  }

  private grain(x: number, y: number, w: number, h: number, amt: number, speed: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.016;
    const len = 0.006 + (1 - speed) * 0.03;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 250 + Math.pow(1 - y / h, 2) * 6000;
    bp.Q.value = 3 + speed * 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amt * (0.25 + Math.random() * 0.5), t + len * 0.3);
    g.gain.linearRampToValueAtTime(0, t + len);
    const pn = ctx.createStereoPanner();
    pn.pan.value = (x / w) * 1.6 - 0.8;
    src.connect(bp).connect(g).connect(pn);
    this.send(pn, 0.4);
    src.start(t, Math.random() * 0.9, len + 0.01);
    src.onended = () => pn.disconnect();
  }

  private thump(k: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7 * k, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g);
    this.send(g, 0.25);
    o.start(t);
    o.stop(t + 0.5);
    o.onended = () => g.disconnect();
  }

  frame(F: SoundFrame) {
    const P = this.p;
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.tokens = Math.min(NOTE_RATE, this.tokens + F.dt * NOTE_RATE);
    // With music: leave room for the kick (notes duck under it).
    const room = F.musicOn && P.music !== 'free' ? 1 - Math.min(1, F.pulse * 1.3) : 1;
    const onKick = F.musicOn && P.music !== 'free' && F.pulse > 0.55;
    const { w, h } = F;

    // Chimes: the hardest few bounces of this frame.
    if (P.hits > 0 && F.hits.length && !onKick) {
      const H = F.hits;
      const m = H.length / 3;
      let budget = 3;
      for (let k = 0; k < m && budget > 0; k += Math.max(1, Math.floor(m / 3))) {
        const x = H[k * 3], y = H[k * 3 + 1], v = H[k * 3 + 2];
        this.note(this.degAt(y, h), P.hits * (0.45 + 0.55 * v) * room, (x / w) * 1.6 - 0.8);
        budget--;
      }
    }

    // Drone: chord from the scale, brighter as the field speeds up.
    const key = `${P.scale}${P.root}`;
    if (key !== this.droneKey) {
      this.droneKey = key;
      [0, 2, 4].forEach((d, k) => this.droneOsc[k].frequency.setTargetAtTime(this.freq(d, 36), t, 0.4));
    }
    const dg = P.drone * 0.1 * (0.6 + F.speed * 0.4) * room;
    this.droneGain.gain.setTargetAtTime(dg, t, 0.25);
    if (P.drone > 0) {
      this.droneFilter.frequency.setTargetAtTime(160 + F.speed * 2600, t, 0.3);
      this.dronePan[0].pan.setTargetAtTime(-0.7 * F.spread, t, 0.5);
      this.dronePan[2].pan.setTargetAtTime(0.7 * F.spread, t, 0.5);
    }

    // Grains: a rate that grows with how busy the field is, capped.
    if (P.grain > 0 && F.n > 0) {
      this.grainDebt += F.dt * P.grain * (15 + F.speed * 140) * room;
      let g = Math.min(8, Math.floor(this.grainDebt));
      this.grainDebt -= g;
      while (g-- > 0) {
        const i = (Math.random() * F.n) | 0;
        if (F.dead && F.dead[i]) continue;
        this.grain(F.px[i], F.py[i], w, h, P.grain, F.speed);
      }
    } else this.grainDebt = 0;

    // Scanline: a sweep every scanSecs (a bar, in time with the music when
    // playing along), playing a few of the particles it passes.
    if (P.scan > 0 && F.n > 0) {
      const secs = P.music === 'along' && F.musicOn && F.bpm > 40 ? (4 * 60) / F.bpm : P.scanSecs;
      this.scanBefore = this.scanX;
      this.scanX += F.dt / secs;
      const wrapped = this.scanX >= 1;
      if (wrapped) this.scanX -= 1;
      const a = this.scanBefore * w, b = this.scanX * w;
      const seen = new Set<number>();
      let found = 0;
      // Sample instead of visiting every particle when there are many.
      const step = Math.max(1, Math.floor(F.n / 3000));
      for (let i = (Math.random() * step) | 0; i < F.n && found < 4; i += step) {
        if (F.dead && F.dead[i]) continue;
        const x = F.px[i];
        if (wrapped ? x >= a || x < b : x >= a && x < b) {
          const d = this.degAt(F.py[i], h);
          if (seen.has(d)) continue;
          seen.add(d);
          found++;
          this.note(d, P.scan * 0.45 * (onKick ? 0.3 : 1), (x / w) * 1.6 - 0.8);
        }
      }
    }

    // Touch: glide to the scale note under the finger; louder as it moves.
    if (P.touch > 0) {
      const T = F.touch;
      if (T.down) {
        const mv = Math.hypot(T.x - this.lastTouch.x, T.y - this.lastTouch.y) / Math.max(1e-3, F.dt);
        this.touchSpeed += (Math.min(1, mv / 900) - this.touchSpeed) * 0.15;
        const f = this.freq(this.degAt(T.y, h), 48);
        this.touchOsc.frequency.setTargetAtTime(f, t, 0.035);
        this.touchOsc2.frequency.setTargetAtTime(f * 2, t, 0.035);
        this.touchFilter.frequency.setTargetAtTime(500 + (T.x / w) * 4500, t, 0.05);
        this.touchPan.pan.setTargetAtTime((T.x / w) * 1.2 - 0.6, t, 0.05);
        this.touchGain.gain.setTargetAtTime(P.touch * 0.3 * (0.4 + this.touchSpeed * 0.6), t, 0.03);
      } else this.touchGain.gain.setTargetAtTime(0, t, 0.12);
      this.lastTouch.x = T.x;
      this.lastTouch.y = T.y;
      if (F.thump > 0 && performance.now() - this.lastThump > 90) {
        this.lastThump = performance.now();
        this.thump(Math.min(1, F.thump) * P.touch);
      }
    } else this.touchGain.gain.setTargetAtTime(0, t, 0.1);
  }
}
