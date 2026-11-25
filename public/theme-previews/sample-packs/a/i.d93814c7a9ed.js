
(function () {
  var root = document.documentElement;
  if (!root.classList.contains('mt-img-reveal')) root.classList.add('mt-img-reveal');
  var rm = false;
  try { rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  // Pictures are shown the moment they arrive, never faded in: fades on every
  // picture made landing on a page look slow and flickery.
  var canFade = false;
  var FADE_MS = 500, CACHED_MS = 90;

  // Has the page painted yet? (This runs at the end of <body>, so it may have.)
  var painted = false;
  try { painted = performance.getEntriesByType('paint').length > 0; } catch (e) {}
  if (!painted) {
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () { raf(function () { painted = true; }); });
  }

  var seen = ('WeakSet' in window) ? new WeakSet() : null;
  var SKIP = /(?:^|\s)(secondary-image|opacity-0|invisible)(?:\s|$)/;

  function eligible(el) {
    if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') { return false; }
    if (el.getAttribute('fetchpriority') === 'high') { return false; }
    var cn = (typeof el.className === 'string') ? el.className : '';
    if (cn && SKIP.test(cn)) { return false; }
    // Product pictures inside a .bls-image-js area have the skeleton reveal.
    if (cn.indexOf('bls-loaded-image') !== -1 && el.closest && el.closest('.bls-image-js')) { return false; }
    return true;
  }

  function onScreen(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
      r.top < (window.innerHeight || root.clientHeight) && r.left < (window.innerWidth || root.clientWidth);
  }

  function reveal(el, t0) {
    if (!canFade || !painted || (Date.now() - t0) < CACHED_MS) { return; }
    if (el.style.opacity !== '' || (el.closest && el.closest('[data-mt-redrawn]'))) { return; }
    // Never twice (round 20): a picture whose section reveal will show it
    // (animation.js waits for it) is not faded as well.
    if (el.closest && el.closest('.scroll-trigger--armed')) { return; }
    if (!onScreen(el)) { return; }
    var to = parseFloat(getComputedStyle(el).opacity);
    if (!(to > 0.05)) { return; }                     // hidden by design: leave it
    try { el.animate([{ opacity: 0 }, { opacity: to }], { duration: FADE_MS, easing: 'ease' }); } catch (e) {}
  }

  function prep(el) {
    if (!eligible(el)) { return; }
    if (seen) { if (seen.has(el)) { return; } seen.add(el); }
    var isImg = el.tagName === 'IMG';
    // Already shown, already failed, or no picture asked for yet: nothing to wait for.
    if (isImg ? el.complete : (el.readyState >= 2 || el.hasAttribute('poster'))) { return; }
    var t0 = Date.now();
    var tint = setTimeout(function () { el.classList.add('media-fade-wait'); }, CACHED_MS);
    function done(ok) {
      clearTimeout(tint);
      el.classList.remove('media-fade-wait');
      if (ok) { reveal(el, t0); }
    }
    el.addEventListener(isImg ? 'load' : 'loadeddata', function () { done(true); }, { once: true });
    el.addEventListener('error', function () { done(false); }, { once: true });
  }

  function scan(ctx) {
    if (ctx.tagName === 'IMG' || ctx.tagName === 'VIDEO') { prep(ctx); return; }
    if (!ctx.querySelectorAll) { return; }
    var nodes = ctx.querySelectorAll('img, video');
    for (var i = 0; i < nodes.length; i++) { prep(nodes[i]); }
  }

  /* ---- Lookahead: lazy pictures near the screen load before they arrive ---- */
  var ahead = null;
  function watchAhead(ctx) {
    if (!ahead) { return; }
    var list = (ctx.tagName === 'IMG') ? [ctx] : (ctx.querySelectorAll ? ctx.querySelectorAll('img[loading="lazy"]') : []);
    for (var i = 0; i < list.length; i++) {
      var img = list[i];
      if (img.getAttribute('loading') === 'lazy' && !img.complete) { ahead.observe(img); }
    }
  }
  function startAhead() {
    if (!('IntersectionObserver' in window)) { return; }
    var conn = navigator.connection;
    if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) { return; }
    ahead = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (!e.isIntersecting) { continue; }
        var img = e.target;
        ahead.unobserve(img);
        if (img.complete || img.getAttribute('loading') !== 'lazy') { continue; }
        // Not shown (a closed menu panel, a hidden slide or tab): leave it to the browser.
        // (Opacity is not a test: sections waiting for their scroll animation are at 0.)
        if (img.checkVisibility && !img.checkVisibility({ visibilityProperty: true })) { continue; }
        // Still below/beside the screen: fetch now, but behind what is on screen.
        var fp = img.getAttribute('fetchpriority');
        if (!onScreen(img) && (!fp || fp === 'auto')) { img.setAttribute('fetchpriority', 'low'); }
        img.setAttribute('loading', 'eager');
      }
    }, { rootMargin: '800px 400px' });
    watchAhead(document);
  }

  scan(document);

  if ('MutationObserver' in window) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType !== 1) { continue; }
          scan(added[j]);
          watchAhead(added[j]);
        }
      }
    }).observe(root, { childList: true, subtree: true });
  }

  // Only after the page has loaded (and the browser is idle), so the first
  // paint and the first pictures never share the network with it.
  function later() { (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(startAhead, { timeout: 1500 }); }
  if (document.readyState === 'complete') { later(); } else { window.addEventListener('load', later, { once: true }); }
})();
