// Media for the emitters: 3D models (OBJ, STL, glTF / GLB) turned into
// surface points, animated GIFs decoded to frames, and sprite sheets cut into
// frames. Pure helpers, no settings.


/** Points spread evenly over a mesh's surface, centred and scaled to about 1, y up → y down, in random order. */
export function surfacePoints(pos: Float32Array, idx: Uint32Array | null, count = 16000): Float32Array {
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

type Gltf = {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  meshes?: { primitives: { attributes: { POSITION?: number }; indices?: number; mode?: number }[] }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteStride?: number }[];
  buffers?: { uri?: string; byteLength: number }[];
};
const mul = (a: number[], b: number[]) => {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function nodeMatrix(n: NonNullable<Gltf['nodes']>[number]) {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** glTF (with embedded buffers) or GLB → flat triangle positions, node transforms applied. */
export function parseGltf(buf: ArrayBuffer): Float32Array {
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
  const read = (ai: number): Float32Array | Uint32Array | null => {
    const acc = json.accessors?.[ai];
    if (!acc || acc.bufferView === undefined) return null;
    const bv = json.bufferViews![acc.bufferView];
    const b = buffers[bv.buffer];
    if (!b) return null;
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type] ?? 1;
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[acc.componentType] ?? 4;
    const stride = bv.byteStride || comps * size;
    const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const d = new DataView(b);
    const out = acc.componentType === 5126 ? new Float32Array(acc.count * comps) : new Uint32Array(acc.count * comps);
    for (let q = 0; q < acc.count; q++)
      for (let c = 0; c < comps; c++) {
        const o = base + q * stride + c * size;
        out[q * comps + c] = acc.componentType === 5126 ? d.getFloat32(o, true) : acc.componentType === 5125 ? d.getUint32(o, true) : acc.componentType === 5123 ? d.getUint16(o, true) : d.getUint8(o);
      }
    return out;
  };
  const tris: number[] = [];
  const visit = (ni: number, parent: number[]) => {
    const node = json.nodes?.[ni];
    if (!node) return;
    const m = mul(parent, nodeMatrix(node));
    const mesh = node.mesh !== undefined ? json.meshes?.[node.mesh] : undefined;
    for (const pr of mesh?.primitives ?? []) {
      if (pr.attributes.POSITION === undefined || (pr.mode !== undefined && pr.mode !== 4)) continue;
      const p = read(pr.attributes.POSITION);
      if (!p) continue;
      const idx = pr.indices !== undefined ? read(pr.indices) : null;
      const count = idx ? idx.length : p.length / 3;
      for (let q = 0; q < count; q++) {
        const v = (idx ? idx[q] : q) * 3;
        const [x, y, z] = [p[v], p[v + 1], p[v + 2]];
        tris.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      }
    }
    for (const c of node.children ?? []) visit(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? (json.nodes ?? []).map((_, k) => k);
  for (const r of roots) visit(r, I);
  return new Float32Array(tris);
}

/** Any supported model file → surface points (empty if nothing usable). */
export async function modelFromFile(f: File): Promise<Float32Array> {
  const name = f.name.toLowerCase();
  if (name.endsWith('.obj')) {
    const m = parseObj(await f.text());
    return surfacePoints(m.pos, m.idx);
  }
  const buf = await f.arrayBuffer();
  if (name.endsWith('.stl')) return surfacePoints(parseStl(buf), null);
  return surfacePoints(parseGltf(buf), null);
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
export function sliceSheet(img: CanvasImageSource & { width: number; height: number }, cols: number, rows: number, px = 96): HTMLCanvasElement[] {
  const W = img.width;
  const H = img.height;
  if (!cols || !rows) {
    // A strip of square frames, side by side or stacked; else one frame.
    if (W >= H * 1.5 && Math.abs(W / H - Math.round(W / H)) < 0.05) (cols = Math.round(W / H)), (rows = 1);
    else if (H >= W * 1.5 && Math.abs(H / W - Math.round(H / W)) < 0.05) (cols = 1), (rows = Math.round(H / W));
    else cols = rows = 1;
  }
  const fw = W / cols;
  const fh = H / rows;
  const out: HTMLCanvasElement[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = px;
      const k = px / Math.max(fw, fh);
      cv.getContext('2d')!.drawImage(img, c * fw, r * fh, fw, fh, (px - fw * k) / 2, (px - fh * k) / 2, fw * k, fh * k);
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
