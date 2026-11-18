/* notebook.js: the working sheet (round 7, sections 1, 5 and 7 of the sheet spec).
   The shell owns the artboard and its unit u, the header, title rows and hosts, the construction rules,
   the threads between figures, the pendulum clock (global pause), opening a figure as a plate (FLIP,
   hash routing, Back, Esc), the margin tiles, demonstration timers, the live region, resize, pocket mode
   and the fallback when a module is missing or throws. Figures follow the contract of section 1.6:
   Notebook.figures.<id>.mount(host, env) -> { layout(mode, animate), setRunning, setDemo, anchor, destroy }. */
(function () {
  'use strict';
  var W = window, D = document, root = D.documentElement, H = W.Hand, S = W.Studies;
  var NB = W.Notebook = W.Notebook || { figures: {} }; NB.figures = NB.figures || {};
  if (!H || !W.matchMedia || root.classList.contains('nb-failed')) return;
  try { init(); root.classList.add('nb-live'); }
  catch (e) { root.classList.add('nb-failed', 'sheet-failed'); if (W.console) W.console.error(e); }

  function init() {
    H.start();
    var reduced = H.reduced, C = H.C;
    if (reduced) root.classList.add('reduced');
    function q(s, r) { return (r || D).querySelector(s); }
    function qa(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
    var sheet = q('.nb-sheet'), live = q('.nb-live'), clock = q('.nb-clock'), layerHost = q('.nb-layer');
    var notes = q('.nb-notes'), tn1 = q('.nb-tn1'), nameA = q('.name a');
    var ORDER = ['regress', 'logit'];
    // overview host origins in sheet units (section 1.2)
    var ORIGIN = { regress: [40, 162], logit: [470, 162] };
    var figs = {}, open = null, pushed = false, running = true, userPaused = false, entered = false;

    function isBroad() { return W.innerWidth >= 1100 && W.innerHeight >= 600; }
    var broad = isBroad();
    function sheetU() { return Math.min(W.innerWidth / 1440, W.innerHeight / 810); }
    var U = sheetU();

    // ---- the live region -------------------------------------------------------------------
    var liveT = 0;
    function announce(text) { clearTimeout(liveT); live.textContent = ''; liveT = setTimeout(function () { live.textContent = String(text); }, 40); }

    // ---- demonstration timer: back on after 40 s with no input anywhere ------------------------
    var idleT = 0;
    function poke() { clearTimeout(idleT); if (!reduced) idleT = setTimeout(function () { ORDER.forEach(function (id) { var f = figs[id]; if (f.inst && f.ready) call(f, 'setDemo', true); }); }, 40000); }
    D.addEventListener('pointerdown', poke, true); D.addEventListener('keydown', poke, true);

    // ---- figures ------------------------------------------------------------------------------
    function call(f, name, a, b) {
      if (!f.inst || typeof f.inst[name] !== 'function') return null;
      try { return f.inst[name](a, b); }
      catch (e) { if (W.console) W.console.error('Fig ' + f.id + ': ' + name + ' failed', e); fail(f); return null; }
    }
    function fail(f) {
      if (f.inst && f.inst.destroy) { try { f.inst.destroy(); } catch (e2) { /* already broken */ } }
      f.inst = null; f.failed = true;
      f.host.innerHTML = '<p class="nb-miss">This experiment did not load.</p>';
      f.host.className = 'nb-host';
    }
    ORDER.forEach(function (id) {
      var sec = q('#fig-' + id), f = figs[id] = {
        id: id, sec: sec, host: q('.nb-host', sec), openB: q('.nb-open', sec), retB: q('.nb-return', sec), hash: sec.getAttribute('data-hash'),
        inst: null, mode: null, u: U, ready: false, failed: false, visible: true, hit: null
      };
      f.env = {
        u: function () { return f.u; }, reduced: reduced,
        running: function () { return running && f.visible; },
        announce: announce, interacted: poke
      };
      var mod = NB.figures[id];
      if (!mod || typeof mod.mount !== 'function') fail(f);
      else {
        try { f.inst = mod.mount(f.host, f.env); if (!f.inst || typeof f.inst.layout !== 'function') throw new Error('mount returned no instance'); }
        catch (e) { if (W.console) W.console.error('Fig ' + id + ' did not mount', e); fail(f); }
      }
      f.openB.addEventListener('click', function () { if (open !== id) openFig(id, { push: true, animate: true }); });
      f.retB.addEventListener('click', function () { closeFig({ animate: true }); });
      var hit = f.hit = D.createElement('span'); hit.className = 'nb-hit'; hit.setAttribute('aria-hidden', 'true'); hit.hidden = true;
      hit.addEventListener('click', function () { openFig(id, { push: true, animate: true }); });
      sec.appendChild(hit);
    });

    // ---- modes, sizes and layout --------------------------------------------------------------
    function modeOf(id) { return broad ? (open ? (open === id ? 'plate' : 'margin') : 'overview') : (open === id ? 'pocket' : 'margin'); }
    function sizeFig(f, mode) {
      var h = f.host;
      if (broad) { h.style.width = ''; h.style.height = ''; f.u = U; }
      else if (mode === 'pocket') { var w = Math.min(W.innerWidth, 640); h.style.width = w + 'px'; h.style.height = ''; f.u = w / 390; }
      else { h.style.width = ''; var cw = h.clientWidth || (W.innerWidth - 40); h.style.height = (cw * 170 / 230).toFixed(1) + 'px'; f.u = cw / 230; }
      h.style.setProperty('--fu', f.u + 'px');
    }
    function layoutFig(f, animate) {
      var m = modeOf(f.id);
      sizeFig(f, m);
      if (!f.inst || !f.ready) { f.mode = m; return; }
      f.mode = m; call(f, 'layout', m, !!animate);
    }
    function classes() {
      sheet.classList.toggle('is-plate', !!(broad && open));
      root.classList.toggle('nb-pocket', !broad);
      root.classList.toggle('nb-pplate', !broad && !!open);
      var t = 0;
      ORDER.forEach(function (id) {
        var f = figs[id], isOpen = open === id, tile = !!open && !isOpen && broad;
        f.sec.classList.toggle('is-open', isOpen);
        f.sec.classList.toggle('is-tile', tile);
        f.sec.classList.toggle('is-t1', tile && t === 0);
        if (tile) t++;
        f.retB.hidden = !isOpen;
        f.hit.hidden = !(tile || (!broad && !isOpen));
        f.openB.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }
    function applyAll(animate) {
      U = sheetU(); classes();
      ORDER.forEach(function (id) { layoutFig(figs[id], animate); });
      clockRunning();
      threads(false);
    }

    // ---- opening and returning (FLIP) ---------------------------------------------------------------
    var EASE = 'cubic-bezier(.3,0,.2,1)';
    function flip(f, before) {
      if (reduced || !before || !broad || !f.host.animate) return;
      var after = f.host.getBoundingClientRect(); if (!after.width) return;
      var s = before.width / after.width, dx = before.left - after.left, dy = before.top - after.top;
      f.host.animate([{ transformOrigin: '0 0', transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')' }, { transformOrigin: '0 0', transform: 'none' }], { duration: 320, easing: EASE });
    }
    function fadeOthers(except) {
      if (reduced || !broad) return;
      ORDER.forEach(function (id) { var f = figs[id]; if (id !== except && f.sec.animate) f.sec.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'linear' }); });
      if (notes.animate) notes.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'linear' });
    }
    function openFig(id, o) {
      o = o || {}; var f = figs[id]; if (!f || open === id) return;
      var was = open, before = f.host.getBoundingClientRect();
      open = id; applyAll(o.animate);
      if (o.animate) { flip(f, before); fadeOthers(id); }
      if (!broad) f.sec.scrollTop = 0;
      if (o.push) {
        if (was && pushed) history.replaceState({ nb: id }, '', '#' + f.hash);
        else if (!was) { history.pushState({ nb: id }, '', '#' + f.hash); pushed = true; }
        else history.replaceState({ nb: id }, '', '#' + f.hash);
      }
      if (o.focus !== false) f.retB.focus({ preventScroll: true });
    }
    function closeFig(o) {
      o = o || {}; if (!open) return;
      if (!o.fromPop) {
        if (pushed) { pushed = false; history.back(); return; } // popstate finishes the return
        history.replaceState(null, '', W.location.pathname + W.location.search);
      }
      var f = figs[open], before = f.host.getBoundingClientRect();
      open = null; applyAll(true);
      flip(f, before); fadeOthers(f.id);
      f.openB.focus({ preventScroll: true });
    }
    function fromHash() { var h = (W.location.hash || '').slice(1), id = null; ORDER.forEach(function (k) { if (figs[k].hash === h) id = k; }); return id; }
    W.addEventListener('popstate', function () {
      var id = fromHash();
      if (id) { if (open !== id) openFig(id, { animate: true }); }
      else if (open) { pushed = false; closeFig({ fromPop: true }); }
    });
    nameA.addEventListener('click', function (e) { if (open && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); closeFig({ animate: true }); } });
    D.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) { e.preventDefault(); closeFig({ animate: true }); return; }
      if ((e.key === ' ' || e.code === 'Space') && broad && !e.repeat) {
        var t = e.target;
        if (t && t.closest && t.closest('input, button, select, textarea, a, summary, [contenteditable], [role="slider"], [role="button"], [tabindex]')) return;
        e.preventDefault(); setPaused(!userPaused);
      }
    });

    // ---- the clock: a pendulum, the global pause ------------------------------------------------------
    var pend = H.study(q('.nb-pend', clock), {
      id: 'nb-clock', viewBox: [0, 0, 60, 88],
      build: function (pen, st) {
        var g = H.el('g', { 'class': 'swing' }, st.layers.ink); st.parts.g = g;
        pen.step(0, 200, function () {
          pen.ink([[18, 4], [42, 4]], { w: 1.3, split: false });
          pen.hatch([[18, 0], [42, 0], [42, 4], [18, 4]], { spacing: 2.6 });
        });
        pen.step(200, 120, function () { pen.fill('M27.6,7a2.4,2.4 0 1,0 4.8,0a2.4,2.4 0 1,0 -4.8,0Z', { fill: C.paper }, { g: g }); pen.ink(H.arcPts(30, 7, 2.4, -90, 270, 30), { closed: true, split: false, w: 'fine', g: g }); });
        pen.step(320, 300, function () { pen.thread([30, 9.4], [30, 64], { g: g }); });
        pen.step(600, 260, function () {
          pen.fill('M22.5,71.5a7.5,7.5 0 1,0 15,0a7.5,7.5 0 1,0 -15,0Z', { fill: C.paper }, { g: g });
          pen.ink(H.arcPts(30, 71.5, 7.5, -90, 270, 15), { closed: true, split: false, g: g });
          pen.hatch(H.arcPts(30, 71.5, 7.5, -20, 160, 15), { spacing: 2.2, g: g });
        });
      }
    });
    H.autoplay(pend, 0, 0);
    var swingT0 = 0, swinging = false;
    function swing(now) {
      var g = pend.parts.g; if (!g) return running;
      if (!running || reduced) { g.setAttribute('transform', ''); swinging = false; return false; }
      if (!swingT0) swingT0 = now;
      var a = 9 * Math.sin(2 * Math.PI * (now - swingT0) / 2000);
      g.setAttribute('transform', 'rotate(' + a.toFixed(2) + ' 30 7)');
      return true;
    }
    function clockRunning() { if (running && !reduced && broad && !swinging) { swinging = true; swingT0 = 0; H.loop.add(swing); } }
    function setRunningAll() {
      running = !userPaused && !D.hidden;
      ORDER.forEach(function (id) { var f = figs[id]; if (f.ready) call(f, 'setRunning', running && f.visible); });
      if (!running) { var g = pend.parts.g; if (g) g.setAttribute('transform', ''); swinging = false; }
      else clockRunning();
    }
    function setPaused(p) {
      userPaused = !!p;
      clock.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      clock.setAttribute('aria-label', userPaused ? 'Resume all motion' : 'Pause all motion');
      q('.nb-clock-w', clock).textContent = userPaused ? 'resume' : 'pause';
      setRunningAll();
    }
    clock.addEventListener('click', function () { setPaused(!userPaused); });
    D.addEventListener('visibilitychange', setRunningAll);
    clock.hidden = false;

    // visibility of hosts (pocket pages scroll); figures out of view get no clock
    if (W.IntersectionObserver) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { var f = e.target.__nbf; if (!f) return; var v = e.isIntersecting; if (v !== f.visible) { f.visible = v; if (f.ready) call(f, 'setRunning', running && v); } });
      }, { threshold: 0 });
      ORDER.forEach(function (id) { figs[id].host.__nbf = figs[id]; io.observe(figs[id].host); });
    }

    // ---- small drawn glyphs: the lens on each title, the folded corner on Return -------------------------
    qa('.nb-lens').forEach(function (h, i) {
      var st = H.study(h, { id: 'nb-lens' + i, viewBox: [-8, -8, 16, 16], build: function (pen) {
        pen.ink(H.arcPts(-1.2, -1.2, 4.6, -90, 270, 20), { closed: true, split: false, w: 1 });
        pen.ink([[2.2, 2.2], [6.6, 6.6]], { w: 1.4 });
      } });
      st.finish();
    });
    qa('.nb-fold').forEach(function (h, i) {
      var st = H.study(h, { id: 'nb-fold' + i, viewBox: [-1, -1, 18, 18], build: function (pen) {
        pen.ink([[2, 1], [11, 1], [15, 5], [15, 16], [2, 16]], { closed: true, split: false, w: 1 });
        pen.ink([[11, 1], [11, 5], [15, 5]], { split: false, w: 0.8 });
      } });
      st.finish();
    });

    // ---- header: the name's guides, the bio rules ----------------------------------------------------------
    var name = q('.name'), gHost = q('.guides', name), bl = D.createElement('span');
    bl.className = 'bl'; bl.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    nameA.insertBefore(bl, nameA.firstChild);
    var gst = H.study(gHost, {
      id: 'name', viewBox: function (h) { return [0, 0, Math.max(1, h.clientWidth), Math.max(1, h.clientHeight)]; },
      build: function (pen, st) {
        var hr = gHost.getBoundingClientRect(), fs = parseFloat(getComputedStyle(name).fontSize), b = bl.getBoundingClientRect().top - hr.top, w = st.vb[2];
        var x0 = bl.getBoundingClientRect().left - hr.left, tw = nameA.getBoundingClientRect().width;
        pen.step(0, 220, function () { pen.rule([0, b - 0.65 * fs], [w, b - 0.65 * fs], { flush: true }); });
        pen.step(160, 220, function () { pen.rule([0, b], [w, b], { flush: true }); });
        var y = b + Math.max(4, 0.14 * fs), pts = H.wobble([[x0, y], [x0 + tw, y]], 0.4, 70, 19, 1, 'name:ul');
        H.el('path', { 'class': 'ul', pathLength: 1, d: H.pathD(pts), fill: 'none', stroke: C.ink, 'stroke-opacity': 0.9, 'stroke-width': 1.1, 'stroke-linecap': 'round' }, st.layers.ink);
      }
    });
    H.autoplay(gst, 0, 0);
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(function () { gst.measure(); if (gst.state !== 'drawing') gst.rebuild(); threads(false); });
    qa('.brule').forEach(function (h, i) {
      var st = H.study(h, { id: 'bio' + i, viewBox: [0, 0, 120, 8], build: function (pen) { pen.step(0, 360, function () { pen.ink([[0, 4], [120, 4]], { w: 'fine', split: false }); }); } });
      H.autoplay(st, 0, 0);
    });

    // ---- Fig IV: the notes, with their living studies and index rules ---------------------------------------
    if (S) {
      var s3 = H.study(q('.s3'), S.icosa), s4 = H.study(q('.s4'), S.hoist);
      H.autoplay(s3, 1300, 0); H.autoplay(s4, 1500, 0);
      [['.dest-c', s3, 72], ['.dest-p', s4, 30]].forEach(function (d, i) {
        var a = q(d[0]), st = H.study(a.querySelector('.ir'), S.indexRule('ir-d' + i)); H.autoplay(st, 1400, 0);
        function on() { S.nudge(d[1], d[2]); } function off() { S.nudge(d[1], 0); }
        a.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') on(); });
        a.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch' && D.activeElement !== a) off(); });
        a.addEventListener('focus', function () { if (a.matches(':focus-visible')) on(); });
        a.addEventListener('blur', off);
      });
    }

    // ---- the drawn layer: construction rules (and the plate's rule) -----------------------------------------
    var layer = H.study(layerHost, {
      id: 'nb-layer', viewBox: [0, 0, 1440, 810],
      build: function (pen, st) {
        var ov = H.el('g', { 'class': 'nb-ov' }, st.layers.silver), pl = H.el('g', { 'class': 'nb-pl' }, st.layers.silver);
        pen.step(0, 600, function () { pen.rule([24, 124], [1416, 124]); });
        pen.step(150, 600, function () { pen.rule([455, 132], [455, 790], { g: ov }); });
        pen.step(300, 600, function () { pen.rule([1025, 132], [1025, 790], { g: ov }); });
        pen.step(450, 600, function () { pen.rule([1040, 452], [1400, 452], { g: ov }); });
        pen.step(0, 10, function () { pen.rule([1155, 132], [1155, 790], { g: pl }); });
      }
    });
    layer.svg.style.position = 'absolute'; layer.svg.style.inset = '0';
    var NS = 'http://www.w3.org/2000/svg', tsvg = D.createElementNS(NS, 'svg');
    tsvg.setAttribute('viewBox', '0 0 1440 810'); tsvg.setAttribute('aria-hidden', 'true'); tsvg.setAttribute('focusable', 'false');
    tsvg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
    layerHost.appendChild(tsvg);
    var th1 = H.el('path', { 'class': 'nb-th', d: '' }, tsvg);
    var threadsOn = false;

    // ---- threads between figures (section 1.3) --------------------------------------------------------------
    function at(id, name) {
      var f = figs[id]; if (!f.inst || !f.ready || f.mode !== 'overview') return null;
      var p = call(f, 'anchor', name); if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
      return [ORIGIN[id][0] + p.x, ORIGIN[id][1] + p.y];
    }
    function r1(v) { return Math.round(v * 10) / 10; }
    // A -> along y to the gutter at gx -> along the gutter to B's height -> to B, with rounded corners
    function route(A, gx, B, viaY) {
      var R = 10, d = 'M' + r1(A[0]) + ',' + r1(A[1]), y1 = viaY == null ? A[1] : viaY;
      if (viaY != null) { var s0 = Math.sign(viaY - A[1]) || -1; d += 'L' + r1(A[0]) + ',' + r1(viaY - s0 * R) + 'Q' + r1(A[0]) + ',' + r1(viaY) + ' ' + r1(A[0] + R) + ',' + r1(viaY); }
      var sy = Math.sign(B[1] - y1) || 1;
      d += 'L' + r1(gx - R) + ',' + r1(y1) + 'Q' + r1(gx) + ',' + r1(y1) + ' ' + r1(gx) + ',' + r1(y1 + sy * R);
      d += 'L' + r1(gx) + ',' + r1(B[1] - sy * R) + 'Q' + r1(gx) + ',' + r1(B[1]) + ' ' + r1(gx + R) + ',' + r1(B[1]) + 'L' + r1(B[0]) + ',' + r1(B[1]);
      return d;
    }
    function note(el, gx, y0, y1) {
      var w = el.offsetWidth / (U || 1), mid = (y0 + y1) / 2, yb = Math.max(132 + w, Math.min(790, mid + w / 2));
      el.style.setProperty('--x', r1(gx - 16.5)); el.style.setProperty('--y', r1(yb));
    }
    function threads(drawIn) {
      if (!entered) return;
      var show = broad && !open;
      var A1 = show && at('regress', 'equation'), B1 = show && at('logit', 'predictor');
      if (A1 && B1) { th1.setAttribute('d', route(A1, 455, B1)); note(tn1, 455, A1[1], B1[1]); } else th1.setAttribute('d', '');
      tn1.classList.toggle('on', !!(A1 && B1));
      if (drawIn && !reduced) [th1].forEach(function (p, i) {
        p.setAttribute('pathLength', '1'); p.classList.add('draw'); p.classList.remove('go'); p.getBoundingClientRect();
        setTimeout(function () { p.classList.add('go'); }, 30 + i * 200);
        setTimeout(function () { p.classList.remove('draw', 'go'); p.removeAttribute('pathLength'); }, 1100 + i * 200);
      });
      threadsOn = true;
    }

    // ---- entry choreography: rules draw, figures construct 250 ms apart, threads last --------------------------
    var hashId = fromHash();
    if (hashId) { open = hashId; history.replaceState({ nb: hashId }, '', W.location.href); pushed = false; }
    classes();
    ORDER.forEach(function (id) { sizeFig(figs[id], modeOf(id)); figs[id].mode = modeOf(id); });
    H.autoplay(layer, 0, 0);
    function enter(f) {
      f.ready = true;
      if (!f.inst) return;
      layoutFig(f, false);
      call(f, 'setRunning', running && f.visible);
      call(f, 'setDemo', !reduced);
    }
    if (reduced) { ORDER.forEach(function (id) { enter(figs[id]); }); entered = true; threads(false); }
    else {
      ORDER.forEach(function (id, i) { setTimeout(function () { enter(figs[id]); }, 450 + 250 * i); });
      setTimeout(function () { entered = true; threads(true); }, 3000);
    }
    if (hashId) figs[hashId].retB.focus({ preventScroll: true });
    clockRunning(); poke();

    // ---- resize (debounced by Hand.onResize) -------------------------------------------------------------------
    H.onResize(function () {
      var b = isBroad(), u = sheetU();
      if (b === broad && Math.abs(u - U) < 1e-4 && b) return;
      broad = b; applyAll(false);
    });

    // test hook for the evidence scripts
    NB.shell = {
      open: function (id) { openFig(id, { push: true, animate: true }); }, close: function () { closeFig({ animate: true }); },
      state: function () { return { open: open, broad: broad, u: U, running: running, paused: userPaused, modes: ORDER.map(function (id) { return id + ':' + figs[id].mode + (figs[id].failed ? ':failed' : '') + (figs[id].ready ? '' : ':waiting'); }) }; },
      pause: setPaused, figs: figs
    };
  }
})();
