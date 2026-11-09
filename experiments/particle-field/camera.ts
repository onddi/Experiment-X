// Camera input for the particle shape and hand forces: the webcam picture
// (sampled like an image) and, on request, MediaPipe face tracking, hand
// tracking and a body cut-out, each loaded from a CDN only when switched on.
// Nothing leaves the device: frames go from the camera to the trackers and
// the canvas only.

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODELS = {
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  hands: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  body: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
};
export type Task = keyof typeof MODELS;

type Edge = { start: number; end: number };
type Pt = { x: number; y: number; z: number };
type Mask = { width: number; height: number; getAsFloat32Array(): Float32Array };
type Runner = {
  detectForVideo?(v: HTMLVideoElement, t: number): {
    faceLandmarks?: Pt[][];
    faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
    landmarks?: Pt[][];
  };
  segmentForVideo?(v: HTMLVideoElement, t: number): { confidenceMasks?: Mask[]; close(): void };
};
type Maker = { createFromOptions(fs: unknown, o: Record<string, unknown>): Promise<Runner> } & Record<string, Edge[]>;
type VisionModule = {
  FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
  FaceLandmarker: Maker;
  HandLandmarker: Maker;
  ImageSegmenter: Maker;
};

export type Status = 'off' | 'loading' | 'ready' | 'failed';
export type Face = { x: Float32Array; y: Float32Array; z: Float32Array; blend: Record<string, number> };
export type Hand = { x: Float32Array; y: Float32Array };

// Face feature groups, for colouring: 0 skin, 1 outline, 2 brows, 3 eyes,
// 4 irises, 5 lips.
export const FACE_GROUPS = 6;

export class Camera {
  readonly video = document.createElement('video');
  on = false;
  error = '';
  status: Record<Task, Status> = { face: 'off', hands: 'off', body: 'off' };
  // Latest tracking, in video pixels (x, y; z for faces, same scale as x).
  faces: Face[] = [];
  faceAt = 0;
  hands: Hand[] = [];
  handsAt = 0;
  // Body cut-out: confidence 0..1 per pixel of a small grid.
  body: { w: number; h: number; data: Float32Array } | null = null;
  // Edge lists for the face modes, and the feature group of each edge.
  mesh: Edge[] = [];
  meshGroup = new Uint8Array(0);
  features: Edge[] = [];
  featureGroup = new Uint8Array(0);
  private stream: MediaStream | null = null;
  private runners: Partial<Record<Task, Runner>> = {};
  private loads: Partial<Record<Task, Promise<void>>> = {};
  private vision: Promise<{ vision: VisionModule; fs: unknown }> | null = null;
  private lastTime: Record<Task, number> = { face: -1, hands: -1, body: -1 };

  constructor() {
    this.video.muted = true;
    this.video.playsInline = true;
  }

  get face() {
    return this.faces[0] ?? null;
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
    this.faces = [];
    this.hands = [];
    this.body = null;
    this.lastTime = { face: -1, hands: -1, body: -1 };
  }

  private base() {
    let base = MP_BASE;
    if (import.meta.env.DEV) base = localStorage.getItem('particle-field:mp-base') ?? base;
    return base;
  }

  private model(task: Task) {
    if (import.meta.env.DEV) {
      const local = localStorage.getItem('particle-field:mp-base');
      if (local) return `${local}/${MODELS[task].split('/').pop()}`;
    }
    return MODELS[task];
  }

