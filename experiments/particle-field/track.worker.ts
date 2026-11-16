// The MediaPipe trackers, off the main thread: the page sends a camera frame
// (an ImageBitmap) and gets landmarks back, so a slow tracker (a phone, or no
// GPU) never holds up the particles. A classic worker: MediaPipe loads its
// WASM with importScripts, which module workers don't have.

type Task = 'face' | 'hands' | 'pose' | 'body';
type Edge = { start: number; end: number };
type Cat = { categoryName: string; score: number };
type Pt = { x: number; y: number; z: number; visibility?: number };
type Runner = {
  detectForVideo?(v: ImageBitmap, t: number): { faceLandmarks?: Pt[][]; faceBlendshapes?: { categories: Cat[] }[]; landmarks?: Pt[][] };
  recognizeForVideo?(v: ImageBitmap, t: number): { landmarks: Pt[][]; gestures: Cat[][] };
  segmentForVideo?(v: ImageBitmap, t: number): { confidenceMasks?: { width: number; height: number; getAsFloat32Array(): Float32Array }[]; close(): void };
};
type Maker = { createFromOptions(fs: unknown, o: Record<string, unknown>): Promise<Runner> } & Record<string, Edge[]>;
type Vision = { FilesetResolver: { forVisionTasks(base: string): Promise<unknown> } } & Record<string, Maker>;

const ctx = self as unknown as {
  postMessage(m: unknown, t?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
  importScripts(...u: string[]): void;
  module?: { exports: Vision };
  exports?: Vision;
};
const runners: Partial<Record<Task, Runner>> = {};
let vision: Promise<{ v: Vision; fs: unknown }> | null = null;

function loadVision(base: string) {
  vision ??= (async () => {
    // The CommonJS bundle, with a stand-in `module` for it to fill.
    ctx.module = { exports: {} as Vision };
    ctx.exports = ctx.module.exports;
    ctx.importScripts(`${base}/vision_bundle.cjs`);
    const v = ctx.module.exports;
    const fs = await v.FilesetResolver.forVisionTasks(`${base}/wasm`);
    return { v, fs };
  })();
  return vision;
}

const MAKER: Record<Task, string> = { face: 'FaceLandmarker', hands: 'GestureRecognizer', body: 'ImageSegmenter', pose: 'PoseLandmarker' };
const EDGES: Record<Task, string[]> = {
  face: ['FACE_LANDMARKS_FACE_OVAL', 'FACE_LANDMARKS_LEFT_EYEBROW', 'FACE_LANDMARKS_RIGHT_EYEBROW', 'FACE_LANDMARKS_LEFT_EYE', 'FACE_LANDMARKS_RIGHT_EYE', 'FACE_LANDMARKS_LEFT_IRIS', 'FACE_LANDMARKS_RIGHT_IRIS', 'FACE_LANDMARKS_LIPS', 'FACE_LANDMARKS_TESSELATION'],
  hands: ['HAND_CONNECTIONS'],
  pose: ['POSE_CONNECTIONS'],
  body: [],
};

async function load(task: Task, base: string, model: string) {
  const { v, fs } = await loadVision(base);
  const maker = v[MAKER[task]];
  const opts = (delegate: string) => ({
    baseOptions: { modelAssetPath: model, delegate },
    runningMode: 'VIDEO',
    ...(task === 'face' ? { numFaces: 2, outputFaceBlendshapes: true } : {}),
    ...(task === 'hands' ? { numHands: 2 } : {}),
    ...(task === 'body' ? { outputConfidenceMasks: true, outputCategoryMask: false } : {}),
  });
  try {
    runners[task] = await maker.createFromOptions(fs, opts('GPU'));
  } catch {
    runners[task] = await maker.createFromOptions(fs, opts('CPU'));
  }
  return Object.fromEntries(EDGES[task].map((k) => [k, maker[k]]));
}

function run(task: Task, img: ImageBitmap, ts: number): [unknown, Transferable[]] {
  const r = runners[task]!;
  if (task === 'face') {
    const res = r.detectForVideo!(img, ts);
    return [{ faceLandmarks: res.faceLandmarks ?? [], faceBlendshapes: (res.faceBlendshapes ?? []).map((b) => ({ categories: b.categories.map(({ categoryName, score }) => ({ categoryName, score })) })) }, []];
  }
  if (task === 'hands') {
    const res = r.recognizeForVideo!(img, ts);
    return [{ landmarks: res.landmarks ?? [], gestures: (res.gestures ?? []).map((g) => g.map(({ categoryName, score }) => ({ categoryName, score }))) }, []];
  }
  if (task === 'pose') {
    const res = r.detectForVideo!(img, ts);
    return [{ landmarks: res.landmarks ?? [] }, []];
  }
  const res = r.segmentForVideo!(img, ts);
  const m = res.confidenceMasks?.[0];
  const out = m ? { w: m.width, h: m.height, data: m.getAsFloat32Array().slice() } : null;
  res.close();
  return [{ mask: out }, out ? [out.data.buffer] : []];
}

ctx.onmessage = (e: MessageEvent) => {
  const d = e.data as { type: 'load'; task: Task; base: string; model: string } | { type: 'run'; task: Task; img: ImageBitmap; ts: number };
  if (d.type === 'load') {
    load(d.task, d.base, d.model).then(
      (edges) => ctx.postMessage({ type: 'loaded', task: d.task, ok: true, edges }),
      (err) => ctx.postMessage({ type: 'loaded', task: d.task, ok: false, err: String(err) }),
    );
    return;
  }
  const t0 = performance.now();
  let res: unknown = null;
  let tr: Transferable[] = [];
  try {
    [res, tr] = run(d.task, d.img, d.ts);
  } catch {
    res = null;
  }
  d.img.close();
  ctx.postMessage({ type: 'res', task: d.task, res, ms: performance.now() - t0 }, tr);
};
