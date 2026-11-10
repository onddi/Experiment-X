// Live audio analysis for the particle field.
//
// Sources: the microphone (hears whatever plays in the room), a shared
// browser tab or screen with audio (clean digital sound, e.g. the Spotify
// web player), or a local audio file. Each frame we read the spectrum and
// boil it down to a few 0..1 signals the simulation can use.

export type AudioSource = 'off' | 'mic' | 'tab' | 'file' | 'feed';

/** One frame of the X-Frame `audio.spectrum` topic: what an AnalyserNode gives. */
export type SpectrumFrame = {
  bins: Uint8Array;
  sampleRate: number;
  fftSize: number;
  // Newer players also send short-window bins for drum timing, when they were
  // measured (epoch ms) and their output latency (s, e.g. Bluetooth).
  fast?: Uint8Array;
  fastFftSize?: number;
  at?: number;
  outputLatency?: number;
};

/** How vocals are picked out: sung tones, rap / spoken syllables, or by genre. */
export type VoxMode = 'auto' | 'sung' | 'speech';

// Detector tuning per style of music. Cooldowns stop one hit triggering
// twice; sensitivity is how many standard deviations above normal a
// band's jump must be to count as a hit (lower = more hits).
export type Genre = 'general' | 'hiphop' | 'dnb' | 'afro' | 'reggae' | 'techno';

interface Tuning {
  kick: [number, number]; // Hz range for the kick
  cooldown: { kick: number; snare: number; hat: number }; // ms
  sensitivity: number;
  bpm: [number, number]; // range the tempo estimate is folded into
}

export const TUNING: Record<Genre, Tuning> = {
  // A bit of everything.
  general: { kick: [45, 130], cooldown: { kick: 250, snare: 200, hat: 90 }, sensitivity: 2, bpm: [80, 160] },
  // Rap, trap, drill: long 808s carry the low end, so the kick band skips
  // the deepest sub and the 808 is tracked separately. Half-time snares.
  hiphop: { kick: [50, 120], cooldown: { kick: 180, snare: 280, hat: 70 }, sensitivity: 2.2, bpm: [60, 160] },
  // Drum & bass: fast broken beats around 170-175 BPM, so short cooldowns.
  dnb: { kick: [45, 120], cooldown: { kick: 140, snare: 170, hat: 60 }, sensitivity: 1.8, bpm: [160, 180] },
  // Afrobeats / amapiano: log drums sit higher, percussion is busy.
  afro: { kick: [50, 180], cooldown: { kick: 200, snare: 150, hat: 80 }, sensitivity: 1.9, bpm: [95, 125] },
  // Reggae / dub: one-drop (kick and snare together on beat 3), slow
  // 60-90 BPM, heavy bassline, offbeat skank chops in the mids.
  reggae: { kick: [45, 120], cooldown: { kick: 380, snare: 280, hat: 120 }, sensitivity: 1.9, bpm: [60, 95] },
  // Techno: four-on-the-floor, so one kick per beat at 120-150 BPM.
  techno: { kick: [40, 110], cooldown: { kick: 320, snare: 300, hat: 100 }, sensitivity: 2, bpm: [118, 150] },
};

export interface AudioLevels {
  // Smoothed loudness per band, auto-gained to 0..1. Good for meters and
  // colour, but a typical song sits high here most of the time.
  level: number;
  bass: number;
  mid: number;
  treble: number;
  // Sustained sub-bass (808s, reese bass, sub lines), auto-gained, with a
  // slow release so it reads as a swell rather than flicker.
  sub: number;
  // How far each band is above its own average of the last few seconds,
  // 0..1. Zero in a steady section, high on hits, drops and builds. This
  // is what motion should follow, so it reacts to the music's changes.
  liftLevel: number;
  liftMid: number;
  // Hit envelopes: jump on a detected hit (by its strength) and decay
  // smoothly, so effects get a clean, predictable shape.
  pulse: number; // kick
  snareEnv: number;
  // True on the frame a hit is detected.
  beat: boolean; // kick
  snare: boolean;
  hat: boolean;
  bpm: number; // 0 until there are enough kicks to estimate
  // Song structure. Tension builds while the kick is away (a breakdown or
  // build-up) and grows faster as the music rises; the first kick back
  // after enough tension is a drop.
  tension: number; // 0..1
  drop: boolean; // true on the drop frame
  dropEnv: number; // 1 at a drop, decaying over a couple of seconds
  // Bars, assuming 4/4: from the tempo once known, else every 4 kicks.
  bar: boolean; // true on the frame a new bar starts
  bars: number; // bars counted since the music started
  // Melody: the strongest clear tone in 200 Hz-2 kHz. A note fires when it
  // jumps to a new pitch or is struck again; notePc is its pitch class
  // (0 = C … 11 = B), roughly. melody is how much clear tone there is.
  note: boolean;
  noteEnv: number;
  notePc: number;
  melody: number;
  // Vocals, roughly: clear, wandering tones in the voice range over the music.
  // A synth lead in the same range reads as a voice too.
  voice: number;
}

