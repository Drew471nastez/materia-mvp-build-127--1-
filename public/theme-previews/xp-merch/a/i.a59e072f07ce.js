
  (function () {
    var root = document.getElementById('shopify-section-header');
    if (!root) return;
    var task = root.querySelector('[data-xp-task]'), wall = root.querySelector('.xp-wall'), balloon = root.querySelector('[data-xp-balloon]');
    /* The taskbar and the wallpaper live at the page's own level, outside the header's layer. */
    [[task, 'append'], [wall, 'prepend'], [balloon, 'append']].forEach(function (p) {
      var el = p[0]; if (!el || el.parentNode === document.body) return;
      document.querySelectorAll('body > .' + el.classList[el.classList.length - 1]).forEach(function (old) { if (old !== el) old.remove(); });
      document.body[p[1]](el);
    });
    if (!task) return;
    var start = task.querySelector('[data-xp-start]'), menu = task.querySelector('[data-xp-menu]');
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    function open(on) {
      start.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) { menu.hidden = false; if (!still) { menu.classList.add('is-opening'); requestAnimationFrame(function () { requestAnimationFrame(function () { menu.classList.remove('is-opening'); }); }); } var f = menu.querySelector('a'); if (f) f.focus({ preventScroll: true }); }
      else menu.hidden = true;
    }
    start.addEventListener('click', function (e) { e.stopPropagation(); open(menu.hidden); });
    document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { open(false); start.focus(); } });
    var clock = task.querySelector('[data-xp-clock]');
    function tick() { if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    tick(); clearInterval(window.__xpClock); window.__xpClock = setInterval(tick, 15000);
    function recount() { fetch('/cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (c) { document.querySelectorAll('[data-xp-count]').forEach(function (n) { n.textContent = c.item_count; n.hidden = !c.item_count; }); }).catch(function () {}); }
    document.addEventListener('xp:cart', recount); document.addEventListener('cart:refresh', recount);
    /* A window minimised or closed waits on the taskbar, as a button that brings it back. */
    var wins = task.querySelector('[data-xp-wins]');
    window.__xpPark = function (win) {
      var title = (win.querySelector('.xp-bar__title') || {}).textContent || 'Window';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'xp-tw';
      b.innerHTML = '<span></span>'; b.firstChild.textContent = title.trim();
      b.addEventListener('click', function () { win.hidden = false; win.classList.remove('is-min'); b.remove(); win.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' }); });
      wins.appendChild(b);
    };
    if (balloon) {
      var seen = false; try { seen = sessionStorage.getItem('xp-balloon') === '1'; } catch (e) {}
      if (!seen) {
        var hide = function () { balloon.classList.add('is-hiding'); setTimeout(function () { balloon.hidden = true; }, still ? 0 : 300); try { sessionStorage.setItem('xp-balloon', '1'); } catch (e) {} };
        setTimeout(function () { balloon.hidden = false; if (!still) { balloon.classList.add('is-hiding'); requestAnimationFrame(function () { requestAnimationFrame(function () { balloon.classList.remove('is-hiding'); }); }); } }, 1800);
        balloon.querySelector('[data-xp-balloon-x]').addEventListener('click', hide);
        var a = balloon.querySelector('a'); if (a) a.addEventListener('click', function () { try { sessionStorage.setItem('xp-balloon', '1'); } catch (e) {} });
        setTimeout(function () { if (!balloon.hidden) hide(); }, 14000);
      }
    }
  })();
