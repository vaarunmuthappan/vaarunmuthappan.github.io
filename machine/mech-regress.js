/* mech-regress.js: Fig. II, the line of least squares.

   Twelve fixed observations are pins in the plate; they never move. A brass rod is the line
   y = a + b (x - xbar). Each pin is tied to the rod by a spring that can only stretch vertically,
   so its length is the residual e_i = y_i - yhat_i, and an ideal spring stores energy in
   proportion to e_i squared. The rod is therefore pulled toward the minimum of the sum of squared
   residuals. With x centred the two motions separate exactly:
       -dE/da = k * sum(e_i)            = k * n   * (ybar - a)
       -dE/db = k * sum(e_i (x_i-xbar)) = k * Sxx * (Sxy/Sxx - b)
   so the rod comes to rest at a = ybar, b = Sxy / Sxx: ordinary least squares, not an eased
   animation toward a stored answer. Each square drawn on a spring has the residual as its side,
   so its area is that observation's share of the sum. The trough below adds them up. */
import { THREE, PAL, MAT, mesh, box, cyl, line, segments, label, clamp, lerp, damp, out, $, fmt, rng } from './kit.js';

const PTS = [[0.9, 2.1], [1.6, 3.6], [2.4, 2.6], [3.1, 4.4], [3.9, 3.5], [4.6, 5.3], [5.3, 4.2], [6.0, 6.3], [6.8, 5.2], [7.5, 7.1], [8.3, 5.9], [9.1, 7.6]];

