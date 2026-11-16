// The sound studio: what the particle sound is playing, and when. Loaded the
// first time it is shown, so with it hidden there is nothing to pay.
//
//   mini bar  the chord now and next, the beat, a level per layer, Next ▸
//   studio    a sheet over the field with the same header and four tabs:
//             Lanes   one row per layer, notes scrolling past a playhead
//             Mixer   a level meter and mute per layer; drag to set its level
//             Roll    a piano roll: notes by pitch over the chords
//             Beat    the drum and bass steps (tap to add or silence a hit)
//                     and the chords as pads (tap to jump, hold to change)
// Tap a layer's name to mute it, hold to solo it: the same in every tab.

import { LAYERS, type Layer, type ParticleSound } from './sound.ts';

export type StudioMode = 'off' | 'mini' | 'open';
export type StudioTab = 'lanes' | 'mixer' | 'roll' | 'beat';

export const LAYER_COLOR: Record<Layer, string> = {
  chords: '#c7b8ff',
  bass: '#ff9b5c',
  drums: '#e6e6e6',
  strings: '#6fb6ff',
  steps: '#7be0c3',
  pad: '#b48cff',
  chimes: '#ffd166',
  scan: '#9ad7ff',
  grains: '#9a9aa8',
  touch: '#ff7aa8',
  accents: '#fff0b3',
};
export const LAYER_NAME: Record<Layer, string> = {
  chords: 'Chords',
  bass: 'Bass',
  drums: 'Drums',
  strings: 'Strings',
  steps: 'Steps',
  pad: 'Pad',
  chimes: 'Chimes',
  scan: 'Scan',
  grains: 'Grains',
  touch: 'Touch',
  accents: 'Accents',
};
const ROWS = ['Kick', 'Snare', 'Hat', 'Bass'];

export interface StudioHost {
  stage: HTMLElement;
  snd: () => ParticleSound | null;
  /** The layers that are switched on (not counting chords). */
  layersOn: () => Layer[];
  /** The setting a layer's mixer strip moves, and its value. */
  levelKey: (l: Layer) => string | null;
  get: (k: string) => number;
  set: (k: string, v: number) => void;
  grid: () => string;
  setGrid: (g: string) => void;
  /** Hold a chord pad: change that chord (writes Your own chords). */
  editChord: (i: number) => void;
  wide: () => boolean;
  /** The studio was opened, tucked or closed from inside it. */
  onMode: (m: StudioMode) => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// Tap and hold on one element: a tap runs tap(), holding half a second runs hold().
function tapHold(e: HTMLElement, tap: () => void, hold: () => void) {
  let timer = 0;
  let held = false;
  e.addEventListener('pointerdown', () => {
    held = false;
    timer = window.setTimeout(() => {
      held = true;
      hold();
    }, 450);
  });
  const stop = () => clearTimeout(timer);
  e.addEventListener('pointerup', stop);
  e.addEventListener('pointerleave', stop);
  e.addEventListener('pointercancel', stop);
  e.addEventListener('contextmenu', (ev) => ev.preventDefault());
  e.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (!held) tap();
  });
}

export class SoundStudio {
  mode: StudioMode = 'off';
  tab: StudioTab;
  private h: StudioHost;
  private root = el('div', 'sst');
  private mini = el('div', 'sst-mini');
  private sheet = el('section', 'sst-sheet');
  private body = el('div', 'sst-body');
  private tabsEl = el('div', 'sst-tabs');
  private last = 0;
  private layerSig = '';
  // Header bits, shared by the mini bar and the sheet.
  private hd: { chord: HTMLElement; next: HTMLElement; when: HTMLElement; beats: HTMLElement[]; bpm: HTMLElement }[] = [];
  private miniLv = el('div', 'sst-mini-lv');
  // Lanes.
  private lanes = el('div', 'sst-lanes');
  private laneNames = el('div', 'sst-lane-names');
  private laneCv = el('canvas', 'sst-cv');
  private rows: Layer[] = [];
  // Continuous layers (pad, touch, grains): their level over the last bars.
  private hist = new Float32Array(3 * 2 * 400);
  private histN = 0;
  // Mixer.
  private mixer = el('div', 'sst-mixer');
  private strips: { l: Layer; fill: HTMLElement; knob: HTMLElement; strip: HTMLElement; mute: HTMLButtonElement }[] = [];
  // Roll.
  private roll = el('div', 'sst-roll');
  private rollCv = el('canvas', 'sst-cv');
  private rollBars = 4;
  // Beat.
  private beat = el('div', 'sst-beat');
  private cells: HTMLButtonElement[] = [];
  private pads = el('div', 'sst-pads');
  private padSig = '';

