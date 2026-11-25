/* Materia Themes. The galleries-b Image and video sections on the
   storefront: Gallery Simple 5 (gallerysimple2) mobile carousel buttons, and
   Gallery Scrolling Logos (images-carousel) marquee: paused off screen and
   in a hidden tab (data-offscreen), and its pause button. The copies of the
   marquee are printed by the section. Image 2 and Gallery Simple 4 need no
   script. The builder loads media-live-galleries-b.js instead (the same
   plus live edits), so this file stands down there. */
(() => {
  if (window.MateriaGalleriesBRuntime || window.MateriaGalleriesB || (window.Shopify && window.Shopify.designMode)) return;
  const roots = new Map();
  const attr = (el, k, v) => { if (!el) return; if (v == null || v === false) { if (el.hasAttribute(k)) el.removeAttribute(k); } else if (el.getAttribute(k) !== String(v)) el.setAttribute(k, v); };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function gs2Init(root, st) {
    const list = () => root.querySelector('[data-mgb-track]');
    st.onClick = e => {
      const btn = e.target.closest('[data-mgb-prev],[data-mgb-next]'); if (!btn || !root.contains(btn)) return;
      const l = list(); if (!l) return;
      const w = l.clientWidth || 1, max = l.scrollWidth - w, next = btn.hasAttribute('data-mgb-next');
      let to = Math.round(l.scrollLeft / w) * w + (next ? w : -w);
      if (to > max + 1) to = 0; else if (to < -1) to = max;
      l.scrollTo({left: to, behavior: reduced.matches ? 'auto' : 'smooth'});
    };
    root.addEventListener('click', st.onClick);
    st.cleanup.push(() => root.removeEventListener('click', st.onClick));
  }
  function marquee(root, st) {
    attr(root, 'data-offscreen', st.offscreen || document.hidden ? 'true' : 'false');
  }
  function marqueeInit(root, st) {
    st.offscreen = false;
    if ('IntersectionObserver' in window) {
      st.io = new IntersectionObserver(entries => { for (const e of entries) st.offscreen = !e.isIntersecting; st.schedule(); }, {rootMargin: '100px 0px'});
      st.io.observe(root);
      st.cleanup.push(() => st.io.disconnect());
    }
    st.onClick = e => {
      const btn = e.target.closest('[data-mq-pause]'); if (!btn || !root.contains(btn)) return;
      const paused = root.dataset.paused !== 'true';
      attr(root, 'data-paused', paused ? 'true' : null);
      attr(btn, 'aria-pressed', String(paused)); attr(btn, 'aria-label', paused ? 'Play scrolling' : 'Pause scrolling');
    };
    root.addEventListener('click', st.onClick);
    st.cleanup.push(() => root.removeEventListener('click', st.onClick));
  }
  const painters = {gallerysimple2: [null, gs2Init], 'images-carousel': [marquee, marqueeInit]};

  function create(root) {
    const st = {root, cleanup: [], frame: 0};
    const paint = painters[root.dataset.mgb][0];
    st.schedule = () => { if (paint && !st.frame) st.frame = requestAnimationFrame(() => { st.frame = 0; if (root.isConnected) paint(root, st); }); };
    painters[root.dataset.mgb][1](root, st);
    return st;
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) { cancelAnimationFrame(st.frame); st.cleanup.forEach(f => f()); roots.delete(root); }
    for (const root of document.querySelectorAll('[data-mgb]')) {
      if (!painters[root.dataset.mgb] || roots.has(root)) continue;
      const st = create(root); roots.set(root, st); st.schedule();
    }
  }
  document.addEventListener('visibilitychange', () => { for (const st of roots.values()) st.schedule(); });
  for (const name of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(name, scan);
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches('[data-mgb]') || n.querySelector('[data-mgb]'))))) scan();
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaGalleriesBRuntime = {scan, roots};
  scan();
})();
