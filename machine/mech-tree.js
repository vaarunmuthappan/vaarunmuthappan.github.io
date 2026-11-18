/* mech-tree.js: Fig. III, a decision tree as a sorting board.

   Every ball is one row of a small synthetic table (36 rows: age, income, and a yes/no label that
   colours the ball). A row leaves the hopper, rolls along a rule to the position of its own
   feature value, and drops: a wedge set at the threshold sends it left (value <= threshold) or
   right (value > threshold). The root rule measures age; each branch has its own income rule.
   Each row therefore follows exactly one path and lands in one of four leaves. A leaf predicts
   the majority label of the training rows that reach it; minority balls in a bin are the tree's
   training errors. "Fit" does what CART does for a fixed feature per node: for the root, then
   for each child given the root, choose the threshold with the lowest weighted Gini impurity. */
import { THREE, PAL, MAT, mesh, box, cyl, line, segments, label, BallSet, clamp, lerp, damp, ease, out, $, $$, rng } from './kit.js';

function makeRows() {
  const r = rng(20241), rows = [];
  for (let i = 0; i < 36; i++) {
    const age = 19 + Math.floor(r() * 41), income = 22 + Math.floor(r() * 77);
    let yes = age > 36 ? income > 46 : income > 74;
    if (i === 5 || i === 17 || i === 29) yes = !yes;       // three rows of label noise
    rows.push({ i, age, income, yes });
  }
  return rows;
}
const gini = (y, n) => { const t = y + n; if (!t) return 0; const p = y / t; return 2 * p * (1 - p); };

