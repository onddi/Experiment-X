// WebGL sprite renderer. The 2D canvas stamps each soft particle (glow,
// circles, bokeh, sparkles, stars, embers…) with its own drawImage call; here
// they are collected during the frame and drawn by the GPU in one call into
// a hidden WebGL canvas, which is then laid onto the 2D canvas with a single
// drawImage. Everything else (trails, lenses, lines, glyphs) stays 2D.
//
// Sprites live in one atlas texture, a cell per sprite canvas. A new palette
// makes new sprite canvases; when the atlas is full it starts over.

const CELL = 48;
const ATLAS = 2048;
const PER_ROW = ATLAS / CELL;
const MAX_CELLS = PER_ROW * PER_ROW;
// Per instance: x, y, size, alpha, cell u, cell v.
const STRIDE = 6;

const VS = `#version 300 es
in vec2 corner;
in vec4 inst; // x, y, size, alpha
in vec2 cell; // atlas cell origin, 0..1
uniform vec2 view; // canvas size in CSS px
out vec2 uv;
out float alpha;
void main() {
  vec2 p = inst.xy + (corner - 0.5) * inst.z;
  gl_Position = vec4(p / view * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  uv = cell + corner * ${(CELL / ATLAS).toFixed(8)};
  alpha = inst.w;
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

const FADE_VS = `#version 300 es
in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;
const FADE_FS = `#version 300 es
precision mediump float;
uniform vec4 col;
out vec4 o;
void main() { o = col; }`;

export class GLSprites {
  readonly canvas = document.createElement('canvas');
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private buf: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private data = new Float32Array(4096 * STRIDE);
  private count = 0;
  private cells = new Map<HTMLCanvasElement, number>();
  private uView: WebGLUniformLocation;
  private fadeProg: WebGLProgram;
  private uCol: WebGLUniformLocation;
  private fadeVao: WebGLVertexArrayObject | null = null;
  additive = false;

  static create(): GLSprites | null {
    try {
      return new GLSprites();
    } catch {
      return null;
    }
  }

  private constructor() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    this.prog = prog;
    const fp = gl.createProgram()!;
    gl.attachShader(fp, sh(gl.VERTEX_SHADER, FADE_VS));
    gl.attachShader(fp, sh(gl.FRAGMENT_SHADER, FADE_FS));
    gl.linkProgram(fp);
    if (!gl.getProgramParameter(fp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(fp) ?? 'link');
    this.fadeProg = fp;
    this.uCol = gl.getUniformLocation(fp, 'col')!;
    this.uView = gl.getUniformLocation(prog, 'view')!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const aCorner = gl.getAttribLocation(prog, 'corner');
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const aInst = gl.getAttribLocation(prog, 'inst');
    const aCell = gl.getAttribLocation(prog, 'cell');
    gl.enableVertexAttribArray(aInst);
    gl.vertexAttribPointer(aInst, 4, gl.FLOAT, false, STRIDE * 4, 0);
    gl.vertexAttribDivisor(aInst, 1);
    gl.enableVertexAttribArray(aCell);
    gl.vertexAttribPointer(aCell, 2, gl.FLOAT, false, STRIDE * 4, 16);
    gl.vertexAttribDivisor(aCell, 1);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
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
    if (img.width === CELL && img.height === CELL) gl.texSubImage2D(gl.TEXTURE_2D, 0, (c % PER_ROW) * CELL, ((c / PER_ROW) | 0) * CELL, gl.RGBA, gl.UNSIGNED_BYTE, img);
    else {
      const t = document.createElement('canvas');
      t.width = t.height = CELL;
      t.getContext('2d')!.drawImage(img, 0, 0, CELL, CELL);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, (c % PER_ROW) * CELL, ((c / PER_ROW) | 0) * CELL, gl.RGBA, gl.UNSIGNED_BYTE, t);
    }
    this.mipsDirty = true;
    return c;
  }
  private mipsDirty = false;

  /** Queue one sprite, centred on x, y (CSS px), d px across. */
  push(img: HTMLCanvasElement, x: number, y: number, d: number, alpha: number) {
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
    D[o + 2] = d;
    D[o + 3] = alpha;
    D[o + 4] = ((c % PER_ROW) * CELL) / ATLAS;
    D[o + 5] = (((c / PER_ROW) | 0) * CELL) / ATLAS;
  }

  private fit(cw: number, ch: number) {
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.gl.viewport(0, 0, cw, ch);
  }

  /** Direct mode: fill the kept frame with the background at this opacity (the trail fade). */
  fade(cw: number, ch: number, r: number, g: number, b: number, a: number) {
    const gl = this.gl;
    this.fit(cw, ch);
    if (!this.fadeVao) {
      this.fadeVao = gl.createVertexArray()!;
      gl.bindVertexArray(this.fadeVao);
      const q = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, q);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      const at = gl.getAttribLocation(this.fadeProg, 'corner');
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    }
    gl.useProgram(this.fadeProg);
    gl.bindVertexArray(this.fadeVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform4f(this.uCol, (r / 255) * a, (g / 255) * a, (b / 255) * a, a);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Direct mode: start from a solid background. */
  reset(cw: number, ch: number, r: number, g: number, b: number) {
    const gl = this.gl;
    this.fit(cw, ch);
    gl.clearColor(r / 255, g / 255, b / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  get pending() {
    return this.count;
  }

  /** Draw what was queued and lay it onto ctx (in its current composite mode). */
  // direct: draw onto the kept frame shown on screen (no clear, no copy).
  flush(ctx: CanvasRenderingContext2D, w: number, h: number, direct = false) {
    if (!this.count) return;
    const gl = this.gl;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    this.fit(cw, ch);
    if (!direct) {
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
    gl.enable(gl.BLEND);
    // Premultiplied: additive for glow ('lighter'), over for the rest.
    if (this.additive) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    this.count = 0;
    if (direct) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.canvas, 0, 0, cw, ch);
    ctx.restore();
  }
}
