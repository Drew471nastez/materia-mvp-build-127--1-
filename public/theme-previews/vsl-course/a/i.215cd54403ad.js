
  (function () {
    var fresh = document.querySelector('#shopify-section-sky .space-sky-sky');
    /* The sky sits at the very back of the page, outside the header (whose own layer would put it over the page). A redraw on an edit replaces the one already there. */
    document.querySelectorAll('body > .space-sky-sky').forEach(function (old) { if (old !== fresh) old.remove(); });
    var root = fresh || document.querySelector('.space-sky-sky');
    if (!root) return;
    if (root.parentNode !== document.body) document.body.insertBefore(root, document.body.firstChild);
    root.innerHTML = '';
    var density = Math.max(0, Number(root.dataset.density) || 0);
    var sizeScale = Math.max(0.3, (Number(root.dataset.size) || 100) / 100);
    var speed = Math.max(0, Number(root.dataset.speed) || 0);
    var dir = root.dataset.direction || 'up';
    var twinkles = Math.max(0, Math.min(60, Number(root.dataset.twinkles) || 0));
    var color = root.dataset.star || '#ffffff';
    var TILES = [557, 743, 911];
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    /* A fixed seed, so the sky is the same on every page and every visit. */
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function tile(TILE, count, rMin, rMax, alphaMin, alphaMax) {
      var c = document.createElement('canvas');
      c.width = c.height = TILE * dpr;
      var x = c.getContext('2d');
      if (!x) return '';
      x.scale(dpr, dpr);
      x.fillStyle = color;
      for (var i = 0; i < count; i++) {
        var r = (rMin + rnd() * (rMax - rMin)) * sizeScale;
        x.globalAlpha = alphaMin + rnd() * (alphaMax - alphaMin);
        var px = rnd() * TILE, py = rnd() * TILE;
        x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
        /* A star on the tile's edge is drawn on the other side too, so the seam never shows. */
        if (px < r + 1) { x.beginPath(); x.arc(px + TILE, py, r, 0, Math.PI * 2); x.fill(); }
        if (py < r + 1) { x.beginPath(); x.arc(px, py + TILE, r, 0, Math.PI * 2); x.fill(); }
        if (px > TILE - r - 1) { x.beginPath(); x.arc(px - TILE, py, r, 0, Math.PI * 2); x.fill(); }
        if (py > TILE - r - 1) { x.beginPath(); x.arc(px, py - TILE, r, 0, Math.PI * 2); x.fill(); }
      }
      return c.toDataURL('image/png');
    }
    /* Far, middle and near: more small faint stars far away, a few brighter ones close. */
    var per = density / 100;
    var layers = [
      { n: Math.round(170 * per), r: [0.3, 0.65], a: [0.2, 0.55], secs: 260 },
      { n: Math.round(70 * per), r: [0.55, 0.95], a: [0.4, 0.8], secs: 180 },
      { n: Math.round(16 * per), r: [0.85, 1.4], a: [0.65, 1], secs: 120 }
    ];
    var factor = speed > 0 ? 40 / speed : 0;
    layers.forEach(function (l, li) {
      if (l.n <= 0) return;
      var TILE = TILES[li];
      var url = tile(TILE, Math.round(l.n * TILE * TILE / (640 * 640)), l.r[0], l.r[1], l.a[0], l.a[1]);
      if (!url) return;
      var d = document.createElement('div');
      d.className = 'space-sky__layer';
      d.style.backgroundImage = 'url(' + url + ')';
      d.style.backgroundSize = TILE + 'px ' + TILE + 'px';
      d.style.height = 'calc(100% + ' + TILE + 'px)';
      d.style.width = 'calc(100% + ' + TILE + 'px)';
      d.style.left = (dir === 'right' ? -TILE : 0) + 'px';
      var dx = dir === 'left' ? -TILE : dir === 'right' ? TILE : dir === 'diagonal' ? -TILE : 0;
      var dy = dir === 'left' || dir === 'right' ? 0 : -TILE;
      d.style.setProperty('--dx', dx + 'px');
      d.style.setProperty('--dy', dy + 'px');
      if (factor > 0) d.style.animationDuration = Math.round(l.secs * factor) + 's';
      else d.style.animation = 'none';
      root.appendChild(d);
    });
    for (var i = 0; i < twinkles; i++) {
      var t = document.createElement('span');
      t.className = 'space-sky__twinkle';
      var size = (1.2 + rnd() * 1.6) * sizeScale;
      t.style.width = t.style.height = size.toFixed(2) + 'px';
      t.style.left = (rnd() * 100).toFixed(2) + '%';
      t.style.top = (rnd() * 100).toFixed(2) + '%';
      t.style.setProperty('--tw', (3 + rnd() * 5).toFixed(2) + 's');
      t.style.setProperty('--td', (-rnd() * 8).toFixed(2) + 's');
      root.appendChild(t);
    }
    root.setAttribute('data-ready', '');
    function sync() { if (document.hidden) root.setAttribute('data-paused', ''); else root.removeAttribute('data-paused'); }
    if (!window.__spaceSkyVisibility) {
      window.__spaceSkyVisibility = true;
      document.addEventListener('visibilitychange', function () {
        document.querySelectorAll('[data-space-sky]').forEach(function (el) {
          if (document.hidden) el.setAttribute('data-paused', ''); else el.removeAttribute('data-paused');
        });
      });
    }
    sync();
  })();
