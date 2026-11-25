/* Materia Themes. Storefront behaviour of the comparison sections (features-b):
   the table scroller (mouse drag when it overflows, overflow state, scroll
   progress bar), once per root. The theme editor loads live-features-b.js
   instead (the same plus live setting edits). */
(() => {
  if (window.MateriaFeaturesB) return;
  const SEL = '[data-fb-root]';
  const roots = new Map();
  let listeners = 0;
  function scroller(st, sc) {
    const bar = st.el.querySelector('[data-fb-progress]');
    let raf = 0, drag = null;
    const update = () => {
      raf = 0;
      const max = sc.scrollWidth - sc.clientWidth, over = max > 1;
      sc.toggleAttribute('data-overflow', over);
      if (bar) { bar.toggleAttribute('data-overflow', over); bar.toggleAttribute('data-fit', !over); bar.style.setProperty('--fb-p', over ? String(Math.max(0, Math.min(1, Math.abs(sc.scrollLeft) / max))) : '0'); }
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
    const down = e => { if (e.pointerType === 'touch' || e.button !== 0 || sc.scrollWidth <= sc.clientWidth + 1) return; drag = {x: e.clientX, l: sc.scrollLeft, id: e.pointerId, moved: false}; };
    const move = e => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x; if (!drag.moved && Math.abs(dx) < 6) return; if (!drag.moved) { drag.moved = true; sc.setAttribute('data-dragging', ''); try { sc.setPointerCapture(e.pointerId); } catch (_) {} } sc.scrollLeft = drag.l - dx; };
    const up = e => { if (!drag) return; if (drag.moved) { try { sc.releasePointerCapture(e.pointerId); } catch (_) {} } drag = null; sc.removeAttribute('data-dragging'); };
    const nodrag = e => e.preventDefault();
    sc.addEventListener('scroll', queue, {passive: true});
    sc.addEventListener('pointerdown', down); sc.addEventListener('pointermove', move); sc.addEventListener('pointerup', up); sc.addEventListener('pointercancel', up); sc.addEventListener('dragstart', nodrag);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(queue) : null;
    if (ro) { ro.observe(sc); if (sc.firstElementChild) ro.observe(sc.firstElementChild); }
    listeners++;
    update();
    st.refresh.push(queue);
    st.cleanup.push(() => { listeners--; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); sc.removeEventListener('scroll', queue); sc.removeEventListener('pointerdown', down); sc.removeEventListener('pointermove', move); sc.removeEventListener('pointerup', up); sc.removeEventListener('pointercancel', up); sc.removeEventListener('dragstart', nodrag); });
  }
  function scan() {
    for (const st of [...roots.values()]) if (!st.el.isConnected) { for (const f of st.cleanup) f(); roots.delete(st.el); }
    for (const el of document.querySelectorAll(SEL)) if (!roots.has(el)) {
      const st = {el, cleanup: [], refresh: []};
      for (const sc of el.querySelectorAll('[data-fb-scroll]')) scroller(st, sc);
      roots.set(el, st);
    }
  }
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(recs => { if (recs.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) scan(); }).observe(document.documentElement, {childList: true, subtree: true});
  window.MateriaFeaturesB = {scan, runtime: true, count: () => ({roots: roots.size, scrollers: listeners})};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
