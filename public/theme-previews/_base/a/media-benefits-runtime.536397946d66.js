/* Materia Themes. The benefits Image and video sections on the storefront
   (Image & Video with Text, Image & Video Benefits, Image With Text
   Benefits, Image & Text Dual): videos set to autoplay play only while on
   screen, the tab is visible and reduced motion is not asked for; the media
   carousel of Image With Text Benefits (drag, arrow keys, progress line).
   The builder loads media-live-benefits.js instead (the same plus live
   edits), so this file stands down there. */
(() => {
  if (window.MateriaMediaBenefitsRuntime || window.MateriaMediaBenefits || (window.SlTheme && window.SlTheme.designMode)) return;
  const SEL = '[data-mlb-root]';
  const BP = {'image-and-video-text': 900, 'image-text-benefits': 768, 'image-with-text-benefits': 900, 'dual-image-with-text': 900};
  const roots = new Map();
  function videos(root, st) {
    const stop = st.reduced.matches || document.hidden || !st.visible;
    for (const holder of root.querySelectorAll('[data-mlb-media]')) {
      const v = holder.querySelector('video'); if (!v) continue;
      const auto = holder.dataset.autoplay === 'true';
      if (auto && !stop) { v.muted = v.muted || v.hasAttribute('muted'); const p = v.play && v.play(); if (p && p.catch) p.catch(() => {}); }
      else if (!v.paused || v.autoplay) { v.autoplay = false; v.removeAttribute('autoplay'); try { v.pause(); } catch (_) {} if (auto && st.reduced.matches) v.controls = true; }
    }
  }
  function carousel(root, st) {
    const grid = root.querySelector('.iwb__media-grid'); if (!grid || st.carousel === grid) return;
    st.carousel = grid;
    if (st.carouselAbort) st.carouselAbort.abort();
    const ac = new AbortController(), sig = {signal: ac.signal}; st.carouselAbort = ac;
    const on = () => grid.dataset.layout === 'carousel';
    const update = () => {
      const bar = root.querySelector('.iwb__progress'), fill = bar && bar.querySelector('.iwb__progress-fill'); if (!fill || !on()) return;
      const max = grid.scrollWidth - grid.clientWidth, pct = max <= 0 ? 100 : Math.max(0, Math.min(100, grid.scrollLeft / max * 100));
      fill.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    };
    let tick = 0, down = null, moved = false;
    grid.addEventListener('scroll', () => { if (!tick) tick = requestAnimationFrame(() => { tick = 0; update(); }); }, {passive: true, ...sig});
    grid.addEventListener('pointerdown', e => { if (!on() || e.pointerType !== 'mouse' || e.button !== 0) return; down = {x: e.clientX, left: grid.scrollLeft}; moved = false; }, sig);
    window.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - down.x; if (!moved && Math.abs(dx) < 5) return; if (!moved) { moved = true; grid.classList.add('iwb--dragging'); } e.preventDefault(); grid.scrollLeft = down.left - dx; }, {passive: false, ...sig});
    const up = () => { if (!down) return; down = null; if (moved) { grid.classList.remove('iwb--dragging'); grid.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, {capture: true, once: true}); } };
    window.addEventListener('pointerup', up, sig); window.addEventListener('blur', up, sig);
    grid.addEventListener('dragstart', e => { if (on()) e.preventDefault(); }, sig);
    grid.addEventListener('keydown', e => {
      if (!on() || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const slot = grid.querySelector('.iwb__slot'); if (!slot) return;
      e.preventDefault(); grid.scrollBy({left: (e.key === 'ArrowLeft' ? -1 : 1) * (slot.offsetWidth + (parseFloat(getComputedStyle(grid).columnGap) || 0)), behavior: st.reduced.matches ? 'auto' : 'smooth'});
    }, sig);
    st.update = update; update();
  }
  function paint(root, st) {
    const grid = root.querySelector('.iwb__media-grid');
    if (grid) { grid.tabIndex = grid.dataset.layout === 'carousel' ? 0 : -1; if (grid.dataset.layout !== 'carousel') grid.removeAttribute('tabindex'); }
    videos(root, st);
    if (st.update) st.update();
  }
  function drop(root, st) {
    st.io.disconnect(); st.mq.removeEventListener('change', st.schedule); st.reduced.removeEventListener('change', st.schedule);
    cancelAnimationFrame(st.frame); if (st.carouselAbort) st.carouselAbort.abort(); roots.delete(root);
  }
  function add(root) {
    const bp = BP[root.dataset.mlbRoot]; if (!bp) return;
    const st = {root, visible: true, mq: matchMedia('(min-width: ' + bp + 'px)'), reduced: matchMedia('(prefers-reduced-motion: reduce)')};
    st.schedule = () => { if (!st.frame) st.frame = requestAnimationFrame(() => { st.frame = 0; if (root.isConnected) paint(root, st); }); };
    st.mq.addEventListener('change', st.schedule); st.reduced.addEventListener('change', st.schedule);
    st.io = new IntersectionObserver(es => { for (const e of es) st.visible = e.isIntersecting; videos(root, st); });
    st.io.observe(root);
    roots.set(root, st);
    carousel(root, st);
    st.schedule();
    root.dataset.mlbReady = '';
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) { const st = roots.get(root); if (st) st.schedule(); else add(root); }
  }
  document.addEventListener('visibilitychange', () => { for (const [root, st] of roots) videos(root, st); });
  for (const name of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(name, scan);
  const watched = n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL));
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(watched))) scan();
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaMediaBenefitsRuntime = {scan, roots};
  scan();
})();
