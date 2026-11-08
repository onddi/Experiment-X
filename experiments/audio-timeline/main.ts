import './style.css';
import { analyse, type TrackAnalysis } from './analysis.ts';
import { AudioFeed, BandMeter } from './feed.ts';
import { renderDemo, toWav } from './demo.ts';
import { LOOP_NAME, renderLoop } from './loop.ts';
import { xframe } from './xframe.ts';
import { createSkins, SKINS, type Skin } from './skins.ts';

type Style = 'waveform' | 'bars' | 'spectral' | 'spectrogram';
type Live = 'spectrum' | 'radial' | 'scope' | 'off';

const STYLES: [Style, string][] = [
  ['waveform', 'Waveform'],
  ['bars', 'Bars'],
  ['spectral', 'Spectral'],
  ['spectrogram', 'Spectrogram'],
];
const LIVES: [Live, string][] = [
  ['spectrum', 'Spectrum'],
  ['radial', 'Radial'],
  ['scope', 'Scope'],
  ['off', 'Off'],
];
const RATES = [0.5, 0.75, 1, 1.25, 1.5];

// --- settings ----------------------------------------------------------------

interface Settings {
  style: Style;
  live: Live;
  volume: number;
  muted: boolean;
  follow: boolean;
  loop: boolean;
  hue: number;
  smoothing: number;
  rate: number;
  skin: Skin;
  syncPlay: boolean;
}
const DEFAULTS: Settings = {
  style: 'spectral',
  live: 'spectrum',
  volume: 0.8,
  muted: false,
  follow: true,
  loop: false,
  hue: 260,
  smoothing: 0.6,
  rate: 1,
  skin: 'classic',
  syncPlay: true,
};
const STORAGE_KEY = 'audio-timeline:settings';
const COLLAPSE_KEY = 'audio-timeline:collapsed';
const settings: Settings = { ...DEFAULTS, ...readJson(STORAGE_KEY, {}) };
const collapsed: Record<string, boolean> = readJson(COLLAPSE_KEY, {});
// ?skin=ring picks the layout from the URL (handy for X-Frame layer links).
{
  const fromUrl = new URLSearchParams(location.search).get('skin');
  if (SKINS.some(([s]) => s === fromUrl)) settings.skin = fromUrl as Skin;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not persisted */
  }
}
const save = () => writeJson(STORAGE_KEY, settings);

