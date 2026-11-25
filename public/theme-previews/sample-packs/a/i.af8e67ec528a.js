
  (function () {
    function setup(root) {
      if (!root || root.__srv) return; root.__srv = true;
      var track = root.querySelector('[data-srv-track]'); if (!track) return;
      var slides = [].slice.call(root.querySelectorAll('[data-srv-slide]')), dots = [].slice.call(root.querySelectorAll('[data-srv-dot]'));
      var prev = root.querySelector('[data-srv-prev]'), next = root.querySelector('[data-srv-next]'), count = root.querySelector('[data-srv-count]'), at = 0;
      function mark(i) {
        at = i;
        slides.forEach(function (s, k) { s.classList.toggle('is-on', k === i); });
        dots.forEach(function (d, k) { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
        if (prev) prev.disabled = i <= 0; if (next) next.disabled = i >= slides.length - 1;
        if (count) count.textContent = (i + 1) + ' / ' + slides.length;
      }
      function go(i) { i = Math.max(0, Math.min(slides.length - 1, i)); var s = slides[i]; if (!s) return; track.scrollTo({ left: s.offsetLeft - slides[0].offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); mark(i); }
      if (prev) prev.addEventListener('click', function () { go(at - 1); });
      if (next) next.addEventListener('click', function () { go(at + 1); });
      dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); }); });
      track.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); } });
      /* Round 26: the highlight follows the scroll every frame (it waited for a 90ms pause before). A press on an arrow or dot holds its slide until the scroll reaches it. */
      var raf = 0, target = -1, release = 0;
      function nearest() { var step = slides[1] ? slides[1].offsetLeft - slides[0].offsetLeft : (slides[0] ? slides[0].offsetWidth : 1); return Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / (step || 1)))); }
      function follow() { raf = 0; var i = nearest(); if (target >= 0) { if (i !== target) return; target = -1; } if (i !== at) mark(i); }
      track.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(follow); clearTimeout(release); release = setTimeout(function () { target = -1; follow(); }, 160); }, { passive: true });
      track.addEventListener('scrollend', function () { target = -1; follow(); });
      var go0 = go; go = function (i) { target = Math.max(0, Math.min(slides.length - 1, i)); go0(i); };
    }
    function scan(r) { (r || document).querySelectorAll('[data-srv]').forEach(setup); }
    scan(); document.addEventListener('shopify:section:load', function (e) { scan(e.target); });
    document.addEventListener('shopify:block:select', function (e) { var root = e.target.closest && e.target.closest('[data-srv]'); if (root) { var slides = [].slice.call(root.querySelectorAll('[data-srv-slide]')); var i = slides.indexOf(e.target.closest('[data-srv-slide]')); var dot = root.querySelectorAll('[data-srv-dot]')[i]; if (dot) dot.click(); } });
  })();
