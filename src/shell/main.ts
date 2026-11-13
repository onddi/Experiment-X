import './shell.css';
import { experiments, type Experiment } from './experiments.ts';
import { busStats, dropFrame, dropPublisher, handleBusMessage, hasSubscribers, lastFrom, lastValue, setSlugResolver, shellPublish, shellSubscribe } from './bus.ts';
import {
  BLENDS, PLACEMENTS, inputLayer, layout, newLayer, parseHash, toHash,
  type Layer, type Placement, type View,
} from './view.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const list = $<HTMLUListElement>('exp-list');
const search = $<HTMLInputElement>('search');
const stack = $<HTMLDivElement>('layers');
const panel = $<HTMLElement>('layers-panel');
const layersBtn = $<HTMLButtonElement>('layers-btn');
const mouseBtn = $<HTMLButtonElement>('mouse-btn');
const empty = $<HTMLDivElement>('empty');
const currentTitle = $<HTMLDivElement>('current-title');
const openTab = $<HTMLAnchorElement>('open-tab');
const shellEl = document.querySelector<HTMLDivElement>('.shell')!;

const SIDEBAR_KEY = 'experiment-x:sidebar-collapsed';
const isSmallScreen = () => matchMedia('(max-width: 720px)').matches;
const bySlug = (slug: string) => experiments.find((e) => e.slug === slug);

/** What's on screen: the base experiment plus any layers. */
let view: View = { layers: [], input: -1 };
/** Set when a player opens: everything waits, paused, until a track is picked. */
let autostart = false;
/** The player's counter for the last track X-Frame acted on. */
let seenTrack: number | undefined;
function armAutostart() {
  autostart = true;
  seenTrack = undefined;
}
/**
 * Browser features experiments may use inside X-Frame's iframes: autoplay for
 * synced playback, camera/mic/screen capture for audio and webcam inputs.
 * They still ask the visitor for permission as usual.
 */
const FRAME_ALLOW = 'autoplay; camera; microphone; display-capture; fullscreen';

/** One iframe per layer, keyed by slug (an experiment appears at most once). */
const frames = new Map<string, HTMLIFrameElement>();

// --- sidebar -----------------------------------------------------------------

function renderList(filter = '') {
  const q = filter.trim().toLowerCase();
  const base = view.layers[0]?.slug;
  const shown = new Set(view.layers.map((l) => l.slug));
  list.replaceChildren(
    ...experiments
      .filter((exp) =>
        !q ||
        [exp.title, exp.slug, exp.description ?? '', ...(exp.tags ?? [])].some((s) => s.toLowerCase().includes(q)),
      )
      .map((exp) => {
        const li = document.createElement('li');
        li.className = 'exp-item';
        const a = document.createElement('a');
        a.href = `#/${encodeURIComponent(exp.slug)}`;
        a.className = 'exp-link';
        if (exp.slug === base) a.setAttribute('aria-current', 'page');
        else if (shown.has(exp.slug)) a.classList.add('exp-link--layer');

        const title = document.createElement('span');
        title.className = 'exp-link__title';
        title.textContent = exp.title;
        a.append(title);

        if (exp.description) {
          const desc = document.createElement('span');
          desc.className = 'exp-link__desc';
          desc.textContent = exp.description;
          a.append(desc);
        }
        li.append(a);

        if (!shown.has(exp.slug) && base) {
          const add = document.createElement('button');
          add.className = 'icon-btn exp-item__add';
          add.textContent = '+';
          add.title = `Add ${exp.title} as a layer`;
          add.setAttribute('aria-label', add.title);
          add.addEventListener('click', () => addLayer(exp.slug));
          li.append(add);
        }
        return li;
      }),
  );
}

// --- layers ------------------------------------------------------------------

