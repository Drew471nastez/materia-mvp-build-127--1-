/* Materia Themes. Storefront behaviour of the testimonials sections: slider
   rows (arrows, dots, keyboard, autoplay), videos that play muted and inline
   and pause off screen, read more, the Video Testimonials 5 rail, the Carousel
   Pro drift paused off screen and the Testimonials Grid autoplay only while
   on screen. Once per instance. The theme editor loads live-testimonials.js
   instead (the same plus live setting edits). */
(() => {
  if (window.MateriaLiveTestimonials) return;
  const SEL = '[data-lt-root], [data-tm-root]';
  const roots = new Map();
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const text = (el, v) => { if (el && el.textContent !== String(v ?? '')) el.textContent = v ?? ''; };
  const hide = (el, on) => { if (el && el.hidden !== !!on) el.hidden = !!on; };
  const attr = (el, n, v) => { if (!el) return; if (v == null || v === false) { if (el.hasAttribute(n)) el.removeAttribute(n); } else { const s = v === true ? '' : String(v); if (el.getAttribute(n) !== s) el.setAttribute(n, s); } };
  /* A native scroll row with arrows, dots, keyboard and optional autoplay.
     Mouse dragging comes from global.js ([data-testimonial-row]); touch is native. */
  function slider(st, track, opts = {}) {
    if (!track) return null;
    const root = st.el;
    const prev = opts.prev || root.querySelector('[data-lt-prev]'), next = opts.next || root.querySelector('[data-lt-next]'), dots = opts.dots || root.querySelector('[data-lt-dots]');
    let raf = 0, timer = 0, visible = false, hovered = false, focused = false, ms = 0, loop = false;
    const rtl = () => getComputedStyle(track).direction === 'rtl';
    const cards = () => [...track.children].filter(c => !c.hidden);
    const step = () => { const c = cards()[0]; return (c ? c.getBoundingClientRect().width : track.clientWidth) + (parseFloat(getComputedStyle(track).columnGap) || 0); };
    const max = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const at = () => Math.abs(track.scrollLeft);
    const go = left => track.scrollTo({left: Math.max(0, Math.min(max(), left)) * (rtl() ? -1 : 1), behavior: reduced() ? 'instant' : 'smooth'});
    const page = () => { const s = step(); return s > 0 ? Math.round(at() / s) : 0; };
    const move = dir => { const last = max(), s = step(); if (loop && dir > 0 && at() >= last - 2) go(0); else if (loop && dir < 0 && at() <= 2) go(last); else go((page() + dir) * s); };
    function update() {
      raf = 0;
      if (!track.isConnected) return;
      const last = max(), s = step(), pos = at(), pages = last > 1 && s > 0 ? Math.ceil((last - 2) / s) + 1 : 1, index = Math.min(pages - 1, Math.round(pos / Math.max(1, s)));
      if (prev) prev.disabled = !loop && pos < 2 || pages < 2;
      if (next) next.disabled = !loop && pos >= last - 2 || pages < 2;
      attr(root, 'data-scrolls', pages > 1 ? 'true' : 'false');
      if (dots) {
        if (dots.children.length !== pages) {
          const label = dots.dataset.label || 'Go to slide';
          dots.replaceChildren(...Array.from({length: pages}, (_, i) => { const d = document.createElement('button'); d.type = 'button'; d.className = 'lt-dot'; d.setAttribute('aria-label', label + ' ' + (i + 1)); d.dataset.index = i; return d; }));
        }
        [...dots.children].forEach((d, i) => attr(d, 'aria-current', i === index ? 'true' : 'false'));
      }
      if (opts.onUpdate) opts.onUpdate({pos, last, index, pages});
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    const onPrev = () => move(-1), onNext = () => move(1);
    const onDot = e => { const d = e.target.closest('.lt-dot'); if (d) go(num(d.dataset.index) * step()); };
    const onKey = e => {
      if (e.target !== track) return;
      const k = e.key, dir = rtl() ? -1 : 1;
      if (k === 'ArrowRight' || k === 'ArrowLeft') { move((k === 'ArrowRight' ? 1 : -1) * dir); e.preventDefault(); }
      else if (k === 'Home') { go(0); e.preventDefault(); } else if (k === 'End') { go(max()); e.preventDefault(); }
    };
    prev && prev.addEventListener('click', onPrev);
    next && next.addEventListener('click', onNext);
    dots && dots.addEventListener('click', onDot);
    track.addEventListener('keydown', onKey);
    track.addEventListener('scroll', schedule, {passive: true});
    const ro = 'ResizeObserver' in window ? new ResizeObserver(schedule) : null;
    if (ro) { ro.observe(track); for (const c of track.children) ro.observe(c); } else requestAnimationFrame(schedule);
    /* Autoplay: only while on screen, the tab is shown, nothing is hovered or focused, and motion is allowed. */
    const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
    const start = () => { stop(); if (ms > 0 && visible && !hovered && !focused && !document.hidden && !reduced() && track.isConnected) timer = setInterval(() => { if (!track.isConnected) return stop(); move(1); }, ms); };
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { for (const e of es) visible = e.isIntersecting; start(); }) : null;
    if (io) io.observe(track); else visible = true;
    const hold = e => { if (e.type === 'pointerenter' || e.type === 'pointerleave') hovered = e.type === 'pointerenter'; else focused = e.type === 'focusin'; start(); };
    const evs = ['pointerenter', 'pointerleave', 'focusin', 'focusout'];
    for (const t of evs) root.addEventListener(t, hold);
    const vis = () => start();
    document.addEventListener('visibilitychange', vis);
    const ctl = {
      el: track, update: schedule, go, move,
      get running() { return !!timer; },
      config(o) { ms = Math.max(0, num(o.autoplay)) ; loop = !!o.loop; start(); schedule(); },
      refresh() { if (ro) for (const c of track.children) ro.observe(c); schedule(); },
      destroy() { stop(); cancelAnimationFrame(raf); ro && ro.disconnect(); io && io.disconnect(); prev && prev.removeEventListener('click', onPrev); next && next.removeEventListener('click', onNext); dots && dots.removeEventListener('click', onDot); track.removeEventListener('keydown', onKey); track.removeEventListener('scroll', schedule); for (const t of evs) root.removeEventListener(t, hold); document.removeEventListener('visibilitychange', vis); },
    };
    ctl.config(opts);
    st.off.push(() => ctl.destroy());
    return ctl;
  }
  /* Videos: muted and inline; an autoplay video plays only while on screen and motion is allowed, and pauses off screen. */
  function videos(st, scope = st.el) {
    const list = [...scope.querySelectorAll('video')].filter(v => !st.videos.has(v));
    if (!list.length) return;
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
      for (const e of es) {
        const v = e.target;
        v.__ltSeen = e.isIntersecting;
        if (!e.isIntersecting) { if (!v.paused) { v.__ltOff = true; v.pause(); } }
        else if (v.hasAttribute('data-lt-autoplay') && !reduced() && (v.__ltOff || v.paused && !v.__ltUser)) { v.__ltOff = false; v.muted = v.muted || !v.__ltSound; const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      }
    }, {threshold: 0.15}) : null;
    for (const v of list) {
      st.videos.add(v);
      if (v.hasAttribute('muted')) v.muted = true;
      v.playsInline = true; v.setAttribute('playsinline', '');
      if (reduced() || !('IntersectionObserver' in window)) { v.autoplay = false; v.removeAttribute('autoplay'); if (reduced()) v.pause(); }
      else if (v.hasAttribute('data-lt-autoplay')) { v.autoplay = false; v.removeAttribute('autoplay'); }
      const box = v.parentElement, play = box && box.querySelector(':scope > [data-lt-play]'), mute = box && box.querySelector(':scope > [data-lt-mute]');
      const sync = () => { attr(play, 'data-state', v.paused ? 'paused' : 'playing'); attr(mute, 'data-state', v.muted ? 'muted' : 'unmuted'); attr(play, 'aria-pressed', v.paused ? 'false' : 'true'); attr(mute, 'aria-pressed', v.muted ? 'true' : 'false'); };
      const onPlay = e => { e.preventDefault(); v.__ltUser = !v.paused; if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause(); };
      const onMute = e => { e.preventDefault(); v.muted = !v.muted; sync(); };
      play && play.addEventListener('click', onPlay);
      mute && mute.addEventListener('click', onMute);
      for (const t of ['play', 'pause', 'volumechange']) v.addEventListener(t, sync);
      sync();
      io && io.observe(v);
      st.off.push(() => { io && io.unobserve(v); play && play.removeEventListener('click', onPlay); mute && mute.removeEventListener('click', onMute); for (const t of ['play', 'pause', 'volumechange']) v.removeEventListener(t, sync); });
    }
    if (io) st.off.push(() => io.disconnect());
  }
  function rail(st, section) {
    const viewport = section.querySelector('[data-ctv-viewport]'), track = section.querySelector('[data-ctv-rail]');
    const progress = section.querySelector('[data-ctv-progress]'), fill = section.querySelector('[data-ctv-progress-fill]');
    if (!viewport || !track) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!track.isConnected) return;
      const max = track.scrollWidth - track.clientWidth, fits = max <= 1;
      track.classList.toggle('is-centered', fits); viewport.classList.toggle('is-static', fits);
      if (!progress || !fill) return;
      const pct = fits ? 0 : Math.max(0, Math.min(100, Math.abs(track.scrollLeft) / max * 100));
      fill.style.width = pct + '%'; progress.setAttribute('aria-valuenow', Math.round(pct));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    const onClick = e => { const r = progress.getBoundingClientRect(), pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); track.scrollTo({left: (track.scrollWidth - track.clientWidth) * pct, behavior: reduced() ? 'instant' : 'smooth'}); };
    const onKey = e => { const step = track.clientWidth * 0.8; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { track.scrollBy({left: e.key === 'ArrowRight' ? step : -step, behavior: reduced() ? 'instant' : 'smooth'}); e.preventDefault(); } };
    progress && progress.addEventListener('click', onClick);
    track.addEventListener('scroll', schedule, {passive: true});
    viewport.tabIndex = 0;
    viewport.addEventListener('keydown', onKey);
    const ro = 'ResizeObserver' in window ? new ResizeObserver(schedule) : null;
    if (ro) { ro.observe(track); for (const c of track.children) ro.observe(c); } else requestAnimationFrame(schedule);
    st.off.push(() => { cancelAnimationFrame(raf); ro && ro.disconnect(); progress && progress.removeEventListener('click', onClick); track.removeEventListener('scroll', schedule); viewport.removeEventListener('keydown', onKey); });
  }
  const TYPES = {
    testimonials3(root, st) { slider(st, root.querySelector('[data-lt-track]')); videos(st); },
    testimonials4(root, st) { slider(st, root.querySelector('[data-lt-track]'), {autoplay: num(root.dataset.ltAutoplayS) * 1000, loop: true}); },
    reviews2(root, st) {
      /* the rows drift only while on screen */
      if (!('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver(es => { for (const e of es) attr(root, 'data-lt-paused', e.isIntersecting ? null : true); });
      io.observe(root);
      st.off.push(() => io.disconnect());
    },
    testimon4(root, st) {
      slider(st, root.querySelector('[data-lt-track]'), {loop: true});
      /* Read more: phones and tablets show the first words of each review */
      root.addEventListener('click', e => {
        const btn = e.target.closest('[data-lt-more]');
        if (!btn || !root.contains(btn)) return;
        const p = btn.closest('[data-lt-review]'), open = !p.hasAttribute('data-open');
        attr(p, 'data-open', open || null); attr(btn, 'aria-expanded', open ? 'true' : 'false');
        text(btn, open ? btn.dataset.less : btn.dataset.more);
      });
    },
    'testimonial-video'(root, st) {
      if (root.__ctvInited) return;
      root.__ctvInited = true;
      for (const v of root.querySelectorAll('video')) if (v.hasAttribute('autoplay')) v.setAttribute('data-lt-autoplay', '');
      videos(st);
      rail(st, root);
    },
    testimonials(root, st) {
      /* Auto rotate runs only while the carousel is on screen */
      const sl = root.querySelector('slide-section');
      if (sl && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver(es => { for (const e of es) { const a = sl.globalSlide && sl.globalSlide.autoplay; if (!a || sl.dataset.autoplay !== 'true') continue; if (e.isIntersecting && !reduced()) a.start && a.start(); else a.stop && a.stop(); } });
        io.observe(sl);
        st.off.push(() => io.disconnect());
      }
    },
  };
  function scan() {
    for (const [el, st] of roots) if (!el.isConnected) { for (const f of st.off.splice(0)) { try { f(); } catch (_) {} } roots.delete(el); }
    for (const el of document.querySelectorAll(SEL)) {
      const init = TYPES[el.dataset.ltRoot || el.dataset.tmRoot];
      if (!init || roots.has(el)) continue;
      const st = {el, off: [], videos: new WeakSet()};
      roots.set(el, st);
      init(el, st);
    }
  }
  let queued = 0;
  const later = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; scan(); }); };
  document.addEventListener('shopify:section:load', scan);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, {once: true}); else scan();
  new MutationObserver(ms => { for (const m of ms) for (const n of [...m.addedNodes, ...m.removedNodes]) if (n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))) return later(); }).observe(document.documentElement, {childList: true, subtree: true});
  window.MateriaLiveTestimonials = {scan, runtime: true};
})();
