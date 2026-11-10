import './style.css';
import { AudioInput, tabAudioSupported, type SpectrumFrame } from './audio.ts';
import { xframe } from './xframe.ts';
import { GLYPH_SETS, PALETTES, hexToRgb, rgbToHsl, DEFAULTS, type Emitter, type Render, type Palette, type GlyphSet, type GlyphFont, type Settings, type PaletteDef } from './settings.ts';
import { VIBE_FAMILIES, vibe, VIBES, PRESETS, FAMILIES, FAMILY_OF, type VibeFamily, type VibeDef, type Family } from './scenes.ts';
import { Camera, FACE_GROUPS, type Task } from './camera.ts';
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
const settings: Settings = { ...DEFAULTS, ...load() };
if (settings.palette !== 'custom' && !(settings.palette in PALETTES)) settings.palette = DEFAULTS.palette;
// Older saves used 'none' as a beat wave; that is now 'Kick does: Pulse'.
if ((settings.audioBeat as string) === 'none') settings.audioBeat = 'ripple';

function load(): Partial<Settings> {
  try {
    return migrateLegacy(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
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
    <div class="fab" id="fab" aria-label="Quick actions"></div>
  </main>
  <aside class="panel" id="panel">
    <header>
      <h1>Particle field</h1>
      <button class="icon" id="toggle" aria-expanded="true" title="Hide controls (H)">⟩</button>
    </header>
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
let hy = new Float32Array(0);
let pz = new Float32Array(0); // depth: 0 far, 1 near
let dead = new Float32Array(0); // 1 while waiting for an emitter to (re)launch it
let free = new Float32Array(0); // 1 for face-effect particles: no home, short life
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
const countNow = () => Math.max(50, Math.min(10000, Math.round((settings.count * densityK) / 10) * 10));
function ensureCount(want = countNow()) {
  if (want > cap) {
    const grow = (a: Float32Array) => {
      const b = new Float32Array(want);
      b.set(a.subarray(0, n));
      return b;
    };
    [px, py, vx, vy, ox, oy, tone, gl, age, span, rnd, psz, dead, hx, hy, pz, free] = [px, py, vx, vy, ox, oy, tone, gl, age, span, rnd, psz, dead, hx, hy, pz, free].map(grow);
    cap = want;
  }
  // With a shape on, newcomers appear beside an existing particle, so they
  // join the formation instead of flying in from anywhere on screen.
  const near = settings.shape !== 'none' && n > 0 ? n : 0;
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
  }
  n = want;
}

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
  return fadeLife(i) * (settings.depth > 0 ? depthK(0.3 + pz[i] * 0.7, settings.depth) : 1);
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
  if (settings.playOn && e.pointerType === 'touch' && playTouch.size >= 1) return;
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
  if (settings.flowType !== 'curl') {
    const a = flowAngle(x, y);
    fvx = Math.cos(a);
    fvy = Math.sin(a);
    return;
  }
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
  const holdGather = pointer.down && settings.click === 'gather';
  const gathering = holdGather || gatherAll || linkRun.out.gather;
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
  const lk = linkRun.out.amounts;
  if (lk.flow > 1 && flowNow < 0.15) flowNow = 0.15;
  flowNow *= (1 - blastK) * handDial.flow * lk.flow;
  speedNow *= handDial.speed * lk.speed;
  const jitterNow = jitter;

  const kickPulse = on && (S.audioKick === 'pulse' || S.audioKick === 'both');
  const kickWave = on && (S.audioKick === 'wave' || S.audioKick === 'both');
  // Pulse: an outward shove while the kick envelope rises and a gentle pull
  // back while it decays, so the field breathes in place.
  const dPulse = kickPulse ? A.pulse - lastPulse : 0;
  lastPulse = A.pulse;
  const kick = dPulse * (dPulse > 0 ? 3 : 2.5) * S.audioPulse * I;
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
  const windX = Math.cos(windA) * settings.wind * 0.05;
  const windY = Math.sin(windA) * settings.wind * 0.05;
  const wellsNow = wellList().map((p) => ({ x: p.x * w, y: p.y * h, kind: p.kind }));
  const handR = settings.camHandReach;
  const handR2 = handR * handR;
  const handF = settings.camHandForce * 0.9;
  const ob = obstacleField();
  const obF = settings.obsForce;
  const wellF = settings.wellForce * 0.12;
  const wellReach = settings.wellRange;
  const emitting = settings.emitter !== 'none';
  // Form & dissolve: the pull fades out and back in on a cycle.
  let homeK = 0;
  if (settings.shape !== 'none') {
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
      if (settings.flowType === 'curl') {
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
      const tx = wordScale === 1 ? hx[i] : cxW + (hx[i] - cxW) * wordScale;
      const ty = wordScale === 1 ? hy[i] : cyH + (hy[i] - cyH) * wordScale;
      ax += (tx - px[i]) * homeK - vx[i] * homeDamp;
      ay += (ty - py[i]) * homeK - vy[i] * homeDamp;
      // Letter hop: one letter (a slice of the shape) jumps on each kick.
      if (hopKick > 0.02 && hopMax > hopMin) {
        const li = Math.min(hopLetters - 1, (((hx[i] - hopMin) / (hopMax - hopMin + 0.01)) * hopLetters) | 0);
        if (li === hopIdx) ay -= hopKick * settings.audioLetterHop * 1.2;
      }
    }
    if (entK > 0) {
      ax += ((hx[i] - px[i]) * 0.06 - vx[i] * 0.4) * entK;
      ay += ((hy[i] - py[i]) * 0.06 - vy[i] * 0.4) * entK;
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
  const fl = S.flock;
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
        ax += ((avx / cnt - vx[i]) * 0.05 * S.flockAlign + (mx / cnt) * 0.0015 * S.flockCohesion + sx * 1.5 * S.flockSep) * fl;
        ay += ((avy / cnt - vy[i]) * 0.05 * S.flockAlign + (my / cnt) * 0.0015 * S.flockCohesion + sy * 1.5 * S.flockSep) * fl;
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
  const L = Math.max(2, Math.round(settings.ribbonLen));
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
imageInput.accept = 'image/*';
imageInput.addEventListener('change', () => {
  const f = imageInput.files?.[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
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
// Connections (see runLinks): declared early, the camera helpers read them.
const linkRun = new LinkRunner();
// Density macro: multiplies the scene's particle count (see countNow).
let densityK = 1;
// Macros (Macros card, plus Connections pushing them): what they do this frame.
const macro = { speed: 1, flow: 1, flowMin: 0, jitter: 1, jitterAdd: 0, friction: 1, home: 1, trailAdd: 0, size: 1, filter: '' };
let linkNeed = linkNeeds([]);
let linkFlash = 0;
const faceTracked = () => (isCam() && faceMode()) || faceExtras() || linkNeed.face;
const handsTracked = () => handsOn() || settings.gestOn || (isCam() && settings.camMode === 'hands') || linkNeed.hands;
const poseTracked = () => settings.poseOn || (isCam() && settings.camMode === 'pose') || linkNeed.pose;
const bodyObs = () => settings.obstacles === 'body';
const camWanted = () => isCam() || handsOn() || settings.gestOn || settings.poseOn || bodyObs() || faceExtras() || linkNeed.face || linkNeed.hands || linkNeed.pose;
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
      showToast(cam.error);
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
  const loud = audio.source !== 'off' ? 0.4 + audio.levels.level * 1.2 : 1;
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
  const tick = () => {
    if (box.offsetParent) for (const [src, el] of meters) el.style.height = `${Math.round((linkRun.levels[src] ?? 0) * 100)}%`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  const tick = () => {
    if (box.isConnected && box.offsetParent) for (const [k, el] of bars) {
      el.style.width = `${(exLevel[k] * 100).toFixed(0)}%`;
      el.classList.toggle('hot', exOn[k]);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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

function buildShape() {
  const S = settings;
  const key = [S.shape, S.shapeText, S.imageMode, S.shapeSize, w, h, n, shapeImage?.src ?? '', S.shape === 'camera' ? `${S.camMode}${S.camMirror}${camFrameNo}` : ''].join('|');
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
  if (!glideHomes) homeGlide = null;
  const cx = w / 2;
  const cy = h / 2;
  const R = (Math.min(w, h) / 2) * S.shapeSize;
  if (S.shape === 'grid' || S.shape === 'sunflower' || S.shape === 'ring') {
    const cols = Math.max(1, Math.round(Math.sqrt((n * w) / h)));
    const rows = Math.max(1, Math.ceil(n / cols));
    for (let i = 0; i < n; i++) {
      if (S.shape === 'grid') {
        const gw = w * S.shapeSize;
        const gh = h * S.shapeSize;
        hx[i] = cx - gw / 2 + ((i % cols) + 0.5) * (gw / cols);
        hy[i] = cy - gh / 2 + (Math.floor(i / cols) + 0.5) * (gh / rows);
      } else if (S.shape === 'sunflower') {
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
    if (S.shape === 'text') {
      const text = S.shapeText.trim() || ' ';
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let size = H * 0.5;
      g.font = `800 ${size}px system-ui, sans-serif`;
      const tw = g.measureText(text).width;
      size *= Math.min(1, (W * S.shapeSize) / Math.max(1, tw));
      size = Math.min(size, H * 0.7 * S.shapeSize + 4);
      g.font = `800 ${size}px system-ui, sans-serif`;
      g.fillText(text, W / 2, H / 2);
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
  for (let i = 0; i < n; i++) {
    const tx = hx[i];
    const ty = hy[i];
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
    emitAcc += n * S.emitRate * (dt / 60);
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
  const u = palMix ? Math.min(1, (performance.now() - palMix.start) / palMix.dur) : 1;
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
    if (uniformSize) {
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

const MIXABLE: [string, string][] = [
  ['dots', 'Pixels'], ['circles', 'Circles'], ['glow', 'Glow'], ['bokeh', 'Bokeh'], ['rings', 'Rings'],
  ['sparkles', 'Sparkles'], ['arrows', 'Arrows'], ['streaks', 'Streaks'], ['comets', 'Comets'], ['ribbons', 'Ribbons'], ['glyphs', 'Glyphs'],
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
  const bands = audio.source !== 'off' ? settings.audioBands : 0;
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
  const base = (ch > cw ? Math.PI / 2 : 0) - sl / 2;
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
    parAmt = 40 * settings.depthParallax * settings.depth;
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
  linkRun.sync(settings.links);
  linkNeed = linkNeeds(linkRun.list);
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function linkSignal(id: string, now: number): Signal {
  const L = audio.levels;
  const music = audio.source !== 'off';
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
  const v = (k: MacroKey, p: number) => Math.max(-1, Math.min(1, (settings[k] - 0.5 + p) * 2));
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
  const want = countNow();
  if (want === n || morphState) return;
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
      linkRun.out = { fired: [], gather: false, freeze: false, amounts: { size: 1, flow: 1, speed: 1, hue: 0, roll: 0, zoom: 1, emit: 0 }, macros: { energy: 0, order: 0, dream: 0, heat: 0, density: 0 } };
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
  const dt = Math.min(3, (now - last) / (1000 / 60));
  last = now;
  fps = fps * 0.95 + (60 / Math.max(dt, 0.001)) * 0.05;
  // Frozen by the user (Space) or by the audio player pausing with "hold" on.
  const frozen = paused;
  if (!frozen) adaptQuality(dt);
  audio.genre = settings.audioGenre;
  audio.update(now);
  if (!frozen) {
    updateGlyphs();
    cameraTick(now);
    runLinks(now);
    tickMorph(now, audio.source !== 'off' && audio.levels.beat);
    musicVisuals(now);
    tlTick(now);
    // Stutter: a split-second freeze frame on each snare.
    const held = now < stutterUntil;
    const t0 = performance.now();
    if (!held && !linkRun.out.freeze) step(dt);
    const t1 = performance.now();
    if (!held) {
      draw();
      if (kaleidoNow >= 2) kaleidoscope(kaleidoNow);
      if (settings.mirrorWorld) mirrorHalf();
    }
    const t2 = performance.now();
    stepMs = stepMs * 0.9 + (t1 - t0) * 0.1;
    drawMs = drawMs * 0.9 + (t2 - t1) * 0.1;
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
type Tab = 'presets' | 'look' | 'shape' | 'motion' | 'music' | 'camera';
const TABS: [Tab, string][] = [['presets', 'Scenes'], ['look', 'Look'], ['shape', 'Shape'], ['motion', 'Motion'], ['music', 'Music'], ['camera', 'Camera']];
// A card that can be switched off: `off` is what switching off sets, `start`
// what switching on sets the first time (later it restores what you had).
type Power = { on: () => boolean; off: Partial<Settings>; start: Partial<Settings> };
type ControlBody =
  | { kind: 'section'; id: string; label: string; tab?: Tab; fixed?: boolean; summary?: () => string; lock?: (keyof Settings)[]; power?: Power; about?: string; folded?: boolean }
  | { kind: 'vibes' }
  | { kind: 'more'; label: string }
  | { kind: 'mypresets' }
  | { kind: 'timeline' }
  | { kind: 'presetlib' }
  | { kind: 'exmeters' }
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
  ['sparkles', 'Sparkles'], ['arrows', 'Arrows'], ['streaks', 'Streaks'], ['comets', 'Comets'], ['ribbons', 'Ribbons'], ['glyphs', 'Glyphs'],
  ['links', 'Constellation'], ['mixed', 'Mixed'],
];
const COLOR_BY: [string, string][] = [['palette', 'Random'], ['face', 'Face features (camera)'], ['camera', 'Camera colours (camera)'], ['speed', 'Speed'], ['direction', 'Heading'], ['pointer', 'Pointer heat'], ['cycle', 'Colour waves'], ['horizontal', 'Left → right'], ['vertical', 'Bottom → top'], ['radial', 'Centre glow'], ['age', 'Age (with a lifespan)'], ['depth', 'Depth (with 3D depth)'], ['audio', 'Music energy'], ['band', 'Frequency group (with groups on)']];

const BEAT_ACTIONS: [string, string][] = [['ripple', 'Ripple'], ['twist', 'Twist'], ['shockwave', 'Shockwave'], ['star', 'Star burst'], ['sweep', 'Sweep line'], ['implode', 'Implode'], ['mix', 'Mix (cycle)'], ['random', 'Mix (random)']];
const VIBE_FAMILY_KEY = 'particle-field:vibe-family';
let vibeFamily: VibeFamily = (() => {
  const v = readJson<string>(VIBE_FAMILY_KEY, 'all');
  return VIBE_FAMILIES.some(([f]) => f === v) ? (v as VibeFamily) : 'all';
})();
for (const [fam, names] of [
  ['chill', 'Breathe, Ambient, Lo-fi, Minimal'], ['groove', 'Groove, Bounce'], ['hypnotic', 'Hypnotic, Liquid, Kaleido'],
  ['peak', 'Storm, Rave, Bass face, Festival'], ['glitch', 'Glitch'],
] as [VibeFamily, string][]) for (const nm of names.split(', ')) VIBES.find((v) => v.name === nm)!.family = fam;
// Word lists that came with a vibe: another vibe may replace them, yours it keeps.
const VIBE_WORDS = new Set(VIBES.map((v) => v.cards.audioWords).filter(Boolean));

// May a vibe change this key? Not if the card it belongs to is locked.
function cardAllows(k: keyof Settings) {
  const sec = CONTROLS.find((c) => c.kind === 'section' && c.lock?.includes(k));
  return !sec || sec.kind !== 'section' || !locks.has(sec.id);
}

function applyVibe(v: VibeDef) {
  const patch: Partial<Settings> = {};
  let look = settings.audioVibeLook ? v.look : {};
  // A vibe that suits another preset family brings a preset from it along.
  // Face vibes need your face as the shape, whatever the look switch says.
  const faceVibe = v.family === 'face';
  const faceNow = settings.shape === 'camera' && faceMode();
  const want = faceVibe ? !faceNow : settings.audioVibeLook && v.suits && lastPresetFamily !== v.suits;
  if (want && v.suits) {
    const list = PRESETS.filter(([nm, p]) => FAMILY_OF[nm] === v.suits && (!faceVibe || (p.shape === 'camera' && ['face', 'features', 'mixed'].includes(String(p.camMode)))));
    if (list.length) {
      const [nm, p] = pick(list);
      lastPresetFamily = v.suits;
      apply({ ...p, ...v.look });
      look = {};
      showToast(`${v.name} · ${nm}`);
    }
  }
  const all = { ...v.drums, ...v.cards, ...look };
  if (settings.audioWords.trim() && !VIBE_WORDS.has(settings.audioWords)) delete (all as Partial<Settings>).audioWords;
  for (const [k, x] of Object.entries(all) as [keyof Settings, never][]) if (cardAllows(k)) (patch as Record<string, unknown>)[k] = x;
  patch.audioVibe = v.name;
  Object.assign(settings, patch);
  changed(new Set(Object.keys(patch) as (keyof Settings)[]));
  // Vibes are how the music plays the field: without sound they barely show.
  if (audio.source === 'off') setTimeout(() => showToast(`${v.name} is set. It moves with music: turn on a sound source`), faceVibe ? 2500 : 0);
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

// A random combination, not just a random preset.
function surpriseVibe() {
  const kick = pick(['pulse', 'wave', 'both', 'both'] as const);
  const look = pick(VIBES).look;
  const cards: Partial<Settings> = {
    audioDrop: pick([0, 0.8, 1.2, 1.6]),
    audioBands: pick([0, 0, 0.5, 1]),
    audioHue: pick(['off', 'beat', 'bar', 'drift', 'drop'] as const),
    audioHueAmt: rand(10, 120, 5),
    audioBright: pick([0, 0.3, 0.6, 0.9]),
    audioCam: pick([0, 0.4, 0.8, 1.2]),
    audioSpin: pick(['off', 'off', 'sway', 'turn', 'step', 'rock', 'energy'] as const),
    audioCuts: pick(['off', 'off', 'bar', '2bars', '4bars', 'drop'] as const),
    audioDolly: Math.random() < 0.3,
    audioPan: pick([0, 0, 0.4, 0.8]),
    audioRoll: pick([0, 0, 0.5, 1]),
    audioFlip: Math.random() < 0.15,
    audioTunnel: pick([0, 0, 0, 0.3, 0.6]),
    audioTunnelTurn: pick(['none', 'left', 'right', 'rock'] as const),
    audioKaleido: pick([0, 0, 0, 0, 4, 6]),
    audioKaleidoDrop: Math.random() < 0.2,
    audioEcho: pick([0, 0, 0, 0.5, 0.8]),
    audioPalEvery: pick([0, 0, 8, 16]),
    audioMonoBuild: Math.random() < 0.3,
    audioBgFlash: pick([0, 0, 0, 0.3, 0.6]),
    audioInvert: Math.random() < 0.15,
    audioStutter: Math.random() < 0.2,
    audioGravFlip: Math.random() < 0.15,
    audioTrailEnergy: pick([0, 0, 0.4, 0.8]),
    audioSway: pick([0, 0, 0.5, 1]),
  };
  applyVibe(vibe('Surprise', '', {
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
  }, cards, look));
}

const GENRES: [string, string][] = [['general', 'Any'], ['hiphop', 'Rap / drill'], ['dnb', 'Drum & bass'], ['afro', 'Afro'], ['reggae', 'Reggae'], ['techno', 'Techno']];
const ft = () => true;
const kickPulse = () => settings.audioKick === 'pulse' || settings.audioKick === 'both';
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
const SHAPES: [string, string][] = [['none', 'Nothing (free)'], ['text', 'Text'], ['image', 'An image'], ['camera', 'Your camera'], ['grid', 'A grid'], ['sunflower', 'A sunflower disc'], ['ring', 'A ring']];
const EMITTERS: [string, string][] = [['none', 'The whole screen'], ['point', 'A point'], ['line', 'A line'], ['circle', 'A disc'], ['ring', 'A ring'], ['edges', 'The screen edges'], ['pointer', 'Your pointer / finger']];
const EMIT_MODES: [string, string][] = [['steady', 'Steady stream'], ['burst', 'Bursts'], ['beat', 'Burst on the beat']];
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
  explode: svg('<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M5 19l3.5-3.5M15.5 8.5L19 5"/>'),
  shuffle: svg('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>'),
  reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
};


// Every slider, for Play mode's pickers (filled once CONTROLS exists).
const PLAYABLE: [string, string][] = [];
// Knob sets: five settings for knobs A–E in one go.
const KNOB_SLOTS = ['playLeft', 'playWheel3', 'playWheel4', 'playRight', 'playWheel5'] as const;
const KNOB_SETS: [string, string[], string][] = [
  ['Macros', ['mEnergy', 'mOrder', 'mHeat', 'mDream', 'mDensity'], 'Energy, Order, Heat, Dream, Density: each moves a group of settings around the scene.'],
  ['Motion', ['speed', 'flow', 'flowScale', 'friction', 'jitter'], 'Speed, flow strength, flow scale, friction, jitter.'],
  ['Look', ['size', 'trail', 'sizeVar', 'depth', 'mHeat'], 'Size, trails, size variety, 3D depth, colour heat.'],
  ['Forces', ['gravity', 'wind', 'windDir', 'flow', 'speed'], 'Gravity, wind, wind direction, flow, speed.'],
  ['Shape', ['shapeSize', 'homeStrength', 'shapeCycle', 'size', 'mDensity'], 'Shape size, snap to shape, form & dissolve, particle size, density.'],
  ['Music VJ', ['audioIntensity', 'audioPulse', 'audioCam', 'audioTunnel', 'audioKaleido'], 'Music intensity, pulse, punch & shake, feedback tunnel, kaleidoscope (needs a sound source).'],
];
function knobSetName() {
  return KNOB_SETS.find(([, keys]) => keys.every((k, i) => settings[KNOB_SLOTS[i]] === k))?.[0];
}
function useKnobSet(keys: string[]) {
  KNOB_SLOTS.forEach((slot, i) => ((settings as unknown as Record<string, string>)[slot] = keys[i]));
  changed(new Set<keyof Settings>(KNOB_SLOTS));
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
        if (!tl.clips.length) tl.clips = TL_SETS[0][1].map((c) => ({ ...c }));
        tlSetOn(true);
        return {};
      },
    } },
  { kind: 'timeline' },
  { kind: 'note', text: 'Click a scene’s name to play it next, on the bar. On the field, the ring shows where you are: click it for the next scene, scroll over it to pick one. With music the bars follow its tempo; without, the tempo above. While the timeline runs, Auto VJ waits.' },

  // How switching between looks feels. Not part of any look: presets keep these.

  { kind: 'section', id: 'transitions', label: 'Transitions', tab: 'presets',
    summary: () => [settings.morph > 0 ? `${settings.morph.toFixed(1)}s morph` : 'instant', `snap ${settings.homeStrength.toFixed(1)}×`, settings.beatSnap ? 'on the beat' : '', settings.shuffleCards ? 'wild shuffle' : ''].filter(Boolean).join(' · ') },
  { kind: 'range', key: 'morph', label: 'Morph time', min: 0, max: 4, step: 0.1, format: (v) => (v === 0 ? 'instant' : `${v.toFixed(1)}s`) },
  { kind: 'range', key: 'homeStrength', label: 'Snap to shape', min: 0.1, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×` },
  { kind: 'toggle', key: 'beatSnap', label: 'Switch on the next kick drum' },
  { kind: 'toggle', key: 'shuffleCards', label: 'Shuffle also switches cards on and off' },
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
  { kind: 'section', id: 'play', label: 'Play on the field', tab: 'presets',
    about: 'Play settings like an instrument with the menu closed.',
    summary: () => (settings.playOn ? (knobSetName() ?? 'own mix') : 'off'),
    power: { on: () => settings.playOn, off: { playOn: false }, start: { playOn: true } } },
  { kind: 'sub', label: 'Knob set' },
  { kind: 'buttons', buttons: KNOB_SETS.map(([name, keys]): [string, () => void] => [name, () => useKnobSet(keys)]), active: (t) => knobSetName() === t },
  ...KNOB_SETS.map(([name, , text]): Control => ({ kind: 'note', text, show: () => knobSetName() === name })),
  { kind: 'note', text: 'Your own mix. Pick a set above, or choose each knob below.', show: () => !knobSetName() },
  { kind: 'select', key: 'playLeft', label: 'Knob A', options: PLAYABLE },
  { kind: 'select', key: 'playWheel3', label: 'Knob B', options: PLAYABLE },
  { kind: 'select', key: 'playWheel4', label: 'Knob C', options: PLAYABLE },
  { kind: 'select', key: 'playRight', label: 'Knob D', options: PLAYABLE },
  { kind: 'select', key: 'playWheel5', label: 'Knob E', options: PLAYABLE },
  { kind: 'note', text: 'Knobs A–E sit along the bottom of the field, left to right: slide a thumb up or down over one to play it, or hover the bottom edge to see them all. With a mouse: wheel = A, ⇧⌘ + wheel = B, ⇧⌥ + wheel = C, ⇧ + wheel = D, ⌥ + wheel = E (Ctrl or Alt on Windows).' },
  { kind: 'sub', label: 'Two fingers' },
  { kind: 'select', key: 'playTwo', label: 'Drag up / down', options: PLAYABLE },
  { kind: 'select', key: 'playPinch', label: 'Pinch', options: PLAYABLE },
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
  { kind: 'select', key: 'colorBy', label: 'Colour by', options: COLOR_BY },

  { kind: 'section', about: 'Near and far layers, with parallax.', id: 'depth', label: '3D depth', tab: 'look', lock: ['depth', 'depthParallax'],
    power: { on: () => settings.depth > 0, off: { depth: 0 }, start: { depth: 0.7, depthParallax: 0.5 } },
    summary: () => (settings.depth > 0 ? `${pct(settings.depth)}${settings.depthParallax > 0 ? ', parallax' : ''}` : 'off') },
  { kind: 'range', key: 'depth', label: '3D depth', min: 0, max: 2, step: 0.05, format: (v) => (v === 0 ? 'flat' : pct(v)) },
  { kind: 'range', key: 'depthParallax', label: 'Parallax', min: 0, max: 2, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)), show: () => settings.depth > 0 },
  { kind: 'note', text: 'Far particles are smaller, dimmer and slower; near ones react more to the pointer. Past 100% it exaggerates: tiny faint far layers, big bright near ones. Parallax shifts the layers as the pointer moves (or slowly by itself).', show: () => settings.depth > 0 },

  { kind: 'section', about: 'Particles form a word, an image or a pattern.', id: 'shape', label: 'Shape', tab: 'shape', lock: ['shape', 'shapeText', 'imageMode', 'shapeSize', 'shapeCycle', 'entrance', 'entranceTime'],
    power: { on: hasShape, off: { shape: 'none' }, start: { shape: 'text' } },
    summary: () => (settings.shape === 'none' ? 'off' : settings.shape === 'text' ? `“${settings.shapeText}”` : label(SHAPES, settings.shape)) },
  { kind: 'select', key: 'shape', label: 'Particles form', options: SHAPES },
  { kind: 'note', text: 'How the camera forms you (face, hands or body) is on the Camera tab.', show: isCam },
  { kind: 'text', key: 'shapeText', label: 'Text', placeholder: 'Type a word', show: () => settings.shape === 'text' },
  { kind: 'buttons', buttons: [['Choose an image…', () => imageInput.click()]], show: () => settings.shape === 'image' },
  { kind: 'select', key: 'imageMode', label: 'Use', options: [['auto', 'Auto'], ['subject', 'Subject (logo on a plain background)'], ['bright', 'Bright parts'], ['dark', 'Dark parts'], ['edges', 'Outlines']], show: () => settings.shape === 'image' },
  { kind: 'note', text: 'Photos work best with Bright parts, Dark parts or Outlines: particles gather more densely where the image is brighter, darker or has edges. The image is used for this session only.', show: () => settings.shape === 'image' },
  { kind: 'range', key: 'shapeSize', label: 'Shape size', min: 0.2, max: 1, step: 0.05, format: pct, show: hasShape },
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
    summary: () => (hasFlow() ? `${settings.flowType === 'curl' ? 'smoke' : 'currents'} ${settings.flow.toFixed(2)}` : 'off') },
  { kind: 'range', key: 'flow', label: 'Strength', min: 0, max: 2, step: 0.05, format: (v) => (v === 0 ? 'off' : v.toFixed(2)) },
  { kind: 'select', key: 'flowType', label: 'Type', options: [['waves', 'Currents (streams)'], ['curl', 'Smoke (stays spread)']], show: hasFlow },
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

  { kind: 'section', about: 'How particles react to your pointer and clicks.', id: 'pointer', label: 'Pointer & click', tab: 'motion', lock: ['pointerMode', 'radius', 'force', 'click', 'clickForce'],
    power: { on: () => hasPointer() || hasClick(), off: { pointerMode: 'none', click: 'none' }, start: { pointerMode: 'repel', click: 'ripple' } },
    summary: () => [hasPointer() ? label(POINTER_MODES, settings.pointerMode) : '', hasClick() ? label(CLICK_MODES, settings.click).replace(' (hold)', '') : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'select', key: 'pointerMode', label: 'On hover', options: POINTER_MODES },
  { kind: 'range', key: 'radius', label: 'Radius', min: 20, max: 400, step: 5, format: (v) => `${v}px`, show: hasPointer },
  { kind: 'range', key: 'force', label: 'Force', min: 0.05, max: 2, step: 0.05, format: (v) => v.toFixed(2), show: hasPointer },
  { kind: 'select', key: 'click', label: 'On click', options: CLICK_MODES },
  { kind: 'range', key: 'clickForce', label: 'Strength', min: 0.2, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×`, show: hasClick },

  { kind: 'section', id: 'audio', label: 'Sound source', tab: 'music', summary: () => AUDIO_LABELS[audio.source] + (audio.source === 'off' ? '' : ` · ${GENRES.find(([k]) => k === settings.audioGenre)?.[1]}`) },
  { kind: 'audio' },
  { kind: 'sub', label: 'Genre' },
  { kind: 'choice', key: 'audioGenre', label: 'Genre', options: GENRES },
  { kind: 'note', text: 'Tunes how kicks, snares, hats and 808s are picked out.' },

  { kind: 'section', id: 'vibe', label: 'Vibe', tab: 'music', summary: vibeLabel },
  { kind: 'note', text: 'Vibes are how the music moves the field, so they show once a sound source is on (above). Face vibes also switch to a camera face scene.', show: () => audio.source === 'off' },
  { kind: 'vibes' },
  { kind: 'range', key: 'audioIntensity', label: 'Intensity', min: 0, max: 2, step: 0.05, format: pct },
  { kind: 'toggle', key: 'audioVibeLook', label: 'Vibes also change style, trails and flow' },
  { kind: 'note', text: 'A vibe sets the drums and the cards below (switching them on or off). Lock a card to keep it as it is when you change vibe.' },

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
    lock: ['audioKick', 'audioPulse', 'audioBeat', 'audioWaveAt', 'audioWaveEvery', 'audioWaveForce', 'audioWaveSpeed', 'audioWaveReach', 'audioWaveWidth', 'audioWaveFeel', 'audioWaveRings', 'audioWaveAccent', 'audioSnare', 'audioHats', 'audioHits', 'audioSub', 'audioSubAmt', 'audioSpeed', 'audioFlow'],
    summary: () => [label([['pulse', 'pulse'], ['wave', 'waves'], ['both', 'pulse + waves'], ['none', '']], settings.audioKick), settings.audioSnare !== 'none' ? `snare ${settings.audioSnare}` : '', settings.audioHats !== 'none' ? 'hats' : ''].filter(Boolean).join(' · ') },
  { kind: 'sub', label: 'Kick' },
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
    lock: ['audioHue', 'audioHueAmt', 'audioBright', 'audioPalEvery', 'audioMonoBuild', 'audioBgFlash', 'audioInvert'],
    power: { on: () => settings.audioHue !== 'off' || settings.audioBright > 0 || settings.audioPalEvery > 0 || settings.audioMonoBuild || settings.audioBgFlash > 0 || settings.audioInvert,
      off: { audioHue: 'off', audioBright: 0, audioPalEvery: 0, audioMonoBuild: false, audioBgFlash: 0, audioInvert: false }, start: { audioHue: 'bar', audioBright: 0.4 } },
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
  { kind: 'toggle', key: 'audioMonoBuild', label: 'Colour drains in a build-up, back at the drop' },
  { kind: 'toggle', key: 'audioInvert', label: 'Invert the colours for a moment at a drop' },

  { kind: 'heading', label: 'View', tab: 'music' },
  { kind: 'section', id: 'camera', label: 'View moves', tab: 'music', about: 'Punches, shakes, cuts, dollies, pans, rolls and spins in time with the music.',
    lock: ['audioCam', 'audioSpin', 'audioCuts', 'audioDolly', 'audioPan', 'audioRoll', 'audioFlip'],
    power: { on: () => settings.audioCam > 0 || settings.audioSpin !== 'off' || settings.audioCuts !== 'off' || settings.audioDolly || settings.audioPan > 0 || settings.audioRoll > 0 || settings.audioFlip,
      off: { audioCam: 0, audioSpin: 'off', audioCuts: 'off', audioDolly: false, audioPan: 0, audioRoll: 0, audioFlip: false }, start: { audioCam: 0.6 } },
    summary: () => [
      settings.audioCam > 0 ? `punch ${pct(settings.audioCam)}` : '', settings.audioCuts !== 'off' ? 'cuts' : '', settings.audioDolly ? 'dolly' : '',
      settings.audioPan > 0 ? 'pan' : '', settings.audioRoll > 0 ? 'roll' : '', settings.audioFlip ? 'flip' : '', settings.audioSpin !== 'off' ? settings.audioSpin : '',
    ].filter(Boolean).join(' · ') || 'off' },
  { kind: 'note', text: 'Turn on a sound source in the Audio card first.', show: () => audio.source === 'off' },
  { kind: 'range', key: 'audioCam', label: 'Punch & shake', min: 0, max: 1.5, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'select', key: 'audioCuts', label: 'Beat cuts', options: [['off', 'Off'], ['bar', 'Every bar'], ['2bars', 'Every 2 bars'], ['4bars', 'Every 4 bars'], ['drop', 'Only on drops']] },
  { kind: 'select', key: 'audioSpin', label: 'Spin', options: [['off', 'Still'], ['sway', 'Sway every 4 bars'], ['rock', 'Rock to and fro over 8 bars'], ['step', 'Step an eighth turn each bar'], ['turn', 'Full turn every 32 bars'], ['energy', 'Turn faster when it gets loud']] },
  { kind: 'range', key: 'audioPan', label: 'Pan drift', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioRoll', label: 'Roll on snares', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : `${(v * 5).toFixed(1)}°`) },
  { kind: 'toggle', key: 'audioDolly', label: 'Dolly in through a build-up, snap back at the drop' },
  { kind: 'toggle', key: 'audioFlip', label: 'Mirror the view at each drop' },

  { kind: 'section', id: 'viewfx', label: 'View effects', tab: 'music', about: 'Feedback tunnel, kaleidoscope and echoes of the last kick.',
    lock: ['audioTunnel', 'audioTunnelTurn', 'audioKaleido', 'audioKaleidoDrop', 'audioEcho'],
    power: { on: () => settings.audioTunnel > 0 || settings.audioKaleido > 0 || settings.audioKaleidoDrop || settings.audioEcho > 0,
      off: { audioTunnel: 0, audioKaleido: 0, audioKaleidoDrop: false, audioEcho: 0 }, start: { audioTunnel: 0.5 } },
    summary: () => [settings.audioTunnel > 0 ? 'tunnel' : '', settings.audioKaleido > 0 ? `kaleidoscope ×${settings.audioKaleido}` : settings.audioKaleidoDrop ? 'kaleidoscope on drops' : '', settings.audioEcho > 0 ? 'echo' : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'range', key: 'audioTunnel', label: 'Feedback tunnel', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'select', key: 'audioTunnelTurn', label: 'Tunnel turns', options: [['none', 'Straight'], ['left', 'Left'], ['right', 'Right'], ['rock', 'Rocking']], show: () => settings.audioTunnel > 0 },
  { kind: 'range', key: 'audioKaleido', label: 'Kaleidoscope', min: 0, max: 8, step: 2, format: (v) => (v === 0 ? 'off' : `${v} sides`) },
  { kind: 'toggle', key: 'audioKaleidoDrop', label: 'Kaleidoscope for 2 bars at each drop', show: () => settings.audioKaleido === 0 },
  { kind: 'range', key: 'audioEcho', label: 'Echo of the last kick', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'note', text: 'The tunnel and kaleidoscope also work without music. The tunnel shortens trails so the streaming shows.' },

  { kind: 'heading', label: 'Motion & words', tab: 'music' },
  { kind: 'section', id: 'mmotion', label: 'Music motion', tab: 'music', about: 'Freeze frames on snares, gravity that flips at drops, trails and sway with the bass.',
    lock: ['audioStutter', 'audioGravFlip', 'audioTrailEnergy', 'audioSway'],
    power: { on: () => settings.audioStutter || settings.audioGravFlip || settings.audioTrailEnergy > 0 || settings.audioSway > 0,
      off: { audioStutter: false, audioGravFlip: false, audioTrailEnergy: 0, audioSway: 0 }, start: { audioSway: 0.6 } },
    summary: () => [settings.audioStutter ? 'stutter' : '', settings.audioGravFlip ? 'gravity flip' : '', settings.audioTrailEnergy > 0 ? 'trails' : '', settings.audioSway > 0 ? 'sway' : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'note', text: 'Turn on a sound source in the Audio card first.', show: () => audio.source === 'off' },
  { kind: 'range', key: 'audioSway', label: 'Sway with the bass', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioTrailEnergy', label: 'Longer trails when loud', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'toggle', key: 'audioStutter', label: 'Freeze for a split second on snares' },
  { kind: 'toggle', key: 'audioGravFlip', label: 'Gravity flips at each drop' },

  { kind: 'section', id: 'mwords', label: 'Music words', tab: 'music', about: 'A text pattern that changes word with the music, pulses and hops letter by letter.',
    lock: ['audioWordsOn', 'audioWords', 'audioWordsEvery', 'audioWordPulse', 'audioLetterHop'],
    power: { on: () => settings.audioWordsOn || settings.audioWordPulse > 0 || settings.audioLetterHop > 0,
      off: { audioWordsOn: false, audioWordPulse: 0, audioLetterHop: 0 }, start: { audioWordsOn: true, audioWords: 'LOVE, PEACE, UNITY', audioWordPulse: 0.5 } },
    summary: () => [settings.audioWordsOn && settings.audioWords.trim() ? 'words' : '', settings.audioWordPulse > 0 ? 'pulse' : '', settings.audioLetterHop > 0 ? 'hop' : ''].filter(Boolean).join(' · ') || 'off' },
  { kind: 'note', text: 'Changing words needs a Text shape (Shape tab) or a Words scene. Pulse and hop work with any shape, your face too.', show: () => settings.shape !== 'text' },
  { kind: 'toggle', key: 'audioWordsOn', label: 'Change word with the music' },
  { kind: 'text', key: 'audioWords', label: 'Words (comma separated)', placeholder: 'LOVE, PEACE, UNITY', show: () => settings.audioWordsOn },
  { kind: 'select', key: 'audioWordsEvery', label: 'Next word', options: [['bar', 'Every bar'], ['2bars', 'Every 2 bars'], ['4bars', 'Every 4 bars'], ['drop', 'Only on drops']], show: () => settings.audioWordsOn },
  { kind: 'range', key: 'audioWordPulse', label: 'Shape pulses with the kick', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },
  { kind: 'range', key: 'audioLetterHop', label: 'Letters hop in turn', min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? 'off' : pct(v)) },

  { kind: 'section', id: 'cam', label: 'Camera', tab: 'camera', about: 'Your webcam. Every card on this tab uses it; the picture stays on this device.',
    summary: () => (cam.on ? 'on' : camStarting ? 'starting…' : 'off') },
  { kind: 'buttons', buttons: [['Start camera', () => void startCamera()]], show: () => !cam.on },
  { kind: 'buttons', buttons: [['Stop camera', stopCamera]], show: () => cam.on },
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
  { kind: 'note', text: 'Expressions, hand signs and jumps: pick what they do in Connections (Scenes tab). Step back so the camera sees you from the hips up (the whole body for jumps).' },
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
    buttons: [
      ['Pause (Space)', ICONS.pause, togglePause],
      ['Gather to the centre (A)', ICONS.gather, toggleGather],
      ['Explode from the centre (E)', ICONS.explode, explode],
      ['Scatter (S)', ICONS.scatter, scatter],
      ['Shuffle, keeps locked sections (D)', ICONS.shuffle, shuffle],
      ['Reset to defaults and clear locks', ICONS.reset, reset],
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
  lastPresetFamily = FAMILY_OF[name] ?? null;
  apply(p);
  lastSceneName = name;
  // The image pattern needs a picture: ask for one (this runs in the click).
  if (p.shape === 'image' && !shapeImage) {
    imageInput.click();
    showToast('Pick an image for the particles to draw');
  } else showToast(name);
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
      b.addEventListener('click', () => playPreset(name, p));
      grid.append(b);
    }
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
  draw();
  wrap.append(chips, grid);
  return wrap;
}

const controls = document.getElementById('controls')!;
const refreshers: (() => void)[] = [];
const pauseButtons: HTMLButtonElement[] = [];

function set<K extends keyof Settings>(k: K, v: Settings[K]) {
  if (settings[k] === v) return;
  settings[k] = v;
  changed(new Set([k]));
}

// Visual presets, shuffle and reset keep the audio settings you've tuned.
const audioSettings = (): Partial<Settings> =>
  Object.fromEntries(Object.entries(settings).filter(([k]) => k.startsWith('audio')));
// How you play (morph time, beat snap) isn't part of a look either.
// The music cards (drops, auto VJ, groups, colour, camera) are your setup
// too: no look switches them, so auto VJ can't turn itself off.
const MUSIC_KEYS = [
  'audioVibeLook', 'audioDrop', 'audioDropBuild', 'audioVj', 'audioVjFrom', 'audioVjDrop', 'audioBands', 'audioHue', 'audioHueAmt', 'audioBright', 'audioCam', 'audioSpin',
  'audioCuts', 'audioDolly', 'audioPan', 'audioRoll', 'audioFlip', 'audioTunnel', 'audioTunnelTurn', 'audioKaleido', 'audioKaleidoDrop', 'audioEcho',
  'audioPalEvery', 'audioMonoBuild', 'audioBgFlash', 'audioInvert', 'audioStutter', 'audioGravFlip', 'audioTrailEnergy', 'audioSway',
  'audioWordsOn', 'audioWords', 'audioWordsEvery', 'audioWordPulse', 'audioLetterHop',
] as const;
const playSettings = (): Partial<Settings> => ({
  morph: settings.morph,
  beatSnap: settings.beatSnap,
  shuffleCards: settings.shuffleCards,
  homeStrength: settings.homeStrength,
  ...Object.fromEntries(MUSIC_KEYS.map((k) => [k, settings[k]])),
});

// Presets go through here: they glide over (Morph) and can wait for the beat.
function apply(p: Partial<Settings>, keepAudio = true, opts: { now?: boolean; morph?: number } = {}) {
  lastSceneName = '';
  if (currentMine) {
    currentMine = null;
    redrawMine();
  }
  // Your own presets bring their whole Sound setup back too (the music cards
  // included), all but Auto VJ, so a VJ stepping through them keeps going.
  const own = keepAudio ? {} : Object.fromEntries(MUSIC_KEYS.filter((k) => k in p && !k.startsWith('audioVj')).map((k) => [k, p[k]]));
  // Hands are an input like the pointer: they stay as they are unless the
  // preset itself sets them.
  // Drawing and spraying belong to their look, so they don't carry over.
  const hands: Partial<Settings> = Object.fromEntries((['camHands', 'camHandReach', 'camHandForce', 'camPreview', 'gestOn', 'twoDist', 'twoAngle', 'poseOn', 'poseSweep', 'links', 'mEnergy', 'mOrder', 'mDream', 'mHeat', 'mDensity', 'densityMode', 'playOn', 'playLeft', 'playWheel3', 'playWheel4', 'playRight', 'playWheel5', 'playTwo', 'playPinch'] as const).filter((k) => !(k in p)).map((k) => [k, settings[k]]));
  if (hands.camHands === 'draw' || hands.camHands === 'spray') hands.camHands = 'off';
  const target = { ...DEFAULTS, ...(keepAudio ? audioSettings() : {}), ...p, ...playSettings(), ...own, ...hands } as Settings;
  if (settings.beatSnap && audio.source !== 'off' && !opts.now) {
    pendingLook = { target, since: performance.now() };
    return;
  }
  morphTo(target, opts.morph);
}

// --- morphing between looks ---------------------------------------------------
// Numbers glide from the old look to the new over `morph` seconds and the
// palette crossfades; everything else (style, modes) switches at once. The
// particles keep their positions, so they move into the new behaviour.

type Rgb = [number, number, number];
let morphState: { from: Record<string, number>; to: Record<string, number>; start: number; dur: number } | null = null;
let palMix: { from: Rgb[]; fromBg: Rgb; start: number; dur: number; tick: number } | null = null;
let pendingLook: { target: Settings; since: number } | null = null;
// Set while morphTo applies a shape change; homeGlide then moves each
// particle's target from where it was to its new spot.
let glideHomes: { ms: number; fromFree: boolean } | null = null;
let homeGlide: { fx: Float32Array; fy: Float32Array; tx: Float32Array; ty: Float32Array; start: number; dur: number; dl?: Float32Array } | null = null;

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
  const shapeKeys = ['shape', 'shapeText', 'imageMode'] as const;
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
  const on = audio.source !== 'off';
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
  if (on) {
    let sat = 1 + S.audioBright * L.liftLevel * 0.8;
    // Mono build-up: the colour drains as the tension rises, back at the drop.
    if (S.audioMonoBuild) sat *= 1 - Math.min(0.92, L.tension * 1.1) * (1 - L.dropEnv);
    if (Math.abs(sat - 1) > 0.01) parts.push(`saturate(${sat.toFixed(2)})`);
    if (S.audioInvert && L.dropEnv > 0.55) parts.push('invert(1)');
  }
  const hueCam = handDial.hue + linkRun.out.amounts.hue;
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
  const rollAll = rollNow + handDial.roll + linkRun.out.amounts.roll;
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
  if (on && S.audioGravFlip) {
    if (L.drop) gravSign = -gravSign;
    gravNow = (S.gravity || 0.25) * gravSign;
  } else {
    gravSign = 1;
    gravNow = S.gravity;
  }
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
  else flashA *= 0.82;
  if (!on || S.audioBgFlash <= 0) flashA = 0;

  // Words.
  musicWords(on, L, S);
  wordScale = on && S.audioWordPulse > 0 ? 1 + L.pulse * S.audioWordPulse * 0.14 + L.dropEnv * S.audioWordPulse * 0.2 : 1;
  if (on && S.audioLetterHop > 0 && S.shape !== 'none' && L.beat) {
    hopMin = Infinity;
    hopMax = -Infinity;
    for (let i = 0; i < n; i++) {
      if (hx[i] < hopMin) hopMin = hx[i];
      if (hx[i] > hopMax) hopMax = hx[i];
    }
    hopLetters = S.shape === 'text' ? Math.max(1, S.shapeText.replace(/\s/g, '').length) : 6;
    hopIdx = (hopIdx + 1) % hopLetters;
    hopKick = 1;
  } else hopKick *= 0.8;
  if (!on || S.audioLetterHop <= 0) hopKick = 0;

  // Auto VJ: a new look every few bars, and on drops.
  if (on && S.audioVj > 0 && !tlActive()) {
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
type TlHow = 'cut' | 'morph' | 'slow' | 'drop';
type TlClip = { name: string; mine?: boolean; bars: number; how: TlHow };
type Timeline = { on: boolean; clips: TlClip[]; clock: 'music' | 'tempo'; bpm: number; knobs: 'keep' | 'reset'; dropJump: boolean; ring: 'always' | 'changes' | 'hidden' };
const TL_KEY = 'particle-field:timeline';
const TL_HOW: [TlHow, string][] = [['cut', 'Cut'], ['morph', 'Morph'], ['slow', 'Slow morph'], ['drop', 'Drop']];
const TL_BARS = [1, 2, 4, 8, 16, 32];
const clip = (name: string, bars: number, how: TlHow): TlClip => ({ name, bars, how });
const TL_SETS: [string, TlClip[]][] = [
  ['Chill', [clip('Silk', 8, 'slow'), clip('Pond', 8, 'slow'), clip('Northern lights', 8, 'morph'), clip('Nebula', 8, 'slow')]],
  ['Club', [clip('Galaxy', 4, 'cut'), clip('Fireworks', 4, 'drop'), clip('Warp speed', 4, 'cut'), clip('Shatter', 4, 'drop'), clip('Black hole', 8, 'morph'), clip('Neon storm', 4, 'cut')]],
  ['Journey', [clip('Deep space', 8, 'slow'), clip('Galaxy', 8, 'morph'), clip('Black hole', 4, 'drop'), clip('Mandala', 8, 'morph'), clip('Pollen', 8, 'slow')]],
];
const tl: Timeline = { on: false, clips: [], clock: 'music', bpm: 120, knobs: 'keep', dropJump: false, ring: 'changes', ...readJson<Partial<Timeline>>(TL_KEY, {}) };
let tlIdx = -1; // clip playing, -1 before the start
let tlBarsIn = 0; // whole bars played of it
let tlQueued = -1; // clip to start on the next bar
let tlLastBarAt = 0;
let tlBarSec = 2;
let tlShownAt = 0; // when the ring last popped up
let tlRedraw: (() => void) | null = null; // the card's list, when drawn
let tlProgress: ((frac: number) => void) | null = null;
let lastSceneName = ''; // the built-in scene playing, for "Add this scene"

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
    const p = tlScene(c);
    if (!p) continue;
    tlIdx = j;
    tlQueued = -1;
    tlBarsIn = 0;
    tlShownAt = performance.now();
    if (tl.knobs === 'reset') for (const [mk] of MACROS) (settings as unknown as Record<string, number>)[mk] = 0.5;
    const morph = c.how === 'cut' ? 0 : c.how === 'slow' ? Math.min(4, tlBarSec) : Math.min(2.5, Math.max(0.5, tlBarSec / 2));
    if (c.how === 'drop') explode();
    if (c.mine) {
      const mine = myPresets.find((p2) => p2.name === c.name)!;
      lastPresetFamily = null;
      apply(p, false, { now: true, morph });
      currentMine = mine;
      redrawMine();
    } else {
      lastPresetFamily = FAMILY_OF[c.name] ?? null;
      apply(p, true, { now: true, morph });
      lastSceneName = c.name;
    }
    if (tl.ring === 'hidden') showToast(c.name);
    tlRedraw?.();
    return;
  }
  showToast('The timeline has no scenes it can play');
  tlSetOn(false);
}
const tlActive = () => tl.on && tl.clips.length > 0;

function tlTick(now: number) {
  if (!tlActive()) {
    tlRing(now);
    return;
  }
  const L = audio.levels;
  const music = tl.clock === 'music' && audio.source !== 'off' && L.bpm > 0;
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
    else if (tlBarsIn >= tl.clips[tlIdx].bars) tlGo(tlIdx + 1);
  } else if (music && tl.dropJump && L.drop && tlBarsIn > 0) tlGo(tlQueued >= 0 ? tlQueued : tlIdx + 1);
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
  const on = tlActive() && tl.ring !== 'hidden' && settings.playOn !== undefined;
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
  tlProgress?.(frac);
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

function renderTimeline() {
  const box = document.createElement('div');
  box.className = 'timeline';
  const list = document.createElement('div');
  list.className = 'tl-list';
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  };
  const sel = (opts: [string, string][], value: string, label: string, change: (v: string) => void) => {
    const s = mk('select');
    s.setAttribute('aria-label', label);
    for (const [v, t] of opts) s.add(new Option(t, v));
    s.value = value;
    s.addEventListener('change', () => change(s.value));
    return s;
  };
  let bars: HTMLElement | null = null;
  const draw = () => {
    list.innerHTML = '';
    bars = null;
    if (!tl.clips.length) list.append(mk('p', 'tl-empty', 'No scenes yet. Add the one playing, pick one below, or load a ready-made set.'));
    tl.clips.forEach((c, k) => {
      const row = mk('div', 'tl-clip');
      const live = tl.on && k === tlIdx;
      row.classList.toggle('on', live);
      row.classList.toggle('queued', k === tlQueued);
      const name = mk('button', 'tl-name', c.name);
      name.type = 'button';
      name.title = 'Play this one next (on the bar)';
      name.addEventListener('click', () => tlQueue(k));
      const how = sel(TL_HOW, c.how, `How ${c.name} comes in`, (v) => {
        c.how = v as TlHow;
        tlSave();
      });
      const len = sel(TL_BARS.map((b) => [String(b), `${b} bar${b > 1 ? 's' : ''}`]), String(c.bars), `Bars for ${c.name}`, (v) => {
        c.bars = Number(v);
        tlSave();
      });
      const move = (d: number) => {
        const j = k + d;
        if (j < 0 || j >= tl.clips.length) return;
        [tl.clips[k], tl.clips[j]] = [tl.clips[j], tl.clips[k]];
        if (tlIdx === k) tlIdx = j;
        else if (tlIdx === j) tlIdx = k;
        tlSave();
      };
      const tools = mk('span', 'tl-tools');
      for (const [t, title, fn] of [['↑', 'Move up', () => move(-1)], ['↓', 'Move down', () => move(1)], ['×', 'Remove', () => {
        tl.clips.splice(k, 1);
        if (tlIdx === k) tlIdx = -1;
        else if (tlIdx > k) tlIdx--;
        tlQueued = -1;
        tlSave();
      }]] as [string, string, () => void][]) {
        const b = mk('button', '', t);
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', `${title}: ${c.name}`);
        b.addEventListener('click', fn);
        tools.append(b);
      }
      const prog = mk('i', 'tl-prog');
      const fill = mk('b');
      prog.append(fill);
      if (live) bars = fill;
      row.append(name, tools, how, len, prog);
      list.append(row);
    });
  };
  tlRedraw = draw;
  tlProgress = (frac) => {
    if (bars) bars.style.width = `${(frac * 100).toFixed(1)}%`;
  };
  draw();

  const add = mk('div', 'tl-add');
  const addThis = mk('button', '', 'Add this scene');
  addThis.type = 'button';
  addThis.addEventListener('click', tlAddCurrent);
  const pick = mk('select');
  pick.setAttribute('aria-label', 'Add a scene');
  const refill = () => {
    pick.innerHTML = '';
    pick.add(new Option('Add a scene…', ''));
    if (myPresets.length) {
      const g = mk('optgroup');
      g.label = 'My scenes';
      for (const p of myPresets) g.append(new Option(p.name, `my:${p.name}`));
      pick.append(g);
    }
    const g2 = mk('optgroup');
    g2.label = 'Scene library';
    for (const [nm] of [...PRESETS].sort(([a], [b]) => a.localeCompare(b))) g2.append(new Option(nm, nm));
    pick.append(g2);
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
  const sets = sel([['', 'Ready-made set…'], ...TL_SETS.map(([n]): [string, string] => [n, n])], '', 'Load a ready-made set', (v) => {
    const s = TL_SETS.find(([n]) => n === v);
    if (!s) return;
    tl.clips = s[1].map((c) => ({ ...c }));
    tlIdx = -1;
    tlQueued = -1;
    if (!tl.on) tl.on = true;
    tlSave();
    changed(new Set());
  });
  sets.addEventListener('change', () => (sets.value = ''));
  add.append(addThis, pick, sets);

  const opts = mk('div', 'tl-opts');
  const field = (label: string, el: HTMLElement) => {
    const l = mk('label', 'row select');
    l.append(mk('span', 'name', label), el);
    opts.append(l);
    return l;
  };
  field('Clock', sel([['music', 'From the music'], ['tempo', 'Tempo below']], tl.clock, 'Clock', (v) => {
    tl.clock = v as Timeline['clock'];
    tlSave(false);
    syncTempo();
  }));
  const tempo = mk('div', 'tl-tempo');
  const bpmIn = mk('input');
  bpmIn.type = 'number';
  bpmIn.min = '50';
  bpmIn.max = '200';
  bpmIn.setAttribute('aria-label', 'Tempo in BPM');
  bpmIn.addEventListener('change', () => {
    tl.bpm = Math.max(50, Math.min(200, Number(bpmIn.value) || 120));
    tlSave(false);
  });
  const tap = mk('button', '', 'Tap');
  tap.type = 'button';
  tap.title = 'Tap a few times in time with the beat';
  tap.addEventListener('click', () => {
    tlTap();
    bpmIn.value = String(tl.bpm);
  });
  const tnote = mk('span', 'tl-tnote');
  tempo.append(mk('span', 'name', 'Tempo'), bpmIn, mk('span', '', 'BPM'), tap, tnote);
  opts.append(tempo);
  const syncTempo = () => {
    bpmIn.value = String(tl.bpm);
    const music = tl.clock === 'music';
    tnote.textContent = music ? 'used until the music has a tempo' : '';
  };
  syncTempo();
  field('Knobs at a change', sel([['keep', 'Keep where they are'], ['reset', 'Back to the scene']], tl.knobs, 'Knobs at a change', (v) => {
    tl.knobs = v as Timeline['knobs'];
    tlSave(false);
  }));
  field('Ring on the field', sel([['changes', 'At each change'], ['always', 'Always'], ['hidden', 'Hidden']], tl.ring, 'Ring on the field', (v) => {
    tl.ring = v as Timeline['ring'];
    tlShownAt = performance.now();
    tlSave(false);
  }));
  const drop = mk('label', 'row toggle');
  const cb = mk('input');
  cb.type = 'checkbox';
  cb.checked = tl.dropJump;
  cb.addEventListener('change', () => {
    tl.dropJump = cb.checked;
    tlSave(false);
  });
  drop.append(cb, mk('span', 'name', 'Jump to the next scene on a drop'));
  opts.append(drop);

  box.append(list, add, opts);
  return box;
}

let intKeys: Set<string> | null = null;
function tickMorph(now: number, beat: boolean) {
  if (pendingLook && (beat || now - pendingLook.since > 2500 || !settings.beatSnap || audio.source === 'off')) {
    const t2 = pendingLook.target;
    pendingLook = null;
    morphTo(t2);
  }
  if (palMix) {
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
    S.count = Math.round(S.count / 10) * 10;
    n = Math.min(n, countNow());
    ensureCount();
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
  const u = Math.min(1, (performance.now() - palMix.start) / palMix.dur);
  return [0, 1, 2].map((c) => palMix!.fromBg[c] + (bg[c] - palMix!.fromBg[c]) * u) as Rgb;
}

let prevEmitter: Emitter = settings.emitter;
function changed(keys: Set<keyof Settings>, morphing = false) {
  save();
  if (keys.has('count')) {
    n = Math.min(n, countNow());
    ensureCount();
  }
  if (keys.has('glyphSet') || keys.has('glyphText')) buildGlyphs();
  if (keys.has('shape') || keys.has('shapeText') || keys.has('imageMode') || keys.has('shapeSize') || keys.has('count')) {
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
  shape: ['shape', 'shapeText', 'imageMode', 'shapeSize'],
  life: ['lifespan', 'emitter', 'launchSpeed'],
  particles: ['count', 'friction', 'jitter'],
  forces: ['gravity', 'wind', 'windDir'],
  swarm: ['flock', 'space'],
  obstacles: ['obstacles', 'obsText', 'obsShow', 'obsForce'],
  pointer: ['pointerMode', 'click', 'radius'],
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
const sectionTabs: [HTMLElement, Tab][] = [];
// What a card had when you switched it off, so switching on brings it back.
const powerMemory: Record<string, Partial<Settings>> = {};

let currentTab: Tab = 'presets';
function showTab(tab: Tab) {
  currentTab = tab;
  for (const [t, b] of tabButtons) {
    b.classList.toggle('on', t === tab);
    b.setAttribute('aria-selected', String(t === tab));
  }
  for (const [el, t] of sectionTabs) el.classList.toggle('other-tab', t !== tab);
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* not persisted */
  }
}

// Jump to the Connections card (Scenes tab), opened.
function openConnections() {
  showTab('presets');
  const sec = document.querySelector<HTMLElement>('[data-sec="links"]');
  if (!sec) return;
  if (sec.classList.contains('closed')) sec.querySelector<HTMLElement>('[aria-controls]')?.click();
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// A dot on a tab when one of its cards is locked.
function syncTabDots() {
  for (const [t, b] of tabButtons) {
    const locked = CONTROLS.some((c) => c.kind === 'section' && c.tab === t && locks.has(c.id));
    b.classList.toggle('has-lock', locked);
  }
}

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
function renderSearch() {
  const wrap = document.createElement('div');
  wrap.className = 'search';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search all settings';
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
          const text = full ? it.textContent : name;
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

  // Tabs along the top; Actions get their own bar at the bottom.
  const tabBar = document.createElement('div');
  tabBar.className = 'tabs';
  tabBar.setAttribute('role', 'tablist');
  for (const [t, text] of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.textContent = text;
    b.addEventListener('click', () => showTab(t));
    tabBar.append(b);
    tabButtons.push([t, b]);
  }
  controls.before(tabBar);
  tabBar.before(renderSearch());
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
  const actionBar = document.getElementById('actionbar')!;

  for (const [ci, ctl] of CONTROLS.entries()) {
    if (ctl.kind === 'heading') {
      // A small title between groups of cards inside a tab.
      const h = document.createElement('h2');
      h.className = 'tab-heading';
      h.textContent = ctl.label;
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
            btn.lastElementChild!.textContent = `Fine-tune · ${n} more`;
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
        // Locked cards keep their settings when you press Shuffle.
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
        sw.addEventListener('click', () => setPower(ctl, !ctl.power!.on()));
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
      sectionTabs.push([section, ctl.tab ?? 'look']);
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
      const grid = document.createElement('div');
      grid.className = 'vibes';
      const btns: [VibeDef, HTMLButtonElement][] = [];
      const drawVibes = () => {
        for (const c of chips.children) c.classList.toggle('on', (c as HTMLElement).dataset.fam === vibeFamily);
        grid.innerHTML = '';
        btns.length = 0;
        const list = VIBES.filter((v) => vibeFamily === 'all' || v.family === vibeFamily).sort((a, b) => a.name.localeCompare(b.name));
        for (const v of [...list, null]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.innerHTML = '<b></b><span></span>';
          b.querySelector('b')!.textContent = v ? v.name : 'Surprise me';
          b.querySelector('span')!.textContent = v ? v.about : 'A random mix of everything';
          b.addEventListener('click', () => (v ? applyVibe(v) : surpriseVibe()));
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
      drawVibes();
      body.append(chips);
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

    if (ctl.kind === 'links') {
      searchItem(body, renderLinks());
      continue;
    }

    if (ctl.kind === 'timeline') {
      searchItem(body, renderTimeline());
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
      for (const [title, icon, fn] of ctl.buttons) {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title.replace(/ \(.*\)$/, ''));
        b.innerHTML = icon;
        b.addEventListener('click', fn);
        if (fn === togglePause) pauseButtons.push(b);
        if (fn === toggleGather) gatherButtons.push(b);
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
      searchItem(body, row);
      if (ctl.show) conditional.push([row, ctl.show]);
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

  const stats = document.createElement('p');
  stats.className = 'stats';
  stats.id = 'stats';
  stats.title = 'Show debug info (I)';
  stats.style.cursor = 'pointer';
  stats.addEventListener('click', toggleDebug);
  controls.append(stats);
  const keys = document.createElement('p');
  keys.className = 'stats';
  keys.textContent = 'Click or hold on the field. Keys: 1–0 play your scenes (Shift saves) · Space pause · A gather · E explode · S scatter · D shuffle · Enter type a word · H hide panel · I debug info. Hold a number key to play it only while held.';
  controls.append(keys);
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
function explode() {
  if (gatherAll) toggleGather();
  const cx = w / 2;
  const cy = h / 2;
  const k = Math.min(w, h) / 800;
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

function shuffle() {
  // Wild shuffle: each unlocked card with an on/off switch flips a coin first.
  if (settings.shuffleCards) {
    for (const ctl of CONTROLS) {
      if (ctl.kind !== 'section' || !ctl.power || locks.has(ctl.id) || ctl.tab === 'music' || ctl.tab === 'camera') continue;
      setPower(ctl, Math.random() < (ctl.id === 'shape' ? 0.3 : 0.5));
    }
  }
  const r: Partial<Settings> = {
    count: rand(600, 4000, 100),
    size: rand(0.8, 2.6, 0.1),
    speed: rand(0.6, 2, 0.1),
    friction: rand(0.02, 0.08, 0.005),
    jitter: rand(0, 0.15, 0.01),
    lifespan: Math.random() < 0.3 ? rand(3, 12, 0.5) : 0,
    sizeVar: Math.random() < 0.4 ? rand(0.2, 0.8, 0.05) : 0,
    gravity: Math.random() < 0.15 ? rand(-0.4, 0.6, 0.05) : 0,
    flow: rand(0.2, 1.6, 0.05),
    flowType: Math.random() < 0.4 ? 'curl' : 'waves',
    flowScale: rand(0.002, 0.012, 0.0005),
    flowSpeed: rand(0.05, 1, 0.05),
    pointerMode: pick(['repel', 'attract', 'vortex'] as const),
    radius: rand(80, 260, 5),
    force: rand(0.3, 1.4, 0.05),
    click: pick(['gather', 'emit', 'ripple', 'implode', 'shockwave'] as const),
    clickForce: rand(0.6, 1.6, 0.1),
    render: pick(['dots', 'circles', 'glow', 'bokeh', 'rings', 'sparkles', 'arrows', 'streaks', 'streaks', 'comets', 'ribbons', 'glyphs', 'links', 'mixed'] as const),
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
  // Cards you switched off stay off; cards that are on stay on and keep
  // whatever shuffle doesn't roll.
  const keys = new Set<keyof Settings>();
  const S = settings as unknown as Record<string, unknown>;
  for (const ctl of CONTROLS) {
    if (ctl.kind !== 'section' || !ctl.lock || locks.has(ctl.id) || ctl.tab === 'music' || ctl.tab === 'camera') continue;
    if (ctl.power && !ctl.power.on()) continue;
    const before = Object.fromEntries(ctl.lock.map((k) => [k, S[k]]));
    for (const k of ctl.lock) S[k] = k in r ? r[k] : ctl.power ? S[k] : DEFAULTS[k];
    if (ctl.power && !ctl.power.on()) Object.assign(S, before);
    for (const k of ctl.lock) keys.add(k);
  }
  if (keys.size) changed(keys);
  showToast('New scene');
}

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
  showToast(`Updated ${p.key ? p.key + '  ' : ''}${p.name}`);
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
  const { audioFineTune: _skip, ...rest } = { ...settings, ...(morphState?.to ?? {}) } as Settings;
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
      up.title = cur.key ? `Saves the current scene over this one (Shift+${cur.key} does the same)` : 'Saves the current scene over this one';
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
  if (mine) {
    currentMine = mine;
    redrawMine();
  }
  showToast(mine ? `${mine.key ? mine.key + '  ' : ''}${mine.name}` : built![0]);
}

const KEY_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
let redrawMine = () => {};

function playMine(p: MyPreset) {
  lastPresetFamily = null;
  apply(p.settings, false);
  currentMine = p;
  redrawMine();
  showToast(`${p.key ? p.key + '  ' : ''}${p.name}${settings.beatSnap && audio.source !== 'off' ? ' · on the beat' : ''}`);
}

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
function showToast(text: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.querySelector('.stage')!.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), Math.max(1600, text.length * 45));
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
  for (const c of CONTROLS) {
    if (c.kind === 'section') sec = c.label;
    else if (c.kind === 'range') PLAYABLE.push([c.key, `${sec} · ${c.label}`]);
  }
}
fillPlayable();
const rangeOf = (key: string) => CONTROLS.find((c): c is Extract<Control, { kind: 'range' }> => c.kind === 'range' && c.key === key);
const stage = document.querySelector<HTMLElement>('.stage')!;
// Knobs A–D sit in a row along the bottom, left to right. Each has a touch
// zone (slide up/down) and a wheel combo; its 0–100% ring shows while you
// play it, then fades away. Two-finger drag and pinch get a knob of their own.
type KnobAt = 'a' | 'b' | 'c' | 'd' | 'e' | 'centre';
const KNOB_KEYS: [KnobAt, 'playLeft' | 'playWheel3' | 'playWheel4' | 'playRight' | 'playWheel5'][] = [['a', 'playLeft'], ['b', 'playWheel3'], ['c', 'playWheel4'], ['d', 'playRight'], ['e', 'playWheel5']];
const RING = 2 * Math.PI * 26;
const knobs = {} as Record<KnobAt, { el: HTMLElement; arc: SVGCircleElement; pct: HTMLElement; name: HTMLElement; timer: number }>;
const playRow = document.createElement('div');
playRow.className = 'play-row';
stage.append(playRow);
for (const at of ['a', 'b', 'c', 'd', 'e', 'centre'] as const) {
  const el = document.createElement('div');
  el.className = `knob ${at}`;
  el.innerHTML = `<span></span><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="track" cx="32" cy="32" r="26"/><circle class="arc" cx="32" cy="32" r="26" stroke-dasharray="${RING.toFixed(2)}" transform="rotate(-90 32 32)"/></svg><b></b>`;
  knobs[at] = { el, arc: el.querySelector('.arc')!, pct: el.querySelector('b')!, name: el.querySelector('span')!, timer: 0 };
  if (at === 'centre') stage.append(el);
}
// Draw a knob's ring, % and name (without showing it).
function playPaint(at: KnobAt, key: string) {
  const r = rangeOf(key);
  if (!r) return false;
  const k = knobs[at];
  const share = (playBase(key) - r.min) / (r.max - r.min);
  k.arc.style.strokeDashoffset = (RING * (1 - share)).toFixed(2);
  k.pct.textContent = `${Math.round(share * 100)}%`;
  k.name.textContent = r.label;
  return true;
}
function playShow(key: string) {
  const at: KnobAt = KNOB_KEYS.find(([, sk]) => settings[sk] === key)?.[0] ?? 'centre';
  if (!playPaint(at, key)) return;
  const k = knobs[at];
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
  if (playDirty.size) changed(new Set(playDirty));
  playDirty.clear();
}
// Set a setting from play: the engine sees it at once, the rest next frame.
function playSet(key: string, raw: number) {
  const r = rangeOf(key);
  if (!r) return;
  raw = Math.max(r.min, Math.min(r.max, raw));
  playRaw[key] = raw;
  const v = Number((Math.round(raw / r.step) * r.step).toFixed(6));
  if (settings[r.key] !== v) {
    (settings as unknown as Record<string, number>)[r.key] = v;
    playDirty.add(r.key);
    playFrame ||= requestAnimationFrame(playFlush);
  }
  playShow(key);
}
// The value play works from: its own if still in step with the setting.
function playBase(key: string) {
  const r = rangeOf(key);
  if (!r) return 0;
  const v = settings[r.key] as number;
  const raw = playRaw[key];
  return raw !== undefined && Math.abs(raw - v) <= r.step ? raw : v;
}
// Move a setting by a share of its range (0..1 of min→max).
function playNudge(key: string, from: number, share: number) {
  const r = rangeOf(key);
  if (r) playSet(key, from + share * (r.max - r.min));
}
for (const [at, sk] of KNOB_KEYS) {
  const f = document.createElement('div');
  f.className = `fader ${at}`;
  f.append(knobs[at].el);
  const key = () => settings[sk];
  let start: { y: number; v: number } | null = null;
  f.addEventListener('pointerdown', (e) => {
    f.setPointerCapture(e.pointerId);
    start = { y: e.clientY, v: playBase(key()) };
    playShow(key());
  });
  f.addEventListener('pointermove', (e) => {
    if (!start) return;
    playNudge(key(), start.v, (start.y - e.clientY) / Math.max(200, stage.clientHeight * 0.32));
  });
  const end = () => {
    start = null;
  };
  f.addEventListener('pointerup', end);
  f.addEventListener('pointercancel', end);
  // Keep the knob drawn with its current value, so hovering the row can
  // reveal all of them at once.
  const sync = () => {
    f.hidden = !settings.playOn || !rangeOf(key());
    if (!f.hidden) playPaint(at, key());
  };
  refreshers.push(sync);
  sync();
  playRow.append(f);
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
  if (settings.playOn && playTouch.size === 2) {
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
    if (t?.closest?.('#panel, #toggle')) return;
    if (!settings.playOn) return;
    e.preventDefault();
    const S = settings;
    const key = !e.shiftKey ? (e.altKey ? S.playWheel5 : S.playLeft) : e.metaKey || e.ctrlKey ? S.playWheel3 : e.altKey ? S.playWheel4 : S.playRight;
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
  // The floating shuffle button only shows while the drawer is closed.
  document.body.classList.toggle('panel-open', !collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.title = collapsed ? 'Show controls (H)' : 'Hide controls (H)';
  toggle.textContent = collapsed ? '⟨' : '⟩';
  requestAnimationFrame(resize);
});
// In X-Frame, only one layer's options panel is open at a time.
xframe.panel({ element: panel, isOpen: () => !panel.classList.contains('collapsed'), close: () => toggle.click() });

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
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
  else if (k === 'h') toggle.click();
  else if (k === 'i') toggleDebug();
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
    ['Explode', ICONS.explode, explode],
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
    clearTimeout(idle);
    idle = window.setTimeout(() => fab.classList.add('idle'), 3000);
  };
  window.addEventListener('pointerdown', wake, { capture: true, passive: true });
  wake();
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
  showTab(TABS.some(([t]) => t === saved) ? (saved as Tab) : 'presets');
  syncTabDots();
}
resize();
refresh();
presetFromUrl(true);
playEntrance();
if (camWanted() && !cam.on) void startCamera();
window.addEventListener('hashchange', () => presetFromUrl(false));
requestAnimationFrame(frame);
