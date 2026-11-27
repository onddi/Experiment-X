// Drum kits and a library of beats by genre.
//
// A kit is a recipe for each drum, all synthesized (no samples). A beat is a
// few rows of steps, one row per drum; each row loops on its own length, so
// rows of different lengths drift against each other (polymeter).
//
// Steps:  .  rest       X  accent     x  normal     o  ghost (soft)
//         ?  half the time            !  a quarter of the time
//         2 3 4  a quick roll of that many hits in one step
// Bass row:  B  root, accented   b  root   o  root, soft   f  fifth
//            t  third   u  root an octave up   ~  root, sliding in from the last note

export type DrumKit = 'soft' | '808' | 'punchy' | 'brush' | 'hand' | '909' | 'linn' | 'lofi' | 'dub' | 'techno' | 'trap' | 'jungle' | 'glitch' | 'minimal' | 'hard'
  | 'band' | 'studio' | 'rock' | 'jazzclub' | 'vintage' | 'rhythmbox' | 'afroperc' | 'tabla' | 'steel' | 'tape' | 'toy' | 'bap' | 'vinyl'
  | 'industrial' | 'gabber' | 'rave' | 'neuro' | 'psy' | 'ebm' | 'memphis' | 'cinematic' | 'electro' | 'latin';
export const KIT_OPTIONS: [DrumKit, string][] = [
  ['soft', 'Soft'], ['808', '808 (boom and clap)'], ['punchy', 'Punchy (club)'], ['brush', 'Brushes (jazz)'], ['hand', 'Hand percussion'],
  ['909', '909 (house)'], ['linn', '80s drum machine'], ['lofi', 'Lo-fi (dusty)'], ['dub', 'Dub (rim and spring)'], ['techno', 'Techno (hard)'],
  ['trap', 'Trap (long 808)'], ['jungle', 'Jungle (breaks)'], ['glitch', 'Glitch (IDM)'], ['minimal', 'Minimal (ticks)'], ['hard', 'Hard (distorted kick)'],
  ['band', 'Band (acoustic)'], ['studio', 'Studio funk (tight)'], ['rock', 'Rock room (big)'], ['jazzclub', 'Jazz club (ride)'], ['vintage', 'Vintage 60s'],
  ['rhythmbox', 'Rhythm box (preset machine)'], ['afroperc', 'Afro percussion'], ['tabla', 'Tabla and dholak'], ['steel', 'Steel and gamelan'], ['tape', 'Tape-worn'], ['toy', 'Toy kit'],
  ['bap', 'Boom bap (crunchy sampler)'], ['vinyl', 'Vinyl break (loose, roomy)'],
  ['industrial', 'Industrial (metal hits)'], ['gabber', 'Gabber (screaming kick)'], ['rave', "Rave '90s (breaks)"], ['neuro', 'Neuro (crisp, tight)'], ['psy', 'Psy (tight, clicky)'],
  ['ebm', 'EBM (gated snare)'], ['memphis', 'Memphis (crunchy 808, cowbell)'], ['cinematic', 'Cinematic (taiko, big toms)'], ['electro', 'Electro (606, zappy)'], ['latin', 'Latin (timbales, congas)'],
];

/** A pitched body: start and end pitch, how fast it drops, how long it rings, loudness, wave. */
export type Body = [f0: number, f1: number, drop: number, decay: number, amp: number, type?: OscillatorType];
/** Filtered noise: filter, frequency, Q, attack, decay, loudness. */
export type Noise = [type: BiquadFilterType, f: number, q: number, attack: number, decay: number, amp: number];
export interface KitDef {
  // Left out on the first five kits, which keep their own kick, snare and hat.
  kick?: { body: Body; click?: number; sub?: Body };
  snare?: { body?: Body; noise: Noise };
  hat?: { type: BiquadFilterType; f: number; q: number; closed: number; open: number; amp: number; ping?: number };
  clap: { f: number; decay: number; amp: number; n: number };
  rim: Body;
  perc: Body[]; // played together: a conga, a cowbell's two tones…
  tom: Body; // the high tom; fills step down from it
  crash: Noise;
  wet: number; // how much room
  jit?: number; // random pitch per hit (glitch)
}

