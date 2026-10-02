/* ==========================================================================
   Relay — light ribbons background (WebGL 1, no dependencies)

   A bundle of thin glowing fibers runs along a cubic Bézier. The fibers sit
   on a twisted tube that pinches into a bright focal point ("waist") and fans
   out towards both ends. The curve morphs between scenes as the page scrolls:
   every element with a [data-scene] attribute pins one scene to its position.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.querySelector('.ribbons');
  if (!canvas) return;

  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var gl = null;
  try {
    var opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' };
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  } catch (e) {
    gl = null;
  }
  if (!gl) {
    root.classList.add('no-webgl');
    return;
  }

  /* ---------------------------------------------------------------------- */
  /* Shaders                                                                 */
  /* ---------------------------------------------------------------------- */

  var RIBBON_VS = [
    'precision highp float;',
    'attribute float a_t;',
    'attribute float a_side;',
    'attribute vec4 a_seed;',
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform vec2 u_p0;',
    'uniform vec2 u_p1;',
    'uniform vec2 u_p2;',
    'uniform vec2 u_p3;',
    'uniform float u_waist;',
    'uniform vec3 u_rad;',
    'uniform float u_twist;',
    'uniform float u_flat;',
    'uniform float u_width;',
    'uniform float u_gain;',
    'uniform float u_dpr;',
    'uniform float u_reveal;',
    'varying float v_side;',
    'varying vec3 v_col;',
    '',
    'vec2 bez(float t) {',
    '  float it = 1.0 - t;',
    '  return it * it * it * u_p0 + 3.0 * it * it * t * u_p1 + 3.0 * it * t * t * u_p2 + t * t * t * u_p3;',
    '}',
    'vec2 bezd(float t) {',
    '  float it = 1.0 - t;',
    '  return 3.0 * it * it * (u_p1 - u_p0) + 6.0 * it * t * (u_p2 - u_p1) + 3.0 * t * t * (u_p3 - u_p2);',
    '}',
    '',
    'void main() {',
    '  float t = a_t;',
    '  float m = min(u_res.x, u_res.y);',
    '  vec2 c = bez(t) * u_res;',
    '  vec2 d = bezd(t) * u_res;',
    '  float dl = max(length(d), 0.0001);',
    '  vec2 tg = d / dl;',
    '  vec2 nm = vec2(-tg.y, tg.x);',
    '',
    // radius profile: pinched at the waist, opening towards both ends
    '  float far = step(u_waist, t);',
    '  float span = mix(u_waist, 1.0 - u_waist, far);',
    '  float k = clamp(abs(t - u_waist) / max(span, 0.001), 0.0, 1.0);',
    '  float open = mix(u_rad.x, u_rad.z, far);',
    '  float r = mix(u_rad.y, open, pow(k, 1.25)) * m;',
    '',
    // every fiber lives on a twisted tube around the centre line
    '  float theta = a_seed.x * 6.2831853 + u_twist * (t - u_waist) + u_time * (0.04 + 0.08 * a_seed.y);',
    '  float spread = 0.22 + 0.78 * a_seed.z;',
    '  float depth = sin(theta);',
    '  float off = mix(cos(theta) * spread, a_seed.x * 2.0 - 1.0, u_flat) * r;',
    '  off += sin(t * (4.0 + 5.0 * a_seed.w) + u_time * (0.35 + 0.3 * a_seed.y) + a_seed.w * 6.2831) * 0.016 * m * k;',
    '  vec2 pos = c + nm * off;',
    '',
    '  float w = u_width * u_dpr * (0.75 + 0.5 * a_seed.z) * (1.0 + 0.25 * depth);',
    '  pos += nm * a_side * w;',
    '',
    // brightness: brighter near the waist and for fibers facing the viewer,
    // with slow pulses travelling along each fiber
    '  float ends = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.95, t);',
    '  float nearW = exp(-pow((t - u_waist) * 6.5, 2.0));',
    '  float front = mix(0.4, 1.0, 0.5 + 0.5 * depth);',
    '  float pulse = 0.72 + 0.28 * sin(t * 34.0 - u_time * (1.6 + 1.4 * a_seed.y) + a_seed.w * 31.0);',
    '  float edge = 1.0 - u_reveal * 1.3 + a_seed.z * 0.08;',
    '  float grow = smoothstep(edge, edge + 0.22, t);',
    '  float lum = ends * front * pulse * grow * (0.5 + 1.7 * nearW) * (0.45 + 0.9 * a_seed.y) * u_gain;',
    '',
    '  vec3 lime = vec3(0.86, 0.96, 0.27);',
    '  vec3 green = vec3(0.45, 0.86, 0.34);',
    '  vec3 teal = vec3(0.33, 0.71, 0.88);',
    '  vec3 hot = vec3(1.0, 1.0, 0.86);',
    '  vec3 col = a_seed.w < 0.56 ? lime : (a_seed.w < 0.8 ? green : teal);',
    '  col = mix(col, teal, 0.45 * k * far * step(0.55, a_seed.y));',
    '  col = mix(col, hot, nearW * 0.6);',
    '',
    '  v_col = col * lum;',
    '  v_side = a_side;',
    '  vec2 clip = pos / u_res * 2.0 - 1.0;',
    '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
    '}'
  ].join('\n');

  var RIBBON_FS = [
    'precision mediump float;',
    'uniform float u_falloff;',
    'varying float v_side;',
    'varying vec3 v_col;',
    'void main() {',
    '  float a = pow(max(1.0 - abs(v_side), 0.0), u_falloff);',
    '  gl_FragColor = vec4(v_col * a, 1.0);',
    '}'
  ].join('\n');

  var GLOW_VS = [
    'attribute vec2 a_pos;',
    'void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var GLOW_FS = [
    'precision mediump float;',
    'uniform vec2 u_res;',
    'uniform vec2 u_focus;',
    'uniform float u_glow;',
    'uniform float u_haze;',
    'void main() {',
    '  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);',
    '  float m = min(u_res.x, u_res.y);',
    '  float d = length(p - u_focus) / m;',
    '  float core = exp(-d * d * 1400.0);',
    '  float halo = exp(-d * d * 60.0);',
    '  float wide = 1.0 / (1.0 + d * d * 26.0);',
    '  vec3 col = vec3(1.0, 1.0, 0.88) * core * 0.9',
    '            + vec3(0.86, 0.96, 0.3) * halo * 0.22',
    '            + vec3(0.5, 0.75, 0.25) * wide * 0.05 * u_haze;',
    '  gl_FragColor = vec4(col * u_glow, 1.0);',
    '}'
  ].join('\n');

  var STAR_VS = [
    'attribute vec3 a_star;',
    'uniform float u_scroll;',
    'uniform float u_time;',
    'uniform float u_dpr;',
    'varying float v_a;',
    'void main() {',
    '  float y = fract(a_star.y - u_scroll * (0.12 + 0.22 * a_star.z));',
    '  gl_Position = vec4(a_star.x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);',
    '  gl_PointSize = (1.0 + 1.8 * a_star.z) * u_dpr;',
    '  v_a = (0.12 + 0.5 * a_star.z) * (0.55 + 0.45 * sin(u_time * (0.6 + a_star.z) + a_star.x * 61.0));',
    '}'
  ].join('\n');

  var STAR_FS = [
    'precision mediump float;',
    'varying float v_a;',
    'void main() {',
    '  float d = length(gl_PointCoord - 0.5);',
    '  float a = smoothstep(0.5, 0.0, d);',
    '  gl_FragColor = vec4(vec3(0.86, 0.9, 0.8) * a * v_a, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile failed: ' + log);
    }
    return sh;
  }

  function link(vsSrc, fsSrc) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
    }
    var info = { program: p, attr: {}, uni: {} };
    var i, n;
    n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (i = 0; i < n; i++) {
      var a = gl.getActiveAttrib(p, i);
      info.attr[a.name] = gl.getAttribLocation(p, a.name);
    }
    n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (i = 0; i < n; i++) {
      var u = gl.getActiveUniform(p, i);
      info.uni[u.name] = gl.getUniformLocation(p, u.name);
    }
    return info;
  }

  var ribbonProg, glowProg, starProg;
  try {
    ribbonProg = link(RIBBON_VS, RIBBON_FS);
    glowProg = link(GLOW_VS, GLOW_FS);
    starProg = link(STAR_VS, STAR_FS);
  } catch (err) {
    if (window.console) console.warn('[ribbons]', err);
    root.classList.add('no-webgl');
    return;
  }

  /* ---------------------------------------------------------------------- */
  /* Geometry                                                                */
  /* ---------------------------------------------------------------------- */

  var small = Math.min(window.innerWidth, window.innerHeight) < 700;
  var LINES = small ? 64 : 96;
  var SEG = small ? 120 : 170;
  var HAZE_LINES = Math.round(LINES * 0.3);

  // deterministic PRNG so the composition is the same on every load
  var seed = 7;
  function rand() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  var stride = 6; // t, side, seed.xyzw
  var vertsPerLine = (SEG + 1) * 2;
  var vData = new Float32Array(LINES * vertsPerLine * stride);
  var iData = new Uint16Array(LINES * SEG * 6);
  var v = 0;
  var ii = 0;
  for (var l = 0; l < LINES; l++) {
    var sx = rand();
    var sy = rand();
    var sz = Math.sqrt(rand());
    var sw = rand();
    var base = l * vertsPerLine;
    for (var s = 0; s <= SEG; s++) {
      var t = s / SEG;
      for (var side = -1; side <= 1; side += 2) {
        vData[v++] = t;
        vData[v++] = side;
        vData[v++] = sx;
        vData[v++] = sy;
        vData[v++] = sz;
        vData[v++] = sw;
      }
      if (s < SEG) {
        var a = base + s * 2;
        iData[ii++] = a;
        iData[ii++] = a + 1;
        iData[ii++] = a + 2;
        iData[ii++] = a + 1;
        iData[ii++] = a + 3;
        iData[ii++] = a + 2;
      }
    }
  }

  var ribbonVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ribbonVBO);
  gl.bufferData(gl.ARRAY_BUFFER, vData, gl.STATIC_DRAW);
  var ribbonIBO = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribbonIBO);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, iData, gl.STATIC_DRAW);

  var quadVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  var STARS = small ? 90 : 170;
  var starData = new Float32Array(STARS * 3);
  for (var k = 0; k < STARS; k++) {
    starData[k * 3] = rand();
    starData[k * 3 + 1] = rand();
    starData[k * 3 + 2] = Math.pow(rand(), 2.2);
  }
  var starVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, starVBO);
  gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);

  /* ---------------------------------------------------------------------- */
  /* Scenes                                                                  */
  /* p: Bézier control points in viewport fractions (x right, y down)       */
  /* rad: [radius at start, at waist, at end] in fractions of min(w, h)     */
  /* ---------------------------------------------------------------------- */

  var SCENES = {
    hero: {
      p: [[0.8, 1.2], [0.3, 0.74], [0.29, 0.44], [1.2, 0.02]],
      waist: 0.4, rad: [0.12, 0.01, 0.3], twist: 5.5, flat: 0.15, glow: 1, gain: 1
    },
    arc: {
      p: [[0.46, -0.22], [1.08, 0.12], [1.06, 0.84], [0.6, 1.24]],
      waist: 0.5, rad: [0.05, 0.035, 0.09], twist: 3.2, flat: 0.45, glow: 0.05, gain: 0.9
    },
    sweep: {
      p: [[-0.2, 0.96], [0.3, 0.92], [0.42, 0.24], [1.2, 0.12]],
      waist: 0.45, rad: [0.12, 0.05, 0.24], twist: 4.2, flat: 0.35, glow: 0.25, gain: 0.95
    },
    low: {
      p: [[-0.2, 0.7], [0.35, 1.05], [0.7, 0.3], [1.2, 0.42]],
      waist: 0.5, rad: [0.1, 0.06, 0.14], twist: 3.5, flat: 0.4, glow: 0.1, gain: 0.8
    },
    edge: {
      p: [[1.12, -0.2], [0.78, 0.22], [0.86, 0.74], [1.14, 1.2]],
      waist: 0.5, rad: [0.07, 0.05, 0.11], twist: 3.6, flat: 0.45, glow: 0, gain: 0.85
    },
    dusk: {
      p: [[0.1, 1.25], [0.42, 0.72], [0.82, 0.86], [1.22, 0.36]],
      waist: 0.42, rad: [0.1, 0.04, 0.2], twist: 4.6, flat: 0.3, glow: 0.3, gain: 0.85
    },
    loop: {
      p: [[0.52, 1.25], [-0.12, 0.74], [0.06, 0.06], [0.95, 0.06]],
      waist: 0.47, rad: [0.12, 0.03, 0.18], twist: 5, flat: 0.25, glow: 0.55, gain: 1
    },
    wave: {
      p: [[-0.2, 0.4], [0.32, 0.26], [0.58, 0.82], [1.2, 0.5]],
      waist: 0.55, rad: [0.08, 0.035, 0.22], twist: 6, flat: 0.3, glow: 0.4, gain: 0.95
    },
    finale: {
      p: [[0.2, 1.2], [0.7, 0.78], [0.72, 0.4], [-0.2, 0.06]],
      waist: 0.42, rad: [0.12, 0.012, 0.28], twist: 5.5, flat: 0.15, glow: 0.9, gain: 1
    }
  };

  function cloneScene(sc) {
    return {
      p: sc.p.map(function (pt) { return [pt[0], pt[1]]; }),
      waist: sc.waist,
      rad: sc.rad.slice(),
      twist: sc.twist,
      flat: sc.flat,
      glow: sc.glow,
      gain: sc.gain
    };
  }

  function mixScene(a, b, f, out) {
    for (var i = 0; i < 4; i++) {
      out.p[i][0] = a.p[i][0] + (b.p[i][0] - a.p[i][0]) * f;
      out.p[i][1] = a.p[i][1] + (b.p[i][1] - a.p[i][1]) * f;
    }
    for (var j = 0; j < 3; j++) out.rad[j] = a.rad[j] + (b.rad[j] - a.rad[j]) * f;
    out.waist = a.waist + (b.waist - a.waist) * f;
    out.twist = a.twist + (b.twist - a.twist) * f;
    out.flat = a.flat + (b.flat - a.flat) * f;
    out.glow = a.glow + (b.glow - a.glow) * f;
    out.gain = a.gain + (b.gain - a.gain) * f;
    return out;
  }

  function smooth(x) {
    x = Math.min(1, Math.max(0, x));
    return x * x * (3 - 2 * x);
  }

  var keys = [];
  function measure() {
    keys = [];
    var vh = window.innerHeight;
    var els = document.querySelectorAll('[data-scene]');
    for (var i = 0; i < els.length; i++) {
      var sc = SCENES[els[i].getAttribute('data-scene')];
      if (!sc) continue;
      var top = els[i].getBoundingClientRect().top + window.pageYOffset;
      keys.push({ at: Math.max(0, top - vh * 0.35), scene: sc });
    }
    keys.sort(function (a, b) { return a.at - b.at; });
    if (!keys.length) keys.push({ at: 0, scene: SCENES.hero });
  }

  function sceneAt(scrollY, out) {
    var vh = window.innerHeight;
    if (scrollY <= keys[0].at || keys.length === 1) return mixScene(keys[0].scene, keys[0].scene, 0, out);
    for (var i = 0; i < keys.length - 1; i++) {
      var a = keys[i];
      var b = keys[i + 1];
      if (scrollY < b.at) {
        var start = Math.max(a.at, b.at - vh * 0.9);
        return mixScene(a.scene, b.scene, smooth((scrollY - start) / Math.max(1, b.at - start)), out);
      }
    }
    var last = keys[keys.length - 1].scene;
    return mixScene(last, last, 0, out);
  }

  /* ---------------------------------------------------------------------- */
  /* State, sizing, input                                                    */
  /* ---------------------------------------------------------------------- */

  var maxDpr = Math.min(window.devicePixelRatio || 1, 1.75);
  var dpr = maxDpr;
  var W = 0;
  var H = 0;
  var cur = cloneScene(SCENES.hero);
  var target = cloneScene(SCENES.hero);
  var view = cloneScene(SCENES.hero);
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  var time = 0;
  var speed = 0;
  var lastScroll = window.pageYOffset;
  var lastNow = 0;
  var raf = 0;
  var running = false;
  var lineCount = LINES;
  var reveal = 0;
  var revealTarget = 0;

  function resize() {
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = w;
      canvas.height = h;
    }
    W = w;
    H = h;
  }

  var lastVW = window.innerWidth;
  var lastVH = window.innerHeight;
  window.addEventListener('resize', function () {
    // ignore the small height jumps caused by mobile browser toolbars
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (vw === lastVW && Math.abs(vh - lastVH) < 140) return;
    lastVW = vw;
    lastVH = vh;
    resize();
    measure();
    if (!running) render();
  });

  window.addEventListener('load', function () {
    measure();
    if (!running) render();
  });

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () {
      measure();
    });
    ro.observe(document.body);
  }

  if (!reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  /* ---------------------------------------------------------------------- */
  /* Drawing                                                                 */
  /* ---------------------------------------------------------------------- */

  function bezPoint(sc, t) {
    var it = 1 - t;
    var a = it * it * it;
    var b = 3 * it * it * t;
    var c = 3 * it * t * t;
    var d = t * t * t;
    return [
      a * sc.p[0][0] + b * sc.p[1][0] + c * sc.p[2][0] + d * sc.p[3][0],
      a * sc.p[0][1] + b * sc.p[1][1] + c * sc.p[2][1] + d * sc.p[3][1]
    ];
  }

  function drawStars(scrollFrac) {
    var P = starProg;
    gl.useProgram(P.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, starVBO);
    gl.enableVertexAttribArray(P.attr.a_star);
    gl.vertexAttribPointer(P.attr.a_star, 3, gl.FLOAT, false, 12, 0);
    gl.uniform1f(P.uni.u_scroll, scrollFrac);
    gl.uniform1f(P.uni.u_time, time);
    gl.uniform1f(P.uni.u_dpr, dpr);
    gl.drawArrays(gl.POINTS, 0, STARS);
    gl.disableVertexAttribArray(P.attr.a_star);
  }

  function drawRibbons(sc) {
    var P = ribbonProg;
    var A = P.attr;
    var U = P.uni;
    gl.useProgram(P.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, ribbonVBO);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribbonIBO);
    gl.enableVertexAttribArray(A.a_t);
    gl.enableVertexAttribArray(A.a_side);
    gl.enableVertexAttribArray(A.a_seed);
    gl.vertexAttribPointer(A.a_t, 1, gl.FLOAT, false, stride * 4, 0);
    gl.vertexAttribPointer(A.a_side, 1, gl.FLOAT, false, stride * 4, 4);
    gl.vertexAttribPointer(A.a_seed, 4, gl.FLOAT, false, stride * 4, 8);

    gl.uniform2f(U.u_res, W, H);
    gl.uniform1f(U.u_time, time);
    gl.uniform2f(U.u_p0, sc.p[0][0], sc.p[0][1]);
    gl.uniform2f(U.u_p1, sc.p[1][0], sc.p[1][1]);
    gl.uniform2f(U.u_p2, sc.p[2][0], sc.p[2][1]);
    gl.uniform2f(U.u_p3, sc.p[3][0], sc.p[3][1]);
    gl.uniform1f(U.u_waist, sc.waist);
    gl.uniform3f(U.u_rad, sc.rad[0], sc.rad[1], sc.rad[2]);
    gl.uniform1f(U.u_twist, sc.twist);
    gl.uniform1f(U.u_flat, sc.flat);
    gl.uniform1f(U.u_dpr, dpr);
    gl.uniform1f(U.u_reveal, reveal);

    var perLine = SEG * 6;
    // portrait screens put the ribbons behind body copy: keep them calmer
    var calm = W < H ? 0.58 : 1;
    // soft haze (subset of fibers, very wide)
    gl.uniform1f(U.u_width, 30);
    gl.uniform1f(U.u_gain, 0.016 * sc.gain * calm);
    gl.uniform1f(U.u_falloff, 1.6);
    gl.drawElements(gl.TRIANGLES, Math.min(HAZE_LINES, lineCount) * perLine, gl.UNSIGNED_SHORT, 0);
    // glow
    gl.uniform1f(U.u_width, 4.5);
    gl.uniform1f(U.u_gain, 0.075 * sc.gain * calm);
    gl.uniform1f(U.u_falloff, 2.2);
    gl.drawElements(gl.TRIANGLES, lineCount * perLine, gl.UNSIGNED_SHORT, 0);
    // crisp core
    gl.uniform1f(U.u_width, 1.05);
    gl.uniform1f(U.u_gain, 0.42 * sc.gain * calm);
    gl.uniform1f(U.u_falloff, 1.0);
    gl.drawElements(gl.TRIANGLES, lineCount * perLine, gl.UNSIGNED_SHORT, 0);

    gl.disableVertexAttribArray(A.a_t);
    gl.disableVertexAttribArray(A.a_side);
    gl.disableVertexAttribArray(A.a_seed);
  }

  function drawGlow(sc) {
    if (sc.glow < 0.01) return;
    var P = glowProg;
    var f = bezPoint(sc, sc.waist);
    gl.useProgram(P.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.enableVertexAttribArray(P.attr.a_pos);
    gl.vertexAttribPointer(P.attr.a_pos, 2, gl.FLOAT, false, 8, 0);
    gl.uniform2f(P.uni.u_res, W, H);
    gl.uniform2f(P.uni.u_focus, f[0] * W, f[1] * H);
    gl.uniform1f(P.uni.u_glow, sc.glow * (W < H ? 0.65 : 1) * Math.max(0, Math.min(1, (reveal - 0.55) / 0.45)));
    gl.uniform1f(P.uni.u_haze, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(P.attr.a_pos);
  }

  function render() {
    if (!W || !H) resize();
    var sc = view;
    gl.viewport(0, 0, W, H);
    gl.clearColor(10 / 255, 11 / 255, 10 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
    drawStars(window.pageYOffset / Math.max(1, window.innerHeight));
    drawRibbons(sc);
    drawGlow(sc);
  }

  /* ---------------------------------------------------------------------- */
  /* Loop                                                                    */
  /* ---------------------------------------------------------------------- */

  var slowFrames = 0;
  var sampled = 0;

  function applyView() {
    // mouse parallax: nudge the inner control points and the waist
    var mx = mouse.x;
    var my = mouse.y;
    for (var i = 0; i < 4; i++) {
      var wgt = i === 1 || i === 2 ? 0.035 : 0.012;
      view.p[i][0] = cur.p[i][0] + mx * wgt;
      view.p[i][1] = cur.p[i][1] + my * wgt;
    }
    view.waist = cur.waist;
    view.rad[0] = cur.rad[0];
    view.rad[1] = cur.rad[1] * (1 + speed * 0.8);
    view.rad[2] = cur.rad[2] * (1 + speed * 0.12);
    view.twist = cur.twist + speed * 1.5;
    view.flat = cur.flat;
    view.glow = cur.glow * (1 + speed * 0.25);
    view.gain = cur.gain * (1 + speed * 0.18);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var rawDt = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 0.016;
    var dt = Math.min(0.05, rawDt);
    lastNow = now;

    var sy = window.pageYOffset;
    var vel = Math.abs(sy - lastScroll) / Math.max(dt, 0.001);
    lastScroll = sy;
    var sTarget = Math.min(vel / 2200, 1.4);
    speed += (sTarget - speed) * (1 - Math.exp(-dt * (sTarget > speed ? 6 : 2.2)));
    time += dt * (1 + speed * 2.2);

    sceneAt(sy, target);
    mixScene(cur, target, 1 - Math.exp(-dt * 4.2), cur);
    if (reveal < revealTarget) reveal = Math.min(revealTarget, reveal + rawDt / 1.6);

    var mk = 1 - Math.exp(-dt * 2.5);
    mouse.x += (mouse.tx - mouse.x) * mk;
    mouse.y += (mouse.ty - mouse.y) * mk;

    applyView();
    render();

    // adaptive quality: step down if the GPU is struggling
    if (sampled < 400) {
      sampled++;
      if (dt > 0.026) slowFrames++;
      if (sampled === 120 || sampled === 400) {
        if (slowFrames > sampled * 0.45) {
          if (dpr > 1) {
            dpr = 1;
            resize();
          } else if (lineCount > 48) {
            lineCount = Math.round(lineCount * 0.6);
          }
        }
        slowFrames = 0;
      }
    }
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    lastNow = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // the intro tells us when to grow the ribbons in; never wait forever
  function startReveal() { revealTarget = 1; }
  document.addEventListener('relay:reveal', startReveal);
  setTimeout(startReveal, 6000);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    stop();
    root.classList.add('no-webgl');
  });

  resize();
  measure();
  sceneAt(window.pageYOffset, cur);
  applyView();

  if (reduceMotion) {
    // a single still frame, refreshed when the page scrolls
    time = 2.5;
    reveal = revealTarget = 1;
    render();
    var pending = false;
    window.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        sceneAt(window.pageYOffset, cur);
        applyView();
        render();
      });
    }, { passive: true });
  } else {
    start();
  }
})();
