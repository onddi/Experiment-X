// Ready-made shapes for the particles: icons drawn on a canvas (then traced
// like text), and curves and 3D solids worked out as points, so they can
// turn and breathe while the particles hold them.

export const ICON_SHAPES: [string, string][] = [
  ['heart', 'Heart'], ['star', 'Star'], ['spark', 'Spark'], ['moon', 'Moon'], ['sun', 'Sun'], ['bolt', 'Lightning'],
  ['flower', 'Flower'], ['leaf', 'Leaf'], ['drop', 'Drop'], ['cloud', 'Cloud'], ['note', 'Music note'], ['eye', 'Eye'],
  ['smile', 'Smile'], ['peace', 'Peace'], ['infinity', 'Infinity'], ['planet', 'Planet'], ['diamond', 'Diamond'],
];
export const isIcon = (id: string) => ICON_SHAPES.some(([k]) => k === id);

const poly = (g: CanvasRenderingContext2D, pts: number[][], cx: number, cy: number, s: number) => {
  g.beginPath();
  pts.forEach(([x, y], k) => (k ? g.lineTo(cx + x * s, cy + y * s) : g.moveTo(cx + x * s, cy + y * s)));
  g.closePath();
  g.fill();
};
const starPts = (k: number, inner: number) =>
  Array.from({ length: k * 2 }, (_, j) => {
    const a = -Math.PI / 2 + (j * Math.PI) / k;
    const r = j % 2 ? inner : 1;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
const circle = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};
// Cut a hole: draw with the eraser, then go back to painting.
const cut = (g: CanvasRenderingContext2D, f: () => void) => {
  g.globalCompositeOperation = 'destination-out';
  f();
  g.globalCompositeOperation = 'source-over';
};

/** Draw an icon in white, centred on (cx, cy), about 2·s across. */
export function drawIcon(g: CanvasRenderingContext2D, id: string, cx: number, cy: number, s: number) {
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (id) {
    case 'heart': {
      g.beginPath();
      for (let k = 0; k <= 120; k++) {
        const t = (k / 120) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        const px = cx + (x / 17) * s;
        const py = cy - (y / 17) * s - s * 0.05;
        if (k) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.fill();
      break;
    }
    case 'star':
      poly(g, starPts(5, 0.45), cx, cy + s * 0.08, s);
      break;
    case 'spark':
      poly(g, starPts(4, 0.22), cx, cy, s);
      break;
    case 'moon':
      circle(g, cx, cy, s * 0.9);
      cut(g, () => circle(g, cx + s * 0.42, cy - s * 0.18, s * 0.78));
      break;
    case 'sun':
      circle(g, cx, cy, s * 0.48);
      g.lineWidth = s * 0.12;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * s * 0.66, cy + Math.sin(a) * s * 0.66);
        g.lineTo(cx + Math.cos(a) * s * 0.95, cy + Math.sin(a) * s * 0.95);
        g.stroke();
      }
      break;
    case 'bolt':
      poly(g, [[0.32, -1], [-0.5, 0.15], [-0.04, 0.15], [-0.3, 1], [0.52, -0.22], [0.06, -0.22]], cx, cy, s);
      break;
    case 'flower':
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * s * 0.52, cy + Math.sin(a) * s * 0.52, s * 0.46, s * 0.27, a, 0, Math.PI * 2);
        g.fill();
      }
      cut(g, () => circle(g, cx, cy, s * 0.3));
      circle(g, cx, cy, s * 0.2);
      break;
    case 'leaf':
      g.beginPath();
      g.moveTo(cx, cy - s);
      g.quadraticCurveTo(cx + s * 1.05, cy - s * 0.1, cx, cy + s * 0.85);
      g.quadraticCurveTo(cx - s * 1.05, cy - s * 0.1, cx, cy - s);
      g.fill();
      g.fillRect(cx - s * 0.04, cy + s * 0.7, s * 0.08, s * 0.3);
      cut(g, () => {
        g.lineWidth = s * 0.05;
        g.beginPath();
        g.moveTo(cx, cy - s * 0.75);
        g.lineTo(cx, cy + s * 0.75);
        g.stroke();
      });
      break;
    case 'drop':
      circle(g, cx, cy + s * 0.35, s * 0.6);
      poly(g, [[0, -1], [-0.53, 0.08], [0.53, 0.08]], cx, cy, s);
      break;
    case 'cloud':
      circle(g, cx - s * 0.5, cy + s * 0.12, s * 0.38);
      circle(g, cx, cy - s * 0.12, s * 0.52);
      circle(g, cx + s * 0.5, cy + s * 0.12, s * 0.38);
      g.fillRect(cx - s * 0.5, cy + s * 0.1, s, s * 0.4);
      break;
    case 'note':
      for (const [x, y, top] of [[-0.48, 0.58, -0.62], [0.48, 0.42, -0.78]]) {
        g.beginPath();
        g.ellipse(cx + x * s, cy + y * s, s * 0.27, s * 0.19, -0.35, 0, Math.PI * 2);
        g.fill();
        g.fillRect(cx + (x + 0.17) * s, cy + top * s, s * 0.09, (y - top) * s);
      }
      poly(g, [[-0.31, -0.62], [0.74, -0.78], [0.74, -0.58], [-0.31, -0.42]], cx, cy, s);
      break;
    case 'eye':
      g.beginPath();
      g.moveTo(cx - s, cy);
      g.quadraticCurveTo(cx, cy - s * 0.95, cx + s, cy);
      g.quadraticCurveTo(cx, cy + s * 0.95, cx - s, cy);
      g.fill();
      cut(g, () => circle(g, cx, cy, s * 0.36));
      circle(g, cx, cy, s * 0.2);
      break;
    case 'smile':
      g.lineWidth = s * 0.13;
      g.beginPath();
      g.arc(cx, cy, s * 0.88, 0, Math.PI * 2);
      g.stroke();
      circle(g, cx - s * 0.32, cy - s * 0.25, s * 0.12);
      circle(g, cx + s * 0.32, cy - s * 0.25, s * 0.12);
      g.beginPath();
      g.arc(cx, cy + s * 0.02, s * 0.5, Math.PI * 0.18, Math.PI * 0.82);
      g.stroke();
      break;
    case 'peace':
      g.lineWidth = s * 0.14;
      g.beginPath();
      g.arc(cx, cy, s * 0.86, 0, Math.PI * 2);
      g.moveTo(cx, cy - s * 0.86);
      g.lineTo(cx, cy + s * 0.86);
      g.moveTo(cx, cy);
      g.lineTo(cx - s * 0.61, cy + s * 0.61);
      g.moveTo(cx, cy);
      g.lineTo(cx + s * 0.61, cy + s * 0.61);
      g.stroke();
      break;
    case 'infinity':
      g.lineWidth = s * 0.2;
      g.beginPath();
      for (let k = 0; k <= 160; k++) {
        const t = (k / 160) * Math.PI * 2;
        const d = 1 + Math.sin(t) ** 2;
        const px = cx + (s * 0.95 * Math.cos(t)) / d;
        const py = cy + (s * 0.95 * Math.sin(t) * Math.cos(t)) / d;
        if (k) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.stroke();
      break;
    case 'planet':
      circle(g, cx, cy, s * 0.5);
      // The front of the ring crosses the planet: cut a gap, then draw it.
      g.lineWidth = s * 0.2;
      cut(g, () => {
        g.beginPath();
        g.ellipse(cx, cy, s * 0.95, s * 0.3, -0.35, 0, Math.PI);
        g.stroke();
      });
      g.lineWidth = s * 0.08;
      g.beginPath();
      g.ellipse(cx, cy, s * 0.95, s * 0.3, -0.35, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'diamond':
      poly(g, [[-0.58, -0.62], [0.58, -0.62], [1, -0.16], [0, 0.95], [-1, -0.16]], cx, cy, s);
      cut(g, () => {
        g.lineWidth = s * 0.05;
        g.beginPath();
        g.moveTo(cx - s, cy - s * 0.16);
        g.lineTo(cx + s, cy - s * 0.16);
        g.moveTo(cx - s * 0.3, cy - s * 0.62);
        g.lineTo(cx, cy + s * 0.95);
        g.lineTo(cx + s * 0.3, cy - s * 0.62);
        g.stroke();
      });
      break;
    default:
      return false;
  }
  return true;
}

