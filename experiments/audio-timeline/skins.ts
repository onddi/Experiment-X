// Alternative layouts for the player, made to sit over other experiments
// (e.g. layered over the particle field in X-Frame). "classic" is the full
// deck in main.ts; the others replace it with a lighter overlay:
//
//   capsule  a frosted pill at the bottom with a mini waveform
//   horizon  the whole song as a band of dots along the bottom edge
//   ring     the song wrapped into a circle; drag the ring to scrub
//   ghost    a hairline progress bar and big type; controls fade in on use
//   button   just a play button in the middle that fades away while playing
//   hidden   nothing at all; play/pause comes from X-Frame or other layers
//
// Each layout draws its timeline on one shared overlay canvas and uses
// plain DOM for buttons and hit areas.

import type { TrackAnalysis } from './analysis.ts';

export type Skin = 'classic' | 'capsule' | 'horizon' | 'ring' | 'ghost' | 'button' | 'hidden';
export const SKINS: [Skin, string][] = [
  ['classic', 'Classic'],
  ['capsule', 'Capsule'],
  ['horizon', 'Horizon'],
  ['ring', 'Ring'],
  ['ghost', 'Ghost'],
  ['button', 'Button'],
  ['hidden', 'Hidden'],
];

export interface PlayerApi {
  track(): TrackAnalysis | null;
  title(): string;
  time(): number;
  playing(): boolean;
  seek(t: number): void;
  toggle(): void;
  volume(): number;
  muted(): boolean;
  setVolume(v: number): void;
  toggleMute(): void;
  loop(): boolean;
  toggleLoop(): void;
  hue(): number;
  /** Live loudness 0..1 and bass 0..1, for small pulses. */
  level(): number;
  bass(): number;
}

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const PAUSE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
const vol = (v: number) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/>${
    v === 0 ? '<path d="M16 9.5l5 5M21 9.5l-5 5"/>' : `<path d="M15.5 9.2a4 4 0 0 1 0 5.6"/>${v > 0.5 ? '<path d="M18.3 6.6a7.6 7.6 0 0 1 0 10.8"/>' : ''}`
  }</svg>`;
const LOOP = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/></svg>';
const SKIP = (dir: 1 | -1) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${
    dir < 0 ? '<path d="M11 7l-5 5 5 5"/><path d="M18 7l-5 5 5 5"/>' : '<path d="M13 7l5 5-5 5"/><path d="M6 7l5 5-5 5"/>'
  }</svg>`;

function fmt(t: number) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  return `${m}:${String(Math.floor(t - m * 60)).padStart(2, '0')}`;
}

// Loudness per bar across the whole song, 0..1. Cached per track and count.
const barCache = new WeakMap<TrackAnalysis, Map<number, Float32Array>>();
function songBars(a: TrackAnalysis, n: number) {
  let byN = barCache.get(a);
  if (!byN) barCache.set(a, (byN = new Map()));
  const hit = byN.get(n);
  if (hit) return hit;
  const out = new Float32Array(n);
  const len = a.max.length;
  for (let i = 0; i < n; i++) {
    const b0 = Math.floor((i / n) * len);
    const b1 = Math.max(b0 + 1, Math.floor(((i + 1) / n) * len));
    let peak = 0;
    let rms = 0;
    for (let b = b0; b < b1 && b < len; b++) {
      peak = Math.max(peak, a.max[b], -a.min[b]);
      rms = Math.max(rms, a.rms[b]);
    }
    out[i] = Math.pow(Math.min(1, peak * 0.5 + rms * 0.5), 0.8);
  }
  byN.set(n, out);
  return out;
}

