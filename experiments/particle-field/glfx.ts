// GPU picture effects for the WebGL renderer: lenses (on the way to the
// screen), and the feedback effects that redraw the picture into itself
// (tunnel, kaleidoscope, mirror world, view echo).
//
// Everything is in canvas pixels with y running down, like the 2D canvas.
// A target is a texture with a framebuffer; all targets (and the GPU
// picture) hold their rows bottom-up, as GL draws them, so sampling a canvas
// point (x, y) reads uv (x / w, 1 - y / h).

export type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer | null; w: number; h: number };
export type FxBlend = 'over' | 'add' | 'copy';
type Uniforms = Record<string, number | number[]>;

const QUAD_VS = `#version 300 es
in vec2 corner;
uniform vec2 osize;
out vec2 px;
void main() {
  px = vec2(corner.x, 1.0 - corner.y) * osize;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

// A textured quad: corner → source rect (source px) → affine m → output px.
const DRAW_VS = `#version 300 es
in vec2 corner;
uniform vec4 rect;   // source x, y, w, h (px)
uniform vec2 ssize;  // source size
uniform vec2 osize;  // output size
uniform mat3 m;      // source px → output px
out vec2 uv;
void main() {
  vec2 sp = rect.xy + corner * rect.zw;
  vec2 o = (m * vec3(sp, 1.0)).xy;
  uv = vec2(sp.x / ssize.x, 1.0 - sp.y / ssize.y);
  gl_Position = vec4(o.x / osize.x * 2.0 - 1.0, 1.0 - o.y / osize.y * 2.0, 0.0, 1.0);
}`;
const DRAW_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D src;
uniform float alpha;
out vec4 o;
void main() { o = texture(src, uv) * alpha; }`;

const FILL_FS = `#version 300 es
precision highp float;
uniform vec4 col;
out vec4 o;
void main() { o = col; }`;

const HEAD = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 size;
uniform vec2 osize;
uniform vec4 bg;
in vec2 px;
out vec4 o;
vec4 at(vec2 p) {
  if (p.x < 0.0 || p.y < 0.0 || p.x >= size.x || p.y >= size.y) return bg;
  return texture(src, vec2(p.x / size.x, 1.0 - p.y / size.y));
}
vec2 rot(vec2 d, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(d.x * c - d.y * s, d.x * s + d.y * c);
}
const float TAU = 6.28318530718;
`;

const PASSES: Record<string, string> = {
  copy: `void main() { o = at(px); }`,
  mirror: `uniform float hx, hy;
void main() {
  vec2 p = px;
  if (hx > 0.5 && p.x >= osize.x * 0.5) p.x = osize.x - p.x;
  if (hy > 0.5 && p.y >= osize.y * 0.5) p.y = osize.y - p.y;
  o = at(p);
}`,
  tiles: `uniform float k;
void main() {
  vec2 t = osize / k;
  vec2 cell = floor(px / t);
  vec2 f = fract(px / t);
  if (mod(cell.x, 2.0) >= 1.0) f.x = 1.0 - f.x;
  if (mod(cell.y, 2.0) >= 1.0) f.y = 1.0 - f.y;
  o = at(f * size);
}`,
  twirl: `uniform float R, tw, spin, N;
void main() {
  vec2 c = osize * 0.5;
  vec2 d = px - c;
  float k = clamp(ceil(N * (1.0 - length(d) / R)) - 1.0, 0.0, N - 1.0);
  float u = 1.0 - k / N;
  float a = tw * pow(1.0 - u, 1.6) + spin * (1.0 - u);
  o = at(c + rot(d, -a));
}`,
  fan: `uniform float N, swing;
void main() {
  vec2 c = osize * 0.5;
  vec2 d = px - c;
  float a = mod(atan(d.y, d.x), TAU);
  float k = floor(a / (TAU / N));
  float r = mod(k, 2.0) >= 1.0 ? swing : -swing;
  o = at(c + rot(d, -r));
}`,
  wave: `uniform float rowH, amp, freq, ph;
void main() {
  float y = floor(px.y / rowH) * rowH;
  float dx = amp * sin(y * freq + ph) + amp * 0.35 * sin(y * freq * 2.7 - ph * 1.3);
  o = at(vec2(px.x - dx, px.y));
}`,
  ripple: `uniform float R, N, n, str;
uniform vec2 rip[8];
void main() {
  vec2 c = osize * 0.5;
  vec2 d = px - c;
  float k = floor(length(d) * N / R) + 1.0;
  if (k > N - 1.0) { o = at(px); return; }
  float rr = R * k / N;
  float disp = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= n) break;
    float dd = (rr - rip[i].x) / (R * 0.08);
    disp += exp(-dd * dd) * sin(dd * 3.0) * rip[i].y;
  }
  if (abs(disp) < 0.01) { o = at(px); return; }
  o = at(c + d / (1.0 + disp * str / max(rr, 1.0)));
}`,
  zoom: `uniform float n;
