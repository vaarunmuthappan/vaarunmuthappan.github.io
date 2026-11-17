/* vignettes.js: drawings of the inner leaves (SPEC-5 §2.8, §2.10, §2.11), built on hand.js and
   studies.js (read-only engine; nothing here changes their behaviour).
   Generators (each a hand.js study definition, usable by Hand.study and Hand.still):
     Vignettes.V1() .. V7(b)       the seven margin vignettes, viewBox 0 0 112 112
     Vignettes.vignette(id)        the definition assigned to an ids/ section id (SPEC-5 §2.11 table)
     Vignettes.ASSIGN              section id -> [generator, args]
     Vignettes.dividers(id, two)   the section toggle glyph, 28x28 (two = Expand all / Collapse all)
     Vignettes.corners(id)         four ink corner ticks of a plate (k = 1, host-sized)
     Vignettes.srule(id)           the hand rule drawn above a section (k = 1, host-sized)
     Vignettes.plumbTop(sc)        pin and thread of the notes' fixed plumb line (k = 1)
     Vignettes.hoistSlow           S4 with the notes header's scroll rate (0.02 deg per px)
   Page wiring:
     Vignettes.index()             index pages: folio, plumb, plate studies, entry control
     Vignettes.notes()             notes pages: returns { toggled(sec, open), progress(p), resize() }
     Vignettes.folio()             folio line of every inner page
   All geometry is deterministic (hand.js seeds by study id). Nothing loops at rest. */
