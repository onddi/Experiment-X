// Camera input for the particle shape and hand forces: the webcam picture
// (sampled like an image) and, on request, MediaPipe face tracking, hand
// tracking and a body cut-out, each loaded from a CDN only when switched on.
// Nothing leaves the device: frames go from the camera to the trackers and
// the canvas only.

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODELS = {
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  hands: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
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
  recognizeForVideo?(v: HTMLVideoElement, t: number): { landmarks: Pt[][]; gestures: { categoryName: string; score: number }[][] };
  segmentForVideo?(v: HTMLVideoElement, t: number): { confidenceMasks?: Mask[]; close(): void };
};
type Maker = { createFromOptions(fs: unknown, o: Record<string, unknown>): Promise<Runner> } & Record<string, Edge[]>;
type VisionModule = {
  FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
  FaceLandmarker: Maker;
  GestureRecognizer: Maker;
  PoseLandmarker: Maker;
  ImageSegmenter: Maker;
};

type FaceRes = { faceLandmarks?: Pt[][]; faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[] };
type HandRes = { landmarks: Pt[][]; gestures: { categoryName: string; score: number }[][] };
type BodyMask = { w: number; h: number; data: Float32Array };

export type Status = 'off' | 'loading' | 'ready' | 'failed';
export type Face = { x: Float32Array; y: Float32Array; z: Float32Array; blend: Record<string, number> };
// A hand: its 21 points and the gesture it is making ('None', 'Closed_Fist',
// 'Open_Palm', 'Pointing_Up', 'Thumb_Up', 'Thumb_Down', 'Victory', 'ILoveYou').
export type Hand = { x: Float32Array; y: Float32Array; gesture: string; score: number };
export type Pose = { x: Float32Array; y: Float32Array; v: Float32Array };

// Face feature groups, for colouring: 0 skin, 1 outline, 2 brows, 3 eyes,
// 4 irises, 5 lips.
export const FACE_GROUPS = 6;

