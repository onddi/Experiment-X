// Field styles: the particles drawn as one substance instead of one mark each.
// The particles are splatted onto a coarse grid and blurred into a smooth
// density field, then the field is drawn: as a liquid with a lit surface,
// as contour lines, as drifting smoke, or (Cells) as the patch of screen
// nearest each particle. The grid is drawn scaled up with smoothing, so
// edges stay soft at a fraction of the cost of full resolution.

type Rgb = readonly [number, number, number] | number[];
export type FieldStyle = 'liquid' | 'cells' | 'contours' | 'smoke' | 'wash' | 'lava' | 'terrain' | 'caustics' | 'aurora' | 'marbling' | 'rain' | 'slime';
export const FIELD_STYLES = new Set<string>(['liquid', 'cells', 'contours', 'smoke', 'lava', 'terrain', 'caustics', 'aurora', 'marbling', 'rain', 'slime']);
// How many grid cells each look gets on a phone (sharp edges need more).
const CELLS: Partial<Record<FieldStyle, number>> = { liquid: 130000, contours: 130000, lava: 130000, cells: 90000, caustics: 90000, marbling: 90000, slime: 90000, terrain: 70000 };
// Glowing looks add light on a dark background.
const ADDS = new Set<FieldStyle>(['aurora', 'slime']);
// A cheap smooth noise, -1..1.
const wob = (x: number, y: number, t: number) => (Math.sin(x * 0.21 + t * 1.3 + Math.sin(y * 0.13 - t * 0.7) * 2) + Math.sin(y * 0.17 - t * 1.1 + Math.sin(x * 0.09 + t * 0.5) * 2)) * 0.5;
// A colour ramp: stops at even steps along 0..1.
function ramp(stops: number[][], v: number, out: number[]) {
  const f = clamp01(v) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const u = f - i;
  const a = stops[i];
  const b = stops[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * u;
  out[1] = a[1] + (b[1] - a[1]) * u;
  out[2] = a[2] + (b[2] - a[2]) * u;
  return out;
}
// Lava's heat: the palette from dark to bright, starting from a near-black
// crust and ending near white hot.
function lavaStops(rgb: Rgb[]): number[][] {
  const lum = (c: Rgb) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const cols = (rgb.length ? [...rgb] : [[215, 60, 8] as Rgb]).sort((a, b) => lum(a) - lum(b));
  const pick = cols.length <= 4 ? cols : [0, 1, 2, 3].map((k) => cols[Math.round((k * (cols.length - 1)) / 3)]);
  const lo = pick[0];
  const hi = pick[pick.length - 1];
  return [[lo[0] * 0.08, lo[1] * 0.08, lo[2] * 0.08], [lo[0] * 0.5, lo[1] * 0.5, lo[2] * 0.5], ...pick.map((c) => [c[0], c[1], c[2]]), [hi[0] + (255 - hi[0]) * 0.75, hi[1] + (255 - hi[1]) * 0.75, hi[2] + (255 - hi[2]) * 0.75]];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Box blur, horizontal then vertical, treating outside the grid as empty.
function boxBlur(a: Float32Array, tmp: Float32Array, gw: number, gh: number, r: number) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < gh; y++) {
    const o = y * gw;
    let sum = 0;
    for (let x = 0; x <= r && x < gw; x++) sum += a[o + x];
    for (let x = 0; x < gw; x++) {
      tmp[o + x] = sum * inv;
      const add = x + r + 1;
      const sub = x - r;
      if (add < gw) sum += a[o + add];
      if (sub >= 0) sum -= a[o + sub];
    }
  }
  for (let x = 0; x < gw; x++) {
    let sum = 0;
    for (let y = 0; y <= r && y < gh; y++) sum += tmp[y * gw + x];
    for (let y = 0; y < gh; y++) {
      a[y * gw + x] = sum * inv;
      const add = y + r + 1;
      const sub = y - r;
      if (add < gh) sum += tmp[add * gw + x];
      if (sub >= 0) sum -= tmp[sub * gw + x];
    }
  }
}

// Bilinear sample of a grid (outside reads as empty).
function sample(a: Float32Array, gw: number, gh: number, x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= gw || yy >= gh ? 0 : a[yy * gw + xx]);
  return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
}

export class FieldRender {
  c = 3;
  gw = 0;
  gh = 0;
  private dens = new Float32Array(0);
  private cr = new Float32Array(0);
  private cg = new Float32Array(0);
  private cb = new Float32Array(0);
  private tmp = new Float32Array(0);
  // Smoke keeps its field from frame to frame (density and colour).
  private sm: Float32Array[] = [];
  private smNext: Float32Array[] = [];
  // Cells: the particles that own a cell this frame.
  private sx: number[] = [];
  private sy: number[] = [];
  private sk: number[] = [];
  private stride = 1;
  private maxSeeds = 300;
  private canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private img: ImageData | null = null;
  private w = 0;
  private h = 0;
  private style: FieldStyle = 'liquid';
  private rgb: Rgb[] = [];
  private any = false;
  // Marbling: the particles' motion, splatted like their density.
  private vu = new Float32Array(0);
  private vv = new Float32Array(0);
  private vw = new Float32Array(0);
  // Rain on water: the surface now and a frame ago, and the colour the drops leave.
  private rain: Float32Array[] = [];
  private dropP = 0;
  private c3 = [0, 0, 0];
  /** Softness, 0..1 (0.5 is the default look). */
  soft = 0.5;
  private lavaFor: Rgb[] | null = null;
  private lavaRamp: number[][] = [];

