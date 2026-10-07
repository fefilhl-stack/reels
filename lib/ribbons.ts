/* ==========================================================================
   Light ribbons (three.js)

   A bundle of thin glowing fibers follows a cubic Bézier "spine". The fibers
   sit on a twisted tube that pinches into a bright focal point (the waist) and
   fans out towards both ends. Dust sparkles travel along the fibers, soft
   bokeh discs float around them, and faint stars sit behind everything.

   Every element with a [data-scene] attribute pins one SCENE to its scroll
   position; the spine morphs between scenes as the page scrolls.
   All geometry is generated in the vertex shaders from a handful of uniforms,
   so a frame costs a few draw calls and no CPU-side geometry work.
   ========================================================================== */

import type * as THREE_NS from 'three';

type Three = typeof THREE_NS;

type Scene = {
  /** Bézier control points, viewport fractions (x right, y down). */
  p: [number, number][];
  /** Where along the spine (0..1) the bundle pinches. */
  waist: number;
  /** Tube radius at start, waist and end, as a fraction of min(width, height). */
  rad: [number, number, number];
  twist: number;
  /** 0 = round tube, 1 = flat ribbon. */
  flat: number;
  /** Focal glow strength. */
  glow: number;
  gain: number;
};

const SCENES: Record<string, Scene> = {
  hero: {
    p: [[0.74, 1.2], [0.1, 0.8], [0.27, 0.4], [1.16, -0.1]],
    waist: 0.42, rad: [0.17, 0.012, 0.37], twist: 5.5, flat: 0.12, glow: 1, gain: 1,
  },
  arc: {
    p: [[0.5, -0.16], [0.97, 0.2], [0.95, 0.62], [0.62, 1.16]],
    waist: 0.5, rad: [0.12, 0.085, 0.14], twist: 2.6, flat: 0.55, glow: 0, gain: 0.95,
  },
  sweep: {
    p: [[-0.12, 1.15], [0.25, 0.75], [0.55, 0.25], [1.15, -0.1]],
    waist: 0.5, rad: [0.18, 0.1, 0.22], twist: 3.4, flat: 0.4, glow: 0.12, gain: 1.15,
  },
  low: {
    p: [[-0.15, 0.9], [0.35, 1.1], [0.75, 0.15], [1.2, 0.3]],
    waist: 0.5, rad: [0.14, 0.08, 0.18], twist: 3.5, flat: 0.4, glow: 0.08, gain: 1.05,
  },
  edge: {
    p: [[1.1, -0.15], [0.78, 0.25], [0.95, 0.7], [1.15, 1.15]],
    waist: 0.5, rad: [0.1, 0.08, 0.14], twist: 3.6, flat: 0.45, glow: 0, gain: 1.05,
  },
  dusk: {
    p: [[0.0, 1.2], [0.4, 0.75], [0.75, 0.45], [1.2, 0.0]],
    waist: 0.45, rad: [0.14, 0.08, 0.2], twist: 4.4, flat: 0.3, glow: 0.18, gain: 1.05,
  },
  loop: {
    p: [[0.45, 1.2], [-0.1, 0.75], [0.25, 0.15], [0.75, -0.15]],
    waist: 0.47, rad: [0.12, 0.06, 0.18], twist: 5, flat: 0.25, glow: 0.3, gain: 1.05,
  },
  wave: {
    p: [[-0.15, 0.3], [0.35, 0.02], [0.6, 0.88], [1.15, 0.42]],
    waist: 0.55, rad: [0.1, 0.05, 0.23], twist: 6, flat: 0.3, glow: 0.18, gain: 1,
  },
  finale: {
    p: [[-0.15, 0.08], [0.3, -0.06], [0.65, 0.28], [1.15, 0.04]],
    waist: 0.5, rad: [0.08, 0.04, 0.16], twist: 5, flat: 0.3, glow: 0, gain: 0.55,
  },
};

/* ------------------------------------------------------------------------ */
/* GLSL                                                                      */
/* ------------------------------------------------------------------------ */

