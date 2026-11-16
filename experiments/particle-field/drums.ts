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

export type DrumKit = 'soft' | '808' | 'punchy' | 'brush' | 'hand' | '909' | 'linn' | 'lofi' | 'dub' | 'techno' | 'trap' | 'jungle' | 'glitch' | 'minimal';
export const KIT_OPTIONS: [DrumKit, string][] = [
  ['soft', 'Soft'], ['808', '808 (boom and clap)'], ['punchy', 'Punchy (club)'], ['brush', 'Brushes (jazz)'], ['hand', 'Hand percussion'],
  ['909', '909 (house)'], ['linn', '80s drum machine'], ['lofi', 'Lo-fi (dusty)'], ['dub', 'Dub (rim and spring)'], ['techno', 'Techno (hard)'],
  ['trap', 'Trap (long 808)'], ['jungle', 'Jungle (breaks)'], ['glitch', 'Glitch (IDM)'], ['minimal', 'Minimal (ticks)'],
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
};

/** The drums a beat can use: kick, snare, clap, hat, open hat, rim, perc, tom, crash. */
export const DRUM_ROWS = ['k', 's', 'c', 'h', 'o', 'r', 'p', 't', 'y'] as const;
export type DrumRow = (typeof DRUM_ROWS)[number];
export type Beat = { name: string } & Partial<Record<DrumRow | 'b', string>>;
export type FillStyle = 'roll' | 'toms' | 'hats' | 'glitch' | 'drop';
export interface Genre {
  id: string;
  name: string;
  bpm: number;
  swing: number;
  kit: DrumKit;
  bass: 'synth' | 'sub' | 'round' | 'upright' | 'acid' | 'picked' | '808';
  fill: FillStyle;
  beats: Beat[];
}

