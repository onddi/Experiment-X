// A short synthesised demo track, so the player has something to show
// before you load your own. 120 BPM, 20 bars with a clear structure
// (intro, groove, breakdown with a riser, drop, outro), so every timeline
// style has sections to show.

const BPM = 120;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BARS = 20;

// Section of each bar.
type Part = 'intro' | 'groove' | 'break' | 'drop' | 'outro';
const PLAN: Part[] = [
  'intro', 'intro', 'intro', 'intro',
  'groove', 'groove', 'groove', 'groove',
  'break', 'break',
  'drop', 'drop', 'drop', 'drop', 'drop', 'drop', 'drop', 'drop',
  'outro', 'outro',
];

// Am - F - C - G, as MIDI roots and triads.
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export async function renderDemo(): Promise<AudioBuffer> {
  const sr = 44100;
  const length = Math.ceil((BARS * BAR + 1.5) * sr);
  const ctx = new OfflineAudioContext(2, length, sr);

  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);

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

  const kick = (t: number, amp = 1) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g).connect(centre);
    o.start(t);
    o.stop(t + 0.5);
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

  const snare = (t: number) => {
    noiseHit(t, 'bandpass', 1900, 0.8, 0.7, 0.2, centre);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.1);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(centre);
    o.start(t);
    o.stop(t + 0.15);
    o.onended = () => g.disconnect();
  };

  const hatL = pan(-0.3);
  const hatR = pan(0.3);
  const hat = (t: number, open: boolean, i: number) =>
    noiseHit(t, 'highpass', 8000, 0.5, open ? 0.22 : 0.14, open ? 0.18 : 0.04, i % 2 ? hatR : hatL);

  const bass = (t: number, freq: number, len: number) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + len);
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(f).connect(g).connect(centre);
    o.start(t);
    o.stop(t + len + 0.02);
    o.onended = () => g.disconnect();
  };

  const padL = pan(-0.5);
  const padR = pan(0.5);
  const pad = (t: number, notes: number[], len: number, amp: number, bright: number) => {
    for (const m of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(m);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = bright;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(amp, t + len * 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + len);
        o.connect(f).connect(g).connect(det < 0 ? padL : padR);
        o.start(t);
        o.stop(t + len + 0.05);
        o.onended = () => g.disconnect();
      }
    }
  };

  const leadOut = pan(0.15);
  const pluck = (t: number, m: number, amp: number) => {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = midi(m);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(f).connect(g).connect(leadOut);
    o.start(t);
    o.stop(t + 0.25);
    o.onended = () => g.disconnect();
  };

  const scheduleBar = (bar: number) => {
    const part = PLAN[bar];
    const t0 = bar * BAR;
    const chord = CHORDS[bar % 4];
    const root = midi(chord[0] - 24);

    // Pads everywhere, brighter and louder in the drop.
    const bright = part === 'drop' ? 2600 : part === 'break' ? 1200 + (bar - 8) * 900 : 900;
    pad(t0, chord.map((m) => m + 12), BAR, part === 'drop' ? 0.05 : 0.04, bright);

    for (let s = 0; s < 16; s++) {
      const t = t0 + s * STEP;
      const onBeat = s % 4 === 0;
      if (part === 'intro') {
        if (s % 2 === 0) hat(t, false, s);
        if (bar >= 2 && onBeat) kick(t, 0.5);
      }
      if (part === 'groove' || part === 'drop') {
        if (onBeat) kick(t);
        if (s === 4 || s === 12) snare(t);
        hat(t, s % 4 === 2, s);
        if (s % 2 === 0 || (part === 'drop' && s % 4 === 3)) bass(t, s % 8 === 6 ? root * 2 : root, STEP * 1.6);
      }
      if (part === 'drop') {
        const arp = [0, 1, 2, 1, 0, 2, 1, 2];
        pluck(t, chord[arp[s % 8]] + 12, 0.07);
      }
      if (part === 'break' && bar === 9) {
        // Snare roll speeding up into the drop.
        const every = s < 8 ? 4 : s < 12 ? 2 : 1;
        if (s % every === 0) noiseHit(t, 'bandpass', 2000, 0.8, 0.15 + (s / 16) * 0.5, 0.12, centre);
      }
      if (part === 'outro' && onBeat && bar === 18) kick(t, 0.6);
    }
    if (bar === 8) riser();
    // Crash on the downbeat of the drop.
    if (bar === 10) noiseHit(10 * BAR, 'highpass', 4000, 0.3, 0.5, 1.6, centre);
  };

  // Riser across the breakdown.
  const riser = () => {
    const t = 8 * BAR;
    const len = 2 * BAR;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + len);
    g.gain.setValueAtTime(0.001, t + len);
    s.connect(f).connect(g).connect(centre);
    s.start(t);
    s.stop(t + len);
    s.onended = () => g.disconnect();
  };

  // Create each bar's voices just before it plays: a graph holding every
  // note of the song at once renders many times slower.
  scheduleBar(0);
  for (let bar = 1; bar < BARS; bar++) {
    void ctx.suspend(bar * BAR - 0.25).then(() => {
      scheduleBar(bar);
      void ctx.resume();
    });
  }

  const out = await ctx.startRendering();
  // Normalise to -1 dBFS.
  let top = 0;
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) top = Math.max(top, Math.abs(d[i]));
  }
  const gain = top > 0 ? 0.89 / top : 1;
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  return out;
}

/** 16-bit PCM WAV, so the demo plays through the same <audio> path as a file. */
export function toWav(buffer: AudioBuffer): Blob {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  data.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buffer.sampleRate, true);
  data.setUint32(28, buffer.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, 'data');
  data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([data], { type: 'audio/wav' });
}