  constructor(h: StudioHost, tab: StudioTab) {
    this.h = h;
    this.tab = tab;
    this.root.append(this.mini, this.sheet);
    h.stage.append(this.root);
    this.buildMini();
    this.buildSheet();
  }

  setMode(m: StudioMode) {
    this.mode = m;
    this.root.hidden = m === 'off';
    this.mini.hidden = m !== 'mini';
    this.sheet.hidden = m !== 'open';
    const s = this.h.snd();
    if (s) s.logOn = m === 'open';
    this.last = 0;
    if (m === 'open') this.showTab(this.tab);
  }

  // --- Building -----------------------------------------------------------------

  private header(into: HTMLElement, big: boolean) {
    const chord = el('span', 'sst-chord');
    const next = el('span', 'sst-next');
    const when = el('span', 'sst-when');
    const bwrap = el('span', 'sst-beats');
    bwrap.setAttribute('aria-hidden', 'true');
    const beats = [0, 1, 2, 3].map(() => bwrap.appendChild(el('span')));
    const bpm = el('span', 'sst-bpm');
    into.append(chord, next);
    if (big) into.append(when);
    into.append(bwrap);
    if (big) into.append(el('span', 'sst-gap'), bpm);
    this.hd.push({ chord, next, when, beats, bpm });
    const nx = el('button', 'sst-btn', 'Next ▸');
    nx.type = 'button';
    nx.title = 'Next chord (N)';
    nx.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.snd()?.nextChord();
    });
    return nx;
  }

  private buildMini() {
    this.mini.setAttribute('aria-label', 'Sound now');
    const nx = this.header(this.mini, false);
    const up = el('button', 'sst-icon');
    up.type = 'button';
    up.setAttribute('aria-label', 'Open the sound studio');
    up.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.onMode('open');
    });
    this.mini.append(this.miniLv, nx, up);
    // Swipe up on the bar opens the studio.
    let y0 = NaN;
    this.mini.addEventListener('pointerdown', (e) => (y0 = e.clientY));
    this.mini.addEventListener('pointerup', (e) => {
      if (y0 - e.clientY > 30) this.h.onMode('open');
      y0 = NaN;
    });
  }

  private buildSheet() {
    this.sheet.setAttribute('aria-label', 'Sound studio');
    const grab = el('div', 'sst-grab');
    grab.title = 'Drag down to tuck away';
    let y0 = NaN;
    grab.addEventListener('pointerdown', (e) => {
      y0 = e.clientY;
      grab.setPointerCapture(e.pointerId);
    });
    grab.addEventListener('pointerup', (e) => {
      if (e.clientY - y0 > 30 || Math.abs(e.clientY - y0) < 4) this.h.onMode('mini');
      y0 = NaN;
    });
    const head = el('div', 'sst-head');
    const nx = this.header(head, true);
    const down = el('button', 'sst-icon');
    down.type = 'button';
    down.setAttribute('aria-label', 'Tuck the studio away');
    down.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    down.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.onMode('mini');
    });
    head.append(nx, down);
    this.tabsEl.setAttribute('role', 'tablist');
    this.sheet.append(grab, head, this.tabsEl, this.body);
    // Lanes.
    this.laneCv.setAttribute('aria-hidden', 'true');
    const lc = el('div', 'sst-lane-cv');
    lc.append(this.laneCv);
    this.lanes.append(this.laneNames, lc);
    // Roll.
    const rz = el('div', 'sst-roll-zoom');
    const zl = el('span', 'sst-dim');
    const zoom = (d: number) => {
      this.rollBars = Math.max(1, Math.min(16, this.rollBars * d));
      zl.textContent = `${this.rollBars} bar${this.rollBars > 1 ? 's' : ''}`;
    };
    for (const [t, d] of [['−', 2], ['+', 0.5]] as const) {
      const b = el('button', 'sst-btn sst-sq', t);
      b.type = 'button';
      b.setAttribute('aria-label', d > 1 ? 'Show more bars' : 'Show fewer bars');
      b.addEventListener('click', () => zoom(d));
      rz.append(b);
    }
    rz.append(zl);
    zoom(1);
    this.rollCv.setAttribute('aria-hidden', 'true');
    const rc = el('div', 'sst-roll-cv');
    rc.append(this.rollCv);
    this.roll.append(rz, rc);
    // Beat.
    const grid = el('div', 'sst-grid');
    ROWS.forEach((name, r) => {
      grid.append(el('span', 'sst-row-name', name));
      for (let s = 0; s < 16; s++) {
        const c = el('button', 'sst-cell');
        c.type = 'button';
        c.setAttribute('aria-label', `${name}, step ${s + 1}`);
        if (s % 4 === 0) c.classList.add('bar4');
        c.addEventListener('click', () => this.editCell(r * 16 + s));
        grid.append(c);
        this.cells.push(c);
      }
    });
    const foot = el('div', 'sst-beat-foot');
    foot.append(el('span', 'sst-dim', 'Tap a step: add a hit, silence it, back to the field.'));
    const clr = el('button', 'sst-btn', 'Clear');
    clr.type = 'button';
    clr.addEventListener('click', () => this.h.setGrid(''));
    foot.append(clr);
    this.beat.append(grid, foot, el('div', 'sst-dim sst-pad-label', 'Chords · tap to jump, hold to change'), this.pads);
  }

  private tabList(): [StudioTab, string][] {
    return this.h.wide() ? [['lanes', 'Lanes + Mixer'], ['roll', 'Roll'], ['beat', 'Beat']] : [['lanes', 'Lanes'], ['mixer', 'Mixer'], ['roll', 'Roll'], ['beat', 'Beat']];
  }

  showTab(t: StudioTab) {
    const wide = this.h.wide();
    if (wide && t === 'mixer') t = 'lanes';
    this.tab = t;
    this.sheet.classList.toggle('wide', wide);
    this.tabsEl.innerHTML = '';
    for (const [k, label] of this.tabList()) {
      const b = el('button', 'sst-tab', label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(k === t));
      b.addEventListener('click', () => {
        this.showTab(k);
        try {
          localStorage.setItem('particle-field:sound-tab', k);
        } catch {
          // Private mode: the tab just isn't remembered.
        }
      });
      this.tabsEl.append(b);
    }
    this.body.innerHTML = '';
    if (t === 'lanes') {
      this.body.append(this.lanes);
      if (wide) this.body.append(this.mixer);
    } else if (t === 'mixer') this.body.append(this.mixer);
    else if (t === 'roll') this.body.append(this.roll);
    else this.body.append(this.beat);
    this.layerSig = '';
    this.padSig = '';
  }

  // The layer list changed (a layer turned on or off): rebuild names and strips.
  private syncLayers(S: ParticleSound) {
    const on = this.h.layersOn();
    const sig = on.join() + '|' + [...S.muted].join() + '|' + S.solo;
    if (sig === this.layerSig) return;
    this.layerSig = sig;
    this.rows = ['chords', ...on];
    this.laneNames.innerHTML = '';
    for (const l of this.rows) this.laneNames.append(this.layerBtn(S, l, 'sst-lane-name'));
    this.mixer.innerHTML = '';
    this.strips = [];
    // Every layer with a level gets a strip, at zero too, so it can be pulled back up.
    for (const l of LAYERS.filter((x) => this.h.levelKey(x))) {
      const strip = el('div', 'sst-strip');
      strip.classList.toggle('zero', !on.includes(l));
      const meter = el('div', 'sst-meter');
      const fill = el('div', 'sst-fill');
      fill.style.background = LAYER_COLOR[l];
      const knob = el('div', 'sst-knob');
      meter.append(fill, knob);
      const key = this.h.levelKey(l);
      if (key) {
        meter.title = 'Drag to set its level';
        const at = (e: PointerEvent) => {
          const r = meter.getBoundingClientRect();
          const v = Math.round(Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)) * 20) / 20;
          this.h.set(key, v);
        };
        meter.addEventListener('pointerdown', (e) => {
          meter.setPointerCapture(e.pointerId);
          at(e);
        });
        meter.addEventListener('pointermove', (e) => e.buttons && at(e));
      }
      const mute = el('button', 'sst-mute', 'M');
      mute.type = 'button';
      mute.setAttribute('aria-label', `Mute ${LAYER_NAME[l]}`);
      mute.addEventListener('click', () => this.toggleMute(S, l));
      strip.append(meter, this.layerBtn(S, l, 'sst-strip-name'), mute);
      this.mixer.append(strip);
      this.strips.push({ l, fill, knob, strip, mute });
    }
    this.miniLv.innerHTML = '';
    for (const l of on) {
      const b = el('span');
      b.style.background = LAYER_COLOR[l];
      b.dataset.l = l;
      this.miniLv.append(b);
    }
  }

  private layerBtn(S: ParticleSound, l: Layer, cls: string) {
    const b = el('button', cls);
    b.type = 'button';
    const dot = el('i');
    dot.style.background = LAYER_COLOR[l];
    b.append(dot, el('span', '', LAYER_NAME[l]));
    const st = S.solo === l ? 'S' : S.muted.has(l) ? 'M' : '';
    if (st) b.append(el('b', '', st));
    b.classList.toggle('off', !S.audible(l));
    b.title = 'Tap to mute, hold to hear only this';
    tapHold(b, () => this.toggleMute(S, l), () => {
      S.solo = S.solo === l ? null : l;
      this.layerSig = '';
    });
    return b;
  }

  private toggleMute(S: ParticleSound, l: Layer) {
    if (S.solo) S.solo = null;
    else if (S.muted.has(l)) S.muted.delete(l);
    else S.muted.add(l);
    this.layerSig = '';
  }

  private editCell(k: number) {
    const g = this.h.grid().padEnd(64, '.').split('');
    g[k] = g[k] === '+' ? '-' : g[k] === '-' ? '.' : '+';
    const s = g.join('');
    this.h.setGrid(/^\.*$/.test(s) ? '' : s);
  }

  // --- Each frame ------------------------------------------------------------------

  frame(now: number) {
    if (this.mode === 'off' || now - this.last < 33) return;
    this.last = now;
    const S = this.h.snd();
    if (!S) return;
    S.logOn = this.mode === 'open';
    this.syncLayers(S);
    const beat = S.beatNow;
    const inBar = Math.floor(beat) % 4;
    const next = S.chordNext();
    const left = S.beatsToChange();
    for (const H of this.hd) {
      H.chord.textContent = S.chordNow();
      H.next.textContent = next ? `→ ${next}` : '';
      H.when.textContent = left > 0 ? `in ${Math.ceil(left)} beat${Math.ceil(left) > 1 ? 's' : ''} · bar ${Math.floor(beat / 4) + 1}` : `bar ${Math.floor(beat / 4) + 1}`;
      H.beats.forEach((b, k) => b.classList.toggle('on', k === inBar));
      H.bpm.textContent = `${Math.round(S.bpmNow)} bpm`;
    }
    if (this.mode === 'mini') {
      this.miniLv.querySelectorAll<HTMLElement>('span').forEach((b) => {
        const l = b.dataset.l as Layer;
        b.style.height = `${Math.round(3 + S.levels[LAYERS.indexOf(l)] * 23)}px`;
        b.style.opacity = S.audible(l) ? '1' : '0.3';
      });
      return;
    }
    // Sample the continuous layers for their lanes.
    const k = this.histN++ % 400;
    (['pad', 'touch', 'grains'] as Layer[]).forEach((l, q) => {
      this.hist[(q * 400 + k) * 2] = beat;
      this.hist[(q * 400 + k) * 2 + 1] = S.levels[LAYERS.indexOf(l)];
    });
    if (this.tab === 'lanes') {
      this.drawLanes(S, beat);
      if (this.sheet.classList.contains('wide')) this.paintMixer(S);
    } else if (this.tab === 'mixer') this.paintMixer(S);
    else if (this.tab === 'roll') this.drawRoll(S, beat);
    else this.paintBeat(S, beat);
  }

  private fit(cv: HTMLCanvasElement) {
    const r = cv.parentElement!.getBoundingClientRect();
    const d = Math.min(2, devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * d)), H = Math.max(1, Math.round(r.height * d));
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    return { W, H, d };
  }

  private drawLanes(S: ParticleSound, now: number) {
    const cv = this.laneCv;
    const { W, H, d } = this.fit(cv);
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const PAST = 8, AHEAD = 3;
    const x = (b: number) => ((b - (now - PAST)) / (PAST + AHEAD)) * W;
    const ppb = W / (PAST + AHEAD);
    const n = this.rows.length;
    const rh = H / n;
    // Bar lines.
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let b = Math.ceil((now - PAST) / 4) * 4; b < now + AHEAD; b += 4) g.fillRect(x(b), 0, d, H);
    for (let r = 0; r < n; r++) {
      g.fillStyle = r % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
      g.fillRect(0, r * rh + d, W, rh - 2 * d);
    }
    const rowOf = new Int8Array(LAYERS.length).fill(-1);
    this.rows.forEach((l, r) => (rowOf[LAYERS.indexOf(l)] = r));
    const from = Math.max(0, S.logN - 1024);
    // Chords: a block per chord, named.
    const chords: [number, number][] = [];
    for (let k = from; k < S.logN; k++) {
      const j = k % 1024;
      if (S.evL[j] === 0) chords.push([S.evB[j], S.evP[j]]);
    }
    g.font = `600 ${Math.round(10 * d)}px Inter, system-ui, sans-serif`;
    g.textBaseline = 'middle';
    for (let c = 0; c < chords.length; c++) {
      const b0 = chords[c][0], b1 = c + 1 < chords.length ? chords[c + 1][0] : now;
      if (b1 < now - PAST) continue;
      const x0 = Math.max(0, x(b0)), x1 = x(b1);
      g.fillStyle = c % 2 ? 'rgba(199,184,255,0.55)' : 'rgba(199,184,255,0.35)';
      g.fillRect(x0 + d, 3 * d, Math.max(d, x1 - x0 - 2 * d), rh - 6 * d);
      g.fillStyle = '#14102a';
      if (x1 - x0 > 18 * d) g.fillText(S.chordName(chords[c][1]), x0 + 5 * d, rh / 2);
    }
    const nx = S.chordNext();
    if (nx && S.beatsToChange() > 0) {
      const xs = x(now + S.beatsToChange());
      if (xs < W) {
        g.strokeStyle = 'rgba(199,184,255,0.6)';
        g.setLineDash([3 * d, 3 * d]);
        g.strokeRect(xs + d, 3 * d, W - xs, rh - 6 * d);
        g.setLineDash([]);
        g.fillStyle = '#c7b8ff';
        if (W - xs > 18 * d) g.fillText(nx, xs + 5 * d, rh / 2);
      }
    }
    // Notes.
    for (let k = from; k < S.logN; k++) {
      const j = k % 1024;
      const li = S.evL[j];
      if (li === 0) continue;
      const r = rowOf[li];
      if (r < 0) continue;
      const b = S.evB[j];
      if (b < now - PAST - 2) continue;
      const l = LAYERS[li];
      const xx = x(b);
      const wv = l === 'bass' ? Math.max(2 * d, S.evD[j] * ppb * 0.9) : l === 'drums' ? 2 * d : 3 * d;
      const hv = (4 + Math.min(1, S.evV[j]) * 14) * d;
      g.globalAlpha = (S.audible(l) ? 1 : 0.3) * (b > now ? 0.5 : 1);
      g.fillStyle = LAYER_COLOR[l];
      g.fillRect(xx, r * rh + (rh - hv) / 2, wv, hv);
    }
    // Pad, touch and grains: a band that swells with their level.
    (['pad', 'touch', 'grains'] as Layer[]).forEach((l, q) => {
      const r = rowOf[LAYERS.indexOf(l)];
      if (r < 0) return;
      g.globalAlpha = S.audible(l) ? 0.85 : 0.3;
      g.fillStyle = LAYER_COLOR[l];
      for (let j = Math.max(0, this.histN - 400); j < this.histN; j++) {
        const i = (q * 400 + (j % 400)) * 2;
        const b = this.hist[i], v = this.hist[i + 1];
        if (b < now - PAST || v < 0.02) continue;
        const hv = Math.max(d, v * (rh - 6 * d));
        g.fillRect(x(b), r * rh + (rh - hv) / 2, ppb / 7.5 + d, hv);
      }
    });
    g.globalAlpha = 1;
    // Ahead: bass and drums repeat last bar's steps, drawn as outlines.
    g.setLineDash([2 * d, 2 * d]);
    for (const l of ['bass', 'drums'] as Layer[]) {
      const r = rowOf[LAYERS.indexOf(l)];
      if (r < 0) continue;
      g.strokeStyle = LAYER_COLOR[l];
      for (let q = Math.ceil(now * 4 + 0.01); q / 4 < now + AHEAD; q++) {
        const st = q % 16;
        const hit = l === 'bass' ? S.gridLast[48 + st] : S.gridLast[st] || S.gridLast[16 + st] || S.gridLast[32 + st];
        if (!hit) continue;
        const hv = (l === 'drums' && S.gridLast[st] ? 16 : 10) * d;
        g.strokeRect(x(q / 4), r * rh + (rh - hv) / 2, l === 'bass' ? 6 * d : 2 * d, hv);
      }
    }
    g.setLineDash([]);
    // Playhead.
    g.fillStyle = '#fff';
    g.fillRect(x(now) - d, 0, 2 * d, H);
  }

  private paintMixer(S: ParticleSound) {
    for (const s of this.strips) {
      const lv = S.levels[LAYERS.indexOf(s.l)];
      s.fill.style.height = `${Math.round(lv * 100)}%`;
      const key = this.h.levelKey(s.l);
      s.knob.style.bottom = key ? `calc(${Math.round(this.h.get(key) * 100)}% - 1px)` : '-10px';
      s.strip.classList.toggle('off', !S.audible(s.l));
      s.mute.classList.toggle('on', S.muted.has(s.l));
    }
  }

  private drawRoll(S: ParticleSound, now: number) {
    const cv = this.rollCv;
    const { W, H, d } = this.fit(cv);
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const PAST = this.rollBars * 4, AHEAD = Math.max(1, this.rollBars * 0.6);
    const x = (b: number) => ((b - (now - PAST)) / (PAST + AHEAD)) * W;
    const ppb = W / (PAST + AHEAD);
    const from = Math.max(0, S.logN - 1024);
    // Chords as bands behind the notes.
    const chords: [number, number][] = [];
    for (let k = from; k < S.logN; k++) {
      const j = k % 1024;
      if (S.evL[j] === 0) chords.push([S.evB[j], S.evP[j]]);
    }
    g.font = `600 ${Math.round(10 * d)}px Inter, system-ui, sans-serif`;
    g.textBaseline = 'top';
    for (let c = 0; c < chords.length; c++) {
      const b0 = chords[c][0], b1 = c + 1 < chords.length ? chords[c + 1][0] : now;
      if (b1 < now - PAST) continue;
      const x0 = Math.max(0, x(b0));
      g.fillStyle = c % 2 ? 'rgba(199,184,255,0.07)' : 'rgba(199,184,255,0.035)';
      g.fillRect(x0, 0, x(b1) - x0, H);
      g.fillStyle = 'rgba(199,184,255,0.45)';
      g.fillRect(x0, 0, d, H);
      g.fillStyle = '#c7b8ff';
      g.fillText(S.chordName(chords[c][1]), x0 + 4 * d, 3 * d);
    }
    // Octave lines (pitch 0..1 is six octaves up from A1).
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let o = 1; o < 6; o++) g.fillRect(0, H - (o / 6) * H, W, d);
    for (let k = from; k < S.logN; k++) {
      const j = k % 1024;
      const li = S.evL[j];
      if (li === 0) continue;
      const l = LAYERS[li];
      if (l === 'drums' || !this.rows.includes(l)) continue;
      const b = S.evB[j];
      if (b + S.evD[j] < now - PAST) continue;
      const y = H - Math.max(0, Math.min(1, S.evP[j])) * (H - 6 * d) - 5 * d;
      g.globalAlpha = (S.audible(l) ? 0.35 + Math.min(1, S.evV[j]) * 0.65 : 0.2) * (b > now ? 0.5 : 1);
      g.fillStyle = LAYER_COLOR[l];
      g.fillRect(x(b), y, Math.max(2 * d, S.evD[j] * ppb * 0.8), 4 * d);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#fff';
    g.fillRect(x(now) - d, 0, 2 * d, H);
  }

  private paintBeat(S: ParticleSound, now: number) {
    const st = Math.floor(now * 4) % 16;
    const ed = this.h.grid();
    for (let k = 0; k < 64; k++) {
      const s = k % 16;
      const c = this.cells[k];
      const hit = s <= st ? S.gridNow[k] : S.gridLast[k];
      const e = ed[k];
      c.classList.toggle('hit', !!hit && e !== '-');
      c.classList.toggle('ghost', s > st && !!hit);
      c.classList.toggle('add', e === '+');
      c.classList.toggle('cut', e === '-');
      c.classList.toggle('now', s === st);
    }
    // Chord pads.
    const pr = S.progression();
    const sig = pr.join() + S.chordNow();
    const cur = S.progIndex();
    if (sig !== this.padSig) {
      this.padSig = sig;
      this.pads.innerHTML = '';
      pr.forEach((deg, i) => {
        const b = el('button', 'sst-pad');
        b.type = 'button';
        b.append(el('b', '', S.chordName(deg)), el('span', '', String(deg + 1)));
        tapHold(b, () => S.jumpChord(i), () => this.h.editChord(i));
        this.pads.append(b);
      });
    }
    this.pads.querySelectorAll<HTMLElement>('.sst-pad').forEach((p, i) => {
      p.classList.toggle('on', i === cur);
      p.classList.toggle('next', pr.length > 1 && i === (cur + 1) % pr.length);
    });
  }
}
