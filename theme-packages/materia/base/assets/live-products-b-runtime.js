/* Materia Themes. Storefront behaviour of two products-b sections: the
   Products carousel's autoplay and video only while on screen, the tab is
   shown and motion is welcome; the Product Showcase slider (arrows, keyboard,
   swipe, autoplay that stops off screen, in a hidden tab and under reduced
   motion). Settings are read from what each root prints. The theme editor
   loads live-products-b.js instead (the same plus live setting edits). */
(() => {
  if (window.MateriaProductsB) return;
  const SEL = '[data-pb-root]';
  const roots = new Map();
  const parse = v => { try { return JSON.parse(v || '{}') || {}; } catch (_) { return {}; } };
  const bool = v => v === true || v === 'true';
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const TYPES = {
    'products-carousel': {
      /* Auto-rotation runs only while the carousel is on screen, the tab is shown and motion is welcome. */
      init(root, st) {
        st.io = new IntersectionObserver(es => { for (const e of es) st.visible = e.isIntersecting; TYPES['products-carousel'].motion(root, st); });
        st.io.observe(root);
        const slider = root.querySelector('[data-pb-slider]');
        if (slider) slider.addEventListener('pointerenter', () => { st.hover = true; }, {signal: st.abort.signal});
        if (slider) slider.addEventListener('pointerleave', () => { st.hover = false; TYPES['products-carousel'].motion(root, st); }, {signal: st.abort.signal});
        /* The theme builds the slider when it comes near the screen; wait for it, then stop polling. */
        st.motionTimer = setInterval(() => { const el = root.querySelector('[data-pb-slider]'); if (!el || el.globalSlide) { clearInterval(st.motionTimer); TYPES['products-carousel'].motion(root, st); } }, 250);
        this.motion(root, st);
        const v = root.querySelector('video[data-pb-autoplay]');
        if (v && st.reduced.matches) { v.autoplay = false; v.removeAttribute('autoplay'); try { v.pause(); } catch (_) {} }
      },
      motion(root, st) {
        const el = root.querySelector('[data-pb-slider]'), sw = el && el.globalSlide;
        const reduced = st.reduced.matches, stop = reduced || document.hidden || !st.visible;
        if (sw && !sw.destroyed) {
          sw.params.speed = reduced ? 0 : 500;
          if (sw.autoplay) {
            if (stop && sw.autoplay.running) sw.autoplay.stop();
            else if (!stop && !st.hover && el.dataset.autoplay === 'true' && !sw.autoplay.running) sw.autoplay.start();
          }
        }
        const v = root.querySelector('video[data-pb-autoplay]');
        if (v) {
          if (stop && !v.paused) { v.pause(); v.dataset.pbPaused = ''; }
          else if (!stop && 'pbPaused' in v.dataset) { delete v.dataset.pbPaused; const p = v.play && v.play(); if (p && p.catch) p.catch(() => {}); }
        }
      },
      stop(root, st) { clearInterval(st.motionTimer); },
    },
    'product-showcase': {
      init(root, st) {
        const T = TYPES['product-showcase'];
        st.index = 0; st.visible = true;
        const sig = {signal: st.abort.signal};
        const slides = () => [...root.querySelectorAll('[data-ps-slide]')];
        st.go = (to, user) => {
          const list = slides(), n = list.length; if (!n) return;
          const next = ((to % n) + n) % n, changed = next !== st.index;
          st.index = next;
          const track = root.querySelector('[data-ps-track]');
          const dir = getComputedStyle(track).direction === 'rtl' ? 1 : -1; /* right to left: the next slide is to the left */
          track.style.transform = next ? 'translateX(' + (dir * next * 100) + '%)' : '';
          list.forEach((el, i) => {
            const on = i === next;
            el.classList.toggle('is-active', on);
            if (on && changed && !st.reduced.matches) { el.classList.remove('is-entering'); void el.offsetWidth; el.classList.add('is-entering'); }
            if (on) { el.removeAttribute('aria-hidden'); el.inert = false; } else { el.setAttribute('aria-hidden', 'true'); el.inert = true; }
          });
          if (user) T.motion(root, st, true);
        };
        root.addEventListener('animationend', e => { const s = e.target.closest('.is-entering'); if (s && e.target.classList.contains('ps-col-right')) s.classList.remove('is-entering'); }, sig);
        root.addEventListener('click', e => {
          const b = e.target.closest('[data-ps-prev],[data-ps-next]'); if (!b || !root.contains(b)) return;
          st.go(st.index + (b.hasAttribute('data-ps-next') ? 1 : -1), true);
          const keep = root.querySelector('.ps-slide.is-active ' + (b.hasAttribute('data-ps-next') ? '[data-ps-next]' : '[data-ps-prev]'));
          if (keep && document.activeElement !== keep && b.matches(':focus')) keep.focus({preventScroll: true});
        }, sig);
        root.addEventListener('keydown', e => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          if (e.target.closest('input,textarea,select,[contenteditable]')) return;
          e.preventDefault(); st.go(st.index + (e.key === 'ArrowRight' ? 1 : -1), true);
          const a = root.querySelector('.ps-slide.is-active ' + (e.key === 'ArrowRight' ? '[data-ps-next]' : '[data-ps-prev]'));
          if (a && root.contains(document.activeElement)) a.focus({preventScroll: true});
        }, sig);
        /* Swipe (touch and pen; a mouse drags too): horizontal moves the track, vertical scrolls the page. */
        const vp = root.querySelector('[data-ps-viewport]');
        if (vp) {
          let down = null;
          vp.addEventListener('pointerdown', e => { if (slides().length < 2 || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('a,button')) return; down = {x: e.clientX, y: e.clientY, dx: 0, lock: false, id: e.pointerId}; }, sig);
          vp.addEventListener('pointermove', e => {
            if (!down || e.pointerId !== down.id) return;
            const mx = e.clientX - down.x, my = e.clientY - down.y;
            if (!down.lock) { if (Math.abs(mx) < 6 && Math.abs(my) < 6) return; if (Math.abs(my) > Math.abs(mx)) { down = null; return; } down.lock = true; try { vp.setPointerCapture(e.pointerId); } catch (_) {} root.querySelector('[data-ps-track]').classList.add('is-dragging'); T.motion(root, st, true); }
            const n = slides().length, rtl = getComputedStyle(vp).direction === 'rtl', fwd = rtl ? mx > 0 : mx < 0; down.dx = (st.index === 0 && !fwd) || (st.index === n - 1 && fwd) ? mx * 0.35 : mx;
            const track = root.querySelector('[data-ps-track]'), dir = getComputedStyle(track).direction === 'rtl' ? 1 : -1;
            track.style.transform = 'translateX(calc(' + (dir * st.index * 100) + '% + ' + down.dx + 'px))';
          }, sig);
          const end = () => {
            if (!down) return; const d = down; down = null;
            const track = root.querySelector('[data-ps-track]'); track.classList.remove('is-dragging');
            if (!d.lock) return;
            const limit = (vp.clientWidth || 1) * 0.18;
            const s = getComputedStyle(vp).direction === 'rtl' ? -d.dx : d.dx;
            st.go(s <= -limit ? st.index + 1 : s >= limit ? st.index - 1 : st.index, true);
          };
          vp.addEventListener('pointerup', end, sig); vp.addEventListener('pointercancel', end, sig); vp.addEventListener('lostpointercapture', end, sig);
        }
        root.addEventListener('pointerenter', () => { st.hover = true; T.motion(root, st); }, sig);
        root.addEventListener('pointerleave', () => { st.hover = false; T.motion(root, st); }, sig);
        root.addEventListener('focusin', () => { st.focus = true; T.motion(root, st); }, sig);
        root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) { st.focus = false; T.motion(root, st); } }, sig);
        st.io = new IntersectionObserver(es => { for (const e of es) st.visible = e.isIntersecting; T.motion(root, st); });
        st.io.observe(root);
        T.motion(root, st);
      },
      /* Auto-rotation: only with two or more slides, on screen, tab shown, no hover or focus, motion welcome. */
      motion(root, st, restart) {
        const s = st.s, n = root.querySelectorAll('[data-ps-slide]').length;
        const run = bool(s.autoplay) && n > 1 && st.visible && !document.hidden && !st.hover && !st.focus && !st.reduced.matches;
        const ms = Math.max(3, num(s.autoplay_speed, 6)) * 1000;
        if (st.timer && (!run || restart || st.timerMs !== ms)) { clearInterval(st.timer); st.timer = 0; }
        if (run && !st.timer) { st.timerMs = ms; st.timer = setInterval(() => { if (!root.isConnected) { clearInterval(st.timer); st.timer = 0; return; } st.go(st.index + 1); }, ms); }
        root.dataset.pbRunning = st.timer ? 'true' : 'false';
      },
      stop(root, st) { clearInterval(st.timer); st.timer = 0; },
    },
  };
  function drop(root, st) {
    if (st.io) st.io.disconnect();
    st.abort.abort(); clearInterval(st.motionTimer);
    const type = TYPES[root.dataset.pbRoot]; if (type && type.stop) type.stop(root, st);
    roots.delete(root);
  }
  function add(root) {
    const type = TYPES[root.dataset.pbRoot]; if (!type) return;
    const st = {root, s: {...parse(root.dataset.pbDefaults), ...parse(root.dataset.pbSettings)}, visible: true, reduced: matchMedia('(prefers-reduced-motion: reduce)'), abort: new AbortController()};
    st.reduced.addEventListener('change', () => type.motion(root, st), {signal: st.abort.signal});
    roots.set(root, st);
    type.init(root, st);
    root.dataset.pbReady = '';
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) add(root);
  }
  document.addEventListener('visibilitychange', () => { for (const [root, st] of roots) TYPES[root.dataset.pbRoot].motion(root, st); });
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaProductsB = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
