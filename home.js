/* home.js: Posterior Ridge (INDEX.FIG001). Dependency-free.
   Model: theta ~ Beta(a0, b0); 48 fixed synthetic Bernoulli observations
   (illustrative, not real data). After n observations with k yes the
   posterior is Beta(a0 + k, b0 + n - k). Densities are exact (log space,
   integer parameters); the 90% interval is the equal-tailed 5th-95th
   percentile from the exact CDF (binomial-sum identity), by bisection. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var fig = doc.getElementById('ridge');
  if (!fig || !window.matchMedia || root.classList.contains('ridge-failed')) return;

  var DATA = '010010000010001010000100010010010001001001000101';
  var N = 48, PTS = 201, STEP_MS = 55, SVGNS = 'http://www.w3.org/2000/svg';
  var PRIORS = { flat: [1, 1], centred: [10, 10] };
  var GEO = {
    d: { w: 672, h: 512, x0: 56, x1: 656, y0: 88, p: 8, u: 22 },
    m: { w: 350, h: 372, x0: 30, x1: 342, y0: 56, p: 6, u: 14 }
  };

  // ---- maths ------------------------------------------------------------
  var LF = [0];
  for (var q = 1; q < 128; q++) LF[q] = LF[q - 1] + Math.log(q);
  function lbeta(a, b) { return LF[a - 1] + LF[b - 1] - LF[a + b - 1]; }
  function pdf(x, a, b) {
    var l = -lbeta(a, b);
    if (a > 1) { if (x <= 0) return 0; l += (a - 1) * Math.log(x); }
    if (b > 1) { if (x >= 1) return 0; l += (b - 1) * Math.log(1 - x); }
    return Math.exp(l);
  }
  // I_x(a, b) = P(Binomial(a + b - 1, x) >= a) for integer a, b
  function cdf(x, a, b) {
    var m = a + b - 1, lx = Math.log(x), l1 = Math.log(1 - x), s = 0;
    for (var j = a; j <= m; j++) s += Math.exp(LF[m] - LF[j] - LF[m - j] + j * lx + (m - j) * l1);
    return s;
  }
  function quantile(p, a, b) {
    var lo = 0, hi = 1;
    for (var i = 0; i < 36; i++) { var mid = (lo + hi) / 2; if (cdf(mid, a, b) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function states(prior) {
    var out = [], k = 0;
    for (var n = 0; n <= N; n++) {
      if (n > 0) k += +DATA[n - 1];
      var a = prior[0] + k, b = prior[1] + n - k, ys = [];
      for (var j = 0; j < PTS; j++) ys.push(pdf(j / (PTS - 1), a, b));
      out.push({ n: n, k: k, a: a, b: b, ys: ys, mean: a / (a + b),
        lo: quantile(0.05, a, b), hi: quantile(0.95, a, b) });
    }
    return out;
  }
  var ST = { flat: states(PRIORS.flat), centred: states(PRIORS.centred) };

  // ---- state ------------------------------------------------------------
  var mqSmall = matchMedia('(max-width: 719px)');
  var mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mqReduce.matches;
  var prior = 'flat', n = 0, geo, svg, rg, rows, tag, ticks;
  var lastT = 0, entry = null, entryTimer = 0, raf = 0, visible = false, entryWanted = false;

  var plot = fig.querySelector('.ridge-plot');
  var slider = fig.querySelector('#ridge-n');
  var tape = fig.querySelector('.ridge-tape');
  var scrub = fig.querySelector('.ridge-scrub');
  var hit = fig.querySelector('.ridge-thumbhit');
  var replay = fig.querySelector('.ridge-replay');
  var live = fig.querySelector('.ridge-announce');
  var out = {};
  fig.querySelectorAll('[data-out]').forEach(function (el) { out[el.getAttribute('data-out')] = el; });
  var radios = fig.querySelectorAll('input[name="ridge-prior"]');

  // ---- geometry ---------------------------------------------------------
  function f1(v) { return Math.round(v * 10) / 10; }
  function X(t) { return f1(geo.x0 + t * (geo.x1 - geo.x0)); }
  function base(i) { return geo.y0 + i * geo.p; }
  function rowMarkup(s, i) {
    var y = base(i), u = geo.u, d = 'M' + geo.x0 + ',' + y, band, j, t;
    for (j = 0; j < PTS; j++) d += 'L' + X(j / (PTS - 1)) + ',' + f1(y - s.ys[j] * u);
    d += 'L' + geo.x1 + ',' + y;
    band = 'M' + X(s.lo) + ',' + y + 'L' + X(s.lo) + ',' + f1(y - pdf(s.lo, s.a, s.b) * u);
    for (j = 0; j < PTS; j++) {
      t = j / (PTS - 1);
      if (t > s.lo && t < s.hi) band += 'L' + X(t) + ',' + f1(y - s.ys[j] * u);
    }
    band += 'L' + X(s.hi) + ',' + f1(y - pdf(s.hi, s.a, s.b) * u) + 'L' + X(s.hi) + ',' + y + 'Z';
    var mx = X(s.mean);
    return '<g class="r"><g class="c"><path class="f" d="' + d + '"/><path class="b" d="' + band +
      '"/><line class="m" x1="' + mx + '" x2="' + mx + '" y1="' + y + '" y2="' +
      f1(y - pdf(s.mean, s.a, s.b) * u) + '"/><path class="l" d="' + d + '"/></g><line class="g" x1="' +
      geo.x0 + '" x2="' + geo.x1 + '" y1="' + y + '" y2="' + y + '"/></g>';
  }
  function rowsMarkup() {
    var h = '';
    for (var i = 0; i <= N; i++) h += rowMarkup(ST[prior][i], i);
    return h;
  }
  function svgMarkup() {
    var g = geo, h = '', i, t, ref = X(0.3), b48 = base(N);
    h += '<svg class="ridge-svg" xmlns="' + SVGNS + '" viewBox="0 0 ' + g.w + ' ' + g.h + '" aria-hidden="true" focusable="false">';
    h += '<g class="rg">' + rowsMarkup() + '</g>';
    h += '<g class="ax">';
    [0, 12, 24, 36, 48].forEach(function (v) {
      h += '<text class="t" data-row="' + v + '" x="' + (g.x0 - 8) + '" y="' + (base(v) + 4) + '" text-anchor="end">' + v + '</text>';
    });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      h += '<text x="' + X(v) + '" y="' + (b48 + 16) + '" text-anchor="middle">' + v + '</text>';
    });
    h += '<text x="' + f1((g.x0 + g.x1) / 2) + '" y="' + (b48 + 29) + '" text-anchor="middle">θ, the underlying rate</text>';
    h += '<line class="ref" x1="' + ref + '" x2="' + ref + '" y1="14" y2="' + b48 + '"/>';
    h += '<text x="' + (ref - 4) + '" y="12" text-anchor="end">generating rate 0.30</text>';
    h += '</g><text class="tag" x="' + (g.x0 - 8) + '" y="0" text-anchor="end"></text></svg>';
    return h;
  }
  function bindRows() {
    rows = [];
    rg.querySelectorAll('.r').forEach(function (el) { rows.push({ el: el, l: el.querySelector('.l'), cls: '' }); });
  }
  function build() {
    geo = mqSmall.matches ? GEO.m : GEO.d;
    var holder = doc.createElement('div');
    holder.innerHTML = svgMarkup();
    var next = holder.firstChild;
    // the static fallback image stays in the DOM (hidden by CSS) so a failure can restore it
    if (svg) plot.replaceChild(next, svg); else plot.appendChild(next);
    svg = next; rg = svg.querySelector('.rg'); tag = svg.querySelector('.tag');
    ticks = svg.querySelectorAll('.t');
    bindRows();
  }

  // ---- render -----------------------------------------------------------
  function fmtText(s) {
    return s.n + ' of 48 observations, ' + s.k + ' yes, ' + (s.n - s.k) + ' no. Posterior mean ' +
      s.mean.toFixed(2) + ', 90% credible interval ' + s.lo.toFixed(2) + ' to ' + s.hi.toFixed(2) + '.';
  }
  function render(instant) {
    var s = ST[prior][n], i, r, cls;
    svg.classList.toggle('instant', !!instant || reduced);
    for (i = 0; i <= N; i++) {
      r = rows[i];
      cls = i < n ? 'r on' : i === n ? 'r on cur' : 'r un';
      if (cls !== r.cls) { r.el.setAttribute('class', cls); r.cls = cls; }
      r.l.style.strokeOpacity = i < n ? Math.min(1, Math.max(0.25, 1 - 0.018 * (n - i))) : '';
    }
    var ty = base(n) + 4;
    tag.setAttribute('y', ty);
    tag.textContent = 'n = ' + n;
    ticks.forEach(function (t) {
      t.classList.toggle('hid', Math.abs(+t.getAttribute('y') - ty) < 10);
    });
    var marks = tape.children;
    for (i = 0; i < N; i++) marks[i].classList.toggle('on', i < n);
    out.seen.textContent = n + ' / 48';
    out.yn.textContent = s.k + ' / ' + (n - s.k);
    out.post.textContent = 'Beta(' + s.a + ', ' + s.b + ')';
    out.mean.textContent = s.mean.toFixed(3);
    out.ci.textContent = s.lo.toFixed(2) + ' – ' + s.hi.toFixed(2);
    if (+slider.value !== n) slider.value = n;
    scrub.style.setProperty('--n', n);
    slider.setAttribute('aria-valuetext', fmtText(s));
  }
  function setN(v, instant) {
    v = Math.max(0, Math.min(N, v));
    if (v === n) return;
    n = v;
    render(instant);
  }
  // user-driven change: single forward steps fade; jumps, fast runs and backward moves are instant
  function userN(v) {
    cancelEntry();
    var now = performance.now(), instant = v - n !== 1 || now - lastT < 100;
    lastT = now;
    setN(v, instant);
  }

  // ---- entry sequence ---------------------------------------------------
  function cancelEntry() {
    entryWanted = false;
    clearTimeout(entryTimer); cancelAnimationFrame(raf);
    entry = null;
  }
  function queueEntry() {
    cancelEntry();
    if (reduced) return;
    entryWanted = true;
    entryTimer = setTimeout(function () { entryTimer = 0; maybeStart(); }, 500);
  }
  function maybeStart() {
    if (!entryWanted || entryTimer || entry || !visible) return;
    if (doc.hidden) { cancelEntry(); setN(N, true); return; }
    entry = { t0: performance.now() };
    raf = requestAnimationFrame(tick);
  }
  function tick(t) {
    if (!entry) return;
    var k = Math.min(N, Math.floor((t - entry.t0) / STEP_MS));
    if (k > n) setN(k, false);
    if (k >= N) { entry = null; entryWanted = false; return; }
    raf = requestAnimationFrame(tick);
  }
  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden && entryWanted) { cancelEntry(); setN(N, true); }
  });

  // ---- prior ------------------------------------------------------------
  var swapTimer = 0;
  function setPrior(p) {
    if (p === prior || !ST[p]) return;
    prior = p;
    clearTimeout(swapTimer);
    var swap = function () {
      rg.innerHTML = rowsMarkup();
      bindRows();
      render(true);
      rg.style.opacity = '';
    };
    if (reduced) swap();
    else { rg.style.opacity = '0'; swapTimer = setTimeout(swap, 100); }
    var lbl = fig.querySelector('input[value="' + p + '"]').parentNode.textContent.trim();
    var s = ST[prior][n];
    live.textContent = 'Prior: ' + lbl + '. Posterior Beta(' + s.a + ', ' + s.b + '), mean ' +
      s.mean.toFixed(2) + ', 90% credible interval ' + s.lo.toFixed(2) + ' to ' + s.hi.toFixed(2) + '.';
  }

  // ---- input ------------------------------------------------------------
  function onMq(mq, fn) { if (mq.addEventListener) mq.addEventListener('change', fn); else mq.addListener(fn); }
  function bind() {
    slider.addEventListener('input', function () { userN(+slider.value); });
    radios.forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) { cancelEntry(); setPrior(r.value); } });
    });
    replay.addEventListener('click', function () { cancelEntry(); setN(0, true); queueEntry(); });

    // coarse pointers: thumb-only drag; a vertical swipe scrolls (pointercancel) and leaves n alone
    var th = null;
    hit.addEventListener('pointerdown', function (e) {
      var r = slider.getBoundingClientRect();
      th = { id: e.pointerId, x: e.clientX, on: false, left: r.left, w: r.width,
        inset: parseFloat(getComputedStyle(scrub).getPropertyValue('--inset')) || 10 };
      hit.setPointerCapture(e.pointerId);
    });
    hit.addEventListener('pointermove', function (e) {
      if (!th || th.id !== e.pointerId) return;
      if (!th.on && Math.abs(e.clientX - th.x) < 4) return;
      th.on = true;
      slider.focus({ preventScroll: true });
      userN(Math.round((e.clientX - th.left - th.inset) / (th.w - 2 * th.inset) * N));
    });
    function thEnd(e) { if (th && th.id === e.pointerId) th = null; }
    hit.addEventListener('pointerup', thEnd);
    hit.addEventListener('pointercancel', thEnd);

    var rect = null, drag = null, tap = null;
    function rowAt(cy) {
      var v = (cy - rect.top) * (geo.h / rect.height);
      return Math.max(0, Math.min(N, Math.round((v - geo.y0) / geo.p)));
    }
    plot.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') { tap = { x: e.clientX, y: e.clientY, t: e.timeStamp }; return; }
      if (e.button !== 0) return;
      rect = svg.getBoundingClientRect();
      drag = e.pointerId;
      plot.setPointerCapture(drag);
      e.preventDefault();
      userN(rowAt(e.clientY));
    });
    plot.addEventListener('pointermove', function (e) {
      if (drag === e.pointerId) userN(rowAt(e.clientY));
    });
    function end(e) {
      if (drag === e.pointerId) { drag = null; return; }
      if (tap && e.type === 'pointerup' && e.pointerType === 'touch' &&
          Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10 && e.timeStamp - tap.t < 300) {
        rect = svg.getBoundingClientRect();
        userN(rowAt(e.clientY));
      }
      tap = null;
    }
    plot.addEventListener('pointerup', end);
    plot.addEventListener('pointercancel', end);

    onMq(mqSmall, function () { build(); render(true); });
    onMq(mqReduce, function () {
      reduced = mqReduce.matches;
      replay.hidden = reduced;
      if (reduced && entryWanted) { cancelEntry(); setN(N, true); }
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        var e = es[es.length - 1], rb = e.rootBounds;
        visible = e.intersectionRatio >= 0.4 || (rb && e.intersectionRect.height >= 0.4 * rb.height);
        maybeStart();
      }, { threshold: [0, 0.2, 0.4, 0.6] }).observe(fig);
    } else visible = true;
  }

  // ---- init -------------------------------------------------------------
  function init() {
    var h = '';
    for (var i = 0; i < N; i++) {
      h += '<span class="mk' + (DATA[i] === '1' ? ' y' : '') + '" style="--i:' + (i + 1) + '"></span>';
    }
    tape.innerHTML = h;
    n = reduced ? N : 0;
    slider.value = n;
    build();
    render(true);
    bind();
    fig.querySelectorAll('[hidden]').forEach(function (el) { el.hidden = false; });
    replay.hidden = reduced;
    root.classList.add('ridge-live');
    queueEntry();
  }

  try { init(); } catch (err) {
    root.classList.add('ridge-failed');
    if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
    if (window.console) console.error(err);
  }
})();
