// Particle sound: the field plays back. Loaded only when Sound is switched on,
// so with it off there is no audio context, no nodes and no per-frame work.
//
// Everything follows one slowly moving chord progression, so the layers
// harmonise and the sound goes somewhere instead of sitting on one chord:
//   strings  invisible vertical strings that ring when particles cross them
//   pad      soft chord voices that swell with the field's energy, silent when calm
//   steps    the screen as a step sequencer: each column plays where particles crowd
//   chimes   a note when a particle bounces off an edge or obstacle
//   grains   tiny noise grains from random particles: rain, wind, crackle
//   scan     a line sweeps across and plays the particles it crosses
//   touch    your finger plays a gliding tone; bursts add a drum hit
//   accents  a strum on scene change, a whoosh when a shape forms, sparkles on births
// Notes come in phrases with rests between them (busier field, longer
// phrases), each particle's colour can pick its instrument, and the number of
// notes is capped so thousands of particles can't turn into noise.

export type SndScale = 'pentatonic' | 'major' | 'minor' | 'dorian' | 'blues' | 'japanese' | 'whole';
export type Voice = 'marimba' | 'bell' | 'pluck' | 'glass' | 'kalimba' | 'epiano' | 'vibes' | 'musicbox' | 'harp' | 'steel' | 'flute' | 'synth' | 'koto';
export type SndTimbre = 'colour' | 'lounge' | 'world' | Voice;
export type SndMusic = 'free' | 'room' | 'along';
export type SndProg = 'still' | 'calm' | 'pop' | 'drift' | 'mystic';

const SCALES: Record<SndScale, number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  blues: [0, 3, 5, 6, 7, 10],
  japanese: [0, 1, 5, 7, 8],
  whole: [0, 2, 4, 6, 8, 10],
};
// Chord roots as scale steps; each chord stacks every other step on its root.
const PROGS: Record<SndProg, number[]> = {
  still: [0],
  calm: [0, 3],
  pop: [0, 4, 5, 3],
  drift: [0, 5, 3, 4],
  mystic: [0, 1, 0, 6],
};
// By colour: the palette's colours are split between the four instruments of a band.
const BANDS: Record<'colour' | 'lounge' | 'world', Voice[]> = {
  colour: ['marimba', 'bell', 'pluck', 'glass'],
  lounge: ['epiano', 'vibes', 'harp', 'flute'],
  world: ['kalimba', 'steel', 'koto', 'musicbox'],
};
// Each instrument is two oscillators, sometimes with FM, a filter sweep or a
// wobble: cheap enough to play dozens at once.
interface VoiceDef {
  type: OscillatorType; // the body
  ratio: number; // the second partial (a multiple of the note)
  level: number; // how loud that partial starts
  fade: number; // how soon it fades, as a share of the decay
  decay: number; // seconds, for a middle note
  attack?: number;
  octave?: number; // play this many octaves up
  fm?: [number, number]; // modulator ratio, depth (× the note), fading fast
  sweep?: [number, number]; // low-pass from, to (Hz)
  wobble?: [number, number]; // tremolo rate (Hz), depth
  vibrato?: number; // cents
  bend?: number; // starts this many cents sharp and drops into tune
  gain?: number;
}
const VOICES: Record<Voice, VoiceDef> = {
  marimba: { type: 'sine', ratio: 3.9, level: 0.5, fade: 0.08, decay: 0.7 },
  bell: { type: 'sine', ratio: 2.76, level: 0.35, fade: 0.3, decay: 1.5 },
  pluck: { type: 'triangle', ratio: 2, level: 0.15, fade: 0.3, decay: 0.55 },
  glass: { type: 'sine', ratio: 4.07, level: 0.35, fade: 0.3, decay: 2, attack: 0.02 },
  kalimba: { type: 'sine', ratio: 6.2, level: 0.45, fade: 0.05, decay: 0.9, fm: [1, 0.4] },
  epiano: { type: 'sine', ratio: 14, level: 0.06, fade: 0.05, decay: 1.7, fm: [1, 1.6] },
  vibes: { type: 'sine', ratio: 4, level: 0.15, fade: 0.2, decay: 2.2, wobble: [5.5, 0.35] },
  musicbox: { type: 'sine', ratio: 3, level: 0.3, fade: 0.25, decay: 1.2, octave: 1, gain: 0.8 },
  harp: { type: 'triangle', ratio: 2, level: 0.3, fade: 0.2, decay: 1.4, sweep: [5000, 600] },
  steel: { type: 'sine', ratio: 1.99, level: 0.55, fade: 0.4, decay: 0.9, fm: [3, 0.5] },
  flute: { type: 'sine', ratio: 2, level: 0.12, fade: 1, decay: 0.9, attack: 0.07, vibrato: 12, octave: 1, gain: 0.8 },
  synth: { type: 'sawtooth', ratio: 1.006, level: 0.6, fade: 1, decay: 0.6, sweep: [3200, 350], gain: 0.95 },
  koto: { type: 'sawtooth', ratio: 2, level: 0.2, fade: 0.15, decay: 1.1, sweep: [2600, 500], bend: 40, gain: 1 },
};

