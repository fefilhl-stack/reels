/* ==========================================================================
   Light ribbons (three.js)

   One long "river" of thin glowing fibers runs down the whole page. Its
   course is pinned to the sections ([data-scene] elements): every section
   lists the points the river passes through, relative to its own box. The
   river lives in page coordinates, so scrolling simply slides it up with the
   content — nothing morphs or lags behind.

   Each frame the stretch of river around the viewport is resampled into a
   tiny float texture (position, normal, width, glow); the vertex shaders read
   it to place the fibers, the dust drifting downstream and the bokeh. Twist,
   pulses and particles are keyed to the distance along the river, so they
   stay attached to it and flow downstream instead of following the screen.
   ========================================================================== */

import type * as THREE_NS from 'three';

type Three = typeof THREE_NS;

type Anchor = {
  /** Fraction of the viewport width. */
  x: number;
  /** Fraction of the section height (may go below 0 or above 1). */
  y: number;
  /** Half-width of the bundle, as a fraction of min(viewport width, height). */
  r: number;
  /** Pinch glow: 1 at the bright focal point. */
  glow?: number;
  /** Brightness multiplier; 0 fades the river in or out. */
  gain?: number;
  /** 0 = round twisted tube, 1 = flat ribbon. */
  flat?: number;
};

const FROST = 1.7; // the frosted sections blur the river, so it burns brighter there

// Where the river runs, section by section (keys match data-scene).
const RIVER: Record<string, Anchor[]> = {
  hero: [
    { x: 1.22, y: -0.5, r: 0.46, gain: 0, flat: 0.1 },
    { x: 0.97, y: -0.06, r: 0.34, flat: 0.1 },
    { x: 0.66, y: 0.24, r: 0.2, flat: 0.12 },
    { x: 0.44, y: 0.5, r: 0.075, glow: 0.35, flat: 0.12 },
    { x: 0.36, y: 0.68, r: 0.012, glow: 1, flat: 0.12 },
    { x: 0.46, y: 0.86, r: 0.12, glow: 0.3, flat: 0.2 },
    { x: 0.6, y: 1.02, r: 0.17, flat: 0.35 },
  ],
  arc: [
    { x: 0.7, y: 0.3, r: 0.2, flat: 0.5 },
    { x: 0.71, y: 0.85, r: 0.21, flat: 0.5 },
  ],
  sweep: [
    { x: 0.62, y: 0.04, r: 0.2, gain: FROST },
    { x: 0.36, y: 0.15, r: 0.22, gain: FROST },
    { x: 0.16, y: 0.3, r: 0.22, gain: FROST },
    { x: 0.2, y: 0.5, r: 0.22, gain: FROST },
    { x: 0.5, y: 0.72, r: 0.24, gain: FROST },
    { x: 0.75, y: 0.92, r: 0.24, gain: FROST },
  ],
  low: [
    { x: 0.8, y: 0.15, r: 0.24, gain: FROST },
    { x: 0.55, y: 0.45, r: 0.24, gain: FROST },
    { x: 0.82, y: 0.8, r: 0.24, gain: FROST },
  ],
  edge: [
    { x: 0.85, y: 0.25, r: 0.22, gain: FROST },
    { x: 0.75, y: 0.8, r: 0.22, gain: FROST },
  ],
  dusk: [
    { x: 0.62, y: 0.25, r: 0.22, gain: FROST },
    { x: 0.36, y: 0.6, r: 0.22, gain: FROST },
    { x: 0.22, y: 0.92, r: 0.22, gain: FROST },
  ],
  loop: [
    { x: 0.25, y: 0.3, r: 0.22, gain: FROST },
    { x: 0.3, y: 0.65, r: 0.2, gain: FROST },
    { x: 0.1, y: 0.95, r: 0.16 },
  ],
  // in pricing the river swings across the full width, behind the cards
  wave: [
    { x: -0.25, y: 0.02, r: 0.14, gain: 1.25 },
    { x: 0.5, y: 0.13, r: 0.15, gain: 1.25 },
    { x: 1.25, y: 0.26, r: 0.16, gain: 1.25 },
    { x: 0.5, y: 0.5, r: 0.16, gain: 1.25 },
    { x: -0.25, y: 0.66, r: 0.16, gain: 1.25 },
    { x: 0.5, y: 0.86, r: 0.15, gain: 1.2 },
    { x: 1.25, y: 1.0, r: 0.15, gain: 1.1 },
  ],
  // one last swing under the final cards, then the river leaves the page
  finale: [
    { x: 0.5, y: 0.12, r: 0.15, gain: 0.9 },
    { x: -0.3, y: 0.3, r: 0.16, gain: 0.6 },
    { x: -0.8, y: 0.6, r: 0.2, gain: 0 },
  ],
};

