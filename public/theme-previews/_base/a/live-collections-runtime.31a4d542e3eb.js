/* Materia Themes. Storefront behaviour of the Collections sections: the
   Collection Lookbook carousel (arrows, dots, keyboard, drag, autoplay), the
   Scrolling Collection marquee (seamless loop, drag, pause button, paused off
   screen), the Collections Display hover preview, Collection Hero Pro's
   background videos and the Collection List carousel autoplay, all stopped
   under reduced motion and off screen. Settings are read from what each
   root prints. The theme editor loads live-collections.js instead (the same
   plus live setting edits). */
(() => {
  if (window.MateriaCollections) return;
  const SEL = '[data-cl-root]';
  const roots = new Map();
  const parse = v => { try { return JSON.parse(v || '{}') || {}; } catch (_) { return {}; } };
  const bool = v => v === true || v === 'true';
  const num = (v, d = 0) => v !== '' && v != null && v !== false && Number.isFinite(+v) ? +v : d;
  const TYPES = {};
  TYPES['scrolling-collection'] = {
    init(root, st) {
      const T = TYPES['scrolling-collection'], sig = {signal: st.abort.signal};
      st.io = new IntersectionObserver(es => { for (const e of es) st.visible = e.isIntersecting; T.motion(root, st); });
      st.io.observe(root);
      st.ro = new ResizeObserver(() => { cancelAnimationFrame(st.fillFrame); st.fillFrame = requestAnimationFrame(() => T.fill(root, st)); });
      st.ro.observe(root);
      const btn = root.querySelector('[data-scol-toggle]');
      if (btn) btn.addEventListener('click', () => { st.paused = !st.paused; btn.setAttribute('aria-pressed', String(st.paused)); T.motion(root, st); }, sig);
      for (const row of root.querySelectorAll('[data-scol-row]')) T.drag(root, st, row, sig);
      T.fill(root, st);
      T.motion(root, st);
    },
    /* Enough copies of the chips for a seamless loop on any screen: the track moves by one set (its period). */
    fill(root, st) {
      if (!root.isConnected || st.reduced.matches) return;
      for (const track of root.querySelectorAll('[data-scol-track]')) {
        const sets = track.querySelectorAll(':scope > .scol__set'); if (!sets.length) continue;
        const period = track.scrollWidth / sets.length, row = track.parentElement;
        if (!period) continue;
        const need = Math.max(2, Math.ceil(row.clientWidth / period) + 1);
        for (let i = sets.length; i < need; i++) { const copy = sets[sets.length - 1].cloneNode(true); copy.setAttribute('data-cl-copy', ''); copy.setAttribute('aria-hidden', 'true'); track.append(copy); }
        const n = Math.max(need, sets.length);
        track.style.setProperty('--scol-shift', n > 2 ? -(track.scrollWidth / n) + 'px' : '-50%');
      }
    },
    drag(root, st, row, sig) {
      const track = row.querySelector('[data-scol-track]'); if (!track) return;
      let down = null;
      const period = () => { const n = track.querySelectorAll(':scope > .scol__set').length || 2; return track.scrollWidth / n; };
      const x0 = () => { const m = new DOMMatrixReadOnly(getComputedStyle(track).transform); return m.m41; };
      row.addEventListener('pointerdown', e => {
        if (st.reduced.matches || (e.pointerType === 'mouse' && e.button !== 0)) return;
        down = {x: e.clientX, id: e.pointerId, start: x0(), moved: false, p: period()};
      }, sig);
      row.addEventListener('pointermove', e => {
        if (!down || e.pointerId !== down.id) return;
        const dx = e.clientX - down.x;
        if (!down.moved) { if (Math.abs(dx) < 8) return; down.moved = true; row.classList.add('is-grabbing'); try { row.setPointerCapture(e.pointerId); } catch (_) {} track.style.animation = 'none'; }
        let v = down.start + dx; while (v <= -down.p) v += down.p; while (v > 0) v -= down.p;
        down.v = v; track.style.transform = 'translateX(' + v + 'px)';
      }, sig);
      const end = () => {
        if (!down) return; const d = down; down = null;
        row.classList.remove('is-grabbing');
        if (!d.moved) return;
        const guard = ev => { ev.preventDefault(); ev.stopPropagation(); };
        row.addEventListener('click', guard, {capture: true, once: true});
        setTimeout(() => row.removeEventListener('click', guard, {capture: true}), 0);
        /* Carry on from where the chips were left. */
        const dur = Math.max(1, num(st.s.scroll_duration, 40));
        let progress = Math.min(0.999, Math.max(0, -(d.v ?? d.start) / d.p));
        if (row.dataset.direction === 'right') progress = 1 - progress;
        track.style.transform = ''; track.style.animation = '';
        track.style.animationDelay = -(progress * dur) + 's';
      };
      row.addEventListener('pointerup', end, sig); row.addEventListener('pointercancel', end, sig);
      row.addEventListener('dragstart', e => e.preventDefault(), sig);
    },
    motion(root, st) {
      root.classList.toggle('is-offscreen', !st.visible || document.hidden);
      for (const row of root.querySelectorAll('[data-scol-row]')) row.classList.toggle('is-paused', !!st.paused);
      if (!st.reduced.matches) TYPES['scrolling-collection'].fill(root, st);
    },
    stop(root, st) { cancelAnimationFrame(st.fillFrame); },
  };
  TYPES['collection-lookbook'] = {
    init(root, st) {
      const T = TYPES['collection-lookbook'], sig = {signal: st.abort.signal};
      const track = root.querySelector('[data-lcb-track]'); if (!track) return;
      const slides = () => [...track.querySelectorAll('.lcb__slide')];
      const step = () => { const l = slides(); if (l.length > 1) return l[1].offsetLeft - l[0].offsetLeft; return l[0] ? l[0].offsetWidth : track.clientWidth; };
      const max = () => Math.max(0, track.scrollWidth - track.clientWidth);
      const behavior = () => st.reduced.matches ? 'auto' : 'smooth';
      st.go = (i, user) => {
        const n = slides().length; if (!n) return;
        const atEnd = track.scrollLeft >= max() - 2;
        if (i > n - 1 || (i > st.index && atEnd)) i = 0;
        if (i < 0) i = n - 1;
        track.scrollTo({left: Math.min(max(), Math.max(0, i * step())), behavior: behavior()});
        if (user) T.motion(root, st, true);
      };
      st.index = 0;
      const sync = () => {
        const s = step() || 1, end = track.scrollLeft >= max() - 2, dots = [...root.querySelectorAll('[data-lcb-dot]')];
        st.index = end && max() > 0 ? dots.length - 1 : Math.round(track.scrollLeft / s);
        dots.forEach((d, i) => { if (i === st.index) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
        const prev = root.querySelector('[data-lcb-prev]'), next = root.querySelector('[data-lcb-next]');
        if (prev) prev.setAttribute('aria-disabled', String(track.scrollLeft <= 2));
        if (next) next.setAttribute('aria-disabled', String(end));
      };
      track.addEventListener('scroll', () => { cancelAnimationFrame(st.syncFrame); st.syncFrame = requestAnimationFrame(sync); }, {passive: true, signal: st.abort.signal});
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-lcb-prev],[data-lcb-next],[data-lcb-dot]'); if (!b || !root.contains(b)) return;
        if (b.hasAttribute('data-lcb-dot')) { track.scrollTo({left: Math.min(max(), +b.dataset.lcbDot * step()), behavior: behavior()}); T.motion(root, st, true); return; }
        if (b.getAttribute('aria-disabled') === 'true') return;
        const dir = b.hasAttribute('data-lcb-next') ? 1 : -1;
        track.scrollTo({left: Math.min(max(), Math.max(0, track.scrollLeft + dir * step())), behavior: behavior()});
        T.motion(root, st, true);
      }, sig);
      track.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        track.scrollTo({left: Math.min(max(), Math.max(0, track.scrollLeft + (e.key === 'ArrowRight' ? 1 : -1) * step())), behavior: behavior()});
      }, sig);
      /* Mouse drag (touch and pen scroll natively). */
      let down = null;
      track.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = {x: e.clientX, left: track.scrollLeft, moved: false, id: e.pointerId}; }, sig);
      track.addEventListener('pointermove', e => {
        if (!down || e.pointerId !== down.id) return;
        const dx = e.clientX - down.x;
        if (!down.moved) { if (Math.abs(dx) < 6) return; down.moved = true; track.classList.add('is-dragging'); try { track.setPointerCapture(e.pointerId); } catch (_) {} }
        track.scrollLeft = down.left - dx;
      }, sig);
      const end = () => {
        if (!down) return; const d = down; down = null;
        if (!d.moved) return;
        track.classList.remove('is-dragging');
        const guard = ev => { ev.preventDefault(); ev.stopPropagation(); };
        track.addEventListener('click', guard, {capture: true, once: true});
        setTimeout(() => track.removeEventListener('click', guard, {capture: true}), 0);
        const s = step() || 1; track.scrollTo({left: Math.min(max(), Math.round(track.scrollLeft / s) * s), behavior: behavior()});
      };
      track.addEventListener('pointerup', end, sig); track.addEventListener('pointercancel', end, sig);
      track.addEventListener('dragstart', e => e.preventDefault(), sig);
      root.addEventListener('pointerenter', () => { st.hover = true; T.motion(root, st); }, sig);
      root.addEventListener('pointerleave', () => { st.hover = false; T.motion(root, st); }, sig);
      root.addEventListener('focusin', () => { st.focus = true; T.motion(root, st); }, sig);
      root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) { st.focus = false; T.motion(root, st); } }, sig);
      st.io = new IntersectionObserver(es => { for (const e of es) st.visible = e.isIntersecting; T.motion(root, st); });
      st.io.observe(root);
      T.motion(root, st);
    },
    /* Autoplay: on screen, tab shown, motion welcome, not hovered (when asked) or focused. */
    motion(root, st, restart) {
      const s = st.s;
      const run = bool(s.autoplay) && st.visible && !document.hidden && !(st.hover && bool(s.pause_on_hover)) && !st.focus && !st.reduced.matches && root.querySelectorAll('.lcb__slide').length > 1;
      const ms = Math.max(2, num(s.autoplay_speed, 4)) * 1000;
      if (st.timer && (!run || restart || st.timerMs !== ms)) { clearInterval(st.timer); st.timer = 0; }
      if (run && !st.timer) { st.timerMs = ms; st.timer = setInterval(() => { if (!root.isConnected) { clearInterval(st.timer); st.timer = 0; return; } st.go(st.index + 1); }, ms); }
      root.dataset.clRunning = st.timer ? 'true' : 'false';
    },
    stop(root, st) { clearInterval(st.timer); st.timer = 0; cancelAnimationFrame(st.syncFrame); },
  };
  TYPES['collectionnlist'] = {
    init(root, st) {
      const sig = {signal: st.abort.signal};
      const activate = id => {
        for (const m of root.querySelectorAll('.cnl__media [data-cnl-img]')) m.classList.toggle('is-active', m.dataset.cnlImg === id);
        for (const l of root.querySelectorAll('.cnl__link')) { if (l.dataset.cnlFor === id) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); }
      };
      const on = e => { const l = e.target.closest && e.target.closest('.cnl__link'); if (l && root.contains(l)) activate(l.dataset.cnlFor); };
      root.addEventListener('pointerover', on, sig);
      root.addEventListener('focusin', on, sig);
    },
  };
  TYPES['collection-list2'] = {
    init(root, st) {
      const T = TYPES['collection-list2'];
      st.io = new IntersectionObserver(es => { for (const e of es) st.visible = e.isIntersecting; T.motion(root, st); });
      st.io.observe(root);
      T.motion(root, st);
    },
    /* Background videos play only on screen, in a shown tab, with motion welcome. */
    motion(root, st) {
      const stop = st.reduced.matches || document.hidden || !st.visible;
      for (const v of root.querySelectorAll('video')) {
        if (st.reduced.matches) { v.autoplay = false; v.removeAttribute('autoplay'); v.controls = true; }
        if (stop && !v.paused) { v.pause(); v.dataset.clPaused = ''; }
        else if (!stop && 'clPaused' in v.dataset) { delete v.dataset.clPaused; const p = v.play && v.play(); if (p && p.catch) p.catch(() => {}); }
      }
    },
  };
  TYPES['collection-list'] = {
    init(root, st) {
      const T = TYPES['collection-list'];
      st.io = new IntersectionObserver(es => { for (const e of es) st.visible = e.isIntersecting; T.motion(root, st); });
      st.io.observe(root);
      /* The theme builds the carousel when it comes near the screen; wait for it, then stop looking. */
      st.motionTimer = setInterval(() => { const el = root.querySelector('[data-cl-slider]'); if (!el || el.globalSlide) { clearInterval(st.motionTimer); T.motion(root, st); } }, 250);
      T.motion(root, st);
    },
    /* The carousel's autoplay runs only on screen, in a shown tab, with motion welcome. */
    motion(root, st) {
      const el = root.querySelector('[data-cl-slider]'), sw = el && el.globalSlide;
      const stop = st.reduced.matches || document.hidden || !st.visible;
      if (sw && !sw.destroyed) {
        if (st.reduced.matches) sw.params.speed = 0;
        if (sw.autoplay) {
          if (stop && sw.autoplay.running) sw.autoplay.stop();
          else if (!stop && el.dataset.autoplay === 'true' && !sw.autoplay.running) sw.autoplay.start();
        }
      }
    },
    stop(root, st) { clearInterval(st.motionTimer); },
  };
  function drop(root, st) {
    if (st.io) st.io.disconnect();
    if (st.ro) st.ro.disconnect();
    st.abort.abort();
    const type = TYPES[root.dataset.clRoot]; if (type && type.stop) type.stop(root, st);
    roots.delete(root);
  }
  function add(root) {
    const type = TYPES[root.dataset.clRoot]; if (!type) return;
    const st = {root, s: {...parse(root.dataset.clDefaults), ...parse(root.dataset.clSettings)}, visible: true, reduced: matchMedia('(prefers-reduced-motion: reduce)'), abort: new AbortController()};
    if (type.motion) st.reduced.addEventListener('change', () => type.motion(root, st), {signal: st.abort.signal});
    roots.set(root, st);
    if (type.init) type.init(root, st);
    root.dataset.clReady = '';
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) add(root);
  }
  document.addEventListener('visibilitychange', () => { for (const [root, st] of roots) { const type = TYPES[root.dataset.clRoot]; if (type.motion) type.motion(root, st); } });
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaCollections = {scan, runtime: true};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
