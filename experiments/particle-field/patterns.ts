// Patterns that fill an area. Each one writes n homes into hx/hy, centred on
// the screen and scaled by size. They use a fixed random seed, so a pattern
// lands the same way every time it is rebuilt.

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

export function fillPattern(pat: string, n: number, w: number, h: number, size: number, hx: Float32Array | number[], hy: Float32Array | number[]): boolean {
  if (!isFill(pat)) return false;
  const cx = w / 2;
  const cy = h / 2;
  const R = (Math.min(w, h) / 2) * size;
  const gw = w * size;
  const gh = h * size;
  const rand = rng(0x5eed + pat.length * 977);
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

  switch (pat) {
    case 'honeycomb':
      fromList(lattice(n, gw, gh, gw * gh, true, () => true));
      return true;

    case 'checker': {
      const cells = 8;
      const cw = Math.max(gw, gh) / cells;
      fromList(lattice(n, gw, gh, (gw * gh) / 2, false, (x, y) => (Math.floor((x + gw / 2) / cw) + Math.floor((y + gh / 2) / cw)) % 2 === 0));
      return true;
    }

    case 'scatter': {
      // One point in each cell of a grid, jittered: even but never regular.
      const cols = Math.max(1, Math.round(Math.sqrt((n * gw) / gh)));
      const rows = Math.max(1, Math.ceil(n / cols));
      const cw = gw / cols;
      const ch = gh / rows;
      for (let i = 0; i < n; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        put(i, -gw / 2 + (c + 0.1 + rand() * 0.8) * cw, -gh / 2 + (r + 0.1 + rand() * 0.8) * ch);
      }
      return true;
    }

    case 'rings': {
      const K = Math.max(3, Math.min(24, Math.round(Math.sqrt(n / (4 * Math.PI)))));
      const radii = Array.from({ length: K }, (_, k) => R * ((k + 1) / K));
      const total = radii.reduce((a, b) => a + b, 0);
      let i = 0;
      radii.forEach((r, k) => {
        const m = k === K - 1 ? n - i : Math.round((n * r) / total);
        const off = k * 0.37;
        for (let j = 0; j < m && i < n; j++, i++) {
          const a = off + (j / m) * Math.PI * 2;
          put(i, Math.cos(a) * r, Math.sin(a) * r);
        }
      });
      return true;
    }

    case 'spiral': {
      const turns = Math.max(3, Math.min(20, Math.round(Math.sqrt(n / (4 * Math.PI)))));
      for (let i = 0; i < n; i++) {
        const t = Math.sqrt((i + 0.5) / n);
        const a = t * turns * Math.PI * 2;
        put(i, Math.cos(a) * R * t, Math.sin(a) * R * t);
      }
      return true;
    }

    case 'galaxy': {
      const arms = 3;
      const core = Math.floor(n * 0.2);
      for (let i = 0; i < n; i++) {
        if (i < core) {
          const r = Math.abs(gauss(rand)) * R * 0.12;
          const a = rand() * Math.PI * 2;
          put(i, Math.cos(a) * r, Math.sin(a) * r);
          continue;
        }
        const t = Math.sqrt(rand()) * 0.95 + 0.05;
        const arm = i % arms;
        const a = (arm / arms) * Math.PI * 2 + t * Math.PI * 2.4 + gauss(rand) * (0.06 + 0.25 * (1 - t));
        const r = R * t * (1 + gauss(rand) * 0.04);
        put(i, Math.cos(a) * r, Math.sin(a) * r * 0.92);
      }
      return true;
    }

    case 'sunburst': {
      const rays = Math.max(12, Math.min(48, Math.round(Math.sqrt(n) * 0.6)));
      const per = Math.ceil(n / rays);
      for (let i = 0; i < n; i++) {
        const k = i % rays;
        const j = Math.floor(i / rays);
        const r = R * (0.1 + 0.9 * ((j + 0.5) / per));
        const a = (k / rays) * Math.PI * 2;
        put(i, Math.cos(a) * r, Math.sin(a) * r);
      }
      return true;
    }

    case 'waves': {
      const lines = Math.max(5, Math.min(24, Math.round(Math.sqrt(n) / 3)));
      const per = Math.ceil(n / lines);
      const gap = gh / lines;
      for (let i = 0; i < n; i++) {
        const l = i % lines;
        const j = Math.floor(i / lines);
        const u = (j + 0.5) / per;
        const x = -gw / 2 + u * gw;
        const y = -gh / 2 + (l + 0.5) * gap + Math.sin(u * Math.PI * 4 + l * 0.6) * gap * 0.7;
        put(i, x, y);
      }
      return true;
    }

    case 'maze': {
      // Truchet tiles: two quarter arcs in each cell, turned at random.
      const cellsN = Math.max(12, Math.round(n / 28));
      const c = Math.sqrt((gw * gh) / cellsN);
      const cols = Math.max(2, Math.round(gw / c));
      const rows = Math.max(2, Math.round(gh / c));
      const C = cols * rows;
      const cs = Math.min(gw / cols, gh / rows);
      const flip = Array.from({ length: C }, () => rand() < 0.5);
      const per = Math.ceil(n / C);
      for (let i = 0; i < n; i++) {
        const cell = i % C;
        const k = Math.floor(i / C);
        const u = (k + 0.5) / per;
        const second = u >= 0.5;
        const t = ((second ? u - 0.5 : u) * 2) * (Math.PI / 2);
        const x0 = -(cols * cs) / 2 + (cell % cols) * cs;
        const y0 = -(rows * cs) / 2 + Math.floor(cell / cols) * cs;
        // Arc centres: opposite corners of the cell.
        let ax: number, ay: number, a0: number;
        if (!flip[cell]) {
          if (!second) { ax = x0; ay = y0; a0 = 0; } else { ax = x0 + cs; ay = y0 + cs; a0 = Math.PI; }
        } else if (!second) { ax = x0 + cs; ay = y0; a0 = Math.PI / 2; } else { ax = x0; ay = y0 + cs; a0 = -Math.PI / 2; }
        put(i, ax + Math.cos(a0 + t) * cs / 2, ay + Math.sin(a0 + t) * cs / 2);
      }
      return true;
    }

    case 'cells': {
      // The edges of Voronoi cells: points where two seeds are almost equally close.
      const seeds = Math.max(8, Math.min(40, Math.round(Math.sqrt(n) / 2.5)));
      const sx: number[] = [];
      const sy: number[] = [];
      // Seeds kept apart from each other, so no cell is a sliver.
      const gap = Math.sqrt((gw * gh) / seeds) * 0.6;
      for (let s = 0, tries = 0; s < seeds && tries < 5000; tries++) {
        const x = (rand() - 0.5) * gw;
        const y = (rand() - 0.5) * gh;
        if (tries < 4000 && sx.some((v, k) => Math.hypot(v - x, sy[k] - y) < gap)) continue;
        sx.push(x);
        sy.push(y);
        s++;
      }
      const band = Math.sqrt((gw * gh) / seeds) * 0.035;
      let i = 0;
      for (let tries = 0; i < n && tries < n * 60; tries++) {
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
