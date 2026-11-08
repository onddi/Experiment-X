import './style.css';

// --- settings ----------------------------------------------------------------

type PointerMode = 'repel' | 'attract' | 'vortex' | 'none';
type ClickMode = 'gather' | 'ripple' | 'implode' | 'emit' | 'shockwave' | 'none';
type Render = 'dots' | 'streaks' | 'links';
type ColorBy = 'palette' | 'speed' | 'direction' | 'pointer' | 'horizontal' | 'vertical' | 'radial' | 'cycle';
type Palette = keyof typeof PALETTES;

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
} satisfies Record<string, PaletteDef>;


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
};

const STORAGE_KEY = 'particle-field:settings';
const settings: Settings = { ...DEFAULTS, ...load() };
if (!(settings.palette in PALETTES)) settings.palette = DEFAULTS.palette;

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
let n = 0;

let w = 0;
let h = 0;
let t = 0;
let paused = false;

function ensureCount() {
  const want = settings.count;
  if (want > cap) {
    const grow = (a: Float32Array) => {
      const b = new Float32Array(want);
      b.set(a.subarray(0, n));
      return b;
    };
    [px, py, vx, vy, ox, oy, tone] = [px, py, vx, vy, ox, oy, tone].map(grow);
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
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  const [r, g, b] = PALETTES[settings.palette].bg;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  ctx.fillRect(0, 0, w, h);
  document.body.style.background = `rgb(${r} ${g} ${b})`;
}

// --- pointer -----------------------------------------------------------------

const pointer = { x: -1e4, y: -1e4, active: false, down: false };

// Rings travel out (shockwave, ripple) or in (implode) from a click.
type WaveKind = 'shockwave' | 'ripple' | 'implode';
const waves: { kind: WaveKind; x: number; y: number; r: number; life: number }[] = [];

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
  if (c === 'shockwave' || c === 'ripple') waves.push({ kind: c, x: e.offsetX, y: e.offsetY, r: 0, life: 1 });
  if (c === 'implode') waves.push({ kind: c, x: e.offsetX, y: e.offsetY, r: implodeStart(), life: 1 });
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
      wv.r = Math.max(0, wv.r - 7 * dt);
      wv.life = Math.min(1, wv.r / 60 + 0.05) - (wv.r === 0 ? 1 : 0);
    } else {
      wv.r += (wv.kind === 'ripple' ? 14 : 9) * dt;
      wv.life -= (wv.kind === 'ripple' ? 0.015 : 0.025) * dt;
    }
  }
  const cf = settings.clickForce;
  const gathering = pointer.down && settings.click === 'gather';
  const gatherR = Math.max(150, radius * 2.5);
  if (pointer.down && settings.click === 'emit') emit(dt);
  // Hover behaviour pauses while gathering so the two don't fight.
  const usePointer = pointer.active && pointerMode !== 'none' && !gathering;
  for (let k = waves.length - 1; k >= 0; k--) if (waves[k].life <= 0) waves.splice(k, 1);

  for (let i = 0; i < n; i++) {
    let ax = (Math.random() - 0.5) * jitter;
    let ay = (Math.random() - 0.5) * jitter;

    if (flow > 0) {
      const a = flowAngle(px[i], py[i]);
      ax += Math.cos(a) * flow * 0.05;
      ay += Math.sin(a) * flow * 0.05;
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
      const dx = px[i] - pointer.x;
      const dy = py[i] - pointer.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      if (d < gatherR) {
        const f = (1 - d / gatherR) * cf;
        const nx = dx / d;
        const ny = dy / d;
        const pull = Math.min(1, d / 30); // ease off at the core
        // Extra drag inside the well keeps the orb dense instead of a ring.
        ax += (-nx * 1.2 * pull - ny * 0.3) * f - vx[i] * 0.08 * f;
        ay += (-ny * 1.2 * pull + nx * 0.3) * f - vy[i] * 0.08 * f;
      }
    }

    for (const wv of waves) {
      const dx = px[i] - wv.x;
      const dy = py[i] - wv.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const off = d - wv.r;
      const band = wv.kind === 'ripple' ? 50 : 40;
      if (Math.abs(off) < band) {
        let f: number;
        if (wv.kind === 'ripple') {
          // Push ahead of the ring, pull behind it: particles bob as it
          // passes and settle back near where they were.
          f = Math.sin((off / band) * Math.PI) * wv.life * 0.9;
        } else if (wv.kind === 'implode') {
          f = -(1 - Math.abs(off) / band) * wv.life * 1.4;
        } else {
          f = (1 - Math.abs(off) / band) * wv.life * 2.2;
        }
        f *= cf;
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }
    }

    vx[i] = (vx[i] + ax * dt) * Math.pow(damp, dt);
    vy[i] = (vy[i] + ay * dt) * Math.pow(damp, dt);
    ox[i] = px[i];
    oy[i] = py[i];
    px[i] += vx[i] * speed * dt;
    py[i] += vy[i] * speed * dt;

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
  const stops = PALETTES[settings.palette].stops;
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
  return (PALETTES[settings.palette] as PaletteDef).cyclic ? u : 1 - Math.abs(u * 2 - 1);
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
    default:
      u = tone[i];
  }
  return Math.max(0, Math.min(SHADES - 1, (u * SHADES) | 0));
}

