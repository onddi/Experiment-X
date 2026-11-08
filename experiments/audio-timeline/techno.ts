// Demo track: a minute of dark techno at 128 BPM in F minor. 32 bars with
// clear sections (intro, build, breakdown with a riser, drop, outro), so every
// timeline style has something to show.

import { normalise, renderBars } from './instruments.ts';

const BPM = 128;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 32;

type Part = 'intro' | 'build' | 'break' | 'drop' | 'outro';
const part = (bar: number): Part =>
  bar < 8 ? 'intro' : bar < 16 ? 'build' : bar < 20 ? 'break' : bar < 28 ? 'drop' : 'outro';

// Three bars on F, one on Ab: bass roots and stab voicings.
const ROOTS = [29, 29, 29, 32];
const STABS = [
  [56, 60, 63, 67], // Fm9 (no root)
  [56, 60, 63, 67],
  [56, 60, 63, 67],
  [56, 60, 63, 68], // Ab
];
const PAD = [53, 56, 60, 63, 67];
const BASS_STEPS = [2, 3, 6, 10, 11, 14];

export function renderTechno(): Promise<AudioBuffer> {
  return renderBars(BARS, BAR, 1.5, (s) => (bar) => {
    const p = part(bar);
    const t0 = bar * BAR;
    const root = ROOTS[bar % 4];
    const stab = STABS[bar % 4];
    const kickOn = p !== 'break';
    const bassOn = (p === 'intro' && bar >= 4) || p === 'build' || p === 'drop' || (p === 'outro' && bar < 30);

    for (let st = 0; st < 16; st++) {
      const t = t0 + st * STEP;
      if (kickOn && st % 4 === 0) s.kick(t, 1, p === 'drop' ? 0.5 : 0.35);
      if (st % 4 === 2 && (bar >= 2 || p !== 'intro')) s.hat(t, p === 'build' || p === 'drop' ? 0.13 : 0.1, p === 'build' || p === 'drop');
      if (st % 2 === 1 && (bar >= 4 || p !== 'intro') && p !== 'break') s.hat(t, 0.035, false, st % 4 === 1 ? -0.3 : 0.3);
      if ((p === 'build' || p === 'drop') && (st === 4 || st === 12)) s.clap(t, 0.8);
      if (bassOn && BASS_STEPS.includes(st)) {
        const cutoff = p === 'drop' ? 1400 : p === 'build' ? 700 + (bar - 8) * 70 : 600;
        s.bass(t, st === 11 ? root + 12 : root, STEP * (st === 2 || st === 10 ? 0.9 : 0.7), 0.4, cutoff);
      }
      if ((p === 'build' || p === 'drop' || p === 'break') && (st === 3 || st === 10)) {
        const cutoff = p === 'drop' ? 3200 : p === 'break' ? 900 + (bar - 16) * 500 : 900 + (bar - 8) * 160;
        s.stab(t, stab, p === 'break' ? 0.12 : 0.08, cutoff);
      }
    }
    if (p === 'break' && bar % 2 === 0) s.pad(t0, PAD, BAR * 2, 0.08, 1000 + (bar - 16) * 300);
    // The break keeps the low end alive with a held sub.
    if (p === 'break') s.sub(t0, ROOTS[bar % 4], BAR - STEP, 0.35);
    if (bar === 18) s.riser(t0, BAR * 2);
    if (bar === 20 || bar === 28) s.hat(t0, 0.3, true); // a splash on the downbeat
  }).then((buf) => {
    normalise(buf);
    return buf;
  });
}
