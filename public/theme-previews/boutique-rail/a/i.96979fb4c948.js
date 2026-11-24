
(function () {
  if (!window.customElements || customElements.get('hanging-rail')) return;
  var RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var FINE = window.matchMedia ? matchMedia('(hover: hover) and (pointer: fine)') : { matches: true };
  var DEG = Math.PI / 180;
  var now = function () { return (window.performance && performance.now()) || Date.now(); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var idle = function (fn) { if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 1500 }); else setTimeout(fn, 200); };
  var ARROW_L = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M27 16H6m7-8l-8 8 8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ARROW_R = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 16h21m-7-8l8 8-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ── The focus view: one for the page, shared by every rail on it ── */
  var F = { root: null, rail: null, index: -1, state: null, opener: null, view: 'front' };
  function focusBuild() {
    var r = document.createElement('div');
    r.className = 'hr-focus';
    r.hidden = true;
    r.innerHTML = '<div class="hr-focus__backdrop" data-hr-close></div>' +
      '<div class="hr-focus__panel" role="dialog" aria-modal="true" aria-labelledby="hr-focus-title" tabindex="-1">' +
      '<button type="button" class="hr-focus__close" data-hr-close><span></span><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>' +
      '<button type="button" class="hr-focus__nav hr-focus__nav--prev" data-hr-go="-1">' + ARROW_L + '</button>' +
      '<div class="hr-focus__media"><img class="hr-focus__img" alt="" decoding="async"></div>' +
      '<div class="hr-focus__info"></div>' +
      '<button type="button" class="hr-focus__nav hr-focus__nav--next" data-hr-go="1">' + ARROW_R + '</button>' +
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
    });
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
    var sx = 0, sy = 0, st = 0;
    var media = r.querySelector('.hr-focus__media');
    media.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = now(); }, { passive: true });
    media.addEventListener('touchend', function (e) { var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4 && now() - st < 700) focusStep(dx < 0 ? 1 : -1); }, { passive: true });
    try {
      if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        subscribe(PUB_SUB_EVENTS.cartUpdate, function (ev) {
          if (!F.state || !ev || ev.source !== 'product-form') return;
          var id = F.root.querySelector('.hr-focus__form [name="id"]');
          if (id && String(ev.productVariantId) === String(id.value)) focusAdded();
        });
      }
    } catch (err) {}
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
    var pickers = opts.filter(function (o) { return !(o.values.length === 1 && /^(title|default title)$/i.test(o.values[0]) ); }).map(function (o) {
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
      '<product-form class="hr-focus__form" data-hide-errors="false"><form method="post" action="' + esc(S.addUrl || '/cart/add') + '" accept-charset="UTF-8" class="form" novalidate data-type="add-to-cart-form">' +
      '<input type="hidden" name="id" value="' + esc(v ? v.id : '') + '"><input type="hidden" name="quantity" value="1">' +
      '<button type="submit" name="add" class="btn btn-primary product-form__submit hr-focus__add" data-sl-button data-button-role="primary" data-theme-button="primary"' + (can ? '' : ' disabled') + '><span>' + esc(label) + '</span></button>' +
      '<div class="product-form__error-message-wrapper hr-focus__error" role="alert" hidden><span class="product-form__error-message"></span></div></form></product-form>' +
      '<a class="hr-focus__cart" href="' + esc(S.cartUrl || '/cart') + '" hidden>' + esc(S.viewCart) + ' &rarr;</a>' : '';
    F.root.querySelector('.hr-focus__info').innerHTML =
      '<p class="hr-focus__count">' + pad(F.index + 1) + ' / ' + pad(n) + '</p>' +
      '<h2 id="hr-focus-title" class="hr-focus__title">' + esc(d.title) + '</h2>' +
      (price ? '<p class="hr-focus__price"><span>' + esc(price) + '</span>' + (compare ? '<s>' + esc(compare) + '</s>' : '') + '</p>' : '') +
      (d.note ? '<p class="hr-focus__note">' + esc(d.note) + '</p>' : '') +
      views + pickers + form +
      '<div class="hr-focus__foot"><span>' + esc(d.title) + '</span><a href="' + esc(d.url) + '">' + esc(S.viewShop) + '</a></div>';
    F.root.querySelector('.hr-focus__close span').textContent = S.close;
    F.root.querySelector('.hr-focus__nav--prev').setAttribute('aria-label', S.prev);
    F.root.querySelector('.hr-focus__nav--next').setAttribute('aria-label', S.next);
    F.root.querySelector('.hr-focus__nav--prev').hidden = n < 2;
    F.root.querySelector('.hr-focus__nav--next').hidden = n < 2;
    var form2 = F.root.querySelector('.hr-focus__form form');
    if (form2) form2.addEventListener('submit', focusFlyToCart);
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
    var section = rail.closest('.hr');
    var cs = section ? getComputedStyle(section) : null;
    if (cs) { F.root.style.setProperty('--hrf-bg', cs.getPropertyValue('--hr-bg-solid').trim() || '#fff'); F.root.style.setProperty('--hrf-fg', cs.getPropertyValue('--hr-fg').trim() || '#111'); }
    focusRender(false);
  }

  function lock() {
    var bar = window.innerWidth - document.documentElement.clientWidth;
    if (bar > 0) document.documentElement.style.setProperty('--hr-bar', bar + 'px');
    document.documentElement.classList.add('hr-locked');
  }
  function unlock() { document.documentElement.classList.remove('hr-locked'); document.documentElement.style.removeProperty('--hr-bar'); }

  /* A picture flown from one box to another, as one transform on a copy of it. */
  function fly(src, from, to, opts) {
    if (!src || !from || !to || !from.width || !to.width || RM.matches || !document.body.animate) return null;
    var c = document.createElement('img');
    c.className = 'hr-focus__fly';
    c.src = src; c.alt = '';
    c.style.left = to.left + 'px'; c.style.top = to.top + 'px'; c.style.width = to.width + 'px'; c.style.height = to.height + 'px';
    document.body.appendChild(c);
    var sx = from.width / to.width, sy = from.height / to.height;
    var tx = from.left - to.left, ty = from.top - to.top;
    var frames = opts && opts.arc ? [
      { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(' + sx + ',' + sy + ')', opacity: 1 },
      { transform: 'translate(' + (tx * 0.45) + 'px,' + (ty * 0.55 - 120) + 'px) scale(' + (sx * 0.7 + 0.3) + ')', opacity: 1, offset: 0.45 },
      { transform: 'translate(0,0) scale(1)', opacity: 0.2 }
    ] : [
      { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(' + sx + ',' + sy + ')', transformOrigin: '0 0' },
      { transform: 'translate(0,0) scale(1,1)', transformOrigin: '0 0' }
    ];
    if (!(opts && opts.arc)) c.style.transformOrigin = '0 0';
    var a = c.animate(frames, { duration: (opts && opts.ms) || 520, easing: (opts && opts.easing) || 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    a.onfinish = a.oncancel = function () { c.remove(); };
    return a;
  }

  function imgBox(img) {
    var r = img.getBoundingClientRect();
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h || !r.width) return r;
    /* object-fit: contain, the picture's own box inside the element. */
    var s = Math.min(r.width / w, r.height / h), cw = w * s, ch = h * s;
    return { left: r.left + (r.width - cw) / 2, top: r.top + (r.height - ch) / 2, width: cw, height: ch };
  }

  function focusOpen(rail, index, opener) {
    if (!F.root) focusBuild();
    var wasOpen = !F.root.hidden;
    F.opener = opener || document.activeElement;
    focusFill(rail, index);
    if (wasOpen) return;
    lock();
    F.root.hidden = false;
    var img = F.root.querySelector('.hr-focus__img');
    var it = rail.items[index];
    var srcImg = it.rest || (it.front && it.front.complete && it.front.naturalWidth && it.p > 0.5) ? it.front : it.side;
    F.root.querySelector('.hr-focus__panel').focus({ preventScroll: true });
    requestAnimationFrame(function () {
      F.root.classList.add('is-open');
      /* Lifted off the rail: the garment's picture flies from its hanger to its place in the window. */
      if (srcImg && srcImg.currentSrc && !RM.matches && srcImg !== it.side) {
        var to = imgBox(img), from = srcImg.getBoundingClientRect();
        if (to.width) {
          img.style.visibility = 'hidden';
          var a = fly(srcImg.currentSrc, from, to, { ms: 560 });
          var done = function () { img.style.visibility = ''; };
          if (a) a.addEventListener('finish', done); else done();
          setTimeout(done, 900);
        }
      }
    });
    rail.lifted = index;
    rail.wake();
  }

  function focusClose() {
    if (!F.root || F.root.hidden) return;
    var rail = F.rail;
    F.root.classList.remove('is-open');
    var finish = function () {
      F.root.hidden = true;
      F.root.querySelector('.hr-focus__info').innerHTML = '';
      F.root.querySelector('.hr-focus__img').removeAttribute('data-src');
      unlock();
      if (rail) { rail.lifted = -1; rail.wake(); }
      var back = rail && rail.items[F.index] ? rail.items[F.index].a : F.opener;
      if (back && back.isConnected) back.focus({ preventScroll: true });
      F.state = null;
    };
    if (RM.matches) finish(); else setTimeout(finish, 360);
  }

  function focusStep(dir) {
    if (!F.rail || !F.state) return;
    var n = F.rail.items.length;
    var i = (F.index + dir + n) % n;
    var img = F.root.querySelector('.hr-focus__img');
    if (!RM.matches && img.animate) img.animate([{ opacity: 0.25, transform: 'translateX(' + (dir * -18) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    F.rail.lifted = i;
    F.rail.reveal(i);
    focusFill(F.rail, i);
  }

  function focusFlyToCart() {
    var img = F.root.querySelector('.hr-focus__img');
    var cart = null;
    var cands = document.querySelectorAll('.header__minicart a, a[href$="/cart"].header-icon, [data-storelib-cart-count]');
    for (var i = 0; i < cands.length; i++) { var r = cands[i].getBoundingClientRect(); if (r.width && r.height && r.top < window.innerHeight) { cart = r; break; } }
    if (!cart) cart = { left: window.innerWidth - 60, top: 14, width: 28, height: 28 };
    var from = imgBox(img);
    var size = 36;
    fly(img.currentSrc || img.src, from, { left: cart.left + cart.width / 2 - size / 2, top: cart.top + cart.height / 2 - size / 2, width: size, height: size * (from.height / Math.max(1, from.width)) }, { arc: true, ms: 760, easing: 'cubic-bezier(.45,0,.2,1)' });
  }

  function focusAdded() {
    var btn = F.root.querySelector('.hr-focus__add'), link = F.root.querySelector('.hr-focus__cart');
    if (!btn) return;
    var span = btn.querySelector('span'), was = span ? span.textContent : '';
    if (span) span.textContent = F.rail.strings.added;
    btn.classList.add('is-added');
    if (link) link.hidden = false;
    setTimeout(function () { if (span && span.isConnected) span.textContent = was; btn.classList.remove('is-added'); }, 2200);
  }

  /* ── The rail ── */
  class HangingRail extends HTMLElement {
    connectedCallback() { if (this.on) return; this.on = true; try { this.setup(); } catch (e) { this.on = false; } }
    disconnectedCallback() { this.on = false; if (this.ac) this.ac.abort(); if (this.ro) this.ro.disconnect(); cancelAnimationFrame(this.raf); this.raf = 0; }

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
          at: 0, dx: 0, vx: 0, acc: 0, p: 0, vp: 0, th: 0, om: 0, tilt: 0, fw: 0, last: '' };
      });
      this.active = -1; this.lifted = -1; this.pointer = null; this.hold = -1; this.fronts = false;
      this.scrollV = 0; this.scrollA = 0; this.lastScroll = 0; this.drag = null; this.glide = 0;
      this.ac = new AbortController();
      var o = { signal: this.ac.signal }, op = { signal: this.ac.signal, passive: true };

      this.measure();
      this.ro = new ResizeObserver(function () { self.measure(); self.wake(); });
      this.ro.observe(this);

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
        focusOpen(self, it.i, it.a);
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
      var f = it.front;
      var h = it.h || this.gh;
      it.fw = f && f.naturalWidth && f.naturalHeight ? Math.min(h, h * f.naturalWidth / f.naturalHeight) : h * 0.72;
      /* What it takes on the rail before it turns: its slot, or its turned width when it hangs turned. */
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
        if (reduced) { it.p = goal; it.vp = 0; }
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
      if (p && items[target] && this.mouse && !reduced) tilt = clamp((p.x - (items[target].at + items[target].dx)) / Math.max(1, items[target].fw / 2), -1, 1) * 9;
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
          var fo = reduced ? pp : smooth(0.12, 0.55, pp);
          it.front.style.opacity = fo ? fo.toFixed(3) : '';
          it.front.style.transform = pp ? 'translateX(-50%) perspective(900px) rotateY(' + ((1 - pp) * -74 + it.tilt).toFixed(2) + 'deg) scale(' + (1 + 0.05 * pp).toFixed(4) + ')' : '';
          if (it.side) {
            var so = reduced ? 1 - pp : 1 - smooth(0.05, 0.45, pp);
            it.side.style.opacity = pp ? so.toFixed(3) : '';
            it.side.style.transform = pp ? 'translateX(-50%) perspective(900px) rotateY(' + (pp * 26).toFixed(2) + 'deg)' : '';
          }
        }
      }
      if (moving) this.wake();
    }
  }
  customElements.define('hanging-rail', HangingRail);
})();
