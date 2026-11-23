
  (function () {
    var root = document.querySelector('#shopify-section-reviews .abr');
    if (!root || root.dataset.ready) return; root.dataset.ready = '1';
    var track = root.querySelector('[data-abr-track]'); if (!track) return;
    var prev = root.querySelector('[data-abr-prev]'), next = root.querySelector('[data-abr-next]');
    var dots = root.querySelectorAll('.abr__dot');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function step() { var c = track.querySelector('.abr__card'); if (!c) return 0; var gap = parseFloat(getComputedStyle(track).columnGap) || 0; return c.getBoundingClientRect().width + gap; }
    function update() {
      var max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
      var s = step(); var i = s ? Math.round(track.scrollLeft / s) : 0;
      if (track.scrollLeft >= max) i = dots.length - 1;
      for (var k = 0; k < dots.length; k++) dots[k].classList.toggle('is-on', k === i);
    }
    function go(d) { track.scrollBy({ left: d * step(), behavior: reduce ? 'auto' : 'smooth' }); }
    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });
    var raf = 0; track.addEventListener('scroll', function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; update(); }); }, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();
