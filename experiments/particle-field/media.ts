// Media for the emitters: 3D models (OBJ, STL, glTF / GLB) turned into
// surface points, animated GIFs decoded to frames, and sprite sheets cut into
// frames. Pure helpers, no settings.


/** Points spread evenly over a mesh's surface, centred and scaled to about 1, y up → y down, in random order. */
export type SurfaceRec = { tri: Uint32Array; bary: Float32Array; mid: number[]; k: number };
export function surfacePoints(pos: Float32Array, idx: Uint32Array | null, count = 16000, rec?: SurfaceRec): Float32Array {
  const triCount = idx ? Math.floor(idx.length / 3) : Math.floor(pos.length / 9);
  const corner = (t: number, c: number) => (idx ? idx[t * 3 + c] : t * 3 + c) * 3;
  // Bounds first, to centre and scale.
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < pos.length; k += 3)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], pos[k + a]);
      hi[a] = Math.max(hi[a], pos[k + a]);
    }
  if (!Number.isFinite(lo[0])) return new Float32Array(0);
  const mid = lo.map((v, a) => (v + hi[a]) / 2);
  const ext = Math.max(...hi.map((v, a) => v - lo[a])) / 2 || 1;
  const k = 0.9 / ext;
  if (rec) {
    rec.mid = mid;
    rec.k = k;
  }
  // Area of each triangle, as a running total, to pick triangles by area.
  const acc = new Float64Array(triCount);
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const a = corner(t, 0);
    const b = corner(t, 1);
    const c = corner(t, 2);
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    acc[t] = total;
  }
  const out = new Float32Array(count * 3);
  if (total <= 0) {
    // No faces (a point cloud): use the vertices.
    const nv = pos.length / 3;
    for (let q = 0; q < count; q++) {
      const v = ((Math.random() * nv) | 0) * 3;
      out[q * 3] = (pos[v] - mid[0]) * k;
      out[q * 3 + 1] = -(pos[v + 1] - mid[1]) * k;
      out[q * 3 + 2] = (pos[v + 2] - mid[2]) * k;
    }
    return out;
  }
  for (let q = 0; q < count; q++) {
    const r = Math.random() * total;
    let l = 0;
    let h = triCount - 1;
    while (l < h) {
      const m = (l + h) >> 1;
      if (acc[m] < r) l = m + 1;
      else h = m;
    }
    const a = corner(l, 0);
    const b = corner(l, 1);
    const c = corner(l, 2);
    let s = Math.random();
    let u = Math.random();
    if (s + u > 1) (s = 1 - s), (u = 1 - u);
    if (rec) {
      rec.tri[q * 3] = a / 3;
      rec.tri[q * 3 + 1] = b / 3;
      rec.tri[q * 3 + 2] = c / 3;
      rec.bary[q * 2] = s;
      rec.bary[q * 2 + 1] = u;
    }
    for (let d = 0; d < 3; d++) {
      const v = pos[a + d] + (pos[b + d] - pos[a + d]) * s + (pos[c + d] - pos[a + d]) * u;
      out[q * 3 + d] = (v - mid[d]) * k * (d === 1 ? -1 : 1);
    }
  }
  return out;
}

/** OBJ text → positions and triangle indices (faces fanned). */
export function parseObj(text: string): { pos: Float32Array; idx: Uint32Array } {
  const v: number[] = [];
  const f: number[] = [];
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push(+p[1], +p[2], +p[3]);
    else if (p[0] === 'f') {
      const nv = v.length / 3;
      const ids = p.slice(1).map((s) => {
        const i = parseInt(s, 10);
        return i < 0 ? nv + i : i - 1;
      });
      for (let k = 1; k + 1 < ids.length; k++) f.push(ids[0], ids[k], ids[k + 1]);
    }
  }
  return { pos: new Float32Array(v), idx: new Uint32Array(f) };
}

/** STL (binary or text) → flat triangle positions. */
export function parseStl(buf: ArrayBuffer): Float32Array {
  const dv = new DataView(buf);
  const n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  if (n > 0 && 84 + n * 50 === buf.byteLength) {
    const out = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) for (let c = 0; c < 9; c++) out[t * 9 + c] = dv.getFloat32(84 + t * 50 + 12 + c * 4, true);
    return out;
  }
  const text = new TextDecoder().decode(buf);
  const v: number[] = [];
  for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) v.push(+m[1], +m[2], +m[3]);
  return new Float32Array(v);
}

