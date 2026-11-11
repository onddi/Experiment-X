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
  // Rap and spoken word, frame by frame. vocal is a gated envelope: it
  // opens within ~20 ms of a voiced syllable and shuts ~60 ms after the
  // voice stops, so the gaps between words read as silence.
  voxOn: boolean;
  vocal: number;
  syllable: boolean; // a new syllable starts
  syllEnv: number; // 1 at a syllable, decaying
  pause: boolean; // the voice has been quiet for ~150 ms (end of a line, a breath)
  flow: number; // syllables per second, 0..1 (about 8/s = 1)
  accent: boolean; // a syllable clearly louder than the ones around it
  voxPitch: number; // where the voice sits in its own range, 0..1
  voxRise: number; // pitch going up (+) or down (-), -1..1
  rhyme: boolean; // a line ends on the same vowel sound as a recent line
}

const ZERO: AudioLevels = {
  level: 0, bass: 0, mid: 0, treble: 0, sub: 0, liftLevel: 0, liftMid: 0,
  pulse: 0, snareEnv: 0, beat: false, snare: false, hat: false, bpm: 0,
  tension: 0, drop: false, dropEnv: 0, bar: false, bars: 0,
  note: false, noteEnv: 0, notePc: 0, melody: 0, voice: 0,
  voxOn: false, vocal: 0, syllable: false, syllEnv: 0, pause: false, flow: 0, accent: false, voxPitch: 0.5, voxRise: 0, rhyme: false,
};

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
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