export function createSkins(root: HTMLElement, api: PlayerApi) {
  root.innerHTML = `
    <canvas class="skin-canvas" aria-hidden="true"></canvas>

    <div class="sk sk-capsule">
      <div class="cap">
        <button class="sk-play cap-play" data-act="toggle" aria-label="Play"></button>
        <div class="cap-meta"><b data-text="title"></b><span data-text="clock"></span></div>
        <div class="cap-wave" data-seek="capsule" role="slider" aria-label="Position" tabindex="0"></div>
        <button class="sk-loop" data-act="loop" aria-label="Loop">${LOOP}</button>
        <button class="sk-mute" data-act="mute" aria-label="Mute"></button>
        <input class="sk-vol" type="range" min="0" max="1" step="0.01" aria-label="Volume" />
      </div>
    </div>

    <div class="sk sk-horizon">
      <div class="hz-head">
        <div class="hz-left">
          <button class="sk-play hz-play" data-act="toggle" aria-label="Play"></button>
          <div><small>Now playing</small><b data-text="title"></b></div>
        </div>
        <div class="hz-time"><span data-text="time"></span><em data-text="dur"></em></div>
      </div>
      <div class="hz-band" data-seek="horizon" role="slider" aria-label="Position" tabindex="0"></div>
      <div class="hz-foot"><button class="sk-loop" data-act="loop" aria-label="Loop">${LOOP}</button><button class="sk-mute" data-act="mute" aria-label="Mute"></button><input class="sk-vol" type="range" min="0" max="1" step="0.01" aria-label="Volume" /></div>
    </div>

    <div class="sk sk-ring">
      <div class="ring-title"><b data-text="title"></b><small>Drag the ring to scrub</small></div>
      <div class="ring-hit" data-seek="ring" role="slider" aria-label="Position" tabindex="0"></div>
      <div class="ring-centre">
        <button class="sk-play ring-play" data-act="toggle" aria-label="Play"></button>
        <span data-text="clock"></span>
      </div>
      <div class="ring-vol"><button class="sk-loop" data-act="loop" aria-label="Loop">${LOOP}</button><button class="sk-mute" data-act="mute" aria-label="Mute"></button><input class="sk-vol" type="range" min="0" max="1" step="0.01" aria-label="Volume" /></div>
    </div>

    <div class="sk sk-button">
      <button class="sk-play bt-play" data-act="toggle" aria-label="Play"></button>
    </div>

    <div class="sk sk-ghost">
      <div class="gh-bar" data-seek="ghost" role="slider" aria-label="Position" tabindex="0"><i class="gh-fill"></i><i class="gh-knob"></i></div>
      <div class="gh-text"><span data-text="clock2"></span><b data-text="title"></b></div>
      <div class="gh-controls">
        <button class="gh-skip" data-act="back" aria-label="Back 5 seconds">${SKIP(-1)}</button>
        <button class="sk-play gh-play" data-act="toggle" aria-label="Play"></button>
        <button class="gh-skip" data-act="fwd" aria-label="Forward 5 seconds">${SKIP(1)}</button>
        <button class="sk-loop" data-act="loop" aria-label="Loop">${LOOP}</button>
        <button class="sk-mute" data-act="mute" aria-label="Mute"></button>
      </div>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>('.skin-canvas')!;
  const g = canvas.getContext('2d')!;
  let dpr = 1;
  new ResizeObserver(() => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(root.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(root.clientHeight * dpr));
  }).observe(root);

  let skin: Skin = 'classic';
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];

  // --- buttons ---------------------------------------------------------------
  root.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'toggle') api.toggle();
    else if (act === 'mute') api.toggleMute();
    else if (act === 'loop') api.toggleLoop();
    else if (act === 'back') api.seek(api.time() - 5);
    else if (act === 'fwd') api.seek(api.time() + 5);
  });
  for (const input of all('.sk-vol') as HTMLInputElement[]) {
    input.addEventListener('input', () => api.setVolume(Number(input.value)));
  }

  // --- seeking: click or drag on a layout's timeline --------------------------
  const fraction = (el: HTMLElement, e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    if (el.dataset.seek === 'ring') {
      // Clockwise from 12 o'clock.
      const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
      return (a / (Math.PI * 2) + 1) % 1;
    }
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  let dragging: HTMLElement | null = null;
  for (const el of all('[data-seek]')) {
    el.addEventListener('pointerdown', (e) => {
      const a = api.track();
      if (!a || e.button !== 0) return;
      if (el.dataset.seek === 'ring') {
        // Only the ring itself, not the hole in the middle.
        const r = el.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (d < r.width * 0.3) return;
      }
      el.setPointerCapture(e.pointerId);
      dragging = el;
      api.seek(fraction(el, e) * a.duration);
    });
    el.addEventListener('pointermove', (e) => {
      const a = api.track();
      if (dragging === el && a) api.seek(fraction(el, e) * a.duration);
    });
    const end = () => (dragging = null);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        api.seek(api.time() + (e.key === 'ArrowLeft' ? -5 : 5));
      }
    });
  }

  // Ghost: controls show while you use it, then fade away.
  let awakeUntil = 0;
  const wake = () => (awakeUntil = performance.now() + 2500);
  // On window: the layer itself lets the pointer through to the page below.
  window.addEventListener('pointermove', wake);
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
  root.addEventListener('focusin', wake);

  // --- text & state that changes over time -------------------------------------
  const lastText = new Map<HTMLElement, string>();
  const setText = (el: HTMLElement, s: string) => {
    if (lastText.get(el) !== s) {
      lastText.set(el, s);
      el.textContent = s;
    }
  };
  let lastPlaying: boolean | null = null;
  let lastVol = -1;

  function syncDom(now: number) {
    const a = api.track();
    const t = api.time();
    const d = a?.duration ?? 0;
    const title = api.title() || (a ? 'Untitled' : 'No track');
    for (const el of all(`.sk-${skin} [data-text]`)) {
      const k = el.dataset.text;
      setText(
        el,
        k === 'title' ? title : k === 'clock' ? `${fmt(t)} / ${fmt(d)}` : k === 'clock2' ? `${fmt(t)} — ${fmt(d)}` : k === 'time' ? fmt(t) : ` / ${fmt(d)}`,
      );
    }
    const playing = api.playing();
    if (playing !== lastPlaying) {
      lastPlaying = playing;
      for (const b of all('.sk-play')) {
        b.innerHTML = playing ? PAUSE : PLAY;
        b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      }
    }
    for (const b of all('.sk-loop')) {
      b.classList.toggle('on', api.loop());
      b.setAttribute('aria-pressed', String(api.loop()));
    }
    const v = api.muted() ? 0 : api.volume();
    if (v !== lastVol) {
      lastVol = v;
      for (const b of all('.sk-mute')) {
        b.innerHTML = vol(v);
        b.setAttribute('aria-label', api.muted() ? 'Unmute' : 'Mute');
      }
      for (const i of all('.sk-vol') as HTMLInputElement[]) {
        i.value = String(api.volume());
        i.style.setProperty('--fill', `${api.volume() * 100}%`);
      }
    }
    if (skin === 'ghost') {
      const f = d ? t / d : 0;
      q('.gh-fill').style.transform = `scaleX(${f})`;
      q('.gh-knob').style.left = `${f * 100}%`;
    }
    root.classList.toggle('awake', !playing || now < awakeUntil || dragging !== null);
    for (const el of all('[data-seek]')) {
      el.setAttribute('aria-valuemin', '0');
      el.setAttribute('aria-valuemax', String(Math.round(d)));
      el.setAttribute('aria-valuenow', String(Math.round(t)));
      el.setAttribute('aria-valuetext', `${fmt(t)} of ${fmt(d)}`);
    }
  }

  // --- drawing --------------------------------------------------------------
  const rel = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    return { x: (r.left - o.left) * dpr, y: (r.top - o.top) * dpr, w: r.width * dpr, h: r.height * dpr };
  };

  function drawCapsule(a: TrackAnalysis, f: number, hue: number) {
    const r = rel(q('.cap-wave'));
    const step = 4 * dpr;
    const n = Math.max(8, Math.floor(r.w / step));
    const bars = songBars(a, n);
    const bw = 2 * dpr;
    for (let i = 0; i < n; i++) {
      const h = Math.max(2 * dpr, (0.14 + bars[i] * 0.86) * r.h);
      g.fillStyle = (i + 0.5) / n < f ? `oklch(80% 0.15 ${hue})` : 'rgb(255 255 255 / 0.22)';
      g.beginPath();
      g.roundRect(r.x + i * step + (step - bw) / 2, r.y + (r.h - h) / 2, bw, h, bw / 2);
      g.fill();
    }
  }

  function drawHorizon(a: TrackAnalysis, f: number, hue: number) {
    const r = rel(q('.hz-band'));
    const gap = 7 * dpr;
    const cols = Math.max(16, Math.floor(r.w / (8 * dpr)));
    const bars = songBars(a, cols);
    const mid = r.y + r.h / 2;
    const maxDots = Math.max(2, Math.floor(r.h / 2 / gap));
    const pulse = api.level();
    const playedCol = f * cols;
    for (let i = 0; i < cols; i++) {
      const played = i < playedCol;
      // Dots near the playhead swell with the music.
      const near = Math.max(0, 1 - Math.abs(i - playedCol) / 6);
      const n = Math.max(1, Math.round(bars[i] * maxDots * (1 + near * pulse * 0.5)));
      const x = r.x + (i + 0.5) * (r.w / cols);
      for (let k = 0; k < n; k++) {
        const fade = 1 - k / (maxDots + 2);
        g.fillStyle = played ? `oklch(82% 0.15 ${hue} / ${(0.95 * fade).toFixed(3)})` : `rgb(207 211 224 / ${(0.35 * fade).toFixed(3)})`;
        const jx = (((i * 31 + k * 17) % 7) / 7 - 0.5) * dpr * 2;
        const rad = (1.5 + near * pulse * 1.2) * dpr;
        for (const side of k === 0 ? [0] : [-1, 1]) {
          g.beginPath();
          g.arc(x + jx, mid + side * k * gap, rad, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    const px = r.x + f * r.w;
    g.fillStyle = '#fff';
    g.shadowColor = `oklch(80% 0.18 ${hue})`;
    g.shadowBlur = 14 * dpr;
    g.fillRect(px - dpr, r.y - 8 * dpr, 2 * dpr, r.h + 16 * dpr);
    g.shadowBlur = 0;
  }

  function drawRing(a: TrackAnalysis, f: number, hue: number) {
    const r = rel(q('.ring-hit'));
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const size = Math.min(r.w, r.h);
    const r0 = size * 0.31 * (1 + api.bass() * 0.025);
    const len = size * 0.17;
    const n = 180;
    const bars = songBars(a, n);
    g.lineCap = 'round';
    g.lineWidth = Math.max(dpr, ((Math.PI * 2 * r0) / n) * 0.5);
    for (let i = 0; i < n; i++) {
      const ang = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const l = 3 * dpr + bars[i] * len;
      g.strokeStyle = (i + 0.5) / n < f ? `oklch(80% 0.15 ${hue})` : 'rgb(255 255 255 / 0.25)';
      g.beginPath();
      g.moveTo(cx + c * r0, cy + s * r0);
      g.lineTo(cx + c * (r0 + l), cy + s * (r0 + l));
      g.stroke();
    }
    // Progress arc inside the bars.
    const ra = r0 - 12 * dpr;
    g.lineWidth = 3 * dpr;
    g.strokeStyle = 'rgb(255 255 255 / 0.08)';
    g.beginPath();
    g.arc(cx, cy, ra, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = `oklch(80% 0.15 ${hue})`;
    g.beginPath();
    g.arc(cx, cy, ra, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
    g.stroke();
    const pa = -Math.PI / 2 + f * Math.PI * 2;
    g.fillStyle = '#fff';
    g.shadowColor = `oklch(80% 0.18 ${hue})`;
    g.shadowBlur = 16 * dpr;
    g.beginPath();
    g.arc(cx + Math.cos(pa) * ra, cy + Math.sin(pa) * ra, 6 * dpr, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }

  return {
    /** A pointer event seen by another layer (we don't get the mouse). x, y are 0..1 of the viewport. */
    remotePointer(type: 'down' | 'move', x: number, y: number) {
      const wasAwake = root.classList.contains('awake');
      wake();
      if (type !== 'down' || skin === 'classic' || skin === 'hidden') return;
      // A tap on one of our (visible) buttons still presses it.
      const el = document.elementFromPoint(x * innerWidth, y * innerHeight);
      const btn = el?.closest<HTMLElement>('.sk [data-act]');
      if (btn && wasAwake) btn.click();
    },
    get skin() {
      return skin;
    },
    set(next: Skin) {
      skin = next;
      root.dataset.skin = next;
      document.body.classList.toggle('skinned', next !== 'classic');
      lastText.clear();
      lastPlaying = null;
      lastVol = -1;
      wake();
    },
    draw(now: number) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (skin === 'classic' || skin === 'hidden') return;
      syncDom(now);
      const a = api.track();
      if (!a) return;
      const f = a.duration ? Math.max(0, Math.min(1, api.time() / a.duration)) : 0;
      const hue = api.hue();
      if (skin === 'capsule') drawCapsule(a, f, hue);
      else if (skin === 'horizon') drawHorizon(a, f, hue);
      else if (skin === 'ring') drawRing(a, f, hue);
    },
  };
}
