// Demo track: dubstep at 140 BPM, half-time. A sparse intro, a snare-roll
// build, then the drop: a wobble bass whose filter is locked to the beat and
// changes speed (quarters, eighths, triplets, sixteenths), over a heavy sub.
// A short breather, a second drop, and out.

import { normalise, renderBars } from './instruments.ts';

const BPM = 140;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 32;

type Part = 'intro' | 'build' | 'drop' | 'break';
const part = (bar: number): Part =>
  bar < 8 ? 'intro' : bar < 12 ? 'build' : bar < 24 ? 'drop' : bar < 26 ? 'break' : 'drop';

// Two-bar wobble phrases: [beat, note, beats long, wobbles per beat].
const PHRASES: [number, number, number, number][][] = [
  [[0, 41, 2, 1], [2, 41, 1, 2], [3, 44, 1, 3], [4, 39, 1.5, 4], [6, 36, 2, 2]],
  [[0, 41, 1, 2], [1, 41, 1, 4], [2, 48, 1, 3], [3, 46, 1, 2], [4, 44, 2, 1], [6.5, 39, 1.5, 6]],
];
const PAD = [53, 56, 60, 63];

export function renderDubstep(): Promise<AudioBuffer> {
  return renderBars(BARS, BAR, 2, (s) => (bar) => {
    const p = part(bar);
    const t0 = bar * BAR;
    const drop = p === 'drop';

    for (let st = 0; st < 16; st++) {
      const t = t0 + st * STEP;
      if (drop) {
        if (st === 0 || (st === 10 && bar % 2 === 1) || (st === 3 && bar % 4 === 2)) s.kick(t, 1);
        if (st === 8) {
          s.snare(t, 1);
          s.clap(t, 0.5);
        }
        if (st % 2 === 0) s.hat(t, st % 4 === 2 ? 0.1 : 0.06, false, 0.2);
      } else if (p === 'intro') {
        if (bar >= 4 && st === 0) s.kick(t, 0.8);
        if (bar >= 4 && st === 8) s.snare(t, 0.7);
        if (st % 4 === 2) s.hat(t, 0.06, false, -0.2);
      } else if (p === 'build') {
        // A snare roll that doubles up into the drop.
        const every = bar < 10 ? 4 : bar === 10 ? 2 : 1;
        if (st % every === 0) s.snare(t, 0.5 + ((bar - 8) * 16 + st) / 64 * 0.5);
      }
    }
    if (drop && bar % 2 === 0) {
      for (const [b, m, l, per] of PHRASES[(bar / 2) % 2]) s.wobble(t0 + b * BEAT, m, l * BEAT * 0.97, per / BEAT, 0.3);
    }
    if ((p === 'intro' || p === 'break') && bar % 2 === 0) {
      s.pad(t0, PAD, BAR * 2, 0.07, 900);
      s.sub(t0, 29, BAR * 1.5, 0.35);
    }
    if (p === 'intro' && bar % 2 === 1) s.bell(t0, 72 + (bar % 4 === 1 ? 0 : 3), 1.5, 0.06);
    if (p === 'build' && bar === 8) s.riser(t0, BAR * 4, 0.5);
    if (bar === 12 || bar === 26) s.hat(t0, 0.3, true);
  }).then((buf) => {
    normalise(buf);
    return buf;
  });
}
