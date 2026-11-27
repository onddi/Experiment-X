// GPU looks over the finished frame (the FX folder): light (bloom, colour
// split), feedback (tunnel, smear), lenses (glass, shockwave, kaleido) and
// surface (LED wall, halftone). One WebGL2 canvas sits over the field; each
// frame it takes the picture as a texture and shades it. Feedback keeps its
// own buffer, so it keeps the look before light and surface are added.

export type GpuFxParams = {
  bloom: number; spread: number; split: number; rays: number; flare: number; tint: [number, number, number];
  feedback: 'off' | 'tunnel' | 'smear' | 'mirror' | 'melt' | 'spiral' | 'spread'; zoom: number; spin: number; flow: number; length: number; warp: number; warpBy: 'noise' | 'field';
  lens: 'off' | 'glass' | 'shock' | 'kaleido' | 'liquid' | 'fisheye' | 'sort' | 'twirl' | 'pinch' | 'bulge' | 'tilt' | 'mirrorx' | 'mirrory' | 'quad' | 'repeat' | 'wave' | 'fan' | 'shatter' | 'zoom';
  lensSize: number; bend: number; shock: number; slices: number; lensMix: number; count: number;
  surface: 'off' | 'led' | 'halftone' | 'ascii' | 'crt' | 'thermal' | 'mosaic' | 'stitch' | 'lego' | 'vhs' | 'oil' | 'neon'; cell: number; surfMix: number;
  grade: 'off' | 'sunset' | 'ocean' | 'acid' | 'mono' | 'scene'; gradeAmt: number; gradeA: [number, number, number]; gradeB: [number, number, number];
  grain: number; vignette: number; poster: number; hue: number; invert: number;
  blur: 'off' | 'zoom' | 'spin' | 'motion'; blurAmt: number; blurAt: [number, number]; blurAngle: number; exposure: number; contrast: number; saturation: number;
  displace: number; haze: number; echo: number; echoDelay: number; echoSpread: number; glitch: number; glitchBlock: number; glitchSeed: number;
};
/** ptrs: up to four glass lens centres (0–1, y up); ptr: the finger (or a drifting point).
 * kick (light), kickF (feedback, echo), kickL (lenses, displace), kickS (surface): 0..1 music pushes. */
export type GpuFxFrame = { t: number; kick: number; kickF: number; kickL: number; kickS: number; ptr: [number, number]; ptrs: number[]; wave: [number, number, number] };