/** Tell an experiment how it's being shown, so it can e.g. drop its background when stacked. */
function tellLayer(frame: HTMLIFrameElement) {
  const i = view.layers.findIndex((l) => frames.get(l.slug) === frame);
  if (i < 0) return;
  const l = view.layers[i];
  frame.contentWindow?.postMessage(
    {
      type: 'xp:layer',
      role: i === 0 ? 'base' : l.placement === 'full' ? 'stacked' : 'docked',
      placement: i === 0 ? 'full' : l.placement,
      index: i,
      count: view.layers.length,
      input: i === inputLayer(view) || (i > 0 && l.placement !== 'full'),
    },
    location.origin,
  );
}

function createFrame(exp: Experiment) {
  const frame = document.createElement('iframe');
  frame.className = 'layer';
  frame.title = exp.title;
  // Lets an audio layer start from the toolbar's play button without a tap of its own.
  frame.allow = FRAME_ALLOW;
  frame.src = exp.url;
  frame.addEventListener('load', () => {
    tellLayer(frame);
    // With several experiments on screen, only the layer that has the mouse
    // starts with its options open (e.g. the player, so a track is one tap away).
    if (view.layers.length > 1) {
      const active = view.layers[inputLayer(view)]?.slug === exp.slug;
      frame.contentWindow?.postMessage({ type: active ? 'xp:open-panel' : 'xp:close-panel' }, location.origin);
    }
  });
  stack.append(frame);
  return frame;
}

function removeFrame(slug: string) {
  const frame = frames.get(slug);
  if (!frame) return;
  dropFrame(frame.contentWindow);
  dropPublisher(slug);
  frame.remove();
  frames.delete(slug);
}

/** Make the iframes match `view`, reusing the ones that are already running. */
function applyView() {
  const wanted = new Set(view.layers.map((l) => l.slug));
  for (const slug of [...frames.keys()]) if (!wanted.has(slug)) removeFrame(slug);

  const rects = layout(view);
  const input = inputLayer(view);
  view.layers.forEach((l, i) => {
    let frame = frames.get(l.slug);
    if (!frame) {
      const exp = bySlug(l.slug)!;
      frame = createFrame(exp);
      // A newly opened player starts playing once its track has loaded (see autostart).
      if (exp.provides?.includes('transport')) armAutostart();
      frames.set(l.slug, frame);
    }
    const r = rects[i];
    const docked = i > 0 && l.placement !== 'full';
    Object.assign(frame.style, {
      left: `${r.left}%`,
      top: `${r.top}%`,
      width: `${r.width}%`,
      height: `${r.height}%`,
      zIndex: String(i + (docked ? 100 : 0)),
      mixBlendMode: i === 0 ? '' : l.blend,
      opacity: layerOpacity(i),
      pointerEvents: docked || i === input ? '' : 'none',
    });
    frame.classList.toggle('layer--base', i === 0);
    frame.classList.toggle('layer--stacked', i > 0 && !docked);
    frame.classList.toggle('layer--docked', docked);
    tellLayer(frame);
  });

  const exps = view.layers.map((l) => bySlug(l.slug)!);
  empty.hidden = exps.length > 0;
  stack.hidden = exps.length === 0;
  layersBtn.hidden = exps.length === 0;
  renderMouseBtn();
  const title = exps.map((e) => e.title).join(' + ');
  currentTitle.textContent = title || '—';
  document.title = title ? `${title} · X-Frame` : 'X-Frame';
  if (exps[0]) openTab.href = exps[0].url;
  renderList(search.value);
  renderPanel();
}

/** Which experiment has its options panel open (they report it with xp:panel). */
let panelOpenSlug: string | null = null;

function refreshOpacities() {
  view.layers.forEach((l, i) => {
    const f = frames.get(l.slug);
    if (f) f.style.opacity = layerOpacity(i);
  });
}

/** How much stacked layers above the one with the mouse fade back while its options panel is open. */
const FADE_ABOVE_INPUT = 0.2;