export interface SoundParams {
  vol: number;
  scale: SndScale;
  root: number; // 0 = C … 11 = B
  timbre: SndTimbre;
  prog: SndProg;
  tempo: number;
  strings: number;
  stringCount: number;
  octave: number; // shifts every note by octaves
  range: number; // how many octaves the notes spread over
  pad: number;
  seq: number;
  hits: number;
  grain: number;
  scan: number;
  scanSecs: number;
  touch: number;
  accents: number;
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
  ox: Float32Array; // where each particle was a frame ago
  tone: Float32Array; // 0..1 along the palette
  dead: ArrayLike<number> | null;
  speed: number; // 0..1, how busy the field is
  spread: number; // 0..1, how spread out
  // Bounces since last frame: x, y, impact (0..1), tone triples.
  hits: number[];
  touch: { x: number; y: number; down: boolean };
  thump: number; // a burst happened (0..1 strength)
  born: number; // particles spawned since last frame
  scene: boolean; // a new scene started
  shape: boolean; // a shape just formed
  pulse: number; // the music's kick envelope (0 without music)
  bpm: number;
  musicOn: boolean;
}

const MAX_VOICES = 32;
// Token bucket: at most this many melodic notes a second.
const NOTE_RATE = 22;
const STEPS = 16;
const ROWS = 8;

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
  // Harmony and phrasing.
  private beat = 0; // beats since start, fractional
  private chord = 0; // index into the progression
  private energy = 0; // smoothed field speed
  private phraseOn = true;
  private phraseLeft = 8; // beats left in this phrase or rest
  // Pad.
  private padOsc: OscillatorNode[] = [];
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private padLfo = 0;
  private padChord = '';
  // Strings: when each last rang (ms).
  private stringAt: number[] = [];
  // How many crossings each string usually gets a frame, so a sudden crowd rings it.
  private stringAvg: number[] = [];
  // Step sequencer.
  private step = -1;
  private grid = new Float32Array(ROWS);
  // Touch.
  private touchOsc: OscillatorNode;
  private touchOsc2: OscillatorNode;
  private touchFilter: BiquadFilterNode;
  private touchGain: GainNode;
  private touchPan: StereoPannerNode;
  private lastTouch = { x: 0, y: 0 };
  private touchSpeed = 0;
  private lastSparkle = 0;
  /** Where the scanline is, 0..1 across the screen. */
  scanX = 0;

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
    verb.buffer = this.impulse(2.8);
    this.wet = ctx.createGain();
    this.wet.connect(verb);
    verb.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Pad: four soft voices (sine and triangle, slightly detuned) on the chord,
    // through a gentle low-pass. Its level breathes with the field.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.3;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padFilter.connect(this.padGain);
    this.send(this.padGain, 0.9);
    for (let k = 0; k < 4; k++) {
      const o = ctx.createOscillator();
      o.type = k % 2 ? 'triangle' : 'sine';
      o.detune.value = (k - 1.5) * 4;
      const pan = ctx.createStereoPanner();
      pan.pan.value = (k - 1.5) * 0.4;
      const g = ctx.createGain();
      g.gain.value = k === 0 ? 0.5 : 0.32;
      o.connect(g).connect(pan).connect(this.padFilter);
      o.start();
      this.padOsc.push(o);
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

  private get L() {
    return SCALES[this.p.scale].length;
  }

  // Scale degree (any integer) to frequency, from C3 + root.
  private freq(deg: number, base = 48) {
    const sc = SCALES[this.p.scale];
    const L = sc.length;
    const oct = Math.floor(deg / L);
    const semi = sc[((deg % L) + L) % L] + 12 * oct;
    return 440 * Math.pow(2, (base + 12 * this.p.octave + this.p.root + semi - 69) / 12);
  }

  // The current chord's root as a scale degree.
  private chordRoot() {
    const prog = PROGS[this.p.prog];
    return prog[this.chord % prog.length];
  }

  // The k-th chord tone, counting up across octaves (0 = root, 1 = third, 2 = fifth, 3 = root an octave up…).
  private chordTone(k: number) {
    // Stack every other step of the scale on the root: root, third, fifth.
    const oct = Math.floor(k / 3);
    return this.chordRoot() + (k - oct * 3) * 2 + oct * this.L;
  }

  // Snap a degree to the nearest chord tone.
  private toChord(deg: number) {
    let best = deg, bd = 99;
    for (let k = -3; k < 12; k++) {
      const c = this.chordTone(k);
      const d = Math.abs(c - deg);
      if (d < bd) (bd = d), (best = c);
    }
    return best;
  }

  // Height on screen to a degree across three octaves (top = high).
  private degAt(y: number, h: number) {
    return Math.round((1 - Math.min(1, Math.max(0, y / h))) * (this.L * this.p.range - 1));
  }

  private voiceFor(tone: number): Voice {
    const tb = this.p.timbre;
    if (tb === 'colour' || tb === 'lounge' || tb === 'world') return BANDS[tb][Math.min(3, Math.floor(tone * 4))];
    return tb;
  }

  private note(deg: number, vel: number, pan: number, voice: Voice, when = 0) {
    if (this.voices >= MAX_VOICES || this.tokens < 1 || vel < 0.02) return;
    this.tokens--;
    this.voices++;
    const V = VOICES[voice];
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const f = this.freq(deg) * 2 ** (V.octave ?? 0);
    // Low notes ring longer, like real bars and strings.
    const decay = V.decay * (1.3 - Math.min(1, f / 1600) * 0.6);
    const end = t + decay + 0.05;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = V.type;
    o1.frequency.value = f;
    o2.type = V.type === 'sawtooth' ? 'square' : 'sine';
    o2.frequency.value = f * V.ratio;
    if (V.bend) {
      o1.detune.setValueAtTime(V.bend, t);
      o1.detune.exponentialRampToValueAtTime(1, t + 0.08);
    }
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    const peak = vel * 0.22 * (V.gain ?? 1);
    const atk = V.attack ?? 0.004;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    // The overtone dies first, so the strike is bright and the tail pure.
    g2.gain.setValueAtTime(V.level, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.02, decay * V.fade));
    const nodes: AudioScheduledSourceNode[] = [o1, o2];
    if (V.fm) {
      // FM: a modulator bends the body's pitch; its depth falls fast, so the
      // strike is metallic and the tail clean (electric piano, kalimba, steel).
      const m = ctx.createOscillator();
      m.frequency.value = f * V.fm[0];
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * V.fm[1], t);
      mg.gain.exponentialRampToValueAtTime(f * V.fm[1] * 0.05 + 0.01, t + decay * 0.35);
      m.connect(mg).connect(o1.frequency);
      nodes.push(m);
    }
    if (V.vibrato) {
      const l = ctx.createOscillator();
      l.frequency.value = 5;
      const lg = ctx.createGain();
      lg.gain.value = V.vibrato;
      l.connect(lg).connect(o1.detune);
      nodes.push(l);
    }
    let out: AudioNode = g;
    if (V.sweep) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(V.sweep[0], t);
      lp.frequency.exponentialRampToValueAtTime(V.sweep[1], t + decay * 0.6);
      g.connect(lp);
      out = lp;
    }
    if (V.wobble) {
      const tr = ctx.createGain();
      tr.gain.value = 1 - V.wobble[1];
      const l = ctx.createOscillator();
      l.frequency.value = V.wobble[0];
      const lg = ctx.createGain();
      lg.gain.value = V.wobble[1];
      l.connect(lg).connect(tr.gain);
      out.connect(tr);
      out = tr;
      nodes.push(l);
    }
    const pn = ctx.createStereoPanner();
    pn.pan.value = Math.max(-1, Math.min(1, pan));
    o1.connect(g);
    o2.connect(g2).connect(g);
    out.connect(pn);
    this.send(pn);
    for (const nd of nodes) {
      nd.start(t);
      nd.stop(end);
    }
    o1.onended = () => {
      this.voices--;
      pn.disconnect();
    };
  }

  private grain(x: number, y: number, w: number, h: number, amt: number, speed: number, len = 0.006 + (1 - speed) * 0.03, wet = 0.4) {
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.016;
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
    this.send(pn, wet);
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

  // A rising filtered-noise sweep, for a shape forming.
  private whoosh(k: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(3500, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * k, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    src.connect(bp).connect(g);
    this.send(g, 1);
    src.start(t);
    src.stop(t + 1.25);
    src.onended = () => g.disconnect();
  }

  // The chord, rolled upwards like a harp.
  private strum(k: number) {
    const save = this.tokens;
    this.tokens = 99;
    for (let j = 0; j < 5; j++) this.note(this.chordTone(j + 1), 0.55 * k, -0.6 + j * 0.3, 'bell', j * 0.07);
    this.tokens = save;
  }

  frame(F: SoundFrame) {
    const P = this.p;
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const now = performance.now();
    this.tokens = Math.min(NOTE_RATE, this.tokens + F.dt * NOTE_RATE);
    const { w, h } = F;
    // With music: leave room for the kick (notes duck under it).
    const fit = F.musicOn && P.music !== 'free';
    const room = fit ? 1 - Math.min(1, F.pulse * 1.3) : 1;
    const onKick = fit && F.pulse > 0.55;
    this.energy += (F.speed - this.energy) * Math.min(1, F.dt * 1.5);

    // Clock: the song's tempo when playing along, else the Tempo setting.
    const bpm = P.music === 'along' && F.musicOn && F.bpm > 40 ? F.bpm : P.tempo;
    const beats = F.dt * (bpm / 60);
    const before = this.beat;
    this.beat += beats;
    // A new chord every two bars.
    if (Math.floor(this.beat / 8) !== Math.floor(before / 8)) this.chord++;
    // Phrases and rests: a busier field plays longer and rests less.
    this.phraseLeft -= beats;
    if (this.phraseLeft <= 0) {
      this.phraseOn = !this.phraseOn;
      const e = this.energy;
      this.phraseLeft = this.phraseOn ? 4 + Math.round(e * 3) * 4 : Math.max(1, Math.round((1 - e) * 3)) * 2;
    }
    // Inside a rest, only the odd note gets through.
    const gate = () => !onKick && (this.phraseOn || Math.random() < 0.03);

    // Accents.
    if (P.accents > 0) {
      if (F.scene) this.strum(P.accents);
      if (F.shape) this.whoosh(P.accents);
      if (F.born > Math.max(24, F.n * 0.02) && now - this.lastSparkle > 250) {
        this.lastSparkle = now;
        const save = this.tokens;
        this.tokens = 99;
        for (let j = 0; j < 3; j++) this.note(this.chordTone(6 + ((Math.random() * 4) | 0)), 0.35 * P.accents, Math.random() * 1.6 - 0.8, 'glass', j * 0.05);
        this.tokens = save;
      }
    }

    // Pad: the chord, swelling with energy and a slow breath, silent when still.
    const chordKey = `${P.scale}${P.root}${this.chordRoot()}`;
    if (chordKey !== this.padChord) {
      this.padChord = chordKey;
      [0, 1, 2, 3].forEach((k) => this.padOsc[k].frequency.setTargetAtTime(this.freq(this.chordTone(k), 48), t, 0.5));
    }
    this.padLfo += F.dt * 0.6;
    const breath = 0.65 + 0.35 * Math.sin(this.padLfo);
    const lively = Math.max(0, Math.min(1, (this.energy - 0.04) * 3));
    this.padGain.gain.setTargetAtTime(P.pad * 0.3 * lively * breath * (0.4 + 0.6 * room), t, 0.4);
    if (P.pad > 0) this.padFilter.frequency.setTargetAtTime(400 + this.energy * 1800 + F.spread * 400, t, 0.5);

    // Strings: vertical lines across the screen; a particle crossing one
    // plucks it (a chord tone, higher in the upper half of the screen).
    if (P.strings > 0 && F.n > 0) {
      const N = Math.max(2, Math.round(P.stringCount));
      const count = new Uint16Array(N);
      const where = new Float32Array(N * 2);
      const stride = Math.max(1, Math.floor(F.n / 2500));
      for (let i = (Math.random() * stride) | 0; i < F.n; i += stride) {
        if (F.dead && F.dead[i]) continue;
        const a = F.ox[i], b = F.px[i];
        if (Math.abs(b - a) > w * 0.5) continue; // wrapped round the screen
        const sa = Math.floor((a / w) * N + 0.5), sb = Math.floor((b / w) * N + 0.5);
        if (sa === sb) continue;
        const s = Math.min(sa, sb);
        if (s < 1 || s > N) continue;
        const k = s - 1;
        if (count[k]++ === 0) {
          where[k * 2] = F.py[i];
          where[k * 2 + 1] = F.tone[i] ?? 0.5;
        }
      }
      // Each string rings about rate times a second (more when the field is
      // busy), and more often while more particles than usual cross it.
      const rate = 0.6 + this.energy * 2;
      for (let k = 0; k < N; k++) {
        const c = count[k] * stride;
        const avg = (this.stringAvg[k] = (this.stringAvg[k] ?? c) * 0.97 + c * 0.03);
        if (!count[k] || now - (this.stringAt[k] ?? 0) < 160) continue;
        if (Math.random() > rate * F.dt * Math.min(4, c / Math.max(0.5, avg)) || !gate()) continue;
        this.stringAt[k] = now;
        // Left to right climbs the chord across the Range; the top half of the screen sits higher.
        const span = Math.max(2, this.p.range * 3 - 1);
        const idx = Math.round(((k / Math.max(1, N - 1)) * 0.75 + (where[k * 2] < h * 0.5 ? 0.25 : 0)) * span);
        const vel = P.strings * Math.min(1, 0.35 + Math.log2(1 + count[k] * stride) * 0.12) * room;
        this.note(this.chordTone(idx), vel, ((k + 1) / (N + 1)) * 1.6 - 0.8, this.voiceFor(where[k * 2 + 1]));
      }
    }

    // Steps: sixteen columns played in time; where particles crowd in a
    // column, that row plays (a chord tone), with a soft tick for the pulse.
    if (P.seq > 0 && F.n > 0) {
      const s = Math.floor(this.beat * 4) % STEPS;
      if (s !== this.step) {
        this.step = s;
        const x0 = (s / STEPS) * w, x1 = ((s + 1) / STEPS) * w;
        this.grid.fill(0);
        let tot = 0;
        const stride = Math.max(1, Math.floor(F.n / 3000));
        for (let i = 0; i < F.n; i += stride) {
          if (F.dead && F.dead[i]) continue;
          const x = F.px[i];
          if (x < x0 || x >= x1) continue;
          this.grid[Math.min(ROWS - 1, Math.max(0, Math.floor((F.py[i] / h) * ROWS)))]++;
          tot++;
        }
        const mean = (F.n / stride / STEPS) / ROWS;
        if (s % 2 === 0 && !onKick) this.grain(x0, h * 0.15, w, h, P.seq * (s % 4 === 0 ? 0.35 : 0.18), 0.9, 0.012, 0.1);
        let played = 0;
        if (tot && gate()) {
          for (let r = 0; r < ROWS && played < 2; r++) {
            if (this.grid[r] < mean * 1.8 || this.grid[r] < 2) continue;
            const deg = this.toChord(Math.round((1 - (r + 0.5) / ROWS) * (this.L * this.p.range * 0.85)));
            this.note(deg, P.seq * Math.min(1, this.grid[r] / (mean * 4)) * (s % 4 === 0 ? 1 : 0.7) * room, (s / STEPS) * 1.6 - 0.8, this.voiceFor(0));
            played++;
          }
        }
      }
    }

    // Chimes: the hardest few bounces of this frame.
    if (P.hits > 0 && F.hits.length && gate()) {
      const H = F.hits;
      const m = H.length / 4;
      let budget = 3;
      for (let k = 0; k < m && budget > 0; k += Math.max(1, Math.floor(m / 3))) {
        const x = H[k * 4], y = H[k * 4 + 1], v = H[k * 4 + 2], tn = H[k * 4 + 3];
        this.note(this.degAt(y, h), P.hits * (0.45 + 0.55 * v) * room, (x / w) * 1.6 - 0.8, this.voiceFor(tn));
        budget--;
      }
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

    // Scanline: one sweep per bar (or every Sweep time seconds), playing a
    // few of the particles it passes.
    if (P.scan > 0 && F.n > 0) {
      const secs = P.music === 'along' && F.musicOn && F.bpm > 40 ? (4 * 60) / F.bpm : P.scanSecs;
      const before = this.scanX;
      this.scanX += F.dt / secs;
      const wrapped = this.scanX >= 1;
      if (wrapped) this.scanX -= 1;
      const a = before * w, b = this.scanX * w;
      const seen = new Set<number>();
      let found = 0;
      const step = Math.max(1, Math.floor(F.n / 3000));
      for (let i = (Math.random() * step) | 0; i < F.n && found < 4; i += step) {
        if (F.dead && F.dead[i]) continue;
        const x = F.px[i];
        if (wrapped ? x >= a || x < b : x >= a && x < b) {
          const d = this.degAt(F.py[i], h);
          if (seen.has(d)) continue;
          seen.add(d);
          found++;
          if (gate()) this.note(d, P.scan * 0.45, (x / w) * 1.6 - 0.8, this.voiceFor(F.tone[i] ?? 0.5));
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
      if (F.thump > 0 && now - this.lastThump > 90) {
        this.lastThump = now;
        this.thump(Math.min(1, F.thump) * P.touch);
      }
    } else this.touchGain.gain.setTargetAtTime(0, t, 0.1);
  }
}
