/* Materia Themes. Testimonial Wall and Testimonial With Product on the
   storefront: the wall's Show more button, and the product row's arrows,
   arrow keys and progress line (the row is a native scroller). The builder
   loads live-r7-testimonials.js instead (the same plus live edits), so this
   file stands down there. */
(() => {
  if (window.MateriaR7TestimonialsRuntime || window.MateriaLiveR7Testimonials || (window.Shopify && window.Shopify.designMode)) return;
  const SEL = '[data-r7t-root]';
  const roots = new Map();
  const memory = new Map();
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const set = (el, p, v) => { if (!el) return; if (v == null || v === '') { if (el.style.getPropertyValue(p)) el.style.removeProperty(p); } else if (el.style.getPropertyValue(p) !== String(v)) el.style.setProperty(p, String(v)); };
  const text = (el, v) => { if (el && el.textContent !== String(v ?? '')) el.textContent = v ?? ''; };
  const attr = (el, n, v) => { if (!el) return; if (v == null || v === false) { if (el.hasAttribute(n)) el.removeAttribute(n); } else { const s = v === true ? '' : String(v); if (el.getAttribute(n) !== s) el.setAttribute(n, s); } };
  const flag = (el, n, on) => attr(el, n, on ? 'true' : 'false');
  const TYPES = {};
  /* ---------- Testimonial Wall ---------- */
  function wallOpen(root, open, instant) {
    const more = root.querySelector('[data-r7t-more]');
    if (instant) attr(root, 'data-instant', true);
    flag(root, 'data-open', open);
    if (more) { attr(more, 'aria-expanded', open ? 'true' : 'false'); text(more, open && more.dataset.less ? more.dataset.less : more.dataset.more || 'Show more'); }
    const id = root.dataset.sectionId, m = memory.get(id) || {};
    m.open = open; memory.set(id, m);
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => attr(root, 'data-instant', null)));
  }
  const wallIsOpen = root => root.dataset.open === 'true';
  TYPES['testimonial-wall'] = {
    init(root, st) {
      const more = root.querySelector('[data-r7t-more]');
      if (more) more.addEventListener('click', () => {
        const open = !wallIsOpen(root);
        /* closing is not animated: the page is far down the wall, so the button is brought back into view at once */
        wallOpen(root, open, !open || reduced());
        if (!open) { const r = more.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) more.scrollIntoView({block: 'center', behavior: 'instant'}); }
      }, {signal: st.ac.signal});
    },
  };

  /* ---------- Testimonial With Product ---------- */
  /* A native scroll row: arrows, arrow keys and the progress line. The finger moves the row; nothing here drags it. */
  function row(st, track) {
    const root = st.el, prev = root.querySelector('[data-r7t-prev]'), next = root.querySelector('[data-r7t-next]'), fill = root.querySelector('[data-r7t-fill]');
    let raf = 0, max = 0, base = 1;
    const rtl = () => getComputedStyle(track).direction === 'rtl';
    const at = () => Math.abs(track.scrollLeft);
    const step = () => { const c = track.firstElementChild; return c ? c.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : track.clientWidth; };
    const go = left => track.scrollTo({left: Math.max(0, Math.min(max, left)) * (rtl() ? -1 : 1), behavior: reduced() ? 'instant' : 'smooth'});
    const move = dir => { const s = step(); if (s > 0) go((Math.round(at() / s) + dir) * s); };
    /* sizes are read when the row or the layout changes, never while it scrolls */
    function measure() {
      max = Math.max(0, track.scrollWidth - track.clientWidth);
      const n = parseFloat(getComputedStyle(root).getPropertyValue('--r7p-n')) || 1, count = Math.max(1, track.children.length);
      base = Math.min(1, n / count);
      update();
    }
    function update() {
      raf = 0;
      if (!track.isConnected) return;
      const pos = at();
      if (prev) prev.disabled = pos < 2;
      if (next) next.disabled = pos >= max - 2;
      /* at the start the fill is the one the CSS prints (cards in view / cards), so nothing moves when this file loads */
      set(fill, '--r7p-f', pos < 2 || max <= 0 ? null : (base + Math.min(1, pos / max) * (1 - base)).toFixed(4));
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    const o = {signal: st.ac.signal};
    prev && prev.addEventListener('click', () => move(-1), o);
    next && next.addEventListener('click', () => move(1), o);
    track.addEventListener('keydown', e => {
      if (e.target !== track) return;
      const k = e.key, dir = rtl() ? -1 : 1;
      if (k === 'ArrowRight' || k === 'ArrowLeft') { move((k === 'ArrowRight' ? 1 : -1) * dir); e.preventDefault(); }
      else if (k === 'Home') { go(0); e.preventDefault(); } else if (k === 'End') { go(max); e.preventDefault(); }
    }, o);
    track.addEventListener('scroll', schedule, {passive: true, signal: st.ac.signal});
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => measure()) : null;
    if (ro) { ro.observe(track); st.off.push(() => ro.disconnect()); } else measure();
    st.off.push(() => cancelAnimationFrame(raf));
    return {el: track, measure, move, go, show(card) { if (card) go(card.offsetLeft - track.offsetLeft - (parseFloat(getComputedStyle(track).paddingInlineStart) || 0)); }};
  }
  TYPES['testimonial-product'] = {
    init(root, st) { const track = root.querySelector('[data-r7t-track]'); st.row = track ? row(st, track) : null; },
  };

  function add(el) {
    const type = el.dataset.r7tRoot, T = TYPES[type];
    if (!T) return;
    const st = {el, type, id: el.dataset.sectionId, off: [], ac: new AbortController()};
    roots.set(el, st);
    T.init(el, st);
  }
  function remove(el, st) { st.ac.abort(); for (const f of st.off.splice(0)) { try { f(); } catch (_) {} } roots.delete(el); }
  function scan() {
    for (const [el, st] of roots) if (!el.isConnected) remove(el, st);
    for (const el of document.querySelectorAll(SEL)) if (!roots.has(el)) add(el);
  }
  let queued = 0;
  const later = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; scan(); }); };
  document.addEventListener('shopify:section:load', scan);
  document.addEventListener('shopify:section:unload', later);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, {once: true}); else scan();
  new MutationObserver(ms => { for (const m of ms) for (const n of [...m.addedNodes, ...m.removedNodes]) if (n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))) return later(); }).observe(document.documentElement, {childList: true, subtree: true});
  window.MateriaR7TestimonialsRuntime = {scan, roots, count: () => roots.size};
})();
