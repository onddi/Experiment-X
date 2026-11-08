// Demo track: acid techno at 132 BPM in A minor. A 303-style line (saw,
// screaming resonant filter, accents and slides) over a four-to-the-floor
// beat. The filter is the song: it creeps open through the intro and build,
// sweeps on its own in the breakdown and wobbles wide open in the drop.

import { normalise, renderBars } from './instruments.ts';

const BPM = 132;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 32;
const ROOT = 45; // A2

type Part = 'intro' | 'build' | 'break' | 'drop' | 'outro';
const part = (bar: number): Part =>
  bar < 8 ? 'intro' : bar < 16 ? 'build' : bar < 20 ? 'break' : bar < 28 ? 'drop' : 'outro';

// 16 steps of [semitones above the root, accent, slide]; null is a rest.
type Step = [number, boolean, boolean] | null;
const _ = null;
const A: Step[] = [
  [0, true, false], [0, false, false], [12, false, true], [0, false, false],
  _, [0, false, false], [3, true, false], [0, false, true],
  [7, false, false], [0, false, false], [12, true, true], [10, false, false],
  [0, false, false], _, [3, false, false], [5, false, true],
];
const B: Step[] = [
  [0, true, false], [12, false, true], [0, false, false], [0, true, false],
  [15, false, true], [12, false, false], _, [0, false, false],
  [7, true, true], [5, false, true], [3, false, false], [0, true, false],
  _, [12, false, true], [10, false, false], [3, true, true],
];

// Where the filter rests, by position in the song (bar + fraction).
function cutoffAt(x: number): number {
  const lerp = (a: number, b: number, f: number) => a + (b - a) * Math.max(0, Math.min(1, f));
  if (x < 8) return lerp(160, 420, (x - 2) / 6);
  if (x < 16) return lerp(420, 1300, (x - 8) / 8);
  if (x < 20) return 250 + 2300 * Math.pow(Math.sin((Math.PI * (x - 16)) / 4), 2);
  if (x < 28) return 800 + 1700 * (0.5 - 0.5 * Math.cos((Math.PI * 2 * (x - 20)) / 4));
  return lerp(900, 180, (x - 28) / 4);
}

export function renderAcid(): Promise<AudioBuffer> {
  return renderBars(BARS, BAR, 2, (s) => (bar) => {
    const p = part(bar);
    const t0 = bar * BAR;
    const pattern = p === 'drop' ? B : A;
    const full = p === 'build' || p === 'drop';

    for (let st = 0; st < 16; st++) {
      const t = t0 + st * STEP;
      if (p !== 'break' && st % 4 === 0) s.kick(t, 1, 0.3);
      if (full && (st === 4 || st === 12)) s.clap(t, 0.75);
      if (st % 4 === 2 && (bar >= 2 || p !== 'intro')) s.hat(t, full ? 0.13 : 0.1, full);
      if (st % 2 === 1 && (bar >= 4 || p !== 'intro')) s.hat(t, p === 'break' ? 0.05 : 0.035, false, st % 4 === 1 ? -0.3 : 0.3);

      const n = pattern[st];
      if (!n || bar < 2) continue;
      const [semi, accent, slide] = n;
      const next = pattern[(st + 1) % 16];
      s.acid(t, ROOT + semi, slide && next ? STEP : STEP * 0.55, {
        cutoff: cutoffAt(bar + st / 16),
        accent,
        slideTo: slide && next ? ROOT + next[0] : undefined,
        amp: p === 'outro' ? 0.42 * (1 - (bar - 28) / 5) : 0.42,
      });
    }
    if (p === 'break' && bar % 2 === 0) s.pad(t0, [57, 60, 64, 69], BAR * 2, 0.06, 1100);
    if (bar === 18) s.riser(t0, BAR * 2);
    if (bar === 20) s.hat(t0, 0.3, true);
  }).then((buf) => {
    normalise(buf);
    return buf;
  });
}
