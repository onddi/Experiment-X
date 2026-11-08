// Live audio analysis for the particle field.
//
// Sources: the microphone (hears whatever plays in the room), a shared
// browser tab or screen with audio (clean digital sound, e.g. the Spotify
// web player), or a local audio file. Each frame we read the spectrum and
// boil it down to a few 0..1 signals the simulation can use.

export type AudioSource = 'off' | 'mic' | 'tab' | 'file';

export interface AudioLevels {
  level: number; // overall loudness
  bass: number;
  mid: number;
  treble: number;
  beat: boolean; // true on the frame a bass hit is detected
}

const BANDS = { bass: [25, 160], mid: [160, 2000], treble: [2000, 9000] } as const;

export class AudioInput {
  source: AudioSource = 'off';
  levels: AudioLevels = { level: 0, bass: 0, mid: 0, treble: 0, beat: false };
  onChange: (status: string) => void = () => {};

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private node: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private element: HTMLAudioElement | null = null;
  private freq = new Uint8Array(0);
  // Running peaks per band act as automatic gain, so quiet and loud
  // sources both use the full 0..1 range.
  private peaks = { bass: 0.2, mid: 0.2, treble: 0.2, level: 0.2 };
  private bassAvg = 0;
  private lastBeat = 0;

  async start(source: Exclude<AudioSource, 'off'>, file?: File) {
    this.stop();
    try {
      this.ctx = new AudioContext();
      await this.ctx.resume();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.55;
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
    this.ctx = this.analyser = this.node = this.stream = this.element = null;
    this.source = 'off';
    this.levels = { level: 0, bass: 0, mid: 0, treble: 0, beat: false };
    if (wasOn) this.onChange('Off');
  }

  /** Call once per frame. */
  update(now: number) {
    const a = this.analyser;
    const L = this.levels;
    L.beat = false;
    if (!a || !this.ctx) return;
    a.getByteFrequencyData(this.freq);

    const hzPerBin = this.ctx.sampleRate / a.fftSize;
    const band = ([lo, hi]: readonly [number, number]) => {
      const from = Math.max(1, Math.floor(lo / hzPerBin));
      const to = Math.min(this.freq.length - 1, Math.ceil(hi / hzPerBin));
      let sum = 0;
      for (let k = from; k <= to; k++) sum += this.freq[k];
      return sum / ((to - from + 1) * 255);
    };

    const raw = { bass: band(BANDS.bass), mid: band(BANDS.mid), treble: band(BANDS.treble), level: 0 };
    raw.level = raw.bass * 0.5 + raw.mid * 0.35 + raw.treble * 0.15;

    for (const k of ['bass', 'mid', 'treble', 'level'] as const) {
      // Peaks rise instantly and fall slowly; a floor keeps silence silent.
      this.peaks[k] = Math.max(raw[k], this.peaks[k] * 0.998, 0.08);
      const v = Math.min(1, raw[k] / this.peaks[k]);
      // Fast attack, slower release, so hits pop and then ease off.
      L[k] = v > L[k] ? v : L[k] * 0.88 + v * 0.12;
    }

    // Beat: bass jumps clearly above its recent average.
    this.bassAvg = this.bassAvg * 0.95 + raw.bass * 0.05;
    if (raw.bass > this.bassAvg * 1.3 && raw.bass > 0.12 && now - this.lastBeat > 230) {
      L.beat = true;
      this.lastBeat = now;
    }
  }
}

export const tabAudioSupported = () => typeof navigator.mediaDevices?.getDisplayMedia === 'function';