function layerOpacity(i: number): string {
  if (i === 0) return '';
  const l = view.layers[i];
  const input = inputLayer(view);
  // Fade only while the layer with the mouse has its options panel open.
  const above = l.placement === 'full' && i > input && panelOpenSlug === view.layers[input]?.slug;
  return String((l.opacity / 100) * (above ? FADE_ABOVE_INPUT : 1));
}

/** Change the view in place: no reloads, and the URL follows along. */
function updateView(change: (v: View) => void) {
  change(view);
  history.replaceState(null, '', toHash(view));
  applyView();
}

/** Layers that can get the mouse by choice: the base and stacked layers (docked strips always do). */
function stackedLayers() {
  return view.layers.map((l, i) => (i === 0 || l.placement === 'full' ? i : -1)).filter((i) => i >= 0);
}

/** Toolbar chip: shows who gets the mouse; one tap hands it to the next stacked layer. */
function renderMouseBtn() {
  const stacked = stackedLayers();
  mouseBtn.hidden = stacked.length < 2;
  if (mouseBtn.hidden) return;
  const title = bySlug(view.layers[inputLayer(view)].slug)?.title ?? '';
  mouseBtn.textContent = title;
  mouseBtn.title = `Mouse goes to ${title}; layers above it fade back. Tap to switch (L)`;
  mouseBtn.setAttribute('aria-label', mouseBtn.title);
}

function cycleMouse() {
  const stacked = stackedLayers();
  if (stacked.length < 2) return;
  const next = stacked[(stacked.indexOf(inputLayer(view)) + 1) % stacked.length];
  updateView((v) => { v.input = next; });
  // Hand the menu over with the mouse: close the others, open this layer's options.
  const win = frames.get(view.layers[next].slug)?.contentWindow;
  closePanels(win ?? undefined);
  openPanel(false);
  win?.postMessage({ type: 'xp:open-panel' }, location.origin);
}

function addLayer(slug: string, placement: Placement = 'full') {
  if (view.layers.some((l) => l.slug === slug) || !bySlug(slug)) return;
  updateView((v) => {
    // No blending: a see-through layer then sits plainly in front of the others.
    v.layers.push({ ...newLayer(slug, placement), blend: 'normal' });
    v.input = -1; // the new layer is on top: give it the mouse
  });
  openPanel(true);
}

function removeLayer(i: number) {
  if (i <= 0) return;
  updateView((v) => {
    v.layers.splice(i, 1);
    v.input = -1;
  });
}

/**
 * Put the layers in a new order (slugs, bottom first). Any layer can move,
 * the base included: whatever lands at the bottom becomes the full-screen
 * base. The layer with the mouse keeps it.
 */
function reorderLayers(order: string[]) {
  const inputSlug = view.layers[inputLayer(view)]?.slug;
  updateView((v) => {
    v.layers = order.map((slug) => v.layers.find((l) => l.slug === slug)!).filter(Boolean);
    v.layers[0].placement = 'full';
    v.input = v.layers.findIndex((l) => l.slug === inputSlug);
  });
}

function moveLayer(i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= view.layers.length) return;
  const order = view.layers.map((l) => l.slug);
  [order[i], order[j]] = [order[j], order[i]];
  reorderLayers(order);
}

function route() {
  const parsed = parseHash(location.hash);
  const seen = new Set<string>();
  const layers = (parsed?.layers ?? []).filter((l) => bySlug(l.slug) && !seen.has(l.slug) && seen.add(l.slug));
  if (!layers.length && experiments[0]) layers.push({ ...newLayer(experiments[0].slug), blend: 'normal' });
  view = { layers, input: parsed?.input ?? -1 };
  // A player that's just opening gets the mouse, so its options (and its
  // track list) are what's in front, whatever layer the link had active.
  const player = layers.findIndex((l) => !frames.has(l.slug) && bySlug(l.slug)?.provides?.includes('transport'));
  if (player >= 0 && layers.length > 1) view.input = player;
  const hash = layers.length ? toHash(view) : '';
  if (hash && hash !== location.hash) history.replaceState(null, '', hash);
  removeHandover();
  applyView();
}

