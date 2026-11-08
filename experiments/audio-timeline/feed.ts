// The player's live data, published once per animation frame.
//
// Everything another experiment might want to react to goes through here:
// where the playhead is, whether it's playing, and what the audio sounds
// like right now. The bins are the same thing an AnalyserNode with
// fftSize 4096 gives (byte frequency data, 0..255), so a consumer like the
// particle field's beat detector can run on them unchanged.
//
// Nothing here knows about X-Frame or postMessage. A bridge that shares
// the feed with other experiments only has to subscribe() and forward the
// frames (and the one-off track summary), e.g. as structured-clone
// messages; the frame object is plain data for that reason. The bins and
// wave arrays are reused between frames, so copy them to keep them.

import type { TrackAnalysis } from './analysis.ts';

export interface AudioFeedFrame {
  /** performance.now() when the frame was taken. */
  at: number;
  /** Playhead, seconds. */
  time: number;
  duration: number;
  playing: boolean;
  /** Output volume 0..1 (the analysis below is taken before the volume). */
  volume: number;
  sampleRate: number;
  /** Analyser byte frequency data, fftSize 4096 → 2048 bins of sampleRate/4096 Hz. */
  bins: Uint8Array;
  /** Analyser byte time-domain data (128 = silence). */
  wave: Uint8Array;
  /** Auto-gained, smoothed band levels, 0..1. */
  level: number;
  bass: number;
  mid: number;
  treble: number;
}

/** Sent when a track loads: enough to draw an overview of the whole song. */
export interface AudioFeedTrack {
  name: string;
  duration: number;
  /** Overview loudness, `peakRate` values per second, 0..1. */
  peakRate: number;
  peaks: Float32Array;
  analysis: TrackAnalysis;
}

type Listener<T> = (value: T) => void;

export class AudioFeed {
  track: AudioFeedTrack | null = null;
  frame: AudioFeedFrame | null = null;
  private frameListeners = new Set<Listener<AudioFeedFrame>>();
  private trackListeners = new Set<Listener<AudioFeedTrack>>();

  /** Called every frame while the page is visible. Returns an unsubscribe function. */
  subscribe(fn: Listener<AudioFeedFrame>) {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  /** Called whenever a new track is loaded (and right away if one already is). */
  onTrack(fn: Listener<AudioFeedTrack>) {
    this.trackListeners.add(fn);
    if (this.track) fn(this.track);
    return () => this.trackListeners.delete(fn);
  }

  publishTrack(track: AudioFeedTrack) {
    this.track = track;
    for (const fn of this.trackListeners) fn(track);
  }

  publish(frame: AudioFeedFrame) {
    this.frame = frame;
    for (const fn of this.frameListeners) fn(frame);
  }
}

// Same bands as the particle field's detector.
const BANDS = { bass: [25, 160], mid: [160, 2000], treble: [2000, 9000] } as const;

/** Boils analyser bins down to auto-gained 0..1 band levels. */
export class BandMeter {
  level = 0;
  bass = 0;
  mid = 0;
  treble = 0;
  private peaks = { level: 0.2, bass: 0.2, mid: 0.2, treble: 0.2 };

  update(bins: Uint8Array, sampleRate: number) {
    const hzPerBin = sampleRate / (bins.length * 2);
    const band = ([lo, hi]: readonly [number, number]) => {
      const from = Math.max(1, Math.floor(lo / hzPerBin));
      const to = Math.min(bins.length - 1, Math.ceil(hi / hzPerBin));
      let sum = 0;
      for (let k = from; k <= to; k++) sum += bins[k];
      return sum / ((to - from + 1) * 255);
    };
    const raw = { bass: band(BANDS.bass), mid: band(BANDS.mid), treble: band(BANDS.treble), level: 0 };
    raw.level = raw.bass * 0.5 + raw.mid * 0.35 + raw.treble * 0.15;
    for (const k of ['level', 'bass', 'mid', 'treble'] as const) {
      this.peaks[k] = Math.max(raw[k], this.peaks[k] * 0.999, 0.08);
      const v = Math.min(1, raw[k] / this.peaks[k]);
      this[k] = v > this[k] ? this[k] * 0.4 + v * 0.6 : this[k] * 0.9 + v * 0.1;
    }
  }

  decay() {
    for (const k of ['level', 'bass', 'mid', 'treble'] as const) this[k] *= 0.9;
  }
}
