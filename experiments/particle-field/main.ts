import './style.css';
import { AudioInput, tabAudioSupported, type Genre } from './audio.ts';

// --- settings ----------------------------------------------------------------

type PointerMode = 'repel' | 'attract' | 'vortex' | 'none';
type ClickMode = 'gather' | 'ripple' | 'implode' | 'emit' | 'shockwave' | 'none';
type Render = 'mixed' | 'dots' | 'circles' | 'glow' | 'bokeh' | 'rings' | 'sparkles' | 'arrows' | 'streaks' | 'comets' | 'glyphs' | 'links';
type KickAction = 'pulse' | 'wave' | 'both' | 'none';
type SnareAction = 'swirl' | 'wave' | 'flash' | 'none';
type HatAction = 'sparkle' | 'none';
type SubAction = 'size' | 'flow' | 'speed' | 'none';
type WaveAt = 'centre' | 'pointer' | 'random' | 'orbit' | 'mirror' | 'corners';
type BeatAction = 'ripple' | 'shockwave' | 'implode' | 'twist' | 'star' | 'sweep' | 'mix' | 'random' | 'none';
type ColorBy = 'audio' | 'palette' | 'speed' | 'direction' | 'pointer' | 'horizontal' | 'vertical' | 'radial' | 'cycle';
type Palette = keyof typeof PALETTES | 'custom';
type GlyphSet = keyof typeof GLYPH_SETS | 'custom';
type GlyphPick = 'random' | 'speed' | 'heading' | 'sequence';
type GlyphChange = 'fixed' | 'flicker' | 'beat';
type GlyphFont = 'mono' | 'serif' | 'sans' | 'bold';
type GlyphRotate = 'none' | 'heading' | 'spin';