type GNode = { mesh?: number; skin?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; weights?: number[] };
type Gltf = {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GNode[];
  meshes?: { weights?: number[]; primitives: { attributes: { POSITION?: number; JOINTS_0?: number; WEIGHTS_0?: number }; indices?: number; mode?: number; targets?: { POSITION?: number }[] }[] }[];
  skins?: { joints: number[]; inverseBindMatrices?: number }[];
  animations?: { name?: string; channels: { sampler: number; target: { node?: number; path: string } }[]; samplers: { input: number; output: number; interpolation?: string }[] }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteStride?: number }[];
  buffers?: { uri?: string; byteLength: number }[];
};
const mul = (a: number[], b: number[]) => {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const trs = (t: ArrayLike<number>, q: ArrayLike<number>, s: ArrayLike<number>) => {
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]];
  const [sx, sy, sz] = [s[0], s[1], s[2]];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
};
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A glTF or GLB file opened: its JSON and a reader for its accessors. */
function openGltf(buf: ArrayBuffer) {
  const dv = new DataView(buf);
  let json: Gltf;
  let bin: ArrayBuffer | null = null;
  if (dv.getUint32(0, true) === 0x46546c67) {
    // GLB: a JSON chunk, then a binary chunk.
    let off = 12;
    json = {};
    while (off < buf.byteLength) {
      const len = dv.getUint32(off, true);
      const type = dv.getUint32(off + 4, true);
      const body = buf.slice(off + 8, off + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
      else if (type === 0x004e4942) bin = body;
      off += 8 + len;
    }
  } else json = JSON.parse(new TextDecoder().decode(buf));
  const buffers = (json.buffers ?? []).map((b, k) => {
    if (!b.uri) return k === 0 ? bin : null;
    const m = /^data:.*?;base64,(.*)$/.exec(b.uri);
    if (!m) return null; // an outside .bin file: not available
    const s = atob(m[1]);
    const a = new Uint8Array(s.length);
    for (let q = 0; q < s.length; q++) a[q] = s.charCodeAt(q);
    return a.buffer;
  });
  // Floats as they are; whole numbers too, unless the accessor says they stand for 0..1 (or -1..1).
  const read = (ai: number | undefined): Float32Array | null => {
    if (ai === undefined) return null;
    const acc = json.accessors?.[ai];
    if (!acc || acc.bufferView === undefined) return null;
    const bv = json.bufferViews![acc.bufferView];
    const b = buffers[bv.buffer];
    if (!b) return null;
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type] ?? 1;
    const ct = acc.componentType;
    const size = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 }[ct] ?? 4;
    const stride = bv.byteStride || comps * size;
    const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const d = new DataView(b);
    const norm = acc.normalized ? ({ 5123: 65535, 5122: 32767, 5121: 255, 5120: 127 }[ct] ?? 1) : 1;
    const out = new Float32Array(acc.count * comps);
    for (let q = 0; q < acc.count; q++)
      for (let c = 0; c < comps; c++) {
        const o = base + q * stride + c * size;
        const v = ct === 5126 ? d.getFloat32(o, true) : ct === 5125 ? d.getUint32(o, true) : ct === 5123 ? d.getUint16(o, true) : ct === 5122 ? d.getInt16(o, true) : ct === 5121 ? d.getUint8(o) : d.getInt8(o);
        out[q * comps + c] = norm === 1 ? v : Math.max(-1, v / norm);
      }
    return out;
  };
  return { json, read };
}

/** glTF (with embedded buffers) or GLB → flat triangle positions, node transforms applied. */
export function parseGltf(buf: ArrayBuffer): Float32Array {
  const m = gltfMesh(buf);
  const out = new Float32Array(m.idx.length * 3);
  for (let q = 0; q < m.idx.length; q++) for (let d = 0; d < 3; d++) out[q * 3 + d] = m.rest[m.idx[q] * 3 + d];
  return out;
}

/** An animated model's clips, and its points posed at any moment of one. */
export type ModelAnim = {
  clips: { name: string; duration: number }[];
  /** The surface points (same order as the model's) at t seconds into a clip, written into out. */
  pose: (clip: number, t: number, out: Float32Array) => void;
};

type Prim = { node: number; skin: number; base: number; pos: Float32Array; joints: Float32Array | null; weights: Float32Array | null; targets: Float32Array[]; meshWeights: number[] };
type Track = { node: number; path: string; times: Float32Array; values: Float32Array; step: boolean; cubic: boolean; width: number };

