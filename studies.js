/* studies.js: the drawn studies of the sheet (SPEC-5 §2.5, §2.8), built on hand.js.
   Each study is a definition { id, viewBox, build(pen, st), live?(st), pose?(st) } usable both by
   Hand.study (animated, then live) and by Hand.still (finished, synchronous; used for reduced motion
   and by tools/make-static.html for the no-JS stills).
     Studies.golden            S2 golden-section construction with the rigid compass
     Studies.icosa             S3 skeletal icosahedron (struts, joints, painter's order)
     Studies.hoist             S4 geared hoist (24/12 teeth, spokes, crank, drum, cord, weight)
     Studies.plumb(scale)      S5 plumb line (pin, thread, bob); host width 60 px, k = 1
     Studies.indexRule(id)     the control mechanism: hand-ruled line, ticks, sliding index (k = 1)
     Studies.glyph(kind)       28 px closing-link glyphs: 'icosa' | 'gear'
     Studies.apparatus(narrow, init) S1 the steelyard (pass 1b); st.parts.set(prior, n, mode)
     Studies.toss              S6 toss study (pass 1b)
     Studies.nudge(st, deg)    hover/focus turn of a live study (icosahedron +72, hoist +30, 700 ms)
   Live responses (pointer, scroll) only run in the live state, outside reduced motion, while the
   study intersects the viewport. */
