/* Materia Themes. Scrolling Text on the storefront: the row stops moving
   while it is off screen (200px margin) or the tab is hidden
   (data-lt-offscreen). Inline Image Heading and Quote Banner need no script.
   The theme editor loads live-text.js instead (the same plus live edits). */
(() => {
  if (window.MateriaLiveText) return;
  const roots = new Map();
  const flag = (root, st) => root.toggleAttribute('data-lt-offscreen', !st.near || document.hidden);
  function scan() {
    for (const root of roots.keys()) if (!root.isConnected) { roots.get(root).io.disconnect(); roots.delete(root); }
    document.querySelectorAll('[data-live-text="scrolling-text"]').forEach(root => {
      if (roots.has(root)) return;
      const st = {near: true};
      st.io = new IntersectionObserver(entries => { const near = entries.at(-1).isIntersecting; if (near !== st.near) { st.near = near; flag(root, st); } }, {rootMargin: '200px 0px'});
      st.io.observe(root);
      roots.set(root, st);
    });
  }
  document.addEventListener('visibilitychange', () => { for (const [root, st] of roots) flag(root, st); });
  document.addEventListener('shopify:section:load', scan);
  window.MateriaLiveText = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