const CRASH: Noise = ['highpass', 5200, 0.6, 0.002, 1.3, 0.16];
export const KITS: Record<DrumKit, KitDef> = {
  soft: { clap: { f: 1300, decay: 0.14, amp: 0.26, n: 3 }, rim: [1700, 1600, 0.02, 0.05, 0.2], perc: [[320, 290, 0.03, 0.16, 0.3]], tom: [200, 150, 0.08, 0.28, 0.45], crash: CRASH, wet: 0.3 },
  '808': { clap: { f: 1400, decay: 0.18, amp: 0.34, n: 3 }, rim: [1900, 1850, 0.01, 0.04, 0.25, 'triangle'], perc: [[540, 540, 0.01, 0.12, 0.12, 'square'], [800, 800, 0.01, 0.12, 0.09, 'square']], tom: [220, 140, 0.15, 0.4, 0.5], crash: CRASH, wet: 0.25 },
  punchy: { clap: { f: 1600, decay: 0.12, amp: 0.36, n: 3 }, rim: [2000, 1900, 0.01, 0.035, 0.25, 'triangle'], perc: [[400, 360, 0.02, 0.1, 0.3]], tom: [240, 160, 0.06, 0.22, 0.55], crash: ['highpass', 6000, 0.7, 0.001, 0.9, 0.16], wet: 0.15 },
  brush: { clap: { f: 2400, decay: 0.2, amp: 0.2, n: 2 }, rim: [1500, 1450, 0.02, 0.05, 0.18], perc: [[300, 280, 0.03, 0.2, 0.25]], tom: [180, 150, 0.1, 0.4, 0.4], crash: ['highpass', 4200, 0.5, 0.01, 1.8, 0.1], wet: 0.4 },
  hand: { clap: { f: 1800, decay: 0.12, amp: 0.3, n: 4 }, rim: [1800, 1700, 0.02, 0.06, 0.25], perc: [[330, 300, 0.03, 0.18, 0.4], [660, 640, 0.01, 0.04, 0.08]], tom: [260, 200, 0.1, 0.32, 0.5], crash: ['bandpass', 6500, 1, 0.02, 0.6, 0.2], wet: 0.3 },
  '909': {
    kick: { body: [210, 50, 0.04, 0.42, 0.85], click: 0.32 },
    snare: { body: [240, 185, 0.03, 0.11, 0.3, 'triangle'], noise: ['highpass', 1500, 0.7, 0.002, 0.2, 0.42] },
    hat: { type: 'highpass', f: 8200, q: 0.8, closed: 0.04, open: 0.32, amp: 0.26, ping: 0.5 },
    clap: { f: 1250, decay: 0.2, amp: 0.38, n: 3 }, rim: [1750, 1700, 0.01, 0.04, 0.26, 'triangle'],
    perc: [[560, 560, 0.01, 0.1, 0.12, 'square'], [845, 845, 0.01, 0.1, 0.09, 'square']], tom: [250, 170, 0.06, 0.25, 0.55], crash: ['highpass', 5500, 0.8, 0.001, 1.4, 0.18], wet: 0.2,
  },
  linn: {
    kick: { body: [160, 55, 0.05, 0.3, 0.8], click: 0.15 },
    snare: { body: [210, 170, 0.04, 0.14, 0.32, 'triangle'], noise: ['bandpass', 2400, 0.6, 0.002, 0.26, 0.48] },
    hat: { type: 'bandpass', f: 9000, q: 1.2, closed: 0.05, open: 0.3, amp: 0.28 },
    clap: { f: 1500, decay: 0.22, amp: 0.36, n: 4 }, rim: [1600, 1550, 0.01, 0.05, 0.28, 'triangle'],
    perc: [[420, 400, 0.02, 0.12, 0.3, 'triangle']], tom: [300, 190, 0.12, 0.35, 0.6], crash: ['highpass', 5000, 0.7, 0.003, 1.6, 0.17], wet: 0.45,
  },
  lofi: {
    kick: { body: [120, 50, 0.07, 0.28, 0.8] },
    snare: { body: [190, 160, 0.05, 0.1, 0.25, 'triangle'], noise: ['bandpass', 1700, 0.8, 0.004, 0.18, 0.4] },
    hat: { type: 'bandpass', f: 5200, q: 1.1, closed: 0.05, open: 0.2, amp: 0.2 },
    clap: { f: 1100, decay: 0.16, amp: 0.3, n: 3 }, rim: [1300, 1250, 0.02, 0.05, 0.22],
    perc: [[300, 280, 0.03, 0.15, 0.3]], tom: [190, 140, 0.1, 0.3, 0.5], crash: ['bandpass', 4200, 0.6, 0.01, 0.9, 0.12], wet: 0.25,
  },
  dub: {
    kick: { body: [110, 42, 0.08, 0.5, 0.85] },
    snare: { body: [260, 220, 0.02, 0.08, 0.25, 'triangle'], noise: ['bandpass', 2200, 0.9, 0.002, 0.16, 0.38] },
    hat: { type: 'highpass', f: 7500, q: 0.7, closed: 0.035, open: 0.25, amp: 0.2 },
    clap: { f: 1300, decay: 0.25, amp: 0.3, n: 3 }, rim: [1650, 1600, 0.01, 0.06, 0.34, 'triangle'],
    perc: [[350, 320, 0.03, 0.18, 0.3]], tom: [200, 140, 0.1, 0.4, 0.5], crash: ['highpass', 4800, 0.6, 0.004, 1.8, 0.13], wet: 0.85,
  },
  techno: {
    kick: { body: [180, 44, 0.05, 0.38, 0.95, 'triangle'], click: 0.4, sub: [60, 42, 0.1, 0.5, 0.45] },
    snare: { body: [280, 200, 0.03, 0.08, 0.25, 'square'], noise: ['highpass', 2200, 0.8, 0.001, 0.14, 0.42] },
    hat: { type: 'highpass', f: 9500, q: 1, closed: 0.03, open: 0.24, amp: 0.3, ping: 0.7 },
    clap: { f: 1700, decay: 0.16, amp: 0.4, n: 3 }, rim: [2200, 2100, 0.01, 0.03, 0.3, 'square'],
    perc: [[620, 600, 0.01, 0.08, 0.1, 'square'], [930, 900, 0.01, 0.08, 0.07, 'square']], tom: [230, 150, 0.06, 0.2, 0.55], crash: ['highpass', 7000, 0.9, 0.001, 1.1, 0.17], wet: 0.25,
  },
  trap: {
    kick: { body: [170, 48, 0.035, 0.32, 0.9], click: 0.25 },
    snare: { body: [230, 200, 0.02, 0.07, 0.3, 'triangle'], noise: ['highpass', 2600, 0.7, 0.001, 0.13, 0.48] },
    hat: { type: 'highpass', f: 9000, q: 0.9, closed: 0.025, open: 0.28, amp: 0.24 },
    clap: { f: 1500, decay: 0.2, amp: 0.45, n: 4 }, rim: [2100, 2050, 0.01, 0.03, 0.26, 'triangle'],
    perc: [[700, 680, 0.01, 0.06, 0.12, 'triangle']], tom: [210, 130, 0.1, 0.3, 0.5], crash: ['highpass', 6000, 0.7, 0.001, 1.5, 0.15], wet: 0.2,
  },
  jungle: {
    kick: { body: [150, 52, 0.04, 0.24, 0.85], click: 0.2 },
    snare: { body: [300, 230, 0.03, 0.09, 0.35, 'triangle'], noise: ['bandpass', 3200, 0.6, 0.001, 0.15, 0.5] },
    hat: { type: 'bandpass', f: 8000, q: 0.9, closed: 0.035, open: 0.22, amp: 0.26 },
    clap: { f: 1600, decay: 0.15, amp: 0.34, n: 3 }, rim: [1900, 1850, 0.01, 0.04, 0.26, 'triangle'],
    perc: [[480, 450, 0.02, 0.1, 0.25]], tom: [280, 190, 0.07, 0.24, 0.55], crash: ['highpass', 5200, 0.6, 0.001, 1.6, 0.17], wet: 0.35,
  },
  glitch: {
    kick: { body: [240, 50, 0.025, 0.14, 0.85, 'square'], click: 0.3 },
    snare: { body: [600, 300, 0.01, 0.04, 0.25, 'square'], noise: ['bandpass', 4200, 2, 0.001, 0.07, 0.45] },
    hat: { type: 'bandpass', f: 11000, q: 3, closed: 0.012, open: 0.08, amp: 0.3 },
    clap: { f: 2800, decay: 0.06, amp: 0.35, n: 5 }, rim: [3200, 3000, 0.005, 0.015, 0.25, 'square'],
    perc: [[1200, 800, 0.01, 0.03, 0.14, 'square']], tom: [400, 200, 0.03, 0.1, 0.45, 'square'], crash: ['bandpass', 9000, 2, 0.001, 0.3, 0.2], wet: 0.2, jit: 0.35,
  },
  minimal: {
    kick: { body: [140, 48, 0.04, 0.22, 0.8] },
    snare: { noise: ['bandpass', 3000, 2, 0.001, 0.05, 0.4] },
    hat: { type: 'highpass', f: 10000, q: 1, closed: 0.015, open: 0.12, amp: 0.22 },
    clap: { f: 2000, decay: 0.08, amp: 0.28, n: 2 }, rim: [2400, 2350, 0.005, 0.025, 0.3, 'triangle'],
    perc: [[900, 880, 0.005, 0.03, 0.14]], tom: [320, 260, 0.03, 0.12, 0.4], crash: ['highpass', 8000, 1, 0.001, 0.5, 0.12], wet: 0.3,
  },
  // Hardstyle and hard techno: a square-wave kick that pitches down hard (it reads as distorted).
  hard: {
    kick: { body: [260, 46, 0.03, 0.45, 0.8, 'square'], click: 0.5, sub: [70, 44, 0.1, 0.55, 0.55] },
    snare: { body: [300, 210, 0.02, 0.08, 0.28, 'square'], noise: ['highpass', 2000, 0.8, 0.001, 0.16, 0.45] },
    hat: { type: 'highpass', f: 9000, q: 1, closed: 0.03, open: 0.22, amp: 0.28, ping: 0.6 },
    clap: { f: 1600, decay: 0.2, amp: 0.45, n: 4 }, rim: [2200, 2100, 0.01, 0.03, 0.3, 'square'],
    perc: [[640, 620, 0.01, 0.08, 0.1, 'square']], tom: [240, 140, 0.05, 0.22, 0.55, 'square'], crash: ['highpass', 6500, 0.8, 0.001, 1.4, 0.18], wet: 0.3,
  },
  // Rap: a sampler's thump and crack (crunchy, dry), and a sampled funk break (loose, in a room).
  bap: {
    kick: { body: [140, 50, 0.04, 0.26, 0.92], click: 0.35 },
    snare: { body: [215, 180, 0.02, 0.1, 0.32, 'triangle'], noise: ['highpass', 1800, 0.6, 0.001, 0.2, 0.56] },
    hat: { type: 'bandpass', f: 7000, q: 1.4, closed: 0.04, open: 0.22, amp: 0.22 },
    clap: { f: 1300, decay: 0.14, amp: 0.34, n: 3 }, rim: [1750, 1700, 0.01, 0.04, 0.26, 'triangle'],
    perc: [[380, 350, 0.02, 0.12, 0.28]], tom: [200, 140, 0.07, 0.28, 0.55], crash: ['bandpass', 5200, 0.7, 0.004, 1, 0.13], wet: 0.12,
  },
  vinyl: {
    kick: { body: [115, 50, 0.05, 0.3, 0.86], click: 0.2 },
    snare: { body: [200, 170, 0.03, 0.13, 0.3, 'triangle'], noise: ['bandpass', 2600, 0.5, 0.002, 0.25, 0.55] },
    hat: { type: 'bandpass', f: 7500, q: 0.8, closed: 0.045, open: 0.3, amp: 0.25 },
    clap: { f: 1400, decay: 0.18, amp: 0.3, n: 3 }, rim: [1650, 1600, 0.01, 0.05, 0.27, 'triangle'],
    perc: [[320, 300, 0.03, 0.17, 0.3]], tom: [190, 135, 0.07, 0.36, 0.55], crash: ['highpass', 4600, 0.5, 0.004, 1.7, 0.16], wet: 0.42,
  },
  // Dark electronic: clanking metal, a gabber kick that screams (a square pitched
  // down hard), a '90s break kit, a crisp neuro kit, a tight psy kit, an EBM kit
  // with a big gated snare, Memphis tape 808s with cowbell, cinematic taiko, a
  // thin zappy 606, and Latin hand drums.
  industrial: {
    kick: { body: [200, 45, 0.04, 0.34, 0.9, 'square'], click: 0.45, sub: [62, 44, 0.1, 0.4, 0.4] },
    snare: { body: [420, 260, 0.02, 0.1, 0.3, 'square'], noise: ['bandpass', 3600, 1.4, 0.001, 0.22, 0.5] },
    hat: { type: 'bandpass', f: 6800, q: 4, closed: 0.04, open: 0.3, amp: 0.3, ping: 0.9 },
    clap: { f: 2200, decay: 0.18, amp: 0.4, n: 5 }, rim: [2600, 1800, 0.01, 0.06, 0.3, 'square'],
    perc: [[1130, 1110, 0.005, 0.22, 0.12, 'square'], [1610, 1590, 0.005, 0.2, 0.09, 'square'], [2370, 2350, 0.005, 0.16, 0.06, 'sawtooth']],
    tom: [260, 120, 0.05, 0.3, 0.55, 'square'], crash: ['bandpass', 5200, 3, 0.001, 1.4, 0.2], wet: 0.45, jit: 0.08,
  },
  gabber: {
    kick: { body: [320, 52, 0.022, 0.38, 0.85, 'square'], click: 0.6, sub: [80, 52, 0.06, 0.45, 0.6, 'sawtooth'] },
    snare: { body: [320, 220, 0.02, 0.09, 0.3, 'square'], noise: ['highpass', 2400, 0.8, 0.001, 0.16, 0.45] },
    hat: { type: 'highpass', f: 9500, q: 1, closed: 0.025, open: 0.2, amp: 0.3, ping: 0.6 },
    clap: { f: 1800, decay: 0.16, amp: 0.42, n: 4 }, rim: [2300, 2200, 0.01, 0.03, 0.3, 'square'],
    perc: [[700, 680, 0.01, 0.07, 0.1, 'square']], tom: [280, 150, 0.04, 0.2, 0.55, 'square'], crash: ['highpass', 6000, 0.8, 0.001, 1.2, 0.18], wet: 0.28,
  },
  rave: {
    kick: { body: [160, 50, 0.04, 0.26, 0.88], click: 0.3 },
    snare: { body: [260, 200, 0.02, 0.1, 0.34, 'triangle'], noise: ['bandpass', 3400, 0.5, 0.001, 0.18, 0.55] },
    hat: { type: 'bandpass', f: 8500, q: 0.8, closed: 0.035, open: 0.4, amp: 0.26, ping: 0.4 },
    clap: { f: 1500, decay: 0.16, amp: 0.36, n: 3 }, rim: [1900, 1850, 0.01, 0.04, 0.26, 'triangle'],
    perc: [[5200, 5100, 0.002, 0.5, 0.05, 'triangle'], [7400, 7300, 0.002, 0.45, 0.035, 'triangle']], tom: [260, 170, 0.07, 0.25, 0.55], crash: ['highpass', 5000, 0.6, 0.001, 1.8, 0.18], wet: 0.32,
  },
  neuro: {
    kick: { body: [190, 48, 0.03, 0.22, 0.95], click: 0.45 },
    snare: { body: [240, 190, 0.015, 0.07, 0.36, 'triangle'], noise: ['highpass', 2800, 0.8, 0.001, 0.12, 0.58] },
    hat: { type: 'highpass', f: 10500, q: 1.2, closed: 0.02, open: 0.16, amp: 0.26 },
    clap: { f: 1900, decay: 0.12, amp: 0.4, n: 3 }, rim: [2400, 2300, 0.005, 0.025, 0.28, 'square'],
    perc: [[880, 640, 0.008, 0.05, 0.14, 'square']], tom: [300, 180, 0.04, 0.16, 0.5], crash: ['highpass', 6800, 0.9, 0.001, 0.9, 0.16], wet: 0.18,
  },
  psy: {
    kick: { body: [170, 46, 0.025, 0.2, 0.95], click: 0.55 },
    snare: { body: [300, 220, 0.02, 0.06, 0.24, 'triangle'], noise: ['highpass', 3000, 0.9, 0.001, 0.1, 0.42] },
    hat: { type: 'highpass', f: 11000, q: 1.4, closed: 0.018, open: 0.14, amp: 0.28, ping: 0.8 },
    clap: { f: 1900, decay: 0.12, amp: 0.36, n: 3 }, rim: [2500, 2400, 0.005, 0.02, 0.28, 'square'],
    perc: [[1800, 400, 0.02, 0.06, 0.14, 'sawtooth']], tom: [320, 160, 0.03, 0.14, 0.45], crash: ['highpass', 7000, 0.9, 0.001, 1, 0.15], wet: 0.25,
  },
  ebm: {
    kick: { body: [150, 48, 0.04, 0.28, 0.9], click: 0.25 },
    snare: { body: [200, 160, 0.03, 0.16, 0.34, 'triangle'], noise: ['bandpass', 2200, 0.5, 0.002, 0.34, 0.55] },
    hat: { type: 'bandpass', f: 8800, q: 1.4, closed: 0.04, open: 0.26, amp: 0.26 },
    clap: { f: 1400, decay: 0.3, amp: 0.4, n: 4 }, rim: [1700, 1600, 0.01, 0.05, 0.28, 'square'],
    perc: [[460, 440, 0.01, 0.12, 0.2, 'square']], tom: [340, 150, 0.15, 0.42, 0.6, 'triangle'], crash: ['highpass', 4800, 0.7, 0.003, 1.6, 0.16], wet: 0.6,
  },
  memphis: {
    kick: { body: [130, 44, 0.05, 0.6, 0.9], click: 0.2, sub: [55, 40, 0.2, 0.9, 0.5] },
    snare: { body: [210, 175, 0.03, 0.11, 0.3, 'triangle'], noise: ['bandpass', 2000, 0.7, 0.003, 0.2, 0.46] },
    hat: { type: 'bandpass', f: 6800, q: 1.2, closed: 0.04, open: 0.22, amp: 0.22 },
    clap: { f: 1250, decay: 0.2, amp: 0.38, n: 3 }, rim: [1700, 1650, 0.01, 0.04, 0.25, 'triangle'],
    perc: [[560, 560, 0.01, 0.16, 0.14, 'square'], [845, 845, 0.01, 0.16, 0.1, 'square']], tom: [200, 130, 0.12, 0.4, 0.5], crash: ['bandpass', 4600, 0.6, 0.006, 1.1, 0.12], wet: 0.2,
  },
  cinematic: {
    kick: { body: [90, 36, 0.12, 0.9, 0.95], click: 0.1, sub: [48, 32, 0.3, 1.2, 0.5] },
    snare: { body: [160, 120, 0.06, 0.35, 0.4, 'triangle'], noise: ['lowpass', 1400, 0.6, 0.004, 0.5, 0.45] },
    hat: { type: 'bandpass', f: 6000, q: 0.8, closed: 0.06, open: 0.5, amp: 0.2 },
    clap: { f: 1100, decay: 0.3, amp: 0.34, n: 5 }, rim: [900, 820, 0.02, 0.12, 0.3, 'triangle'],
    perc: [[140, 90, 0.08, 0.6, 0.6], [70, 50, 0.15, 0.9, 0.4]], tom: [180, 90, 0.18, 0.7, 0.7], crash: ['highpass', 3200, 0.5, 0.01, 2.6, 0.18], wet: 0.75,
  },
  electro: {
    kick: { body: [180, 52, 0.05, 0.3, 0.85], click: 0.2 },
    snare: { body: [300, 250, 0.02, 0.08, 0.26, 'triangle'], noise: ['highpass', 3800, 0.7, 0.001, 0.14, 0.4] },
    hat: { type: 'highpass', f: 11500, q: 1.2, closed: 0.02, open: 0.18, amp: 0.24, ping: 0.6 },
    clap: { f: 1700, decay: 0.12, amp: 0.34, n: 3 }, rim: [2300, 2250, 0.005, 0.03, 0.26, 'square'],
    perc: [[1600, 300, 0.05, 0.12, 0.18, 'square']], tom: [600, 160, 0.12, 0.22, 0.45, 'triangle'], crash: ['highpass', 7500, 0.9, 0.001, 0.9, 0.14], wet: 0.2,
  },
  latin: {
    kick: { body: [120, 52, 0.04, 0.24, 0.7] },
    snare: { body: [620, 560, 0.01, 0.16, 0.36, 'triangle'], noise: ['bandpass', 3000, 1, 0.001, 0.08, 0.25] },
    hat: { type: 'bandpass', f: 5500, q: 2, closed: 0.05, open: 0.18, amp: 0.2 },
    clap: { f: 1600, decay: 0.12, amp: 0.3, n: 3 }, rim: [1800, 1750, 0.01, 0.05, 0.3, 'triangle'],
    perc: [[350, 330, 0.02, 0.2, 0.4], [1250, 1250, 0.005, 0.08, 0.12, 'triangle']], tom: [520, 440, 0.03, 0.22, 0.45, 'triangle'], crash: ['highpass', 5600, 0.7, 0.002, 1.2, 0.15], wet: 0.3,
  },
  // Acoustic kits, made for the live grooves (ghost notes, toms and cymbals sound natural).
  band: {
    kick: { body: [110, 48, 0.04, 0.32, 0.85], click: 0.2 },
    snare: { body: [190, 165, 0.03, 0.12, 0.3, 'triangle'], noise: ['bandpass', 3000, 0.5, 0.002, 0.22, 0.5] },
    hat: { type: 'bandpass', f: 8000, q: 0.7, closed: 0.05, open: 0.35, amp: 0.26 },
    clap: { f: 1400, decay: 0.16, amp: 0.3, n: 3 }, rim: [1700, 1650, 0.01, 0.05, 0.28, 'triangle'],
    perc: [[330, 300, 0.03, 0.18, 0.3]], tom: [180, 130, 0.06, 0.35, 0.55], crash: ['highpass', 5000, 0.6, 0.003, 1.6, 0.18], wet: 0.35,
  },
  studio: {
    kick: { body: [130, 52, 0.03, 0.22, 0.85], click: 0.3 },
    snare: { body: [230, 200, 0.02, 0.09, 0.3, 'triangle'], noise: ['highpass', 2200, 0.7, 0.001, 0.14, 0.5] },
    hat: { type: 'highpass', f: 9500, q: 0.8, closed: 0.035, open: 0.25, amp: 0.27 },
    clap: { f: 1500, decay: 0.12, amp: 0.32, n: 3 }, rim: [1900, 1850, 0.01, 0.04, 0.28, 'triangle'],
    perc: [[420, 400, 0.02, 0.12, 0.3]], tom: [210, 150, 0.05, 0.25, 0.55], crash: ['highpass', 6000, 0.7, 0.002, 1.2, 0.16], wet: 0.1,
  },
  rock: {
    kick: { body: [100, 45, 0.05, 0.4, 0.95], click: 0.25, sub: [60, 45, 0.1, 0.4, 0.4] },
    snare: { body: [180, 150, 0.03, 0.16, 0.35, 'triangle'], noise: ['bandpass', 2600, 0.5, 0.002, 0.32, 0.6] },
    hat: { type: 'bandpass', f: 7500, q: 0.6, closed: 0.06, open: 0.45, amp: 0.3 },
    clap: { f: 1300, decay: 0.2, amp: 0.34, n: 3 }, rim: [1600, 1550, 0.01, 0.05, 0.3, 'triangle'],
    perc: [[300, 280, 0.03, 0.2, 0.3]], tom: [160, 110, 0.08, 0.5, 0.65], crash: ['highpass', 4500, 0.5, 0.003, 2, 0.22], wet: 0.55,
  },
  jazzclub: {
    kick: { body: [90, 55, 0.05, 0.25, 0.5] },
    snare: { body: [200, 180, 0.03, 0.1, 0.2, 'triangle'], noise: ['bandpass', 3500, 0.4, 0.01, 0.2, 0.32] },
    hat: { type: 'bandpass', f: 10000, q: 1.5, closed: 0.05, open: 0.5, amp: 0.22, ping: 0.4 },
    clap: { f: 2200, decay: 0.18, amp: 0.2, n: 2 }, rim: [1500, 1450, 0.02, 0.05, 0.2],
    perc: [[300, 280, 0.03, 0.2, 0.25]], tom: [170, 140, 0.1, 0.4, 0.4], crash: ['highpass', 4200, 0.5, 0.01, 1.8, 0.12], wet: 0.4,
  },
  vintage: {
    kick: { body: [95, 55, 0.05, 0.28, 0.7, 'triangle'] },
    snare: { body: [210, 180, 0.03, 0.12, 0.3, 'triangle'], noise: ['bandpass', 2000, 0.8, 0.003, 0.2, 0.45] },
    hat: { type: 'bandpass', f: 6500, q: 1, closed: 0.05, open: 0.3, amp: 0.22 },
    clap: { f: 1200, decay: 0.18, amp: 0.28, n: 3 }, rim: [1400, 1350, 0.02, 0.05, 0.25, 'triangle'],
    perc: [[350, 320, 0.03, 0.16, 0.28]], tom: [170, 130, 0.08, 0.35, 0.5], crash: ['bandpass', 4000, 0.6, 0.004, 1.4, 0.16], wet: 0.45,
  },
  // A preset rhythm machine from before drum machines got punchy.
  rhythmbox: {
    kick: { body: [120, 90, 0.02, 0.12, 0.7] },
    snare: { body: [400, 380, 0.01, 0.04, 0.15, 'triangle'], noise: ['highpass', 3500, 0.8, 0.001, 0.07, 0.35] },
    hat: { type: 'highpass', f: 10000, q: 2, closed: 0.02, open: 0.1, amp: 0.18 },
    clap: { f: 1800, decay: 0.08, amp: 0.25, n: 2 }, rim: [2400, 2400, 0.005, 0.02, 0.25, 'square'],
    perc: [[800, 800, 0.01, 0.05, 0.15, 'square']], tom: [300, 260, 0.03, 0.12, 0.4], crash: ['highpass', 7000, 1, 0.001, 0.5, 0.12], wet: 0.2,
  },
  // World: hand drums, bells and metal on the usual drum parts.
  afroperc: {
    kick: { body: [85, 60, 0.06, 0.3, 0.75] },
    snare: { body: [380, 340, 0.02, 0.1, 0.4], noise: ['bandpass', 4000, 0.5, 0.002, 0.06, 0.2] },
    hat: { type: 'bandpass', f: 6000, q: 2, closed: 0.04, open: 0.15, amp: 0.25 },
    clap: { f: 1800, decay: 0.12, amp: 0.3, n: 4 }, rim: [2600, 2600, 0.002, 0.25, 0.12, 'triangle'],
    perc: [[330, 300, 0.03, 0.18, 0.4], [2600, 2600, 0.002, 0.25, 0.08, 'triangle']], tom: [240, 200, 0.06, 0.3, 0.55], crash: ['bandpass', 6500, 1, 0.02, 0.6, 0.2], wet: 0.3,
  },
  tabla: {
    kick: { body: [80, 110, 0.15, 0.4, 0.7] },
    snare: { body: [520, 500, 0.01, 0.25, 0.45], noise: ['bandpass', 3000, 1, 0.001, 0.03, 0.1] },
    hat: { type: 'highpass', f: 7000, q: 1, closed: 0.02, open: 0.08, amp: 0.15 },
    clap: { f: 1600, decay: 0.1, amp: 0.25, n: 3 }, rim: [620, 600, 0.01, 0.2, 0.35],
    perc: [[620, 600, 0.01, 0.2, 0.35]], tom: [180, 150, 0.08, 0.4, 0.5], crash: ['bandpass', 5000, 1, 0.01, 0.8, 0.12], wet: 0.35,
  },
  steel: {
    kick: { body: [100, 60, 0.04, 0.3, 0.75] },
    snare: { body: [700, 690, 0.005, 0.4, 0.25, 'triangle'], noise: ['highpass', 5000, 1, 0.001, 0.03, 0.1] },
    hat: { type: 'bandpass', f: 5200, q: 6, closed: 0.08, open: 0.5, amp: 0.2, ping: 1 },
    clap: { f: 2000, decay: 0.1, amp: 0.2, n: 2 }, rim: [1046, 1046, 0.005, 0.4, 0.15, 'triangle'],
    perc: [[523, 523, 0.005, 0.6, 0.2, 'triangle'], [1046, 1046, 0.005, 0.4, 0.08]], tom: [392, 392, 0.005, 0.5, 0.35, 'triangle'], crash: ['bandpass', 3000, 3, 0.005, 2.2, 0.14], wet: 0.45,
  },
  // Textures.
  tape: {
    kick: { body: [100, 50, 0.05, 0.3, 0.8] },
    snare: { body: [190, 170, 0.03, 0.12, 0.3, 'triangle'], noise: ['lowpass', 2500, 0.6, 0.003, 0.2, 0.55] },
    hat: { type: 'bandpass', f: 6000, q: 0.6, closed: 0.05, open: 0.3, amp: 0.22 },
    clap: { f: 1100, decay: 0.18, amp: 0.28, n: 3 }, rim: [1300, 1250, 0.02, 0.05, 0.22, 'triangle'],
    perc: [[300, 280, 0.03, 0.18, 0.28]], tom: [170, 130, 0.08, 0.35, 0.5], crash: ['bandpass', 3500, 0.5, 0.004, 1.4, 0.14], wet: 0.3,
  },
  toy: {
    kick: { body: [300, 200, 0.02, 0.06, 0.4, 'square'] },
    snare: { body: [900, 850, 0.01, 0.03, 0.2, 'square'], noise: ['highpass', 6000, 1, 0.001, 0.04, 0.2] },
    hat: { type: 'highpass', f: 11000, q: 2, closed: 0.015, open: 0.05, amp: 0.12 },
    clap: { f: 2500, decay: 0.06, amp: 0.2, n: 2 }, rim: [3000, 3000, 0.005, 0.02, 0.2, 'square'],
    perc: [[1200, 1200, 0.005, 0.05, 0.12, 'square']], tom: [600, 500, 0.02, 0.08, 0.3, 'square'], crash: ['highpass', 8000, 1, 0.001, 0.4, 0.1], wet: 0.15,
  },
};

