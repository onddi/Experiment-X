// Patterns that fill an area. Each one writes n homes into hx/hy, centred on
// the screen and scaled by size. Each has three knobs (scale, a twist of
// its own, variation) and a seed, so it lands the same way every rebuild.

export type FillPattern =
  | 'honeycomb' | 'scatter' | 'rings' | 'spiral' | 'galaxy'
  | 'sunburst' | 'waves' | 'checker' | 'maze' | 'cells';

export const FILL_PATTERNS: [FillPattern, string][] = [
  ['honeycomb', 'Honeycomb'], ['scatter', 'Scatter (even spread)'], ['rings', 'Rings'], ['spiral', 'Spiral'],
  ['galaxy', 'Galaxy'], ['sunburst', 'Sunburst'], ['waves', 'Waves'], ['checker', 'Checker'],
  ['maze', 'Maze'], ['cells', 'Cells'],
];

const isFill = (p: string): p is FillPattern => FILL_PATTERNS.some(([k]) => k === p);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

// Lattice points in a gw×gh box (around 0,0), shrinking the spacing until
// there are at least n, then dropping the extras evenly.
function lattice(n: number, gw: number, gh: number, area: number, hex: boolean, keep: (x: number, y: number) => boolean): [number, number][] {
  let d = Math.sqrt(area / Math.max(1, n) / (hex ? 0.866 : 1));
  let pts: [number, number][] = [];
  for (let tries = 0; tries < 40; tries++) {
    pts = [];
    const dy = hex ? d * 0.866 : d;
    const rows = Math.max(1, Math.floor(gh / dy));
    const cols = Math.max(1, Math.floor(gw / d));
    const oy = -((rows - 1) * dy) / 2;
    const ox = -((cols - 1) * d) / 2;
    for (let r = 0; r < rows; r++) {
      const shift = hex && r % 2 ? d / 2 : 0;
      for (let c = 0; c < cols; c++) {
        const x = ox + c * d + shift - (hex ? d / 4 : 0);
        const y = oy + r * dy;
        if (keep(x, y)) pts.push([x, y]);
      }
    }
    if (pts.length >= n) break;
    d *= 0.96;
  }
  if (pts.length <= n) return pts;
  // Trim the outer rim, so the box keeps its shape with no gaps inside.
  const edge = (p: [number, number]) => Math.max(Math.abs(p[0]) / gw, Math.abs(p[1]) / gh);
  return pts.sort((a, b) => edge(a) - edge(b)).slice(0, n);
}

export type PatternOpts = { scale: number; form: number; vary: number; seed: number };

// What the two pattern knobs mean for each pattern.
export const PATTERN_FORM: Record<FillPattern, string> = {
  honeycomb: 'Wall', scatter: 'Clumping', rings: 'Gaps', spiral: 'Arms', galaxy: 'Arms',
  sunburst: 'Swirl', waves: 'Height', checker: 'Fill', maze: 'Curves', cells: 'Edge width',
};
export const PATTERN_VARY: Record<FillPattern, string> = {
  honeycomb: 'Missing cells', scatter: 'Disorder', rings: 'Wobble', spiral: 'Wobble', galaxy: 'Spread',
  sunburst: 'Ray length', waves: 'Drift', checker: 'Shuffle', maze: 'Randomness', cells: 'Disorder',
};
export const patternArms = (form: number) => 1 + Math.min(5, Math.floor(form * 6));
export const isFillPattern = isFill;

// Spread n points along segments by length; thick > 0 scatters them across.
function alongSegments(segs: number[][], n: number, thick: number, rand: () => number, put: (i: number, x: number, y: number) => void) {
  const len = segs.map(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1));
  const total = len.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const at = ((i + 0.5) / n) * total;
    while (k < segs.length - 1 && acc + len[k] < at) acc += len[k++];
    const [x1, y1, x2, y2] = segs[k] ?? [0, 0, 0, 0];
    const u = len[k] ? (at - acc) / len[k] : 0;
    const nx = -(y2 - y1) / (len[k] || 1);
    const ny = (x2 - x1) / (len[k] || 1);
    const o = thick ? (rand() - 0.5) * thick : 0;
    put(i, x1 + (x2 - x1) * u + nx * o, y1 + (y2 - y1) * u + ny * o);
  }
}

