
  (function () {
    var fresh = document.querySelector('#shopify-section-header .vsl-bg-header');
    /* The background sits at the very back of the page, outside the header's own layer. A redraw in the editor replaces the one already there. */
    document.querySelectorAll('body > .vsl-bg').forEach(function (old) { if (old !== fresh) old.remove(); });
    var root = fresh || document.querySelector('.vsl-bg-header');
    if (!root) return;
    if (root.parentNode !== document.body) document.body.insertBefore(root, document.body.firstChild);
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var stars = root.querySelector('.vsl-bg__stars');
    if (stars && !stars.hasAttribute('data-ready')) {
      var T = 620, dpr = Math.min(2, window.devicePixelRatio || 1), seed = 11;
      var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      var c = document.createElement('canvas'); c.width = c.height = T * dpr;
      var x = c.getContext('2d');
      if (x) {
        x.scale(dpr, dpr); x.fillStyle = root.dataset.star || '#fff';
        var n = Math.round(Math.max(0, Number(root.dataset.density) || 0) * 2.4);
        for (var i = 0; i < n; i++) {
          var r = rnd() < .9 ? .45 + rnd() * .5 : 1 + rnd() * .5, px = rnd() * T, py = rnd() * T;
          x.globalAlpha = .25 + rnd() * .65;
          [[0, 0], [T, 0], [-T, 0], [0, T], [0, -T]].forEach(function (o) { x.beginPath(); x.arc(px + o[0], py + o[1], r, 0, Math.PI * 2); x.fill(); });
        }
        stars.style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
        stars.setAttribute('data-ready', '');
        if (root.dataset.drift && !still) stars.classList.add('is-moving');
        var tw = Math.min(40, Number(root.dataset.twinkles) || 0);
        for (var k = 0; k < tw; k++) {
          var d = document.createElement('i'); d.className = 'vsl-bg__tw';
          d.style.left = (rnd() * 100).toFixed(2) + '%'; d.style.top = (rnd() * 100).toFixed(2) + '%';
          d.style.setProperty('--tw', (3 + rnd() * 5).toFixed(2) + 's'); d.style.setProperty('--td', (-rnd() * 6).toFixed(2) + 's');
          root.appendChild(d);
        }
      }
    }
    var grain = root.querySelector('.vsl-bg__grain');
    if (grain && !grain.style.backgroundImage) {
      var g = document.createElement('canvas'); g.width = g.height = 160;
      var gx = g.getContext('2d');
      if (gx) {
        var img = gx.createImageData(160, 160), d = img.data;
        for (var q = 0; q < d.length; q += 4) { var n = Math.random() * 255 | 0; d[q] = d[q + 1] = d[q + 2] = n; d[q + 3] = 255; }
        gx.putImageData(img, 0, 0);
        grain.style.backgroundImage = 'url(' + g.toDataURL('image/png') + ')';
      }
    }
    var v = root.querySelector('video[data-src]');
    if (v && !still) {
      var go = function () { if (!v.src) v.src = v.getAttribute('data-src'); var p = v.play(); if (p && p.catch) p.catch(function () {}); };
      v.addEventListener('playing', function () { v.classList.add('is-on'); });
      if (document.readyState === 'complete') setTimeout(go, 300); else window.addEventListener('load', function () { setTimeout(go, 300); }, { once: true });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { root.setAttribute('data-paused', ''); if (v && v.src) v.pause(); }
      else { root.removeAttribute('data-paused'); if (v && v.src && !still) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
    });
  })();
