/* Materia Themes. Text Columns on the storefront: the phone swipe row's
   arrows and arrow keys (the row is a native scroller). Sticky Heading Text
   needs no script. The builder loads live-r7-text.js instead (the same plus
   live paint), so this file stands down there. */
(() => {
  if (window.MateriaR7TextRuntime || window.MateriaLiveR7Text || (window.SlTheme && window.SlTheme.designMode)) return;
  const SEL = '[data-r7t="text-columns"]';
  const roots = new Map();
  const attr = (el, name, v) => { if (el && el.getAttribute(name) !== String(v)) el.setAttribute(name, v); };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* ------------------------------------------------------------ the swipe row */
  function scroller(root, state) {
    const track = root.querySelector('[data-r7t-track]'), nav = root.querySelector('[data-r7t-nav]'), prev = root.querySelector('[data-r7t-prev]'), next = root.querySelector('[data-r7t-next]');
    if (!track) return;
    const signal = state.abort.signal;
    const rtl = () => getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    /* One column and the space after it. */
    const step = () => { const cols = track.querySelectorAll(':scope > [data-r7t-block]'); return cols.length > 1 ? Math.abs(cols[1].offsetLeft - cols[0].offsetLeft) : track.clientWidth; };
    const move = dir => track.scrollBy({left: dir * rtl() * step(), behavior: reduced.matches ? 'auto' : 'smooth'});
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!track.isConnected) return;
      const max = track.scrollWidth - track.clientWidth, x = Math.abs(track.scrollLeft), slides = max > 2;
      /* Arrows that are not shown (a desktop, stacked columns, Show arrows off) stay as they were drawn. */
      const shown = !!nav && nav.getClientRects().length > 0;
      const atStart = !shown || !slides || x <= 2, atEnd = shown && (!slides || x >= max - 2);
      /* An arrow about to switch off hands the keyboard to the other one. */
      if (shown && prev && next) {
        if (atEnd && !atStart && document.activeElement === next) prev.disabled = false, prev.focus({preventScroll: true});
        if (atStart && !atEnd && document.activeElement === prev) next.disabled = false, next.focus({preventScroll: true});
      }
      if (prev && prev.disabled !== atStart) prev.disabled = atStart;
      if (next && next.disabled !== atEnd) next.disabled = atEnd;
      /* The row takes the keyboard only while it really scrolls (a phone with Swipe on). */
      if (slides) { attr(track, 'tabindex', '0'); attr(track, 'role', 'group'); const name = root.querySelector('[data-r7t-type="heading"]')?.textContent.trim(); if (name) attr(track, 'aria-label', name); }
      else for (const n of ['tabindex', 'role', 'aria-label']) if (track.hasAttribute(n)) track.removeAttribute(n);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(measure); };
    state.measure = queue;
    state.stop = () => cancelAnimationFrame(frame);
    track.addEventListener('scroll', queue, {passive: true, signal});
    track.addEventListener('keydown', event => {
      if (event.target !== track || event.altKey || event.ctrlKey || event.metaKey) return;
      const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!dir || track.scrollWidth - track.clientWidth <= 2) return;
      event.preventDefault(); move(dir * rtl());
    }, {signal});
    prev?.addEventListener('click', () => move(-1), {signal});
    next?.addEventListener('click', () => move(1), {signal});
    state.resize = new ResizeObserver(queue);
    state.resize.observe(track);
    queue();
  }

  function drop(root, state) {
    state.abort.abort(); state.resize?.disconnect(); state.stop?.(); roots.delete(root);
  }
  function scan() {
    for (const [root, state] of roots) if (!root.isConnected) drop(root, state);
    document.querySelectorAll(SEL).forEach(root => {
      if (roots.has(root)) return;
      const state = {abort: new AbortController()};
      roots.set(root, state);
      scroller(root, state);
    });
  }
  document.addEventListener('DOMContentLoaded', scan);
  document.addEventListener('shopify:section:load', scan);
  window.MateriaR7TextRuntime = {scan, count: () => roots.size};
  scan();
})();
