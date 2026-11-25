/* Materia Themes. Hero Split (hero-split-media) and Hero Collage
   (hero-collage) on the storefront: the Hero Split video plays only while on
   screen, the tab is visible and reduced motion is not asked for (a button
   pauses and plays it); the Hero Collage picture row's arrows and arrow keys.
   The builder loads live-r7-hero.js instead (the same plus live edits), so
   this file stands down there. */
(() => {
  if (window.MateriaR7HeroRuntime || window.MateriaR7Hero || (window.SlTheme && window.SlTheme.designMode)) return;
  const SEL = '[data-r7h]';
  const roots = new Map();
  /* ---------- behaviour: the video of a Hero Split ---------- */
  function video(root, st) {
    const el = root.querySelector('[data-r7h-video]'), btn = root.querySelector('[data-r7h-video-toggle]');
    if (!el) return;
    const signal = st.ac.signal, reduce = matchMedia('(prefers-reduced-motion: reduce)');
    /* user: null until the visitor presses the button, then true (play) or false (pause) */
    const state = {seen: false, user: null};
    const wanted = () => state.seen && !document.hidden && (state.user === null ? !reduce.matches : state.user);
    const sync = () => {
      const has = el.hasAttribute('src');
      if (el.hidden === has) el.hidden = !has;
      if (btn && btn.hidden === has) btn.hidden = !has;
      const play = has && wanted();
      if (play && el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
      else if (!play && !el.paused) el.pause();
      if (btn) { const on = String(has && (state.user === null ? !reduce.matches : state.user)); if (btn.getAttribute('aria-pressed') !== on) btn.setAttribute('aria-pressed', on); }
    };
    st.media = {sync};
    if ('IntersectionObserver' in window) {
      st.io = new IntersectionObserver(entries => { state.seen = entries[entries.length - 1].isIntersecting; sync(); }, {threshold: 0.2});
      st.io.observe(el.parentElement);
    } else state.seen = true;
    document.addEventListener('visibilitychange', sync, {signal});
    reduce.addEventListener('change', sync, {signal});
    if (btn) btn.addEventListener('click', () => { state.user = btn.getAttribute('aria-pressed') !== 'true'; sync(); }, {signal});
    sync();
  }

  /* ---------- behaviour: the picture row of a Hero Collage ---------- */
  function scroller(root, st) {
    const track = root.querySelector('[data-r7h-track]'), prev = root.querySelector('[data-r7h-prev]'), next = root.querySelector('[data-r7h-next]');
    if (!track) return;
    const signal = st.ac.signal, reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!root.isConnected) return;
      const max = track.scrollWidth - track.clientWidth, x = Math.abs(track.scrollLeft), can = max > 1;
      /* a row that does not scroll (desktop, where the arrows are not shown) keeps the arrows as they were printed */
      const atStart = !can || x <= 1, atEnd = can && x >= max - 1;
      if (prev && prev.disabled !== atStart) prev.disabled = atStart;
      if (next && next.disabled !== atEnd) next.disabled = atEnd;
      /* the keyboard reaches the row only while it scrolls */
      if (can) { if (track.getAttribute('tabindex') !== '0') track.setAttribute('tabindex', '0'); } else if (track.hasAttribute('tabindex')) track.removeAttribute('tabindex');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    st.stop = () => cancelAnimationFrame(frame);
    const step = () => { const tile = track.querySelector('.hcl__tile'), cs = getComputedStyle(track); return tile ? tile.getBoundingClientRect().width + (parseFloat(cs.columnGap) || 0) : track.clientWidth; };
    const move = by => track.scrollBy({left: by * step(), behavior: reduce.matches ? 'auto' : 'smooth'});
    const forward = () => getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    track.addEventListener('scroll', schedule, {passive: true, signal});
    if (prev) prev.addEventListener('click', () => move(-forward()), {signal});
    if (next) next.addEventListener('click', () => move(forward()), {signal});
    track.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (track.scrollWidth - track.clientWidth <= 1) return;
      e.preventDefault();
      move(e.key === 'ArrowRight' ? 1 : -1);
    }, {signal});
    if ('ResizeObserver' in window) { st.ro = new ResizeObserver(schedule); st.ro.observe(track); }
    schedule();
  }

  const BEHAVE = {split: video, collage: scroller};

  function drop(root, st) {
    st.ac.abort();
    if (st.io) st.io.disconnect();
    if (st.ro) st.ro.disconnect();
    if (st.stop) st.stop();
    roots.delete(root);
  }
  function add(root) {
    const behave = BEHAVE[root.dataset.r7h];
    if (!behave) return;
    const st = {root, ac: new AbortController()};
    roots.set(root, st);
    behave(root, st);
    root.dataset.r7hReady = '';
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) add(root);
  }
  for (const name of ['DOMContentLoaded', 'shopify:section:load', 'shopify:section:unload']) document.addEventListener(name, () => (name === 'shopify:section:unload' ? requestAnimationFrame(scan) : scan()));
  window.MateriaR7HeroRuntime = {roots, scan};
  Promise.resolve().then(scan);
})();
