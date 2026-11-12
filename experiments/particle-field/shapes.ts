import { rocketPoints, type ModelAnim } from './media.ts';
// Ready-made shapes for the particles: icons drawn on a canvas (then traced
// like text), and curves and 3D solids worked out as points, so they can
// turn and breathe while the particles hold them.

export const ICON_SHAPES: [string, string][] = [
  ['heart', 'Heart'], ['star', 'Star'], ['spark', 'Spark'], ['moon', 'Moon'], ['sun', 'Sun'], ['bolt', 'Lightning'],
  ['flower', 'Flower'], ['leaf', 'Leaf'], ['drop', 'Drop'], ['cloud', 'Cloud'], ['note', 'Music note'], ['eye', 'Eye'],
  ['smile', 'Smile'], ['peace', 'Peace'], ['infinity', 'Infinity'], ['planet', 'Planet'], ['diamond', 'Diamond'],
  ['crown', 'Crown'], ['snowflake', 'Snowflake'], ['tree', 'Pine tree'], ['fish', 'Fish'], ['rocket', 'Rocket'], ['butterfly', 'Butterfly'],
  ['flame', 'Flame'], ['cat', 'Cat'], ['yinyang', 'Yin yang'], ['anchor', 'Anchor'], ['key', 'Key'], ['house', 'House'],
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
    case 'crown':
      poly(g, [[-0.95, 0.55], [-0.95, -0.55], [-0.5, -0.05], [0, -0.75], [0.5, -0.05], [0.95, -0.55], [0.95, 0.55]], cx, cy, s);
      for (const x of [-0.95, 0, 0.95]) circle(g, cx + x * s, cy - (x ? 0.62 : 0.82) * s, s * 0.12);
      g.fillRect(cx - s * 0.95, cy + s * 0.65, s * 1.9, s * 0.18);
      break;
    case 'snowflake':
      g.lineWidth = s * 0.11;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
        const [ux, uy] = [Math.cos(a), Math.sin(a)];
        g.moveTo(cx, cy);
        g.lineTo(cx + ux * s * 0.95, cy + uy * s * 0.95);
        for (const [d, l] of [[0.45, 0.28], [0.7, 0.2]]) {
          const [bx, by] = [cx + ux * s * d, cy + uy * s * d];
          for (const sg of [-1, 1]) {
            const b = a + sg * 0.75;
            g.moveTo(bx, by);
            g.lineTo(bx + Math.cos(b) * s * l, by + Math.sin(b) * s * l);
          }
        }
      }
      g.stroke();
      break;
    case 'tree':
      poly(g, [[0, -1], [0.42, -0.45], [0.22, -0.45], [0.62, 0.05], [0.36, 0.05], [0.8, 0.6], [-0.8, 0.6], [-0.36, 0.05], [-0.62, 0.05], [-0.22, -0.45], [-0.42, -0.45]], cx, cy, s);
      g.fillRect(cx - s * 0.12, cy + s * 0.6, s * 0.24, s * 0.35);
      break;
    case 'fish':
      g.beginPath();
      g.ellipse(cx - s * 0.12, cy, s * 0.72, s * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      poly(g, [[0.45, 0], [0.98, -0.45], [0.98, 0.45]], cx, cy, s);
      cut(g, () => circle(g, cx - s * 0.5, cy - s * 0.08, s * 0.08));
      break;
    case 'rocket':
      g.beginPath();
      g.moveTo(cx, cy - s);
      g.quadraticCurveTo(cx + s * 0.42, cy - s * 0.45, cx + s * 0.3, cy + s * 0.5);
      g.lineTo(cx - s * 0.3, cy + s * 0.5);
      g.quadraticCurveTo(cx - s * 0.42, cy - s * 0.45, cx, cy - s);
      g.fill();
      poly(g, [[0.28, 0.1], [0.62, 0.6], [0.62, 0.8], [0.26, 0.55]], cx, cy, s);
      poly(g, [[-0.28, 0.1], [-0.62, 0.6], [-0.62, 0.8], [-0.26, 0.55]], cx, cy, s);
      poly(g, [[-0.16, 0.6], [0.16, 0.6], [0, 1]], cx, cy, s);
      cut(g, () => circle(g, cx, cy - s * 0.3, s * 0.13));
      break;
    case 'butterfly':
      for (const sg of [-1, 1]) {
        g.beginPath();
        g.ellipse(cx + sg * s * 0.45, cy - s * 0.3, s * 0.5, s * 0.4, sg * -0.5, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(cx + sg * s * 0.35, cy + s * 0.4, s * 0.32, s * 0.28, sg * 0.5, 0, Math.PI * 2);
        g.fill();
      }
      cut(g, () => g.fillRect(cx - s * 0.08, cy - s * 0.9, s * 0.16, s * 1.7));
      g.fillRect(cx - s * 0.04, cy - s * 0.65, s * 0.08, s * 1.3);
      break;
    case 'flame':
      g.beginPath();
      g.moveTo(cx, cy - s);
      g.bezierCurveTo(cx + s * 0.2, cy - s * 0.45, cx + s * 0.8, cy - s * 0.15, cx + s * 0.6, cy + s * 0.45);
      g.bezierCurveTo(cx + s * 0.45, cy + s * 0.95, cx - s * 0.45, cy + s * 0.95, cx - s * 0.6, cy + s * 0.45);
      g.bezierCurveTo(cx - s * 0.75, cy, cx - s * 0.3, cy - s * 0.2, cx - s * 0.25, cy - s * 0.55);
      g.bezierCurveTo(cx - s * 0.05, cy - s * 0.4, cx, cy - s * 0.65, cx, cy - s);
      g.fill();
      cut(g, () => {
        g.beginPath();
        g.moveTo(cx, cy - s * 0.05);
        g.bezierCurveTo(cx + s * 0.35, cy + s * 0.25, cx + s * 0.3, cy + s * 0.7, cx, cy + s * 0.72);
        g.bezierCurveTo(cx - s * 0.3, cy + s * 0.7, cx - s * 0.3, cy + s * 0.3, cx, cy - s * 0.05);
        g.fill();
      });
      break;
    case 'cat':
      circle(g, cx, cy + s * 0.15, s * 0.72);
      poly(g, [[-0.7, -0.05], [-0.62, -0.95], [-0.15, -0.5]], cx, cy, s);
      poly(g, [[0.7, -0.05], [0.62, -0.95], [0.15, -0.5]], cx, cy, s);
      cut(g, () => {
        for (const sg of [-1, 1]) {
          g.beginPath();
          g.ellipse(cx + sg * s * 0.28, cy + s * 0.05, s * 0.1, s * 0.16, 0, 0, Math.PI * 2);
          g.fill();
        }
        poly(g, [[-0.09, 0.32], [0.09, 0.32], [0, 0.42]], cx, cy, s);
      });
      break;
    case 'yinyang':
      circle(g, cx, cy, s * 0.95);
      cut(g, () => {
        g.beginPath();
        g.arc(cx, cy, s * 0.87, -Math.PI / 2, Math.PI / 2);
        g.arc(cx, cy + s * 0.435, s * 0.435, Math.PI / 2, -Math.PI / 2, true);
        g.arc(cx, cy - s * 0.435, s * 0.435, Math.PI / 2, -Math.PI / 2, false);
        g.fill();
        circle(g, cx, cy + s * 0.435, s * 0.13);
      });
      circle(g, cx, cy - s * 0.435, s * 0.13);
      break;
    case 'anchor':
      g.lineWidth = s * 0.14;
      g.beginPath();
      g.arc(cx, cy - s * 0.72, s * 0.17, 0, Math.PI * 2);
      g.moveTo(cx, cy - s * 0.55);
      g.lineTo(cx, cy + s * 0.85);
      g.moveTo(cx - s * 0.4, cy - s * 0.28);
      g.lineTo(cx + s * 0.4, cy - s * 0.28);
      g.moveTo(cx - s * 0.78, cy + s * 0.25);
      g.quadraticCurveTo(cx - s * 0.65, cy + s * 0.85, cx, cy + s * 0.88);
      g.quadraticCurveTo(cx + s * 0.65, cy + s * 0.85, cx + s * 0.78, cy + s * 0.25);
      g.stroke();
      break;
    case 'key':
      circle(g, cx - s * 0.55, cy, s * 0.42);
      cut(g, () => circle(g, cx - s * 0.55, cy, s * 0.17));
      g.fillRect(cx - s * 0.2, cy - s * 0.08, s * 1.15, s * 0.16);
      g.fillRect(cx + s * 0.55, cy, s * 0.13, s * 0.32);
      g.fillRect(cx + s * 0.8, cy, s * 0.13, s * 0.4);
      break;
    case 'house':
      poly(g, [[0, -0.95], [0.95, -0.05], [0.72, -0.05], [0.72, 0.85], [-0.72, 0.85], [-0.72, -0.05], [-0.95, -0.05]], cx, cy, s);
      cut(g, () => g.fillRect(cx - s * 0.18, cy + s * 0.3, s * 0.36, s * 0.56));
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
  ['octagon', 'Octagon'], ['rhombus', 'Rhombus'], ['star8', 'Eight-point star'], ['cross', 'Cross'], ['cardioid', 'Cardioid'], ['astroid', 'Astroid'],
  ['bfly', 'Butterfly curve'], ['lemniscate', 'Infinity loop'], ['flowerlife', 'Flower of life'], ['honeycomb', 'Honeycomb'], ['sierpinski', 'Sierpiński triangle'], ['trefoil', 'Trefoil'],
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
  octagon: ngon(8).map(([x, y]) => [x * Math.cos(Math.PI / 8) - y * Math.sin(Math.PI / 8), x * Math.sin(Math.PI / 8) + y * Math.cos(Math.PI / 8)]),
  rhombus: [[0, -1], [0.62, 0], [0, 1], [-0.62, 0]], star8: starPts(8, 0.5),
  cross: [[-0.3, -1], [0.3, -1], [0.3, -0.3], [1, -0.3], [1, 0.3], [0.3, 0.3], [0.3, 1], [-0.3, 1], [-0.3, 0.3], [-1, 0.3], [-1, -0.3], [-0.3, -0.3]],
};
// Several shapes at once: u picks one (by its share), then runs along it.
function pick(u: number, n: number): [number, number] {
  const k = Math.min(n - 1, Math.floor(u * n));
  return [k, u * n - k];
}
const HEX_CENTRES = [[0, 0], ...ngon(6).map(([x, y]) => [x * 0.62, y * 0.62])];
const hexAt = ngon(6).map(([x, y]) => [y, x]); // flat-topped
function sierpinski(u: number, v: number): [number, number] {
  // A point on one of the 27 small triangles' edges (three levels deep).
  let k = Math.floor(u * 27);
  const f = u * 27 - k;
  let [ox, oy, sc] = [0, 0, 1];
  const corners = ngon(3);
  for (let d = 0; d < 3; d++) {
    const c = corners[k % 3];
    k = Math.floor(k / 3);
    sc /= 2;
    ox += c[0] * sc;
    oy += c[1] * sc;
  }
  const [x, y] = along(corners, (f + v * 0.001) % 1);
  return [ox + x * sc, oy + y * sc + 0.15];
}

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
    case 'cardioid': {
      const t = u * TAU;
      const r = 0.5 * (1 - Math.sin(t));
      return [Math.cos(t) * r * 1.05 * (1 + wob), (-Math.sin(t) * r - 0.45) * (1 + wob)];
    }
    case 'astroid': {
      const t = u * TAU;
      return [Math.cos(t) ** 3 * (1 + wob), Math.sin(t) ** 3 * (1 + wob)];
    }
    case 'bfly': {
      const t = u * TAU * 2;
      const r = Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) - Math.sin(t / 12) ** 5;
      return [(Math.sin(t) * r) / 3.2 * (1 + wob), (-Math.cos(t) * r) / 3.2 * (1 + wob) + 0.15];
    }
    case 'lemniscate': {
      const t = u * TAU;
      const d = 1 + Math.sin(t) ** 2;
      return [(Math.cos(t) / d) * (1 + wob), ((Math.sin(t) * Math.cos(t)) / d) * 1.3 * (1 + wob)];
    }
    case 'flowerlife': {
      // Seven overlapping circles, in a ring.
      const [k, f] = pick(u, 8);
      if (k === 7) return [Math.cos(f * TAU) * (1 + wob), Math.sin(f * TAU) * (1 + wob)];
      const [ox, oy] = k ? ngon(6)[k - 1].map((c) => c * 0.5) : [0, 0];
      return [ox + Math.cos(f * TAU) * (0.5 + wob), oy + Math.sin(f * TAU) * (0.5 + wob)];
    }
    case 'honeycomb': {
      const [k, f] = pick(u, 7);
      const [ox, oy] = HEX_CENTRES[k];
      const [x, y] = along(hexAt, f);
      return [ox + x * (0.36 + wob), oy + y * (0.36 + wob)];
    }
    case 'sierpinski':
      return sierpinski(u, v);
    case 'trefoil': {
      const t = u * TAU;
      return [(Math.sin(t) + 2 * Math.sin(2 * t)) / 3 * (1 + wob), (Math.cos(t) - 2 * Math.cos(2 * t)) / 3 * (1 + wob)];
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

export const SOLID_SHAPES: [string, string][] = [
  ['sphere', 'Sphere'], ['torus', 'Ring donut'], ['cube', 'Cube'], ['helix', 'Double helix'],
  ['saturn', 'Ringed planet'], ['atom', 'Atom'], ['knot', 'Trefoil knot'], ['mobius', 'Möbius strip'], ['icosa', 'Icosahedron (wire)'],
  ['cubeframe', 'Cube (wire)'], ['pyramid', 'Pyramid'], ['cone', 'Cone'], ['shell', 'Seashell'], ['ripple', 'Ripple'], ['galaxy', 'Spiral galaxy'],
  ['heart3d', 'Heart'], ['dna', 'Spring'],
  ['octa', 'Octahedron (wire)'], ['dodeca', 'Dodecahedron (wire)'], ['star3d', 'Spiky star'],
  ['lissajous', 'Lissajous knot'], ['torusknot', 'Torus knot'], ['klein', 'Klein bottle'],
  ['flower', 'Flower'], ['tornado', 'Tornado'], ['jelly', 'Jellyfish'],
  ['hourglass', 'Hourglass'], ['crystals', 'Crystal cluster'], ['gyro', 'Gyroscope'],
  ['model', 'Your 3D model (OBJ, STL, glTF)'],
];
// The 3D model: surface points (x, y, z), a rocket until you load one.
let modelPts: Float32Array | null = null;
let modelName = '';
let modelRest: Float32Array | null = null;
let modelAnim: ModelAnim | null = null;
export function setModel(pts: Float32Array, name: string, anim: ModelAnim | null = null) {
  modelPts = pts.length >= 3 ? pts : null;
  modelName = modelPts ? name : '';
  modelRest = modelPts ? modelPts.slice() : null;
  modelAnim = modelPts ? anim : null;
}
/** The loaded model's animation clips (none for a still model). */
export const modelClips = () => modelAnim?.clips ?? [];
/** Pose the model's points: a clip (0-based) at t seconds, or its still pose for clip -1. */
export function poseModel(clip: number, t: number) {
  if (!modelPts || !modelRest) return;
  if (clip < 0 || !modelAnim?.clips[clip]) modelPts.set(modelRest);
  else modelAnim.pose(clip, t, modelPts);
}
export const modelLabel = () => modelName || 'the example rocket';
type V3 = [number, number, number];
const lerp3 = (a: V3, b: V3, f: number): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
// Points along a set of edges (u picks the edge and how far along).
function onEdges(pts: V3[], edges: [number, number][], u: number): V3 {
  const [k, f] = pick(u, edges.length);
  return lerp3(pts[edges[k][0]], pts[edges[k][1]], f);
}
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO: V3[] = (() => {
  const raw: V3[] = [];
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) raw.push([0, a, b], [a, b, 0], [b, 0, a]);
  const n = Math.hypot(1, PHI);
  return raw.map(([x, y, z]) => [x / n, y / n, z / n]);
})();
const ICO_EDGES: [number, number][] = (() => {
  const e: [number, number][] = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (Math.hypot(ICO[i][0] - ICO[j][0], ICO[i][1] - ICO[j][1], ICO[i][2] - ICO[j][2]) < 1.1) e.push([i, j]);
  return e;
})();
const CUBE: V3[] = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CUBE.push([x * 0.6, y * 0.6, z * 0.6]);
const CUBE_EDGES: [number, number][] = [];
for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if ([0, 1, 2].filter((d) => CUBE[i][d] !== CUBE[j][d]).length === 1) CUBE_EDGES.push([i, j]);