const K = 256; // samples of the visible stretch uploaded per frame
const ROWS = 3;

/* ------------------------------------------------------------------------ */
/* GLSL                                                                      */
/* ------------------------------------------------------------------------ */

const COMMON = /* glsl */ `
uniform sampler2D uSpine;
uniform vec2 uRes;
uniform float uTime;
uniform float uReveal;
uniform float uDpr;
uniform float uCalm;

vec4 spineAt(float i, float row) {
  return texture2D(uSpine, vec2((i + 0.5) / ${K}.0, (row + 0.5) / ${ROWS}.0));
}

// Stretch of river on screen, t in 0..1. c: centre (device px), n: normal,
// r: half-width (device px), s: distance along the river (css px),
// e: glow, gain, flatness.
void spine(float t, out vec2 c, out vec2 n, out float r, out float s, out vec3 e) {
  float f = clamp(t, 0.0, 1.0) * ${K - 1}.0;
  float i = floor(f);
  float a = f - i;
  float j = min(i + 1.0, ${K - 1}.0);
  vec4 p = mix(spineAt(i, 0.0), spineAt(j, 0.0), a);
  vec4 q = mix(spineAt(i, 1.0), spineAt(j, 1.0), a);
  vec4 w = mix(spineAt(i, 2.0), spineAt(j, 2.0), a);
  c = p.xy;
  n = normalize(p.zw + vec2(0.0, 1e-5));
  r = q.x;
  s = q.y;
  e = vec3(q.z, q.w, w.x);
}

// One fiber of the bundle: fibers sit on a slowly twisting tube around the
// centre line; the twist is keyed to s, so it travels with the river.
vec2 fiber(float t, vec4 sd, float scatter, out vec2 n, out float depth, out float s, out vec3 e) {
  vec2 c; float r;
  spine(t, c, n, r, s, e);
  float theta = sd.x * 6.2831853 + s * 0.0036 + uTime * (0.05 + 0.08 * sd.y);
  float spread = 0.22 + 0.78 * sd.z;
  depth = sin(theta);
  float off = mix(cos(theta) * spread, sd.x * 2.0 - 1.0, e.z) * r * scatter;
  off += sin(s * (0.0025 + 0.003 * sd.w) + uTime * (0.35 + 0.3 * sd.y) + sd.w * 6.2831) * r * 0.12;
  return c + n * off;
}

vec3 palette(float w, float glow) {
  vec3 lime = vec3(0.8, 0.97, 0.32);
  vec3 yg = vec3(0.62, 0.9, 0.24);
  vec3 green = vec3(0.38, 0.82, 0.42);
  vec3 blue = vec3(0.32, 0.66, 0.96);
  vec3 col = w < 0.52 ? lime : (w < 0.72 ? yg : (w < 0.83 ? green : blue));
  return mix(col, vec3(1.0, 1.0, 0.86), glow * 0.55);
}

// after the intro the river runs in from its source, downstream
float grow(float s, float z) {
  float edge = uReveal + z * 80.0;
  return 1.0 - smoothstep(edge - 320.0, edge, s);
}

vec4 toClip(vec2 p) {
  vec2 clip = p / uRes * 2.0 - 1.0;
  return vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const RIBBON_VS = /* glsl */ `