// (a) The backing, per frequency: the lowest level in the last ~0.4 s
// ("minimum statistics"). Between words the voice is gone, so the minimum is
// whatever keeps playing (beat, 808, pads); a held chord is learned within
// half a second. Anything well above it is new: in the voice band, the voice.
class Backing {
  floor: Float32Array;
  private blocks: Float32Array[];
  private cur: Float32Array;
  private frames = 0;
  private at = 0;
  constructor(len: number, private per = 3, nBlocks = 8) {
    this.floor = new Float32Array(len).fill(255);
    this.cur = new Float32Array(len).fill(255);
    this.blocks = Array.from({ length: nBlocks }, () => new Float32Array(len).fill(255));
  }
  push(F: Uint8Array) {
    const c = this.cur;
    for (let k = 0; k < F.length; k++) if (F[k] < c[k]) c[k] = F[k];
    if (++this.frames % this.per) return;
    this.blocks[this.at].set(c);
    this.at = (this.at + 1) % this.blocks.length;
    c.fill(255);
    const f = this.floor;
    f.fill(255);
    for (const b of this.blocks) for (let k = 0; k < f.length; k++) if (b[k] < f[k]) f[k] = b[k];
  }
}
const MARGIN = 20; // ~5 dB above the backing before it counts

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
  private onsets = { kick: new Onset(), snare: new Onset(), hat: new Onset() };
  // Rap flow state (see voiceGate / voiceShape).
  private backMain: Backing | null = null; // long window
  private backFast: Backing | null = null; // short window
  private resid = new Float32Array(0); // long-window bins minus the backing
  private sungV = 0;
  private rap = {
    e: 0, prevE: 0, score: 0, vRun: 0, open: false, below: 0, peak: 0.05, sylAt: -1e9, sylPeak: 0, localMin: 1, closedAt: 0, paused: true, mask: 0,
    voicedAt: -1e9, semi: 0, semiHist: [] as { t: number; s: number }[], lo: 0, hi: 12,
    sylTimes: [] as number[], sylMaxes: [] as number[], accentAt: 0, accentMax: 0,
    vowel: { f1: 0, f2: 0, n: 0 }, lastVowel: null as null | [number, number], lineSyl: 0, lineEnds: [] as [number, number][],
  };
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
    this.backMain = this.backFast = null;
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

  /** The spectrum in `out.length` bands, low to high on a log scale (0–1). */
  spectrum(out: Float32Array) {
    const F = this.freq;
    const hz = this.hzBin;
    if (!F.length || !hz || this.source === 'off') return out.fill(0);
    const lo = Math.log(40);
    const hi = Math.log(12000);
    for (let b = 0; b < out.length; b++) {
      const f0 = Math.exp(lo + ((hi - lo) * b) / out.length);
      const f1 = Math.exp(lo + ((hi - lo) * (b + 1)) / out.length);
      const k0 = Math.max(0, Math.floor(f0 / hz));
      const k1 = Math.min(F.length - 1, Math.max(k0, Math.ceil(f1 / hz)));
      let m = 0;
      for (let k = k0; k <= k1; k++) m = Math.max(m, F[k]);
      // A little lift for the highs, which are always quieter.
      out[b] = Math.min(1, Math.max(0, (m / 255 - 0.25) / 0.7) * (1 + b / out.length * 0.6));
    }
    return out;
  }
  private hzBin = 0;

  /** Call once per frame. */
  update(now: number) {
    const a = this.analyser;
    const L = this.cur;
    L.beat = L.snare = L.hat = L.drop = L.bar = L.note = false;
    L.syllable = L.pause = L.accent = L.rhyme = false;
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
    this.hzBin = hzPerBin;
    const band = (r: readonly [number, number]) => bandOf(this.freq, hzPerBin, r);

    // Hits first, on the short-window frames, each at the time it was measured.
    L.pulse *= 0.9;
    L.snareEnv *= 0.88;
    let fullKick = false;
    let snareHit = false;
    L.syllEnv *= 0.85;
    for (const d of drums) {
      const r = this.drums(d);
      fullKick ||= r.full;
      snareHit ||= r.snare;
      this.voiceGate(d);
    }
    this.voiceShape(now, hzPerBin);

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
      else this.levels = { ...this.levels, beat: false, snare: false, hat: false, drop: false, bar: false, note: false, syllable: false, pause: false, accent: false, rhyme: false };
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
      out.syllable ||= h.syllable;
      out.pause ||= h.pause;
      out.accent ||= h.accent;
      out.rhyme ||= h.rhyme;
    }
    this.hist.splice(0, i + 1);
    this.levels = out;
  }

  // (c, d, e, f, g, h) The voice gate, run on every short-window frame at
  // the time it was measured. Opens on a voiced rise above the backing,
  // closes ~60 ms after it falls away; frames right after a drum hit are
  // skipped so a snare never reads as a syllable.
  private voiceGate({ bins, hz, t }: DrumFrame) {
    const L = this.cur;
    const R = this.rap;
    if (this.backFast?.floor.length !== bins.length) this.backFast = new Backing(bins.length);
    const fl = this.backFast.floor;
    const k0 = Math.max(1, Math.floor(300 / hz));
    const k1 = Math.min(bins.length - 1, Math.ceil(3400 / hz));
    let sum = 0;
    for (let k = k0; k <= k1; k++) sum += Math.max(0, bins[k] - fl[k] - MARGIN);
    this.backFast.push(bins);
    const e = sum / ((k1 - k0 + 1) * 255);
    R.e = e;
    // (d) Drums are noise, so they reach well above the voice band; a voice
    // (an "s" aside) mostly doesn't. Those frames are skipped: a snare, its
    // tail or a hat never counts as a syllable. (The drum detector itself
    // can fire on a voice, so it isn't used for this.)
    const h0 = Math.ceil(3600 / hz);
    const h1 = Math.min(bins.length - 1, Math.ceil(9000 / hz));
    let hi = 0;
    for (let k = h0; k <= h1; k++) hi += Math.max(0, bins[k] - fl[k] - MARGIN);
    const noisy = hi / ((h1 - h0 + 1) * 255) > Math.max(0.005, e) * 0.35;
    // Consonants (s, t, ch) are noisy too, so a noisy frame still counts for
    // the dips between syllables; it just can't start one.
    const masked = noisy || t < R.mask;
    if (noisy) R.mask = t + 20;
    if (!masked) R.peak = Math.max(e, R.peak * 0.9993, 0.02);
    else R.peak = Math.max(R.peak * 0.9993, 0.02);
    const openAt = Math.max(0.012, R.peak * 0.22);
    // The voice check runs on the long window, so it confirms a syllable a
    // little late; mid-verse (a voice heard in the last ~0.35 s) a fresh rise
    // opens straight away.
    const voiced = t - R.voicedAt < 70;
    const inVerse = t - R.voicedAt < 350;
    const syllable = () => {
      L.syllable = true;
      L.syllEnv = 1;
      R.sylAt = t;
      R.sylPeak = e;
      R.localMin = e;
      R.lineSyl++;
      R.sylTimes.push(t);
      // The previous syllable's vowel, for rhymes.
      if (R.vowel.n) R.lastVowel = [R.vowel.f1 / R.vowel.n, R.vowel.f2 / R.vowel.n];
      R.vowel = { f1: 0, f2: 0, n: 0 };
      // Accent: decided ~50 ms in, once the syllable has peaked.
      R.accentAt = t + 50;
      R.accentMax = e;
    };
    if (!R.open) {
      if (!masked && e > openAt && (voiced || (inVerse && e > R.prevE * 1.5))) {
        R.open = true;
        R.below = 0;
        syllable();
      }
    } else {
      if (!masked) R.sylPeak = Math.max(R.sylPeak, e);
      R.localMin = Math.min(R.localMin, e);
      // A new syllable inside a run of words: a fresh rise after a dip.
      if (!masked && e > R.localMin * 1.5 && e > openAt && R.localMin < R.sylPeak * 0.65 && t - R.sylAt > 75 && inVerse) syllable();
      // Shut when the level falls away, or when it's no longer a voice (a
      // snare tail or a chord change keeps the level up but has no comb).
      if (e < R.peak * 0.2 || t - R.voicedAt > 90) {
        R.below ||= t;
        if (t - R.below > 20) {
          R.open = false;
          R.closedAt = t;
          R.paused = false;
          if (R.vowel.n) R.lastVowel = [R.vowel.f1 / R.vowel.n, R.vowel.f2 / R.vowel.n];
        }
      } else R.below = 0;
    }
    if (R.accentAt) {
      if (!masked) R.accentMax = Math.max(R.accentMax, e);
      if (t >= R.accentAt) {
        const typical = median(R.sylMaxes);
        // Levels here are in dB steps, so "louder" is a step up: at least ~3 dB,
        // and well beyond how much this rapper's syllables usually vary.
        const spread = median(R.sylMaxes.map((m) => Math.abs(m - typical)));
        if (R.sylMaxes.length >= 6 && R.accentMax > typical + Math.max(0.045, spread * 2.5)) L.accent = true;
        R.sylMaxes.push(R.accentMax);
        if (R.sylMaxes.length > 12) R.sylMaxes.shift();
        R.accentAt = 0;
      }
    }
    // Pause: quiet for 150 ms after words. The end of a line, so check for a rhyme.
    if (!R.open && !R.paused && t - R.closedAt > 150) {
      R.paused = true;
      L.pause = true;
      if (R.lastVowel && R.lineSyl >= 3) {
        const [f1, f2] = R.lastVowel;
        const near = R.lineEnds.some(([g1, g2]) => Math.abs(Math.log2(f1 / g1)) < 0.12 && Math.abs(Math.log2(f2 / g2)) < 0.1);
        if (near) L.rhyme = true;
        R.lineEnds.push(R.lastVowel);
        if (R.lineEnds.length > 4) R.lineEnds.shift();
      }
      R.lineSyl = 0;
      R.lastVowel = null;
    }
    R.prevE = e;
    L.voxOn = R.open;
    const v = R.open ? Math.min(1, (e / R.peak) * 1.4) : 0;
    L.vocal = v > L.vocal ? L.vocal * 0.3 + v * 0.7 : L.vocal * 0.55 + v * 0.45;
    while (R.sylTimes.length && t - R.sylTimes[0] > 2000) R.sylTimes.shift();
  }

  // (b, i, j) On the long window: is it a voice (an even comb of harmonics
  // above a pitch of 90-300 Hz, which drums and noise don't have), its
  // pitch, and its vowel (the two strongest formant regions).
  private voiceShape(now: number, hz: number) {
    const L = this.cur;
    const R = this.rap;
    const F = this.freq;
    if (this.backMain?.floor.length !== F.length) {
      this.backMain = new Backing(F.length);
      this.resid = new Float32Array(F.length);
    }
    const r = this.resid;
    const fl = this.backMain.floor;
    for (let k = 0; k < F.length; k++) r[k] = Math.max(0, F[k] - fl[k] - MARGIN);
    this.backMain.push(F);
    const at = (f: number) => {
      const x = f / hz;
      const i = Math.floor(x);
      return i + 1 < r.length ? Math.max(r[i], r[i + 1]) : 0;
    };
    // (b) A voice is a comb of harmonics: for each candidate pitch, count the
    // harmonics (up to 2 kHz) that stand clearly above the gaps either side
    // of them. Real voices glide and sit in a busy mix, so the gaps are never
    // empty; what matters is that most harmonics still poke out.
    let best = 0;
    let bestF = 0;
    let bestC = 0;
    for (let f0 = 90; f0 <= 300; f0 += 2) {
      let n = 0;
      let harm = 0;
      let c = 0;
      for (let h = 2; h * f0 < 2000 && h <= 12; h++) {
        const p = at(h * f0);
        const v = Math.max(at((h + 0.5) * f0), at((h - 0.5) * f0));
        n++;
        if (p > 6 && p - v > 12) harm++, (c += p - v);
      }
      const score = harm >= 5 && harm >= n * 0.4 ? harm / n : 0;
      if (score > best || (score === best && score > 0 && c > bestC)) (best = score), (bestF = f0), (bestC = c);
    }
    R.score = best;
    const voiced = best > 0;
    // Three voiced frames in a row: a kick's 808 or a chord stab can pass once or twice.
    R.vRun = voiced ? R.vRun + 1 : 0;
    if (R.vRun >= 3) R.voicedAt = now;
    // Pitch contour while the gate is open.
    if (voiced && L.voxOn) {
      const semi = 12 * Math.log2(bestF / 90);
      R.semi += (semi - R.semi) * 0.5;
      R.lo = Math.min(R.lo + 0.002, R.semi);
      R.hi = Math.max(R.hi - 0.002, R.semi, R.lo + 4);
      R.semiHist.push({ t: now, s: R.semi });
      while (R.semiHist.length && now - R.semiHist[0].t > 250) R.semiHist.shift();
      L.voxPitch += ((R.semi - R.lo) / (R.hi - R.lo) - L.voxPitch) * 0.3;
      const rise = Math.max(-1, Math.min(1, (R.semi - R.semiHist[0].s) / 3));
      L.voxRise += (rise - L.voxRise) * 0.3;
      // Vowel: smooth the voice's spectrum and take the strongest region for
      // each of the first two formants.
      const peakIn = (lo: number, hi: number) => {
        let bv = 0;
        let bf = (lo + hi) / 2;
        for (let f = lo; f <= hi; f += 25) {
          let s2 = 0;
          for (let d = -75; d <= 75; d += 25) s2 += at(f + d);
          if (s2 > bv) (bv = s2), (bf = f);
        }
        return bf;
      };
      R.vowel.f1 += peakIn(250, 900);
      R.vowel.f2 += peakIn(950, 2600);
      R.vowel.n++;
    } else L.voxRise *= 0.85;
    // Flow speed: syllables in the last 2 s, about 8 a second at full.
    const rate = R.sylTimes.length / 2;
    L.flow += (Math.min(1, rate / 8) - L.flow) * 0.05;
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
    this.sungV = this.sungV * 0.94 + vox * 0.06;
    // Rap and speech: the gated vocal envelope, so gaps between words go quiet.
    const speechOn = this.vox === 'speech' || (this.vox === 'auto' && this.genre === 'hiphop');
    L.voice = speechOn ? Math.max(L.vocal, this.sungV * (L.voxOn ? 1 : 0.3)) : this.sungV;
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