const ZERO: AudioLevels = {
  level: 0, bass: 0, mid: 0, treble: 0, sub: 0, liftLevel: 0, liftMid: 0,
  pulse: 0, snareEnv: 0, beat: false, snare: false, hat: false, bpm: 0,
  tension: 0, drop: false, dropEnv: 0, bar: false, bars: 0,
  note: false, noteEnv: 0, notePc: 0, melody: 0, voice: 0,
};

const BANDS = { bass: [25, 160], mid: [160, 2000], treble: [2000, 9000], sub: [28, 60], snare: [1500, 5000], hat: [7000, 14000] } as const;

const bandOf = (F: Uint8Array, hz: number, [lo, hi]: readonly [number, number]) => {
  const from = Math.max(1, Math.floor(lo / hz));
  const to = Math.min(F.length - 1, Math.ceil(hi / hz));
  let sum = 0;
  for (let k = from; k <= to; k++) sum += F[k];
  return sum / ((to - from + 1) * 255);
};

type DrumFrame = { bins: Uint8Array; hz: number; t: number };

// Onset detector for one band: spectral flux (how much the band rose
// since the last frame) compared with an adaptive mean + k·std threshold.
class Onset {
  private prev = 0;
  private mean = 0;
  private variance = 0;
  private last = -1e9;

  /** Returns hit strength 0..1, or 0 for no hit. */
  test(value: number, now: number, k: number, cooldown: number, floor: number) {
    const flux = Math.max(0, value - this.prev);
    this.prev = value;
    const dev = flux - this.mean;
    this.mean += dev * 0.05;
    this.variance = this.variance * 0.95 + dev * dev * 0.05;
    const threshold = this.mean + k * Math.sqrt(this.variance) + 0.008;
    if (flux > threshold && value > floor && now - this.last > cooldown) {
      this.last = now;
      return Math.min(1, 0.45 + flux / (threshold * 2.5));
    }
    return 0;
  }
}

export class AudioInput {
  source: AudioSource = 'off';
  genre: Genre = 'general';
  vox: VoxMode = 'auto';
  // Hold reactions back by this many ms. Bluetooth headphones play the sound
  // 150-250 ms after we analyse it, so without this the field runs early.
  sync = 0;
  // What effects read: the analysis, delayed by `sync`.
  levels: AudioLevels = { ...ZERO };
  // Kick times as detected (not delayed), for tap-along calibration.
  kickLog: number[] = [];
  onChange: (status: string) => void = () => {};
  // Pitch of the loudest tone from 80 Hz to 1 kHz (a voice), 0..1 on a log scale.
  pitch = 0.5;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  // Short window (1024 points, ~21 ms, no smoothing) for drum timing; the
  // 4096 one smears a kick's attack over ~85 ms.
  private fast: AnalyserNode | null = null;
  private fastFreq = new Uint8Array(512);
  private cur: AudioLevels = { ...ZERO };
  private hist: { t: number; L: AudioLevels }[] = [];
  private feedQueue: DrumFrame[] = [];
  private feedLatency = 0;
  private node: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private element: HTMLAudioElement | null = null;
  private freq = new Uint8Array(0);
  // 'feed' source: spectrum frames from another experiment via X-Frame.
  private feedFrame: SpectrumFrame | null = null;
  private unsubscribe: (() => void) | null = null;
  private tapDest: MediaStreamAudioDestinationNode | null = null;

