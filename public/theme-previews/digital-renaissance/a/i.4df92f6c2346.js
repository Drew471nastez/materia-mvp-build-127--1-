
  (function () {
    if (window.__smoothDetails) return;
    window.__smoothDetails = true;
    var still = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('click', function (e) {
      var sum = e.target.closest && e.target.closest('details[data-smooth] > summary');
      if (!sum || e.defaultPrevented) return;
      var d = sum.parentElement, body = d.querySelector(':scope > .sd-body');
      if (!body || still.matches) return;
      e.preventDefault();
      var done = function () { body.removeEventListener('transitionend', end); clearTimeout(d.__sdTimer); };
      var end = function (ev) {
        if (ev && (ev.target !== body || ev.propertyName !== 'grid-template-rows')) return;
        done();
        if (d.hasAttribute('data-sd-closing')) { d.removeAttribute('data-sd-closing'); d.open = false; }
      };
      if (d.__sdEnd) { body.removeEventListener('transitionend', d.__sdEnd); clearTimeout(d.__sdTimer); }
      d.__sdEnd = end;
      if (!d.open || d.hasAttribute('data-sd-closing')) {
        d.removeAttribute('data-sd-closing');
        if (!d.open) { d.setAttribute('data-sd-opening', ''); d.open = true; body.offsetHeight; }
        d.removeAttribute('data-sd-opening');
        sum.setAttribute('aria-expanded', 'true');
      } else {
        d.setAttribute('data-sd-closing', '');
        sum.setAttribute('aria-expanded', 'false');
        body.addEventListener('transitionend', end);
        d.__sdTimer = setTimeout(end, 700);
      }
    });
  })();
