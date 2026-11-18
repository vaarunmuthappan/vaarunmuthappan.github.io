/* regress.js: Fig I, "The line of least squares" (design/notebook-spec.txt, sections 1.6 to 1.8 and 2).
   Drawn with hand.js; styles in regress.css under .nb-regress.

   The model. Data space x, y in [0, 10], y up. Observations (x_i, y_i) are the inputs; the bar is the
   ordinary least squares line of those observations, recomputed whenever any observation changes,
   with no easing and no lag:
     xbar, ybar the means; Sxx = sum (x - xbar)^2; Sxy = sum (x - xbar)(y - ybar)
     b = Sxy / Sxx, a = ybar - b xbar, e_i = y_i - (a + b x_i), SSR = sum e_i^2, R^2 = 1 - SSR / Syy.
   If Sxx < 1e-6 there is no unique line: no bar is drawn and the ball waits in the chute.

   The ball (fixed 1/120 s steps, nothing random; data units and seconds, g = 14). It falls from the
   chute at (xf, 10) until its centre is r = 0.16 above the line along the normal, keeps only the
   velocity component along the line, then rolls as a solid sphere without slipping: acceleration
   along the line (5/7) g sin(theta) downhill, theta = atan(b), plus rolling resistance 0.03 g against
   the motion. When the centre comes within 0.30 of the cup's x, d = yhat(xh) - yh decides: |d| <= 0.22
   drops it in, d > 0.22 rolls over, d < -0.22 passes under (top below the pot) or knocks the pot.
   So a ball scores exactly when the fitted value at the cup equals the cup's height (to 0.22).

   Contract (spec 1.6): Notebook.figures.regress = { mount(host, env) -> instance, selfTest() }
     instance = { layout(mode, animate), setRunning(bool), setDemo(bool), anchor(name), destroy() }
   Test hooks (not part of the contract): instance._M (state), instance._advance(seconds),
   Notebook.figures.regress._ (fit, simulate, SCEN). */