function step(delta: number) {
  if (!experiments.length) return;
  const i = experiments.findIndex((e) => e.slug === view.layers[0]?.slug);
  const next = experiments[(i + delta + experiments.length) % experiments.length];
  location.hash = `#/${encodeURIComponent(next.slug)}`;
}

function reloadAll() {
  for (const frame of frames.values()) {
    dropFrame(frame.contentWindow);
    frame.src = frame.src;
  }
}

// --- layers panel ------------------------------------------------------------

let panelTimer = 0;

/** Ask every experiment except `except` to close its options panel. */
function closePanels(except?: Window) {
  const wins = [...frames.values()].map((f) => f.contentWindow);
  if (handover) wins.push(handover.frame.contentWindow);
  for (const w of wins) if (w && w !== except) w.postMessage({ type: 'xp:close-panel' }, location.origin);
}

function openPanel(open: boolean) {
  if (open && panel.hidden) closePanels();
  panel.hidden = !open;
  layersBtn.setAttribute('aria-expanded', String(open));
  clearInterval(panelTimer);
  if (open) {
    renderPanel();
    // Keep the feed rates fresh while the panel is open.
    panelTimer = window.setInterval(renderFeeds, 1000);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  node.append(...children);
  return node;
}

function select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void, label: string) {
  const s = el('select', { class: 'panel__select', title: label });
  s.setAttribute('aria-label', label);
  s.append(...options.map(([v, text]) => new Option(text, v, false, v === value)));
  s.addEventListener('change', () => onChange(s.value as T));
  return s;
}

function slider(value: number, min: number, max: number, onInput: (v: number) => void, label: string) {
  const input = el('input', { type: 'range', min: String(min), max: String(max), value: String(value), class: 'panel__range' });
  input.setAttribute('aria-label', label);
  const out = el('span', { class: 'panel__value' }, `${value}%`);
  input.addEventListener('input', () => {
    out.textContent = `${input.value}%`;
    onInput(Number(input.value));
  });
  return el('label', { class: 'panel__field' }, el('span', {}, label), input, out);
}

function layerRow(l: Layer, i: number) {
  const exp = bySlug(l.slug)!;
  const isBase = i === 0;
  const grip = el('button', { class: 'icon-btn icon-btn--sm panel__grip', textContent: '⠿', title: 'Drag to reorder' });
  grip.setAttribute('aria-label', 'Drag to reorder');
  const head = el('div', { class: 'panel__layer-head' }, grip, el('strong', {}, exp.title));
  if (isBase) head.append(el('span', { class: 'panel__tag' }, 'base'));
  const btn = (text: string, title: string, fn: () => void, disabled = false) => {
    const b = el('button', { class: 'icon-btn icon-btn--sm', textContent: text, title, disabled });
    b.setAttribute('aria-label', title);
    b.addEventListener('click', fn);
    return b;
  };
  if (view.layers.length > 1) {
    head.append(
      btn('↑', 'Bring forward', () => moveLayer(i, 1), i === view.layers.length - 1),
      btn('↓', 'Send back', () => moveLayer(i, -1), i === 0),
    );
  }
  if (!isBase) head.append(btn('✕', 'Remove layer', () => removeLayer(i)));
  const row = el('li', { class: 'panel__layer' }, head);
  row.dataset.slug = l.slug;
  grip.addEventListener('pointerdown', (e) => dragLayer(e, row));
  const docked = !isBase && l.placement !== 'full';

  if (!isBase) {
    // Changes that move or resize the frame re-render the panel; sliders just restyle.
    const set = (fn: (layer: Layer) => void, rerender = true) => {
      fn(view.layers[i]);
      history.replaceState(null, '', toHash(view));
      if (rerender) applyView();
      else applyStyleOnly(i);
    };
    row.append(
      el('div', { class: 'panel__grid' },
        select(PLACEMENTS, l.placement, (p) => set((x) => {
          x.placement = p;
          if (p !== 'full' && x.blend === 'screen') x.blend = 'normal';
        }), 'Placement'),
        select(BLENDS.map((b): [string, string] => [b, b === 'normal' ? 'No blending' : b]), l.blend, (b) => set((x) => { x.blend = b; }), 'Blend mode'),
      ),
      slider(l.opacity, 0, 100, (v) => set((x) => { x.opacity = v; }, false), 'Opacity'),
    );
    if (docked) row.append(slider(l.size, 10, 80, (v) => set((x) => { x.size = v; }, false), 'Size'));
  }
  if (isBase || !docked) {
    const radio = el('input', { type: 'radio', name: 'xf-input', checked: inputLayer(view) === i });
    radio.addEventListener('change', () => updateView((v) => { v.input = i; }));
    row.append(el('label', { class: 'panel__check' }, radio, 'Gets the mouse'));
  } else {
    row.append(el('p', { class: 'panel__hint' }, 'Docked strips always get the mouse.'));
  }
  return row;
}

