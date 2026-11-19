// Genre recipes: the rules a genre's songs follow, so a new song can be
// rolled inside them. A roll starts from one of the genre's written beats or
// versions (the anchor, so it always sounds like the genre) and then picks
// the rest: tempo, swing, kit, bass, lead, pad, scale, chords, effects, and
// a few edits to the beat. Rolls are seeded, so a song is a name and a number
// and the same seed always gives the same song.

import type { DrumKit } from './drums.ts';
import type { BassSound, PadSound } from './sound.ts';
import type { Settings } from './settings.ts';

type R = [number, number];
type Timbre = Settings['sndTimbre'];
type Scale = Settings['sndScale'];

export interface Recipe {
  bpm: R;
  swing: R;
  kits?: DrumKit[];
  bass?: BassSound[];
  bassPat?: Settings['sndBassPattern'][];
  lead: Timbre[];
  pad: PadSound[];
  scales: Scale[];
  /** Chords: a named progression (calm, pop…) or scale degrees ('6 4 1 5'). */
  chords: string[];
  chordBars: number[];
  /** Effects, each a range (left out: as the anchor has it). */
  fx?: Partial<Record<'sndReverb' | 'sndEcho' | 'sndChorus' | 'sndDrive' | 'sndLofi' | 'sndSweep' | 'sndBright' | 'sndArp' | 'sndGlue', R>>;
  /** Beat edits: steps an extra kick may land on, how the hats may change, steps the bass may push. */
  kickAdd?: number[];
  hats?: ('keep' | '8ths' | '16ths' | 'offbeat' | 'sparse')[];
  bassAdd?: number[];
}

const MINOR_POP = ['6 4 1 5', '1 6 3 7', '1 7 6 7', '6 5 4 5', '1 4 6 5'];
const DARK = ['1 6', '1 7', '1 1 6 6', '1 4', '1 6 4 7', 'mystic', 'still'];
const SOUL = ['2 5 1 4', '2 5 1 6', '1 6 2 5', '4 3 2 1', '1 4 3 6'];

