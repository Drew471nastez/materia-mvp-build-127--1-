
  (function () {
    var root = document.querySelector('#shopify-section-buyers [data-wsr]');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    var track = root.querySelector('.wsr__track');
    var bar = root.querySelector('.wsr__bar span');
    var prev = root.querySelector('[data-dir="-1"]');
    var next = root.querySelector('[data-dir="1"]');
    if (!track) return;
    function step() { var c = track.querySelector('.wsr__card'); if (!c) return track.clientWidth; return c.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 16); }
    var raf = 0;
    function update() {
      raf = 0;
      var max = track.scrollWidth - track.clientWidth;
      var at = track.scrollLeft;
      if (prev) prev.disabled = at <= 2;
      if (next) next.disabled = at >= max - 2;
      if (bar) {
        var share = max > 0 ? track.clientWidth / track.scrollWidth : 1;
        bar.style.width = (share * 100) + '%';
        bar.style.transform = 'translateX(' + (max > 0 ? (at / max) * ((1 - share) / share) * 100 : 0) + '%)';
      }
    }
    track.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', function () { if (!raf) raf = requestAnimationFrame(update); });
    [prev, next].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () { track.scrollBy({ left: step() * Number(btn.dataset.dir), behavior: 'smooth' }); });
    });
    update();
  })();