/**
 * Drag a row of the layers list by its grip (mouse or touch). The row follows
 * the pointer and the others make room; letting go applies the new order.
 */
function dragLayer(e: PointerEvent, row: HTMLElement) {
  const list = row.parentElement;
  if (!list || view.layers.length < 2) return;
  e.preventDefault();
  const startY = e.clientY;
  const startTop = row.offsetTop;
  row.classList.add('panel__layer--dragging');
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    const y = ev.clientY;
    // Swap with a neighbour once the pointer passes its middle.
    let moved = true;
    while (moved) {
      moved = false;
      const prev = row.previousElementSibling as HTMLElement | null;
      const next = row.nextElementSibling as HTMLElement | null;
      if (prev && y < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
        list.insertBefore(row, prev);
        moved = true;
      } else if (next && y > next.getBoundingClientRect().top + next.offsetHeight / 2) {
        list.insertBefore(next, row);
        moved = true;
      }
    }
    row.style.transform = `translateY(${y - startY - (row.offsetTop - startTop)}px)`;
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    row.style.transform = '';
    row.classList.remove('panel__layer--dragging');
    // The list shows the top layer first; layers are stored bottom first.
    const order = ([...list.children] as HTMLElement[]).map((r) => r.dataset.slug!).reverse();
    if (order.join() !== view.layers.map((l) => l.slug).join()) reorderLayers(order);
  };
  // On the window: moving the row in the list can drop the grip's pointer capture.
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

/** Restyle one layer without rebuilding the panel (keeps a dragged slider alive). */
function applyStyleOnly(i: number) {
  const l = view.layers[i];
  const frame = frames.get(l.slug);
  if (!frame) return;
  const r = layout(view);
  view.layers.forEach((layer, k) => {
    const f = frames.get(layer.slug);
    if (!f) return;
    Object.assign(f.style, { left: `${r[k].left}%`, top: `${r[k].top}%`, width: `${r[k].width}%`, height: `${r[k].height}%` });
  });
  frame.style.opacity = layerOpacity(i);
}

function matchHint(exp: Experiment): string {
  // Suggest layers that can talk to what's already on screen.
  const onScreen = view.layers.map((l) => bySlug(l.slug)!);
  const feeds = new Set<string>();
  for (const other of onScreen) {
    for (const t of exp.accepts ?? []) if (other.provides?.includes(t)) feeds.add(t);
    for (const t of exp.provides ?? []) if (other.accepts?.includes(t)) feeds.add(t);
  }
  return feeds.size ? ` (shares ${[...feeds].join(', ')})` : '';
}

const feedsBox = el('div', { class: 'panel__feeds' });

