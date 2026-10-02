/* ==========================================================================
   Relay — page interactions
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q).matches : false; };
  var reduceMotion = mq('(prefers-reduced-motion: reduce)');
  var finePointer = mq('(hover: hover) and (pointer: fine)');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

  // deterministic random so generated charts look the same on every visit
  function seeded(s) {
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // run a callback whenever an element enters / leaves the viewport
  function watch(el, onChange, margin) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { onChange(true); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { onChange(en.isIntersecting); });
    }, { rootMargin: margin || '0px' }).observe(el);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* ------------------------------------------------------------------------
     Scroll reveal + counters
     ------------------------------------------------------------------------ */
  var counters = $$('[data-count]');
  if (!reduceMotion) {
    counters.forEach(function (el) {
      el.textContent = '0' + (el.getAttribute('data-suffix') || '');
    });
  }

  function countUp(el) {
    if (el._counted) return;
    el._counted = true;
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduceMotion) {
      el.textContent = fmt(target) + suffix;
      return;
    }
    var dur = 1500 + Math.min(1100, String(target).length * 140);
    var t0 = performance.now();
    (function step(now) {
      var p = clamp((now - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(target * e) + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  function onRevealed(el) {
    if (el.hasAttribute('data-count')) countUp(el);
    $$('[data-count]', el).forEach(countUp);
    var ring = el.matches('[data-ring]') ? el : $('[data-ring]', el);
    if (ring) {
      var v = parseFloat(getComputedStyle(ring).getPropertyValue('--v')) || 0;
      $('.ring__bar', ring).style.setProperty('--off', String(100 - v * 100));
    }
  }

  var revealStarted = false;
  function initReveal() {
    if (revealStarted) return;
    revealStarted = true;
    var els = $$('[data-reveal]');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (el) {
        el.classList.add('is-in');
        onRevealed(el);
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        onRevealed(en.target);
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.1 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------------
     Intro: a line runs around the screen, lime floods it, then the lime
     shrinks into a tile that lands on the first node of the hero workflow.
     ------------------------------------------------------------------------ */
  function revealBackground() {
    document.dispatchEvent(new CustomEvent('relay:reveal'));
  }

  (function intro() {
    var el = $('.intro');
    var target = $('[data-node="start"]');
    if (!el || reduceMotion) {
      if (el) el.classList.add('is-done');
      initReveal();
      revealBackground();
      return;
    }

    var bg = $('.intro__bg', el);
    var rect = $('.intro__frame rect', el);
    var panel = $('.intro__panel', el);
    var tile = $('.intro__tile', el);
    if (target) target.classList.add('is-intro-target');
    root.classList.add('is-locked');

    var W = window.innerWidth;
    var H = window.innerHeight;
    var TILE = 64;
    var inset = W < 700 ? 8 : 12;
    rect.setAttribute('x', inset);
    rect.setAttribute('y', inset);
    rect.setAttribute('width', Math.max(0, W - inset * 2));
    rect.setAttribute('height', Math.max(0, H - inset * 2));
    rect.setAttribute('rx', W < 700 ? 14 : 20);

    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function prog(now, a, b) { return clamp((now - a) / (b - a), 0, 1); }

    // rect = { l, t, r, b, rad } in px, drawn as an inset clip-path
    function setPanel(q) {
      panel.style.clipPath = 'inset(' + q.t.toFixed(1) + 'px ' + (W - q.r).toFixed(1) + 'px ' + (H - q.b).toFixed(1) + 'px ' + q.l.toFixed(1) + 'px round ' + q.rad.toFixed(1) + 'px)';
    }
    function mixRect(a, b, f) {
      return { l: lerp(a.l, b.l, f), t: lerp(a.t, b.t, f), r: lerp(a.r, b.r, f), b: lerp(a.b, b.b, f), rad: lerp(a.rad, b.rad, f) };
    }
    function square(cx, cy, size, rad) {
      return { l: cx - size / 2, t: cy - size / 2, r: cx + size / 2, b: cy + size / 2, rad: rad };
    }
    function setTile(cx, cy, scale) {
      tile.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0) scale(' + scale.toFixed(3) + ')';
    }

    var cx = W / 2;
    var cy = H / 2;
    var small = square(cx, cy, TILE, 18);
    var full = { l: 0, t: 0, r: W, b: H, rad: 0 };
    setPanel(small);
    setTile(cx, cy, 0.6);
    panel.style.opacity = '0';

    // where the tile lands: the first workflow node, or the header logo when
    // that node is not on screen (small viewports, restored scroll position)
    function landing() {
      var cand = [target, $('.site-header .brand__mark')];
      for (var i = 0; i < cand.length; i++) {
        if (!cand[i]) continue;
        var b = cand[i].getBoundingClientRect();
        if (b.width && b.top > 40 && b.bottom < H - 24 && b.left > -b.width / 2 && b.right < W + b.width / 2) {
          return { el: cand[i], x: b.left + b.width / 2, y: b.top + b.height / 2, size: Math.max(44, Math.min(96, b.height * 1.7)) };
        }
      }
      return { el: null, x: cx, y: cy, size: 48 };
    }

    var fontsReady = false;
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fonts.then(function () { fontsReady = true; }, function () { fontsReady = true; });

    // timeline (ms); phase B waits for the fonts, at most 1.2 s extra
    var DRAW = 950;
    var t0 = 0;
    var tB = 0;
    var land = null;
    var shrinkFrom = null;
    var revealed = false;

    function frame(now) {
      if (!t0) t0 = now; // start on the first painted frame (background tabs)
      var t = now - t0;

      // A — tile pops in, the line runs around the screen
      var a = easeOut(prog(t, 0, 380));
      setTile(cx, cy, 0.6 + 0.4 * a);
      tile.style.opacity = String(a);
      rect.style.strokeDashoffset = String(1 - ease(prog(t, 120, DRAW)));

      if (!tB) {
        if (t >= DRAW && (fontsReady || t > DRAW + 1200)) tB = t;
        requestAnimationFrame(frame);
        return;
      }

      // B — lime floods the screen from the tile
      var b = ease(prog(t, tB, tB + 380));
      panel.style.opacity = '1';
      setPanel(mixRect(small, full, b));
      rect.style.opacity = String(1 - b);
      if (b > 0.35) el.classList.add('is-flooded');

      // C — short hold, then the page appears behind the lime
      var tD = tB + 380 + 140;
      if (t < tD) {
        requestAnimationFrame(frame);
        return;
      }
      if (!land) {
        bg.style.display = 'none';
        root.classList.remove('is-locked');
        land = landing();
        shrinkFrom = full;
        initReveal();
      }

      // D — the lime shrinks into a tile and flies to the landing spot
      // (tracked every frame: the hero card is still easing into place)
      if (land.el) {
        var lb = land.el.getBoundingClientRect();
        land.x = lb.left + lb.width / 2;
        land.y = lb.top + lb.height / 2;
      }
      var d = ease(prog(t, tD, tD + 900));
      var end = square(land.x, land.y, land.size, Math.min(26, land.size * 0.3));
      var q = mixRect(shrinkFrom, end, d);
      var qw = q.r - q.l;
      var qh = q.b - q.t;
      // big soft corners while it shrinks, settling on the tile radius
      q.rad = lerp(lerp(0, Math.min(64, Math.min(qw, qh) * 0.27), ease(Math.min(1, d * 4))), end.rad, Math.max(0, d - 0.75) / 0.25);
      setPanel(q);
      setTile((q.l + q.r) / 2, (q.t + q.b) / 2, Math.min(1, (Math.min(qw, qh) * 0.6) / TILE));

      // E — the tile turns into the node
      var e = prog(t, tD + 900, tD + 1250);
      if (e > 0) {
        el.style.opacity = String(1 - e);
        if (target) target.classList.add('is-landed');
        if (!revealed) {
          revealed = true;
          revealBackground();
        }
      }
      if (e < 1) {
        requestAnimationFrame(frame);
      } else {
        el.classList.add('is-done');
      }
    }

    requestAnimationFrame(frame);

    // safety net: never leave the page locked behind the intro
    setTimeout(function () {
      if (el.classList.contains('is-done')) return;
      el.classList.add('is-done');
      root.classList.remove('is-locked');
      if (target) target.classList.add('is-landed');
      initReveal();
      revealBackground();
    }, 9000);
  })();

  /* ------------------------------------------------------------------------
     Header: scrolled state, active link, mobile menu
     ------------------------------------------------------------------------ */
  var header = $('.site-header');
  var toggle = $('.menu-toggle');
  var nav = $('#site-nav');

  function setMenu(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('is-open', open);
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
  }
  if (nav) {
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });

  var navLinks = $$('.nav a[href^="#"]:not(.btn)').map(function (a) {
    return { link: a, target: $(a.getAttribute('href')) };
  }).filter(function (x) { return x.target; });

  function updateNav() {
    var probe = window.innerHeight * 0.4;
    var active = null;
    navLinks.forEach(function (x) {
      var r = x.target.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) active = x.link;
    });
    navLinks.forEach(function (x) { x.link.classList.toggle('is-active', x.link === active); });
  }

  /* ------------------------------------------------------------------------
     Hero workflow card: connectors + live "last runs" feed
     ------------------------------------------------------------------------ */
  (function flow() {
    var wrap = $('[data-flow]');
    if (!wrap) return;
    var svg = $('.flow-lines', wrap);
    var nodes = {};
    $$('[data-node]', wrap).forEach(function (n) { nodes[n.getAttribute('data-node')] = n; });
    var edges = [['start', 'cond', 0], ['start', 'log', 0.45], ['cond', 'ask', 1.3], ['log', 'ask', 1.75]];

    function draw() {
      var box = wrap.getBoundingClientRect();
      if (!box.width) return;
      var html = '';
      svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
      edges.forEach(function (e) {
        var a = nodes[e[0]].getBoundingClientRect();
        var b = nodes[e[1]].getBoundingClientRect();
        var x1 = a.right - box.left;
        var y1 = a.top + a.height / 2 - box.top;
        var x2 = b.left - box.left;
        var y2 = b.top + b.height / 2 - box.top;
        var dx = Math.max(18, (x2 - x1) * 0.55);
        var d = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
          ' C' + (x1 + dx).toFixed(1) + ' ' + y1.toFixed(1) + ' ' + (x2 - dx).toFixed(1) + ' ' + y2.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
        html += '<path class="edge" d="' + d + '"/>';
        html += '<path class="edge-pulse" pathLength="100" style="--delay:' + e[2] + 's" d="' + d + '"/>';
        html += '<circle class="edge-dot" r="2.6" cx="' + x1.toFixed(1) + '" cy="' + y1.toFixed(1) + '"/>';
        html += '<circle class="edge-dot" r="2.6" cx="' + x2.toFixed(1) + '" cy="' + y2.toFixed(1) + '"/>';
        var label = $('[data-edge-label="' + e[0] + '-' + e[1] + '"]', wrap);
        if (label) {
          // midpoint of the cubic
          var mx = 0.125 * x1 + 0.375 * (x1 + dx) + 0.375 * (x2 - dx) + 0.125 * x2;
          var my = 0.5 * y1 + 0.5 * y2;
          label.style.left = mx.toFixed(1) + 'px';
          label.style.top = my.toFixed(1) + 'px';
        }
      });
      svg.innerHTML = html;
    }

    draw();
    if (window.ResizeObserver) new ResizeObserver(draw).observe(wrap);
    else window.addEventListener('resize', debounce(draw, 150));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

    // live feed
    var list = $('[data-runs]');
    var visible = false;
    watch($('.flow-card'), function (v) { visible = v; });
    var names = ['refunds over 5000', 'weekly export', 'invoice reminder', 'new signup to crm', 'trial ending nudge', 'payout reconcile', 'churn alert'];
    var clock = new Date(2026, 0, 6, 9, 41, 2).getTime();
    var n = 0;
    function pad(x) { return (x < 10 ? '0' : '') + x; }
    if (list && !reduceMotion) {
      setInterval(function () {
        if (!visible || document.hidden) return;
        clock += (35 + Math.round(Math.random() * 110)) * 1000;
        var d = new Date(clock);
        var li = document.createElement('li');
        li.className = 'is-new';
        li.innerHTML = '<i></i><time>' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
          '</time><span>' + names[n++ % names.length] + '</span>';
        list.insertBefore(li, list.firstChild);
        while (list.children.length > 3) list.removeChild(list.lastChild);
      }, 3400);
    }
  })();

  /* ------------------------------------------------------------------------
     Apps strip: a highlight (and a little cursor) hops between apps
     ------------------------------------------------------------------------ */
  (function apps() {
    var list = $('[data-apps]');
    if (!list) return;
    var items = $$('.app:not(.app--more)', list);
    var pointer = $('.apps__pointer', list);
    var idx = 0;
    var visible = false;

    function place() {
      var tile = $('.app__tile', items[idx]);
      var lb = list.getBoundingClientRect();
      var tb = tile.getBoundingClientRect();
      if (pointer) {
        pointer.style.transform = 'translate(' + (tb.right - lb.left - 12).toFixed(1) + 'px,' + (tb.bottom - lb.top - 14).toFixed(1) + 'px)';
      }
    }

    function activate(i) {
      idx = i;
      items.forEach(function (a, j) { a.classList.toggle('is-active', j === i); });
      place();
    }

    activate(0);
    window.addEventListener('resize', debounce(place, 150));
    watch(list, function (v) { visible = v; });
    items.forEach(function (a, i) {
      a.addEventListener('mouseenter', function () { activate(i); });
    });
    if (!reduceMotion) {
      setInterval(function () {
        if (visible && !document.hidden) activate((idx + 1) % items.length);
      }, 1800);
    }
  })();

  /* ------------------------------------------------------------------------
     01 — run timeline replays itself while visible
     ------------------------------------------------------------------------ */
  (function timeline() {
    var tl = $('[data-timeline]');
    if (!tl) return;
    var rows = $$('.timeline__rows li', tl);
    var runId = $('[data-run-id]', tl);
    var id = parseInt(runId.textContent, 10);
    var timer = null;
    var playing = false;

    function finish() {
      rows.forEach(function (r) { r.classList.add('is-done'); });
    }

    if (reduceMotion) {
      finish();
      return;
    }

    function play() {
      rows.forEach(function (r) { r.classList.remove('is-done', 'is-current'); });
      var i = 0;
      (function next() {
        if (i > 0) rows[i - 1].classList.remove('is-current');
        if (i >= rows.length) {
          timer = setTimeout(function () {
            id += 1 + Math.floor(Math.random() * 3);
            runId.textContent = id;
            play();
          }, 2600);
          return;
        }
        rows[i].classList.add('is-done', 'is-current');
        i++;
        timer = setTimeout(next, 700);
      })();
    }

    watch(tl, function (v) {
      if (v && !playing) {
        playing = true;
        play();
      } else if (!v && playing) {
        playing = false;
        clearTimeout(timer);
        finish();
      }
    }, '-10% 0px');
  })();

  /* ------------------------------------------------------------------------
     02 — Slack approval buttons
     ------------------------------------------------------------------------ */
  (function slack() {
    var box = $('[data-slack]');
    if (!box) return;
    var out = $('[data-slack-result]', box);
    var reset;
    function decide(text) {
      box.classList.add('is-decided');
      out.textContent = text;
      clearTimeout(reset);
      reset = setTimeout(function () {
        box.classList.remove('is-decided');
        out.textContent = '';
      }, 5200);
    }
    $('[data-approve]', box).addEventListener('click', function () {
      decide('✓ approved by you · run #4183 picked up where it stopped');
    });
    $('[data-deny]', box).addEventListener('click', function () {
      decide('× denied by you · refund held, support was told why');
    });
  })();

  /* ------------------------------------------------------------------------
     03 — isometric stacks
     ------------------------------------------------------------------------ */
  (function stacks() {
    var wrap = $('[data-stacks]');
    if (!wrap) return;
    var cols = $$('.stacks__col', wrap);
    var max = 0;
    cols.forEach(function (c) { max = Math.max(max, parseInt(c.getAttribute('data-value'), 10) || 0); });
    var gap = 10;
    var H = 30 + (max - 1) * gap + 34;

    cols.forEach(function (col, c) {
      var n = parseInt(col.getAttribute('data-value'), 10) || 1;
      var today = col.classList.contains('is-today');
      var top = today ? '#eefb9a' : '#e4e0ff';
      var topEdge = today ? '#fbffd9' : '#ffffff';
      var left = today ? '#9fbe22' : '#8a82c9';
      var right = today ? '#c4e232' : '#b2abe8';
      var baseY = H - 18;
      var topY = baseY - (n - 1) * gap;
      var id = 'stk' + c;
      var s = '<svg viewBox="0 0 64 ' + H + '" aria-hidden="true"><defs>' +
        '<linearGradient id="' + id + 'b" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + right + '" stop-opacity=".5"/><stop offset="1" stop-color="' + right + '" stop-opacity="0"/></linearGradient>' +
        '<linearGradient id="' + id + 't" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + topEdge + '"/><stop offset="1" stop-color="' + top + '"/></linearGradient>' +
        '</defs>';
      // translucent body under the plates
      s += '<g class="stack-body" style="--c:' + c + '">' +
        '<polygon points="6,' + topY + ' 32,' + (topY + 13) + ' 32,' + (baseY + 13) + ' 6,' + baseY + '" fill="url(#' + id + 'b)" opacity=".55"/>' +
        '<polygon points="58,' + topY + ' 32,' + (topY + 13) + ' 32,' + (baseY + 13) + ' 58,' + baseY + '" fill="url(#' + id + 'b)" opacity=".85"/>' +
        '</g>';
      for (var i = 0; i < n; i++) {
        var y = baseY - i * gap;
        var k = n > 1 ? i / (n - 1) : 1;
        var op = (0.18 + 0.82 * Math.pow(k, 1.6)).toFixed(2);
        s += '<g class="stack-plate" style="--c:' + c + ';--i:' + i + '"><g opacity="' + op + '">' +
          '<polygon points="6,' + y + ' 32,' + (y + 13) + ' 32,' + (y + 17) + ' 6,' + (y + 4) + '" fill="' + left + '"/>' +
          '<polygon points="58,' + y + ' 32,' + (y + 13) + ' 32,' + (y + 17) + ' 58,' + (y + 4) + '" fill="' + right + '"/>' +
          '<polygon points="32,' + (y - 13) + ' 58,' + y + ' 32,' + (y + 13) + ' 6,' + y + '" fill="url(#' + id + 't)" stroke="' + topEdge + '" stroke-opacity=".7" stroke-width=".6"/>' +
          '</g></g>';
      }
      s += '</svg>';
      $('.stacks__tower', col).innerHTML = s;
    });

    if (reduceMotion) {
      wrap.classList.add('is-live');
      return;
    }
    watch(wrap, function (v) {
      if (v) wrap.classList.add('is-live');
    }, '0px 0px -12% 0px');
  })();

  /* ------------------------------------------------------------------------
     Manifesto: lime panel grows to full screen, then shrinks into a tile
     ------------------------------------------------------------------------ */
  var manifesto = (function () {
    var sec = $('.manifesto');
    if (!sec) return null;
    var panel = $('.manifesto__panel', sec);
    var text = $('[data-words]', sec);
    var parts = text.textContent.trim().split(' ');
    text.innerHTML = parts.map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
    var words = $$('.w', text);
    var lit = -1;

    function rect(t, x, b, r) { return { t: t, x: x, b: b, r: r }; }
    function mix(a, b, f) { return rect(lerp(a.t, b.t, f), lerp(a.x, b.x, f), lerp(a.b, b.b, f), lerp(a.r, b.r, f)); }

    function apply(r, copy, wordsLit) {
      panel.style.setProperty('--t', r.t.toFixed(1) + 'px');
      panel.style.setProperty('--x', r.x.toFixed(1) + 'px');
      panel.style.setProperty('--b', r.b.toFixed(1) + 'px');
      panel.style.setProperty('--r', r.r.toFixed(1) + 'px');
      panel.style.setProperty('--copy', copy.toFixed(3));
      if (wordsLit !== lit) {
        lit = wordsLit;
        words.forEach(function (w, i) { w.classList.toggle('is-lit', i < wordsLit); });
      }
    }

    function update() {
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var headerH = header ? header.offsetHeight : 72;
      var narrow = vw < 700;
      var start = rect(vh * 0.2, narrow ? vw * 0.06 : vw * 0.18, vh * 0.14, narrow ? 28 : 44);
      var full = rect(headerH + 8, narrow ? 8 : 14, narrow ? 8 : 14, narrow ? 22 : 28);
      var tile = narrow ? 118 : 150;
      var markY = vh * 0.66;
      var end = rect(markY - tile / 2, (vw - tile) / 2, vh - (markY + tile / 2), narrow ? 32 : 40);

      if (reduceMotion) {
        apply(full, 1, words.length);
        return;
      }

      var box = sec.getBoundingClientRect();
      var total = Math.max(1, box.height - vh);
      var p = clamp(-box.top / total, 0, 1);
      var grow = easeInOut(clamp(p / 0.3, 0, 1));
      var shrink = easeInOut(clamp((p - 0.62) / 0.26, 0, 1));
      var r = mix(mix(start, full, grow), end, shrink);
      var copy = 1 - clamp((p - 0.6) / 0.08, 0, 1);
      var wl = Math.round(clamp((p - 0.06) / 0.44, 0, 1) * words.length);
      apply(r, copy, wl);
    }

    update();
    return { update: update };
  })();

  /* ------------------------------------------------------------------------
     Reliability: one runtime hub
     ------------------------------------------------------------------------ */
  (function hub() {
    var el = $('[data-hub]');
    if (!el) return;
    var svg = $('.hub__lines', el);
    var core = $('[data-hub-core]', el);
    var nodes = $$('[data-hub-node]', el);

    function draw() {
      var hb = el.getBoundingClientRect();
      if (!hb.width) return;
      var cb = core.getBoundingClientRect();
      var cx = cb.left + cb.width / 2 - hb.left;
      var cy = cb.top + cb.height / 2 - hb.top;
      svg.setAttribute('viewBox', '0 0 ' + hb.width + ' ' + hb.height);
      var html = '';
      nodes.forEach(function (n, i) {
        var b = $('b', n).getBoundingClientRect();
        var x = b.left + b.width / 2 - hb.left;
        var y = b.top + b.height / 2 - hb.top;
        var qx = lerp(x, cx, 0.5);
        var qy = lerp(y, cy, 0.5) + (y < cy ? -14 : 14) * (Math.abs(x - cx) > 40 ? 1 : 0);
        var d = 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Q' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1);
        html += '<path class="edge" d="' + d + '"/>';
        html += '<path class="edge-pulse" pathLength="100" style="--delay:' + (i * 0.52).toFixed(2) + 's;--dur:2.6s" d="' + d + '"/>';
      });
      svg.innerHTML = html;
    }

    draw();
    if (window.ResizeObserver) new ResizeObserver(draw).observe(el);
    else window.addEventListener('resize', debounce(draw, 150));

    if (reduceMotion) return;
    var visible = false;
    var hot = 0;
    watch(el, function (v) { visible = v; });
    setInterval(function () {
      if (!visible || document.hidden) return;
      nodes.forEach(function (n, i) { n.classList.toggle('is-hot', i === hot); });
      hot = (hot + 1) % nodes.length;
    }, 1300);
  })();

  /* ------------------------------------------------------------------------
     Daily view: week strips + waves
     ------------------------------------------------------------------------ */
  (function week() {
    var el = $('[data-week]');
    if (!el) return;
    var rnd = seeded(41);
    var days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    var html = '';
    days.forEach(function (d, i) {
      var off = i >= 5;
      var today = i === 1;
      var strip = '';
      if (!off) {
        var count = 13 + Math.floor(rnd() * 10);
        for (var j = 0; j < count; j++) {
          strip += '<i style="--y:' + (3 + rnd() * 92).toFixed(1) + '%;--a:' + (0.14 + rnd() * 0.55).toFixed(2) +
            ';--t:' + (i * 70 + j * 22) + 'ms"></i>';
        }
        if (today) strip += '<b style="--y:47%;--h:8%"></b>';
      }
      html += '<div class="week__col' + (off ? ' is-off' : '') + (today ? ' is-today' : '') + '">' +
        '<div class="week__strip">' + strip + '</div><span class="mono">' + d + '</span></div>';
    });
    $('.week__cols', el).innerHTML = html;
  })();

  (function waves() {
    var el = $('[data-waves]');
    if (!el) return;
    var defs = [
      { amp: 0.3, k: 1, phase: 0, color: 'rgba(241,243,236,.8)', w: 1.5, dur: 10 },
      { amp: 0.3, k: 1, phase: 0.5, color: 'rgba(241,243,236,.55)', w: 1.3, dur: 10 },
      { amp: 0.2, k: 1, phase: 0.22, color: 'rgba(241,243,236,.3)', w: 1, dur: 10 },
      { amp: 0.14, k: 2, phase: 0.1, color: '#d9f23e', w: 2, dur: 14 }
    ];
    function build() {
      var w = el.clientWidth || 320;
      var h = el.clientHeight || 128;
      var html = '';
      defs.forEach(function (d) {
        var len = w / d.k;
        var pts = [];
        for (var x = 0; x <= w * 2 + 0.5; x += 4) {
          var y = h / 2 + Math.sin((x / len + d.phase) * Math.PI * 2) * d.amp * h;
          pts.push((x === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1));
        }
        html += '<svg viewBox="0 0 ' + (w * 2) + ' ' + h + '" preserveAspectRatio="none" style="--dur:' + d.dur + 's">' +
          '<path d="' + pts.join(' ') + '" stroke="' + d.color + '" stroke-width="' + d.w + '"/></svg>';
      });
      el.innerHTML = html;
    }
    build();
    window.addEventListener('resize', debounce(build, 200));
  })();

  /* ------------------------------------------------------------------------
     Case studies: sparklines for "volume"
     ------------------------------------------------------------------------ */
  (function sparklines() {
    var svg = $('[data-sparklines]');
    if (!svg) return;
    var series = [
      { color: 'rgba(241,243,236,.85)', w: 1.6, lift: 0, seed: 3 },
      { color: 'rgba(217,242,62,.9)', w: 1.6, lift: 10, seed: 11 },
      { color: 'rgba(241,243,236,.35)', w: 1.2, lift: 20, seed: 19 }
    ];
    function build() {
      var w = svg.clientWidth || 300;
      var h = svg.clientHeight || 90;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var html = '';
      series.forEach(function (s, k) {
        var rnd = seeded(s.seed);
        var pts = [];
        var steps = 28;
        for (var i = 0; i <= steps; i++) {
          var f = i / steps;
          var trend = Math.pow(f, 1.4) * 0.62;
          var y = h - 8 - s.lift - trend * (h - 30) - (rnd() - 0.5) * 9;
          pts.push((i ? 'L' : 'M') + (f * w).toFixed(1) + ' ' + y.toFixed(1));
        }
        html += '<path pathLength="1" style="--k:' + k + '" d="' + pts.join(' ') + '" stroke="' + s.color + '" stroke-width="' + s.w + '"/>';
      });
      svg.innerHTML = html;
    }
    build();
    window.addEventListener('resize', debounce(build, 200));
  })();

  /* ------------------------------------------------------------------------
     Pricing estimate slider (log scale 3,000 – 300,000)
     ------------------------------------------------------------------------ */
  (function pricing() {
    var input = $('#runs-input');
    if (!input) return;
    var range = $('[data-range]');
    var out = $('[data-runs-value]');
    var nameEl = $('[data-est-name]');
    var priceEl = $('[data-est-price]');
    var noteEl = $('[data-est-note]');
    var cards = $$('[data-plan]');
    var MIN = 3000;
    var MAX = 300000;
    var PLANS = {
      starter: { name: 'Starter', price: 29, runs: 3000 },
      team: { name: 'Team', price: 89, runs: 30000 },
      scale: { name: 'Scale', price: 290, runs: 300000 }
    };
    var current = null;

    function runsFor(pos) {
      var v = MIN * Math.pow(MAX / MIN, pos / 1000);
      var step = v < 10000 ? 500 : v < 100000 ? 1000 : 5000;
      return clamp(Math.round(v / step) * step, MIN, MAX);
    }

    function update() {
      var f = (parseFloat(input.value) - parseFloat(input.min)) / (parseFloat(input.max) - parseFloat(input.min));
      var runs = runsFor(parseFloat(input.value));
      range.style.setProperty('--p', f.toFixed(4));
      range.classList.toggle('is-near-start', f < 0.13);
      range.classList.toggle('is-near-end', f > 0.87);
      out.textContent = fmt(runs);
      input.setAttribute('aria-valuetext', fmt(runs) + ' runs a month');

      var key = runs <= 3000 ? 'starter' : runs <= 30000 ? 'team' : 'scale';
      if (key !== current) {
        current = key;
        var plan = PLANS[key];
        nameEl.textContent = plan.name;
        priceEl.textContent = '$' + plan.price;
        noteEl.textContent = fmt(plan.runs) + ' runs included';
        cards.forEach(function (c) { c.classList.toggle('is-active', c.getAttribute('data-plan') === key); });
      }
    }

    input.addEventListener('input', update);
    update();
  })();

  /* ------------------------------------------------------------------------
     Custom cursor (desktop with a mouse only)
     ------------------------------------------------------------------------ */
  (function cursor() {
    var el = $('.cursor');
    if (!el || !finePointer || reduceMotion) return;
    var dot = $('.cursor__dot', el);
    var ring = $('.cursor__ring', el);
    var x = -100;
    var y = -100;
    var rx = -100;
    var ry = -100;
    var hover = false;
    var scale = 0.4;
    var seen = false;

    root.classList.add('has-cursor');
    el.classList.add('is-hidden');

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      if (!seen) {
        seen = true;
        rx = x;
        ry = y;
      }
      el.classList.remove('is-hidden');
    }, { passive: true });

    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget) el.classList.add('is-hidden');
    });

    document.addEventListener('pointerover', function (e) {
      var t = e.target.closest && e.target.closest('a, button, input, label, select, textarea, [role="button"]');
      hover = !!t;
      el.classList.toggle('is-hover', hover);
    });

    (function loop() {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      scale += ((hover ? 1 : 0.4) - scale) * 0.2;
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0) scale(' + scale.toFixed(3) + ')';
      requestAnimationFrame(loop);
    })();
  })();

  /* ------------------------------------------------------------------------
     Scroll / resize plumbing
     ------------------------------------------------------------------------ */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (header) header.classList.toggle('is-scrolled', window.pageYOffset > 8);
      if (manifesto) manifesto.update();
      updateNav();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
