/* mech-shuffle.js: Fig. IV, a randomisation (permutation) test for an A/B comparison.

   The same 48 synthetic yes/no observations as Fig. I (14 yes, 34 no), here split into two groups
   of 24. The observed split is an illustration: by default B has 10 yes and A has 4, a difference
   in yes-rate of +0.25. The null hypothesis says the group labels are arbitrary. So the machine
   does what that hypothesis licenses: it shuffles all 48 balls, deals 24 to each tray, and records
   the difference. The bars are the differences seen so far; the p-value is the share of shuffles
   at least as far from zero as the observed difference (two-sided).

   Nothing is approximated in the reference curve: with K yes dealt to B,
   K ~ Hypergeometric(48, 14, 24), difference = (2K - 14) / 24, and the outline behind the bars is
   that exact distribution. The simulated bars converge on it as shuffles accumulate. */
import { THREE, PAL, MAT, mesh, box, cyl, line, segments, label, BallSet, clamp, lerp, damp, ease, out, $ } from './kit.js';

const NT = 48, NY = 14, HALF = 24;
const LF = [0]; for (let i = 1; i <= NT; i++) LF[i] = LF[i - 1] + Math.log(i);
const lC = (n, k) => (k < 0 || k > n ? -Infinity : LF[n] - LF[k] - LF[n - k]);
const EXACT = []; for (let k = 0; k <= NY; k++) EXACT.push(Math.exp(lC(NY, k) + lC(NT - NY, HALF - k) - lC(NT, HALF)));
const PMAX = Math.max(...EXACT);
const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);

