
  (function () {
    var root = document.querySelector('#shopify-section-tour [data-wst]');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    var tabs = Array.prototype.slice.call(root.querySelectorAll('.wst__tab'));
    var panels = Array.prototype.slice.call(root.querySelectorAll('.wst__panel'));
    function pick(i, focus) {
      tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
      panels.forEach(function (p, j) { p.classList.toggle('is-on', j === i); if (j === i) p.removeAttribute('aria-hidden'); else p.setAttribute('aria-hidden', 'true'); });
      if (focus) tabs[i].focus();
      var bar = tabs[i].parentNode;
      if (bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: tabs[i].offsetLeft - 16, behavior: 'smooth' });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { pick(i, false); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); pick((i + 1) % tabs.length, true); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); pick((i - 1 + tabs.length) % tabs.length, true); }
      });
    });
  })();