// --- markup ------------------------------------------------------------------

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
  vol: (level: number) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/>${
      level === 0
        ? '<path d="M16 9.5l5 5M21 9.5l-5 5"/>'
        : `<path d="M15.5 9.2a4 4 0 0 1 0 5.6"/>${level > 0.5 ? '<path d="M18.3 6.6a7.6 7.6 0 0 1 0 10.8"/>' : ''}`
    }</svg>`,
};

const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="stage" id="stage">
    <section class="live" id="live-wrap">
      <canvas id="live"></canvas>
      <div class="now">
        <div class="track-name" id="track-name">Audio timeline</div>
        <div class="track-sub" id="track-sub">Open or drop an audio file</div>
      </div>
      <div class="busy" id="busy" hidden><span id="busy-text"></span><i><b id="busy-bar"></b></i></div>
    </section>
    <section class="deck">
      <div class="transport">
        <button class="play" id="play" title="Play (Space)" aria-label="Play">${ICON.play}</button>
        <span class="clock"><b id="cur">0:00</b><span id="dur"> / 0:00</span></span>
        <span class="spacer"></span>
        <span class="zoom-btns">
          <button class="icon" id="zoom-out" title="Zoom out (−)" aria-label="Zoom out">−</button>
          <button id="zoom-fit" title="Show the whole track (0)">Fit</button>
          <button class="icon" id="zoom-in" title="Zoom in (+)" aria-label="Zoom in">+</button>
        </span>
        <button class="icon loop-btn" id="loop" title="Loop" aria-label="Loop" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/></svg></button>
        <span class="volume">
          <button class="icon mute" id="mute" title="Mute (M)" aria-label="Mute"></button>
          <input type="range" id="volume" min="0" max="1" step="0.01" aria-label="Volume" />
        </span>
      </div>
      <div class="timeline" id="tl-wrap">
        <canvas id="tl"></canvas>
        <div class="tip" id="tip" hidden></div>
      </div>
      <div class="overview" id="ov-wrap"><canvas id="ov"></canvas></div>
    </section>
    <div class="skin-layer" id="skin"></div>
    <div class="drop-zone" id="drop-zone" hidden><span>Drop to load</span></div>
  </main>
  <aside class="panel" id="panel">
    <header>
      <h1>Audio timeline</h1>
      <button class="icon" id="toggle" aria-expanded="true" title="Hide controls (H)">⟩</button>
    </header>
    <div class="panel-body" id="controls"></div>
  </aside>
  <input type="file" id="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus,.webm" hidden />
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const controls = $('controls');

// Collapsible cards, the same look as the other experiments' panels.
function group(id: string, title: string) {
  const section = document.createElement('section');
  section.className = 'group';
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'group-head';
  head.innerHTML = `<span class="chev" aria-hidden="true"></span><span class="group-title"></span><span class="group-summary"></span>`;
  head.querySelector('.group-title')!.textContent = title;
  const body = document.createElement('div');
  body.className = 'group-body';
  body.id = `group-${id}`;
  head.setAttribute('aria-controls', body.id);
  const setOpen = (open: boolean) => {
    section.classList.toggle('closed', !open);
    head.setAttribute('aria-expanded', String(open));
  };
  setOpen(!collapsed[id]);
  head.addEventListener('click', () => {
    const open = section.classList.contains('closed');
    setOpen(open);
    collapsed[id] = !open;
    writeJson(COLLAPSE_KEY, collapsed);
  });
  section.append(head, body);
  controls.append(section);
  return { section, body, summary: head.querySelector<HTMLElement>('.group-summary')! };
}

function chips<T extends string | number>(parent: HTMLElement, options: [T, string][], get: () => T, set: (v: T) => void) {
  const wrap = document.createElement('div');
  wrap.className = 'chips';
  const buttons = options.map(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      set(value);
      sync();
    });
    wrap.append(b);
    return [value, b] as const;
  });
  const sync = () => buttons.forEach(([v, b]) => b.classList.toggle('on', v === get()));
  sync();
  parent.append(wrap);
  return sync;
}

function toggleRow(parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void) {
  const row = document.createElement('label');
  row.className = 'row toggle';
  row.innerHTML = `<input type="checkbox" /><span class="name"></span>`;
  row.querySelector('.name')!.textContent = label;
  const input = row.querySelector('input')!;
  input.checked = get();
  input.addEventListener('change', () => set(input.checked));
  parent.append(row);
  return () => (input.checked = get());
}

function rangeRow(parent: HTMLElement, label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string) {
  const row = document.createElement('label');
  row.className = 'row range';
  row.innerHTML = `<span class="name"></span><output></output><input type="range" />`;
  row.querySelector('.name')!.textContent = label;
  const input = row.querySelector('input')!;
  const out = row.querySelector('output')!;
  Object.assign(input, { min, max, step });
  const sync = () => {
    input.value = String(get());
    out.textContent = fmt(get());
  };
  input.addEventListener('input', () => {
    set(Number(input.value));
    out.textContent = fmt(get());
  });
  sync();
  parent.append(row);
  return sync;
}

function note(parent: HTMLElement, text: string) {
  const p = document.createElement('p');
  p.className = 'note';
  p.textContent = text;
  parent.append(p);
  return p;
}

// --- audio -------------------------------------------------------------------

const audio = new Audio();
audio.preload = 'auto';
let actx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let gainNode: GainNode | null = null;
let bins = new Uint8Array(2048);
let wave = new Uint8Array(4096).fill(128);
let objectUrl = '';
let track: TrackAnalysis | null = null;
let trackName = '';
let loadToken = 0;

function audioContext() {
  actx ??= new AudioContext();
  return actx;
}

/** Wires the <audio> element into Web Audio. The analyser taps the signal before the volume. */
function ensureGraph() {
  if (analyser) return;
  const ctx = audioContext();
  const src = ctx.createMediaElementSource(audio);
  analyser = ctx.createAnalyser();
  // Same settings as the particle field's input, so its detector can run on the feed.
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.3;
  bins = new Uint8Array(analyser.frequencyBinCount);
  wave = new Uint8Array(analyser.fftSize).fill(128);
  gainNode = ctx.createGain();
  src.connect(analyser);
  src.connect(gainNode).connect(ctx.destination);
  applyVolume();
}

function applyVolume() {
  const v = settings.muted ? 0 : settings.volume;
  if (gainNode && actx) gainNode.gain.setTargetAtTime(v, actx.currentTime, 0.015);
  else audio.volume = v;
  $('mute').innerHTML = ICON.vol(v);
  $('mute').setAttribute('aria-label', settings.muted ? 'Unmute' : 'Mute');
  $<HTMLInputElement>('volume').value = String(settings.volume);
  $('volume').style.setProperty('--fill', `${settings.volume * 100}%`);
}

async function togglePlay() {
  if (!track) return;
  ensureGraph();
  await actx!.resume();
  if (audio.paused) {
    if (audio.ended || audio.currentTime >= track.duration - 0.05) audio.currentTime = 0;
    followPaused = false;
    await audio.play().catch(() => {});
  } else audio.pause();
}

function seek(t: number) {
  if (!track) return;
  audio.currentTime = Math.max(0, Math.min(track.duration, t));
  playhead = audio.currentTime;
}

function syncPlayButton() {
  const playing = !audio.paused;
  const b = $('play');
  b.innerHTML = playing ? ICON.pause : ICON.play;
  b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  b.title = playing ? 'Pause (Space)' : 'Play (Space)';
  b.classList.toggle('playing', playing);
}
audio.addEventListener('play', syncPlayButton);
audio.addEventListener('pause', syncPlayButton);
audio.addEventListener('ended', syncPlayButton);

// --- X-Frame data bus ----------------------------------------------------------
// Other experiments on screen (e.g. the particle field) get the spectrum and
// playback state, and can drive playback with transport.command.

function publishTransport() {
  xframe.publish('transport', {
    playing: !audio.paused,
    time: audio.currentTime || 0,
    duration: track?.duration ?? 0,
    title: trackName ? trackName.replace(/\.[a-z0-9]+$/i, '') : undefined,
  });
}
for (const ev of ['play', 'pause', 'ended', 'seeked', 'ratechange', 'loadedmetadata']) audio.addEventListener(ev, publishTransport);

// Shared play/pause ('play' topic): pressing play or pause here plays or pauses
// everything else that hooks in (e.g. the particle field), and the other way round.
let sharedPlaying: boolean | null = null;
function shareState() {
  const playing = !audio.paused;
  if (!settings.syncPlay || playing === sharedPlaying) return;
  sharedPlaying = playing;
  xframe.publish('play', { playing });
}
audio.addEventListener('play', shareState);
audio.addEventListener('pause', shareState);
xframe.subscribe('play', (d: { playing?: boolean }) => {
  if (!settings.syncPlay || typeof d?.playing !== 'boolean') return;
  sharedPlaying = d.playing;
  if (d.playing === audio.paused) void togglePlay();
});

xframe.subscribe('transport.command', (cmd: { action?: string; time?: number }) => {
  if (!cmd || !track) return;
  if (cmd.action === 'toggle' || (cmd.action === 'play' && audio.paused) || (cmd.action === 'pause' && !audio.paused)) void togglePlay();
  else if (cmd.action === 'seek' && typeof cmd.time === 'number' && Number.isFinite(cmd.time)) {
    followPaused = false;
    seek(cmd.time);
  }
});

// See-through when stacked over another experiment, so it shows underneath.
xframe.onLayer((layer) => {
  document.body.classList.toggle('see-through', layer.role === 'stacked');
});
// When another layer has the mouse, it shares taps so our controls still respond.
xframe.subscribe('pointer', (p: { type?: string; x?: number; y?: number }) => {
  if (xframe.layer.input || typeof p?.x !== 'number' || typeof p?.y !== 'number') return;
  skins.remotePointer(p.type === 'down' ? 'down' : 'move', p.x, p.y);
});

let busWasPlaying = false;
let lastTransport = 0;
function publishBus(now: number, playing: boolean) {
  if (!xframe.inFrame || !analyser) return;
  if (playing) {
    xframe.publish('audio.spectrum', {
      bins,
      sampleRate: actx!.sampleRate,
      fftSize: analyser.fftSize,
      smoothing: analyser.smoothingTimeConstant,
      minDecibels: analyser.minDecibels,
      maxDecibels: analyser.maxDecibels,
    });
    xframe.publish('audio.levels', { level: meter.level, bass: meter.bass, mid: meter.mid, treble: meter.treble });
    if (now - lastTransport > 250) {
      lastTransport = now;
      publishTransport();
    }
  } else if (busWasPlaying) {
    // One silent frame so listeners fall quiet.
    xframe.publish('audio.spectrum', {
      bins: new Uint8Array(analyser.frequencyBinCount),
      sampleRate: actx!.sampleRate,
      fftSize: analyser.fftSize,
      smoothing: analyser.smoothingTimeConstant,
      minDecibels: analyser.minDecibels,
      maxDecibels: analyser.maxDecibels,
    });
    xframe.publish('audio.levels', { level: 0, bass: 0, mid: 0, treble: 0 });
  }
  busWasPlaying = playing;
}

// --- loading -----------------------------------------------------------------

function busy(text: string | null, progress = 0) {
  $('busy').hidden = text === null;
  if (text !== null) {
    $('busy-text').textContent = text;
    $('busy-bar').style.transform = `scaleX(${progress})`;
  }
}

async function load(blob: Blob, name: string, decoded?: AudioBuffer) {
  const token = ++loadToken;
  audio.pause();
  try {
    busy('Decoding…', 0);
    const buffer = decoded ?? (await audioContext().decodeAudioData(await blob.arrayBuffer()));
    if (token !== loadToken) return;
    const result = await analyse(buffer, (p) => token === loadToken && busy('Analysing…', p));
    if (token !== loadToken) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    audio.src = objectUrl;
    audio.playbackRate = settings.rate;
    track = result;
    trackName = name;
    playhead = 0;
    zoom = 1;
    viewStart = 0;
    invalidate();
    $('track-name').textContent = name.replace(/\.[a-z0-9]+$/i, '');
    $('track-sub').textContent = `${fmtTime(result.duration)} · ${(result.sampleRate / 1000).toFixed(1)} kHz · ${result.channels === 1 ? 'mono' : result.channels === 2 ? 'stereo' : `${result.channels} ch`}`;
    $('dur').textContent = ` / ${fmtTime(result.duration)}`;
    refreshPanel();
    publishTransport();
    feed.publishTrack({ name, duration: result.duration, peakRate: result.peakRate, peaks: result.rms, analysis: result });
    busy(null);
  } catch (err) {
    if (token !== loadToken) return;
    console.error(err);
    busy(null);
    $('track-sub').textContent = `Couldn’t read ${name}. Try an MP3, WAV, OGG, FLAC or M4A file.`;
  }
}

async function loadDemo(kind: 'track' | 'loop' = 'track') {
  const token = ++loadToken;
  busy(kind === 'loop' ? 'Rendering the demo loop…' : 'Rendering the demo track…', 0.05);
  const buffer = kind === 'loop' ? await renderLoop() : await renderDemo();
  if (token !== loadToken) return;
  // The loop is made to repeat seamlessly, so switch repeat on with it.
  if (kind === 'loop') setLoop(true);
  await load(toWav(buffer), kind === 'loop' ? LOOP_NAME : 'Demo track', buffer);
}

const loopSyncs: (() => void)[] = [];
function setLoop(on: boolean) {
  settings.loop = audio.loop = on;
  save();
  for (const f of loopSyncs) f();
}
loopSyncs.push(() => {
  const b = $('loop');
  b.classList.toggle('on', settings.loop);
  b.setAttribute('aria-pressed', String(settings.loop));
  b.title = settings.loop ? 'Loop is on' : 'Loop';
});
$('loop').addEventListener('click', () => setLoop(!settings.loop));

const fileInput = $<HTMLInputElement>('file');
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void load(f, f.name);
  fileInput.value = '';
});

// Drop a file anywhere.
let dragDepth = 0;
const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  $('drop-zone').hidden = false;
});
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    $('drop-zone').hidden = true;
  }
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('drop-zone').hidden = true;
  const f = e.dataTransfer?.files[0];
  if (f) void load(f, f.name);
});

// --- view (zoom & scroll) ----------------------------------------------------

let zoom = 1; // 1 = whole track visible
let viewStart = 0; // seconds
let playhead = 0;
let followPaused = false; // the user scrolled away; don't snap back until they seek or play
let scrubbing = false;
let hoverX: number | null = null;

const duration = () => track?.duration ?? 0;
const maxZoom = () => Math.max(1, Math.min(400, duration() / 1.5));
const span = () => duration() / zoom;
function clampView() {
  zoom = Math.max(1, Math.min(maxZoom(), zoom));
  viewStart = Math.max(0, Math.min(duration() - span(), viewStart));
}
function zoomAt(factor: number, anchorTime = playhead, anchorFrac = (anchorTime - viewStart) / (span() || 1)) {
  if (!track) return;
  zoom *= factor;
  clampView();
  viewStart = anchorTime - anchorFrac * span();
  clampView();
  refreshPanel();
}
function zoomAroundPlayhead(factor: number) {
  const frac = Math.max(0, Math.min(1, (playhead - viewStart) / (span() || 1)));
  zoomAt(factor, playhead, frac);
}

// --- canvases ----------------------------------------------------------------

interface Surface {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  w: number; // device px
  h: number;
  dpr: number;
}
function surface(id: string): Surface {
  const canvas = $<HTMLCanvasElement>(id);
  const s: Surface = { canvas, g: canvas.getContext('2d')!, w: 1, h: 1, dpr: 1 };
  new ResizeObserver(() => {
    s.dpr = Math.min(2, window.devicePixelRatio || 1);
    s.w = canvas.width = Math.max(1, Math.round(canvas.clientWidth * s.dpr));
    s.h = canvas.height = Math.max(1, Math.round(canvas.clientHeight * s.dpr));
    invalidate();
  }).observe(canvas);
  return s;
}
const liveS = surface('live');
const tlS = surface('tl');
const ovS = surface('ov');

// Cached timeline layers: the track drawn as "played" and "not played yet".
// Re-rendered only when the view, size, style or colour changes.
const layer = () => document.createElement('canvas');
const tlPlayed = layer();
const tlAhead = layer();
const ovPlayed = layer();
const ovAhead = layer();
let tlKey = '';
let ovKey = '';
function invalidate() {
  tlKey = ovKey = '';
}

const colour = {
  played: () => `oklch(80% 0.15 ${settings.hue})`,
  playedCore: () => `oklch(93% 0.07 ${settings.hue})`,
  ahead: () => `oklch(46% 0.03 ${settings.hue})`,
  aheadCore: () => `oklch(64% 0.035 ${settings.hue})`,
};
function applyHue() {
  document.documentElement.style.setProperty('--accent', `oklch(78% 0.14 ${settings.hue})`);
  lut = null;
  invalidate();
}

// Colour ramp for the spectrogram, built from CSS colours by drawing a
// gradient and reading it back.
let lut: { played: Uint8ClampedArray; ahead: Uint8ClampedArray } | null = null;
function spectroLut() {
  if (lut) return lut;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const ramp = (stops: [number, string][]) => {
    const grad = g.createLinearGradient(0, 0, 256, 0);
    for (const [at, col] of stops) grad.addColorStop(at, col);
    g.clearRect(0, 0, 256, 1);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 1);
    return g.getImageData(0, 0, 256, 1).data.slice();
  };
  const h = settings.hue;
  lut = {
    played: ramp([
      [0, '#0b0b12'],
      [0.3, `oklch(30% 0.12 ${h - 40})`],
      [0.6, `oklch(62% 0.2 ${h})`],
      [0.85, `oklch(85% 0.14 ${h + 60})`],
      [1, '#fffbea'],
    ]),
    ahead: ramp([
      [0, '#0b0b12'],
      [0.35, `oklch(22% 0.03 ${h})`],
      [0.75, `oklch(45% 0.05 ${h})`],
      [1, `oklch(70% 0.04 ${h})`],
    ]),
  };
  return lut;
}

/** min/max/rms of the peak buckets between two times. */
function peaksBetween(a: TrackAnalysis, t0: number, t1: number): [number, number, number] {
  const n = a.max.length;
  let b0 = Math.floor(t0 * a.peakRate);
  let b1 = Math.floor(t1 * a.peakRate);
  if (b1 <= b0) b1 = b0 + 1;
  b0 = Math.max(0, Math.min(n - 1, b0));
  b1 = Math.max(b0 + 1, Math.min(n, b1));
  let lo = 0;
  let hi = 0;
  let r = 0;
  for (let b = b0; b < b1; b++) {
    if (a.min[b] < lo) lo = a.min[b];
    if (a.max[b] > hi) hi = a.max[b];
    if (a.rms[b] > r) r = a.rms[b];
  }
  return [lo, hi, r];
}
const frameAt = (a: TrackAnalysis, t: number) => Math.max(0, Math.min(a.centroid.length - 1, Math.round(t * a.specRate)));

/** Draws the track between t0 and t1 into a canvas, as played or not-yet-played. */
function drawTrack(target: HTMLCanvasElement, w: number, h: number, dpr: number, t0: number, t1: number, played: boolean, style: Style) {
  target.width = w;
  target.height = h;
  const g = target.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  const a = track;
  if (!a) return;
  const dt = (t1 - t0) / w;
  const mid = h / 2;
  const amp = h * 0.46;

  if (style === 'waveform' || style === 'spectral') {
    // Outer: peak envelope, faint. Inner: loudness (RMS), solid.
    const outer: [number, number][] = [];
    const inner: number[] = [];
    const tints: string[] = [];
    for (let x = 0; x < w; x++) {
      const [lo, hi, r] = peaksBetween(a, t0 + x * dt, t0 + (x + 1) * dt);
      outer.push([lo, hi]);
      inner.push(r);
      if (style === 'spectral') {
        const f = frameAt(a, t0 + (x + 0.5) * dt);
        // Low, bassy moments warm, bright ones cool.
        const c = Math.max(0, Math.min(1, (a.centroid[f] - 0.28) / 0.42));
        const hue = 30 + c * 230;
        tints.push(played ? `oklch(${70 + a.energy[f] * 18}% 0.17 ${hue})` : `oklch(48% 0.06 ${hue})`);
      }
    }
    g.globalAlpha = 0.45;
    g.fillStyle = played ? colour.played() : colour.ahead();
    for (let x = 0; x < w; x++) {
      if (style === 'spectral') g.fillStyle = tints[x];
      const [lo, hi] = outer[x];
      g.fillRect(x, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp));
    }
    g.globalAlpha = 1;
    g.fillStyle = played ? colour.playedCore() : colour.aheadCore();
    for (let x = 0; x < w; x++) {
      if (style === 'spectral') g.fillStyle = tints[x];
      const r = inner[x] * amp;
      g.fillRect(x, mid - r, 1, Math.max(1, r * 2));
    }
    if (style === 'waveform') {
      g.globalAlpha = 0.5;
      g.fillStyle = played ? colour.played() : colour.ahead();
      g.fillRect(0, mid - 0.5 * dpr, w, dpr);
      g.globalAlpha = 1;
    }
    return;
  }

  if (style === 'bars') {
    // Rounded bars with a dim reflection underneath.
    const bw = 3 * dpr;
    const step = bw + 1.5 * dpr;
    const base = h * 0.68;
    g.fillStyle = played ? colour.played() : colour.aheadCore();
    for (let x = 0; x < w; x += step) {
      const [lo, hi, r] = peaksBetween(a, t0 + x * dt, t0 + (x + step) * dt);
      const v = Math.max(0.02, Math.pow(Math.max(hi, -lo) * 0.5 + r * 0.5, 0.8));
      const up = v * base * 0.94;
      const down = v * (h - base) * 0.9;
      g.globalAlpha = 1;
      g.beginPath();
      g.roundRect(x, base - up, bw, up, [bw / 2, bw / 2, 0, 0]);
      g.fill();
      g.globalAlpha = 0.3;
      g.beginPath();
      g.roundRect(x, base + dpr, bw, down, [0, 0, bw / 2, bw / 2]);
      g.fill();
    }
    g.globalAlpha = 1;
    return;
  }

  // Spectrogram: frequency up, time across, loudness as colour.
  const img = g.createImageData(w, h);
  const px = img.data;
  const ramp = spectroLut()[played ? 'played' : 'ahead'];
  const B = a.bands;
  const frames = a.centroid.length;
  for (let x = 0; x < w; x++) {
    // Average the frames under this column (or the nearest when zoomed in).
    let f0 = Math.floor((t0 + x * dt) * a.specRate);
    let f1 = Math.floor((t0 + (x + 1) * dt) * a.specRate);
    f0 = Math.max(0, Math.min(frames - 1, f0));
    f1 = Math.max(f0 + 1, Math.min(frames, f1));
    for (let y = 0; y < h; y++) {
      const bf = (1 - y / (h - 1)) * (B - 1);
      const b0 = Math.floor(bf);
      const b1 = Math.min(B - 1, b0 + 1);
      const k = bf - b0;
      let v = 0;
      for (let f = f0; f < f1; f++) v = Math.max(v, a.spec[f * B + b0] * (1 - k) + a.spec[f * B + b1] * k);
      const c = Math.min(255, Math.round(Math.pow(v, 1.5) * 255)) * 4;
      const o = (y * w + x) * 4;
      px[o] = ramp[c];
      px[o + 1] = ramp[c + 1];
      px[o + 2] = ramp[c + 2];
      px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function fmtTime(t: number, tenths = false) {
  if (!Number.isFinite(t)) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
  return `${m}:${ss}`;
}

const TICK_STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function drawTimeline() {
  const { g, w, h, dpr } = tlS;
  g.clearRect(0, 0, w, h);
  if (!track) {
    g.fillStyle = '#ffffff40';
    g.font = `${12 * dpr}px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(loadToken ? 'LOADING…' : 'OPEN OR DROP AN AUDIO FILE', w / 2, h / 2);
    return;
  }
  const t0 = viewStart;
  const t1 = viewStart + span();
  const key = `${w}x${h}|${t0.toFixed(4)}|${t1.toFixed(4)}|${settings.style}|${settings.hue}`;
  if (key !== tlKey) {
    tlKey = key;
    drawTrack(tlAhead, w, h, dpr, t0, t1, false, settings.style);
    drawTrack(tlPlayed, w, h, dpr, t0, t1, true, settings.style);
  }
  const toX = (t: number) => ((t - t0) / (t1 - t0)) * w;
  const px = toX(playhead);
  g.drawImage(tlAhead, 0, 0);
  if (px > 0) {
    g.save();
    g.beginPath();
    g.rect(0, 0, Math.min(w, px), h);
    g.clip();
    g.drawImage(tlPlayed, 0, 0);
    g.restore();
  }

  // Time ticks along the bottom.
  const pxPerSec = w / (t1 - t0);
  const step = TICK_STEPS.find((s) => s * pxPerSec >= 90 * dpr) ?? 1200;
  g.font = `${10 * dpr}px ui-monospace, Menlo, monospace`;
  g.textBaseline = 'bottom';
  g.textAlign = 'left';
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    const x = Math.round(toX(t));
    g.fillStyle = '#ffffff1f';
    g.fillRect(x, h - 6 * dpr, dpr, 6 * dpr);
    g.fillStyle = '#ffffff55';
    g.fillText(fmtTime(t, step < 1), x + 3 * dpr, h - 1 * dpr);
  }

  // Hover cursor.
  if (hoverX !== null && !scrubbing) {
    g.fillStyle = '#ffffff40';
    g.fillRect(Math.round(hoverX * dpr), 0, dpr, h);
  }

  // Playhead.
  if (px >= -2 && px <= w + 2) {
    g.fillStyle = '#fff';
    g.shadowColor = colour.played();
    g.shadowBlur = 8 * dpr;
    g.fillRect(Math.round(px - dpr), 0, 2 * dpr, h);
    g.shadowBlur = 0;
    g.beginPath();
    g.moveTo(px - 5 * dpr, 0);
    g.lineTo(px + 5 * dpr, 0);
    g.lineTo(px, 6 * dpr);
    g.fill();
  }
}

