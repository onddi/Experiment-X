// GPU looks over the finished frame (the FX folder): light (bloom, colour
// split), feedback (tunnel, smear), lenses (glass, shockwave, kaleido) and
// surface (LED wall, halftone). One WebGL2 canvas sits over the field; each
// frame it takes the picture as a texture and shades it. Feedback keeps its
// own buffer, so it keeps the look before light and surface are added.

export type GpuFxParams = {
  bloom: number; spread: number; split: number; rays: number;
  feedback: 'off' | 'tunnel' | 'smear' | 'mirror' | 'melt'; zoom: number; spin: number; flow: number; length: number;
  lens: 'off' | 'glass' | 'shock' | 'kaleido' | 'liquid' | 'fisheye' | 'sort'; lensSize: number; bend: number; shock: number; slices: number; lensMix: number; count: number;
  surface: 'off' | 'led' | 'halftone' | 'ascii' | 'crt' | 'thermal' | 'mosaic'; cell: number; surfMix: number;
  grade: 'off' | 'sunset' | 'ocean' | 'acid' | 'mono'; gradeAmt: number; grain: number; vignette: number;
};
/** ptrs: up to four glass lens centres (0–1, y up); ptr: where light rays come from. */
export type GpuFxFrame = { t: number; kick: number; ptr: [number, number]; ptrs: number[]; wave: [number, number, number] };

const LENS_ID = { off: 0, glass: 1, shock: 2, kaleido: 3, liquid: 4, fisheye: 5, sort: 6 } as const;
const SURF_ID = { off: 0, led: 1, halftone: 2, ascii: 3, crt: 4, thermal: 5, mosaic: 6 } as const;
const FEED_ID = { off: 0, tunnel: 1, smear: 2, mirror: 3, melt: 4 } as const;
const GRADE_ID = { off: 0, sunset: 1, ocean: 2, acid: 3, mono: 4 } as const;
// ASCII glyphs, darkest to brightest.
const GLYPHS = ' .:-=+*#%@';

