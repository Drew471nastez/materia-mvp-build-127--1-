
      (function () {
        var html = document.documentElement;
        function inView(el) {
          var r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0;
        }

        /* (1) and (2) */
        var pending = typeof WeakMap === 'function' ? new WeakMap() : null;
        function revealNow(el) {
          if (el.classList.contains('scroll-trigger--offscreen') || el.classList.contains('scroll-trigger--armed')) {
            el.classList.remove('scroll-trigger--offscreen', 'scroll-trigger--armed');
            el.setAttribute('data-animation-done', '');
            el.setAttribute('animation-end', '');
          }
          if (el.tagName === 'MOTION-ELEMENT') {
            if (typeof el.finishMotion === 'function') el.finishMotion();
            else { el.style.opacity = '1'; el.style.removeProperty('transform'); el.classList.remove('opacity-0'); }
          }
        }
        function scan() {
          var now = Date.now();
          var hidden = document.querySelectorAll('.scroll-trigger--offscreen, motion-element:not([hold])[style*="opacity"]');
          for (var i = 0; i < hidden.length; i++) {
            var el = hidden[i];
            if (el.tagName === 'MOTION-ELEMENT' && parseFloat(el.style.opacity) !== 0) continue;
            if (!inView(el)) { if (pending) pending.delete(el); continue; }
            if (!pending) { revealNow(el); continue; }
            var since = pending.get(el);
            if (!since) pending.set(el, now);
            // A motion element may wait up to 2s for its image before fading in.
            else if (now - since > (el.tagName === 'MOTION-ELEMENT' ? 2600 : 900)) { pending.delete(el); revealNow(el); }
          }
          var imgs = document.querySelectorAll('img.bls-loading-image');
          for (var j = 0; j < imgs.length; j++) {
            var img = imgs[j];
            if (img.complete && img.naturalWidth > 0) {
              img.classList.remove('bls-loading-image');
              var m = img.closest('motion-element');
              if (m) m.classList.remove('bls-loading-image');
            }
          }
        }
        var lastScan = 0, scanTimer = 0, settleScan = 0, finalScan = 0;
        function queueScan() {
          if (document.hidden) return;
          if (scanTimer) return;
          var wait = Math.max(0, 500 - (Date.now() - lastScan));
          scanTimer = setTimeout(function () {
            scanTimer = 0; lastScan = Date.now();
            (window.requestAnimationFrame || setTimeout)(scan);
            // Keep only two settling checks, not two more for every scroll tick.
            clearTimeout(settleScan); clearTimeout(finalScan);
            settleScan = setTimeout(function () { if (!document.hidden) requestAnimationFrame(scan); }, 1000);
            finalScan = setTimeout(function () { if (!document.hidden) requestAnimationFrame(scan); }, 2800);
          }, wait);
        }
        addEventListener('scroll', queueScan, { passive: true });
        addEventListener('resize', queueScan, { passive: true });
        addEventListener('load', queueScan);
        addEventListener('pageshow', queueScan);
        addEventListener('pagehide', function () {
          clearTimeout(scanTimer); clearTimeout(settleScan); clearTimeout(finalScan);
          scanTimer = settleScan = finalScan = 0;
        });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) queueScan(); });
        document.addEventListener('DOMContentLoaded', function () { setTimeout(queueScan, 1500); });

        /* (3) */
        var LOCKS = ['open-drawer', 'open-popup', 'nav-open', 'nav-verticalmenu', 'open-search', 'open-minicart', 'open-sidebar', 'open-byl', 'no-scroll'];
        var OPEN = 'cart-notification.open, .minicart__wrapper.open, #search-form.open, .popup-search.popup-search-show, .overlay_search.open, .bls__drawer.open, .open.overlay, html.nav-open :is(.navigation.mobile, nav.mobile), .tingle-modal--visible, dialog[open], #mt-gate, .pv-overlay.is-open, [aria-modal="true"]:not([hidden])';
        var lastChange = Date.now();
        function locked() {
          var b = document.body;
          if (!b) return false;
          for (var i = 0; i < LOCKS.length; i++) if (html.classList.contains(LOCKS[i]) || b.classList.contains(LOCKS[i])) return true;
          return b.classList.contains('tingle-enabled') || html.style.overflow === 'hidden' || b.style.overflow === 'hidden';
        }
        function shown(el) {
          // On screen (a drawer slid out of view does not count) and painted.
          var r = el.getBoundingClientRect();
          if (!(r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0)) return false;
          var cs = getComputedStyle(el);
          return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
        }
        function somethingOpen() {
          var list = document.querySelectorAll(OPEN);
          for (var i = 0; i < list.length; i++) if (shown(list[i])) return true;
          // Whatever covers the middle of the screen: a fixed layer that large is a drawer, sheet or popup.
          // Every layer under that point counts (a small fixed modal over a separate backdrop).
          var stack = document.elementsFromPoint ? document.elementsFromPoint(innerWidth / 2, innerHeight / 2).slice(0, 8) : [document.elementFromPoint(innerWidth / 2, innerHeight / 2)];
          var area = innerWidth * innerHeight;
          for (var s = 0; s < stack.length; s++) {
            for (var el = stack[s]; el && el !== html && el !== document.body; el = el.parentElement) {
              if (getComputedStyle(el).position !== 'fixed') continue;
              var r = el.getBoundingClientRect();
              if (r.width * r.height >= area * 0.25 && !el.closest('header, .section-header')) return true;
            }
          }
          return false;
        }
        function release() {
          var b = document.body;
          LOCKS.forEach(function (c) { html.classList.remove(c); b.classList.remove(c); });
          if (b.classList.contains('tingle-enabled')) {
            var top = parseFloat(b.style.top) || 0;
            b.classList.remove('tingle-enabled');
            b.style.top = '';
            if (top < 0) scrollTo(0, -top);
          }
          if (html.style.overflow === 'hidden') html.style.overflow = '';
          if (b.style.overflow === 'hidden') b.style.overflow = '';
        }
        var lastCheck = 0;
        function check() {
          var now = Date.now();
          if (now - lastCheck < 800 || now - lastChange < 1200 || !locked()) return;
          lastCheck = now;
          try { if (!somethingOpen()) release(); } catch (e) {}
        }
        if ('MutationObserver' in window) {
          var mark = function () { lastChange = Date.now(); };
          new MutationObserver(mark).observe(html, { attributes: true, attributeFilter: ['class', 'style'] });
          var watchBody = function () { if (document.body) new MutationObserver(mark).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] }); };
          if (document.body) watchBody(); else document.addEventListener('DOMContentLoaded', watchBody);
        }
        addEventListener('wheel', check, { passive: true });
        addEventListener('touchmove', check, { passive: true });
        addEventListener('keydown', function (e) {
          if (/^(ArrowDown|ArrowUp|PageDown|PageUp|Space| |Home|End)$/.test(e.key)) check();
        });
        addEventListener('pageshow', function () { lastChange = 0; lastCheck = 0; setTimeout(check, 300); });
        /* Back button: the page comes back as it was left. A search panel that
           was open keeps its inline position and the header its hidden menu
           row, over the page, while the lock classes are already removed. */
        addEventListener('pageshow', function (e) {
          if (!e.persisted || html.classList.contains('open-search')) return;
          var q = function (s) { return document.querySelectorAll(s); };
          q('.popup-search').forEach(function (el) { el.classList.remove('popup-search-show'); el.style.removeProperty('transform'); el.style.removeProperty('visibility'); });
          q('.overlay_search').forEach(function (el) { el.classList.remove('open'); el.style.removeProperty('opacity'); el.style.removeProperty('visibility'); });
          q('#search-form.open, .top-search-toggle.open').forEach(function (el) { el.classList.remove('open'); });
          q('.header-bottom__navigation').forEach(function (el) { el.style.removeProperty('opacity'); el.style.removeProperty('transition'); el.style.removeProperty('display'); });
          q('header.header').forEach(function (el) { el.style.removeProperty('margin-bottom'); });
        });
      })();
    