function drawOverview() {
  const { g, w, h, dpr } = ovS;
  g.clearRect(0, 0, w, h);
  if (!track) return;
  const key = `${w}x${h}|${settings.hue}`;
  if (key !== ovKey) {
    ovKey = key;
    drawTrack(ovAhead, w, h, dpr, 0, track.duration, false, 'waveform');
    drawTrack(ovPlayed, w, h, dpr, 0, track.duration, true, 'waveform');
  }
  const toX = (t: number) => (t / track!.duration) * w;
  const px = toX(playhead);
  g.drawImage(ovAhead, 0, 0);
  g.save();
  g.beginPath();
  g.rect(0, 0, px, h);
  g.clip();
  g.drawImage(ovPlayed, 0, 0);
  g.restore();
  // The part shown in the timeline above.
  if (zoom > 1.001) {
    const x0 = toX(viewStart);
    const x1 = toX(viewStart + span());
    g.fillStyle = '#07070cb0';
    g.fillRect(0, 0, x0, h);
    g.fillRect(x1, 0, w - x1, h);
    g.strokeStyle = colour.played();
    g.lineWidth = dpr;
    g.strokeRect(x0 + dpr / 2, dpr / 2, Math.max(2 * dpr, x1 - x0 - dpr), h - dpr);
  }
  g.fillStyle = '#fff';
  g.fillRect(Math.round(px - dpr / 2), 0, dpr, h);
}