export const GENRES: Genre[] = [
  {
    id: 'techno', name: 'Techno', bpm: 130, swing: 0, kit: 'techno', bass: 'sub', fill: 'roll', beats: [
      { name: 'Four to the floor', k: 'X...X...X...X...', c: '....x.......x...', h: '..x...x...x...x.', b: '..b...b...b...b.' },
      { name: 'Rumble', k: 'X...X...X...X...', h: '..X...X...X...X.', t: '.o.o.o.o.o.o.o.o', b: '.obb.obb.obb.obb' },
      { name: 'Offbeat', k: 'X...X...X...X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..X...X...X...X.', b: '..b...b...b..fb.' },
      { name: 'Industrial', k: 'X..xX...X..xX.x.', s: '....X.......X...', h: 'XoxoXoxoXoxoXoxo', p: '...x.....x....x.', b: 'b..b..b...b..b..' },
      { name: 'Hypnotic', k: 'X...X...X...X...', h: '..x.?.x...x.?.x.', r: '...x..x....x..x.', p: '.....?.......?..', b: 'b..b..b..b..b.b.' },
      { name: 'Broken', k: 'X.....x...X..x..', s: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', p: '.......?.......?', b: 'b.....b...b..u..' },
      { name: 'Acid drive', k: 'X...X...X...X...', c: '....x.......x...', h: 'oxoxoxoxoxoxoxox', b: 'b.ub.bf.b.ub.u.f' },
      { name: 'Dub techno', k: 'X...X...X...X...', r: '...?......x.....', h: '..x...x...x...x.', b: '..b...b...b...b.' },
    ],
  },
  {
    id: 'house', name: 'House', bpm: 124, swing: 0.15, kit: '909', bass: 'round', fill: 'roll', beats: [
      { name: 'Classic', k: 'X...X...X...X...', c: '....X.......X...', h: 'x...x...x...x...', o: '..X...X...X...X.', b: '..b..ob...b..ob.' },
      { name: 'Deep', k: 'X...X...X...X...', c: '....x.......x...', h: 'o.xoo.xoo.xoo.xo', r: '...o......o.....', b: 'b.....b.f.....u.' },
      { name: 'Disco', k: 'X...X...X...X...', s: '....X.......X...', h: 'xo.oxo.oxo.oxo.o', o: '..X...X...X...X.', b: 'b.u.b.u.b.u.b.u.' },
      { name: 'Tech house', k: 'X...X...X...X...', c: '....X.......X...', h: '..x...x...x...x.', p: '.o..?..o.o..?..o', r: '......x.......x.', b: '..bo..b...bo..b.' },
      { name: 'Jackin', k: 'X...X...X...X...', c: '....X..x....X...', h: 'xxoxxxoxxxoxxxox', s: '...o.....o.....o', b: '..b..b..b.b..b..' },
      { name: 'Garage two-step', k: 'X......x..X.....', s: '....X.......X...', h: '..x.o.x...x.o.x.', r: '.......o.......o', b: 'b.....b...b..u..' },
      { name: 'Chicago', k: 'X...X...X...X...', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: '...x.....x..x...', b: 'b..b..b...b..b..' },
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
    ],
  },
  {
    id: 'dubstep', name: 'Dubstep', bpm: 140, swing: 0, kit: 'punchy', bass: 'sub', fill: 'drop', beats: [
      { name: 'Halfstep', k: 'X.........X.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'B.....b...b.....' },
      { name: 'Wobble', k: 'X......x..X.....', s: '........X.......', h: '..x...x...x...x.', b: 'B.b.b.b.b.b.b.b.' },
      { name: 'Tribal', k: 'X.....x...x.....', s: '........X.......', t: '..o...x.....x.o.', p: 'x..x..x..x..x...', h: 'o.o.o.o.o.o.o.o.' },
      { name: 'Riddim', k: 'X..x......X..x..', s: '........X.......', h: '....x.......x.x.', b: 'B..b......B..b..' },
      { name: 'Garage step', k: 'X.....x...x.....', s: '........X.....o.', h: 'x.?x..x.x.?x..x.', r: '...o.......o....', b: 'B.....b...b..f..' },
    ],
  },
  {
    id: 'dancehall', name: 'Dancehall', bpm: 96, swing: 0.1, kit: '808', bass: 'sub', fill: 'roll', beats: [
      { name: 'Dembow', k: 'X...X...X...X...', s: '...X..X....X..X.', h: 'x.x.x.x.x.x.x.x.', b: 'b...b...b...b..f' },
      { name: 'Bashment', k: 'X..X..X.X..X..X.', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', b: 'b..b..b.b..b..f.' },
      { name: 'Steppers', k: 'X...X...X...X...', s: '....X.......X...', r: '...x..x....x..x.', h: '..x...x...x...x.', b: 'b.....b.b.....b.' },
      { name: 'Reggaeton', k: 'X...X...X...X...', c: '...X..X....X..X.', h: 'x.x.x.x.x.x.x.x.', r: '..x.......x.....', b: 'b..b..b.b..b..b.' },
      { name: 'Moombahton', k: 'X...X...X...X...', s: '...X..X....X..X.', p: '..x...x...x...x.', o: '..............X.', b: 'b..b....b..b..u.' },
    ],
  },
  {
    id: 'rap', name: 'Rap & boom bap', bpm: 90, swing: 0.45, kit: 'lofi', bass: 'round', fill: 'toms', beats: [
      { name: 'Boom bap', k: 'X......x.x......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b......b.b......' },
      { name: 'Golden era', k: 'X.....x...X..x..', s: '....X..o.o..X...', h: 'xoxoxoxoxoxoxoxo', b: 'b.....b...b..f..' },
      { name: 'Lazy', k: 'X.......X.x.....', s: '....X.......X..o', h: 'x.x.x.x.x.x.x.x.', b: 'b.......b.b.....' },
      { name: 'Jazzy', k: 'X......xX.......', s: '....X.......X...', r: '..o...o...o..o..', h: 'x.ox.ox.x.ox.ox.', b: 'b..t..f.b..t..f.' },
      { name: 'West coast', k: 'X.....x...x..x..', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..............X.', b: 'b.....bf..b..u..' },
      { name: 'Dusty break', k: 'X.X.......XX....', s: '....X..o.o..X..o', h: 'x.x.x.x.x.x.x.x.', b: 'b.b.......bb....' },
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
    ],
  },
  {
    id: 'drill', name: 'Drill', bpm: 142, swing: 0, kit: 'trap', bass: '808', fill: 'hats', beats: [
      { name: 'UK drill', k: 'X......x...X....', s: '........X..x....', h: 'x..x..x.x..x..x.', b: 'B.....~...~.b...' },
      { name: 'NY drill', k: 'X..x......X..x..', s: '........X.......', h: 'x..x..x.x2.x..x.', p: '...o......?.....', b: 'B..~......B..~..' },
      { name: 'Sliding', k: 'X..........X....', s: '........X.....X.', h: 'x..x..x.x..x.3x.', b: 'B..~..~...~..~..' },
      { name: 'Chicago drill', k: 'X...x.....x.....', s: '........X.......', h: 'x.x.x.x3x.x.x.x4', b: 'B...b.....b.....' },
      { name: 'Dark drill', k: 'X.......x.X.....', s: '........X....x..', h: 'x..x..x.x..x..3.', r: '...........o....', b: 'B.......~.B.....' },
    ],
  },
  {
    id: 'dnb', name: 'Drum & bass', bpm: 172, swing: 0, kit: 'jungle', bass: 'sub', fill: 'roll', beats: [
      { name: 'Two-step', k: 'X.........X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'B.........b.....' },
      { name: 'Amen chop', k: 'X.X.......XX....', s: '....X..o.o..X..o', h: 'x.x.x.x.x.x.x.x.', b: 'B.........B.....' },
      { name: 'Rollers', k: 'X.........X.....', s: '....X..o....X.o.', h: 'xoxoxoxoxoxoxoxo', b: 'B.b.....b.b.....' },
      { name: 'Liquid', k: 'X.........x.....', s: '....X.......X...', r: '..o.....o.....o.', h: 'x.?.x.?.x.?.x.?.', b: 'B.......f.b.....' },
      { name: 'Jungle', k: 'X.x...x...x.....', s: '....X..o.o..X..o', h: 'x?x?x?x?x?x?x?x?', t: '..............x.', b: 'B.....b...B.....' },
      { name: 'Halftime', k: 'X.........X.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'B.........b..b..' },
    ],
  },
  {
    id: 'idm', name: 'IDM', bpm: 110, swing: 0, kit: 'glitch', bass: 'synth', fill: 'glitch', beats: [
      { name: 'Polymeter', k: 'X..x.', s: '...X...', h: 'x.?', p: 'o..?..o.?..o.', b: 'b....f...' },
      { name: 'Stutter', k: 'X.....x2..X.....', s: '....X..3....X.4.', h: 'x?x?x?x?x?x?x?x?', b: 'b.....b...b.....' },
      { name: 'Broken', k: 'X..x...x..X.....', s: '....X.....?.X...', h: '2.x.?.x.x.?.3.x.', r: '.o.....o.....o..', b: 'b..b......f..b..' },
      { name: 'Cloud', k: 'X...?...?...?.?.', s: '!.!.X.!.!.!.X.!.', h: '????????????????', p: '!!!!!!!!!!!!!!!!', b: 'b.......?.......' },
      { name: 'Seven', k: 'X.....X.......', s: '....X......X..', h: 'x.x.x.x.x.x.x.', r: 'o..o..o..o..o..o..o..', b: 'b......f......' },
      { name: 'Drill and bass', k: 'X.xX..x.X..x.x..', s: '....X2..3...X..4', h: 'x2x2x2x2x2x2x2x2', b: 'b.bb..b.b..b.b..' },
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
    ],
  },
  {
    id: 'breaks', name: 'Breaks & funk', bpm: 100, swing: 0.2, kit: 'linn', bass: 'picked', fill: 'toms', beats: [
      { name: 'Funk break', k: 'X.X.......X..X..', s: '....X..o.o.oX..o', h: 'xxxxxxxoxxxxxxxx', b: 'b.b.......b..f..' },
      { name: 'Big beat', k: 'X.........X.X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..............X.', b: 'B.........b.b...' },
      { name: 'Electro', k: 'X......X..X.....', c: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', b: 'b......b..b..b..' },
      { name: 'Miami bass', k: 'X......X..X.....', c: '....X.......X...', h: 'XoxoXoxoXoxoXoxo', b: 'B......b..B.....' },
      { name: 'Breakbeat', k: 'X.........X..X..', s: '....X..o....X...', h: 'x.x.x.x.x.x.x.x.', o: '......X.........', b: 'b.........b..b..' },
    ],
  },
  {
    id: 'lofi', name: 'Lo-fi', bpm: 80, swing: 0.5, kit: 'lofi', bass: 'round', fill: 'drop', beats: [
      { name: 'Lazy', k: 'X.......X.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', b: 'b.......b.b.....' },
      { name: 'Chillhop', k: 'X..x......X.....', s: '....X.......X...', h: 'xox.xox.xox.xox.', r: '.......o......o.', b: 'b..t......f.....' },
      { name: 'Rainy', k: 'X.........x.....', s: '....X.......X..o', h: '..x...x...x...x.', p: '?...?...?...?...', b: 'b.........f.....' },
      { name: 'Tape', k: 'X.....x.X.......', s: '....X..o....X...', h: 'xoxoxoxoxoxoxoxo', b: 'b.....b.b.......' },
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
