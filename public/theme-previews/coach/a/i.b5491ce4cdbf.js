
  (function () {
    var root = document.querySelector('#shopify-section-quote [data-c2r]');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    var slides = Array.prototype.slice.call(root.querySelectorAll('.c2r__slide'));
    var faces = Array.prototype.slice.call(root.querySelectorAll('.c2r__face'));
    var at = root.querySelector('[data-at]');
    var i = 0;
    if (slides.length < 2) return;
    function go(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, j) { s.classList.toggle('is-on', j === i); if (j === i) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true'); });
      faces.forEach(function (f, j) { f.setAttribute('aria-current', j === i ? 'true' : 'false'); });
      if (at) at.textContent = String(i + 1);
    }
    faces.forEach(function (f, j) { f.addEventListener('click', function () { go(j); }); });
    root.querySelectorAll('.c2r__arrow').forEach(function (b) { b.addEventListener('click', function () { go(i + Number(b.dataset.dir)); }); });
    var stage = root.querySelector('.c2r__stage'), x0 = null, y0 = 0;
    stage.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; });
    stage.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(i + (dx < 0 ? 1 : -1));
    });
  })();
