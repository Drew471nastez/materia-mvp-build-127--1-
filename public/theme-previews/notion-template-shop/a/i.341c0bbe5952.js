
  (function () {
    var root = document.getElementById('shopify-section-main');
    if (!root) return;
    root.querySelectorAll('[data-ma-rel]').forEach(function (rel) {
      var track = rel.querySelector('[data-ma-rel-track]');
      var dots = rel.querySelector('[data-ma-rel-dots]');
      if (!track || !dots || rel.dataset.maRelOn) return;
      rel.dataset.maRelOn = '1';
      var cards = track.children;
      function pages() {
        var per = Math.max(1, Math.round(track.clientWidth / (cards[0] ? cards[0].getBoundingClientRect().width : track.clientWidth)));
        return Math.max(1, cards.length - per + 1);
      }
      function draw() {
        var n = pages();
        dots.hidden = n < 2;
        if (dots.children.length !== n) {
          dots.innerHTML = '';
          for (var i = 0; i < n; i++) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ma-rel__dot';
            b.setAttribute('aria-label', String(i + 1));
            b.addEventListener('click', (function (k) { return function () { var c = cards[k]; if (c) track.scrollTo({ left: c.offsetLeft - track.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }; })(i));
            dots.appendChild(b);
          }
        }
        var step = cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth;
        var at = Math.min(n - 1, Math.round(track.scrollLeft / Math.max(1, step)));
        for (var j = 0; j < dots.children.length; j++) dots.children[j].setAttribute('aria-current', j === at ? 'true' : 'false');
      }
      var raf = 0;
      track.addEventListener('scroll', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(draw).observe(track); else window.addEventListener('resize', draw);
      draw();
    });
  })();