${COMMON}
attribute vec4 aSeed;
uniform float uWidth;
uniform float uGain;
varying float vSide;
varying vec3 vCol;
void main() {
  vec2 n; float depth; float s; vec3 e;
  vec2 p = fiber(position.x, aSeed, 1.0, n, depth, s, e);
  float w = uWidth * uDpr * (0.75 + 0.5 * aSeed.z) * (1.0 + 0.25 * depth);
  p += n * position.y * w;
  float front = mix(0.4, 1.0, 0.5 + 0.5 * depth);
  // pulses roll downstream
  float pulse = 0.72 + 0.28 * sin(s * 0.022 - uTime * (1.6 + 1.4 * aSeed.y) + aSeed.w * 31.0);
  float lum = front * pulse * grow(s, aSeed.z) * (0.5 + 1.7 * e.x) * (0.45 + 0.9 * aSeed.y) * e.y * uGain * uCalm;
  vCol = palette(aSeed.w, e.x) * lum;
  vSide = position.y;
  gl_Position = toClip(p);
}
`;

const RIBBON_FS = /* glsl */ `
uniform float uFalloff;
varying float vSide;
varying vec3 vCol;
void main() {
  float a = pow(max(1.0 - abs(vSide), 0.0), uFalloff);
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;

// position = (phase, speed in css px/s downstream, size). Each particle sits
// at a fixed distance along the river (repeating every uPeriod px) and drifts.
const POINTS_VS = /* glsl */ `
${COMMON}
attribute vec4 aSeed;
uniform float uSize;
uniform float uGain;
uniform float uScatter;
uniform float uS0;
uniform float uS1;
uniform float uPeriod;
varying vec3 vCol;
void main() {
  float base = position.x * uPeriod + uTime * position.y;
  float sp = uS0 + mod(base - uS0, uPeriod);
  float t = (sp - uS0) / max(uS1 - uS0, 1.0);
  float inside = step(t, 1.0);
  vec2 n; float depth; float s; vec3 e;
  vec2 p = fiber(t, aSeed, uScatter, n, depth, s, e);
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + 2.2 * aSeed.y) + aSeed.w * 40.0);
  vCol = palette(aSeed.w, e.x) * tw * grow(s, aSeed.z) * e.y * uGain * uCalm * inside;
  gl_PointSize = uSize * (0.35 + position.z) * uDpr * inside;
  gl_Position = inside > 0.5 ? toClip(p) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const DUST_FS = /* glsl */ `
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vCol * a * a, 1.0);
}
`;

const BOKEH_FS = /* glsl */ `
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float disk = smoothstep(1.0, 0.82, d);
  float rim = smoothstep(0.62, 0.95, d) * disk;
  gl_FragColor = vec4(vCol * (disk * 0.55 + rim * 0.5), 1.0);
}
`;

const STARS_VS = /* glsl */ `
uniform float uScroll;
uniform float uTime;
uniform float uDpr;
varying float vA;
void main() {
  float y = fract(position.y - uScroll * (0.1 + 0.2 * position.z));
  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  gl_PointSize = (1.0 + 1.6 * position.z) * uDpr;
  vA = (0.1 + 0.45 * position.z) * (0.55 + 0.45 * sin(uTime * (0.6 + position.z) + position.x * 61.0));
}
`;

const STARS_FS = /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vec3(0.85, 0.9, 0.8) * smoothstep(0.5, 0.0, d) * vA, 1.0);
}
`;

