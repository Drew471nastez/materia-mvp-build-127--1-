
  (function () {
    var root = document.getElementById('shopify-section-reviews');
    if (!root) return;
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if ('IntersectionObserver' in window && !still && !(window.SlTheme && window.SlTheme.designMode)) {
      document.documentElement.classList.add('xp-js');
      if (!window.__xpSeen) window.__xpSeen = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); window.__xpSeen.unobserve(e.target); } }); }, { rootMargin: '0px 0px -5% 0px', threshold: 0.04 });
      root.querySelectorAll('[data-motion]:not(.is-in)').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0) { el.classList.add('is-in'); return; }
        /* Round 69: only what starts below the first screen waits (armed); a window in view is simply there. */
        el.setAttribute('data-xp-armed', '');
        window.__xpSeen.observe(el);
      });
    }
    root.querySelectorAll('[data-xp-window]').forEach(function (win) {
      if (win.__xp) return; win.__xp = true;
      var narrow = function () { return window.matchMedia('(max-width: 749px)').matches; };
      var min = win.querySelector('[data-xp-min]'), max = win.querySelector('[data-xp-max]'), close = win.querySelector('[data-xp-close]');
      if (min) min.addEventListener('click', function () { var on = !win.classList.contains('is-min'); win.classList.toggle('is-min', on); min.setAttribute('aria-expanded', on ? 'false' : 'true'); });
      if (max) max.addEventListener('click', function () { win.classList.toggle('is-max'); win.classList.remove('is-min'); });
      if (close) close.addEventListener('click', function () {
        if (narrow() || !window.__xpPark) { win.classList.add('is-min'); return; }
        win.classList.add('is-closing');
        setTimeout(function () { win.classList.remove('is-closing'); win.hidden = true; window.__xpPark(win); }, still ? 0 : 200);
      });
    });
  })();
