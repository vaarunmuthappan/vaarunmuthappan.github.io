/* kit.js: shared palette, materials, geometry helpers, engraved text, easing and small maths
   for the machine. Everything the mechanisms have in common lives here so a new mechanism only
   has to describe its own parts. */
import * as THREE from './three.module.min.js';
export { THREE };

export const PAL = {
  paper: 0xF3EFE6, ivory: 0xEDE6D8, board: 0xF7F3EA, ink: 0x2A2521, ink2: 0x5A5048,
  silver: 0xA39B8E, sanguine: 0xA4452C, brass: 0xC2A05A, graphite: 0x403B36,
  prussian: 0x2F4A66, ochre: 0xC2932F, verdigris: 0x4F7B6C,
  yes: 0xA4452C, no: 0xFAF6EE, ghost: 0x8E867A
};
export const col = (h) => new THREE.Color(h);

const std = (o) => new THREE.MeshStandardMaterial(o);
export const MAT = {
  ceramic: std({ color: PAL.ivory, roughness: 0.5, metalness: 0 }),
  board: std({ color: PAL.board, roughness: 0.93, metalness: 0 }),
  boardDeep: std({ color: 0xEAE3D4, roughness: 0.95, metalness: 0 }),
  brass: std({ color: PAL.brass, roughness: 0.3, metalness: 1 }),
  brassDull: std({ color: 0xB7985A, roughness: 0.48, metalness: 1 }),
  graphite: std({ color: PAL.graphite, roughness: 0.55, metalness: 0.25 }),
  inkSolid: std({ color: PAL.ink, roughness: 0.7, metalness: 0 }),
  sanguine: std({ color: PAL.sanguine, roughness: 0.5, metalness: 0 }),
  ball: std({ color: 0xffffff, roughness: 0.28, metalness: 0 }),
  paperSlice: std({ color: 0xFBF8F1, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
  glassRed: new THREE.MeshBasicMaterial({ color: PAL.sanguine, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  ink: new THREE.LineBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.62 }),
  inkFaint: new THREE.LineBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.28 }),
  inkRed: new THREE.LineBasicMaterial({ color: PAL.sanguine, transparent: true, opacity: 0.9 })
};

