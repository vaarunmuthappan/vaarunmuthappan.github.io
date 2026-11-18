/* home.js: landing-sheet wiring (SPEC-5 §2.4, §2.8, §2.9, §2.12; SPEC-6 Part 3).
   Field I entry choreography, the destination and closing controls, the plumb line's sway (Field I only,
   bob at rest), S6, and the two centrepieces, each a module that handles its own entry gate, controls,
   reduced motion and resize: Centrepieces.process (process.js, Field II) and Centrepieces.springRule
   (springrule.js, Field III, plus its first-viewport miniature). A missing module leaves its still. */
(function () {
  'use strict';
  var W = window, D = document, root = D.documentElement, H = W.Hand, S = W.Studies;
  if (!H || !S || !W.matchMedia || root.classList.contains('sheet-failed')) return;
  try { init(); root.classList.add('sheet-live'); }
  catch (e) { root.classList.add('sheet-failed'); stills(); if (W.console) W.console.error(e); }

  function still(el) {
    if (!el || el.querySelector('img.still')) return;
    var i = new Image(), nn = el.getAttribute('data-still-n'); i.alt = ''; i.className = 'still';
    i.onerror = function () { if (i.parentNode) i.parentNode.removeChild(i); };
    i.src = nn && matchMedia('(max-width: 719px)').matches ? nn : el.getAttribute('data-still'); el.appendChild(i);
  }
  function stills() { D.querySelectorAll('[data-still]').forEach(still); }

  function init() {
    H.start();
    var reduced = H.reduced, fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduced) root.classList.add('reduced');
    function q(s) { return D.querySelector(s); }

    // ---- Field I: name guide rules (measured from the rendered text) -------------------
    var name = q('.name'), nameA = name.querySelector('a'), gHost = name.querySelector('.guides');
    var guides = {
      id: 'name', viewBox: function (h) { return [0, 0, Math.max(1, h.clientWidth), Math.max(1, h.clientHeight)]; },
      build: function (pen, st) {
        var hr = gHost.getBoundingClientRect(), bl = name.querySelectorAll('.bl'), fs = parseFloat(getComputedStyle(name).fontSize);
        var b1 = bl[0].getBoundingClientRect().top - hr.top, b2 = bl[1].getBoundingClientRect().top - hr.top, w = st.vb[2];
        var rects = nameA.getClientRects(), last = rects[rects.length - 1], x0 = bl[1].getBoundingClientRect().left - hr.left;
        pen.step(0, 180, function () { pen.rule([0, b1 - 0.65 * fs], [w, b1 - 0.65 * fs], { flush: true }); });
        pen.step(160, 180, function () { pen.rule([0, b1], [w, b1], { flush: true }); });
        pen.step(320, 180, function () { pen.rule([0, b2], [w, b2], { flush: true }); });
        var y = b2 + Math.max(8, 0.14 * fs), pts = H.wobble([[x0, y], [x0 + (last ? last.width : 300), y]], 0.45, 70, 19, 1, 'name:ul');
        H.el('path', { 'class': 'ul', pathLength: 1, d: H.pathD(pts), fill: 'none', stroke: H.C.ink, 'stroke-opacity': 0.9, 'stroke-width': 1.25, 'stroke-linecap': 'round' }, st.layers.ink);
      }
    };
    var gst = H.study(gHost, guides);
    H.autoplay(gst, 0, 0);
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(function () { gst.measure(); if (gst.state !== 'drawing') gst.rebuild(); });

    // ---- Field I studies ---------------------------------------------------------------
    var s2 = H.study(q('.s2'), S.golden), s3 = H.study(q('.s3'), S.icosa), s4 = H.study(q('.s4'), S.hoist);
    H.autoplay(s2, 500); H.autoplay(s4, 1200); H.autoplay(s3, 1700);

    // ---- controls: destination studies and closing links ------------------------------------
    var lastType = 'mouse';
    D.addEventListener('pointerdown', function (e) { lastType = e.pointerType; }, true);
    function rule(host, id, after) { var st = H.study(host, S.indexRule(id)); H.autoplay(st, after, 0); return st; }
    [['.dest-c', s3, 72], ['.dest-p', s4, 30]].forEach(function (d, i) {
      var a = q(d[0]); rule(a.querySelector('.ir'), 'ir-d' + i, 600);
      function on() { S.nudge(d[1], d[2]); } function off() { S.nudge(d[1], 0); }
      a.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') on(); });
      a.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch' && D.activeElement !== a) off(); });
      a.addEventListener('focus', function () { if (a.matches(':focus-visible')) on(); });
      a.addEventListener('blur', off);
      a.addEventListener('click', function (e) { go(e, a, a.querySelector('.study')); });
    });
    D.querySelectorAll('.cl').forEach(function (a, i) {
      rule(a.querySelector('.ir'), 'ir-c' + i, 0);
      var g = H.study(a.querySelector('.glyph'), S.glyph(i ? 'gear' : 'icosa')); H.autoplay(g, 0, 0.5);
    });
    function go(e, a, keep) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || reduced) return;
      e.preventDefault();
      var touch = lastType === 'touch';
      if (touch) a.classList.add('tap');
      if (keep) keep.classList.add('keep');
      D.body.classList.add('leaving');
      setTimeout(function () { W.location.href = a.href; }, touch ? 170 : 180);
    }
    W.addEventListener('pageshow', function () {
      D.body.classList.remove('leaving'); D.querySelectorAll('.keep, .tap').forEach(function (el) { el.classList.remove('keep', 'tap'); });
    });

    // ---- Field IV: bio rules ---------------------------------------------------------------
    D.querySelectorAll('.brule').forEach(function (h, i) {
      var st = H.study(h, { id: 'bio' + i, viewBox: [0, 0, 120, 8], build: function (pen) { pen.step(0, 360, function () { pen.ink([[0, 4], [120, 4]], { w: 'fine', split: false }); }); } });
      H.autoplay(st, 0, 1);
    });

    // ---- the plumb line (S5) with its damped sway: Field I only, bob at rest, no payout ----------
    var pHost = q('.plumb');
    var plumbSt = H.study(pHost, S.plumb(1));
    var phi = 0, om = 0, w0 = 2 * Math.PI / 2.2, zeta = 0.34, lastV = 0, lastT = 0;
    function len() { return Math.max(100, pHost.clientHeight - 30); }
    function sway(now, dt) {
      var h = dt / 1000, L = len(), cap = 10 / L;
      om += (-2 * zeta * w0 * om - w0 * w0 * phi) * h; phi += om * h;
      if (Math.abs(phi) > cap) { phi = cap * Math.sign(phi); om *= -0.3; }
      if (L * Math.hypot(phi, om / w0) < 0.3) { phi = om = 0; pHost.style.transform = ''; pHost.style.willChange = ''; return false; }
      pHost.style.transform = 'rotate(' + phi.toFixed(6) + 'rad)'; return true;
    }
    pHost.style.transformOrigin = '30px 10px';
    var broadMQ = matchMedia('(min-width: 1200px)');
    if (!reduced) {
      H.autoplay(plumbSt, 140, 0);
      setTimeout(function () {
        if (D.hidden || !broadMQ.matches) return;
        var fold = Math.max(200, W.innerHeight - pHost.getBoundingClientRect().top - 10);
        phi = Math.min(10 / len(), 4 / fold); om = 0; pHost.style.willChange = 'transform'; H.loop.add(sway);
      }, 1100);
      H.onScroll(function (y, dy, dt) {
        if (!broadMQ.matches) return;
        var now = W.performance.now(), v = dy / Math.max(8, dt);
        if (now - lastT > 120) lastV = 0; lastT = now;
        var dv = Math.max(-2, Math.min(2, v - lastV)); lastV = v;
        // the bob hangs in Field I: sway only while it is near the viewport
        if (pHost.getBoundingClientRect().bottom < -200) return;
        om += dv * 3 / len(); pHost.style.willChange = 'transform'; H.loop.add(sway);
      });
    } else plumbSt.finish();

    var s6 = H.study(q('.s6-slot'), S.toss); H.autoplay(s6, 0, 0.35);

    // ---- the centrepieces (design/SPEC-6.md build contract) ---------------------------------------
    var CPs = W.Centrepieces || {}, hp = q('.cp-host-p'), hs = q('.cp-host-s'), hm = q('.mini');
    function mount(mod, fn, host, opts) {
      if (!mod || !mod[fn]) { still(host); return null; }
      try { return mod[fn](host, opts); } catch (e) { still(host); if (W.console) W.console.error(e); return null; }
    }
    var process = mount(CPs.process, 'mount', hp), spring = mount(CPs.springRule, 'mount', hs), mini = mount(CPs.springRule, 'mountMini', hm, { after: 700 });
    W.__sheet = { process: process, spring: spring, mini: mini };
  }
})();
