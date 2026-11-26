/* Materia Themes. Social Shop Grid on the storefront: tile videos play only
   while on screen and the tab is shown, never under reduced motion. The other
   Social and Dividers sections need no script on the storefront. The theme
   editor loads live-social-dividers.js instead (the same plus live edits). */
(() => {
  if (window.MateriaSocialDividers) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet();
  function init(root) {
    if (seen.has(root)) return; seen.add(root);
    const vids = () => [...root.querySelectorAll('video[data-ssg-video]')];
    const sync = () => { for (const v of vids()) { const go = !reduced.matches && v.__sdOn && !document.hidden; if (go && v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else if (!go && !v.paused) v.pause(); } };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { for (const e of es) e.target.__sdOn = e.isIntersecting; sync(); }, {threshold: 0.15});
      for (const v of vids()) io.observe(v);
    }
    reduced.addEventListener('change', sync); document.addEventListener('visibilitychange', sync);
    root.dataset.sdReady = '';
  }
  const scan = () => document.querySelectorAll('[data-sd-root="social-shop-grid"]').forEach(init);
  document.addEventListener('shopify:section:load', scan);
  window.MateriaSocialDividers = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
