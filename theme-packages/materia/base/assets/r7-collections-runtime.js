/* Materia Themes. Collection Circles on the storefront: the row's arrows and
   arrow keys (the row itself is a native scroller). Collection Mosaic needs
   no script. The builder loads live-r7-collections.js instead, which does
   the same plus live edits, so this file stands down there. */
(() => {
  if (window.MateriaR7CollectionsRuntime || window.MateriaR7Collections || (window.Shopify && window.Shopify.designMode)) return;
  const SEL = '[data-r7c="collection-circles"]';
  const roots = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function scroller(st) {
    const root = st.root, track = root.querySelector('[data-r7c-track]');
    if (!track) return;
    const prev = root.querySelector('[data-r7c-prev]'), next = root.querySelector('[data-r7c-next]'), sig = {signal: st.ac.signal};
    const rtl = () => getComputedStyle(track).direction === 'rtl';
    const smooth = () => reduced.matches ? 'auto' : 'smooth';
    const step = () => { const it = track.querySelector('.cc__item'); return it ? it.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : track.clientWidth; };
    const measure = () => {
      st.queued = 0;
      if (!track.isConnected) return;
      const max = track.scrollWidth - track.clientWidth, x = Math.abs(track.scrollLeft), over = max > 1, show = over && root.dataset.arrows !== 'false';
      for (const [b, end] of [[prev, x <= 1], [next, x >= max - 1]]) {
        if (!b) continue;
        if (b.hidden !== !show) b.hidden = !show;
        if (b.disabled !== (!show || end)) b.disabled = !show || end;
      }
      /* A row that scrolls can take the keyboard itself; one that fits is not a tab stop. */
      if (over !== track.hasAttribute('tabindex')) { if (over) track.setAttribute('tabindex', '0'); else track.removeAttribute('tabindex'); }
    };
    st.measure = () => { if (!st.queued) st.queued = requestAnimationFrame(measure); };
    track.addEventListener('scroll', st.measure, {passive: true, signal: st.ac.signal});
    if ('ResizeObserver' in window) { st.ro = new ResizeObserver(st.measure); st.ro.observe(track); }
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-r7c-prev], [data-r7c-next]');
      if (!b || !root.contains(b) || b.disabled) return;
      const s = step(), edge = parseFloat(getComputedStyle(track).paddingInlineStart) || 0;
      const page = Math.max(s, Math.floor((track.clientWidth - edge * 2) / s) * s);
      track.scrollBy({left: page * (b === next ? 1 : -1) * (rtl() ? -1 : 1), behavior: smooth()});
    }, sig);
    track.addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir || track.scrollWidth - track.clientWidth <= 1) return;
      e.preventDefault();
      track.scrollBy({left: step() * dir, behavior: smooth()});
      /* Focus on a circle moves with the row. */
      const link = e.target.closest ? e.target.closest('a.cc__link') : null;
      if (link) { const all = [...track.querySelectorAll('a.cc__link')], n = all[all.indexOf(link) + dir * (rtl() ? -1 : 1)]; if (n) n.focus({preventScroll: true}); }
    }, sig);
    st.measure();
  }
  function setup(root) {
    const st = {root, ac: new AbortController(), queued: 0};
    roots.set(root, st);
    scroller(st);
  }
  function drop(root) {
    const st = roots.get(root);
    if (!st) return;
    st.ac.abort();
    if (st.ro) st.ro.disconnect();
    if (st.queued) cancelAnimationFrame(st.queued);
    roots.delete(root);
  }
  function scan() {
    for (const root of [...roots.keys()]) if (!root.isConnected) drop(root);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) setup(root);
  }
  let scanFrame = 0;
  const touches = n => n.nodeType === 1 && (n.matches(SEL) || !!n.querySelector(SEL));
  new MutationObserver(records => {
    if (scanFrame) return;
    if (!records.some(r => [...r.addedNodes].some(touches) || (roots.size > 0 && [...r.removedNodes].some(touches)))) return;
    scanFrame = requestAnimationFrame(() => { scanFrame = 0; scan(); });
  }).observe(document.documentElement, {childList: true, subtree: true});
  for (const n of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(n, scan);
  window.MateriaR7CollectionsRuntime = {scan, roots};
  scan();
})();
