import './style.css';
import { Carousel, type Axis, type CarouselItem, type Effect } from './carousel.ts';
import { randomWord } from './words.ts';
import { STYLES, themeFor } from './themes.ts';

// --- settings ----------------------------------------------------------------

type Direction = 'x' | 'y' | 'alternate' | 'random';
type Link = 'none' | 'row' | 'column' | 'all';

interface Settings {
  rows: number;
  cols: number;
  aspect: number;
  fill: boolean;
  hero: boolean;
  heroRows: number;
  heroCustom: boolean;
  heroDirection: Axis;
  heroEffect: Effect;
  heroLoop: boolean;
  heroItems: number;
  heroTension: number;
  heroFlick: number;
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
  surface: 'colors' | 'four-elements';
  harmony: number;
  evenExposure: number;
  gradeHue: number;
  vignette: number;
  labels: boolean;
  imageMode: 'per-cell' | 'cycle';
  heroDrives: boolean;
  imageStyle: string;
  wave: number;
}

const DEFAULTS: Settings = {
  rows: 3,
  cols: 4,
  aspect: 1,
  fill: false,
  hero: false,
  heroRows: 1,
  heroCustom: false,
  heroDirection: 'x',
  heroEffect: 'slide',
  heroLoop: true,
  heroItems: 8,
  heroTension: 120,
  heroFlick: 0.25,
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
  surface: 'colors',
  harmony: 0.35,
  evenExposure: 0.5,
  gradeHue: 45,
  vignette: 0.35,
  labels: false,
  imageMode: 'per-cell',
  heroDrives: true,
  imageStyle: 'photo',
  wave: 0,
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
const STRUCTURAL = new Set<keyof Settings>([
  'rows', 'cols', 'items', 'direction', 'loop',
  'hero', 'heroCustom', 'heroDirection', 'heroLoop', 'heroItems',
]);

// The optional main carousel sits above the grid as row -1 and spans every column.
const HERO = -1;
const COLOR = new Set<keyof Settings>([
  'hueShift', 'chroma', 'lightness', 'colorMode', 'surface', 'evenExposure', 'labels', 'imageMode', 'heroDrives', 'imageStyle',
]);

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

/** Settings for one carousel: the main carousel can override the grid's. */
/** Smallest multiple of n that is at least v (so every element repeats evenly). */
function roundUpTo(v: number, n: number) {
  return Math.ceil(v / n) * n;
}

/**
 * Cycling cells (and a main row that drives them) hold a whole number of
 * element rounds, so stepping past the end never skips or repeats an element.
 */
function itemCount(r: number, wanted: number) {
  if (settings.surface === 'colors') return wanted;
  const n = theme().groups.length;
  if (r === HERO ? heroDrives() : cycling()) return roundUpTo(wanted, n);
  return wanted;
}

function carouselOpts(r: number) {
  const own = r === HERO && settings.heroCustom;
  return {
    // Cycling cells need at least one item per element.
    items: itemCount(r, own ? settings.heroItems : settings.items),
    effect: own ? settings.heroEffect : settings.effect,
    loop: own ? settings.heroLoop : settings.loop,
    physics: own
      ? { tension: settings.heroTension, flick: settings.heroFlick }
      : { tension: settings.tension, flick: settings.flick },
  };
}

/** The image set in use (same elements, different look). */
const theme = () => themeFor(settings.imageStyle);

/** Main row drives the grid: only on image surfaces with the main row shown. */
const heroDrives = () => settings.surface !== 'colors' && settings.hero && settings.heroDrives;

/** Cells step through every element (needed when the main row drives them). */
const cycling = () => settings.imageMode === 'cycle' || heroDrives();

// Changing the seed reshuffles which photo each cell picks in cycle mode.
let imageSeed = 1;

/** Small deterministic hash so picks stay put until the seed changes. */
function hash(...xs: number[]) {
  let h = 2166136261 ^ imageSeed;
  for (const x of xs) h = Math.imul(h ^ (x + 0x9e3779b9), 16777619);
  return (h ^ (h >>> 15)) >>> 0;
}

function imageItemsFor(r: number, c: number): CarouselItem[] {
  const theme = themeFor(settings.imageStyle);
  const groups = theme.groups;
  const out: CarouselItem[] = [];
  const cellIndex = r === HERO ? 0 : r * settings.cols + c;
  const count = carouselOpts(r).items;
  for (let i = 0; i < count; i++) {
    let g: number;
    let n: number;
    if (r === HERO) {
      // The main carousel steps through the groups: one item per element.
      g = i % groups.length;
      n = Math.floor(i / groups.length);
    } else if (cycling()) {
      // Every cell steps through the groups in the same order, so cells that
      // sit on the same index show the same element and the grid matches.
      // Each cell gets a shuffled photo of that element; the 3/2 column/row
      // steps keep neighbours (also diagonal) from repeating the same photo.
      g = i % groups.length;
      n = hash(g) + c * 3 + r * 2 + Math.floor(i / groups.length);
    } else {
      // Neighbours (left/right and up/down) always get different groups, and
      // cells of the same group start at different photos.
      g = (c + 2 * r) % groups.length;
      n = Math.floor(cellIndex / groups.length) * 3 + i;
    }
    const group = groups[g];
    const img = group.images[n % group.images.length];
    // Pull every photo part of the way towards the same mean brightness.
    const exposure = Math.pow(105 / Math.max(img.lum, 15), settings.evenExposure * 0.45);
    out.push({
      word: settings.labels ? group.name : '',
      color: '#111',
      ink: '#fff',
      image: img.url,
      exposure: Math.min(1.6, Math.max(0.7, exposure)),
    });
  }
  return out;
}

function itemsFor(r: number, c: number): CarouselItem[] {
  if (settings.surface !== 'colors') return imageItemsFor(r, c);
  const out: CarouselItem[] = [];
  // The main carousel takes the color slots after the last grid cell.
  const cellIndex = r === HERO ? settings.rows * settings.cols : r * settings.cols + c;
  const count = carouselOpts(r).items;
  for (let i = 0; i < count; i++) {
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
  if (settings.hero) {
    const o = carouselOpts(HERO);
    const axis = settings.heroCustom ? settings.heroDirection : axisFor(0, 0);
    const carousel = new Carousel(itemsFor(HERO, HERO), axis, o.loop, o.effect, o.physics);
    carousel.el.classList.add('hero');
    carousel.jumpTo(Math.min(prev.get(`${HERO},${HERO}`) ?? 0, o.items - 1));
    carousel.linked = () => linkedTo(HERO, HERO);
    // When the main row lands on a new element, send the grid to it.
    const groupCount = () => (settings.surface === 'colors' ? 4 : theme().groups.length);
    let lastGroup = carousel.index % groupCount();
    let lastStep = Math.round(carousel.pos);
    carousel.onMove = (c) => {
      const n = groupCount();
      if (!heroDrives()) {
        lastGroup = c.index % n;
        lastStep = Math.round(c.pos);
        return;
      }
      const g = c.index % n;
      const step = Math.round(c.pos);
      if (g !== lastGroup) {
        // Turn every cell by the same number of elements, in the direction the
        // main row moved, so the whole grid rotates in lockstep.
        let dg = (((g - lastGroup) % n) + n) % n;
        const dir = Math.sign(step - lastStep) || 1;
        if (dg > n / 2 || (dg === n / 2 && dir < 0)) dg -= n;
        driveGridBy(dg, g);
      }
      lastGroup = g;
      lastStep = step;
    };
    grid.append(carousel.el);
    cells.push({ r: HERO, c: HERO, carousel });
  }
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
  syncToHero();
}

function linkedTo(r: number, c: number) {
  return cells
    .filter((x) => {
      if (x.r === r && x.c === c) return false;
      // The main carousel stays independent of linked drags for now.
      if (r === HERO || x.r === HERO) return false;
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
  s.setProperty('--harmony', String(settings.harmony));
  s.setProperty('--grade', `oklch(62% 0.13 ${settings.gradeHue})`);
  s.setProperty('--vignette', String(settings.vignette));
  grid.classList.toggle('show-dots', settings.dots);
  grid.dataset.surface = settings.surface;
  for (const x of cells) {
    const o = carouselOpts(x.r);
    x.carousel.setPhysics(o.physics);
    x.carousel.setEffect(o.effect);
  }
  const hero = cells.find((x) => x.r === HERO);
  hero?.carousel.el.style.setProperty('grid-row', `span ${settings.heroRows}`);
}

/** Line the grid up with the main row's element straight away. */
function syncToHero() {
  const hero = cells.find((x) => x.r === HERO);
  if (!hero || !heroDrives()) return;
  jumpGridTo(hero.carousel.index % theme().groups.length);
}

function recolor() {
  for (const x of cells) x.carousel.setItems(itemsFor(x.r, x.c));
  syncToHero();
}

/** Fit rows × cols cells of the chosen aspect ratio inside the stage. */
function layout() {
  const { cols, gap, aspect, padding } = settings;
  // The main carousel is laid out as one extra row of the same height.
  const rows = settings.rows + (settings.hero ? settings.heroRows : 0);
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
  // The main carousel is a wide box, so its cube turns around its own centre.
  const hero = cells.find((x) => x.r === HERO);
  const heroW = w * cols + gap * (cols - 1);
  const heroH = h * settings.heroRows + gap * (settings.heroRows - 1);
  hero?.carousel.el.style.setProperty('--half-w', `${heroW / 2}px`);
  hero?.carousel.el.style.setProperty('--half-h', `${heroH / 2}px`);
  hero?.carousel.el.style.setProperty('--persp-base', `${Math.max(heroW, heroH)}px`);
}

new ResizeObserver(layout).observe(stage);

// --- controls ----------------------------------------------------------------

type Control = ControlBody & { show?: () => boolean };
type ControlBody =
  | { kind: 'section'; id: string; label: string; open?: boolean; summary?: () => string }
  | { kind: 'sub'; label: string }
  | { kind: 'range'; key: keyof Settings; label: string; min: number; max: number; step: number; format?: (v: number) => string }
  | { kind: 'select'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'toggle'; key: keyof Settings; label: string }
  | { kind: 'chips'; key: keyof Settings; label: string; options: [number, string][] }
  | { kind: 'buttons'; buttons: [string, () => void, (() => boolean)?][] };

const ASPECTS: [number, string][] = [
  [1, '1:1'], [4 / 3, '4:3'], [3 / 4, '3:4'], [16 / 9, '16:9'], [9 / 16, '9:16'], [21 / 9, '21:9'],
];

const isCube = () => settings.effect === 'cube' || (settings.hero && settings.heroCustom && settings.heroEffect === 'cube');
const ownHero = () => settings.hero && settings.heroCustom;
const isImages = () => settings.surface !== 'colors';
const isColors = () => settings.surface === 'colors';
const EFFECTS: [string, string][] = [['slide', 'Slide'], ['depth', 'Depth'], ['fade', 'Fade'], ['cube', '3D cube']];
const label = (options: [string, string][], v: unknown) => options.find(([k]) => k === v)?.[1] ?? '';

const CONTROLS: Control[] = [
  { kind: 'section', id: 'layout', label: 'Layout', open: true,
    summary: () => `${settings.rows} × ${settings.cols}${settings.fill ? ', fill' : `, ${aspectLabel(settings.aspect)}`}` },
  { kind: 'range', key: 'rows', label: 'Rows', min: 1, max: 12, step: 1 },
  { kind: 'range', key: 'cols', label: 'Columns', min: 1, max: 12, step: 1 },
  { kind: 'toggle', key: 'fill', label: 'Stretch to fill the screen' },
  { kind: 'range', key: 'aspect', label: 'Cell aspect', min: 0.33, max: 3, step: 0.01, format: aspectLabel, show: () => !settings.fill },
  { kind: 'chips', key: 'aspect', label: '', options: ASPECTS, show: () => !settings.fill },
  { kind: 'range', key: 'gap', label: 'Gap', min: 0, max: 60, step: 1, format: (v) => `${v}px` },
  { kind: 'range', key: 'padding', label: 'Padding', min: 0, max: 120, step: 1, format: (v) => `${v}px` },
  { kind: 'range', key: 'radius', label: 'Corner radius', min: 0, max: 80, step: 1, format: (v) => `${v}px` },

  { kind: 'section', id: 'carousels', label: 'Carousels', open: true,
    summary: () => `${settings.items} items, ${label(EFFECTS, settings.effect)}` },
  { kind: 'range', key: 'items', label: 'Items each', min: 2, max: 24, step: 1 },
  {
    kind: 'select', key: 'direction', label: 'Drag direction',
    options: [['x', 'Horizontal'], ['y', 'Vertical'], ['alternate', 'Checkerboard'], ['random', 'Random']],
  },
  { kind: 'select', key: 'effect', label: 'Transition', options: EFFECTS },
  {
    kind: 'select', key: 'link', label: 'Linked drag',
    options: [['none', 'Off'], ['row', 'Same row'], ['column', 'Same column'], ['all', 'Whole grid']],
  },
  { kind: 'toggle', key: 'loop', label: 'Loop around' },
  { kind: 'toggle', key: 'dots', label: 'Show dots' },

  { kind: 'section', id: 'cube', label: '3D cube', show: isCube, summary: () => `perspective ${settings.perspective.toFixed(1)}` },
  { kind: 'range', key: 'perspective', label: 'Perspective', min: 1, max: 12, step: 0.1, format: (v) => `${v.toFixed(1)}× cell` },
  { kind: 'range', key: 'pullback', label: 'Pull back while turning', min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2) },
  { kind: 'range', key: 'shade', label: 'Shading', min: 0, max: 0.9, step: 0.01, format: (v) => v.toFixed(2) },

  { kind: 'section', id: 'hero', label: 'Main carousel',
    summary: () => (!settings.hero ? 'off' : settings.heroCustom ? `on, own settings` : 'on') },
  { kind: 'toggle', key: 'hero', label: 'Show main carousel row on top' },
  { kind: 'range', key: 'heroRows', label: 'Height in rows', min: 1, max: 4, step: 1, show: () => settings.hero },
  { kind: 'toggle', key: 'heroCustom', label: 'Use its own carousel settings', show: () => settings.hero },
  { kind: 'sub', label: 'Main carousel settings', show: ownHero },
  { kind: 'select', key: 'heroDirection', label: 'Drag direction', options: [['x', 'Horizontal'], ['y', 'Vertical']], show: ownHero },
  { kind: 'select', key: 'heroEffect', label: 'Transition', options: EFFECTS, show: ownHero },
  { kind: 'range', key: 'heroItems', label: 'Items', min: 2, max: 24, step: 1, show: ownHero },
  { kind: 'toggle', key: 'heroLoop', label: 'Loop around', show: ownHero },
  { kind: 'range', key: 'heroTension', label: 'Snap tension', min: 20, max: 600, step: 5, show: ownHero },
  { kind: 'range', key: 'heroFlick', label: 'Flick carry', min: 0, max: 0.6, step: 0.01, format: (v) => v.toFixed(2), show: ownHero },

  { kind: 'section', id: 'feel', label: 'Feel', summary: () => `tension ${settings.tension}` },
  { kind: 'range', key: 'tension', label: 'Snap tension', min: 20, max: 600, step: 5 },
  { kind: 'range', key: 'flick', label: 'Flick carry', min: 0, max: 0.6, step: 0.01, format: (v) => v.toFixed(2) },

  { kind: 'section', id: 'surface', label: 'Surface', open: true,
    summary: () => (isImages() ? `${theme().title}, ${STYLES.find((x) => x.id === settings.imageStyle)?.title ?? ''}` : 'Colors & words') },
  {
    kind: 'select', key: 'surface', label: 'Show',
    options: [['colors', 'Colors & Latin words'], ['four-elements', 'Images: Four Elements']],
  },
  { kind: 'range', key: 'fontSize', label: 'Text size', min: 40, max: 220, step: 5, format: (v) => `${v}%`,
    show: () => isColors() || settings.labels },
  {
    kind: 'select', key: 'imageStyle', label: 'Image style',
    options: STYLES.map((x) => [x.id, x.title] as [string, string]), show: isImages,
  },
  { kind: 'sub', label: 'Image grading', show: isImages },
  { kind: 'range', key: 'harmony', label: 'Harmony', min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2), show: isImages },
  { kind: 'range', key: 'gradeHue', label: 'Harmony tint', min: 0, max: 360, step: 1, format: (v) => `${v}°`, show: isImages },
  { kind: 'range', key: 'evenExposure', label: 'Even out exposure', min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2), show: isImages },
  { kind: 'range', key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2), show: isImages },
  {
    kind: 'toggle', key: 'heroDrives', label: 'Main row switches the grid’s element',
    show: () => isImages() && settings.hero,
  },
  {
    kind: 'range', key: 'wave', label: 'Wave delay', min: 0, max: 150, step: 5, format: (v) => (v ? `${v}ms` : 'off'),
    show: () => heroDrives(),
  },
  {
    kind: 'select', key: 'imageMode', label: 'Elements', show: () => isImages() && !heroDrives(),
    options: [['per-cell', 'One per cell'], ['cycle', 'Every cell cycles all four']],
  },
  { kind: 'toggle', key: 'labels', label: 'Element labels', show: isImages },
  { kind: 'sub', label: 'Colors', show: isColors },
  { kind: 'select', key: 'colorMode', label: 'Palette', options: [['golden', 'Golden-angle spread'], ['random', 'Random hues']], show: isColors },
  { kind: 'range', key: 'hueShift', label: 'Hue shift', min: 0, max: 360, step: 1, format: (v) => `${v}°`, show: isColors },
  { kind: 'range', key: 'chroma', label: 'Saturation', min: 0, max: 0.3, step: 0.005, format: (v) => v.toFixed(3), show: isColors },
  { kind: 'range', key: 'lightness', label: 'Lightness', min: 20, max: 95, step: 1, format: (v) => `${v}%`, show: isColors },

  { kind: 'section', id: 'actions', label: 'Actions', open: true },
  {
    kind: 'buttons',
    buttons: [
      ['New words', () => { words.clear(); recolor(); }, isColors],
      ['New colors', () => { randomHues.clear(); set('colorMode', 'random'); }, isColors],
      ['New images', () => { imageSeed++; recolor(); }, () => isImages() && cycling()],
      ['Scramble', scramble],
      ['Match grid', matchAll],
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

const conditional: [HTMLElement, () => boolean][] = [];

function refresh() {
  for (const r of refreshers) r();
  for (const [el, show] of conditional) el.hidden = !show();
}

const COLLAPSE_KEY = 'carousel-grid:collapsed';

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

    if (ctl.kind === 'buttons') {
      const row = document.createElement('div');
      row.className = 'buttons';
      for (const [text, fn, show] of ctl.buttons) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', fn);
        row.append(b);
        if (show) conditional.push([b, show]);
      }
      body.append(row);
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
    body.append(row);
    if (ctl.show) conditional.push([row, ctl.show]);
  }

  const stats = document.createElement('p');
  stats.className = 'stats';
  stats.id = 'stats';
  controls.append(stats);
}

function updateStats() {
  const el = document.getElementById('stats');
  if (!el) return;
  const n = settings.rows * settings.cols + (settings.hero ? 1 : 0);
  el.textContent = `${n} carousel${n === 1 ? '' : 's'} · ${n * settings.items} items. Drag a cell, or focus it and use the arrow keys.`;
}

/**
 * Move every grid cell to its nearest item showing group g. Cells ripple out
 * from the top-left so the change reads as a wave rather than a jump.
 */
let waveTimers: number[] = [];

/**
 * Turn every grid cell by dg items (all cells the same amount, from where
 * each is resting or heading). Cell item counts are a multiple of the
 * element count, so dg items is also dg elements and they all land on g.
 */
function driveGridBy(dg: number, g: number) {
  for (const t of waveTimers) clearTimeout(t);
  waveTimers = [];
  const n = theme().groups.length;
  for (const x of cells) {
    if (x.r === HERO) continue;
    const car = x.carousel;
    let target = car.destination + dg;
    // Without looping a cell can't pass its ends; fall back to the nearest match.
    if (!settings.loop && (target < 0 || target > car.count - 1)) target = nearestOf(car, g, n) ?? car.destination;
    // A cell that was off-sync (e.g. dragged by hand) snaps onto the element.
    if (mod(target, n) !== g) target = nearestOf(car, g, n) ?? target;
    const delay = (x.r + x.c) * settings.wave;
    if (delay === 0) car.goTo(target, 0);
    else waveTimers.push(window.setTimeout(() => car.goTo(target, 0), delay));
  }
}

function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}