export function createRegress() {
  const g = new THREE.Group(), n = PTS.length, SC = 0.35, ZR = 0.42;
  const px = (x) => -1.75 + SC * x, py = (y) => -1.45 + SC * y;
  let xb = 0, yb = 0, sxx = 0, sxy = 0;
  PTS.forEach((p) => { xb += p[0] / n; yb += p[1] / n; });
  PTS.forEach((p) => { sxx += (p[0] - xb) ** 2; sxy += (p[0] - xb) * (p[1] - yb); });
  const B = sxy / sxx, A = yb;
  const sse = (a, b) => PTS.reduce((s, p) => s + (p[1] - a - b * (p[0] - xb)) ** 2, 0);
  const MIN = sse(A, B), FULL = 60;
  const S = { a: A + 2.2, b: B - 0.5, va: 0, vb: 0, hold: false, grab: null, knock: 3, quiet: 0, panel: null };
  const rnd = rng(11);

  /* ---- axes ---- */
  const ax = [[px(0), py(0), 0.004], [px(10), py(0), 0.004], [px(0), py(0), 0.004], [px(0), py(10), 0.004]];
  for (let k = 0; k <= 10; k += 2) { ax.push([px(k), py(0), 0.004], [px(k), py(0) - 0.06, 0.004], [px(0), py(k), 0.004], [px(0) - 0.06, py(k), 0.004]); }
  g.add(segments(ax, MAT.ink));
  for (let k = 2; k <= 10; k += 2) {
    label(String(k), { size: 0.095, italic: false, parent: g, at: [px(k), py(0) - 0.15], opacity: 0.6 });
    label(String(k), { size: 0.095, italic: false, align: 'r', parent: g, at: [px(0) - 0.1, py(k)], opacity: 0.6 });
  }
  label('x', { size: 0.13, parent: g, at: [px(10) + 0.13, py(0)] }); label('y', { size: 0.13, parent: g, at: [px(0), py(10) + 0.14] });

  /* ---- pins (the observations) ---- */
  const pinGeo = new THREE.CylinderGeometry(0.022, 0.022, ZR, 8); pinGeo.rotateX(Math.PI / 2);
  const headGeo = new THREE.SphereGeometry(0.062, 18, 12);
  PTS.forEach((p) => {
    mesh(pinGeo, MAT.brass, { parent: g, at: [px(p[0]), py(p[1]), ZR / 2] });
    mesh(headGeo, MAT.inkSolid, { parent: g, at: [px(p[0]), py(p[1]), ZR] });
  });

  /* ---- the rod ---- */
  const rod = new THREE.Group(); g.add(rod);
  const bar = cyl(0.028, SC * 10.8, MAT.brass, { parent: rod, axis: 'x', seg: 12 });
  const knobGeo = new THREE.SphereGeometry(0.085, 20, 14);
  const knobs = [mesh(knobGeo, MAT.ceramic, { parent: g, ink: 20 }), mesh(knobGeo, MAT.ceramic, { parent: g, ink: 20 })];
  const mid = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 16), MAT.sanguine, { parent: rod }); mid.rotation.z = Math.PI / 2;

  /* ---- springs and squares ---- */
  const K = 13, sp = new Float32Array(n * (K - 1) * 2 * 3);
  const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const springs = new THREE.LineSegments(spGeo, MAT.ink); springs.frustumCulled = false; springs.raycast = () => {}; g.add(springs);
  const sqGeo = new THREE.PlaneGeometry(1, 1), sqMat = MAT.glassRed.clone(); sqMat.opacity = 0.17;
  const squares = PTS.map(() => {
    const m = new THREE.Mesh(sqGeo, sqMat); m.raycast = () => {}; m.renderOrder = 1;
    m.add(line([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], MAT.inkRed, true)); g.add(m); return m;
  });

  /* ---- the trough that totals the squares ---- */
  const GY = -2.12, GX0 = -1.75, GW = 3.5;
  box(GW + 0.08, 0.2, 0.05, MAT.ceramic, { parent: g, at: [0, GY, 0.025], ink: true });
  const fill = box(1, 0.11, 0.03, MAT.sanguine, { parent: g, at: [0, GY, 0.06], cast: false });
  const notch = GX0 + (MIN / FULL) * GW;
  g.add(segments([[notch, GY - 0.19, 0.06], [notch, GY + 0.13, 0.06]], MAT.ink));
  label('least', { size: 0.1, parent: g, at: [notch, GY - 0.27, 0.01], opacity: 0.7 });
  const labS = label('', { size: 0.13, align: 'l', parent: g, at: [GX0 - 0.02, GY + 0.27, 0.01] });
  const labEq = label('', { size: 0.15, align: 'l', parent: g, at: [-1.6, 2.32, 0.01] });

  function draw() {
    const { a, b } = S, yl = a + b * (0 - xb), yr = a + b * (10 - xb), ang = Math.atan(b);
    rod.position.set(px(5), py(a + b * (5 - xb)), ZR); rod.rotation.z = ang; bar.scale.x = 1 / Math.cos(ang);
    knobs[0].position.set(px(-0.3), py(a + b * (-0.3 - xb)), ZR); knobs[1].position.set(px(10.3), py(a + b * (10.3 - xb)), ZR);
    let o = 0, total = 0;
    PTS.forEach((p, i) => {
      const yh = a + b * (p[0] - xb), e = p[1] - yh, x = px(p[0]), y0 = py(p[1]), y1 = py(yh), len = y1 - y0; total += e * e;
      // a coil from pin to rod, straight leads at each end
      let lx = x, ly = y0;
      for (let k = 1; k < K; k++) {
        const t = k / (K - 1), u = 0.1 + 0.8 * ((k - 0.5) / (K - 2));
        const nx = k === K - 1 ? x : x + (k % 2 ? 0.045 : -0.045), ny = k === K - 1 ? y1 : y0 + len * u;
        sp[o++] = lx; sp[o++] = ly; sp[o++] = ZR; sp[o++] = nx; sp[o++] = ny; sp[o++] = ZR; lx = nx; ly = ny;
      }
      const side = Math.max(1e-4, Math.abs(len)), dir = p[0] < 7.6 ? 1 : -1, s = squares[i];
      s.position.set(x + dir * side / 2, (y0 + y1) / 2, 0.012 + i * 0.0006); s.scale.set(side, side, 1);
    });
    spGeo.attributes.position.needsUpdate = true;
    const w = clamp(total / FULL, 0.002, 1) * GW; fill.scale.x = w; fill.position.x = GX0 + w / 2;
    const b0 = a - b * xb;
    labS.setText('sum of squares  ' + total.toFixed(2)); labEq.setText('ŷ = ' + fmt(b0, 2) + ' + ' + fmt(b, 2) + ' x');
    const p = S.panel; if (!p) return;
    out(p, 'eq', 'ŷ = ' + fmt(b0, 2) + (b < 0 ? ' − ' : ' + ') + Math.abs(b).toFixed(2) + ' x');
    out(p, 'sse', total.toFixed(2)); out(p, 'min', MIN.toFixed(2)); out(p, 'over', '+' + Math.max(0, total - MIN).toFixed(2));
    const sb = $(p, '[data-k="slope"]'), si = $(p, '[data-k="icpt"]');
    if (sb && document.activeElement !== sb) sb.value = b.toFixed(2);
    if (si && document.activeElement !== si) si.value = b0.toFixed(2);
    const st = total - MIN < 0.005 ? 'At rest on the least-squares line.' : S.hold || S.grab ? 'Held away from the minimum.' : 'Springs pulling the rod in.';
    out(p, 'state', st);
  }
  function setHold(h) { S.hold = h; const c = S.panel && $(S.panel, '[data-k="hold"]'); if (c) c.checked = h; if (!h) { S.va = S.vb = 0; } }
  function kick() { setHold(false); S.va = (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 5); S.vb = (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 1.6); S.knock = 0; }

  function update(dt, time, env) {
    const rdt = env.rdt;
    if (!S.grab && !S.hold) {
      // semi-implicit steps of the spring equations; runs on real time so a released rod settles even when paused
      const steps = 3, h = Math.min(rdt, 0.033) / steps, wa = 7.6, wb = 5.6, z = 0.3;
      for (let k = 0; k < steps; k++) {
        S.va += (wa * wa * (A - S.a) - 2 * z * wa * S.va) * h; S.a += S.va * h;
        S.vb += (wb * wb * (B - S.b) - 2 * z * wb * S.vb) * h; S.b += S.vb * h;
      }
      if (Math.abs(S.a - A) < 1e-4 && Math.abs(S.b - B) < 1e-4 && Math.abs(S.va) < 1e-3 && Math.abs(S.vb) < 1e-3) { S.a = A; S.b = B; S.va = S.vb = 0; }
      S.quiet += rdt; S.knock += dt;
      if (S.knock > (env.focused ? 16 : 8.5) && S.quiet > 6) kick();
    }
    draw();
  }
  /* ---- taking hold of the rod ---- */
  const hitP = new THREE.Vector3();
  function at(ray) {
    if (Math.abs(ray.direction.z) < 1e-5) return null;
    const t = (ZR - ray.origin.z) / ray.direction.z; if (t < 0) return null;
    ray.at(t, hitP); return { x: (hitP.x + 1.75) / SC, y: (hitP.y + 1.45) / SC };
  }
  function pointer(type, ray) {
    if (type === 'up') { S.grab = null; S.quiet = 0; S.knock = 0; S.va = S.vb = 0; return; }
    const p = at(ray); if (!p) return false;
    const yh = S.a + S.b * (p.x - xb);
    if (type === 'hover') return p.x > -0.8 && p.x < 10.8 && Math.abs(p.y - yh) < 0.6;
    if (type === 'down') {
      if (!(p.x > -0.8 && p.x < 10.8 && Math.abs(p.y - yh) < 0.7)) return false;
      const mode = p.x < 3.4 ? 'L' : p.x > 6.6 ? 'R' : 'T', xp = mode === 'L' ? 10 : 0;
      S.grab = { mode, xg: p.x, xp, yp: S.a + S.b * (xp - xb), off: yh - p.y }; S.va = S.vb = 0;
      return true;
    }
    if (type === 'move' && S.grab) {
      const G = S.grab, y = clamp(p.y + G.off, -3, 13);
      if (G.mode === 'T') S.a = y - S.b * (G.xg - xb);
      else { S.b = clamp((y - G.yp) / (G.xg - G.xp), -1.6, 2.6); S.a = G.yp + S.b * (xb - G.xp); }
      S.quiet = 0;
    }
    return true;
  }
  function bind(p) {
    S.panel = p;
    const sb = $(p, '[data-k="slope"]'), si = $(p, '[data-k="icpt"]'), hd = $(p, '[data-k="hold"]');
    const fromSliders = () => { setHold(true); S.b = +sb.value; S.a = +si.value + S.b * xb; S.quiet = 0; };
    if (sb) sb.addEventListener('input', fromSliders); if (si) si.addEventListener('input', fromSliders);
    if (hd) hd.addEventListener('change', () => setHold(hd.checked));
    const go = $(p, '[data-k="release"]'); if (go) go.addEventListener('click', () => { setHold(false); S.quiet = 0; S.knock = 0; });
    const kn = $(p, '[data-k="knock"]'); if (kn) kn.addEventListener('click', kick);
    out(p, 'ols', 'ŷ = ' + fmt(A - B * xb, 2) + ' + ' + fmt(B, 2) + ' x');
  }
  function reset() { setHold(false); S.a = A + 2.2; S.b = B - 0.5; S.va = S.vb = 0; S.knock = 3; }
  function settle() { setHold(false); S.a = A; S.b = B; S.va = S.vb = 0; }

  return { id: 'regression', fig: 'Fig. II', title: 'Least squares', plate: 1, group: g, anchor: [-1.45, 3.14, 0.7],
    view: { pitch: 0.1, w: 4.9, h: 5.9, cz: 0.3 }, update, reset, settle, bind, pointer };
}
