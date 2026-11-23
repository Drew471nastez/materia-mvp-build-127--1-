
  (function () {
    var box = document.querySelector('#shopify-section-reviews [data-vsl-rv]');
    if (!box || box.hasAttribute('data-ready')) return;
    box.setAttribute('data-ready', '');
    var track = box.querySelector('[data-track]'), dots = box.querySelector('[data-dots]');
    var prev = box.querySelector('[data-prev]'), next = box.querySelector('[data-next]');
    var cards = Array.prototype.slice.call(track.children);
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function perView() { var c = cards[0]; return c ? Math.max(1, Math.round(track.clientWidth / (c.getBoundingClientRect().width + 12))) : 1; }
    function pages() { return Math.max(1, cards.length - perView() + 1); }
    function at() { var c = cards[1] || cards[0]; if (!c) return 0; var step = cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : 1; return Math.round(track.scrollLeft / step); }
    function go(i) { var n = pages(); i = Math.max(0, Math.min(n - 1, i)); var c = cards[i]; if (c) track.scrollTo({ left: c.offsetLeft - cards[0].offsetLeft, behavior: still ? 'auto' : 'smooth' }); }
    function draw() {
      var n = pages();
      if (dots.children.length !== n) {
        dots.innerHTML = '';
        for (var i = 0; i < n; i++) { var b = document.createElement('button'); b.type = 'button'; b.className = 'vsl-rv__dot'; b.setAttribute('aria-label', (i + 1) + ' / ' + n); (function (k) { b.addEventListener('click', function () { go(k); hold(); }); })(i); dots.appendChild(b); }
      }
      var cur = Math.min(n - 1, at());
      Array.prototype.forEach.call(dots.children, function (d, i) { d.setAttribute('aria-current', i === cur ? 'true' : 'false'); });
      prev.disabled = cur <= 0; next.disabled = cur >= n - 1;
      box.querySelector('.vsl-rv__bar').hidden = n < 2;
    }
    var raf = 0;
    track.addEventListener('scroll', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }, { passive: true });
    window.addEventListener('resize', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
    prev.addEventListener('click', function () { go(at() - 1); hold(); });
    next.addEventListener('click', function () { go(at() + 1); hold(); });
    track.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); go(at() + 1); hold(); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(at() - 1); hold(); } });
    draw();
    /* Moves on by itself every few seconds, until the visitor touches it; never for visitors who ask for less motion. */
    var timer = 0, held = false;
    function hold() { held = true; clearInterval(timer); }
    if (box.dataset.auto && !still) {
      timer = setInterval(function () { if (document.hidden || held) return; var r = box.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; var n = pages(); go(at() >= n - 1 ? 0 : at() + 1); }, 6500);
      ['pointerdown', 'wheel', 'touchstart', 'focusin'].forEach(function (ev) { box.addEventListener(ev, hold, { passive: true }); });
      box.addEventListener('mouseenter', function () { held = true; }); box.addEventListener('mouseleave', function () { held = false; });
    }
  })();
