/* Materia Themes. The galleries-a Image and video sections on the
   storefront: videos (data-mga-video) play only while on screen, the tab is
   visible and reduced motion is not asked for; Gallery Interactive 2's
   items open on a click and move focus with the arrow keys, Home and End.
   The builder loads media-live-galleries-a.js instead (the same plus live
   edits), so this file stands down there. */
(() => {
  if (window.MateriaGalleriesARuntime || window.MateriaGalleriesA || (window.SlTheme && window.SlTheme.designMode)) return;
  const roots = new Map();
  const TYPES = ['gallery-basic2', 'gallery-grid1', 'gallery-interactive', 'gallery-simple3'];
  function videos(root, state) {
    const play = state.visible && !document.hidden && !state.reduced.matches;
    for (const v of root.querySelectorAll('video[data-mga-video]')) {
      v.autoplay = !state.reduced.matches;
      if (v.hidden || !v.getAttribute('src')) continue;
      if (play && v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      else if (!play && !v.paused) v.pause();
    }
  }
  function interactive(root, state) {
        const items = () => [...root.querySelectorAll('[data-mga-item]')];
        const activate = item => { for (const it of items()) { const on = it === item && it.getAttribute('aria-expanded') !== 'true'; it.classList.toggle('is-active', on); it.setAttribute('aria-expanded', String(on)); } };
        state.on(root, 'click', e => { const item = e.target.closest('[data-mga-item]'); if (item && root.contains(item)) activate(item); });
        state.on(root, 'keydown', e => {
          const item = e.target.closest('[data-mga-item]'); if (!item || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          const list = items(), i = list.indexOf(item), rtl = getComputedStyle(item).direction === 'rtl';
          const step = e.key === 'Home' ? -i : e.key === 'End' ? list.length - 1 - i : (e.key === 'ArrowRight') !== rtl ? 1 : -1;
          const next = list[Math.max(0, Math.min(list.length - 1, i + step))]; if (next && next !== item) { e.preventDefault(); next.focus(); }
        });
  }

  function add(root) {
    const type = root.dataset.mgaType; if (!TYPES.includes(type)) return;
    const state = {visible: true, reduced: matchMedia('(prefers-reduced-motion: reduce)'), off: []};
    state.schedule = () => { if (!state.frame) state.frame = requestAnimationFrame(() => { state.frame = 0; if (root.isConnected) videos(root, state); }); };
    state.on = (el, name, fn, opts) => { el.addEventListener(name, fn, opts); state.off.push(() => el.removeEventListener(name, fn, opts)); };
    state.on(state.reduced, 'change', state.schedule);
    if ('IntersectionObserver' in window) { state.io = new IntersectionObserver(entries => { const v = entries[entries.length - 1].isIntersecting; if (v !== state.visible) { state.visible = v; state.schedule(); } }); state.io.observe(root); }
    if (type === 'gallery-interactive') interactive(root, state);
    roots.set(root, state);
    state.schedule();
  }
  function remove(root, state) { cancelAnimationFrame(state.frame); state.io?.disconnect(); for (const off of state.off) off(); for (const v of root.querySelectorAll('video')) { try { v.pause(); } catch (_) {} } roots.delete(root); }
  function scan() {
    for (const [root, state] of roots) if (!root.isConnected) remove(root, state);
    for (const root of document.querySelectorAll('[data-mga-section]')) { if (roots.has(root)) roots.get(root).schedule(); else add(root); }
  }
  document.addEventListener('visibilitychange', () => { for (const state of roots.values()) state.schedule(); });
  for (const name of ['DOMContentLoaded', 'shopify:section:load', 'shopify:section:unload']) document.addEventListener(name, () => queueMicrotask(scan));
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches('[data-mga-section]') || n.querySelector('[data-mga-section]'))))) scan();
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaGalleriesARuntime = {scan, count: () => roots.size};
  scan();
})();
