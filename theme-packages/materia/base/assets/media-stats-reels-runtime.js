/* Materia Themes. The stats-reels Image and video sections on the storefront
   (Image With Text Stats, Reels Wall, Shoppable Video): muted autoplay video
   only in view (never under reduced motion), play and sound buttons, the
   stats ring reveal, mouse drag on the scrollers, the scroll-snap carousels
   (arrows, dots, keys, autoplay that holds off screen, on hover and on
   focus). Options are read from the section's settings (data-msr-settings).
   Image With Text Steps needs no script. The builder loads
   media-live-stats-reels.js instead (the same plus live edits), so this
   file stands down there. */
(() => {
  if (window.MateriaMediaStatsReelsRuntime || window.MateriaMediaStatsReels || (window.Shopify && window.Shopify.designMode)) return;
  const roots = new Map();
  const parse = v => { try { return JSON.parse(v || '{}') || {}; } catch (_) { return {}; } };
  const bool = v => { v = v && typeof v === 'object' && 'value' in v ? v.value : v; return v === true || v === 'true' || v === 1; };
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const px = (v, d = 0) => num(v, d) + 'px';
  const desk = matchMedia('(min-width: 768px)'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const prop = (el, k, v) => { if (!el) return; if (v === '' || v == null) { if (el.style.getPropertyValue(k) !== '') el.style.removeProperty(k); } else if (el.style.getPropertyValue(k).trim() !== String(v)) el.style.setProperty(k, String(v)); };
  const hide = (el, on) => { if (el && el.hidden !== !!on) el.hidden = !!on; };
  const attr = (el, k, v) => { if (!el) return; if (v == null || v === false) { if (el.hasAttribute(k)) el.removeAttribute(k); } else if (el.getAttribute(k) !== String(v)) el.setAttribute(k, v); };

  /* ---------- shared: video playback (muted autoplay only in view, never under reduced motion) ---------- */
  function videos(root, st, autoplayOf) {
    const seen = new WeakSet(), vis = new WeakMap();
    const want = v => vis.get(v) && !document.hidden && (v.dataset.msrUser === 'play' || (v.dataset.msrUser !== 'pause' && !reduce.matches && autoplayOf(v)));
    const button = v => v.closest('[data-msr-media]')?.querySelector('[data-msr-play]');
    const mark = v => { const b = button(v); if (!b) return; const on = !v.paused; b.classList.toggle('is-playing', on); attr(b, 'aria-pressed', String(on)); attr(b, 'aria-label', on ? b.dataset.labelPause || 'Pause' : b.dataset.labelPlay || 'Play'); };
    const embed = (f, play) => { try { const yt = /youtube/.test(f.src); f.contentWindow?.postMessage(yt ? JSON.stringify({event: 'command', func: play ? 'playVideo' : 'pauseVideo', args: ''}) : JSON.stringify({method: play ? 'play' : 'pause'}), '*'); } catch (_) {} };
    const sync = v => {
      if (v.tagName === 'IFRAME') { const on = !!want(v); if (v.dataset.msrPlaying !== String(on)) { v.dataset.msrPlaying = String(on); embed(v, on); } return; }
      if (want(v)) { if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } } else if (!v.paused) v.pause();
    };
    const io = new IntersectionObserver(es => { for (const e of es) { vis.set(e.target, e.isIntersecting); sync(e.target); } }, {threshold: 0.35});
    const all = () => root.querySelectorAll('video[data-msr-video], iframe[data-msr-embed]');
    const bind = () => {
      for (const v of all()) {
        if (seen.has(v)) continue; seen.add(v); io.observe(v);
        if (v.tagName === 'VIDEO') { v.addEventListener('play', () => mark(v), {signal: st.ac.signal}); v.addEventListener('pause', () => mark(v), {signal: st.ac.signal}); mark(v); }
        else v.addEventListener('load', () => { v.dataset.msrPlaying = ''; sync(v); }, {signal: st.ac.signal});
      }
    };
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-msr-play]'); if (!b || !root.contains(b)) return;
      e.preventDefault(); e.stopPropagation();
      const v = b.closest('[data-msr-media]')?.querySelector('video[data-msr-video]'); if (!v) return;
      v.dataset.msrUser = v.paused ? 'play' : 'pause';
      if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
    }, {signal: st.ac.signal});
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-msr-sound]'); if (!b || !root.contains(b)) return;
      e.preventDefault(); e.stopPropagation();
      const v = b.closest('[data-msr-media]')?.querySelector('video[data-msr-video]'); if (!v) return;
      v.muted = !v.muted; b.classList.toggle('is-on', !v.muted); attr(b, 'aria-pressed', String(!v.muted));
    }, {signal: st.ac.signal});
    document.addEventListener('visibilitychange', () => { for (const v of all()) sync(v); }, {signal: st.ac.signal});
    st.cleanup.push(() => io.disconnect());
    st.syncVideos = () => { bind(); for (const v of all()) sync(v); };
    bind();
  }

  /* ---------- shared: mouse drag on a horizontal scroller (touch scrolls natively) ---------- */
  function drag(track, st, cls) {
    let down = false, moved = false, x0 = 0, s0 = 0;
    const sig = {signal: st.ac.signal};
    track.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; moved = false; x0 = e.clientX; s0 = track.scrollLeft; }, sig);
    window.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - x0; if (!moved && Math.abs(dx) < 6) return; if (!moved) { moved = true; track.classList.add(cls); } track.scrollLeft = s0 - dx; }, sig);
    const up = () => { if (!down) return; down = false; if (moved) { track.classList.remove(cls); track.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, {capture: true, once: true}); const step = st.step ? st.step() : 0; if (step) track.scrollTo({left: Math.round(track.scrollLeft / step) * step, behavior: reduce.matches ? 'auto' : 'smooth'}); } };
    window.addEventListener('pointerup', up, sig); window.addEventListener('blur', up, sig);
    track.addEventListener('dragstart', e => e.preventDefault(), sig);
  }

  /* ---------- shared: autoplay timer that runs only in view, tab visible, not hovered/focused ---------- */
  function ticker(el, st, enabled, delay, tick) {
    let timer = 0, every = 0, inView = false, held = false;
    const sig = {signal: st.ac.signal};
    const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
    /* Starts, stops or retimes the timer only when something it depends on changed. */
    const run = () => {
      const on = inView && !held && !document.hidden && !reduce.matches && enabled(), ms = Math.max(1500, delay());
      if (on && timer && ms !== every) stop();
      if (on && !timer) { every = ms; timer = setInterval(tick, ms); } else if (!on) stop();
    };
    const io = new IntersectionObserver(es => { inView = es[es.length - 1].isIntersecting; run(); }, {threshold: 0.2});
    io.observe(el);
    for (const [n, h] of [['pointerenter', true], ['pointerleave', false], ['focusin', true], ['focusout', false]]) el.addEventListener(n, () => { held = h; run(); }, sig);
    document.addEventListener('visibilitychange', run, sig);
    st.cleanup.push(() => { io.disconnect(); stop(); });
    return {sync: run, active: () => !!timer};
  }

  /* ================= Image With Text Stats ================= */
  const STATS = {
    init(root, st) {
      if (root.dataset.iwsReveal === 'pending') {
        const done = () => { root.dataset.iwsReveal = 'done'; io.disconnect(); };
        const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) done(); }, {threshold: 0.25});
        if (reduce.matches) done(); else io.observe(root);
        st.cleanup.push(() => io.disconnect());
      }
      const grid = root.querySelector('[data-iws-grid]'), fill = root.querySelector('[data-iws-progress]');
      videos(root, st, v => st.block(v.closest('[data-msr-block]'))?.autoplay !== false);
      if (!grid) return;
      st.step = () => { const slot = grid.querySelector('.iws__slot'); return slot ? slot.offsetWidth + num(st.s.media_gap, 12) : grid.clientWidth; };
      const carousel = () => grid.classList.contains('iws__media-grid--carousel');
      const progress = () => { const max = grid.scrollWidth - grid.clientWidth; prop(root, '--iws-progress', (max > 0 ? Math.min(100, Math.max(0, grid.scrollLeft / max * 100)) : 100).toFixed(1) + '%'); };
      let frame = 0;
      grid.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; progress(); }); }, {passive: true, signal: st.ac.signal});
      grid.addEventListener('keydown', e => { if (!carousel() || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); grid.scrollBy({left: (e.key === 'ArrowLeft' ? -1 : 1) * st.step(), behavior: reduce.matches ? 'auto' : 'smooth'}); }, {signal: st.ac.signal});
      drag(grid, st, 'iws--dragging');
      st.auto = ticker(grid, st, () => carousel() && bool(st.s.carousel_autoplay), () => num(st.s.carousel_autoplay_speed, 4) * 1000, () => {
        const max = grid.scrollWidth - grid.clientWidth; if (max <= 0) return;
        grid.scrollTo({left: grid.scrollLeft >= max - 2 ? 0 : Math.min(max, grid.scrollLeft + st.step()), behavior: 'smooth'});
      });
      st.progress = progress;
      st.cleanup.push(() => cancelAnimationFrame(frame));
      if (fill) progress();
    },
    /* What the section paints on top of its markup that the visitor needs: the carousel layout, the timer and the videos. */
    paint(root, st) {
      const s = st.s, P = (k, v) => prop(root, k, v);
      const grid = root.querySelector('[data-iws-grid]'), count = grid ? grid.querySelectorAll('.iws__slot').length : 0;
      root.classList.toggle('iws--no-media', !count);
      if (grid) {
        let per = s.per_row || '1.2', layout;
        if (per === 'auto') { per = count <= 1 ? 1 : count === 2 ? 2 : 2.5; layout = count <= 1 ? 'single' : count === 2 ? 'side_by_side' : 'carousel'; }
        else { per = num(per, 1.2); layout = count > per ? 'carousel' : per <= 1 || count <= 1 ? 'single' : 'side_by_side'; }
        for (const l of ['single', 'side_by_side', 'carousel']) grid.classList.toggle('iws__media-grid--' + l, l === layout);
        P('--iws-slot-w', +(100 / per).toFixed(4) + '%');
        attr(grid, 'tabindex', layout === 'carousel' ? '0' : null); attr(grid, 'role', layout === 'carousel' ? 'region' : null);
        hide(root.querySelector('[data-iws-progress]'), !(layout === 'carousel' && count > 1));
        if (layout !== 'carousel' && grid.scrollLeft) grid.scrollLeft = 0;
        st.progress?.(); st.auto?.sync();
      }
      st.syncVideos?.();
    },
  };

  /* ---------- shared: scroll-snap carousel (Reels Wall, Shoppable Video) ---------- */
  function carousel(root, st, opts) {
    const car = root.querySelector('[data-msr-carousel]'); if (!car) return;
    const track = car.querySelector('[data-msr-track]'), sig = {signal: st.ac.signal};
    const slides = () => track.querySelectorAll(':scope > [data-msr-slide]');
    const cols = () => Math.max(1, Math.floor(num(car.style.getPropertyValue(desk.matches ? '--msr-cols-d' : '--msr-cols-m'), 1)));
    const pages = () => Math.max(1, slides().length - cols() + 1);
    const grid = () => car.dataset.mode === 'grid';
    st.step = () => { const s = slides(); return s.length > 1 ? s[1].offsetLeft - s[0].offsetLeft : track.clientWidth || 1; };
    const index = () => Math.max(0, Math.min(pages() - 1, Math.round(track.scrollLeft / st.step())));
    const to = i => track.scrollTo({left: i * st.step(), behavior: reduce.matches ? 'auto' : 'smooth'});
    const go = i => { const n = pages(); to(opts.loop() ? (i % n + n) % n : Math.max(0, Math.min(n - 1, i))); };
    const update = () => {
      const i = grid() ? 0 : index(), n = pages(), loop = opts.loop();
      prop(car, '--msr-i', String(i));
      for (const d of car.querySelectorAll('[data-msr-dot]')) attr(d, 'aria-current', String(+d.dataset.msrDot === i));
      const prev = car.querySelector('[data-msr-prev]'), next = car.querySelector('[data-msr-next]');
      if (prev) prev.disabled = !loop && i <= 0;
      if (next) next.disabled = !loop && i >= n - 1;
    };
    let frame = 0;
    track.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); }, {passive: true, signal: st.ac.signal});
    car.addEventListener('click', e => {
      const t = e.target.closest('[data-msr-dot],[data-msr-prev],[data-msr-next]'); if (!t || !car.contains(t)) return;
      if (t.hasAttribute('data-msr-dot')) go(+t.dataset.msrDot); else go(index() + (t.hasAttribute('data-msr-next') ? 1 : -1));
    }, sig);
    track.addEventListener('keydown', e => {
      if (e.target !== track || grid()) return;
      const k = {ArrowLeft: index() - 1, ArrowRight: index() + 1, Home: 0, End: pages() - 1}[e.key];
      if (k === undefined) return; e.preventDefault(); go(k);
    }, sig);
    drag(track, st, 'is-dragging');
    const auto = ticker(track, st, () => !grid() && opts.autoplay() && pages() > 1, opts.delay, () => { const i = index(); to(i >= pages() - 1 ? 0 : i + 1); });
    st.cleanup.push(() => cancelAnimationFrame(frame));
    /* Applies columns, gap, pages, dots and arrows from settings; nothing is rebuilt. */
    st.layout = ({mode, cm, cd, gap, arrows, dots, mobileOnly, style, position}) => {
      const n = slides().length;
      attr(car, 'data-mode', mode);
      prop(car, '--msr-cols-m', String(cm)); prop(car, '--msr-cols-d', String(cd)); prop(car, '--msr-gap', px(gap));
      const pm = Math.max(1, n - Math.floor(cm) + 1), pd = Math.max(1, n - Math.floor(cd) + 1);
      prop(car, '--msr-p-m', String(pm)); prop(car, '--msr-p-d', String(pd));
      const ctl = car.querySelector('[data-msr-controls]');
      if (ctl) {
        attr(ctl, 'data-d', pd <= 1 ? '' : null); attr(ctl, 'data-m', pm <= 1 ? '' : null);
        attr(ctl, 'data-dots', dots); attr(ctl, 'data-style', style || 'pill'); attr(ctl, 'data-mobile-only', mobileOnly ? '' : null);
        prop(ctl, '--msr-pos', ({left: 'flex-start', right: 'flex-end'})[position] || 'center');
        hide(ctl.querySelector('[data-msr-arrows]'), !arrows);
        for (const d of ctl.querySelectorAll('[data-msr-dot]')) { const k = +d.dataset.msrDot; attr(d, 'data-d', k >= pd ? '' : null); attr(d, 'data-m', k >= pm ? '' : null); }
      }
      if (mode === 'grid' && track.scrollLeft) track.scrollLeft = 0;
      update(); auto.sync();
    };
  }
  const dotsMode = (s, video) => s.carousel_pagination === 'disable' ? 'none' : (video && s.carousel_pagination === 'show_progress_bar') || s.pagination_style === 'progress' ? 'progress' : 'dots';

  /* ================= Reels Wall ================= */
  const REELS = {
    init(root, st) {
      videos(root, st, () => bool(st.s.autoplay_videos));
      carousel(root, st, {loop: () => false, autoplay: () => false, delay: () => 0});
      root.addEventListener('click', e => {
        const b = e.target.closest('.rw-action[data-action="like"], .rw-action[data-action="save"]'); if (!b || !root.contains(b)) return;
        e.preventDefault(); attr(b, 'aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      }, {signal: st.ac.signal});
    },
    paint(root, st) {
      const s = st.s;
      st.layout?.({mode: s.display_mode === 'grid' ? 'grid' : 'carousel', cm: num(s.columns_mobile, 1), cd: num(s.columns, 4), gap: s.column_gap, arrows: bool(s.show_arrow), dots: dotsMode(s), mobileOnly: s.carousel_pagination === 'show_dots_on_mobile', style: s.pagination_style, position: s.pagination_position});
      st.syncVideos?.();
    },
  };

  /* ================= Shoppable Video ================= */
  const VIDEO = {
    init(root, st) {
      videos(root, st, () => bool(st.s.autoplay_videos));
      carousel(root, st, {loop: () => bool(st.s.infinite), autoplay: () => bool(st.s.autoplay_carousel), delay: () => num(st.s.autorotate_speed, 5) * 1000});
    },
    paint(root, st) {
      const s = st.s;
      st.layout?.({mode: 'carousel', cm: num(s.columns_mobile, 1), cd: num(s.columns, 4), gap: s.column_gap, arrows: bool(s.show_arrow), dots: dotsMode(s, true), mobileOnly: s.carousel_pagination === 'show_dots_on_mobile', style: s.pagination_style, position: s.pagination_position});
      st.syncVideos?.();
    },
  };
  const TYPES = {stats: STATS, reels: REELS, video: VIDEO};

  function register(root) {
    const type = TYPES[root.dataset.msr]; if (!type) return;
    const st = {type, s: {...parse(root.dataset.msrDefaults), ...parse(root.dataset.msrSettings)}, defaults: parse(root.dataset.msrBlockDefaults), blocks: new Map(), ac: new AbortController(), cleanup: [], frame: 0};
    st.block = el => {
      if (!el) return {};
      const id = el.dataset.msrBlock;
      if (!st.blocks.has(id)) st.blocks.set(id, parse(el.dataset.msrSettings));
      return {...(st.defaults[el.dataset.msrType] || {}), ...st.blocks.get(id)};
    };
    st.schedule = () => { if (!st.frame) st.frame = requestAnimationFrame(() => { st.frame = 0; if (root.isConnected) paint(root, st); }); };
    for (const m of [desk, reduce]) m.addEventListener('change', st.schedule, {signal: st.ac.signal});
    roots.set(root, st);
    try { type.init(root, st); } catch (e) { console.warn(e); }
    paint(root, st);
  }
  function paint(root, st) {
    try { st.type.paint(root, st); } catch (e) { console.warn(e); }
  }
  function drop(root, st) { st.ac.abort(); cancelAnimationFrame(st.frame); for (const f of st.cleanup) try { f(); } catch (_) {} roots.delete(root); }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll('[data-msr]')) { if (roots.has(root)) roots.get(root).schedule(); else register(root); }
  }
  for (const n of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(n, scan);
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches('[data-msr]') || n.querySelector('[data-msr]'))))) scan();
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaMediaStatsReelsRuntime = {scan, size: () => roots.size, state: root => roots.get(root)};
  scan();
})();