export function fillPattern(pat: string, n: number, w: number, h: number, size: number, hx: Float32Array | number[], hy: Float32Array | number[], o: PatternOpts = { scale: 1, form: 0.5, vary: 0.5, seed: 0 }): boolean {
  if (!isFill(pat)) return false;
  const cx = w / 2;
  const cy = h / 2;
  const R = (Math.min(w, h) / 2) * size;
  const gw = w * size;
  const gh = h * size;
  const sc = Math.max(0.2, o.scale);
  const { form, vary } = o;
  const rand = rng(0x5eed + pat.length * 977 + o.seed * 7919);
  const put = (i: number, x: number, y: number) => {
    hx[i] = cx + x;
    hy[i] = cy + y;
  };
  const fromList = (pts: [number, number][]) => {
    const m = pts.length || 1;
    for (let i = 0; i < n; i++) {
      const p = pts[i % m] ?? [0, 0];
      put(i, p[0], p[1]);
    }
  };
  const inBox = (x: number, y: number) => Math.abs(x) <= gw / 2 && Math.abs(y) <= gh / 2;

  switch (pat) {
    case 'honeycomb': {
      // Hexagon walls; Wall thickens them, Missing cells knocks some out.
      const r = (Math.min(gw, gh) / 9) * sc;
      const segs: number[][] = [];
      const seen = new Set<string>();
      const dx = r * Math.sqrt(3);
      const dy = r * 1.5;
      const rows = Math.ceil(gh / dy) + 2;
      const cols = Math.ceil(gw / dx) + 2;
      const drop = vary * 0.45;
      for (let j = -rows; j <= rows; j++) {
        for (let i = -cols; i <= cols; i++) {
          const hxc = i * dx + (j & 1 ? dx / 2 : 0);
          const hyc = j * dy;
          if (!inBox(hxc, hyc)) continue;
          if (rand() < drop) continue;
          for (let e = 0; e < 6; e++) {
            const a1 = Math.PI / 6 + (e * Math.PI) / 3;
            const a2 = a1 + Math.PI / 3;
            const s = [hxc + Math.cos(a1) * r, hyc + Math.sin(a1) * r, hxc + Math.cos(a2) * r, hyc + Math.sin(a2) * r];
            const key = `${Math.round((s[0] + s[2]) * 2)},${Math.round((s[1] + s[3]) * 2)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            segs.push(s);
          }
        }
      }
      alongSegments(segs, n, form * r * 0.7, rand, put);
      return true;
    }

    case 'checker': {
      // Fill: from square outlines (0) to solid squares (1). Shuffle flips cells.
      const cells = Math.max(2, Math.round(8 / sc));
      const cw = Math.max(gw, gh) / cells;
      const flips = new Map<string, boolean>();
      const on = (x: number, y: number) => {
        const i = Math.floor((x + gw / 2) / cw);
        const j = Math.floor((y + gh / 2) / cw);
        const key = `${i},${j}`;
        if (!flips.has(key)) flips.set(key, rand() < vary * 0.5);
        const base = (i + j) % 2 === 0;
        if (base === flips.get(key)) return false;
        const fx = ((x + gw / 2) / cw) % 1;
        const fy = ((y + gh / 2) / cw) % 1;
        const edge = Math.min(fx, fy, 1 - fx, 1 - fy);
        return edge <= 0.04 + form * 0.5;
      };
      const frac = 0.5 * Math.min(1, 0.2 + form * 1.6);
      fromList(lattice(n, gw, gh, gw * gh * frac, false, on));
      return true;
    }

    case 'scatter': {
      // Disorder: from a neat grid to a random spread. Clumping pulls dots into groups.
      const cols = Math.max(1, Math.round(Math.sqrt((n * gw) / gh)));
      const rows = Math.max(1, Math.ceil(n / cols));
      const cw = gw / cols;
      const ch = gh / rows;
      const jit = vary * 0.9;
      const clumps = Math.max(3, Math.round(12 / sc));
      const ccx = Array.from({ length: clumps }, () => (rand() - 0.5) * gw * 0.9);
      const ccy = Array.from({ length: clumps }, () => (rand() - 0.5) * gh * 0.9);
      for (let i = 0; i < n; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        let x = -gw / 2 + (c + 0.5 + (rand() - 0.5) * jit) * cw;
        let y = -gh / 2 + (r + 0.5 + (rand() - 0.5) * jit) * ch;
        if (form > 0) {
          let best = 0;
          let bd = Infinity;
          for (let k = 0; k < clumps; k++) {
            const d = Math.hypot(x - ccx[k], y - ccy[k]);
            if (d < bd) { bd = d; best = k; }
          }
          const pull = form * form * form * 0.95;
          x += (ccx[best] - x) * pull;
          y += (ccy[best] - y) * pull;
        }
        put(i, x, y);
      }
      return true;
    }

    case 'rings': {
      // Gaps break each ring into dashes; Wobble bends them.
      const K = Math.max(2, Math.min(40, Math.round(Math.sqrt(n / (4 * Math.PI)) / sc)));
      const radii = Array.from({ length: K }, (_, k) => R * ((k + 1) / K));
      const total = radii.reduce((a, b) => a + b, 0);
      const gap = form * 0.7;
      let i = 0;
      radii.forEach((r, k) => {
        const m = k === K - 1 ? n - i : Math.round((n * r) / total);
        const off = rand() * Math.PI * 2;
        const dashes = 3 + Math.floor(rand() * 5) + k;
        const lobes = 2 + Math.floor(rand() * 5);
        const phase = rand() * Math.PI * 2;
        for (let j = 0; j < m && i < n; j++, i++) {
          // Squeeze the points into the dashes, leaving the gaps empty.
          const u = j / m;
          const d = Math.floor(u * dashes);
          const f = (u * dashes) % 1;
          const a = off + ((d + f * (1 - gap)) / dashes) * Math.PI * 2;
          const rr = r * (1 + Math.sin(a * lobes + phase) * vary * 0.12);
          put(i, Math.cos(a) * rr, Math.sin(a) * rr);
        }
      });
      return true;
    }

    case 'spiral': {
      const arms = patternArms(form);
      const turns = Math.max(1, Math.min(20, Math.sqrt(n / (4 * Math.PI)) / sc / arms));
      for (let i = 0; i < n; i++) {
        const arm = i % arms;
        const t = Math.sqrt((Math.floor(i / arms) + 0.5) / Math.ceil(n / arms));
        const a = t * turns * Math.PI * 2 + (arm / arms) * Math.PI * 2;
        const rr = R * t * (1 + Math.sin(a * 3) * vary * 0.08);
        put(i, Math.cos(a) * rr, Math.sin(a) * rr);
      }
      return true;
    }

    case 'galaxy': {
      const arms = patternArms(form);
      const core = Math.floor(n * 0.2);
      const wind = 2.4 / sc;
      for (let i = 0; i < n; i++) {
        if (i < core) {
          const r = Math.abs(gauss(rand)) * R * 0.12;
          const a = rand() * Math.PI * 2;
          put(i, Math.cos(a) * r, Math.sin(a) * r);
          continue;
        }
        const t = Math.sqrt(rand()) * 0.95 + 0.05;
        const arm = i % arms;
        const spread = 0.02 + vary * 0.5;
        const a = (arm / arms) * Math.PI * 2 + t * Math.PI * wind + gauss(rand) * spread * (0.3 + (1 - t));
        const r = R * t * (1 + gauss(rand) * 0.04);
        put(i, Math.cos(a) * r, Math.sin(a) * r * 0.92);
      }
      return true;
    }

    case 'sunburst': {
      // Swirl bends the rays; Ray length makes them uneven.
      const rays = Math.max(6, Math.min(72, Math.round((Math.sqrt(n) * 0.6) / sc)));
      const per = Math.ceil(n / rays);
      const swirl = (form - 0.5) * 2 * Math.PI * 0.9;
      const lens = Array.from({ length: rays }, () => 1 - rand() * vary * 0.7);
      for (let i = 0; i < n; i++) {
        const k = i % rays;
        const j = Math.floor(i / rays);
        const t = 0.1 + 0.9 * ((j + 0.5) / per);
        const r = R * t * lens[k];
        const a = (k / rays) * Math.PI * 2 + swirl * t * t;
        put(i, Math.cos(a) * r, Math.sin(a) * r);
      }
      return true;
    }

    case 'waves': {
      // Height of the waves; Drift shifts each line. Scale stretches them.
      const lines = Math.max(5, Math.min(24, Math.round(Math.sqrt(n) / 3)));
      const per = Math.ceil(n / lines);
      const gap = gh / lines;
      const cycles = 2 / sc;
      const phases = Array.from({ length: lines }, (_, l) => l * 0.6 * (1 - vary) + rand() * Math.PI * 2 * vary);
      for (let i = 0; i < n; i++) {
        const l = i % lines;
        const j = Math.floor(i / lines);
        const u = (j + 0.5) / per;
        const x = -gw / 2 + u * gw;
        const y = -gh / 2 + (l + 0.5) * gap + Math.sin(u * Math.PI * 2 * cycles + phases[l]) * gap * form * 1.4;
        put(i, x, y);
      }
      return true;
    }

    case 'maze': {
      // Truchet tiles: Curves goes from straight diagonals to quarter arcs,
      // Randomness from every tile the same way to a random mix.
      const cellsN = Math.max(6, Math.round(n / 28 / (sc * sc)));
      const c = Math.sqrt((gw * gh) / cellsN);
      const cols = Math.max(2, Math.round(gw / c));
      const rows = Math.max(2, Math.round(gh / c));
      const C = cols * rows;
      const cs = Math.min(gw / cols, gh / rows);
      const pFlip = vary * 0.5;
      const flip = Array.from({ length: C }, (_, k) => ((k % cols) + Math.floor(k / cols)) % 2 === 0 ? rand() < pFlip : rand() >= pFlip);
      const curve = Math.min(1, form * 2);
      const per = Math.ceil(n / C);
      for (let i = 0; i < n; i++) {
        const cell = i % C;
        const k = Math.floor(i / C);
        const u = (k + 0.5) / per;
        const second = u >= 0.5;
        const v = (second ? u - 0.5 : u) * 2;
        const t = v * (Math.PI / 2);
        const x0 = -(cols * cs) / 2 + (cell % cols) * cs;
        const y0 = -(rows * cs) / 2 + Math.floor(cell / cols) * cs;
        let ax: number, ay: number, a0: number;
        if (!flip[cell]) {
          if (!second) { ax = x0; ay = y0; a0 = 0; } else { ax = x0 + cs; ay = y0 + cs; a0 = Math.PI; }
        } else if (!second) { ax = x0 + cs; ay = y0; a0 = Math.PI / 2; } else { ax = x0; ay = y0 + cs; a0 = -Math.PI / 2; }
        // The arc point, and the same spot on the straight chord between its ends.
        const arcX = ax + (Math.cos(a0 + t) * cs) / 2;
        const arcY = ay + (Math.sin(a0 + t) * cs) / 2;
        const sx = ax + (Math.cos(a0) * cs) / 2;
        const sy = ay + (Math.sin(a0) * cs) / 2;
        const ex = ax + (Math.cos(a0 + Math.PI / 2) * cs) / 2;
        const ey = ay + (Math.sin(a0 + Math.PI / 2) * cs) / 2;
        const lx = sx + (ex - sx) * v;
        const ly = sy + (ey - sy) * v;
        put(i, lx + (arcX - lx) * curve, ly + (arcY - ly) * curve);
      }
      return true;
    }

    case 'cells': {
      // Voronoi edges. Disorder: from a regular grid of seeds to a random one.
      const seeds = Math.max(4, Math.min(80, Math.round(Math.sqrt(n) / 2.5 / (sc * sc))));
      const cols = Math.max(1, Math.round(Math.sqrt((seeds * gw) / gh)));
      const rows = Math.max(1, Math.ceil(seeds / cols));
      const cw = gw / cols;
      const ch = gh / rows;
      const sx: number[] = [];
      const sy: number[] = [];
      for (let r = 0; r < rows; r++) {
        for (let q = 0; q < cols; q++) {
          const jx = (rand() - 0.5) * vary * 1.6;
          const jy = (rand() - 0.5) * vary * 1.6;
          sx.push(-gw / 2 + (q + 0.5 + (r % 2 ? 0.25 : -0.25) * (1 - vary) + jx * 0.5) * cw);
          sy.push(-gh / 2 + (r + 0.5 + jy * 0.5) * ch);
        }
      }
      const band = Math.sqrt((gw * gh) / sx.length) * (0.012 + form * 0.12);
      let i = 0;
      for (let tries = 0; i < n && tries < n * 80; tries++) {
        const x = (rand() - 0.5) * gw;
        const y = (rand() - 0.5) * gh;
        let d1 = Infinity;
        let d2 = Infinity;
        for (let s = 0; s < sx.length; s++) {
          const d = Math.hypot(x - sx[s], y - sy[s]);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        if (d2 - d1 < band) put(i++, x, y);
      }
      for (let j = 0; i < n; i++, j++) put(i, hx[j] - cx, hy[j] - cy);
      return true;
    }
  }
  return false;
}