(function (W) {
  'use strict';
  var D = W.document, H = W.Hand;
  var NB = W.Notebook = W.Notebook || { figures: {} }; NB.figures = NB.figures || {};
  if (!H) return;
  var C = H.C, r2 = H.r2, R2D = 180 / Math.PI;
  var GRAV = 14, STEP = 1 / 120, BR = 0.21, CUP_HW = 0.36, CUP_D = 0.6, TOL = 0.22, RES = 0.03, LO = 0.3, HI = 9.7;
  var FEED = 0.9, STALL = 2.5, DEMO_T = 12;
  var EASE = H.EASE_MECH, EOUT = H.bezier(0, 0, 0.58, 1);
  var DET = [-45, -15, 15, 45], FONT = "'EB Garamond', Georgia, serif", MINUS = '−';
  var uid = 0;

  // ---- the four scenarios (2.6). kinds: f free, p pinned, s sideways only. sol: the verified scoring
  // arrangement (index -> [x, y]); the demonstration travels between the start and it.
  function S(num, name, xf, cup, pegs, sol) { return { num: num, name: name, xf: xf, cup: cup, pegs: pegs, sol: sol }; }
  var SCEN = [
    S('I', 'seven free', 0.6, [9.2, 2.6],
      [[1.0, 7.6, 'f'], [2.2, 6.1, 'f'], [3.5, 6.9, 'f'], [5.0, 5.2, 'f'], [6.3, 5.9, 'f'], [7.6, 4.1, 'f'], [9.0, 4.6, 'f']],
      { 6: [9.0, 1.3] }),
    S('II', 'three pinned', 9.4, [0.8, 2.0],
      [[1.5, 6.0, 'f'], [3.0, 6.5, 'p'], [4.0, 4.5, 'f'], [5.0, 7.0, 'p'], [6.0, 5.0, 'f'], [7.0, 6.2, 'p'], [8.5, 6.0, 'f']],
      { 0: [1.5, 0.4], 6: [8.5, 8.5] }),
    S('III', 'one lever point', 0.6, [9.3, 1.8],
      [[2.0, 6.2, 'p'], [2.6, 5.4, 'p'], [3.1, 6.0, 'p'], [3.6, 5.2, 'p'], [4.1, 5.9, 'p'], [4.5, 5.3, 'p'], [8.5, 5.6, 'f']],
      { 6: [8.5, 1.96] }),
    S('IV', 'sideways only', 0.6, [8.8, 3.2], // cup raised from 1.2: two pegs reach at best 2.90 there
      [[1.0, 7.2, 's'], [2.3, 3.6, 's'], [3.6, 5.5, 's'], [5.0, 8.0, 's'], [6.3, 2.5, 's'], [7.6, 6.1, 's'], [9.0, 4.2, 's']],
      { 3: [1.85, 8.0], 5: [4.15, 6.1] })
  ];

  // ---- the mathematics (2.1) ------------------------------------------------------------------------
  function fit(pts) {
    var n = pts.length, sx = 0, sy = 0, i;
    for (i = 0; i < n; i++) { sx += pts[i].x; sy += pts[i].y; }
    var xb = sx / n, yb = sy / n, sxx = 0, sxy = 0, syy = 0;
    for (i = 0; i < n; i++) { var dx = pts[i].x - xb, dy = pts[i].y - yb; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    var F = { n: n, xb: xb, yb: yb, sxx: sxx, sxy: sxy, syy: syy, ok: sxx >= 1e-6 };
    if (!F.ok) return F;
    F.b = sxy / sxx; F.a = yb - F.b * xb;
    var ssr = 0; F.e = [];
    for (i = 0; i < n; i++) { var e = pts[i].y - (F.a + F.b * pts[i].x); F.e.push(e); ssr += e * e; }
    F.ssr = ssr; F.r2 = syy > 0 ? 1 - ssr / syy : null;
    return F;
  }
  function ssrOf(pts, a, b) { var s = 0; for (var i = 0; i < pts.length; i++) { var e = pts[i].y - a - b * pts[i].x; s += e * e; } return s; }

  // ---- the ball (2.3): one fixed step. Returns an event name or null. ---------------------------------
  function place(B, L) { var th = Math.atan(L.b); B.x = B.cx - BR * Math.sin(th); B.y = L.a + L.b * B.cx + BR * Math.cos(th); }
  function canRelease(L, sc) { return L.ok && (10 - (L.a + L.b * sc.xf)) / Math.sqrt(1 + L.b * L.b) > BR; }
  function release(B, sc) { B.mode = 'drop'; B.x = sc.xf; B.y = 10; B.vy = 0; B.v = 0; B.s = 0; B.op = 1; B.tested = false; B.rest = 0; B.t = 0; B.d = null; }
  function stepBall(B, L, sc, h) {
    var xh = sc.cup[0], yh = sc.cup[1], ev = null, Lb, th, c, sn;
    if (B.mode === 'drop') {
      B.vy -= GRAV * h; B.y += B.vy * h;
      if (L.ok) {
        Lb = Math.sqrt(1 + L.b * L.b);
        if ((B.y - (L.a + L.b * B.x)) / Lb <= BR) { B.cx = B.x + BR * L.b / Lb; B.v = B.vy * L.b / Lb; B.mode = 'roll'; B.rest = 0; place(B, L); ev = 'land'; }
      }
      if (B.mode === 'drop' && B.y < -1) { B.mode = 'fall'; B.vx = 0; B.t = 0; ev = 'off'; }
      return ev;
    }
    if (B.mode === 'roll') {
      if (!L.ok) { B.mode = 'fall'; B.vx = 0; B.vy = 0; B.t = 0; return 'off'; }
      th = Math.atan(L.b); c = Math.cos(th); sn = Math.sin(th);
      var ag = -(5 / 7) * GRAV * sn, fr = RES * GRAV;
      if (B.v === 0) { if (Math.abs(ag) > fr) B.v = (ag - (ag > 0 ? fr : -fr)) * h; }
      else { var v1 = B.v + (ag - (B.v > 0 ? fr : -fr)) * h; if (v1 * B.v < 0) v1 = 0; B.v = v1; }
      B.cx += B.v * c * h; B.s += B.v * h; place(B, L);
      if (B.v === 0) { B.rest += h; if (B.rest >= STALL) { B.mode = 'fade'; B.t = 0; return 'stall'; } } else B.rest = 0;
      if (!B.tested && Math.abs(B.x - xh) <= CUP_HW) {
        B.tested = true; var d = L.a + L.b * xh - yh; B.d = d;
        if (Math.abs(d) <= TOL) { B.mode = 'in'; B.t = 0; B.fx = B.x; B.fy = B.y; return 'score'; }
        if (d > TOL) return 'over';
        if (B.y + BR < yh - CUP_D) return 'under';
        B.mode = 'fade'; B.t = 0; return 'knock';
      }
      if (B.x - BR <= -0.5 || B.x + BR >= 10.5 || B.y - BR <= -0.5) { B.mode = 'fall'; B.vx = B.v * c; B.vy = B.v * sn; B.t = 0; return 'off'; }
      return null;
    }
    if (B.mode === 'in') {
      B.t += h / 0.3; var u = Math.min(1, B.t), e = EOUT(u);
      B.x = B.fx + (xh - B.fx) * e; B.y = B.fy + (yh - CUP_D + BR + 0.02 - B.fy) * e;
      if (u >= 1) { B.mode = 'done'; return 'end'; }
      return null;
    }
    if (B.mode === 'fall') {
      B.vy -= GRAV * h; B.x += B.vx * h; B.y += B.vy * h; B.t += h; B.op = Math.max(0, 1 - B.t / 0.5);
      if (B.t >= 0.5) { B.mode = 'done'; return 'end'; }
      return null;
    }
    if (B.mode === 'fade') {
      B.t += h; B.op = Math.max(0, 1 - B.t / 0.4);
      if (B.t >= 0.4) { B.mode = 'done'; return 'end'; }
    }
    return null;
  }
  // the demonstration's drive over one 12 s cycle: hold 1.5 s at the start, 4 s there (eased), hold 2.5 s at
  // the scoring arrangement, 4 s back
  function demoP(t) { t = t % DEMO_T; return t < 1.5 ? 0 : t < 5.5 ? EASE((t - 1.5) / 4) : t < 8 ? 1 : 1 - EASE((t - 8) / 4); }
  function newBall(sc) { return { mode: 'chute', x: sc.xf, y: 10, cx: sc.xf, v: 0, vx: 0, vy: 0, s: 0, op: 1, t: 0, tested: false, rest: 0, d: null }; }
  // headless: release one ball on the fit of pts and run it to the end
  function simulate(sc, pts) {
    var L = fit(pts), B = newBall(sc), T = 0, out = { score: false, d: null, ev: [], t: 0 };
    if (!canRelease(L, sc)) { out.ev.push('wait'); return out; }
    release(B, sc);
    while (T < 60 && B.mode !== 'done') {
      var ev = stepBall(B, L, sc, STEP); T += STEP;
      if (ev && ev !== 'end') out.ev.push(ev);
      if (ev === 'score') out.score = true;
    }
    out.d = B.d; out.t = r2(T); return out;
  }
  function startPts(sc) { return sc.pegs.map(function (p) { return { x: p[0], y: p[1], k: p[2] }; }); }
  function solPts(sc) { var q = startPts(sc); for (var i in sc.sol) { q[i].x = sc.sol[i][0]; q[i].y = sc.sol[i][1]; } return q; }

  // ---- formatting --------------------------------------------------------------------------------------
  function fx(v, d) { var s = Math.abs(v).toFixed(d); return (v < 0 && +s !== 0 ? MINUS : '') + s; }
  function eqText(F) { return F.ok ? 'ŷ = ' + fx(F.a, 2) + ' ' + (F.b < 0 && +Math.abs(F.b).toFixed(2) !== 0 ? MINUS : '+') + ' ' + Math.abs(F.b).toFixed(2) + ' x' : 'ŷ: no single line'; }

  // ---- geometry per mode ------------------------------------------------------------------------------
  function geo(mode, W0, H0) {
    var G = { mode: mode, W: W0, H: H0 };
    if (mode === 'plate') {
      G.W = 1100; G.H = 620; G.bd = [16, 20, 580];
      G.eq = [640, 50, 22]; G.f1 = [640, 78]; G.f2 = [640, 99]; G.r2 = [640, 121]; G.mean = [770, 121];
      G.led = { x: 640, y: 160, dy: 21 }; G.sum = { x: 940, yb: 330, cap: 144 }; G.sumLab = [940, 354, 16];
      G.own = [940, 380]; G.ownNote = [940, 400];
      G.lev = { x: 654, y: 522, q: 60, num: 74, names: 90 }; G.levBox = [640, 446, 240, 152];
      G.cr = [[910, 466], [910, 508]]; G.count = [910, 552]; G.ownT = [910, 592];
    } else if (mode === 'margin') {
      var Sm = Math.max(40, Math.min(W0, H0) - 8); G.bd = [(W0 - Sm) / 2, (H0 - Sm) / 2, Sm]; G.bare = true;
    } else {
      var pk = mode === 'pocket', Sb = pk ? 370 : 380, dy = pk ? -8 : 0;
      if (pk) { G.W = 390; G.H = 616; } else { G.W = 400; G.H = 624; }
      G.bd = [10, pk ? 6 : 4, Sb];
      G.sum = { x: 14, yb: 556 + dy, cap: 0 }; G.sumLab = [14, 584 + dy, 16];
      G.eq = [190, 430 + dy, 18]; G.mean = [190, 452 + dy]; G.count = [190, 478 + dy];
      G.lev = { x: 290, y: 544 + dy, q: 54, num: 68, names: 0 }; G.levBox = [280, 494 + dy, 96, 100];
      G.cr = [[190, 520 + dy], [190, 560 + dy]]; G.name = [190, 604 + dy];
    }
    var b = G.bd; G.fx0 = b[0] + 4; G.fy0 = b[1] + 4; G.s = (b[2] - 8) / 11;
    if (G.sum && !G.sum.cap) G.sum.cap = 3.9 * G.s;
    G.pr = Math.max(3.2, 0.2 * G.s); G.tb = Math.max(2.5, 0.2 * G.s);
    G.X = function (x) { return G.fx0 + (x + 0.5) * G.s; };
    G.Y = function (y) { return G.fy0 + (10.5 - y) * G.s; };
    return G;
  }

  // ---- drawing helpers -------------------------------------------------------------------------------
  function circD(cx, cy, r) { return 'M' + r2(cx - r) + ',' + r2(cy) + 'a' + r2(r) + ',' + r2(r) + ' 0 1,0 ' + r2(2 * r) + ',0a' + r2(r) + ',' + r2(r) + ' 0 1,0 ' + r2(-2 * r) + ',0Z'; }
  function ring(cx, cy, r, key, k) { return H.pathD(H.wobble(H.arcPts(cx, cy, r, 0, 360, 6), 0.3, 40, 12, k, key), false); }
  function crescent(cx, cy, r0, r1) { return H.arcPts(cx, cy, r1, -25, 115, 10).concat(H.arcPts(cx, cy, r0, 115, -25, 10)); }
  function sw(px, k) { return r2(px / k * 1000) / 1000; }
  function polyD(pts, close) { return 'M' + pts.map(function (p) { return r2(p[0]) + ',' + r2(p[1]); }).join('L') + (close ? 'Z' : ''); }
  function coil(x, ya, yb, amp, lead0) {
    var s = yb >= ya ? 1 : -1, L = Math.abs(yb - ya), lead = Math.min(lead0, L * 0.2), z0 = ya + s * lead, Z = Math.max(0.6, L - 2 * lead);
    var n = Math.max(3, Math.min(9, Math.round(Z / 4))), pts = [[x, ya], [x, z0]], m;
    for (m = 0; m < n; m++) pts.push([x + (m % 2 ? -amp : amp), z0 + s * Z * (m + 0.5) / n]);
    pts.push([x, ya + s * (L - lead)], [x, yb]);
    var fd = '';
    for (m = 2; m < pts.length - 1; m++) if (pts[m][0] > pts[m - 1][0] + 0.01) fd += 'M' + r2(pts[m - 1][0]) + ',' + r2(pts[m - 1][1]) + 'L' + r2(pts[m][0]) + ',' + r2(pts[m][1]);
    return { z: polyD(pts), f: fd || 'M0,0' };
  }
  function setT(el, s) { if (el && el.__s !== s) { el.__s = s; el.textContent = s; } }
  function setA(el, a, v) { if (!el) return; var key = '__' + a; if (el[key] !== v) { el[key] = v; el.setAttribute(a, v); } }

  // ======================================================================================================
  function Fig(host, env) {
    var self = this;
    this.host = host; this.env = env || {}; this.id = 'rg' + (++uid); this.dead = false;
    this.reduced = !!(this.env.reduced != null ? this.env.reduced : H.reduced);
    this.inView = false; this.running = this.env.running ? !!this.env.running() : true; this.G = null; this.study = null;
    this.M = { scen: 0, pts: startPts(SCEN[0]), F: null, drag: -1, hover: -1, focus: -1, B: newBall(SCEN[0]), sunk: false, k: 0, m: 0,
      flag: 0, flagTo: 0, gap: null, note: null, noteAt: null, noteT: 0, feed: 0.6, time: 0, demo: !this.reduced, demoT: 0, glide: null,
      arm: DET[0], armTo: DET[0], crank: [0, 0], crankTo: [0, 0], flap: 0, own: false, ownY: null, ownDrag: -1, acc: 0, live: false, wantRel: false };
    this.M.F = fit(this.M.pts);
    var wrap = this.wrap = D.createElement('div'); wrap.className = 'nb-regress'; wrap.__fig = this; // test hook
    host.appendChild(wrap);
    this.controls();
    this.tick = function (now, dt) { return self.frame(now, dt); };
    this.io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { self.inView = e.isIntersecting; });
      if (self.inView && self.study && self.study.state === 'blank' && self.G) self.construct();
      self.kick();
    }, { threshold: [0] });
    this.io.observe(wrap);
    wrap.addEventListener('pointerdown', function () { self.touch(); }, true);
    wrap.addEventListener('keydown', function () { self.touch(); }, true);
  }
  var F = Fig.prototype;

  F.touch = function () { if (this.G && this.G.bare) return; if (this.env.interacted) this.env.interacted(); if (this.M.demo) this.setDemo(false); };
  F.kick = function () { if (this.dead || !this.study || this.study.state !== 'live') return; if (this.animates()) H.loop.add(this.tick); };
  F.animates = function () { return !this.dead && this.running && this.inView && !this.reduced && this.G && this.G.mode !== 'margin' && !D.hidden; };
  F.refit = function () { this.M.F = fit(this.M.pts); };

  // ---- layout (1.6) ------------------------------------------------------------------------------------
  F.layout = function (mode, animate) {
    if (this.dead) return;
    var u = (this.env.u && this.env.u()) || 1, w = this.host.clientWidth / u, h = this.host.clientHeight / u;
    var G = this.G = geo(mode, w, h), self = this;
    this.wrap.classList.toggle('rg-pocket', mode === 'pocket');
    this.wrap.style.height = mode === 'pocket' ? r2(G.H * u) + 'px' : '';
    this.wrap.setAttribute('data-mode', mode);
    if (!this.study) {
      this.def = { id: this.id, par: 'xMinYMin meet', viewBox: function () { return [0, 0, self.G.W, self.G.H]; },
        build: function (pen, st) { self.build(pen, st); }, live: function () { self.onLive(); } };
      this.study = H.study(this.wrap, this.def);
      this.wrap.insertBefore(this.study.svg, this.wrap.firstChild);
      this.study.svg.setAttribute('width', '100%'); this.study.svg.setAttribute('height', '100%');
    } else { this.study.measure(); this.study.rebuild(); }
    this.place();
    if (this.study.state === 'blank') { if (this.reduced || mode === 'margin') this.study.finish(); else if (this.inView) this.construct(); }
    else if (this.study.state === 'live') this.render();
    this.kick();
  };
  F.construct = function () {
    var st = this.study; if (st.state !== 'blank') return;
    if (this.reduced || this.G.mode === 'margin' || D.hidden) st.finish(); else st.play();
  };
  F.onLive = function () { this.M.live = true; this.place(); this.render(); this.kick(); };
  F.setRunning = function (on) { this.running = !!on; if (on) { this.M.acc = 0; this.kick(); } };
  F.setDemo = function (on) {
    var M = this.M; on = !!on && !this.reduced;
    if (on === M.demo) return;
    M.demo = on; M.demoT = 0;
    if (on) { var s0 = startPts(SCEN[M.scen]); M.glide = { f: M.pts.map(function (p) { return [p.x, p.y]; }), to: s0, t: 0 }; }
    else M.glide = null;
    this.syncCtl(); this.render(); this.kick();
  };
  F.anchor = function (name) {
    if (name !== 'equation' || !this.study || !this.study.parts.eq || !this.G || this.G.bare) return null;
    var e = this.study.parts.eq, len = 0; try { len = e.getComputedTextLength(); } catch (err) { len = 120; }
    return { x: this.G.eq[0] + len + 4, y: this.G.eq[1] - this.G.eq[2] * 0.32 };
  };
  F.destroy = function () {
    this.dead = true; if (this.io) this.io.disconnect();
    if (this.study) { var i = H.studies.indexOf(this.study); if (i >= 0) H.studies.splice(i, 1); }
    if (this.wrap.parentNode) this.wrap.parentNode.removeChild(this.wrap);
  };

  // ---- scenarios, reset, release -----------------------------------------------------------------------
  F.choose = function (idx) {
    var M = this.M, sc = SCEN[idx]; M.scen = idx; M.armTo = DET[idx]; if (!this.animates()) M.arm = M.armTo;
    this.resetBoard();
    this.buildPegCtl(); if (this.study) { this.study.rebuild(); }
    this.syncCtl(); this.render(); this.kick();
    if (this.env.announce) this.env.announce('Scenario ' + sc.num + ', ' + sc.name + '.');
  };
  F.resetBoard = function () {
    var M = this.M, sc = SCEN[M.scen];
    M.pts = startPts(sc); this.refit(); M.B = newBall(sc); M.sunk = false; M.k = 0; M.m = 0; M.flag = M.flagTo = 0;
    M.gap = null; M.note = null; M.feed = 0.6; M.wantRel = false; M.demoT = 0; M.glide = null; M.ownY = null; M.drag = -1;
    if (this.study && this.study.parts.tally) { var t = this.study.parts.tally; while (t.firstChild) t.removeChild(t.firstChild); }
  };
  F.reset = function () { this.M.crankTo[0] += 360; if (!this.animates()) this.M.crank[0] = this.M.crankTo[0]; this.resetBoard(); this.syncCtl(); this.render(); this.kick(); };
  F.releaseNow = function () {
    var M = this.M, sc = SCEN[M.scen];
    if (this.reduced) { this.instantBall(); return; }
    if (M.B.mode !== 'chute') return;
    if (canRelease(M.F, sc)) this.doRelease(); else { M.wantRel = true; this.note(M.F.ok ? 'the line is above the chute' : 'no line to land on', sc.xf, 9.2); }
    this.render(); this.kick();
  };
  F.doRelease = function () {
    var M = this.M; release(M.B, SCEN[M.scen]); M.m++; M.wantRel = false; M.sunk = false; M.flagTo = 0; M.flap = 1;
    if (!this.animates()) M.flag = 0;
  };
  // reduced motion: the release runs the same simulation to its end at once
  F.instantBall = function () {
    var M = this.M, sc = SCEN[M.scen], r = simulate(sc, M.pts);
    if (r.ev[0] === 'wait') { this.note(M.F.ok ? 'the line is above the chute' : 'no line to land on', sc.xf, 9.2); this.render(); return; }
    M.m++;
    if (r.score) { M.k++; M.sunk = true; M.flag = M.flagTo = 1; this.tallyAdd(); this.say(); }
    else { M.sunk = false; M.flag = M.flagTo = 0; }
    M.gap = r.d == null ? null : r.d;
    if (r.ev.indexOf('stall') >= 0) this.note('no slope, no roll', sc.xf + 1, 8.8);
    this.render();
  };
  F.say = function () { if (this.env.announce) this.env.announce('Ball in the cup. The line passes through the hole.'); };
  F.note = function (s, x, y) { this.M.note = s; this.M.noteAt = [x, y]; this.M.noteT = 2.4; };

  // ---- the frame loop: one fixed step at a time -------------------------------------------------------
  F.frame = function (now, dt) {
    if (!this.animates() || this.study.state !== 'live') return false;
    var M = this.M; M.acc += Math.min(64, dt) / 1000;
    var n = 0; while (M.acc >= STEP && n < 10) { M.acc -= STEP; this.simStep(STEP); n++; }
    if (n === 10) M.acc = 0;
    this.render();
    return true;
  };
  F._advance = function (secs) { for (var i = 0; i < Math.round(secs / STEP); i++) this.simStep(STEP); this.render(); };
  F.simStep = function (h) {
    var M = this.M, sc = SCEN[M.scen], B = M.B, i;
    M.time += h;
    // demonstration: 12 s there and back between the start and the verified scoring arrangement
    if (M.glide) {
      M.glide.t += h / 0.8; var gu = EASE(Math.min(1, M.glide.t));
      for (i = 0; i < M.pts.length; i++) { M.pts[i].x = M.glide.f[i][0] + (M.glide.to[i].x - M.glide.f[i][0]) * gu; M.pts[i].y = M.glide.f[i][1] + (M.glide.to[i].y - M.glide.f[i][1]) * gu; }
      this.refit(); if (M.glide.t >= 1) { M.glide = null; M.demoT = 0; }
    } else if (M.demo && M.drag < 0) {
      M.demoT += h; var p = demoP(M.demoT), s0 = sc.pegs;
      for (i in sc.sol) { M.pts[i].x = s0[i][0] + (sc.sol[i][0] - s0[i][0]) * p; M.pts[i].y = s0[i][1] + (sc.sol[i][1] - s0[i][1]) * p; }
      this.refit();
    }
    // feeding: a new ball 0.9 s after the last one ends
    if (B.mode === 'chute') {
      if (M.wantRel) { if (canRelease(M.F, sc)) this.doRelease(); }
      else if (M.feed > 0) { M.feed -= h; if (M.feed <= 0) { if (canRelease(M.F, sc)) this.doRelease(); else M.wantRel = true; } }
    } else {
      var ev = stepBall(B, M.F, sc, h);
      if (ev === 'score') { M.k++; M.gap = B.d; M.flagTo = 1; this.tallyAdd(); this.say(); }
      else if (ev === 'over' || ev === 'under' || ev === 'knock') M.gap = B.d;
      else if (ev === 'stall') this.note('no slope, no roll', B.x, B.y + 0.55);
      else if (ev === 'end') { M.sunk = B.d != null && Math.abs(B.d) <= TOL && B.tested && B.op > 0; M.B = newBall(sc); M.B.op = 0; M.feed = FEED; }
    }
    if (M.B.mode === 'chute' && M.B.op < 1) M.B.op = Math.min(1, M.B.op + h / 0.25);
    if (M.flap > 0) M.flap = Math.max(0, M.flap - h / 0.45);
    if (M.noteT > 0) { M.noteT -= h; if (M.noteT <= 0) M.note = null; }
    M.flag += (M.flagTo - M.flag) * Math.min(1, h / 0.09);
    M.arm += (M.armTo - M.arm) * Math.min(1, h / 0.06);
    for (i = 0; i < 2; i++) M.crank[i] += (M.crankTo[i] - M.crank[i]) * Math.min(1, h / 0.12);
    if (M.demo) { M.crank[1] += h * 90; M.crankTo[1] = M.crank[1]; }
  };
  F.tallyAdd = function () {
    var M = this.M, P = this.study && this.study.parts; if (!P || !P.tally) return;
    if (M.k > 0 && (M.k - 1) % 15 === 0 && M.k > 1) { while (P.tally.firstChild) P.tally.removeChild(P.tally.firstChild); }
    var e = this.tallyStroke(P, (M.k - 1) % 15, true);
    if (e && e.animate && this.animates()) e.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 220, easing: 'cubic-bezier(.35,0,.25,1)', fill: 'both' });
  };
  F.tallyStroke = function (P, j, anim) {
    var G = P.G, sc = SCEN[this.M.scen], s = G.s, grp = Math.floor(j / 5), q = j % 5;
    var x0 = P.tallyX + grp * 0.62 * s, yb = G.Y(sc.cup[1] - CUP_D), yt = yb - 0.3 * s, dx = 0.1 * s, pts;
    pts = q < 4 ? [[x0 + dx * q, yb], [x0 + dx * q + 0.02 * s, yt]] : [[x0 - 0.06 * s, yb - 0.04 * s], [x0 + 3 * dx + 0.06 * s, yt + 0.04 * s]];
    if (!P.rail.__on) { P.rail.__on = 1; P.rail.setAttribute('display', 'inline'); }
    return H.el('path', { d: H.pathD(H.wobble(pts, 0.3, 40, 12, P.k, this.id + ':t' + j)), fill: 'none', stroke: C.ink, 'stroke-width': sw(1.2, P.k), 'stroke-linecap': 'round', pathLength: anim ? 1 : null, 'stroke-dasharray': anim ? '1 1' : null }, P.tally);
  };

  // ---- native controls (hidden, focusable) over the drawn ones -----------------------------------------
  F.controls = function () {
    var self = this, M = this.M, w = D.createElement('div'); w.className = 'rg-ctl';
    var h = '<div class="rg-pegs"></div>';
    h += '<button type="button" class="rg-hit rg-chute" aria-label="Release ball"></button>';
    h += '<fieldset class="rg-lev"><legend class="rg-sr">Scenario</legend>';
    SCEN.forEach(function (sc, j) { h += '<label class="rg-det"><input type="radio" name="' + self.id + '-sc" value="' + j + '"' + (j ? '' : ' checked') + '><span class="rg-sr">' + sc.num + '. ' + sc.name + '</span></label>'; });
    h += '</fieldset><div class="rg-hit rg-levhit" aria-hidden="true"></div>';
    h += '<button type="button" class="rg-hit rg-crank rg-reset">reset<span class="rg-sr"> the scenario</span></button>';
    h += '<button type="button" class="rg-hit rg-crank rg-demo" aria-pressed="true">demonstrate</button>';
    h += '<button type="button" class="rg-hit rg-owntog" aria-pressed="false">a line of your own</button>';
    h += '<button type="button" class="rg-hit rg-hand" aria-label="Your line, left handle. Arrow keys move it."></button><button type="button" class="rg-hit rg-hand" aria-label="Your line, right handle. Arrow keys move it."></button>';
    h += '<p class="rg-sr rg-sum"></p>';
    w.innerHTML = h; this.wrap.appendChild(w); this.ctl = w;
    this.pegBox = w.querySelector('.rg-pegs'); this.chute = w.querySelector('.rg-chute'); this.lev = w.querySelector('.rg-lev');
    this.levHit = w.querySelector('.rg-levhit'); this.btnReset = w.querySelector('.rg-reset'); this.btnDemo = w.querySelector('.rg-demo');
    this.btnOwn = w.querySelector('.rg-owntog'); this.hands = [].slice.call(w.querySelectorAll('.rg-hand')); this.sum = w.querySelector('.rg-sum');
    this.radios = [].slice.call(w.querySelectorAll('.rg-lev input'));
    this.chute.addEventListener('click', function () { self.releaseNow(); });
    this.btnReset.addEventListener('click', function () { self.reset(); });
    this.btnDemo.addEventListener('click', function () { self.setDemo(true); });
    this.btnOwn.addEventListener('click', function () { M.own = !M.own; if (M.own && !M.ownY) M.ownY = self.ownStart(); self.syncCtl(); self.place(); self.render(); });
    this.radios.forEach(function (r, j) { r.addEventListener('change', function () { if (r.checked && j !== M.scen) self.choose(j); }); });
    // the lever: one large hit area; the pointer's angle about the pivot picks the nearest detent
    var lv = this.levHit, levOn = false;
    function detAt(e) {
      var G = self.G, rc = self.wrap.getBoundingClientRect(), kk = rc.width / G.W, x = (e.clientX - rc.left) / kk - G.lev.x, y = (e.clientY - rc.top) / kk - G.lev.y;
      var a = Math.atan2(y, x) * R2D, best = 0; for (var j = 1; j < 4; j++) if (Math.abs(DET[j] - a) < Math.abs(DET[best] - a)) best = j; return best;
    }
    lv.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button !== 0) return; e.preventDefault(); lv.setPointerCapture(e.pointerId); levOn = true; M.armTo = DET[detAt(e)]; if (!self.animates()) M.arm = M.armTo; self.render(); self.kick(); });
    lv.addEventListener('pointermove', function (e) { if (!levOn) return; M.armTo = DET[detAt(e)]; if (!self.animates()) M.arm = M.armTo; self.render(); self.kick(); });
    function levUp(e) { if (!levOn) return; levOn = false; var j = detAt(e); self.radios[j].checked = true; if (j !== M.scen) self.choose(j); else { M.armTo = DET[j]; self.render(); self.kick(); } }
    lv.addEventListener('pointerup', levUp); lv.addEventListener('pointercancel', function () { levOn = false; M.armTo = DET[M.scen]; self.kick(); });
    // the two handles of "a line of your own" (plate only)
    this.hands.forEach(function (b, j) {
      var on = false, rc = null, kk = 1;
      b.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button !== 0) return; e.preventDefault(); b.setPointerCapture(e.pointerId); on = true; rc = self.wrap.getBoundingClientRect(); kk = rc.width / self.G.W; b.focus({ preventScroll: true }); M.ownDrag = j; });
      b.addEventListener('pointermove', function (e) { if (!on) return; var G = self.G, yu = (e.clientY - rc.top) / kk; M.ownY[j] = Math.max(0, Math.min(10, 10.5 - (yu - G.fy0) / G.s)); self.render(); });
      function up() { on = false; M.ownDrag = -1; self.render(); }
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('keydown', function (e) { var d = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0; if (!d) return; e.preventDefault(); M.ownY[j] = Math.max(0, Math.min(10, M.ownY[j] + d * (e.shiftKey ? 0.5 : 0.1))); self.render(); });
    });
    this.buildPegCtl();
  };
  F.ownStart = function () { var Fo = this.M.F; if (!Fo.ok) return [5, 5]; return [Math.max(0, Math.min(10, Fo.a + Fo.b * 1 + 1.2)), Math.max(0, Math.min(10, Fo.a + Fo.b * 9 - 0.8))]; };
  F.buildPegCtl = function () {
    var self = this, M = this.M, box = this.pegBox; while (box.firstChild) box.removeChild(box.firstChild);
    this.pegBtns = M.pts.map(function (p, i) {
      var b;
      if (p.k === 'p') { b = D.createElement('span'); b.className = 'rg-hit rg-peg rg-pin'; b.setAttribute('aria-hidden', 'true'); }
      else { b = D.createElement('button'); b.type = 'button'; b.className = 'rg-hit rg-peg' + (p.k === 's' ? ' rg-side' : ''); }
      box.appendChild(b);
      b.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { M.hover = i; self.render(); } });
      b.addEventListener('pointerleave', function () { if (M.hover === i) { M.hover = -1; self.render(); } });
      if (p.k === 'p') return b;
      var rc = null, kk = 1, off = [0, 0];
      b.addEventListener('focus', function () { M.focus = i; self.render(); });
      b.addEventListener('blur', function () { if (M.focus === i) { M.focus = -1; self.render(); } });
      b.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('rg-drag'); b.focus({ preventScroll: true });
        if (self.study.state !== 'live') self.study.finish();
        rc = self.wrap.getBoundingClientRect(); kk = rc.width / self.G.W; M.drag = i; M.glide = null;
        var G = self.G, ux = (e.clientX - rc.left) / kk, uy = (e.clientY - rc.top) / kk;
        off = [ux - G.X(M.pts[i].x), uy - G.Y(M.pts[i].y)]; self.render();
      });
      b.addEventListener('pointermove', function (e) {
        if (M.drag !== i) return;
        var G = self.G, ux = (e.clientX - rc.left) / kk - off[0], uy = (e.clientY - rc.top) / kk - off[1];
        self.movePeg(i, (ux - G.fx0) / G.s - 0.5, 10.5 - (uy - G.fy0) / G.s);
      });
      function up() { if (M.drag !== i) return; M.drag = -1; b.classList.remove('rg-drag'); self.label(i); self.render(); }
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('keydown', function (e) {
        var st = e.shiftKey ? 0.5 : 0.1, dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -st; else if (e.key === 'ArrowRight') dx = st; else if (e.key === 'ArrowUp') dy = st; else if (e.key === 'ArrowDown') dy = -st; else return;
        e.preventDefault(); M.glide = null;
        self.movePeg(i, M.pts[i].x + dx, M.pts[i].y + dy); self.label(i);
      });
      return b;
    });
    this.pegBtns.forEach(function (b, i) { self.label(i); });
  };
  F.movePeg = function (i, x, y) {
    var M = this.M, p = M.pts[i]; if (p.k === 'p') return;
    p.x = Math.round(Math.max(LO, Math.min(HI, x)) * 1e6) / 1e6;
    if (p.k === 'f') p.y = Math.round(Math.max(LO, Math.min(HI, y)) * 1e6) / 1e6;
    this.refit(); this.render(); this.kick(); // the bar is the new fit on this same frame
  };
  F.label = function (i) {
    var p = this.M.pts[i], b = this.pegBtns && this.pegBtns[i]; if (!b || p.k === 'p') return;
    b.setAttribute('aria-label', 'Observation ' + (i + 1) + ', x ' + p.x.toFixed(1) + ', y ' + p.y.toFixed(1) + '. ' + (p.k === 's' ? 'Left and right arrow keys move it.' : 'Arrow keys move it.'));
  };
  F.syncCtl = function () {
    var M = this.M, G = this.G;
    this.radios.forEach(function (r, j) { r.checked = j === M.scen; });
    this.btnDemo.setAttribute('aria-pressed', M.demo ? 'true' : 'false');
    this.btnOwn.setAttribute('aria-pressed', M.own ? 'true' : 'false');
    var plate = G && G.mode === 'plate';
    this.btnOwn.hidden = !plate; this.hands.forEach(function (b) { b.hidden = !(plate && M.own); });
    var bare = !G || !!G.bare;
    this.ctl.classList.toggle('rg-bare', bare);
    this.chute.hidden = bare; this.btnReset.hidden = bare; this.btnDemo.hidden = bare || this.reduced; this.lev.hidden = bare; this.levHit.hidden = bare;
    this.pegBtns.forEach(function (b) { b.hidden = bare; });
    if (this.reduced) this.btnDemo.hidden = true;
  };
  // place hit areas (px) from unit coordinates; once per layout, never per frame
  F.place = function () {
    var G = this.G, st = this.study; if (!G || !st) return;
    var k = st.k, self = this, M = this.M;
    function at(el, x, y, w, h) { el.style.left = r2(x * k) + 'px'; el.style.top = r2(y * k) + 'px'; if (w != null) { el.style.width = 'max(44px,' + r2(w * k) + 'px)'; el.style.height = 'max(44px,' + r2(h * k) + 'px)'; } }
    this.ctl.style.setProperty('--fr', r2(2 * (G.pr * k + 3 + 2)) + 'px');
    this.syncCtl();
    if (G.bare) return;
    var sc = SCEN[M.scen];
    at(this.chute, G.X(sc.xf), G.Y(10), G.s, G.s);
    var lb = G.levBox; at(this.levHit, lb[0] + lb[2] / 2, lb[1] + lb[3] / 2, lb[2], lb[3]);
    [].forEach.call(this.lev.querySelectorAll('.rg-det'), function (lab, j) { var a = DET[j] / R2D; at(lab, G.lev.x + G.lev.num * Math.cos(a), G.lev.y + G.lev.num * Math.sin(a)); });
    // cranks: glyph at (x + 6, y - 5), word after it; reset's area sits a little high, demonstrate's a little low, so they do not overlap
    at(this.btnReset, G.cr[0][0] + 42, G.cr[0][1] - 12, 96, 40);
    at(this.btnDemo, G.cr[1][0] + 42, G.cr[1][1] - 1, 96, 40);
    if (G.mode === 'plate') at(this.btnOwn, G.ownT[0] + 66, G.ownT[1] - 5, 140, 34);
    this.hands.forEach(function (b, j) { b.style.left = r2(G.X(j ? 9 : 1) * k) + 'px'; b.style.top = '0px'; });
    this.render();
  };

  // ---- build: the construction (2.8, about 2.2 s), silverpoint then ink ---------------------------------
  F.build = function (pen, st) {
    if (this.dead || !this.G) return;
    var self = this, M = this.M, G = this.G, P = st.parts, k = st.k, L = st.layers, sc = SCEN[M.scen], s = G.s, bare = G.bare;
    P.G = G; P.k = k;
    var X = G.X, Y = G.Y, b = G.bd, x0 = b[0], y0 = b[1], x1 = b[0] + b[2], y1 = b[1] + b[2], band = bare ? 3 : 6, sid = st.id + G.mode;
    var fs = function (u) { return r2(Math.max(u, 11 / k)); };
    var defs = H.el('defs', null, st.svg); st.svg.insertBefore(defs, st.svg.firstChild);
    H.el('rect', { x: G.fx0, y: G.fy0, width: 11 * s, height: 11 * s }, H.el('clipPath', { id: sid + '-face' }, defs));
    var pat = H.el('pattern', { id: sid + '-sq', patternUnits: 'userSpaceOnUse', width: r2(4.2 / k), height: r2(4.2 / k), patternTransform: 'rotate(52)' }, defs);
    H.el('path', { d: 'M0,' + r2(2.1 / k) + 'H' + r2(4.2 / k), stroke: C.silver, 'stroke-width': sw(0.7, k) }, pat);
    var pat2 = H.el('pattern', { id: sid + '-ss', patternUnits: 'userSpaceOnUse', width: r2(3.4 / k), height: r2(3.4 / k), patternTransform: 'rotate(52)' }, defs);
    H.el('path', { d: 'M0,' + r2(1.7 / k) + 'H' + r2(3.4 / k), stroke: C.ink2, 'stroke-width': sw(0.6, k), 'stroke-opacity': 0.75 }, pat2);
    var pat3 = H.el('pattern', { id: sid + '-br', patternUnits: 'userSpaceOnUse', width: r2(2.2 / k), height: r2(2.2 / k), patternTransform: 'rotate(52)' }, defs);
    H.el('path', { d: 'M0,' + r2(1.1 / k) + 'H' + r2(2.2 / k), stroke: C.ink, 'stroke-width': sw(0.5, k), 'stroke-opacity': 0.8 }, pat3);
    var face = 'url(#' + sid + '-face)';
    var gGrid = H.el('g', null, L.silver), gSq = H.el('g', { 'clip-path': face }, L.silver), gCross = H.el('g', { 'clip-path': face }, L.silver);
    var gBoard = H.el('g', null, L.ink), gSpr = H.el('g', { 'clip-path': face }, L.ink), gOwn = H.el('g', { 'clip-path': face }, L.ink);
    var gBarC = H.el('g', { 'clip-path': face }, L.ink), gBar = H.el('g', null, gBarC), gKnife = H.el('g', null, L.ink);
    var gPot = H.el('g', null, L.ink), gPeg = H.el('g', null, L.ink), gChute = H.el('g', null, L.ink), gBall = H.el('g', null, L.ink);
    var gRead = H.el('g', null, L.ink), gText = L.text;
    P.sqPat = 'url(#' + sid + '-sq)'; P.ssPat = 'url(#' + sid + '-ss)';
    function text(x, y, str, size, o) {
      o = o || {};
      var e = pen.add('text', { x: r2(x), y: r2(y), 'font-size': fs(size), 'font-style': o.it ? 'italic' : null, 'font-family': FONT, fill: o.fill || C.ink,
        'text-anchor': o.anchor || 'start', 'dominant-baseline': o.mid ? 'central' : null, 'class': null }, o.g || gText, 'hf', o.t != null ? o.t : pen.t, 160);
      if (o.halo) { e.setAttribute('stroke', C.paper); e.setAttribute('stroke-width', sw(3, k)); e.setAttribute('paint-order', 'stroke'); e.setAttribute('stroke-linejoin', 'round'); }
      e.textContent = str; return e;
    }

    // ---- 0-450 the board: slab, hatched edge shadow, screws ----
    pen.step(0, 450, function () {
      pen.rule([x0, y0], [x1, y0]); pen.rule([x1, y0], [x1, y1]); pen.rule([x0, y1], [x1, y1]); pen.rule([x0, y0], [x0, y1]);
      pen.ink([[x0, y1], [x0, y0], [x1, y0]], { g: gBoard, over: true, w: 1.1 });
      pen.ink([[x1, y0], [x1, y1], [x0, y1]], { g: gBoard, over: true, w: 'heavy' });
      pen.ink([[x1, y0], [x1 + band, y0 + band], [x1 + band, y1 + band], [x0 + band, y1 + band], [x0, y1]], { g: gBoard, w: 'fine' });
      pen.hatch([[x1, y0], [x1 + band, y0 + band], [x1 + band, y1 + band], [x0 + band, y1 + band], [x0, y1], [x1, y1]], { g: gBoard, spacing: 2.1 });
      if (!bare) [[x0 + 8, y0 + 8], [x1 - 8, y0 + 8], [x0 + 8, y1 - 8], [x1 - 8, y1 - 8]].forEach(function (c, q) {
        pen.ink(H.arcPts(c[0], c[1], 2.8, 0, 360, 24), { g: gBoard, closed: true, split: false, w: 'fine' });
        var a = (20 + 47 * q) / R2D; pen.ink([[c[0] - 2.5 * Math.cos(a), c[1] - 2.5 * Math.sin(a)], [c[0] + 2.5 * Math.cos(a), c[1] + 2.5 * Math.sin(a)]], { g: gBoard, w: 'fine' });
      });
    });
    // ---- 150-700 the silverpoint grid, every 1 unit, heavier at 0, 5, 10 ----
    pen.step(150, 550, function () {
      for (var j = 0; j <= 10; j++) {
        var hv = j % 5 === 0, w = hv ? 0.8 : 0.4, op = hv ? 0.95 : 0.7;
        pen.rule([X(j), Y(-0.5)], [X(j), Y(10.5)], { flush: true, w: w, op: op, g: gGrid });
        pen.rule([X(-0.5), Y(j)], [X(10.5), Y(j)], { flush: true, w: w, op: op, g: gGrid });
      }
    });
    if (!bare) [0, 5, 10].forEach(function (v) {
      text(X(v), Y(-0.5) - 3, String(v), 12, { anchor: 'middle', fill: C.ink2, t: 700 });
      text(X(-0.5) + 4, Y(v), String(v), 12, { anchor: 'start', fill: C.ink2, mid: true, t: 700 });
    });

    // ---- 1150-1450 the cup (a pot with a flag), the cross-hair, the chute ----
    var xh = sc.cup[0], yh = sc.cup[1], hw = CUP_HW * s, dp = CUP_D * s, wt = Math.max(1.2, 0.06 * s), px = X(xh), py = Y(yh);
    P.potX = px; P.potY = py;
    pen.step(1150, 300, function () {
      var cr = 0.95 * s;
      pen.add('path', { d: 'M' + r2(px - cr) + ',' + r2(py) + 'H' + r2(px + cr) + 'M' + r2(px) + ',' + r2(py - cr) + 'V' + r2(py + cr), stroke: C.sanguine, 'stroke-width': sw(0.7, k), 'stroke-opacity': 0.55, fill: 'none', 'stroke-dasharray': r2(3 / k) + ' ' + r2(2 / k) }, gCross, 'hf', pen.t, 200);
      var inner = [[px - hw, py], [px - hw + 0.03 * s, py + dp], [px + hw - 0.03 * s, py + dp], [px + hw, py]];
      var outer = [[px - hw - wt - 0.1 * s, py], [px - hw - wt, py + 0.02 * s], [px - hw - wt + 0.04 * s, py + dp + wt], [px + hw + wt - 0.04 * s, py + dp + wt], [px + hw + wt, py + 0.02 * s], [px + hw + wt + 0.1 * s, py]];
      pen.fill(polyD(outer, true), { fill: C.paper }, { g: gPot });
      pen.hatch([[px + hw, py + 0.08 * s], [px + hw + wt, py + 0.08 * s], [px + hw + wt - 0.04 * s, py + dp + wt], [px - hw - wt + 0.04 * s, py + dp + wt], [px - hw + 0.03 * s, py + dp], [px + hw - 0.03 * s, py + dp]], { g: gPot, spacing: 1.6, w: 0.5 });
      pen.ink(outer, { g: gPot, w: 1.35, split: false });
      pen.ink(inner, { g: gPot, w: 0.9, split: false });
      // the staff, right of the rim, and its rail of tally strokes (drawn once the first stroke exists)
      pen.ink([[px + hw + wt + 0.16 * s, py + 0.02 * s], [px + hw + wt + 0.16 * s, py - 1.3 * s]], { g: gPot, w: 1.1, split: false });
    });
    P.flag = pen.add('path', { d: polyD([[0, 0], [0.46 * s, 0.13 * s], [0, 0.27 * s]], true), fill: C.sanguine, stroke: C.sanguineDeep, 'stroke-width': sw(0.8, k), 'stroke-linejoin': 'round' }, gPot, 'hf', 1400, 160);
    P.flagX = px + hw + wt + 0.16 * s; P.flagY0 = py - 0.62 * s; P.flagY1 = py - 1.3 * s;
    // the tally sits beside the pot on the side with more room; the gap letter goes under the pot
    var tw = 3 * 0.62 * s, ry = Y(yh - CUP_D) + 0.04 * s, rx0 = xh > 5 ? px - hw - wt - 0.35 * s - tw : px + hw + wt + 0.5 * s;
    P.tallyX = rx0 + 0.1 * s;
    P.rail = H.el('path', { d: 'M' + r2(rx0) + ',' + r2(ry) + 'H' + r2(rx0 + tw), stroke: C.ink, 'stroke-width': sw(0.7, k), 'stroke-opacity': 0.8, fill: 'none', display: 'none' }, gPot);
    P.tally = H.el('g', null, gPot);
    for (var tj = 0; tj < (M.k ? ((M.k - 1) % 15) + 1 : 0); tj++) this.tallyStroke(P, tj, false);
    // chute: a small cup on the top edge at xf with a flap under the ball
    var cx = X(sc.xf), cyb = Y(10 - BR - 0.05), cw = (BR + 0.09) * s, ctop = Y(10.5);
    pen.step(1250, 250, function () {
      pen.fill(polyD([[cx - cw - 0.1 * s, ctop], [cx - cw, cyb], [cx + cw, cyb], [cx + cw + 0.1 * s, ctop]], true), { fill: C.paper }, { g: gChute });
      pen.ink([[cx - cw - 0.1 * s, ctop], [cx - cw, cyb]], { g: gChute, w: 1.1 });
      pen.ink([[cx + cw + 0.1 * s, ctop], [cx + cw, cyb]], { g: gChute, w: 'heavy' });
    });
    P.flap = pen.add('path', { d: 'M0,0H' + r2(2 * cw), stroke: C.ink, 'stroke-width': sw(1.2, k), 'stroke-linecap': 'round', fill: 'none' }, gChute, 'hf', 1500, 120);
    P.flapAt = [cx - cw, cyb];

    // ---- 700-1150 pegs, dropped in left to right ----
    var order = M.pts.map(function (p, i) { return i; }).sort(function (a, c) { return M.pts[a].x - M.pts[c].x; }), pr = G.pr;
    P.peg = []; P.lift = []; P.sring = []; P.fring = [];
    M.pts.forEach(function (p, i) {
      var outer = H.el('g', null, gPeg), lift = H.el('g', null, outer), tp = 700 + 55 * order.indexOf(i);
      var inner = pen.add('g', null, lift, 'hz', tp, 140);
      if (p.k === 's') {
        var sl = 2.6 * pr;
        H.el('path', { d: 'M' + r2(-sl) + ',' + r2(pr + 2) + 'H' + r2(sl), stroke: C.ink, 'stroke-width': sw(3.2, k), 'stroke-linecap': 'round', 'stroke-opacity': 0.85, fill: 'none' }, inner);
        H.el('path', { d: 'M' + r2(-sl + 1) + ',' + r2(pr + 2) + 'H' + r2(sl - 1), stroke: C.paper, 'stroke-width': sw(1.4, k), 'stroke-linecap': 'round', fill: 'none' }, inner);
      }
      if (p.k === 'p') {
        H.el('path', { d: circD(0, 0, pr * 0.85), fill: C.ink }, inner);
        var c2 = pr * 0.42; H.el('path', { d: 'M' + r2(-c2) + ',' + r2(-c2) + 'L' + r2(c2) + ',' + r2(c2) + 'M' + r2(c2) + ',' + r2(-c2) + 'L' + r2(-c2) + ',' + r2(c2), stroke: C.paper, 'stroke-width': sw(1.1, k), 'stroke-linecap': 'round' }, inner);
      } else {
        pen.t = tp + 50; pen.hatch(H.arcPts(pr * 0.3, pr * 0.3, pr, -45, 135, 9).concat(H.arcPts(0, 0, pr, 135, -45, 9)), { g: inner, spacing: 1.5, w: 0.45 });
        H.el('path', { d: circD(0, 0, pr), fill: C.paper }, inner);
        H.el('path', { d: ring(0, 0, pr, st.id + ':peg' + i, k), fill: 'none', stroke: C.ink, 'stroke-width': sw(1.3, k) }, inner);
        H.el('path', { d: ring(0, 0, pr * 0.58, st.id + ':pin' + i, k), fill: 'none', stroke: C.ink, 'stroke-width': sw(0.6, k), 'stroke-opacity': 0.7 }, inner);
        H.el('path', { d: circD(0, 0, Math.max(0.9, pr * 0.2)), fill: C.ink }, inner);
        var kd = ''; [45, 135, 225, 315].forEach(function (a) { var c = Math.cos(a / R2D), sn = Math.sin(a / R2D); kd += 'M' + r2(c * pr * 0.62) + ',' + r2(sn * pr * 0.62) + 'L' + r2(c * pr * 0.86) + ',' + r2(sn * pr * 0.86); });
        H.el('path', { d: kd, fill: 'none', stroke: C.ink, 'stroke-width': sw(0.8, k), 'stroke-linecap': 'round', 'stroke-opacity': 0.85 }, inner);
      }
      P.sring.push(H.el('path', { d: ring(0, 0, pr, st.id + ':peg' + i, k), fill: 'none', stroke: C.sanguine, 'stroke-width': sw(1.9, k), display: 'none' }, inner));
      P.peg.push(outer); P.lift.push(lift);
    });

    // ---- 1050-1500 springs, then the squares on the residuals ----
    P.sz = []; P.sf = []; P.sq = [];
    M.pts.forEach(function (p, i) {
      var r = order.indexOf(i);
      P.sq.push(pen.add('path', { fill: P.sqPat, stroke: C.silver, 'stroke-width': sw(0.6, k), 'stroke-opacity': 0.95 }, gSq, 'hf', 1250 + 45 * r, 180));
      P.sz.push(pen.add('path', { fill: 'none', stroke: C.ink, 'stroke-width': sw(0.75, k), 'stroke-opacity': 0.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, gSpr, 'hs', 1050 + 60 * r, 160));
      P.sf.push(pen.add('path', { fill: 'none', stroke: C.ink, 'stroke-width': sw(1, k), 'stroke-opacity': 0.9, 'stroke-linecap': 'round' }, gSpr, 'hf', 1150 + 60 * r, 80));
    });

    // ---- 1550-1950 the bar, ruled last: its top edge is exactly the fitted line ----
    var Lh = 11 * s * 1.5, tb = G.tb;
    P.bar = gBar;
    pen.step(1550, 380, function () {
      pen.rule([-Lh, 0], [Lh, 0], { g: H.el('g', null, gBar), flush: true });
      pen.fill('M' + r2(-Lh) + ',0H' + r2(Lh) + 'V' + r2(tb) + 'H' + r2(-Lh) + 'Z', { fill: C.paper }, { g: gBar });
      pen.fill('M' + r2(-Lh) + ',' + r2(tb * 0.42) + 'H' + r2(Lh) + 'V' + r2(tb) + 'H' + r2(-Lh) + 'Z', { fill: 'url(#' + sid + '-br)' }, { g: gBar });
      pen.ink([[-Lh, 0], [Lh, 0]], { g: gBar, over: true, split: false, w: 1.15 });
      pen.ink([[-Lh, tb * 0.42], [Lh, tb * 0.42]], { g: gBar, over: true, split: false, w: 0.45 });
      pen.ink([[-Lh, tb], [Lh, tb]], { g: gBar, over: true, split: false, w: 'heavy' });
    });
    // the knife-edge fulcrum under the mean point, and the sanguine dot on it
    var kn = Math.max(0.5, s / 34), ka = 0, kb = 16 * kn, kw = 8 * kn;
    P.knife = pen.add('g', null, gKnife, 'hf', 1880, 160);
    H.el('path', { d: polyD([[0, ka], [kw, kb], [-kw, kb]], true), fill: C.paper, stroke: C.ink, 'stroke-width': sw(1.1, k), 'stroke-linejoin': 'round' }, P.knife);
    H.el('path', { d: polyD([[0.5 * kn, 3 * kn], [kw - 1.5 * kn, kb - 0.8 * kn], [0.8 * kn, kb - 0.8 * kn]], true), fill: P.sqPat.replace('-sq', '-br') }, P.knife);
    H.el('path', { d: 'M' + r2(-14 * kn) + ',' + r2(kb + 0.6) + 'H' + r2(14 * kn), stroke: C.ink, 'stroke-width': sw(1.7, k), 'stroke-linecap': 'round' }, P.knife);
    P.dot = pen.add('path', { d: circD(0, 0, Math.max(1.6, 0.085 * s)), fill: C.sanguine }, gKnife, 'hf', 1930, 120);
    P.noLine = text(X(5), Y(9.15), 'all x equal: no single line fits', bare ? 12 : 14, { anchor: 'middle', it: true, fill: C.sanguineDeep, halo: true, t: 1950 });

    // ---- a line of your own (plate only): silver, never touched by the ball ----
    if (G.mode === 'plate') {
      P.own = H.el('path', { fill: 'none', stroke: C.silver, 'stroke-width': sw(1.6, k), 'stroke-dasharray': r2(7 / k) + ' ' + r2(3 / k) }, gOwn);
      P.ownH = [0, 1].map(function () { var g = H.el('g', null, L.ink); H.el('path', { d: polyD([[0, -7], [6, 0], [0, 7], [-6, 0]], true), fill: C.paper, stroke: C.silver, 'stroke-width': sw(1.4, k) }, g); H.el('path', { d: circD(0, 0, 1.4), fill: C.ink2 }, g); return g; });
    }

    // ---- the ball (and the one that is sunk in the cup) ----
    function ballG(parent, t) {
      var o = H.el('g', null, parent), g = pen.add('g', null, o, 'hf', t, 160), br = BR * s;
      H.el('path', { d: circD(0, 0, br), fill: C.paper }, g);
      H.el('path', { d: polyD(crescent(0, 0, br * 0.55, br * 0.93), true), fill: C.ink2, 'fill-opacity': 0.7 }, g);
      H.el('path', { d: circD(0, 0, br), fill: 'none', stroke: C.ink, 'stroke-width': sw(1.4, k) }, g);
      var mk = H.el('path', { d: 'M' + r2(-br * 0.5) + ',0L' + r2(-br * 0.2) + ',0', stroke: C.ink, 'stroke-width': sw(1, k), 'stroke-linecap': 'round', 'stroke-opacity': 0.8 }, g);
      return { g: o, mk: mk };
    }
    var sk = ballG(gPot, 2100); P.sunk = sk.g; P.sunk.setAttribute('transform', 'translate(' + r2(px) + ' ' + r2(Y(yh - CUP_D + BR + 0.02)) + ')');
    var bl = ballG(gBall, 2100); P.ball = bl.g; P.mark = bl.mk;
    P.potBox = [px - hw - wt - 0.1 * s, py - 1.3 * s, px + hw + wt + 0.16 * s + 0.46 * s, py + dp + wt];
    P.tallyBox = [rx0, ry - 0.36 * s, rx0 + tw, ry + 0.06 * s];
    P.gapP = pen.add('rect', { fill: C.paper, 'fill-opacity': 0.94, width: 0, height: 0 }, gText, 'hf', 2100, 160);
    P.gap = text(px, py, '', 13, { anchor: 'middle', mid: true, it: true, fill: C.sanguineDeep, t: 2100 });
    P.note = text(0, 0, '', 12.5, { anchor: 'middle', it: true, fill: C.ink2, halo: true, t: 2100 });
    P.hovP = pen.add('rect', { fill: C.paper, 'fill-opacity': 0.94, width: 0, height: 0, display: 'none' }, gText, 'hf', 0, 1);
    P.hov = text(0, 0, '', 12.5, { anchor: 'middle', mid: true, fill: C.ink, t: 0 });

    if (bare) { this.render(st); return; }

    // ---- 1900-2200 readouts, the summed square, lever and cranks ----
    var T0 = 1980;
    P.eq = text(G.eq[0], G.eq[1], '', G.eq[2], { t: T0 });
    P.mean = text(G.mean[0], G.mean[1], '', 13, { fill: C.ink2, t: T0 + 40 });
    P.count = text(G.count[0], G.count[1], '', 13, { t: T0 + 80 });
    P.ss = pen.add('path', { fill: P.ssPat, stroke: C.ink, 'stroke-width': sw(0.9, k), 'stroke-linejoin': 'round' }, gRead, 'hf', 1950, 200);
    P.ssLab = text(G.sumLab[0], G.sumLab[1], '', G.sumLab[2], { t: T0 + 60 });
    if (G.name) P.name = text(G.name[0], G.name[1], '', 12.5, { it: true, fill: C.ink2, t: T0 + 100 });
    if (G.mode === 'plate') {
      text(G.f1[0], G.f1[1], 'b = Σ (x − x̄)(y − ȳ) / Σ (x − x̄)²', 13.5, { fill: C.ink2, t: T0 });
      text(G.f2[0], G.f2[1], 'a = ȳ − b x̄', 13.5, { fill: C.ink2, t: T0 });
      P.r2 = text(G.r2[0], G.r2[1], '', 13.5, { fill: C.ink2, t: T0 });
      // the ledger
      var lx = G.led.x, ly = G.led.y, ldy = G.led.dy, cols = [[18, 'i'], [62, 'x'], [104, 'y'], [150, 'ŷ'], [198, 'e'], [244, 'e²']];
      cols.forEach(function (c) { text(lx + c[0], ly, c[1], 13, { anchor: 'end', it: true, fill: C.ink2, t: T0 }); });
      pen.step(1900, 250, function () {
        pen.rule([lx, ly + 6], [lx + 280, ly + 6], { flush: true, g: gRead, w: 0.6 });
        for (var r = 1; r <= 7; r++) pen.rule([lx, ly + 6 + r * ldy], [lx + 280, ly + 6 + r * ldy], { flush: true, g: gRead, w: 0.35, op: 0.6 });
        pen.ink([[lx, ly + 10 + 7 * ldy], [lx + 280, ly + 10 + 7 * ldy]], { g: gRead, w: 0.8, split: false });
      });
      P.led = []; P.ledSq = [];
      for (var r = 0; r < 7; r++) {
        var yy = ly + (r + 1) * ldy;
        P.led.push(cols.map(function (c) { return text(lx + c[0], yy, '', 13, { anchor: 'end', t: T0 + 20 * r }); }));
        P.ledSq.push(pen.add('path', { fill: P.ssPat, stroke: C.ink2, 'stroke-width': sw(0.6, k) }, gRead, 'hf', T0 + 20 * r, 120));
      }
      text(lx + 18, ly + 8 * ldy + 8, 'Σ e²', 13, { anchor: 'end', it: true, t: T0 + 160 });
      P.ledTot = text(lx + 244, ly + 8 * ldy + 8, '', 13, { anchor: 'end', t: T0 + 160 });
      P.ledU = H.el('path', { stroke: C.sanguine, 'stroke-width': sw(1.4, k), fill: 'none', display: 'none' }, gRead);
      P.ownLab = text(G.own[0], G.own[1], '', 14, { fill: C.ink2, t: T0 });
      P.ownNote = text(G.ownNote[0], G.ownNote[1], '', 12.5, { it: true, fill: C.ink2, t: T0 });
      // "a line of your own": a small drawn switch
      var oy = G.ownT[1] - 5, ox = G.ownT[0];
      pen.step(2000, 150, function () { pen.ink(H.arcPts(ox + 6, oy, 5.5, 0, 360, 20), { g: gRead, closed: true, split: false, w: 'fine' }); });
      P.ownDot = H.el('path', { d: circD(ox + 6, oy, 2.6), fill: C.ink }, gRead);
      text(ox + 17, G.ownT[1], 'a line of your own', 12.5, { it: true, fill: C.ink2, t: 2050 });
    }
    // the scenario lever: quadrant, four detents, numerals I to IV, pivot and arm
    var V = G.lev, q = V.q;
    pen.step(1950, 260, function () {
      pen.arc(V.x, V.y, q, -52, 52, { noPrick: true });
      pen.ink(H.arcPts(V.x, V.y, q - 4, -52, 52, 3), { g: gRead, w: 'fine', split: false });
      pen.ink(H.arcPts(V.x, V.y, q + 4, -52, 52, 3), { g: gRead, w: 1.1, split: false });
      pen.hatch(H.arcPts(V.x, V.y, q + 3.6, -52, 52, 3).concat(H.arcPts(V.x, V.y, q + 1.2, 52, -52, 3)), { g: gRead, spacing: 1.8, w: 0.45 });
      DET.forEach(function (a) { var c = Math.cos(a / R2D), sn = Math.sin(a / R2D); pen.ink([[V.x + (q - 4) * c, V.y + (q - 4) * sn], [V.x + (q + 5) * c, V.y + (q + 5) * sn]], { g: gRead, w: 1.3 }); });
    });
    P.levNum = SCEN.map(function (sc2, j) {
      var a = DET[j] / R2D;
      if (V.names) text(V.x + V.names * Math.cos(a), V.y + V.names * Math.sin(a), sc2.name, 13, { it: true, fill: C.ink2, mid: true, t: 2150 });
      return text(V.x + V.num * Math.cos(a), V.y + V.num * Math.sin(a), sc2.num, 15, { anchor: 'middle', mid: true, fill: C.ink2, t: 2150 });
    });
    P.arm = pen.add('g', null, gRead, 'hf', 2100, 120);
    H.el('path', { d: 'M5,-1.8L' + r2(q - 10) + ',-1.1M5,1.8L' + r2(q - 10) + ',1.1', stroke: C.ink, 'stroke-width': sw(1.2, k), fill: 'none', 'stroke-linecap': 'round' }, P.arm);
    H.el('path', { d: circD(q - 12, 0, 4.2), fill: C.paper, stroke: C.ink, 'stroke-width': sw(1.2, k) }, P.arm);
    H.el('path', { d: 'M' + r2(q - 8) + ',0L' + r2(q + 2) + ',0', stroke: C.sanguine, 'stroke-width': sw(1.4, k), 'stroke-linecap': 'round' }, P.arm);
    pen.fill(circD(V.x, V.y, 7.5), { fill: C.paper }, { g: gRead });
    pen.t = 2100; pen.ink(H.arcPts(V.x, V.y, 7.5, -90, 270, 12), { g: gRead, closed: true, split: false });
    pen.hatch(crescent(V.x, V.y, 3.4, 6.9), { g: gRead, spacing: 1.7, w: 0.5 });
    pen.fill(circD(V.x, V.y, 1.4), { fill: C.ink }, { g: gRead });
    // the two cranks
    P.crank = G.cr.map(function (c, j) {
      var gx = c[0] + 6, gy = c[1] - 5;
      pen.t = 2000 + 60 * j;
      pen.ink(H.arcPts(gx, gy, 6, 0, 360, 20), { g: gRead, closed: true, split: false, w: 1 });
      var hg = pen.add('g', null, gRead, 'hf', 2000 + 60 * j, 140);
      H.el('path', { d: 'M0,0L0,-6.5', stroke: C.ink, 'stroke-width': sw(1.3, k), 'stroke-linecap': 'round' }, hg);
      H.el('path', { d: 'M0,-6.5L5.5,-6.5', stroke: C.ink, 'stroke-width': sw(1.3, k), 'stroke-linecap': 'round' }, hg);
      H.el('path', { d: circD(5.5, -6.5, 1.8), fill: C.paper, stroke: C.ink, 'stroke-width': sw(1, k) }, hg);
      H.el('path', { d: circD(0, 0, 1.4), fill: C.ink }, hg);
      text(c[0] + 18, c[1], j ? 'demonstrate' : 'reset', 12.5, { it: true, fill: C.ink2, t: 2050 + 60 * j });
      return { g: hg, x: gx, y: gy };
    });
    this.render(st);
  };

  // text width in units, measured only when the string changes
  F.textW = function (el, size) {
    if (el.__ws !== el.__s) { var w = 0; try { w = el.getComputedTextLength(); } catch (e) { w = 0; } el.__w = w > 0 ? w : (el.__s || '').length * size * 0.46; el.__ws = w > 0 ? el.__s : null; }
    return el.__w;
  };
  // is the box [x0, y0, x1, y1] (units) inside the board and clear of the bar, ball, pegs, squares, cup and tally?
  F.clearBox = function (bx, P, G, withCup) {
    var M = this.M, Fo = M.F, s = G.s, k = P.k, i, m = 2;
    function hit(o) { return o && bx[0] < o[2] + m && bx[2] > o[0] - m && bx[1] < o[3] + m && bx[3] > o[1] - m; }
    if (bx[0] < G.fx0 + 2 || bx[2] > G.fx0 + 11 * s - 2 || bx[1] < G.fy0 + 2 || bx[3] > G.fy0 + 11 * s - 2) return false;
    if (withCup && (hit(P.potBox) || (P.rail.__on && hit(P.tallyBox)))) return false;
    for (i = 0; i < M.pts.length; i++) { var px = G.X(M.pts[i].x), py = G.Y(M.pts[i].y), r = G.pr + 2; if (hit([px - r, py - r, px + r, py + r])) return false; if (P.sqBox && hit(P.sqBox[i])) return false; }
    var B = M.B; if (B.mode !== 'done' && B.mode !== 'chute') { var bxp = G.X(B.x), byp = G.Y(B.y), br = BR * s + 2; if (hit([bxp - br, byp - br, bxp + br, byp + br])) return false; }
    if (Fo.ok) {
      var c = Math.cos(Math.atan(Fo.b)), above = 0, below = 0, upC = (2 * BR * s + 4) / c, dnC = (G.tb + 4) / c;
      [[bx[0], bx[1]], [bx[2], bx[1]], [bx[0], bx[3]], [bx[2], bx[3]]].forEach(function (q) {
        var yl = G.Y(Fo.a + Fo.b * ((q[0] - G.fx0) / s - 0.5)), d = yl - q[1];
        if (d > upC) above++; else if (-d > dnC) below++;
      });
      if (above !== 4 && below !== 4) return false;
    }
    return true;
  };

  // ---- per-frame drawing: attribute and transform writes only ----------------------------------------
  F.render = function (stArg) {
    var st = stArg || this.study; if (!st) return;
    var P = st.parts, G = P.G, M = this.M; if (!G || !P.peg || G !== this.G) return;
    var Fo = M.F, X = G.X, Y = G.Y, s = G.s, k = P.k, sc = SCEN[M.scen], n = M.pts.length, i, tb = G.tb;
    var ok = Fo.ok, th = ok ? Math.atan(Fo.b) : 0, cth = Math.cos(th);
    setA(P.bar, 'display', ok ? 'inline' : 'none'); setA(P.knife, 'display', ok ? 'inline' : 'none'); setA(P.noLine, 'display', ok ? 'none' : 'inline');
    var mx = X(Fo.xb), my = Y(Fo.yb);
    if (ok) {
      setA(P.bar, 'transform', 'translate(' + r2(mx) + ' ' + r2(my) + ') rotate(' + r2(-th * R2D * 1000) / 1000 + ')');
      setA(P.knife, 'transform', 'translate(' + r2(mx) + ' ' + r2(my + tb / Math.max(cth, 0.3)) + ')');
    }
    setA(P.dot, 'transform', 'translate(' + r2(mx) + ' ' + r2(my) + ')');
    // pegs, springs, the squares on the residuals
    for (i = 0; i < n; i++) {
      var p = M.pts[i], x = X(p.x), y = Y(p.y), lifted = M.drag === i;
      setA(P.peg[i], 'transform', 'translate(' + r2(x) + ' ' + r2(y) + ')');
      setA(P.lift[i], 'transform', lifted ? 'translate(0 -1.5) scale(1.14)' : '');
      setA(P.sring[i], 'display', lifted ? 'inline' : 'none');
      P.sqBox = P.sqBox || []; P.sqBox[i] = null;
      if (!ok) { setA(P.sz[i], 'd', 'M0,0'); setA(P.sf[i], 'd', 'M0,0'); setA(P.sq[i], 'd', 'M0,0'); continue; }
      var e = Fo.e[i], yl = Y(p.y - e), side = Math.abs(e) * s, above = e > 0;
      var end = above ? yl : yl + tb / Math.max(cth, 0.3), from = y + (above ? 1 : -1) * G.pr * 0.9, len = Math.abs(end - from);
      if ((above && end - from > 2) || (!above && from - end > 2)) { var cl = coil(x, from, end, Math.max(1.6, 0.15 * s), Math.max(1.5, 0.15 * s)); setA(P.sz[i], 'd', cl.z); setA(P.sf[i], 'd', cl.f); }
      else { setA(P.sz[i], 'd', len > 0.5 ? 'M' + r2(x) + ',' + r2(from) + 'V' + r2(end) : 'M0,0'); setA(P.sf[i], 'd', 'M0,0'); }
      // the square: on the spring, toward the side with more room (the larger gap to a neighbour or edge)
      var lg = p.x + 0.5, rg = 10.5 - p.x;
      for (var j = 0; j < n; j++) if (j !== i) { var dx = M.pts[j].x - p.x; if (dx > 0 && dx < rg) rg = dx; if (dx < 0 && -dx < lg) lg = -dx; }
      var dir = rg >= lg ? 1 : -1;
      if (side >= 0.4) P.sqBox[i] = [Math.min(x, x + dir * side), Math.min(y, yl), Math.max(x, x + dir * side), Math.max(y, yl)];
      setA(P.sq[i], 'd', side < 0.4 ? 'M0,0' : 'M' + r2(x) + ',' + r2(y) + 'H' + r2(x + dir * side) + 'V' + r2(yl) + 'H' + r2(x) + 'Z');
    }
    // the ball, the chute flap, the cup
    var B = M.B, showB = B.mode !== 'done' && B.op > 0.01;
    setA(P.ball, 'display', showB ? 'inline' : 'none');
    if (showB) {
      setA(P.ball, 'transform', 'translate(' + r2(X(B.x)) + ' ' + r2(Y(B.y)) + ')');
      setA(P.ball, 'opacity', B.op >= 1 ? '1' : String(r2(B.op)));
      setA(P.mark, 'transform', 'rotate(' + r2((-B.s / BR) * R2D % 360) + ')');
    }
    setA(P.sunk, 'display', M.sunk ? 'inline' : 'none');
    setA(P.flap, 'transform', 'translate(' + r2(P.flapAt[0]) + ' ' + r2(P.flapAt[1]) + ') rotate(' + r2(70 * Math.sin(Math.PI * Math.min(1, M.flap))) + ')');
    setA(P.flag, 'transform', 'translate(' + r2(P.flagX) + ' ' + r2(P.flagY0 + (P.flagY1 - P.flagY0) * M.flag) + ')');
    var gapS = '';
    if (this.reduced && ok) { var dd = Fo.a + Fo.b * sc.cup[0] - sc.cup[1]; gapS = Math.abs(dd) <= TOL ? 'the line meets the rim' : Math.abs(dd).toFixed(1) + (dd > 0 ? ' over' : ' under'); }
    else if (M.gap != null) gapS = Math.abs(M.gap) <= TOL ? '' : Math.abs(M.gap).toFixed(1) + (M.gap > 0 ? ' over' : ' under');
    setT(P.gap, gapS);
    if (!gapS) { setA(P.gapP, 'width', 0); P.gapAt = null; }
    else {
      // the miss note on a paper patch in a clear spot: above the flag if free, else on the side of the cup
      // away from the bar; it never touches the cup, flag, ball, bar, a peg, a residual square or the tally
      var gw = this.textW(P.gap, 13) + 8, gh = Math.max(13, 11 / k) * 1.35, self = this, pb = P.potBox, d0 = ok ? Fo.a + Fo.b * sc.cup[0] - sc.cup[1] : 0;
      var clear = function (c) { return self.clearBox([c[0] - gw / 2, c[1] - gh / 2, c[0] + gw / 2, c[1] + gh / 2], P, G, true); };
      if (!P.gapAt || P.gapAt.s !== gapS || !clear(P.gapAt)) {
        var stx = P.flagX + 0.1 * s, cands = [[stx, pb[1] - 4 - gh / 2]], m2 = (pb[0] + pb[2]) / 2, below = [m2, pb[3] + 4 + gh / 2];
        var side = sc.cup[0] > 5 ? [pb[0] - 4 - gw / 2, Y(sc.cup[1]) - 0.2 * s] : [pb[2] + 4 + gw / 2, Y(sc.cup[1]) - 0.2 * s];
        if (d0 > 0) cands.push(below, side); else cands.push([m2, pb[1] - 4 - gh / 2], side, below);
        for (var rr = 1; rr <= 7; rr++) for (var aa = 0; aa < 16; aa++) { var an = (d0 > 0 ? 90 : -90) + (aa % 2 ? 1 : -1) * Math.ceil(aa / 2) * 22.5; cands.push([m2 + Math.cos(an / R2D) * rr * 0.55 * s, Y(sc.cup[1]) + Math.sin(an / R2D) * rr * 0.55 * s]); }
        var lo = G.fx0 + 3 + gw / 2, hi = G.fx0 + 11 * s - 3 - gw / 2;
        cands = cands.map(function (q) { return [Math.max(lo, Math.min(hi, q[0])), q[1]]; });
        var pick = cands[0]; for (var ci = 0; ci < cands.length; ci++) if (clear(cands[ci])) { pick = cands[ci]; break; }
        P.gapAt = [pick[0], pick[1]]; P.gapAt.s = gapS;
      }
      setA(P.gap, 'x', r2(P.gapAt[0])); setA(P.gap, 'y', r2(P.gapAt[1]));
      setA(P.gapP, 'x', r2(P.gapAt[0] - gw / 2)); setA(P.gapP, 'y', r2(P.gapAt[1] - gh / 2)); setA(P.gapP, 'width', r2(gw)); setA(P.gapP, 'height', r2(gh));
    }
    setT(P.note, M.note || '');
    if (M.note) { setA(P.note, 'x', r2(Math.max(X(1.2), Math.min(X(8.8), X(M.noteAt[0]))))); setA(P.note, 'y', r2(Y(M.noteAt[1]))); }
    // hover or focus: coordinates and residual beside the peg
    var hi = M.drag >= 0 ? M.drag : M.hover >= 0 ? M.hover : M.focus;
    if (hi >= 0 && !G.bare) {
      var hp = M.pts[hi], hs = '(' + hp.x.toFixed(1) + ', ' + hp.y.toFixed(1) + ')' + (ok ? '  e = ' + fx(Fo.e[hi], 2) : '');
      setA(P.hov, 'display', 'inline'); setA(P.hovP, 'display', 'inline'); setT(P.hov, hs);
      // on a paper patch, on the side of the peg away from the bar, kept inside the board
      var hw2 = this.textW(P.hov, 12.5) + 8, hh2 = Math.max(12.5, 11 / k) * 1.35, up = !ok || Fo.e[hi] >= 0, off = G.pr + 5 + hh2 / 2;
      var fy0 = G.fy0 + 2 + hh2 / 2, fy1 = G.fy0 + 11 * s - 2 - hh2 / 2, hy = Y(hp.y) + (up ? -off : off);
      if (hy < fy0 || hy > fy1) hy = Y(hp.y) + (up ? off : -off);
      var hxc = Math.max(G.fx0 + 2 + hw2 / 2, Math.min(G.fx0 + 11 * s - 2 - hw2 / 2, X(hp.x)));
      setA(P.hov, 'x', r2(hxc)); setA(P.hov, 'y', r2(hy));
      setA(P.hovP, 'x', r2(hxc - hw2 / 2)); setA(P.hovP, 'y', r2(hy - hh2 / 2)); setA(P.hovP, 'width', r2(hw2)); setA(P.hovP, 'height', r2(hh2));
    } else { setA(P.hov, 'display', 'none'); setA(P.hovP, 'display', 'none'); }
    // a line of your own
    if (P.own) {
      var on = M.own && M.ownY;
      setA(P.own, 'display', on ? 'inline' : 'none'); P.ownH.forEach(function (g) { setA(g, 'display', on ? 'inline' : 'none'); });
      setA(P.ownDot, 'display', M.own ? 'inline' : 'none');
      if (on) {
        var ob = (M.ownY[1] - M.ownY[0]) / 8, oa = M.ownY[0] - ob;
        setA(P.own, 'd', 'M' + r2(X(-0.5)) + ',' + r2(Y(oa - 0.5 * ob)) + 'L' + r2(X(10.5)) + ',' + r2(Y(oa + 10.5 * ob)));
        P.ownH[0].setAttribute('transform', 'translate(' + r2(X(1)) + ' ' + r2(Y(M.ownY[0])) + ')'); P.ownH[1].setAttribute('transform', 'translate(' + r2(X(9)) + ' ' + r2(Y(M.ownY[1])) + ')');
        var oss = ssrOf(M.pts, oa, ob);
        setT(P.ownLab, 'your line: Σ e² = ' + oss.toFixed(2)); setT(P.ownNote, 'never less than the fitted line’s');
        this.hands.forEach(function (b, j) { var t = 'translate(-50%,-50%) translateY(' + r2(Y(M.ownY[j]) * k) + 'px)'; if (b.__t !== t) { b.__t = t; b.style.transform = t; } });
      } else { setT(P.ownLab, ''); setT(P.ownNote, ''); }
    }
    // hit areas follow the pegs
    if (this.pegBtns && !G.bare) for (i = 0; i < n; i++) { var tr = 'translate(' + r2(X(M.pts[i].x) * k) + 'px,' + r2(Y(M.pts[i].y) * k) + 'px)'; var pb = this.pegBtns[i]; if (pb && pb.__t !== tr) { pb.__t = tr; pb.style.transform = tr; } }
    if (G.bare) return;
    // readouts
    var eqs = eqText(Fo), means = 'mean point (' + Fo.xb.toFixed(1) + ', ' + Fo.yb.toFixed(1) + ')', counts = 'in the cup: ' + M.k + ' of ' + M.m;
    setT(P.eq, eqs); setT(P.mean, means); setT(P.count, counts);
    if (P.name) setT(P.name, sc.num + '. ' + sc.name);
    var ss = ok ? Fo.ssr : null, cap = G.sum.cap, side2 = ok ? Math.sqrt(ss) * s : 0, x0 = G.sum.x, yb = G.sum.yb, dS;
    if (!ok) dS = 'M0,0';
    else if (side2 <= cap) dS = 'M' + r2(x0) + ',' + r2(yb) + 'H' + r2(x0 + side2) + 'V' + r2(yb - side2) + 'H' + r2(x0) + 'Z';
    else { // drawn at the cap with a torn corner; the numeral stays exact
      var c = cap, t = 0.3 * c, tear = [[x0 + c, yb - c + t]], m2 = 7;
      for (var q = 1; q < m2; q++) { var f = q / m2, jig = (q % 2 ? 1 : -1) * 0.035 * c; tear.push([x0 + c - t * f + jig, yb - c + t - t * f - jig]); }
      dS = 'M' + r2(x0) + ',' + r2(yb) + 'H' + r2(x0 + c) + tear.map(function (pt) { return 'L' + r2(pt[0]) + ',' + r2(pt[1]); }).join('') + 'L' + r2(x0 + c - t) + ',' + r2(yb - c) + 'H' + r2(x0) + 'Z';
    }
    setA(P.ss, 'd', dS);
    setT(P.ssLab, ok ? 'Σ e² = ' + ss.toFixed(2) : 'Σ e²: no line');
    if (P.arm) setA(P.arm, 'transform', 'translate(' + G.lev.x + ' ' + G.lev.y + ') rotate(' + r2(M.arm) + ')');
    for (i = 0; i < 4; i++) setA(P.levNum[i], 'fill', i === M.scen ? C.ink : C.ink2);
    P.crank.forEach(function (cr, j) { setA(cr.g, 'transform', 'translate(' + cr.x + ' ' + cr.y + ') rotate(' + r2(M.crank[j] % 360) + ')'); });
    if (G.mode === 'plate') {
      setT(P.r2, ok ? (Fo.r2 == null ? 'R² undefined' : 'R² = ' + Fo.r2.toFixed(2)) : 'R² undefined');
      var lx = G.led.x, ly = G.led.y, ldy = G.led.dy;
      for (i = 0; i < 7; i++) {
        var row = P.led[i], pp = M.pts[i]; if (!row) continue;
        var e2 = ok ? Fo.e[i] * Fo.e[i] : null;
        setT(row[0], String(i + 1)); setT(row[1], pp.x.toFixed(1)); setT(row[2], pp.y.toFixed(1));
        setT(row[3], ok ? fx(Fo.a + Fo.b * pp.x, 2) : ''); setT(row[4], ok ? fx(Fo.e[i], 2) : ''); setT(row[5], ok ? e2.toFixed(2) : '');
        var sq = ok ? Math.min(16, Math.sqrt(e2) * 9) : 0, sy = ly + (i + 1) * ldy;
        setA(P.ledSq[i], 'd', sq < 0.6 ? 'M0,0' : 'M' + r2(lx + 254) + ',' + r2(sy + 2) + 'h' + r2(sq) + 'v' + r2(-sq) + 'h' + r2(-sq) + 'Z');
      }
      setT(P.ledTot, ok ? Fo.ssr.toFixed(2) : '');
      if (hi >= 0) { var uy = ly + (hi + 1) * ldy + 4; setA(P.ledU, 'display', 'inline'); setA(P.ledU, 'd', 'M' + lx + ',' + r2(uy) + 'H' + (lx + 280)); } else setA(P.ledU, 'display', 'none');
    }
    var sum = (ok ? 'Fitted line ' + eqs.replace('ŷ', 'y hat') + '. Sum of squared residuals ' + ss.toFixed(2) + '. ' : 'All x equal: no single line fits. ') + counts + '.';
    if (this.sum.__s !== sum && (!this.animates() || M.drag < 0)) { this.sum.__s = sum; this.sum.textContent = sum; }
  };

  // ---- selfTest (2.11) ------------------------------------------------------------------------------------
  function selfTest() {
    var checks = [], rnd = H.rng('regress:selftest'), worstAB = 0, worstMean = 0, perturbFail = 0, t;
    for (t = 0; t < 200; t++) {
      var n = 3 + Math.floor(rnd() * 10), pts = [], i;
      for (i = 0; i < n; i++) pts.push({ x: rnd() * 10, y: rnd() * 10 });
      var Ft = fit(pts); if (!Ft.ok) { t--; continue; }
      // normal equations: [n Σx; Σx Σx²][a b]' = [Σy Σxy]', solved by Cramer's rule
      var sx = 0, sy = 0, sxx = 0, sxy = 0; pts.forEach(function (p) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
      var det = n * sxx - sx * sx, a = (sy * sxx - sx * sxy) / det, b = (n * sxy - sx * sy) / det;
      worstAB = Math.max(worstAB, Math.abs(a - Ft.a), Math.abs(b - Ft.b));
      worstMean = Math.max(worstMean, Math.abs(Ft.a + Ft.b * Ft.xb - Ft.yb));
      var base = ssrOf(pts, Ft.a, Ft.b);
      [[0.05, 0], [-0.05, 0], [0, 0.01], [0, -0.01], [0.3, 0.02], [-0.2, -0.03], [0.1, -0.02], [-0.4, 0.05]].forEach(function (d) { if (ssrOf(pts, Ft.a + d[0], Ft.b + d[1]) < base - 1e-12) perturbFail++; });
    }
    checks.push({ name: 'a and b agree with the normal equations (200 data sets)', ok: worstAB <= 1e-9, detail: 'max error ' + worstAB.toExponential(2) });
    checks.push({ name: 'SSR at the fit is no more than at 8 perturbed lines', ok: perturbFail === 0, detail: perturbFail + ' failures' });
    checks.push({ name: 'the line passes through the mean point', ok: worstMean <= 1e-9, detail: 'max error ' + worstMean.toExponential(2) });
    SCEN.forEach(function (sc) {
      var r0 = simulate(sc, startPts(sc)), r1 = simulate(sc, solPts(sc));
      checks.push({ name: 'scenario ' + sc.num + ' start misses', ok: !r0.score, detail: r0.ev.join(' ') + (r0.d != null ? ', d = ' + r0.d.toFixed(3) : '') });
      checks.push({ name: 'scenario ' + sc.num + ' stored solution scores', ok: r1.score, detail: r1.ev.join(' ') + (r1.d != null ? ', d = ' + r1.d.toFixed(3) : '') + ', ' + r1.t + ' s' });
    });
    return { ok: checks.every(function (c) { return c.ok; }), checks: checks };
  }

  NB.figures.regress = {
    mount: function (host, env) {
      var f = new Fig(host, env);
      return { layout: function (m, a) { f.layout(m, a); }, setRunning: function (b) { f.setRunning(b); }, setDemo: function (b) { f.setDemo(b); },
        anchor: function (nm) { return f.anchor(nm); }, destroy: function () { f.destroy(); }, _M: f.M, _f: f, _advance: function (s) { f._advance(s); } };
    },
    selfTest: selfTest,
    _: { fit: fit, simulate: simulate, SCEN: SCEN, startPts: startPts, solPts: solPts, ssrOf: ssrOf }
  };
})(window);
