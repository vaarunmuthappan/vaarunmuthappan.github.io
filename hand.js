/* hand.js: the drawing hand (SPEC-5 §2.3). One engine for every drawing on the site.
   No libraries, no Canvas, no filters. Deterministic: every random choice comes from mulberry32
   seeded with FNV-1a of "<studyId>:<strokeIndex>[:suffix]"; no Math.random, no clocks.

   PUBLIC API (window.Hand). Stable: later passes must not change it without saying so.
   Units: "u" = study units (the SVG viewBox); "px" = CSS px; times in ms; angles in degrees
   (y points down, so a positive angle turns clockwise on screen).

   Utilities
     Hand.fnv1a(str) -> uint32                    FNV-1a hash of a string
     Hand.rng(key) -> fn() -> [0,1)               mulberry32 seeded with fnv1a(key)
     Hand.noise(key) -> fn(x) -> [-1,1]           1-D value noise, smoothstep interpolation
     Hand.bezier(x1,y1,x2,y2) -> fn(t) -> y       CSS cubic-bezier as a function
     Hand.EASE_PEN, Hand.EASE_MECH                the two easings of the sheet
     Hand.C                                       colours {ink, ink2, silver, sanguine, sanguineDeep, paper}
     Hand.el(tag, attrs, parent) -> SVGElement    create an SVG element (attrs as presentation attributes)
     Hand.arcPts(cx,cy,r,a0,a1,stepDeg) -> [[x,y]] points on a circular arc (u, degrees)
     Hand.pathD(pts, closed) -> d                 Catmull-Rom through pts as cubic Béziers (2 dp)
     Hand.wobble(pts, Apx, l1px, l2px, k, key) -> pts   resample every 4 px and displace (perpendicular)
     Hand.reduced                                 true under prefers-reduced-motion: reduce
     Hand.now()                                   ms since the engine started (Hand.start())

   Studies and the timeline runner
     Hand.study(host, def[, opts]) -> Study       build an aria-hidden inline SVG inside host
        def = { id, viewBox: [x,y,w,h] | fn(host) -> [x,y,w,h], build(pen, st), live?(st), reset?(st) }
        opts = { k?: px per u (stills), still?: true }
        Study: .svg .id .k (px per u) .vb .state ('blank' | 'drawing' | 'live') .total (ms)
               .layers {silver, ink, sang, text} .inView (bool) .parts (whatever build() stores)
               .play() .finish() .reset() .rebuild() .onLive(fn)
        The host's CSS width (and height, if set) fixes k. Pen weights and wobble are CSS px and
        are recomputed through k on rebuild; the study rebuilds itself (finished) on resize.
     Hand.autoplay(st, afterMs[, threshold=0.35])  play when Hand.now() >= afterMs AND the host is
        at least `threshold` visible (IntersectionObserver). Reduced motion: finish at once.
     Hand.still(def, pxWidth) -> SVG string        the finished drawing, standalone (for assets/studies)

   The pen (argument to def.build; all geometry in u, all weights/amplitudes in px)
     pen.t                                        timeline cursor (ms); strokes advance it
     pen.step(at, dur|null, fn)                   run fn with pen.t = at; then rescale the strokes made
                                                  inside fn so the step ends at at + dur; returns end
     pen.wait(ms)                                 advance the cursor
     pen.into(g) -> previous g                    default parent for ink strokes
     pen.rule(a, b, o)        silverpoint straightedge a=[x,y] -> b, overshoot 8-18 px each end
     pen.arc(cx,cy,r,a0,a1,o) silverpoint compass arc a0 -> a1 (deg), overshoot 3-6 deg, centre prick
                              o.manual: returns a path the caller draws itself (style.strokeDashoffset 1 -> 0)
     pen.ink(pts, o)          pen stroke through pts (pass 1c: wobble 0.7 px, 0.45 over rules, l1 90; pool 3-4 px
                              at 1.3w only at the true start; ruled ink lifts every 320-480 px). o.w: 'heavy' | 'fine' | px (default 1.25);
                              o.closed; o.over (inking over a rule: wobble 0.3); o.split=false keeps a
                              polyline continuous (default: split at corners > 30 deg, each side its own
                              stroke with 1-2.5 px corner overshoot). Pressure: body / pool / lift paths,
                              pen lifts every 160-260 px past 220 px, 12% chance of one dry gap.
     pen.hatch(poly, o)       hatch a polygon at 52 deg below horizontal, spacing 3.2 px ±0.5.
                              o.color 'ink' | 'sanguine'; o.cross adds the 18 deg set at 4.2 px; o.spacing px;
                              o.angle (added in pass 1b) draws a single set at that angle instead of 52 deg
     pen.thread(a, b, o)      plumb thread (ink 0.9, 0.8 px, no wobble, 2600 px/s)
     pen.letter(x,y,str,o)    lettering at a point: o.kind 'pt' (italic 15 px) | 'num' (12 px);
                              o.dir [dx,dy] pushes it 8 px away from the figure; fades in 120 ms
     pen.line(pts,wPx,col,op,cap,cls,t,d,g)  low-level: one stroke path through pts (no wobble) (documented in 1b)
     pen.add(tag,attrs,parent,cls,t,d) low-level: element registered on the timeline (documented in 1b)
     pen.fill(d, attrs, o)    a filled shape (paper fills, discs) that fades in at pen.t (o.dur)
     pen.cue(fn)              call fn(instant) at pen.t; on finish() pending cues run with instant=true
     Every stroke call accepts o.g (parent group) and o.color ('ink'|'silver'|'sanguine'|hex).

   Shared frame loop and inputs
     Hand.loop.add(fn)        fn(now, dt) runs every frame while it returns true; the single rAF loop
                              stops when no function wants another frame, and while the tab is hidden
     Hand.onScroll(fn)        fn(scrollY, dy, dtMs) once per frame in which the page scrolled
     Hand.onPointer(fn)       fn(x, y, pointerType) once per frame after a pointer move (client px)
     Hand.onResize(fn)        debounced 150 ms
     Hand.start()             set the engine clock (call once, early); returns Hand
*/
(function (W) {
  'use strict';
  var D = W.document, NS = 'http://www.w3.org/2000/svg', R2D = 180 / Math.PI;
  var C = { ink: '#2A2521', ink2: '#5A5048', silver: '#A39B8E', sanguine: '#A4452C', sanguineDeep: '#8A3823', paper: '#F5F1E8' };
  var reduced = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- determinism --------------------------------------------------------
  function fnv1a(s) { s = String(s); var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function mulberry32(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function rng(key) { return mulberry32(fnv1a(key)); }
  function noise(key) {
    var s = fnv1a(key);
    function h(i) { var t = Math.imul(s ^ Math.imul(i | 0, 0x9E3779B1), 0x85EBCA6B); t ^= t >>> 13; t = Math.imul(t, 0xC2B2AE35); t ^= t >>> 16; return (t >>> 0) / 2147483647.5 - 1; }
    return function (x) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h(i) * (1 - u) + h(i + 1) * u; };
  }
  function bezier(x1, y1, x2, y2) {
    function a(p, q) { return 1 - 3 * q + 3 * p; } function b(p, q) { return 3 * q - 6 * p; } function c(p) { return 3 * p; }
    function f(t, p, q) { return ((a(p, q) * t + b(p, q)) * t + c(p)) * t; }
    function df(t, p, q) { return 3 * a(p, q) * t * t + 2 * b(p, q) * t + c(p); }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) { var e = f(t, x1, x2) - x, d = df(t, x1, x2); if (Math.abs(e) < 1e-5) break; if (Math.abs(d) < 1e-6) break; t -= e / d; }
      if (t < 0 || t > 1) { var lo = 0, hi = 1; t = x; for (var j = 0; j < 20; j++) { if (f(t, x1, x2) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
      return f(t, y1, y2);
    };
  }
  var EASE_PEN = bezier(.35, 0, .25, 1), EASE_MECH = bezier(.3, 0, .2, 1);

  // ---- geometry -----------------------------------------------------------
  function r2(v) { return Math.round(v * 100) / 100; }
  function el(tag, attrs, parent) {
    var e = D.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function arcPts(cx, cy, r, a0, a1, step) {
    var n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (step || 2)) + 1), out = [];
    for (var i = 0; i < n; i++) { var a = (a0 + (a1 - a0) * i / (n - 1)) / R2D; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  }
  function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  // resample each segment separately (vertices kept, so corners stay sharp), spacing <= step
  function resample(pts, step) {
    var out = [pts[0]], i, j;
    var total = 0; for (i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
    var minN = total / step < 7 ? 7 : 0;
    for (i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], L = dist(a, b), n = Math.max(1, Math.ceil(L / step));
      if (minN) n = Math.max(n, Math.ceil(minN * L / (total || 1)));
      for (j = 1; j <= n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
    }
    return out;
  }
  function cum(p) { var S = [0]; for (var i = 1; i < p.length; i++) S.push(S[i - 1] + dist(p[i - 1], p[i])); return S; }
  // displace perpendicular by A(0.6 N(s/l1) + 0.4 N(s/l2)) (+ optional bow); all in u
  function displace(p, A, l1, l2, key, bow) {
    var N1 = noise(key + ':a'), N2 = noise(key + ':b'), S = cum(p), L = S[S.length - 1] || 1, out = [];
    for (var i = 0; i < p.length; i++) {
      var q = p[Math.max(0, i - 1)], s = p[Math.min(p.length - 1, i + 1)], dx = s[0] - q[0], dy = s[1] - q[1], m = Math.hypot(dx, dy) || 1;
      var d = A * (0.6 * N1(S[i] / l1) + 0.4 * N2(S[i] / l2)) + (bow ? bow * Math.sin(Math.PI * S[i] / L) : 0);
      out.push([p[i][0] - dy / m * d, p[i][1] + dx / m * d]);
    }
    return out;
  }
  function pathD(p, closed) {
    var n = p.length; if (n < 2) return '';
    var d = 'M' + r2(p[0][0]) + ',' + r2(p[0][1]);
    if (n === 2) return d + 'L' + r2(p[1][0]) + ',' + r2(p[1][1]);
    function P(i) { return closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]; }
    var m = closed ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      d += 'C' + r2(p1[0] + (p2[0] - p0[0]) / 6) + ',' + r2(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        r2(p2[0] - (p3[0] - p1[0]) / 6) + ',' + r2(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + r2(p2[0]) + ',' + r2(p2[1]);
    }
    return d + (closed ? 'Z' : '');
  }
  function wobble(pts, A, l1, l2, k, key) { return displace(resample(pts, 4 / k), A / k, l1 / k, l2 / k, key); }
  // the part of polyline p (cumulative S) between arc lengths s0 and s1
  function cut(p, S, s0, s1) {
    var out = [], i;
    function at(s) { for (var j = 1; j < S.length; j++) if (S[j] >= s) { var t = (s - S[j - 1]) / ((S[j] - S[j - 1]) || 1); return [p[j - 1][0] + (p[j][0] - p[j - 1][0]) * t, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * t]; } return p[p.length - 1]; }
    out.push(at(s0));
    for (i = 0; i < p.length; i++) if (S[i] > s0 && S[i] < s1) out.push(p[i]);
    out.push(at(s1));
    return out;
  }
  function colour(c) { return c === 'silver' ? C.silver : c === 'sanguine' ? C.sanguine : c && c[0] === '#' ? c : C.ink; }

  // ---- the pen ------------------------------------------------------------
  function Pen(st) { this.st = st; this.k = st.k; this.i = 0; this.t = 0; this.items = []; this.cues = []; this.g = st.layers.ink; }
  var P = Pen.prototype;
  P.key = function (o) { return this.st.id + ':' + (o && o.key != null ? o.key : this.i++); };
  P.into = function (g) { var p = this.g; this.g = g; return p; };
  P.wait = function (ms) { this.t += ms; return this.t; };
  P.cue = function (fn) { this.cues.push({ t: this.t, fn: fn }); };
  P.step = function (at, dur, fn) {
    var i0 = this.items.length, c0 = this.cues.length; this.t = at; fn.call(this, this);
    var span = this.t - at;
    if (dur != null && span > 0) {
      var f = dur / span, i;
      for (i = i0; i < this.items.length; i++) { var it = this.items[i]; it.t = at + (it.t - at) * f; it.d *= f; }
      for (i = c0; i < this.cues.length; i++) this.cues[i].t = at + (this.cues[i].t - at) * f;
      this.t = at + dur;
    }
    return this.t;
  };
  P.add = function (tag, attrs, parent, cls, t, d) {
    var e = el(tag, attrs, parent);
    if (cls) e.setAttribute('class', cls);
    if (cls === 'hs' || cls === 'hm') e.setAttribute('pathLength', '1');
    this.items.push({ el: e, t: t, d: d });
    return e;
  };
  P.line = function (pts, w, col, op, cap, cls, t, d, g) {
    return this.add('path', { d: pathD(pts), fill: 'none', stroke: col, 'stroke-width': r2(w / this.k * 1000) / 1000, 'stroke-opacity': op,
      'stroke-linecap': cap, 'stroke-linejoin': 'round' }, g, cls, t, d);
  };
  P.rule = function (a, b, o) {
    o = o || {}; var k = this.k, key = this.key(o), r = rng(key), L = dist(a, b) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    var e0 = o.flush ? 0 : (8 + 10 * r()) / k, e1 = o.flush ? 0 : (8 + 10 * r()) / k;
    var pts = displace(resample([[a[0] - ux * e0, a[1] - uy * e0], [b[0] + ux * e1, b[1] + uy * e1]], 4 / k), 0.2 / k, 120 / k, 31 / k, key);
    var d = (L + e0 + e1) * k / (o.speed || 1400) * 1000;
    var p = this.line(pts, o.w || 0.6, colour(o.color || 'silver'), o.op || 0.9, 'butt', 'hs', this.t, d, o.g || this.st.layers.silver);
    this.t += d; return p;
  };
  P.arc = function (cx, cy, r, a0, a1, o) {
    o = o || {}; var k = this.k, key = this.key(o), q = rng(key), sg = a1 >= a0 ? 1 : -1;
    var s0 = a0 - sg * (3 + 3 * q()), s1 = a1 + sg * (3 + 3 * q());
    var pts = displace(resample(arcPts(cx, cy, r, s0, s1, 1), 4 / k), 0.15 / k, 140 / k, 37 / k, key);
    var d = Math.abs(s1 - s0) / R2D * r * k / 1100 * 1000;
    if (!o.noPrick) this.add('circle', { cx: r2(cx), cy: r2(cy), r: r2(0.9 / k), fill: C.ink, 'fill-opacity': 0.6 }, this.st.layers.silver, 'hf', this.t, 120);
    var p = this.line(pts, 0.6, colour(o.color || 'silver'), 0.9, 'butt', o.manual ? 'hm' : 'hs', this.t, d, o.g || this.st.layers.silver);
    p.__arc = { a0: s0, a1: s1 };
    this.t += d; return p;
  };
  P.ink = function (pts, o) {
    o = o || {};
    if (o.split !== false && !o.closed && pts.length > 2) {
      var runs = [], cur = [pts[0]], i;
      for (i = 1; i < pts.length; i++) {
        cur.push(pts[i]);
        if (i < pts.length - 1) {
          var a1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]), a2 = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
          var da = Math.abs(((a2 - a1) * R2D + 540) % 360 - 180);
          if (da > 30) { runs.push(cur); cur = [pts[i]]; }
        }
      }
      runs.push(cur);
      if (runs.length > 1) { var out = []; for (i = 0; i < runs.length; i++) { out = out.concat(this.stroke(runs[i], o, true)); if (i < runs.length - 1) this.t += 40; } return out; }
    }
    return this.stroke(pts, o, !o.closed && pts.length === 2);
  };
  P.stroke = function (pts, o, overshoot) {
    var k = this.k, key = this.key(o), r = rng(key), out = [];
    var w = o.w === 'heavy' ? 1.7 : o.w === 'fine' ? 0.9 : (o.w || 1.25), op = r2(0.80 + 0.16 * r()), A = (o.over ? 0.45 : 0.7) / k; // REVIEW-5-1 item 7
    var col = colour(o.color || 'ink'), g = o.g || this.g;
    pts = pts.slice();
    if (o.closed) pts.push(pts[0]);
    if (overshoot) {
      var a = pts[0], b = pts[1], z = pts[pts.length - 1], y = pts[pts.length - 2], la = dist(a, b) || 1, lz = dist(y, z) || 1, e0 = (1 + 1.5 * r()) / k, e1 = (1 + 1.5 * r()) / k;
      pts[0] = [a[0] - (b[0] - a[0]) / la * e0, a[1] - (b[1] - a[1]) / la * e0];
      pts[pts.length - 1] = [z[0] + (z[0] - y[0]) / lz * e1, z[1] + (z[1] - y[1]) / lz * e1];
    }
    var p = resample(pts, 4 / k), S = cum(p), L = S[S.length - 1], Lpx = L * k;
    var dur = Math.max(120, Math.min(900, Lpx / (o.speed || 520) * 1000)), tpu = dur / (L || 1);
    var cuts = [0], s = 0;
    // pen lifts: every 160-260 px past 220 px; on ink ruled over a construction line every 320-480 px
    var lift = o.over ? [320, 160, 440] : [160, 100, 220];
    if (Lpx > lift[2]) while (L - s > (lift[0] + lift[1]) / k) { s += (lift[0] + lift[1] * r()) / k; if (L - s < 60 / k) break; cuts.push(s); }
    cuts.push(L);
    var t0 = this.t;
    for (var j = 0; j < cuts.length - 1; j++) {
      var a0 = j ? cuts[j] - (1.5 + 1.5 * r()) / k : 0, a1 = cuts[j + 1];
      var sub = displace(cut(p, S, a0, a1), A, 90 / k, 19 / k, key + ':' + j), SS = cum(sub), sl = SS[SS.length - 1];
      var e = Math.min((9 + 5 * r()) / k, 0.4 * sl), pl = Math.min((3 + r()) / k, 0.3 * sl), ts = t0 + a0 * tpu + j * 30;
      var pieces = [], bEnd = sl - e;
      if (r() < 0.12 && sl * k > 30) {
        var g0 = sl * (0.67 + 0.2 * r()), gw = (1.5 + 1.5 * r()) / k;
        if (g0 + gw < bEnd) pieces.push([0, g0, w], [g0 + gw, bEnd, w]); else pieces.push([0, bEnd, w]);
      } else pieces.push([0, bEnd, w]);
      if (!j) pieces.push([0, pl, 1.3 * w]); // the nib touches down only at the true start of a stroke
      pieces.push([Math.max(0, bEnd - 2 / k), sl, 0.62 * w]);
      for (var q = 0; q < pieces.length; q++) {
        var pc = pieces[q], seg = cut(sub, SS, pc[0], pc[1]);
        out.push(this.line(seg, pc[2], col, op, 'round', 'hs', ts + pc[0] * tpu, Math.max(16, (pc[1] - pc[0]) * tpu), g));
      }
    }
    this.t = t0 + dur + 30 * (cuts.length - 2);
    return out;
  };
  P.thread = function (a, b, o) {
    o = o || {}; var d = dist(a, b) * this.k / 2600 * 1000;
    var p = this.line([a, b], o.w || 0.8, colour(o.color || 'ink'), 0.9, 'round', 'hs', this.t, d, o.g || this.g);
    this.t += d; return p;
  };
  // polygon/line intersections; returns sorted parameters t along p0 + t·u
  function hits(poly, p0, u) {
    var ts = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], den = u[0] * ey - u[1] * ex;
      if (Math.abs(den) < 1e-9) continue;
      var wx = a[0] - p0[0], wy = a[1] - p0[1], t = (wx * ey - wy * ex) / den, s = (wx * u[1] - wy * u[0]) / den;
      if (s >= 0 && s < 1) ts.push(t);
    }
    return ts.sort(function (x, y) { return x - y; });
  }
  P.hatch = function (poly, o) {
    o = o || {}; var self = this, k = this.k, key = this.key(o), r = rng(key), out = [];
    var col = colour(o.color === 'sanguine' ? 'sanguine' : 'ink'), op = o.color === 'sanguine' ? 0.8 : 0.7, g = o.g || this.g;
    var sets = [[o.angle != null ? o.angle : 52, o.spacing || 3.2]]; if (o.cross) sets.push([18, o.crossSpacing || 4.2]);
    var t = this.t, n = 0;
    sets.forEach(function (set) {
      var a = set[0] / R2D, u = [Math.cos(a), Math.sin(a)], nn = [Math.sin(a), -Math.cos(a)], lo = Infinity, hi = -Infinity;
      poly.forEach(function (p) { var v = p[0] * nn[0] + p[1] * nn[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); });
      var sp = set[1] / k, off = hi - sp * (0.5 + 0.3 * r());
      var cx = 0, cy = 0; poly.forEach(function (p) { cx += p[0] / poly.length; cy += p[1] / poly.length; });
      var cn = cx * nn[0] + cy * nn[1];
      for (; off > lo; off -= sp + (r() - 0.5) * 1 / k) {
        // each line passes the polygon's centroid band; its angle jitter (±2.5°) turns it about its own
        // midpoint and is limited so neither end strays more than 0.3 spacing (long lines stay parallel)
        var p0 = [cx + nn[0] * (off - cn), cy + nn[1] * (off - cn)], ts = hits(poly, p0, u), jr = r() - 0.5;
        for (var m = 0; m + 1 < ts.length; m += 2) {
          var s0 = ts[m], s1 = ts[m + 1], L = s1 - s0, jm = Math.min(2.5 / R2D, Math.atan(0.3 * sp / Math.max(L / 2, 1e-6))), j = jr * 2 * jm;
          var uj = [Math.cos(a + j), Math.sin(a + j)], mid = [p0[0] + u[0] * (s0 + s1) / 2, p0[1] + u[1] * (s0 + s1) / 2], e0 = -L / 2, e1 = L / 2;
          if (r() < 0.15) { e0 -= r() / k; e1 += r() / k; } else { e0 += 2.5 * r() / k; e1 -= 2.5 * r() / k; }
          if ((e1 - e0) * k < 2) continue;
          var pts = displace(resample([[mid[0] + uj[0] * e0, mid[1] + uj[1] * e0], [mid[0] + uj[0] * e1, mid[1] + uj[1] * e1]], 4 / k), 0.25 / k, 40 / k, 11 / k, key + ':' + n, (r() - 0.5) * 1.2 / k);
          out.push(self.line(pts, o.w || 0.7, col, op, 'round', 'hs', t + 18 * n, 70 + 40 * r(), g));
          n++;
        }
      }
    });
    this.t = t + 18 * n + 90;
    return out;
  };
  P.letter = function (x, y, str, o) {
    o = o || {}; var k = this.k, pt = o.kind !== 'num', fs = (o.size || (pt ? 15 : 12)) / k, dir = o.dir || [0, 0], off = (o.off == null ? 8 : o.off) / k + fs * 0.35;
    var e = this.add('text', { x: r2(x + dir[0] * off), y: r2(y + dir[1] * off), 'font-size': r2(fs), 'font-style': pt ? 'italic' : null,
      'font-family': "'EB Garamond', Georgia, serif", fill: C.ink, 'fill-opacity': pt ? 0.85 : 0.8, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-variant-numeric': 'lining-nums tabular-nums' }, o.g || this.st.layers.text, 'hf', this.t, 120);
    e.textContent = str; return e;
  };
  P.fill = function (d, attrs, o) {
    o = o || {}; var a = { d: d, stroke: 'none' }; for (var q in attrs) a[q] = attrs[q];
    return this.add('path', a, o.g || this.g, 'hf', this.t, o.dur || 160);
  };

  // ---- shared loop and inputs ---------------------------------------------
  var fns = [], raf = 0, last = 0, t0 = null;
  function frame(now) {
    raf = 0; var dt = last ? Math.min(64, now - last) : 16.7; last = now;
    if (scrolled) { scrolled = false; var y = W.scrollY, dy = y - lastY; lastY = y; scrollFns.forEach(function (f) { f(y, dy, dt); }); }
    if (ptr) { var p = ptr; ptr = null; ptrFns.forEach(function (f) { f(p[0], p[1], p[2]); }); }
    var keep = [];
    for (var i = 0; i < fns.length; i++) if (fns[i](now, dt)) keep.push(fns[i]);
    fns = keep.concat(fns.slice(fns.length)); // functions added during the frame are kept by add()
    if (fns.length && !D.hidden) raf = W.requestAnimationFrame(frame); else last = 0;
  }
  function wake() { if (!raf && !D.hidden) raf = W.requestAnimationFrame(frame); }
  var loop = { add: function (fn) { if (fns.indexOf(fn) < 0) fns.push(fn); wake(); }, wake: wake, size: function () { return fns.length + (raf ? 0.5 : 0); } };
  var scrollFns = [], ptrFns = [], resizeFns = [], scrolled = false, lastY = W.scrollY || 0, ptr = null, rzT = 0;
  W.addEventListener('scroll', function () { if (scrollFns.length) { scrolled = true; wake(); } }, { passive: true });
  W.addEventListener('pointermove', function (e) { if (ptrFns.length) { ptr = [e.clientX, e.clientY, e.pointerType]; wake(); } }, { passive: true });
  W.addEventListener('resize', function () { clearTimeout(rzT); rzT = setTimeout(function () { resizeFns.forEach(function (f) { f(); }); }, 150); });
  D.addEventListener('visibilitychange', function () {
    if (D.hidden) { if (raf) W.cancelAnimationFrame(raf); raf = 0; last = 0; return; }
    studies.forEach(function (s) { if (s.state === 'drawing') s.finish(); });
    if (fns.length) wake();
  });

  // ---- studies --------------------------------------------------------------
  var studies = [];
  function Study(host, def, opts) {
    this.host = host; this.def = def; this.id = def.id; this.opts = opts || {}; this.state = 'blank'; this.timers = []; this.inView = false; this.live = [];
    this.svg = el('svg', { 'class': this.opts.still ? null : 'hd', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: def.par || 'xMidYMid meet' });
    if (host && host.appendChild) host.appendChild(this.svg);
    this.build();
    if (!this.opts.still) {
      studies.push(this); var self = this;
      resizeFns.push(function () { var k = self.k; self.measure(); if (Math.abs(self.k - k) / k > 0.01 || self.vbChanged) self.rebuild(); });
    }
  }
  var S = Study.prototype;
  S.measure = function () {
    var def = this.def, vb = typeof def.viewBox === 'function' ? def.viewBox(this.host) : def.viewBox;
    this.vbChanged = this.vb && vb.join() !== this.vb.join(); this.vb = vb;
    if (this.opts.k) { this.k = this.opts.k; return; }
    var w = this.host.clientWidth, h = this.host.clientHeight;
    // a host with no layout box yet (display: none, detached) draws at k = 1 and rebuilds on resize
    this.k = !w ? 1 : Math.max(0.05, h ? Math.min(w / vb[2], h / vb[3]) : w / vb[2]) || 1;
  };
  S.build = function () {
    if (!this.vb) this.measure();
    var svg = this.svg; while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', this.vb.join(' '));
    this.layers = { silver: el('g', null, svg), ink: el('g', null, svg), sang: el('g', null, svg), text: el('g', null, svg) };
    var pen = new Pen(this); this.parts = {};
    this.def.build.call(this.def, pen, this);
    var total = 0;
    pen.items.forEach(function (it) {
      if (it.el.getAttribute('class')) { it.el.style.setProperty('--t', Math.round(it.t) + 'ms'); it.el.style.setProperty('--d', Math.round(it.d) + 'ms'); }
      total = Math.max(total, it.t + it.d);
    });
    pen.cues.forEach(function (c) { total = Math.max(total, c.t); });
    this.total = total; this.cues = pen.cues.sort(function (a, b) { return a.t - b.t; });
  };
  S.clear = function () { this.timers.forEach(clearTimeout); this.timers = []; };
  S.play = function () {
    if (this.state !== 'blank') return;
    if (reduced || D.hidden) return this.finish();
    var self = this; this.state = 'drawing'; this.svg.getBoundingClientRect();
    this.svg.classList.add('drawing');
    this.cues.forEach(function (c) { c.done = false; self.timers.push(setTimeout(function () { c.done = true; c.fn(false); }, c.t)); });
    this.timers.push(setTimeout(function () { self.goLive(); }, this.total + 40));
  };
  S.finish = function () {
    if (this.state === 'live') return;
    this.clear(); this.cues.forEach(function (c) { if (!c.done) { c.done = true; c.fn(true); } });
    this.goLive();
  };
  S.goLive = function () {
    this.clear(); this.state = 'live'; this.svg.classList.remove('drawing'); this.svg.classList.add('live');
    var self = this; if (this.def.live) this.def.live(this);
    this.live.forEach(function (f) { f(self); });
  };
  S.reset = function () { this.clear(); this.state = 'blank'; this.svg.classList.remove('drawing', 'live'); this.build(); if (this.def.reset) this.def.reset(this); };
  S.rebuild = function () { var was = this.state; this.clear(); this.state = 'blank'; this.svg.classList.remove('drawing', 'live'); this.build(); if (was !== 'blank') this.finish(); };
  S.onLive = function (f) { this.live.push(f); if (this.state === 'live') f(this); };

  var ios = {};
  function observe(st, th, cb) {
    var key = String(th);
    if (!ios[key]) ios[key] = new IntersectionObserver(function (es) { es.forEach(function (e) { var s = e.target.__st; s.inView = e.isIntersecting; (e.target.__cbs || []).forEach(function (f) { f(e); }); }); }, { threshold: [0, th] });
    st.host.__st = st; (st.host.__cbs = st.host.__cbs || []).push(cb); ios[key].observe(st.host);
  }
  function autoplay(st, after, th) {
    if (reduced) { st.finish(); return; }
    th = th == null ? 0.35 : th;
    var ready = false, timed = false;
    function go() { if (ready && timed && st.state === 'blank') st.play(); }
    st.host.__st = st;
    observe(st, th, function (e) {
      var h = e.boundingClientRect.height || 1, need = Math.min(th, 0.9 * (e.rootBounds ? e.rootBounds.height : W.innerHeight) / h);
      if (e.isIntersecting && e.intersectionRatio >= need - 1e-3) { ready = true; go(); }
    });
    setTimeout(function () { timed = true; go(); }, Math.max(0, after - now()));
  }
  function now() { if (t0 == null) t0 = W.performance.now(); return W.performance.now() - t0; }
  function still(def, px) {
    var st = new Study(null, def, { still: true, k: px / (typeof def.viewBox === 'function' ? def.viewBox(null)[2] : def.viewBox[2]) });
    st.cues.forEach(function (c) { c.fn(true); }); if (def.pose) def.pose(st);
    var svg = st.svg, vb = st.vb;
    svg.setAttribute('xmlns', NS); svg.setAttribute('width', Math.round(vb[2] * st.k)); svg.setAttribute('height', Math.round(vb[3] * st.k));
    svg.removeAttribute('aria-hidden'); svg.removeAttribute('focusable');
    svg.querySelectorAll('[style]').forEach(function (e) { e.removeAttribute('style'); });
    svg.querySelectorAll('[class]').forEach(function (e) { e.removeAttribute('class'); });
    svg.querySelectorAll('[pathLength]').forEach(function (e) { e.removeAttribute('pathLength'); });
    return new XMLSerializer().serializeToString(svg);
  }

  W.Hand = {
    fnv1a: fnv1a, rng: rng, noise: noise, bezier: bezier, EASE_PEN: EASE_PEN, EASE_MECH: EASE_MECH, C: C,
    el: el, arcPts: arcPts, pathD: pathD, wobble: wobble, reduced: reduced, now: now, r2: r2,
    study: function (host, def, opts) { return new Study(host, def, opts); }, autoplay: autoplay, observe: observe, still: still,
    loop: loop, onScroll: function (f) { scrollFns.push(f); }, onPointer: function (f) { ptrFns.push(f); }, onResize: function (f) { resizeFns.push(f); },
    start: function () { now(); return W.Hand; }, studies: studies
  };
})(window);
