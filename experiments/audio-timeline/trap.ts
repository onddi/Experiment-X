// Demo track: trap at 140 BPM (half-time feel) in C minor. Long, driven 808s
// that glide between notes, rolling hi-hats (triplets and 32nds), a clap on
// the three, and a dark bell melody. Big gaps between quiet and loud.

import { normalise, renderBars } from './instruments.ts';

const BPM = 140;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 32;

type Part = 'intro' | 'verse' | 'break' | 'outro';
const part = (bar: number): Part =>
  bar < 4 ? 'intro' : bar < 16 ? 'verse' : bar < 20 ? 'break' : bar < 30 ? 'verse' : 'outro';

// Bell melody, one bar per entry: [beat, note, beats].
const BELL: [number, number, number][][] = [
  [[0, 72, 1], [1, 75, 1], [2, 79, 1.5], [3.5, 77, 0.5]],
  [[0, 75, 1], [1, 74, 1], [2, 72, 2]],
  [[0, 72, 1], [1, 75, 1], [2, 80, 1.5], [3.5, 79, 0.5]],
  [[0, 77, 1], [1, 75, 1], [2, 74, 1], [3, 71, 1]],
];
// 808 per bar: [step, note, steps long, glide to (optional), glide at step].
const BOOM: [number, number, number, number?, number?][][] = [
  [[0, 36, 10], [10, 36, 6, 48, 4]],
  [[0, 39, 7], [7, 39, 3], [10, 34, 6]],
  [[0, 36, 10], [10, 36, 6, 43, 3]],
  [[0, 44, 6], [6, 43, 4], [10, 31, 6, 36, 4]],
];
// How many hats in each beat of the bar: 2 = eighths, 3/6 = triplets, 8 = 32nds.
const HATS = [
  [2, 2, 2, 2],
  [2, 2, 6, 2],
  [2, 2, 2, 4],
  [2, 3, 2, 8],
];

export function renderTrap(): Promise<AudioBuffer> {
  return renderBars(BARS, BAR, 2, (s) => (bar) => {
    const p = part(bar);
    const t0 = bar * BAR;
    const i = bar % 4;

    for (const [b, m, l] of BELL[i]) s.bell(t0 + b * BEAT, m, l * BEAT + 0.6, p === 'verse' ? 0.14 : 0.38);
    if (i === 0 && p !== 'outro') s.pad(t0, [48, 51, 55, 58], BAR * 4, p === 'verse' ? 0.05 : 0.18, 800);

    if (p === 'verse') {
      for (const [st, m, l, to, at] of BOOM[i]) s.boom(t0 + st * STEP, m, l * STEP, { amp: 0.7, slideTo: to, slideAt: at !== undefined ? at * STEP : undefined });
      s.kick(t0, 0.9);
      if (i === 1 || i === 3) s.kick(t0 + 7 * STEP, 0.7);
      s.kick(t0 + 10 * STEP, 0.8);
      s.clap(t0 + 8 * STEP, 0.9);
      s.snare(t0 + 8 * STEP, 0.5);
      if (i === 3) s.clap(t0 + 15 * STEP, 0.3);
    }
    if (p === 'verse' || p === 'break') {
      HATS[bar % 4].forEach((n, b) => {
        for (let k = 0; k < n; k++) s.hat(t0 + (b + k / n) * BEAT, n > 2 ? 0.05 : 0.08, false, k % 2 ? 0.25 : -0.1);
      });
    }
    if (p === 'break' && i === 2) s.riser(t0, BAR * 2, 0.2);
    if (bar === 30) s.boom(t0, 36, BAR * 1.5, { amp: 0.6, slideTo: 24, slideAt: BAR });
  }).then((buf) => {
    normalise(buf);
    return buf;
  });
}