// --- live view ---------------------------------------------------------------

let liveDrawn = true;
const LIVE_BANDS = 72;
const liveVals = new Float32Array(LIVE_BANDS);
const livePeaks = new Float32Array(LIVE_BANDS);
const meter = new BandMeter();

/** Analyser bins grouped into log-spaced bands, 0..1. */
function liveBands(sampleRate: number) {
  const hzPerBin = sampleRate / (bins.length * 2);
  const k = 1 - settings.smoothing * 0.9;
  for (let b = 0; b < LIVE_BANDS; b++) {
    const lo = 35 * Math.pow(16000 / 35, b / LIVE_BANDS);
    const hi = 35 * Math.pow(16000 / 35, (b + 1) / LIVE_BANDS);
    const from = Math.max(1, Math.floor(lo / hzPerBin));
    const to = Math.max(from + 1, Math.ceil(hi / hzPerBin));
    let m = 0;
    for (let i = from; i < to && i < bins.length; i++) m = Math.max(m, bins[i]);
    // Treble reads quieter; tilt it up a little so the display is balanced.
    // The bins are already in dB; a curve keeps loud music from pinning every bar.
    const v = Math.min(1, Math.pow(m / 255, 1.8) * (0.9 + (b / LIVE_BANDS) * 0.5));
    liveVals[b] = v > liveVals[b] ? liveVals[b] + (v - liveVals[b]) * Math.min(1, k * 2) : liveVals[b] + (v - liveVals[b]) * k;
    livePeaks[b] = Math.max(liveVals[b], livePeaks[b] - 0.008);
  }
}