  /** Start a frame: size the grid for the screen and clear what was added. */
  begin(style: FieldStyle, w: number, h: number, total: number, rgb: Rgb[]) {
    this.style = style;
    this.rgb = rgb;
    this.w = w;
    this.h = h;
    this.any = false;
    // About 40k cells on a phone, a few more on a big screen.
    // Sharp-edged looks (Liquid, Cells, Contours) get a finer grid; soft ones
    // (Smoke, the wash) don't need it.
    const want = CELLS[style] ?? 40000;
    const fine = want > 40000;
    // Softness: low is a finer grid and less blur, high the other way.
    const sf = this.soft;
    const more = sf < 0.5 ? 1 + (0.5 - sf) * 1.1 : 1 - (sf - 0.5) * 0.8;
    const cells = (w * h > 600000 ? want * 1.6 : want) * more;
    const c = Math.max((fine ? 1.5 : 2.5) * (sf < 0.5 ? 0.8 + 0.4 * sf : 1), Math.sqrt((w * h) / cells));
    const gw = Math.ceil(w / c) + 1;
    const gh = Math.ceil(h / c) + 1;
    if (gw !== this.gw || gh !== this.gh || Math.abs(c - this.c) > 0.01) {
      this.c = c;
      this.gw = gw;
      this.gh = gh;
      const N = gw * gh;
      this.dens = new Float32Array(N);
      this.cr = new Float32Array(N);
      this.cg = new Float32Array(N);
      this.cb = new Float32Array(N);
      this.tmp = new Float32Array(N);
      this.sm = [0, 1, 2, 3].map(() => new Float32Array(N));
      this.smNext = [0, 1, 2, 3].map(() => new Float32Array(N));
      this.vu = new Float32Array(N);
      this.vv = new Float32Array(N);
      this.vw = new Float32Array(N);
      this.rain = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(N));
      this.canvas.width = gw;
      this.canvas.height = gh;
      this.img = this.g.createImageData(gw, gh);
    } else {
      this.dens.fill(0);
      this.cr.fill(0);
      this.cg.fill(0);
      this.cb.fill(0);
      if (style === 'marbling') {
        this.vu.fill(0);
        this.vv.fill(0);
        this.vw.fill(0);
      }
    }
    this.dropP = Math.min(0.5, 0.7 / Math.max(1, total));
    this.sx.length = this.sy.length = this.sk.length = 0;
    // A cell about 40 px across on a phone; fewer, bigger cells for a crowd.
    this.maxSeeds = Math.round(Math.min(700, Math.max(120, (w * h) / 1500)));
    this.stride = Math.max(1, Math.ceil(total / this.maxSeeds));
  }

  /** Add one colour's particles, at strength a (fading ones count less). */
  add(px: Float32Array, py: Float32Array, list: number[], k: number, a: number, vx?: Float32Array, vy?: Float32Array) {
    if (!list.length || a <= 0) return;
    this.any = true;
    if (this.style === 'rain') {
      // A few particles a frame fall as drops: a dent in the surface, in their colour.
      const [h, , R, G, B, W] = this.rain;
      const col = this.rgb[k] ?? [255, 255, 255];
      for (const i of list) {
        if (Math.random() > this.dropP) continue;
        const x = Math.round(px[i] / this.c - 0.5);
        const y = Math.round(py[i] / this.c - 0.5);
        if (x < 2 || y < 2 || x >= this.gw - 2 || y >= this.gh - 2) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const o = (y + dy) * this.gw + x + dx;
            const f = dx || dy ? 0.5 : 1;
            h[o] -= 2.2 * f * a;
          }
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            const o = (y + dy) * this.gw + x + dx;
            if (o < 0 || o >= W.length) continue;
            const f = Math.max(0, 1 - Math.hypot(dx, dy) / 4.5);
            R[o] += col[0] * f;
            G[o] += col[1] * f;
            B[o] += col[2] * f;
            W[o] += f;
          }
      }
      return;
    }
    if (this.style === 'cells') {
      for (const i of list) {
        if (i % this.stride || this.sx.length >= this.maxSeeds) continue;
        this.sx.push(px[i]);
        this.sy.push(py[i]);
        this.sk.push(k);
      }
      return;
    }
    const { c, gw, gh, dens, cr, cg, cb } = this;
    const col = this.rgb[k] ?? [255, 255, 255];
    const [r, g, b] = col;
    for (const i of list) {
      const x = px[i] / c - 0.5;
      const y = py[i] / c - 0.5;
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix < 0 || iy < 0 || ix >= gw - 1 || iy >= gh - 1) continue;
      const fx = x - ix;
      const fy = y - iy;
      const o = iy * gw + ix;
      const w00 = (1 - fx) * (1 - fy) * a;
      const w10 = fx * (1 - fy) * a;
      const w01 = (1 - fx) * fy * a;
      const w11 = fx * fy * a;
      dens[o] += w00;
      dens[o + 1] += w10;
      dens[o + gw] += w01;
      dens[o + gw + 1] += w11;
      cr[o] += w00 * r; cr[o + 1] += w10 * r; cr[o + gw] += w01 * r; cr[o + gw + 1] += w11 * r;
      cg[o] += w00 * g; cg[o + 1] += w10 * g; cg[o + gw] += w01 * g; cg[o + gw + 1] += w11 * g;
      cb[o] += w00 * b; cb[o + 1] += w10 * b; cb[o + gw] += w01 * b; cb[o + gw + 1] += w11 * b;
      if (vx && vy && this.style === 'marbling') {
        const { vu, vv, vw } = this;
        const u = vx[i];
        const v = vy[i];
        vu[o] += w00 * u; vu[o + 1] += w10 * u; vu[o + gw] += w01 * u; vu[o + gw + 1] += w11 * u;
        vv[o] += w00 * v; vv[o + 1] += w10 * v; vv[o + gw] += w01 * v; vv[o + gw + 1] += w11 * v;
        vw[o] += w00; vw[o + 1] += w10; vw[o + gw] += w01; vw[o + gw + 1] += w11;
      }
    }
  }

  /**
   * Slime mould: each particle smells the trail just ahead, a little left and
   * right, and turns toward the strongest, so they gather into veins. Keeps
   * them moving, too (a mould never stops).
   */
  steer(px: Float32Array, py: Float32Array, vx: Float32Array, vy: Float32Array, n: number, dt: number) {
    const T = this.sm[0];
    if (!T || !T.length) return;
    const { c, gw, gh } = this;
    const at = (x: number, y: number) => sample(T, gw, gh, x / c - 0.5, y / c - 0.5);
    const SA = 0.6;
    const SD = 11;
    const turn = Math.min(1, dt * 60) * 0.35;
    for (let i = 0; i < n; i++) {
      let u = vx[i];
      let v = vy[i];
      let sp = Math.hypot(u, v);
      let a = sp > 1e-4 ? Math.atan2(v, u) : Math.random() * Math.PI * 2;
      const x = px[i];
      const y = py[i];
      const f = at(x + Math.cos(a) * SD, y + Math.sin(a) * SD);
      const l = at(x + Math.cos(a - SA) * SD, y + Math.sin(a - SA) * SD);
      const r = at(x + Math.cos(a + SA) * SD, y + Math.sin(a + SA) * SD);
      if (f >= l && f >= r) a += (Math.random() - 0.5) * 0.1;
      else if (l > r) a -= turn;
      else if (r > l) a += turn;
      else a += (Math.random() - 0.5) * turn * 2;
      sp = Math.max(sp, 0.9);
      vx[i] = Math.cos(a) * sp;
      vy[i] = Math.sin(a) * sp;
    }
  }

  /** Smoke left over from earlier frames still drifts after the particles go. */
  forget() {
    for (const a of this.sm) a.fill(0);
    for (const a of this.rain) a.fill(0);
  }

  /**
   * Draw the frame onto ctx (in CSS pixels). s: the particle size; t: seconds;
   * dt: this frame's seconds; light: a light background.
   */
  draw(ctx: CanvasRenderingContext2D, s: number, t: number, dt: number, light: boolean, alpha = 1) {
    const st = this.style;
    if (st === 'contours') {
      if (!this.any) return;
      this.contours(s, light);
    } else if (st === 'cells') {
      if (!this.sx.length) return;
      this.cells(s, light);
    } else if (st === 'smoke') this.smoke(s, t, dt, light);
    else if (st === 'lava') {
      if (!this.any) return;
      this.lava(s, t);
    } else if (st === 'terrain') this.terrain(s, t);
    else if (st === 'caustics') this.caustics(s, t);
    else if (st === 'aurora') this.aurora(s, t, dt, light);
    else if (st === 'marbling') this.marbling(s, dt);
    else if (st === 'rain') this.rainSurface(t, dt, light);
    else if (st === 'slime') this.slime(dt, light);
    else if (st === 'wash') {
      if (!this.any) return;
      this.wash(s);
    } else {
      if (!this.any) return;
      this.liquid(s, light);
    }
    this.g.putImageData(this.img!, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = ADDS.has(st) && !light ? 'lighter' : 'source-over';
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.canvas, 0, 0, this.gw, this.gh, 0, 0, this.gw * this.c, this.gh * this.c);
    ctx.restore();
  }

  // Blur the splatted field into blobs about rad CSS px across. Returns the
  // scale that puts a lone particle's peak near 1.
  private blur(rad: number, colour: boolean, passes = 2) {
    const r = Math.max(1, Math.round((rad * (0.6 + 0.8 * this.soft)) / this.c));
    for (let p = 0; p < passes; p++) {
      boxBlur(this.dens, this.tmp, this.gw, this.gh, r);
      if (colour) {
        boxBlur(this.cr, this.tmp, this.gw, this.gh, r);
        boxBlur(this.cg, this.tmp, this.gw, this.gh, r);
        boxBlur(this.cb, this.tmp, this.gw, this.gh, r);
      }
    }
    const m = 2 * r + 1;
    return passes === 1 ? m * m : m * m * 0.75;
  }

  // Liquid: where the field passes a level it's a surface, lit from the top
  // left with a soft shine, so neighbours melt together like mercury.
  private liquid(s: number, light: boolean) {
    const norm = this.blur(s * 3.2, true);
    const { gw, gh, dens, cr, cg, cb } = this;
    const d = this.img!.data;
    const th = 0.5;
    const cap = 1.6;
    // Light from the top left, a little in front; the shine halfway to the eye.
    const lx = -0.45, ly = -0.6, lz = 0.66;
    let hx = lx, hy = ly, hz = lz + 1;
    const hl = Math.hypot(hx, hy, hz);
    hx /= hl; hy /= hl; hz /= hl;
    const H = (i: number) => Math.min(cap, dens[i] * norm);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = i * 4;
        const D = dens[i] * norm;
        if (D < th * 0.5 || x === 0 || y === 0 || x === gw - 1 || y === gh - 1) {
          d[o + 3] = 0;
          continue;
        }
        const gx = (H(i + 1) - H(i - 1)) * 0.5;
        const gy = (H(i + gw) - H(i - gw)) * 0.5;
        const gm = Math.hypot(gx, gy);
        const a = clamp01((D - th) / Math.max(gm, 0.04) + 0.5);
        if (a <= 0) {
          d[o + 3] = 0;
          continue;
        }
        // Surface normal: steep at the rim, flat on top.
        let nx = -gx * 3.2, ny = -gy * 3.2, nz = 1;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        const diff = 0.42 + 0.68 * Math.max(0, nx * lx + ny * ly + nz * lz);
        const sp = Math.max(0, nx * hx + ny * hy + nz * hz);
        const spec = sp ** 40 * (light ? 0.6 : 0.95);
        const inv = 1 / Math.max(1e-6, dens[i]);
        d[o] = Math.min(255, cr[i] * inv * diff + 255 * spec);
        d[o + 1] = Math.min(255, cg[i] * inv * diff + 255 * spec);
        d[o + 2] = Math.min(255, cb[i] * inv * diff + 255 * spec);
        d[o + 3] = a * 255;
      }
    }
  }

  // Lava: the crowd glows by how hot it is, from a dark crust at the edge
  // through red and orange to white where it's packed, and it seethes.
  private lava(s: number, t: number) {
    const norm = this.blur(s * 5, false);
    const { gw, gh, dens } = this;
    const d = this.img!.data;
    const th = 0.3;
    const out = this.c3;
    if (this.lavaFor !== this.rgb) {
      this.lavaFor = this.rgb;
      this.lavaRamp = lavaStops(this.rgb);
    }
    const stops = this.lavaRamp;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = i * 4;
        const D = dens[i] * norm;
        if (D < th * 0.5 || x === 0 || y === 0 || x === gw - 1 || y === gh - 1) {
          d[o + 3] = 0;
          continue;
        }
        const gx = (dens[i + 1] - dens[i - 1]) * 0.5 * norm;
        const gy = (dens[i + gw] - dens[i - gw]) * 0.5 * norm;
        const a = clamp01((D - th) / Math.max(Math.hypot(gx, gy), 0.04) + 0.5);
        if (a <= 0) {
          d[o + 3] = 0;
          continue;
        }
        // A dark crust on top, cracked, with the heat showing through the
        // cracks and round the hot edges of each flow.
        const inner = 1 - Math.exp(-(D - th) * 0.8);
        const cr1 = 1 - Math.abs(wob(x * 0.9, y * 0.9, t * 0.25));
        const cr2 = 1 - Math.abs(wob(y * 1.7 + 40, x * 1.7, t * 0.3));
        const crack = Math.max(cr1 ** 14, cr2 ** 18 * 0.8);
        const edge = Math.exp(-Math.max(0, D - th) * 2.5);
        let heat = 0.08 + 0.1 * inner;
        heat = Math.max(heat, crack * (0.55 + 0.45 * inner), edge * 0.72);
        ramp(stops, heat, out);
        d[o] = out[0];
        d[o + 1] = out[1];
        d[o + 2] = out[2];
        d[o + 3] = a * 255;
      }
    }
  }

  // Terrain: the crowd is high ground. Sea where it's empty, then beach,
  // grass, forest, rock and snow, lit from the top left with a line every 10 m.
  private terrain(s: number, t: number) {
    const norm = this.any ? this.blur(Math.max(10, s * 7), false, 3) : 0;
    const { gw, gh, dens } = this;
    const d = this.img!.data;
    const H = (i: number) => 1 - Math.exp(-dens[i] * norm * 0.55);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = i * 4;
        const h = H(i);
        let r: number, g: number, b: number;
        if (h < 0.08) {
          // Sea: deeper further out, with a slow shimmer.
          const k = h / 0.08;
          const sh = 0.04 * wob(x * 0.5, y * 0.5, t * 0.8);
          r = 18 + 30 * k;
          g = 40 + 60 * k + 20 * sh;
          b = 80 + 70 * k + 30 * sh;
        } else {
          const gx = x > 0 && x < gw - 1 ? (H(i + 1) - H(i - 1)) * 0.5 : 0;
          const gy = y > 0 && y < gh - 1 ? (H(i + gw) - H(i - gw)) * 0.5 : 0;
          let nx = -gx * 14, ny = -gy * 14, nz = 1;
          const nl = Math.hypot(nx, ny, nz);
          nx /= nl; ny /= nl; nz /= nl;
          const shade = clamp01(0.45 + 0.75 * (nx * -0.5 + ny * -0.6 + nz * 0.62));
          const C = h < 0.12 ? [214, 200, 150] : h < 0.32 ? [88, 150, 70] : h < 0.52 ? [44, 104, 52] : h < 0.72 ? [128, 112, 96] : [240, 242, 248];
          // A thin contour line every tenth of the height.
          const f = h * 10;
          const gm = Math.max(1e-4, Math.hypot(gx, gy) * 10);
          const line = clamp01(1 - Math.abs(f - Math.round(f)) / gm + 0.3) * 0.25;
          const k = shade * (1 - line);
          r = C[0] * k;
          g = C[1] * k;
          b = C[2] * k;
        }
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = 255;
      }
    }
  }

  // Caustics: light on the floor of a pool. A net of bright lines that wavers
  // on its own and tightens and brightens where the particles crowd.
  private caustics(s: number, t: number) {
    const norm = this.any ? this.blur(Math.max(8, s * 6), true) : 0;
    const { gw, gh, dens, cr, cg, cb, c } = this;
    const d = this.img!.data;
    // The water's own colour: the palette's middle, dark.
    const mid = this.rgb[(this.rgb.length / 2) | 0] ?? [80, 140, 200];
    const k = 3 / c;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = i * 4;
        const D = dens[i] * norm;
        const pres = 1 - Math.exp(-D * 1.2);
        const X = x / k;
        const Y = y / k;
        const ph = pres * 2.4 + 1.1 * Math.sin(X * 0.11 + t * 0.9 + Math.cos(Y * 0.07 - t * 0.4)) + 1.1 * Math.cos(Y * 0.1 - t * 0.7 + Math.sin(X * 0.05 + t * 0.3));
        const l1 = (1 - Math.abs(Math.sin(ph * 2.2))) ** 9;
        const l2 = (1 - Math.abs(Math.sin(ph * 3.1 + 1.7 + t * 0.2))) ** 9;
        const bright = Math.min(1.4, (l1 + l2 * 0.7) * (0.45 + 0.9 * pres));
        const inv = D > 0.01 ? 1 / dens[i] : 0;
        const lr = inv ? cr[i] * inv : mid[0];
        const lg = inv ? cg[i] * inv : mid[1];
        const lb = inv ? cb[i] * inv : mid[2];
        // Base: deep water; lines: the local colour turned to light.
        d[o] = Math.min(255, mid[0] * 0.16 + lr * 0.12 * pres + (lr * 0.5 + 128) * bright);
        d[o + 1] = Math.min(255, mid[1] * 0.16 + lg * 0.12 * pres + (lg * 0.5 + 128) * bright);
        d[o + 2] = Math.min(255, mid[2] * 0.16 + lb * 0.12 * pres + (lb * 0.5 + 128) * bright);
        d[o + 3] = 255;
      }
    }
  }

  // Aurora: glowing curtains that hang down from the particles, swaying,
  // streaked with fine rays, and slow to fade.
  private aurora(s: number, t: number, dt: number, light: boolean) {
    const { gw, gh, c } = this;
    const norm = this.any ? this.blur(Math.max(3, s * 2.5), true, 1) : 0;
    const [S, R, G, B] = this.sm;
    const { dens, cr, cg, cb } = this;
    const f = Math.min(3, dt * 60);
    const keep = Math.pow(0.86, f);
    const hang = Math.exp(-c / 70);
    for (let x = 0; x < gw; x++) {
      let a = 0, r = 0, g = 0, b = 0;
      for (let y = 0; y < gh; y++) {
        const i = y * gw + x;
        const fresh = dens[i] * norm;
        a = a * hang + fresh * 0.25;
        r = r * hang + cr[i] * norm * 0.25;
        g = g * hang + cg[i] * norm * 0.25;
        b = b * hang + cb[i] * norm * 0.25;
        S[i] = S[i] * keep + a * (1 - keep);
        R[i] = R[i] * keep + r * (1 - keep);
        G[i] = G[i] * keep + g * (1 - keep);
        B[i] = B[i] * keep + b * (1 - keep);
      }
    }
    const d = this.img!.data;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const o = (y * gw + x) * 4;
        // Sway: read from a little to the side, more further down.
        const sx = x + Math.sin(y * 0.035 + t * 0.7 + x * 0.012) * 2.5;
        const A = sample(S, gw, gh, sx, y);
        if (A < 0.004) {
          d[o + 3] = 0;
          continue;
        }
        const inv = 1 / A;
        const ray = 0.55 + 0.45 * Math.sin(x * c * 0.25 + 3 * Math.sin(t * 0.35 + x * c * 0.02));
        const rr = sample(R, gw, gh, sx, y) * inv;
        const gg = sample(G, gw, gh, sx, y) * inv;
        const bb = sample(B, gw, gh, sx, y) * inv;
        d[o] = Math.min(255, rr * 1.1);
        d[o + 1] = Math.min(255, gg * 1.1);
        d[o + 2] = Math.min(255, bb * 1.1);
        d[o + 3] = (1 - Math.exp(-A * 2.2)) * ray * (light ? 200 : 235);
      }
    }
  }

  // Marbling: dye the particles drag through as they move. It follows their
  // motion, never blurs, and fades over minutes, so swirls build up like
  // marbled paper.
  private marbling(s: number, dt: number) {
    const { gw, gh, c } = this;
    const norm = this.any ? this.blur(Math.max(2, s * 1.5), true, 1) : 0;
    // The motion field: smoothed, and only where particles are.
    const { vu, vv, vw, tmp } = this;
    const r = Math.max(1, Math.round(Math.max(6, s * 5) / c));
    boxBlur(vu, tmp, gw, gh, r);
    boxBlur(vv, tmp, gw, gh, r);
    boxBlur(vw, tmp, gw, gh, r);
    const [S, R, G, B] = this.sm;
    const [S2, R2, G2, B2] = this.smNext;
    const f = Math.min(3, dt * 60);
    const keep = Math.pow(0.9985, f);
    const add = 0.05 * f;
    const { dens, cr, cg, cb } = this;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const w = vw[i];
        const u = w > 1e-4 ? (vu[i] / w) * Math.min(1, w * 4) : 0;
        const v = w > 1e-4 ? (vv[i] / w) * Math.min(1, w * 4) : 0;
        const sx = x - (u * f * 1.2) / c;
        const sy = y - (v * f * 1.2) / c;
        S2[i] = sample(S, gw, gh, sx, sy) * keep + dens[i] * norm * add;
        R2[i] = sample(R, gw, gh, sx, sy) * keep + cr[i] * norm * add;
        G2[i] = sample(G, gw, gh, sx, sy) * keep + cg[i] * norm * add;
        B2[i] = sample(B, gw, gh, sx, sy) * keep + cb[i] * norm * add;
      }
    }
    this.sm = this.smNext;
    this.smNext = [S, R, G, B];
    const [S3, R3, G3, B3] = this.sm;
    const d = this.img!.data;
    for (let i = 0, N = gw * gh; i < N; i++) {
      const o = i * 4;
      const D = S3[i];
      if (D < 0.003) {
        d[o + 3] = 0;
        continue;
      }
      const inv = 1 / D;
      d[o] = R3[i] * inv;
      d[o + 1] = G3[i] * inv;
      d[o + 2] = B3[i] * inv;
      d[o + 3] = (1 - Math.exp(-D * 1.6)) * 255;
    }
  }

  // Rain on water: a surface that carries rings from each drop, lit from the
  // top left; the rings take the colour of the drops that made them.
  private rainSurface(t: number, dt: number, light: boolean) {
    const { gw, gh } = this;
    const [, , R, G, B, W] = this.rain;
    const steps = dt > 0.024 ? 2 : 1;
    for (let k = 0; k < steps; k++) {
      const h = this.rain[0], hp = this.rain[1];
      for (let y = 1; y < gh - 1; y++) {
        for (let x = 1; x < gw - 1; x++) {
          const i = y * gw + x;
          hp[i] = ((h[i - 1] + h[i + 1] + h[i - gw] + h[i + gw]) * 0.5 - hp[i]) * 0.984;
        }
      }
      // The new surface is in hp: swap.
      this.rain[0] = hp;
      this.rain[1] = h;
    }
    const H = this.rain[0];
    const fade = Math.pow(0.985, Math.min(3, dt * 60));
    for (let i = 0, N = gw * gh; i < N; i++) {
      R[i] *= fade;
      G[i] *= fade;
      B[i] *= fade;
      W[i] *= fade;
    }
    const d = this.img!.data;
    const mid = this.rgb[(this.rgb.length / 2) | 0] ?? [80, 140, 200];
    const base = light ? [mid[0] * 0.35 + 150, mid[1] * 0.35 + 160, mid[2] * 0.35 + 170] : [mid[0] * 0.12 + 6, mid[1] * 0.12 + 12, mid[2] * 0.12 + 22];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = i * 4;
        const gx = x > 0 && x < gw - 1 ? H[i + 1] - H[i - 1] : 0;
        const gy = y > 0 && y < gh - 1 ? H[i + gw] - H[i - gw] : 0;
        let nx = -gx * 0.9, ny = -gy * 0.9, nz = 1;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        const lit = nx * -0.45 + ny * -0.55 + nz * 0.7;
        const spec = Math.max(0, lit - 0.7) * 3.3;
        const dark = Math.max(0, 0.7 - lit) * 1.6;
        const w = W[i];
        const tint = w > 0.02 ? Math.min(1, w) : 0;
        const cr = w > 0.02 ? R[i] / w : 255;
        const cg = w > 0.02 ? G[i] / w : 255;
        const cb = w > 0.02 ? B[i] / w : 255;
        const sh = 0.04 * wob(x * 0.3, y * 0.3, t * 0.4);
        d[o] = Math.min(255, base[0] * (1 + sh - dark) + (cr * tint + 255 * (1 - tint)) * spec * 0.8);
        d[o + 1] = Math.min(255, base[1] * (1 + sh - dark) + (cg * tint + 255 * (1 - tint)) * spec * 0.8);
        d[o + 2] = Math.min(255, base[2] * (1 + sh - dark) + (cb * tint + 255 * (1 - tint)) * spec * 0.8);
        d[o + 3] = 255;
      }
    }
  }

  // Slime mould: every particle lays a trail that spreads and evaporates;
  // they follow it (see steer), so veins form, branch and join.
  private slime(dt: number, light: boolean) {
    const { gw, gh } = this;
    const [T, R, G, B] = this.sm;
    const { dens, cr, cg, cb } = this;
    const f = Math.min(3, dt * 60);
    const keep = Math.pow(0.93, f);
    for (let i = 0, N = gw * gh; i < N; i++) {
      T[i] = T[i] * keep + dens[i] * 0.35;
      R[i] = R[i] * keep + cr[i] * 0.35;
      G[i] = G[i] * keep + cg[i] * 0.35;
      B[i] = B[i] * keep + cb[i] * 0.35;
    }
    for (const a of this.sm) boxBlur(a, this.tmp, gw, gh, 1);
    const d = this.img!.data;
    for (let i = 0, N = gw * gh; i < N; i++) {
      const o = i * 4;
      const v = T[i];
      if (v < 0.003) {
        d[o + 3] = 0;
        continue;
      }
      const inv = 1 / v;
      const hot = clamp01((v - 0.6) * 0.5);
      d[o] = Math.min(255, R[i] * inv + (255 - R[i] * inv) * hot);
      d[o + 1] = Math.min(255, G[i] * inv + (255 - G[i] * inv) * hot);
      d[o + 2] = Math.min(255, B[i] * inv + (255 - B[i] * inv) * hot);
      d[o + 3] = (1 - Math.exp(-v * 1.4)) * (light ? 230 : 255);
    }
  }

  // Wash: a soft out-of-focus haze of the colours (behind Glass drops).
  private wash(s: number) {
    // Three passes so the haze is round, not square.
    const norm = this.blur(Math.max(11, s * 7), true, 3);
    const { gw, gh, dens, cr, cg, cb } = this;
    const d = this.img!.data;
    for (let i = 0, N = gw * gh; i < N; i++) {
      const o = i * 4;
      const D = dens[i] * norm;
      if (D < 0.01) {
        d[o + 3] = 0;
        continue;
      }
      const inv = 1 / dens[i];
      d[o] = cr[i] * inv * 0.8;
      d[o + 1] = cg[i] * inv * 0.8;
      d[o + 2] = cb[i] * inv * 0.8;
      d[o + 3] = (1 - Math.exp(-D * 0.3)) * 85;
    }
  }

  // Smoke: each frame's particles thicken a field that rises, curls and thins.
  private smoke(s: number, t: number, dt: number, light: boolean) {
    const { gw, gh, c } = this;
    const norm = this.any ? this.blur(s * 3, true, 1) : 0;
    const [S, R, G, B] = this.sm;
    const [S2, R2, G2, B2] = this.smNext;
    const f = Math.min(3, dt * 60);
    const rise = (22 * dt) / c;
    const keep = Math.pow(0.972, f);
    const add = 0.07 * f;
    const { dens, cr, cg, cb } = this;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        // Where this cell's smoke came from: below it, curling side to side.
        const ux = (Math.sin(y * 0.11 + t * 0.6) * 0.5 + Math.sin(x * 0.05 + y * 0.031 - t * 0.35) * 0.4) * f;
        const uy = -rise + Math.cos(x * 0.09 + t * 0.5) * 0.15 * f;
        const sx = x - ux;
        const sy = y - uy;
        S2[i] = sample(S, gw, gh, sx, sy) * keep + dens[i] * norm * add;
        R2[i] = sample(R, gw, gh, sx, sy) * keep + cr[i] * norm * add;
        G2[i] = sample(G, gw, gh, sx, sy) * keep + cg[i] * norm * add;
        B2[i] = sample(B, gw, gh, sx, sy) * keep + cb[i] * norm * add;
      }
    }
    // It spreads a little as it goes.
    for (const a of this.smNext) boxBlur(a, this.tmp, gw, gh, 1);
    this.sm = this.smNext;
    this.smNext = [S, R, G, B];
    const [S3, R3, G3, B3] = this.sm;
    const d = this.img!.data;
    const lift = light ? 0.85 : 1.15;
    for (let i = 0, N = gw * gh; i < N; i++) {
      const o = i * 4;
      const D = S3[i];
      if (D < 0.004) {
        d[o + 3] = 0;
        continue;
      }
      const inv = lift / D;
      d[o] = Math.min(255, R3[i] * inv);
      d[o + 1] = Math.min(255, G3[i] * inv);
      d[o + 2] = Math.min(255, B3[i] * inv);
      d[o + 3] = (1 - Math.exp(-D * 1.1)) * 235;
    }
  }

  // Cells: each pixel belongs to its nearest particle. A thin bright wall
  // where two meet; inside, a glow round the particle like a nucleus.
  private cells(s: number, light: boolean) {
    const { gw, gh, c, sx, sy, sk } = this;
    const ns = sx.length;
    const B = Math.max(8, Math.sqrt((this.w * this.h) / ns));
    const bw = Math.ceil(this.w / B) + 1;
    const bh = Math.ceil(this.h / B) + 1;
    const head = new Int32Array(bw * bh).fill(-1);
    const next = new Int32Array(ns);
    // Two particles almost on top of each other would make a sliver of a
    // cell that is all wall, so only one of them owns a cell.
    const near = (B * 0.4) ** 2;
    for (let j = 0; j < ns; j++) {
      const bx = Math.min(bw - 1, Math.max(0, Math.floor(sx[j] / B)));
      const by = Math.min(bh - 1, Math.max(0, Math.floor(sy[j] / B)));
      const h0 = by * bw + bx;
      let clash = false;
      for (let yy = Math.max(0, by - 1); yy <= Math.min(bh - 1, by + 1) && !clash; yy++)
        for (let xx = Math.max(0, bx - 1); xx <= Math.min(bw - 1, bx + 1) && !clash; xx++)
          for (let q = head[yy * bw + xx]; q >= 0; q = next[q])
            if ((sx[q] - sx[j]) ** 2 + (sy[q] - sy[j]) ** 2 < near) {
              clash = true;
              break;
            }
      if (clash) continue;
      next[j] = head[h0];
      head[h0] = j;
    }
    const d = this.img!.data;
    const nuc = Math.max(2, s * 1.6);
    const wallW = 1.1;
    for (let y = 0; y < gh; y++) {
      const Y = (y + 0.5) * c;
      for (let x = 0; x < gw; x++) {
        const X = (x + 0.5) * c;
        const bx = Math.floor(X / B);
        const by = Math.floor(Y / B);
        let d1 = Infinity, d2 = Infinity, j1 = -1, j2 = -1;
        for (let rad = 1, rmax = Math.max(bw, bh); rad <= rmax; rad++) {
          for (let yy = by - rad; yy <= by + rad; yy++) {
            if (yy < 0 || yy >= bh) continue;
            for (let xx = bx - rad; xx <= bx + rad; xx++) {
              if (xx < 0 || xx >= bw) continue;
              // Only the new ring on wider searches.
              if (rad > 1 && yy > by - rad && yy < by + rad && xx > bx - rad && xx < bx + rad) continue;
              for (let j = head[yy * bw + xx]; j >= 0; j = next[j]) {
                const dx = sx[j] - X;
                const dy = sy[j] - Y;
                const q = dx * dx + dy * dy;
                if (q < d1) {
                  d2 = d1;
                  j2 = j1;
                  d1 = q;
                  j1 = j;
                } else if (q < d2) {
                  d2 = q;
                  j2 = j;
                }
              }
            }
          }
          if (d2 < Infinity && Math.sqrt(d2) < rad * B) break;
        }
        const o = (y * gw + x) * 4;
        if (j1 < 0) {
          d[o + 3] = 0;
          continue;
        }
        const r1 = Math.sqrt(d1);
        // Distance to the wall: to the line halfway between the two nearest.
        const e = j2 >= 0 ? (d2 - d1) / Math.max(1e-3, Math.hypot(sx[j2] - sx[j1], sy[j2] - sy[j1])) : B;
        const col = this.rgb[sk[j1]] ?? [255, 255, 255];
        // Inside: dim colour, brighter toward the middle, and the nucleus itself.
        const glow = 0.28 + 0.4 * clamp01(1 - r1 / (B * 0.75)) ** 2;
        const core = clamp01((nuc - r1) / c + 0.5);
        const wall = clamp01(1 - (e - wallW * 2) / (c * 1.2));
        let k = glow + core * (1 - glow);
        let r = col[0] * k, g = col[1] * k, b = col[2] * k;
        if (light) {
          // On a light page the walls are dark ink; the cells a pale tint.
          const tint = 0.35 + 0.4 * core;
          r = 255 - (255 - col[0]) * tint;
          g = 255 - (255 - col[1]) * tint;
          b = 255 - (255 - col[2]) * tint;
          k = 0.45;
          r += (col[0] * k - r) * wall;
          g += (col[1] * k - g) * wall;
          b += (col[2] * k - b) * wall;
        } else {
          r += (Math.min(255, col[0] * 0.6 + 110) - r) * wall;
          g += (Math.min(255, col[1] * 0.6 + 110) - g) * wall;
          b += (Math.min(255, col[2] * 0.6 + 110) - b) * wall;
        }
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = 235;
      }
    }
  }

  private stepNow = 0.3;
  // Contours: lines of equal density, like a height map. Each level takes
  // the next colour of the palette; crowds stack up rings. Drawn per cell:
  // how far (in pixels) this cell is from the nearest level line.
  private contours(s: number, light: boolean) {
    const norm = this.blur(Math.max(8, s * 6), false);
    const { gw, gh, c, dens } = this;
    const N = gw * gh;
    let max = 0;
    for (let i = 0; i < N; i++) {
      const v = dens[i] * norm;
      dens[i] = v;
      if (v > max) max = v;
    }
    const K = 8;
    // The spacing follows the busiest spot slowly, so the rings don't jump.
    const want = Math.max(0.22, max / (K + 0.5));
    this.stepNow += (want - this.stepNow) * 0.08;
    const step = this.stepNow;
    const d = this.img!.data;
    const nc = this.rgb.length;
    const half = 0.55 / c;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const o = i * 4;
        const D = dens[i];
        if (D < step * 0.5 || x === 0 || y === 0 || x === gw - 1 || y === gh - 1) {
          d[o + 3] = 0;
          continue;
        }
        const f = D / step;
        const j = Math.round(f);
        if (j < 1) {
          d[o + 3] = 0;
          continue;
        }
        const gx = (dens[i + 1] - dens[i - 1]) * 0.5;
        const gy = (dens[i + gw] - dens[i - gw]) * 0.5;
        const gm = Math.max(1e-4, Math.hypot(gx, gy));
        // Distance to the line in cells; every fourth line a little bolder.
        const dist = (Math.abs(f - j) * step) / gm;
        const lj = Math.min(K, j);
        const wdt = (lj % 4 === 0 ? 0.62 : 0.42) + half;
        const a = clamp01(wdt - dist + 0.5);
        if (a <= 0) {
          d[o + 3] = 0;
          continue;
        }
        const col = this.rgb[Math.round(((lj - 1) / (K - 1)) * (nc - 1))] ?? [255, 255, 255];
        d[o] = col[0];
        d[o + 1] = col[1];
        d[o + 2] = col[2];
        d[o + 3] = a * 255 * ((light ? 0.6 : 0.5) + (0.5 * (lj - 1)) / (K - 1));
      }
    }
  }
}

