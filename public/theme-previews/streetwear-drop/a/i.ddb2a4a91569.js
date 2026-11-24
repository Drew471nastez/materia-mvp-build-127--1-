
(function () {
  if (!window.customElements || customElements.get('hanging-rail')) return;
  var RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var FINE = window.matchMedia ? matchMedia('(hover: hover) and (pointer: fine)') : { matches: true };
  var PHONE = window.matchMedia ? matchMedia('(max-width: 749px)') : { matches: false };
  var DEG = Math.PI / 180;
  var now = function () { return (window.performance && performance.now()) || Date.now(); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var outCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  var inOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var idle = function (fn) { if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 1500 }); else setTimeout(fn, 200); };
  var ARROW_L = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M27 16H6m7-8l-8 8 8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ARROW_R = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 16h21m-7-8l8 8-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var PLUS = '<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var TICK = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7.5l3.2 3L12 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ── Flights: a copy of a garment's picture moved from one box to another, one transform a frame.
     The target is asked for again every frame, so a box that moves (a sheet sliding up, the page
     scrolled while it closes) is met where it is. A flight can be stopped where it is and another
     started from there, so opening and closing can interrupt each other. ── */
  function boxOf(r) { return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null; }
  function lerpBox(a, b, t) { return { left: a.left + (b.left - a.left) * t, top: a.top + (b.top - a.top) * t, width: a.width + (b.width - a.width) * t, height: a.height + (b.height - a.height) * t }; }
  function Flight(src, from, toFn, ms, ease, done) {
    var self = this;
    var el = document.createElement('img');
    el.className = 'hr-fly'; el.alt = ''; el.decoding = 'sync'; el.src = src;
    var good = function (b) { return b && b.width > 2 && b.height > 2; };
    var base = boxOf(toFn());
    if (!good(base)) base = from;
    var last = base;
    el.style.width = base.width + 'px'; el.style.height = base.height + 'px';
    document.body.appendChild(el);
    this.el = el; this.cur = from; this.stopped = false;
    var t0 = now();
    var put = function (b) { self.cur = b; el.style.transform = 'translate3d(' + b.left.toFixed(2) + 'px,' + b.top.toFixed(2) + 'px,0) scale(' + (b.width / base.width).toFixed(4) + ',' + (b.height / base.height).toFixed(4) + ')'; };
    put(from);
    var step = function () {
      if (self.stopped) return;
      var t = clamp((now() - t0) / ms, 0, 1);
      var to = boxOf(toFn());
      if (good(to)) last = to; else to = last;
      put(lerpBox(from, to, ease(t)));
      if (t < 1) self.raf = requestAnimationFrame(step);
      else { self.stopped = true; if (done) done(self); }
    };
    this.raf = requestAnimationFrame(step);
  }
  Flight.prototype.stop = function () { this.stopped = true; cancelAnimationFrame(this.raf); var b = this.cur; return b; };
  Flight.prototype.remove = function () { this.stop(); if (this.el.parentNode) this.el.parentNode.removeChild(this.el); };

  /* ── The focus view: one for the page, shared by every rail on it ── */
  var F = { root: null, rail: null, index: -1, state: null, opener: null, view: 'front', mode: 'closed', flight: null };
  function focusBuild() {
    var r = document.createElement('div');
    r.className = 'hr-focus';
    r.hidden = true;
    r.innerHTML = '<div class="hr-focus__backdrop" data-hr-close></div>' +
      '<div class="hr-focus__panel" role="dialog" aria-modal="true" aria-labelledby="hr-focus-title" tabindex="-1">' +
      '<button type="button" class="hr-focus__close hr-focus__chrome" data-hr-close><span></span><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>' +
      '<button type="button" class="hr-focus__nav hr-focus__nav--prev hr-focus__chrome" data-hr-go="-1">' + ARROW_L + '</button>' +
      '<div class="hr-focus__media"><img class="hr-focus__img" alt="" decoding="async"></div>' +
      '<div class="hr-focus__info"></div>' +
      '<button type="button" class="hr-focus__nav hr-focus__nav--next hr-focus__chrome" data-hr-go="1">' + ARROW_R + '</button>' +
      '</div>';
    document.body.appendChild(r);
    F.root = r;
    r.addEventListener('click', function (e) {
      if (e.target.closest('[data-hr-close]')) { focusClose(); return; }
      var go = e.target.closest('[data-hr-go]');
      if (go) { focusStep(+go.getAttribute('data-hr-go')); return; }
      var opt = e.target.closest('[data-hr-option]');
      if (opt) { F.state.values[+opt.getAttribute('data-hr-option')] = opt.getAttribute('data-value'); focusRender(true); var again = F.root.querySelector('[data-hr-option="' + opt.getAttribute('data-hr-option') + '"][data-value="' + CSS.escape(opt.getAttribute('data-value')) + '"]'); if (again) again.focus(); return; }
      var view = e.target.closest('[data-hr-view]');
      if (view) { focusView(view.getAttribute('data-hr-view')); return; }
      var plus = e.target.closest('[data-hr-pair]');
      if (plus) { addPair(plus); return; }
    });
    r.addEventListener('submit', function (e) { if (e.target.closest('.hr-focus__form')) { e.preventDefault(); focusAdd(e.target); } });
    r.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); focusClose(); return; }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) { e.preventDefault(); focusStep(e.key === 'ArrowLeft' ? -1 : 1); return; }
      if (e.key !== 'Tab') return;
      var list = [].slice.call(r.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled])')).filter(function (x) { return x.offsetParent !== null; });
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === r.querySelector('.hr-focus__panel'))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    /* A phone: a swipe across the picture steps along the rail. */
    var sx = 0, sy = 0, s0 = 0;
    var media = r.querySelector('.hr-focus__media');
    media.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; s0 = now(); }, { passive: true });
    media.addEventListener('touchend', function (e) { var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4 && now() - s0 < 700) focusStep(dx < 0 ? 1 : -1); }, { passive: true });
  }

  function variantFor(values) {
    var vs = F.state.data.variants || [];
    for (var i = 0; i < vs.length; i++) { var ok = true; for (var k = 0; k < values.length; k++) if (vs[i].options[k] !== values[k]) { ok = false; break; } if (ok) return vs[i]; }
    return null;
  }

  function focusRender(keepImage) {
    var s = F.state, d = s.data, S = F.rail.strings, v = variantFor(s.values);
    var opts = d.options || [];
    var single = opts.length === 1;
    var pickers = opts.filter(function (o) { return !(o.values.length === 1 && /^(title|default title)$/i.test(o.values[0])); }).map(function (o) {
      var i = opts.indexOf(o);
      var btns = o.values.map(function (val) {
        var any = (d.variants || []).some(function (x) { return x.options[i] === val && x.available && x.options.every(function (ov, k) { return k === i || single || ov === s.values[k]; }); });
        return '<button type="button" class="hr-focus__value' + (any ? '' : ' is-out') + '" data-hr-option="' + i + '" data-value="' + esc(val) + '" aria-pressed="' + (s.values[i] === val) + '">' + esc(val) + '</button>';
      }).join('');
      return '<fieldset class="hr-focus__option"><legend>' + esc(o.name) + '</legend><div class="hr-focus__values">' + btns + '</div></fieldset>';
    }).join('');
    var price = v ? v.price : d.price, compare = v ? v.compare : d.compare;
    var can = !!(v && v.available);
    var label = !d.variants.length ? '' : !v ? S.unavailable : can ? S.add : S.soldOut;
    var n = F.rail.items.length;
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    var views = d.back ? '<div class="hr-focus__views" role="tablist"><button type="button" role="tab" data-hr-view="front" aria-selected="' + (F.view === 'front') + '">' + esc(S.front) + '</button><button type="button" role="tab" data-hr-view="back" aria-selected="' + (F.view === 'back') + '">' + esc(S.back) + '</button></div>' : '';
    var form = d.variants.length ?
      '<form method="post" action="' + esc(S.addUrl || '/cart/add') + '" accept-charset="UTF-8" class="hr-focus__form" novalidate data-type="add-to-cart-form">' +
      '<input type="hidden" name="id" value="' + esc(v ? v.id : '') + '"><input type="hidden" name="quantity" value="1">' +
      '<button type="submit" name="add" class="btn btn-primary hr-focus__add" data-sl-button data-button-role="primary" data-theme-button="primary"' + (can ? '' : ' disabled') + '><span class="hr-focus__label"><span class="hr-focus__idle">' + esc(label) + '</span><span class="hr-focus__done" aria-hidden="true">' + TICK + esc(S.added) + '</span></span></button>' +
      '<p class="hr-focus__error" role="alert"></p></form>' +
      '<a class="hr-focus__cart" href="' + esc(S.cartUrl || '/cart') + '" tabindex="-1">' + esc(S.viewCart) + ' &rarr;</a>' : '';
    var pairs = (d.with || []).filter(function (q) { return q && q.title; });
    var withHtml = pairs.length ? '<div class="hr-focus__with"><h3>' + esc(S.with) + '</h3><ul role="list">' + pairs.map(function (q, i) {
      return '<li class="hr-focus__pair">' + (q.image ? '<img src="' + esc(q.image) + '" alt="" width="56" height="64" loading="lazy">' : '<span></span>') +
        '<div><a href="' + esc(q.url) + '">' + esc(q.title) + '</a><small>' + esc(q.price) + (q.option ? ' &middot; ' + esc(q.option) : '') + '</small></div>' +
        '<button type="button" class="hr-focus__plus" data-hr-pair="' + i + '" aria-label="' + esc(S.addPair + ': ' + q.title) + '"' + (q.available && q.variant ? '' : ' disabled') + '>' + PLUS + '</button></li>';
    }).join('') + '</ul></div>' : '';
    F.root.querySelector('.hr-focus__info').innerHTML =
      '<p class="hr-focus__count">' + pad(F.index + 1) + ' / ' + pad(n) + '</p>' +
      '<h2 id="hr-focus-title" class="hr-focus__title">' + esc(d.title) + '</h2>' +
      (price ? '<p class="hr-focus__price"><span>' + esc(price) + '</span>' + (compare ? '<s>' + esc(compare) + '</s>' : '') + '</p>' : '') +
      (d.note ? '<p class="hr-focus__note">' + esc(d.note) + '</p>' : '') +
      views + pickers + form + withHtml +
      '<div class="hr-focus__foot"><span>' + esc(d.title) + '</span><a href="' + esc(d.url) + '">' + esc(S.viewShop) + '</a></div>';
    F.root.querySelector('.hr-focus__close span').textContent = S.close;
    F.root.querySelector('.hr-focus__nav--prev').setAttribute('aria-label', S.prev);
    F.root.querySelector('.hr-focus__nav--next').setAttribute('aria-label', S.next);
    F.root.querySelector('.hr-focus__nav--prev').hidden = n < 2;
    F.root.querySelector('.hr-focus__nav--next').hidden = n < 2;
    if (!keepImage) focusImage();
  }

  function focusImage() {
    var d = F.state.data, img = F.root.querySelector('.hr-focus__img');
    var src = F.view === 'back' && d.back ? d.back : d.front;
    if (!src) { img.removeAttribute('src'); img.removeAttribute('srcset'); img.alt = ''; return; }
    img.alt = d.title + (F.view === 'back' ? ', back' : '');
    if (img.getAttribute('data-src') === src) return;
    img.setAttribute('data-src', src);
    var it = F.rail.items[F.index];
    /* The rail's own front picture is already here: shown at once, the sharp one swapped in when it has arrived. */
    var quick = it && it.front && it.front.currentSrc && F.view === 'front' ? it.front.currentSrc : '';
    var next = new Image();
    next.decoding = 'async';
    if (F.view === 'front' && d.frontSet) { next.srcset = d.frontSet; next.sizes = '(max-width: 749px) 80vw, 46vw'; }
    next.src = src;
    var show = function () { if (img.getAttribute('data-src') !== src) return; img.srcset = next.srcset || ''; img.sizes = next.sizes || ''; img.src = src; img.classList.remove('is-hidden'); };
    if (quick) { img.removeAttribute('srcset'); img.src = quick; }
    else img.classList.add('is-hidden');
    if (next.complete) show(); else { next.onload = show; next.onerror = show; }
  }

  function focusView(which) {
    if (F.view === which) return;
    F.view = which;
    F.root.querySelectorAll('[data-hr-view]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-hr-view') === which)); });
    focusImage();
  }

  function focusFill(rail, index) {
    var it = rail.items[index], d = it.data;
    var start = null;
    (d.variants || []).forEach(function (x) { if (!start && String(x.id) === String(d.selected)) start = x; });
    if (!start) (d.variants || []).forEach(function (x) { if (!start && x.available) start = x; });
    if (!start) start = (d.variants || [])[0] || null;
    F.rail = rail; F.index = index; F.view = 'front';
    F.state = { data: d, values: start ? start.options.slice() : [] };
    /* The rail's colour scheme and backdrop: the window wears the theme's colours for that scheme. */
    var cls = 'hr-focus hr-focus--' + (rail.dataset.backdrop === 'solid' ? 'solid' : 'glass') + ' color-' + (rail.dataset.scheme || 'default-color-scheme');
    ['is-open', 'is-closing'].forEach(function (c) { if (F.root.classList.contains(c)) cls += ' ' + c; });
    F.root.className = cls;
    var section = rail.closest('.hr');
    var cs = section ? getComputedStyle(section) : null;
    var bg = cs ? cs.getPropertyValue('--hr-bg-solid').trim() : '';
    F.root.style.setProperty('--hrf-bg', bg && bg.indexOf('var(') < 0 ? bg : 'var(--color-background)');
    var rr = cs ? cs.getPropertyValue('--rounded-radius').trim() : '';
    if (rr) F.root.style.setProperty('--hr-sheet-r', 'max(' + rr + ', 10px)');
    rail.items.forEach(function (x, j) { x.li.classList.toggle('is-lifted', j === index && F.mode !== 'closed'); });
    focusRender(false);
  }

  function lock() {
    var bar = window.innerWidth - document.documentElement.clientWidth;
    if (bar > 0) document.documentElement.style.setProperty('--hr-bar', bar + 'px');
    document.documentElement.classList.add('hr-locked');
  }
  function unlock() { document.documentElement.classList.remove('hr-locked'); document.documentElement.style.removeProperty('--hr-bar'); }

  function imgBox(img) {
    var r = img.getBoundingClientRect();
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h || !r.width) return r;
    /* object-fit: contain, the picture's own box inside the element. */
    var s = Math.min(r.width / w, r.height / h), cw = w * s, ch = h * s;
    return { left: r.left + (r.width - cw) / 2, top: r.top + (r.height - ch) / 2, width: cw, height: ch };
  }

  /* Where a garment's front view hangs on the rail when it faces the visitor: its hanger's box, at the front view's shape. */
  function slotBox(it) {
    var r = it.swing.getBoundingClientRect();
    var f = it.front, w = f && f.naturalWidth, h = f && f.naturalHeight;
    var ar = w && h ? w / h : 0.75;
    /* The front view is drawn a touch larger when it faces the visitor (scale 1.04 from its top centre). */
    var bh = r.height * 1.04, bw = Math.min(bh * ar, bh);
    return { left: r.left + r.width / 2 - bw / 2, top: r.top, width: bw, height: Math.min(bh, bw / ar) };
  }
  function onScreen(b) { return b && b.top + b.height > 0 && b.top < window.innerHeight && b.left + b.width > 0 && b.left < window.innerWidth; }

  function stopFlight() { var b = null; if (F.flight) { b = F.flight.stop(); F.flight.remove(); F.flight = null; } return b; }

  function focusOpen(rail, index, opener) {
    if (!F.root) focusBuild();
    if (F.mode === 'open' || F.mode === 'opening') { if (F.rail === rail && F.index === index) return; F.opener = opener || F.opener; focusFill(rail, index); return; }
    var from = stopFlight();
    var wasClosing = F.mode === 'closing';
    if (wasClosing && F.rail && F.rail !== rail) { F.rail.items.forEach(function (x) { x.li.classList.remove('is-lifted'); }); F.rail.lifted = -1; F.rail.wake(); }
    F.opener = opener || document.activeElement;
    F.mode = 'opening';
    lock();
    F.root.hidden = false;
    focusFill(rail, index);
    var it = rail.items[index], img = F.root.querySelector('.hr-focus__img');
    var src = (it.front && it.front.currentSrc) || it.data.front;
    if (!from && it.front && it.front.currentSrc) from = slotBox(it);
    F.root.querySelector('.hr-focus__panel').focus({ preventScroll: true });
    /* The panel and backdrop start from their closed look: one frame, then open. */
    void F.root.offsetWidth;
    F.root.classList.remove('is-closing');
    F.root.classList.add('is-open');
    rail.lifted = index;
    rail.wake();
    if (from && src && !RM.matches) {
      img.classList.add('is-flying');
      F.flight = new Flight(src, from, function () { return img.naturalWidth ? imgBox(img) : img.getBoundingClientRect(); }, wasClosing ? 380 : 560, outCubic, function (fl) {
        img.classList.remove('is-flying');
        requestAnimationFrame(function () { fl.remove(); if (F.flight === fl) F.flight = null; });
        if (F.mode === 'opening') F.mode = 'open';
      });
    } else {
      img.classList.remove('is-flying');
      F.mode = 'open';
    }
  }

  function focusClose(after) {
    if (!F.root || F.root.hidden || F.mode === 'closing') return;
    var rail = F.rail, it = rail && rail.items[F.index], img = F.root.querySelector('.hr-focus__img');
    var from = stopFlight() || (img.naturalWidth && !img.classList.contains('is-hidden') ? imgBox(img) : null);
    var src = img.currentSrc || img.src || (it && it.front && it.front.currentSrc);
    F.mode = 'closing';
    F.root.classList.add('is-closing');
    F.root.classList.remove('is-open');
    /* The page is the visitor's again at once: scrolling and clicking do not wait for the garment. */
    unlock();
    var back = it ? it.a : F.opener;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    var finish = function () {
      if (F.mode !== 'closing') return;
      F.mode = 'closed';
      F.root.hidden = true;
      F.root.classList.remove('is-closing');
      F.root.querySelector('.hr-focus__info').innerHTML = '';
      img.removeAttribute('data-src');
      img.classList.remove('is-flying');
      if (rail) { rail.items.forEach(function (x) { x.li.classList.remove('is-lifted'); }); rail.lifted = -1; rail.wake(); }
      F.state = null;
      if (after) after();
    };
    var target = it ? slotBox(it) : null;
    if (from && src && it && onScreen(target) && !RM.matches) {
      img.classList.add('is-flying');
      /* The garment goes back to its own hanger, which stays empty until it lands. */
      F.flight = new Flight(src, from, function () { return slotBox(it); }, 440, inOutCubic, function (fl) {
        if (rail) { rail.items.forEach(function (x) { x.li.classList.remove('is-lifted'); }); }
        requestAnimationFrame(function () { fl.remove(); if (F.flight === fl) F.flight = null; });
        finish();
      });
      setTimeout(function () { if (F.mode === 'closing' && !F.flight) finish(); }, 900);
    } else {
      setTimeout(finish, RM.matches ? 0 : 340);
    }
  }

  function focusStep(dir) {
    if (!F.rail || !F.state || F.mode === 'closing') return;
    stopFlight();
    F.root.querySelector('.hr-focus__img').classList.remove('is-flying');
    if (F.mode === 'opening') F.mode = 'open';
    var n = F.rail.items.length;
    var i = (F.index + dir + n) % n;
    var img = F.root.querySelector('.hr-focus__img');
    if (!RM.matches && img.animate) img.animate([{ opacity: 0.2, transform: 'translateX(' + (dir * 24) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
    F.rail.lifted = i;
    F.rail.reveal(i);
    focusFill(F.rail, i);
  }

  /* ── Add to cart: the theme's cart, asked the way its product form asks; the drawer and the count are
     redrawn from the answer, then the focus view says it is added (or closes and opens the drawer). ── */
  function cartEl() { return document.querySelector('cart-notification') || document.querySelector('cart-drawer'); }
  function addToCart(id, qty) {
    var cart = cartEl();
    var secs = [];
    try { if (cart && cart.getSectionsToRender) secs = cart.getSectionsToRender().map(function (x) { return x.id; }); } catch (e) {}
    var body = { id: id, quantity: qty || 1 };
    if (secs.length) { body.sections = secs.join(','); body.sections_url = window.location.pathname; }
    var url = (window.routes && window.routes.cart_add_url) || (F.rail && F.rail.strings.addUrl) || '/cart/add';
    /* The .js address answers with JSON wherever the cart lives. */
    if (!/\.js(on)?$/.test(url)) url += '.js';
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.status && res.status !== 200 && (res.message || res.description)) throw new Error(res.description || res.message);
        if (cart && res && res.sections) {
          secs.forEach(function (sec) {
            var el = document.getElementById(sec), html = res.sections[sec];
            if (!el || !html) return;
            var incoming = new DOMParser().parseFromString(html, 'text/html').querySelector('#minicart-form');
            if (incoming && !(window.materiaPatchDrawerCart && window.materiaPatchDrawerCart(el, incoming))) el.innerHTML = incoming.innerHTML;
          });
          try { if (typeof cart.cartAction === 'function') cart.cartAction(); } catch (e) {}
          cart.classList.remove('is-empty');
        }
        return fetch('/cart.json').then(function (r) { return r.json(); }).then(function (c) {
          if (c && c.item_count != null) document.querySelectorAll('.cart-count').forEach(function (el) { el.innerHTML = el.classList.contains('cart-count-drawer') ? '(' + c.item_count + ')' : (c.item_count > 100 ? '~' : c.item_count); });
          try { var tp = document.querySelector('header-total-price'); if (tp && tp.updateTotal) tp.updateTotal(c); } catch (e) {}
          try { if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') publish(PUB_SUB_EVENTS.cartUpdate, { source: 'hanging-rail', productVariantId: id, cartData: res }); } catch (e) {}
          return res;
        }, function () { return res; });
      });
  }

  function cartTarget() {
    var cands = document.querySelectorAll('.header__minicart a, a[href$="/cart"].header-icon, [data-storelib-cart-count], .cart-count');
    for (var i = 0; i < cands.length; i++) { var r = cands[i].getBoundingClientRect(); if (r.width && r.height && r.top < window.innerHeight && r.bottom > 0) return r; }
    return { left: window.innerWidth - 60, top: 14, width: 28, height: 28 };
  }

  /* A small copy of the picture arcs to the cart in the header, the way a hand drops it into a bag. */
  function flyToCart(src, from) {
    if (!src || !from || !from.width || RM.matches || !document.body.animate) return;
    var cart = cartTarget(), size = 34;
    var to = { left: cart.left + cart.width / 2 - size / 2, top: cart.top + cart.height / 2 - size / 2, width: size, height: size * (from.height / Math.max(1, from.width)) };
    var c = document.createElement('img');
    c.className = 'hr-fly'; c.src = src; c.alt = '';
    c.style.width = to.width + 'px'; c.style.height = to.height + 'px';
    document.body.appendChild(c);
    var sx = from.width / to.width, sy = from.height / to.height;
    var a = c.animate([
      { transform: 'translate(' + from.left + 'px,' + from.top + 'px) scale(' + sx + ',' + sy + ')', opacity: 1 },
      { transform: 'translate(' + (from.left + (to.left - from.left) * 0.5) + 'px,' + (Math.min(from.top, to.top) - 60) + 'px) scale(' + (sx * 0.35 + 0.65) + ',' + (sy * 0.35 + 0.65) + ')', opacity: 1, offset: 0.5 },
      { transform: 'translate(' + to.left + 'px,' + to.top + 'px) scale(1,1)', opacity: 0.15 }
    ], { duration: 720, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });
    a.onfinish = a.oncancel = function () { c.remove(); };
  }

  function focusAdd(form) {
    var btn = form.querySelector('.hr-focus__add'), id = form.querySelector('[name=id]').value, err = form.querySelector('.hr-focus__error');
    if (!btn || btn.disabled || btn.classList.contains('is-busy') || !id) return;
    var rail = F.rail, idx = F.index;
    var img = F.root.querySelector('.hr-focus__img');
    btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
    if (err) err.textContent = '';
    addToCart(id, 1).then(function () {
      btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy');
      if (F.rail !== rail || F.index !== idx || F.mode === 'closed') return;
      flyToCart(img.currentSrc || img.src, imgBox(img));
      if (rail.dataset.afterAdd === 'drawer' && cartEl() && cartEl().open) { focusClose(function () { try { cartEl().open(); } catch (e) {} }); return; }
      btn.classList.add('is-added');
      var done = btn.querySelector('.hr-focus__done'); if (done) done.removeAttribute('aria-hidden');
      var link = F.root.querySelector('.hr-focus__cart'); if (link) { link.classList.add('is-shown'); link.removeAttribute('tabindex'); }
      clearTimeout(F.addedT);
      F.addedT = setTimeout(function () { if (btn.isConnected) { btn.classList.remove('is-added'); if (done) done.setAttribute('aria-hidden', 'true'); } }, 2400);
    }, function (e) {
      btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy');
      if (err && err.isConnected) err.textContent = (e && e.message) || F.rail.strings.error;
    });
  }

  function addPair(btn) {
    var q = (F.state.data.with || [])[+btn.getAttribute('data-hr-pair')];
    if (!q || !q.variant || btn.classList.contains('is-busy')) return;
    btn.classList.add('is-busy'); btn.disabled = true;
    var pic = btn.closest('.hr-focus__pair').querySelector('img');
    addToCart(q.variant, 1).then(function () {
      btn.classList.remove('is-busy'); btn.disabled = false; btn.classList.add('is-added'); btn.innerHTML = TICK;
      if (pic) flyToCart(pic.currentSrc || pic.src, imgBox(pic));
      var link = F.root.querySelector('.hr-focus__cart'); if (link) { link.classList.add('is-shown'); link.removeAttribute('tabindex'); }
    }, function (e) {
      btn.classList.remove('is-busy'); btn.disabled = false;
      var err = F.root.querySelector('.hr-focus__error'); if (err) err.textContent = (e && e.message) || F.rail.strings.error;
    });
  }

  /* ── The rail ── */
  class HangingRail extends HTMLElement {
    connectedCallback() { if (this.on) return; this.on = true; try { this.setup(); } catch (e) { this.on = false; } }
    disconnectedCallback() { this.on = false; if (this.ac) this.ac.abort(); if (this.ro) this.ro.disconnect(); cancelAnimationFrame(this.raf); this.raf = 0; if (F.rail === this && F.mode !== 'closed') { stopFlight(); F.mode = 'closed'; if (F.root) { F.root.hidden = true; F.root.className = 'hr-focus'; } unlock(); } }

    setup() {
      var self = this;
      this.scroller = this.querySelector('.hr__scroller');
      this.track = this.querySelector('.hr__track');
      this.section = this.closest('.hr');
      this.caption = this.section && this.section.querySelector('.hr__name');
      try { this.strings = JSON.parse(this.getAttribute('data-strings') || '{}'); } catch (e) { this.strings = {}; }
      this.turnMs = clamp(+this.dataset.turn || 420, 100, 2000);
      this.swingAmt = clamp((+this.dataset.swing || 0) / 100, 0, 1);
      this.hoverGap = +this.dataset.hoverGap || 0;
      this.clickMode = this.dataset.click || 'focus';
      this.restDeg = clamp(+this.dataset.rest || 0, 0, 80);
      this.items = [].slice.call(this.querySelectorAll('.hr__item')).map(function (li, i) {
        var data = {};
        try { data = JSON.parse(li.querySelector('script[data-hr-data]').textContent); } catch (e) {}
        data.variants = data.variants || [];
        var side = li.querySelector('.hr__side');
        var front = li.querySelector('.hr__front');
        return { li: li, i: i, a: li.querySelector('.hr__g'), swing: li.querySelector('.hr__swing'), side: side, rest: !!(front && front.classList.contains('hr__front--rest')), front: front, data: data, h: 0,
          at: 0, dx: 0, vx: 0, acc: 0, p: 0, vp: 0, th: 0, om: 0, tilt: 0, fw: 0, sw: 0, last: '' };
      });
      this.active = -1; this.lifted = -1; this.pointer = null; this.hold = -1; this.fronts = false;
      this.scrollV = 0; this.scrollA = 0; this.lastScroll = 0; this.drag = null; this.glide = 0;
      this.ac = new AbortController();
      var o = { signal: this.ac.signal }, op = { signal: this.ac.signal, passive: true };

      this.measure();
      this.ro = new ResizeObserver(function () { self.measure(); self.wake(); });
      this.ro.observe(this);
      this.items.forEach(function (it) { if (it.side && !it.side.complete) it.side.addEventListener('load', function () { self.frontWidth(it); self.wake(); }, { once: true }); });

      this.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { self.loadFronts(); self.rect = null; self.classList.add('is-live'); } }, o);
      this.addEventListener('pointermove', function (e) { if (e.pointerType === 'touch') return; self.mouse = true; self.onMove(e); }, op);
      this.addEventListener('pointerleave', function (e) { if (e.pointerType === 'touch') return; self.pointer = null; clearTimeout(self.liveT); self.liveT = setTimeout(function () { if (!self.pointer) self.classList.remove('is-live'); }, 1500); self.setActive(self.hold, true); self.wake(); }, o);
      window.addEventListener('scroll', function () { self.rect = null; }, op);
      this.scroller.addEventListener('scroll', function () { self.onScroll(); }, op);
      this.addEventListener('focusin', function (e) { var it = self.itemOf(e.target); if (it) { self.loadFronts(); self.setActive(it.i); self.reveal(it.i); } }, o);
      this.addEventListener('focusout', function (e) { if (!self.contains(e.relatedTarget)) { self.setActive(self.pointer ? self.active : self.hold); } }, o);
      this.addEventListener('keydown', function (e) {
        var it = self.itemOf(e.target);
        if (!it || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        var j = clamp(it.i + (e.key === 'ArrowLeft' ? -1 : 1), 0, self.items.length - 1);
        e.preventDefault(); self.items[j].a.focus({ preventScroll: true });
      }, o);
      this.addEventListener('click', function (e) {
        var step = e.target.closest('[data-hr-step]');
        if (step) { self.page(+step.getAttribute('data-hr-step')); return; }
        /* A garment that moved aside between press and release turns the click to the row: the one pressed is meant. */
        var it = self.itemOf(e.target) || (self.downIt && self.track.contains(e.target) && now() - self.downT < 800 ? self.downIt : null);
        if (!it) return;
        if (self.dragged) { e.preventDefault(); self.dragged = false; return; }
        if (self.clickMode !== 'focus') return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
        e.preventDefault();
        self.loadFronts();
        /* The front view is what flies: on a phone, a garment tapped while still side on turns first, then lifts. */
        var go = function () { focusOpen(self, it.i, it.a); };
        if (it.front && !it.front.complete && it.front.src) { var waited = false; var once = function () { if (waited) return; waited = true; go(); }; it.front.addEventListener('load', once, { once: true }); setTimeout(once, 250); }
        else go();
      }, o);
      this.scroller.addEventListener('pointerdown', function (e) { self.downIt = self.itemOf(e.target); self.downT = now(); self.onDown(e); }, o);
      this.scroller.addEventListener('dragstart', function (e) { e.preventDefault(); }, o);

      /* The editor: a garment block picked in the sidebar turns to the front and comes into view. */
      document.addEventListener('shopify:block:select', function (e) { var it = self.itemOf(e.target); if (it) { self.loadFronts(); self.hold = it.i; self.setActive(it.i); self.reveal(it.i); } }, o);
      document.addEventListener('shopify:block:deselect', function (e) { if (self.itemOf(e.target)) { self.hold = -1; self.setActive(self.pointer ? self.active : -1); } }, o);

      /* Front views wait for the page: after it has loaded, when the browser is idle; sooner if the pointer comes. */
      if (document.readyState === 'complete') idle(function () { self.loadFronts(); });
      else window.addEventListener('load', function () { idle(function () { self.loadFronts(); }); }, { once: true, signal: this.ac.signal });
      this.updateArrows();
    }

    itemOf(el) { if (!el || !el.closest) return null; var li = el.closest('.hr__item'); if (!li || !this.contains(li)) return null; for (var i = 0; i < this.items.length; i++) if (this.items[i].li === li) return this.items[i]; return null; }

    loadFronts() {
      if (this.fronts) return;
      this.fronts = true;
      var self = this;
      this.items.forEach(function (it) {
        var f = it.front;
        if (!f || !f.getAttribute('data-src')) return;
        f.addEventListener('load', function () { self.frontWidth(it); self.wake(); }, { once: true });
        f.sizes = f.getAttribute('data-sizes') || '';
        f.srcset = f.getAttribute('data-srcset') || '';
        f.src = f.getAttribute('data-src');
        f.removeAttribute('data-src');
      });
    }

    frontWidth(it) {
      var f = it.front, s = it.side;
      var h = it.h || this.gh;
      it.fw = f && f.naturalWidth && f.naturalHeight ? Math.min(h, h * f.naturalWidth / f.naturalHeight) : h * 0.72;
      /* A side view drawn at the garment's height: its own width, which may be wider than its room (a hood). */
      it.sw = s && s.naturalWidth && s.naturalHeight ? h * s.naturalWidth / s.naturalHeight : this.slot;
      /* What it takes on the rail before it turns: its room, its side view's garment, or its turned width when it hangs turned. */
      it.base = it.rest ? Math.max(this.slot, it.fw * Math.cos(this.restDeg * DEG)) : this.slot;
    }

    measure() {
      var first = this.items[0];
      if (!first) return;
      this.slot = first.li.offsetWidth;
      this.gh = first.swing.offsetHeight || this.slot * 2.7;
      var self = this;
      this.items.forEach(function (it) { it.at = it.li.offsetLeft + it.li.offsetWidth / 2; it.h = it.swing.offsetHeight || self.gh; self.frontWidth(it); });
      this.scrollable = this.scroller.scrollWidth > this.scroller.clientWidth + 2;
      this.maxScroll = this.scroller.scrollWidth - this.scroller.clientWidth;
      this.sl = this.scroller.scrollLeft;
      this.classList.toggle('is-scrollable', this.scrollable);
      this.rect = null;
      this.updateArrows();
    }

    trackLeft() {
      /* Read once per page scroll or resize, then kept: moving the pointer reads no layout. */
      if (!this.rect) {
        var r = this.scroller.getBoundingClientRect();
        this.rect = { left: r.left, top: r.top, bottom: r.bottom, scroll: this.scroller.scrollLeft };
      }
      return this.rect.left - this.scroller.scrollLeft;
    }

    onMove(e) {
      if (this.drag) return;
      var left = this.trackLeft();
      var t = now();
      var x = e.clientX - left, y = e.clientY;
      var prev = this.pointer;
      var v = prev ? (x - prev.x) / Math.max(8, t - prev.t) * 1000 : 0;
      this.pointer = { x: x, y: y, t: t, v: prev ? prev.v * 0.6 + v * 0.4 : 0 };
      var band = y >= this.rect.top - 8 && y <= this.rect.bottom;
      this.pick(band);
      this.wake();
    }

    pick(band) {
      var p = this.pointer;
      if (!p || !band) { if (this.active !== this.hold) this.setActive(this.hold); return; }
      var a = this.items[this.active], half;
      if (a) {
        half = (a.fw * a.p + (a.base || this.slot) * (1 - a.p)) / 2 + this.gap() / 2;
        if (Math.abs(p.x - (a.at + a.dx)) <= half) return;
      }
      var best = -1, bd = Infinity;
      for (var i = 0; i < this.items.length; i++) { var it = this.items[i], d = Math.abs(p.x - (it.at + it.dx)); if (d < bd) { bd = d; best = i; } }
      if (best >= 0 && bd > this.slot * 1.2 + this.hoverGap) best = this.hold;
      this.setActive(best);
    }

    gap() { var a = this.items[0], b = this.items[1]; return a && b ? (b.at - a.at) - this.slot : 0; }

    setActive(i, quiet) {
      if (i === this.active) return;
      this.active = i;
      var it = this.items[i];
      if (this.section) this.section.classList.toggle('is-showing', !!it);
      var cap = it ? esc(it.data.title) + (it.data.price ? '<small>' + esc(it.data.price) + '</small>' : '') : '';
      if (this.caption && (it || !this.section.classList.contains('hr--split'))) { if (this.capText !== cap) { this.caption.innerHTML = cap; this.capText = cap; } }
      this.wake();
    }

    reveal(i) {
      var it = this.items[i];
      if (!it || !this.scrollable) return;
      var sl = this.scroller.scrollLeft, w = this.scroller.clientWidth, x = it.at;
      var m = this.slot * 1.5;
      if (x - m < sl || x + m > sl + w) this.scroller.scrollTo({ left: x - w / 2, behavior: RM.matches ? 'auto' : 'smooth' });
    }

    page(dir) { this.scroller.scrollBy({ left: dir * this.scroller.clientWidth * 0.75, behavior: RM.matches ? 'auto' : 'smooth' }); }

    updateArrows() {
      var p = this.querySelector('[data-hr-step="-1"]'), n = this.querySelector('[data-hr-step="1"]');
      if (!p || !n) return;
      var sl = this.scroller.scrollLeft, max = this.scroller.scrollWidth - this.scroller.clientWidth;
      p.disabled = !this.scrollable || sl <= 2;
      n.disabled = !this.scrollable || sl >= max - 2;
    }

    onScroll() {
      this.rect = null;
      this.sl = this.scroller.scrollLeft;
      this.updateArrows();
      /* A phone: the garment nearest the middle turns to the front as the row is swiped. */
      if (!this.mouse && !FINE.matches && this.scrollable) {
        var c = this.scroller.scrollLeft + this.scroller.clientWidth / 2, best = -1, bd = Infinity;
        for (var i = 0; i < this.items.length; i++) { var d = Math.abs(this.items[i].at - c); if (d < bd) { bd = d; best = i; } }
        this.loadFronts();
        this.setActive(best);
      }
      this.wake();
    }

    onDown(e) {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !this.scrollable) return;
      var self = this, sc = this.scroller;
      this.glide = 0;
      var d = { x: e.clientX, left: sc.scrollLeft, moved: false, v: 0, t: now(), lx: e.clientX };
      this.drag = d;
      var move = function (ev) {
        var dx = ev.clientX - d.x;
        if (!d.moved && Math.abs(dx) > 5) { d.moved = true; sc.classList.add('is-dragging'); try { sc.setPointerCapture(e.pointerId); } catch (err) {} self.setActive(-1); }
        if (!d.moved) return;
        var t = now();
        d.v = d.v * 0.5 + ((d.lx - ev.clientX) / Math.max(4, t - d.t)) * 0.5;
        d.t = t; d.lx = ev.clientX;
        sc.scrollLeft = d.left - dx;
        self.sl = clamp(d.left - dx, 0, self.maxScroll || 0);
      };
      var up = function () {
        sc.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        sc.classList.remove('is-dragging');
        self.drag = null;
        if (d.moved) {
          self.dragged = true;
          setTimeout(function () { self.dragged = false; }, 60);
          /* Let go while moving: the row glides on and slows. */
          if (!RM.matches && Math.abs(d.v) > 0.05) { self.glide = d.v; self.glideT = now(); self.wake(); }
        }
      };
      sc.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    }

    wake() { var self = this; if (!this.raf && this.on) { this.lastT = now(); this.raf = requestAnimationFrame(function (t) { self.tick(t); }); } }

    tick(t) {
      this.raf = 0;
      if (!this.on) return;
      var dt = clamp((t - this.lastT) / 1000, 0.001, 0.034);
      this.lastT = t;
      var items = this.items, n = items.length, reduced = RM.matches, moving = false, i, j, it;
      var target = this.lifted >= 0 ? this.lifted : this.active;
      if (this.glide) {
        /* Clamped here, so the glide never reads the layout back. */
        var before = this.sl || 0, to = clamp(before + this.glide * dt * 1000, 0, this.maxScroll || 0);
        this.scroller.scrollLeft = to; this.sl = to;
        this.glide *= Math.pow(0.04, dt);
        if (Math.abs(this.glide) < 0.02 || to === before) this.glide = 0; else moving = true;
      }
      /* The row's own movement (scroll, drag) reaches every hanger as a push at its hook. The position is the one the last scroll event read: a frame reads no layout. */
      var sl = this.sl || 0;
      var v = (sl - this.lastScroll) / dt; this.lastScroll = sl;
      var a = (v - this.scrollV) / dt; this.scrollV = v;
      this.scrollA = this.scrollA * 0.7 + clamp(a, -40000, 40000) * 0.3;
      if (Math.abs(v) > 1) moving = true;
      var k = Math.pow(7.5 / (this.turnMs / 1000), 2), c = 2 * Math.sqrt(k);
      for (i = 0; i < n; i++) {
        it = items[i];
        var goal = i === target ? 1 : 0;
        /* The garment in the focus view snaps to the front at once: it is that picture that flies back onto it. */
        if (reduced || (i === this.lifted && it.li.classList.contains('is-lifted'))) { it.p = goal; it.vp = 0; }
        else { var ap = k * (goal - it.p) - c * it.vp; it.vp += ap * dt; it.p += it.vp * dt; if (Math.abs(goal - it.p) < 0.002 && Math.abs(it.vp) < 0.01) { it.p = goal; it.vp = 0; } else moving = true; }
      }
      /* Neighbours make room for a garment turned to the front: each side moves by half of what it gained, and the gap. */
      var K = 260, C = 2 * Math.sqrt(K) * 0.92;
      for (i = 0; i < n; i++) {
        it = items[i];
        var want = 0;
        for (j = 0; j < n; j++) { if (j === i || items[j].p <= 0.0005) continue; var room = Math.max(0, (items[j].fw * 1.05 - (items[j].base || this.slot)) / 2 + this.hoverGap); want += (i < j ? -1 : 1) * room * items[j].p; }
        if (reduced) { it.dx = want; it.vx = 0; it.acc = 0; }
        else { var ax = K * (want - it.dx) - C * it.vx; it.vx += ax * dt; it.dx += it.vx * dt; it.acc = ax; if (Math.abs(want - it.dx) < 0.05 && Math.abs(it.vx) < 0.5) { it.dx = want; it.vx = 0; it.acc = 0; } else moving = true; }
      }
      /* Each hanger is a pendulum from its hook: pushed by its hook's movement and by a pointer brushing past. */
      var amt = reduced ? 0 : this.swingAmt;
      var g = 5200, p = this.pointer;
      for (i = 0; i < n; i++) {
        it = items[i];
        if (amt <= 0) { it.th = 0; it.om = 0; continue; }
        var L = Math.max(60, (it.h || this.gh) * 0.55);
        var pivotA = (it.acc - this.scrollA * 0.6) * amt;
        var al = -(g / L) * Math.sin(it.th) - 2.4 * it.om - (pivotA / L) * Math.cos(it.th);
        if (p && Math.abs(p.v) > 40 && t - p.t < 60 && i !== target) {
          var cx = it.at + it.dx;
          if (this.rect && Math.abs(p.x - cx) < this.slot * 0.6 && p.y >= this.rect.top && p.y <= this.rect.top + this.gh) al += clamp(p.v, -2500, 2500) / L * 9 * amt;
        }
        it.om += al * dt; it.th += it.om * dt;
        var lim = 0.22 * amt + 0.02;
        if (it.th > lim) { it.th = lim; it.om *= -0.3; } else if (it.th < -lim) { it.th = -lim; it.om *= -0.3; }
        if (Math.abs(it.th) > 0.0004 || Math.abs(it.om) > 0.002) moving = true; else { it.th = 0; it.om = 0; }
      }
      /* The garment in front leans a little toward the pointer. */
      var tilt = 0;
      if (p && items[target] && this.mouse && !reduced && this.lifted < 0) tilt = clamp((p.x - (items[target].at + items[target].dx)) / Math.max(1, items[target].fw / 2), -1, 1) * 9;
      for (i = 0; i < n; i++) {
        it = items[i];
        var tl = i === target ? tilt : 0;
        it.tilt += (tl - it.tilt) * Math.min(1, dt * 10);
        if (Math.abs(tl - it.tilt) > 0.05) moving = true;
        var pp = it.p;
        var key = it.dx.toFixed(2) + '|' + it.th.toFixed(4) + '|' + pp.toFixed(4) + '|' + it.tilt.toFixed(2);
        if (key === it.last) continue;
        it.last = key;
        it.li.style.transform = it.dx ? 'translate3d(' + it.dx.toFixed(2) + 'px,0,0)' : '';
        it.li.style.zIndex = pp > 0.01 ? String(2 + Math.round(pp * 10)) : '';
        it.swing.style.transform = it.th ? 'rotate(' + (it.th / DEG).toFixed(3) + 'deg)' : '';
        if (it.front && it.rest) {
          it.front.style.transform = (pp || it.tilt) ? 'translateX(-50%) perspective(1100px) rotateY(' + ((1 - pp) * this.restDeg + it.tilt).toFixed(2) + 'deg) scale(' + (1 + 0.05 * pp).toFixed(4) + ')' : '';
        } else if (it.front && it.fw) {
          /* Side on to front: the side view turns away as the front view turns in, a quarter turn between them. */
          var fo = reduced ? pp : smooth(0.18, 0.6, pp);
          it.front.style.opacity = fo ? fo.toFixed(3) : '';
          it.front.style.transform = pp ? 'translateX(-50%) perspective(900px) rotateY(' + ((1 - pp) * -80 + it.tilt).toFixed(2) + 'deg) scale(' + (1 + 0.04 * pp).toFixed(4) + ')' : '';
          if (it.side) {
            var so = reduced ? 1 - pp : 1 - smooth(0.12, 0.5, pp);
            it.side.style.opacity = pp ? so.toFixed(3) : '';
            it.side.style.transform = pp ? 'translateX(-50%) perspective(900px) rotateY(' + (pp * 70).toFixed(2) + 'deg)' : '';
          }
        }
      }
      if (moving) this.wake();
    }
  }
  customElements.define('hanging-rail', HangingRail);
})();
