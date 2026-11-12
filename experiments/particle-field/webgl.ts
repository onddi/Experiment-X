// WebGL renderer. Particles are collected during the frame as sprites (a
// cell of one atlas texture each: glow, circles, squares, triangles…) and
// drawn by the GPU in one instanced call, each with its own size, stretch and
// turn.
//
// Two ways to use it:
//   copy  the sprites are drawn into this (hidden) canvas and laid onto the
//         2D canvas with one drawImage; trails, lenses and the rest stay 2D.
//   only  the picture lives on the GPU: a texture that is faded for the
//         trails, the sprites land on it, and it is shown on this canvas
//         (put over the 2D one). Whatever is still drawn in 2D (some styles,
//         markers) is laid on top of it from the 2D canvas, only on frames
//         where something was drawn there.
//
// A new palette makes new sprite canvases; when the atlas is full it starts over.

const CELL = 48;
// Each cell sits in a slot with a clear margin, so the smaller (mipmap)
// copies of one sprite don't pick up the edges of its neighbours.
const PAD = 8;
const SLOT = CELL + PAD * 2;
const ATLAS = 2048;
const PER_ROW = (ATLAS / SLOT) | 0;
const MAX_CELLS = PER_ROW * PER_ROW;
// Per instance: x, y, width, height, angle, alpha, cell u, cell v.
const STRIDE = 8;

const VS = `#version 300 es
in vec2 corner;
in vec4 inst; // x, y, width, height (CSS px)
in vec2 turn; // angle, alpha
in vec2 cell; // atlas cell origin, 0..1
uniform vec2 view; // canvas size in CSS px
out vec2 uv;
out float alpha;
void main() {
  vec2 l = (corner - 0.5) * inst.zw;
  float c = cos(turn.x);
  float s = sin(turn.x);
  vec2 p = inst.xy + vec2(l.x * c - l.y * s, l.x * s + l.y * c);
  gl_Position = vec4(p / view * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  uv = cell + corner * ${(CELL / ATLAS).toFixed(8)};
  alpha = turn.y;
}`;
const FS = `#version 300 es
precision mediump float;
in vec2 uv;
in float alpha;
uniform sampler2D atlas;
out vec4 col;
void main() {
  col = texture(atlas, uv) * alpha;
}`;

