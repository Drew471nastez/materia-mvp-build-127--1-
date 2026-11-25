/* Materia Themes. Storefront behaviour of the Logos and trust sections: the
   logo carousels of Brand logo and Logos list (arrows, dots, keyboard,
   autoplay), the Scrolling logo strip paused off screen and in a hidden tab,
   the Testimonial logos tabs (click, arrow keys, autoplay) and reveal on
   scroll. Once per root, paused off screen or in a hidden tab, stopped under
   reduced motion. The theme editor loads live-logos.js instead (the same plus
   live setting edits). */
(() => {
  if (window.MateriaLogos) return;
  const SEL = '[data-lg-root]';
  const roots = new Map();
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const design = () => !!(window.SlTheme && window.SlTheme.designMode) || document.documentElement.classList.contains('shopify-design-mode');
  function carousel(root, st) {
    const el = root.querySelector('[data-lg-carousel]'), track = el && el.querySelector('.lgc__track');
    if (!track || st.track === track) return;
    st.track = track;
    if (st.carAbort) st.carAbort.abort();
    const ac = new AbortController(), sig = {signal: ac.signal}; st.carAbort = ac;
    const slides = () => [...track.children];
    const step = () => { const s = slides()[0]; return s ? s.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : track.clientWidth; };
    const max = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const index = () => Math.round(track.scrollLeft / Math.max(1, step()));
    const go = (i, smooth = true) => { const left = Math.min(max(), Math.max(0, i * step())); track.scrollTo({left, behavior: smooth && !reduced.matches ? 'smooth' : 'auto'}); };
    const next = () => { const m = max(); if (track.scrollLeft >= m - 2) { if (el.dataset.loop === 'true') go(0); } else go(index() + 1); };
    const prev = () => { if (track.scrollLeft <= 2) { if (el.dataset.loop === 'true') go(slides().length); } else go(index() - 1); };
    let tick = 0;
    const update = () => {
      const m = max(), p = m <= 0 ? 0 : Math.min(1, Math.max(0, track.scrollLeft / m)), i = Math.min(slides().length - 1, index());
      el.style.setProperty('--lgc-p', p.toFixed(3));
      for (const d of el.querySelectorAll('[data-lg-dot]')) { const on = +d.dataset.lgDot === i; if ((d.getAttribute('aria-current') === 'true') !== on) { if (on) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); } }
      const loop = el.dataset.loop === 'true';
      const pv = el.querySelector('[data-lg-prev]'), nx = el.querySelector('[data-lg-next]');
      if (pv) pv.setAttribute('aria-disabled', !loop && track.scrollLeft <= 2 ? 'true' : 'false');
      if (nx) nx.setAttribute('aria-disabled', !loop && track.scrollLeft >= m - 2 ? 'true' : 'false');
    };
    track.addEventListener('scroll', () => { if (!tick) tick = requestAnimationFrame(() => { tick = 0; update(); }); }, {passive: true, ...sig});
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-lg-prev],[data-lg-next],[data-lg-dot]'); if (!b || !el.contains(b)) return;
      if (b.hasAttribute('data-lg-prev')) prev(); else if (b.hasAttribute('data-lg-next')) next(); else go(+b.dataset.lgDot);
      restart();
    }, sig);
    track.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); next(); restart(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); restart(); } }, sig);
    let hold = false;
    for (const [n, v] of [['pointerenter', true], ['pointerleave', false], ['focusin', true], ['focusout', false]]) el.addEventListener(n, () => { hold = v; }, sig);
    /* autoplay: one timer per carousel, only while it is on screen, the tab is visible and motion is allowed */
    const restart = () => {
      if (st.timer) { clearInterval(st.timer); st.timer = 0; }
      if (el.dataset.autoplay !== 'true' || reduced.matches || !st.visible || document.hidden || max() <= 0) return;
      st.timer = setInterval(() => { if (!hold && root.isConnected) next(); }, Math.max(2, num(el.dataset.speed, 5)) * 1000);
    };
    st.carousel = {update, restart, next, prev, go};
    update(); restart();
  }

  function tabs(root, st) {
    const list = root.querySelector('[role="tablist"]'), quotes = root.querySelector('[data-tlg-quotes]');
    if (!list || !quotes) return;
    if (st.tabList === list) return;
    st.tabList = list;
    if (st.tabAbort) st.tabAbort.abort();
    const ac = new AbortController(), sig = {signal: ac.signal}; st.tabAbort = ac;
    const tabEls = () => [...list.querySelectorAll('[role="tab"]')];
    const panels = () => [...quotes.querySelectorAll('[data-tlg-panel]')];
    let current = Math.max(0, tabEls().findIndex(t => t.getAttribute('aria-selected') === 'true')), pending = null, swap = 0, hold = false;
    const mark = i => tabEls().forEach((t, n) => { const on = n === i; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
    const commit = () => {
      swap = 0; if (pending === null) return;
      const i = pending; pending = null; current = i;
      panels().forEach((p, n) => { p.hidden = n !== i; });
      quotes.classList.add('is-prep'); quotes.classList.remove('is-out'); void quotes.offsetWidth; quotes.classList.remove('is-prep');
    };
    const activate = i => {
      const n = tabEls().length; if (!n) return;
      i = Math.max(0, Math.min(i, n - 1));
      if (i === (pending === null ? current : pending)) return;
      pending = i; mark(i);
      clearTimeout(swap);
      const ms = reduced.matches ? 0 : parseFloat(getComputedStyle(quotes).transitionDuration) * 1000 || 0;
      if (ms <= 0) { commit(); return; }
      quotes.classList.add('is-out');
      swap = setTimeout(commit, ms);
    };
    list.addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (t && list.contains(t)) { activate(tabEls().indexOf(t)); restart(); } }, sig);
    list.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const n = tabEls().length; let i = pending === null ? current : pending;
      i = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : n - 1;
      i = (i + n) % n; tabEls()[i].focus(); activate(i); restart();
    }, sig);
    for (const [n, v] of [['pointerenter', true], ['pointerleave', false], ['focusin', true], ['focusout', false]]) root.addEventListener(n, () => { hold = v; }, sig);
    /* the editor shows the selected block's quote */
    document.addEventListener('shopify:block:select', e => { const t = e.target && e.target.closest && e.target.closest('[role="tab"]'); if (t && list.contains(t)) { st.editorHold = true; activate(tabEls().indexOf(t)); } }, sig);
    document.addEventListener('shopify:block:deselect', () => { st.editorHold = false; }, sig);
    const restart = () => {
      if (st.timer) { clearInterval(st.timer); st.timer = 0; }
      if (root.dataset.autoplay !== 'true' || design() || reduced.matches || !st.visible || document.hidden || tabEls().length < 2) return;
      st.timer = setInterval(() => { if (hold || st.editorHold || !root.isConnected) return; const n = tabEls().length; activate(((pending === null ? current : pending) + 1) % n); }, Math.max(3, num(root.dataset.interval, 6)) * 1000);
    };
    st.tabs = {activate, restart, sync: () => { const n = tabEls().length; if (current >= n) { current = 0; pending = null; } panels().forEach((p, k) => { p.hidden = k !== (pending === null ? current : pending); }); mark(pending === null ? current : pending); }};
    restart();
  }
  const carouselType = {init: carousel, after(root, st) { carousel(root, st); if (st.carousel) { st.carousel.update(); st.carousel.restart(); } }, visibility(root, st) { if (st.carousel) st.carousel.restart(); }};
  const TYPES = {
    'brand-logo': carouselType,
    'logos-list': carouselType,
    logo_scroll_strip: {visibility(root, st) { const stop = !st.visible || document.hidden; if (stop) root.setAttribute('data-paused', ''); else root.removeAttribute('data-paused'); }},
    'testimonial-logos': {init: tabs, after(root, st) { tabs(root, st); if (st.tabs) { st.tabs.sync(); st.tabs.restart(); } }, visibility(root, st) { if (st.tabs) st.tabs.restart(); }},
    'brand-info': {},
    'payment-icons1': {},
  };
  function drop(root, st) {
    st.io.disconnect(); cancelAnimationFrame(st.frame); if (st.carAbort) st.carAbort.abort(); if (st.tabAbort) st.tabAbort.abort(); if (st.timer) clearInterval(st.timer); roots.delete(root);
  }
  function add(root) {
    const type = TYPES[root.dataset.lgRoot]; if (!type) return;
    const st = {root, visible: true};
    const after = () => { if (!st.frame) st.frame = requestAnimationFrame(() => { st.frame = 0; if (root.isConnected && type.after) type.after(root, st); }); };
    reduced.addEventListener('change', after);
    st.io = new IntersectionObserver(es => { for (const e of es) { st.visible = e.isIntersecting; if (e.isIntersecting) reveal(root, st, true); } if (type.visibility) type.visibility(root, st); });
    st.io.observe(root);
    roots.set(root, st);
    reveal(root, st, false);
    if (type.init) type.init(root, st);
    after();
    root.dataset.lgReady = '';
  }
  /* Reveal on scroll: only a section that starts below the fold waits, never in the editor or under reduced motion. */
  function reveal(root, st, seen) {
    if (root.dataset.reveal !== 'true') { root.removeAttribute('data-lg-reveal'); return; }
    if (st && st.redraw === undefined) st.redraw = !!window.mtIsRedraw?.(root);
    if (seen || (st ? st.redraw : !!window.mtIsRedraw?.(root)) || reduced.matches) { root.dataset.lgReveal = 'done'; return; }
    if (!root.dataset.lgReveal) { const r = root.getBoundingClientRect(); root.dataset.lgReveal = r.top > innerHeight ? 'wait' : 'done'; }
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) add(root);
  }
  document.addEventListener('visibilitychange', () => { for (const [root, st] of roots) { const t = TYPES[root.dataset.lgRoot]; if (t.visibility) t.visibility(root, st); } });
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaLogos = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