/** The drums a beat can use: kick, snare, clap, hat, open hat, rim, perc, tom, crash. */
export const DRUM_ROWS = ['k', 's', 'c', 'h', 'o', 'r', 'p', 't', 'y'] as const;
export type DrumRow = (typeof DRUM_ROWS)[number];
/** A beat; kit, bpm: its own kit or tempo, where the genre's would make every beat sound alike. */
export type Beat = { name: string; kit?: DrumKit; bpm?: number } & Partial<Record<DrumRow | 'b', string>>;
export type FillStyle = 'roll' | 'toms' | 'hats' | 'glitch' | 'drop';
export interface Genre {
  id: string;
  name: string;
  bpm: number;
  swing: number;
  kit: DrumKit;
  bass: import('./sound.ts').BassSound;
  fill: FillStyle;
  beats: Beat[];
  // More takes on the genre for the Style list: one of its beats with its own
  // sound, tempo, kit or bass. (The drum beat list shows only the beats.)
  versions?: Version[];
}
export interface Version {
  name: string;
  from: string; // the beat it plays
  sound?: string; // a sound preset, instead of the genre's own
  bpm?: number;
  swing?: number;
  kit?: DrumKit;
  bass?: import('./sound.ts').BassSound;
  pat?: 'beat' | 'hold' | 'pump' | 'walk' | 'arp' | 'offbeat';
}

