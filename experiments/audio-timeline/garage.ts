// Demo track: UK garage / 2-step at 132 BPM in G minor. Shuffled, skippy
// drums with rimshots, an organ bass, and chopped chord stabs with a little
// delay. Bouncy rather than pounding.

import { normalise, renderBars } from './instruments.ts';

const BPM = 132;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 28;
const SWING = 0.33; // off-beat 16ths land this much of a step late

type Part = 'intro' | 'groove' | 'break';
const part = (bar: number): Part => (bar < 4 ? 'intro' : bar >= 16 && bar < 20 ? 'break' : 'groove');

// Gm9 – Ebmaj9 – Cm9 – D7(b9), one bar each: stab voicing and bass root.
const CHORDS = [
  { stab: [58, 62, 65, 69], root: 31 },
  { stab: [58, 62, 65, 67], root: 27 },
  { stab: [58, 62, 63, 67], root: 36 },
  { stab: [57, 60, 63, 66], root: 26 },
];
// Bass rhythm: [step, semitones above the root, steps long].
const BASS: [number, number, number][] = [
  [0, 0, 3], [3, 12, 2], [6, 0, 2], [10, 7, 2], [12, 10, 2], [14, 12, 2],
];

export function renderGarage(): Promise<AudioBuffer> {
  return renderBars(BARS, BAR, 2, (s) => (bar) => {
    const p = part(bar);
    const t0 = bar * BAR;
    const at = (st: number) => t0 + (st + (st % 2 ? SWING : 0)) * STEP;
    const { stab, root } = CHORDS[bar % 4];

    // The 2-step: kick on the one and skipping to the "and" of three.
    if (p !== 'break') {
      s.kick(at(0), 0.95);
      s.kick(at(9), 0.55);
      if (bar % 2 === 1) s.kick(at(11), 0.4);
      if (p === 'groove') {
        s.snare(at(4), 0.75);
        s.snare(at(12), 0.75);
        s.clap(at(12), 0.35);
      }
    }
    for (let st = 0; st < 16; st++) {
      if (st % 4 === 2) s.hat(at(st), p === 'break' ? 0.07 : 0.11, p === 'groove' && st === 14, 0.15);
      else if (st % 2 === 1 && p !== 'intro') s.hat(at(st), 0.04, false, -0.25);
    }
    if (p !== 'intro') for (const st of [7, 15]) s.rim(at(st), 0.2, st === 7 ? -0.3 : 0.3);

    // Chopped stabs.
    for (const st of p === 'break' ? [0, 6] : [3, 6, 13]) s.stab(at(st), stab, p === 'break' ? 0.07 : 0.06, 2800);
    if (p === 'break' && bar % 2 === 0) s.pad(t0, stab.map((m) => m - 12), BAR * 2, 0.05, 1200);

    if (p === 'groove') for (const [st, semi, l] of BASS) s.organ(at(st), root + semi, l * STEP * 0.9, 0.32);
    if (p === 'break') s.sub(t0, root + 12, BAR * 0.9, 0.3);
  }).then((buf) => {
    normalise(buf);
    return buf;
  });
}