const TUBE = /* glsl */ `
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uP0;
uniform vec2 uP1;
uniform vec2 uP2;
uniform vec2 uP3;
uniform float uWaist;
uniform vec3 uRad;
uniform float uTwist;
uniform float uFlat;
uniform float uReveal;
uniform float uDpr;
uniform float uCalm;

vec2 bez(float t) {
  float it = 1.0 - t;
  return it * it * it * uP0 + 3.0 * it * it * t * uP1 + 3.0 * it * t * t * uP2 + t * t * t * uP3;
}
vec2 bezd(float t) {
  float it = 1.0 - t;
  return 3.0 * it * it * (uP1 - uP0) + 6.0 * it * t * (uP2 - uP1) + 3.0 * t * t * (uP3 - uP2);
}

// Point on fiber \`s\` at spine position \`t\`, in drawing-buffer pixels.
vec2 fiber(float t, vec4 s, float scatter, out vec2 nm, out float depth, out float k) {
  float m = min(uRes.x, uRes.y);
  vec2 c = bez(t) * uRes;
  vec2 d = bezd(t) * uRes;
  vec2 tg = d / max(length(d), 0.0001);
  nm = vec2(-tg.y, tg.x);
  float far = step(uWaist, t);
  float span = mix(uWaist, 1.0 - uWaist, far);
  k = clamp(abs(t - uWaist) / max(span, 0.001), 0.0, 1.0);
  float open = mix(uRad.x, uRad.z, far);
  float r = mix(uRad.y, open, pow(k, 1.25)) * m * scatter;
  float theta = s.x * 6.2831853 + uTwist * (t - uWaist) + uTime * (0.04 + 0.08 * s.y);
  float spread = 0.22 + 0.78 * s.z;
  depth = sin(theta);
  float off = mix(cos(theta) * spread, s.x * 2.0 - 1.0, uFlat) * r;
  off += sin(t * (4.0 + 5.0 * s.w) + uTime * (0.35 + 0.3 * s.y) + s.w * 6.2831) * 0.016 * m * k;
  return c + nm * off;
}

vec3 palette(float w, float t) {
  vec3 lime = vec3(0.8, 0.97, 0.32);
  vec3 yg = vec3(0.62, 0.9, 0.24);
  vec3 green = vec3(0.38, 0.82, 0.42);
  vec3 blue = vec3(0.32, 0.66, 0.96);
  vec3 c = w < 0.52 ? lime : (w < 0.72 ? yg : (w < 0.83 ? green : blue));
  float nearW = exp(-pow((t - uWaist) * 6.5, 2.0));
  return mix(c, vec3(1.0, 1.0, 0.86), nearW * 0.55);
}

float grow(float t, float s) {
  float edge = 1.0 - uReveal * 1.3 + s * 0.08;
  return smoothstep(edge, edge + 0.22, t);
}

vec4 toClip(vec2 p) {
  vec2 clip = p / uRes * 2.0 - 1.0;
  return vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const RIBBON_VS = /* glsl */ `
${TUBE}
attribute vec4 aSeed;
uniform float uWidth;
uniform float uGain;
varying float vSide;
varying vec3 vCol;
void main() {
  float t = position.x;
  float side = position.y;
  vec2 nm; float depth; float k;
  vec2 p = fiber(t, aSeed, 1.0, nm, depth, k);
  float w = uWidth * uDpr * (0.75 + 0.5 * aSeed.z) * (1.0 + 0.25 * depth);
  p += nm * side * w;
  float ends = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.94, t);
  float nearW = exp(-pow((t - uWaist) * 6.5, 2.0));
  float front = mix(0.4, 1.0, 0.5 + 0.5 * depth);
  float pulse = 0.72 + 0.28 * sin(t * 34.0 - uTime * (1.6 + 1.4 * aSeed.y) + aSeed.w * 31.0);
  float lum = ends * front * pulse * grow(t, aSeed.z) * (0.5 + 1.7 * nearW) * (0.45 + 0.9 * aSeed.y) * uGain * uCalm;
  vCol = palette(aSeed.w, t) * lum;
  vSide = side;
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

