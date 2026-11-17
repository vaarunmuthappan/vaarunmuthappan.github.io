/* home.js: landing-sheet wiring (SPEC-5 §2.4, §2.8, §2.9, §2.12).
   Field I entry choreography, the destination and closing controls, the plumb line's sway, S6, and the
   experiment: the apparatus S1 (studies.js) driven by the native slider, prior radios (lever), Replay
   (crank), readouts and live region, wired to bayes.js (maths unchanged). */
(function () {
  'use strict';
  var W = window, D = document, root = D.documentElement, H = W.Hand, S = W.Studies, B = W.Bayes;
  if (!H || !S || !B || !W.matchMedia || root.classList.contains('sheet-failed')) return;
  try { init(); root.classList.add('sheet-live'); }
  catch (e) { root.classList.add('sheet-failed'); stills(); if (W.console) W.console.error(e); }

  function stills() {
    D.querySelectorAll('[data-still]').forEach(function (el) {
      if (el.querySelector('img.still')) return;
      var i = new Image(), nn = el.getAttribute('data-still-n'); i.alt = ''; i.className = 'still'; i.src = nn && matchMedia('(max-width: 719px)').matches ? nn : el.getAttribute('data-still'); el.appendChild(i);
    });
  }

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
    // c1: the miniature steelyard (constructs from 700 ms at n = 48 flat, then mirrors the apparatus)
    var mini = H.study(q('.mini'), S.apparatus(false, { prior: 'flat', n: 48 }, { mini: true })); H.autoplay(mini, 700, 0.35);

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

    // ---- Field III: bio rules ---------------------------------------------------------------
    D.querySelectorAll('.brule').forEach(function (h, i) {
      var st = H.study(h, { id: 'bio' + i, viewBox: [0, 0, 120, 8], build: function (pen) { pen.step(0, 360, function () { pen.ink([[0, 4], [120, 4]], { w: 'fine', split: false }); }); } });
      H.autoplay(st, 0, 1);
    });

    // ---- the plumb line (S5) with its damped sway -------------------------------------------
    var pHost = q('.plumb'), narrowMQ = matchMedia('(max-width: 1199px)');
    var plumbSt = H.study(pHost, S.plumb(narrowMQ.matches ? 44 / 58 : 1));
    var phi = 0, om = 0, w0 = 2 * Math.PI / 2.2, zeta = 0.34, lastV = 0, lastT = 0, bobTop = null;
    function len() { return Math.max(100, bobTop != null ? bobTop + 58 : pHost.clientHeight - 30); }
    function sway(now, dt) {
      var h = dt / 1000, L = len(), cap = 10 / L;
      om += (-2 * zeta * w0 * om - w0 * w0 * phi) * h; phi += om * h;
      if (Math.abs(phi) > cap) { phi = cap * Math.sign(phi); om *= -0.3; }
      if (L * Math.hypot(phi, om / w0) < 0.3) { phi = om = 0; pHost.style.transform = ''; pHost.style.willChange = ''; return false; }
      pHost.style.transform = 'rotate(' + phi.toFixed(6) + 'rad)'; return true;
    }
    pHost.style.transformOrigin = '30px 10px';
    if (!reduced) {
      H.autoplay(plumbSt, 140, 0);
      plumbSt.onLive(function () {});
      setTimeout(function () {
        if (D.hidden) return;
        var fold = Math.max(200, W.innerHeight - pHost.getBoundingClientRect().top - 10);
        phi = Math.min(10 / len(), 4 / fold); om = 0; pHost.style.willChange = 'transform'; H.loop.add(sway);
      }, 1100);
      H.onScroll(function (y, dy, dt) {
        var now = W.performance.now(), v = dy / Math.max(8, dt);
        if (now - lastT > 120) lastV = 0; lastT = now;
        var dv = Math.max(-2, Math.min(2, v - lastV)); lastV = v;
        om += dv * 3 / len(); pHost.style.willChange = 'transform'; H.loop.add(sway);
      });
    } else plumbSt.finish();
    // c2: on the broad sheet the bob pays out with scroll: bob top y = clamp(scrollY + 0.86 vh, 774, 1700) sheet units
    var broadMQ = matchMedia('(min-width: 1200px)'), gen = pHost.querySelector('.gen');
    function payout() {
      var P = plumbSt.parts; if (!P || !P.payout) return;
      var sc = narrowMQ.matches ? 44 / 58 : 1, y = P.top;
      if (broadMQ.matches && !reduced) { var u = Math.min(1.2, Math.max(0.84, W.innerWidth / 1440)), b = Math.max(774, Math.min(1700, 774 + 2.2 * W.scrollY / u)); /* REVIEW-5-2 item 5 */ y = (b - 56) * u; }
      y = P.payout(y); bobTop = y;
      // the label stands beside the bob only once it hangs at rest in Field II (it would cross Field I's drawings)
      if (gen) { gen.style.bottom = 'auto'; gen.style.top = Math.round(y + 10 + 29 * sc - 8) + 'px'; gen.style.opacity = y < P.top - 1 ? 0 : 1; }
    }
    payout(); H.onScroll(payout); H.onResize(payout); plumbSt.onLive(payout);
    narrowMQ.addEventListener('change', function () { plumbSt.def = S.plumb(narrowMQ.matches ? 44 / 58 : 1); plumbSt.measure(); plumbSt.rebuild(); payout(); });

    var s6 = H.study(q('.s6-slot'), S.toss); H.autoplay(s6, 0, 0.35);

    experiment(reduced, mini);
  }

  // ---- the experiment: S1 apparatus and its controls ---------------------------------------
  function experiment(reduced, mini) {
    var fig = D.getElementById('ridge'), frame = fig.querySelector('.frame'), slider = D.getElementById('ridge-n');
    var radios = fig.querySelectorAll('input[name="ridge-prior"]'), replay = fig.querySelector('.ridge-replay');
    var announce = fig.querySelector('.ridge-announce'), handle = fig.querySelector('.hud .handle'), out = {};
    var railHit = fig.querySelector('.rail-hit'), plinthHit = fig.querySelector('.plinth-hit'), lever = fig.querySelector('.lever');
    fig.querySelectorAll('[data-out]').forEach(function (el) { out[el.getAttribute('data-out')] = el; });
    var N = B.N, prior = 'flat', n = reduced ? N : 0, runT = 0, pending = !reduced, ast = null, lastStep = 0, built = false;
    var mqN = matchMedia('(max-width: 719px)');
    function geom() {
      if (ast) { ast.clear(); ast.svg.remove(); var i = H.studies.indexOf(ast); if (i >= 0) H.studies.splice(i, 1); }
      ast = H.study(frame, S.apparatus(mqN.matches, { prior: prior, n: n })); frame.insertBefore(ast.svg, frame.firstChild);
      if (reduced || built) ast.finish();
      else {
        gate();
        ast.onLive(function () { built = true; if (pending) { pending = false; run(100); } });
      }
      texts();
    }
    // entry gate (REVIEW-5-1 item 3): 20% visible, or top more than 120 px above the viewport bottom,
    // or the page within 40 px of its maximum scroll
    var gated = false;
    function gate() {
      if (gated || !ast || ast.state !== 'blank') return;
      var r = frame.getBoundingClientRect(), vh = W.innerHeight, vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / (r.height || 1);
      var nearEnd = W.scrollY + vh >= D.documentElement.scrollHeight - 40;
      if (vis >= 0.2 || (r.top < vh - 120 && r.bottom > 0) || nearEnd) { gated = true; ast.play(); }
    }
    H.onScroll(gate); H.onResize(gate);
    function texts() {
      var s = B.ST[prior][n];
      out.seen.textContent = s.n + ' / 48'; out.yn.textContent = s.k + ' / ' + (s.n - s.k);
      out.post.textContent = 'Beta(' + s.a + ', ' + s.b + ')'; out.mean.textContent = s.mean.toFixed(3);
      out.ci.textContent = s.lo.toFixed(2) + ' – ' + s.hi.toFixed(2);
      slider.value = n; slider.setAttribute('aria-valuetext', B.fmtText(s));
      handle.textContent = 'n = ' + n; handle.style.setProperty('--n', n);
      place(s);
    }
    var rvMean = fig.querySelector('.rv-mean'), rvCi = fig.querySelector('.rv-ci');
    function place(s) {
      if (!ast) return;
      var G = ast.def.G, X = ast.def.X, nar = mqN.matches, thr = X(0.3), fr = frame.getBoundingClientRect(), upx = G.vb[2] / (fr.width || 1);
      var ml = Math.max(X(s.mean) + (nar ? 10 : 14), thr + 8);
      rvMean.style.transition = ast.parts.kd ? 'left ' + ast.parts.kd + 'ms var(--ease-mech)' : '';
      rvMean.style.setProperty('--ml', ml.toFixed(2));
      var c = Math.max(nar ? 80 : 200, Math.min(nar ? 310 : 800, X((s.lo + s.hi) / 2))), half = rvCi.offsetWidth * upx / 2;
      var m0 = nar ? half + 10 * upx : -1e9, m1 = nar ? G.vb[2] - half - 10 * upx : 1e9; // narrow: at least 10 px inside the frame
      c = Math.max(m0, Math.min(m1, c));
      if (Math.abs(c - thr) < half + 6) { // step off the plumb thread, to whichever side fits inside the frame
        var cr = thr + half + 8, cl = thr - half - 8;
        c = (c >= thr ? (cr <= m1 ? cr : cl) : (cl >= m0 ? cl : cr));
      }
      rvCi.style.setProperty('--ic', c.toFixed(2));
      // Posterior clear of the right witness line (REVIEW-5-2 item 3)
      var xh = X(s.hi), pr = nar ? (xh > 352 - 90 ? xh - 8 : 352) : (xh > 775 ? xh - 10 : 878);
      fig.querySelector('.rv-post').style.setProperty('--pr', pr.toFixed(2));
    }
    function mirror(mode) { if (mini && mini.state === 'live' && mini.parts.set) mini.parts.set(prior, n, reduced ? 'instant' : mode); }
    function setN(v, mode) {
      if (ast.state !== 'live') { gated = true; ast.finish(); }
      n = v; ast.parts.set(prior, n, reduced ? 'instant' : mode); texts(); mirror(mode);
    }
    function stop() { clearTimeout(runT); runT = 0; pending = false; }
    function run(delay) {
      stop();
      runT = setTimeout(function step() {
        if (D.hidden) { setN(N, 'instant'); runT = 0; return; }
        if (n < N) { setN(n + 1, 'run'); runT = setTimeout(step, 55); } else runT = 0;
      }, delay);
    }
    function userN(v) {
      stop(); v = Math.max(0, Math.min(N, Math.round(v)));
      if (v === n) return;
      var now = W.performance.now(), mode = v === n + 1 && now - lastStep > 100 ? 'step' : 'instant';
      lastStep = now; setN(v, mode);
    }
    function setPrior(pk) {
      stop(); if (ast.state === 'drawing') ast.finish();
      prior = pk; ast.parts.set(prior, n, reduced ? 'instant' : 'prior'); texts(); mirror('prior');
      var s = B.ST[prior][n], lab = fig.querySelector('input[value="' + pk + '"] + span').textContent;
      announce.textContent = 'Prior: ' + lab + '. Posterior Beta(' + s.a + ', ' + s.b + '), mean ' + s.mean.toFixed(2) + ', 90% credible interval ' + s.lo.toFixed(2) + ' to ' + s.hi.toFixed(2) + '.';
    }
    // frame coordinates (viewBox units) of a client point
    function unit(e) { var r = frame.getBoundingClientRect(), vb = ast.vb; return [(e.clientX - r.left) / r.width * vb[2], (e.clientY - r.top) / r.height * vb[3]]; }
    function nAtX(e) { var G = ast.def.G; return (unit(e)[0] - G.X0) / G.slot; }
    function nAtY(e) { var G = ast.def.G; return (unit(e)[1] - G.ry0) / G.rdy; }

    slider.addEventListener('input', function () { userN(+slider.value); });
    slider.addEventListener('focus', function () { if (slider.matches(':focus-visible')) frame.classList.add('scrub-focus'); });
    slider.addEventListener('blur', function () { frame.classList.remove('scrub-focus'); });
    radios.forEach(function (r) { r.addEventListener('change', function () { if (r.checked) setPrior(r.value); }); });
    lever.addEventListener('click', function () { var o = radios[prior === 'flat' ? 1 : 0]; o.checked = true; o.focus({ preventScroll: true }); setPrior(o.value); });
    replay.addEventListener('click', function () {
      stop(); var arm = replay.querySelector('.carm');
      if (arm.animate && !reduced) arm.animate([{ transform: 'rotate(-40deg)' }, { transform: 'rotate(320deg)' }], { duration: 600, easing: 'cubic-bezier(.3,0,.2,1)' });
      setN(0, 'reset'); run(300);
    });
    D.addEventListener('visibilitychange', function () { if (D.hidden && runT) { stop(); setN(N, 'instant'); } });

    // the rail: mouse drags anywhere; touch drags only from the index (after 4 px of horizontal travel),
    // a tap sets n, and a vertical swipe is left to the browser (touch-action: pan-y) so n is unchanged.
    var drag = null;
    railHit.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') {
        if (e.button) return; e.preventDefault(); slider.focus({ preventScroll: true }); frame.classList.remove('scrub-focus');
        railHit.setPointerCapture(e.pointerId); drag = { id: e.pointerId, mouse: true, on: true }; userN(nAtX(e)); return;
      }
      var r = frame.getBoundingClientRect(), G = ast.def.G, tx = r.left + (G.X0 + G.slot * n) / ast.vb[2] * r.width;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: W.performance.now(), near: Math.abs(e.clientX - tx) <= 22, on: false };
    });
    railHit.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      if (!drag.mouse && !drag.on) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (drag.near && Math.abs(dx) > 4 && Math.abs(dx) > Math.abs(dy)) { drag.on = true; railHit.setPointerCapture(e.pointerId); }
        else return;
      }
      if (drag.on) userN(nAtX(e));
    });
    railHit.addEventListener('pointerup', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      if (!drag.mouse && !drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10 && W.performance.now() - drag.t < 300) userN(nAtX(e));
      drag = null;
    });
    railHit.addEventListener('pointercancel', function () { drag = null; });
    // the plinth: mouse drag selects the row under the cursor; touch is tap-only
    var pd = null;
    plinthHit.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') { if (e.button) return; e.preventDefault(); plinthHit.setPointerCapture(e.pointerId); pd = { id: e.pointerId, mouse: true }; userN(nAtY(e)); }
      else pd = { id: e.pointerId, x: e.clientX, y: e.clientY, t: W.performance.now() };
    });
    plinthHit.addEventListener('pointermove', function (e) { if (pd && pd.mouse && pd.id === e.pointerId) userN(nAtY(e)); });
    plinthHit.addEventListener('pointerup', function (e) {
      if (pd && !pd.mouse && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) < 10 && W.performance.now() - pd.t < 300) userN(nAtY(e));
      pd = null;
    });
    plinthHit.addEventListener('pointercancel', function () { pd = null; });

    mqN.addEventListener('change', function () { built = true; geom(); });
    geom();
    fig.querySelectorAll('.ridge-values, .ridge-scrub, .ridge-options').forEach(function (el) { el.hidden = false; });
    if (reduced) replay.hidden = true;
    W.__sheet = { set: function (pk, v) { if (pk !== prior) { radios[pk === 'flat' ? 0 : 1].checked = true; setPrior(pk); } userN(v); }, study: function () { return ast; } };
  }
})();