function drawLive() {
  // The lighter layouts have no live view: the screen is for the layout (and whatever is underneath).
  if (skins.skin !== 'classic') {
    if (liveDrawn) liveS.g.clearRect(0, 0, liveS.w, liveS.h);
    liveDrawn = false;
    return;
  }
  liveDrawn = true;
  const { g, w, h, dpr } = liveS;
  const hue = settings.hue;
  const mode = settings.live;

  if (mode === 'scope') {
    // Afterglow: fade the last frame rather than clearing it.
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgb(0 0 0 / 0.28)';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  } else g.clearRect(0, 0, w, h);

  // A soft glow that breathes with the bass (not when see-through over another layer).
  if (!document.body.classList.contains('see-through')) {
    const glow = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.7);
    glow.addColorStop(0, `oklch(45% 0.12 ${hue} / ${0.08 + meter.bass * 0.22})`);
    glow.addColorStop(1, 'transparent');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
  }

  if (mode === 'off') return;

  if (mode === 'spectrum') {
    const pad = 24 * dpr;
    const usable = w - pad * 2;
    const slot = usable / LIVE_BANDS;
    const bw = Math.max(dpr, slot * 0.62);
    const mid = h * 0.58;
    const maxUp = mid - 70 * dpr;
    const maxDown = (h - mid) * 0.55;
    g.globalCompositeOperation = 'lighter';
    for (let b = 0; b < LIVE_BANDS; b++) {
      const v = liveVals[b];
      const x = pad + b * slot + (slot - bw) / 2;
      const hh = Math.max(dpr, v * maxUp);
      const bh = hue - 50 + (b / LIVE_BANDS) * 110;
      g.fillStyle = `oklch(${62 + v * 26}% 0.17 ${bh})`;
      g.beginPath();
      g.roundRect(x, mid - hh, bw, hh, [bw / 2, bw / 2, 0, 0]);
      g.fill();
      g.fillStyle = `oklch(60% 0.15 ${bh} / 0.18)`;
      g.fillRect(x, mid + 2 * dpr, bw, v * maxDown);
      // Falling peak caps.
      g.fillStyle = `oklch(92% 0.06 ${bh} / 0.85)`;
      g.fillRect(x, mid - livePeaks[b] * maxUp - 3 * dpr, bw, 1.5 * dpr);
    }
    g.globalCompositeOperation = 'source-over';
    return;
  }

  if (mode === 'radial') {
    const cx = w / 2;
    const cy = h * 0.56;
    const size = Math.min(w, h);
    const r0 = size * (0.16 + meter.bass * 0.035);
    const len = size * 0.24;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineWidth = Math.max(dpr, ((Math.PI * 2 * r0) / (LIVE_BANDS * 2)) * 0.55);
    const rot = (performance.now() / 1000) * 0.08;
    for (let side = -1; side <= 1; side += 2) {
      for (let b = 0; b < LIVE_BANDS; b++) {
        const v = liveVals[b];
        const ang = rot - Math.PI / 2 + side * ((b + 0.5) / LIVE_BANDS) * Math.PI;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const l = 2 * dpr + v * len;
        g.strokeStyle = `oklch(${60 + v * 30}% 0.17 ${hue - 50 + (b / LIVE_BANDS) * 110})`;
        g.beginPath();
        g.moveTo(cx + c * r0, cy + s * r0);
        g.lineTo(cx + c * (r0 + l), cy + s * (r0 + l));
        g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = `oklch(85% 0.08 ${hue} / ${0.25 + meter.level * 0.5})`;
    g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.arc(cx, cy, r0 - 6 * dpr, 0, Math.PI * 2);
    g.stroke();
    return;
  }

  // Scope: the waveform as a glowing line.
  const mid = h * 0.58;
  const amp = h * 0.42;
  g.lineWidth = 2 * dpr;
  g.strokeStyle = `oklch(85% 0.14 ${hue})`;
  g.shadowColor = `oklch(70% 0.2 ${hue})`;
  g.shadowBlur = 12 * dpr;
  g.beginPath();
  // Start at a rising zero crossing so the trace stands still on steady tones.
  let start = 0;
  for (let i = 1; i < wave.length / 2; i++) {
    if (wave[i - 1] < 128 && wave[i] >= 128) {
      start = i;
      break;
    }
  }
  const count = Math.min(wave.length - start, 2048);
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * w;
    const y = mid + ((wave[start + i] - 128) / 128) * amp;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  g.shadowBlur = 0;
}

// --- panel -------------------------------------------------------------------

const skins = createSkins($('skin'), {
  track: () => track,
  title: () => trackName.replace(/\.[a-z0-9]+$/i, ''),
  time: () => playhead,
  playing: () => !audio.paused,
  seek: (t) => {
    followPaused = false;
    seek(t);
  },
  toggle: () => void togglePlay(),
  volume: () => settings.volume,
  muted: () => settings.muted,
  setVolume: (v) => {
    settings.volume = v;
    settings.muted = false;
    applyVolume();
    save();
  },
  loop: () => settings.loop,
  toggleLoop: () => setLoop(!settings.loop),
  toggleMute: () => {
    settings.muted = !settings.muted;
    applyVolume();
    save();
  },
  hue: () => settings.hue,
  level: () => meter.level,
  bass: () => meter.bass,
});
skins.set(settings.skin);

const refreshers: (() => void)[] = [];
function refreshPanel() {
  for (const f of refreshers) f();
}

{
  const { body, summary } = group('layout', 'Layout');
  chips(body, SKINS, () => settings.skin, (k) => {
    settings.skin = k;
    skins.set(k);
    save();
    refreshPanel();
  });
  const syncHue = rangeRow(body, 'Colour', 0, 360, 1, () => settings.hue, (v) => {
    settings.hue = v;
    applyHue();
    save();
  }, (v) => `${Math.round(v)}°`);
  toggleRow(body, 'Play and pause together with other layers', () => settings.syncPlay, (v) => {
    settings.syncPlay = v;
    sharedPlaying = null;
    save();
  });
  const about = note(body, '');
  const ABOUT: Record<Skin, string> = {
    classic: 'The full deck: live view on top, zoomable timeline and overview below.',
    capsule: 'A frosted pill at the bottom with a mini waveform. Leaves the screen to what’s underneath.',
    horizon: 'The whole song as a band of dots along the bottom; the dots near the playhead pulse.',
    ring: 'The song wrapped into a circle. Drag the ring to scrub.',
    ghost: 'A hairline progress bar and big type. Controls fade in when you move the pointer.',
    button: 'Just a play button. It fades away while the music plays; move the pointer or tap to bring it back.',
  };
  refreshers.push(() => {
    syncHue();
    summary.textContent = SKINS.find(([k]) => k === settings.skin)![1];
    about.textContent = ABOUT[settings.skin];
  });
}

{
  const { body, summary } = group('track', 'Track');
  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  buttons.innerHTML = `<button type="button" id="open" class="wide">Open file…</button><button type="button" id="demo">Demo track</button><button type="button" id="demo-loop">Demo loop</button>`;
  body.append(buttons);
  buttons.querySelector('#open')!.addEventListener('click', () => fileInput.click());
  buttons.querySelector('#demo')!.addEventListener('click', () => void loadDemo('track'));
  buttons.querySelector('#demo-loop')!.addEventListener('click', () => void loadDemo('loop'));
  const info = note(body, '');
  note(body, 'Or drop an audio file anywhere on the page.');
  const speed = document.createElement('div');
  speed.className = 'row stack';
  speed.innerHTML = '<span class="name">Speed</span>';
  body.append(speed);
  chips(speed, RATES.map((r) => [r, `${r}×`] as [number, string]), () => settings.rate, (r) => {
    settings.rate = r;
    audio.playbackRate = r;
    save();
  });
  loopSyncs.push(toggleRow(body, 'Loop', () => settings.loop, (v) => setLoop(v)));
  audio.loop = settings.loop;
  for (const f of loopSyncs) f();
  refreshers.push(() => {
    summary.textContent = track ? trackName.replace(/\.[a-z0-9]+$/i, '') : '';
    info.textContent = track
      ? `${trackName} · ${fmtTime(track.duration)} · ${(track.sampleRate / 1000).toFixed(1)} kHz · ${track.channels} ch`
      : 'No track loaded.';
  });
}

{
  const { section, body, summary } = group('timeline', 'Timeline');
  refreshers.push(() => (section.hidden = settings.skin !== 'classic'));
  const syncStyle = chips(body, STYLES, () => settings.style, (s) => {
    settings.style = s;
    save();
    refreshPanel();
  });
  const styleNote = note(body, '');
  const ABOUT: Record<Style, string> = {
    waveform: 'Peaks (faint) and loudness (solid) over time.',
    bars: 'Loudness as rounded bars with a reflection.',
    spectral: 'The waveform coloured by its sound: warm where it’s bassy, cool where it’s bright.',
    spectrogram: 'Frequency from low (bottom) to high (top) over time; brighter is louder.',
  };
  const syncZoom = rangeRow(body, 'Zoom', 0, 1, 0.001, () => (maxZoom() > 1 ? Math.log(zoom) / Math.log(maxZoom()) : 0), (v) => {
    const target = Math.pow(maxZoom(), v);
    zoomAroundPlayhead(target / zoom);
  }, () => `${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}×`);
  toggleRow(body, 'Follow the playhead', () => settings.follow, (v) => {
    settings.follow = v;
    followPaused = false;
    save();
  });
  note(body, 'Click or drag to jump. Scroll or pinch to zoom, shift-scroll to pan. Drag the box in the strip below to move around.');
  refreshers.push(() => {
    syncStyle();
    syncZoom();
    styleNote.textContent = ABOUT[settings.style];
    summary.textContent = STYLES.find(([s]) => s === settings.style)![1];
  });
}

{
  const { section, body, summary } = group('live', 'Live view');
  refreshers.push(() => (section.hidden = settings.skin !== 'classic'));
  chips(body, LIVES, () => settings.live, (m) => {
    settings.live = m;
    liveS.g.clearRect(0, 0, liveS.w, liveS.h);
    save();
    refreshPanel();
  });
  rangeRow(body, 'Smoothing', 0, 1, 0.01, () => settings.smoothing, (v) => {
    settings.smoothing = v;
    save();
  }, (v) => `${Math.round(v * 100)}%`);
  refreshers.push(() => (summary.textContent = LIVES.find(([m]) => m === settings.live)![1]));
}

const feedMeters: Record<'level' | 'bass' | 'mid' | 'treble', HTMLElement> = {} as never;
let feedReadout: HTMLElement;
{
  const { body } = group('feed', 'Data feed');
  note(body, 'What the player shares every frame: the playhead, play state, 2048 frequency bins and band levels. In X-Frame they go out on the data bus (audio.spectrum, audio.levels, transport), so a layer like the particle field can react to the song.');
  const m = document.createElement('div');
  m.className = 'meter';
  for (const k of ['level', 'bass', 'mid', 'treble'] as const) {
    const label = document.createElement('span');
    label.textContent = k;
    const bar = document.createElement('i');
    m.append(label, bar);
    feedMeters[k] = bar;
  }
  body.append(m);
  feedReadout = document.createElement('pre');
  feedReadout.className = 'readout';
  body.append(feedReadout);
}

// --- transport controls ------------------------------------------------------

$('play').addEventListener('click', () => void togglePlay());
$('mute').addEventListener('click', () => {
  settings.muted = !settings.muted;
  applyVolume();
  save();
});
$('volume').addEventListener('input', (e) => {
  settings.volume = Number((e.target as HTMLInputElement).value);
  settings.muted = false;
  applyVolume();
  save();
});
$('zoom-in').addEventListener('click', () => zoomAroundPlayhead(2));
$('zoom-out').addEventListener('click', () => zoomAroundPlayhead(0.5));
$('zoom-fit').addEventListener('click', () => {
  zoom = 1;
  clampView();
  refreshPanel();
});

// Timeline: click/drag to seek, wheel to zoom, shift+wheel or sideways to pan.
const tl = tlS.canvas;
const tlTime = (clientX: number) => {
  const r = tl.getBoundingClientRect();
  return viewStart + ((clientX - r.left) / r.width) * span();
};
const tip = $('tip');
function showTip(clientX: number) {
  const r = tl.getBoundingClientRect();
  hoverX = clientX - r.left;
  tip.hidden = !track;
  tip.textContent = fmtTime(Math.max(0, Math.min(duration(), tlTime(clientX))), zoom > 8);
  tip.style.left = `${Math.max(24, Math.min(r.width - 24, hoverX))}px`;
}
tl.addEventListener('pointerdown', (e) => {
  if (!track || e.button !== 0) return;
  tl.setPointerCapture(e.pointerId);
  scrubbing = true;
  followPaused = false;
  seek(tlTime(e.clientX));
  showTip(e.clientX);
});
tl.addEventListener('pointermove', (e) => {
  showTip(e.clientX);
  if (scrubbing) seek(tlTime(e.clientX));
});
const endScrub = () => (scrubbing = false);
tl.addEventListener('pointerup', endScrub);
tl.addEventListener('pointercancel', endScrub);
tl.addEventListener('pointerleave', () => {
  hoverX = null;
  if (!scrubbing) tip.hidden = true;
});
tl.addEventListener(
  'wheel',
  (e) => {
    if (!track) return;
    e.preventDefault();
    const dx = e.shiftKey ? e.deltaY || e.deltaX : e.deltaX;
    const dy = e.shiftKey ? 0 : e.deltaY;
    if (Math.abs(dy) > Math.abs(dx)) {
      const r = tl.getBoundingClientRect();
      const frac = (e.clientX - r.left) / r.width;
      zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0025)), tlTime(e.clientX), frac);
    } else {
      viewStart += (dx / tl.clientWidth) * span();
      clampView();
    }
    followPaused = true;
    showTip(e.clientX);
  },
  { passive: false },
);

