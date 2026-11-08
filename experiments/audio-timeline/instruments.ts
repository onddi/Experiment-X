// The instrument kit for the synthesised demos (techno and drum & bass):
// punchy drums through a driven drum bus, a sub, a rolling filter bass, a
// detuned "reese" bass, chord stabs into a dub delay, a dark pad and the
// techno kick rumble, all with a shared reverb. Rendered offline.

export const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Studio {
  ctx: OfflineAudioContext;
  /** `rumble` sends the kick into a dark, low-passed reverb (the techno low end). */
  kick(t: number, amp?: number, rumble?: number): void;
  snare(t: number, amp?: number): void;
  clap(t: number, amp?: number): void;
  hat(t: number, amp?: number, open?: boolean, pan?: number): void;
  sub(t: number, m: number, len: number, amp?: number): void;
  /** Short filtered saw notes for a rolling bassline; `cutoff` is the filter peak. */
  bass(t: number, m: number, len: number, amp?: number, cutoff?: number): void;
  /** Two detuned saws with a moving filter: from `from` Hz to `to` Hz over the note. */
  reese(t: number, m: number, len: number, amp?: number, from?: number, to?: number): void;
  stab(t: number, notes: number[], amp?: number, cutoff?: number): void;
  pad(t: number, notes: number[], len: number, amp?: number, cutoff?: number): void;
  /** A noise sweep that rises over `len` seconds. */
  riser(t: number, len: number, amp?: number): void;
}

/**
 * Renders a song bar by bar. `build` sets up the instruments and returns a
 * function that schedules one bar; each bar's voices are created just before
 * it plays, since a graph holding every note at once renders many times slower.
 */
export async function renderBars(
  bars: number,
  barLen: number,
  tail: number,
  build: (s: Studio) => (bar: number) => void,
  delayTime = barLen * 3 / 16,
): Promise<AudioBuffer> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil((bars * barLen + tail) * sr), sr);
  const scheduleBar = build(makeStudio(ctx, delayTime));
  scheduleBar(0);
  for (let bar = 1; bar < bars; bar++) {
    void ctx.suspend(bar * barLen - 0.25).then(() => {
      scheduleBar(bar);
      void ctx.resume();
    });
  }
  return ctx.startRendering();
}

/** Scales the first `length` samples (default: all) so the loudest sits at -1 dBFS. */
export function normalise(buf: AudioBuffer, length = buf.length) {
  let top = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < length; i++) top = Math.max(top, Math.abs(d[i]));
  }
  const gain = top > 0 ? 0.89 / top : 1;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < length; i++) d[i] *= gain;
  }
}