function renderFeeds() {
  if (panel.hidden) return;
  const stats = busStats();
  const name = (slug: string) => bySlug(slug)?.title ?? slug;
  feedsBox.replaceChildren(
    ...(stats.length
      ? stats.map((s) =>
          el('div', { class: 'panel__feed' },
            el('code', {}, s.topic),
            el('span', {},
              `${s.publishers.map(name).join(', ') || 'nobody yet'} → ${s.subscribers.map(name).join(', ') || 'nobody yet'}`),
            el('span', { class: 'panel__value' }, s.rate >= 1 ? `${Math.round(s.rate)}/s` : s.rate > 0 ? '<1/s' : 'idle'),
          ))
      : [el('p', { class: 'panel__hint' }, 'No feeds yet. Experiments publish and subscribe to topics through X-Frame; see "Data bus" in the README.')]),
  );
}

function renderPanel() {
  if (panel.hidden) return;
  const close = el('button', { class: 'icon-btn icon-btn--sm', textContent: '✕', title: 'Close' });
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => openPanel(false));

  const available = experiments.filter((e) => !view.layers.some((l) => l.slug === e.slug));
  const add = el('select', { class: 'panel__select' });
  add.setAttribute('aria-label', 'Add a layer');
  add.append(new Option('Add a layer…', ''), ...available.map((e) => new Option(e.title + matchHint(e), e.slug)));
  add.addEventListener('change', () => add.value && addLayer(add.value));

  // Top-most layer first, like a layers list in a design tool.
  const rows = view.layers.map((l, i) => layerRow(l, i)).reverse();
  panel.replaceChildren(
    el('header', { class: 'panel__head' }, el('h2', {}, 'Layers'), close),
    el('ul', { class: 'panel__layers' }, ...rows),
    available.length ? add : '',
    el('h2', { class: 'panel__sub' }, 'Feeds'),
    feedsBox,
  );
  renderFeeds();
}

// --- hand-over ---------------------------------------------------------------
// An experiment can hand the screen to another one, e.g. the carousel grid
// opening a cell into a different visualisation. X-Frame is in charge: it
// loads the next experiment in its own iframe over everything, and gives the
// screen back to the experiment that asked when that is closed.
//   experiment → X-Frame  { type: 'xp:list' }             ask which experiments exist
//   X-Frame → experiment  { type: 'xp:list', experiments: [{ slug, title, provides, accepts }] }
//   experiment → X-Frame  { type: 'xp:handover', slug, params? }
//                                                       show <slug> on top of me; params
//                                                       (strings) go on its URL query
//   X-Frame → experiment  { type: 'xp:release' }          it was closed: take over again

let handover: { box: HTMLDivElement; frame: HTMLIFrameElement; slug: string; from: Window } | null = null;

function handOver(slug: string, params: Record<string, string>, from: Window) {
  const exp = bySlug(slug);
  if (!exp || frames.has(slug)) return;
  removeHandover();
  const box = el('div', { class: 'handover' });
  box.style.top = `${stack.offsetTop}px`;
  const inner = el('iframe', { class: 'handover__frame', title: exp.title });
  inner.allow = FRAME_ALLOW;
  const query = new URLSearchParams(params).toString();
  inner.src = query ? `${exp.url}${exp.url.includes('?') ? '&' : '?'}${query}` : exp.url;
  // Fade in only once it has loaded, so the hand-over stays black until then.
  inner.addEventListener('load', () => box.classList.add('handover--ready'), { once: true });
  const back = el('button', { class: 'icon-btn handover__close', title: 'Back', textContent: '✕' });
  back.setAttribute('aria-label', 'Back');
  back.addEventListener('click', releaseHandover);
  box.append(inner, back);
  stack.parentElement!.append(box);
  handover = { box, frame: inner, slug, from };
  inner.focus();
}