/** Every triangle primitive of the scene, its vertices posed by `posed` (rest pose to start). */
function gltfMesh(buf: ArrayBuffer) {
  const { json, read } = openGltf(buf);
  const nodes = json.nodes ?? [];
  const N = nodes.length;
  // Each node's rest transform as translation, rotation, scale (a matrix when it gives one).
  const rest = nodes.map((nd) => ({
    t: nd.translation ?? [0, 0, 0],
    r: nd.rotation ?? [0, 0, 0, 1],
    s: nd.scale ?? [1, 1, 1],
    m: nd.matrix ?? null,
  }));
  const parent = new Int32Array(N).fill(-1);
  nodes.forEach((nd, k) => nd.children?.forEach((c) => (parent[c] = k)));
  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, k) => k).filter((k) => parent[k] < 0);
  // The primitives, in scene order.
  const prims: Prim[] = [];
  const idx: number[] = [];
  let verts = 0;
  const visit = (ni: number) => {
    const nd = nodes[ni];
    if (!nd) return;
    const mesh = nd.mesh !== undefined ? json.meshes?.[nd.mesh] : undefined;
    for (const pr of mesh?.primitives ?? []) {
      if (pr.mode !== undefined && pr.mode !== 4) continue;
      const pos = read(pr.attributes.POSITION);
      if (!pos) continue;
      const ix = read(pr.indices);
      const count = ix ? ix.length : pos.length / 3;
      for (let q = 0; q < count; q++) idx.push(verts + (ix ? ix[q] : q));
      const skin = nd.skin !== undefined && json.skins?.[nd.skin] ? nd.skin : -1;
      prims.push({
        node: ni,
        skin,
        base: verts,
        pos,
        joints: skin >= 0 ? read(pr.attributes.JOINTS_0) : null,
        weights: skin >= 0 ? read(pr.attributes.WEIGHTS_0) : null,
        targets: (pr.targets ?? []).map((t) => read(t.POSITION) ?? new Float32Array(pos.length)),
        meshWeights: nd.weights ?? mesh?.weights ?? [],
      });
      verts += pos.length / 3;
    }
    for (const c of nd.children ?? []) visit(c);
  };
  for (const r of sceneRoots) visit(r);
  const ibm = (json.skins ?? []).map((sk) => {
    const a = read(sk.inverseBindMatrices);
    return sk.joints.map((_, j) => (a ? Array.from(a.subarray(j * 16, j * 16 + 16)) : I4));
  });
  // The animation clips, as tracks per node.
  const clips = (json.animations ?? []).map((an, k) => {
    const tracks: Track[] = [];
    let duration = 0;
    for (const ch of an.channels) {
      const sm = an.samplers[ch.sampler];
      if (!sm || ch.target.node === undefined || !nodes[ch.target.node]) continue;
      const times = read(sm.input);
      const values = read(sm.output);
      if (!times || !values || !times.length) continue;
      const path = ch.target.path;
      const cubic = sm.interpolation === 'CUBICSPLINE';
      const width = Math.round(values.length / times.length / (cubic ? 3 : 1));
      if (!width) continue;
      tracks.push({ node: ch.target.node, path, times, values, step: sm.interpolation === 'STEP', cubic, width });
      duration = Math.max(duration, times[times.length - 1]);
    }
    return { name: an.name || `Clip ${k + 1}`, duration, tracks };
  }).filter((c) => c.tracks.length && c.duration > 0);

  // A track's value at t (linear, or rotations blended along the short way).
  const sample = (tr: Track, t: number, out: number[]) => {
    const T = tr.times;
    const W = tr.width;
    const at = (k: number, c: number) => tr.values[(tr.cubic ? k * 3 + 1 : k) * W + c];
    let k = 0;
    if (t <= T[0]) k = -1;
    else if (t >= T[T.length - 1]) k = T.length - 1;
    else {
      let lo = 0;
      let hi = T.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (T[m] <= t) lo = m;
        else hi = m;
      }
      k = lo;
    }
    if (k < 0 || k >= T.length - 1 || tr.step) {
      const kk = Math.max(0, k);
      for (let c = 0; c < W; c++) out[c] = at(kk, c);
      return;
    }
    const f = (t - T[k]) / (T[k + 1] - T[k] || 1);
    let sgn = 1;
    if (tr.path === 'rotation') {
      let dot = 0;
      for (let c = 0; c < 4; c++) dot += at(k, c) * at(k + 1, c);
      if (dot < 0) sgn = -1;
    }
    let len = 0;
    for (let c = 0; c < W; c++) {
      out[c] = at(k, c) * (1 - f) + sgn * at(k + 1, c) * f;
      len += out[c] * out[c];
    }
    if (tr.path === 'rotation' && len > 0) for (let c = 0; c < 4; c++) out[c] /= Math.sqrt(len);
  };

  const world: number[][] = new Array(N);
  const posed = new Float32Array(verts * 3);
  /**
   * Pose the scene for a clip at t (clip -1: the rest pose) and write the
   * vertices, or only the ones `only` lists, into `posed`.
   */
  const pose = (clip: number, t: number, only: Uint32Array | null) => {
    const T = rest.map((r) => r.t.slice());
    const R = rest.map((r) => r.r.slice());
    const S = rest.map((r) => r.s.slice());
    const animated = new Uint8Array(N);
    const mw: (number[] | null)[] = new Array(N).fill(null);
    const c = clips[clip];
    if (c) {
      for (const tr of c.tracks) {
        const v: number[] = [];
        sample(tr, t, v);
        if (tr.path === 'translation') T[tr.node] = v;
        else if (tr.path === 'rotation') R[tr.node] = v;
        else if (tr.path === 'scale') S[tr.node] = v;
        else if (tr.path === 'weights') mw[tr.node] = v;
        animated[tr.node] = 1;
      }
    }
    const done = new Uint8Array(N);
    const solve = (k: number): number[] => {
      if (done[k]) return world[k];
      const local = rest[k].m && !animated[k] ? rest[k].m! : trs(T[k], R[k], S[k]);
      world[k] = parent[k] >= 0 ? mul(solve(parent[k]), local) : local;
      done[k] = 1;
      return world[k];
    };
    for (let k = 0; k < N; k++) solve(k);
    const jm = (json.skins ?? []).map((sk, s) => sk.joints.map((j, q) => (nodes[j] ? mul(world[j], ibm[s][q]) : I4)));
    let p = 0;
    const list = only ?? null;
    const total = list ? list.length : verts;
    for (let q = 0; q < total; q++) {
      const g = list ? list[q] : q;
      while (p + 1 < prims.length && prims[p + 1].base <= g) p++;
      while (p > 0 && prims[p].base > g) p--;
      const pr = prims[p];
      const v = g - pr.base;
      let x = pr.pos[v * 3];
      let y = pr.pos[v * 3 + 1];
      let z = pr.pos[v * 3 + 2];
      const ws = mw[pr.node] ?? pr.meshWeights;
      for (let m = 0; m < pr.targets.length; m++) {
        const wt = ws[m] ?? 0;
        if (!wt) continue;
        const d = pr.targets[m];
        x += d[v * 3] * wt;
        y += d[v * 3 + 1] * wt;
        z += d[v * 3 + 2] * wt;
      }
      let ox = 0;
      let oy = 0;
      let oz = 0;
      if (pr.skin >= 0 && pr.joints && pr.weights) {
        const mats = jm[pr.skin];
        let wsum = 0;
        for (let i = 0; i < 4; i++) {
          const wt = pr.weights[v * 4 + i];
          if (!wt) continue;
          const M = mats[pr.joints[v * 4 + i]] ?? I4;
          ox += (M[0] * x + M[4] * y + M[8] * z + M[12]) * wt;
          oy += (M[1] * x + M[5] * y + M[9] * z + M[13]) * wt;
          oz += (M[2] * x + M[6] * y + M[10] * z + M[14]) * wt;
          wsum += wt;
        }
        if (wsum > 0) {
          ox /= wsum;
          oy /= wsum;
          oz /= wsum;
        } else [ox, oy, oz] = [x, y, z];
      } else {
        const M = world[pr.node];
        ox = M[0] * x + M[4] * y + M[8] * z + M[12];
        oy = M[1] * x + M[5] * y + M[9] * z + M[13];
        oz = M[2] * x + M[6] * y + M[10] * z + M[14];
      }
      posed[g * 3] = ox;
      posed[g * 3 + 1] = oy;
      posed[g * 3 + 2] = oz;
    }
  };
  pose(-1, 0, null);
  return { rest: posed.slice(), idx: new Uint32Array(idx), clips, pose, posed };
}

