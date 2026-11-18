/* main.js: the stage. Renderer, light, the camera rig (turn, tilt, zoom with inertia), focus on a
   mechanism, the figure tags that follow the machine, the control rail, and the sheet that holds
   the portfolio and each mechanism's bench notes. Mechanisms are plain objects made by the
   mech-*.js modules; add one to MECHS and give it a plate to extend the machine. */
import { THREE, PAL, MAT, clamp, damp, lerp, sat, $, $$ } from './kit.js';
import { buildBody, PLATE } from './body.js';
import { createBayes } from './mech-bayes.js';
import { createRegress } from './mech-regress.js';
import { createTree } from './mech-tree.js';
import { createShuffle } from './mech-shuffle.js';
import { createKmeans } from './mech-kmeans.js';

const root = document.documentElement, body = document.body;
const canvas = document.getElementById('scene'), folio = document.getElementById('folio');
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FOV = 30, TAN = Math.tan((FOV * Math.PI) / 360);
const DOC = ['about', 'background', 'notes', 'projects', 'figures', 'contact'];

function fail(err) {
  root.classList.remove('live'); root.classList.add('no-gl');
  if (err) console.warn('The machine could not start; showing the plain portfolio.', err);
}

async function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return fail(e); }
  try {
    await Promise.race([
      Promise.all([document.fonts.load('italic 500 40px "EB Garamond"'), document.fonts.load('500 40px "EB Garamond"')]),
      new Promise((r) => setTimeout(r, 1800))
    ]);
  } catch (e) { /* fall back to the serif stack */ }

  /* ---- renderer, scene, light ---- */
  let PR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(PR);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);

  // a plain studio for reflections: a warm room with three soft panels
  {
    const env = new THREE.Scene(), bm = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.BackSide });
    env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 30, 40), bm(0xF4EEE2, 0.75)));
    const panel = (w, h, x, y, z, k, c = 0xFFF8EE) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
    panel(16, 10, -12, 11, 10, 9); panel(8, 14, 16, 4, 6, 4.5); panel(20, 6, 0, 13, -14, 3, 0xE9EEF5); panel(30, 30, 0, -14, 0, 0.5, 0xD9C9AE);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture; scene.environmentIntensity = 0.85;
    pm.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xFFFDF8, 0xCFC2AC, 0.75));
  const key = new THREE.DirectionalLight(0xFFF6E8, 2.5);
  key.position.set(-8, 13, 10); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -9, near: 2, far: 40 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.025;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xE8EEF8, 0.55); rim.position.set(9, 5, -8); scene.add(rim);

  /* ---- the machine ---- */
  const B = buildBody();
  const rig = new THREE.Group(); rig.add(B.machine); scene.add(rig, B.page);
  const made = [createBayes(), createRegress(), createTree(), createShuffle(), createKmeans()];
  const MECHS = made.map((m, i) => {
    const onTop = m.mount === 'top', host = onTop ? B.top : B.plates[m.plate];
    host.add(m.group);
    const hit = new THREE.Mesh(onTop ? new THREE.CylinderGeometry(3.4, 3.4, 1.3, 24) : new THREE.BoxGeometry(PLATE.W, PLATE.H, 2), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, onTop ? 0.6 : 0, onTop ? 0 : 0.85); hit.userData.mech = m; host.add(hit);
    m.hit = hit; m.host = host; m.onTop = onTop; m.angle = onTop ? 0 : (m.plate * Math.PI) / 2; m.index = i;
    m.panel = document.getElementById(m.id);
    if (!onTop) { const bd = host.userData.board; bd.material = MAT.board.clone(); m.boardMat = bd.material; }
    m.glow = 0;
    if (m.bind && m.panel) m.bind(m.panel);
    return m;
  });
  const byId = Object.fromEntries(MECHS.map((m) => [m.id, m]));

  /* ---- state ---- */
  const S = { paused: RM, auto: !RM, speed: 1, focus: null, sheet: '', time: 0, idle: 0, hover: null, intro: RM ? 1 : 0 };
  const V = { yaw: -2.2, pitch: 0.42, dist: 60, tx: 0, ty: -2.05, tz: 0, ox: 0, oy: 0 };
  const G = { yaw: -0.5, pitch: 0.22, dist: 30, tx: 0, ty: -2.05, tz: 0, ox: 0, oy: 0 };
  let yawVel = 0, pitchVel = 0, lastYawV = 0, W = 1, H = 1, minD = 7.5, maxD = 60, homeD = 30;
  const mobile = () => W < 760;
  const sheetRect = () => {      // how much of the viewport the open sheet covers
    if (!S.sheet) return { w: 0, h: 0 };
    const r = folio.getBoundingClientRect();
    return mobile() ? { w: 0, h: Math.min(H * 0.9, r.height) } : { w: r.width, h: 0 };
  };
  function fit(wu, hu, pad) {
    const s = sheetRect(), fw = Math.max(120, W - s.w), fh = Math.max(120, H - s.h - (pad || 0));
    const k = mobile() ? 0.84 : 0.9, ppu = Math.min((fw * k) / wu, (fh * k) / hu);
    return H / 2 / (ppu * TAN);
  }
  function aim() {               // set the camera goals for the current focus and sheet
    const s = sheetRect();
    G.ox = s.w / 2; G.oy = s.h / 2;
    const f = S.focus;
    if (f) {
      const v = f.view;
      if (f.onTop) { G.yaw = Math.round(G.yaw / (Math.PI * 2)) * Math.PI * 2; yawVel = 0; G.tx = 0; G.tz = 0; G.ty = 3.3; G.pitch = v.pitch; G.dist = clamp(fit(v.w, v.h * Math.sin(v.pitch) + 1.2), minD, maxD); }
      else {
        const want = -f.angle + (v.yaw || 0), k = Math.round((G.yaw - want) / (Math.PI * 2));
        G.yaw = want + k * Math.PI * 2; yawVel = 0;
        G.pitch = v.pitch; G.tx = v.cx || 0; G.ty = v.cy || 0; G.tz = PLATE.R + (v.cz || 0.4);
        G.dist = clamp(fit(v.w, v.h), minD, maxD) + G.tz * 0.2;
      }
    } else {
      homeD = fit(10.6, 13.0, mobile() ? 120 : 60); maxD = Math.max(60, homeD * 1.5);
      G.tx = 0; G.tz = 0; G.ty = -2.05; G.pitch = clamp(G.pitch, 0.08, 0.5); G.dist = homeD;
    }
  }
  function resize() {
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false); camera.aspect = W / H; aim();
  }

  /* ---- sheet and routing ---- */
  function setSheet(kind, id, push) {
    const prev = S.focus;
    S.sheet = kind; S.focus = kind === 'fig' ? byId[id] : null;
    body.dataset.sheet = kind; body.dataset.fig = S.focus ? id : '';
    MECHS.forEach((m) => { if (m.panel) m.panel.hidden = !(S.focus === m); if (m.setFocus) m.setFocus(S.focus === m); });
    $$(document, '[data-fig-link]').forEach((a) => a.classList.toggle('on', !!S.focus && a.dataset.figLink === id));
    $$(document, '.topnav a').forEach((a) => a.classList.toggle('on', kind === 'doc' && a.getAttribute('href') === '#' + id));
    folio.setAttribute('aria-hidden', kind ? 'false' : 'true');
    if (kind) folio.removeAttribute('inert'); else folio.setAttribute('inert', '');
    if (kind === 'doc') {
      const el = document.getElementById(id);
      requestAnimationFrame(() => { folio.scrollTop = el && id !== 'about' ? el.offsetTop - 76 : 0; });
    } else if (kind === 'fig') folio.scrollTop = 0;
    if (prev && !S.focus) { G.pitch = 0.22; }
    const hash = kind ? '#' + id : ' ';
    if (push !== false && location.hash !== hash) history.replaceState(null, '', kind ? hash : location.pathname + location.search);
    setTimeout(aim, 30); aim(); S.idle = 0;
  }
  function route(hash, push) {
    const id = (hash || '').replace(/^#/, '');
    if (byId[id]) setSheet('fig', id, push);
    else if (DOC.includes(id)) setSheet('doc', id, push);
    else setSheet('', '', push);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (id === 'folio') return;
    e.preventDefault(); route('#' + id);
    if (id && S.sheet) { const h = folio.querySelector('h2, h1'); if (h && S.sheet === 'fig') { h.setAttribute('tabindex', '-1'); } }
  });
  window.addEventListener('hashchange', () => route(location.hash, false));
  $$(document, '[data-close]').forEach((b) => b.addEventListener('click', () => route('')));

  /* ---- control rail ---- */
  const rail = document.getElementById('rail');
  function paint() {
    const set = (act, on, label) => { const b = rail && rail.querySelector('[data-act="' + act + '"]'); if (!b) return; b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (label) { b.setAttribute('aria-label', label); b.title = label; } };
    set('auto', S.auto, S.auto ? 'Stop turning' : 'Turn the machine');
    set('pause', S.paused, S.paused ? 'Run the mechanisms' : 'Pause the mechanisms');
    const sp = rail && rail.querySelector('[data-act="speed"] b'); if (sp) sp.textContent = (S.speed === 0.5 ? '½' : S.speed) + '×';
    body.classList.toggle('is-paused', S.paused);
  }
  const ACT = {
    auto() { S.auto = !S.auto; S.idle = 99; },
    pause() { S.paused = !S.paused; },
    speed() { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 0.5 : 1; },
    zin() { G.dist = clamp(G.dist * 0.8, minD, maxD); },
    zout() { G.dist = clamp(G.dist * 1.25, minD, maxD); },
    home() { if (S.sheet) route(''); G.pitch = 0.22; yawVel = 0; aim(); },
    reset() { MECHS.forEach((m) => m.reset && m.reset()); S.speed = 1; S.paused = RM; S.auto = !RM; if (S.sheet === 'fig') route(''); G.yaw = Math.round(G.yaw / (Math.PI * 2)) * Math.PI * 2 - 0.5; G.pitch = 0.22; aim(); }
  };
  if (rail) rail.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; ACT[b.dataset.act](); paint(); });
  paint();
  // working a mechanism by hand is a request for motion: it lifts a pause (including the reduced-motion default)
  folio.addEventListener('click', (e) => { if (S.paused && e.target.closest('.bench .btn, .bench .seg button')) { S.paused = false; paint(); } });

  /* ---- pointer: turn, tilt, pinch, pick ---- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), inv = new THREE.Matrix4(), lray = new THREE.Ray();
  const pts = new Map(); let drag = null, mechDrag = null, pinch = null, hoverXY = null;
  const hits = MECHS.map((m) => m.hit);
  function cast(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
  function local(m) { inv.copy(m.group.matrixWorld).invert(); return lray.copy(ray.ray).applyMatrix4(inv); }
  function pick() { const h = ray.intersectObjects(hits, false)[0]; return h ? h.object.userData.mech : null; }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released pointer */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); S.idle = 0;
    if (pts.size === 2) { const p = [...pts.values()]; pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), dist: G.dist }; drag = null; return; }
    cast(e);
    if (S.focus && S.focus.pointer && S.focus.pointer('down', local(S.focus))) { mechDrag = S.focus; canvas.style.cursor = 'grabbing'; return; }
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0 }; yawVel = pitchVel = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) { const p = [...pts.values()], d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); G.dist = clamp((pinch.dist * pinch.d) / Math.max(20, d), minD, maxD); return; }
    if (mechDrag) { cast(e); mechDrag.pointer('move', local(mechDrag)); return; }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dtm = Math.max(8, now - drag.t) / 1000;
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now; drag.moved += Math.abs(dx) + Math.abs(dy);
      const k = 0.0058 * clamp(V.dist / homeD, 0.35, 1);
      G.yaw += dx * k; G.pitch = clamp(G.pitch + dy * k * 0.7, -0.12, 1.25);
      yawVel = lerp(yawVel, (dx * k) / dtm, 0.5); pitchVel = lerp(pitchVel, (dy * k * 0.7) / dtm, 0.5);
      if (drag.moved > 6) canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.pointerType === 'mouse') hoverXY = e;
  });
  function release(e) {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (mechDrag) { mechDrag.pointer('up'); mechDrag = null; canvas.style.cursor = ''; return; }
    if (!drag) return;
    const d = drag; drag = null; canvas.style.cursor = '';
    if (performance.now() - d.t > 90) yawVel = pitchVel = 0;
    if (d.moved < 7 && e.type === 'pointerup') {
      yawVel = pitchVel = 0; cast(e); const m = pick();
      if (m && m !== S.focus) route('#' + m.id);
    }
  }
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { hoverXY = null; setHover(null); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); S.idle = 0;
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    G.dist = clamp(G.dist * Math.exp(clamp(dy, -120, 120) * (e.ctrlKey ? 0.011 : 0.0016)), minD, maxD);
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => { cast(e); if (!pick()) ACT.home(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.sheet) { route(''); canvas.focus({ preventScroll: true }); return; }
    if (document.activeElement !== canvas) return;
    const k = e.key; let used = true;
    if (k === 'ArrowLeft') G.yaw -= 0.26; else if (k === 'ArrowRight') G.yaw += 0.26;
    else if (k === 'ArrowUp') G.pitch = clamp(G.pitch + 0.12, -0.12, 1.25); else if (k === 'ArrowDown') G.pitch = clamp(G.pitch - 0.12, -0.12, 1.25);
    else if (k === '+' || k === '=') ACT.zin(); else if (k === '-' || k === '_') ACT.zout();
    else if (k >= '1' && k <= '5') route('#' + MECHS[+k - 1].id);
    else if (k === ' ') { ACT.pause(); paint(); } else if (k === '0') ACT.home();
    else used = false;
    if (used) { e.preventDefault(); S.idle = 0; }
  });

  /* ---- figure tags that follow the machine ---- */
  const tagBox = document.getElementById('tags'), v3 = new THREE.Vector3();
  MECHS.forEach((m) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tag'; b.tabIndex = -1;
    b.innerHTML = '<i>' + m.fig + '</i><span>' + m.title + '</span>';
    b.addEventListener('click', () => route('#' + m.id));
    b.addEventListener('pointerenter', () => setHover(m)); b.addEventListener('pointerleave', () => setHover(null));
    tagBox.appendChild(b); m.tag = b; m.tagO = 0;
  });
  function setHover(m) {
    if (S.hover === m) return; S.hover = m;
    MECHS.forEach((x) => x.tag.classList.toggle('hot', x === m));
    if (!mechDrag && !drag) canvas.style.cursor = m && m !== S.focus ? 'pointer' : '';
  }
  function facing(m) { return m.onTop ? sat((Math.sin(V.pitch) - 0.1) * 3) * 0.6 : Math.cos(m.angle + V.yaw) * Math.cos(V.pitch); }
  const figLinks = $$(document, '[data-fig-link]');
  let nearest = null;

  /* ---- frame ---- */
  let last = performance.now(), acc = 0, frames = 0, slow = 0, t0 = last;
  const env = { rdt: 0, yaw: 0, yawAcc: 0, bob: 0, live: 1, focused: false };
  function frame(now) {
    const raw = (now - last) / 1000, rdt = clamp(raw, 0, 0.05); last = now;
    const dt = S.paused ? 0 : rdt * S.speed; S.time += dt; S.idle += rdt;
    S.intro = Math.min(1, S.intro + rdt / 2.6);

    // turning: inertia after a drag, then the slow automatic turn once the hand is off
    if (!drag && !mechDrag) {
      G.yaw += yawVel * rdt; G.pitch = clamp(G.pitch + pitchVel * rdt, -0.12, 1.25);
      const f = Math.exp(-2.6 * rdt); yawVel *= f; pitchVel *= Math.exp(-6 * rdt);
      if (S.auto && !S.focus && S.idle > 2.2) G.yaw += rdt * 0.11 * (S.hover ? 0.2 : 1) * sat((S.idle - 2.2) / 1.5);
    }
    const r = RM ? 30 : lerp(1.5, 7.5, S.intro * S.intro), rz = RM ? 30 : lerp(1.3, 5, S.intro * S.intro);
    const py = V.yaw;
    V.yaw = damp(V.yaw, G.yaw, drag ? 22 : r, rdt); V.pitch = damp(V.pitch, G.pitch, drag ? 22 : r, rdt);
    V.dist = damp(V.dist, G.dist, rz, rdt);
    V.tx = damp(V.tx, G.tx, rz, rdt); V.ty = damp(V.ty, G.ty, rz, rdt); V.tz = damp(V.tz, G.tz, rz, rdt);
    V.ox = damp(V.ox, G.ox, rz, rdt); V.oy = damp(V.oy, G.oy, rz, rdt);
    const yv = (V.yaw - py) / Math.max(rdt, 1e-3); env.yawAcc = (yv - lastYawV) / Math.max(rdt, 1e-3); lastYawV = yv;

    // the machine floats; it holds still while a mechanism is being worked
    env.live = damp(env.live, S.focus || RM || S.paused ? 0 : 1, 3, rdt);
    env.bob = Math.sin(now * 0.00075) * 0.13 * env.live;
    rig.rotation.y = V.yaw; rig.position.y = env.bob;
    rig.rotation.z = Math.sin(now * 0.00052) * 0.008 * env.live; rig.rotation.x = Math.cos(now * 0.00043) * 0.008 * env.live;
    env.rdt = rdt; env.yaw = V.yaw;

    camera.position.set(V.tx, V.ty + Math.sin(V.pitch) * V.dist, V.tz + Math.cos(V.pitch) * V.dist);
    camera.lookAt(V.tx, V.ty, V.tz);
    if (Math.abs(V.ox) > 0.5 || Math.abs(V.oy) > 0.5) camera.setViewOffset(W, H, V.ox, V.oy, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();

    B.update(dt, S.time, env);
    for (const m of MECHS) { env.focused = S.focus === m; m.update(dt, S.time, env); }

    // hover
    if (hoverXY && !drag && !mechDrag) {
      cast(hoverXY);
      const grip = S.focus && S.focus.pointer && S.focus.pointer('hover', local(S.focus));
      if (grip) { setHover(null); canvas.style.cursor = 'grab'; } else { const m = pick(); if (S.hover === m && !m) canvas.style.cursor = ''; setHover(m); }
    }
    // tags and plate glow
    scene.updateMatrixWorld();
    let best = -1; nearest = null;
    for (const m of MECHS) {
      const fc = facing(m);
      if (!m.onTop && fc > best) { best = fc; nearest = m; }
      const show = !S.focus && S.intro > 0.6 ? sat((fc - 0.22) / 0.3) : 0;
      m.tagO = damp(m.tagO, show, 8, rdt);
      if (m.tagO > 0.01) {
        v3.set(m.anchor[0], m.anchor[1], m.anchor[2]); m.host.localToWorld(v3); v3.project(camera);
        m.tag.style.transform = 'translate(' + ((v3.x * 0.5 + 0.5) * W).toFixed(1) + 'px,' + ((-v3.y * 0.5 + 0.5) * H).toFixed(1) + 'px)';
        m.tag.style.opacity = m.tagO.toFixed(3); m.tag.style.visibility = 'visible';
      } else if (m.tag.style.visibility !== 'hidden') m.tag.style.visibility = 'hidden';
      m.glow = damp(m.glow, S.hover === m && S.focus !== m ? 1 : 0, 10, rdt);
      if (m.boardMat) m.boardMat.emissive.setRGB(0.05 * m.glow, 0.035 * m.glow, 0.015 * m.glow);
    }
    if (!S.focus) { const top = sat((Math.sin(V.pitch) - 0.55) * 4) > 0.5 ? byId.clusters : nearest; figLinks.forEach((a) => a.classList.toggle('near', !!top && a.dataset.figLink === top.id)); }

    renderer.render(scene, camera);

    // keep the frame rate: shed pixels first, then shadows
    if (raw < 0.12) { acc += raw; frames++; }      // a throttled background tab is not a slow machine
    if (frames >= 50) {
      const ms = (acc / frames) * 1000; acc = 0; frames = 0;
      if (now - t0 > 4000 && ms > 26) { slow++; if (slow >= 2) { slow = 0; if (PR > 1) { PR = Math.max(1, PR - 0.5); renderer.setPixelRatio(PR); renderer.setSize(W, H, false); } else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; key.castShadow = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); } } } else slow = 0;
    }
  }

  new ResizeObserver(resize).observe(canvas); resize();
  if (RM) { MECHS.forEach((m) => m.settle && m.settle()); Object.assign(V, { yaw: G.yaw, pitch: G.pitch, dist: G.dist }); }
  route(location.hash, false);
  renderer.setAnimationLoop(frame);
  root.classList.add('ready');
  window.__machine = { S, V, G, MECHS, route, renderer, camera, THREE, run(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) frame(last + 1000 / 60); last = performance.now(); } };
}

start().catch(fail);