/** Fade the handed-over experiment out to black, then give the screen back. */
function releaseHandover() {
  const h = handover;
  if (!h) return;
  handover = null;
  h.box.classList.remove('handover--ready');
  setTimeout(() => {
    dropFrame(h.frame.contentWindow);
    dropPublisher(h.slug);
    h.box.remove();
    h.from.postMessage({ type: 'xp:release' }, location.origin);
    h.from.focus();
  }, 400);
}

function removeHandover() {
  if (!handover) return;
  dropFrame(handover.frame.contentWindow);
  dropPublisher(handover.slug);
  handover.box.remove();
  handover = null;
}

// --- messages from experiments -------------------------------------------------

function slugOf(win: Window): string | undefined {
  for (const [slug, frame] of frames) if (frame.contentWindow === win) return slug;
  if (handover?.frame.contentWindow === win) return handover.slug;
  return undefined;
}
setSlugResolver(slugOf);

window.addEventListener('message', (e) => {
  const source = e.source as Window | null;
  if (!source || e.origin !== location.origin) return;
  const slug = slugOf(source);
  if (!slug) return;
  const msg = e.data as { type?: string; slug?: string; params?: unknown; topic?: unknown; data?: unknown } | null;
  if (!msg || typeof msg.type !== 'string') return;

  if (handleBusMessage(source, msg)) return;
  if (msg.type === 'xp:panel') {
    const open = (msg as { open?: boolean }).open !== false;
    if (open) {
      panelOpenSlug = slug;
      closePanels(source);
      openPanel(false);
    } else if (panelOpenSlug === slug) {
      panelOpenSlug = null;
    }
    refreshOpacities();
  } else if (msg.type === 'xp:hello') {
    const frame = frames.get(slug);
    if (frame) tellLayer(frame);
  } else if (msg.type === 'xp:list') {
    source.postMessage(
      {
        type: 'xp:list',
        experiments: experiments.map(({ slug, title, provides = [], accepts = [] }) => ({ slug, title, provides, accepts })),
      },
      location.origin,
    );
  } else if (msg.type === 'xp:handover' && typeof msg.slug === 'string') {
    const params: Record<string, string> = {};
    if (msg.params && typeof msg.params === 'object') {
      for (const [k, v] of Object.entries(msg.params)) if (typeof v === 'string' || typeof v === 'number') params[k] = String(v);
    }
    handOver(msg.slug, params, source);
  }
});

// --- wire up -----------------------------------------------------------------

function setSidebarCollapsed(collapsed: boolean) {
  shellEl.classList.toggle('shell--collapsed', collapsed);
  // On small screens the list is an overlay, so don't let that choice stick for desktop.
  if (isSmallScreen()) return;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    /* storage unavailable: ignore */
  }
}

// --- fullscreen ----------------------------------------------------------------
// Hides the list and toolbar so the experiments fill the screen. Uses the
// browser's real fullscreen where it exists (not on iPhone), and falls back to
// just hiding X-Frame's chrome. A faint ✕ in the corner (or Esc / F) exits.

const canFullscreen = () => !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;

function setFullscreen(on: boolean) {
  shellEl.classList.toggle('shell--fullscreen', on);
  if (on) openPanel(false);
  if (on && canFullscreen() && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => { /* chrome-only fallback is fine */ });
  } else if (!on && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

const isFullscreen = () => shellEl.classList.contains('shell--fullscreen');

// Leaving browser fullscreen (Esc, swipe, etc.) also brings X-Frame's chrome back.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && isFullscreen()) shellEl.classList.remove('shell--fullscreen');
});

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

search.addEventListener('input', () => renderList(search.value));
list.addEventListener('click', (e) => {
  // On small screens the list overlays the stage, so close it after picking.
  if ((e.target as HTMLElement).closest('a') && isSmallScreen()) setSidebarCollapsed(true);
});
$('reload').addEventListener('click', reloadAll);
$('fullscreen-btn').addEventListener('click', () => setFullscreen(true));
$('fs-exit').addEventListener('click', () => setFullscreen(false));

