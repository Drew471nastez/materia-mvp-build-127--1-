/* Materia Themes. One manager for the overlay popups (promotion, newsletter,
   coupon, countdown, spin wheel, image banner).

   A section registers its popup with MateriaPopups.register({...}) and keeps
   its own markup and look. The manager owns what every popup must do the same
   way:
   - triggers: immediate, delay, scroll %, exit intent (desktop pointer; touch
     screens fall back to the delay), inactivity, after N page views, manual
     ([data-popup-open="<section id>"] or a section's own selector);
   - frequency: every visit, once per session, again after N days, once ever
     (localStorage/sessionStorage, every access in try/catch);
   - one popup open at a time: the others wait in a queue, and nothing opens
     over an open cookie banner;
   - close button, Escape, backdrop click, focus moved in, kept in (Tab) and
     given back on close, page scroll locked while a modal is open;
   - the builder: no trigger runs; a popup opens when its section (or one of
     its blocks) is selected and closes on deselect, or stays open when the
     section's own "Show in the builder" setting is on.
   Sections' inline scripts run before this deferred file, so they queue their
   setup on window.MateriaPopupsQueue; it runs as soon as this file loads. */
(function () {
  'use strict';
  if (window.MateriaPopups && window.MateriaPopups.version) return;

  var store = {
    get: function (k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    set: function (k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} },
    rm: function (k, s) { try { (s ? sessionStorage : localStorage).removeItem(k); } catch (e) {} }
  };
  var DAY = 864e5;
  var design = !!(window.Shopify && window.Shopify.designMode);
  var finePointer = function () {
    try { return matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { return true; }
  };
  var reduced = function () {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };

  // Page views: counted once per page load, for the "after N page views" trigger.
  var views = (parseInt(store.get('materia:popup-views') || '0', 10) || 0) + 1;
  store.set('materia:popup-views', String(views));

  var entries = {};
  var current = null;
  var queue = [];
  var lastFocus = null;
  var scrollLock = null;

  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {}
  }
  function key(entry) { return 'materia:popup:' + (entry.storageKey || entry.id); }

  // ---- frequency --------------------------------------------------------
  function suppressed(entry) {
    var f = entry.frequency || {};
    var k = key(entry);
    var raw = store.get(k);
    if (raw === 'never' || raw === 'done') return true;
    var until = parseInt(raw || '0', 10);
    if (until && Date.now() < until) return true;
    if ((f.mode === 'session' || f.session) && store.get(k, true)) return true;
    return false;
  }
  function remember(entry) {
    var f = entry.frequency || {};
    var k = key(entry);
    if (f.mode === 'session' || f.session) store.set(k, '1', true);
    if (f.mode === 'session') return;
    if (f.mode === 'once' || f.mode === 'never') store.set(k, 'never');
    else if (f.mode === 'after_days' && +f.days > 0) store.set(k, String(Date.now() + f.days * DAY));
  }

  // ---- focus & scroll ---------------------------------------------------
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function focusables(el) {
    return Array.prototype.filter.call(el.querySelectorAll(FOCUSABLE), function (n) {
      return n.getClientRects().length && !n.closest('[hidden], [inert]');
    });
  }
  // Page scroll is held without touching any style: a change to <html>'s
  // overflow (or its scrollbar gutter) re-styled every element of the page,
  // about 100ms on a phone, in the very frame the popup opened. Wheel, touch
  // and scroll keys outside the popup's own scrolling parts do nothing while
  // a modal popup is open; inside them they scroll as usual (and never chain
  // to the page).
  var SCROLL_KEYS = { ' ': 1, PageUp: 1, PageDown: 1, Home: 1, End: 1, ArrowUp: 1, ArrowDown: 1, Spacebar: 1 };
  function scrollsInside(target, dy) {
    var box = current && (current.dialog || current.root);
    for (var el = target; el && el.nodeType === 1; el = el.parentElement) {
      if (box && !box.contains(el)) break;
      var cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if (dy < 0 ? el.scrollTop > 0 : dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : true) return true;
      }
      if (el === box) break;
    }
    return false;
  }
  var touchY = 0;
  function onWheel(e) { if (!scrollsInside(e.target, e.deltaY)) e.preventDefault(); }
  function onTouchStart(e) { touchY = e.touches && e.touches[0] ? e.touches[0].clientY : 0; }
  function onTouchMove(e) { var y = e.touches && e.touches[0] ? e.touches[0].clientY : touchY; if (!scrollsInside(e.target, touchY - y)) e.preventDefault(); }
  function onKey(e) {
    if (!SCROLL_KEYS[e.key] || e.defaultPrevented) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (e.key === ' ' && /^(BUTTON|A)$/.test(t.tagName)))) return;
    if (!scrollsInside(t, /Up|Home/.test(e.key) ? -1 : 1)) e.preventDefault();
  }
  function lockScroll() {
    if (scrollLock || design) return;
    scrollLock = true;
    document.addEventListener('wheel', onWheel, { passive: false, capture: true });
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('keydown', onKey, true);
    document.documentElement.setAttribute('data-popup-open', '');
  }
  function unlockScroll() {
    if (!scrollLock) return;
    document.removeEventListener('wheel', onWheel, { capture: true });
    document.removeEventListener('touchstart', onTouchStart, { capture: true });
    document.removeEventListener('touchmove', onTouchMove, { capture: true });
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.removeAttribute('data-popup-open');
    scrollLock = null;
  }


  // ---- motion -------------------------------------------------------------
  // One motion for every popup. Opening (320ms, cubic-bezier(.2,.8,.2,1)): the
  // shade fades in and the card rises from 16px below at 98% while fading in;
  // on phones a card that sits on the bottom edge slides up from below.
  // Closing (220ms, ease-in) plays the same backwards, and only then does the
  // section close and its dialog shut. Only opacity and transform move (the
  // compositor's own properties); the card's transform is added onto the one
  // its section gives it (composite: add), so a centred card stays centred.
  // will-change is set just before and dropped after. While it moves, the
  // section's own transitions are held off ([data-mp-motion]) so nothing
  // animates twice, and pictures in the card are decoded before the first frame.
  var OPEN_MS = 320, CLOSE_MS = 220, EASE_OUT = 'cubic-bezier(.2,.8,.2,1)', EASE_IN = 'cubic-bezier(.4,0,1,1)';
  try {
    var motionCss = document.createElement('style');
    motionCss.setAttribute('data-materia-motion', '');
    motionCss.textContent = '[data-mp-motion],[data-mp-motion] *{transition:none!important}[data-mp-noshade]{background-color:transparent!important}[data-mp-noshade]::before,[data-mp-noshade]::after{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(motionCss);
  } catch (e) {}
  function parts(entry) {
    var card = entry.dialog && entry.dialog.nodeType === 1 ? entry.dialog : null;
    var shade = entry.backdrop && entry.backdrop.nodeType === 1 ? entry.backdrop : null;
    if (shade === card) shade = null;
    return { card: card, shade: shade };
  }
  // The opacity the section itself gives an element when it is open (no motion of ours on it).
  function restOpacity(el) {
    if (!el) return 1;
    var v = parseFloat(getComputedStyle(el).opacity);
    return v > 0.02 && v <= 1 ? v : 1;
  }
  function canAnimate(el) { return !!(el && typeof el.animate === 'function') && !reduced(); }
  function settle(entry) {
    var m = entry.motion;
    if (!m) return;
    entry.motion = null;
    m.anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
    m.els.forEach(function (el) { el.style.removeProperty('will-change'); });
    unhide(m);
    if (m.finish) m.finish();
    clearTimeout(entry.motionOff);
    entry.root.removeAttribute('data-mp-motion');
  }
  function decodeIn(el, ms) {
    var imgs = el ? Array.prototype.slice.call(el.querySelectorAll('img')) : [];
    var jobs = imgs.filter(function (img) { return img.getAttribute('src') || img.currentSrc; }).map(function (img) {
      if (img.loading === 'lazy') img.loading = 'eager';
      return img.decode ? img.decode().catch(function () {}) : null;
    }).filter(Boolean);
    if (!jobs.length) return Promise.resolve();
    return Promise.race([Promise.all(jobs), new Promise(function (r) { setTimeout(r, ms); })]);
  }
  // What an element draws right now, its motion included (not its resting value).
  function drawn(el) {
    if (!el) return 0;
    var v = parseFloat(getComputedStyle(el).opacity);
    return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }
  // How dark a shade draws: its colour's own alpha, with a full-screen
  // ::before or ::after it draws its dark with (a shade is often
  // rgba(0,0,0,.5) at opacity 1, black at .5, or a black ::after at .5).
  function colorAlpha(c) {
    var m = String(c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return 0;
    var n = m[1].split(/[\s,\/]+/).filter(Boolean);
    var a = n.length > 3 ? parseFloat(n[3]) * (/%$/.test(n[3]) ? 0.01 : 1) : 1;
    return isFinite(a) ? Math.max(0, Math.min(1, a)) : 0;
  }
  function alphaOf(el) {
    if (!el) return 0;
    var clear = 1 - colorAlpha(getComputedStyle(el).backgroundColor);
    ['::before', '::after'].forEach(function (pe) {
      var cs = getComputedStyle(el, pe);
      if (!cs || cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') return;
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
      if (!(parseFloat(cs.width) >= window.innerWidth * 0.9)) return;
      clear *= 1 - colorAlpha(cs.backgroundColor) * (parseFloat(cs.opacity) || 0);
    });
    return 1 - clear;
  }
  function shadeLight(el) { return drawn(el) * alphaOf(el); }
  // A popup's shade when it draws one.
  function shadeOf(entry) {
    var sh = entry ? parts(entry).shade : null;
    return sh && alphaOf(sh) > 0.01 ? sh : null;
  }
  // A popup on its way out: one opened now takes the shade over from it.
  var leaving = null;
  // Held unseen without its motion: a shade that is a layer of its own is
  // hidden, a shade that is the box its card sits in only loses its dark
  // (its colour and its ::before/::after), so a card in it still shows.
  function hideShade(m, shade, card) {
    if (card && shade.contains(card)) {
      shade.setAttribute('data-mp-noshade', '');
      m.unhide = (m.unhide || []).concat([[shade, null]]);
    } else {
      shade.style.setProperty('visibility', 'hidden', 'important');
      m.unhide = (m.unhide || []).concat([[shade, 'visibility']]);
    }
  }
  function unhide(m) {
    (m.unhide || []).forEach(function (u) { if (u[1]) u[0].style.removeProperty(u[1]); else u[0].removeAttribute('data-mp-noshade'); });
    m.unhide = null;
  }
  // The last popup's shade gives way to the next one's in one frame, so the
  // two together draw as dark as the last one did: it goes when the next one
  // can be as dark (that one starts there); when the next one rests lighter,
  // the last one is thinned to what the next lacks and fades out after.
  // Returns how long the last one must stay to finish that (ms).
  function takeOver(old, c, next) {
    var m = old.motion, sh = shadeOf(old), card = parts(old).card;
    if (!m || !sh) return 0;
    if (m.shadeAnim) { try { m.shadeAnim.cancel(); } catch (e) {} m.shadeAnim = null; }
    var box = card && sh.contains(card);
    if (box || c <= next + 0.005 || next >= 0.999) { hideShade(m, sh, card); return 0; }
    var rest = 1 - (1 - c) / (1 - next), a = alphaOf(sh);
    try { m.anims.push(sh.animate([{ opacity: Math.min(1, rest / (a || 1)), '--mp-fade': '0' }, { opacity: 0, '--mp-fade': '1' }], { duration: OPEN_MS, easing: 'ease-out', fill: 'forwards' })); } catch (e) { return 0; }
    return OPEN_MS;
  }
  // Round 68 (scripts/check-overlay-flash-r68.ts). A popup that replaces
  // another (the builder's overlay group, one picked after another; an
  // opener clicked while one shows) never lets the screen go light and dark
  // again, and never lays its shade over the last card: the last card fades
  // out on its own shade first, then the shades change places in one frame
  // (takeOver) and the new card comes in. One reopened while it was still
  // closing starts from what it had kept, and one closed while it was still
  // opening fades out from what it had reached, never from full.
  function moveIn(entry, from) {
    from = from || {};
    settle(entry);
    var p = parts(entry);
    if (!canAnimate(p.card)) return;
    var root = entry.root;
    root.setAttribute('data-mp-motion', 'in');
    var r = p.card.getBoundingClientRect();
    var sheet = window.innerWidth <= 640 && r.height > 0 && window.innerHeight - r.bottom < 4;
    var start = sheet ? 'translate3d(0,100%,0)' : 'translate3d(0,16px,0) scale(.98)';
    var to = sheet ? 'translate3d(0,0,0)' : 'translate3d(0,0,0) scale(1)';
    // A card that was still showing (reopened while closing) does not drop back down first.
    if (from.card > 0.5) start = to;
    var o = { duration: OPEN_MS, easing: EASE_OUT, fill: 'both' };
    // Each fades to the opacity its section gives it, never past it: a shade
    // drawn at 0.5 that faded to 1 went near black and then jumped back
    // lighter as the motion ended (round 67, scripts/check-popup-flash-r67.ts).
    var cardTo = restOpacity(p.card), shadeTo = restOpacity(p.shade);
    var cardFrom = Math.min(cardTo, from.card || 0);
    var own = shadeOf(entry) ? alphaOf(p.shade) : 0, most = own * shadeTo;
    var old = from.old && from.old !== entry && from.old.motion && from.old.motion.after && from.old.root.isConnected ? from.old : null;
    // A card in its shade's box fades with the box; a fade of its own as well
    // made it come and go twice as fast as the shade (a dark dip over the card).
    var boxed = !!(p.shade && p.shade.contains(p.card)) && !old;
    var anims = [
      p.card.animate([{ transform: start, composite: 'add' }, { transform: to, composite: 'add' }], o),
      p.card.animate([{ opacity: boxed ? cardTo : cardFrom }, { opacity: cardTo }], { duration: sheet ? OPEN_MS : 220, easing: 'ease-out', fill: 'both' })
    ];
    anims.forEach(function (a) { a.pause(); });
    var els = [p.card].concat(p.shade ? [p.shade] : []);
    var m = entry.motion = { anims: anims, els: els, shadeAnim: null };
    // The shade starts at the opacity that draws it as dark as the screen
    // was (c: opacity times colour alpha), in the frame it is asked to.
    var shadeGo = function (c) {
      if (entry.motion !== m || !p.shade) return;
      unhide(m);
      var f = c > 0 && own > 0 ? (c <= most ? c / own : shadeTo) : 0;
      // Drawn by the page like the fade out (see moveOut), so a shade taking over lands in the same frame as the last one goes.
      m.shadeAnim = p.shade.animate([{ opacity: f, '--mp-fade': '0' }, { opacity: shadeTo, '--mp-fade': '1' }], { duration: OPEN_MS, easing: 'ease-out', fill: 'both' });
      m.anims.push(m.shadeAnim);
      p.shade.style.willChange = 'opacity';
    };
    // The card comes in over the last card as that one goes (this card lies
    // above it; only this shade would dim it, and that waits).
    var decoded = false;
    var cardGo = function () {
      if (entry.motion !== m || !decoded) return;
      requestAnimationFrame(function () {
        if (entry.motion !== m) return;
        p.card.style.willChange = 'transform, opacity';
        anims[0].play(); anims[1].play();
        if (old && old.motion && old.motion.release) old.motion.release();
        anims[0].finished.then(function () { if (entry.motion === m) settle(entry); }, function () {});
      });
    };
    var om = old && old.motion;
    // Which one lies above: the later one on the page (both are drawn at the same height).
    var over = old && !!(old.root.compareDocumentPosition(entry.root) & 4);
    if (old && !over) {
      // The last one lies above this one, its shade over this card: the
      // shades change places now, and the last card goes over this shade.
      var c0 = shadeLight(shadeOf(old));
      var hold0 = own > 0 ? takeOver(old, c0, most) : 0;
      shadeGo(c0);
      if (hold0) om.after.push(function () { return Math.max(0, hold0 - CLOSE_MS); });
    } else if (old) {
      // This one lies above: its shade is unseen until the last card has
      // gone (it would lie over that card), and the last shade holds.
      if (p.shade) hideShade(m, p.shade, p.card);
      if (om.shadeAnim) { try { om.shadeAnim.pause(); } catch (e) {} }
      om.after.push(function () {
        if (entry.motion !== m) return 0;
        var c = shadeLight(shadeOf(old));
        var hold = own > 0 ? takeOver(old, c, most) : 0;
        shadeGo(c);
        return hold;
      });
    } else shadeGo(from.shade || 0);
    decodeIn(p.card, 250).then(function () { decoded = true; cardGo(); });
  }
  function moveOut(entry, done, opts) {
    opts = opts || {};
    var p = parts(entry);
    // Closed while it was still opening: it fades from what it had reached.
    var mid = !!entry.motion;
    var nowCard = mid ? drawn(p.card) : 0, nowShade = mid ? drawn(p.shade) : 0;
    settle(entry);
    if (!canAnimate(p.card)) { done(); return; }
    var root = entry.root;
    root.setAttribute('data-mp-motion', 'out');
    var r = p.card.getBoundingClientRect();
    var sheet = window.innerWidth <= 640 && r.height > 0 && window.innerHeight - r.bottom < 4;
    var to = sheet ? 'translate3d(0,100%,0)' : 'translate3d(0,16px,0) scale(.98)';
    var o = { duration: CLOSE_MS, easing: EASE_IN, fill: 'forwards' };
    var els = [p.card].concat(p.shade ? [p.shade] : []);
    var cardFrom = mid ? Math.min(restOpacity(p.card), nowCard) : restOpacity(p.card);
    var shadeFrom = mid ? Math.min(restOpacity(p.shade), nowShade) : restOpacity(p.shade);
    p.card.style.willChange = 'transform, opacity';
    var boxed = !!(p.shade && p.shade.contains(p.card)) && !opts.keepShade;
    var anims = [
      p.card.animate([{ transform: 'translate3d(0,0,0) scale(1)', composite: 'add' }, { transform: to, composite: 'add' }], o),
      p.card.animate([{ opacity: cardFrom }, { opacity: boxed ? cardFrom : 0 }], o)
    ];
    // Handed over (opts.keepShade): the shade holds while the card goes, and
    // the next popup takes it over as this one ends (moveIn, takeOver).
    // Otherwise it fades out drawn by the page, not the compositor (the
    // custom property keeps it there): a popup opened while this one closes
    // takes it over in the same frame, where a compositor fade kept going on
    // its own while that opening ran and showed the page light for a few
    // frames.
    var kept = opts.keepShade && shadeOf(entry);
    var shadeAnim = p.shade && !kept ? p.shade.animate([{ opacity: shadeFrom, '--mp-fade': '0' }, { opacity: 0, '--mp-fade': '1' }], o) : null;
    if (shadeAnim) anims.push(shadeAnim);
    var m = entry.motion = { anims: anims, els: els, finish: null, shadeAnim: shadeAnim, after: [] };
    leaving = entry;
    if (kept) {
      // Its card waits for the next card, which comes in over it as it goes,
      // so the two cross and the screen never shows the bare shade between.
      anims.forEach(function (a) { a.pause(); });
      m.release = function () { m.release = null; clearTimeout(m.wait); anims.forEach(function (a) { try { a.play(); } catch (e) {} }); };
      m.wait = setTimeout(function () { if (m.release) m.release(); }, 400);
    }
    var finished = false;
    var close = function () {
      done();
      // The section is shut now; the end frame holds until its closed style
      // is in place, then the hold on its own transitions is lifted.
      entry.motionOff = setTimeout(function () {
        if (entry.motion === m) { entry.motion = null; anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); els.forEach(function (el) { el.style.removeProperty('will-change'); }); unhide(m); }
        if (!entry.motion) root.removeAttribute('data-mp-motion');
      }, 60);
    };
    var end = function () {
      if (finished) return; finished = true;
      if (leaving === entry) leaving = null;
      var hold = 0;
      m.after.splice(0).forEach(function (fn) { try { hold = Math.max(hold, fn() || 0); } catch (e) {} });
      if (hold) setTimeout(close, hold); else close();
    };
    m.finish = end;
    anims[0].finished.then(end, function () {});
  }

  // ---- open / close -----------------------------------------------------
  // An open cart drawer, quick view, search, phone menu or other drawer:
  // popups wait in the queue until it closes (never drawn over it).
  var COVER_CLASSES = ['open-drawer', 'open-minicart', 'open-search', 'nav-open', 'open-sidebar', 'open-popup', 'tingle-enabled', 'mt-lock', 'facets-locked'];
  var COVER_SEL = '.mcp-backdrop.open, .loc-sheet-backdrop.open, cart-drawer[open], .drawer.active, menu-drawer[open], details[open] > .menu-drawer, [data-storelib-drawer][open], .tingle-modal--visible';
  function covered() {
    var html = document.documentElement, body = document.body;
    for (var i = 0; i < COVER_CLASSES.length; i++) {
      if (html.classList.contains(COVER_CLASSES[i]) || (body && body.classList.contains(COVER_CLASSES[i]))) return true;
    }
    try { return !!document.querySelector(COVER_SEL); } catch (e) { return false; }
  }
  function blocked() {
    if (design) return false;
    // A cookie banner asks first; popups wait for its answer (materia:consent).
    var consent = document.querySelector('cookie-consent[data-open]');
    if (consent && !consent.hidden) return true;
    return covered();
  }
  // When a drawer or menu closes, the next waiting popup may open.
  var coverFrame = 0;
  function coverChanged() {
    if (coverFrame || !queue.length) return;
    coverFrame = setTimeout(function () { coverFrame = 0; if (!current && !blocked()) flush(); }, 700);
  }
  try {
    var coverWatch = new MutationObserver(coverChanged);
    coverWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    var watchBody = function () { if (document.body) coverWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] }); };
    if (document.body) watchBody(); else document.addEventListener('DOMContentLoaded', watchBody);
  } catch (e) {}

  function show(entry, opts) {
    opts = opts || {};
    if (!entry || !entry.root || !entry.root.isConnected) return false;
    if (current === entry) return true;
    if (!opts.force && (suppressed(entry) || entry.shownThisPage)) return false;
    // What the screen shows now, for the new popup to start from (see moveIn).
    // Only a popup with a shade of its own takes one over; one without lets the last shade fade out as usual.
    var from = { shade: 0, card: 0 }, takes = !opts.instant && !!shadeOf(entry);
    if (current) {
      if (!opts.force) { if (queue.indexOf(entry) < 0) queue.push(entry); return false; }
      if (opts.instant || reduced()) hide(current, { reason: 'replaced', instant: true });
      else {
        if (takes && shadeOf(current)) { from.shade = shadeLight(shadeOf(current)); from.old = current; }
        hide(current, { reason: 'replaced', handoff: !!from.old });
      }
    } else if (!opts.force && blocked()) { if (queue.indexOf(entry) < 0) queue.push(entry); return false; }
    if (takes && !from.old && leaving && leaving !== entry && leaving.motion && shadeOf(leaving)) {
      // Another one still closing: its shade gives way to this one's (moveIn).
      from.shade = shadeLight(shadeOf(leaving));
      from.old = leaving;
    }
    if (entry.motion && entry.root.getAttribute('data-mp-motion') === 'out' && !opts.instant) {
      // This one, reopened before its close ended.
      var pe = parts(entry);
      from.shade = Math.max(from.shade, shadeLight(shadeOf(entry)));
      from.card = drawn(pe.card);
    }
    current = entry;
    entry.shownThisPage = true;
    if (!opts.force && !design) remember(entry);
    if (!lastFocus || !lastFocus.isConnected) lastFocus = document.activeElement;
    if (entry.root.hidden) entry.root.hidden = false;
    entry.root.setAttribute('aria-hidden', 'false');
    entry.root.setAttribute('data-popup-state', 'open');
    try { window.MateriaLateCss && window.MateriaLateCss.now(); } catch (e) {}
    // The page scroll is held before anything moves (one style pass for <html>).
    if (entry.modal !== false) lockScroll();
    settle(entry);
    if (!opts.instant) entry.root.setAttribute('data-mp-motion', 'in');
    try { entry.open && entry.open({ instant: !!opts.instant || reduced(), preview: !!opts.preview }); } catch (e) { console.error(e); }
    if (!opts.preview && entry.focus !== false) {
      var dialog = entry.dialog || entry.root;
      requestAnimationFrame(function () {
        if (current !== entry) return;
        var first = dialog.querySelector('[data-popup-autofocus]') || dialog;
        if (first === dialog && !dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
        try { first.focus({ preventScroll: true }); } catch (e) {}
      });
    }
    emit('materia:popup-open', { id: entry.id });
    if (!opts.instant) moveIn(entry, from);
    else {
      // Drawn open at once (the builder draws a selected popup again after an
      // edit): its own transitions stay held for this style pass, so its shade
      // does not fade in again from nothing.
      entry.root.setAttribute('data-mp-motion', 'still');
      try { void getComputedStyle(entry.root).opacity; void entry.root.offsetWidth; } catch (e) {}
      entry.root.removeAttribute('data-mp-motion');
    }
    return true;
  }

  function hide(entry, opts) {
    opts = opts || {};
    entry = entry || current;
    if (!entry) return;
    var wasCurrent = current === entry;
    var qi = queue.indexOf(entry);
    if (qi > -1) queue.splice(qi, 1);
    if (!wasCurrent) return;
    current = null;
    entry.root.setAttribute('aria-hidden', 'true');
    entry.root.setAttribute('data-popup-state', 'closed');
    if (opts.reason !== 'replaced' && !design && opts.reason !== 'deselect') remember(entry);
    var back = lastFocus; lastFocus = null;
    if (back && back.isConnected && opts.reason !== 'replaced' && opts.reason !== 'unload') {
      try { back.focus({ preventScroll: true }); } catch (e) {}
    }
    // The close plays to its end, then the section shuts and its dialog closes.
    var shut = function () {
      if (current === entry) return;
      try { entry.close && entry.close({ instant: !!opts.instant || reduced(), reason: opts.reason || 'close' }); } catch (e) { console.error(e); }
      if (!current) unlockScroll();
      emit('materia:popup-close', { id: entry.id, reason: opts.reason || 'close' });
    };
    if (opts.instant || (opts.reason === 'replaced' && !opts.handoff) || opts.reason === 'unload') { settle(entry); shut(); }
    else moveOut(entry, shut, { keepShade: !!opts.handoff });
    if (opts.reason !== 'replaced') setTimeout(flush, (entry.gap != null ? entry.gap : 600) + CLOSE_MS);
  }

  function flush() {
    if (current || blocked()) return;
    while (queue.length) {
      var next = queue.shift();
      if (next.root && next.root.isConnected && !suppressed(next) && !next.shownThisPage) { show(next); return; }
    }
  }

  // ---- triggers ---------------------------------------------------------
  function arm(entry) {
    var t = entry.trigger || {};
    var mode = t.mode || 'delay';
    var cleanups = entry.cleanups;
    var fire = function () { disarm(entry); show(entry); };
    var later = function (seconds) {
      var id = setTimeout(fire, Math.max(0, +seconds || 0) * 1000);
      cleanups.push(function () { clearTimeout(id); });
    };
    var listen = function (target, type, fn, o) {
      target.addEventListener(type, fn, o);
      cleanups.push(function () { target.removeEventListener(type, fn, o); });
    };
    var exitListen = function () {
      listen(document, 'mouseout', function (e) {
        if (!e.relatedTarget && e.clientY <= 8) fire();
      });
    };
    // Exit intent can also back up another trigger (desktop pointers only).
    if (t.exit && mode !== 'exit' && finePointer()) exitListen();
    if (mode === 'manual' || mode === 'click') return;
    if (mode === 'exit' && !finePointer()) { later(t.delay > 0 ? t.delay : 15); return; }
    switch (mode) {
      case 'immediate': later(0); break;
      case 'delay': later(t.delay); break;
      case 'pageviews':
        if (views >= Math.max(1, +t.views || 1)) later(t.delay);
        break;
      case 'scroll': {
        var pct = Math.min(100, Math.max(0, +t.scroll || 50));
        var check = function () {
          var max = document.documentElement.scrollHeight - window.innerHeight;
          var done = max <= 0 ? 100 : (window.scrollY / max) * 100;
          if (done >= pct) fire();
        };
        listen(window, 'scroll', check, { passive: true });
        check();
        break;
      }
      case 'exit': exitListen(); break;
      case 'inactivity': {
        var idle = Math.max(1, +t.idle || 10) * 1000;
        var timer = 0;
        var reset = function () { clearTimeout(timer); timer = setTimeout(fire, idle); };
        ['mousemove', 'keydown', 'scroll', 'touchstart', 'pointerdown'].forEach(function (ev) {
          listen(ev === 'scroll' ? window : document, ev, reset, { passive: true });
        });
        cleanups.push(function () { clearTimeout(timer); });
        reset();
        break;
      }
      default: later(t.delay);
    }
  }
  function disarm(entry) {
    var list = entry.cleanups.splice(0);
    list.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  // ---- registry ---------------------------------------------------------
  function register(cfg) {
    if (!cfg || !cfg.id || !cfg.root) return null;
    if (cfg.design != null) design = design || !!cfg.design;
    var old = entries[cfg.id];
    var wasOpen = old && current === old;
    var wasSelected = old && old.selected;
    if (old) unregister(cfg.id, true);
    var entry = Object.assign({ cleanups: [], modal: true }, cfg);
    entries[cfg.id] = entry;
    entry.root.setAttribute('data-popup-id', entry.id);

    // Close: buttons, backdrop, and any [data-popup-close] inside.
    entry.onClick = function (e) {
      var target = e.target;
      if (!target || !target.closest) return;
      if (target.closest('[data-popup-close]') || (entry.closeSelector && target.closest(entry.closeSelector))) {
        e.preventDefault(); hide(entry, { reason: 'close' }); return;
      }
      if (entry.backdrop && (target === entry.backdrop || (typeof entry.backdrop === 'string' && target.matches(entry.backdrop)))) {
        hide(entry, { reason: 'backdrop' });
      }
    };
    entry.root.addEventListener('click', entry.onClick);

    // Manual openers anywhere on the page.
    var openSel = '[data-popup-open="' + entry.id + '"]' + (entry.trigger && entry.trigger.selector ? ', ' + entry.trigger.selector : '');
    entry.onOpener = function (e) {
      var opener = e.target && e.target.closest && e.target.closest(openSel);
      if (!opener) return;
      e.preventDefault();
      lastFocus = opener;
      show(entry, { force: true });
    };
    document.addEventListener('click', entry.onOpener);

    if (design) {
      if (wasSelected || wasOpen) { entry.selected = !!wasSelected; show(entry, { force: true, instant: true, preview: true }); }
      else if (entry.preview) show(entry, { force: true, instant: true, preview: true });
    } else if (!suppressed(entry)) {
      arm(entry);
    }
    return {
      show: function (o) { return show(entry, Object.assign({ force: true }, o)); },
      hide: function (o) { hide(entry, o); },
      done: function (days) {
        // A conversion (signed up, copied a code): do not ask again for a while.
        if (design) return;
        store.set(key(entry), days ? String(Date.now() + days * DAY) : 'done');
      },
      reset: function () { store.rm(key(entry)); store.rm(key(entry), true); },
      isOpen: function () { return current === entry; },
      entry: entry
    };
  }
  function unregister(id, keepFocus) {
    var entry = entries[id];
    if (!entry) return;
    if (current === entry) hide(entry, { reason: keepFocus ? 'replaced' : 'unload', instant: true });
    var qi = queue.indexOf(entry);
    if (qi > -1) queue.splice(qi, 1);
    disarm(entry);
    entry.root.removeEventListener('click', entry.onClick);
    document.removeEventListener('click', entry.onOpener);
    delete entries[id];
  }

  // ---- global keys ------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    if (!current) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (current.escape === false) return;
      e.preventDefault();
      hide(current, { reason: 'escape' });
      return;
    }
    if (e.key === 'Tab' && current.modal !== false) {
      var dialog = current.dialog || current.root;
      var list = focusables(dialog);
      if (!list.length) { e.preventDefault(); dialog.focus(); return; }
      var first = list[0], last = list[list.length - 1];
      var active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !dialog.contains(active))) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('materia:consent', function () { setTimeout(flush, 500); });

  // ---- builder: open on select, close on deselect ---------------------
  function sectionOf(e) {
    var d = e.detail || {};
    return d.sectionId != null ? String(d.sectionId) : '';
  }
  // Another section picked, added or previewed (the add-section library):
  // a popup shown only because it was selected steps away.
  function stepAway(id) {
    if (!design || !current || current.id === id || current.preview) return;
    current.selected = false;
    // It fades out (a popup picked next takes its shade over), never cut away.
    hide(current, { reason: 'deselect' });
  }
  function onSelect(e) {
    var id = sectionOf(e);
    var entry = entries[id];
    stepAway(id);
    if (!entry) return;
    entry.selected = true;
    show(entry, { force: true, preview: true });
  }
  function onDeselect(e) {
    var entry = entries[sectionOf(e)];
    if (!entry) return;
    entry.selected = false;
    if (!entry.preview) hide(entry, { reason: 'deselect' });
  }
  document.addEventListener('shopify:section:select', onSelect);
  document.addEventListener('shopify:block:select', onSelect);
  document.addEventListener('shopify:section:deselect', onDeselect);
  document.addEventListener('shopify:section:load', function (e) { var id = sectionOf(e); if (id && !entries[id]) stepAway(id); });
  document.addEventListener('shopify:section:unload', function (e) {
    var id = sectionOf(e);
    if (entries[id] && !entries[id].root.isConnected) unregister(id);
  });

  // ---- coupon copy ------------------------------------------------------
  function copy(text) {
    return new Promise(function (resolve, reject) {
      if (!text) { reject(new Error('empty')); return; }
      var fallback = function () {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
          var ok = document.execCommand && document.execCommand('copy');
          document.body.removeChild(ta);
          if (ok) resolve(); else reject(new Error('copy refused'));
        } catch (err) { reject(err); }
      };
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
        navigator.clipboard.writeText(text).then(resolve, fallback);
      } else fallback();
    });
  }

  // ---- what sits at the bottom of the screen ----------------------------
  // The mobile navigation bar and an open cookie banner take the bottom of
  // the screen; --materia-bottom-inset on <html> says how much, so floating
  // buttons and notifications sit above them instead of over them.
  var insetFrame = 0;
  function bottomInset() {
    var h = window.innerHeight, inset = 0;
    var parts = document.querySelectorAll('sticky-add-cart, mobile-navigation-bar, .mobile-navigation-bar, cookie-consent[data-open] [data-consent-panel]');
    for (var i = 0; i < parts.length; i++) {
      var el = parts[i];
      if (!el.getClientRects().length) continue;
      var cs = getComputedStyle(el);
      if (el.matches('sticky-add-cart')) {
        if (!el.classList.contains('show-sticky-cart')) continue;
        // Reserve the final bar height before its entrance starts, so floating
        // controls never spend an animation frame underneath the bar.
        inset = Math.max(inset, (parseFloat(cs.bottom) || 0) + el.offsetHeight);
        continue;
      }
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      var r = el.getBoundingClientRect();
      // Only what sits low on the screen: a bar or a banner, not a full-screen modal or a top bar.
      if (r.height && r.top > h * 0.35 && r.bottom > h * 0.6 && r.top < h) inset = Math.max(inset, h - r.top);
    }
    return Math.round(inset);
  }
  // Every rule reads it as var(--materia-bottom-inset, 0px), so while nothing
  // sits at the bottom it stays unset: writing 0px on <html> re-styled the
  // whole page during load. The event still fires once for it.
  var insetSaid = null;
  function measureInset() {
    insetFrame = 0;
    var v = bottomInset() + 'px';
    var style = document.documentElement.style;
    var now = style.getPropertyValue('--materia-bottom-inset');
    if (now === v) return;
    if (now === '' && v === '0px') {
      if (insetSaid === v) return;
    } else {
      style.setProperty('--materia-bottom-inset', v);
    }
    insetSaid = v;
    emit('materia:bottom-inset', { inset: parseInt(v, 10) });
  }
  function queueInset() { if (!insetFrame) insetFrame = requestAnimationFrame(measureInset); }
  window.addEventListener('resize', queueInset, { passive: true });
  // A scroll only matters once it has settled: the sticky Add to cart says
  // when it shows with a class on <html> (watched below), and the phone bar
  // does not move with the page. Measured on every scroll frame, the bars'
  // boxes forced a style and layout pass in the middle of each frame.
  var insetScroll = 0;
  window.addEventListener('scroll', function () { clearTimeout(insetScroll); insetScroll = setTimeout(queueInset, 150); }, { passive: true });
  document.addEventListener('materia:consent', function () { setTimeout(queueInset, 450); });
  try {
    new MutationObserver(queueInset).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-open', 'hidden', 'data-settled'] });
  } catch (e) {}
  // First measured while the page is idle after it is parsed (a frame at
  // DOMContentLoaded forced a layout of the whole page there), then whenever
  // the bar or the banner changes size: a ResizeObserver reports after
  // layout, so it never forces one (this was a second timed check at 1.2s).
  var insetSettle = 0;
  new MutationObserver(() => { queueInset(); clearTimeout(insetSettle); insetSettle = setTimeout(queueInset, 380); }).observe(document.documentElement, {attributes:true, attributeFilter:['class']});
  function watchInset() {
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(queueInset), seen = [];
      var watch = function () {
        var parts = document.querySelectorAll('sticky-add-cart, mobile-navigation-bar, .mobile-navigation-bar, cookie-consent [data-consent-panel]');
        for (var i = 0; i < parts.length; i++) if (seen.indexOf(parts[i]) < 0) { seen.push(parts[i]); ro.observe(parts[i]); }
      };
      watch();
      document.addEventListener('materia:consent', watch);
      document.addEventListener('storelib:section-load', watch);
      document.addEventListener('shopify:section:load', watch);
      try { new MutationObserver(watch).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-open'] }); } catch (e) {}
    }
    queueInset();
  }
  var idleInset = function () {
    if (window.requestIdleCallback) requestIdleCallback(watchInset, { timeout: 1000 });
    else setTimeout(watchInset, 200);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', idleInset); else idleInset();

  /* Back from the platform after a signup form in a popup was posted the ordinary way (its
     CAPTCHA needs the real submit): the platform sends the browser back with ?customer_posted=true
     (or ?contact_posted=true) and the form's #id; with errors, the page draws form.errors in
     the form ([data-mt-form-errors]). theme.js tidies the address and keeps the one it found
     in window.__mtPostedUrl. 'ok' (an address already on the list counts), 'error' or ''. */
  function posted(form) {
    if (!form || !form.id || design) return '';
    var url;
    try { url = new URL(window.__mtPostedUrl || location.href); } catch (e) { return ''; }
    var hash = '';
    try { hash = decodeURIComponent(url.hash.slice(1)); } catch (e) { hash = url.hash.slice(1); }
    if (hash !== form.id) return '';
    var err = form.querySelector('[data-mt-form-errors]');
    if (err) return /taken|already|exist/i.test(err.getAttribute('data-mt-form-errors') || '') ? 'ok' : 'error';
    if (/[?&](customer|contact)_posted=true/.test(url.search) || form.querySelector('[data-mt-form-posted]')) return 'ok';
    return '';
  }

  window.MateriaPopups = {
    // 2: popups hand the shade over (round 68); the head fix for older files (theme-motion-fix.ts) stands aside.
    version: 2,
    posted: posted,
    register: register,
    unregister: unregister,
    open: function (id) { return show(entries[id], { force: true }); },
    close: function (id) { hide(id ? entries[id] : current); },
    current: function () { return current ? current.id : null; },
    queued: function () { return queue.map(function (e) { return e.id; }); },
    copy: copy,
    store: store,
    reduced: reduced,
    pageViews: function () { return views; },
    bottomInset: bottomInset,
    covered: covered,
    get design() { return design; }
  };

  var pending = window.MateriaPopupsQueue || [];
  window.MateriaPopupsQueue = { push: function (fn) { try { fn(window.MateriaPopups); } catch (e) { console.error(e); } } };
  pending.forEach(function (fn) { window.MateriaPopupsQueue.push(fn); });
})();