// Dust and bokeh share one vertex shader: position = (t0, speed, size).
const POINTS_VS = /* glsl */ `
${TUBE}
attribute vec4 aSeed;
uniform float uSize;
uniform float uGain;
uniform float uScatter;
varying vec3 vCol;
void main() {
  float t = fract(position.x + uTime * position.y);
  vec2 nm; float depth; float k;
  vec2 p = fiber(t, aSeed, uScatter, nm, depth, k);
  float ends = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.9, t);
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + 2.2 * aSeed.y) + aSeed.w * 40.0);
  vCol = palette(aSeed.w, t) * ends * tw * grow(t, aSeed.z) * uGain * uCalm;
  gl_PointSize = uSize * (0.35 + position.z) * uDpr;
  gl_Position = toClip(p);
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
  renderer.autoClear = true;

  let dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  const bufferSize = new THREE.Vector2();
  const scene3 = new THREE.Scene();
  const camera = new THREE.Camera();

  // deterministic seeds so the composition is identical on every load
  let s = 7;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const common = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uP0: { value: new THREE.Vector2() },
    uP1: { value: new THREE.Vector2() },
    uP2: { value: new THREE.Vector2() },
    uP3: { value: new THREE.Vector2() },
    uWaist: { value: 0.4 },
    uRad: { value: new THREE.Vector3() },
    uTwist: { value: 5 },
    uFlat: { value: 0.1 },
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
  const SEG = small ? 120 : 170;
  const seeds: number[][] = [];
  for (let l = 0; l < LINES; l++) seeds.push([rand(), rand(), Math.sqrt(rand()), rand()]);

  function fiberGeometry(count: number) {
    const per = (SEG + 1) * 2;
    const pos = new Float32Array(count * per * 3);
    const seed = new Float32Array(count * per * 4);
    const index = new Uint32Array(count * SEG * 6);
    let v = 0;
    let q = 0;
    let ii = 0;
    for (let l = 0; l < count; l++) {
      const base = l * per;
      for (let sgi = 0; sgi <= SEG; sgi++) {
        const t = sgi / SEG;
        for (let side = -1; side <= 1; side += 2) {
          pos[v++] = t;
          pos[v++] = side;
          pos[v++] = l;
          seed.set(seeds[l], q);
          q += 4;
        }
        if (sgi < SEG) {
          const a = base + sgi * 2;
          index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], ii);
          ii += 6;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    return geo;
  }

  const fibers = fiberGeometry(LINES);
  const haze = fiberGeometry(Math.round(LINES * 0.3));

  function ribbonMaterial(width: number, gain: number, falloff: number) {
    return new THREE.ShaderMaterial({
      ...additive,
      uniforms: { ...common, uWidth: { value: width }, uGain: { value: gain }, uFalloff: { value: falloff } },
      vertexShader: RIBBON_VS,
      fragmentShader: RIBBON_FS,
    });
  }

  const hazeMat = ribbonMaterial(30, 0.016, 1.6);
  const glowMat = ribbonMaterial(4.4, 0.072, 2.2);
  const coreMat = ribbonMaterial(1.0, 0.42, 1.0);

  /* ---------- dust + bokeh ---------- */
  function pointsGeometry(count: number, speed: [number, number], size: [number, number]) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand();
      pos[i * 3 + 1] = (speed[0] + rand() * (speed[1] - speed[0])) * (rand() < 0.5 ? 1 : -1);
      pos[i * 3 + 2] = size[0] + Math.pow(rand(), 2) * (size[1] - size[0]);
      seed.set([rand(), rand(), Math.sqrt(rand()), rand()], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    return geo;
  }

  const dustGeo = pointsGeometry(small ? 150 : 320, [0.004, 0.02], [0.2, 1]);
  const bokehGeo = pointsGeometry(small ? 22 : 44, [0.002, 0.008], [0.2, 1]);
  const pointsMaterial = (fs: string, size: number, gain: number, scatter: number) =>
    new THREE.ShaderMaterial({
      ...additive,
      uniforms: { ...common, uSize: { value: size }, uGain: { value: gain }, uScatter: { value: scatter } },
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
    uniforms: { uRes: common.uRes, uFocus: { value: new THREE.Vector2() }, uGlow: { value: 1 } },
    vertexShader: GLOW_VS,
    fragmentShader: GLOW_FS,
  });

  const objects: THREE_NS.Object3D[] = [
    new THREE.Points(starGeo, starMat),
    new THREE.Mesh(haze, hazeMat),
    new THREE.Mesh(fibers, glowMat),
    new THREE.Mesh(fibers, coreMat),
    new THREE.Points(bokehGeo, bokehMat),
    new THREE.Points(dustGeo, dustMat),
    new THREE.Mesh(glowGeo, focalMat),
  ];
  objects.forEach((o, i) => {
    o.frustumCulled = false;
    o.renderOrder = i;
    scene3.add(o);
  });

  /* ---------- scenes along the page ---------- */
  const clone = (sc: Scene): Scene => ({ ...sc, p: sc.p.map((pt) => [pt[0], pt[1]] as [number, number]), rad: [...sc.rad] as Scene['rad'] });
  const mix = (a: Scene, b: Scene, f: number, out: Scene) => {
    for (let i = 0; i < 4; i++) {
      out.p[i][0] = a.p[i][0] + (b.p[i][0] - a.p[i][0]) * f;
      out.p[i][1] = a.p[i][1] + (b.p[i][1] - a.p[i][1]) * f;
    }
    for (let j = 0; j < 3; j++) out.rad[j] = a.rad[j] + (b.rad[j] - a.rad[j]) * f;
    out.waist = a.waist + (b.waist - a.waist) * f;
    out.twist = a.twist + (b.twist - a.twist) * f;
    out.flat = a.flat + (b.flat - a.flat) * f;
    out.glow = a.glow + (b.glow - a.glow) * f;
    out.gain = a.gain + (b.gain - a.gain) * f;
    return out;
  };
  const smooth = (x: number) => {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  };

  let keys: { at: number; scene: Scene }[] = [];
  function measure() {
    const vh = window.innerHeight;
    keys = [];
    document.querySelectorAll<HTMLElement>('[data-scene]').forEach((el) => {
      const sc = SCENES[el.dataset.scene ?? ''];
      if (!sc) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      keys.push({ at: Math.max(0, top - vh * 0.35), scene: sc });
    });
    keys.sort((a, b) => a.at - b.at);
    if (!keys.length) keys.push({ at: 0, scene: SCENES.hero });
  }

  function sceneAt(y: number, out: Scene) {
    const vh = window.innerHeight;
    if (y <= keys[0].at || keys.length === 1) return mix(keys[0].scene, keys[0].scene, 0, out);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (y < b.at) {
        const start = Math.max(a.at, b.at - vh * 0.9);
        return mix(a.scene, b.scene, smooth((y - start) / Math.max(1, b.at - start)), out);
      }
    }
    const last = keys[keys.length - 1].scene;
    return mix(last, last, 0, out);
  }

  const cur = clone(SCENES.hero);
  const target = clone(SCENES.hero);
  const view = clone(SCENES.hero);
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let speed = 0;
  let lastScroll = window.scrollY;
  let reveal = 0;
  let revealTarget = 0;
  let lineScale = 1;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(bufferSize);
    common.uRes.value.copy(bufferSize);
    common.uDpr.value = dpr;
    // portrait screens put the bundle behind body copy: keep it calmer there
    common.uCalm.value = w < h ? 0.62 : 1;
  }

  function bezPoint(sc: Scene, t: number) {
    const it = 1 - t;
    const a = it * it * it;
    const b = 3 * it * it * t;
    const c = 3 * it * t * t;
    const d = t * t * t;
    return [
      a * sc.p[0][0] + b * sc.p[1][0] + c * sc.p[2][0] + d * sc.p[3][0],
      a * sc.p[0][1] + b * sc.p[1][1] + c * sc.p[2][1] + d * sc.p[3][1],
    ];
  }

  function applyView() {
    for (let i = 0; i < 4; i++) {
      const w = i === 1 || i === 2 ? 0.035 : 0.012;
      view.p[i][0] = cur.p[i][0] + mouse.x * w;
      view.p[i][1] = cur.p[i][1] + mouse.y * w;
    }
    view.waist = cur.waist;
    view.rad[0] = cur.rad[0];
    view.rad[1] = cur.rad[1] * (1 + speed * 0.8);
    view.rad[2] = cur.rad[2] * (1 + speed * 0.12);
    view.twist = cur.twist + speed * 1.5;
    view.flat = cur.flat;
    view.glow = cur.glow * (1 + speed * 0.25);
    view.gain = cur.gain * (1 + speed * 0.18);

    common.uP0.value.set(view.p[0][0], view.p[0][1]);
    common.uP1.value.set(view.p[1][0], view.p[1][1]);
    common.uP2.value.set(view.p[2][0], view.p[2][1]);
    common.uP3.value.set(view.p[3][0], view.p[3][1]);
    common.uWaist.value = view.waist;
    common.uRad.value.set(view.rad[0], view.rad[1], view.rad[2]);
    common.uTwist.value = view.twist;
    common.uFlat.value = view.flat;
    common.uReveal.value = reveal;
    hazeMat.uniforms.uGain.value = 0.016 * view.gain;
    glowMat.uniforms.uGain.value = 0.072 * view.gain;
    coreMat.uniforms.uGain.value = 0.42 * view.gain;

    const f = bezPoint(view, view.waist);
    focalMat.uniforms.uFocus.value.set(f[0] * bufferSize.x, f[1] * bufferSize.y);
    focalMat.uniforms.uGlow.value = view.glow * (common.uCalm.value < 1 ? 0.65 : 1) * Math.max(0, Math.min(1, (reveal - 0.55) / 0.45));
    starMat.uniforms.uScroll.value = window.scrollY / Math.max(1, window.innerHeight);
  }

  function render() {
    renderer.render(scene3, camera);
  }

  /* ---------- loop ---------- */
  let raf = 0;
  let running = false;
  let lastNow = 0;
  let sampled = 0;
  let slow = 0;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const rawDt = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 0.016;
    const dt = Math.min(0.05, rawDt);
    lastNow = now;

    const y = window.scrollY;
    const vel = Math.abs(y - lastScroll) / Math.max(dt, 0.001);
    lastScroll = y;
    const st = Math.min(vel / 2200, 1.4);
    speed += (st - speed) * (1 - Math.exp(-dt * (st > speed ? 6 : 2.2)));
    common.uTime.value += dt * (1 + speed * 2.2);

    sceneAt(y, target);
    mix(cur, target, 1 - Math.exp(-rawDt * 4.2), cur);
    if (reveal < revealTarget) reveal = Math.min(revealTarget, reveal + rawDt / 1.5);

    const mk = 1 - Math.exp(-dt * 2.5);
    mouse.x += (mouse.tx - mouse.x) * mk;
    mouse.y += (mouse.ty - mouse.y) * mk;

    applyView();
    render();

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

  let compiled = false;
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
    if (!running) {
      applyView();
      render();
    }
  };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onVisibility = () => (document.hidden ? stop() : start());
  const startReveal = () => {
    revealTarget = 1;
  };
  let pendingStill = false;
  const onScrollStill = () => {
    if (pendingStill) return;
    pendingStill = true;
    requestAnimationFrame(() => {
      pendingStill = false;
      sceneAt(window.scrollY, cur);
      applyView();
      render();
    });
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    canvas.dispatchEvent(new CustomEvent('ribbons:lost', { bubbles: true }));
  };

  const ro = new ResizeObserver(() => measure());
  ro.observe(document.body);
  window.addEventListener('resize', onResize);
  window.addEventListener('load', measure);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('relay:ribbons', startReveal);
  canvas.addEventListener('webglcontextlost', onLost);
  if (!reduceMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  resize();
  measure();
  sceneAt(window.scrollY, cur);
  if (document.documentElement.classList.contains('intro-done')) revealTarget = 1;
  const fallbackTimer = window.setTimeout(startReveal, 6000);

  let disposed = false;
  // compile off the main thread where the browser can (KHR_parallel_shader_compile),
  // so the first frame does not stall the intro
  const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
  const compiled$ = parallel
    ? renderer.compileAsync(scene3, camera).catch(() => undefined)
    : new Promise<void>((resolve) =>
        // let the lime intro paint first, then compile synchronously behind it
        window.setTimeout(() => {
          if (!disposed) renderer.compile(scene3, camera);
          resolve();
        }, 60),
      );
  const ready = compiled$.then(() => {
      if (disposed) return;
      if (reduceMotion) {
        common.uTime.value = 2.5;
        reveal = revealTarget = 1;
        applyView();
        render();
        window.addEventListener('scroll', onScrollStill, { passive: true });
      } else {
        compiled = true;
        applyView();
        render();
        start();
      }
    });

  const dispose = () => {
    disposed = true;
    stop();
    window.clearTimeout(fallbackTimer);
    ro.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('load', measure);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('relay:ribbons', startReveal);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('scroll', onScrollStill);
    canvas.removeEventListener('webglcontextlost', onLost);
    [fibers, haze, dustGeo, bokehGeo, starGeo, glowGeo].forEach((g) => g.dispose());
    [hazeMat, glowMat, coreMat, dustMat, bokehMat, starMat, focalMat].forEach((m) => m.dispose());
    renderer.dispose();
  };

  return { ready, dispose };
}