(function (W) {
  'use strict';
  if (!W.Hand) return; // the engine is absent (blocked or failed): leave the stills in place
  var H = W.Hand, C = H.C, PHI = (1 + Math.sqrt(5)) / 2, D2R = Math.PI / 180, r2 = H.r2;
  var fine = !!(W.matchMedia && W.matchMedia('(hover: hover) and (pointer: fine)').matches);
  function tween(from, to, dur, ease, fn, done) {
    var t0 = null;
    H.loop.add(function (now) {
      if (t0 == null) t0 = now;
      var p = Math.min(1, (now - t0) / dur); fn(from + (to - from) * ease(p));
      if (p < 1) return true; if (done) done(); return false;
    });
  }
  function nudgeTo(st, deg, dur) {
    var P = st.parts; if (!P || H.reduced || st.state !== 'live') return;
    var id = (P.nid = (P.nid || 0) + 1), from = P.hv || 0;
    tween(from, deg, dur || 700, H.EASE_MECH, function (v) { if (P.nid === id) { P.hv = v; P.render(); } });
  }
  function pagePos(st) { var r = st.svg.getBoundingClientRect(); st.box = { x: r.left + W.scrollX, y: r.top + W.scrollY, w: r.width, h: r.height }; }

  // ======================================================================
  // S2 Golden-section construction
  var REST = -20, A_C = -63.435;
  var golden = {
    id: 's2', viewBox: [-20, -24, 380, 264],
    build: function (pen, st) {
      var k = st.k, A = [40, 190], B = [190, 190], Cp = [190, 40], Dp = [40, 40], M = [115, 190], R = 167.705, E = [282.705, 190], F = [282.705, 40], P = st.parts;
      pen.step(0, 180, function () { pen.rule([20, 190], [320, 190]); });
      pen.step(160, 300, function () { pen.rule(A, Dp); pen.rule(Dp, [320, 40]); pen.rule(B, Cp); });
      pen.step(440, 250, function () { pen.ink([A, B, Cp, Dp, A], { over: true }); });
      pen.step(610, 90, function () { pen.rule(M, Cp); });
      pen.step(690, 40, function () { pen.ink([[115, 190 - 3 / k], [115, 190 + 3 / k]], { w: 'fine' }); });
      // the compass: a rigid body about its needle at M; arrives on C just before the strike
      var cg = pen.add('g', { transform: 'translate(115 190) rotate(' + A_C + ')' }, st.svg, 'hf', 560, 160);
      pen.step(560, 1, function () { compass(pen, cg, k); });
      P.cg = cg; P.alpha = A_C;
      P.pose = function () { cg.setAttribute('transform', 'translate(115 190) rotate(' + r2(P.alpha) + ')'); };
      pen.t = 700; P.arc = pen.arc(M[0], M[1], R, A_C, 0, { manual: true });
      pen.t = 700; pen.cue(function (instant) { strike(st, instant); });
      pen.step(1200, 70, function () { pen.rule(E, F); });
      pen.step(1240, 240, function () { pen.ink([B, E], { over: true }); pen.ink([E, F], { over: true }); pen.ink([F, Cp], { over: true }); });
      pen.step(1380, 220, function () {
        var s = Math.SQRT1_2;
        pen.letter(A[0], A[1], 'A', { dir: [-s, s] }); pen.letter(B[0], B[1], 'B', { dir: [s * 0.5, 1] });
        pen.letter(Cp[0], Cp[1], 'C', { dir: [0, -1] }); pen.letter(Dp[0], Dp[1], 'D', { dir: [-s, -s] });
        pen.letter(M[0], M[1], 'M', { dir: [0, 1] }); pen.letter(E[0], E[1], 'E', { dir: [s, s] }); pen.letter(F[0], F[1], 'F', { dir: [s, -s] });
        pen.letter(40, 115, '1', { kind: 'num', dir: [-1, 0] });
        pen.rule([40, 217], [146, 217], { flush: true }); pen.rule([176, 217], [282.705, 217], { flush: true });
        pen.rule([40, 210], [40, 224], { flush: true }); pen.rule([282.705, 210], [282.705, 224], { flush: true });
        pen.letter(161.35, 217, 'φ', { off: 0 });
        pen.wait(60);
      });
    },
    live: function (st) {
      if (H.reduced || !fine || st.__bound) return; st.__bound = true;
      var P = function () { return st.parts; }, tgt = REST, px = 0, py = 0;
      pagePos(st); H.onResize(function () { pagePos(st); });
      function tick() {
        var p = P(); if (p.busy) return false;
        var e = 1 - Math.pow(0.86, 1); p.alpha += (tgt - p.alpha) * e; p.pose();
        if (Math.abs(tgt - p.alpha) < 0.03) { p.alpha = tgt; p.pose(); return false; }
        return true;
      }
      H.onPointer(function (x, y, type) {
        if (type === 'touch' || !st.inView || st.state !== 'live') return;
        var b = st.box, kk = Math.min(b.w / st.vb[2], b.h / st.vb[3]), ox = (b.w - st.vb[2] * kk) / 2, oy = (b.h - st.vb[3] * kk) / 2;
        var mx = b.x - W.scrollX + ox + (115 - st.vb[0]) * kk, my = b.y - W.scrollY + oy + (190 - st.vb[1]) * kk;
        px = x - mx; py = y - my;
        var a = Math.atan2(py, px) / D2R;
        tgt = Math.hypot(px, py) < 600 ? Math.max(A_C, Math.min(0, a)) : REST;
        H.loop.add(tick);
      });
      D.addEventListener('pointerleave', function () { tgt = REST; H.loop.add(tick); });
    },
    pose: function (st) { st.parts.alpha = REST; st.parts.pose(); st.parts.cg.setAttribute('opacity', 1); }
  };
  var D = W.document;
  function strike(st, instant) {
    var P = st.parts, a = P.arc, A0 = a.__arc.a0, A1 = a.__arc.a1;
    a.classList.add('on');
    if (instant) { a.style.strokeDashoffset = 0; P.alpha = REST; P.pose(); return; }
    P.busy = true;
    tween(0, 1, 500, H.EASE_PEN, function (e) { a.style.strokeDashoffset = r2(1 - e); P.alpha = A0 + (A1 - A0) * e; P.pose(); }, function () {
      tween(P.alpha, REST, 500, H.EASE_MECH, function (v) { P.alpha = v; P.pose(); }, function () { P.busy = false; });
    });
  }
  // compass in its own frame: needle at (0,0), drawing point at (167.705,0), hinge at (83.85,-170.5)
  function compass(pen, g, k) {
    var Hn = [83.85, -170.5], N = [0, 0], T = [167.705, 0], hw = 2.5 / k;
    function leg(tip, inset) {
      var dx = tip[0] - Hn[0], dy = tip[1] - Hn[1], L = Math.hypot(dx, dy), nx = -dy / L * hw, ny = dx / L * hw;
      var a = [Hn[0] + nx, Hn[1] + ny], b = [Hn[0] - nx, Hn[1] - ny], s = [tip[0] - dx / L * inset, tip[1] - dy / L * inset];
      pen.fill('M' + r2(a[0]) + ',' + r2(a[1]) + 'L' + r2(s[0]) + ',' + r2(s[1]) + 'L' + r2(b[0]) + ',' + r2(b[1]) + 'Z', { fill: C.paper }, { g: g });
      pen.ink([a, s], { g: g, w: 'fine', split: false }); pen.ink([b, s], { g: g, w: 'fine', split: false });
      return s;
    }
    var sN = leg(N, 9), sT = leg(T, 7);
    pen.ink([sN, N], { g: g, w: 0.7 }); // the steel needle
    pen.ink([sT, T], { g: g, w: 1.1 }); // the lead
    // quadrant wing between the legs, with its set screw
    var q = H.arcPts(Hn[0], Hn[1], 64, 117, 63, 3);
    pen.ink(q, { g: g, w: 'fine', split: false });
    pen.ink(H.arcPts(q[q.length - 1][0], q[q.length - 1][1], 2.6, 0, 360, 30), { g: g, w: 0.7, closed: true, split: false });
    pen.fill(circD(Hn[0], Hn[1], 6), { fill: C.paper }, { g: g });
    pen.ink(H.arcPts(Hn[0], Hn[1], 6, 0, 360, 15), { g: g, w: 'fine', closed: true, split: false });
    pen.ink(H.arcPts(Hn[0], Hn[1], 2, 0, 360, 30), { g: g, w: 0.7, closed: true, split: false });
    pen.ink([[Hn[0], Hn[1] - 6], [Hn[0], Hn[1] - 6 - 14]], { g: g, w: 1.4 });
  }
  function circD(cx, cy, r) { return 'M' + r2(cx - r) + ',' + r2(cy) + 'a' + r + ',' + r + ' 0 1,0 ' + 2 * r + ',0a' + r + ',' + r + ' 0 1,0 ' + (-2 * r) + ',0Z'; }

  // ======================================================================
  // S3 Skeletal icosahedron
  var V = [], EG = [], FC = [], RECT = [[], [], []], SC = 69.4, EYE = 5.2 * 132;
  (function () {
    [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) {
      RECT[0].push(V.length); V.push([0, a, b * PHI]);
      RECT[1].push(V.length); V.push([a, b * PHI, 0]);
      RECT[2].push(V.length); V.push([b * PHI, 0, a]);
    }); });
    var i, j, l, adj = [];
    function d2(p, q) { return (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]); }
    for (i = 0; i < 12; i++) { adj[i] = []; for (j = 0; j < 12; j++) adj[i][j] = i !== j && Math.abs(d2(V[i], V[j]) - 4) < 1e-6; }
    for (i = 0; i < 12; i++) for (j = i + 1; j < 12; j++) if (adj[i][j]) EG.push({ a: i, b: j, f: [] });
    for (i = 0; i < 12; i++) for (j = i + 1; j < 12; j++) for (l = j + 1; l < 12; l++) if (adj[i][j] && adj[j][l] && adj[i][l]) FC.push([i, j, l]);
    EG.forEach(function (e) { FC.forEach(function (f, n) { if (f.indexOf(e.a) >= 0 && f.indexOf(e.b) >= 0) e.f.push(n); }); });
    // order each golden rectangle around its plane
    var ax = [[1, 2], [0, 1], [0, 2]];
    RECT.forEach(function (r, n) { r.sort(function (p, q) { return Math.atan2(V[p][ax[n][1]], V[p][ax[n][0]]) - Math.atan2(V[q][ax[n][1]], V[q][ax[n][0]]); }); });
  })();
  function project(yaw, pitch) {
    var cy = Math.cos(yaw * D2R), sy = Math.sin(yaw * D2R), cp = Math.cos(pitch * D2R), sp = Math.sin(pitch * D2R);
    return V.map(function (v) {
      var x = v[0] * SC, y = v[1] * SC, z = v[2] * SC, x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, f = EYE / (EYE - z2);
      return { x: x1 * f, y: -y2 * f, z: z2, X: x1, Y: y2 };
    });
  }
  function faceVis(p) {
    return FC.map(function (f) {
      var cx = (p[f[0]].X + p[f[1]].X + p[f[2]].X) / 3, cy = (p[f[0]].Y + p[f[1]].Y + p[f[2]].Y) / 3, cz = (p[f[0]].z + p[f[1]].z + p[f[2]].z) / 3;
      return cx * (0 - cx) + cy * (0 - cy) + cz * (EYE - cz) > 0;
    });
  }
  function offLine(pa, pb, off, wob, k) {
    var dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, pts = [];
    for (var i = 0; i < 6; i++) { var t = i / 5, o = (off + wob[i]) / k; pts.push([pa.x + dx * t + nx * o, pa.y + dy * t + ny * o]); }
    return pts;
  }
  var icosa = {
    id: 's3', viewBox: [-160, -160, 320, 320],
    build: function (pen, st) {
      var k = st.k, P = st.parts, g = st.layers.ink, i, ss = Math.max(0.6, Math.min(1, k / 1.125)); // strut gauge eases down below the broad-sheet size
      var wob = EG.map(function (e, n) { var r = H.rng('s3:edge:' + n); var f = function () { var w = []; for (var q = 0; q < 6; q++) w.push((r() * 2 - 1) * 0.35); return w; }; return { l: f(), r: f(), m: f(), op: r2(0.8 + 0.16 * r()) }; });
      var rw = [0, 1, 2].map(function (n) { var r = H.rng('s3:rect:' + n), w = []; for (var q = 0; q < 4; q++) { var s = []; for (var m = 0; m < 6; m++) s.push((r() * 2 - 1) * 0.3); w.push(s); } return w; });
      P.rects = [0, 1, 2].map(function () { return pen.add('path', { fill: 'none', stroke: C.silver, 'stroke-opacity': 0.9, 'stroke-width': r2(0.6 / k * 100) / 100 }, st.layers.silver, 'hs', 0, 0); });
      P.back = pen.add('path', { fill: 'none', stroke: C.silver, 'stroke-opacity': 0.9, 'stroke-width': r2(0.7 / k * 100) / 100, 'stroke-linecap': 'round' }, st.layers.silver, 'hs', 0, 0);
      P.slots = [];
      for (i = 0; i < 30; i++) {
        var sg = H.el('g', null, g);
        P.slots.push({ f: pen.add('path', { fill: C.paper, stroke: 'none' }, sg, 'hf', 0, 0),
          a: pen.add('path', { fill: 'none', stroke: C.ink, 'stroke-width': r2(1.25 / k * 100) / 100, 'stroke-linecap': 'round' }, sg, 'hs', 0, 0),
          b: pen.add('path', { fill: 'none', stroke: C.ink, 'stroke-width': r2(1.25 / k * 100) / 100, 'stroke-linecap': 'round' }, sg, 'hs', 0, 0) });
      }
      P.joints = [];
      for (i = 0; i < 12; i++) P.joints.push(pen.add('circle', { r: r2(4.5 * ss / k), fill: C.paper, stroke: C.ink, 'stroke-width': r2(1.0 / k * 100) / 100, 'stroke-opacity': 0.9 }, g, 'hz', 0, 0));
      P.yaw = 24; P.pitch = 18; P.hv = 0;
      P.render = function () {
        var p = project(P.yaw + P.hv, P.pitch), vis = faceVis(p), backD = '', fr = [], front = {}, n;
        P.rects.forEach(function (el, m) {
          var d = '', R = RECT[m];
          for (var s = 0; s < 4; s++) d += H.pathD(offLine(p[R[s]], p[R[(s + 1) % 4]], 0, rw[m][s], k));
          el.setAttribute('d', d);
        });
        EG.forEach(function (e, n) {
          if (!vis[e.f[0]] && !vis[e.f[1]]) backD += H.pathD(offLine(p[e.a], p[e.b], 0, wob[n].m, k));
          else { fr.push({ n: n, z: (p[e.a].z + p[e.b].z) / 2 }); front[e.a] = front[e.b] = 1; }
        });
        P.back.setAttribute('d', backD);
        fr.sort(function (a, b) { return a.z - b.z; });
        for (n = 0; n < 30; n++) {
          var s = P.slots[n];
          if (n >= fr.length) { s.f.setAttribute('d', ''); s.a.setAttribute('d', ''); s.b.setAttribute('d', ''); continue; }
          var e = EG[fr[n].n], w = wob[fr[n].n], la = offLine(p[e.a], p[e.b], 2.6 * ss, w.l, k), lb = offLine(p[e.a], p[e.b], -2.6 * ss, w.r, k);
          s.a.setAttribute('d', H.pathD(la)); s.b.setAttribute('d', H.pathD(lb));
          s.a.setAttribute('stroke-opacity', w.op); s.b.setAttribute('stroke-opacity', w.op);
          s.f.setAttribute('d', 'M' + la.concat(lb.slice().reverse()).map(function (q) { return r2(q[0]) + ',' + r2(q[1]); }).join('L') + 'Z');
        }
        var js = [];
        for (n = 0; n < 12; n++) if (front[n]) js.push(n);
        js.sort(function (a, b) { return p[a].z - p[b].z; });
        P.joints.forEach(function (c, m) {
          if (m < js.length) { c.setAttribute('cx', r2(p[js[m]].x)); c.setAttribute('cy', r2(p[js[m]].y)); c.removeAttribute('visibility'); }
          else c.setAttribute('visibility', 'hidden');
        });
        return fr.length;
      };
      var nf = P.render();
      // construction timeline (static at the rest orientation)
      var it = pen.items;
      function time(el, t, d) { for (var q = 0; q < it.length; q++) if (it[q].el === el) { it[q].t = t; it[q].d = d; return; } }
      P.rects.forEach(function (el, m) { time(el, m * 380, 380); });
      time(P.back, 1140, 400);
      for (i = 0; i < 30; i++) {
        var t = 1540 + (i < nf ? i * (520 / nf) : 0), sl = P.slots[i];
        time(sl.f, t, 120); time(sl.a, t, 180); time(sl.b, t + 20, 180);
      }
      P.joints.forEach(function (c, m) { time(c, 2040 + 30 * m, 120); });
    },
    live: function (st) {
      if (H.reduced || st.__bound) return; st.__bound = true;
      var px = 0, py = 0, sy = W.scrollY;
      function target() { return [24 + 22 * px + 0.04 * sy, 18 + 14 * py]; }
      function tick(now, dt) {
        var P = st.parts, t = target(), e = 1 - Math.pow(0.92, dt / 16.7);
        if (!st.inView) { P.yaw = t[0]; P.pitch = t[1]; P.render(); return false; } // off screen: settle at once, no frames
        P.yaw += (t[0] - P.yaw) * e; P.pitch += (t[1] - P.pitch) * e;
        var done = Math.abs(t[0] - P.yaw) < 0.02 && Math.abs(t[1] - P.pitch) < 0.02;
        if (done) { P.yaw = t[0]; P.pitch = t[1]; }
        P.render(); return !done;
      }
      if (fine) H.onPointer(function (x, y, type) { if (type === 'touch') return; px = Math.max(-1, Math.min(1, x / W.innerWidth * 2 - 1)); py = Math.max(-1, Math.min(1, y / W.innerHeight * 2 - 1)); if (st.inView) H.loop.add(tick); });
      H.onScroll(function (y) { sy = y; if (st.inView) H.loop.add(tick); });
      H.observe(st, 0, function (e) { if (e.isIntersecting && st.state === 'live') { var t = target(); st.parts.yaw = t[0]; st.parts.pitch = t[1]; st.parts.render(); } });
      st.parts.yaw = target()[0]; st.parts.render();
    }
  };

  // ======================================================================
  // S4 Geared hoist
  function teeth(z, rp, phase) {
    var Pp = 360 / z, ro = rp + 7.2, rr = rp - 9, pts = [];
    for (var i = 0; i < z; i++) {
      var s = phase + i * Pp - Pp / 2;
      pts = pts.concat(H.arcPts(0, 0, rr, s, s + 0.24 * Pp, 2).slice(i ? 1 : 0), H.arcPts(0, 0, ro, s + 0.37 * Pp, s + 0.63 * Pp, 1.5), H.arcPts(0, 0, rr, s + 0.76 * Pp, s + Pp, 2));
    }
    pts.pop(); return pts;
  }
  var hoist = {
    id: 's4', viewBox: [0, 0, 420, 310],
    build: function (pen, st) {
      var P = st.parts, g = st.layers.ink, k = st.k;
      var gA = H.el('g', { transform: 'translate(158 150)' }, g), gB = H.el('g', { transform: 'translate(320 150) rotate(0)' }, g);
      var front = H.el('g', null, g), wG = H.el('g', null, front);
      pen.step(0, 400, function () { pen.rule([20, 150], [400, 150]); pen.rule([158, 24], [158, 286]); pen.rule([320, 80], [320, 220]); });
      pen.step(300, 400, function () { pen.arc(158, 150, 108, -90, 270); pen.arc(320, 150, 54, -90, 270, { noPrick: true }); });
      pen.step(700, 800, function () { pen.ink(teeth(24, 108, 0), { closed: true, split: false, g: gA }); });
      pen.step(1300, 500, function () { pen.ink(teeth(12, 54, 15), { closed: true, split: false, g: gB }); });
      pen.step(1700, 600, function () {
        pen.ink(H.arcPts(0, 0, 87, -90, 270, 2), { closed: true, split: false, g: gA, w: 'fine' });
        pen.ink(H.arcPts(0, 0, 30, -90, 270, 4), { closed: true, split: false, g: gA });
        for (var i = 0; i < 6; i++) {
          var a = (30 + 60 * i) * D2R, ux = Math.cos(a), uy = Math.sin(a);
          [5, -5].forEach(function (o) { pen.ink([[ux * 29.6 - uy * o, uy * 29.6 + ux * o], [ux * 86.8 - uy * o, uy * 86.8 + ux * o]], { g: gA, w: 'fine' }); });
        }
        pen.ink(H.arcPts(0, 0, 14, -90, 270, 6), { closed: true, split: false, g: gB });
        for (var j = 0; j < 4; j++) { var b = (45 + 90 * j) * D2R; pen.ink(H.arcPts(30 * Math.cos(b), 30 * Math.sin(b), 9, -90, 270, 8), { closed: true, split: false, g: gB, w: 'fine' }); }
        pen.ink([[14, -3], [40, -3]], { g: gB, w: 'fine' }); pen.ink([[14, 3], [40, 3]], { g: gB, w: 'fine' });
        pen.fill(circD(40, 0, 4.5), { fill: C.paper }, { g: gB });
        pen.ink(H.arcPts(40, 0, 4.5, -90, 270, 15), { closed: true, split: false, g: gB });
        pen.ink([[43, -3], [48.5, -8.5]], { g: gB, w: 'heavy' });
      });
      pen.step(2200, 350, function () {
        pen.fill(circD(158, 150, 26), { fill: C.paper }, { g: front });
        pen.ink(H.arcPts(158, 150, 26, -90, 270, 4), { closed: true, split: false, g: front });
        pen.ink(H.arcPts(158, 150, 4, -90, 270, 30), { closed: true, split: false, g: front, w: 'fine' });
        P.cord = pen.thread([132, 150], [132, 264], { g: front });
        pen.fill('M126,270L138,270L142,292L122,292Z', { fill: C.paper }, { g: wG });
        pen.ink([[126, 270], [138, 270], [142, 292], [122, 292], [126, 270]], { g: wG });
        pen.ink(H.arcPts(132, 267, 3, 90, 450, 30), { closed: true, split: false, g: wG, w: 'fine' });
        pen.ink([[20, 296], [400, 296]], { w: 'heavy' });
      });
      pen.step(2450, 250, function () {
        var half = H.arcPts(158, 150, 24.5, 4, 176, 6);
        pen.hatch(half, { g: front });
        pen.hatch([[127.5, 271.5], [136.5, 271.5], [140, 290.5], [124, 290.5]], { g: wG });
      });
      P.a = 0; P.hv = 0;
      P.render = function () {
        var a = P.a + P.hv, wy = Math.max(200, Math.min(280, 270 - 26 * a * D2R));
        gA.setAttribute('transform', 'translate(158 150) rotate(' + r2(a) + ')');
        gB.setAttribute('transform', 'translate(320 150) rotate(' + r2(-2 * a) + ')');
        wG.setAttribute('transform', 'translate(0 ' + r2(wy - 270) + ')');
        P.cord.setAttribute('d', 'M132,150L132,' + r2(wy - 6));
      };
    },
    live: function (st) {
      if (H.reduced || st.__bound) return; st.__bound = true;
      var sy = W.scrollY;
      function tick(now, dt) {
        var P = st.parts, t = 0.06 * sy, e = 1 - Math.pow(0.8, dt / 16.7);
        if (!st.inView) { P.a = t; P.render(); return false; }
        P.a += (t - P.a) * e; var done = Math.abs(t - P.a) < 0.01; if (done) P.a = t;
        P.render(); return !done;
      }
      H.onScroll(function (y) { sy = y; if (st.inView) H.loop.add(tick); });
      H.observe(st, 0, function (e) { if (e.isIntersecting && st.state === 'live') { st.parts.a = 0.06 * sy; st.parts.render(); } });
      st.parts.a = 0.06 * sy; st.parts.render();
    }
  };

  // ======================================================================
  // S5 Plumb line: host is 60 px wide, pin at its top + 10 px, bob bottom at its bottom − 20 px
  function plumb(sc, fixedH, bobOnly) {
    sc = sc || 1;
    return {
      id: 's5', viewBox: function (host) { return [-30, -10, 60, host ? host.clientHeight || 1800 : (fixedH || 1800)]; },
      build: function (pen, st) {
        var h = st.vb[3] - 30, top = h - 58 * sc, s = function (p) { return [p[0] * sc, top + p[1] * sc]; };
        if (!bobOnly) pen.step(0, 120, function () {
          pen.fill(circD(0, 0, 3), { fill: C.paper });
          pen.ink(H.arcPts(0, 0, 3, -90, 270, 20), { closed: true, split: false, w: 'fine' });
          pen.ink([[-1.8, 2.4], [-5.4, 7.2]], { w: 'fine' });
        });
        if (!bobOnly) pen.step(60, 840, function () { st.parts.thread = pen.thread([0, 3], [0, top - 6 * sc]); });
        var bob = st.parts.bob = H.el('g', null, st.layers.ink), prevG = pen.into(bob);
        pen.step(900, 400, function () {
          var R = [[0, 0], [4, 6], [4, 10], [13, 16], [13, 22], [9, 34], [4, 48], [0, 58]], L = R.slice(1, -1).reverse().map(function (p) { return [-p[0], p[1]]; });
          var out = R.concat(L).map(s);
          pen.fill('M' + out.map(function (q) { return r2(q[0]) + ',' + r2(q[1]); }).join('L') + 'Z', { fill: C.paper });
          pen.ink(out, { closed: true, split: false });
          pen.ink(H.arcPts(0, top - 3 * sc, 3 * sc, 90, 450, 30), { closed: true, split: false, w: 'fine' });
          pen.hatch([[4.33, 10.22], [13, 16], [13, 22], [9, 34], [4.33, 47.08]].map(s), { spacing: 3.4 * sc, g: bob });
        });
        pen.into(prevG);
        // pass 1c (c2): st.parts.payout(y) hangs the bob with its top at y (px below the pin, <= the full length)
        st.parts.top = top;
        st.parts.payout = function (y) {
          y = Math.min(top, Math.max(20, y));
          bob.setAttribute('transform', y === top ? '' : 'translate(0 ' + r2(y - top) + ')');
          if (st.parts.thread) st.parts.thread.setAttribute('d', 'M0,3L0,' + r2(y - 6 * sc));
          return y;
        };
      }
    };
  }

  // ======================================================================
  // Controls: rule with a sliding index (k = 1, the host is the rule's width)
  function indexRule(id) {
    return {
      id: id, viewBox: function (host) { return [-2, -9, Math.max(40, host ? host.clientWidth : 200) + 4, 40]; },
      build: function (pen, st) {
        var w = st.vb[2] - 4, tk = H.el('g', { 'class': 'ticks' }, st.layers.silver), i, n = Math.floor((w - 2) / 8);
        pen.step(0, 260, function () { pen.ink([[0, 6], [w, 6]], { w: 1.05, split: false }); });
        for (i = 0; i <= n; i++) {
          var x = 1 + i * 8, p = H.el('path', { d: 'M' + x + ',6.6V' + (i % 5 ? 10.6 : 13.6), stroke: C.ink2, 'stroke-width': 0.7, fill: 'none' }, tk);
          p.style.setProperty('--dl', Math.round(420 * x / w) + 'ms');
        }
        tk.setAttribute('class', 'ticks hf'); tk.style.setProperty('--t', '120ms'); tk.style.setProperty('--d', '200ms');
        var idx = H.el('g', { 'class': 'idx hf' }, st.layers.ink);
        idx.style.setProperty('--run', r2(w - 14) + 'px'); idx.style.setProperty('--t', '180ms'); idx.style.setProperty('--d', '160ms');
        H.el('rect', { x: 0, y: -7, width: 14, height: 26, fill: C.paper, 'fill-opacity': 0.85, stroke: C.ink, 'stroke-width': 1.3 }, idx);
        H.el('path', { d: 'M7,-7V19', stroke: C.ink, 'stroke-width': 0.6, fill: 'none' }, idx);
        H.el('circle', { 'class': 'knob', cx: 7, cy: 23.5, r: 3.5, fill: C.paper, stroke: C.ink, 'stroke-width': 1 }, idx);
        pen.t = Math.max(pen.t, 360);
      }
    };
  }
  function glyph(kind) {
    return {
      id: 'g-' + kind, viewBox: [-16, -16, 32, 32],
      build: function (pen, st) {
        var g = H.el('g', { 'class': 'rot' }, st.layers.ink);
        pen.step(0, 400, function () {
          if (kind === 'gear') {
            pen.ink(teeth(12, 54, 15).map(function (p) { return [p[0] * 0.235, p[1] * 0.235]; }), { closed: true, split: false, g: g, w: 1.0 }); // the 12-tooth gear B at 0.235 (fixed in pass 1b: was a starburst)
            pen.ink(H.arcPts(0, 0, 3.2, -90, 270, 20), { closed: true, split: false, g: g, w: 0.9 });
          } else {
            // the icosahedron seen down a five-fold axis: outline and front edges
            var t = Math.atan2(1, PHI), c = Math.cos(t), s = Math.sin(t), sc = 14.5 / Math.hypot(1, PHI);
            var p = V.map(function (v) { return { x: v[0] * sc, y: -(v[1] * c - v[2] * s) * sc, z: v[1] * s + v[2] * c }; });
            EG.forEach(function (e) { if (p[e.a].z > -0.5 || p[e.b].z > -0.5) pen.ink([[p[e.a].x, p[e.a].y], [p[e.b].x, p[e.b].y]], { g: g, w: 0.9 }); });
          }
        });
      }
    };
  }


  // ======================================================================
  // S1 The apparatus (SPEC-5 §2.6, REVIEW-5-1): a steelyard carrying a turned solid whose radius is 34·√f,
  // on a pedestal engraved with the record. apparatus(narrow, init, opts) -> def; init = {prior, n};
  // opts.mini (pass 1c): the first-viewport miniature, viewBox crop 80 40 840 430 on a ground line.
  // st.parts.set(prior, n, mode): mode 'instant' | 'step' | 'run' | 'prior' | 'reset'.
  // Everything that reads as inference is exact at the integer state; motion only decorates.
  function apparatus(narrow, init, opts) {
    init = init || { prior: 'flat', n: 0 }; opts = opts || {};
    var mini = !!opts.mini;
    var G = narrow ? {
      vb: [0, 0, 390, 551.6], X0: 46, S: 298, AY: 112, R: 15.5, arb: [30, 360], w0: 34, dy: 40, by: 182, bh: 16, bx: [28, 362], ptr: 3.5,
      hk: [46, 344], ty: 268, thw: 28, tr: 2.7, tp: 6, trh: 5.2, tb: 264.6, kn: [198, 216, 9, 2.5, 280, 286, 13],
      cap: [[286, 30, 360], [290, 36, 354]], die: [40, 350, 290, 429.6], base: [[429.6, 36, 354], [434.6, 30, 360], [439.6, 26, 364]],
      ry0: 298, rdy: 2.6, rt0: 0.16, rt1: 0.15, eo: 0.45, tri: 45, g1: 457.6, g2: 471.6, rg: [40, 352], ry: 464.6, slot: 298 / 48, iw: 9, ih: 26, ki: 3.4, ky: 483.6,
      hs: 3, cs: 3.8, arcMin: 1.4, cut: [3, 6], lead: [322, 96], mt: 245 }
      : {
      vb: [0, 0, 1000, 710], X0: 140, S: 720, AY: 170, R: 34, arb: [118, 882], w0: 48, dy: 56, by: 300, bh: 24, bx: [104, 896], ptr: 5,
      hk: [140, 860], ty: 440, thw: 60, tr: 4.4, tp: 10, trh: 8.66, tb: 434.6, kn: [324, 356, 15, 4, 452, 462, 22],
      cap: [[462, 96, 904], [468, 108, 892]], die: [120, 880, 468, 612], base: [[612, 108, 892], [618, 96, 904], [624, 88, 912]],
      ry0: 478, rdy: 2.7, rt0: 0.18, rt1: 0.18, eo: 0.5, tri: 137, g1: 644, g2: 660, rg: [132, 868], ry: 652, slot: 15, iw: 12, ih: 32, ki: 4.5, ky: 676,
      hs: 4, cs: 5, arcMin: 3, cut: [5, 10], lead: [800, 128], mt: 394 };
    if (mini) G.vb = [80, 40, 840, 430];
    var B = W.Bayes, DATA = B.DATA, N = B.N, X = function (t) { return G.X0 + G.S * t; }, sc = G.R / 34;
    function rowY(i) { return G.ry0 + G.rdy * i; }
    function slotX(i) { return G.X0 + G.slot * (i - 0.5); }
    function pile(p, side) {
      var j = 0, cap = 9; while (p >= cap && j < 8) { p -= cap; j++; cap--; }
      return [G.hk[side] + (p - (cap - 1) / 2) * G.tp, G.tb - j * G.trh];
    }
    function rArr(s) { return s.ys.map(function (f) { return G.R * Math.sqrt(f); }); }
    function rAt(r, t) { t = Math.max(0, Math.min(1, t)); var u = t * 200, j = Math.min(199, Math.floor(u)), f = u - j; return r[j] * (1 - f) + r[j + 1] * f; }
    function pts(list) { return list.map(function (q) { return r2(q[0]) + ',' + r2(q[1]); }).join('L'); }
    return {
      id: mini ? 's1m' : narrow ? 's1n' : 's1w', viewBox: G.vb, G: G, X: X, mini: mini,
      build: function (pen, st) {
        var P = st.parts, k = st.k, svg = st.svg, i, id = this.id;
        var defs = H.el('defs', null, svg); svg.insertBefore(defs, svg.firstChild);
        var cA = H.el('path', null, H.el('clipPath', { id: id + '-ca' }, defs)), cC = H.el('path', null, H.el('clipPath', { id: id + '-cc' }, defs));
        var base = st.layers.ink, tilt = H.el('g', { 'class': 'tilt' }, base), knifeG = H.el('g', { 'class': 'knife' }, base);
        var plinth = H.el('g', null, base), railTok = H.el('g', null, base);
        base.insertBefore(plinth, tilt); // pedestal and rail behind the beam assembly
        if (mini && svg.style) svg.style.overflow = 'hidden';
        var wU = [], wD = [], nu = H.noise(id + ':sil:u'), nd = H.noise(id + ':sil:d');
        for (i = 0; i <= 200; i++) { wU.push(0.35 / k * nu(i / 9)); wD.push(0.35 / k * nd(i / 9)); }
        var b0 = G.bx[0], b1 = G.bx[1], by = G.by, bh = G.bh, sw = function (px) { return r2(px / k * 100) / 100; };

        // ---- pedestal: cap, die, base (no box); or, for the miniature, a ground line ----
        if (mini) pen.step(0, 300, function () { pen.rule([80, 462], [920, 462], { g: plinth }); pen.ink([[80, 462], [920, 462]], { g: plinth, split: false, over: true, w: 'heavy' }); });
        else pen.step(0, 300, function () {
          pen.rule([G.cap[0][1], G.cap[0][0]], [G.cap[0][2], G.cap[0][0]], { g: plinth }); pen.rule([G.base[2][1], G.base[2][0]], [G.base[2][2], G.base[2][0]], { g: plinth });
          pen.ink([[G.cap[0][1], G.cap[0][0]], [G.cap[0][2], G.cap[0][0]]], { g: plinth, split: false, over: true, w: 1.4 });
          pen.ink([[G.cap[1][1], G.cap[1][0]], [G.cap[1][2], G.cap[1][0]]], { g: plinth, split: false, over: true, w: 'fine' });
          pen.ink([[G.die[0], G.die[2]], [G.die[0], G.die[3]]], { g: plinth, w: 'fine' }); pen.ink([[G.die[1], G.die[2]], [G.die[1], G.die[3]]], { g: plinth, w: 'fine' });
          pen.ink([[G.base[0][1], G.base[0][0]], [G.base[0][2], G.base[0][0]]], { g: plinth, split: false, over: true, w: 'fine' });
          pen.ink([[G.base[1][1], G.base[1][0]], [G.base[1][2], G.base[1][0]]], { g: plinth, split: false, over: true });
          pen.ink([[G.base[2][1], G.base[2][0]], [G.base[2][2], G.base[2][0]]], { g: plinth, split: false, over: true, w: 'heavy' });
        });
        // ---- record: light engraving, one line per posterior ----
        var rec = { flat: H.el('g', null, plinth), centred: H.el('g', null, plinth) };
        ['flat', 'centred'].forEach(function (pk) {
          var nz = H.noise(id + ':rec:' + pk);
          P[pk] = mini ? [] : B.ST[pk].map(function (s, n) {
            var y = rowY(n), up = [], dn = [];
            for (var j = 0; j <= 200; j += 2) { var x = X(j / 200), h = (G.rt0 + G.rt1 * s.ys[j]) / 2, w = 0.1 / k * nz(n * 7.3 + j / 14); up.push([x, y - h + w]); dn.push([x, y + h + w]); }
            return H.el('path', { d: 'M' + pts(up.concat(dn.reverse())) + 'Z', fill: C.ink, 'fill-opacity': 0.5, visibility: 'hidden' }, rec[pk]);
          });
        });
        P.rec = rec;
        P.band = H.el('path', { fill: C.sanguine }, plinth);
        P.tri = pen.add('path', { d: mini ? '' : 'M' + G.tri + ',0L' + (G.tri - 6 * sc - 2) + ',' + (-2.4 * sc - 1) + 'L' + (G.tri - 6 * sc - 2) + ',' + (2.4 * sc + 1) + 'Z', fill: C.ink }, plinth, 'hf', 2100, 100);
        // the graver (pass 1c, c3): a burin, tip at (0,0), 10 units long
        // REVIEW-5-2: 22 units long, ink 1.5, a 6-unit lozenge tip touching the line at (0,0)
        P.graver = H.el('g', { visibility: 'hidden' }, plinth);
        (function () { var dx = 0.5, dy = -0.866, nx = 0.866, ny = 0.5, w = 1.5;
          H.el('path', { d: 'M0,0L' + r2(3 * dx + w * nx) + ',' + r2(3 * dy + w * ny) + 'L' + r2(6 * dx) + ',' + r2(6 * dy) + 'L' + r2(3 * dx - w * nx) + ',' + r2(3 * dy - w * ny) + 'Z', fill: C.ink }, P.graver);
          H.el('path', { d: 'M' + r2(6 * dx) + ',' + r2(6 * dy) + 'L' + r2(22 * dx) + ',' + r2(22 * dy), stroke: C.ink, 'stroke-width': sw(1.5), 'stroke-linecap': 'round', fill: 'none' }, P.graver); })();

        // ---- rail ----
        var railG = H.el('g', null, plinth);
        if (!mini) pen.step(1100, 220, function () {
          pen.rule([G.rg[0], G.g1], [G.rg[1], G.g1], { g: railG }); pen.rule([G.rg[0], G.g2], [G.rg[1], G.g2], { g: railG });
          pen.ink([[G.rg[0], G.g1], [G.rg[1], G.g1]], { g: railG, split: false, w: 'fine', over: true });
          pen.ink([[G.rg[0], G.g2], [G.rg[1], G.g2]], { g: railG, split: false, w: 1.1, over: true });
        });
        P.pricks = []; P.ticks = [];
        for (i = 1; i <= N; i++) {
          P.pricks[i] = H.el('circle', { cx: r2(slotX(i)), cy: G.ry, r: r2(Math.max(0.6, 0.8 * sc + 0.2)), fill: C.silver, visibility: 'hidden' }, railG);
          if (DATA[i - 1] === '1' && !mini) P.ticks[i] = pen.add('path', { d: 'M' + r2(slotX(i)) + ',' + (G.g2 + 0.8) + 'v' + r2(3 * sc + 1), stroke: C.ink, 'stroke-width': sw(0.9), fill: 'none', visibility: 'hidden' }, railG, 'hf', 1250 + 6 * i, 60);
        }
        P.idx = pen.add('g', { 'class': 'idx-a' }, plinth, 'hf', 1700, 120);
        P.idxRing = H.el('rect', { 'class': 'idx-ring', visibility: 'hidden', x: -G.iw / 2 - 3, y: G.ry - G.ih / 2 - 3, width: G.iw + 6, height: G.ih + 6, fill: 'none', stroke: C.sanguineDeep, 'stroke-width': sw(2) }, P.idx);
        if (!mini) {
          H.el('rect', { x: -G.iw / 2, y: G.ry - G.ih / 2, width: G.iw, height: G.ih, fill: C.paper, 'fill-opacity': 0.55, stroke: C.ink, 'stroke-width': sw(1.3) }, P.idx);
          H.el('path', { d: 'M0,' + (G.ry - G.ih / 2) + 'v' + G.ih, stroke: C.ink, 'stroke-width': sw(0.5) }, P.idx);
          H.el('path', { d: 'M0,' + (G.ry + G.ih / 2) + 'V' + (G.ky - G.ki), stroke: C.ink, 'stroke-width': sw(0.9) }, P.idx);
        }
        P.knob = H.el('circle', { 'class': 'idx-knob', cy: G.ky, r: mini ? 0 : G.ki, fill: C.paper, stroke: C.ink, 'stroke-width': sw(1) }, P.idx);

        // ---- knife-edge (stands on the pedestal; drawn at x = 0, translated to X(mean)) ----
        var K = G.kn;
        pen.step(300, 300, function () {
          pen.fill('M0,' + K[0] + 'L' + K[2] + ',' + K[1] + 'H' + K[3] + 'V' + K[4] + 'H' + K[6] + 'V' + K[5] + 'H' + (-K[6]) + 'V' + K[4] + 'H' + (-K[3]) + 'V' + K[1] + 'H' + (-K[2]) + 'Z', { fill: C.paper }, { g: knifeG });
          pen.ink([[0, K[0]], [K[2], K[1]], [-K[2], K[1]], [0, K[0]]], { g: knifeG });
          pen.ink([[K[3], K[1]], [K[3], K[4]]], { g: knifeG, w: 'fine' }); pen.ink([[-K[3], K[1]], [-K[3], K[4]]], { g: knifeG, w: 'fine' });
          pen.ink([[-K[6], K[4]], [K[6], K[4]], [K[6], K[5]], [-K[6], K[5]], [-K[6], K[4]]], { g: knifeG });
          pen.ink([[0, K[0]], [0, by]], { g: knifeG, w: 0.9, split: false });
          if (!mini) pen.ink([[K[3] + 0.5, G.mt], [K[3] + 8 * (narrow ? 0.75 : 1), G.mt]], { g: knifeG, w: 0.9, split: false }); // tick to the Mean annotation
        });
        P.knife = knifeG;

        // ---- beam, posts, arbor, hooks, cords, trays (the tilting assembly) ----
        pen.step(500, 400, function () {
          pen.rule([b0, by], [b1, by], { g: tilt }); pen.rule([b0, by + bh], [b1, by + bh], { g: tilt });
          pen.fill('M' + b0 + ',' + by + 'H' + b1 + 'V' + (by + bh) + 'H' + b0 + 'Z', { fill: C.paper }, { g: tilt });
          pen.ink([[b0, by], [b1, by], [b1, by + bh], [b0, by + bh], [b0, by]], { g: tilt, over: true, w: 1.5 });
          for (var j = 0; j <= 20; j++) pen.ink([[X(j / 20), by], [X(j / 20), by + (j % 5 ? G.cut[0] : G.cut[1])]], { g: tilt, w: 0.8, speed: 2400 });
        });
        pen.step(800, 250, function () {
          G.arb.forEach(function (x) {
            pen.ink([[x - 3 * sc, by], [x - 3 * sc, G.AY + 8 * sc], [x - 5 * sc, G.AY - 2 * sc]], { g: tilt, w: 'fine' });
            pen.ink([[x + 3 * sc, by], [x + 3 * sc, G.AY + 8 * sc], [x + 5 * sc, G.AY - 2 * sc]], { g: tilt, w: 'fine' });
          });
          pen.ink([[G.arb[0], G.AY], [G.arb[1], G.AY]], { g: tilt, w: 'fine', split: false });
          G.arb.forEach(function (x) { pen.ink(H.arcPts(x, G.AY, 3 * sc + 0.4, 0, 360, 30), { g: tilt, w: 'fine', closed: true, split: false }); });
        });
        pen.step(900, 350, function () {
          G.hk.forEach(function (hx) {
            var hy = by + bh, ty = G.ty, w = G.thw;
            pen.ink([[hx, hy], [hx, hy + 5 * sc + 1]], { g: tilt, w: 'fine' });
            pen.ink(H.arcPts(hx, hy + 8 * sc + 1, 3 * sc + 0.3, -90, 230, 20), { g: tilt, w: 'fine', split: false });
            pen.thread([hx, hy + 11 * sc + 1], [hx - w, ty], { g: tilt, w: 0.7 }); pen.thread([hx, hy + 11 * sc + 1], [hx + w, ty], { g: tilt, w: 0.7 });
            pen.ink([[hx - w, ty], [hx + w, ty]], { g: tilt, split: false });
            pen.ink([[hx - w + 3, ty], [hx - w * 0.6, ty + 5 * sc + 1], [hx + w * 0.6, ty + 5 * sc + 1], [hx + w - 3, ty]], { g: tilt, w: 'fine', split: false });
          });
        });

        // ---- the solid ----
        P.fillP = pen.add('path', { fill: C.paper }, tilt, 'hf', 1400, 300);
        var hA = H.el('g', { 'clip-path': 'url(#' + id + '-ca)' }, tilt), hC = H.el('g', { 'clip-path': 'url(#' + id + '-cc)' }, tilt);
        P.hA = H.el('g', null, hA); P.hC = H.el('g', null, hC);
        var rect = [[G.X0, G.AY - 92 * sc], [X(1), G.AY - 92 * sc], [X(1), G.AY + 92 * sc], [G.X0, G.AY + 92 * sc]];
        pen.step(1900, 200, function () { pen.hatch(rect, { g: P.hA, color: 'sanguine', spacing: G.hs * k }); });
        // cross-hatch (pass 1c): a fixed family of 18° lines whose upper ends follow y = axis + 0.35 r,
        // each stopping 0-2.5 px short (seeded); recomputed per state, lower ends clipped by the silhouette
        var ca = 18 * D2R, cu = [Math.cos(ca), Math.sin(ca)], cn = [Math.sin(ca), -Math.cos(ca)], crr = H.rng(id + ':cross'), cl = [];
        var cx0 = (G.X0 + X(1)) / 2, cy0 = G.AY, cnc = cx0 * cn[0] + cy0 * cn[1], lo_ = Infinity, hi_ = -Infinity;
        rect.forEach(function (p) { var v = p[0] * cn[0] + p[1] * cn[1]; lo_ = Math.min(lo_, v); hi_ = Math.max(hi_, v); });
        for (var off = hi_ - G.cs * 0.6; off > lo_; off -= G.cs + (crr() - 0.5) / k) {
          cl.push({ p: [cx0 + cn[0] * (off - cnc), cy0 + cn[1] * (off - cnc)], st: 2.5 * crr() / k, bow: (crr() - 0.5) * 1.2 / k,
            el: pen.add('path', { fill: 'none', stroke: C.sanguine, 'stroke-opacity': 0.8, 'stroke-width': sw(0.7), 'stroke-linecap': 'round' }, P.hC, 'hs', 2000 + 2 * cl.length, 90) });
        }
        function cross(r, lo, hi) {
          var xa = X(lo), xb = X(hi), tn = Math.tan(ca);
          cl.forEach(function (c) {
            function y(x) { return c.p[1] + (x - c.p[0]) * tn; }
            function inside(x) { var rr = rAt(r, (x - G.X0) / G.S), yy = y(x); return yy >= G.AY + 0.35 * rr && yy <= G.AY + rr + 0.5; }
            var x = xa, s0 = null, s1 = null, step = 2, atLo = false;
            for (; x <= xb; x += step) { if (inside(x)) { s0 = x; atLo = x === xa; break; } }
            if (s0 == null) { c.el.setAttribute('d', ''); return; }
            if (!atLo) { var a = s0 - step, b = s0; for (var q = 0; q < 8; q++) { var m = (a + b) / 2; if (inside(m)) b = m; else a = m; } s0 = b; }
            for (x = s0; x <= xb && inside(x); x += step) s1 = x;
            s1 = Math.min(xb, (s1 == null ? s0 : s1) + step) + 2;
            var st0 = atLo ? -2 : c.st * cu[0], e0 = [s0 + st0, y(s0 + st0)], e1 = [s1, y(s1)];
            if (e1[0] - e0[0] < 1.5 / k) { c.el.setAttribute('d', ''); return; }
            var mx = (e0[0] + e1[0]) / 2, my = (e0[1] + e1[1]) / 2;
            c.el.setAttribute('d', 'M' + r2(e0[0]) + ',' + r2(e0[1]) + 'Q' + r2(mx + cn[0] * c.bow * 2) + ',' + r2(my + cn[1] * c.bow * 2) + ' ' + r2(e1[0]) + ',' + r2(e1[1]));
          });
        }
        P.arcs = [];
        for (i = 0; i <= 21; i++) P.arcs.push(pen.add('path', { fill: 'none', stroke: C.ink, 'stroke-opacity': 0.55, 'stroke-width': sw(0.7) }, tilt, 'hf', 1700 + 14 * i, 120));
        P.up = pen.add('path', { fill: 'none', stroke: C.ink, 'stroke-width': sw(1.5), 'stroke-linecap': 'round', 'stroke-opacity': 0.92 }, tilt, 'hs', 1400, 480);
        P.dn = pen.add('path', { fill: 'none', stroke: C.ink, 'stroke-width': sw(1.5), 'stroke-linecap': 'round', 'stroke-opacity': 0.92 }, tilt, 'hs', 1450, 480);
        P.lead = pen.add('path', { fill: 'none', stroke: C.silver, 'stroke-width': sw(0.7), 'stroke-opacity': 0.95 }, tilt, 'hf', 2100, 150);
        var wit = pen.add('g', { stroke: C.sanguine, 'stroke-width': sw(1), fill: 'none', 'stroke-linecap': 'round' }, tilt, 'hf', 2000, 150);
        P.wl = H.el('path', null, wit); P.wh = H.el('path', null, wit); P.dm = H.el('path', null, wit);
        P.pt = H.el('path', { fill: C.sanguine, stroke: 'none' }, wit);
        P.panTok = H.el('g', null, tilt);

        // ---- tokens: observations are face down on the rail (ring with a centre dot) ----
        function face(kind, g) {
          var r = G.tr, w = sw(0.9);
          if (kind === 'y') H.el('circle', { r: r, fill: C.ink, 'fill-opacity': 0.92 }, g);
          else {
            H.el('circle', { r: r2(Math.max(0.4, r - 0.4 / k)), fill: C.paper, stroke: C.ink, 'stroke-width': w }, g);
            if (kind === 'p') H.el('path', { d: 'M' + r2(-r * 0.45) + ',' + r2(-r * 0.62) + 'v' + r2(r * 1.24) + 'M0,' + r2(-r * 0.8) + 'v' + r2(r * 1.6) + 'M' + r2(r * 0.45) + ',' + r2(-r * 0.62) + 'v' + r2(r * 1.24), stroke: C.ink, 'stroke-width': sw(0.7) }, g);
            if (kind === 'd') H.el('circle', { r: r2(Math.max(0.55, r * 0.22)), fill: C.ink }, g);
          }
          return g;
        }
        function token(kind) {
          var g = H.el('g', { 'class': 'tk' });
          if (kind === 'p') { face('p', g); return g; }
          g.__up = face(kind, H.el('g', { visibility: 'hidden' }, g)); g.__dn = face('d', H.el('g', null, g));
          return g;
        }
        P.tok = [null]; for (i = 1; i <= N; i++) { P.tok[i] = token(DATA[i - 1] === '1' ? 'y' : 'n'); railTok.appendChild(P.tok[i]); }
        P.pw = [[], []]; for (i = 0; i < 10; i++) { P.pw[0].push(token('p')); P.pw[1].push(token('p')); P.panTok.appendChild(P.pw[0][i]); P.panTok.appendChild(P.pw[1][i]); }
        P.railTok = railTok;
        function faceUp(el, up) { if (!el.__up) return; el.__up.setAttribute('visibility', up ? 'visible' : 'hidden'); el.__dn.setAttribute('visibility', up ? 'hidden' : 'visible'); }

        // ---- state ----
        function place(el, x, y, g) {
          if (g && el.parentNode !== g) g.appendChild(el);
          el.setAttribute('transform', 'translate(' + r2(x) + ' ' + r2(y) + ')'); el.style.transform = 'translate(' + r2(x) + 'px,' + r2(y) + 'px)'; el.__p = [x, y];
        }
        function shift(el, x, dur) { el.setAttribute('transform', 'translate(' + r2(x) + ' 0)'); el.style.transition = dur ? 'transform ' + dur + 'ms var(--ease-mech)' : ''; el.style.transform = 'translateX(' + r2(x) + 'px)'; }
        function layout(pk, n) {
          var pr = B.PRIORS[pk], L = P.pw[0].slice(0, pr[1]), R = P.pw[1].slice(0, pr[0]);
          for (var q = 1; q <= n; q++) (DATA[q - 1] === '1' ? R : L).push(P.tok[q]);
          return [L, R];
        }
        function solid(r, lo, hi) {
          var up = [], dn = [], j, ca_ = [], cb = [];
          for (j = 0; j <= 200; j++) { var x = X(j / 200); up.push([x, G.AY - r[j] - wU[j]]); dn.push([x, G.AY + r[j] + wD[j]]); }
          P.up.setAttribute('d', H.pathD(up)); P.dn.setAttribute('d', H.pathD(dn));
          P.fillP.setAttribute('d', 'M' + pts(up.concat(dn.slice().reverse())) + 'Z');
          var ts = [lo]; for (j = Math.ceil(lo * 200 + 1e-9); j < hi * 200; j++) ts.push(j / 200); ts.push(hi);
          ts.forEach(function (t) { var rr = rAt(r, t), x = X(t); ca_.push([x, G.AY - rr - 0.6]); cb.push([x, G.AY + rr + 0.6]); });
          var clip = 'M' + pts(ca_.concat(cb.slice().reverse())) + 'Z';
          cA.setAttribute('d', clip); cC.setAttribute('d', clip);
          cross(r, lo, hi);
          for (j = 0; j <= 20; j++) {
            var rj = r[j * 10], xj = X(j / 20);
            P.arcs[j].setAttribute('d', rj >= G.arcMin ? 'M' + r2(xj) + ',' + r2(G.AY - rj) + 'A' + r2(0.16 * rj) + ',' + r2(rj) + ' 0 0 0 ' + r2(xj) + ',' + r2(G.AY + rj) : '');
          }
          var re = r[200], xe = X(1);
          P.arcs[21].setAttribute('d', re >= G.arcMin ? 'M' + r2(xe) + ',' + r2(G.AY - re) + 'A' + r2(0.16 * re) + ',' + r2(re) + ' 0 0 1 ' + r2(xe) + ',' + r2(G.AY + re) : '');
          var lx = G.lead[0], ly = G.AY - rAt(r, (lx - G.X0) / G.S) - 3;
          P.lead.setAttribute('d', mini || ly <= G.lead[1] + 1 ? '' : 'M' + lx + ',' + G.lead[1] + 'V' + r2(ly));
          var xl = r2(X(lo)), xh = r2(X(hi)), a = 6 * sc + 1, p = G.ptr;
          P.wl.setAttribute('d', 'M' + xl + ',' + (G.dy - 3) + 'V' + (by - p)); P.wh.setAttribute('d', 'M' + xh + ',' + (G.dy - 3) + 'V' + (by - p)); // REVIEW-5-2: 3 above the dimension line
          P.pt.setAttribute('d', 'M' + xl + ',' + by + 'l' + (-p / 2) + ',' + (-p) + 'h' + p + 'Z' + 'M' + xh + ',' + by + 'l' + (-p / 2) + ',' + (-p) + 'h' + p + 'Z');
          P.dm.setAttribute('d', 'M' + xl + ',' + G.dy + 'H' + xh + 'M' + r2(xl + a) + ',' + r2(G.dy - a * 0.5) + 'L' + xl + ',' + G.dy + 'L' + r2(xl + a) + ',' + r2(G.dy + a * 0.5) +
            'M' + r2(xh - a) + ',' + r2(G.dy - a * 0.5) + 'L' + xh + ',' + G.dy + 'L' + r2(xh - a) + ',' + r2(G.dy + a * 0.5));
          P.lo = lo; P.hi = hi; P.r = r;
        }
        function bandD(s, n) {
          var y = rowY(n), up = [], dn = [], ts = [s.lo];
          for (var j = Math.ceil(s.lo * 200 + 1e-9); j < s.hi * 200; j++) ts.push(j / 200); ts.push(s.hi);
          ts.forEach(function (t) { var f = B.pdf(t, s.a, s.b), h = (G.rt0 + G.rt1 * f) / 2 + 0.15; up.push([X(t), y - h]); dn.push([X(t), y + h]); });
          return 'M' + pts(up.concat(dn.reverse())) + 'Z';
        }
        var anims = [];
        function anim(el, kf, o) { if (!el.animate) return; var a = el.animate(kf, o); anims.push(a); if (anims.length > 400) anims = anims.filter(function (x) { return x.playState !== 'finished'; }); return a; }
        function flip(el, dur) {
          if (!el.__up) return;
          el.__dn.setAttribute('visibility', 'visible'); el.__up.setAttribute('visibility', 'visible');
          anim(el.__dn, [{ transform: 'scaleY(1)', opacity: 1 }, { transform: 'scaleY(0)', opacity: 1, offset: 0.5 }, { transform: 'scaleY(0)', opacity: 0, offset: 0.501 }, { transform: 'scaleY(0)', opacity: 0 }], { duration: dur, fill: 'forwards' });
          var a = anim(el.__up, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(0)', opacity: 0, offset: 0.5 }, { transform: 'scaleY(0)', opacity: 1, offset: 0.501 }, { transform: 'scaleY(1)', opacity: 1 }], { duration: dur });
          if (a) a.onfinish = function () { faceUp(el, true); anims.forEach(function (x) { if (x.effect && x.effect.target === el.__dn) x.cancel(); }); };
        }
        function scribe(n, dur, graver) {
          var b = P[P.cur ? P.cur.prior : init.prior][n]; if (!b) return;
          anim(b, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: dur, easing: 'linear' });
          if (graver) {
            var y = rowY(n), gv = P.graver; gv.setAttribute('visibility', 'visible');
            var a = anim(gv, [{ transform: 'translate(' + X(0) + 'px,' + r2(y) + 'px)' }, { transform: 'translate(' + X(1) + 'px,' + r2(y) + 'px)' }], { duration: dur, easing: 'linear' });
            if (a) a.onfinish = function () { gv.setAttribute('visibility', 'hidden'); };
          }
        }
        P.cur = null;
        P.set = function (pk, n, mode) {
          if (mini && mode === 'step') mode = 'run';
          var prev = P.cur, s = B.ST[pk][n], quick = !prev || mode === 'instant' || mode === 'reset' || H.reduced;
          if (quick) { anims.forEach(function (a) { a.cancel(); }); anims = []; if (P.tw) P.tw.dead = true; P.graver.setAttribute('visibility', 'hidden'); }
          var lay = layout(pk, n), d = mode === 'prior' && !quick ? 240 : 0;
          lay.forEach(function (list, side) {
            list.forEach(function (el, p) {
              var q = pile(p, side); el.removeAttribute('visibility');
              if (mode === 'step' && el === P.tok[n] && !quick) {
                var from = el.__p, mid = [(from[0] + q[0]) / 2, Math.min(from[1], q[1]) - 40 * sc];
                el.style.transition = ''; railTok.appendChild(el);
                // REVIEW-5-2: 320 ms flight, the token drawn at 1.6x radius while in the air
                var A = function (t) { var u = 1 - t; return [u * u * from[0] + 2 * u * t * mid[0] + t * t * q[0], u * u * from[1] + 2 * u * t * mid[1] + t * t * q[1]]; };
                var kf = [[0, 1], [0.15, 1.6], [0.5, 1.6], [0.85, 1.6], [1, 1]].map(function (f) { var a = A(f[0]); return { transform: 'translate(' + r2(a[0]) + 'px,' + r2(a[1]) + 'px) scale(' + f[1] + ')', offset: f[0] }; });
                var fl = anim(el, kf, { duration: 320, easing: 'cubic-bezier(.3,0,.2,1)' });
                place(el, q[0], q[1]); flip(el, 320);
                if (fl) fl.onfinish = function () { if (P.cur && P.cur.n >= n) place(el, q[0], q[1], P.panTok); }; else place(el, q[0], q[1], P.panTok);
              } else {
                var was = el.__p && el.parentNode === P.panTok, isPw = el.getAttribute('data-in') !== '1' && P.pw[side].indexOf(el) >= 0;
                el.style.transition = d && was ? 'transform 240ms var(--ease-mech)' : '';
                place(el, q[0], q[1], P.panTok); faceUp(el, true);
                if (mode === 'run' && el === P.tok[n] && !quick) anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 80 });
                if (isPw && d) anim(el, [{ opacity: 0, transform: 'translate(' + q[0] + 'px,' + (q[1] - 22 * sc) + 'px)' }, { opacity: 1, transform: 'translate(' + q[0] + 'px,' + q[1] + 'px)' }], { duration: 200, delay: 25 * p, fill: 'backwards', easing: 'cubic-bezier(.3,0,.2,1)' });
              }
              el.setAttribute('data-in', '1');
            });
          });
          P.pw.forEach(function (list, side) {
            list.forEach(function (el, q) {
              if (lay[side].indexOf(el) >= 0) return;
              var wasIn = el.getAttribute('data-in') === '1' && el.getAttribute('visibility') !== 'hidden';
              el.setAttribute('data-in', '0');
              if (wasIn && d) { var p0 = el.__p || [0, 0], a = anim(el, [{ opacity: 1 }, { opacity: 0, transform: 'translate(' + p0[0] + 'px,' + (p0[1] - 22 * sc) + 'px)' }], { duration: 200, delay: 25 * (q - 1), fill: 'forwards' }); if (a) a.onfinish = function () { el.setAttribute('visibility', 'hidden'); a.cancel(); }; }
              else el.setAttribute('visibility', 'hidden');
            });
          });
          for (var i = n + 1; i <= N; i++) {
            var el = P.tok[i]; el.style.transition = ''; el.setAttribute('data-in', '0'); place(el, slotX(i), G.ry, railTok); faceUp(el, false);
            if (mode === 'reset' && !H.reduced) anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
          }
          for (i = 1; i <= N; i++) { P.pricks[i].setAttribute('visibility', i <= n ? 'visible' : 'hidden'); if (P.ticks[i]) P.ticks[i].setAttribute('visibility', i <= n ? 'visible' : 'hidden'); }
          ['flat', 'centred'].forEach(function (q) {
            P[q].forEach(function (b, m) { b.setAttribute('visibility', m <= n ? 'visible' : 'hidden'); b.setAttribute('fill-opacity', m < n ? G.eo : 0.8); });
            P.rec[q].setAttribute('visibility', q === pk ? 'visible' : 'hidden');
          });
          if (mode === 'prior' && !quick) { P.rec[pk].setAttribute('visibility', 'visible'); P.rec[prev.prior].setAttribute('visibility', 'visible'); anim(P.rec[pk], [{ opacity: 0 }, { opacity: 1 }], { duration: 100 }); var o = anim(P.rec[prev.prior], [{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' }); if (o) o.onfinish = function () { if (P.cur.prior !== prev.prior) P.rec[prev.prior].setAttribute('visibility', 'hidden'); o.cancel(); }; }
          P.band.setAttribute('d', mini ? '' : bandD(s, n));
          P.tri.setAttribute('transform', 'translate(0 ' + r2(rowY(n)) + ')');
          var kd = quick ? 0 : mode === 'run' ? 55 : mode === 'prior' ? 240 : 180;
          shift(P.knife, X(s.mean), kd); shift(P.idx, G.X0 + G.slot * n, mode === 'step' && !quick ? 120 : 0);
          P.kd = kd;
          var rT = rArr(s), dur = quick || mode === 'run' ? 0 : mode === 'prior' ? 240 : 180;
          if (!dur || !P.r) solid(rT, s.lo, s.hi);
          else {
            var r0 = P.r.slice(), l0 = P.lo, h0 = P.hi, tw = P.tw = { dead: false }, t0 = null, e = H.EASE_MECH;
            H.loop.add(function (now) {
              if (tw.dead) return false; if (t0 == null) t0 = now;
              var p = Math.min(1, (now - t0) / dur), f = e(p);
              solid(r0.map(function (v, j) { return v + (rT[j] - v) * f; }), l0 + (s.lo - l0) * f, h0 + (s.hi - h0) * f);
              return p < 1;
            });
          }
          P.cur = { prior: pk, n: n };
          if (!quick && !mini && (mode === 'step' || mode === 'run') && n > 0) scribe(n, mode === 'step' ? 240 : 55, mode === 'step');
          if (mode === 'step' && !quick) {
            var nx = Math.sin(52 * D2R) * G.hs, ny = -Math.cos(52 * D2R) * G.hs;
            anim(P.hA, [{ transform: 'translate(0,0)' }, { transform: 'translate(' + r2(nx) + 'px,' + r2(ny) + 'px)' }], { duration: 180, easing: 'cubic-bezier(.3,0,.2,1)' });
            var yes = DATA[n - 1] === '1', mag = 1.2 * Math.min(1, 8 / (s.a + s.b)) * (yes ? 1 : -1);
            tilt.style.transformOrigin = r2(X(s.mean)) + 'px ' + G.kn[0] + 'px';
            anim(tilt, [{ transform: 'rotate(0deg)', easing: 'cubic-bezier(.3,0,.6,1)' }, { transform: 'rotate(' + r2(mag) + 'deg)', offset: 90 / 260, easing: 'cubic-bezier(.2,.6,.3,1)' }, { transform: 'rotate(0deg)' }], { duration: 260 });
          }
        };
        var self = this, s0 = this.cur || init; P.set(s0.prior, s0.n, 'instant');
        var set0 = P.set; P.set = function (pk, n, mode) { set0(pk, n, mode); self.cur = { prior: pk, n: n }; };
        // construction reveal of the dynamic layers
        P.tok.forEach(function (el, i) { if (el) { el.setAttribute('class', 'tk hf'); el.style.setProperty('--t', (1300 + 8 * i) + 'ms'); el.style.setProperty('--d', '60ms'); } });
        P.pw.forEach(function (l) { l.forEach(function (el) { el.setAttribute('class', 'tk hf'); el.style.setProperty('--t', '1250ms'); el.style.setProperty('--d', '100ms'); }); });
        pen.add('g', null, null, 'hf', 2100, 100); // keeps the timeline at 2200 ms
        P.rec.flat.setAttribute('class', 'hf'); P.rec.centred.setAttribute('class', 'hf');
        [P.rec.flat, P.rec.centred, P.band].forEach(function (e) { e.style.setProperty('--t', '2100ms'); e.style.setProperty('--d', '100ms'); });
        P.band.setAttribute('class', 'hf');
        if (mini) { // the miniature constructs in 1.4 s
          var f = 1400 / 2200;
          pen.items.forEach(function (it) { it.t *= f; it.d *= f; });
          P.tok.concat(P.pw[0], P.pw[1]).forEach(function (el) { if (el) { el.style.setProperty('--t', Math.round(parseFloat(el.style.getPropertyValue('--t')) * f) + 'ms'); } });
        }
      },
      pose: function (st) { }
    };
  }

  // ======================================================================
  // S6 Toss study: one parabolic path, nine discs turning (not data)
  var toss = {
    id: 's6', viewBox: [0, 0, 640, 260],
    build: function (pen, st) {
      var k = st.k;
      function at(t) { return [70 + 490 * t, 214 - 680 * t * (1 - t)]; }
      pen.step(0, 300, function () { pen.rule([30, 220], [610, 220]); pen.ink([[30, 220], [610, 220]], { over: true, split: false }); });
      pen.step(300, 450, function () {
        var p = []; for (var i = 0; i <= 100; i++) p.push(at(i / 100));
        pen.line(H.wobble(p, 0.5, 70, 19, k, 's6:path'), 0.6, C.silver, 0.9, 'round', 'hs', pen.t, 450, st.layers.silver); pen.t += 450;
      });
      pen.step(750, 150, function () { pen.rule([315, 30], [315, 220]); });
      for (var j = 0; j <= 8; j++) (function (j) {
        pen.step(900 + 100 * j, 90, function () {
          var t = j / 8, c = at(t), a = Math.atan2(-680 * (1 - 2 * t), 490), cs = Math.cos(j * 67.5 * D2R), ry = Math.max(1.2, 13 * Math.abs(cs));
          pen.rule(c, [c[0], 220], { flush: true });
          if (j === 4) { pen.ink([[c[0] - 13 * Math.cos(a), c[1] - 13 * Math.sin(a)], [c[0] + 13 * Math.cos(a), c[1] + 13 * Math.sin(a)]], { w: 1.4 }); return; }
          var e = []; for (var q = 0; q < 360; q += 10) { var u = q * D2R, x = 13 * Math.cos(u), y = ry * Math.sin(u); e.push([c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]); }
          if (cs > 0) pen.fill('M' + e.map(function (p) { return r2(p[0]) + ',' + r2(p[1]); }).join('L') + 'Z', { fill: C.ink, 'fill-opacity': 0.88 });
          else pen.fill('M' + e.map(function (p) { return r2(p[0]) + ',' + r2(p[1]); }).join('L') + 'Z', { fill: C.paper });
          pen.ink(e, { closed: true, split: false, w: cs > 0 ? 1.1 : 1.25 });
        });
      })(j);
    }
  };

  W.Studies = { apparatus: apparatus, toss: toss, golden: golden, icosa: icosa, hoist: hoist, plumb: plumb, indexRule: indexRule, glyph: glyph,
    nudge: function (st, deg) { nudgeTo(st, deg, 700); } };
})(window);