export const GENRES: Genre[] = [
  {
    id: 'techno', name: 'Techno', bpm: 130, swing: 0, kit: 'techno', bass: 'moog', fill: 'roll', beats: [
      { name: 'Four to the floor', k: 'X...X...X...X...', c: '....x.......x...', h: '..x...x...x...x.', b: '..b...b...b...b.' },
      { name: 'Rumble', k: 'X...X...X...X...', h: '..X...X...X...X.', t: '.o.o.o.o.o.o.o.o', b: '.obb.obb.obb.obb' },
      { name: 'Offbeat', k: 'X...X...X...X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..X...X...X...X.', b: '..b...b...b..fb.' },
      { name: 'Industrial', k: 'X..xX...X..xX.x.', s: '....X.......X...', h: 'XoxoXoxoXoxoXoxo', p: '...x.....x....x.', b: 'b..b..b...b..b..' },
      { name: 'Hypnotic', k: 'X...X...X...X...', h: '..x.?.x...x.?.x.', r: '...x..x....x..x.', p: '.....?.......?..', b: 'b..b..b..b..b.b.' },
      { name: 'Broken', k: 'X.....x...X..x..', s: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', p: '.......?.......?', b: 'b.....b...b..u..' },
      { name: 'Acid drive', k: 'X...X...X...X...', c: '....x.......x...', h: 'oxoxoxoxoxoxoxox', b: 'b.ub.bf.b.ub.u.f' },
      { name: 'Dub techno', k: 'X...X...X...X...', r: '...?......x.....', h: '..x...x...x...x.', b: '..b...b...b...b.' },
      { name: 'Peak time', k: 'X...X...X...X...', c: '....X.......X...', h: 'xxXxxxXxxxXxxxXx', o: '..x...x...x...x.', b: '..bb..bb..bb..bb' },
      { name: 'Detroit', k: 'X...X...X...X...', c: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', p: '..x.....x.x.....', b: 'b..b..b...b..b..' },
      { name: 'Polymeter', k: 'X...X...X...X...', h: '..x.', p: 'x..', r: 'x....', b: '..b...b...b...b.' },
    ],
    versions: [
      { name: 'Warehouse', from: 'Industrial', sound: 'Acid techno', bpm: 136, bass: 'acid', pat: 'pump' },
      { name: 'Deep minimal', from: 'Hypnotic', sound: 'Minimal', bpm: 124, kit: 'minimal', bass: 'sub', pat: 'hold' },
    ],
  },
  {
    id: 'house', name: 'House', bpm: 124, swing: 0.15, kit: '909', bass: 'house', fill: 'roll', beats: [
      { name: 'Classic', k: 'X...X...X...X...', c: '....X.......X...', h: 'x...x...x...x...', o: '..X...X...X...X.', b: '..b..ob...b..ob.' },
      { name: 'Deep', k: 'X...X...X...X...', c: '....x.......x...', h: 'o.xoo.xoo.xoo.xo', r: '...o......o.....', b: 'b.....b.f.....u.' },
      { name: 'Disco', k: 'X...X...X...X...', s: '....X.......X...', h: 'xo.oxo.oxo.oxo.o', o: '..X...X...X...X.', b: 'b.u.b.u.b.u.b.u.' },
      { name: 'Tech house', k: 'X...X...X...X...', c: '....X.......X...', h: '..x...x...x...x.', p: '.o..?..o.o..?..o', r: '......x.......x.', b: '..bo..b...bo..b.' },
      { name: 'Jackin', k: 'X...X...X...X...', c: '....X..x....X...', h: 'xxoxxxoxxxoxxxox', s: '...o.....o.....o', b: '..b..b..b.b..b..' },
      { name: 'Garage two-step', k: 'X......x..X.....', s: '....X.......X...', h: '..x.o.x...x.o.x.', r: '.......o.......o', b: 'b.....b...b..u..' },
      { name: 'Chicago', k: 'X...X...X...X...', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: '...x.....x..x...', b: 'b..b..b...b..b..' },
      { name: 'Tribal', k: 'X...X...X...X...', t: '..x...x.x..x..x.', p: 'x..x..x.x..x..x.', h: '..x...x...x...x.', b: '..b...b...b...b.' },
      { name: 'Funky house', k: 'X...X...X...X...', c: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', o: '..X...X...X...X.', p: '...x.....x..x...', b: '..b..ob...b.bob.' },
    ],
    versions: [
      { name: 'Late night', from: 'Deep', sound: 'Night drive', bpm: 120, swing: 0.25, bass: 'round', pat: 'offbeat' },
      { name: 'Organ house', from: 'Classic', sound: 'Gospel organ', pat: 'walk' },
    ],
  },
  {
    id: 'dub', name: 'Dub & reggae', bpm: 76, swing: 0.35, kit: 'dub', bass: 'round', fill: 'drop', beats: [
      { name: 'One drop', k: '........X.......', r: '........X.......', h: 'x.o.x.o.x.o.x.o.', b: 'b..b.f....b.u...' },
      { name: 'Rockers', k: 'X.......X.......', r: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', b: 'b.bb..f.b.bb..u.' },
      { name: 'Steppers', k: 'X...X...X...X...', s: '........X.......', h: '..x...x...x...x.', b: 'b.b.b..bb.b.b...' },
      { name: 'Skank', k: '........X.......', s: '........X.......', r: '..x...x...x...x.', h: 'x...x...x...x...', b: 'b...f...b..ub...' },
      { name: 'Nyabinghi', k: 'X.......X.......', t: '....x.......x...', p: 'x.ox.oox.ox.oox.', b: 'b.......f.......' },
      { name: 'Rub-a-dub', k: 'X.....X.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b..b..b.b...f...' },
      { name: 'Digital', k: 'X..x..x...X..x..', r: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'b..b..b...b..b..' },
      { name: 'Lovers rock', k: '........X.......', r: '....o...x...o...', h: 'x.xox.xox.xox.xo', b: 'b...b.f.b...b.t.' },
    ],
    versions: [
      { name: 'Echo chamber', from: 'One drop', sound: 'Dub echoes', bpm: 70, bass: 'sub', pat: 'hold' },
      { name: 'Chord steppers', from: 'Steppers', sound: 'Dub chords', bpm: 80 },
    ],
  },
  {
    id: 'dubstep', name: 'Dubstep', bpm: 140, swing: 0, kit: 'punchy', bass: 'wobble', fill: 'drop', beats: [
      { name: 'Halfstep', k: 'X.........X.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'B.....b...b.....' },
      { name: 'Wobble', k: 'X......x..X.....', s: '........X.......', h: '..x...x...x...x.', b: 'B.b.b.b.b.b.b.b.' },
      { name: 'Tribal', k: 'X.....x...x.....', s: '........X.......', t: '..o...x.....x.o.', p: 'x..x..x..x..x...', h: 'o.o.o.o.o.o.o.o.' },
      { name: 'Riddim', k: 'X..x......X..x..', s: '........X.......', h: '....x.......x.x.', b: 'B..b......B..b..' },
      { name: 'Garage step', k: 'X.....x...x.....', s: '........X.....o.', h: 'x.?x..x.x.?x..x.', r: '...o.......o....', b: 'B.....b...b..f..' },
      { name: 'Brostep', k: 'X.........X.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'B..b..b.B..b.bb.' },
      { name: 'Deep 140', k: 'X.....x...X.....', s: '........X.......', r: '..o.......o..o..', h: '..x...x...x...x.', b: 'B.........B.....' },
    ],
    versions: [
      { name: 'Deep halfstep', from: 'Halfstep', sound: 'Rolling sub', bass: 'sub', pat: 'hold' },
      { name: 'Foggy wobble', from: 'Wobble', sound: 'Fog machine', pat: 'pump' },
    ],
  },
  {
    id: 'dancehall', name: 'Dancehall', bpm: 96, swing: 0.1, kit: '808', bass: 'sub', fill: 'roll', beats: [
      { name: 'Dembow', k: 'X...X...X...X...', s: '...X..X....X..X.', h: 'x.x.x.x.x.x.x.x.', b: 'b...b...b...b..f' },
      { name: 'Bashment', k: 'X..X..X.X..X..X.', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', b: 'b..b..b.b..b..f.' },
      { name: 'Steppers', k: 'X...X...X...X...', s: '....X.......X...', r: '...x..x....x..x.', h: '..x...x...x...x.', b: 'b.....b.b.....b.' },
      { name: 'Reggaeton', k: 'X...X...X...X...', c: '...X..X....X..X.', h: 'x.x.x.x.x.x.x.x.', r: '..x.......x.....', b: 'b..b..b.b..b..b.' },
      { name: 'Moombahton', k: 'X...X...X...X...', s: '...X..X....X..X.', p: '..x...x...x...x.', o: '..............X.', b: 'b..b....b..b..u.' },
      { name: 'Sleng teng', k: 'X..x..x.X..x..x.', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b..b..b.b..b..b.' },
      { name: 'Afro-dancehall', k: 'X...X...X...X...', s: '...x..x....x..x.', p: 'x..x..x...x.x...', h: 'xoxoxoxoxoxoxoxo', b: 'b..b..b...b.b...' },
    ],
    versions: [
      { name: 'Island', from: 'Dembow', sound: 'Steel band', bpm: 100, kit: 'hand', bass: 'round' },
      { name: 'Slow wine', from: 'Bashment', bpm: 88, swing: 0.2, pat: 'hold' },
    ],
  },
  {
    id: 'rap', name: 'Rap & boom bap', bpm: 90, swing: 0.45, kit: 'lofi', bass: 'fingered', fill: 'toms', beats: [
      { name: 'Boom bap', kit: 'bap', k: 'X......x.x......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b......b.b......' },
      { name: 'Golden era', kit: 'vinyl', k: 'X.....x...X..x..', s: '....X..o.o..X...', h: 'xoxoxoxoxoxoxoxo', b: 'b.....b...b..f..' },
      { name: 'Lazy', k: 'X.......X.x.....', s: '....X.......X..o', h: 'x.x.x.x.x.x.x.x.', b: 'b.......b.b.....' },
      { name: 'Jazzy', kit: 'jazzclub', k: 'X......xX.......', s: '....X.......X...', r: '..o...o...o..o..', h: 'x.ox.ox.x.ox.ox.', b: 'b..t..f.b..t..f.' },
      { name: 'West coast', kit: '808', k: 'X.....x...x..x..', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..............X.', b: 'b.....bf..b..u..' },
      { name: 'Dusty break', k: 'X.X.......XX....', s: '....X..o.o..X..o', h: 'x.x.x.x.x.x.x.x.', b: 'b.b.......bb....' },
      { name: 'Head nod', kit: 'bap', k: 'X..x......X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b..b......b.....' },
      { name: 'G-funk', kit: '808', k: 'X.....x.X.......', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'b..u..b.f..b.u..' },
      { name: 'Half-time bap', kit: 'vinyl', k: 'X......x..x.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'b......b..b.....' },
    ],
    versions: [
      { name: 'Lo-fi bap', from: 'Boom bap', sound: 'Lo-fi study', bpm: 86, swing: 0.5, kit: 'lofi' },
      { name: 'Jazz cypher', from: 'Jazzy', sound: 'Vibes café', bpm: 92, kit: 'brush', bass: 'upright', pat: 'walk' },
    ],
  },
  {
    id: 'trap', name: 'Trap', bpm: 140, swing: 0, kit: 'trap', bass: '808', fill: 'hats', beats: [
      { name: 'Classic', k: 'X......X..X.....', c: '........X.......', h: 'x.x.x.x.x.x.3.x.', b: 'B......b..b.....' },
      { name: 'Rolling hats', k: 'X.........X..x..', c: '........X.......', h: 'xxx3xxx.x4xxx3x.', b: 'B.........B..b..' },
      { name: 'Triplet flow', k: 'X..X......X.....', c: '........X.......', h: 'x.x.3.x.x.x.3.3.', b: 'B..~......b.....' },
      { name: 'Dark', k: 'X.....X...X.....', c: '........X.......', h: 'x...x...x...x2x.', o: '......X.........', b: 'B.....~...b.....' },
      { name: 'Bounce', k: 'X..X..X...X.....', c: '....X.......X...', h: 'x.x.x.x.x2x.x.x.', b: 'B..b..b...b.....' },
      { name: 'Stutter', k: 'X.X.......X.X...', c: '........X.....o.', h: '4.x.x.x.4.x.x.3.', b: 'B.~.......B.~...' },
      { name: 'Melodic', k: 'X.......X.X.....', c: '........X.......', h: 'x.x.x.x.x.x.x.x.', o: '..............X.', b: 'B.......~.b.....' },
      { name: 'Rage', k: 'X.X...X...X.X...', c: '........X.......', h: 'xxxxxxxxxxxxxxxx', b: 'B.B...B...B.B...' },
      { name: 'Plugg', k: 'X.......X.......', c: '....X.......X...', h: 'x...x...x...x2..', b: 'B.......b.......' },
    ],
    versions: [
      { name: 'Space trap', from: 'Classic', sound: 'Deep space', bpm: 130, pat: 'hold' },
      { name: 'Fast trap', from: 'Rolling hats', bpm: 150 },
    ],
  },
  {
    id: 'drill', name: 'Drill', bpm: 142, swing: 0, kit: 'trap', bass: '808', fill: 'hats', beats: [
      { name: 'UK drill', k: 'X......x...X....', s: '........X..x....', h: 'x..x..x.x..x..x.', b: 'B.....~...~.b...' },
      { name: 'NY drill', k: 'X..x......X..x..', s: '........X.......', h: 'x..x..x.x2.x..x.', p: '...o......?.....', b: 'B..~......B..~..' },
      { name: 'Sliding', k: 'X..........X....', s: '........X.....X.', h: 'x..x..x.x..x.3x.', b: 'B..~..~...~..~..' },
      { name: 'Chicago drill', k: 'X...x.....x.....', s: '........X.......', h: 'x.x.x.x3x.x.x.x4', b: 'B...b.....b.....' },
      { name: 'Dark drill', k: 'X.......x.X.....', s: '........X....x..', h: 'x..x..x.x..x..3.', r: '...........o....', b: 'B.......~.B.....' },
      { name: 'Brooklyn bounce', k: 'X......X..X.....', s: '........X.....x.', h: 'x..x..x.x..x..x.', p: '..o.....o.......', b: 'B......~..B.....' },
      { name: 'Drill two-bar', k: 'X......x...X....X.........x..x..', s: '........X..x............X.......', h: 'x..x..x.x..x..x.', b: 'B.....~...~.b...B.........~..b..' },
    ],
    versions: [
      { name: 'UK drill choir', from: 'UK drill', sound: 'Cathedral', bpm: 140 },
      { name: 'UK drill night', from: 'UK drill', sound: 'Night drive', bpm: 144 },
      { name: 'Slow drill', from: 'Dark drill', sound: 'Fog machine', bpm: 136, pat: 'hold' },
    ],
  },
  {
    id: 'dnb', name: 'Drum & bass', bpm: 172, swing: 0, kit: 'jungle', bass: 'reese', fill: 'roll', beats: [
      { name: 'Two-step', k: 'X.........X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B.........b.....' },
      { name: 'Amen chop', k: 'X.X.......XX....', s: '....X..o.o..X..o', h: 'x.x.x.x.x.x.x.x.', b: 'B.........B.....' },
      { name: 'Rollers', k: 'X.........X.....', s: '....X..o....X.o.', h: 'xoxoxoxoxoxoxoxo', b: 'B.b.....b.b.....' },
      { name: 'Liquid', k: 'X.........x.....', s: '....X.......X...', r: '..o.....o.....o.', h: 'x.?.x.?.x.?.x.?.', b: 'B.......f.b.....' },
      { name: 'Jungle', k: 'X.x...x...x.....', s: '....X..o.o..X..o', h: 'x?x?x?x?x?x?x?x?', t: '..............x.', b: 'B.....b...B.....' },
      { name: 'Halftime', k: 'X.........X.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'B.........b..b..' },
      { name: 'Steppa', k: 'X.........X.....', s: '....X.......X...', h: '..x...x...x...x.', p: '.......o......o.', b: 'B..b......B..b..' },
      { name: 'Minimal roller', k: 'X.........X.....', s: '....X.......X...', r: '..o..o....o..o..', h: 'xoxoxoxoxoxoxoxo', b: 'B.........b.....' },
    ],
    versions: [
      { name: 'Liquid lights', from: 'Liquid', sound: 'Northern lights', bpm: 174, bass: 'round', pat: 'walk' },
      { name: 'Jump up', from: 'Two-step', sound: 'Acid techno', bpm: 175, bass: 'wobble', pat: 'pump' },
      { name: 'Neuro', from: 'Rollers', sound: 'Rolling sub', pat: 'pump' },
    ],
  },
  {
    id: 'idm', name: 'IDM', bpm: 110, swing: 0, kit: 'glitch', bass: 'fm', fill: 'glitch', beats: [
      { name: 'Polymeter', k: 'X..x.', s: '...X...', h: 'x.?', p: 'o..?..o.?..o.', b: 'b....f...' },
      { name: 'Stutter', k: 'X.....x2..X.....', s: '....X..3....X.4.', h: 'x?x?x?x?x?x?x?x?', b: 'b.....b...b.....' },
      { name: 'Broken', k: 'X..x...x..X.....', s: '....X.....?.X...', h: '2.x.?.x.x.?.3.x.', r: '.o.....o.....o..', b: 'b..b......f..b..' },
      { name: 'Cloud', k: 'X...?...?...?.?.', s: '!.!.X.!.!.!.X.!.', h: '????????????????', p: '!!!!!!!!!!!!!!!!', b: 'b.......?.......' },
      { name: 'Seven', k: 'X.....X.......', s: '....X......X..', h: 'x.x.x.x.x.x.x.', r: 'o..o..o..o..o..o..o..', b: 'b......f......' },
      { name: 'Drill and bass', k: 'X.xX..x.X..x.x..', s: '....X2..3...X..4', h: 'x2x2x2x2x2x2x2x2', b: 'b.bb..b.b..b.b..' },
      { name: 'Fives', k: 'X....', s: '..x......x', h: 'x.x', p: 'o...?..', b: 'b...b..' },
      { name: 'Skitter', k: 'X..x.....x..x...', s: '....x..2....x.3.', h: 'x3x.xx2.x3x.xx4.', b: 'b..b.....b..b...' },
    ],
    versions: [
      { name: 'Rain glitch', from: 'Cloud', sound: 'Rain on glass', bpm: 96 },
      { name: 'Chip glitch', from: 'Stutter', sound: 'Chiptune', bpm: 120, bass: 'pulse' },
    ],
  },
  {
    id: 'afro', name: 'Afro & Latin', bpm: 104, swing: 0.1, kit: 'linn', bass: 'round', fill: 'toms', beats: [
      { name: 'Afrobeats', k: 'X..x..X...X.....', c: '....X.......X...', r: '...x..x....x..x.', h: 'xoxoxoxoxoxoxoxo', b: 'b..b..b...b..b..' },
      { name: 'Amapiano', k: 'X...X...X...X...', r: '...x..x...x..x..', h: 'x.x.x.x.x.x.x.x.', p: '..o..o....o..o..', b: 'B.....b..b...f..' },
      { name: 'Samba', k: 'x...X...x...X...', p: 'xoxxxoxxxoxxxoxx', r: 'X..X..X...X..X..', b: 'b...f...b...f...' },
      { name: 'Bossa', k: 'X..x....X..x....', r: 'x..x..x...x..x..', h: 'x.x.x.x.x.x.x.x.', b: 'b..f....b..f....' },
      { name: 'Son clave', k: '...x.......x....', r: 'X..X..X...X.X...', p: 'x.x.x.x.x.x.x.x.', t: 'o..x.ox.o..x.ox.', b: '...b..b....b..f.' },
      { name: 'Highlife', k: 'X.......X.......', r: 'x.x..x.x.x..x.x.', h: '..x...x...x...x.', p: 'o.oo.oo.o.oo.oo.', b: 'b..b..f.b..b..f.' },
      { name: 'Kuduro', k: 'X..X..X.X..X..X.', c: '....X.......X...', p: 'x.xx.xx.x.xx.xx.', h: 'x.x.x.x.x.x.x.x.', b: 'B..b..b.B..b..b.' },
      { name: 'Cumbia', k: 'X.......X.......', s: '....x.......x...', p: 'x.xxx.xxx.xxx.xx', h: '..x...x...x...x.', b: 'b...f...b...f...' },
      { name: 'Tumbao', k: 'X.......X.......', r: 'x..x...x..x.x...', t: '...x..x....x..x.', h: 'x.x.x.x.x.x.x.x.', b: '...b..b....b..b.' },
    ],
    versions: [
      { name: 'Marimba party', from: 'Afrobeats', sound: 'Marimba party', bpm: 108 },
      { name: 'Bossa lounge', from: 'Bossa', sound: 'Bossa nova', bpm: 92, kit: 'brush', bass: 'upright', pat: 'walk' },
      { name: 'Gamelan clave', from: 'Son clave', sound: 'Gamelan', bpm: 96, kit: 'hand' },
    ],
  },
  {
    id: 'breaks', name: 'Breaks & funk', bpm: 100, swing: 0.2, kit: 'linn', bass: 'slap', fill: 'toms', beats: [
      { name: 'Funk break', k: 'X.X.......X..X..', s: '....X..o.o.oX..o', h: 'xxxxxxxoxxxxxxxx', b: 'b.b.......b..f..' },
      { name: 'Big beat', k: 'X.........X.X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..............X.', b: 'B.........b.b...' },
      { name: 'Electro', k: 'X......X..X.....', c: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', b: 'b......b..b..b..' },
      { name: 'Miami bass', k: 'X......X..X.....', c: '....X.......X...', h: 'XoxoXoxoXoxoXoxo', b: 'B......b..B.....' },
      { name: 'Breakbeat', k: 'X.........X..X..', s: '....X..o....X...', h: 'x.x.x.x.x.x.x.x.', o: '......X.........', b: 'b.........b..b..' },
      { name: 'Nu skool', k: 'X.........X.X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '......X.......X.', b: 'B.........b.b...' },
      { name: 'Think break', k: 'X.x.......x.....', s: '....X..o.x..X..o', h: 'x.x.x.x.x.x.x.x.', b: 'b.b.......b.....' },
    ],
    versions: [
      { name: 'Arcade electro', from: 'Electro', sound: 'Arcade', bpm: 118, bass: 'pulse' },
      { name: 'Disco funk', from: 'Funk break', sound: 'Fuzz garage', bpm: 110, pat: 'offbeat' },
    ],
  },
  {
    id: 'lofi', name: 'Lo-fi', bpm: 80, swing: 0.5, kit: 'lofi', bass: 'round', fill: 'drop', beats: [
      { name: 'Lazy', k: 'X.......X.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b.......b.b.....' },
      { name: 'Chillhop', k: 'X..x......X.....', s: '....X.......X...', h: 'xox.xox.xox.xox.', r: '.......o......o.', b: 'b..t......f.....' },
      { name: 'Rainy', k: 'X.........x.....', s: '....X.......X..o', h: '..x...x...x...x.', p: '?...?...?...?...', b: 'b.........f.....' },
      { name: 'Tape', k: 'X.....x.X.......', s: '....X..o....X...', h: 'xoxoxoxoxoxoxoxo', b: 'b.....b.b.......' },
      { name: 'Off-grid', k: 'X......xx.....x.', s: '....X.......X...', h: 'x.xx.x.xx.x.x.xx', b: 'b......bb.....b.' },
      { name: 'Bedroom', k: 'X.....x.........', s: '....X.......X...', r: '..........o.....', h: '..x...x...x...x.', b: 'b.....b.........' },
      { name: 'Sleepy', k: 'X.........X.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'b.........b.....' },
      { name: 'Vinyl swing', k: 'X..x......X..x..', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', b: 'b..t......b..f..' },
    ],
    versions: [
      { name: 'Café', from: 'Chillhop', sound: 'Vibes café', bpm: 84, kit: 'brush', bass: 'upright', pat: 'walk' },
      { name: 'Foggy tape', from: 'Tape', sound: 'Fog machine', bpm: 72, pat: 'hold' },
    ],
  },
  {
    id: 'trance', name: 'Trance', bpm: 138, swing: 0, kit: 'techno', bass: 'synth', fill: 'roll', beats: [
      { name: 'Uplifting', k: 'X...X...X...X...', c: '....x.......x...', h: '..x...x...x...x.', o: '..X...X...X...X.', b: '..bu..bu..bu..bu' },
      { name: 'Psytrance', k: 'X...X...X...X...', h: '..x...x...x...x.', r: '...o...o...o...o', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Progressive', k: 'X...X...X...X...', c: '....x.......x...', h: '..x...x...x...x.', r: '......x.......x.', b: '..b...b...b..fb.' },
      { name: 'Breakdown', h: '....x.......x...', r: '..............o.', b: 'B...............' },
      { name: 'Rolling', k: 'X...X...X...X...', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', o: '..X...X...X...X.', b: '.bfb.bfb.bfb.bfb' },
      { name: 'Hard trance', k: 'X...X...X...X...', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', o: '..X...X...X...X.', b: '.bbu.bbu.bbu.bbu' },
      { name: 'Tech trance', k: 'X...X...X...X...', c: '....x.......x...', h: '..x...x...x...x.', r: '.x..x.x..x..x.x.', b: '..bb..bb..bb..bb' },
      { name: 'Balearic', k: 'X.......X.......', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', p: '...?.......?....', b: 'b...b...b...b...' },
    ],
    versions: [
      { name: 'Euphoric', from: 'Uplifting', sound: 'Northern lights', pat: 'offbeat' },
      { name: 'Goa', from: 'Psytrance', sound: 'Acid techno', bpm: 145, bass: 'acid' },
    ],
  },
  {
    id: 'triphop', name: 'Trip-hop', bpm: 84, swing: 0.25, kit: 'lofi', bass: 'round', fill: 'drop', beats: [
      { name: 'Bristol', k: 'X......X..X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b......b..b.....' },
      { name: 'Heavy', k: 'X.......X.X.....', s: '....X.......X..o', h: 'x.xox.xox.xox.xo', b: 'B.......b.b.....' },
      { name: 'Downtempo', k: 'X.....x...X.....', r: '....x.......x...', h: '..x...x...x...x.', p: '?.......?.......', b: 'b.....f...b.....' },
      { name: 'Slow break', k: 'X.X.......X.....', s: '....X..o....X...', h: 'xoxoxoxoxoxoxoxo', b: 'b.b.......b.....' },
      { name: 'Noir', k: 'X.......X.X.....', s: '....X.......X...', h: 'x...x...x...x...', r: '......o.......o.', b: 'b.......b.b.....' },
      { name: 'Hip-hop dub', k: 'X.....x.X.....x.', s: '....X.......X...', h: 'x.xox.xox.xox.xo', b: 'b.....b.b.....b.' },
      { name: 'Slow motion', k: 'X.........X.....', s: '........X.......', h: 'x...x...x...x...', p: '?.......?.......', b: 'b.........b.....' },
    ],
    versions: [
      { name: 'Smoky', from: 'Bristol', sound: 'Fog machine', bpm: 78, kit: 'dub' },
      { name: 'Cinematic', from: 'Heavy', sound: 'Cathedral', pat: 'hold' },
    ],
  },
  {
    id: 'phonk', name: 'Phonk', bpm: 130, swing: 0, kit: '808', bass: '808', fill: 'hats', beats: [
      { name: 'Memphis', k: 'X.....X...X.....', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: 'x..x..x...x..x..', b: 'B.....~...b.....' },
      { name: 'Drift phonk', k: 'X..X..X...X..X..', c: '....X.......X...', h: 'x3x.x3x.x3x.x3x.', p: 'x.xx.x.xx.x.x.xx', b: 'B..~..B...~..B..' },
      { name: 'Brazilian phonk', k: 'X..X..X.X..X..X.', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: '..x...x...x...x.', b: 'B..b..b.B..b..b.' },
      { name: 'Slow phonk', k: 'X.......X.x.....', c: '........X.......', h: 'x.x.x.x.x.x.x.x.', p: 'x.....x...x.....', b: 'B.......~.b.....' },
      { name: 'Cowbell', k: 'X..X......X.....', c: '....X.......X...', p: 'x.x.xx.xx.x.xx.x', h: 'x.x.x.x.x.x.x.x.', b: 'B..b......B.....' },
      { name: 'House phonk', k: 'X...X...X...X...', c: '....X.......X...', p: '..x...x...x...x.', h: 'xxxxxxxxxxxxxxxx', b: 'B...B...B...B...' },
      { name: 'Rattle', k: 'X.....X...X.....', c: '........X.......', h: 'x.3.x.3.x.3.x.4.', p: 'x.....x...x.....', b: 'B.....B...B.....' },
    ],
    versions: [
      { name: 'Midnight drift', from: 'Drift phonk', sound: 'Night drive', bpm: 140 },
      { name: 'Haunted', from: 'Memphis', sound: 'Cathedral', bpm: 120 },
    ],
  },
  {
    id: 'jersey', name: 'Jersey club', bpm: 140, swing: 0, kit: 'trap', bass: '808', fill: 'roll', beats: [
      { name: 'Jersey bounce', k: 'X..X..X...X.X.X.', c: '....X.......X...', h: '..x...x...x...x.', b: 'B..b..b...b.b.b.' },
      { name: 'Bed squeak', k: 'X..X..X...X.X.X.', c: '..X...X...X...X.', p: '...x......x..x..', b: 'B..b..b...b.....' },
      { name: 'Baltimore', k: 'X..X..X.X...X...', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B..b..b.b...b...' },
      { name: 'Footwork', k: 'X..X..X..X..X..X', c: '........X.......', h: 'x.x.x.x.x.x.x.x.', t: '..........x..x..', b: 'B.........b.....' },
      { name: 'Five kick', k: 'X..X..X.X.X.....', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B..b..b.b.b.....' },
      { name: 'Club stutter', k: 'X..X..X...X.X.X.', c: '....X..x....X...', h: 'x.x.x.x.x.x.x.x.', b: 'B..b..b...b.b.b.' },
      { name: 'Philly club', k: 'X..X..X.X..X..X.', c: '....X.......X...', h: '..x...x...x...x.', b: 'B..b..b.B..b..b.' },
    ],
    versions: [
      { name: 'Juke 160', from: 'Footwork', sound: 'Scanner', bpm: 160, kit: '808' },
      { name: 'Club anthem', from: 'Jersey bounce', sound: 'House', bpm: 145 },
    ],
  },
  {
    id: 'synthwave', name: 'Synthwave', bpm: 100, swing: 0, kit: 'linn', bass: 'synth', fill: 'toms', beats: [
      { name: 'Outrun', k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b.b.b.b.b.b.b.b.' },
      { name: 'Gated', k: 'X.......X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', t: '..............x.', b: 'b.b.b.b.b.b.b.b.' },
      { name: 'Darksynth', k: 'X..X..X.X..X..X.', s: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', b: 'bbbbbbbbbbbbbbbb' },
      { name: 'Dreamwave', k: 'X.......X.x.....', s: '....X.......X...', h: '..x...x...x...x.', b: 'b.......b.f.....' },
      { name: 'Retro funk', k: 'X.....x.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b.bb.bb.b.bb.bb.' },
      { name: 'Chase', k: 'X...X...X...X...', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'bubububububububu' },
      { name: 'Slow burn', k: 'X.......X.......', s: '....X.......X...', t: '..............xx', h: '..x...x...x...x.', b: 'b.......b.......' },
    ],
    versions: [
      { name: 'Night drive', from: 'Outrun', sound: 'Night drive', bpm: 96 },
      { name: 'Arcade run', from: 'Darksynth', sound: 'Chiptune', bpm: 118, bass: 'pulse' },
    ],
  },
  {
    id: 'jazz', name: 'Jazz', bpm: 120, swing: 0.6, kit: 'brush', bass: 'upright', fill: 'toms', beats: [
      { name: 'Swing', r: 'x...x.x.x...x.x.', h: '....x.......x...', k: 'o...o...o...o...', s: '......o.......o?', b: 'b...t...f...u...' },
      { name: 'Ballad', s: 'o.o.o.o.o.o.o.o.', h: '....x.......x...', k: 'o.......o.......', b: 'b.......f.......' },
      { name: 'Bebop', r: 'x...x.x.x...x.x.', h: '....x.......x...', s: '..o..?....o..o..', k: 'o.....o.....x...', b: 'b...t...f...t...' },
      { name: 'Waltz', r: 'x...x.x...x.', k: 'o...........', h: '....x...x...', b: 'b...f...t...' },
      { name: 'Shuffle', k: 'X.......X.......', s: '....X.......X...', h: 'x..xx..xx..xx..x', r: '...o.......o....', b: 'b...t...f...t...' },
      { name: 'Jazz funk', k: 'X.....x...X.....', s: '....X..o.o..X...', h: 'x.xxx.xxx.xxx.xx', b: 'b.....b...b..f..' },
      { name: 'Brushes', k: 'X.......X.......', s: 'oooooooooooooooo', h: '....x.......x...', b: 'b...t...f...u...' },
      { name: 'Latin jazz', k: 'X..x..x.X..x..x.', r: 'x..x...x..x.x...', h: 'x.x.x.x.x.x.x.x.', b: 'b..b...b..b.b...' },
    ],
    versions: [
      { name: 'Late night', from: 'Ballad', sound: 'Blues bar', bpm: 72 },
      { name: 'Hard bop', from: 'Bebop', sound: 'Vibes café', bpm: 168 },
    ],
  },
  {
    id: 'garage', name: 'UK garage', bpm: 132, swing: 0.3, kit: '909', bass: 'synth', fill: 'roll', beats: [
      { name: '2-step', k: 'X......x..X.....', s: '....X.......X...', h: '..x.o.x...x.o.x.', r: '.......o.......o', b: 'b.....b...b..u..' },
      { name: 'Speed garage', k: 'X...X...X...X...', s: '....X.......X...', h: '..x...x...x...x.', o: '..X...X...X...X.', b: 'B..b..u.B..b..u.' },
      { name: 'Grime', k: 'X.......X.....x.', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B.......~.....b.' },
      { name: 'Bassline', k: 'X...X...X...X...', c: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', b: 'b.ub.ub.b.ub.ub.' },
      { name: 'Shuffled', k: 'X.........X.....', s: '....X.......X...', h: '.x.x.x.x.x.x.x.x', r: '..o...o.....o...', b: 'b.........b..b..' },
      { name: '4x4 garage', k: 'X...X...X...X...', s: '....X.......X...', h: '..x...x...x...x.', r: '.......o......o.', b: '..b...bb..b...bb' },
      { name: 'Breakstep', k: 'X.......X.X.....', s: '....X.......X..o', h: 'x.x.x.x.x.x.x.x.', b: 'B.......b.b.....' },
    ],
    versions: [
      { name: 'Grime 140', from: 'Grime', sound: 'Trap haze', bpm: 140, kit: 'punchy', bass: 'sub', swing: 0 },
      { name: 'Sunday garage', from: '2-step', sound: 'Vibes café', bpm: 130 },
    ],
  },
  {
    id: 'disco', name: 'Disco', bpm: 118, swing: 0.1, kit: 'linn', bass: 'fingered', fill: 'toms', beats: [
      { name: 'Disco', k: 'X...X...X...X...', s: '....X.......X...', h: 'x.o.x.o.x.o.x.o.', o: '..X...X...X...X.', b: 'b.u.b.u.b.u.b.u.' },
      { name: 'Nu-disco', k: 'X...X...X...X...', c: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', p: '..x...x...x...x.', b: 'b..bu..bb..bu..b' },
      { name: 'French touch', k: 'X...X...X...X...', c: '....x.......x...', h: '..x...x...x...x.', b: 'b.bb.bb.b.bb.bb.' },
      { name: 'Italo', k: 'X...X...X...X...', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'bubububububububu' },
      { name: 'Philly', k: 'X...X...X...X...', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', o: '..X...X...X...X.', b: 'b.ub.ub.b.ub.ub.' },
      { name: 'Boogie', k: 'X.....x.X.......', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b..b..b.f..f..u.' },
      { name: 'Hi-NRG', k: 'X...X...X...X...', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'bubububububububu' },
    ],
    versions: [
      { name: 'Mirror ball', from: 'Disco', sound: 'Gospel organ', bpm: 116 },
      { name: 'Space disco', from: 'Italo', sound: 'Synthwave', bpm: 120, bass: 'synth' },
    ],
  },
  {
    id: 'hyperpop', name: 'Hyperpop', bpm: 160, swing: 0, kit: 'glitch', bass: '808', fill: 'glitch', beats: [
      { name: 'Bubblegum', k: 'X.....x...X.....', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B.....b...~.....' },
      { name: 'Glitchcore', k: 'X.x...xX..X.x...', s: '....X..3....X.4.', h: 'x2x.x2x.x2x.x2x.', b: 'B.b...bB..B.b...' },
      { name: 'Digicore', k: 'X......X..X.....', c: '....X.......X...', h: 'x.x.3.x.x.x.3.x.', b: 'B......~..b.....' },
      { name: 'Blown out', k: 'X.X...X...X.X...', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'B.B...B...B.B...' },
      { name: 'Hyper trap', k: 'X......X..X.....', c: '........X.......', h: 'x.x3x.x4x.x3x.x4', b: 'B......~..B.....' },
      { name: 'Pop punk', k: 'X.X.....X.X.....', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', y: 'X...............', b: 'b.b.b.b.b.b.b.b.' },
    ],
    versions: [
      { name: 'Sugar rush', from: 'Bubblegum', sound: 'Chiptune', bpm: 170, kit: 'trap' },
      { name: 'Crystal', from: 'Digicore', sound: 'Music box night', bpm: 150 },
    ],
  },
  {
    id: 'baile', name: 'Baile funk', bpm: 130, swing: 0, kit: '808', bass: '808', fill: 'drop', beats: [
      { name: 'Tamborzão', k: 'X..X..X...X..X..', c: '....X.......X...', t: '..x.....x..x....', b: 'B..b..b...b..b..' },
      { name: 'Mandelão', k: 'X.......X.......', p: '..x.x..x..x.x..x', c: '....X.......X...', b: 'B.......B.......' },
      { name: 'Funk carioca', k: 'X..X..X.X..X..X.', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B..b..b.B..b..b.' },
      { name: 'Bruxaria', k: 'X..X..X...X..X..', c: '...x..x....x..x.', h: 'x.x.x.x.x.x.x.x.', b: 'B..B..B...B..B..' },
      { name: 'Montagem', k: 'X..X..X.X..X..X.', c: '....X.......X...', p: '..x.....x..x....', b: 'B..b..b.B..b..b.' },
      { name: 'Funk 150', k: 'X..X..X...X.....', s: '...X..X....X..X.', h: 'x.x.x.x.x.x.x.x.', b: 'B.........B.....' },
    ],
    versions: [
      { name: 'Favela night', from: 'Mandelão', sound: 'Trap haze', bpm: 135 },
      { name: 'Beach party', from: 'Funk carioca', sound: 'Marimba party', bpm: 128, kit: 'hand' },
    ],
  },
  {
    id: 'gqom', name: 'Gqom', bpm: 126, swing: 0, kit: 'techno', bass: 'sub', fill: 'toms', beats: [
      { name: 'Gqom', k: 'X..X..X.........', t: '...x..x...x..x..', h: '..x...x...x...x.', b: 'B.........b.....' },
      { name: 'Sgubhu', k: 'X..X..X...X.....', p: 'x..x..x.x..x..x.', r: '....x.......x...', b: 'B.....b...b.....' },
      { name: 'Durban', k: 'X.....X.....X...', t: '..x..x..x..x..x.', h: 'xoxoxoxoxoxoxoxo', b: 'B.....b.....b...' },
      { name: 'Broken gqom', k: 'X..X.....X..X...', t: '..x..x..x.....x.', h: '..x...x...x...x.', b: 'B........b......' },
      { name: 'Tribal gqom', k: 'X..X..X.........', p: 'x.xx.x.xx.x.xx.x', r: '....x.......x...', b: 'B.....b.........' },
      { name: 'Gqom tech', k: 'X...X...X..X..X.', t: '..x...x...x.....', h: '..x...x...x...x.', b: 'B...b...b..b....' },
    ],
    versions: [
      { name: 'Dark gqom', from: 'Gqom', sound: 'Fog machine', bpm: 122, kit: 'hard' },
      { name: 'Taxi', from: 'Durban', sound: 'Kalimba campfire', bpm: 128, kit: 'hand' },
    ],
  },
  {
    // The kick on every beat and a rolling bass in the three steps between.
    // Suomisaundi is the Finnish freeform kind: wonky, playful, full of squelch.
    id: 'psy', name: 'Psytrance', bpm: 145, swing: 0, kit: 'techno', bass: 'pulse', fill: 'roll', beats: [
      { name: 'Full on', k: 'X...X...X...X...', c: '....x.......x...', h: '..x...x...x...x.', r: '.......o.......x', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Night', k: 'X...X...X...X...', h: 'xoxxxoxxxoxxxoxx', p: '.....?.......?..', b: '.bbb.bbb.bbb.bfb' },
      { name: 'Forest', k: 'X...X...X...X...', h: '..x...x...x...x.', t: '...o......o.....', p: '..?..?...?..?...', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Goa', k: 'X...X...X...X...', c: '....x.......x...', o: '..X...X...X...X.', b: '.bub.bub.bub.bub' },
      { name: 'Progressive', k: 'X...X...X...X...', h: '..x...x...x...x.', r: '......x.......x.', b: '..bb..bb..bb..bb' },
      { name: 'Suomisaundi', k: 'X...X...X...X...', h: '..x.?.x...x.?.xx', p: '...x.?....x..?..', r: '.o.....o..o.....', t: '.............2..', b: '.bbb.b~b.bbb.ubf' },
      { name: 'Morning', k: 'X...X...X...X...', h: '..x...x...x...x.', o: '......x.......x.', p: '....x.......x...', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Gallop', k: 'X...X...X...X...', h: '..x...x...x...x.', b: '.b.b.b.b.b.b.b.b' },
      { name: 'Triplet roll', k: 'X...X...X...X...', h: '..x...x...x...x3', c: '............x...', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Offbeat bounce', k: 'X...X...X...X...', h: '..x...x..x..x...', p: '.?...?.x...?...x', t: '......o.........', b: '.bb..bbb.b.b.bbb' },
      { name: 'Peak', k: 'X...X...X...X...', c: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', o: '..x...x...x...x.', r: '...............x', b: '.bbb.bbb.bbb.bub' },
      { name: 'Breakdown', h: '....x.......x...', r: '..............o.', b: 'B...............' },
    ],
    versions: [
      { name: 'Suomi freeform', from: 'Suomisaundi', sound: 'Suomisaundi', bpm: 148, kit: 'glitch', bass: 'acid' },
      { name: 'Acid goa', from: 'Goa', sound: 'Acid techno', bpm: 142, bass: 'acid' },
      { name: 'Twilight', from: 'Night', sound: 'Deep space', bpm: 147, bass: 'reese' },
    ],
  },
  {
    // Folktronica: hands, wood and shakers instead of a drum machine, with
    // small glitches and stutters in the hats; plucked strings on top.
    id: 'folktronica', name: 'Folktronica', bpm: 112, swing: 0.15, kit: 'hand', bass: 'round', fill: 'glitch', beats: [
      { name: 'Campfire', k: 'X.....x...X.....', s: '....o.......o...', h: 'x.o.x.o.x.o.x.o.', p: '..x....x..x...x.', b: 'b.....b...b.....' },
      { name: 'Wooden', k: 'X..x....X.......', r: '....X.......X..o', h: 'xoxoxoxoxoxoxoxo', p: 'x..x..x...x..x..', b: 'b..b....b.......' },
      { name: 'Glitch folk', k: 'X.....x.X.......', s: '....x.......x...', h: 'x.x2x.x.x.x2x.x3', r: '...o......o..o..', b: 'b.....b.b.......', kit: 'glitch' },
      { name: 'Rounds', k: 'X.......X.......', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', p: 'x..x..x', b: 'b.......f.......' },
      { name: 'Stomp and clap', k: 'X...X...X...X...', c: '....x.......x...', h: '..o...o...o...o.', p: '...x.......x..x.', b: 'b...b...b...b...' },
      { name: 'Slow stream', k: 'X.........X.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', p: 'o.o.x.o.o.o.x.o.', b: 'b.........b.....' },
      { name: 'Tape loop', k: 'X......X..X.....', s: '....x.......x..o', h: 'x?x.x?x.x?x.x?x.', r: '......o.......o.', b: 'b......b..b.....', kit: 'tape' },
    ],
    versions: [
      { name: 'Forest glitch', from: 'Glitch folk', sound: 'Flute forest', bpm: 118, kit: 'glitch' },
      { name: 'Porch at dusk', from: 'Campfire', sound: 'Kalimba campfire', bpm: 104, kit: 'afroperc' },
    ],
  },
  {
    id: 'crunk', name: 'Crunk', bpm: 76, swing: 0, kit: '808', bass: '808', fill: 'hats', beats: [
      { name: 'Crunk', k: 'X.....X...X.....', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B.....b...B.....' },
      { name: 'Stomp', k: 'X..X..X.X.......', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..............X.', b: 'B..b..b.B.......' },
      { name: 'Get low', k: 'X.......X..X....', c: '....X.......X...', h: 'xxx.xxx.xxx.xxx.', b: 'B.......B..b....' },
      { name: 'Snap', k: 'X.........X.....', c: '....X.......X...', h: '....x.......x...', r: '..x.......x.....', b: 'B.........b.....' },
      { name: 'Club', k: 'X...X...X...X...', c: '....X.......X...', h: 'x2x.x2x.x2x.x2x.', b: 'B...b...B...b...' },
    ],
  },
  {
    id: 'screwed', name: 'Chopped & screwed', bpm: 64, swing: 0.1, kit: '808', bass: '808', fill: 'drop', beats: [
      { name: 'Screwed', k: 'X.......X.X.....', s: '....X.......X...', h: 'x...x...x...x...', b: 'B.......~.b.....' },
      { name: 'Syrup', k: 'X.....X...X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B.....~...b.....' },
      { name: 'Slowed', k: 'X.........X.....', s: '....X.......X...', h: 'x.......x.......', r: '......o.......o.', b: 'B.........~.....' },
      { name: 'Candy paint', k: 'X..x......X.....', c: '....X.......X...', h: 'x.xxx.x.x.xxx.x.', b: 'B..b......b.....' },
    ],
  },
  {
    id: 'hyphy', name: 'Hyphy', bpm: 100, swing: 0.1, kit: 'punchy', bass: '808', fill: 'hats', beats: [
      { name: 'Hyphy', k: 'X..X..X...X.X...', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B..b..b...b.b...' },
      { name: 'Thizz', k: 'X.X...X...X.X...', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'B.b...b...b.b...' },
      { name: 'Bay slap', k: 'X..X.X....X..X..', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: '..x.....x.......', b: 'B..b.b....b..b..' },
      { name: 'Ghost ride', k: 'X.....X.X.......', c: '....X..x....X...', h: 'x.x.x.x.x.x.x.x.', o: '......X.......X.', b: 'B.....b.b.......' },
    ],
  },
  {
    id: 'grime', name: 'Grime', bpm: 140, swing: 0, kit: 'glitch', bass: 'sub', fill: 'glitch', beats: [
      { name: 'Grime', k: 'X.........X.....', s: '........X.......', h: '..x...x...x...x.', b: 'B.....~...b.....' },
      { name: 'Eskibeat', k: 'X.....X...X.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', p: '...x......x..x..', b: 'B.....b...b.....' },
      { name: 'Sino', k: 'X..X......X.....', c: '........X.......', h: '..x...x...x...x.', r: '.x......x.x.....', b: 'B..b......b.....' },
      { name: 'Riddim', k: 'X.........X..X..', s: '........X.......', h: 'x.xxx.xxx.xxx.xx', b: 'B.........b..b..' },
      { name: 'Gunshot', k: 'X.....X.X.......', s: '........X.......', t: '............2...', h: 'x...x...x...x...', b: 'B.....b.b.......' },
    ],
  },
  {
    id: 'detroit', name: 'Detroit', bpm: 100, swing: 0.05, kit: '808', bass: '808', fill: 'hats', beats: [
      { name: 'Detroit', k: 'X..X..X.X..X..X.', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'b..b..b.b..b..b.' },
      { name: 'Bounce', k: 'X.XX..X.X.XX..X.', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b.bb..b.b.bb..b.' },
      { name: 'Flint', k: 'X..X..X...X..X..', c: '....X.......X...', h: 'xxx.xxx.xxx.xxx.', o: '..............x.', b: 'B..b..b...b..b..' },
      { name: 'Scam', k: 'X.X..X.XX.X..X..', c: '....X.......X...', h: 'x.x.x.x.x2x.x.x.', b: 'b.b..b.bb.b..b..' },
    ],
  },
  {
    id: 'cloud', name: 'Cloud rap', bpm: 70, swing: 0.05, kit: 'trap', bass: '808', fill: 'drop', beats: [
      { name: 'Cloud rap', k: 'X.........X.....', c: '........X.......', h: 'x...x...x...x.x.', b: 'B.........~.....' },
      { name: 'Haze', k: 'X.......X.......', c: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'B.......~.......' },
      { name: 'Drift', k: 'X.....X...X.....', c: '........X.......', h: 'x...x.x.x...x.x.', r: '...o.......o....', b: 'B.....b...~.....' },
      { name: 'Vapor', k: 'X.........X..x..', c: '........X.......', h: 'x?x?x?x?x?x?x?x?', b: 'B.........b..b..' },
    ],
  },
  {
    id: 'beattape', name: 'Beat tape', bpm: 88, swing: 0.5, kit: 'vinyl', bass: 'fingered', fill: 'toms', beats: [
      { name: 'Beat tape', k: 'X.....x.X..x....', s: '....X..o....X.o.', h: 'x.ox.ox.x.ox.ox.', b: 'b.....b.b..f....' },
      { name: 'Dilla', k: 'X.....xx..X.....', s: '....X.......X.o.', h: 'x.xxx.xxx.xxx.x.', b: 'b.....bb..b.....' },
      { name: 'Sample chop', k: 'X..x...xX.......', s: '....X......oX...', h: 'x.x.x.x.x.x.x.x.', b: 'b..b...bb.......' },
      { name: 'Loop dig', k: 'X.......X.x.....', s: '....X.......X...', r: '..o.....o...o...', h: 'x.ox.ox.x.ox.ox.', b: 'b.......b.b.....' },
      { name: 'Instrumental', kit: 'jazzclub', k: 'X......xX.......', s: '....X.......X...', h: 'xoxxxoxxxoxxxoxx', b: 'b..t..f.b..t..f.' },
    ],
  },
  {
    id: 'memphis', name: 'Memphis rap', bpm: 72, swing: 0, kit: '808', bass: '808', fill: 'hats', beats: [
      { name: 'Memphis rap', k: 'X..X......X.X...', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: 'x..x..x...x..x..', b: 'B..b......~.b...' },
      { name: 'Tape hiss', kit: 'tape', k: 'X.....X...X.....', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: 'x..x..x...x..x..', b: 'B.....b...b.....' },
      { name: 'Cowbell', k: 'X..X..X...X.....', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', p: 'x.xx.x.xx.xx.x.x', b: 'B..b..b...b.....' },
      { name: 'Dark side', k: 'X.........X.X...', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '......X.........', p: '..x.......x.....', b: 'B.........~.b...' },
    ],
  },
  {
    id: 'industrial', name: 'Industrial techno', bpm: 135, swing: 0, kit: 'hard', bass: 'fuzz', fill: 'roll', beats: [
      { name: 'Factory', k: 'X...X...X...X...', s: '....X.......X...', h: 'XoxoXoxoXoxoXoxo', p: '...x.....x....x.', b: 'b..b..b...b..b..' },
      { name: 'Metal', k: 'X..xX...X..xX...', c: '....X.......X...', h: '..x...x...x...x.', p: 'x.x...x.x.x...x.', b: '..b...b...b...b.' },
      { name: 'Rust', k: 'X...X...X...X.x.', h: 'x.xxx.xxx.xxx.xx', t: '.......o.......o', p: '.....x.......x..', b: 'b..bb..bb..bb..b' },
      { name: 'Grinder', k: 'XxxxX...XxxxX...', s: '....X.......X...', h: '..X...X...X...X.', b: 'b...b...b...b...' },
    ],
  },
  {
    id: 'hardtechno', name: 'Hard techno', bpm: 150, swing: 0, kit: 'hard', bass: 'reese', fill: 'roll', beats: [
      { name: 'Hard drive', k: 'X...X...X...X...', c: '....X.......X...', h: '..X...X...X...X.', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Schranz', k: 'X...X...X...X...', h: 'xxXxxxXxxxXxxxXx', p: '..x...x...x...x.', b: '..bb..bb..bb..bb' },
      { name: 'Rumble kick', k: 'X...X...X...X...', h: '..X...X...X...X.', t: '.o.o.o.o.o.o.o.o', b: '.obb.obb.obb.obb' },
      { name: 'Tool', k: 'X...X...X...X..x', c: '....X..x....X...', h: 'x.X.x.X.x.X.x.X.', b: '..b...b...b..fb.' },
    ],
  },
  {
    id: 'hypnotic', name: 'Hypnotic techno', bpm: 128, swing: 0, kit: 'minimal', bass: 'sub', fill: 'roll', beats: [
      { name: 'Loop', k: 'X...X...X...X...', h: '..x...x...x...x.', r: '...x..x....x..x.', b: 'b..b..b..b..b.b.' },
      { name: 'Deep', k: 'X...X...X...X...', h: '..x.?.x...x.?.x.', p: '.....?.......?..', b: '..b...b...b...b.' },
      { name: 'Tunnel', k: 'X...X...X...X...', h: 'oxoxoxoxoxoxoxox', p: 'x..', b: '.b.b.b.b.b.b.b.b' },
      { name: 'Fog', k: 'X...X...X...X...', r: '...?......x.....', h: '..x...x...x...x.', b: '..b...b...b...b.' },
      { name: 'Spiral', k: 'X...X...X...X...', h: '..x...x...x...x.', p: 'x..x..x..x..x...', b: '..b..b..b...b...' },
      { name: 'Pulse', k: 'X...X...X...X...', h: 'oxoxXxoxoxoxXxox', b: '.bb..bb..bb..bb.' },
      { name: 'Rolling', k: 'X...X...X...X...', t: '..o...o...o...o.', h: '..x...x...x...x.', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Trance state', k: 'X...X...X...X...', h: '..x.', r: 'x....', b: '..b...b...b...b.' },
      { name: 'Drone', k: 'X...X...X...X...', h: '..x...x...x...x.', b: 'B...............' },
      { name: 'Mantra', k: 'X...X...X...X...', c: '..........x.....', h: 'x?x?x?x?x?x?x?x?', b: '..b...b...b..b..' },
      { name: 'Labyrinth', k: 'X...X...X...X...', t: 'o..', p: '..x..', h: '..x.', b: '..b...b...b...b.' },
      { name: 'Night bus', k: 'X...X...X...X.x.', h: '..x.?.x...x.?.x.', r: '.......x.......x', b: 'b..b..b...b..b..' },
      { name: 'Groove', k: 'X...X...X...X...', h: 'oxxooxxooxxooxxo', p: '...?.......?....', b: '.b..b..b.b..b..b' },
    ],
  },
  {
    id: 'ebm', name: 'EBM', bpm: 120, swing: 0, kit: 'punchy', bass: 'synth', fill: 'toms', beats: [
      { name: 'March', k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'bbbbbbbbbbbbbbbb' },
      { name: 'Body', k: 'X..XX...X..XX...', s: '....X.......X...', h: '..x...x...x...x.', b: 'b.bbb.bbb.bbb.bb' },
      { name: 'Drill sergeant', k: 'X...X...X...X...', c: '....X.......X...', p: 'x.x.x.x.x.x.x.x.', b: 'b.b.b.b.u.b.b.b.' },
      { name: 'Cold war', k: 'X.....X.X.......', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'bbbbbbbbffffbbbb' },
    ],
  },
  {
    id: 'darkpsy', name: 'Dark psy', bpm: 148, swing: 0, kit: 'glitch', bass: 'psy', fill: 'glitch', beats: [
      { name: 'Forest night', k: 'X...X...X...X...', h: '..x...x...x...x.', p: '..?..?...?..?...', t: '...o......o.....', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Twisted', k: 'X...X...X...X...X...X...X...X...X...X...X...X...X...X...X.X.X.XX', c: '....x.......x...', h: 'xoxxxoxxxoxxxoxx', y: 'X...............................................................', b: '.bbb.bub.bbb.b~b' },
      { name: 'Swamp', k: 'X...X...X...X...', h: '..x...x...x...x.', r: '..o...o..o...o..', b: '.b~..b~..b~..bb.' },
      { name: 'Creature', k: 'X...X...X...X...', h: '..x.?.x...x.?.xx', p: '.x.?.x.?.x.?.x.!', b: '..bb..bb..bb..bb' },
      { name: 'Midnight', k: 'X...X...X...X...X...X...X...X.X.', h: 'xxxxxxxxxxxxxxxx', t: '..........................o.o.oo', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Goblin', k: 'X...X...X...X...', s: '...x......x..x..', p: 'x..?..x..?.x..?.', b: '.bub.bub.bub.buu' },
      { name: 'Black lodge', k: 'X...X...X...X...', o: '..x...x...x...x.', p: '...?......?.....', t: '.......o.......X', b: '...b...b...b...b' },
      { name: 'Rattle', k: 'X...X...X...XX..', c: '....x.......x...', h: 'x2x.x2x.x2x.x2x3', b: '.bbb.bbb.bbb..bb' },
      { name: 'Hollow', k: 'X...X...X...X...', h: '..x...x...x...x.', r: '.o..o..o..o..o..', y: 'X...............................................................', b: '.b~b.b~b.b~b.b~b' },
      { name: 'Descent', k: 'X...X...X...X...', c: '....x.......x...', h: '..x...x...x...x.', t: '..........................................................o.o.oo', b: '.bbb.bbb.bbb.bbb.fff.fff.fff.fff.ttt.ttt.ttt.ttt.bbb.bbb.bub.uuu' },
    ],
  },
  {
    id: 'hitech', name: 'Hi-tech', bpm: 180, swing: 0, kit: 'glitch', bass: 'psy', fill: 'glitch', beats: [
      { name: 'Hi-tech', k: 'X...X...X...X...', h: 'xxxxxxxxxxxxxxxx', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Glitch run', k: 'X...X...X...X...', h: 'x2x.x2x.x2x.x2x.', p: '...x..x....x..x.', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Fractal', k: 'X...X...X...X...', h: '..x...x...x...x.', p: 'x.xx.x.xx.xx.x.x', b: '.bub.bfb.bub.bfb' },
      { name: 'Overdrive', k: 'X...X...X...X...', c: '....x.......x...', h: '3.x.3.x.3.x.3.x.', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Lightspeed', k: 'X...X...X...X...', h: 'x3x3x3x3x3x3x3x3', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Data storm', k: 'X...X...X...X...', h: 'xxxxxxxxxxxxxxxx', p: 'x.x.?.x.x.?.x.?x', r: '.....o.....o....', b: '.bub.bub.bub.bub' },
      { name: 'Particle', k: 'X...X...X...X...', h: '..x...x...x...x.', p: '.x.x.x.x.x.x.x.x', b: '.bfb.bbb.bfb.bbb' },
      { name: 'Overclock', k: 'X...X...X...X.X.', h: 'xxxxxxxxxxxxxxxx', c: '............x...', b: '.bbb.bbb.bbb..bb' },
      { name: 'Glitch drop', k: 'X...X...X.......', h: 'x2x.x2x.x2x2x2x2', r: '..........o.o.oo', b: '.bbb.bbb.bbb....' },
    ],
  },
  {
    id: 'psydub', name: 'Psy-dub', bpm: 90, swing: 0.1, kit: 'dub', bass: 'sub', fill: 'drop', beats: [
      { name: 'Psy-dub', k: 'X.......X.......', s: '........X.......', h: '..x...x...x...x.', r: '......o.......o.', b: 'b.....b...b.....' },
      { name: 'Mushroom', k: 'X.....x...X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: '..?.......?.....', b: 'b.....b...b..u..' },
      { name: 'Space echo', k: 'X.........X.....', s: '........X.......', h: '..x...x...x...x.', b: 'b.........b.....' },
      { name: 'Slow pulse', k: 'X...X...X...X...', s: '........X.......', h: '..x...x...x...x.', b: '.b.b.b.b.b.b.b.b' },
      { name: 'Lagoon', k: 'X.......X.......', s: '........x.......', h: 'x..x..x..x..x..x', p: '....?.......?...', b: 'b.......b..u....' },
      { name: 'Ayahuasca', k: 'X......x..X.....', s: '........X.......', t: '...o.......o....', h: '..x...x...x...x.', b: 'b.....b...b.....' },
      { name: 'Moss', k: 'X.........X.....', r: '....o.......o...', h: 'x.x.x.x.x.x.x.x.', p: '..?.....?.......', b: 'b.........b..b..' },
      { name: 'Half-time trance', k: 'X...X...X...X...', s: '........X.......', h: '..x...x...x...x.', o: '......x.......x.', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Floating', k: 'X...............', s: '........x.......', h: '..x.......x.....', r: '......o.......o.', b: 'B...............' },
    ],
  },
  {
    id: 'neuro', name: 'Neurofunk', bpm: 174, swing: 0, kit: 'punchy', bass: 'growl', fill: 'roll', beats: [
      { name: 'Neuro', k: 'X.........X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b.........b.....' },
      { name: 'Techstep', k: 'X.........XX....', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'b..b......bb..b.' },
      { name: 'Robot', k: 'X......X..X.....', s: '....X.......X...', h: '..x...x...x...x.', p: '.x....x...x...x.', b: 'b......b..b.....' },
      { name: 'Gnarly', k: 'X.X.......X..X..', s: '....X..o....X...', h: 'x.x.x.x.x.x.x.x.', b: 'b.b.......b..b..' },
    ],
  },
  {
    id: 'darkstep', name: 'Darkstep', bpm: 176, swing: 0, kit: 'hard', bass: 'reese', fill: 'roll', beats: [
      { name: 'Darkstep', k: 'X.........X.....', s: '....X.......X..x', h: 'x.xxx.xxx.xxx.xx', b: 'B.........B.....' },
      { name: 'Amen dark', k: 'X.X.......XX....', s: '....X..o.o..X..o', h: 'x.x.x.x.x.x.x.x.', b: 'b.b.......bb....' },
      { name: 'Horror', k: 'X......X..X.....', s: '....X.......X.X.', t: '..............2.', h: 'x.x.x.x.x.x.x.x.', b: 'B......b..b.....' },
      { name: 'Clatter', k: 'X..X......X.....', s: '....X..x.x..X..x', h: 'xxxxxxxxxxxxxxxx', b: 'b..b......b.....' },
    ],
  },
  {
    id: 'halftime', name: 'Halftime', bpm: 170, swing: 0, kit: 'punchy', bass: 'sub', fill: 'drop', beats: [
      { name: 'Halftime', k: 'X.........X.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'B.........b.....' },
      { name: 'Heavy', k: 'X.....X.........', s: '........X.......', h: '..x...x...x...x.', b: 'B.....b.........' },
      { name: 'Crawl', k: 'X..X......X..X..', s: '........X.......', h: 'x.xxx.xxx.xxx.xx', b: 'B..b......b..b..' },
      { name: 'Space', k: 'X...............', s: '........X.......', h: 'x...x...x...x...', r: '..............o.', b: 'B.......~.......' },
    ],
  },
  {
    id: 'liquid', name: 'Liquid', bpm: 174, swing: 0, kit: 'jungle', bass: 'sub', fill: 'roll', beats: [
      { name: 'Liquid', k: 'X.........X.....', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', b: 'b.........b.....' },
      { name: 'Soulful', k: 'X.......X.X.....', s: '....X..o....X...', h: 'x.x.x.x.x.x.x.x.', r: '..o.......o.....', b: 'b.......b.b.....' },
      { name: 'Rolling', k: 'X.........X..x..', s: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', b: 'b.........b..f..' },
      { name: 'Rain', k: 'X.....x...X.....', s: '....X.......X...', h: 'o.x.o.x.o.x.o.x.', b: 'b.....b...b.....' },
    ],
  },
  {
    id: 'deepdub', name: 'Deep dubstep', bpm: 140, swing: 0, kit: 'dub', bass: 'sub', fill: 'drop', beats: [
      { name: 'Deep', k: 'X.........X.....', s: '........X.......', h: '..x...x...x...x.', b: 'B.........b.....' },
      { name: 'Dread', k: 'X..........x....', s: '........X.......', r: '....o.......o...', h: 'x...x...x...x...', b: 'B..........~....' },
      { name: 'Skank', k: 'X.....X.........', s: '........X.......', h: '..x.?.x...x.?.x.', b: 'B.....b.........' },
      { name: 'Sub low', k: 'X...............', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'B.......b.......' },
    ],
  },
  {
    id: 'gabber', name: 'Gabber', bpm: 175, swing: 0, kit: 'hard', bass: 'dist808', fill: 'roll', beats: [
      { name: 'Gabber', k: 'X...X...X...X...', h: '..x...x...x...x.', b: '..b...b...b...b.' },
      { name: 'Hoover', k: 'X...X...X...X...', c: '....X.......X...', h: '..X...X...X...X.', b: '.bbb.bbb.bbb.bbb' },
      { name: 'Terror', k: 'X.X.X.X.X.X.X.X.', h: 'x.x.x.x.x.x.x.x.', b: 'b.b.b.b.b.b.b.b.' },
      { name: 'Rave', k: 'X...X...X...X...', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', o: '..X...X...X...X.', b: '..b...b...b...b.' },
    ],
  },
  {
    id: 'breakcore', name: 'Breakcore', bpm: 180, swing: 0, kit: 'jungle', bass: 'fuzz', fill: 'glitch', beats: [
      { name: 'Breakcore', k: 'X.X.......XX..X.', s: '....X..o.o..X.2.', h: 'x.x.x.x.x.x.x.x.', b: 'b.b.......bb....' },
      { name: 'Amen smash', k: 'X.X...X...XX....', s: '....X..xX...X.xx', h: 'xxxxxxxxxxxxxxxx', b: 'b.b...b...bb....' },
      { name: 'Chopped', k: 'X..X..X...X.X...', s: '...X..X.X.....X.', t: '..........4.....', h: 'x.x.x.x.x.x.x.x.', b: 'b..b..b...b.b...' },
      { name: 'Glitch storm', k: 'X.X.X...X..X.X..', s: '....X..3....X..4', h: 'x2x.x2x.x3x.x2x.', b: 'b.b.b...b..b.b..' },
    ],
  },
  {
    id: 'darksynth', name: 'Darksynth', bpm: 110, swing: 0, kit: 'punchy', bass: 'fuzz', fill: 'toms', beats: [
      { name: 'Darksynth', k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'bbbbbbbbbbbbbbbb' },
      { name: 'Chase', k: 'X.X...X.X.X...X.', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'b.b.b.b.b.b.b.b.' },
      { name: 'Midnight', k: 'X.......X.X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b.bb.bb.b.bb.bb.' },
      { name: 'Doom', k: 'X.....X.X.......', s: '....X.......X...', t: '............2.2.', h: '..x...x...x...x.', b: 'b.....b.b.......' },
    ],
  },
  {
    id: 'darkwave', name: 'Darkwave', bpm: 120, swing: 0, kit: 'linn', bass: 'picked', fill: 'toms', beats: [
      { name: 'Coldwave', k: 'X.......X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b.b.b.b.b.b.b.b.' },
      { name: 'Post-punk', k: 'X.X.....X.X.....', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', b: 'bbbbbbbbbbbbbbbb' },
      { name: 'Gothic', k: 'X...X...X...X...', s: '....X.......X...', h: '..x...x...x...x.', b: 'b..b..b.b..b..b.' },
      { name: 'Minimal wave', k: 'X.....X.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', r: '..o.......o.....', b: 'b.....b.b.......' },
    ],
  },
  {
    id: 'witch', name: 'Witch house', bpm: 70, swing: 0, kit: 'trap', bass: 'sub', fill: 'drop', beats: [
      { name: 'Witch house', k: 'X.........X.....', c: '........X.......', h: 'x...x...x...x...', b: 'B.........~.....' },
      { name: 'Occult', k: 'X.....X...X.....', c: '........X.......', h: 'x.x.x.x.x.x.x.x.', p: '..x.......x.....', b: 'B.....b...b.....' },
      { name: 'Drag', k: 'X.......X..x....', s: '........X.......', h: 'x...x...x2..x...', b: 'B.......b..b....' },
      { name: 'Crypt', k: 'X...............', c: '........X.......', r: '..o...o...o...o.', b: 'B.......~.......' },
    ],
  },
];
export const genreById = (id: string) => GENRES.find((g) => g.id === id);

/** One step of a row: its loudness and how many hits (a roll), or null for a rest. */
export function stepHit(ch: string | undefined): { v: number; n: number } | null {
  switch (ch) {
    case 'X': return { v: 1, n: 1 };
    case 'x': return { v: 0.75, n: 1 };
    case 'o': return { v: 0.38, n: 1 };
    case '?': return Math.random() < 0.5 ? { v: 0.6, n: 1 } : null;
    case '!': return Math.random() < 0.25 ? { v: 0.5, n: 1 } : null;
    case '2': case '3': case '4': return { v: 0.62, n: +ch };
    default: return null;
  }
}
