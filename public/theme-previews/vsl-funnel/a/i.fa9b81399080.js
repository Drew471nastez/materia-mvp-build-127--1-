
(function () {
  var root = document.documentElement;
  if (window.__mtMediaLoad) return;
  window.__mtMediaLoad = true;
  if (!root.classList.contains('mt-img-reveal')) root.classList.add('mt-img-reveal');
  var rm = false;
  try { rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var FADE_MS = 260, CACHED_MS = 90, DECODE_MAX_MS = 400;

  // Has the page painted yet? (This runs at the end of <body>, so it may have.)
  var painted = false;
  try { painted = performance.getEntriesByType('paint').length > 0; } catch (e) {}
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  if (!painted) raf(function () { raf(function () { painted = true; }); });

  var seen = ('WeakSet' in window) ? new WeakSet() : null;
  var SKIP = /(?:^|\s)(secondary-image|opacity-0|invisible)(?:\s|$)/;

  function eligible(el) {
    if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') return false;
    if (el.getAttribute('fetchpriority') === 'high') return false;
    var cn = (typeof el.className === 'string') ? el.className : '';
    if (cn && SKIP.test(cn)) return false;
    // A dialog's own gallery (the quick view) shows its pictures itself: no
    // fade, and no layout read here while the dialog moves.
    if (el.closest && el.closest('[data-mt-instant]')) return false;
    return true;
  }

  function onScreen(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
      r.top < (window.innerHeight || root.clientHeight) && r.left < (window.innerWidth || root.clientWidth);
  }

  // Decoded before it is shown, so the frame that shows it has all of it.
  function decoded(img) {
    if (!img.decode) return Promise.resolve();
    return Promise.race([img.decode().catch(function () {}), new Promise(function (r) { setTimeout(r, DECODE_MAX_MS); })]);
  }

  function arrive(el, t0) {
    // A section the builder drew again after an edit (data-mt-redrawn) shows its pictures as they were, with no fade (round 67).
    var fade = !rm && painted && (Date.now() - t0) >= CACHED_MS && !(el.closest && el.closest('[data-mt-redrawn]')) && onScreen(el);
    if (!fade || el.tagName !== 'IMG') { el.classList.remove('media-fade-wait'); return; }
    // Held for its decode only (a few frames), then faded in from the tint it stands on.
    el.classList.add('media-fade-hold');
    decoded(el).then(function () {
      raf(function () {
        el.classList.remove('media-fade-hold');
        var to = parseFloat(getComputedStyle(el).opacity);
        if (!(to > 0.05)) { el.classList.remove('media-fade-wait'); return; }
        var a = null;
        try { a = el.animate([{ opacity: 0 }, { opacity: to }], { duration: FADE_MS, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' }); } catch (e) {}
        if (a && a.finished) a.finished.then(function () { el.classList.remove('media-fade-wait'); }, function () { el.classList.remove('media-fade-wait'); });
        else el.classList.remove('media-fade-wait');
      });
    });
  }

  function prep(el) {
    if (!eligible(el)) return;
    if (seen) { if (seen.has(el)) return; seen.add(el); }
    var isImg = el.tagName === 'IMG';
    // Already shown, already failed, or no picture asked for yet: nothing to wait for.
    if (isImg ? (el.complete && (el.naturalWidth > 0 || !el.currentSrc)) : (el.readyState >= 2 || el.hasAttribute('poster'))) return;
    var t0 = Date.now();
    var tint = setTimeout(function () { el.classList.add('media-fade-wait'); }, CACHED_MS);
    el.addEventListener(isImg ? 'load' : 'loadeddata', function () { clearTimeout(tint); arrive(el, t0); }, { once: true });
    el.addEventListener('error', function () { clearTimeout(tint); el.classList.remove('media-fade-wait', 'media-fade-hold'); }, { once: true });
  }

  function scan(ctx) {
    if (ctx.tagName === 'IMG' || ctx.tagName === 'VIDEO') { prep(ctx); return; }
    if (!ctx.querySelectorAll) return;
    var nodes = ctx.querySelectorAll('img, video');
    for (var i = 0; i < nodes.length; i++) prep(nodes[i]);
  }

  /* ---- Ahead of the scroll: lazy pictures near the screen load and decode before they arrive ---- */
  var ahead = null;
  function watchAhead(ctx) {
    if (!ahead) return;
    var list = (ctx.tagName === 'IMG') ? [ctx] : (ctx.querySelectorAll ? ctx.querySelectorAll('img[loading="lazy"]') : []);
    for (var i = 0; i < list.length; i++) {
      var img = list[i];
      if (img.getAttribute('loading') === 'lazy' && !img.complete && !(img.closest && img.closest('[data-mt-instant]'))) ahead.observe(img);
    }
  }
  function startAhead() {
    if (ahead || !('IntersectionObserver' in window)) return;
    var conn = navigator.connection;
    if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return;
    var opts = { rootMargin: '150% 50% 150% 50%' };
    // Inside a frame (the builder's canvas) the frame's own screen counts: with no root the margin is dropped there.
    if (window.top !== window) opts.root = document;
    var make = function (o) {
      return new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (!e.isIntersecting) continue;
          var img = e.target;
          ahead.unobserve(img);
          if (img.complete || img.getAttribute('loading') !== 'lazy') continue;
          // Not shown (a closed menu panel, a hidden slide or tab): leave it to the browser.
          if (img.checkVisibility && !img.checkVisibility({ visibilityProperty: true })) continue;
          // Still off screen: fetched now, but behind what is on screen.
          var fp = img.getAttribute('fetchpriority');
          if (!onScreen(img) && (!fp || fp === 'auto')) img.setAttribute('fetchpriority', 'low');
          img.setAttribute('loading', 'eager');
          // Decoded as it arrives, off screen, so it is drawn whole the moment it scrolls in.
          img.addEventListener('load', function () { if (this.decode && !onScreen(this)) this.decode().catch(function () {}); }, { once: true });
        }
      }, o);
    };
    try { ahead = make(opts); } catch (e) { delete opts.root; ahead = make(opts); }
    watchAhead(document);
  }

  scan(document);

  if ('MutationObserver' in window) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType !== 1) continue;
          scan(added[j]);
          watchAhead(added[j]);
        }
      }
    }).observe(root, { childList: true, subtree: true });
  }

  // Once the first screen is in (the load event, or 2.5s after the page is
  // readable if a slow file holds it), so it never shares the network with it.
  function later() { (window.requestIdleCallback || function (f) { setTimeout(f, 120); })(startAhead, { timeout: 800 }); }
  if (document.readyState === 'complete') later();
  else {
    window.addEventListener('load', later, { once: true });
    document.addEventListener('DOMContentLoaded', function () { setTimeout(later, 2500); }, { once: true });
  }
})();
