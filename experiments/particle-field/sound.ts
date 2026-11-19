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
export type Voice = 'marimba' | 'bell' | 'pluck' | 'glass' | 'kalimba' | 'epiano' | 'vibes' | 'musicbox' | 'harp' | 'steel' | 'flute' | 'synth' | 'koto' | 'guitar' | 'nylon' | 'sitar' | 'mandolin' | 'banjo' | 'pizz' | 'violin' | 'cello' | 'piano' | 'clav' | 'xylo' | 'chip' | 'acid' | 'organ' | 'bubble' | 'wind' | 'celesta' | 'tubular' | 'crystal' | 'tri' | 'gong' | 'wood' | 'drop';
// The chimes' own sound, or 'same' to play whatever the strings play.
export type HitSound = 'same' | Voice;
// What each grain is: dust (filtered noise), notes, rain, bubbles, vinyl or wood.
export type GrainSound = 'dust' | 'notes' | 'rain' | 'bubbles' | 'vinyl' | 'wood';
export type Band = 'colour' | 'lounge' | 'world' | 'fairy' | 'temple' | 'woods' | 'rain' | 'retro' | 'breeze' | 'strings';
export type SndTimbre = Band | Voice;
export type SndMusic = 'free' | 'room' | 'along';
export type SndProg = 'still' | 'calm' | 'pop' | 'drift' | 'mystic' | 'custom';
export type BassSound = 'synth' | 'sub' | 'round' | 'upright' | 'fingered' | 'picked' | 'slap' | 'fm' | 'moog' | 'pulse' | 'acid' | 'reese' | 'wobble' | 'fuzz' | 'house' | '808' | 'dist808' | 'growl' | 'rubber' | 'deep' | 'fretless' | 'brass' | 'psy' | 'chip';
import { bandsOf } from './audio.ts';
import { KITS, genreById, stepHit, DRUM_ROWS, type DrumKit, type DrumRow, type Body } from './drums.ts';
export type { DrumKit };
export type PadSound = 'soft' | 'strings' | 'organ' | 'choir' | 'shimmer' | 'warm' | 'tape' | 'glass' | 'bowed' | 'dark' | 'air' | 'brass' | 'reed' | 'hollow' | 'ooh' | 'cello' | 'ice' | 'pwm' | 'velvet' | 'analog' | 'vox' | 'drone' | 'mist' | 'supersaw' | 'harmonium' | 'cosmic';
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
const BANDS: Record<Band, Voice[]> = {
  colour: ['marimba', 'bell', 'pluck', 'glass'],
  lounge: ['epiano', 'vibes', 'harp', 'flute'],
  world: ['kalimba', 'steel', 'koto', 'musicbox'],
  fairy: ['celesta', 'musicbox', 'crystal', 'glass'],
  temple: ['gong', 'tubular', 'koto', 'bell'],
  woods: ['wood', 'marimba', 'kalimba', 'pluck'],
  rain: ['drop', 'pluck', 'glass', 'celesta'],
  retro: ['synth', 'tri', 'epiano', 'crystal'],
  breeze: ['wind', 'flute', 'harp', 'vibes'],
  strings: ['cello', 'guitar', 'mandolin', 'violin'],
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
  /** A plucked string (Karplus-Strong): pick brightness 0…1, and how much each pass keeps (ring). */
  ks?: { bright: number; keep: number };
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
  // Strings: plucked ones are a modelled string; bowed ones a swelling saw.
  guitar: { type: 'triangle', ratio: 2, level: 0, fade: 0.2, decay: 2.2, ks: { bright: 0.7, keep: 0.996 }, gain: 1.5 },
  nylon: { type: 'triangle', ratio: 2, level: 0, fade: 0.2, decay: 1.8, ks: { bright: 0.35, keep: 0.995 }, gain: 1.7 },
  sitar: { type: 'triangle', ratio: 2, level: 0, fade: 0.2, decay: 2.6, ks: { bright: 0.95, keep: 0.998 }, bend: 30, wobble: [0.7, 0.12], gain: 1.3 },
  mandolin: { type: 'triangle', ratio: 2, level: 0, fade: 0.2, decay: 1, ks: { bright: 0.8, keep: 0.993 }, wobble: [13, 0.55], octave: 1, gain: 1.4 },
  banjo: { type: 'triangle', ratio: 2, level: 0, fade: 0.2, decay: 0.7, ks: { bright: 1, keep: 0.988 }, gain: 1.4 },
  pizz: { type: 'triangle', ratio: 2, level: 0, fade: 0.2, decay: 0.45, ks: { bright: 0.3, keep: 0.985 }, gain: 1.9 },
  violin: { type: 'sawtooth', ratio: 1.004, level: 0.5, fade: 1, decay: 1.6, attack: 0.12, vibrato: 14, sweep: [3800, 2000], gain: 0.6 },
  cello: { type: 'sawtooth', ratio: 1.003, level: 0.5, fade: 1, decay: 2, attack: 0.15, vibrato: 10, octave: -1, sweep: [1900, 900], gain: 0.75 },
  // Keys and blips (Steps and Strings).
  piano: { type: 'triangle', ratio: 2, level: 0.35, fade: 0.25, decay: 1.6, fm: [2, 0.2], sweep: [5200, 900], gain: 1.15 },
  clav: { type: 'square', ratio: 3, level: 0.3, fade: 0.2, decay: 0.35, sweep: [4200, 700], gain: 0.7 },
  xylo: { type: 'sine', ratio: 3, level: 0.7, fade: 0.05, decay: 0.35, octave: 1, gain: 1.2 },
  chip: { type: 'square', ratio: 2, level: 0, fade: 0.1, decay: 0.22, gain: 0.5 },
  acid: { type: 'sawtooth', ratio: 1.01, level: 0.4, fade: 1, decay: 0.3, sweep: [5200, 220], gain: 0.9 },
  organ: { type: 'square', ratio: 2, level: 0.5, fade: 1, decay: 0.7, attack: 0.008, gain: 0.5 },
  bubble: { type: 'sine', ratio: 2, level: 0.05, fade: 0.2, decay: 0.18, octave: 1, bend: 900, gain: 1.8 },
  // Chime sounds: bright, ringing, a little inharmonic.
  wind: { type: 'sine', ratio: 5.4, level: 0.3, fade: 0.35, decay: 2.8, octave: 1, wobble: [3, 0.12], gain: 1.1 },
  celesta: { type: 'sine', ratio: 4, level: 0.22, fade: 0.12, decay: 1.1, octave: 1, fm: [1, 0.25], gain: 1.1 },
  tubular: { type: 'sine', ratio: 2.0, level: 0.4, fade: 0.45, decay: 3.2, fm: [3.5, 0.3], gain: 1.1 },
  crystal: { type: 'sine', ratio: 5.4, level: 0.4, fade: 0.5, decay: 2.5, octave: 1, wobble: [7, 0.15], gain: 0.95 },
  tri: { type: 'sine', ratio: 5.1, level: 0.5, fade: 0.6, decay: 2.2, octave: 2, fm: [7.3, 0.3], gain: 0.8 },
  gong: { type: 'sine', ratio: 1.48, level: 0.5, fade: 0.8, decay: 3.5, octave: -1, fm: [1.41, 0.8], wobble: [0.8, 0.25], gain: 1.3 },
  wood: { type: 'triangle', ratio: 2.7, level: 0.6, fade: 0.1, decay: 0.18, gain: 2.6 },
  drop: { type: 'sine', ratio: 2, level: 0.1, fade: 0.2, decay: 0.3, octave: 1, bend: -700, gain: 2 },
};

// Bass sounds, built like a synth patch: a few oscillators (detuned for
// width, an octave down for weight), optional FM, saturation before a
// 2- or 4-pole low-pass whose envelope snaps open and closes, an amp
// envelope, and a clean mono sine underneath so the low end stays solid.
type BassOsc = [type: OscillatorType, ratio: number, cents: number, gain: number, pan?: number];
interface BassDef {
  osc: BassOsc[];
  sub: number; // clean sine underneath (mono)
  subOct?: number; // the sine's octave (-1 = an octave down)
  cut: number; // filter resting point, Hz (at A1, tracks the note)
  env: number; // filter starts this many times higher…
  fdec: number; // …and falls back in about this many seconds
  q: number;
  poles: 2 | 4;
  open: number; // the field's energy opens the filter this much
  drive?: number; // saturation before the filter (harmonics phones can play)
  fuzz?: number; // saturation after it
  fm?: [ratio: number, index: number, decay: number]; // a sine modulator: the FM growl or slap
  wob?: number; // filter wobble, cycles per beat
  drift?: number; // random cents per note, like an old analog synth
  attack: number;
  decay: number;
  sustain: number; // 0..1 of the peak
  release: number;
  ring?: number; // the longest a note rings (plucked strings die away)
  click?: number; // pick or finger noise, band Hz
  drop?: number; // cents the note starts sharp
  punch?: number; // starts this many times higher and falls fast (an 808's thump)
  gain: number;
}
const BASSES: Record<BassSound, BassDef> = {
  synth: { osc: [['sawtooth', 1, -7, 0.5], ['sawtooth', 1, 7, 0.5]], sub: 0.7, cut: 260, env: 6, fdec: 0.12, q: 2.5, poles: 4, open: 2.5, drive: 1.5, attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.08, gain: 1.25 },
  sub: { osc: [['sine', 1, 0, 1]], sub: 0, cut: 1200, env: 1, fdec: 0.1, q: 0.5, poles: 2, open: 0, drive: 1.8, attack: 0.01, decay: 0.4, sustain: 0.9, release: 0.1, gain: 0.9 },
  round: { osc: [['triangle', 1, 0, 0.7], ['sine', 2, 0, 0.15]], sub: 0.6, cut: 600, env: 2, fdec: 0.2, q: 0.7, poles: 2, open: 1, attack: 0.015, decay: 0.5, sustain: 0.75, release: 0.12, gain: 1 },
  upright: { osc: [['triangle', 1, 0, 0.6], ['sine', 2, 3, 0.2], ['sine', 3, -4, 0.06]], sub: 0.5, cut: 900, env: 3, fdec: 0.07, q: 1.2, poles: 2, open: 0.5, attack: 0.004, decay: 0.35, sustain: 0.35, release: 0.15, ring: 0.9, click: 900, drop: 30, gain: 1.7 },
  fingered: { osc: [['triangle', 1, 0, 0.7], ['sawtooth', 1, 0, 0.12]], sub: 0.5, cut: 500, env: 2.5, fdec: 0.06, q: 0.9, poles: 2, open: 0.6, drive: 1.3, attack: 0.006, decay: 0.5, sustain: 0.4, release: 0.2, ring: 1.2, click: 700, drop: 15, gain: 1.7 },
  picked: { osc: [['sawtooth', 1, 0, 0.45], ['triangle', 1, 3, 0.35]], sub: 0.5, cut: 700, env: 4, fdec: 0.08, q: 2, poles: 2, open: 1.5, drive: 1.5, attack: 0.002, decay: 0.25, sustain: 0.4, release: 0.1, ring: 1.4, click: 2500, gain: 1.6 },
  slap: { osc: [['sine', 1, 0, 1]], fm: [2, 5, 0.03], sub: 0.3, cut: 5000, env: 1, fdec: 0.1, q: 0.5, poles: 2, open: 0, attack: 0.001, decay: 0.18, sustain: 0.3, release: 0.08, ring: 0.8, click: 3200, drop: 40, gain: 1.9 },
  fm: { osc: [['sine', 1, 0, 1]], fm: [1, 3.5, 0.08], sub: 0.4, cut: 4000, env: 1, fdec: 0.1, q: 0.5, poles: 2, open: 0, drive: 1.2, attack: 0.002, decay: 0.3, sustain: 0.45, release: 0.1, gain: 1.2 },
  moog: { osc: [['sawtooth', 1, -5, 0.45], ['sawtooth', 1, 5, 0.45], ['square', 0.5, 0, 0.3]], sub: 0.4, cut: 220, env: 8, fdec: 0.25, q: 4, poles: 4, open: 2, drive: 2.2, drift: 6, attack: 0.004, decay: 0.4, sustain: 0.55, release: 0.1, gain: 1.1 },
  pulse: { osc: [['square', 1, -4, 0.5], ['square', 1, 4, 0.4]], sub: 0.6, cut: 400, env: 5, fdec: 0.15, q: 3, poles: 4, open: 2, drift: 4, drive: 1.5, attack: 0.004, decay: 0.35, sustain: 0.6, release: 0.08, gain: 1.1 },
  acid: { osc: [['sawtooth', 1, 0, 1]], sub: 0.3, cut: 200, env: 14, fdec: 0.16, q: 12, poles: 4, open: 4, drive: 2, fuzz: 1.5, attack: 0.003, decay: 0.2, sustain: 0.7, release: 0.05, gain: 1.1 },
  reese: { osc: [['sawtooth', 1, -18, 0.35, -0.5], ['sawtooth', 1, 0, 0.35], ['sawtooth', 1, 19, 0.35, 0.5]], sub: 0.9, cut: 700, env: 1.5, fdec: 0.4, q: 1.5, poles: 4, open: 1.5, drive: 2.5, attack: 0.01, decay: 0.6, sustain: 0.85, release: 0.12, gain: 1 },
  wobble: { osc: [['sawtooth', 1, -9, 0.5], ['square', 1, 9, 0.4]], sub: 0.9, cut: 300, env: 1, fdec: 0.1, q: 8, poles: 2, open: 1, wob: 2, drive: 2, fuzz: 2, attack: 0.005, decay: 0.4, sustain: 0.9, release: 0.08, gain: 1 },
  fuzz: { osc: [['sawtooth', 1, 0, 0.6], ['square', 0.5, 0, 0.4]], sub: 0.7, cut: 900, env: 3, fdec: 0.1, q: 1, poles: 2, open: 1, drive: 6, fuzz: 3, attack: 0.003, decay: 0.3, sustain: 0.8, release: 0.06, gain: 0.8 },
  house: { osc: [['sine', 1, 0, 0.7], ['sine', 2, 0, 0.35], ['sine', 3, 0, 0.12]], sub: 0.5, cut: 2500, env: 1, fdec: 0.1, q: 0.5, poles: 2, open: 0, attack: 0.006, decay: 0.2, sustain: 0.7, release: 0.06, click: 1500, gain: 1.1 },
  dist808: { osc: [['sine', 1, 0, 1]], sub: 0.3, cut: 1800, env: 1, fdec: 0.1, q: 0.6, poles: 2, open: 0, drive: 8, fuzz: 2, punch: 2.5, attack: 0.002, decay: 1.2, sustain: 0.6, release: 0.2, gain: 0.75 },
  growl: { osc: [['sawtooth', 1, 0, 0.8]], fm: [1.5, 4, 0.4], sub: 0.8, cut: 900, env: 2, fdec: 0.2, q: 6, poles: 4, open: 2, drive: 3, fuzz: 2, attack: 0.005, decay: 0.5, sustain: 0.8, release: 0.08, gain: 0.8 },
  rubber: { osc: [['square', 1, 0, 0.8]], sub: 0.6, cut: 300, env: 10, fdec: 0.06, q: 3, poles: 4, open: 1.5, drive: 1.4, attack: 0.002, decay: 0.15, sustain: 0.2, release: 0.06, gain: 1.35 },
  deep: { osc: [['sawtooth', 1, -4, 0.5], ['sawtooth', 1, 4, 0.5]], sub: 0.9, cut: 170, env: 2, fdec: 0.3, q: 1, poles: 4, open: 0.6, drive: 1.3, attack: 0.008, decay: 0.5, sustain: 0.8, release: 0.12, gain: 1.25 },
  fretless: { osc: [['triangle', 1, 0, 0.7], ['sine', 2, 4, 0.25]], sub: 0.5, cut: 800, env: 2, fdec: 0.15, q: 1.4, poles: 2, open: 0.5, drive: 1.2, attack: 0.03, decay: 0.8, sustain: 0.6, release: 0.25, ring: 2, drop: 60, gain: 1.6 },
  brass: { osc: [['sawtooth', 1, -3, 0.5], ['sawtooth', 1, 3, 0.4]], sub: 0.4, cut: 380, env: 3, fdec: 0.12, q: 1.2, poles: 2, open: 1, drive: 1.4, attack: 0.025, decay: 0.4, sustain: 0.8, release: 0.1, gain: 1.1 },
  psy: { osc: [['sawtooth', 1, 0, 0.9]], sub: 0.6, cut: 350, env: 8, fdec: 0.05, q: 2, poles: 4, open: 1.5, drive: 1.6, attack: 0.001, decay: 0.12, sustain: 0.3, release: 0.03, click: 3000, gain: 1.3 },
  chip: { osc: [['square', 1, 0, 0.8]], sub: 0.3, cut: 5000, env: 1, fdec: 0.1, q: 0.5, poles: 2, open: 0, attack: 0.001, decay: 0.2, sustain: 0.7, release: 0.04, gain: 0.7 },
  '808': { osc: [['sine', 1, 0, 1]], sub: 0, cut: 2000, env: 1, fdec: 0.1, q: 0.5, poles: 2, open: 0, drive: 3, punch: 2.2, attack: 0.002, decay: 1.2, sustain: 0.6, release: 0.2, gain: 1.0 },
};