// Full-screen quads: a flat colour (fades, flashes) or a texture (a layer).
const QUAD_VS = `#version 300 es
in vec2 corner;
uniform float flip;
out vec2 uv;
void main() {
  uv = vec2(corner.x, flip > 0.5 ? 1.0 - corner.y : corner.y);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;
const FILL_FS = `#version 300 es
precision mediump float;
uniform vec4 col;
out vec4 o;
void main() { o = col; }`;
const TEX_FS = `#version 300 es
precision mediump float;
in vec2 uv;
uniform sampler2D tex;
out vec4 o;
void main() { o = texture(tex, uv); }`;

export type Blend = 'over' | 'add' | 'multiply' | 'copy';

export class GLSprites {
  readonly canvas = document.createElement('canvas');
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private buf: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private data = new Float32Array(4096 * STRIDE);
  private count = 0;
  private cells = new Map<HTMLCanvasElement, number>();
  private uView: WebGLUniformLocation;
  private fillProg: WebGLProgram;
  private uCol: WebGLUniformLocation;
  private uFlipFill: WebGLUniformLocation;
  private texProg: WebGLProgram;
  private uFlipTex: WebGLUniformLocation;
  private quadVao: WebGLVertexArrayObject;
  // The picture in "only" mode, and a texture for 2D layers laid onto it.
  private pic: WebGLTexture | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private picW = 0;
  private picH = 0;
  private layerTex: WebGLTexture | null = null;
  /** Draw into the GPU picture (only mode) instead of this canvas (copy mode). */
  only = false;
  blend: Blend = 'over';

  static create(): GLSprites | null {
    try {
      return new GLSprites();
    } catch {
      return null;
    }
  }

  private constructor() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const link = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'corner');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
      return p;
    };
    this.prog = link(VS, FS);
    this.fillProg = link(QUAD_VS, FILL_FS);
    this.texProg = link(QUAD_VS, TEX_FS);
    this.uCol = gl.getUniformLocation(this.fillProg, 'col')!;
    this.uFlipFill = gl.getUniformLocation(this.fillProg, 'flip')!;
    this.uFlipTex = gl.getUniformLocation(this.texProg, 'flip')!;
    this.uView = gl.getUniformLocation(this.prog, 'view')!;
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const attr = (name: string, size: number, off: number) => {
      const a = gl.getAttribLocation(this.prog, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, size, gl.FLOAT, false, STRIDE * 4, off * 4);
      gl.vertexAttribDivisor(a, 1);
    };
    attr('inst', 4, 0);
    attr('turn', 2, 4);
    attr('cell', 2, 6);
    gl.bindVertexArray(null);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    // Down to 6 px copies: the 8 px margin is still a texel there.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  private cellOf(img: HTMLCanvasElement) {
    let c = this.cells.get(img);
    if (c !== undefined) return c;
    if (this.cells.size >= MAX_CELLS) this.cells.clear();
    c = this.cells.size;
    this.cells.set(img, c);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // Sprites are drawn into a 48px canvas with a little margin; scale to the cell.
    if (img.width === CELL && img.height === CELL) gl.texSubImage2D(gl.TEXTURE_2D, 0, (c % PER_ROW) * SLOT + PAD, ((c / PER_ROW) | 0) * SLOT + PAD, gl.RGBA, gl.UNSIGNED_BYTE, img);
    else {
      const t = document.createElement('canvas');
      t.width = t.height = CELL;
      t.getContext('2d')!.drawImage(img, 0, 0, CELL, CELL);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, (c % PER_ROW) * SLOT + PAD, ((c / PER_ROW) | 0) * SLOT + PAD, gl.RGBA, gl.UNSIGNED_BYTE, t);
    }
    this.mipsDirty = true;
    return c;
  }
  private mipsDirty = false;

  /** Queue one sprite, centred on x, y (CSS px), d px across. */
  push(img: HTMLCanvasElement, x: number, y: number, d: number, alpha: number) {
    this.pushR(img, x, y, d, d, 0, alpha);
  }

  /** Queue one sprite, centred on x, y, sw × sh px, turned by angle (radians). */
  pushR(img: HTMLCanvasElement, x: number, y: number, sw: number, sh: number, angle: number, alpha: number) {
    if (this.count * STRIDE >= this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const c = this.cellOf(img);
    const o = this.count++ * STRIDE;
    const D = this.data;
    D[o] = x;
    D[o + 1] = y;
    D[o + 2] = sw;
    D[o + 3] = sh;
    D[o + 4] = angle;
    D[o + 5] = alpha;
    D[o + 6] = ((c % PER_ROW) * SLOT + PAD) / ATLAS;
    D[o + 7] = (((c / PER_ROW) | 0) * SLOT + PAD) / ATLAS;
  }

  get pending() {
    return this.count;
  }

  private fit(cw: number, ch: number) {
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
  }

  private setBlend(b: Blend) {
    const gl = this.gl;
    if (b === 'copy') return gl.disable(gl.BLEND);
    gl.enable(gl.BLEND);
    // Premultiplied colours throughout.
    if (b === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else if (b === 'multiply') gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  // --- the GPU picture (only mode) --------------------------------------------

  /** Make sure the picture texture matches the canvas size; true if it was (re)made. */
  private ensurePic(cw: number, ch: number) {
    const gl = this.gl;
    this.fit(cw, ch);
    if (this.pic && this.picW === cw && this.picH === ch) return false;
    if (!this.pic) {
      this.pic = gl.createTexture()!;
      this.fbo = gl.createFramebuffer()!;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.pic);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // Linear: lenses and feedback effects draw it scaled and turned.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pic, 0);
    this.picW = cw;
    this.picH = ch;
    return true;
  }

  private toPic(cw: number, ch: number) {
    const fresh = this.ensurePic(cw, ch);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, cw, ch);
    return fresh;
  }

  /** Paint the whole picture with a colour at this opacity (trail fade, flash). */
  fill(cw: number, ch: number, r: number, g: number, b: number, a: number) {
    const gl = this.gl;
    if (this.toPic(cw, ch)) this.clearPic(r, g, b);
    gl.useProgram(this.fillProg);
    gl.bindVertexArray(this.quadVao);
    this.setBlend('over');
    gl.uniform1f(this.uFlipFill, 0);
    gl.uniform4f(this.uCol, (r / 255) * a, (g / 255) * a, (b / 255) * a, a);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private clearPic(r: number, g: number, b: number) {
    const gl = this.gl;
    gl.clearColor(r / 255, g / 255, b / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Start the picture from a solid background. */
  reset(cw: number, ch: number, r: number, g: number, b: number) {
    this.toPic(cw, ch);
    this.clearPic(r, g, b);
  }

  /** Lay a 2D canvas onto the picture ('copy' replaces it: used to carry the 2D picture over). */
  layer(src: HTMLCanvasElement, blend: Blend) {
    const gl = this.gl;
    const cw = src.width;
    const ch = src.height;
    this.toPic(cw, ch);
    if (!this.layerTex) {
      this.layerTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.useProgram(this.texProg);
    gl.bindVertexArray(this.quadVao);
    // Canvas rows run top-down; the picture's run bottom-up.
    gl.uniform1f(this.uFlipTex, 1);
    this.setBlend(blend);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Show the picture on this canvas. Also makes it readable (drawImage) until the task ends. */
  present() {
    if (!this.pic) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.picW, this.picH);
    gl.useProgram(this.texProg);
    gl.bindVertexArray(this.quadVao);
    gl.bindTexture(gl.TEXTURE_2D, this.pic);
    gl.uniform1f(this.uFlipTex, 0);
    this.setBlend('copy');
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** The picture as a target for effects (only mode), sized to the canvas. */
  picture(cw: number, ch: number) {
    if (this.toPic(cw, ch)) this.clearPic(0, 0, 0);
    return { tex: this.pic!, fbo: this.fbo!, w: cw, h: ch };
  }

  /** Free the picture (leaving only mode). */
  drop() {
    const gl = this.gl;
    if (this.pic) gl.deleteTexture(this.pic);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.layerTex) gl.deleteTexture(this.layerTex);
    this.pic = this.fbo = this.layerTex = null;
    this.picW = this.picH = 0;
  }

  /**
   * Draw what was queued. Only mode: onto the GPU picture. Copy mode: into
   * this canvas, then laid onto ctx (in its current composite mode).
   */
  flush(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.count) return;
    const gl = this.gl;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    if (this.only) this.toPic(cw, ch);
    else {
      this.fit(cw, ch);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uView, w, h);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // Small particles sample the smaller copies, like the 2D canvas's smoothing.
    if (this.mipsDirty) {
      gl.generateMipmap(gl.TEXTURE_2D);
      this.mipsDirty = false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * STRIDE), gl.STREAM_DRAW);
    // Copy mode draws onto a clear canvas; the composite happens in the drawImage.
    this.setBlend(this.only ? this.blend : this.blend === 'add' ? 'add' : 'over');
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    this.count = 0;
    if (this.only) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.canvas, 0, 0, cw, ch);
    ctx.restore();
  }
}