const LENS_ID = { off: 0, glass: 1, shock: 2, kaleido: 3, liquid: 4, fisheye: 5, sort: 6, twirl: 7, pinch: 8, bulge: 9, tilt: 10, mirrorx: 11, mirrory: 12, quad: 13, repeat: 14, wave: 15, fan: 16, shatter: 17, zoom: 18 } as const;
const SURF_ID = { off: 0, led: 1, halftone: 2, ascii: 3, crt: 4, thermal: 5, mosaic: 6, stitch: 7, lego: 8, vhs: 9, oil: 10, neon: 11 } as const;
const FEED_ID = { off: 0, tunnel: 1, smear: 2, mirror: 3, melt: 4, spiral: 5, spread: 6 } as const;
const BLUR_ID = { off: 0, zoom: 1, spin: 2, motion: 3 } as const;
const GRADE_ID = { off: 0, sunset: 1, ocean: 2, acid: 3, mono: 4, scene: 5 } as const;
// ASCII glyphs, darkest to brightest.
const GLYPHS = ' .:-=+*#%@';
const ECHO_SLOTS = 6;

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
vec3 hueTurn(vec3 c, float a){ const vec3 k = vec3(.57735); float co = cos(a); return c * co + cross(k, c) * sin(a) + k * dot(k, c) * (1. - co); }
`;

const FS_COPY = COMMON + `
uniform sampler2D uSrc;
void main(){ o = texture(uSrc, vUv); }`;

// Pass 1 (only with feedback on): the picture mixed with the last frame.
const FS_FEED = COMMON + `
uniform sampler2D uSrc, uPrev; uniform int uMode, uWarpBy; uniform float uZoom, uSpin, uFlow, uLen, uKick, uWarp;
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1.)), f.x), f.y); }
float lumN(vec2 uv){ return dot(texture(uSrc, uv).rgb, vec3(.3, .55, .15)); }
void main(){
  vec4 now = texture(uSrc, vUv);
  vec4 prev;
  // Warp: the old frame is read from a bent place, so trails curl. Noise: a
  // slow drifting pattern. Field: around the particles, swirling past them.
  vec2 uv = vUv;
  if (uWarp > 0.) {
    vec2 d;
    if (uWarpBy == 1) {
      vec2 e = 6. / uRes;
      vec2 g = vec2(lumN(uv + vec2(e.x, 0.)) - lumN(uv - vec2(e.x, 0.)), lumN(uv + vec2(0., e.y)) - lumN(uv - vec2(0., e.y)));
      d = vec2(-g.y, g.x) * 2. + g * .6;
    } else {
      vec2 q = uv * vec2(asp(), 1.) * 3.;
      d = vec2(vn(q + uT * .15) - .5, vn(q + vec2(5.2, 1.3) - uT * .12) - .5);
    }
    uv += d * uWarp * (uWarpBy == 1 ? .015 : .03) * (1. + uKick);
  }
  float z = 1. + (uZoom + uKick * .5) * .05;
  if (uMode == 1) prev = texture(uPrev, turn(uv, uSpin * .05, z));
  else if (uMode == 3) prev = texture(uPrev, turn(vec2(1. - uv.x, uv.y), uSpin * .05, z));
  else if (uMode == 5) { prev = texture(uPrev, turn(uv, uSpin * .05, z)); prev.rgb = max(hueTurn(prev.rgb, .05 + uKick * .1), 0.); }
  else if (uMode == 6) {
    vec2 e = (1.2 + uFlow * 1.5 + uKick * 2.) / uRes;
    prev = (texture(uPrev, uv + vec2(e.x, 0.)) + texture(uPrev, uv - vec2(e.x, 0.)) + texture(uPrev, uv + vec2(0., e.y)) + texture(uPrev, uv - vec2(0., e.y))) * .25;
  } else if (uMode == 4) {
    float col = .35 + .65 * fract(sin(floor(uv.x * uRes.x / 3.) * 12.9898) * 43758.5453);
    prev = texture(uPrev, uv + vec2(0., .004 * (uFlow + uKick) * col));
  } else {
    vec2 v = vec2(sin(uv.y * 7. + uT * .4), cos(uv.x * 6. - uT * .3)) * .0035 * (uFlow + uKick);
    prev = texture(uPrev, uv - v);
  }
  o = max(now, prev * uLen);
}`;

// Pass 2: displace and lenses bend where we read, light and surface change
// what we show, echoes and glitches join in, the grade colours it last.
const FS_MAIN = COMMON + `
uniform sampler2D uSrc, uGlyph, uE0, uE1, uE2, uE3, uE4, uE5;
uniform int uLens, uSurf, uGrade, uCount, uEcho;
uniform float uBloom, uSpread, uSplit, uRays, uFlare, uSize, uBend, uShock, uSlices, uLensMix, uCell, uSurfMix, uGradeAmt, uGrain, uVig;
uniform float uPoster, uHue, uInvert, uDisp, uHaze, uEchoSpread, uGlitch, uBlock, uSeed;
uniform float uKick, uKickL, uKickS, uKickF;
uniform int uBlurMode; uniform float uBlur, uExp, uCon, uSat; uniform vec2 uBlurC, uBlurDir;
uniform vec3 uTint, uGA, uGB;
uniform vec2 uPtr; uniform vec2 uPtrs[4]; uniform vec3 uWave;
vec4 px(vec2 uv){ return texture(uSrc, clamp(uv, .0005, .9995)); }
float lumOf(vec3 c){ return max(c.r, max(c.g, c.b)); }
float lumAt(vec2 uv){ vec4 c = px(uv); return dot(c.rgb, vec3(.3, .55, .15)); }
vec2 displace(vec2 uv){
  if (uDisp > 0.) {
    vec2 e = 2.5 / uRes;
    vec2 g = vec2(lumAt(uv + vec2(e.x, 0.)) - lumAt(uv - vec2(e.x, 0.)), lumAt(uv + vec2(0., e.y)) - lumAt(uv - vec2(0., e.y)));
    uv -= g * uDisp * .045 * (1. + uKickL);
  }
  if (uHaze > 0.) uv += vec2(sin(uv.y * 42. + uT * 3.1 + sin(uv.x * 9.) * 2.), cos(uv.x * 37. - uT * 2.6)) * .0025 * uHaze * (1. + uKickL);
  return uv;
}
vec2 warp(vec2 uv, int lens, out vec2 fringe, out float rim){
  fringe = vec2(0.); rim = 0.;
  if (lens == 3) {
    vec2 p = uv - .5; p.x *= asp(); float seg = 6.28318 / floor(uSlices);
    float a = mod(atan(p.y, p.x) + uT * .08, seg), l = length(p);
    a = abs(a - seg * .5); p = vec2(cos(a), sin(a)) * l; p.x /= asp();
    return p * .9 + vec2(.5, .42);
  }
  if (lens == 1) {
    float r = uSize * .22 * (1. + uKickL * .15) / (1. + float(uCount - 1) * .25);
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
    float a = uShock * (1. + uKickL * 1.5);
    vec2 o2 = vec2(sin(uv.y * 9. + uT * 1.3 + sin(uv.x * 5. + uT * .7) * 1.5), cos(uv.x * 8. - uT * 1.1 + sin(uv.y * 6. - uT * .5) * 1.5));
    fringe = o2 * .002 * a;
    return uv + o2 * .012 * a;
  }
  if (lens == 5) {
    vec2 p = uv - .5; p.x *= asp(); float r2 = dot(p, p), k = uShock * .45 * (1. + uKickL * .3);
    p *= (1. - k * .55) + k * r2 * 1.6; p.x /= asp();
    fringe = p * .01 * k;
    return p + .5;
  }
  if (lens == 7 || lens == 8 || lens == 9) {
    vec2 d = uv - uPtr; d.x *= asp(); float r = length(d);
    if (lens == 7) {
      float a = uShock * 2.6 * (1. + uKickL * .6) * pow(1. - smoothstep(0., .5, r), 2.);
      float c = cos(a), s = sin(a); d = mat2(c, s, -s, c) * d;
    } else {
      float k = smoothstep(.38, 0., r) * (1. + uKickL * .4);
      d *= lens == 8 ? 1. + k * uShock * .6 : 1. - k * uShock * .42;
    }
    d.x /= asp();
    return uPtr + d;
  }
  if (lens == 11) return vec2(.5 - abs(uv.x - .5), uv.y);
  if (lens == 12) return vec2(uv.x, .5 + abs(uv.y - .5));
  if (lens == 13) return vec2(.5 - abs(uv.x - .5), .5 + abs(uv.y - .5));
  // Repeat: the picture as a grid of smaller copies, every other one mirrored so the seams meet.
  if (lens == 14) { vec2 g = uv * floor(uSlices / 2.); vec2 c = floor(g), f = fract(g); return mix(f, 1. - f, mod(c, 2.)); }
  // Wave: thin rows slide sideways on a slow wave, swelling with the music.
  if (lens == 15) {
    float row = floor(uv.y * uRes.y / 3.) * 3. / uRes.y;
    return uv + vec2(sin(row * 6.28318 * uRes.y / 180. + uT * 1.6) * uShock * .035 * (1. + uKickL * 1.5), 0.);
  }
  // Fan: twelve wedges round the centre, every other one turned the other way.
  if (lens == 16) {
    vec2 p = uv - .5; p.x *= asp(); float seg = 6.28318 / 12., a = atan(p.y, p.x), l = length(p);
    float sw = uShock * (.35 * sin(uT * .7) + uKickL * .15) * (mod(floor(a / seg), 2.) * 2. - 1.);
    a += sw; p = vec2(cos(a), sin(a)) * l; p.x /= asp(); p += .5;
    return p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1. ? vec2(-9.) : p;
  }
  // Shatter: the picture broken into shards that drift apart and turn; gaps stay dark.
  if (lens == 17) {
    vec2 grid = vec2(8., 5.), c = floor(uv * grid), cc = (c + .5) / grid;
    float sp = uShock * .5 * (.12 + .05 * sin(uT * 1.1) + uKickL * .9);
    vec2 rnd = vec2(hash(c), hash(c + 7.3)) - .5;
    vec2 q = uv - (cc - .5) * sp * .6 - rnd / grid * sp * 2.;
    vec2 d = q - cc; d.x *= asp(); float r = (hash(c + 3.1) - .5) * sp * 1.5, co = cos(-r), si = sin(-r);
    d = mat2(co, si, -si, co) * d / (1. - sp * .15); d.x /= asp(); q = cc + d;
    if (floor(q * grid) != c) return vec2(-9.);
    return q;
  }
  // Infinite zoom: copies inside copies, falling forever toward the middle.
  if (lens == 18) {
    vec2 p = uv - .5; p.x *= asp(); float r = max(length(p), 1e-4), k = log(1. / .6), R = .5 * min(asp(), 1.);
    float l = log(r / R) / k + uT * (.15 + uShock * .35) + uKickL * .3;
    float f = fract(l), lv = floor(l), a = lv * .08 * uShock;
    p = p / r * R * exp((f - 1.) * k);
    float co = cos(a), si = sin(a); p = mat2(co, si, -si, co) * p;
    p.x /= asp();
    return p + .5;
  }
  return uv;
}
vec4 shade(vec2 uv, int lens){
  vec2 fringe; float rim;
  vec2 q = warp(displace(uv), lens, fringe, rim);
  if (q.x < -5.) return vec4(0.);
  vec4 c = px(q);
  if (lens == 10) {
    // Tilt-shift: sharp along a band at your finger's height, soft above and below.
    float amt = smoothstep(.05, .32, abs(q.y - uPtr.y)) * uShock;
    if (amt > .01) {
      vec4 acc = c;
      for (int i = 1; i < 14; i++) { float fi = float(i), a = fi * 2.39996, r = sqrt(fi / 14.) * amt * .016; acc += px(q + vec2(cos(a) / asp(), sin(a)) * r); }
      c = acc / 14.;
    }
    float l = dot(c.rgb, vec3(.3, .55, .15)); c.rgb = max(mix(vec3(l) * c.a, c.rgb, 1.3), 0.);
  }
  if (uBlurMode > 0 && uBlur > 0.) {
    // Blur: zoom streaks out from a point, spin turns around it, motion smears one way.
    float a = uBlur * (1. + uKickL * 2.);
    vec4 acc = c;
    for (int i = 1; i < 16; i++) {
      float f = float(i) / 15.;
      vec2 s;
      if (uBlurMode == 1) s = (q - uBlurC) * (-f * .16 * a);
      else if (uBlurMode == 2) {
        vec2 d = q - uBlurC; d.x *= asp();
        float an = (f - .5) * .22 * a, co = cos(an), si = sin(an);
        d = mat2(co, si, -si, co) * d; d.x /= asp();
        s = uBlurC + d - q;
      } else s = uBlurDir * (f - .5) * .07 * a;
      acc += px(q + s);
    }
    c = acc / 16.;
  }
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
    vec3 x = (c.rgb * 1.15 + acc / 28. * uTint * uBloom * (9. + uKick * 6.)) * 1.1;
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
  if (uFlare > 0.) {
    // Anamorphic flare: bright spots stretched into long horizontal streaks.
    vec3 acc = vec3(0.);
    for (int i = 1; i <= 16; i++) {
      float fi = float(i), dx = fi * fi * .0016, w = 1. - fi / 17.;
      acc += (max(px(q + vec2(dx, 0.)).rgb - .45, 0.) + max(px(q - vec2(dx, 0.)).rgb - .45, 0.)) * w;
    }
    float l = dot(acc, vec3(.33));
    vec3 add = l * mix(vec3(.45, .7, 1.2), uTint, step(.01, abs(uTint.r - 1.) + abs(uTint.g - 1.) + abs(uTint.b - 1.))) * uFlare * .22 * (1. + uKick);
    c.rgb += add; c.a = max(c.a, min(1., lumOf(add)));
  }
  c.rgb += rim; c.a = max(c.a, rim);
  return c;
}
vec4 echoes(vec2 uv){
  vec4 acc = vec4(0.);
  if (uEcho < 1) return acc;
  float n = float(uEcho);
  for (int i = 1; i <= 6; i++) {
    if (i > uEcho) break;
    float fi = float(i);
    vec2 p = (uv - .5) / (1. + fi * uEchoSpread * .035 * (1. + uKickF)) + .5;
    vec4 e = i == 1 ? texture(uE0, p) : i == 2 ? texture(uE1, p) : i == 3 ? texture(uE2, p) : i == 4 ? texture(uE3, p) : i == 5 ? texture(uE4, p) : texture(uE5, p);
    e.rgb = max(hueTurn(e.rgb, fi * 1.05), 0.);
    acc = max(acc, e * (1. - fi / (n + 1.)) * .85);
  }
  return acc;
}
vec4 picture(vec2 uv){
  vec4 c = shade(uv, uLens);
  if (uLens == 3 && uLensMix < 1.) c = mix(shade(uv, 0), c, uLensMix);
  return max(c, echoes(uv));
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
  if (uSurf == 7) {
    // Cross-stitch: an X of thread per cell, on dark cloth.
    vec2 id = floor(p / uCell), f = fract(p / uCell);
    vec4 c = picture((id + .5) * uCell / uRes);
    float d = min(abs(f.x - f.y), abs(f.x + f.y - 1.));
    float th = smoothstep(.2, .1, d) * step(.04, lumOf(c.rgb));
    float sheen = .75 + .25 * sin((f.x + f.y) * 18.);
    vec3 cloth = vec3(.06, .055, .05) * (.8 + .2 * hash(id));
    return vec4(mix(cloth, c.rgb / max(c.a, .05) * sheen, th), 1.);
  }
  if (uSurf == 8) {
    // Bricks: square tiles with a bevel and a stud on top.
    float sz = uCell * 1.4; vec2 id = floor(p / sz), f = fract(p / sz);
    vec4 c = picture((id + .5) * sz / uRes);
    vec3 col = c.a > .03 ? floor(c.rgb / max(c.a, .05) * 5. + .5) / 5. : vec3(.05, .05, .07);
    float edge = min(min(f.x, f.y), min(1. - f.x, 1. - f.y));
    float bevel = 1. - smoothstep(.1, 0., edge) * .4 + smoothstep(.1, 0., min(f.x, 1. - f.y)) * .25;
    float r = length(f - .5), stud = smoothstep(.3, .27, r);
    float lit = stud * (.12 + .25 * smoothstep(.27, .2, length(f - vec2(.42, .58)))) - smoothstep(.27, .3, r) * smoothstep(.36, .3, r) * .2;
    lit *= .2 + .8 * clamp(lumOf(col) * 3., 0., 1.);
    return vec4(col * bevel + lit, 1.);
  }
  if (uSurf == 9) {
    // VHS: wobble, colour bleed, a tracking band and tape noise.
    float line = floor(p.y / 2.);
    vec2 q = uv + vec2(sin(uv.y * 3. + uT * 2.) * .002 + (hash(vec2(line, floor(uT * 30.))) - .5) * .0015, 0.);
    float band = fract(uT * .11 + uKickS * .05), inBand = smoothstep(.04, 0., abs(uv.y - (1. - band)));
    q.x += inBand * (.02 + hash(vec2(line, uT)) * .02);
    vec4 c = picture(q);
    c.r = mix(c.r, px(q + vec2(.005, 0.)).r, .6); c.b = mix(c.b, px(q - vec2(.005, 0.)).b, .6);
    float l = dot(c.rgb, vec3(.3, .55, .15)); c.rgb = mix(vec3(l) * c.a, c.rgb, .8);
    c.rgb *= .9 + .1 * sin(p.y * 1.6);
    float noise = inBand * hash(p + uT) * .5 + step(.985, hash(vec2(line, floor(uT * 12.)))) * .25 + smoothstep(.03, 0., uv.y) * hash(p * .5 + uT) * .6;
    return vec4(c.rgb + noise, max(c.a, noise));
  }
  if (uSurf == 10) {
    // Oil paint (Kuwahara): each pixel takes the calmest of four neighbourhoods.
    vec2 st = max(1., uCell / 6.) / uRes;
    vec3 m0 = vec3(0.), m1 = vec3(0.), m2 = vec3(0.), m3 = vec3(0.), s0 = vec3(0.), s1 = vec3(0.), s2 = vec3(0.), s3 = vec3(0.);
    for (int j = 0; j <= 3; j++) for (int i = 0; i <= 3; i++) {
      vec2 o2 = vec2(float(i), float(j)) * st;
      vec3 a = px(uv + vec2(-o2.x, -o2.y)).rgb, b = px(uv + vec2(o2.x, -o2.y)).rgb, cc = px(uv + vec2(-o2.x, o2.y)).rgb, d = px(uv + o2).rgb;
      m0 += a; s0 += a * a; m1 += b; s1 += b * b; m2 += cc; s2 += cc * cc; m3 += d; s3 += d * d;
    }
    m0 /= 16.; m1 /= 16.; m2 /= 16.; m3 /= 16.;
    float v0 = dot(s0 / 16. - m0 * m0, vec3(1.)), v1 = dot(s1 / 16. - m1 * m1, vec3(1.)), v2 = dot(s2 / 16. - m2 * m2, vec3(1.)), v3 = dot(s3 / 16. - m3 * m3, vec3(1.));
    vec3 col = m0; float v = v0;
    if (v1 < v) { v = v1; col = m1; } if (v2 < v) { v = v2; col = m2; } if (v3 < v) { col = m3; }
    // Sparse scenes would paint over their own dots, so the brightest stroke still shows through.
    vec3 hi = max(max(m0, m1), max(m2, m3)); col = max(col, hi * .75);
    col = mix(col * 1.05, 1. - exp(-col * 3.2), 1. - smoothstep(.05, .3, lumOf(col)));
    return vec4(col, min(1., lumOf(col) * 2.));
  }
  if (uSurf == 11) {
    // Neon outline: only the edges glow, in their own colour.
    vec2 e = max(1., uCell / 6.) / uRes;
    float tl = lumAt(uv + vec2(-e.x, e.y)), t = lumAt(uv + vec2(0., e.y)), tr = lumAt(uv + e), l = lumAt(uv - vec2(e.x, 0.)), r = lumAt(uv + vec2(e.x, 0.));
    float bl = lumAt(uv - e), b = lumAt(uv - vec2(0., e.y)), br = lumAt(uv + vec2(e.x, -e.y));
    vec2 g = vec2(tr + 2. * r + br - tl - 2. * l - bl, tl + 2. * t + tr - bl - 2. * b - br);
    float edge = smoothstep(.04, .35, length(g));
    vec4 c = picture(uv);
    vec3 col = c.rgb / max(max(c.r, max(c.g, c.b)), .05);
    return vec4(col * edge + c.rgb * .06, max(edge, c.a * .06));
  }
  return picture(uv);
}
vec3 gradeOf(float l){
  if (uGrade == 1) return mix(vec3(.07, .01, .12), vec3(1., .6, .24), l);
  if (uGrade == 2) return mix(vec3(0., .04, .09), vec3(.37, .95, 1.), l);
  if (uGrade == 3) return mix(vec3(.05, 0., .1), vec3(.78, 1., 0.), l);
  if (uGrade == 5) return mix(uGA, uGB, l);
  return vec3(l);
}
void main(){
  vec2 uv = vUv;
  float gl = uGlitch;
  if (gl > 0.) {
    // Glitch: bands slide sideways, blocks jump.
    float rows = mix(48., 7., uBlock), band = floor(uv.y * rows);
    if (hash(vec2(band, uSeed)) < .4 * gl) uv.x += (hash(vec2(band, uSeed + 1.)) - .5) * .3 * gl;
    vec2 cell = floor(uv * vec2(6., 10.) * mix(2.5, .7, uBlock));
    if (hash(cell + uSeed * 3.1) < .07 * gl) uv += (vec2(hash(cell + uSeed), hash(cell - uSeed)) - .5) * .12 * gl;
    uv = fract(uv);
  }
  vec4 c = uSurf == 0 ? picture(uv) : surface(uv);
  if (uSurf != 0) c.rgb *= 1. + uKickS * .35;
  if (uSurf != 0 && uSurfMix < 1.) c = mix(picture(uv), c, uSurfMix);
  if (gl > .05) {
    float off = .015 * gl * (hash(vec2(floor(uv.y * 30.), uSeed)) - .3);
    c.r = max(c.r * .6, px(uv + vec2(off, 0.)).r); c.b = max(c.b * .6, px(uv - vec2(off, 0.)).b);
    float tear = step(1. - .015 * gl, hash(vec2(floor(uv.y * uRes.y / 2.), uSeed)));
    c = max(c, vec4(vec3(tear * .8), tear * .8));
  }
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
  if (uExp != 0. || uCon != 0. || uSat != 0.) {
    // Exposure, contrast and saturation: plain adjustments before the looks.
    // Worked on the colour as it shows over black (the premultiplied one), so
    // a see-through field (over a bottom layer) grades like an opaque one:
    // faint glow darkened by contrast fades out instead of turning into a
    // pale veil over what's underneath.
    vec3 rgb = c.rgb * exp2(uExp * 1.5);
    rgb = (rgb - .5) * (1. + uCon) + .5;
    float l = dot(rgb, vec3(.3, .55, .15));
    rgb = clamp(mix(vec3(l), rgb, 1. + uSat), 0., 1.);
    // Lower contrast lifts black to grey: only where there's picture, not
    // over the empty, see-through parts.
    rgb = max(rgb - max(.5 - .5 * (1. + uCon), 0.) * (1. - c.a), 0.);
    float l0 = dot(c.rgb, vec3(.3, .55, .15));
    float a = c.a < .999 ? c.a * clamp(dot(rgb, vec3(.3, .55, .15)) / max(l0, 1e-3), 0., 1.) : 1.;
    c = vec4(rgb, max(a, max(rgb.r, max(rgb.g, rgb.b))));
  }
  if (uHue != 0.) c.rgb = max(hueTurn(c.rgb, uHue), 0.);
  if (uGrade != 0 && uGradeAmt > 0.) {
    vec3 rgb = c.rgb / max(c.a, 1e-3);
    float l = dot(rgb, vec3(.3, .55, .15));
    c.rgb = mix(c.rgb, gradeOf(clamp(l, 0., 1.)) * c.a, uGradeAmt);
  }
  if (uPoster > 1.) {
    vec3 rgb = c.rgb / max(c.a, 1e-3);
    c.rgb = floor(rgb * uPoster + .5) / uPoster * c.a;
  }
  if (uInvert > 0.) c = mix(c, vec4(vec3(1.) - c.rgb, 1.), uInvert);
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
  private copy!: WebGLProgram;
  private echoes: { f: WebGLFramebuffer; t: WebGLTexture }[] = [];
  private echoHead = 0;
  private echoFrame = 0;
  private echoFresh = true;
  private ew = 0;
  private eh = 0;
  private u = new Map<string, WebGLUniformLocation | null>();
  private src!: WebGLTexture;
  private glyph!: WebGLTexture;
  private bufs: { f: WebGLFramebuffer; t: WebGLTexture }[] = [];
  private flip = 0;
  private bw = 0;
  private bh = 0;
  private fresh = true;
  private vao: WebGLVertexArrayObject | null = null;
  // Shared: the last finished frame, so it can be shown again (snapshots).
  private out: { f: WebGLFramebuffer; t: WebGLTexture } | null = null;
  private ow = 0;
  private oh = 0;
  /** Runs in another renderer's context, on its picture (no copy through the CPU). */
  readonly shared: boolean;

  /**
   * Alone: its own canvas, fed a 2D canvas each frame. Shared (given the
   * particle renderer's context): reads that renderer's picture texture
   * directly and draws onto its canvas, so the frame never leaves the GPU.
   */
  constructor(shared?: WebGL2RenderingContext) {
    this.canvas.className = 'lens gpu-fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    this.shared = !!shared;
    this.gl = shared ?? this.canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
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
      this.copy = this.prog(FS_COPY, 'copy');
    } catch (e) {
      console.warn('GPU looks unavailable:', e);
      return false;
    }
    // Its own vertex array, so a shared context's other drawing isn't disturbed.
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
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
    const flipWas = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipWas);
    for (let i = 0; i < 2; i++) this.bufs.push({ f: gl.createFramebuffer()!, t: this.tex() });
    for (let i = 0; i < ECHO_SLOTS; i++) this.echoes.push({ f: gl.createFramebuffer()!, t: this.tex() });
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

  // Echo frames are kept at half size: six of them, one every few frames.
  private echoSize(w: number, h: number) {
    const gl = this.gl!;
    const ew = Math.max(1, w >> 1);
    const eh = Math.max(1, h >> 1);
    if (this.ew === ew && this.eh === eh && !this.echoFresh) return;
    this.ew = ew;
    this.eh = eh;
    this.echoFresh = false;
    for (const b of this.echoes) {
      gl.bindTexture(gl.TEXTURE_2D, b.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ew, eh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
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
    this.echoFresh = true;
  }

  /** Alone: shade a 2D canvas (uploaded each frame) onto this canvas. */
  render(source: HTMLCanvasElement, P: GpuFxParams, F: GpuFxFrame) {
    const gl = this.gl;
    if (!gl || !this.ok || this.shared) return;
    const w = source.width;
    const h = source.height;
    if (!w || !h) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.run(this.src, w, h, P, F);
  }

  /** Shared: shade a texture of the shared context (premultiplied, rows bottom-up) onto its canvas. */
  renderTex(tex: WebGLTexture, w: number, h: number, P: GpuFxParams, F: GpuFxFrame) {
    const gl = this.gl;
    if (!gl || !this.ok || !this.shared || !w || !h) return;
    // The other renderer's state, as this one expects it.
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    this.outSize(w, h);
    this.run(tex, w, h, P, F);
    this.present();
  }

  /** Shared: show the last finished frame again (snapshots read the canvas). */
  present() {
    const gl = this.gl;
    if (!gl || !this.out || !this.shared) return;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.ow, this.oh);
    gl.useProgram(this.copy);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.out.t);
    gl.uniform1i(this.u.get('copy.uSrc') ?? null, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private outSize(w: number, h: number) {
    const gl = this.gl!;
    if (!this.out) this.out = { f: gl.createFramebuffer()!, t: this.tex() };
    if (this.ow === w && this.oh === h) return;
    this.ow = w;
    this.oh = h;
    gl.bindTexture(gl.TEXTURE_2D, this.out.t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.out.f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.out.t, 0);
  }

  /** Free the buffers (the shared renderer is leaving). */
  drop() {
    const gl = this.gl;
    if (!gl) return;
    for (const b of [...this.bufs, ...this.echoes, ...(this.out ? [this.out] : [])]) {
      gl.bindTexture(gl.TEXTURE_2D, b.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    this.bw = this.bh = this.ow = this.oh = 0;
    this.ew = this.eh = 0;
    this.reset();
  }

  private run(srcTex: WebGLTexture, w: number, h: number, P: GpuFxParams, F: GpuFxFrame) {
    const gl = this.gl!;
    this.size(w, h);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, w, h);
    // The picture on unit 0 (resizing above may have bound a buffer there).
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    const u = (k: string) => this.u.get(k) ?? null;
    let input = srcTex;
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
      gl.uniform1f(u('feed.uWarp'), P.warp);
      gl.uniform1i(u('feed.uWarpBy'), P.warpBy === 'field' ? 1 : 0);
      gl.uniform1f(u('feed.uKick'), F.kickF);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.flip = 1 - this.flip;
      input = next.t;
    } else this.fresh = true;
    const echo = Math.max(0, Math.min(ECHO_SLOTS, Math.round(P.echo)));
    if (echo > 0) {
      this.echoSize(w, h);
      if (this.echoFrame++ % Math.max(1, Math.round(P.echoDelay)) === 0) {
        const slot = this.echoes[this.echoHead];
        gl.bindFramebuffer(gl.FRAMEBUFFER, slot.f);
        gl.viewport(0, 0, this.ew, this.eh);
        gl.useProgram(this.copy);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, input);
        gl.uniform1i(u('copy.uSrc'), 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.viewport(0, 0, w, h);
        this.echoHead = (this.echoHead + 1) % ECHO_SLOTS;
      }
    } else this.echoFresh = true;
    // Alone: straight onto this canvas. Shared: into the kept frame (shown after).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shared ? this.out!.f : null);
    gl.useProgram(this.main);
    for (let i = 0; i < ECHO_SLOTS; i++) {
      // Echo 1 is the newest kept frame, echo 6 the oldest.
      gl.activeTexture(gl.TEXTURE3 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.echoes[(this.echoHead - 1 - i + ECHO_SLOTS * 2) % ECHO_SLOTS].t);
      gl.uniform1i(u(`main.uE${i}`), 3 + i);
    }
    gl.uniform1i(u('main.uEcho'), echo);
    gl.uniform1f(u('main.uEchoSpread'), P.echoSpread);
    gl.uniform1f(u('main.uFlare'), P.flare);
    gl.uniform3f(u('main.uTint'), ...P.tint);
    gl.uniform1f(u('main.uPoster'), P.poster);
    gl.uniform1f(u('main.uHue'), P.hue);
    gl.uniform1f(u('main.uInvert'), P.invert);
    gl.uniform1f(u('main.uDisp'), P.displace);
    gl.uniform1f(u('main.uHaze'), P.haze);
    gl.uniform1i(u('main.uBlurMode'), BLUR_ID[P.blur]);
    gl.uniform1f(u('main.uBlur'), P.blurAmt);
    gl.uniform2f(u('main.uBlurC'), P.blurAt[0], P.blurAt[1]);
    gl.uniform2f(u('main.uBlurDir'), Math.cos((P.blurAngle * Math.PI) / 180) * (h / Math.max(1, w)), Math.sin((P.blurAngle * Math.PI) / 180));
    gl.uniform1f(u('main.uExp'), P.exposure);
    gl.uniform1f(u('main.uCon'), P.contrast);
    gl.uniform1f(u('main.uSat'), P.saturation);
    gl.uniform1f(u('main.uGlitch'), P.glitch);
    gl.uniform1f(u('main.uBlock'), P.glitchBlock);
    gl.uniform1f(u('main.uSeed'), P.glitchSeed);
    gl.uniform3f(u('main.uGA'), ...P.gradeA);
    gl.uniform3f(u('main.uGB'), ...P.gradeB);
    gl.uniform1f(u('main.uKickL'), F.kickL);
    gl.uniform1f(u('main.uKickS'), F.kickS);
    gl.uniform1f(u('main.uKickF'), F.kickF);
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
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }
}
