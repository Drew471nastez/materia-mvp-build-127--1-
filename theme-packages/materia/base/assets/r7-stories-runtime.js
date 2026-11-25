/* Materia Themes. Card Slideshow (slideshow-cards) on the storefront: the
   row's arrows, dots, arrow keys and autoplay (the row is a native
   scroller). Blog Spotlight needs no script. The builder loads
   live-r7-stories.js instead (the same plus live edits), so this file
   stands down there. */
(() => {
  if (window.MateriaR7StoriesRuntime || window.MateriaR7Stories || (window.Shopify && window.Shopify.designMode)) return;
  const SEL = '[data-r7s="slideshow-cards"]';
  const roots = new Map();
  const num = v => v !== '' && v != null && v !== false && v !== true && Number.isFinite(+v) ? +v : null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Card Slideshow: the row, arrows, dots, keys and autoplay ---------- */
  function slider(st) {
    const root = st.root, track = root.querySelector('[data-r7s-track]');
    if (!track) return;
    st.track = track;
    const sig = {signal: st.ac.signal}, passive = {passive: true, signal: st.ac.signal};
    const prev = () => root.querySelector('[data-r7s-prev]'), next = () => root.querySelector('[data-r7s-next]');
    const smooth = () => reduced.matches ? 'auto' : 'smooth';
    const max = () => Math.max(0, track.scrollWidth - track.clientWidth);
    /* Where the row can rest: each card's start, the last ones folded into the end of the row. */
    const stops = () => {
      const m = max(), box = track.getBoundingClientRect(), edge = parseFloat(getComputedStyle(track).paddingInlineStart) || 0, x = track.scrollLeft, out = [];
      for (const it of track.querySelectorAll(':scope > .sc__card')) {
        const p = Math.round(Math.min(m, Math.max(0, it.getBoundingClientRect().left - box.left + x - edge)));
        if (!out.length || p > out[out.length - 1] + 1) out.push(p);
      }
      return out.length ? out : [0];
    };
    const nearest = (list, x) => list.reduce((b, p, i) => Math.abs(p - x) < Math.abs(list[b] - x) ? i : b, 0);
    const go = left => { track.scrollTo({left, behavior: smooth()}); };
    const step = dir => { const list = stops(), x = track.scrollLeft; const to = dir > 0 ? list.find(p => p > x + 2) : [...list].reverse().find(p => p < x - 2); if (to != null) go(to); return to != null; };
    const measure = () => {
      st.queued = 0;
      if (!track.isConnected) return;
      const m = max(), x = track.scrollLeft, over = m > 1, list = stops();
      if (root.getAttribute('data-over') !== String(over)) root.setAttribute('data-over', String(over));
      const p = prev(), n = next();
      if (p && p.disabled !== (!over || x <= 1)) p.disabled = !over || x <= 1;
      if (n && n.disabled !== (!over || x >= m - 1)) n.disabled = !over || x >= m - 1;
      /* A row that scrolls takes the keyboard itself; one that fits is not a tab stop. */
      if (over !== track.hasAttribute('tabindex')) { if (over) track.setAttribute('tabindex', '0'); else track.removeAttribute('tabindex'); }
      const at = x >= m - 1 && over ? list.length - 1 : nearest(list, x);
      const dots = root.querySelectorAll('[data-r7s-dot]');
      dots.forEach((d, i) => {
        const hide = list.length < 2 || i >= list.length;
        if (d.hidden !== hide) d.hidden = hide;
        const cur = String(i === at);
        if (d.getAttribute('aria-current') !== cur) d.setAttribute('aria-current', cur);
      });
      arm();
    };
    st.after = st.measure = () => { if (!st.queued) st.queued = requestAnimationFrame(measure); };
    track.addEventListener('scroll', st.measure, passive);
    if ('ResizeObserver' in window) { st.ro = new ResizeObserver(st.measure); st.ro.observe(track); }
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-r7s-prev], [data-r7s-next], [data-r7s-dot]');
      if (!b || !root.contains(b) || b.disabled) return;
      if (b.hasAttribute('data-r7s-dot')) { const list = stops(), i = Math.min(+b.getAttribute('data-r7s-dot') || 0, list.length - 1); go(list[i]); }
      else step(b.hasAttribute('data-r7s-next') ? 1 : -1);
    }, sig);
    track.addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.target !== track) return;
      const rtl = getComputedStyle(track).direction === 'rtl';
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir || max() <= 1) return;
      e.preventDefault();
      step(rtl ? -dir : dir);
    }, sig);

    /* Autoplay: one card at a time, from the end back to the start. */
    const play = st.play = {hover: false, focus: false, touch: false, seen: false, timer: 0};
    const allowed = () => root.getAttribute('data-autoplay') === 'true' && !reduced.matches && !document.hidden && play.seen && !play.hover && !play.focus && !play.touch && !st.picked && max() > 1;
    const arm = st.arm = () => {
      clearTimeout(play.timer); play.timer = 0;
      if (!allowed()) return;
      play.timer = setTimeout(() => {
        play.timer = 0;
        if (!allowed() || !track.isConnected) return;
        if (track.scrollLeft >= max() - 1) go(0); else step(1);
        arm();
      }, (num(root.getAttribute('data-speed')) || 5) * 1000);
    };
    root.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { play.hover = true; arm(); } }, passive);
    root.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { play.hover = false; arm(); } }, passive);
    root.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { play.touch = true; arm(); } }, passive);
    const lift = e => { if (play.touch && e.pointerType !== 'mouse') { play.touch = false; arm(); } };
    document.addEventListener('pointerup', lift, passive);
    document.addEventListener('pointercancel', lift, passive);
    root.addEventListener('focusin', () => { play.focus = true; arm(); }, sig);
    root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) { play.focus = false; arm(); } }, sig);
    if ('IntersectionObserver' in window) {
      st.io = new IntersectionObserver(entries => { play.seen = entries[entries.length - 1].isIntersecting; arm(); }, {threshold: 0.25});
      st.io.observe(track);
    } else play.seen = true;
    st.measure();
  }

  function setup(root) {
    const st = {root, ac: new AbortController(), queued: 0};
    roots.set(root, st);
    slider(st);
  }
  function drop(root) {
    const st = roots.get(root);
    if (!st) return;
    st.ac.abort();
    if (st.ro) st.ro.disconnect();
    if (st.io) st.io.disconnect();
    if (st.play) clearTimeout(st.play.timer);
    if (st.queued) cancelAnimationFrame(st.queued);
    roots.delete(root);
  }
  function scan() {
    for (const root of [...roots.keys()]) if (!root.isConnected) drop(root);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) setup(root);
  }
  const all = fn => () => { for (const st of roots.values()) if (st.arm) fn(st); };
  let scanFrame = 0;
  const touches = n => n.nodeType === 1 && (n.matches(SEL) || !!n.querySelector(SEL));
  new MutationObserver(records => {
    if (scanFrame) return;
    if (!records.some(r => [...r.addedNodes].some(touches) || (roots.size > 0 && [...r.removedNodes].some(touches)))) return;
    scanFrame = requestAnimationFrame(() => { scanFrame = 0; scan(); });
  }).observe(document.documentElement, {childList: true, subtree: true});
  for (const n of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(n, scan);
  document.addEventListener('visibilitychange', all(st => st.arm()));
  if (reduced.addEventListener) reduced.addEventListener('change', all(st => st.arm()));
  window.MateriaR7StoriesRuntime = {scan, roots, count: () => roots.size};
  scan();
})();