const VS = `#version 300 es
in vec2 p; out vec2 vUv; void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes;
uniform float uT;
float asp(){ return uRes.x / uRes.y; }
vec2 turn(vec2 uv, float a, float z){ vec2 p = uv - .5; p.x *= asp(); float c = cos(a), s = sin(a); p = mat2(c, s, -s, c) * p / z; p.x /= asp(); return p + .5; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

// Pass 1 (only with feedback on): the picture mixed with the last frame.
const FS_FEED = COMMON + `
uniform sampler2D uSrc, uPrev; uniform int uMode; uniform float uZoom, uSpin, uFlow, uLen, uKick;
void main(){
  vec4 now = texture(uSrc, vUv);
  vec4 prev;
  float z = 1. + (uZoom + uKick * .5) * .05;
  if (uMode == 1) prev = texture(uPrev, turn(vUv, uSpin * .05, z));
  else if (uMode == 3) prev = texture(uPrev, turn(vec2(1. - vUv.x, vUv.y), uSpin * .05, z));
  else if (uMode == 4) {
    float col = .35 + .65 * fract(sin(floor(vUv.x * uRes.x / 3.) * 12.9898) * 43758.5453);
    prev = texture(uPrev, vUv + vec2(0., .004 * (uFlow + uKick) * col));
  } else {
    vec2 v = vec2(sin(vUv.y * 7. + uT * .4), cos(vUv.x * 6. - uT * .3)) * .0035 * (uFlow + uKick);
    prev = texture(uPrev, vUv - v);
  }
  o = max(now, prev * uLen);
}`;

// Pass 2: lenses bend where we read, light and surface change what we show,
// the grade colours it last.
const FS_MAIN = COMMON + `
uniform sampler2D uSrc, uGlyph;
uniform int uLens, uSurf, uGrade, uCount;
uniform float uBloom, uSpread, uSplit, uRays, uSize, uBend, uShock, uSlices, uLensMix, uCell, uSurfMix, uGradeAmt, uGrain, uVig, uKick;
uniform vec2 uPtr; uniform vec2 uPtrs[4]; uniform vec3 uWave;
vec4 px(vec2 uv){ return texture(uSrc, clamp(uv, .0005, .9995)); }
float lumOf(vec3 c){ return max(c.r, max(c.g, c.b)); }
vec2 warp(vec2 uv, int lens, out vec2 fringe, out float rim){
  fringe = vec2(0.); rim = 0.;
  if (lens == 3) {
    vec2 p = uv - .5; p.x *= asp(); float seg = 6.28318 / floor(uSlices);
    float a = mod(atan(p.y, p.x) + uT * .08, seg), l = length(p);
    a = abs(a - seg * .5); p = vec2(cos(a), sin(a)) * l; p.x /= asp();
    return p * .9 + vec2(.5, .42);
  }
  if (lens == 1) {
    float r = uSize * .22 * (1. + uKick * .15) / (1. + float(uCount - 1) * .25);
    for (int i = 0; i < 4; i++) {
      if (i >= uCount) break;
      vec2 c0 = uPtrs[i], d = uv - c0; d.x *= asp(); float l = length(d);
      if (l >= r) { rim = min(rim, -.25 * uBend * exp(-(l - r) * 30.)); continue; }
      float k = l / r, m = mix(1., .35 + .65 * k * k, uBend);
      vec2 q = d * m; q.x /= asp();
      vec2 n = normalize(d + 1e-5); n.x /= asp();
      fringe = n * smoothstep(.7, 1., k) * .012 * uBend;
      rim = (smoothstep(.9, 1., k) * .35 + pow(max(0., 1. - length(d / r - vec2(-.35, .35))), 6.) * .25) * uBend;
      return c0 + q;
    }
    return uv;
  }
  if (lens == 2) {
    vec2 d = uv - uWave.xy; d.x *= asp(); float t = uT - uWave.z, l = length(d), R = t * .7;
    float w = exp(-pow((l - R) * 22., 2.)) * exp(-t * 1.6);
    vec2 n = normalize(d + 1e-5); n.x /= asp();
    fringe = n * w * .006 * min(uShock, 1.); rim = w * .25 * uShock;
    return uv - n * w * .05 * uShock;
  }
  if (lens == 4) {
    float a = uShock * (1. + uKick * 1.5);
    vec2 o2 = vec2(sin(uv.y * 9. + uT * 1.3 + sin(uv.x * 5. + uT * .7) * 1.5), cos(uv.x * 8. - uT * 1.1 + sin(uv.y * 6. - uT * .5) * 1.5));
    fringe = o2 * .002 * a;
    return uv + o2 * .012 * a;
  }
  if (lens == 5) {
    vec2 p = uv - .5; p.x *= asp(); float r2 = dot(p, p), k = uShock * .45 * (1. + uKick * .3);
    p *= (1. - k * .55) + k * r2 * 1.6; p.x /= asp();
    fringe = p * .01 * k;
    return p + .5;
  }
  return uv;
}
vec4 shade(vec2 uv, int lens){
  vec2 fringe; float rim;
  vec2 q = warp(uv, lens, fringe, rim);
  vec4 c = px(q);
  if (uSplit > 0. || fringe != vec2(0.)) {
    vec2 d = q - .5; vec2 s = d * uSplit * .018 * (.3 + length(d) * 2.) * (1. + uKick * 3.) + fringe;
    c.r = px(q + s).r; c.b = px(q - s).b;
  }
  if (uBloom > 0.) {
    vec3 acc = vec3(0.);
    for (int i = 0; i < 28; i++) {
      float fi = float(i), a = fi * 2.39996, r = sqrt(fi / 28.) * uSpread * .09;
      acc += max(px(q + vec2(cos(a) / asp(), sin(a)) * r).rgb - .28, 0.) * (1.2 - fi / 28.);
    }
    vec3 x = (c.rgb * 1.15 + acc / 28. * uBloom * (9. + uKick * 6.)) * 1.1;
    vec3 tm = clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);
    // Ease in: a little bloom is a little glow, not the whole look at once.
    float amt = min(uBloom, 1.);
    c = vec4(mix(c.rgb, tm, amt), max(c.a, amt * lumOf(tm)));
  }
  if (uRays > 0.) {
    // Light rays: bright spots smeared toward the light, fading as they go.
    vec2 st = (q - uPtr) * .022; vec2 s = q; vec3 acc = vec3(0.); float wt = 1.;
    for (int i = 0; i < 24; i++) { s -= st; acc += max(px(s).rgb - .3, 0.) * wt; wt *= .93; }
    vec3 add = acc * uRays * .12 * (1. + uKick * 1.5);
    c.rgb += add; c.a = max(c.a, min(1., lumOf(add)));
  }
  c.rgb += rim; c.a = max(c.a, rim);
  return c;
}
vec4 picture(vec2 uv){
  vec4 c = shade(uv, uLens);
  if (uLens == 3 && uLensMix < 1.) c = mix(shade(uv, 0), c, uLensMix);
  return c;
}
vec3 thermal(float l){
  vec3 a = mix(vec3(0., 0., .1), vec3(.3, 0., .6), smoothstep(0., .25, l));
  a = mix(a, vec3(.9, 0., .25), smoothstep(.2, .5, l));
  a = mix(a, vec3(1., .65, 0.), smoothstep(.45, .75, l));
  return mix(a, vec3(1.), smoothstep(.75, 1., l));
}
vec4 surface(vec2 uv){
  vec2 p = uv * uRes;
  if (uSurf == 1) {
    vec2 cell = floor(p / uCell) * uCell + uCell * .5;
    vec4 c = picture(cell / uRes); float m = smoothstep(.48, .3, length((p - cell) / uCell));
    return vec4(c.rgb * m * 1.6 + c.rgb * .04, max(c.a * m, .0));
  }
  if (uSurf == 2) {
    mat2 R = mat2(.7071, .7071, -.7071, .7071);
    vec2 g = R * p, cell = floor(g / uCell) * uCell + uCell * .5;
    vec4 c = picture((transpose(R) * cell) / uRes);
    float lum = lumOf(c.rgb), rad = sqrt(lum) * .62;
    float m = smoothstep(rad + .06, rad - .06, length((g - cell) / uCell));
    return vec4(c.rgb / max(lum, .2) * m * min(1., lum * 1.6 + .25), c.a * m);
  }
  if (uSurf == 3) {
    vec2 sz = vec2(uCell * .62, uCell), id = floor(p / sz), f = fract(p / sz);
    vec4 c = picture((id + .5) * sz / uRes);
    float lum = lumOf(c.rgb), gi = min(9., floor(sqrt(clamp((lum - .08) / .92, 0., 1.)) * 10.));
    float g = texture(uGlyph, vec2((gi + f.x) / 10., 1. - f.y)).a;
    vec3 col = c.rgb / max(lum, .05) * min(1., lum * 1.3 + .3);
    return vec4(col * g, g * min(1., c.a * 1.5));
  }
  if (uSurf == 4) {
    vec2 d = uv - .5; vec2 cuv = .5 + d * (1. + dot(d, d) * .18);
    if (cuv.x < 0. || cuv.x > 1. || cuv.y < 0. || cuv.y > 1.) return vec4(0.);
    vec4 c = picture(cuv);
    float line = uCell * .4, sl = .55 + .45 * sin(cuv.y * uRes.y / line * 3.14159);
    float sub = mod(floor(p.x / max(1., uCell * .18)), 3.);
    vec3 mask = sub < 1. ? vec3(1., .55, .55) : sub < 2. ? vec3(.55, 1., .55) : vec3(.55, .55, 1.);
    vec2 e = smoothstep(0., .04, cuv) * smoothstep(1., .96, cuv);
    float k = e.x * e.y;
    return vec4(c.rgb * sl * mask * 1.35 * k, c.a * k);
  }
  if (uSurf == 5) {
    vec4 c = picture(uv);
    float l = c.a > .001 ? dot(c.rgb / c.a, vec3(.35, .5, .15)) * c.a : 0.;
    return vec4(thermal(clamp(l * 1.2, 0., 1.)), 1.);
  }
  if (uSurf == 6) {
    float sz = uCell * 2.2; vec2 g = p / sz, id = floor(g);
    float d1 = 9., d2 = 9.; vec2 best = vec2(0.);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 n = id + vec2(x, y), site = n + .2 + .6 * vec2(hash(n), hash(n + 7.31));
      float d = length(g - site);
      if (d < d1) { d2 = d1; d1 = d; best = site; } else if (d < d2) d2 = d;
    }
    vec4 c = picture(best * sz / uRes);
    float grout = smoothstep(.02, .08, d2 - d1);
    return vec4(c.rgb * (.85 + .15 * (1. - d1)) * grout, c.a * grout);
  }
  return picture(uv);
}
vec3 gradeOf(float l){
  if (uGrade == 1) return mix(vec3(.07, .01, .12), vec3(1., .6, .24), l);
  if (uGrade == 2) return mix(vec3(0., .04, .09), vec3(.37, .95, 1.), l);
  if (uGrade == 3) return mix(vec3(.05, 0., .1), vec3(.78, 1., 0.), l);
  return vec3(l);
}
void main(){
  vec2 uv = vUv;
  vec4 c = uSurf == 0 ? picture(uv) : surface(uv);
  if (uSurf != 0 && uSurfMix < 1.) c = mix(picture(uv), c, uSurfMix);
  if (uLens == 6) {
    // Pixel sort: bright pixels drip down in streaks of uneven length.
    float col = hash(vec2(floor(uv.x * uRes.x / 2.), 3.1)), stepY = .0045 * uShock * (.4 + col);
    vec4 acc = vec4(0.);
    for (int i = 1; i <= 20; i++) {
      vec4 b = px(uv + vec2(0., float(i) * stepY));
      float keep = step(.45, lumOf(b.rgb)) * (1. - float(i) / 21.);
      acc = max(acc, b * keep);
    }
    c = max(c, acc);
  }
  if (uGrade != 0 && uGradeAmt > 0.) {
    vec3 rgb = c.rgb / max(c.a, 1e-3);
    float l = dot(rgb, vec3(.3, .55, .15));
    c.rgb = mix(c.rgb, gradeOf(clamp(l, 0., 1.)) * c.a, uGradeAmt);
  }
  if (uGrain > 0.) {
    float n = (hash(uv * uRes + fract(uT * 7.3) * 91.) - .5) * uGrain * .35;
    c.rgb = max(c.rgb + n * max(c.a, .3), 0.); c.a = max(c.a, max(n, 0.));
  }
  if (uVig > 0.) {
    vec2 d = (uv - .5) * vec2(asp(), 1.) / max(asp(), 1.);
    float v = clamp(smoothstep(.25, .85, length(d) * 1.2) * uVig, 0., 1.);
    c = c * (1. - v) + vec4(0., 0., 0., v);
  }
  o = c;
}`;

export class GpuFx {
  readonly canvas = document.createElement('canvas');
  readonly ok: boolean;
  private gl: WebGL2RenderingContext | null;
  private feed!: WebGLProgram;
  private main!: WebGLProgram;
  private u = new Map<string, WebGLUniformLocation | null>();
  private src!: WebGLTexture;
  private glyph!: WebGLTexture;
  private bufs: { f: WebGLFramebuffer; t: WebGLTexture }[] = [];
  private flip = 0;
  private bw = 0;
  private bh = 0;
  private fresh = true;

  constructor() {
    this.canvas.className = 'lens gpu-fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    this.gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    this.ok = !!this.gl && this.init();
  }

  private prog(fs: string, name: string) {
    const gl = this.gl!;
    const p = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const info = gl.getActiveUniform(p, i)!;
      this.u.set(`${name}.${info.name}`, gl.getUniformLocation(p, info.name));
    }
    return p;
  }

  private tex() {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private init() {
    const gl = this.gl!;
    try {
      this.feed = this.prog(FS_FEED, 'feed');
      this.main = this.prog(FS_MAIN, 'main');
    } catch (e) {
      console.warn('GPU looks unavailable:', e);
      return false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.src = this.tex();
    // The ASCII glyphs, one row, white on clear.
    const a = document.createElement('canvas');
    a.width = GLYPHS.length * 32;
    a.height = 32;
    const g = a.getContext('2d')!;
    g.fillStyle = '#fff';
    g.font = 'bold 30px ui-monospace, Menlo, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [...GLYPHS].forEach((ch, i) => g.fillText(ch, i * 32 + 16, 17));
    this.glyph = this.tex();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a);
    for (let i = 0; i < 2; i++) this.bufs.push({ f: gl.createFramebuffer()!, t: this.tex() });
    return true;
  }

  private size(w: number, h: number) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.bw === w && this.bh === h) return;
    const gl = this.gl!;
    this.bw = w;
    this.bh = h;
    for (const b of this.bufs) {
      gl.bindTexture(gl.TEXTURE_2D, b.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, b.t, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Forget the feedback trail (after a big jump such as a scene change). */
  reset() {
    this.fresh = true;
  }

  render(source: HTMLCanvasElement, P: GpuFxParams, F: GpuFxFrame) {
    const gl = this.gl;
    if (!gl || !this.ok) return;
    const w = source.width;
    const h = source.height;
    if (!w || !h) return;
    this.size(w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.viewport(0, 0, w, h);
    const u = (k: string) => this.u.get(k) ?? null;
    let input = this.src;
    if (P.feedback !== 'off') {
      if (this.fresh) {
        for (const b of this.bufs) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, b.f);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        this.fresh = false;
      }
      const prev = this.bufs[this.flip];
      const next = this.bufs[1 - this.flip];
      gl.bindFramebuffer(gl.FRAMEBUFFER, next.f);
      gl.useProgram(this.feed);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prev.t);
      gl.uniform1i(u('feed.uSrc'), 0);
      gl.uniform1i(u('feed.uPrev'), 1);
      gl.uniform2f(u('feed.uRes'), w, h);
      gl.uniform1f(u('feed.uT'), F.t);
      gl.uniform1i(u('feed.uMode'), FEED_ID[P.feedback]);
      gl.uniform1f(u('feed.uZoom'), P.zoom);
      gl.uniform1f(u('feed.uSpin'), P.spin);
      gl.uniform1f(u('feed.uFlow'), P.flow);
      gl.uniform1f(u('feed.uLen'), P.length);
      gl.uniform1f(u('feed.uKick'), F.kick);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.flip = 1 - this.flip;
      input = next.t;
    } else this.fresh = true;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.main);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(u('main.uSrc'), 0);
    gl.uniform2f(u('main.uRes'), w, h);
    gl.uniform1f(u('main.uT'), F.t);
    gl.uniform1i(u('main.uLens'), LENS_ID[P.lens]);
    gl.uniform1i(u('main.uSurf'), SURF_ID[P.surface]);
    gl.uniform1i(u('main.uGrade'), GRADE_ID[P.grade]);
    gl.uniform1i(u('main.uCount'), Math.max(1, Math.min(4, Math.round(P.count))));
    gl.uniform1f(u('main.uRays'), P.rays);
    gl.uniform1f(u('main.uLensMix'), P.lensMix);
    gl.uniform1f(u('main.uSurfMix'), P.surfMix);
    gl.uniform1f(u('main.uGradeAmt'), P.gradeAmt);
    gl.uniform1f(u('main.uGrain'), P.grain);
    gl.uniform1f(u('main.uVig'), P.vignette);
    gl.uniform2fv(u('main.uPtrs[0]'), new Float32Array([...F.ptrs, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 8)));
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.glyph);
    gl.uniform1i(u('main.uGlyph'), 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u('main.uBloom'), P.bloom);
    gl.uniform1f(u('main.uSpread'), P.spread);
    gl.uniform1f(u('main.uSplit'), P.split);
    gl.uniform1f(u('main.uSize'), P.lensSize);
    gl.uniform1f(u('main.uBend'), P.bend);
    gl.uniform1f(u('main.uShock'), P.shock);
    gl.uniform1f(u('main.uSlices'), P.slices);
    gl.uniform1f(u('main.uCell'), Math.max(2, P.cell));
    gl.uniform1f(u('main.uKick'), F.kick);
    gl.uniform2f(u('main.uPtr'), F.ptr[0], F.ptr[1]);
    gl.uniform3f(u('main.uWave'), F.wave[0], F.wave[1], F.wave[2]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
