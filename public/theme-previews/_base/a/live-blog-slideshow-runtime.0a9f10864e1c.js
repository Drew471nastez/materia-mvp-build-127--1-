/* Materia Themes. Blog posts (sections/blog-posts) on the storefront: the
   carousel's autoplay (global.js's <slide-section>) runs only while it is on
   screen, the tab is shown and motion is allowed. The Slideshow needs nothing
   here (its own script and global.js run it). The theme editor loads
   live-blog-slideshow.js instead (the same plus live setting edits). */
(() => {
  if (window.MateriaBlogSlideshow) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const BP = new Map();
  const allowed = (slider, st) => slider.dataset.autoplay === 'true' && !reduced.matches && !document.hidden && st.inView;
  function autoplay(root, st) {
    const slider = root.querySelector('[data-bp-slider]'), sw = slider?.globalSlide;
    if (!sw || sw.destroyed || !sw.autoplay) return;
    if (reduced.matches && sw.params.speed !== 0) sw.params.speed = 0;
    if (st.wired !== sw) { st.wired = sw; sw.on('autoplayStart', () => { if (!allowed(slider, st)) sw.autoplay.stop(); }); }
    if (!allowed(slider, st)) { if (sw.autoplay.running) sw.autoplay.stop(); }
    else if (sw.params.autoplay?.enabled && !sw.autoplay.running) sw.autoplay.start();
  }
  function init(root) {
    if (BP.has(root)) return;
    const st = {inView: false};
    BP.set(root, st);
    const slider = root.querySelector('[data-bp-slider]');
    if (!slider) return;
    new IntersectionObserver(entries => { st.inView = entries[entries.length - 1].isIntersecting; autoplay(root, st); }, {threshold: 0.15}).observe(slider);
    /* The carousel is built when it comes near the screen (global.js); its autoplay is held to these rules once it is. */
    new MutationObserver(() => { const sw = slider.globalSlide; if (sw && st.wired !== sw) autoplay(root, st); }).observe(slider, {attributes: true, attributeFilter: ['class']});
  }
  function scan() {
    for (const root of BP.keys()) if (!root.isConnected) BP.delete(root);
    document.querySelectorAll('[data-bp-root]').forEach(init);
  }
  const refresh = () => { for (const [root, st] of BP) autoplay(root, st); };
  reduced.addEventListener?.('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('[data-bp-root]') || n.querySelector('[data-bp-root]'))))) scan(); })
    .observe(document.documentElement, {childList: true, subtree: true});
  window.MateriaBlogSlideshow = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
