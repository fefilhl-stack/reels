/* ==========================================================================
   Isometric run columns (three.js)

   One column per weekday seen through an orthographic isometric camera.
   Columns start as cubes; thin plates hover above them and drop one by one,
   growing each column to its value. The highlighted day is lime.
   ========================================================================== */

import type * as THREE_NS from 'three';

type Three = typeof THREE_NS;

const VS = /* glsl */ `
varying vec3 vN;
varying vec2 vUv;
void main() {
  vN = normal;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// flat face colors with a soft vertical fade on the sides
const FS = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uLeft;
uniform vec3 uRight;
uniform float uOpacity;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 c;
  if (vN.y > 0.5) c = uTop;
  else if (vN.x > 0.5) c = uRight * mix(0.5, 1.0, vUv.y);
  else c = uLeft * mix(0.5, 1.0, vUv.y);
  gl_FragColor = vec4(c, uOpacity);
}
`;

const hex = (THREE: Three, h: string) => {
  const n = parseInt(h.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

type Options = { values: number[]; highlight: number };

export type IsoBars = { start: () => void; stop: () => void; resize: () => void; dispose: () => void };

export function createIsoBars(THREE: Three, canvas: HTMLCanvasElement, { values, highlight }: Options): IsoBars {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  const DIR = new THREE.Vector3(1, 1, 1).normalize();

  const n = values.length;
  const maxH = Math.max(...values);
  const STEP = 0.42; // height each plate adds
  const GAP = 0.62; // plate hover height above the column
  const PLATE = 0.14;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const colGeo = new THREE.BoxGeometry(1, 1, 1);
  colGeo.translate(0, 0.5, 0);
  const plateGeo = new THREE.BoxGeometry(0.98, PLATE, 0.98);
  plateGeo.translate(0, PLATE / 2, 0);

  const mat = (top: string, left: string, right: string) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: hex(THREE, top) },
        uLeft: { value: hex(THREE, left) },
        uRight: { value: hex(THREE, right) },
        uOpacity: { value: 1 },
      },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
    });

  type Col = {
    group: THREE_NS.Group;
    body: THREE_NS.Mesh;
    plate: THREE_NS.Mesh;
    plateMat: THREE_NS.ShaderMaterial;
    bodyMat: THREE_NS.ShaderMaterial;
    h: number;
    target: number;
    clock: number;
    phase: 'wait' | 'hover' | 'drop' | 'settle' | 'idle';
    appear: number;
  };

  const cols: Col[] = values.map((v, i) => {
    const hot = i === highlight;
    const bodyMat = hot ? mat('#9cc33c', '#2e3a10', '#4b6119') : mat('#56575c', '#1d1e21', '#2d2e33');
    const plateMat = hot ? mat('#c0f349', '#4a6018', '#6d8a24') : mat('#d7d8da', '#6c6d72', '#8e8f94');
    const body = new THREE.Mesh(colGeo, bodyMat);
    const plate = new THREE.Mesh(plateGeo, plateMat);
    const group = new THREE.Group();
    group.add(body, plate);
    scene.add(group);
    return { group, body, plate, plateMat, bodyMat, h: 1, target: v, clock: 0, phase: 'wait', appear: 0 };
  });

  let W = 1;
  let H = 1;

  function layout() {
    W = Math.max(1, canvas.clientWidth);
    H = Math.max(1, canvas.clientHeight);
    renderer.setSize(W, H, false);
    // px per world unit: fit width (footprint diagonal ~58% of a slot) and height
    const slot = W / n;
    const kW = (slot * 0.58) / Math.SQRT2;
    const span = 0.816 * (maxH + GAP + PLATE + 0.25) + 0.816;
    const kH = (H - 16) / span;
    const k = Math.min(kW, kH);
    const spacing = slot / k;
    const across = new THREE.Vector3(1, 0, -1).normalize();
    cols.forEach((c, i) => c.group.position.copy(across.clone().multiplyScalar((i - (n - 1) / 2) * spacing)));
    camera.left = -W / 2 / k;
    camera.right = W / 2 / k;
    camera.top = H / 2 / k;
    camera.bottom = -H / 2 / k;
    // put the column bases just above the bottom edge
    const yT = (H / 2 / k - 10 / k - 0.408) / 0.816;
    const target = new THREE.Vector3(0, yT, 0);
    camera.position.copy(target).addScaledVector(DIR, 20);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t: number) => t * t * t;

  let time = 0;
  function update(dt: number) {
    time += dt;
    cols.forEach((c, i) => {
      c.clock += dt;
      const bob = Math.sin(time * 1.6 + i * 0.9) * 0.05;
      const hover = c.h + GAP + bob;
      if (c.phase === 'wait') {
        c.appear = 0;
        c.plateMat.uniforms.uOpacity.value = 0;
        if (c.clock > i * 0.22) {
          c.phase = 'hover';
          c.clock = 0;
        }
      } else {
        c.appear = Math.min(1, c.appear + dt / 0.5);
      }
      const a = easeOut(c.appear);
      c.bodyMat.uniforms.uOpacity.value = a;
      c.body.scale.set(1, c.h * (0.6 + 0.4 * a), 1);

      if (c.phase === 'hover') {
        c.plate.position.y = hover + (1 - a) * 0.6;
        c.plateMat.uniforms.uOpacity.value = a;
        if (c.h < c.target - 0.01 && c.clock > 0.55 + i * 0.03) {
          c.phase = 'drop';
          c.clock = 0;
        } else if (c.h >= c.target - 0.01) {
          c.phase = 'idle';
        }
      } else if (c.phase === 'drop') {
        const p = Math.min(1, c.clock / 0.3);
        c.plate.position.y = c.h + (hover - c.h) * (1 - easeIn(p));
        if (p >= 1) {
          c.h = Math.min(c.target, c.h + STEP);
          c.phase = 'settle';
          c.clock = 0;
        }
      } else if (c.phase === 'settle') {
        // a fresh plate fades in from above
        const p = Math.min(1, c.clock / 0.35);
        c.plate.position.y = hover + (1 - easeOut(p)) * 0.7;
        c.plateMat.uniforms.uOpacity.value = easeOut(p);
        if (p >= 1) {
          c.phase = 'hover';
          c.clock = 0;
        }
      } else if (c.phase === 'idle') {
        c.plate.position.y = hover;
        c.plateMat.uniforms.uOpacity.value = 1;
      }
    });
  }

  function finishNow() {
    cols.forEach((c) => {
      c.h = c.target;
      c.appear = 1;
      c.phase = 'idle';
      c.body.scale.set(1, c.h, 1);
      c.bodyMat.uniforms.uOpacity.value = 1;
      c.plate.position.y = c.h + GAP;
      c.plateMat.uniforms.uOpacity.value = 1;
    });
  }

  let raf = 0;
  let last = 0;
  let running = false;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    update(dt);
    renderer.render(scene, camera);
  };

  layout();
  if (reduce) finishNow();
  renderer.render(scene, camera);

  return {
    start() {
      if (running) return;
      if (reduce) {
        renderer.render(scene, camera);
        return;
      }
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    resize() {
      layout();
      renderer.render(scene, camera);
    },
    dispose() {
      cancelAnimationFrame(raf);
      colGeo.dispose();
      plateGeo.dispose();
      cols.forEach((c) => {
        c.bodyMat.dispose();
        c.plateMat.dispose();
      });
      renderer.dispose();
    },
  };
}
