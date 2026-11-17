/* script.js: notes pages (ids/, Capstone/). SPEC-5 §2.8, §2.11, §2.12.
   Behaviours kept from the previous round (all verified there):
   - every section is open without JS; with JS sections start collapsed and open by their heading
     (a real <button> moved inside the h2, aria-expanded, Enter/Space natively), by a contents link
     (scroll + focus), or by the URL hash on load and on hashchange; "Expand all" / "Collapse all";
   - the contents heading becomes a toggle below 1100 px (closed by default);
   - aria-current="location" on the contents link of the section in view;
   - the head failsafe removes .js after 1500 ms unless this script set .notes-live.
   New in round 5 (drawings through vignettes.js / hand.js when present; behaviours never depend on them):
   - plumb progress: the bob descends with reading progress (one rAF per scroll, no layout reads);
   - the contents rule with its sliding index frame (replaces the ball);
   - dividers glyphs on the section toggles, the Expand/Collapse all button and the contents toggle;
   - on narrow layouts the contents list is shown under the h1 (moved there, and back when wide). */
(function () {
  'use strict';
  var d = document, root = d.documentElement, W = window;
  var mqR = W.matchMedia('(prefers-reduced-motion: reduce)');
  var mqW = W.matchMedia('(min-width: 1100px)');
  var V = null;
  if (W.Vignettes && W.Hand && !root.classList.contains('sheet-failed')) {
    try { W.Hand.start(); V = W.Vignettes.notes(); } catch (e) { V = null; root.classList.add('sheet-failed'); if (W.console) W.console.error(e); }
  }
  function glyph(host, id, two) {
    if (!V) return;
    try { V.dividers(host, id, two); } catch (e) { if (W.console) W.console.error(e); }
  }
  function dv(two) { var s = d.createElement('span'); s.className = two ? 'dv dv2' : 'dv'; s.setAttribute('aria-hidden', 'true'); return s; }

  // ---- shared frame loop (only scheduled by scroll, resize or a toggle) ----
  var raf = 0, dirty = true, maxScroll = 0;
  function schedule(remeasure) {
    if (remeasure) dirty = true;
    if (!raf) raf = W.requestAnimationFrame(frame);
  }
  function measure() {
    maxScroll = root.scrollHeight - W.innerHeight;
    measureToc();
    dirty = false;
  }
  function frame() {
    raf = 0;
    if (dirty) measure();
    var y = W.pageYOffset;
    var p = maxScroll > 0 ? Math.min(1, Math.max(0, y / maxScroll)) : 1;
    if (V) V.progress(p);
    updateToc(y);
  }

  // ---- collapsible sections --------------------------------------------
  var secs = [].slice.call(d.querySelectorAll('.collapsible-section'));
  var allBtn = null, allTxt = null;
  function anyClosed() {
    for (var i = 0; i < secs.length; i++) if (!secs[i].classList.contains('active')) return true;
    return false;
  }
  function syncAll() { if (allTxt) allTxt.textContent = anyClosed() ? 'Expand all' : 'Collapse all'; }
  function setOpen(sec, on) {
    var was = sec.classList.contains('active');
    sec.classList.toggle('active', on);
    if (sec._btn) sec._btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    syncAll();
    if (V && on !== was) { try { V.toggled(sec, on); } catch (e) { if (W.console) W.console.error(e); } }
    schedule(true);
  }
  secs.forEach(function (sec, i) {
    var h = sec.querySelector('.section-header'), c = sec.querySelector('.section-content');
    if (!h || !c) return;
    if (!c.id) c.id = (sec.id || 'section-' + i) + '-content';
    var btn = d.createElement('button');
    btn.type = 'button';
    btn.className = 'sec-btn';
    btn.setAttribute('aria-controls', c.id);
    while (h.firstChild) btn.appendChild(h.firstChild);
    var g = dv(false); btn.insertBefore(g, btn.firstChild);
    h.appendChild(btn);
    glyph(g, 'dv-' + (sec.id || i));
    sec._btn = btn;
    btn.setAttribute('aria-expanded', sec.classList.contains('active') ? 'true' : 'false');
    btn.addEventListener('click', function () { setOpen(sec, !sec.classList.contains('active')); });
  });
  var meta = d.querySelector('.course-meta');
  if (secs.length && meta) {
    allBtn = d.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'expand-all';
    var g2 = dv(true); allBtn.appendChild(g2);
    allTxt = d.createElement('span'); allTxt.className = 'ea-t'; allBtn.appendChild(allTxt);
    allBtn.addEventListener('click', function () {
      var open = anyClosed();
      secs.forEach(function (s) { setOpen(s, open); });
      allBtn.setAttribute('data-open', anyClosed() ? 'false' : 'true');
    });
    meta.appendChild(allBtn);
    syncAll();
    allBtn.setAttribute('data-open', anyClosed() ? 'false' : 'true');
    glyph(g2, 'dv-all', true);
  }

  function reveal(id, smooth, focus) {
    var el = id && d.getElementById(id);
    if (!el) return false;
    var sec = el.closest ? el.closest('.collapsible-section') : null;
    if (sec && !sec.classList.contains('active')) { setOpen(sec, true); if (allBtn) allBtn.setAttribute('data-open', anyClosed() ? 'false' : 'true'); }
    el.scrollIntoView({ behavior: smooth && !mqR.matches ? 'smooth' : 'auto', block: 'start' });
    if (focus) {
      var t = sec === el && sec._btn ? sec._btn : null;
      if (!t) { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); t = el; }
      t.focus({ preventScroll: true });
    }
    return true;
  }
  function hashId() {
    try { return decodeURIComponent(W.location.hash.slice(1)); } catch (e) { return ''; }
  }

  // ---- contents: rule, ticks (CSS), sliding index ---------------------------------------------
  var toc = d.querySelector('.toc');
  var aside = toc && toc.parentNode;
  var tocList = toc && toc.querySelector('ul');
  var tocHead = toc && toc.querySelector('h2');
  var header = d.querySelector('.course-header');
  var links = toc ? [].slice.call(toc.querySelectorAll('a[href^="#"]')) : [];
  var targets = links.map(function (a) { return d.getElementById(a.getAttribute('href').slice(1)); });
  var tops = [], idxY = [], curIdx = -2, idx = null, placed = false, tocBtn = null, ruleHost = null;

  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var id = a.getAttribute('href').slice(1);
      if (reveal(id, true, true) && W.history && history.replaceState) history.replaceState(null, '', '#' + id);
    });
  });

  if (toc && tocList) {
    if (!tocList.id) tocList.id = 'toc-list';
    idx = d.createElement('span');
    idx.className = 'toc-idx';
    idx.setAttribute('aria-hidden', 'true');
    // the index frame of the rule, turned to run along a vertical rule: 18 x 10, hairline, knob
    idx.innerHTML = '<svg viewBox="-16 -6 30 12" width="30" height="12" focusable="false"><rect x="-9" y="-5" width="18" height="10" fill="#F5F1E8" fill-opacity=".9" stroke="#2A2521" stroke-width=".6"/>' +
      '<path d="M-9,0H9" stroke="#2A2521" stroke-width=".5"/><circle class="knob" cx="-12.4" cy="0" r="2.4" fill="#F5F1E8" stroke="#2A2521" stroke-width=".8"/></svg>';
    tocList.appendChild(idx);
    ruleHost = d.createElement('span');
    ruleHost.className = 'toc-rule';
    ruleHost.setAttribute('aria-hidden', 'true');
    tocList.insertBefore(ruleHost, tocList.firstChild);
  }
  function measureToc() {
    tops = targets.map(function (t) { return t ? t.getBoundingClientRect().top + W.pageYOffset : Infinity; });
    // centre of each entry's first line (14.5px / 1.4, 6px padding)
    idxY = links.map(function (a) { return a.parentNode.offsetTop + 6 + 14.5 * 1.4 / 2; });
    curIdx = -2;
  }
  function updateToc(y) {
    if (!idx) return;
    var i, k = -1, edge = y + 120;
    for (i = 0; i < tops.length; i++) if (tops[i] <= edge) k = i;
    if (maxScroll > 0 && y >= maxScroll - 2) {
      for (i = 0; i < tops.length; i++) if (tops[i] < y + W.innerHeight * 0.5) k = i;
    }
    if (k < 0) for (i = 0; i < targets.length; i++) if (targets[i]) { k = i; break; }
    if (k === curIdx) return;
    curIdx = k;
    links.forEach(function (a, j) { if (j === k) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    if (k < 0) { idx.classList.remove('on'); return; }
    if (!placed) idx.style.transition = 'none';
    idx.style.transform = 'translateY(' + idxY[k].toFixed(1) + 'px)';
    idx.classList.add('on');
    if (!placed) { placed = true; W.setTimeout(function () { idx.style.transition = ''; }, 60); }
  }
  var ruleSt = null;
  function drawRule() {
    if (!V || !ruleHost || ruleSt || !ruleHost.offsetHeight) return;
    try { ruleSt = V.tocRule(ruleHost); } catch (e) { if (W.console) W.console.error(e); }
  }

  // narrow: the contents sits under the h1 and its heading becomes a toggle, closed by default
  function setTocOpen(on) {
    toc.classList.toggle('closed', !on);
    if (tocBtn) tocBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) W.setTimeout(drawRule, 0);
    schedule(true);
  }
  function layoutToc() {
    if (!toc || !tocHead || !tocList) return;
    if (!mqW.matches && !tocBtn) {
      if (header && header.parentNode) header.parentNode.insertBefore(toc, header.nextSibling);
      tocBtn = d.createElement('button');
      tocBtn.type = 'button';
      tocBtn.className = 'toc-btn';
      tocBtn.setAttribute('aria-controls', tocList.id);
      while (tocHead.firstChild) tocBtn.appendChild(tocHead.firstChild);
      var g = dv(false); tocBtn.insertBefore(g, tocBtn.firstChild);
      tocHead.appendChild(tocBtn);
      glyph(g, 'dv-toc');
      tocBtn.addEventListener('click', function () { setTocOpen(toc.classList.contains('closed')); });
      setTocOpen(false);
    } else if (mqW.matches && tocBtn) {
      var gg = tocBtn.querySelector('.dv'); if (gg) tocBtn.removeChild(gg);
      while (tocBtn.firstChild) tocHead.appendChild(tocBtn.firstChild);
      tocHead.removeChild(tocBtn);
      tocBtn = null;
      if (aside) aside.appendChild(toc);
      toc.classList.remove('closed');
      W.setTimeout(drawRule, 0);
      schedule(true);
    }
  }

  // ---- lifecycle -----------------------------------------------------------
  function onMq(mq, fn) { if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); }
  layoutToc();
  onMq(mqW, layoutToc);
  drawRule();

  var initial = hashId();
  if (initial) reveal(initial, false, false);
  W.addEventListener('hashchange', function () { reveal(hashId(), true, false); });

  W.addEventListener('scroll', function () { schedule(false); }, { passive: true });
  W.addEventListener('resize', function () { schedule(true); });
  if (W.ResizeObserver) new ResizeObserver(function () { schedule(true); }).observe(d.body);
  root.classList.add('notes-live');
  schedule(true);
})();
