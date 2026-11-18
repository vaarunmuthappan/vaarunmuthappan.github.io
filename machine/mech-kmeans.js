/* mech-kmeans.js: Fig. V, k-means on the table that crowns the machine.

   36 fixed synthetic points stand on the table as pins. k centroids are the taller posts. The
   mechanism is Lloyd's algorithm and nothing else, in its two alternating half-steps:
     assign  every pin takes the colour of its nearest centroid (the tinted regions on the table
             are exactly those nearest-centroid cells);
     update  every centroid moves to the mean of the pins assigned to it.
   It stops when an assign step changes nothing. The within-cluster sum of squares never increases
   from one half-step to the next, which is why it must stop; but where it stops depends on the
   starting centroids (k distinct data points chosen at random), so different starts can settle on
   different answers. */
import { THREE, PAL, MAT, mesh, cyl, label, BallSet, clamp, lerp, damp, ease, out, $, $$, rng, col } from './kit.js';

const CL = [PAL.sanguine, PAL.prussian, PAL.ochre, PAL.verdigris], CLC = CL.map((c) => col(c));
function makePoints() {
  const r = rng(77), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2832 * r()), pts = [];
  const C = [[-1.25, -0.95, 0.62, 0.5], [1.35, -0.55, 0.5, 0.66], [0.05, 1.45, 0.78, 0.46]];
  C.forEach((c) => { for (let i = 0; i < 12; i++) { let x = c[0] + g() * c[2], z = c[1] + g() * c[3]; const d = Math.hypot(x, z); if (d > 2.7) { x *= 2.7 / d; z *= 2.7 / d; } pts.push([x, z]); } });
  return pts;
}

