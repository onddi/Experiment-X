// A second demo: an 8-bar deep-house groove made to loop without a seam.
// 112 BPM, Dm7 – Bbmaj7 – Gm7 – A7, two bars each. The sound that rings past
// the last bar (reverb-ish tails, the last pad) is folded back onto the
// start, so playing it on repeat has no click or gap.

const BPM = 112;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 8;
const TAIL = 2; // seconds rendered past the loop, then wrapped to the start

const CHORDS = [
  [62, 65, 69, 72], // Dm7
  [58, 62, 65, 69], // Bbmaj7
  [55, 58, 62, 65], // Gm7
  [57, 61, 64, 67], // A7
];
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export const LOOP_NAME = 'Demo loop';

export async function renderLoop(): Promise<AudioBuffer> {
  const sr = 44100;
  const loopLen = Math.round(BARS * BAR * sr);
  const ctx = new OfflineAudioContext(2, loopLen + TAIL * sr, sr);

  const master = ctx.createGain();
  master.gain.value = 0.75;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  // A simple echo for the stabs and the bell, so there's a tail to wrap.
  const echo = ctx.createDelay(1);
  echo.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 2500;
  echo.connect(echoTone).connect(fb).connect(echo);
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.5;
  echoTone.connect(echoOut).connect(master);

  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const pan = (v: number) => {
    const p = ctx.createStereoPanner();
    p.pan.value = v;
    p.connect(master);
    return p;
  };
  const centre = pan(0);
  const left = pan(-0.35);
  const right = pan(0.35);

  const env = (g: GainNode, t: number, amp: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  const kick = (t: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g).connect(centre);
    o.start(t);
    o.stop(t + 0.42);
    o.onended = () => g.disconnect();
  };

  const noiseHit = (t: number, type: BiquadFilterType, freq: number, q: number, amp: number, len: number, out: AudioNode) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + len + 0.02);
    s.onended = () => g.disconnect();
  };

  // A clap: a few quick noise bursts, then a short tail.
  const clap = (t: number) => {
    for (const d of [0, 0.012, 0.024]) noiseHit(t + d, 'bandpass', 1300, 1.2, 0.45, 0.03, centre);
    noiseHit(t + 0.03, 'bandpass', 1300, 1, 0.35, 0.18, centre);
  };

  const bass = (t: number, m: number, len: number) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(m);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(160, t + len);
    f.Q.value = 4;
    const g = ctx.createGain();
    env(g, t, 0.42, 0.005, len);
    o.connect(f).connect(g).connect(centre);
    o.start(t);
    o.stop(t + len + 0.05);
    o.onended = () => g.disconnect();
  };

  const stab = (t: number, notes: number[]) => {
    for (const m of notes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(m);
      o.detune.value = (Math.random() - 0.5) * 12;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(2600, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
      const g = ctx.createGain();
      env(g, t, 0.05, 0.004, 0.28);
      o.connect(f).connect(g);
      g.connect(m % 2 ? left : right);
      g.connect(echo);
      o.start(t);
      o.stop(t + 0.35);
      o.onended = () => g.disconnect();
    }
  };

  const pad = (t: number, notes: number[], len: number) => {
    for (const m of notes) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(m - 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + len * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + len + 0.6);
      o.connect(g).connect(m % 2 ? right : left);
      o.start(t);
      o.stop(t + len + 0.7);
      o.onended = () => g.disconnect();
    }
  };

  const bell = (t: number, m: number) => {
    for (const [mult, amp] of [[1, 0.06], [3, 0.02]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = midi(m) * mult;
      const g = ctx.createGain();
      env(g, t, amp, 0.003, 0.5);
      o.connect(g);
      g.connect(right);
      g.connect(echo);
      o.start(t);
      o.stop(t + 0.6);
      o.onended = () => g.disconnect();
    }
  };

  const BASSLINE = [0, 3, 6, 10, 12, 14]; // 16th steps with a bass note
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2];

  const scheduleBar = (bar: number) => {
    const t0 = bar * BAR;
    const chord = CHORDS[Math.floor(bar / 2) % 4];
    if (bar % 2 === 0) pad(t0, chord, BAR * 2);
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * STEP;
      if (s % 4 === 0) kick(t);
      if (s === 4 || s === 12) clap(t);
      if (s % 4 === 2) noiseHit(t, 'highpass', 7500, 0.6, 0.22, 0.16, s % 8 === 2 ? left : right);
      else noiseHit(t, 'highpass', 9000, 0.5, 0.06, 0.03, s % 2 ? right : left);
      if (BASSLINE.includes(s)) bass(t, chord[0] - 24 + (s === 10 ? 12 : 0), STEP * 1.5);
      if (s === 6 || s === 14) stab(t, chord);
      // The bell arpeggio comes in for the second half, so the loop has some shape.
      if (bar >= 4 && s % 2 === 0) bell(t, chord[ARP[(s / 2) % 8]] + 12);
    }
  };

  scheduleBar(0);
  for (let bar = 1; bar < BARS; bar++) {
    void ctx.suspend(bar * BAR - 0.25).then(() => {
      scheduleBar(bar);
      void ctx.resume();
    });
  }

  const full = await ctx.startRendering();

  // Wrap the tail onto the start and cut to exactly 8 bars.
  const out = new AudioBuffer({ numberOfChannels: 2, length: loopLen, sampleRate: sr });
  let top = 0;
  for (let c = 0; c < 2; c++) {
    const src = full.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < loopLen; i++) dst[i] = src[i] + (i + loopLen < src.length ? src[i + loopLen] : 0);
    for (let i = 0; i < loopLen; i++) top = Math.max(top, Math.abs(dst[i]));
  }
  const gain = top > 0 ? 0.89 / top : 1;
  for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < loopLen; i++) d[i] *= gain;
  }
  return out;
}