  /** A copy of the sound as a track (for recording), or null without a source. */
  tap(): MediaStreamTrack | null {
    if (!this.ctx || !this.node) return null;
    if (!this.tapDest) {
      this.tapDest = this.ctx.createMediaStreamDestination();
      this.node.connect(this.tapDest);
    }
    return this.tapDest.stream.getAudioTracks()[0]?.clone() ?? null;
  }
  // Running peaks per band act as automatic gain, so quiet and loud
  // sources both use the full 0..1 range.
  private peaks = { bass: 0.2, mid: 0.2, treble: 0.2, level: 0.2, sub: 0.2 };
  private avg = { level: 0, mid: 0 };
  private onsets = { kick: new Onset(), snare: new Onset(), hat: new Onset(), syll: new Onset() };
  private syllTimes: number[] = []; // rap / speech syllables in the last 2 s
  private kickTimes: number[] = []; // kick and snare hit times, for tempo
  private lastKick = 0;
  private mel = { prev: 0, midi: 0, at: 0, drift: 0 };
  private kickHits: number[] = []; // full kicks in the last 2 s
  private kickAvg = 0; // typical kick strength, so bass notes don't count as the kick coming back
  private lastFrame = 0;
  private slow = { fast: 0, slow: 0 }; // ~1 s and ~4 s loudness averages
  private snareTimes: number[] = [];
  private beatAnchor = 0; // time of a kick on the beat grid
  private beatsAtAnchor = 0;
  private lastBeatIdx = 0;
  private kicksInBar = 0;

  /** Listen to spectrum frames from elsewhere (no AudioContext, nothing plays here). */
  startFeed(subscribe: (onFrame: (f: SpectrumFrame) => void) => () => void) {
    this.stop();
    this.source = 'feed';
    this.unsubscribe = subscribe((f) => {
      this.feedFrame = f;
      this.feedLatency = f.outputLatency ?? 0;
      // Every short-window frame is queued with the time it was measured, so
      // hits keep their timing even when our frames are slower or late.
      if (f.fast?.length && f.fastFftSize) {
        this.feedQueue.push({ bins: f.fast, hz: f.sampleRate / f.fastFftSize, t: f.at ? f.at - performance.timeOrigin : performance.now() });
        if (this.feedQueue.length > 16) this.feedQueue.shift();
      }
    });
    this.onChange('Listening to the player in X-Frame');
  }

