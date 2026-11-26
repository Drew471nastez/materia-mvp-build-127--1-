
  (function () {
    var root = document.querySelector('#shopify-section-wordmark [data-nlm]');
    if (!root) return;
    var w = root.querySelector('.nlm__word'), t = w.querySelector('span'), cv = document.createElement('canvas').getContext('2d');function fit() {
      var box = w.clientWidth;
      if (!box) return;
      var cs = getComputedStyle(w);
      cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' 100px ' + cs.fontFamily;
      var m = cv.measureText(t.textContent), ink = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
      if (!ink) return;
      var size = Math.floor(100 * box / ink * 100) / 100;
      w.style.fontSize = size + 'px';
      w.style.textAlign = 'left';
      w.style.letterSpacing = '0';
      t.style.marginLeft = (m.actualBoundingBoxLeft * size / 100) + 'px';
    }
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(w.parentNode);
  })();(function () {
    if (window.__nlHash) return;
    window.__nlHash = true;
    function go(smooth) {
      var id = decodeURIComponent(location.hash.slice(1));
      if (!id || !/^[\w-]+$/.test(id) || document.getElementById(id)) return;
      var el = document.getElementById('shopify-section-' + id) || document.querySelector('[id$="__' + id + '"]');
      if (el) el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }
    window.addEventListener('hashchange', function () { go(true); });
    if (location.hash) window.addEventListener('load', function () { go(false); });
  })();
