// Demo track: dub techno at 120 BPM in D minor. A soft, deep kick, a sub on
// the off-beats, and one minor chord stab washing through a long echo and
// reverb, its filter slowly breathing open and closed across the track.

import { normalise, renderBars } from './instruments.ts';

const BPM = 120;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 26;

const CHORD = [62, 65, 69, 72]; // Dm7
const ROOT = 26; // D1

export function renderDubTechno(): Promise<AudioBuffer> {
  return renderBars(BARS, BAR, 4, (s) => (bar) => {
    const t0 = bar * BAR;
    const kick = bar >= 4 && bar < 22;
    const bass = bar >= 6 && bar < 22 && !(bar >= 14 && bar < 16);
    // The stab's filter breathes over 8 bars.
    const cutoff = (st: number) => 500 + 1300 * (0.5 - 0.5 * Math.cos((Math.PI * 2 * (bar + st / 16)) / 8));

    for (let st = 0; st < 16; st++) {
      const t = t0 + st * STEP;
      if (kick && st % 4 === 0) s.kick(t, 0.85, 0.25);
      if (bar >= 2 && st % 4 === 2) s.hat(t, 0.06, bar >= 8 && bar < 22, 0.2);
      if (bar >= 8 && bar < 22 && st % 2 === 1) s.hat(t, 0.02, false, -0.3);
      if (bass && st % 4 === 2) s.sub(t, ROOT + (st === 14 && bar % 2 ? 3 : 0), STEP * 1.6, 0.42);
    }
    // The stab: on the "and" of one, and again later in some bars.
    s.stab(t0 + 3 * STEP, CHORD, 0.35, cutoff(3));
    if (bar % 2 === 1) s.stab(t0 + 10 * STEP, CHORD, 0.25, cutoff(10));
    if (bar % 4 === 0) s.pad(t0, CHORD.map((m) => m - 12), BAR * 4, 0.12, 700);
  }, { delayTime: BEAT * 0.75, delayFeedback: 0.68 }).then((buf) => {
    normalise(buf);
    return buf;
  });
}
