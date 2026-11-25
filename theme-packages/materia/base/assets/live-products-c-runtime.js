/* Materia Themes. Hotspots of Hotspot Image Product, Hotspot Image Product 2
   and Product Shop The Look 2 on the storefront: a dot opens its card next to
   it (kept inside the screen on phones), one card open per section; Escape, a
   tap outside, the close button or leaving the dot (hover mode) closes it.
   Product Tabs Navigation needs nothing here (collection-tab.js runs it). The
   theme editor loads live-products-c.js instead (the same plus live edits). */
(() => {
  if (window.MateriaProductsC) return;
  const roots = new Map();
  const desktop = matchMedia('(min-width: 750px)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  function close(st, focus) {
    const spot = st.open;
    if (!spot) return;
    st.open = null;
    clearTimeout(st.leave);
    const dot = spot.querySelector('[data-pch-dot]'), pop = spot.querySelector('[data-pch-pop]');
    if (pop) pop.hidden = true;
    if (dot) dot.setAttribute('aria-expanded', 'false');
    spot.removeAttribute('data-open');
    if (focus && dot) dot.focus({preventScroll: true});
  }
  function place(st, spot, pop) {
    pop.style.removeProperty('--pch-shift');
    pop.removeAttribute('data-place');
    const vw = document.documentElement.clientWidth, edge = 8;
    const stage = (st.root.querySelector('[data-pch-stage]') || st.root).getBoundingClientRect();
    let r = pop.getBoundingClientRect();
    if (st.root.dataset.pchPlace === 'side') {
      if (r.right > vw - edge) { pop.setAttribute('data-place', 'left'); r = pop.getBoundingClientRect(); }
      if (r.left < edge) { const s = spot.getBoundingClientRect(); pop.setAttribute('data-place', s.top - stage.top > stage.bottom - s.bottom && s.top + scrollY > r.height + 30 ? 'above' : 'below'); r = pop.getBoundingClientRect(); }
      else return;
    } else {
      const s = spot.getBoundingClientRect(), above = s.top - stage.top, below = stage.bottom - s.bottom;
      if ((r.top < stage.top && below >= above) || r.top + scrollY < 0) { pop.setAttribute('data-place', 'below'); r = pop.getBoundingClientRect(); }
    }
    let shift = 0;
    if (r.left < edge) shift = edge - r.left; else if (r.right > vw - edge) shift = vw - edge - r.right;
    if (shift) pop.style.setProperty('--pch-shift', Math.round(shift) + 'px');
  }
  function open(st, spot) {
    if (st.open === spot || spot.hidden) return;
    close(st, false);
    const dot = spot.querySelector('[data-pch-dot]'), pop = spot.querySelector('[data-pch-pop]');
    if (!dot || !pop) return;
    st.open = spot;
    pop.hidden = false;
    spot.setAttribute('data-open', '');
    dot.setAttribute('aria-expanded', 'true');
    place(st, spot, pop);
  }
  function bindHotspots(st) {
    const {root} = st, on = (type, fn) => { root.addEventListener(type, fn); st.listeners++; };
    on('click', e => {
      const closeBtn = e.target.closest('[data-pch-close]');
      if (closeBtn && root.contains(closeBtn)) { close(st, true); return; }
      const dot = e.target.closest('[data-pch-dot]');
      if (!dot || !root.contains(dot)) return;
      e.preventDefault();
      const spot = dot.closest('[data-pch-spot]');
      if (st.open === spot && !(st.hoverOpened && Date.now() - st.hoverOpened < 400)) close(st, false); else open(st, spot);
      st.hoverOpened = 0;
    });
    const hoverable = () => root.dataset.pchMode === 'hover' && fine.matches;
    on('pointerover', e => {
      if (!hoverable() || e.pointerType === 'touch') return;
      const spot = e.target.closest('[data-pch-spot]');
      if (!spot || !root.contains(spot)) return;
      clearTimeout(st.leave);
      if (st.open !== spot && e.target.closest('[data-pch-dot]')) { open(st, spot); st.hoverOpened = Date.now(); }
    });
    on('pointerout', e => {
      if (!hoverable() || !st.open || e.pointerType === 'touch') return;
      if (e.relatedTarget && st.open.contains(e.relatedTarget)) return;
      if (!st.open.contains(e.target)) return;
      clearTimeout(st.leave);
      st.leave = setTimeout(() => { if (st.open && !st.open.matches(':hover') && !st.open.querySelector(':focus-visible')) close(st, false); }, 180);
    });
    on('shopify:block:select', e => { const spot = e.target.closest && e.target.closest('[data-pch-spot]'); if (spot && root.contains(spot)) open(st, spot); });
    on('shopify:block:deselect', () => close(st, false));
  }
  document.addEventListener('pointerdown', e => { for (const st of roots.values()) if (st.open && !st.open.contains(e.target)) close(st, false); }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    for (const st of roots.values()) if (st.open) { const inside = st.open.contains(document.activeElement) || document.activeElement === document.body; close(st, inside); }
  });
  document.addEventListener('focusin', e => { for (const st of roots.values()) if (st.open && !st.open.contains(e.target)) close(st, false); });
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) { clearTimeout(st.leave); st.open = null; roots.delete(root); }
    for (const root of document.querySelectorAll('[data-pch]')) {
      if (roots.has(root) || !['hsp2', 'hss', 'stl'].includes(root.dataset.pch)) continue;
      const st = {root, open: null, leave: 0, listeners: 0, hoverOpened: 0};
      bindHotspots(st);
      roots.set(root, st);
    }
  }
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches('[data-pch]') || n.querySelector('[data-pch]'))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  let wasDesktop = desktop.matches;
  desktop.addEventListener('change', () => { if (desktop.matches === wasDesktop) return; wasDesktop = desktop.matches; for (const st of roots.values()) if (st.open) close(st, false); });
  window.MateriaProductsC = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
