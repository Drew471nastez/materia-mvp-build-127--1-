
      document.documentElement.className = document.documentElement.className.replace('no-js', 'js');
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
    