  async start(source: Exclude<AudioSource, 'off' | 'feed'>, file?: File) {
    this.stop();
    try {
      this.ctx = new AudioContext();
      await this.ctx.resume();
      this.analyser = this.ctx.createAnalyser();
      // 4096 points gives ~11 Hz bins, fine enough to separate sub from kick.
      this.analyser.fftSize = 4096;
      // Light smoothing: onsets need sharp edges; envelopes smooth later.
      this.analyser.smoothingTimeConstant = 0.3;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.fast = this.ctx.createAnalyser();
      this.fast.fftSize = 1024;
      this.fast.smoothingTimeConstant = 0;
      this.fastFreq = new Uint8Array(this.fast.frequencyBinCount);

      // Raw signal: the voice processing browsers apply to mics by
      // default flattens music.
      const raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

      if (source === 'mic') {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: raw });
      } else if (source === 'tab') {
        // Browsers only offer audio alongside video; we drop the video.
        this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: raw });
        if (!this.stream.getAudioTracks().length) {
          throw new Error('No audio was shared. Pick a tab and tick "Share tab audio".');
        }
        for (const t of this.stream.getVideoTracks()) t.stop();
      }

      if (this.stream) {
        const track = this.stream.getAudioTracks()[0];
        track.addEventListener('ended', () => this.stop());
        this.node = this.ctx.createMediaStreamSource(new MediaStream([track]));
        this.node.connect(this.analyser);
        this.node.connect(this.fast);
        // Not routed to the speakers: the sound is already playing elsewhere.
      } else if (file) {
        this.element = new Audio(URL.createObjectURL(file));
        this.element.loop = true;
        this.node = this.ctx.createMediaElementSource(this.element);
        this.node.connect(this.analyser);
        this.node.connect(this.fast);
        this.analyser.connect(this.ctx.destination);
        await this.element.play();
      }

      this.source = source;
      this.onChange(
        source === 'mic' ? 'Listening to the microphone' : source === 'tab' ? 'Listening to the shared audio' : `Playing ${file?.name ?? 'file'}`,
      );
    } catch (err) {
      this.stop();
      const e = err as Error;
      const msg = e.name === 'NotAllowedError' ? 'Permission was denied.' : e.name === 'NotSupportedError' || e.name === 'TypeError' ? 'This browser can’t capture that audio source.' : e.message;
      this.onChange(msg);
    }
  }

  stop() {
    const wasOn = this.source !== 'off';
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.element) {
      this.element.pause();
      URL.revokeObjectURL(this.element.src);
    }
    this.node?.disconnect();
    void this.ctx?.close();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.feedFrame = null;
    this.tapDest = null;
    this.feedQueue = [];
    this.hist = [];
    this.cur = { ...ZERO };
    this.ctx = this.analyser = this.fast = this.node = this.stream = this.element = null;
    this.source = 'off';
    this.levels = { ...ZERO };
    this.kickTimes = [];
    this.snareTimes = [];
    this.lastKick = this.lastFrame = this.beatAnchor = this.beatsAtAnchor = this.lastBeatIdx = this.kicksInBar = 0;
    this.slow = { fast: 0, slow: 0 };
    if (wasOn) this.onChange('Off');
  }

  /** Output latency reported by the player or our own context, in ms (0 if unknown). */
  reportedLatency() {
    const c = this.ctx;
    return Math.round(1000 * (this.source === 'feed' ? this.feedLatency : c ? (c.outputLatency ?? 0) + (c.baseLatency ?? 0) : 0));
  }

  /** Call once per frame. */
  update(now: number) {
    const a = this.analyser;
    const L = this.cur;
    L.beat = L.snare = L.hat = L.drop = L.bar = L.note = false;
    let hzPerBin: number;
    let drums: DrumFrame[];
    if (this.source === 'feed') {
      // Same analysis on bins someone else measured. All-zero bins = paused.
      const f = this.feedFrame;
      if (!f || !f.bins.length) return this.output(now);
      this.freq = f.bins as Uint8Array<ArrayBuffer>;
      hzPerBin = f.sampleRate / f.fftSize;
      // Older players send no short-window bins: time drums on the long ones.
      drums = f.fast ? this.feedQueue.splice(0) : [{ bins: this.freq, hz: hzPerBin, t: now }];
    } else {
      if (!a || !this.ctx || !this.fast) return this.output(now);
      a.getByteFrequencyData(this.freq);
      this.fast.getByteFrequencyData(this.fastFreq);
      hzPerBin = this.ctx.sampleRate / a.fftSize;
      drums = [{ bins: this.fastFreq, hz: this.ctx.sampleRate / this.fast.fftSize, t: now }];
    }
    const band = (r: readonly [number, number]) => bandOf(this.freq, hzPerBin, r);

    // Hits first, on the short-window frames, each at the time it was measured.
    L.pulse *= 0.9;
    L.snareEnv *= 0.88;
    let fullKick = false;
    let snareHit = false;
    for (const d of drums) {
      const r = this.drums(d);
      fullKick ||= r.full;
      snareHit ||= r.snare;
    }

    const raw = {
      bass: band(BANDS.bass), mid: band(BANDS.mid), treble: band(BANDS.treble), sub: band(BANDS.sub), level: 0,
    };
    raw.level = raw.bass * 0.5 + raw.mid * 0.35 + raw.treble * 0.15;
    {
      const p0 = Math.max(1, Math.floor(80 / hzPerBin));
      const p1 = Math.min(this.freq.length - 1, Math.ceil(1000 / hzPerBin));
      let best = 0;
      let bi = p0;
      for (let k = p0; k <= p1; k++) if (this.freq[k] > best) (best = this.freq[k]), (bi = k);
      if (best > 60) this.pitch += (Math.max(0, Math.min(1, Math.log2((bi * hzPerBin) / 80) / Math.log2(12.5))) - this.pitch) * 0.3;
    }
    this.melodyAndVoice(now, hzPerBin);

    for (const k of ['bass', 'mid', 'treble', 'level', 'sub'] as const) {
      // Peaks rise instantly and fall slowly; a floor keeps silence silent.
      this.peaks[k] = Math.max(raw[k], this.peaks[k] * 0.999, 0.08);
      const v = Math.min(1, raw[k] / this.peaks[k]);
      // Quick attack, gentle release (slower still for the sub swell).
      const release = k === 'sub' ? 0.96 : 0.92;
      L[k] = v > L[k] ? L[k] * 0.4 + v * 0.6 : L[k] * release + v * (1 - release);
    }

    // Lift: the band relative to its ~3 second average.
    for (const k of ['level', 'mid'] as const) {
      this.avg[k] = this.avg[k] * 0.995 + L[k] * 0.005;
      const lift = Math.max(0, Math.min(1, (L[k] - this.avg[k]) / (this.avg[k] * 0.6 + 0.08)));
      const key = k === 'level' ? 'liftLevel' : 'liftMid';
      L[key] = L[key] * 0.85 + lift * 0.15;
    }

    this.structure(now, fullKick, snareHit);
    this.output(now);
  }

  // Kick, snare and hat on one frame of bins measured at time t.
  private drums({ bins, hz, t }: DrumFrame) {
    const L = this.cur;
    const tu = TUNING[this.genre];
    const band = (r: readonly [number, number]) => bandOf(bins, hz, r);
    // Short windows have coarse low bins (~47 Hz), where a long 808 or sub
    // would bury the kick; its punch (the attack sweeping down from ~150 Hz)
    // still stands out a little higher up.
    const kickSig = band(hz > 20 ? [Math.max(tu.kick[0], 70), Math.max(tu.kick[1], 160)] : tu.kick);
    let kick = this.onsets.kick.test(kickSig, t, tu.sensitivity, tu.cooldown.kick, 0.1);
    // Snares and claps are loudest in 1.5-5 kHz; hats spill into that band
    // too but are stronger above 7 kHz, so subtract some of the hat band.
    const hatSig = band(BANDS.hat);
    const snareBand = band(BANDS.snare);
    const snareSig = Math.max(0, snareBand - hatSig * 0.8);
    const snare = this.onsets.snare.test(snareSig, t, tu.sensitivity * 1.1, tu.cooldown.snare, 0.03);
    const hat = this.onsets.hat.test(hatSig, t, tu.sensitivity * 0.9, tu.cooldown.hat, 0.005);
    // Noise (a snare roll, a white-noise riser) also lights up the kick
    // band; it's only a kick when the low end clearly outweighs the highs.
    if (kick > 0 && kickSig < snareBand * 1.15) kick = 0;

    if (kick > 0) {
      L.beat = true;
      L.pulse = Math.max(L.pulse, kick);
      this.kickLog.push(t);
      while (this.kickLog.length && t - this.kickLog[0] > 15000) this.kickLog.shift();
    }
    if (snare > 0) {
      L.snare = true;
      L.snareEnv = Math.max(L.snareEnv, snare);
    }
    if (hat > 0) L.hat = true;
    if (kick > 0 || snare > 0) {
      this.kickTimes.push(t);
      while (this.kickTimes.length && t - this.kickTimes[0] > 8000) this.kickTimes.shift();
      L.bpm = estimateBpm(this.kickTimes, tu.bpm);
    }
    // A build-up is when the kick drops out; a rolling bass line still fires
    // weak onsets in the kick band, so only full-strength kicks count here.
    const full = kick > 0 && kick >= this.kickAvg * 0.6 && kickSig > snareBand * 2;
    if (full) this.kickAvg = this.kickAvg ? this.kickAvg * 0.9 + kick * 0.1 : kick;
    return { full, snare: snare > 0 };
  }

  // What effects see: the analysis from `sync` ms ago. Hits from every frame
  // in between are kept, so none are lost when frames bunch up.
  private output(now: number) {
    const L = this.cur;
    if (this.sync <= 0) {
      this.levels = L;
      this.hist.length = 0;
      return;
    }
    this.hist.push({ t: now, L: { ...L } });
    if (this.hist.length > 400) this.hist.shift();
    const target = now - this.sync;
    let i = -1;
    while (i + 1 < this.hist.length && this.hist[i + 1].t <= target) i++;
    if (i < 0) {
      // Nothing old enough yet: hold the last output, without repeating its hits.
      if (this.levels === L) this.levels = { ...ZERO };
      else this.levels = { ...this.levels, beat: false, snare: false, hat: false, drop: false, bar: false, note: false };
      return;
    }
    const out = { ...this.hist[i].L };
    for (let k = 0; k < i; k++) {
      const h = this.hist[k].L;
      out.beat ||= h.beat;
      out.snare ||= h.snare;
      out.hat ||= h.hat;
      out.drop ||= h.drop;
      out.bar ||= h.bar;
      out.note ||= h.note;
    }
    this.hist.splice(0, i + 1);
    this.levels = out;
  }

  // Melody and vocals from the shape of the mid spectrum: a clear tone is a
  // peak standing well above its neighbourhood (drums are broad noise).
  private melodyAndVoice(now: number, hz: number) {
    const L = this.cur;
    const F = this.freq;
    const p0 = Math.max(2, Math.floor(200 / hz));
    const p1 = Math.min(F.length - 2, Math.ceil(2000 / hz));
    let best = 0;
    let bi = p0;
    let sum = 0;
    for (let k = p0; k <= p1; k++) {
      sum += F[k];
      if (F[k] > best) (best = F[k]), (bi = k);
    }
    const mean = sum / (p1 - p0 + 1);
    const tonal = best > 90 && best > mean * 2.2;
    // Between bins: a parabola through the peak and its neighbours.
    const a = F[bi - 1];
    const c = F[bi + 1];
    const den = a - 2 * best + c;
    const f = (bi + (den ? (0.5 * (a - c)) / den : 0)) * hz;
    const midi = 69 + 12 * Math.log2(f / 440);
    L.melody = L.melody * 0.9 + (tonal ? best / 255 : 0) * 0.1;
    const struck = best - this.mel.prev > 28;
    this.mel.prev = best;
    if (tonal) {
      const step = Math.abs(midi - this.mel.midi);
      // Voices glide and wobble: small, constant pitch movement.
      this.mel.drift = this.mel.drift * 0.92 + (step > 0.1 && step < 1.5 ? 1 : 0) * 0.08;
      if ((step >= 0.8 || struck) && now - this.mel.at > 120) {
        L.note = true;
        L.noteEnv = 1;
        L.notePc = ((Math.round(midi) % 12) + 12) % 12;
        this.mel.at = now;
      }
      this.mel.midi = midi;
    } else this.mel.drift *= 0.97;
    L.noteEnv *= 0.9;
    // Vocals: clear tone in the voice range that keeps wandering in pitch.
    const vox = tonal && f < 1100 ? Math.min(1, this.mel.drift * 1.6) * Math.min(1, best / 180) : 0;
    // Rap and spoken word have no held pitch, but they have syllables: quick
    // rises in the voice band, 3-8 a second, with voiced (harmonic, so peaky)
    // spectra, landing between drum hits rather than on them.
    let speech = 0;
    const speechOn = this.vox === 'speech' || (this.vox === 'auto' && this.genre === 'hiphop');
    if (speechOn) {
      const vb = bandOf(F, hz, [300, 3000]);
      const syl = this.onsets.syll.test(vb, now, 1.2, 110, 0.06);
      const voiced = best > mean * 1.5 && best > 70;
      if (syl > 0 && voiced && !L.beat && !L.snare) this.syllTimes.push(now);
      while (this.syllTimes.length && now - this.syllTimes[0] > 2000) this.syllTimes.shift();
      const rate = this.syllTimes.length / 2;
      speech = Math.min(1, Math.max(0, (rate - 1.5) / 3)) * Math.min(1, vb * 3);
    }
    const target = Math.max(vox, speech);
    L.voice = L.voice * 0.94 + target * 0.06;
  }

  // Build-ups, drops and bars.
  private structure(now: number, kick: boolean, snare: boolean) {
    const L = this.cur;
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    this.slow.fast += (L.level - this.slow.fast) * Math.min(1, dt * 1);
    this.slow.slow += (L.level - this.slow.slow) * Math.min(1, dt * 0.25);
    if (snare) this.snareTimes.push(now);
    while (this.snareTimes.length && now - this.snareTimes[0] > 2000) this.snareTimes.shift();

    if (kick) this.kickHits.push(now);
    while (this.kickHits.length && now - this.kickHits[0] > 2000) this.kickHits.shift();
    // The kick has dropped out: at most one stray hit in the last 2 s (a bass
    // note or a fill shouldn't cancel a build-up).
    const away = this.lastKick > 0 && this.kickHits.length <= 1;
    const rising = this.slow.fast > this.slow.slow + 0.02;
    const roll = this.snareTimes.length >= 6; // snare roll: lots of hits in 2 s
    const audible = L.level > 0.05;
    if (audible && (away || roll)) L.tension = Math.min(1, L.tension + dt * (0.15 + (rising ? 0.2 : 0) + (roll ? 0.15 : 0)));
    else if (!away) L.tension = Math.max(0, L.tension - dt * 0.4);

    if (kick) {
      // The kick coming back after a build-up (this hit and at most one stray before it).
      if ((this.kickHits.length <= 2 || roll) && L.tension > 0.4) {
        L.drop = true;
        L.dropEnv = 1;
        L.tension = 0;
      }
      this.lastKick = now;
    }
    L.dropEnv *= Math.pow(0.35, dt); // ~2 s tail

    // Bars: count beats on a grid anchored to kicks, re-anchoring when a
    // kick lands off the grid. Without a tempo, every 4th kick.
    if (L.bpm > 0) {
      const period = 60000 / L.bpm;
      if (kick) {
        const beats = this.beatsAtAnchor + (now - this.beatAnchor) / period;
        const off = Math.abs(beats - Math.round(beats));
        if (!this.beatAnchor || off > 0.25) {
          this.beatsAtAnchor = Math.ceil(this.lastBeatIdx / 4) * 4; // treat as a downbeat
          this.beatAnchor = now;
        }
      }
      if (this.beatAnchor) {
        const idx = Math.floor(this.beatsAtAnchor + (now - this.beatAnchor) / period + 0.02);
        if (idx > this.lastBeatIdx && idx % 4 === 0) {
          L.bar = true;
          L.bars++;
        }
        this.lastBeatIdx = Math.max(this.lastBeatIdx, idx);
      }
    } else if (kick && ++this.kicksInBar >= 4) {
      this.kicksInBar = 0;
      L.bar = true;
      L.bars++;
    }
  }
}

