/* Materia Themes. Press Mentions on the storefront: on a phone the cards can
   be a native scroller; this adds the arrow keys and makes it a tab stop
   only while it scrolls. Logo Wall needs no script. The builder loads
   live-r7-trust.js instead (the same plus live edits), so this file stands
   down there. */
(() => {
  if (window.MateriaR7TrustRuntime || window.MateriaR7Trust || (window.Shopify && window.Shopify.designMode)) return;
  const SEL = '[data-r7g="press-mentions"]';
  const roots = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- the swiped row of cards (Press Mentions on a phone) ---------- */
  function scroller(st) {
    const root = st.root, track = root.querySelector('[data-r7g-track]');
    if (!track) return;
    const sig = {signal: st.ac.signal};
    const rtl = () => getComputedStyle(track).direction === 'rtl';
    const smooth = () => reduced.matches ? 'auto' : 'smooth';
    const over = () => getComputedStyle(track).overflowX === 'auto' && track.scrollWidth - track.clientWidth > 1;
    const step = () => { const it = track.querySelector('.pm__item'); return it ? it.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : track.clientWidth; };
    const measure = () => {
      st.queued = 0;
      if (!track.isConnected) return;
      /* A row that scrolls can take the keyboard itself; a list or grid that fits is not a tab stop. */
      const o = over();
      if (o !== track.hasAttribute('tabindex')) { if (o) { track.setAttribute('tabindex', '0'); track.setAttribute('aria-label', root.querySelector('.pm__heading:not([hidden])')?.textContent.trim() || 'Press mentions'); } else { track.removeAttribute('tabindex'); track.removeAttribute('aria-label'); } }
    };
    st.measure = () => { if (!st.queued) st.queued = requestAnimationFrame(measure); };
    if ('ResizeObserver' in window) { st.ro = new ResizeObserver(st.measure); st.ro.observe(track); }
    track.addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir || !over()) return;
      e.preventDefault();
      track.scrollBy({left: step() * dir * (rtl() ? -1 : 1), behavior: smooth()});
      /* Focus on a card moves with the row. */
      const a = e.target.closest ? e.target.closest('a.pm__link[href]') : null;
      if (a) { const all = [...track.querySelectorAll('a.pm__link[href]')], n = all[all.indexOf(a) + dir]; if (n) n.focus({preventScroll: true}); }
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
  window.MateriaR7TrustRuntime = {scan, roots, count: () => roots.size};
  scan();
})();
