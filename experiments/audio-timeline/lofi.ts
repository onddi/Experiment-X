// Demo track: lo-fi hip hop at 82 BPM. A swung boom-bap beat, an FM
// electric piano with tape wobble, a round bass, a soft lead and vinyl
// crackle, all through a dulled "worn tape" master. 16 bars: keys alone,
// the beat comes in, the tune, a quiet break, and the beat back to end.

import { normalise, renderBars } from './instruments.ts';

const BPM = 82;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 16;
const SWING = 0.3; // off-beat 16ths land this much of a step late

type Part = 'intro' | 'beat' | 'tune' | 'break' | 'outro';
const PLAN: Part[] = [
  'intro', 'intro', 'beat', 'beat',
  'beat', 'beat', 'tune', 'tune',
  'tune', 'tune', 'break', 'break',
  'beat', 'beat', 'outro', 'outro',
];

// Fmaj9 – Em7 – Dm9 – Cmaj9, one bar each.
const CHORDS = [
  [53, 57, 60, 64, 67],
  [52, 55, 59, 62, 67],
  [50, 53, 57, 60, 64],
  [48, 52, 55, 59, 62],
];

// The tune, per chord: [beat, note, length in beats].
const TUNE: [number, number, number][][] = [
  [[0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 1], [3, 69, 1]],
  [[0, 67, 2], [2.5, 71, 0.5], [3, 72, 1]],
  [[0, 74, 1.5], [1.5, 72, 0.5], [2, 69, 1.5], [3.5, 72, 0.5]],
  [[0, 71, 1], [1, 67, 2.8]],
];

export function renderLofi(): Promise<AudioBuffer> {
  return renderBars(BARS, BAR, 2.5, (s) => (bar) => {
    const p = PLAN[bar];
    const t0 = bar * BAR;
    const at = (st: number) => t0 + (st + (st % 2 ? SWING : 0)) * STEP;
    const ci = bar % 4;
    const chord = CHORDS[ci];
    const root = chord[0] - 12;
    const last = bar === BARS - 1;

    if (bar === 0) s.crackle(0, BARS * BAR + 2, 0.55);

    // Keys: the chord on the one and a lighter push of the top notes later.
    if (last) s.keys(at(0), chord, BAR * 0.95, 0.24, 0.03);
    else {
      s.keys(at(0), chord, BEAT * 2.3, 0.24);
      s.keys(at(10), chord.slice(2), BEAT * 1.2, 0.14);
    }

    const drums = p === 'beat' || p === 'tune' || p === 'outro';
    if (drums) {
      s.kick(at(0), 0.85);
      s.kick(at(10), 0.7);
      if (bar % 2) s.kick(at(7), 0.5);
      s.snare(at(4), 0.6);
      s.snare(at(12), 0.6);
      if (bar % 4 === 3) s.snare(at(15), 0.15);
      s.sub(at(0), root, STEP * 6, 0.32);
      s.sub(at(7), root, STEP * 2, 0.25);
      s.sub(at(10), root + 7, STEP * 5, 0.28);
    }
    if (drums || p === 'break') {
      for (let st = 0; st < 16; st += 2) s.hat(at(st), st % 4 === 2 ? 0.05 : 0.035, false, 0.2);
      for (const st of [3, 11]) s.hat(at(st), 0.02, false, -0.2);
    }
    if (p === 'tune') for (const [b, m, l] of TUNE[ci]) s.lead(t0 + b * BEAT, m, l * BEAT, 0.13);
    // The break keeps just the first note of each phrase, up an octave and quiet.
    if (p === 'break') s.lead(t0, TUNE[ci][0][1] + 12, BEAT * 1.5, 0.07);
  }, { lofi: true }).then((buf) => {
    normalise(buf);
    return buf;
  });
}
