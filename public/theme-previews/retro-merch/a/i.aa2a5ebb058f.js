
  (function () {
    var root = document.getElementById('shopify-section-more');
    if (!root) return;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if ('IntersectionObserver' in window && !still) {
      document.documentElement.classList.add('r98-js');
      if (!window.__r98Seen) window.__r98Seen = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); window.__r98Seen.unobserve(e.target); } }); }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
      root.querySelectorAll('[data-motion]:not(.is-in)').forEach(function (el) { window.__r98Seen.observe(el); });
    }
    root.querySelectorAll('[data-r98-window]').forEach(function (win) {
      if (win.__r98) return; win.__r98 = true;
      var narrow = function () { return window.matchMedia('(max-width: 749px)').matches; };
      var min = win.querySelector('[data-r98-min]'), max = win.querySelector('[data-r98-max]'), close = win.querySelector('[data-r98-close]');
      function tell() { document.dispatchEvent(new CustomEvent('r98:windows')); }
      function park() { if (window.__r98Park && !narrow()) { win.hidden = true; window.__r98Park(win); } else { win.classList.toggle('is-min'); } tell(); }
      if (min) min.addEventListener('click', park);
      if (max) max.addEventListener('click', function () { win.classList.toggle('is-max'); win.classList.remove('is-min'); tell(); });
      if (close) close.addEventListener('click', function () {
        if (narrow() || !window.__r98Park) { win.classList.add('is-min'); tell(); return; }
        win.classList.add('is-closing');
        setTimeout(function () { win.classList.remove('is-closing'); win.hidden = true; window.__r98Park(win); tell(); }, still ? 0 : 220);
      });
      /* Dragged by its title bar on a desktop screen: a transform, so nothing else on the page moves. */
      var bar = win.querySelector('.r98-bar');
      if (bar && win.hasAttribute('data-r98-drag') && window.matchMedia('(pointer: fine)').matches) {
        var sx = 0, sy = 0, ox = 0, oy = 0, dx = 0, dy = 0, on = false;
        bar.style.cursor = 'grab';
        bar.addEventListener('pointerdown', function (e) {
          if (e.button !== 0 || e.target.closest('button') || narrow()) return;
          on = true; sx = e.clientX; sy = e.clientY; ox = dx; oy = dy; bar.setPointerCapture(e.pointerId); win.style.transition = 'none'; win.style.zIndex = 5; bar.style.cursor = 'grabbing';
        });
        bar.addEventListener('pointermove', function (e) {
          if (!on) return;
          dx = ox + e.clientX - sx; dy = oy + e.clientY - sy;
          var r = win.getBoundingClientRect(), lim = window.innerWidth - 80;
          if (r.left + (e.clientX - sx) < -r.width + 80 || r.left > lim) return;
          win.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });
        var end = function () { if (!on) return; on = false; win.style.transition = ''; bar.style.cursor = 'grab'; };
        bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
        bar.addEventListener('dblclick', function () { dx = dy = 0; win.style.transform = ''; });
      }
    });
    document.dispatchEvent(new CustomEvent('r98:windows'));
  })();