/* ---- geometry ---------------------------------------------------------- */
export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}
/* A rounded slab lying in the xy plane; front face at z = 0, body behind it. */
export function slabGeo(w, h, d, r = 0.08, bevel = 0.02) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * bevel, h - 2 * bevel, Math.max(0.001, r - bevel)), {
    depth: Math.max(0.001, d - 2 * bevel), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 2, curveSegments: 8
  });
  g.translate(0, 0, -(d - bevel));
  return g;
}
export function mesh(geo, mat, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
  if (o.at) m.position.set(o.at[0], o.at[1], o.at[2]);
  if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  if (o.ink) m.add(edges(geo, o.ink === true ? 30 : o.ink, o.inkMat));
  if (o.parent) o.parent.add(m);
  return m;
}
/* Ink outline: the crease lines of a solid, drawn like a technical illustration. */
export function edges(geo, angle = 30, mat = MAT.ink) {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, angle), mat);
  l.raycast = () => {};
  return l;
}
export function box(w, h, d, mat, o) { return mesh(new THREE.BoxGeometry(w, h, d), mat, o); }
export function cyl(r, len, mat, o = {}) {
  const g = new THREE.CylinderGeometry(r, o.r2 ?? r, len, o.seg || 20);
  if (o.axis === 'z') g.rotateX(Math.PI / 2); else if (o.axis === 'x') g.rotateZ(Math.PI / 2);
  return mesh(g, mat, o);
}
export function lathe(pts, mat, o = {}) {
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), o.seg || 96);
  return mesh(g, mat, o);
}
export function smooth(pts, n = 40) {
  return new THREE.SplineCurve(pts.map((p) => new THREE.Vector2(p[0], p[1]))).getPoints(n).map((v) => [Math.max(0, v.x), v.y]);
}
export function line(points, mat = MAT.ink, closed = false) {
  const g = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0)));
  const l = closed ? new THREE.LineLoop(g, mat) : new THREE.Line(g, mat);
  l.raycast = () => {};
  return l;
}
export function segments(pairs, mat = MAT.ink) {
  const a = new Float32Array(pairs.length * 3);
  pairs.forEach((p, i) => { a[i * 3] = p[0]; a[i * 3 + 1] = p[1]; a[i * 3 + 2] = p[2] || 0; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const l = new THREE.LineSegments(g, mat); l.raycast = () => {};
  return l;
}
/* A spur gear lying in the xy plane. */
export function gearGeo(teeth, rPitch, depth, hole = 0.12, tooth = 0.07) {
  const s = new THREE.Shape(), ro = rPitch + tooth * 0.5, ri = rPitch - tooth * 0.6, step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const P = (r, da) => [Math.cos(a + da * step) * r, Math.sin(a + da * step) * r];
    const pts = [P(ri, -0.5), P(ri, -0.27), P(ro, -0.15), P(ro, 0.15), P(ri, 0.27)];
    pts.forEach((p, j) => (i === 0 && j === 0 ? s.moveTo(p[0], p[1]) : s.lineTo(p[0], p[1])));
  }
  s.closePath();
  const h = new THREE.Path(); h.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/* ---- instanced balls --------------------------------------------------- */
const _m = new THREE.Matrix4(), _c = new THREE.Color();
export class BallSet {
  constructor(n, r, mat = MAT.ball, geo) {
    this.n = n; this.r = r;
    this.mesh = new THREE.InstancedMesh(geo || new THREE.SphereGeometry(r, 20, 14), mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    for (let i = 0; i < n; i++) { this.hide(i); this.color(i, 0xffffff); }
  }
  set(i, x, y, z, s = 1) { _m.makeScale(s, s, s); _m.setPosition(x, y, z); this.mesh.setMatrixAt(i, _m); this.dirty = true; }
  hide(i) { this.set(i, 0, -50, 0, 0.0001); }
  color(i, c) { this.mesh.setColorAt(i, c.isColor ? c : _c.set(c)); this.cdirty = true; }
  commit() {
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; }
    if (this.cdirty && this.mesh.instanceColor) { this.mesh.instanceColor.needsUpdate = true; this.cdirty = false; }
  }
}

/* ---- engraved text ----------------------------------------------------- */
const FONT = '"EB Garamond", "Iowan Old Style", Palatino, Georgia, serif';
const PX = 80;
/* Text drawn onto a small canvas and laid flat on a surface, like a note written on the part.
   o: size (em height in world units), align 'l' | 'c' | 'r', italic, weight, color, opacity. */
export function label(text, o = {}) {
  const size = o.size ?? 0.15, align = o.align || 'c';
  const font = (o.italic === false ? '' : 'italic ') + (o.weight || 500) + ' ' + PX + 'px ' + FONT;
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: o.opacity ?? 0.86 });
  if (o.double) mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.raycast = () => {}; m.renderOrder = 2;
  const g = new THREE.Group(); g.add(m);
  let last = null;
  g.setText = (t) => {
    t = String(t); if (t === last) return; last = t;
    ctx.font = font;
    const w = Math.max(8, Math.ceil(ctx.measureText(t).width) + 24), h = Math.round(PX * 1.5);
    if (cv.width !== w || cv.height !== h) { tex.dispose(); cv.width = w; cv.height = h; }
    else ctx.clearRect(0, 0, w, h);
    ctx.font = font; ctx.textBaseline = 'middle'; ctx.fillStyle = o.color || '#2A2521';
    ctx.fillText(t, 12, h / 2 + PX * 0.04);
    tex.needsUpdate = true;
    const W = (w / PX) * size;
    m.scale.set(W, 1.5 * size, 1);
    m.position.x = align === 'l' ? W / 2 - (12 / PX) * size : align === 'r' ? -W / 2 + (12 / PX) * size : 0;
  };
  g.setText(text);
  if (o.at) g.position.set(o.at[0], o.at[1], o.at[2] ?? 0.006);
  if (o.rot) g.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  if (o.parent) o.parent.add(g);
  return g;
}

/* ---- easing and numbers ------------------------------------------------ */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (t) => clamp(t, 0, 1);
export const ease = {
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t,
  outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)
};
/* frame-rate independent approach of a toward b */
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const fmt = (v, d = 2) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d).replace('-', '−');
export const $ = (root, sel) => root.querySelector(sel);
export const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
export function out(root, key, text) { const e = root && root.querySelector('[data-out="' + key + '"]'); if (e && e.textContent !== text) e.textContent = text; }
