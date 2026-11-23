
  (function () {
    var root = document.getElementById('shopify-section-reviews'); if (!root) return;
    var track = root.querySelector('[data-xpr-track]'), dots = root.querySelector('[data-xpr-dots]'); if (!track || track.__xpr) return; track.__xpr = true;
    var cards = [].slice.call(track.children);
    function step() { var c = cards[0]; if (!c) return track.clientWidth; return c.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 16); }
    function pages() { var per = Math.max(1, Math.round(track.clientWidth / step())); return Math.max(1, cards.length - per + 1); }
    function at() { return Math.round(track.scrollLeft / step()); }
    function go(i) { track.scrollTo({ left: Math.max(0, Math.min(pages() - 1, i)) * step() }); }
    function draw() {
      if (!dots) return; var n = pages(), cur = Math.min(at(), n - 1);
      if (dots.children.length !== n) { dots.innerHTML = ''; for (var i = 0; i < n; i++) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', (i + 1) + ' / ' + n); (function (k) { b.addEventListener('click', function () { go(k); }); })(i); dots.appendChild(b); } }
      dots.hidden = n < 2;
      [].forEach.call(dots.children, function (b, i) { b.setAttribute('aria-current', i === cur ? 'true' : 'false'); });
    }
    var p = root.querySelector('[data-xpr-prev]'), n = root.querySelector('[data-xpr-next]');
    if (p) p.addEventListener('click', function () { go(at() - 1); });
    if (n) n.addEventListener('click', function () { go(at() + 1 >= pages() ? 0 : at() + 1); });
    var t; track.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(draw, 60); }, { passive: true });
    window.addEventListener('resize', draw); draw();
  })();