export const RECIPES: Record<string, Recipe> = {
  ambient: { bpm: [56, 76], swing: [0, 0], lead: ['bell', 'glass', 'harp', 'musicbox', 'rain', 'fairy', 'breeze'], pad: ['choir', 'air', 'shimmer', 'glass', 'ice', 'velvet', 'bowed', 'mist', 'vox'], scales: ['pentatonic', 'major', 'minor', 'whole', 'dorian'], chords: ['still', 'drift', 'mystic', 'calm', '1 4', '1 6 4 5'], chordBars: [4, 8], fx: { sndReverb: [0.6, 1], sndEcho: [0.2, 0.6], sndChorus: [0.2, 0.5] } },
  world: { bpm: [66, 116], swing: [0, 0.3], lead: ['koto', 'flute', 'kalimba', 'steel', 'world', 'marimba', 'temple', 'sitar', 'nylon'], pad: ['choir', 'reed', 'hollow', 'soft', 'warm', 'drone', 'harmonium'], scales: ['pentatonic', 'japanese', 'dorian', 'major'], chords: ['still', 'calm', 'drift', '1 4', '1 7 6 7'], chordBars: [2, 4], fx: { sndReverb: [0.3, 0.7], sndEcho: [0, 0.3] } },
  band: { bpm: [72, 112], swing: [0.2, 0.6], lead: ['epiano', 'vibes', 'lounge', 'pluck', 'guitar', 'nylon', 'strings', 'piano', 'clav', 'organ'], pad: ['organ', 'warm', 'soft', 'reed'], scales: ['dorian', 'major', 'blues'], chords: [...SOUL, 'pop', '1 4 1 5 6 4 1 5'], chordBars: [1, 2], fx: { sndReverb: [0.25, 0.5], sndChorus: [0.1, 0.35] } },
  synth: { bpm: [96, 140], swing: [0, 0.1], lead: ['synth', 'retro', 'pluck', 'bell', 'chip', 'clav'], pad: ['pwm', 'strings', 'tape', 'dark', 'brass'], scales: ['minor', 'major', 'dorian'], chords: [...MINOR_POP, 'drift', 'pop'], chordBars: [1, 2, 4], fx: { sndReverb: [0.2, 0.5], sndChorus: [0.2, 0.6], sndSweep: [0.2, 0.7], sndArp: [0.3, 1] } },
  lofi: { bpm: [70, 88], swing: [0.35, 0.6], kits: ['lofi', 'brush', 'soft'], bass: ['round', 'upright', 'fingered'], bassPat: ['beat', 'hold', 'walk'], lead: ['epiano', 'vibes', 'pluck', 'kalimba', 'musicbox', 'nylon', 'guitar'], pad: ['tape', 'warm', 'soft', 'strings', 'velvet'], scales: ['dorian', 'major', 'minor'], chords: SOUL, chordBars: [1, 2], fx: { sndLofi: [0.3, 0.7], sndBright: [-0.5, -0.15], sndChorus: [0.15, 0.4], sndReverb: [0.25, 0.45] }, kickAdd: [7, 9, 11, 14], hats: ['keep', '8ths', 'sparse'], bassAdd: [7, 14] },
  house: { bpm: [118, 126], swing: [0.05, 0.25], kits: ['909', 'punchy'], bass: ['house', 'round', 'synth', 'fm', 'moog'], bassPat: ['beat', 'offbeat', 'pump'], lead: ['epiano', 'pluck', 'synth', 'vibes', 'steel', 'piano', 'organ'], pad: ['organ', 'strings', 'warm', 'brass', 'pwm'], scales: ['minor', 'dorian', 'major'], chords: [...MINOR_POP, ...SOUL, '1 1 6 6'], chordBars: [1, 2], fx: { sndReverb: [0.2, 0.4], sndSweep: [0.1, 0.6], sndChorus: [0, 0.3] }, hats: ['keep', 'offbeat', '16ths'], bassAdd: [3, 7, 11, 15] },
  techno: { bpm: [124, 138], swing: [0, 0.05], kits: ['techno', 'punchy', '909', 'minimal'], bass: ['moog', 'sub', 'acid', 'pulse', 'reese'], bassPat: ['beat', 'offbeat', 'pump'], lead: ['synth', 'pluck', 'bell', 'glass', 'acid'], pad: ['dark', 'pwm', 'hollow', 'air'], scales: ['minor', 'dorian', 'whole'], chords: DARK, chordBars: [4, 8], fx: { sndReverb: [0.2, 0.45], sndEcho: [0.2, 0.55], sndSweep: [0.3, 0.9], sndDrive: [0, 0.4] }, kickAdd: [14, 15], hats: ['keep', 'offbeat', '16ths'], bassAdd: [2, 6, 10, 14] },
  dub: { bpm: [68, 124], swing: [0.1, 0.4], kits: ['dub', 'soft', '808'], bass: ['round', 'sub'], bassPat: ['beat', 'hold'], lead: ['epiano', 'pluck', 'bell', 'glass'], pad: ['organ', 'soft', 'shimmer', 'dark'], scales: ['minor', 'dorian', 'major'], chords: ['1 7', '1 1 6 6', '1 4 5 4', '1 4', 'still', '1 6'], chordBars: [2, 4], fx: { sndEcho: [0.45, 0.85], sndReverb: [0.35, 0.6], sndSweep: [0.2, 0.6] }, hats: ['keep', 'sparse', 'offbeat'], bassAdd: [3, 6, 11] },
  dubstep: { bpm: [138, 142], swing: [0, 0], kits: ['punchy', 'trap', 'hard'], bass: ['wobble', 'reese', 'sub', 'fuzz'], lead: ['glass', 'bell', 'synth'], pad: ['dark', 'strings', 'choir', 'ice'], scales: ['minor', 'whole'], chords: DARK, chordBars: [2, 4], fx: { sndReverb: [0.3, 0.55], sndSweep: [0.4, 0.9], sndDrive: [0.1, 0.4] }, kickAdd: [3, 6, 14], hats: ['keep', 'sparse', '8ths'], bassAdd: [3, 7, 13] },
  rap: { bpm: [82, 96], swing: [0.3, 0.55], kits: ['lofi', 'punchy', 'soft'], bass: ['fingered', 'round', 'upright', '808'], lead: ['epiano', 'vibes', 'pluck', 'flute', 'bell'], pad: ['strings', 'warm', 'tape', 'brass', 'ooh'], scales: ['dorian', 'minor', 'blues'], chords: ['1 4', '1 6', '2 5', ...SOUL], chordBars: [1, 2], fx: { sndLofi: [0.15, 0.5], sndBright: [-0.35, 0] }, kickAdd: [3, 7, 9, 10, 14], hats: ['keep', '8ths', 'sparse'], bassAdd: [7, 9, 14] },
  trap: { bpm: [130, 150], swing: [0, 0], kits: ['trap', '808'], bass: ['808', 'sub'], lead: ['bell', 'glass', 'pluck', 'flute', 'musicbox'], pad: ['strings', 'choir', 'dark', 'ice', 'ooh'], scales: ['minor', 'pentatonic', 'japanese'], chords: DARK, chordBars: [2, 4], fx: { sndReverb: [0.3, 0.55], sndEcho: [0.1, 0.35], sndDrive: [0.05, 0.3] }, kickAdd: [3, 6, 7, 11, 14], hats: ['16ths', '8ths', 'keep'], bassAdd: [3, 6, 11, 14] },
  drill: { bpm: [138, 146], swing: [0, 0.05], kits: ['trap', '808'], bass: ['808', 'sub', 'reese'], bassPat: ['beat', 'hold'], lead: ['bell', 'glass', 'pluck', 'flute'], pad: ['strings', 'choir', 'dark', 'cello', 'bowed'], scales: ['minor', 'japanese'], chords: ['1 6', '1 7', '1 6 4 7', 'mystic', '1 2 1 7'], chordBars: [2, 4], fx: { sndReverb: [0.3, 0.6], sndDrive: [0.05, 0.25] }, kickAdd: [6, 9, 13], hats: ['keep', '8ths'], bassAdd: [3, 9, 13] },
  dnb: { bpm: [168, 176], swing: [0, 0.05], kits: ['jungle', 'punchy'], bass: ['reese', 'sub', 'moog', 'wobble'], lead: ['bell', 'glass', 'synth', 'pluck', 'flute'], pad: ['strings', 'air', 'dark', 'shimmer', 'choir'], scales: ['minor', 'dorian'], chords: [...DARK, ...MINOR_POP], chordBars: [2, 4], fx: { sndReverb: [0.3, 0.55], sndSweep: [0.2, 0.7], sndDrive: [0, 0.3] }, kickAdd: [7, 13, 15], hats: ['keep', '8ths', '16ths'], bassAdd: [7, 13] },
  dancehall: { bpm: [90, 104], swing: [0, 0.15], kits: ['808', 'punchy'], bass: ['sub', '808', 'round'], lead: ['steel', 'pluck', 'synth', 'marimba'], pad: ['organ', 'strings', 'brass'], scales: ['minor', 'major', 'dorian'], chords: ['1 6 4 5', '1 4', '6 4 1 5', '1 7 6 7'], chordBars: [1, 2], fx: { sndReverb: [0.2, 0.4], sndEcho: [0.1, 0.3] }, hats: ['keep', '8ths', '16ths'], bassAdd: [3, 7, 11] },
  afro: { bpm: [98, 116], swing: [0.05, 0.25], kits: ['linn', 'hand', 'punchy'], bass: ['round', 'fingered', 'slap', 'sub'], lead: ['marimba', 'kalimba', 'steel', 'pluck', 'epiano', 'flute', 'guitar', 'nylon', 'xylo'], pad: ['organ', 'warm', 'brass', 'reed', 'ooh'], scales: ['major', 'dorian', 'pentatonic', 'minor'], chords: ['1 4', '2 5 1 6', '1 4 5 4', '6 4 1 5', '1 5 6 4'], chordBars: [1, 2], fx: { sndReverb: [0.2, 0.4], sndChorus: [0, 0.3] }, kickAdd: [6, 10, 14], hats: ['keep', '8ths', '16ths'], bassAdd: [3, 6, 10] },
  breaks: { bpm: [92, 112], swing: [0.1, 0.3], kits: ['linn', 'jungle', 'punchy'], bass: ['slap', 'fingered', 'picked', 'moog'], lead: ['epiano', 'synth', 'vibes', 'pluck'], pad: ['organ', 'brass', 'strings', 'warm'], scales: ['dorian', 'blues', 'minor'], chords: ['1 4', '1 7', ...SOUL], chordBars: [1, 2], fx: { sndDrive: [0.1, 0.5], sndReverb: [0.2, 0.35] }, kickAdd: [3, 7, 10, 11], hats: ['keep', '8ths', '16ths'], bassAdd: [3, 7, 10, 14] },
  idm: { bpm: [90, 130], swing: [0, 0.2], kits: ['glitch', 'minimal'], bass: ['fm', 'pulse', 'sub', 'acid'], lead: ['marimba', 'glass', 'bell', 'pluck', 'kalimba', 'musicbox', 'xylo', 'bubble', 'chip'], pad: ['glass', 'ice', 'air', 'hollow', 'tape'], scales: ['whole', 'pentatonic', 'dorian', 'minor', 'japanese'], chords: ['drift', 'mystic', 'still', '1 2', '1 6 2 7'], chordBars: [2, 4, 8], fx: { sndEcho: [0.2, 0.6], sndReverb: [0.3, 0.6], sndLofi: [0, 0.4] }, kickAdd: [2, 5, 9, 11, 13], hats: ['keep', '16ths', 'sparse'], bassAdd: [1, 5, 9, 12] },
  trance: { bpm: [134, 142], swing: [0, 0], kits: ['techno', 'punchy', '909'], bass: ['synth', 'pulse', 'moog', 'sub'], bassPat: ['offbeat', 'beat', 'pump'], lead: ['synth', 'pluck', 'bell', 'glass'], pad: ['strings', 'pwm', 'choir', 'air', 'shimmer', 'supersaw', 'analog'], scales: ['minor', 'major'], chords: [...MINOR_POP, '6 4 5 3'], chordBars: [2, 4], fx: { sndReverb: [0.4, 0.7], sndArp: [0.4, 1], sndSweep: [0.4, 0.9], sndEcho: [0.2, 0.45] }, hats: ['offbeat', 'keep', '16ths'] },
  triphop: { bpm: [76, 92], swing: [0.15, 0.35], kits: ['lofi', 'soft', 'linn'], bass: ['round', 'sub', 'upright'], lead: ['epiano', 'bell', 'glass', 'vibes', 'flute'], pad: ['strings', 'tape', 'dark', 'cello', 'velvet'], scales: ['minor', 'dorian', 'blues'], chords: ['1 6', '1 4', 'mystic', '1 7 6 7', '6 4 1 5'], chordBars: [2, 4], fx: { sndLofi: [0.2, 0.5], sndReverb: [0.4, 0.7], sndEcho: [0.15, 0.4], sndBright: [-0.4, -0.1] }, kickAdd: [3, 7, 10, 14], hats: ['keep', '8ths', 'sparse'], bassAdd: [7, 10] },
  phonk: { bpm: [124, 140], swing: [0, 0.1], kits: ['808', 'trap'], bass: ['808', 'fuzz', 'sub'], lead: ['bell', 'musicbox', 'synth', 'retro'], pad: ['dark', 'choir', 'ooh', 'tape'], scales: ['minor', 'blues', 'japanese'], chords: ['1 6', '1 7', '1 4', 'mystic'], chordBars: [2, 4], fx: { sndDrive: [0.2, 0.55], sndLofi: [0.2, 0.55], sndReverb: [0.2, 0.45] }, kickAdd: [3, 7, 11, 14], hats: ['keep', '16ths', '8ths'], bassAdd: [3, 7, 11] },
  jersey: { bpm: [136, 144], swing: [0, 0], kits: ['trap', '808', 'punchy'], bass: ['808', 'sub'], lead: ['bell', 'pluck', 'synth', 'steel'], pad: ['strings', 'ooh', 'choir', 'pwm'], scales: ['minor', 'major', 'pentatonic'], chords: ['6 4 1 5', '1 6', '1 4', '1 7 6 7'], chordBars: [1, 2], fx: { sndReverb: [0.2, 0.4] }, hats: ['keep', '8ths', 'sparse'], bassAdd: [3, 10, 14] },
  synthwave: { bpm: [86, 112], swing: [0, 0], kits: ['linn', '808', 'punchy'], bass: ['synth', 'pulse', 'moog', 'fm'], bassPat: ['beat', 'arp', 'pump'], lead: ['synth', 'retro', 'pluck', 'bell'], pad: ['strings', 'pwm', 'brass', 'tape', 'velvet', 'analog', 'supersaw'], scales: ['minor', 'major', 'dorian'], chords: [...MINOR_POP, 'drift'], chordBars: [1, 2], fx: { sndChorus: [0.4, 0.8], sndReverb: [0.35, 0.6], sndArp: [0.4, 1], sndSweep: [0.2, 0.6] }, hats: ['keep', '8ths', '16ths'] },
  jazz: { bpm: [96, 176], swing: [0.45, 0.7], kits: ['brush', 'soft'], bass: ['upright', 'round', 'fingered'], bassPat: ['walk', 'beat'], lead: ['vibes', 'epiano', 'lounge', 'pluck'], pad: ['organ', 'warm', 'reed', 'soft'], scales: ['dorian', 'blues', 'major'], chords: [...SOUL, '1 6 2 5', '3 6 2 5'], chordBars: [1, 2], fx: { sndReverb: [0.25, 0.45], sndChorus: [0, 0.2] }, hats: ['keep', 'sparse'] },
  garage: { bpm: [128, 136], swing: [0.2, 0.4], kits: ['909', 'punchy'], bass: ['synth', 'sub', 'reese', 'house', 'fm'], lead: ['epiano', 'pluck', 'vibes', 'synth', 'bell'], pad: ['organ', 'strings', 'ooh', 'warm'], scales: ['minor', 'dorian'], chords: [...SOUL, '6 4 1 5', '1 1 6 6'], chordBars: [1, 2], fx: { sndReverb: [0.2, 0.45], sndChorus: [0.1, 0.35] }, kickAdd: [6, 11, 14], hats: ['keep', '16ths', 'offbeat'], bassAdd: [3, 6, 11, 14] },
  disco: { bpm: [112, 124], swing: [0.05, 0.15], kits: ['linn', '909', 'punchy'], bass: ['fingered', 'slap', 'picked', 'synth'], bassPat: ['beat', 'offbeat'], lead: ['epiano', 'vibes', 'synth', 'steel', 'pluck'], pad: ['strings', 'brass', 'organ', 'ooh'], scales: ['minor', 'major', 'dorian'], chords: ['1 4', '2 5', '6 4 1 5', '1 6 2 5', '4 3 2 1'], chordBars: [1, 2], fx: { sndReverb: [0.25, 0.45], sndChorus: [0.1, 0.4] }, hats: ['keep', '16ths', 'offbeat'], bassAdd: [3, 7, 11, 15] },
  hyperpop: { bpm: [150, 170], swing: [0, 0], kits: ['glitch', 'trap', '808'], bass: ['808', 'fuzz', 'pulse'], lead: ['synth', 'musicbox', 'bell', 'retro', 'fairy'], pad: ['pwm', 'ice', 'shimmer', 'ooh'], scales: ['major', 'pentatonic', 'minor'], chords: ['1 5 6 4', '4 5 6 1', '6 4 1 5', 'pop'], chordBars: [1, 2], fx: { sndDrive: [0.2, 0.55], sndBright: [0.1, 0.45], sndChorus: [0.2, 0.6], sndLofi: [0, 0.4] }, kickAdd: [3, 6, 10, 13], hats: ['16ths', 'keep', '8ths'], bassAdd: [3, 6, 10] },
  baile: { bpm: [126, 134], swing: [0, 0.05], kits: ['808', 'trap', 'punchy'], bass: ['808', 'sub'], lead: ['steel', 'pluck', 'synth', 'flute', 'marimba'], pad: ['brass', 'organ', 'ooh'], scales: ['minor', 'major'], chords: ['1 4', '1 6', '1 7 6 7', '6 4 1 5'], chordBars: [1, 2], fx: { sndDrive: [0.1, 0.4], sndReverb: [0.15, 0.35] }, kickAdd: [3, 6, 10, 14], hats: ['keep', 'sparse'], bassAdd: [3, 10] },
  psy: { bpm: [140, 150], swing: [0, 0.04], kits: ['techno', 'punchy', '909', 'glitch'], bass: ['pulse', 'acid', 'moog', 'sub', 'fm'], bassPat: ['beat'], lead: ['synth', 'pluck', 'glass', 'bell', 'retro', 'acid'], pad: ['dark', 'hollow', 'pwm', 'air', 'choir', 'cosmic'], scales: ['minor', 'japanese', 'whole', 'dorian'], chords: ['still', '1 2', '1 7', 'mystic', '1 6', '1 2 1 7'], chordBars: [4, 8], fx: { sndSweep: [0.5, 1], sndEcho: [0.3, 0.65], sndReverb: [0.3, 0.6], sndArp: [0.4, 1], sndDrive: [0, 0.35] }, hats: ['keep', 'offbeat', '16ths'] },
  gqom: { bpm: [120, 128], swing: [0, 0.05], kits: ['techno', 'hard', 'minimal'], bass: ['sub', 'reese', 'pulse'], lead: ['bell', 'marimba', 'glass', 'pluck'], pad: ['dark', 'hollow', 'choir', 'air'], scales: ['minor', 'japanese', 'whole'], chords: ['still', '1 6', '1 2', 'mystic'], chordBars: [4, 8], fx: { sndReverb: [0.35, 0.65], sndEcho: [0.2, 0.5] }, kickAdd: [3, 6, 10, 13], hats: ['keep', 'sparse', 'offbeat'], bassAdd: [3, 10, 13] },
};