/** A glTF / GLB model: its surface points, and its animation when it has clips. */
export function gltfModel(buf: ArrayBuffer, count = 16000): { pts: Float32Array; anim: ModelAnim | null } {
  const m = gltfMesh(buf);
  const rec: SurfaceRec = { tri: new Uint32Array(count * 3), bary: new Float32Array(count * 2), mid: [0, 0, 0], k: 1 };
  const pts = surfacePoints(m.rest, m.idx, count, rec);
  if (!m.clips.length || m.idx.length < 3 || pts.length !== count * 3) return { pts, anim: null };
  // Only the vertices the points sit between need posing.
  const usedV = new Uint32Array([...new Set(rec.tri)].sort((a, b) => a - b));
  const P = m.posed;
  return {
    pts,
    anim: {
      clips: m.clips.map((c) => ({ name: c.name, duration: c.duration })),
      pose(clip, t, out) {
        const c = m.clips[clip];
        if (!c) return;
        m.pose(clip, ((t % c.duration) + c.duration) % c.duration, usedV);
        const { tri, bary, mid, k } = rec;
        for (let q = 0; q < count; q++) {
          const a = tri[q * 3] * 3;
          const b = tri[q * 3 + 1] * 3;
          const cc = tri[q * 3 + 2] * 3;
          const s = bary[q * 2];
          const u = bary[q * 2 + 1];
          for (let d = 0; d < 3; d++) {
            const v = P[a + d] + (P[b + d] - P[a + d]) * s + (P[cc + d] - P[a + d]) * u;
            out[q * 3 + d] = (v - mid[d]) * k * (d === 1 ? -1 : 1);
          }
        }
      },
    },
  };
}