// Overview: drag the box to pan, click elsewhere to jump there.
const ov = ovS.canvas;
let ovDrag: { grab: number } | null = null;
const ovTime = (clientX: number) => {
  const r = ov.getBoundingClientRect();
  return ((clientX - r.left) / r.width) * duration();
};
ov.addEventListener('pointerdown', (e) => {
  if (!track || e.button !== 0) return;
  ov.setPointerCapture(e.pointerId);
  const t = ovTime(e.clientX);
  if (zoom > 1.001 && t >= viewStart && t <= viewStart + span()) {
    ovDrag = { grab: t - viewStart };
    followPaused = true;
  } else {
    seek(t);
    followPaused = false;
    viewStart = t - span() / 2;
    clampView();
    ovDrag = { grab: span() / 2 };
  }
});
ov.addEventListener('pointermove', (e) => {
  if (!ovDrag) return;
  viewStart = ovTime(e.clientX) - ovDrag.grab;
  clampView();
});
ov.addEventListener('pointerup', () => (ovDrag = null));
ov.addEventListener('pointercancel', () => (ovDrag = null));

// --- panel toggle & keys -----------------------------------------------------

const panel = $('panel');
const toggle = $('toggle');
function setPanel(open: boolean) {
  panel.classList.toggle('collapsed', !open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.title = open ? 'Hide controls (H)' : 'Show controls (H)';
  toggle.textContent = open ? '⟩' : '⟨';
}
toggle.addEventListener('click', () => setPanel(panel.classList.contains('collapsed')));
if (window.matchMedia('(max-width: 720px)').matches) setPanel(false);

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === ' ') {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    void togglePlay();
  } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
    if (e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    followPaused = false;
    seek(playhead + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 5));
  } else if (k === 'ArrowUp' || k === 'ArrowDown') {
    if (e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    settings.volume = Math.max(0, Math.min(1, settings.volume + (k === 'ArrowUp' ? 0.05 : -0.05)));
    settings.muted = false;
    applyVolume();
    save();
  } else if (k === 'm' || k === 'M') {
    settings.muted = !settings.muted;
    applyVolume();
    save();
  } else if (k === 'h' || k === 'H') setPanel(panel.classList.contains('collapsed'));
  else if (k === '+' || k === '=') zoomAroundPlayhead(2);
  else if (k === '-' || k === '_') zoomAroundPlayhead(0.5);
  else if (k === '0') $('zoom-fit').click();
  else if (k === 'Home') seek(0);
});

