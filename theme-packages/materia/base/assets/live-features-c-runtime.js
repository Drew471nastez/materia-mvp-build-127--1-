/* Materia Themes. Storefront behaviour of the Features sections Content Tabs,
   How To Use, Benefits Bar 3 (ingredients-highlight-bar), Count Up Banner
   (number-stats) and Product Benefits 3: carousels, arrows, keys, drag,
   autoplay, count up and the background video, once per copy, paused off
   screen and stopped under reduced motion. The theme editor loads
   live-features-c.js instead (the same behaviour plus live setting edits). */
(() => {
  if (window.MateriaFeaturesC) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const num = (v, f = 0) => v != null && v !== '' && Number.isFinite(+v) ? +v : f;
  const hide = (el, on) => { if (el && el.hasAttribute('hidden') !== !!on) el.toggleAttribute('hidden', !!on); };
  const behaviour = () => reduce.matches ? 'auto' : 'smooth';
  function stepOf(track, item) {
    const card = track.querySelector(item);
    if (!card) return track.clientWidth;
    const cs = getComputedStyle(track);
    return card.getBoundingClientRect().width + (parseFloat(cs.columnGap || cs.gap) || 0);
  }
  function draggable(track) {
    let down = false, dragged = false, startX = 0, startScroll = 0;
    track.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' || e.button) return; down = true; dragged = false; startX = e.clientX; startScroll = track.scrollLeft; });
    track.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - startX; if (!dragged && Math.abs(dx) > 4) { dragged = true; track.classList.add('is-dragging'); try { track.setPointerCapture(e.pointerId); } catch (_) {} } if (dragged) { track.scrollLeft = startScroll - dx; e.preventDefault(); } });
    const end = e => { if (!down) return; down = false; track.classList.remove('is-dragging'); try { track.releasePointerCapture(e.pointerId); } catch (_) {} };
    for (const n of ['pointerup', 'pointercancel', 'pointerleave']) track.addEventListener(n, end);
    track.addEventListener('click', e => { if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; } }, {capture: true});
    track.addEventListener('dragstart', e => e.preventDefault());
  }
  function keys(track, item) {
    track.addEventListener('keydown', e => {
      if (e.target !== track && !track.contains(e.target)) return;
      const step = stepOf(track, item), max = track.scrollWidth - track.clientWidth, rtl = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
      const to = {ArrowRight: track.scrollLeft + step * rtl, ArrowLeft: track.scrollLeft - step * rtl, Home: 0, End: max * rtl}[e.key];
      if (to === undefined) return;
      e.preventDefault();
      track.scrollTo({left: to, behavior: behaviour()});
    });
  }
  const groups = (n, sep) => { const v = Math.round(num(n)), s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, sep); return (v < 0 ? '-' : '') + s; };

  const TYPES = {
    'content-tabs'(root) {
      const track = root.querySelector('[data-ctabs-track]');
      if (!track) return;
      const prev = root.querySelector('[data-ctabs-prev]'), next = root.querySelector('[data-ctabs-next]');
      const update = () => { if (!prev || !next || !track.isConnected) return; const max = track.scrollWidth - track.clientWidth - 2; prev.disabled = track.scrollLeft <= 2; next.disabled = track.scrollLeft >= max; };
      prev?.addEventListener('click', () => track.scrollBy({left: -stepOf(track, '.ctabs__card'), behavior: behaviour()}));
      next?.addEventListener('click', () => track.scrollBy({left: stepOf(track, '.ctabs__card'), behavior: behaviour()}));
      track.addEventListener('scroll', () => requestAnimationFrame(update), {passive: true});
      new ResizeObserver(update).observe(track);
      draggable(track); keys(track, '.ctabs__card');
    },
    'how-to-use'(root, st) {
      const grid = root.querySelector('[data-htu-track]'), phone = matchMedia('(max-width: 767px)');
      if (!grid) return;
      let timer = 0, paused = false;
      const on = () => root.dataset.carousel === 'true' && phone.matches;
      const stop = () => { clearInterval(timer); timer = 0; };
      st.visible = () => {
        stop();
        if (on()) grid.tabIndex = 0; else grid.removeAttribute('tabindex');
        const delay = num(grid.dataset.htuAutoplay);
        if (!on() || !delay || reduce.matches || !st.near || document.hidden || paused) return;
        timer = setInterval(() => {
          if (!grid.isConnected) return stop();
          const max = grid.scrollWidth - grid.clientWidth;
          if (grid.scrollLeft >= max - 2) grid.scrollTo({left: 0, behavior: behaviour()}); else grid.scrollBy({left: stepOf(grid, '.htu__step'), behavior: behaviour()});
        }, delay);
      };
      for (const n of ['pointerdown', 'mouseenter', 'focusin', 'touchstart']) grid.addEventListener(n, () => { paused = true; stop(); }, {passive: true});
      for (const n of ['mouseleave', 'focusout', 'touchend']) grid.addEventListener(n, () => { paused = false; st.visible(); }, {passive: true});
      phone.addEventListener('change', () => st.visible()); reduce.addEventListener('change', () => st.visible());
      keys(grid, '.htu__step');
      st.visible();
    },
    'ingredients-highlight-bar'(root) {
      const track = root.querySelector('[data-ihb-track]'), prev = root.querySelector('.ihb__arrow--prev'), next = root.querySelector('.ihb__arrow--next'), desk = matchMedia('(min-width: 992px)');
      if (!track || !prev || !next) return;
      const update = () => {
        if (!track.isConnected) return;
        const max = track.scrollWidth - track.clientWidth;
        if (!desk.matches || max <= 1) { hide(prev, true); hide(next, true); } else { hide(prev, track.scrollLeft <= 2); hide(next, track.scrollLeft >= max - 2); }
        if (max > 1) track.tabIndex = 0; else track.removeAttribute('tabindex');
      };
      const later = () => requestAnimationFrame(update);
      prev.addEventListener('click', () => track.scrollBy({left: -track.clientWidth * 0.7, behavior: behaviour()}));
      next.addEventListener('click', () => track.scrollBy({left: track.clientWidth * 0.7, behavior: behaviour()}));
      track.addEventListener('scroll', later, {passive: true});
      desk.addEventListener('change', later);
      track.addEventListener('load', later, {capture: true});
      new ResizeObserver(update).observe(track);
      keys(track, '.ihb__item');
    },
    'number-stats'(root) {
      if (reduce.matches) return;
      const items = [...root.querySelectorAll('.loudecoms-count-up')], sep = root.dataset.nsSep || ',';
      if (!items.length) return;
      let done = false, frame = 0;
      for (const el of items) el.textContent = groups(0, sep);
      const finish = () => { cancelAnimationFrame(frame); for (const el of items) el.textContent = groups(el.dataset.value, sep); };
      const io = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        if (done || reduce.matches) return finish();
        const t0 = performance.now();
        const step = now => {
          if (done || !root.isConnected) return finish();
          const t = Math.min((now - t0) / 2000, 1), e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          for (const el of items) { const v = groups(num(el.dataset.value) * e, sep); if (el.textContent !== v) el.textContent = v; }
          if (t < 1) frame = requestAnimationFrame(step); else { done = true; finish(); }
        };
        frame = requestAnimationFrame(step);
      }, {threshold: 0.5, rootMargin: '0px 0px -10% 0px'});
      io.observe(root.querySelector('.loudecoms-section') || root);
      reduce.addEventListener('change', () => { done = true; finish(); });
    },
    'product-benefits-3'(root, st) {
      const video = root.querySelector('[data-pb3-video]');
      if (!video) return;
      video.muted = true;
      st.visible = () => { if (!video.isConnected) return; if (reduce.matches || !st.near || document.hidden) { if (!video.paused) video.pause(); } else if (video.paused) video.play()?.catch(() => {}); };
      reduce.addEventListener('change', () => st.visible());
      st.visible();
    },
  };
  const roots = new Map();
  function scan() {
    document.querySelectorAll('[data-fc-root]').forEach(root => {
      const init = TYPES[root.dataset.fcRoot];
      if (!init || roots.has(root)) return;
      const st = {near: true};
      roots.set(root, st);
      try { init(root, st); } catch (e) { console.warn('live-features-c-runtime', e); }
      if (st.visible) new IntersectionObserver(entries => { const near = entries.at(-1).isIntersecting; if (near !== st.near) { st.near = near; st.visible(); } }, {rootMargin: '100px 0px'}).observe(root);
    });
  }
  document.addEventListener('visibilitychange', () => { for (const st of roots.values()) st.visible?.(); });
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('[data-fc-root]') || n.querySelector('[data-fc-root]'))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaFeaturesC = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