/** Any supported model file → surface points (empty if nothing usable), and the animation if it has one. */
export async function modelFromFile(f: File): Promise<{ pts: Float32Array; anim: ModelAnim | null }> {
  const name = f.name.toLowerCase();
  if (name.endsWith('.obj')) {
    const m = parseObj(await f.text());
    return { pts: surfacePoints(m.pos, m.idx), anim: null };
  }
  const buf = await f.arrayBuffer();
  if (name.endsWith('.stl')) return { pts: surfacePoints(parseStl(buf), null), anim: null };
  return gltfModel(buf);
}

/** Frames of an animated GIF (or any image ImageDecoder reads); null where the browser can't. */
export async function decodeFrames(f: File): Promise<{ frames: HTMLCanvasElement[]; ms: number[] } | null> {
  const ID = (window as unknown as { ImageDecoder?: new (o: { data: ReadableStream | ArrayBuffer; type: string }) => {
    tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
    decode: (o: { frameIndex: number }) => Promise<{ image: VideoFrame }>;
    close: () => void;
  } }).ImageDecoder;
  if (!ID) return null;
  try {
    const dec = new ID({ data: await f.arrayBuffer(), type: f.type || 'image/gif' });
    await dec.tracks.ready;
    const count = Math.min(120, dec.tracks.selectedTrack?.frameCount ?? 1);
    const frames: HTMLCanvasElement[] = [];
    const ms: number[] = [];
    for (let k = 0; k < count; k++) {
      const { image } = await dec.decode({ frameIndex: k });
      const c = document.createElement('canvas');
      c.width = image.displayWidth;
      c.height = image.displayHeight;
      c.getContext('2d')!.drawImage(image, 0, 0);
      ms.push(Math.max(20, (image.duration ?? 100000) / 1000));
      image.close();
      frames.push(c);
    }
    dec.close();
    return frames.length > 1 ? { frames, ms } : null;
  } catch {
    return null;
  }
}

/** A sprite sheet cut into square frames (cols × rows; 0 = guess from the shape). */
/**
 * Find a sheet's grid. With transparency: the most columns (and rows) whose
 * boundaries all fall on clear lines. Without: a strip of square frames, else
 * one frame.
 */
export function detectGrid(img: CanvasImageSource & { width: number; height: number }): [number, number] {
  const W = img.width;
  const H = img.height;
  const strip = (): [number, number] => {
    if (W >= H * 1.5 && Math.abs(W / H - Math.round(W / H)) < 0.05) return [Math.round(W / H), 1];
    if (H >= W * 1.5 && Math.abs(H / W - Math.round(H / W)) < 0.05) return [1, Math.round(H / W)];
    return [1, 1];
  };
  if (W * H > 4096 * 4096 || W < 2 || H < 2) return strip();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const col = new Float64Array(W);
  const row = new Float64Array(H);
  let clear = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = d[(y * W + x) * 4 + 3];
      col[x] += a;
      row[y] += a;
      if (a < 8) clear++;
    }
  // Hardly any transparency (a JPG, a solid background): no gaps to go by.
  if (clear < W * H * 0.05) return strip();
  const pick = (sum: Float64Array, len: number) => {
    let max = 0;
    for (let q = 0; q < len; q++) max = Math.max(max, sum[q]);
    const thr = max * 0.02;
    const empty = (q: number) => q < 0 || q >= len || sum[q] <= thr;
    for (let n = Math.min(64, Math.floor(len / 8)); n >= 2; n--) {
      if (len % n) continue;
      const step = len / n;
      let ok = true;
      for (let k = 1; k < n && ok; k++) {
        const q = k * step;
        // A clear line on either side of the cut.
        if (!(empty(q) || empty(q - 1))) ok = false;
      }
      if (ok) return n;
    }
    return 1;
  };
  const cols = pick(col, W);
  const rows = pick(row, H);
  if (cols === 1 && rows === 1) return strip();
  return [cols, rows];
}

