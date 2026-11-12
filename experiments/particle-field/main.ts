import { fillPattern, FILL_PATTERNS, PATTERN_FORM, PATTERN_VARY, patternArms, isFillPattern } from './patterns.ts';
import './style.css';
import { AudioInput, tabAudioSupported, type SpectrumFrame } from './audio.ts';
import { xframe } from './xframe.ts';
import { GLYPH_SETS, PALETTES, hexToRgb, rgbToHsl, DEFAULTS, upgradeShape, type Emitter, type Render, type GlyphFont, type Settings, type PaletteDef } from './settings.ts';
import { ICON_SHAPES, GEO_SHAPES, SOLID_SHAPES, LIVE_SHAPES, drawIcon, isIcon, geoPoint, GEO_SPINS, solidPoint } from './shapes.ts';
import { VIBE_FAMILIES, VIBE_LEADS, LEAD_ABOUT, vibe, quiet, VIBES, PRESETS, FAMILIES, FAMILY_OF, type VibeFamily, type VibeLead, type VibeDef, type Family } from './scenes.ts';
import { Camera, FACE_GROUPS, type Task } from './camera.ts';
import { Recorder, canRecord, RECORD_LENGTHS, RECORD_SIZES } from './record.ts';
import { Projector } from './projector.ts';
import { TIPS as ABOUT, LENSES } from './tips.ts';
import { parseAnim, formatAnim, animOffset, animPhase, thin, WAVES, EASES, CYCLES, cycleLabel, type Anim, type Wave as AWave, type Ease } from './animate.ts';
import { LinkRunner, linkNeeds, parseLinks, migrateLegacy, formatLinks, SOURCES, ACTIONS, LINK_EXAMPLES, sourceDef, actionDef, type Link, type Signal } from './links.ts';

// --- settings ----------------------------------------------------------------

// The current palette, including a custom one built from colour pickers.
function pal(): PaletteDef {
  if (settings.palette !== 'custom') return PALETTES[settings.palette];
  return {
    label: 'Custom',
    bg: hexToRgb(settings.customBg),
    stops: settings.customColors.split(',').filter(Boolean).map((hex) => rgbToHsl(hexToRgb(hex))),
  };
}

const STORAGE_KEY = 'particle-field:settings';
const settings: Settings = { ...DEFAULTS, ...upgradeShape(load()) };
if (settings.palette !== 'custom' && !(settings.palette in PALETTES)) settings.palette = DEFAULTS.palette;
// Older saves used 'none' as a beat wave; that is now 'Kick does: Pulse'.
if ((settings.audioBeat as string) === 'none') settings.audioBeat = 'ripple';
// The on-field knobs went from on to off by default: switch them off once.
try {
  if (!localStorage.getItem('particle-field:knobs-off-v1')) {
    settings.playOn = false;
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, playOn: false }));
    localStorage.setItem('particle-field:knobs-off-v1', '1');
  }
} catch {}

function load(): Partial<Settings> {
  try {
    return migrateLegacy(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

// Crossfader: two scenes and a fader between them (state; the engine is with
// the timeline further down).
type XfRef = { name: string; mine?: boolean; edits?: Record<string, unknown> };
type Xfader = { on: boolean; a: XfRef; b: XfRef; bars: number; pingpong: boolean };
const XF_KEY = 'particle-field:xfader';
const xf: Xfader = (() => {
  const d: Xfader = { on: false, a: { name: 'Galaxy' }, b: { name: 'Neon storm' }, bars: 4, pingpong: false };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(XF_KEY) ?? '{}'), pingpong: false };
  } catch {
    return d;
  }
})();

// Animate values: the knob value under each animated setting (the engine
// writes the moving value into settings), and the last value it wrote, so a
// change from anywhere else (a knob, a scene) becomes the new knob value.
const animBase: Record<string, number> = {};
const animWrote: Record<string, number> = {};
// A copy with the knob values in place of the moving ones (to save or compare).
// Arrange's "Shape only" swaps heavy settings for light ones while it is on;
// what they were is kept here, and saving or snapshots see those values.
let liteHold: Record<string, unknown> | null = null;
function withBases<T extends object>(o: T): T {
  const keys = Object.keys(animBase);
  if (!keys.length && !liteHold) return o;
  const c = { ...o, ...(liteHold && lastSceneName === liteScene ? liteHold : {}) } as Record<string, unknown>;
  for (const k of keys) if (typeof c[k] === 'number' && Math.abs((c[k] as number) - animWrote[k]) < 1e-9) c[k] = animBase[k];
  return c as T;
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withBases(settings)));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

// --- layout ------------------------------------------------------------------

const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="stage" id="stage">
    <canvas id="c"></canvas>
    <div class="fab" id="fab" aria-label="Quick actions"></div>
  </main>
  <aside class="panel" id="panel">
    <header>
      <h1>Particle field</h1>
      <button type="button" class="sheet-title" id="sheet-title" aria-expanded="false" aria-controls="picker"><small></small><b></b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
      <button type="button" class="icon sheet-btn" id="sheet-find" aria-label="Search settings" title="Search settings"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg></button>
      <button type="button" class="icon sheet-btn" id="sheet-more" aria-label="Actions" title="Actions" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true" class="dots"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
      <button class="icon" id="toggle" aria-expanded="true" title="Hide controls (H)">⟩</button>
    </header>
    <button type="button" class="scene-now" id="scene-now" hidden><span class="sn-label">Scene</span><b></b><em>edited</em></button>
    <div class="panel-body" id="controls"></div>
    <div class="actionbar" id="actionbar"></div>
  </aside>
`;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
// The old start hint is gone; the field speaks for itself.
const hint = document.createElement('p');

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
let age = new Float32Array(0); // frames since (re)spawn, for fading in and out
let span = new Float32Array(0); // this particle's lifetime in frames (Lifespan setting)
let rnd = new Float32Array(0); // a random 0..1 drawn at birth (size variety)
let psz = new Float32Array(0); // per-particle size multiplier, worked out each frame
let hx = new Float32Array(0); // home position (Shape section)
// Shape placement: homes are built about the screen centre; the spring
// aims at them moved and turned by the shape's position and angle.
const place = { on: false, cx: 0, cy: 0, ox: 0, oy: 0, c: 1, s: 0 };
// The size the homes were built at: an animated size scales them about the centre.
let shapeBuiltSize = 1;
function placeFrame() {
  const S = settings;
  const k = paramShape || S.shape === 'camera' || S.shape === 'none' || !shapeBuiltSize ? 1 : S.shapeSize / shapeBuiltSize;
  place.on = S.shapeX !== 0 || S.shapeY !== 0 || S.shapeAngle !== 0 || Math.abs(k - 1) > 1e-4;
  place.cx = w / 2;
  place.cy = h / 2;
  place.ox = S.shapeX * w;
  place.oy = S.shapeY * h;
  const a = (S.shapeAngle * Math.PI) / 180;
  place.c = Math.cos(a) * k;
  place.s = Math.sin(a) * k;
}
function placed(x: number, y: number): [number, number] {
  const dx = x - place.cx;
  const dy = y - place.cy;
  return [place.cx + place.ox + dx * place.c - dy * place.s, place.cy + place.oy + dx * place.s + dy * place.c];
}
let hy = new Float32Array(0);
let pz = new Float32Array(0); // depth: 0 far, 1 near
let dead = new Float32Array(0); // 1 while waiting for an emitter to (re)launch it
let free = new Float32Array(0); // 1 for face-effect particles: no home, short life
let gone = new Float32Array(0); // seconds when it started fading out (count going down), 0 = staying
// Particles fade in after a (re)spawn and fade out before the end of a lifespan,
// so they never pop in or out.
const FADE_IN = 45;
const FADE_OUT = 45;
let n = 0;

let w = 0;
let h = 0;
let t = 0;
let paused = false;
let dpr = 1;

// The particle count with the Density macro applied.
const countNow = () => {
  const c = settings.count * densityK;
  // Small counts stay exact (a seed of 7); larger ones move in tens.
  const v = Math.max(3, Math.min(10000, c < 100 ? Math.round(c) : Math.round(c / 10) * 10));
  return Math.min(v, growCap(v));
};
// Grow transition: the count is held down, then let out over a bar or two.
let growFx: { from: number; start: number; dur: number } | null = null;
function growCap(full: number) {
  if (!growFx) return Infinity;
  const u = (performance.now() - growFx.start) / growFx.dur;
  if (u >= 1) {
    growFx = null;
    return Infinity;
  }
  // Doubling at a steady rate, like cells dividing.
  return Math.round(growFx.from * Math.pow(Math.max(1, full / growFx.from), u));
}
function ensureCount(want = countNow()) {
  if (want > cap) {
    const grow = (a: Float32Array) => {
      const b = new Float32Array(want);
      b.set(a.subarray(0, n));
      return b;
    };
    [px, py, vx, vy, ox, oy, tone, gl, age, span, rnd, psz, dead, hx, hy, pz, free, gone] = [px, py, vx, vy, ox, oy, tone, gl, age, span, rnd, psz, dead, hx, hy, pz, free, gone].map(grow);
    cap = want;
  }
  // With a shape on, newcomers appear beside an existing particle, so they
  // join the formation instead of flying in from anywhere on screen.
  const near = (settings.shape !== 'none' || settings.budding || growFx) && n > 0 ? n : 0;
  for (let i = n; i < want; i++) {
    if (near) {
      const j = (Math.random() * near) | 0;
      spawn(i, px[j] + (Math.random() - 0.5) * 6, py[j] + (Math.random() - 0.5) * 6);
      // Share its spot until the shape is rebuilt, or the spring would pull
      // the newcomer to the corner (an unset home is 0, 0).
      hx[i] = hx[j];
      hy[i] = hy[j];
    } else spawn(i, Math.random() * w, Math.random() * h);
    dead[i] = settings.emitter !== 'none' ? 1 : 0;
    gone[i] = 0;
  }
  n = want;
}

// Fewer particles: the extra ones fade out over a moment and are dropped once
// faded, instead of vanishing. More: any that were fading come back first.
const OUT_SEC = 0.9;
function setCount(want: number) {
  for (let i = 0; i < Math.min(want, n); i++) gone[i] = 0;
  if (want >= n) return ensureCount(want);
  const now = performance.now() / 1000;
  for (let i = want; i < n; i++) if (!gone[i]) gone[i] = now;
  trimGone();
}
function trimGone() {
  const now = performance.now() / 1000;
  const was = n;
  while (n > 0 && gone[n - 1] && now - gone[n - 1] >= OUT_SEC) gone[--n] = 0;
  // A shape gave spots to the ones that left: re-fit once they're gone.
  if (n < was && settings.shape !== 'none') densityFit = performance.now() + 250;
}
let fadeClock = 0;

function spawn(i: number, x: number, y: number) {
  px[i] = ox[i] = x;
  py[i] = oy[i] = y;
  tone[i] = Math.random();
  gl[i] = Math.random();
  pz[i] = Math.random();
  rebirth(i);
  launch(i);
}

// Starting velocity: a gentle random drift, plus the Launch settings.
function launch(i: number) {
  vx[i] = (Math.random() - 0.5) * 0.4;
  vy[i] = (Math.random() - 0.5) * 0.4;
  const v = settings.launchSpeed;
  if (v <= 0) return;
  const spread = (settings.launchSpread / 360) * Math.PI * 2;
  const a = (settings.launchDir / 180) * Math.PI + (Math.random() - 0.5) * spread;
  const sp = v * (0.6 + Math.random() * 0.8);
  vx[i] += Math.cos(a) * sp;
  vy[i] += Math.sin(a) * sp;
}

function rebirth(i: number) {
  age[i] = 0;
  rnd[i] = Math.random();
  // Spread lifetimes (50–150%) so particles don't all fade at once.
  span[i] = settings.lifespan > 0 ? settings.lifespan * 60 * (0.5 + Math.random()) : 0;
}

// 3D depth: scale a near/far factor (base, 1 = middle) by the depth amount.
// Up to 100% it blends linearly; past that it compounds, so 200% exaggerates.
function depthK(base: number, d: number) {
  return d <= 1 ? 1 + (base - 1) * d : Math.pow(base, d);
}

function fadeOf(i: number) {
  if (dead[i]) return 0;
  const out = gone[i] ? Math.max(0, 1 - (fadeClock - gone[i]) / OUT_SEC) : 1;
  return out * fadeLife(i) * (settings.depth > 0 ? depthK(0.3 + pz[i] * 0.7, settings.depth) : 1);
}

function fadeLife(i: number) {
  const flash = span[i] > 0 && settings.lifeFade === 'flash';
  let a = age[i] < FADE_IN && !flash ? age[i] / FADE_IN : 1;
  if (span[i] > 0) {
    a = Math.min(a, (span[i] - age[i]) / FADE_OUT);
    if (settings.lifespan <= 0) return Math.max(0, a); // Keep fresh: a plain fade
    const lt = age[i] / span[i];
    const f = settings.lifeFade;
    if (f === 'out') a = Math.min(a, 1 - lt);
    else if (f === 'swell') a = Math.min(a, Math.sin(Math.PI * Math.min(1, lt)));
    else if (f === 'flash') a = Math.min(a, lt < 0.05 ? 1 : 0.3 + 0.7 * Math.exp(-(lt - 0.05) * 8));
  }
  return a;
}

// Phones draw at most 1.5× pixel density (2× while recording a clip): about
// 45% fewer pixels and hard to tell apart on a moving field. Desktop keeps 2×.
const PHONE = matchMedia('(pointer: coarse)').matches && Math.max(screen.width, screen.height) < 1100;
let recHi = false;
function resize() {
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, PHONE && !recHi ? 1.5 : 2) * renderScale);
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < n; i++) {
    if (px[i] > w || py[i] > h) spawn(i, Math.random() * w, Math.random() * h);
  }
  ensureCount();
  buildShape();
  clear();
}

// Stacked in X-Frame: the canvas stays transparent and trails fade out instead
// of being painted over with the background.
let seeThrough = false;

function clear() {
  const [r, g, b] = bgNow();
  ctx.globalCompositeOperation = 'source-over';
  if (seeThrough) {
    ctx.clearRect(0, 0, w, h);
    document.body.style.background = 'transparent';
    return;
  }
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

// Undo the camera spin so the pointer acts where the particles are drawn.
function unspin(x: number, y: number): [number, number] {
  if (camA === 0) return [x, y];
  const c = Math.cos(-camA);
  const sn = Math.sin(-camA);
  const dx = x - w / 2;
  const dy = y - h / 2;
  return [w / 2 + dx * c - dy * sn, h / 2 + dx * sn + dy * c];
}

canvas.addEventListener('pointermove', (e) => {
  // Two fingers play settings (Play mode), they don't push particles.
  if (playTouch.size > 1) return;
  [pointer.x, pointer.y] = unspin(e.offsetX, e.offsetY);
  pointer.active = true;
});
canvas.addEventListener('pointerleave', () => {
  if (pointer.down) return; // captured: keep tracking while held
  pointer.active = false;
  pointer.x = pointer.y = -1e4;
});
// iOS Safari can still double-tap zoom or pinch on fast taps despite
// touch-action: none, so cancel the native gestures on the field itself.
for (const type of ['touchstart', 'touchend'] as const) {
  canvas.addEventListener(type, (e) => e.cancelable && e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Placed force points, stored in settings.wells as "x,y,kind;..." with x and
// y as fractions of the screen, so they survive resizes and saved presets.
type Well = { x: number; y: number; kind: 'attract' | 'repel' | 'vortex' };
let wellCache = { src: '\u0000', list: [] as Well[] };
function wellList(): Well[] {
  if (wellCache.src !== settings.wells) {
    const list = settings.wells
      .split(';')
      .map((p) => p.split(','))
      .filter((p) => p.length === 3 && ['attract', 'repel', 'vortex'].includes(p[2]))
      .map(([x, y, kind]) => ({ x: +x, y: +y, kind: kind as Well['kind'] }));
    wellCache = { src: settings.wells, list };
  }
  return wellCache.list;
}

function toggleWell(x: number, y: number, kind: Well['kind']) {
  const list = wellList();
  const hit = list.findIndex((p) => Math.hypot(p.x * w - x, p.y * h - y) < 22);
  const next = hit >= 0 ? list.filter((_, k) => k !== hit) : [...list, { x: x / w, y: y / h, kind }].slice(-12);
  setWells(next);
}

function setWells(list: Well[]) {
  settings.wells = list.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.kind}`).join(';');
  changed(new Set(['wells']));
}

// --- obstacles ---------------------------------------------------------------
// Circles or a word the particles flow around. The shape is drawn into a
// coarse grid (one cell per OB_CELL px), then a distance transform gives every
// cell its signed distance to the edge (negative inside) and the direction
// out. Particles near an edge lose the part of their velocity heading in, so
// they slide around it, and anything inside is pushed out.
const OB_CELL = 4;
const OB_MARGIN = 22;
type ObField = { W: number; H: number; sd: Float32Array; nx: Float32Array; ny: Float32Array };
let obField: ObField | null = null;
let obKey = '';

function obCircleList(): { x: number; y: number }[] {
  return settings.obsCircles
    .split(';')
    .map((p) => p.split(',').map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .map(([x, y]) => ({ x, y }));
}

// Draws the obstacles in screen pixels (used for both the grid and the display).
function traceObstacles(g: CanvasRenderingContext2D) {
  const S = settings;
  if (S.obstacles === 'circles') {
    g.beginPath();
    for (const c of obCircleList()) {
      g.moveTo(c.x * w + S.obsRadius, c.y * h);
      g.arc(c.x * w, c.y * h, S.obsRadius, 0, Math.PI * 2);
    }
    g.fill();
  } else if (S.obstacles === 'text') {
    const text = S.obsText.trim() || ' ';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = h * 0.5;
    g.font = `800 ${size}px system-ui, sans-serif`;
    size *= Math.min(1, (w * S.obsSize) / Math.max(1, g.measureText(text).width));
    size = Math.min(size, h * 0.6 * S.obsSize + 4);
    g.font = `800 ${size}px system-ui, sans-serif`;
    g.fillText(text, w / 2, h / 2);
  } else if (S.obstacles === 'body') {
    // Your silhouette from the camera, where the camera shows you on screen.
    const m = cam.body;
    if (!m || !cam.ready) return;
    g.save();
    g.translate(toSx(0), toSy(0));
    g.scale((camMap.sc * camMap.mir * cam.width) / m.w, (camMap.sc * cam.height) / m.h);
    g.drawImage(bodyMask(String(g.fillStyle)), 0, 0);
    g.restore();
  }
}

function obstacleField(): ObField | null {
  const S = settings;
  if (S.obstacles === 'none') return null;
  const key = [S.obstacles, S.obsCircles, S.obsRadius, S.obsText, S.obsSize, w, h, S.obstacles === 'body' ? bodyFrame : 0].join('|');
  if (key === obKey) return obField;
  obKey = key;
  const W = Math.max(1, Math.ceil(w / OB_CELL));
  const H = Math.max(1, Math.ceil(h / OB_CELL));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.scale(1 / OB_CELL, 1 / OB_CELL);
  g.fillStyle = '#fff';
  traceObstacles(g);
  const data = g.getImageData(0, 0, W, H).data;
  const N = W * H;
  const inside = new Uint8Array(N);
  let any = false;
  for (let k = 0; k < N; k++) if (data[k * 4 + 3] > 110) (inside[k] = 1), (any = true);
  if (!any) return (obField = null);
  // Chamfer distance (1 / 1.414) to the nearest cell of the other kind.
  const dist = (src: number) => {
    const d = new Float32Array(N);
    for (let k = 0; k < N; k++) d[k] = inside[k] === src ? 0 : 1e6;
    const D = 1.4142;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        let v = d[k];
        if (x > 0) v = Math.min(v, d[k - 1] + 1);
        if (y > 0) {
          v = Math.min(v, d[k - W] + 1);
          if (x > 0) v = Math.min(v, d[k - W - 1] + D);
          if (x < W - 1) v = Math.min(v, d[k - W + 1] + D);
        }
        d[k] = v;
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const k = y * W + x;
        let v = d[k];
        if (x < W - 1) v = Math.min(v, d[k + 1] + 1);
        if (y < H - 1) {
          v = Math.min(v, d[k + W] + 1);
          if (x < W - 1) v = Math.min(v, d[k + W + 1] + D);
          if (x > 0) v = Math.min(v, d[k + W - 1] + D);
        }
        d[k] = v;
      }
    return d;
  };
  const dOut = dist(1);
  const dIn = dist(0);
  const sd = new Float32Array(N);
  for (let k = 0; k < N; k++) sd[k] = (inside[k] ? -(dIn[k] - 0.5) : dOut[k] - 0.5) * OB_CELL;
  const nx = new Float32Array(N);
  const ny = new Float32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const gx = sd[y * W + Math.min(W - 1, x + 1)] - sd[y * W + Math.max(0, x - 1)];
      const gy = sd[Math.min(H - 1, y + 1) * W + x] - sd[Math.max(0, y - 1) * W + x];
      const l = Math.hypot(gx, gy);
      if (l > 1e-6) {
        nx[k] = gx / l;
        ny[k] = gy / l;
      } else {
        // Flat spot (deep inside): head away from the screen centre.
        const ax = x * OB_CELL - w / 2;
        const ay = y * OB_CELL - h / 2 || 1;
        const al = Math.hypot(ax, ay);
        nx[k] = ax / al;
        ny[k] = ay / al;
      }
    }
  return (obField = { W, H, sd, nx, ny });
}

function toggleObstacle(x: number, y: number) {
  const list = obCircleList();
  const hit = list.findIndex((p) => Math.hypot(p.x * w - x, p.y * h - y) < settings.obsRadius);
  const next = hit >= 0 ? list.filter((_, k) => k !== hit) : [...list, { x: x / w, y: y / h }].slice(-16);
  settings.obsCircles = next.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';');
  changed(new Set(['obsCircles']));
}

// Faint fill so you can see what the particles avoid. Drawn at a strength
// scaled by the trail fade so it settles at the same look with any trail.
function drawObstacles(fade: number, light: boolean) {
  if (settings.obstacles === 'none' || !settings.obsShow) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = light ? `rgb(0 0 0 / ${(0.07 * fade).toFixed(4)})` : `rgb(255 255 255 / ${(0.06 * fade).toFixed(4)})`;
  if (camA !== 0) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(camA);
    ctx.translate(-w / 2, -h / 2);
  }
  traceObstacles(ctx);
  ctx.restore();
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  // A second finger starts a two-finger play gesture instead.
  if (playing() && e.pointerType === 'touch' && playTouch.size >= 1) return;
  pressAt = performance.now();
  if (settings.obstacles === 'circles' && settings.obsPlace && settings.placeWell === 'off') {
    toggleObstacle(e.offsetX, e.offsetY);
    hint.classList.add('gone');
    return;
  }
  if (settings.placeWell === 'emitter') {
    settings.emitX = e.offsetX / w;
    settings.emitY = e.offsetY / h;
    changed(new Set(['emitX', 'emitY']));
    hint.classList.add('gone');
    return;
  }
  if (settings.placeWell !== 'off') {
    toggleWell(e.offsetX, e.offsetY, settings.placeWell);
    hint.classList.add('gone');
    return;
  }
  [pointer.x, pointer.y] = unspin(e.offsetX, e.offsetY);
  pointer.active = e.pointerType === 'mouse';
  pointer.down = true;
  const c = settings.click;
  if (c === 'shockwave' || c === 'ripple' || c === 'implode') addWave(c, e.offsetX, e.offsetY, { force: settings.clickForce });
  if (c === 'implodeHold') {
    holdImplodeAt = performance.now();
    holdRingAt = 0;
  }
  hint.classList.add('gone');
});
// Implode & burst: holding pulls the particles in under the finger (with
// rings closing in), letting go bursts them out; longer holds burst harder.
let holdImplodeAt = 0;
let holdRingAt = 0;
const holdCharge = () => Math.min(1, (performance.now() - holdImplodeAt) / 2000);
const release = (e: PointerEvent) => {
  if (pointer.down && holdImplodeAt && settings.click === 'implodeHold') {
    explode(pointer.x, pointer.y, (0.45 + holdCharge() * 0.9) * settings.clickForce);
    holdImplodeAt = 0;
  }
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
if (import.meta.env.DEV) setTimeout(() => ((window as unknown as { particleCam: Camera }).particleCam = cam));
// Dev only: run the simulation fast without drawing, and measure how spread
// out the live particles are (share of a 32×18 grid's cells in use).
if (import.meta.env.DEV)
  (window as unknown as { particleDev: object }).particleDev = {
    step: (frames: number) => {
      for (let k = 0; k < frames; k++) step(1);
    },
    spread: () => {
      const used = new Set<number>();
      let alive = 0;
      for (let i = 0; i < n; i++) {
        if (dead[i]) continue;
        alive++;
        used.add(Math.min(17, Math.max(0, ((py[i] / h) * 18) | 0)) * 32 + Math.min(31, Math.max(0, ((px[i] / w) * 32) | 0)));
      }
      return { cells: used.size / 576, alive };
    },
  };
let lastPulse = 0;
// Kick tick: the flow turns a step on each kick, eased so it never jolts.
let tickTarget = 0;
let tickNow = 0;
let spawnSide = 1;
let lastSub = 0;
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
// Spatial frequencies of the flow field. In wrap mode each one is rounded to
// a whole number of waves across the screen, so the field tiles seamlessly.
const fk = { x1: 0, y1: 0, x2: 0, y2: 0 };
function updateFlowFreqs() {
  const s = settings.flowScale;
  const tile = settings.edges === 'wrap';
  const q = (k: number, len: number) => (tile ? (Math.max(1, Math.round((k * len) / (Math.PI * 2))) * Math.PI * 2) / len : k);
  fk.x1 = q(s, w);
  fk.y1 = q(s * 1.3, h);
  fk.x2 = q(s * 0.6, w);
  fk.y2 = q(s * 0.6, h);
}

// Flow as a vector, written to fvx/fvy. 'curl' is the curl of a smooth
// potential made of sine waves: divergence-free, so particles swirl like smoke
// and never pile up into streams. Its waves also tile in wrap mode.
let fvx = 0;
let fvy = 0;
function flowVec(x: number, y: number) {
  const type = settings.flowType;
  if (type === 'waves') {
    const a = flowAngle(x, y);
    fvx = Math.cos(a);
    fvy = Math.sin(a);
    return;
  }
  if (type !== 'curl' && type !== 'tide') return flowShape(type, x, y);
  const tt = t * settings.flowSpeed;
  const inv = 1 / settings.flowScale;
  // Gradient of the potential: sum of amp * sin(kx*x + ky*y + phase).
  const c1 = Math.cos(fk.x1 * x + fk.y1 * y + tt);
  const c2 = 0.9 * Math.cos(fk.x2 * x - fk.y2 * y - tt * 0.7 + 1.3);
  const c3 = 0.5 * Math.cos(fk.x2 * 2 * x + fk.y1 * y + tt * 0.6 + 2.1);
  const c4 = 0.5 * Math.cos(-fk.x1 * x + fk.y2 * 2 * y - tt * 0.9 + 4.2);
  const gx = c1 * fk.x1 + c2 * fk.x2 + c3 * fk.x2 * 2 - c4 * fk.x1;
  const gy = c1 * fk.y1 - c2 * fk.y2 + c3 * fk.y1 + c4 * fk.y2 * 2;
  fvx = gy * inv * 0.8;
  fvy = -gx * inv * 0.8;
  if (type === 'tide') {
    // Smoke that breathes: the whole field swells out and draws back in.
    const dx = x - w / 2;
    const dy = y - h / 2;
    const r = Math.sqrt(dx * dx + dy * dy) + 1;
    const b = Math.sin(t * 1.3);
    const k = 0.65 + 0.35 * b;
    fvx = fvx * k + (dx / r) * b * 0.25;
    fvy = fvy * k + (dy / r) * b * 0.25;
  }
}

// The other flow types, each a velocity of about 1 that particles are steered along.
function flowShape(type: string, x: number, y: number) {
  const tt = t * settings.flowSpeed;
  const dx = x - w / 2;
  const dy = y - h / 2;
  const r = Math.sqrt(dx * dx + dy * dy) + 1;
  const ux = dx / r; // outward
  const uy = dy / r;
  switch (type) {
    case 'vortex': {
      // Orbit the centre, a touch faster near it, with a slow inward pull.
      const sp = 0.7 + 0.5 / (1 + (r * settings.flowScale) / 2);
      const wob = 0.15 * Math.sin(r * settings.flowScale * 3 - tt * 1.5);
      fvx = -uy * sp + ux * (wob - 0.12);
      fvy = ux * sp + uy * (wob - 0.12);
      return;
    }
    case 'wind': {
      // One way, slowly veering, in gusts that roll along.
      const a = 0.35 * Math.sin(tt * 0.3);
      const gust = 0.55 + 0.45 * Math.sin(x * fk.x2 - tt * 2 + 1.5 * Math.sin(y * fk.y1 + tt * 0.4));
      const side = 0.25 * Math.sin(x * fk.x1 * 1.7 + y * fk.y2 + tt);
      fvx = Math.cos(a) * gust - Math.sin(a) * side;
      fvy = Math.sin(a) * gust + Math.cos(a) * side;
      return;
    }
    case 'cells': {
      // A grid of eddies, neighbours spinning opposite ways, slowly drifting.
      const kx = fk.x1 * 2.2;
      const ky = fk.y1 * 1.7;
      // Warped a little so it reads as eddies, not a grid.
      const X = x * kx + tt * 0.4 + 0.8 * Math.sin(y * ky * 0.45 + tt * 0.2);
      const Y = y * ky - tt * 0.3 + 0.8 * Math.sin(x * kx * 0.45 - tt * 0.25);
      fvx = Math.sin(X) * Math.cos(Y) * 1.2;
      fvy = -Math.cos(X) * Math.sin(Y) * 1.2;
      return;
    }
    case 'rise': {
      // Heat: up, wavering side to side, some columns rising faster.
      fvx = 0.55 * Math.sin(y * fk.y1 * 2.5 + tt * 2 + Math.sin(x * fk.x2 * 2));
      fvy = -(0.75 + 0.35 * Math.sin(x * fk.x1 * 1.6 + tt * 0.7));
      return;
    }
    case 'spiral': {
      // Galaxy arms: orbit, drawn towards two winding ridges.
      const ang = Math.atan2(dy, dx);
      const ridge = Math.sin(2 * ang - Math.log(r) * 2.5 * (settings.flowScale / 0.005) + tt * 0.6);
      fvx = -uy * 0.85 + ux * ridge * 0.55;
      fvy = ux * 0.85 + uy * ridge * 0.55;
      return;
    }
  }
  fvx = fvy = 0;
}

function flowAngle(x: number, y: number) {
  const tt = t * settings.flowSpeed;
  return (
    Math.sin(x * fk.x1 + tt) * 1.7 +
    Math.cos(y * fk.y1 - tt * 0.8) * 1.7 +
    Math.sin(x * fk.x2 + y * fk.y2 + tt * 0.5) * 1.2
  );
}

let renewAcc = 0;
function step(dt: number) {
  updateFlowFreqs();
  recordHistory();
  t += dt / 60;
  shapeT += (dt / 60) * macro.spin;
  const { radius, force, pointerMode } = settings;
  // Macros move these relative to the scene.
  const friction = Math.min(0.5, settings.friction * macro.friction);
  const jitter = settings.jitter * macro.jitter + macro.jitterAdd;
  const flow = Math.max(settings.flow, macro.flowMin) * macro.flow;
  const speed = settings.speed * macro.speed;
  const r2 = radius * radius;
  // Right after an explosion, friction, flow and springs ease off for a
  // moment so the burst can travel before the look takes over again.
  const blastLeft = blastUntil - performance.now();
  const blastK = blastLeft > 0 ? Math.min(1, blastLeft / 700) : 0;
  const damp = 1 - friction * (1 - blastK * 0.75);

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
  const holdImplode = pointer.down && settings.click === 'implodeHold' && holdImplodeAt > 0;
  const holdGather = (pointer.down && settings.click === 'gather') || holdImplode;
  const gathering = holdGather || gatherAll || linkRun.out.gather || tlGatherNow;
  const gx = holdGather ? pointer.x : w / 2;
  const gy = holdGather ? pointer.y : h / 2;
  // Implode & burst reaches further the longer it's held.
  const gatherR = holdImplode ? Math.max(220, radius * 3) * (1 + holdCharge() * 1.2) : holdGather ? Math.max(150, radius * 2.5) : Math.hypot(w, h) * 0.6;
  if (holdImplode && performance.now() - holdRingAt > 650) {
    holdRingAt = performance.now();
    addWave('implode', pointer.x, pointer.y, { force: 0.8 * settings.clickForce });
  }
  const gatherMin = holdGather ? 0 : 0.35;
  const gatherCore = holdGather ? 30 : Math.min(w, h) * 0.18;
  if (pointer.down && settings.click === 'emit') emit(dt);
  const whirlK = whirlNow * (Math.min(w, h) / 800);
  // Hover behaviour pauses while gathering so the two don't fight.
  const usePointer = pointer.active && pointerMode !== 'none' && !gathering;

  // Audio. Each detected element drives its own effect:
  //   kick  → field pulse (expand, ease back) and/or a wave
  //   snare → swirl, a ripple, or a size flash
  //   hats  → sparkle (small kicks to a few particles)
  //   sub   → 808 / sub-bass swell on size, flow or speed
  //   energy (how far the music is above its recent average) → speed, flow
  const A = audio.levels;
  const on = reacting();
  const S = settings;
  const I = S.audioIntensity;
  const sub2 = on ? A.sub * A.sub * S.audioSubAmt * I : 0; // squared: swells, not a constant
  let speedNow = on ? speed * (1 + (A.liftLevel * 1.2 + A.level * 0.25) * S.audioSpeed * I) : speed;
  // Flow speed: double-time verses speed the field up.
  if (on && S.audioFlowSpeed > 0) speedNow *= 1 + A.flow * 1.6 * S.audioFlowSpeed * I;
  let flowNow = on ? flow * (1 + A.liftMid * 2 * S.audioFlow * I) : flow;
  if (S.audioSub === 'speed') speedNow *= 1 + sub2 * 1.2;
  if (S.audioSub === 'flow') flowNow = (flowNow || 0.2) * (1 + sub2 * 2.5);
  const lk = linkRun.out.amounts;
  if (lk.flow > 1 && flowNow < 0.15) flowNow = 0.15;
  flowNow *= (1 - blastK) * handDial.flow * lk.flow;
  speedNow *= handDial.speed * lk.speed;
  // Energy shake: the field trembles harder as the music lifts.
  const jitterNow = jitter + (on ? A.liftLevel * S.audioEnergyShake * 2.5 * I : 0);

  const kickPulse = on && (S.audioKick === 'pulse' || S.audioKick === 'both');
  const kickWave = on && (S.audioKick === 'wave' || S.audioKick === 'both');
  const kickAmt = S.audioPulse * I;
  // Pump: the field ducks on each kick and swells back before the next, like
  // a sidechained synth. Slower, not shoved.
  if (on && S.audioKick === 'pump') speedNow *= 1 - Math.min(0.85, A.pulse * 0.75 * kickAmt);
  // Tick: each kick turns the flow a step, like a clock hand.
  if (on && S.audioKick === 'tick') {
    if (A.beat) tickTarget += 0.35 * kickAmt;
    if (flowNow < 0.25) flowNow = 0.25;
  } else tickTarget = tickNow;
  tickNow += (tickTarget - tickNow) * Math.min(1, dt * 0.12);
  // Spawn: each kick lets a puff of particles be born at a spot, fading in.
  if (on && S.audioKick === 'spawn' && A.beat && n > 0) {
    spawnSide = -spawnSide;
    const sx = w * (0.5 + spawnSide * (0.1 + Math.random() * 0.25));
    const sy = h * (0.3 + Math.random() * 0.4);
    const m = Math.min(400, Math.ceil(n * 0.035 * kickAmt));
    for (let q = 0; q < m; q++) {
      const i = (Math.random() * n) | 0;
      if (dead[i] || free[i]) continue;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 14;
      px[i] = ox[i] = sx + Math.cos(a) * r;
      py[i] = oy[i] = sy + Math.sin(a) * r;
      const sp = (0.6 + Math.random() * 2.2) * Math.min(1.6, kickAmt);
      vx[i] = Math.cos(a) * sp;
      vy[i] = Math.sin(a) * sp;
      rebirth(i);
    }
  }
  // Pulse: an outward shove while the kick envelope rises and a gentle pull
  // back while it decays, so the field breathes in place.
  const dPulse = kickPulse ? A.pulse - lastPulse : 0;
  lastPulse = A.pulse;
  let kick = dPulse * (dPulse > 0 ? 3 : 2.5) * S.audioPulse * I;
  // Bass throb: the same breathing shove, driven by the sub-bass swell.
  const dSub = on && S.audioBassThrob > 0 ? A.sub - lastSub : 0;
  lastSub = on ? A.sub : 0;
  kick += dSub * (dSub > 0 ? 3 : 2.5) * S.audioBassThrob * I;
  // Rap flow: a small shove on each syllable, so the field moves with the words.
  if (on && A.syllable && S.audioSylPush > 0) kick += 0.45 * S.audioSylPush * I;
  // Frequency groups: every third particle listens to bass, mids or highs.
  const bands = on ? S.audioBands : 0;
  const kickBand = [1 + 1.8 * bands, 1 - 0.3 * bands, 1 - 0.8 * bands];
  const swirlBand = [1 - 0.6 * bands, 1 + 1.5 * bands, 1 - 0.6 * bands];
  // Build-up and drop: tension draws the field in and makes it shiver,
  // the drop throws everything out from the centre.
  const dropAmt = on ? S.audioDrop * I : 0;
  const tension = dropAmt > 0 && S.audioDropBuild ? A.tension * dropAmt : 0;
  if (dropAmt > 0 && A.drop) {
    addWave('shockwave', w / 2, h / 2, { force: 2.2 * dropAmt, speed: 1.4, ring: S.audioWaveRings, audio: true });
    for (let i = 0; i < n; i++) {
      const dx = px[i] - w / 2;
      const dy = py[i] - h / 2;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      const f = (2 + Math.random() * 4) * dropAmt;
      vx[i] += (dx / d) * f;
      vy[i] += (dy / d) * f;
    }
  }
  if (kickWave && A.beat && S.audioBeat !== 'none') beatWave(A.pulse);
  // Melody ripple: each new note sends a ring, low notes on the left, high on the right.
  if (on && S.audioNoteRipple > 0 && A.note) addWave('ripple', w * (0.12 + (0.76 * A.notePc) / 11), h * (0.35 + Math.random() * 0.3), { force: 0.9 * S.audioNoteRipple * I, speed: 0.8, ring: S.audioWaveRings, audio: true });

  // Accents burst from the centre; rhymes send a ring from somewhere new.
  if (on && S.audioAccentBurst > 0 && A.accent) addWave('shockwave', w / 2, h / 2, { force: 1.3 * S.audioAccentBurst * I, speed: 1.2, ring: S.audioWaveRings, audio: true });
  if (on && S.audioRhymeRipple > 0 && A.rhyme) addWave('ripple', w * (0.2 + Math.random() * 0.6), h * (0.25 + Math.random() * 0.5), { force: 1.5 * S.audioRhymeRipple * I, speed: 0.9, ring: S.audioWaveRings, audio: true });

  // Snare swirl: a twist on each hit, alternating direction.
  const dSnare = on ? Math.max(0, A.snareEnv - lastSnare) : 0;
  lastSnare = A.snareEnv;
  if (on && A.snare) swirlDir = -swirlDir;
  const swirl = S.audioSnare === 'swirl' ? dSnare * 2.2 * S.audioHits * I * swirlDir : 0;
  if (on && A.snare && S.audioSnare === 'wave') {
    addWave('ripple', w * (0.15 + Math.random() * 0.7), h * (0.15 + Math.random() * 0.7), { life: 0.3 + 0.5 * S.audioHits * I, soft: true, ring: S.audioWaveRings });
  }
  // Hat sparkle: nudge a few random particles (only the high group, more
  // of them, with frequency groups on).
  if (on && A.hat && S.audioHats === 'sparkle') {
    const m = Math.ceil(n * 0.05 * (1 + bands));
    for (let q = 0; q < m; q++) {
      let i = (Math.random() * n) | 0;
      if (bands > 0.3) i = Math.min(n - 1, i - (i % 3) + 2);
      const a = Math.random() * Math.PI * 2;
      vx[i] += Math.cos(a) * 1.4 * S.audioHits * I;
      vy[i] += Math.sin(a) * 1.4 * S.audioHits * I;
    }
  }
  const cx = w / 2;
  const cy = h / 2;
  for (let k = waves.length - 1; k >= 0; k--) if (waves[k].life <= 0) waves.splice(k, 1);

  const lifeOn = settings.lifespan > 0;
  const windA = (settings.windDir / 180) * Math.PI;
  const windX = Math.cos(windA) * settings.wind * macro.wind * 0.05;
  const windY = Math.sin(windA) * settings.wind * macro.wind * 0.05;
  const wellsNow = wellList().map((p) => ({ x: p.x * w, y: p.y * h, kind: p.kind }));
  const handR = settings.camHandReach;
  const handR2 = handR * handR;
  const handF = settings.camHandForce * 0.9;
  const ob = obstacleField();
  const fin = forceIn ? Math.min(1, (performance.now() - forceIn.start) / forceIn.dur) : 1;
  if (fin >= 1) forceIn = null;
  const finE = fin * fin * (3 - 2 * fin);
  const obF = settings.obsForce * finE;
  const wellF = settings.wellForce * 0.12 * finE;
  const wellReach = settings.wellRange;
  const emitting = settings.emitter !== 'none';
  // Form & dissolve: the pull fades out and back in on a cycle.
  let homeK = 0;
  // An empty drawing holds nothing: the particles go free.
  if (settings.shape !== 'none' && !(settings.shape === 'drawing' && !drawStrokes.length)) {
    const cyc = settings.shapeCycle;
    const phase = cyc > 0 ? (t % cyc) / cyc : 0;
    const formed = cyc > 0 ? Math.max(0, Math.min(1, Math.cos(phase * Math.PI * 2) * 1.6 + 0.4)) : 1;
    // A tracked face moves all the time: hold on tighter so it keeps up.
    // Follow tightness: up to 15× the usual pull, so lips and eyes keep up.
    const live = settings.shape === 'camera' ? (trackMode() ? 3 + settings.camSnap * 12 : 2) : 1;
    homeK = settings.homeStrength * macro.home * 0.004 * formed * (1 - blastK) * live;
  }
  // A tracked face needs more damping too, or the stronger pull wobbles.
  const faceLive = settings.shape === 'camera' && trackMode();
  const homeDamp = homeK > 0 ? Math.min(faceLive ? 0.5 : 0.2, homeK * (faceLive ? 7 : 12)) : 0;
  const cxW = w / 2;
  placeFrame();
  const cyH = h / 2;
  // While an entrance plays, particles follow their gliding spot closely, then
  // the grip eases off over a second to the normal spring.
  let entK = 0;
  if (entrance) {
    const left = entrance.start + entrance.dur + 1200 - performance.now();
    if (left <= 0 || settings.shape === 'none') entrance = null;
    else entK = Math.min(1, left / 1200);
  }
  runEmitter(dt, on && A.beat);
  const swarm = swarmForces();
  const depthOn = settings.depth > 0;
  // Keep fresh: mark a trickle of particles to fade out and start over, so
  // flows and forces can't pull the whole field into a few lines for good.
  if (settings.renew > 0 && !lifeOn && !emitting && settings.shape === 'none' && n > 0) {
    renewAcc += (n * settings.renew * dt) / 1200;
    while (renewAcc >= 1) {
      renewAcc--;
      const i = (Math.random() * n) | 0;
      if (!dead[i] && span[i] <= 0) span[i] = age[i] + FADE_OUT;
    }
  }
  for (let i = 0; i < n; i++) {
    if (dead[i]) continue;
    age[i] += dt;
    if (free[i]) {
      // Face effects: short-lived sparks with their own drift, no home.
      if (age[i] >= span[i]) {
        dead[i] = 1;
        continue;
      }
      vx[i] += fxAx + (Math.random() - 0.5) * fxJit;
      vy[i] += fxAy + (Math.random() - 0.5) * fxJit;
    } else if (lifeOn && (span[i] <= 0 || age[i] >= span[i])) {
      // End of life (or lifespan just switched on): start again somewhere new.
      if (span[i] > 0 && emitting) {
        dead[i] = 1; // wait for the emitter
        continue;
      } else if (span[i] > 0) {
        px[i] = ox[i] = Math.random() * w;
        py[i] = oy[i] = Math.random() * h;
        rebirth(i);
        launch(i);
      } else {
        // Lifespan just switched on: stay visible, at a random point in life.
        rebirth(i);
        age[i] = FADE_IN + Math.random() * Math.max(0, span[i] - FADE_IN - FADE_OUT);
      }
    } else if (!lifeOn && span[i] > 0 && age[i] >= span[i]) {
      // Keep fresh (or a lifespan that was switched off): this one has faded
      // out, so it starts again somewhere new and fades in.
      px[i] = ox[i] = Math.random() * w;
      py[i] = oy[i] = Math.random() * h;
      rebirth(i);
      launch(i);
    }
    let ax = (Math.random() - 0.5) * jitterNow;
    let ay = (Math.random() - 0.5) * jitterNow + gravNow * 0.05;
    ax += swayF;

    if (flowNow > 0) {
      flowVec(px[i], py[i]);
      if (tickNow !== 0) {
        const c = Math.cos(tickNow);
        const sn = Math.sin(tickNow);
        const fx = fvx;
        fvx = fx * c - fvy * sn;
        fvy = fx * sn + fvy * c;
      }
      if (settings.flowType !== 'waves') {
        // Steer the velocity towards the field (advection) rather than pushing:
        // inertia would fling particles out of the swirls and into streams.
        ax += (fvx * flowNow * 0.9 - vx[i]) * 0.06;
        ay += (fvy * flowNow * 0.9 - vy[i]) * 0.06;
      } else {
        ax += fvx * flowNow * 0.05;
        ay += fvy * flowNow * 0.05;
      }
    }

    if (swarm) {
      ax += swx[i];
      ay += swy[i];
    }
    if (homeK > 0 && !free[i]) {
      // Spring towards the home position, with a little extra damping so it
      // settles instead of wobbling forever.
      // Word pulse scales the target about the centre with the kick.
      let tx = wordScale === 1 ? hx[i] : cxW + (hx[i] - cxW) * wordScale;
      let ty = wordScale === 1 ? hy[i] : cyH + (hy[i] - cyH) * wordScale;
      if (place.on) [tx, ty] = placed(tx, ty);
      ax += (tx - px[i]) * homeK - vx[i] * homeDamp;
      ay += (ty - py[i]) * homeK - vy[i] * homeDamp;
      // Letter hop: one letter (a slice of the shape) jumps on each kick.
      if (hopKick > 0.02 && hopMax > hopMin) {
        const li = Math.min(hopLetters - 1, (((hx[i] - hopMin) / (hopMax - hopMin + 0.01)) * hopLetters) | 0);
        if (li === hopIdx) ay -= hopKick * hopAmt * 1.2;
      }
      // Build-up scatter: the shape shivers apart as the tension rises.
      if (wordShiver > 0) {
        ax += (Math.random() - 0.5) * wordShiver;
        ay += (Math.random() - 0.5) * wordShiver;
      }
    }
    if (entK > 0) {
      const [ex, ey] = place.on ? placed(hx[i], hy[i]) : [hx[i], hy[i]];
      ax += ((ex - px[i]) * 0.06 - vx[i] * 0.4) * entK;
      ay += ((ey - py[i]) * 0.06 - vy[i] * 0.4) * entK;
    }
    if (windX !== 0 || windY !== 0) {
      ax += windX;
      ay += windY;
    }
    // Hands: each fingertip is a small force; a pinch grabs what's near.
    for (const hp of handPts) {
      const dx = px[i] - hp.x;
      const dy = py[i] - hp.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > handR2) continue;
      const d = Math.sqrt(d2) + 0.001;
      const f = handF * (1 - d / handR) * Math.min(1, d / 10);
      const nx = dx / d;
      const ny = dy / d;
      if (settings.camHands === 'attract') {
        ax -= nx * f;
        ay -= ny * f;
      } else if (settings.camHands === 'repel') {
        ax += nx * f;
        ay += ny * f;
      } else {
        ax += (-ny - nx * 0.2) * f;
        ay += (nx - ny * 0.2) * f;
      }
    }
    // Body: wrists sweep particles along with them. Eyes and gaze pull.
    for (const sp of sweepPts) {
      const dx = px[i] - sp.x;
      const dy = py[i] - sp.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > sp.r * sp.r) continue;
      const k = (1 - Math.sqrt(d2) / sp.r) * 0.12 * settings.poseSweep;
      ax += (sp.vx - vx[i]) * k;
      ay += (sp.vy - vy[i]) * k;
    }
    for (const pl of pullPts) {
      const dx = pl.x - px[i];
      const dy = pl.y - py[i];
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      if (d > pl.r) continue;
      const f = pl.f * Math.min(1, d / 12) * (1 - (d / pl.r) * 0.5);
      ax += (dx / d) * f;
      ay += (dy / d) * f;
    }
    for (const pp of pinchPts) {
      const dx = pp.x - px[i];
      const dy = pp.y - py[i];
      const d2 = dx * dx + dy * dy;
      if (d2 > handR2 * 4) continue;
      ax += dx * 0.02 - vx[i] * 0.15;
      ay += dy * 0.02 - vy[i] * 0.15;
    }
    for (const wl of wellsNow) {
      const dx = px[i] - wl.x;
      const dy = py[i] - wl.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      if (d > wellReach * 3) continue;
      // Smooth falloff over the reach, softened at the core so nothing
      // collapses to a single point.
      const f = wellF * Math.exp(-d / wellReach) * Math.min(1, d / 18);
      const nx = dx / d;
      const ny = dy / d;
      if (wl.kind === 'attract') {
        ax -= nx * f;
        ay -= ny * f;
        // Swallowed at the core: comes back in from a random edge, so an
        // attractor keeps feeding instead of ending as one tight ring.
        if (d < 28 && settings.shape === 'none' && !emitting) {
          const e = Math.random() * 4;
          const u = Math.random();
          px[i] = ox[i] = e < 1 ? u * w : e < 2 ? u * w : e < 3 ? 1 : w - 1;
          py[i] = oy[i] = e < 1 ? 1 : e < 2 ? h - 1 : u * h;
          vx[i] = vy[i] = 0;
          rebirth(i);
        }
      } else if (wl.kind === 'repel') {
        ax += nx * f;
        ay += ny * f;
      } else {
        // Vortex: mostly spin, with a little pull so particles orbit.
        ax += (-ny - nx * 0.25) * f;
        ay += (nx - ny * 0.25) * f;
      }
    }

    if (tension > 0) {
      ax += (cx - px[i]) * 0.0009 * tension + (Math.random() - 0.5) * 0.5 * tension;
      ay += (cy - py[i]) * 0.0009 * tension + (Math.random() - 0.5) * 0.5 * tension;
    }

    if (kick !== 0) {
      const dx = px[i] - cx;
      const dy = py[i] - cy;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      // Outer particles move more, so it reads as the whole field expanding.
      const k = kick * kickBand[i % 3] * Math.min(1, d / (Math.min(w, h) * 0.5));
      ax += (dx / d) * k;
      ay += (dy / d) * k;
    }

    if (swirl !== 0) {
      const dx = px[i] - cx;
      const dy = py[i] - cy;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      const k = swirl * swirlBand[i % 3] * Math.min(1, d / (Math.min(w, h) * 0.4));
      ax += (-dy / d) * k;
      ay += (dx / d) * k;
    }

    if (usePointer) {
      const dx = px[i] - pointer.x;
      const dy = py[i] - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        const d = Math.sqrt(d2) + 0.001;
        const f = (1 - d / radius) * force * (depthOn ? Math.max(0.1, 1 + (pz[i] * 1.5 - 0.75) * settings.depth) : 1);
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

    if (whirlK > 0) {
      // Whirl transition: everything spins round the centre for a moment.
      const dx = px[i] - w / 2;
      const dy = py[i] - h / 2;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      ax += (-dy / d - (dx / d) * 0.2) * whirlK;
      ay += (dx / d - (dy / d) * 0.2) * whirlK;
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
    const zs = depthOn ? depthK(0.35 + pz[i], settings.depth) : 1;
    px[i] += vx[i] * speedNow * zs * dt;
    py[i] += vy[i] * speedNow * zs * dt;

    if (px[i] < 0 || px[i] >= w || py[i] < 0 || py[i] >= h) {
      const edges = settings.edges;
      if (emitting) {
        // Emitted particles leave for good and wait to be emitted again.
        dead[i] = 1;
        px[i] = ox[i] = Math.min(w - 1, Math.max(0, px[i]));
        py[i] = oy[i] = Math.min(h - 1, Math.max(0, py[i]));
      } else if (edges === 'bounce') {
        if (px[i] < 0 || px[i] >= w) vx[i] = -vx[i];
        if (py[i] < 0 || py[i] >= h) vy[i] = -vy[i];
        px[i] = Math.min(w - 0.5, Math.max(0, px[i]));
        py[i] = Math.min(h - 0.5, Math.max(0, py[i]));
      } else if (edges === 'enter' && flow > 0) {
        // Come back in at an edge where the current flows inwards.
        enterFromEdge(i);
      } else {
        // Wrap. The flow field tiles the screen in this mode, so there's no
        // seam where opposing currents could trap particles.
        px[i] = ox[i] = ((px[i] % w) + w) % w;
        py[i] = oy[i] = ((py[i] % h) + h) % h;
      }
    }

    if (ob) {
      const gx = (px[i] / OB_CELL) | 0;
      const gy = (py[i] / OB_CELL) | 0;
      if (gx >= 0 && gy >= 0 && gx < ob.W && gy < ob.H) {
        const c = gy * ob.W + gx;
        const d = ob.sd[c];
        if (d < OB_MARGIN) {
          const nx = ob.nx[c];
          const ny = ob.ny[c];
          const near = 1 - Math.max(0, d) / OB_MARGIN;
          // Slide: drop the part of the velocity that heads into the edge.
          const vn = vx[i] * nx + vy[i] * ny;
          if (vn < 0) {
            const k = Math.min(1, near * obF);
            vx[i] -= vn * nx * k;
            vy[i] -= vn * ny * k;
          }
          vx[i] += nx * near * near * 0.3 * obF * dt;
          vy[i] += ny * near * near * 0.3 * obF * dt;
          if (d < 0) {
            const out = Math.min(-d + 1, 6 * dt);
            px[i] += nx * out;
            py[i] += ny * out;
          }
        }
      }
    }
  }
}

// --- swarm: flocking and personal space -------------------------------------
// Neighbours come from a grid with cell size = the larger of the two ranges,
// checking at most SWARM_K neighbours each, so the cost stays linear.

const SWARM_K = 14;
let sHead = new Int32Array(0);
let sNext = new Int32Array(0);
let swx = new Float32Array(0); // swarm acceleration, worked out before the move
let swy = new Float32Array(0);

function swarmForces() {
  const S = settings;
  const fl = S.flock * macro.flock;
  const sp = S.space;
  if (fl <= 0 && sp <= 0) return false;
  if (swx.length < n) {
    swx = new Float32Array(cap);
    swy = new Float32Array(cap);
    sNext = new Int32Array(cap);
  }
  const range = Math.max(fl > 0 ? S.flockRange : 0, sp > 0 ? S.spaceDist : 0);
  const cols = Math.ceil(w / range) + 1;
  const rows = Math.ceil(h / range) + 1;
  if (sHead.length < cols * rows) sHead = new Int32Array(cols * rows);
  sHead.fill(-1, 0, cols * rows);
  for (let i = 0; i < n; i++) {
    if (dead[i]) continue;
    const cx = Math.min(cols - 1, Math.max(0, (px[i] / range) | 0));
    const cy = Math.min(rows - 1, Math.max(0, (py[i] / range) | 0));
    const key = cy * cols + cx;
    sNext[i] = sHead[key];
    sHead[key] = i;
  }
  const fr2 = S.flockRange * S.flockRange;
  const sd = S.spaceDist;
  const sd2 = sd * sd;
  const sepD2 = fr2 * 0.12;
  for (let i = 0; i < n; i++) {
    swx[i] = swy[i] = 0;
    if (dead[i]) continue;
    const cx = Math.min(cols - 1, Math.max(0, (px[i] / range) | 0));
    const cy = Math.min(rows - 1, Math.max(0, (py[i] / range) | 0));
    let cnt = 0;
    let avx = 0, avy = 0, mx = 0, my = 0, sx = 0, sy = 0, rx = 0, ry = 0;
    for (let oy2 = -1; oy2 <= 1 && cnt < SWARM_K; oy2++) {
      const yy = cy + oy2;
      if (yy < 0 || yy >= rows) continue;
      for (let ox2 = -1; ox2 <= 1 && cnt < SWARM_K; ox2++) {
        const xx = cx + ox2;
        if (xx < 0 || xx >= cols) continue;
        for (let j = sHead[yy * cols + xx]; j >= 0 && cnt < SWARM_K; j = sNext[j]) {
          if (j === i) continue;
          const dx = px[j] - px[i];
          const dy = py[j] - py[i];
          const d2 = dx * dx + dy * dy;
          if (sp > 0 && d2 < sd2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = (1 - d / sd) / d;
            rx -= dx * f;
            ry -= dy * f;
          }
          if (fl > 0 && d2 < fr2) {
            cnt++;
            avx += vx[j];
            avy += vy[j];
            mx += dx;
            my += dy;
            if (d2 < sepD2 && d2 > 0.01) {
              sx -= dx / d2;
              sy -= dy / d2;
            }
          }
        }
      }
    }
    let ax = rx * sp * 0.3;
    let ay = ry * sp * 0.3;
    if (fl > 0) {
      if (cnt > 0) {
        ax += ((avx / cnt - vx[i]) * 0.05 * S.flockAlign * macro.align + (mx / cnt) * 0.0015 * S.flockCohesion + sx * 1.5 * S.flockSep) * fl;
        ay += ((avy / cnt - vy[i]) * 0.05 * S.flockAlign * macro.align + (my / cnt) * 0.0015 * S.flockCohesion + sy * 1.5 * S.flockSep) * fl;
      }
      // Boids keep cruising: ease every bird towards a steady speed.
      const v = Math.hypot(vx[i], vy[i]) + 1e-6;
      const k = ((1.6 - v) / v) * 0.03 * fl;
      ax += vx[i] * k;
      ay += vy[i] * k;
    }
    swx[i] = ax;
    swy[i] = ay;
  }
  return true;
}

// --- ribbon history -----------------------------------------------------------
// A ring buffer of recent positions per particle, only kept while a ribbon
// style is in use. Slot `histHead` is the newest for every particle.

let hist = new Float32Array(0);
let histLen = 0;
let histHead = 0;
let histCap = 0;

function usesRibbons() {
  return settings.render === 'ribbons' || (settings.render === 'mixed' && mixStyles().includes('ribbons'));
}

function recordHistory() {
  if (!usesRibbons()) {
    histLen = 0;
    return;
  }
  // Rounded: while a look morphs, ribbonLen glides through fractions, and a
  // fractional length left the ring index fractional (nothing drew).
  const L = Math.max(2, Math.round(settings.ribbonLen * macro.ribbon));
  if (histLen !== L || histCap < cap) {
    histLen = L;
    histCap = cap;
    histHead = 0;
    hist = new Float32Array(cap * L * 2);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < L; k++) {
        hist[(i * L + k) * 2] = px[i];
        hist[(i * L + k) * 2 + 1] = py[i];
      }
  }
  histHead = (histHead + 1) % L;
  for (let i = 0; i < n; i++) {
    const o = (i * L + histHead) * 2;
    hist[o] = px[i];
    hist[o + 1] = py[i];
  }
}

// Ribbons: a smooth curve through each particle's recent positions, drawn in
// three passes that get thinner and fainter towards the tail.
function drawRibbons(list: number[], k: number, s: number) {
  const L = histLen;
  if (!L) return;
  // The history is stored unrotated: rotate each point with the camera spin.
  const c = Math.cos(camA);
  const sn = Math.sin(camA);
  let ry = 0;
  const rx = (x: number, y: number) => {
    if (camA === 0) {
      ry = y;
      return x;
    }
    const dx = x - w / 2;
    const dy = y - h / 2;
    ry = h / 2 + dx * sn + dy * c;
    return w / 2 + dx * c - dy * sn;
  };
  ctx.strokeStyle = shades[k];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const PASSES = 2;
  // Stroking cost grows with segments, so long ribbons skip points: at most
  // about 8 segments each, whatever the length.
  const stride = Math.max(1, Math.round(L / 9));
  const per = Math.ceil((L - 1) / PASSES);
  const a0 = ctx.globalAlpha;
  for (let pass = 0; pass < PASSES; pass++) {
    const from = pass * per;
    const to = Math.min(L - 1, from + per);
    if (from >= to) break;
    ctx.lineWidth = Math.max(0.5, s * (1 - pass * 0.45));
    ctx.globalAlpha = a0 * (1 - pass * 0.45);
    ctx.beginPath();
    for (const i of list) {
      const base = i * L;
      // Parallax offset (the history is stored unshifted).
      const pk = (pz[i] - 0.5) * parAmt;
      const offx = -camX * pk;
      const offy = -camY * pk;
      let slot = (histHead - from + L) % L;
      let x0 = rx(hist[(base + slot) * 2] + offx, hist[(base + slot) * 2 + 1] + offy);
      let y0 = ry;
      ctx.moveTo(x0, y0);
      for (let q = Math.min(to, from + stride); q <= to; q = q === to ? to + 1 : Math.min(to, q + stride)) {
        slot = (histHead - q + L) % L;
        const x1 = rx(hist[(base + slot) * 2] + offx, hist[(base + slot) * 2 + 1] + offy);
        const y1 = ry;
        const dx = x1 - x0;
        const dy = y1 - y0;
        // A big jump means a wrap or a respawn: break the ribbon there.
        if (dx * dx + dy * dy > 2500 * stride * stride) break;
        ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        x0 = x1;
        y0 = y1;
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = a0;
}

// --- shape (home positions) ------------------------------------------------------

let shapeImage: HTMLImageElement | null = null;
let shapeKey = '';
const imageInput = document.createElement('input');
imageInput.type = 'file';
imageInput.accept = 'image/*,.svg';
imageInput.addEventListener('change', () => {
  const f = imageInput.files?.[0];
  if (!f) return;
  const img = new Image();
  const svg = f.type === 'image/svg+xml' || /\.svg$/i.test(f.name);
  img.onload = () => {
    if (svg) {
      // An SVG logo: draw it big and sharp first (some have no size of their own).
      const iw = img.naturalWidth || 300;
      const ih = img.naturalHeight || 300;
      const k = 1600 / Math.max(iw, ih);
      const c = document.createElement('canvas');
      c.width = Math.round(iw * k);
      c.height = Math.round(ih * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const big = new Image();
      big.onload = () => {
        shapeImage = big;
        shapeKey = '';
        buildShape();
      };
      big.src = c.toDataURL('image/png');
      return;
    }
    shapeImage = img;
    shapeKey = '';
    buildShape();
  };
  img.src = URL.createObjectURL(f);
});

// --- camera ----------------------------------------------------------------------
// The camera can be the shape (face tracking, a body cut-out or the plain
// picture) and/or a force (hands). Picture modes sample the webcam like an
// image a few times a second. Face modes pin every particle to a spot on one
// edge of a tracked face, so the homes move with the face each frame.
const cam = new Camera();
const camCanvas = document.createElement('canvas');
const camCtx = camCanvas.getContext('2d', { willReadFrequently: true })!;
let camFrameNo = 0;
let camLast = 0;
const faceMode = () => settings.camMode === 'face' || settings.camMode === 'features' || settings.camMode === 'mixed';
const skelMode = () => settings.camMode === 'hands' || settings.camMode === 'pose';
// Modes whose homes follow tracking every frame.
const trackMode = () => faceMode() || skelMode();
const isCam = () => settings.shape === 'camera';
const handsOn = () => settings.camHands !== 'off';
const faceExtras = () => settings.maskFx !== 'none' || settings.gaze !== 'off' || settings.voice;
// Whole tabs switched off (bypass): their settings stay as they are, and
// scenes still load into them, but the engine leaves them out.
const BYPASSABLE: Tab[] = ['timeline', 'xfader', 'knobs', 'music', 'camera', 'links'];
const BYPASS_KEY = 'particle-field:bypass';
const bypass = new Set<Tab>((() => {
  try {
    return (JSON.parse(localStorage.getItem(BYPASS_KEY) ?? '[]') as Tab[]).filter((t) => BYPASSABLE.includes(t));
  } catch {
    return [];
  }
})());
// The music moves the field (a source is on and the Music tab isn't off).
const reacting = () => audio.source !== 'off' && !bypass.has('music');
// The on-field knobs are out (Knobs tab off) and the crossfader is still.
const playing = () => settings.playOn && !bypass.has('knobs');
const xfLive = () => xf.on && !bypass.has('xfader');
// Connections (see runLinks): declared early, the camera helpers read them.
const linkRun = new LinkRunner();
// Density macro: multiplies the scene's particle count (see countNow).
let densityK = 1;
// Macros (Macros card, plus Connections pushing them): what they do this frame.
const macro = { speed: 1, flow: 1, flowMin: 0, jitter: 1, jitterAdd: 0, friction: 1, home: 1, trailAdd: 0, size: 1, filter: '', flock: 1, align: 1, emit: 1, spin: 1, wind: 1, parallax: 1, ribbon: 1 };
// Shape turning runs on its own clock, so Energy can speed it up without a jump.
let shapeT = 0;
let linkNeed = linkNeeds([]);
let linkFlash = 0;
const faceTracked = () => (isCam() && faceMode()) || faceExtras() || linkNeed.face;
const handsTracked = () => handsOn() || settings.gestOn || (isCam() && settings.camMode === 'hands') || linkNeed.hands;
const poseTracked = () => settings.poseOn || (isCam() && settings.camMode === 'pose') || linkNeed.pose;
const bodyObs = () => settings.obstacles === 'body';
const camWanted = () => !bypass.has('camera') && (isCam() || handsOn() || settings.gestOn || settings.poseOn || bodyObs() || faceExtras() || linkNeed.face || linkNeed.hands || linkNeed.pose);
// Which keys can turn the camera or a tracker on or off.
const CAM_KEYS: (keyof Settings)[] = ['shape', 'camMode', 'camHands', 'gestOn', 'poseOn', 'obstacles', 'maskFx', 'gaze', 'voice', 'links'];

function grabCamera() {
  if (!cam.ready) return;
  camCanvas.width = cam.width;
  camCanvas.height = cam.height;
  camCtx.save();
  if (settings.camMirror) {
    camCtx.translate(cam.width, 0);
    camCtx.scale(-1, 1);
  }
  camCtx.drawImage(cam.video, 0, 0);
  camCtx.restore();
}

let camStarting = false;
async function startCamera() {
  if (camStarting) return;
  if (!cam.on) {
    camStarting = true;
    showToast('Starting the camera…');
    const ok = await cam.start();
    camStarting = false;
    if (!ok) {
      showToast(cam.error === 'Camera permission was denied' ? 'Camera blocked. Allow it in the browser’s site settings (Safari: aA › Website Settings › Camera), then reload.' : cam.error);
      refresh();
      return;
    }
    showToast('Camera on');
  }
  syncTrackers();
  shapeKey = '';
  buildShape();
  refresh();
}

function stopCamera() {
  cam.stop();
  shapeKey = '';
  camShades = null;
  refresh();
}

// Load the trackers the current settings need.
function syncTrackers() {
  if (!cam.on) return;
  if (faceTracked()) loadTracker('face', 'Face tracking on: look at the camera');
  if ((isCam() && settings.camMode === 'body') || bodyObs()) loadTracker('body', 'Body cut-out on');
  if (handsTracked()) loadTracker('hands', 'Hand tracking on: show your hands');
  if (poseTracked()) loadTracker('pose', 'Body tracking on: step back so the camera sees you');
}
function loadTracker(task: Task, done: string) {
  if (cam.status[task] === 'ready' || cam.status[task] === 'loading') return;
  showToast(({ face: 'Loading face tracking…', hands: 'Loading hand tracking…', pose: 'Loading body tracking…', body: 'Loading the body cut-out…' } as const)[task]);
  void cam.load(task).then(() => {
    showToast(cam.status[task] === 'ready' ? done : 'Tracking could not load');
    refresh();
  });
}

// Video pixels → screen: screen x = cx + (x - ox) * sc * mir.
const camMap = { ox: 320, oy: 240, sc: 1, mir: -1 };
const faceBox = { x: 0, y: 0, s: 0 };
// Mirror world puts the camera in the middle of the left half.
const camCx = () => (settings.mirrorWorld ? w / 4 : w / 2);
const toSx = (x: number) => camCx() + (x - camMap.ox) * camMap.sc * camMap.mir;
const toSy = (y: number) => h / 2 + (y - camMap.oy) * camMap.sc;

function updateCamMap() {
  const vw = cam.width;
  const vh = cam.height;
  camMap.mir = settings.camMirror ? -1 : 1;
  const faces = cam.faces;
  if (isCam() && faceMode() && settings.camCentre && faces.length) {
    // Frame the faces: centred, their height a share of the screen.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const f of faces)
      for (let k = 0; k < f.x.length; k++) {
        if (f.x[k] < x0) x0 = f.x[k];
        if (f.x[k] > x1) x1 = f.x[k];
        if (f.y[k] < y0) y0 = f.y[k];
        if (f.y[k] > y1) y1 = f.y[k];
      }
    const bx = (x0 + x1) / 2;
    const by = (y0 + y1) / 2;
    const bs = Math.min((h * settings.shapeSize * 0.85) / Math.max(1, y1 - y0), (camCx() * 2 * settings.shapeSize * 0.9) / Math.max(1, x1 - x0));
    if (!faceBox.s) Object.assign(faceBox, { x: bx, y: by, s: bs });
    faceBox.x += (bx - faceBox.x) * 0.15;
    faceBox.y += (by - faceBox.y) * 0.15;
    faceBox.s += (bs - faceBox.s) * 0.1;
    camMap.ox = faceBox.x;
    camMap.oy = faceBox.y;
    camMap.sc = faceBox.s;
  } else {
    // The picture fills the screen, like a video call.
    camMap.ox = vw / 2;
    camMap.oy = vh / 2;
    camMap.sc = Math.max((camCx() * 2) / vw, h / vh) * (isCam() ? settings.shapeSize : 1);
  }
}

// Each particle's spot on a face: which face, which edge list, which edge,
// how far along it and a tiny offset; and its feature group for colour.
let faceEdge = new Int32Array(0);
let faceSrc = new Uint8Array(0);
let faceT = new Float32Array(0);
let faceJx = new Float32Array(0);
let faceJy = new Float32Array(0);
let partGroup = new Int8Array(0);
let faceKey = '';
const faceSmooth: { x: Float32Array; y: Float32Array; z: Float32Array }[] = [];
// Live expression state (what they do is up to Connections).
let mouthIdx = 0;
let tiltNow = 0;
const WARM = ['ember', 'sunset', 'gold', 'crimson', 'desert'] as const;

function assignFace() {
  const mode = settings.camMode;
  const key = `${mode}|${n}|${settings.camMix}`;
  if (key === faceKey && faceEdge.length >= n) return;
  faceKey = key;
  faceEdge = new Int32Array(n);
  faceSrc = new Uint8Array(n);
  faceT = new Float32Array(n);
  faceJx = new Float32Array(n);
  faceJy = new Float32Array(n);
  partGroup = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const feat = mode === 'features' || (mode === 'mixed' && Math.random() < settings.camMix);
    const list = feat ? cam.features : cam.mesh;
    faceSrc[i] = feat ? 1 : 0;
    faceEdge[i] = (Math.random() * list.length) | 0;
    faceT[i] = Math.random();
    faceJx[i] = (Math.random() - 0.5) * 2;
    faceJy[i] = (Math.random() - 0.5) * 2;
    partGroup[i] = (feat ? cam.featureGroup : cam.meshGroup)[faceEdge[i]];
  }
}

function faceHomes() {
  const faces = cam.faces;
  if (!faces.length || !cam.mesh.length) return;
  assignFace();
  // Smooth the landmarks a little so the shape doesn't jitter (less when
  // following tightly).
  const sk = 0.55 + settings.camSnap * 0.4;
  faces.forEach((f, s) => {
    let sm = faceSmooth[s];
    if (!sm || sm.x.length !== f.x.length) sm = faceSmooth[s] = { x: f.x.slice(), y: f.y.slice(), z: f.z.slice() };
    for (let k = 0; k < f.x.length; k++) {
      sm.x[k] += (f.x[k] - sm.x[k]) * sk;
      sm.y[k] += (f.y[k] - sm.y[k]) * sk;
      sm.z[k] += (f.z[k] - sm.z[k]) * sk;
    }
  });
  const nf = faces.length;
  const depthOn = settings.camDepth;
  const len = Math.min(n, faceEdge.length);
  // Gaze drift: the whole face leans towards where you look.
  const gdx = settings.gaze === 'drift' ? gaze.x * w * 0.12 : 0;
  const gdy = settings.gaze === 'drift' ? gaze.y * h * 0.12 : 0;
  for (let i = 0; i < len; i++) {
    if (free[i]) continue;
    const sm = faceSmooth[nf > 1 ? i % nf : 0];
    const list = faceSrc[i] ? cam.features : cam.mesh;
    const e = list[faceEdge[i] % list.length];
    const t = faceT[i];
    const x = sm.x[e.start] + (sm.x[e.end] - sm.x[e.start]) * t;
    const y = sm.y[e.start] + (sm.y[e.end] - sm.y[e.start]) * t;
    hx[i] = toSx(x) + faceJx[i] + gdx;
    hy[i] = toSy(y) + faceJy[i] + gdy;
    if (depthOn) {
      // Nearer points (nose, lips) come forward; the face edge goes back.
      const z = sm.z[e.start] + (sm.z[e.end] - sm.z[e.start]) * t;
      const fw = Math.abs(sm.x[454] - sm.x[234]) || 100;
      pz[i] = Math.max(0, Math.min(1, 0.55 - (z / fw) * 2.2));
    }
  }
}

// Expressions on the first face: how strong each is (0..1) and whether it's
// past its mark. Connections decide what they do.
type ExKey = 'exMouth' | 'exBlink' | 'exSmile' | 'exBrows' | 'exPucker' | 'exWink' | 'exTilt';
const EXPRESSIONS: [ExKey, string, number][] = [
  ['exMouth', 'Open mouth', 0.6], ['exBlink', 'Blink', 0.55], ['exSmile', 'Smile', 0.7], ['exBrows', 'Raise eyebrows', 0.6],
  ['exPucker', 'Pucker', 0.6], ['exWink', 'Wink', 0.5], ['exTilt', 'Tilt your head', 0.5],
];
const exLevel: Record<ExKey, number> = { exMouth: 0, exBlink: 0, exSmile: 0, exBrows: 0, exPucker: 0, exWink: 0, exTilt: 0 };
const exOn: Record<ExKey, boolean> = { exMouth: false, exBlink: false, exSmile: false, exBrows: false, exPucker: false, exWink: false, exTilt: false };
let mineIdx = 0;

function faceExpressions() {
  const f = cam.face;
  const S = settings;
  const b = f?.blend ?? {};
  // How strong each expression is, 0..1.
  let tiltDeg = 0;
  if (f) {
    const a = Math.atan2(toSy(f.y[263]) - toSy(f.y[33]), toSx(f.x[263]) - toSx(f.x[33]));
    tiltDeg = ((Math.abs(a) > Math.PI / 2 ? a - Math.sign(a) * Math.PI : a) * 180) / Math.PI;
  }
  const bl = b.eyeBlinkLeft ?? 0;
  const br = b.eyeBlinkRight ?? 0;
  const raw: Record<ExKey, number> = {
    exMouth: b.jawOpen ?? 0,
    exBlink: Math.min(bl, br),
    exSmile: ((b.mouthSmileLeft ?? 0) + (b.mouthSmileRight ?? 0)) / 2,
    exBrows: b.browInnerUp ?? 0,
    exPucker: b.mouthPucker ?? 0,
    exWink: Math.max(bl, br) > 0.5 ? Math.abs(bl - br) : 0,
    exTilt: Math.min(1, Math.abs(tiltDeg) / 30),
  };
  // Sensitivity scales every expression up or down.
  for (const [k] of EXPRESSIONS) exLevel[k] = f ? Math.min(1, raw[k] * S.exSense) : 0;

  tiltNow = tiltDeg;
  // Past the mark (for the meters' glow); re-arms well below it.
  for (const [k, , hi] of EXPRESSIONS) exOn[k] = exOn[k] ? exLevel[k] > hi * 0.5 : exLevel[k] > hi;
}

// Stream from the mouth (Connections: "… → Stream from the mouth"), more
// when the music is loud.
function mouthStream(amt: number) {
  const f = cam.on ? cam.face : null;
  if (!f || amt < 0.12) return;
  const mx = toSx((f.x[13] + f.x[14]) / 2);
  const my = toSy((f.y[13] + f.y[14]) / 2);
  const loud = reacting() ? 0.4 + audio.levels.level * 1.2 : 1;
  const k = Math.min(n, Math.round(amt * 50 * loud));
  const sp = Math.min(w, h) / 800;
  for (let q = 0; q < k; q++) {
    const i = mouthIdx++ % n;
    const a = Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const v = (2 + Math.random() * 7) * sp * (0.6 + amt);
    px[i] = ox[i] = mx + (Math.random() - 0.5) * 8;
    py[i] = oy[i] = my + (Math.random() - 0.5) * 4;
    vx[i] = Math.cos(a) * v * (Math.random() < 0.5 ? 1 : -1) * 0.8;
    vy[i] = Math.sin(a) * v;
  }
}

// The next of the face looks (features, mesh, mixed).
function nextFaceLook() {
  const order = ['face', 'features', 'mixed'] as const;
  const k = order.indexOf(settings.camMode as (typeof order)[number]);
  set('camMode', order[(k + 1) % order.length]);
  showToast(label(CAM_MODES, settings.camMode));
}
function nextMine() {
  if (!myPresets.length) return showToast('No scenes of yours yet');
  // Keep the camera look: only presets that use the camera, else all.
  const camOnes = myPresets.filter((p) => p.settings.shape === 'camera');
  const list = camOnes.length ? camOnes : myPresets;
  playMine(list[mineIdx++ % list.length]);
}

// Connections card: one row per link, with a live meter of its input.
// A live meter loop: runs fn each frame only while el is on screen, and
// ends for good once el has left the page (cards are rebuilt often).
function meterLoop(el: HTMLElement, fn: (now: number) => void) {
  let seen = false;
  let shown = false;
  const io = new IntersectionObserver((es) => (shown = es[es.length - 1].isIntersecting));
  io.observe(el);
  const born = performance.now();
  const tick = (now: number) => {
    if (el.isConnected) seen = true;
    else if (seen || now - born > 10000) return io.disconnect();
    if (shown) fn(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function renderLinks() {
  const box = document.createElement('div');
  box.className = 'links';
  const list = document.createElement('div');
  const meters: [string, HTMLElement][] = [];
  let drawn = '\u0000';
  const select = (opts: [string, string, string][], value: string, change: (v: string) => void, label: string) => {
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', label);
    let group: HTMLOptGroupElement | null = null;
    for (const [v, text, g] of opts) {
      if (g && group?.label !== g) {
        group = document.createElement('optgroup');
        group.label = g;
        sel.append(group);
      }
      (group ?? sel).append(new Option(text, v));
    }
    sel.value = value;
    sel.addEventListener('change', () => change(sel.value));
    return sel;
  };
  const srcOpts: [string, string, string][] = SOURCES.map((d) => [d.id, d.label, d.group]);
  const KIND_GROUP = { moment: 'Moment', while: 'While held', amount: 'Amount' } as const;
  const actOpts: [string, string, string][] = ACTIONS.map((a) => [a.id, a.label, KIND_GROUP[a.kind]]);
  const whenOpts: [string, string, string][] = [['', 'Any time', ''], ...SOURCES.filter((d) => d.kind !== 'moment').map((d) => [d.id, `Only while: ${d.label}`, d.group] as [string, string, string])];
  const save = (links: Link[]) => {
    drawn = formatLinks(links);
    set('links', drawn as never);
    draw();
  };
  const draw = () => {
    const links = parseLinks(settings.links);
    drawn = settings.links;
    list.innerHTML = '';
    meters.length = 0;
    links.forEach((l, k) => {
      const row = document.createElement('div');
      row.className = 'link';
      const top = document.createElement('div');
      top.className = 'link-top';
      const meter = document.createElement('i');
      meter.className = 'meter';
      meter.innerHTML = '<b></b>';
      meters.push([l.src, meter.firstElementChild as HTMLElement]);
      const upd = (patch: Partial<Link>) => save(links.map((x, j) => (j === k ? { ...x, ...patch } : x)));
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '→';
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rm';
      rm.textContent = '×';
      rm.title = 'Remove this connection';
      rm.addEventListener('click', () => save(links.filter((_, j) => j !== k)));
      const act = document.createElement('div');
      act.className = 'link-act';
      act.append(arrow, select(actOpts, l.act, (v) => upd({ act: v }), 'Does'));
      top.append(meter, select(srcOpts, l.src, (v) => upd({ src: v }), 'Input'), rm, act);
      const bottom = document.createElement('div');
      bottom.className = 'link-bottom';
      if (actionDef(l.act)?.kind === 'amount') {
        const amt = document.createElement('input');
        Object.assign(amt, { type: 'range', min: -1, max: 1, step: 0.05, value: String(l.amt) });
        amt.setAttribute('aria-label', 'Strength');
        const out = document.createElement('output');
        const fmt = (v: number) => (v < 0 ? `−${Math.round(-v * 100)}% (opposite)` : `${Math.round(v * 100)}%`);
        out.textContent = fmt(l.amt);
        amt.addEventListener('input', () => {
          links[k] = { ...l, amt: Number(amt.value) };
          out.textContent = fmt(links[k].amt);
          drawn = formatLinks(links);
          set('links', drawn as never);
        });
        bottom.append(amt, out);
      }
      bottom.append(select(whenOpts, l.when, (v) => upd({ when: v }), 'Only while'));
      row.append(top, bottom);
      list.append(row);
    });
  };
  const add = document.createElement('div');
  add.className = 'link-add';
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+ Add a connection';
  plus.addEventListener('click', () => save([...parseLinks(settings.links), { src: 'bass', when: '', act: 'size', amt: 0.5 }]));
  const ideas = document.createElement('div');
  ideas.className = 'chips link-ideas';
  for (const [text, code] of LINK_EXAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => save([...parseLinks(settings.links), ...parseLinks(code)]));
    ideas.append(b);
  }
  add.append(plus, ideas);
  box.append(list, add);
  refreshers.push(() => {
    if (settings.links !== drawn) draw();
  });
  meterLoop(box, () => {
    for (const [src, el] of meters) el.style.height = `${Math.round((linkRun.levels[src] ?? 0) * 100)}%`;
  });
  return box;
}

// Live meters for the Camera inputs card: how strong each one is right now.
function renderExMeters() {
  const box = document.createElement('div');
  box.className = 'ex-meters';
  const bars: [ExKey, HTMLElement][] = [];
  for (const [k, name, hi] of EXPRESSIONS) {
    const row = document.createElement('div');
    row.className = 'ex-row';
    row.innerHTML = `<span>${name}</span><i><b></b><em style="left:${hi * 100}%"></em></i>`;
    bars.push([k, row.querySelector('b')!]);
    box.append(row);
  }
  meterLoop(box, () => {
    for (const [k, el] of bars) {
      el.style.width = `${(exLevel[k] * 100).toFixed(0)}%`;
      el.classList.toggle('hot', exOn[k]);
    }
  });
  return box;
}

// Live meters for the Rap flow card: is it hearing a voice, and what fires.
function renderRapMeters() {
  const box = document.createElement('div');
  box.className = 'ex-meters rap-meters';
  const status = document.createElement('p');
  status.className = 'rap-status';
  box.append(status);
  const rows: [string, () => number, () => boolean, (() => string)?][] = [
    ['Voice', () => audio.levels.vocal, () => audio.levels.voxOn],
    ['Syllable', () => audio.levels.syllEnv, () => audio.levels.syllable],
    ['Pause', () => 0, () => audio.levels.pause],
    ['Flow', () => audio.levels.flow, () => audio.levels.flow > 0.35, () => `${(audio.levels.flow * 8).toFixed(1)}/s`],
    ['Accent', () => 0, () => audio.levels.accent],
    ['Pitch', () => (audio.levels.voxOn ? audio.levels.voxPitch : 0), () => Math.abs(audio.levels.voxRise) > 0.5],
    ['Rhyme', () => 0, () => audio.levels.rhyme],
  ];
  const els = rows.map(([name]) => {
    const row = document.createElement('div');
    row.className = 'ex-row';
    row.innerHTML = `<span>${name}</span><i><b></b></i><small></small>`;
    box.append(row);
    return { b: row.querySelector('b')!, n: row.querySelector('small')!, seen: -1e9 };
  });
  let sylCount: number[] = [];
  meterLoop(box, (now) => {
    {
      const L = audio.levels;
      if (L.syllable) sylCount.push(now);
      sylCount = sylCount.filter((t) => now - t < 10000);
      status.textContent = audio.source === 'off' ? 'Turn on a sound source (Sound source card) to see it listen.' : L.voxOn ? 'Hearing a voice.' : sylCount.length ? 'Between words.' : 'No voice heard yet.';
      rows.forEach(([, lv, fire, txt], i) => {
        const e = els[i];
        if (fire()) e.seen = now;
        const hot = now - e.seen < 180;
        // Moments (pause, accent, rhyme) light the whole bar for a beat.
        const v = lv() || (hot && !txt && i >= 2 ? 1 : 0);
        e.b.style.width = `${(Math.min(1, v) * 100).toFixed(0)}%`;
        e.b.classList.toggle('hot', hot);
        e.n.textContent = txt ? txt() : i === 1 ? `${sylCount.length} in 10 s` : '';
      });
    }
  });
  return box;
}

// Hands: fingertips push or pull (or swirl) the particles; a pinch grabs,
// and a quick release throws what it holds.
// Draw mode: a pinch is the pen (any finger, with a colour each, in finger
// colours), an open palm erases. Spray mode: index fingers shoot particles.
const TIPS = [4, 8, 12, 16, 20];
const FINGER_TONES = [0.08, 0.36, 0.64, 0.92];
type Pt2 = { x: number; y: number };
let handPts: Pt2[] = [];
let pinchPts: Pt2[] = [];
let markPts: Pt2[] = [];
let penPts: Pt2[] = [];
let erasePts: { x: number; y: number; r: number }[] = [];
const penLast: (Pt2 | null)[] = Array(8).fill(null);
const pinchWas: ({ x: number; y: number; vx: number; vy: number } | null)[] = [null, null];
let drawIdx = 0;
const isPaint = () => settings.camHands === 'draw' || settings.camHands === 'spray';
function handForces() {
  handPts = [];
  pinchPts = [];
  markPts = [];
  penPts = [];
  erasePts = [];
  if (!handsOn()) {
    // Gestures alone: a dot on each palm so you can see you're tracked.
    if (settings.gestOn) for (const hd of cam.hands) markPts.push({ x: toSx(hd.x[9]), y: toSy(hd.y[9]) });
    return;
  }
  const paint = isPaint();
  cam.hands.forEach((hd, k) => {
    const tx = toSx(hd.x[4]);
    const ty = toSy(hd.y[4]);
    const ix = toSx(hd.x[8]);
    const iy = toSy(hd.y[8]);
    const span = Math.hypot(toSx(hd.x[0]) - toSx(hd.x[9]), toSy(hd.y[0]) - toSy(hd.y[9])) || 100;
    const pinch = Math.hypot(tx - ix, ty - iy) < span * 0.35;
    if (!paint) {
      for (const q of TIPS) handPts.push({ x: toSx(hd.x[q]), y: toSy(hd.y[q]) });
      markPts = handPts;
      if (k < 2) {
        const was = pinchWas[k];
        if (pinch) {
          const pt = { x: (tx + ix) / 2, y: (ty + iy) / 2 };
          pinchPts.push(pt);
          // Smoothed hand speed, so a flick can throw.
          pinchWas[k] = was ? { ...pt, vx: was.vx * 0.6 + (pt.x - was.x) * 0.4, vy: was.vy * 0.6 + (pt.y - was.y) * 0.4 } : { ...pt, vx: 0, vy: 0 };
        } else if (was) {
          if (Math.hypot(was.vx, was.vy) > 3) throwFrom(was);
          pinchWas[k] = null;
        }
      }
      return;
    }
    markPts.push({ x: ix, y: iy });
    if (settings.camHands === 'draw') {
      // The finger closest to the thumb (if it touches) is the pen.
      const pens = settings.drawColour === 'finger' ? [8, 12, 16, 20] : [8];
      let best = -1;
      let bestD = span * 0.35;
      pens.forEach((tip, f) => {
        const d = Math.hypot(tx - toSx(hd.x[tip]), ty - toSy(hd.y[tip]));
        if (d < bestD) (bestD = d), (best = f);
      });
      // Brush width: how far apart the index and middle fingers are.
      const wide = settings.drawWidth ? Math.max(0.4, Math.min(5, (Math.hypot(ix - toSx(hd.x[12]), iy - toSy(hd.y[12])) / span) * 4)) : 1;
      for (let f = 0; f < 4; f++) {
        const slot = Math.min(1, k) * 4 + f;
        if (f !== best) {
          penLast[slot] = null;
          continue;
        }
        const tip = pens[f];
        const pt = { x: (tx + toSx(hd.x[tip])) / 2, y: (ty + toSy(hd.y[tip])) / 2 };
        penPts.push(pt);
        drawStroke(penLast[slot] ?? pt, pt, wide, settings.drawColour === 'finger' ? FINGER_TONES[f] : -1);
        penLast[slot] = pt;
      }
      // Erase: an open palm wipes what it touches.
      if (settings.drawErase && best < 0 && hd.gesture === 'Open_Palm' && hd.score > 0.6) {
        const e = { x: toSx(hd.x[9]), y: toSy(hd.y[9]), r: span * 1.3 };
        erasePts.push(e);
        eraseAt(e.x, e.y, e.r);
      }
    } else {
      // Spray along the index finger, from its tip.
      const dx = ix - toSx(hd.x[6]);
      const dy = iy - toSy(hd.y[6]);
      const d = Math.hypot(dx, dy) || 1;
      sprayFrom(ix, iy, dx / d, dy / d);
    }
  });
  for (let s = Math.min(2, cam.hands.length) * 4; s < penLast.length; s++) penLast[s] = null;
  for (let k = cam.hands.length; k < 2; k++) pinchWas[k] = null;
}

// A flick on release: what the pinch held flies off with the hand's speed.
function throwFrom(p: { x: number; y: number; vx: number; vy: number }) {
  // A cap, so a tracking jump can't fling everything off screen.
  const sp = Math.hypot(p.vx, p.vy);
  const cap = Math.min(1, 30 / sp);
  p = { ...p, vx: p.vx * cap, vy: p.vy * cap };
  const R = settings.camHandReach * 2;
  const R2 = R * R;
  const k = 1.4;
  for (let i = 0; i < n; i++) {
    if (dead[i]) continue;
    const dx = px[i] - p.x;
    const dy = py[i] - p.y;
    if (dx * dx + dy * dy > R2) continue;
    const s = 0.7 + Math.random() * 0.6;
    vx[i] += p.vx * k * s + (Math.random() - 0.5) * 1.5;
    vy[i] += p.vy * k * s + (Math.random() - 0.5) * 1.5;
  }
  // Ease the springs and friction off for a moment so the throw carries.
  blastUntil = Math.max(blastUntil, performance.now() + 700);
}

function eraseAt(x: number, y: number, r: number) {
  const r2 = r * r;
  for (let i = 0; i < n; i++) {
    if (dead[i]) continue;
    const dx = px[i] - x;
    const dy = py[i] - y;
    if (dx * dx + dy * dy < r2) dead[i] = 1;
  }
}

// The next particle for drawing: the oldest drawn one (or a parked one).
function nextInk(x: number, y: number, tn = -1) {
  const i = drawIdx++ % n;
  px[i] = ox[i] = x;
  py[i] = oy[i] = y;
  dead[i] = 0;
  rebirth(i);
  age[i] = FADE_IN;
  // Colour runs along the stroke, so a drawing is a slow rainbow (or each
  // finger has its own colour).
  tone[i] = tn >= 0 ? Math.max(0, Math.min(0.999, tn + (Math.random() - 0.5) * 0.06)) : (performance.now() / 6000) % 1;
  return i;
}

function drawStroke(a: Pt2, b: Pt2, wide = 1, tn = -1) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.min(120, Math.max(2, Math.round((d / 2) * Math.max(1, wide * 0.7))));
  const thick = (1 + settings.size * 1.5) * wide;
  for (let q = 0; q < steps; q++) {
    const u = q / steps;
    const i = nextInk(a.x + (b.x - a.x) * u + (Math.random() - 0.5) * thick, a.y + (b.y - a.y) * u + (Math.random() - 0.5) * thick, tn);
    vx[i] = (Math.random() - 0.5) * 0.2;
    vy[i] = (Math.random() - 0.5) * 0.2;
  }
}

function sprayFrom(x: number, y: number, dx: number, dy: number) {
  const k = Math.max(2, Math.round(n / 300));
  const sp = Math.min(w, h) / 800;
  for (let q = 0; q < k; q++) {
    const i = nextInk(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4);
    const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
    const v = (3 + Math.random() * 5) * sp;
    vx[i] = Math.cos(a) * v;
    vy[i] = Math.sin(a) * v;
  }
}

// This only lists the signs seen, for the card summary and debug.
// view of those). This only lists the signs seen, for the card and debug.
type GKey = 'gFist' | 'gPalm' | 'gPoint' | 'gThumbUp' | 'gThumbDown' | 'gVictory' | 'gLove';
const GESTURES: [GKey, string, string][] = [
  ['gFist', 'Closed_Fist', 'Fist ✊'], ['gPalm', 'Open_Palm', 'Open palm ✋'], ['gVictory', 'Victory', 'Peace sign ✌️'],
  ['gThumbUp', 'Thumb_Up', 'Thumbs up 👍'], ['gThumbDown', 'Thumb_Down', 'Thumbs down 👎'], ['gPoint', 'Pointing_Up', 'Point up ☝️'], ['gLove', 'ILoveYou', 'Rock on 🤟'],
];
let gestShown = '';
let presetStep = 0;
function handGestures() {
  const seen = cam.hands.filter((hd) => hd.score > 0.55).map((hd) => GESTURES.find(([, name]) => name === hd.gesture)?.[2]);
  gestShown = seen.filter(Boolean).join(' · ');
}

function nextSceneSameFamily() {
  const fam = lastPresetFamily ?? 'camera';
  const pool = PRESETS.filter(([nm]) => FAMILY_OF[nm] === fam);
  const [nm, p] = pool[presetStep++ % pool.length];
  playPreset(nm, p);
}
function saveSceneNow() {
  const name = `Gesture ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  myPresets.push({ name, settings: snapshot() });
  writeJson(MY_PRESETS_KEY, myPresets);
  redrawMine();
  showToast(`Saved “${name}” to My scenes`);
}
function clearDrawing() {
  paintParked = false;
  syncPaint();
}

// Two hands (Camera inputs card): how far apart they are and the angle between
// them turn live dials. Level hands a shoulder-width apart are neutral.
const handDial = { zoom: 1, size: 1, flow: 1, speed: 1, roll: 0, hue: 0 };
let twoLine: [Pt2, Pt2] | null = null;
function twoHands() {
  const S = settings;
  const tgt = { zoom: 1, size: 1, flow: 1, speed: 1, roll: 0, hue: 0 };
  twoLine = null;
  if (cam.on && S.gestOn && cam.hands.length >= 2 && (S.twoDist !== 'off' || S.twoAngle !== 'off')) {
    const p = cam.hands.slice(0, 2).map((hd) => ({ x: toSx(hd.x[9]), y: toSy(hd.y[9]) })).sort((a, b) => a.x - b.x);
    twoLine = [p[0], p[1]];
    const u = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) / (Math.min(w, h) * 0.5);
    const ang = (Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180) / Math.PI;
    if (S.twoDist === 'zoom') tgt.zoom = Math.max(0.8, Math.min(2.5, 1 + (u - 1) * 0.8));
    else if (S.twoDist === 'size') tgt.size = Math.max(0.3, Math.min(3.5, u * u));
    else if (S.twoDist === 'flow') tgt.flow = Math.max(0, Math.min(4, u * u));
    else if (S.twoDist === 'speed') tgt.speed = Math.max(0.2, Math.min(3, u * u));
    if (S.twoAngle === 'turn') tgt.roll = ang;
    else if (S.twoAngle === 'hue') tgt.hue = ang * 3;
  }
  const k = 0.2;
  for (const key of Object.keys(tgt) as (keyof typeof tgt)[]) handDial[key] += (tgt[key] - handDial[key]) * k;
}

// Hands or body as the shape: every particle sits on one bone of a tracked
// skeleton (both hands, or the body with a round head), so the shape moves
// with you.
let skelEdge = new Int32Array(0);
let skelT = new Float32Array(0);
let skelJ = new Float32Array(0);
let skelKey = '';
const skelSmooth: { x: Float32Array; y: Float32Array }[] = [];
function skelHomes() {
  const pose = settings.camMode === 'pose';
  // The body skips the small face lines: a round head reads better.
  const edges = pose ? cam.poseEdges.filter((e) => e.start > 10 || e.end > 10) : cam.handEdges;
  const list: { x: Float32Array; y: Float32Array }[] = pose ? cam.poses : cam.hands;
  if (!edges.length || !list.length) return;
  const key = `${settings.camMode}|${n}`;
  if (key !== skelKey || skelEdge.length < n) {
    skelKey = key;
    skelEdge = new Int32Array(n);
    skelT = new Float32Array(n);
    skelJ = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      skelEdge[i] = pose && Math.random() < 0.18 ? -1 : (Math.random() * edges.length) | 0;
      skelT[i] = Math.random();
      skelJ[i] = (Math.random() - 0.5) * 2;
    }
  }
  const sk = 0.55 + settings.camSnap * 0.4;
  list.forEach((p, s) => {
    let sm = skelSmooth[s];
    if (!sm || sm.x.length !== p.x.length) sm = skelSmooth[s] = { x: p.x.slice(), y: p.y.slice() };
    for (let k = 0; k < p.x.length; k++) {
      sm.x[k] += (p.x[k] - sm.x[k]) * sk;
      sm.y[k] += (p.y[k] - sm.y[k]) * sk;
    }
  });
  const nl = Math.min(2, list.length);
  // Screen positions of each skeleton's points, and its bone thickness.
  const sx: Float32Array[] = [];
  const sy: Float32Array[] = [];
  const thick: number[] = [];
  for (let s = 0; s < nl; s++) {
    const sm = skelSmooth[s];
    sx.push(Float32Array.from(sm.x, toSx));
    sy.push(Float32Array.from(sm.y, toSy));
    const a = pose ? 11 : 0;
    const b = pose ? 12 : 9;
    thick.push(Math.hypot(sx[s][a] - sx[s][b], sy[s][a] - sy[s][b]) * (pose ? 0.09 : 0.1) || 6);
  }
  for (let i = 0; i < n; i++) {
    if (free[i]) continue;
    const s = nl > 1 ? i % nl : 0;
    const X = sx[s];
    const Y = sy[s];
    const e = skelEdge[i];
    if (e < 0) {
      // The head: a ring round the nose, a shoulder-width across.
      const R = thick[s] * 3.6;
      const a = skelT[i] * Math.PI * 2;
      const r = R * (0.9 + skelJ[i] * 0.1);
      hx[i] = X[0] + Math.cos(a) * r;
      hy[i] = Y[0] - R * 0.2 + Math.sin(a) * r * 1.15;
      continue;
    }
    const ed = edges[e % edges.length];
    const x0 = X[ed.start];
    const y0 = Y[ed.start];
    const dx = X[ed.end] - x0;
    const dy = Y[ed.end] - y0;
    const d = Math.hypot(dx, dy) || 1;
    const t = skelT[i];
    const o = skelJ[i] * thick[s];
    hx[i] = x0 + dx * t - (dy / d) * o;
    hy[i] = y0 + dy * t + (dx / d) * o;
  }
}

// Body (Camera inputs card): wrists sweep particles along with them, and a jump (the
// hips rising fast) is a Connections input.
let sweepPts: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
const wristWas: ({ x: number; y: number; vx: number; vy: number } | null)[] = [null, null];
function bodyForces() {
  sweepPts = [];
  const p = cam.poses[0];
  if (!settings.poseOn || !p) {
    wristWas[0] = wristWas[1] = null;
    return;
  }
  const sw = Math.hypot(toSx(p.x[11]) - toSx(p.x[12]), toSy(p.y[11]) - toSy(p.y[12])) || 150;
  [15, 16].forEach((k, s) => {
    if (p.v[k] < 0.5) {
      wristWas[s] = null;
      return;
    }
    const x = toSx(p.x[k]);
    const y = toSy(p.y[k]);
    const was = wristWas[s];
    const v = was ? { vx: was.vx * 0.6 + (x - was.x) * 0.4, vy: was.vy * 0.6 + (y - was.y) * 0.4 } : { vx: 0, vy: 0 };
    wristWas[s] = { x, y, ...v };
    markPts.push({ x, y });
    if (settings.poseSweep > 0 && Math.hypot(v.vx, v.vy) > 0.8) sweepPts.push({ x, y, ...v, r: sw * 0.9 });
  });
}

// Face extras (Face extras card): a share of the particles leaves the shape
// to become a mask effect (flames, a crown, tears…) or your voice, streaming
// from the mouth. They live short lives and are reused round and round.
let fxAx = 0;
let fxAy = 0;
let fxJit = 0;
let poolFrom = 0;
let poolTo = 0;
let poolIdx = 0;
const gaze = { x: 0, y: 0 };
let pullPts: { x: number; y: number; r: number; f: number }[] = [];
const FLAME_IDS = [10, 338, 297, 332, 284, 251, 389, 356, 127, 162, 21, 54, 103, 67, 109];
const JAW_IDS = [132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361];
function syncPool() {
  const S = settings;
  const want = cam.on && cam.face && (S.maskFx !== 'none' || S.voice) ? Math.round(n * S.maskShare) : 0;
  const from = n - want;
  if (from === poolFrom && n === poolTo) return;
  for (let i = poolFrom; i < Math.min(poolTo, free.length); i++) {
    if (!free[i]) continue;
    free[i] = 0;
    if (i < n) {
      spawn(i, Math.random() * w, Math.random() * h);
      dead[i] = paintParked ? 1 : 0;
    }
  }
  for (let i = from; i < n; i++) {
    free[i] = 1;
    dead[i] = 1;
  }
  poolFrom = from;
  poolTo = n;
}

// Next idle effect particle (or the oldest one if all are busy).
function fxEmit(x: number, y: number, vX: number, vY: number, life: number, tn: number) {
  const size = poolTo - poolFrom;
  if (size <= 0) return;
  let i = -1;
  for (let q = 0; q < size; q++) {
    const j = poolFrom + ((poolIdx + q) % size);
    if (dead[j]) {
      i = j;
      poolIdx = (poolIdx + q + 1) % size;
      break;
    }
  }
  if (i < 0) i = poolFrom + (poolIdx++ % size);
  dead[i] = 0;
  px[i] = ox[i] = x;
  py[i] = oy[i] = y;
  vx[i] = vX;
  vy[i] = vY;
  age[i] = FADE_IN - 4;
  span[i] = age[i] + Math.max(FADE_OUT * 0.6, life);
  tone[i] = tn < 0 ? Math.random() : Math.max(0, Math.min(0.999, tn));
  rnd[i] = Math.random();
  pz[i] = 0.7 + Math.random() * 0.3;
}

function faceFx(now: number) {
  const S = settings;
  const f = cam.face;
  fxAx = fxAy = fxJit = 0;
  pullPts = [];
  if (!f) return;
  const X = (k: number) => toSx(f.x[k]);
  const Y = (k: number) => toSy(f.y[k]);
  const fw = Math.hypot(X(454) - X(234), Y(454) - Y(234)) || 100;
  const u = fw / 220;
  // The face's own up and right, so effects follow a tilt.
  let upx = X(10) - X(152);
  let upy = Y(10) - Y(152);
  const ul = Math.hypot(upx, upy) || 1;
  upx /= ul;
  upy /= ul;
  const rx = -upy;
  const ry = upx;
  // Where you look: the irises within the eyes, plus the head turn.
  const eye = (iris: number, a: number, b: number, top: number, bot: number) => [
    (X(iris) - (X(a) + X(b)) / 2) / (Math.abs(X(a) - X(b)) / 2 || 1),
    (Y(iris) - (Y(top) + Y(bot)) / 2) / (Math.abs(Y(top) - Y(bot)) / 2 || 1),
  ];
  if (f.x.length > 473) {
    const [lx, ly] = eye(468, 33, 133, 159, 145);
    const [qx, qy] = eye(473, 362, 263, 386, 374);
    const yaw = (X(1) - (X(234) + X(454)) / 2) / (fw * 0.25);
    const gx = Math.max(-1, Math.min(1, ((lx + qx) / 2) * 1.6 + yaw * 0.8));
    const gy = Math.max(-1, Math.min(1, ((ly + qy) / 2) * 1.2));
    gaze.x += (gx - gaze.x) * 0.15;
    gaze.y += (gy - gaze.y) * 0.15;
  }
  if (S.gaze === 'eyes' && f.x.length > 473) {
    for (const k of [468, 473]) pullPts.push({ x: X(k), y: Y(k), r: fw * 0.9, f: 0.5 });
  } else if (S.gaze === 'drift' && !(isCam() && faceMode())) {
    pullPts.push({ x: w / 2 + gaze.x * w * 0.45, y: h / 2 + gaze.y * h * 0.45, r: Math.hypot(w, h), f: 0.05 });
  }
  const size = poolTo - poolFrom;
  if (size <= 0) return;
  const rate = (life: number, share = 1) => Math.max(1, Math.round((size / life) * share));
  const rnd2 = () => Math.random() - 0.5;
  const fx = S.maskFx;
  if (fx === 'flames') {
    fxAx = upx * 0.09 * u;
    fxAy = upy * 0.09 * u;
    fxJit = 0.25 * u;
    for (let q = rate(50, S.voice ? 0.6 : 1); q > 0; q--) {
      const k = FLAME_IDS[(Math.random() * FLAME_IDS.length) | 0];
      const v = (0.5 + Math.random() * 2) * u;
      fxEmit(X(k) + rnd2() * 6, Y(k) + rnd2() * 6, upx * v + rnd2() * u, upy * v + rnd2() * u, 30 + Math.random() * 40, Math.random() * 0.4);
    }
  } else if (fx === 'crown') {
    fxJit = 0.05 * u;
    const cx = X(10) + upx * fw * 0.1;
    const cy = Y(10) + upy * fw * 0.1;
    for (let q = rate(40, S.voice ? 0.6 : 1); q > 0; q--) {
      // Five spikes over a band, the middle and outer ones tallest.
      const j = ((Math.random() * 5) | 0) - 2;
      const bx = cx + rx * j * fw * 0.14;
      const by = cy + ry * j * fw * 0.14;
      const tall = fw * (j % 2 === 0 ? 0.32 : 0.2);
      const along = Math.random() < 0.3 ? 0 : Math.random();
      const side = along === 0 ? rnd2() * fw * 0.14 : rnd2() * fw * 0.07 * (1 - along);
      fxEmit(bx + upx * tall * along + rx * side, by + upy * tall * along + ry * side, rnd2() * 0.4 * u, rnd2() * 0.4 * u, 25 + Math.random() * 30, 0.7 + Math.random() * 0.29);
    }
  } else if (fx === 'tears') {
    fxAx = -upx * 0.1 * u;
    fxAy = -upy * 0.1 * u;
    for (let q = rate(80, S.voice ? 0.5 : 0.8); q > 0; q--) {
      const k = Math.random() < 0.5 ? 145 : 374;
      const v = (0.3 + Math.random()) * u;
      fxEmit(X(k) + rnd2() * fw * 0.08, Y(k) + rnd2() * 3, -upx * v + rnd2() * 0.3 * u, -upy * v + rnd2() * 0.3 * u, 50 + Math.random() * 50, 0.5 + Math.random() * 0.2);
    }
  } else if (fx === 'beard') {
    fxAx = -upx * 0.04 * u;
    fxAy = -upy * 0.04 * u;
    fxJit = 0.08 * u;
    for (let q = rate(90, S.voice ? 0.6 : 1); q > 0; q--) {
      const t = Math.random() * (JAW_IDS.length - 1);
      const k0 = JAW_IDS[t | 0];
      const k1 = JAW_IDS[(t | 0) + 1];
      const ft = t - (t | 0);
      const v = (0.2 + Math.random() * 0.9) * u;
      fxEmit(X(k0) + (X(k1) - X(k0)) * ft, Y(k0) + (Y(k1) - Y(k0)) * ft, -upx * v + rnd2() * 0.2 * u, -upy * v + rnd2() * 0.2 * u, 60 + Math.random() * 60, t / (JAW_IDS.length - 1));
    }
  } else if (fx === 'halo') {
    const cx = X(10) + upx * fw * 0.32;
    const cy = Y(10) + upy * fw * 0.32;
    const spin = now / 900;
    for (let q = rate(45, S.voice ? 0.6 : 1); q > 0; q--) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ex = rx * ca * fw * 0.45 + upx * sa * fw * 0.11;
      const ey = ry * ca * fw * 0.45 + upy * sa * fw * 0.11;
      const tv = 0.8 * u;
      fxEmit(cx + ex, cy + ey, (-rx * sa + upx * ca * 0.25) * tv, (-ry * sa + upy * ca * 0.25) * tv, 30 + Math.random() * 25, 0.8 + ((Math.sin(spin + a) + 1) / 2) * 0.19);
    }
  } else if (fx === 'lasers' && f.x.length > 473) {
    // Beams go where you look (or out to the sides when looking ahead).
    const dl = Math.hypot(gaze.x, gaze.y);
    for (const k of [468, 473]) {
      let bx = gaze.x;
      let by = gaze.y;
      if (dl < 0.25) {
        bx = X(k) < (X(468) + X(473)) / 2 ? -1 : 1;
        by = 0.15;
      }
      const bl = Math.hypot(bx, by) || 1;
      const v = 24 * u;
      for (let q = rate(50, 0.5); q > 0; q--) {
        const j = rnd2() * 0.03;
        fxEmit(X(k) + rnd2() * 2, Y(k) + rnd2() * 2, (bx / bl + j) * v, (by / bl + j) * v, 40 + Math.random() * 20, 0.92 + Math.random() * 0.07);
      }
    }
  }
  // Voice: the microphone streams particles from your mouth, coloured by pitch.
  if (S.voice && audio.source !== 'off') {
    const lvl = audio.levels.level;
    if (lvl > 0.06) {
      const mx = (X(13) + X(14)) / 2;
      const my = (Y(13) + Y(14)) / 2;
      const open = Math.min(1, Math.hypot(X(13) - X(14), Y(13) - Y(14)) / (fw * 0.15));
      for (let q = Math.round(rate(60, 0.6) * Math.min(2, lvl * 2.5)); q > 0; q--) {
        const a = rnd2() * (0.6 + open * 1.4);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        // Out of the mouth: down the face, fanning wider as it opens.
        const ddx = -upx * ca + rx * sa;
        const ddy = -upy * ca + ry * sa;
        const v = (2 + lvl * 9 + Math.random() * 2) * u;
        fxEmit(mx + rnd2() * fw * 0.05, my + rnd2() * 3, ddx * v, ddy * v, 40 + Math.random() * 40, audio.pitch + rnd2() * 0.05);
      }
    }
  }
}

// Silhouette obstacle: the body cut-out as a picture, in a given colour.
let bodyFrame = 0;
let bodyAt = 0;
const bodyMasks = new Map<string, { frame: number; c: HTMLCanvasElement }>();
function bodyMask(colour: string) {
  const m = cam.body!;
  let e = bodyMasks.get(colour);
  if (!e) bodyMasks.set(colour, (e = { frame: -1, c: document.createElement('canvas') }));
  if (e.frame === bodyFrame && e.c.width === m.w) return e.c;
  e.frame = bodyFrame;
  e.c.width = m.w;
  e.c.height = m.h;
  const g = e.c.getContext('2d')!;
  const img = g.createImageData(m.w, m.h);
  for (let k = 0; k < m.w * m.h; k++) {
    img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = 255;
    img.data[k * 4 + 3] = m.data[k] > 0.5 ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, m.w, m.h);
  return e.c;
}

// Mirror world: the left half, mirrored onto the right in other colours.
const mBuf = document.createElement('canvas');
const mCtx = mBuf.getContext('2d')!;
function mirrorHalf() {
  const cw = canvas.width;
  const ch = canvas.height;
  const half = Math.floor(cw / 2);
  if (mBuf.width !== half || mBuf.height !== ch) {
    mBuf.width = half;
    mBuf.height = ch;
  }
  mCtx.globalCompositeOperation = 'copy';
  mCtx.drawImage(canvas, 0, 0, half, ch, 0, 0, half, ch);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(cw - half, 0, half, ch);
  ctx.clip();
  ctx.globalCompositeOperation = 'copy';
  ctx.filter = 'hue-rotate(150deg)';
  ctx.translate(cw, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(mBuf, 0, 0);
  ctx.restore();
}

// Painting starts on an empty canvas: every particle waits, parked, until
// a stroke or spray uses it. Other modes bring them all back.
let paintParked = false;
function syncPaint() {
  const want = handsOn() && isPaint() && cam.on;
  if (want === paintParked) return;
  paintParked = want;
  if (want) {
    for (let i = 0; i < n; i++) dead[i] = 1;
    drawIdx = 0;
  } else if (settings.emitter === 'none') for (let i = 0; i < n; i++) if (dead[i]) spawn(i, Math.random() * w, Math.random() * h), (dead[i] = 0);
}

// Camera colours: the frame's colours ranked by brightness become the
// shades, and each particle takes the shade of its spot in the picture.
let camShades: Rgb[] | null = null;
let camRank = new Float32Array(0);
const CG_W = 96;
const CG_H = 72;
const cgCanvas = document.createElement('canvas');
cgCanvas.width = CG_W;
cgCanvas.height = CG_H;
const cgCtx = cgCanvas.getContext('2d', { willReadFrequently: true })!;
let camColourAt = 0;
function camColours(now: number) {
  if (settings.colorBy !== 'camera' || !cam.ready || now - camColourAt < 400) return;
  camColourAt = now;
  cgCtx.drawImage(cam.video, 0, 0, CG_W, CG_H);
  const d = cgCtx.getImageData(0, 0, CG_W, CG_H).data;
  const N = CG_W * CG_H;
  const lum = new Float32Array(N);
  for (let k = 0; k < N; k++) lum[k] = d[k * 4] * 0.299 + d[k * 4 + 1] * 0.587 + d[k * 4 + 2] * 0.114;
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => lum[a] - lum[b]);
  if (camRank.length !== N) camRank = new Float32Array(N);
  const shades: Rgb[] = [];
  const per = N / SHADES;
  for (let s = 0; s < SHADES; s++) {
    let r = 0, g = 0, bl = 0, c = 0;
    for (let q = Math.floor(s * per); q < Math.floor((s + 1) * per); q++) {
      const k = order[q];
      r += d[k * 4];
      g += d[k * 4 + 1];
      bl += d[k * 4 + 2];
      c++;
      camRank[k] = s / SHADES + 0.5 / SHADES;
    }
    // Lift the darkest tones a little so they show on a dark background.
    const lift = 18 * (1 - s / SHADES);
    shades.push([r / c + lift, g / c + lift, bl / c + lift]);
  }
  camShades = shades;
  buildShades();
}
function camShade(i: number) {
  if (!camShades) return tone[i];
  const vxp = camMap.ox + (hx[i] - w / 2) / (camMap.sc * camMap.mir);
  const vyp = camMap.oy + (hy[i] - h / 2) / camMap.sc;
  const gx = Math.max(0, Math.min(CG_W - 1, ((vxp / cam.width) * CG_W) | 0));
  const gy = Math.max(0, Math.min(CG_H - 1, ((vyp / cam.height) * CG_H) | 0));
  return camRank[gy * CG_W + gx];
}

// The small preview of what the camera sees.
cam.video.className = 'cam-preview';
let previewShown = false;
function syncPreview() {
  const show = cam.on && settings.camPreview;
  if (show !== previewShown) {
    previewShown = show;
    if (show) document.querySelector('.stage')?.append(cam.video);
    else cam.video.remove();
  }
  cam.video.classList.toggle('mirror', settings.camMirror);
}

// Called every frame: track, then move the homes or re-sample the picture.
function faceIdle() {
  tiltNow = 0;
  for (const [k] of EXPRESSIONS) (exLevel[k] = 0), (exOn[k] = false);
}
function cameraTick(now: number) {
  syncPreview();
  if (!cam.on) {
    handPts = pinchPts = markPts = penPts = [];
    erasePts = [];
    sweepPts = [];
    pullPts = [];
    fxAx = fxAy = fxJit = 0;
    gestShown = '';
    syncPaint();
    syncPool();
    twoHands();
    faceIdle();
    return;
  }
  const faceOn = faceTracked();
  if (faceOn) cam.detectFaces(now);
  if (handsTracked()) cam.detectHands(now);
  if (poseTracked()) cam.detectPose(now);
  if (!handsTracked()) cam.hands = [];
  if (!poseTracked()) cam.poses = [];
  updateCamMap();
  if (isCam() && faceMode()) faceHomes();
  if (isCam() && skelMode()) skelHomes();
  if (faceOn) faceExpressions();
  else faceIdle();
  syncPaint();
  syncPool();
  handForces();
  handGestures();
  twoHands();
  bodyForces();
  if (faceOn) faceFx(now);
  else {
    fxAx = fxAy = fxJit = 0;
    pullPts = [];
  }
  camColours(now);
  const rateMs = 1000 / settings.camRate;
  if (bodyObs() && now - bodyAt > rateMs) {
    bodyAt = now;
    cam.segmentBody(now);
    bodyFrame++;
  }
  if (isCam() && !trackMode() && now - camLast > rateMs) {
    camLast = now;
    if (settings.camMode === 'body' && !bodyObs()) cam.segmentBody(now);
    camFrameNo++;
    buildShape();
  }
}

// Sample the lit pixels of an offscreen drawing, then give every particle one
// of them (spread evenly, so each part of the shape gets its share).
function sampleTargets(draw: (g: CanvasRenderingContext2D, W: number, H: number) => boolean): [number, number][] {
  const step = 2;
  const W = Math.max(1, Math.round(w / step));
  const H = Math.max(1, Math.round(h / step));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  if (!draw(g, W, H)) return [];
  const data = g.getImageData(0, 0, W, H).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 128) pts.push([x * step, y * step]);
  return pts;
}

// Image shape: give each pixel a weight (how much it should attract
// particles), then pick points with probability proportional to it, like a
// stipple drawing.
function sampleImage(): [number, number][] {
  const camOn = settings.shape === 'camera';
  if (camOn) grabCamera();
  const src: { width: number; height: number } | null = camOn ? (cam.ready ? camCanvas : null) : shapeImage;
  if (!src) return [];
  const step = 2;
  const W = Math.max(1, Math.round(w / step));
  const H = Math.max(1, Math.round(h / step));
  // The camera fills the screen (like a video call); images fit inside it.
  // Mirror world: the camera fills the left half (the right is its mirror).
  const Wv = camOn && settings.mirrorWorld ? W / 2 : W;
  const sc = (camOn ? Math.max : Math.min)((Wv * settings.shapeSize) / src.width, (H * settings.shapeSize) / src.height);
  const iw = Math.max(2, Math.round(src.width * sc));
  const ih = Math.max(2, Math.round(src.height * sc));
  const ix = Math.round((Wv - iw) / 2);
  const iy = Math.round((H - ih) / 2);
  const c = document.createElement('canvas');
  c.width = iw;
  c.height = ih;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src as CanvasImageSource, 0, 0, iw, ih);
  const d = g.getImageData(0, 0, iw, ih).data;
  const N = iw * ih;
  const lum = new Float32Array(N);
  const alpha = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    lum[k] = (0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2]) / 255;
    alpha[k] = d[k * 4 + 3] / 255;
  }
  const wt = new Float32Array(N);
  const subject = () => {
    // Pixels that differ from the corner colour (the background).
    const [br, bg, bb, ba] = [d[0], d[1], d[2], d[3]];
    let cover = 0;
    for (let k = 0; k < N; k++) {
      const q = k * 4;
      const diff = Math.abs(d[q] - br) + Math.abs(d[q + 1] - bg) + Math.abs(d[q + 2] - bb) + Math.abs(d[q + 3] - ba);
      wt[k] = diff > 90 && d[q + 3] > 60 ? 1 : 0;
      cover += wt[k];
    }
    return cover / N;
  };
  if (camOn && settings.camMode === 'body') {
    // Body cut-out: the tracker's confidence that each pixel is you.
    const m = cam.body;
    if (!m) return [];
    const wt = new Float32Array(N);
    for (let y = 0; y < ih; y++)
      for (let x = 0; x < iw; x++) {
        let u = x / iw;
        if (settings.camMirror) u = 1 - u;
        const mx = Math.min(m.w - 1, (u * m.w) | 0);
        const my = Math.min(m.h - 1, ((y / ih) * m.h) | 0);
        wt[y * iw + x] = m.data[my * m.w + mx] > 0.5 ? 1 : 0;
      }
    const pts: [number, number][] = [];
    for (let tries = 0; pts.length < n && tries < n * 60; tries++) {
      const k = (Math.random() * N) | 0;
      if (wt[k] > 0) pts.push([(ix + (k % iw) + Math.random()) * step, (iy + ((k / iw) | 0) + Math.random()) * step]);
    }
    return pts;
  }
  let mode = camOn ? (settings.camMode as 'bright' | 'dark' | 'edges') : settings.imageMode;
  if (mode === 'auto') {
    // A logo on a plain background covers part of the frame; a photo
    // "differs" almost everywhere, so fall back to brightness.
    const cover = subject();
    mode = cover > 0.02 && cover < 0.75 ? 'subject' : 'bright';
  } else if (mode === 'subject') subject();
  if (mode === 'bright' || mode === 'dark') {
    // Stretch to the image's own range so low-contrast photos still read.
    let lo = 1;
    let hi = 0;
    for (let k = 0; k < N; k++) {
      lo = Math.min(lo, lum[k]);
      hi = Math.max(hi, lum[k]);
    }
    const span = Math.max(0.05, hi - lo);
    for (let k = 0; k < N; k++) {
      const v = (lum[k] - lo) / span;
      wt[k] = (mode === 'bright' ? v : 1 - v) ** 2.2 * alpha[k];
    }
  }
  else if (mode === 'edges') {
    let max = 1e-6;
    for (let y = 1; y < ih - 1; y++)
      for (let x = 1; x < iw - 1; x++) {
        const k = y * iw + x;
        const gx = lum[k + 1 - iw] + 2 * lum[k + 1] + lum[k + 1 + iw] - lum[k - 1 - iw] - 2 * lum[k - 1] - lum[k - 1 + iw];
        const gy = lum[k - 1 + iw] + 2 * lum[k + iw] + lum[k + 1 + iw] - lum[k - 1 - iw] - 2 * lum[k - iw] - lum[k + 1 - iw];
        wt[k] = Math.hypot(gx, gy) * alpha[k];
        if (wt[k] > max) max = wt[k];
      }
    // Camera pictures are busy and noisy: keep only the strongest lines.
    if (camOn) for (let k = 0; k < N; k++) wt[k] = Math.min(1, (wt[k] / max) * 1.6) ** 2.2;
    else for (let k = 0; k < N; k++) wt[k] = Math.min(1, (wt[k] / max) * 2.5) ** 0.8;
  }
  const pts: [number, number][] = [];
  for (let tries = 0; pts.length < n && tries < n * 60; tries++) {
    const k = (Math.random() * N) | 0;
    if (Math.random() < wt[k]) pts.push([(ix + (k % iw) + Math.random()) * step, (iy + ((k / iw) | 0) + Math.random()) * step]);
  }
  return pts;
}

// --- more shapes ---------------------------------------------------------------
// Icons, a sequence of them, a clock, the tempo and your own drawing are
// drawn and traced like text. Curves, 3D solids and the live spectrum are
// points worked out every frame, so they can turn and move with the music.
let paramShape: { kind: 'geo' | 'solid' | 'bars' | 'ring'; u: Float32Array; v: Float32Array } | null = null;
let shapeT0 = performance.now();
const shapeTime = () => (performance.now() - shapeT0) / 1000;
let seqIdx = 0;
const seqTokens = () => settings.shapeSeq.split(',').map((x) => x.trim()).filter(Boolean);
const seqToken = () => {
  const t = seqTokens();
  return t.length ? t[seqIdx % t.length] : 'heart';
};
const clockText = () => {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
};
const tempoText = () => (audio.source !== 'off' && audio.levels.bpm > 0 ? `${Math.round(audio.levels.bpm)}` : 'BPM');
function shapeDetail() {
  const S = settings;
  switch (S.shape) {
    case 'icon': return S.shapeIcon;
    case 'geo': return S.shapeGeo;
    case 'solid': return S.shapeSolid;
    case 'pattern': return `${S.shapePattern}|${S.patScale}|${S.patForm}|${S.patVary}|${S.patSeed}`;
    case 'sequence': return `${seqToken()}`;
    case 'drawing': return `${drawVersion}`;
    case 'live': return S.shapeLive === 'clock' ? clockText() : S.shapeLive === 'tempo' ? tempoText() : S.shapeLive;
  }
  return '';
}
// Rebuild the shape and let the particles glide to it.
function reshape(ms = 700) {
  const fx = hx.slice(0, n);
  const fy = hy.slice(0, n);
  const before = shapeKey;
  shapeKey = '';
  buildShape();
  if (shapeKey !== before && !paramShape) homeGlide = { fx, fy, tx: hx.slice(0, n), ty: hy.slice(0, n), start: performance.now(), dur: ms };
}

// The spectrum, in a few bands from low to high, smoothed.
const SPEC_N = 40;
const specRaw = new Float32Array(SPEC_N);
const spec = new Float32Array(SPEC_N);
function paramPoint(kind: string, u: number, v: number, t: number, R: number, out: number[]) {
  const S = settings;
  const cx = w / 2;
  const cy = h / 2;
  if (kind === 'geo') {
    let [x, y] = geoPoint(S.shapeGeo, u, v, t, (w / 2) / Math.max(1, R));
    if (GEO_SPINS(S.shapeGeo) && S.shapeSpin > 0) {
      const a = shapeT * S.shapeSpin * 0.6;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      [x, y] = [x * c - y * sn, x * sn + y * c];
    }
    out[0] = cx + x * R;
    out[1] = cy + y * R;
    out[2] = -1;
  } else if (kind === 'solid') {
    const [x0, y0, z0] = solidPoint(S.shapeSolid, u, v);
    // Turning at 0 holds it still, facing where you set it.
    const yaw = (S.shapeSpin > 0 ? shapeT * (0.15 + S.shapeSpin * 0.9) : 0) + (S.shapeFacing * Math.PI) / 180;
    const pitch = 0.45 + (S.shapeSpin > 0 ? 0.2 * Math.sin(t * 0.3) : 0) + (S.shapeTilt * Math.PI) / 180;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const x1 = x0 * cyw + z0 * syw;
    const z1 = -x0 * syw + z0 * cyw;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const y2 = y0 * cp - z1 * sp;
    const z2 = y0 * sp + z1 * cp;
    const persp = 2.6 / (2.6 + z2);
    out[0] = cx + x1 * R * persp;
    out[1] = cy + y2 * R * persp;
    out[2] = Math.max(0, Math.min(1, (1 - z2) / 2));
  } else if (kind === 'bars') {
    // Mirrored bars from the middle: bass in the centre, highs at the sides.
    const side = u < 0.5 ? -1 : 1;
    const f = Math.abs(u - 0.5) * 2;
    const b = Math.min(SPEC_N - 1, (f * SPEC_N) | 0);
    const span = Math.min(w * 0.46, R * 1.6);
    const bw = span / SPEC_N;
    const hgt = (0.03 + spec[b] * 0.97) * R * 0.9;
    out[0] = cx + side * (b + 0.5 + (v * 7919 % 1 - 0.5) * 0.6) * bw;
    out[1] = cy + (v * 2 - 1) * hgt;
    out[2] = -1;
  } else {
    // A ring: each angle reaches out as far as its band is loud.
    const a = u * Math.PI * 2 + shapeT * S.shapeSpin * 0.4;
    const f = Math.abs(((u * 2) % 2) - 1);
    const b = Math.min(SPEC_N - 1, (f * SPEC_N) | 0);
    const r = R * (0.5 + v * (0.04 + spec[b] * 0.5));
    out[0] = cx + Math.cos(a) * r;
    out[1] = cy + Math.sin(a) * r;
    out[2] = -1;
  }
}
function buildParamShape() {
  const S = settings;
  const kind = S.shape === 'geo' ? 'geo' : S.shape === 'solid' ? 'solid' : S.shapeLive === 'ring' ? 'ring' : 'bars';
  const R = (Math.min(w, h) / 2) * S.shapeSize;
  const tu = new Float32Array(n);
  const tv = new Float32Array(n);
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const o = [0, 0, 0];
  const t = shapeTime();
  for (let k = 0; k < n; k++) {
    tu[k] = (k + Math.random()) / n;
    tv[k] = Math.random();
    paramPoint(kind, tu[k], tv[k], t, R, o);
    tx[k] = o[0];
    ty[k] = o[1];
  }
  const owner = matchNearest(tx, ty);
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    u[owner[k]] = tu[k];
    v[owner[k]] = tv[k];
  }
  // Glide from where the particles' homes were to the new points.
  const fx = hx.slice(0, n);
  const fy = hy.slice(0, n);
  paramShape = { kind, u, v };
  paramGlide = { fx, fy, start: performance.now(), dur: S.shape === settingsShapeBefore ? 300 : 900 };
  settingsShapeBefore = S.shape;
}
let paramGlide: { fx: Float32Array; fy: Float32Array; start: number; dur: number } | null = null;
let settingsShapeBefore = '';
function animateShape(now: number) {
  const S = settings;
  if (S.shape === 'none') return;
  // Things that change the traced shapes: the next item in a sequence, the
  // clock's seconds, a new tempo.
  if (S.shape === 'sequence') {
    const L = audio.levels;
    const music = reacting() && L.bpm > 0;
    let fire = false;
    if (music) {
      if (S.shapeSeqEvery === 'drop') fire = L.drop;
      else if (L.bar) {
        seqBars++;
        const every = S.shapeSeqEvery === '8bars' ? 8 : everyBars(S.shapeSeqEvery);
        fire = seqBars % every === 0 || L.drop;
      }
      seqAt = now;
    } else if (now - seqAt > S.shapeSeqSec * 1000) {
      fire = true;
      seqAt = now;
    }
    if (fire && seqTokens().length > 1) {
      seqIdx++;
      reshape(Math.min(1200, music ? 60000 / L.bpm : 900));
    }
  } else if (S.shape === 'live' && (S.shapeLive === 'clock' || S.shapeLive === 'tempo') && now - liveAt > 250) {
    liveAt = now;
    const d = S.shapeLive === 'clock' ? clockText() : tempoText();
    if (d !== liveLast) {
      liveLast = d;
      reshape(400);
    }
  }
  const ps = paramShape;
  // Curves and solids glide on their own; a traced-shape glide would fight it.
  if (ps && homeGlide) homeGlide = null;
  if (!ps || ps.u.length !== n) {
    if (ps) {
      shapeKey = '';
      buildShape();
    }
    return;
  }
  if (ps.kind === 'bars' || ps.kind === 'ring') {
    audio.spectrum(specRaw);
    for (let b = 0; b < SPEC_N; b++) spec[b] += (specRaw[b] - spec[b]) * (specRaw[b] > spec[b] ? 0.5 : 0.12);
  }
  const R = (Math.min(w, h) / 2) * S.shapeSize;
  const t = shapeTime();
  const o = [0, 0, 0];
  const g = paramGlide;
  let e = 1;
  if (g) {
    const k = Math.min(1, (now - g.start) / g.dur);
    e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    if (k >= 1) paramGlide = null;
  }
  for (let i = 0; i < n; i++) {
    if (free[i]) continue;
    paramPoint(ps.kind, ps.u[i], ps.v[i], t, R, o);
    if (g && i < g.fx.length) {
      hx[i] = g.fx[i] + (o[0] - g.fx[i]) * e;
      hy[i] = g.fy[i] + (o[1] - g.fy[i]) * e;
    } else {
      hx[i] = o[0];
      hy[i] = o[1];
    }
    if (o[2] >= 0) pz[i] = o[2];
  }
}
let seqBars = 0;
let seqAt = 0;
let liveAt = 0;
let liveLast = '';

// Draw your own shape: strokes on the field, kept between visits.
const DRAW_KEY = 'particle-field:drawing';
let drawStrokes: number[][] = readJson<number[][]>(DRAW_KEY, []);
let drawVersion = 0;
let drawMode = false;
let arranging = false; // the Arrange overlay is up (Shape placement by hand)
let drawCur: number[] | null = null;
let drawLastBuild = 0;
function saveDrawing() {
  drawVersion++;
  writeJson(DRAW_KEY, drawStrokes);
}
function toggleDraw() {
  drawMode = !drawMode;
  if (drawMode) showToast('Draw on the field. Each stroke joins the shape.');
  refresh();
}
function undoStroke() {
  drawStrokes.pop();
  saveDrawing();
  inkSync();
  reshape(500);
}
function clearShapeDrawing() {
  const had = drawStrokes.length > 0;
  drawStrokes = [];
  saveDrawing();
  inkSync();
  reshape(500);
  // Let go of the old shape with a soft push.
  if (had) explode(w / 2, h / 2, 0.5);
}
const drawing = () => drawMode && settings.shape === 'drawing';
canvas.addEventListener('pointerdown', (e) => {
  if (!drawing()) return;
  e.stopImmediatePropagation();
  canvas.setPointerCapture(e.pointerId);
  drawCur = [e.offsetX / w, e.offsetY / h];
  drawStrokes.push(drawCur);
  inkSync();
}, true);
canvas.addEventListener('pointermove', (e) => {
  if (!drawCur || !drawing()) return;
  const x = e.offsetX / w;
  const y = e.offsetY / h;
  const lx = drawCur[drawCur.length - 2];
  const ly = drawCur[drawCur.length - 1];
  if (Math.hypot((x - lx) * w, (y - ly) * h) < 4) return;
  drawCur.push(x, y);
  inkSync();
  // Show it forming while you draw, a few times a second.
  const now = performance.now();
  if (now - drawLastBuild > 160) {
    drawLastBuild = now;
    drawVersion++;
    reshape(200);
  }
});
const endStroke = () => {
  if (!drawCur) return;
  drawCur = null;
  saveDrawing();
  inkSync();
  reshape(300);
};
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

// Ink: the stroke shows as a soft line while you draw and fades a moment
// after you lift, so the particles take over. "Show the outline" keeps it.
const INK_NS = 'http://www.w3.org/2000/svg';
const inkSvg = document.createElementNS(INK_NS, 'svg');
inkSvg.classList.add('ink');
inkSvg.setAttribute('aria-hidden', 'true');
inkSvg.setAttribute('preserveAspectRatio', 'none');
inkSvg.setAttribute('viewBox', '0 0 1 1');
const inkPaths = new Map<number[], SVGPathElement>();
const inkFade = new Map<number[], number>();
function inkSync() {
  if (inkSvg.previousElementSibling !== fxCanvas) fxCanvas.after(inkSvg);
  const show = settings.shape === 'drawing';
  for (const [st, p] of inkPaths) if (!drawStrokes.includes(st) || !show) { p.remove(); inkPaths.delete(st); inkFade.delete(st); }
  if (!show) return;
  for (const st of drawStrokes) {
    let p = inkPaths.get(st);
    if (!p) {
      p = document.createElementNS(INK_NS, 'path');
      p.setAttribute('vector-effect', 'non-scaling-stroke');
      inkSvg.append(p);
      inkPaths.set(st, p);
      // Strokes already there when the page opens start faded.
      if (st !== drawCur) p.classList.add('gone');
    }
    let d = '';
    for (let i = 0; i < st.length; i += 2) d += `${i ? 'L' : 'M'}${st[i].toFixed(4)} ${st[i + 1].toFixed(4)}`;
    if (st.length === 2) d += `l0.0001 0`;
    p.setAttribute('d', d);
    const live = st === drawCur;
    if (live) { p.classList.remove('gone'); inkFade.delete(st); }
    else if (!inkFade.has(st) && !p.classList.contains('gone')) {
      inkFade.set(st, window.setTimeout(() => { p!.classList.add('gone'); inkFade.delete(st); }, 900));
    }
  }
  inkSvg.classList.toggle('outline', settings.drawOutline);
}

function buildShape() {
  const S = settings;
  // An animated size plays as a scale on the built shape (see placeFrame), so
  // the shape is built once at the knob's own size, not every frame.
  const sz = animBase.shapeSize ?? S.shapeSize;
  const key = [S.shape, S.shapeText, S.imageMode, sz, w, h, n, shapeImage?.src ?? '', S.shape === 'camera' ? `${S.camMode}${S.camMirror}${camFrameNo}` : '', shapeDetail()].join('|');
  if (S.shape === 'none' || key === shapeKey) return;
  if (S.shape === 'camera' && trackMode()) {
    // Face, hand and body modes: the homes follow the tracking every frame.
    shapeKey = key;
    if (!cam.face) for (let i = 0; i < n; i++) {
      hx[i] = px[i];
      hy[i] = py[i];
    }
    return;
  }
  shapeKey = key;
  shapeBuiltSize = sz;
  if (!glideHomes) homeGlide = null;
  const cx = w / 2;
  const cy = h / 2;
  const R = (Math.min(w, h) / 2) * sz;
  paramShape = null;
  if (S.shape === 'geo' || S.shape === 'solid' || (S.shape === 'live' && (S.shapeLive === 'bars' || S.shapeLive === 'ring'))) {
    buildParamShape();
    return;
  }
  const pat = S.shape === 'pattern' ? S.shapePattern : S.shape;
  if (S.shape === 'pattern' && fillPattern(pat, n, w, h, sz, hx, hy, { scale: S.patScale, form: S.patForm, vary: S.patVary, seed: S.patSeed })) return;
  if (pat === 'grid' || pat === 'sunflower' || pat === 'ring') {
    const cols = Math.max(1, Math.round(Math.sqrt((n * w) / h)));
    const rows = Math.max(1, Math.ceil(n / cols));
    for (let i = 0; i < n; i++) {
      if (pat === 'grid') {
        const gw = w * sz;
        const gh = h * sz;
        hx[i] = cx - gw / 2 + ((i % cols) + 0.5) * (gw / cols);
        hy[i] = cy - gh / 2 + (Math.floor(i / cols) + 0.5) * (gh / rows);
      } else if (pat === 'sunflower') {
        // Golden-angle spiral: an even, organic-looking disc.
        const r = R * Math.sqrt((i + 0.5) / n);
        const a = i * 2.39996;
        hx[i] = cx + Math.cos(a) * r;
        hy[i] = cy + Math.sin(a) * r;
      } else {
        const a = (i / n) * Math.PI * 2;
        const r = R * (0.97 + Math.random() * 0.06);
        hx[i] = cx + Math.cos(a) * r;
        hy[i] = cy + Math.sin(a) * r;
      }
    }
    return;
  }
  const tShape = performance.now();
  const pts = sampleTargets((g, W, H) => {
    const word = (text: string) => {
      text = text.trim() || ' ';
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let size = H * 0.5;
      g.font = `800 ${size}px system-ui, sans-serif`;
      const tw = g.measureText(text).width;
      size *= Math.min(1, (W * sz) / Math.max(1, tw));
      size = Math.min(size, H * 0.7 * sz + 4);
      g.font = `800 ${size}px system-ui, sans-serif`;
      g.fillText(text, W / 2, H / 2);
      return true;
    };
    const icon = (id: string) => drawIcon(g, id, W / 2, H / 2, (Math.min(W, H) / 2) * sz * 0.92);
    if (S.shape === 'text') return word(S.shapeText);
    if (S.shape === 'icon') return icon(S.shapeIcon);
    if (S.shape === 'sequence') {
      const tok = seqToken();
      return isIcon(tok.toLowerCase()) ? icon(tok.toLowerCase()) : word(tok);
    }
    if (S.shape === 'live') return word(S.shapeLive === 'clock' ? clockText() : tempoText());
    if (S.shape === 'drawing') {
      if (!drawStrokes.length) return false;
      g.strokeStyle = '#fff';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = Math.max(4, Math.min(W, H) * 0.028);
      for (const st of drawStrokes) {
        g.beginPath();
        for (let k = 0; k < st.length; k += 2) {
          const x = st[k] * W;
          const y = st[k + 1] * H;
          if (k) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        if (st.length === 2) g.lineTo(st[0] * W + 0.1, st[1] * H);
        g.stroke();
      }
      return true;
    }
    return false;
  });
  if (S.shape === 'image' || S.shape === 'camera') pts.push(...sampleImage());
  if (!pts.length) {
    for (let i = 0; i < n; i++) {
      hx[i] = px[i];
      hy[i] = py[i];
    }
    return;
  }
  // Shuffle so the targets cover the shape evenly whatever the count.
  for (let k = pts.length - 1; k > 0; k--) {
    const j = (Math.random() * (k + 1)) | 0;
    [pts[k], pts[j]] = [pts[j], pts[k]];
  }
  // Then give each target to a nearby particle, so a new word grows out of
  // the old one instead of everything swapping places.
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i % pts.length];
    tx[i] = x + (Math.random() - 0.5) * 2;
    ty[i] = y + (Math.random() - 0.5) * 2;
  }
  const owner = matchNearest(tx, ty);
  shapeInfo = { targets: pts.length, ms: performance.now() - tShape };
  for (let t = 0; t < n; t++) {
    hx[owner[t]] = tx[t];
    hy[owner[t]] = ty[t];
  }
}

// --- entrance ------------------------------------------------------------------
// How a shape forms when the page opens (or on Play entrance): every particle
// starts somewhere tidy and its spot glides from there to the shape, some
// later than others, so the word builds up instead of swarming in.
let entrance: { start: number; dur: number } | null = null;
function playEntrance() {
  const S = settings;
  if (S.shape === 'none' || S.emitter !== 'none' || S.entrance === 'scatter') return;
  if ((S.shape === 'image' && !shapeImage) || S.shape === 'camera') return;
  buildShape();
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.hypot(cx, cy);
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  const dl = new Float32Array(n);
  const rand01 = Math.random;
  placeFrame();
  for (let i = 0; i < n; i++) {
    const [tx, ty] = place.on ? placed(hx[i], hy[i]) : [hx[i], hy[i]];
    let x = tx;
    let y = ty;
    let d = 0;
    switch (S.entrance) {
      case 'formed':
        x = tx + (rand01() - 0.5) * 6;
        y = ty + (rand01() - 0.5) * 6;
        break;
      case 'drift':
        x = rand01() * w;
        y = rand01() * h;
        d = rand01() * 0.35;
        break;
      case 'centre': {
        const a = rand01() * Math.PI * 2;
        const r = rand01() * 14;
        x = cx + Math.cos(a) * r;
        y = cy + Math.sin(a) * r;
        d = (Math.hypot(tx - cx, ty - cy) / R) * 0.6;
        break;
      }
      case 'sweep':
        x = rand01() * 8;
        y = ty + (rand01() - 0.5) * 40;
        d = (tx / w) * 0.7;
        break;
      case 'rain':
        x = tx + (rand01() - 0.5) * 20;
        y = rand01() * 8;
        d = (1 - ty / h) * 0.45 + rand01() * 0.2;
        break;
      case 'edges': {
        const m = Math.min(tx, w - tx, ty, h - ty);
        if (m === tx) x = 1;
        else if (m === w - tx) x = w - 1;
        else if (m === ty) y = 1;
        else y = h - 1;
        d = rand01() * 0.4;
        break;
      }
    }
    sx[i] = px[i] = ox[i] = Math.min(w - 1, Math.max(0, x));
    sy[i] = py[i] = oy[i] = Math.min(h - 1, Math.max(0, y));
    vx[i] = vy[i] = 0;
    dl[i] = d;
  }
  const now = performance.now();
  if (S.entrance === 'formed') {
    homeGlide = null;
    entrance = { start: now, dur: 0 };
    return;
  }
  const dur = S.entranceTime * 1000;
  homeGlide = { fx: sx, fy: sy, tx: hx.slice(0, n), ty: hy.slice(0, n), start: now, dur, dl };
  entrance = { start: now, dur };
}

// Pairs each particle with a target spot so the total travel is small:
// every particle (in random order) takes the closest free spot, then a few
// rounds of swaps between neighbours undo the worst greedy choices.
// Returns owner[target] = particle.
function matchNearest(tx: Float32Array, ty: Float32Array): Int32Array {
  const m = tx.length;
  const cell = Math.max(4, Math.sqrt((w * h) / Math.max(1, m)) * 1.5);
  const gw = Math.ceil(w / cell) + 1;
  const gh = Math.ceil(h / cell) + 1;
  const cellOf = (x: number, y: number) => Math.min(gh - 1, Math.max(0, (y / cell) | 0)) * gw + Math.min(gw - 1, Math.max(0, (x / cell) | 0));
  // Targets bucketed by cell (counting sort).
  const start = new Int32Array(gw * gh + 1);
  const tc = new Int32Array(m);
  for (let t = 0; t < m; t++) start[(tc[t] = cellOf(tx[t], ty[t])) + 1]++;
  for (let c = 0; c < gw * gh; c++) start[c + 1] += start[c];
  const items = new Int32Array(m);
  const fill = start.slice(0, gw * gh);
  for (let t = 0; t < m; t++) items[fill[tc[t]]++] = t;
  const free = new Int32Array(gw * gh);
  for (let c = 0; c < gw * gh; c++) free[c] = start[c + 1] - start[c];
  const taken = new Uint8Array(m);
  const owner = new Int32Array(m);
  const mine = new Int32Array(m); // particle → target

  const order = Array.from({ length: m }, (_, i) => i);
  for (let k = m - 1; k > 0; k--) {
    const j = (Math.random() * (k + 1)) | 0;
    [order[k], order[j]] = [order[j], order[k]];
  }
  for (const i of order) {
    const x = px[i];
    const y = py[i];
    const cx = Math.min(gw - 1, Math.max(0, (x / cell) | 0));
    const cy = Math.min(gh - 1, Math.max(0, (y / cell) | 0));
    let best = -1;
    let bestD = Infinity;
    let foundAt = -1;
    for (let r = 0; r < Math.max(gw, gh); r++) {
      // A spot found at ring r could still lose to one in ring r + 1.
      if (foundAt >= 0 && r > foundAt + 1) break;
      for (let gy = cy - r; gy <= cy + r; gy++) {
        if (gy < 0 || gy >= gh) continue;
        const edge = gy === cy - r || gy === cy + r;
        for (let gx = cx - r; gx <= cx + r; gx += edge ? 1 : 2 * r || 1) {
          if (gx < 0 || gx >= gw) continue;
          const c = gy * gw + gx;
          if (!free[c]) continue;
          for (let q = start[c]; q < start[c + 1]; q++) {
            const t = items[q];
            if (taken[t]) continue;
            const d = (tx[t] - x) ** 2 + (ty[t] - y) ** 2;
            if (d < bestD) {
              bestD = d;
              best = t;
            }
          }
        }
      }
      if (best >= 0 && foundAt < 0) foundAt = r;
    }
    taken[best] = 1;
    free[tc[best]]--;
    owner[best] = i;
    mine[i] = best;
  }

  // Swap pass: for each particle, try trading spots with the owners of
  // the spots around it when that shortens their combined (squared) travel.
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < m; i++) {
      const x = px[i];
      const y = py[i];
      const cx = Math.min(gw - 1, Math.max(0, (x / cell) | 0));
      const cy = Math.min(gh - 1, Math.max(0, (y / cell) | 0));
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(gh - 1, cy + 1); gy++) {
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(gw - 1, cx + 1); gx++) {
          const c = gy * gw + gx;
          for (let q = start[c]; q < start[c + 1]; q++) {
            const t = items[q];
            const j = owner[t];
            if (j === i) continue;
            const a = mine[i];
            const now = (tx[a] - x) ** 2 + (ty[a] - y) ** 2 + (tx[t] - px[j]) ** 2 + (ty[t] - py[j]) ** 2;
            const swapped = (tx[t] - x) ** 2 + (ty[t] - y) ** 2 + (tx[a] - px[j]) ** 2 + (ty[a] - py[j]) ** 2;
            if (swapped < now) {
              owner[t] = i;
              owner[a] = j;
              mine[i] = t;
              mine[j] = a;
            }
          }
        }
      }
    }
  }
  return owner;
}

// --- emitter -------------------------------------------------------------------

let emitAcc = 0;
let burstClock = 0;
let emitNext = 0;

// Put particle i on the emitter shape and give it a starting velocity.
function emitOne(i: number) {
  const S = settings;
  const ex = S.emitX * w;
  const ey = S.emitY * h;
  const R = S.emitSize;
  let x = ex;
  let y = ey;
  let nx = 0; // outward direction
  let ny = 0;
  const a = Math.random() * Math.PI * 2;
  switch (S.emitter) {
    case 'point':
      nx = Math.cos(a);
      ny = Math.sin(a);
      x += nx * 2;
      y += ny * 2;
      break;
    case 'pointer': {
      const on = pointer.x > -1e3;
      x = on ? pointer.x : w / 2;
      y = on ? pointer.y : h / 2;
      nx = Math.cos(a);
      ny = Math.sin(a);
      break;
    }
    case 'line': {
      const la = (S.emitAngle / 180) * Math.PI;
      const u = (Math.random() - 0.5) * 2 * R;
      x += Math.cos(la) * u;
      y += Math.sin(la) * u;
      const side = Math.random() < 0.5 ? -1 : 1;
      nx = -Math.sin(la) * side;
      ny = Math.cos(la) * side;
      break;
    }
    case 'circle':
    case 'ring': {
      const rr = S.emitter === 'ring' ? R : R * Math.sqrt(Math.random());
      nx = Math.cos(a);
      ny = Math.sin(a);
      x += nx * rr;
      y += ny * rr;
      break;
    }
    case 'edges': {
      const side = (Math.random() * 4) | 0;
      x = side === 0 ? 0 : side === 1 ? w - 0.5 : Math.random() * w;
      y = side === 2 ? 0 : side === 3 ? h - 0.5 : Math.random() * h;
      nx = side === 0 ? 1 : side === 1 ? -1 : 0;
      ny = side === 2 ? 1 : side === 3 ? -1 : 0;
      break;
    }
  }
  px[i] = ox[i] = x;
  py[i] = oy[i] = y;
  dead[i] = 0;
  rebirth(i);
  age[i] = FADE_IN * 0.7; // born visible
  launch(i);
  if (S.emitOut) {
    const sp = (S.launchSpeed > 0 ? S.launchSpeed : 1.5) * (0.6 + Math.random() * 0.8);
    const spread = (Math.min(S.launchSpread, 180) / 360) * Math.PI * 2 * (Math.random() - 0.5);
    const c = Math.cos(spread);
    const sn = Math.sin(spread);
    vx[i] = (nx * c - ny * sn) * sp;
    vy[i] = (nx * sn + ny * c) * sp;
  }
}

function emitMany(k: number) {
  if (n === 0) return;
  // Prefer particles waiting to be born, then the oldest by turn.
  for (let j = 0; j < k; j++) {
    let i = -1;
    for (let tries = 0; tries < n; tries++) {
      const c = emitNext++ % n;
      if (dead[c]) {
        i = c;
        break;
      }
      if (tries > 64) {
        i = c;
        break;
      }
    }
    if (i < 0) i = emitNext++ % n;
    emitOne(i);
  }
}

function runEmitter(dt: number, beat: boolean) {
  const S = settings;
  if (S.emitter === 'none') return;
  if (S.emitMode === 'steady') {
    emitAcc += n * S.emitRate * macro.emit * (dt / 60);
    const k = Math.floor(emitAcc);
    emitAcc -= k;
    emitMany(k);
  } else if (S.emitMode === 'burst') {
    burstClock += dt / 60;
    if (burstClock >= S.burstEvery) {
      burstClock = 0;
      emitMany(Math.round(n * S.burstSize));
    }
  } else if (beat) emitMany(Math.round(n * S.burstSize));
}

// Switching the emitter on empties the screen so it fills from the emitter;
// switching it off scatters everyone back.
function emitterChanged() {
  if (settings.emitter !== 'none') for (let i = 0; i < n; i++) dead[i] = 1;
  else for (let i = 0; i < n; i++) if (dead[i]) spawn(i, Math.random() * w, Math.random() * h), (dead[i] = 0);
  burstClock = settings.burstEvery; // first burst right away
}

function enterFromEdge(i: number) {
  for (let tries = 0; tries < 12; tries++) {
    const side = (Math.random() * 4) | 0;
    const x = side === 0 ? 0.5 : side === 1 ? w - 0.5 : Math.random() * w;
    const y = side === 2 ? 0.5 : side === 3 ? h - 0.5 : Math.random() * h;
    flowVec(x, y);
    const m = Math.hypot(fvx, fvy) || 1;
    const c = fvx / m;
    const sn = fvy / m;
    const inward = side === 0 ? c : side === 1 ? -c : side === 2 ? sn : -sn;
    if (inward < 0.3) continue;
    px[i] = ox[i] = x;
    py[i] = oy[i] = y;
    vx[i] = c * 0.5;
    vy[i] = sn * 0.5;
    // Already at the edge, so it can show at once (only a short fade).
    rebirth(i);
    age[i] = FADE_IN * 0.6;
    return;
  }
  // No inward current found: fall back to a random spot and fade in.
  px[i] = ox[i] = Math.random() * w;
  py[i] = oy[i] = Math.random() * h;
  rebirth(i);
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
    rebirth(i);
    dead[i] = 0;
    age[i] = FADE_IN; // a fountain shows at once
  }
}

// --- rendering ---------------------------------------------------------------

// Pre-built colour lookup: 64 steps along the palette, as CSS strings.
const SHADES = 64;
let shades: string[] = [];

let shadeRgb: Rgb[] = [];

function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n2: number) => (n2 + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n2: number) => l - a * Math.max(-1, Math.min(k(n2) - 3, Math.min(9 - k(n2), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function buildShades() {
  spriteCache.clear();
  scaledCache.clear();
  const stops = pal().stops;
  if (settings.colorBy === 'camera' && camShades) {
    shadeRgb = camShades.map((c) => c.map((v) => Math.min(255, v)) as Rgb);
    shades = shadeRgb.map(([r, g, b]) => `rgb(${r.toFixed(0)} ${g.toFixed(0)} ${b.toFixed(0)})`);
    return;
  }
  const target: Rgb[] = [];
  for (let k = 0; k < SHADES; k++) {
    const u = (k / (SHADES - 1)) * (stops.length - 1);
    const a = stops[Math.floor(u)];
    const b = stops[Math.min(stops.length - 1, Math.floor(u) + 1)];
    const f = u - Math.floor(u);
    const mix = (i: number) => a[i] + (b[i] - a[i]) * f;
    target.push(hslToRgb(mix(0), mix(1), mix(2)));
  }
  // While crossfading, blend from the old palette's colours.
  const u = palMix ? (palMix.fixed ?? Math.min(1, (performance.now() - palMix.start) / palMix.dur)) : 1;
  shadeRgb = target.map((c, k) => (palMix && palMix.from[k] ? (c.map((v, i) => palMix!.from[k][i] + (v - palMix!.from[k][i]) * u) as Rgb) : c));
  shades = shadeRgb.map(([r, g, b]) => `rgb(${r.toFixed(0)} ${g.toFixed(0)} ${b.toFixed(0)})`);
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
    case 'depth':
      u = pz[i];
      break;
    case 'age':
      // Young particles at the calm end, old ones at the hot end.
      u = span[i] > 0 ? Math.min(1, age[i] / span[i]) : tone[i];
      break;
    case 'band': {
      // Bass at the calm end, highs at the hot end; each brightens with its band.
      const L = audio.levels;
      const b = i % 3;
      u = (b === 0 ? 0.08 + L.bass * 0.2 : b === 1 ? 0.4 + L.mid * 0.2 : 0.72 + L.treble * 0.25) + tone[i] * 0.06;
      break;
    }
    case 'face': {
      // Each face feature its own colour; a second face shifted along.
      const g = i < partGroup.length && isCam() && faceMode() && !free[i] ? partGroup[i] : -1;
      if (g < 0) { u = tone[i]; break; }
      u = (g + 0.5) / FACE_GROUPS;
      if (cam.faces.length > 1 && i % cam.faces.length === 1) u = (u + 0.5) % 1;
      break;
    }
    case 'camera':
      u = cam.on ? camShade(i) : tone[i];
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
  if (!reacting()) return 1;
  const L = audio.levels;
  const S = settings;
  let b = 1;
  if (S.audioKick === 'pulse' || S.audioKick === 'both') b += L.pulse * 0.7 * S.audioPulse * S.audioIntensity;
  if (S.audioKick === 'pump') b *= 1 - Math.min(0.5, L.pulse * 0.35 * S.audioPulse * S.audioIntensity);
  if (S.audioSnare === 'flash') b += L.snareEnv * 1.5 * S.audioHits * S.audioIntensity;
  if (S.audioSub === 'size') b += L.sub * L.sub * 1.2 * S.audioSubAmt * S.audioIntensity;
  return b;
}

// --- sprites -----------------------------------------------------------------

type SpriteStyle = 'circles' | 'glow' | 'bokeh' | 'rings' | 'sparkles' | 'neon' | 'flare' | 'ink' | 'bubbles' | 'stars';
// scale: drawn size relative to the Size setting; alpha: overall opacity.
const SPRITES: Record<SpriteStyle, { scale: number; alpha: number }> = {
  circles: { scale: 1.4, alpha: 1 },
  glow: { scale: 6, alpha: 1 },
  bokeh: { scale: 10, alpha: 0.35 },
  rings: { scale: 4, alpha: 0.9 },
  sparkles: { scale: 6, alpha: 1 },
  neon: { scale: 7, alpha: 1 },
  flare: { scale: 9, alpha: 1 },
  ink: { scale: 13, alpha: 0.22 },
  bubbles: { scale: 5, alpha: 1 },
  stars: { scale: 3.2, alpha: 1 },
};
// Styles that twinkle or flicker per particle (sized one by one).
const FLICKER = new Set(['stars', 'flare']);
const SPRITE_PX = 48;
const spriteCache = new Map<string, HTMLCanvasElement>();

const scaledCache = new Map<string, { c: HTMLCanvasElement; d: number }>();
function scaledSprite(img: HTMLCanvasElement, key: string, d0: number) {
  const d = Math.max(1, Math.round(d0 * dpr));
  const full = `${key}:${d}`;
  let e = scaledCache.get(full);
  if (!e) {
    if (scaledCache.size > 600) scaledCache.clear();
    const c = document.createElement('canvas');
    c.width = c.height = d;
    c.getContext('2d')!.drawImage(img, 0, 0, d, d);
    e = { c, d };
    scaledCache.set(full, e);
  }
  return e;
}

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
  } else if (style === 'neon') {
    // A white-hot core in a tube of colour, then a wide soft halo.
    const grad = g.createRadialGradient(m, m, 0, m, m, m);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.07, '#fff');
    grad.addColorStop(0.14, col);
    grad.addColorStop(0.22, withAlpha(col, 0.55));
    grad.addColorStop(0.5, withAlpha(col, 0.12));
    grad.addColorStop(1, withAlpha(col, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  } else if (style === 'flare') {
    // A glow with a thin cross, like a lens catching a bright light.
    const grad = g.createRadialGradient(m, m, 0, m, m, m * 0.45);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.25, col);
    grad.addColorStop(1, withAlpha(col, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
    for (const [w, h] of [[m * 2, 1.4], [1.4, m * 2]]) {
      const lg = w > h ? g.createLinearGradient(0, m, SPRITE_PX, m) : g.createLinearGradient(m, 0, m, SPRITE_PX);
      lg.addColorStop(0, withAlpha(col, 0));
      lg.addColorStop(0.5, '#fff');
      lg.addColorStop(1, withAlpha(col, 0));
      g.fillStyle = lg;
      g.fillRect(m - w / 2, m - h / 2, w, h);
    }
  } else if (style === 'ink') {
    // A soft wash with no edge: overlapping ones blend like watercolour.
    const grad = g.createRadialGradient(m, m, 0, m, m, m);
    grad.addColorStop(0, withAlpha(col, 0.9));
    grad.addColorStop(0.55, withAlpha(col, 0.45));
    grad.addColorStop(1, withAlpha(col, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  } else if (style === 'bubbles') {
    // See-through: a faint fill, a rim and a small highlight.
    g.fillStyle = withAlpha(col, 0.1);
    g.beginPath();
    g.arc(m, m, m * 0.9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = withAlpha(col, 0.85);
    g.lineWidth = SPRITE_PX * 0.04;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(m - m * 0.35, m - m * 0.4, m * 0.16, m * 0.09, -0.7, 0, Math.PI * 2);
    g.fill();
  } else if (style === 'stars') {
    // A five-point star.
    g.fillStyle = col;
    g.beginPath();
    for (let p = 0; p < 10; p++) {
      const a = (p * Math.PI) / 5 - Math.PI / 2;
      const r = p % 2 ? m * 0.42 : m * 0.98;
      g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
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

// Glyph sizes snap to steps of 1.25×: text drawn at an endless variety of
// sizes (3D depth, size variety) can't use the browser's glyph cache and
// was several times slower.
const GLYPH_STEP = Math.log(1.25);
const glyphLevel = (z: number) => Math.max(-8, Math.min(8, Math.round(Math.log(z) / GLYPH_STEP)));
const glyphGroups: number[][] = Array.from({ length: 17 }, () => []);

function drawGlyphs(list: number[], k: number, s: number) {
  const size = Math.max(6, s * 5 * settings.glyphScale);
  const f = FONTS[settings.glyphFont];
  const font = (px: number) => (f.includes('{px}') ? f.replace('{px}', `${px.toFixed(1)}px`) : `${px.toFixed(1)}px ${f}`);
  ctx.font = font(size);
  ctx.fillStyle = shades[k];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rot = settings.glyphRotate;
  if (rot === 'none' && uniformSize) {
    for (const i of list) ctx.fillText(glyphFor(i), px[i], py[i]);
    return;
  }
  if (rot === 'none') {
    for (const g of glyphGroups) g.length = 0;
    for (const i of list) glyphGroups[glyphLevel(psz[i]) + 8].push(i);
    glyphGroups.forEach((g, lv) => {
      if (!g.length) return;
      ctx.font = font(size * Math.exp((lv - 8) * GLYPH_STEP));
      for (const i of g) ctx.fillText(glyphFor(i), px[i], py[i]);
    });
    return;
  }
  for (const i of list) {
    const a = rot === 'heading' ? Math.atan2(vy[i], vx[i]) : t * (1 + tone[i] * 2) * (tone[i] < 0.5 ? -1 : 1) + gl[i] * 6.28;
    const z = uniformSize ? 1 : Math.exp(glyphLevel(psz[i]) * GLYPH_STEP);
    const c = Math.cos(a) * z;
    const sn = Math.sin(a) * z;
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
    const d0 = s * sprite.scale;
    ctx.globalAlpha = sprite.alpha;
    if (FLICKER.has(style)) {
      // Twinkle: each one swells and dims on its own rhythm.
      for (const i of list) {
        const tw = 0.55 + 0.45 * Math.sin(t * (2 + rnd[i] * 4) + gl[i] * 6.28);
        const d = d0 * (uniformSize ? 1 : psz[i]) * (0.6 + 0.5 * tw);
        ctx.drawImage(img, px[i] - d / 2, py[i] - d / 2, d, d);
      }
    } else if (style === 'bubbles' && settings.lifespan > 0) {
      // Bubbles grow a little with age and pop (vanish) at the end.
      for (const i of list) {
        const lt = span[i] > 0 ? Math.min(1, age[i] / span[i]) : 0.5;
        if (lt > 0.97) continue;
        const d = d0 * (uniformSize ? 1 : psz[i]) * (0.7 + 0.5 * lt);
        ctx.drawImage(img, px[i] - d / 2, py[i] - d / 2, d, d);
      }
    } else if (uniformSize) {
      // Same size for all: stamp a copy pre-scaled to the exact device size,
      // so the browser copies pixels 1:1 instead of resampling each stamp.
      const pre = scaledSprite(img, `${style}:${k}`, d0);
      const hd = pre.d / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const i of list) ctx.drawImage(pre.c, ((px[i] * dpr) | 0) - hd, ((py[i] * dpr) | 0) - hd);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    else
      for (const i of list) {
        const d = d0 * psz[i];
        ctx.drawImage(img, px[i] - d / 2, py[i] - d / 2, d, d);
      }
    ctx.globalAlpha = 1;
  } else if (style === 'arrows') {
    // Small triangles pointing where each particle is heading.
    ctx.fillStyle = shades[k];
    ctx.beginPath();
    for (const i of list) {
      const L = s * 2.2 * (uniformSize ? 1 : psz[i]);
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
    for (const i of list) {
      const d = s * 3 * (uniformSize ? 1 : psz[i]);
      ctx.drawImage(img, px[i] - d / 2, py[i] - d / 2, d, d);
    }
  } else if (style === 'glyphs') {
    drawGlyphs(list, k, s);
  } else if (style === 'ribbons') {
    drawRibbons(list, k, s);
  } else if (style === 'squares' || style === 'crosses' || style === 'shards' || style === 'petals') {
    drawShapes(style, list, k, s);
  } else if (style === 'embers') {
    // Hot white cores that cool to their colour, flickering.
    const img = spriteFor('glow', k);
    for (const i of list) {
      const fl = 0.7 + 0.3 * Math.sin(t * 9 + gl[i] * 40) * Math.sin(t * 3.1 + rnd[i] * 20);
      const d = s * 4.5 * (uniformSize ? 1 : psz[i]) * fl;
      ctx.globalAlpha = 0.55 + 0.45 * fl;
      ctx.drawImage(img, px[i] - d / 2, py[i] - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,240,220,0.9)';
    ctx.beginPath();
    for (const i of list) {
      const lt = span[i] > 0 ? Math.min(1, age[i] / span[i]) : 0.2;
      if (lt > 0.5) continue;
      const r = s * 0.45 * (1 - lt * 2);
      ctx.rect(px[i] - r, py[i] - r, r * 2, r * 2);
    }
    ctx.fill();
  } else if (style === 'hair') {
    // Short fixed-length strands leaning the way each particle moves.
    ctx.strokeStyle = shades[k];
    ctx.lineWidth = Math.max(0.6, s * 0.35);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const i of list) {
      const v = Math.hypot(vx[i], vy[i]) + 1e-6;
      const L = s * 5 * (uniformSize ? 1 : psz[i]);
      const ux = vx[i] / v;
      const uy = vy[i] / v;
      ctx.moveTo(px[i] - ux * L * 0.5, py[i] - uy * L * 0.5);
      ctx.quadraticCurveTo(px[i] + uy * L * 0.15, py[i] - ux * L * 0.15, px[i] + ux * L * 0.5, py[i] + uy * L * 0.5);
    }
    ctx.stroke();
  } else if (style === 'threads' || style === 'lightning') {
    drawPairs(style, list, k, s);
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
    if (uniformSize) for (const i of list) ctx.rect(px[i] - s / 2, py[i] - s / 2, s, s);
    else
      for (const i of list) {
        const d = s * psz[i];
        ctx.rect(px[i] - d / 2, py[i] - d / 2, d, d);
      }
    ctx.fill();
  }
}

// Squares (tumbling confetti), crosses, shards (thin triangles pointing
// where they head) and petals (turning slowly): one path per colour.
function drawShapes(style: string, list: number[], k: number, s: number) {
  ctx.fillStyle = shades[k];
  ctx.beginPath();
  for (const i of list) {
    const z = s * (uniformSize ? 1 : psz[i]);
    const x = px[i];
    const y = py[i];
    if (style === 'squares') {
      const a = t * (1 + rnd[i] * 3) * (gl[i] < 0.5 ? -1 : 1) + gl[i] * 6.28;
      const h = z * 1.3;
      // Tumbling: one side squashes as it turns in 3D.
      const sq = Math.abs(Math.cos(t * (0.8 + rnd[i]) + gl[i] * 9));
      const c = Math.cos(a) * h;
      const sn = Math.sin(a) * h;
      ctx.moveTo(x + c - sn * sq, y + sn + c * sq);
      ctx.lineTo(x - c - sn * sq, y - sn + c * sq);
      ctx.lineTo(x - c + sn * sq, y - sn - c * sq);
      ctx.lineTo(x + c + sn * sq, y + sn - c * sq);
      ctx.closePath();
    } else if (style === 'crosses') {
      const L = z * 1.6;
      const w = Math.max(0.6, z * 0.4);
      ctx.rect(x - L, y - w / 2, L * 2, w);
      ctx.rect(x - w / 2, y - L, w, L * 2);
    } else if (style === 'shards') {
      const v = Math.hypot(vx[i], vy[i]) + 1e-6;
      const ux = vx[i] / v;
      const uy = vy[i] / v;
      const L = z * (2.4 + rnd[i] * 2);
      const W = z * (0.25 + gl[i] * 0.4);
      ctx.moveTo(x + ux * L, y + uy * L);
      ctx.lineTo(x - ux * L * 0.5 - uy * W, y - uy * L * 0.5 + ux * W);
      ctx.lineTo(x - ux * L * 0.8 + uy * W * 0.4, y - uy * L * 0.8 - ux * W * 0.4);
      ctx.closePath();
    } else {
      const a = t * 0.6 * (gl[i] < 0.5 ? -1 : 1) + gl[i] * 6.28;
      const r = z * 1.6;
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.ellipse(x, y, r, r * 0.45, a, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

// Threads and lightning join near neighbours (a grid finds them): threads
// sag softly and snap when stretched, lightning zig-zags and flickers.
const pairCells = new Map<number, number[]>();
// Neighbours come from every colour, so links cross colours. The grid is
// built once per pass (buildPairs) and the reach follows the spacing.
let pairMaxD = 40;
function buildPairs(style: string, bks: number[][], s: number) {
  let n = 0;
  for (const l of bks) n += l.length;
  const spacing = Math.sqrt((w * h) / Math.max(1, n));
  pairMaxD = Math.max(style === 'threads' ? 24 + s * 8 : 36 + s * 10, Math.min(160, spacing * (style === 'threads' ? 1.5 : 1.3)));
  pairCells.clear();
  for (const list of bks)
    for (const i of list) {
      const key = ((px[i] / pairMaxD) | 0) * 4096 + ((py[i] / pairMaxD) | 0);
      const c = pairCells.get(key);
      if (c) c.push(i);
      else pairCells.set(key, [i]);
    }
}
function drawPairs(style: string, list: number[], k: number, s: number) {
  const maxD = pairMaxD;
  const cell = maxD;
  ctx.strokeStyle = shades[k];
  ctx.lineCap = 'round';
  ctx.lineWidth = style === 'threads' ? Math.max(0.5, s * 0.3) : Math.max(0.7, s * 0.45);
  ctx.beginPath();
  const per = style === 'threads' ? 2 : 1;
  for (const i of list) {
    const cx = (px[i] / cell) | 0;
    const cy = (py[i] / cell) | 0;
    let made = 0;
    for (let dx = 0; dx <= 1 && made < per; dx++)
      for (let dy = dx ? -1 : 0; dy <= 1 && made < per; dy++) {
        const c = pairCells.get((cx + dx) * 4096 + cy + dy);
        if (!c) continue;
        for (const j of c) {
          if (j <= i && dx === 0 && dy === 0) continue;
          const ex = px[j] - px[i];
          const ey = py[j] - py[i];
          const d = Math.hypot(ex, ey);
          if (d > maxD || d < 2) continue;
          if (style === 'threads') {
            // Sags more the looser it is.
            const sag = (1 - d / maxD) * d * 0.35;
            ctx.moveTo(px[i], py[i]);
            ctx.quadraticCurveTo(px[i] + ex / 2, py[i] + ey / 2 + sag, px[j], py[j]);
          } else {
            if (Math.random() < 0.45) continue;
            const nx = -ey / d;
            const ny = ex / d;
            ctx.moveTo(px[i], py[i]);
            for (let q = 1; q < 4; q++) {
              const j0 = (Math.random() - 0.5) * d * 0.35;
              ctx.lineTo(px[i] + (ex * q) / 4 + nx * j0, py[i] + (ey * q) / 4 + ny * j0);
            }
            ctx.lineTo(px[j], py[j]);
          }
          if (++made >= per) break;
        }
      }
  }
  if (style === 'lightning') {
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // A bright dot at each particle.
    ctx.fillStyle = shades[k];
    ctx.beginPath();
    for (const i of list) ctx.rect(px[i] - s * 0.4, py[i] - s * 0.4, s * 0.8, s * 0.8);
    ctx.fill();
  } else ctx.stroke();
}

// Halftone (dots on a fixed grid, bigger where more particles are) and big
// pixels (chunky grid-snapped squares, an 8-bit look).
const gridCount = new Map<number, number>();
const gridShade = new Map<number, number>();
// One pass over every colour: each cell is drawn once, in the colour most of
// its particles have (the last one counted wins ties), so dots don't stack.
function drawGrid(style: string, bks: number[][], s: number) {
  let n = 0;
  for (const l of bks) n += l.length;
  const spacing = Math.sqrt((w * h) / Math.max(1, n));
  const cell = style === 'halftone' ? Math.max(6, s * 4, Math.min(28, spacing * 1.4)) : Math.max(4, s * 3.2);
  gridCount.clear();
  gridShade.clear();
  const best = new Map<number, number>();
  for (let k = 0; k < bks.length; k++) {
    const seen = new Map<number, number>();
    for (const i of bks[k]) {
      const key = Math.floor(px[i] / cell) * 8192 + Math.floor(py[i] / cell);
      gridCount.set(key, (gridCount.get(key) ?? 0) + 1);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, c] of seen)
      if (c >= (best.get(key) ?? 0)) {
        best.set(key, c);
        gridShade.set(key, k);
      }
  }
  for (let k = 0; k < bks.length; k++) {
    let any = false;
    for (const [key, c] of gridCount) {
      if (gridShade.get(key) !== k) continue;
      if (!any) {
        ctx.fillStyle = shades[k];
        ctx.beginPath();
        any = true;
      }
      const gx = Math.floor(key / 8192) * cell;
      const gy = (key - Math.floor(key / 8192) * 8192) * cell;
      if (style === 'halftone') {
        const r = Math.min(cell * 0.6, cell * 0.2 * Math.sqrt(c) + cell * 0.08);
        ctx.moveTo(gx + cell / 2 + r, gy + cell / 2);
        ctx.arc(gx + cell / 2, gy + cell / 2, r, 0, Math.PI * 2);
      } else ctx.rect(gx + 0.5, gy + 0.5, cell - 1, cell - 1);
    }
    if (any) ctx.fill();
  }
}

const MIXABLE: [string, string][] = [
  ['dots', 'Pixels'], ['circles', 'Circles'], ['glow', 'Glow'], ['bokeh', 'Bokeh'], ['rings', 'Rings'],
  ['sparkles', 'Sparkles'], ['arrows', 'Arrows'], ['streaks', 'Streaks'], ['comets', 'Comets'], ['ribbons', 'Ribbons'], ['glyphs', 'Glyphs'],
  ['squares', 'Confetti squares'], ['shards', 'Shards'], ['stars', 'Stars'], ['petals', 'Petals'], ['crosses', 'Crosses'], ['neon', 'Neon'], ['flare', 'Lens flare'], ['embers', 'Embers'], ['hair', 'Hair'], ['ink', 'Ink'], ['bubbles', 'Bubbles'],
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

// Per-particle size multipliers. Size variety spreads sizes over roughly
// 0.3×–3× (log scale, so most stay near the base size).
let uniformSize = true;
function updateSizes() {
  const sv = settings.sizeVar;
  const ls = settings.lifespan > 0 ? settings.lifeSize : 'none';
  const dp = settings.depth;
  const bands = reacting() ? settings.audioBands : 0;
  uniformSize = sv <= 0 && ls === 'none' && dp <= 0 && bands <= 0;
  if (uniformSize) return;
  const L = audio.levels;
  // Bass particles are big and swell with the bass, highs small and bright.
  const bandSize = [1 + (0.5 + L.bass * 0.8) * bands, 1 + (L.mid - 0.3) * 0.6 * bands, 1 + (L.treble * 0.8 - 0.45) * bands];
  for (let i = 0; i < n; i++) {
    const u = rnd[i] * 2 - 1;
    let z = sv > 0 ? Math.exp(u * Math.abs(u) * sv * 1.2) : 1;
    if (ls !== 'none' && span[i] > 0) {
      const lt = Math.min(1, age[i] / span[i]);
      z *= ls === 'grow' ? 0.3 + lt * 1.4 : ls === 'shrink' ? 1.7 - lt * 1.4 : 0.3 + Math.sin(Math.PI * lt) * 1.4;
    }
    if (dp > 0) z *= depthK(0.3 + pz[i] * 1.4, dp);
    if (bands > 0) z *= bandSize[i % 3];
    psz[i] = z;
  }
}

const FADE_LEVELS = 6;
const fadeBuckets: number[][][] = Array.from({ length: FADE_LEVELS }, () => Array.from({ length: SHADES }, () => []));

const ribbonMerge: number[] = [];

function drawBuckets(bks: number[][], s: number) {
  if (settings.render === 'mixed') {
    // Each particle keeps one style from the mix, picked by its index.
    const mix = mixStyles();
    const parts: number[][] = mix.map(() => []);
    for (let k = 0; k < SHADES; k++) {
      const list = bks[k];
      if (!list.length) continue;
      for (const p of parts) p.length = 0;
      for (const i of list) parts[(styleHash(i) * mix.length) | 0].push(i);
      mix.forEach((st, m) => parts[m].length && drawStyle(st, parts[m], k, s));
    }
  } else if (settings.render === 'ribbons') {
    // Each ribbon pass is a separate stroke, so merge colour buckets into
    // groups of four to keep the number of strokes down.
    for (let k = 0; k < SHADES; k += 4) {
      const merged = ribbonMerge;
      merged.length = 0;
      for (let q = k; q < k + 4; q++) for (const i of bks[q]) merged.push(i);
      if (merged.length) drawRibbons(merged, k + 2, s);
    }
  } else {
    if (settings.render === 'halftone' || settings.render === 'bigpixels') return drawGrid(settings.render, bks, s);
    if (settings.render === 'threads' || settings.render === 'lightning') buildPairs(settings.render, bks, s);
    for (let k = 0; k < SHADES; k++) if (bks[k].length) drawStyle(settings.render, bks[k], k, s);
  }
}

function drawWellMarkers(light: boolean) {
  const list = wellList();
  if (!list.length) return;
  ctx.strokeStyle = light ? 'rgb(0 0 0 / 0.35)' : 'rgb(255 255 255 / 0.35)';
  ctx.lineWidth = 1.2;
  for (const p of list) {
    const x = p.x * w;
    const y = p.y * h;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    // Attractor: arrows in. Repeller: arrows out. Vortex: a curl.
    if (p.kind === 'vortex') {
      ctx.moveTo(x + 4, y);
      ctx.arc(x, y, 4, 0, Math.PI * 1.5);
    } else {
      const [a, b2] = p.kind === 'attract' ? [3, 7] : [7, 3];
      for (let k = 0; k < 4; k++) {
        const an = (k * Math.PI) / 2 + Math.PI / 4;
        ctx.moveTo(x + Math.cos(an) * b2 * 1.4, y + Math.sin(an) * b2 * 1.4);
        ctx.lineTo(x + Math.cos(an) * a * 1.4, y + Math.sin(an) * a * 1.4);
      }
    }
    ctx.stroke();
  }
}

let camX = 0;
let camY = 0;
let parAmt = 0;
// Music camera: spin angle (applied to positions while drawing), zoom and
// shake (a CSS transform on the canvas, so they cost nothing).
let camA = 0;
let spinX = new Float32Array(0);
let spinY = new Float32Array(0);

// Buffers for the view effects (echo, kaleidoscope).
const echoBuf = document.createElement('canvas');
const echoCtx = echoBuf.getContext('2d')!;
const kBuf = document.createElement('canvas');
const kCtx = kBuf.getContext('2d')!;

// Draw the canvas back onto itself, zoomed and turned about the centre.
function viewWarp(z: number, rot: number, alpha: number) {
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'copy';
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(rot);
  ctx.scale(z, z);
  ctx.drawImage(canvas, -cw / 2, -ch / 2);
  ctx.restore();
}

// Kaleidoscope: one wedge of the view, copied and mirrored round the centre.
// The wedge points along the long side so it has picture all the way out.
function kaleidoscope(seg: number) {
  const cw = canvas.width;
  const ch = canvas.height;
  if (kBuf.width !== cw || kBuf.height !== ch) {
    kBuf.width = cw;
    kBuf.height = ch;
  }
  kCtx.globalCompositeOperation = 'copy';
  kCtx.drawImage(canvas, 0, 0);
  const sl = (Math.PI * 2) / seg;
  const base = (ch > cw ? Math.PI / 2 : 0) - sl / 2 + lm.turn;
  const R = Math.hypot(cw, ch);
  ctx.save();
  ctx.globalCompositeOperation = 'copy';
  for (let k = 1; k < seg; k++) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, cw / 2, ch / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, base + k * sl, base + (k + 1) * sl);
    ctx.closePath();
    ctx.clip();
    if (k % 2 === 0) ctx.rotate(k * sl);
    else {
      ctx.rotate((k + 1) * sl + base);
      ctx.scale(1, -1);
      ctx.rotate(-base);
    }
    ctx.drawImage(kBuf, -cw / 2, -ch / 2);
    ctx.restore();
  }
  ctx.restore();
}

// --- Lens ------------------------------------------------------------------------
// Effects on the finished frame. They draw onto a second canvas shown over
// the real one (which goes invisible but still takes the pointer), so they
// never feed back into the trails: tiles stay tiles instead of compounding.
const lensCanvas = document.createElement('canvas');
lensCanvas.className = 'lens';
lensCanvas.setAttribute('aria-hidden', 'true');
lensCanvas.hidden = true;
canvas.after(lensCanvas);
const lensCtx = lensCanvas.getContext('2d')!;

// --- recording ---------------------------------------------------------------------
// A clip of what's on the field (V, the Actions bar or the Record card).
const recUi: (() => void)[] = [];
const recorder = new Recorder({
  source: () => (lensCanvas.hidden ? canvas : lensCanvas),
  size: () => [w, h],
  screen: () => { const r = Math.min(window.devicePixelRatio || 1, 2); return [w * r, h * r]; },
  filter: () => canvas.style.filter,
  transform: () => canvas.style.transform,
  bg: () => {
    const [r, g, b] = bgNow();
    return `rgb(${r} ${g} ${b})`;
  },
  audio: () => audio.tap() ?? (audio.source === 'feed' ? feedAudioTap() : null),
  overlay: () => (fxCanvas.hidden ? null : fxCanvas),
  onChange: () => recUi.forEach((f) => f()),
});
// The field on a second window (projector), with no menus.
const projectUi: (() => void)[] = [];
const projector = new Projector({
  source: () => (lensCanvas.hidden ? canvas : lensCanvas),
  size: () => [w, h],
  filter: () => canvas.style.filter,
  transform: () => canvas.style.transform,
  bg: () => {
    const [r, g, b] = bgNow();
    return `rgb(${r} ${g} ${b})`;
  },
  overlay: () => (fxCanvas.hidden ? null : fxCanvas),
  key: (e) => window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey })),
  onChange: () => projectUi.forEach((f) => f()),
});
function toggleProject() {
  const was = projector.on;
  projector.toggle();
  if (was) showToast('Projector window closed');
  else if (!projector.on) showToast('The browser blocked the window: allow pop-ups for this page');
  else showToast('Drag the new window to the other display, then click it for fullscreen');
}
// In X-Frame the sound plays in the player next to us; it hands out a copy.
function feedAudioTap(): MediaStreamTrack | null {
  try {
    for (let i = 0; i < parent.frames.length; i++) {
      const f = parent.frames[i] as unknown as { xframeAudioTap?: () => MediaStreamTrack | null };
      if (f !== (window as unknown) && typeof f.xframeAudioTap === 'function') return f.xframeAudioTap();
    }
  } catch {}
  return null;
}
// The dock's Record: first opens the Record view (length, size, sound),
// then starts; while recording it stops. V records straight away.
function dockRecord() {
  if (recorder.on || currentTab === 'record') toggleRecord();
  else showTab('record');
}
function toggleRecord() {
  if (!canRecord()) return showToast('This browser can’t record the canvas');
  const was = recorder.on;
  recorder.toggle();
  if (!was && recorder.on) showToast(recorder.prefs.secs ? `Recording ${recorder.prefs.secs} s` : 'Recording · V stops');
}
const fmtSecs = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// On the field: a pill while recording (tap to stop), then Save / Share.
const recPill = document.createElement('div');
recPill.className = 'rec-pill';
recPill.hidden = true;
document.body.append(recPill);
let recPillText: HTMLElement | null = null;
recUi.push(() => {
  recPill.innerHTML = '';
  recPillText = null;
  recPill.hidden = !recorder.on && !recorder.clip;
  recPill.classList.toggle('live', recorder.on);
  const btn = (text: string, fn: () => void, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    recPill.append(b);
    return b;
  };
  if (recorder.on) {
    const b = btn('', () => recorder.stop(), 'stop');
    b.title = 'Stop recording (V)';
    b.innerHTML = '<i></i><span></span>';
    recPillText = b.querySelector('span');
    recTime();
  } else if (recorder.clip) {
    const t = document.createElement('span');
    t.textContent = `Clip ready · ${Math.round(recorder.clip.secs)} s`;
    recPill.append(t);
    btn('Save', () => recorder.save(), 'main');
    if (recorder.canShare()) btn('Share', () => void recorder.share());
    btn('✕', () => recorder.discard(), 'x').setAttribute('aria-label', 'Discard the clip');
  }
});
function recTime() {
  if (recPillText) recPillText.textContent = `REC ${fmtSecs(recorder.elapsed)}${recorder.prefs.secs ? ' / ' + fmtSecs(recorder.prefs.secs) : ''}`;
}
const lensBuf = document.createElement('canvas');
const lensBufCtx = lensBuf.getContext('2d')!;
const splitBuf = document.createElement('canvas');
const splitCtx = splitBuf.getContext('2d')!;
const dotsSmall = document.createElement('canvas');
const dotsSmallCtx = dotsSmall.getContext('2d')!;
const dotsMasks = new Map<string, CanvasPattern>();
let lensJolt = 0; // colour split kick, 1 → 0
// Lenses moving with the music ("Moves with the music" on the Lens card).
const lm = { t: 0, kick: 0, zoom: 0, turn: 0, turnDir: 1, tilesStep: 0, mirrorStep: 0, bars: 0, sidesUntil: 0,
  twirl: 0, wave: 0, fan: 0, burst: 0, glow: 0, ripples: [] as number[], nextRipple: 0 };
const MIRROR_CYCLE = ['lr', 'tb', 'quad'] as const;
// Runs every frame before the kaleidoscope and the lens are drawn.
function lensMusicTick(now: number) {
  const S = settings;
  const L = audio.levels;
  const music = reacting();
  const m = music ? S.lensMusic : 0;
  const dt = lm.t ? Math.min(0.1, (now - lm.t) / 1000) : 0;
  lm.t = now;
  lm.kick = music && L.beat ? 1 : lm.kick * 0.85;
  lensJolt = lm.kick;
  // Infinite zoom: its own drift, surging forward on kicks and in a drop.
  lm.zoom = (lm.zoom + dt * (S.lensZoom * 0.35 + m * (lm.kick * 1.4 + L.dropEnv * 1.5) * (S.lensZoom > 0 ? 1 : 0))) % 1;
  // Kaleidoscope: turns with the bass, kicked along by the kick; a drop
  // reverses it and adds two sides for two bars.
  lm.turn += dt * m * lm.turnDir * (L.bass * 0.5 + lm.kick * 1.2);
  if (m > 0 && L.drop) {
    lm.turnDir = -lm.turnDir;
    lm.sidesUntil = now + (480 / (L.bpm || 120)) * 1000;
    lm.mirrorStep++;
  }
  // The newer lenses: twirl spin, wave and fan phase, shatter burst, glow.
  lm.twirl += dt * (0.25 + m * (L.bass * 1.5 + lm.kick * 2.5));
  lm.wave += dt * (1.2 + m * (L.bass * 3 + lm.kick * 4));
  lm.fan += dt * (0.8 + m * (L.bass * 2 + lm.kick * 3));
  lm.burst = m > 0 && L.drop ? 1 : m > 0 && L.beat ? Math.max(lm.burst, 0.25 * m) : lm.burst * 0.94;
  lm.glow = music ? lm.glow * 0.9 + (L.level * m + lm.kick * m * 0.5) * 0.1 : 0;
  // Ripples: one per kick with music, a steady one otherwise.
  if (S.lensRipple > 0 && ((m > 0 && L.beat) || (!m && now > lm.nextRipple))) {
    lm.ripples.push(now);
    lm.nextRipple = now + 1400;
  }
  lm.ripples = lm.ripples.filter((t0) => now - t0 < 2600);
  // Tiles: step through counts every few bars.
  if (m > 0 && L.bar && ++lm.bars % (m > 0.6 ? 2 : 4) === 0) lm.tilesStep++;
  if (m === 0) lm.tilesStep = lm.mirrorStep = 0;
}
const tilesNow = () => (settings.lensTiles < 2 ? 0 : Math.round(settings.lensTiles) + [0, 1, 2, 1][lm.tilesStep % 4]);
function mirrorNow() {
  const base = settings.lensMirror;
  if (base === 'off' || !lm.mirrorStep) return base;
  return MIRROR_CYCLE[(MIRROR_CYCLE.indexOf(base) + lm.mirrorStep) % 3];
}
let glitchBands: { y: number; h: number; dx: number; until: number }[] = [];
let glitchNext = 0;
const lensOn = () => {
  const S = settings;
  return S.lensMirror !== 'off' || S.lensTiles >= 2 || S.lensZoom > 0 || S.lensSplit > 0 || S.lensGlitch > 0 || S.lensDots > 0 || S.lensTwirl > 0 || S.lensWave > 0 || S.lensRipple > 0 || S.lensFan > 0 || S.lensShatter > 0 || S.lensSlices > 0 || S.lensEcho > 0 || S.lensGlow > 0 || S.lensCrt > 0;
};


// Draw src into g with a transform about the centre, clipped by a path.
function lensClipDraw(g: CanvasRenderingContext2D, src: HTMLCanvasElement, clip: (g: CanvasRenderingContext2D) => void, rot: number, sc: number) {
  const cw = src.width;
  const ch = src.height;
  g.save();
  g.beginPath();
  clip(g);
  g.clip();
  g.translate(cw / 2, ch / 2);
  g.rotate(rot);
  g.scale(sc, sc);
  g.drawImage(src, -cw / 2, -ch / 2);
  g.restore();
}
// Slices: a short history of frames at half size.
const sliceHist: HTMLCanvasElement[] = [];
let sliceAt = 0;
const SLICE_FRAMES = 24;
let sliceTick = 0;
let shards: { dx: number; dy: number; r: number }[] = [];
let crtPat: { dpr: number; pat: CanvasPattern } | null = null;
const glowBuf = document.createElement('canvas');
const glowCtx = glowBuf.getContext('2d')!;
function lensFrame(now: number) {
  const on = lensOn();
  if (lensCanvas.hidden === on) {
    lensCanvas.hidden = !on;
    canvas.style.opacity = on ? '0' : '';
  }
  if (!on) return;
  const S = settings;
  const cw = canvas.width;
  const ch = canvas.height;
  for (const c of [lensCanvas, lensBuf]) if (c.width !== cw || c.height !== ch) (c.width = cw), (c.height = ch);
  if (lensCanvas.style.filter !== canvas.style.filter) lensCanvas.style.filter = canvas.style.filter;
  if (lensCanvas.style.transform !== canvas.style.transform) lensCanvas.style.transform = canvas.style.transform;
  const g = lensCtx;
  const [br, bg, bb] = bgNow();
  const bgCol = `rgb(${br} ${bg} ${bb})`;
  const L = audio.levels;
  const music = reacting();
  // Each step reads the frame so far and redraws all of lensCanvas.
  let first = true;
  const input = (): HTMLCanvasElement => {
    if (first) {
      first = false;
      return canvas;
    }
    lensBufCtx.globalCompositeOperation = 'copy';
    lensBufCtx.drawImage(lensCanvas, 0, 0);
    return lensBuf;
  };
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.filter = 'none';

  // Mirror: one half (or quarter) reflected onto the rest.
  const mirror = mirrorNow();
  if (mirror !== 'off') {
    const src = input();
    const hx = mirror !== 'tb';
    const hy = mirror !== 'lr';
    const qw = hx ? cw / 2 : cw;
    const qh = hy ? ch / 2 : ch;
    g.globalCompositeOperation = 'copy';
    g.drawImage(src, 0, 0, qw, qh, 0, 0, qw, qh);
    g.globalCompositeOperation = 'source-over';
    for (const [fx, fy] of [[1, 0], [0, 1], [1, 1]] as const) {
      if ((fx && !hx) || (fy && !hy)) continue;
      g.save();
      g.translate(fx ? cw : 0, fy ? ch : 0);
      g.scale(fx ? -1 : 1, fy ? -1 : 1);
      g.drawImage(src, 0, 0, qw, qh, 0, 0, qw, qh);
      g.restore();
    }
  }

  // Tiles: the frame shrunk into an n × n grid, every other tile mirrored.
  if (S.lensTiles >= 2) {
    const src = input();
    const k = tilesNow();
    const tw = cw / k;
    const th = ch / k;
    g.globalCompositeOperation = 'copy';
    g.fillStyle = bgCol;
    g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'source-over';
    for (let yy = 0; yy < k; yy++)
      for (let xx = 0; xx < k; xx++) {
        g.save();
        g.translate(xx * tw + (xx % 2 ? tw : 0), yy * th + (yy % 2 ? th : 0));
        g.scale(xx % 2 ? -1 : 1, yy % 2 ? -1 : 1);
        g.drawImage(src, 0, 0, tw + 0.5, th + 0.5);
        g.restore();
      }
  }


  const mus = music ? S.lensMusic : 0;
  const fill = (col: string) => {
    g.globalCompositeOperation = 'copy';
    g.fillStyle = col;
    g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'source-over';
  };
  const R = Math.hypot(cw, ch) / 2;

  // Spiral twirl: rings, each turned a little more toward the centre.
  if (S.lensTwirl > 0) {
    const src = input();
    fill(bgCol);
    const N = 14;
    const tw = S.lensTwirl * (2.4 + lm.kick * mus * 1.2);
    for (let k = 0; k < N; k++) {
      const u = 1 - k / N; // 1 outside → 0 centre
      const rr = R * u;
      const ang = tw * Math.pow(1 - u, 1.6) + lm.twirl * S.lensTwirl * (1 - u);
      lensClipDraw(g, src, (c) => c.arc(cw / 2, ch / 2, rr, 0, Math.PI * 2), ang, 1);
    }
  }

  // Fan: pie slices swinging alternately, like an iris or a hand fan.
  if (S.lensFan > 0) {
    const src = input();
    fill(bgCol);
    const N = 12;
    const sl = (Math.PI * 2) / N;
    const swing = S.lensFan * 0.35 * Math.sin(lm.fan) + lm.kick * mus * S.lensFan * 0.15;
    for (let k = 0; k < N; k++) {
      const a0 = k * sl;
      lensClipDraw(g, src, (c) => {
        c.moveTo(cw / 2, ch / 2);
        c.arc(cw / 2, ch / 2, R * 1.1, a0 - 0.004, a0 + sl + 0.004);
        c.closePath();
      }, k % 2 ? swing : -swing, 1);
    }
  }

  // Wave warp: rows slide on a sine wave, like liquid or heat haze.
  if (S.lensWave > 0) {
    const src = input();
    fill(bgCol);
    const rowH = Math.max(2, Math.round(3 * dpr));
    const amp = S.lensWave * (40 + mus * (L.bass * 50 + lm.kick * 30)) * dpr;
    const freq = (Math.PI * 2) / (180 * dpr);
    for (let y = 0; y < ch; y += rowH) {
      const dx = amp * Math.sin(y * freq + lm.wave) + amp * 0.35 * Math.sin(y * freq * 2.7 - lm.wave * 1.3);
      g.drawImage(src, 0, y, cw, rowH, dx, y, cw, rowH);
    }
  }

  // Ripple: rings travelling out from the centre, like a drop in water.
  if (S.lensRipple > 0 && lm.ripples.length) {
    const src = input();
    fill(bgCol);
    g.drawImage(src, 0, 0);
    const N = 26;
    const speed = R / 1800; // px per ms
    for (let k = N - 1; k >= 1; k--) {
      const rr = (R * k) / N;
      let disp = 0;
      for (const t0 of lm.ripples) {
        const front = (now - t0) * speed;
        const life = 1 - (now - t0) / 2600;
        const d = (rr - front) / (R * 0.08);
        disp += Math.exp(-d * d) * Math.sin(d * 3) * life;
      }
      if (Math.abs(disp) < 0.01) continue;
      const sc = 1 + (disp * S.lensRipple * 70 * dpr) / Math.max(rr, 1);
      lensClipDraw(g, src, (c) => c.arc(cw / 2, ch / 2, rr, 0, Math.PI * 2), 0, sc);
    }
  }

  // Shatter: shards that drift apart, burst at a drop, then pull back.
  if (S.lensShatter > 0) {
    const src = input();
    fill(bgCol);
    const cols = 8;
    const rows = 5;
    if (shards.length !== cols * rows) shards = Array.from({ length: cols * rows }, () => ({ dx: Math.random() - 0.5, dy: Math.random() - 0.5, r: Math.random() - 0.5 }));
    const sw = cw / cols;
    const sh = ch / rows;
    const spread = S.lensShatter * (0.12 + 0.05 * Math.sin(now / 900) + lm.burst * 0.9);
    for (let yy = 0; yy < rows; yy++)
      for (let xx = 0; xx < cols; xx++) {
        const s = shards[yy * cols + xx];
        const cx = (xx + 0.5) * sw;
        const cy = (yy + 0.5) * sh;
        const ox = (cx - cw / 2) * spread * 0.6 + s.dx * sw * spread * 2;
        const oy = (cy - ch / 2) * spread * 0.6 + s.dy * sh * spread * 2;
        g.save();
        g.translate(cx + ox, cy + oy);
        g.rotate(s.r * spread * 1.5);
        g.scale(1 - spread * 0.15, 1 - spread * 0.15);
        g.drawImage(src, xx * sw, yy * sh, sw, sh, -sw / 2, -sh / 2, sw, sh);
        g.restore();
      }
  }

  // Infinite zoom: the frame inside itself, again and again, drifting inward.
  if (S.lensZoom > 0) {
    const src = input();
    const s = 0.6;
    const phase = lm.zoom;
    g.globalCompositeOperation = 'copy';
    g.fillStyle = bgCol;
    g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 9; k++) {
      const z = Math.pow(s, k - phase);
      if (z * cw < 4) break;
      g.save();
      g.translate(cw / 2, ch / 2);
      g.rotate((k - phase) * 0.08 * S.lensZoom);
      g.scale(z, z);
      g.drawImage(src, -cw / 2, -ch / 2);
      g.restore();
    }
  }


  // Slices: vertical blinds, each showing an older moment, up to about two
  // seconds back. The history is kept small (a third of the size, a snapshot
  // every few frames) so it stays light on memory.
  if (S.lensSlices > 0) {
    const src = input();
    const sc = 3;
    const hw = Math.ceil(cw / sc);
    const hh = Math.ceil(ch / sc);
    while (sliceHist.length < SLICE_FRAMES) sliceHist.push(document.createElement('canvas'));
    const every = 1 + Math.round(S.lensSlices * 5); // frames between snapshots
    if (sliceTick++ % every === 0) {
      const cur = sliceHist[sliceAt % SLICE_FRAMES];
      if (cur.width !== hw || cur.height !== hh) (cur.width = hw), (cur.height = hh);
      const cc = cur.getContext('2d')!;
      cc.globalCompositeOperation = 'copy';
      cc.drawImage(src, 0, 0, hw, hh);
      sliceAt++;
    }
    const N = 20;
    const stripW = cw / N;
    const maxLag = Math.min(sliceAt - 1, Math.round(S.lensSlices * (SLICE_FRAMES - 1)));
    fill(bgCol);
    for (let i = 0; i < N; i++) {
      // Older toward the edges, and every other strip older still, so the
      // stagger reads clearly.
      const v = Math.abs(i + 0.5 - N / 2) / (N / 2);
      const lag = Math.min(maxLag, Math.round(maxLag * (0.15 + 0.85 * v) * (i % 2 ? 1 : 0.6)));
      const x = i * stripW;
      if (lag <= 0) g.drawImage(src, x, 0, stripW + 1, ch, x, 0, stripW + 1, ch);
      else {
        const old = sliceHist[(sliceAt - 1 - lag + SLICE_FRAMES * 8) % SLICE_FRAMES];
        if (old.width === hw) g.drawImage(old, x / sc, 0, stripW / sc + 0.5, hh, x, 0, stripW + 1, ch);
      }
    }
    // Thin dark seams between the blinds, so they read even when it's calm.
    g.fillStyle = `rgb(0 0 0 / ${(0.25 + S.lensSlices * 0.35).toFixed(2)})`;
    for (let i = 1; i < N; i++) g.fillRect(Math.round(i * stripW) - dpr, 0, dpr * 2, ch);
  }

  // Dots: each cell's colour as a round light, like an LED wall.
  if (S.lensDots > 0) {
    const src = input();
    const cell = Math.max(3, Math.round(S.lensDots * dpr));
    const cols = Math.ceil(cw / cell);
    const rows = Math.ceil(ch / cell);
    if (dotsSmall.width !== cols || dotsSmall.height !== rows) (dotsSmall.width = cols), (dotsSmall.height = rows);
    dotsSmallCtx.imageSmoothingEnabled = true;
    dotsSmallCtx.globalCompositeOperation = 'copy';
    dotsSmallCtx.drawImage(src, 0, 0, cols, rows);
    // Dots swell with the kick (a few cached sizes).
    const swell = Math.round(lm.kick * S.lensMusic * 4);
    const mk = `${cell}:${swell}`;
    let pat = dotsMasks.get(mk);
    if (!pat) {
      const mc0 = document.createElement('canvas');
      mc0.width = mc0.height = cell;
      const mc = mc0.getContext('2d')!;
      mc.fillStyle = '#fff';
      mc.beginPath();
      mc.arc(cell / 2, cell / 2, cell * (0.38 + swell * 0.035), 0, Math.PI * 2);
      mc.fill();
      pat = g.createPattern(mc0, 'repeat')!;
      if (dotsMasks.size > 40) dotsMasks.clear();
      dotsMasks.set(mk, pat);
    }
    g.globalCompositeOperation = 'copy';
    g.imageSmoothingEnabled = false;
    g.drawImage(dotsSmall, 0, 0, cols * cell, rows * cell);
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = pat;
    g.fillRect(0, 0, cw, ch);
    if (!seeThrough) {
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = bgCol;
      g.fillRect(0, 0, cw, ch);
    }
  }


  // Echo copies: a few bigger, fainter copies, flashing out on a kick.
  if (S.lensEcho > 0) {
    const src = input();
    g.globalCompositeOperation = 'copy';
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (let k = 1; k <= 4; k++) {
      const sc = 1 + k * (0.05 + S.lensEcho * 0.06 + lm.kick * mus * 0.05);
      g.globalAlpha = (S.lensEcho * 0.45) / k;
      g.save();
      g.translate(cw / 2, ch / 2);
      g.scale(sc, sc);
      g.drawImage(src, -cw / 2, -ch / 2);
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // Glow: a soft bloom round everything bright, breathing with the music.
  if (S.lensGlow > 0) {
    const src = input();
    const gw = Math.ceil(cw / 4);
    const gh = Math.ceil(ch / 4);
    if (glowBuf.width !== gw || glowBuf.height !== gh) (glowBuf.width = gw), (glowBuf.height = gh);
    glowCtx.globalCompositeOperation = 'copy';
    glowCtx.filter = `blur(${(3 + S.lensGlow * 5).toFixed(1)}px)`;
    glowCtx.drawImage(src, 0, 0, gw, gh);
    glowCtx.filter = 'none';
    g.globalCompositeOperation = 'copy';
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, S.lensGlow * (0.7 + lm.glow * 1.5));
    g.drawImage(glowBuf, 0, 0, cw, ch);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // Colour split: red, green and blue drift apart, with a jolt on each kick.
  if (S.lensSplit > 0) {
    const src = input();
    const d = S.lensSplit * (6 + 24 * S.lensMusic * lensJolt) * dpr;
    g.globalCompositeOperation = 'copy';
    g.fillStyle = seeThrough ? 'rgb(0 0 0 / 0)' : '#000';
    g.fillRect(0, 0, cw, ch);
    if (splitBuf.width !== cw || splitBuf.height !== ch) (splitBuf.width = cw), (splitBuf.height = ch);
    for (const [col, ox, oy] of [['#f00', -d, 0], ['#0f0', 0, d * 0.3], ['#00f', d, 0]] as const) {
      // One channel: tint a copy (multiply), keep its own alpha, add it shifted.
      splitCtx.globalCompositeOperation = 'copy';
      splitCtx.drawImage(src, 0, 0);
      splitCtx.globalCompositeOperation = 'multiply';
      splitCtx.fillStyle = col;
      splitCtx.fillRect(0, 0, cw, ch);
      splitCtx.globalCompositeOperation = 'destination-in';
      splitCtx.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(splitBuf, ox, oy);
    }
    g.globalCompositeOperation = 'source-over';
  }

  // Glitch: bands of the picture jump sideways for a moment.
  if (S.lensGlitch > 0) {
    const fire = music && S.lensMusic > 0 ? L.beat && Math.random() < (0.35 + S.lensGlitch * 0.5) * Math.min(1, S.lensMusic * 1.5) : now > glitchNext;
    if (fire || (music && S.lensMusic > 0 && L.drop)) {
      glitchNext = now + 300 + Math.random() * (1800 - S.lensGlitch * 1400);
      const k = 1 + Math.round(Math.random() * S.lensGlitch * 7);
      for (let j = 0; j < k; j++)
        glitchBands.push({ y: Math.random() * ch, h: (4 + Math.random() * 60) * dpr, dx: (Math.random() - 0.5) * 160 * S.lensGlitch * dpr, until: now + 60 + Math.random() * 180 });
    }
    glitchBands = glitchBands.filter((b) => b.until > now);
    if (glitchBands.length) {
      const src = input();
      if (src === canvas) {
        g.globalCompositeOperation = 'copy';
        g.drawImage(canvas, 0, 0);
      }
      g.globalCompositeOperation = 'copy';
      for (const b of glitchBands) {
        g.save();
        g.beginPath();
        g.rect(0, b.y, cw, b.h);
        g.clip();
        g.drawImage(src, b.dx, 0);
        g.drawImage(src, b.dx - Math.sign(b.dx) * cw, 0);
        g.restore();
      }
      g.globalCompositeOperation = 'source-over';
    } else if (first) {
      g.globalCompositeOperation = 'copy';
      g.drawImage(canvas, 0, 0);
      first = false;
    }
  }
  // CRT: scanlines, a dark vignette and a little flicker, over everything.
  if (S.lensCrt > 0) {
    if (first) {
      g.globalCompositeOperation = 'copy';
      g.drawImage(canvas, 0, 0);
      first = false;
    }
    const step = Math.max(2, Math.round(3 * dpr));
    if (!crtPat || crtPat.dpr !== step) {
      const p0 = document.createElement('canvas');
      p0.width = 4;
      p0.height = step;
      const pc = p0.getContext('2d')!;
      pc.fillStyle = 'rgb(0 0 0 / 0.55)';
      pc.fillRect(0, step - Math.max(1, Math.round(step / 2.5)), 4, Math.max(1, Math.round(step / 2.5)));
      crtPat = { dpr: step, pat: g.createPattern(p0, 'repeat')! };
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = S.lensCrt;
    g.fillStyle = crtPat.pat;
    g.fillRect(0, 0, cw, ch);
    const vg = g.createRadialGradient(cw / 2, ch / 2, R * 0.45, cw / 2, ch / 2, R * 1.05);
    vg.addColorStop(0, 'rgb(0 0 0 / 0)');
    vg.addColorStop(1, 'rgb(0 0 0 / 0.85)');
    g.fillStyle = vg;
    g.fillRect(0, 0, cw, ch);
    const flick = 0.04 + (mus && L.snare ? 0.12 : 0) + Math.random() * 0.03;
    g.globalAlpha = S.lensCrt * flick;
    g.fillStyle = '#000';
    g.fillRect(0, 0, cw, ch);
    g.globalAlpha = 1;
  }
  if (first) {
    g.globalCompositeOperation = 'copy';
    g.drawImage(canvas, 0, 0);
  }
  g.globalCompositeOperation = 'source-over';
}

function draw() {
  const [r, g, b] = bgNow();
  if (palMix && !seeThrough) document.body.style.background = `rgb(${r} ${g} ${b})`;
  const light = r * 0.3 + g * 0.59 + b * 0.11 > 140;
  let fadeA = 1 - trailNow * 0.97;
  // Feedback tunnel: last frame drawn back slightly bigger (and turned), so
  // everything streams out of the centre. Needs some trail to show.
  if (settings.audioTunnel > 0) {
    viewWarp(tunnelZ, tunnelR, 1);
    fadeA = Math.min(fadeA, 0.3 - 0.2 * settings.audioTunnel);
  }
  ctx.globalCompositeOperation = seeThrough ? 'destination-out' : 'source-over';
  ctx.fillStyle = seeThrough ? `rgb(0 0 0 / ${fadeA.toFixed(3)})` : `rgb(${r} ${g} ${b} / ${fadeA.toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  // View echo: a copy of the frame from the last kick, growing and fading.
  if (echoSnap) {
    echoSnap = false;
    if (echoBuf.width !== canvas.width || echoBuf.height !== canvas.height) {
      echoBuf.width = canvas.width;
      echoBuf.height = canvas.height;
    }
    echoCtx.globalCompositeOperation = 'copy';
    echoCtx.drawImage(canvas, 0, 0);
  }
  if (echoA > 0.01 && echoBuf.width === canvas.width) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = echoA;
    ctx.globalCompositeOperation = light || seeThrough ? 'source-over' : 'lighter';
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.drawImage(echoBuf, (cw * (1 - echoZ)) / 2, (ch * (1 - echoZ)) / 2, cw * echoZ, ch * echoZ);
    ctx.restore();
  }
  // Background flash on the kick.
  const flashNow = Math.max(flashA, linkFlash);
  if (flashNow > 0.004 && !seeThrough && !light) {
    ctx.fillStyle = `rgb(255 255 255 / ${flashNow.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  drawObstacles(fadeA, light);
  ctx.globalCompositeOperation = settings.glow ? (light ? 'multiply' : 'lighter') : 'source-over';

  if (settings.colorBy === 'speed' || (settings.render === 'glyphs' && settings.glyphPick === 'speed')) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.hypot(vx[i], vy[i]);
    meanSpeed = meanSpeed * 0.9 + (sum / Math.max(1, n)) * 0.1;
  }
  for (const bk of buckets) bk.length = 0;
  for (const lv of fadeBuckets) for (const bk of lv) bk.length = 0;
  fadeClock = performance.now() / 1000;
  updateSizes();
  for (let i = 0; i < n; i++) {
    const a = fadeOf(i);
    if (a >= 0.99) buckets[shadeIndex(i)].push(i);
    else if (a > 0) fadeBuckets[Math.min(FADE_LEVELS - 1, (a * FADE_LEVELS) | 0)][shadeIndex(i)].push(i);
  }

  const s = settings.size * audioSizeBoost() * handDial.size * linkRun.out.amounts.size * macro.size;
  // Parallax: shift each depth layer a little with the camera, drawn by
  // offsetting positions just for this draw and putting them back after.
  const par = settings.depth > 0 && settings.depthParallax > 0;
  const spin = camA !== 0;
  if (spin) {
    // Camera spin: rotate positions about the centre just for drawing.
    if (spinX.length < n) {
      spinX = new Float32Array(px.length);
      spinY = new Float32Array(px.length);
    }
    spinX.set(px.subarray(0, n));
    spinY.set(py.subarray(0, n));
  }
  if (par) {
    const tx = pointer.active && pointer.x > -1e3 ? (pointer.x / w - 0.5) * 2 : Math.sin(t * 0.13) * 0.6;
    const ty = pointer.active && pointer.y > -1e3 ? (pointer.y / h - 0.5) * 2 : Math.cos(t * 0.11) * 0.4;
    camX += (tx - camX) * 0.05;
    camY += (ty - camY) * 0.05;
    parAmt = 40 * settings.depthParallax * macro.parallax * settings.depth;
    for (let i = 0; i < n; i++) {
      const k = (pz[i] - 0.5) * parAmt;
      px[i] -= camX * k;
      py[i] -= camY * k;
    }
  } else parAmt = 0;
  if (spin) {
    const c = Math.cos(camA);
    const sn = Math.sin(camA);
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < n; i++) {
      const dx = px[i] - cx;
      const dy = py[i] - cy;
      px[i] = cx + dx * c - dy * sn;
      py[i] = cy + dx * sn + dy * c;
    }
  }
  if (settings.render === 'links') drawLinks();
  drawBuckets(buckets, s);
  // Fading particles, drawn in a few alpha steps to keep draw calls batched.
  for (let L = 0; L < FADE_LEVELS; L++) {
    ctx.globalAlpha = (L + 0.5) / FADE_LEVELS;
    drawBuckets(fadeBuckets[L], s);
  }
  ctx.globalAlpha = 1;
  if (spin) {
    px.set(spinX.subarray(0, n));
    py.set(spinY.subarray(0, n));
  } else if (par) {
    for (let i = 0; i < n; i++) {
      const k = (pz[i] - 0.5) * parAmt;
      px[i] += camX * k;
      py[i] += camY * k;
    }
  }

  // Wave rings.
  ctx.globalCompositeOperation = 'source-over';
  if (settings.showWells) drawWellMarkers(r * 0.3 + g * 0.59 + b * 0.11 > 140);
  // Fingertips and pinches, faintly, so you can see where your hands are.
  if (markPts.length) {
    ctx.fillStyle = r * 0.3 + g * 0.59 + b * 0.11 > 140 ? 'rgb(0 0 0 / 0.25)' : 'rgb(255 255 255 / 0.25)';
    ctx.beginPath();
    for (const hp of markPts) {
      ctx.moveTo(hp.x + 3, hp.y);
      ctx.arc(hp.x, hp.y, 3, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle;
    for (const pp of [...pinchPts, ...penPts]) {
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, penPts.includes(pp) ? 6 : 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const e of erasePts) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (twoLine) {
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(twoLine[0].x, twoLine[0].y);
      ctx.lineTo(twoLine[1].x, twoLine[1].y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
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
    if (dead[i]) continue;
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
    if (linkCount[i] >= MAX_LINKS || dead[i]) continue;
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

// --- macros & connections ----------------------------------------------------------
type MacroKey = 'mEnergy' | 'mOrder' | 'mDream' | 'mHeat' | 'mDensity';
const MACROS: [MacroKey, string, string, string][] = [
  ['mEnergy', 'Energy', 'calm', 'frantic'],
  ['mOrder', 'Order', 'chaos', 'tight shape'],
  ['mDream', 'Dream', 'crisp', 'hazy'],
  ['mHeat', 'Heat', 'cool', 'warm'],
  ['mDensity', 'Density', 'sparse', 'dense'],
];
const macroText = (v: number, lo: string, hi: string) => (Math.abs(v - 0.5) < 0.01 ? 'scene' : `${v < 0.5 ? lo : hi} ${Math.round(Math.abs(v - 0.5) * 200)}%`);
// Any input (music, face, hands, body, pointer) to any action or amount; the
// Connections card edits them. The runner lives in links.ts; this gathers the
// inputs and does the actions.
let pressAt = 0;
let lastLinkList: Link[] = [];
let linkAt = 0;
let linkHips: { t: number; y: number }[] = [];
let linkJumpAt = 0;
const EX_OF: Record<string, ExKey> = { mouth: 'exMouth', smile: 'exSmile', brows: 'exBrows', blink: 'exBlink', wink: 'exWink', pucker: 'exPucker', tilt: 'exTilt' };
const SIGN_OF: Record<string, string> = { fist: 'Closed_Fist', palm: 'Open_Palm', victory: 'Victory', thumbUp: 'Thumb_Up', thumbDown: 'Thumb_Down', point: 'Pointing_Up', love: 'ILoveYou' };
function syncLinks() {
  linkRun.sync(bypass.has('links') ? '' : settings.links);
  linkNeed = linkNeeds(linkRun.list);
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function linkSignal(id: string, now: number): Signal {
  const L = audio.levels;
  const music = reacting();
  const none = { level: 0 };
  switch (sourceDef(id)?.needs) {
    case 'audio':
      if (!music) return none;
      switch (id) {
        case 'kick': return { level: clamp01(L.pulse), fire: L.beat };
        case 'snare': return { level: clamp01(L.snareEnv), fire: L.snare };
        case 'hat': return { level: L.hat ? 1 : 0, fire: L.hat };
        case 'bar': return { level: L.bar ? 1 : 0, fire: L.bar };
        case 'drop': return { level: clamp01(L.dropEnv), fire: L.drop };
        case 'bass': return { level: clamp01(L.bass) };
        case 'mid': return { level: clamp01(L.mid) };
        case 'high': return { level: clamp01(L.treble) };
        case 'loud': return { level: clamp01(L.level) };
        case 'pitch': return { level: L.level > 0.05 ? clamp01(audio.pitch) : 0 };
        case 'build': return { level: clamp01(L.tension) };
      }
      return none;
    case 'face': {
      const f = cam.on ? cam.face : null;
      if (!f) return none;
      const at = { x: toSx(f.x[1]), y: toSy(f.y[1]) };
      if (id === 'tilt') return { level: exLevel.exTilt, signed: Math.max(-1, Math.min(1, tiltNow / 45)), ...at };
      if (id in EX_OF) return { level: exLevel[EX_OF[id]], ...at };
      if (id === 'faceX') return { level: clamp01(at.x / w), ...at };
      if (id === 'faceY') return { level: clamp01(1 - at.y / h), ...at };
      return none;
    }
    case 'hands': {
      const hs = cam.on ? cam.hands : [];
      if (!hs.length) return none;
      const palms = hs.map((hd) => ({ x: toSx(hd.x[9]), y: toSy(hd.y[9]) }));
      if (id in SIGN_OF) {
        const k = hs.findIndex((hd) => hd.score > 0.55 && hd.gesture === SIGN_OF[id]);
        return k < 0 ? none : { level: 1, ...palms[k] };
      }
      if (id === 'handHeight') return { level: clamp01(1 - Math.min(...palms.map((q) => q.y)) / h), ...palms[0] };
      if (id === 'handX') return { level: clamp01(palms[0].x / w), ...palms[0] };
      if (palms.length < 2) return none;
      const [a, b] = palms.slice(0, 2).sort((p, q) => p.x - q.x);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (id === 'handsApart') return { level: clamp01(Math.hypot(b.x - a.x, b.y - a.y) / Math.min(w, h) - 0.1), ...mid };
      if (id === 'handsAngle') return { level: clamp01(Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) / (Math.PI / 4)), ...mid };
      return none;
    }
    case 'pose': {
      const p = cam.on ? cam.poses[0] : null;
      if (!p) return none;
      const X = (k: number) => toSx(p.x[k]);
      const Y = (k: number) => toSy(p.y[k]);
      const sw = Math.hypot(X(11) - X(12), Y(11) - Y(12)) || 150;
      const hips = { x: (X(23) + X(24)) / 2, y: (Y(23) + Y(24)) / 2 };
      if (id === 'jump') {
        // The hips rise by a third of a shoulder width within half a second.
        if (p.v[23] < 0.5 || p.v[24] < 0.5) return none;
        linkHips.push({ t: now, y: hips.y });
        while (linkHips.length && linkHips[0].t < now - 500) linkHips.shift();
        const low = Math.max(...linkHips.map((q) => q.y));
        const fire = low - hips.y > sw * 0.35 && now - linkJumpAt > 1200;
        if (fire) {
          linkJumpAt = now;
          linkHips = [];
        }
        return { level: fire ? 1 : 0, fire, ...hips };
      }
      const shY = (Y(11) + Y(12)) / 2;
      if (id === 'armsUp') return { level: clamp01(((shY - Y(15)) / sw + (shY - Y(16)) / sw) / 2 + 0.2), x: X(0), y: Y(0) };
      if (id === 'armsWide') return { level: clamp01((Math.abs(X(15) - X(16)) / sw - 1) / 2.5), x: X(0), y: Y(0) };
      if (id === 'lean') return { level: clamp01(0.5 + ((X(0) - (X(11) + X(12)) / 2) / sw) * 1.2), ...hips };
      return none;
    }
    case 'pointer':
      if (id === 'press') return { level: pressAt > linkAt ? 1 : 0, fire: pressAt > linkAt, x: pointer.x, y: pointer.y };
      if (!pointer.active) return none;
      if (id === 'pointerX') return { level: clamp01(pointer.x / w), x: pointer.x, y: pointer.y };
      if (id === 'pointerY') return { level: clamp01(1 - pointer.y / h), x: pointer.x, y: pointer.y };
  }
  return none;
}
// Heat: a white-balance tint (SVG colour matrix), warm or cool.
const heatSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
heatSvg.setAttribute('width', '0');
heatSvg.setAttribute('height', '0');
heatSvg.style.position = 'absolute';
heatSvg.innerHTML = '<filter id="pf-heat" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>';
document.body.append(heatSvg);
const heatMatrix = heatSvg.querySelector('feColorMatrix')!;
let heatShown = 0;
const two = (x: number) => Math.pow(2, x);
function runMacros() {
  const push = linkRun.out.macros;
  const knobsOff = bypass.has('knobs');
  const v = (k: MacroKey, p: number) => Math.max(-1, Math.min(1, ((knobsOff ? 0.5 : settings[k]) - 0.5 + p) * 2));
  const e = v('mEnergy', push.energy);
  const o = v('mOrder', push.order);
  const d = v('mDream', push.dream);
  const t = v('mHeat', push.heat);
  const den = v('mDensity', push.density);
  // Density: more or fewer particles (×0.35 to ×2.8); sparse ones a bit bigger.
  densityK = two(1.5 * den);
  const up = (x: number) => Math.max(0, x);
  macro.speed = two(0.9 * e) * two(-0.6 * up(d));
  macro.flow = two(1.1 * e) * two(-1.2 * o);
  macro.flowMin = e > 0.15 || o < -0.15 ? 0.15 : 0;
  macro.jitter = two(-1.5 * o);
  macro.jitterAdd = 0.06 * up(e) + 0.05 * up(-o);
  macro.friction = two(0.6 * o) * two(-0.4 * e);
  macro.home = two(1.3 * o);
  macro.trailAdd = -0.25 * up(e) + 0.15 * up(-e) + 0.3 * up(d) - 0.35 * up(-d);
  macro.size = (1 + 0.3 * up(d)) * two(-0.35 * den);
  // The newer parts of the engine follow too, whichever the scene uses.
  macro.flock = two(0.8 * e) * two(-0.5 * up(-o));
  macro.align = two(1.2 * o);
  macro.emit = two(1.0 * e);
  macro.spin = two(1.2 * e) * two(-0.6 * up(d));
  macro.wind = two(0.8 * e) * two(-1 * up(o));
  macro.parallax = 1 + 1.2 * up(d) - 0.5 * up(-d);
  macro.ribbon = 1 + 0.8 * up(d) - 0.4 * up(-d);
  const parts: string[] = [];
  if (Math.abs(d) > 0.02) parts.push(d > 0 ? `blur(${(d * 1.4).toFixed(2)}px) saturate(${(1 - 0.3 * d).toFixed(2)})` : `contrast(${(1 - 0.3 * d).toFixed(2)}) saturate(${(1 - 0.2 * d).toFixed(2)})`);
  if (Math.abs(t) > 0.02) {
    parts.push('url(#pf-heat)');
    if (Math.abs(t - heatShown) > 0.01) {
      heatShown = t;
      // Warm lifts red and drops blue; cool the other way round.
      const r = 1 + 0.28 * t;
      const g = 1 + 0.06 * t;
      const b = 1 - 0.35 * t;
      heatMatrix.setAttribute('values', `${r.toFixed(3)} 0 0 0 0 0 ${g.toFixed(3)} 0 0 0 0 0 ${b.toFixed(3)} 0 0 0 0 0 1 0`);
    }
  }
  macro.filter = parts.join(' ');
}

// Density: move the live count towards countNow(), at once (pop) or a
// little each frame (fade). A shape is re-fitted once it settles.
let densityFit = 0;
function densityTick(now: number) {
  trimGone();
  const want = countNow();
  if (want === n || morphState) return;
  if (want < n) {
    setCount(want);
    if (settings.shape !== 'none') densityFit = now + 250;
    return;
  }
  if (settings.densityMode === 'pop') {
    if (want < n) n = want;
    else ensureCount(want);
  } else {
    const step = Math.max(4, Math.round(Math.abs(want - n) * 0.06));
    if (want < n) n = Math.max(want, n - step);
    else ensureCount(Math.min(want, n + step));
  }
  if (settings.shape !== 'none') densityFit = now + 250;
}
function densityRefit(now: number) {
  if (!densityFit || now < densityFit || n !== countNow()) return;
  densityFit = 0;
  shapeKey = '';
  buildShape();
}

function runLinks(now: number) {
  syncLinks();
  runMacros();
  densityTick(now);
  densityRefit(now);
  linkFlash *= 0.82;
  if (!linkRun.list.length) {
    if (linkRun.out.fired.length || linkRun.out.gather || linkRun.out.freeze || linkRun.list !== lastLinkList) {
      linkRun.out = { fired: [], gather: false, freeze: false, amounts: { size: 1, flow: 1, speed: 1, hue: 0, roll: 0, zoom: 1, emit: 0 }, macros: { energy: 0, order: 0, dream: 0, heat: 0, density: 0, xfade: 0 } };
      lastLinkList = linkRun.list;
    }
    linkAt = now;
    return;
  }
  const out = linkRun.step((id) => linkSignal(id, now), now);
  mouthStream(out.amounts.emit);
  linkAt = now;
  for (const f of out.fired) {
    const x = f.x ?? w / 2;
    const y = f.y ?? h / 2;
    if (f.act === 'explode') explode();
    else if (f.act === 'ripple' || f.act === 'shockwave' || f.act === 'implode') addWave(f.act, x, y);
    else if (f.act === 'scatter') scatter();
    else if (f.act === 'colours') newPalette(now);
    else if (f.act === 'warm') newPalette(now, WARM);
    else if (f.act === 'flash') linkFlash = 0.25;
    else if (f.act === 'scene') nextSceneSameFamily();
    else if (f.act === 'mine') nextMine();
    else if (f.act === 'look') nextFaceLook();
    else if (f.act === 'save') saveSceneNow();
    else if (f.act === 'clear') clearDrawing();
    // Say which sign or move did what (scene changes say it themselves).
    const sign = GESTURES.find(([, name]) => name === SIGN_OF[f.src]);
    if (f.act !== 'save' && f.act !== 'scene' && f.act !== 'mine' && f.act !== 'look') {
      if (sign) showToast(`${sign[2]}  ${actionDef(f.act)?.label ?? f.act}`);
      else if (f.src === 'jump') showToast('Jump!');
    }
  }
}

// --- loop --------------------------------------------------------------------

let last = performance.now();
let fps = 60;

let stepMs = 0;
let drawMs = 0;
let shapeInfo = { targets: 0, ms: 0 };

function frame(now: number) {
  // dt is in 60fps frames, clamped so a background tab doesn't explode the sim.
  const rawMs = Math.min(250, now - last);
  const dt = Math.min(3, (now - last) / (1000 / 60));
  last = now;
  fps = fps * 0.95 + (60 / Math.max(dt, 0.001)) * 0.05;
  // Frozen by the user (Space) or by the audio player pausing with "hold" on.
  const frozen = paused;
  if (!frozen) adaptQuality(dt, rawMs);
  audio.genre = settings.audioGenre;
  audio.vox = settings.audioVox;
  audio.sync = settings.audioSync;
  audio.update(now);
  if (!frozen) {
    updateGlyphs();
    cameraTick(now);
    animTick(rawMs);
    runLinks(now);
    animateShape(now);
    tickMorph(now, reacting() && audio.levels.beat);
    musicVisuals(now);
    tlTick(now);
    xfTick(now);
    // Stutter: a split-second freeze frame on each snare.
    const held = now < stutterUntil;
    const t0 = performance.now();
    const bare = arranging && outlineOnly && settings.shape !== 'none';
    if (!held && !bare && !linkRun.out.freeze) step(dt);
    const t1 = performance.now();
    if (bare) drawOutline();
    else if (!held) {
      draw();
      lensMusicTick(now);
      if (kaleidoNow >= 2) kaleidoscope(kaleidoNow + (now < lm.sidesUntil && settings.audioKaleido > 0 ? 2 : 0));
      if (settings.mirrorWorld) mirrorHalf();
      lensFrame(now);
    }
    const t2 = performance.now();
    stepMs = stepMs * 0.9 + (t1 - t0) * 0.1;
    drawMs = drawMs * 0.9 + (t2 - t1) * 0.1;
  }
  tlFxFrame(now);
  if (PHONE && recorder.on !== recHi) {
    recHi = recorder.on;
    resize();
  }
  if (recorder.on) {
    recorder.tick();
    recTime();
  }
  projector.tick();
  requestAnimationFrame(frame);
}

// Auto quality: slow devices (phones especially) get fewer constellation
// lines and, if that isn't enough, a lower canvas resolution. Fast ones
// climb back up.
let renderScale = 1;
// Counted in time, not frames: a slow phone at 8 fps steps down in about a
// second and a half, not the 8 seconds sixty slow frames would take.
let slowMs = 0;
let fastMs = 0;

function adaptQuality(dt: number, ms: number) {
  if (settings.render === 'links') {
    if (dt > 1.3) linkBudget = Math.max(400, linkBudget * 0.92);
    else if (dt < 1.1) linkBudget = Math.min(6000, linkBudget * 1.02);
  }
  if (dt > 1.4) {
    slowMs += ms;
    fastMs = 0;
  } else if (dt < 1.1) {
    fastMs += ms;
    slowMs = Math.max(0, slowMs - ms);
  }
  // ~1.5 s mostly slow → drop resolution a step; ~6 s smooth → raise it.
  if (slowMs > 1500 && renderScale > 0.5) {
    renderScale = Math.max(0.5, renderScale - 0.25);
    slowMs = 0;
    resize();
  } else if (fastMs > 6000 && renderScale < 1) {
    renderScale = Math.min(1, renderScale + 0.25);
    fastMs = 0;
    resize();
  }
}

// --- controls ----------------------------------------------------------------

type Control = ControlBody & { show?: () => boolean };
// Cards live on a page; pages are grouped by what you're trying to do:
// Create the look, Perform with it, or make it React to music and camera.
type Tab = 'presets' | 'look' | 'shape' | 'motion' | 'music' | 'camera' | 'timeline' | 'xfader' | 'knobs' | 'record' | 'links';
type Intent = 'create' | 'perform' | 'react';
const TABS: [Tab, string][] = [
  ['look', 'Look'], ['shape', 'Shape'], ['motion', 'Motion'],
  ['presets', 'Scenes'], ['timeline', 'Timeline'], ['xfader', 'Crossfader'], ['knobs', 'On-screen controls'], ['record', 'Record'],
  ['music', 'Music'], ['camera', 'Camera'], ['links', 'Connections'],
];
// Desktop tab icons: one row of every page, the open one also named.
const TAB_ICONS: Record<Tab, string> = {
  look: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  shape: '<path d="M12 3.5l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 16.6l-5.3 2.9L8 13.6l-4.5-4 6-.6z"/>',
  motion: '<path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"/>',
  presets: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  timeline: '<path d="M4 6v12M20 6v12"/><rect x="7" y="9" width="5" height="6" rx="1"/><rect x="13" y="9" width="4" height="6" rx="1"/>',
  xfader: '<path d="M4 12h16"/><rect x="10" y="6.5" width="4" height="11" rx="1.2"/>',
  knobs: '<circle cx="12" cy="12" r="8"/><path d="M12 12l4.2-4.2"/>',
  record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  camera: '<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20V18H4z"/><circle cx="12" cy="13" r="3.2"/>',
  links: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>',
};
const INTENTS: [Intent, string, Tab[]][] = [
  ['create', 'Edit', ['shape', 'motion', 'look']],
  ['react', 'React', ['music', 'camera', 'links']],
  ['perform', 'Play', ['presets', 'timeline', 'knobs', 'record']],
];
const intentOf = (tab: Tab) => (INTENTS.find(([, , tabs]) => tabs.includes(tab)) ?? INTENTS[INTENTS.length - 1])[0];
// Cards that sit on their own page rather than the tab they were written for.
const signedPct = (v: number) => (v === 0 ? 'centre' : `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`);
const VIEW_KEYS = ['viewX', 'viewY', 'viewZoom', 'viewRot', 'viewFlipH', 'viewFlipV'] as const;
const viewIsPlain = () => !settings.viewX && !settings.viewY && settings.viewZoom === 1 && !settings.viewRot && !settings.viewFlipH && !settings.viewFlipV;
function resetView() {
  for (const k of VIEW_KEYS) (settings as unknown as Record<string, unknown>)[k] = DEFAULTS[k];
  changed(new Set<keyof Settings>(VIEW_KEYS));
}
function resetPlacement() {
  Object.assign(settings, { shapeX: 0, shapeY: 0, shapeAngle: 0, shapeTilt: 0, shapeFacing: 0 });
  changed(new Set<keyof Settings>(['shapeX', 'shapeY', 'shapeAngle', 'shapeTilt', 'shapeFacing']));
}
// Studio folders: the pages grouped into seven folders, always listed on the
// left (on phones, the Studio's home). Opening one shows all its cards, open.
type Folder = { id: string; label: string; tabs: Tab[]; icon: string };
const FOLDERS: Folder[] = [
  { id: 'scenes', label: 'Scenes', tabs: ['presets'], icon: TAB_ICONS.presets },
  { id: 'shape', label: 'Shape', tabs: ['shape'], icon: TAB_ICONS.shape },
  { id: 'motion', label: 'Motion', tabs: ['motion'], icon: TAB_ICONS.motion },
  { id: 'look', label: 'Look', tabs: ['look'], icon: TAB_ICONS.look },
  { id: 'music', label: 'Music', tabs: ['music'], icon: TAB_ICONS.music },
  { id: 'camera', label: 'Camera', tabs: ['camera'], icon: TAB_ICONS.camera },
  { id: 'links', label: 'Connections', tabs: ['links'], icon: TAB_ICONS.links },
  { id: 'play', label: 'Play', tabs: ['knobs', 'timeline', 'xfader'], icon: TAB_ICONS.knobs },
  { id: 'output', label: 'Output', tabs: ['record'], icon: TAB_ICONS.record },
];
const folderOf = (t: Tab) => FOLDERS.find((f) => f.tabs.includes(t)) ?? FOLDERS[0];
const PAGE_OF: Record<string, Tab> = { anim: 'knobs', timeline: 'timeline', xfader: 'xfader', macros: 'knobs', play: 'knobs', pointer: 'knobs', view: 'record', record: 'record', links: 'links' };
const pageOf = (c: { id: string; tab?: Tab }) => PAGE_OF[c.id] ?? c.tab ?? 'look';
// A card that can be switched off: `off` is what switching off sets, `start`
// what switching on sets the first time (later it restores what you had).
// toggle: for a card whose switch isn't settings (the camera).
type Power = { on: () => boolean; off: Partial<Settings>; start: Partial<Settings>; toggle?: () => void };
type ControlBody =
  | { kind: 'section'; id: string; label: string; tab?: Tab; fixed?: boolean; summary?: () => string; lock?: (keyof Settings)[]; power?: Power; about?: string; folded?: boolean }
  | { kind: 'vibes' }
  | { kind: 'more'; label: string }
  | { kind: 'mypresets' }
  | { kind: 'timeline' }
  | { kind: 'record' }
  | { kind: 'xfader' }
  | { kind: 'knobsmore' }
  | { kind: 'animlist' }
  | { kind: 'presetlib' }
  | { kind: 'exmeters' }
  | { kind: 'rapmeters' }
  | { kind: 'mixgrid'; which: 'music' | 'camera' | 'lens' }
  | { kind: 'links' }
  | { kind: 'sub'; label: string }
  | { kind: 'heading'; label: string; tab: Tab }
  | { kind: 'range'; key: keyof Settings; label: string; min: number; max: number; step: number; format?: (v: number) => string }
  | { kind: 'select'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'toggle'; key: keyof Settings; label: string }
  | { kind: 'choice'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'color'; key: keyof Settings; label: string }
  | { kind: 'colors'; key: keyof Settings; label: string }
  | { kind: 'multi'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'text'; key: keyof Settings; label: string; placeholder?: string }
  | { kind: 'buttons'; buttons: [string, () => void][]; active?: (text: string) => boolean; limit?: number }
  | { kind: 'icons'; buttons: [string, string, () => void, string?, Tab?][] }
  | { kind: 'note'; text: string }
  | { kind: 'swatch' }
  | { kind: 'audio' };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const FLOW_TYPES: [string, string][] = [
  ['waves', 'Currents (streams)'], ['curl', 'Smoke (stays spread)'], ['vortex', 'Vortex (orbits the centre)'], ['wind', 'Wind (gusts one way)'],
  ['cells', 'Cells (spinning eddies)'], ['rise', 'Rise (like heat)'], ['tide', 'Tide (breathes in and out)'], ['spiral', 'Spiral arms (galaxy)'],
];
const label = (options: [string, string][], v: unknown) => options.find(([k]) => k === v)?.[1] ?? '';

const POINTER_MODES: [string, string][] = [['repel', 'Repel'], ['attract', 'Attract'], ['vortex', 'Vortex'], ['none', 'Off']];
const CLICK_MODES: [string, string][] = [['implodeHold', 'Implode & burst (hold)'], ['gather', 'Gather (hold)'], ['emit', 'Fountain (hold)'], ['ripple', 'Ripple'], ['implode', 'Implode'], ['shockwave', 'Shockwave'], ['none', 'Nothing']];
const RENDERS: [string, string][] = [
  ['dots', 'Pixels'], ['circles', 'Circles'], ['glow', 'Glow orbs'], ['bokeh', 'Bokeh'], ['rings', 'Rings'],
  ['sparkles', 'Sparkles'], ['arrows', 'Arrows'], ['streaks', 'Streaks'], ['comets', 'Comets'], ['ribbons', 'Ribbons'], ['glyphs', 'Glyphs'],
  ['links', 'Constellation'],
  ['squares', 'Confetti squares'], ['shards', 'Shards'], ['stars', 'Stars'], ['petals', 'Petals'], ['crosses', 'Crosses'],
  ['neon', 'Neon'], ['flare', 'Lens flare'], ['embers', 'Embers'],
  ['hair', 'Hair'], ['threads', 'Threads'], ['ink', 'Ink'], ['lightning', 'Lightning'],
  ['halftone', 'Halftone'], ['bigpixels', 'Big pixels'], ['bubbles', 'Bubbles'],
  ['mixed', 'Mixed'],
];
const COLOR_BY: [string, string][] = [['palette', 'Random'], ['face', 'Face features (camera)'], ['camera', 'Camera colours (camera)'], ['speed', 'Speed'], ['direction', 'Heading'], ['pointer', 'Pointer heat'], ['cycle', 'Colour waves'], ['horizontal', 'Left → right'], ['vertical', 'Bottom → top'], ['radial', 'Centre glow'], ['age', 'Age (with a lifespan)'], ['depth', 'Depth (with 3D depth)'], ['audio', 'Music energy'], ['band', 'Frequency group (with groups on)']];

const BEAT_ACTIONS: [string, string][] = [['ripple', 'Ripple'], ['twist', 'Twist'], ['shockwave', 'Shockwave'], ['star', 'Star burst'], ['sweep', 'Sweep line'], ['implode', 'Implode'], ['mix', 'Mix (cycle)'], ['random', 'Mix (random)']];
const VIBE_FAMILY_KEY = 'particle-field:vibe-family';
const VIBE_LEAD_KEY = 'particle-field:vibe-lead';
let vibeLead: VibeLead | 'any' = (() => {
  const v = readJson<string>(VIBE_LEAD_KEY, 'any');
  return VIBE_LEADS.some(([f]) => f === v) ? (v as VibeLead | 'any') : 'any';
})();
let vibeFamily: VibeFamily = (() => {
  const v = readJson<string>(VIBE_FAMILY_KEY, 'all');
  return VIBE_FAMILIES.some(([f]) => f === v) ? (v as VibeFamily) : 'all';
})();
// Word lists that came with a vibe: another vibe may replace them, yours it keeps.
const VIBE_WORDS = new Set(VIBES.map((v) => v.cards.audioWords).filter(Boolean));

// Every setting of a locked card.
function lockedKeys(): (keyof Settings)[] {
  const out: (keyof Settings)[] = [];
  for (const c of CONTROLS) if (c.kind === 'section' && c.lock && locks.has(c.id)) out.push(...c.lock);
  return out;
}

// May a vibe change this key? Not if the card it belongs to is locked.
function cardAllows(k: keyof Settings) {
  const sec = CONTROLS.find((c) => c.kind === 'section' && c.lock?.includes(k));
  return !sec || sec.kind !== 'section' || !locks.has(sec.id);
}

function applyVibe(v: VibeDef) {
  const patch: Partial<Settings> = {};
  let look = settings.audioVibeLook ? v.look : {};
  // A vibe only changes the scene when "Vibes also change style" is on: then
  // one that suits another family brings a scene from it along (a face vibe,
  // a face scene). Off, it only sets how the music moves the field.
  const faceVibe = v.family === 'face';
  const faceNow = faceScene();
  const want = settings.audioVibeLook && v.suits && (faceVibe ? !faceNow : lastPresetFamily !== v.suits);
  if (want && v.suits) {
    if (vibeScene(v)) look = {};
  } else if (faceVibe && !faceNow) setTimeout(() => showToast(`${v.name} plays on a face: pick “Use a face scene” in the Vibe card`), 1200);
  const all = { ...v.drums, ...v.cards, ...look };
  if (settings.audioWords.trim() && !VIBE_WORDS.has(settings.audioWords)) delete (all as Partial<Settings>).audioWords;
  // The Lens (kaleidoscope included) belongs to the look: a vibe only
  // touches it when "Vibes also change style" is on.
  if (!settings.audioVibeLook) for (const k of LENS_KEYS) delete (all as Partial<Settings>)[k];
  for (const [k, x] of Object.entries(all) as [keyof Settings, never][]) if (cardAllows(k)) (patch as Record<string, unknown>)[k] = x;
  patch.audioVibe = v.name;
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, settings[k as keyof Settings]])) as Partial<Settings>;
  Object.assign(settings, patch);
  changed(new Set(Object.keys(patch) as (keyof Settings)[]));
  // Say what it switched on, with an Undo.
  const turnedOn = (Object.keys(patch) as (keyof Settings)[]).filter((k) => {
    const x = patch[k] as unknown;
    return k !== 'audioVibe' && before[k] !== x && x !== 0 && x !== false && x !== 'none' && x !== 'off';
  });
  const names = [...new Set(turnedOn.map((k) => CONTROLS.find((c) => 'key' in c && c.key === k && 'label' in c)).filter(Boolean).map((c) => (c as { label: string }).label))];
  const what = names.length ? `: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : '';
  if (audio.source !== 'off') showToast(`${v.name}${what}`, ['Undo', () => {
    Object.assign(settings, before);
    changed(new Set(Object.keys(before) as (keyof Settings)[]));
    refresh();
  }]);
  // Vibes are how the music plays the field: without sound they barely show.
  if (audio.source === 'off') setTimeout(() => showToast(`${v.name} is set. It moves with music: turn on a sound source`), faceVibe ? 2500 : 0);
}

const faceScene = () => settings.shape === 'camera' && faceMode();
// Bring a scene from the family the vibe suits (a face scene for face vibes).
function vibeScene(v: VibeDef) {
  const faceVibe = v.family === 'face';
  const list = PRESETS.filter(([nm, p]) => FAMILY_OF[nm] === v.suits && (!faceVibe || (p.shape === 'camera' && ['face', 'features', 'mixed'].includes(String(p.camMode)))));
  if (!list.length) return false;
  const [nm, p] = pick(list);
  lastPresetFamily = v.suits ?? null;
  apply({ ...p, ...(settings.audioVibeLook ? v.look : {}) });
  showToast(`${v.name} · ${nm}`);
  return true;
}

// Is the vibe still as it was applied (ignoring locked cards and the look)?
function vibeIntact(v: VibeDef) {
  return Object.entries({ ...v.drums, ...v.cards }).every(([k, x]) => k === 'audioWords' || !cardAllows(k as keyof Settings) || settings[k as keyof Settings] === x);
}
const currentVibe = () => VIBES.find((v) => v.name === settings.audioVibe);
function vibeLabel() {
  const v = currentVibe();
  if (!v) return settings.audioVibe ? 'custom' : '';
  return vibeIntact(v) ? v.name : `${v.name} (edited)`;
}

// A random combination, not just a random preset. It picks what leads first
// (the drums, the bass, the melody, the voice or the song's shape), then one
// layer to support it, so each roll feels different instead of all jumping.
const LEAD_PATCH: Record<VibeLead, () => Partial<Settings>> = {
  beat: () => {
    const kick = pick(['pulse', 'wave', 'both', 'pump', 'tick', 'spawn', 'none'] as const);
    return {
      audioKick: kick,
      audioPulse: rand(0.4, 1.2, 0.05),
      audioBeat: pick(['ripple', 'twist', 'shockwave', 'star', 'sweep', 'implode', 'mix', 'random'] as const),
      audioWaveAt: pick(['centre', 'orbit', 'mirror', 'corners', 'random'] as const),
      audioWaveEvery: pick([1, 1, 2, 4] as const),
      audioWaveReach: rand(0.6, 2, 0.05),
      audioWaveSpeed: rand(0.6, 1.6, 0.05),
      audioWaveWidth: rand(0.6, 2, 0.05),
      audioSnare: pick(['swirl', 'wave', 'flash', 'none'] as const),
      audioHats: pick(['sparkle', 'none'] as const),
      audioHits: rand(0.3, 1, 0.05),
      audioSnareFlash: pick([0, 0, 0.4, 0.7]),
      audioHatTwinkle: pick([0, 0, 0.5, 0.8]),
      audioHatShake: pick([0, 0, 0, 0.4]),
      audioCam: pick([0, 0.4, 0.8, 1.2]),
      audioBgFlash: pick([0, 0, 0.3, 0.6]),
      audioStutter: Math.random() < 0.2,
      audioHue: pick(['beat', 'bar', 'drift'] as const),
    };
  },
  bass: () => ({
    audioKick: pick(['pump', 'none', 'none'] as const),
    audioPulse: rand(0.4, 1, 0.05),
    audioSub: pick(['size', 'flow', 'speed'] as const),
    audioSubAmt: rand(0.5, 1.3, 0.05),
    audioBassThrob: pick([0, 0.5, 0.8, 1.2]),
    audioBassZoom: pick([0, 0.3, 0.6]),
    audioBassGlow: pick([0, 0.4, 0.7]),
    audioSway: pick([0, 0.5, 0.8]),
    audioEnergyShake: pick([0, 0, 0.3]),
    audioTrailEnergy: pick([0, 0.4, 0.8]),
    audioHue: pick(['drift', 'bar'] as const),
  }),
  melody: () => ({
    audioNoteHue: rand(0.4, 1, 0.05),
    audioNoteRipple: pick([0, 0.3, 0.6]),
    audioNoteHop: pick([0, 0.4]),
    audioHatTwinkle: pick([0, 0.4]),
    audioSpin: pick(['sway', 'turn', 'off'] as const),
    audioHue: 'off' as const,
  }),
  voice: () => ({
    audioVoxGlow: pick([0, 0.4, 0.7]),
    audioVoxZoom: pick([0, 0.3, 0.5]),
    audioVoxSwell: pick([0, 0.4, 0.6]),
    audioPitchLift: pick([0, 0.4, 0.7]),
    audioPitchTilt: pick([0, 0, 0.4]),
    audioSylPush: pick([0, 0.4, 0.7]),
    audioSylFlash: pick([0, 0, 0.5]),
    audioPauseDim: pick([0, 0.3, 0.5]),
    audioAccentPunch: pick([0, 0, 0.5]),
    audioRhymeRipple: pick([0, 0, 0.5]),
    audioHue: pick(['drift', 'off'] as const),
  }),
  song: () => ({
    audioDrop: rand(1.2, 2, 0.1),
    audioMonoBuild: Math.random() < 0.6,
    audioBuildScatter: pick([0, 0.4, 0.7]),
    audioDolly: Math.random() < 0.5,
    audioKaleidoDrop: Math.random() < 0.3,
    audioInvert: Math.random() < 0.3,
    audioGravFlip: Math.random() < 0.25,
    audioCuts: pick(['off', 'drop', 'drop'] as const),
    audioPalEvery: pick([0, 8, 16]),
    audioHue: 'drop' as const,
  }),
};
const LEAD_NAMES: Record<VibeLead, string> = { beat: 'the beat', bass: 'the bass', melody: 'the melody', voice: 'the voice', song: 'the song shape' };
function surpriseVibe(lead: VibeLead = pick(['beat', 'bass', 'melody', 'voice', 'song'] as const)) {
  const look = pick(VIBES).look;
  // Calm shared ground: the energy moves things a little, nothing more.
  const base: Partial<Settings> = {
    audioDrop: pick([0, 0.6, 1]),
    audioHueAmt: rand(10, 120, 5),
    audioBright: pick([0, 0.3, 0.5]),
    audioSpeed: rand(0.1, 0.5, 0.05),
    audioFlow: rand(0.2, 0.8, 0.05),
    audioBands: pick([0, 0, 0.5]),
    audioPan: pick([0, 0, 0.4]),
    audioTunnel: pick([0, 0, 0, 0.3]),
    audioTunnelTurn: pick(['none', 'left', 'right', 'rock'] as const),
    audioEcho: pick([0, 0, 0, 0.5]),
  };
  // One supporting layer, kept softer than the lead.
  const others = (['beat', 'bass', 'melody', 'voice', 'song'] as const).filter((l) => l !== lead);
  const support: Partial<Settings> = {};
  if (Math.random() < 0.7) {
    const sl = pick(others);
    const sp = LEAD_PATCH[sl]();
    // Support never adds a kick move on top, and stays at half strength.
    for (const [k, x] of Object.entries(sp)) {
      if (k === 'audioKick' || k === 'audioHue' || k === 'audioCam' || k === 'audioBgFlash') continue;
      (support as Record<string, unknown>)[k] = typeof x === 'number' ? Math.round(x * 50) / 100 : x;
    }
  }
  const all = { ...base, ...support, ...LEAD_PATCH[lead]() };
  const drums: Partial<Settings> = {};
  const cards: Partial<Settings> = {};
  for (const [k, x] of Object.entries(all)) ((k in quiet ? drums : cards) as Record<string, unknown>)[k] = x;
  applyVibe(vibe(`Surprise: led by ${LEAD_NAMES[lead]}`, '', lead, drums, cards, look));
}

const GENRES: [string, string][] = [['general', 'Any'], ['hiphop', 'Rap / drill'], ['dnb', 'Drum & bass'], ['afro', 'Afro'], ['reggae', 'Reggae'], ['techno', 'Techno']];
const ft = () => true;
const kickWave = () => settings.audioKick === 'wave' || settings.audioKick === 'both';
const AUDIO_LABELS = { off: 'off', mic: 'microphone', tab: 'shared tab', file: 'file', feed: 'X-Frame player' } as const;

const isGlyphs = () => settings.render === 'glyphs' || (settings.render === 'mixed' && settings.mixStyles.split(',').includes('glyphs'));
const hasFlow = () => settings.flow > 0;
const hasEmitter = () => settings.emitter !== 'none';
const hasShape = () => settings.shape !== 'none';
const ENTRANCES: [string, string][] = [
  ['drift', 'Drift in from all around'],
  ['formed', 'Already formed'],
  ['centre', 'Bloom from the centre'],
  ['sweep', 'Sweep in from the left'],
  ['rain', 'Fall from the top'],
  ['edges', 'Fly in from the edges'],
  ['scatter', 'Scattered (free spring)'],
];
const CAM_MODES: [string, string][] = [
  ['face', 'Face mesh (follows your face)'], ['features', 'Face features (eyes, brows, lips)'], ['mixed', 'Features + a light mesh'],
  ['hands', 'Your hands (skeleton)'], ['pose', 'Your body (skeleton)'], ['body', 'Body cut-out'], ['edges', 'Outlines'], ['bright', 'Bright parts'], ['dark', 'Dark parts'],
];
const SHAPES: [string, string][] = [['none', 'Nothing (free)'], ['text', 'Text'], ['icon', 'An icon'], ['geo', 'Geometric shape'], ['pattern', 'Pattern (fills an area)'], ['solid', '3D shape'], ['sequence', 'A sequence (changes with the music)'], ['live', 'The music, a clock or the tempo'], ['drawing', 'Your drawing'], ['image', 'An image or SVG logo'], ['camera', 'Your camera']];
const PATTERNS: [string, string][] = [['sunflower', 'Sunflower disc'], ['grid', 'Grid'], ...FILL_PATTERNS];
const EMITTERS: [string, string][] = [['none', 'The whole screen'], ['point', 'A point'], ['line', 'A line'], ['circle', 'A disc'], ['ring', 'A ring'], ['edges', 'The screen edges'], ['pointer', 'Your pointer / finger']];
const EMIT_MODES: [string, string][] = [['steady', 'Steady stream'], ['burst', 'Bursts'], ['beat', 'Burst on the beat']];
const hasPointer = () => settings.pointerMode !== 'none';
const hasClick = () => settings.click !== 'none';

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 18h4M12 18h8"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="18" r="2"/>'),
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  gather: svg('<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M4 4l4 4M20 4l-4 4M4 20l4-4M20 20l-4-4"/><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>'),
  clear: svg('<path d="M4 20h16"/><path d="M14.5 4.5l5 5L11 18H6.5L4 15.5z"/><path d="M9.5 9.5l5 5"/>'),
  scatter: svg('<circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
  explode: svg('<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M5 19l3.5-3.5M15.5 8.5L19 5"/>'),
  shuffle: svg('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>'),
  reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  record: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>'),
  project: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
};


// Every slider, for Play mode's pickers (filled once CONTROLS exists).
const PLAYABLE: [string, string][] = [];
// The newer lenses, in the order the card lists them.
const LENS_MORE: [('lensTwirl' | 'lensWave' | 'lensRipple' | 'lensFan' | 'lensShatter' | 'lensSlices' | 'lensEcho' | 'lensGlow' | 'lensCrt'), string][] = [
  ['lensTwirl', 'Spiral twirl'], ['lensWave', 'Wave warp'], ['lensRipple', 'Ripple'], ['lensFan', 'Fan'],
  ['lensShatter', 'Shatter'], ['lensSlices', 'Slices'],
  ['lensEcho', 'Echo copies'], ['lensGlow', 'Glow'], ['lensCrt', 'CRT'],
];

// Knob sets: five settings for knobs A–E in one go.
const KNOB_SLOTS = ['playLeft', 'playWheel3', 'playWheel4', 'playRight', 'playWheel5'] as const;
const KNOB_SETS: [string, string[], string][] = [
  ['Macros', ['mEnergy', 'mOrder', 'mHeat', 'mDream', 'mDensity'], 'Energy, Order, Heat, Dream, Density: each moves a group of settings around the scene.'],
  ['Motion', ['speed', 'flow', 'flowScale', 'friction', 'jitter'], 'Speed, flow strength, flow scale, friction, jitter.'],
  ['Look', ['size', 'trail', 'sizeVar', 'depth', 'mHeat'], 'Size, trails, size variety, 3D depth, colour heat.'],
  ['Forces', ['gravity', 'wind', 'windDir', 'flow', 'speed'], 'Gravity, wind, wind direction, flow, speed.'],
  ['Shape', ['shapeSize', 'homeStrength', 'shapeCycle', 'size', 'mDensity'], 'Shape size, snap to shape, form & dissolve, particle size, density.'],
  ['Lens', ['audioKaleido', 'lensTiles', 'lensZoom', 'lensSplit', 'lensGlitch'], 'Kaleidoscope, tiles, infinite zoom, colour split, glitch.'],
  ['Warp', ['lensTwirl', 'lensWave', 'lensRipple', 'lensShatter', 'lensGlow'], 'Spiral twirl, wave warp, ripple, shatter, glow.'],
  ['Music VJ', ['audioIntensity', 'audioPulse', 'audioCam', 'audioTunnel', 'audioKaleido'], 'Music intensity, pulse, punch & shake, feedback tunnel, kaleidoscope (needs a sound source).'],
];
function knobSetName() {
  return KNOB_SETS.find(([, keys]) => keys.every((k, i) => settings[KNOB_SLOTS[i]] === k))?.[0];
}
function useKnobSet(keys: string[]) {
  KNOB_SLOTS.forEach((slot, i) => ((settings as unknown as Record<string, string>)[slot] = keys[i]));
  // Picking a set means playing it: overview picks step aside.
  settings.knobsPick = '';
  changed(new Set<keyof Settings>([...KNOB_SLOTS, 'knobsPick']));
}

const CONTROLS: Control[] = [
  { kind: 'section', id: 'presets', label: 'Scene library', tab: 'presets', summary: () => familyLabel(presetFamily) },
  { kind: 'presetlib' },

  { kind: 'section', id: 'mine', label: 'My scenes', tab: 'presets',
    summary: () => (myPresets.length ? `${myPresets.length} saved` : '') },
  { kind: 'mypresets' },
  { kind: 'note', text: 'Keys 1–9 and 0 play your scenes: pick a key in the list, or press Shift + a number to save the current scene to it. Open straight into one with a link ending ?preset=3 (its key) or ?preset=Smoke (any scene name).' },

  { kind: 'section', id: 'timeline', label: 'Timeline', tab: 'presets',
    about: 'A setlist of scenes, each for a number of bars, changing on the bar.',
    summary: () => (tlActive() ? (tlIdx >= 0 && tl.clips[tlIdx] ? `${tl.clips[tlIdx].name} · ${tlIdx + 1}/${tl.clips.length}` : `${tl.clips.length} scenes`) : tl.clips.length ? `${tl.clips.length} scenes · off` : 'off'),
    power: {
      on: () => tl.on,
      get off(): Partial<Settings> {
        tlSetOn(false);
        return {};
      },
      get start(): Partial<Settings> {
        // Starting an empty timeline loads a ready-made set to play with.
        if (!tl.clips.length) (tl.clips = TL_SETS[0][1].map((c) => ({ ...c }))), (tl.set = TL_SETS[0][0]);
        tlSetOn(true);
        return {};
      },
    } },
  { kind: 'timeline' },
  { kind: 'note', text: 'Changes happen on the bar. On the field, the ring shows where you are: click it for the next scene, scroll over it to pick one. With music the bars follow its tempo; without, the tempo in Edit. While the timeline runs, Auto VJ waits.' },

  { kind: 'section', id: 'xfader', label: 'Crossfader', tab: 'presets',
    about: 'Blend between two scenes with a fader: every setting goes partway from A to B.',
    summary: () => (xf.on ? `${xf.a.name} ${Math.round((1 - settings.xfPos) * 100)} · ${Math.round(settings.xfPos * 100)} ${xf.b.name}` : 'off'),
    power: {
      on: () => xf.on,
      get off(): Partial<Settings> {
        xfSetOn(false);
        return {};
      },
      get start(): Partial<Settings> {
        xfSetOn(true);
        return {};
      },
    } },
  { kind: 'xfader' },
  { kind: 'range', key: 'xfPos', label: 'A ↔ B', min: 0, max: 1, step: 0.01, format: (v) => (v <= 0.005 ? 'A' : v >= 0.995 ? 'B' : `${Math.round(v * 100)}% B`) },
  { kind: 'note', text: 'Numbers glide between the two scenes and the colours mix; things that can’t be partway (particle style, flow type, emitters, the shape) switch at the middle with a quick crossfade. On the field: drag the fader, scroll over it, or ← → (Shift fades all the way). Put “Crossfader” on a knob, or link music or a hand to it in Connections. While it’s on, the timeline and Auto VJ wait.' },

  // How switching between looks feels. Not part of any look: presets keep these.

  { kind: 'section', id: 'transitions', label: 'Transitions', tab: 'presets',
    summary: () => [settings.morph > 0 ? `${settings.morph.toFixed(1)}s morph` : 'instant', `snap ${settings.homeStrength.toFixed(1)}×`, settings.beatSnap ? 'on the beat' : '', settings.shuffleCards ? 'wild shuffle' : ''].filter(Boolean).join(' · ') },
  { kind: 'range', key: 'morph', label: 'Morph time', min: 0, max: 4, step: 0.1, format: (v) => (v === 0 ? 'instant' : `${v.toFixed(1)}s`) },
  { kind: 'range', key: 'homeStrength', label: 'Snap to shape', min: 0.1, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×` },
  { kind: 'toggle', key: 'beatSnap', label: 'Switch on the next kick drum' },
  { kind: 'toggle', key: 'shuffleCards', label: 'Wild shuffle: bigger changes each time' },
  { kind: 'note', text: 'Morph time: how long a switch glides. Snap to shape: how hard particles chase their spot in a word or image. Wild shuffle rolls which unlocked cards are on too, not just their settings. Scenes don\'t change these.' },
  { kind: 'note', text: 'Beat snap needs Audio on; without a kick within 2.5 s it switches anyway.', show: () => settings.beatSnap && audio.source === 'off' },
  { kind: 'section', id: 'macros', label: 'Macros', tab: 'presets',
    about: 'Each slider moves a group of settings at once, on top of the scene. The middle is the scene as it is.',
    lock: ['mEnergy', 'mOrder', 'mDream', 'mHeat', 'mDensity', 'densityMode'],
    summary: () => {
      const on = MACROS.filter(([k]) => Math.abs(settings[k] - 0.5) > 0.01).map(([, name]) => name);
      return on.length ? on.join(', ') : 'as the scene';
    } },
  ...MACROS.map(([key, name, lo, hi]): Control => ({ kind: 'range', key, label: name, min: 0, max: 1, step: 0.01, format: (v) => macroText(v, lo, hi) })),
  { kind: 'select', key: 'densityMode', label: 'New particles', options: [['fade', 'Trickle in and out'], ['pop', 'Pop in and out']], show: () => Math.abs(settings.mDensity - 0.5) > 0.01 },
  { kind: 'buttons', buttons: [['Back to the scene', () => {
    Object.assign(settings, { mEnergy: 0.5, mOrder: 0.5, mDream: 0.5, mHeat: 0.5, mDensity: 0.5 });
    changed(new Set(['mEnergy', 'mOrder', 'mDream', 'mHeat', 'mDensity']));
  }]], show: () => MACROS.some(([k]) => Math.abs(settings[k] - 0.5) > 0.01) },
  { kind: 'section', id: 'play', label: 'Field knobs', tab: 'presets',
    about: 'Knobs along the bottom edge (up to eight from each scene) and the mouse wheel: turn settings with the menu closed.',
    summary: () => (!settings.playOn ? 'off' : knobPicks().length ? `your ${knobPicks().length} picked knobs${knobPicks().some(knobLive) ? '' : ' (none in this scene)'}` : settings.knobsFollow && settings.knobsScene ? 'the scene\'s knobs' : (knobSetName() ?? 'own mix')),
    power: { on: () => settings.playOn, off: { playOn: false }, start: { playOn: true } } },
  { kind: 'note', text: 'You picked these knobs yourself (the knob button on a Deck setting), so they stay put through every scene and shuffle. Clear them to let each scene and shuffle bring its own again.', show: () => knobPicks().length > 0 },
  { kind: 'buttons', buttons: [['Clear my picked knobs', () => clearKnobPicks()]], show: () => knobPicks().length > 0 },
  { kind: 'toggle', key: 'knobsFollow', label: 'Knobs follow the scene (each scene and shuffle brings its own)' },
  { kind: 'choice', key: 'numberKeys', label: 'Number keys do', options: [['knobs', 'Knobs'], ['mine', 'My scenes']] },
  { kind: 'note', text: 'Hold 1–8 and scroll, swipe or move the mouse to turn knob A–H. Tap the key alone to open its slider.', show: () => settings.numberKeys === 'knobs' },
  { kind: 'note', text: 'Each scene and each shuffle sets knobs for what it is about (its shape, motion, lens…). Your set below plays when this is off.', show: () => settings.knobsFollow && !knobPicks().length },
  { kind: 'sub', label: 'Knob set' },
  { kind: 'buttons', buttons: KNOB_SETS.map(([name, keys]): [string, () => void] => [name, () => useKnobSet(keys)]), active: (t) => knobSetName() === t },
  ...KNOB_SETS.map(([name, , text]): Control => ({ kind: 'note', text, show: () => knobSetName() === name })),
  { kind: 'note', text: 'Your own mix. Pick a set above, or choose each knob below.', show: () => !knobSetName() },
  { kind: 'select', key: 'playLeft', label: 'Knob A', options: PLAYABLE },
  { kind: 'select', key: 'playWheel3', label: 'Knob B', options: PLAYABLE },
  { kind: 'select', key: 'playWheel4', label: 'Knob C', options: PLAYABLE },
  { kind: 'select', key: 'playRight', label: 'Knob D', options: PLAYABLE },
  { kind: 'select', key: 'playWheel5', label: 'Knob E', options: PLAYABLE },
  { kind: 'knobsmore' },
  { kind: 'note', text: 'Knobs A–E (and any you add) sit along the bottom of the field, left to right: slide a thumb up or right over one to turn it up (down or left turns it down), or hover the bottom edge to see them all. With a mouse: wheel = A, ⇧⌘ + wheel = B, ⇧⌥ + wheel = C, ⇧ + wheel = D, ⌥ + wheel = E (Ctrl or Alt on Windows).' },
  { kind: 'section', id: 'anim', label: 'Moving settings', tab: 'presets',
    about: 'Settings that move by themselves in time with the music: a swing around the knob, or keyframes you place or record.',
    summary: () => {
      const n = Object.keys(parseAnim(settings.anim)).length;
      return n ? `${n} moving` : 'none';
    } },
  { kind: 'animlist' },
  { kind: 'section', about: 'What your finger, two fingers and the mouse do on the field.', id: 'pointer', label: 'Touch & gestures', tab: 'presets', lock: ['pointerMode', 'radius', 'force', 'click', 'clickForce'],
    power: { on: () => hasPointer() || hasClick(), off: { pointerMode: 'none', click: 'none' }, start: { pointerMode: 'repel', click: 'ripple' } },
    summary: () => [hasPointer() ? label(POINTER_MODES, settings.pointerMode) : '', hasClick() ? label(CLICK_MODES, settings.click).replace(' (hold)', '') : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'sub', label: 'One finger (or the mouse)' },
  { kind: 'select', key: 'pointerMode', label: 'Drag / hover', options: POINTER_MODES },
  { kind: 'range', key: 'radius', label: 'Radius', min: 20, max: 400, step: 5, format: (v) => `${v}px`, show: hasPointer },
  { kind: 'range', key: 'force', label: 'Force', min: 0.05, max: 2, step: 0.05, format: (v) => v.toFixed(2), show: hasPointer },
  { kind: 'select', key: 'click', label: 'Hold / click', options: CLICK_MODES },
  { kind: 'range', key: 'clickForce', label: 'Strength', min: 0.2, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×`, show: hasClick },
  { kind: 'sub', label: 'Two fingers' },
  { kind: 'select', key: 'playTwo', label: 'Drag up / down', options: PLAYABLE },
  { kind: 'select', key: 'playPinch', label: 'Pinch', options: PLAYABLE },
  { kind: 'note', text: 'A quick sideways swipe plays the previous or next scene. Tap near the bottom edge for the bar.' },
  { kind: 'section', id: 'links', label: 'Connections', tab: 'presets',
    about: 'Link any input (music, face, hands, body, pointer) to any action or amount.',
    lock: ['links'],
    power: { on: () => settings.links !== '', off: { links: '' }, start: { links: 'kick>size@0.6' } },
    summary: () => {
      const n = parseLinks(settings.links).length;
      return n ? String(n) : 'off';
    } },
  { kind: 'links' },
  { kind: 'note', text: 'Music inputs need a sound source (Music tab).', show: () => linkNeed.audio && audio.source === 'off' },
  { kind: 'note', text: 'Face, hands and body inputs start the camera by themselves.', show: () => linkNeed.face || linkNeed.hands || linkNeed.pose },

  { kind: 'section', id: 'view', label: 'Screen fit', tab: 'presets',
    about: 'Fit the whole picture to a projector or another surface: move, zoom, turn or mirror it. It stays as you set it through every scene.',
    summary: () => (viewIsPlain() ? 'as is' : [settings.viewZoom !== 1 ? `${Math.round(settings.viewZoom * 100)}%` : '', settings.viewRot ? `${settings.viewRot}°` : '', settings.viewFlipH || settings.viewFlipV ? 'mirrored' : '', settings.viewX || settings.viewY ? 'moved' : ''].filter(Boolean).join(' · ')) },
  { kind: 'range', key: 'viewX', label: 'Move ←→', min: -0.5, max: 0.5, step: 0.005, format: signedPct },
  { kind: 'range', key: 'viewY', label: 'Move ↑↓', min: -0.5, max: 0.5, step: 0.005, format: signedPct },
  { kind: 'range', key: 'viewZoom', label: 'Zoom', min: 0.3, max: 3, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { kind: 'range', key: 'viewRot', label: 'Turn', min: -180, max: 180, step: 0.5, format: (v) => `${v}°` },
  { kind: 'toggle', key: 'viewFlipH', label: 'Mirror left ↔ right (rear projection)' },
  { kind: 'toggle', key: 'viewFlipV', label: 'Flip upside down (ceiling mount)' },
  { kind: 'buttons', buttons: [['Reset the fit', resetView]], show: () => !viewIsPlain() },
  { kind: 'note', text: 'The projector window, recordings and this screen all show the same fit.' },
  { kind: 'section', id: 'record', label: 'Record a clip', tab: 'presets',
    about: 'A video of the field to save or share: the picture and, if you like, the sound.',
    summary: () => (recorder.on ? 'recording' : recorder.clip ? 'clip ready' : RECORD_LENGTHS.find(([v]) => Number(v) === recorder.prefs.secs)![1]) },
  { kind: 'record' },

  { kind: 'section', id: 'look', label: 'Style', tab: 'look',
    lock: ['render', 'mixStyles', 'size', 'sizeVar', 'trail', 'glow', 'linkDist', 'ribbonLen', 'glyphSet', 'glyphText', 'glyphPick', 'glyphChange', 'glyphRate', 'glyphFont', 'glyphScale', 'glyphRotate'],
    summary: () => label(RENDERS, settings.render) },
  { kind: 'select', key: 'render', label: 'Style', options: RENDERS },
  { kind: 'multi', key: 'mixStyles', label: 'Mix of', options: MIXABLE, show: () => settings.render === 'mixed' },
  { kind: 'range', key: 'size', label: 'Size', min: 0.5, max: 6, step: 0.1, format: (v) => `${v.toFixed(1)}px` },
  { kind: 'range', key: 'trail', label: 'Trails', min: 0, max: 1, step: 0.01, format: pct },
  { kind: 'toggle', key: 'glow', label: 'Additive glow' },
  { kind: 'range', key: 'linkDist', label: 'Link distance', min: 20, max: 160, step: 5, format: (v) => `${v}px`, show: () => settings.render === 'links' },
  { kind: 'range', key: 'ribbonLen', label: 'Ribbon length', min: 4, max: 40, step: 1, format: (v) => `${v} steps`, show: () => usesRibbons() },
  { kind: 'note', text: 'Ribbons draw their own trails, so they look cleanest with Trails near 0.', show: () => usesRibbons() && settings.trail > 0.3 },
  { kind: 'more', label: 'More style' },
  { kind: 'select', key: 'glyphSet', label: 'Characters', options: [...Object.entries(GLYPH_SETS).map(([k, g]) => [k, g.label] as [string, string]), ['custom', 'Your own text']], show: isGlyphs },
  { kind: 'text', key: 'glyphText', label: 'Text', placeholder: 'Type characters or a word', show: () => isGlyphs() && settings.glyphSet === 'custom' },
  { kind: 'range', key: 'sizeVar', label: 'Size variety', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'all same' : pct(v)) },
  { kind: 'select', key: 'glyphPick', label: 'Each particle shows', options: [['random', 'A random glyph'], ['speed', 'By speed'], ['heading', 'By direction'], ['sequence', 'In order (spells it)']], show: isGlyphs },
  { kind: 'select', key: 'glyphChange', label: 'Glyphs change', options: [['fixed', 'Never'], ['flicker', 'Flicker'], ['beat', 'On the beat']], show: () => isGlyphs() && (settings.glyphPick === 'random') },
  { kind: 'range', key: 'glyphRate', label: 'Flicker rate', min: 0, max: 0.2, step: 0.005, format: pct, show: () => isGlyphs() && settings.glyphPick === 'random' && settings.glyphChange === 'flicker' },
  { kind: 'select', key: 'glyphFont', label: 'Font', options: [['mono', 'Monospace'], ['serif', 'Serif'], ['sans', 'Sans'], ['bold', 'Heavy']], show: isGlyphs },
  { kind: 'range', key: 'glyphScale', label: 'Glyph size', min: 0.5, max: 4, step: 0.1, format: (v) => `${v.toFixed(1)}×`, show: isGlyphs },
  { kind: 'select', key: 'glyphRotate', label: 'Rotation', options: [['none', 'Upright'], ['heading', 'Follow direction'], ['spin', 'Spin']], show: isGlyphs },

  { kind: 'section', id: 'colour', label: 'Colour', tab: 'look', lock: ['palette', 'colorBy', 'customColors', 'customBg'],
    summary: () => `${pal().label}, ${label(COLOR_BY, settings.colorBy)}` },
  { kind: 'select', key: 'palette', label: 'Palette', options: [...Object.entries(PALETTES).map(([k, p]) => [k, p.label] as [string, string]), ['custom', 'Custom…']] },
  { kind: 'colors', key: 'customColors', label: 'Colours (calm → hot)', show: () => settings.palette === 'custom' },
  { kind: 'color', key: 'customBg', label: 'Background', show: () => settings.palette === 'custom' },
  { kind: 'swatch' },
  { kind: 'range', key: 'hueShift', label: 'Hue shift', min: -180, max: 180, step: 1, format: (v) => (v ? `${v > 0 ? '+' : ''}${Math.round(v)}°` : 'off') },
  { kind: 'select', key: 'colorBy', label: 'Colour by', options: COLOR_BY },

  { kind: 'section', id: 'lens', label: 'Lens', tab: 'look', about: 'Reshape the whole picture: kaleidoscope, mirror, tiles, zoom, twirl, waves, ripples, shatter, glow and more.',
    lock: ['audioKaleido', 'audioKaleidoDrop', 'lensMirror', 'lensTiles', 'lensZoom', 'lensSplit', 'lensGlitch', 'lensDots', 'lensMusic', 'lensTwirl', 'lensWave', 'lensRipple', 'lensFan', 'lensShatter', 'lensSlices', 'lensEcho', 'lensGlow', 'lensCrt'],
    power: { on: () => settings.audioKaleido > 0 || settings.audioKaleidoDrop || lensOn(),
      off: { audioKaleido: 0, audioKaleidoDrop: false, lensMirror: 'off', lensTiles: 0, lensZoom: 0, lensSplit: 0, lensGlitch: 0, lensDots: 0, lensTwirl: 0, lensWave: 0, lensRipple: 0, lensFan: 0, lensShatter: 0, lensSlices: 0, lensEcho: 0, lensGlow: 0, lensCrt: 0 }, start: { audioKaleido: 6 } },
    summary: () => [settings.audioKaleido > 0 ? `kaleidoscope ×${settings.audioKaleido}` : settings.audioKaleidoDrop ? 'kaleidoscope on drops' : '', settings.lensMirror !== 'off' ? 'mirror' : '', settings.lensTiles >= 2 ? `tiles ${settings.lensTiles}×${settings.lensTiles}` : '', settings.lensZoom > 0 ? 'infinite zoom' : '', settings.lensSplit > 0 ? 'colour split' : '', settings.lensGlitch > 0 ? 'glitch' : '', settings.lensDots > 0 ? 'LED dots' : '', ...LENS_MORE.filter(([k]) => settings[k] > 0).map(([, n]) => n.toLowerCase())].filter(Boolean).join(' · ') || 'off' },
  { kind: 'mixgrid', which: 'lens' },
  { kind: 'range', key: 'audioKaleido', label: 'Kaleidoscope', min: 0, max: 8, step: 2, format: (v) => (v === 0 ? 'off' : `${v} sides`) },
  { kind: 'toggle', key: 'audioKaleidoDrop', label: 'Kaleidoscope for 2 bars at each drop (music)', show: () => settings.audioKaleido === 0 },
  { kind: 'select', key: 'lensMirror', label: 'Mirror', options: [['off', 'Off'], ['lr', 'Left ↔ right'], ['tb', 'Top ↕ bottom'], ['quad', 'Four ways']] },
  { kind: 'range', key: 'lensTiles', label: 'Tiles', min: 0, max: 6, step: 1, format: (v) => (v < 2 ? 'off' : `${v} × ${v}`) },
  { kind: 'range', key: 'lensZoom', label: 'Infinite zoom', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'lensSplit', label: 'Colour split', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'lensGlitch', label: 'Glitch', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'lensDots', label: 'LED dots', min: 0, max: 24, step: 1, format: (v) => (v === 0 ? 'off' : `${v}px`) },
  { kind: 'sub', label: 'Twists and warps' },
  ...LENS_MORE.slice(0, 4).map(([key, label]): Control => ({ kind: 'range', key, label, min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) })),
  { kind: 'sub', label: 'Breaking it up' },
  ...LENS_MORE.slice(4, 6).map(([key, label]): Control => ({ kind: 'range', key, label, min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) })),
  { kind: 'sub', label: 'Light' },
  ...LENS_MORE.slice(6).map(([key, label]): Control => ({ kind: 'range', key, label, min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) })),
  { kind: 'sub', label: 'Music' },
  { kind: 'range', key: 'lensMusic', label: 'Moves with the music', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'note', text: 'They stack, in this order. With music (Moves with the music): the zoom surges on kicks, the kaleidoscope turns with the bass and reverses at a drop (two extra sides for two bars), tiles step 2 → 3 → 4 every few bars, the mirror swaps at each drop, dots swell and colours split on the kick, the glitch fires on beats. The twirl spins and winds tighter on kicks, waves swell with the bass, a ripple goes out on each kick, shards burst at a drop, echoes flash and the glow breathes. Without music they drift by themselves. Every one can go on a knob (Field knobs & gestures).' },

  { kind: 'section', about: 'Near and far layers, with parallax.', id: 'depth', label: '3D depth', tab: 'look', lock: ['depth', 'depthParallax'],
    power: { on: () => settings.depth > 0, off: { depth: 0 }, start: { depth: 0.7, depthParallax: 0.5 } },
    summary: () => (settings.depth > 0 ? `${pct(settings.depth)}${settings.depthParallax > 0 ? ', parallax' : ''}` : 'off') },
  { kind: 'range', key: 'depth', label: '3D depth', min: 0, max: 2, step: 0.05, format: (v) => (v === 0 ? 'flat' : pct(v)) },
  { kind: 'range', key: 'depthParallax', label: 'Parallax', min: 0, max: 2, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)), show: () => settings.depth > 0 },
  { kind: 'note', text: 'Far particles are smaller, dimmer and slower; near ones react more to the pointer. Past 100% it exaggerates: tiny faint far layers, big bright near ones. Parallax shifts the layers as the pointer moves (or slowly by itself).', show: () => settings.depth > 0 },

  { kind: 'section', about: 'Particles form a word, an image or a pattern.', id: 'shape', label: 'Shape', tab: 'shape', lock: ['shapeX', 'shapeY', 'shapeAngle', 'shapeTilt', 'shapeFacing', 'shape', 'shapeText', 'shapeIcon', 'shapeGeo', 'shapePattern', 'patScale', 'patForm', 'patVary', 'patSeed', 'shapeSolid', 'shapeLive', 'shapeSeq', 'shapeSeqEvery', 'shapeSeqSec', 'shapeSpin', 'imageMode', 'shapeSize', 'shapeCycle', 'entrance', 'entranceTime'],
    power: { on: hasShape, off: { shape: 'none' }, start: { shape: 'text' } },
    summary: () => (settings.shape === 'none' ? 'off' : settings.shape === 'text' ? `“${settings.shapeText}”` : settings.shape === 'icon' ? label(ICON_SHAPES, settings.shapeIcon) : settings.shape === 'geo' ? label(GEO_SHAPES, settings.shapeGeo) : settings.shape === 'solid' ? label(SOLID_SHAPES, settings.shapeSolid) : settings.shape === 'pattern' ? label(PATTERNS, settings.shapePattern) : settings.shape === 'live' ? label(LIVE_SHAPES, settings.shapeLive) : label(SHAPES, settings.shape)) },
  { kind: 'select', key: 'shape', label: 'Particles form', options: SHAPES },
  { kind: 'note', text: 'How the camera forms you (face, hands or body) is on the Camera tab.', show: isCam },
  { kind: 'text', key: 'shapeText', label: 'Text', placeholder: 'Type a word', show: () => settings.shape === 'text' },
  { kind: 'note', text: 'Symbols work too: try ★ ♥ ☾ ✿ ☮ or an emoji.', show: () => settings.shape === 'text' },
  { kind: 'select', key: 'shapeIcon', label: 'Icon', options: ICON_SHAPES, show: () => settings.shape === 'icon' },
  { kind: 'select', key: 'shapeGeo', label: 'Shape', options: GEO_SHAPES, show: () => settings.shape === 'geo' },
  { kind: 'select', key: 'shapePattern', label: 'Pattern', options: PATTERNS, show: () => settings.shape === 'pattern' },
  { kind: 'range', key: 'patScale', label: 'Pattern scale', min: 0.4, max: 2.5, step: 0.05, format: (v) => `${v.toFixed(2)}×`, show: () => settings.shape === 'pattern' && isFillPattern(settings.shapePattern) },
  ...FILL_PATTERNS.map(([p]): Control => ({ kind: 'range', key: 'patForm', label: PATTERN_FORM[p], min: 0, max: 1, step: 0.02, format: p === 'spiral' || p === 'galaxy' ? (v) => `${patternArms(v)}` : pct, show: () => settings.shape === 'pattern' && settings.shapePattern === p })),
  ...FILL_PATTERNS.map(([p]): Control => ({ kind: 'range', key: 'patVary', label: PATTERN_VARY[p], min: 0, max: 1, step: 0.02, format: pct, show: () => settings.shape === 'pattern' && settings.shapePattern === p })),
  { kind: 'buttons', buttons: [['New seed', () => set('patSeed', settings.patSeed + 1)]], show: () => settings.shape === 'pattern' && isFillPattern(settings.shapePattern) },
  { kind: 'select', key: 'shapeSolid', label: 'Solid', options: SOLID_SHAPES, show: () => settings.shape === 'solid' },
  { kind: 'select', key: 'shapeLive', label: 'Show', options: LIVE_SHAPES, show: () => settings.shape === 'live' },
  { kind: 'range', key: 'shapeSpin', label: 'Turning', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'still' : pct(v)), show: () => settings.shape === 'geo' || settings.shape === 'solid' || (settings.shape === 'live' && settings.shapeLive === 'ring') },
  { kind: 'note', text: '3D shapes look best with 3D depth on (Look tab); it turns on with them.', show: () => settings.shape === 'solid' },
  { kind: 'note', text: 'The bars and the ring follow the sound source on the Music tab; without sound they rest flat.', show: () => settings.shape === 'live' && (settings.shapeLive === 'bars' || settings.shapeLive === 'ring') },
  { kind: 'text', key: 'shapeSeq', label: 'Sequence', placeholder: 'heart, star, LOVE', show: () => settings.shape === 'sequence' },
  { kind: 'select', key: 'shapeSeqEvery', label: 'Next one', options: [['bar', 'Every bar'], ['2bars', 'Every 2 bars'], ['4bars', 'Every 4 bars'], ['8bars', 'Every 8 bars'], ['drop', 'Only on drops']], show: () => settings.shape === 'sequence' },
  { kind: 'range', key: 'shapeSeqSec', label: 'Hold each (no music)', min: 1, max: 20, step: 0.5, format: (v) => `${v}s`, show: () => settings.shape === 'sequence' },
  { kind: 'note', text: `Words and icons, separated by commas. Icons: ${ICON_SHAPES.map(([k]) => k).join(', ')}.`, show: () => settings.shape === 'sequence' },
  { kind: 'buttons', buttons: [['Draw on the field', toggleDraw], ['Undo stroke', undoStroke], ['Clear', clearShapeDrawing]], active: (t) => t === 'Draw on the field' && drawMode, show: () => settings.shape === 'drawing' },
  { kind: 'toggle', key: 'drawOutline', label: 'Show the outline', show: () => settings.shape === 'drawing' },
  { kind: 'note', text: 'Press Draw, then draw with your mouse or finger; the particles take the shape as you go. The line you draw fades after a moment (Show the outline keeps it). Press Draw again to play with the field. Your drawing is kept on this device.', show: () => settings.shape === 'drawing' },
  { kind: 'buttons', buttons: [['Choose an image or SVG…', () => imageInput.click()]], show: () => settings.shape === 'image' },
  { kind: 'select', key: 'imageMode', label: 'Use', options: [['auto', 'Auto'], ['subject', 'Subject (logo on a plain background)'], ['bright', 'Bright parts'], ['dark', 'Dark parts'], ['edges', 'Outlines']], show: () => settings.shape === 'image' },
  { kind: 'note', text: 'Photos work best with Bright parts, Dark parts or Outlines: particles gather more densely where the image is brighter, darker or has edges. The image is used for this session only.', show: () => settings.shape === 'image' },
  { kind: 'range', key: 'shapeSize', label: 'Shape size', min: 0.2, max: 1, step: 0.05, format: pct, show: hasShape },
  { kind: 'range', key: 'shapeX', label: 'Position ←→', min: -0.5, max: 0.5, step: 0.01, format: signedPct, show: hasShape },
  { kind: 'range', key: 'shapeY', label: 'Position ↑↓', min: -0.5, max: 0.5, step: 0.01, format: signedPct, show: hasShape },
  { kind: 'range', key: 'shapeAngle', label: 'Angle', min: -180, max: 180, step: 1, format: (v) => `${v}°`, show: hasShape },
  { kind: 'range', key: 'shapeTilt', label: 'Tilt', min: -60, max: 60, step: 1, format: (v) => `${v}°`, show: () => settings.shape === 'solid' },
  { kind: 'range', key: 'shapeFacing', label: 'Facing', min: -180, max: 180, step: 1, format: (v) => `${v}°`, show: () => settings.shape === 'solid' },
  { kind: 'buttons', buttons: [['Arrange on the field', () => toggleArrange()], ['Centre it', resetPlacement]], active: (t) => t === 'Arrange on the field' && arranging, show: hasShape },
  { kind: 'select', key: 'entrance', label: 'Entrance', options: ENTRANCES, show: () => hasShape() && !isCam() },
  { kind: 'range', key: 'entranceTime', label: 'Entrance time', min: 0.5, max: 8, step: 0.5, format: (v) => `${v}s`, show: () => hasShape() && !isCam() && settings.entrance !== 'formed' && settings.entrance !== 'scatter' },
  { kind: 'buttons', buttons: [['Play entrance', () => playEntrance()]], show: () => hasShape() && !isCam() && settings.entrance !== 'scatter' },
  { kind: 'note', text: 'How the shape forms when the page opens. Scattered is the old free-for-all.', show: () => hasShape() && !isCam() },
  { kind: 'range', key: 'shapeCycle', label: 'Form & dissolve', min: 0, max: 20, step: 0.5, format: (v) => (v === 0 ? 'always formed' : `every ${v}s`), show: hasShape },
  { kind: 'note', text: 'Push particles with the pointer, clicks or the beat; they spring back home. Flow and forces still act, so lower them for a crisp shape.', show: hasShape },

  { kind: 'section', about: 'Lifespans, emitters and launch speed.', id: 'life', label: 'Birth & lifespan', tab: 'shape',
    lock: ['lifespan', 'lifeSize', 'lifeFade', 'launchSpeed', 'launchDir', 'launchSpread', 'emitter', 'emitMode', 'emitX', 'emitY', 'emitSize', 'emitAngle', 'emitRate', 'burstEvery', 'burstSize', 'emitOut'],
    power: { on: () => settings.lifespan > 0 || hasEmitter() || settings.launchSpeed > 0, off: { lifespan: 0, emitter: 'none', launchSpeed: 0 }, start: { lifespan: 6, lifeFade: 'swell' } },
    summary: () => [settings.lifespan > 0 ? `~${settings.lifespan}s life` : '', hasEmitter() ? label(EMITTERS, settings.emitter).toLowerCase() : '', settings.launchSpeed > 0 ? 'launched' : ''].filter(Boolean).join(', ') || 'off' },
  { kind: 'range', key: 'lifespan', label: 'Lifespan', min: 0, max: 20, step: 0.5, format: (v) => (v === 0 ? 'endless' : `~${v}s`) },
  { kind: 'select', key: 'emitter', label: 'Born from', options: EMITTERS },
  { kind: 'select', key: 'emitMode', label: 'Release', options: EMIT_MODES, show: hasEmitter },
  { kind: 'range', key: 'emitRate', label: 'Rate', min: 0.02, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}% / s`, show: () => hasEmitter() && settings.emitMode === 'steady' },
  { kind: 'range', key: 'burstEvery', label: 'Burst every', min: 0.3, max: 8, step: 0.1, format: (v) => `${v.toFixed(1)}s`, show: () => hasEmitter() && settings.emitMode === 'burst' },
  { kind: 'range', key: 'burstSize', label: 'Burst size', min: 0.02, max: 1, step: 0.01, format: pct, show: () => hasEmitter() && settings.emitMode !== 'steady' },
  { kind: 'note', text: 'Bursts on each kick drum; turn on Audio first.', show: () => hasEmitter() && settings.emitMode === 'beat' && audio.source === 'off' },
  { kind: 'range', key: 'emitX', label: 'Position ←→', min: 0, max: 1, step: 0.01, format: pct, show: () => hasEmitter() && !['edges', 'pointer'].includes(settings.emitter) },
  { kind: 'range', key: 'emitY', label: 'Position ↑↓', min: 0, max: 1, step: 0.01, format: pct, show: () => hasEmitter() && !['edges', 'pointer'].includes(settings.emitter) },
  { kind: 'range', key: 'emitSize', label: 'Size', min: 10, max: 600, step: 5, format: (v) => `${v}px`, show: () => ['line', 'circle', 'ring'].includes(settings.emitter) },
  { kind: 'range', key: 'emitAngle', label: 'Line angle', min: 0, max: 179, step: 1, format: (v) => `${v}°`, show: () => settings.emitter === 'line' },
  { kind: 'more', label: 'More birth settings' },
  { kind: 'select', key: 'lifeSize', label: 'Size over life', options: [['none', 'Stays the same'], ['grow', 'Grows'], ['shrink', 'Shrinks'], ['swell', 'Swells then shrinks']], show: () => settings.lifespan > 0 },
  { kind: 'select', key: 'lifeFade', label: 'Fade over life', options: [['edges', 'Quick fade in and out'], ['out', 'Bright at birth, fades out'], ['swell', 'Slow fade in and out'], ['flash', 'Flash at birth']], show: () => settings.lifespan > 0 },
  { kind: 'note', text: 'Tip: set Colour by → Age to shift colour from birth (calm end) to old age (hot end).', show: () => settings.lifespan > 0 && settings.colorBy !== 'age' },
  { kind: 'range', key: 'launchSpeed', label: 'Launch speed', min: 0, max: 6, step: 0.1, format: (v) => (v === 0 ? 'still' : v.toFixed(1)) },
  { kind: 'range', key: 'launchDir', label: 'Launch direction', min: 0, max: 359, step: 1, format: (v) => `${'→↘↓↙←↖↑↗'[Math.round(v / 45) % 8]} ${v}°`, show: () => settings.launchSpeed > 0 && settings.launchSpread < 360 },
  { kind: 'range', key: 'launchSpread', label: 'Spread', min: 0, max: 360, step: 5, format: (v) => (v >= 360 ? 'all directions' : `${v}°`), show: () => settings.launchSpeed > 0 },
  { kind: 'note', text: 'Launch applies whenever a particle is born: on Scatter, with a Lifespan, and from an emitter.' },
  { kind: 'toggle', key: 'emitOut', label: 'Shoot outwards (else use Launch)', show: hasEmitter },
  { kind: 'note', text: 'Tip: Forces → Click places → Emitter position, then click the field.', show: () => hasEmitter() && !['edges', 'pointer'].includes(settings.emitter) },

  { kind: 'section', id: 'particles', label: 'Particles', tab: 'motion', lock: ['count', 'speed', 'friction', 'jitter', 'edges', 'renew'],
    summary: () => `${settings.count.toLocaleString()}, ${settings.speed.toFixed(1)}× speed` },
  { kind: 'range', key: 'count', label: 'Count', min: 100, max: 8000, step: 100 },
  { kind: 'range', key: 'speed', label: 'Speed', min: 0.1, max: 4, step: 0.1, format: (v) => `${v.toFixed(1)}×` },
  { kind: 'range', key: 'friction', label: 'Friction', min: 0, max: 0.2, step: 0.005, format: pct },
  { kind: 'more', label: 'More settings' },
  { kind: 'range', key: 'jitter', label: 'Jitter', min: 0, max: 0.5, step: 0.01, format: (v) => v.toFixed(2) },
  { kind: 'range', key: 'renew', label: 'Keep fresh', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : `~${Math.round(20 / v)}s cycle`) },
  { kind: 'note', text: 'Keep fresh quietly fades a few particles out and back in somewhere new, so currents and forces can\'t gather everything into a few lines over time. Off with a shape, an emitter or a lifespan, which renew particles already.', show: () => settings.renew > 0 },
  { kind: 'select', key: 'edges', label: 'Off-screen', options: [['wrap', 'Wrap to the other side'], ['enter', 'Re-enter with the flow'], ['bounce', 'Bounce off the edges']] },

  { kind: 'section', about: 'Invisible currents that carry the particles.', id: 'flow', label: 'Flow', tab: 'motion', lock: ['flow', 'flowType', 'flowScale', 'flowSpeed'],
    power: { on: hasFlow, off: { flow: 0 }, start: { flow: 0.6, flowType: 'curl' } },
    summary: () => (hasFlow() ? `${(label(FLOW_TYPES, settings.flowType).split(' (')[0] || settings.flowType).toLowerCase()} ${settings.flow.toFixed(2)}` : 'off') },
  { kind: 'range', key: 'flow', label: 'Strength', min: 0, max: 2, step: 0.05, format: (v) => (v === 0 ? 'off' : v.toFixed(2)) },
  { kind: 'select', key: 'flowType', label: 'Type', options: FLOW_TYPES, show: hasFlow },
  { kind: 'more', label: 'More settings' },
  { kind: 'range', key: 'flowScale', label: 'Scale', min: 0.001, max: 0.02, step: 0.0005, format: (v) => (v * 1000).toFixed(1), show: hasFlow },
  { kind: 'range', key: 'flowSpeed', label: 'Turning', min: 0, max: 2, step: 0.05, format: (v) => v.toFixed(2), show: hasFlow },

  { kind: 'section', about: 'Gravity, wind and points that pull, push or swirl.', id: 'forces', label: 'Forces', tab: 'motion', lock: ['gravity', 'wind', 'windDir', 'wells', 'wellForce', 'wellRange'],
    power: { on: () => settings.gravity !== 0 || settings.wind > 0 || wellList().length > 0, off: { gravity: 0, wind: 0, wells: '', placeWell: 'off' }, start: { wind: 0.2 } },
    summary: () => [settings.gravity !== 0 ? 'gravity' : '', settings.wind > 0 ? `wind ${settings.wind.toFixed(2)}` : '', wellList().length ? `${wellList().length} point${wellList().length > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ') || 'off' },
  { kind: 'range', key: 'gravity', label: 'Gravity', min: -1, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : v > 0 ? `↓ ${v.toFixed(2)}` : `↑ ${(-v).toFixed(2)}`) },
  { kind: 'range', key: 'wind', label: 'Wind', min: 0, max: 1, step: 0.02, format: (v) => (v === 0 ? 'off' : v.toFixed(2)) },
  { kind: 'range', key: 'windDir', label: 'Wind direction', min: 0, max: 359, step: 1, format: (v) => `${'→↘↓↙←↖↑↗'[Math.round(v / 45) % 8]} ${v}°`, show: () => settings.wind > 0 },
  { kind: 'select', key: 'placeWell', label: 'Click places', options: [['off', 'Nothing (normal click)'], ['attract', 'Attractor'], ['repel', 'Repeller'], ['vortex', 'Vortex'], ['emitter', 'Emitter position']] },
  { kind: 'note', text: 'Click the field to drop a point, click a point again to remove it.', show: () => settings.placeWell !== 'off' },
  { kind: 'range', key: 'wellForce', label: 'Point strength', min: 0.1, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×`, show: () => wellList().length > 0 || settings.placeWell !== 'off' },
  { kind: 'range', key: 'wellRange', label: 'Point reach', min: 50, max: 600, step: 10, format: (v) => `${v}px`, show: () => wellList().length > 0 || settings.placeWell !== 'off' },
  { kind: 'toggle', key: 'showWells', label: 'Show the points', show: () => wellList().length > 0 },
  { kind: 'buttons', buttons: [['Remove all points', () => setWells([])]], show: () => wellList().length > 0 },

  { kind: 'section', about: 'Flocking like birds, or keeping personal space.', id: 'swarm', label: 'Swarm', tab: 'motion', lock: ['flock', 'flockSep', 'flockAlign', 'flockCohesion', 'flockRange', 'space', 'spaceDist'],
    power: { on: () => settings.flock > 0 || settings.space > 0, off: { flock: 0, space: 0 }, start: { flock: 1, flockAlign: 1.2, flockCohesion: 1, flockSep: 0.8, flockRange: 45 } },
    summary: () => [settings.flock > 0 ? 'flocking' : '', settings.space > 0 ? 'spaced' : ''].filter(Boolean).join(', ') || 'off' },
  { kind: 'range', key: 'flock', label: 'Flocking', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'space', label: 'Personal space', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'note', text: 'Flocking works best with little or no Flow, and Pixels, Arrows or Comets.', show: () => settings.flock > 0 },
  { kind: 'more', label: 'More settings' },
  { kind: 'range', key: 'flockAlign', label: 'Follow neighbours', min: 0, max: 2, step: 0.05, format: (v) => `${v.toFixed(2)}×`, show: () => settings.flock > 0 },
  { kind: 'range', key: 'flockCohesion', label: 'Stay together', min: 0, max: 2, step: 0.05, format: (v) => `${v.toFixed(2)}×`, show: () => settings.flock > 0 },
  { kind: 'range', key: 'flockSep', label: 'Avoid crowding', min: 0, max: 2, step: 0.05, format: (v) => `${v.toFixed(2)}×`, show: () => settings.flock > 0 },
  { kind: 'range', key: 'flockRange', label: 'Sees as far as', min: 15, max: 100, step: 1, format: (v) => `${v}px`, show: () => settings.flock > 0 },
  { kind: 'range', key: 'spaceDist', label: 'Spacing', min: 4, max: 40, step: 1, format: (v) => `${v}px`, show: () => settings.space > 0 },

  { kind: 'section', about: 'Circles or a word the particles flow around.', id: 'obstacles', label: 'Obstacles', tab: 'motion', lock: ['obstacles', 'obsCircles', 'obsRadius', 'obsText', 'obsSize', 'obsForce', 'obsShow'],
    power: { on: () => settings.obstacles !== 'none', off: { obstacles: 'none' }, start: { obstacles: 'circles' } },
    summary: () => (settings.obstacles === 'circles' ? `${obCircleList().length} circles` : settings.obstacles === 'text' ? `“${settings.obsText}”` : settings.obstacles === 'body' ? 'your silhouette' : 'off') },
  { kind: 'select', key: 'obstacles', label: 'Obstacle', options: [['circles', 'Circles'], ['text', 'A word'], ['body', 'Your silhouette (camera)']] },
  { kind: 'range', key: 'camRate', label: 'Silhouette updates per second', min: 1, max: 15, step: 1, show: bodyObs },
  { kind: 'toggle', key: 'obsPlace', label: 'Click places or removes circles', show: () => settings.obstacles === 'circles' },
  { kind: 'range', key: 'obsRadius', label: 'Circle size', min: 15, max: 220, step: 5, format: (v) => `${v}px`, show: () => settings.obstacles === 'circles' },
  { kind: 'text', key: 'obsText', label: 'Word', placeholder: 'Type a word', show: () => settings.obstacles === 'text' },
  { kind: 'range', key: 'obsSize', label: 'Word size', min: 0.2, max: 1, step: 0.05, format: pct, show: () => settings.obstacles === 'text' },
  { kind: 'range', key: 'obsForce', label: 'Push', min: 0.2, max: 2, step: 0.1, format: (v) => `${v.toFixed(1)}×` },
  { kind: 'toggle', key: 'obsShow', label: 'Show obstacles' },
  { kind: 'note', text: 'Works best with Flow or Wind on, so there is a current to part around them.' },

  { kind: 'section', id: 'audio', label: 'Sound source', tab: 'music', summary: () => AUDIO_LABELS[audio.source] + (audio.source === 'off' ? '' : ` · ${GENRES.find(([k]) => k === settings.audioGenre)?.[1]}`) },
  { kind: 'audio' },
  { kind: 'sub', label: 'Genre' },
  { kind: 'choice', key: 'audioGenre', label: 'Genre', options: GENRES },
  { kind: 'note', text: 'Tunes how kicks, snares, hats and 808s are picked out.' },
  { kind: 'sub', label: 'Vocals' },
  { kind: 'choice', key: 'audioVox', label: 'Vocals', options: [['auto', 'Auto'], ['sung', 'Singing'], ['speech', 'Rap & speech']] },
  { kind: 'note', text: 'Singing follows a held, gliding pitch. Rap & speech also counts syllables. Auto picks Rap & speech for Rap / drill.' },
  { kind: 'sub', label: 'Sync' },
  { kind: 'range', key: 'audioSync', label: 'Delay reactions', min: 0, max: 500, step: 10, format: (v) => (v === 0 ? 'off' : `${v} ms`) },
  { kind: 'buttons', buttons: [['Tap along to set it', () => calibrateSync()]] },
  { kind: 'note', text: 'Bluetooth headphones play the sound 150–250 ms after the field hears it, so reactions land early. Tap along to the kick and the delay is set for you.' },

  { kind: 'section', id: 'vibe', label: 'Vibe', tab: 'music', summary: vibeLabel },
  { kind: 'note', text: 'Vibes are how the music moves the field, so they show once a sound source is on (above).', show: () => audio.source === 'off' },
  { kind: 'vibes' },
  { kind: 'range', key: 'audioIntensity', label: 'Intensity', min: 0, max: 2, step: 0.05, format: pct },
  { kind: 'toggle', key: 'audioVibeLook', label: 'Vibes also change the look' },
  { kind: 'note', text: 'Off: a vibe only changes cards on this Music tab. On: it can also set style, size, trails, glow, palette, flow and the Lens (kaleidoscope), and some vibes bring a scene that suits them (a face vibe, a face scene). Each pick says what it switched on, with Undo.' },
  { kind: 'note', text: 'A vibe sets the drums and the cards below (switching them on or off). Lock a card to keep it as it is when you change vibe. With the switch above off, a vibe never changes the scene.' },
  { kind: 'note', text: 'This vibe plays on your face, and the scene isn’t a face yet.', show: () => currentVibe()?.family === 'face' && !faceScene() },
  { kind: 'buttons', buttons: [['Use a face scene', () => { const v = currentVibe(); if (v) vibeScene(v); }]], show: () => currentVibe()?.family === 'face' && !faceScene() },

  { kind: 'section', id: 'mgmusic', label: 'Reactions', tab: 'music', about: 'What each part of the music does to the field. Tap a cell to step it, slide sideways for exact strength, hold for flavours.' },
  { kind: 'mixgrid', which: 'music' },
  { kind: 'section', id: 'vj', label: 'Auto VJ', tab: 'music', about: 'Switches to a new look every few bars, in time with the music.', lock: ['audioVj', 'audioVjFrom', 'audioVjDrop'],
    power: { on: () => settings.audioVj > 0, off: { audioVj: 0 }, start: { audioVj: 8 } },
    summary: () => (settings.audioVj > 0 ? `every ${settings.audioVj} bars` : 'off') },
  { kind: 'note', text: 'Turn on a sound source in the Audio card first.', show: () => audio.source === 'off' },
  { kind: 'range', key: 'audioVj', label: 'Every', min: 1, max: 32, step: 1, format: (v) => `${v} bar${v > 1 ? 's' : ''}` },
  { kind: 'select', key: 'audioVjFrom', label: 'Switch to', options: [['mine', 'My scenes (keyed ones in order)'], ['presets', 'Random library scenes'], ['shuffle', 'Shuffle (keeps locks)']] },
  { kind: 'toggle', key: 'audioVjDrop', label: 'Also switch on every drop' },
  { kind: 'note', text: 'Uses Morph time (Transitions card, Scenes tab) for the change.' },

  { kind: 'heading', label: 'Hits', tab: 'music' },
  { kind: 'section', id: 'drums', label: 'Drums', tab: 'music',
    lock: ['audioKick', 'audioPulse', 'audioBeat', 'audioWaveAt', 'audioWaveEvery', 'audioWaveForce', 'audioWaveSpeed', 'audioWaveReach', 'audioWaveWidth', 'audioWaveFeel', 'audioWaveRings', 'audioWaveAccent', 'audioSnare', 'audioHats', 'audioHits', 'audioSub', 'audioSubAmt', 'audioBassThrob', 'audioNoteRipple', 'audioSpeed', 'audioFlow'],
    summary: () => [label([['pulse', 'pulse'], ['wave', 'waves'], ['both', 'pulse + waves'], ['pump', 'pump'], ['tick', 'tick'], ['spawn', 'spawn'], ['none', '']], settings.audioKick), settings.audioSnare !== 'none' ? `snare ${settings.audioSnare}` : '', settings.audioHats !== 'none' ? 'hats' : ''].filter(Boolean).join(' · ') },
  { kind: 'sub', label: 'Kick' },
  { kind: 'select', key: 'audioKick', label: 'Kick does', options: [['pulse', 'Pulse the field'], ['wave', 'Send a wave'], ['both', 'Pulse + wave'], ['pump', 'Pump: duck and swell back'], ['tick', 'Tick: turn the flow a step'], ['spawn', 'Spawn: a puff of new particles'], ['none', 'Nothing']], show: ft },
  { kind: 'range', key: 'audioPulse', label: 'Kick strength', min: 0, max: 2, step: 0.05, format: pct, show: () => ft() && settings.audioKick !== 'none' && settings.audioKick !== 'wave' },
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
  { kind: 'range', key: 'audioBassThrob', label: 'Throb with the bass', min: 0, max: 2, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioNoteRipple', label: 'Ripple on melody notes', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'sub', label: 'Overall energy', show: ft },
  { kind: 'range', key: 'audioSpeed', label: 'Speed with energy', min: 0, max: 2, step: 0.05, format: pct, show: ft },
  { kind: 'range', key: 'audioFlow', label: 'Flow stir', min: 0, max: 2, step: 0.05, format: pct, show: ft },

  { kind: 'section', id: 'drops', label: 'Drops', tab: 'music', about: 'Build-ups pull the field in, the drop blows it apart.', lock: ['audioDrop', 'audioDropBuild'],
    power: { on: () => settings.audioDrop > 0, off: { audioDrop: 0 }, start: { audioDrop: 1 } },
    summary: () => (settings.audioDrop > 0 ? `${pct(settings.audioDrop)}${audio.source !== 'off' && audio.levels.tension > 0.1 ? ' · building' : ''}` : 'off') },
  { kind: 'note', text: 'Turn on a sound source in the Audio card first.', show: () => audio.source === 'off' },
  { kind: 'range', key: 'audioDrop', label: 'Drop strength', min: 0.1, max: 2, step: 0.05, format: pct },
  { kind: 'toggle', key: 'audioDropBuild', label: 'Build-ups pull in and shiver' },
  { kind: 'note', text: 'A drop is the first kick back after a break or build-up (the kick gone for ~2 s, rising energy, or a snare roll).' },

  { kind: 'section', id: 'bands', label: 'Frequency groups', tab: 'music', about: 'Bass, mid and high particles each move to their own part.', lock: ['audioBands'],
    power: { on: () => settings.audioBands > 0, off: { audioBands: 0 }, start: { audioBands: 0.7 } },
    summary: () => (settings.audioBands > 0 ? pct(settings.audioBands) : 'off') },
  { kind: 'note', text: 'Turn on a sound source in the Audio card first.', show: () => audio.source === 'off' },
  { kind: 'range', key: 'audioBands', label: 'Separation', min: 0.05, max: 1, step: 0.05, format: pct },
  { kind: 'note', text: 'A third of the particles are bass: big, swell with the bass, thrown by kicks. A third are mids: swirl with snares. The rest are highs: small, sparkle with hats. Try Colour by → Frequency group.' },

  { kind: 'heading', label: 'Colour', tab: 'music' },
  { kind: 'section', id: 'mcolour', label: 'Music colour', tab: 'music', about: 'Hue shifts, new palettes per section, flashes and colour that drains in a build-up.',
    lock: ['audioHue', 'audioHueAmt', 'audioBright', 'audioPalEvery', 'audioMonoBuild', 'audioBgFlash', 'audioInvert', 'audioSnareFlash', 'audioHatTwinkle', 'audioBassGlow', 'audioNoteHue', 'audioVoxGlow'],
    power: { on: () => settings.audioHue !== 'off' || settings.audioBright > 0 || settings.audioPalEvery > 0 || settings.audioMonoBuild || settings.audioBgFlash > 0 || settings.audioInvert || settings.audioSnareFlash > 0 || settings.audioHatTwinkle > 0 || settings.audioBassGlow > 0 || settings.audioNoteHue > 0 || settings.audioVoxGlow > 0,
      off: { audioHue: 'off', audioBright: 0, audioPalEvery: 0, audioMonoBuild: false, audioBgFlash: 0, audioInvert: false, audioSnareFlash: 0, audioHatTwinkle: 0, audioBassGlow: 0, audioNoteHue: 0, audioVoxGlow: 0 }, start: { audioHue: 'bar', audioBright: 0.4 } },
    summary: () => [
      settings.audioHue !== 'off' ? `shift ${label([['beat', 'per beat'], ['bar', 'per bar'], ['drift', 'drifting'], ['drop', 'on drops']], settings.audioHue)}` : '',
      settings.audioPalEvery > 0 ? `palette every ${settings.audioPalEvery}` : '',
      settings.audioMonoBuild ? 'mono build' : '', settings.audioBgFlash > 0 ? 'flash' : '', settings.audioInvert ? 'invert' : '',
      settings.audioHue === 'off' && settings.audioBright > 0 ? 'brightness' : '',
    ].filter(Boolean).join(' · ') || 'off' },
  { kind: 'note', text: 'Turn on a sound source in the Audio card first.', show: () => audio.source === 'off' },
  { kind: 'select', key: 'audioHue', label: 'Shift colours', options: [['off', 'Never'], ['beat', 'Every kick'], ['bar', 'Every bar'], ['drift', 'Drift with the energy'], ['drop', 'Only on drops']] },
  { kind: 'range', key: 'audioHueAmt', label: 'Shift by', min: 5, max: 180, step: 5, format: (v) => `${v}°`, show: () => settings.audioHue !== 'off' },
  { kind: 'range', key: 'audioBright', label: 'Brightness with energy', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioPalEvery', label: 'New palette every', min: 0, max: 32, step: 4, format: (v) => (v === 0 ? 'never' : `${v} bars`) },
  { kind: 'range', key: 'audioBgFlash', label: 'Background flash on kicks', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioSnareFlash', label: 'Flash on snares', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioHatTwinkle', label: 'Twinkle on hi-hats', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioBassGlow', label: 'Glow with the bass', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioNoteHue', label: 'Colour by melody note', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioVoxGlow', label: 'Glow with the vocals', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'toggle', key: 'audioMonoBuild', label: 'Colour drains in a build-up, back at the drop' },
  { kind: 'toggle', key: 'audioInvert', label: 'Invert the colours for a moment at a drop' },

  { kind: 'heading', label: 'View', tab: 'music' },
  { kind: 'section', id: 'camera', label: 'View moves', tab: 'music', about: 'Punches, shakes, cuts, dollies, pans, rolls and spins in time with the music.',
    lock: ['audioCam', 'audioSpin', 'audioCuts', 'audioDolly', 'audioPan', 'audioRoll', 'audioFlip', 'audioHatShake', 'audioBassZoom', 'audioVoxZoom'],
    power: { on: () => settings.audioCam > 0 || settings.audioSpin !== 'off' || settings.audioCuts !== 'off' || settings.audioDolly || settings.audioPan > 0 || settings.audioRoll > 0 || settings.audioFlip || settings.audioHatShake > 0 || settings.audioBassZoom > 0 || settings.audioVoxZoom > 0,
      off: { audioCam: 0, audioSpin: 'off', audioCuts: 'off', audioDolly: false, audioPan: 0, audioRoll: 0, audioFlip: false, audioHatShake: 0, audioBassZoom: 0, audioVoxZoom: 0 }, start: { audioCam: 0.6 } },
    summary: () => [
      settings.audioCam > 0 ? `punch ${pct(settings.audioCam)}` : '', settings.audioCuts !== 'off' ? 'cuts' : '', settings.audioDolly ? 'dolly' : '',
      settings.audioPan > 0 ? 'pan' : '', settings.audioRoll > 0 ? 'roll' : '', settings.audioFlip ? 'flip' : '', settings.audioSpin !== 'off' ? settings.audioSpin : '',
    ].filter(Boolean).join(' · ') || 'off' },
  { kind: 'note', text: 'Turn on a sound source in the Audio card first.', show: () => audio.source === 'off' },
  { kind: 'range', key: 'audioCam', label: 'Punch & shake', min: 0, max: 1.5, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioHatShake', label: 'Shake on hi-hats', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioBassZoom', label: 'Breathe with the bass', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioVoxZoom', label: 'Lean in with the vocals', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'select', key: 'audioCuts', label: 'Beat cuts', options: [['off', 'Off'], ['bar', 'Every bar'], ['2bars', 'Every 2 bars'], ['4bars', 'Every 4 bars'], ['drop', 'Only on drops']] },
  { kind: 'select', key: 'audioSpin', label: 'Spin', options: [['off', 'Still'], ['sway', 'Sway every 4 bars'], ['rock', 'Rock to and fro over 8 bars'], ['step', 'Step an eighth turn each bar'], ['turn', 'Full turn every 32 bars'], ['energy', 'Turn faster when it gets loud']] },
  { kind: 'range', key: 'audioPan', label: 'Pan drift', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioRoll', label: 'Roll on snares', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : `${(v * 5).toFixed(1)}°`) },
  { kind: 'toggle', key: 'audioDolly', label: 'Dolly in through a build-up, snap back at the drop' },
  { kind: 'toggle', key: 'audioFlip', label: 'Mirror the view at each drop' },

  { kind: 'section', id: 'viewfx', label: 'View effects', tab: 'music', about: 'Feedback tunnel and echoes of the last kick. The kaleidoscope is in Lens (Look tab).',
    lock: ['audioTunnel', 'audioTunnelTurn', 'audioEcho'],
    power: { on: () => settings.audioTunnel > 0 || settings.audioEcho > 0,
      off: { audioTunnel: 0, audioEcho: 0 }, start: { audioTunnel: 0.5 } },
    summary: () => [settings.audioTunnel > 0 ? 'tunnel' : '', settings.audioEcho > 0 ? 'echo' : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'range', key: 'audioTunnel', label: 'Feedback tunnel', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'select', key: 'audioTunnelTurn', label: 'Tunnel turns', options: [['none', 'Straight'], ['left', 'Left'], ['right', 'Right'], ['rock', 'Rocking']], show: () => settings.audioTunnel > 0 },
  { kind: 'range', key: 'audioEcho', label: 'Echo of the last kick', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'note', text: 'The tunnel also works without music, and shortens trails so the streaming shows.' },

  { kind: 'heading', label: 'Motion & words', tab: 'music' },
  { kind: 'section', id: 'mmotion', label: 'Music motion', tab: 'music', about: 'Freeze frames on snares, gravity that flips at drops, trails and sway with the bass.',
    lock: ['audioStutter', 'audioGravFlip', 'audioTrailEnergy', 'audioSway', 'audioEnergyShake'],
    power: { on: () => settings.audioStutter || settings.audioGravFlip || settings.audioTrailEnergy > 0 || settings.audioSway > 0 || settings.audioEnergyShake > 0,
      off: { audioStutter: false, audioGravFlip: false, audioTrailEnergy: 0, audioSway: 0, audioEnergyShake: 0 }, start: { audioSway: 0.6 } },
    summary: () => [settings.audioStutter ? 'stutter' : '', settings.audioGravFlip ? 'gravity flip' : '', settings.audioTrailEnergy > 0 ? 'trails' : '', settings.audioSway > 0 ? 'sway' : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'note', text: 'Turn on a sound source in the Audio card first.', show: () => audio.source === 'off' },
  { kind: 'range', key: 'audioSway', label: 'Sway with the bass', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioEnergyShake', label: 'Tremble with the energy', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioTrailEnergy', label: 'Longer trails when loud', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'toggle', key: 'audioStutter', label: 'Freeze for a split second on snares' },
  { kind: 'toggle', key: 'audioGravFlip', label: 'Gravity flips at each drop' },

  { kind: 'section', id: 'mwords', label: 'Music words', tab: 'music', about: 'A text pattern that changes word with the music, pulses and hops letter by letter.',
    lock: ['audioWordsOn', 'audioWords', 'audioWordsEvery', 'audioWordPulse', 'audioLetterHop', 'audioSnareHop', 'audioEnergyWords', 'audioBuildScatter', 'audioNoteHop', 'audioVoxSwell'],
    power: { on: () => settings.audioWordsOn || settings.audioWordPulse > 0 || settings.audioLetterHop > 0 || settings.audioSnareHop > 0 || settings.audioEnergyWords > 0 || settings.audioBuildScatter > 0 || settings.audioNoteHop > 0 || settings.audioVoxSwell > 0,
      off: { audioWordsOn: false, audioWordPulse: 0, audioLetterHop: 0, audioSnareHop: 0, audioEnergyWords: 0, audioBuildScatter: 0, audioNoteHop: 0, audioVoxSwell: 0 }, start: { audioWordsOn: true, audioWords: 'LOVE, PEACE, UNITY', audioWordPulse: 0.5 } },
    summary: () => [settings.audioWordsOn && settings.audioWords.trim() ? 'words' : '', settings.audioWordPulse > 0 ? 'pulse' : '', settings.audioLetterHop > 0 ? 'hop' : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'note', text: 'Changing words needs a Text shape (Shape tab) or a Words scene. Pulse and hop work with any shape, your face too.', show: () => settings.shape !== 'text' },
  { kind: 'toggle', key: 'audioWordsOn', label: 'Change word with the music' },
  { kind: 'text', key: 'audioWords', label: 'Words (comma separated)', placeholder: 'LOVE, PEACE, UNITY', show: () => settings.audioWordsOn },
  { kind: 'select', key: 'audioWordsEvery', label: 'Next word', options: [['bar', 'Every bar'], ['2bars', 'Every 2 bars'], ['4bars', 'Every 4 bars'], ['drop', 'Only on drops']], show: () => settings.audioWordsOn },
  { kind: 'range', key: 'audioWordPulse', label: 'Shape pulses with the kick', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioLetterHop', label: 'Letters hop in turn', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioSnareHop', label: 'Letters hop on snares', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioEnergyWords', label: 'Shape grows with the energy', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioBuildScatter', label: 'Shape shivers apart in build-ups', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioNoteHop', label: 'Letters hop with the melody', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioVoxSwell', label: 'Shape swells with the vocals', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },

  { kind: 'section', id: 'rapflow', label: 'Rap flow', tab: 'music', about: 'Reactions to the words: each syllable, the gaps between them, how fast the flow is, accents, the voice rising and falling, and rhymes.',
    lock: ['audioSylPush', 'audioSylFlash', 'audioSylHop', 'audioPauseDim', 'audioPauseFreeze', 'audioFlowSpeed', 'audioFlowHue', 'audioAccentBurst', 'audioAccentPunch', 'audioPitchLift', 'audioPitchTilt', 'audioRhymeRipple', 'audioRhymeHue'],
    power: { on: () => settings.audioSylPush > 0 || settings.audioSylFlash > 0 || settings.audioSylHop > 0 || settings.audioPauseDim > 0 || settings.audioPauseFreeze > 0 || settings.audioFlowSpeed > 0 || settings.audioFlowHue > 0 || settings.audioAccentBurst > 0 || settings.audioAccentPunch > 0 || settings.audioPitchLift > 0 || settings.audioPitchTilt > 0 || settings.audioRhymeRipple > 0 || settings.audioRhymeHue > 0,
      off: { audioSylPush: 0, audioSylFlash: 0, audioSylHop: 0, audioPauseDim: 0, audioPauseFreeze: 0, audioFlowSpeed: 0, audioFlowHue: 0, audioAccentBurst: 0, audioAccentPunch: 0, audioPitchLift: 0, audioPitchTilt: 0, audioRhymeRipple: 0, audioRhymeHue: 0 }, start: { audioSylPush: 0.5, audioPauseDim: 0.5 } },
    summary: () => [settings.audioSylPush > 0 || settings.audioSylFlash > 0 || settings.audioSylHop > 0 ? 'syllables' : '', settings.audioPauseDim > 0 || settings.audioPauseFreeze > 0 ? 'pauses' : '', settings.audioFlowSpeed > 0 || settings.audioFlowHue > 0 ? 'flow' : '', settings.audioAccentBurst > 0 || settings.audioAccentPunch > 0 ? 'accents' : '', settings.audioPitchLift > 0 || settings.audioPitchTilt > 0 ? 'pitch' : '', settings.audioRhymeRipple > 0 || settings.audioRhymeHue > 0 ? 'rhymes' : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'note', text: 'Follows a rapping or speaking voice over the beat, syllable by syllable. Quiet between words, so gaps read as silence.' },
  { kind: 'rapmeters' },
  { kind: 'range', key: 'audioSylPush', label: 'Push on each syllable', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioSylFlash', label: 'Flash on each syllable', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioSylHop', label: 'Letters hop on syllables', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioPauseDim', label: 'Dim in the gaps between words', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioPauseFreeze', label: 'Freeze for a beat at each pause', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioFlowSpeed', label: 'Speed with the flow (syllables a second)', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioFlowHue', label: 'Colour drifts faster with the flow', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioAccentBurst', label: 'Burst on accents', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioAccentPunch', label: 'Punch in on accents', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioPitchLift', label: 'Rise and fall with the voice', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioPitchTilt', label: 'Tilt as the voice rises or falls', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioRhymeRipple', label: 'Ripple on rhymes', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioRhymeHue', label: 'Colour jumps on rhymes', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },

  { kind: 'section', id: 'cam', label: 'Camera', tab: 'camera', about: 'Your webcam. Every card on this tab uses it; the picture stays on this device.',
    power: { on: () => cam.on || camStarting, off: {}, start: {}, toggle: () => (cam.on ? stopCamera() : void startCamera()) },
    summary: () => (cam.on ? 'on' : camStarting ? 'starting…' : 'off') },
  { kind: 'toggle', key: 'camMirror', label: 'Mirror, like a selfie' },
  { kind: 'toggle', key: 'camPreview', label: 'Show a small camera preview' },
  { kind: 'note', text: 'Switch on any card below and the camera starts by itself (it asks once). Tracking downloads a small model the first time.' },

  { kind: 'section', id: 'camshape', label: 'You as the shape', tab: 'camera', about: 'Your face, hands or body become the shape the particles form.',
    lock: ['camMode', 'camMix', 'camSnap', 'camCentre', 'camDepth', 'camRate'],
    power: { on: isCam, off: { shape: 'none' }, start: { shape: 'camera' } },
    summary: () => (isCam() ? label(CAM_MODES, settings.camMode).replace(/ \(.*\)$/, '') : 'off') },
  { kind: 'select', key: 'camMode', label: 'Use', options: CAM_MODES },
  { kind: 'range', key: 'camMix', label: 'Features vs mesh', min: 0.1, max: 0.95, step: 0.05, format: (v) => `${Math.round(v * 100)}% features`, show: () => settings.camMode === 'mixed' },
  { kind: 'range', key: 'camSnap', label: 'Follow tightness', min: 0, max: 1, step: 0.05, format: (v) => (v < 0.2 ? 'loose' : v > 0.8 ? 'tight' : pct(v)), show: trackMode },
  { kind: 'toggle', key: 'camCentre', label: 'Keep the face centred and sized', show: faceMode },
  { kind: 'toggle', key: 'camDepth', label: 'Real depth: near parts bigger (turns on 3D depth)', show: faceMode },
  { kind: 'range', key: 'camRate', label: 'Updates per second', min: 1, max: 15, step: 1, show: () => !trackMode() },
  { kind: 'note', text: 'Two people (or two hands) in view each get half the particles. Colour by Face features or Camera colours on the Look tab. Shape size is on the Shape tab.' },

  { kind: 'section', id: 'mgcam', label: 'Reactions', tab: 'camera', about: 'What your hands, face, voice and body do to the field. Tap a cell to step it, slide sideways for exact strength, hold for flavours.' },
  { kind: 'mixgrid', which: 'camera' },
  { kind: 'heading', label: 'Your face', tab: 'camera' },
  { kind: 'section', id: 'facefx', label: 'Face extras', tab: 'camera', about: 'Flames, a crown or tears on your face; your gaze and voice move particles.',
    lock: ['maskFx', 'maskShare', 'gaze', 'voice'],
    power: { on: faceExtras, off: { maskFx: 'none', gaze: 'off', voice: false }, start: { maskFx: 'flames' } },
    summary: () => [settings.maskFx !== 'none' ? settings.maskFx : '', settings.gaze !== 'off' ? 'gaze' : '', settings.voice ? 'voice' : ''].filter(Boolean).join(', ') || 'off' },
  { kind: 'select', key: 'maskFx', label: 'Mask', options: [['none', 'None'], ['flames', 'Flame hair'], ['crown', 'Crown of sparks'], ['tears', 'Tears'], ['beard', 'Rainbow beard'], ['halo', 'Halo'], ['lasers', 'Laser eyes']] },
  { kind: 'range', key: 'maskShare', label: 'Particles for the mask and voice', min: 0.1, max: 0.8, step: 0.05, format: pct, show: () => settings.maskFx !== 'none' || settings.voice },
  { kind: 'select', key: 'gaze', label: 'Your gaze', options: [['off', 'Nothing'], ['drift', 'Particles drift where you look'], ['eyes', 'Your eyes pull particles in']] },
  { kind: 'toggle', key: 'voice', label: 'Voice: sing or talk and particles stream from your mouth' },
  { kind: 'buttons', buttons: [['Use the microphone', () => void audio.start('mic')]], show: () => settings.voice && audio.source === 'off' },
  { kind: 'note', text: 'Voice colours follow your pitch: low notes one end of the palette, high notes the other. Works with any look; with Shape → Your camera → a face mode the effects sit on the particle face.' },

  { kind: 'heading', label: 'Your hands', tab: 'camera' },
  { kind: 'section', about: 'Your hands, seen by the camera, push, pull or swirl the particles. Pinch to grab.', id: 'hands', label: 'Hands', tab: 'camera', lock: ['camHands', 'camHandReach', 'camHandForce'],
    power: { on: handsOn, off: { camHands: 'off' }, start: { camHands: 'repel' } },
    summary: () => (handsOn() ? `${settings.camHands}${cam.hands.length ? ` · ${cam.hands.length} hand${cam.hands.length > 1 ? 's' : ''}` : ''}` : 'off') },
  { kind: 'select', key: 'camHands', label: 'Hands', options: [['repel', 'Push away'], ['attract', 'Pull in'], ['vortex', 'Swirl'], ['draw', 'Draw (pinch is the pen)'], ['spray', 'Spray from your index fingers']] },
  { kind: 'range', key: 'camHandReach', label: 'Reach', min: 40, max: 400, step: 10, format: (v) => `${v}px`, show: () => !isPaint() },
  { kind: 'range', key: 'camHandForce', label: 'Strength', min: 0.1, max: 3, step: 0.05, format: pct, show: () => !isPaint() },
  { kind: 'select', key: 'drawColour', label: 'Colour', options: [['flow', 'Rainbow along the stroke'], ['finger', 'A colour per finger']], show: () => settings.camHands === 'draw' },
  { kind: 'toggle', key: 'drawWidth', label: 'Brush width: spread index and middle finger', show: () => settings.camHands === 'draw' },
  { kind: 'toggle', key: 'drawErase', label: 'Open palm erases', show: () => settings.camHands === 'draw' },
  { kind: 'buttons', buttons: [['Clear the drawing', () => { paintParked = false; syncPaint(); }]], show: isPaint },
  { kind: 'note', text: 'Draw: pinch your thumb and index finger to put the pen down, open them to lift it. With a colour per finger, pinch the thumb to any finger. The oldest strokes are reused when you run out of particles (Count, Particles card). Spray: point your index finger.', show: isPaint },
  { kind: 'note', show: () => !isPaint(), text: 'Works with any look. Pinch thumb and index finger to grab particles and drag them; flick and let go to throw them. Uses the camera (asks once); the picture stays on this device.' },

  { kind: 'heading', label: 'Inputs', tab: 'camera' },
  { kind: 'section', id: 'caminputs', label: 'Camera inputs', tab: 'camera', about: 'Expression sensitivity, two hands as dials, arms that sweep. What expressions, hand signs and jumps do is set in Connections.',
    lock: ['exSense', 'twoDist', 'twoAngle', 'poseSweep'],
    summary: () => [gestShown, settings.gestOn ? 'two hands' : '', settings.poseOn ? 'arm sweep' : ''].filter(Boolean).join(' · ') },
  { kind: 'sub', label: 'Face' },
  { kind: 'exmeters' },
  { kind: 'range', key: 'exSense', label: 'Expression sensitivity', min: 0.5, max: 2.5, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
  { kind: 'note', text: 'Live: how strong each expression is now; the tick is where a moment fires. Needs You as the shape with a face mode, or a Camera scene.' },
  { kind: 'sub', label: 'Two hands' },
  { kind: 'toggle', key: 'gestOn', label: 'Two hands work as dials' },
  { kind: 'select', key: 'twoDist', label: 'Hands apart', options: [['off', 'Nothing'], ['zoom', 'Zoom the view'], ['size', 'Particle size'], ['flow', 'Flow'], ['speed', 'Speed']], show: () => settings.gestOn },
  { kind: 'select', key: 'twoAngle', label: 'Tilt between them', options: [['off', 'Nothing'], ['turn', 'Turn the view'], ['hue', 'Shift the colours']], show: () => settings.gestOn },
  { kind: 'note', text: 'Two hands a shoulder width apart and level is neutral; move them apart, together or tilt them.', show: () => settings.gestOn },
  { kind: 'sub', label: 'Body' },
  { kind: 'toggle', key: 'poseOn', label: 'Your arms sweep the particles' },
  { kind: 'range', key: 'poseSweep', label: 'Arms sweep', min: 0, max: 3, step: 0.1, format: (v) => (v === 0 ? 'off' : `${v.toFixed(1)}×`), show: () => settings.poseOn },
  { kind: 'note', text: 'Expressions, hand signs and jumps: pick what they do in Connections (React tab). Step back so the camera sees you from the hips up (the whole body for jumps).' },
  { kind: 'buttons', buttons: [['Open Connections', () => openConnections()]] },

  { kind: 'heading', label: 'Your body', tab: 'camera' },
  { kind: 'section', id: 'mirror', label: 'Silhouette & mirror world', tab: 'camera', about: 'Particles flow round you, or the left half is reflected.',
    summary: () => [settings.obstacles === 'body' ? 'silhouette' : '', settings.mirrorWorld ? 'mirror world' : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'buttons', buttons: [['Particles flow round your silhouette', () => set('obstacles', settings.obstacles === 'body' ? 'none' : 'body')]], active: () => settings.obstacles === 'body' },
  { kind: 'toggle', key: 'mirrorWorld', label: 'Mirror world: the left half reflected in other colours' },
  { kind: 'note', text: 'The silhouette is an obstacle: Push and how often it updates are in Obstacles on the Motion tab.' },

  { kind: 'section', id: 'actions', label: 'Actions', fixed: true },
  {
    kind: 'icons',
    // The dock: the performance pages on the left, then the actions you
    // reach for mid-set; the rarer ones wait under ⋯.
    buttons: [
      ['Stage: just the field, no menus', ICONS.eye, () => startWatching(), 'Stage'],
      ['Scenes', svg(TAB_ICONS.presets), () => showTab('presets'), 'Scenes', 'presets'],
      ['On-screen controls: knobs and gestures on the field', svg(TAB_ICONS.knobs), () => showTab('knobs'), 'Controls', 'knobs'],
      ['Timeline', svg(TAB_ICONS.timeline), () => showTab('timeline'), 'Timeline', 'timeline'],
      ['Record a clip (V)', ICONS.record, dockRecord, 'Record'],
      ['Pause (Space)', ICONS.pause, togglePause, 'Pause'],
      ['Shuffle, keeps locked sections (D)', ICONS.shuffle, shuffle, 'Shuffle'],
      ['More actions', svg('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'), () => toggleDockMore(), 'More'],
    ],
  },
];


const FAMILY_KEY = 'particle-field:family';
let presetFamily: Family = (() => {
  const v = readJson<string>(FAMILY_KEY, 'words');
  return FAMILIES.some(([f]) => f === v) ? (v as Family) : 'words';
})();
const familyLabel = (f: Family) => FAMILIES.find(([k]) => k === f)![1];

// Which preset family is showing (null for your own presets).
let lastPresetFamily: Family | null = null;

function playPreset(name: string, p: Partial<Settings>) {
  noteRecent(name);
  lastPresetFamily = FAMILY_OF[name] ?? null;
  apply(p);
  lastSceneName = name;
  // The image pattern needs a picture: ask for one (this runs in the click).
  if (p.shape === 'image' && !shapeImage) {
    imageInput.click();
    showToast('Pick an image for the particles to draw');
  } else if (p.shape === 'drawing' && !drawStrokes.length && !drawMode) toggleDraw();
  else showToast(name);
}

// Family chips (wrapping, so every family is one tap away on a phone), then
// that family's presets A–Z.
function renderPresetLibrary() {
  const wrap = document.createElement('div');
  wrap.className = 'presetlib';
  const chips = document.createElement('div');
  chips.className = 'families';
  chips.setAttribute('role', 'tablist');
  const grid = document.createElement('div');
  grid.className = 'buttons';
  const draw = () => {
    for (const c of chips.children) c.classList.toggle('on', (c as HTMLElement).dataset.fam === presetFamily);
    grid.innerHTML = '';
    const list = PRESETS.filter(([n]) => presetFamily === 'all' || FAMILY_OF[n] === presetFamily).sort(([a], [b]) => a.localeCompare(b));
    for (const [name, p] of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.dataset.scene = name;
      b.addEventListener('click', () => playPreset(name, p));
      grid.append(b);
    }
    markLibrary(wrap);
  };
  for (const [fam, label] of FAMILIES) {
    const c = document.createElement('button');
    c.type = 'button';
    c.dataset.fam = fam;
    c.setAttribute('role', 'tab');
    const count = fam === 'all' ? PRESETS.length : PRESETS.filter(([n]) => FAMILY_OF[n] === fam).length;
    c.innerHTML = `${label} <small>${count}</small>`;
    c.addEventListener('click', () => {
      presetFamily = fam;
      writeJson(FAMILY_KEY, fam);
      draw();
      refresh();
    });
    chips.append(c);
  }
  // A plain start: still grey dots, no shape, flow or effects, to build on.
  const blank = document.createElement('button');
  blank.type = 'button';
  blank.className = 'scene-blank';
  blank.innerHTML = '<b>Blank</b><span>Plain dots, nothing else: a starting point to build on</span>';
  blank.addEventListener('click', () => playPreset('Blank', BLANK_SCENE));
  wrap.append(blank, chips, grid);
  draw();
  return wrap;
}
const BLANK_SCENE: Partial<Settings> = { count: 900, size: 1.6, speed: 0.6, jitter: 0.02, flow: 0, trail: 0.5, glow: false, depth: 0, palette: 'mono', shape: 'none', emitter: 'none' };

// The scene playing now, and its family chip, are marked in the library.
// (Not while one of your own scenes or the crossfader is playing.)
function markLibrary(root: ParentNode = document) {
  let mine = true;
  try {
    mine = !!currentMine;
  } catch {}
  const name = xf.on || mine ? '' : lastSceneName;
  const fam = name ? FAMILY_OF[name] : undefined;
  for (const el of root.querySelectorAll<HTMLElement>('.presetlib [data-scene]')) el.classList.toggle('cur', el.dataset.scene === name);
  for (const el of root.querySelectorAll<HTMLElement>('.presetlib [data-fam]')) el.classList.toggle('cur', !!fam && el.dataset.fam === fam);
}

const controls = document.getElementById('controls')!;
const refreshers: (() => void)[] = [];
const pauseButtons: HTMLButtonElement[] = [];

function set<K extends keyof Settings>(k: K, v: Settings[K]) {
  if (settings[k] === v) return;
  settings[k] = v;
  changed(new Set([k]));
  tlHold([k]);
}

const LENS_KEYS = ['lensMirror', 'lensTiles', 'lensZoom', 'lensSplit', 'lensGlitch', 'lensDots', 'lensMusic', 'lensTwirl', 'lensWave', 'lensRipple', 'lensFan', 'lensShatter', 'lensSlices', 'lensEcho', 'lensGlow', 'lensCrt', 'audioKaleido', 'audioKaleidoDrop'] as const;

// Visual presets, shuffle and reset keep the audio settings you've tuned.
const audioSettings = (): Partial<Settings> =>
  Object.fromEntries(Object.entries(settings).filter(([k]) => k.startsWith('audio')));
// How you play (morph time, beat snap) isn't part of a look either.
// The music cards (drops, auto VJ, groups, colour, camera) are your setup
// too: no look switches them, so auto VJ can't turn itself off.
const MUSIC_KEYS = [
  'audioVibeLook', 'audioDrop', 'audioDropBuild', 'audioVj', 'audioVjFrom', 'audioVjDrop', 'audioBands', 'audioHue', 'audioHueAmt', 'audioBright', 'audioCam', 'audioSpin',
  'audioCuts', 'audioDolly', 'audioPan', 'audioRoll', 'audioFlip', 'audioTunnel', 'audioTunnelTurn', 'audioEcho',
  'audioPalEvery', 'audioMonoBuild', 'audioBgFlash', 'audioInvert', 'audioStutter', 'audioGravFlip', 'audioTrailEnergy', 'audioSway',
  'audioWordsOn', 'audioWords', 'audioWordsEvery', 'audioWordPulse', 'audioLetterHop',
  'audioSnareFlash', 'audioSnareHop', 'audioHatTwinkle', 'audioHatShake', 'audioBassThrob', 'audioBassZoom', 'audioBassGlow', 'audioBuildScatter', 'audioEnergyShake', 'audioEnergyWords',
  'audioNoteRipple', 'audioNoteHue', 'audioNoteHop', 'audioVoxGlow', 'audioVoxZoom', 'audioVoxSwell',
  'audioSylPush', 'audioSylFlash', 'audioSylHop', 'audioPauseDim', 'audioPauseFreeze', 'audioFlowSpeed', 'audioFlowHue', 'audioAccentBurst', 'audioAccentPunch', 'audioPitchLift', 'audioPitchTilt', 'audioRhymeRipple', 'audioRhymeHue',
] as const;
const playSettings = (): Partial<Settings> => ({
  morph: settings.morph,
  beatSnap: settings.beatSnap,
  shuffleCards: settings.shuffleCards,
  homeStrength: settings.homeStrength,
  xfPos: settings.xfPos,
  // Your headphones and how you hear vocals don't change with the scene.
  audioSync: settings.audioSync,
  audioVox: settings.audioVox,
  ...Object.fromEntries(MUSIC_KEYS.map((k) => [k, settings[k]])),
});

// Presets go through here: they glide over (Morph) and can wait for the beat.
function apply(p: Partial<Settings>, keepAudio = true, opts: { now?: boolean; morph?: number } = {}) {
  const blank = p === BLANK_SCENE;
  p = upgradeShape(p);
  // The scene playing until now: what it switched on goes when it does.
  const prev = currentMine?.settings ?? PRESETS.find(([n]) => n === lastSceneName)?.[1] ?? null;
  lastSceneName = '';
  if (currentMine) {
    currentMine = null;
    redrawMine();
  }
  const target = blank ? blankTarget() : sceneTarget(p, keepAudio, prev);
  // The scene's own knobs (your saved scenes bring theirs).
  if (!(typeof p.knobsScene === 'string' && p.knobsScene)) target.knobsScene = sceneKnobs(target).join(',');
  sceneBase = target;
  if (settings.beatSnap && reacting() && !opts.now) {
    pendingLook = { target, since: performance.now() };
    return;
  }
  morphTo(target, opts.morph);
}

// Blank is a clean start: the defaults and the blank look, with nothing
// carried over (no camera inputs, music reactions, lenses or macros) but how
// you play, your on-screen knobs and locked cards.
function blankTarget(): Settings {
  const S0 = settings as unknown as Record<string, unknown>;
  const keep = [...VIEW_KEYS, 'morph', 'beatSnap', 'shuffleCards', 'homeStrength', 'xfPos', 'audioSync', 'audioVox', 'playOn', 'playLeft', 'playWheel3', 'playWheel4', 'playRight', 'playWheel5', 'knobsMore', 'knobsPick', 'knobsFollow', 'numberKeys', 'playTwo', 'playPinch'];
  const target = { ...DEFAULTS, ...BLANK_SCENE, ...Object.fromEntries(keep.map((k) => [k, S0[k]])) } as unknown as Record<string, unknown>;
  for (const k of lockedKeys()) target[k] = S0[k];
  return target as unknown as Settings;
}
// The full settings a scene ends up as: the scene over the defaults, with
// what carries over (sound setup, how you play, inputs, your lenses, locks).
function sceneTarget(p: Partial<Settings>, keepAudio: boolean, prev: Partial<Settings> | null = null): Settings {
  // Inputs and music reactions carry over as yours, but not ones the last
  // scene itself switched on (and you left as it set them): a camera scene's
  // hands, preview or body tracking end with it.
  const P = prev ? (upgradeShape(prev) as Record<string, unknown>) : null;
  const D = DEFAULTS as unknown as Record<string, unknown>;
  const S0 = settings as unknown as Record<string, unknown>;
  const fromScene = (k: string) => !!P && k in P && P[k] !== D[k] && S0[k] === P[k];
  // Your own presets bring their whole Sound setup back too (the music cards
  // included), all but Auto VJ, so a VJ stepping through them keeps going.
  const own = keepAudio ? {} : Object.fromEntries(MUSIC_KEYS.filter((k) => k in p && !k.startsWith('audioVj')).map((k) => [k, p[k]]));
  // Hands are an input like the pointer: they stay as they are unless the
  // preset itself sets them.
  // Drawing and spraying belong to their look, so they don't carry over.
  const hands: Partial<Settings> = Object.fromEntries((['camHands', 'camHandReach', 'camHandForce', 'camPreview', 'gestOn', 'twoDist', 'twoAngle', 'poseOn', 'poseSweep', 'links', 'mEnergy', 'mOrder', 'mDream', 'mHeat', 'mDensity', 'densityMode', 'playOn', 'playLeft', 'playWheel3', 'playWheel4', 'playRight', 'playWheel5', 'knobsMore', 'knobsPick', 'knobsFollow', 'numberKeys', 'playTwo', 'playPinch'] as const).filter((k) => !(k in p) && !fromScene(k)).map((k) => [k, settings[k]]));
  if (hands.camHands === 'draw' || hands.camHands === 'spray') hands.camHands = 'off';
  // The on-field knobs are yours to switch on: no scene turns them on.
  hands.playOn = settings.playOn;
  // Your own scenes bring their overview knob picks back, and play them.
  if (typeof p.knobsPick === 'string' && p.knobsPick) hands.playOn = true;
  // Lenses belong to the scene like any other look setting: the scene's own,
  // else off. Lock the Lens card to keep yours through scene changes.
  const target = { ...DEFAULTS, ...(keepAudio ? audioSettings() : {}), ...p, ...playSettings(), ...own, ...hands } as Settings;
  for (const k of MUSIC_KEYS) if (keepAudio && !(k in p) && fromScene(k)) (target as unknown as Record<string, unknown>)[k] = D[k];
  // Locked cards keep what they have, whichever scene loads.
  for (const k of lockedKeys()) (target as unknown as Record<string, unknown>)[k] = settings[k];
  // The screen fit belongs to the room, not the scene.
  for (const k of VIEW_KEYS) (target as unknown as Record<string, unknown>)[k] = settings[k];
  // Tweaks held by the timeline stay for the rest of the set.
  if (tlActive() && tl.hold) Object.assign(target, tl.held);
  return target;
}

// --- morphing between looks ---------------------------------------------------
// Numbers glide from the old look to the new over `morph` seconds and the
// palette crossfades; everything else (style, modes) switches at once. The
// particles keep their positions, so they move into the new behaviour.

type Rgb = [number, number, number];
let morphState: { from: Record<string, number>; to: Record<string, number>; start: number; dur: number } | null = null;
// `fixed`: held at that mix (the crossfader) instead of running over time.
let palMix: { from: Rgb[]; fromBg: Rgb; start: number; dur: number; tick: number; fixed?: number } | null = null;
let pendingLook: { target: Settings; since: number } | null = null;
// Set while morphTo applies a shape change; homeGlide then moves each
// particle's target from where it was to its new spot.
let glideHomes: { ms: number; fromFree: boolean } | null = null;
let homeGlide: { fx: Float32Array; fy: Float32Array; tx: Float32Array; ty: Float32Array; start: number; dur: number; dl?: Float32Array } | null = null;

let forceIn: { start: number; dur: number } | null = null;
function morphTo(target: Settings, morphSec = settings.morph) {
  const dur = morphSec * 1000;
  if (dur <= 0) {
    morphState = null;
    palMix = null;
    Object.assign(settings, target);
    changed(new Set(Object.keys(DEFAULTS) as (keyof Settings)[]));
    return;
  }
  const now = performance.now();
  const S = settings as unknown as Record<string, unknown>;
  const T = target as unknown as Record<string, unknown>;
  const from: Record<string, number> = {};
  const to: Record<string, number> = {};
  const instant = new Set<keyof Settings>();
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    if (typeof T[k] === 'number' && typeof S[k] === 'number') {
      if (T[k] !== S[k]) {
        from[k] = S[k] as number;
        to[k] = T[k] as number;
      }
    } else if (S[k] !== T[k]) instant.add(k);
  }
  // Shape changes: settle size and count at once so the new targets are
  // final, then let the targets glide there over the morph time.
  const shapeKeys = ['shape', 'shapeText', 'shapeIcon', 'shapeGeo', 'shapeSolid', 'shapeLive', 'shapeSeq', 'imageMode'] as const;
  if (T.shape !== 'none' && (shapeKeys.some((k) => instant.has(k)) || 'shapeSize' in to)) {
    for (const k of ['shapeSize', 'count'] as const) {
      if (k in to) {
        S[k] = to[k];
        delete from[k];
        delete to[k];
        instant.add(k);
      }
    }
    glideHomes = { ms: dur, fromFree: S.shape === 'none' };
  }
  // New attractor points or obstacles: their pull grows over the morph.
  if ((['wells', 'obstacles', 'obsCircles', 'obsText'] as const).some((k) => instant.has(k)) && (T.wells || T.obstacles !== 'none')) forceIn = { start: now, dur };
  // Styles and modes can't glide, so the old picture fades out over the new.
  if ((['render', 'mixStyles', 'glyphSet', 'glyphFont', 'glyphPick', 'colorBy', 'glow', 'lensMirror', 'flowType', 'emitter'] as const).some((k) => instant.has(k))) pictureFade(Math.min(2.5, Math.max(0.6, morphSec * 0.4)));
  const palChanged = instant.has('palette') || instant.has('customColors') || instant.has('customBg');
  if (palChanged) palMix = { from: shadeRgb.slice(), fromBg: bgNow(), start: now, dur, tick: 0 };
  for (const k of instant) S[k] = T[k];
  morphState = Object.keys(to).length ? { from, to, start: now, dur } : null;
  if (instant.size) changed(instant, palChanged);
  glideHomes = null;
}

// --- music visuals: colour, camera, auto VJ ------------------------------------

let hueNow = 0;
let hueTarget = 0;
let spinT = 0;
let spinTarget = 0;
let vjBars = 0;
let vjIndex = 0;
let lastVisual = 0;
let lastFilter = '';
let lastTransform = '';
// Bars counted since the music started, for "every N bars" effects.
let musicBars = 0;
// Camera parts: a cut framing, a dolly, a slow pan, a roll and a mirror flip.
let cutZoom = 1;
let cutX = 0;
let cutY = 0;
let dollyNow = 1;
let panT = 0;
let rollNow = 0;
let rollSign = 1;
let flipS = 1;
// Motion and view effects read by step() and draw().
let gravNow = settings.gravity;
let gravSign = 1;
let swayF = 0;
let swayDir = 1;
let stutterUntil = 0;
let trailNow = settings.trail;
let tunnelZ = 1;
let tunnelR = 0;
let kaleidoNow = 0;
let kaleidoUntil = 0;
let echoA = 0;
let echoZ = 1;
let echoSnap = false;
let flashA = 0;
let wordScale = 1;
let hopKick = 0;
let hopAmt = 0;
let noteHueT = 0;
let noteHueNow = 0;
let wordShiver = 0;
let sylFlashA = 0;
let lastVoxAt = -1e9;
let pauseDim = 0;
let flowHue = 0;
let rhymeHueT = 0;
let rhymeHueNow = 0;
let accentZ = 0;
let pitchTilt = 0;
let pitchLift = 0;
let twinkleA = 0;
let hatShakeA = 0;
let hopIdx = 0;
let hopMin = 0;
let hopMax = 0;
let hopLetters = 1;
// Word per bar: the text you had, put back when the words stop.
let wordsBase: string | null = null;
let wordsLast = '';
let wordsIdx = 0;

const everyBars = (e: string) => (e === '4bars' ? 4 : e === '2bars' ? 2 : 1);
const darkPalettes = () =>
  (Object.keys(PALETTES) as (keyof typeof PALETTES)[]).filter((k) => {
    const [r, g, b] = PALETTES[k].bg;
    return r * 0.3 + g * 0.59 + b * 0.11 < 100;
  });

// Crossfade to a random dark palette.
function newPalette(now: number, from: readonly string[] = darkPalettes()) {
  const list = (from as (keyof typeof PALETTES)[]).filter((k) => k !== settings.palette);
  if (!list.length || !cardAllows('palette')) return;
  palMix = { from: shadeRgb.slice(), fromBg: bgNow(), start: now, dur: 1500, tick: 0 };
  settings.palette = pick(list);
  changed(new Set(['palette']), true);
}

function musicVisuals(now: number) {
  const dt = lastVisual ? Math.min(0.1, (now - lastVisual) / 1000) : 0;
  lastVisual = now;
  const on = reacting();
  const L = audio.levels;
  const S = settings;
  const barSec = 240 / (L.bpm || 120);
  if (on && L.bar) musicBars++;
  const lightBg = (() => {
    const [r, g, b] = pal().bg;
    return r * 0.3 + g * 0.59 + b * 0.11 > 140;
  })();

  // Colour: hue steps on beats, bars or drops (or drifts with the energy),
  // brightness and saturation follow the loudness. A CSS filter on the
  // canvas, so it costs nothing per particle.
  const parts: string[] = [];
  if (on && (S.audioHue !== 'off' || S.audioBright > 0)) {
    if (S.audioHue === 'beat' && L.beat) hueTarget += S.audioHueAmt;
    if (S.audioHue === 'bar' && L.bar) hueTarget += S.audioHueAmt;
    if (S.audioHue === 'drift') hueTarget += S.audioHueAmt * (0.1 + L.level * 0.5) * dt;
    if (S.audioHue !== 'off' && L.drop && S.audioDrop > 0) hueTarget += S.audioHue === 'drop' ? S.audioHueAmt * 3 : 150;
    hueNow += (hueTarget - hueNow) * Math.min(1, dt * 5);
    // A light background would tint and glow with the filter, so paper-like
    // palettes only get the saturation.
    if (!lightBg) {
      const bright = 1 + S.audioBright * (L.level * 0.5 - 0.15 + L.dropEnv * 0.6);
      parts.push(`hue-rotate(${(hueNow % 360).toFixed(1)}deg)`, `brightness(${bright.toFixed(2)})`);
    }
  } else hueNow = hueTarget = 0;
  // Hi-hat twinkle: a quick lift in brightness on each hat.
  twinkleA = on && S.audioHatTwinkle > 0 && L.hat ? 0.18 * S.audioHatTwinkle : twinkleA * 0.8;
  if (!on || S.audioHatTwinkle <= 0) twinkleA = 0;
  // Bass glow: colour and light swell with the sub-bass.
  const glowB = on && S.audioBassGlow > 0 ? L.sub * L.sub * S.audioBassGlow : 0;
  // Vocals glow: light lifts while someone sings.
  const voxG = on && S.audioVoxGlow > 0 ? L.voice * S.audioVoxGlow : 0;
  // Rap flow: a blip of light on each syllable; the field dims in the gaps
  // between words (only once someone has been rapping recently).
  sylFlashA = on && S.audioSylFlash > 0 && L.syllable ? 0.22 * S.audioSylFlash : sylFlashA * 0.78;
  if (!on || S.audioSylFlash <= 0) sylFlashA = 0;
  if (L.voxOn) lastVoxAt = now;
  const dimT = on && S.audioPauseDim > 0 && !L.voxOn && now - lastVoxAt < 4000 ? S.audioPauseDim : 0;
  pauseDim += (dimT - pauseDim) * Math.min(1, dt * (dimT > pauseDim ? 14 : 22));
  const lift = twinkleA + glowB * 0.35 + voxG * 0.3 + sylFlashA;
  // Kick pump: the light ducks with the kick too.
  const pumpDim = on && S.audioKick === 'pump' ? Math.min(0.6, L.pulse * 0.45 * S.audioPulse * S.audioIntensity) : 0;
  if (!lightBg && (lift > 0.005 || pauseDim > 0.005 || pumpDim > 0.005)) parts.push(`brightness(${((1 + lift) * (1 - pauseDim * 0.55) * (1 - pumpDim)).toFixed(2)})`);
  // Flow hue drifts faster the faster the flow; rhymes jump the colour.
  if (on && S.audioFlowHue > 0) flowHue = (flowHue + dt * L.flow * 160 * S.audioFlowHue) % 360;
  else flowHue = 0;
  if (on && S.audioRhymeHue > 0 && L.rhyme) rhymeHueT += 60 + 90 * S.audioRhymeHue;
  if (!on || S.audioRhymeHue <= 0) rhymeHueT = rhymeHueNow = 0;
  rhymeHueNow += (rhymeHueT - rhymeHueNow) * Math.min(1, dt * 8);
  if (!lightBg && (flowHue > 0.5 || rhymeHueNow > 0.5)) parts.push(`hue-rotate(${((flowHue + rhymeHueNow) % 360).toFixed(1)}deg)`);
  // Note colour: each pitch has its own hue (C red … B violet), eased between notes.
  if (on && S.audioNoteHue > 0) {
    if (L.note) noteHueT = L.notePc * 30;
    const d = ((noteHueT - noteHueNow + 540) % 360) - 180;
    noteHueNow = (noteHueNow + d * Math.min(1, dt * 6) + 360) % 360;
    if (!lightBg) parts.push(`hue-rotate(${(noteHueNow * S.audioNoteHue).toFixed(1)}deg)`);
  }
  if (on) {
    let sat = 1 + S.audioBright * L.liftLevel * 0.8 + glowB * 0.7;
    // Mono build-up: the colour drains as the tension rises, back at the drop.
    if (S.audioMonoBuild) sat *= 1 - Math.min(0.92, L.tension * 1.1) * (1 - L.dropEnv);
    if (Math.abs(sat - 1) > 0.01) parts.push(`saturate(${sat.toFixed(2)})`);
    if (S.audioInvert && L.dropEnv > 0.55) parts.push('invert(1)');
  }
  const hueCam = handDial.hue + linkRun.out.amounts.hue + (lightBg ? 0 : settings.hueShift);
  if (Math.abs(hueCam) > 0.5) parts.push(`hue-rotate(${hueCam.toFixed(1)}deg)`);
  if (macro.filter) parts.push(macro.filter);
  const filter = parts.join(' ');
  if (filter !== lastFilter) canvas.style.filter = lastFilter = filter;

  // Camera: zoom punch on kicks and drops, shake on snares and drops, plus
  // cuts, dolly, pan, roll and flip. One CSS transform on the canvas.
  let tx = 0;
  let ty = 0;
  let zoom = 1;
  if (on && S.audioCam > 0) {
    const amt = S.audioCam * S.audioIntensity;
    const shake = (L.snareEnv * 3 + L.dropEnv * 14) * amt;
    zoom = (1 + (L.pulse * 0.04 + L.dropEnv * 0.1 + L.tension * 0.03) * amt) * (1 + (2 * shake) / Math.min(w, h));
    tx = (Math.random() - 0.5) * 2 * shake;
    ty = (Math.random() - 0.5) * 2 * shake;
  }
  // Bass breathe: the view leans in with the sub-bass.
  if (on && S.audioVoxZoom > 0) zoom *= 1 + L.voice * 0.06 * S.audioVoxZoom;
  // Accent punch: a quick lean in on the stressed word.
  accentZ = on && S.audioAccentPunch > 0 && L.accent ? 1 : accentZ * 0.86;
  if (!on || S.audioAccentPunch <= 0) accentZ = 0;
  zoom *= 1 + accentZ * 0.1 * S.audioAccentPunch;
  if (on && S.audioBassZoom > 0) zoom *= 1 + L.sub * L.sub * 0.07 * S.audioBassZoom * S.audioIntensity;
  // Hi-hat shake: a small, quick jitter of the frame on each hat.
  hatShakeA = on && S.audioHatShake > 0 && L.hat ? 1 : hatShakeA * 0.7;
  if (!on || S.audioHatShake <= 0) hatShakeA = 0;
  if (hatShakeA > 0.02) {
    const m = hatShakeA * S.audioHatShake * 3;
    tx += (Math.random() - 0.5) * 2 * m;
    ty += (Math.random() - 0.5) * 2 * m;
  }
  // Beat cuts: a hard change of framing, like a video edit.
  if (on && S.audioCuts !== 'off') {
    const cut = S.audioCuts === 'drop' ? L.drop : (L.bar && musicBars % everyBars(S.audioCuts) === 0) || L.drop;
    if (cut) {
      const z = pick([1, 1.3, 1.6, 2].filter((v) => v !== cutZoom));
      cutZoom = z;
      cutX = (Math.random() - 0.5) * w * (z - 1);
      cutY = (Math.random() - 0.5) * h * (z - 1);
    }
  } else cutZoom = 1;
  if (cutZoom === 1) cutX = cutY = 0;
  // Dolly: creeps in through a build-up, snaps back at the drop.
  const dollyT = on && S.audioDolly ? 1 + L.tension * 0.35 : 1;
  if (on && S.audioDolly && L.drop) dollyNow = 1;
  else dollyNow += (dollyT - dollyNow) * Math.min(1, dt * 1.5);
  // Pan drift: a slow figure-of-eight over 8 bars.
  let panX = 0;
  let panY = 0;
  if (on && S.audioPan > 0) {
    panT += dt / (8 * barSec);
    panX = Math.sin(panT * Math.PI * 2) * S.audioPan * w * 0.06;
    panY = Math.sin(panT * Math.PI * 4) * S.audioPan * h * 0.04;
  }
  const panZ = 1 + (2 * Math.max(Math.abs(panX) / w, Math.abs(panY) / h));
  // Roll: tilts one way on a snare, the other way on the next.
  if (on && S.audioRoll > 0 && L.snare) rollSign = -rollSign;
  const rollT = on && S.audioRoll > 0 ? rollSign * S.audioRoll * 5 : 0;
  rollNow += (rollT - rollNow) * Math.min(1, dt * 10);
  // Pitch tilt: the view leans as the voice rises or falls.
  const tiltT = on && S.audioPitchTilt > 0 ? L.voxRise * 9 * S.audioPitchTilt : 0;
  pitchTilt += (tiltT - pitchTilt) * Math.min(1, dt * 6);
  const rollAll = rollNow + pitchTilt + handDial.roll + linkRun.out.amounts.roll;
  const rollZ = 1 + Math.abs(Math.sin((rollAll * Math.PI) / 180)) * (Math.max(w, h) / Math.min(w, h));
  // Flip: mirror the view at each drop.
  if (on && S.audioFlip && L.drop) flipS = -flipS;
  if (!on || !S.audioFlip) flipS = 1;
  const scale = zoom * cutZoom * dollyNow * panZ * rollZ * handDial.zoom * linkRun.out.amounts.zoom;
  tx += cutX + panX;
  ty += cutY + panY;
  let transform = '';
  if (Math.abs(scale - 1) > 0.0005 || tx || ty || Math.abs(rollAll) > 0.01 || flipS < 0) {
    transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rollAll.toFixed(2)}deg) scale(${(scale * flipS).toFixed(3)}, ${scale.toFixed(3)})`;
  }
  // Screen fit (projection) wraps whatever the music camera does.
  if (!viewIsPlain()) {
    const fit = `translate(${(S.viewX * w).toFixed(1)}px, ${(S.viewY * h).toFixed(1)}px) rotate(${S.viewRot}deg) scale(${(S.viewZoom * (S.viewFlipH ? -1 : 1)).toFixed(3)}, ${(S.viewZoom * (S.viewFlipV ? -1 : 1)).toFixed(3)})`;
    transform = transform ? `${fit} ${transform}` : fit;
  }
  if (transform !== lastTransform) canvas.style.transform = lastTransform = transform;

  // Spin, timed to the bar.
  if (on && S.audioSpin !== 'off') {
    spinT += dt;
    if (S.audioSpin === 'sway') camA = Math.sin((spinT / (4 * barSec)) * Math.PI * 2) * 0.12;
    else if (S.audioSpin === 'turn') camA = (camA + (dt * Math.PI * 2) / (32 * barSec)) % (Math.PI * 2);
    else if (S.audioSpin === 'step') {
      // An eighth of a turn every bar, eased.
      if (L.bar) spinTarget += Math.PI / 4;
      camA += (spinTarget - camA) * Math.min(1, dt * 6);
    } else if (S.audioSpin === 'rock') camA = Math.sin((spinT / (8 * barSec)) * Math.PI * 2) * (Math.PI / 4);
    else camA += dt * (0.03 + L.level * 0.9);
    if (S.audioSpin !== 'step') spinTarget = camA;
  } else if (camA !== 0) {
    // Ease back upright (the short way round).
    const a = Math.atan2(Math.sin(camA), Math.cos(camA));
    camA = Math.abs(a) < 0.002 ? 0 : a * 0.92;
    spinTarget = camA;
  }

  // Palette per section: a new colour scheme every N bars (crossfaded).
  if (on && S.audioPalEvery > 0 && L.bar && musicBars % S.audioPalEvery === 0 && cardAllows('palette')) {
    newPalette(now);
  }

  // Motion.
  if (on && S.audioStutter && L.snare) stutterUntil = now + 90;
  if (on && S.audioPauseFreeze > 0 && L.pause) stutterUntil = now + 80 + 320 * S.audioPauseFreeze;
  if (on && S.audioGravFlip) {
    if (L.drop) gravSign = -gravSign;
    gravNow = (S.gravity || 0.25) * gravSign;
  } else {
    gravSign = 1;
    gravNow = S.gravity;
  }
  // Pitch lift: particles float up with a high voice and sink with a low one.
  pitchLift += ((on && S.audioPitchLift > 0 && L.voxOn ? (L.voxPitch - 0.5) * 2 * S.audioPitchLift : 0) - pitchLift) * Math.min(1, dt * 4);
  gravNow -= pitchLift * 0.35;
  if (on && S.audioSway > 0) {
    if (L.beat) swayDir = -swayDir;
    swayF = swayDir * Math.max(L.sub, L.bass * 0.7) * S.audioSway * 0.12;
  } else swayF = 0;
  trailNow = on && S.audioTrailEnergy > 0 ? Math.min(0.985, S.trail + (1 - S.trail) * S.audioTrailEnergy * Math.min(1, L.level * 1.4)) : S.trail;
  if (macro.trailAdd) trailNow = Math.max(0, Math.min(0.985, trailNow + macro.trailAdd));

  // View effects. The tunnel and kaleidoscope also run without music.
  if (S.audioTunnel > 0) {
    const a = S.audioTunnel;
    tunnelZ = 1 + a * (0.006 + (on ? L.pulse * 0.025 + L.dropEnv * 0.04 : 0.004));
    const turn = S.audioTunnelTurn;
    tunnelR = turn === 'none' ? 0 : (turn === 'left' ? -1 : turn === 'right' ? 1 : Math.sin(now / 1000 / (4 * barSec) * Math.PI * 2)) * a * 0.006;
  } else tunnelZ = 1;
  if (on && S.audioKaleidoDrop && L.drop) kaleidoUntil = now + 2 * barSec * 1000;
  kaleidoNow = S.audioKaleido > 0 ? S.audioKaleido : now < kaleidoUntil ? 6 : 0;
  if (!on || !S.audioKaleidoDrop) kaleidoUntil = 0;
  if (on && S.audioEcho > 0 && L.beat) {
    echoSnap = true;
    echoA = S.audioEcho * 0.5;
    echoZ = 1;
  } else {
    echoA *= 0.9;
    echoZ += 0.004;
  }
  if (!on || S.audioEcho <= 0) echoA = 0;
  if (on && S.audioBgFlash > 0 && L.beat) flashA = Math.min(0.22, S.audioBgFlash * 0.22 * (0.5 + L.pulse * 0.5));
  else if (on && S.audioSnareFlash > 0 && L.snare) flashA = Math.max(flashA, Math.min(0.22, S.audioSnareFlash * 0.2));
  else flashA *= 0.82;
  if (!on || (S.audioBgFlash <= 0 && S.audioSnareFlash <= 0)) flashA = 0;

  // Words.
  musicWords(on, L, S);
  wordScale = on && S.audioWordPulse > 0 ? 1 + L.pulse * S.audioWordPulse * 0.14 + L.dropEnv * S.audioWordPulse * 0.2 : 1;
  // Energy: the words grow as the music lifts.
  if (on && S.audioEnergyWords > 0) wordScale *= 1 + L.liftLevel * S.audioEnergyWords * 0.25;
  if (on && S.audioVoxSwell > 0) wordScale *= 1 + L.voice * S.audioVoxSwell * 0.2;
  wordShiver = on && S.audioBuildScatter > 0 ? L.tension * (1 - L.dropEnv) * S.audioBuildScatter * 4 : 0;
  const hopBeat = on && S.audioLetterHop > 0 && L.beat;
  const hopSnare = on && S.audioSnareHop > 0 && L.snare;
  // Melody hop: the letter that hops follows the note's pitch.
  const hopNote = on && S.audioNoteHop > 0 && L.note;
  // Syllable hop: letters hop in turn with the words, like reading along.
  const hopSyl = on && S.audioSylHop > 0 && L.syllable;
  if ((hopBeat || hopSnare || hopNote || hopSyl) && S.shape !== 'none') {
    hopAmt = hopSnare ? S.audioSnareHop : hopBeat ? S.audioLetterHop : hopSyl ? S.audioSylHop : S.audioNoteHop;
    hopMin = Infinity;
    hopMax = -Infinity;
    for (let i = 0; i < n; i++) {
      if (hx[i] < hopMin) hopMin = hx[i];
      if (hx[i] > hopMax) hopMax = hx[i];
    }
    hopLetters = S.shape === 'text' ? Math.max(1, S.shapeText.replace(/\s/g, '').length) : 6;
    hopIdx = hopNote && !hopBeat && !hopSnare ? L.notePc % hopLetters : (hopIdx + 1) % hopLetters;
    hopKick = 1;
  } else hopKick *= 0.8;
  if (!on || (S.audioLetterHop <= 0 && S.audioSnareHop <= 0 && S.audioNoteHop <= 0 && S.audioSylHop <= 0)) hopKick = 0;

  // Auto VJ: a new look every few bars, and on drops.
  if (on && S.audioVj > 0 && !tlActive() && !xfLive()) {
    if (L.bar) vjBars++;
    if (vjBars >= S.audioVj || (S.audioVjDrop && L.drop)) {
      vjBars = 0;
      vjNext();
    }
  } else vjBars = 0;
}

// Word per bar: the text pattern steps through your list of words.
function musicWords(on: boolean, L: typeof audio.levels, S: Settings) {
  const words = S.audioWords.split(',').map((x) => x.trim()).filter(Boolean);
  const active = on && S.audioWordsOn && words.length > 0 && S.shape === 'text';
  if (!active) {
    // Put your own text back, unless something else has changed it since.
    if (wordsBase !== null && S.shapeText === wordsLast && cardAllows('shapeText')) {
      const base = wordsBase;
      wordsBase = null;
      settings.shapeText = base;
      glideHomes = { ms: 600, fromFree: false };
      changed(new Set(['shapeText']));
      glideHomes = null;
    } else if (wordsBase !== null && S.shapeText !== wordsLast) wordsBase = null;
    return;
  }
  const fire = S.audioWordsEvery === 'drop' ? L.drop : (L.bar && musicBars % everyBars(S.audioWordsEvery) === 0) || L.drop;
  if (!fire || !cardAllows('shapeText')) return;
  if (wordsBase === null || S.shapeText !== wordsLast) wordsBase = S.shapeText;
  const word = words[wordsIdx++ % words.length];
  if (word === S.shapeText) return;
  wordsLast = word;
  settings.shapeText = word;
  const barSec = 240 / (L.bpm || 120);
  glideHomes = { ms: Math.min(700, barSec * 400), fromFree: false };
  changed(new Set(['shapeText']));
  glideHomes = null;
}

let lastVjName = '';
function vjNext() {
  const S = settings;
  if (S.audioVjFrom === 'shuffle') {
    shuffle();
    return;
  }
  if (S.audioVjFrom === 'mine' && myPresets.length) {
    // Keyed presets in key order, else all of them.
    const keyed = KEY_ORDER.map((d) => myPresets.find((p) => p.key === d)).filter((p): p is MyPreset => !!p);
    const list = keyed.length > 1 ? keyed : myPresets;
    playMine(list[vjIndex++ % list.length]);
    return;
  }
  // Built-in presets: from the family the current vibe suits, if it has one.
  const fam = currentVibe()?.suits;
  const pool = fam ? PRESETS.filter(([nm]) => FAMILY_OF[nm] === fam) : PRESETS;
  let k = (Math.random() * pool.length) | 0;
  if (pool[k][0] === lastVjName && pool.length > 1) k = (k + 1) % pool.length;
  lastVjName = pool[k][0];
  lastPresetFamily = FAMILY_OF[pool[k][0]] ?? null;
  apply(pool[k][1]);
  lastSceneName = pool[k][0];
  showToast(pool[k][0]);
}

// --- scene timeline -----------------------------------------------------------
// A setlist of scenes, each for a number of bars, changing on the bar. The
// clock is the music's (once a tempo is found) or a tempo you set or tap.
// Kept apart from Settings so scenes never overwrite the set.
type TlHow = 'xfade' | 'cut' | 'morph' | 'slow' | 'vslow' | 'drop' | 'gather' | 'implode' | 'fade' | 'flash' | 'whirl' | 'grow' | 'wipe' | 'freeze' | 'shatter';
type TlClip = { name: string; mine?: boolean; bars: number; how: TlHow; word?: string };
type Timeline = { words?: string; set?: string; on: boolean; clips: TlClip[]; clock: 'music' | 'tempo'; bpm: number; knobs: 'keep' | 'reset'; dropJump: boolean; ring: 'always' | 'changes' | 'hidden'; hold: boolean; held: Record<string, unknown> };
const TL_KEY = 'particle-field:timeline';
const TL_HOW: [TlHow, string][] = [
  ['cut', 'Cut'], ['morph', 'Morph (1 bar)'], ['slow', 'Slow morph (2 bars)'], ['vslow', 'Very slow (4 bars)'], ['drop', 'Drop'], ['gather', 'Gather & burst'], ['implode', 'Implode'],
  ['fade', 'Fade through black'], ['flash', 'Flash'], ['whirl', 'Whirl'], ['grow', 'Grow'], ['wipe', 'Wipe'], ['freeze', 'Freeze'], ['shatter', 'Shatter'],
];


// --- crossfader ----------------------------------------------------------------
// The fader sets how far between scene A and scene B the field is: numbers
// sit partway, the palette is a fixed mix of the two, and settings that can't
// be partway switch one by one between 35% and 65% (each at its own point),
// so the picture changes in small steps. The big ones (style, shape, flow
// type…) switch at 50% inside a short dip to dark that follows the fader,
// so even a slow push never shows a hard cut.
let xfLast = -1;
let xfAuto: { from: number; to: number; start: number; dur: number } | null = null;
const xfMoved = new Set<keyof Settings>();
let xfSettle = 0;
const xfPalCache = new Map<string, { shades: Rgb[]; bg: Rgb }>();
const XF_PAL = ['palette', 'customColors', 'customBg'] as const;
let xfUi: (() => void)[] = [];
let xfDip = 0; // 0..1, darkening around the middle when A and B differ in a big way
const XF_BIG = new Set<string>(['render', 'mixStyles', 'glyphSet', 'glyphFont', 'glyphPick', 'colorBy', 'glow', 'lensMirror', 'flowType', 'emitter', 'shape', 'shapeText', 'shapeIcon', 'shapeGeo', 'shapeSolid', 'shapeLive', 'shapeSeq', 'pointerMode']);
// Where each switch-only setting changes over: spread over 35-65% by name.
const xfFlipAt = (k: string) => {
  if (XF_BIG.has(k)) return 0.5;
  let hsh = 0;
  for (let i = 0; i < k.length; i++) hsh = (hsh * 31 + k.charCodeAt(i)) >>> 0;
  return 0.35 + ((hsh % 1000) / 1000) * 0.3;
};

function xfSave() {
  try {
    localStorage.setItem(XF_KEY, JSON.stringify({ ...xf, pingpong: false }));
  } catch {}
}
function xfScene(r: XfRef): Settings | null {
  if (r.mine) {
    const m = myPresets.find((p) => p.name === r.name);
    return m ? sceneTarget(m.settings, false) : null;
  }
  const p = PRESETS.find(([n]) => n === r.name);
  return p ? sceneTarget(p[1], true) : null;
}
// A side with your tweaks from the overview on top.
function xfSide(r: XfRef): Settings | null {
  const t = xfScene(r);
  return t && r.edits ? ({ ...t, ...r.edits } as Settings) : t;
}
// The palette's colours for a scene, worked out without showing them.
function xfShades(t: Settings) {
  const key = XF_PAL.map((k) => String(t[k])).join('|');
  let hit = xfPalCache.get(key);
  if (!hit) {
    const S = settings as unknown as Record<string, unknown>;
    const keep = XF_PAL.map((k) => S[k]);
    const mix = palMix;
    palMix = null;
    XF_PAL.forEach((k) => (S[k] = t[k]));
    buildShades();
    hit = { shades: shadeRgb.slice(), bg: pal().bg as Rgb };
    XF_PAL.forEach((k, i) => (S[k] = keep[i]));
    palMix = mix;
    xfPalCache.set(key, hit);
  }
  return hit;
}
function xfApply(pos: number) {
  const A = xfSide(xf.a);
  const B = xfSide(xf.b);
  if (!A || !B) return;
  morphState = null;
  pendingLook = null;
  intKeys ??= new Set(CONTROLS.flatMap((c) => (c.kind === 'range' && Number.isInteger(c.step) && c.step >= 1 ? [c.key as string] : [])));
  const S = settings as unknown as Record<string, unknown>;
  const a = A as unknown as Record<string, unknown>;
  const b = B as unknown as Record<string, unknown>;
  const flips = new Set<keyof Settings>();
  let big = false;
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    if (k === 'xfPos' || (XF_PAL as readonly string[]).includes(k)) continue;
    const va = a[k];
    const vb = b[k];
    let v: unknown;
    if (typeof va === 'number' && typeof vb === 'number') {
      let n2 = va + (vb - va) * pos;
      if (intKeys.has(k)) n2 = Math.round(n2);
      v = n2;
    } else {
      v = pos < xfFlipAt(k) ? va : vb;
      if (XF_BIG.has(k) && va !== vb) big = true;
    }
    if (S[k] === v) continue;
    S[k] = v;
    if (typeof v === 'number') xfMoved.add(k);
    else flips.add(k);
  }
  // Colours: B's palette, mixed from A's by the fader.
  const samePal = XF_PAL.every((k) => a[k] === b[k]);
  const pa = samePal ? null : xfShades(A);
  XF_PAL.forEach((k) => (S[k] = b[k]));
  palMix = pa ? { from: pa.shades, fromBg: pa.bg, start: 0, dur: 1, tick: 0, fixed: pos } : null;
  buildShades();
  if ('count' in DEFAULTS && xfMoved.has('count')) {
    const c = settings.count;
    settings.count = c < 100 ? Math.round(c) : Math.round(c / 10) * 10;
    setCount(countNow());
  }
  // The dip: dark at 50%, clear by 38% and 62%, eased.
  const d = Math.max(0, 1 - Math.abs(pos - 0.5) / 0.12);
  xfDip = big ? 0.92 * d * d * (3 - 2 * d) : 0;
  if (flips.size) {
    if ([...flips].some((k) => XF_BIG.has(k)) && !big) pictureFade(0.5);
    glideHomes = { ms: 700, fromFree: false };
    changed(flips);
    glideHomes = null;
  }
  xfSettle = performance.now() + 250;
}
function xfTick(now: number) {
  if (!xfLive()) return;
  if (xfAuto) {
    const u = Math.min(1, (now - xfAuto.start) / xfAuto.dur);
    const e = u * u * (3 - 2 * u);
    settings.xfPos = xfAuto.from + (xfAuto.to - xfAuto.from) * e;
    if (u >= 1) {
      settings.xfPos = xfAuto.to;
      xfAuto = xf.pingpong ? { from: xfAuto.to, to: 1 - xfAuto.to, start: now, dur: xfAuto.dur } : null;
    }
  }
  const pos = Math.max(0, Math.min(1, settings.xfPos + linkRun.out.macros.xfade));
  if (Math.abs(pos - xfLast) > 0.0015) {
    xfLast = pos;
    xfApply(pos);
    xfUi.forEach((f) => f());
  }
  // Once the fader rests, let the rest of the app catch up (shape sizes,
  // saved settings, the menu).
  if (xfSettle && now > xfSettle) {
    xfSettle = 0;
    const keys = new Set<keyof Settings>([...xfMoved, 'xfPos']);
    xfMoved.clear();
    changed(keys);
  }
}
function xfSetOn(on: boolean) {
  xf.on = on;
  xfAuto = null;
  xf.pingpong = false;
  xfLast = -1;
  if (on && tl.on) {
    tlSetOn(false);
    showToast('Timeline paused for the crossfader');
  }
  if (!on && palMix?.fixed !== undefined) {
    // Keep the colours you were nearer to.
    const A = settings.xfPos < 0.5 ? xfScene(xf.a) : null;
    if (A) XF_PAL.forEach((k) => ((settings as unknown as Record<string, unknown>)[k] = A[k]));
    palMix = null;
    changed(new Set(XF_PAL));
  }
  xfSave();
  xfUi.forEach((f) => f());
}
function xfBarSec() {
  const L = audio.levels;
  return 240 / (reacting() && L.bpm > 0 ? L.bpm : tl.bpm || 120);
}
function xfFadeTo(to: number) {
  if (!xf.on) xfSetOn(true);
  xf.pingpong = false;
  xfAuto = { from: settings.xfPos, to, start: performance.now(), dur: xf.bars * xfBarSec() * 1000 * Math.max(0.15, Math.abs(to - settings.xfPos)) };
}
function xfPingPong() {
  if (!xf.on) xfSetOn(true);
  xf.pingpong = !xf.pingpong;
  if (xf.pingpong) xfAuto = { from: settings.xfPos, to: settings.xfPos < 0.5 ? 1 : 0, start: performance.now(), dur: xf.bars * xfBarSec() * 1000 };
  else xfAuto = null;
  xfUi.forEach((f) => f());
}
function xfNudge(d: number) {
  xfAuto = null;
  xf.pingpong = false;
  settings.xfPos = Math.max(0, Math.min(1, settings.xfPos + d));
}
function xfSetScene(side: 'a' | 'b', v: string) {
  xf[side] = v.startsWith('my:') ? { name: v.slice(3), mine: true } : { name: v };
  xfLast = -1;
  xfSave();
  xfUi.forEach((f) => f());
}
const xfValue = (r: XfRef) => (r.mine ? `my:${r.name}` : r.name);
function xfOptions(sel: HTMLSelectElement) {
  sel.innerHTML = '';
  if (myPresets.length) {
    const g = document.createElement('optgroup');
    g.label = 'My scenes';
    for (const p of myPresets) g.append(new Option(p.name, `my:${p.name}`));
    sel.append(g);
  }
  libraryGroups(sel);
}
// The scene library in the same families as the Scenes tab, A-Z in each.
function libraryGroups(sel: HTMLSelectElement) {
  for (const [fam, label] of FAMILIES) {
    if (fam === 'all') continue;
    const names = PRESETS.map(([nm]) => nm).filter((nm) => (FAMILY_OF[nm] ?? 'stories') === fam).sort((x, y) => x.localeCompare(y));
    if (!names.length) continue;
    const g = document.createElement('optgroup');
    g.label = label;
    for (const nm of names) g.append(new Option(nm, nm));
    sel.append(g);
  }
}

// Field knobs past A–E: each with its setting and ✕, and a picker to add one.
function renderKnobsMore() {
  const box = document.createElement('div');
  box.className = 'knobs-more';
  let sig = '-';
  const pick = (value: string, onChange: (v: string) => void, first?: string) => {
    const sel = document.createElement('select');
    if (first) sel.add(new Option(first, ''));
    for (const [k, t] of PLAYABLE) if (k) sel.add(new Option(t, k));
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  };
  const set = (list: string[]) => {
    settings.knobsMore = list.filter(Boolean).join(',');
    if (settings.knobsMore) {
      settings.playOn = true;
      if (bypass.has('knobs')) setBypass('knobs', false);
    }
    changed(new Set<keyof Settings>(['knobsMore', 'playOn']));
  };
  const build = () => {
    if (sig === settings.knobsMore) return;
    sig = settings.knobsMore;
    box.textContent = '';
    const list = settings.knobsMore.split(',').filter(Boolean);
    list.forEach((key, i) => {
      const row = document.createElement('div');
      row.className = 'km-row';
      const name = document.createElement('span');
      name.textContent = `Knob ${String.fromCharCode(70 + i)}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '✕';
      del.setAttribute('aria-label', `Remove knob ${String.fromCharCode(70 + i)}`);
      del.addEventListener('click', () => set(list.filter((_, j) => j !== i)));
      row.append(name, pick(key, (v) => set(list.map((k, j) => (j === i ? v : k)))), del);
      box.append(row);
    });
    const add = pick('', (v) => v && set([...list, v]), '+ Add a knob…');
    add.className = 'km-add';
    box.append(add);
  };
  build();
  refreshers.push(() => box.isConnected && build());
  return box;
}
function renderXfader() {
  const box = document.createElement('div');
  box.className = 'xfader';
  const deck = (side: 'a' | 'b') => {
    const l = document.createElement('label');
    l.className = 'row select';
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = side === 'a' ? 'Scene A' : 'Scene B';
    const sel = document.createElement('select');
    xfOptions(sel);
    sel.value = xfValue(xf[side]);
    sel.addEventListener('focus', () => {
      xfOptions(sel);
      sel.value = xfValue(xf[side]);
    });
    sel.addEventListener('change', () => xfSetScene(side, sel.value));
    l.append(nm, sel);
    return l;
  };
  const row = document.createElement('div');
  row.className = 'xf-auto';
  const bars = document.createElement('select');
  bars.setAttribute('aria-label', 'Auto-fade length');
  for (const n2 of [1, 2, 4, 8, 16]) bars.add(new Option(`${n2} bar${n2 > 1 ? 's' : ''}`, String(n2)));
  bars.value = String(xf.bars);
  bars.addEventListener('change', () => {
    xf.bars = Number(bars.value);
    xfSave();
  });
  const btn = (text: string, fn: () => void) => {
    const b2 = document.createElement('button');
    b2.type = 'button';
    b2.textContent = text;
    b2.addEventListener('click', fn);
    row.append(b2);
    return b2;
  };
  btn('Fade to A', () => xfFadeTo(0));
  btn('Fade to B', () => xfFadeTo(1));
  const pp = btn('Back and forth', xfPingPong);
  const swap = document.createElement('button');
  swap.type = 'button';
  swap.className = 'xf-swap';
  swap.textContent = 'Swap A and B';
  swap.addEventListener('click', () => {
    [xf.a, xf.b] = [xf.b, xf.a];
    settings.xfPos = 1 - settings.xfPos;
    xfLast = -1;
    xfSave();
    box.replaceWith(renderXfader());
  });
  row.prepend(bars);
  xfUi.push(() => pp.classList.toggle('on', xf.pingpong));
  box.append(deck('a'), deck('b'), swap, row);
  return box;
}

// On the field: a slim fader with the two scene names at its ends.
const xfField = document.createElement('div');
xfField.className = 'xf-field';
xfField.hidden = true;
xfField.innerHTML = '<span class="xf-a"></span><div class="xf-track" role="slider" aria-label="Crossfader" aria-valuemin="0" aria-valuemax="100" tabindex="-1"><i></i><b></b></div><span class="xf-b"></span>';
document.body.append(xfField);
{
  const track = xfField.querySelector('.xf-track') as HTMLElement;
  const fill = track.querySelector('i') as HTMLElement;
  const thumb = track.querySelector('b') as HTMLElement;
  const la = xfField.querySelector('.xf-a') as HTMLElement;
  const lb = xfField.querySelector('.xf-b') as HTMLElement;
  let hideAt = 0;
  const show = () => {
    xfField.classList.add('show');
    hideAt = performance.now() + 1600;
    setTimeout(() => performance.now() >= hideAt && xfField.classList.remove('show'), 1700);
  };
  xfUi.push(() => {
    xfField.hidden = !xfLive();
    la.textContent = xf.a.name;
    lb.textContent = xf.b.name;
    const p = Math.max(0, Math.min(1, xfLast < 0 ? settings.xfPos : xfLast));
    fill.style.width = `${p * 100}%`;
    thumb.style.left = `${p * 100}%`;
    track.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    if (xfLive()) show();
  });
  const at = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    xfAuto = null;
    xf.pingpong = false;
    settings.xfPos = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  track.addEventListener('pointerdown', (e) => {
    track.setPointerCapture(e.pointerId);
    at(e);
    e.stopPropagation();
  });
  track.addEventListener('pointermove', (e) => track.hasPointerCapture(e.pointerId) && at(e));
  xfField.addEventListener('pointerdown', (e) => e.stopPropagation());
  xfField.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      xfNudge((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.002);
    },
    { passive: false },
  );
}

// --- timeline transitions ------------------------------------------------------
// How a clip comes in. Some move the particles (gather, implode, whirl,
// grow); some work on the picture (fade, flash, wipe, freeze, shatter), drawn
// on an overlay above the field that holds a snapshot of the old scene.
const fxCanvas = document.createElement('canvas');
fxCanvas.className = 'lens tlfx';
fxCanvas.setAttribute('aria-hidden', 'true');
fxCanvas.hidden = true;
const fxCtx = fxCanvas.getContext('2d')!;
const fxSnap = document.createElement('canvas');
lensCanvas.after(fxCanvas);
inkSync();
let tlGatherNow = false;
let whirlNow = 0;
type Shard = { pts: number[]; cx: number; cy: number; vx: number; vy: number; va: number };
let tlFx: { how: TlHow; start: number; dur: number; switchAt: number; go: (() => void) | null; shards?: Shard[] } | null = null;

function tlSnapshot() {
  const src = lensCanvas.hidden ? canvas : lensCanvas;
  fxSnap.width = src.width;
  fxSnap.height = src.height;
  const g = fxSnap.getContext('2d')!;
  g.filter = canvas.style.filter || 'none';
  g.drawImage(src, 0, 0);
}

// A plain crossfade of the picture, for morphs whose style can't glide.
// Leaves any timeline transition that is already drawing alone.
function pictureFade(sec: number) {
  if (tlFx && tlFx.how !== 'xfade') return;
  tlSnapshot();
  const now = performance.now();
  tlFx = { how: 'xfade', start: now, dur: sec * 1000, switchAt: now, go: null };
}

function tlTransition(how: TlHow, go: (morph: number) => void) {
  const bar = tlBarSec;
  const now = performance.now();
  // Morphs are measured in bars, so they feel the same at any tempo.
  const morphStd = Math.min(6, Math.max(0.5, bar));
  tlFx = null;
  tlGatherNow = false;
  whirlNow = 0;
  const fx = (dur: number, switchAt: number, after: (() => void) | null) => (tlFx = { how, start: now, dur: dur * 1000, switchAt: now + switchAt * 1000, go: after });
  switch (how) {
    case 'cut':
      return go(0);
    case 'slow':
      return go(Math.min(12, Math.max(1, bar * 2)));
    case 'vslow':
      return go(Math.min(24, Math.max(2, bar * 4)));
    case 'drop':
      explode();
      return go(morphStd);
    case 'gather': {
      // Pull in for half a bar, then burst out as the new scene.
      const d = Math.min(1.6, Math.max(0.6, bar / 2));
      tlGatherNow = true;
      fx(d, d, () => {
        tlGatherNow = false;
        go(0.4);
        explode();
      });
      return;
    }
    case 'implode':
      addWave('implode', w / 2, h / 2, { force: 1.6, speed: 1.6 });
      return go(Math.min(1.5, bar / 2));
    case 'whirl':
      fx(Math.min(3, Math.max(1.2, bar)), 0, null);
      return go(Math.min(2.5, bar));
    case 'grow':
      growFx = { from: 12, start: now, dur: Math.min(8, Math.max(3, bar * 2)) * 1000 };
      n = Math.min(n, 12);
      return go(Math.min(1.5, bar / 2));
    case 'fade': {
      const d = Math.min(2.4, Math.max(0.8, bar / 2));
      fx(d, d / 2, () => go(0));
      return;
    }
    case 'flash':
      fx(0.7, 0, null);
      return go(0);
    case 'wipe':
    case 'freeze':
    case 'shatter': {
      tlSnapshot();
      const d = how === 'wipe' ? Math.min(1.6, Math.max(0.6, bar * 0.6)) : how === 'freeze' ? Math.min(3, Math.max(1, bar)) : 1.6;
      fx(d, 0, null);
      if (how === 'shatter') tlFx!.shards = makeShards(fxSnap.width, fxSnap.height);
      return go(how === 'freeze' ? d * 0.8 : 0);
    }
    default:
      return go(morphStd);
  }
}

// Triangles over a jittered grid; each flies off from the centre and falls.
function makeShards(W: number, H: number): Shard[] {
  const cols = 9;
  const rows = Math.max(4, Math.round((cols * H) / W));
  const pt: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    pt.push([]);
    for (let c = 0; c <= cols; c++) {
      const jx = c > 0 && c < cols ? (Math.random() - 0.5) * 0.6 : 0;
      const jy = r > 0 && r < rows ? (Math.random() - 0.5) * 0.6 : 0;
      pt[r].push([((c + jx) / cols) * W, ((r + jy) / rows) * H]);
    }
  }
  const out: Shard[] = [];
  const k = Math.min(W, H) / 600;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = pt[r][c], b = pt[r][c + 1], d = pt[r + 1][c], e = pt[r + 1][c + 1];
      for (const tri of Math.random() < 0.5 ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]]) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const ang = Math.atan2(cy - H / 2, cx - W / 2);
        const sp = (2 + Math.random() * 6) * k;
        out.push({ pts: tri.flatMap(([x, y]) => [x - cx, y - cy]), cx, cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 4 * k, va: (Math.random() - 0.5) * 0.12 });
      }
    }
  return out;
}

// Each frame while a transition runs: fire its switch, move its particles,
// and draw its overlay.
function tlFxFrame(now: number) {
  const f = tlFx;
  const dip = xfLive() ? xfDip : 0;
  const need = (!!f && ['xfade', 'fade', 'flash', 'wipe', 'freeze', 'shatter'].includes(f.how)) || dip > 0.01;
  if (fxCanvas.hidden === need) fxCanvas.hidden = !need;
  if (!f) {
    // Crossfader dip: dark around the middle so the big switches happen unseen.
    if (dip > 0.01) {
      if (fxCanvas.width !== canvas.width || fxCanvas.height !== canvas.height) (fxCanvas.width = canvas.width), (fxCanvas.height = canvas.height);
      fxCtx.setTransform(1, 0, 0, 1, 0, 0);
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
      fxCtx.globalAlpha = dip;
      fxCtx.fillStyle = `rgb(${pal().bg.join(' ')})`;
      fxCtx.fillRect(0, 0, fxCanvas.width, fxCanvas.height);
      fxCtx.globalAlpha = 1;
    }
    return;
  }
  const u = Math.min(1, (now - f.start) / f.dur);
  if (f.go && now >= f.switchAt) {
    const go = f.go;
    f.go = null;
    go();
  }
  whirlNow = f.how === 'whirl' ? Math.sin(u * Math.PI) * 1.6 : 0;
  if (need) {
    const W = canvas.width;
    const H = canvas.height;
    if (fxCanvas.width !== W || fxCanvas.height !== H) (fxCanvas.width = W), (fxCanvas.height = H);
    const g = fxCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.clearRect(0, 0, W, H);
    if (f.how === 'fade') {
      g.globalAlpha = Math.sin(u * Math.PI);
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
    } else if (f.how === 'flash') {
      g.globalAlpha = (1 - u) * (1 - u);
      g.fillStyle = '#fff';
      g.fillRect(0, 0, W, H);
    } else if (f.how === 'wipe') {
      // The old picture slides off to the right behind a bright edge.
      const e = u * u * (3 - 2 * u) * W;
      if (e < W) g.drawImage(fxSnap, e, 0, W - e, H, e, 0, W - e, H);
      const lg = g.createLinearGradient(e - 28, 0, e + 2, 0);
      lg.addColorStop(0, 'rgb(255 255 255 / 0)');
      lg.addColorStop(1, 'rgb(255 255 255 / 0.3)');
      g.fillStyle = lg;
      g.fillRect(e - 28, 0, 30, H);
    } else if (f.how === 'xfade') {
      g.globalAlpha = 1 - u * u * (3 - 2 * u);
      g.drawImage(fxSnap, 0, 0);
    } else if (f.how === 'freeze') {
      g.globalAlpha = u < 0.3 ? 1 : 1 - (u - 0.3) / 0.7;
      g.drawImage(fxSnap, 0, 0);
    } else if (f.how === 'shatter' && f.shards) {
      const t = (now - f.start) / 16.67;
      const k = Math.min(W, H) / 600;
      g.globalAlpha = 1 - u * u;
      for (const s of f.shards) {
        const x = s.cx + s.vx * t;
        const y = s.cy + s.vy * t + 0.5 * 0.35 * k * t * t;
        g.setTransform(1, 0, 0, 1, x, y);
        g.rotate(s.va * t);
        g.beginPath();
        g.moveTo(s.pts[0], s.pts[1]);
        g.lineTo(s.pts[2], s.pts[3]);
        g.lineTo(s.pts[4], s.pts[5]);
        g.closePath();
        g.save();
        g.clip();
        g.drawImage(fxSnap, -s.cx, -s.cy);
        g.restore();
      }
    }
  }
  if (u >= 1 && !f.go) {
    tlFx = null;
    whirlNow = 0;
    fxCanvas.hidden = true;
  }
}
const TL_BARS = [1, 2, 4, 8, 16, 32];
const clip = (name: string, bars: number, how: TlHow): TlClip => ({ name, bars, how });
const TL_SETS: [string, TlClip[]][] = [
  ['Chill', [clip('Silk', 8, 'slow'), clip('Pond', 8, 'slow'), clip('Northern lights', 8, 'morph'), clip('Nebula', 8, 'slow')]],
  ['Club', [clip('Galaxy', 4, 'cut'), clip('Fireworks', 4, 'drop'), clip('Warp speed', 4, 'cut'), clip('Shatter', 4, 'drop'), clip('Black hole', 8, 'morph'), clip('Neon storm', 4, 'cut')]],
  ['Seed to tree', [clip('Seed', 8, 'slow'), clip('Sprout', 4, 'morph'), clip('Bud', 4, 'morph'), clip('Roots', 8, 'slow'), clip('Branches', 8, 'morph'), clip('Canopy', 8, 'morph'), clip('Blossom', 8, 'morph'), clip('Extravaganza', 16, 'drop')]],
  ['Big bang', [clip('Singularity', 8, 'implode'), clip('Big bang', 4, 'flash'), clip('Primordial gas', 8, 'slow'), clip('First stars', 8, 'morph'), clip('Galaxies', 8, 'whirl'), clip('Event horizon', 8, 'implode')]],
  ['Day to night', [clip('Dawn', 8, 'fade'), clip('Morning', 8, 'slow'), clip('Midday', 8, 'morph'), clip('Golden hour', 8, 'slow'), clip('Dusk embers', 8, 'fade'), clip('Firefly night', 8, 'slow'), clip('Starry night', 8, 'fade')]],
  ['Storm', [clip('Still pond', 8, 'fade'), clip('Wind rises', 8, 'morph'), clip('Rain', 4, 'wipe'), clip('Lightning', 4, 'flash'), clip('Full storm', 8, 'shatter'), clip('Clearing', 8, 'slow')]],
  ['Rain to ocean', [clip('Raindrop', 4, 'gather'), clip('Ripples', 8, 'grow'), clip('Streams', 8, 'morph'), clip('River', 8, 'wipe'), clip('Falls', 8, 'morph'), clip('Open ocean', 16, 'slow')]],
  ['Life of a star', [clip('Star cloud', 8, 'fade'), clip('Collapse', 4, 'implode'), clip('Young star', 8, 'morph'), clip('Red giant', 8, 'slow'), clip('Supernova', 4, 'drop'), clip('Remnant', 8, 'freeze')]],
  ['Murmuration', [clip('A few birds', 8, 'fade'), clip('Flock', 8, 'grow'), clip('Murmuration', 8, 'morph'), clip('The split', 8, 'morph'), clip('Sky shapes', 8, 'whirl'), clip('Scatter', 4, 'drop')]],
  ['Word story', []],
  ['Journey', [clip('Deep space', 8, 'slow'), clip('Galaxy', 8, 'morph'), clip('Black hole', 4, 'drop'), clip('Mandala', 8, 'morph'), clip('Pollen', 8, 'slow')]],
  // A short tour of every way to change scene, two bars each.
  ['Every transition', [clip('Galaxy', 2, 'cut'), clip('Silk', 2, 'morph'), clip('Embers', 2, 'slow'), clip('Mandala', 2, 'gather'), clip('Black hole', 2, 'implode'), clip('Fireworks', 2, 'drop'), clip('Northern lights', 2, 'fade'), clip('Snowfall', 2, 'flash'), clip('Prism', 2, 'whirl'), clip('Sunflower', 2, 'grow'), clip('Ink', 2, 'wipe'), clip('Comet shower', 2, 'freeze'), clip('Neon storm', 2, 'shatter'), clip('Nebula', 4, 'vslow')]],
  ['Hip hop', [clip('Neon storm', 4, 'cut'), clip('Shatter', 2, 'drop'), clip('Pulse rings', 4, 'cut'), clip('Warp speed', 4, 'flash'), clip('Neon sign', 4, 'shatter'), clip('Fireworks', 2, 'drop'), clip('Digital rain', 4, 'wipe'), clip('Black hole', 4, 'implode')]],
  ['Four elements', [clip('Campfire', 8, 'gather'), clip('Waterfall', 8, 'wipe'), clip('Sandstorm', 8, 'whirl'), clip('Wind tunnel', 8, 'morph'), clip('Prism', 8, 'flash')]],
  ['Fire and ice', [clip('Embers', 8, 'fade'), clip('Sparkler', 4, 'flash'), clip('Campfire', 8, 'morph'), clip('Snowfall', 8, 'freeze'), clip('Northern lights', 8, 'slow'), clip('Bubbles', 8, 'morph')]],
  ['Signal', [clip('Dot matrix', 4, 'cut'), clip('Digital rain', 8, 'wipe'), clip('ASCII', 4, 'flash'), clip('Weather map', 8, 'morph'), clip('Compass', 4, 'whirl'), clip('Runes', 8, 'shatter')]],
  ['Garden', [clip('Pond', 8, 'fade'), clip('Sunflower', 8, 'grow'), clip('Pollen', 8, 'slow'), clip('Fireflies', 8, 'morph'), clip('Lattice', 8, 'morph'), clip('Halo', 8, 'slow')]],
  ['Swarms', [clip('Midges', 8, 'fade'), clip('School of fish', 8, 'morph'), clip('Starlings', 8, 'morph'), clip('Marbles', 4, 'drop'), clip('Crowd', 8, 'gather'), clip('Orbit', 8, 'whirl')]],
  ['Ink and paper', [clip('Ink', 8, 'fade'), clip('Marbled paper', 8, 'slow'), clip('Smoke writing', 8, 'morph'), clip('Typewriter', 4, 'cut'), clip('Silk ribbons', 8, 'wipe'), clip('Dusk', 8, 'vslow')]],
  ['Sacred geometry', [clip('Triangle', 8, 'gather'), clip('Hive', 8, 'morph'), clip('Hexagram', 8, 'morph'), clip('Flower of life', 8, 'grow'), clip('Rose curve', 8, 'whirl'), clip('Crystal', 8, 'morph'), clip('Spirograph', 8, 'morph'), clip('Mandala', 16, 'slow')]],
  ['Shapeshifter', [clip('Heartbeat', 8, 'gather'), clip('DNA', 8, 'morph'), clip('Globe', 8, 'whirl'), clip('Spirograph', 8, 'morph'), clip('Equalizer', 8, 'cut')]],
  ['Countdown', [clip('Midnight clock', 16, 'fade'), clip('Singularity', 4, 'implode'), clip('Big bang', 4, 'flash'), clip('Fireworks', 16, 'drop')]],
  ['Lullaby', [clip('Bokeh', 16, 'vslow'), clip('Fireflies', 16, 'vslow'), clip('Pond', 16, 'vslow'), clip('Starry night', 16, 'vslow'), clip('Deep space', 16, 'vslow')]],
];
// Word story: your words one at a time, each in its own lettering, with a
// short abstract scene between them.
const WORD_SCENES = ['Neon sign', 'Marquee', 'Glyph word', 'Breathing word', 'Dot matrix', 'Smoke writing'];
const WORD_GAPS = ['Galaxy', 'Silk', 'Starlings', 'Neon storm'];
const WORD_HOW: TlHow[] = ['gather', 'shatter', 'wipe', 'whirl', 'flash'];
function wordStory(text: string): TlClip[] {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean).slice(0, 16);
  return words.flatMap((word, i) => [
    { ...clip(WORD_SCENES[i % WORD_SCENES.length], 4, WORD_HOW[i % WORD_HOW.length]), word: word.slice(0, 14) },
    clip(WORD_GAPS[i % WORD_GAPS.length], 2, 'morph'),
  ]);
}
const tl: Timeline = { on: false, clips: [], clock: 'music', bpm: 120, knobs: 'keep', dropJump: false, ring: 'changes', hold: true, held: {}, ...readJson<Partial<Timeline>>(TL_KEY, {}) };
// Not held: they already carry over, or belong to the timeline itself.
const TL_NO_HOLD = new Set<string>([...VIEW_KEYS, 'links', 'playOn', 'playLeft', 'playWheel3', 'playWheel4', 'playRight', 'playWheel5', 'knobsMore', 'knobsPick', 'playTwo', 'playPinch', 'mEnergy', 'mOrder', 'mDream', 'mHeat', 'mDensity', 'audioVibe']);
let tlChips: (() => void) | null = null;
// A change you make while the timeline plays sticks for the rest of the set.
function tlHold(keys: Iterable<keyof Settings>) {
  if (!tlActive() || !tl.hold) return;
  let any = false;
  for (const k of keys) {
    if (TL_NO_HOLD.has(k) || k.startsWith('lens') || k === 'audioKaleido') continue;
    tl.held[k] = settings[k];
    any = true;
  }
  if (!any) return;
  writeJson(TL_KEY, tl);
  tlChips?.();
}
// A held value as text, e.g. "Trails 80%".
function heldLabel(k: string, v: unknown) {
  const c = CONTROLS.find((x) => 'key' in x && x.key === k);
  if (!c || !('label' in c)) return `${k} ${String(v)}`;
  if (c.kind === 'range') return `${c.label} ${c.format ? c.format(v as number) : String(v)}`;
  if (c.kind === 'select') return `${c.label}: ${c.options.find(([o]) => o === v)?.[1] ?? String(v)}`;
  return `${c.label}: ${v === true ? 'on' : v === false ? 'off' : String(v)}`;
}
let tlIdx = -1; // clip playing, -1 before the start
let tlBarsIn = 0; // whole bars played of it
let tlQueued = -1; // clip to start on the next bar
let tlLastBarAt = 0;
let tlBarSec = 2;
let tlShownAt = 0; // when the ring last popped up
let tlRedraw: (() => void) | null = null; // the card's list, when drawn
let tlProgress: ((frac: number) => void) | null = null;
// The built-in scene playing, for "Add this scene" and so a scene change or
// shuffle knows what that scene switched on (kept across reloads).
const SCENE_NAME_KEY = 'particle-field:scene-name';
let lastSceneName = (() => {
  try {
    return localStorage.getItem(SCENE_NAME_KEY) ?? '';
  } catch {
    return '';
  }
})();
const keepSceneName = () => {
  try {
    localStorage.setItem(SCENE_NAME_KEY, lastSceneName);
  } catch {
    /* not kept */
  }
};
addEventListener('pagehide', keepSceneName);
document.addEventListener('visibilitychange', () => document.hidden && keepSceneName());

// Options (tempo, ring, …) don't touch the list: redrawing it under a click
// that blurred the tempo box would swallow the click.
function tlSave(redraw = true) {
  writeJson(TL_KEY, tl);
  tlRingBuild();
  if (redraw) tlRedraw?.();
}
function tlScene(c: TlClip): Partial<Settings> | null {
  if (c.mine) return myPresets.find((p) => p.name === c.name)?.settings ?? null;
  return PRESETS.find(([n]) => n === c.name)?.[1] ?? null;
}
function tlSetOn(on: boolean) {
  tl.on = on;
  if (on && xf.on) xfSetOn(false);
  // Held tweaks belong to one run of the set.
  if (!on) {
    tlHolding = false;
    tl.held = {};
    tlChips?.();
  }
  tlIdx = -1;
  tlQueued = -1;
  tlLastBarAt = 0;
  tlSave();
}
function tlQueue(i: number) {
  if (!tl.clips.length) return;
  tlQueued = ((i % tl.clips.length) + tl.clips.length) % tl.clips.length;
  if (!tl.on) tlSetOn(true);
  tlShownAt = performance.now();
  showToast(`Next: ${tl.clips[tlQueued].name} (on the bar)`);
  tlRedraw?.();
}
function tlGo(i: number) {
  const n = tl.clips.length;
  // Skip clips whose scene is gone (a deleted My scene).
  for (let k = 0; k < n; k++) {
    const j = (i + k) % n;
    const c = tl.clips[j];
    const base = tlScene(c);
    if (!base) continue;
    const p: Partial<Settings> = c.word ? { ...base, shape: 'text', shapeText: c.word, shapeCycle: 0 } : base;
    tlIdx = j;
    tlQueued = -1;
    tlBarsIn = 0;
    tlShownAt = performance.now();
    if (tl.knobs === 'reset') for (const [mk] of MACROS) (settings as unknown as Record<string, number>)[mk] = 0.5;
    const go = (morph: number) => {
      if (c.mine) {
        const mine = myPresets.find((p2) => p2.name === c.name);
        lastPresetFamily = null;
        apply(p, false, { now: true, morph });
        currentMine = mine ?? null;
        redrawMine();
      } else {
        lastPresetFamily = FAMILY_OF[c.name] ?? null;
        apply(p, true, { now: true, morph });
        lastSceneName = c.name;
      }
    };
    tlTransition(c.how, go);
    if (tl.ring === 'hidden') showToast(c.name);
    tlRedraw?.();
    return;
  }
  showToast('The timeline has no scenes it can play');
  tlSetOn(false);
}
const tlActive = () => tl.on && tl.clips.length > 0 && !bypass.has('timeline');

function tlTick(now: number) {
  if (!tlActive()) {
    tlRing(now);
    return;
  }
  const L = audio.levels;
  const music = tl.clock === 'music' && reacting() && L.bpm > 0;
  let bar = false;
  if (music) {
    tlBarSec = 240 / L.bpm;
    bar = L.bar;
    if (bar) tlLastBarAt = now;
  } else {
    tlBarSec = 240 / tl.bpm;
    if (!tlLastBarAt) tlLastBarAt = now;
    else if (now - tlLastBarAt >= tlBarSec * 1000) {
      bar = true;
      tlLastBarAt += tlBarSec * 1000;
      if (now - tlLastBarAt > tlBarSec * 1000) tlLastBarAt = now;
    }
  }
  if (tlIdx < 0 || tlIdx >= tl.clips.length) {
    tlLastBarAt = now;
    tlGo(tlQueued >= 0 ? tlQueued : 0);
  } else if (bar) {
    tlBarsIn++;
    if (tlQueued >= 0) tlGo(tlQueued);
    else if (tlBarsIn >= tl.clips[tlIdx].bars) {
      // Holding: start the scene's bars over instead of moving on.
      if (tlHolding) tlBarsIn = 0;
      else tlGo(tlIdx + 1);
    }
  } else if (music && tl.dropJump && L.drop && tlBarsIn > 0 && !tlHolding) tlGo(tlQueued >= 0 ? tlQueued : tlIdx + 1);
  tlRing(now);
}
// How far through the current clip, 0..1.
function tlFrac(now: number) {
  const c = tl.clips[tlIdx];
  if (!c) return 0;
  const inBar = tlLastBarAt ? Math.min(1, (now - tlLastBarAt) / (tlBarSec * 1000)) : 0;
  return Math.min(1, (tlBarsIn + inBar) / c.bars);
}

// The loop ring: the whole set as one circle, each arc a clip sized by its
// bars. A dot travels round; the playing arc is lit.
const TL_R = 70;
const tlRingEl = document.createElement('div');
tlRingEl.className = 'tl-ring';
tlRingEl.innerHTML = `<svg viewBox="0 0 168 168" aria-hidden="true"><circle class="bg" cx="84" cy="84" r="${TL_R}"/><g class="arcs"></g><circle class="dot" r="4" cx="84" cy="14"/></svg><div class="tl-txt"><b></b><span></span><i></i></div>`;
tlRingEl.title = 'Timeline: click for the next scene, scroll to pick one';
document.querySelector('.stage')!.append(tlRingEl);
const tlArcs = tlRingEl.querySelector<SVGGElement>('.arcs')!;
const tlDot = tlRingEl.querySelector<SVGCircleElement>('.dot')!;
const [tlName, tlBar, tlNext] = [...tlRingEl.querySelector('.tl-txt')!.children] as HTMLElement[];
let tlArcEls: SVGPathElement[] = [];
let tlHover = false;
const tlPt = (t: number): [number, number] => {
  const a = -Math.PI / 2 + t * Math.PI * 2;
  return [84 + Math.cos(a) * TL_R, 84 + Math.sin(a) * TL_R];
};
function tlRingBuild() {
  tlArcs.innerHTML = '';
  tlArcEls = [];
  const total = tl.clips.reduce((a, c) => a + c.bars, 0);
  if (!total) return;
  const gap = tl.clips.length > 1 ? 0.012 : 0;
  let at = 0;
  for (const c of tl.clips) {
    const t0 = at / total + gap;
    const t1 = (at + c.bars) / total - gap;
    at += c.bars;
    const [x0, y0] = tlPt(t0);
    const [x1, y1] = tlPt(Math.max(t0 + 0.001, t1));
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', tl.clips.length === 1 ? `M 84 ${84 - TL_R} A ${TL_R} ${TL_R} 0 1 1 83.99 ${84 - TL_R}` : `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${TL_R} ${TL_R} 0 ${t1 - t0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`);
    tlArcs.append(p);
    tlArcEls.push(p);
  }
}
function tlRing(now: number) {
  // The card's progress bar follows along even with the ring hidden.
  if (tlActive() && tlIdx >= 0) tlProgress?.(tlFrac(now));
  const on = tlActive() && tl.ring !== 'hidden';
  tlRingEl.hidden = !on;
  if (!on) return;
  const show = tl.ring === 'always' || tlHover || now - tlShownAt < 3500;
  tlRingEl.classList.toggle('show', show);
  if (tlIdx < 0) return;
  const total = tl.clips.reduce((a, c) => a + c.bars, 0);
  const before = tl.clips.slice(0, tlIdx).reduce((a, c) => a + c.bars, 0);
  const c = tl.clips[tlIdx];
  const frac = tlFrac(now);
  const [x, y] = tlPt((before + frac * c.bars) / total);
  tlDot.setAttribute('cx', x.toFixed(2));
  tlDot.setAttribute('cy', y.toFixed(2));
  tlArcEls.forEach((el, k) => el.classList.toggle('on', k === tlIdx));
  tlName.textContent = c.name;
  tlBar.textContent = `bar ${Math.min(c.bars, tlBarsIn + 1)} / ${c.bars}`;
  const nx = tlQueued >= 0 ? tlQueued : (tlIdx + 1) % tl.clips.length;
  tlNext.textContent = tl.clips.length > 1 ? `${tlQueued >= 0 ? 'queued' : 'next'}: ${tl.clips[nx].name}` : '';
}
tlRingEl.addEventListener('pointerenter', () => (tlHover = true));
tlRingEl.addEventListener('pointerleave', () => (tlHover = false));
tlRingEl.addEventListener('click', () => tlQueue((tlQueued >= 0 ? tlQueued : tlIdx) + 1));
let tlWheelAcc = 0;
tlRingEl.addEventListener(
  'wheel',
  (e) => {
    // The ring's own scroll: step the queued clip; the knobs don't see it.
    e.preventDefault();
    e.stopPropagation();
    tlWheelAcc += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    if (Math.abs(tlWheelAcc) < 60) return;
    const step = tlWheelAcc > 0 ? 1 : -1;
    tlWheelAcc = 0;
    tlQueue((tlQueued >= 0 ? tlQueued : tlIdx) + step);
  },
  { passive: false },
);
tlRingBuild();

// Tap tempo: the average gap of the last few taps.
let tlTaps: number[] = [];
function tlTap() {
  const t = performance.now();
  tlTaps = tlTaps.filter((x) => t - x < 2500).concat(t);
  if (tlTaps.length >= 2) {
    const gaps = tlTaps.slice(1).map((x, k) => x - tlTaps[k]);
    tl.bpm = Math.max(50, Math.min(200, Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length))));
    tlLastBarAt = t;
    tlSave();
  }
}

// "Add this scene": the scene playing; a tweaked or unnamed one is saved to
// My scenes first so the timeline can come back to it.
function tlAddCurrent() {
  let c: TlClip;
  if (currentMine) c = { name: currentMine.name, mine: true, bars: 8, how: 'morph' };
  else if (lastSceneName) c = { name: lastSceneName, bars: 8, how: 'morph' };
  else {
    const name = `Timeline ${myPresets.length + 1}`;
    myPresets.push({ name, settings: snapshot() });
    writeJson(MY_PRESETS_KEY, myPresets);
    redrawMine();
    c = { name, mine: true, bars: 8, how: 'morph' };
    showToast(`Saved to My scenes as ${name}`);
  }
  tl.clips.push(c);
  tlSave();
}

function renderRecord() {
  const box = document.createElement('div');
  box.className = 'record';
  if (!canRecord()) {
    box.innerHTML = '<p class="rec-note">This browser can’t record the canvas. Chrome, Edge, Firefox and Safari 14.1+ can.</p>';
    return box;
  }
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'rec-go';
  go.addEventListener('click', toggleRecord);
  const row = (label: string, el: HTMLElement) => {
    const r = document.createElement('label');
    r.className = 'row select';
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = label;
    r.append(n, el);
    return r;
  };
  const sel = (opts: [string, string][], get: () => string, put: (v: string) => void) => {
    const s = document.createElement('select');
    for (const [v, t] of opts) s.add(new Option(t, v));
    s.addEventListener('change', () => put(s.value));
    recUi.push(() => (s.value = get()));
    return s;
  };
  const len = sel(RECORD_LENGTHS, () => String(recorder.prefs.secs), (v) => recorder.setPrefs({ secs: Number(v) }));
  const size = sel(RECORD_SIZES, () => recorder.prefs.size, (v) => recorder.setPrefs({ size: v as never }));
  const snd = document.createElement('label');
  snd.className = 'row toggle';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.addEventListener('change', () => recorder.setPrefs({ sound: cb.checked }));
  const sn = document.createElement('span');
  sn.className = 'name';
  sn.textContent = 'Include the sound source';
  snd.append(cb, sn);
  const note = document.createElement('p');
  note.className = 'rec-note';
  const ready = document.createElement('div');
  ready.className = 'rec-ready';
  recUi.push(() => {
    cb.checked = recorder.prefs.sound;
    go.classList.toggle('on', recorder.on);
    go.textContent = recorder.on ? 'Stop recording' : 'Start recording';
    note.textContent =
      'Records the field only: lenses, view moves and colour effects included; the menu, knobs and camera preview are left out. ' +
      (audio.source === 'off' || audio.source === 'feed' ? 'No sound source is on, so the clip will be silent.' : audio.source === 'mic' ? 'Sound comes from the microphone, so it records the room.' : '') +
      ' Shortcut: V starts and stops.';
    ready.innerHTML = '';
    if (recorder.clip && !recorder.on) {
      const t = document.createElement('span');
      t.textContent = `${recorder.clip.name} · ${(recorder.clip.blob.size / 1e6).toFixed(1)} MB`;
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = 'Save';
      save.addEventListener('click', () => recorder.save());
      ready.append(t, save);
      if (recorder.canShare()) {
        const sh = document.createElement('button');
        sh.type = 'button';
        sh.textContent = 'Share';
        sh.addEventListener('click', () => void recorder.share());
        ready.append(sh);
      }
    }
  });
  box.append(go, row('Length', len), row('Size', size), snd, ready, note);
  recUi.forEach((f) => f());
  return box;
}

// The Timeline card has three views: Play (what's on now, the transport and
// what's next), Edit (the set as one-line rows) and Sets (ready-made sets and
// the word story).
type TlView = 'play' | 'edit' | 'sets';
const TL_VIEW_KEY = 'particle-field:tl-view';
let tlView: TlView = readJson<TlView>(TL_VIEW_KEY, 'play');
let tlOpen = -1; // the row open in Edit
let tlHolding = false; // Hold: stay on this scene until you let go
const tlShort = (h: TlHow) => (TL_HOW.find(([k]) => k === h)?.[1] ?? h).replace(/ \(.*\)$/, '').replace(' through black', '').replace(' & burst', '');
const TL_STORIES = new Set(['Seed to tree', 'Big bang', 'Day to night', 'Storm', 'Rain to ocean', 'Life of a star', 'Murmuration']);

function renderTimeline() {
  const box = document.createElement('div');
  box.className = 'timeline';
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  };
  const btn = (text: string, cls = '', fn?: () => void, label?: string) => {
    const b = mk('button', cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    if (fn) b.addEventListener('click', fn);
    return b;
  };
  const sel = (opts: [string, string][], value: string, label: string, change: (v: string) => void) => {
    const s = mk('select');
    s.setAttribute('aria-label', label);
    for (const [v, t] of opts) s.add(new Option(t, v));
    s.value = value;
    s.addEventListener('change', () => change(s.value));
    return s;
  };
  const clipName = (c: TlClip) => (c.word ? `“${c.word}” · ${c.name}` : c.name);

  // Play / Edit / Sets
  const seg = mk('div', 'tl-seg');
  seg.setAttribute('role', 'tablist');
  const segBtns: [TlView, HTMLButtonElement][] = [];
  for (const [v, t] of [['play', 'Play'], ['edit', 'Edit'], ['sets', 'Sets']] as [TlView, string][]) {
    const b = btn(t, '', () => setView(v));
    b.setAttribute('role', 'tab');
    segBtns.push([v, b]);
    seg.append(b);
  }
  const playPane = mk('div', 'tl-pane tl-play');
  const editPane = mk('div', 'tl-pane tl-edit');
  const setsPane = mk('div', 'tl-pane tl-sets');
  const setView = (v: TlView) => {
    tlView = v;
    writeJson(TL_VIEW_KEY, v);
    for (const [k, b] of segBtns) {
      b.classList.toggle('on', k === v);
      b.setAttribute('aria-selected', String(k === v));
    }
    playPane.hidden = v !== 'play';
    editPane.hidden = v !== 'edit';
    setsPane.hidden = v !== 'sets';
  };

  // --- Play ---
  const now = mk('div', 'tl-now');
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 84 84');
  ring.setAttribute('class', 'tl-bar-ring');
  ring.innerHTML = '<circle cx="42" cy="42" r="36" class="bg"/><circle cx="42" cy="42" r="36" class="fg" stroke-dasharray="0 227" transform="rotate(-90 42 42)"/><text x="42" y="41" class="n"></text><text x="42" y="56" class="u">bars</text>';
  const ringFg = ring.querySelector<SVGCircleElement>('.fg')!;
  const ringN = ring.querySelector<SVGTextElement>('.n')!;
  const nowTxt = mk('div', 'tl-now-txt');
  const nowSet = mk('span', 'tl-lbl');
  const nowName = mk('b');
  const nowNext = mk('span', 'tl-next');
  nowTxt.append(nowSet, nowName, nowNext);
  now.append(ring, nowTxt);
  const icon = (d: string, fill = false) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${d}</svg>`;
  const transport = mk('div', 'tl-transport');
  const prev = btn('', '', () => tlQueue((tlQueued >= 0 ? tlQueued : tlIdx) - 1), 'Previous scene (on the bar)');
  prev.innerHTML = icon('<path d="M18 5l-9 7 9 7z"/><path d="M6 5v14"/>');
  const playBtn = btn('', 'play', () => {
    if (!tl.clips.length) return setView('sets');
    tlSetOn(!tl.on);
    tlHolding = false;
    changed(new Set());
    drawPlay();
  });
  const next = btn('', '', () => tlQueue((tlQueued >= 0 ? tlQueued : tlIdx) + 1), 'Next scene (on the bar)');
  next.innerHTML = icon('<path d="M6 5l9 7-9 7z"/><path d="M18 5v14"/>');
  const holdBtn = btn('Hold', 'hold', () => {
    tlHolding = !tlHolding;
    showToast(tlHolding ? 'Holding this scene' : 'Moving on at the end of this scene');
    drawPlay();
  });
  holdBtn.title = 'Stay on this scene until you let go';
  transport.append(prev, playBtn, next, holdBtn);
  const upLbl = mk('div', 'tl-lbl', 'Up next · tap to queue');
  const upList = mk('div', 'tl-up');
  const playEmpty = mk('p', 'tl-empty', 'No set yet. Pick one in Sets, or build your own in Edit.');
  playPane.append(now, transport, upLbl, upList, playEmpty);
  let lastN = '';
  const drawPlay = () => {
    const has = tl.clips.length > 0;
    now.hidden = transport.hidden = upLbl.hidden = upList.hidden = !has;
    playEmpty.hidden = has;
    if (!has) return;
    const active = tlActive() && tlIdx >= 0;
    const i = active ? tlIdx : 0;
    const c = tl.clips[i];
    nowSet.textContent = `${tl.set ?? 'My set'} · ${i + 1} of ${tl.clips.length}${tlHolding ? ' · holding' : ''}`;
    nowName.textContent = active ? clipName(c) : `Starts with ${clipName(c)}`;
    const nx = tlQueued >= 0 ? tlQueued : (i + 1) % tl.clips.length;
    nowNext.textContent = tl.clips.length > 1 ? `${tlQueued >= 0 ? 'queued' : 'next'}: ${clipName(tl.clips[nx])} · ${tlShort(tl.clips[nx].how)}` : '';
    playBtn.innerHTML = tl.on ? icon('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', true) : icon('<path d="M7 4l13 8-13 8z"/>', true);
    playBtn.setAttribute('aria-label', tl.on ? 'Stop the timeline' : 'Play the timeline');
    holdBtn.classList.toggle('on', tlHolding);
    holdBtn.setAttribute('aria-pressed', String(tlHolding));
    if (!active) setRing(0, c.bars);
    upList.innerHTML = '';
    for (let k = 1; k < Math.min(tl.clips.length, 5); k++) {
      const j = (i + k) % tl.clips.length;
      const cj = tl.clips[j];
      const b = btn('', 'tl-up-row', () => tlQueue(j), `Play ${cj.name} next`);
      b.classList.toggle('queued', j === tlQueued);
      b.append(mk('span', '', clipName(cj)), mk('i', '', j === 0 && k > 0 && i > 0 ? 'loops back' : `${cj.bars} bar${cj.bars > 1 ? 's' : ''} · ${tlShort(cj.how)}`));
      upList.append(b);
    }
  };
  const setRing = (frac: number, bars: number) => {
    ringFg.setAttribute('stroke-dasharray', `${(frac * 226.2).toFixed(1)} 227`);
    const n = `${Math.min(bars, Math.floor(frac * bars) + 1)}/${bars}`;
    if (n !== lastN) ringN.textContent = lastN = n;
  };

  // --- Edit ---
  const list = mk('div', 'tl-list');
  const draw = () => {
    list.innerHTML = '';
    if (!tl.clips.length) list.append(mk('p', 'tl-empty', 'No scenes yet. Add the one playing, pick one below, or load a set in Sets.'));
    tl.clips.forEach((c, k) => {
      const row = mk('div', 'tl-clip');
      row.classList.toggle('on', tl.on && k === tlIdx);
      row.classList.toggle('queued', k === tlQueued);
      row.classList.toggle('open', k === tlOpen);
      const top = mk('div', 'tl-top');
      const grip = mk('span', 'tl-grip');
      grip.title = 'Drag to move';
      grip.setAttribute('aria-hidden', 'true');
      const name = btn('', 'tl-name', () => {
        tlOpen = tlOpen === k ? -1 : k;
        draw();
      });
      name.setAttribute('aria-expanded', String(k === tlOpen));
      name.append(mk('span', 'nm', clipName(c)), mk('i', 'tag', tlShort(c.how)), mk('i', 'tag n', String(c.bars)));
      top.append(grip, name);
      row.append(top);
      grip.addEventListener('pointerdown', (e) => dragRow(e, k, row));
      if (k === tlOpen) {
        const body = mk('div', 'tl-detail');
        const acts = mk('div', 'tl-acts');
        acts.append(
          btn('Play next', '', () => tlQueue(k)),
          btn('↑', '', () => move(k, -1), `Move ${c.name} up`),
          btn('↓', '', () => move(k, 1), `Move ${c.name} down`),
          btn('Remove', 'rm', () => {
            tl.clips.splice(k, 1);
            if (tlIdx === k) tlIdx = -1;
            else if (tlIdx > k) tlIdx--;
            tlQueued = -1;
            tlOpen = -1;
            tlSave();
          }),
        );
        const chipRow = (label: string, opts: [string, string][], cur: string, pick: (v: string) => void) => {
          const r = mk('div', 'tl-opt');
          r.append(mk('span', 'tl-lbl', label));
          const w = mk('div', 'tl-chips');
          for (const [v, t] of opts) {
            const b = btn(t, v === cur ? 'on' : '', () => pick(v));
            b.setAttribute('aria-pressed', String(v === cur));
            w.append(b);
          }
          r.append(w);
          return r;
        };
        body.append(
          acts,
          chipRow('Bars', TL_BARS.map((b) => [String(b), String(b)]), String(c.bars), (v) => {
            c.bars = Number(v);
            tlSave();
          }),
          chipRow('In', TL_HOW.map(([h]) => [h, tlShort(h)]), c.how, (v) => {
            c.how = v as TlHow;
            tlSave();
          }),
        );
        row.append(body);
      }
      list.append(row);
    });
  };
  const move = (k: number, d: number) => moveTo(k, k + d);
  const moveTo = (k: number, j: number) => {
    if (j < 0 || j >= tl.clips.length || j === k) return;
    const playing = tl.clips[tlIdx];
    const [c] = tl.clips.splice(k, 1);
    tl.clips.splice(j, 0, c);
    if (playing) tlIdx = tl.clips.indexOf(playing);
    tlQueued = -1;
    if (tlOpen === k) tlOpen = j;
    tlSave();
  };
  // Drag a row by its grip (mouse or finger) to a new place.
  const dragRow = (e: PointerEvent, k: number, row: HTMLElement) => {
    e.preventDefault();
    const rows = [...list.querySelectorAll<HTMLElement>('.tl-clip')];
    const mids = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2;
    });
    const y0 = e.clientY;
    let to = k;
    row.classList.add('dragging');
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      row.style.transform = `translateY(${dy}px)`;
      const y = mids[k] + dy;
      to = mids.filter((m, i) => i !== k && m < y).length;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      row.classList.remove('dragging');
      row.style.transform = '';
      if (to !== k) moveTo(k, to);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const add = mk('div', 'tl-add');
  const addThis = btn('+ This scene', '', tlAddCurrent);
  const pick = mk('select');
  pick.setAttribute('aria-label', 'Add a scene');
  const refill = () => {
    pick.innerHTML = '';
    pick.add(new Option('+ Pick a scene…', ''));
    if (myPresets.length) {
      const g = mk('optgroup');
      g.label = 'My scenes';
      for (const p of myPresets) g.append(new Option(p.name, `my:${p.name}`));
      pick.append(g);
    }
    libraryGroups(pick);
  };
  pick.addEventListener('focus', refill);
  pick.addEventListener('pointerdown', refill);
  refill();
  pick.addEventListener('change', () => {
    const v = pick.value;
    if (!v) return;
    tl.clips.push(v.startsWith('my:') ? { name: v.slice(3), mine: true, bars: 8, how: 'morph' } : { name: v, bars: 8, how: 'morph' });
    pick.value = '';
    tlSave();
  });
  add.append(addThis, pick);

  // Tempo and options fold away under the list.
  const fold = (title: string, summary: () => string) => {
    const d = mk('details', 'tl-fold');
    const s = mk('summary');
    const st = mk('span', 'tl-fold-sum');
    s.append(mk('span', '', title), st);
    d.append(s);
    const sync = () => (st.textContent = summary());
    sync();
    return { d, sync };
  };
  const tempoF = fold('Tempo', () => (tl.clock === 'music' ? `From the music · ${tl.bpm} BPM until it has one` : `${tl.bpm} BPM`));
  const opts = mk('div', 'tl-opts');
  const field = (parent: HTMLElement, label: string, el: HTMLElement) => {
    const l = mk('label', 'row select');
    l.append(mk('span', 'name', label), el);
    parent.append(l);
    return l;
  };
  field(tempoF.d, 'Clock', sel([['music', 'From the music'], ['tempo', 'Tempo below']], tl.clock, 'Clock', (v) => {
    tl.clock = v as Timeline['clock'];
    tlSave(false);
    tempoF.sync();
  }));
  const tempo = mk('div', 'tl-tempo');
  const bpmIn = mk('input');
  bpmIn.type = 'number';
  bpmIn.min = '50';
  bpmIn.max = '200';
  bpmIn.value = String(tl.bpm);
  bpmIn.setAttribute('aria-label', 'Tempo in BPM');
  bpmIn.addEventListener('change', () => {
    tl.bpm = Math.max(50, Math.min(200, Number(bpmIn.value) || 120));
    tlSave(false);
    tempoF.sync();
  });
  const tap = btn('Tap', '', () => {
    tlTap();
    bpmIn.value = String(tl.bpm);
    tempoF.sync();
  });
  tap.title = 'Tap a few times in time with the beat';
  tempo.append(mk('span', 'name', 'Tempo'), bpmIn, mk('span', '', 'BPM'), tap);
  tempoF.d.append(tempo);

  const optF = fold('Options', () => [tl.hold ? 'hold tweaks' : '', tl.ring === 'hidden' ? 'no ring' : tl.ring === 'always' ? 'ring always' : 'ring at changes', tl.dropJump ? 'jump on drops' : ''].filter(Boolean).join(' · '));
  const hold = mk('label', 'row toggle');
  const hcb = mk('input');
  hcb.type = 'checkbox';
  hcb.checked = tl.hold;
  hcb.addEventListener('change', () => {
    tl.hold = hcb.checked;
    tlSave(false);
    drawChips();
    optF.sync();
  });
  hold.append(hcb, mk('span', 'name', 'Hold my tweaks: what I change stays for the whole set'));
  const chips = mk('div', 'tl-held');
  const drawChips = () => {
    chips.innerHTML = '';
    const keys = Object.keys(tl.held);
    chips.hidden = !tl.hold || !keys.length;
    for (const k of keys) {
      const b = btn(`${heldLabel(k, tl.held[k])}  ✕`, 'tl-chip', () => {
        delete tl.held[k];
        tlSave(false);
        drawChips();
      });
      b.title = 'Stop holding this: scenes set it again';
      chips.append(b);
    }
    if (keys.length > 1)
      chips.append(
        btn('Clear all', 'tl-chip clear', () => {
          tl.held = {};
          tlSave(false);
          drawChips();
        }),
      );
  };
  tlChips = drawChips;
  drawChips();
  optF.d.append(opts);
  opts.append(hold, chips);
  field(opts, 'Knobs at a change', sel([['keep', 'Keep where they are'], ['reset', 'Back to the scene']], tl.knobs, 'Knobs at a change', (v) => {
    tl.knobs = v as Timeline['knobs'];
    tlSave(false);
  }));
  field(opts, 'Ring on the field', sel([['changes', 'At each change'], ['always', 'Always'], ['hidden', 'Hidden']], tl.ring, 'Ring on the field', (v) => {
    tl.ring = v as Timeline['ring'];
    tlShownAt = performance.now();
    tlSave(false);
    optF.sync();
  }));
  const drop = mk('label', 'row toggle');
  const cb = mk('input');
  cb.type = 'checkbox';
  cb.checked = tl.dropJump;
  cb.addEventListener('change', () => {
    tl.dropJump = cb.checked;
    tlSave(false);
    optF.sync();
  });
  drop.append(cb, mk('span', 'name', 'Jump to the next scene on a drop'));
  opts.append(drop);
  editPane.append(list, add, tempoF.d, optF.d);

  // --- Sets ---
  const loadSet = (name: string, clips: TlClip[]) => {
    if (!clips.length) return;
    tl.clips = clips;
    tl.set = name;
    tlIdx = -1;
    tlQueued = -1;
    tlOpen = -1;
    tlHolding = false;
    if (!tl.on) tl.on = true;
    tlSave();
    changed(new Set());
    setView('play');
  };
  const grid = mk('div', 'tl-setgrid');
  const drawSets = () => {
    grid.innerHTML = '';
    for (const [n, clips] of TL_SETS) {
      if (n === 'Word story') continue;
      const b = btn('', 'tl-set', () => loadSet(n, clips.map((c) => ({ ...c }))));
      b.classList.toggle('on', tl.set === n && tl.clips.length > 0);
      b.append(mk('b', '', n), mk('span', '', `${tl.set === n && tl.on ? 'playing · ' : ''}${TL_STORIES.has(n) ? 'Story' : 'Mix'} · ${clips.length} scenes`));
      grid.append(b);
    }
  };
  const words = mk('input', 'tl-words');
  words.type = 'text';
  words.maxLength = 120;
  words.placeholder = 'Type words for a story';
  words.setAttribute('aria-label', 'Words for a word story');
  words.value = tl.words ?? 'HELLO WE ARE HERE';
  const makeWords = () => {
    tl.words = words.value.trim() || 'HELLO WE ARE HERE';
    loadSet('Word story', wordStory(tl.words));
  };
  words.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') makeWords();
  });
  const wrow = mk('div', 'tl-wordrow');
  wrow.append(words, btn('Tell it', '', makeWords));
  const empty = btn('Start an empty set', 'tl-new', () => {
    tl.clips = [];
    tl.set = undefined;
    tlIdx = -1;
    tlQueued = -1;
    tlOpen = -1;
    tlSave();
    setView('edit');
  });
  setsPane.append(grid, mk('div', 'tl-lbl', 'Tell a word story'), wrow, empty);

  tlRedraw = () => {
    draw();
    drawPlay();
    drawSets();
  };
  tlProgress = (frac) => {
    const c = tl.clips[tlIdx];
    if (c && tlView === 'play') setRing(frac, c.bars);
  };
  tlRedraw();
  box.append(seg, playPane, editPane, setsPane);
  setView(tl.clips.length ? tlView : 'sets');
  return box;
}

let intKeys: Set<string> | null = null;
function tickMorph(now: number, beat: boolean) {
  if (pendingLook && (beat || now - pendingLook.since > 2500 || !settings.beatSnap || !reacting())) {
    const t2 = pendingLook.target;
    pendingLook = null;
    morphTo(t2);
  }
  if (palMix && palMix.fixed === undefined) {
    const u = Math.min(1, (now - palMix.start) / palMix.dur);
    if (u >= 1) {
      palMix = null;
      buildShades();
    } else if (palMix.tick++ % 4 === 0) buildShades();
  }
  if (homeGlide) {
    const hg = homeGlide;
    const u = Math.min(1, (now - hg.start) / hg.dur);
    const ease = (v: number) => (v < 0.5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2);
    const e = ease(u);
    const len = Math.min(n, hg.fx.length);
    const dl = hg.dl;
    for (let i = 0; i < len; i++) {
      // Each particle can start late (an entrance), then catches up by the end.
      const ei = dl ? ease(Math.min(1, Math.max(0, (u - dl[i]) / Math.max(0.05, 1 - dl[i])))) : e;
      hx[i] = hg.fx[i] + (hg.tx[i] - hg.fx[i]) * ei;
      hy[i] = hg.fy[i] + (hg.ty[i] - hg.fy[i]) * ei;
    }
    if (u >= 1) homeGlide = null;
  }
  if (!morphState) return;
  const m = morphState;
  const u = Math.min(1, (now - m.start) / m.dur);
  const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; // ease in-out
  const S = settings as unknown as Record<string, number>;
  for (const k in m.to) S[k] = m.from[k] + (m.to[k] - m.from[k]) * e;
  // Whole-number settings (lengths, counts, every-N) glide in whole steps.
  intKeys ??= new Set(CONTROLS.flatMap((c) => (c.kind === 'range' && Number.isInteger(c.step) && c.step >= 1 ? [c.key as string] : [])));
  for (const k in m.to) if (intKeys.has(k)) S[k] = Math.round(S[k]);
  if ('count' in m.to) {
    S.count = S.count < 100 ? Math.round(S.count) : Math.round(S.count / 10) * 10;
    setCount(countNow());
  }
  if (u >= 1) {
    morphState = null;
    changed(new Set(Object.keys(m.to) as (keyof Settings)[]));
  }
}

// The background, blended while a palette crossfades.
function bgNow(): Rgb {
  const bg = pal().bg as Rgb;
  if (!palMix) return bg;
  const u = palMix.fixed ?? Math.min(1, (performance.now() - palMix.start) / palMix.dur);
  return [0, 1, 2].map((c) => palMix!.fromBg[c] + (bg[c] - palMix!.fromBg[c]) * u) as Rgb;
}

let prevEmitter: Emitter = settings.emitter;
function changed(keys: Set<keyof Settings>, morphing = false) {
  save();
  if (keys.has('count')) setCount(countNow());
  if (keys.has('glyphSet') || keys.has('glyphText')) buildGlyphs();
  if (keys.has('shape') && settings.shape === 'solid' && settings.depth === 0) {
    settings.depth = 0.7;
    refresh();
  }
  if (keys.has('shapeSeq')) seqIdx = 0;
  if (keys.has('shape') && settings.shape !== 'drawing') drawMode = false;
  if (keys.has('shape') || keys.has('drawOutline')) inkSync();
  if (keys.has('shape') || keys.has('shapeText') || keys.has('shapeIcon') || keys.has('shapeGeo') || keys.has('shapeSolid') || keys.has('shapePattern') || keys.has('patScale') || keys.has('patForm') || keys.has('patVary') || keys.has('patSeed') || keys.has('shapeLive') || keys.has('shapeSeq') || keys.has('imageMode') || keys.has('shapeSize') || keys.has('count')) {
    const g = glideHomes && settings.shape !== 'none' ? glideHomes : null;
    const fx = g ? (g.fromFree ? px : hx).slice(0, n) : null;
    const fy = g ? (g.fromFree ? py : hy).slice(0, n) : null;
    const before = shapeKey;
    buildShape();
    if (g && fx && fy && shapeKey !== before) homeGlide = { fx, fy, tx: hx.slice(0, n), ty: hy.slice(0, n), start: performance.now(), dur: g.ms };
    else if (!g) homeGlide = null;
  }
  // The camera turns on with the camera shape and off without it.
  if (keys.has('links')) syncLinks();
  if (CAM_KEYS.some((k) => keys.has(k))) {
    if (camWanted() && !cam.on) void startCamera();
    else if (!camWanted() && cam.on) stopCamera();
    else if (cam.on) syncTrackers();
  }
  if (keys.has('mirrorWorld') && isCam()) {
    shapeKey = '';
    buildShape();
  }
  if (keys.has('camDepth') && settings.camDepth && settings.depth === 0) {
    settings.depth = 0.7;
    refresh();
  }
  if (keys.has('colorBy')) {
    camShades = null;
    camColourAt = 0;
  }
  if (keys.has('emitter') && settings.emitter !== prevEmitter) {
    prevEmitter = settings.emitter;
    emitterChanged();
  }
  if (keys.has('palette') || keys.has('customColors') || keys.has('customBg')) {
    buildShades();
    if (!morphing) clear();
  }
  refresh();
}

const conditional: [HTMLElement, () => boolean][] = [];

function refresh() {
  for (const r of refreshers) r();
  for (const [el, show] of conditional) el.hidden = !show();
  for (const r of afterShow) r();
}
// Runs after the show/hide pass (Fine-tune counts).
const afterShow: (() => void)[] = [];

// Essentials: the controls a card shows first, picked from what the scenes
// and vibes set most (plus each card's main choice). The rest wait under
// Fine-tune. Cards with 4 or fewer settings show everything.
const ESSENTIALS: Record<string, (keyof Settings)[]> = {
  transitions: ['homeStrength', 'morph'],
  look: ['render', 'mixStyles', 'size', 'trail', 'glow'],
  colour: ['palette', 'colorBy', 'customColors'],
  shape: ['shape', 'shapeText', 'shapeIcon', 'shapeGeo', 'shapePattern', 'patScale', 'patForm', 'patVary', 'shapeSolid', 'shapeLive', 'shapeSeq', 'shapeSeqEvery', 'shapeSeqSec', 'drawOutline', 'shapeSpin', 'imageMode', 'shapeSize'],
  life: ['lifespan', 'emitter', 'launchSpeed'],
  particles: ['count', 'friction', 'jitter'],
  forces: ['gravity', 'wind', 'windDir'],
  swarm: ['flock', 'space'],
  obstacles: ['obstacles', 'obsText', 'obsShow', 'obsForce'],
  pointer: ['pointerMode', 'click', 'radius', 'playTwo', 'playPinch'],
  drums: ['audioKick', 'audioPulse', 'audioSpeed'],
  mcolour: ['audioHue', 'audioHueAmt', 'audioBright'],
  camera: ['audioCam', 'audioSpin', 'audioCuts'],
  viewfx: ['audioTunnel', 'audioEcho', 'audioKaleido'],
  mwords: ['audioWordsOn', 'audioWords', 'audioWordPulse'],
  camshape: ['camMode', 'camSnap', 'camCentre'],
  hands: ['camHands', 'camHandReach', 'camHandForce', 'drawColour'],
};
// Settings you pinned from Fine-tune to a card's essentials (this device).
const PINS_KEY = 'particle-field:pins';
const pins = new Set<string>(readJson<string[]>(PINS_KEY, []));
const PIN_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 4h6l-1 6 4 4H6l4-4-1-6z"/><path d="M12 14v6"/></svg>';
// Extra words search should find a setting by.
const SEARCH_WORDS: Partial<Record<keyof Settings, string>> = {
  trail: 'blur fade motion', glow: 'bright bloom', size: 'big small', count: 'number amount many', gravity: 'fall drop down',
  audioCam: 'zoom shake punch', mirrorWorld: 'mirror symmetry reflect', camMirror: 'mirror flip selfie', audioFlip: 'mirror flip',
  audioKaleido: 'mirror symmetry', palette: 'theme', render: 'look shape dots', morph: 'transition fade glide', homeStrength: 'spring',
  shapeText: 'word letters', audioWords: 'text letters', camHands: 'draw paint spray', lifespan: 'age die', speed: 'fast slow',
  audioTunnel: 'zoom feedback', depth: '3d', audioSpin: 'rotate turn', twoDist: 'zoom', twoAngle: 'rotate turn',
};

const TAB_KEY = 'particle-field:tab';
const MORE_KEY = 'particle-field:more';
const tabButtons: [Tab, HTMLButtonElement][] = [];
// S1: one React tab holds Music, Camera and Connections, picked by chips.
const REACT_TABS: Tab[] = ['music', 'camera', 'links'];
let lastReact: Tab = 'music';
const reactSub: [Tab, HTMLButtonElement][] = [];
// The dock's page buttons light up while their page is open.
const dockTabs: [Tab, HTMLButtonElement][] = [];
let dockMoreBtn: HTMLButtonElement | null = null;
let dockMoreEl: HTMLElement | null = null;
function toggleDockMore(open = !dockMoreEl?.classList.contains('open')) {
  if (!dockMoreEl) {
    dockMoreEl = document.createElement('div');
    dockMoreEl.className = 'dock-more';
    const items: [string, string, () => void][] = [
      ['Gather to the centre (A)', ICONS.gather, toggleGather],
      ['Explode from the centre (E)', ICONS.explode, () => explode()],
      ['Scatter (S)', ICONS.scatter, scatter],
      ['Project to another screen (P)', ICONS.project, toggleProject],
      ['Recording settings', ICONS.record, () => showTab('record')],
      ['Reset to defaults and clear locks', ICONS.reset, reset],
    ];
    for (const [t, ic, fn] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `${ic}<span></span>`;
      b.querySelector('span')!.textContent = t;
      b.addEventListener('click', () => {
        fn();
        toggleDockMore(false);
      });
      if (fn === toggleGather) gatherButtons.push(b);
      if (fn === toggleProject) projectUi.push(() => (b.querySelector('span')!.textContent = projector.on ? 'Stop projecting (P)' : t));
      dockMoreEl.append(b);
    }
    document.getElementById('actionbar')!.append(dockMoreEl);
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (dockMoreEl?.classList.contains('open') && !dockMoreEl.contains(t) && !dockMoreBtn?.contains(t)) toggleDockMore(false);
    });
  }
  dockMoreEl.classList.toggle('open', open);
  dockMoreBtn?.classList.toggle('on', open);
}
const sectionTabs: [HTMLElement, Tab][] = [];
// What a card had when you switched it off, so switching on brings it back.
const powerMemory: Record<string, Partial<Settings>> = {};

let currentTab: Tab = 'presets';
let folderSync: (() => void) | null = null;
let lockPaint: (() => void) | null = null;
let folderEnter: (() => void) | null = null;
const intentButtons: [Intent, HTMLButtonElement][] = [];
const INTENT_KEY = 'particle-field:intent-pages';
// The page you were last on in each intent, so switching back lands there.
const lastPage: Partial<Record<Intent, Tab>> = readJson<Partial<Record<Intent, Tab>>>(INTENT_KEY, {});
function setBypass(t: Tab, off: boolean) {
  if (off) bypass.add(t);
  else bypass.delete(t);
  try {
    localStorage.setItem(BYPASS_KEY, JSON.stringify([...bypass]));
  } catch {
    /* not persisted */
  }
  if (t === 'links') syncLinks();
  // Links can be what keeps the camera on, so check it whichever tab it is.
  if (camWanted() && !cam.on) void startCamera();
  else if (!camWanted() && cam.on) stopCamera();
  if (t === 'xfader') for (const f of xfUi) f();
  if (t === 'timeline') tlRingBuild();
  const label = TABS.find(([x]) => x === t)![1];
  showToast(off ? `${label} is off: settings kept, nothing from it reaches the field` : `${label} is back on`);
  syncBypassUi();
  refresh();
}
// Grey out a switched-off tab's cards, and mark it in the page picker.
function syncBypassUi() {
  for (const [el, t] of sectionTabs) if (!el.classList.contains('tab-power')) el.classList.toggle('bypassed', bypass.has(t));
  for (const b of document.querySelectorAll<HTMLElement>('.picker button[data-tab], .tabs button[data-tab]')) b.classList.toggle('bypassed', bypass.has(b.dataset.tab as Tab));
}
const PLAY_PAGES: Tab[] = ['presets', 'timeline', 'xfader', 'knobs', 'record'];
let playFrom: Tab = 'shape';
function backFromPlay() {
  showTab(playFrom);
}
function showTab(tab: Tab) {
  currentTab = tab;
  const intent = intentOf(tab);
  lastPage[intent] = tab;
  for (const [i, b] of intentButtons) {
    b.classList.toggle('on', i === intent);
    b.setAttribute('aria-selected', String(i === intent));
  }
  for (const [t, b] of dockTabs) b.classList.toggle('on', t === tab);
  if (REACT_TABS.includes(tab)) lastReact = tab;
  for (const [t, b] of reactSub) b.classList.toggle('on', t === tab);
  document.getElementById('panel')!.dataset.page = tab;
  // Scenes and the Play pages are views of their own: a Back bar replaces
  // the strip and the tabs, and leads to the page you came from.
  // With the folders, every page is a plain folder: no separate Play views.
  const play = false && PLAY_PAGES.includes(tab);
  if (!play) playFrom = tab;
  document.getElementById('panel')!.toggleAttribute('data-play', play);
  for (const t of document.querySelectorAll('.ss-back b')) t.textContent = tab === 'presets' ? 'All scenes' : TABS.find(([x]) => x === tab)![1];
  for (const [t, b] of tabButtons) {
    b.classList.toggle('on', t === tab || (t === 'music' && REACT_TABS.includes(tab)));
    b.setAttribute('aria-selected', String(t === tab));
  }
  const ftabs = folderOf(tab).tabs;
  for (const [el, t] of sectionTabs) el.classList.toggle('other-tab', !ftabs.includes(t));
  folderSync?.();
  const title = document.getElementById('sheet-title');
  if (title) {
    title.querySelector('small')!.textContent = INTENTS.find(([i]) => i === intent)![1];
    title.querySelector('b')!.textContent = TABS.find(([t]) => t === tab)![1];
  }
  for (const b of document.querySelectorAll<HTMLElement>('.picker button')) b.classList.toggle('on', b.dataset.tab === tab);
  try {
    localStorage.setItem(TAB_KEY, tab);
    localStorage.setItem(INTENT_KEY, JSON.stringify(lastPage));
  } catch {
    /* not persisted */
  }
}

// Jump to the Connections card (React › Connections), opened.
function openConnections() {
  showTab('links');
  const sec = document.querySelector<HTMLElement>('[data-sec="links"]');
  if (!sec) return;
  if (sec.classList.contains('closed')) sec.querySelector<HTMLElement>('[aria-controls]')?.click();
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// A dot on a tab when one of its cards is locked.
function syncTabDots() {
  lockPaint?.();
  for (const [t, b] of tabButtons) {
    const locked = CONTROLS.some((c) => c.kind === 'section' && pageOf(c) === t && locks.has(c.id));
    b.classList.toggle('has-lock', locked);
  }
  for (const [i, b] of intentButtons) b.classList.toggle('has-lock', tabButtons.some(([t, tb]) => intentOf(t) === i && tb.classList.contains('has-lock')));
}

// A live dot on a page (and its group) while something there is running:
// sound in, camera on, timeline or crossfader playing, recording, connections.
const LIVE_OF: Partial<Record<Tab, () => boolean>> = {
  music: () => audio.source !== 'off',
  camera: () => cam.on,
  timeline: () => tlActive(),
  xfader: () => xf.on,
  record: () => recorder.on,
  links: () => parseLinks(settings.links).length > 0,
};
let liveSig = '';
function syncLiveDots() {
  const live = new Set((Object.keys(LIVE_OF) as Tab[]).filter((t) => LIVE_OF[t]!()));
  const sig = [...live].join();
  if (sig === liveSig) return;
  liveSig = sig;
  for (const [t, b] of tabButtons) b.classList.toggle('is-live', live.has(t));
  for (const b of document.querySelectorAll<HTMLElement>('.picker button')) b.classList.toggle('is-live', live.has(b.dataset.tab as Tab));
  for (const [i, b] of intentButtons) b.classList.toggle('is-live', [...live].some((t) => intentOf(t) === i));
  document.getElementById('sheet-title')?.classList.toggle('is-live', live.size > 0);
}
setInterval(syncLiveDots, 400);

function setPower(ctl: Extract<Control, { kind: 'section' }>, on: boolean) {
  const pw = ctl.power!;
  if (on === pw.on()) return;
  let patch: Partial<Settings>;
  if (on) patch = powerMemory[ctl.id] ?? pw.start;
  else {
    powerMemory[ctl.id] = Object.fromEntries((ctl.lock ?? []).map((k) => [k, settings[k]]));
    patch = pw.off;
  }
  Object.assign(settings, patch);
  // A remembered "on" that was really off (e.g. after a preset) falls back to the start values.
  if (on && !pw.on()) {
    Object.assign(settings, pw.start);
    patch = { ...patch, ...pw.start };
  }
  changed(new Set(Object.keys(patch) as (keyof Settings)[]));
  return Object.keys(patch) as (keyof Settings)[];
}

const COLLAPSE_KEY = 'particle-field:folded';

const lockSyncs: (() => void)[] = [];

// --- search ----------------------------------------------------------------------
// Finds any setting by its name, its options, its card or a few extra words,
// across all tabs. Typing shows only the matching cards and settings.
const norm = (t: string) => t.toLowerCase().replace(/colou?r/g, 'colour').replace(/\s+/g, ' ');
function searchItem(to: HTMLElement, el: HTMLElement, words = '') {
  el.classList.add('si');
  if (words) el.dataset.words = words;
  to.append(el);
}
// S1's scene strip: the scenes of the playing one's family as small
// swatches (their palettes), the current one ringed. Browse opens the library.
function sceneStrip() {
  const el = document.createElement('div');
  el.className = 'scene-strip';
  el.innerHTML = '<div class="ss-head"><span></span><button type="button" class="ss-browse">Browse all ›</button></div><div class="ss-row"></div><div class="ss-back"><button type="button">‹ Back</button><b>All scenes</b></div>';
  const label = el.querySelector<HTMLElement>('.ss-head span')!;
  const row = el.querySelector<HTMLElement>('.ss-row')!;
  // Browsing is its own view: the strip and the tabs give way to a Back bar.
  el.querySelector('.ss-browse')!.addEventListener('click', () => {
    showTab('presets');
    const lib = document.querySelector<HTMLElement>('[data-sec="presets"]');
    if (lib?.classList.contains('closed')) lib.querySelector<HTMLElement>('.group-head')?.click();
    controls.scrollTop = 0;
  });
  el.querySelector('.ss-back button')!.addEventListener('click', backFromPlay);
  const swatch = (p: Partial<Settings>) => {
    const key = (p.palette ?? DEFAULTS.palette) as keyof typeof PALETTES;
    const def = PALETTES[key] ?? PALETTES[DEFAULTS.palette as keyof typeof PALETTES];
    const st = def.stops;
    const c = (k: number) => { const [hh, ss, ll] = st[Math.min(st.length - 1, k)]; return `hsl(${hh} ${ss}% ${ll}%)`; };
    const [r, g, b] = def.bg;
    return `radial-gradient(circle at 35% 40%, ${c(0)}, ${c(Math.floor(st.length / 2))} 45%, ${c(st.length - 1)} 70%, rgb(${r} ${g} ${b}) 100%)`;
  };
  let key = '';
  const sync = () => {
    el.querySelector('.ss-back b')!.textContent = currentTab === 'presets' ? 'All scenes' : TABS.find(([x]) => x === currentTab)![1];
    const cur = currentMine?.name ?? lastSceneName;
    const fam: Family = (lastSceneName && !currentMine && FAMILY_OF[lastSceneName]) || (presetFamily === 'all' ? 'space' : presetFamily);
    const k = `${fam}|${cur}`;
    if (k === key) return;
    key = k;
    label.textContent = `Scenes · ${familyLabel(fam)}`;
    row.textContent = '';
    let on: HTMLElement | null = null;
    for (const [name, p] of PRESETS.filter(([n]) => FAMILY_OF[n] === fam).sort(([a], [b]) => a.localeCompare(b))) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ss-scene';
      b.innerHTML = '<i></i><span></span>';
      b.querySelector<HTMLElement>('i')!.style.background = swatch(p);
      b.querySelector('span')!.textContent = name;
      b.title = name;
      b.addEventListener('click', () => playPreset(name, p));
      if (name === cur && !currentMine) { b.classList.add('on'); on = b; }
      row.append(b);
    }
    if (on) requestAnimationFrame(() => {
      const a = on!.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      row.scrollLeft += a.left - r.left - r.width / 2 + a.width / 2;
    });
  };
  sync();
  setInterval(sync, 600);
  return el;
}

function renderSearch() {
  const wrap = document.createElement('div');
  wrap.className = 'search';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = matchMedia('(pointer: fine)').matches ? `Search all settings   ${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'}K` : 'Search all settings';
  input.setAttribute('aria-label', 'Search settings');
  const empty = document.createElement('p');
  empty.className = 'search-empty';
  empty.hidden = true;
  wrap.append(input);
  queueMicrotask(() => controls.prepend(empty));
  const run = () => {
    const words = norm(input.value).trim().split(' ').filter(Boolean);
    const on = words.join('').length >= 2;
    controls.classList.toggle('searching', on);
    document.body.classList.toggle('searching', on);
    for (const el of controls.querySelectorAll('.hit, .all')) el.classList.remove('hit', 'all');
    empty.hidden = true;
    if (!on) return;
    const has = (t: string) => words.every((w) => t.includes(w));
    // Names first; only when no name matches, look inside the options too.
    let found = 0;
    for (const full of [false, true]) {
      for (const g of controls.querySelectorAll<HTMLElement>(':scope > .group')) {
        if (g.hidden) continue;
        if (has(norm(g.dataset.label ?? ''))) {
          g.classList.add('hit', 'all');
          found++;
          continue;
        }
        for (const it of g.querySelectorAll<HTMLElement>('.si')) {
          if (it.hidden || it.closest('[hidden]:not(.more-body)')) continue;
          const key = it.querySelector<HTMLElement>('[data-key]')?.dataset.key ?? '';
          const name = it.querySelector('.name')?.textContent ?? '';
          if (!full && !name) continue;
          // A long list (a knob picker lists every setting) doesn't count as its text.
          const long = !!it.querySelector('select') && it.querySelectorAll('option').length > 30;
          const text = full && !long ? it.textContent : name;
          if (has(norm(`${text} ${key} ${it.dataset.words ?? ''}`))) {
            it.classList.add('hit');
            g.classList.add('hit');
            found++;
          }
        }
      }
      if (found) break;
    }
    if (!found) {
      empty.hidden = false;
      empty.textContent = `Nothing called “${input.value.trim()}”. Try another word.`;
    }
  };
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      input.value = '';
      run();
      input.blur();
    }
  });
  // Picking a tab ends the search.
  queueMicrotask(() =>
    document.querySelectorAll('.tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        if (!input.value) return;
        input.value = '';
        run();
      }),
    ),
  );
  return wrap;
}

// --- mix grid (Music and Camera) ---------------------------------------------
// One screen for how the music and the camera move the field: triggers down
// the side, families of reactions across the top. Each cell holds one or more
// flavours that map straight onto the settings the classic cards use, so the
// two views always agree. Tap steps off · low · mid · high, a sideways swipe
// turns the row into a strength bar, a long press opens the flavours and
// their fine settings.

type MgFlav = {
  label: string;
  get: () => number; // 0..1
  put: (v: number) => void;
  // Pick-one flavours: which variant (Snare: swirl, ripple or flash).
  choice?: { options: [string, string][]; get: () => string; put: (v: string) => void };
  fine?: (keyof Settings)[];
  note?: string;
  action?: [string, () => void];
  // No strength to set (a moment fires or it doesn't).
  fixed?: () => boolean;
};
// src: a Connections input; its connections show as reactions in the list too.
type MgRow = { name: string; when?: string; group?: string; src?: string; level?: () => number; hi?: number; live?: () => boolean; cells: (MgFlav[] | null)[] };
// list: draw as "When you… → …the particles" rows instead of a matrix (for sparse grids).
// chips: one row of effects with no trigger (a card full of off-by-default effects); cols are the groups.
// all: every reaction as a chip, the ones that are off dashed (the music page).
type MgGrid = { cols: string[]; rows: MgRow[]; list?: boolean; chips?: boolean; all?: boolean };

const ctlOf = (k: keyof Settings) => CONTROLS.find((c) => 'key' in c && c.key === k) as Extract<Control, { key: keyof Settings }> | undefined;
function mgPut(k: keyof Settings, v: number) {
  const c = ctlOf(k);
  if (c && c.kind === 'range') {
    v = Math.round(v / c.step) * c.step;
    v = Math.min(c.max, Math.max(c.min, +v.toFixed(4)));
  }
  set(k, v as never);
}
const num = (k: keyof Settings) => settings[k] as unknown as number;
// A plain amount: 0 is off.
// Sliding to the far left is off (0), even where the classic slider starts
// higher because its card switch is the way off (Drop strength, Separation).
const mgRange = (label: string, k: keyof Settings, hi: number, more: Partial<MgFlav> = {}): MgFlav => ({
  label, get: () => clamp01(num(k) / hi), put: (v) => (v <= 0.02 ? set(k, 0 as never) : mgPut(k, v * hi)), ...more,
});
// An on/off switch.
const mgToggle = (label: string, k: keyof Settings, more: Partial<MgFlav> = {}): MgFlav => ({
  label, get: () => (settings[k] ? 1 : 0), put: (v) => set(k, (v > 0.05) as never), ...more,
});
// A mode that is on at one value, with an amount for how much.
function mgMode(label: string, k: keyof Settings, on: string, off: string, amt: keyof Settings | null, hi = 1, more: Partial<MgFlav> = {}): MgFlav {
  return {
    label,
    get: () => (settings[k] === on ? (amt ? clamp01(num(amt) / hi) : 1) : 0),
    put: (v) => {
      if (v <= 0.05) {
        if (settings[k] === on) set(k, off as never);
        return;
      }
      set(k, on as never);
      if (amt) mgPut(amt, Math.max(v * hi, 0.05 * hi));
    },
    ...more,
  };
}
// A mode with several "on" values (pick one), plus an amount.
function mgPick(label: string, k: keyof Settings, options: [string, string][], off: string, amt: keyof Settings | null, hi = 1, more: Partial<MgFlav> = {}): MgFlav {
  const ons = options.map(([o]) => o);
  let last = ons.includes(settings[k] as string) ? (settings[k] as string) : ons[0];
  return {
    label,
    get: () => (ons.includes(settings[k] as string) ? (amt ? clamp01(num(amt) / hi) : 1) : 0),
    put: (v) => {
      if (v <= 0.05) {
        if (ons.includes(settings[k] as string)) {
          last = settings[k] as string;
          set(k, off as never);
        }
        return;
      }
      if (!ons.includes(settings[k] as string)) set(k, last as never);
      if (amt) mgPut(amt, Math.max(v * hi, 0.05 * hi));
    },
    choice: {
      options,
      get: () => (ons.includes(settings[k] as string) ? (settings[k] as string) : last),
      put: (o) => {
        last = o;
        set(k, o as never);
      },
    },
    ...more,
  };
}
// The kick can pulse, send waves, or both (one setting for the two).
function mgKick(part: 'pulse' | 'wave', label: string, amt: keyof Settings, hi: number, more: Partial<MgFlav> = {}): MgFlav {
  const has = () => settings.audioKick === part || settings.audioKick === 'both';
  return {
    label,
    get: () => (has() ? clamp01(num(amt) / hi) : 0),
    put: (v) => {
      const other = part === 'pulse' ? 'wave' : 'pulse';
      const otherOn = settings.audioKick === other || settings.audioKick === 'both';
      if (v <= 0.05) {
        if (has()) set('audioKick', otherOn ? other : 'none');
        return;
      }
      set('audioKick', otherOn ? 'both' : part);
      mgPut(amt, Math.max(v * hi, 0.05 * hi));
    },
    ...more,
  };
}

const PERIODS: [string, string][] = [['bar', 'Every bar'], ['2bars', 'Every 2 bars'], ['4bars', 'Every 4 bars']];
const SPINS: [string, string][] = [['sway', 'Sway'], ['rock', 'Rock'], ['step', 'Step each bar'], ['turn', 'Full turn / 32 bars']];
const hueAmt = (on: string, label: string) => mgMode(label, 'audioHue', on, 'off', 'audioHueAmt', 180);
const levelsNow = () => audio.levels;
// Hits are moments: keep them lit for a beat so the eye catches them.
const mgSeen: Record<string, number> = {};
const lit = (id: string, now: boolean) => {
  const t = performance.now();
  if (now) mgSeen[id] = t;
  return t - (mgSeen[id] ?? -1e9) < 160;
};

const MUSIC_GRID: MgGrid = {
  list: true,
  all: true,
  cols: ['Push', 'Colour', 'View', 'Flow', 'Words', 'Scene'],
  rows: [
    {
      name: 'Kick',
      live: () => lit('kick', levelsNow().beat),
      level: () => clamp01(levelsNow().pulse),
      cells: [
        [
          mgKick('pulse', 'Pulse', 'audioPulse', 2),
          mgKick('wave', 'Wave', 'audioWaveForce', 3, { fine: ['audioBeat', 'audioWaveAt', 'audioWaveEvery', 'audioWaveSpeed', 'audioWaveReach', 'audioWaveWidth', 'audioWaveFeel', 'audioWaveRings', 'audioWaveAccent'] }),
        ],
        [mgRange('Flash', 'audioBgFlash', 1), hueAmt('beat', 'Shift')],
        [mgRange('Punch', 'audioCam', 1.5), mgRange('Echo', 'audioEcho', 1)],
        null,
        [mgRange('Pulse', 'audioWordPulse', 1), mgRange('Hop', 'audioLetterHop', 1)],
        null,
      ],
    },
    {
      name: 'Snare',
      live: () => lit('snare', levelsNow().snare),
      level: () => clamp01(levelsNow().snareEnv),
      cells: [
        [mgPick('Hit', 'audioSnare', [['swirl', 'Swirl'], ['wave', 'Ripple'], ['flash', 'Flash']], 'none', 'audioHits', 2, { note: 'Snare and hi-hats share one hit strength.' })],
        [mgRange('Flash', 'audioSnareFlash', 1)],
        [mgRange('Roll', 'audioRoll', 1)],
        [mgToggle('Freeze', 'audioStutter')],
        [mgRange('Hop', 'audioSnareHop', 1)],
        null,
      ],
    },
    {
      name: 'Hi-hats',
      live: () => lit('hat', levelsNow().hat),
      cells: [[mgMode('Sparkle', 'audioHats', 'sparkle', 'none', 'audioHits', 2, { note: 'Snare and hi-hats share one hit strength.' })], [mgRange('Twinkle', 'audioHatTwinkle', 1)], [mgRange('Shake', 'audioHatShake', 1)], null, null, null],
    },
    {
      name: 'Bass',
      live: () => levelsNow().sub > 0.55,
      level: () => clamp01(levelsNow().sub),
      hi: 0.55,
      cells: [
        [mgRange('Throb', 'audioBassThrob', 2)],
        [mgRange('Glow', 'audioBassGlow', 1)],
        [mgRange('Breathe', 'audioBassZoom', 1)],
        [mgPick('Swell', 'audioSub', [['size', 'Size'], ['flow', 'Flow'], ['speed', 'Speed']], 'none', 'audioSubAmt', 2), mgRange('Sway', 'audioSway', 1)],
        null,
        null,
      ],
    },
    {
      name: 'Melody',
      live: () => lit('note', levelsNow().note),
      level: () => levelsNow().noteEnv,
      cells: [
        [mgRange('Ripple', 'audioNoteRipple', 1, { note: 'Each new note sends a ring: low notes on the left, high ones on the right. Melody is read from the clearest tone in the mids, so busy mixes give rougher notes.' })],
        [mgRange('Note hue', 'audioNoteHue', 1, { note: 'Each pitch has its own colour, so a riff repeats its colours.' })],
        null,
        null,
        [mgRange('Hop', 'audioNoteHop', 1, { note: 'The letter that hops follows the note: higher notes, letters further right.' })],
        null,
      ],
    },
    {
      name: 'Vocals',
      live: () => levelsNow().voice > 0.3,
      level: () => clamp01(levelsNow().voice),
      hi: 0.3,
      cells: [
        null,
        [mgRange('Glow', 'audioVoxGlow', 1, { note: 'Singing: clear, gliding tones in the voice range (a synth lead can count too). Rap & speech (Sound source › Vocals, or Auto with Rap / drill): follows the words and goes quiet between them.' })],
        [mgRange('Lean in', 'audioVoxZoom', 1)],
        null,
        [mgRange('Swell', 'audioVoxSwell', 1)],
        null,
      ],
    },
    {
      name: 'Syllable',
      live: () => lit('syl', levelsNow().syllable),
      level: () => levelsNow().syllEnv,
      cells: [
        [mgRange('Push', 'audioSylPush', 1, { note: 'Each syllable of a rapping or speaking voice. The backing is filtered out and drum hits are skipped, so it follows the words, not the beat.' })],
        [mgRange('Flash', 'audioSylFlash', 1)],
        null,
        null,
        [mgRange('Hop', 'audioSylHop', 1, { note: 'Letters hop in turn, one per syllable.' })],
        null,
      ],
    },
    {
      name: 'Pause',
      live: () => lit('pause', levelsNow().pause),
      level: () => (levelsNow().voxOn ? 0 : clamp01(1 - levelsNow().vocal)),
      cells: [
        null,
        [mgRange('Dim', 'audioPauseDim', 1, { note: 'Dims in the gaps between words and lifts the moment the voice is back. Only after someone has been rapping, so an instrumental stays as it is.' })],
        null,
        [mgRange('Freeze', 'audioPauseFreeze', 1, { note: 'A pause is the voice quiet for about 0.15 s: the end of a line or a breath.' })],
        null,
        null,
      ],
    },
    {
      name: 'Flow',
      live: () => levelsNow().flow > 0.35,
      level: () => levelsNow().flow,
      hi: 0.35,
      cells: [
        null,
        [mgRange('Hue', 'audioFlowHue', 1)],
        null,
        [mgRange('Speed', 'audioFlowSpeed', 1, { note: 'Syllables a second: double-time verses speed things up, laid-back bars slow them down.' })],
        null,
        null,
      ],
    },
    {
      name: 'Accent',
      live: () => lit('accent', levelsNow().accent),
      cells: [
        [mgRange('Burst', 'audioAccentBurst', 1, { note: 'A syllable clearly louder than the ones around it: a punchline or a stressed word.' })],
        null,
        [mgRange('Punch', 'audioAccentPunch', 1)],
        null,
        null,
        null,
      ],
    },
    {
      name: 'Pitch',
      live: () => levelsNow().voxOn && Math.abs(levelsNow().voxRise) > 0.25,
      level: () => (levelsNow().voxOn ? levelsNow().voxPitch : 0),
      cells: [
        [mgRange('Lift', 'audioPitchLift', 1, { note: 'Particles float up with a high voice and sink with a low one.' })],
        null,
        [mgRange('Tilt', 'audioPitchTilt', 1, { note: 'The view leans as the voice rises or falls.' })],
        null,
        null,
        null,
      ],
    },
    {
      name: 'Rhyme',
      live: () => lit('rhyme', levelsNow().rhyme),
      cells: [
        [mgRange('Ripple', 'audioRhymeRipple', 1, { note: 'When a line ends on the same vowel sound as one of the last few lines. A rough guess: it catches end rhymes, not internal ones.' })],
        [mgRange('Hue', 'audioRhymeHue', 1)],
        null,
        null,
        null,
        null,
      ],
    },
    {
      name: 'Bars',
      live: () => lit('bar', levelsNow().bar),
      cells: [
        null,
        [mgRange('Palette', 'audioPalEvery', 32, {
          get: () => (settings.audioPalEvery > 0 ? 1 : 0),
          put: (v) => set('audioPalEvery', v > 0.05 ? settings.audioPalEvery || 8 : 0),
          fine: ['audioPalEvery'],
        }), hueAmt('bar', 'Shift')],
        [mgPick('Cut', 'audioCuts', PERIODS, 'off', null), mgPick('Spin', 'audioSpin', SPINS, 'off', null)],
        null,
        [mgPick('Next', 'audioWordsEvery', PERIODS, 'drop', null, 1, {
          get: () => (settings.audioWordsOn && settings.audioWordsEvery !== 'drop' ? 1 : 0),
          put: (v) => {
            set('audioWordsOn', v > 0.05);
            if (v > 0.05 && settings.audioWordsEvery === 'drop') set('audioWordsEvery', 'bar');
          },
          fine: ['audioWords'],
        })],
        [mgRange('Switch', 'audioVj', 32, {
          get: () => (settings.audioVj > 0 ? 1 : 0),
          put: (v) => set('audioVj', v > 0.05 ? settings.audioVj || 8 : 0),
          fine: ['audioVj', 'audioVjFrom'],
        })],
      ],
    },
    {
      name: 'Build-up',
      live: () => levelsNow().tension > 0.3,
      level: () => levelsNow().tension,
      hi: 0.3,
      cells: [[mgToggle('Pull in', 'audioDropBuild')], [mgToggle('Drain', 'audioMonoBuild')], [mgToggle('Dolly', 'audioDolly')], null, [mgRange('Scatter', 'audioBuildScatter', 1)], null],
    },
    {
      name: 'Drop',
      live: () => levelsNow().dropEnv > 0.25,
      level: () => levelsNow().dropEnv,
      hi: 0.25,
      cells: [
        [mgRange('Burst', 'audioDrop', 2)],
        [mgToggle('Invert', 'audioInvert'), hueAmt('drop', 'Shift')],
        [mgToggle('Mirror', 'audioFlip'), mgMode('Cut', 'audioCuts', 'drop', 'off', null)],
        [mgToggle('Gravity', 'audioGravFlip')],
        [{
          label: 'Next',
          get: () => (settings.audioWordsOn && settings.audioWordsEvery === 'drop' ? 1 : 0),
          put: (v) => {
            set('audioWordsOn', v > 0.05);
            if (v > 0.05) set('audioWordsEvery', 'drop');
          },
          fine: ['audioWords'],
        }],
        [mgToggle('Switch', 'audioVjDrop', { fine: ['audioVjFrom'] })],
      ],
    },
    {
      name: 'Energy',
      live: () => levelsNow().liftLevel > 0.3,
      level: () => clamp01(levelsNow().liftLevel),
      hi: 0.3,
      cells: [
        [mgRange('Tremble', 'audioEnergyShake', 1)],
        [mgRange('Bright', 'audioBright', 1), hueAmt('drift', 'Drift')],
        [mgRange('Pan', 'audioPan', 1), mgMode('Spin', 'audioSpin', 'energy', 'off', null), mgRange('Tunnel', 'audioTunnel', 1, { fine: ['audioTunnelTurn'] })],
        [mgRange('Speed', 'audioSpeed', 2), mgRange('Stir', 'audioFlow', 2), mgRange('Trails', 'audioTrailEnergy', 1), mgRange('Split', 'audioBands', 1)],
        [mgRange('Grow', 'audioEnergyWords', 1)],
        null,
      ],
    },
  ],
};

const handsSeen = () => cam.hands.length > 0;
// Reactions read as a sentence: "When you smile, the particles warm up."
const VERB: Record<string, string> = {
  explode: 'explode', ripple: 'ripple', shockwave: 'shockwave', implode: 'implode', scatter: 'scatter', colours: 'change colours',
  warm: 'warm up', flash: 'flash', scene: 'next scene', mine: 'my next scene', look: 'new face look',
  save: 'save scene', clear: 'clear drawing', gather: 'gather', freeze: 'freeze', size: 'grow', flow: 'flow', speed: 'speed up',
  hue: 'shift colour', roll: 'roll view', zoom: 'zoom', emit: 'stream', energy: 'Energy', order: 'Order',
  dream: 'Dream', heat: 'Heat', density: 'Density', xfade: 'crossfade',
};
const verbOf = (act: string) => VERB[act] ?? actionDef(act)?.label.toLowerCase() ?? act;
// What a new connection does first, per input.
const LINK_START: Record<string, string> = {
  mouth: 'explode', blink: 'colours', smile: 'warm', brows: 'ripple', pucker: 'gather', wink: 'look', tilt: 'roll',
  fist: 'explode', palm: 'freeze', victory: 'scene', thumbUp: 'save', thumbDown: 'scatter', point: 'ripple', love: 'shockwave', jump: 'shockwave',
};
// One connection (input → action) as a reaction: strength for amounts, the action as a pick.
function linkFlav(src: string, act0: string): MgFlav {
  let act = act0;
  const all = () => parseLinks(settings.links);
  const find = (list: Link[]) => list.findIndex((l) => l.src === src && !l.when && l.act === act);
  const save = (list: Link[]) => set('links', formatLinks(list));
  return {
    get label() {
      return verbOf(act);
    },
    get: () => {
      const l = all()[find(all())];
      if (!l) return 0;
      return actionDef(act)?.kind === 'amount' ? Math.max(0.03, Math.abs(l.amt)) : 1;
    },
    put: (v) => {
      const list = all();
      const i = find(list);
      if (v <= 0.05) {
        if (i >= 0) list.splice(i, 1);
      } else if (i < 0) list.push({ src, when: '', act, amt: v });
      else list[i].amt = Math.sign(list[i].amt || 1) * v;
      save(list);
    },
    choice: {
      options: ACTIONS.map((x) => [x.id, verbOf(x.id)] as [string, string]),
      get: () => act,
      put: (o) => {
        const list = all();
        const i = find(list);
        if (list.some((l) => l.src === src && !l.when && l.act === o)) return;
        if (i >= 0) list[i].act = o;
        else list.push({ src, when: '', act: o, amt: 0.6 });
        act = o;
        save(list);
      },
    },
    fixed: () => actionDef(act)?.kind !== 'amount',
    note: 'This is a connection: Connections lists them all, and can combine inputs (kick + fist).',
  };
}
const sig = (id: string) => () => linkSignal(id, performance.now()).level;
const linkRow = (group: string, src: string, when: string, cells: (MgFlav[] | null)[] = [null, null, null, null, null, null]): MgRow =>
  ({ name: when, when, group, src, level: src === 'jump' ? undefined : sig(src), cells });
const CAMERA_GRID: MgGrid = {
  list: true,
  cols: ['Move', 'Draw', 'Burst', 'View', 'Colour', 'Mask'],
  rows: [
    {
      name: 'Hands',
      group: 'Your hands',
      when: 'Move your hands',
      level: () => (handsSeen() ? 1 : 0),
      cells: [[mgPick('push or swirl', 'camHands', [['repel', 'push'], ['attract', 'pull'], ['vortex', 'swirl'], ['spray', 'spray']], 'off', 'camHandForce', 3, { fine: ['camHandReach'] })], null, null, null, null, null],
    },
    {
      name: 'Pinch',
      group: 'Your hands',
      when: 'Pinch',
      level: () => (handsSeen() ? 1 : 0),
      cells: [null, [mgMode('draw', 'camHands', 'draw', 'off', null, 1, { fine: ['drawColour'], note: 'Drawing takes over your hands from moving the particles.' })], null, null, null, null],
    },
    { name: 'Two fingers', group: 'Your hands', when: 'Two fingers', cells: [null, [mgToggle('line width', 'drawWidth', { note: 'Works while a pinch draws.' })], null, null, null, null] },
    linkRow('Your hands', 'palm', 'Open a palm', [null, [mgToggle('erase', 'drawErase', { note: 'Works while a pinch draws.' })], null, null, null, null]),
    linkRow('Your hands', 'fist', 'Make a fist'),
    linkRow('Your hands', 'victory', 'Show a peace sign'),
    linkRow('Your hands', 'thumbUp', 'Give a thumbs up'),
    linkRow('Your hands', 'thumbDown', 'Give a thumbs down'),
    linkRow('Your hands', 'point', 'Point up'),
    linkRow('Your hands', 'love', 'Rock on'),
    {
      name: 'Two hands',
      group: 'Your hands',
      when: 'Use two hands',
      level: () => (cam.hands.length > 1 ? 1 : 0),
      cells: [
        null,
        null,
        null,
        [{
          label: 'zoom & turn',
          get: () => (settings.gestOn ? 1 : 0),
          put: (v) => set('gestOn', v > 0.05),
          fine: ['twoDist', 'twoAngle'],
        }],
        null,
        null,
      ],
    },
    {
      name: 'Face',
      group: 'Your face',
      when: 'Show your face',
      level: () => (cam.faces.length > 0 ? 1 : 0),
      cells: [null, null, null, null, null, [mgPick('wear a mask', 'maskFx', [['flames', 'flame hair'], ['crown', 'crown'], ['tears', 'tears'], ['beard', 'rainbow beard'], ['halo', 'halo'], ['lasers', 'laser eyes']], 'none', 'maskShare', 0.8)]],
    },
    { name: 'Gaze', group: 'Your face', when: 'Look around', cells: [[mgPick('follow your gaze', 'gaze', [['drift', 'drift'], ['eyes', 'into eyes']], 'off', null)], null, null, null, null, null] },
    { name: 'Voice', group: 'Your face', when: 'Sing or talk', level: () => (cam.faces.length > 0 ? clamp01(audio.levels.level * 1.5) : 0), cells: [null, null, [mgToggle('stream', 'voice', { fine: ['maskShare'] })], null, null, null] },
    linkRow('Your face', 'mouth', 'Open your mouth'),
    linkRow('Your face', 'smile', 'Smile'),
    linkRow('Your face', 'brows', 'Raise your eyebrows'),
    linkRow('Your face', 'blink', 'Blink'),
    linkRow('Your face', 'wink', 'Wink'),
    linkRow('Your face', 'pucker', 'Pucker'),
    linkRow('Your face', 'tilt', 'Tilt your head'),
    { name: 'Arms', group: 'Your body', when: 'Move your arms', cells: [[{ ...mgRange('sweep', 'poseSweep', 3), get: () => (settings.poseOn ? clamp01(settings.poseSweep / 3) : 0), put: (v) => { set('poseOn', v > 0.05); if (v > 0.05) mgPut('poseSweep', v * 3); } }], null, null, null, null, null] },
    linkRow('Your body', 'jump', 'Jump'),
    {
      name: 'Body',
      group: 'Your body',
      when: 'Stand in view',
      cells: [
        [{ label: 'flow round', get: () => (settings.obstacles === 'body' ? 1 : 0), put: (v) => set('obstacles', v > 0.05 ? 'body' : 'none') }],
        null,
        null,
        null,
        [mgToggle('mirror', 'mirrorWorld')],
        null,
      ],
    },
  ],
};

const LENS_GRID: MgGrid = {
  list: true,
  chips: true,
  cols: ['Basics', 'Twists and warps', 'Breaking it up', 'Light', 'Music'],
  rows: [{
    name: 'Lens',
    cells: [
      [
        mgRange('Kaleidoscope', 'audioKaleido', 8, { fine: ['audioKaleidoDrop'] }),
        mgPick('Mirror', 'lensMirror', [['lr', 'Left ↔ right'], ['tb', 'Top ↕ bottom'], ['quad', 'Four ways']], 'off', null),
        {
          label: 'Tiles',
          get: () => (settings.lensTiles < 2 ? 0 : settings.lensTiles / 6),
          put: (v) => set('lensTiles', v <= 0.05 ? 0 : Math.max(2, Math.round(v * 6))),
        },
        mgRange('Infinite zoom', 'lensZoom', 1),
        mgRange('Colour split', 'lensSplit', 1),
        mgRange('Glitch', 'lensGlitch', 1),
        mgRange('LED dots', 'lensDots', 24),
      ],
      LENS_MORE.slice(0, 4).map(([k, l]) => mgRange(l, k, 1)),
      LENS_MORE.slice(4, 6).map(([k, l]) => mgRange(l, k, 1)),
      LENS_MORE.slice(6).map(([k, l]) => mgRange(l, k, 1)),
      [mgRange('Moves with the music', 'lensMusic', 1, { note: 'Effects stack in the order of the + menu. With music the zoom surges on kicks, the kaleidoscope turns with the bass, tiles step every few bars.' })],
    ],
  }],
};

const MG_SHOW_KEY = 'particle-field:classic-cards';
// The classic cards these grids replace: hidden unless asked for (search still finds them).
const CLASSIC_SECS = new Set(['vj', 'drums', 'drops', 'bands', 'mcolour', 'camera', 'viewfx', 'mmotion', 'mwords', 'facefx', 'hands', 'caminputs', 'mirror']);
const CLASSIC_HEADINGS = new Set(['music:Hits', 'music:Colour', 'music:View', 'music:Motion & words', 'camera:Your face', 'camera:Your hands', 'camera:Inputs', 'camera:Your body']);
document.body.classList.toggle('show-classic', readJson<boolean>(MG_SHOW_KEY, false));

const MG_LEVELS = [0, 1 / 3, 2 / 3, 1];
const levelOf = (v: number) => (v <= 0.02 ? 0 : v < 0.45 ? 1 : v < 0.8 ? 2 : 3);
const cellValue = (fl: MgFlav[]) => Math.max(...fl.map((f) => f.get()));

// Tap, a sideways slide (the row becomes a strength bar) and a long press, on one element.
function mgGesture(el: HTMLElement, row: HTMLElement, bar: HTMLElement, fl: MgFlav[], text: () => string, tap: () => void, hold: () => void, redraw: () => void) {
  let x0 = 0;
  let y0 = 0;
  let v0 = 0;
  let mode: '' | 'wait' | 'swipe' | 'held' = '';
  let timer = 0;
  let eat = false;
  const put = (v: number) => {
    const on = fl.filter((f) => f.get() > 0.02);
    for (const f of on.length ? on : [fl[0]]) f.put(v);
  };
  const show = (v: number) => {
    bar.querySelector<HTMLElement>('i')!.style.width = `${Math.round(v * 100)}%`;
    bar.querySelector('span')!.textContent = text();
    bar.querySelector('b')!.textContent = v <= 0.02 ? 'off' : `${Math.round(v * 100)}%`;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    x0 = e.clientX;
    y0 = e.clientY;
    const on = fl.filter((f) => f.get() > 0.02);
    v0 = (on.length ? on : [fl[0]])[0].get();
    mode = 'wait';
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (mode !== 'wait') return;
      mode = 'held';
      hold();
    }, 450);
  });
  el.addEventListener('pointermove', (e) => {
    if (mode !== 'wait' && mode !== 'swipe') return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (mode === 'wait') {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        mode = '';
        clearTimeout(timer);
        return;
      }
      if (Math.abs(dx) < 8) return;
      mode = 'swipe';
      clearTimeout(timer);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* fine */
      }
      row.classList.add('swiping');
    }
    // Relative to where the drag started: about 140 px sweeps the whole range.
    const v = clamp01(v0 + (dx - Math.sign(dx) * 8) / 140);
    put(v);
    show(v);
    redraw();
  });
  el.addEventListener('pointerup', () => {
    clearTimeout(timer);
    if (mode === 'swipe' || mode === 'held') {
      eat = true;
      setTimeout(() => (eat = false), 0);
    }
    row.classList.remove('swiping');
    if (mode === 'swipe') redraw();
    mode = '';
  });
  el.addEventListener('pointercancel', () => {
    row.classList.remove('swiping');
    mode = '';
    clearTimeout(timer);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('click', () => {
    if (!eat) tap();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      hold();
    }
  });
}

function renderMixGrid(which: 'music' | 'camera' | 'lens') {
  const grid = which === 'music' ? MUSIC_GRID : which === 'camera' ? CAMERA_GRID : LENS_GRID;
  const wrap = document.createElement('div');
  wrap.className = 'mixgrid';
  wrap.style.setProperty('--mg-cols', String(grid.cols.length));
  const table = document.createElement('div');
  table.className = 'mg-table';
  table.setAttribute('role', 'grid');
  const head = document.createElement('div');
  head.className = 'mg-row mg-head';
  head.append(document.createElement('span'));
  for (const c of grid.cols) {
    const s = document.createElement('span');
    s.title = c;
    s.innerHTML = '<b></b><i></i>';
    s.querySelector('b')!.textContent = c;
    s.querySelector('i')!.textContent = c === 'Colour' ? 'Col' : c === 'Words' ? 'Word' : c;
    head.append(s);
  }
  table.append(head);
  const detail = document.createElement('div');
  detail.className = 'mg-detail';
  detail.hidden = true;
  const draws: (() => void)[] = [];
  const lives: [HTMLElement, () => boolean][] = [];
  let open: string | null = null;
  let dDraws: (() => void)[] = [];

  const flavLabel = (fl: MgFlav[]) => {
    const on = fl.filter((f) => f.get() > 0.02);
    const f = on[0] ?? fl[0];
    const pick = f.choice?.options.find(([o]) => o === f.choice!.get())?.[1];
    // Short variant names read better than the flavour; long ones stay in the detail.
    return pick && pick.length <= 7 ? pick : f.label;
  };
  const apply = (fl: MgFlav[], v: number) => {
    const on = fl.filter((f) => f.get() > 0.02);
    for (const f of on.length ? on : [fl[0]]) f.put(v);
  };

  grid.rows.forEach((row, ri) => {
    const r = document.createElement('div');
    r.className = 'mg-row';
    r.setAttribute('role', 'row');
    const name = document.createElement('span');
    name.className = 'mg-name';
    name.innerHTML = '<i></i><b></b>';
    name.querySelector('b')!.textContent = row.name;
    r.append(name);
    if (row.level) {
      // How close it is to firing: a small meter with the mark it fires at.
      const lvl = row.level;
      const meter = document.createElement('em');
      meter.className = 'mg-meter';
      meter.innerHTML = '<u></u>';
      if (row.hi) meter.style.setProperty('--hi', `${row.hi * 100}%`);
      else meter.classList.add('nohi');
      name.classList.add('has-meter');
      name.append(meter);
      const u = meter.querySelector('u')!;
      const on = row.live;
      lives.push([r, () => {
        u.style.width = `${Math.round(lvl() * 100)}%`;
        return on ? on() : lvl() > (row.hi ?? 0.5);
      }]);
    } else if (row.live) lives.push([r, row.live]);
    const bar = document.createElement('div');
    bar.className = 'mg-bar';
    bar.innerHTML = '<i></i><span></span><b></b>';
    r.append(bar);
    row.cells.forEach((fl, ci) => {
      if (!fl) {
        // Not a thing (a new look on every hi-hat would just be noise).
        const none = document.createElement('span');
        none.className = 'mg-none';
        r.append(none);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mg-cell';
      b.innerHTML = '<i></i><span></span>';
      const lbl = b.querySelector('span')!;
      const draw = () => {
        const lv = levelOf(cellValue(fl));
        b.dataset.lv = String(lv);
        lbl.textContent = flavLabel(fl);
        const more = fl.filter((f) => f.get() > 0.02).length - 1;
        if (more > 0) b.dataset.more = `+${more}`;
        else delete b.dataset.more;
        b.title = fl.map((f) => f.label).join(', ');
        b.classList.toggle('open', open === `${ri}:${ci}`);
        b.setAttribute('aria-label', `${row.name}, ${grid.cols[ci]}: ${lbl.textContent}${more > 0 ? ` and ${more} more` : ''}, ${['off', 'low', 'mid', 'high'][lv]}`);
      };
      draws.push(draw);
      draw();
      // Tap steps; a sideways drag sets the strength along the row; a long press opens the flavours.
      const opener = () => openDetail(row.name, grid.cols[ci], fl, `${ri}:${ci}`);
      mgGesture(b, r, bar, fl, () => `${row.name} › ${grid.cols[ci]} · ${flavLabel(fl)}`, () => {
        apply(fl, MG_LEVELS[(levelOf(cellValue(fl)) + 1) % 4]);
        redraw();
      }, opener, redraw);
      r.append(b);
    });
    table.append(r);
  });

  const hint = document.createElement('p');
  hint.className = 'mg-hint';
  hint.textContent = 'Tap: off · low · mid · high. Slide sideways: exact strength. Hold: flavours and fine settings.';

  // When you… → …the particles: each trigger lists what it does now, + adds more.
  const list = document.createElement('div');
  list.className = 'mg-list';
  if (grid.list) {
    hint.textContent = 'Tap a reaction for its settings. Slide it sideways: strength. + adds one.';
    if (grid.chips) hint.textContent = 'Tap an effect for its settings. Slide it sideways: strength. + adds one.';
    const cap = document.createElement('div');
    cap.className = 'mg-lhead';
    cap.innerHTML = '<span>When you…</span><span>…the particles</span>';
    if (!grid.chips) list.append(cap);
    let group = '';
    const MUSIC_GROUPS: Record<string, string> = { Kick: 'Drums', Snare: 'Drums', 'Hi-hats': 'Drums', Bass: 'Tones', Melody: 'Tones', Vocals: 'Voice', Syllable: 'Voice', Pause: 'Voice', Flow: 'Voice', Accent: 'Voice', Pitch: 'Voice', Rhyme: 'Voice', Bars: 'The song', 'Build-up': 'The song', Drop: 'The song', Energy: 'The song' };
    if (grid.all) {
      // How many are on, how many more there are, and what the colours mean.
      hint.textContent = 'Tap a dashed reaction to turn it on. Tap a lit one for its settings, slide it sideways for strength.';
      const top = document.createElement('div');
      top.className = 'mg-allhead';
      top.innerHTML = '<p><b></b><span></span></p><div class="mg-legend"></div>';
      const lg = top.querySelector('.mg-legend')!;
      grid.cols.forEach((c, ci) => {
        const s = document.createElement('span');
        s.dataset.col = String(ci);
        s.textContent = c;
        lg.append(s);
      });
      const nOn = top.querySelector('b')!;
      const nMore = top.querySelector('p span')!;
      const flavs = grid.rows.flatMap((r) => r.cells.flatMap((c) => c ?? []));
      draws.push(() => {
        const on = flavs.filter((f) => f.get() > 0.02).length;
        nOn.textContent = `${on} on`;
        nMore.textContent = ` · ${flavs.length - on} more you can turn on`;
      });
      list.append(top);
    }
    grid.rows.forEach((row, ri) => {
      if (grid.all && !row.group) row.group = MUSIC_GROUPS[row.name];
      if (row.group && row.group !== group) {
        group = row.group;
        const g = document.createElement('p');
        g.className = 'mg-group';
        g.textContent = group;
        list.append(g);
      }
      const who = row.when ?? row.name;
      const fixed = row.cells.flatMap((fl, ci) => (fl ?? []).map((f, fi) => ({ f, col: grid.cols[ci], ci, key: `${ri}:${ci}:${fi}` })));
      // Connections from this input, made fresh from the links each time.
      const linkCache: Record<string, MgFlav> = {};
      const linked = () => {
        if (!row.src) return [];
        return parseLinks(settings.links)
          .filter((l) => l.src === row.src && !l.when)
          .map((l) => ({ f: Object.values(linkCache).find((f) => f.choice!.get() === l.act) ?? (linkCache[l.act] = linkFlav(row.src!, l.act)), col: 'Connection', ci: -1, key: `${ri}:L:${l.act}` }));
      };
      const r = document.createElement('div');
      r.className = grid.chips ? 'mg-lrow mg-chips' : 'mg-lrow';
      const name = document.createElement('span');
      name.className = 'mg-name';
      name.innerHTML = '<i></i><b></b>';
      name.querySelector('b')!.textContent = who;
      const lvl = row.level;
      if (lvl) {
        // How strongly the camera sees it now; the tick is where it fires.
        const meter = document.createElement('em');
        meter.className = 'mg-meter';
        meter.innerHTML = '<u></u>';
        const hi = row.src ? sourceDef(row.src)?.hi : undefined;
        if (hi) meter.style.setProperty('--hi', `${hi * 100}%`);
        else meter.classList.add('nohi');
        name.append(meter);
        const u = meter.querySelector('u')!;
        lives.push([r, () => {
          const v = lvl();
          u.style.width = `${Math.round(v * 100)}%`;
          return v > (hi ?? 0.5);
        }]);
      } else if (row.live) lives.push([r, row.live]);
      const bar = document.createElement('div');
      bar.className = 'mg-bar';
      bar.innerHTML = '<i></i><span></span><b></b>';
      const fx = document.createElement('div');
      fx.className = 'mg-fx';
      const menu = document.createElement('div');
      menu.className = 'mg-menu';
      menu.hidden = true;
      if (grid.chips) r.append(fx, bar);
      else r.append(name, fx, bar);
      const chipName = (f: MgFlav) => {
        const pick = f.choice && f.get() > 0.02 ? f.choice.options.find(([o]) => o === f.choice!.get())?.[1] : '';
        return pick || f.label;
      };
      const show = (f: MgFlav, _col: string, key: string) => openDetail(who, () => chipName(f), [f], key, () => f.put(0), menu);
      let sig = '-';
      const build = () => {
        const items = [...fixed, ...linked()];
        const on = items.filter(({ f }) => f.get() > 0.02);
        if (grid.all) {
          const next = 'A' + items.map(({ key, f }) => key + (f.get() > 0.02 ? '1' : '0') + chipName(f)).join('|') + (open ?? '');
          if (next !== sig && !r.classList.contains('swiping')) {
            sig = next;
            fx.innerHTML = '';
            for (const { f, col, ci, key } of items) {
              const lit = f.get() > 0.02;
              const c = document.createElement('button');
              c.type = 'button';
              c.className = lit ? 'mg-chip' : 'mg-chip mg-off';
              c.dataset.col = String(ci);
              c.title = `${who} → ${col}: ${f.label}${lit ? '' : ' (off: tap to turn on)'}`;
              c.classList.toggle('open', open === key);
              c.textContent = chipName(f);
              if (lit) {
                const opener = () => show(f, col, key);
                mgGesture(c, r, bar, [f], () => `${who} › ${chipName(f)}`, opener, opener, redraw);
              } else {
                c.addEventListener('click', () => {
                  f.put(2 / 3);
                  redraw();
                });
              }
              fx.append(c);
            }
          }
          fx.querySelectorAll<HTMLElement>('.mg-chip').forEach((c, i) => {
            const it = items[i];
            if (it) c.style.setProperty('--v', `${Math.round(it.f.get() * 100)}%`);
          });
          return;
        }
        const next = on.map(({ key, f }) => key + chipName(f)).join('|') + (open ?? '');
        if (next !== sig && !r.classList.contains('swiping')) {
          sig = next;
          fx.innerHTML = '';
          for (const { f, col, key } of on) {
            const c = document.createElement('button');
            c.type = 'button';
            c.className = 'mg-chip';
            c.classList.toggle('open', open === key);
            c.textContent = chipName(f);
            const opener = () => show(f, col, key);
            mgGesture(c, r, bar, [f], () => `${who} › ${chipName(f)}`, opener, opener, redraw);
            fx.append(c);
          }
          const off = fixed.filter(({ f }) => f.get() <= 0.02);
          const canLink = !!row.src;
          if (off.length || canLink) {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'mg-add';
            add.textContent = on.length ? '+' : '+ Add';
            add.setAttribute('aria-label', `Add a reaction to ${who}`);
            const addLink = () => {
              const have = new Set(linked().map(({ f }) => f.choice!.get()));
              const start = [LINK_START[row.src!], 'ripple', 'explode', 'colours', 'flash', 'scatter'].find((x) => x && !have.has(x))!;
              const f = Object.values(linkCache).find((x) => x.choice!.get() === start) ?? (linkCache[start] = linkFlav(row.src!, start));
              f.put(0.6);
              menu.hidden = true;
              redraw();
              show(f, 'Connection', `${ri}:L:${start}`);
            };
            add.addEventListener('click', () => {
              if (off.length + (canLink ? 1 : 0) === 1) {
                if (canLink) return addLink();
                const { f, col, key } = off[0];
                f.put(2 / 3);
                menu.hidden = true;
                redraw();
                show(f, col, key);
                return;
              }
              menu.hidden = !menu.hidden;
              menu.innerHTML = '';
              const item = (text: string, sub: string, go: () => void) => {
                const m = document.createElement('button');
                m.type = 'button';
                m.innerHTML = '<b></b><span></span>';
                m.querySelector('b')!.textContent = text;
                m.querySelector('span')!.textContent = sub;
                m.addEventListener('click', go);
                menu.append(m);
              };
              let lastCol = '';
              for (const { f, col, key } of off) {
                // Effect cards: the groups as small headings instead of a tag on each item.
                if (grid.chips && col !== lastCol) {
                  lastCol = col;
                  const g = document.createElement('p');
                  g.className = 'mg-mgroup';
                  g.textContent = col;
                  menu.append(g);
                }
                item(f.label, grid.chips ? '' : col, () => {
                  f.put(2 / 3);
                  menu.hidden = true;
                  redraw();
                  show(f, col, key);
                });
              }
              if (canLink) item('something else…', 'Connection', addLink);
            });
            fx.append(add);
          } else menu.hidden = true;
        }
        for (const c of fx.querySelectorAll<HTMLElement>('.mg-chip')) {
          const k = on[[...fx.children].indexOf(c)];
          if (k) c.style.setProperty('--v', `${Math.round(k.f.get() * 100)}%`);
        }
      };
      draws.push(build);
      build();
      list.append(r, menu);
    });
    if (grid === CAMERA_GRID) {
      // Expressions need a nudge on some faces.
      const sens = document.createElement('div');
      sens.className = 'mg-sens';
      sens.append(mgFine('exSense', draws));
      list.append(sens);
    }
  }

  // anchor: show the panel right under this (the list), not at the end.
  function openDetail(sup: string, title: string | (() => string), fl: MgFlav[], key: string, remove?: () => void, anchor?: HTMLElement) {
    // The same pill again closes its slider.
    if (open === key && !detail.hidden) {
      open = null;
      dDraws = [];
      detail.hidden = true;
      redraw();
      return;
    }
    open = key;
    if (anchor && anchor.nextSibling !== detail) anchor.after(detail);
    dDraws = [];
    detail.hidden = false;
    detail.innerHTML = '';
    const top = document.createElement('div');
    top.className = 'mg-dtop';
    top.innerHTML = '<span></span><b></b>';
    top.querySelector('span')!.textContent = sup;
    const tb = top.querySelector('b')!;
    if (typeof title === 'string') tb.textContent = title;
    else dDraws.push(() => (tb.textContent = title()));
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Done';
    const close = () => {
      open = null;
      dDraws = [];
      detail.hidden = true;
      redraw();
    };
    done.addEventListener('click', close);
    if (remove) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = 'Remove';
      rm.addEventListener('click', () => {
        remove();
        close();
      });
      top.append(rm);
    }
    top.append(done);
    detail.append(top);
    const fineKeys = new Set<keyof Settings>();
    const notes = new Set<string>();
    for (const f of fl) {
      const fb = document.createElement('div');
      fb.className = 'mg-fbar';
      fb.innerHTML = '<i></i><span></span><b></b>';
      fb.querySelector('span')!.textContent = f.label;
      const paint = () => {
        const v = f.get();
        fb.querySelector<HTMLElement>('i')!.style.width = `${Math.round(v * 100)}%`;
        fb.querySelector('b')!.textContent = v <= 0.02 ? 'off' : `${Math.round(v * 100)}%`;
        fb.classList.toggle('on', v > 0.02);
      };
      paint();
      dDraws.push(paint);
      // Drag along the bar to set; a tap toggles off / mid.
      let down = false;
      let moved = false;
      let sx = 0;
      const at = (e: PointerEvent) => {
        const rr = fb.getBoundingClientRect();
        f.put(clamp01((e.clientX - rr.left) / rr.width));
        redraw();
      };
      fb.addEventListener('pointerdown', (e) => {
        down = true;
        moved = false;
        sx = e.clientX;
        try {
          fb.setPointerCapture(e.pointerId);
        } catch {
          /* fine */
        }
      });
      fb.addEventListener('pointermove', (e) => {
        if (!down) return;
        if (!moved && Math.abs(e.clientX - sx) < 6) return;
        moved = true;
        at(e);
      });
      fb.addEventListener('pointerup', () => {
        if (down && !moved) {
          f.put(f.get() > 0.02 ? 0 : 2 / 3);
          redraw();
        }
        down = false;
      });
      fb.addEventListener('pointercancel', () => (down = false));
      fb.tabIndex = 0;
      fb.setAttribute('role', 'slider');
      fb.setAttribute('aria-label', f.label);
      fb.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 0.05 : e.key === 'ArrowLeft' ? -0.05 : 0;
        if (!step) return;
        e.preventDefault();
        f.put(clamp01(f.get() + step));
        redraw();
      });
      if (f.fixed) dDraws.push(() => (fb.hidden = !!f.fixed?.()));
      detail.append(fb);
      if (f.choice && f.choice.options.length > 6) {
        const sel = document.createElement('select');
        sel.className = 'mg-pick';
        for (const [o, t] of f.choice.options) sel.append(new Option(t, o));
        sel.addEventListener('change', () => {
          f.choice!.put(sel.value);
          redraw();
        });
        dDraws.push(() => {
          if (document.activeElement !== sel) sel.value = f.choice!.get();
        });
        detail.append(sel);
      } else if (f.choice) {
        const seg = document.createElement('div');
        seg.className = 'mg-seg';
        for (const [o, t] of f.choice.options) {
          const sb = document.createElement('button');
          sb.type = 'button';
          sb.textContent = t;
          sb.addEventListener('click', () => {
            f.choice!.put(o);
            if (f.get() <= 0.02) f.put(2 / 3);
            redraw();
          });
          dDraws.push(() => sb.classList.toggle('on', f.choice!.get() === o && f.get() > 0.02));
          seg.append(sb);
        }
        detail.append(seg);
      }
      for (const k of f.fine ?? []) fineKeys.add(k);
      if (f.note) notes.add(f.note);
      if (f.action) {
        const ab = document.createElement('button');
        ab.type = 'button';
        ab.className = 'mg-action';
        ab.textContent = f.action[0];
        ab.addEventListener('click', f.action[1]);
        detail.append(ab);
      }
    }
    if (fineKeys.size) {
      const h = document.createElement('p');
      h.className = 'mg-sub';
      h.textContent = 'Fine settings';
      detail.append(h);
      for (const k of fineKeys) detail.append(mgFine(k, dDraws));
    }
    for (const n of notes) {
      const p = document.createElement('p');
      p.className = 'mg-note';
      p.textContent = n;
      detail.append(p);
    }
    redraw();
    detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function redraw() {
    for (const d of draws) d();
    for (const d of dDraws) d();
  }
  refreshers.push(redraw);

  // Live: rows light up as the music (or the camera) fires them.
  const tick = () => {
    if (!wrap.isConnected) return;
    if (wrap.offsetParent) for (const [el, on] of lives) el.classList.toggle('live', on());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const classic = document.createElement('button');
  classic.type = 'button';
  classic.className = 'mg-classic';
  const label = () => (classic.textContent = document.body.classList.contains('show-classic') ? 'Hide the classic cards' : 'Show the classic cards');
  label();
  classic.addEventListener('click', () => {
    const on = document.body.classList.toggle('show-classic');
    writeJson(MG_SHOW_KEY, on);
    label();
  });
  refreshers.push(label);

  wrap.append(grid.list ? list : table, hint, detail);
  if (!grid.chips) wrap.append(classic);
  return wrap;
}

// One fine setting, drawn small, from the classic control's own definition.
function mgFine(k: keyof Settings, draws: (() => void)[]) {
  const c = ctlOf(k);
  const row = document.createElement('label');
  row.className = 'mg-fine';
  const name = document.createElement('span');
  name.textContent = c?.label ?? String(k);
  row.append(name);
  if (!c) return row;
  if (c.kind === 'range') {
    const out = document.createElement('b');
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(c.min);
    inp.max = String(c.max);
    inp.step = String(c.step);
    inp.addEventListener('input', () => set(k, +inp.value as never));
    draws.push(() => {
      inp.value = String(settings[k]);
      out.textContent = c.format ? c.format(num(k)) : String(settings[k]);
    });
    row.classList.add('range');
    row.append(out, inp);
  } else if (c.kind === 'select' || c.kind === 'choice') {
    const sel = document.createElement('select');
    for (const [v, t] of c.options) sel.append(new Option(t, v));
    sel.addEventListener('change', () => set(k, sel.value as never));
    draws.push(() => (sel.value = String(settings[k])));
    row.append(sel);
  } else if (c.kind === 'toggle') {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', () => set(k, cb.checked as never));
    draws.push(() => (cb.checked = !!settings[k]));
    row.classList.add('toggle');
    row.prepend(cb);
  } else if (c.kind === 'text') {
    const t = document.createElement('input');
    t.type = 'text';
    t.placeholder = c.placeholder ?? '';
    t.addEventListener('change', () => set(k, t.value as never));
    t.addEventListener('keydown', (e) => e.stopPropagation());
    draws.push(() => {
      if (document.activeElement !== t) t.value = String(settings[k]);
    });
    row.classList.add('text');
    row.append(t);
  }
  return row;
}

// Setting descriptions: hover a setting's name (mouse) or hold it (touch)
// for one line about what it does. The words live in tips.ts.
function tipOn(el: HTMLElement, key: string) {
  if (ABOUT[key]) el.dataset.tip = key;
}
let tipEl: HTMLElement | null = null;
let tipTimer = 0;
function tipHide() {
  clearTimeout(tipTimer);
  tipEl?.remove();
  tipEl = null;
}
function tipShow(anchor: HTMLElement) {
  tipHide();
  const text = ABOUT[anchor.dataset.tip ?? ''];
  if (!text || !anchor.isConnected) return;
  const el = document.createElement('div');
  el.className = 'tip';
  el.setAttribute('role', 'tooltip');
  el.textContent = text;
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left));
  const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  tipEl = el;
}
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) return;
  const t = (e.target as HTMLElement).closest?.<HTMLElement>('[data-tip]');
  // Not while that setting's own slider (which shows the text) is open.
  if (!t || tunerEl || document.body.classList.contains('solo')) return;
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => tipShow(t), 450);
});
document.addEventListener('pointerout', (e) => {
  const t = (e.target as HTMLElement).closest?.<HTMLElement>('[data-tip]');
  if (t && !t.contains(e.relatedTarget as Node)) tipHide();
});
// Touch: hold a name for half a second. The click that ends the hold is
// swallowed so a switch or label doesn't change.
let tipHeld = false;
document.addEventListener('pointerdown', (e) => {
  const was = !!tipEl;
  tipHide();
  if (e.pointerType === 'mouse') return;
  const t = (e.target as HTMLElement).closest?.<HTMLElement>('[data-tip]');
  if (!t || t.closest('.rack-knob, .overview, .solo-sheet')) return;
  tipHeld = false;
  const [x, y] = [e.clientX, e.clientY];
  tipTimer = window.setTimeout(() => {
    tipHeld = true;
    tipShow(t);
  }, 500);
  const cancel = (m: PointerEvent) => {
    if (m.type !== 'pointermove' || Math.hypot(m.clientX - x, m.clientY - y) > 10) {
      if (!tipHeld) clearTimeout(tipTimer);
      removeEventListener('pointermove', cancel);
      removeEventListener('pointerup', cancel);
      removeEventListener('pointercancel', cancel);
    }
  };
  addEventListener('pointermove', cancel);
  addEventListener('pointerup', cancel);
  addEventListener('pointercancel', cancel);
  void was;
}, true);
document.addEventListener('click', (e) => {
  if (!tipHeld) return;
  tipHeld = false;
  e.preventDefault();
  e.stopPropagation();
}, true);
addEventListener('scroll', tipHide, true);
addEventListener('wheel', tipHide, { passive: true });

function renderControls() {
  let collapsed: Record<string, boolean> = {};
  try {
    collapsed = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}');
  } catch {
    /* defaults */
  }
  let moreOpen: Record<string, boolean> = {};
  try {
    moreOpen = JSON.parse(localStorage.getItem(MORE_KEY) ?? '{}');
  } catch {
    /* defaults */
  }
  let body: HTMLElement = controls;
  let sectionBody: HTMLElement = controls;
  let sectionId = '';
  // Essentials mode: the card's key settings, then a Fine-tune fold with the rest.
  let essBody: HTMLElement | null = null;
  let fineBody: HTMLElement | null = null;
  let essKeys = new Set<string>();
  let dest: HTMLElement = controls;
  const keyed = (c: Control): c is Extract<Control, { key: keyof Settings }> => 'key' in c;
  // Where a keyed control of the current card goes.
  const destFor = (key: string) => (essBody && fineBody ? (essKeys.has(key) || pins.has(key) ? essBody : fineBody) : body);

  // Create / Perform / React along the top, that intent's pages below it;
  // Actions get their own bar at the bottom.
  const intentBar = document.createElement('div');
  intentBar.className = 'tabs intents';
  intentBar.setAttribute('role', 'tablist');
  for (const [i, text, pages] of INTENTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.textContent = text;
    b.addEventListener('click', () => showTab(lastPage[i] && pages.includes(lastPage[i]!) ? lastPage[i]! : pages[0]));
    intentBar.append(b);
    intentButtons.push([i, b]);
  }
  const tabBar = document.createElement('div');
  tabBar.className = 'tabs pages';
  tabBar.setAttribute('role', 'tablist');
  // The Crossfader page is gone: the overview's crossfader does it better.
  for (const [t, text] of TABS.filter(([x]) => x !== 'xfader')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[t]}</svg><span></span>`;
    b.querySelector('span')!.textContent = ({ xfader: 'Fader', links: 'Links' } as Partial<Record<Tab, string>>)[t] ?? text;
    if (t === 'music') {
      b.querySelector('span')!.textContent = 'React';
      b.title = 'React: music, camera and connections';
      b.setAttribute('aria-label', 'React');
      b.querySelector('svg')!.innerHTML = '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>';
    }
    b.title = text;
    b.setAttribute('aria-label', text);
    b.dataset.tab = t;
    // A gap before the first page of Perform and React.
    if (INTENTS.some(([, , pages], k) => k > 0 && pages[0] === t)) b.classList.add('intent-start');
    b.addEventListener('click', () => showTab(t === 'music' ? lastReact : t));
    tabBar.append(b);
    tabButtons.push([t, b]);
  }
  controls.before(tabBar);
  tabBar.before(intentBar);
  intentBar.before(renderSearch());
  {
    // Desktop: the React tab's own chips (Music, Camera, Connections).
    const sub = document.createElement('div');
    sub.className = 'react-sub';
    for (const t of REACT_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[t]}</svg><span></span>`;
      b.querySelector('span')!.textContent = TABS.find(([x]) => x === t)![1];
      b.addEventListener('click', () => showTab(t));
      sub.append(b);
      reactSub.push([t, b]);
    }
    tabBar.after(sub);
    // The scene strip: the scenes around the one playing, under the search.
    intentBar.before(sceneStrip());
  }
  // Fold or unfold every card on the open tab at once.
  const foldAll = document.createElement('div');
  foldAll.className = 'fold-all';
  for (const [text, open] of [['Collapse all', false], ['Expand all', true]] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => {
      for (const [el, t] of sectionTabs) {
        if (t !== currentTab || !el.classList.contains('group')) continue;
        if (el.classList.contains('closed') === open) el.querySelector<HTMLElement>('.group-head')?.click();
      }
    });
    foldAll.append(b);
  }
  tabBar.after(foldAll);
  // Phones: every page in one grid, opened from the slim bar's title.
  const picker = document.createElement('div');
  picker.className = 'picker';
  picker.id = 'picker';
  for (const [, text, pages] of INTENTS) {
    const g = document.createElement('div');
    g.className = 'picker-group';
    const h = document.createElement('span');
    h.textContent = text;
    const grid = document.createElement('div');
    for (const t of pages) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.tab = t;
      b.textContent = TABS.find(([x]) => x === t)![1];
      b.addEventListener('click', () => {
        showTab(t);
        setPicking(false);
        controls.scrollTop = 0;
      });
      grid.append(b);
    }
    g.append(h, grid);
    picker.append(g);
  }
  foldAll.after(picker);
  const actionBar = document.getElementById('actionbar')!;

  for (const [ci, ctl] of CONTROLS.entries()) {
    if (ctl.kind === 'heading') {
      // A small title between groups of cards inside a tab.
      const h = document.createElement('h2');
      h.className = 'tab-heading';
      h.textContent = ctl.label;
      if (CLASSIC_HEADINGS.has(`${ctl.tab}:${ctl.label}`)) h.classList.add('classic');
      controls.append(h);
      sectionTabs.push([h, ctl.tab]);
      continue;
    }
    if (ctl.kind === 'section') {
      const section = document.createElement('section');
      section.className = 'group';
      // The header folds the card away; folded cards stay folded next time.
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'group-head';
      head.innerHTML = `<span class="chev" aria-hidden="true"></span><span class="group-title"></span><span class="group-summary"></span>`;
      head.querySelector('.group-title')!.textContent = ctl.label;
      const summary = head.querySelector<HTMLElement>('.group-summary')!;
      body = document.createElement('div');
      body.className = 'group-body';
      body.id = `group-${ctl.id}`;
      sectionBody = body;
      sectionId = ctl.id;
      section.dataset.label = ctl.label;
      essBody = fineBody = null;
      {
        let count = 0;
        for (let j = ci + 1; j < CONTROLS.length && CONTROLS[j].kind !== 'section' && CONTROLS[j].kind !== 'heading'; j++) if (keyed(CONTROLS[j])) count++;
        const ess = ESSENTIALS[ctl.id];
        if (ess && count > 4) {
          essKeys = new Set(ess);
          essBody = document.createElement('div');
          essBody.className = 'ess-body';
          fineBody = document.createElement('div');
          fineBody.className = 'more-body fine-body';
          fineBody.id = `fine-${ctl.id}`;
          const fine = fineBody;
          const id = ctl.id;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'more-toggle fine-toggle';
          btn.innerHTML = `<span class="chev" aria-hidden="true"></span><span></span>`;
          btn.setAttribute('aria-controls', fine.id);
          const setOpen = (open: boolean) => {
            fine.hidden = !open;
            btn.classList.toggle('open', open);
            btn.setAttribute('aria-expanded', String(open));
          };
          setOpen(!!moreOpen[id]);
          btn.addEventListener('click', () => {
            const open = btn.getAttribute('aria-expanded') !== 'true';
            moreOpen[id] = open;
            setOpen(open);
            try {
              localStorage.setItem(MORE_KEY, JSON.stringify(moreOpen));
            } catch {
              /* not persisted */
            }
          });
          afterShow.push(() => {
            const n = fine.querySelectorAll(':scope > .prow:not([hidden])').length;
            btn.hidden = n === 0;
            btn.lastElementChild!.textContent = document.getElementById('panel')?.classList.contains('fmode') ? 'Fine-tune' : `Fine-tune · ${n} more`;
          });
          body.append(essBody, btn, fine);
          body = essBody;
        }
      }
      dest = body;
      const top = document.createElement('div');
      top.className = 'group-top';
      top.append(head);
      if (ctl.lock) {
        // Locked cards keep their settings through scene changes, Shuffle and vibes.
        const lockBtn = document.createElement('button');
        lockBtn.type = 'button';
        lockBtn.className = 'lock';
        lockBtn.innerHTML = LOCK_SVG;
        const id = ctl.id;
        const sync = () => {
          const on = locks.has(id);
          lockBtn.classList.toggle('on', on);
          lockBtn.title = on ? 'Locked: scenes, Shuffle and vibes keep these settings' : 'Lock so scenes, Shuffle and vibes keep these settings';
          lockBtn.setAttribute('aria-pressed', String(on));
          section.classList.toggle('locked', on);
        };
        lockBtn.addEventListener('click', () => {
          if (locks.has(id)) locks.delete(id);
          else locks.add(id);
          saveLocks();
          sync();
          syncTabDots();
        });
        sync();
        lockSyncs.push(sync);
        top.append(lockBtn);
      }
      if (ctl.power) {
        // On/off switch: an off card folds down to its header.
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'power';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-label', ctl.label);
        sw.addEventListener('click', () => {
          if (ctl.power!.toggle) return ctl.power!.toggle();
          const keys = setPower(ctl, !ctl.power!.on());
          if (keys) tlHold(keys);
        });
        top.append(sw);
        refreshers.push(() => {
          const on = ctl.power!.on();
          sw.setAttribute('aria-checked', String(on));
          sw.title = on ? `Turn ${ctl.label.toLowerCase()} off` : `Turn ${ctl.label.toLowerCase()} on`;
          section.classList.toggle('off', !on);
        });
      }
      section.append(top);
      if (ctl.about) {
        const about = document.createElement('p');
        about.className = 'about';
        about.textContent = ctl.about;
        section.append(about);
      }
      section.append(sectionBody);
      if (ctl.fixed) {
        // Actions: a bar pinned under the cards, no header.
        section.classList.add('fixed');
        top.remove();
        actionBar.append(section);
        continue;
      }
      controls.append(section);
      section.dataset.sec = ctl.id;
      if (CLASSIC_SECS.has(ctl.id)) section.classList.add('classic');
      sectionTabs.push([section, pageOf(ctl)]);
      {
        const id = ctl.id;
        head.setAttribute('aria-controls', sectionBody.id);
        const setOpen = (open: boolean) => {
          section.classList.toggle('closed', !open);
          head.setAttribute('aria-expanded', String(open));
        };
        setOpen(!(collapsed[id] ?? ctl.folded ?? false));
        head.addEventListener('click', () => {
          const open = section.classList.contains('closed');
          setOpen(open);
          collapsed[id] = !open;
          try {
            localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
          } catch {
            /* not persisted */
          }
        });
      }
      if (ctl.summary) refreshers.push(() => (summary.textContent = ctl.summary!()));
      if (ctl.show) conditional.push([section, ctl.show]);
      continue;
    }

    if (ctl.kind === 'more') {
      // Essentials cards have Fine-tune instead.
      if (fineBody) continue;
      // Everything after this in the card hides behind a "More" link.
      const id = sectionId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'more-toggle';
      btn.innerHTML = `<span class="chev" aria-hidden="true"></span><span></span>`;
      btn.lastElementChild!.textContent = ctl.label;
      const more = document.createElement('div');
      more.className = 'more-body';
      more.id = `more-${id}`;
      btn.setAttribute('aria-controls', more.id);
      const setOpen = (open: boolean) => {
        more.hidden = !open;
        btn.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      };
      setOpen(!!moreOpen[id]);
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        moreOpen[id] = open;
        setOpen(open);
        try {
          localStorage.setItem(MORE_KEY, JSON.stringify(moreOpen));
        } catch {
          /* not persisted */
        }
      });
      sectionBody.append(btn, more);
      body = dest = more;
      continue;
    }

    if (ctl.kind === 'vibes') {
      // Vibe gallery: name and a one-line description each.
      // Family chips first (like the preset library), then that family A–Z.
      const chips = document.createElement('div');
      chips.className = 'families';
      chips.setAttribute('role', 'tablist');
      // A second row: what the vibe listens to (the drums, bass, melody…).
      const leads = document.createElement('div');
      leads.className = 'families leads';
      leads.setAttribute('role', 'tablist');
      const grid = document.createElement('div');
      grid.className = 'vibes';
      const btns: [VibeDef, HTMLButtonElement][] = [];
      const drawVibes = () => {
        for (const c of chips.children) c.classList.toggle('on', (c as HTMLElement).dataset.fam === vibeFamily);
        for (const c of leads.children) c.classList.toggle('on', (c as HTMLElement).dataset.lead === vibeLead);
        grid.innerHTML = '';
        btns.length = 0;
        const list = VIBES.filter((v) => (vibeFamily === 'all' || v.family === vibeFamily) && (vibeLead === 'any' || v.lead === vibeLead)).sort((a, b) => a.name.localeCompare(b.name));
        for (const v of [...list, null]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.innerHTML = '<b></b><span></span><i></i>';
          b.querySelector('b')!.textContent = v ? v.name : 'Surprise me';
          b.querySelector('span')!.textContent = v ? v.about : vibeLead === 'any' ? 'A random mix, led by one layer (F)' : `A random mix led by ${LEAD_ABOUT[vibeLead]} (F)`;
          b.querySelector('i')!.textContent = v ? `Moves with ${LEAD_ABOUT[v.lead]}` : '';
          b.addEventListener('click', () => (v ? applyVibe(v) : surpriseVibe(vibeLead === 'any' ? undefined : vibeLead)));
          if (v) {
            btns.push([v, b]);
            b.classList.toggle('on', settings.audioVibe === v.name && vibeIntact(v));
          }
          grid.append(b);
        }
      };
      refreshers.push(() => {
        for (const [v, b] of btns) b.classList.toggle('on', settings.audioVibe === v.name && vibeIntact(v));
      });
      for (const [fam, lbl] of VIBE_FAMILIES) {
        const c = document.createElement('button');
        c.type = 'button';
        c.dataset.fam = fam;
        c.setAttribute('role', 'tab');
        c.innerHTML = `${lbl} <small>${fam === 'all' ? VIBES.length : VIBES.filter((v) => v.family === fam).length}</small>`;
        c.addEventListener('click', () => {
          vibeFamily = fam;
          writeJson(VIBE_FAMILY_KEY, fam);
          drawVibes();
        });
        chips.append(c);
      }
      for (const [lead, lbl] of VIBE_LEADS) {
        const c = document.createElement('button');
        c.type = 'button';
        c.dataset.lead = lead;
        c.setAttribute('role', 'tab');
        c.innerHTML = `${lbl} <small>${lead === 'any' ? VIBES.length : VIBES.filter((v) => v.lead === lead).length}</small>`;
        c.addEventListener('click', () => {
          vibeLead = lead;
          writeJson(VIBE_LEAD_KEY, lead);
          drawVibes();
        });
        leads.append(c);
      }
      drawVibes();
      const leadLbl = document.createElement('div');
      leadLbl.className = 'leads-label';
      leadLbl.textContent = 'Moves with';
      body.append(chips, leadLbl, leads);
      searchItem(body, grid);
      continue;
    }

    if (ctl.kind === 'mypresets') {
      searchItem(body, renderMyPresets());
      continue;
    }

    if (ctl.kind === 'exmeters') {
      searchItem(body, renderExMeters());
      continue;
    }
    if (ctl.kind === 'rapmeters') {
      searchItem(body, renderRapMeters());
      continue;
    }

    if (ctl.kind === 'mixgrid') {
      searchItem(body, renderMixGrid(ctl.which));
      continue;
    }

    if (ctl.kind === 'links') {
      searchItem(body, renderLinks());
      continue;
    }

    if (ctl.kind === 'timeline') {
      searchItem(body, renderTimeline());
      continue;
    }

    if (ctl.kind === 'record') {
      searchItem(body, renderRecord());
      continue;
    }

    if (ctl.kind === 'xfader') {
      searchItem(body, renderXfader());
      continue;
    }
    if (ctl.kind === 'animlist') {
      searchItem(body, renderAnimList(), 'animate moving settings keyframes swing lfo automation record');
      continue;
    }
    if (ctl.kind === 'knobsmore') {
      searchItem(body, renderKnobsMore(), 'field knobs more add knob');
      continue;
    }

    if (ctl.kind === 'presetlib') {
      searchItem(body, renderPresetLibrary());
      continue;
    }

    if (ctl.kind === 'note') {
      const pEl = document.createElement('p');
      pEl.className = 'note';
      pEl.textContent = ctl.text;
      dest.append(pEl);
      if (ctl.show) conditional.push([pEl, ctl.show]);
      continue;
    }

    if (ctl.kind === 'sub') {
      const h = document.createElement('h3');
      h.textContent = ctl.label;
      // Goes with the next setting (essentials or Fine-tune).
      let to = dest;
      for (let j = ci + 1; j < CONTROLS.length && CONTROLS[j].kind !== 'section'; j++) {
        const c = CONTROLS[j];
        if (keyed(c)) {
          to = destFor(c.key);
          break;
        }
      }
      to.append(h);
      if (ctl.show) conditional.push([h, ctl.show]);
      continue;
    }

    if (ctl.kind === 'audio') {
      searchItem(body, renderAudio());
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
      if (ctl.buttons.some((x) => x[3])) row.classList.add('dock');
      for (const [title, icon, fn, short, tab] of ctl.buttons) {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title.replace(/ \(.*\)$/, ''));
        b.innerHTML = icon;
        if (short) {
          const s = document.createElement('span');
          s.textContent = short;
          b.append(s);
        }
        if (tab) dockTabs.push([tab, b]);
        if (short === 'More') { b.classList.add('dock-more-btn'); dockMoreBtn = b; }
        if (short === 'Stage' || short === 'Scenes') b.classList.add('dock-watch');
        if (short && ['Scenes', 'Controls', 'Timeline', 'Fader', 'Record'].includes(short)) b.classList.add('tool');
        // A dock page's button opens it, and a second press goes back.
        b.addEventListener('click', tab ? () => (currentTab === tab ? backFromPlay() : fn()) : fn);
        if (fn === togglePause) pauseButtons.push(b);
        if (fn === toggleGather) gatherButtons.push(b);
        if (fn === dockRecord) {
          recUi.push(() => b.classList.toggle('rec', recorder.on));
          dockTabs.push(['record', b]);
        }
        row.append(b);
      }
      searchItem(body, row);
      continue;
    }

    if (ctl.kind === 'buttons') {
      const row = document.createElement('div');
      row.className = 'buttons';
      if (ctl.limit && ctl.buttons.length > ctl.limit) {
        // Show the first few; a last button reveals the rest.
        row.classList.add('short');
        row.style.setProperty('--limit', String(ctl.limit));
        const all = document.createElement('button');
        all.type = 'button';
        all.className = 'show-all';
        all.textContent = `All ${ctl.buttons.length} scenes`;
        all.addEventListener('click', () => {
          const short = row.classList.toggle('short');
          all.textContent = short ? `All ${ctl.buttons.length} scenes` : 'Fewer scenes';
          row.append(all);
        });
        queueMicrotask(() => row.append(all));
      }
      ctl.buttons.forEach(([text, fn], idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        if (ctl.limit && idx >= ctl.limit) b.classList.add('extra');
        b.addEventListener('click', fn);
        if (ctl.active) refreshers.push(() => b.classList.toggle('on', ctl.active!(text)));
        row.append(b);
      });
      // With a Fine-tune split, buttons stay with the setting before them.
      searchItem(essBody && fineBody ? dest : body, row);
      if (ctl.show) conditional.push([row, ctl.show]);
      continue;
    }

    // A label around chip buttons would forward clicks to the first chip.
    const rackKind = ctl.kind === 'range' || ctl.kind === 'select' || ctl.kind === 'toggle';
    const row = document.createElement(rackKind || ctl.kind === 'multi' || ctl.kind === 'choice' || ctl.kind === 'colors' ? 'div' : 'label');
    row.className = `row ${ctl.kind}`;
    row.dataset.key = ctl.key;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = ctl.label;
    tipOn(name, ctl.key);
    row.append(name);
    const k = ctl.key;

    // The rack's parts: numbers are knobs (the white dot is the scene's
    // value, double-tap snaps back), choices step ‹ ›, switches are pills.
    const homeOf = () => (sceneBase ?? DEFAULTS)[k];
    if (ctl.kind === 'range') {
      row.className = 'row kn';
      name.remove();
      const kb = rackKnob(ctl, () => homeOf() as number, RACK_LIVE);
      row.append(kb.el);
      refreshers.push(kb.update);
    } else if (ctl.kind === 'select' || ctl.kind === 'toggle') {
      row.className = `row rk ${ctl.kind}`;
      name.remove();
      const rr = rackRow(ctl, homeOf, RACK_LIVE);
      row.append(rr.el);
      refreshers.push(rr.update);
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
    }
    let item: HTMLElement = row;
    if (essBody && fineBody) {
      // Wrapped with a pin: pin a Fine-tune setting to keep it with the essentials.
      const wrap = document.createElement('div');
      wrap.className = 'prow';
      wrap.dataset.idx = String(ci);
      const ess = essBody;
      const fine = fineBody;
      if (essKeys.has(k)) wrap.classList.add('core');
      else {
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'pin';
        pin.innerHTML = PIN_SVG;
        const sync = () => {
          const on = pins.has(k);
          pin.classList.toggle('on', on);
          pin.title = on ? 'Unpin: back to Fine-tune' : 'Pin to the essentials';
          pin.setAttribute('aria-label', `${on ? 'Unpin' : 'Pin'} ${ctl.label}`);
          pin.setAttribute('aria-pressed', String(on));
        };
        pin.addEventListener('click', () => {
          if (pins.has(k)) {
            pins.delete(k);
            // Back in its place in Fine-tune.
            const after = [...fine.children].find((c) => Number((c as HTMLElement).dataset.idx ?? -1) > ci);
            fine.insertBefore(wrap, after ?? null);
          } else {
            pins.add(k);
            ess.append(wrap);
          }
          writeJson(PINS_KEY, [...pins]);
          sync();
          refresh();
        });
        sync();
        wrap.append(pin);
      }
      wrap.prepend(row);
      item = wrap;
    }
    dest = destFor(k);
    searchItem(dest, item, SEARCH_WORDS[k]);
    if (ctl.show) conditional.push([item, ctl.show]);
  }

  // Whole-tab switch at the top of the tabs that can be switched off.
  for (const t of BYPASSABLE) {
    const first = sectionTabs.find(([, tt]) => tt === t)?.[0];
    if (!first) continue;
    const bar = document.createElement('div');
    bar.className = 'tab-power';
    const label = TABS.find(([x]) => x === t)![1];
    bar.innerHTML = `<span></span><button type="button" class="rack-switch"></button>`;
    const txt = bar.querySelector('span')!;
    const sw = bar.querySelector('button')!;
    sw.addEventListener('click', () => setBypass(t, !bypass.has(t)));
    const sync = () => {
      const off = bypass.has(t);
      bar.classList.toggle('off', off);
      txt.textContent = off ? `${label} is off. Your settings are kept; the field ignores them until you turn it back on.` : `${label}: the whole tab is on`;
      sw.textContent = off ? 'Turn on' : 'on';
      sw.setAttribute('aria-pressed', String(!off));
      sw.setAttribute('aria-label', `${label}: ${off ? 'turn the whole tab on' : 'switch the whole tab off'}`);
    };
    refreshers.push(sync);
    sync();
    first.before(bar);
    sectionTabs.push([bar, t]);
  }
  syncBypassUi();
  const stats = document.createElement('p');
  stats.className = 'stats';
  stats.id = 'stats';
  stats.title = 'Show debug info (I)';
  stats.style.cursor = 'pointer';
  stats.addEventListener('click', toggleDebug);
  controls.append(stats);
  const keys = document.createElement('p');
  keys.className = 'stats';
  keys.textContent = 'Click or hold on the field. Keys: hold 1–8 and scroll to turn a field knob (or play your scenes, see Field knobs) · Space pause · A gather · E explode · S scatter · D shuffle · F shuffle the music vibe · Enter type a word · V record a clip · H hide panel · ⌘K or / find a setting · I debug info.';
  controls.append(keys);
}

// --- the scene now -------------------------------------------------------------
// Under the header: which scene is playing, and "edited" once you've changed
// anything it set. Tap to open Scenes.
let sceneBase: Settings | null = null;
// Settings that move by themselves or aren't part of a scene's look.
const SCENE_IGNORE = new Set<string>(['xfPos']);
function sceneEdited() {
  if (!sceneBase) return false;
  const S = withBases(settings) as unknown as Record<string, unknown>;
  const B = sceneBase as unknown as Record<string, unknown>;
  const palAuto = settings.audioPalEvery > 0 && reacting();
  for (const k of Object.keys(DEFAULTS)) {
    if (SCENE_IGNORE.has(k) || (palAuto && (XF_PAL as readonly string[]).includes(k))) continue;
    const a = S[k];
    const b = B[k];
    if (a === b) continue;
    if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6) continue;
    if (typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b)) continue;
    return true;
  }
  return false;
}
function syncSceneNow() {
  const el = document.getElementById('scene-now');
  if (!el) return;
  let name = '';
  let edited = false;
  if (xfLive()) name = `${xf.a.name} ↔ ${xf.b.name}`;
  else if (tl.on && tlActive()) name = currentMine?.name ?? lastSceneName;
  else {
    name = currentMine?.name ?? lastSceneName;
    // Mid-morph or waiting for the beat, it isn't "edited" yet.
    if (name && !morphState && !pendingLook) edited = sceneEdited();
  }
  // Nothing picked (after a shuffle, say): still show it, as "Your mix", so
  // the overview is always one tap away.
  name ||= 'Your mix';
  el.hidden = false;
  el.querySelector('b')!.textContent = name;
  el.classList.toggle('edited', edited);
  markLibrary();
  el.title = edited ? `${name}, changed since you picked it` : name;
}
setInterval(syncSceneNow, 500);
// The scene playing (its name and what it set) survives a reload, so the
// name, "edited" and the library mark come back with the settings.
const SCENE_KEY = 'particle-field:scene';
let sceneSaved = '';
setInterval(() => {
  const v = JSON.stringify({ name: lastSceneName, mine: currentMine?.name ?? '', base: sceneBase });
  if (v === sceneSaved) return;
  sceneSaved = v;
  writeJson(SCENE_KEY, { name: lastSceneName, mine: currentMine?.name ?? '', base: sceneBase });
}, 1000);
setTimeout(() => {
  // A link (?preset=…) or something at start already picked one.
  if (lastSceneName || currentMine || sceneBase) return;
  const v = readJson<{ name?: string; mine?: string; base?: Settings | null }>(SCENE_KEY, {});
  if (v.mine) currentMine = myPresets.find((p) => p.name === v.mine) ?? null;
  else if (v.name && PRESETS.some(([n]) => n === v.name)) lastSceneName = v.name;
  if (v.base && (currentMine || lastSceneName)) sceneBase = { ...DEFAULTS, ...v.base };
  syncSceneNow();
  if (currentMine) redrawMine();
}, 0);
document.getElementById('scene-now')!.addEventListener('click', () => openOverview());
// The scene's name sits in the panel's header (on phones in place of the
// title, to leave the room to the settings).
{
  const sn = document.getElementById('scene-now')!;
  document.querySelector<HTMLElement>('#panel header h1')!.after(sn);
}
let ovEl: HTMLElement | null = null;
/** Where the overview was scrolled to when it closed. */
let watchScroll = 0;
function closeOverview() {
  if (document.querySelector('.overview')) revealKnobs();
  // Picking knobs ends with the Deck, so a knob turned later isn't picked by accident.
  ovPickKnobs = false;
  // Where it was scrolled to, so it opens again on the same knobs.
  if (ovEl) watchScroll = ovEl.querySelector('.ov-body')?.scrollTop ?? 0;
  closeTuner();
  ovEl?.remove();
  ovEl = null;
}
// Watching (phones): no menus at all, just the field. A faint scene pill
// brings the overview back, a faint shuffle rolls a new look, and a swipe
// sideways plays the previous / next scene. Both fade while you watch.
const watchBar = document.createElement('div');
watchBar.className = 'watch-bar';
watchBar.innerHTML = `<button type="button" class="watch-scene" aria-label="Back to the Deck">${ICONS.sliders}<b></b></button><button type="button" class="watch-shuffle" aria-label="Shuffle">${ICONS.shuffle}</button>`;
watchBar.querySelector('.watch-scene')!.addEventListener('click', stopWatching);
watchBar.querySelector('.watch-shuffle')!.addEventListener('click', () => shuffle());
document.querySelector('.stage')!.append(watchBar);
// Watch is simply the field with everything closed (the same view as
// closing the menu); the bottom bar, swipes and knobs work the same.
function startWatching() {
  closeOverview();
  if (!panel.classList.contains('collapsed')) toggle.click();
  revealKnobs();
  watchBar.querySelector('b')!.textContent = document.querySelector('#scene-now b')?.textContent || 'Deck';
}
function stopWatching() {
  openOverview();
  const body = ovEl?.querySelector<HTMLElement>('.ov-body');
  if (body) body.scrollTop = watchScroll;
}
{
  let sw: { x: number; y: number; t: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    // The field showing on its own (menu and overview closed), on a phone.
    const bare = sheetMode() && panel.classList.contains('collapsed') && !ovEl && !document.body.classList.contains('solo');
    sw = bare ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    const quick = performance.now() - sw.t < 600;
    sw = null;
    if (!quick || Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const r = watchSceneAfter(dx < 0 ? 1 : -1);
    const p = PRESETS.find(([nm]) => nm === r.name);
    if (p) playPreset(p[0], p[1]);
    setTimeout(() => (watchBar.querySelector('b')!.textContent = document.querySelector('#scene-now b')?.textContent || r.name), 50);
  });
}
// --- overview ------------------------------------------------------------------
// The scene rack: every setting the scene changed, playable, grouped by tab
// and card. Tap a card's name to go to it.
const OV_COLS: [string, Tab[]][] = [
  ['Look', ['look']], ['Shape', ['shape']], ['Motion', ['motion']], ['Music', ['music']], ['Camera', ['camera']],
  ['Play', ['presets', 'timeline', 'knobs', 'record', 'links']],
];
function openSection(id: string) {
  closeOverview();
  const c = CONTROLS.find((x) => x.kind === 'section' && x.id === id) as Extract<Control, { kind: 'section' }> | undefined;
  if (!c) return;
  if (panel.classList.contains('collapsed')) toggle.click();
  showTab(pageOf(c));
  folderEnter?.();
  const sec = document.querySelector<HTMLElement>(`[data-sec="${id}"]`);
  if (!sec) return;
  if (sec.classList.contains('closed')) sec.querySelector<HTMLElement>('[aria-controls]')?.click();
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const RACK_SKIP = new Set(['actions', 'presets', 'mine', 'record', 'play']);
type RackCtl = Extract<Control, { kind: 'range' | 'select' | 'choice' | 'toggle' | 'text' }>;
let rackTimer = 0;
type RackSrc = { get: (k: keyof Settings) => unknown; put: (k: keyof Settings, v: unknown) => void; base: Record<string, unknown> | null; settling: boolean };
const RACK_LIVE: RackSrc = {
  get: (k) => settings[k],
  put: (k, v) => set(k, v as never),
  get base() {
    return sceneBase as unknown as Record<string, unknown> | null;
  },
  get settling() {
    return !!(morphState || pendingLook);
  },
};
// Which controls the rack shows, by card and tab group.
type RackCard = { id: string; label: string; ctls: RackCtl[]; other: boolean };
// A crossfader side's rack: which settings show (and come in pairs) depends
// on that side's own values, so they stand in for the live ones while it's
// worked out.
function rackPlan(src: RackSrc) {
  if (src === RACK_LIVE) return rackPlanOf(src);
  const S = settings as unknown as Record<string, unknown>;
  const side = Object.keys(DEFAULTS).map((k) => [k, src.get(k as keyof Settings)] as const);
  const saved = { ...S };
  for (const [k, v] of side) S[k] = v;
  try {
    return rackPlanOf(src);
  } finally {
    Object.assign(S, saved);
  }
}
// Default-on switches the Deck lists whenever their card is switched on.
const DECK_WITH_CARD = new Set<string>(['obsShow', 'obsPlace', 'showWells']);
// Deck filters (Colour, Light, …): the picked ones, and every setting in them.
const ovLens = new Set<string>();
// 'moving' is the Animated chip: every setting with a swing or keyframes.
const lensKeys = () => new Set([...LENSES.filter(([id]) => ovLens.has(id)).flatMap(([, , keys]) => keys), ...(ovLens.has('moving') ? Object.keys(animMap()) : [])]);
function rackPlanOf(src: RackSrc) {
  const base = src.base ?? (DEFAULTS as unknown as Record<string, unknown>);
  const S = new Proxy({}, { get: (_, k) => src.get(k as keyof Settings) }) as Record<string, unknown>;
  const D = DEFAULTS as unknown as Record<string, unknown>;
  const settling = src.settling;
  const same = (a: unknown, b: unknown) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6) || JSON.stringify(a) === JSON.stringify(b);
  // Tab group → card → its changed controls (a setting shown once, on the
  // first card that has it).
  type Card = RackCard;
  const seen = new Set<string>();
  const groups = new Map<string, Card[]>();
  let sec: Extract<Control, { kind: 'section' }> | null = null;
  let card: Card | null = null;
  const lens = ovLens.size ? lensKeys() : null;
  for (const c of CONTROLS) {
    if (c.kind === 'section') {
      sec = c;
      card = null;
      continue;
    }
    if (!sec || RACK_SKIP.has(sec.id) || !('key' in c) || seen.has(c.key) || SCENE_IGNORE.has(c.key)) continue;
    // What the scene set, plus anything you've changed since (not mid-morph,
    // when everything is still on its way over).
    // Hidden in the panel right now (the word, once the shape isn't text): hidden here too.
    if (c.show && !c.show()) continue;
    // A few switches that default to on still show while their card is on.
    const withCard = DECK_WITH_CARD.has(c.key) && !!sec.power?.on();
    if (lens && !lens.has(c.key)) continue;
    if (!lens && same(base[c.key], D[c.key]) && (settling || same(S[c.key], base[c.key])) && !pairOf(c, card) && !withCard) continue;
    seen.add(c.key);
    if (!card) {
      const col = OV_COLS.find(([, tabs]) => tabs.includes(pageOf(sec!)))?.[0] ?? 'Play';
      card = { id: sec.id, label: sec.label, ctls: [], other: false };
      groups.set(col, [...(groups.get(col) ?? []), card]);
    }
    if (c.kind === 'range' || c.kind === 'select' || c.kind === 'choice' || c.kind === 'toggle' || c.kind === 'text') card.ctls.push(c as RackCtl);
    else card.other = true;
  }
  return { groups, base };
}
// A setting that only shows because of one already on the card (the shape
// to draw once Shape is "Geometric shape", say) comes along with it.
function pairOf(c: Control, card: RackCard | null) {
  if (!c.show || !card || !('key' in c) || !c.show()) return false;
  const D = DEFAULTS as unknown as Record<string, unknown>;
  const S = settings as unknown as Record<string, unknown>;
  for (const k of card.ctls.map((x) => x.key as string)) {
    const v = S[k];
    S[k] = D[k];
    let gone = false;
    try {
      gone = !c.show();
    } finally {
      S[k] = v;
    }
    if (gone) return true;
  }
  return false;
}
const rackSig = (groups: Map<string, RackCard[]>) => [...groups.values()].flat().map((cd) => `${cd.id}:${cd.ctls.map((c) => c.key).join(',')}`).join('|');
function renderRack(src: RackSrc = RACK_LIVE): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rack';
  const { groups, base } = rackPlan(src);
  const sig = rackSig(groups);
  // A choice that brings its own settings (or takes them away) redraws the
  // rack in place.
  const live = src;
  src = {
    ...live,
    get base() { return live.base; },
    get settling() { return live.settling; },
    put: (k, v) => {
      live.put(k, v);
      if (!wrap.isConnected) return;
      if (rackSig(rackPlan(live).groups) !== sig) wrap.replaceWith(renderRack(live));
    },
  };
  let count = 0;
  const updaters: (() => void)[] = [];
  const head = document.createElement('div');
  head.className = 'rack-head';
  wrap.append(head);
  {
    // Filter chips: show only what changes one part of the picture.
    const chips = document.createElement('div');
    chips.className = 'rack-lens';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Show settings for');
    const chip = (id: string | null, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      const on = id ? ovLens.has(id) : !ovLens.size;
      b.className = on ? 'on' : '';
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => {
        if (!id) ovLens.clear();
        else if (ovLens.has(id)) ovLens.delete(id);
        else ovLens.add(id);
        const scroller = wrap.closest('.ov-body');
        const top = scroller?.scrollTop ?? 0;
        wrap.replaceWith(renderRack(live));
        if (scroller) scroller.scrollTop = Math.min(top, scroller.querySelector('.rack-lens') ? (scroller.querySelector('.rack-lens') as HTMLElement).offsetTop : 0);
      });
      return b;
    };
    const nAnim = Object.keys(animMap()).length;
    const animChip = nAnim || ovLens.has('moving') ? [chip('moving', `∿ Animated${nAnim ? ` ${nAnim}` : ''}`)] : [];
    animChip[0]?.classList.add('lens-anim');
    chips.append(chip(null, 'In this scene'), ...animChip, ...LENSES.map(([id, label]) => chip(id, label)));
    wrap.append(chips);
  }
  for (const [label] of OV_COLS) {
    const cards = groups.get(label);
    if (!cards) continue;
    const box = document.createElement('div');
    box.className = 'rack-group';
    const h = document.createElement('h3');
    h.textContent = label;
    box.append(h);
    {
      // The whole group's cards, open in the Studio.
      const tab = (OV_COLS.find(([l]) => l === label)?.[1][0] ?? 'look') === 'presets' ? 'knobs' : OV_COLS.find(([l]) => l === label)![1][0];
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'rack-studio';
      go.textContent = 'Open in Studio ›';
      go.addEventListener('click', () => {
        closeOverview();
        if (panel.classList.contains('collapsed')) toggle.click();
        showTab(tab);
        folderEnter?.();
        controls.scrollTop = 0;
        uPaint(true);
      });
      h.append(go);
    }
    for (const cd of cards) {
      const part = document.createElement('div');
      part.className = 'rack-card';
      const cap = document.createElement('button');
      cap.type = 'button';
      cap.className = 'rack-cap';
      cap.textContent = cd.label;
      cap.title = `Open ${cd.label}`;
      cap.addEventListener('click', () => openSection(cd.id));
      if (locks.has(cd.id)) {
        part.classList.add('locked');
        part.title = `${cd.label} is locked: scenes and Shuffle keep it`;
        cap.insertAdjacentHTML('beforeend', ` <span class="rack-lock" title="Locked: scenes and Shuffle keep this card">${LOCK_SVG}</span>`);
      }
      part.append(cap);
      const knobs = document.createElement('div');
      knobs.className = 'rack-knobs';
      const rows = document.createElement('div');
      rows.className = 'rack-rows';
      for (const c of cd.ctls) {
        count++;
        if (c.kind === 'range') {
          const k = rackKnob(c, () => base[c.key] as number, live); // no redraw mid-turn
          knobs.append(k.el);
          updaters.push(k.update);
        } else if (c.kind === 'text') {
          const r = rackText(c, src);
          holdToSolo(r.el, () => soloRowOpen(r.el, r.update));
          rows.append(r.el);
          updaters.push(r.update);
        } else {
          const r = rackRow(c, () => base[c.key], src);
          holdToSolo(r.el, () => soloRowOpen(r.el, r.update));
          rows.append(r.el);
          updaters.push(r.update);
        }
      }
      if (knobs.childElementCount) part.append(knobs);
      if (rows.childElementCount) part.append(rows);
      if (cd.other && !cd.ctls.length) cap.textContent += ' ›';
      box.append(part);
    }
    wrap.append(box);
  }
  // Your picked field knobs, always listed here, even ones this scene leaves out.
  const picksEl = document.createElement('div');
  picksEl.className = 'fk-chips';
  wrap.insertBefore(picksEl, head);
  let picksSig = '-';
  const drawPicks = () => {
    const sig = settings.knobsPick + '|' + knobPicks().map(knobLive).join();
    if (sig === picksSig) return;
    picksSig = sig;
    const picks = knobPicks().filter((k, _, a) => { const f = families().get(k); return !f || f.parent === k || !a.includes(f.parent); });
    picksEl.hidden = !picks.length;
    picksEl.innerHTML = picks.length ? '<h3>Your field knobs</h3>' : '';
    for (const k of picks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fk-chip' + (knobLive(k) ? '' : ' idle');
      b.title = knobLive(k) ? 'Take this knob off' : 'Not used by this scene, so it sits out. Tap to take it off';
      b.innerHTML = `<span></span><i aria-hidden="true">✕</i>`;
      b.querySelector('span')!.textContent = (knobSpec(k)?.label ?? k).replace(/ \(.*\)$/, '');
      b.addEventListener('click', () => toggleFieldKnob(k));
      picksEl.append(b);
    }
    const clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'fk-chip clear';
    clr.textContent = 'Clear all';
    clr.addEventListener('click', () => clearKnobPicks());
    if (picks.length) picksEl.append(clr);
  };
  drawPicks();
  updaters.push(drawPicks);
  head.classList.toggle('empty', !count);
  head.innerHTML = count
    ? `<h3>Knobs</h3><span>The ${count} setting${count === 1 ? '' : 's'} this scene changed, ready to play. ${matchMedia('(pointer: coarse)').matches ? 'Tap a knob for a big slider, or drag it sideways' : 'Drag a knob sideways to turn it'}; the white dot is the scene's own value${matchMedia('(pointer: coarse)').matches ? '' : ', double-click to snap back'}.</span>`
    : '<h3>Knobs</h3><span>Everything is at its default.</span>';
  clearInterval(rackTimer);
  rackTimer = window.setInterval(() => {
    if (!wrap.isConnected) return clearInterval(rackTimer);
    for (const u of updaters) u();
    // Settings that are field knobs wear a small dot.
    const moving = animMap();
    for (const e of wrap.querySelectorAll<HTMLElement>('[data-key]')) {
      e.classList.toggle('fk', isFieldKnob(e.dataset.key!));
      const a = moving[e.dataset.key!];
      e.classList.toggle('anim', !!a);
      // Swing shows a wave, keyframes a row of diamonds.
      const mode = a ? a.m : '';
      if (e.dataset.anim !== mode) {
        e.dataset.anim = mode;
        const ab = e.querySelector<HTMLElement>('.rk-anim');
        if (ab) ab.innerHTML = mode === 'keys' ? KEYS_ICON : waveIcon(a?.m === 'wave' ? a.s : 'sine');
      }
    }
  }, 150);
  return wrap;
}
const RACK_RING = 94.25; // 270° of a 20-radius circle
function rackKnob(c: Extract<Control, { kind: 'range' }>, home: () => number, src: RackSrc) {
  const el = document.createElement('div');
  el.className = 'rack-knob';
  el.dataset.key = c.key;
  el.innerHTML = `<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="bg" cx="26" cy="26" r="20" stroke-dasharray="${RACK_RING} 200" transform="rotate(135 26 26)"/><circle class="val" cx="26" cy="26" r="20" stroke-dasharray="0 200" transform="rotate(135 26 26)"/><circle class="home" r="2.5"/></svg><b></b><em class="rack-bar" aria-hidden="true"><i></i><u></u></em><span></span>`;
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', c.label);
  const [val, homeDot] = [el.querySelector<SVGCircleElement>('.val')!, el.querySelector<SVGCircleElement>('.home')!];
  // The same value as a thin bar (the Strips density shows this instead of the ring).
  const [barFill, barHome] = [el.querySelector<HTMLElement>('.rack-bar i')!, el.querySelector<HTMLElement>('.rack-bar u')!];
  el.querySelector('b')!.textContent = c.label.replace(/ \(.*\)$/, '');
  tipOn(el.querySelector('b')!, c.key);
  if (canAnimate(c.key) && src.get === RACK_LIVE.get) {
    const ab = document.createElement('button');
    ab.type = 'button';
    ab.className = 'rk-anim';
    ab.setAttribute('aria-label', `Animate ${c.label}`);
    ab.innerHTML = waveIcon('sine');
    ab.addEventListener('pointerdown', (e) => e.stopPropagation());
    ab.addEventListener('click', (e) => {
      e.stopPropagation();
      openTuner(c, home, src, () => update(), el, true);
    });
    el.append(ab);
  }
  const out = el.querySelector('span')!;
  const pos = (v: number) => Math.min(1, Math.max(0, (v - c.min) / (c.max - c.min)));
  const put = (v: number) => {
    const snapped = Math.round((Math.min(c.max, Math.max(c.min, v)) - c.min) / c.step) * c.step + c.min;
    src.put(c.key, +snapped.toFixed(6));
  };
  const update = () => {
    const v = src.get(c.key) as number;
    val.setAttribute('stroke-dasharray', `${(RACK_RING * pos(v)).toFixed(1)} 200`);
    barFill.style.width = `${pos(v) * 100}%`;
    barHome.style.left = `${pos(home()) * 100}%`;
    const a = ((135 + 270 * pos(home())) * Math.PI) / 180;
    homeDot.setAttribute('cx', (26 + 20 * Math.cos(a)).toFixed(1));
    homeDot.setAttribute('cy', (26 + 20 * Math.sin(a)).toFixed(1));
    out.textContent = c.format ? c.format(v) : String(+v.toFixed(3));
    el.setAttribute('aria-valuetext', out.textContent);
    out.classList.toggle('long', out.textContent.length > 5);
    el.classList.toggle('moved', Math.abs(v - home()) > c.step / 2);
  };
  if (src.get === RACK_LIVE.get) ANIM_KNOBS.add({ el, key: c.key, update });
  // Drag right (or up, with a mouse) to turn it up; the whole travel is ~180 px.
  // On a touch screen a tap opens a big slider instead, so the finger
  // doesn't hide what it's turning.
  let start: { x: number; y: number; v: number; t: number; turned: boolean } | null = null;
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.rk-anim')) return;
    start = { x: e.clientX, y: e.clientY, v: animKnob(c.key, src.get(c.key) as number), t: performance.now(), turned: false };
    el.setPointerCapture(e.pointerId);
    if (e.pointerType !== 'touch') el.classList.add('turning');
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const touch = e.pointerType === 'touch';
    // Touch: sideways only, so an up/down swipe still scrolls the list, and
    // only once it's clearly a drag (a tap opens the slider).
    if (touch && !start.turned && Math.abs(e.clientX - start.x) < 10) return;
    // Mouse: a small dead zone, so holding still (for the solo view) doesn't nudge it.
    if (!touch && !start.turned && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
    start.turned = true;
    el.classList.add('turning');
    const d = (e.clientX - start.x - (touch ? 0 : e.clientY - start.y)) / 180;
    put(start.v + d * (c.max - c.min));
    update();
  });
  // Hold (in the overview, on a touch screen): just this knob's slider over
  // the field, every menu hidden.
  holdToSolo(el, () => {
    start = null;
    el.classList.remove('turning');
    closeTuner();
    openTuner(c, home, src, update, el);
    enterSolo();
  });
  const end = (e: PointerEvent) => {
    if (start && e.type === 'pointerup' && e.pointerType === 'touch' && !start.turned && performance.now() - start.t < 500) openTuner(c, home, src, update, el);
    start = null;
    el.classList.remove('turning');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => {
    src.put(c.key, home());
    update();
  });
  el.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    put((src.get(c.key) as number) + dir * Math.max(c.step, (c.max - c.min) / 50));
    update();
  });
  update();
  return { el, update };
}
// The tuner (touch screens): a full-width slider along the bottom for the
// knob you tapped, with the scene's value marked and a snap back to it.
let tunerEl: HTMLElement | null = null;
let tunerKnob: HTMLElement | null = null;
function closeTuner() {
  if (document.body.classList.contains('solo')) exitSolo();
  tunerEl?.remove();
  tunerEl = null;
  tunerKnob?.classList.remove('tuning');
  tunerKnob = null;
}
// --- Animate values ----------------------------------------------------------
// Knobs on screen, kept moving with their settings (the Deck refreshes its
// own; the Studio's would otherwise wait for the next change).
const ANIM_KNOBS = new Set<{ el: HTMLElement; key: string; update: () => void }>();
setInterval(() => {
  const moving = animMap();
  const any = Object.keys(moving).length > 0;
  for (const kb of ANIM_KNOBS) {
    if (!kb.el.isConnected) {
      if (!document.body.contains(kb.el)) ANIM_KNOBS.delete(kb);
      continue;
    }
    const on = !!moving[kb.key];
    kb.el.classList.toggle('anim', on);
    if (on || (any && kb.el.classList.contains('anim'))) kb.update();
  }
}, 120);
// The song position in beats: runs at the music's tempo (snapping onto each
// new bar it hears) or the timeline's set tempo, and stops with Pause.
let animBeat = 0;
let animFrozen = false;
// A recording: the keys it may take, the ones you have touched so far (live),
// each one's value under the move (base) and its points.
type AnimRec = { keys: string[]; live: Set<string>; base: Record<string, number>; from: number; beats: number; pts: Record<string, [number, number][]>; done?: (n: number) => void };
let animRec: AnimRec | null = null;
// Settings that rebuild things when they change, or would fight other parts.
const ANIM_NO = new Set(['count', 'patScale', 'xfPos', 'morph', 'entranceTime', 'shapeSeqSec', 'camRate', 'audioSync', 'audioVj', 'burstSize']);
// Angles wrap round instead of stopping at the ends.
const ANIM_WRAP = new Set(['hueShift', 'windDir', 'launchDir', 'shapeAngle', 'shapeFacing', 'viewRot']);
let rangeMap: Map<string, Extract<Control, { kind: 'range' }>> | null = null;
function rangeCtl(k: string) {
  rangeMap ??= new Map(CONTROLS.flatMap((c) => (c.kind === 'range' ? [[c.key as string, c] as const] : [])));
  return rangeMap.get(k);
}
const canAnimate = (k: string) => !!rangeCtl(k) && !ANIM_NO.has(k);
const animMap = () => parseAnim(settings.anim);
const animBpm = () => (reacting() && audio.levels.bpm > 0 ? audio.levels.bpm : tl.bpm || 120);
const animClock = () => `${Math.round(animBpm())} BPM · ${reacting() && audio.levels.bpm > 0 ? 'from the music' : 'set tempo'}`;
// The knob value under a moving setting (what a knob turn starts from).
function animKnob(k: string, v: number) {
  return k in animBase && Math.abs(v - animWrote[k]) < 1e-9 ? animBase[k] : v;
}
function animPut(k: string, a: Anim | null) {
  const m = { ...animMap() };
  if (a) m[k] = a;
  else delete m[k];
  set('anim', formatAnim(m) as never);
}
function animTick(rawMs: number) {
  animBeat += (rawMs / 1000) * (animBpm() / 60);
  if (reacting() && audio.levels.bar) {
    const near = Math.round(animBeat / 4) * 4;
    if (Math.abs(near - animBeat) < 0.75) animBeat = near;
  }
  const map = animMap();
  const S = settings as unknown as Record<string, number>;
  // Recording a move: the knobs you touch are yours; each frame is kept.
  if (animRec) {
    const r = animRec;
    const t = (animBeat - r.from) / r.beats;
    for (const k of r.live) {
      const c = rangeCtl(k)!;
      const cur = S[k];
      animBase[k] = r.base[k];
      animWrote[k] = cur;
      if (t >= 0 && t < 1) r.pts[k].push([t, (cur - r.base[k]) / (c.max - c.min)]);
    }
    if (t >= 1) {
      animRec = null;
      // Line the recording up with the loop: t 0 is where the bar clock's cycle starts.
      const shift = (((r.from / r.beats) % 1) + 1) % 1;
      let made = 0;
      const next = { ...animMap() };
      for (const k of r.live) {
        const pts = thin(r.pts[k]).map(([x, v]) => [(x + shift) % 1, v] as [number, number]);
        if (pts.length < 2 || !pts.some(([, v]) => Math.abs(v) > 0.002)) continue;
        next[k] = { m: 'keys', b: r.beats / 4, e: 'line', k: pts };
        made++;
      }
      set('anim', formatAnim(next) as never);
      if (r.done) r.done(made);
      else showToast('Move recorded · it loops now');
    }
  }
  for (const k of Object.keys(animBase)) {
    if (map[k] || animRec?.live.has(k)) continue;
    if (Math.abs(S[k] - animWrote[k]) < 1e-9) S[k] = animBase[k];
    delete animBase[k];
    delete animWrote[k];
  }
  for (const k in map) {
    if (animRec?.live.has(k)) continue;
    const c = rangeCtl(k);
    const cur = S[k];
    if (!c || typeof cur !== 'number' || bypass.has('knobs')) continue;
    if (!(k in animWrote) || Math.abs(cur - animWrote[k]) > 1e-9) animBase[k] = cur;
    const base = animBase[k];
    const span = c.max - c.min;
    let v = animFrozen ? base : base + animOffset(map[k], animBeat) * span;
    if (ANIM_WRAP.has(k)) v = c.min + ((((v - c.min) % span) + span) % span);
    else v = Math.min(c.max, Math.max(c.min, v));
    if (c.step >= 1) v = Math.round(v);
    S[k] = v;
    animWrote[k] = v;
  }
}
function animRecord(k: string, bars: number) {
  const c = rangeCtl(k);
  if (!c) return;
  const cur = settings[k as keyof Settings] as number;
  // Start from the knob value, as a flat line to play over.
  const base = animKnob(k, cur);
  animPut(k, null);
  (settings as unknown as Record<string, number>)[k] = base;
  animRec = { keys: [k], live: new Set([k]), base: { [k]: base }, from: animBeat, beats: bars * 4, pts: { [k]: [] } };
}
// Record several settings over a loop that starts on the next bar. Only the
// ones you move (animRecTouch) get new keyframes; the rest keep what they had.
function animRecordMany(keys: string[], bars: number, done: (n: number) => void) {
  const beats = bars * 4;
  animRec = { keys, live: new Set(), base: {}, from: Math.ceil(animBeat / 4 - 0.02) * 4, beats, pts: {}, done };
}
// Call before writing a setting that a recording may take over.
function animRecTouch(k: string) {
  const r = animRec;
  if (!r || r.live.has(k) || !(r.keys.includes(k) || r.keys[0] === '*') || animBeat < r.from) return;
  const c = rangeCtl(k);
  if (!c) return;
  const cur = (settings as unknown as Record<string, number>)[k];
  if (animMap()[k]) animPut(k, null);
  r.base[k] = cur;
  r.live.add(k);
  // Before the first touch it sat still at this value.
  const t = (animBeat - r.from) / r.beats;
  r.pts[k] = t > 0.01 ? [[0, 0], [t, 0]] : [];
}

const WAVE_PATH: Record<AWave, string> = {
  sine: 'M1 8 C5 -2 9 -2 14 8 S23 18 27 8',
  tri: 'M1 14 L8 2 L15 14 L22 2 L27 10',
  ramp: 'M1 14 L13 2 L13 14 L25 2 L25 14',
  square: 'M1 14 L1 2 L10 2 L10 14 L19 14 L19 2 L27 2',
  steps: 'M1 10 L6 10 L6 3 L12 3 L12 13 L18 13 L18 6 L27 6',
  drift: 'M1 9 C4 4 7 12 11 7 S17 3 20 10 S25 9 27 5',
};
const waveIcon = (s: AWave) => `<svg width="28" height="16" viewBox="0 0 28 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="${WAVE_PATH[s]}"/></svg>`;

// The Animate part of a setting's slider sheet: Off / Swing / Keyframes.
function animPanel(c: Extract<Control, { kind: 'range' }>): HTMLElement {
  const k = c.key as string;
  const box = document.createElement('div');
  box.className = 'anim-panel';
  const span = c.max - c.min;
  const chipRow = <T,>(items: [T, string][], on: (v: T) => boolean, pick: (v: T) => void, cls = '') => {
    const row = document.createElement('div');
    row.className = `anim-chips ${cls}`;
    for (const [v, label] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = label;
      b.classList.toggle('on', on(v));
      b.setAttribute('aria-pressed', String(on(v)));
      b.addEventListener('click', () => pick(v));
      row.append(b);
    }
    return row;
  };
  const labelled = (text: string, el: HTMLElement) => {
    const w = document.createElement('div');
    w.className = 'anim-field';
    const s = document.createElement('span');
    s.textContent = text;
    w.append(s, el);
    return w;
  };
  const draw = () => {
    box.innerHTML = '';
    const a = animMap()[k];
    const recording = !!animRec?.live.has(k);
    const mode = recording ? 'rec' : a?.m ?? 'off';
    box.append(chipRow<string>([['off', 'Still'], ['wave', 'Swing'], ['keys', 'Keyframes']], (v) => v === mode || (v === 'keys' && mode === 'rec'), (v) => {
      if (v === 'off') animPut(k, null);
      else if (v === 'wave' && a?.m !== 'wave') animPut(k, { m: 'wave', s: 'sine', b: a?.b ?? 4, d: 0.2 });
      else if (v === 'keys' && a?.m !== 'keys') animPut(k, { m: 'keys', b: a?.b ?? 4, e: 'smooth', k: [[0, 0], [0.25, 0.25], [0.5, 0], [0.75, -0.25]] });
      draw();
    }, 'anim-mode'));
    if (a?.m === 'wave') {
      box.append(labelled('Shape', chipRow<AWave>(WAVES.map(([w, l]) => [w, `${waveIcon(w)}<i>${l}</i>`]), (v) => v === a.s, (v) => {
        animPut(k, { ...a, s: v });
        draw();
      }, 'anim-shapes')));
      const depth = document.createElement('input');
      depth.type = 'range';
      Object.assign(depth, { min: 0.02, max: 0.5, step: 0.01, value: String(a.d) });
      depth.setAttribute('aria-label', 'How far it swings');
      const out = document.createElement('output');
      const say = () => (out.textContent = `± ${c.format ? c.format(+(a.d * span).toFixed(3)).replace(/^[+−-]/, '') : +(a.d * span).toFixed(2)}`);
      say();
      depth.addEventListener('input', () => {
        a.d = Number(depth.value);
        animPut(k, { ...a });
        say();
      });
      const dw = document.createElement('div');
      dw.className = 'anim-depth';
      dw.append(depth, out);
      box.append(labelled('How far', dw));
    }
    if (a || recording) {
      const b = a?.b ?? 4;
      box.append(labelled('One loop', chipRow<number>(CYCLES.map((x) => [x, cycleLabel(x)]), (v) => v === b, (v) => {
        if (a) animPut(k, { ...a, b: v });
        draw();
      })));
    }
    if (a?.m === 'keys' || recording) {
      if (a?.m === 'keys') box.append(labelled('Between points', chipRow<Ease>(EASES, (v) => v === a.e, (v) => {
        animPut(k, { ...a, e: v });
        draw();
      })));
      box.append(animLane(c, span));
      const acts = document.createElement('div');
      acts.className = 'anim-acts';
      const rec = document.createElement('button');
      rec.type = 'button';
      rec.className = 'anim-rec';
      const bars = a?.b ?? 4;
      rec.innerHTML = recording ? '<i></i>Recording…' : `<i></i>Record ${cycleLabel(Math.max(1, bars))}`;
      rec.classList.toggle('live', recording);
      rec.title = 'Move the slider while it records; the move then loops';
      rec.addEventListener('click', () => {
        if (animRec) {
          animRec = null;
          draw();
          return;
        }
        animRecord(k, Math.max(1, bars));
        draw();
      });
      acts.append(rec);
      box.append(acts);
    }
    const foot = document.createElement('small');
    foot.className = 'anim-foot';
    foot.textContent = a || recording ? `${animClock()}${animFrozen ? ' · frozen' : ''}` : 'Swing moves it around the knob in time with the music. Keyframes follow points you place or record.';
    box.append(foot);
  };
  draw();
  // Redraw once a recording finishes.
  let was = !!animRec?.live.has(k);
  const timer = window.setInterval(() => {
    if (!box.isConnected) return clearInterval(timer);
    const now = !!animRec?.live.has(k);
    if (was && !now) draw();
    was = now;
  }, 200);
  return box;
}

// The keyframe lane: the loop left to right, the setting's range bottom to
// top. Tap empty space to add a point, drag one to move it, double-tap (or
// Delete) to remove it. The white line is where the loop is now.
function animLane(c: Extract<Control, { kind: 'range' }>, span: number): HTMLElement {
  const k = c.key as string;
  const wrap = document.createElement('div');
  wrap.className = 'anim-lane';
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-label', 'Keyframes: tap to add a point, drag to move, double-tap to remove');
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'anim-del';
  del.textContent = 'Delete point';
  del.hidden = true;
  wrap.append(cv, del);
  let sel = -1;
  let drag = -1;
  const keys = () => {
    const a = animMap()[k];
    return a?.m === 'keys' ? a : null;
  };
  const base = () => animKnob(k, settings[k as keyof Settings] as number);
  const H = 120;
  const yOf = (off: number) => (1 - (base() + off * span - c.min) / span) * H;
  const at = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    const t = Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width));
    const abs = c.min + (1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))) * span;
    return { t, off: Math.max(-1, Math.min(1, (abs - base()) / span)), x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
  };
  const write = (pts: [number, number][]) => {
    const a = keys();
    if (a) animPut(k, { ...a, k: pts.map(([t, v]) => [+t.toFixed(4), +v.toFixed(4)] as [number, number]) });
  };
  cv.addEventListener('pointerdown', (e) => {
    const a = keys();
    if (!a) return;
    e.preventDefault();
    const p = at(e);
    const pts = a.k.map((q) => [...q] as [number, number]);
    let near = -1;
    let best = 16;
    pts.forEach(([t, v], i) => {
      const d = Math.hypot(t * p.w - p.x, yOf(v) - p.y);
      if (d < best) {
        best = d;
        near = i;
      }
    });
    if (near < 0) {
      pts.push([p.t, p.off]);
      near = pts.length - 1;
      write(pts);
    }
    sel = drag = near;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    const a = keys();
    if (drag < 0 || !a) return;
    const p = at(e);
    const pts = a.k.map((q) => [...q] as [number, number]);
    if (!pts[drag]) return;
    pts[drag] = [p.t, p.off];
    write(pts);
  });
  const up = () => (drag = -1);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  const remove = () => {
    const a = keys();
    if (!a || sel < 0 || a.k.length <= 1) return;
    write(a.k.filter((_, i) => i !== sel));
    sel = -1;
  };
  cv.addEventListener('dblclick', remove);
  del.addEventListener('click', remove);
  const paint = () => {
    if (!wrap.isConnected) return;
    requestAnimationFrame(paint);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = cv.clientWidth;
    if (!w) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== H * dpr) {
      cv.width = Math.round(w * dpr);
      cv.height = H * dpr;
    }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const a = keys();
    const rec = animRec?.live.has(k) ? animRec : null;
    const bars = a?.b ?? (rec ? rec.beats / 4 : 4);
    // Bars (or quarter bars) as faint lines.
    const lines = bars >= 1 ? bars : 4;
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 1;
    for (let i = 1; i < lines; i++) {
      const x = Math.round((i / lines) * w) + 0.5;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    // The knob value, dashed.
    g.setLineDash([4, 4]);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.moveTo(0, yOf(0));
    g.lineTo(w, yOf(0));
    g.stroke();
    g.setLineDash([]);
    const accent = '#ffcf6a';
    if (a) {
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const off = animOffset({ ...a }, (x / w) * a.b * 4);
        const y = Math.min(H - 1, Math.max(1, yOf(off)));
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      a.k.forEach(([t, v], i) => {
        g.beginPath();
        g.arc(t * w, Math.min(H - 6, Math.max(6, yOf(v))), i === sel ? 7 : 5, 0, Math.PI * 2);
        g.fillStyle = i === sel ? accent : '#111114';
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = accent;
        g.stroke();
      });
    }
    if (rec) {
      g.strokeStyle = '#ff4d5a';
      g.lineWidth = 2;
      g.beginPath();
      (rec.pts[k] ?? []).forEach(([t, v], i) => (i ? g.lineTo(t * w, yOf(v)) : g.moveTo(t * w, yOf(v))));
      g.stroke();
    }
    // Where the loop is now.
    const ph = rec ? (animBeat - rec.from) / rec.beats : a ? animPhase(a, animBeat) : 0;
    g.fillStyle = rec ? '#ff4d5a' : 'rgba(255,255,255,0.8)';
    g.fillRect(Math.round(ph * w) - 1, 0, 2, H);
    del.hidden = !(a && sel >= 0 && sel < a.k.length && a.k.length > 1);
  };
  requestAnimationFrame(paint);
  return wrap;
}

// What's moving: the Play folder's card. The clock, each moving setting
// (tap to open its slider), Freeze and Stop all.
function renderAnimList(): HTMLElement {
  const box = document.createElement('div');
  box.className = 'anim-list';
  let sig = '';
  const draw = () => {
    const map = animMap();
    const keys = Object.keys(map).filter((k) => rangeCtl(k));
    const next = `${settings.anim}|${animFrozen}|${animRec ? [...animRec.live].join() : ''}`;
    if (next === sig && box.childElementCount) return;
    sig = next;
    box.innerHTML = '';
    const clock = document.createElement('div');
    clock.className = 'anim-clock';
    const ring = document.createElement('b');
    const txt = document.createElement('span');
    clock.append(ring, txt);
    box.append(clock);
    const tickClock = () => {
      if (!clock.isConnected) return;
      const beat = animBeat % 4;
      ring.textContent = `${Math.floor(animBeat / 4) % 4 + 1}.${Math.floor(beat) + 1}`;
      ring.style.setProperty('--p', String(beat / 4));
      txt.textContent = animClock();
      requestAnimationFrame(tickClock);
    };
    requestAnimationFrame(tickClock);
    if (!keys.length) {
      const p = document.createElement('p');
      p.className = 'anim-empty';
      p.textContent = matchMedia('(pointer: coarse)').matches ? 'Nothing is moving. Tap a knob, then Swing or Keyframes.' : 'Nothing is moving. Click ∿ on any knob (hover it), then Swing or Keyframes.';
      box.append(p);
      return;
    }
    for (const k of keys) {
      const c = rangeCtl(k)!;
      const a = map[k];
      const row = document.createElement('div');
      row.className = 'anim-item';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'anim-open';
      open.innerHTML = a.m === 'wave' ? waveIcon(a.s) : '<svg width="28" height="16" viewBox="0 0 28 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M1 12 L7 12 L11 3 L17 5 L21 13 L27 8"/><circle cx="11" cy="3" r="1.6" fill="currentColor"/><circle cx="21" cy="13" r="1.6" fill="currentColor"/></svg>';
      const t = document.createElement('span');
      const name = document.createElement('b');
      name.textContent = c.label.replace(/ \(.*\)$/, '');
      const sub = document.createElement('small');
      sub.textContent = a.m === 'wave' ? `${WAVES.find(([w]) => w === a.s)?.[1]} · ${cycleLabel(a.b)}` : `${a.k.length} points · ${cycleLabel(a.b)}`;
      t.append(name, sub);
      open.append(t);
      open.addEventListener('click', () => openTuner(c, () => ((sceneBase ?? DEFAULTS)[c.key] as number), RACK_LIVE, () => {}, open, true));
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'anim-x';
      x.setAttribute('aria-label', `Stop animating ${c.label}`);
      x.textContent = '✕';
      x.addEventListener('click', () => animPut(k, null));
      row.append(open, x);
      box.append(row);
    }
    const acts = document.createElement('div');
    acts.className = 'anim-acts';
    const fr = document.createElement('button');
    fr.type = 'button';
    fr.textContent = animFrozen ? 'Unfreeze' : 'Freeze all';
    fr.classList.toggle('on', animFrozen);
    fr.addEventListener('click', () => {
      animFrozen = !animFrozen;
      showToast(animFrozen ? 'Animations frozen at the knob values' : 'Animations moving again');
      draw();
    });
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.textContent = 'Stop all';
    stop.addEventListener('click', () => set('anim', '' as never));
    acts.append(fr, stop);
    box.append(acts);
  };
  draw();
  const timer = window.setInterval(() => (box.isConnected ? draw() : clearInterval(timer)), 300);
  return box;
}

const KEYS_ICON = '<svg viewBox="0 0 20 10" fill="currentColor" aria-hidden="true"><path d="M3 2 L6 5 L3 8 L0 5Z M10 2 L13 5 L10 8 L7 5Z M17 2 L20 5 L17 8 L14 5Z"/></svg>';
function openTuner(c: Extract<Control, { kind: 'range' }>, home: () => number, src: RackSrc, update: () => void, knob: HTMLElement, animOpen: boolean | 'closed' = false) {
  const again = tunerKnob === knob;
  closeTuner();
  if (again) return;
  tipHide();
  const el = document.createElement('div');
  el.className = 'tuner';
  el.innerHTML = `<div class="tuner-head"><b></b><output></output><button type="button" class="tuner-home">Scene value</button><button type="button" class="tuner-close" aria-label="Done">✕</button></div><div class="tuner-track"><input type="range"><i aria-hidden="true"></i></div>`;
  el.querySelector('b')!.textContent = c.label.replace(/ \(.*\)$/, '');
  el.querySelector('.tuner-close')!.before(fieldKnobButton(c.key));
  if (canAnimate(c.key)) {
    const ab = document.createElement('button');
    ab.type = 'button';
    ab.className = 'tuner-animate';
    ab.innerHTML = `${waveIcon('sine')}<span>Animate</span>`;
    ab.title = 'Move this setting by itself, in time with the music';
    let panel: HTMLElement | null = null;
    const show = (on: boolean) => {
      panel?.remove();
      panel = on ? animPanel(c) : null;
      if (panel) el.append(panel);
      ab.classList.toggle('on', on);
      ab.setAttribute('aria-expanded', String(on));
    };
    ab.addEventListener('click', () => show(!panel));
    el.querySelector('.tuner-fk, .tuner-close')!.before(ab);
    queueMicrotask(() => show(animOpen === true || (animOpen !== 'closed' && !!animMap()[c.key])));
  }
  if (ABOUT[c.key]) {
    const about = document.createElement('p');
    about.className = 'tuner-about';
    about.textContent = ABOUT[c.key];
    el.querySelector('.tuner-head')!.after(about);
  }
  const out = el.querySelector('output')!;
  const input = el.querySelector('input')!;
  const mark = el.querySelector<HTMLElement>('.tuner-track i')!;
  Object.assign(input, { min: c.min, max: c.max, step: c.step });
  input.setAttribute('aria-label', c.label);
  const pos = (v: number) => Math.min(1, Math.max(0, (v - c.min) / (c.max - c.min)));
  const sync = () => {
    const v = src.get(c.key) as number;
    if (document.activeElement !== input || !el.contains(document.activeElement)) input.value = String(v);
    out.textContent = c.format ? c.format(v) : String(+v.toFixed(3));
    mark.style.left = `calc(14px + (100% - 28px) * ${pos(home())})`;
    el.querySelector('.tuner-home')!.toggleAttribute('disabled', Math.abs(v - home()) <= c.step / 2);
  };
  input.addEventListener('input', () => {
    src.put(c.key, Number(input.value));
    update();
    sync();
  });
  el.querySelector('.tuner-home')!.addEventListener('click', () => {
    src.put(c.key, home());
    input.value = String(home());
    update();
    sync();
  });
  el.querySelector('.tuner-close')!.addEventListener('click', closeTuner);
  sync();
  const timer = window.setInterval(() => (el.isConnected ? (document.activeElement === input ? null : sync()) : clearInterval(timer)), 200);
  document.body.append(el);
  tunerEl = el;
  tunerKnob = knob;
  knob.classList.add('tuning');
}
// Solo: hold a setting in the overview (touch screens) and every menu hides,
// leaving the field and just that setting along the bottom. Let go of it with
// ✕ or a tap anywhere else, and the overview is back where it was.
let soloRow: { el: HTMLElement; parent: Node; next: Node | null; sheet: HTMLElement } | null = null;
let soloSince = 0;
function enterSolo() {
  document.body.classList.add('solo');
  soloSince = performance.now();
  navigator.vibrate?.(8);
}
function exitSolo() {
  document.body.classList.remove('solo');
  if (!soloRow) return;
  const r = soloRow;
  soloRow = null;
  r.parent.insertBefore(r.el, r.next && r.next.parentNode === r.parent ? r.next : null);
  r.sheet.remove();
}
// Make the setting a field knob, or take it off (single-setting view).
function fieldKnobButton(key: string) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tuner-fk';
  const show = () => {
    const on = isFieldKnob(key);
    b.textContent = on ? '✓ Field knob' : '+ Field knob';
    b.classList.toggle('on', on);
    b.title = on ? 'Take it off the field knobs' : 'Keep it as a knob on the field';
  };
  show();
  b.addEventListener('click', () => {
    const on = toggleFieldKnob(key);
    show();
    showToast(on ? 'Added to the field knobs' : 'Taken off the field knobs');
  });
  return b;
}
function soloRowOpen(row: HTMLElement, update: () => void) {
  closeTuner();
  const sheet = document.createElement('div');
  sheet.className = 'tuner solo-sheet';
  sheet.innerHTML = '<button type="button" class="tuner-close" aria-label="Done">✕</button>';
  sheet.querySelector('.tuner-close')!.addEventListener('click', exitSolo);
  if (row.dataset.key) sheet.querySelector('.tuner-close')!.before(fieldKnobButton(row.dataset.key));
  soloRow = { el: row, parent: row.parentNode!, next: row.nextSibling, sheet };
  sheet.prepend(row);
  const tipKey = row.querySelector<HTMLElement>('[data-tip]')?.dataset.tip;
  if (tipKey && ABOUT[tipKey]) {
    const about = document.createElement('p');
    about.className = 'tuner-about solo-about';
    about.textContent = ABOUT[tipKey];
    row.after(about);
  }
  document.body.append(sheet);
  // Kept current even if the overview redraws behind it.
  const timer = window.setInterval(() => (sheet.isConnected ? update() : clearInterval(timer)), 150);
  enterSolo();
}
// A touch held still for a moment on a control in the overview.
function holdToSolo(el: HTMLElement, fire: () => void) {
  let timer = 0;
  let at: { x: number; y: number } | null = null;
  let slack = 10;
  const stop = () => {
    clearTimeout(timer);
    at = null;
  };
  el.addEventListener('pointerdown', (e) => {
    stop();
    if (e.button > 0 || !el.closest('.overview') || document.body.classList.contains('solo')) return;
    // A mouse holds a little longer and must stay put: a press is also how a drag starts.
    const touch = e.pointerType === 'touch';
    slack = touch ? 10 : 4;
    at = { x: e.clientX, y: e.clientY };
    timer = window.setTimeout(() => {
      at = null;
      // The finger lifting after a hold isn't a tap on whatever is under it.
      const eat = (ev: Event) => ev.stopPropagation();
      const done = () => setTimeout(() => document.removeEventListener('click', eat, true), 50);
      document.addEventListener('click', eat, true);
      document.addEventListener('pointerup', done, { once: true, capture: true });
      document.addEventListener('pointercancel', done, { once: true, capture: true });
      fire();
    }, touch ? 450 : 550);
  });
  el.addEventListener('pointermove', (e) => {
    if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > slack) stop();
  });
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('contextmenu', (e) => el.closest('.overview') && e.preventDefault());
}
// Esc leaves the solo view too (keyboards).
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('solo')) {
    e.stopPropagation();
    if (soloRow) exitSolo();
    else {
      closeTuner();
      document.body.classList.remove('solo');
    }
  }
}, true);
// A tap anywhere else (not another knob) puts the tuner away.
document.addEventListener('pointerdown', (e) => {
  const t0 = e.target as HTMLElement;
  if (soloRow && !soloRow.sheet.contains(t0) && performance.now() - soloSince > 300) exitSolo();
  if (!tunerEl) return;
  const t = e.target as HTMLElement;
  if (tunerEl.contains(t) || t.closest('.rack-knob')) return;
  closeTuner();
}, true);
// A word or list to type (the text a shape spells, say). It applies when you
// press Enter or leave the box.
function rackText(c: Extract<Control, { kind: 'text' }>, src: RackSrc) {
  const el = document.createElement('label');
  el.className = 'rack-row rack-text';
  const name = document.createElement('span');
  name.textContent = c.label;
  tipOn(name, c.key);
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = c.placeholder ?? '';
  input.setAttribute('aria-label', c.label);
  input.addEventListener('change', () => src.put(c.key, input.value));
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  el.append(name, input);
  return {
    el,
    update: () => {
      if (document.activeElement !== input) input.value = String(src.get(c.key) ?? '');
    },
  };
}
function rackRow(c: Extract<Control, { kind: 'select' | 'choice' | 'toggle' }>, home: () => unknown, src: RackSrc) {
  const el = document.createElement('div');
  el.className = 'rack-row';
  if (c.kind !== 'toggle') el.dataset.key = c.key;
  const name = document.createElement('span');
  name.textContent = c.label;
  tipOn(name, c.key);
  const out = document.createElement('b');
  if (c.kind === 'toggle') {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'rack-switch';
    sw.setAttribute('aria-label', c.label);
    sw.addEventListener('click', () => src.put(c.key, !src.get(c.key)));
    el.append(name, sw);
    return {
      el,
      update: () => {
        sw.setAttribute('aria-pressed', String(!!src.get(c.key)));
        sw.textContent = src.get(c.key) ? 'on' : 'off';
      },
    };
  }
  const step = (d: number) => {
    const i = c.options.findIndex(([k]) => k === src.get(c.key));
    const n = c.options.length;
    src.put(c.key, c.options[(i + d + n) % n][0]);
  };
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.textContent = '‹';
  prev.setAttribute('aria-label', `Previous ${c.label}`);
  prev.addEventListener('click', () => step(-1));
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = '›';
  next.setAttribute('aria-label', `Next ${c.label}`);
  next.addEventListener('click', () => step(1));
  out.addEventListener('dblclick', () => src.put(c.key, home()));
  // Long lists: tap the value to pick from all of them (the phone's own picker).
  let pick: HTMLSelectElement | null = null;
  if (c.options.length > 4) {
    pick = document.createElement('select');
    pick.className = 'rack-pick';
    pick.setAttribute('aria-label', c.label);
    for (const [value, text] of c.options) pick.add(new Option(text, value));
    pick.addEventListener('change', () => src.put(c.key, pick!.value));
    out.append(pick);
  }
  const txt = document.createElement('i');
  out.prepend(txt);
  el.append(name, prev, out, next);
  return {
    el,
    update: () => {
      txt.textContent = c.options.find(([k]) => k === src.get(c.key))?.[1] ?? String(src.get(c.key));
      if (pick) pick.value = String(src.get(c.key));
      el.classList.toggle('moved', src.get(c.key) !== home());
    },
  };
}

// Previous / next scene from the overview: the scene playing's family, A–Z as
// in the library, wrapping round. Then the rack redraws for the new scene.
function stepScene(d: number) {
  const r = sceneAfter(lastSceneName ? { name: lastSceneName } : null, lastSceneName ? d : 0);
  const p = PRESETS.find(([n]) => n === r.name);
  if (p) playPreset(p[0], p[1]);
  openOverview();
}

// The next / previous scene after a given one: its family A–Z (or your own
// scenes, in order), wrapping round.
// Watch swipes: every scene, family by family (the library's order), so a
// swipe past a family's last scene goes on into the next family.
function watchSceneAfter(d: number): XfRef {
  if (currentMine && myPresets.length) return sceneAfter({ name: currentMine.name, mine: true }, d);
  const fams: string[] = FAMILIES.map(([f]) => f as string).filter((f) => f !== 'all');
  const list = PRESETS.map(([n]) => n).filter((n) => fams.includes(FAMILY_OF[n])).sort((a, b) => fams.indexOf(FAMILY_OF[a]) - fams.indexOf(FAMILY_OF[b]) || a.localeCompare(b));
  const i = lastSceneName ? list.indexOf(lastSceneName) : -1;
  return { name: list[i < 0 ? 0 : (i + d + list.length) % list.length] };
}
function sceneAfter(r: XfRef | null, d: number): XfRef {
  if (r?.mine && myPresets.length) {
    const i = myPresets.findIndex((p) => p.name === r.name);
    return { name: myPresets[(Math.max(0, i) + d + myPresets.length) % myPresets.length].name, mine: true };
  }
  const fam = (r && FAMILY_OF[r.name]) || (presetFamily === 'all' ? 'space' : presetFamily);
  const list = PRESETS.filter(([n]) => FAMILY_OF[n] === fam).sort(([a], [b]) => a.localeCompare(b));
  const i = list.findIndex(([n]) => n === r?.name);
  return { name: list[i < 0 ? 0 : (i + d + list.length) % list.length][0] };
}
let ovSide: 'a' | 'b' = 'a';
function xfRackSrc(side: 'a' | 'b'): RackSrc {
  let cache: Settings | null = null;
  const cur = () => (cache ??= xfSide(xf[side]) ?? settings);
  return {
    get: (k) => cur()[k],
    put: (k, v) => {
      const r = xf[side];
      const base = xfScene(r) as unknown as Record<string, unknown> | null;
      r.edits = { ...r.edits };
      if (base && base[k] === v) delete r.edits[k];
      else r.edits[k] = v;
      cache = null;
      xfLast = -1;
      xfSave();
    },
    base: xfScene(xf[side]) as unknown as Record<string, unknown> | null,
    settling: false,
  };
}

let ovPickKnobs = false;
type OvDensity = 'strips' | 'roomy' | 'compact' | 'dense';
const OV_DENSITIES: [OvDensity, string][] = [['strips', 'Strips'], ['compact', 'Compact'], ['dense', 'Dense'], ['roomy', 'Roomy']];
const OV_DENSITY_KEY = 'particle-field:ov-density';
let ovDensity: OvDensity = (() => {
  try {
    const v = localStorage.getItem(OV_DENSITY_KEY);
    return OV_DENSITIES.some(([k]) => k === v) ? (v as OvDensity) : 'strips';
  } catch {
    return 'strips';
  }
})();
// Dots that pack tighter as the density goes up.
const DENSITY_ICON: Record<OvDensity, string> = {
  strips: '<rect x="4" y="5" width="16" height="2.2" rx="1.1"/><rect x="4" y="10.9" width="16" height="2.2" rx="1.1"/><rect x="4" y="16.8" width="16" height="2.2" rx="1.1"/>',
  roomy: '<circle cx="5.0" cy="5.0" r="2.6"/><circle cx="5.0" cy="19.0" r="2.6"/><circle cx="19.0" cy="5.0" r="2.6"/><circle cx="19.0" cy="19.0" r="2.6"/>',
  compact: '<circle cx="5.0" cy="5.0" r="2"/><circle cx="5.0" cy="12.0" r="2"/><circle cx="5.0" cy="19.0" r="2"/><circle cx="12.0" cy="5.0" r="2"/><circle cx="12.0" cy="12.0" r="2"/><circle cx="12.0" cy="19.0" r="2"/><circle cx="19.0" cy="5.0" r="2"/><circle cx="19.0" cy="12.0" r="2"/><circle cx="19.0" cy="19.0" r="2"/>',
  dense: '<circle cx="5.0" cy="5.0" r="1.5"/><circle cx="5.0" cy="9.7" r="1.5"/><circle cx="5.0" cy="14.3" r="1.5"/><circle cx="5.0" cy="19.0" r="1.5"/><circle cx="9.7" cy="5.0" r="1.5"/><circle cx="9.7" cy="9.7" r="1.5"/><circle cx="9.7" cy="14.3" r="1.5"/><circle cx="9.7" cy="19.0" r="1.5"/><circle cx="14.3" cy="5.0" r="1.5"/><circle cx="14.3" cy="9.7" r="1.5"/><circle cx="14.3" cy="14.3" r="1.5"/><circle cx="14.3" cy="19.0" r="1.5"/><circle cx="19.0" cy="5.0" r="1.5"/><circle cx="19.0" cy="9.7" r="1.5"/><circle cx="19.0" cy="14.3" r="1.5"/><circle cx="19.0" cy="19.0" r="1.5"/>',
};
function openOverview() {
  closeOverview();
  syncSceneNow();
  const el = document.createElement('div');
  el.className = 'overview';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Deck');
  const head = document.createElement('div');
  head.className = 'ov-head';
  const body = document.createElement('div');
  body.className = 'ov-body';
  if (xf.on) {
    // Crossfader: both scenes, the fader between them, and the knobs of the
    // side you pick. Turning one changes that scene; the mix follows.
    head.innerHTML = '<div class="ov-title"><span><small>Crossfader</small><b></b></span></div><button type="button" class="icon ov-xfstart on" aria-pressed="true" title="Back to one scene (stop crossfading)" aria-label="Back to one scene">⇄</button><button type="button" class="icon ov-close" aria-label="Close">✕</button>';
    head.querySelector('.ov-xfstart')!.addEventListener('click', () => {
      xfSetOn(false);
      openOverview();
    });
    head.querySelector('b')!.textContent = `${xf.a.name} ↔ ${xf.b.name}`;
    const box = document.createElement('div');
    box.className = 'ov-xf';
    const side = (s: 'a' | 'b') => {
      const c = document.createElement('div');
      c.className = `ov-side${ovSide === s ? ' on' : ''}`;
      const edits = Object.keys(xf[s].edits ?? {}).length;
      c.innerHTML = `<button type="button" class="ov-step" aria-label="Previous scene for ${s.toUpperCase()}">‹</button><button type="button" class="ov-pick"><small>${s.toUpperCase()}${edits ? ` · ${edits} tweak${edits > 1 ? 's' : ''}` : ''}</small><b></b></button><button type="button" class="ov-step" aria-label="Next scene for ${s.toUpperCase()}">›</button>`;
      c.querySelector('b')!.textContent = xf[s].name;
      const [pv, pick, nx] = c.querySelectorAll('button');
      const swap = (d: number) => {
        const r = sceneAfter(xf[s], d);
        xfSetScene(s, r.mine ? `my:${r.name}` : r.name);
        ovSide = s;
        openOverview();
      };
      pv.addEventListener('click', () => swap(-1));
      nx.addEventListener('click', () => swap(1));
      pick.addEventListener('click', () => {
        ovSide = s;
        openOverview();
      });
      return c;
    };
    const fader = document.createElement('input');
    fader.type = 'range';
    fader.min = '0';
    fader.max = '1';
    fader.step = '0.005';
    fader.value = String(settings.xfPos);
    fader.className = 'ov-fader';
    fader.setAttribute('aria-label', 'Crossfader');
    fader.addEventListener('input', () => xfNudge(+fader.value - settings.xfPos));
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'ov-xfstop';
    stop.textContent = '← Back to one scene';
    stop.addEventListener('click', () => {
      xfSetOn(false);
      openOverview();
    });
    // Hold the fader (touch or mouse) to play it alone over the field.
    const fRow = document.createElement('div');
    fRow.className = 'ov-fader-row';
    fRow.innerHTML = '<span></span><span></span>';
    const [na, nb] = fRow.querySelectorAll('span');
    na.textContent = xf.a.name;
    nb.textContent = xf.b.name;
    na.after(fader);
    holdToSolo(fRow, () => soloRowOpen(fRow, () => {}));
    box.append(side('a'), fRow, side('b'), stop);
    body.append(box, renderRack(xfRackSrc(ovSide)));
    const sync = () => {
      if (!el.isConnected) return;
      if (document.activeElement !== fader) fader.value = String(settings.xfPos);
      requestAnimationFrame(sync);
    };
    requestAnimationFrame(sync);
  } else {
    const name = document.querySelector('#scene-now b')?.textContent || 'Your mix';
    const edited = document.getElementById('scene-now')?.classList.contains('edited');
    head.innerHTML = `<div class="ov-title"><button type="button" class="ov-step" aria-label="Previous scene">‹</button><span><small></small><b></b>${edited ? '<em>edited</em>' : ''}</span><button type="button" class="ov-step" aria-label="Next scene">›</button></div><button type="button" class="icon ov-close" aria-label="Close">✕</button>`;
    head.querySelector('b')!.textContent = name;
    head.querySelector('small')!.textContent = lastSceneName && !currentMine ? familyLabel(FAMILY_OF[lastSceneName] ?? 'stories') : 'Deck';
    const [prevB, nextB] = head.querySelectorAll<HTMLButtonElement>('.ov-step');
    prevB.addEventListener('click', () => stepScene(-1));
    nextB.addEventListener('click', () => stepScene(1));
    // The scene's name opens a picker: families, then their scenes (and yours).
    const nameBox = head.querySelector<HTMLElement>('.ov-title span')!;
    nameBox.classList.add('ov-scenebtn');
    nameBox.setAttribute('role', 'button');
    nameBox.tabIndex = 0;
    nameBox.title = 'Pick a scene';
    nameBox.insertAdjacentHTML('beforeend', `<i class="ov-caret" aria-hidden="true">${svg('<path d="M6 9l6 6 6-6"/>')}</i>`);
    const openPicker = () => {
      const had = el.querySelector('.ov-picker');
      if (had) {
        had.remove();
        nameBox.classList.remove('open');
        return;
      }
      nameBox.classList.add('open');
      const pk = document.createElement('div');
      pk.className = 'ov-picker';
      let fam: Family = (lastSceneName && FAMILY_OF[lastSceneName]) || presetFamily;
      const chipsEl = document.createElement('div');
      chipsEl.className = 'families';
      const list = document.createElement('div');
      list.className = 'ov-plist';
      const play = (fn: () => void) => {
        fn();
        openOverview();
      };
      const draw = () => {
        for (const c of chipsEl.children) c.classList.toggle('on', (c as HTMLElement).dataset.fam === fam);
        list.innerHTML = '';
        const item = (label: string, on: boolean, go: () => void) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.classList.toggle('on', on);
          b.addEventListener('click', go);
          list.append(b);
        };
        if (fam === ('mine' as Family)) {
          for (const m of myPresets) item(m.name, m === currentMine, () => play(() => playMine(m)));
          return;
        }
        for (const [n, p] of PRESETS.filter(([n]) => fam === 'all' || FAMILY_OF[n] === fam).sort(([a], [b]) => a.localeCompare(b))) {
          item(n, n === lastSceneName && !currentMine, () => play(() => playPreset(n, p)));
        }
      };
      const fams: [string, string][] = [...(myPresets.length ? [['mine', 'My scenes'] as [string, string]] : []), ...FAMILIES];
      for (const [f, label] of fams) {
        const c = document.createElement('button');
        c.type = 'button';
        c.dataset.fam = f;
        c.textContent = label;
        c.addEventListener('click', () => {
          fam = f as Family;
          draw();
        });
        chipsEl.append(c);
      }
      if (currentMine) fam = 'mine' as Family;
      pk.append(chipsEl, list);
      head.after(pk);
      draw();
      list.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest' });
    };
    nameBox.addEventListener('click', openPicker);
    nameBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPicker();
      }
    });
    // Start a crossfade from this scene to the next one along.
    const xfStart = document.createElement('button');
    xfStart.type = 'button';
    xfStart.className = 'icon ov-xfstart';
    xfStart.textContent = '⇄';
    xfStart.title = 'Crossfade with another scene';
    xfStart.setAttribute('aria-label', xfStart.title);
    xfStart.addEventListener('click', () => {
      const a: XfRef | null = currentMine ? { name: currentMine.name, mine: true } : lastSceneName ? { name: lastSceneName } : null;
      const from = a ?? sceneAfter(null, 0);
      // A is what's on the field now: the scene plus every tweak you made.
      const base = xfScene(from);
      const edits: Record<string, unknown> = {};
      if (base) {
        const S = settings as unknown as Record<string, unknown>;
        const B = base as unknown as Record<string, unknown>;
        for (const k of Object.keys(DEFAULTS)) {
          if (SCENE_IGNORE.has(k) || k === 'xfPos') continue;
          if (JSON.stringify(S[k]) !== JSON.stringify(B[k])) edits[k] = S[k];
        }
      }
      xf.a = Object.keys(edits).length ? { ...from, edits } : from;
      xf.b = sceneAfter(from, 1);
      settings.xfPos = 0;
      ovSide = 'b';
      xfSetOn(true);
      openOverview();
    });
    // Every setting this scene changed, playable. Numbers are knobs (the
    // white dot is the scene's own value, double-tap to snap back), choices
    // step with ‹ ›, switches flip.
    head.querySelector('.ov-close')!.before(xfStart);
    body.append(renderRack());
  }
  head.querySelector('.ov-close')!.addEventListener('click', closeOverview);
  // Density: how tightly the knobs, choices and switches pack (an experiment
  // in compact controls; the rest of the menu may follow).
  el.dataset.density = ovDensity;
  const dens = document.createElement('button');
  dens.type = 'button';
  dens.className = 'icon ov-density';
  const showDensity = () => {
    const i = OV_DENSITIES.findIndex(([k]) => k === ovDensity);
    dens.innerHTML = svg(DENSITY_ICON[ovDensity]);
    dens.setAttribute('aria-label', `Density: ${OV_DENSITIES[i][1]} (tap for ${OV_DENSITIES[(i + 1) % OV_DENSITIES.length][1]})`);
    dens.title = dens.getAttribute('aria-label')!;
  };
  showDensity();
  dens.addEventListener('click', () => {
    const i = OV_DENSITIES.findIndex(([k]) => k === ovDensity);
    ovDensity = OV_DENSITIES[(i + 1) % OV_DENSITIES.length][0];
    try { localStorage.setItem(OV_DENSITY_KEY, ovDensity); } catch {}
    el.dataset.density = ovDensity;
    showDensity();
    showToast(OV_DENSITIES.find(([k]) => k === ovDensity)![1]);
  });
  (head.querySelector('.ov-xfstart') ?? head.querySelector('.ov-close')!).before(dens);
  // Pick field knobs: while on, a tap on a slider or choice adds it as a knob
  // on the field (or takes it off) instead of turning it.
  const pickK = document.createElement('button');
  pickK.type = 'button';
  pickK.className = 'icon ov-pickknobs';
  pickK.innerHTML = svg('<circle cx="12" cy="12" r="8"/><path d="M12 12l4.2-4.2"/>');
  const pickNote = document.createElement('p');
  pickNote.className = 'ov-picknote';
  pickNote.innerHTML = '<span>Tap sliders and choices to play them as field knobs; tap again to take one off. Your picks stand in for your knob set (On-screen controls) until you clear them.</span><button type="button">Clear picks</button>';
  pickNote.querySelector('button')!.addEventListener('click', () => {
    clearKnobPicks();
    for (const e of body.querySelectorAll('.fk')) e.classList.remove('fk');
    showToast('Picks cleared: your knob set is back');
  });
  const showPick = () => {
    el.classList.toggle('picking-knobs', ovPickKnobs);
    pickK.classList.toggle('on', ovPickKnobs);
    pickK.title = ovPickKnobs ? 'Done picking field knobs' : 'Pick field knobs';
    pickK.setAttribute('aria-label', pickK.title);
    pickK.setAttribute('aria-pressed', String(ovPickKnobs));
  };
  showPick();
  pickK.addEventListener('click', () => {
    ovPickKnobs = !ovPickKnobs;
    showPick();
    if (!ovPickKnobs) {
      const n = knobPicks().length;
      showToast(n ? `${n} picked knob${n > 1 ? 's' : ''}: close the menu to play them` : 'No picks: your knob set plays');
    }
  });
  dens.before(pickK);
  body.prepend(pickNote);
  const pickTarget = (e: Event) => (ovPickKnobs ? (e.target as HTMLElement).closest<HTMLElement>('.rack-knob[data-key], .rack-row[data-key]') : null);
  body.addEventListener('pointerdown', (e) => {
    if (pickTarget(e)) e.stopPropagation();
  }, true);
  body.addEventListener('click', (e) => {
    const t = pickTarget(e);
    if (!t) return;
    e.stopPropagation();
    e.preventDefault();
    const on = toggleFieldKnob(t.dataset.key!);
    t.classList.toggle('fk', on);
  }, true);
  // Phones: the overview fills the screen; Watch hides every menu, All
  // settings opens the tabs, ⇄ starts or stops a crossfade.
  const foot = document.createElement('div');
  foot.className = 'ov-foot';
  foot.innerHTML = `<button type="button" class="ov-watch">${ICONS.eye}<span>Stage</span></button><button type="button" class="ov-all">${ICONS.sliders}<span>Studio</span></button><button type="button" class="ov-xfb" aria-label="${xf.on ? 'Stop crossfading' : 'Crossfade with another scene'}" aria-pressed="${xf.on}">⇄</button>`;
  foot.querySelector('.ov-watch')!.addEventListener('click', startWatching);
  foot.querySelector('.ov-all')!.addEventListener('click', () => {
    closeOverview();
    if (panel.classList.contains('collapsed')) toggle.click();
  });
  foot.querySelector('.ov-xfb')!.addEventListener('click', () => {
    if (xf.on) {
      xfSetOn(false);
      openOverview();
    } else head.querySelector<HTMLButtonElement>('.ov-xfstart')?.click();
  });
  el.append(head, body, foot);
  document.body.append(el);
  ovEl = el;
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverview();
  });
  head.querySelector<HTMLElement>('.ov-close')!.focus();
}

const statsEl = () => document.getElementById('stats');
setInterval(() => {
  const el = statsEl();
  if (el) el.textContent = `${n.toLocaleString()} particles · ${paused ? 'paused' : `${Math.round(fps)} fps`}${renderScale < 1 ? ` · ${Math.round(renderScale * 100)}% resolution` : ''}`;
}, 500);

// --- X-Frame -------------------------------------------------------------------
// Inside X-Frame, another experiment (the audio timeline player) can publish
// its spectrum on 'audio.spectrum'. The 'feed' source runs the usual band,
// beat and genre analysis on those bins: no permission, and the sound plays
// once, from the player. It switches on by itself when a feed starts, unless
// you pressed Stop.
let feedDeclined = false;
// Shared play/pause across X-Frame ('play' topic): pausing here pauses the
// music player too, and pausing the player (or X-Frame's button) pauses us.
let sharedPlaying: boolean | null = null;
function startFeed() {
  feedDeclined = false;
  audio.startFeed((onFrame) => xframe.subscribe('audio.spectrum', (d: SpectrumFrame) => onFrame(d)));
}
if (xframe.inFrame) {
  xframe.subscribe('play', (d: { playing?: boolean }) => {
    if (typeof d?.playing !== 'boolean') return;
    sharedPlaying = d.playing;
    if (paused === d.playing) togglePause();
  });
  xframe.subscribe('audio.spectrum', (d: SpectrumFrame) => {
    if (audio.source === 'off' && !feedDeclined && d?.bins?.some((v) => v > 0)) startFeed();
  });
  // Stacked over another experiment: no page background, so the layer below
  // shows through; without mouse input the controls go away too.
  // Layers that don't get the mouse can't see taps; tell them where the
  // pointer is ('pointer' topic, viewport fractions), so e.g. the player's
  // fading controls can wake up and its buttons still work.
  let lastMove = 0;
  const sharePointer = (type: 'down' | 'move') => (e: PointerEvent) => {
    if (!xframe.layer.input) return;
    if (type === 'move' && (e.pointerType !== 'mouse' || e.timeStamp - lastMove < 200)) return;
    if (type === 'move') lastMove = e.timeStamp;
    xframe.publish('pointer', { type, x: e.clientX / innerWidth, y: e.clientY / innerHeight });
  };
  window.addEventListener('pointerdown', sharePointer('down'), true);
  window.addEventListener('pointermove', sharePointer('move'), true);
  xframe.onLayer((layer) => {
    seeThrough = layer.role === 'stacked';
    document.body.classList.toggle('see-through', seeThrough);
    document.body.classList.toggle('no-input', !layer.input);
    if (!layer.input && !panel.classList.contains('collapsed')) toggle.click();
    clear();
  });
}

// Source buttons, status line and a live bass / mid / treble meter.
function renderAudio() {
  const wrap = document.createElement('div');
  wrap.className = 'audio';
  wrap.innerHTML = `
    <div class="sources">
      <button type="button" data-src="mic">Mic</button>
      <button type="button" data-src="tab">Share tab</button>
      <button type="button" data-src="file">File</button>
      <button type="button" data-src="feed" hidden>From X-Frame</button>
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
    feed: 'Follows the audio player shown alongside in X-Frame. Play and pause there.',
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
  wrap.querySelector<HTMLButtonElement>('[data-src=feed]')!.hidden = !xframe.inFrame;
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const src = b.dataset.src!;
      if (src === 'off') {
        audio.stop();
        feedDeclined = true;
      } else if (src === 'feed') startFeed();
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

  meterLoop(wrap, () => {
    const L = audio.levels;
    [L.sub, L.bass, L.mid, L.treble].forEach((v, k) => (bars[k].style.transform = `scaleX(${v.toFixed(3)})`));
    wrap.classList.toggle('beat', L.beat);
    // Hit lights stay lit briefly so single-frame hits are visible.
    [L.pulse, L.snareEnv, L.hat ? 1 : hatGlow * 0.8].forEach((v, k) => (hits[k].style.opacity = String(0.25 + 0.75 * Math.min(1, v))));
    hatGlow = L.hat ? 1 : hatGlow * 0.8;
    bpmEl.textContent = audio.source !== 'off' && L.bpm ? `${L.bpm} BPM` : '';
  });
  sync();
  return wrap;
}

function togglePause() {
  paused = !paused;
  if (sharedPlaying !== !paused) {
    sharedPlaying = !paused;
    xframe.publish('play', { playing: !paused });
  }
  for (const b of pauseButtons) {
    b.innerHTML = paused ? ICONS.play : ICONS.pause;
    b.title = paused ? 'Play (Space)' : 'Pause (Space)';
    b.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    b.classList.toggle('on', paused);
  }
}

let gatherAll = false;
const gatherButtons: HTMLButtonElement[] = [];
function toggleGather() {
  gatherAll = !gatherAll;
  for (const b of gatherButtons) b.classList.toggle('on', gatherAll);
}

// Explode: a blast from the middle of the screen. Particles keep their
// places and are thrown outward, the nearest ones hardest, so a gathered
// clump bursts like a firework. Then the look's own forces take over again.
let blastUntil = 0;
function explode(cx = w / 2, cy = h / 2, power = 1) {
  if (gatherAll) toggleGather();
  const k = (Math.min(w, h) / 800) * power;
  const reach = Math.hypot(w, h) / 2;
  for (let i = 0; i < n; i++) {
    let dx = px[i] - cx;
    let dy = py[i] - cy;
    let d = Math.hypot(dx, dy);
    if (d < 0.5) {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dy = Math.sin(a);
      d = 1;
    }
    const near = Math.max(0.15, 1 - d / reach);
    const sp = (2.5 + Math.random() ** 0.6 * 9) * k * near;
    vx[i] += (dx / d) * sp;
    vy[i] += (dy / d) * sp;
  }
  blastUntil = performance.now() + 1800;
  addWave('shockwave', cx, cy);
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

// --- Shuffle: a remix of the whole engine ------------------------------------
// Each card of Shape, Motion and Look is taken from a scene that uses it
// (crossing scenes: the motion of one, the style of another, the shape of a
// third), then mutated: numbers nudged, choices sometimes re-rolled. Cards
// with an on/off switch are switched on or off by chance, so emitters,
// flocking, forces, obstacles, lenses and depth all come up. Everything comes
// from the menu's own definitions and the scene list, so new settings join
// in by themselves. A few rules keep the result readable, recent picks count
// for less (so rare ones come up), and the screen is checked a moment later:
// nearly blank or washed out, it quietly rolls again.
type RemixCard = { id: string; keys: string[]; ctls: Map<string, Control>; power?: Power; lockKeys: string[]; donors: string[] };
const REMIX_TABS: string[] = ['shape', 'motion', 'look'];
// Input modes and display helpers, not part of a look.
const REMIX_SKIP = new Set(['placeWell', 'showWells', 'obsPlace', 'obsShow', 'camRate', 'imageMode', 'drawOutline', 'audioKaleidoDrop', 'lensMusic', 'audioKaleido']);
// How often a switchable card is on in a remix.
const REMIX_ON: Record<string, number> = { shape: 0.6, life: 0.35, flow: 0.65, forces: 0.3, swarm: 0.3, obstacles: 0.15, lens: 0.3, depth: 0.35, pointer: 0.85 };
const REMIX_KEY = 'particle-field:remix';
let remixCardList: RemixCard[] | null = null;
// Scenes usable as donors: not ones that need your camera, a drawing or an image.
const remixDonor = (p: Partial<Settings>) => !['image', 'drawing', 'camera'].includes(p.shape ?? '') && p.obstacles !== 'body' && !p.camHands && !p.poseOn;
function remixCards(): RemixCard[] {
  if (remixCardList) return remixCardList;
  const cards: RemixCard[] = [];
  let cur: RemixCard | null = null;
  for (const c of CONTROLS) {
    if (c.kind === 'section') {
      cur = c.tab && (REMIX_TABS.includes(c.tab) || c.id === 'pointer') ? { id: c.id, keys: [], ctls: new Map(), power: c.power, lockKeys: (c.lock ?? []) as string[], donors: [] } : null;
      if (cur) cards.push(cur);
      continue;
    }
    if (!cur || !('key' in c) || REMIX_SKIP.has(c.key as string)) continue;
    if ((c.kind === 'range' || c.kind === 'select' || c.kind === 'choice' || c.kind === 'toggle') && !cur.ctls.has(c.key)) {
      if ((c.kind === 'select' || c.kind === 'choice') && c.options === PLAYABLE) continue;
      cur.ctls.set(c.key, c);
      cur.keys.push(c.key);
    }
  }
  // Which scenes use each card (switchable cards: the scenes that have it on).
  const S = settings as unknown as Record<string, unknown>;
  for (const card of cards) {
    const all = [...new Set([...card.keys, ...card.lockKeys])];
    for (const [name, raw] of PRESETS) {
      const p = upgradeShape(raw);
      if (FAMILY_OF[name] === 'camera' || !remixDonor(p)) continue;
      if (card.power) {
        const was = all.map((k) => S[k]);
        const P = { ...DEFAULTS, ...p } as unknown as Record<string, unknown>;
        let on = false;
        try {
          for (const k of all) S[k] = P[k];
          on = card.power.on();
        } catch {
          on = false;
        } finally {
          all.forEach((k, i) => (S[k] = was[i]));
        }
        if (!on) continue;
      }
      card.donors.push(name);
    }
  }
  return (remixCardList = cards);
}
type RemixTally = string[][];
function remixTally(): RemixTally {
  try {
    const v = JSON.parse(localStorage.getItem(REMIX_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
// Pick by weight: things used in recent remixes weigh less.
function pickFresh<T>(xs: readonly T[], tag: (x: T) => string, seen: Map<string, number>): T {
  const w = xs.map((x) => 1 / (1 + 2 * (seen.get(tag(x)) ?? 0)));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((r -= w[i]) <= 0) return xs[i];
  return xs[xs.length - 1];
}
/** One remix: the settings it would play, and what it used (for the tally). */
function rollRemix(): { patch: Record<string, unknown>; used: string[] } {
  const seen = new Map<string, number>();
  for (const t of remixTally()) for (const s of t) seen.set(s, (seen.get(s) ?? 0) + 1);
  const wild = settings.shuffleCards;
  const D = DEFAULTS as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const used: string[] = [];
  const presets = new Map(PRESETS.map(([n, p]) => [n, { ...DEFAULTS, ...upgradeShape(p) } as unknown as Record<string, unknown>]));
  for (const card of remixCards()) {
    if (locks.has(card.id)) continue;
    const all = [...new Set([...card.keys, ...card.lockKeys])];
    // Switched off: its defaults and its "off" values.
    const onOdds = REMIX_ON[card.id] ?? 1;
    const offSeen = seen.get(`${card.id}:off`) ?? 0;
    const onSeen = seen.get(`${card.id}:on`) ?? 0;
    const odds = Math.min(0.9, Math.max(0.1, onOdds + (offSeen - onSeen) * 0.01));
    if (card.power && (!card.donors.length || Math.random() > odds)) {
      for (const k of all) patch[k] = D[k];
      Object.assign(patch, card.power.off);
      used.push(`${card.id}:off`);
      continue;
    }
    if (!card.donors.length) continue;
    if (card.power) used.push(`${card.id}:on`);
    // Taken from a scene that uses it…
    const donor = pickFresh(card.donors, (n) => `${card.id}<${n}`, seen);
    used.push(`${card.id}<${donor}`);
    const src = presets.get(donor)!;
    for (const k of all) patch[k] = src[k];
    // …then mutated.
    for (const k of card.keys) {
      const c = card.ctls.get(k)!;
      if (c.kind === 'range') {
        if (Math.random() < 0.6) {
          const span = (c.max - c.min) * (wild ? 0.3 : 0.15);
          const v = Number(patch[k]) + (Math.random() * 2 - 1) * span;
          patch[k] = Number((Math.round(Math.min(c.max, Math.max(c.min, v)) / c.step) * c.step).toFixed(6));
        }
      } else if (c.kind === 'select' || c.kind === 'choice') {
        // The main choices of a card (style, palette, shape, flow type…) get
        // re-rolled more often than the fine ones.
        const lead = c.key === card.keys[0] || ['render', 'palette', 'colorBy', 'flowType', 'shapeGeo', 'shapeSolid', 'shapePattern', 'shapeIcon', 'pointerMode', 'click', 'emitter', 'edges'].includes(c.key);
        if (Math.random() < (lead ? (wild ? 0.6 : 0.4) : wild ? 0.25 : 0.12)) {
          let opts = c.options.map(([o]) => o);
          if (c.key === 'shape') opts = opts.filter((o) => !['image', 'drawing', 'camera', 'none'].includes(o));
          if (c.key === 'obstacles') opts = opts.filter((o) => o !== 'body');
          if (opts.length) patch[k] = pickFresh(opts, (o) => `${k}=${o}`, seen);
        }
        used.push(`${k}=${patch[k]}`);
      } else if (c.kind === 'toggle' && Math.random() < (wild ? 0.2 : 0.08)) patch[k] = !patch[k];
    }
  }
  remixRules(patch);
  return { patch, used };
}
// Rules that keep a remix readable: things that need each other come
// together, one main motion, not every effect at full strength at once.
function remixRules(p: Record<string, unknown>) {
  const n = (k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : ((settings as unknown as Record<string, unknown>)[k] as number) ?? d);
  const has = (k: string) => k in p;
  // Emitters need particles that come and go.
  if (has('emitter') && p.emitter !== 'none' && n('lifespan') === 0) p.lifespan = rand(3, 8, 0.5);
  // A shape needs the motion calm enough to hold it.
  if (has('shape') && p.shape !== 'none') {
    if (n('flow') > 0.7) p.flow = 0.5;
    if (n('wind') > 0.3) p.wind = 0.2;
    if (Math.abs(n('gravity')) > 0.25) p.gravity = 0.15 * Math.sign(n('gravity'));
    if (n('flock') > 0.5) p.flock = 0.3;
  }
  // Flocking is the main motion when it's on: the flow steps back.
  if (n('flock') > 0.4 && n('flow') > 0.8) p.flow = 0.4;
  // Styles that draw motion need some.
  if (['streaks', 'comets', 'ribbons', 'arrows'].includes(String(p.render)) && n('speed') < 0.8) p.speed = 0.9;
  if (p.render === 'ribbons' && n('trail') < 0.6) p.trail = 0.7;
  // Visible, and kind to slower devices.
  if (has('count')) p.count = Math.max(400, Math.min(['glow', 'bokeh', 'mixed', 'links'].includes(String(p.render)) ? 2800 : 4500, n('count')));
  if (has('size')) p.size = Math.max(0.7, Math.min(3, n('size')));
  if (has('trail')) p.trail = Math.min(0.94, n('trail'));
  // One picture effect at a time: a lens or 3D depth, and one lens.
  const lensOn = LENS_KEYS.filter((k) => has(k) && (k === 'lensMirror' ? p[k] !== 'off' : k === 'lensTiles' ? n(k) >= 2 : typeof p[k] === 'number' && (p[k] as number) > 0 && !k.startsWith('audio')));
  if (lensOn.length > 1) {
    const keep = pick(lensOn);
    for (const k of lensOn) if (k !== keep) p[k] = (DEFAULTS as unknown as Record<string, unknown>)[k];
  }
  if (lensOn.length && n('depth') > 0) {
    if (Math.random() < 0.5) p.depth = 0;
    else for (const k of lensOn) p[k] = (DEFAULTS as unknown as Record<string, unknown>)[k];
  }
  if (n('lensGlitch') > 0.5) p.lensGlitch = 0.5;
}
// A moment after a remix plays: is anything visible? Nearly blank or washed
// out, roll again (twice at most in a row).
let remixRetries = 0;
let remixCheckTimer = 0;
function remixCheck() {
  clearTimeout(remixCheckTimer);
  remixCheckTimer = window.setTimeout(() => {
    const W = 48, H = 27;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    try {
      g.drawImage(canvas, 0, 0, W, H);
    } catch {
      return;
    }
    const d = g.getImageData(0, 0, W, H).data;
    const lum: number[] = [];
    for (let i = 0; i < d.length; i += 4) lum.push(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
    const bg = [...lum].sort((a, b) => a - b)[lum.length >> 1];
    const lit = lum.filter((v) => Math.abs(v - bg) > 24).length / lum.length;
    if ((lit < 0.004 || lit > 0.92) && remixRetries < 2) {
      remixRetries++;
      shuffle(true);
    } else remixRetries = 0;
  }, 1400);
}
const SCENE_INPUT_KEYS = ['maskFx', 'gaze', 'obstacles', 'camMode', 'camMirror', 'camCentre', 'camRate', 'camMix', 'camSnap', 'camDepth', 'camPreview', 'camHands', 'camHandReach', 'camHandForce', 'gestOn', 'voice', 'poseOn', 'poseSweep', 'twoDist', 'twoAngle', 'links'] as const;
function shuffle(again?: unknown) {
  // (A click hands its event in: only a re-roll passes true.)
  const retry = again === true;
  if (!retry) remixRetries = 0;
  // A shuffle brings its own knobs: knobs you picked for the last look go.
  const hadPicks = !retry && !!settings.knobsPick;
  if (hadPicks) settings.knobsPick = '';
  const { patch, used } = rollRemix();
  const keys = new Set<keyof Settings>();
  const S = settings as unknown as Record<string, unknown>;
  // Like a scene change: inputs and music reactions the last scene switched
  // on (camera, preview, hands, body, links…) end with it, unless you changed them.
  const prev = currentMine?.settings ?? PRESETS.find(([n]) => n === lastSceneName)?.[1] ?? null;
  if (prev) {
    const P = upgradeShape(prev) as Record<string, unknown>;
    const D = DEFAULTS as unknown as Record<string, unknown>;
    const locked = new Set<string>(lockedKeys());
    for (const k of [...SCENE_INPUT_KEYS, ...MUSIC_KEYS]) {
      if (k in patch || locked.has(k) || !(k in P) || P[k] === D[k] || S[k] !== P[k]) continue;
      S[k] = D[k];
      keys.add(k as keyof Settings);
    }
  }
  lastSceneName = '';
  if (currentMine) {
    currentMine = null;
    redrawMine();
  }
  for (const [k, v] of Object.entries(patch)) {
    if (S[k] !== v) {
      S[k] = v;
      keys.add(k as keyof Settings);
    }
  }
  const kn = sceneKnobs(settings).join(',');
  if (kn !== settings.knobsScene) {
    settings.knobsScene = kn;
    keys.add('knobsScene');
  }
  try {
    localStorage.setItem(REMIX_KEY, JSON.stringify([...remixTally(), used].slice(-30)));
  } catch {
    /* not kept */
  }
  if (hadPicks) keys.add('knobsPick');
  if (keys.size) changed(keys);
  if (!retry) showToast(hadPicks ? 'New scene · your picked knobs cleared' : 'New scene');
  remixCheck();
}
// For the coverage test: roll without playing.
if (new URLSearchParams(location.search).has('remixstats')) (window as unknown as Record<string, unknown>).__remix = () => rollRemix();

// --- locks & own presets -------------------------------------------------------

const LOCK_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path class="shackle" d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const LOCKS_KEY = 'particle-field:locks';
const locks = new Set<string>(readJson<string[]>(LOCKS_KEY, []));
// Cards that were merged or split keep their old locks.
for (const [from, to] of [['click', 'pointer'], ['emitter', 'life'], ['look', 'depth'], ['shape', 'camshape']]) {
  if (locks.has(from)) locks.add(to);
}
locks.delete('click');
locks.delete('emitter');
function saveLocks() {
  writeJson(LOCKS_KEY, [...locks]);
}

const MY_PRESETS_KEY = 'particle-field:my-presets';
type MyPreset = { name: string; settings: Partial<Settings>; key?: string };
let myPresets: MyPreset[] = readJson<MyPreset[]>(MY_PRESETS_KEY, []).map((p) => ({ ...p, settings: migrateLegacy(p.settings) }));
// The preset of yours you played last, so Update can save over it in one tap.
let currentMine: MyPreset | null = null;
function updateMine(p: MyPreset) {
  p.settings = snapshot();
  writeJson(MY_PRESETS_KEY, myPresets);
  currentMine = p;
  redrawMine();
  showToast(`Updated ${keyTag(p)}${p.name}`);
}

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
  // Mid-morph, save where the look is heading, not the halfway values.
  const { audioFineTune: _skip, ...rest } = { ...withBases(settings), ...(morphState?.to ?? {}) } as Settings;
  return { ...rest };
}

function renderMyPresets() {
  const wrap = document.createElement('div');
  wrap.className = 'mypresets';
  const draw = () => {
    wrap.innerHTML = '';
    if (myPresets.length) {
      const h = document.createElement('span');
      const list = document.createElement('div');
      list.className = 'mine-list';
      myPresets.forEach((p, idx) => {
        const item = document.createElement('div');
        item.className = p === currentMine ? 'mine cur' : 'mine';
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = p.name;
        b.title = 'Load this scene';
        b.addEventListener('click', () => playMine(p));
        // Which number key plays it.
        const key = document.createElement('select');
        key.className = 'keysel';
        key.title = 'Number key that plays this scene';
        key.innerHTML = ['<option value="">⌨</option>', ...KEY_ORDER.map((d) => `<option value="${d}">${d}</option>`)].join('');
        key.value = p.key ?? '';
        // Number keys turn knobs instead: the binding is kept, just not shown.
        key.hidden = settings.numberKeys === 'knobs';
        key.addEventListener('change', () => {
          for (const o of myPresets) if (o !== p && o.key === key.value) delete o.key;
          if (key.value) p.key = key.value;
          else delete p.key;
          writeJson(MY_PRESETS_KEY, myPresets);
          draw();
        });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = '×';
        del.title = `Delete “${p.name}”`;
        del.addEventListener('click', () => {
          if (!confirm(`Delete the scene “${p.name}”?`)) return;
          myPresets.splice(idx, 1);
          writeJson(MY_PRESETS_KEY, myPresets);
          draw();
        });
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'del';
        copy.textContent = '⧉';
        copy.title = `Copy “${p.name}” as text (paste it into the name box to import)`;
        copy.addEventListener('click', () => {
          // Only what differs from the defaults keeps it short.
          const diff = Object.fromEntries(Object.entries(p.settings).filter(([k, v]) => DEFAULTS[k as keyof Settings] !== v));
          const text = JSON.stringify({ name: p.name, ...diff });
          void navigator.clipboard?.writeText(text).then(() => showToast('Copied'), () => prompt('Copy this:', text));
        });
        item.append(key, b, copy, del);
        list.append(item);
      });
      wrap.append(h, list);
    }
    if (currentMine && myPresets.includes(currentMine)) {
      const cur = currentMine;
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'update-mine';
      up.textContent = `Save changes to ${cur.key ? cur.key + ' · ' : ''}${cur.name}`;
      up.title = cur.key && settings.numberKeys === 'mine' ? `Saves the current scene over this one (Shift+${cur.key} does the same)` : 'Saves the current scene over this one';
      up.addEventListener('click', () => updateMine(cur));
      wrap.append(up);
    }
    const form = document.createElement('form');
    form.className = 'save';
    form.innerHTML = '<input type="text" maxlength="8000" placeholder="Name this scene…" aria-label="Scene name" /><button type="submit">Save scene</button>';
    const input = form.querySelector('input')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = input.value.trim();
      // Pasted preset text (from the copy button) imports it.
      if (raw.startsWith('{')) {
        try {
          const { name: nm, ...rest } = JSON.parse(raw) as Partial<Settings> & { name?: string };
          myPresets.push({ name: String(nm ?? `Imported ${myPresets.length + 1}`), settings: { ...DEFAULTS, ...rest } });
          writeJson(MY_PRESETS_KEY, myPresets);
          draw();
          return;
        } catch {
          showToast('That scene text is not valid');
          return;
        }
      }
      const name = raw.slice(0, 40) || `My scene ${myPresets.length + 1}`;
      const existing = myPresets.findIndex((p) => p.name === name);
      if (existing >= 0) myPresets[existing].settings = snapshot();
      else myPresets.push({ name, settings: snapshot() });
      currentMine = myPresets[existing >= 0 ? existing : myPresets.length - 1];
      writeJson(MY_PRESETS_KEY, myPresets);
      draw();
    });
    wrap.append(form);
  };
  draw();
  redrawMine = draw;
  return wrap;
}

// Open into a preset: ?preset=3 (a key of yours), ?preset=Obi%20glow (one of
// your names) or ?preset=Smoke (a built-in), also as #preset=… . Your own
// presets win over built-ins with the same name. On load the look is there at
// once; changing the hash later morphs to it like a key press.
function presetFromUrl(first: boolean) {
  const want = (new URLSearchParams(location.hash.slice(1)).get('preset') ?? new URLSearchParams(location.search).get('preset') ?? '').trim();
  if (!want) return;
  const lw = want.toLowerCase();
  const mine = myPresets.find((o) => o.key === want) ?? myPresets.find((o) => o.name.toLowerCase() === lw);
  if (mine && !first) return playMine(mine);
  const built = PRESETS.find(([name]) => name.toLowerCase() === lw);
  const p = mine?.settings ?? built?.[1];
  if (!p) {
    showToast(`No scene called “${want}”`);
    return;
  }
  if (first) {
    const { morph, beatSnap } = settings;
    settings.morph = 0;
    settings.beatSnap = false;
    apply(p, false);
    settings.morph = morph;
    settings.beatSnap = beatSnap;
  } else apply(p, false);
  lastPresetFamily = built && !mine ? (FAMILY_OF[built[0]] ?? null) : null;
  if (built && !mine) lastSceneName = built[0];
  if (mine) {
    currentMine = mine;
    redrawMine();
  }
  showToast(mine ? `${mine.key ? mine.key + '  ' : ''}${mine.name}` : built![0]);
}

const KEY_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
let redrawMine = () => {};

function playMine(p: MyPreset) {
  noteRecent(p.name);
  lastPresetFamily = null;
  apply(p.settings, false);
  currentMine = p;
  redrawMine();
  const nk = knobPicks().length;
  showToast(`${keyTag(p)}${p.name}${nk && typeof p.settings.knobsPick === 'string' ? ` · ${nk} knob${nk > 1 ? 's' : ''}` : ''}${settings.beatSnap && audio.source !== 'off' ? ' · on the beat' : ''}`);
}

const keyTag = (p: MyPreset) => (p.key && settings.numberKeys === 'mine' ? p.key + '  ' : '');
// Number keys play own presets; Shift + number saves the current look there.
function numberKey(d: string, save: boolean) {
  if (save) {
    let p = myPresets.find((o) => o.key === d);
    if (p) p.settings = snapshot();
    else {
      p = { name: `Key ${d}`, settings: snapshot(), key: d };
      myPresets.push(p);
    }
    writeJson(MY_PRESETS_KEY, myPresets);
    currentMine = p;
    redrawMine();
    showToast(`Saved to ${d}: ${p.name}`);
    return;
  }
  const p = myPresets.find((o) => o.key === d);
  if (p) playMine(p);
  else showToast(`Nothing on ${d} yet. Shift+${d} saves the current look there.`);
}

let toastTimer = 0;
// --- Sync: tap along to the kick ---------------------------------------------
// You tap when you hear each kick; the field detected that kick a bit earlier
// (a lot earlier through Bluetooth). The typical gap becomes the delay.
function calibrateSync() {
  if (audio.source === 'off') return showToast('Turn on a sound source first, then tap along');
  if (document.querySelector('.sync-cal')) return;
  const NEED = 12;
  const el = document.createElement('div');
  el.className = 'sync-cal';
  el.innerHTML = `<p class="sync-big">Tap on every kick</p><p class="sync-sub">Tap anywhere or press Space · <b>0</b> / ${NEED}</p><button type="button">Cancel</button>`;
  document.body.append(el);
  const count = el.querySelector('b')!;
  const taps: number[] = [];
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    el.remove();
  };
  const finish = () => {
    close();
    // Each tap against the latest kick before it (or just after: people tap a touch early).
    const gaps = taps.slice(2).map((tp) => {
      let best = Infinity;
      for (const k of audio.kickLog) {
        const g = tp - k;
        if (g >= -60 && g < 700 && g < best) best = g;
      }
      return best;
    }).filter(Number.isFinite).sort((a, b) => a - b);
    if (gaps.length < 5) return showToast('Couldn’t match your taps to kicks. Try a song with a clear kick drum.');
    const median = gaps[gaps.length >> 1];
    const ms = Math.max(0, Math.min(500, Math.round(median / 10) * 10));
    set('audioSync', ms as never);
    refresh();
    showToast(ms ? `Reactions now wait ${ms} ms for your speakers` : 'Already in sync, no delay needed');
  };
  const tap = (t: number) => {
    taps.push(t);
    count.textContent = String(taps.length);
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
    if (taps.length >= NEED) finish();
  };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.repeat) return;
    if (e.key === 'Escape') close();
    else if (e.key === ' ' || e.key === 'Enter') tap(e.timeStamp);
  };
  window.addEventListener('keydown', onKey, true);
  el.querySelector('button')!.addEventListener('click', close);
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    tap(e.timeStamp);
  });
}

function showToast(text: string, action?: [string, () => void]) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.querySelector('.stage')!.append(el);
  }
  el.textContent = text;
  el.classList.toggle('has-act', !!action);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action[0];
    b.addEventListener('click', () => {
      action[1]();
      el!.classList.remove('show');
    });
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), Math.max(action ? 5000 : 1600, text.length * 45));
}

// Reset is a clean slate: default settings and no locked cards, so the
// next Shuffle can roll every card.
function reset() {
  const had = locks.size;
  locks.clear();
  saveLocks();
  for (const f of lockSyncs) f();
  syncTabDots();
  apply({}, false);
  showToast(had ? 'Reset, locks cleared' : 'Reset');
}

// --- play mode ----------------------------------------------------------------------
// Settings you can play on the field: a zone at the bottom left and right, two-finger
// drag and pinch, and the mouse wheel. Moves are relative, so touching never
// makes a value jump.
function fillPlayable() {
  let sec = '';
  PLAYABLE.push(['', '— none —']);
  for (const c of CONTROLS) {
    if (c.kind === 'section') sec = c.label;
    // Not the knob pickers themselves.
    else if (c.kind === 'range' || ((c.kind === 'select' || c.kind === 'choice') && c.options.length > 1 && c.options !== PLAYABLE)) PLAYABLE.push([c.key, `${sec} · ${c.label}`]);
  }
}
fillPlayable();
const rangeOf = (key: string) => CONTROLS.find((c): c is Extract<Control, { kind: 'range' }> => c.kind === 'range' && c.key === key);
// A field knob works on a number: a slider's value, or a choice's place in
// its list (turning steps through the options).
type KnobSpec = { key: keyof Settings; label: string; min: number; max: number; step: number; get: () => number; set: (v: number) => boolean; text: (v: number) => string; options?: [string, string][] };
// Related settings: a choice that decides which of several other choices
// shows (Particles form → 3D shape / Geometric shape / Pattern…). Found by
// trying each option and seeing which choices appear, once, on first use.
type KnobFamily = { parent: string; kids: string[] };
let familyMap: Map<string, KnobFamily> | null = null;
function families() {
  if (familyMap) return familyMap;
  familyMap = new Map();
  const S = settings as unknown as Record<string, unknown>;
  const choices = CONTROLS.filter((c): c is Extract<Control, { kind: 'select' | 'choice' }> => (c.kind === 'select' || c.kind === 'choice') && c.options !== PLAYABLE);
  const shy = choices.filter((c) => c.show);
  for (const p of choices) {
    if (familyMap.has(p.key)) continue;
    const seen = new Map<string, number>();
    const was = S[p.key];
    try {
      for (const [o] of p.options) {
        S[p.key] = o;
        for (const c of shy) if (c.key !== p.key && c.show!()) seen.set(c.key, (seen.get(c.key) ?? 0) + 1);
      }
    } catch {
      continue;
    } finally {
      S[p.key] = was;
    }
    // Each one shows for exactly one option of the parent.
    const kids = [...seen].filter(([, n]) => n === 1).map(([k]) => k).filter((k) => !familyMap!.has(k));
    if (kids.length < 2) continue;
    const fam: KnobFamily = { parent: p.key, kids };
    for (const k of kids) familyMap.set(k, fam);
    familyMap.set(p.key, { parent: p.key, kids });
  }
  return familyMap;
}
/** The setting a knob turns now: one of a family turns whichever shows. */
function knobTarget(key: string) {
  const f = families().get(key);
  if (!f || f.parent === key) return key;
  return f.kids.find((k) => CONTROLS.find((c) => 'key' in c && c.key === k)?.show?.()) ?? key;
}
/** A knob for this setting is picked (any one of a family's shapes counts). */
function knobPicked(picks: string[], key: string) {
  const f = families().get(key);
  return f && f.parent !== key ? picks.some((k) => f.kids.includes(k)) : picks.includes(key);
}
function knobSpec(key: string): KnobSpec | null {
  key = knobTarget(key);
  // Several controls can share a key (each pattern names patForm its own way): use the one in play.
  const cs = CONTROLS.filter((x) => (x.kind === 'range' || x.kind === 'select' || x.kind === 'choice') && x.key === key) as Extract<Control, { kind: 'range' | 'select' | 'choice' }>[];
  const c = cs.find((x) => !x.show || x.show()) ?? cs[0];
  if (!c) return null;
  const S = settings as unknown as Record<string, unknown>;
  if (c.kind === 'range')
    return {
      key: c.key, label: c.label, min: c.min, max: c.max, step: c.step,
      get: () => settings[c.key] as number,
      set: (raw) => {
        const v = Number((Math.round(raw / c.step) * c.step).toFixed(6));
        if (S[c.key] === v) return false;
        S[c.key] = v;
        return true;
      },
      text: (v) => `${Math.round(((v - c.min) / (c.max - c.min)) * 100)}%`,
    };
  if (c.kind !== 'select' && c.kind !== 'choice') return null;
  const opts = c.options;
  return {
    key: c.key, label: c.label, min: 0, max: Math.max(1, opts.length - 1), step: 1, options: opts,
    get: () => Math.max(0, opts.findIndex(([k]) => k === S[c.key])),
    set: (raw) => {
      const v = opts[Math.max(0, Math.min(opts.length - 1, Math.round(raw)))][0];
      if (S[c.key] === v) return false;
      S[c.key] = v;
      return true;
    },
    text: (v) => opts[Math.max(0, Math.min(opts.length - 1, Math.round(v)))][1].replace(/ \(.*\)$/, ''),
  };
}
const stage = document.querySelector<HTMLElement>('.stage')!;
// Field knobs sit in a row along the bottom, left to right: A–E (each with a
// wheel combo) and any extra ones after them. Each has a touch zone (drag up
// or right to turn it up); its ring shows while you play it, then fades.
// Two-finger drag and pinch get a knob of their own in the middle.
const KNOB_KEYS: ['playLeft' | 'playWheel3' | 'playWheel4' | 'playRight' | 'playWheel5', number][] = [['playLeft', 0], ['playWheel3', 1], ['playWheel4', 2], ['playRight', 3], ['playWheel5', 4]];
/** Your knob set: A–E, then the extra ones (On-screen controls). */
function baseKnobKeys(): string[] {
  return [...KNOB_KEYS.map(([sk]) => settings[sk] as string), ...settings.knobsMore.split(',').filter(Boolean)];
}
/** Picks made in the overview; while there are any they replace your set. */
const knobPicks = () => settings.knobsPick.split(',').filter(Boolean);
/** Knobs for what a scene is about: the lead amount of each card it uses
 * (its lens, shape, flocking, emitters, forces, depth, flow), then its
 * look and two macros. Eight at most, one per card. */
const SCENE_KNOBS = 8;
function sceneKnobs(t: Settings): string[] {
  const S = t as unknown as Record<string, unknown>;
  const lensKey = LENS_KEYS.find((k) => !k.startsWith('audio') && k !== 'lensMusic' && (k === 'lensMirror' ? S[k] !== 'off' : k === 'lensTiles' ? (S[k] as number) >= 2 : (S[k] as number) > 0));
  const shapeSub: Record<string, string> = { geo: 'shapeGeo', solid: 'shapeSolid', pattern: 'shapePattern', icon: 'shapeIcon' };
  const cands: (string | false | undefined)[] = [
    lensKey,
    t.shape !== 'none' && 'shapeSize',
    shapeSub[t.shape],
    (t.flock > 0 || t.space > 0) && (t.flock > 0 ? 'flock' : 'space'),
    t.emitter !== 'none' && 'emitRate',
    t.lifespan > 0 && t.emitter === 'none' && 'lifespan',
    t.wind > 0 ? 'wind' : t.gravity !== 0 ? 'gravity' : t.wells ? 'wellForce' : false,
    t.depth > 0 && 'depth',
    t.flow > 0 && 'flow',
    t.render === 'glyphs' ? 'glyphScale' : t.render === 'links' ? 'linkDist' : t.render === 'ribbons' ? 'ribbonLen' : false,
    // Then what sets this look apart most from the plain defaults.
    ...(['trail', 'speed', 'size', 'count', 'jitter', 'friction', 'sizeVar', 'flowScale', 'radius'] as const)
      .map((k) => {
        const c = CONTROLS.find((x) => x.kind === 'range' && x.key === k) as Extract<Control, { kind: 'range' }> | undefined;
        return [k, c ? Math.abs((t[k] as number) - (DEFAULTS[k] as number)) / (c.max - c.min) : 0] as const;
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k),
    t.shape === 'pattern' && 'patForm',
    // A macro moves a whole group of settings at once.
    'mEnergy', 'palette', 'render', 'mDream',
  ];
  const out: string[] = [];
  for (const k of cands) if (k && !out.includes(k) && knobSpec(k) && out.length < SCENE_KNOBS) out.push(k);
  return out;
}
/** Every field knob's setting, in row order. */
/** A setting that does something in this scene (its control is showing). */
function knobLive(key: string) {
  const t = knobTarget(key);
  return CONTROLS.some((c) => 'key' in c && c.key === t && (!c.show || c.show()));
}
function fieldKnobKeys(): string[] {
  // Picks for settings this scene doesn't use sit out (they come back with it).
  const picks = knobPicks().filter(knobLive);
  if (picks.length) return picks;
  const scene = settings.knobsFollow ? settings.knobsScene.split(',').filter((k) => knobSpec(k)) : [];
  return scene.length ? scene : baseKnobKeys();
}
function clearKnobPicks() {
  settings.knobsPick = '';
  changed(new Set<keyof Settings>(['knobsPick']));
}
function isFieldKnob(key: string) {
  return !!key && knobPicked(knobPicks(), key);
}
/** Pick a setting as a field knob, or un-pick it. The first pick replaces
 * your knob set until the picks are cleared. */
function toggleFieldKnob(key: string) {
  const picks = knobPicks();
  const on = !knobPicked(picks, key);
  // Related settings come and go together (Particles form + its shape).
  const fam = families().get(key);
  const group = fam ? [fam.parent, ...fam.kids] : [key];
  const rest = picks.filter((k) => !group.includes(k));
  const both = fam ? [fam.parent, fam.parent === key ? fam.kids[0] : key] : [key];
  settings.knobsPick = (on ? [...rest, ...both] : rest).join(',');
  if (on) {
    settings.playOn = true;
    // The whole Controls page switched off would hide them: switch it on.
    if (bypass.has('knobs')) setBypass('knobs', false);
  }
  changed(new Set<keyof Settings>(['knobsPick', 'playOn']));
  return on;
}
const RING = 2 * Math.PI * 26;
type KnobEl = { el: HTMLElement; arc: SVGCircleElement; pct: HTMLElement; name: HTMLElement; timer: number };
const knobs = new Map<string, KnobEl>();
const makeKnob = (id: string) => {
  const el = document.createElement('div');
  el.className = `knob ${id}`;
  el.innerHTML = `<span></span><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="track" cx="32" cy="32" r="26"/><circle class="arc" cx="32" cy="32" r="26" stroke-dasharray="${RING.toFixed(2)}" transform="rotate(-90 32 32)"/></svg><b></b>`;
  const k: KnobEl = { el, arc: el.querySelector('.arc')!, pct: el.querySelector('b')!, name: el.querySelector('span')!, timer: 0 };
  knobs.set(id, k);
  return k;
};
const playRow = document.createElement('div');
playRow.className = 'play-row';
stage.append(playRow);
stage.append(makeKnob('centre').el);
// Draw a knob's ring, value and name (without showing it).
function playPaint(id: string, key: string) {
  const r = knobSpec(key);
  const k = knobs.get(id);
  if (!r || !k) return false;
  const v = playBase(key);
  const share = (v - r.min) / (r.max - r.min);
  k.arc.style.strokeDashoffset = (RING * (1 - share)).toFixed(2);
  k.pct.textContent = r.text(v);
  k.pct.classList.toggle('word', r.step === 1 && r.min === 0 && !rangeOf(key));
  k.name.textContent = r.label;
  return true;
}
function playShow(key: string) {
  const i = fieldKnobKeys().indexOf(key);
  const id = i >= 0 && playing() ? `k${i}` : 'centre';
  if (!playPaint(id, key)) return;
  const k = knobs.get(id)!;
  k.el.classList.add('show');
  clearTimeout(k.timer);
  k.timer = window.setTimeout(() => k.el.classList.remove('show'), 1400);
}
// Playing keeps its own unrounded value per setting, so tiny trackpad
// moves add up instead of being rounded away, and the heavy work (saving,
// redrawing the panel) runs at most once a frame.
const playRaw: Record<string, number> = {};
const playDirty = new Set<keyof Settings>();
let playFrame = 0;
function playFlush() {
  playFrame = 0;
  if (playDirty.size) {
    changed(new Set(playDirty));
    tlHold(playDirty);
  }
  playDirty.clear();
}
// Set a setting from play: the engine sees it at once, the rest next frame.
function playSet(key: string, raw: number) {
  const r = knobSpec(key);
  if (!r) return;
  raw = Math.max(r.min, Math.min(r.max, raw));
  playRaw[key] = raw;
  if (animRec) animRecTouch(r.key);
  if (r.set(raw)) {
    playDirty.add(r.key);
    playFrame ||= requestAnimationFrame(playFlush);
  }
  playShow(key);
  if (pill.classList.contains('awake')) pillPaint();
}
// The value play works from: its own if still in step with the setting.
function playBase(key: string) {
  const r = knobSpec(key);
  if (!r) return 0;
  const v = r.get();
  const raw = playRaw[key];
  return raw !== undefined && Math.abs(raw - v) <= r.step * (r.step === 1 ? 0.5 : 1) ? raw : v;
}
// Move a setting by a share of its range (0..1 of min→max). Choices move a
// little slower per pixel, so each option is easy to land on.
function playNudge(key: string, from: number, share: number) {
  const r = knobSpec(key);
  if (!r) return;
  const n = r.max - r.min;
  playSet(key, from + share * (rangeOf(key) ? n : Math.min(n, Math.max(3, n * 0.6))));
}
let rowSig = '';
function buildFieldKnobs() {
  const keys = fieldKnobKeys();
  const sig = keys.join(',');
  if (sig === rowSig) return;
  rowSig = sig;
  playRow.textContent = '';
  for (const id of [...knobs.keys()]) if (id !== 'centre') knobs.delete(id);
  keys.forEach((_, i) => {
    const id = `k${i}`;
    const k = makeKnob(id);
    const f = document.createElement('div');
    f.className = `fader ${id}`;
    f.append(k.el);
    const key = () => fieldKnobKeys()[i] ?? '';
    let start: { x: number; y: number; v: number; t: number; moved: boolean } | null = null;
    f.addEventListener('pointerdown', (e) => {
      if (!knobSpec(key())) return;
      f.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, v: playBase(key()), t: performance.now(), moved: false };
      playShow(key());
    });
    // Up or right turns it up, down or left turns it down: the knobs sit at the
    // bottom edge, so sideways gives the room that up/down lacks.
    f.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!start.moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      start.moved = true;
      playNudge(key(), start.v, (start.y - e.clientY + (e.clientX - start.x)) / Math.max(200, stage.clientHeight * 0.32));
    });
    const end = (e: PointerEvent) => {
      // A tap (no drag) on a choice opens its list.
      const tap = start && !start.moved && e.type === 'pointerup' && performance.now() - start.t < 450;
      start = null;
      const spec = knobSpec(key());
      if (tap && spec?.options) knobMenu(f, spec);
    };
    f.addEventListener('pointerup', end);
    f.addEventListener('pointercancel', end);
    playRow.append(f);
  });
}
// A choice knob's list: tap one to play it.
let knobMenuEl: HTMLElement | null = null;
function closeKnobMenu() {
  knobMenuEl?.remove();
  knobMenuEl = null;
}
function knobMenu(f: HTMLElement, spec: KnobSpec) {
  closeKnobMenu();
  const m = document.createElement('div');
  m.className = 'knob-menu';
  m.setAttribute('role', 'listbox');
  m.setAttribute('aria-label', spec.label);
  const head = document.createElement('b');
  head.textContent = spec.label;
  m.append(head);
  const cur = spec.get();
  spec.options!.forEach(([, text], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('role', 'option');
    if (i === Math.round(cur)) b.classList.add('on');
    b.addEventListener('click', () => {
      playSet(spec.key, i);
      closeKnobMenu();
    });
    m.append(b);
  });
  stage.append(m);
  knobMenuEl = m;
  // Beside the knob, kept on screen.
  const r = f.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const mw = m.offsetWidth;
  const mh = m.offsetHeight;
  const side = r.left - sr.left > sr.width / 2;
  let x = side ? r.left - sr.left - mw - 6 : r.right - sr.left + 6;
  if (r.width > 100 && !side) x = r.left - sr.left + r.width / 2 - mw / 2;
  let y = r.top - sr.top + r.height / 2 - mh / 2;
  if (r.width > 100) y = r.top - sr.top - mh + 30;
  m.style.left = `${Math.max(8, Math.min(sr.width - mw - 8, x))}px`;
  m.style.top = `${Math.max(8, Math.min(sr.height - mh - 8, y))}px`;
  m.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest' });
}
document.addEventListener('pointerdown', (e) => {
  if (knobMenuEl && !knobMenuEl.contains(e.target as Node)) closeKnobMenu();
}, true);
// Keep the knobs drawn with their current values, so hovering the row can
// reveal all of them at once.
function syncFieldKnobs() {
  buildFieldKnobs();
  const keys = fieldKnobKeys();
  let shown = 0;
  playRow.querySelectorAll<HTMLElement>('.fader').forEach((f, i) => {
    f.hidden = !playing() || !knobSpec(keys[i]);
    if (!f.hidden) shown++, playPaint(`k${i}`, keys[i]);
  });
  playRow.style.setProperty('--n', String(Math.max(1, shown)));
  playRow.classList.toggle('many', shown > 5);
}
// Opened without a scene's knobs yet: the ones for what's on screen.
if (!settings.knobsScene) settings.knobsScene = sceneKnobs(settings).join(',');
refreshers.push(syncFieldKnobs);
syncFieldKnobs();
// Phones: one bar along the bottom: Overview, Scenes, Menu, Shuffle and
// the knob pill. Tap the pill and it fills the bar: drag across
// it to turn the knob, swipe up or down for the next knob, tap a
// choice's ‹ › to step or its middle for the list; ✕ folds it back.
const mbar = document.createElement('div');
mbar.className = 'm-bar';
const MENU_ICON = svg('<path d="M4 7h16M4 12h16M4 17h16"/>');
const KNOB_ICON = svg('<circle cx="12" cy="12" r="8"/><path d="M12 12l3.5-3.5"/>');
mbar.innerHTML = `<button type="button" class="mb-btn mb-ov" aria-label="Deck" title="Deck">${ICONS.sliders}</button><button type="button" class="mb-btn mb-scenes" aria-label="Scenes" title="Scenes">${svg(TAB_ICONS.presets)}</button><button type="button" class="mb-btn mb-menu" aria-label="Studio" title="Studio">${MENU_ICON}</button><button type="button" class="mb-btn mb-shuffle" aria-label="Shuffle" title="Shuffle">${ICONS.shuffle}</button><div class="swipe-pill" role="slider" tabindex="0" aria-label="Knobs" title="Knobs"><span class="mb-kicon">${KNOB_ICON}</span><div class="sp-body"><i class="sp-prev" aria-hidden="true">${svg('<path d="M15 5l-7 7 7 7"/>')}${svg('<path d="M6 12h12"/>')}</i><span class="sp-name"></span><b class="sp-val"></b><i class="sp-next" aria-hidden="true">${svg('<path d="M9 5l7 7-7 7"/>')}${svg('<path d="M6 12h12M12 6v12"/>')}</i><i class="sp-bar"><u></u></i><em class="sp-dots"></em></div><button type="button" class="mb-btn mb-loop" aria-label="Record knob moves (hold for loop length and clearing)" title="Record knob moves · hold for more"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16.5 3.5v3.2h-3.2"/><circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none"/></svg><b class="lp-n">4</b></button><button type="button" class="mb-btn mb-close" aria-label="Done" title="Done">✕</button></div><div class="sp-chips" role="tablist" aria-label="Knobs"></div>`;
stage.append(mbar);
const pill = mbar.querySelector<HTMLElement>('.swipe-pill')!;
const chips = mbar.querySelector<HTMLElement>('.sp-chips')!;
// Phones: one bottom bar for Stage, Deck and Studio. The view switch on the
// left never moves; the tray on the right holds what the view you're in needs.
type UView = 'stage' | 'deck' | 'studio';
const ubar = document.createElement('div');
ubar.className = 'u-bar';
ubar.innerHTML = `<div class="u-seg" role="tablist" aria-label="Views"><span class="u-thumb"></span><button type="button" role="tab" data-v="stage" aria-label="Stage" title="Stage">${ICONS.eye}<span>Stage</span></button><button type="button" role="tab" data-v="deck" aria-label="Deck" title="Deck">${ICONS.sliders}<span>Deck</span></button><button type="button" role="tab" data-v="studio" aria-label="Studio" title="Studio (H)">${MENU_ICON}<span>Studio</span></button></div><div class="u-tray"></div>`;
document.body.append(ubar);
const uView = (): UView => (ovEl ? 'deck' : !panel.classList.contains('collapsed') ? 'studio' : 'stage');
function uGo(v: UView) {
  document.body.classList.remove('u-pages');
  if (v === 'stage') startWatching();
  else if (v === 'deck') {
    if (!panel.classList.contains('collapsed')) toggle.click();
    stopWatching();
  } else {
    closeOverview();
    if (panel.classList.contains('collapsed')) toggle.click();
  }
  uPaint(true);
}
function uCrossfade() {
  if (xf.on) {
    xfSetOn(false);
    openOverview();
  } else ovEl?.querySelector<HTMLButtonElement>('.ov-xfstart')?.click();
  uPaint(true);
}
const PAGES_ICON = svg('<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/>');
const FIND_ICON = svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>');
const U_TRAY: Record<UView, () => [string, string, () => void, string?][]> = {
  stage: () => [['Shuffle', ICONS.shuffle, () => shuffle(), 'primary'], uRec(), ['Knobs', KNOB_ICON, openKnobPill], ...(hasShape() ? [['Arrange the shape', svg('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'), () => toggleArrange(true)] as [string, string, () => void]] : [])],
  deck: () => [[xf.on ? 'One scene' : 'Crossfade', svg('<path d="M4 12h16"/><rect x="10" y="6.5" width="4" height="11" rx="1.2"/>'), uCrossfade, xf.on ? 'on' : ''], ['Shuffle', ICONS.shuffle, () => shuffle(), 'primary']],
  studio: () => [['Search', FIND_ICON, () => document.getElementById('sheet-find')!.click()], ['Pages', PAGES_ICON, () => {
    document.body.classList.toggle('u-pages');
    uPaint(true);
  }, document.body.classList.contains('u-pages') ? 'on' : '']],
};
// Desktop: icons for Shuffle and Pause, More for the rest of the actions.
const MORE_ICON = svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>');
const ARRANGE_ICON = svg('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>');
const uPause = (): [string, string, () => void, string?] => [paused ? 'Play (Space)' : 'Pause (Space)', paused ? ICONS.play : ICONS.pause, () => {
  togglePause();
  uPaint(true);
}, paused ? 'on' : ''];
const uMore = (): [string, string, () => void, string?] => ['More actions', MORE_ICON, () => {
  toggleDockMore();
  if (dockMoreEl && dockMoreEl.parentElement !== ubar) ubar.append(dockMoreEl);
}, 'more'];
// Record a clip straight from the Stage (V); red while it records.
const uRec = (): [string, string, () => void, string?] => [recorder.on ? 'Stop recording (V)' : 'Record a clip (V)', ICONS.record, () => {
  toggleRecord();
  uPaint(true);
}, recorder.on ? 'rec live' : 'rec'];
const U_TRAY_DESK: Record<UView, () => [string, string, () => void, string?][]> = {
  stage: () => [...(hasShape() ? [['Arrange the shape', ARRANGE_ICON, () => toggleArrange(true), ''] as [string, string, () => void, string]] : []), ['Shuffle (D)', ICONS.shuffle, () => shuffle(), 'primary'], uRec(), uPause(), uMore()],
  deck: () => [[xf.on ? 'One scene' : 'Crossfade', svg('<path d="M4 12h16"/><rect x="10" y="6.5" width="4" height="11" rx="1.2"/>'), uCrossfade, xf.on ? 'on label' : 'label'], ['Shuffle (D)', ICONS.shuffle, () => shuffle(), 'primary'], uPause(), uMore()],
  studio: () => [['Shuffle (D)', ICONS.shuffle, () => shuffle(), 'primary'], uPause(), uMore()],
};
let uSig = '';
function uPaint(force = false) {
  const v = uView();
  const desk = !sheetMode();
  if (desk) uPlace();
  const sig = `${v}|${xf.on}|${document.body.classList.contains("u-pages")}|${hasShape()}|${desk}|${paused}|${recorder.on}`;
  if (sig === uSig && !force) return;
  uSig = sig;
  ubar.classList.remove('stage', 'deck', 'studio');
  ubar.classList.add(v);
  const on = ubar.querySelector<HTMLElement>(`.u-seg button[data-v="${v}"]`)!;
  const thumb = ubar.querySelector<HTMLElement>('.u-thumb')!;
  thumb.style.width = `${on.offsetWidth}px`;
  thumb.style.transform = `translateX(${on.offsetLeft - 3}px)`;
  ubar.querySelectorAll<HTMLButtonElement>('.u-seg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === v);
    b.setAttribute('aria-selected', String(b.dataset.v === v));
  });
  if (v !== 'studio') document.body.classList.remove('u-pages');
  const tray = ubar.querySelector<HTMLElement>('.u-tray')!;
  const list = (desk ? U_TRAY_DESK : U_TRAY)[v]();
  // Rebuilt only when its buttons change, so a click never lands on a button
  // that was just swapped out.
  const key = list.map(([l, , , c]) => `${l}/${c ?? ''}`).join('|');
  if (tray.dataset.key === key) return;
  tray.dataset.key = key;
  tray.innerHTML = '';
  list.forEach(([label, ic, fn, cls], j) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label.replace(/ \(.*\)$/, ''));
    const named = desk ? cls?.includes('label') : j === 0;
    b.innerHTML = ic + (named ? `<span>${label.replace(/ \(.*\)$/, '')}</span>` : '');
    if (cls) b.classList.add(...cls.split(' '));
    if (cls?.includes('more')) dockMoreBtn = b;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    tray.append(b);
  });
  if (desk) uPlace();
}
// Desktop: the bar floats over the field, clear of the Studio or
// the Deck on the right. On the Stage it rests out of sight until the mouse moves.
// One spot in every view; moves at once (no slide) only when it has to.
let stageBarW = 0;
function uPlace() {
  let right = innerWidth;
  if (!panel.classList.contains('collapsed')) right = Math.min(right, panel.getBoundingClientRect().left);
  if (ovEl) right = Math.min(right, ovEl.getBoundingClientRect().left);
  // Placed where it sits on the Stage (centred on the screen) in every view,
  // so the switch never moves; it only shifts left if the Studio or Deck would cover it.
  if (ubar.classList.contains('stage')) stageBarW = ubar.offsetWidth;
  let left = innerWidth / 2 - (stageBarW || ubar.offsetWidth) / 2;
  left = Math.min(left, right - ubar.offsetWidth - 12);
  ubar.style.left = `${Math.max(12, Math.round(left))}px`;
}
{
  let rest = 0;
  const wake = () => {
    ubar.classList.remove('rest');
    clearTimeout(rest);
    rest = window.setTimeout(() => {
      if (!ubar.matches(':hover') && !dockMoreEl?.classList.contains('open')) ubar.classList.add('rest');
    }, 2600);
  };
  window.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && wake(), { passive: true });
  ubar.addEventListener('pointerleave', wake);
  addEventListener('resize', () => uPaint(true));
}
ubar.querySelector('.u-seg')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
  if (b) uGo(b.dataset.v as UView);
});
// Scene sheet: on the Stage, the bar's first button is the scene's name.
// Tap it for this sheet (step ‹ ›, families, the family's scenes, search);
// picking plays at once and the sheet stays open to try a few. A sideways
// swipe on the name steps through the family without opening anything.
let sceneSheetEl: HTMLElement | null = null;
function recentScenes(): string[] {
  try {
    return JSON.parse(localStorage.getItem('pf-recent-scenes') ?? '[]') as string[];
  } catch {
    return [];
  }
}
function noteRecent(name: string) {
  try {
    localStorage.setItem('pf-recent-scenes', JSON.stringify([name, ...recentScenes().filter((n) => n !== name)].slice(0, 8)));
  } catch {
    /* fine */
  }
}
function sheetStep(d: number) {
  const r = sceneAfter(currentMine ? { name: currentMine.name, mine: true } : lastSceneName ? { name: lastSceneName } : null, lastSceneName || currentMine ? d : 0);
  if (r.mine) {
    const m = myPresets.find((p) => p.name === r.name);
    if (m) playMine(m);
  } else {
    const p = PRESETS.find(([n]) => n === r.name);
    if (p) playPreset(p[0], p[1]);
  }
  showToast(r.name);
}
function closeSceneSheet() {
  sceneSheetEl?.remove();
  sceneSheetEl = null;
  ubar.classList.remove('sheet-open');
}
// Desktop: drag the sheet by its grip or its title to anywhere on the screen
// (remembered); double-click the grip to put it back over the bar.
const SHEET_POS_KEY = 'pf-scene-sheet-pos';
function sheetDrag(el: HTMLElement) {
  if (matchMedia('(max-width: 720px)').matches) return;
  const grip = document.createElement('div');
  grip.className = 'ss-grip';
  grip.title = 'Drag to move · double-click to put it back';
  el.prepend(grip);
  const place = (x: number, y: number) => {
    const r = el.getBoundingClientRect();
    x = Math.max(8, Math.min(innerWidth - r.width - 8, x));
    y = Math.max(8, Math.min(innerHeight - r.height - 8, y));
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, bottom: 'auto', transform: 'none' });
    el.classList.add('moved');
    return { x, y };
  };
  try {
    const p = JSON.parse(localStorage.getItem(SHEET_POS_KEY) ?? 'null');
    if (p) requestAnimationFrame(() => place(p.x, p.y));
  } catch {}
  let st: { dx: number; dy: number } | null = null;
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const r = el.getBoundingClientRect();
    st = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    if (!st) return;
    const p = place(e.clientX - st.dx, e.clientY - st.dy);
    try { localStorage.setItem(SHEET_POS_KEY, JSON.stringify(p)); } catch {}
  };
  const up = () => {
    st = null;
    el.classList.remove('dragging');
  };
  for (const h of [grip, el.querySelector<HTMLElement>('.ss-now')!]) {
    h.addEventListener('pointerdown', down);
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  }
  grip.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    try { localStorage.removeItem(SHEET_POS_KEY); } catch {}
    Object.assign(el.style, { left: '', top: '', bottom: '', transform: '' });
    el.classList.remove('moved');
  });
}
function toggleSceneSheet() {
  if (sceneSheetEl) return closeSceneSheet();
  const el = document.createElement('div');
  el.className = 'scene-sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Scenes');
  el.innerHTML = `<div class="ss-head"><button type="button" class="ss-step" aria-label="Previous scene">‹</button><div class="ss-now"><small></small><b></b></div><button type="button" class="ss-step" aria-label="Next scene">›</button><button type="button" class="ss-fold" aria-label="Show only this row" aria-expanded="true"><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 4.5 L6 7.5 L9 4.5"/></svg></button><button type="button" class="ss-close" aria-label="Close">✕</button></div><label class="ss-find">${svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>')}<input type="search" placeholder="Find a scene" aria-label="Find a scene"></label><div class="ss-recent"></div><div class="families"></div><div class="ss-list"></div>`;
  const [prevB, nextB] = el.querySelectorAll<HTMLButtonElement>('.ss-step');
  prevB.addEventListener('click', () => sheetStep(-1));
  nextB.addEventListener('click', () => sheetStep(1));
  el.querySelector('.ss-close')!.addEventListener('click', closeSceneSheet);
  // Fold to just the ‹ name › row (remembered), for stepping without the list.
  const foldB = el.querySelector<HTMLButtonElement>('.ss-fold')!;
  const fold = (on: boolean) => {
    el.classList.toggle('mini', on);
    foldB.setAttribute('aria-expanded', String(!on));
    foldB.setAttribute('aria-label', on ? 'Show all scenes' : 'Show only this row');
    try { localStorage.setItem('pf-scene-sheet-mini', on ? '1' : ''); } catch {}
  };
  foldB.addEventListener('click', () => fold(!el.classList.contains('mini')));
  try { if (localStorage.getItem('pf-scene-sheet-mini')) fold(true); } catch {}
  sheetDrag(el);
  const input = el.querySelector('input')!;
  const recentEl = el.querySelector<HTMLElement>('.ss-recent')!;
  const chipsEl = el.querySelector<HTMLElement>('.families')!;
  const list = el.querySelector<HTMLElement>('.ss-list')!;
  let fam: string = currentMine ? 'mine' : (lastSceneName && FAMILY_OF[lastSceneName]) || presetFamily;
  const fams: [string, string][] = [...(myPresets.length ? [['mine', 'My scenes'] as [string, string]] : []), ...FAMILIES];
  for (const [f, label] of fams) {
    const c = document.createElement('button');
    c.type = 'button';
    c.dataset.fam = f;
    c.textContent = label;
    c.addEventListener('click', () => {
      fam = f;
      input.value = '';
      draw();
    });
    chipsEl.append(c);
  }
  const play = (name: string, mine: boolean) => {
    if (mine) {
      const m = myPresets.find((p) => p.name === name);
      if (m) playMine(m);
    } else {
      const p = PRESETS.find(([n]) => n === name);
      if (p) playPreset(p[0], p[1]);
    }
    draw();
  };
  const item = (into: HTMLElement, name: string, mine: boolean) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.classList.toggle('on', mine ? currentMine?.name === name : !currentMine && lastSceneName === name);
    b.addEventListener('click', () => play(name, mine));
    into.append(b);
  };
  let sig = '';
  const draw = () => {
    sig = `${lastSceneName}|${currentMine?.name ?? ''}|${fam}|${input.value}`;
    el.querySelector('.ss-now b')!.textContent = currentMine?.name || lastSceneName || 'Your mix';
    el.querySelector('.ss-now small')!.textContent = currentMine ? 'My scenes' : lastSceneName ? familyLabel(FAMILY_OF[lastSceneName] ?? 'stories') : 'Scene';
    const q = input.value.trim().toLowerCase();
    for (const c of chipsEl.children) c.classList.toggle('on', !q && (c as HTMLElement).dataset.fam === fam);
    recentEl.innerHTML = '';
    const rec = recentScenes().filter((n) => n !== (currentMine?.name ?? lastSceneName) && (PRESETS.some(([p]) => p === n) || myPresets.some((m) => m.name === n))).slice(0, 4);
    recentEl.hidden = !!q || !rec.length;
    if (rec.length) {
      const h = document.createElement('span');
      h.textContent = 'Recent';
      recentEl.append(h);
      for (const n of rec) item(recentEl, n, !PRESETS.some(([p]) => p === n));
    }
    list.innerHTML = '';
    if (q) {
      for (const m of myPresets.filter((m) => m.name.toLowerCase().includes(q))) item(list, m.name, true);
      for (const [n] of PRESETS.filter(([n]) => n.toLowerCase().includes(q)).sort(([a], [b]) => a.localeCompare(b))) item(list, n, false);
      if ('blank'.includes(q)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Blank';
        b.addEventListener('click', () => {
          playPreset('Blank', BLANK_SCENE);
          draw();
        });
        list.append(b);
      }
      if (!list.childElementCount) list.innerHTML = '<p class="ss-none">No scene by that name.</p>';
      return;
    }
    // Blank, a clean start, leads every list.
    const blankB = document.createElement('button');
    blankB.type = 'button';
    blankB.className = 'ss-blank';
    blankB.textContent = 'Blank';
    blankB.title = 'A clean, minimal start';
    blankB.classList.toggle('on', !currentMine && lastSceneName === 'Blank');
    blankB.addEventListener('click', () => {
      playPreset('Blank', BLANK_SCENE);
      draw();
    });
    list.append(blankB);
    if (fam === 'mine') {
      for (const m of myPresets) item(list, m.name, true);
      return;
    }
    for (const [n] of PRESETS.filter(([n]) => fam === 'all' || FAMILY_OF[n] === fam).sort(([a], [b]) => a.localeCompare(b))) item(list, n, false);
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSceneSheet();
    if (e.key === 'Enter') list.querySelector<HTMLButtonElement>('button')?.click();
  });
  draw();
  // Follows scene changes made elsewhere (swipes, keys, shuffle).
  const timer = window.setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    if (sig !== `${lastSceneName}|${currentMine?.name ?? ''}|${fam}|${input.value}`) draw();
  }, 250);
  document.body.append(el);
  sceneSheetEl = el;
  ubar.classList.add('sheet-open');
  list.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest' });
}
// Tapping the field, or leaving the Stage, closes it.
document.addEventListener('pointerdown', (e) => {
  if (!sceneSheetEl) return;
  const t = e.target as HTMLElement;
  if (sceneSheetEl.contains(t) || ubar.contains(t) || t.closest('.toast')) return;
  closeSceneSheet();
}, true);
addEventListener('keydown', (e) => e.key === 'Escape' && sceneSheetEl && closeSceneSheet());
// The name on the Stage button, kept current.
function stageName() {
  const b = ubar.querySelector<HTMLElement>('.u-seg button[data-v="stage"]');
  if (!b) return;
  const onStage = uView() === 'stage';
  const name = onStage ? currentMine?.name || lastSceneName || 'Your mix' : 'Stage';
  const span = b.querySelector('span')!;
  if (span.textContent !== name) {
    span.textContent = name;
    b.classList.toggle('named', onStage);
    b.title = onStage ? `${name}: tap for scenes, swipe for the next one` : 'Stage';
    b.setAttribute('aria-label', onStage ? `Scene ${name}, open scenes` : 'Stage');
    uPaint(true);
  }
  if (!onStage && sceneSheetEl) closeSceneSheet();
}
setInterval(stageName, 300);
{
  const b = ubar.querySelector<HTMLElement>('.u-seg button[data-v="stage"]')!;
  let x0 = 0;
  let swiped = false;
  b.addEventListener('pointerdown', (e) => {
    x0 = e.clientX;
    swiped = false;
  });
  b.addEventListener('pointermove', (e) => {
    if (!e.buttons && e.pointerType === 'mouse') return;
    if (!swiped && uView() === 'stage' && Math.abs(e.clientX - x0) > 36) {
      swiped = true;
      sheetStep(e.clientX > x0 ? 1 : -1);
    }
  });
  b.addEventListener('click', (e) => {
    if (swiped) {
      e.stopPropagation();
      swiped = false;
      return;
    }
    if (uView() === 'stage') {
      e.stopPropagation();
      toggleSceneSheet();
    }
  }, true);
}

// Arrange: move, turn and resize the shape by hand on the field. One finger
// (or the mouse) moves it; two fingers twist to turn and pinch to resize; on
// a 3D shape, Turn 3D makes one finger orbit it instead. The wheel resizes
// (Shift + wheel turns). Double-tap centres it. Done (or Esc) leaves.
let arrangeEl: HTMLElement | null = null;
const LITE_KEY = 'pf-arrange-lite';
const LITE: Partial<Settings> = { trail: 0, glow: false, lensMirror: 'off', lensTiles: 0, lensZoom: 0, lensSplit: 0, lensGlitch: 0, lensDots: 0, lensTwirl: 0, lensWave: 0, lensRipple: 0, lensFan: 0, lensShatter: 0, lensSlices: 0, lensEcho: 0, lensGlow: 0, lensCrt: 0, audioTunnel: 0, audioKaleido: 0 };
const HEAVY_STYLES = new Set(['ribbons', 'threads', 'lightning', 'halftone', 'bigpixels', 'mixed', 'ink', 'flare', 'neon', 'bokeh', 'bubbles', 'glow', 'embers', 'hair', 'links', 'comets']);
let liteScene = '';
// Outline: while arranging, skip the simulation and draw only the shape's
// spots (a light dotted outline), so dragging stays snappy on phones.
let outlineOnly = false;
function drawOutline() {
  if (!lensCanvas.hidden) {
    lensCanvas.hidden = true;
    canvas.style.opacity = '';
  }
  const [r, g, b] = bgNow();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  ctx.fillRect(0, 0, w, h);
  placeFrame();
  const m = Math.min(n, hx.length);
  const step = Math.max(1, Math.floor(m / 2500));
  const light = r * 0.3 + g * 0.59 + b * 0.11 > 140;
  ctx.fillStyle = light ? 'rgb(30 30 40 / 0.75)' : 'rgb(200 206 255 / 0.8)';
  const sz = 1.6;
  for (let i = 0; i < m; i += step) {
    if (free[i]) continue;
    let x = hx[i];
    let y = hy[i];
    if (place.on) [x, y] = placed(x, y);
    ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  }
}
function setLite(on: boolean) {
  const S = settings as unknown as Record<string, unknown>;
  if (on && !liteHold) {
    const light: Record<string, unknown> = { ...LITE };
    if (HEAVY_STYLES.has(settings.render)) light.render = 'dots';
    if (settings.count > 2000) light.count = 2000;
    liteHold = {};
    for (const [k, v] of Object.entries(light)) {
      if (S[k] === v) continue;
      liteHold[k] = S[k];
      S[k] = v;
    }
    liteScene = lastSceneName;
    changed(new Set(Object.keys(liteHold) as (keyof Settings)[]));
  } else if (!on && liteHold) {
    const hold = liteHold;
    liteHold = null;
    // Put back only what nothing else changed meanwhile (same scene, still the light value).
    const light: Record<string, unknown> = { ...LITE, render: 'dots', count: 2000 };
    const back = Object.keys(hold).filter((k) => lastSceneName === liteScene && S[k] === light[k]);
    for (const k of back) S[k] = hold[k];
    changed(new Set(back as (keyof Settings)[]));
  }
}
const ARRANGE_KEYS = ['shapeX', 'shapeY', 'shapeAngle', 'shapeSize', 'shapeTilt', 'shapeFacing'];
function toggleArrange(on = !arranging) {
  if (on === arranging) return;
  arranging = on;
  document.body.classList.toggle('arranging', on);
  if (!on) {
    setLite(false);
    outlineOnly = false;
    arrangeEl?.remove();
    arrangeEl = null;
    refresh();
    return;
  }
  if (!hasShape()) {
    settings.shape = 'geo';
    changed(new Set<keyof Settings>(['shape']));
  }
  closeOverview();
  if (sheetMode() && !panel.classList.contains('collapsed')) toggle.click();
  const el = document.createElement('div');
  el.className = 'arrange';
  el.innerHTML = `<div class="ar-bar"><span class="ar-hint"></span><span class="ar-modes" role="group" aria-label="Drag does"><button type="button" data-m="move" class="on" aria-label="Move"><svg class="ar-ic" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5v15M2.5 10h15M10 2.5 7.8 4.7M10 2.5l2.2 2.2M10 17.5l-2.2-2.2M10 17.5l2.2-2.2M2.5 10l2.2-2.2M2.5 10l2.2 2.2M17.5 10l-2.2-2.2M17.5 10l-2.2 2.2"/></svg><span class="ar-t">Move</span></button><button type="button" data-m="orbit" aria-label="Turn 3D"><svg class="ar-ic" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="10" cy="10" rx="7.5" ry="3.2"/><path d="M14.6 4.6 17 6.9l-2.6 1"/></svg><span class="ar-t">Turn 3D</span></button></span><button type="button" class="ar-centre" aria-label="Centre"><svg class="ar-ic" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="5.5"/><path d="M10 1.8v3.4M10 14.8v3.4M1.8 10h3.4M14.8 10h3.4"/><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none"/></svg><span class="ar-t">Centre</span></button><button type="button" class="ar-lite" aria-pressed="false" aria-label="Shape only" title="Hide trails, lenses and glow while you arrange, so dragging stays smooth"><svg class="ar-ic" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 17 10 10 17 3 10Z"/><path class="ar-fillic" d="M10 6.5 13.5 10 10 13.5 6.5 10Z" fill="currentColor" stroke="none"/></svg><span class="ar-t">Shape only</span></button><span class="ar-rec" role="group" aria-label="Record a move"><button type="button" class="ar-len" title="Loop length">4 bars</button><button type="button" class="ar-recb" aria-label="Record a move"><i></i><span class="ar-t"></span><b class="ar-s"></b></button><button type="button" class="ar-clear" aria-label="Clear moves" title="Stop the recorded moves"><svg class="ar-ic" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg><span class="ar-t">Clear moves</span></button></span><button type="button" class="ar-done" aria-label="Done"><svg class="ar-ic" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5 8.3 14 15.5 6"/></svg><span class="ar-t">Done</span></button></div>`;
  document.body.append(el);
  arrangeEl = el;
  let mode: 'move' | 'orbit' = 'move';
  const hint = el.querySelector<HTMLElement>('.ar-hint')!;
  const paint = () => {
    const solid = settings.shape === 'solid';
    el.querySelector<HTMLElement>('.ar-modes')!.hidden = !solid;
    if (!solid) mode = 'move';
    el.querySelectorAll<HTMLButtonElement>('.ar-modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    hint.textContent = mode === 'orbit' ? 'Drag to turn it in 3D' : matchMedia('(pointer: coarse)').matches ? 'Drag to move · twist to turn · pinch to resize' : 'Drag to move · wheel resizes · Shift + wheel turns';
  };
  paint();
  el.querySelector('.ar-modes')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-m]');
    if (b) { mode = b.dataset.m as 'move' | 'orbit'; paint(); }
  });
  el.querySelector('.ar-centre')!.addEventListener('click', resetPlacement);
  el.querySelector('.ar-done')!.addEventListener('click', () => toggleArrange(false));
  const liteB = el.querySelector<HTMLButtonElement>('.ar-lite')!;
  // Three steps: everything → Shape only (heavy effects off) → Outline (just the shape's spots).
  const LITE_LBL = ['Shape only', 'Shape only', 'Outline'];
  const litePaint = () => {
    const lvl = outlineOnly ? 2 : liteHold ? 1 : 0;
    liteB.classList.toggle('on', lvl > 0);
    liteB.classList.toggle('outline', lvl === 2);
    liteB.setAttribute('aria-pressed', String(lvl > 0));
    liteB.setAttribute('aria-label', lvl === 2 ? 'Outline only' : 'Shape only');
    liteB.title = lvl === 0 ? 'Hide trails, lenses and glow while you arrange, so dragging stays smooth' : lvl === 1 ? 'Tap again for the outline only (snappiest)' : 'Tap to show everything again';
    liteB.querySelector('.ar-t')!.textContent = LITE_LBL[lvl];
  };
  const setLevel = (lvl: number) => {
    setLite(lvl > 0);
    outlineOnly = lvl === 2;
    try { localStorage.setItem(LITE_KEY, lvl ? String(lvl) : ''); } catch {}
    litePaint();
  };
  liteB.addEventListener('click', () => setLevel(((outlineOnly ? 2 : liteHold ? 1 : 0) + 1) % 3));
  try { const v = localStorage.getItem(LITE_KEY); if (v) setLevel(v === '2' ? 2 : 1); } catch {}
  litePaint();
  // Record: move the shape by hand over a loop (it starts on the next bar);
  // what you moved becomes keyframes and plays back in time.
  const lenB = el.querySelector<HTMLButtonElement>('.ar-len')!;
  const recB = el.querySelector<HTMLButtonElement>('.ar-recb')!;
  const clearB = el.querySelector<HTMLButtonElement>('.ar-clear')!;
  let bars = 4;
  const recPaint = () => {
    if (!el.isConnected) return clearInterval(recTimer);
    const r = animRec && animRec.keys === ARRANGE_KEYS ? animRec : null;
    lenB.textContent = cycleLabel(bars);
    lenB.disabled = !!r;
    recB.classList.toggle('live', !!r);
    const lbl = recB.querySelector<HTMLElement>('.ar-t')!;
    const short = recB.querySelector<HTMLElement>('.ar-s')!;
    const n = r ? Math.min(bars, Math.floor((animBeat - r.from) / 4) + 1) : 0;
    const wait = r ? Math.max(1, Math.ceil(r.from - animBeat)) : 0;
    if (!r) { lbl.textContent = 'Record'; short.textContent = ''; }
    else if (animBeat < r.from) { lbl.textContent = `Starts in ${wait}…`; short.textContent = `${wait}…`; }
    else { lbl.textContent = `Recording ${n} / ${bars}`; short.textContent = `${n}/${bars}`; }
    recB.setAttribute('aria-label', r ? lbl.textContent : 'Record a move');
    recB.classList.toggle('waiting', !!r && animBeat < r.from);
    el.classList.toggle('recording', !!r);
    if (r) hint.textContent = animBeat < r.from ? 'Get ready: it records from the next bar' : 'Move it now, the loop is recording';
    else if (hint.dataset.rec) paint();
    hint.dataset.rec = r ? '1' : '';
    const moving = ARRANGE_KEYS.some((k) => animMap()[k]);
    clearB.hidden = !moving || !!r;
  };
  const recTimer = window.setInterval(recPaint, 100);
  lenB.addEventListener('click', () => {
    const L = [1, 2, 4, 8, 16];
    bars = L[(L.indexOf(bars) + 1) % L.length];
    recPaint();
  });
  recB.addEventListener('click', () => {
    if (animRec && animRec.keys === ARRANGE_KEYS) {
      animRec = null;
      showToast('Recording stopped');
    } else
      animRecordMany(ARRANGE_KEYS, bars, (made) => showToast(made ? `Recorded ${made} move${made > 1 ? 's' : ''} · ${cycleLabel(bars)} loop` : 'Nothing moved, nothing recorded'));
    recPaint();
  });
  clearB.addEventListener('click', () => {
    const m = { ...animMap() };
    for (const k of ARRANGE_KEYS) delete m[k];
    set('anim', formatAnim(m) as never);
    showToast('Recorded moves cleared');
    recPaint();
  });
  recPaint();
  // Changes go out once a frame (a new size rebuilds the shape).
  const pend = new Set<keyof Settings>();
  let raf = 0;
  const put = (k: keyof Settings, v: number) => {
    animRecTouch(k);
    (settings as unknown as Record<string, number>)[k] = v;
    pend.add(k);
    raf ||= requestAnimationFrame(() => {
      raf = 0;
      changed(new Set(pend));
      pend.clear();
    });
  };
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const snapAngle = (a: number) => {
    a = ((((a + 180) % 360) + 360) % 360) - 180;
    const near = Math.round(a / 15) * 15;
    return Math.round(Math.abs(a - near) < 3 ? near : a);
  };
  const pts = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number; ang: number; dist: number; sx: number; sy: number; a: number; size: number; tilt: number; face: number } | null = null;
  const geo = () => {
    const [p1, p2] = [...pts.values()];
    if (!p2) return { x: p1.x, y: p1.y, ang: 0, dist: 1 };
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, ang: Math.atan2(p2.y - p1.y, p2.x - p1.x), dist: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1 };
  };
  const begin = () => {
    const g = geo();
    const S = settings;
    start = { ...g, sx: S.shapeX, sy: S.shapeY, a: S.shapeAngle, size: S.shapeSize, tilt: S.shapeTilt, face: S.shapeFacing };
  };
  let lastTap = 0;
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.ar-bar')) return;
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    begin();
    if (pts.size === 1) {
      const now = performance.now();
      if (now - lastTap < 300) resetPlacement();
      lastTap = now;
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = geo();
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (pts.size === 1 && mode === 'orbit') {
      put('shapeFacing', Math.round(clamp(start.face + (g.x - start.x) * 0.5, -180, 180)));
      put('shapeTilt', Math.round(clamp(start.tilt - (g.y - start.y) * 0.3, -60, 60)));
      return;
    }
    put('shapeX', +clamp(start.sx + (g.x - start.x) / W, -0.5, 0.5).toFixed(3));
    put('shapeY', +clamp(start.sy + (g.y - start.y) / H, -0.5, 0.5).toFixed(3));
    if (pts.size >= 2) {
      put('shapeAngle', snapAngle(start.a + ((g.ang - start.ang) * 180) / Math.PI));
      put('shapeSize', +clamp(start.size * (g.dist / start.dist), 0.2, 1).toFixed(2));
    }
  });
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size) begin();
    else start = null;
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const S = settings;
    if (e.shiftKey) put('shapeAngle', snapAngle(S.shapeAngle + Math.sign(e.deltaY || e.deltaX) * 5));
    else put('shapeSize', +clamp(S.shapeSize * Math.exp(-e.deltaY * 0.0015), 0.2, 1).toFixed(2));
  }, { passive: false });
  refresh();
}
addEventListener('keydown', (e) => {
  if (arranging && e.key === 'Escape') toggleArrange(false);
});
// (After the module has set everything up: the panel comes later in the file.)
setTimeout(() => {
  uPaint(true);
  setInterval(() => uPaint(), 250);
});
mbar.querySelector('.mb-ov')!.addEventListener('click', () => {
  stopWatching();
});
mbar.querySelector('.mb-menu')!.addEventListener('click', () => {
  document.body.classList.remove('watching');
  if (panel.classList.contains('collapsed')) toggle.click();
});
mbar.querySelector('.mb-shuffle')!.addEventListener('click', () => shuffle());
mbar.querySelector('.mb-scenes')!.addEventListener('click', () => {
  if (panel.classList.contains('collapsed')) toggle.click();
  if (currentTab !== 'presets') showTab('presets');
  controls.scrollTop = 0;
});
// The bar shows only when you tap near the bottom edge (playing with the
// particles elsewhere leaves the field clean), and hides again when left be.
let mbarTimer = 0;
function showBar(ms = 3500) {
  mbar.classList.add('shown');
  ubar.classList.add('shown');
  clearTimeout(mbarTimer);
  mbarTimer = window.setTimeout(() => {
    // The scene sheet sits on the bar: it stays while the sheet is open.
    if (sceneSheetEl) return showBar(ms);
    mbar.classList.remove('shown');
    ubar.classList.remove('shown');
  }, ms);
}
document.addEventListener('pointerdown', (e) => {
  if (!sheetMode()) return;
  if (mbar.contains(e.target as Node) || ubar.contains(e.target as Node) || e.clientY > window.innerHeight - 110) showBar();
}, true);
// On arrival, once, so you know where it lives.
showBar(4500);
let pillIdx = 0;
let pillTimer = 0;
const pillKeys = () => fieldKnobKeys().filter((k) => knobSpec(k));
const pillOpen = () => mbar.classList.contains('knobbing');
function openKnobPill() {
  pillPaint();
  if (pill.classList.contains('empty')) {
    if (knobPicks().length || baseKnobKeys().some((k) => knobSpec(k))) {
      settings.playOn = true;
      if (bypass.has('knobs')) setBypass('knobs', false);
      changed(new Set<keyof Settings>(['playOn']));
      setPillOpen(true);
    } else {
      openOverview();
      ovEl?.querySelector<HTMLElement>('.ov-pickknobs')?.click();
    }
    return;
  }
  setPillOpen(true);
}
function setPillOpen(on: boolean) {
  mbar.classList.toggle('knobbing', on);
  closeKnobMenu();
  pillPaint();
}
function pillPaint(wake = false) {
  const keys = pillKeys();
  const live = playing() && keys.length > 0;
  pill.classList.toggle('empty', !live);
  if (!live) {
    if (pillOpen()) mbar.classList.remove('knobbing');
    pill.querySelector('.sp-name')!.textContent = 'Knobs';
    pill.querySelector('.sp-val')!.textContent = '';
    return;
  }
  // A new set of knobs (scene change, shuffle) starts from the first one.
  if (chips.dataset.sig !== undefined && chips.dataset.sig !== keys.join()) pillIdx = 0;
  pillIdx = Math.min(pillIdx, keys.length - 1);
  const key = keys[pillIdx];
  const r = knobSpec(key)!;
  const v = playBase(key);
  pill.classList.toggle('choice', !!r.options);
  pill.querySelector('.sp-name')!.textContent = r.label;
  pill.querySelector('.sp-val')!.textContent = r.text(v);
  pill.querySelector<HTMLElement>('.sp-bar u')!.style.width = `${((v - r.min) / (r.max - r.min)) * 100}%`;
  // The knobs' names as a row of tabs above the pill: tap one to play it.
  const chipSig = keys.join();
  if (chips.dataset.sig !== chipSig) {
    chips.dataset.sig = chipSig;
    chips.innerHTML = '';
    keys.forEach((k, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.textContent = (knobSpec(k)?.label ?? k).replace(/ \(.*\)$/, '');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        pillIdx = i;
        navigator.vibrate?.(6);
        pillPaint(true);
      });
      chips.append(b);
    });
  }
  const amap = animMap();
  [...chips.children].forEach((b, i) => {
    const sk = knobSpec(keys[i])?.key;
    b.classList.toggle('moving', !!sk && !!amap[sk]);
    b.classList.toggle('on', i === pillIdx);
    b.setAttribute('aria-selected', String(i === pillIdx));
  });
  if (chips.dataset.at !== String(pillIdx) && pillOpen()) {
    chips.dataset.at = String(pillIdx);
    (chips.children[pillIdx] as HTMLElement | undefined)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
  const dots = pill.querySelector<HTMLElement>('.sp-dots')!;
  // Which knob of how many: short segments, the same place for every kind.
  dots.innerHTML = keys.length > 1 ? keys.map((_, i) => `<i${i === pillIdx ? ' class="on"' : ''}></i>`).join('') : '';
  pill.classList.toggle('one', keys.length < 2);
  if (wake) {
    pill.classList.add('awake');
    clearTimeout(pillTimer);
    pillTimer = window.setTimeout(() => pill.classList.remove('awake'), 2500);
  }
}
refreshers.push(() => pillPaint());
function pillStep(by: number) {
  const n = pillKeys().length;
  if (n < 2) return;
  pillIdx = (pillIdx + by + n) % n;
  navigator.vibrate?.(6);
  pillPaint(true);
}
mbar.querySelector('.mb-close')!.addEventListener('click', (e) => {
  e.stopPropagation();
  setPillOpen(false);
});
{
  const body = pill.querySelector<HTMLElement>('.sp-body')!;
  let st: { x: number; y: number; v: number; t: number; mode: '' | 'turn' | 'switch' } | null = null;
  pill.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    st = { x: e.clientX, y: e.clientY, v: 0, t: performance.now(), mode: '' };
    if (!pillOpen()) return;
    const key = pillKeys()[pillIdx];
    if (!key) return (st = null);
    pill.setPointerCapture(e.pointerId);
    st.v = playBase(key);
  });
  pill.addEventListener('pointermove', (e) => {
    if (!st || !pillOpen()) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!st.mode) {
      if (Math.abs(dx) > 8 && Math.abs(dx) >= Math.abs(dy)) st.mode = 'turn';
      else if (Math.abs(dy) > 24) st.mode = 'switch';
      else return;
    }
    if (st.mode === 'turn') {
      playNudge(pillKeys()[pillIdx], st.v, dx / Math.max(220, body.clientWidth));
      pillPaint(true);
    } else if (Math.abs(dy) > 24) {
      pillStep(dy < 0 ? 1 : -1);
      st = { ...st, y: e.clientY, v: playBase(pillKeys()[pillIdx]) };
    }
  });
  const end = (e: PointerEvent) => {
    const tap = st && !st.mode && e.type === 'pointerup' && performance.now() - st.t < 450;
    st = null;
    if (!tap) return;
    // Folded: a tap opens it (or, with no knobs yet, the Deck to pick some).
    if (!pillOpen()) return openKnobPill();
    const spec = knobSpec(pillKeys()[pillIdx] ?? '');
    // Tap the ‹ › (or − +) side to step; the middle of a choice opens its list.
    if (spec) {
      const b = body.getBoundingClientRect();
      const side = e.clientX < b.left + b.width * 0.25 ? -1 : e.clientX > b.right - b.width * 0.25 ? 1 : 0;
      const key = pillKeys()[pillIdx];
      if (spec.options) {
        const n = spec.max + 1;
        if (side) playSet(key, (Math.round(spec.get()) + side + n) % n);
        else knobMenu(body, spec);
      } else if (side) {
        // Twenty steps across the range, on the setting's own step grid.
        const by = Math.max(spec.step, Math.round((spec.max - spec.min) / 20 / spec.step) * spec.step);
        playSet(key, playBase(key) + side * by);
      }
    }
    pillPaint(true);
  };
  pill.addEventListener('pointerup', end);
  pill.addEventListener('pointercancel', end);
}
pillPaint();
// Show every field knob for a moment (touch screens can't hover the row):
// when the menu closes or Watch starts, so you see what you can play.
function revealKnobs(ms = 2600) {
  setTimeout(() => {
    syncFieldKnobs();
    pillPaint(true);
    showBar();
    if (!playing()) return;
    const keys = fieldKnobKeys();
    playRow.querySelectorAll<HTMLElement>('.fader').forEach((f, i) => {
      if (f.hidden) return;
      const k = knobs.get(`k${i}`);
      if (!k || !keys[i]) return;
      k.el.classList.add('show');
      clearTimeout(k.timer);
      k.timer = window.setTimeout(() => k.el.classList.remove('show'), ms);
    });
  }, 60);
}
// Two fingers: drag up/down and pinch.
const playTouch = new Map<number, { x: number; y: number }>();
let twoStart: { cy: number; d: number; two: number; pinch: number } | null = null;
const twoGeom = () => {
  const [a, b] = [...playTouch.values()];
  return { cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
};
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  playTouch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (playing() && playTouch.size === 2) {
    // The first finger stops acting on the particles.
    pointer.down = false;
    pointer.active = false;
    pointer.x = pointer.y = -1e4;
    twoStart = { ...twoGeom(), two: playBase(settings.playTwo), pinch: playBase(settings.playPinch) };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!playTouch.has(e.pointerId)) return;
  playTouch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!twoStart || playTouch.size !== 2) return;
  const g = twoGeom();
  const dy = (twoStart.cy - g.cy) / (stage.clientHeight * 0.55);
  const pinch = Math.log2(g.d / twoStart.d) * 0.35;
  // Whichever the hands are doing more of wins, so one doesn't drag the other.
  if (Math.abs(dy) > Math.abs(pinch)) playNudge(settings.playTwo, twoStart.two, dy);
  else playNudge(settings.playPinch, twoStart.pinch, pinch);
});
const twoEnd = (e: PointerEvent) => {
  playTouch.delete(e.pointerId);
  if (playTouch.size < 2) twoStart = null;
};
canvas.addEventListener('pointerup', twoEnd);
canvas.addEventListener('pointercancel', twoEnd);
// Listen on the window, not the canvas, so the wheel still turns a knob while
// the pointer sits over a knob zone, a toast or the HUD. Only the menu keeps
// its own scrolling. Every wheel over the field is cancelled, which (with
// overscroll-behavior in the CSS) keeps a sideways trackpad swipe from
// becoming the browser's back / forward gesture.
window.addEventListener(
  'wheel',
  (e) => {
    const t = e.target as Element | null;
    if (t?.closest?.('#panel, #toggle, .overview, .knob-menu, .scene-sheet, .tuner')) return;
    if (!playing()) return;
    e.preventDefault();
    // The knobs only play on the Stage (Studio and Deck closed).
    if (!panel.classList.contains('collapsed') || ovEl) return;
    const slot = !e.shiftKey ? (e.altKey ? 4 : 0) : e.metaKey || e.ctrlKey ? 1 : e.altKey ? 2 : 3;
    const key = fieldKnobKeys()[slot] ?? '';
    // Plain wheel follows the vertical axis only, so sideways drift on a
    // trackpad doesn't turn the knob. Shift turns vertical scrolling into
    // horizontal on macOS, so with Shift take whichever axis moved most.
    const d = e.shiftKey ? (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) : e.deltaY;
    if (!d) return;
    // Lines (a mouse wheel) to pixels, like a trackpad.
    const px = d * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    playNudge(key, playBase(key), -px / 1200);
  },
  { passive: false },
);

// --- panel toggle & keys -----------------------------------------------------

const panel = document.getElementById('panel')!;
const toggle = document.getElementById('toggle')!;
toggle.addEventListener('click', () => {
  const collapsed = panel.classList.toggle('collapsed');
  if (collapsed) revealKnobs();
  if (!collapsed) document.body.classList.remove('watching');
  if (sheetMode()) applySheet();
  if (collapsed) {
    panel.classList.remove('picking', 'more', 'finding');
    document.getElementById('sheet-title')?.setAttribute('aria-expanded', 'false');
  }
  // The floating shuffle button only shows while the drawer is closed.
  document.body.classList.toggle('panel-open', !collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.title = collapsed ? 'Show controls (H)' : 'Hide controls (H)';
  toggle.textContent = collapsed ? '⟨' : sheetMode() ? '✕' : '⟩';
  requestAnimationFrame(resize);
});
// Phones: the menu opens full screen with one slim bar (page picker,
// search, actions, close); closed, the bottom bar brings it back.
function sheetMode() {
  return matchMedia('(max-width: 720px)').matches;
}
const sheet = { peek: false };
function applySheet() {
  panel.classList.remove('peek');
  panel.style.height = '';
}
function setPicking(on: boolean) {
  panel.classList.toggle('picking', on);
  document.getElementById('sheet-title')!.setAttribute('aria-expanded', String(on));
  if (on && sheet.peek) {
    sheet.peek = false;
    applySheet();
  }
}
document.getElementById('sheet-title')!.addEventListener('click', () => setPicking(!panel.classList.contains('picking')));
document.getElementById('sheet-find')!.addEventListener('click', () => {
  const on = panel.classList.toggle('finding');
  setPicking(false);
  if (on && sheet.peek) {
    sheet.peek = false;
    applySheet();
  }
  const input = document.querySelector<HTMLInputElement>('.search input');
  if (on) input?.focus();
  else if (input?.value) {
    input.value = '';
    input.dispatchEvent(new Event('input'));
  }
});
// Tiles or List: how the menu lays out its knobs, selectors and switches.
{
  const KEY = 'pf-panel-view';
  const TILE_ICON = '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>';
  let view = 'tiles';
  try { if (localStorage.getItem(KEY) === 'list') view = 'list'; } catch {}
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon view-btn';
  const show = () => {
    panel.dataset.view = view;
    // The icon shows what a tap switches to.
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${view === 'list' ? TILE_ICON : DENSITY_ICON.strips}</svg>`;
    b.title = view === 'list' ? 'Show as tiles' : 'Show as a list';
    b.setAttribute('aria-label', b.title);
  };
  show();
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    view = view === 'list' ? 'tiles' : 'list';
    try { localStorage.setItem(KEY, view); } catch {}
    show();
    showToast(view === 'list' ? 'List' : 'Tiles');
  });
  document.getElementById('toggle')!.before(b);
}
document.getElementById('sheet-more')!.addEventListener('click', (e) => {
  const on = panel.classList.toggle('more');
  (e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(on));
});
addEventListener('resize', () => {
  applySheet();
  toggle.textContent = panel.classList.contains('collapsed') ? '⟨' : sheetMode() ? '✕' : '⟩';
});
applySheet();
// In X-Frame, only one layer's options panel is open at a time.
xframe.panel({ element: panel, isOpen: () => !panel.classList.contains('collapsed'), close: () => toggle.click(), open: () => toggle.click() });

// Knob recording: the loop icon in the open knob pill (L on a keyboard).
// Tap: counts in to the next bar, then every knob you turn over the loop
// becomes keyframes and plays back. Tap while recording to stop early (keeps
// the take). Hold it (or right-click) for loop length, clearing and undo.
const KNOB_REC = ['*'];
const KNOB_BARS_KEY = 'pf-knob-bars';
let knobBars = 4;
try { knobBars = +(localStorage.getItem(KNOB_BARS_KEY) ?? '') || 4; } catch {}
let knobUndo: string | null = null;
const knobRecOn = () => !!animRec && animRec.keys === KNOB_REC;
function knobRecToggle() {
  const r = animRec;
  if (r && r.keys === KNOB_REC) {
    if (animBeat < r.from || !r.live.size) {
      animRec = null;
      showToast('Knob recording cancelled');
    } else r.from = animBeat - r.beats; // ends next frame; same loop alignment
  } else {
    if (animRec) return showToast('Another recording is running');
    knobUndo = settings.anim;
    animRecordMany(KNOB_REC, knobBars, (made) => {
      if (!made) knobUndo = null;
      showToast(made ? `Recorded ${made} knob${made > 1 ? 's' : ''} · ${cycleLabel(knobBars)} loop` : 'No knob moved, nothing recorded', made ? ['Undo', knobUndoTake] : undefined);
    });
  }
  knobLoopPaint();
}
function knobUndoTake() {
  if (knobUndo === null) return;
  set('anim', knobUndo as never);
  knobUndo = null;
  showToast('Last take undone');
  knobLoopPaint();
}
function knobSetBars(b: number) {
  knobBars = b;
  try { localStorage.setItem(KNOB_BARS_KEY, String(b)); } catch {}
  knobLoopPaint();
}
// The settings the field knobs move (macros and choices can't be recorded).
const knobAnimKeys = () => pillKeys().map((k) => knobSpec(k)?.key as string | undefined).filter((k): k is string => !!k && !!animMap()[k]);
function knobClear(keys: string[]) {
  if (!keys.length) return;
  const m = { ...animMap() };
  for (const k of keys) delete m[k];
  set('anim', formatAnim(m) as never);
  pillPaint();
  knobLoopPaint();
}
const loopBtn = pill.querySelector<HTMLButtonElement>('.mb-loop')!;
const krBadge = document.createElement('div');
krBadge.className = 'kr-badge';
krBadge.setAttribute('aria-live', 'polite');
document.body.append(krBadge);
function knobLoopPaint() {
  const r = knobRecOn() ? animRec! : null;
  const wait = !!r && animBeat < r.from;
  loopBtn.classList.toggle('rec', !!r && !wait);
  loopBtn.classList.toggle('wait', wait);
  loopBtn.classList.toggle('has', !r && knobAnimKeys().length > 0);
  loopBtn.querySelector('.lp-n')!.textContent = wait ? String(Math.max(1, Math.ceil(r!.from - animBeat))) : r ? `${Math.min(r.beats / 4, Math.floor((animBeat - r.from) / 4) + 1)}` : String(knobBars);
  loopBtn.style.setProperty('--p', r && !wait ? String(Math.min(1, (animBeat - r.from) / r.beats)) : '0');
  pill.classList.toggle('kr-rec', !!r && !wait);
  krBadge.classList.toggle('show', !!r);
  if (r) krBadge.textContent = wait ? `Knob loop · starts in ${Math.max(1, Math.ceil(r.from - animBeat))}…` : `Recording knobs ${Math.min(r.beats / 4, Math.floor((animBeat - r.from) / 4) + 1)} / ${r.beats / 4}`;
}
window.setInterval(() => {
  if (knobRecOn() || pillOpen()) knobLoopPaint();
  else if (krBadge.classList.contains('show')) knobLoopPaint();
}, 100);
let krMenu: HTMLElement | null = null;
function knobMenuClose() {
  krMenu?.remove();
  krMenu = null;
  loopBtn.classList.remove('menu');
}
function knobLoopMenu() {
  if (krMenu) return knobMenuClose();
  const el = document.createElement('div');
  el.className = 'kr-menu';
  const key = pillKeys()[pillIdx];
  const spec = key ? knobSpec(key) : null;
  const name = spec ? spec.label.replace(/ \(.*\)$/, '') : '';
  const oneOn = !!spec && !!animMap()[spec.key];
  const all = knobAnimKeys();
  el.innerHTML = `<span class="kr-h">Loop length</span><div class="kr-len">${[1, 2, 4, 8].map((b) => `<button type="button" data-b="${b}"${b === knobBars ? ' class="on"' : ''}>${b === 1 ? '1 bar' : b}</button>`).join('')}</div><i></i>` +
    `<button type="button" class="kr-row" data-a="one"${oneOn ? '' : ' disabled'}>Clear ${name}<small>${oneOn ? '◆' : 'no move'}</small></button>` +
    `<button type="button" class="kr-row" data-a="all"${all.length ? '' : ' disabled'}>Clear all moves<small>${all.length ? `${all.length} knob${all.length > 1 ? 's' : ''}` : 'none'}</small></button>` +
    `<button type="button" class="kr-row" data-a="undo"${knobUndo !== null && !knobRecOn() ? '' : ' disabled'}>Undo last take</button>`;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.b) {
      knobSetBars(+b.dataset.b);
      el.querySelectorAll('.kr-len button').forEach((x) => x.classList.toggle('on', x === b));
      return;
    }
    if (b.dataset.a === 'one' && spec) knobClear([spec.key as string]);
    else if (b.dataset.a === 'all') knobClear(all);
    else if (b.dataset.a === 'undo') knobUndoTake();
    knobMenuClose();
  });
  mbar.append(el);
  krMenu = el;
  loopBtn.classList.add('menu');
  navigator.vibrate?.(10);
}
document.addEventListener('pointerdown', (e) => {
  if (krMenu && !(e.target as HTMLElement).closest('.mb-loop, .kr-menu')) knobMenuClose();
}, true);
{
  let holdT = 0;
  let held = false;
  loopBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    held = false;
    clearTimeout(holdT);
    holdT = window.setTimeout(() => {
      held = true;
      knobLoopMenu();
    }, 450);
  });
  const cancel = () => clearTimeout(holdT);
  loopBtn.addEventListener('pointerup', cancel);
  loopBtn.addEventListener('pointerleave', cancel);
  loopBtn.addEventListener('pointercancel', cancel);
  loopBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearTimeout(holdT);
    if (!held) knobLoopMenu();
    held = true;
  });
  loopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (held) return void (held = false);
    if (krMenu) return knobMenuClose();
    navigator.vibrate?.(8);
    knobRecToggle();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  if (typing || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.key.toLowerCase() !== 'l') return;
  e.preventDefault();
  if (e.shiftKey) {
    const L = [1, 2, 4, 8];
    knobSetBars(L[(L.indexOf(knobBars) + 1) % L.length]);
    showToast(`Knob loop: ${cycleLabel(knobBars)}`);
  } else knobRecToggle();
});

// ⌘K / Ctrl+K (or /) finds any setting: opens the panel and the search field.
function focusSearch() {
  if (panel.classList.contains('collapsed')) toggle.click();
  if (sheetMode() && !panel.classList.contains('finding')) document.getElementById('sheet-find')!.click();
  const input = document.querySelector<HTMLInputElement>('.search input');
  input?.focus();
  input?.select();
}
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    focusSearch();
    return;
  }
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    focusSearch();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (typing) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    startTyping();
    return;
  }
  const k = e.key.toLowerCase();
  const digit = /^Digit(\d)$/.exec(e.code) ?? /^Numpad(\d)$/.exec(e.code);
  if (digit) {
    e.preventDefault();
    if (e.repeat) return;
    if (settings.numberKeys === 'knobs') {
      numKnobDown(e.code, +digit[1]);
      return;
    }
    // Remember the look before, so holding the key can come back to it.
    if (!e.shiftKey && myPresets.some((o) => o.key === digit[1])) held = { code: e.code, prev: snapshot(), at: performance.now() };
    numberKey(digit[1], e.shiftKey);
    return;
  }
  if (k === ' ') {
    e.preventDefault();
    togglePause();
  } else if (k === 'c') clear();
  // A S D: gather, scatter, shuffle, left to right like the buttons.
  else if (k === 'a' || k === 'g') toggleGather();
  else if (k === 's') scatter();
  else if (k === 'e') explode();
  else if (k === 'd' || k === 'r') shuffle();
  // F, next to D: a random music vibe, as Surprise me in the Vibe card.
  else if (k === 'f') surpriseVibe(vibeLead === 'any' ? undefined : vibeLead);
  else if (k === 'h') toggle.click();
  else if (k === 'v') toggleRecord();
  else if (k === 'p') toggleProject();
  else if (xfLive() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    const right = e.key === 'ArrowRight';
    if (e.shiftKey) xfFadeTo(right ? 1 : 0);
    else xfNudge(right ? 0.05 : -0.05);
  }
  else if (k === 'i') toggleDebug();
});

// Number keys as knob keys: hold 1–8 and scroll, swipe (trackpad), move the
// mouse or press ↑ ↓ to turn field knob A–H. A tap alone opens its slider.
// A big readout while a number key turns a knob: the field knobs are small.
const numBig = document.createElement('div');
numBig.className = 'num-big';
numBig.setAttribute('aria-live', 'polite');
numBig.innerHTML = '<span class="nb-name"><i></i><b></b></span><output></output><span class="nb-bar"><u></u></span>';
document.body.append(numBig);
let numBigTimer = 0;
function numBigShow(i: number, key: string, linger = 0) {
  const r = knobSpec(key);
  if (!r) return;
  const v = playBase(key);
  numBig.querySelector('i')!.textContent = 'ABCDEFGH'[i] ?? '';
  numBig.querySelector('b')!.textContent = r.label.replace(/ \(.*\)$/, '');
  numBig.querySelector('output')!.textContent = r.text(v);
  numBig.querySelector<HTMLElement>('.nb-bar u')!.style.width = `${((v - r.min) / (r.max - r.min || 1)) * 100}%`;
  numBig.classList.add('show');
  document.body.classList.add('num-turning');
  clearTimeout(numBigTimer);
  if (linger) numBigTimer = window.setTimeout(() => {
    numBig.classList.remove('show');
    document.body.classList.remove('num-turning');
  }, linger);
}
let numKnob: { code: string; i: number; key: string; at: number; moved: boolean; v: number; share: number; mx: number | null; my: number } | null = null;
function numKnobDown(code: string, d: number) {
  const i = d - 1;
  const keys = fieldKnobKeys();
  const key = d >= 1 && d <= 8 ? keys[i] : undefined;
  if (!key || !knobSpec(key)) {
    numKnob = null;
    showToast(d < 1 || d > 8 ? 'Keys 1–8 turn knobs A–H' : !keys.length ? 'No knobs in this scene yet. Pick some in the Deck.' : `No knob ${'ABCDEFGH'[i]} in this scene (it has ${keys.length})`);
    return;
  }
  numKnob = { code, i, key, at: performance.now(), moved: false, v: playBase(key), share: 0, mx: null, my: 0 };
  playShow(key);
  numBigShow(i, key);
}
function numKnobTurn(by: number) {
  if (!numKnob) return;
  numKnob.moved = true;
  numKnob.share += by;
  playNudge(numKnob.key, numKnob.v, numKnob.share);
  numBigShow(numKnob.i, numKnob.key);
}
addEventListener('wheel', (e) => {
  if (!numKnob) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  numKnobTurn(((e.deltaX - e.deltaY) * px) / 900);
}, { capture: true, passive: false });
addEventListener('pointermove', (e) => {
  if (!numKnob || e.pointerType === 'touch') return;
  if (numKnob.mx === null) {
    numKnob.mx = e.clientX;
    numKnob.my = e.clientY;
    return;
  }
  const dx = e.clientX - numKnob.mx;
  const dy = e.clientY - numKnob.my;
  numKnob.mx = e.clientX;
  numKnob.my = e.clientY;
  numKnobTurn((dx - dy) / 500);
}, true);
addEventListener('keydown', (e) => {
  if (!numKnob || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  numKnobTurn(e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.05 : -0.05);
}, true);
addEventListener('keyup', (e) => {
  if (!numKnob || e.code !== numKnob.code) return;
  const n = numKnob;
  numKnob = null;
  numBigShow(n.i, n.key, n.moved ? 900 : 1);
  if (n.moved || performance.now() - n.at > 600) return;
  // A tap: the big slider for a number, the list for a choice.
  const spec = knobSpec(n.key);
  const anchor = playRow.querySelector<HTMLElement>(`.fader.k${n.i}`) ?? knobs.get('centre')!.el;
  if (!spec) return;
  if (spec.options) return knobMenu(anchor, spec);
  const c = CONTROLS.find((x) => x.kind === 'range' && x.key === spec.key) as Extract<Control, { kind: 'range' }> | undefined;
  if (c) openTuner(c, () => (sceneBase ?? DEFAULTS)[c.key] as number, RACK_LIVE, () => {}, anchor, 'closed');
});
addEventListener('blur', () => {
  numKnob = null;
  numBig.classList.remove('show');
  document.body.classList.remove('num-turning');
});

// Holding a number key plays its preset only while held: let go after
// more than half a second and the previous look comes back.
let held: { code: string; prev: Partial<Settings>; at: number } | null = null;
window.addEventListener('keyup', (e) => {
  if (!held || e.code !== held.code) return;
  if (performance.now() - held.at > 450) {
    apply(held.prev, false);
    showToast('Back');
  }
  held = null;
});

// --- typing mode (Enter) -----------------------------------------------------------
// Particles spell what you type, each letter growing out of the last word.
let typing: { shape: Settings['shape']; text: string; buf: string } | null = null;

// The bar is a real text field, so selecting, arrow keys, paste and the
// usual shortcuts (Option/Ctrl+Backspace for a word, Cmd+Backspace for the
// line, Cmd+A) all work like anywhere else.
function typingBar() {
  let el = document.getElementById('typing');
  if (!el) {
    el = document.createElement('div');
    el.id = 'typing';
    el.className = 'typing';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 24;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = 'Type a word';
    input.setAttribute('aria-label', 'Type a word for the particles');
    const tip = document.createElement('span');
    tip.textContent = 'Enter keeps · Esc cancels';
    el.append(input, tip);
    input.addEventListener('input', () => {
      if (!typing) return;
      typing.buf = input.value;
      showTyped();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        stopTyping(e.key === 'Enter');
      }
    });
    // Clicking away keeps the word, like Enter.
    input.addEventListener('blur', () => stopTyping(true));
    document.getElementById('stage')!.append(el);
  }
  return el;
}
const typingInput = () => typingBar().querySelector('input')!;

function showTyped() {
  if (!typing) return;
  const t = typing.buf.trim() ? typing.buf : ' ';
  const keys = new Set<keyof Settings>(['shapeText']);
  const wasFree = settings.shape !== 'text';
  if (wasFree) {
    settings.shape = 'text';
    keys.add('shape');
  }
  settings.shapeText = t;
  if (settings.morph > 0) glideHomes = { ms: settings.morph * 1000, fromFree: wasFree };
  changed(keys);
  glideHomes = null;
}

function startTyping() {
  typing = { shape: settings.shape, text: settings.shapeText, buf: '' };
  typingBar().classList.add('on');
  const input = typingInput();
  input.value = '';
  input.focus();
}

function stopTyping(keep: boolean) {
  if (!typing) return;
  const t = typing;
  typing = null;
  typingBar().classList.remove('on');
  typingInput().blur();
  if (!keep || !t.buf.trim()) {
    settings.shape = t.shape;
    settings.shapeText = t.text;
    changed(new Set<keyof Settings>(['shape', 'shapeText']));
  }
  showToast(keep && t.buf.trim() ? `“${t.buf.trim()}”` : 'Typing off');
}

// --- debug overlay (I) ------------------------------------------------------------
// Where the time goes and which costly settings are on, to find out why a
// look runs slowly or forms slowly.
let debugTimer = 0;
function toggleDebug() {
  let el = document.getElementById('debug');
  if (el) {
    el.remove();
    clearInterval(debugTimer);
    return;
  }
  el = document.createElement('pre');
  el.id = 'debug';
  el.className = 'debug';
  document.getElementById('stage')!.append(el);
  const out = el;
  const update = () => {
    const S = settings;
    const lines: string[] = [];
    lines.push(`${Math.round(fps)} fps · ${n.toLocaleString()} particles · ${Math.round(renderScale * 100)}% resolution`);
    lines.push(`sim ${stepMs.toFixed(1)} ms · draw ${drawMs.toFixed(1)} ms  (16.7 ms = 60 fps)`);
    lines.push(`style ${S.render}${S.render === 'mixed' ? ` (${S.mixStyles})` : ''} · size ${S.size} · trails ${pct(S.trail)}${S.glow ? ' · glow' : ''}`);
    if (S.shape !== 'none') {
      // How formed the shape is: share of particles near their spot.
      let near = 0;
      let dist = 0;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(px[i] - hx[i], py[i] - hy[i]);
        dist += d;
        if (d < 4) near++;
      }
      lines.push(`shape ${S.shape}${S.shape === 'text' ? ` "${S.shapeText}" (${S.shapeText.length} chars)` : ''} · size ${pct(S.shapeSize)}`);
      lines.push(`  ${shapeInfo.targets.toLocaleString()} spots for ${n.toLocaleString()} particles${shapeInfo.targets < n ? ` (${(n / Math.max(1, shapeInfo.targets)).toFixed(1)} per spot)` : ''} · built in ${shapeInfo.ms.toFixed(0)} ms`);
      lines.push(`  formed ${pct(near / Math.max(1, n))} · avg ${(dist / Math.max(1, n)).toFixed(1)} px from spot · snap ${S.homeStrength}× · cycle ${S.shapeCycle ? S.shapeCycle + ' s' : 'off'}`);
    }
    const busy: string[] = [];
    if (S.flow > 0) busy.push(`flow ${S.flowType} ${S.flow}`);
    if (S.flock > 0) busy.push('flocking');
    if (S.space > 0) busy.push('personal space');
    if (S.render === 'links') busy.push(`links ${S.linkDist}px`);
    if (usesRibbons()) busy.push(`ribbons ${S.ribbonLen}`);
    if (S.depth > 0) busy.push('3D depth');
    if (S.lifespan > 0) busy.push(`lifespan ${S.lifespan}s`);
    if (S.emitter !== 'none') busy.push(`emitter ${S.emitter}`);
    if (wellList().length) busy.push(`${wellList().length} points`);
    if (S.friction > 0.08) busy.push(`high friction ${pct(S.friction)}`);
    if (busy.length) lines.push(`on: ${busy.join(' · ')}`);
    if (audio.source !== 'off') lines.push(`audio ${audio.source} · ${audio.levels.bpm ? Math.round(audio.levels.bpm) + ' bpm' : 'no tempo yet'} · bars ${audio.levels.bars} · tension ${audio.levels.tension.toFixed(2)}`);
    lines.push('I hides this');
    out.textContent = lines.join('\n');
  };
  update();
  debugTimer = window.setInterval(update, 400);
}

// Mobile quick actions, bottom right while the drawer is closed. Shuffle sits
// at the bottom, nearest the thumb.
{
  const fab = document.getElementById('fab')!;
  const quick: [string, string, () => void][] = [
    ['Pause', ICONS.pause, togglePause],
    ['Gather', ICONS.gather, toggleGather],
    ['Explode', ICONS.explode, () => explode()],
    ['Scatter', ICONS.scatter, scatter],
    ['Shuffle (keeps locked sections)', ICONS.shuffle, shuffle],
  ];
  for (const [title, icon, fn] of quick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title.replace(/ \(.*\)$/, ''));
    b.innerHTML = icon;
    b.addEventListener('click', fn);
    if (fn === togglePause) pauseButtons.push(b);
    if (fn === toggleGather) gatherButtons.push(b);
    fab.append(b);
  }
  // Out of the way while you watch: fade after a few idle seconds, back on
  // the next touch anywhere (that touch doesn't press a hidden button).
  let idle = 0;
  const wake = () => {
    fab.classList.remove('idle');
    document.body.classList.remove('field-idle');
    clearTimeout(idle);
    idle = window.setTimeout(() => {
      fab.classList.add('idle');
      document.body.classList.add('field-idle');
    }, 3000);
  };
  window.addEventListener('pointerdown', wake, { capture: true, passive: true });
  wake();
  // Desktop: one faint shuffle icon in the corner, so you can roll a new look
  // without opening the panel. Barely there; it hides when the mouse rests.
  const desk = document.createElement('button');
  desk.type = 'button';
  desk.className = 'desk-shuffle';
  desk.title = 'Shuffle (D)';
  desk.setAttribute('aria-label', 'Shuffle');
  desk.innerHTML = ICONS.shuffle;
  desk.addEventListener('click', () => shuffle());
  fab.after(desk);
  let rest = 0;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    desk.classList.remove('rest');
    clearTimeout(rest);
    rest = window.setTimeout(() => desk.classList.add('rest'), 2500);
  }, { passive: true });
  desk.classList.add('rest');
}
document.body.classList.add('panel-open');
new ResizeObserver(() => resize()).observe(canvas);
// Open with the panel closed, so the field gets the whole screen (H or ⟨ opens it).
toggle.click();

buildShades();
buildGlyphs();
renderControls();
{
  const saved = (() => {
    try {
      return localStorage.getItem(TAB_KEY);
    } catch {
      return null;
    }
  })();
  showTab(TABS.some(([t]) => t === saved) && saved !== 'xfader' ? (saved as Tab) : 'presets');
  syncTabDots();
}
buildFolders();
// --- Studio folders ------------------------------------------------------------
// The left column (on phones, the Studio's home): seven folders, one open at a
// time with its cards listed. A folder shows all its cards on the right, each
// fully open; a card in the list jumps to it. Cards don't fold here.
function buildFolders() {
  panel.classList.add('fmode');
  const nav = document.createElement('nav');
  nav.className = 'fidx';
  nav.setAttribute('aria-label', 'Studio folders');
  const split = document.createElement('div');
  split.className = 'fsplit';
  controls.before(split);
  // Phones: a folder's own header, with Back to the folders.
  const fhead = document.createElement('div');
  fhead.className = 'fhead';
  fhead.innerHTML = `<button type="button" class="fback" aria-label="Back to the folders">${svg('<path d="M15 5l-7 7 7 7"/>')}<span>Studio</span></button><b></b>`;
  const pane = document.createElement('div');
  pane.className = 'fpane';
  controls.before(pane);
  pane.append(fhead, controls);
  split.append(nav, pane);
  fhead.querySelector('.fback')!.addEventListener('click', () => setInside(false));
  const setInside = (on: boolean) => {
    panel.classList.toggle('f-in', on);
    if (on) controls.scrollTop = 0;
  };
  let open: string | null = folderOf(currentTab).id;
  type Item = { el: HTMLButtonElement; ctl: Extract<Control, { kind: 'section' }>; sec: HTMLElement | null; dot: HTMLElement; sum: HTMLElement };
  const items: Item[] = [];
  const heads: [Folder, HTMLElement, HTMLButtonElement, HTMLElement][] = [];
  const sections = CONTROLS.filter((c): c is Extract<Control, { kind: 'section' }> => c.kind === 'section' && !c.fixed);
  for (const f of FOLDERS) {
    const box = document.createElement('div');
    box.className = 'fd';
    box.dataset.f = f.id;
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'fd-head';
    head.innerHTML = `<span class="fd-ic">${svg(f.icon)}</span><span class="fd-txt"><b></b><small></small></span><span class="fd-n"></span><b class="fd-hlock" aria-hidden="true">${LOCK_SVG}</b><span class="fd-chev" aria-hidden="true">${svg('<path d="M9 5l7 7-7 7"/>')}</span>`;
    head.querySelector('b')!.textContent = f.label;
    const kids = document.createElement('div');
    kids.className = 'fd-kids';
    const mine = f.tabs.flatMap((t) => sections.filter((x) => pageOf(x) === t));
    let lastTab: Tab | null = null;
    for (const c of mine) {
      // The old music and camera cards live on as Reactions chips; they only show with show-classic.
      if (CLASSIC_SECS.has(c.id)) continue;
      // A folder with several pages names each in the list.
      if (f.tabs.length > 1 && pageOf(c) !== lastTab) {
        lastTab = pageOf(c);
        const h = document.createElement('p');
        h.className = 'fd-sub';
        h.textContent = TABS.find(([t]) => t === lastTab)![1];
        kids.append(h);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fd-card';
      b.innerHTML = `<i></i><span></span><small></small><b class="fd-lock" title="Locked: scenes, Shuffle and vibes keep this card">${LOCK_SVG}</b>`;
      b.querySelector('span')!.textContent = c.label;
      const it: Item = { el: b, ctl: c, sec: null, dot: b.querySelector('i')!, sum: b.querySelector('small')! };
      b.addEventListener('click', () => goCard(it));
      items.push(it);
      kids.append(b);
    }
    head.addEventListener('click', () => {
      const here = folderOf(currentTab).id === f.id;
      if (here && open === f.id && !sheetMode()) {
        open = null;
        return paint();
      }
      open = f.id;
      if (!here) showTab(f.tabs[0]);
      controls.scrollTop = 0;
      if (sheetMode()) setInside(true);
      paint();
    });
    box.append(head, kids);
    nav.append(box);
    heads.push([f, box, head, head.querySelector('small')!]);
  }
  const secOf = (it: Item) => (it.sec ??= controls.querySelector<HTMLElement>(`section[data-sec="${it.ctl.id}"]`));
  function goCard(it: Item) {
    const t = pageOf(it.ctl);
    if (!folderOf(currentTab).tabs.includes(t)) showTab(t);
    else if (currentTab !== t) showTab(t);
    if (sheetMode()) setInside(true);
    const sec = secOf(it);
    if (!sec) return;
    // While the jump scrolls, the list keeps the card you picked.
    spyOff = performance.now() + 900;
    requestAnimationFrame(() => {
      const y = sec.getBoundingClientRect().top - controls.getBoundingClientRect().top + controls.scrollTop;
      controls.scrollTo({ top: y - 8, behavior: 'smooth' });
      sec.classList.remove('flash');
      void sec.offsetWidth;
      sec.classList.add('flash');
    });
    markSel(it);
  }
  let sel: Item | null = null;
  function markSel(it: Item | null) {
    sel = it;
    for (const x of items) x.el.classList.toggle('sel', x === it);
  }
  // The card nearest the top of the pane is the one marked in the list.
  let spyOff = 0;
  controls.addEventListener('scroll', () => {
    if (performance.now() < spyOff) return;
    let best: Item | null = null;
    let bestY = -Infinity;
    for (const it of items) {
      const sec = secOf(it);
      // Only cards actually laid out (a card inside a hidden block has no box).
      if (!sec || sec.classList.contains('other-tab') || sec.hidden || !sec.getClientRects().length) continue;
      const y = sec.getBoundingClientRect().top - controls.getBoundingClientRect().top;
      if (y <= 40 && (!best || y >= bestY)) {
        best = it;
        bestY = y;
      }
    }
    if (best !== sel) markSel(best);
  }, { passive: true });
  function paint() {
    const cur = folderOf(currentTab).id;
    if (open && open !== cur && !sheetMode()) open = cur;
    for (const [f, box, head, small] of heads) {
      box.classList.toggle('open', open === f.id);
      box.classList.toggle('here', cur === f.id);
      head.setAttribute('aria-expanded', String(open === f.id));
      // Phones list what's on inside; desktop counts it.
      const mine = items.filter((it) => f.tabs.includes(pageOf(it.ctl)) && !secOf(it)?.hidden);
      const on = mine.filter((it) => it.ctl.power?.on());
      const powered = mine.filter((it) => it.ctl.power);
      const live = mine.filter((it) => !it.ctl.power || it.ctl.power.on());
      small.textContent = (live.length ? live : mine).map((it) => it.ctl.label).join(', ');
      head.querySelector<HTMLElement>('.fd-n')!.textContent = powered.length && on.length ? `${on.length} on` : '';
      const nLocked = mine.filter((it) => locks.has(it.ctl.id)).length;
      box.classList.toggle('has-lock', nLocked > 0);
      head.title = nLocked ? `${nLocked} locked card${nLocked > 1 ? 's' : ''}: scenes and Shuffle keep ${nLocked > 1 ? 'them' : 'it'}` : '';
    }
    for (const it of items) {
      const sec = secOf(it);
      it.el.hidden = !!sec?.hidden;
      const pw = it.ctl.power;
      it.dot.className = pw ? (pw.on() ? 'on' : '') : 'always';
      it.el.classList.toggle('locked', locks.has(it.ctl.id));
      it.sum.textContent = sec?.querySelector('.group-summary')?.textContent ?? '';
    }
    const t = fhead.querySelector('b')!;
    t.textContent = FOLDERS.find((f) => f.id === cur)!.label;
  }
  folderSync = () => {
    open = folderOf(currentTab).id;
    paint();
  };
  refreshers.push(paint);
  lockPaint = paint;
  afterShow.push(() => {
    for (const it of items) it.el.hidden = !!secOf(it)?.hidden;
  });
  // Cards stay open here: their headers don't fold them.
  controls.addEventListener('click', (e) => {
    const h = (e.target as HTMLElement).closest('.group-head');
    if (h && panel.classList.contains('fmode')) e.stopImmediatePropagation();
  }, true);
  // In a folder with several pages, its cards come page by page (Music, Camera, Connections).
  const tabOfEl = new Map(sectionTabs);
  for (const el of controls.children) {
    const t = tabOfEl.get(el as HTMLElement);
    (el as HTMLElement).style.order = t ? String(folderOf(t).tabs.indexOf(t) + 1) : '50';
  }
  for (const sec of controls.querySelectorAll<HTMLElement>('section.group.closed')) sec.classList.remove('closed');
  // Fine-tune and More show as plain blocks under the essentials.
  for (const m of controls.querySelectorAll<HTMLElement>('.more-body')) m.hidden = false;
  // Phones open on the folders; the title brings them back.
  document.getElementById('sheet-title')?.addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    setInside(false);
  }, true);
  setInside(false);
  paint();
  folderEnter = () => sheetMode() && setInside(true);
  // The Pages dock's page buttons open that folder.
  for (const [, b] of dockTabs) b.addEventListener('click', () => folderEnter?.());
}
resize();
refresh();
presetFromUrl(true);
playEntrance();
// Safari refuses a camera asked for without a tap (and then keeps refusing
// until a reload), so on load only start it straight away when it's already
// allowed; otherwise wait for the first tap or key.
syncLinks();
if (camWanted() && !cam.on) {
  const later = () => {
    removeEventListener('pointerdown', later, true);
    removeEventListener('keydown', later, true);
    if (camWanted() && !cam.on) void startCamera();
  };
  const wait = () => {
    addEventListener('pointerdown', later, true);
    addEventListener('keydown', later, true);
  };
  const q = navigator.permissions?.query?.({ name: 'camera' as PermissionName });
  if (q) q.then((st) => (st.state === 'granted' ? void startCamera() : wait()), wait);
  else wait();
}
window.addEventListener('hashchange', () => presetFromUrl(false));
requestAnimationFrame(frame);

// Hovering a label that is cut short (an ellipsis or a two-line clamp) shows
// its full text as a tooltip. Only labels without a tooltip of their own.
document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  let el = e.target as HTMLElement | null;
  for (let i = 0; el && i < 4; i++, el = el.parentElement) {
    if (el.title && !el.dataset.autoTitle) return;
    const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    if (clipped && getComputedStyle(el).overflow.includes('hidden') && !el.querySelector('input, select, canvas, svg')) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) { el.title = text; el.dataset.autoTitle = '1'; }
      return;
    }
    if (el.dataset.autoTitle) { el.removeAttribute('title'); delete el.dataset.autoTitle; }
  }
}, { passive: true });
