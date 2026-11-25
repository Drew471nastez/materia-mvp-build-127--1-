/* Materia Themes. Lightbox Gallery and Video Playlist on the storefront:
   the gallery opens in the theme's media viewer (product-page-ui.js, asked
   for when the gallery comes near), and the playlist's player, clip list and
   arrows. The builder loads live-r7-media.js instead (the same plus live
   edits), so this file stands down there. */
(() => {
  if (window.MateriaR7MediaRuntime || window.MateriaR7Media || (window.SlTheme && window.SlTheme.designMode)) return;
  const SEL = '[data-r7m]';
  const roots = new Map();
  const stats = {builds: 0};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 900px)');
  const api = () => window.MateriaHeroImageOne;
  const localUrl = v => { v = v && typeof v === 'object' ? v.src || v.url || v.value : v; if (typeof v !== 'string' || !v || v === '#') return ''; try { return ['http:', 'https:', 'data:', 'blob:'].includes(new URL(v, location.href).protocol) ? v : ''; } catch (_) { return ''; } };
  const url = v => { const a = api() && api().url ? api().url(v, true) : ''; return a || localUrl(v); };
  const smooth = () => reduced.matches ? 'auto' : 'smooth';
  const on = (st, el, type, fn, opts) => { el.addEventListener(type, fn, {...opts, signal: st.ac.signal}); st.listeners++; };
  /* ---------- Lightbox Gallery: the theme's media viewer ---------- */
  let viewer = null, lastTile = null;
  function loadViewer(root) {
    if (viewer) return viewer;
    const css = root.dataset.r7mViewerCss, js = root.dataset.r7mViewerJs;
    const wait = new Promise(done => setTimeout(done, 6000));
    const style = new Promise(done => {
      if (!css || document.querySelector('link[rel="stylesheet"][href*="product-page-ui.css"]')) return done();
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = css; l.onload = l.onerror = () => done(); document.head.append(l);
    });
    const script = new Promise(done => {
      if (window.__mtProductUi) return done();
      const old = document.querySelector('script[src*="product-page-ui.js"]');
      if (!old && !js) return done();
      const s = old || document.createElement('script');
      s.addEventListener('load', () => done()); s.addEventListener('error', () => done());
      if (!old) { s.src = js; document.head.append(s); }
    });
    viewer = Promise.race([Promise.all([style, script]), wait]).then(() => { const ok = !!window.__mtProductUi; if (!ok) viewer = null; return ok; });
    return viewer;
  }
  /* A press before the viewer is in: hold it, bring the viewer in, press again. */
  function hold(e, tile) {
    e.preventDefault(); e.stopPropagation();
    const root = tile.closest(SEL);
    if (!root) return;
    loadViewer(root).then(ok => {
      if (!tile.isConnected) return;
      if (ok) tile.click();
      else if (tile.getAttribute('href') && !root.hasAttribute('data-r7m-settings')) location.assign(tile.href);
    });
  }
  const tileOf = e => e.target && e.target.closest ? e.target.closest('[data-r7m="lightbox-gallery"] [data-r7m-tile]') : null;
  for (const type of ['pointerdown', 'focusin']) document.addEventListener(type, e => { const tile = tileOf(e); if (tile) { lastTile = tile; if (!window.__mtProductUi) loadViewer(tile.closest(SEL)); } }, true);
  document.addEventListener('click', e => { const tile = tileOf(e); if (!tile) return; lastTile = tile; if (!window.__mtProductUi && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) hold(e, tile); }, true);
  document.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const tile = tileOf(e); if (!tile || tile !== e.target) return; lastTile = tile; if (!window.__mtProductUi) hold(e, tile); }, true);
  /* The caption of the picture on show, read from the gallery that opened the viewer. */
  let watching = false;
  function watchViewer() {
    if (watching) return;
    watching = true;
    const hook = () => {
      const d = document.querySelector('dialog.mt-lb'), track = d && d.querySelector('.mt-lb__track');
      if (!track) return false;
      const cap = document.createElement('p');
      cap.className = 'r7-lb-cap'; cap.setAttribute('aria-live', 'polite');
      d.append(cap);
      let map = null, frame = 0;
      const show = () => {
        frame = 0;
        const slides = track.children, i = Math.max(0, Math.min(slides.length - 1, Math.round(Math.abs(track.scrollLeft) / (track.clientWidth || 1))));
        const img = slides[i] && slides[i].querySelector('img'), words = map && img ? map.get(img.getAttribute('src')) || '' : '';
        if (cap.textContent !== words) cap.textContent = words;
      };
      const fill = () => {
        map = null;
        const root = lastTile && lastTile.isConnected ? lastTile.closest(SEL) : null, srcs = [...track.querySelectorAll('img')].map(i => i.getAttribute('src'));
        if (root && srcs.length) {
          const m = new Map();
          for (const tile of root.querySelectorAll('[data-r7m-tile]')) { const c = tile.closest('[data-r7m-block]'), el = c && c.querySelector('[data-r7m-caption]'); m.set(tile.getAttribute('data-mt-src'), el && !el.hidden ? el.textContent.trim() : ''); }
          if (srcs.every(s => m.has(s))) map = m;
        }
        show();
      };
      new MutationObserver(fill).observe(track, {childList: true});
      track.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(show); }, {passive: true});
      fill();
      return true;
    };
    if (hook()) return;
    const mo = new MutationObserver(() => { if (hook()) mo.disconnect(); });
    mo.observe(document.body, {childList: true});
  }
  function gallery(root, st) {
    watchViewer();
    if (window.__mtProductUi || !('IntersectionObserver' in window)) return;
    st.io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { st.io.disconnect(); loadViewer(root); } }, {rootMargin: '300px 0px'});
    st.io.observe(root);
  }

  /* ---------- Video Playlist ---------- */
  function source(d) {
    if (d.file) return {kind: 'file', src: d.file};
    const raw = String(d.url || '').trim();
    if (!raw) return {kind: 'none', src: ''};
    let m = raw.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
    if (m) return {kind: 'youtube', src: m[1]};
    m = raw.match(/vimeo\.com\/(?:[^?#]*\/)?(\d+)/i);
    if (m) return {kind: 'vimeo', src: m[1]};
    const file = url(raw);
    return file ? {kind: 'file', src: file} : {kind: 'none', src: ''};
  }
  const frameSrc = src => src.kind === 'youtube'
    ? 'https://www.youtube-nocookie.com/embed/' + src.src + '?autoplay=0&mute=0&loop=0&playlist=' + src.src + '&controls=1&playsinline=1&rel=0&modestbranding=1'
    : 'https://player.vimeo.com/video/' + src.src + '?autoplay=0&muted=0&loop=0&controls=1&playsinline=1&dnt=1';
  function playlist(root, st) {
    const stage = root.querySelector('[data-vp-stage]'), track = root.querySelector('[data-vp-track]'), box = stage && stage.querySelector('[data-iv-player]');
    if (!box || !track) return;
    const playBtn = stage.querySelector('[data-vp-play]'), prev = root.querySelector('[data-vp-prev]'), next = root.querySelector('[data-vp-next]');
    const items = () => [...root.querySelectorAll('[data-vp-item]')];
    const data = item => { const b = item.querySelector('[data-vp-clip]'); return {file: b.dataset.vpFile || '', url: b.dataset.vpUrl || '', poster: b.dataset.vpPoster || '', title: b.textContent.trim()}; };
    const keyOf = d => { const src = source(d); return src.kind + '|' + src.src + '|' + d.poster; };
    const row = () => !(desktop.matches && root.dataset.list === 'beside');
    const state = v => { if (stage.dataset.state !== v) stage.dataset.state = v; };
    /* back to the cover and the play button: the browser's controls show only once a clip was started */
    const idle = () => { const v = box.querySelector('video.ivp__video'); if (v && v.controls) v.controls = false; state('idle'); };
    const first = items()[0];
    const vp = st.vp = {index: 0, key: first ? keyOf(data(first)) : ''};

    function build(d) {
      stats.builds++;
      const src = source(d), cover = box.querySelector('.ivp__cover'), ph = box.querySelector('.ivp__ph');
      for (const old of box.querySelectorAll('.ivp__video, .ivp__frame')) { if (old.tagName === 'VIDEO') { old.pause(); old.removeAttribute('src'); old.load(); } old.remove(); }
      let el = null;
      if (src.kind === 'file') {
        el = document.createElement('video'); el.className = 'ivp__video'; el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = d.poster ? 'none' : 'metadata';
        if (d.poster) el.poster = d.poster;
        if (d.title) { el.setAttribute('aria-label', d.title); el.title = d.title; }
        el.src = src.src;
      } else if (src.kind !== 'none') {
        el = document.createElement('iframe'); el.className = 'ivp__frame'; el.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); el.allowFullscreen = true; el.title = d.title || root.dataset.r7mLabel || 'Video'; el.dataset.src = frameSrc(src);
      }
      if (cover) {
        const show = src.kind !== 'file' && !!d.poster;
        if (show && cover.getAttribute('src') !== d.poster) { cover.removeAttribute('srcset'); cover.removeAttribute('width'); cover.removeAttribute('height'); cover.src = d.poster; }
        cover.hidden = !show; cover.alt = d.title || '';
        if (el) cover.after(el);
      } else if (el) box.prepend(el);
      if (ph) ph.hidden = src.kind !== 'none' || !!d.poster;
      box.dataset.kind = src.kind;
      if (playBtn) playBtn.hidden = src.kind === 'none';
      state('idle');
    }
    function start() {
      const v = box.querySelector('video.ivp__video'), f = box.querySelector('iframe.ivp__frame');
      if (v) { v.controls = true; const p = v.play(); if (p && p.catch) p.catch(() => { if (v.isConnected && v.paused) idle(); }); state('playing'); }
      else if (f) { const want = (f.dataset.src || '').replace('autoplay=0', 'autoplay=1'); if (want && f.getAttribute('src') !== want) f.src = want; state('playing'); }
    }
    function reveal(item) {
      const t = track.getBoundingClientRect(), r = item.getBoundingClientRect();
      if (row()) { if (r.left < t.left + 5 || r.right > t.right - 5) track.scrollTo({left: track.scrollLeft + r.left - t.left - 6, behavior: smooth()}); }
      else if (r.top < t.top || r.bottom > t.bottom) track.scrollTo({top: track.scrollTop + r.top - t.top, behavior: smooth()});
    }
    function select(i, play) {
      const list = items();
      if (!list[i]) return;
      const d = data(list[i]), key = keyOf(d);
      list.forEach((item, n) => {
        const now = String(n === i), b = item.querySelector('[data-vp-clip]');
        if (item.dataset.active !== now) item.dataset.active = now;
        if (b && b.getAttribute('aria-current') !== now) b.setAttribute('aria-current', now);
      });
      if (i !== vp.index || key !== vp.key) { vp.index = i; vp.key = key; build(d); }
      reveal(list[i]);
      if (play) start();
    }
    let frame = 0;
    const arrows = () => {
      frame = 0;
      if (!prev || !next || !root.isConnected) return;
      /* the arrows are drawn from 900px up, beside the row only */
      const max = track.scrollWidth - track.clientWidth, x = Math.abs(track.scrollLeft), off = !desktop.matches || !row() || max <= 1;
      const p = off || x <= 1, n = off || x >= max - 1;
      if (prev.disabled !== p) prev.disabled = p;
      if (next.disabled !== n) next.disabled = n;
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(arrows); };
    const card = () => { const item = root.querySelector('[data-vp-item]'); return item ? item.offsetWidth + 16 : 200; };
    const dir = () => getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    const page = by => { const w = card(); track.scrollBy({left: by * dir() * Math.max(w, track.clientWidth - w), behavior: smooth()}); };

    vp.select = item => { const i = items().indexOf(item); if (i > -1 && i !== vp.index) select(i, false); else if (i > -1) reveal(item); };
    vp.refresh = item => { if (items().indexOf(item) !== vp.index) return; const d = data(item), key = keyOf(d); if (key !== vp.key) { vp.key = key; build(d); } };
    vp.layout = queue;

    on(st, root, 'click', e => {
      const t = e.target;
      if (!t || !t.closest) return;
      /* the play button, or anywhere on the cover while nothing was started */
      if (t.closest('[data-vp-play]') || (stage.dataset.state === 'idle' && playBtn && !playBtn.hidden && t.closest('[data-vp-stage]'))) { start(); return; }
      const clip = t.closest('[data-vp-clip]');
      if (clip) { select(items().indexOf(clip.closest('[data-vp-item]')), true); return; }
      if (t.closest('[data-vp-prev]')) page(-1);
      else if (t.closest('[data-vp-next]')) page(1);
    });
    on(st, track, 'scroll', queue, {passive: true});
    on(st, track, 'keydown', e => {
      if ((e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || !row()) return;
      const by = (e.key === 'ArrowRight' ? 1 : -1) * dir(), clip = e.target.closest ? e.target.closest('[data-vp-clip]') : null;
      e.preventDefault();
      if (clip) { const list = items(), to = list[list.indexOf(clip.closest('[data-vp-item]')) + by], b = to && to.querySelector('[data-vp-clip]'); if (b) { b.focus({preventScroll: true}); reveal(to); } }
      else track.scrollBy({left: by * dir() * card(), behavior: smooth()});
    });
    for (const type of ['play', 'playing']) on(st, stage, type, () => state('playing'), {capture: true});
    on(st, stage, 'pause', e => { if (!e.target.ended) state('paused'); }, {capture: true});
    on(st, stage, 'ended', () => {
      if (root.dataset.next === 'true' && !reduced.matches && vp.index < items().length - 1) select(vp.index + 1, true);
      else idle();
    }, {capture: true});
    if ('IntersectionObserver' in window) {
      st.io = new IntersectionObserver(entries => { for (const e of entries) if (!e.isIntersecting) { const v = box.querySelector('video'); if (v && !v.paused) v.pause(); } });
      st.io.observe(stage);
    }
    if ('ResizeObserver' in window) { st.ro = new ResizeObserver(queue); st.ro.observe(track); }
    queue();
  }
  const runtimes = {'lightbox-gallery': gallery, 'video-playlist': playlist};

  function drop(root, st) {
    st.ac.abort();
    if (st.io) st.io.disconnect();
    if (st.ro) st.ro.disconnect();
    roots.delete(root);
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) {
      if (roots.has(root) || !runtimes[root.dataset.r7m]) continue;
      const st = {root, type: root.dataset.r7m, listeners: 0, ac: new AbortController(), io: null, ro: null, vp: null};
      roots.set(root, st);
      runtimes[st.type](root, st);
    }
  }
  for (const name of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(name, () => scan());
  desktop.addEventListener('change', () => { for (const st of roots.values()) if (st.vp) st.vp.layout(); });
  let queued = 0;
  new MutationObserver(records => {
    if (queued) return;
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) queued = requestAnimationFrame(() => { queued = 0; scan(); });
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaR7MediaRuntime = {scan, roots};
  scan();
})();
