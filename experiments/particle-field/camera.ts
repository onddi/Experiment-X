// Camera input for the particle shape: the webcam picture (sampled like an
// image) and, on request, face tracking with MediaPipe's face landmarker,
// loaded from a CDN only when a face mode is switched on. Nothing leaves the
// device: frames go from the camera to the tracker and the canvas only.

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

type Edge = { start: number; end: number };
// The bits of the MediaPipe API used here.
type Landmarker = {
  detectForVideo(v: HTMLVideoElement, t: number): {
    faceLandmarks: { x: number; y: number }[][];
    faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
  };
  close(): void;
};
type VisionModule = {
  FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
  FaceLandmarker: {
    createFromOptions(fs: unknown, o: Record<string, unknown>): Promise<Landmarker>;
    FACE_LANDMARKS_TESSELATION: Edge[];
    FACE_LANDMARKS_LEFT_EYE: Edge[];
    FACE_LANDMARKS_RIGHT_EYE: Edge[];
    FACE_LANDMARKS_LEFT_EYEBROW: Edge[];
    FACE_LANDMARKS_RIGHT_EYEBROW: Edge[];
    FACE_LANDMARKS_LIPS: Edge[];
    FACE_LANDMARKS_FACE_OVAL: Edge[];
    FACE_LANDMARKS_LEFT_IRIS: Edge[];
    FACE_LANDMARKS_RIGHT_IRIS: Edge[];
  };
};

export type FaceStatus = 'off' | 'loading' | 'ready' | 'failed';

export class Camera {
  readonly video = document.createElement('video');
  on = false;
  error = '';
  faceStatus: FaceStatus = 'off';
  // Latest face: landmark positions (x, y in video pixels) and expressions.
  face: { x: Float32Array; y: Float32Array; blend: Record<string, number> } | null = null;
  faceAt = 0;
  // Edge lists for the face modes, as landmark index pairs.
  mesh: Edge[] = [];
  features: Edge[] = [];
  private stream: MediaStream | null = null;
  private landmarker: Landmarker | null = null;
  private loading: Promise<void> | null = null;
  private lastTime = -1;

  constructor() {
    this.video.muted = true;
    this.video.playsInline = true;
  }

  get width() {
    return this.video.videoWidth || 640;
  }
  get height() {
    return this.video.videoHeight || 480;
  }
  get ready() {
    return this.on && this.video.readyState >= 2;
  }

  async start() {
    if (this.on) return true;
    this.error = '';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.on = true;
      return true;
    } catch (e) {
      this.error = (e as Error).name === 'NotAllowedError' ? 'Camera permission was denied' : 'No camera available';
      return false;
    }
  }

  stop() {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    this.video.srcObject = null;
    this.on = false;
    this.face = null;
    this.lastTime = -1;
  }

  // Load the face tracker (once). Dev builds can point at local copies.
  loadFace(): Promise<void> {
    if (this.loading) return this.loading;
    this.faceStatus = 'loading';
    let base = MP_BASE;
    let model = MP_MODEL;
    if (import.meta.env.DEV) {
      base = localStorage.getItem('particle-field:mp-base') ?? base;
      model = localStorage.getItem('particle-field:mp-model') ?? model;
    }
    this.loading = (async () => {
      try {
        const vision = (await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`)) as VisionModule;
        const fs = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
        const opts = (delegate: string) => ({
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
        try {
          this.landmarker = await vision.FaceLandmarker.createFromOptions(fs, opts('GPU'));
        } catch {
          this.landmarker = await vision.FaceLandmarker.createFromOptions(fs, opts('CPU'));
        }
        const F = vision.FaceLandmarker;
        this.mesh = F.FACE_LANDMARKS_TESSELATION;
        this.features = [
          ...F.FACE_LANDMARKS_LEFT_EYE, ...F.FACE_LANDMARKS_RIGHT_EYE, ...F.FACE_LANDMARKS_LEFT_EYEBROW, ...F.FACE_LANDMARKS_RIGHT_EYEBROW,
          ...F.FACE_LANDMARKS_LIPS, ...F.FACE_LANDMARKS_FACE_OVAL, ...F.FACE_LANDMARKS_LEFT_IRIS, ...F.FACE_LANDMARKS_RIGHT_IRIS,
        ];
        this.faceStatus = 'ready';
      } catch (e) {
        console.warn('Face tracking failed to load', e);
        this.faceStatus = 'failed';
        this.loading = null;
      }
    })();
    return this.loading;
  }

  // Track the face in the newest video frame (skips repeated frames).
  detect(now: number) {
    if (!this.landmarker || !this.ready) return;
    const vt = this.video.currentTime;
    if (vt === this.lastTime) return;
    this.lastTime = vt;
    let res;
    try {
      res = this.landmarker.detectForVideo(this.video, now);
    } catch {
      return;
    }
    const lm = res.faceLandmarks[0];
    if (!lm) {
      // Keep the last face for a moment, so a missed frame doesn't jolt.
      if (now - this.faceAt > 1500) this.face = null;
      return;
    }
    const W = this.width;
    const H = this.height;
    const f = this.face && this.face.x.length === lm.length ? this.face : { x: new Float32Array(lm.length), y: new Float32Array(lm.length), blend: {} };
    for (let k = 0; k < lm.length; k++) {
      f.x[k] = lm[k].x * W;
      f.y[k] = lm[k].y * H;
    }
    const blend: Record<string, number> = {};
    for (const c of res.faceBlendshapes?.[0]?.categories ?? []) blend[c.categoryName] = c.score;
    f.blend = blend;
    this.face = f;
    this.faceAt = now;
  }
}