(function (W) {
  'use strict';
  var H = W.Hand, S = W.Studies, B = W.Bayes, D = W.document, root = D.documentElement;
  if (!H || !S) return;
  var C = H.C, r2 = H.r2, D2R = Math.PI / 180, reduced = H.reduced;
  function circD(cx, cy, r) { return 'M' + r2(cx - r) + ',' + r2(cy) + 'a' + r + ',' + r + ' 0 1,0 ' + 2 * r + ',0a' + r + ',' + r + ' 0 1,0 ' + (-2 * r) + ',0Z'; }
  function polyD(p) { return 'M' + p.map(function (q) { return r2(q[0]) + ',' + r2(q[1]); }).join('L') + 'Z'; }
  function circle(cx, cy, r, st) { return H.arcPts(cx, cy, r, -90, 270, st || 12); }
  // ellipse centred (cx, cy), major radius a along angle th, minor radius b
  function ell(cx, cy, th, a, b) {
    var c = Math.cos(th), s = Math.sin(th), out = [];
    for (var i = 0; i < 24; i++) { var u = i / 24 * 2 * Math.PI, x = a * Math.cos(u), y = b * Math.sin(u); out.push([cx + x * c - y * s, cy + x * s + y * c]); }
    return out;
  }
  function vb112(id, build) { return { id: id, viewBox: [0, 0, 112, 112], build: build }; }

  // ---- V1 toss ------------------------------------------------------------------------------
  function V1() {
    return vb112('v1', function (pen) {
      var T = [0, 0.25, 0.5, 0.75, 1], F = [1, 0.5, 0, 0.5, 1], par = [];
      for (var i = 0; i <= 22; i++) { var t = i / 22; par.push([12 + 88 * t, 92 - 280 * t * (1 - t)]); }
      pen.step(0, 180, function () { pen.rule([6, 96], [106, 96]); });
      pen.step(140, 300, function () { pen.ink(par, { color: 'silver', w: 0.6, split: false }); });
      pen.step(420, 760, function () {
        T.forEach(function (t, j) {
          var x = 12 + 88 * t, y = 92 - 280 * t * (1 - t), th = Math.atan2(-280 * (1 - 2 * t), 88);
          pen.rule([x, y], [x, 96], { flush: true });
          if (!F[j]) { pen.ink([[x - 7 * Math.cos(th), y - 7 * Math.sin(th)], [x + 7 * Math.cos(th), y + 7 * Math.sin(th)]], { w: 1.1 }); return; }
          var e = ell(x, y, th, 7, 7 * F[j]);
          pen.fill(polyD(e), j < 2 ? { fill: C.ink, 'fill-opacity': 0.86 } : { fill: C.paper });
          pen.ink(e, { closed: true, split: false, w: j < 2 ? 'fine' : 1.05 });
        });
      });
    });
  }

  // ---- V2 balance(tau) ------------------------------------------------------------------------
  function V2(tau) {
    return vb112('v2' + (tau ? 'b' : ''), function (pen) {
      var c = Math.cos(tau * D2R), s = Math.sin(tau * D2R), L = [56 - 44 * c, 58 - 44 * s], R = [56 + 44 * c, 58 + 44 * s];
      var nL = tau ? 4 : 3, nR = tau ? 2 : 3;
      pen.step(0, 200, function () { pen.rule([4, 90], [108, 90]); pen.rule(L, R); });
      pen.step(180, 260, function () { pen.ink([[6, 90], [106, 90]], { w: 'heavy', over: true }); pen.ink([[46, 90], [56, 58], [66, 90]]); });
      pen.step(420, 240, function () { pen.ink([L, R], { w: 'heavy', over: true }); });
      pen.step(640, 420, function () {
        [[L, nL], [R, nR]].forEach(function (side) {
          var E = side[0], ty = E[1] + 22, x0 = E[0] - 13, x1 = E[0] + 13;
          pen.ink([E, [x0 + 1, ty]], { w: 0.7 }); pen.ink([E, [x1 - 1, ty]], { w: 0.7 });
          pen.ink([[x0, ty - 2.5], [x0 + 2.5, ty], [x1 - 2.5, ty], [x1, ty - 2.5]], { w: 1.1, split: false });
          var n = side[1], sp = 6.4;
          for (var i = 0; i < n; i++) pen.fill(circD(E[0] + (i - (n - 1) / 2) * sp, ty - 3.3, 2.9), { fill: C.ink, 'fill-opacity': 0.84 });
        });
      });
      pen.step(1060, 120, function () { pen.fill(circD(56, 58, 1.9), { fill: C.paper }); pen.ink(circle(56, 58, 1.9, 30), { closed: true, split: false, w: 0.8 }); });
    });
  }

  // ---- V3 dividers(d, d2) -------------------------------------------------------------------------
  function V3(d, d2) {
    return vb112('v3-' + d + (d2 ? '-' + d2 : ''), function (pen, st) {
      var Hn = [56, 18], k = st.k;
      pen.step(0, 180, function () { pen.rule([4, 84], [108, 84]); });
      pen.step(150, 200, function () { pen.ink([[8, 84], [104, 84]], { w: 'fine', over: true }); });
      pen.step(330, 300, function () { for (var i = 0; i <= 12; i++) { var x = 8 + 8 * i; pen.ink([[x, 84], [x, 84 + (i % 4 ? 3.5 : 7)]], { w: 0.75 }); } });
      if (d2) pen.step(600, 160, function () { pen.rule(Hn, [56 - d2, 84], { flush: true }); pen.rule(Hn, [56 + d2, 84], { flush: true }); });
      pen.step(700, 420, function () {
        [-d, d].forEach(function (dx) {
          var tip = [56 + dx, 84], ux = tip[0] - Hn[0], uy = tip[1] - Hn[1], Ln = Math.hypot(ux, uy), nx = -uy / Ln * 1.7 / k * 1.4, ny = ux / Ln * 1.7 / k * 1.4;
          var a = [Hn[0] + nx, Hn[1] + ny], b = [Hn[0] - nx, Hn[1] - ny], sx = [tip[0] - ux / Ln * 7, tip[1] - uy / Ln * 7];
          pen.fill(polyD([a, sx, b]), { fill: C.paper });
          pen.ink([a, sx], { w: 'fine', split: false }); pen.ink([b, sx], { w: 'fine', split: false });
          pen.ink([sx, tip], { w: 0.7 });
        });
        pen.fill(circD(56, 18, 4), { fill: C.paper });
        pen.ink(circle(56, 18, 4, 20), { closed: true, split: false, w: 'fine' });
        pen.ink([[56, 14], [56, 6]], { w: 'heavy' });
      });
      pen.step(1120, 220, function () {
        var r = Math.hypot(d, 66), a0 = Math.atan2(66, -d) / D2R, a1 = Math.atan2(66, d) / D2R;
        pen.arc(56, 18, r, a0, a1, { noPrick: true });
      });
    });
  }

  // ---- V4 spindle(prior, n): r = 9 sqrt(f), f the exact posterior density from Bayes.ST ----------
  function V4(prior, n) {
    return vb112('v4-' + prior + '-' + n, function (pen, st) {
      var s = B.ST[prior][n], X = function (t) { return 10 + 92 * t; }, rr = function (t) { return 9 * Math.sqrt(B.pdf(t, s.a, s.b)); };
      var up = [], lo = [], j, t, j0 = -1, j1 = -1, N = 184;
      for (j = 0; j <= N; j++) { t = j / N; if (rr(t) >= 0.3) { if (j0 < 0) j0 = j; j1 = j; } }
      for (j = j0; j <= j1; j++) { t = j / N; up.push([X(t), 56 - rr(t)]); lo.push([X(t), 56 + rr(t)]); }
      var loop = up.concat(lo.reverse());
      var band = [];
      band.push([X(s.lo), 56 - rr(s.lo)]);
      for (j = 0; j <= N; j++) { t = j / N; if (t > s.lo && t < s.hi) band.push([X(t), 56 - rr(t)]); }
      band.push([X(s.hi), 56 - rr(s.hi)], [X(s.hi), 56 + rr(s.hi)]);
      for (j = N; j >= 0; j--) { t = j / N; if (t > s.lo && t < s.hi) band.push([X(t), 56 + rr(t)]); }
      band.push([X(s.lo), 56 + rr(s.lo)]);
      var xm = X(s.mean);
      pen.step(0, 180, function () { pen.rule([4, 56], [108, 56]); });
      pen.step(160, 520, function () { pen.fill(polyD(loop), { fill: C.paper }); pen.ink(loop, { closed: true, split: false }); });
      pen.step(560, 420, function () { pen.hatch(band, { color: 'sanguine', g: st.layers.sang }); });
      pen.step(900, 160, function () { pen.rule([xm, 56], [xm, 92], { flush: true }); });
      pen.step(1000, 300, function () {
        pen.ink([[6, 104], [106, 104]], { w: 'fine' });
        var tri = [[xm, 92], [xm + 7, 104], [xm - 7, 104]];
        pen.fill(polyD(tri), { fill: C.paper }); pen.ink(tri, { closed: true, split: false });
      });
    });
  }

  // ---- V5 ranks -----------------------------------------------------------------------------------
  function V5() {
    return vb112('v5', function (pen) {
      var pat = '0110100', x = 8;
      pen.step(0, 160, function () { pen.rule([4, 88], [108, 88]); });
      pen.step(140, 200, function () { pen.ink([[6, 88], [106, 88]], { w: 'fine', over: true }); });
      pen.step(320, 760, function () {
        for (var i = 0; i < 7; i++) {
          var r = 2.5 + i, cx = x + r, cy = 88 - r;
          if (pat[i] === '1') pen.fill(circD(cx, cy, r), { fill: C.ink, 'fill-opacity': 0.86 }); else pen.fill(circD(cx, cy, r), { fill: C.paper });
          pen.ink(circle(cx, cy, r, 15), { closed: true, split: false, w: pat[i] === '1' ? 'fine' : 1.05 });
          pen.letter(cx, 88, String(i + 1), { kind: 'num', dir: [0, 1], off: 5 });
          x = cx + r + 3;
        }
      });
    });
  }

  // ---- V6 circles (b: two, filled and open, with a straightedge) -------------------------------------
  function V6(b) {
    return vb112('v6' + (b ? 'b' : ''), function (pen) {
      var CS = [[34, 40, 20], [78, 46, 18], [54, 84, 17]].slice(0, b ? 2 : 3);
      pen.step(0, 520, function () { CS.forEach(function (c) { pen.arc(c[0], c[1], c[2], -90, 270); }); });
      pen.step(460, 600, function () {
        CS.forEach(function (c, i) {
          var r = H.rng('v6:dots:' + i), open = b && i === 1;
          for (var q = 0; q < 5; q++) {
            var a = 2 * Math.PI * r(), m = c[2] * 0.66 * Math.sqrt(0.15 + 0.85 * r()), x = c[0] + m * Math.cos(a), y = c[1] + m * Math.sin(a);
            if (open) { pen.fill(circD(x, y, 1.6), { fill: C.paper }); pen.ink(circle(x, y, 1.6, 40), { closed: true, split: false, w: 0.7 }); }
            else pen.fill(circD(x, y, 1.6), { fill: C.ink, 'fill-opacity': 0.88 });
            pen.wait(20);
          }
        });
      });
      if (b) pen.step(1000, 340, function () { pen.rule([63, 8], [49, 104]); pen.ink([[63, 8], [49, 104]], { w: 'heavy', over: true }); });
    });
  }

  // ---- V7 straightedge (b adds the shrunken slope through the centroid) ----------------------------------
  function V7(b) {
    return vb112('v7' + (b ? 'b' : ''), function (pen) {
      var E = [7, -5, 3, -8, 6, -2, 4], f = function (x) { return 84 - 0.55 * (x - 14); }, P = [], my = 0;
      E.forEach(function (e, i) { var x = 14 + 14 * i; P.push([x, f(x) + e]); my += (f(x) + e) / 7; });
      pen.step(0, 200, function () { pen.rule([6, f(6)], [106, f(106)]); });
      pen.step(180, 320, function () { P.forEach(function (p) { pen.fill(circD(p[0], p[1], 1.7), { fill: C.ink, 'fill-opacity': 0.9 }); pen.wait(40); }); });
      pen.step(480, 280, function () { P.forEach(function (p) { pen.rule(p, [p[0], f(p[0])], { flush: true }); }); });
      pen.step(720, 420, function () { pen.ink([[6, f(6)], [106, f(106)]], { w: 'heavy', over: true }); });
      if (b) pen.step(1120, 240, function () {
        pen.rule([6, my + 0.3 * 50], [106, my - 0.3 * 50]);
        pen.fill(circD(56, my, 2.4), { fill: C.paper }); pen.ink(circle(56, my, 2.4, 30), { closed: true, split: false, w: 0.8 });
      });
    });
  }

  var GEN = { V1: V1, V2: V2, V3: V3, V4: V4, V5: V5, V6: V6, V7: V7 };
  var ASSIGN = {
    'probability': ['V1'], 'hypothesis-testing': ['V2', 0], 'significance-testing': ['V3', 24],
    'parametric-tests': ['V4', 'centred', 0], 'non-parametric-tests': ['V5'], 'p-value-problems': ['V2', -7],
    'power-and-confidence': ['V3', 14, 36], 'bayesian-inference': ['V4', 'flat', 48],
    'machine-learning-regression': ['V7'], 'ml-regularization': ['V7', true],
    'ml-classification': ['V6', true], 'ml-unsupervised-learning': ['V6'],
    // Capstone/ (REVIEW-5-1 c4)
    'q1': ['V2', 0], 'q2': ['V3', 24], 'q3': ['V3', 14, 36], 'q4': ['V5'], 'q5': ['V2', -7],
    'q6': ['V3', 14, 36], 'q7': ['V7'], 'q8': ['V7', true], 'q9': ['V7'], 'q10': ['V6', true]
  };
  function vignette(id) {
    var a = ASSIGN[id]; if (!a) return null;
    var def = GEN[a[0]].apply(null, a.slice(1)); def.id = 'v-' + id; return def;
  }

  // ---- control glyphs and small mechanisms ----------------------------------------------------------
  function dividers(id, two) {
    return {
      id: id, viewBox: two ? [0, 0, 38, 28] : [0, 0, 28, 28],
      build: function (pen, st) {
        (two ? [0, 10] : [0]).forEach(function (ox, m) {
          var x = 14 + ox, g = H.el('g', { 'class': 'dv-pair p' + m }, st.layers.ink);
          var gl = H.el('g', { 'class': 'dv-l' }, g), gr = H.el('g', { 'class': 'dv-r' }, g);
          pen.step(m * 80, 220, function () {
            pen.ink([[x, 6.5], [x, 25]], { g: gl, w: 1.15, split: false });
            pen.ink([[x, 6.5], [x, 25]], { g: gr, w: 1.15, split: false });
          });
          pen.step(m * 80 + 200, 140, function () {
            pen.fill(circD(x, 5, 2.4), { fill: C.paper }, { g: g });
            pen.ink(circle(x, 5, 2.4, 30), { g: g, closed: true, split: false, w: 0.85 });
            pen.ink([[x, 2.6], [x, 0]], { g: g, w: 1.3 });
          });
        });
      }
    };
  }
  function hostVB(h, minW, minH) { return [0, 0, Math.max(minW, h ? h.clientWidth : 200), Math.max(minH, h ? h.clientHeight : 200)]; }
  function corners(id) {
    return {
      id: id, viewBox: function (h) { return hostVB(h, 40, 40); },
      build: function (pen, st) {
        var w = st.vb[2], h = st.vb[3], o = 6, A = 14, E = 1.5;
        pen.step(0, 360, function () {
          [[o, o, 1, 1], [w - o, o, -1, 1], [o, h - o, 1, -1], [w - o, h - o, -1, -1]].forEach(function (c) {
            pen.ink([[c[0] - c[2] * E, c[1]], [c[0] + c[2] * A, c[1]]], { w: 1.05 });
            pen.ink([[c[0], c[1] - c[3] * E], [c[0], c[1] + c[3] * A]], { w: 1.05 });
          });
        });
      }
    };
  }
  function corner(which) { // one corner alone, 28 x 28, for the no-JS stills
    return { id: 'pc-' + which, viewBox: [0, 0, 28, 28], build: function (pen) {
      var sx = which[1] === 'l' ? 1 : -1, sy = which[0] === 't' ? 1 : -1, x = sx > 0 ? 6 : 22, y = sy > 0 ? 6 : 22;
      pen.ink([[x - sx * 1.5, y], [x + sx * 14, y]], { w: 1.05, key: "h" }); pen.ink([[x, y - sy * 1.5], [x, y + sy * 14]], { w: 1.05, key: "v" });
    } };
  }
  function srule(id) {
    return { id: id, viewBox: function (h) { return [0, 0, Math.max(40, h ? h.clientWidth : 640), 8]; },
      build: function (pen, st) { pen.step(0, 420, function () { pen.ink([[0, 4], [st.vb[2], 4]], { w: 'fine', split: false }); }); } };
  }
  function tocRule(id) {
    return { id: id, viewBox: function (h) { return [-6, 0, 12, Math.max(40, h ? h.clientHeight : 400)]; },
      build: function (pen, st) {
        var L = st.vb[3];
        pen.step(0, 300, function () { pen.rule([0, 2], [0, L - 2], { flush: true }); });
        pen.step(200, 420, function () { pen.ink([[0, 0], [0, L]], { w: 'fine', over: true, split: false }); });
      } };
  }
  function plumbTop(sc) {
    return { id: 's5n', viewBox: function (h) { return [-30, 0, 60, Math.max(200, h ? h.clientHeight : 900)]; },
      build: function (pen, st) {
        pen.step(0, 120, function () {
          pen.fill(circD(0, 24, 3), { fill: C.paper });
          pen.ink(circle(0, 24, 3, 20), { closed: true, split: false, w: 'fine' });
          pen.ink([[-1.8, 26.4], [-5.4, 31.2]], { w: 'fine' });
        });
        pen.step(60, 520, function () { st.parts.thread = pen.thread([0, 27], [0, 96 - 6 * sc]); });
      } };
  }
  var hoistSlow = {};
  for (var kk in S.hoist) hoistSlow[kk] = S.hoist[kk];
  hoistSlow.live = function (st) {
    if (reduced || st.__bound) return; st.__bound = true;
    var sy = W.scrollY;
    function tick(now, dt) {
      var P = st.parts, t = 0.02 * sy, e = 1 - Math.pow(0.8, dt / 16.7);
      P.a += (t - P.a) * e; var done = Math.abs(t - P.a) < 0.01; if (done) P.a = t;
      P.render(); return !done;
    }
    H.onScroll(function (y) { sy = y; if (st.inView) H.loop.add(tick); });
    H.observe(st, 0, function (e) { if (e.isIntersecting && st.state === 'live') { st.parts.a = 0.02 * sy; st.parts.render(); } });
    st.parts.a = 0.02 * sy; st.parts.render();
  };

  // ---- page wiring ------------------------------------------------------------------------------
  function q(s, el) { return (el || D).querySelector(s); }
  function qa(s, el) { return [].slice.call((el || D).querySelectorAll(s)); }
  function nameRule(a) {
    var host = q('.ul', a); if (!host) return;
    var build = function () {
      while (host.firstChild) host.removeChild(host.firstChild);
      var w = Math.max(20, host.clientWidth), svg = H.el('svg', { viewBox: '0 0 ' + w + ' 6', 'aria-hidden': 'true', focusable: 'false' }, host);
      H.el('path', { d: H.pathD(H.wobble([[0, 3], [w, 3]], 0.45, 70, 19, 1, 'folio:ul')), pathLength: 1, fill: 'none', stroke: C.ink, 'stroke-opacity': 0.9, 'stroke-width': 1.1, 'stroke-linecap': 'round' }, svg);
    };
    build(); H.onResize(build);
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(build);
  }
  function folio() {
    var a = q('.folio .name'); if (a) nameRule(a);
    qa('.folio .fl').forEach(function (l, i) {
      var r = H.study(q('.ir', l), S.indexRule('ir-f' + i)); H.autoplay(r, 120 * i, 0);
      var g = q('.glyph', l); if (g) { var gs = H.study(g, S.glyph(l.classList.contains('fl-p') ? 'gear' : 'icosa')); H.autoplay(gs, 0, 0); }
    });
  }
  function index() {
    var body = D.body, concept = body.classList.contains('ix-c');
    folio();
    // pocket book: the plate fills the rest of the viewport, width min(100vw - 40, vh - top - 32)
    var plate = q('.plate-study'), pocket = W.matchMedia('(max-width: 719px)');
    function fit() {
      if (!pocket.matches) { plate.style.width = ''; return; }
      plate.style.width = '';
      var top = plate.getBoundingClientRect().top + W.scrollY, vw = D.documentElement.clientWidth;
      plate.style.width = Math.max(160, Math.floor(Math.min(vw - 40, W.innerHeight - top - 32))) + 'px';
    }
    fit(); H.onResize(fit);
    var ph = q('.plumb'), studies = [];
    if (ph && ph.offsetWidth) { var pst = H.study(ph, S.plumb(1)); H.autoplay(pst, 0, 0); }
    var main;
    if (concept) {
      var g = H.study(q('.pc-gold'), S.golden); H.autoplay(g, 0, 0.2);
      main = H.study(q('.pc-ico'), S.icosa); H.autoplay(main, 300, 0.2); studies.push(g, main);
    } else { main = H.study(q('.pc-hoist'), S.hoist); H.autoplay(main, 0, 0.2); studies.push(main); }
    var row = q('.list-row'), rst = H.study(q('.ir', row), S.indexRule('ir-e')); H.autoplay(rst, 300, 0);
    var deg = concept ? 72 : 30, lastType = 'mouse';
    D.addEventListener('pointerdown', function (e) { lastType = e.pointerType; }, true);
    function on() { S.nudge(main, deg); } function off() { S.nudge(main, 0); }
    row.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') on(); });
    row.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch' && D.activeElement !== row) off(); });
    row.addEventListener('focus', function () { if (row.matches(':focus-visible')) on(); });
    row.addEventListener('blur', off);
    row.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || reduced) return;
      e.preventDefault();
      var touch = lastType === 'touch';
      if (touch) row.classList.add('tap');
      main.host.classList.add('keep'); body.classList.add('leaving');
      setTimeout(function () { W.location.href = row.href; }, touch ? 170 : 180);
    });
    W.addEventListener('pageshow', function () { body.classList.remove('leaving'); row.classList.remove('tap'); main.host.classList.remove('keep'); });
    root.classList.add('sheet-live');
  }

  function notes() {
    var body = D.body, ids = body.classList.contains('ids'), wide = W.matchMedia('(min-width: 1100px)'), narrow = W.matchMedia('(max-width: 719px)');
    folio();
    // header study
    var hs = q('.hstudy');
    if (hs) { var hst = H.study(hs, ids ? S.icosa : hoistSlow); H.autoplay(hst, 200, 0.35); }
    // tailpiece after the last section: S2 on ids/, S6 on Capstone/
    var tp = q('.tailpiece'), tdef = ids ? S.golden : S.toss;
    if (tp && tdef) { var tst = H.study(tp, tdef); H.autoplay(tst, 0, 0.35); }
    // plumb progress: pin and thread (redrawn length), bob translated; no sway
    var ph = q('.plumb'), bobHost = null, top = null, sc = narrow.matches ? 28 / 58 : 1, vh = W.innerHeight, P = 0;
    function mountPlumb() {
      while (ph.firstChild) ph.removeChild(ph.firstChild);
      if (top) { var i = H.studies.indexOf(top); if (i >= 0) H.studies.splice(i, 1); }
      sc = narrow.matches ? 28 / 58 : 1;
      top = H.study(ph, plumbTop(sc));
      bobHost = D.createElement('div'); bobHost.className = 'bob'; bobHost.style.height = r2(58 * sc + 40) + 'px'; ph.appendChild(bobHost);
      var bst = H.study(bobHost, S.plumb(sc, null, true));
      if (reduced) { top.finish(); bst.finish(); } else { H.autoplay(top, 0, 0); H.autoplay(bst, 500, 0); }
      progress(P, true);
    }
    function progress(p, force) {
      if (!top || !top.parts.thread) return;
      if (!force && Math.abs(p - P) < 1e-4) return;
      P = p; var yb = 96 + p * Math.max(0, vh - 220);
      top.parts.thread.setAttribute('d', 'M0,27L0,' + r2(yb - 6 * sc));
      bobHost.style.transform = 'translate3d(0,' + r2(yb - 20) + 'px,0)';
    }
    if (ph) { mountPlumb(); narrow.addEventListener('change', mountPlumb); }
    // section rules (once, on first view), heading rules, vignettes (ids, >= 1100, once per section)
    var secs = qa('.notes > section, .notes > .collapsible-section'), seen = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!e.isIntersecting) return; seen.unobserve(e.target); drawRule(e.target); });
    }, { rootMargin: '0px 0px -10% 0px' });
    secs.forEach(function (s) { seen.observe(s); });
    function drawRule(sec) {
      if (sec.__sr) return;
      var h = D.createElement('span'); h.className = 'srule'; h.setAttribute('aria-hidden', 'true'); sec.insertBefore(h, sec.firstChild);
      var st = sec.__sr = H.study(h, srule('sr-' + (sec.id || 's')));
      if (reduced) st.finish(); else st.play();
    }
    qa('.collapsible-section > .section-header').forEach(function (h2) {
      var hr = D.createElement('span'); hr.className = 'hrule'; hr.setAttribute('aria-hidden', 'true'); h2.appendChild(hr);
      function build() {
        var w = h2.clientWidth; if (!w || w === hr.__w) return; hr.__w = w;
        while (hr.firstChild) hr.removeChild(hr.firstChild);
        var svg = H.el('svg', { viewBox: '0 0 ' + w + ' 6', preserveAspectRatio: 'none', focusable: 'false' }, hr);
        H.el('path', { d: H.pathD(H.wobble([[0, 3], [w, 3]], 0.45, 70, 19, 1, 'hr:' + h2.parentNode.id)), pathLength: 1, fill: 'none', stroke: C.ink, 'stroke-opacity': 0.88, 'stroke-width': 0.9, 'stroke-linecap': 'round' }, svg);
      }
      build(); h2.__hr = build;
    });
    function vignetteFor(sec) {
      if (!wide.matches || sec.__vg) return;
      var a = ASSIGN[sec.id]; if (!a || (a[0] === 'V4' && !B)) return;
      var def = vignette(sec.id);
      // an absolute column the height of the section, holding a sticky figure (top 120)
      var v = D.createElement('span'); v.className = 'vig'; v.setAttribute('aria-hidden', 'true'); sec.appendChild(v);
      var vin = D.createElement('span'); vin.className = 'vig-in'; v.appendChild(vin);
      var st = sec.__vg = H.study(vin, def);
      if (reduced || D.hidden) st.finish(); else W.requestAnimationFrame(function () { st.play(); });
    }
    // plates: built when first visible (sections may be closed at load)
    var plates = qa('.plate'), pio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return; var pl = e.target; pio.unobserve(pl);
        var host = D.createElement('span'); host.className = 'plate-ticks'; host.setAttribute('aria-hidden', 'true'); pl.appendChild(host);
        pl.__st = H.study(host, corners('pl-' + plates.indexOf(pl)));
        if (reduced) pl.__st.finish(); else pl.__st.play();
      });
    }, { threshold: 0.2 });
    plates.forEach(function (p) { pio.observe(p); var im = q('img', p); if (im && !im.complete) im.addEventListener('load', function () { if (p.__st) { p.__st.measure(); if (p.__st.vbChanged) p.__st.rebuild(); } }); });
    function resize() {
      vh = W.innerHeight;
      qa('.collapsible-section > .section-header').forEach(function (h2) { if (h2.__hr) h2.__hr(); });
      plates.forEach(function (p) { if (p.__st && p.offsetWidth) { p.__st.measure(); if (p.__st.vbChanged) p.__st.rebuild(); } });
      progress(P, true);
    }
    H.onResize(resize);
    root.classList.add('sheet-live');
    return {
      toggled: function (sec, open) {
        if (open) {
          if (sec.__hr) sec.__hr();
          var h2 = q('.section-header', sec); if (h2 && h2.__hr) h2.__hr();
          vignetteFor(sec);
          qa('.plate', sec).forEach(function (p) { if (p.__st) { p.__st.measure(); if (p.__st.vbChanged) p.__st.rebuild(); } });
        }
      },
      progress: progress,
      resize: resize,
      dividers: function (host, id, two) { var st = H.study(host, dividers(id, two)); if (reduced) st.finish(); else H.autoplay(st, 0, 0); return st; },
      tocRule: function (host) { var st = H.study(host, tocRule('toc')); if (reduced) st.finish(); else H.autoplay(st, 100, 0); return st; }
    };
  }

  W.Vignettes = { V1: V1, V2: V2, V3: V3, V4: V4, V5: V5, V6: V6, V7: V7, ASSIGN: ASSIGN, vignette: vignette,
    dividers: dividers, corners: corners, corner: corner, srule: srule, tocRule: tocRule, plumbTop: plumbTop, hoistSlow: hoistSlow,
    folio: folio, index: index, notes: notes };

  // index pages and stats wire themselves; notes pages are wired by script.js (sections own the timing)
  function boot() {
    try {
      H.start();
      if (D.body.classList.contains('index')) index();
      else if (D.body.classList.contains('stats')) { folio(); root.classList.add('sheet-live'); }
    } catch (e) { root.classList.add('sheet-failed'); if (W.console) W.console.error(e); }
  }
  if (!root.classList.contains('sheet-failed')) boot();
})(window);
