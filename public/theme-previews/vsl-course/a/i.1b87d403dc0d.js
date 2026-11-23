
  (function () {
    var bar = document.querySelector('#shopify-section-footer [data-vsl-sticky]');
    if (!bar || bar.hasAttribute('data-ready')) return;
    bar.setAttribute('data-ready', '');
    var btn = bar.querySelector('a'), after = Number(bar.dataset.after) || 700, blocked = 0, ticking = false;
    function set() {
      ticking = false;
      var up = window.scrollY > after && blocked === 0;
      if (up !== bar.classList.contains('is-up')) { bar.classList.toggle('is-up', up); btn.tabIndex = up ? 0 : -1; }
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(set); } }, { passive: true });
    if ('IntersectionObserver' in window) {
      var seen = new Set();
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }); blocked = seen.size; set(); });
      document.querySelectorAll('.vsl-offer, .vsl-foot, .shopify-section-group-footer-group, .product__info-wrapper, [data-vsl-video]').forEach(function (el) { io.observe(el); });
    }
    set();
  })();
