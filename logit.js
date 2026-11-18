/* logit.js: Fig II, "From a line to a probability" (design/notebook-spec.txt, section 3), drawn with hand.js.
   Module contract (spec 1.6): Notebook.figures.logit = { mount(host, env) -> instance, selfTest() }.

   The mathematics (all live, nothing typed in):
     data      n = 60 cases. x_i standard normal (Box-Muller from Hand.rng('logit:<signal>:<seed>')),
               clipped to [-2.6, 2.6]; y_i = 1 if u_i < sigma(-0.6 + b1* x_i), b1* = 0.8 / 1.8 / 3.2.
               Seeds were chosen by searching (see SEED below), never the answers: 18 to 26 defaults,
               not separable, and the fair set's fitted AUC rounds to 0.81.
     model     logit(p_i) = b0 + b1 x_i, fitted by maximum likelihood for Bernoulli outcomes:
               l(b) = sum [y ln p + (1 - y) ln(1 - p)], Newton-Raphson b <- b + (X'WX)^-1 X'(y - p),
               W = diag(p(1 - p)), start (0, 0), step halved if l falls, stop when max |step| < 1e-8 or 25 steps.
     classify  predicted default iff phat >= t. TPR = TP / (TP + FN), FPR = FP / (FP + TN).
     ROC       thresholds = distinct phat, descending; equal scores enter together; AUC by the trapezoid
               rule, cross-checked by pair counting (default above non-default, ties count half).
   The threshold never changes the curve or the AUC: only the operating point moves along it. */