export function createKmeans() {
  const g = new THREE.Group(), PTS = makePoints(), N = PTS.length, HY = 0.34, CY = 0.82;
  const S = { k: 3, c: [], from: [], to: [], asg: new Array(N).fill(-1), shown: new Array(N).fill(-1), step: 'assign', t: 0, wait: 0.8, iter: 0, done: false, manual: false, hist: [], panel: null, wave: null, focused: false, dirty: true };

  /* ---- nearest-centroid cells, washed onto the table ---- */
  const RES = 224, cv = document.createElement('canvas'); cv.width = cv.height = RES;
  const cx = cv.getContext('2d'), img = cx.createImageData(RES, RES);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const wash = new THREE.Mesh(new THREE.CircleGeometry(3.05, 72), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  wash.rotation.x = -Math.PI / 2; wash.position.y = 0.032; wash.raycast = () => {}; g.add(wash);
  function paintCells() {
    const d = img.data;
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      // circle geometry maps u,v over [-3.05, 3.05]; after the -90 degree turn, v runs toward -z
      const x = (i / (RES - 1) - 0.5) * 6.1, z = (j / (RES - 1) - 0.5) * 6.1; let b = 0, s2 = 0, bd = 1e9, sd = 1e9;
      for (let c = 0; c < S.k; c++) { const q = S.c[c], dd = (x - q[0]) ** 2 + (z - q[1]) ** 2; if (dd < bd) { sd = bd; s2 = b; bd = dd; b = c; } else if (dd < sd) { sd = dd; s2 = c; } }
      // distance to the boundary between the two nearest cells, used to soften and to rule the edge
      const edge = Math.sqrt(sd) - Math.sqrt(bd), w = Math.min(1, 0.5 + edge / 0.06), o = (j * RES + i) * 4, A = CLC[b], B = CLC[s2];
      d[o] = (A.r * w + B.r * (1 - w)) * 255; d[o + 1] = (A.g * w + B.g * (1 - w)) * 255; d[o + 2] = (A.b * w + B.b * (1 - w)) * 255;
      d[o + 3] = 24 + 62 * Math.max(0, 1 - edge / 0.09);
    }
    cx.putImageData(img, 0, 0); tex.needsUpdate = true;
  }

  /* ---- pins, centroid posts, threads ---- */
  const pinGeo = new THREE.CylinderGeometry(0.018, 0.018, HY, 6); pinGeo.translate(0, HY / 2, 0);
  const pins = new THREE.InstancedMesh(pinGeo, MAT.brass, N); pins.castShadow = true; pins.raycast = () => {};
  const m4 = new THREE.Matrix4(); PTS.forEach((p, i) => pins.setMatrixAt(i, m4.makeTranslation(p[0], 0.03, p[1]))); g.add(pins);
  const heads = new BallSet(N, 0.078); g.add(heads.mesh);
  PTS.forEach((p, i) => heads.set(i, p[0], HY + 0.05, p[1]));
  const posts = [0, 1, 2, 3].map((k) => {
    const o = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: CL[k], roughness: 0.4 });
    cyl(0.032, CY, MAT.brass, { parent: o, at: [0, CY / 2 + 0.03, 0], seg: 10 });
    mesh(new THREE.OctahedronGeometry(0.15), mat, { parent: o, at: [0, CY + 0.12, 0], ink: 1 });
    mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 28), mat, { parent: o, at: [0, 0.045, 0] });
    g.add(o); return o;
  });
  const tp = new Float32Array(N * 6), tc = new Float32Array(N * 6), tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const threads = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })); threads.frustumCulled = false; threads.raycast = () => {}; g.add(threads);
  const info = label('', { size: 0.15, parent: g, at: [0, 0.036, 3.02], rot: [-Math.PI / 2, 0, 0] });
  info.position.set(0, 0.036, 2.92);

  /* ---- Lloyd's algorithm ---- */
  const d2 = (p, c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
  const nearest = (p) => { let b = 0, bd = 1e9; for (let c = 0; c < S.k; c++) { const dd = d2(p, S.c[c]); if (dd < bd) { bd = dd; b = c; } } return b; };
  const wcss = () => PTS.reduce((s, p, i) => s + (S.asg[i] < 0 ? 0 : d2(p, S.c[S.asg[i]])), 0);
  function seed() {              // k distinct data points, chosen at random
    const idx = PTS.map((_, i) => i); for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    S.c = idx.slice(0, S.k).map((i) => PTS[i].slice()); S.asg.fill(-1); S.shown.fill(-1); S.step = 'assign'; S.t = 0; S.wait = 0.9; S.iter = 0; S.done = false; S.hist = []; S.wave = null; S.dirty = true;
    readout();
  }
  function assign() {
    let changed = 0; const order = [];
    PTS.forEach((p, i) => { const a = nearest(p); if (a !== S.asg[i]) changed++; S.asg[i] = a; order.push([i, Math.sqrt(d2(p, S.c[a]))]); });
    S.wave = { t: 0, order }; S.hist.push(wcss());
    if (!changed) { S.done = true; S.step = 'done'; } else { S.step = 'update'; S.iter++; }
    readout(); return changed;
  }
  function beginUpdate() {
    S.from = S.c.map((c) => c.slice());
    S.to = S.c.map((c, k) => { let x = 0, z = 0, n = 0; PTS.forEach((p, i) => { if (S.asg[i] === k) { x += p[0]; z += p[1]; n++; } }); return n ? [x / n, z / n] : c.slice(); });   // an empty cluster keeps its centroid
    S.t = 0; S.step = 'moving';
  }
  function endUpdate() { S.c = S.to.map((c) => c.slice()); S.hist.push(wcss()); S.step = 'assign'; S.dirty = true; readout(); }
  function advance() {           // one half-step, used by the Step button
    if (S.step === 'done') return;
    if (S.step === 'assign') assign(); else if (S.step === 'update') beginUpdate(); else if (S.step === 'moving') { S.t = 1; }
  }
  function readout() {
    const w = S.hist.length ? S.hist[S.hist.length - 1] : null;
    info.setText(S.done ? 'settled after ' + S.iter + ' updates' : S.iter ? 'update ' + S.iter : 'k = ' + S.k);
    const p = S.panel; if (!p) return;
    out(p, 'iter', String(S.iter)); out(p, 'wcss', w === null ? '—' : w.toFixed(2));
    out(p, 'state', S.done ? 'Settled.' : S.step === 'assign' ? 'Next: assign.' : 'Next: update.');
    $$(p, '[data-kk]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.kk === S.k ? 'true' : 'false'));
    const sv = $(p, '[data-k="spark"]');
    if (sv) {
      const h = S.hist, mx = Math.max(1, ...h), n = Math.max(2, h.length);
      const pts = h.map((v, i) => (6 + (i / (n - 1)) * 188).toFixed(1) + ',' + (44 - (v / mx) * 36).toFixed(1));
      sv.innerHTML = '<path d="M6 44H194" class="ax"/>' + (h.length > 1 ? '<polyline points="' + pts.join(' ') + '"/>' : '') + h.map((v, i) => '<circle cx="' + (6 + (i / (n - 1)) * 188).toFixed(1) + '" cy="' + (44 - (v / mx) * 36).toFixed(1) + '" r="2.2"/>').join('');
    }
  }

  function update(dt, time, env) {
    S.focused = env.focused;
    const live = S.manual ? 0 : dt;
    if (S.step === 'moving') {
      S.t += (S.manual ? env.rdt : dt) / 0.95; const e = ease.io(Math.min(1, S.t));
      S.c = S.from.map((f, k) => [lerp(f[0], S.to[k][0], e), lerp(f[1], S.to[k][1], e)]); S.dirty = true;
      if (S.t >= 1) { endUpdate(); S.wait = 0.55; }
    } else if (live > 0) {
      S.wait -= live;
      if (S.wait <= 0) {
        if (S.step === 'assign') { assign(); S.wait = S.done ? (S.focused ? 7 : 4.5) : 1.0; }
        else if (S.step === 'update') beginUpdate();
        else if (S.step === 'done') seed();
      }
    }
    // the colour change travels outward from each centroid
    if (S.wave) {
      S.wave.t += env.rdt / 0.75; const reach = S.wave.t * 3.2;
      S.wave.order.forEach(([i, d]) => { if (d <= reach && S.shown[i] !== S.asg[i]) { S.shown[i] = S.asg[i]; heads.color(i, CL[S.asg[i]]); } });
      if (S.wave.t >= 1.4) S.wave = null;
    }
    for (let i = 0; i < N; i++) {
      const a = S.shown[i], p = PTS[i], o = i * 6;
      if (a < 0) { heads.color(i, PAL.no); tp[o] = tp[o + 3] = p[0]; tp[o + 1] = tp[o + 4] = HY; tp[o + 2] = tp[o + 5] = p[1]; continue; }
      const c = S.c[Math.min(a, S.k - 1)], cc = CLC[a];
      tp[o] = p[0]; tp[o + 1] = HY + 0.05; tp[o + 2] = p[1]; tp[o + 3] = c[0]; tp[o + 4] = CY + 0.12; tp[o + 5] = c[1];
      tc[o] = tc[o + 3] = cc.r; tc[o + 1] = tc[o + 4] = cc.g; tc[o + 2] = tc[o + 5] = cc.b;
    }
    tg.attributes.position.needsUpdate = true; tg.attributes.color.needsUpdate = true; heads.commit();
    posts.forEach((o, k) => { o.visible = k < S.k; if (k < S.k) o.position.set(S.c[k][0], 0, S.c[k][1]); });
    if (S.dirty) { paintCells(); S.dirty = false; }
  }
  function setK(k) { S.k = clamp(k, 2, 4); seed(); }
  function bind(p) {
    S.panel = p;
    const st = $(p, '[data-k="step"]'); if (st) st.addEventListener('click', () => { S.manual = true; if (S.step === 'done') seed(); else advance(); syncMode(); });
    const run = $(p, '[data-k="run"]'); if (run) run.addEventListener('click', () => { S.manual = false; S.wait = 0.2; if (S.step === 'done') seed(); syncMode(); });
    const ns = $(p, '[data-k="seed"]'); if (ns) ns.addEventListener('click', () => { seed(); S.wait = 0.6; });
    $$(p, '[data-kk]').forEach((b) => b.addEventListener('click', () => setK(+b.dataset.kk)));
    const syncMode = () => { if (run) run.setAttribute('aria-pressed', S.manual ? 'false' : 'true'); };
    syncMode(); readout();
  }
  function reset() { S.manual = false; S.k = 3; seed(); }
  function settle() { S.manual = true; let guard = 0; while (!S.done && guard++ < 60) { if (S.step === 'assign') assign(); else { beginUpdate(); endUpdate(); } } S.shown = S.asg.slice(); S.shown.forEach((a, i) => heads.color(i, CL[a])); S.wave = null; S.dirty = true; }
  seed();

  return { id: 'clusters', fig: 'Fig. V', title: 'k-means', mount: 'top', group: g, anchor: [-2.3, 0.5, -2.3],
    view: { pitch: 0.98, w: 9.4, h: 9.0 }, update, reset, settle, bind, _: { PTS } };
}
