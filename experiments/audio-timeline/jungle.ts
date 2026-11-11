// Demo track: jungle at 165 BPM in A minor. Chopped breakbeats with ghost
// snares and a re-cut every fourth bar, a rolling sub that drops in pitch at
// the end of its phrases, and dub stabs with a long echo.

import { normalise, renderBars } from './instruments.ts';

const BPM = 165;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 32;

type Part = 'intro' | 'main' | 'break';
const part = (bar: number): Part => (bar < 8 ? 'intro' : bar >= 24 && bar < 28 ? 'break' : 'main');

// Break patterns, 16 steps: k = kick, S = snare, g = ghost snare, . = nothing.
const BREAKS = [
  'k.k.S..g.gk.S..g',
  'k.k.S..g.gk.S.g.',
  'k.k.S..g.gk.S..g',
  'k..kS.g.SgkkS.SS',
];
const ROOTS = [33, 33, 29, 31]; // A, A, F, G: two bars each
const STABS = [
  [57, 60, 64],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
];

export function renderJungle(): Promise<AudioBuffer> {
  return renderBars(BARS, BAR, 2.5, (s) => (bar) => {
    const p = part(bar);
    const t0 = bar * BAR;
    const ci = Math.floor(bar / 2) % 4;
    const drums = p === 'main' || (p === 'intro' && bar >= 4);

    if (drums) {
      const pat = BREAKS[bar % 4];
      for (let st = 0; st < 16; st++) {
        const t = t0 + st * STEP;
        const c = pat[st];
        if (c === 'k') s.kick(t, 0.85);
        else if (c === 'S') s.snare(t, 0.95);
        else if (c === 'g') s.snare(t, 0.3);
        if (st % 2 === 0) s.hat(t, 0.07, st % 8 === 6, 0.2);
        else s.hat(t, 0.03, false, -0.2);
      }
    }
    if (p === 'main' || p === 'break') {
      // Sub: hold, re-hit, then drop a fourth at the end of the two bars.
      if (bar % 2 === 0) s.boom(t0, ROOTS[ci], BAR * 1.2, { amp: 0.55, drive: 1.2 });
      else s.boom(t0 + 4 * STEP, ROOTS[ci], BAR * 0.7, { amp: 0.55, drive: 1.2, slideTo: ROOTS[ci] - 5, slideAt: BAR * 0.5 });
    }
    if (bar % 2 === 0) s.stab(t0 + 6 * STEP, STABS[ci], p === 'main' ? 0.08 : 0.24, 1800);
    if (bar % 4 === 0) s.pad(t0, STABS[ci].map((m) => m - 12), BAR * 4, p === 'main' ? 0.05 : 0.2, 1000);
    if (bar === 6) s.riser(t0, BAR * 2, 0.25);
  }, { delayTime: BEAT * 0.75, delayFeedback: 0.55 }).then((buf) => {
    normalise(buf);
    return buf;
  });
}