const satCurves = new Map<number, Float32Array<ArrayBuffer>>();
function satCurve(k: number) {
  let c = satCurves.get(k);
  if (!c) {
    c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) c[i] = Math.tanh((i / 511.5 - 1) * k) / Math.tanh(k);
    satCurves.set(k, c);
  }
  return c;
}

// A pad sound: each chord note is a pair of oscillators (w), detuned apart by
// `spread` cents and panned `width` apart, through one filter (`cut` × the
// field's cutoff; `band`: a band-pass formant instead of a low-pass).
// `color`: the note added to the triad (7th, 9th, 4 = sus, 0 = the root doubled).
// `drift`: cents each oscillator wanders; `air`: breathy noise on top;
// `up`: semitones up or down; `sub`: a sine an octave under the root;
// `swell`: how much a new chord blooms.
interface PadDef { w: [OscillatorType, OscillatorType]; spread: number; width: number; cut: number; q: number; band?: number; color: 0 | 4 | 7 | 9; drift: number; air: number; gain: number; up?: number; sub: number; swell: number }
const PADS: Record<PadSound, PadDef> = {
  soft: { w: ['sine', 'triangle'], spread: 6, width: 0.5, cut: 1, q: 0.3, color: 0, drift: 3, air: 0, gain: 1, sub: 0.25, swell: 0.6 },
  strings: { w: ['sawtooth', 'sawtooth'], spread: 12, width: 0.8, cut: 1.3, q: 0.8, color: 7, drift: 5, air: 0.15, gain: 1.14, sub: 0.2, swell: 1 },
  organ: { w: ['square', 'sine'], spread: 1.5, width: 0.3, cut: 2.2, q: 0.3, color: 0, drift: 0.5, air: 0, gain: 0.8, sub: 0.4, swell: 0.3 },
  choir: { w: ['sawtooth', 'triangle'], spread: 9, width: 0.7, cut: 1, q: 2.2, band: 650, color: 0, drift: 6, air: 0.35, gain: 3.4, sub: 0, swell: 0.8 },
  shimmer: { w: ['triangle', 'sine'], spread: 16, width: 0.9, cut: 3, q: 0.3, color: 9, drift: 4, air: 0.2, gain: 0.85, up: 12, sub: 0, swell: 1 },
  warm: { w: ['sawtooth', 'triangle'], spread: 10, width: 0.7, cut: 0.75, q: 0.6, color: 7, drift: 6, air: 0.05, gain: 1, sub: 0.3, swell: 1.2 },
  tape: { w: ['triangle', 'sawtooth'], spread: 7, width: 0.5, cut: 0.85, q: 0.4, color: 7, drift: 22, air: 0.12, gain: 1.05, sub: 0.2, swell: 0.7 },
  glass: { w: ['sine', 'sine'], spread: 5, width: 0.9, cut: 3.5, q: 0.3, color: 9, drift: 2, air: 0.1, gain: 0.92, up: 12, sub: 0, swell: 0.5 },
  bowed: { w: ['sawtooth', 'sawtooth'], spread: 6, width: 0.6, cut: 1, q: 1.6, band: 1100, color: 0, drift: 7, air: 0.25, gain: 2.8, sub: 0.15, swell: 1.6 },
  dark: { w: ['triangle', 'sine'], spread: 8, width: 0.6, cut: 0.5, q: 0.7, color: 4, drift: 5, air: 0.08, gain: 0.84, up: -12, sub: 0.35, swell: 0.8 },
  air: { w: ['sine', 'triangle'], spread: 10, width: 1, cut: 2.4, q: 1.2, band: 2400, color: 9, drift: 4, air: 0.9, gain: 5.6, sub: 0, swell: 1 },
  brass: { w: ['sawtooth', 'sawtooth'], spread: 5, width: 0.5, cut: 1.9, q: 1.4, color: 0, drift: 2, air: 0, gain: 0.95, sub: 0.2, swell: 1.4 },
  reed: { w: ['square', 'square'], spread: 7, width: 0.6, cut: 1, q: 1.4, band: 1400, color: 7, drift: 3, air: 0.05, gain: 2.6, sub: 0, swell: 0.4 },
  hollow: { w: ['square', 'triangle'], spread: 4, width: 0.5, cut: 0.7, q: 3, color: 9, drift: 2, air: 0, gain: 0.9, sub: 0.2, swell: 0.6 },
  ooh: { w: ['triangle', 'sawtooth'], spread: 8, width: 0.8, cut: 1, q: 2.6, band: 420, color: 0, drift: 5, air: 0.2, gain: 4.4, up: -12, sub: 0, swell: 0.9 },
  cello: { w: ['sawtooth', 'sawtooth'], spread: 5, width: 0.5, cut: 0.9, q: 1.8, band: 700, color: 0, drift: 8, air: 0.15, gain: 3, up: -12, sub: 0.2, swell: 1.8 },
  ice: { w: ['sine', 'triangle'], spread: 14, width: 1, cut: 4, q: 0.5, color: 9, drift: 2, air: 0.35, gain: 0.8, up: 24, sub: 0, swell: 0.4 },
  pwm: { w: ['square', 'sawtooth'], spread: 18, width: 0.9, cut: 1.2, q: 0.9, color: 7, drift: 9, air: 0, gain: 0.85, sub: 0.25, swell: 1 },
  velvet: { w: ['triangle', 'triangle'], spread: 11, width: 0.8, cut: 0.6, q: 0.5, color: 9, drift: 5, air: 0.1, gain: 1.1, sub: 0.3, swell: 1.3 },
  analog: { w: ['sawtooth', 'square'], spread: 14, width: 0.9, cut: 1.6, q: 1.2, color: 7, drift: 7, air: 0.05, gain: 0.9, sub: 0.25, swell: 1 },
  vox: { w: ['sawtooth', 'triangle'], spread: 9, width: 0.8, cut: 1, q: 2.4, band: 950, color: 0, drift: 6, air: 0.3, gain: 3.6, sub: 0, swell: 0.9 },
  drone: { w: ['sawtooth', 'sawtooth'], spread: 3, width: 0.4, cut: 0.8, q: 2, band: 520, color: 7, drift: 1, air: 0, gain: 2.4, up: -12, sub: 0.4, swell: 2 },
  mist: { w: ['sine', 'sine'], spread: 20, width: 1, cut: 1.5, q: 0.3, color: 9, drift: 12, air: 0.6, gain: 1.2, sub: 0, swell: 1.8 },
  supersaw: { w: ['sawtooth', 'sawtooth'], spread: 24, width: 1, cut: 2.8, q: 0.6, color: 4, drift: 4, air: 0.1, gain: 0.75, sub: 0.15, swell: 0.8 },
  harmonium: { w: ['square', 'sawtooth'], spread: 3, width: 0.4, cut: 1.4, q: 1, band: 1600, color: 7, drift: 1.5, air: 0.05, gain: 2.2, sub: 0.1, swell: 0.5 },
  cosmic: { w: ['triangle', 'sawtooth'], spread: 12, width: 1, cut: 2, q: 4, color: 4, drift: 3, air: 0.4, gain: 0.8, up: 12, sub: 0.2, swell: 1.5 },
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
  hitSound: HitSound;
  grain: number;
  grainSound: GrainSound;
  grainRate: number; // 0 … 1, 0.5 = as before
  grainLen: number; // 0 … 1, 0.5 = as before
  seqSound?: HitSound; // Steps' own instrument ('same' = the main one)
  seqRate?: number; // play every 1, 2 or 4 sixteenths
  seqNotes?: number; // most notes a step, 0 = by how busy the music is
  seqSens?: number; // 0 … 1: how small a crowd still plays (0.5 = as before)
  seqStyle?: 'chord' | 'strum' | 'up' | 'down' | 'bounce' | 'random'; // how a step's notes play
  seqVary?: number; // 0 … 1: accents, skips, octave jumps and quick repeats
  seqTick?: boolean; // the soft pulse tick
  scan: number;
  scanSecs: number;
  scanDir?: 'across' | 'down' | 'bounce' | 'radar';
  scanSound?: HitSound; // its own instrument ('same' = the main one)
  scanNotes?: number; // most notes per frame of the sweep (4 = as before)
  touch: number;
  touchSound: TouchSound;
  touchMode: TouchMode;
  touchGlide: number; // 0 snaps … 1 slow slides
  touchVib: number; // vibrato that grows while a finger holds still
  touchAxis: 'up' | 'across'; // which way pitch runs
  touchOctave: number;
  accents: number;
  accScene?: boolean; // a strum when the scene changes
  accShape?: boolean; // a whoosh when a shape forms
  accBirth?: boolean; // a sparkle when many are born at once
  accBurst?: boolean; // a low boom on an explosion
  accVoice?: Voice; // what the strum and sparkle play
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
  bassMove?: number; // 0 root only … 1 octave jumps, fifths and passing notes
  bassPattern?: 'beat' | 'hold' | 'pump' | 'walk' | 'arp' | 'offbeat';
  bassWalk?: number; // how often it steps into the next chord
  bassOct?: number; // -1 sub, 0 low, 1 mid
  bassGlide?: number; // how often notes slide into each other
  bassLen?: number; // note length, ×
  bassGhost?: number; // soft extra notes between the main ones
  drums: number;
  kit: DrumKit;
  padSound: PadSound;
  padPump: number; // 0 … 1: the pad ducks on each kick (or each beat without drums)
  padTone?: number; // -1 … 1: darker … brighter
  padWidth?: number; // 0 … 1 (0.5 = as the sound has it)
  padBreath?: number; // 0 … 1: how much it swells and fades on its own (0.35 = as before)
  padGlide?: number; // 0 … 1: how slowly it slides to the next chord
  padHold?: boolean; // keeps playing when the field is still
  padOct?: number; // -1, 0, 1
  // Sound quality (each 0 = off, exactly as before).
  polish?: number; // Mix polish: a better reverb, ducking under the kick, EQ, tape warmth, glue, width and a limiter
  verb?: 'classic' | 'room' | 'hall' | 'plate'; // the reverb's kind (classic = the original)
  unison?: number; // pads and leads (Steps, Strings) as a stack of detuned voices
  wave?: number; // wavetable motion: pads and leads morph between waveforms
  human?: number; // humanise: timing, accents, ghost notes, chord inversions
  attack: number; // 0 struck … 1 bowed
  bright: number; // -1 dark … 1 bright, over everything
  drive: number; // warm saturation over everything
  lofi: number; // fewer bits, less top, tape hiss and crackle
  ping?: boolean; // the echo bounces left and right
  phaser?: number; // a slow swirl over everything
  trem?: number; // volume or stereo pulsing in time
  tremMode?: 'volume' | 'pan';
  shimmer?: number; // a reverb tail an octave up
  glue?: number; // a master compressor: tighter and louder
  lowEnd?: number; // 0 … 1: weight in the lows, a fuller kick, bass and pad duck under it
  kickPunch?: number; // 0 … 1: a deeper, longer, slightly driven thump under the kick
  sub?: number; // 0 … 1: a clean sine an octave under the bass
  tape?: number; // bursts drag the pitch down like a tape stopping
  // Beats from the library: a genre and one of its beats ('' = the field plays the drums).
  genre: string;
  beat: number;
  vary: number; // 0 as written … 1 ghost notes, dropped hits and rolls
  fills: number; // a fill every this many bars (0 = none)
  follow: number; // a calm field thins the beat, a busy one adds hats
  beatChange: number; // a new beat in the genre every this many bars (0 = stay)
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
// How loud each drum of a beat sits.
const ROW_GAIN: Record<DrumRow, number> = { k: 1, s: 0.85, c: 0.85, h: 0.5, o: 0.5, r: 0.7, p: 0.7, t: 0.8, y: 0.6 };
const ROWS = 8;

type SongMix = { drums: number; bass: number; seq: number; pad: number; strings: number };
type SongSection = { name: 'Intro' | 'Verse' | 'Build' | 'Drop' | 'Chorus' | 'Breakdown' | 'Bridge' | 'Outro'; bars: number; mix: SongMix; hard?: boolean };
const ALL: SongMix = { drums: 1, bass: 1, seq: 1, pad: 1, strings: 1 };
const VERSE: SongMix = { drums: 0.7, bass: 0.85, seq: 0.8, pad: 0.8, strings: 0.8 };
const INTRO: SongMix = { drums: 0, bass: 0, seq: 0.5, pad: 1, strings: 0.5 };
const BREAK: SongMix = { drums: 0, bass: 0.5, seq: 0.5, pad: 1, strings: 1 };
const OUTRO: SongMix = { drums: 0.45, bass: 0.6, seq: 0.4, pad: 1, strings: 0.5 };
const HALF: SongMix = { drums: 0.45, bass: 0.6, seq: 1, pad: 0.9, strings: 1 };
const sec = (name: SongSection['name'], bars: number, mix: SongMix, hard = false): SongSection => ({ name, bars, mix, hard });
/** Song mode's arrangements: sections played in turn, on a loop. */
export const SONGS: Record<string, { name: string; form: SongSection[] }> = {
  classic: { name: 'Classic', form: [sec('Intro', 8, INTRO), sec('Verse', 16, VERSE), sec('Build', 4, VERSE), sec('Drop', 16, ALL, true), sec('Breakdown', 8, BREAK, true), sec('Build', 4, VERSE), sec('Drop', 16, ALL, true), sec('Outro', 8, OUTRO)] },
  club: { name: 'Club (long builds)', form: [sec('Intro', 16, { ...INTRO, drums: 0.6 }), sec('Build', 8, VERSE), sec('Drop', 32, ALL, true), sec('Breakdown', 16, BREAK, true), sec('Build', 8, VERSE), sec('Drop', 32, ALL, true), sec('Outro', 16, { ...OUTRO, drums: 0.8 })] },
  short: { name: 'Short (quick drops)', form: [sec('Intro', 4, INTRO), sec('Build', 2, VERSE), sec('Drop', 8, ALL, true), sec('Breakdown', 4, BREAK, true), sec('Build', 2, VERSE), sec('Drop', 8, ALL, true)] },
  pop: { name: 'Verse and chorus', form: [sec('Intro', 4, INTRO), sec('Verse', 8, HALF), sec('Build', 2, VERSE), sec('Chorus', 8, ALL, true), sec('Verse', 8, HALF, true), sec('Build', 2, VERSE), sec('Chorus', 8, ALL, true), sec('Bridge', 8, BREAK, true), sec('Build', 4, VERSE), sec('Chorus', 16, ALL, true), sec('Outro', 4, OUTRO)] },
  chill: { name: 'Chill (no drops)', form: [sec('Intro', 8, INTRO), sec('Verse', 16, HALF), sec('Breakdown', 8, BREAK), sec('Verse', 16, VERSE), sec('Outro', 8, OUTRO)] },
  shuffle: { name: 'Different every time', form: [] },
};
/** A fresh arrangement: an intro, then verses, builds and drops in some order, an outro. */
function randomForm(): SongSection[] {
  const pick = <T,>(xs: T[]) => xs[(Math.random() * xs.length) | 0];
  const f: SongSection[] = [sec('Intro', pick([4, 8, 8, 16]), INTRO)];
  const parts = 2 + ((Math.random() * 2) | 0);
  for (let k = 0; k < parts; k++) {
    if (Math.random() < 0.7) f.push(sec('Verse', pick([8, 16]), pick([VERSE, HALF]), k > 0));
    if (Math.random() < 0.85) {
      f.push(sec('Build', pick([2, 4, 4, 8]), VERSE));
      f.push(sec(pick(['Drop', 'Chorus'] as const), pick([8, 16, 16]), ALL, true));
    }
    if (k < parts - 1 && Math.random() < 0.6) f.push(sec(pick(['Breakdown', 'Bridge'] as const), pick([4, 8]), BREAK, true));
  }
  f.push(sec('Outro', pick([4, 8]), OUTRO));
  return f;
}

// Song variation: each section rolls a move for the beat and one for the
// picture when it starts, from the moves that suit its part of the song. No
// fixed rules: the roll never repeats last loop's pick for that section, a
// calm field leans sparse and a wild one busy, and a drop has to feel at
// least as big as what came before it.
export type BeatMove = 'full' | 'half' | 'sparse' | 'hats' | 'busy' | 'swap';
export type PicMove = 'same' | 'hue' | 'calm' | 'mono' | 'vivid' | 'lean';
// How full each move sounds (the contrast rule compares these).
const BEAT_FULL: Record<BeatMove, number> = { hats: 0.2, sparse: 0.35, half: 0.5, full: 0.7, swap: 0.7, busy: 0.95 };
const PIC_FULL: Record<PicMove, number> = { mono: 0.2, calm: 0.3, same: 0.5, hue: 0.6, lean: 0.7, vivid: 0.9 };
type Role = 'start' | 'verse' | 'build' | 'peak' | 'break' | 'end';
const ROLE: Record<SongSection['name'], Role> = { Intro: 'start', Verse: 'verse', Build: 'build', Drop: 'peak', Chorus: 'peak', Breakdown: 'break', Bridge: 'break', Outro: 'end' };
const BEAT_MOVES: Record<Role, BeatMove[]> = {
  start: ['hats', 'sparse', 'full'],
  verse: ['half', 'sparse', 'full', 'swap', 'hats'],
  build: ['full', 'sparse', 'half'],
  peak: ['full', 'busy', 'swap'],
  break: ['hats', 'sparse', 'half'],
  end: ['half', 'sparse', 'hats', 'full'],
};
const PIC_MOVES: Record<Role, PicMove[]> = {
  start: ['same', 'calm', 'mono'],
  verse: ['same', 'hue', 'calm'],
  build: ['same', 'mono', 'lean'],
  peak: ['vivid', 'hue', 'lean', 'same'],
  break: ['calm', 'mono', 'hue'],
  end: ['calm', 'same', 'mono'],
};
// The bold moves only come in as Variation goes up.
const BOLD = new Set<string>(['hats', 'busy', 'swap', 'mono', 'vivid']);
function rollMove<M extends string>(moves: M[], plain: M, full: Record<M, number>, vary: number, lean: number, last: M | undefined, atLeast: number): M {
  if (vary <= 0) return plain;
  let opts = moves.filter((m) => full[m] >= atLeast - 0.001);
  if (!opts.length) opts = moves.filter((m) => full[m] === Math.max(...moves.map((x) => full[x])));
  if (opts.length > 1 && last !== undefined) opts = opts.filter((m) => m !== last) as M[];
  const weight = (m: M) => {
    let wt = Math.max(0.15, 1 + lean * (full[m] - 0.5) * 3);
    if (BOLD.has(m)) wt *= Math.min(1, vary * 1.6);
    // Low Variation mostly keeps things as they are.
    if (m === plain) wt *= 1 + (1 - vary) * 4;
    return wt;
  };
  const sum = opts.reduce((a, m) => a + weight(m), 0);
  let r = Math.random() * sum;
  for (const m of opts) if ((r -= weight(m)) <= 0) return m;
  return opts[opts.length - 1];
}

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
  private lastBoom = 0;
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
  private echoFb2: GainNode | null = null;
  private echoPans: StereoPannerNode[] = [];
  private echoDelay2: DelayNode | null = null;
  private phaserWet: GainNode | null = null;
  private phaserDry: GainNode | null = null;
  private tremGain: GainNode | null = null;
  private tremPan: StereoPannerNode | null = null;
  private tremLfo: OscillatorNode | null = null;
  private tremVol: GainNode | null = null;
  private tremSide: GainNode | null = null;
  private shimGain: GainNode | null = null;
  private makeup: GainNode;
  private ana: AnalyserNode | null = null;
  private anaBins: Uint8Array<ArrayBuffer> | null = null;
  /** The sound's own spectrum in `out.length` bands (as AudioInput.spectrum). */
  spectrum(out: Float32Array) {
    const a = this.ana;
    if (!a || !this.running) return out.fill(0);
    const F = (this.anaBins ??= new Uint8Array(a.frequencyBinCount));
    a.getByteFrequencyData(F);
    return bandsOf(F, this.ctx.sampleRate / a.fftSize, out);
  }
  private tapeDelay: DelayNode | null = null;
  private tapeGain: GainNode | null = null;
  private lastTape = 0;
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
  private lowShelf: BiquadFilterNode;
  private bassDuck: GainNode;
  private thumpShaper: WaveShaperNode | null = null;
  private driveShaper: WaveShaperNode | null = null;
  private driveK = -1;
  private lofiShaper: WaveShaperNode | null = null;
  private lofiLp: BiquadFilterNode | null = null;
  private lofiHiss: GainNode | null = null;
  private lofiBits = -1;
  private padKind = '';
  private verb: ConvolverNode;
  private scBass: GainNode;
  private scPad: GainNode;
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
  // Four chord notes, each a pair of oscillators (8), then a sub and an air layer.
  private padOsc: OscillatorNode[] = [];
  private padPan: StereoPannerNode[] = [];
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private padSub!: OscillatorNode;
  private padSubGain!: GainNode;
  private padAir!: BiquadFilterNode;
  private padAirGain!: GainNode;
  private padLfo = 0;
  private padChord = '';
  /** Each chord note's pitch now (MIDI, fractional while unset: NaN). */
  private padMidi = [NaN, NaN, NaN, NaN];
  private padDrift = new Float32Array(8);
  private padSwell = 0;
  private padTick = 0;
  private padDuck!: GainNode;
  private padBeat = -1;
  private padPumpAt = 0;
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
  /** Where the scanline is in its sweep, 0..1 (scanPos: where it is drawn, 0..1). */
  scanX = 0;
  scanPos = 0;

  constructor(p: SoundParams) {
    this.p = p;
    // iOS mutes Web Audio with the ring switch unless the page says it plays media.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'interactive' }));
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    // Make-up gain after the compressor: Glue squeezes harder and lifts it back.
    this.makeup = ctx.createGain();
    comp.connect(this.makeup).connect(ctx.destination);
    // A tap on the final mix, for the spectrum shapes to show this sound.
    this.ana = ctx.createAnalyser();
    this.ana.fftSize = 2048;
    this.ana.smoothingTimeConstant = 0.6;
    this.makeup.connect(this.ana);
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
    // Low end: a low shelf over everything (flat at 0).
    this.lowShelf = ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 90;
    this.lowShelf.gain.value = 0;
    this.master.connect(this.tone).connect(this.shelf).connect(this.lowShelf).connect(comp);
    this.chainEnd = this.lowShelf;
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    const verb = (this.verb = ctx.createConvolver());
    verb.buffer = this.impulse(2.8);
    this.wet = ctx.createGain();
    this.wet.connect(verb);
    verb.connect(this.master);
    // The bass goes through one gain, so the kick can duck it (Low end), then
    // Mix polish's sidechain (a plain 1 unless that's on).
    this.bassDuck = ctx.createGain();
    this.scBass = ctx.createGain();
    this.bassDuck.connect(this.scBass).connect(this.dry);
    const bw = ctx.createGain();
    bw.gain.value = 0.12;
    this.scBass.connect(bw).connect(this.wet);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Pad: four chord notes, each a detuned pair spread across the stereo
    // field, through one filter; a sub under the root and breathy air on top.
    // Notes move to the nearest note of the next chord (voice leading), each
    // oscillator drifts a little, and a new chord swells.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.3;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padFilter.connect(this.padGain);
    // Pump: a gain after everything, dipped on each kick.
    this.padDuck = ctx.createGain();
    this.padGain.connect(this.padDuck);
    // Mix polish's sidechain (a plain 1 unless that's on).
    this.scPad = ctx.createGain();
    this.padDuck.connect(this.scPad);
    this.send(this.scPad, 0.9);
    for (let k = 0; k < 8; k++) {
      const o = ctx.createOscillator();
      o.type = k % 2 ? 'triangle' : 'sine';
      const pan = ctx.createStereoPanner();
      const g = ctx.createGain();
      g.gain.value = (k < 2 ? 0.26 : 0.18) * 0.62;
      o.connect(g).connect(pan).connect(this.padFilter);
      o.start();
      this.padOsc.push(o);
      this.padPan.push(pan);
    }
    this.padSub = ctx.createOscillator();
    this.padSubGain = ctx.createGain();
    this.padSubGain.gain.value = 0;
    this.padSub.connect(this.padSubGain).connect(this.padGain);
    this.padSub.start();
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    this.padAir = ctx.createBiquadFilter();
    this.padAir.type = 'bandpass';
    this.padAir.frequency.value = 4000;
    this.padAir.Q.value = 0.7;
    this.padAirGain = ctx.createGain();
    this.padAirGain.gain.value = 0;
    air.connect(this.padAir).connect(this.padAirGain).connect(this.padGain);
    air.start();

    this.set(p);
  }

  /** Browsers start audio suspended until a tap; call from a user gesture. */
  resume() {
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }
  /** iOS can come back from another app saying it runs while nothing is
   *  heard: stop and start the audio again (call from a tap). */
  restart() {
    const c = this.ctx;
    void c.suspend().then(() => c.resume()).catch(() => this.resume());
  }
  /** False while the browser holds the audio (iOS after another app), until a tap. */
  get running() {
    return this.ctx.state === 'running';
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
      this.echoFb2?.gain.setTargetAtTime(0.25 + p.echo * 0.35, t, 0.1);
      this.echoFbNow = 0;
      this.echoPans.forEach((pn, k) => pn.pan.setTargetAtTime(p.ping ? (k ? 0.85 : -0.85) : 0, t, 0.1));
    }
    if ((p.phaser ?? 0) > 0) this.ensurePhaser();
    if (this.phaserWet && this.phaserDry) {
      this.phaserWet.gain.setTargetAtTime((p.phaser ?? 0) * 0.85, t, 0.1);
      this.phaserDry.gain.setTargetAtTime(1 - (p.phaser ?? 0) * 0.25, t, 0.1);
    }
    if ((p.trem ?? 0) > 0) this.ensureTrem();
    if (this.tremGain && this.tremVol && this.tremSide) {
      const k = p.trem ?? 0;
      const vol = p.tremMode !== 'pan';
      this.tremGain.gain.setTargetAtTime(vol ? 1 - k * 0.45 : 1, t, 0.05);
      this.tremVol.gain.setTargetAtTime(vol ? k * 0.45 : 0, t, 0.05);
      this.tremSide.gain.setTargetAtTime(vol ? 0 : k * 0.85, t, 0.05);
    }
    if ((p.shimmer ?? 0) > 0) this.ensureShimmer();
    this.shimGain?.gain.setTargetAtTime((p.shimmer ?? 0) * 0.9, t, 0.2);
    // Glue: the master compressor squeezes harder, and the make-up lifts it.
    const glue = p.glue ?? 0;
    this.comp.threshold.setTargetAtTime(-14 - glue * 16, t, 0.1);
    this.comp.ratio.setTargetAtTime(4 + glue * 4, t, 0.1);
    this.comp.attack.setTargetAtTime(0.003 + glue * 0.012, t, 0.1);
    this.comp.release.setTargetAtTime(0.25 - glue * 0.1, t, 0.1);
    this.makeup.gain.setTargetAtTime(1 + glue * 0.6, t, 0.1);
    this.setVerb(p.verb ?? 'classic');
    this.setPolish(p.polish ?? 0);
    if ((p.tape ?? 0) > 0) this.ensureTape();
    if (p.chorus > 0) this.ensureChorus();
    if (this.chorusOut) this.chorusOut.gain.setTargetAtTime(p.chorus * 0.8, t, 0.1);
    this.shelf.gain.setTargetAtTime(p.bright * 9, t, 0.1);
    this.lowShelf.gain.setTargetAtTime((p.lowEnd ?? 0) * 8, t, 0.1);
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
      // Fewer bits only past halfway: below that it's warmth and a little hiss.
      const bits = p.lofi <= 0.5 ? 0 : Math.round(12 - (p.lofi - 0.5) * 10);
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
      this.lofiHiss.gain.setTargetAtTime(p.lofi * 0.005, t, 0.2);
    }
    this.setPad(p.padSound);
    if (p.sweep === 0) {
      this.tone.frequency.setTargetAtTime(20000, t, 0.2);
      this.tone.Q.value = 0.7;
    }
  }

  // Drum hits as they're scheduled, for the field to move with (see takeDrumHits).
  // Melodic notes go in too (kind 'note', with the pitch class), so they can light the picture.
  private drumQ: { kind: 'kick' | 'snare' | 'hat' | 'crash' | 'bass' | 'note'; k: number; at: number; col: number; len?: number; pc?: number }[] = [];
  private stepNow = 0;
  private drumEv(kind: 'kick' | 'snare' | 'hat' | 'crash', k: number, when: number) {
    if (!this.audible('drums') || this.drumQ.length > 64) return;
    this.drumQ.push({ kind, k, at: this.ctx.currentTime + when, col: this.stepNow });
  }
  /** The drum hits heard by now: kind, strength and the column (0..15) that played. */
  takeDrumHits() {
    const now = this.ctx.currentTime;
    const due = this.drumQ.filter((e) => e.at <= now);
    if (due.length) this.drumQ = this.drumQ.filter((e) => e.at > now);
    return due;
  }

  /** How loud a layer has just played, 0..1 (falls back between notes). */
  levelOf(l: Layer) {
    return this.levels[LI[l]];
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
    // Two delays take turns: repeats alternate between them, so with
    // Ping-pong each side gets every other repeat.
    const d2 = (this.echoDelay2 = ctx.createDelay(2));
    d2.delayTime.value = 0.5;
    const fb2 = (this.echoFb2 = ctx.createGain());
    const pA = ctx.createStereoPanner();
    const pB = ctx.createStereoPanner();
    this.echoPans = [pA, pB];
    this.echoIn.connect(d).connect(lp).connect(hp);
    hp.connect(fb2).connect(d2);
    d2.connect(fb).connect(d);
    hp.connect(pA).connect(this.master);
    d2.connect(pB).connect(this.master);
    const w = ctx.createGain();
    w.gain.value = 0.4;
    hp.connect(w).connect(this.wet);
    d2.connect(w);
  }

  // Phaser: four all-pass filters swept slowly, mixed back with the dry sound.
  private ensurePhaser() {
    if (this.phaserWet) return;
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const out = ctx.createGain();
    this.phaserDry = ctx.createGain();
    this.phaserWet = ctx.createGain();
    this.phaserWet.gain.value = 0;
    inp.connect(this.phaserDry).connect(out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    let last: AudioNode = inp;
    for (let k = 0; k < 4; k++) {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 500 + k * 350;
      ap.Q.value = 0.6;
      const lg = ctx.createGain();
      lg.gain.value = 300 + k * 260;
      lfo.connect(lg).connect(ap.frequency);
      last.connect(ap);
      last = ap;
    }
    last.connect(this.phaserWet).connect(out);
    lfo.start();
    this.splice(inp, out);
  }

  // Tremolo / auto-pan: one wave in time with the tempo moves the volume, or
  // the sound between left and right.
  private ensureTrem() {
    if (this.tremGain) return;
    const ctx = this.ctx;
    this.tremGain = ctx.createGain();
    this.tremPan = ctx.createStereoPanner();
    this.tremLfo = ctx.createOscillator();
    this.tremLfo.frequency.value = 3;
    this.tremVol = ctx.createGain();
    this.tremVol.gain.value = 0;
    this.tremSide = ctx.createGain();
    this.tremSide.gain.value = 0;
    this.tremLfo.connect(this.tremVol).connect(this.tremGain.gain);
    this.tremLfo.connect(this.tremSide).connect(this.tremPan.pan);
    this.tremLfo.start();
    this.tremGain.connect(this.tremPan);
    this.splice(this.tremGain, this.tremPan);
  }

  // Shimmer: the reverb send, folded an octave up (a full-wave rectifier
  // doubles the pitch), cleaned up and fed to a long, bright tail.
  private ensureShimmer() {
    if (this.shimGain) return;
    const ctx = this.ctx;
    const rect = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) c[i] = Math.abs((i / 1023) * 2 - 1) * 1.6;
    rect.curve = c;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    this.shimGain = ctx.createGain();
    this.shimGain.gain.value = 0;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(5.5);
    this.wet.connect(rect).connect(hp).connect(lp).connect(this.shimGain).connect(verb).connect(this.master);
  }

  // Tape stop: a delay whose time is swept up drags the pitch down; swept
  // back, it springs up again.
  private ensureTape() {
    if (this.tapeDelay) return;
    this.tapeDelay = this.ctx.createDelay(1);
    this.tapeDelay.delayTime.value = 0;
    this.tapeGain = this.ctx.createGain();
    this.tapeDelay.connect(this.tapeGain);
    this.splice(this.tapeDelay, this.tapeGain);
  }
  private tapeStop(k: number, t: number) {
    const d = this.tapeDelay?.delayTime;
    const g = this.tapeGain?.gain;
    if (!d || !g) return;
    const depth = 0.12 + 0.22 * k;
    d.cancelScheduledValues(t);
    d.setValueAtTime(d.value, t);
    d.linearRampToValueAtTime(depth, t + 0.45);
    d.linearRampToValueAtTime(0, t + 0.8);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1 - k * 0.45, t + 0.45);
    g.linearRampToValueAtTime(1, t + 0.8);
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
    const d = PADS[kind] ?? PADS.soft;
    this.padOsc.forEach((o, k) => (o.type = d.w[k % 2]));
    this.padFilter.type = d.band ? 'bandpass' : 'lowpass';
    this.padFilter.Q.value = d.q;
    this.padChord = '';
  }

  // Pump: duck the pad at `when`, back up over most of a beat.
  private pump(when: number, k = 1, by = this.p.padPump) {
    const amt = by * Math.min(1, k);
    if (amt <= 0 || this.p.pad <= 0) return;
    const g = this.padDuck.gain;
    const beat = 60 / Math.max(40, this.bpmNow);
    g.cancelScheduledValues(when);
    g.setValueAtTime(g.value, when);
    g.linearRampToValueAtTime(1 - amt * 0.85, when + 0.012);
    g.setTargetAtTime(1, when + 0.03, beat * 0.22);
    this.padPumpAt = when;
  }

  // The pad's next chord: root, third (or the fourth for sus), fifth and a
  // colour note, each placed in the octave nearest the note it moves from,
  // so the voices glide a step or two instead of jumping (voice leading).
  private padVoice() {
    const d = PADS[this.p.padSound] ?? PADS.soft;
    const L = this.L;
    const r = this.chordRoot();
    const color = this.voicing > 0 ? 6 : d.color === 7 ? 6 : d.color === 9 ? 8 : d.color === 4 ? 3 : L;
    const third = d.color === 4 ? 3 : this.voicing < 0 ? 2 + L : 2;
    const classes = [r, r + third, r + 4, r + color];
    const sc = SCALES[this.p.scale];
    const midi = (deg: number) => {
      const o = Math.floor(deg / L);
      return 48 + 12 * this.p.octave + this.p.root + (d.up ?? 0) + sc[((deg % L) + L) % L] + 12 * o;
    };
    const lo = 52 + 12 * this.p.octave + this.p.root + (d.up ?? 0);
    const hi = lo + 19;
    const cand = classes.map((c) => {
      const out: number[] = [];
      for (let o = -3; o <= 3; o++) {
        const m = midi(c + o * L);
        if (m >= lo && m <= hi) out.push(m);
      }
      return out.length ? out : [midi(c)];
    });
    const cur = this.padMidi.map((m, k) => (Number.isFinite(m) ? m : lo + 2 + k * 5));
    let best: number[] = [], bc = 1e9;
    const perms = [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 2, 3, 1], [0, 3, 1, 2], [0, 3, 2, 1], [1, 0, 2, 3], [1, 0, 3, 2], [1, 2, 0, 3], [1, 2, 3, 0], [1, 3, 0, 2], [1, 3, 2, 0], [2, 0, 1, 3], [2, 0, 3, 1], [2, 1, 0, 3], [2, 1, 3, 0], [2, 3, 0, 1], [2, 3, 1, 0], [3, 0, 1, 2], [3, 0, 2, 1], [3, 1, 0, 2], [3, 1, 2, 0], [3, 2, 0, 1], [3, 2, 1, 0]];
    for (const pm of perms) {
      const pick = pm.map((ci, slot) => cand[ci].reduce((a, b) => (Math.abs(b - cur[slot]) < Math.abs(a - cur[slot]) ? b : a)));
      let cost = pick.reduce((a, m, slot) => a + Math.abs(m - cur[slot]), 0);
      // Two voices on one note, or a crunch of seconds, sound thin or muddy.
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const gap = Math.abs(pick[i] - pick[j]);
        if (gap === 0) cost += 12;
        else if (gap <= 2 && Math.min(pick[i], pick[j]) < lo + 7) cost += 4;
      }
      if (cost < bc) (bc = cost), (best = pick);
    }
    this.padMidi = best;
    const low = Math.min(...best.filter((_, slot) => classes.length > 0 && slot >= 0));
    let root = midi(r);
    while (root > low) root -= 12;
    return { notes: best, sub: root - 12 };
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
    this.dozing = true;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    // Suspend once the fade is done (unless woken meanwhile). Not gated on the
    // gain's value: in a hidden tab that can lag, and the pad kept humming.
    window.setTimeout(() => {
      if (this.dozing) void this.ctx.suspend().catch(() => {});
    }, 300);
  }
  private dozing = false;

  wake() {
    this.dozing = false;
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
      (this.pol?.on ? this.pol.lim : this.makeup).connect(this.recDest);
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

  // --- Sound quality --------------------------------------------------------
  // Reverb type: a generated reverb (room, hall or plate) with pre-delay,
  // early reflections and damping, in place of the classic one.
  private verb2: { pre: DelayNode; verb: ConvolverNode; kind: string } | null = null;
  private setVerb(kind: string) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const cur = this.verb2?.kind ?? 'classic';
    if (kind === cur) return;
    if (!this.verb2) {
      const pre = ctx.createDelay(0.2);
      const verb = ctx.createConvolver();
      pre.connect(verb).connect(this.master);
      this.verb2 = { pre, verb, kind: 'classic' };
    }
    const V = this.verb2;
    if (cur === 'classic') this.wet.disconnect(this.verb);
    else this.wet.disconnect(V.pre);
    V.kind = kind;
    if (kind === 'classic') return void this.wet.connect(this.verb);
    V.verb.buffer = this.impulse2(kind);
    V.pre.delayTime.setTargetAtTime(kind === 'room' ? 0.008 : kind === 'plate' ? 0.012 : 0.03, t, 0.05);
    this.wet.connect(V.pre);
  }
  // Mix polish: pad, bass and the leads duck under the kick; low cuts on the pad
  // and leads; a gentle dip in the harsh highs, tape warmth, a slow glue
  // compressor and a limiter at the end; the bass stays in the middle and the
  // pad and hats spread wider. Off: it's all wired out, exactly as before.
  private pol: {
    on: boolean; amt: number;
    padHp: BiquadFilterNode; lead: GainNode; leadHp: BiquadFilterNode; leadWet: GainNode;
    eq: BiquadFilterNode; satDry: GainNode; sat: WaveShaperNode; satWet: GainNode; glue: DynamicsCompressorNode; lift: GainNode; lim: DynamicsCompressorNode;
  } | null = null;
  private hatSide = 1;
  private get polAmt() {
    return this.pol?.on ? this.pol.amt : 0;
  }
  private setPolish(amt: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const on = amt > 0;
    if (!on && !this.pol?.on) return;
    if (!this.pol) {
      const padHp = ctx.createBiquadFilter();
      padHp.type = 'highpass';
      padHp.frequency.value = 170;
      padHp.Q.value = 0.6;
      padHp.connect(this.scPad);
      // The leads (Steps, Strings): a low cut, and their own duck.
      const lead = ctx.createGain();
      const leadHp = ctx.createBiquadFilter();
      leadHp.type = 'highpass';
      leadHp.frequency.value = 140;
      leadHp.Q.value = 0.6;
      const leadWet = ctx.createGain();
      lead.connect(leadHp).connect(this.dry);
      leadHp.connect(leadWet).connect(this.wet);
      const eq = ctx.createBiquadFilter();
      eq.type = 'peaking';
      eq.frequency.value = 3400;
      eq.Q.value = 0.9;
      const satDry = ctx.createGain();
      const sat = ctx.createWaveShaper();
      sat.oversample = '2x';
      const satWet = ctx.createGain();
      const glue = ctx.createDynamicsCompressor();
      glue.knee.value = 10;
      glue.attack.value = 0.02;
      glue.release.value = 0.25;
      const lift = ctx.createGain();
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -2;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = 0.08;
      eq.connect(satDry).connect(glue);
      eq.connect(sat).connect(satWet).connect(glue);
      glue.connect(lift).connect(lim);
      this.pol = { on: false, amt: 0, padHp, lead, leadHp, leadWet, eq, satDry, sat, satWet, glue, lift, lim };
    }
    const P = this.pol;
    if (on !== P.on) {
      P.on = on;
      const out = ctx.destination;
      const taps = [this.ana, this.recDest].filter((n): n is AnalyserNode | MediaStreamAudioDestinationNode => !!n);
      if (on) {
        this.padDuck.disconnect(this.scPad);
        this.padDuck.connect(P.padHp);
        this.makeup.disconnect(out);
        for (const n of taps) this.makeup.disconnect(n);
        this.makeup.connect(P.eq);
        P.lim.connect(out);
        for (const n of taps) P.lim.connect(n);
      } else {
        this.padDuck.disconnect(P.padHp);
        this.padDuck.connect(this.scPad);
        this.makeup.disconnect(P.eq);
        P.lim.disconnect();
        this.makeup.connect(out);
        for (const n of taps) this.makeup.connect(n);
        for (const g of [this.scPad, this.scBass, P.lead]) g.gain.cancelScheduledValues(t), g.gain.setValueAtTime(1, t);
      }
    }
    if (!on) return;
    if (Math.abs(amt - P.amt) > 0.001) {
      P.amt = amt;
      P.eq.gain.setTargetAtTime(-3.5 * amt, t, 0.1);
      P.sat.curve = satCurve(1 + amt * 2);
      P.satWet.gain.setTargetAtTime(amt * 0.45, t, 0.1);
      P.satDry.gain.setTargetAtTime(1 - amt * 0.45, t, 0.1);
      P.glue.threshold.setTargetAtTime(-16 - amt * 6, t, 0.1);
      P.glue.ratio.setTargetAtTime(1.5 + amt * 1.5, t, 0.1);
      P.lift.gain.setTargetAtTime(1 + amt * 0.35, t, 0.1);
    }
  }
  /** Mix polish: the pad, bass and leads dip under each kick. */
  private sidechain(when: number, k: number) {
    const a = this.polAmt;
    if (!a || !this.pol) return;
    const t = this.ctx.currentTime + when;
    const beat = 60 / Math.max(40, this.bpmNow);
    const duck = (g: GainNode, by: number) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(1 - by * Math.min(1, k), t, 0.004);
      g.gain.setTargetAtTime(1, t + 0.03, beat * 0.16);
    };
    duck(this.scPad, 0.4 * a);
    duck(this.scBass, 0.55 * a);
    duck(this.pol.lead, 0.3 * a);
  }
  /** A generated reverb: early reflections, then a tail whose highs die first. */
  private impulse2(kind: string) {
    const sr = this.ctx.sampleRate;
    const K = kind === 'room' ? { sec: 1.1, damp: 0.6, bright: 0.45, er: [0.011, 0.017, 0.023, 0.031, 0.043], build: 0.01 }
      : kind === 'plate' ? { sec: 2.3, damp: 0.2, bright: 0.85, er: [] as number[], build: 0.002 }
      : { sec: 3.2, damp: 0.4, bright: 0.6, er: [0.019, 0.029, 0.043, 0.061, 0.083], build: 0.03 };
    const len = Math.floor(sr * K.sec);
    const b = this.ctx.createBuffer(2, len, sr);
    // Match the loudness of the plain reverb, so the Reverb amount means the same.
    const ref = this.verb.buffer?.getChannelData(0);
    let refE = 0;
    if (ref) for (let i = 0; i < ref.length; i++) refE += ref[i] * ref[i];
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const a = 0.06 + 0.94 * K.bright * Math.pow(1 - x, 1 + K.damp * 4);
        lp += a * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-6.9 * x) * Math.min(1, i / (K.build * sr + 1));
      }
      for (const er of K.er) {
        const i = Math.floor((er + c * 0.0013) * sr);
        if (i < len) d[i] += (Math.random() < 0.5 ? -1 : 1) * 0.6 * Math.exp(-er * 10);
      }
      let e = 0;
      for (let i = 0; i < len; i++) e += d[i] * d[i];
      const k = refE > 0 && e > 0 ? Math.sqrt(refE / e) : 1;
      for (let i = 0; i < len; i++) d[i] *= k;
    }
    return b;
  }
  // Single-cycle waves made in code, for Unison and Wavetable motion.
  private tbl: Record<'saw' | 'bright' | 'warm' | 'vocal', PeriodicWave> | null = null;
  private get tables() {
    if (this.tbl) return this.tbl;
    const make = (n: number, amp: (h: number) => number) => {
      const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
      for (let h = 1; h <= n; h++) im[h] = amp(h);
      return this.ctx.createPeriodicWave(re, im);
    };
    const bump = (h: number, at: number, w: number) => Math.exp(-((h - at) ** 2) / w);
    this.tbl = {
      saw: make(24, (h) => 1 / h),
      bright: make(32, (h) => (h % 2 ? 1 : 0.6) / Math.pow(h, 0.65)),
      warm: make(10, (h) => 1 / (h * h)),
      vocal: make(24, (h) => 0.35 / h + bump(h, 4, 2.5) + 0.6 * bump(h, 11, 6)),
    };
    return this.tbl;
  }
  // Pad extras: a stack of detuned saws (Unison) and a pair of waves that
  // crossfade with the breath and the field (Wavetable motion). Made when
  // first needed and dropped again when both are off.
  private padX: { uni: OscillatorNode[]; uniG: GainNode; wA: OscillatorNode[]; wB: OscillatorNode[]; aG: GainNode; bG: GainNode; uniAmt: number } | null = null;
  private padHz = [220, 277, 330, 415];
  private padXSet(uni: number, wave: number, t: number) {
    const ctx = this.ctx;
    if (!(uni > 0 || wave > 0) || this.p.pad <= 0) {
      if (this.padX) {
        const X = this.padX;
        this.padX = null;
        for (const o of [...X.uni, ...X.wA, ...X.wB]) o.stop();
        X.uniG.disconnect();
        X.aG.disconnect();
        X.bG.disconnect();
      }
      return;
    }
    if (!this.padX) {
      const T = this.tables;
      const uniG = ctx.createGain(), aG = ctx.createGain(), bG = ctx.createGain();
      for (const g of [uniG, aG, bG]) (g.gain.value = 0), g.connect(this.padFilter);
      const uni: OscillatorNode[] = [], wA: OscillatorNode[] = [], wB: OscillatorNode[] = [];
      for (let slot = 0; slot < 4; slot++) {
        for (let j = 0; j < 4; j++) {
          const o = ctx.createOscillator();
          o.setPeriodicWave(T.saw);
          o.frequency.value = this.padHz[slot];
          const pn = ctx.createStereoPanner();
          pn.pan.value = (j % 2 ? 1 : -1) * (j < 2 ? 0.45 : 0.9);
          o.connect(pn).connect(uniG);
          o.start();
          uni.push(o);
        }
        for (const [list, w, g] of [[wA, T.vocal, aG], [wB, T.warm, bG]] as const) {
          const o = ctx.createOscillator();
          o.setPeriodicWave(w);
          o.frequency.value = this.padHz[slot];
          o.connect(g);
          o.start();
          list.push(o);
        }
      }
      this.padX = { uni, uniG, wA, wB, aG, bG, uniAmt: -1 };
    }
    const X = this.padX;
    if (Math.abs(uni - X.uniAmt) > 0.02) {
      X.uniAmt = uni;
      X.uni.forEach((o, k) => {
        const j = k % 4;
        o.detune.setTargetAtTime((j % 2 ? 1 : -1) * (j < 2 ? 0.5 : 1) * (6 + uni * 22), t, 0.2);
      });
    }
    X.uniG.gain.setTargetAtTime(uni * 0.05, t, 0.4);
    // The morph: the breath sways it, a lively field leans to the brighter wave.
    const x = Math.max(0, Math.min(1, 0.5 + 0.3 * Math.sin(this.padLfo * 0.3) + (this.energy - 0.25) * 1.2));
    X.aG.gain.setTargetAtTime(wave * 0.09 * x, t, 0.5);
    X.bG.gain.setTargetAtTime(wave * 0.09 * (1 - x), t, 0.5);
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
    if (tb in BANDS) return BANDS[tb as Band][Math.min(3, Math.floor(tone * 4))];
    return tb as Voice;
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
    if (this.drumQ.length <= 64) this.drumQ.push({ kind: 'note', k: vel, at: this.ctx.currentTime + when, col: this.stepNow, len: Vd.decay * P.length * this.lenK, pc: ((Math.round(69 + 12 * Math.log2(fl / 440)) % 12) + 12) % 12 });
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
    if (V.ks) {
      // A modelled string instead of the two oscillators (they run silent, for the voice count).
      const ks = ctx.createBufferSource();
      const [buf, rate] = this.ksBuf(f, V.ks, decay);
      ks.buffer = buf;
      ks.playbackRate.value = rate;
      if (bend) {
        ks.detune.setValueAtTime(bend, t);
        ks.detune.linearRampToValueAtTime(0, t + (o?.bend ? 0.16 : 0.08));
      }
      ks.connect(g);
      nodes.push(ks);
    } else {
      o1.connect(g);
      o2.connect(g2).connect(g);
    }
    out.connect(pn);
    // The leads: Steps and Strings get Mix polish's low cut and duck, and Unison and Wavetable motion.
    const lead = this.cur === 'steps' || this.cur === 'strings';
    const pol = lead && this.pol?.on && !wetMore ? this.pol : null;
    const route = (nd: AudioNode) => {
      if (!pol) return this.send(nd, 1 + wetMore);
      nd.connect(pol.lead);
      if (this.echoIn && P.echo > 0) nd.connect(this.echoIn);
    };
    route(pn);
    const extra: AudioNode[] = [];
    const wv = lead ? P.wave ?? 0 : 0;
    if (wv > 0) {
      // Wavetable motion: a bright (or, in a lively field, vocal) wave at the
      // strike melts into a warm one; a busy field holds the brightness longer.
      const T = this.tables;
      const hold = decay * (0.2 + 0.5 * Math.min(1, this.energy * 1.5));
      const lvl = wv * 0.8;
      for (const [w, from, to] of [[this.energy > 0.45 ? T.vocal : T.bright, 1, 0.08], [T.warm, 0.08, 0.9]] as const) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(w);
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.setValueAtTime(lvl * from, t);
        og.gain.linearRampToValueAtTime(lvl * to, t + hold);
        o.connect(og).connect(g);
        nodes.push(o);
      }
    }
    const uni = lead ? P.unison ?? 0 : 0;
    if (uni > 0) {
      // Unison: more copies of the note, detuned and spread across the stereo field.
      const n = this.voices > 18 ? 2 : this.voices > 10 ? 4 : 6;
      const gu = ctx.createGain();
      gu.gain.setValueAtTime(0, t);
      gu.gain.linearRampToValueAtTime((peak * uni * 1.1) / Math.sqrt(n), t + atk);
      gu.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      for (let j = 0; j < n; j++) {
        const side = j % 2 ? 1 : -1;
        const pos = ((j >> 1) + 1) / Math.ceil(n / 2);
        const o = ctx.createOscillator();
        o.type = V.type === 'sine' ? 'triangle' : V.type;
        o.frequency.value = f;
        o.detune.value = side * pos * (6 + uni * 22);
        const up = ctx.createStereoPanner();
        up.pan.value = Math.max(-1, Math.min(1, pan + side * pos * 0.85 * uni));
        o.connect(up).connect(gu);
        nodes.push(o);
      }
      route(gu);
      extra.push(gu);
    }
    for (const nd of nodes) {
      nd.start(t);
      nd.stop(end);
    }
    o1.onended = () => {
      this.voices--;
      pn.disconnect();
      for (const x of extra) x.disconnect();
    };
  }

  // A plucked string, Karplus-Strong: a burst of noise (brighter for a pick,
  // softer for a thumb) in a loop one period long, smoothed a little each
  // pass. Kept per pitch; played back at the exact rate for the note.
  private ksCache = new Map<string, AudioBuffer>();
  private ksBuf(f: number, ks: { bright: number; keep: number }, dur: number): [AudioBuffer, number] {
    const sr = this.ctx.sampleRate;
    // Averaging with the next sample shortens the loop by half a sample.
    const N = Math.max(2, Math.round(sr / f + 0.5));
    const rate = (f * (N - 0.5)) / sr;
    const secs = Math.min(4, Math.max(0.3, Math.ceil(dur * 2) / 2));
    const key = `${ks.bright}|${ks.keep}|${N}|${secs}`;
    let b = this.ksCache.get(key);
    if (!b) {
      if (this.ksCache.size > 160) this.ksCache.clear();
      const len = Math.ceil(sr * secs);
      b = this.ctx.createBuffer(1, len, sr);
      const out = b.getChannelData(0);
      const line = new Float32Array(N);
      const a = 0.12 + 0.88 * ks.bright;
      let lp = 0, mean = 0;
      for (let i = 0; i < N; i++) {
        lp += (Math.random() * 2 - 1 - lp) * a;
        line[i] = lp;
        mean += lp;
      }
      mean /= N;
      // Higher notes pass the loop more often, so they keep a little more each pass.
      const keep = 1 - (1 - ks.keep) * Math.min(1, 220 / f);
      let peak = 0;
      for (let i = 0, j = 0; i < len; i++) {
        const v = line[j] - mean;
        out[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
        const n = j + 1 === N ? 0 : j + 1;
        line[j] = keep * 0.5 * (line[j] + line[n]) + (1 - keep) * mean;
        j = n;
      }
      const k = peak > 0 ? 0.9 / peak : 1;
      for (let i = 0; i < len; i++) out[i] *= k;
      this.ksCache.set(key, b);
    }
    return [b, rate];
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

  // One grain in the chosen sound. Height sets the pitch or brightness, x the pan.
  private grainOf(x: number, y: number, w: number, h: number, amt: number, speed: number) {
    const P = this.p;
    const lenK = Math.pow(8, (P.grainLen ?? 0.5) - 0.5);
    const kind = P.grainSound ?? 'dust';
    if (kind === 'dust') return this.grain(x, y, w, h, amt, speed, (0.006 + (1 - speed) * 0.03) * lenK);
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.016;
    const pn = ctx.createStereoPanner();
    pn.pan.value = (x / w) * 1.6 - 0.8;
    const g = ctx.createGain();
    g.connect(pn);
    const hi = 1 - Math.min(1, Math.max(0, y / h));
    let stop = t;
    if (kind === 'vinyl') {
      // A dusty record: a sharp click, sometimes a pop.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const lp = ctx.createBiquadFilter();
      lp.type = Math.random() < 0.3 ? 'lowpass' : 'highpass';
      lp.frequency.value = lp.type === 'lowpass' ? 900 : 2500;
      const len = 0.0025 * lenK;
      g.gain.setValueAtTime(amt * (0.2 + Math.random() * 0.45), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(lp).connect(g);
      src.start(t, Math.random() * 0.9, len + 0.01);
      stop = t + len;
      src.onended = () => pn.disconnect();
    } else if (kind === 'rain') {
      // A drop: a bright tick that falls a little in pitch.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      const f0 = 1800 + hi * 5500;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.02 * lenK);
      bp.Q.value = 9;
      const len = 0.02 * lenK;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amt * 1.2, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(bp).connect(g);
      src.start(t, Math.random() * 0.9, len + 0.01);
      stop = t + len;
      src.onended = () => pn.disconnect();
    } else if (kind === 'wood') {
      // A knock: noise through a ringing filter, tuned to the scale.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(5000, this.freq(Math.round(hi * (this.L * 2)), 60));
      bp.Q.value = 28;
      const len = 0.06 * lenK;
      g.gain.setValueAtTime(amt * 4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(bp).connect(g);
      src.start(t, Math.random() * 0.9, 0.012);
      stop = t + len;
      src.onended = () => setTimeout(() => pn.disconnect(), len * 1000 + 50);
    } else {
      // Notes: a tiny tone on the scale (granular glitter); bubbles rise in pitch.
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f = Math.min(6000, this.freq(Math.round(hi * (this.L * 2.5)), 72));
      const len = (kind === 'bubbles' ? 0.05 : 0.04) * lenK;
      o.frequency.setValueAtTime(f, t);
      if (kind === 'bubbles') o.frequency.exponentialRampToValueAtTime(f * 2.4, t + len);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amt * (kind === 'bubbles' ? 0.15 : 0.13) * (0.5 + Math.random() * 0.5), t + Math.min(0.006, len * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0005, t + len);
      o.connect(g);
      o.start(t);
      o.stop(t + len + 0.01);
      stop = t + len;
      o.onended = () => pn.disconnect();
    }
    void stop;
    this.send(pn, 0.4);
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
    for (let j = 0; j < 5; j++) this.note(this.chordTone(j + 1), 0.55 * k, -0.6 + j * 0.3, this.p.accVoice ?? 'bell', j * 0.07);
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

  // The bass line, shaped. `n` is the note the beat (or the field) asked for.
  private bassShape(n: { deg: number; vel: number; len: number; slide: boolean; up: number } | null, pat: string, s: number, e: number, stepDur: number, ed: (row: number, nat: boolean) => boolean) {
    const P = this.p;
    const R = this.chordRoot();
    const live = e > 0.03;
    // A pattern of its own instead of the beat's line.
    if (pat !== 'beat') {
      n = null;
      let deg = -999, len = stepDur * 1.8, vel = 0.85, up = 0;
      if (pat === 'hold') {
        if (s === 0) (deg = R), (len = stepDur * 15), (vel = 1);
        else if (s === 8 && e > 0.3) (deg = R), (len = stepDur * 7);
      } else if (pat === 'pump') {
        if (s % 2 === 0) (deg = R), (up = s % 4 === 2 ? 1 : 0), (len = stepDur * 1.4), (vel = s % 4 === 0 ? 1 : 0.75);
      } else if (pat === 'walk') {
        if (s % 4 === 0) (deg = R + [0, 2, 4, 5][s / 4]), (len = stepDur * 3.6), (vel = s === 0 ? 1 : 0.8);
      } else if (pat === 'arp') {
        if (s % 2 === 0) (deg = this.chordTone([0, 1, 2, 3, 2, 1, 2, 1][s / 2])), (len = stepDur * 1.7), (vel = s % 4 === 0 ? 0.95 : 0.75);
      } else if (pat === 'offbeat') {
        if (s % 4 === 2) (deg = R), (len = stepDur * 1.2), (vel = 0.9);
      }
      if (!live && s !== 0) deg = -999;
      const play = ed(3, deg > -999);
      if (play && deg === -999) (deg = R), (len = stepDur * 1.5);
      if (play) n = { deg, vel, len, slide: false, up };
    }
    const move = P.bassMove ?? 0;
    // Movement: some notes jump an octave or go to the fifth, and empty
    // eighths fill with chord tones, more as the field gets busier.
    if (n && s !== 0 && move > 0 && Math.random() < move * 0.55) {
      const r = Math.random();
      if (r < 0.45) n.up = Math.min(1, n.up + 1);
      else if (r < 0.8) n.deg = this.chordTone(2);
      else n.deg = this.chordTone(1);
    }
    if (!n && live && s % 2 === 0 && s !== 0 && move > 0 && Math.random() < move * (0.15 + e * 0.35)) {
      n = { deg: this.chordTone([0, 1, 2][(Math.random() * 3) | 0]), vel: 0.7, len: stepDur * 1.3, slide: false, up: Math.random() < move * 0.4 ? 1 : 0 };
    }
    // Walk in: the last beat before the chord changes steps into the new root.
    const walk = P.bassWalk ?? 0;
    const left = this.beatsToChange();
    if (walk > 0 && live && left > 0 && left <= 1 && (s === 12 || s === 14) && Math.random() < walk) {
      const pr = this.progression();
      const next = pr[(this.chord + 1) % pr.length];
      if (next !== R) {
        const lo = next - 1, hi = next + 1;
        const deg = s === 12 ? (Math.abs(lo - R) < Math.abs(hi - R) ? lo - 1 : hi + 1) : Math.abs(lo - R) < Math.abs(hi - R) ? lo : hi;
        n = { deg, vel: 0.8, len: stepDur * 1.7, slide: false, up: 0 };
      }
    }
    // Ghost notes: soft, short, on the sixteenths in between.
    const ghost = P.bassGhost ?? 0;
    if (!n && live && s % 2 === 1 && ghost > 0 && Math.random() < ghost * 0.4) n = { deg: R, vel: 0.32, len: stepDur * 0.6, slide: false, up: 0 };
    // Glide: some notes slide in from the last one.
    if (n && !n.slide && (P.bassGlide ?? 0) > 0 && Math.random() < (P.bassGlide ?? 0) * 0.7) n.slide = true;
    return n;
  }

  // Bass: one body oscillator through a low-pass (its sweep makes the
  // character) with a sine underneath for weight.
  private bassF = 0; // the last bass note's pitch, for slides
  private bassNote(deg: number, vel: number, len: number, when: number, slide = false, up = 0) {
    if (this.voices >= MAX_VOICES || this.buildU > 0.75) return;
    // Octave: the setting, plus the line's own jumps.
    const oct = 2 ** Math.max(-1, Math.min(2, (this.p.bassOct ?? 0) + up));
    {
      let f0 = this.freq(deg, 36);
      while (f0 < 38) f0 *= 2;
      while (f0 > 200) f0 /= 2;
      f0 *= oct;
      this.log('bass', vel, Math.log2(f0 / 55) / 6, len * (this.bpmNow / 60), when);
    }
    if (!this.audible('bass')) return;
    // The bass note too, for the field's bass reactions (Bass moves the field).
    if (this.drumQ.length <= 64) this.drumQ.push({ kind: 'bass', k: vel, at: this.ctx.currentTime + when, col: this.stepNow, len });
    this.voices++;
    const B = BASSES[this.p.bassSound] ?? BASSES.synth;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    let f = this.freq(deg, 36);
    while (f < 38) f *= 2;
    while (f > 200) f /= 2;
    f *= oct;
    if (B.ring) len = Math.min(len, B.ring);
    const end = t + len + B.release * 3 + 0.1;
    const from = this.bassF;
    this.bassF = f;
    // Pitch: slide in from the last note, or an 808's thump, or straight on.
    const pitch = (p: AudioParam, k: number) => {
      if (slide && from > 0 && from !== f) {
        p.setValueAtTime(from * k, t);
        p.exponentialRampToValueAtTime(f * k, t + Math.min(0.08 + (this.p.bassGlide ?? 0) * 0.14, len * 0.6));
      } else if (B.punch) {
        p.setValueAtTime(f * k * B.punch, t);
        p.exponentialRampToValueAtTime(f * k, t + 0.03);
      } else p.setValueAtTime(f * k, t);
    };
    const nodes: AudioScheduledSourceNode[] = [];
    const mix = ctx.createGain();
    const drift = (B.drift ?? 0) * (Math.random() * 2 - 1);
    const voices: OscillatorNode[] = [];
    for (const [type, ratio, cents, gain, pan] of B.osc) {
      const o = ctx.createOscillator();
      o.type = type;
      pitch(o.frequency, ratio);
      o.detune.setValueAtTime(cents + drift + (B.drop ?? 0), t);
      if (B.drop) o.detune.linearRampToValueAtTime(cents + drift, t + 0.05);
      const og = ctx.createGain();
      og.gain.value = gain;
      o.connect(og);
      if (pan) {
        const pn = ctx.createStereoPanner();
        // Mix polish keeps the bass in the middle.
        pn.pan.value = pan * (1 - this.polAmt);
        og.connect(pn).connect(mix);
      } else og.connect(mix);
      voices.push(o);
      nodes.push(o);
    }
    if (B.fm) {
      // A sine modulator on every oscillator's pitch, its depth dying away.
      const [r, idx, dec] = B.fm;
      const m = ctx.createOscillator();
      pitch(m.frequency, r);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * idx * (0.6 + vel * 0.6), t);
      mg.gain.setTargetAtTime(f * idx * 0.12, t, dec);
      m.connect(mg);
      for (const o of voices) mg.connect(o.frequency);
      nodes.push(m);
    }
    let pre: AudioNode = mix;
    if (B.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = satCurve(B.drive);
      ws.oversample = '2x';
      pre = mix.connect(ws);
    }
    // The filter: snaps open with the note (harder when played harder) and closes.
    const cut = Math.min(12000, B.cut * Math.sqrt(f / 55) * (1 + this.energy * B.open) * 2 ** (this.p.bassTone * 1.5));
    const top = Math.min(16000, cut * (1 + (B.env - 1) * (0.5 + vel * 0.6)));
    const filters: BiquadFilterNode[] = [];
    let out: AudioNode = pre;
    for (let k = 0; k < (B.poles === 4 ? 2 : 1); k++) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = k === 0 ? B.q : 0.7;
      lp.frequency.setValueAtTime(top, t);
      lp.frequency.setTargetAtTime(cut, t + 0.003, B.fdec);
      out = out.connect(lp);
      filters.push(lp);
    }
    if (B.wob) {
      // Wobble: the filter swings in time with the beat.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = (this.bpmNow / 60) * B.wob;
      const lg = ctx.createGain();
      lg.gain.value = cut * 2.5;
      lfo.connect(lg);
      for (const lp of filters) lg.connect(lp.frequency);
      nodes.push(lfo);
    }
    if (B.fuzz) {
      const ws = ctx.createWaveShaper();
      ws.curve = satCurve(B.fuzz);
      out = out.connect(ws);
    }
    const g = ctx.createGain();
    const lvl = vel * B.gain * 0.24;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + B.attack);
    g.gain.setTargetAtTime(lvl * B.sustain, t + B.attack, B.decay / 3);
    g.gain.setTargetAtTime(0.0001, t + len, B.release / 3);
    out.connect(g);
    if (B.sub > 0) {
      // Clean, mono weight underneath.
      const s = ctx.createOscillator();
      pitch(s.frequency, 2 ** (B.subOct ?? 0));
      const sg = ctx.createGain();
      sg.gain.value = B.sub * 0.6;
      s.connect(sg).connect(g);
      nodes.push(s);
    }
    if (B.click) {
      // A finger or pick on the string: a tiny burst of filtered noise.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = B.click;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(lvl * 1.2, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      src.connect(bp).connect(cg);
      this.send(cg, 0.12, false);
      src.start(t, Math.random() * 0.8, 0.04);
    }
    if ((this.p.sub ?? 0) > 0) {
      // Sub: a clean sine an octave down (at the note itself when it's already deep).
      const s = ctx.createOscillator();
      pitch(s.frequency, f > 70 ? 0.5 : 1);
      const sg = ctx.createGain();
      sg.gain.value = (this.p.sub ?? 0) * 0.9;
      s.connect(sg).connect(g);
      nodes.push(s);
    }
    g.connect(this.bassDuck);
    for (const nd of nodes) {
      nd.start(t);
      nd.stop(end);
    }
    nodes[0].onended = () => {
      this.voices--;
      g.disconnect();
      mix.disconnect();
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

  // Kits from drums.ts: one pitched body, with the kit's pitch jitter.
  private kitBody(b: Body, k: number, when: number, wet: number, tune = 1) {
    const K = KITS[this.p.kit] ?? KITS.soft;
    const j = tune * (K.jit ? 1 + (Math.random() - 0.5) * K.jit : 1);
    this.body(when, b[0] * j, b[1] * j, b[2], b[3], b[4] * k, b[5] ?? 'sine', wet);
  }

  private kick(k: number, when: number) {
    // Late in a build the kick drops out, so the drop hits harder.
    if (this.buildU > 0.5) return;
    this.log('drums', k, 0.02, 0.25, when);
    this.drumEv('kick', k, when);
    if (!this.audible('drums')) return;
    this.pump(when, k);
    this.sidechain(when, k);
    this.lowKick(when, k);
    const K = KITS[this.p.kit];
    if (K?.kick) {
      this.kitBody(K.kick.body, k, when, K.wet * 0.3);
      if (K.kick.sub) this.kitBody(K.kick.sub, k, when, 0);
      if (K.kick.click) this.hiss(when, 'highpass', 3000, 0.7, 0.001, 0.01, K.kick.click * k, 0, 0);
      return;
    }
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

  // Low end and Kick punch: a deep sine thump under the kit's own kick, a little
  // driven so phone speakers carry it, and the bass and pad duck out of its way.
  private lowKick(when: number, k: number) {
    const low = this.p.lowEnd ?? 0;
    const x = Math.min(1, (this.p.kickPunch ?? 0) + low * 0.6);
    if (x > 0) {
      const ctx = this.ctx;
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.06 + x * 0.04);
      const g = ctx.createGain();
      const dec = 0.22 + x * 0.35;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.55 * x * k, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      if (!this.thumpShaper) {
        this.thumpShaper = ctx.createWaveShaper();
        this.thumpShaper.curve = satCurve(2.5);
        this.thumpShaper.connect(this.dry);
      }
      o.connect(g).connect(this.thumpShaper);
      o.start(t);
      o.stop(t + dec + 0.05);
      o.onended = () => g.disconnect();
    }
    if (low > 0) {
      // Duck the bass, and the pad unless Pump already does.
      const beat = 60 / Math.max(40, this.bpmNow);
      const t = this.ctx.currentTime + when;
      const g = this.bassDuck.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(1 - low * 0.55 * Math.min(1, k), t + 0.01);
      g.setTargetAtTime(1, t + 0.03, beat * 0.18);
      if (this.p.padPump < low * 0.5) this.pump(when, k, low * 0.5);
    }
  }

  private snare(k: number, when: number) {
    this.log('drums', k, 0.12, 0.25, when);
    this.drumEv('snare', k, when);
    if (!this.audible('drums')) return;
    const K = KITS[this.p.kit];
    if (K?.snare) {
      if (K.snare.body) this.kitBody(K.snare.body, k, when, K.wet * 0.8);
      const [ty, f, q, a, d, amp] = K.snare.noise;
      return this.hiss(when, ty, f, q, a, d, amp * k, 0, K.wet);
    }
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
    this.log('drums', k * 0.6, open ? 0.24 : 0.22, 0.1, when);
    this.drumEv('hat', k, when);
    if (!this.audible('drums')) return;
    const K = KITS[this.p.kit];
    if (K?.hat) {
      const H = K.hat;
      const d = open ? H.open : H.closed;
      const j = K.jit ? 1 + (Math.random() - 0.5) * K.jit : 1;
      const pa = this.polAmt;
      if (pa) this.hatSide = -this.hatSide;
      this.hiss(when, H.type, H.f * j, H.q, 0.001, d, H.amp * k, pa ? this.hatSide * (0.3 + 0.4 * pa) : 0.3, K.wet * 0.4);
      if (H.ping) {
        // Metal: two square tones that don't agree.
        this.body(when, 3310, 3300, 0.01, d * 0.8, 0.025 * H.ping * k, 'square', 0.05);
        this.body(when, 5170, 5160, 0.01, d * 0.6, 0.02 * H.ping * k, 'square', 0.05);
      }
      return;
    }
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

  // The drums a beat adds: clap, rim, percussion, toms and a crash.
  private clap(k: number, when: number) {
    this.log('drums', k, 0.14, 0.2, when);
    this.drumEv('snare', k, when);
    if (!this.audible('drums')) return;
    const K = KITS[this.p.kit] ?? KITS.soft;
    const C = K.clap;
    for (let j = 0; j < C.n; j++) this.hiss(when + j * 0.011, 'bandpass', C.f, 1.2, 0.001, 0.018, C.amp * k * 1.1, 0, K.wet);
    this.hiss(when + C.n * 0.011, 'bandpass', C.f * 0.95, 1, 0.002, C.decay, C.amp * k * 0.85, 0, K.wet * 1.3);
  }

  private rim(k: number, when: number) {
    this.log('drums', k * 0.8, 0.16, 0.1, when);
    if (!this.audible('drums')) return;
    const K = KITS[this.p.kit] ?? KITS.soft;
    this.kitBody(K.rim, k, when, K.wet);
    this.hiss(when, 'highpass', 4000, 0.7, 0.001, 0.008, 0.12 * k, -0.15, K.wet * 0.5);
  }

  private perc(k: number, when: number) {
    this.log('drums', k * 0.8, 0.18, 0.15, when);
    if (!this.audible('drums')) return;
    const K = KITS[this.p.kit] ?? KITS.soft;
    for (const b of K.perc) this.kitBody(b, k, when, K.wet);
  }

  private tom(k: number, when: number, down = 0) {
    this.log('drums', k, 0.08 - down * 0.015, 0.25, when);
    if (!this.audible('drums')) return;
    const K = KITS[this.p.kit] ?? KITS.soft;
    this.kitBody(K.tom, k, when, K.wet, Math.pow(0.84, down));
  }

  private crash(k: number, when: number) {
    this.log('drums', k * 0.7, 0.3, 1, when);
    this.drumEv('crash', k, when);
    if (!this.audible('drums')) return;
    const K = KITS[this.p.kit] ?? KITS.soft;
    const [ty, f, q, a, d, amp] = K.crash;
    this.hiss(when, ty, f, q, a, d, amp * k, -0.25, K.wet + 0.2);
    this.hiss(when, 'bandpass', f * 0.7, 1.5, a, d * 0.5, amp * k * 0.5, 0.25, K.wet + 0.2);
  }

  // --- Beats from the library ---
  private beatIdx = 0;
  private arpI = 0;
  private beatSet = -1;
  private beatGenre = '';
  private beatBar = -1;
  /** A drop in the music asks for a new beat at the next bar. */
  private beatSwap = false;
  /** Which of the genre's beats is playing (it can move on by itself). */
  get beatPlaying() {
    return this.beatIdx;
  }
  private beatOf(P: SoundParams, tick: number, s: number) {
    const g = P.genre ? genreById(P.genre) : undefined;
    if (!g) return null;
    if (P.genre !== this.beatGenre || P.beat !== this.beatSet) {
      this.beatGenre = P.genre;
      this.beatSet = P.beat;
      this.beatIdx = Math.max(0, Math.round(P.beat) || 0) % g.beats.length;
    }
    const bar = Math.floor(tick / 16);
    if (s === 0 && bar !== this.beatBar) {
      this.beatBar = bar;
      if (P.beatChange > 0 && g.beats.length > 1 && ((bar > 0 && bar % P.beatChange === 0) || this.beatSwap)) {
        this.beatIdx = (this.beatIdx + 1 + Math.floor(Math.random() * (g.beats.length - 1))) % g.beats.length;
      }
      this.beatSwap = false;
    }
    return { g, beat: g.beats[this.beatIdx] ?? g.beats[0], bar };
  }

  private beatDrums(P: SoundParams, B: NonNullable<ReturnType<ParticleSound['beatOf']>>, tick: number, s: number, sw: number, stepDur: number, k: number, e: number, onKick: boolean, ed: (row: number, nat: boolean) => boolean) {
    const V = P.vary;
    const hits = new Map<DrumRow, { v: number; n: number }>();
    const calm = P.follow * Math.max(0, 0.7 - e * 1.6);
    // Song mode: this section's beat move. Half-time reads the beat at half speed.
    const mv = this.secMove?.beat ?? 'full';
    const half = mv === 'half';
    for (const r of DRUM_ROWS) {
      const row = B.beat[r];
      if (!row) continue;
      const i = (half ? tick >> 1 : tick) % row.length;
      let h = half && tick % 2 ? null : stepHit(row[i]);
      const anchor = (r === 'k' && i === 0) || ((r === 's' || r === 'c') && row[i] === 'X');
      // Variation: drop ghost notes and the odd hit, add ghosts and rolls.
      if (h) {
        if (h.v < 0.45 && Math.random() < V * 0.6) h = null;
        else if (!anchor && Math.random() < V * 0.12) h = null;
        else if ((r === 'h' || r === 's') && h.n === 1 && Math.random() < V * 0.1) h = { v: 0.55, n: Math.random() < 0.5 ? 2 : 3 };
      } else if (V > 0) {
        const q = Math.random();
        if (r === 'h' && q < V * 0.15) h = { v: 0.35, n: 1 };
        else if (r === 's' && q < V * 0.06) h = { v: 0.3, n: 1 };
        else if (r === 'k' && s % 2 === 0 && q < V * 0.05) h = { v: 0.6, n: 1 };
      }
      // Follow the field: calm thins out the soft hits, busy adds hats.
      if (h && !anchor && h.v < calm) h = null;
      if (!h && r === 'h' && P.follow > 0 && e > 0.5 && Math.random() < P.follow * (e - 0.5) * 0.8) h = { v: 0.4, n: 1 };
      if (h) hits.set(r, h);
    }
    this.moveHits(mv, hits, s);
    // A fill at the end of every few bars, in the genre's way.
    let down = 0;
    const from = V > 0.6 ? 8 : 12;
    if (P.fills > 0 && B.bar % P.fills === P.fills - 1 && s >= from) {
      const f = (s - from) / (16 - from);
      switch (B.g.fill) {
        case 'roll':
          hits.delete('h');
          hits.delete('o');
          hits.set('s', { v: 0.35 + 0.6 * f, n: s === 15 ? 2 : 1 });
          break;
        case 'toms':
          hits.delete('h');
          down = Math.min(3, Math.floor(f * 4));
          if (s % 2 === 0 || V > 0.4) hits.set('t', { v: 0.7 + 0.3 * f, n: 1 });
          if (s === 15) hits.set('s', { v: 0.9, n: 1 });
          break;
        case 'hats':
          hits.set('h', { v: 0.5 + 0.3 * f, n: [2, 3, 4, 3][s % 4] });
          break;
        case 'glitch':
          for (const r of ['k', 's', 'h'] as DrumRow[]) if (Math.random() < 0.45) hits.set(r, { v: 0.5 + Math.random() * 0.4, n: 2 + ((Math.random() * 3) | 0) });
          break;
        case 'drop':
          if (s >= 14) {
            hits.clear();
            if (s === 15) hits.set('s', { v: 0.9, n: 1 });
          }
          break;
      }
    }
    if (s === 0 && P.fills > 0 && B.bar > 0 && B.bar % P.fills === 0) hits.set('y', { v: 0.7, n: 1 });
    // Humanise: soft ghost snares between the beats, accents on the beat, and
    // everything but the kick a touch late now and then.
    const hum = P.human ?? 0;
    const loose = hum * Math.min(1, 0.45 + e * 1.1);
    if (loose > 0 && s % 2 === 1 && !hits.has('s') && !hits.has('c') && Math.random() < loose * 0.08) hits.set('s', { v: 0.22, n: 1 });
    const accent = hum > 0 ? 1 - hum * 0.9 * (s % 4 === 0 ? 0 : s % 2 === 0 ? 0.12 : 0.26) : 1;
    // Beat grid edits still win: '+' adds, '-' silences (kick, snare or clap, hats).
    const edit = (row: number, rs: DrumRow[]) => {
      const has = rs.some((r) => hits.has(r));
      const on = ed(row, has);
      if (!on) for (const r of rs) hits.delete(r);
      else if (!has) hits.set(rs[0], { v: 0.8, n: 1 });
    };
    edit(0, ['k']);
    edit(1, ['s', 'c']);
    edit(2, ['h', 'o']);
    if (onKick) hits.delete('k');
    for (const [r, h] of hits) {
      if (r === 'k') this.gridNow[s] = 1;
      else if (r === 's' || r === 'c') this.gridNow[16 + s] = 1;
      else if (r === 'h' || r === 'o') this.gridNow[32 + s] = 1;
      const gap = stepDur / h.n;
      const late = loose > 0 && r !== 'k' ? Math.random() * 0.012 * loose : 0;
      for (let j = 0; j < h.n; j++) this.hit(r, k * accent * ROW_GAIN[r] * h.v * (h.n > 1 ? 0.55 + (0.45 * (j + 1)) / h.n : 1), sw + j * gap + late, down);
    }
  }

  /** A section's beat move on this step's hits: thinner, hats only, or busier. */
  private moveHits(mv: BeatMove, hits: Map<DrumRow, { v: number; n: number }>, s: number) {
    if (mv === 'sparse') {
      for (const r of [...hits.keys()]) {
        const keep = (r === 'k' && s % 8 === 0) || ((r === 's' || r === 'c') && s % 8 === 4) || (r === 'h' && s % 4 === 2) || r === 'y';
        if (!keep) hits.delete(r);
      }
    } else if (mv === 'hats') {
      for (const r of ['k', 's', 'c', 't'] as DrumRow[]) hits.delete(r);
      if (s % 4 === 2 && !hits.has('h') && !hits.has('o')) hits.set('h', { v: 0.45, n: 1 });
    } else if (mv === 'busy') {
      if (!hits.has('h') && !hits.has('o')) hits.set(s % 4 === 2 && Math.random() < 0.4 ? 'o' : 'h', { v: s % 2 ? 0.3 : 0.45, n: 1 });
      if (s === 14 && !hits.has('k') && Math.random() < 0.5) hits.set('k', { v: 0.6, n: 1 });
      if (s % 4 === 3 && !hits.has('s') && Math.random() < 0.2) hits.set('s', { v: 0.3, n: 1 });
    }
  }

  private hit(r: DrumRow, k: number, when: number, down = 0) {
    switch (r) {
      case 'k': return this.kick(k, when);
      case 's': return this.snare(k, when);
      case 'c': return this.clap(k, when);
      case 'h': return this.hat(k, when, false);
      case 'o': return this.hat(k, when, true);
      case 'r': return this.rim(k, when);
      case 'p': return this.perc(k, when);
      case 't': return this.tom(k, when, down);
      case 'y': return this.crash(k, when);
    }
  }

  // --- Build and drop, and Song mode ---------------------------------------------
  // A build: the next few bars filter up from the bass, a noise riser climbs,
  // the snare rolls faster and faster, the kick and bass drop out; then on the
  // downbeat the drop lands (crash, a deep boom, everything back at once).
  private buildFrom = -1; // beat the build started (-1: none)
  private dropAt = -1; // the downbeat it lands on
  private dropNow = false;
  private buildHp: BiquadFilterNode | null = null;
  private riser: { src: AudioBufferSourceNode; g: GainNode } | null = null;
  /** Start a build that drops after `bars` whole bars. */
  buildDrop(bars = 4, at = -1) {
    if (this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.buildFrom = this.beat;
    this.dropAt = at >= 0 ? at : (Math.floor(this.beat / 4) + 1 + Math.max(1, bars - 1)) * 4;
    const secs = Math.max(0.5, ((this.dropAt - this.beat) * 60) / Math.max(40, this.bpmNow));
    if (!this.buildHp) {
      this.buildHp = ctx.createBiquadFilter();
      this.buildHp.type = 'highpass';
      this.buildHp.frequency.value = 20;
      this.splice(this.buildHp, this.buildHp);
    }
    const f = this.buildHp.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(20, f.value), t);
    f.exponentialRampToValueAtTime(900, t + secs);
    this.riser?.src.stop();
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(250, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + secs);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + secs);
    src.connect(bp).connect(g);
    // Straight to the compressor: the build's high-pass doesn't thin the riser.
    g.connect(this.comp);
    src.start(t);
    this.riser = { src, g };
  }
  /** 0 … 1 through a build, -1 when none is on. */
  get buildU() {
    if (this.dropAt < 0) return -1;
    return Math.max(0, Math.min(1, (this.beat - this.buildFrom) / Math.max(0.01, this.dropAt - this.buildFrom)));
  }
  /** True once, on the frame a drop lands. */
  takeDrop() {
    const d = this.dropNow;
    this.dropNow = false;
    return d;
  }
  cancelBuild() {
    if (this.dropAt < 0) return;
    this.dropAt = -1;
    this.buildFrom = -1;
    this.endBuild(this.ctx.currentTime);
  }
  private endBuild(t: number) {
    if (this.buildHp) {
      this.buildHp.frequency.cancelScheduledValues(t);
      this.buildHp.frequency.setTargetAtTime(20, t, 0.03);
    }
    if (this.riser) {
      const r = this.riser;
      r.g.gain.cancelScheduledValues(t);
      r.g.gain.setTargetAtTime(0.0001, t, 0.05);
      r.src.stop(t + 0.4);
      r.src.onended = () => r.g.disconnect();
      this.riser = null;
    }
  }
  private drop(t: number) {
    this.dropAt = -1;
    this.buildFrom = -1;
    this.endBuild(t);
    this.dropNow = true;
    this.cur = 'drums';
    if (this.p.drums > 0) {
      this.crash(1, 0);
      this.kick(1, 0);
    }
    // The boom: a deep sine falling away under everything.
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g).connect(this.comp);
    o.start(t);
    o.stop(t + 1.9);
    o.onended = () => g.disconnect();
    this.padSwell = 1;
    this.beatSwap = true;
  }

  // Song mode: the sound plays a whole song in sections, on a loop. Each
  // section sets how loud the layers are; Build sections end in a drop.
  private songFrom = -1;
  private songIdx = -1;
  private form: SongSection[] = SONGS.classic.form;
  private formId = 'classic';
  private loopN = 0;
  /** The arrangement playing (the strip on the Song card draws it). */
  get songForm() {
    return this.form;
  }
  /** Pick the arrangement. While a song plays, the new one starts from its top on the next bar. */
  setForm(id: string) {
    if (id === this.formId && this.form.length) return;
    this.formId = id;
    this.form = id === 'shuffle' ? randomForm() : (SONGS[id] ?? SONGS.classic).form;
    this.nextForm = null;
    if (this.songFrom >= 0) {
      // Back to the song's own beat and no build, then the new form from the top.
      if (this.swapFrom >= 0) this.beatIdx = this.swapFrom;
      this.swapFrom = -1;
      this.secMove = null;
      this.cancelBuild();
      this.songFrom = (Math.floor(this.beat / 4) + 1) * 4;
      this.songIdx = -1;
      this.loopN = 0;
    }
  }
  private nextForm: SongSection[] | null = null;
  /** Song variation, 0 to 1: 0 keeps every section's beat and look as set. */
  songVary = 0.5;
  /** This section's moves (null before the song has entered one). */
  secMove: { beat: BeatMove; pic: PicMove } | null = null;
  // Last loop's picks, by section, and the sections kept as they are.
  private lastMoves: ({ beat: BeatMove; pic: PicMove } | undefined)[] = [];
  private locked = new Set<number>();
  private movesOf: SongSection[] | null = null;
  private swapFrom = -1;
  /** Keep the playing section's moves on later loops (or let them roll again). */
  lockSection(i: number, on: boolean) {
    if (on) this.locked.add(i);
    else this.locked.delete(i);
  }
  sectionLocked(i: number) {
    return this.locked.has(i);
  }
  private enterSection(i: number) {
    if (this.movesOf !== this.form) {
      this.movesOf = this.form;
      this.lastMoves = [];
      this.locked.clear();
    }
    const S = this.form[i];
    const role = ROLE[S.name];
    const last = this.lastMoves[i];
    const prev = this.secMove;
    let mv: { beat: BeatMove; pic: PicMove };
    if (last && this.locked.has(i)) mv = last;
    else {
      // A calm field leans sparse, a wild one busy.
      const lean = Math.max(-1, Math.min(1, (this.energy - 0.3) * 2.5));
      // A drop is at least as full as what came before; when the beat can't
      // get any bigger, the picture has to.
      const peak = role === 'peak' && prev;
      const beat = rollMove(BEAT_MOVES[role], 'full', BEAT_FULL, this.songVary, lean, last?.beat, peak ? BEAT_FULL[prev.beat] : 0);
      const beatUp = peak && BEAT_FULL[beat] > BEAT_FULL[prev.beat] + 0.01;
      const pic = rollMove(PIC_MOVES[role], 'same', PIC_FULL, this.songVary, lean, last?.pic, peak && !beatUp ? Math.min(0.9, PIC_FULL[prev.pic] + 0.1) : 0);
      mv = { beat, pic };
    }
    this.lastMoves[i] = mv;
    this.secMove = mv;
    // A new beat from the genre for this section; the old one comes back after.
    const g = this.beatGenre ? genreById(this.beatGenre) : undefined;
    if (mv.beat === 'swap' && g && g.beats.length > 1) {
      if (this.swapFrom < 0) this.swapFrom = this.beatIdx;
      this.beatIdx = (this.swapFrom + 1 + Math.floor(Math.random() * (g.beats.length - 1))) % g.beats.length;
    } else if (this.swapFrom >= 0) {
      if (g) this.beatIdx = this.swapFrom % g.beats.length;
      this.swapFrom = -1;
    }
  }
  song(on: boolean) {
    if (on && this.nextForm) (this.form = this.nextForm), (this.nextForm = null);
    if (!on) {
      if (this.swapFrom >= 0) this.beatIdx = this.swapFrom;
      this.swapFrom = -1;
      this.secMove = null;
      this.songFrom = -1;
      this.songIdx = -1;
      this.cancelBuild();
      return;
    }
    // Starts on the next bar.
    this.songFrom = (Math.floor(this.beat / 4) + 1) * 4;
    this.songIdx = -1;
    this.loopN = 0;
    if (this.formId === 'shuffle') this.form = randomForm();
  }
  get songOn() {
    return this.songFrom >= 0;
  }
  /** Where the song is: the section, and the bar in it. */
  songNow() {
    if (this.songFrom < 0) return null;
    const F = this.form;
    const total = F.reduce((a, x) => a + x.bars, 0);
    const all = Math.max(0, (this.beat - this.songFrom) / 4);
    let bar = Math.floor(all) % total;
    const at = (all % total) / total;
    for (let i = 0; i < F.length; i++) {
      if (bar < F[i].bars) return { i, name: F[i].name, bar, bars: F[i].bars, drop: F[i].name === 'Drop' || F[i].name === 'Chorus', at, loop: Math.floor(all / total) };
      bar -= F[i].bars;
    }
    return null;
  }
  private songMix(P: SoundParams): SoundParams {
    const now = this.songNow();
    if (!now) return P;
    const sec = this.form[now.i];
    // Fade in from the section before over its first bar.
    const prev = this.form[(now.i + this.form.length - 1) % this.form.length].mix;
    const into = (((this.beat - this.songFrom) / 4) % 1 + 1) % 1;
    const k = (key: keyof SongMix) => (now.bar === 0 && !sec.hard ? prev[key] + (sec.mix[key] - prev[key]) * into : sec.mix[key]);
    return { ...P, drums: P.drums * k('drums'), bass: P.bass * k('bass'), seq: P.seq * k('seq'), pad: P.pad * k('pad'), strings: P.strings * k('strings') };
  }

  frame(F: SoundFrame) {
    // Song mode: this section's mix of the layers.
    const P = this.songFrom >= 0 ? this.songMix(this.p) : this.p;
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
    if (F.drop) this.beatSwap = true;
    const beats = F.dt * (bpm / 60);
    const before = this.beat;
    this.beat += beats;
    // Song: entering a Build section starts the build that drops at its end.
    let sn = this.songNow();
    // A new loop: the next arrangement (a fresh one when it's Different every time).
    if (sn && sn.loop !== this.loopN) {
      this.loopN = sn.loop;
      if (this.formId === 'shuffle') this.nextForm = randomForm();
      if (this.nextForm) {
        this.form = this.nextForm;
        this.nextForm = null;
        this.songFrom = Math.round(this.beat / 4) * 4;
        this.loopN = 0;
        sn = this.songNow();
      }
    }
    if (sn && sn.i !== this.songIdx) {
      this.songIdx = sn.i;
      const S = this.form[sn.i];
      this.enterSection(sn.i);
      if (S.name === 'Build' && this.dropAt < 0) this.buildDrop(S.bars - sn.bar, this.beat + (S.bars - sn.bar) * 4 - ((this.beat - this.songFrom) % 4));
    }
    if (this.dropAt >= 0 && this.beat >= this.dropAt) this.drop(t);
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
      if (Math.abs(this.echoDelay.delayTime.value - d) > 0.002) {
        this.echoDelay.delayTime.setTargetAtTime(d, t, 0.2);
        this.echoDelay2?.delayTime.setTargetAtTime(d, t, 0.2);
      }
    }
    // Tremolo in time: eighth notes for the volume, one sway a bar for the pan.
    if (this.tremLfo && (P.trem ?? 0) > 0) {
      const f = P.tremMode === 'pan' ? bpm / 240 : bpm / 30;
      if (Math.abs(this.tremLfo.frequency.value - f) > 0.01) this.tremLfo.frequency.setTargetAtTime(f, t, 0.3);
    }
    // Tape stop on a burst, at most every couple of seconds.
    if ((P.tape ?? 0) > 0 && F.thump > 0.45 && t - this.lastTape > 2) {
      this.lastTape = t;
      this.tapeStop(Math.min(1, F.thump) * (P.tape ?? 0), t);
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
        this.echoFb2?.gain.setTargetAtTime(fb, t, 0.2);
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
      if (F.scene && P.accScene !== false) this.strum(P.accents);
      if (F.shape && P.accShape !== false) this.whoosh(P.accents);
      if (P.accBurst && F.thump > 0.45 && now - this.lastBoom > 400) {
        this.lastBoom = now;
        this.cur = 'accents';
        this.log('accents', Math.min(1, F.thump), 0.02, 0.5);
        if (this.audible('accents')) this.thump(Math.min(1, F.thump) * P.accents);
      }
      if (P.accBirth !== false && F.born > Math.max(24, F.n * 0.02) && now - this.lastSparkle > 250) {
        this.lastSparkle = now;
        this.cur = 'accents';
        const save = this.tokens;
        this.tokens = 99;
        for (let j = 0; j < 3; j++) this.note(this.chordTone(6 + ((Math.random() * 4) | 0)), 0.35 * P.accents, Math.random() * 1.6 - 0.8, P.accVoice === 'bell' || !P.accVoice ? 'glass' : P.accVoice, j * 0.05);
        this.tokens = save;
      }
    }

    // Pad: the chord, swelling with energy and a slow breath, silent when still.
    // Voices glide to the next chord, drift a little in pitch and stereo,
    // and a new chord blooms (brighter and louder) before settling.
    const pd = PADS[P.padSound] ?? PADS.soft;
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    const chordKey = `${P.scale}${P.root}${P.octave}${this.chordRoot()}${this.voicing}${P.padSound}${P.padOct ?? 0}`;
    if (chordKey !== this.padChord && P.pad > 0) {
      const first = !this.padChord;
      this.padChord = chordKey;
      const v = this.padVoice();
      const glide = first ? 0.01 : Math.max(0.02, 0.35 * Math.pow((P.padGlide ?? 0.5) * 2, 1.8));
      const oc = 2 ** (P.padOct ?? 0);
      v.notes.forEach((m, slot) => {
        this.padOsc[slot * 2].frequency.setTargetAtTime(hz(m) * oc, t, glide);
        this.padOsc[slot * 2 + 1].frequency.setTargetAtTime(hz(m) * oc, t, glide);
        this.padHz[slot] = hz(m) * oc;
        if (this.padX) for (const o of [...this.padX.uni.slice(slot * 4, slot * 4 + 4), this.padX.wA[slot], this.padX.wB[slot]]) o.frequency.setTargetAtTime(hz(m) * oc, t, glide);
      });
      this.padSub.frequency.setTargetAtTime(hz(v.sub) * Math.min(1, oc), t, glide);
      this.padAir.frequency.setTargetAtTime(Math.min(9000, hz(v.notes[3]) * oc * 8), t, 0.6);
      if (!first) this.padSwell = 1;
    }
    // A burst in the field (births, a drop) blooms the pad too.
    if (F.thump > 0.3) this.padSwell = Math.max(this.padSwell, Math.min(1, F.thump));
    this.padSwell *= Math.exp(-F.dt / 2.5);
    // Pump without drums: on every beat of the clock.
    const pb = Math.floor(this.beat);
    if (pb !== this.padBeat) {
      this.padBeat = pb;
      if (P.padPump > 0 && t - this.padPumpAt > 0.25 && !(P.drums > 0 && this.audible('drums'))) this.pump(t);
    }
    if (P.padPump <= 0) this.padDuck.gain.setTargetAtTime(1, t, 0.1);
    this.padLfo += F.dt * 0.6;
    const bd = P.padBreath ?? 0.35;
    const breath = 1 - bd + bd * Math.sin(this.padLfo);
    // Hold: it keeps playing, softly, when the field is still.
    const lively = Math.max(P.padHold ? 0.55 : 0, Math.min(1, (this.energy - 0.04) * 3));
    const swell = this.padSwell * pd.swell;
    const padLvl = P.pad * lively * breath * (0.4 + 0.6 * room) * Math.min(1.8, Math.sqrt(busyK)) * (1 + 0.35 * swell);
    this.levels[LI.pad] = Math.max(this.levels[LI.pad], padLvl * 0.8);
    const padOn = this.audible('pad');
    this.padGain.gain.setTargetAtTime(padOn ? padLvl * 0.3 * pd.gain : 0, t, 0.4);
    this.padXSet(P.unison ?? 0, P.wave ?? 0, t);
    if (P.pad > 0) {
      const sweep = 1 + 0.25 * Math.sin(this.padLfo * 0.21);
      const bloom = 1 + swell * 0.8;
      const f = pd.band
        ? (pd.band + this.energy * pd.band * 0.8 + Math.sin(this.padLfo * 0.37) * pd.band * 0.28) * bloom
        : (400 + this.energy * 1800 + F.spread * 400) * pd.cut * sweep * bloom * (0.75 + 0.6 * F.speed);
      this.padFilter.frequency.setTargetAtTime(Math.min(16000, f * 2 ** ((P.padTone ?? 0) * 1.6)), t, 0.5);
      this.padSubGain.gain.setTargetAtTime(pd.sub * 0.22, t, 0.5);
      this.padAirGain.gain.setTargetAtTime(pd.air * 0.05 * (0.6 + this.energy) * (1 + swell), t, 0.5);
      // Drift and sway, a few times a second (cheap): each oscillator wanders
      // a few cents, each pair leans left and right slowly.
      this.padTick += F.dt;
      if (this.padTick > 0.12) {
        const dt = this.padTick;
        this.padTick = 0;
        for (let k = 0; k < 8; k++) {
          let dr = this.padDrift[k] + (Math.random() - 0.5) * pd.drift * dt * 2.2;
          dr *= 1 - Math.min(0.5, dt * 0.35);
          dr = Math.max(-pd.drift, Math.min(pd.drift, dr));
          this.padDrift[k] = dr;
          const side = k % 2 ? 1 : -1;
          this.padOsc[k].detune.setTargetAtTime(side * pd.spread * 0.5 + dr, t, 0.25);
          const slot = k >> 1;
          const sway = 0.75 + 0.25 * Math.sin(this.padLfo * 0.13 + slot * 1.7);
          const centre = (slot - 1.5) * 0.18;
          // A spread-out crowd opens the pad wide; a huddle narrows it.
          const wide = pd.width * (0.55 + 0.9 * F.spread) * (P.padWidth ?? 0.5) * 2 * (1 + 0.4 * this.polAmt);
          this.padPan[k].pan.setTargetAtTime(Math.max(-1, Math.min(1, centre + side * wide * 0.5 * sway)), t, 0.4);
        }
      }
    }
    // Lo-fi crackle: the odd dusty click.
    if (P.lofi > 0 && Math.random() < F.dt * P.lofi * 2.5) this.grain(Math.random() * w, h * 0.05, w, h, P.lofi * 0.25, 1, 0.002, 0.05);

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
      // The build's snare roll: quarters, then eighths, sixteenths, and a
      // last flurry of thirty-seconds, rising in loudness.
      const bu = this.buildU;
      if (bu >= 0 && P.drums > 0 && this.audible('drums')) {
        const every = bu < 0.25 ? 4 : bu < 0.5 ? 2 : 1;
        if (s % every === 0) {
          const sd = 60 / bpm / 4;
          const v = (0.25 + 0.6 * bu) * P.drums;
          this.cur = 'drums';
          this.snare(v, 0);
          if (bu > 0.85) this.snare(v * 0.8, sd / 2);
        }
      }
      const stepDur = 60 / bpm / 4;
      const sw = s % 2 ? P.swing * 0.5 * stepDur : 0;
      // Humanise: how loose it plays (a lively field loosens it), a little
      // late now and then, and stronger on the beat than off it.
      const hum = P.human ?? 0;
      const loose = hum * Math.min(1, 0.45 + this.energy * 1.1);
      const late = (most: number) => (loose > 0 ? Math.random() * most * loose : 0);
      const accent = hum > 0 ? 1 - hum * 0.9 * (s % 4 === 0 ? 0 : s % 2 === 0 ? 0.12 : 0.26) : 1;
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
        if (s % 2 === 0 && !onKick && P.seqTick !== false && this.audible('steps')) this.grain(x0, h * 0.15, w, h, P.seq * (s % 4 === 0 ? 0.35 : 0.18), 0.9, 0.012, 0.1);
        let played = 0;
        const every = P.seqRate ?? 1;
        if (tot && s % every === 0 && gate()) {
          const dyn = 1 + P.dyn * (0.4 + this.energy * 1.4 - 1);
          const most = P.seqNotes || (busyK > 1.7 ? 3 : busyK < 0.6 ? 1 : 2);
          // Sensitivity: up, a thinner crowd still plays; down, only the thickest.
          const thr = ((mean * 1.8) / Math.sqrt(busyK)) * Math.pow(4, 0.5 - (P.seqSens ?? 0.5));
          const voice = P.seqSound && P.seqSound !== 'same' ? P.seqSound : this.voiceFor(0);
          // The crowded rows, low notes first (row 0 is the top, the highest note).
          const rows: number[] = [];
          for (let r = ROWS - 1; r >= 0; r--) if (this.grid[r] >= thr && this.grid[r] >= 2) rows.push(r);
          const style = P.seqStyle ?? 'chord';
          const V = P.seqVary ?? 0;
          // Chord and strum: the thickest crowds; arpeggios: one row a step, in turn.
          let pickRows: number[];
          if (style === 'chord' || style === 'strum') pickRows = [...rows].sort((a, b) => this.grid[b] - this.grid[a]).slice(0, most).sort((a, b) => b - a);
          else if (!rows.length) pickRows = [];
          else if (style === 'random') pickRows = [rows[(Math.random() * rows.length) | 0]];
          else {
            const n = rows.length;
            let i = this.arpI++;
            if (style === 'down') i = n - 1 - (i % n);
            else if (style === 'bounce' && n > 1) {
              const p = i % (2 * n - 2);
              i = p < n ? p : 2 * n - 2 - p;
            } else i %= n;
            pickRows = [rows[i]];
          }
          // Vary: now and then a step rests, a note jumps an octave, or repeats quickly.
          if (V > 0 && s % 4 !== 0 && Math.random() < V * 0.18) pickRows = [];
          // Humanise: now and then the chord is inverted (its lowest note goes up an octave).
          const inv = loose > 0 && (style === 'chord' || style === 'strum') && pickRows.length > 1 && Math.random() < loose * 0.5;
          pickRows.forEach((r, k) => {
            let deg = this.toChord(Math.round((1 - (r + 0.5) / ROWS) * (this.L * this.p.range * 0.85)));
            if (V > 0 && Math.random() < V * 0.2) deg += Math.random() < 0.6 ? this.L : -this.L;
            if (inv && k === 0) deg += this.L;
            let vel = P.seq * Math.min(1, this.grid[r] / (mean * 4)) * (s % 4 === 0 ? 1 : 0.7) * room * dyn;
            if (V > 0) vel *= 1 + (Math.random() - 0.5) * V * 0.9;
            vel *= accent;
            const at = sw + (style === 'strum' ? k * 0.035 : 0) + late(0.016);
            const pan = (s / STEPS) * 1.6 - 0.8;
            this.note(deg, vel, pan, voice, at);
            if (V > 0 && Math.random() < V * 0.15) this.note(deg, vel * 0.6, pan, voice, at + (stepDur * every) / 2);
            played++;
          });
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
      // A beat from the library, when one is picked.
      const tick = Math.floor(this.beat * 4);
      const B = this.beatOf(P, tick, s);
      // Bass: the beat's own line (or the field's), then shaped by the Bass
      // settings: a pattern, movement, a walk into the next chord, ghosts.
      let bq: { deg: number; vel: number; len: number; slide: boolean; up: number } | null = null;
      const pat = P.bassPattern ?? 'beat';
      if (pat === 'beat') {
        // Bass: the beat's bass row, when it has one.
        if (P.bass > 0 && B?.beat.b) {
          const row = B.beat.b;
          const i = tick % row.length;
          let deg = -999, vel = 0.8, slide = false;
          switch (row[i]) {
            case 'B': (deg = this.chordRoot()), (vel = 1); break;
            case 'b': deg = this.chordRoot(); break;
            case 'o': (deg = this.chordRoot()), (vel = 0.45); break;
            case 'f': deg = this.chordTone(2); break;
            case 't': deg = this.chordTone(1); break;
            case 'u': deg = this.chordTone(3); break;
            case '~': (deg = this.chordRoot()), (vel = 0.85), (slide = true); break;
            case '?': if (Math.random() < 0.5) (deg = this.chordRoot()), (vel = 0.6); break;
          }
          if (deg > -999 && i > 0 && (vel < 0.5 && Math.random() < P.vary * 0.6 || vel < P.follow * Math.max(0, 0.7 - e * 1.6))) deg = -999;
          let gap = 1;
          while (gap < row.length && row[(i + gap) % row.length] === '.') gap++;
          let len = stepDur * Math.min(gap, P.bassSound === '808' ? 12 : 8) * 0.92;
          const play = ed(3, deg > -999);
          if (play && deg === -999) (deg = this.chordRoot()), (vel = 0.7), (len = stepDur * 1.5);
          if (play) bq = { deg, vel, len: len * P.length, slide, up: 0 };
        } else if (P.bass > 0) {
          // Bass: the chord's root, low. Calm fields hold one long note a bar;
          // busier ones walk root and fifth, then eighths with pickups.
          let deg = -999, len = stepDur * 2;
          if (e > 0.03) {
            if (s === 0) (deg = this.chordRoot()), (len = e < 0.15 ? stepDur * 14 : stepDur * 3.5);
            else if (e >= 0.15 && s === 8) (deg = e < 0.4 ? this.chordTone(2) : this.chordRoot()), (len = stepDur * 3);
            else if (e >= 0.4 && (s === 4 || s === 12)) (deg = s === 12 ? this.chordTone(3) : this.chordRoot()), (len = stepDur * 1.6);
            else if (e >= 0.65 && s % 4 === 2) (deg = this.chordTone(s === 14 ? 1 : 0)), (len = stepDur * 0.9);
          }
          const play = ed(3, deg > -999);
          if (play && deg === -999) (deg = this.chordRoot()), (len = stepDur * 1.5);
          if (play) bq = { deg, vel: s % 8 === 0 ? 1 : 0.8, len: len * P.length * this.lenK, slide: false, up: 0 };
        }
      }
      if (P.bass > 0) bq = this.bassShape(bq, pat, s, e, stepDur, ed);
      if (bq) {
        this.gridNow[48 + s] = 1;
        this.bassNote(bq.deg, P.bass * (fit ? 0.5 : 1) * bq.vel * accent, bq.len * (P.bassLen ?? 1), sw + late(0.008), bq.slide, bq.up);
      }

      this.stepNow = s;
      if (P.drums > 0 && B) this.beatDrums(P, B, tick, s, sw, stepDur, P.drums * (fit ? 0.4 : 1), e, onKick, ed);
      // Drums: the beat comes from the field. Particles low in this column
      // add kicks, in the middle snares, high up hi-hats; busier plays more.
      else if (P.drums > 0) {
        const k = P.drums * (fit ? 0.4 : 1);
        const m2 = Math.max(1, mean * 2);
        const low = this.grid[6] + this.grid[7], mid = this.grid[3] + this.grid[4], top = this.grid[0] + this.grid[1];
        const live = e > 0.03;
        const de = drumE(e);
        // Song mode: the section's beat move (half-time plays every other step at half speed).
        const mv = this.secMove?.beat ?? 'full';
        const odd = mv === 'half' && tick % 2 === 1;
        const q = mv === 'half' ? (tick >> 1) % 16 : s;
        let kick = ed(0, live && !onKick && !odd && (q === 0 || (q === 8 && de > 0.12) || (q % 2 === 0 && de > 0.25 && low > m2 * 1.6)));
        let snare = ed(1, live && !odd && (q === 4 || q === 12) && (de > 0.18 || mid > m2 * 1.2));
        let hat = ed(2, live && !odd && (q % 2 === 0 ? de > 0.08 || top > m2 : de > 0.45 && top > m2 * 0.8));
        if (mv === 'sparse') (kick &&= s % 8 === 0), (snare &&= s === 12), (hat &&= s % 4 === 2);
        else if (mv === 'hats') (kick = snare = false), (hat ||= live && s % 4 === 2);
        else if (mv === 'busy') (hat ||= live), (kick ||= live && s === 14 && Math.random() < 0.5);
        if (kick) (this.gridNow[s] = 1), this.kick(k * (s === 0 ? 1 : 0.8), sw);
        if (snare) (this.gridNow[16 + s] = 1), this.snare(k * (0.6 + Math.min(0.4, mid / (m2 * 4))), sw + late(0.012));
        if (hat) (this.gridNow[32 + s] = 1), this.hat(k * accent * (s % 4 === 0 ? 0.5 : 0.32) * (0.6 + e * 0.6), sw + late(0.012), s === 14 && e > 0.5);
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
        this.note(this.degAt(y, h), P.hits * (0.45 + 0.55 * v) * room, (x / w) * 1.6 - 0.8, P.hitSound && P.hitSound !== 'same' ? P.hitSound : this.voiceFor(tn));
        budget--;
      }
    }

    // Grains: a rate that grows with how busy the field is, capped.
    if (P.grain > 0 && F.n > 0) {
      const rateK = Math.pow(16, (P.grainRate ?? 0.5) - 0.5);
      this.grainDebt += F.dt * P.grain * (15 + F.speed * 140) * room * rateK;
      let g = Math.min(rateK > 1.5 ? 16 : 8, Math.floor(this.grainDebt));
      this.grainDebt -= g;
      while (g-- > 0) {
        const i = (Math.random() * F.n) | 0;
        if (F.dead && F.dead[i]) continue;
        this.levels[LI.grains] = Math.max(this.levels[LI.grains], P.grain * 0.6);
        if (this.audible('grains')) this.grainOf(F.px[i], F.py[i], w, h, P.grain, F.speed);
      }
    } else this.grainDebt = 0;

    // Scanline: one sweep per bar (or every Sweep time seconds), playing a
    // few of the particles it passes.
    this.cur = 'scan';
    if (P.scan > 0 && F.n > 0) {
      const secs = P.music === 'along' && F.musicOn && F.bpm > 40 ? (4 * 60) / F.bpm : P.scanSecs;
      const dir = P.scanDir ?? 'across';
      // Back and forth takes two sweeps' time for the round trip.
      const posOf = (ph: number) => (dir === 'bounce' ? (ph < 0.5 ? ph * 2 : 2 - ph * 2) : ph);
      const before = this.scanX;
      this.scanX += F.dt / (dir === 'bounce' ? secs * 2 : secs);
      let wrapped = this.scanX >= 1;
      if (wrapped) this.scanX -= 1;
      let a = posOf(before), b = (this.scanPos = posOf(this.scanX));
      if (dir === 'bounce') {
        wrapped = false;
        if (a > b) [a, b] = [b, a];
      }
      // Where each particle is along the sweep, 0..1, and the note it gets.
      const cx = w / 2, cy = h / 2, far = Math.hypot(cx, cy);
      const along = (i: number) => (dir === 'down' ? F.py[i] / h : dir === 'radar' ? (Math.atan2(F.py[i] - cy, F.px[i] - cx) / (Math.PI * 2) + 1.25) % 1 : F.px[i] / w);
      // Across: height sets the note. Down: left low, right high. Radar: nearer the middle, higher.
      const pitchY = (i: number) => (dir === 'down' ? h - (F.px[i] / w) * h : dir === 'radar' ? (Math.hypot(F.px[i] - cx, F.py[i] - cy) / far) * h : F.py[i]);
      const voiceOf = (i: number) => (P.scanSound && P.scanSound !== 'same' ? P.scanSound : this.voiceFor(F.tone[i] ?? 0.5));
      const most = P.scanNotes ?? 4;
      const seen = new Set<number>();
      let found = 0;
      const step = Math.max(1, Math.floor(F.n / 3000));
      for (let i = (Math.random() * step) | 0; i < F.n && found < most; i += step) {
        if (F.dead && F.dead[i]) continue;
        const x = F.px[i];
        const u = along(i);
        if (wrapped ? u >= a || u < b : u >= a && u < b) {
          const d = this.degAt(pitchY(i), h);
          if (seen.has(d)) continue;
          seen.add(d);
          found++;
          if (gate()) {
            const mv = F.px[i] - F.ox[i];
            const vrel = Math.abs(mv) / Math.max(1e-3, this.moveAvg);
            this.note(d, P.scan * 0.45 * this.dynOf(vrel) * Math.min(1, Math.sqrt(4 / Math.max(1, most))), (x / w) * 1.6 - 0.8, voiceOf(i), 0, { z: F.pz[i], bend: this.bendOf(vrel, mv >= 0 ? 1 : -1) });
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