function makeStudio(ctx: OfflineAudioContext, delayTime: number): Studio {
  const sr = ctx.sampleRate;

  const master = ctx.createGain();
  master.gain.value = 0.6;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);

  // Drums go through a soft clipper for weight.
  const drums = ctx.createGain();
  const drive = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
  }
  drive.curve = curve;
  drive.oversample = 'none';
  drums.connect(drive).connect(master);

  // Reverb: a small feedback-comb network (Schroeder style) with damping in
  // the loops, spread across the stereo field. Much cheaper to render than a
  // ConvolverNode, which made the demos take seconds to build.
  const reverb = (decay: number, damp: number, out: AudioNode) => {
    const input = ctx.createGain();
    const diffuse = [0.0051, 0.0127].reduce<AudioNode>((node, f) => {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 1 / f;
      return node.connect(ap);
    }, input);
    [0.0297, 0.0371, 0.0411, 0.0437, 0.0313, 0.0389].forEach((d, i) => {
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = d;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = damp;
      lp.Q.value = -12; // dB: no resonant peak, so the loop gain stays under 1
      const fbk = ctx.createGain();
      fbk.gain.value = Math.pow(10, (-3 * d) / decay);
      diffuse.connect(delay).connect(lp).connect(fbk).connect(delay);
      const p = ctx.createStereoPanner();
      p.pan.value = i % 2 ? 0.7 : -0.7;
      const lvl = ctx.createGain();
      lvl.gain.value = 0.18;
      lp.connect(lvl).connect(p).connect(out);
    });
    return input;
  };
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.45;
  verbOut.connect(master);
  const verbIn = reverb(1.6, 4500, verbOut);

  // The rumble: kick into a long dark room, kept only below ~150 Hz.
  const rumbleLp = ctx.createBiquadFilter();
  rumbleLp.type = 'lowpass';
  rumbleLp.frequency.value = 150;
  rumbleLp.Q.value = 0.9;
  const rumbleHp = ctx.createBiquadFilter();
  rumbleHp.type = 'highpass';
  rumbleHp.frequency.value = 35;
  const rumbleOut = ctx.createGain();
  rumbleOut.gain.value = 1.4;
  rumbleLp.connect(rumbleHp).connect(rumbleOut).connect(master);
  const rumbleIn = reverb(2, 600, rumbleLp);

  // Dub delay for stabs: filtered feedback, panned slightly off-centre.
  const delayIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = delayTime;
  const fb = ctx.createGain();
  fb.gain.value = 0.45;
  const dTone = ctx.createBiquadFilter();
  dTone.type = 'bandpass';
  dTone.frequency.value = 1400;
  dTone.Q.value = 0.5;
  const dPan = ctx.createStereoPanner();
  dPan.pan.value = 0.35;
  delayIn.connect(delay).connect(dTone).connect(fb).connect(delay);
  dTone.connect(dPan).connect(master);
  dTone.connect(verbIn);

  const pans = new Map<number, StereoPannerNode>();
  const bus = (p: number) => {
    let n = pans.get(p);
    if (!n) {
      n = ctx.createStereoPanner();
      n.pan.value = p;
      n.connect(master);
      pans.set(p, n);
    }
    return n;
  };
  // Route a voice to its destination plus optional sends; clean up when it ends.
  const out = (g: AudioNode, dest: AudioNode, src: AudioScheduledSourceNode, sends: [AudioNode, number][] = [], extra: AudioNode[] = []) => {
    g.connect(dest);
    const sendGains = sends
      .filter(([, amt]) => amt > 0)
      .map(([to, amt]) => {
        const s = ctx.createGain();
        s.gain.value = amt;
        g.connect(s).connect(to);
        return s;
      });
    src.onended = () => {
      g.disconnect();
      for (const n of [...sendGains, ...extra]) n.disconnect();
    };
  };

  const noise = ctx.createBuffer(1, 2 * sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const noiseHit = (t: number, filters: [BiquadFilterType, number, number][], amp: number, len: number, dest: AudioNode, wet = 0) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    let node: AudioNode = s;
    const fs: AudioNode[] = [];
    for (const [type, freq, q] of filters) {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      node = node.connect(f);
      fs.push(f);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    node.connect(g);
    out(g, dest, s, [[verbIn, wet]], fs);
    s.start(t, Math.random() * 1.5);
    s.stop(t + len + 0.02);
  };

  const saws = (t: number, m: number, end: number, detunes: number[], into: AudioNode) => {
    for (const det of detunes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(m);
      o.detune.value = det;
      o.connect(into);
      o.start(t);
      o.stop(end);
      o.onended = () => o.disconnect();
    }
  };

  return {
    ctx,

    kick(t, amp = 1, rumble = 0) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.002);
      g.gain.setValueAtTime(amp, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g);
      out(g, drums, o, [[rumbleIn, rumble]]);
      o.start(t);
      o.stop(t + 0.45);
      noiseHit(t, [['highpass', 2500, 0.7]], amp * 0.18, 0.012, drums);
    },

    snare(t, amp = 0.8) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(240, t);
      o.frequency.exponentialRampToValueAtTime(175, t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp * 0.7, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g);
      out(g, drums, o);
      o.start(t);
      o.stop(t + 0.15);
      noiseHit(t, [['highpass', 1200, 0.7], ['peaking', 4500, 1]], amp * 0.65, 0.2, drums, 0.18);
    },

    clap(t, amp = 0.6) {
      for (const d of [0, 0.011, 0.022]) noiseHit(t + d, [['bandpass', 1250, 1.3]], amp, 0.025, drums);
      noiseHit(t + 0.03, [['bandpass', 1250, 1]], amp * 0.8, 0.22, drums, 0.3);
    },

    hat(t, amp = 0.12, open = false, pan = 0) {
      noiseHit(t, [['highpass', 7500, 0.6]], amp * 2.5, open ? 0.22 : 0.04, bus(pan), open ? 0.1 : 0);
    },

    sub(t, m, len, amp = 0.5) {
      const o = ctx.createOscillator();
      o.frequency.value = midi(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.01);
      g.gain.setValueAtTime(amp, t + len);
      g.gain.setTargetAtTime(0.0001, t + len, 0.025);
      o.connect(g);
      out(g, master, o);
      o.start(t);
      o.stop(t + len + 0.15);
    },

    bass(t, m, len, amp = 0.35, cutoff = 900) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 7;
      f.frequency.setValueAtTime(cutoff, t);
      f.frequency.exponentialRampToValueAtTime(120, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      f.connect(g);
      const end = t + len + 0.03;
      saws(t, m, end, [0], f);
      const sub = ctx.createOscillator();
      sub.frequency.value = midi(m);
      sub.connect(g);
      sub.start(t);
      sub.stop(end);
      out(g, master, sub, [], [f]);
    },

    reese(t, m, len, amp = 0.22, from = 300, to = 900) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 3;
      f.frequency.setValueAtTime(from, t);
      f.frequency.linearRampToValueAtTime(to, t + len * 0.6);
      f.frequency.linearRampToValueAtTime(from, t + len);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 70; // the sub lives below this
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.01);
      g.gain.setValueAtTime(amp, t + len);
      g.gain.setTargetAtTime(0.0001, t + len, 0.03);
      f.connect(hp).connect(g);
      const end = t + len + 0.2;
      const l = ctx.createStereoPanner();
      const r = ctx.createStereoPanner();
      l.pan.value = -0.5;
      r.pan.value = 0.5;
      // Two wide detuned pairs: the slow beating is what makes it growl.
      saws(t, m, end, [-14, 9], l);
      saws(t, m + 12, end, [-7, 16], r);
      l.connect(f);
      r.connect(f);
      const probe = ctx.createConstantSource();
      probe.offset.value = 0;
      probe.connect(g);
      probe.start(t);
      probe.stop(end);
      out(g, master, probe, [[verbIn, 0.06]], [f, hp, l, r]);
    },

    stab(t, notes, amp = 0.06, cutoff = 2200) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 4;
      f.frequency.setValueAtTime(cutoff, t);
      f.frequency.exponentialRampToValueAtTime(Math.min(cutoff, 350), t + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      f.connect(g);
      const end = t + 0.3;
      for (const m of notes) saws(t, m, end, [-8, 8], f);
      const probe = ctx.createConstantSource();
      probe.offset.value = 0;
      probe.connect(g);
      probe.start(t);
      probe.stop(end);
      out(g, bus(-0.15), probe, [[delayIn, 0.8], [verbIn, 0.25]], [f]);
    },

    pad(t, notes, len, amp = 0.025, cutoff = 900) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 1;
      f.frequency.setValueAtTime(cutoff * 0.6, t);
      f.frequency.linearRampToValueAtTime(cutoff, t + len * 0.5);
      f.frequency.linearRampToValueAtTime(cutoff * 0.6, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + len * 0.3);
      g.gain.setValueAtTime(amp, t + len);
      g.gain.linearRampToValueAtTime(0.0001, t + len + 0.8);
      f.connect(g);
      const end = t + len + 0.9;
      const l = ctx.createStereoPanner();
      const r = ctx.createStereoPanner();
      l.pan.value = -0.6;
      r.pan.value = 0.6;
      notes.forEach((m, i) => saws(t, m, end, [i % 2 ? -10 : 10], i % 2 ? l : r));
      l.connect(f);
      r.connect(f);
      const probe = ctx.createConstantSource();
      probe.offset.value = 0;
      probe.connect(g);
      probe.start(t);
      probe.stop(end);
      out(g, master, probe, [[verbIn, 0.6]], [f, l, r]);
    },

    riser(t, len, amp = 0.25) {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2.5;
      f.frequency.setValueAtTime(250, t);
      f.frequency.exponentialRampToValueAtTime(8000, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + len);
      g.gain.setValueAtTime(0.0001, t + len);
      s.connect(f).connect(g);
      out(g, master, s, [[verbIn, 0.4]], [f]);
      s.start(t);
      s.stop(t + len);
    },
  };
}
