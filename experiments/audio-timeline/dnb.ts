// Demo loop: a 16-bar drum & bass loop made to repeat without a seam.
// 174 BPM in F minor: a two-step beat, a growling reese bass over a sub, and
// a dark pad, through Fm – Db – Eb – C. The sound that rings past the last
// bar (reverb, delay, the last notes) is folded back onto the start, so
// playing it on repeat has no click or gap.

import { normalise, renderBars } from './instruments.ts';

const BPM = 174;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 16;
const TAIL = 3; // seconds rendered past the loop, then wrapped to the start

// Two bars per chord: the reese/sub root and the pad voicing.
const CHORDS = [
  { root: 41, pad: [60, 65, 68] }, // Fm
  { root: 37, pad: [61, 65, 68] }, // Db
  { root: 39, pad: [63, 67, 70] }, // Eb
  { root: 36, pad: [60, 64, 67] }, // C
];

export async function renderDnb(): Promise<AudioBuffer> {
  const full = await renderBars(BARS, BAR, TAIL, (s) => (bar) => {
    const t0 = bar * BAR;
    const { root, pad } = CHORDS[Math.floor(bar / 2) % 4];
    const second = bar >= 8; // the second half gets busier
    const fill = bar % 4 === 3;

    for (let st = 0; st < 16; st++) {
      const t = t0 + st * STEP;
      if (st === 0 || st === 10 || (fill && st === 13)) s.kick(t, 1);
      if (st === 4 || st === 12) s.snare(t, 0.85);
      if (second && (st === 7 || st === 9 || (fill && st === 15))) s.snare(t, 0.2);
      if (st % 2 === 0) s.hat(t, st % 4 === 2 ? 0.1 : 0.06, false, 0.2);
      else if (second || st % 4 === 3) s.hat(t, 0.03, false, -0.25);
      if (st === 14 && bar % 2 === 1) s.hat(t, 0.08, true, 0.1);
    }
    // Sub under the kick pattern, reese across both bars of the chord.
    s.sub(t0, root - 12, STEP * 9, 0.45);
    s.sub(t0 + 10 * STEP, root - 12, STEP * 5.5, 0.45);
    if (bar % 2 === 0) {
      s.reese(t0, root, BAR * 2 - STEP * 0.5, 0.2, 260, second ? 1500 : 800);
      s.pad(t0, pad, BAR * 2, 0.018, 1200);
    }
    if (second && bar % 4 === 1) s.stab(t0 + 6 * STEP, pad.map((m) => m + 12), 0.04, 2400);
  });

  // Wrap the tail onto the start and cut to exactly 16 bars.
  const sr = full.sampleRate;
  const loopLen = Math.round(BARS * BAR * sr);
  const out = new AudioBuffer({ numberOfChannels: 2, length: loopLen, sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const src = full.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < loopLen; i++) dst[i] = src[i] + (i + loopLen < src.length ? src[i + loopLen] : 0);
  }
  normalise(out);
  return out;
}
