/* Materia Themes. Storefront behaviour of three Features sections: Benefits
   Bar 2's phone carousel autoplay (on a phone, on screen, in a visible tab,
   without reduced motion, not while held or focused), Benefits Tabs' cards
   opening and closing, and Product Benefits Pro's video (plays only on screen,
   in a visible tab, without reduced motion). Benefits Bar's slider is
   benefits-bar.js. The theme editor loads live-features-a.js instead (the
   same plus live setting edits). */
(() => {
  if (window.MateriaFeaturesA) return;
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 767px)');
  function autoplay(st) {
    const root = st.root, grid = root.querySelector('.bb2__grid'), secs = num(root.dataset.autoplay, 0);
    const want = secs > 0 && phone.matches && !reduced.matches && st.visible && !document.hidden && !st.held && grid ? secs : 0;
    if (want === st.playing) return;
    if (st.timer) { clearInterval(st.timer); st.timer = 0; }
    st.playing = want;
    if (!want) return;
    st.timer = setInterval(() => {
      const item = grid.querySelector('.bb2__item'); if (!item) return;
      const max = grid.scrollWidth - grid.clientWidth;
      if (grid.scrollLeft >= max - 2) grid.scrollTo({left: 0}); else grid.scrollBy({left: item.getBoundingClientRect().width + (parseFloat(getComputedStyle(grid).columnGap) || 0)});
    }, want * 1000);
  }
  function toggle(item) {
    const panel = item.querySelector('.btab__panel');
    if (reduced.matches || !panel) { item.removeAttribute('data-closing'); item.removeAttribute('data-opening'); item.open = !item.open; return; }
    if (item.open && !item.hasAttribute('data-closing')) {
      item.removeAttribute('data-opening'); item.setAttribute('data-closing', '');
      let done = false; const end = () => { if (done || !item.hasAttribute('data-closing')) return; done = true; item.removeAttribute('data-closing'); item.open = false; };
      panel.addEventListener('transitionend', end, {once: true}); setTimeout(end, 520);
    } else {
      item.removeAttribute('data-closing'); item.setAttribute('data-opening', ''); item.open = true;
      requestAnimationFrame(() => requestAnimationFrame(() => item.removeAttribute('data-opening')));
    }
  }
  function video(st) {
    const v = st.root.querySelector('.pbp__media video'); if (!v) return;
    if (reduced.matches || !st.visible || document.hidden) { v.autoplay = false; v.removeAttribute('autoplay'); if (!v.paused) v.pause(); }
    else if (v.paused) { v.muted = true; const p = v.play && v.play(); if (p && p.catch) p.catch(() => {}); }
  }
  const TYPES = {
    'benefits-bar-2': {
      setup(st) {
        const grid = st.root.querySelector('.bb2__grid'), sig = {passive: true};
        const hold = on => () => { st.held = on; autoplay(st); };
        if (grid) { for (const e of ['pointerdown', 'mouseenter', 'focusin']) grid.addEventListener(e, hold(true), sig); for (const e of ['pointerup', 'mouseleave', 'focusout']) grid.addEventListener(e, hold(false), sig); }
        phone.addEventListener('change', () => autoplay(st));
        autoplay(st);
      },
      refresh: autoplay,
    },
    'benefits-tabs': {
      setup(st) {
        st.root.addEventListener('click', e => {
          const sum = e.target.closest('summary'), item = sum && sum.parentElement;
          if (!item || !item.matches('details.btab__item') || !st.root.contains(item)) return;
          e.preventDefault(); toggle(item);
        });
      },
    },
    benefits2: {setup: video, refresh: video},
  };
  const roots = new Map();
  function scan() {
    for (const root of roots.keys()) if (!root.isConnected) { const st = roots.get(root); clearInterval(st.timer); st.io && st.io.disconnect(); roots.delete(root); }
    for (const root of document.querySelectorAll('[data-fa]')) {
      const type = TYPES[root.dataset.fa];
      if (!type || roots.has(root)) continue;
      const st = {root, visible: true};
      roots.set(root, st);
      if (type.refresh) {
        reduced.addEventListener('change', () => type.refresh(st));
        st.io = new IntersectionObserver(es => { for (const e of es) st.visible = e.isIntersecting; type.refresh(st); });
        st.io.observe(root);
      }
      type.setup(st);
      root.dataset.faReady = '';
    }
  }
  document.addEventListener('visibilitychange', () => { for (const [root, st] of roots) { const t = TYPES[root.dataset.fa]; if (t.refresh) t.refresh(st); } });
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('[data-fa]') || n.querySelector('[data-fa]'))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaFeaturesA = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