// Glyph sets. 'density' runs light → heavy so picking by speed reads as
// ASCII-art shading; 'arrows' is ordered by angle so picking by heading
// points each arrow where its particle is going.
const GLYPH_SETS = {
  katakana: { label: 'Katakana & digits', chars: '01アイウエオカキクケコサシスセソタチツテトナニヌネノ' },
  binary: { label: 'Binary', chars: '01' },
  hex: { label: 'Hex', chars: '0123456789ABCDEF' },
  latin: { label: 'Letters', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  density: { label: 'ASCII shading', chars: '.·:-=+*#%@' },
  blocks: { label: 'Blocks', chars: '░▒▓█▀▄▌▐' },
  box: { label: 'Box lines', chars: '─│┌┐└┘├┤┬┴┼╱╲╳' },
  braille: { label: 'Braille', chars: '⠁⠃⠇⠏⠟⠿⡿⣿⠛⠶⠼⠹⠸⠴⠦⠖' },
  runes: { label: 'Runes', chars: 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ' },
  math: { label: 'Math', chars: '∑∫∂√π∞≈≠±×÷∆∇∈∀∃λΩ' },
  arrows: { label: 'Arrows', chars: '→↘↓↙←↖↑↗' },
  shapes: { label: 'Shapes', chars: '●○◆◇■□▲△★☆✦✧' },
  notes: { label: 'Music notes', chars: '♩♪♫♬♭♮♯' },
} as const;

interface Settings {
  count: number;
  size: number;
  speed: number;
  friction: number;
  jitter: number;
  flow: number;
  flowScale: number;
  flowSpeed: number;
  pointerMode: PointerMode;
  click: ClickMode;
  clickForce: number;
  radius: number;
  force: number;
  render: Render;
  linkDist: number;
  trail: number;
  glow: boolean;
  palette: Palette;
  colorBy: ColorBy;
  customColors: string;
  customBg: string;
  mixStyles: string;
  gravity: number;
  glyphSet: GlyphSet;
  glyphText: string;
  glyphPick: GlyphPick;
  glyphChange: GlyphChange;
  glyphRate: number;
  glyphFont: GlyphFont;
  glyphScale: number;
  glyphRotate: GlyphRotate;
  audioSpeed: number;
  audioFlow: number;
  audioPulse: number;
  audioBeat: BeatAction;
  audioWaveAt: WaveAt;
  audioWaveEvery: number;
  audioWaveSpeed: number;
  audioWaveReach: number;
  audioWaveForce: number;
  audioWaveWidth: number;
  audioWaveAccent: boolean;
  audioWaveFeel: 'soft' | 'punchy';
  audioWaveRings: boolean;
  audioGenre: Genre;
  audioKick: KickAction;
  audioSnare: SnareAction;
  audioHats: HatAction;
  audioHits: number;
  audioSub: SubAction;
  audioSubAmt: number;
  audioIntensity: number;
  audioFineTune: boolean;
}

// Each palette is a list of [hue, saturation, lightness] stops from the
// "calm" end to the "hot" end, plus a background. Stops run dark/cool to
// bright/warm so speed and pointer modes read as energy. Cyclic palettes
// start and end on the same colour, so direction can use them without a seam.
interface PaletteDef {
  label: string;
  bg: readonly [number, number, number];
  stops: readonly (readonly [number, number, number])[];
  cyclic?: boolean;
}

const PALETTES = {
  aurora: { label: 'Aurora', bg: [7, 7, 12], stops: [[200, 90, 65], [260, 85, 68], [320, 90, 66]] },
  ember: { label: 'Ember', bg: [12, 6, 4], stops: [[355, 85, 40], [10, 90, 52], [30, 95, 58], [48, 100, 70]] },
  ocean: { label: 'Ocean', bg: [3, 9, 14], stops: [[225, 80, 45], [200, 90, 55], [180, 80, 60], [165, 70, 78]] },
  sunset: { label: 'Sunset', bg: [14, 6, 14], stops: [[265, 60, 45], [320, 75, 55], [350, 85, 62], [25, 95, 62], [45, 100, 72]] },
  forest: { label: 'Forest', bg: [5, 10, 7], stops: [[160, 50, 30], [140, 55, 42], [100, 55, 52], [70, 70, 65]] },
  ice: { label: 'Ice', bg: [5, 8, 14], stops: [[220, 50, 45], [205, 70, 65], [195, 80, 82], [190, 60, 96]] },
  gold: { label: 'Gold', bg: [10, 8, 4], stops: [[30, 70, 30], [38, 80, 48], [45, 90, 62], [50, 100, 85]] },
  vapor: { label: 'Vaporwave', bg: [10, 5, 18], stops: [[280, 80, 55], [310, 90, 65], [190, 95, 62], [175, 90, 75]] },
  candy: { label: 'Candy', bg: [14, 10, 16], stops: [[330, 85, 72], [280, 70, 76], [200, 80, 74], [160, 65, 72]] },
  toxic: { label: 'Toxic', bg: [4, 8, 4], stops: [[150, 80, 30], [120, 90, 45], [90, 100, 55], [65, 100, 70]] },
  infra: { label: 'Infrared', bg: [3, 3, 8], stops: [[240, 70, 30], [280, 80, 45], [330, 90, 52], [15, 100, 55], [50, 100, 65], [60, 100, 92]] },
  neon: { label: 'Neon', bg: [6, 4, 10], stops: [[300, 100, 62], [240, 100, 66], [180, 100, 55], [300, 100, 62]], cyclic: true },
  mono: { label: 'Mono', bg: [8, 8, 8], stops: [[0, 0, 35], [0, 0, 65], [0, 0, 95]] },
  rainbow: { label: 'Rainbow', bg: [6, 6, 8], stops: [[0, 90, 62], [120, 90, 58], [240, 90, 66], [360, 90, 62]], cyclic: true },
  cosmic: { label: 'Cosmic', bg: [4, 3, 14], stops: [[250, 70, 35], [275, 75, 55], [320, 85, 68], [200, 90, 80]] },
  cyber: { label: 'Cyberpunk', bg: [10, 4, 16], stops: [[320, 100, 60], [285, 90, 62], [190, 100, 55], [55, 100, 60]] },
  tealorange: { label: 'Teal & orange', bg: [6, 10, 12], stops: [[185, 80, 45], [190, 60, 70], [30, 70, 75], [25, 95, 58]] },
  crimson: { label: 'Crimson', bg: [10, 3, 5], stops: [[345, 80, 30], [350, 85, 45], [0, 90, 58], [10, 100, 72]] },
  lavender: { label: 'Lavender', bg: [12, 10, 18], stops: [[260, 50, 60], [275, 55, 72], [300, 45, 82], [230, 50, 85]] },
  pastel: { label: 'Pastel', bg: [16, 16, 22], stops: [[350, 80, 82], [40, 85, 80], [150, 55, 78], [210, 75, 80], [270, 65, 82]], cyclic: false },
  desert: { label: 'Desert', bg: [16, 11, 8], stops: [[15, 45, 40], [25, 55, 55], [35, 60, 68], [45, 50, 82]] },
  paper: { label: 'Ink on paper', bg: [242, 238, 228], stops: [[220, 30, 12], [220, 25, 25], [215, 20, 38]] },
  blueprint: { label: 'Blueprint', bg: [18, 52, 110], stops: [[205, 60, 70], [200, 70, 85], [195, 40, 96]] },
  risograph: { label: 'Risograph', bg: [245, 240, 230], stops: [[335, 85, 55], [210, 80, 45], [45, 95, 52]] },
} satisfies Record<string, PaletteDef>;


// The current palette, including a custom one built from colour pickers.
function pal(): PaletteDef {
  if (settings.palette !== 'custom') return PALETTES[settings.palette];
  return {
    label: 'Custom',
    bg: hexToRgb(settings.customBg),
    stops: settings.customColors.split(',').filter(Boolean).map((hex) => rgbToHsl(hexToRgb(hex))),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

const DEFAULTS: Settings = {
  count: 1200,
  size: 1.6,
  speed: 1,
  friction: 0.04,
  jitter: 0.05,
  flow: 0.3,
  flowScale: 0.004,
  flowSpeed: 0.2,
  pointerMode: 'repel',
  click: 'gather',
  clickForce: 1,
  radius: 120,
  force: 0.6,
  render: 'dots',
  linkDist: 70,
  trail: 0.75,
  glow: false,
  palette: 'aurora',
  colorBy: 'palette',
  customColors: '#2b6cff,#9b5cff,#ff4fa3',
  customBg: '#07070c',
  mixStyles: 'circles,glow,sparkles,rings,glyphs,comets',
  gravity: 0,
  glyphSet: 'katakana',
  glyphText: 'HELLO WORLD',
  glyphPick: 'random',
  glyphChange: 'flicker',
  glyphRate: 0.01,
  glyphFont: 'mono',
  glyphScale: 1,
  glyphRotate: 'none',
  audioSpeed: 0.4,
  audioFlow: 0.5,
  audioPulse: 0.6,
  audioBeat: 'ripple',
  audioWaveAt: 'centre',
  audioWaveEvery: 1,
  audioWaveSpeed: 1,
  audioWaveReach: 1,
  audioWaveForce: 1,
  audioWaveWidth: 1,
  audioWaveAccent: true,
  audioWaveFeel: 'soft',
  audioWaveRings: false,
  audioGenre: 'general',
  audioKick: 'pulse',
  audioSnare: 'wave',
  audioHats: 'none',
  audioHits: 0.6,
  audioSub: 'size',
  audioSubAmt: 0.5,
  audioIntensity: 1,
  audioFineTune: false,
};

const STORAGE_KEY = 'particle-field:settings';
const settings: Settings = { ...DEFAULTS, ...load() };
if (settings.palette !== 'custom' && !(settings.palette in PALETTES)) settings.palette = DEFAULTS.palette;
// Older saves used 'none' as a beat wave; that is now 'Kick does: Pulse'.
if ((settings.audioBeat as string) === 'none') settings.audioBeat = 'ripple';

function load(): Partial<Settings> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

// --- layout ------------------------------------------------------------------

const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="stage" id="stage">
    <canvas id="c"></canvas>
    <button class="fab-shuffle" id="fab-shuffle" type="button" title="Shuffle (keeps locked sections)" aria-label="Shuffle"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg></button>
    <p class="hint" id="hint">Move through the field · click and hold</p>
  </main>
  <aside class="panel" id="panel">
    <header>
      <h1>Particle field</h1>
      <button class="icon" id="toggle" aria-expanded="true" title="Hide controls (H)">⟩</button>
    </header>
    <div class="panel-body" id="controls"></div>
  </aside>
`;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hint = document.getElementById('hint')!;

// --- particles ---------------------------------------------------------------

// Struct-of-arrays keeps thousands of particles cheap to update.
let cap = 0;
let px = new Float32Array(0);
let py = new Float32Array(0);
let vx = new Float32Array(0);
let vy = new Float32Array(0);
let ox = new Float32Array(0); // previous position, for streaks
let oy = new Float32Array(0);
let tone = new Float32Array(0); // 0..1 position along the palette
let gl = new Float32Array(0); // glyph choice, 0..1
let n = 0;

let w = 0;
let h = 0;
let t = 0;
let paused = false;
let dpr = 1;

function ensureCount() {
  const want = settings.count;
  if (want > cap) {
    const grow = (a: Float32Array) => {
      const b = new Float32Array(want);
      b.set(a.subarray(0, n));
      return b;
    };
    [px, py, vx, vy, ox, oy, tone, gl] = [px, py, vx, vy, ox, oy, tone, gl].map(grow);
    cap = want;
  }
  for (let i = n; i < want; i++) spawn(i, Math.random() * w, Math.random() * h);
  n = want;
}

function spawn(i: number, x: number, y: number) {
  px[i] = ox[i] = x;
  py[i] = oy[i] = y;
  vx[i] = (Math.random() - 0.5) * 0.4;
  vy[i] = (Math.random() - 0.5) * 0.4;
  tone[i] = Math.random();
  gl[i] = Math.random();
}

function resize() {
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2) * renderScale);
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < n; i++) {
    if (px[i] > w || py[i] > h) spawn(i, Math.random() * w, Math.random() * h);
  }
  ensureCount();
  clear();
}

function clear() {
  const [r, g, b] = pal().bg;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  ctx.fillRect(0, 0, w, h);
  document.body.style.background = `rgb(${r} ${g} ${b})`;
}

// --- pointer -----------------------------------------------------------------

const pointer = { x: -1e4, y: -1e4, active: false, down: false };

// Rings travel out (shockwave, ripple) or in (implode) from a click.
// Waves come from clicks and from audio hits.
//   ripple    ring that makes particles bob and settle
//   shockwave ring that pushes outward
//   implode   ring that contracts and pulls inward
//   twist     ring that spins particles as it passes
//   star      shockwave that only pushes along a few spokes
//   sweep     a straight line that sweeps across the screen
type WaveKind = 'shockwave' | 'ripple' | 'implode' | 'twist' | 'star' | 'sweep';
interface Wave {
  kind: WaveKind;
  x: number;
  y: number;
  r: number; // radius, or position along the axis for a sweep
  life: number;
  speed: number; // multiplies how fast the ring travels
  decay: number; // multiplies how fast it fades (lower = travels further)
  force: number;
  width: number; // band width in px
  dir: number; // twist / sweep direction (±1)
  angle: number; // star rotation, or sweep axis (0 = horizontal travel)
  // Soft waves push ahead of the band and pull behind it, so particles
  // shift and settle back instead of being thrown outward.
  soft: boolean;
  ring: boolean; // draw the outline
  audio?: boolean;
}
const waves: Wave[] = [];

function addWave(kind: WaveKind, x: number, y: number, o: Partial<Wave> = {}) {
  const wv: Wave = { kind, x, y, r: 0, life: 1, speed: 1, decay: 1, force: 1, width: kind === 'ripple' ? 50 : 40, dir: 1, angle: 0, soft: false, ring: true, ...o };
  if (kind === 'implode') wv.r = implodeStart();
  if (kind === 'sweep') wv.r = wv.dir > 0 ? 0 : wv.angle === 0 ? w : h;
  waves.push(wv);
}

canvas.addEventListener('pointermove', (e) => {
  pointer.x = e.offsetX;
  pointer.y = e.offsetY;
  pointer.active = true;
});
canvas.addEventListener('pointerleave', () => {
  if (pointer.down) return; // captured: keep tracking while held
  pointer.active = false;
  pointer.x = pointer.y = -1e4;
});
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointer.x = e.offsetX;
  pointer.y = e.offsetY;
  pointer.active = e.pointerType === 'mouse';
  pointer.down = true;
  const c = settings.click;
  if (c === 'shockwave' || c === 'ripple' || c === 'implode') addWave(c, e.offsetX, e.offsetY, { force: settings.clickForce });
  hint.classList.add('gone');
});
const release = (e: PointerEvent) => {
  pointer.down = false;
  // Touch has no hover, so a lifted finger stops influencing the field.
  if (e.pointerType !== 'mouse') {
    pointer.active = false;
    pointer.x = pointer.y = -1e4;
  }
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

function implodeStart() {
  return Math.max(200, settings.radius * 3);
}

// --- audio -------------------------------------------------------------------

const audio = new AudioInput();
if (import.meta.env.DEV) (window as unknown as { particleAudio: AudioInput }).particleAudio = audio;
let lastPulse = 0;
let lastSnare = 0;
let swirlDir = 1;

// Beat waves: which kind, where, and how often, with a few ways to vary
// them so a long track doesn't repeat the same ring every kick.
const MIX: WaveKind[] = ['ripple', 'twist', 'shockwave', 'star', 'ripple', 'sweep'];
let beatCount = 0;

// At most this many beat waves at once; overlapping rings read as fireworks.
const MAX_BEAT_WAVES = 2;

function beatWave(strength: number) {
  const S = settings;
  // Low intensity lets only the stronger kicks through.
  const gate = Math.max(0, 0.95 - 0.45 * S.audioIntensity);
  if (strength < gate) return;
  if (waves.filter((wv) => wv.audio).length >= MAX_BEAT_WAVES) return;
  beatCount++;
  if ((beatCount - 1) % S.audioWaveEvery !== 0) return;
  const k = Math.floor((beatCount - 1) / S.audioWaveEvery); // nth wave fired
  const kind: WaveKind = S.audioBeat === 'mix' ? MIX[k % MIX.length] : S.audioBeat === 'random' ? MIX[(Math.random() * MIX.length) | 0] : (S.audioBeat as WaveKind);
  // Louder kicks travel further when accents are on.
  const accent = S.audioWaveAccent ? 0.35 + strength * 0.65 : 0.8;
  const base: Partial<Wave> = {
    life: accent,
    speed: S.audioWaveSpeed,
    decay: 1 / S.audioWaveReach,
    force: S.audioWaveForce * S.audioIntensity,
    width: 40 * S.audioWaveWidth,
    dir: k % 2 ? -1 : 1,
    angle: kind === 'sweep' ? (k >> 1) % 2 : Math.random() * Math.PI,
    soft: S.audioWaveFeel === 'soft',
    ring: S.audioWaveRings,
    audio: true,
  };
  const spots = waveSpots(k);
  for (const [x, y] of spots) addWave(kind, x, y, base);
}

function waveSpots(k: number): [number, number][] {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.28;
  switch (settings.audioWaveAt) {
    case 'pointer':
      return pointer.active ? [[pointer.x, pointer.y]] : [[cx, cy]];
    case 'random':
      return [[w * (0.2 + Math.random() * 0.6), h * (0.2 + Math.random() * 0.6)]];
    case 'orbit': {
      // Steps around the centre, one eighth of a turn per wave.
      const a = (k * Math.PI) / 4;
      return [[cx + Math.cos(a) * R, cy + Math.sin(a) * R]];
    }
    case 'mirror': {
      const a = (k * Math.PI) / 5;
      const dx = Math.cos(a) * R;
      const dy = Math.sin(a) * R;
      return [[cx + dx, cy + dy], [cx - dx, cy - dy]];
    }
    case 'corners': {
      const m = 0.18;
      const c: [number, number][] = [[w * m, h * m], [w * (1 - m), h * m], [w * (1 - m), h * (1 - m)], [w * m, h * (1 - m)]];
      return [c[k % 4]];
    }
    default:
      return [[cx, cy]];
  }
}

// --- simulation --------------------------------------------------------------

// A cheap smooth flow field: layered sines read as a gently turning current.
function flowAngle(x: number, y: number) {
  const s = settings.flowScale;
  const tt = t * settings.flowSpeed;
  return (
    Math.sin(x * s + tt) * 1.7 +
    Math.cos(y * s * 1.3 - tt * 0.8) * 1.7 +
    Math.sin((x + y) * s * 0.6 + tt * 0.5) * 1.2
  );
}

function step(dt: number) {
  t += dt / 60;
  const { radius, force, pointerMode, friction, jitter, flow, speed } = settings;
  const r2 = radius * radius;
  const damp = 1 - friction;

  for (const wv of waves) {
    if (wv.kind === 'implode') {
      // Contract to the centre, then fade once it arrives.
      wv.r = Math.max(0, wv.r - 7 * wv.speed * dt);
      wv.life = Math.min(wv.life, wv.r / 60 + 0.05) - (wv.r === 0 ? 1 : 0);
    } else if (wv.kind === 'sweep') {
      wv.r += 16 * wv.speed * wv.dir * dt;
      wv.life -= 0.008 * wv.decay * dt;
      if (wv.r < -100 || wv.r > Math.max(w, h) + 100) wv.life = 0;
    } else {
      wv.r += (wv.kind === 'ripple' || wv.kind === 'twist' ? 14 : 9) * wv.speed * dt;
      wv.life -= (wv.kind === 'ripple' || wv.kind === 'twist' ? 0.015 : 0.025) * wv.decay * dt;
    }
  }
  const cf = settings.clickForce;
  // Gather: hold the pointer (click mode), or the Gather action, which pulls
  // the whole field into an orb at the centre until pressed again.
  const holdGather = pointer.down && settings.click === 'gather';
  const gathering = holdGather || gatherAll;
  const gx = holdGather ? pointer.x : w / 2;
  const gy = holdGather ? pointer.y : h / 2;
  const gatherR = holdGather ? Math.max(150, radius * 2.5) : Math.hypot(w, h) * 0.6;
  const gatherMin = holdGather ? 0 : 0.35;
  const gatherCore = holdGather ? 30 : Math.min(w, h) * 0.18;
  if (pointer.down && settings.click === 'emit') emit(dt);
  // Hover behaviour pauses while gathering so the two don't fight.
  const usePointer = pointer.active && pointerMode !== 'none' && !gathering;

  // Audio. Each detected element drives its own effect:
  //   kick  → field pulse (expand, ease back) and/or a wave
  //   snare → swirl, a ripple, or a size flash
  //   hats  → sparkle (small kicks to a few particles)
  //   sub   → 808 / sub-bass swell on size, flow or speed
  //   energy (how far the music is above its recent average) → speed, flow
  const A = audio.levels;
  const on = audio.source !== 'off';
  const S = settings;
  const I = S.audioIntensity;
  const sub2 = on ? A.sub * A.sub * S.audioSubAmt * I : 0; // squared: swells, not a constant
  let speedNow = on ? speed * (1 + (A.liftLevel * 1.2 + A.level * 0.25) * S.audioSpeed * I) : speed;
  let flowNow = on ? flow * (1 + A.liftMid * 2 * S.audioFlow * I) : flow;
  if (S.audioSub === 'speed') speedNow *= 1 + sub2 * 1.2;
  if (S.audioSub === 'flow') flowNow = (flowNow || 0.2) * (1 + sub2 * 2.5);
  const jitterNow = jitter;

  const kickPulse = on && (S.audioKick === 'pulse' || S.audioKick === 'both');
  const kickWave = on && (S.audioKick === 'wave' || S.audioKick === 'both');
  // Pulse: an outward shove while the kick envelope rises and a gentle pull
  // back while it decays, so the field breathes in place.
  const dPulse = kickPulse ? A.pulse - lastPulse : 0;
  lastPulse = A.pulse;
  const kick = dPulse * (dPulse > 0 ? 3 : 2.5) * S.audioPulse * I;
  if (kickWave && A.beat && S.audioBeat !== 'none') beatWave(A.pulse);

  // Snare swirl: a twist on each hit, alternating direction.
  const dSnare = on ? Math.max(0, A.snareEnv - lastSnare) : 0;
  lastSnare = A.snareEnv;
  if (on && A.snare) swirlDir = -swirlDir;
  const swirl = S.audioSnare === 'swirl' ? dSnare * 2.2 * S.audioHits * I * swirlDir : 0;
  if (on && A.snare && S.audioSnare === 'wave') {
    addWave('ripple', w * (0.15 + Math.random() * 0.7), h * (0.15 + Math.random() * 0.7), { life: 0.3 + 0.5 * S.audioHits * I, soft: true, ring: S.audioWaveRings });
  }
  // Hat sparkle: nudge a few random particles.
  if (on && A.hat && S.audioHats === 'sparkle') {
    const m = Math.ceil(n * 0.05);
    for (let q = 0; q < m; q++) {
      const i = (Math.random() * n) | 0;
      const a = Math.random() * Math.PI * 2;
      vx[i] += Math.cos(a) * 1.4 * S.audioHits * I;
      vy[i] += Math.sin(a) * 1.4 * S.audioHits * I;
    }
  }
  const cx = w / 2;
  const cy = h / 2;
  for (let k = waves.length - 1; k >= 0; k--) if (waves[k].life <= 0) waves.splice(k, 1);

  for (let i = 0; i < n; i++) {
    let ax = (Math.random() - 0.5) * jitterNow;
    let ay = (Math.random() - 0.5) * jitterNow + settings.gravity * 0.05;

    if (flowNow > 0) {
      const a = flowAngle(px[i], py[i]);
      ax += Math.cos(a) * flowNow * 0.05;
      ay += Math.sin(a) * flowNow * 0.05;
    }

    if (kick !== 0) {
      const dx = px[i] - cx;
      const dy = py[i] - cy;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      // Outer particles move more, so it reads as the whole field expanding.
      const k = kick * Math.min(1, d / (Math.min(w, h) * 0.5));
      ax += (dx / d) * k;
      ay += (dy / d) * k;
    }

    if (swirl !== 0) {
      const dx = px[i] - cx;
      const dy = py[i] - cy;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      const k = swirl * Math.min(1, d / (Math.min(w, h) * 0.4));
      ax += (-dy / d) * k;
      ay += (dx / d) * k;
    }

    if (usePointer) {
      const dx = px[i] - pointer.x;
      const dy = py[i] - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        const d = Math.sqrt(d2) + 0.001;
        const f = (1 - d / radius) * force;
        const nx = dx / d;
        const ny = dy / d;
        if (pointerMode === 'repel') {
          ax += nx * f;
          ay += ny * f;
        } else if (pointerMode === 'attract') {
          ax -= nx * f * 0.6;
          ay -= ny * f * 0.6;
        } else {
          // Swirl around the pointer with a slight pull inward.
          ax += (-ny - nx * 0.25) * f;
          ay += (nx - ny * 0.25) * f;
        }
      }
    }

    if (gathering) {
      // Pull into a spinning orb: a spring towards the pointer plus a
      // tangential push, so particles orbit instead of collapsing to a dot.
      const dx = px[i] - gx;
      const dy = py[i] - gy;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      if (d < gatherR || gatherMin > 0) {
        const f = Math.max(gatherMin, 1 - d / gatherR) * cf;
        const nx = dx / d;
        const ny = dy / d;
        // Hold: ease off at the core. Full-field: each particle settles at its
        // own radius (spread evenly over a disc), so the orb fills in.
        const rest = holdGather ? 0 : gatherCore * Math.sqrt((i * 0.618034) % 1);
        const pull = holdGather ? Math.min(1, d / gatherCore) : Math.max(-1, Math.min(1, (d - rest) / 40));
        // Extra drag inside the well keeps the orb dense instead of a ring.
        const spin = holdGather ? 0.3 : 0.25 * Math.min(1, rest / gatherCore + 0.2);
        const drag = holdGather ? 0.08 : 0.12;
        ax += (-nx * 1.2 * pull - ny * spin) * f - vx[i] * drag * f;
        ay += (-ny * 1.2 * pull + nx * spin) * f - vy[i] * drag * f;
      }
    }

    for (const wv of waves) {
      const band = wv.width;
      if (wv.kind === 'sweep') {
        // A line across the screen pushing particles along its travel.
        const along = wv.angle === 0 ? px[i] : py[i];
        const off = along - wv.r;
        if (Math.abs(off) < band) {
          const prof = wv.soft ? Math.sin((off / band) * Math.PI) * 0.7 : 1 - Math.abs(off) / band;
          const f = prof * wv.life * 1.6 * wv.force * wv.dir;
          if (wv.angle === 0) ax += f;
          else ay += f;
        }
        continue;
      }
      const dx = px[i] - wv.x;
      const dy = py[i] - wv.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const off = d - wv.r;
      if (Math.abs(off) < band) {
        const nx = dx / d;
        const ny = dy / d;
        const edge = 1 - Math.abs(off) / band;
        let f: number;
        // Smooth push-then-pull profile used by ripples and soft waves.
        const wobble = Math.sin((off / band) * Math.PI);
        if (wv.soft && wv.kind !== 'twist') {
          let m = 1;
          if (wv.kind === 'star') m = Math.max(0, Math.cos(3 * (Math.atan2(dy, dx) - wv.angle))) ** 6 * 2.5;
          f = wobble * wv.life * 0.7 * m * (wv.kind === 'implode' ? -1 : 1);
        } else if (wv.kind === 'ripple') {
          // Push ahead of the ring, pull behind it: particles bob as it
          // passes and settle back near where they were.
          f = wobble * wv.life * 0.9;
        } else if (wv.kind === 'implode') {
          f = -edge * wv.life * 1.4;
        } else if (wv.kind === 'twist') {
          const t2 = edge * wv.life * 1.6 * wv.force * wv.dir;
          ax += -ny * t2;
          ay += nx * t2;
          continue;
        } else if (wv.kind === 'star') {
          // Six spokes: only push where the angle lines up with one.
          const m = Math.max(0, Math.cos(3 * (Math.atan2(dy, dx) - wv.angle)));
          f = edge * wv.life * 3 * m ** 6;
        } else {
          f = edge * wv.life * 2.2;
        }
        f *= wv.force;
        ax += nx * f;
        ay += ny * f;
      }
    }

    vx[i] = (vx[i] + ax * dt) * Math.pow(damp, dt);
    vy[i] = (vy[i] + ay * dt) * Math.pow(damp, dt);
    ox[i] = px[i];
    oy[i] = py[i];
    px[i] += vx[i] * speedNow * dt;
    py[i] += vy[i] * speedNow * dt;

    if (px[i] < 0 || px[i] >= w || py[i] < 0 || py[i] >= h) {
      if (flow > 0) {
        // The flow field isn't periodic, so wrapping would trap particles on
        // the seam where opposing currents meet. Respawn somewhere instead.
        px[i] = ox[i] = Math.random() * w;
        py[i] = oy[i] = Math.random() * h;
      } else {
        px[i] = ox[i] = ((px[i] % w) + w) % w;
        py[i] = oy[i] = ((py[i] % h) + h) % h;
      }
    }
  }
}

// A fountain: while held, recycle random particles out of the pointer.
let emitCarry = 0;
let emitCursor = 0;
function emit(dt: number) {
  emitCarry += n * 0.006 * settings.clickForce * dt;
  while (emitCarry >= 1 && n > 0) {
    emitCarry--;
    const i = emitCursor++ % n;
    const a = Math.random() * Math.PI * 2;
    const v = 1.5 + Math.random() * 3;
    px[i] = ox[i] = pointer.x + Math.cos(a) * 3;
    py[i] = oy[i] = pointer.y + Math.sin(a) * 3;
    vx[i] = Math.cos(a) * v;
    vy[i] = Math.sin(a) * v;
  }
}

// --- rendering ---------------------------------------------------------------

// Pre-built colour lookup: 64 steps along the palette, as CSS strings.
const SHADES = 64;
let shades: string[] = [];

function buildShades() {
  spriteCache.clear();
  const stops = pal().stops;
  shades = [];
  for (let k = 0; k < SHADES; k++) {
    const u = (k / (SHADES - 1)) * (stops.length - 1);
    const a = stops[Math.floor(u)];
    const b = stops[Math.min(stops.length - 1, Math.floor(u) + 1)];
    const f = u - Math.floor(u);
    const mix = (i: number) => a[i] + (b[i] - a[i]) * f;
    shades.push(`hsl(${mix(0).toFixed(1)} ${mix(1).toFixed(1)}% ${mix(2).toFixed(1)}%)`);
  }
}

// Folds a cyclic 0..1 value so non-cyclic palettes go calm → hot → calm
// instead of jumping from one end to the other.
function loop(u: number) {
  return pal().cyclic ? u : 1 - Math.abs(u * 2 - 1);
}

// Speed is normalised by the field's own average, so "fast" means fast
// relative to the current settings rather than an absolute number.
let meanSpeed = 1;

function shadeIndex(i: number) {
  let u: number;
  switch (settings.colorBy) {
    case 'speed': {
      const v = Math.hypot(vx[i], vy[i]) / (meanSpeed * 2.5 + 1e-3);
      u = Math.sqrt(Math.min(1, v));
      break;
    }
    case 'direction':
      u = loop(Math.atan2(vy[i], vx[i]) / (Math.PI * 2) + 0.5);
      break;
    case 'pointer': {
      // Hot near the pointer, fading out over three radii.
      if (!pointer.active) { u = 0; break; }
      const d = Math.hypot(px[i] - pointer.x, py[i] - pointer.y);
      u = Math.max(0, 1 - d / (settings.radius * 3)) ** 2;
      break;
    }
    case 'horizontal':
      u = px[i] / w;
      break;
    case 'vertical':
      u = 1 - py[i] / h;
      break;
    case 'radial': {
      const dx = px[i] - w / 2;
      const dy = py[i] - h / 2;
      u = 1 - Math.min(1, Math.hypot(dx, dy) / (Math.hypot(w, h) / 2));
      break;
    }
    case 'cycle':
      // Diagonal bands of colour sweep across the field; particles pick up
      // the colour of wherever they are, so the flow shows through the bands.
      u = loop((px[i] / w * 0.9 + py[i] / h * 0.4 + tone[i] * 0.08 + t * 0.06) % 1);
      break;
    case 'audio':
      // Calm colours in quiet passages, the hot end of the palette on loud ones.
      u = Math.min(1, tone[i] * 0.3 + audio.levels.level * 0.85);
      break;
    default:
      u = tone[i];
  }
  return Math.max(0, Math.min(SHADES - 1, (u * SHADES) | 0));
}

function audioSizeBoost() {
  if (audio.source === 'off') return 1;
  const L = audio.levels;
  const S = settings;
  let b = 1;
  if (S.audioKick === 'pulse' || S.audioKick === 'both') b += L.pulse * 0.7 * S.audioPulse * S.audioIntensity;
  if (S.audioSnare === 'flash') b += L.snareEnv * 1.5 * S.audioHits * S.audioIntensity;
  if (S.audioSub === 'size') b += L.sub * L.sub * 1.2 * S.audioSubAmt * S.audioIntensity;
  return b;
}

// --- sprites -----------------------------------------------------------------

type SpriteStyle = 'circles' | 'glow' | 'bokeh' | 'rings' | 'sparkles';
// scale: drawn size relative to the Size setting; alpha: overall opacity.
const SPRITES: Record<SpriteStyle, { scale: number; alpha: number }> = {
  circles: { scale: 1.4, alpha: 1 },
  glow: { scale: 6, alpha: 1 },
  bokeh: { scale: 10, alpha: 0.35 },
  rings: { scale: 4, alpha: 0.9 },
  sparkles: { scale: 6, alpha: 1 },
};
const SPRITE_PX = 48;
const spriteCache = new Map<string, HTMLCanvasElement>();

function spriteFor(style: SpriteStyle, k: number) {
  const key = `${style}:${k}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SPRITE_PX;
  const g = c.getContext('2d')!;
  const m = SPRITE_PX / 2;
  const col = shades[k];
  if (style === 'circles') {
    g.fillStyle = col;
    g.beginPath();
    g.arc(m, m, m - 1, 0, Math.PI * 2);
    g.fill();
  } else if (style === 'glow' || style === 'bokeh') {
    const grad = g.createRadialGradient(m, m, 0, m, m, m);
    if (style === 'glow') {
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.12, col);
      grad.addColorStop(0.35, withAlpha(col, 0.35));
      grad.addColorStop(1, withAlpha(col, 0));
    } else {
      // Bokeh: a soft disc with a slightly brighter rim, like an
      // out-of-focus light.
      grad.addColorStop(0, withAlpha(col, 0.5));
      grad.addColorStop(0.8, withAlpha(col, 0.6));
      grad.addColorStop(0.92, withAlpha(col, 0.9));
      grad.addColorStop(1, withAlpha(col, 0));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  } else if (style === 'rings') {
    g.strokeStyle = col;
    g.lineWidth = SPRITE_PX * 0.08;
    g.beginPath();
    g.arc(m, m, m * 0.8, 0, Math.PI * 2);
    g.stroke();
  } else {
    // Sparkle: a four-point star with a soft halo.
    const grad = g.createRadialGradient(m, m, 0, m, m, m * 0.5);
    grad.addColorStop(0, withAlpha(col, 0.6));
    grad.addColorStop(1, withAlpha(col, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
    g.fillStyle = col;
    g.beginPath();
    const r1 = m;
    const r2 = m * 0.12;
    for (let p = 0; p < 8; p++) {
      const a = (p * Math.PI) / 4 - Math.PI / 2;
      const r = p % 2 ? r2 : r1;
      g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(m, m, m * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  spriteCache.set(key, c);
  return c;
}

function withAlpha(hsl: string, a: number) {
  return hsl.replace(')', ` / ${a})`);
}

// --- glyphs ------------------------------------------------------------------

const FONTS: Record<GlyphFont, string> = {
  mono: 'ui-monospace, Menlo, monospace',
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'system-ui, sans-serif',
  bold: '800 {px} system-ui, sans-serif',
};
let glyphChars: string[] = [];

function buildGlyphs() {
  const src = settings.glyphSet === 'custom' ? settings.glyphText || '?' : GLYPH_SETS[settings.glyphSet]?.chars ?? '?';
  // Array.from keeps multi-byte characters (and emoji) whole.
  glyphChars = Array.from(src).filter((c) => settings.glyphSet !== 'custom' || c.trim() !== '' || src.trim() === '');
  if (!glyphChars.length) glyphChars = ['?'];
}

// Called once per frame: glyph changes over time.
function updateGlyphs() {
  if (settings.render !== 'glyphs') return;
  const { glyphChange, glyphRate } = settings;
  if (glyphChange === 'flicker' && glyphRate > 0) {
    // Expected number of changes this frame, without looping over all.
    let m = n * glyphRate;
    while (m > 0) {
      if (m >= 1 || Math.random() < m) gl[(Math.random() * n) | 0] = Math.random();
      m--;
    }
  } else if (glyphChange === 'beat' && audio.levels.beat) {
    for (let i = 0; i < n; i++) if (Math.random() < 0.5) gl[i] = Math.random();
  }
}

function glyphFor(i: number) {
  const L = glyphChars.length;
  let g: number;
  switch (settings.glyphPick) {
    case 'speed':
      g = Math.min(L - 1, Math.floor(Math.min(1, Math.hypot(vx[i], vy[i]) / (meanSpeed * 2.2 + 1e-3)) * L));
      break;
    case 'heading': {
      const a = (Math.atan2(vy[i], vx[i]) + Math.PI * 2) % (Math.PI * 2);
      g = Math.round((a / (Math.PI * 2)) * L) % L;
      break;
    }
    case 'sequence':
      g = i % L;
      break;
    default:
      g = (gl[i] * L) | 0;
  }
  return glyphChars[g];
}

function drawGlyphs(list: number[], k: number, s: number) {
  const size = Math.max(6, s * 5 * settings.glyphScale);
  const f = FONTS[settings.glyphFont];
  ctx.font = f.includes('{px}') ? f.replace('{px}', `${size.toFixed(1)}px`) : `${size.toFixed(1)}px ${f}`;
  ctx.fillStyle = shades[k];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rot = settings.glyphRotate;
  if (rot === 'none') {
    for (const i of list) ctx.fillText(glyphFor(i), px[i], py[i]);
    return;
  }
  for (const i of list) {
    const a = rot === 'heading' ? Math.atan2(vy[i], vx[i]) : t * (1 + tone[i] * 2) * (tone[i] < 0.5 ? -1 : 1) + gl[i] * 6.28;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    ctx.setTransform(c * dpr, sn * dpr, -sn * dpr, c * dpr, px[i] * dpr, py[i] * dpr);
    ctx.fillText(glyphFor(i), 0, 0);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Buckets let us draw every particle of one colour in a single path.
const buckets: number[][] = Array.from({ length: SHADES }, () => []);

// Draws one bucket of particles (all the same colour) in one style.
function drawStyle(style: Render, list: number[], k: number, s: number) {
  const sprite = SPRITES[style as SpriteStyle];
  if (sprite) {
    // Pre-rendered shapes, stamped with drawImage: much faster than a path
    // per particle for soft or curved shapes.
    const img = spriteFor(style as SpriteStyle, k);
    const d = s * sprite.scale;
    ctx.globalAlpha = sprite.alpha;
    for (const i of list) ctx.drawImage(img, px[i] - d / 2, py[i] - d / 2, d, d);
    ctx.globalAlpha = 1;
  } else if (style === 'arrows') {
    // Small triangles pointing where each particle is heading.
    ctx.fillStyle = shades[k];
    ctx.beginPath();
    const L = s * 2.2;
    for (const i of list) {
      const v = Math.hypot(vx[i], vy[i]) + 1e-6;
      const ux = vx[i] / v;
      const uy = vy[i] / v;
      ctx.moveTo(px[i] + ux * L, py[i] + uy * L);
      ctx.lineTo(px[i] - ux * L * 0.6 - uy * L * 0.55, py[i] - uy * L * 0.6 + ux * L * 0.55);
      ctx.lineTo(px[i] - ux * L * 0.6 + uy * L * 0.55, py[i] - uy * L * 0.6 - ux * L * 0.55);
      ctx.closePath();
    }
    ctx.fill();
  } else if (style === 'comets') {
    // A thin tapering tail plus a bright head.
    ctx.strokeStyle = shades[k];
    ctx.lineWidth = Math.max(0.5, s * 0.5);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (const i of list) {
      ctx.moveTo(px[i] - vx[i] * 9, py[i] - vy[i] * 9);
      ctx.lineTo(px[i], py[i]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    const img = spriteFor('glow', k);
    const d = s * 3;
    for (const i of list) ctx.drawImage(img, px[i] - d / 2, py[i] - d / 2, d, d);
  } else if (style === 'glyphs') {
    drawGlyphs(list, k, s);
  } else if (style === 'streaks') {
    ctx.strokeStyle = shades[k];
    ctx.lineWidth = s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const i of list) {
      // Stretch the streak along velocity so slow particles still read as dots.
      ctx.moveTo(px[i] - vx[i] * 3, py[i] - vy[i] * 3);
      ctx.lineTo(px[i], py[i]);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = shades[k];
    ctx.beginPath();
    for (const i of list) ctx.rect(px[i] - s / 2, py[i] - s / 2, s, s);
    ctx.fill();
  }
}

const MIXABLE: [string, string][] = [
  ['dots', 'Pixels'], ['circles', 'Circles'], ['glow', 'Glow'], ['bokeh', 'Bokeh'], ['rings', 'Rings'],
  ['sparkles', 'Sparkles'], ['arrows', 'Arrows'], ['streaks', 'Streaks'], ['comets', 'Comets'], ['glyphs', 'Glyphs'],
];

function mixStyles(): Render[] {
  const list = settings.mixStyles.split(',').filter((x) => MIXABLE.some(([k]) => k === x)) as Render[];
  return list.length ? list : ['circles'];
}

// A fixed pseudo-random 0..1 per particle index.
function styleHash(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function draw() {
  const [r, g, b] = pal().bg;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgb(${r} ${g} ${b} / ${(1 - settings.trail * 0.97).toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
  const light = r * 0.3 + g * 0.59 + b * 0.11 > 140;
  ctx.globalCompositeOperation = settings.glow ? (light ? 'multiply' : 'lighter') : 'source-over';

  if (settings.colorBy === 'speed' || (settings.render === 'glyphs' && settings.glyphPick === 'speed')) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.hypot(vx[i], vy[i]);
    meanSpeed = meanSpeed * 0.9 + (sum / Math.max(1, n)) * 0.1;
  }
  for (const bk of buckets) bk.length = 0;
  for (let i = 0; i < n; i++) buckets[shadeIndex(i)].push(i);

  if (settings.render === 'links') drawLinks();

  const s = settings.size * audioSizeBoost();
  if (settings.render === 'mixed') {
    // Each particle keeps one style from the mix, picked by its index.
    const mix = mixStyles();
    const parts: number[][] = mix.map(() => []);
    for (let k = 0; k < SHADES; k++) {
      const list = buckets[k];
      if (!list.length) continue;
      for (const p of parts) p.length = 0;
      for (const i of list) parts[(styleHash(i) * mix.length) | 0].push(i);
      mix.forEach((st, m) => parts[m].length && drawStyle(st, parts[m], k, s));
    }
  } else {
    for (let k = 0; k < SHADES; k++) if (buckets[k].length) drawStyle(settings.render, buckets[k], k, s);
  }

  // Wave rings.
  ctx.globalCompositeOperation = 'source-over';
  for (const wv of waves) {
    if (wv.life <= 0 || !wv.ring) continue;
    const a = Math.min(1, wv.life) * (wv.kind === 'ripple' || wv.kind === 'twist' ? 0.12 : 0.22);
    ctx.strokeStyle = `rgb(255 255 255 / ${a.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (wv.kind === 'sweep') {
      if (wv.angle === 0) {
        ctx.moveTo(wv.r, 0);
        ctx.lineTo(wv.r, h);
      } else {
        ctx.moveTo(0, wv.r);
        ctx.lineTo(w, wv.r);
      }
    } else if (wv.kind === 'star') {
      for (let k = 0; k < 6; k++) {
        const an = wv.angle + (k * Math.PI) / 3;
        ctx.moveTo(wv.x + Math.cos(an) * Math.max(0, wv.r - 30), wv.y + Math.sin(an) * Math.max(0, wv.r - 30));
        ctx.lineTo(wv.x + Math.cos(an) * wv.r, wv.y + Math.sin(an) * wv.r);
      }
    } else {
      ctx.arc(wv.x, wv.y, Math.max(0, wv.r), 0, Math.PI * 2);
    }
    ctx.stroke();
  }
}

// Spatial grid: only compare particles in neighbouring cells. Heads and
// next-pointers live in typed arrays (no Map), and each particle draws at
// most MAX_LINKS lines, so dense clumps don't explode into thousands of
// overlapping strokes.
const LINK_LEVELS = 3;
const MAX_LINKS = 4;
let cellHead = new Int32Array(0);
let cellNext = new Int32Array(0);
let linkCount = new Uint8Array(0);
// Total line budget per frame, adjusted to keep the frame rate up.
let linkBudget = 4000;
const segs: Float32Array[] = Array.from({ length: LINK_LEVELS }, () => new Float32Array(0));
const segN = new Int32Array(LINK_LEVELS);

function drawLinks() {
  const d = settings.linkDist;
  const d2max = d * d;
  const cols = Math.ceil(w / d) + 2;
  const rows = Math.ceil(h / d) + 2;
  if (cellHead.length < cols * rows) cellHead = new Int32Array(cols * rows);
  cellHead.fill(-1);
  if (cellNext.length < cap) {
    cellNext = new Int32Array(cap);
    linkCount = new Uint8Array(cap);
  }
  linkCount.fill(0, 0, n);
  for (let i = 0; i < n; i++) {
    const key = ((py[i] / d) | 0) * cols + ((px[i] / d) | 0);
    cellNext[i] = cellHead[key];
    cellHead[key] = i;
  }
  const budget0 = Math.round(linkBudget);
  for (let l = 0; l < LINK_LEVELS; l++) {
    if (segs[l].length < budget0 * 4) segs[l] = new Float32Array(budget0 * 4);
    segN[l] = 0;
  }

  let budget = budget0;
  for (let i = 0; i < n && budget > 0; i++) {
    if (linkCount[i] >= MAX_LINKS) continue;
    const cx = (px[i] / d) | 0;
    const cy = (py[i] / d) | 0;
    // Half-neighbourhood (this cell, right, and the row below) so each pair
    // is visited once.
    for (let q = 0; q < 5 && linkCount[i] < MAX_LINKS; q++) {
      const ox2 = q === 0 ? 0 : q === 1 ? 1 : q - 3; // 0, 1, -1, 0, 1
      const oy2 = q < 2 ? 0 : 1;
      const gx = cx + ox2;
      if (gx < 0 || gx >= cols) continue;
      let j = cellHead[(cy + oy2) * cols + gx];
      while (j !== -1 && linkCount[i] < MAX_LINKS) {
        if ((q > 0 || j > i) && linkCount[j] < MAX_LINKS) {
          const dx = px[j] - px[i];
          const dy = py[j] - py[i];
          const dd = dx * dx + dy * dy;
          if (dd < d2max) {
            const level = Math.min(LINK_LEVELS - 1, ((1 - Math.sqrt(dd) / d) * LINK_LEVELS) | 0);
            const o = segN[level] * 4;
            const sg = segs[level];
            sg[o] = px[i];
            sg[o + 1] = py[i];
            sg[o + 2] = px[j];
            sg[o + 3] = py[j];
            segN[level]++;
            linkCount[i]++;
            linkCount[j]++;
            if (--budget <= 0) break;
          }
        }
        j = cellNext[j];
      }
    }
  }

  const stops = pal().stops;
  const [hh, ss, ll] = stops[Math.floor(stops.length / 2)];
  ctx.lineWidth = 0.8;
  for (let l = 0; l < LINK_LEVELS; l++) {
    const m = segN[l];
    if (!m) continue;
    const sg = segs[l];
    ctx.strokeStyle = `hsl(${hh} ${ss}% ${ll}% / ${(((l + 1) / LINK_LEVELS) * 0.4).toFixed(3)})`;
    ctx.beginPath();
    for (let k = 0; k < m * 4; k += 4) {
      ctx.moveTo(sg[k], sg[k + 1]);
      ctx.lineTo(sg[k + 2], sg[k + 3]);
    }
    ctx.stroke();
  }
}

// --- loop --------------------------------------------------------------------

let last = performance.now();
let fps = 60;

function frame(now: number) {
  // dt is in 60fps frames, clamped so a background tab doesn't explode the sim.
  const dt = Math.min(3, (now - last) / (1000 / 60));
  last = now;
  fps = fps * 0.95 + (60 / Math.max(dt, 0.001)) * 0.05;
  if (!paused) adaptQuality(dt);
  audio.genre = settings.audioGenre;
  audio.update(now);
  if (!paused) {
    updateGlyphs();
    step(dt);
    draw();
  }
  requestAnimationFrame(frame);
}

// Auto quality: slow devices (phones especially) get fewer constellation
// lines and, if that isn't enough, a lower canvas resolution. Fast ones
// climb back up.
let renderScale = 1;
let slowFrames = 0;
let fastFrames = 0;

function adaptQuality(dt: number) {
  if (settings.render === 'links') {
    if (dt > 1.3) linkBudget = Math.max(400, linkBudget * 0.92);
    else if (dt < 1.1) linkBudget = Math.min(6000, linkBudget * 1.02);
  }
  if (dt > 1.4) {
    slowFrames++;
    fastFrames = 0;
  } else if (dt < 1.1) {
    fastFrames++;
    slowFrames = Math.max(0, slowFrames - 1);
  }
  // ~2 s mostly slow → drop resolution a step; ~6 s smooth → raise it.
  if (slowFrames > 60 && renderScale > 0.5) {
    renderScale = Math.max(0.5, renderScale - 0.25);
    slowFrames = 0;
    resize();
  } else if (fastFrames > 360 && renderScale < 1) {
    renderScale = Math.min(1, renderScale + 0.25);
    fastFrames = 0;
    resize();
  }
}

// --- controls ----------------------------------------------------------------

type Control = ControlBody & { show?: () => boolean };
type ControlBody =
  | { kind: 'section'; id: string; label: string; open?: boolean; fixed?: boolean; summary?: () => string; lock?: (keyof Settings)[] }
  | { kind: 'mypresets' }
  | { kind: 'sub'; label: string }
  | { kind: 'range'; key: keyof Settings; label: string; min: number; max: number; step: number; format?: (v: number) => string }
  | { kind: 'select'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'toggle'; key: keyof Settings; label: string }
  | { kind: 'choice'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'color'; key: keyof Settings; label: string }
  | { kind: 'colors'; key: keyof Settings; label: string }
  | { kind: 'multi'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'text'; key: keyof Settings; label: string; placeholder?: string }
  | { kind: 'buttons'; buttons: [string, () => void][]; active?: (text: string) => boolean }
  | { kind: 'icons'; buttons: [string, string, () => void][] }
  | { kind: 'note'; text: string }
  | { kind: 'swatch' }
  | { kind: 'audio' };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const label = (options: [string, string][], v: unknown) => options.find(([k]) => k === v)?.[1] ?? '';

const POINTER_MODES: [string, string][] = [['repel', 'Repel'], ['attract', 'Attract'], ['vortex', 'Vortex'], ['none', 'Off']];
const CLICK_MODES: [string, string][] = [['gather', 'Gather (hold)'], ['emit', 'Fountain (hold)'], ['ripple', 'Ripple'], ['implode', 'Implode'], ['shockwave', 'Shockwave'], ['none', 'Nothing']];
const RENDERS: [string, string][] = [
  ['dots', 'Pixels'], ['circles', 'Circles'], ['glow', 'Glow orbs'], ['bokeh', 'Bokeh'], ['rings', 'Rings'],
  ['sparkles', 'Sparkles'], ['arrows', 'Arrows'], ['streaks', 'Streaks'], ['comets', 'Comets'], ['glyphs', 'Glyphs'],
  ['links', 'Constellation'], ['mixed', 'Mixed'],
];
const COLOR_BY: [string, string][] = [['palette', 'Random'], ['speed', 'Speed'], ['direction', 'Heading'], ['pointer', 'Pointer heat'], ['cycle', 'Colour waves'], ['horizontal', 'Left → right'], ['vertical', 'Bottom → top'], ['radial', 'Centre glow'], ['audio', 'Music energy']];

const BEAT_ACTIONS: [string, string][] = [['ripple', 'Ripple'], ['twist', 'Twist'], ['shockwave', 'Shockwave'], ['star', 'Star burst'], ['sweep', 'Sweep line'], ['implode', 'Implode'], ['mix', 'Mix (cycle)'], ['random', 'Mix (random)']];
// Vibes: how the music moves the particles. They only set the reaction
// (what each drum does and how strongly), never the detection, so any
// vibe works with any genre.
type Vibe = Partial<Settings>;
const quiet: Vibe = {
  audioKick: 'pulse', audioPulse: 0.6, audioBeat: 'ripple', audioWaveAt: 'centre', audioWaveEvery: 1,
  audioWaveForce: 1, audioWaveSpeed: 1, audioWaveReach: 1, audioWaveWidth: 1, audioWaveAccent: true, audioWaveFeel: 'soft', audioWaveRings: false,
  audioSnare: 'none', audioHats: 'none', audioHits: 0.5, audioSub: 'none', audioSubAmt: 0.5, audioSpeed: 0.3, audioFlow: 0.4,
};
const VIBES: [string, Vibe][] = [
  ['Breathe', { ...quiet, audioPulse: 0.9, audioSub: 'size', audioSubAmt: 0.4, audioSpeed: 0.15, audioFlow: 0.3 }],
  ['Groove', { ...quiet, audioPulse: 0.6, audioSnare: 'swirl', audioHits: 0.5, audioSub: 'flow', audioSubAmt: 0.6, audioSpeed: 0.3, audioFlow: 0.5 }],
  ['Bounce', { ...quiet, audioKick: 'both', audioPulse: 0.9, audioBeat: 'ripple', audioSnare: 'wave', audioHats: 'sparkle', audioHits: 0.6, audioSub: 'size', audioSubAmt: 0.7, audioSpeed: 0.4 }],
  ['Hypnotic', { ...quiet, audioKick: 'both', audioPulse: 0.3, audioBeat: 'twist', audioWaveAt: 'orbit', audioWaveReach: 1.6, audioWaveSpeed: 0.7, audioHats: 'sparkle', audioHits: 0.3, audioSub: 'flow', audioSubAmt: 0.8, audioSpeed: 0.1, audioFlow: 0.8 }],
  ['Liquid', { ...quiet, audioKick: 'both', audioPulse: 0.4, audioBeat: 'ripple', audioWaveEvery: 4, audioWaveReach: 2.2, audioWaveWidth: 2, audioWaveSpeed: 0.6, audioSnare: 'swirl', audioHits: 0.7, audioSub: 'flow', audioSubAmt: 1.2, audioSpeed: 0.2, audioFlow: 1 }],
  ['Kaleido', { ...quiet, audioKick: 'both', audioPulse: 0.5, audioBeat: 'star', audioWaveAt: 'mirror', audioWaveReach: 1.3, audioSnare: 'swirl', audioHits: 0.5, audioSub: 'size', audioSubAmt: 0.5, audioSpeed: 0.2 }],
  ['Glitch', { ...quiet, audioWaveFeel: 'punchy', audioKick: 'wave', audioBeat: 'sweep', audioWaveForce: 1.4, audioWaveSpeed: 1.6, audioSnare: 'flash', audioHats: 'sparkle', audioHits: 1.1, audioSpeed: 0.5, audioFlow: 0.2 }],
  ['Storm', { ...quiet, audioWaveFeel: 'punchy', audioKick: 'both', audioPulse: 1.2, audioBeat: 'shockwave', audioWaveAt: 'random', audioSnare: 'flash', audioHats: 'sparkle', audioHits: 0.9, audioSub: 'speed', audioSubAmt: 0.8, audioSpeed: 0.9, audioFlow: 1.2 }],
];

function applyVibe(v: Vibe) {
  Object.assign(settings, v);
  changed(new Set(Object.keys(v) as (keyof Settings)[]));
}

// A random combination, not just a random preset.
function surpriseVibe() {
  const kick = pick(['pulse', 'wave', 'both', 'both'] as const);
  applyVibe({
    ...quiet,
    audioKick: kick,
    audioPulse: rand(0.3, 1.2, 0.05),
    audioBeat: pick(['ripple', 'twist', 'shockwave', 'star', 'sweep', 'implode', 'mix', 'random'] as const),
    audioWaveAt: pick(['centre', 'orbit', 'mirror', 'corners', 'random'] as const),
    audioWaveEvery: pick([1, 1, 2, 4] as const),
    audioWaveReach: rand(0.6, 2, 0.05),
    audioWaveSpeed: rand(0.6, 1.6, 0.05),
    audioWaveWidth: rand(0.6, 2, 0.05),
    audioSnare: pick(['swirl', 'wave', 'flash', 'none'] as const),
    audioHats: pick(['sparkle', 'none'] as const),
    audioHits: rand(0.3, 1, 0.05),
    audioSub: pick(['size', 'flow', 'speed', 'none'] as const),
    audioSubAmt: rand(0.3, 1, 0.05),
    audioSpeed: rand(0.1, 0.7, 0.05),
    audioFlow: rand(0.2, 1, 0.05),
  });
}

const GENRES: [string, string][] = [['general', 'Any'], ['hiphop', 'Rap / drill'], ['dnb', 'Drum & bass'], ['afro', 'Afro'], ['reggae', 'Reggae'], ['techno', 'Techno']];
const ft = () => settings.audioFineTune;
const kickPulse = () => settings.audioKick === 'pulse' || settings.audioKick === 'both';
const kickWave = () => settings.audioKick === 'wave' || settings.audioKick === 'both';
const AUDIO_LABELS = { off: 'off', mic: 'microphone', tab: 'shared tab', file: 'file' } as const;

const isGlyphs = () => settings.render === 'glyphs' || (settings.render === 'mixed' && settings.mixStyles.split(',').includes('glyphs'));
const hasFlow = () => settings.flow > 0;
const hasPointer = () => settings.pointerMode !== 'none';
const hasClick = () => settings.click !== 'none';

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  gather: svg('<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M4 4l4 4M20 4l-4 4M4 20l4-4M20 20l-4-4"/><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>'),
  clear: svg('<path d="M4 20h16"/><path d="M14.5 4.5l5 5L11 18H6.5L4 15.5z"/><path d="M9.5 9.5l5 5"/>'),
  scatter: svg('<circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
  shuffle: svg('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>'),
  reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
};

const CONTROLS: Control[] = [
  { kind: 'section', id: 'presets', label: 'Presets', open: true },
  { kind: 'buttons', buttons: [] }, // filled with presets below
  { kind: 'mypresets' },

  { kind: 'section', id: 'particles', label: 'Particles', open: true, lock: ['count', 'size', 'speed', 'friction', 'jitter', 'gravity'],
    summary: () => `${settings.count.toLocaleString()}, ${settings.speed.toFixed(1)}× speed` },
  { kind: 'range', key: 'count', label: 'Count', min: 100, max: 8000, step: 100 },
  { kind: 'range', key: 'size', label: 'Size', min: 0.5, max: 6, step: 0.1, format: (v) => `${v.toFixed(1)}px` },
  { kind: 'range', key: 'speed', label: 'Speed', min: 0.1, max: 4, step: 0.1, format: (v) => `${v.toFixed(1)}×` },
  { kind: 'range', key: 'friction', label: 'Friction', min: 0, max: 0.2, step: 0.005, format: pct },
  { kind: 'range', key: 'jitter', label: 'Jitter', min: 0, max: 0.5, step: 0.01, format: (v) => v.toFixed(2) },
  { kind: 'range', key: 'gravity', label: 'Gravity', min: -1, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : v > 0 ? `↓ ${v.toFixed(2)}` : `↑ ${(-v).toFixed(2)}`) },

  { kind: 'section', id: 'flow', label: 'Flow', lock: ['flow', 'flowScale', 'flowSpeed'],
    summary: () => (hasFlow() ? `strength ${settings.flow.toFixed(2)}` : 'off') },
  { kind: 'range', key: 'flow', label: 'Strength', min: 0, max: 2, step: 0.05, format: (v) => (v === 0 ? 'off' : v.toFixed(2)) },
  { kind: 'range', key: 'flowScale', label: 'Scale', min: 0.001, max: 0.02, step: 0.0005, format: (v) => (v * 1000).toFixed(1), show: hasFlow },
  { kind: 'range', key: 'flowSpeed', label: 'Turning', min: 0, max: 2, step: 0.05, format: (v) => v.toFixed(2), show: hasFlow },

  { kind: 'section', id: 'pointer', label: 'Pointer', lock: ['pointerMode', 'radius', 'force'],
    summary: () => label(POINTER_MODES, settings.pointerMode) + (hasPointer() ? `, ${settings.radius}px` : '') },
  { kind: 'select', key: 'pointerMode', label: 'On hover', options: POINTER_MODES },
  { kind: 'range', key: 'radius', label: 'Radius', min: 20, max: 400, step: 5, format: (v) => `${v}px`, show: hasPointer },
  { kind: 'range', key: 'force', label: 'Force', min: 0.05, max: 2, step: 0.05, format: (v) => v.toFixed(2), show: hasPointer },

  { kind: 'section', id: 'click', label: 'Click', lock: ['click', 'clickForce'], summary: () => label(CLICK_MODES, settings.click) },
  { kind: 'select', key: 'click', label: 'On click', options: CLICK_MODES },
  { kind: 'range', key: 'clickForce', label: 'Strength', min: 0.2, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×`, show: hasClick },

  { kind: 'section', id: 'audio', label: 'Audio', open: true, summary: () => AUDIO_LABELS[audio.source] + (audio.source === 'off' ? '' : `, ${GENRES.find(([k]) => k === settings.audioGenre)?.[1]}, ${VIBES.find(([, v]) => Object.entries(v).every(([k, x]) => settings[k as keyof Settings] === x))?.[0] ?? 'custom'}`) },
  { kind: 'audio' },
  { kind: 'sub', label: 'Genre' },
  { kind: 'choice', key: 'audioGenre', label: 'Genre', options: GENRES },
  { kind: 'note', text: 'Tunes how kicks, snares, hats and 808s are picked out.' },
  { kind: 'sub', label: 'Vibe' },
  {
    kind: 'buttons',
    buttons: [...VIBES.map(([name, v]) => [name, () => applyVibe(v)] as [string, () => void]), ['Surprise me', surpriseVibe]],
    // Lit while every setting of the vibe is unchanged.
    active: (name) => {
      const v = VIBES.find(([n]) => n === name)?.[1];
      return !!v && Object.entries(v).every(([k, x]) => settings[k as keyof Settings] === x);
    },
  },
  { kind: 'range', key: 'audioIntensity', label: 'Intensity', min: 0, max: 2, step: 0.05, format: pct },
  { kind: 'toggle', key: 'audioFineTune', label: 'Fine-tune each drum' },
  { kind: 'sub', label: 'Kick', show: ft },
  { kind: 'select', key: 'audioKick', label: 'Kick does', options: [['pulse', 'Pulse the field'], ['wave', 'Send a wave'], ['both', 'Pulse + wave'], ['none', 'Nothing']], show: ft },
  { kind: 'range', key: 'audioPulse', label: 'Pulse strength', min: 0, max: 2, step: 0.05, format: pct, show: () => ft() && kickPulse() },
  { kind: 'select', key: 'audioBeat', label: 'Wave type', options: BEAT_ACTIONS, show: () => ft() && kickWave() },
  { kind: 'select', key: 'audioWaveAt', label: 'Waves from', options: [['centre', 'Centre'], ['orbit', 'Orbit the centre'], ['mirror', 'Mirrored pair'], ['corners', 'Corners in turn'], ['pointer', 'Pointer'], ['random', 'Random spot']], show: () => ft() && kickWave() && settings.audioBeat !== 'sweep' },
  { kind: 'range', key: 'audioWaveEvery', label: 'Every', min: 1, max: 8, step: 1, format: (v) => (v === 1 ? 'kick' : `${v} kicks`), show: () => ft() && kickWave() },
  { kind: 'range', key: 'audioWaveForce', label: 'Wave strength', min: 0.1, max: 3, step: 0.05, format: pct, show: () => ft() && kickWave() },
  { kind: 'range', key: 'audioWaveSpeed', label: 'Wave speed', min: 0.3, max: 3, step: 0.05, format: (v) => `${v.toFixed(2)}×`, show: () => ft() && kickWave() },
  { kind: 'range', key: 'audioWaveReach', label: 'Wave reach', min: 0.3, max: 3, step: 0.05, format: (v) => `${v.toFixed(2)}×`, show: () => ft() && kickWave() },
  { kind: 'range', key: 'audioWaveWidth', label: 'Wave width', min: 0.3, max: 3, step: 0.05, format: (v) => `${v.toFixed(2)}×`, show: () => ft() && kickWave() },
  { kind: 'select', key: 'audioWaveFeel', label: 'Wave feel', options: [['soft', 'Soft (shift and settle)'], ['punchy', 'Punchy (throw outward)']], show: () => ft() && kickWave() },
  { kind: 'toggle', key: 'audioWaveRings', label: 'Draw the wave outlines', show: () => ft() && kickWave() },
  { kind: 'toggle', key: 'audioWaveAccent', label: 'Louder kicks make bigger waves', show: () => ft() && kickWave() },
  { kind: 'sub', label: 'Snare, clap & hi-hats', show: ft },
  { kind: 'select', key: 'audioSnare', label: 'Snare does', options: [['swirl', 'Swirl'], ['wave', 'Ripple'], ['flash', 'Flash'], ['none', 'Nothing']], show: ft },
  { kind: 'select', key: 'audioHats', label: 'Hi-hats do', options: [['sparkle', 'Sparkle'], ['none', 'Nothing']], show: ft },
  { kind: 'range', key: 'audioHits', label: 'Hit strength', min: 0, max: 2, step: 0.05, format: pct, show: () => ft() && (settings.audioSnare !== 'none' || settings.audioHats !== 'none') },
  { kind: 'sub', label: '808 & sub bass', show: ft },
  { kind: 'select', key: 'audioSub', label: 'Sub swells', options: [['size', 'Particle size'], ['flow', 'Flow'], ['speed', 'Speed'], ['none', 'Nothing']], show: ft },
  { kind: 'range', key: 'audioSubAmt', label: 'Sub strength', min: 0, max: 2, step: 0.05, format: pct, show: () => ft() && settings.audioSub !== 'none' },
  { kind: 'sub', label: 'Overall energy', show: ft },
  { kind: 'range', key: 'audioSpeed', label: 'Speed with energy', min: 0, max: 2, step: 0.05, format: pct, show: ft },
  { kind: 'range', key: 'audioFlow', label: 'Flow stir', min: 0, max: 2, step: 0.05, format: pct, show: ft },

  { kind: 'section', id: 'look', label: 'Style', open: true,
    lock: ['render', 'mixStyles', 'linkDist', 'trail', 'glow', 'glyphSet', 'glyphText', 'glyphPick', 'glyphChange', 'glyphRate', 'glyphFont', 'glyphScale', 'glyphRotate'],
    summary: () => label(RENDERS, settings.render) },
  { kind: 'select', key: 'render', label: 'Style', options: RENDERS },
  { kind: 'multi', key: 'mixStyles', label: 'Mix of', options: MIXABLE, show: () => settings.render === 'mixed' },
  { kind: 'range', key: 'linkDist', label: 'Link distance', min: 20, max: 160, step: 5, format: (v) => `${v}px`, show: () => settings.render === 'links' },
  { kind: 'range', key: 'trail', label: 'Trails', min: 0, max: 1, step: 0.01, format: pct },
  { kind: 'toggle', key: 'glow', label: 'Additive glow' },
  { kind: 'sub', label: 'Glyphs', show: isGlyphs },
  { kind: 'select', key: 'glyphSet', label: 'Characters', options: [...Object.entries(GLYPH_SETS).map(([k, g]) => [k, g.label] as [string, string]), ['custom', 'Your own text']], show: isGlyphs },
  { kind: 'text', key: 'glyphText', label: 'Text', placeholder: 'Type characters or a word', show: () => isGlyphs() && settings.glyphSet === 'custom' },
  { kind: 'select', key: 'glyphPick', label: 'Each particle shows', options: [['random', 'A random glyph'], ['speed', 'By speed'], ['heading', 'By direction'], ['sequence', 'In order (spells it)']], show: isGlyphs },
  { kind: 'select', key: 'glyphChange', label: 'Glyphs change', options: [['fixed', 'Never'], ['flicker', 'Flicker'], ['beat', 'On the beat']], show: () => isGlyphs() && (settings.glyphPick === 'random') },
  { kind: 'range', key: 'glyphRate', label: 'Flicker rate', min: 0, max: 0.2, step: 0.005, format: pct, show: () => isGlyphs() && settings.glyphPick === 'random' && settings.glyphChange === 'flicker' },
  { kind: 'select', key: 'glyphFont', label: 'Font', options: [['mono', 'Monospace'], ['serif', 'Serif'], ['sans', 'Sans'], ['bold', 'Heavy']], show: isGlyphs },
  { kind: 'range', key: 'glyphScale', label: 'Glyph size', min: 0.5, max: 4, step: 0.1, format: (v) => `${v.toFixed(1)}×`, show: isGlyphs },
  { kind: 'select', key: 'glyphRotate', label: 'Rotation', options: [['none', 'Upright'], ['heading', 'Follow direction'], ['spin', 'Spin']], show: isGlyphs },

  { kind: 'section', id: 'colour', label: 'Colour', open: true, lock: ['palette', 'colorBy', 'customColors', 'customBg'],
    summary: () => `${pal().label}, ${label(COLOR_BY, settings.colorBy)}` },
  { kind: 'select', key: 'palette', label: 'Palette', options: [...Object.entries(PALETTES).map(([k, p]) => [k, p.label] as [string, string]), ['custom', 'Custom…']] },
  { kind: 'colors', key: 'customColors', label: 'Colours (calm → hot)', show: () => settings.palette === 'custom' },
  { kind: 'color', key: 'customBg', label: 'Background', show: () => settings.palette === 'custom' },
  { kind: 'swatch' },
  { kind: 'select', key: 'colorBy', label: 'Colour by', options: COLOR_BY },

  { kind: 'section', id: 'actions', label: 'Actions', open: true, fixed: true },
  {
    kind: 'icons',
    buttons: [
      ['Pause (Space)', ICONS.pause, togglePause],
      ['Gather to the centre (G)', ICONS.gather, toggleGather],
      ['Scatter (S)', ICONS.scatter, scatter],
      ['Shuffle, keeps locked sections (R)', ICONS.shuffle, shuffle],
      ['Reset to defaults', ICONS.reset, reset],
    ],
  },
];

const PRESETS: [string, Partial<Settings>][] = [
  ['Drift', { ...DEFAULTS }],
  ['Silk', { count: 3000, size: 1, render: 'streaks', flow: 1, flowScale: 0.003, flowSpeed: 0.15, trail: 0.95, friction: 0.06, jitter: 0.01, palette: 'ocean', colorBy: 'direction', glow: true, pointerMode: 'vortex', radius: 180, force: 0.5 }],
  ['Embers', { count: 1500, size: 2.2, render: 'dots', flow: 0.5, flowScale: 0.008, flowSpeed: 0.6, trail: 0.85, friction: 0.03, jitter: 0.15, palette: 'ember', colorBy: 'speed', glow: true, pointerMode: 'repel', radius: 150, force: 1, click: 'emit' }],
  ['Constellation', { count: 500, size: 2, render: 'links', linkDist: 90, flow: 0.1, flowSpeed: 0.1, trail: 0, friction: 0.02, jitter: 0.04, palette: 'mono', colorBy: 'palette', glow: false, pointerMode: 'attract', radius: 200, force: 0.3, click: 'ripple' }],
  ['Neon storm', { count: 4000, size: 1.2, render: 'streaks', flow: 1.6, flowScale: 0.012, flowSpeed: 1, trail: 0.7, friction: 0.05, jitter: 0.05, speed: 1.6, palette: 'neon', colorBy: 'speed', glow: true, pointerMode: 'vortex', radius: 220, force: 1.2, click: 'shockwave' }],
  ['Dusk', { count: 2200, size: 1.3, render: 'streaks', flow: 0.7, flowScale: 0.004, flowSpeed: 0.25, trail: 0.92, friction: 0.05, jitter: 0.02, palette: 'sunset', colorBy: 'vertical', glow: true, pointerMode: 'vortex', radius: 160, force: 0.7 }],
  ['Heat', { count: 3000, size: 1.6, render: 'dots', flow: 0.4, flowScale: 0.006, flowSpeed: 0.3, trail: 0.85, friction: 0.04, jitter: 0.03, palette: 'infra', colorBy: 'pointer', glow: true, pointerMode: 'attract', radius: 160, force: 0.5, click: 'implode' }],
  ['Fireflies', { count: 400, size: 1.6, render: 'glow', flow: 0.3, flowScale: 0.003, flowSpeed: 0.1, trail: 0.6, friction: 0.05, jitter: 0.08, palette: 'gold', colorBy: 'palette', glow: true, pointerMode: 'attract', radius: 220, force: 0.3, click: 'gather' }],
  ['Bokeh', { count: 250, size: 3, render: 'bokeh', flow: 0.2, flowScale: 0.002, flowSpeed: 0.08, trail: 0, friction: 0.04, jitter: 0.02, palette: 'candy', colorBy: 'palette', glow: true, pointerMode: 'repel', radius: 200, force: 0.3, click: 'ripple' }],
  ['Confetti', { count: 900, size: 1.8, render: 'mixed', mixStyles: 'circles,sparkles,rings,arrows,glyphs', glyphSet: 'shapes', flow: 0.5, flowScale: 0.004, flowSpeed: 0.3, trail: 0.4, friction: 0.04, jitter: 0.04, palette: 'candy', colorBy: 'palette', glow: false, pointerMode: 'vortex', radius: 180, force: 0.7, click: 'emit' }],
  ['Digital rain', { count: 900, size: 2.4, render: 'glyphs', glyphSet: 'katakana', glyphPick: 'random', glyphChange: 'flicker', glyphRate: 0.02, glyphFont: 'mono', glyphScale: 1, glyphRotate: 'none', gravity: 0.5, flow: 0, trail: 0.88, friction: 0.08, jitter: 0, speed: 1, palette: 'toxic', colorBy: 'speed', glow: false, pointerMode: 'repel', radius: 120, force: 0.6, click: 'ripple' }],
  ['ASCII', { count: 2500, size: 2, render: 'glyphs', glyphSet: 'density', glyphPick: 'speed', glyphChange: 'fixed', glyphFont: 'mono', glyphScale: 1, glyphRotate: 'none', flow: 0.8, flowScale: 0.004, flowSpeed: 0.3, trail: 0, friction: 0.05, jitter: 0.02, palette: 'mono', colorBy: 'speed', glow: false, pointerMode: 'vortex', radius: 180, force: 0.8, click: 'gather' }],
  ['Compass', { count: 700, size: 2.2, render: 'glyphs', glyphSet: 'arrows', glyphPick: 'heading', glyphFont: 'sans', glyphScale: 1.2, glyphRotate: 'none', flow: 1, flowScale: 0.003, flowSpeed: 0.2, trail: 0.3, friction: 0.05, jitter: 0.01, palette: 'ice', colorBy: 'direction', glow: false, pointerMode: 'vortex', radius: 200, force: 0.6 }],
  ['Glyph drift', { count: 900, size: 2.4, render: 'glyphs', flow: 0, trail: 0.85, friction: 0.02, jitter: 0, speed: 1, palette: 'toxic', colorBy: 'vertical', glow: false, pointerMode: 'repel', radius: 120, force: 0.6, click: 'ripple' }],
  ['Prism', { count: 2500, size: 1.4, render: 'dots', flow: 0.8, flowScale: 0.005, flowSpeed: 0.3, trail: 0.9, friction: 0.04, jitter: 0.02, palette: 'rainbow', colorBy: 'direction', glow: true, pointerMode: 'repel', radius: 140, force: 0.8 }],
];
(CONTROLS[1] as { buttons: [string, () => void][] }).buttons = PRESETS.map(([label, p]) => [label, () => apply(p)]);

const controls = document.getElementById('controls')!;
const refreshers: (() => void)[] = [];
let pauseButton: HTMLButtonElement | null = null;

function set<K extends keyof Settings>(k: K, v: Settings[K]) {
  if (settings[k] === v) return;
  settings[k] = v;
  changed(new Set([k]));
}

// Visual presets, shuffle and reset keep the audio settings you've tuned.
const audioSettings = (): Partial<Settings> =>
  Object.fromEntries(Object.entries(settings).filter(([k]) => k.startsWith('audio')));

function apply(p: Partial<Settings>, keepAudio = true) {
  Object.assign(settings, DEFAULTS, keepAudio ? audioSettings() : {}, p);
  changed(new Set(Object.keys(DEFAULTS) as (keyof Settings)[]));
}

function changed(keys: Set<keyof Settings>) {
  save();
  if (keys.has('count')) {
    n = Math.min(n, settings.count);
    ensureCount();
  }
  if (keys.has('glyphSet') || keys.has('glyphText')) buildGlyphs();
  if (keys.has('palette') || keys.has('customColors') || keys.has('customBg')) {
    buildShades();
    clear();
  }
  refresh();
}

const conditional: [HTMLElement, () => boolean][] = [];

function refresh() {
  for (const r of refreshers) r();
  for (const [el, show] of conditional) el.hidden = !show();
}

const COLLAPSE_KEY = 'particle-field:collapsed';

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function renderControls() {
  const collapsed = loadCollapsed();
  let body: HTMLElement = controls;

  for (const ctl of CONTROLS) {
    if (ctl.kind === 'section') {
      // Each section is a card with a clickable header that folds it away.
      const section = document.createElement('section');
      section.className = 'group';
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'group-head';
      head.innerHTML = `<span class="chev" aria-hidden="true"></span><span class="group-title"></span><span class="group-summary"></span>`;
      head.querySelector('.group-title')!.textContent = ctl.label;
      const summary = head.querySelector<HTMLElement>('.group-summary')!;
      body = document.createElement('div');
      body.className = 'group-body';
      body.id = `group-${ctl.id}`;
      head.setAttribute('aria-controls', body.id);
      const top = document.createElement('div');
      top.className = 'group-top';
      top.append(head);
      if (ctl.lock) {
        // Locked sections keep their settings when you press Shuffle.
        const lockBtn = document.createElement('button');
        lockBtn.type = 'button';
        lockBtn.className = 'lock';
        lockBtn.innerHTML = LOCK_SVG;
        const id = ctl.id;
        const sync = () => {
          const on = locks.has(id);
          lockBtn.classList.toggle('on', on);
          lockBtn.title = on ? 'Locked: Shuffle keeps these settings' : 'Lock so Shuffle keeps these settings';
          lockBtn.setAttribute('aria-pressed', String(on));
          section.classList.toggle('locked', on);
        };
        lockBtn.addEventListener('click', () => {
          if (locks.has(id)) locks.delete(id);
          else locks.add(id);
          saveLocks();
          sync();
        });
        sync();
        top.append(lockBtn);
      }
      section.append(top, body);
      controls.append(section);

      const setOpen = (open: boolean) => {
        section.classList.toggle('closed', !open);
        head.setAttribute('aria-expanded', String(open));
      };
      if (ctl.fixed) {
        // Always open: the header is just a title.
        section.classList.add('fixed');
        head.disabled = true;
        head.removeAttribute('aria-controls');
        if (ctl.summary) refreshers.push(() => (summary.textContent = ctl.summary!()));
        continue;
      }
      setOpen(!(collapsed[ctl.id] ?? !ctl.open));
      head.addEventListener('click', () => {
        const open = section.classList.contains('closed');
        setOpen(open);
        collapsed[ctl.id] = !open;
        try {
          localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
        } catch {
          /* not persisted */
        }
      });
      if (ctl.summary) refreshers.push(() => (summary.textContent = ctl.summary!()));
      if (ctl.show) conditional.push([section, ctl.show]);
      continue;
    }

    if (ctl.kind === 'mypresets') {
      body.append(renderMyPresets());
      continue;
    }

    if (ctl.kind === 'note') {
      const pEl = document.createElement('p');
      pEl.className = 'note';
      pEl.textContent = ctl.text;
      body.append(pEl);
      if (ctl.show) conditional.push([pEl, ctl.show]);
      continue;
    }

    if (ctl.kind === 'sub') {
      const h = document.createElement('h3');
      h.textContent = ctl.label;
      body.append(h);
      if (ctl.show) conditional.push([h, ctl.show]);
      continue;
    }

    if (ctl.kind === 'audio') {
      body.append(renderAudio());
      continue;
    }

    if (ctl.kind === 'swatch') {
      const sw = document.createElement('div');
      sw.className = 'swatch';
      body.append(sw);
      refreshers.push(() => {
        const p = pal();
        const cols = p.stops.map(([hh, ss, ll]) => `hsl(${hh} ${ss}% ${ll}%)`).join(', ');
        sw.style.background = `linear-gradient(90deg, ${cols})`;
      });
      continue;
    }

    if (ctl.kind === 'icons') {
      const row = document.createElement('div');
      row.className = 'icon-buttons';
      for (const [title, icon, fn] of ctl.buttons) {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title.replace(/ \(.*\)$/, ''));
        b.innerHTML = icon;
        b.addEventListener('click', fn);
        if (fn === togglePause) pauseButton = b;
        if (fn === toggleGather) gatherButton = b;
        row.append(b);
      }
      body.append(row);
      continue;
    }

    if (ctl.kind === 'buttons') {
      const row = document.createElement('div');
      row.className = 'buttons';
      for (const [text, fn] of ctl.buttons) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', fn);
        if (ctl.active) refreshers.push(() => b.classList.toggle('on', ctl.active!(text)));
        row.append(b);
      }
      body.append(row);
      continue;
    }

    // A label around chip buttons would forward clicks to the first chip.
    const row = document.createElement(ctl.kind === 'multi' || ctl.kind === 'choice' || ctl.kind === 'colors' ? 'div' : 'label');
    row.className = `row ${ctl.kind}`;
    row.dataset.key = ctl.key;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = ctl.label;
    row.append(name);
    const k = ctl.key;

    if (ctl.kind === 'range') {
      const out = document.createElement('output');
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min: ctl.min, max: ctl.max, step: ctl.step });
      input.addEventListener('input', () => set(k, Number(input.value) as never));
      row.append(out, input);
      refreshers.push(() => {
        const v = settings[k] as number;
        input.value = String(v);
        out.textContent = ctl.format ? ctl.format(v) : String(v);
      });
    } else if (ctl.kind === 'select') {
      const select = document.createElement('select');
      for (const [value, text] of ctl.options) select.add(new Option(text, value));
      select.addEventListener('change', () => set(k, select.value as never));
      row.append(select);
      refreshers.push(() => (select.value = String(settings[k])));
    } else if (ctl.kind === 'color') {
      const input = document.createElement('input');
      input.type = 'color';
      input.addEventListener('input', () => set(k, input.value as never));
      row.append(input);
      refreshers.push(() => (input.value = String(settings[k])));
    } else if (ctl.kind === 'colors') {
      // 2-5 colour swatches, stored as a comma-separated hex list.
      row.classList.add('stack');
      const wrap = document.createElement('div');
      wrap.className = 'swatches';
      row.append(wrap);
      const list = () => String(settings[k]).split(',').filter(Boolean);
      const draw = () => {
        wrap.innerHTML = '';
        list().forEach((hex, idx) => {
          const input = document.createElement('input');
          input.type = 'color';
          input.value = hex;
          input.addEventListener('input', () => {
            const l = list();
            l[idx] = input.value;
            set(k, l.join(',') as never);
          });
          wrap.append(input);
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.textContent = '+';
        add.title = 'Add a colour';
        add.disabled = list().length >= 5;
        add.addEventListener('click', () => { set(k, [...list(), list().at(-1) ?? '#ffffff'].join(',') as never); draw(); });
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '−';
        rm.title = 'Remove the last colour';
        rm.disabled = list().length <= 2;
        rm.addEventListener('click', () => { set(k, list().slice(0, -1).join(',') as never); draw(); });
        wrap.append(add, rm);
      };
      draw();
    } else if (ctl.kind === 'choice') {
      // Single-choice chips.
      row.classList.add('stack', 'bare');
      const wrap = document.createElement('div');
      wrap.className = 'chips';
      for (const [value, text] of ctl.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', () => set(k, value as never));
        wrap.append(b);
        refreshers.push(() => b.classList.toggle('on', settings[k] === value));
      }
      row.append(wrap);
    } else if (ctl.kind === 'multi') {
      // Toggle chips stored as a comma-separated list.
      row.classList.add('stack');
      const wrap = document.createElement('div');
      wrap.className = 'chips';
      for (const [value, text] of ctl.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          const cur = new Set(String(settings[k]).split(',').filter(Boolean));
          if (cur.has(value)) {
            if (cur.size > 1) cur.delete(value);
          } else cur.add(value);
          set(k, ctl.options.map(([v]) => v).filter((v) => cur.has(v)).join(',') as never);
        });
        wrap.append(b);
        refreshers.push(() => b.classList.toggle('on', String(settings[k]).split(',').includes(value)));
      }
      row.append(wrap);
    } else if (ctl.kind === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = ctl.placeholder ?? '';
      input.maxLength = 200;
      input.addEventListener('input', () => set(k, input.value as never));
      row.append(input);
      refreshers.push(() => {
        if (document.activeElement !== input) input.value = String(settings[k]);
      });
    } else if (ctl.kind === 'toggle') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => set(k, input.checked as never));
      row.prepend(input);
      refreshers.push(() => (input.checked = Boolean(settings[k])));
    }
    body.append(row);
    if (ctl.show) conditional.push([row, ctl.show]);
  }

  const stats = document.createElement('p');
  stats.className = 'stats';
  stats.id = 'stats';
  controls.append(stats);
  const keys = document.createElement('p');
  keys.className = 'stats';
  keys.textContent = 'Click or hold on the field. Keys: Space pause · G gather · S scatter · R shuffle · H hide panel.';
  controls.append(keys);
}

const statsEl = () => document.getElementById('stats');
setInterval(() => {
  const el = statsEl();
  if (el) el.textContent = `${n.toLocaleString()} particles · ${paused ? 'paused' : `${Math.round(fps)} fps`}${renderScale < 1 ? ` · ${Math.round(renderScale * 100)}% resolution` : ''}`;
}, 500);

// Source buttons, status line and a live bass / mid / treble meter.
function renderAudio() {
  const wrap = document.createElement('div');
  wrap.className = 'audio';
  wrap.innerHTML = `
    <div class="sources">
      <button type="button" data-src="mic">Mic</button>
      <button type="button" data-src="tab">Share tab</button>
      <button type="button" data-src="file">File</button>
      <button type="button" data-src="off">Stop</button>
    </div>
    <input type="file" accept="audio/*" hidden />
    <div class="meter" aria-hidden="true">
      <span>Sub</span><i></i><span>Bass</span><i></i><span>Mid</span><i></i><span>High</span><i></i>
    </div>
    <div class="hits" aria-hidden="true"><b>Kick</b><b>Snare</b><b>Hat</b><em></em></div>
    <p class="audio-status">Off</p>
    <p class="audio-help"></p>`;
  const fileInput = wrap.querySelector<HTMLInputElement>('input[type=file]')!;
  const status = wrap.querySelector<HTMLElement>('.audio-status')!;
  const help = wrap.querySelector<HTMLElement>('.audio-help')!;
  const bars = [...wrap.querySelectorAll<HTMLElement>('.meter i')];
  const hits = [...wrap.querySelectorAll<HTMLElement>('.hits b')];
  const bpmEl = wrap.querySelector<HTMLElement>('.hits em')!;
  let hatGlow = 0;
  const buttons = [...wrap.querySelectorAll<HTMLButtonElement>('[data-src]')];

  const HELP: Record<string, string> = {
    off: 'Microphone hears whatever plays in the room. Share a tab gets clean sound from e.g. the Spotify web player (Chrome/Edge: tick “Share tab audio”).',
    mic: 'Turn the music up a bit. Headphones won’t reach the mic.',
    tab: 'Keep the shared tab playing. Stop sharing from the browser bar or press Stop.',
    file: 'The file loops until you press Stop.',
  };

  const sync = () => {
    for (const b of buttons) b.classList.toggle('on', b.dataset.src === audio.source && audio.source !== 'off');
    wrap.querySelector<HTMLButtonElement>('[data-src=off]')!.hidden = audio.source === 'off';
    help.textContent = HELP[audio.source];
  };
  audio.onChange = (msg) => {
    status.textContent = msg;
    status.classList.toggle('error', audio.source === 'off' && msg !== 'Off');
    sync();
    refresh();
  };

  if (!tabAudioSupported()) wrap.querySelector<HTMLButtonElement>('[data-src=tab]')!.hidden = true;
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const src = b.dataset.src!;
      if (src === 'off') audio.stop();
      else if (src === 'file') fileInput.click();
      else {
        status.textContent = src === 'mic' ? 'Asking for the microphone…' : 'Pick a tab to share…';
        void audio.start(src as 'mic' | 'tab');
      }
    });
  }
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) void audio.start('file', f);
    fileInput.value = '';
  });

  const tick = () => {
    const L = audio.levels;
    [L.sub, L.bass, L.mid, L.treble].forEach((v, k) => (bars[k].style.transform = `scaleX(${v.toFixed(3)})`));
    wrap.classList.toggle('beat', L.beat);
    // Hit lights stay lit briefly so single-frame hits are visible.
    [L.pulse, L.snareEnv, L.hat ? 1 : hatGlow * 0.8].forEach((v, k) => (hits[k].style.opacity = String(0.25 + 0.75 * Math.min(1, v))));
    hatGlow = L.hat ? 1 : hatGlow * 0.8;
    bpmEl.textContent = audio.source !== 'off' && L.bpm ? `${L.bpm} BPM` : '';
    requestAnimationFrame(tick);
  };
  tick();
  sync();
  return wrap;
}

function togglePause() {
  paused = !paused;
  if (pauseButton) {
    pauseButton.innerHTML = paused ? ICONS.play : ICONS.pause;
    pauseButton.title = paused ? 'Play (Space)' : 'Pause (Space)';
    pauseButton.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    pauseButton.classList.toggle('on', paused);
  }
}

let gatherAll = false;
let gatherButton: HTMLButtonElement | null = null;
function toggleGather() {
  gatherAll = !gatherAll;
  gatherButton?.classList.toggle('on', gatherAll);
}

function scatter() {
  if (gatherAll) toggleGather();
  for (let i = 0; i < n; i++) spawn(i, Math.random() * w, Math.random() * h);
  clear();
}

function rand(min: number, max: number, stepSize: number) {
  return Math.round((min + Math.random() * (max - min)) / stepSize) * stepSize;
}

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

function shuffle() {
  const r: Partial<Settings> = {
    count: rand(600, 4000, 100),
    size: rand(0.8, 2.6, 0.1),
    speed: rand(0.6, 2, 0.1),
    friction: rand(0.02, 0.08, 0.005),
    jitter: rand(0, 0.15, 0.01),
    gravity: Math.random() < 0.15 ? rand(-0.4, 0.6, 0.05) : 0,
    flow: rand(0.2, 1.6, 0.05),
    flowScale: rand(0.002, 0.012, 0.0005),
    flowSpeed: rand(0.05, 1, 0.05),
    pointerMode: pick(['repel', 'attract', 'vortex'] as const),
    radius: rand(80, 260, 5),
    force: rand(0.3, 1.4, 0.05),
    click: pick(['gather', 'emit', 'ripple', 'implode', 'shockwave'] as const),
    clickForce: rand(0.6, 1.6, 0.1),
    render: pick(['dots', 'circles', 'glow', 'bokeh', 'rings', 'sparkles', 'arrows', 'streaks', 'streaks', 'comets', 'glyphs', 'links', 'mixed'] as const),
    mixStyles: MIXABLE.map(([k]) => k).sort(() => Math.random() - 0.5).slice(0, 3 + ((Math.random() * 3) | 0)).sort((a, b) => MIXABLE.findIndex(([k]) => k === a) - MIXABLE.findIndex(([k]) => k === b)).join(','),
    linkDist: rand(50, 100, 5),
    trail: rand(0.5, 0.95, 0.01),
    glow: Math.random() < 0.6,
    glyphSet: pick(Object.keys(GLYPH_SETS) as GlyphSet[]),
    glyphPick: pick(['random', 'random', 'speed', 'heading'] as const),
    glyphChange: pick(['fixed', 'flicker', 'flicker'] as const),
    glyphRate: rand(0.005, 0.04, 0.005),
    glyphFont: pick(['mono', 'serif', 'sans', 'bold'] as const),
    glyphScale: rand(0.8, 1.6, 0.1),
    glyphRotate: pick(['none', 'none', 'heading', 'spin'] as const),
    palette: pick(Object.keys(PALETTES) as Palette[]),
    colorBy: pick(['palette', 'speed', 'direction', 'pointer', 'cycle', 'horizontal', 'radial'] as const),
  };
  // Only unlocked sections change; anything a section has that we don't
  // randomise goes back to its default.
  const keys = new Set<keyof Settings>();
  for (const ctl of CONTROLS) {
    if (ctl.kind !== 'section' || !ctl.lock || locks.has(ctl.id)) continue;
    for (const k of ctl.lock) {
      (settings as unknown as Record<string, unknown>)[k] = k in r ? r[k] : DEFAULTS[k];
      keys.add(k);
    }
  }
  if (keys.size) changed(keys);
}

// --- locks & own presets -------------------------------------------------------

const LOCK_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path class="shackle" d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const LOCKS_KEY = 'particle-field:locks';
const locks = new Set<string>(readJson<string[]>(LOCKS_KEY, []));
function saveLocks() {
  writeJson(LOCKS_KEY, [...locks]);
}

const MY_PRESETS_KEY = 'particle-field:my-presets';
type MyPreset = { name: string; settings: Partial<Settings> };
let myPresets: MyPreset[] = readJson<MyPreset[]>(MY_PRESETS_KEY, []);

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

// Saved presets store the whole look and motion plus the audio reaction.
function snapshot(): Partial<Settings> {
  const { audioFineTune: _skip, ...rest } = settings;
  return { ...rest };
}

function renderMyPresets() {
  const wrap = document.createElement('div');
  wrap.className = 'mypresets';
  const draw = () => {
    wrap.innerHTML = '';
    if (myPresets.length) {
      const h = document.createElement('h3');
      h.textContent = 'My presets';
      const list = document.createElement('div');
      list.className = 'buttons';
      myPresets.forEach((p, idx) => {
        const item = document.createElement('div');
        item.className = 'mine';
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = p.name;
        b.title = 'Load this preset';
        b.addEventListener('click', () => {
          Object.assign(settings, DEFAULTS, p.settings);
          changed(new Set(Object.keys(DEFAULTS) as (keyof Settings)[]));
        });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = '×';
        del.title = `Delete “${p.name}”`;
        del.addEventListener('click', () => {
          if (!confirm(`Delete the preset “${p.name}”?`)) return;
          myPresets.splice(idx, 1);
          writeJson(MY_PRESETS_KEY, myPresets);
          draw();
        });
        item.append(b, del);
        list.append(item);
      });
      wrap.append(h, list);
    }
    const form = document.createElement('form');
    form.className = 'save';
    form.innerHTML = '<input type="text" maxlength="40" placeholder="Name this look…" aria-label="Preset name" /><button type="submit">Save</button>';
    const input = form.querySelector('input')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim() || `My look ${myPresets.length + 1}`;
      const existing = myPresets.findIndex((p) => p.name === name);
      if (existing >= 0) myPresets[existing].settings = snapshot();
      else myPresets.push({ name, settings: snapshot() });
      writeJson(MY_PRESETS_KEY, myPresets);
      draw();
    });
    wrap.append(form);
  };
  draw();
  return wrap;
}

function reset() {
  apply({}, false);
}

// --- panel toggle & keys -----------------------------------------------------

const panel = document.getElementById('panel')!;
const toggle = document.getElementById('toggle')!;
toggle.addEventListener('click', () => {
  const collapsed = panel.classList.toggle('collapsed');
  // The floating shuffle button only shows while the drawer is closed.
  document.body.classList.toggle('panel-open', !collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.title = collapsed ? 'Show controls (H)' : 'Hide controls (H)';
  toggle.textContent = collapsed ? '⟨' : '⟩';
  requestAnimationFrame(resize);
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    togglePause();
  } else if (k === 'c') clear();
  else if (k === 'g') toggleGather();
  else if (k === 's') scatter();
  else if (k === 'r') shuffle();
  else if (k === 'h') toggle.click();
});

document.getElementById('fab-shuffle')!.addEventListener('click', shuffle);
document.body.classList.add('panel-open');
new ResizeObserver(() => resize()).observe(canvas);
if (window.innerWidth < 720) toggle.click();

buildShades();
buildGlyphs();
renderControls();
resize();
refresh();
requestAnimationFrame(frame);
