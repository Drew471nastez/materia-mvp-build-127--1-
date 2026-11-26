
  (function () {
    var root = document.getElementById('scrolling-bar');
    var track = root && root.querySelector('[data-an-track]');
    if (!track) return;
    function groups() { return Array.prototype.filter.call(track.children, function (g) { return g.classList.contains('scrolling__marquee-wrapper'); }); }
    function fill() {
      var all = groups(), first = all[0];
      if (!first) return;
      var w = first.getBoundingClientRect().width, gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      if (!w) return;
      var need = Math.min(30, Math.ceil(track.clientWidth / (w + gap)) + 2), added = false;
      for (var have = all.length; have < need; have++) {
        var copy = first.cloneNode(true);
        copy.removeAttribute('data-an-group'); copy.setAttribute('data-an-copies', ''); copy.setAttribute('aria-hidden', 'true');
        Array.prototype.forEach.call(copy.querySelectorAll('[data-an-block]'), function (el) { el.setAttribute('data-an-copy', el.getAttribute('data-an-block')); el.removeAttribute('data-an-block'); el.removeAttribute('data-shopify-editor-block'); });
        Array.prototype.forEach.call(copy.querySelectorAll('img'), function (img) { img.alt = ''; });
        Array.prototype.forEach.call(copy.querySelectorAll('a, button'), function (a) { a.tabIndex = -1; });
        track.appendChild(copy); added = true;
      }
      if (added) requestAnimationFrame(function () {
        var list = groups().map(function (g) { return g.getAnimations ? g.getAnimations()[0] : null; }), lead = list[0];
        if (!lead) return;
        list.slice(1).forEach(function (a) { if (!a) return; try { if (lead.startTime != null && a.playState !== 'paused') a.startTime = lead.startTime; else a.currentTime = lead.currentTime; } catch (e) {} });
      });
    }
    fill();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fill);
    if (window.ResizeObserver) new ResizeObserver(fill).observe(track);
  })();