const OCTA: V3[] = [[0.85, 0, 0], [-0.85, 0, 0], [0, 0.85, 0], [0, -0.85, 0], [0, 0, 0.85], [0, 0, -0.85]];
const OCTA_EDGES: [number, number][] = [];
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (Math.floor(i / 2) !== Math.floor(j / 2)) OCTA_EDGES.push([i, j]);
const DODECA: V3[] = (() => {
  const raw: V3[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    for (const c of [-1, 1]) raw.push([a, b, c]);
    raw.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI]);
  }
  const n = Math.sqrt(3) / 0.85;
  return raw.map(([x, y, z]) => [x / n, y / n, z / n]);
})();
const DODECA_EDGES: [number, number][] = (() => {
  const e: [number, number][] = [];
  const L = (2 / PHI) * (0.85 / Math.sqrt(3));
  for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) if (Math.abs(Math.hypot(DODECA[i][0] - DODECA[j][0], DODECA[i][1] - DODECA[j][1], DODECA[i][2] - DODECA[j][2]) - L) < 0.01) e.push([i, j]);
  return e;
})();
// The icosahedron's 20 faces, each grown into a spike for the star.
const ICO_FACES: [number, number, number][] = (() => {
  const f: [number, number, number][] = [];
  const near = (i: number, j: number) => ICO_EDGES.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) if (near(i, j) && near(j, k) && near(i, k)) f.push([i, j, k]);
  return f;
})();
// Crystal cluster: direction, length and thickness of each crystal.
const CRYSTALS: [V3, number, number][] = [
  [[0, -1, 0], 1.45, 0.2], [[0.55, -0.8, 0.2], 1.15, 0.17], [[-0.6, -0.75, -0.1], 1.05, 0.16],
  [[0.1, -0.7, 0.7], 0.9, 0.14], [[-0.25, -0.6, -0.75], 0.85, 0.13], [[0.8, -0.45, -0.4], 0.7, 0.12],
];