(function (W) {
  'use strict';
  var D = W.document, H = W.Hand;
  var NB = W.Notebook = W.Notebook || { figures: {} }; NB.figures = NB.figures || {};
  if (!H) return;
  var C = H.C, r2 = H.r2, R2D = 180 / Math.PI;
  var N = 60, B0 = -0.6, B1 = { weak: 0.8, fair: 1.8, strong: 3.2 }, SIGNALS = ['weak', 'fair', 'strong'];
  // Found by NB.figures.logit.search(signal): the first seed from 1 meeting the conditions of spec 3.1.
  var SEED = { weak: 1, fair: 12, strong: 3 };
  var MINUS = '−';

  // =====================================================================================================
  // Mathematics
  function sigma(e) { if (e >= 0) return 1 / (1 + Math.exp(-e)); var z = Math.exp(e); return z / (1 + z); }
  function odds(p) { return p / (1 - p); }
  function logit(p) { return Math.log(p / (1 - p)); }
  function softplus(e) { return e > 0 ? e + Math.log1p(Math.exp(-e)) : Math.log1p(Math.exp(e)); }
  function gen(signal, seed) {
    var r = H.rng('logit:' + signal + ':' + seed), x = [], y = [], b1 = B1[signal];
    for (var i = 0; i < N; i++) {
      var u1 = r(), u2 = r(), u3 = r();
      var z = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
      z = Math.max(-2.6, Math.min(2.6, z));
      x.push(z); y.push(u3 < sigma(B0 + b1 * z) ? 1 : 0);
    }
    return { x: x, y: y, signal: signal, seed: seed };
  }
  // y ln p + (1 - y) ln(1 - p) = y eta - ln(1 + e^eta), computed stably
  function loglik(b0, b1, d) { var l = 0; for (var i = 0; i < d.x.length; i++) { var e = b0 + b1 * d.x[i]; l += d.y[i] * e - softplus(e); } return l; }
  function grad(b0, b1, d) { var g0 = 0, g1 = 0; for (var i = 0; i < d.x.length; i++) { var r = d.y[i] - sigma(b0 + b1 * d.x[i]); g0 += r; g1 += r * d.x[i]; } return [g0, g1]; }
  function newton(d, start) {
    var b = start ? [start[0], start[1]] : [0, 0], it = [{ b0: b[0], b1: b[1], l: loglik(b[0], b[1], d) }];
    for (var k = 0; k < 25; k++) {
      var g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
      for (var i = 0; i < d.x.length; i++) {
        var x = d.x[i], p = sigma(b[0] + b[1] * x), r = d.y[i] - p, w = p * (1 - p);
        g0 += r; g1 += r * x; h00 += w; h01 += w * x; h11 += w * x * x;
      }
      var det = h00 * h11 - h01 * h01; if (!(det > 0)) break;
      var d0 = (h11 * g0 - h01 * g1) / det, d1 = (h00 * g1 - h01 * g0) / det;
      var l0 = it[it.length - 1].l, s = 1, nb0 = b[0] + d0, nb1 = b[1] + d1, nl = loglik(nb0, nb1, d);
      for (var hv = 0; hv < 40 && nl < l0; hv++) { s /= 2; nb0 = b[0] + s * d0; nb1 = b[1] + s * d1; nl = loglik(nb0, nb1, d); }
      b = [nb0, nb1]; it.push({ b0: nb0, b1: nb1, l: nl });
      if (Math.max(Math.abs(s * d0), Math.abs(s * d1)) < 1e-8) break;
    }
    return { b0: b[0], b1: b[1], l: loglik(b[0], b[1], d), it: it, grad: grad(b[0], b[1], d) };
  }
  function scores(b0, b1, d) { var ph = []; for (var i = 0; i < d.x.length; i++) ph.push(sigma(b0 + b1 * d.x[i])); return ph; }
  function roc(ph, y) {
    var n = ph.length, idx = [], i, P = 0;
    for (i = 0; i < n; i++) { idx.push(i); P += y[i]; }
    var Nn = n - P; idx.sort(function (a, b) { return ph[b] - ph[a]; });
    var tp = 0, fp = 0, pts = [{ f: 0, t: 0, thr: Infinity, tp: 0, fp: 0 }], k = 0;
    while (k < n) {
      var s = ph[idx[k]];
      while (k < n && ph[idx[k]] === s) { if (y[idx[k]]) tp++; else fp++; k++; }
      pts.push({ f: fp / Nn, t: tp / P, thr: s, tp: tp, fp: fp });
    }
    var auc = 0; for (i = 1; i < pts.length; i++) auc += (pts[i].f - pts[i - 1].f) * (pts[i].t + pts[i - 1].t) / 2;
    return { pts: pts, auc: auc, P: P, N: Nn };
  }
  function aucPairs(ph, y) {
    var s = 0, m = 0;
    for (var i = 0; i < ph.length; i++) if (y[i]) for (var j = 0; j < ph.length; j++) if (!y[j]) { m++; s += ph[i] > ph[j] ? 1 : ph[i] === ph[j] ? 0.5 : 0; }
    return s / m;
  }
  function counts(ph, y, t) {
    var c = { TP: 0, FP: 0, TN: 0, FN: 0 };
    for (var i = 0; i < ph.length; i++) { var pr = ph[i] >= t; if (y[i]) { if (pr) c.TP++; else c.FN++; } else { if (pr) c.FP++; else c.TN++; } }
    return c;
  }
  function separable(d) {
    var mx0 = -Infinity, mn0 = Infinity, mx1 = -Infinity, mn1 = Infinity;
    for (var i = 0; i < d.x.length; i++) { var x = d.x[i]; if (d.y[i]) { mx1 = Math.max(mx1, x); mn1 = Math.min(mn1, x); } else { mx0 = Math.max(mx0, x); mn0 = Math.min(mn0, x); } }
    return mx0 <= mn1 || mx1 <= mn0;
  }
  function nDef(d) { var s = 0; for (var i = 0; i < d.y.length; i++) s += d.y[i]; return s; }
  var cache = {};
  function dataset(signal) {
    if (cache[signal]) return cache[signal];
    var d = gen(signal, SEED[signal]), f = newton(d), ph = scores(f.b0, f.b1, d), R = roc(ph, d.y);
    return (cache[signal] = { d: d, fit: f, auc: R.auc, lNull: loglik(0, 0, d) });
  }
  function search(signal, from, count) {
    var out = [];
    for (var s = from || 1; s < (from || 1) + (count || 4000) && out.length < 5; s++) {
      var d = gen(signal, s), k = nDef(d);
      if (k < 18 || k > 26 || separable(d)) continue;
      var f = newton(d), a = roc(scores(f.b0, f.b1, d), d.y).auc;
      if (signal === 'fair' && Math.round(a * 100) !== 81) continue;
      out.push({ seed: s, defaults: k, auc: a, b0: f.b0, b1: f.b1 });
    }
    return out;
  }

  function selfTest() {
    var checks = [], ok = true;
    function chk(name, pass, detail) { checks.push({ name: name, ok: !!pass, detail: detail }); if (!pass) ok = false; }
    var worst = 0, p;
    for (var i = 1; i <= 99; i++) { p = i / 100; worst = Math.max(worst, Math.abs(sigma(logit(p)) - p)); }
    chk('sigma(logit(p)) = p for 99 values', worst < 1e-12, 'max error ' + worst.toExponential(2));
    SIGNALS.forEach(function (sg) {
      var S = dataset(sg), d = S.d, f = S.fit, g = Math.hypot(f.grad[0], f.grad[1]);
      chk(sg + ': gradient norm at the maximum < 1e-6', g < 1e-6, g.toExponential(2) + ' after ' + (f.it.length - 1) + ' Newton steps');
      var nd = nDef(d);
      chk(sg + ': 18 to 26 defaults', nd >= 18 && nd <= 26, nd + ' defaults, seed ' + d.seed);
      chk(sg + ': not separable', !separable(d), '');
      var ph = scores(f.b0, f.b1, d), R = roc(ph, d.y), A2 = aucPairs(ph, d.y);
      chk(sg + ': trapezoid AUC = pair AUC to 1e-12', Math.abs(R.auc - A2) < 1e-12, R.auc.toFixed(6) + ' vs ' + A2.toFixed(6));
      var a1 = R.auc, same = true, vert = true, total = true;
      [0.1, 0.5, 0.9].forEach(function (t) { counts(ph, d.y, t); var R2 = roc(ph, d.y); if (R2.auc !== a1) same = false; });
      chk(sg + ': AUC identical at t = 0.1, 0.5, 0.9', same, a1.toFixed(4));
      for (var k = 0; k <= 100; k++) {
        var c = counts(ph, d.y, k / 100);
        if (c.TP + c.FP + c.TN + c.FN !== 60) total = false;
        var hit = R.pts.some(function (q) { return q.tp === c.TP && q.fp === c.FP; });
        if (!hit) vert = false;
      }
      chk(sg + ': operating point is a vertex for 101 thresholds', vert, '');
      chk(sg + ': TP + FP + TN + FN = 60', total, '');
    });
    var fa = dataset('fair').auc;
    chk('fair AUC rounds to 0.81', Math.round(fa * 100) === 81, fa.toFixed(4));
    return { ok: ok, checks: checks };
  }

  // =====================================================================================================
  // Small helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function f2(v) { return (v < 0 ? MINUS : '') + Math.abs(v).toFixed(2); }
  function sw(px, k) { return r2(px / k * 1000) / 1000; }
  function circD(cx, cy, r) { return 'M' + r2(cx - r) + ',' + r2(cy) + 'a' + r2(r) + ',' + r2(r) + ' 0 1,0 ' + r2(2 * r) + ',0a' + r2(r) + ',' + r2(r) + ' 0 1,0 ' + r2(-2 * r) + ',0Z'; }
  function polyD(pts) { var s = ''; for (var i = 0; i < pts.length; i++) s += (i ? 'L' : 'M') + r2(pts[i][0]) + ',' + r2(pts[i][1]); return s; }
  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function textW(str, size) { // estimate of EB Garamond advance widths, in the units of size
    var w = 0; for (var i = 0; i < str.length; i++) { var c = str[i]; w += c === ' ' ? 0.24 : c === '.' || c === ',' ? 0.24 : /[0-9]/.test(c) ? 0.5 : c === '=' || c === MINUS || c === '+' ? 0.56 : /[A-Z]/.test(c) ? 0.66 : c === '/' || c === '(' || c === ')' ? 0.3 : 0.44; }
    return w * size;
  }
  function bezPts(a, c1, c2, b, n) {
    var out = []; for (var i = 0; i <= n; i++) { var t = i / n, s = 1 - t;
      out.push([s * s * s * a[0] + 3 * s * s * t * c1[0] + 3 * s * t * t * c2[0] + t * t * t * b[0], s * s * s * a[1] + 3 * s * s * t * c1[1] + 3 * s * t * t * c2[1] + t * t * t * b[1]]); }
    return out;
  }
  function plen(pts) { var L = [0]; for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return L; }
  function along(pts, L, s) {
    if (s <= 0) return pts[0]; var n = pts.length - 1; if (s >= L[n]) return pts[n];
    var lo = 0, hi = n; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (L[m] <= s) lo = m; else hi = m; }
    var f = (s - L[lo]) / ((L[hi] - L[lo]) || 1); return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
  }
  function overlap(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }

  // =====================================================================================================
  // Geometry of the three parts (core frames, spec 3.2 to 3.4) and of the four modes
  var GA = { W: 300, H: 320, X: function (x) { return 96 + (x + 3) / 6 * 194; }, iX: function (px) { return (px - 96) / 194 * 6 - 3; },
    P: function (p) { return 140 - p * 126; }, iP: function (y) { return (140 - y) / 126; }, E: function (e) { return 243 - e * 12.6; }, iE: function (y) { return (243 - y) / 12.6; }, sx: 78 };
  function GB(kind) {
    if (kind === 'tall') return { kind: kind, r: 3.6, cols: 40, cw: 8, vp: 7.6, bp: 8.4, minTop: 34, oneKey: false, W: 380, H: 420, a0: 26, a1: 346, ay: 150, top: 34, base: 320, bx: [150, 262], scaleX: 100, scaleSide: -1,
      route: function (which, gx, gy, sx, sy) { var ry = which ? 206 : 192; return [[gx, gy], [gx, ry], [sx, ry], [sx, sy]]; },
      rails: [[[20, 192], [352, 192]], [[20, 206], [352, 206]]],
      mouth: [192, 206], axLab: 175, txt: [366, 385, 403], key: [262, 372], title: [0, 6], crank: [266, 403], totalY: null };
    return { kind: 'wide', r: 4.6, cols: 32, cw: 10, vp: 10, bp: 10, minTop: 46, oneKey: true, W: 540, H: 288, a0: 26, a1: 346, ay: 150, top: 46, base: 272, bx: [382, 479], scaleX: 347, scaleSide: -1,
      route: function (which, gx, gy, sx, sy) { var ry = which ? 170 : 180; return [[gx, gy], [gx, ry], [sx, ry], [sx, sy]]; },
      rails: [[[20, 180], [330, 180]], [[356, 180], [412, 180]], [[20, 170], [330, 170]], [[356, 170], [508, 170]]],
      mouth: [180, 170], axLab: 194, txt: [216, 235, 253], key: [540, 8], title: [0, 8], crank: [8, 28], totalY: 156 };
  }
  function GC(kind) {
    if (kind === 'plate') return { x0: 10, y0: 26, S: 250, title: [0, 10], key: 316, crank: [182, 332] };
    if (kind === 'pocket') return { x0: 44, y0: 30, S: 300, title: [0, 10], key: 372, crank: [250, 404] };
    if (kind === 'margin') return { x0: 0, y0: 0, S: 58, mini: true };
    return { x0: 28, y0: 30, S: 186, title: [0, 10], key: 258, crank: [158, 312] };
  }
  function layoutFor(mode, Wu) {
    if (mode === 'plate') return { W: 1100, H: 620, a: { x: 16, y: 6, s: 1.25 }, b: { x: 420, y: 6, s: 1, kind: 'tall' }, c: { x: 824, y: 6, s: 1, kind: 'plate' }, extras: true };
    if (mode === 'pocket') return { W: 390, H: 1300, a: { x: 15, y: 6, s: 1.2 }, b: { x: 5, y: 404, s: 1, kind: 'tall' }, slider: { x: 5, y: 836 }, c: { x: 5, y: 886, s: 1, kind: 'pocket' } };
    if (mode === 'margin') return { W: 230, H: 170, b: { x: 0, y: 0, s: 0.66, kind: 'wide', mini: true }, c: { x: 12, y: 108, s: 1, kind: 'margin' } };
    return { W: 540, H: 624, a: { x: 0, y: 0, s: 1 }, b: { x: 0, y: 336, s: 1, kind: 'wide' }, c: { x: 320, y: 0, s: 1, kind: 'overview' } };
  }

  // =====================================================================================================
  // The figure
  function mount(host, env) {
    env = env || {};
    var reduced = env.reduced != null ? !!env.reduced : H.reduced;
    var U = function () { return (env.u && env.u()) || 1; };
    var uid = 'lg' + Math.floor(Math.random() * 1e9).toString(36);
    host.classList.add('nb-logit');
    var wrap = D.createElement('div'); wrap.className = 'nb-logit-in'; host.appendChild(wrap);
    var ctl = D.createElement('div'); ctl.className = 'nb-logit-ctl'; host.appendChild(ctl);
    var desc = D.createElement('p'); desc.className = 'nb-logit-sr'; desc.id = uid + '-desc'; ctl.appendChild(desc);

    // ---- the state ----------------------------------------------------------------------------------
    var M = { signal: 'fair', S: null, b0: 0, b1: 0, hand: false, ph: [], R: null, auc: 0, aucP: 0, t: 0.5, p: 0.2, cnt: null, lNow: 0,
      bins: [], ghost: [], units: [], arrived: { TP: 0, FP: 0, TN: 0, FN: 0 }, order: null };
    var S = { mode: null, running: env.running ? !!env.running() : true, visible: false, demo: !reduced, alive: true, entered: false, entry: null,
      clock: 0, looping: false, bead: 0, pulse: [-1e9, -1e9, -1e9, -1e9, -1e9], sweep: null, replay: null, pairs: null, lastPair: 0,
      demoP: null, demoT: null, lastAnnounce: 0, annT: 0, drag: null };
    var st = null, L = null, vb = [0, 0, 540, 624], parts = null, inputs = {};

    function loadSignal(sg, keepCoef) {
      M.signal = sg; M.S = dataset(sg);
      if (!keepCoef) { M.b0 = M.S.fit.b0; M.b1 = M.S.fit.b1; M.hand = false; }
      M.units = []; for (var i = 0; i < N; i++) M.units.push({ i: i, pos: null, path: null, dest: null, cat: null, arr: false, shown: false, dropT: 0, style: '' });
      M.arrived = { TP: 0, FP: 0, TN: 0, FN: 0 };
      S.pairs = { rng: H.rng('logit:pairs:' + sg), k: 0, m: 0, cur: null };
      recompute(true);
    }
    // ---- recompute everything downstream of the coefficients ---------------------------------------
    function recompute(fresh) {
      var d = M.S.d; M.ph = scores(M.b0, M.b1, d); M.R = roc(M.ph, d.y); M.auc = M.R.auc; M.aucP = aucPairs(M.ph, d.y); M.lNow = loglik(M.b0, M.b1, d);
      // the distribution: 40 columns of width 0.025, each stacked by score
      M.gh = {};
      [GB('wide'), GB('tall')].forEach(function (G) {
        var cols = [], c, i, gh = { pos: [], max: 0 }; for (c = 0; c < G.cols; c++) cols.push([]);
        for (i = 0; i < N; i++) cols[Math.min(G.cols - 1, Math.floor(M.ph[i] * G.cols))].push(i);
        cols.forEach(function (col, ci) { col.sort(function (a, b) { return M.ph[a] - M.ph[b]; }); col.forEach(function (i, k) { gh.pos[i] = [G.a0 + G.cw * (ci + 0.5), G.ay - G.r - 0.6 - G.vp * k]; }); gh.max = Math.max(gh.max, col.length); });
        M.gh[G.kind] = gh;
      });
      classify(fresh ? 'snapOrEntry' : 'model');
    }
    function cat(i, t) { var pr = M.ph[i] >= t, y = M.S.d.y[i]; return y ? (pr ? 'TP' : 'FN') : (pr ? 'FP' : 'TN'); }
    function ghostXY(i, G) { return M.gh[G.kind].pos[i]; }
    function gateTop(G) { return clamp(G.ay - M.gh[G.kind].max * G.vp - G.r - 10, G.minTop, G.ay - 30); }
    function slotXY(G, bar, j) { return [G.bx[bar] + ((j % 6) - 2.5) * G.bp, G.base - G.r - 0.6 - Math.floor(j / 6) * G.bp]; }
    // assign every case its bar and slot for the current threshold; start the flights that this needs
    function classify(why) {
      var t = M.t, lists = { TP: [], FP: [], TN: [], FN: [] }, i;
      for (i = 0; i < N; i++) lists[cat(i, t)].push(i);
      var byDesc = function (a, b) { return M.ph[b] - M.ph[a]; }, byAsc = function (a, b) { return M.ph[a] - M.ph[b]; };
      lists.TP.sort(byDesc); lists.FP.sort(byDesc); lists.TN.sort(byAsc); lists.FN.sort(byAsc);
      var dest = [];
      lists.TN.concat(lists.FN).forEach(function (i, j) { dest[i] = { bar: 0, j: j }; });
      lists.TP.concat(lists.FP).forEach(function (i, j) { dest[i] = { bar: 1, j: j }; });
      M.cnt = { TP: lists.TP.length, FP: lists.FP.length, TN: lists.TN.length, FN: lists.FN.length };
      M.order = lists;
      var G = parts && parts.b ? parts.b.G : GB('wide'), animate = canAnimate() && S.entered && !(S.entry && !S.entry.flowed), cross = [];
      for (i = 0; i < N; i++) {
        var u = M.units[i], c = cat(i, t), was = u.cat;
        u.dest = dest[i];
        if (why === 'snapOrEntry' || !animate || !u.pos) { if (!(S.entry && !S.entry.flowed)) { snapUnit(u, G, c); } else { u.cat = c; } continue; }
        if (was !== c) {
          if (u.arr) { M.arrived[was]--; u.arr = false; }
          u.cat = c; cross.push(u);
        } else if (u.arr || u.path) {
          var s = slotXY(G, u.dest.bar, u.dest.j);
          if (!u.path && (Math.abs(s[0] - u.pos[0]) > 0.01 || Math.abs(s[1] - u.pos[1]) > 0.01)) startPath(u, [u.pos, s], 220, 0, false);
          else if (u.path) retarget(u, G);
        }
      }
      if (why === 'model' && animate) { // a new model: every case leaves its place for its new slot
        cross.length = 0;
        for (i = 0; i < N; i++) { var uu = M.units[i]; if (uu.arr) { M.arrived[uu.cat === cat(i, t) ? uu.cat : uu.cat]--; } uu.arr = false; uu.cat = cat(i, t); startPath(uu, [uu.pos, slotXY(G, uu.dest.bar, uu.dest.j)], 380, 0, true); }
        recountArrived();
      }
      var ref = S.prevT == null ? t : S.prevT;
      cross.sort(function (a, b) { return Math.abs(M.ph[a.i] - ref) - Math.abs(M.ph[b.i] - ref); });
      cross.forEach(function (u, k) {
        var s = slotXY(G, u.dest.bar, u.dest.j), fromBar = u.dest.bar ? 0 : 1, my = G.mouth[u.dest.bar], p0 = u.pos;
        var hy = Math.min(my, G.mouth[fromBar]) - 4, pts = [p0, [p0[0], hy], [s[0], hy], s];
        startPath(u, pts, 450, 12 * k, true); u.path.cross = true;
      });
      S.prevT = t;
      dirty.b = dirty.c = dirty.txt = true;
      wake();
    }
    function recountArrived() { M.arrived = { TP: 0, FP: 0, TN: 0, FN: 0 }; M.units.forEach(function (u) { if (u.arr) M.arrived[u.cat]++; }); }
    function snapUnit(u, G, c) {
      if (u.arr) M.arrived[u.cat]--;
      u.cat = c || u.cat; u.path = null; u.pos = slotXY(G, u.dest.bar, u.dest.j); u.arr = true; u.shown = true; M.arrived[u.cat]++;
    }
    function startPath(u, pts, dur, delay, counts) { var Lp = plen(pts); u.path = { pts: pts, L: Lp, t0: S.clock + delay, dur: dur, counts: counts }; }
    function retarget(u, G) { var s = slotXY(G, u.dest.bar, u.dest.j), p = u.path.pts; p[p.length - 1] = s; u.path.L = plen(p); }
    function snapAll() {
      var G = parts && parts.b ? parts.b.G : GB('wide');
      M.units.forEach(function (u) { u.path = null; u.cat = cat(u.i, M.t); u.pos = slotXY(G, u.dest.bar, u.dest.j); u.arr = true; u.shown = true; });
      recountArrived(); dirty.b = true;
    }

    // ---- inputs: the native controls ----------------------------------------------------------------
    function range(name, label, min, max, step, val) {
      var el = D.createElement('input'); el.type = 'range'; el.min = min; el.max = max; el.step = step; el.value = val;
      el.setAttribute('aria-label', label); el.className = 'nb-logit-sr'; el.dataset.k = name; ctl.appendChild(el); inputs[name] = el; return el;
    }
    function button(name, label) { var el = D.createElement('button'); el.type = 'button'; el.textContent = label; el.className = 'nb-logit-sr'; el.dataset.k = name; ctl.appendChild(el); inputs[name] = el; return el; }
    range('p', 'Starting probability', 0.01, 0.99, 0.01, M.p).addEventListener('input', function (e) { setP(+e.target.value, true); });
    range('t', 'Classification threshold', 0, 1, 0.01, M.t).addEventListener('input', function (e) { setT(+e.target.value, true); });
    range('t2', 'Classification threshold, repeated above the ROC curve', 0, 1, 0.01, M.t).addEventListener('input', function (e) { setT(+e.target.value, true); });
    range('b0', 'Intercept beta 0, set by hand', -4, 4, 0.01, 0).addEventListener('input', function (e) { setCoef(+e.target.value, M.b1); });
    range('b1', 'Slope beta 1, set by hand', 0.1, 6, 0.01, 1).addEventListener('input', function (e) { setCoef(M.b0, +e.target.value); });
    button('demo', 'Demonstrate').addEventListener('click', function () { setDemo(true); });
    button('sweep', 'Sweep the threshold from 1 to 0 and trace the ROC curve').addEventListener('click', function () { startSweep(); });
    button('fit', 'Fit by maximum likelihood').addEventListener('click', function () { startReplay(); });
    var fs = D.createElement('fieldset'); fs.className = 'nb-logit-sr'; fs.innerHTML = '<legend>Signal in the data</legend>'; ctl.appendChild(fs);
    SIGNALS.forEach(function (sg) {
      var lb = D.createElement('label'), r = D.createElement('input'); r.type = 'radio'; r.name = uid + '-sig'; r.value = sg; r.checked = sg === 'fair'; r.dataset.k = 'sig-' + sg;
      lb.appendChild(r); lb.appendChild(D.createTextNode(' ' + sg)); fs.appendChild(lb); inputs['sig-' + sg] = r;
      r.addEventListener('change', function () { if (r.checked) setSignal(sg); });
    });
    // any input inside the figure takes control
    function touched() { if (env.interacted) env.interacted(); if (S.demo) setDemo(false, true); }
    host.addEventListener('pointerdown', touched, true);
    host.addEventListener('keydown', function (e) { if (e.key === 'Tab' || e.key === 'Shift') return; touched(); }, true);
    Object.keys(inputs).forEach(function (k) {
      var el = inputs[k];
      el.addEventListener('focus', function () { S.focus = k; S.focusVis = el.matches(':focus-visible'); dirty.focus = true; render(); });
      el.addEventListener('blur', function () { if (S.focus === k) S.focus = null; dirty.focus = true; render(); });
    });

    // ---- setters --------------------------------------------------------------------------------------
    function setP(p, user) {
      p = clamp(p, 0.01, 0.99); if (p === M.p) return; M.p = p;
      if (user) inputs.p.value = p.toFixed(2); else if (Math.abs(+inputs.p.value - p) >= 0.005) inputs.p.value = (Math.round(p * 100) / 100).toFixed(2);
      dirty.a = true; if (user) announceSoon(); wake(); if (!S.looping) render();
    }
    function setT(t, user) {
      t = clamp(Math.round(t * 100) / 100, 0, 1); if (t === M.t) return; M.t = t;
      inputs.t.value = inputs.t2.value = t.toFixed(2);
      if (!canAnimate()) { classify('snap'); snapAll(); } else classify('t');
      if (user) announceSoon(); if (!S.looping) render();
    }
    function setCoef(b0, b1) {
      M.b0 = clamp(b0, -4, 4); M.b1 = clamp(b1, 0.1, 6); M.hand = true; S.replay = null;
      inputs.b0.value = M.b0.toFixed(2); inputs.b1.value = M.b1.toFixed(2);
      recompute(false); if (!canAnimate()) snapAll(); dirty.a = dirty.c = dirty.ex = true; if (!S.looping) render();
    }
    function setSignal(sg) {
      if (sg === M.signal) return; S.replay = null; S.sweep = null;
      loadSignal(sg); inputs['sig-' + sg].checked = true;
      if (st) { st.rebuild(); st.finish(); }
      snapAll(); render(true);
    }
    function setDemo(on, quiet) {
      if (reduced) on = false;
      S.demo = !!on; S.demoP = S.demoT = null; dirty.ctl = true;
      if (on) wake(); render();
    }
    function startSweep() { if (!canAnimate()) { S.sweep = null; dirty.c = true; render(); return; } S.sweep = { t0: S.clock, dur: 1400, back: 600, hatchAt: 1500, aucAt: 1800 }; dirty.c = true; wake(); }
    function startReplay() {
      var f = newton(M.S.d, [M.b0, M.b1]); S.lastIt = f.it;
      if (!canAnimate()) { M.b0 = f.b0; M.b1 = f.b1; M.hand = false; inputs.b0.value = M.b0.toFixed(2); inputs.b1.value = M.b1.toFixed(2); S.replay = { it: f.it, k: f.it.length - 1, done: true }; recompute(false); snapAll(); dirty.a = dirty.c = dirty.ex = true; render(); return; }
      S.replay = { it: f.it, k: -1, t0: S.clock, done: false }; dirty.ex = true; wake();
    }
    function announceSoon() {
      clearTimeout(S.annT);
      S.annT = setTimeout(function () {
        var c = M.cnt;
        if (env.announce) env.announce('Threshold ' + M.t.toFixed(2) + ': TP ' + c.TP + ', FP ' + c.FP + ', TN ' + c.TN + ', FN ' + c.FN + '. True positive rate ' + (c.TP / (c.TP + c.FN)).toFixed(2) + ', false positive rate ' + (c.FP / (c.FP + c.TN)).toFixed(2) + '. AUC stays ' + M.auc.toFixed(2) + '. Starting probability ' + M.p.toFixed(2) + ', odds ' + odds(M.p).toFixed(2) + ', log-odds ' + logit(M.p).toFixed(2) + ', x ' + ((logit(M.p) - M.b0) / M.b1).toFixed(2) + ', back to probability ' + M.p.toFixed(2) + '.');
      }, 500);
    }
    function describe() {
      var c = M.cnt, s = 'Fitted ' + (M.hand ? 'by hand' : 'by maximum likelihood') + ': log-odds = ' + M.b0.toFixed(2) + ' + ' + M.b1.toFixed(2) + ' x, on 60 synthetic cases (' + M.signal + ' signal). AUC ' + M.auc.toFixed(2) + '. At threshold ' + M.t.toFixed(2) + ': TP ' + c.TP + ', FP ' + c.FP + ', TN ' + c.TN + ', FN ' + c.FN + '.';
      if (desc.textContent !== s) desc.textContent = s;
    }

    // ---- frames ---------------------------------------------------------------------------------------
    var dirty = { a: true, b: true, c: true, txt: true, ex: true, focus: true, ctl: true };
    function canAnimate() { return S.alive && S.running && S.visible && !reduced && S.mode && S.mode !== 'margin' && st && st.state !== 'blank' && !D.hidden; }
    function wake() { if (S.looping || !canAnimate()) return; S.looping = true; H.loop.add(tick); }
    function tick(now, dt) {
      if (!canAnimate()) { S.looping = false; return false; }
      S.clock += dt; var T = S.clock;
      if (S.entry) stepEntry(T);
      if (S.demo && (!S.entry || S.entry.done)) stepDemo(T);
      // flights
      var moving = false;
      for (var i = 0; i < N; i++) {
        var u = M.units[i], P = u.path; if (!P) continue; moving = true;
        var f = (T - P.t0) / P.dur; if (f < 0) continue;
        if (f >= 1) { u.pos = P.pts[P.pts.length - 1]; u.path = null; if (!u.arr && P.counts) { u.arr = true; M.arrived[u.cat]++; dirty.txt = true; } }
        else u.pos = along(P.pts, P.L, ease(f) * P.L[P.L.length - 1]);
        u.shown = true;
      }
      if (moving) dirty.b = true;
      if (S.sweep) dirty.c = true;
      if (S.replay && !S.replay.done) stepReplay(T);
      if (L && L.extras && M.S) stepPairs(T);
      S.bead = T; dirty.bead = true;
      if (S.demo && parts && parts.b && parts.b.B.crank) { var cr = parts.b.B.crank; cr.arm.setAttribute('transform', 'rotate(' + r2((T * 0.045) % 360) + ' ' + cr.x + ' ' + cr.y + ')'); }
      render();
      return true;
    }
    function stepDemo(T) {
      function drive(key, lo, hi, per, cur, set, q) {
        var D2 = S[key];
        if (!D2 || T >= D2.t0 + D2.dur) {
          var to = D2 ? (D2.to === hi ? lo : hi) : (cur > (lo + hi) / 2 ? lo : hi);
          D2 = S[key] = { from: cur, to: to, t0: T, dur: Math.max(1500, per * Math.abs(to - cur) / (hi - lo)) };
        }
        set(D2.from + (D2.to - D2.from) * ease(clamp((T - D2.t0) / D2.dur, 0, 1)));
      }
      drive('demoP', 0.08, 0.92, 14000, M.p, function (v) { setP(v, false); });
      drive('demoT', 0.15, 0.85, 16000, M.t, function (v) { setT(v, false); });
    }
    function stepReplay(T) {
      var R = S.replay, k = Math.min(R.it.length - 1, Math.floor((T - R.t0) / 350));
      if (k !== R.k) { R.k = k; var b = R.it[k]; M.b0 = b.b0; M.b1 = Math.max(0.1, b.b1); recompute(false); dirty.a = dirty.c = dirty.ex = true; inputs.b0.value = M.b0.toFixed(2); inputs.b1.value = M.b1.toFixed(2); }
      if (k >= R.it.length - 1) { R.done = true; M.hand = false; dirty.ex = true; }
    }
    function stepPairs(T) {
      var Pp = S.pairs; if (T - S.lastPair < 700) return; S.lastPair = T;
      var y = M.S.d.y, dI = [], nI = [], i; for (i = 0; i < N; i++) (y[i] ? dI : nI).push(i);
      var a = dI[Math.floor(Pp.rng() * dI.length)], b = nI[Math.floor(Pp.rng() * nI.length)];
      Pp.cur = [a, b]; Pp.m++; Pp.k += M.ph[a] > M.ph[b] ? 1 : M.ph[a] === M.ph[b] ? 0.5 : 0; dirty.ex = true;
    }
    // first entry (spec 3.2 to 3.4): units drop one by one, then flow; the ROC is traced by the threshold
    function stepEntry(T) {
      var E = S.entry, e = T - E.t0, G = parts.b.G;
      var order = E.order;
      for (var k = 0; k < order.length; k++) {
        var u = M.units[order[k]], td = E.drop + 25 * k;
        if (!u.shown && e >= td) { u.shown = true; var g = ghostXY(u.i, G); u.pos = [g[0], gateTop(G) - 10]; startPath(u, [u.pos, g], 260, 0, false); u.path.t0 = E.t0 + td; }
      }
      var flowAt = E.drop + 25 * order.length + 300;
      if (!E.flowed && e >= flowAt) {
        E.flowed = true;
        order.forEach(function (i, k) { var u = M.units[i], g = ghostXY(i, G), s = slotXY(G, u.dest.bar, u.dest.j); u.cat = cat(i, M.t);
          startPath(u, G.route(u.dest.bar, g[0], g[1], s[0], s[1]), 520, 12 * k, true); u.path.t0 = E.t0 + flowAt + 12 * k; });
      }
      if (!E.swept && e >= E.sweepAt) { E.swept = true; S.sweep = { t0: E.t0 + E.sweepAt, dur: 1400, back: 600, hatchAt: 1500, aucAt: 1800 }; }
      if (e >= E.beadAt) E.bead = true;
      if (e >= flowAt + 12 * order.length + 600) { E.done = true; S.entry = null; dirty.txt = true; }
      dirty.b = true;
    }
    function beginEntry() {
      var order = []; for (var i = 0; i < N; i++) order.push(i);
      order.sort(function (a, b) { return M.ph[a] - M.ph[b]; });
      M.units.forEach(function (u) { u.shown = false; u.arr = false; u.path = null; u.pos = null; u.cat = cat(u.i, M.t); });
      M.arrived = { TP: 0, FP: 0, TN: 0, FN: 0 };
      S.entry = { t0: S.clock, order: order, drop: 700, sweepAt: 800, beadAt: 1900, flowed: false, swept: false, bead: false, done: false };
      S.sweep = null; S.entered = true; wake();
    }
    function finishEntry() { S.entry = null; S.entered = true; S.sweep = null; snapAll(); }

    // ---- IntersectionObserver: visibility -----------------------------------------------------------
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        S.visible = e.isIntersecting;
        if (S.visible && st && st.state === 'blank' && S.mode && S.mode !== 'margin' && !S.entered) { st.play(); if (st.state === 'drawing') beginEntry(); else finishEntry(); render(true); }
        if (!S.visible && S.entry) { /* the entry waits while unseen */ }
        wake();
      });
    }, { threshold: [0, 0.2] });
    io.observe(host);

    // =====================================================================================================
    // Building (static furniture with the pen, then the dynamic nodes)
    var def = { id: uid, viewBox: function () { return vb; }, build: function (pen, s) { build(pen, s); }, live: function () { render(true); } };
    function T(pen, P, g, x, y, str, size, o) {
      o = o || {}; var fs = Math.max(size, 11 / P.k);
      var a = { x: r2(x), y: r2(y), 'font-size': r2(fs), 'font-style': o.it ? 'italic' : null, 'text-anchor': o.a || 'start', 'dominant-baseline': 'central',
        fill: o.col || (o.ink2 ? C.ink2 : C.ink), 'font-family': "'EB Garamond', Georgia, serif", 'font-variant-numeric': 'lining-nums tabular-nums', transform: o.rot ? 'rotate(' + o.rot + ' ' + r2(x) + ' ' + r2(y) + ')' : null };
      var e = pen && o.t !== false ? pen.add('text', a, g, 'hf', pen.t, 140) : H.el('text', a, g);
      e.__fs = fs; rich(e, str); e.__s = str; return e;
    }
    // subscripts (β₀, β₁) and exponents (^{...}) as their own tspans with lining digits
    function rich(e, str) {
      if (!/[₀₁^]/.test(str)) { e.textContent = str; return; }
      while (e.firstChild) e.removeChild(e.firstChild);
      var fs = e.__fs || 12, re = /([₀₁])|\^\{([^}]*)\}/g, last = 0, off = 0, m;
      function run(txt, o, small) {
        var t = H.el('tspan', { dy: o !== off ? r2(o - off) : null, 'font-size': small ? r2(fs * 0.68) : null }, e); t.textContent = txt; off = o;
        if (small) t.setAttribute('class', 'nb-lg-sub');
      }
      while ((m = re.exec(str))) {
        if (m.index > last) run(str.slice(last, m.index), 0, false);
        if (m[1]) run(m[1] === '₀' ? '0' : '1', 0.22 * fs, true); else run(m[2], -0.4 * fs, true);
        last = re.lastIndex;
      }
      run(last < str.length ? str.slice(last) : '\u200b', 0, false);
    }
    function mkPart(stx, key, spec) {
      var u = U(), tr = 'translate(' + spec.x + ',' + spec.y + ') scale(' + spec.s + ')';
      var P = { key: key, ox: spec.x, oy: spec.y, s: spec.s, k: u * spec.s, spec: spec };
      P.gs = H.el('g', { transform: tr }, stx.layers.silver); P.gi = H.el('g', { transform: tr }, stx.layers.ink);
      P.gt = H.el('g', { transform: tr }, stx.layers.text); P.gd = H.el('g', { transform: tr }, parts.dyn); P.gx = H.el('g', { transform: tr }, parts.dynT); P.gh = H.el('g', { transform: tr }, parts.hit);
      return P;
    }
    function build(pen, stx) {
      var u = U();
      parts = {};
      var defs = H.el('defs', null, stx.svg);
      var sp = 3.4 / u, pat = H.el('pattern', { id: uid + '-h', patternUnits: 'userSpaceOnUse', width: r2(sp * 4) , height: r2(sp), patternTransform: 'rotate(52)' }, defs);
      H.el('path', { d: 'M0,' + r2(sp / 2) + 'H' + r2(sp * 4), stroke: C.ink2, 'stroke-width': sw(0.7, u), 'stroke-opacity': 0.75 }, pat);
      parts.dyn = H.el('g', null, stx.svg); parts.dynT = H.el('g', null, stx.svg); parts.hit = H.el('g', { 'class': 'nb-logit-hit' }, stx.svg);
      parts.focus = H.el('g', { 'pointer-events': 'none' }, stx.svg);
      parts.defs = defs; parts.pat = 'url(#' + uid + '-h)';
      if (L.a) { parts.a = mkPart(stx, 'a', L.a); pen.k = parts.a.k; pen.t = 0; buildA(pen, parts.a); }
      if (L.b) { parts.b = mkPart(stx, 'b', L.b); parts.b.G = GB(L.b.kind); pen.k = parts.b.k; pen.t = 100; buildB(pen, parts.b); }
      if (L.c) { parts.c = mkPart(stx, 'c', L.c); parts.c.G = GC(L.c.kind); pen.k = parts.c.k; pen.t = 200; buildC(pen, parts.c); }
      if (L.slider) { parts.sl = mkPart(stx, 'sl', { x: L.slider.x, y: L.slider.y, s: 1 }); pen.k = parts.sl.k; pen.t = 300; buildSlider(pen, parts.sl); }
      if (L.extras) { parts.x = mkPart(stx, 'x', { x: 0, y: 0, s: 1 }); pen.k = u; pen.t = 600; buildExtras(pen, parts.x); }
      pen.k = u;
      dirty.a = dirty.b = dirty.c = dirty.txt = dirty.ex = dirty.focus = dirty.ctl = true;
    }

    // ---- small drawn controls -----------------------------------------------------------------------
    function crank(pen, P, x, y, word, key) {
      var g = P.gi; pen.into(g);
      pen.ink(H.arcPts(x, y, 6, 0, 360, 12), { w: 'fine', closed: true, g: g });
      var arm = H.el('g', { transform: 'rotate(0 ' + x + ' ' + y + ')' }, P.gd);
      H.el('path', { d: 'M' + x + ',' + y + 'L' + r2(x + 6) + ',' + r2(y - 6), stroke: C.ink, 'stroke-width': sw(1.1, P.k), 'stroke-linecap': 'round' }, arm);
      H.el('path', { d: circD(x + 6, y - 6, 1.9), fill: C.ink }, arm);
      H.el('path', { d: circD(x, y, 1.2), fill: C.ink }, arm);
      var tx = T(pen, P, P.gt, x + 11, y, word, 12.5, { it: true, ink2: true });
      var w = textW(word, tx.__fs) + 22, hh = Math.max(44 / P.k, 16);
      hit(P, [x - 10, y - hh / 2, x - 10 + Math.max(w, 44 / P.k), y + hh / 2], key, 'pointer');
      return { arm: arm, x: x, y: y, tx: tx, box: [x - 9, y - 9, x + 13 + textW(word, tx.__fs), y + 9] };
    }
    function hit(P, box, key, cursor, drag) {
      var r = H.el('rect', { x: r2(box[0]), y: r2(box[1]), width: r2(box[2] - box[0]), height: r2(box[3] - box[1]), fill: 'transparent', 'pointer-events': 'all', 'data-k': key, 'class': drag ? 'nb-logit-drag' : 'nb-logit-btn' }, P.gh);
      if (cursor) r.style.cursor = cursor;
      return r;
    }

    // ---- part a: the logit circuit -----------------------------------------------------------------
    function buildA(pen, P) {
      var A = {}, g = P.gi, X = GA.X, Pp = GA.P, E = GA.E, k = P.k, i;
      P.A = A; pen.into(g);
      pen.step(0, 1800, function () {
        // scales
        pen.rule([78, 14], [78, 140], { g: P.gs }); pen.rule([78, 180], [78, 306], { g: P.gs });
        pen.ink([[78, 14], [78, 140]], { w: 1.1, over: true });
        pen.ink([[72, 14], [84, 14]], { w: 'heavy' }); pen.ink([[72, 140], [84, 140]], { w: 'heavy' });
        [0, 0.25, 0.5, 0.75, 1].forEach(function (v) { if (v > 0 && v < 1) pen.ink([[78, Pp(v)], [82.5, Pp(v)]], { w: 'fine' }); });
        A.pTicks = [0, 0.25, 0.5, 0.75, 1].map(function (v) { return T(pen, P, P.gt, 86, Pp(v), String(v), 11.5, { ink2: true }); });
        pen.ink([[78, 182], [78, 304]], { w: 1.1, over: true });
        pen.ink([[73.5, 187], [78, 179], [82.5, 187]], { w: 'fine', split: false }); pen.ink([[73.5, 299], [78, 307], [82.5, 299]], { w: 'fine', split: false });
        A.eTicks = [-4, -2, 0, 2, 4].map(function (v) { pen.ink([[78, E(v)], [82.5, E(v)]], { w: 'fine' }); return T(pen, P, P.gt, 86, E(v), v < 0 ? MINUS + (-v) : String(v), 11.5, { ink2: true }); });
        A.oTicks = [[1 / 16, '1/16'], [1 / 4, '1/4'], [1, '1'], [4, '4'], [16, '16']].map(function (q) { pen.ink([[73.5, E(Math.log(q[0]))], [78, E(Math.log(q[0]))]], { w: 'fine' }); return T(pen, P, P.gt, 70, E(Math.log(q[0])), q[1], 11.5, { ink2: true, a: 'end' }); });
        A.notes = [T(pen, P, P.gt, 36, 152, 'bounded, 0 to 1', 12, { it: true, ink2: true }),
          T(pen, P, P.gt, 67, 172, 'odds', 12, { it: true, a: 'end' }), T(pen, P, P.gt, 89, 172, 'log-odds', 12, { it: true }), T(pen, P, P.gt, 78, 164, 'ln', 11, { it: true, a: 'middle', col: C.sanguineDeep }),
          T(pen, P, P.gt, 70, 316, 'unbounded', 12, { it: true, ink2: true, a: 'end' })];
        // plots
        pen.rule([96, 14], [290, 14], { g: P.gs }); pen.rule([96, 140], [290, 140], { g: P.gs }); pen.rule([96, 243], [290, 243], { g: P.gs });
        [[96, 14], [290, 14], [96, 140], [290, 140]].forEach(function (q) { pen.line([[q[0], q[1] - 2.5], [q[0], q[1] + 2.5]], 0.8, C.silver, 0.9, 'butt', 'hs', pen.t, 80, P.gs); });
        for (i = -3; i <= 3; i++) { pen.line([[X(i), 306], [X(i), 309.5]], 0.7, C.silver, 0.9, 'butt', 'hs', pen.t, 60, P.gs); T(pen, P, P.gt, X(i), 316, i < 0 ? MINUS + (-i) : String(i), 11.5, { ink2: true, a: 'middle' }); }
        pen.rule([96, 306], [290, 306], { g: P.gs, op: 0.5 });
        T(pen, P, P.gt, 296, 316, 'x', 12.5, { it: true });
        A.title = T(pen, P, P.gt, 0, 5, 'a. the logit', 13, { it: true, ink2: true });
        A.sig = T(pen, P, P.gt, 284, 121, 'σ(η) = 1 / (1 + e^{−η})', 12.5, { it: true, a: 'end' });
        pen.ink([[69.5, 172], [86, 172]], { w: 'fine' }); pen.ink([[83, 169.6], [86.2, 172], [83, 174.4]], { w: 'fine', split: false });
        A.pred = T(pen, P, P.gx, 0, 0, 'β₀ + β₁x', 12.5, { it: true, a: 'end' });
        // fitted line and curve (dynamic: they follow the coefficients)
        A.clip = uid + '-ca';
        var cp = H.el('clipPath', { id: A.clip }, parts.defs); H.el('rect', { x: 96, y: 178, width: 194, height: 130 }, cp);
        A.line = pen.add('path', { d: 'M0,0', fill: 'none', stroke: C.ink, 'stroke-width': sw(1.4, k), 'stroke-linecap': 'round', 'clip-path': 'url(#' + A.clip + ')', transform: tr(P) }, parts.dyn, 'hs', pen.t, 260); pen.t += 260;
        A.curve = pen.add('path', { d: 'M0,0', fill: 'none', stroke: C.ink, 'stroke-width': sw(1.4, k), 'stroke-linecap': 'round', transform: tr(P) }, parts.dyn, 'hs', pen.t, 380); pen.t += 380;
        // the rug: defaults hang from p = 1, non-defaults stand on p = 0
        var d = M.S.d, rd = '', rn = '';
        for (i = 0; i < N; i++) { var xx = r2(X(d.x[i])); if (d.y[i]) rd += 'M' + xx + ',14V19'; else rn += 'M' + xx + ',140V135'; }
        pen.add('path', { d: rd, stroke: C.ink, 'stroke-width': sw(0.9, k), fill: 'none' }, g, 'hf', pen.t, 200);
        pen.add('path', { d: rn, stroke: C.ink, 'stroke-width': sw(0.9, k), fill: 'none' }, g, 'hf', pen.t + 100, 200); pen.t += 300;
        // the circuit threads, in order 1 to 5
        A.legs = []; for (i = 0; i < 5; i++) { A.legs.push(pen.add('path', { d: 'M0,0', fill: 'none', stroke: C.sanguine, 'stroke-width': sw(0.8, k), 'stroke-linecap': 'round' }, P.gd, 'hs', pen.t, 120)); pen.t += 120; }
        A.arrows = pen.add('path', { d: '', fill: 'none', stroke: C.sanguine, 'stroke-width': sw(0.8, k) }, P.gd, 'hf', pen.t, 100);
        A.legLab = [T(pen, P, P.gx, 0, 0, 'p / (1 ' + MINUS + ' p)', 12.5, { it: true, col: C.sanguineDeep }), null, null, null, T(pen, P, P.gx, 0, 0, 'σ', 12.5, { it: true, col: C.sanguineDeep })];
        A.numCol = [C.ink, C.ink, C.sanguineDeep, C.ink, C.ink];
        A.num = [0, 1, 2, 3, 4].map(function (j) { return T(pen, P, P.gx, 0, 0, '', 13, { it: j === 2, col: A.numCol[j] }); });
      });
      // the index (starting probability pointer) and the bead
      A.ptr = H.el('path', { d: 'M78,0L69,-4.6L69,4.6Z', fill: C.sanguine }, P.gd);
      A.bead = H.el('circle', { r: 3.2, fill: C.sanguine, cx: -99, cy: -99 }, P.gd);
      A.ptrHit = hit(P, [40, -22 / k, 96, 22 / k], 'p', 'ns-resize', true);
      if (L.extras) { // P1 handles on the line: intercept at x = 0, slope at x = 1.5
        A.h0 = H.el('circle', { r: 4.6, fill: C.paper, stroke: C.sanguine, 'stroke-width': sw(1.4, k) }, P.gd);
        A.h1 = H.el('circle', { r: 4.6, fill: C.paper, stroke: C.sanguine, 'stroke-width': sw(1.4, k) }, P.gd);
        A.h0Hit = H.el('circle', { r: r2(22 / k), fill: 'transparent', 'pointer-events': 'all', 'data-k': 'b0', 'class': 'nb-logit-drag' }, P.gh);
        A.h1Hit = H.el('circle', { r: r2(22 / k), fill: 'transparent', 'pointer-events': 'all', 'data-k': 'b1', 'class': 'nb-logit-drag' }, P.gh);
        A.h0Hit.style.cursor = A.h1Hit.style.cursor = 'ns-resize';
        T(pen, P, P.gt, 102, 210, 'drag the rings to set β₀, β₁', 11, { it: true, ink2: true });
      }
    }
    function tr(P) { return 'translate(' + P.ox + ',' + P.oy + ') scale(' + P.s + ')'; }

    // ---- part b: the threshold sorter -----------------------------------------------------------------
    function buildB(pen, P) {
      var G = P.G, B = {}, g = P.gi, k = P.k, mini = P.spec.mini, i;
      P.B = B; pen.into(g);
      pen.step(100, 700, function () {
        pen.rule([G.a0 - 6, G.ay], [G.a1 + 6, G.ay], { g: P.gs });
        pen.ink([[G.a0, G.ay], [G.a1, G.ay]], { w: 1.1, over: true });
        [0, 0.25, 0.5, 0.75, 1].forEach(function (v) { var x = G.a0 + v * (G.a1 - G.a0); pen.ink([[x, G.ay], [x, G.ay + 4]], { w: 'fine' }); if (!mini) T(pen, P, P.gt, x, G.ay + 11, String(v), 11.5, { ink2: true, a: 'middle' }); });
        if (mini) return;
        T(pen, P, P.gt, (G.a0 + G.a1) / 2, G.axLab, 'predicted probability of default', 12.5, { it: true, a: 'middle' });
        G.rails.forEach(function (r) { pen.add('path', { d: polyD(r), fill: 'none', stroke: C.silver, 'stroke-width': sw(0.6, k), 'stroke-opacity': 0.8 }, P.gs, 'hs', pen.t, 300); });
        // the bars: bases, the count scale, the names under them
        G.bx.forEach(function (x) { pen.ink([[x - 3.5 * G.bp, G.base], [x + 3.5 * G.bp, G.base]], { w: 1.1 }); });
        pen.rule([G.scaleX, G.base], [G.scaleX, G.base - 10 * G.bp], { g: P.gs, flush: true });
        [0, 20, 40, 60].forEach(function (c) { var y = G.base - c / 6 * G.bp; pen.line([[G.scaleX, y], [G.scaleX + 4, y]], 0.7, C.silver, 0.9, 'butt', 'hs', pen.t, 60, P.gs); T(pen, P, P.gt, G.scaleX - 3, y, String(c), 11, { ink2: true, a: 'end' }); });
        var by = G.base + 11;
        T(pen, P, P.gt, G.bx[0], by, 'non-default', 12, { a: 'middle' }); T(pen, P, P.gt, G.bx[1], by, 'default', 12, { a: 'middle' });
        if (G.kind === 'wide') T(pen, P, P.gt, G.scaleX + 6, by, 'predicted', 12, { it: true, ink2: true, a: 'end' });
        else T(pen, P, P.gt, (G.bx[0] + G.bx[1]) / 2, by + 13, 'predicted', 12, { it: true, ink2: true, a: 'middle' });
        T(pen, P, P.gt, G.title[0], G.title[1], 'b. the threshold', 13, { it: true, ink2: true });
        // the key, lettered once
        var ky = G.key[1], kx = G.key[0], kr = G.r, k2 = G.oneKey ? [kx - 108, ky, kx - 46, ky] : [kx, ky, kx, ky + 15];
        pen.add('circle', { cx: k2[0] + kr, cy: k2[1], r: kr, fill: C.ink }, g, 'hf', pen.t, 140); T(pen, P, P.gt, k2[0] + 2 * kr + 5, k2[1], 'defaulted', 12);
        pen.add('circle', { cx: k2[2] + kr, cy: k2[3], r: kr - 0.5 / k, fill: 'none', stroke: C.ink, 'stroke-width': sw(1, k) }, g, 'hf', pen.t, 140); T(pen, P, P.gt, k2[2] + 2 * kr + 5, k2[3], 'did not', 12);
        B.txt = [T(pen, P, P.gt, G.a0, G.txt[0], '', 13), T(pen, P, P.gt, G.a0, G.txt[1], '', 13), T(pen, P, P.gt, G.a0, G.txt[2], '60 synthetic cases', 12, { ink2: true })];
        B.seg = ['TN', 'FN', 'TP', 'FP'].map(function (c) { return T(pen, P, P.gt, 0, 0, '', 12, { col: c[0] === 'F' ? C.sanguineDeep : C.ink }); });
        B.tot = [T(pen, P, P.gt, G.bx[0], 0, '', 15, { a: 'middle' }), T(pen, P, P.gt, G.bx[1], 0, '', 15, { a: 'middle' })];
      });
      // ghosts, units, the gate
      B.gg = H.el('g', null, P.gd); B.ug = H.el('g', null, P.gd);
      B.ghost = []; B.unit = [];
      for (i = 0; i < N; i++) { var dft = M.S.d.y[i]; B.ghost.push(H.el('circle', dft ? { r: G.r, fill: C.silver, 'fill-opacity': 0.55, cx: -99, cy: -99 } : { r: G.r - 0.4 / k, fill: 'none', stroke: C.silver, 'stroke-width': sw(0.8, k), cx: -99, cy: -99 }, B.gg)); B.unit.push(H.el('circle', { r: G.r, cx: -99, cy: -99 }, B.ug)); }
      B.blade = H.el('path', { d: '', stroke: C.ink, 'stroke-width': sw(1.3, k), fill: 'none' }, P.gd);
      B.knob = H.el('circle', { r: 5, fill: C.paper, stroke: C.sanguine, 'stroke-width': sw(1.6, k) }, P.gd);
      B.knobDot = H.el('circle', { r: 1.6, fill: C.sanguine }, P.gd);
      B.tnum = T(pen, P, P.gx, 0, 0, '', mini ? 13 : 14, { a: 'start', t: false });
      B.hit = hit(P, [0, G.top - 22 / k, 44 / k, G.ay + 4], 't', 'ew-resize', true);
      if (!mini) B.crank = crank(pen, P, G.crank[0], G.crank[1], 'demonstrate', 'demo');
    }

    // ---- part c: the ROC curve ------------------------------------------------------------------------
    function buildC(pen, P) {
      var G = P.G, Cc = {}, g = P.gi, k = P.k, x0 = G.x0, y0 = G.y0, S2 = G.S, mini = G.mini;
      P.Cc = Cc; pen.into(g);
      pen.step(200, 500, function () {
        pen.rule([x0, y0 + S2], [x0 + S2, y0 + S2], { g: P.gs }); pen.rule([x0, y0 + S2], [x0, y0], { g: P.gs });
        pen.ink([[x0, y0 + S2], [x0 + S2, y0 + S2]], { w: 1, over: true }); pen.ink([[x0, y0 + S2], [x0, y0]], { w: 1, over: true });
        pen.add('path', { d: polyD([[x0 + S2, y0 + S2], [x0 + S2, y0], [x0, y0]]), fill: 'none', stroke: C.silver, 'stroke-width': sw(0.5, k), 'stroke-opacity': 0.6 }, P.gs, 'hs', pen.t, 200);
        pen.add('path', { d: 'M' + x0 + ',' + (y0 + S2) + 'L' + (x0 + S2) + ',' + y0, stroke: C.silver, 'stroke-width': sw(0.8, k), 'stroke-dasharray': r2(3 / k) + ' ' + r2(3 / k), fill: 'none' }, P.gs, 'hf', pen.t, 200);
        if (mini) return;
        Cc.ticks = [];
        [0, 0.5, 1].forEach(function (v) {
          pen.ink([[x0 + v * S2, y0 + S2], [x0 + v * S2, y0 + S2 + 4]], { w: 'fine' }); pen.ink([[x0, y0 + S2 - v * S2], [x0 - 4, y0 + S2 - v * S2]], { w: 'fine' });
          Cc.ticks.push(T(pen, P, P.gt, x0 + v * S2, y0 + S2 + 11, String(v), 11.5, { ink2: true, a: 'middle' }));
          Cc.ticks.push(T(pen, P, P.gt, x0 - 6, y0 + S2 - v * S2, String(v), 11.5, { ink2: true, a: 'end' }));
        });
        T(pen, P, P.gt, x0 + S2 / 2, y0 + S2 + 25, 'false positive rate', 12, { it: true, a: 'middle' });
        T(pen, P, P.gt, x0 - 37, y0 + S2 / 2, 'true positive rate', 12, { it: true, a: 'middle', rot: -90 });
        var cxy = [x0 + 0.86 * S2, y0 + S2 - 0.78 * S2];
        pen.add('rect', { x: r2(cxy[0] - 18), y: r2(cxy[1] - 6), width: 36, height: 12, fill: C.paper, 'fill-opacity': 0.92, transform: 'rotate(-45 ' + r2(cxy[0]) + ' ' + r2(cxy[1]) + ')' }, P.gt, 'hf', pen.t, 140);
        T(pen, P, P.gt, cxy[0], cxy[1], 'chance', 11.5, { it: true, ink2: true, a: 'middle', rot: -45 });
        T(pen, P, P.gt, G.title[0], G.title[1], 'c. the ROC curve', 13, { it: true, ink2: true });
        // the key
        var ky = G.key, kx = x0 - 8;
        pen.add('circle', { cx: kx + 4, cy: ky, r: 4, fill: C.sanguine }, g, 'hf', pen.t, 140); T(pen, P, P.gt, kx + 13, ky, 'one threshold', 12.5);
        pen.line([[kx - 1, ky + 16], [kx + 9, ky + 16]], 1.5, C.ink, 0.9, 'round', 'hs', pen.t, 80, g); T(pen, P, P.gt, kx + 13, ky + 16, 'every threshold', 12.5);
        pen.add('rect', { x: kx, y: ky + 26, width: 8, height: 8, fill: parts.pat, stroke: C.ink2, 'stroke-width': sw(0.5, k) }, g, 'hf', pen.t, 140);
        T(pen, P, P.gt, kx + 13, ky + 31, 'AUC: the whole curve,', 12.5); T(pen, P, P.gt, kx + 13, ky + 46, 'it does not move with t', 12.5);
      });
      Cc.area = H.el('path', { d: '', fill: parts.pat, stroke: 'none', opacity: 0 }, P.gd);
      Cc.curve = H.el('path', { d: '', fill: 'none', stroke: C.ink, 'stroke-width': sw(1.5, k), 'stroke-linejoin': 'miter' }, P.gd);
      Cc.drop = H.el('path', { d: '', fill: 'none', stroke: C.sanguine, 'stroke-width': sw(0.7, k), 'stroke-opacity': 0.85 }, P.gd);
      Cc.dot = H.el('circle', { r: mini ? 3.2 : 4.5, fill: C.sanguine, cx: -99, cy: -99 }, P.gd);
      Cc.patch = H.el('rect', { fill: C.paper, opacity: 0 }, P.gx);
      Cc.auc = T(pen, P, P.gx, 0, 0, '', mini ? 12 : 17, { a: 'middle', t: false });
      if (!mini) {
        Cc.fl = T(pen, P, P.gx, 0, 0, '', 11.5, { a: 'middle', col: C.sanguineDeep, t: false });
        Cc.tl = T(pen, P, P.gx, 0, 0, '', 11.5, { a: 'end', col: C.sanguineDeep, t: false });
        Cc.ttP = H.el('rect', { fill: C.paper, 'fill-opacity': 0.92 }, P.gx); Cc.tt = T(pen, P, P.gx, 0, 0, '', 12, { a: 'end', col: C.sanguineDeep, t: false });
        Cc.crank = crank(pen, P, G.crank[0], G.crank[1], 'sweep', 'sweep');
      } else {
        Cc.mt = T(pen, P, P.gx, S2 + 12, 16, '', 12, { t: false }); Cc.mt2 = T(pen, P, P.gx, S2 + 12, 32, '', 12, { t: false }); Cc.mt3 = T(pen, P, P.gx, S2 + 12, 48, '', 12, { t: false });
      }
    }
    function buildSlider(pen, P) { // pocket: the gate repeated as a slider directly above part c
      var Sl = {}; P.Sl = Sl; pen.into(P.gi);
      pen.rule([30, 22], [350, 22], { g: P.gs }); pen.ink([[30, 22], [350, 22]], { w: 1, over: true });
      [0, 0.5, 1].forEach(function (v) { pen.ink([[30 + 320 * v, 22], [30 + 320 * v, 26]], { w: 'fine' }); T(pen, P, P.gt, 30 + 320 * v, 33, String(v), 11.5, { ink2: true, a: 'middle' }); });
      T(pen, P, P.gt, 30, 6, 'the threshold t, again', 12, { it: true, ink2: true });
      Sl.knob = H.el('circle', { r: 5.5, fill: C.paper, stroke: C.sanguine, 'stroke-width': sw(1.6, P.k) }, P.gd);
      Sl.hit = hit(P, [0, 0, 44 / P.k, 44 / P.k], 't2', 'ew-resize', true);
    }

    // ---- plate extras: P1 likelihood and Newton replay, the signal lever; P2 pairs ---------------
    function buildExtras(pen, P) {
      var X = {}; P.X = X; pen.into(P.gi); var k = P.k;
      // under part a: the likelihood, the gauge and the iterates
      T(pen, P, P.gt, 16, 430, 'fitted by maximising the Bernoulli likelihood,', 13, { it: true, ink2: true });
      T(pen, P, P.gt, 16, 447, 'Σ [y ln p + (1 ' + MINUS + ' y) ln(1 ' + MINUS + ' p)]', 13.5, { it: true });
      X.coef = T(pen, P, P.gt, 16, 472, '', 14); X.how = T(pen, P, P.gt, 16, 490, '', 12.5, { it: true, ink2: true });
      var gx = 40, g0 = 530, g1 = 608; X.g = [gx, g0, g1];
      T(pen, P, P.gt, 16, 514, 'log-likelihood', 12, { it: true });
      pen.rule([gx, g0], [gx, g1], { g: P.gs }); pen.ink([[gx, g0], [gx, g1]], { w: 1, over: true });
      X.gTicks = H.el('path', { d: '', stroke: C.ink, 'stroke-width': sw(0.8, k), fill: 'none' }, P.gd);
      X.gNums = [0, 1, 2, 3].map(function () { return T(pen, P, P.gx, 0, 0, '', 11, { ink2: true, a: 'end', t: false }); });
      X.gMax = H.el('path', { d: '', stroke: C.sanguine, 'stroke-width': sw(1.6, k), fill: 'none' }, P.gd);
      X.gMaxT = T(pen, P, P.gx, gx + 12, 0, 'maximum', 11.5, { it: true, col: C.sanguineDeep, t: false });
      X.gPtr = H.el('path', { d: '', fill: C.ink }, P.gd); X.gVal = T(pen, P, P.gx, gx + 12, 0, '', 12.5, { t: false });
      T(pen, P, P.gt, 120, 514, 'Newton-Raphson, from the values above', 12.5, { it: true });
      var cols = [[150, 'end', 'k'], [204, 'end', 'β₀'], [256, 'end', 'β₁'], [318, 'end', 'l(β)']];
      cols.forEach(function (c) { T(pen, P, P.gt, c[0], 531, c[2], 12, { it: true, ink2: true, a: c[1] }); });
      X.rows = []; for (var i = 0; i < 6; i++) X.rows.push(cols.map(function (c) { return T(pen, P, P.gt, c[0], 545 + 13 * i, '', 12, { t: false, a: c[1] }); }));
      var fc = crank(pen, P, 262, 472, 'fit by maximum likelihood', 'fit'); X.fit = fc;
      // under part b: the signal lever and demonstrate
      var lx = 470, ly = 584; X.lev = [lx, ly];
      T(pen, P, P.gt, 430, 488, 'signal in the data', 13, { it: true });
      T(pen, P, P.gt, 430, 505, 'a different data set changes the AUC; the threshold never does', 11.5, { it: true, ink2: true });
      pen.arc(lx, ly, 44, -140, -40, { g: P.gs });
      X.levNames = SIGNALS.map(function (sg, j) {
        var a = (-130 + 40 * j) / R2D, px = lx + 44 * Math.cos(a), py = ly + 44 * Math.sin(a);
        pen.ink([[lx + 40 * Math.cos(a), ly + 40 * Math.sin(a)], [lx + 48 * Math.cos(a), ly + 48 * Math.sin(a)]], { w: 'fine' });
        var tx = T(pen, P, P.gt, lx + 58 * Math.cos(a), ly + 56 * Math.sin(a), sg, 13, { a: 'middle', it: true });
        var hb = 22 / k; hit(P, [lx + 58 * Math.cos(a) - hb, ly + 56 * Math.sin(a) - hb, lx + 58 * Math.cos(a) + hb, ly + 56 * Math.sin(a) + hb], 'sig-' + sg, 'pointer');
        return tx;
      });
      pen.ink(H.arcPts(lx, ly, 5, 0, 360, 15), { w: 'fine', closed: true });
      X.levArm = H.el('path', { d: 'M0,0L0,-40', stroke: C.ink, 'stroke-width': sw(1.8, k), 'stroke-linecap': 'round', transform: 'translate(' + lx + ',' + ly + ') rotate(0)' }, P.gd);
      X.levKnob = H.el('circle', { r: 3, fill: C.sanguine }, P.gd);
      X.aucs = T(pen, P, P.gt, 560, 540, '', 12, { ink2: true }); X.aucs2 = T(pen, P, P.gt, 560, 556, '', 12, { ink2: true }); X.aucs3 = T(pen, P, P.gt, 560, 572, '', 12, { ink2: true });
      // under part c: P2 pairs
      var bx = 824 + 128, byy = 496; X.beam = [bx, byy];
      T(pen, P, P.gt, 834, 420, 'pairs: one default, one non-default', 13, { it: true });
      pen.ink([[bx - 8, byy + 14], [bx, byy], [bx + 8, byy + 14], [bx - 8, byy + 14]], { w: 'fine', split: false });
      X.bg = H.el('g', { transform: 'translate(' + bx + ',' + byy + ')' }, P.gd);
      H.el('path', { d: 'M-70,0H70', stroke: C.ink, 'stroke-width': sw(1.6, k) }, X.bg);
      X.pd = H.el('circle', { cx: -62, cy: -5, r: 4.5, fill: C.ink }, X.bg); X.pn = H.el('circle', { cx: 62, cy: -5, r: 4.5 - 0.5 / k, fill: C.paper, stroke: C.ink, 'stroke-width': sw(1, k) }, X.bg);
      X.sd = T(pen, P, P.gx, bx - 62, byy - 22, '', 12, { a: 'middle', t: false }); X.sn = T(pen, P, P.gx, bx + 62, byy - 22, '', 12, { a: 'middle', t: false });
      T(pen, P, P.gt, bx - 62, byy + 26, 'defaulted', 11.5, { a: 'middle', ink2: true }); T(pen, P, P.gt, bx + 62, byy + 26, 'did not', 11.5, { a: 'middle', ink2: true });
      X.tally = T(pen, P, P.gt, 834, 560, '', 12.5, { t: false }); X.all = T(pen, P, P.gt, 834, 577, '', 12.5, { t: false });
      T(pen, P, P.gt, 834, 598, 'AUC is the chance that a default', 11.5, { it: true, ink2: true }); T(pen, P, P.gt, 834, 612, 'is scored above a non-default', 11.5, { it: true, ink2: true });
    }

    // =====================================================================================================
    // Rendering (attributes only; text only when it changes)
    function setT2(e, s) { if (e && e.__s !== s) { e.__s = s; rich(e, s); } }
    function at(e, x, y) { if (!e) return; var xs = r2(x), ys = r2(y); if (e.__x !== xs) { e.__x = xs; e.setAttribute('x', xs); } if (e.__y !== ys) { e.__y = ys; e.setAttribute('y', ys); } }
    function op(e, v) { if (e && e.__o !== v) { e.__o = v; e.style.opacity = v; } }
    function cxy(e, x, y) { var xs = r2(x), ys = r2(y); if (e.__x !== xs) { e.__x = xs; e.setAttribute('cx', xs); } if (e.__y !== ys) { e.__y = ys; e.setAttribute('cy', ys); } }
    function dset(e, d) { if (e.__d !== d) { e.__d = d; e.setAttribute('d', d); } }
    function render(all) {
      if (!st || !parts) return;
      if (all) dirty.a = dirty.b = dirty.c = dirty.txt = dirty.ex = dirty.focus = dirty.ctl = true;
      if (parts.a && (dirty.a || dirty.bead)) renderA();
      if (parts.b && (dirty.b || dirty.txt)) renderB();
      if (parts.c && dirty.c) renderC();
      if (parts.sl && dirty.b) renderSlider();
      if (parts.x && (dirty.ex || dirty.a || dirty.c)) renderX();
      if (dirty.focus || dirty.ctl) renderFocus();
      if (dirty.txt || dirty.c) describe();
      dirty.a = dirty.b = dirty.c = dirty.txt = dirty.ex = dirty.focus = dirty.ctl = dirty.bead = false;
    }

    function renderA() {
      var P = parts.a, A = P.A, X = GA.X, Pp = GA.P, E = GA.E, p = M.p, b0 = M.b0, b1 = M.b1;
      if (dirty.a) {
        // the fitted line and curve
        dset(A.line, 'M' + r2(X(-3)) + ',' + r2(E(b0 - 3 * b1)) + 'L' + r2(X(3)) + ',' + r2(E(b0 + 3 * b1)));
        var cp = []; for (var i = 0; i <= 60; i++) { var xx = -3 + i / 10; cp.push([X(xx), Pp(sigma(b0 + b1 * xx))]); }
        dset(A.curve, polyD(cp));
        var eta = logit(p), xs = (eta - b0) / b1, xc = clamp(xs, -3, 3), clipped = xs < -3 || xs > 3;
        var yp = Pp(p), ye = E(eta), px = X(xc), ypC = clipped ? Pp(sigma(b0 + b1 * xc)) : yp;
        var l1 = bezPts([69, yp], [8, yp], [8, ye], [74, ye], 22);
        var legs = [l1, [[74, ye], [82, ye]], [[82, ye], [px, ye]], [[px, ye], [px, ypC]], [[px, ypC], [78, ypC === yp ? yp : ypC]]];
        if (clipped) legs[4] = [[px, yp], [78, yp]];
        A.legPts = legs;
        for (i = 0; i < 5; i++) dset(A.legs[i], polyD(legs[i]));
        dset(A.arrows, clipped ? (xs > 3 ? 'M' + r2(px - 5) + ',' + r2(ye - 3) + 'L' + r2(px) + ',' + r2(ye) + 'L' + r2(px - 5) + ',' + r2(ye + 3) : 'M' + r2(px + 5) + ',' + r2(ye - 3) + 'L' + r2(px) + ',' + r2(ye) + 'L' + r2(px + 5) + ',' + r2(ye + 3)) : '');
        A.ptr.setAttribute('transform', 'translate(0,' + r2(yp) + ')');
        A.ptrHit.setAttribute('y', r2(yp - 22 / P.k));
        // numerals, placed without collisions
        var o = odds(p);
        setT2(A.num[0], 'p = ' + p.toFixed(2)); setT2(A.num[1], 'odds = ' + (o < 10 ? o.toFixed(2) : o.toFixed(1)));
        setT2(A.num[2], 'β₀ + β₁x = ' + f2(eta)); setT2(A.num[3], 'x = ' + f2(xs)); setT2(A.num[4], 'p = ' + sigma(b0 + b1 * xs).toFixed(2));
        placeA(P, legs, cp, yp, ye, px, ypC);
        // P1 handles
        if (A.h0) { cxy(A.h0, X(0), E(b0)); cxy(A.h1, X(1.5), E(b0 + 1.5 * b1)); cxy(A.h0Hit, X(0), E(b0)); cxy(A.h1Hit, X(1.5), E(b0 + 1.5 * b1)); }
        // the bead's path: the five legs end to end
        var path = [], stops = [0];
        legs.forEach(function (lg, j) { for (var q = j ? 1 : 0; q < lg.length; q++) path.push(lg[q]); stops.push(path.length - 1); });
        A.path = path; A.pathL = plen(path); A.stops = stops.map(function (q) { return A.pathL[q]; });
      }
      // the bead: one lap 6 s, constant speed on the legs, 100 ms at each of the five stations
      var on = !reduced && S.entered && !(S.entry && !S.entry.bead) && S.mode !== 'margin';
      if (!on) { cxy(A.bead, -99, -99); A.num.forEach(function (e, j) { if (e.__f !== A.numCol[j]) { e.__f = A.numCol[j]; e.setAttribute('fill', A.numCol[j]); } }); return; }
      var Ltot = A.pathL[A.pathL.length - 1], lap = 6000, move = lap - 500, tt = S.bead % lap, s = 0, st5 = A.stops, j;
      var seg = 0, acc = 0;
      for (j = 0; j < 5; j++) {
        var mv = move * (st5[j + 1] - st5[j]) / (Ltot || 1);
        if (tt < acc + 100) { s = st5[j]; seg = j; if (S.lastSt !== j) { S.lastSt = j; S.pulse[j] = S.bead; } break; }
        acc += 100;
        if (tt < acc + mv) { s = st5[j] + (st5[j + 1] - st5[j]) * (tt - acc) / mv; seg = -1; break; }
        acc += mv; s = st5[j + 1];
      }
      var q2 = along(A.path, A.pathL, s); cxy(A.bead, q2[0], q2[1]);
      for (j = 0; j < 5; j++) { var hot = S.bead - S.pulse[j] < 380, f = hot ? (j === 2 ? C.sanguine : C.sanguineDeep) : A.numCol[j]; if (A.num[j].__f !== f) { A.num[j].__f = f; A.num[j].setAttribute('fill', f); } }
    }
    function placeA(P, legs, cp, yp, ye, px, ypC) {
      var A = P.A, k = P.k, obst = [], placed = [];
      function box(x, y, str, size, anchor) { var w = textW(str, size), x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x; return [x0, y - size * 0.38, x0 + w, y + size * 0.38]; }
      function ptsObst(pts) { pts.forEach(function (q) { obst.push([q[0] - 1.5, q[1] - 1.5, q[0] + 1.5, q[1] + 1.5]); }); }
      function dense(pts, step) { var out = []; for (var i = 1; i < pts.length; i++) { var a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (var j = 0; j <= n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); } return out; }
      ptsObst(dense(cp, 4)); legs.forEach(function (lg) { ptsObst(dense(lg, 4)); });
      var ln = [[GA.X(-3), GA.E(M.b0 - 3 * M.b1)], [GA.X(3), GA.E(M.b0 + 3 * M.b1)]]; ptsObst(dense(ln, 4).filter(function (q) { return q[1] > 178 && q[1] < 308; }));
      A.notes.forEach(function (n) { if (n.__fs) obst.push(box(+n.getAttribute('x'), +n.getAttribute('y'), n.textContent, n.__fs, n.getAttribute('text-anchor'))); });
      var xr = 282, yr = GA.E(M.b0 + M.b1 * GA.iX(xr)) - 9, wP = textW('β₀ + β₁x', A.pred.__fs);
      if (yr < 186) { xr = Math.min(282, GA.X((GA.iE(184) - M.b0) / M.b1) - 6); yr = 186; }
      if (yr > 300) yr = 300;
      at(A.pred, xr, yr); A.predXY = [xr - wP, yr]; obst.push(box(xr, yr, 'β₀ + β₁x', A.pred.__fs, 'end')); obst.push([186, 113, 290, 129]); obst.push([96, 11, 290, 21]); obst.push([96, 133, 290, 141]);
      function put(e, cands) {
        var fs = e.__fs, str = e.textContent, best = null;
        for (var c = 0; c < cands.length; c++) {
          var cd = cands[c], b = box(cd[0], cd[1], str, fs, cd[2]); if (b[0] < -4 || b[2] > 304 || b[1] < -2 || b[3] > 322) continue;
          var bad = obst.some(function (o) { return overlap(b, o); }) || placed.some(function (o) { return overlap(b, o); });
          if (!bad) { best = cd; break; }
        }
        if (!best) { var sc = 1e9; cands.forEach(function (cd) { var b = box(cd[0], cd[1], str, fs, cd[2]); var v = (b[0] < -4 || b[2] > 304 ? 50 : 0) + obst.filter(function (o) { return overlap(b, o); }).length + 20 * placed.filter(function (o) { return overlap(b, o); }).length; if (v < sc) { sc = v; best = cd; } }); }
        at(e, best[0], best[1]); if (e.getAttribute('text-anchor') !== best[2]) e.setAttribute('text-anchor', best[2]);
        var bb = box(best[0], best[1], str, fs, best[2]); placed.push(bb); return bb;
      }
      var mid = (yp + ye) / 2;
      // leg 1 label rides the leader's bulge, on its left, turned along it
      at(A.legLab[0], 13, mid); A.legLab[0].setAttribute('transform', 'rotate(-90 13 ' + r2(mid) + ')'); A.legLab[0].setAttribute('text-anchor', 'middle');
      var s1 = put(A.num[0], [[66, Math.max(20, yp - 8), 'end'], [66, yp + 9, 'end']]);
      put(A.num[1], [[70, Math.min(304, ye + 10), 'end'], [70, ye - 9, 'end']]);
      put(A.num[2], [[87, ye - 8, 'start'], [87, ye - 20, 'start'], [87, ye + 10, 'start'], [87, ye + 22, 'start']]);
      put(A.num[3], [[px + 6, ye + 10, 'start'], [px - 6, ye + 10, 'end'], [px + 6, ye - 9, 'start'], [px - 6, ye - 9, 'end'], [px, ye + 20, 'middle']]);
      put(A.num[4], [[px - 6, ypC - 9, 'end'], [px + 6, ypC + 10, 'start'], [px + 6, ypC - 9, 'start'], [px - 14, ypC + 10, 'end'], [px - 24, ypC + 10, 'end'], [px, 4, 'middle'], [px - 6, ypC + 10, 'end']]);
      var mx = (px + 80) / 2;
      put(A.legLab[4], [[mx, ypC - 8, 'middle'], [mx, ypC + 9, 'middle'], [(px + 78) / 2 - 20, ypC - 8, 'middle'], [(px + 78) / 2 + 20, ypC - 8, 'middle']]);
      // graduations under a numeral give way to it (the index covers the scale)
      [A.pTicks, A.eTicks, A.oTicks].forEach(function (arr) { arr.forEach(function (t) { var b = box(+t.getAttribute('x'), +t.getAttribute('y'), t.textContent, t.__fs, t.getAttribute('text-anchor')); op(t, placed.some(function (o) { return overlap(b, o); }) ? 0.12 : 1); }); });
      A.notes.forEach(function (n) { var b = box(+n.getAttribute('x'), +n.getAttribute('y'), n.textContent, n.__fs, n.getAttribute('text-anchor')); op(n, placed.some(function (o) { return overlap(b, o); }) ? 0.15 : 1); });
    }

    function unitStyle(u) {
      var k = parts.b.k, inBar = !!u.dest && (u.arr || u.path && u.path.counts), c = u.cat, y = M.S.d.y[u.i];
      if (!inBar || !c) return y ? 'si' : 'oi';
      return c === 'TP' ? 'si' : c === 'TN' ? 'oi' : c === 'FP' ? 'os' : 'ss';
    }
    function renderB() {
      var P = parts.b, B = P.B, G = P.G, k = P.k, mini = P.spec.mini, i, entryOn = S.entry && !S.entry.done;
      // ghosts and units
      for (i = 0; i < N; i++) {
        var u = M.units[i], gq = ghostXY(i, G), ge = B.ghost[i];
        var showG = !entryOn || u.shown && !(u.path && !u.path.counts && u.path.t0 + u.path.dur > S.clock);
        cxy(ge, showG ? gq[0] : -99, showG ? gq[1] : -99);
        var ue = B.unit[i], pos = mini ? gq : u.pos;
        if (!pos || (!u.shown && !mini)) { cxy(ue, -99, -99); continue; }
        cxy(ue, pos[0], pos[1]);
        var sty = mini ? (M.S.d.y[i] ? (M.ph[i] >= M.t ? 'si' : 'ss') : (M.ph[i] >= M.t ? 'os' : 'oi')) : unitStyle(u);
        if (ue.__s !== sty) {
          ue.__s = sty; var solid = sty[0] === 's', col = sty[1] === 's' ? C.sanguine : C.ink;
          ue.setAttribute('fill', solid ? col : C.paper); ue.setAttribute('stroke', solid ? 'none' : col);
          ue.setAttribute('stroke-width', solid ? 0 : sw(1.05, k)); ue.setAttribute('r', solid ? G.r : r2(G.r - 0.53 / k));
        }
      }
      // the gate
      var gx = G.a0 + M.t * (G.a1 - G.a0), top = gateTop(G);
      dset(B.blade, 'M' + r2(gx) + ',' + G.ay + 'V' + r2(top + 5));
      cxy(B.knob, gx, top); cxy(B.knobDot, gx, top);
      setT2(B.tnum, 't = ' + M.t.toFixed(2)); at(B.tnum, gx + 9, top);
      B.hit.setAttribute('x', r2(gx - 22 / k)); B.hit.setAttribute('y', r2(top - 22 / k)); B.hit.setAttribute('height', r2(G.ay + 4 - top + 22 / k));
      if (mini) return;
      // counts: the formulas follow the threshold at once; the bar labels count arrivals
      var c = M.cnt, a = M.arrived;
      if (dirty.txt || dirty.b) {
        var tpr = c.TP + c.FN ? c.TP / (c.TP + c.FN) : 0, fpr = c.FP + c.TN ? c.FP / (c.FP + c.TN) : 0;
        setT2(B.txt[0], 'TPR = TP / (TP + FN) = ' + c.TP + ' / ' + (c.TP + c.FN) + ' = ' + tpr.toFixed(2));
        setT2(B.txt[1], 'FPR = FP / (FP + TN) = ' + c.FP + ' / ' + (c.FP + c.TN) + ' = ' + fpr.toFixed(2));
        var segs = [['TN', 'FN', 0], ['TP', 'FP', 1]];
        segs.forEach(function (sg, j) {
          var lo = c[sg[0]], hi = c[sg[1]], bar = sg[2], xl = G.bx[bar] + 3 * G.bp + 2, bp = G.bp;
          var yLo = G.base - Math.max(1, Math.ceil(lo / 6)) * bp / 2, yHi = G.base - (Math.ceil((lo + hi) / 6) * bp + Math.floor(lo / 6) * bp) / 2;
          if (hi === 0) yHi = G.base - Math.ceil(lo / 6) * bp - 6;
          if (yLo - yHi < 13) yHi = yLo - 13;
          var eLo = B.seg[j * 2], eHi = B.seg[j * 2 + 1];
          setT2(eLo, sg[0] + ' ' + a[sg[0]]); setT2(eHi, sg[1] + ' ' + a[sg[1]]); at(eLo, xl, yLo); at(eHi, xl, yHi);
          var tot = a[sg[0]] + a[sg[1]], ty = G.totalY != null ? G.totalY : G.base - Math.max(1, Math.ceil((lo + hi) / 6)) * bp - 10;
          setT2(B.tot[bar], String(tot)); at(B.tot[bar], G.bx[bar], ty);
        });
      }
    }
    function renderSlider() { var P = parts.sl, x = 30 + 320 * M.t; cxy(P.Sl.knob, x, 22); P.Sl.hit.setAttribute('x', r2(x - 22 / P.k)); P.Sl.hit.setAttribute('y', r2(22 - 22 / P.k)); }

    function rocXY(G, f, t) { return [G.x0 + f * G.S, G.y0 + G.S - t * G.S]; }
    function opPoint(t) { var c = counts(M.ph, M.S.d.y, t); return { f: c.FP / M.R.N, t: c.TP / M.R.P, c: c }; }
    function renderC() {
      var P = parts.c, Cc = P.Cc, G = P.G, R = M.R, k = P.k, sw2 = S.sweep, tDot = M.t, showTo = -1, hatchOp = 1, aucOp = 1;
      if (sw2) {
        var e = S.clock - sw2.t0;
        if (e < 0) { tDot = 1; showTo = Infinity; hatchOp = 0; aucOp = 0; }
        else if (e < sw2.dur) { tDot = 1 - e / sw2.dur; showTo = tDot; hatchOp = 0; aucOp = 0; }
        else { tDot = Math.min(M.t, (e - sw2.dur - 300) / sw2.back * M.t); if (tDot < 0) tDot = 0; showTo = 0; hatchOp = clamp((e - sw2.hatchAt) / 300, 0, 1); aucOp = clamp((e - sw2.aucAt) / 200, 0, 1);
          if (e > sw2.dur + 300 + sw2.back && e > sw2.aucAt + 200) { S.sweep = null; tDot = M.t; showTo = -1; } }
      }
      var pts = [];
      for (var i = 0; i < R.pts.length; i++) { var q = R.pts[i]; if (showTo >= 0 && i > 0 && q.thr < showTo) break; pts.push(rocXY(G, q.f, q.t)); }
      var entryWait = S.entry && !S.entry.swept;
      dset(Cc.curve, entryWait ? '' : polyD(pts));
      var area = R.pts.map(function (q) { return rocXY(G, q.f, q.t); }); area.push(rocXY(G, 1, 0));
      dset(Cc.area, polyD(area) + 'Z'); op(Cc.area, entryWait ? 0 : r2(hatchOp * 0.9));
      var o = opPoint(tDot), d = rocXY(G, o.f, o.t);
      if (entryWait) { cxy(Cc.dot, -99, -99); dset(Cc.drop, ''); } else { cxy(Cc.dot, d[0], d[1]); dset(Cc.drop, 'M' + r2(d[0]) + ',' + r2(G.y0 + G.S) + 'V' + r2(d[1]) + 'H' + G.x0); }
      // the AUC on a paper patch inside the area
      var ap = G.mini ? rocXY(G, 0.62, 0.2) : rocXY(G, 0.64, 0.22), str = 'AUC = ' + M.auc.toFixed(2);
      setT2(Cc.auc, str); at(Cc.auc, ap[0], ap[1]);
      var w = textW(str, Cc.auc.__fs) + 6, hgt = Cc.auc.__fs * 1.05;
      Cc.patch.setAttribute('x', r2(ap[0] - w / 2)); Cc.patch.setAttribute('y', r2(ap[1] - hgt / 2)); Cc.patch.setAttribute('width', r2(w)); Cc.patch.setAttribute('height', r2(hgt));
      var aO = entryWait ? 0 : aucOp; op(Cc.auc, aO); op(Cc.patch, r2(aO * 0.92));
      if (G.mini) { setT2(Cc.mt, 't = ' + M.t.toFixed(2)); setT2(Cc.mt2, 'TPR ' + o.t.toFixed(2) + ', FPR ' + o.f.toFixed(2)); setT2(Cc.mt3, 'AUC = ' + M.auc.toFixed(2)); op(Cc.auc, 0); op(Cc.patch, 0); return; }
      var vis = entryWait ? 0 : 1;
      setT2(Cc.fl, o.f.toFixed(2)); at(Cc.fl, d[0], G.y0 + G.S + 11); op(Cc.fl, vis);
      setT2(Cc.tl, o.t.toFixed(2)); at(Cc.tl, G.x0 - 6, d[1]); op(Cc.tl, vis);
      setT2(Cc.tt, 't = ' + tDot.toFixed(2)); op(Cc.tt, vis);
      var ll = o.f < 0.5 && o.t < 0.5, anc = ll ? 'start' : 'end', tx = ll ? d[0] + 8 : d[0] - 8, ty = ll ? d[1] + 11 : d[1] - 10;
      if (!ll && tx - textW(Cc.tt.textContent, Cc.tt.__fs) < G.x0 + 2) { anc = 'start'; tx = d[0] + 8; ty = d[1] + 11; }
      if (ty < G.y0 + 6) ty = G.y0 + 6;
      if (ty > G.y0 + G.S - 9) { ty = d[1] - 10; anc = 'start'; tx = d[0] + 8; }
      if (Cc.tt.getAttribute('text-anchor') !== anc) Cc.tt.setAttribute('text-anchor', anc);
      var tw = textW(Cc.tt.textContent, Cc.tt.__fs) + 4, th = Cc.tt.__fs * 1.0;
      Cc.ttP.setAttribute('x', r2(anc === 'start' ? tx - 2 : tx - tw + 2)); Cc.ttP.setAttribute('y', r2(ty - th / 2)); Cc.ttP.setAttribute('width', r2(tw)); Cc.ttP.setAttribute('height', r2(th)); op(Cc.ttP, vis);
      at(Cc.tt, tx, ty);
      // tick numerals give way to the moving values
      var fb = [d[0] - 12, 0, d[0] + 12, 1], tb = [0, d[1] - 6, 1, d[1] + 6];
      Cc.ticks.forEach(function (t, j) { var v = [0, 0.5, 1][j >> 1], x = j % 2 === 0; op(t, vis && (x ? Math.abs(G.x0 + v * G.S - d[0]) < 16 : Math.abs(G.y0 + G.S - v * G.S - d[1]) < 10) ? 0.1 : 1); });
    }
    function renderX() {
      var P = parts.x, X = P.X, S0 = M.S, k = P.k;
      setT2(X.coef, 'β₀ = ' + f2(M.b0) + ' β₁ = ' + f2(M.b1) + ' l(β) = ' + f2(M.lNow));
      setT2(X.how, M.hand ? 'set by hand: everything to the right is recomputed from these' : 'the maximum likelihood estimate');
      // gauge: from below the null model to the maximum
      var lo = Math.floor((Math.min(S0.lNull, S0.fit.l - 12) - 4) / 5) * 5, hi = S0.fit.l, g = X.g;
      var Y = function (l) { return g[2] - (clamp(l, lo, hi + 1) - lo) / (hi + 1 - lo) * (g[2] - g[1]); };
      var td = '', v, n = 0; for (v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) td += 'M' + g[0] + ',' + r2(Y(v)) + 'h-4';
      dset(X.gTicks, td);
      for (v = Math.ceil(lo / 10) * 10; v <= hi && n < 4; v += 10) { setT2(X.gNums[n], f2(v).replace('.00', '')); at(X.gNums[n], g[0] - 6, Y(v)); op(X.gNums[n], 1); n++; }
      for (; n < 4; n++) op(X.gNums[n], 0);
      dset(X.gMax, 'M' + (g[0] - 5) + ',' + r2(Y(hi)) + 'h10'); at(X.gMaxT, g[0] + 12, Y(hi) - 2);
      var yv = Y(M.lNow); dset(X.gPtr, 'M' + (g[0] + 1) + ',' + r2(yv) + 'l7,-4v8z'); at(X.gVal, g[0] + 12, Math.max(yv, Y(hi) + 14)); setT2(X.gVal, 'l = ' + f2(M.lNow));
      // the iterates
      var it = (S.replay && S.replay.it) || S0.fit.it, kk = S.replay ? S.replay.k : it.length - 1;
      var nR = X.rows.length, shown = Math.min(kk, it.length - 1), first = Math.max(0, shown - nR + 1);
      for (var i = 0; i < nR; i++) {
        var q = first + i, r = it[q], row = X.rows[i];
        for (var c = 0; c < 4; c++) {
          var e = row[c];
          if (!r || q > shown) { setT2(e, ''); continue; }
          setT2(e, c === 0 ? String(q) : c === 1 ? f2(r.b0) : c === 2 ? f2(r.b1) : f2(r.l));
          var f = q === shown ? C.sanguineDeep : C.ink; if (e.__f !== f) { e.__f = f; e.setAttribute('fill', f); }
        }
      }
      // the lever
      var j = SIGNALS.indexOf(M.signal), ang = -40 + 40 * j;
      X.levArm.setAttribute('transform', 'translate(' + X.lev[0] + ',' + X.lev[1] + ') rotate(' + ang + ')');
      var a = (-90 + ang) / R2D; cxy(X.levKnob, X.lev[0] + 40 * Math.cos(a), X.lev[1] + 40 * Math.sin(a));
      X.levNames.forEach(function (t, q) { var f = q === j ? C.ink : C.ink2; if (t.__f !== f) { t.__f = f; t.setAttribute('fill', f); t.setAttribute('font-weight', q === j ? 600 : 400); } });
      setT2(X.aucs, 'weak: AUC ' + dataset('weak').auc.toFixed(2)); setT2(X.aucs2, 'fair: AUC ' + dataset('fair').auc.toFixed(2)); setT2(X.aucs3, 'strong: AUC ' + dataset('strong').auc.toFixed(2));
      // the pairs beam
      var Pp = S.pairs, cur = Pp.cur;
      if (cur) {
        var sd = M.ph[cur[0]], sn = M.ph[cur[1]], tilt = sd > sn ? -8 : sd < sn ? 8 : 0;
        X.bg.setAttribute('transform', 'translate(' + X.beam[0] + ',' + X.beam[1] + ') rotate(' + tilt + ')');
        setT2(X.sd, sd.toFixed(2)); setT2(X.sn, sn.toFixed(2));
        var ay = Math.sin(tilt / R2D) * 62; at(X.sd, X.beam[0] - 62, X.beam[1] - 18 - ay); at(X.sn, X.beam[0] + 62, X.beam[1] - 18 + ay);
      } else { setT2(X.sd, ''); setT2(X.sn, ''); }
      setT2(X.tally, 'default scored higher in ' + (Pp.k % 1 ? Pp.k.toFixed(1) : Pp.k) + ' of ' + Pp.m + ' pairs');
      setT2(X.all, 'over all ' + M.R.P * M.R.N + ' pairs: ' + M.aucP.toFixed(2) + ' (the AUC is ' + M.auc.toFixed(2) + ')');
    }
    // focus rings drawn around the drawn controls; crank arms show when a demonstration runs
    function renderFocus() {
      var g = parts.focus; while (g.firstChild) g.removeChild(g.firstChild);
      var u = U(), k = S.focus;
      if (parts.b && parts.b.B.crank) parts.b.B.crank.arm.setAttribute('opacity', S.demo ? 1 : 0.55);
      if (parts.x && parts.x.X.demo) parts.x.X.demo.arm.setAttribute('opacity', S.demo ? 1 : 0.55);
      if (!k || !S.focusVis) return;
      var P = null, x = 0, y = 0, r = 9, box = null;
      if (k === 'p' && parts.a) { P = parts.a; x = 74; y = GA.P(M.p); }
      else if (k === 't' && parts.b) { P = parts.b; x = P.G.a0 + M.t * (P.G.a1 - P.G.a0); y = gateTop(P.G); }
      else if (k === 't2' && parts.sl) { P = parts.sl; x = 30 + 320 * M.t; y = 22; }
      else if (k === 'b0' && parts.a && parts.a.A.h0) { P = parts.a; x = GA.X(0); y = GA.E(M.b0); }
      else if (k === 'b1' && parts.a && parts.a.A.h1) { P = parts.a; x = GA.X(1.5); y = GA.E(M.b0 + 1.5 * M.b1); }
      else if (k === 'demo' && parts.b && parts.b.B.crank) { P = parts.b; box = parts.b.B.crank.box; }
      else if (k === 'sweep' && parts.c && parts.c.Cc.crank) { P = parts.c; box = parts.c.Cc.crank.box; }
      else if (k === 'fit' && parts.x) { P = parts.x; box = parts.x.X.fit.box; }
      else if (k.indexOf('sig-') === 0 && parts.x) { P = parts.x; var t = parts.x.X.levNames[SIGNALS.indexOf(k.slice(4))]; x = +t.getAttribute('x'); y = +t.getAttribute('y'); box = [x - 22, y - 10, x + 22, y + 10]; }
      if (!P) return;
      var o = 3 / P.k, s2 = sw(2, P.k), gg = H.el('g', { transform: tr(P) }, g);
      if (box) H.el('rect', { x: r2(box[0] - o), y: r2(box[1] - o), width: r2(box[2] - box[0] + 2 * o), height: r2(box[3] - box[1] + 2 * o), fill: 'none', stroke: C.sanguineDeep, 'stroke-width': s2 }, gg);
      else H.el('circle', { cx: r2(x), cy: r2(y), r: r2(r + o), fill: 'none', stroke: C.sanguineDeep, 'stroke-width': s2 }, gg);
    }

    // ---- pointer: drag the drawn controls, click the drawn buttons -----------------------------------
    function local(P, e) { var m = S.drag.m, x = (e.clientX - m.left) / m.u, y = (e.clientY - m.top) / m.u; return [(x - P.ox) / P.s, (y - P.oy) / P.s]; }
    function onDown(e) {
      var tgt = e.target, key = tgt.getAttribute && tgt.getAttribute('data-k'); if (!key) return;
      var inp = inputs[key];
      if (tgt.classList.contains('nb-logit-btn')) { e.preventDefault(); if (inp) { inp.focus({ preventScroll: true }); S.focusVis = false; if (inp.type === 'radio') { inp.checked = true; inp.dispatchEvent(new Event('change')); } else inp.click(); } return; }
      e.preventDefault(); tgt.setPointerCapture(e.pointerId);
      var rc = wrap.getBoundingClientRect(); S.drag = { key: key, m: { left: rc.left, top: rc.top, u: rc.width / vb[2] }, id: e.pointerId };
      if (inp) inp.focus({ preventScroll: true }); S.focusVis = false; dirty.focus = true;
      onMove(e);
    }
    function onMove(e) {
      var Dg = S.drag; if (!Dg || e.pointerId !== Dg.id) return;
      var q;
      if (Dg.key === 'p') { q = local(parts.a, e); setP(Math.round(GA.iP(q[1]) * 100) / 100, true); }
      else if (Dg.key === 't') { var G = parts.b.G; q = local(parts.b, e); setT((q[0] - G.a0) / (G.a1 - G.a0), true); }
      else if (Dg.key === 't2') { q = local(parts.sl, e); setT((q[0] - 30) / 320, true); }
      else if (Dg.key === 'b0') { q = local(parts.a, e); setCoef(Math.round(GA.iE(q[1]) * 100) / 100, M.b1); }
      else if (Dg.key === 'b1') { q = local(parts.a, e); setCoef(M.b0, Math.round((GA.iE(q[1]) - M.b0) / 1.5 * 100) / 100); }
    }
    function onUp(e) { if (S.drag && e.pointerId === S.drag.id) S.drag = null; }
    wrap.addEventListener('pointerdown', onDown); wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp); wrap.addEventListener('pointercancel', onUp);

    // =====================================================================================================
    // The instance
    loadSignal('fair');
    var inst = {
      layout: function (mode) {
        if (!S.alive) return;
        var u = U(), was = S.mode; S.mode = mode; L = layoutFor(mode);
        var Wu = mode === 'pocket' ? 390 : Math.max(1, host.clientWidth / u), Hu = mode === 'pocket' ? L.H : Math.max(1, host.clientHeight / u);
        if (mode !== 'pocket') { L.W = Wu; L.H = Hu; }
        vb = [0, 0, r2(mode === 'pocket' ? 390 : Wu), r2(Hu)];
        host.setAttribute('data-mode', mode);
        wrap.style.width = mode === 'pocket' ? Math.round(390 * u) + 'px' : '100%';
        wrap.style.height = mode === 'pocket' ? Math.round(L.H * u) + 'px' : '100%';
        // controls that do not exist in this mode are taken out of the tab order
        var has = { p: !!L.a, t: !!L.b, t2: !!L.slider, b0: !!L.extras, b1: !!L.extras, demo: mode !== 'margin', sweep: mode !== 'margin', fit: !!L.extras };
        Object.keys(has).forEach(function (k2) { inputs[k2].disabled = !has[k2]; inputs[k2].hidden = !has[k2]; });
        fs.hidden = !L.extras; fs.disabled = !L.extras;
        if (!st) { st = H.study(wrap, def); wrap.insertBefore(st.svg, wrap.firstChild); st.svg.setAttribute('aria-describedby', desc.id); }
        else { st.measure(); var blank = st.state === 'blank'; st.rebuild(); if (!blank || S.entered) st.finish(); }
        if (!S.entered) {
          var r = host.getBoundingClientRect(), vis = r.bottom > 0 && r.top < W.innerHeight && r.width > 0;
          if (reduced || mode === 'margin') { st.finish(); finishEntry(); }
          else if (vis) { S.visible = true; st.play(); if (st.state === 'drawing') beginEntry(); else finishEntry(); }
        } else if (S.entry) { /* keep going */ } else snapAll();
        if (was === 'margin' || mode === 'margin') S.sweep = null;
        render(true); wake();
      },
      setRunning: function (on) { S.running = !!on; if (on) wake(); },
      setDemo: function (on) { setDemo(on); },
      anchor: function (name) {
        if (!parts || !parts.a) return null;
        var P = parts.a;
        if (name === 'predictor') { var q = P.A.predXY || [230, 200]; return { x: P.ox + q[0] * P.s, y: P.oy + q[1] * P.s }; }
        if (name === 'probability') return { x: P.ox + 78 * P.s, y: P.oy + 14 * P.s };
        return null;
      },
      destroy: function () {
        S.alive = false; io.disconnect(); clearTimeout(S.annT);
        if (st && st.svg.parentNode) st.svg.parentNode.removeChild(st.svg);
        var i = H.studies.indexOf(st); if (i >= 0) H.studies.splice(i, 1);
        host.removeChild(wrap); host.removeChild(ctl); host.classList.remove('nb-logit');
      },
      // for tests and the capture scripts
      _state: function () { return { t: M.t, p: M.p, b0: M.b0, b1: M.b1, auc: M.auc, aucPairs: M.aucP, counts: M.cnt, arrived: M.arrived, signal: M.signal, demo: S.demo, looping: S.looping, entry: !!S.entry, moving: M.units.filter(function (u) { return !!u.path; }).length, crossing: M.units.filter(function (u) { return u.path && u.path.cross; }).length, hand: M.hand }; },
      _set: function (o) { if (o.t != null) setT(o.t, true); if (o.p != null) setP(o.p, true); if (o.signal) setSignal(o.signal); if (o.coef) setCoef(o.coef[0], o.coef[1]); if (o.fit) startReplay(); if (o.sweep) startSweep(); }
    };
    return inst;
  }

  NB.figures.logit = { mount: mount, selfTest: selfTest, search: search, _math: { sigma: sigma, logit: logit, odds: odds, newton: newton, roc: roc, aucPairs: aucPairs, counts: counts, gen: gen, dataset: dataset, scores: scores, SEED: SEED } };
})(window);