export class Camera {
  readonly video = document.createElement('video');
  on = false;
  error = '';
  status: Record<Task, Status> = { face: 'off', hands: 'off', body: 'off', pose: 'off' };
  // Latest tracking, in video pixels (x, y; z for faces, same scale as x).
  faces: Face[] = [];
  faceAt = 0;
  hands: Hand[] = [];
  handsAt = 0;
  poses: Pose[] = [];
  poseAt = 0;
  handEdges: Edge[] = [];
  poseEdges: Edge[] = [];
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
  private lastTime: Record<Task, number> = { face: -1, hands: -1, body: -1, pose: -1 };
  // How long each tracker takes (smoothed, ms) and when it last ran.
  readonly cost: Record<Task, number> = { face: 0, hands: 0, body: 0, pose: 0 };
  private ranAt: Record<Task, number> = { face: -1e9, hands: -1e9, body: -1e9, pose: -1e9 };
  private timed<T>(task: Task, run: () => T): T {
    const t0 = performance.now();
    const r = run();
    this.took(task, performance.now() - t0);
    return r;
  }
  private took(task: Task, dt: number) {
    this.cost[task] = this.cost[task] ? this.cost[task] * 0.85 + dt * 0.15 : dt;
  }
  // The trackers run in a worker where they can, so a slow one (a phone, or
  // no GPU) never stalls the particles; else here, on the main thread, paced.
  private worker: Worker | null = null;
  private noWorker = false;
  private inWorker: Partial<Record<Task, boolean>> = {};
  private busy: Partial<Record<Task, boolean>> = {};
  private loaded: Partial<Record<Task, (r: { ok: boolean; edges?: Record<string, Edge[]> }) => void>> = {};
  /** Whether a tracker runs in the worker (for the stats). */
  offThread(task: Task) {
    return !!this.inWorker[task];
  }

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
    this.poses = [];
    this.lastTime = { face: -1, hands: -1, body: -1, pose: -1 };
    this.busy = {};
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
    const p = (async () => {
      const edges = await this.loadInWorker(task);
      if (!edges) return this.loadHere(task);
      this.inWorker[task] = true;
      if (task === 'face') this.faceEdges(edges);
      if (task === 'hands') this.handEdges = edges.HAND_CONNECTIONS ?? [];
      if (task === 'pose') this.poseEdges = edges.POSE_CONNECTIONS ?? [];
      this.status[task] = 'ready';
    })();
    this.loads[task] = p;
    return p;
  }

  private loadHere(task: Task): Promise<void> {
    this.vision ??= (async () => {
      const base = this.base();
      const vision = (await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`)) as VisionModule;
      const fs = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
      return { vision, fs };
    })();
    const p = (async () => {
      try {
        const { vision, fs } = await this.vision!;
        const maker = { face: vision.FaceLandmarker, hands: vision.GestureRecognizer, body: vision.ImageSegmenter, pose: vision.PoseLandmarker }[task];
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
        if (task === 'hands') this.handEdges = vision.GestureRecognizer.HAND_CONNECTIONS;
        if (task === 'pose') this.poseEdges = vision.PoseLandmarker.POSE_CONNECTIONS;
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

  private faceEdges(F: Record<string, Edge[]>) {
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
  private fresh(task: Task, now: number) {
    if (!(this.runners[task] || this.inWorker[task]) || !this.ready) return false;
    const vt = this.video.currentTime;
    if (vt === this.lastTime[task]) return false;
    if (this.inWorker[task]) {
      if (this.busy[task]) return false;
      // Hand over the frame; the answer comes back by message.
      this.lastTime[task] = vt;
      this.busy[task] = true;
      createImageBitmap(this.video).then(
        (img) => this.worker!.postMessage({ type: 'run', task, img, ts: now }, [img]),
        () => (this.busy[task] = false),
      );
      return false;
    }
    // On the main thread every tracker that's on shares the budget: a slow
    // one runs less often, so tracking takes at most about a third of the time.
    let busy = 0;
    for (const k in this.cost) if (this.runners[k as Task]) busy += this.cost[k as Task];
    if (now - this.ranAt[task] < Math.min(400, busy * 2.2)) return false;
    this.lastTime[task] = vt;
    this.ranAt[task] = now;
    return true;
  }

  private startWorker() {
    if (this.worker || this.noWorker) return this.worker;
    try {
      this.worker = new Worker(new URL('./track.worker.ts', import.meta.url));
    } catch {
      this.noWorker = true;
      return null;
    }
    this.worker.onmessage = (e: MessageEvent) => {
      const d = e.data as { type: 'loaded'; task: Task; ok: boolean; edges?: Record<string, Edge[]> } | { type: 'res'; task: Task; res: unknown; ms: number };
      if (d.type === 'loaded') {
        this.loaded[d.task]?.(d);
        return;
      }
      this.busy[d.task] = false;
      this.took(d.task, d.ms);
      if (!d.res || !this.on) return;
      const now = performance.now();
      if (d.task === 'face') this.useFaces(d.res as FaceRes, now);
      else if (d.task === 'hands') this.useHands(d.res as HandRes, now);
      else if (d.task === 'pose') this.usePose(d.res as { landmarks?: Pt[][] }, now);
      else this.useBody((d.res as { mask: BodyMask | null }).mask);
    };
    this.worker.onerror = () => {
      // The worker itself failed: everything falls back to this thread.
      this.worker?.terminate();
      this.worker = null;
      this.noWorker = true;
      for (const t of Object.keys(this.loaded) as Task[]) this.loaded[t]?.({ ok: false });
      for (const t of Object.keys(this.inWorker) as Task[]) if (this.inWorker[t]) {
        this.inWorker[t] = false;
        this.status[t] = 'off';
        delete this.loads[t];
      }
    };
    return this.worker;
  }

  private loadInWorker(task: Task) {
    const w = this.startWorker();
    if (!w) return Promise.resolve(null);
    return new Promise<Record<string, Edge[]> | null>((done) => {
      const timer = setTimeout(() => done(null), 30000);
      this.loaded[task] = (r) => {
        clearTimeout(timer);
        delete this.loaded[task];
        done(r.ok ? (r.edges ?? {}) : null);
      };
      w.postMessage({ type: 'load', task, base: this.base(), model: this.model(task) });
    });
  }

  detectFaces(now: number) {
    if (!this.fresh('face', now)) return;
    let res;
    try {
      res = this.timed('face', () => this.runners.face!.detectForVideo!(this.video, now));
    } catch {
      return;
    }
    this.useFaces(res, now);
  }

  private useFaces(res: FaceRes, now: number) {
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
    if (!this.fresh('hands', now)) return;
    let res;
    try {
      res = this.timed('hands', () => this.runners.hands!.recognizeForVideo!(this.video, now));
    } catch {
      return;
    }
    this.useHands(res, now);
  }

  private useHands(res: HandRes, now: number) {
    const all = res.landmarks ?? [];
    if (!all.length) {
      if (now - this.handsAt > 300) this.hands = [];
      return;
    }
    const W = this.width;
    const H = this.height;
    this.hands = all.map((lm, k) => {
      const g = res.gestures?.[k]?.[0];
      return { x: Float32Array.from(lm, (p) => p.x * W), y: Float32Array.from(lm, (p) => p.y * H), gesture: g?.categoryName ?? 'None', score: g?.score ?? 0 };
    });
    this.handsAt = now;
  }

  detectPose(now: number) {
    if (!this.fresh('pose', now)) return;
    let res;
    try {
      res = this.timed('pose', () => this.runners.pose!.detectForVideo!(this.video, now));
    } catch {
      return;
    }
    this.usePose(res, now);
  }

  private usePose(res: { landmarks?: Pt[][] }, now: number) {
    const all = res.landmarks ?? [];
    if (!all.length) {
      if (now - this.poseAt > 500) this.poses = [];
      return;
    }
    const W = this.width;
    const H = this.height;
    this.poses = all.map((lm) => ({
      x: Float32Array.from(lm, (p) => p.x * W),
      y: Float32Array.from(lm, (p) => p.y * H),
      v: Float32Array.from(lm, (p) => (p as Pt & { visibility?: number }).visibility ?? 1),
    }));
    this.poseAt = now;
  }

  segmentBody(now: number) {
    if (!this.fresh('body', now)) return;
    let res;
    try {
      res = this.timed('body', () => this.runners.body!.segmentForVideo!(this.video, now));
    } catch {
      return;
    }
    const m = res.confidenceMasks?.[0];
    this.useBody(m ? { w: m.width, h: m.height, data: m.getAsFloat32Array().slice() } : null);
    res.close();
  }

  private useBody(m: BodyMask | null) {
    if (m) this.body = m;
  }
}
