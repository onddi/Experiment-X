// Live audio analysis for the particle field.
//
// Sources: the microphone (hears whatever plays in the room), a shared
// browser tab or screen with audio (clean digital sound, e.g. the Spotify
// web player), or a local audio file. Each frame we read the spectrum and
// boil it down to a few 0..1 signals the simulation can use.

export type AudioSource = 'off' | 'mic' | 'tab' | 'file' | 'feed';

/** One frame of the X-Frame `audio.spectrum` topic: what an AnalyserNode gives. */
export type SpectrumFrame = { bins: Uint8Array; sampleRate: number; fftSize: number };

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
}

const ZERO: AudioLevels = {
  level: 0, bass: 0, mid: 0, treble: 0, sub: 0, liftLevel: 0, liftMid: 0,
  pulse: 0, snareEnv: 0, beat: false, snare: false, hat: false, bpm: 0,
  tension: 0, drop: false, dropEnv: 0, bar: false, bars: 0,
};

const BANDS = { bass: [25, 160], mid: [160, 2000], treble: [2000, 9000], sub: [28, 60], snare: [1500, 5000], hat: [7000, 14000] } as const;

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
  levels: AudioLevels = { ...ZERO };
  onChange: (status: string) => void = () => {};
  // Pitch of the loudest tone from 80 Hz to 1 kHz (a voice), 0..1 on a log scale.
  pitch = 0.5;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private node: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private element: HTMLAudioElement | null = null;
  private freq = new Uint8Array(0);
  // 'feed' source: spectrum frames from another experiment via X-Frame.
  private feedFrame: SpectrumFrame | null = null;
  private unsubscribe: (() => void) | null = null;
  // Running peaks per band act as automatic gain, so quiet and loud
  // sources both use the full 0..1 range.
  private peaks = { bass: 0.2, mid: 0.2, treble: 0.2, level: 0.2, sub: 0.2 };
  private avg = { level: 0, mid: 0 };
  private onsets = { kick: new Onset(), snare: new Onset(), hat: new Onset() };
  private kickTimes: number[] = []; // kick and snare hit times, for tempo
  private lastKick = 0;
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
    this.unsubscribe = subscribe((f) => (this.feedFrame = f));
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
        // Not routed to the speakers: the sound is already playing elsewhere.
      } else if (file) {
        this.element = new Audio(URL.createObjectURL(file));
        this.element.loop = true;
        this.node = this.ctx.createMediaElementSource(this.element);
        this.node.connect(this.analyser);
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
    this.ctx = this.analyser = this.node = this.stream = this.element = null;
    this.source = 'off';
    this.levels = { ...ZERO };
    this.kickTimes = [];
    this.snareTimes = [];
    this.lastKick = this.lastFrame = this.beatAnchor = this.beatsAtAnchor = this.lastBeatIdx = this.kicksInBar = 0;
    this.slow = { fast: 0, slow: 0 };
    if (wasOn) this.onChange('Off');
  }

  /** Call once per frame. */
  update(now: number) {
    const a = this.analyser;
    const L = this.levels;
    L.beat = L.snare = L.hat = L.drop = L.bar = false;
    let hzPerBin: number;
    if (this.source === 'feed') {
      // Same analysis on bins someone else measured. All-zero bins = paused.
      const f = this.feedFrame;
      if (!f || !f.bins.length) return;
      this.freq = f.bins as Uint8Array<ArrayBuffer>;
      hzPerBin = f.sampleRate / f.fftSize;
    } else {
      if (!a || !this.ctx) return;
      a.getByteFrequencyData(this.freq);
      hzPerBin = this.ctx.sampleRate / a.fftSize;
    }
    const band = ([lo, hi]: readonly [number, number]) => {
      const from = Math.max(1, Math.floor(lo / hzPerBin));
      const to = Math.min(this.freq.length - 1, Math.ceil(hi / hzPerBin));
      let sum = 0;
      for (let k = from; k <= to; k++) sum += this.freq[k];
      return sum / ((to - from + 1) * 255);
    };

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

    // Hits per band.
    const tu = TUNING[this.genre];
    const kickSig = band(tu.kick);
    let kick = this.onsets.kick.test(kickSig, now, tu.sensitivity, tu.cooldown.kick, 0.1);
    // Snares and claps are loudest in 1.5-5 kHz; hats spill into that band
    // too but are stronger above 7 kHz, so subtract some of the hat band.
    const hatSig = band(BANDS.hat);
    const snareSig = Math.max(0, band(BANDS.snare) - hatSig * 0.8);
    const snare = this.onsets.snare.test(snareSig, now, tu.sensitivity * 1.1, tu.cooldown.snare, 0.03);
    const hat = this.onsets.hat.test(hatSig, now, tu.sensitivity * 0.9, tu.cooldown.hat, 0.005);
    // Noise (a snare roll, a white-noise riser) also lights up the kick
    // band; it's only a kick when the low end clearly outweighs the highs.
    if (kick > 0 && kickSig < band(BANDS.snare) * 1.15) kick = 0;

    L.beat = kick > 0;
    L.snare = snare > 0;
    L.hat = hat > 0;
    L.pulse = kick > 0 ? Math.max(L.pulse, kick) : L.pulse * 0.9;
    L.snareEnv = snare > 0 ? Math.max(L.snareEnv, snare) : L.snareEnv * 0.88;

    if (kick > 0 || snare > 0) {
      this.kickTimes.push(now);
      while (this.kickTimes.length && now - this.kickTimes[0] > 8000) this.kickTimes.shift();
      L.bpm = estimateBpm(this.kickTimes, tu.bpm);
    }
    this.structure(now, kick > 0, snare > 0);
  }

  // Build-ups, drops and bars.
  private structure(now: number, kick: boolean, snare: boolean) {
    const L = this.levels;
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    this.slow.fast += (L.level - this.slow.fast) * Math.min(1, dt * 1);
    this.slow.slow += (L.level - this.slow.slow) * Math.min(1, dt * 0.25);
    if (snare) this.snareTimes.push(now);
    while (this.snareTimes.length && now - this.snareTimes[0] > 2000) this.snareTimes.shift();

    const away = this.lastKick > 0 && now - this.lastKick > 1800; // kick has dropped out
    const rising = this.slow.fast > this.slow.slow + 0.02;
    const roll = this.snareTimes.length >= 6; // snare roll: lots of hits in 2 s
    const audible = L.level > 0.05;
    if (audible && (away || roll)) L.tension = Math.min(1, L.tension + dt * (0.1 + (rising ? 0.2 : 0) + (roll ? 0.15 : 0)));
    else if (!away) L.tension = Math.max(0, L.tension - dt * 0.4);

    if (kick) {
      if ((away || roll) && L.tension > 0.25) {
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