export function createShuffle() {
  const g = new THREE.Group(), R = 0.07, ZB = 0.12, PITCH = 0.165;
  const TRAY = [-1.22, 1.22], TY = 1.72, DR = [0, 1.72];
  const HX = (k) => -1.68 + 0.24 * k, HY = -2.0, HMAX = 2.35;
  const S = { obs: 10, slotOf: [], counts: new Array(NY + 1).fill(0), total: 0, anim: null, token: null, clock: 1.2, batch: 0, bars: new Array(NY + 1).fill(0), spin: 0, spinV: 0.6, panel: null, shown: 0, focused: false, lastK: null };
  const extreme = (k) => Math.abs(k - NY / 2) >= Math.abs(S.obs - NY / 2) - 1e-9;
  const pExact = () => EXACT.reduce((s, p, k) => s + (extreme(k) ? p : 0), 0);

  /* ---- trays, drum ---- */
  TRAY.forEach((tx, s) => {
    box(1.14, 0.82, 0.04, MAT.boardDeep, { parent: g, at: [tx, TY, 0.02], ink: true });
    label(s ? 'B' : 'A', { size: 0.2, parent: g, at: [tx - 0.42, TY + 0.57, 0.01] });
    label(s ? 'treatment' : 'control', { size: 0.1, align: 'l', parent: g, at: [tx - 0.27, TY + 0.555, 0.01], opacity: 0.6 });
  });
  const trayLab = TRAY.map((tx) => label('', { size: 0.115, parent: g, at: [tx, TY - 0.56, 0.01] }));
  const drum = new THREE.Group(); drum.position.set(DR[0], DR[1], 0.14); g.add(drum);
  mesh(new THREE.TorusGeometry(0.36, 0.028, 10, 48), MAT.brass, { parent: drum });
  for (let k = 0; k < 3; k++) { const sp = box(0.66, 0.03, 0.03, MAT.brass, { parent: drum }); sp.rotation.z = (k * Math.PI) / 3; }
  cyl(0.06, 0.3, MAT.brass, { parent: g, axis: 'z', at: [DR[0], DR[1], 0.15], seg: 16 });
  mesh(new THREE.CircleGeometry(0.4, 40), MAT.boardDeep, { parent: g, at: [DR[0], DR[1], 0.006], cast: false });
  const stateLab = label('as observed', { size: 0.11, parent: g, at: [0, TY + 0.57, 0.01], opacity: 0.7 });
  const diffLab = label('', { size: 0.125, parent: g, at: [0, TY - 0.72, 0.01] });

  /* ---- histogram ---- */
  box(3.74, 0.04, 0.3, MAT.ceramic, { parent: g, at: [0, HY - 0.02, 0.15], ink: true });
  const barGeo = new THREE.BoxGeometry(0.2, 1, 0.16); barGeo.translate(0, 0.5, 0);
  const matIn = new THREE.MeshStandardMaterial({ color: 0x9F968A, roughness: 0.62 }), matTail = MAT.sanguine.clone();
  const bars = EXACT.map((p, k) => { const b = mesh(barGeo, matIn, { parent: g, at: [HX(k), HY, 0.1] }); b.scale.y = 0.0001; return b; });
  const outline = line(new Array((NY + 1) * 2).fill([0, 0, 0]), MAT.ink); g.add(outline);
  const marks = segments(new Array(4).fill([0, 0, 0]), MAT.inkRed); g.add(marks);
  const obsLab = [label('observed', { size: 0.095, parent: g, opacity: 0.85, color: '#8A3823' }), label('mirror', { size: 0.095, parent: g, opacity: 0.6, color: '#8A3823' })];
  [0, 4, 7, 10, 14].forEach((k) => label(signed((2 * k - NY) / HALF).replace('+', k === 7 ? '' : '+'), { size: 0.09, italic: false, parent: g, at: [HX(k), HY - 0.16, 0.01], opacity: 0.65 }));
  const tk = []; for (let k = 0; k <= NY; k++) tk.push([HX(k), HY - 0.04, 0.302], [HX(k), HY - 0.08, 0.302]);
  g.add(segments(tk, MAT.ink));
  label('difference in yes-rate, B − A, when the labels are shuffled', { size: 0.095, parent: g, at: [0, HY - 0.36, 0.01], opacity: 0.6 });
  const pLab = label('', { size: 0.14, align: 'l', parent: g, at: [-1.92, 0.62, 0.01] });
  const nLab = label('', { size: 0.105, align: 'l', parent: g, at: [-1.92, 0.4, 0.01], opacity: 0.65 });
  const token = box(0.2, 0.05, 0.16, MAT.inkSolid, { parent: g }); token.visible = false;

  /* ---- balls ---- */
  const set = new BallSet(NT, R); g.add(set.mesh);
  for (let j = 0; j < NT; j++) set.color(j, j < NY ? PAL.yes : PAL.no);
  const slotXY = (s) => { const t = s < HALF ? 0 : 1, q = s % HALF; return [TRAY[t] + ((q % 6) - 2.5) * PITCH, TY + (1.5 - Math.floor(q / 6)) * PITCH]; };
  const pos = Array.from({ length: NT }, () => [0, 0]);
  function observed() {          // lay the balls out as observed: S.obs yes in B, the rest in A, scattered deterministically
    const a = [], b = [];
    for (let q = 0; q < HALF; q++) { a.push((q * 7 + 3) % HALF); b.push(HALF + ((q * 11 + 5) % HALF)); }
    let ia = 0, ib = 0, ya = NY - S.obs, yb = S.obs;
    for (let j = 0; j < NT; j++) {
      if (j < NY) { if (yb > 0) { S.slotOf[j] = b[ib++]; yb--; } else { S.slotOf[j] = a[ia++]; ya--; } }
      else if (ia < HALF) S.slotOf[j] = a[ia++]; else S.slotOf[j] = b[ib++];
    }
    for (let j = 0; j < NT; j++) pos[j] = slotXY(S.slotOf[j]);
    S.lastK = null; S.anim = null;
  }
  const kB = () => { let k = 0; for (let j = 0; j < NY; j++) if (S.slotOf[j] >= HALF) k++; return k; };
  function deal() {              // one honest shuffle: a uniform random permutation of all 48 balls over the 48 places
    const s = S.slotOf;
    for (let i = NT - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = s[i]; s[i] = s[j]; s[j] = t; }
    return kB();
  }
  function record(k) { S.counts[k]++; S.total++; S.lastK = k; }
  function shuffle(dur) {
    const from = pos.map((p) => p.slice()), k = deal();
    S.anim = { t: 0, d: dur, from, k, mid: from.map((p, j) => { const a = j * 2.399, r = 0.07 + 0.24 * Math.sqrt(((j * 37) % NT) / NT); return [a, r]; }) };
    S.spinV = 9;
  }

  function readout() {
    const kO = S.obs, d = (2 * kO - NY) / HALF, ext = S.counts.reduce((s, c, k) => s + (extreme(k) ? c : 0), 0);
    const kNow = S.lastK === null ? kO : S.lastK;
    trayLab[0].setText((NY - kNow) + ' of 24 yes'); trayLab[1].setText(kNow + ' of 24 yes');
    diffLab.setText('B − A = ' + signed((2 * kNow - NY) / HALF));
    stateLab.setText(S.lastK === null ? 'as observed' : 'shuffle ' + (S.total + (S.token ? 1 : 0)));
    pLab.setText(S.total ? 'p ≈ ' + (ext / S.total).toFixed(3) : 'p: no shuffles yet');
    nLab.setText(S.total ? ext + ' of ' + S.total + ' shuffles at least as extreme' : 'exact p = ' + pExact().toFixed(3));
    bars.forEach((b, k) => { b.material = extreme(k) ? matTail : matIn; });
    const xo = HX(kO), xm = HX(NY - kO), a = marks.geometry.attributes.position;
    a.setXYZ(0, xo, HY, 0.2); a.setXYZ(1, xo, HY + HMAX + 0.12, 0.2); a.setXYZ(2, xm, HY, 0.2); a.setXYZ(3, xm, HY + HMAX + 0.12, 0.2); a.needsUpdate = true;
    obsLab[0].position.set(xo, HY + HMAX + 0.24, 0.2); obsLab[1].position.set(xm, HY + HMAX + 0.24, 0.2); obsLab[1].visible = kO !== NY / 2;
    const p = S.panel; if (!p) return;
    out(p, 'obs', 'A: ' + (NY - kO) + ' of 24 yes (' + Math.round(((NY - kO) / HALF) * 100) + '%)   B: ' + kO + ' of 24 yes (' + Math.round((kO / HALF) * 100) + '%)');
    out(p, 'diff', signed(d)); out(p, 'n', String(S.total)); out(p, 'ext', String(ext));
    out(p, 'psim', S.total ? (ext / S.total).toFixed(3) : '—'); out(p, 'pexact', pExact().toFixed(4));
    out(p, 'k', String(kO));
  }
  function scale() { const mf = S.total ? Math.max(...S.counts) / S.total : 0; return HMAX / Math.max(PMAX * 1.22, mf); }
  function drawOutline() {
    const a = outline.geometry.attributes.position, sc = scale();
    EXACT.forEach((p, k) => { const y = HY + p * sc; a.setXYZ(k * 2, HX(k) - 0.12, y, 0.19); a.setXYZ(k * 2 + 1, HX(k) + 0.12, y, 0.19); });
    a.needsUpdate = true;
  }

  function update(dt, time, env) {
    S.focused = env.focused; const rdt = env.rdt;
    // cadence: a shuffle every few seconds; a batch runs them fast
    if (!S.anim && !S.token) {
      if (S.batch > 0) { const n = Math.min(S.batch, 60); for (let i = 0; i < n - 1; i++) record(deal()); S.batch -= n - 1; shuffle(0.42); S.batch--; }
      else if (dt > 0) { S.clock += dt; if (S.clock > 2.4 && S.total < 5000) { S.clock = 0; if (!S.focused && S.total >= 300) clear(); else shuffle(1.3); } }
    }
    const adt = S.batch > 0 || (S.anim && S.anim.d < 1) ? rdt : dt;
    if (S.anim) {
      const A = S.anim; A.t += adt / A.d; const u = Math.min(1, A.t);
      for (let j = 0; j < NT; j++) {
        const f = A.from[j], to = slotXY(S.slotOf[j]), m = A.mid[j], ang = m[0] + u * 7, mx = DR[0] + Math.cos(ang) * m[1], my = DR[1] + Math.sin(ang) * m[1];
        const a = ease.io(clamp(u / 0.34, 0, 1)), b = ease.io(clamp((u - 0.66) / 0.34, 0, 1));
        pos[j][0] = lerp(lerp(f[0], mx, a), to[0], b); pos[j][1] = lerp(lerp(f[1], my, a), to[1], b);
      }
      if (u >= 1) { S.anim = null; S.token = { t: 0, k: A.k, d: A.d < 1 ? 0.16 : 0.42 }; S.lastK = A.k; readout(); }
    }
    if (S.token) {
      const T = S.token; T.t += adt / T.d; const u = Math.min(1, T.t), top = HY + S.bars[T.k] + 0.03;
      token.visible = true; token.position.set(lerp(DR[0], HX(T.k), ease.out(u)), lerp(DR[1] - 0.5, top, u * u), 0.1);
      if (u >= 1) { token.visible = false; S.token = null; record(T.k); readout(); }
    }
    S.spinV = damp(S.spinV, 0.5, 2.5, rdt); S.spin += S.spinV * (dt > 0 || S.anim ? rdt : 0); drum.rotation.z = -S.spin;
    for (let j = 0; j < NT; j++) set.set(j, pos[j][0], pos[j][1], ZB + (S.anim ? 0.1 * Math.sin(Math.PI * Math.min(1, S.anim.t)) : 0), 1);
    set.commit();
    const sc = scale();
    bars.forEach((b, k) => { const h = S.total ? (S.counts[k] / S.total) * sc : 0; S.bars[k] = Math.abs(S.bars[k] - h) < 1e-3 ? h : damp(S.bars[k], h, 10, rdt); b.scale.y = Math.max(0.0001, S.bars[k]); b.visible = S.bars[k] > 0.002; });
    if (sc !== S.shown) { S.shown = sc; drawOutline(); }
  }
  function clear() { S.counts.fill(0); S.total = 0; S.batch = 0; S.token = null; token.visible = false; observed(); readout(); }
  function setObs(k) { S.obs = clamp(Math.round(k), NY / 2, NY); if (S.lastK === null) observed(); readout(); }
  function bind(p) {
    S.panel = p;
    const one = $(p, '[data-k="once"]'); if (one) one.addEventListener('click', () => { if (!S.anim && !S.token) { shuffle(1.3); S.clock = 0; } });
    const many = $(p, '[data-k="many"]'); if (many) many.addEventListener('click', () => { S.batch += 200; });
    const cl = $(p, '[data-k="clear"]'); if (cl) cl.addEventListener('click', () => { clear(); S.clock = 0; });
    const ob = $(p, '[data-k="obs"]'); if (ob) ob.addEventListener('input', () => setObs(+ob.value));
    readout();
  }
  function reset() { S.obs = 10; const ob = S.panel && $(S.panel, '[data-k="obs"]'); if (ob) ob.value = 10; clear(); S.clock = 1.2; }
  function settle() { /* at rest the trays show the observed split and the outline shows the exact null */ }
  observed(); readout(); drawOutline();

  return { id: 'shuffle', fig: 'Fig. IV', title: 'Randomisation test', plate: 3, group: g, anchor: [-1.45, 3.14, 0.7],
    view: { pitch: 0.1, w: 4.9, h: 5.9, cz: 0.2 }, update, reset, settle, bind, _: { EXACT, pExact } };
}