// Buckets let us draw every particle of one colour in a single path.
const buckets: number[][] = Array.from({ length: SHADES }, () => []);

function draw() {
  const [r, g, b] = PALETTES[settings.palette].bg;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgb(${r} ${g} ${b} / ${(1 - settings.trail * 0.97).toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = settings.glow ? 'lighter' : 'source-over';

  if (settings.colorBy === 'speed') {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.hypot(vx[i], vy[i]);
    meanSpeed = meanSpeed * 0.9 + (sum / Math.max(1, n)) * 0.1;
  }
  for (const bk of buckets) bk.length = 0;
  for (let i = 0; i < n; i++) buckets[shadeIndex(i)].push(i);

  if (settings.render === 'links') drawLinks();

  const s = settings.size;
  for (let k = 0; k < SHADES; k++) {
    const list = buckets[k];
    if (!list.length) continue;
    if (settings.render === 'streaks') {
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

  // Wave rings.
  ctx.globalCompositeOperation = 'source-over';
  for (const wv of waves) {
    if (wv.life <= 0) continue;
    const a = wv.life * (wv.kind === 'ripple' ? 0.12 : 0.25);
    ctx.strokeStyle = `rgb(255 255 255 / ${a.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(wv.x, wv.y, wv.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Spatial hash: only compare particles in neighbouring cells.
const LINK_LEVELS = 4;
const linkPaths: Path2D[] = [];
const cellHead = new Map<number, number>();
let cellNext = new Int32Array(0);

function drawLinks() {
  const d = settings.linkDist;
  const d2max = d * d;
  const cols = Math.ceil(w / d) + 1;
  if (cellNext.length < n) cellNext = new Int32Array(cap);
  cellHead.clear();
  for (let i = 0; i < n; i++) {
    const key = ((py[i] / d) | 0) * cols + ((px[i] / d) | 0);
    cellNext[i] = cellHead.get(key) ?? -1;
    cellHead.set(key, i);
  }
  for (let l = 0; l < LINK_LEVELS; l++) linkPaths[l] = new Path2D();

  // Cap total segments so dense fields stay interactive.
  let budget = 12000;
  for (let i = 0; i < n && budget > 0; i++) {
    const cx = (px[i] / d) | 0;
    const cy = (py[i] / d) | 0;
    for (let oy2 = 0; oy2 <= 1; oy2++) {
      for (let ox2 = -1; ox2 <= 1; ox2++) {
        if (oy2 === 0 && ox2 < 0) continue; // half-neighbourhood: each pair once
        let j = cellHead.get((cy + oy2) * cols + (cx + ox2)) ?? -1;
        while (j !== -1) {
          if (j > i || oy2 > 0 || ox2 > 0) {
            const dx = px[j] - px[i];
            const dy = py[j] - py[i];
            const dd = dx * dx + dy * dy;
            if (dd < d2max && j !== i) {
              const level = Math.min(LINK_LEVELS - 1, ((1 - Math.sqrt(dd) / d) * LINK_LEVELS) | 0);
              linkPaths[level].moveTo(px[i], py[i]);
              linkPaths[level].lineTo(px[j], py[j]);
              budget--;
            }
          }
          j = cellNext[j];
        }
      }
    }
  }

  const stops = PALETTES[settings.palette].stops;
  const [hh, ss, ll] = stops[Math.floor(stops.length / 2)];
  ctx.lineWidth = 0.7;
  for (let l = 0; l < LINK_LEVELS; l++) {
    ctx.strokeStyle = `hsl(${hh} ${ss}% ${ll}% / ${(((l + 1) / LINK_LEVELS) * 0.35).toFixed(3)})`;
    ctx.stroke(linkPaths[l]);
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
  if (!paused) {
    step(dt);
    draw();
  }
  requestAnimationFrame(frame);
}

// --- controls ----------------------------------------------------------------

type Control = ControlBody & { show?: () => boolean };
type ControlBody =
  | { kind: 'section'; id: string; label: string; open?: boolean; summary?: () => string }
  | { kind: 'sub'; label: string }
  | { kind: 'range'; key: keyof Settings; label: string; min: number; max: number; step: number; format?: (v: number) => string }
  | { kind: 'select'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'toggle'; key: keyof Settings; label: string }
  | { kind: 'buttons'; buttons: [string, () => void][] }
  | { kind: 'swatch' };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const label = (options: [string, string][], v: unknown) => options.find(([k]) => k === v)?.[1] ?? '';

const POINTER_MODES: [string, string][] = [['repel', 'Repel'], ['attract', 'Attract'], ['vortex', 'Vortex'], ['none', 'Off']];
const CLICK_MODES: [string, string][] = [['gather', 'Gather (hold)'], ['emit', 'Fountain (hold)'], ['ripple', 'Ripple'], ['implode', 'Implode'], ['shockwave', 'Shockwave'], ['none', 'Nothing']];
const RENDERS: [string, string][] = [['dots', 'Dots'], ['streaks', 'Streaks'], ['links', 'Constellation']];
const COLOR_BY: [string, string][] = [['palette', 'Random'], ['speed', 'Speed'], ['direction', 'Heading'], ['pointer', 'Pointer heat'], ['cycle', 'Colour waves'], ['horizontal', 'Left → right'], ['vertical', 'Bottom → top'], ['radial', 'Centre glow']];

const hasFlow = () => settings.flow > 0;
const hasPointer = () => settings.pointerMode !== 'none';
const hasClick = () => settings.click !== 'none';

const CONTROLS: Control[] = [
  { kind: 'section', id: 'presets', label: 'Presets', open: true },
  { kind: 'buttons', buttons: [] }, // filled with presets below

  { kind: 'section', id: 'particles', label: 'Particles', open: true,
    summary: () => `${settings.count.toLocaleString()}, ${settings.speed.toFixed(1)}× speed` },
  { kind: 'range', key: 'count', label: 'Count', min: 100, max: 8000, step: 100 },
  { kind: 'range', key: 'size', label: 'Size', min: 0.5, max: 6, step: 0.1, format: (v) => `${v.toFixed(1)}px` },
  { kind: 'range', key: 'speed', label: 'Speed', min: 0.1, max: 4, step: 0.1, format: (v) => `${v.toFixed(1)}×` },
  { kind: 'range', key: 'friction', label: 'Friction', min: 0, max: 0.2, step: 0.005, format: pct },
  { kind: 'range', key: 'jitter', label: 'Jitter', min: 0, max: 0.5, step: 0.01, format: (v) => v.toFixed(2) },

  { kind: 'section', id: 'flow', label: 'Flow',
    summary: () => (hasFlow() ? `strength ${settings.flow.toFixed(2)}` : 'off') },
  { kind: 'range', key: 'flow', label: 'Strength', min: 0, max: 2, step: 0.05, format: (v) => (v === 0 ? 'off' : v.toFixed(2)) },
  { kind: 'range', key: 'flowScale', label: 'Scale', min: 0.001, max: 0.02, step: 0.0005, format: (v) => (v * 1000).toFixed(1), show: hasFlow },
  { kind: 'range', key: 'flowSpeed', label: 'Turning', min: 0, max: 2, step: 0.05, format: (v) => v.toFixed(2), show: hasFlow },

  { kind: 'section', id: 'pointer', label: 'Pointer',
    summary: () => label(POINTER_MODES, settings.pointerMode) + (hasPointer() ? `, ${settings.radius}px` : '') },
  { kind: 'select', key: 'pointerMode', label: 'On hover', options: POINTER_MODES },
  { kind: 'range', key: 'radius', label: 'Radius', min: 20, max: 400, step: 5, format: (v) => `${v}px`, show: hasPointer },
  { kind: 'range', key: 'force', label: 'Force', min: 0.05, max: 2, step: 0.05, format: (v) => v.toFixed(2), show: hasPointer },

  { kind: 'section', id: 'click', label: 'Click', summary: () => label(CLICK_MODES, settings.click) },
  { kind: 'select', key: 'click', label: 'On click', options: CLICK_MODES },
  { kind: 'range', key: 'clickForce', label: 'Strength', min: 0.2, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×`, show: hasClick },

  { kind: 'section', id: 'look', label: 'Look', open: true,
    summary: () => `${label(RENDERS, settings.render)}, ${(PALETTES[settings.palette] as PaletteDef).label}` },
  { kind: 'select', key: 'render', label: 'Style', options: RENDERS },
  { kind: 'range', key: 'linkDist', label: 'Link distance', min: 20, max: 160, step: 5, format: (v) => `${v}px`, show: () => settings.render === 'links' },
  { kind: 'range', key: 'trail', label: 'Trails', min: 0, max: 1, step: 0.01, format: pct },
  { kind: 'toggle', key: 'glow', label: 'Additive glow' },
  { kind: 'sub', label: 'Colour' },
  { kind: 'select', key: 'palette', label: 'Palette', options: Object.entries(PALETTES).map(([k, p]) => [k, p.label]) },
  { kind: 'swatch' },
  { kind: 'select', key: 'colorBy', label: 'Colour by', options: COLOR_BY },

  { kind: 'section', id: 'actions', label: 'Actions', open: true },
  {
    kind: 'buttons',
    buttons: [
      ['Pause', togglePause],
      ['Clear', clear],
      ['Scatter', scatter],
      ['Shuffle', shuffle],
      ['Reset', reset],
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

function apply(p: Partial<Settings>) {
  Object.assign(settings, DEFAULTS, p);
  changed(new Set(Object.keys(DEFAULTS) as (keyof Settings)[]));
}

function changed(keys: Set<keyof Settings>) {
  save();
  if (keys.has('count')) {
    n = Math.min(n, settings.count);
    ensureCount();
  }
  if (keys.has('palette')) {
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
      section.append(head, body);
      controls.append(section);

      const setOpen = (open: boolean) => {
        section.classList.toggle('closed', !open);
        head.setAttribute('aria-expanded', String(open));
      };
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

    if (ctl.kind === 'sub') {
      const h = document.createElement('h3');
      h.textContent = ctl.label;
      body.append(h);
      if (ctl.show) conditional.push([h, ctl.show]);
      continue;
    }

    if (ctl.kind === 'swatch') {
      const sw = document.createElement('div');
      sw.className = 'swatch';
      body.append(sw);
      refreshers.push(() => {
        const p = PALETTES[settings.palette] as PaletteDef;
        const cols = p.stops.map(([hh, ss, ll]) => `hsl(${hh} ${ss}% ${ll}%)`).join(', ');
        sw.style.background = `linear-gradient(90deg, ${cols})`;
      });
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
        if (text === 'Pause') pauseButton = b;
        row.append(b);
      }
      body.append(row);
      continue;
    }

    const row = document.createElement('label');
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
  keys.textContent = 'Click or hold on the field. Keys: Space pause · C clear · S scatter · R shuffle · H hide panel.';
  controls.append(keys);
}

const statsEl = () => document.getElementById('stats');
setInterval(() => {
  const el = statsEl();
  if (el) el.textContent = `${n.toLocaleString()} particles · ${paused ? 'paused' : `${Math.round(fps)} fps`}`;
}, 500);

function togglePause() {
  paused = !paused;
  if (pauseButton) pauseButton.textContent = paused ? 'Play' : 'Pause';
}

function scatter() {
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
  apply({
    count: rand(600, 4000, 100),
    size: rand(0.8, 2.6, 0.1),
    speed: rand(0.6, 2, 0.1),
    friction: rand(0.02, 0.08, 0.005),
    jitter: rand(0, 0.15, 0.01),
    flow: rand(0.2, 1.6, 0.05),
    flowScale: rand(0.002, 0.012, 0.0005),
    flowSpeed: rand(0.05, 1, 0.05),
    pointerMode: pick(['repel', 'attract', 'vortex'] as const),
    click: pick(['gather', 'emit', 'ripple', 'implode', 'shockwave'] as const),
    radius: rand(80, 260, 5),
    force: rand(0.3, 1.4, 0.05),
    render: pick(['dots', 'streaks', 'streaks', 'links'] as const),
    linkDist: rand(50, 100, 5),
    trail: rand(0.5, 0.95, 0.01),
    glow: Math.random() < 0.6,
    palette: pick(Object.keys(PALETTES) as Palette[]),
    colorBy: pick(['palette', 'speed', 'direction', 'pointer', 'cycle', 'horizontal', 'radial'] as const),
  });
}

function reset() {
  apply({});
}

// --- panel toggle & keys -----------------------------------------------------

const panel = document.getElementById('panel')!;
const toggle = document.getElementById('toggle')!;
toggle.addEventListener('click', () => {
  const collapsed = panel.classList.toggle('collapsed');
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
  else if (k === 's') scatter();
  else if (k === 'r') shuffle();
  else if (k === 'h') toggle.click();
});

new ResizeObserver(() => resize()).observe(canvas);
if (window.innerWidth < 720) toggle.click();

buildShades();
renderControls();
resize();
refresh();
requestAnimationFrame(frame);