uniform float zs[9];
uniform float rs[9];
void main() {
  vec2 c = osize * 0.5;
  vec2 d = px - c;
  o = bg;
  for (int i = 8; i >= 0; i--) {
    if (float(i) >= n) continue;
    vec2 p = c + rot(d, -rs[i]) / zs[i];
    if (p.x >= 0.0 && p.y >= 0.0 && p.x < size.x && p.y < size.y) { o = at(p); return; }
  }
}`,
  dots: `uniform float cell, rad, clear;
void main() {
  vec2 cc = (floor(px / cell) + 0.5) * cell;
  float q = cell * 0.25;
  vec4 col = (at(cc + vec2(-q, -q)) + at(cc + vec2(q, -q)) + at(cc + vec2(-q, q)) + at(cc + vec2(q, q))) * 0.25;
  float m = clamp(rad + 0.5 - length(px - cc), 0.0, 1.0);
  o = col * m;
  if (clear < 0.5) o += bg * (1.0 - o.a);
}`,
  split: `uniform float d;
void main() {
  o = vec4(at(px + vec2(d, 0.0)).r, at(px - vec2(0.0, d * 0.3)).g, at(px - vec2(d, 0.0)).b, 1.0);
  o.a = bg.a > 0.0 ? 1.0 : max(o.r, max(o.g, o.b));
}`,
  crt: `uniform float stp, lineH, lineA, R, vig, flick;
void main() {
  vec4 c = at(px);
  float a = mod(px.y, stp) >= stp - lineH ? lineA : 0.0;
  c = c * (1.0 - a) + vec4(0.0, 0.0, 0.0, a);
  float v = clamp((length(px - osize * 0.5) - R * 0.45) / (R * 0.6), 0.0, 1.0) * 0.85 * vig;
  c = c * (1.0 - v) + vec4(0.0, 0.0, 0.0, v);
  o = c * (1.0 - flick) + vec4(0.0, 0.0, 0.0, flick);
}`,
  blur: `uniform vec2 dir;
uniform float sigma;
void main() {
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -24; i <= 24; i++) {
    float f = float(i);
    if (abs(f) > sigma * 3.0) continue;
    float w = exp(-f * f / (2.0 * sigma * sigma));
    vec2 p = clamp(px + dir * f, vec2(0.5), size - 0.5);
    acc += at(p) * w;
    wsum += w;
  }
  o = acc / wsum;
}`,
  // Mirror world: the left half, mirrored onto the right, hue turned.
  mirrorWorld: `uniform float half_;
uniform mat3 hue;
void main() {
  if (px.x < osize.x - half_) { o = at(px); return; }
  vec4 c = at(vec2(osize.x - px.x, px.y));
  o = vec4(clamp(hue * c.rgb, 0.0, c.a), c.a);
}`,
  kaleido: `uniform float seg, base;
