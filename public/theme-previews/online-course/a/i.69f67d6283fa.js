
      // mt-img-reveal (snippets/smooth-media-load) is set here with js, before the body
      // is drawn: added at the end of the body it restyled the whole page once more.
      document.documentElement.className = document.documentElement.className.replace('no-js', 'js') + ' mt-img-reveal';
      // Scripts only needed once the shopper does something (cart line
      // editing, size charts, form sending, the cookie banner after a choice)
      // load on the first tap, key or focus, or when the loaded page goes
      // idle, whichever comes first: mtLazy(src) queues one, mtLazy.now(src)
      // loads it at once. Both return a promise for the script.
      window.mtLazy = window.mtLazy || (function () {
        var jobs = {}, queue = [], started = false;
        // Theme assets are asked for from this host (/cdn/shop/ is served by every storefront host),
        // the same address the deferred script tags resolve to.
        function local(src) { return String(src).replace(/^(?:https?:)?\/\/[^\/]+(?=\/cdn\/shop\/)/, ''); }
        function now(src) {
          src = local(src);
          var job = jobs[src] || (jobs[src] = {});
          if (job.p && job.loading) return job.p;
          job.loading = true;
          if (!job.p) { job.p = new Promise(function (ok, fail) { job.ok = ok; job.fail = fail; }); job.p.catch(function () {}); }
          var s = document.createElement('script');
          s.src = src;
          s.onload = function () { job.ok(); };
          s.onerror = function () { job.loading = false; job.fail(new Error('load ' + src)); };
          document.head.appendChild(s);
          return job.p;
        }
        function all() { started = true; var q = queue; queue = []; for (var i = 0; i < q.length; i++) now(q[i]); }
        ['pointerdown', 'keydown', 'touchstart', 'focusin'].forEach(function (n) { addEventListener(n, all, { once: true, passive: true, capture: true }); });
        function idle() { (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(all, { timeout: 3000 }); }
        if (document.readyState === 'complete') setTimeout(idle, 0); else addEventListener('load', function () { setTimeout(idle, 0); }, { once: true });
        function lazy(src) {
          src = local(src);
          if (started) return now(src);
          var job = jobs[src] || (jobs[src] = {});
          if (!job.p) { job.p = new Promise(function (ok, fail) { job.ok = ok; job.fail = fail; }); job.p.catch(function () {}); queue.push(src); }
          return job.p;
        }
        lazy.now = now;
        return lazy;
      })();
      // A tap on the menu or search button before the theme's scripts have
      // run (a slow connection) would do nothing. Hold the last such tap and
      // give it again once the page's scripts are ready (DOMContentLoaded
      // follows every deferred script). Links are left alone: they work.
      (function () {
        if (document.readyState !== 'loading') return;
        var EARLY = '.nav-toggle, button[data-action="toggle-nav"], button.top-search-toggle';
        var held = null;
        function hold(e) {
          var t = e.target && e.target.closest && e.target.closest(EARLY);
          if (!t) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          held = t;
          t.setAttribute('aria-busy', 'true');
        }
        document.addEventListener('click', hold, true);
        document.addEventListener('DOMContentLoaded', function () {
          document.removeEventListener('click', hold, true);
          setTimeout(function () {
            if (!held) return;
            var t = held;
            held = null;
            t.removeAttribute('aria-busy');
            if (t.isConnected) t.click();
          }, 0);
        }, { once: true });
      })();
      if (false || window.SlTheme?.designMode) {
        document.documentElement.classList.add('shopify-design-mode');
      }
      // Some imported-theme canvases omit request.design_mode. Use the
      // actual builder referrer, never the mere fact that this is an iframe.
      try {
        const editor = new URL(document.referrer);
        if (window.top !== window && (editor.hostname === 'storelib.com' || editor.hostname.endsWith('.storelib.com')) && editor.pathname.includes('/website-builder')) document.documentElement.classList.add('shopify-design-mode');
      } catch (_) {}
      // Once: adding a class the root already has still rewrites the attribute,
      // and every observer of <html> would wake on each frame of a drag.
      {
        const markDesign = () => { const root = document.documentElement; if (!root.classList.contains('shopify-design-mode')) root.classList.add('shopify-design-mode'); };
        document.addEventListener('storelib:settings-change', markDesign);
        document.addEventListener('storelib:section-load', markDesign);
      }
    