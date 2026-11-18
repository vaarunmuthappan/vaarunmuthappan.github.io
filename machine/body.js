/* body.js: the instrument itself. Two turned decks hold four plates around a dark core; a screw
   lift carries observations up the core; a gear train under the lower deck drives it; an azimuth
   ring names the four faces; a keel and plumb bob hang beneath. The mechanisms mount on the
   plates (and the table on top) that this file returns. */
import { THREE, PAL, MAT, mesh, box, cyl, lathe, smooth, edges, slabGeo, gearGeo, line, segments, label, BallSet, col, damp } from './kit.js';

export const PLATE = { R: 2.95, W: 4.3, H: 5.3, T: 0.16 };
const DECK_Y = 2.75;

function deckProfile(sign) {
  const p = [[0, 2.75], [3.52, 2.75], [3.68, 2.79], [3.78, 2.89], [3.78, 3.0], [3.7, 3.09], [3.5, 3.13], [0, 3.13]];
  return (sign > 0 ? p : p.slice().reverse()).map((q) => [q[0], q[1] * sign]);
}

export function buildBody() {
  const machine = new THREE.Group();
  const spin = [];           // things that turn with the drive: { o, axis, ratio, phase }

  /* ---- decks ---- */
  lathe(deckProfile(1), MAT.ceramic, { parent: machine, ink: 40 });
  lathe(deckProfile(-1), MAT.ceramic, { parent: machine, ink: 40 });
  // brass inlays on the deck rims
  [1, -1].forEach((s) => {
    const t = mesh(new THREE.TorusGeometry(3.79, 0.022, 8, 120), MAT.brass, { parent: machine, at: [0, 2.945 * s, 0], rot: [Math.PI / 2, 0, 0] });
    t.receiveShadow = false;
  });

  /* ---- table on the top deck ---- */
  const top = new THREE.Group(); top.position.y = 3.135; machine.add(top);
  const table = mesh(new THREE.CylinderGeometry(3.32, 3.32, 0.03, 96), MAT.boardDeep, { parent: top, at: [0, 0.012, 0], cast: false });
  table.add(edges(table.geometry, 40, MAT.inkFaint));

  /* ---- plates ---- */
  const plates = [];
  // each plate is a page of ruled notebook paper: a faint 5-to-the-unit grid
  const gv = document.createElement('canvas'); gv.width = gv.height = 256;
  const gc = gv.getContext('2d'); gc.fillStyle = '#F7F3EA'; gc.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 5; k++) { gc.fillStyle = k === 0 ? 'rgba(74,62,48,.13)' : 'rgba(74,62,48,.06)'; gc.fillRect(Math.round(k * 51.2), 0, 1.4, 256); gc.fillRect(0, Math.round(k * 51.2), 256, 1.4); }
  const gtex = new THREE.CanvasTexture(gv); gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.colorSpace = THREE.SRGBColorSpace; gtex.anisotropy = 8;
  MAT.board.map = gtex; MAT.board.color.set(0xffffff); MAT.board.needsUpdate = true;
  const plateGeo = slabGeo(PLATE.W, PLATE.H, PLATE.T, 0.1, 0.025);
  const screwGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 16); screwGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, g = new THREE.Group();
    g.position.set(Math.sin(a) * PLATE.R, 0, Math.cos(a) * PLATE.R); g.rotation.y = a;
    const board = mesh(plateGeo, MAT.board, { parent: g, ink: 50 });
    board.castShadow = true;
    // the ruled frame of a book plate
    const fx = PLATE.W / 2 - 0.09, fy = PLATE.H / 2 - 0.09;
    g.add(line([[-fx, -fy, 0.003], [fx, -fy, 0.003], [fx, fy, 0.003], [-fx, fy, 0.003]], MAT.inkFaint, true));
    // screws
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((c, j) => {
      const s = mesh(screwGeo, MAT.brass, { parent: g, at: [c[0] * (fx - 0.1), c[1] * (fy - 0.1), 0.012] });
      const k = 0.045, ang = (j * 37 + i * 61) * 0.0174;
      s.add(segments([[-k * Math.cos(ang), -k * Math.sin(ang), 0.017], [k * Math.cos(ang), k * Math.sin(ang), 0.017]], MAT.ink));
    });
    g.userData.board = board;
    machine.add(g); plates.push(g);
  }

  /* ---- core: column, screw lift, corner posts ---- */
  const core = new THREE.Group(); machine.add(core);
  cyl(0.92, DECK_Y * 2, MAT.graphite, { parent: core, seg: 48 });
  for (let k = 0; k < 9; k++) {
    const y = -2.4 + k * 0.6;
    mesh(new THREE.TorusGeometry(0.93, 0.016, 6, 64), MAT.brassDull, { parent: core, at: [0, y, 0], rot: [Math.PI / 2, 0, 0], cast: false });
  }
  // the screw: a helical rail that turns; balls ride up it
  const TURNS = 5.5, HR = 1.22, H0 = -2.55, H1 = 2.55;
  class Helix extends THREE.Curve {
    getPoint(t, v = new THREE.Vector3()) { const a = t * TURNS * Math.PI * 2; return v.set(Math.cos(a) * HR, H0 + (H1 - H0) * t, -Math.sin(a) * HR); }
  }
  const screw = new THREE.Group(); core.add(screw);
  mesh(new THREE.TubeGeometry(new Helix(), 260, 0.03, 6), MAT.brass, { parent: screw });
  for (let k = 0; k < 22; k++) {     // spokes that hold the rail off the column
    const t = k / 22, a = t * TURNS * Math.PI * 2, y = H0 + (H1 - H0) * t;
    const sp = cyl(0.012, HR - 0.92, MAT.brassDull, { parent: screw, axis: 'x', seg: 6, cast: false });
    sp.position.set(Math.cos(a) * (HR + 0.92) / 2, y, -Math.sin(a) * (HR + 0.92) / 2); sp.rotation.y = a;
  }
  const LIFT_N = 18;
  const lift = new BallSet(LIFT_N, 0.075); core.add(lift.mesh);
  for (let i = 0; i < LIFT_N; i++) lift.color(i, (i * 7) % 24 < 7 ? PAL.yes : PAL.no);
  // corner posts
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    cyl(0.05, DECK_Y * 2, MAT.brass, { parent: core, at: [Math.cos(a) * 3.42, 0, Math.sin(a) * 3.42], seg: 12 });
    [1, -1].forEach((s) => cyl(0.085, 0.07, MAT.brass, { parent: core, at: [Math.cos(a) * 3.42, s * (DECK_Y - 0.035), Math.sin(a) * 3.42], seg: 16 }));
  }
  // gear train on the lower deck, seen through the corners
  const TB = 48, TS = 14, MOD = 1.7 / TB, rB = TB * MOD, rS = TS * MOD;
  const gBig = mesh(gearGeo(TB, rB, 0.07, 0.95, 0.07), MAT.brassDull, { parent: core, at: [0, -2.62, 0], rot: [-Math.PI / 2, 0, 0], ink: 30, inkMat: MAT.inkFaint });
  spin.push({ o: gBig, ratio: -1, phase: 0 });
  for (let k = 0; k < 4; k++) {
    const phi = Math.PI / 4 + (k * Math.PI) / 2, d = rB + rS;
    const piv = new THREE.Group(); piv.position.set(Math.cos(phi) * d, -2.62, -Math.sin(phi) * d); core.add(piv);
    const gs = mesh(gearGeo(TS, rS, 0.07, 0.07, 0.07), MAT.brass, { parent: piv, rot: [-Math.PI / 2, 0, 0], ink: 30, inkMat: MAT.inkFaint });
    cyl(0.05, 0.2, MAT.brass, { parent: piv, seg: 12 });
    spin.push({ o: gs, ratio: TB / TS, phase: (TB / TS) * phi + phi + Math.PI - Math.PI / TS });
  }

  /* ---- keel and plumb bob ---- */
  const keel = smooth([[3.4, -3.13], [3.28, -3.34], [2.75, -3.9], [1.85, -4.62], [1.0, -5.16], [0.52, -5.46], [0.34, -5.68], [0.3, -5.8]], 48);
  lathe(keel.concat([[0.3, -5.8], [0.38, -5.84], [0.38, -5.93], [0.26, -5.98], [0.12, -6.04], [0, -6.06]]).reverse(), MAT.ceramic, { parent: machine, ink: 35 });
  [[2.77, -3.89], [1.87, -4.61], [1.02, -5.15]].forEach((q) => mesh(new THREE.TorusGeometry(q[0] + 0.012, 0.018, 6, 96), MAT.brass, { parent: machine, at: [0, q[1], 0], rot: [Math.PI / 2, 0, 0], cast: false }));
  const plumb = new THREE.Group(); plumb.position.y = -6.06; machine.add(plumb);
  plumb.add(line([[0, 0, 0], [0, -1.25, 0]], MAT.ink));
  lathe([[0, -2.06], [0.13, -1.78], [0.22, -1.45], [0.19, -1.32], [0.05, -1.25], [0, -1.22]], MAT.brass, { parent: plumb, seg: 40, ink: 40, inkMat: MAT.inkFaint });

  /* ---- azimuth ring ---- */
  const ring = new THREE.Group(); ring.position.y = -2.95; machine.add(ring);
  lathe([[4.36, -0.035], [4.78, -0.035], [4.8, 0], [4.78, 0.035], [4.36, 0.035], [4.34, 0], [4.36, -0.035]], MAT.brass, { parent: ring, seg: 144 });
  const tick = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.004, 1), MAT.inkSolid, 144);
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), tp = new THREE.Vector3();
  for (let k = 0; k < 144; k++) {
    const a = (k / 144) * Math.PI * 2, len = k % 12 === 0 ? 0.26 : k % 6 === 0 ? 0.18 : 0.1, r = 4.76 - len / 2;
    tq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); ts.set(1, 1, len); tp.set(Math.sin(a) * r, 0.038, Math.cos(a) * r);
    tick.setMatrixAt(k, tm.compose(tp, tq, ts));
  }
  tick.raycast = () => {}; ring.add(tick);
  const NUM = ['I', 'II', 'III', 'IV'];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const arm = box(0.07, 0.04, 0.62, MAT.brass, { parent: ring, at: [Math.sin(a) * 4.07, 0, Math.cos(a) * 4.07] }); arm.rotation.y = a;
    const n = label(NUM[i], { size: 0.2, italic: true, opacity: 0.8 });
    const p = new THREE.Group(); p.rotation.y = a + 0.18; p.position.y = 0.04; ring.add(p);
    n.position.set(0, 0, 4.5); n.rotation.x = -Math.PI / 2; p.add(n);
  }
  // a rider that creeps round the ring with the drive
  const rider = new THREE.Group(); ring.add(rider);
  box(0.16, 0.09, 0.5, MAT.ceramic, { parent: rider, at: [0, 0.03, 4.57], ink: true });
  mesh(new THREE.ConeGeometry(0.04, 0.12, 12), MAT.sanguine, { parent: rider, at: [0, 0.13, 4.57] });

  /* ---- the page below: a soft shadow and the plan of the machine ---- */
  const page = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
  const c = cv.getContext('2d'), U = 1024 / 16, O = 512;
  c.strokeStyle = 'rgba(42,37,33,.55)'; c.lineWidth = 1.3;
  const circ = (r, dash) => { c.setLineDash(dash || []); c.beginPath(); c.arc(O, O, r * U, 0, 7); c.stroke(); };
  circ(3.78); circ(4.34); circ(4.8); circ(0.92, [4, 5]); circ(1.22, [2, 5]); circ(6.4, [1, 9]);
  c.setLineDash([]);
  c.strokeRect(O - 2.15 * U, O - 3.03 * U, 4.3 * U, 6.06 * U); c.strokeRect(O - 3.03 * U, O - 2.15 * U, 6.06 * U, 4.3 * U);
  c.setLineDash([14, 5, 2, 5]); c.beginPath(); c.moveTo(O - 7.2 * U, O); c.lineTo(O + 7.2 * U, O); c.moveTo(O, O - 7.2 * U); c.lineTo(O, O + 7.2 * U); c.stroke();
  c.setLineDash([]);
  for (let k = 0; k < 72; k++) { const a = (k / 72) * 6.2832, r0 = 6.4, r1 = k % 6 ? 6.52 : 6.7; c.beginPath(); c.moveTo(O + Math.cos(a) * r0 * U, O + Math.sin(a) * r0 * U); c.lineTo(O + Math.cos(a) * r1 * U, O + Math.sin(a) * r1 * U); c.stroke(); }
  const grd = c.createRadialGradient(O, O, 4.6 * U, O, O, 7.6 * U);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out'; c.fillStyle = grd; c.fillRect(0, 0, 1024, 1024);
  const ptex = new THREE.CanvasTexture(cv); ptex.colorSpace = THREE.SRGBColorSpace; ptex.anisotropy = 8;
  const plan = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: ptex, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
  plan.rotation.x = -Math.PI / 2; plan.raycast = () => {}; page.add(plan);
  const sv = document.createElement('canvas'); sv.width = sv.height = 256;
  const sc = sv.getContext('2d'), sg = sc.createRadialGradient(128, 128, 8, 128, 128, 128);
  sg.addColorStop(0, 'rgba(52,40,28,.42)'); sg.addColorStop(0.45, 'rgba(52,40,28,.2)'); sg.addColorStop(1, 'rgba(52,40,28,0)');
  sc.fillStyle = sg; sc.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sv), transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; shadow.raycast = () => {}; page.add(shadow);
  page.position.y = -9.5;

  /* ---- motion ---- */
  let drive = 0, swing = 0, swingV = 0, swing2 = 0;
  function update(dt, time, env) {
    drive += dt * 0.5;
    spin.forEach((s) => { s.o.rotation.z = drive * s.ratio + s.phase; });
    screw.rotation.y = -drive;
    rider.rotation.y = -drive * 0.06;
    // a ball rests against the rail at a fixed bearing, so it rises as the screw turns under it
    for (let i = 0; i < LIFT_N; i++) {
      const u = (((drive / (Math.PI * 2 * TURNS)) + i / LIFT_N) % 1 + 1) % 1, w = (Math.PI * 2 * TURNS * i) / LIFT_N;
      const fade = Math.min(1, u * 14, (1 - u) * 14);
      lift.set(i, Math.cos(w) * (HR + 0.03), H0 + (H1 - H0) * u + 0.1, -Math.sin(w) * (HR + 0.03), fade);
    }
    lift.commit();
    // the plumb bob lags the machine when it is spun, then settles
    const acc = -(env.yawAcc || 0) * 0.02;
    swingV += (-28 * swing - 2.2 * swingV + acc * 60) * env.rdt; swing += swingV * env.rdt;
    swing2 = Math.sin(time * 1.7) * 0.022 * env.live;
    plumb.rotation.z = swing + swing2; plumb.rotation.x = Math.cos(time * 1.31) * 0.016 * env.live;
    plan.rotation.z = env.yaw;
    shadow.material.opacity = 0.9 - env.bob * 1.2;
  }
  machine.traverse((o) => { if (o.isMesh && o.material && o.material.metalness === 1 && o.geometry.type === 'TorusGeometry') o.receiveShadow = false; });
  return { machine, plates, top, page, update };
}