const GLOW_VS = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const GLOW_FS = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uFocus;
uniform float uGlow;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float m = min(uRes.x, uRes.y);
  float d = length(p - uFocus) / m;
  float core = exp(-d * d * 1500.0);
  float halo = exp(-d * d * 60.0);
  float wide = 1.0 / (1.0 + d * d * 24.0);
  vec3 col = vec3(1.0, 1.0, 0.9) * core * 0.85 + vec3(0.8, 0.96, 0.32) * halo * 0.22 + vec3(0.45, 0.72, 0.22) * wide * 0.05;
  gl_FragColor = vec4(col * uGlow, 1.0);
}
`;

/* ------------------------------------------------------------------------ */

export type Ribbons = {
  /** Resolves once every shader is compiled and the first frame is drawn. */
  ready: Promise<void>;
  dispose: () => void;
};

export function createRibbons(THREE: Three, canvas: HTMLCanvasElement): Ribbons {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 1);

  let dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  const bufferSize = new THREE.Vector2();
  const scene3 = new THREE.Scene();
  const camera = new THREE.Camera();

  // deterministic seeds so the composition is identical on every load
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  /* ---------- the visible stretch, as a float texture ---------- */
  const spineData = new Float32Array(K * ROWS * 4);
  const spineTex = new THREE.DataTexture(spineData, K, ROWS, THREE.RGBAFormat, THREE.FloatType);
  spineTex.minFilter = THREE.NearestFilter;
  spineTex.magFilter = THREE.NearestFilter;
  spineTex.generateMipmaps = false;
  spineTex.needsUpdate = true;

  const common = {
    uSpine: { value: spineTex },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uDpr: { value: dpr },
    uCalm: { value: 1 },
  };
  const additive = {
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  } as const;

  /* ---------- fibers ---------- */
  const LINES = small ? 84 : 140;
  const SEG = small ? 200 : 280;
  const seeds: number[][] = [];
  for (let l = 0; l < LINES; l++) seeds.push([rand(), rand(), Math.sqrt(rand()), rand()]);

  function fiberGeometry(count: number) {
    const per = (SEG + 1) * 2;
    const pos = new Float32Array(count * per * 3);
    const sd = new Float32Array(count * per * 4);
    const index = new Uint32Array(count * SEG * 6);
    let v = 0;
    let q = 0;
    let ii = 0;
    for (let l = 0; l < count; l++) {
      const base = l * per;
      for (let k = 0; k <= SEG; k++) {
        for (let side = -1; side <= 1; side += 2) {
          pos[v++] = k / SEG;
          pos[v++] = side;
          pos[v++] = l;
          sd.set(seeds[l], q);
          q += 4;
        }
        if (k < SEG) {
          const a = base + k * 2;
          index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], ii);
          ii += 6;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    return geo;
  }

  const fibers = fiberGeometry(LINES);
  const haze = fiberGeometry(Math.round(LINES * 0.3));

  const ribbonMaterial = (width: number, gain: number, falloff: number) =>
    new THREE.ShaderMaterial({
      ...additive,
      uniforms: { ...common, uWidth: { value: width }, uGain: { value: gain }, uFalloff: { value: falloff } },
      vertexShader: RIBBON_VS,
      fragmentShader: RIBBON_FS,
    });
  const hazeMat = ribbonMaterial(30, 0.016, 1.6);
  const glowMat = ribbonMaterial(4.4, 0.072, 2.2);
  const coreMat = ribbonMaterial(1.0, 0.42, 1.0);

  /* ---------- dust drifting downstream + bokeh ---------- */
  const PERIOD = 12000; // css px of river each particle repeats over
  function pointsGeometry(count: number, speed: [number, number], size: [number, number]) {
    const pos = new Float32Array(count * 3);
    const sd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand();
      pos[i * 3 + 1] = speed[0] + rand() * (speed[1] - speed[0]);
      pos[i * 3 + 2] = size[0] + Math.pow(rand(), 2) * (size[1] - size[0]);
      sd.set([rand(), rand(), Math.sqrt(rand()), rand()], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    return geo;
  }
  const range = { s0: { value: 0 }, s1: { value: 1 } };
  const dustGeo = pointsGeometry(small ? 800 : 1500, [18, 80], [0.2, 1]);
  const bokehGeo = pointsGeometry(small ? 110 : 210, [6, 22], [0.2, 1]);
  const pointsMaterial = (fs: string, size: number, gain: number, scatter: number) =>
    new THREE.ShaderMaterial({
      ...additive,
      uniforms: {
        ...common,
        uSize: { value: size },
        uGain: { value: gain },
        uScatter: { value: scatter },
        uS0: range.s0,
        uS1: range.s1,
        uPeriod: { value: PERIOD },
      },
      vertexShader: POINTS_VS,
      fragmentShader: fs,
    });
  const dustMat = pointsMaterial(DUST_FS, 4.5, 1.15, 0.85);
  const bokehMat = pointsMaterial(BOKEH_FS, small ? 34 : 52, 0.12, 2.3);

  /* ---------- stars ---------- */
  const STARS = small ? 90 : 170;
  const starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) starPos.set([rand(), rand(), Math.pow(rand(), 2.2)], i * 3);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uScroll: { value: 0 }, uTime: common.uTime, uDpr: common.uDpr },
    vertexShader: STARS_VS,
    fragmentShader: STARS_FS,
  });

  /* ---------- focal glow ---------- */
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const focalMat = new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uRes: common.uRes, uFocus: { value: new THREE.Vector2() }, uGlow: { value: 0 } },
    vertexShader: GLOW_VS,
    fragmentShader: GLOW_FS,
  });

  const river: THREE_NS.Object3D[] = [
    new THREE.Mesh(haze, hazeMat),
    new THREE.Mesh(fibers, glowMat),
    new THREE.Mesh(fibers, coreMat),
    new THREE.Points(bokehGeo, bokehMat),
    new THREE.Points(dustGeo, dustMat),
  ];
  const focal = new THREE.Mesh(glowGeo, focalMat);
  [new THREE.Points(starGeo, starMat), ...river, focal].forEach((o, i) => {
    o.frustumCulled = false;
    o.renderOrder = i;
    scene3.add(o);
  });

  /* ---------- the river's course, in page coordinates (css px) ---------- */
  let W = window.innerWidth;
  let H = window.innerHeight;
  let N = 0; // dense samples, evenly spaced along the river
  let ds = 1; // spacing between them
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let tx = new Float32Array(0);
  let ty = new Float32Array(0);
  let rad = new Float32Array(0);
  let glo = new Float32Array(0);
  let gai = new Float32Array(0);
  let fla = new Float32Array(0);
  let focusPage: [number, number] | null = null;
  let focusS = 0; // distance along the river to the focal point
  let firstWindowEnd = 0;

  function measure() {
    W = window.innerWidth;
    H = window.innerHeight;
    const M = Math.min(W, H);
    type P = { x: number; y: number; r: number; glow: number; gain: number; flat: number };
    const pts: P[] = [];
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'))
      .map((el) => ({ el, top: el.getBoundingClientRect().top + window.scrollY, h: el.offsetHeight }))
      .sort((a, b) => a.top - b.top);
    sections.forEach(({ el, top, h }) => {
      (RIVER[el.dataset.scene ?? ''] ?? []).forEach((a) =>
        pts.push({ x: a.x * W, y: top + a.y * h, r: a.r * M, glow: a.glow ?? 0, gain: a.gain ?? 1, flat: a.flat ?? 0.3 }),
      );
    });
    focusPage = null;
    if (pts.length < 2) {
      N = 0;
      return;
    }
    const focusAt = pts.findIndex((p) => p.glow >= 1);
    if (focusAt >= 0) focusPage = [pts[focusAt].x, pts[focusAt].y];

    const curve = new THREE.CatmullRomCurve3(
      pts.map((p) => new THREE.Vector3(p.x, p.y, 0)),
      false,
      'centripetal',
    );
    curve.arcLengthDivisions = pts.length * 60;
    const total = curve.getLength();
    N = Math.max(2, Math.min(8000, Math.ceil(total / 6)));
    ds = total / (N - 1);
    px = new Float32Array(N);
    py = new Float32Array(N);
    tx = new Float32Array(N);
    ty = new Float32Array(N);
    rad = new Float32Array(N);
    glo = new Float32Array(N);
    gai = new Float32Array(N);
    fla = new Float32Array(N);
    const v = new THREE.Vector3();
    const smooth = (f: number) => f * f * (3 - 2 * f);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const t = curve.getUtoTmapping(u, u * total);
      curve.getPoint(t, v);
      px[i] = v.x;
      py[i] = v.y;
      curve.getTangent(t, v);
      tx[i] = v.x;
      ty[i] = v.y;
      // attributes ease between the anchors either side
      const seg = t * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(seg));
      const f = smooth(Math.min(1, Math.max(0, seg - k)));
      const a = pts[k];
      const b = pts[k + 1];
      rad[i] = a.r + (b.r - a.r) * f;
      glo[i] = a.glow + (b.glow - a.glow) * f;
      gai[i] = a.gain + (b.gain - a.gain) * f;
      fla[i] = a.flat + (b.flat - a.flat) * f;
    }
    // how far the river has to grow in so the first screen is covered
    firstWindowEnd = 0;
    let best = Infinity;
    for (let i = 0; i < N; i++) {
      if (py[i] <= H * 1.4) firstWindowEnd = i * ds;
      if (focusPage) {
        const d = Math.hypot(px[i] - focusPage[0], py[i] - focusPage[1]);
        if (d < best) {
          best = d;
          focusS = i * ds;
        }
      }
    }
  }

  /* ---------- per frame: resample the stretch around the viewport ---------- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let visible = false;

  function updateWindow() {
    const scroll = window.scrollY;
    const y0 = scroll - H * 0.45;
    const y1 = scroll + H * 1.45;
    let i0 = -1;
    let i1 = -1;
    for (let i = 0; i < N; i++) {
      const y = py[i];
      if (y >= y0 && y <= y1) {
        if (i0 < 0) i0 = i;
        i1 = i;
      }
    }
    visible = i0 >= 0 && i1 > i0;
    river.forEach((o) => (o.visible = visible));
    if (!visible) return;
    const s0 = Math.max(0, i0 - 2) * ds;
    const s1 = Math.min(N - 1, i1 + 2) * ds;
    range.s0.value = s0;
    range.s1.value = s1;

    const ox = mouse.x * W * 0.012;
    const oy = mouse.y * H * 0.008;
    for (let k = 0; k < K; k++) {
      const s = s0 + ((s1 - s0) * k) / (K - 1);
      const f = s / ds;
      const i = Math.min(N - 2, Math.floor(f));
      const a = f - i;
      const j = i + 1;
      const lerp = (arr: Float32Array) => arr[i] + (arr[j] - arr[i]) * a;
      const nx = -lerp(ty);
      const ny = lerp(tx);
      let o = k * 4;
      spineData[o] = (lerp(px) + ox) * dpr;
      spineData[o + 1] = (lerp(py) - scroll + oy) * dpr;
      spineData[o + 2] = nx;
      spineData[o + 3] = ny;
      o += K * 4;
      spineData[o] = lerp(rad) * dpr;
      spineData[o + 1] = s;
      spineData[o + 2] = lerp(glo);
      spineData[o + 3] = lerp(gai);
      o += K * 4;
      spineData[o] = lerp(fla);
    }
    spineTex.needsUpdate = true;
  }

  let reveal = 0; // css px of river grown in
  let revealEnd = 0;
  let revealing = false;

  function updateUniforms() {
    common.uReveal.value = reveal;
    starMat.uniforms.uScroll.value = window.scrollY / Math.max(1, H);
    if (focusPage && visible) {
      const fy = focusPage[1] - window.scrollY;
      focalMat.uniforms.uFocus.value.set((focusPage[0] + mouse.x * W * 0.012) * dpr, (fy + mouse.y * H * 0.008) * dpr);
      // the glow fades in once the river has reached it
      const reached = Math.min(1, Math.max(0, (reveal - focusS) / 500));
      focalMat.uniforms.uGlow.value = reached * (common.uCalm.value < 1 ? 0.65 : 1);
    } else {
      focalMat.uniforms.uGlow.value = 0;
    }
  }

  function resize() {
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.getDrawingBufferSize(bufferSize);
    common.uRes.value.copy(bufferSize);
    common.uDpr.value = dpr;
    // portrait screens put the river behind body copy: keep it calmer there
    common.uCalm.value = window.innerWidth < window.innerHeight ? 0.62 : 1;
  }

  function draw() {
    updateWindow();
    updateUniforms();
    renderer.render(scene3, camera);
  }

  /* ---------- loop ---------- */
  let raf = 0;
  let running = false;
  let lastNow = 0;
  let sampled = 0;
  let slow = 0;
  let lineScale = 1;
  let compiled = false;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const rawDt = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 0.016;
    const dt = Math.min(0.1, rawDt);
    lastNow = now;
    common.uTime.value += dt;
    if (revealing) {
      // the river runs in from its source in about a second and a half (wall time)
      reveal += revealEnd * (rawDt / 1.5);
      if (reveal > revealEnd) {
        revealing = false;
        reveal = 1e7;
      }
    }
    const mk = 1 - Math.exp(-dt * 2.5);
    mouse.x += (mouse.tx - mouse.x) * mk;
    mouse.y += (mouse.ty - mouse.y) * mk;
    draw();

    // adaptive quality: step down when the GPU struggles
    if (sampled < 420) {
      sampled++;
      if (dt > 0.026) slow++;
      if (sampled === 140 || sampled === 420) {
        if (slow > sampled * 0.45) {
          if (dpr > 1) {
            dpr = 1;
            resize();
          } else if (lineScale > 0.5) {
            lineScale = 0.6;
            fibers.setDrawRange(0, Math.round(LINES * lineScale) * SEG * 6);
          }
        }
        slow = 0;
      }
    }
  }

  function start() {
    if (!compiled || running || reduceMotion || document.hidden) return;
    running = true;
    lastNow = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  /* ---------- events ---------- */
  let lastW = window.innerWidth;
  let lastH = window.innerHeight;
  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // ignore the small height jumps of mobile browser toolbars
    if (w === lastW && Math.abs(h - lastH) < 140) return;
    lastW = w;
    lastH = h;
    resize();
    measure();
    if (!running) draw();
  };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onVisibility = () => (document.hidden ? stop() : start());
  const startReveal = () => {
    if (reveal > 0 || revealing) return;
    // grow down to whatever is on screen (the page may open mid-way)
    revealEnd = Math.max(firstWindowEnd, range.s1.value) + 600;
    revealing = true;
  };
  let pendingStill = false;
  const onScrollStill = () => {
    if (pendingStill) return;
    pendingStill = true;
    requestAnimationFrame(() => {
      pendingStill = false;
      draw();
    });
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    canvas.dispatchEvent(new CustomEvent('ribbons:lost', { bubbles: true }));
  };
  let measureQueued = 0;
  const queueMeasure = () => {
    cancelAnimationFrame(measureQueued);
    measureQueued = requestAnimationFrame(() => {
      measure();
      if (!running) draw();
    });
  };

  const ro = new ResizeObserver(queueMeasure);
  ro.observe(document.body);
  window.addEventListener('resize', onResize);
  window.addEventListener('load', queueMeasure);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('relay:ribbons', startReveal);
  canvas.addEventListener('webglcontextlost', onLost);
  if (!reduceMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  resize();
  measure();
  if (document.documentElement.classList.contains('intro-done')) reveal = 1e7;
  const fallbackTimer = window.setTimeout(startReveal, 6000);
  updateWindow();

  let disposed = false;
  // compile off the main thread where the browser can (KHR_parallel_shader_compile),
  // so the first frame does not stall the intro
  const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
  const compiledP = parallel
    ? renderer.compileAsync(scene3, camera).catch(() => undefined)
    : new Promise<void>((resolve) =>
        // let the lime intro paint first, then compile synchronously behind it
        window.setTimeout(() => {
          if (!disposed) renderer.compile(scene3, camera);
          resolve();
        }, 60),
      );
  const ready = compiledP.then(() => {
    if (disposed) return;
    if (reduceMotion) {
      common.uTime.value = 2.5;
      reveal = 1e7;
      draw();
      window.addEventListener('scroll', onScrollStill, { passive: true });
    } else {
      compiled = true;
      draw();
      start();
    }
  });

  const dispose = () => {
    disposed = true;
    stop();
    cancelAnimationFrame(measureQueued);
    window.clearTimeout(fallbackTimer);
    ro.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('load', queueMeasure);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('relay:ribbons', startReveal);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('scroll', onScrollStill);
    canvas.removeEventListener('webglcontextlost', onLost);
    [fibers, haze, dustGeo, bokehGeo, starGeo, glowGeo].forEach((g) => g.dispose());
    [hazeMat, glowMat, coreMat, dustMat, bokehMat, starMat, focalMat].forEach((m) => m.dispose());
    spineTex.dispose();
    renderer.dispose();
  };

  return { ready, dispose };
}
