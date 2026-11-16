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
export type SndProg = 'still' | 'calm' | 'pop' | 'drift' | 'mystic' | 'custom';
export type BassSound = 'synth' | 'sub' | 'round' | 'upright' | 'acid' | 'picked';
export type DrumKit = 'soft' | '808' | 'punchy' | 'brush' | 'hand';
export type PadSound = 'soft' | 'strings' | 'organ' | 'choir' | 'shimmer';
export type SndChordMove = 'bars' | 'energy' | 'burst' | 'song';
/** Held sounds sing while the finger is down; the rest are the struck voices, played as you land and cross notes. */
export type TouchSound = 'theremin' | 'lead' | 'pad' | 'organ' | Voice;
export type TouchMode = 'glide' | 'notes' | 'chord';
const HELD: Record<string, { a: OscillatorType; b: OscillatorType; ratio: number; mix: number; q: number; attack: number; gain: number }> = {
  theremin: { a: 'sine', b: 'triangle', ratio: 2, mix: 0.3, q: 0.7, attack: 0.03, gain: 1 },
  lead: { a: 'sawtooth', b: 'square', ratio: 1.005, mix: 0.45, q: 5, attack: 0.02, gain: 0.55 },
  pad: { a: 'triangle', b: 'sawtooth', ratio: 1.008, mix: 0.35, q: 1, attack: 0.25, gain: 0.8 },
  organ: { a: 'sine', b: 'sine', ratio: 2, mix: 0.6, q: 0.7, attack: 0.015, gain: 0.85 },
};
export const isHeldTouch = (s: string) => s in HELD;
interface TouchVoice {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  mix: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  lfo: OscillatorNode;
  vib: GainNode;
  sound: string;
  id: number;
  x: number;
  y: number;
  speed: number;
  deg: number;
  on: boolean;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
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
const PROGS: Record<Exclude<SndProg, 'custom'>, number[]> = {
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

// Bass sounds: the body wave, how its low-pass sweeps (from × cut down to
// cut Hz, opening with the energy), how much sine underneath, and how it rings.
interface BassDef {
  type: OscillatorType;
  cut: number;
  from: number;
  sweep: number;
  open: number;
  q: number;
  sub: number;
  attack: number;
  hold: number; // level after the attack, as a share of the peak
  ring?: number; // the longest a note rings (plucked strings die away)
  click?: number; // pick noise, band Hz
  drop?: number; // cents the note starts sharp
  gain: number;
}
const BASSES: Record<BassSound, BassDef> = {
  synth: { type: 'sawtooth', cut: 250, from: 4, sweep: 0.12, open: 2.8, q: 3, sub: 0.9, attack: 0.008, hold: 0.62, gain: 1 },
  sub: { type: 'sine', cut: 400, from: 1, sweep: 0.05, open: 0, q: 0.5, sub: 0, attack: 0.012, hold: 0.85, gain: 1.35 },
  round: { type: 'triangle', cut: 500, from: 1.6, sweep: 0.2, open: 1, q: 0.7, sub: 0.7, attack: 0.02, hold: 0.8, gain: 0.95 },
  upright: { type: 'triangle', cut: 900, from: 2.5, sweep: 0.08, open: 0.6, q: 1, sub: 0.6, attack: 0.004, hold: 0.35, ring: 0.9, click: 900, drop: 25, gain: 1.3 },
  acid: { type: 'sawtooth', cut: 220, from: 12, sweep: 0.18, open: 4, q: 14, sub: 0.4, attack: 0.004, hold: 0.7, gain: 1.15 },
  picked: { type: 'square', cut: 700, from: 3.5, sweep: 0.1, open: 1.5, q: 2, sub: 0.6, attack: 0.003, hold: 0.45, ring: 1.4, click: 2500, gain: 0.8 },
};

const PAD_GAIN: Record<PadSound, number> = { soft: 1, strings: 1.35, organ: 0.85, choir: 3.6, shimmer: 1.05 };

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
  touchSound: TouchSound;
  touchMode: TouchMode;
  touchGlide: number; // 0 snaps … 1 slow slides
  touchVib: number; // vibrato that grows while a finger holds still
  touchAxis: 'up' | 'across'; // which way pitch runs
  touchOctave: number;
  accents: number;
  reverb: number;
  music: SndMusic;
  // Steering the chords.
  progList: number[]; // Your chords, as scale degrees (0 = the key's chord)
  chordMove: SndChordMove;
  chordBars: number;
  // Expression.
  length: number; // note length multiplier
  dyn: number; // loudness from particle speed
  bend: number; // pitch bends in from the particle's motion
  swing: number;
  arp: number; // strings sometimes roll the chord
  // Effects.
  echo: number;
  sweep: number; // a low-pass that opens with the energy
  field: number; // Field drive: how much count, speed and clumping lead (0 = none)
  chorus: number;
  depth: number; // near particles louder and wider, far ones quieter and roomier
  // Rhythm section.
  bass: number;
  bassSound: BassSound;
  bassTone: number; // -1 dark … 1 bright
  drums: number;
  kit: DrumKit;
  padSound: PadSound;
  attack: number; // 0 struck … 1 bowed
  bright: number; // -1 dark … 1 bright, over everything
  drive: number; // warm saturation over everything
  lofi: number; // fewer bits, less top, tape hiss and crackle
  grid: string; // Beat grid edits: 64 chars, 4 rows (kick, snare, hat, bass) × 16 steps; '+' forces a hit, '-' silences one
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
  fingers?: { id: number; x: number; y: number }[]; // every finger down (touch screens); else touch is used
  thump: number; // a burst happened (0..1 strength)
  born: number; // particles spawned since last frame
  scene: boolean; // a new scene started
  shape: boolean; // a shape just formed
  pulse: number; // the music's kick envelope (0 without music)
  bpm: number;
  musicOn: boolean;
  pz: Float32Array; // depth, 0 far … 1 near
  depthOn: boolean;
  drop: boolean; // the music just dropped
  chroma: Float32Array | null; // which notes the song plays now (for following its chords)
}

interface NoteOpts {
  bend?: number; // cents to slide in from
  z?: number; // depth, 0 far … 1 near
}

/** The layers, in the order the sound studio lists them. */
export const LAYERS = ['chords', 'bass', 'drums', 'strings', 'steps', 'pad', 'chimes', 'scan', 'grains', 'touch', 'accents'] as const;
export type Layer = (typeof LAYERS)[number];
const LI = Object.fromEntries(LAYERS.map((l, i) => [l, i])) as Record<Layer, number>;
const LOG = 1024;

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
  private chordPos = 0; // progress to the next chord (With the energy)
  private lastChange = 0; // beat of the last chord change
  private eSlow = 0; // energy, slower: a jump above it is a surge
  private songRoot = -1; // the chord heard in the song (Follow the song)
  private songLive = false;
  private moveAvg = 1; // how far a crossing particle usually moves a frame
  private depthOn = false;
  // Effects, built the first time they're turned up.
  private tone: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private echoIn: GainNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoFb: GainNode | null = null;
  // Field drive state.
  private voicing = 0; // 1 tense, -1 open
  private spreadS = 0.6;
  private lenK = 1;
  private swept = false;
  private echoFbNow = 0;
  private chorusOut: GainNode | null = null;
  // The end of the effects chain (feeds the compressor); Drive and Lo-fi are
  // spliced in here the first time they're turned up.
  private shelf: BiquadFilterNode;
  private chainEnd: AudioNode;
  private driveShaper: WaveShaperNode | null = null;
  private driveK = -1;
  private lofiShaper: WaveShaperNode | null = null;
  private lofiLp: BiquadFilterNode | null = null;
  private lofiHiss: GainNode | null = null;
  private lofiBits = -1;
  private padKind = '';
  // --- For the sound studio (only filled while it is open) ---
  /** Mute and solo, for listening (not saved). */
  muted = new Set<Layer>();
  solo: Layer | null = null;
  /** Note log: a ring of the last notes (layer, beat, loudness, pitch 0..1, length in beats). */
  logOn = false;
  logN = 0;
  evL = new Uint8Array(LOG);
  evB = new Float64Array(LOG);
  evV = new Float32Array(LOG);
  evP = new Float32Array(LOG);
  evD = new Float32Array(LOG);
  /** Level per layer, jumping with each note and falling back. */
  levels = new Float32Array(LAYERS.length);
  /** Beat grid: what played this bar and last (kick, snare, hat, bass × 16 steps). */
  gridNow = new Uint8Array(64);
  gridLast = new Uint8Array(64);
  /** Beats since start and the tempo, for drawing. */
  get beatNow() {
    return this.beat;
  }
  bpmNow = 90;
  private cur: Layer = 'strings';
  private lastRootLogged = -999;
  // Pad.
  private padOsc: OscillatorNode[] = [];
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private padLfo = 0;
  private padChord = '';
  // Strings: when each last rang (ms).
  /** When each string last rang (ms), for drawing them. */
  stringAt: number[] = [];
  // How many crossings each string usually gets a frame, so a sudden crowd rings it.
  private stringAvg: number[] = [];
  // Step sequencer.
  /** The step column playing now (0-15), for drawing it. */
  step = -1;
  private grid = new Float32Array(ROWS);
  // Touch.
  private touchVoices: TouchVoice[] = [];
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
    this.comp = comp;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // Filter sweep: a low-pass over everything, wide open unless Sweep is up.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 20000;
    // Brightness: a high shelf over everything (flat at 0).
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'highshelf';
    this.shelf.frequency.value = 3000;
    this.shelf.gain.value = 0;
    this.master.connect(this.tone).connect(this.shelf).connect(comp);
    this.chainEnd = this.shelf;
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
    if (p.echo > 0) this.ensureEcho();
    if (this.echoIn && this.echoFb) {
      this.echoIn.gain.setTargetAtTime(p.echo * 0.55, t, 0.1);
      this.echoFb.gain.setTargetAtTime(0.25 + p.echo * 0.35, t, 0.1);
      this.echoFbNow = 0;
    }
    if (p.chorus > 0) this.ensureChorus();
    if (this.chorusOut) this.chorusOut.gain.setTargetAtTime(p.chorus * 0.8, t, 0.1);
    this.shelf.gain.setTargetAtTime(p.bright * 9, t, 0.1);
    if (p.drive > 0) this.ensureDrive();
    if (this.driveShaper) {
      const k = Math.round(p.drive * 20) / 20;
      if (k !== this.driveK) {
        this.driveK = k;
        if (k === 0) this.driveShaper.curve = null;
        else {
          // tanh saturation, scaled back so a hotter drive is warmer, not louder.
          const a = 1 + k * 9, c = new Float32Array(1024);
          for (let i = 0; i < 1024; i++) c[i] = (Math.tanh(a * ((i / 1023) * 2 - 1)) / a) * (1 + k * 1.2);
          this.driveShaper.curve = c;
        }
      }
    }
    if (p.lofi > 0) this.ensureLofi();
    if (this.lofiShaper && this.lofiLp && this.lofiHiss) {
      const bits = p.lofi === 0 ? 0 : Math.round(12 - p.lofi * 8);
      if (bits !== this.lofiBits) {
        this.lofiBits = bits;
        if (!bits) this.lofiShaper.curve = null;
        else {
          const st = 2 ** bits / 2, c = new Float32Array(4096);
          for (let i = 0; i < 4096; i++) c[i] = Math.round(((i / 4095) * 2 - 1) * st) / st;
          this.lofiShaper.curve = c;
        }
      }
      this.lofiLp.frequency.setTargetAtTime(p.lofi === 0 ? 20000 : 9000 - p.lofi * 6500, t, 0.1);
      this.lofiHiss.gain.setTargetAtTime(p.lofi * 0.012, t, 0.2);
    }
    this.setPad(p.padSound);
    if (p.sweep === 0) {
      this.tone.frequency.setTargetAtTime(20000, t, 0.2);
      this.tone.Q.value = 0.7;
    }
  }

  audible(l: Layer) {
    return this.solo ? this.solo === l : !this.muted.has(l);
  }

  private log(l: Layer, v: number, pitch: number, dur: number, when = 0) {
    this.levels[LI[l]] = Math.min(1, Math.max(this.levels[LI[l]], v * 1.4));
    if (!this.logOn) return;
    const k = this.logN++ % LOG;
    this.evL[k] = LI[l];
    this.evB[k] = this.beat + when * (this.bpmNow / 60);
    this.evV[k] = v;
    this.evP[k] = pitch;
    this.evD[k] = dur;
  }

  /** The progression as scale degrees (Follow the song: just the chord heard). */
  progression(): number[] {
    if (this.p.chordMove === 'song' && this.songLive && this.songRoot >= 0) return [this.songRoot];
    return this.p.prog === 'custom' ? (this.p.progList.length ? this.p.progList : [0]) : PROGS[this.p.prog];
  }
  /** Which entry of the progression plays now. */
  progIndex() {
    return this.chord % this.progression().length;
  }
  /** A chord's name from its scale degree: "Am", "F", "B°". */
  chordName(deg: number) {
    const sc = SCALES[this.p.scale];
    const L = sc.length;
    const at = (j: number) => sc[(((deg + j) % L) + L) % L] + 12 * Math.floor((deg + j) / L);
    const root = (this.p.root + at(0) + 120) % 12;
    const third = at(2) - at(0), fifth = at(4) - at(0);
    const q = fifth === 6 ? '°' : fifth === 8 ? '+' : third === 3 ? 'm' : third === 4 ? '' : 'sus';
    return NOTE_NAMES[root] + q;
  }
  chordNow() {
    return this.chordName(this.chordRoot());
  }
  /** The next chord, or '' when it can't be known (following the song). */
  chordNext() {
    if (this.p.chordMove === 'song' && this.songLive) return '';
    const pr = this.progression();
    return this.chordName(pr[(this.chord + 1) % pr.length]);
  }
  /** Beats until the chord changes, when that is known. */
  beatsToChange() {
    if (this.p.chordMove !== 'bars') return -1;
    const per = 4 * Math.max(1, this.p.chordBars);
    return per - (this.beat % per);
  }
  /** Jump straight to entry i of the progression (a chord pad). */
  jumpChord(i: number) {
    const n = this.progression().length;
    this.chord = this.chord - (this.chord % n) + (((i % n) + n) % n);
    this.lastChange = this.beat;
    this.chordPos = 0;
  }

  /** Jump to the next chord now (the Next chord button). */
  nextChord() {
    this.chord++;
    this.lastChange = this.beat;
    this.chordPos = 0;
    this.songRoot = -1;
  }

  // Echo: a delay in time with the beat (a dotted eighth), each repeat darker.
  private ensureEcho() {
    if (this.echoIn) return;
    const ctx = this.ctx;
    this.echoIn = ctx.createGain();
    this.echoIn.gain.value = 0;
    const d = (this.echoDelay = ctx.createDelay(2));
    d.delayTime.value = 0.5;
    const fb = (this.echoFb = ctx.createGain());
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 220;
    this.echoIn.connect(d).connect(lp).connect(hp);
    hp.connect(fb).connect(d);
    hp.connect(this.master);
    const w = ctx.createGain();
    w.gain.value = 0.4;
    hp.connect(w).connect(this.wet);
  }

  private splice(a: AudioNode, b: AudioNode) {
    this.chainEnd.disconnect(this.comp);
    this.chainEnd.connect(a);
    b.connect(this.comp);
    this.chainEnd = b;
  }

  // Drive: a soft-clipping waveshaper, warm at low settings, fuzzy at the top.
  private ensureDrive() {
    if (this.driveShaper) return;
    this.driveShaper = this.ctx.createWaveShaper();
    this.driveShaper.oversample = '2x';
    this.splice(this.driveShaper, this.driveShaper);
  }

  // Lo-fi: fewer bits (a staircase waveshaper), the top rolled off, and a
  // little tape hiss underneath.
  private ensureLofi() {
    if (this.lofiShaper) return;
    const ctx = this.ctx;
    this.lofiShaper = ctx.createWaveShaper();
    this.lofiLp = ctx.createBiquadFilter();
    this.lofiLp.type = 'lowpass';
    this.lofiLp.frequency.value = 20000;
    this.lofiShaper.connect(this.lofiLp);
    this.splice(this.lofiShaper, this.lofiLp);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4000;
    bp.Q.value = 0.5;
    this.lofiHiss = ctx.createGain();
    this.lofiHiss.gain.value = 0;
    src.connect(bp).connect(this.lofiHiss).connect(this.comp);
    src.start();
  }

  // Pad sounds: the four chord voices' waves, detune and filter.
  private setPad(kind: PadSound) {
    if (kind === this.padKind) return;
    this.padKind = kind;
    const waves: Record<PadSound, OscillatorType[]> = {
      soft: ['sine', 'triangle', 'sine', 'triangle'],
      strings: ['sawtooth', 'sawtooth', 'sawtooth', 'sawtooth'],
      organ: ['square', 'sine', 'square', 'sine'],
      choir: ['sawtooth', 'triangle', 'sawtooth', 'triangle'],
      shimmer: ['triangle', 'sine', 'triangle', 'sine'],
    };
    const spread = kind === 'shimmer' ? 14 : kind === 'strings' ? 8 : kind === 'organ' ? 1 : 4;
    this.padOsc.forEach((o, k) => {
      o.type = waves[kind][k];
      o.detune.value = (k - 1.5) * spread;
    });
    // Choir: a band-pass on a vowel-ish formant; the rest a low-pass.
    this.padFilter.type = kind === 'choir' ? 'bandpass' : 'lowpass';
    this.padFilter.Q.value = kind === 'choir' ? 2.2 : kind === 'strings' ? 0.8 : 0.3;
  }

  // Chorus: two slowly wobbling copies, a few milliseconds late, left and right.
  private ensureChorus() {
    if (this.chorusOut) return;
    const ctx = this.ctx;
    this.chorusOut = ctx.createGain();
    this.chorusOut.gain.value = 0;
    this.chorusOut.connect(this.comp);
    for (const side of [-1, 1]) {
      const d = ctx.createDelay(0.05);
      d.delayTime.value = side < 0 ? 0.017 : 0.023;
      const l = ctx.createOscillator();
      l.frequency.value = side < 0 ? 0.6 : 0.77;
      const lg = ctx.createGain();
      lg.gain.value = 0.0035;
      l.connect(lg).connect(d.delayTime);
      const pn = ctx.createStereoPanner();
      pn.pan.value = side * 0.85;
      this.tone.connect(d).connect(pn).connect(this.chorusOut);
      l.start();
    }
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

  // A held voice for one finger: two oscillators through a low-pass, with a
  // vibrato LFO on their pitch.
  private touchVoice(id: number): TouchVoice {
    const free = this.touchVoices.find((v) => !v.on && v.id === id) ?? this.touchVoices.find((v) => !v.on);
    if (free) return free;
    const ctx = this.ctx;
    const v: TouchVoice = {
      osc: ctx.createOscillator(), osc2: ctx.createOscillator(), mix: ctx.createGain(), filter: ctx.createBiquadFilter(),
      gain: ctx.createGain(), pan: ctx.createStereoPanner(), lfo: ctx.createOscillator(), vib: ctx.createGain(),
      sound: '', id, x: 0, y: 0, speed: 0, deg: -999, on: false,
    };
    v.filter.type = 'lowpass';
    v.gain.gain.value = 0;
    v.osc.connect(v.filter);
    v.osc2.connect(v.mix).connect(v.filter);
    v.filter.connect(v.gain).connect(v.pan);
    v.lfo.frequency.value = 5.5;
    v.vib.gain.value = 0;
    v.lfo.connect(v.vib);
    v.vib.connect(v.osc.detune);
    v.vib.connect(v.osc2.detune);
    this.send(v.pan, 0.5);
    v.osc.start();
    v.osc2.start();
    v.lfo.start();
    this.touchVoices.push(v);
    return v;
  }
  private touchRelease(v: TouchVoice, t: number) {
    if (!v.on) return;
    v.on = false;
    const H = HELD[v.sound];
    v.gain.gain.setTargetAtTime(0, t, H ? Math.max(0.08, H.attack) : 0.08);
    v.vib.gain.setTargetAtTime(0, t, 0.1);
  }
  // Fingers to voices. Up/down (or across) picks the scale note, the other
  // way is tone and stereo; moving faster plays louder; holding still lets a
  // vibrato bloom. Held sounds sing; struck ones play as you land and as
  // you cross into each new note (a strum).
  private touchFrame(F: SoundFrame, t: number, w: number, h: number) {
    const P = this.p;
    const fingers = F.fingers && F.fingers.length ? F.fingers.slice(0, 5) : F.touch.down ? [{ id: -1, x: F.touch.x, y: F.touch.y }] : [];
    const live = new Set(fingers.map((f) => f.id));
    for (const v of this.touchVoices) if (v.on && !live.has(v.id)) this.touchRelease(v, t);
    const held = HELD[P.touchSound];
    const across = P.touchAxis === 'across';
    const base = 48 + 12 * P.touchOctave;
    for (const f of fingers) {
      let v = this.touchVoices.find((x) => x.on && x.id === f.id);
      const fresh = !v;
      if (!v) {
        v = this.touchVoice(f.id);
        v.on = true;
        v.id = f.id;
        v.x = f.x;
        v.y = f.y;
        v.speed = 0;
        v.deg = -999;
      }
      const mv = Math.hypot(f.x - v.x, f.y - v.y) / Math.max(1e-3, F.dt);
      v.speed += (Math.min(1, mv / 900) - v.speed) * 0.15;
      v.x = f.x;
      v.y = f.y;
      const pos = across ? Math.min(1, Math.max(0, f.x / w)) : 1 - Math.min(1, Math.max(0, f.y / h));
      const tone = across ? 1 - Math.min(1, Math.max(0, f.y / h)) : Math.min(1, Math.max(0, f.x / w));
      let deg = Math.round(pos * (this.L * P.range - 1));
      if (P.touchMode === 'chord') deg = this.toChord(deg);
      const pan = tone * 1.2 - 0.6;
      const lvl = P.touch * (0.4 + v.speed * 0.6);
      this.levels[LI.touch] = Math.max(this.levels[LI.touch], lvl);
      if (held) {
        if (v.sound !== P.touchSound) {
          v.sound = P.touchSound;
          v.osc.type = held.a;
          v.osc2.type = held.b;
          v.mix.gain.value = held.mix;
          v.filter.Q.value = held.q;
        }
        const fr = this.freq(deg, base);
        // Glide: from a snap to a long slide; Notes steps cleanly.
        const tau = fresh ? 0.001 : P.touchMode === 'notes' ? 0.004 : 0.008 + P.touchGlide * 0.25;
        v.osc.frequency.setTargetAtTime(fr, t, tau);
        v.osc2.frequency.setTargetAtTime(fr * held.ratio, t, tau);
        // Chord: the second oscillator sings the chord tone above instead.
        if (P.touchMode === 'chord') v.osc2.frequency.setTargetAtTime(this.freq(this.toChord(deg + 2), base), t, tau);
        v.filter.frequency.setTargetAtTime(400 + tone * tone * 6000 + v.speed * 1500, t, 0.05);
        v.pan.pan.setTargetAtTime(pan, t, 0.05);
        v.vib.gain.setTargetAtTime(P.touchVib * 40 * (1 - v.speed) ** 2, t, 0.4);
        const audible = this.audible('touch');
        v.gain.gain.setTargetAtTime(audible ? lvl * 0.3 * held.gain : 0, t, fresh ? held.attack : 0.03);
        if (P.touchMode === 'notes' && v.deg !== deg && !fresh && audible) {
          // A small re-accent on each new note.
          v.gain.gain.setValueAtTime(lvl * 0.18 * held.gain, t);
          v.gain.gain.setTargetAtTime(lvl * 0.3 * held.gain, t + 0.01, 0.04);
        }
        v.deg = deg;
      } else {
        if (v.sound !== P.touchSound) v.sound = P.touchSound;
        v.gain.gain.setTargetAtTime(0, t, 0.05);
        if (v.deg === deg) continue;
        v.deg = deg;
        this.cur = 'touch';
        const vel = Math.min(1, P.touch * (fresh ? 0.75 : 0.45 + v.speed * 0.5));
        const voice = P.touchSound as Voice;
        const up = P.touchOctave * this.L;
        // Chord: landing strums the chord from the finger's note up.
        if (P.touchMode === 'chord' && fresh) [0, 2, 4].forEach((k, i) => this.note(this.toChord(deg + k) + up, vel * (1 - i * 0.15), pan, voice, i * 0.03));
        else this.note(deg + up, vel, pan, voice);
      }
    }
  }

  private recDest: MediaStreamAudioDestinationNode | null = null;
  private recMix: MediaStreamAudioSourceNode | null = null;
  /** A live track of what the particles play, with `mixIn` (the music source) mixed under it, for recording. */
  tap(mixIn: MediaStreamTrack | null): MediaStreamTrack | null {
    const ctx = this.ctx;
    if (!this.recDest) {
      this.recDest = ctx.createMediaStreamDestination();
      this.comp.connect(this.recDest);
    }
    this.recMix?.disconnect();
    this.recMix = null;
    if (mixIn) {
      this.recMix = ctx.createMediaStreamSource(new MediaStream([mixIn]));
      this.recMix.connect(this.recDest);
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return this.recDest.stream.getAudioTracks()[0]?.clone() ?? null;
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

  private send(node: AudioNode, wet = 1, echo = true) {
    node.connect(this.dry);
    if (echo && this.echoIn && this.p.echo > 0) node.connect(this.echoIn);
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
    if (this.p.chordMove === 'song' && this.songLive && this.songRoot >= 0) return this.songRoot;
    const prog = this.p.prog === 'custom' ? (this.p.progList.length ? this.p.progList : [0]) : PROGS[this.p.prog];
    return prog[this.chord % prog.length];
  }

  // The k-th chord tone, counting up across octaves (0 = root, 1 = third, 2 = fifth, 3 = root an octave up…).
  private chordTone(k: number) {
    // Stack every other step of the scale on the root: root, third, fifth.
    const oct = Math.floor(k / 3);
    const r = k - oct * 3;
    // Field drive voicings: a tight crowd swaps the octave root for the
    // seventh (tense); a spread-out field lifts the third an octave (open).
    if (this.voicing > 0 && r === 0 && oct > 0) return this.chordRoot() + 6 + (oct - 1) * this.L;
    if (this.voicing < 0 && r === 1) return this.chordRoot() + 2 + (oct + 1) * this.L;
    return this.chordRoot() + r * 2 + oct * this.L;
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

  private note(deg: number, vel: number, pan: number, voice: Voice, when = 0, o?: NoteOpts) {
    const P = this.p;
    // Depth: near particles louder and wider, far ones quieter and further into the room.
    let wetMore = 0;
    if (o?.z !== undefined && this.depthOn && P.depth > 0) {
      const z = o.z;
      vel *= 1 + P.depth * (0.4 + 0.8 * z - 1);
      pan *= 1 + P.depth * (0.35 + 0.9 * z - 1);
      wetMore = P.depth * (1 - z) * 0.9;
    }
    if (this.voices >= MAX_VOICES || this.tokens < 1 || vel < 0.02) return;
    this.tokens--;
    const Vd = VOICES[voice];
    const fl = this.freq(deg) * 2 ** (Vd.octave ?? 0);
    this.log(this.cur, vel, Math.log2(fl / 55) / 6, Vd.decay * P.length * this.lenK * (this.bpmNow / 60), when);
    if (!this.audible(this.cur)) return;
    this.voices++;
    const V = VOICES[voice];
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const f = this.freq(deg) * 2 ** (V.octave ?? 0);
    // Low notes ring longer, like real bars and strings.
    const decay = V.decay * (1.3 - Math.min(1, f / 1600) * 0.6) * P.length * this.lenK;
    const end = t + decay + 0.05;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = V.type;
    o1.frequency.value = f;
    o2.type = V.type === 'sawtooth' ? 'square' : 'sine';
    o2.frequency.value = f * V.ratio;
    const bend = (V.bend ?? 0) + (o?.bend ?? 0);
    if (bend) {
      // Slide into the note: a koto's pluck, or the particle's motion.
      const glide = o?.bend ? 0.16 : 0.08;
      for (const os of [o1, o2]) {
        os.detune.setValueAtTime(bend, t);
        os.detune.linearRampToValueAtTime(0, t + glide);
      }
    }
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    const peak = vel * 0.22 * (V.gain ?? 1);
    // Attack: from struck to bowed, notes swelling in.
    const atk = Math.max(V.attack ?? 0.004, P.attack * Math.min(0.35, decay * 0.4));
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
    this.send(pn, 1 + wetMore);
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
    this.cur = 'accents';
    const save = this.tokens;
    this.tokens = 99;
    for (let j = 0; j < 5; j++) this.note(this.chordTone(j + 1), 0.55 * k, -0.6 + j * 0.3, 'bell', j * 0.07);
    this.tokens = save;
  }

  // Velocity from speed: a fast particle plays louder than a drifting one.
  private dynOf(vrel: number) {
    return 1 + this.p.dyn * (Math.min(1.5, 0.3 + 0.7 * vrel) - 1);
  }

  // Pitch bend from motion: fast movers slide into the note, from above when
  // moving right, from below when moving left (up to a whole tone).
  private bendOf(vrel: number, dir: number) {
    return this.p.bend > 0 ? this.p.bend * dir * Math.min(1, vrel * 0.5) * 200 : 0;
  }

  // How the chords move on (Chord change).
  private steerChords(F: SoundFrame, before: number, beats: number) {
    const P = this.p;
    const per = 4 * Math.max(1, P.chordBars);
    const since = this.beat - this.lastChange;
    this.eSlow += (this.energy - this.eSlow) * Math.min(1, F.dt * 0.25);
    let move = false;
    if (P.chordMove === 'song' && F.musicOn) {
      // Follow the song: once a beat, the scale chord that best matches the notes heard.
      if (F.chroma && Math.floor(this.beat) !== Math.floor(before)) {
        const sc = SCALES[P.scale];
        const L = sc.length;
        let tot = 0;
        for (let k = 0; k < 12; k++) tot += F.chroma[k];
        let best = -1, bv = 0;
        for (let d = 0; d < L; d++) {
          const pc = (j: number) => (P.root + sc[(d + j) % L]) % 12;
          const v = F.chroma[pc(0)] + F.chroma[pc(2)] * 0.7 + F.chroma[pc(4)] * 0.8;
          if (v > bv) (bv = v), (best = d);
        }
        if (tot > 0.5 && best >= 0 && bv / tot > 0.35) this.songRoot = best;
      }
      return;
    }
    if (P.chordMove === 'energy') {
      // Faster when busy, slower when calm; a sudden surge moves on at once.
      this.chordPos += (beats / per) * (0.35 + this.energy * 2.5);
      if (this.chordPos >= 1) (this.chordPos -= 1), (move = true);
      if (this.energy - this.eSlow > 0.12 && since > 2) move = true;
    } else if (P.chordMove === 'burst') {
      // On a burst, a puff of new particles or a drop in the music (or after a long wait).
      if ((F.thump > 0.3 || F.drop || F.scene || F.born > Math.max(40, F.n * 0.04)) && since > 1) move = true;
      else if (since >= per * 2) move = true;
    } else if (Math.floor(this.beat / per) !== Math.floor(before / per)) move = true;
    if (move) {
      this.chord++;
      this.lastChange = this.beat;
    }
  }

  // Bass: one body oscillator through a low-pass (its sweep makes the
  // character) with a sine underneath for weight.
  private bassNote(deg: number, vel: number, len: number, when: number) {
    if (this.voices >= MAX_VOICES) return;
    {
      let f0 = this.freq(deg, 36);
      while (f0 < 38) f0 *= 2;
      while (f0 > 200) f0 /= 2;
      this.log('bass', vel, Math.log2(f0 / 55) / 6, len * (this.bpmNow / 60), when);
    }
    if (!this.audible('bass')) return;
    this.voices++;
    const B = BASSES[this.p.bassSound] ?? BASSES.synth;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    let f = this.freq(deg, 36);
    while (f < 38) f *= 2;
    while (f > 200) f /= 2;
    if (B.ring) len = Math.min(len, B.ring);
    const end = t + len + 0.1;
    const o = ctx.createOscillator();
    o.type = B.type;
    o.frequency.value = f;
    if (B.drop) {
      o.detune.setValueAtTime(B.drop, t);
      o.detune.linearRampToValueAtTime(0, t + 0.05);
    }
    const sub = ctx.createOscillator();
    sub.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = B.q;
    const cut = B.cut * (1 + this.energy * B.open) * 2 ** (this.p.bassTone * 1.5);
    lp.frequency.setValueAtTime(Math.min(15000, cut * B.from), t);
    lp.frequency.exponentialRampToValueAtTime(cut, t + B.sweep);
    const g = ctx.createGain();
    const lvl = vel * B.gain;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl * 0.24, t + B.attack);
    g.gain.setTargetAtTime(lvl * B.hold * 0.24, t + B.attack + 0.02, B.ring ? B.ring * 0.35 : 0.15);
    g.gain.setTargetAtTime(0.0001, t + len, 0.04);
    const sg = ctx.createGain();
    sg.gain.value = B.sub;
    o.connect(lp).connect(g);
    sub.connect(sg).connect(g);
    this.send(g, 0.12, false);
    const nodes: AudioScheduledSourceNode[] = [o, sub];
    if (B.click) {
      // A finger or pick on the string: a tiny burst of filtered noise.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = B.click;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(lvl * 0.25, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      src.connect(bp).connect(cg).connect(g);
      src.start(t, Math.random() * 0.8, 0.04);
    }
    for (const nd of nodes) {
      nd.start(t);
      nd.stop(end);
    }
    o.onended = () => {
      this.voices--;
      g.disconnect();
    };
  }

  // A pitched body that drops and dies away: kicks and toms.
  private body(when: number, f0: number, f1: number, drop: number, decay: number, amp: number, type: OscillatorType = 'sine', wet = 0.1) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + drop);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    this.send(g, wet, false);
    o.start(t);
    o.stop(t + decay + 0.05);
    o.onended = () => g.disconnect();
  }

  // Filtered noise with an envelope: snares, claps, hats, brushes, shakers.
  private hiss(when: number, type: BiquadFilterType, f: number, q: number, attack: number, decay: number, amp: number, pan = 0, wet = 0.2) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    src.connect(fl).connect(g).connect(pn);
    this.send(pn, wet, false);
    src.start(t, Math.random() * 0.7, attack + decay + 0.02);
    src.onended = () => pn.disconnect();
  }

  private kick(k: number, when: number) {
    this.log('drums', k, 0.02, 0.25, when);
    if (!this.audible('drums')) return;
    switch (this.p.kit) {
      case '808': return this.body(when, 120, 46, 0.06, 0.9, 0.8 * k);
      case 'punchy':
        this.hiss(when, 'highpass', 3000, 0.7, 0.001, 0.012, 0.3 * k, 0, 0);
        return this.body(when, 190, 50, 0.05, 0.28, 0.8 * k);
      case 'brush': return this.body(when, 95, 55, 0.08, 0.3, 0.6 * k);
      case 'hand': return this.body(when, 120, 92, 0.1, 0.42, 0.6 * k, 'sine', 0.25); // low tom
      default: return this.body(when, 150, 45, 0.12, 0.35, 0.75 * k);
    }
  }

  private snare(k: number, when: number) {
    this.log('drums', k, 0.12, 0.25, when);
    if (!this.audible('drums')) return;
    switch (this.p.kit) {
      case '808': // a clap: three quick bursts and a tail
        for (let j = 0; j < 3; j++) this.hiss(when + j * 0.011, 'bandpass', 1400, 1.2, 0.001, 0.02, 0.4 * k, 0, 0.3);
        return this.hiss(when + 0.03, 'bandpass', 1300, 1, 0.002, 0.18, 0.3 * k, 0, 0.4);
      case 'punchy':
        this.body(when, 260, 190, 0.05, 0.12, 0.35 * k, 'triangle', 0.2);
        return this.hiss(when, 'highpass', 1800, 0.7, 0.001, 0.16, 0.45 * k, 0, 0.3);
      case 'brush': return this.hiss(when, 'bandpass', 3200, 0.6, 0.035, 0.22, 0.4 * k, -0.2, 0.3); // a swish
      case 'hand': // rim / clave
        this.body(when, 1800, 1700, 0.02, 0.06, 0.25 * k, 'sine', 0.3);
        return this.hiss(when, 'highpass', 4000, 0.7, 0.001, 0.01, 0.15 * k, 0, 0.1);
      default:
        this.body(when, 220, 160, 0.08, 0.1, 0.3 * k, 'triangle', 0.35);
        return this.hiss(when, 'highpass', 1200, 0.7, 0.003, 0.2, 0.35 * k, 0, 0.35);
    }
  }

  private hat(k: number, when: number, open: boolean) {
    this.log('drums', k * 0.6, 0.22, 0.1, when);
    if (!this.audible('drums')) return;
    switch (this.p.kit) {
      case '808': return this.hiss(when, 'highpass', 8500, 0.7, 0.001, open ? 0.35 : 0.035, 0.22 * k, 0.3, 0.1);
      case 'punchy': return this.hiss(when, 'bandpass', 10000, 1.5, 0.001, open ? 0.25 : 0.03, 0.3 * k, 0.3, 0.1);
      case 'brush': // a ride cymbal ping
        this.body(when, 3150, 3100, 0.1, open ? 0.9 : 0.5, 0.05 * k, 'sine', 0.4);
        return this.hiss(when, 'highpass', 7000, 0.7, 0.001, 0.25, 0.06 * k, 0.4, 0.3);
      case 'hand': return this.hiss(when, 'bandpass', 6500, 1, 0.012, open ? 0.15 : 0.06, 0.18 * k, 0.35, 0.1); // shaker
      default: return this.hiss(when, 'highpass', 7000, 0.7, 0.002, open ? 0.22 : 0.045, 0.22 * k, 0.3, 0.15);
    }
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
    // Field drive: count sets density, speed pushes the filter, hats and
    // echo, clumping moves the voicing. At 0 none of it; speed only pushes
    // past the middle (0.5).
    const D = P.field;
    this.spreadS += (F.spread - this.spreadS) * Math.min(1, F.dt);
    const dens = Math.max(-1, Math.min(1, Math.log2(Math.max(1, F.n) / 1500) / 3));
    this.lenK = Math.pow(2, 0.8 * D * dens);
    const busyK = Math.pow(2, 1.4 * D * dens);
    const tilt = D * ((1 - this.spreadS) * 2.4 - 1.2);
    if (this.voicing === 0) this.voicing = tilt > 0.3 ? 1 : tilt < -0.3 ? -1 : 0;
    else if (this.voicing > 0 ? tilt < 0.12 : tilt > -0.12) this.voicing = 0;
    const drumE = (e: number) => Math.min(1, e * Math.max(0.4, 1 + 1.6 * (D - 0.5)));

    // Clock: the song's tempo when playing along, else the Tempo setting.
    const bpm = P.music === 'along' && F.musicOn && F.bpm > 40 ? F.bpm : P.tempo;
    this.bpmNow = bpm;
    // Levels fall back between notes.
    const fall = Math.exp(-F.dt * 5);
    for (let k = 0; k < this.levels.length; k++) this.levels[k] *= fall;
    const beats = F.dt * (bpm / 60);
    const before = this.beat;
    this.beat += beats;
    this.songLive = F.musicOn;
    this.depthOn = F.depthOn;
    this.steerChords(F, before, beats);
    const rootNow = this.chordRoot();
    if (rootNow !== this.lastRootLogged) {
      this.lastRootLogged = rootNow;
      this.cur = 'chords';
      this.log('chords', 1, rootNow, 0);
    }
    // Echo in time: a dotted eighth.
    if (this.echoDelay && P.echo > 0) {
      const d = Math.min(1.9, (60 / bpm) * 0.75);
      if (Math.abs(this.echoDelay.delayTime.value - d) > 0.002) this.echoDelay.delayTime.setTargetAtTime(d, t, 0.2);
    }
    // Filter sweep: closed and dark when calm, opening as the field speeds up.
    const sweep = Math.max(P.sweep, (D - 0.5) * 0.9);
    if (sweep > 0) {
      const fE = 280 * Math.pow(45, Math.min(1, this.energy * 2.2 + (fit ? F.pulse * 0.25 : 0)));
      this.tone.frequency.setTargetAtTime(Math.exp(Math.log(20000) * (1 - sweep) + Math.log(fE) * sweep), t, 0.25);
      this.tone.Q.value = 0.7 + sweep * 3.5;
      this.swept = true;
    } else if (this.swept) {
      this.swept = false;
      this.tone.frequency.setTargetAtTime(20000, t, 0.25);
      this.tone.Q.value = 0.7;
    }
    // A fast field feeds the echo back longer.
    if (this.echoFb && P.echo > 0) {
      const fb = Math.min(0.85, 0.25 + P.echo * 0.35 + Math.max(0, D - 0.5) * this.energy * 0.6);
      if (Math.abs(fb - this.echoFbNow) > 0.01) {
        this.echoFbNow = fb;
        this.echoFb.gain.setTargetAtTime(fb, t, 0.2);
      }
    }
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
        this.cur = 'accents';
        const save = this.tokens;
        this.tokens = 99;
        for (let j = 0; j < 3; j++) this.note(this.chordTone(6 + ((Math.random() * 4) | 0)), 0.35 * P.accents, Math.random() * 1.6 - 0.8, 'glass', j * 0.05);
        this.tokens = save;
      }
    }

    // Pad: the chord, swelling with energy and a slow breath, silent when still.
    const chordKey = `${P.scale}${P.root}${this.chordRoot()}${this.voicing}`;
    if (chordKey !== this.padChord) {
      this.padChord = chordKey;
      [0, 1, 2, 3].forEach((k) => this.padOsc[k].frequency.setTargetAtTime(this.freq(this.chordTone(k), 48), t, 0.5));
    }
    this.padLfo += F.dt * 0.6;
    const breath = 0.65 + 0.35 * Math.sin(this.padLfo);
    const lively = Math.max(0, Math.min(1, (this.energy - 0.04) * 3));
    const padLvl = P.pad * lively * breath * (0.4 + 0.6 * room) * Math.min(1.8, Math.sqrt(busyK));
    this.levels[LI.pad] = Math.max(this.levels[LI.pad], padLvl * 0.8);
    this.padGain.gain.setTargetAtTime(this.audible('pad') ? padLvl * 0.3 * PAD_GAIN[P.padSound] : 0, t, 0.4);
    if (P.pad > 0) {
      const pk = P.padSound;
      const f = pk === 'choir' ? 650 + this.energy * 500 + Math.sin(this.padLfo * 0.37) * 180 : (400 + this.energy * 1800 + F.spread * 400) * (pk === 'organ' ? 2.2 : pk === 'shimmer' ? 3 : pk === 'strings' ? 1.3 : 1);
      this.padFilter.frequency.setTargetAtTime(f, t, 0.5);
    }
    // Lo-fi crackle: the odd dusty click.
    if (P.lofi > 0 && Math.random() < F.dt * P.lofi * 5) this.grain(Math.random() * w, h * 0.05, w, h, P.lofi * 0.5, 1, 0.002, 0.05);

    // Strings: vertical lines across the screen; a particle crossing one
    // plucks it (a chord tone, higher in the upper half of the screen).
    this.cur = 'strings';
    if (P.strings > 0 && F.n > 0) {
      const N = Math.max(2, Math.round(P.stringCount));
      const count = new Uint16Array(N);
      const where = new Float32Array(N * 5);
      let mvSum = 0, mvN = 0;
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
          where[k * 5] = F.py[i];
          where[k * 5 + 1] = F.tone[i] ?? 0.5;
          where[k * 5 + 2] = Math.abs(b - a);
          where[k * 5 + 3] = b > a ? 1 : -1;
          where[k * 5 + 4] = F.pz[i] ?? 0.5;
          mvSum += Math.abs(b - a);
          mvN++;
        }
      }
      // Each string rings about rate times a second (more when the field is
      // busy), and more often while more particles than usual cross it.
      const rate = (0.6 + this.energy * 2) * busyK;
      if (mvN) this.moveAvg = this.moveAvg * 0.95 + (mvSum / mvN) * 0.05;
      for (let k = 0; k < N; k++) {
        const c = count[k] * stride;
        const avg = (this.stringAvg[k] = (this.stringAvg[k] ?? c) * 0.97 + c * 0.03);
        if (!count[k] || now - (this.stringAt[k] ?? 0) < 160) continue;
        if (Math.random() > rate * F.dt * Math.min(4, c / Math.max(0.5, avg)) || !gate()) continue;
        this.stringAt[k] = now;
        // Left to right climbs the chord across the Range; the top half of the screen sits higher.
        const span = Math.max(2, this.p.range * 3 - 1);
        const idx = Math.round(((k / Math.max(1, N - 1)) * 0.75 + (where[k * 5] < h * 0.5 ? 0.25 : 0)) * span);
        const vrel = where[k * 5 + 2] / Math.max(1e-3, this.moveAvg);
        const vel = P.strings * Math.min(1, 0.35 + Math.log2(1 + count[k] * stride) * 0.12) * room * this.dynOf(vrel);
        const pan = ((k + 1) / (N + 1)) * 1.6 - 0.8;
        const opts: NoteOpts = { z: where[k * 5 + 4], bend: this.bendOf(vrel, where[k * 5 + 3]) };
        const voice = this.voiceFor(where[k * 5 + 1]);
        if (P.arp > 0 && Math.random() < P.arp) {
          // Arpeggio: roll up (or down) the chord from this string, in sixteenths.
          const dir = Math.random() < 0.6 ? 1 : -1;
          const gap = (60 / bpm) / (P.arp > 0.6 ? 8 : 4);
          const save = this.tokens;
          this.tokens = Math.max(this.tokens, 4);
          for (let j = 0; j < 4; j++) this.note(this.chordTone(idx + j * dir), vel * (1 - j * 0.15), pan, voice, j * gap, j ? { z: opts.z } : opts);
          this.tokens = Math.min(save, this.tokens);
        } else this.note(this.chordTone(idx), vel, pan, voice, 0, opts);
      }
    }

    // The sixteenth-note clock: Steps, bass and drums play on it. Swing
    // pushes every second sixteenth late.
    const s16 = Math.floor(this.beat * 4) % STEPS;
    if (s16 !== this.step && F.n > 0 && (P.seq > 0 || P.bass > 0 || P.drums > 0)) {
      const s = (this.step = s16);
      const stepDur = 60 / bpm / 4;
      const sw = s % 2 ? P.swing * 0.5 * stepDur : 0;
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

      // Steps: where particles crowd in this column, that row plays (a chord
      // tone), with a soft tick for the pulse.
      if (P.seq > 0) {
        this.cur = 'steps';
        if (s % 2 === 0 && !onKick && this.audible('steps')) this.grain(x0, h * 0.15, w, h, P.seq * (s % 4 === 0 ? 0.35 : 0.18), 0.9, 0.012, 0.1);
        let played = 0;
        if (tot && gate()) {
          const dyn = 1 + P.dyn * (0.4 + this.energy * 1.4 - 1);
          for (let r = 0; r < ROWS && played < (busyK > 1.7 ? 3 : busyK < 0.6 ? 1 : 2); r++) {
            if (this.grid[r] < (mean * 1.8) / Math.sqrt(busyK) || this.grid[r] < 2) continue;
            const deg = this.toChord(Math.round((1 - (r + 0.5) / ROWS) * (this.L * this.p.range * 0.85)));
            this.note(deg, P.seq * Math.min(1, this.grid[r] / (mean * 4)) * (s % 4 === 0 ? 1 : 0.7) * room * dyn, (s / STEPS) * 1.6 - 0.8, this.voiceFor(0), sw);
            played++;
          }
        }
      }

      const e = this.energy;
      // The bar starts over: this bar's hits become last bar's.
      if (s === 0) {
        this.gridLast.set(this.gridNow);
        this.gridNow.fill(0);
      }
      // Beat grid edits: '+' forces a hit on that step, '-' silences it.
      const ed = (row: number, nat: boolean) => {
        const c = P.grid.charCodeAt(row * 16 + s);
        // At high Field drive the particles can break a written silence.
        return c === 43 ? true : c === 45 ? nat && D > 0.6 && Math.random() < ((D - 0.6) / 0.4) * 0.7 : nat;
      };
      // Bass: the chord's root, low. Calm fields hold one long note a bar;
      // busier ones walk root and fifth, then eighths with pickups.
      if (P.bass > 0) {
        let deg = -999, len = stepDur * 2;
        if (e > 0.03) {
          if (s === 0) (deg = this.chordRoot()), (len = e < 0.15 ? stepDur * 14 : stepDur * 3.5);
          else if (e >= 0.15 && s === 8) (deg = e < 0.4 ? this.chordTone(2) : this.chordRoot()), (len = stepDur * 3);
          else if (e >= 0.4 && (s === 4 || s === 12)) (deg = s === 12 ? this.chordTone(3) : this.chordRoot()), (len = stepDur * 1.6);
          else if (e >= 0.65 && s % 4 === 2) (deg = this.chordTone(s === 14 ? 1 : 0)), (len = stepDur * 0.9);
        }
        const play = ed(3, deg > -999);
        if (play && deg === -999) (deg = this.chordRoot()), (len = stepDur * 1.5);
        if (play) {
          this.gridNow[48 + s] = 1;
          this.bassNote(deg, P.bass * (fit ? 0.5 : 1) * (s % 8 === 0 ? 1 : 0.8), len * P.length * this.lenK, sw);
        }
      }

      // Drums: the beat comes from the field. Particles low in this column
      // add kicks, in the middle snares, high up hi-hats; busier plays more.
      if (P.drums > 0) {
        const k = P.drums * (fit ? 0.4 : 1);
        const m2 = Math.max(1, mean * 2);
        const low = this.grid[6] + this.grid[7], mid = this.grid[3] + this.grid[4], top = this.grid[0] + this.grid[1];
        const live = e > 0.03;
        const de = drumE(e);
        const kick = ed(0, live && !onKick && (s === 0 || (s === 8 && de > 0.12) || (s % 2 === 0 && de > 0.25 && low > m2 * 1.6)));
        const snare = ed(1, live && (s === 4 || s === 12) && (de > 0.18 || mid > m2 * 1.2));
        const hat = ed(2, live && (s % 2 === 0 ? de > 0.08 || top > m2 : de > 0.45 && top > m2 * 0.8));
        if (kick) (this.gridNow[s] = 1), this.kick(k * (s === 0 ? 1 : 0.8), sw);
        if (snare) (this.gridNow[16 + s] = 1), this.snare(k * (0.6 + Math.min(0.4, mid / (m2 * 4))), sw);
        if (hat) (this.gridNow[32 + s] = 1), this.hat(k * (s % 4 === 0 ? 0.5 : 0.32) * (0.6 + e * 0.6), sw, s === 14 && e > 0.5);
      }
    }

    // Chimes: the hardest few bounces of this frame.
    this.cur = 'chimes';
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
        this.levels[LI.grains] = Math.max(this.levels[LI.grains], P.grain * 0.6);
        if (this.audible('grains')) this.grain(F.px[i], F.py[i], w, h, P.grain, F.speed);
      }
    } else this.grainDebt = 0;

    // Scanline: one sweep per bar (or every Sweep time seconds), playing a
    // few of the particles it passes.
    this.cur = 'scan';
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
          if (gate()) {
            const mv = F.px[i] - F.ox[i];
            const vrel = Math.abs(mv) / Math.max(1e-3, this.moveAvg);
            this.note(d, P.scan * 0.45 * this.dynOf(vrel), (x / w) * 1.6 - 0.8, this.voiceFor(F.tone[i] ?? 0.5), 0, { z: F.pz[i], bend: this.bendOf(vrel, mv >= 0 ? 1 : -1) });
          }
        }
      }
    }

    // Touch: every finger its own voice (see touchFrame).
    if (P.touch > 0) {
      this.touchFrame(F, t, w, h);
      if (F.thump > 0 && now - this.lastThump > 90) {
        this.lastThump = now;
        this.thump(Math.min(1, F.thump) * P.touch);
      }
    } else for (const v of this.touchVoices) this.touchRelease(v, t);
  }
}