// A small seeded random: the same seed, the same song.
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJ = ['Velvet', 'Neon', 'Quiet', 'Golden', 'Broken', 'Midnight', 'Paper', 'Glass', 'Hollow', 'Lunar', 'Electric', 'Slow', 'Silver', 'Copper', 'Faded', 'Wild', 'Hidden', 'Northern', 'Salt', 'Amber', 'Static', 'Soft', 'Distant', 'Rusty', 'Cosmic', 'Lazy', 'Frozen', 'Burning', 'Secret', 'Pale'];
const NOUN = ['Harbour', 'Garden', 'Signal', 'Avenue', 'Tide', 'Engine', 'Mirror', 'Orbit', 'Lantern', 'Canyon', 'Ritual', 'Fever', 'Window', 'Comet', 'River', 'Satellite', 'Alley', 'Bloom', 'Station', 'Echo', 'Desert', 'Circuit', 'Rooftop', 'Ghost', 'Island', 'Machine', 'Prism', 'Shadow', 'Weather', 'Dancer'];

/** A song's name from its seed: two words, like "Velvet Harbour". */
export function songName(seed: number) {
  const r = seeded(seed ^ 0x9e3779b9);
  return `${ADJ[(r() * ADJ.length) | 0]} ${NOUN[(r() * NOUN.length) | 0]}`;
}

