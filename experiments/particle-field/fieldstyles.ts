// Field styles: the particles drawn as one substance instead of one mark each.
// The particles are splatted onto a coarse grid and blurred into a smooth
// density field, then the field is drawn: as a liquid with a lit surface,
// as contour lines, as drifting smoke, or (Cells) as the patch of screen
// nearest each particle. The grid is drawn scaled up with smoothing, so
// edges stay soft at a fraction of the cost of full resolution.

type Rgb = readonly [number, number, number] | number[];
export type FieldStyle = 'liquid' | 'cells' | 'contours' | 'smoke' | 'wash';
export const FIELD_STYLES = new Set<string>(['liquid', 'cells', 'contours', 'smoke']);

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
    const fine = style === 'liquid' || style === 'cells' || style === 'contours';
    const cells = fine ? (w * h > 600000 ? 200000 : style === 'cells' ? 90000 : 130000) : w * h > 600000 ? 70000 : 40000;
    const c = Math.max(fine ? 1.5 : 2.5, Math.sqrt((w * h) / cells));
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
      this.canvas.width = gw;
      this.canvas.height = gh;
      this.img = this.g.createImageData(gw, gh);
    } else {
      this.dens.fill(0);
      this.cr.fill(0);
      this.cg.fill(0);
      this.cb.fill(0);
    }
    this.sx.length = this.sy.length = this.sk.length = 0;
    // A cell about 40 px across on a phone; fewer, bigger cells for a crowd.
    this.maxSeeds = Math.round(Math.min(700, Math.max(120, (w * h) / 1500)));
    this.stride = Math.max(1, Math.ceil(total / this.maxSeeds));
  }

  /** Add one colour's particles, at strength a (fading ones count less). */
  add(px: Float32Array, py: Float32Array, list: number[], k: number, a: number) {
    if (!list.length || a <= 0) return;
    this.any = true;
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
    }
  }

  /** Smoke left over from earlier frames still drifts after the particles go. */
  forget() {
    for (const a of this.sm) a.fill(0);
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
    else if (st === 'wash') {
      if (!this.any) return;
      this.wash(s);
    } else {
      if (!this.any) return;
      this.liquid(s, light);
    }
    this.g.putImageData(this.img!, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.canvas, 0, 0, this.gw, this.gh, 0, 0, this.gw * this.c, this.gh * this.c);
    ctx.restore();
  }

  // Blur the splatted field into blobs about rad CSS px across. Returns the
  // scale that puts a lone particle's peak near 1.
  private blur(rad: number, colour: boolean, passes = 2) {
    const r = Math.max(1, Math.round(rad / this.c));
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
