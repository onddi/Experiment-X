// Live drums (beta): grooves played by real drummers, from the Groove MIDI
// Dataset by Google (CC BY 4.0, see grooves/README.md). Kept apart from the
// written beats: the data loads only when Live drums is used, and the sound
// engine plays it through its own path (timing and dynamics as played).

import type { Beat, DrumRow } from './drums.ts';

export const GROOVE_CREDIT = 'Played by real drummers. Groove MIDI Dataset, Google (CC BY 4.0).';

export interface GrooveInfo {
  id: string;
  style: string;
  n: number;
  drummer: number;
  bpm: number;
  bars: number;
  ev: string;
}
export interface Groove extends GrooveInfo {
  name: string;
  /** Hits sorted by time: position in beats, the drum, tom step down, velocity 0-1. */
  pos: Float32Array;
  row: DrumRow[];
  down: Uint8Array;
  vel: Float32Array;
  /** Its first bar on the 16-step grid, as a beat (with a bass line on the kicks). */
  beat: Beat;
}

const D36 = '0123456789abcdefghijklmnopqrstuvwxyz';
// The recorded drums onto this app's drums: toms step down (t u v), the ride plays as a hat.
const ROW: Record<string, [DrumRow, number]> = { k: ['k', 0], s: ['s', 0], r: ['r', 0], h: ['h', 0], i: ['h', 0], o: ['o', 0], t: ['t', 0], u: ['t', 1], v: ['t', 2], y: ['y', 0] };

function parse(g: GrooveInfo): Groove {
  const n = Math.floor(g.ev.length / 5);
  const pos = new Float32Array(n), vel = new Float32Array(n), down = new Uint8Array(n);
  const row: DrumRow[] = [];
  for (let i = 0; i < n; i++) {
    const e = g.ev.slice(i * 5, i * 5 + 5);
    pos[i] = (D36.indexOf(e[0]) * 1296 + D36.indexOf(e[1]) * 36 + D36.indexOf(e[2])) / 96;
    const [r, d] = ROW[e[3]] ?? ['h', 0];
    row.push(r);
    down[i] = d;
    vel[i] = D36.indexOf(e[4]) / 35;
  }
  // The first bar as a 16-step beat: loudest hit per drum and step.
  const best: Partial<Record<DrumRow, number[]>> = {};
  for (let i = 0; i < n && pos[i] < 3.94; i++) {
    const s = Math.round(pos[i] * 4) % 16;
    (best[row[i]] ??= new Array(16).fill(0))[s] = Math.max(best[row[i]]![s], vel[i]);
  }
  const beat: Beat = { name: `${g.style} ${g.n}` };
  for (const [r, v] of Object.entries(best) as [DrumRow, number[]][]) beat[r] = v.map((x) => (x === 0 ? '.' : x > 0.75 ? 'X' : x > 0.35 ? 'x' : 'o')).join('');
  if (beat.k) beat.b = [...beat.k].map((c, i) => (c === '.' ? '.' : i === 0 ? 'B' : 'b')).join('');
  return { ...g, name: beat.name, pos, row, down, vel, beat };
}

let all: Promise<Groove[]> | null = null;
let loaded: Groove[] | null = null;
/** Every groove, loaded the first time it is asked for. */
export function grooves(): Promise<Groove[]> {
  all ??= import('./grooves/data.json').then((m) => (loaded = (m.default as unknown as GrooveInfo[]).map(parse)));
  return all;
}
/** The grooves if they have loaded already (null until then). */
export function groovesNow() {
  return loaded;
}
export function grooveById(id: string) {
  return loaded?.find((g) => g.id === id) ?? null;
}
/** Groove styles in the order the picker lists them. */
export function grooveStyles(list: Groove[]) {
  const n = new Map<string, number>();
  for (const g of list) n.set(g.style, (n.get(g.style) ?? 0) + 1);
  return [...n.keys()].sort((a, b) => n.get(b)! - n.get(a)! || a.localeCompare(b));
}

// The style of groove that suits a genre best, for "a groove close to your beat".
const GENRE_STYLE: Record<string, string[]> = {
  rap: ['Hip-hop', 'Funk', 'Soul'], lofi: ['Hip-hop', 'Soul', 'Jazz'], triphop: ['Hip-hop', 'Soul'], breaks: ['Funk', 'Soul'], disco: ['Dance', 'Pop', 'Funk'],
  house: ['Dance', 'Pop'], garage: ['Dance', 'Funk'], jazz: ['Jazz', 'New Orleans'], afro: ['Afrobeat', 'Afro-Cuban', 'Latin', 'Highlife'], baile: ['Latin', 'Afro-Cuban'],
  dancehall: ['Reggae', 'Latin'], dub: ['Reggae'], synthwave: ['Pop', 'Rock', 'Punk'], phonk: ['Hip-hop'], trap: ['Hip-hop'], drill: ['Hip-hop'],
  band: ['Rock', 'Punk', 'Country', 'Blues', 'Gospel', 'Pop', 'Soul', 'Middle Eastern'],
};
/** The genres that suit a groove style, best first (for the Dress list). */
export function dressFor(style: string) {
  return Object.keys(GENRE_STYLE)
    .filter((id) => GENRE_STYLE[id].includes(style))
    .sort((a, b) => GENRE_STYLE[a].indexOf(style) - GENRE_STYLE[b].indexOf(style));
}
const hitsOf = (row?: string) => new Set([...(row ?? '')].map((c, i) => (c === '.' ? -1 : i)).filter((i) => i >= 0));
/** The groove closest to a written beat: same kick and snare places, a similar tempo, a fitting style. */
export function closestGroove(list: Groove[], genre: string, beat: Beat | undefined, bpm: number): Groove | null {
  const want = GENRE_STYLE[genre] ?? [];
  const k0 = hitsOf(beat?.k), s0 = hitsOf(beat?.s ?? beat?.c);
  const sim = (a: Set<number>, b: Set<number>) => {
    if (!a.size && !b.size) return 0.5;
    let both = 0;
    for (const x of a) if (b.has(x)) both++;
    return both / (a.size + b.size - both);
  };
  let best: Groove | null = null, top = -1;
  for (const g of list) {
    const st = want.indexOf(g.style);
    const score = sim(k0, hitsOf(g.beat.k)) + sim(s0, hitsOf(g.beat.s)) + (st < 0 ? 0 : 0.6 - st * 0.15) - Math.min(1, Math.abs(g.bpm - bpm) / 60) * 0.5;
    if (score > top) (top = score), (best = g);
  }
  return best;
}
