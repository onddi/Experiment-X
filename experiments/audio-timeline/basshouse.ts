// Demo track: bass house at 126 BPM in F minor. A punchy four-on-the-floor
// kick with claps and open hats, answered by a driven growl bass that
// "talks" (its formants sweep from "oh" to "ah") in the gaps between kicks.

import { normalise, renderBars } from './instruments.ts';

const BPM = 126;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 28;

type Part = 'intro' | 'build' | 'drop' | 'outro';
const part = (bar: number): Part => (bar < 8 ? 'intro' : bar < 12 ? 'build' : bar < 24 ? 'drop' : 'outro');

// Growl phrase over two bars: [step (0–31), note, steps long, vowel shift].
const GROWL: [number, number, number, number][] = [
  [2, 41, 2, 0], [6, 41, 1, 1], [7, 44, 1, 0], [10, 41, 2, 1], [14, 39, 2, 0],
  [18, 41, 2, 0], [22, 46, 1, 1], [23, 44, 1, 0], [26, 41, 3, 1], [30, 36, 2, 1],
];
const VOWELS: [number, number][][] = [
  [[400, 850], [750, 1250]], // "oh" → "ah"
  [[750, 1250], [330, 2100]], // "ah" → "ee"
];

export function renderBassHouse(): Promise<AudioBuffer> {
  return renderBars(BARS, BAR, 2, (s) => (bar) => {
    const p = part(bar);
    const t0 = bar * BAR;
    const kick = p !== 'build' || bar < 11;
    const full = p === 'drop';

    for (let st = 0; st < 16; st++) {
      const t = t0 + st * STEP;
      if (kick && st % 4 === 0) s.kick(t, 1);
      if ((full || p === 'build') && (st === 4 || st === 12)) s.clap(t, 0.8);
      if (st % 4 === 2 && bar >= 2) s.hat(t, full ? 0.13 : 0.09, full);
      if (st % 2 === 1 && (bar >= 4 || full)) s.hat(t, 0.035, false, st % 4 === 1 ? -0.3 : 0.3);
      if (p === 'build' && bar >= 10 && st % (bar === 10 ? 2 : 1) === 0) s.clap(t, 0.2 + (st / 16) * 0.4);
    }
    // The growl answers the kick; in the intro it's filtered down to a hint.
    const half = (bar % 2) * 16;
    if (full || (p === 'intro' && bar >= 4) || (p === 'outro' && bar < 26)) {
      for (const [st, m, l, v] of GROWL) {
        if (st < half || st >= half + 16) continue;
        const [from, to] = VOWELS[v];
        const amp = full ? 0.3 : 0.16;
        s.growl(t0 + (st - half) * STEP, m, l * STEP * 0.9, { amp, from, to });
      }
    }
    if (p === 'build' && bar === 8) s.riser(t0, BAR * 4, 0.3);
    if (p === 'build' && bar % 2 === 0) s.stab(t0, [56, 60, 63, 67], 0.07, 2000);
    if (bar === 12) s.hat(t0, 0.3, true);
  }).then((buf) => {
    normalise(buf);
    return buf;
  });
}