/** A fresh seed. */
export const newSeed = () => (Math.random() * 1e9) | 0;

/**
 * Roll a song inside a recipe. anchor: the genre's written beats and versions
 * to start from; base(v) gives that anchor's settings. Returns the anchor and
 * the settings the recipe picks on top of it.
 */
export function rollSong(rc: Recipe, seed: number, anchors: string[], base: (v: string) => Partial<Settings>): Partial<Settings> {
  const r = seeded(seed);
  const pick = <T,>(a: readonly T[]) => a[(r() * a.length) | 0];
  const span = ([lo, hi]: R, step = 0.05) => Math.round((lo + r() * (hi - lo)) / step) * step;
  const anchor = pick(anchors);
  const out: Partial<Settings> = { ...base(anchor) };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => (out[k] = v);
  set('sndTempo', Math.round(span(rc.bpm, 1)));
  set('sndSwing', +span(rc.swing).toFixed(2));
  if (rc.kits) set('sndKit', pick(rc.kits));
  if (rc.bass) set('sndBassSound', pick(rc.bass));
  if (rc.bassPat) set('sndBassPattern', pick(rc.bassPat));
  set('sndTimbre', pick(rc.lead));
  set('sndPadSound', pick(rc.pad));
  set('sndScale', pick(rc.scales));
  const ch = pick(rc.chords);
  if (/^\d/.test(ch)) {
    set('sndProg', 'custom');
    set('sndProgText', ch);
  } else set('sndProg', ch as Settings['sndProg']);
  set('sndChordBars', pick(rc.chordBars));
  for (const [k, v] of Object.entries(rc.fx ?? {})) if (v) (out as Record<string, number>)[k] = +span(v as R).toFixed(2);
  // The instruments the anchor plays, each a little louder or softer.
  for (const k of ['sndStrings', 'sndDrone', 'sndSeq', 'sndArp'] as const) {
    const v = Number(out[k] ?? 0);
    if (v > 0) out[k] = +Math.min(1, Math.max(0.1, v * (0.75 + r() * 0.5))).toFixed(2);
  }
  out.sndVary = +(0.15 + r() * 0.4).toFixed(2);
  // The beat: a few edits on top of the anchor's own ('+' adds a hit, '-' takes one out).
  if (rc.kickAdd || rc.hats || rc.bassAdd) {
    const g = (out.sndGrid || '.'.repeat(64)).padEnd(64, '.').split('');
    const put = (row: number, step: number, c: string) => (g[row * 16 + step] = c);
    if (rc.kickAdd && r() < 0.7) put(0, pick(rc.kickAdd), '+');
    if (rc.kickAdd && r() < 0.3) put(0, pick(rc.kickAdd), '+');
    const hats = rc.hats ? pick(rc.hats) : 'keep';
    for (let s = 0; s < 16; s++) {
      if (hats === '8ths' && s % 2 === 0) put(2, s, '+');
      else if (hats === '16ths' && (s % 2 === 0 || r() < 0.6)) put(2, s, '+');
      else if (hats === 'offbeat') put(2, s, s % 4 === 2 ? '+' : '-');
      else if (hats === 'sparse' && s % 4 !== 2) put(2, s, '-');
    }
    if (rc.bassAdd) {
      const n = 1 + ((r() * 2) | 0);
      for (let k = 0; k < n; k++) put(3, pick(rc.bassAdd), '+');
    }
    out.sndGrid = g.join('');
  }
  return out;
}