void main() {
  vec2 c = osize * 0.5;
  vec2 d = px - c;
  float sl = TAU / seg;
  float k = floor(mod(atan(d.y, d.x) - base, TAU) / sl);
  if (k < 0.5) { o = at(px); return; }
  vec2 s;
  if (mod(k, 2.0) < 0.5) s = rot(d, -k * sl);
  else {
    vec2 q = rot(d, -((k + 1.0) * sl + base));
    q.y = -q.y;
    s = rot(q, base);
  }
  o = at(c + s);
}`,
};

// CSS hue-rotate(), as a colour matrix (column-major for GLSL).
export function hueMatrix(deg: number) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  return [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];
}

/** Affine (canvas order a, b, c, d, e, f) putting source point (ox, oy) at (tx, ty), turned and scaled. */
export function affine(tx: number, ty: number, rot = 0, sx = 1, sy = sx, ox = 0, oy = 0): number[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const a = c * sx;
  const b = s * sx;
  const cc = -s * sy;
  const d = c * sy;
  return [a, b, cc, d, tx - (a * ox + cc * oy), ty - (b * ox + d * oy)];
}

export class GLFx {
  private progs = new Map<string, { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }>();
  private targets = new Map<string, Target>();
  private vao: WebGLVertexArrayObject;
  /** Size of the screen canvas. */
  sw = 0;
  sh = 0;

  constructor(private gl: WebGL2RenderingContext) {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private prog(key: string, vs: string, fs: string) {
    let e = this.progs.get(key);
    if (e) return e;
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${key}: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'corner');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${key}: ${gl.getProgramInfoLog(p)}`);
    e = { p, u: new Map() };
    this.progs.set(key, e);
    return e;
  }

  private uni(e: { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }, name: string) {
    let l = e.u.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(e.p, name);
      e.u.set(name, l);
    }
    return l;
  }

  /** A cached target of this size (made or resized as needed). */
  target(key: string, w: number, h: number): Target {
    const gl = this.gl;
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    let t = this.targets.get(key);
    if (t && t.w === w && t.h === h) return t;
    if (!t) {
      t = { tex: gl.createTexture()!, fbo: gl.createFramebuffer()!, w, h };
      this.targets.set(key, t);
    }
    t.w = w;
    t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return t;
  }

  /** Free every target (leaving the WebGL renderer). */
  drop() {
    const gl = this.gl;
    for (const t of this.targets.values()) {
      gl.deleteTexture(t.tex);
      if (t.fbo) gl.deleteFramebuffer(t.fbo);
    }
    this.targets.clear();
  }

  private bind(dst: Target | null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
    const w = dst ? dst.w : this.sw;
    const h = dst ? dst.h : this.sh;
    gl.viewport(0, 0, w, h);
    gl.bindVertexArray(this.vao);
    return [w, h];
  }

  private blend(b: FxBlend) {
    const gl = this.gl;
    if (b === 'copy') return gl.disable(gl.BLEND);
    gl.enable(gl.BLEND);
    if (b === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  // Scissor in canvas px (y down).
  private clip(rect: number[] | undefined, h: number) {
    const gl = this.gl;
    if (!rect) return gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.SCISSOR_TEST);
    const x = Math.max(0, Math.floor(rect[0]));
    const y = Math.max(0, Math.floor(h - rect[1] - rect[3]));
    gl.scissor(x, y, Math.max(0, Math.ceil(rect[2])), Math.max(0, Math.ceil(rect[3])));
  }

  /** Draw (part of) a target through an affine transform, like ctx.drawImage with a transform. */
  draw(src: Target, dst: Target | null, m: number[], o: { rect?: number[]; alpha?: number; blend?: FxBlend; clip?: number[] } = {}) {
    const gl = this.gl;
    const e = this.prog('draw', DRAW_VS, DRAW_FS);
    const [w, h] = this.bind(dst);
    gl.useProgram(e.p);
    const r = o.rect ?? [0, 0, src.w, src.h];
    gl.uniform4f(this.uni(e, 'rect'), r[0], r[1], r[2], r[3]);
    gl.uniform2f(this.uni(e, 'ssize'), src.w, src.h);
    gl.uniform2f(this.uni(e, 'osize'), w, h);
    gl.uniformMatrix3fv(this.uni(e, 'm'), false, [m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]);
    gl.uniform1f(this.uni(e, 'alpha'), o.alpha ?? 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    this.blend(o.blend ?? 'over');
    this.clip(o.clip, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
  }

  /** Fill with a colour (0–255 rgb, alpha 0–1), optionally a rect only. */
  fill(dst: Target | null, r: number, g: number, b: number, a: number, blend: FxBlend = 'over', rect?: number[]) {
    const gl = this.gl;
    const e = this.prog('fill', QUAD_VS, FILL_FS);
    const [, h] = this.bind(dst);
    gl.useProgram(e.p);
    gl.uniform4f(this.uni(e, 'col'), (r / 255) * a, (g / 255) * a, (b / 255) * a, a);
    this.blend(blend);
    this.clip(rect, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
  }

  /** Clear to transparent. */
  clear(dst: Target) {
    const gl = this.gl;
    this.bind(dst);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Run a full-screen effect reading src. bg: what lies outside src (0–255 rgb, alpha). */
  pass(name: string, src: Target, dst: Target | null, u: Uniforms = {}, bg: number[] = [0, 0, 0, 0]) {
    const gl = this.gl;
    const e = this.prog(name, QUAD_VS, HEAD + PASSES[name]);
    const [w, h] = this.bind(dst);
    gl.useProgram(e.p);
    gl.uniform2f(this.uni(e, 'size'), src.w, src.h);
    gl.uniform2f(this.uni(e, 'osize'), w, h);
    const a = bg[3];
    gl.uniform4f(this.uni(e, 'bg'), (bg[0] / 255) * a, (bg[1] / 255) * a, (bg[2] / 255) * a, a);
    for (const [k, v] of Object.entries(u)) {
      const l = this.uni(e, k);
      if (!l) continue;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (k === 'hue') gl.uniformMatrix3fv(l, false, v);
      else if (k === 'rip') gl.uniform2fv(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else gl.uniform1fv(l, v);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    this.blend('copy');
    gl.disable(gl.SCISSOR_TEST);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