// --- curves --------------------------------------------------------------------

export const GEO_SHAPES: [string, string][] = [
  ['triangle', 'Triangle'], ['square', 'Square'], ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['star5', 'Star'], ['star6', 'Six-point star'],
  ['circle', 'Circle'], ['rings', 'Rings'], ['spiral', 'Spiral'], ['rose', 'Flower curve'], ['spiro', 'Spirograph'], ['lissajous', 'Figure of eight'],
  ['heartline', 'Heart outline'], ['wave', 'Wave line'],
];

function along(pts: number[][], u: number) {
  // A point a fraction u of the way round a closed polygon (by length).
  const k = pts.length;
  const len: number[] = [];
  let total = 0;
  for (let j = 0; j < k; j++) {
    const [x0, y0] = pts[j];
    const [x1, y1] = pts[(j + 1) % k];
    total += Math.hypot(x1 - x0, y1 - y0);
    len.push(total);
  }
  const d = u * total;
  let j = 0;
  while (j < k - 1 && len[j] < d) j++;
  const start = j ? len[j - 1] : 0;
  const f = (d - start) / Math.max(1e-6, len[j] - start);
  const [x0, y0] = pts[j];
  const [x1, y1] = pts[(j + 1) % k];
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
}
const ngon = (k: number) => Array.from({ length: k }, (_, j) => [Math.cos(-Math.PI / 2 + (j * 2 * Math.PI) / k), Math.sin(-Math.PI / 2 + (j * 2 * Math.PI) / k)]);
const POLYS: Record<string, number[][]> = {
  triangle: ngon(3), square: ngon(4).map(([x, y]) => [x * Math.SQRT1_2 * 1.2 - y * Math.SQRT1_2 * 1.2, x * Math.SQRT1_2 * 1.2 + y * Math.SQRT1_2 * 1.2]),
  pentagon: ngon(5), hexagon: ngon(6), star5: starPts(5, 0.42), star6: starPts(6, 0.55),
};

