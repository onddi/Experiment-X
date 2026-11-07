import './style.css';
import { Carousel, type Axis, type CarouselItem, type Effect } from './carousel.ts';
import { randomWord } from './words.ts';

// --- settings ----------------------------------------------------------------

type Direction = 'x' | 'y' | 'alternate' | 'random';
type Link = 'none' | 'row' | 'column' | 'all';

interface Settings {
  rows: number;
  cols: number;
  aspect: number;
  fill: boolean;
  gap: number;
  radius: number;
  padding: number;
  items: number;
  direction: Direction;
  loop: boolean;
  effect: Effect;
  link: Link;
  tension: number;
  flick: number;
  fontSize: number;
  dots: boolean;
  perspective: number;
  shade: number;
  pullback: number;
  hueShift: number;
  chroma: number;
  lightness: number;
  colorMode: 'golden' | 'random';
}

const DEFAULTS: Settings = {
  rows: 3,
  cols: 4,
  aspect: 1,
  fill: false,
  gap: 12,
  radius: 14,
  padding: 24,
  items: 6,
  direction: 'x',
  loop: true,
  effect: 'slide',
  link: 'none',
  tension: 170,
  flick: 0.18,
  fontSize: 100,
  dots: true,
  perspective: 3,
  shade: 0.35,
  pullback: 0.3,
  hueShift: 20,
  chroma: 0.14,
  lightness: 72,
  colorMode: 'golden',
};

const STORAGE_KEY = 'carousel-grid:settings';
const settings: Settings = { ...DEFAULTS, ...load() };

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

// Settings that change the DOM structure need a rebuild; the rest apply live.
const STRUCTURAL = new Set<keyof Settings>(['rows', 'cols', 'items', 'direction', 'loop']);
const COLOR = new Set<keyof Settings>(['hueShift', 'chroma', 'lightness', 'colorMode']);

// --- content -----------------------------------------------------------------

// Words and random hues are kept per (row, col, item) so resizing the grid
// keeps the content of cells that stay.
const words = new Map<string, string>();
const randomHues = new Map<string, number>();

function key(r: number, c: number, i: number) {
  return `${r},${c},${i}`;
}

function wordFor(k: string) {
  let w = words.get(k);
  if (!w) words.set(k, (w = randomWord()));
  return w;
}

function hueFor(k: string, globalIndex: number) {
  if (settings.colorMode === 'golden') {
    // Golden-angle steps never repeat a hue, so every item gets its own color.
    return (settings.hueShift + globalIndex * 137.508) % 360;
  }
  let h = randomHues.get(k);
  if (h === undefined) randomHues.set(k, (h = Math.random() * 360));
  return (h + settings.hueShift) % 360;
}

function itemsFor(r: number, c: number): CarouselItem[] {
  const out: CarouselItem[] = [];
  const cellIndex = r * settings.cols + c;
  for (let i = 0; i < settings.items; i++) {
    const k = key(r, c, i);
    const hue = hueFor(k, cellIndex * settings.items + i);
    const L = settings.lightness;
    out.push({
      word: wordFor(k),
      color: `oklch(${L}% ${settings.chroma} ${hue.toFixed(1)})`,
      ink: L >= 62 ? 'oklch(22% 0.03 ' + hue.toFixed(1) + ')' : 'oklch(97% 0.02 ' + hue.toFixed(1) + ')',
    });
  }
  return out;
}

function axisFor(r: number, c: number): Axis {
  switch (settings.direction) {
    case 'x':
    case 'y':
      return settings.direction;
    case 'alternate':
      return (r + c) % 2 === 0 ? 'x' : 'y';
    case 'random':
      return Math.random() < 0.5 ? 'x' : 'y';
  }
}

// --- grid --------------------------------------------------------------------

const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="stage" id="stage"><div class="grid" id="grid"></div></main>
  <aside class="panel" id="panel">
    <header>
      <h1>Carousel grid</h1>
      <button class="icon" id="toggle" aria-expanded="true" title="Hide controls">⟩</button>
    </header>
    <div class="panel-body" id="controls"></div>
  </aside>
