/* bayes.js: data and maths for the landing experiment (shared with tools/make-static.html).
   Model: theta ~ Beta(a0, b0); 48 fixed synthetic Bernoulli observations (illustrative,
   generated once at a rate of 0.30; not real data). After n observations with k yes the
   posterior is Beta(a0 + k, b0 + n - k). Densities are exact (log space, integer
   parameters); the 90% interval is the equal-tailed 5th-95th percentile from the exact
   CDF (binomial-sum identity), by bisection. The maths section is moved verbatim from the
   previous home.js (lines 21-53 at commit 6dca36d). */
(function (root) {
  'use strict';
  var DATA = '010010000010001010000100010010010001001001000101';
  var N = 48, PTS = 201;
  var PRIORS = { flat: [1, 1], centred: [10, 10] };

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

  // ---- readout strings (formats unchanged from the previous home.js) ------
  function fmtText(s) {
    return s.n + ' of 48 observations, ' + s.k + ' yes, ' + (s.n - s.k) + ' no. Posterior mean ' +
      s.mean.toFixed(2) + ', 90% credible interval ' + s.lo.toFixed(2) + ' to ' + s.hi.toFixed(2) + '.';
  }

  // ---- table layout: fixed, deterministic ball slots (an illustration, not data) ----
  // slot[i] for observation i = 1..48: yes balls strictly left of 0.30, no balls right.
  // Depth (REVIEW-4-1 b2): rank balls left to right, k = 0..47, and take the first
  // t = 0, 1, 2... for which v(k) = frac(sin((k + 1 + 57t) * 12.9898) * 43758.5453)
  // differs from v(k-1) by >= 0.22 and from v(k-2) by >= 0.12.
  function frac(x) { return x - Math.floor(x); }
  function slots() {
    var out = [null], y = 0, no = 0, s, i;
    for (i = 1; i <= N; i++) {
      var yes = DATA[i - 1] === '1', u;
      if (yes) { s = (5 * y + 3) % 14; u = 0.012 + 0.276 * (s + 0.5) / 14; y++; }
      else { s = (13 * no + 7) % 34; u = 0.312 + 0.676 * (s + 0.5) / 34; no++; }
      out.push({ i: i, yes: yes, u: u, v: 0 });
    }
    var rank = out.slice(1).sort(function (p, q) { return p.u - q.u; });
    for (var k = 0; k < rank.length; k++) {
      for (var t = 0; t < 1000; t++) {
        var v = frac(Math.sin((k + 1 + 57 * t) * 12.9898) * 43758.5453);
        if ((k < 1 || Math.abs(v - rank[k - 1].v) >= 0.22) && (k < 2 || Math.abs(v - rank[k - 2].v) >= 0.12)) break;
      }
      rank[k].v = v;
    }
    return out;
  }

  // ---- curve paths for one posterior row (pure; used by home.js and make-static) ----
  // X(t) maps theta to x; y is the row baseline; u is height per unit density.
  // line: the curve only (no vertical drops at theta = 0 and 1); fill: closed along the baseline.
  function f1(v) { return Math.round(v * 10) / 10; }
  function rowPaths(s, X, y, u) {
    var line = '', band, j, t;
    for (j = 0; j < PTS; j++) line += (j ? 'L' : 'M') + f1(X(j / (PTS - 1))) + ',' + f1(y - s.ys[j] * u);
    band = 'M' + f1(X(s.lo)) + ',' + f1(y) + 'L' + f1(X(s.lo)) + ',' + f1(y - pdf(s.lo, s.a, s.b) * u);
    for (j = 0; j < PTS; j++) {
      t = j / (PTS - 1);
      if (t > s.lo && t < s.hi) band += 'L' + f1(X(t)) + ',' + f1(y - s.ys[j] * u);
    }
    band += 'L' + f1(X(s.hi)) + ',' + f1(y - pdf(s.hi, s.a, s.b) * u) + 'L' + f1(X(s.hi)) + ',' + f1(y) + 'Z';
    return { line: line, fill: line + 'L' + f1(X(1)) + ',' + f1(y) + 'L' + f1(X(0)) + ',' + f1(y) + 'Z', band: band,
      mx: f1(X(s.mean)), my: f1(y - pdf(s.mean, s.a, s.b) * u) };
  }

  root.Bayes = { DATA: DATA, N: N, PTS: PTS, PRIORS: PRIORS, ST: ST, pdf: pdf,
    fmtText: fmtText, slots: slots, rowPaths: rowPaths, f1: f1 };
})(typeof window !== 'undefined' ? window : this);