// Shared play/pause ('play' topic): one button for every experiment that hooks in.
// It shows only while someone listens, and follows whoever pressed play or pause last.
const playAll = $('play-all');
/** Whether things are playing: the player's own state when there is one, else the last shared play/pause. */
function isPlaying() {
  const t = lastValue('transport') as { playing?: boolean } | undefined;
  if (typeof t?.playing === 'boolean') return t.playing;
  return (lastValue('play') as { playing?: boolean } | undefined)?.playing ?? true;
}
function syncPlayAll() {
  const listening = hasSubscribers('play');
  playAll.hidden = !listening;
  const playing = isPlaying();
  playAll.textContent = playing ? '⏸' : '▶';
  playAll.title = playing ? 'Pause everything' : 'Play everything';
  playAll.setAttribute('aria-label', playAll.title);
}
playAll.addEventListener('click', () => {
  if (isPlaying()) shellPublish('play', { playing: false });
  else startAll();
  syncPlayAll();
});
shellSubscribe('play', syncPlayAll);

// --- start together ----------------------------------------------------------
// A view with a player in it (an experiment that provides "transport") opens
// paused, layers included, with the player's options open. Picking a track
// there (a demo or a file) starts the music and every layer together. The
// toolbar's play button starts whatever is loaded.

function startAll() {
  shellPublish('play', { playing: true });
  shellPublish('transport.command', { action: 'play' });
}

shellSubscribe('transport', (data, from) => {
  const t = data as { playing?: boolean; duration?: number; track?: number; picked?: boolean } | undefined;
  syncPlayAll();
  if (t?.playing) {
    // A player can send a stale "paused" while its track loads, which would
    // leave the other layers paused. If the player itself says it's playing
    // while its own last shared state says paused, play everyone.
    const shared = lastValue('play') as { playing?: boolean } | undefined;
    if (shared?.playing === false && lastFrom('play') === from) shellPublish('play', { playing: true });
  }
  if (!autostart || !(t?.duration && t.duration > 0) || typeof t.track !== 'number' || t.track === seenTrack) return;
  seenTrack = t.track;
  if (t.playing) return;
  // A track someone picked (a demo, a file) starts everything; the one the
  // player opened with holds everything paused.
  if (t.picked) startAll();
  else shellPublish('play', { playing: false });
  syncPlayAll();
});
window.setInterval(syncPlayAll, 1000);
layersBtn.addEventListener('click', () => openPanel(!!panel.hidden));
mouseBtn.addEventListener('click', cycleMouse);
$('sidebar-close').addEventListener('click', () => setSidebarCollapsed(true));
$('sidebar-open').addEventListener('click', () => setSidebarCollapsed(!shellEl.classList.contains('shell--collapsed')));

window.addEventListener('hashchange', route);
window.addEventListener('keydown', (e) => {
  if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '[') step(-1);
  else if (e.key === ']') step(1);
  else if (e.key === 'l' || e.key === 'L') cycleMouse();
  else if (e.key === 'f' || e.key === 'F') setFullscreen(!isFullscreen());
  else if (e.key === 'Escape' && isFullscreen() && !handover) setFullscreen(false);
  else if (e.key === 'Escape' && handover) releaseHandover();
  else if (e.key === 'Escape' && !panel.hidden) openPanel(false);
  else if (e.key === '\\') setSidebarCollapsed(!shellEl.classList.contains('shell--collapsed'));
});

if (isSmallScreen()) {
  // Opened on a deep link: show the experiment, not the list.
  if (location.hash.startsWith('#/')) shellEl.classList.add('shell--collapsed');
} else {
  try {
    if (localStorage.getItem(SIDEBAR_KEY) === '1') shellEl.classList.add('shell--collapsed');
  } catch {
    /* storage unavailable: ignore */
  }
}

route();
