// Animate values: a setting swings around its knob (a wave) or follows a
// loop of keyframes, timed in bars of the music's tempo (or the set tempo).
// Both are offsets from the knob, as a share of the setting's whole range,
// so turning the knob still moves the whole thing.
//
// Stored in settings.anim as JSON text: { key: Anim, ... } ('' for none).

export type Wave = 'sine' | 'tri' | 'ramp' | 'square' | 'steps' | 'drift';
export type Ease = 'smooth' | 'line' | 'step';
export type WaveAnim = { m: 'wave'; s: Wave; b: number; d: number; p?: number };
// k: points [where in the loop 0..1, offset −1..1].
export type KeysAnim = { m: 'keys'; b: number; e: Ease; k: [number, number][] };
export type Anim = WaveAnim | KeysAnim;
export type AnimMap = Record<string, Anim>;

export const WAVES: [Wave, string][] = [
  ['sine', 'Sine'], ['tri', 'Triangle'], ['ramp', 'Ramp'], ['square', 'Square'], ['steps', 'Random steps'], ['drift', 'Drift'],
];
export const EASES: [Ease, string][] = [['smooth', 'Smooth'], ['line', 'Straight'], ['step', 'Jump']];
export const CYCLES = [0.25, 0.5, 1, 2, 4, 8, 16];
export const cycleLabel = (b: number) => (b === 0.25 ? '¼ bar' : b === 0.5 ? '½ bar' : `${b} bar${b === 1 ? '' : 's'}`);

let cacheText = '';
let cacheMap: AnimMap = {};
export function parseAnim(text: string): AnimMap {
  if (text === cacheText) return cacheMap;
  let m: AnimMap = {};
  try {
    const raw = text ? JSON.parse(text) : {};
    if (raw && typeof raw === 'object') m = raw as AnimMap;
  } catch {
    m = {};
  }
  cacheText = text;
  cacheMap = m;
  return m;
}
export const formatAnim = (m: AnimMap) => (Object.keys(m).length ? JSON.stringify(m) : '');

const fract = (x: number) => x - Math.floor(x);
const hash = (i: number) => fract(Math.sin(i * 12.9898 + 78.233) * 43758.5453);
const smooth = (t: number) => t * t * (3 - 2 * t);

// −1..1 at a point in the cycle (x counts cycles).
export function waveAt(s: Wave, x: number): number {
  const f = fract(x);
  switch (s) {
    case 'sine': return Math.sin(2 * Math.PI * x);
    case 'tri': return 1 - 4 * Math.abs(fract(x + 0.25) - 0.5);
    case 'ramp': return 2 * f - 1;
    case 'square': return f < 0.5 ? 1 : -1;
    case 'steps': return hash(Math.floor(x * 4)) * 2 - 1;
    case 'drift': {
      const i = Math.floor(x * 2);
      return (hash(i) + (hash(i + 1) - hash(i)) * smooth(fract(x * 2))) * 2 - 1;
    }
  }
}

// The keyframe loop at x (0..1), wrapping from the last point to the first.
export function keysAt(a: KeysAnim, x: number): number {
  const k = [...a.k].sort((p, q) => p[0] - q[0]);
  if (!k.length) return 0;
  if (k.length === 1) return k[0][1];
  const n = k.length;
  const i = k.findIndex((p) => p[0] > x);
  const [t0, v0] = i === -1 ? k[n - 1] : i === 0 ? [k[n - 1][0] - 1, k[n - 1][1]] : k[i - 1];
  const [t1, v1] = i === -1 ? [k[0][0] + 1, k[0][1]] : k[i];
  if (a.e === 'step') return v0;
  const t = t1 - t0 > 1e-6 ? (x - t0) / (t1 - t0) : 0;
  return v0 + (v1 - v0) * (a.e === 'smooth' ? smooth(t) : t);
}

// Where in its loop an animation is (0..1) at a song position in beats.
export const animPhase = (a: Anim, beats: number) => fract(beats / (a.b * 4) + (a.m === 'wave' ? a.p ?? 0 : 0));
// The offset, as a share of the setting's range.
export function animOffset(a: Anim, beats: number): number {
  if (a.m === 'wave') return a.d * waveAt(a.s, beats / (a.b * 4) + (a.p ?? 0));
  return keysAt(a, animPhase(a, beats));
}

// A recorded move, sampled every frame, thinned to the points that matter.
export function thin(pts: [number, number][], tol = 0.02): [number, number][] {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const walk = (a: number, b: number) => {
    let far = -1;
    let best = tol;
    for (let i = a + 1; i < b; i++) {
      const t = (pts[i][0] - pts[a][0]) / Math.max(1e-6, pts[b][0] - pts[a][0]);
      const d = Math.abs(pts[i][1] - (pts[a][1] + (pts[b][1] - pts[a][1]) * t));
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far < 0) return;
    keep[far] = true;
    walk(a, far);
    walk(far, b);
  };
  walk(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]).map(([t, v]) => [+t.toFixed(4), +v.toFixed(4)] as [number, number]);
}