export function createTree() {
  const g = new THREE.Group(), ROWS = makeRows(), N = ROWS.length, R = 0.06, ZB = 0.2;
  const YR = 1.42, YC = 0.02, CX = [-1.075, 1.075], BIN = [-1.6125, -0.5375, 0.5375, 1.6125], BIN_Y = -2.2;
  const xr = (age) => -1.55 + (3.1 * (age - 18)) / 42, xc = (s, inc) => CX[s] - 0.9 + (1.8 * (inc - 20)) / 80;
  const DEF = [30, 65, 50];
  const S = { t: DEF.slice(), goal: null, released: 0, clock: 0, hold: 0, phase: 'run', panel: null, grab: -1, focused: false, drain: 0 };
  const balls = ROWS.map((row) => ({ row, st: 'queue', t: 0, s1: 0, s2: 0, leaf: -1, x: 0, y: 3, tw: null, sc: 1 }));
  const leafList = [[], [], [], []];

  /* ---- statistics on the full table for the current thresholds ---- */
  const leafOf = (row, t = S.t) => { const s1 = row.age > t[0] ? 1 : 0; return s1 * 2 + (row.income > t[1 + s1] ? 1 : 0); };
  function stats(t = S.t) {
    const c = [[0, 0], [0, 0], [0, 0], [0, 0]];
    ROWS.forEach((r) => { c[leafOf(r, t)][r.yes ? 0 : 1]++; });
    const right = c.reduce((s, l) => s + Math.max(l[0], l[1]), 0);
    const Y = c.reduce((s, l) => s + l[0], 0);
    const g0 = gini(Y, N - Y);
    const g1 = [0, 1].reduce((s, k) => { const y = c[2 * k][0] + c[2 * k + 1][0], n = c[2 * k][1] + c[2 * k + 1][1]; return s + ((y + n) / N) * gini(y, n); }, 0);
    const g2 = c.reduce((s, l) => s + ((l[0] + l[1]) / N) * gini(l[0], l[1]), 0);
    return { c, right, g0, g1, g2 };
  }
  function fit() {
    let best = [DEF[0], DEF[1], DEF[2]], bg = 9;
    for (let a = 19; a < 59; a++) {            // root: lowest weighted Gini of the two children
      let ly = 0, ln = 0, ry = 0, rn = 0;
      ROWS.forEach((r) => { if (r.age > a) { r.yes ? ry++ : rn++; } else { r.yes ? ly++ : ln++; } });
      if (ly + ln === 0 || ry + rn === 0) continue;
      const w = ((ly + ln) * gini(ly, ln) + (ry + rn) * gini(ry, rn)) / N;
      if (w < bg - 1e-9) { bg = w; best[0] = a; }
    }
    [0, 1].forEach((s) => {                    // each child, given the root split
      const sub = ROWS.filter((r) => (r.age > best[0] ? 1 : 0) === s); let cg = 9;
      for (let v = 22; v < 99; v++) {
        let ly = 0, ln = 0, ry = 0, rn = 0;
        sub.forEach((r) => { if (r.income > v) { r.yes ? ry++ : rn++; } else { r.yes ? ly++ : ln++; } });
        const w = ((ly + ln) * gini(ly, ln) + (ry + rn) * gini(ry, rn)) / Math.max(1, sub.length);
        if (w < cg - 1e-9) { cg = w; best[1 + s] = v; }
      }
      // sit in the middle of the gap between the two neighbouring incomes
      const lo = Math.max(...sub.filter((r) => r.income <= best[1 + s]).map((r) => r.income), 20);
      const hi = Math.min(...sub.filter((r) => r.income > best[1 + s]).map((r) => r.income), 100);
      best[1 + s] = Math.floor((lo + hi) / 2);
    });
    return best;
  }

  /* ---- fixed parts ---- */
  // hopper: a funnel holding the rows still to be sorted
  const hop = new THREE.Group(); hop.position.set(0, 2.1, 0); g.add(hop);
  const hs = new THREE.Shape(); hs.moveTo(-0.09, -0.03); hs.lineTo(0.09, -0.03); hs.lineTo(0.56, 0.5); hs.lineTo(-0.56, 0.5); hs.closePath();
  mesh(new THREE.ShapeGeometry(hs), MAT.boardDeep, { parent: hop, at: [0, 0, 0.008], cast: false, ink: 1, inkMat: MAT.inkFaint });
  [-1, 1].forEach((s) => { const b = box(0.68, 0.045, ZB + 0.12, MAT.ceramic, { parent: hop, at: [s * 0.315, 0.235, (ZB + 0.12) / 2], ink: true }); b.rotation.z = s * 0.845; });
  label('rows', { size: 0.11, align: 'l', parent: g, at: [0.66, 2.36, 0.01], opacity: 0.7 });
  // rules: one for the root (age), one per branch (income)
  function rule(cx, y, half, ticks) {
    box(half * 2 + 0.14, 0.2, 0.03, MAT.ceramic, { parent: g, at: [cx, y, 0.015], ink: true, inkMat: MAT.inkFaint });
    box(half * 2 + 0.14, 0.025, ZB + 0.08, MAT.brass, { parent: g, at: [cx, y + 0.105, (ZB + 0.08) / 2] });
    const sg = [];
    ticks.forEach((tk) => { sg.push([tk.x, y + 0.09, 0.032], [tk.x, y + (tk.t ? 0.03 : 0.06), 0.032]); if (tk.t) label(tk.t, { size: 0.085, italic: false, parent: g, at: [tk.x, y - 0.035, 0.034], opacity: 0.7 }); });
    g.add(segments(sg, MAT.ink));
  }
  const rt = []; for (let a = 20; a <= 60; a += 2) rt.push({ x: xr(a), t: a % 10 === 0 ? String(a) : '' });
  rule(0, YR, 1.55, rt);
  [0, 1].forEach((s) => { const ct = []; for (let v = 20; v <= 100; v += 5) ct.push({ x: xc(s, v), t: v % 20 === 0 ? String(v) : '' }); rule(CX[s], YC, 0.9, ct); });
  label('age', { size: 0.12, align: 'r', parent: g, at: [-1.68, YR + 0.3, 0.01] });
  label('income', { size: 0.11, align: 'r', parent: g, at: [CX[0] - 0.45, YC + 0.3, 0.01] });
  label('income', { size: 0.11, align: 'l', parent: g, at: [CX[1] + 0.45, YC + 0.3, 0.01] });
  // wedges
  const wShape = new THREE.Shape(); wShape.moveTo(0, 0); wShape.lineTo(0.1, -0.2); wShape.lineTo(-0.1, -0.2); wShape.closePath();
  const wGeo = new THREE.ExtrudeGeometry(wShape, { depth: 0.3, bevelEnabled: false });
  const wedges = [0, 1, 2].map((k) => {
    const w = new THREE.Group(); mesh(wGeo, MAT.sanguine, { parent: w, at: [0, -0.1, 0.03], ink: 20 });
    w.add(segments([[0, -0.1, 0.034], [0, 0.1, 0.034]], MAT.inkRed));
    w.userData.q = label('', { size: 0.115, parent: w, at: [0, -0.46, 0.01] });
    label('no', { size: 0.085, align: 'r', parent: w, at: [-0.16, -0.2, 0.01], opacity: 0.55 });
    label('yes', { size: 0.085, align: 'l', parent: w, at: [0.16, -0.2, 0.01], opacity: 0.55 });
    g.add(w); return w;
  });
  // guide lines from each rule down to where its two outcomes go
  const guide = segments(new Array(24).fill([0, 0, 0]), MAT.inkFaint); g.add(guide);
  // bins
  const flags = BIN.map((bx, L) => {
    const wall = [[bx - 0.46, -1.25, 0.004], [bx - 0.46, BIN_Y - 0.02, 0.004], [bx - 0.46, BIN_Y - 0.02, 0.004], [bx + 0.46, BIN_Y - 0.02, 0.004], [bx + 0.46, BIN_Y - 0.02, 0.004], [bx + 0.46, -1.25, 0.004]];
    g.add(segments(wall, MAT.ink));
    box(0.96, 0.03, ZB + 0.1, MAT.ceramic, { parent: g, at: [bx, BIN_Y - 0.035, (ZB + 0.1) / 2], ink: true, inkMat: MAT.inkFaint });
    [-1, 1].forEach((s) => box(0.02, 1.0, ZB + 0.1, MAT.ceramic, { parent: g, at: [bx + s * 0.47, BIN_Y + 0.46, (ZB + 0.1) / 2] }));
    const f = box(0.9, 0.05, 0.02, MAT.sanguine.clone(), { parent: g, at: [bx, BIN_Y - 0.1, 0.012], cast: false });
    f.userData.a = label('', { size: 0.105, parent: g, at: [bx, BIN_Y - 0.21, 0.01] });
    f.userData.b = label('', { size: 0.085, italic: false, parent: g, at: [bx, BIN_Y - 0.35, 0.01], opacity: 0.6 });
    return f;
  });
  const set = new BallSet(N, R); g.add(set.mesh);
  ROWS.forEach((r, i) => set.color(i, r.yes ? PAL.yes : PAL.no));
  const vals = [0, 1, 2].map(() => label('', { size: 0.105, italic: false, parent: g, at: [0, 0, ZB + 0.07] }));
  vals.forEach((v) => { v.visible = false; });

  /* ---- layout that depends on the thresholds ---- */
  const wx = (k) => (k === 0 ? xr(S.t[0]) : xc(k - 1, S.t[k]));
  function drawThresholds() {
    const names = ['age', 'income', 'income'];
    wedges.forEach((w, k) => { w.position.set(wx(k), (k === 0 ? YR : YC) - 0.1, 0); w.userData.q.setText(names[k] + ' > ' + Math.round(S.t[k]) + ' ?'); });
    const a = guide.geometry.attributes.position; let o = 0;
    const seg = (x0, y0, x1, y1) => { a.setXYZ(o++, x0, y0, 0.004); a.setXYZ(o++, x1, y1, 0.004); };
    const w0 = wx(0);
    seg(-1.6, YR - 0.14, CX[0] - 0.14, YC + 0.62); seg(w0 - 0.11, YR - 0.32, CX[0] + 0.14, YC + 0.62);
    seg(w0 + 0.11, YR - 0.32, CX[1] - 0.14, YC + 0.62); seg(1.6, YR - 0.14, CX[1] + 0.14, YC + 0.62);
    [0, 1].forEach((s) => {
      const w = wx(1 + s);
      seg(CX[s] - 0.95, YC - 0.14, BIN[2 * s] - 0.4, -1.22); seg(w - 0.11, YC - 0.32, BIN[2 * s] + 0.4, -1.22);
      seg(w + 0.11, YC - 0.32, BIN[2 * s + 1] - 0.4, -1.22); seg(CX[s] + 0.95, YC - 0.14, BIN[2 * s + 1] + 0.4, -1.22);
    });
    a.needsUpdate = true;
    const st = stats();
    flags.forEach((f, L) => {
      const [y, n] = st.c[L], pred = y > n ? 'yes' : n > y ? 'no' : y ? 'tie' : 'empty';
      f.material.color.set(pred === 'yes' ? PAL.sanguine : pred === 'no' ? 0xFBF8F1 : PAL.silver);
      f.userData.a.setText(pred === 'empty' ? 'no rows' : pred === 'tie' ? 'tie' : 'predicts ' + pred);
      f.userData.b.setText(y + ' yes · ' + n + ' no');
    });
    const p = S.panel; if (!p) return;
    out(p, 'acc', st.right + ' of ' + N + ' rows  (' + Math.round((100 * st.right) / N) + '%)');
    out(p, 'gini', st.g0.toFixed(3) + '  →  ' + st.g1.toFixed(3) + '  →  ' + st.g2.toFixed(3));
    ['t0', 't1', 't2'].forEach((k, i) => { const e = $(p, '[data-k="' + k + '"]'); if (e && document.activeElement !== e) e.value = Math.round(S.t[i]); out(p, k, String(Math.round(S.t[i]))); });
  }
  const slotPos = (L, k) => [BIN[L] + ((k % 6) - 2.5) * 0.136, BIN_Y + R + 0.005 + Math.floor(k / 6) * 0.126];
  function retarget(L, arcFrom) {
    leafList[L].forEach((b, k) => {
      const [x, y] = slotPos(L, k);
      if (Math.abs(b.x - x) < 1e-3 && Math.abs(b.y - y) < 1e-3 && !b.tw) return;
      const far = Math.abs(b.x - x) > 0.5;
      b.tw = { x0: b.x, y0: b.y, x1: x, y1: y, t: 0, d: far ? 0.75 : 0.3, h: far ? Math.max(0.35, -0.95 - Math.max(b.y, y)) : 0 };
    });
  }
  function resort() {            // thresholds moved: landed rows cross to the leaf their path now ends in
    const touched = new Set();
    balls.forEach((b) => {
      if (b.st !== 'leaf') return;
      const L = leafOf(b.row);
      if (L !== b.leaf) { const a = leafList[b.leaf]; a.splice(a.indexOf(b), 1); touched.add(b.leaf); leafList[L].push(b); b.leaf = L; touched.add(L); }
    });
    touched.forEach((L) => retarget(L));
  }
  function setT(k, v, user) {
    v = clamp(v, k === 0 ? 19 : 22, k === 0 ? 58 : 98);
    if (user) S.goal = null;
    if (S.t[k] === v) return; S.t[k] = v; drawThresholds(); resort();
  }

  /* ---- a row's path ---- */
  const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
  const T = { a: 0.25, b: 0.58, c: 0.76, d: 1.26, e: 1.56, f: 1.74, g: 2.26 };
  function fly(b, dt) {
    const r = b.row, t0 = b.t; b.t += dt; const t = b.t, top = YR + 0.105 + R + 0.012, ctop = YC + 0.105 + R + 0.012;
    if (t0 < T.c && t >= T.c) b.s1 = r.age > S.t[0] ? 1 : 0;
    if (t0 < T.f && t >= T.f) b.s2 = r.income > S.t[1 + b.s1] ? 1 : 0;
    const xa = xr(r.age);
    if (t < T.a) { const u = t / T.a; b.x = 0; b.y = lerp(2.08, top, u * u); }
    else if (t < T.b) { b.x = lerp(0, xa, ease.io((t - T.a) / (T.b - T.a))); b.y = top; }
    else if (t < T.c) { b.x = xa; b.y = top; }
    else if (t < T.d) { const u = (t - T.c) / (T.d - T.c), c = CX[b.s1], e = u * u * (3 - 2 * u) * 0.6 + u * u * 0.4; b.x = bez(xa, xa, c, c, e); b.y = bez(top, YR - 0.55, ctop + 0.75, ctop, e); }
    else if (t < T.e) { b.x = lerp(CX[b.s1], xc(b.s1, r.income), ease.io((t - T.d) / (T.e - T.d))); b.y = ctop; }
    else if (t < T.f) { b.x = xc(b.s1, r.income); b.y = ctop; }
    else if (t < T.g) {
      const L = b.s1 * 2 + b.s2; if (b.leaf !== L) { b.leaf = L; leafList[L].push(b); }
      const [sx, sy] = slotPos(L, leafList[L].indexOf(b)), xi = xc(b.s1, r.income), u = (t - T.f) / (T.g - T.f), e = u * u * 0.75 + u * 0.25;
      b.x = bez(xi, xi, sx, sx, e); b.y = bez(ctop, YC - 0.6, -1.05, sy, e);
    } else {
      b.st = 'leaf'; const L = b.leaf, [sx, sy] = slotPos(L, leafList[L].indexOf(b)); b.x = sx; b.y = sy;
      const now = leafOf(r);                                   // a threshold moved while this row was in the air
      if (now !== L) { leafList[L].splice(leafList[L].indexOf(b), 1); leafList[now].push(b); b.leaf = now; retarget(L); retarget(now); }
    }
  }
  function release() { if (S.released >= N) return; const b = balls[S.released++]; b.st = 'fly'; b.t = 0; b.leaf = -1; b.sc = 1; }
  function clearAll() { balls.forEach((b) => { b.st = 'queue'; b.leaf = -1; b.tw = null; b.t = 0; b.sc = 1; }); leafList.forEach((l) => { l.length = 0; }); S.released = 0; S.clock = 0; S.hold = 0; S.phase = 'run'; }
  function landAll() { clearAll(); balls.forEach((b) => { b.st = 'leaf'; b.leaf = leafOf(b.row); leafList[b.leaf].push(b); }); leafList.forEach((l, L) => l.forEach((b, k) => { const [x, y] = slotPos(L, k); b.x = x; b.y = y; })); S.released = N; }

  function update(dt, time, env) {
    S.focused = env.focused;
    if (S.goal) {              // "Fit": the wedges slide to the Gini-best thresholds
      let done = true;
      S.goal.forEach((v, k) => { const nv = Math.abs(S.t[k] - v) < 0.15 ? v : damp(S.t[k], v, 5, env.rdt); if (nv !== v) done = false; if (nv !== S.t[k]) { S.t[k] = nv; } });
      drawThresholds(); resort(); if (done) S.goal = null;
    }
    if (S.phase === 'run') {
      S.clock += dt;
      while (S.clock > 0.72 && S.released < N) { S.clock -= 0.72; release(); }
      if (S.released >= N && balls.every((b) => b.st === 'leaf')) { S.hold += dt; if (S.hold > 7 && !S.focused) { S.phase = 'drain'; S.drain = 0; } }
    } else {
      S.drain += dt;
      balls.forEach((b, i) => { if (b.st !== 'leaf') return; const u = (S.drain - i * 0.012) / 0.5; if (u > 0) { b.y -= dt * (1 + u * 5); b.sc = clamp(1 - (u - 0.5) * 2, 0, 1); } });
      if (S.drain > 1.5) clearAll();
    }
    const cur = [null, null, null];
    balls.forEach((b, i) => {
      if (b.st === 'queue') {
        const q = i - S.released;
        if (q < 12) { const row = q < 2 ? 0 : q < 6 ? 1 : 2, k = row === 0 ? q : row === 1 ? q - 2 : q - 6, cnt = row === 0 ? 2 : row === 1 ? 4 : 6; set.set(i, (k - (cnt - 1) / 2) * 0.125, 2.2 + row * 0.118, ZB, 1); }
        else set.hide(i);
        return;
      }
      if (b.st === 'fly') { fly(b, dt); if (b.t >= T.a && b.t < T.c) cur[0] = b; else if (b.t >= T.d && b.t < T.f) cur[1 + b.s1] = b; }
      else if (b.tw) { const w = b.tw; w.t += env.rdt / w.d; const u = Math.min(1, w.t), e = ease.io(u); b.x = lerp(w.x0, w.x1, e); b.y = lerp(w.y0, w.y1, e) + 4 * w.h * u * (1 - u); if (u >= 1) b.tw = null; }
      set.set(i, b.x, b.y, ZB + (b.tw && b.tw.h ? 0.14 * Math.sin(Math.PI * Math.min(1, b.tw.t)) : 0), b.sc);
    });
    set.commit();
    cur.forEach((b, k) => {
      const v = vals[k]; v.visible = !!b; if (!b) return;
      v.position.set(b.x, b.y + 0.17, ZB + 0.07); v.setText(String(k === 0 ? b.row.age : b.row.income));
    });
    if (S.panel && cur[0] !== S.lastRow) { S.lastRow = cur[0]; if (cur[0]) { const r = cur[0].row; out(S.panel, 'row', 'row ' + (r.i + 1) + ':  age ' + r.age + ',  income ' + r.income + ',  label ' + (r.yes ? 'yes' : 'no')); } }
  }

  /* ---- dragging a wedge ---- */
  const hp = new THREE.Vector3();
  function near(ray) {
    const t = (0.2 - ray.origin.z) / ray.direction.z; if (!(t > 0)) return null; ray.at(t, hp);
    let k = -1, bd = 0.3;
    wedges.forEach((w, i) => { const d = Math.hypot(hp.x - w.position.x, (hp.y - (w.position.y - 0.1)) * 0.7); if (d < bd) { bd = d; k = i; } });
    return { k, x: hp.x };
  }
  function pointer(type, ray) {
    if (type === 'up') { S.grab = -1; return; }
    const h = near(ray); if (!h) return false;
    if (type === 'hover') return h.k >= 0;
    if (type === 'down') { if (h.k < 0) return false; S.grab = h.k; S.goal = null; return true; }
    if (type === 'move' && S.grab >= 0) {
      const k = S.grab, v = k === 0 ? 18 + ((h.x + 1.55) * 42) / 3.1 : 20 + ((h.x - CX[k - 1] + 0.9) * 80) / 1.8;
      setT(k, Math.round(v), true);
    }
    return true;
  }
  function bind(p) {
    S.panel = p;
    ['t0', 't1', 't2'].forEach((key, k) => { const e = $(p, '[data-k="' + key + '"]'); if (e) e.addEventListener('input', () => setT(k, +e.value, true)); });
    const f = $(p, '[data-k="fit"]'); if (f) f.addEventListener('click', () => { S.goal = fit(); });
    const a = $(p, '[data-k="again"]'); if (a) a.addEventListener('click', clearAll);
    const d = $(p, '[data-k="defaults"]'); if (d) d.addEventListener('click', () => { S.goal = DEF.slice(); });
    drawThresholds();
  }
  function prefill(k) { for (let i = 0; i < k; i++) { const b = balls[i]; b.st = 'leaf'; b.leaf = leafOf(b.row); leafList[b.leaf].push(b); const [x, y] = slotPos(b.leaf, leafList[b.leaf].length - 1); b.x = x; b.y = y; } S.released = k; }
  function reset() { S.t = DEF.slice(); S.goal = null; clearAll(); drawThresholds(); prefill(20); }
  function settle() { landAll(); }
  drawThresholds();
  prefill(20);   // begin part-way through a run so the board is already populated on arrival

  return { id: 'tree', fig: 'Fig. III', title: 'Decision tree', plate: 2, group: g, anchor: [-1.45, 3.14, 0.7],
    view: { pitch: 0.1, w: 4.9, h: 5.9, cz: 0.2 }, update, reset, settle, bind, pointer, _: { ROWS, stats, fit } };
}
