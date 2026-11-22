
(function () {
  var s = {
    images: true,
    motion: true,
    thirdParty: false && !false
  };
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 120); };
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  /* ---------- Faster fonts: the font library's stylesheets never hold the first paint ----------
     Storelib writes a stylesheet link for each picked font at the end of
     <head>; a cross-site stylesheet there held the whole first paint (and
     every script after it) until it had arrived. Every font is
     font-display: swap with a size-matched fallback (font-variables), so the
     page paints in the fallback and the font swaps in when it lands. Each
     such link is replaced, as the page is read and before anything is drawn,
     by the same link loading as a non-blocking sheet; the request already
     made is reused. */
  if (s.images && 'MutationObserver' in window && document.head) {
    var FONT_SHEET = /^https:\/\/fonts\.googleapis\.com\//;
    /* Once a font sheet has loaded on this browser it is cached, so on the
       next page it loads as a normal sheet, asked for with
       display=fallback: a cached font has up to 100ms to arrive before text
       is drawn, so the page paints in the real font with no swap. The
       fallback version is fetched quietly after the first visit. */
    var FONT_KEY = 'materia__fonts';
    var seenFonts = {};
    try { seenFonts = JSON.parse(localStorage.getItem(FONT_KEY) || '{}') || {}; } catch (e) { seenFonts = {}; }
    var calmFont = function (href) { return href.replace(/([?&]display=)swap\b/, '$1fallback'); };
    var rememberFonts = function () {
      try {
        var sheets = [];
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        for (var a = 0; a < links.length; a++) {
          var h = links[a].getAttribute('data-speed-font-href') || links[a].href;
          if (FONT_SHEET.test(h) && sheets.indexOf(h) === -1) sheets.push(h);
        }
        if (!sheets.length) return;
        for (var c = 0; c < sheets.length; c++) {
          var calm = calmFont(sheets[c]);
          if (calm !== sheets[c] && !document.querySelector('link[href="' + calm.replace(/"/g, '%22') + '"]')) {
            var pf = document.createElement('link');
            pf.rel = 'prefetch'; pf.as = 'style'; pf.href = calm;
            document.head.appendChild(pf);
          }
        }
        localStorage.setItem(FONT_KEY, JSON.stringify({ sheets: sheets }));
      } catch (e) {}
    };
    var afterFonts = function () {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(rememberFonts, 300); });
      else setTimeout(rememberFonts, 300);
    };
    if (document.readyState === 'complete') afterFonts();
    else window.addEventListener('load', afterFonts, { once: true });
    var fontSeen = function (href) {
      return !!(seenFonts.sheets && seenFonts.sheets.indexOf(href) !== -1);
    };
    var freeFont = function (l) {
      if (l.nodeName !== 'LINK' || l.rel !== 'stylesheet' || l.hasAttribute('data-speed-font') || !FONT_SHEET.test(l.href)) return;
      if (fontSeen(l.href)) {
        var calm = calmFont(l.href);
        if (calm === l.href) return;
        var k = l.cloneNode(false);
        k.setAttribute('data-speed-font', '');
        k.setAttribute('data-speed-font-href', l.href);
        k.href = calm;
        l.parentNode.insertBefore(k, l);
        l.parentNode.removeChild(l);
        return;
      }
      var media = l.getAttribute('media') || 'all';
      if (media === 'print') return;
      var n = l.cloneNode(false);
      n.setAttribute('data-speed-font', '');
      n.media = 'print';
      n.onload = function () { n.onload = null; n.media = media; };
      l.parentNode.insertBefore(n, l);
      l.parentNode.removeChild(l);
    };
    var fontObserver = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) freeFont(added[j]);
      }
    });
    fontObserver.observe(document.head, { childList: true });
    onReady(function () { fontObserver.disconnect(); });
  }

  /* ---------- Faster images: decode off the main thread below the first screen ----------
     Pictures in the first screen keep the browser's own decoding, so the hero
     paints in the same frame it arrives. One read pass, then one write pass. */
  if (s.images) {
    var tuneImages = function () {
      var imgs = document.querySelectorAll('img:not([decoding]):not([data-speed-tuned])');
      var fold = window.innerHeight;
      var below = [];
      for (var i = 0; i < imgs.length; i++) {
        var r = imgs[i].getBoundingClientRect();
        below.push(r.top >= fold || (r.width === 0 && r.height === 0));
      }
      for (var j = 0; j < imgs.length; j++) {
        imgs[j].setAttribute('data-speed-tuned', '');
        if (!below[j]) continue;
        imgs[j].decoding = 'async';
        // Below the first screen, and only when the size is already reserved,
        // so a slow connection spends its bandwidth on the page in view and
        // the picture does not jump in when it arrives.
        if (!imgs[j].hasAttribute('loading') && imgs[j].getAttribute('fetchpriority') !== 'high' && (imgs[j].hasAttribute('width') || imgs[j].style.aspectRatio)) imgs[j].loading = 'lazy';
      }
    };
    onReady(function () { idle(tuneImages, { timeout: 800 }); });
    if ('MutationObserver' in window) {
      var tunePending = false;
      var tuneObserver = new MutationObserver(function (records) {
        if (tunePending) return;
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType === 1 && (n.tagName === 'IMG' || (n.firstElementChild && n.querySelector('img')))) {
              tunePending = true;
              idle(function () { tunePending = false; tuneImages(); }, { timeout: 600 });
              return;
            }
          }
        }
      });
      onReady(function () { tuneObserver.observe(document.body || document.documentElement, { childList: true, subtree: true }); });
      // Pictures that matter arrive with the page; stop watching once it has settled.
      addEventListener('load', function () { setTimeout(function () { tuneObserver.disconnect(); }, 10000); }, { once: true });
    }
  }

  /* ---------- Defer third-party apps & scripts ----------
     Scripts an app injects from these hosts are held until the first
     interaction or a few idle seconds after load, then added in order. */
  if (s.thirdParty) {
    var HOSTS = /(^|\.)(klaviyo\.com|judge\.me|judgeme\.io|trustpilot\.com|yotpo\.com|okendo\.io|stamped\.io|loox\.io|reviews\.io|privy\.com|omnisend\.com|tidio\.co|tawk\.to|gorgias\.chat|intercom\.io|crisp\.chat|zdassets\.com|facebook\.net|tiktok\.com|pinimg\.com|sc-static\.net|hotjar\.com|clarity\.ms|pushowl\.com|smile\.io)$/i;
    var held = [];
    var released = false;
    var isHeld = function (node) {
      if (released || !node || node.nodeName !== 'SCRIPT' || !node.src) return false;
      try { return HOSTS.test(new URL(node.src, location.href).hostname); } catch (_) { return false; }
    };
    var origAppend = Node.prototype.appendChild;
    var origInsert = Node.prototype.insertBefore;
    Node.prototype.appendChild = function (node) {
      if (isHeld(node)) { held.push(node); return node; }
      return origAppend.call(this, node);
    };
    Node.prototype.insertBefore = function (node, ref) {
      if (isHeld(node)) { held.push(node); return node; }
      return origInsert.call(this, node, ref);
    };
    var release = function () {
      if (released) return;
      released = true;
      Node.prototype.appendChild = origAppend;
      Node.prototype.insertBefore = origInsert;
      events.forEach(function (t) { removeEventListener(t, release, listenOpts); });
      var queue = held.splice(0);
      for (var i = 0; i < queue.length; i++) origAppend.call(document.head, queue[i]);
      document.querySelectorAll('script[type="text/lazyload"]').forEach(function (sc) {
        var n = document.createElement('script');
        for (var k = 0; k < sc.attributes.length; k++) {
          var a = sc.attributes[k];
          if (a.name !== 'type') n.setAttribute(a.name, a.value);
        }
        if (sc.textContent) n.textContent = sc.textContent;
        sc.parentNode.replaceChild(n, sc);
      });
    };
    var events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
    var listenOpts = { passive: true, once: true };
    events.forEach(function (t) { addEventListener(t, release, listenOpts); });
    var afterLoad = function () { setTimeout(function () { idle(release, { timeout: 2000 }); }, 3500); };
    if (document.readyState === 'complete') afterLoad(); else addEventListener('load', afterLoad, { once: true });
  }

  /* ---------- Battery & motion friendly ---------- */
  if (s.motion && 'IntersectionObserver' in window) {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    var stopAutoplay = function (el) {
      if (el.swiper && el.swiper.autoplay && el.swiper.autoplay.running) {
        try { el.swiper.autoplay.stop(); } catch (_) {}
        return true;
      }
      return false;
    };
    // Videos and sliders: paused out of view, resumed only if this paused them.
    var mediaIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        if (reduced && reduced.matches) { stopAutoplay(el); return; }
        if (entry.isIntersecting) {
          if (el.dataset.spdPaused !== '1') return;
          el.dataset.spdPaused = '0';
          if (el.tagName === 'VIDEO') { var p = el.play && el.play(); if (p && p.catch) p.catch(function () {}); }
          else if (el.swiper && el.swiper.autoplay) { try { el.swiper.autoplay.start(); } catch (_) {} }
        } else if (el.tagName === 'VIDEO') {
          if (!el.paused) { el.dataset.spdPaused = '1'; el.pause(); }
        } else if (stopAutoplay(el)) {
          el.dataset.spdPaused = '1';
        }
      });
    }, { threshold: 0.05 });
    // Content sections: looping CSS animations held while far out of view.
    // Sections that hold a popup, drawer, dialog or sticky bar are left alone,
    // because those can show on screen while the section itself is not.
    var holdsOverlay = '[class*="popup"], [class*="Popup"], [class*="modal"], [class*="drawer"], [class*="sticky"], [role="dialog"], dialog';
    var sectionIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.toggleAttribute('data-perf-offscreen', !entry.isIntersecting);
      });
    }, { rootMargin: '300px 0px' });
    var observeAll = function () {
      var media = document.querySelectorAll('video, .swiper, slide-section, [data-autoplay]');
      for (var i = 0; i < media.length; i++) {
        if (media[i].dataset.spdObserved === '1') continue;
        media[i].dataset.spdObserved = '1';
        mediaIO.observe(media[i]);
      }
      var sections = document.querySelectorAll('#MainContent > .shopify-section:not([data-perf-watch])');
      for (var j = 0; j < sections.length; j++) {
        var sec = sections[j];
        sec.setAttribute('data-perf-watch', '');
        if (sec.querySelector(holdsOverlay)) continue;
        sectionIO.observe(sec);
      }
    };
    onReady(observeAll);
    // Sliders start after their scripts run; under reduced motion stop them once started.
    addEventListener('load', function () {
      observeAll();
      if (reduced && reduced.matches) document.querySelectorAll('.swiper, slide-section').forEach(stopAutoplay);
    }, { once: true });
    if ('MutationObserver' in window) {
      var observePending = false;
      onReady(function () {
        new MutationObserver(function () {
          if (observePending) return;
          observePending = true;
          idle(function () { observePending = false; observeAll(); }, { timeout: 600 });
        }).observe(document.getElementById('MainContent') || document.body, { childList: true, subtree: true });
      });
    }
  }
})();
