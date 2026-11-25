/* Materia Themes. Follow Us (social-follow-cta) on the storefront: the
   picture row's arrows and arrow keys (the row is a native scroller). The
   sign-up of Newsletter Split is sent by materia-forms.js. The builder loads
   live-r7-connect.js instead (the same plus live edits), so this file stands
   down there. */
(() => {
  if (window.MateriaR7ConnectRuntime || window.MateriaR7Connect || (window.SlTheme && window.SlTheme.designMode)) return;
  const SEL = '[data-r7n]';
  const roots = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rtl = el => getComputedStyle(el).direction === 'rtl';
  function step(track) {
    const tile = track.querySelector('[data-r7n-tile]');
    if (!tile) return track.clientWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return tile.getBoundingClientRect().width + gap;
  }
  function arrows(root) {
    const track = root.querySelector('[data-r7n-track]'); if (!track) return;
    const prev = root.querySelector('[data-r7n-prev]'), next = root.querySelector('[data-r7n-next]');
    const max = track.scrollWidth - track.clientWidth, at = Math.abs(track.scrollLeft);
    const start = at <= 1, end = max <= 1 || at >= max - 1;
    if (prev && prev.disabled !== start) prev.disabled = start;
    if (next && next.disabled !== end) next.disabled = end;
  }
  function move(root, dir) {
    const track = root.querySelector('[data-r7n-track]'); if (!track) return;
    track.scrollBy({left: dir * step(track) * (rtl(track) ? -1 : 1), behavior: reduced.matches ? 'auto' : 'smooth'});
  }
  function bindTrack(root, st) {
    const track = root.querySelector('[data-r7n-track]');
    if (st.track === track) return;
    if (st.ac) st.ac.abort();
    if (st.ro) st.ro.disconnect();
    st.track = track; st.ac = null; st.ro = null;
    if (!track) return;
    st.ac = new AbortController();
    let frame = 0;
    track.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; arrows(root); }); }, {passive: true, signal: st.ac.signal});
    if (window.ResizeObserver) { st.ro = new ResizeObserver(() => arrows(root)); st.ro.observe(track); }
    arrows(root);
  }
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-r7n-prev], [data-r7n-next]'); if (!b || b.disabled) return;
    const root = b.closest(SEL); if (root) move(root, b.hasAttribute('data-r7n-prev') ? -1 : 1);
  });
  document.addEventListener('keydown', e => {
    const track = e.target && e.target.matches && e.target.matches('[data-r7n-track]') ? e.target : null; if (!track) return;
    const root = track.closest(SEL); if (!root || track.scrollWidth - track.clientWidth <= 1) return;
    const back = rtl(track) ? 'ArrowRight' : 'ArrowLeft', fwd = rtl(track) ? 'ArrowLeft' : 'ArrowRight';
    const behavior = reduced.matches ? 'auto' : 'smooth';
    if (e.key === back || e.key === fwd) { e.preventDefault(); move(root, e.key === fwd ? 1 : -1); }
    else if (e.key === 'Home') { e.preventDefault(); track.scrollTo({left: 0, behavior}); }
    else if (e.key === 'End') { e.preventDefault(); track.scrollTo({left: (rtl(track) ? -1 : 1) * track.scrollWidth, behavior}); }
  });
  function drop(root, st) {
    st.mq.removeEventListener('change', st.schedule);
    if (st.ac) st.ac.abort();
    if (st.ro) st.ro.disconnect();
    cancelAnimationFrame(st.frame); roots.delete(root);
  }
  function add(root) {
    const st = {root, mq: matchMedia('(min-width: 768px)'), frame: 0, track: undefined};
    st.schedule = () => { if (!st.frame) st.frame = requestAnimationFrame(() => { st.frame = 0; if (!root.isConnected) return; bindTrack(root, st); arrows(root); }); };
    st.mq.addEventListener('change', st.schedule);
    roots.set(root, st);
    bindTrack(root, st);
    root.dataset.r7nReady = '';
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) { const st = roots.get(root); if (st) st.schedule(); else add(root); }
  }
  for (const name of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(name, scan);
  const watched = n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL));
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(watched))) scan();
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaR7ConnectRuntime = {scan, roots, arrows, move};
  scan();
})();
