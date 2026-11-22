
  (function () {
    var root = document.getElementById('shopify-section-header');
    if (!root) return;
    var task = root.querySelector('[data-r98-task]');
    /* The taskbar sits at the very bottom of the page, outside the header's own layer. */
    if (task && task.parentNode !== document.body) {
      document.querySelectorAll('body > [data-r98-task]').forEach(function (old) { if (old !== task) old.remove(); });
      document.body.appendChild(task);
    }
    var wall = root.querySelector('.r98-wall');
    if (wall && wall.parentNode !== document.body) {
      document.querySelectorAll('body > .r98-wall').forEach(function (old) { if (old !== wall) old.remove(); });
      document.body.insertBefore(wall, document.body.firstChild);
    }
    if (!task) return;
    var start = task.querySelector('[data-r98-start]'), menu = task.querySelector('[data-r98-menu]');
    function open(on) {
      start.setAttribute('aria-expanded', on ? 'true' : 'false'); start.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) { menu.hidden = false; menu.classList.add('is-opening'); requestAnimationFrame(function () { requestAnimationFrame(function () { menu.classList.remove('is-opening'); }); }); var f = menu.querySelector('a'); if (f) f.focus({ preventScroll: true }); }
      else menu.hidden = true;
    }
    start.addEventListener('click', function (e) { e.stopPropagation(); open(menu.hidden); });
    document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { open(false); start.focus(); } });
    /* The clock, in the visitor's own time. */
    var clock = task.querySelector('[data-r98-clock]');
    function tick() { if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    tick(); clearInterval(window.__r98Clock); window.__r98Clock = setInterval(tick, 15000);
    /* The cart's count, after anything on the page adds to it. */
    var count = task.querySelector('[data-r98-count]');
    function recount() { fetch('/cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (c) { if (!count) return; count.textContent = c.item_count; count.hidden = !c.item_count; }).catch(function () {}); }
    document.addEventListener('r98:cart', recount); document.addEventListener('cart:refresh', recount);
    /* A window minimised or closed waits here, as a button that brings it back. */
    var wins = task.querySelector('[data-r98-wins]');
    window.__r98Park = function (win) {
      var title = (win.querySelector('.r98-bar__title') || {}).textContent || 'Window';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'r98-btn r98-tw';
      b.innerHTML = '<span></span>'; b.firstChild.textContent = title.trim();
      b.addEventListener('click', function () { win.hidden = false; win.classList.remove('is-min', 'is-closed'); b.remove(); win.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
      wins.appendChild(b);
    };
  })();