/** A point on a 3D solid about 1 across, from two random numbers. */
export function solidPoint(type: string, u: number, v: number): [number, number, number] {
  const TAU = Math.PI * 2;
  switch (type) {
    case 'model': {
      modelPts ??= rocketPoints();
      const m = modelPts.length / 3;
      const k = Math.min(m - 1, Math.floor(u * m)) * 3;
      return [modelPts[k], modelPts[k + 1], modelPts[k + 2]];
    }
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
    case 'saturn': {
      if (v < 0.55) {
        const z = u * 2 - 1;
        const r = Math.sqrt(1 - z * z) * 0.55;
        const b = (v / 0.55) * TAU;
        return [Math.cos(b) * r, z * 0.55, Math.sin(b) * r];
      }
      const a = u * TAU;
      const r = 0.72 + ((v - 0.55) / 0.45) * 0.3;
      const tilt = 0.4;
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      return [x, z * Math.sin(tilt), z * Math.cos(tilt)];
    }
    case 'atom': {
      if (v < 0.12) {
        const z = u * 2 - 1;
        const r = Math.sqrt(1 - z * z) * 0.16;
        const b = (v / 0.12) * TAU;
        return [Math.cos(b) * r, z * 0.16, Math.sin(b) * r];
      }
      const ring = Math.min(2, Math.floor(((v - 0.12) / 0.88) * 3));
      const a = u * TAU;
      const p: V3 = [Math.cos(a) * 0.95, Math.sin(a) * 0.32, 0];
      const r = (ring * Math.PI) / 3;
      return [p[0] * Math.cos(r) - p[1] * Math.sin(r), p[0] * Math.sin(r) + p[1] * Math.cos(r), Math.sin(a) * 0.3 * (ring - 1)];
    }
    case 'knot': {
      const t = u * TAU;
      const c: V3 = [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)];
      const b = v * TAU;
      const w = 0.28;
      return [(c[0] + Math.cos(b) * w) / 3.2, (c[1] + Math.sin(b) * w) / 3.2, (c[2] + Math.cos(b + 1) * w) / 3.2];
    }
    case 'mobius': {
      const a = u * TAU;
      const w = (v - 0.5) * 0.6;
      const r = 0.72 + w * Math.cos(a / 2);
      return [Math.cos(a) * r, w * Math.sin(a / 2), Math.sin(a) * r];
    }
    case 'icosa':
      return onEdges(ICO, ICO_EDGES, u);
    case 'cubeframe':
      return onEdges(CUBE, CUBE_EDGES, u);
    case 'pyramid': {
      // Four sloping faces and the base.
      const f = Math.min(4, Math.floor(u * 5));
      const a = u * 5 - f;
      const top: V3 = [0, -0.85, 0];
      const base: V3[] = [[-0.7, 0.55, -0.7], [0.7, 0.55, -0.7], [0.7, 0.55, 0.7], [-0.7, 0.55, 0.7]];
      if (f === 4) return [(a * 2 - 1) * 0.7, 0.55, (v * 2 - 1) * 0.7];
      const p = lerp3(base[f], base[(f + 1) % 4], a);
      return lerp3(top, p, Math.sqrt(v));
    }
    case 'cone': {
      const h = Math.sqrt(u);
      const b = v * TAU;
      return [Math.cos(b) * h * 0.6, h * 1.6 - 0.8, Math.sin(b) * h * 0.6];
    }
    case 'shell': {
      // A cone shell: a tube that widens as it winds down.
      const g = Math.sqrt(u); // even spread: the wide end has more surface
      const t = g * TAU * 4;
      const b = v * TAU;
      const R = g * 0.66;
      const r = 0.02 + g * 0.17;
      const cy = -0.9 + g * 1.6;
      return [Math.cos(t) * (R + Math.cos(b) * r), cy + Math.sin(b) * r, Math.sin(t) * (R + Math.cos(b) * r)];
    }
    case 'ripple': {
      const r = Math.sqrt(u);
      const b = v * TAU;
      return [Math.cos(b) * r, Math.sin(r * 14) * 0.12 * (1 - r * 0.6), Math.sin(b) * r];
    }
    case 'galaxy': {
      const arm = Math.floor(v * 2);
      const r = 0.08 + 0.92 * u;
      const a = arm * Math.PI + r * 4.2 + (((v * 2) % 1) - 0.5) * 0.5;
      return [Math.cos(a) * r, (((v * 7) % 1) - 0.5) * 0.08 * (1 - r), Math.sin(a) * r];
    }
    case 'octa':
      return onEdges(OCTA, OCTA_EDGES, u);
    case 'dodeca':
      return onEdges(DODECA, DODECA_EDGES, u);
    case 'star3d': {
      // A spike on each face of an icosahedron: points on the spike's three sides.
      const [k, f] = pick(u, ICO_FACES.length * 3);
      const face = ICO_FACES[Math.floor(k / 3)];
      const s = k % 3;
      const a = ICO[face[s]].map((x) => x * 0.48) as V3;
      const b = ICO[face[(s + 1) % 3]].map((x) => x * 0.48) as V3;
      const c = ICO[face[0]].map((x, i) => (x + ICO[face[1]][i] + ICO[face[2]][i]) / 3) as V3;
      const n = Math.hypot(...c);
      const tip: V3 = [(c[0] / n) * 0.95, (c[1] / n) * 0.95, (c[2] / n) * 0.95];
      const t = Math.sqrt(v);
      return lerp3(tip, lerp3(a, b, f), t);
    }
    case 'lissajous': {
      const t = u * TAU;
      const c: V3 = [Math.cos(3 * t + 0.7), Math.cos(2 * t + 0.2), Math.cos(7 * t)];
      const b = v * TAU;
      const w = 0.05;
      return [c[0] * 0.62 + Math.cos(b) * w, c[1] * 0.62 + Math.sin(b) * w, c[2] * 0.62 + Math.cos(b + 2) * w];
    }
    case 'torusknot': {
      const t = u * TAU;
      const r = Math.cos(5 * t) + 2.2;
      const c: V3 = [r * Math.cos(2 * t), -Math.sin(5 * t), r * Math.sin(2 * t)];
      const b = v * TAU;
      const w = 0.22;
      return [(c[0] + Math.cos(b) * w) / 3.4, (c[1] + Math.sin(b) * w) / 3.4, (c[2] + Math.cos(b + 1) * w) / 3.4];
    }
    case 'klein': {
      // The figure-8 Klein bottle.
      const a = u * TAU;
      const b = v * TAU;
      const r = 2.2 + Math.cos(a / 2) * Math.sin(b) - Math.sin(a / 2) * Math.sin(2 * b);
      return [(r * Math.cos(a)) / 3.4, (Math.sin(a / 2) * Math.sin(b) + Math.cos(a / 2) * Math.sin(2 * b)) / 3.4, (r * Math.sin(a)) / 3.4];
    }
    case 'flower': {
      if (v < 0.1) {
        // The middle: a small dome.
        const r = Math.sqrt(u) * 0.16;
        const b = (v / 0.1) * TAU;
        return [Math.cos(b) * r, -0.05 - (0.16 - r) * 0.6, Math.sin(b) * r];
      }
      const t = u * TAU;
      const R = 0.88 * Math.abs(Math.cos(3 * t)) ** 0.7;
      const s = Math.sqrt((v - 0.1) / 0.9) * R;
      return [Math.cos(t) * s, 0.05 - s * s * 0.55, Math.sin(t) * s];
    }
    case 'tornado': {
      const h = u;
      const r = 0.06 + 0.62 * h * h;
      const a = v * TAU + h * 9;
      return [Math.cos(a) * r + Math.sin(h * 6) * 0.08, 0.9 - h * 1.8, Math.sin(a) * r];
    }
    case 'jelly': {
      if (v < 0.55) {
        // The bell: a dome with a scalloped rim.
        const b = (v / 0.55) * TAU;
        const p = Math.sqrt(u) * 1.35;
        const r = Math.sin(p) * 0.62 * (1 + 0.06 * Math.cos(b * 8) * (p / 1.35));
        return [Math.cos(b) * r, -0.15 - Math.cos(p) * 0.5, Math.sin(b) * r];
      }
      // Eight wavy tentacles.
      const k = Math.floor(((v - 0.55) / 0.45) * 8);
      const a = (k / 8) * TAU;
      const y = u;
      const r = 0.45 - y * 0.12;
      const sway = Math.sin(y * 9 + k) * 0.08;
      return [Math.cos(a) * r + sway, -0.05 + y * 0.95, Math.sin(a) * r + Math.cos(y * 7 + k) * 0.06];
    }
    case 'hourglass': {
      if (v < 0.16) {
        // The two caps.
        const r = Math.sqrt(u) * 0.62;
        const b = (v / 0.16) * TAU * 2;
        return [Math.cos(b) * r, v < 0.08 ? -0.88 : 0.88, Math.sin(b) * r];
      }
      const y = u * 2 - 1;
      const r = 0.07 + 0.5 * y * y;
      const b = ((v - 0.16) / 0.84) * TAU;
      return [Math.cos(b) * r, y * 0.85, Math.sin(b) * r];
    }
    case 'crystals': {
      const [k, f] = pick(v, CRYSTALS.length);
      const [d0, len, th] = CRYSTALS[k];
      const n = Math.hypot(...d0);
      const d: V3 = [d0[0] / n, d0[1] / n, d0[2] / n];
      // Two directions across the crystal.
      const up: V3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const e1: V3 = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
      const m = Math.hypot(...e1);
      e1[0] /= m; e1[1] /= m; e1[2] /= m;
      const e2: V3 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
      // Six flat sides, pointed for the last quarter.
      const side = Math.floor(f * 6);
      const g = f * 6 - side;
      const a0 = (side / 6) * TAU;
      const a1 = ((side + 1) / 6) * TAU;
      const cx = Math.cos(a0) * (1 - g) + Math.cos(a1) * g;
      const cy = Math.sin(a0) * (1 - g) + Math.sin(a1) * g;
      const w = th * (u > 0.75 ? (1 - u) / 0.25 : 1);
      const L = u * len;
      return [0, 0.75, 0].map((o, i) => o + d[i] * L + (e1[i] * cx + e2[i] * cy) * w) as V3;
    }
    case 'gyro': {
      if (v < 0.08) return [0, (u * 2 - 1) * 0.95, 0]; // the axle
      if (v < 0.22) {
        // The spinning disc.
        const r = Math.sqrt(u) * 0.42;
        const b = ((v - 0.08) / 0.14) * TAU;
        return [Math.cos(b) * r, 0, Math.sin(b) * r];
      }
      const ring = Math.min(2, Math.floor(((v - 0.22) / 0.78) * 3));
      const a = u * TAU;
      const r = [0.9, 0.76, 0.62][ring];
      const [c, s] = [Math.cos(a) * r, Math.sin(a) * r];
      return ring === 0 ? [c, s, 0] : ring === 1 ? [0, c, s] : [c * 0.8 + s * 0.2, s * 0.3, s * 0.95 - c * 0.2];
    }
    case 'heart3d': {
      // A puffy heart: slices of the outline, smaller towards front and back.
      const t = u * TAU;
      const x = (16 * Math.sin(t) ** 3) / 17;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17;
      const w = v * 2 - 1;
      const k = Math.sqrt(1 - w * w);
      return [x * k, (y + 0.1) * k - 0.1, w * 0.38];
    }
    case 'dna': {
      // A coil spring.
      const a = u * TAU * 6;
      const b = v * TAU;
      const r = 0.55 + Math.cos(b) * 0.08;
      return [Math.cos(a) * r, (u * 2 - 1) * 0.85 + Math.sin(b) * 0.08, Math.sin(a) * r];
    }
    default: {
      const z = u * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      return [Math.cos(v * TAU) * r, z, Math.sin(v * TAU) * r];
    }
  }
}

export const LIVE_SHAPES: [string, string][] = [['bars', 'The music: bars'], ['ring', 'The music: a ring'], ['clock', 'A clock'], ['tempo', 'The tempo (BPM)']];
