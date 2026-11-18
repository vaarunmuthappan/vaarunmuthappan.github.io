/* mech-bayes.js: Fig. I, Bayesian updating. Data and maths come from ../bayes.js unchanged:
   48 fixed synthetic yes/no observations (14 yes, 34 no), theta ~ Beta(a0, b0), and after n
   observations with k yes the posterior is exactly Beta(a0 + k, b0 + n - k).

   Two physical readings of the same posterior:
   1. The ridge. One paper slice per observation; slice n is the exact Beta density after n
      observations. The prior is the slice against the plate, the current posterior is the front
      slice, and the shaded band is its central 90% interval (5th to 95th percentile).
   2. The steelyard. A beam runs from theta = 0 to theta = 1. Every "no" hangs at 0 and every
      "yes" at 1, together with the prior's pseudo-counts (b0 at 0, a0 at 1). The beam balances
      where the fulcrum sits under the centre of mass, a / (a + b), which is the posterior mean. */
import { THREE, PAL, MAT, mesh, box, cyl, line, segments, label, BallSet, clamp, lerp, damp, ease, sat, out, $, $$ } from './kit.js';

export function createBayes() {
  const BY = window.Bayes, N = BY.N, DATA = BY.DATA, P = BY.PTS, ST = BY.ST, PRI = BY.PRIORS;
  const g = new THREE.Group();
  const X = (t) => -1.7 + 3.4 * t, Y0 = -0.35, U = 0.36, Z = (n) => 0.09 + n * 0.027, ZF = 1.62;
  const J = (P - 1) / 2 + 1;            // 101 points per slice (every second of bayes.js's 201)
  const S = { prior: 'flat', seen: 0, sent: 0, nf: 0, shown: -1, mode: 'auto', clock: 0, hold: 0, flights: [], tilt: 0, tiltV: 0, ful: 0.5, panel: null };

  /* ---- shelf, fascia rule, feed rail ---- */
  box(3.9, 0.07, 1.5, MAT.ceramic, { parent: g, at: [0, Y0 - 0.035, 0.75], ink: true });
  box(3.9, 0.3, 0.035, MAT.ceramic, { parent: g, at: [0, Y0 - 0.15, 1.5], ink: true });
  const tk = [];
  for (let k = 0; k <= 20; k++) { const x = X(k / 20), l = k % 5 === 0 ? 0.1 : 0.05; tk.push([x, Y0 - 0.005, 1.52], [x, Y0 - l, 1.52]); }
  g.add(segments(tk, MAT.ink));
  ['0', '0.25', '0.5', '0.75', '1'].forEach((t, k) => label(t, { size: 0.105, italic: false, parent: g, at: [X(k / 4), Y0 - 0.2, 1.522] }));
  [-1, 1].forEach((s) => { box(0.05, 0.45, 1.3, MAT.ceramic, { parent: g, at: [s * 1.6, Y0 - 0.3, 0.66], ink: true }); });
  // feed rail across the top
  const RAIL_Y = 2.3;
  cyl(0.022, 3.62, MAT.brass, { parent: g, axis: 'x', at: [0, RAIL_Y - 0.075, ZF], seg: 10 });
  [-1, 1].forEach((s) => cyl(0.03, ZF + 0.03, MAT.brass, { parent: g, axis: 'z', at: [s * 1.84, RAIL_Y - 0.075, ZF / 2], seg: 10 }));
  mesh(new THREE.CylinderGeometry(0.13, 0.05, 0.2, 24, 1, true), MAT.ceramic, { parent: g, at: [0, RAIL_Y + 0.17, ZF], ink: 20 }).material = MAT.ceramic;

  /* ---- the ridge: 49 slices in one buffer ---- */
  const nV = (N + 1) * J * 2, pos = new Float32Array(nV * 3), colr = new Float32Array(nV * 3), nor = new Float32Array(nV * 3);
  const fillIdx = new Uint16Array((N + 1) * (J - 1) * 6), lineIdx = new Uint16Array((N + 1) * (J - 1) * 2);
  for (let n = 0, f = 0, l = 0; n <= N; n++) {
    const b = n * J * 2, sh = lerp(0.84, 1, n / N);
    for (let j = 0; j < J; j++) {
      const v = b + j * 2;
      for (const q of [v, v + 1]) { nor[q * 3 + 2] = 1; colr[q * 3] = sh; colr[q * 3 + 1] = sh * 0.985; colr[q * 3 + 2] = sh * 0.96; }
      if (j < J - 1) { fillIdx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], f); f += 6; lineIdx.set([v, v + 2], l); l += 2; }
    }
  }
  const pAttr = new THREE.BufferAttribute(pos, 3);
  const ridgeGeo = new THREE.BufferGeometry();
  ridgeGeo.setAttribute('position', pAttr); ridgeGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  ridgeGeo.setAttribute('color', new THREE.BufferAttribute(colr, 3)); ridgeGeo.setIndex(new THREE.BufferAttribute(fillIdx, 1));
  const sliceMat = MAT.paperSlice.clone(); sliceMat.vertexColors = true;
  const ridge = new THREE.Mesh(ridgeGeo, sliceMat); ridge.castShadow = true; ridge.receiveShadow = true; ridge.frustumCulled = false; ridge.raycast = () => {};
  const edgeGeo = new THREE.BufferGeometry(); edgeGeo.setAttribute('position', pAttr); edgeGeo.setIndex(new THREE.BufferAttribute(lineIdx, 1));
  const ridgeLines = new THREE.LineSegments(edgeGeo, MAT.ink); ridgeLines.frustumCulled = false; ridgeLines.raycast = () => {};
  g.add(ridge, ridgeLines);
  function writeRidge() {
    const st = ST[S.prior];
    for (let n = 0; n <= N; n++) {
      const ys = st[n].ys, z = Z(n), b = n * J * 2;
      for (let j = 0; j < J; j++) {
        const x = X(j / (J - 1)), y = Y0 + Math.min(ys[j * 2], 9) * U, v = (b + j * 2) * 3;
        pos[v] = x; pos[v + 1] = y; pos[v + 2] = z; pos[v + 3] = x; pos[v + 4] = Y0; pos[v + 5] = z;
      }
    }
    pAttr.needsUpdate = true; S.shown = -1;
  }

  /* ---- the current posterior: red curve, 90% band, mean line ---- */
  const cur = new THREE.Group(); g.add(cur);
  const rPos = new Float32Array(J * 2 * 3), rIdx = [];
  for (let j = 0; j < J - 1; j++) { const v = j * 2; rIdx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  const ribGeo = new THREE.BufferGeometry(); ribGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3)); ribGeo.setIndex(rIdx);
  const rib = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({ color: PAL.sanguine, side: THREE.DoubleSide })); rib.frustumCulled = false; rib.raycast = () => {};
  const BJ = 41, bPos = new Float32Array(BJ * 2 * 3), bIdx = [];
  for (let j = 0; j < BJ - 1; j++) { const v = j * 2; bIdx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  const bandGeo = new THREE.BufferGeometry(); bandGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3)); bandGeo.setIndex(bIdx);
  const band = new THREE.Mesh(bandGeo, MAT.glassRed.clone()); band.material.opacity = 0.3; band.frustumCulled = false; band.raycast = () => {}; band.renderOrder = 1;
  const meanLine = segments([[0, 0, 0], [0, 1, 0]], MAT.inkRed);
  cur.add(band, rib, meanLine);
  // callipers on the fascia mark the 5th and 95th percentiles
  const jawL = box(0.035, 0.2, 0.09, MAT.brass, { parent: g }), jawR = box(0.035, 0.2, 0.09, MAT.brass, { parent: g });
  const span = box(1, 0.028, 0.028, MAT.sanguine, { parent: g, cast: false });

  /* ---- the steelyard ---- */
  const BEAM_Y = -0.98;
  const beamG = new THREE.Group(); beamG.position.set(0, BEAM_Y, ZF); g.add(beamG);
  const beam = box(3.56, 0.05, 0.05, MAT.brass, { parent: beamG, ink: true, inkMat: MAT.inkFaint });
  const btk = []; for (let k = 0; k <= 20; k++) btk.push([X(k / 20), 0.026, 0.027], [X(k / 20), k % 5 ? -0.0 : -0.026, 0.027]);
  beam.add(segments(btk, MAT.ink));
  const fulc = mesh(new THREE.ConeGeometry(0.1, 0.2, 4), MAT.sanguine, { parent: g, ink: 20 }); fulc.rotation.y = Math.PI / 4;
  box(1.9, 0.035, 0.24, MAT.ceramic, { parent: g, at: [X(0.42), BEAM_Y - 0.245, ZF], ink: true });
  cyl(0.025, ZF, MAT.brass, { parent: g, axis: 'z', at: [X(0.42) - 0.8, BEAM_Y - 0.245, ZF / 2], seg: 8 });
  cyl(0.025, ZF, MAT.brass, { parent: g, axis: 'z', at: [X(0.42) + 0.8, BEAM_Y - 0.245, ZF / 2], seg: 8 });
  const PITCH = 0.118, R = 0.054, COLS = 4, RACK_TOP = BEAM_Y - 0.27;
  const racks = [-1, 1].map((s, k) => {
    const rows = k === 0 ? 11 : 6, h = rows * PITCH + 0.08, r = new THREE.Group(); r.position.x = X(k);
    box(0.56, h, 0.02, MAT.boardDeep, { parent: r, at: [0, RACK_TOP - h / 2 + 0.07, -0.075], ink: true, inkMat: MAT.inkFaint });
    r.add(line([[0, 0, 0], [0, RACK_TOP + 0.07 - BEAM_Y, 0]], MAT.ink)); r.position.y = BEAM_Y; r.position.z = ZF;
    r.children[0].position.y -= BEAM_Y; g.add(r); return r;
  });
  const balls = new BallSet(N + 20, R); g.add(balls.mesh);
  const labNo = label('', { size: 0.13, align: 'l', parent: g, at: [X(0) + 0.36, RACK_TOP - 0.1, ZF - 0.06] });
  const labYes = label('', { size: 0.13, align: 'r', parent: g, at: [X(1) - 0.36, RACK_TOP - 0.1, ZF - 0.06] });
  const labPri = [label('', { size: 0.1, align: 'l', parent: g, at: [X(0) + 0.36, RACK_TOP - 0.28, ZF - 0.06], opacity: 0.6 }), label('', { size: 0.1, align: 'r', parent: g, at: [X(1) - 0.36, RACK_TOP - 0.28, ZF - 0.06], opacity: 0.6 })];
  const labBal = label('', { size: 0.105, parent: g, opacity: 0.8 });
  const labN = label('', { size: 0.26, align: 'r', parent: g, at: [1.95, 1.78, 0.006] });
  const labPost = label('', { size: 0.15, align: 'r', parent: g, at: [1.95, 1.47, 0.006] });
  const labCI = label('', { size: 0.12, align: 'r', parent: g, at: [1.95, 1.25, 0.006], opacity: 0.7 });
  label('prior', { size: 0.1, align: 'r', parent: g, at: [1.6, Y0 + 0.5, 0.006], opacity: 0.55 });

  const slot = (side, s) => [X(side) + ((s % COLS) - 1.5) * PITCH, RACK_TOP - Math.floor(s / COLS) * PITCH];
  const isYes = (i) => DATA[i] === '1';
  // for observation i: its slot once racked (after the prior's pseudo-counts)
  const rank = []; { let y = 0, n = 0; for (let i = 0; i < N; i++) rank.push(isYes(i) ? y++ : n++); }

  function state(n) { return ST[S.prior][clamp(n, 0, N)]; }
  function setN(n, user) {
    n = clamp(Math.round(n), 0, N); S.seen = S.sent = n; S.flights.length = 0;
    if (user) S.mode = 'user';
    readout();
  }
  function readout() {
    const s = state(S.seen), p = S.panel;
    labN.setText('n = ' + s.n); labPost.setText('Beta(' + s.a + ', ' + s.b + ')');
    labCI.setText('mean ' + s.mean.toFixed(2) + ' · 90% ' + s.lo.toFixed(2) + ' – ' + s.hi.toFixed(2));
    labNo.setText((s.n - s.k) + ' no'); labYes.setText(s.k + ' yes');
    const pr = PRI[S.prior]; labPri[0].setText('+ ' + pr[1] + ' prior'); labPri[1].setText('+ ' + pr[0] + ' prior');
    if (!p) return;
    out(p, 'seen', s.n + ' / ' + N); out(p, 'yn', s.k + ' / ' + (s.n - s.k)); out(p, 'post', 'Beta(' + s.a + ', ' + s.b + ')');
    out(p, 'mean', s.mean.toFixed(3)); out(p, 'ci', s.lo.toFixed(2) + ' – ' + s.hi.toFixed(2));
    out(p, 'say', BY.fmtText(s));
    const sl = $(p, '[data-k="n"]'); if (sl && +sl.value !== s.n) sl.value = s.n;
  }
  function setPrior(name) {
    if (!PRI[name]) return; S.prior = name; writeRidge(); readout();
    if (S.panel) $$(S.panel, 'input[name="bayes-prior"]').forEach((r) => { r.checked = r.value === name; });
  }

  /* ---- drawing the current state ---- */
  function drawCurrent() {
    const n0 = Math.floor(S.nf), n1 = Math.min(N, n0 + 1), f = S.nf - n0, A = state(n0), Bq = state(n1), z = Z(S.nf) + 0.012;
    const yAt = (t) => { const u = t * (P - 1), i = Math.min(P - 2, Math.floor(u)), w = u - i; return Math.min(9, lerp(lerp(A.ys[i], A.ys[i + 1], w), lerp(Bq.ys[i], Bq.ys[i + 1], w), f)) * U; };
    const hw = 0.016;
    for (let j = 0; j < J; j++) {
      const t = j / (J - 1), y = Y0 + yAt(t), x = X(t), v = j * 6;
      const t2 = Math.min(1, t + 0.01), t1 = Math.max(0, t - 0.01), dy = yAt(t2) - yAt(t1), dx = 3.4 * (t2 - t1), L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * hw, ny = (dx / L) * hw;
      rPos[v] = x + nx; rPos[v + 1] = y + ny; rPos[v + 2] = z; rPos[v + 3] = x - nx; rPos[v + 4] = y - ny; rPos[v + 5] = z;
    }
    ribGeo.attributes.position.needsUpdate = true;
    const lo = lerp(A.lo, Bq.lo, f), hi = lerp(A.hi, Bq.hi, f), mean = lerp(A.mean, Bq.mean, f);
    for (let j = 0; j < BJ; j++) {
      const t = lerp(lo, hi, j / (BJ - 1)), v = j * 6;
      bPos[v] = X(t); bPos[v + 1] = Y0 + yAt(t); bPos[v + 2] = z - 0.004; bPos[v + 3] = X(t); bPos[v + 4] = Y0; bPos[v + 5] = z - 0.004;
    }
    bandGeo.attributes.position.needsUpdate = true;
    const mp = meanLine.geometry.attributes.position; mp.setXYZ(0, X(mean), Y0, z + 0.002); mp.setXYZ(1, X(mean), Y0 + yAt(mean), z + 0.002); mp.needsUpdate = true;
    jawL.position.set(X(lo), Y0 + 0.02, 1.56); jawR.position.set(X(hi), Y0 + 0.02, 1.56);
    span.position.set(X((lo + hi) / 2), Y0 + 0.09, 1.56); span.scale.x = Math.max(0.01, X(hi) - X(lo));
    const shown = Math.min(N, Math.ceil(S.nf - 1e-4));
    ridgeGeo.setDrawRange(0, (shown + 1) * (J - 1) * 6); edgeGeo.setDrawRange(0, (shown + 1) * (J - 1) * 2);
  }
  function drawBalls() {
    const pr = PRI[S.prior], px = X(S.ful), lift = (x) => S.tilt * (x - px);
    let q = 0;
    for (let i = 0; i < N; i++) {
      const yes = isYes(i), side = yes ? 1 : 0;
      const fl = S.flights.find((f) => f.i === i);
      if (i >= S.sent) { balls.hide(i); continue; }
      const [sx, sy0] = slot(side, rank[i] + pr[yes ? 0 : 1]), sy = sy0 + lift(X(side));
      if (!fl) { balls.set(i, sx, sy, ZF, 1); continue; }
      const p = fl.p, dir = yes ? 1 : -1;
      if (p < 0.42) { const u = ease.io(p / 0.42); balls.set(i, dir * 1.7 * u, RAIL_Y, ZF, Math.min(1, p * 12)); }
      else { const u = (p - 0.42) / 0.58; balls.set(i, lerp(dir * 1.7, sx, ease.out(u)), lerp(RAIL_Y, sy, u * u), ZF, 1); }
    }
    for (let k = 0; k < 20; k++) {
      const side = k < 10 ? 0 : 1, j = k % 10, cnt = pr[side === 1 ? 0 : 1];
      if (j < cnt) { const [sx, sy] = slot(side, j); balls.set(N + k, sx, sy + lift(X(side)), ZF, 0.86); } else balls.hide(N + k);
      q++;
    }
    balls.commit();
    beamG.position.x = px; beam.position.x = -px; beamG.rotation.z = S.tilt;
    racks[0].position.y = BEAM_Y + lift(X(0)); racks[1].position.y = BEAM_Y + lift(X(1));
    fulc.position.set(px, BEAM_Y - 0.125, ZF);
    labBal.position.set(px, BEAM_Y + 0.16, ZF - 0.06); labBal.setText('balances at ' + S.ful.toFixed(2));
  }
  for (let i = 0; i < N; i++) balls.color(i, isYes(i) ? PAL.yes : PAL.no);
  for (let k = 0; k < 20; k++) balls.color(N + k, PAL.ghost);

  /* ---- time ---- */
  function update(dt, time, env) {
    if (S.mode === 'auto' && dt > 0) {
      S.clock += dt;
      if (S.sent < N) { while (S.clock > 0.42 && S.sent < N) { S.clock -= 0.42; S.flights.push({ i: S.sent, p: 0 }); S.sent++; } }
      else if (S.seen >= N) { S.hold += dt; if (S.hold > 7) { S.hold = 0; S.clock = 0; S.seen = S.sent = 0; readout(); } }
    }
    let landed = false;
    for (const f of S.flights) { f.p += dt / 0.9; if (f.p >= 1) { landed = true; S.seen = Math.max(S.seen, f.i + 1); } }
    if (landed) { S.flights = S.flights.filter((f) => f.p < 1); readout(); }
    const rdt = env.rdt;
    S.nf = Math.abs(S.nf - S.seen) < 0.002 ? S.seen : damp(S.nf, S.seen, S.seen < S.nf ? 9 : 14, rdt);
    if (S.nf !== S.shown) { drawCurrent(); S.shown = S.nf; }
    // the beam dips toward the new weight, the fulcrum slides under the new centre of mass, the beam levels
    const mean = state(S.seen).mean;
    S.ful = Math.abs(S.ful - mean) < 1e-4 ? mean : damp(S.ful, mean, 5, rdt);
    const want = clamp(-(mean - S.ful) * 2.2, -0.05, 0.05);
    S.tiltV += (220 * (want - S.tilt) - 16 * S.tiltV) * rdt; S.tilt += S.tiltV * rdt;
    drawBalls();
  }
  function reset() { S.mode = 'auto'; S.prior = 'flat'; S.clock = 0; S.hold = 0; writeRidge(); setN(0); setPrior('flat'); }
  function settle() { S.mode = 'user'; setN(N); S.nf = N; S.ful = state(N).mean; }
  function bind(p) {
    S.panel = p;
    const sl = $(p, '[data-k="n"]');
    if (sl) sl.addEventListener('input', () => setN(+sl.value, true));
    $$(p, 'input[name="bayes-prior"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) setPrior(r.value); }));
    const rp = $(p, '[data-k="replay"]'); if (rp) rp.addEventListener('click', () => { S.mode = 'auto'; S.clock = 0.3; S.hold = 0; setN(0); });
    readout();
  }
  writeRidge(); readout();

  return { id: 'bayes', fig: 'Fig. I', title: 'Bayesian updating', plate: 0, group: g, anchor: [-1.45, 3.14, 0.7],
    view: { pitch: 0.26, yaw: -0.2, w: 5.2, h: 6.2, cy: -0.1, cz: 0.8 }, update, reset, settle, bind };
}
