/* Materia Themes. Storefront behaviour of two products-d sections: Quick Add
   to Cart's variant picker (a sold out variant disables the button and shows
   its label) and the Products set carousel (arrows, dots, keyboard, drag,
   autoplay off screen, in a hidden tab, on hover or focus and under reduced
   motion it stops). The theme editor loads live-products-d.js instead (the
   same plus live setting edits). */
(() => {
  if (window.MateriaProductsD) return;
  const roots = new Map();
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const DESK = '(min-width: 768px)';
  const setVar = (el, k, v) => { if (!el) return; if (v == null || v === '') { if (el.style.getPropertyValue(k) !== '') el.style.removeProperty(k); } else if (el.style.getPropertyValue(k) !== String(v)) el.style.setProperty(k, String(v)); };
  const attr = (el, k, v) => { if (!el) return; if (v == null || v === false) { if (el.hasAttribute(k)) el.removeAttribute(k); } else if (el.getAttribute(k) !== String(v)) el.setAttribute(k, String(v)); };
  const text = (el, v) => { if (el && el.textContent !== String(v)) el.textContent = String(v); };
  let timers = 0;
  function atcLabel(buy, root) {
    const btn = buy.querySelector('.pd-atc__button'), label = buy.querySelector('.pd-atc__label');
    if (btn && label) text(label, btn.dataset.available === 'false' ? root.dataset.pdSoldOut || 'Sold out' : buy.dataset.label || '');
  }
  /* The variant picker: the form posts the selected variant; a sold out one disables the button. */
  document.addEventListener('change', e => {
    const sel = e.target.closest && e.target.closest('[data-pd-variant]'); if (!sel) return;
    const form = sel.form, btn = form && form.querySelector('.pd-atc__button'), opt = sel.selectedOptions[0], root = sel.closest('[data-pd-root]');
    if (!btn || !opt) return;
    const ok = opt.dataset.available !== 'false';
    btn.dataset.available = String(ok); btn.disabled = !ok; attr(btn, 'aria-disabled', ok ? null : 'true');
    const buy = sel.closest('.pd-atc__buy'); if (buy && root) atcLabel(buy, root);
  });

  function setupSet(root, st) {
    const track = root.querySelector('.pd-set__track'); if (!track) return;
    const slides = () => [...track.children].filter(el => el.classList.contains('pd-set__slide'));
    const fit = () => root.dataset[st.mq.matches ? 'fitD' : 'fitM'] === 'true';
    const max = () => track.scrollWidth - track.clientWidth;
    const atEnd = () => !fit() && track.scrollLeft >= max() - 2, atStart = () => track.scrollLeft <= 2;
    const index = () => atEnd() ? slides().length - 1 : pos();
    const pos = () => { const sl = slides(); if (!sl.length) return 0; const x = track.scrollLeft, o = sl[0].offsetLeft; let best = 0, bd = Infinity; sl.forEach((el, i) => { const d = Math.abs(el.offsetLeft - o - x); if (d < bd) { bd = d; best = i; } }); return best; };
    const go = i => { const sl = slides(); if (!sl.length) return; const n = sl.length; i = root.dataset.loop === 'true' ? (i + n) % n : Math.max(0, Math.min(n - 1, i)); track.scrollTo({left: Math.min(max(), sl[i].offsetLeft - sl[0].offsetLeft), behavior: st.reduced.matches ? 'auto' : 'smooth'}); };
    const step = dir => { const loop = root.dataset.loop === 'true', n = slides().length; if (dir > 0 && atEnd()) { if (loop) go(0); return; } if (dir < 0 && atStart()) { if (loop) go(n - 1); return; } go(pos() + dir); };
    const update = () => {
      const sl = slides(), i = index(), loop = root.dataset.loop === 'true';
      root.querySelectorAll('.pd-set__dot').forEach((d, k) => attr(d, 'aria-current', k === i ? 'true' : null));
      text(root.querySelector('[data-pd-current]'), i + 1);
      setVar(root.querySelector('.pd-set__bar > span'), '--pd-progress', (sl.length ? Math.round((i + 1) / sl.length * 100) : 0) + '%');
      const prev = root.querySelector('.pd-set__arrow--prev'), next = root.querySelector('.pd-set__arrow--next');
      if (prev && prev.disabled !== (!loop && atStart())) prev.disabled = !loop && atStart();
      if (next && next.disabled !== (!loop && atEnd())) next.disabled = !loop && atEnd();
    };
    let frame = 0, timer = 0, visible = false, paused = false, drag = null, moved = false;
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    const stop = () => { if (timer) { clearTimeout(timer); timer = 0; timers--; } };
    const run = () => {
      stop();
      if (root.dataset.autoplay !== 'true' || st.reduced.matches || !visible || paused || document.hidden || fit() || slides().length < 2) return;
      timers++; timer = setTimeout(() => { timer = 0; timers--; if (atEnd()) go(0); else go(pos() + 1); run(); }, num(root.dataset.speed, 5) * 1000);
    };
    st.slides = slides; st.step = step; st.go = go;
    st.sync = () => { update(); if (!!timer !== (root.dataset.autoplay === 'true' && !st.reduced.matches && visible && !paused && !document.hidden && !fit() && slides().length > 1) || st.speed !== root.dataset.speed) { st.speed = root.dataset.speed; run(); } };
    root.addEventListener('click', e => {
      const a = e.target.closest('.pd-set__arrow, .pd-set__dot');
      if (moved && track.contains(e.target)) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      if (!a || !root.contains(a)) return;
      if (a.classList.contains('pd-set__dot')) go(num(a.dataset.index)); else step(num(a.dataset.dir, 1));
    }, true);
    track.addEventListener('scroll', onScroll, {passive: true});
    track.addEventListener('keydown', e => { if (e.target !== track) return; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); } });
    /* Mouse drag; touch and trackpads scroll natively. */
    track.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; drag = {x: e.clientX, left: track.scrollLeft}; moved = false; });
    track.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; if (!moved && Math.abs(dx) > 5) { moved = true; track.style.scrollSnapType = 'none'; track.style.scrollBehavior = 'auto'; } if (moved) track.scrollLeft = drag.left - dx; });
    const end = () => { if (!drag) return; drag = null; if (moved) { track.style.removeProperty('scroll-snap-type'); track.style.removeProperty('scroll-behavior'); go(pos()); setTimeout(() => { moved = false; }, 0); } };
    track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end); track.addEventListener('pointerleave', end);
    track.addEventListener('dragstart', e => e.preventDefault());
    const pause = v => () => { paused = v; run(); };
    root.addEventListener('pointerenter', pause(true)); root.addEventListener('pointerleave', pause(false));
    root.addEventListener('focusin', pause(true)); root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) pause(false)(); });
    const io = new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); run(); });
    io.observe(root);
    const vis = () => run(); document.addEventListener('visibilitychange', vis);
    st.cleanup.push(() => { stop(); io.disconnect(); document.removeEventListener('visibilitychange', vis); cancelAnimationFrame(frame); });
  }

  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) { for (const f of st.cleanup) f(); roots.delete(root); }
    for (const root of document.querySelectorAll('[data-pd-root="set"]')) {
      if (roots.has(root)) continue;
      const st = {mq: matchMedia(DESK), reduced: matchMedia('(prefers-reduced-motion: reduce)'), cleanup: []};
      roots.set(root, st);
      setupSet(root, st);
      if (!st.sync) continue;
      const sync = () => requestAnimationFrame(() => { if (root.isConnected) st.sync(); });
      st.mq.addEventListener('change', sync); st.reduced.addEventListener('change', sync);
      st.cleanup.push(() => { st.mq.removeEventListener('change', sync); st.reduced.removeEventListener('change', sync); });
      sync();
    }
  }
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches('[data-pd-root]') || n.querySelector('[data-pd-root]'))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaProductsD = {scan, runtime: true, timers: () => timers};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
