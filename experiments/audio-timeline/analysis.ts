// Offline analysis of a whole track, done once when it loads. The timeline
// draws from these arrays instead of the raw samples, so redrawing at any
// zoom level stays cheap.

export interface TrackAnalysis {
  duration: number; // seconds
  sampleRate: number;
  channels: number;
  /** Peak buckets per second. */
  peakRate: number;
  min: Float32Array; // -1..0, per bucket
  max: Float32Array; // 0..1, per bucket
  rms: Float32Array; // 0..1, per bucket
  /** Spectrum frames per second. */
  specRate: number;
  /** Log-spaced frequency bands per frame, from BAND_LO to BAND_HI Hz. */
  bands: number;
  /** frames × bands, 0..1 (dB scaled against the loudest frame of the track). */
  spec: Float32Array;
  /** Spectral centroid per frame, 0 (low) .. 1 (high) on the log band scale. */
  centroid: Float32Array;
  /** Loudness per frame, 0..1. */
  energy: Float32Array;
}

export const BAND_LO = 30;
export const BAND_HI = 16000;
const PEAK_RATE = 200;
const SPEC_RATE = 40;
const FFT = 2048;
const BANDS = 96;
const RANGE_DB = 70;

/** Mixes the buffer to mono and analyses it, yielding to the UI between chunks. */
export async function analyse(buffer: AudioBuffer, onProgress: (p: number) => void = () => {}): Promise<TrackAnalysis> {
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const mono = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += ch[i] / buffer.numberOfChannels;
  }

  // --- peaks -------------------------------------------------------------
  const buckets = Math.max(1, Math.ceil((n / sr) * PEAK_RATE));
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  const rms = new Float32Array(buckets);
  const per = sr / PEAK_RATE;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * per);
    const to = Math.min(n, Math.floor((b + 1) * per));
    let lo = 0;
    let hi = 0;
    let sq = 0;
    for (let i = from; i < to; i++) {
      const v = mono[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      sq += v * v;
    }
    min[b] = lo;
    max[b] = hi;
    rms[b] = Math.sqrt(sq / Math.max(1, to - from));
  }
  // Normalise so quiet masters still fill the timeline.
  let top = 1e-6;
  for (let b = 0; b < buckets; b++) top = Math.max(top, max[b], -min[b]);
  for (let b = 0; b < buckets; b++) {
    min[b] /= top;
    max[b] /= top;
    rms[b] = Math.min(1, rms[b] / top);
  }
  onProgress(0.1);

  // --- spectrum ----------------------------------------------------------
  const frames = Math.max(1, Math.ceil((n / sr) * SPEC_RATE));
  const spec = new Float32Array(frames * BANDS);
  const centroid = new Float32Array(frames);
  const energy = new Float32Array(frames);
  const fft = new Fft(FFT);
  const win = new Float32Array(FFT);
  for (let i = 0; i < FFT; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1));
  const re = new Float64Array(FFT);
  const im = new Float64Array(FFT);
  const power = new Float64Array(FFT / 2);

  // Each band covers a range of FFT bins; narrow low bands read the nearest bin.
  const hzPerBin = sr / FFT;
  const edges: [number, number][] = [];
  for (let b = 0; b < BANDS; b++) {
    const lo = BAND_LO * Math.pow(BAND_HI / BAND_LO, b / BANDS);
    const hi = BAND_LO * Math.pow(BAND_HI / BAND_LO, (b + 1) / BANDS);
    let from = Math.round(lo / hzPerBin);
    let to = Math.round(hi / hzPerBin);
    if (to <= from) to = from + 1;
    from = Math.min(from, FFT / 2 - 1);
    to = Math.min(to, FFT / 2);
    edges.push([from, to]);
  }

  let maxDb = -Infinity;
  let chunkStart = performance.now();
  for (let f = 0; f < frames; f++) {
    const centre = Math.floor((f / SPEC_RATE) * sr);
    const start = centre - FFT / 2;
    for (let i = 0; i < FFT; i++) {
      const j = start + i;
      re[i] = j >= 0 && j < n ? mono[j] * win[i] : 0;
      im[i] = 0;
    }
    fft.run(re, im);
    for (let k = 0; k < FFT / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    let wsum = 0;
    let psum = 0;
    for (let b = 0; b < BANDS; b++) {
      const [from, to] = edges[b];
      let p = 0;
      for (let k = from; k < to; k++) p += power[k];
      p /= to - from;
      const db = 10 * Math.log10(p + 1e-12);
      spec[f * BANDS + b] = db;
      if (db > maxDb) maxDb = db;
      const mag = Math.sqrt(p);
      wsum += mag * b;
      psum += mag;
    }
    centroid[f] = psum > 0 ? wsum / psum / (BANDS - 1) : 0;
    if (performance.now() - chunkStart > 24) {
      onProgress(0.1 + 0.9 * (f / frames));
      await new Promise((r) => setTimeout(r, 0));
      chunkStart = performance.now();
    }
  }
  for (let i = 0; i < spec.length; i++) spec[i] = Math.max(0, Math.min(1, (spec[i] - (maxDb - RANGE_DB)) / RANGE_DB));
  // Energy from the peak buckets, resampled to spectrum frames.
  for (let f = 0; f < frames; f++) {
    const from = Math.floor((f / SPEC_RATE) * PEAK_RATE);
    const to = Math.min(buckets, Math.max(from + 1, Math.floor(((f + 1) / SPEC_RATE) * PEAK_RATE)));
    let s = 0;
    for (let b = from; b < to; b++) s += rms[b];
    energy[f] = s / Math.max(1, to - from);
  }
  onProgress(1);

  return {
    duration: n / sr,
    sampleRate: sr,
    channels: buffer.numberOfChannels,
    peakRate: PEAK_RATE,
    min,
    max,
    rms,
    specRate: SPEC_RATE,
    bands: BANDS,
    spec,
    centroid,
    energy,
  };
}

// Iterative radix-2 FFT, in place.
class Fft {
  private rev: Uint32Array;
  private cos: Float64Array;
  private sin: Float64Array;
  constructor(private n: number) {
    const bits = Math.log2(n);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / n);
    }
  }
  run(re: Float64Array, im: Float64Array) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const wr = this.cos[j * step];
          const wi = this.sin[j * step];
          const a = i + j;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }
}