`;

const stage = document.getElementById('stage')!;
const grid = document.getElementById('grid')!;
let cells: { r: number; c: number; carousel: Carousel }[] = [];

function build() {
  // Keep positions of cells that survive the rebuild.
  const prev = new Map(cells.map((x) => [`${x.r},${x.c}`, x.carousel.index]));
  for (const x of cells) x.carousel.stop();
  grid.replaceChildren();
  cells = [];
  for (let r = 0; r < settings.rows; r++) {
    for (let c = 0; c < settings.cols; c++) {
      const carousel = new Carousel(itemsFor(r, c), axisFor(r, c), settings.loop, settings.effect, physics());
      const start = prev.get(`${r},${c}`) ?? 0;
      carousel.jumpTo(Math.min(start, settings.items - 1));
      carousel.linked = () => linkedTo(r, c);
      grid.append(carousel.el);
      cells.push({ r, c, carousel });
    }
  }
  applyStyle();
  layout();
  updateStats();
}

function linkedTo(r: number, c: number) {
  return cells
    .filter((x) => {
      if (x.r === r && x.c === c) return false;
      switch (settings.link) {
        case 'none': return false;
        case 'row': return x.r === r;
        case 'column': return x.c === c;
        case 'all': return true;
      }
    })
    .map((x) => x.carousel);
}

function physics() {
  return { tension: settings.tension, flick: settings.flick };
}

function applyStyle() {
  const s = grid.style;
  s.setProperty('--gap', `${settings.gap}px`);
  s.setProperty('--radius', `${settings.radius}px`);
  s.setProperty('--font-scale', String(settings.fontSize / 100));
  stage.style.setProperty('--pad', `${settings.padding}px`);
  s.setProperty('--perspective', String(settings.perspective));
  s.setProperty('--shade', String(settings.shade));
  s.setProperty('--pullback', String(settings.pullback));
  grid.classList.toggle('show-dots', settings.dots);
  grid.dataset.effect = settings.effect;
  for (const x of cells) {
    x.carousel.setPhysics(physics());
    x.carousel.setEffect(settings.effect);
  }
}

function recolor() {
  for (const x of cells) x.carousel.setItems(itemsFor(x.r, x.c));
}

/** Fit rows × cols cells of the chosen aspect ratio inside the stage. */
function layout() {
  const { rows, cols, gap, aspect, padding } = settings;
  const availW = Math.max(0, stage.clientWidth - padding * 2 - gap * (cols - 1));
  const availH = Math.max(0, stage.clientHeight - padding * 2 - gap * (rows - 1));
  let w = availW / cols;
  let h = settings.fill ? availH / rows : w / aspect;
  if (!settings.fill && h * rows > availH) {
    h = availH / rows;
    w = h * aspect;
  }
  grid.style.gridTemplateColumns = `repeat(${cols}, ${w}px)`;
  grid.style.gridTemplateRows = `repeat(${rows}, ${h}px)`;
  grid.style.setProperty('--cell', `${Math.min(w, h)}px`);
  grid.style.setProperty('--half-w', `${w / 2}px`);
  grid.style.setProperty('--half-h', `${h / 2}px`);
}

new ResizeObserver(layout).observe(stage);

// --- controls ----------------------------------------------------------------

type Control =
  | { kind: 'section'; label: string }
  | { kind: 'range'; key: keyof Settings; label: string; min: number; max: number; step: number; format?: (v: number) => string }
  | { kind: 'select'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'toggle'; key: keyof Settings; label: string }
  | { kind: 'chips'; key: keyof Settings; label: string; options: [number, string][] }
  | { kind: 'buttons'; buttons: [string, () => void][] };

const ASPECTS: [number, string][] = [
  [1, '1:1'], [4 / 3, '4:3'], [3 / 4, '3:4'], [16 / 9, '16:9'], [9 / 16, '9:16'], [21 / 9, '21:9'],
];

const CONTROLS: Control[] = [
  { kind: 'section', label: 'Grid' },
  { kind: 'range', key: 'rows', label: 'Rows', min: 1, max: 12, step: 1 },
  { kind: 'range', key: 'cols', label: 'Columns', min: 1, max: 12, step: 1 },
  { kind: 'toggle', key: 'fill', label: 'Stretch to fill (no fixed aspect)' },
  { kind: 'range', key: 'aspect', label: 'Cell aspect', min: 0.33, max: 3, step: 0.01, format: aspectLabel },
  { kind: 'chips', key: 'aspect', label: '', options: ASPECTS },
  { kind: 'range', key: 'gap', label: 'Gap', min: 0, max: 60, step: 1, format: (v) => `${v}px` },
  { kind: 'range', key: 'padding', label: 'Padding', min: 0, max: 120, step: 1, format: (v) => `${v}px` },
  { kind: 'range', key: 'radius', label: 'Corner radius', min: 0, max: 80, step: 1, format: (v) => `${v}px` },

  { kind: 'section', label: 'Carousels' },
  { kind: 'range', key: 'items', label: 'Items each', min: 2, max: 24, step: 1 },
  {
    kind: 'select', key: 'direction', label: 'Drag direction',
    options: [['x', 'Horizontal'], ['y', 'Vertical'], ['alternate', 'Checkerboard'], ['random', 'Random']],
  },
  { kind: 'select', key: 'effect', label: 'Transition', options: [['slide', 'Slide'], ['depth', 'Depth'], ['fade', 'Fade'], ['cube', '3D cube']] },
  { kind: 'range', key: 'perspective', label: 'Cube perspective', min: 1, max: 12, step: 0.1, format: (v) => `${v.toFixed(1)}× cell` },
  { kind: 'range', key: 'pullback', label: 'Cube pull-back', min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2) },
  { kind: 'range', key: 'shade', label: 'Cube shading', min: 0, max: 0.9, step: 0.01, format: (v) => v.toFixed(2) },
  {
    kind: 'select', key: 'link', label: 'Linked drag',
    options: [['none', 'Off'], ['row', 'Same row'], ['column', 'Same column'], ['all', 'Whole grid']],
  },
  { kind: 'toggle', key: 'loop', label: 'Loop around' },
  { kind: 'toggle', key: 'dots', label: 'Show dots' },

  { kind: 'section', label: 'Feel' },
  { kind: 'range', key: 'tension', label: 'Snap tension', min: 20, max: 600, step: 5 },
  { kind: 'range', key: 'flick', label: 'Flick carry', min: 0, max: 0.6, step: 0.01, format: (v) => v.toFixed(2) },

  { kind: 'section', label: 'Look' },
  { kind: 'range', key: 'fontSize', label: 'Text size', min: 40, max: 220, step: 5, format: (v) => `${v}%` },
  { kind: 'select', key: 'colorMode', label: 'Colors', options: [['golden', 'Golden-angle spread'], ['random', 'Random hues']] },
  { kind: 'range', key: 'hueShift', label: 'Hue shift', min: 0, max: 360, step: 1, format: (v) => `${v}°` },
  { kind: 'range', key: 'chroma', label: 'Saturation', min: 0, max: 0.3, step: 0.005, format: (v) => v.toFixed(3) },
  { kind: 'range', key: 'lightness', label: 'Lightness', min: 20, max: 95, step: 1, format: (v) => `${v}%` },

  { kind: 'section', label: 'Actions' },
  {
    kind: 'buttons',
    buttons: [
      ['New words', () => { words.clear(); recolor(); }],
      ['New colors', () => { randomHues.clear(); set('colorMode', 'random'); }],
      ['Scramble', scramble],
      ['Reset', reset],
    ],
  },
];

function aspectLabel(v: number) {
  const match = ASPECTS.find(([a]) => Math.abs(a - v) < 0.005);
  return match ? match[1] : `${v.toFixed(2)}:1`;
}

const controls = document.getElementById('controls')!;
const refreshers: (() => void)[] = [];

function set<K extends keyof Settings>(k: K, v: Settings[K]) {
  if (settings[k] === v) return;
  settings[k] = v;
  save();
  if (STRUCTURAL.has(k)) build();
  else if (COLOR.has(k)) recolor();
  else {
    applyStyle();
    layout();
  }
  if (k === 'link') updateStats();
  refresh();
}

function refresh() {
  for (const r of refreshers) r();
  for (const el of controls.querySelectorAll<HTMLElement>('[data-key="aspect"]')) {
    el.classList.toggle('disabled', settings.fill);
  }
}

function renderControls() {
  for (const ctl of CONTROLS) {
    if (ctl.kind === 'section') {
      const h = document.createElement('h2');
      h.textContent = ctl.label;
      controls.append(h);
      continue;
    }

    if (ctl.kind === 'buttons') {
      const row = document.createElement('div');
      row.className = 'buttons';
      for (const [label, fn] of ctl.buttons) {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', fn);
        row.append(b);
      }
      controls.append(row);
      continue;
    }

    const row = document.createElement(ctl.kind === 'chips' ? 'div' : 'label');
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
      for (const [value, label] of ctl.options) select.add(new Option(label, value));
      select.addEventListener('change', () => set(k, select.value as never));
      row.append(select);
      refreshers.push(() => (select.value = String(settings[k])));
    } else if (ctl.kind === 'toggle') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => set(k, input.checked as never));
      row.prepend(input);
      refreshers.push(() => (input.checked = Boolean(settings[k])));
    } else if (ctl.kind === 'chips') {
      row.classList.add('bare');
      const wrap = document.createElement('div');
      wrap.className = 'chips';
      for (const [value, label] of ctl.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          set(k, value as never);
        });
        wrap.append(b);
        refreshers.push(() => b.classList.toggle('on', Math.abs((settings[k] as number) - value) < 0.005));
      }
      row.append(wrap);
    }
    controls.append(row);
  }

  const stats = document.createElement('p');
  stats.className = 'stats';
  stats.id = 'stats';
  controls.append(stats);
}

function updateStats() {
  const el = document.getElementById('stats');
  if (!el) return;
  const n = settings.rows * settings.cols;
  el.textContent = `${n} carousel${n === 1 ? '' : 's'} · ${n * settings.items} items. Drag a cell, or focus it and use the arrow keys.`;
}

function scramble() {
  for (const x of cells) x.carousel.goTo(Math.round(x.carousel.pos) + Math.floor(Math.random() * settings.items) - Math.floor(settings.items / 2), 0);
}

function reset() {
  Object.assign(settings, DEFAULTS);
  save();
  for (const x of cells) x.carousel.stop();
  cells = [];
  build();
  recolor();
  refresh();
}

// --- panel toggle --------------------------------------------------------------

const panel = document.getElementById('panel')!;
const toggle = document.getElementById('toggle')!;
toggle.addEventListener('click', () => {
  const collapsed = panel.classList.toggle('collapsed');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.title = collapsed ? 'Show controls' : 'Hide controls';
  toggle.textContent = collapsed ? '⟨' : '⟩';
});
if (window.innerWidth < 720) toggle.click();

renderControls();
build();
refresh();