/** A point on a curve, radius about 1. u runs along it; v (0–1) gives the line some width. */
export function geoPoint(type: string, u: number, v: number, time: number, aspect: number): [number, number] {
  const wob = (v - 0.5) * 0.05;
  const TAU = Math.PI * 2;
  if (POLYS[type]) {
    const [x, y] = along(POLYS[type], u);
    return [x * (1 + wob), y * (1 + wob)];
  }
  switch (type) {
    case 'circle':
      return [Math.cos(u * TAU) * (1 + wob), Math.sin(u * TAU) * (1 + wob)];
    case 'rings': {
      // Three rings, each with its share of the particles by length.
      const r = u < 1 / 6 ? 0.34 : u < 0.5 ? 0.67 : 1;
      const a = u * TAU * 7;
      return [Math.cos(a) * (r + wob), Math.sin(a) * (r + wob)];
    }
    case 'spiral': {
      const r = 0.06 + 0.94 * Math.sqrt(u);
      const a = Math.sqrt(u) * TAU * 3;
      return [Math.cos(a) * (r + wob), Math.sin(a) * (r + wob)];
    }
    case 'rose': {
      const a = u * TAU;
      const r = Math.cos(4 * a) * (0.9 + 0.1 * Math.sin(time * 1.3)) + wob;
      return [Math.cos(a) * r, Math.sin(a) * r];
    }
    case 'spiro': {
      const t = u * TAU * 3;
      const x = 2 * Math.cos(t) + 5 * Math.cos((2 / 3) * t);
      const y = 2 * Math.sin(t) - 5 * Math.sin((2 / 3) * t);
      return [(x / 7) * (1 + wob), (y / 7) * (1 + wob)];
    }
    case 'lissajous': {
      const t = u * TAU;
      return [Math.sin(3 * t + time * 0.4) * (1 + wob), Math.sin(2 * t) * 0.8 * (1 + wob)];
    }
    case 'heartline': {
      const t = u * TAU;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return [(x / 17) * (1 + wob), (-y / 17 - 0.05) * (1 + wob)];
    }
    case 'wave': {
      const span = Math.min(1.6, aspect * 0.95);
      const x = (u * 2 - 1) * span;
      return [x, Math.sin(u * TAU * 2 + time * 2) * 0.35 + wob * 2];
    }
  }
  return [0, 0];
}
// These turn as a whole; the others move in their own way.
export const GEO_SPINS = (type: string) => type !== 'wave' && type !== 'lissajous';

// --- solids --------------------------------------------------------------------

export const SOLID_SHAPES: [string, string][] = [['sphere', 'Sphere'], ['torus', 'Ring donut'], ['cube', 'Cube'], ['helix', 'Double helix']];

/** A point on a 3D solid about 1 across, from two random numbers. */
export function solidPoint(type: string, u: number, v: number): [number, number, number] {
  const TAU = Math.PI * 2;
  switch (type) {
    case 'torus': {
      const a = u * TAU;
      const b = v * TAU;
      const r = 0.68 + 0.3 * Math.cos(b);
      return [Math.cos(a) * r, 0.3 * Math.sin(b), Math.sin(a) * r];
    }
    case 'cube': {
      const f = Math.min(5, Math.floor(u * 6));
      const a = (u * 6 - f) * 2 - 1;
      const b = v * 2 - 1;
      const s = 0.62;
      const p: [number, number, number][] = [[s, a * s, b * s], [-s, a * s, b * s], [a * s, s, b * s], [a * s, -s, b * s], [a * s, b * s, s], [a * s, b * s, -s]];
      return p[f];
    }
    case 'helix': {
      const strand = v < 0.42 ? 0 : v < 0.84 ? 1 : 2;
      const y = (u * 2 - 1) * 0.85;
      const a = u * TAU * 2;
      if (strand === 2) {
        // Rungs between the strands.
        const k = Math.round(u * 24) / 24;
        const ak = k * TAU * 2;
        const m = ((v - 0.84) / 0.16) * 2 - 1;
        return [Math.cos(ak) * 0.42 * m, (k * 2 - 1) * 0.85, Math.sin(ak) * 0.42 * m];
      }
      const off = strand ? Math.PI : 0;
      return [Math.cos(a + off) * 0.42, y, Math.sin(a + off) * 0.42];
    }
    default: {
      const z = u * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      return [Math.cos(v * TAU) * r, z, Math.sin(v * TAU) * r];
    }
  }
}

export const LIVE_SHAPES: [string, string][] = [['bars', 'The music: bars'], ['ring', 'The music: a ring'], ['clock', 'A clock'], ['tempo', 'The tempo (BPM)']];
