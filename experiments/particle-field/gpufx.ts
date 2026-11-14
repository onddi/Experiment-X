// GPU looks over the finished frame (the FX folder): light (bloom, colour
// split), feedback (tunnel, smear), lenses (glass, shockwave, kaleido) and
// surface (LED wall, halftone). One WebGL2 canvas sits over the field; each
// frame it takes the picture as a texture and shades it. Feedback keeps its
// own buffer, so it keeps the look before light and surface are added.

export type GpuFxParams = {
  bloom: number; spread: number; split: number;
  feedback: 'off' | 'tunnel' | 'smear'; zoom: number; spin: number; flow: number; length: number;
  lens: 'off' | 'glass' | 'shock' | 'kaleido'; lensSize: number; bend: number; shock: number; slices: number;
  surface: 'off' | 'led' | 'halftone'; cell: number;
};
export type GpuFxFrame = { t: number; kick: number; ptr: [number, number]; wave: [number, number, number] };

const VS = `#version 300 es
in vec2 p; out vec2 vUv; void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes;
uniform float uT;
float asp(){ return uRes.x / uRes.y; }
vec2 turn(vec2 uv, float a, float z){ vec2 p = uv - .5; p.x *= asp(); float c = cos(a), s = sin(a); p = mat2(c, s, -s, c) * p / z; p.x /= asp(); return p + .5; }
`;

// Pass 1 (only with feedback on): the picture mixed with the last frame.
const FS_FEED = COMMON + `
uniform sampler2D uSrc, uPrev; uniform int uMode; uniform float uZoom, uSpin, uFlow, uLen, uKick;
void main(){
  vec4 now = texture(uSrc, vUv);
  vec4 prev;
  if (uMode == 1) prev = texture(uPrev, turn(vUv, uSpin * .05, 1. + (uZoom + uKick * .5) * .05)) * uLen;
  else {
    vec2 v = vec2(sin(vUv.y * 7. + uT * .4), cos(vUv.x * 6. - uT * .3)) * .0035 * (uFlow + uKick);
    prev = texture(uPrev, vUv - v) * uLen;
  }
  o = max(now, prev);
}`;

// Pass 2: lenses bend where we read, light and surface change what we show.
const FS_MAIN = COMMON + `
uniform sampler2D uSrc;
uniform int uLens, uSurf;
uniform float uBloom, uSpread, uSplit, uSize, uBend, uShock, uSlices, uCell, uKick;
uniform vec2 uPtr; uniform vec3 uWave;
vec4 px(vec2 uv){ return texture(uSrc, clamp(uv, .0005, .9995)); }
vec2 warp(vec2 uv, out vec2 fringe, out float rim){
  fringe = vec2(0.); rim = 0.;
  if (uLens == 3) {
    vec2 p = uv - .5; p.x *= asp(); float seg = 6.28318 / floor(uSlices);
    float a = mod(atan(p.y, p.x) + uT * .08, seg), l = length(p);
    a = abs(a - seg * .5); p = vec2(cos(a), sin(a)) * l; p.x /= asp();
    return p * .9 + vec2(.5, .42);
  }
  if (uLens == 1) {
    vec2 d = uv - uPtr; d.x *= asp(); float r = uSize * .22 * (1. + uKick * .15), l = length(d);
    if (l >= r) { rim = -.25 * uBend * exp(-(l - r) * 30.); return uv; }
    float k = l / r, m = mix(1., .35 + .65 * k * k, uBend);
    vec2 q = d * m; q.x /= asp();
    vec2 n = normalize(d + 1e-5); n.x /= asp();
    fringe = n * smoothstep(.7, 1., k) * .012 * uBend;
    rim = (smoothstep(.9, 1., k) * .35 + pow(max(0., 1. - length(d / r - vec2(-.35, .35))), 6.) * .25) * uBend;
    return uPtr + q;
  }
  if (uLens == 2) {
    vec2 d = uv - uWave.xy; d.x *= asp(); float t = uT - uWave.z, l = length(d), R = t * .7;
    float w = exp(-pow((l - R) * 22., 2.)) * exp(-t * 1.6);
    vec2 n = normalize(d + 1e-5); n.x /= asp();
    fringe = n * w * .006 * min(uShock, 1.); rim = w * .25 * uShock;
    return uv - n * w * .05 * uShock;
  }
  return uv;
}
vec4 shade(vec2 uv){
  vec2 fringe; float rim;
  vec2 q = warp(uv, fringe, rim);
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
    c = vec4(mix(c.rgb, tm, amt), max(c.a, amt * max(tm.r, max(tm.g, tm.b))));
  }
  c.rgb += rim; c.a = max(c.a, rim);
  return c;
}
void main(){
  vec2 uv = vUv;
  if (uSurf == 1) {
    vec2 p = uv * uRes, cell = floor(p / uCell) * uCell + uCell * .5;
    vec4 c = shade(cell / uRes); float m = smoothstep(.48, .3, length((p - cell) / uCell));
    o = vec4(c.rgb * m * 1.6 + c.rgb * .04, max(c.a * m, .0)); return;
  }
  if (uSurf == 2) {
    vec2 p = uv * uRes; mat2 R = mat2(.7071, .7071, -.7071, .7071);
    vec2 g = R * p, cell = floor(g / uCell) * uCell + uCell * .5;
    vec4 c = shade((transpose(R) * cell) / uRes);
    float lum = max(c.r, max(c.g, c.b)), rad = sqrt(lum) * .62;
    float m = smoothstep(rad + .06, rad - .06, length((g - cell) / uCell));
    o = vec4(c.rgb / max(lum, .2) * m * min(1., lum * 1.6 + .25), c.a * m); return;
  }
  o = shade(uv);
}`;

export class GpuFx {
  readonly canvas = document.createElement('canvas');
  readonly ok: boolean;
  private gl: WebGL2RenderingContext | null;
  private feed!: WebGLProgram;
  private main!: WebGLProgram;
  private u = new Map<string, WebGLUniformLocation | null>();
  private src!: WebGLTexture;
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
      gl.uniform1i(u('feed.uMode'), P.feedback === 'tunnel' ? 1 : 2);
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
    gl.uniform1i(u('main.uLens'), ({ off: 0, glass: 1, shock: 2, kaleido: 3 } as const)[P.lens]);
    gl.uniform1i(u('main.uSurf'), ({ off: 0, led: 1, halftone: 2 } as const)[P.surface]);
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
