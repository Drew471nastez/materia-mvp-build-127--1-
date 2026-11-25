
  (function () {
    var root = document.querySelector('#shopify-section-free [data-spr-track]');
    if (!root) return;
    var sec = root.closest('.spr'), prev = sec.querySelector('[data-spr-prev]'), next = sec.querySelector('[data-spr-next]');
    if (!prev || !next) return;
    function step() { var c = root.querySelector('.spr__card'); return c ? c.getBoundingClientRect().width + 16 : root.clientWidth; }
    var arrows = prev.parentNode;
    function sync() { var max = root.scrollWidth - root.clientWidth - 2; prev.disabled = root.scrollLeft <= 2; next.disabled = root.scrollLeft >= max; arrows.hidden = max <= 0; }
    prev.addEventListener('click', function () { root.scrollBy({ left: -step(), behavior: 'smooth' }); });
    next.addEventListener('click', function () { root.scrollBy({ left: step(), behavior: 'smooth' }); });
    root.addEventListener('scroll', function () { requestAnimationFrame(sync); }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(sync).observe(root);
    sync();
  })();