  // Load a tracker (once).
  load(task: Task): Promise<void> {
    const had = this.loads[task];
    if (had) return had;
    this.status[task] = 'loading';
    this.vision ??= (async () => {
      const base = this.base();
      const vision = (await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`)) as VisionModule;
      const fs = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
      return { vision, fs };
    })();
    const p = (async () => {
      try {
        const { vision, fs } = await this.vision!;
        const maker = task === 'face' ? vision.FaceLandmarker : task === 'hands' ? vision.HandLandmarker : vision.ImageSegmenter;
        const opts = (delegate: string) => ({
          baseOptions: { modelAssetPath: this.model(task), delegate },
          runningMode: 'VIDEO',
          ...(task === 'face' ? { numFaces: 2, outputFaceBlendshapes: true } : {}),
          ...(task === 'hands' ? { numHands: 2 } : {}),
          ...(task === 'body' ? { outputConfidenceMasks: true, outputCategoryMask: false } : {}),
        });
        try {
          this.runners[task] = await maker.createFromOptions(fs, opts('GPU'));
        } catch {
          this.runners[task] = await maker.createFromOptions(fs, opts('CPU'));
        }
        if (task === 'face') this.faceEdges(vision.FaceLandmarker);
        this.status[task] = 'ready';
      } catch (e) {
        console.warn(`Camera ${task} tracking failed to load`, e);
        this.status[task] = 'failed';
        delete this.loads[task];
      }
    })();
    this.loads[task] = p;
    return p;
  }

  private faceEdges(F: Maker) {
    const groups: [Edge[], number][] = [
      [F.FACE_LANDMARKS_FACE_OVAL, 1],
      [[...F.FACE_LANDMARKS_LEFT_EYEBROW, ...F.FACE_LANDMARKS_RIGHT_EYEBROW], 2],
      [[...F.FACE_LANDMARKS_LEFT_EYE, ...F.FACE_LANDMARKS_RIGHT_EYE], 3],
      [[...F.FACE_LANDMARKS_LEFT_IRIS, ...F.FACE_LANDMARKS_RIGHT_IRIS], 4],
      [F.FACE_LANDMARKS_LIPS, 5],
    ];
    this.features = groups.flatMap(([e]) => e);
    this.featureGroup = Uint8Array.from(groups.flatMap(([e, g]) => e.map(() => g)));
    // Mesh edges take the group of a feature they touch, else skin.
    const pointGroup = new Map<number, number>();
    for (const [e, g] of groups) for (const { start, end } of e) {
      pointGroup.set(start, g);
      pointGroup.set(end, g);
    }
    this.mesh = F.FACE_LANDMARKS_TESSELATION;
    this.meshGroup = Uint8Array.from(this.mesh.map(({ start, end }) => {
      const a = pointGroup.get(start);
      const b = pointGroup.get(end);
      return a !== undefined && a === b ? a : 0;
    }));
  }

  // A new video frame for this task? (Trackers skip repeated frames.)
  private fresh(task: Task) {
    if (!this.runners[task] || !this.ready) return false;
    const vt = this.video.currentTime;
    if (vt === this.lastTime[task]) return false;
    this.lastTime[task] = vt;
    return true;
  }

  detectFaces(now: number) {
    if (!this.fresh('face')) return;
    let res;
    try {
      res = this.runners.face!.detectForVideo!(this.video, now);
    } catch {
      return;
    }
    const all = res.faceLandmarks ?? [];
    if (!all.length) {
      // Keep the last faces for a moment, so a missed frame doesn't jolt.
      if (now - this.faceAt > 1500) this.faces = [];
      return;
    }
    const W = this.width;
    const H = this.height;
    // Keep faces in a steady left-to-right order.
    const order = all.map((lm, k) => [lm[1]?.x ?? 0, k] as const).sort((a, b) => a[0] - b[0]).map(([, k]) => k);
    this.faces = order.map((k, slot) => {
      const lm = all[k];
      const prev = this.faces[slot];
      const f = prev && prev.x.length === lm.length ? prev : { x: new Float32Array(lm.length), y: new Float32Array(lm.length), z: new Float32Array(lm.length), blend: {} };
      for (let q = 0; q < lm.length; q++) {
        f.x[q] = lm[q].x * W;
        f.y[q] = lm[q].y * H;
        f.z[q] = lm[q].z * W;
      }
      const blend: Record<string, number> = {};
      for (const c of res.faceBlendshapes?.[k]?.categories ?? []) blend[c.categoryName] = c.score;
      f.blend = blend;
      return f;
    });
    this.faceAt = now;
  }

  detectHands(now: number) {
    if (!this.fresh('hands')) return;
    let res;
    try {
      res = this.runners.hands!.detectForVideo!(this.video, now);
    } catch {
      return;
    }
    const all = res.landmarks ?? [];
    if (!all.length) {
      if (now - this.handsAt > 300) this.hands = [];
      return;
    }
    const W = this.width;
    const H = this.height;
    this.hands = all.map((lm) => ({ x: Float32Array.from(lm, (p) => p.x * W), y: Float32Array.from(lm, (p) => p.y * H) }));
    this.handsAt = now;
  }

  segmentBody(now: number) {
    if (!this.fresh('body')) return;
    let res;
    try {
      res = this.runners.body!.segmentForVideo!(this.video, now);
    } catch {
      return;
    }
    const m = res.confidenceMasks?.[0];
    if (m) this.body = { w: m.width, h: m.height, data: m.getAsFloat32Array().slice() };
    res.close();
  }
}
