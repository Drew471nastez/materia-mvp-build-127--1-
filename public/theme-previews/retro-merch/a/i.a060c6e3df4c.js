
      /* Nothing below the footer takes room: fixed bars, popups, pixels and
         style carriers placed after it used to leave a white band. */
      (function () {
        var SKIP = { SCRIPT: 1, STYLE: 1, LINK: 1, TEMPLATE: 1, META: 1, NOSCRIPT: 1 };
        function collapse(el) {
          var s = el.style;
          s.setProperty('height', '0', 'important');
          s.setProperty('min-height', '0', 'important');
          s.setProperty('margin', '0', 'important');
          s.setProperty('padding', '0', 'important');
          s.setProperty('border', '0', 'important');
          s.setProperty('overflow', 'visible', 'important');
        }
        function run() {
          var footer = document.querySelector('footer.footer, .shopify-section-group-footer-group:last-of-type');
          if (!footer) return;
          var node = footer.closest('.shopify-section, [id^="shopify-section-"]') || footer;
          while (node && node !== document.body) {
            for (var el = node.nextElementSibling; el; el = el.nextElementSibling) {
              if (SKIP[el.tagName] || el.matches('footer, .shopify-section-group-footer-group') || el.querySelector('footer.footer')) continue;
              var cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'absolute') continue;
              var box = el.getBoundingClientRect();
              if (box.height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom) > 0.5) collapse(el);
            }
            node = node.parentElement;
          }
        }
        var timer;
        function later() { clearTimeout(timer); timer = setTimeout(run, 200); }
        if (document.readyState === 'complete') later(); else addEventListener('load', later);
        setTimeout(run, 2500);
        addEventListener('resize', later, { passive: true });
        document.addEventListener('shopify:section:load', later);
        document.addEventListener('storelib:section-load', later);
      })();
    