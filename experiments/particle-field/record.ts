/**
 * Record a clip of the field: what is on screen (field or lens canvas, with
 * the CSS filter and view moves baked in) plus, if wanted, the sound source.
 * Only the canvas is recorded, never the menu, knobs or camera preview.
 */

export interface RecordPrefs {
  secs: number; // 0 = until stopped
  sound: boolean;
  size: 'hd' | 'full' | 'square';
}

export interface RecordHost {
  /** The canvas that is visible right now (lens canvas when a lens is on). */
  source: () => HTMLCanvasElement;
  /** The field's size in CSS pixels. */
  size: () => [number, number];
  filter: () => string;
  transform: () => string;
  bg: () => string;
  /** A live audio track of the sound source, or null when there is none. */
  audio: () => MediaStreamTrack | null;
  onChange: () => void;
}

export const RECORD_LENGTHS: [string, string][] = [
  ['5', '5 seconds'],
  ['10', '10 seconds'],
  ['30', '30 seconds'],
  ['60', '1 minute'],
  ['0', 'Until I stop it'],
];
export const RECORD_SIZES: [RecordPrefs['size'], string][] = [
  ['hd', 'HD (1280 wide)'],
  ['full', 'Full HD (1920 wide)'],
  ['square', 'Square 1080 (for posts)'],
];

const KEY = 'particle-field:record';

export function canRecord() {
  return typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
}

function pickType() {
  // MP4 plays and shares everywhere; WebM is the fallback for older Firefox.
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export class Recorder {
  prefs: RecordPrefs;
  /** Seconds recorded so far while recording. */
  elapsed = 0;
  /** The finished clip, waiting for Save or Share. */
  clip: { blob: Blob; name: string; secs: number } | null = null;
  private cv = document.createElement('canvas');
  private g = this.cv.getContext('2d', { alpha: false })!;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private start = 0;
  private audioTrack: MediaStreamTrack | null = null;

  constructor(private host: RecordHost) {
    let p: Partial<RecordPrefs> = {};
    try {
      p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {}
    this.prefs = { secs: p.secs ?? 10, sound: p.sound ?? true, size: p.size ?? 'hd' };
  }

  get on() {
    return this.rec !== null;
  }

  setPrefs(p: Partial<RecordPrefs>) {
    Object.assign(this.prefs, p);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {}
    this.host.onChange();
  }

  toggle() {
    if (this.rec) this.stop();
    else this.begin();
  }

  begin() {
    if (this.rec || !canRecord()) return;
    this.clip = null;
    const [w, h] = this.host.size();
    let W: number;
    let H: number;
    if (this.prefs.size === 'square') W = H = 1080;
    else {
      W = this.prefs.size === 'full' ? 1920 : 1280;
      H = Math.round((W * h) / Math.max(1, w));
      // Portrait screens: the long side gets the size instead.
      if (h > w) [W, H] = [Math.round((W * w) / h), W];
    }
    this.cv.width = W & ~1;
    this.cv.height = H & ~1;
    this.paint();
    const stream = this.cv.captureStream(30);
    this.audioTrack = this.prefs.sound ? this.host.audio() : null;
    if (this.audioTrack) stream.addTrack(this.audioTrack);
    const mimeType = pickType();
    const px = this.cv.width * this.cv.height;
    this.rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: Math.round(px * 30 * 0.18), audioBitsPerSecond: 192000 });
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = () => this.finish(mimeType || this.rec?.mimeType || 'video/webm');
    this.rec.start(1000);
    this.start = performance.now();
    this.elapsed = 0;
    this.host.onChange();
  }

  stop() {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
  }

  /** Call once per animation frame, after everything is drawn. */
  tick() {
    if (!this.rec) return;
    this.elapsed = (performance.now() - this.start) / 1000;
    this.paint();
    if (this.prefs.secs && this.elapsed >= this.prefs.secs) this.stop();
  }

  save() {
    if (!this.clip) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(this.clip.blob);
    a.download = this.clip.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  canShare() {
    if (!this.clip || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [this.file()] });
    } catch {
      return false;
    }
  }

  async share() {
    if (!this.clip) return;
    try {
      await navigator.share({ files: [this.file()] });
    } catch {}
  }

  discard() {
    this.clip = null;
    this.host.onChange();
  }

  private file() {
    return new File([this.clip!.blob], this.clip!.name, { type: this.clip!.blob.type });
  }

  private finish(type: string) {
    const secs = this.elapsed;
    this.rec = null;
    // The audio track belongs to the sound source; only the tap is ours.
    this.audioTrack?.stop();
    this.audioTrack = null;
    const blob = new Blob(this.chunks, { type: type.split(';')[0] });
    this.chunks = [];
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = `particle-field-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
    this.clip = blob.size ? { blob, name, secs } : null;
    this.host.onChange();
  }

  // Copy the visible picture, the way the browser shows it: cover-fit,
  // with the CSS filter and the view moves (zoom, shake, roll, flip).
  private paint() {
    const g = this.g;
    const W = this.cv.width;
    const H = this.cv.height;
    const src = this.host.source();
    const [w, h] = this.host.size();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.filter = 'none';
    g.fillStyle = this.host.bg();
    g.fillRect(0, 0, W, H);
    if (!src.width || !w) return;
    const k = Math.max(W / w, H / h); // CSS px → recording px
    g.translate(W / 2, H / 2);
    g.scale(k, k);
    const t = this.host.transform();
    if (t) {
      try {
        const m = new DOMMatrix(t);
        g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      } catch {}
    }
    const f = this.host.filter();
    if (f) g.filter = f;
    g.drawImage(src, -w / 2, -h / 2, w, h);
    g.filter = 'none';
  }
}