// Tempo by comb matching: for each candidate BPM in the genre's range,
// score how well the gaps between all recent hit pairs land on whole (or
// half) beats. Works with syncopated drill/breakbeat kicks, where the
// plain median gap would be off.
function estimateBpm(times: number[], [lo, hi]: [number, number]) {
  if (times.length < 8) return 0;
  const t = times.map((x) => x / 1000);
  let best = 0;
  let bestScore = -1;
  for (let bpm = lo; bpm <= hi; bpm += 0.5) {
    const P = 60 / bpm;
    let score = 0;
    let pairs = 0;
    for (let i = 0; i < t.length; i++) {
      for (let j = i + 1; j < t.length; j++) {
        const d = t[j] - t[i];
        if (d > 4) break;
        const x = d / P;
        const f = x - Math.round(x);
        const g = 2 * x - Math.round(2 * x);
        score += Math.exp(-(f * f) / 0.0128) + 0.5 * Math.exp(-(g * g) / 0.0128);
        pairs++;
      }
    }
    score /= pairs || 1;
    if (score > bestScore + 1e-6) {
      bestScore = score;
      best = bpm;
    }
  }
  return Math.round(best);
}

export const tabAudioSupported = () => typeof navigator.mediaDevices?.getDisplayMedia === 'function';