function nearestOf(car: Carousel, g: number, n: number) {
  const base = car.destination;
  let best: number | null = null;
  for (let t = base - n; t <= base + n; t++) {
    if (mod(t, n) !== g) continue;
    if (!settings.loop && (t < 0 || t > car.count - 1)) continue;
    if (best === null || Math.abs(t - base) < Math.abs(best - base)) best = t;
  }
  return best;
}

/** Snap every grid cell straight to its nearest item showing group g. */
function jumpGridTo(g: number) {
  const n = theme().groups.length;
  for (const x of cells) {
    if (x.r === HERO) continue;
    const t = nearestOf(x.carousel, g, n);
    if (t !== null && t !== x.carousel.destination) x.carousel.jumpTo(t);
  }
}

/** Send every grid carousel to the index of the first one, so all show the same element. */
function matchAll() {
  const grid = cells.filter((x) => x.r !== HERO);
  if (!grid.length) return;
  const target = Math.round(grid[0].carousel.pos);
  for (const x of grid) {
    const p = x.carousel.pos;
    // Shortest way round when looping.
    const n = x.carousel.count;
    let t = target;
    if (settings.loop) t = p + ((((target - p) % n) + n * 1.5) % n) - n / 2;
    x.carousel.goTo(Math.round(t), 0);
  }
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