export function sliceSheet(img: CanvasImageSource & { width: number; height: number }, cols: number, rows: number, px = 96): HTMLCanvasElement[] {
  const W = img.width;
  const H = img.height;
  if (!cols || !rows) {
    const [c, r] = detectGrid(img);
    cols ||= c;
    rows ||= r;
  }
  const fw = W / cols;
  const fh = H / rows;
  const out: HTMLCanvasElement[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = px;
      const k = px / Math.max(fw, fh);
      const g = cv.getContext('2d')!;
      // Small frames are likely pixel art: keep the pixels sharp.
      g.imageSmoothingEnabled = Math.max(fw, fh) >= 48;
      g.drawImage(img, c * fw, r * fh, fw, fh, (px - fw * k) / 2, (px - fh * k) / 2, fw * k, fh * k);
      out.push(cv);
    }
  return out;
}

/** The built-in sheet: a butterfly flapping, 8 frames, drawn in white so it takes the palette. */
export function butterflySheet(px = 96): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let k = 0; k < 8; k++) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    const m = px / 2;
    // Facing right (heading 0): wings above and below the body, folding in.
    const open = 0.25 + 0.75 * Math.abs(Math.cos((k / 8) * Math.PI));
    g.translate(m, m);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (const side of [-1, 1]) {
      g.save();
      g.scale(1, side * open);
      g.beginPath();
      g.moveTo(2, 0);
      g.bezierCurveTo(px * 0.12, -px * 0.46, px * 0.44, -px * 0.4, px * 0.2, -px * 0.08);
      g.bezierCurveTo(px * 0.1, -px * 0.02, px * 0.02, 0, 2, 0);
      g.fill();
      g.beginPath();
      g.moveTo(-2, 0);
      g.bezierCurveTo(-px * 0.08, -px * 0.36, -px * 0.36, -px * 0.3, -px * 0.24, -px * 0.06);
      g.bezierCurveTo(-px * 0.16, -px * 0.02, -px * 0.06, 0, -2, 0);
      g.globalAlpha = 0.75;
      g.fill();
      g.globalAlpha = 1;
      g.restore();
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(0, 0, px * 0.2, px * 0.035, 0, 0, Math.PI * 2);
    g.fill();
    out.push(c);
  }
  return out;
}

/** The built-in model: a small rocket (lathe body, three fins), as points. */
export function rocketPoints(count = 16000): Float32Array {
  const prof: [number, number][] = [[0, 1], [0.12, 0.8], [0.2, 0.55], [0.22, 0.2], [0.22, -0.45], [0.18, -0.6], [0.12, -0.68], [0, -0.68]];
  const seg = 28;
  const v: number[] = [];
  const f: number[] = [];
  for (let p = 0; p < prof.length; p++)
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      v.push(Math.cos(a) * prof[p][0], prof[p][1], Math.sin(a) * prof[p][0]);
    }
  for (let p = 0; p + 1 < prof.length; p++)
    for (let s = 0; s < seg; s++) {
      const a = p * seg + s;
      const b = p * seg + ((s + 1) % seg);
      f.push(a, b, b + seg, a, b + seg, a + seg);
    }
  // Fins: flat triangles at three angles, near the base.
  for (let q = 0; q < 3; q++) {
    const a = (q / 3) * Math.PI * 2;
    const base = v.length / 3;
    const pt = (r: number, y: number) => v.push(Math.cos(a) * r, y, Math.sin(a) * r);
    pt(0.2, -0.1);
    pt(0.2, -0.62);
    pt(0.5, -0.78);
    pt(0.48, -0.5);
    f.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Up is +y in the model; surfacePoints flips it for the screen.
  return surfacePoints(new Float32Array(v), new Uint32Array(f), count);
}