// --- frame loop --------------------------------------------------------------

const feed = new AudioFeed();
// Handy from the console while the X-Frame bridge doesn't exist yet.
(window as unknown as { audioFeed: AudioFeed }).audioFeed = feed;

let lastReadout = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const playing = !audio.paused;
  if (track) playhead = scrubbing ? playhead : audio.currentTime;

  // Page the zoomed view along with the playhead, easing into place.
  if (track && settings.follow && !followPaused && !scrubbing && !ovDrag && zoom > 1.001) {
    const s = span();
    const rel = (playhead - viewStart) / s;
    if (rel < 0 || rel > 0.85) {
      const target = playhead - s * 0.15;
      viewStart += (target - viewStart) * (playing && rel > 0.85 && rel < 1.05 ? 0.12 : 1);
      clampView();
    }
  }

  const sr = actx?.sampleRate ?? 44100;
  if (analyser) {
    analyser.getByteFrequencyData(bins);
    analyser.getByteTimeDomainData(wave);
    meter.update(bins, sr);
  } else meter.decay();
  liveBands(sr);

  drawLive();
  if (skins.skin === 'classic') {
    drawTimeline();
    drawOverview();
  }
  skins.draw(now);
  $('cur').textContent = fmtTime(playhead);

  publishBus(now, playing);
  feed.publish({
    at: now,
    time: playhead,
    duration: duration(),
    playing,
    volume: settings.muted ? 0 : settings.volume,
    sampleRate: sr,
    bins,
    wave,
    level: meter.level,
    bass: meter.bass,
    mid: meter.mid,
    treble: meter.treble,
  });

  for (const k of ['level', 'bass', 'mid', 'treble'] as const) feedMeters[k].style.transform = `scaleX(${meter[k]})`;
  if (now - lastReadout > 120 && !$('group-feed').closest('.closed')) {
    lastReadout = now;
    feedReadout.textContent = [
      `time      ${playhead.toFixed(2)} / ${duration().toFixed(2)} s`,
      `playing   ${playing}`,
      `bins      ${bins.length} × ${(sr / (bins.length * 2)).toFixed(1)} Hz`,
      `level     ${meter.level.toFixed(2)}  bass ${meter.bass.toFixed(2)}`,
      `mid       ${meter.mid.toFixed(2)}  treble ${meter.treble.toFixed(2)}`,
    ].join('\n');
  }
}

applyHue();
applyVolume();
refreshPanel();
requestAnimationFrame(frame);
void loadDemo();