// Sand: every particle leaves a grain of its colour where it is, so the paths
// build up into a picture like a long exposure, fading over a few minutes.
// Kept as pixels (one per CSS pixel; half that on a big screen), with the
// moving grains laid on top, so it costs one image upload a frame.
export class SandLayer {
  private canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private img: ImageData | null = null;
  private rgb = new Uint8ClampedArray(0);
  private al = new Float32Array(0);
  private sw = 0;
  private sh = 0;
  private k = 1;

  clear() {
    this.al.fill(0);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, px: Float32Array, py: Float32Array, lists: number[][], cols: Rgb[], dt: number) {
    const k = w * h > 800000 ? 0.5 : 1;
    const sw = Math.max(1, Math.round(w * k));
    const sh = Math.max(1, Math.round(h * k));
    if (sw !== this.sw || sh !== this.sh) {
      this.sw = sw;
      this.sh = sh;
      this.k = k;
      this.canvas.width = sw;
      this.canvas.height = sh;
      this.img = this.g.createImageData(sw, sh);
      this.rgb = new Uint8ClampedArray(sw * sh * 3);
      this.al = new Float32Array(sw * sh);
    }
    const { rgb, al } = this;
    const keep = Math.exp(-dt / 90);
    const dep = 0.09;
    for (let k2 = 0; k2 < lists.length; k2++) {
      const list = lists[k2];
      if (!list.length) continue;
      const col = cols[k2] ?? [255, 255, 255];
      for (const i of list) {
        const x = (px[i] * k) | 0;
        const y = (py[i] * k) | 0;
        if (x < 0 || y < 0 || x >= sw || y >= sh) continue;
        const p = y * sw + x;
        const q = p * 3;
        // The new grain tints what's there more the thinner it is.
        const t = dep / Math.max(dep, al[p] + dep);
        rgb[q] += (col[0] - rgb[q]) * t;
        rgb[q + 1] += (col[1] - rgb[q + 1]) * t;
        rgb[q + 2] += (col[2] - rgb[q + 2]) * t;
        al[p] = Math.min(1, al[p] + dep);
      }
    }
    const d = this.img!.data;
    for (let p = 0, N = sw * sh; p < N; p++) {
      const a = (al[p] *= keep);
      const o = p * 4;
      const q = p * 3;
      d[o] = rgb[q];
      d[o + 1] = rgb[q + 1];
      d[o + 2] = rgb[q + 2];
      d[o + 3] = a * 255;
    }
    // The grains still moving, full strength.
    for (let k2 = 0; k2 < lists.length; k2++) {
      const col = cols[k2] ?? [255, 255, 255];
      for (const i of lists[k2]) {
        const x = (px[i] * k) | 0;
        const y = (py[i] * k) | 0;
        if (x < 0 || y < 0 || x >= sw || y >= sh) continue;
        const o = (y * sw + x) * 4;
        d[o] = col[0];
        d[o + 1] = col[1];
        d[o + 2] = col[2];
        d[o + 3] = 255;
      }
    }
    this.g.putImageData(this.img!, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, sw / this.k, sh / this.k);
    ctx.restore();
  }
}
