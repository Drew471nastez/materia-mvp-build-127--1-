/* Materia Themes. The image-video Image and video sections on the storefront
   (Image, Video, Video 2): the video player (snippets/media-iv-player). A
   file plays on its own only while on screen, the tab is visible and reduced
   motion is not asked for; an embed gets its address once it comes on
   screen; the play and sound buttons. The player's options are read from
   the section's settings (data-iv-settings). The builder loads
   media-live-image-video.js instead (the same plus live edits), so this file
   stands down there. */
(() => {
  if (window.MateriaMediaImageVideoRuntime || window.MateriaMediaImageVideo || (window.SlTheme && window.SlTheme.designMode)) return;
  const roots = new Map(), players = new Map(), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stats = {listeners: 0, builds: 0};
  const parse = v => { try { return JSON.parse(v || '{}') || {}; } catch (_) { return {}; } };
  const bool = v => v === true || v === 'true';
  const api = () => window.MateriaHeroImageOne;
  const url = (v, image) => api() ? api().url(v, image) : (typeof v === 'string' ? v : '');
  const cls = (el, c, on) => { if (el && el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); };
  const hide = (el, h) => { if (el && el.hidden !== !!h) el.hidden = !!h; };
  const attr = (el, k, v) => { if (!el) return; if (v == null || v === false) { if (el.hasAttribute(k)) el.removeAttribute(k); } else if (el.getAttribute(k) !== String(v)) el.setAttribute(k, v); };
  const listen = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); stats.listeners++; return () => { el.removeEventListener(type, fn, opts); stats.listeners--; }; };

  /* ---------- player ---------- */
  function videoSource(v) {
    if (v && typeof v === 'object') {
      const list = Array.isArray(v.sources) ? v.sources : [];
      const s = list.find(x => x && (x.format === 'mp4' || x.mime_type === 'video/mp4')) || list[0];
      return url(s ? s.url || s.src : v.url || v.src || v.value, true);
    }
    return '';
  }
  function source(p) {
    const file = videoSource(p.video);
    if (file) return {kind: 'file', src: file};
    const raw = typeof p.url === 'string' ? p.url.trim() : url(p.url);
    if (!raw) return {kind: 'none', src: ''};
    let m = raw.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
    if (m) return {kind: 'youtube', src: m[1]};
    m = raw.match(/vimeo\.com\/(?:[^?#]*\/)?(\d+)/i);
    if (m) return {kind: 'vimeo', src: m[1]};
    const file2 = url(raw, true);
    return file2 ? {kind: 'file', src: file2} : {kind: 'none', src: ''};
  }
  function posterOf(p) { return url(p.poster, true) || (p.video && typeof p.video === 'object' ? url(p.video.preview_image, true) : ''); }
  function frameSrc(kind, id, p) {
    const auto = p.autoplay && !reduced.matches ? 1 : 0, mute = p.autoplay || p.muted ? 1 : 0, loop = p.loop ? 1 : 0, controls = p.controls || !auto ? 1 : 0;
    return kind === 'youtube'
      ? 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=' + auto + '&mute=' + mute + '&loop=' + loop + '&playlist=' + id + '&controls=' + controls + '&playsinline=1&rel=0&modestbranding=1'
      : 'https://player.vimeo.com/video/' + id + '?autoplay=' + auto + '&muted=' + mute + '&loop=' + loop + '&controls=' + controls + '&playsinline=1&dnt=1';
  }
  function playerState(box, p) {
    let ps = players.get(box);
    if (ps) return ps;
    const src = source(p);
    ps = {box, key: src.kind + '|' + src.src, kind: box.dataset.kind || src.kind, poster: posterOf(p), visible: false, seen: false, userPaused: false, userPlayed: false, resume: false, autoTried: false, autoplay: null, mute: null, off: []};
    const toggle = () => { const v = box.querySelector('video'); if (!v) return; if (v.paused || v.ended) { ps.userPlayed = true; ps.userPaused = false; if (!ps.p.autoplay && !ps.p.muted) v.muted = false; v.play()?.catch(() => {}); } else { ps.userPaused = true; ps.userPlayed = false; v.pause(); } };
    ps.off.push(listen(box, 'click', e => {
      if (e.target.closest('[data-iv-play]')) { e.preventDefault(); toggle(); }
      else if (e.target.closest('[data-iv-mute]')) { const v = box.querySelector('video'); if (v) { v.muted = !v.muted; ps.userSound = !v.muted; } }
      else if (e.target.tagName === 'VIDEO' && !e.target.controls && ps.p.play !== 'none') toggle();
    }));
    const sync = () => { const v = box.querySelector('video'), playing = !!v && !v.paused && !v.ended; box.dataset.state = playing ? 'playing' : 'paused'; const play = box.querySelector('[data-iv-play]'); attr(play, 'aria-label', playing ? 'Pause video' : 'Play video'); const mute = box.querySelector('[data-iv-mute]'); if (mute && v) { attr(mute, 'aria-pressed', String(!v.muted)); attr(mute, 'aria-label', v.muted ? 'Turn sound on' : 'Turn sound off'); } };
    for (const type of ['play', 'playing', 'pause', 'ended', 'volumechange']) ps.off.push(listen(box, type, sync, true));
    ps.sync = sync;
    players.set(box, ps);
    io.observe(box);
    return ps;
  }
  function build(box, ps, src, p) {
    stats.builds++;
    for (const old of box.querySelectorAll('.ivp__video, .ivp__frame')) { if (old.tagName === 'VIDEO') { old.pause(); old.removeAttribute('src'); } old.remove(); }
    const cover = box.querySelector('.ivp__cover');
    let el = null;
    if (src.kind === 'file') {
      el = document.createElement('video'); el.className = 'ivp__video'; el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = p.lazy ? 'none' : 'metadata';
      el.muted = !!(p.autoplay || p.muted); if (el.muted) el.setAttribute('muted', '');
      el.src = src.src;
    } else if (src.kind !== 'none') {
      el = document.createElement('iframe'); el.className = 'ivp__frame'; el.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); el.allowFullscreen = true; el.loading = 'lazy'; el.dataset.id = src.src;
    }
    if (el) cover.after(el);
    box.dataset.kind = src.kind; box.dataset.state = 'paused';
    Object.assign(ps, {kind: src.kind, autoTried: false, userPaused: false, userPlayed: false, resume: false, mute: null});
  }
  function player(box, p) {
    const ps = playerState(box, p), src = source(p), key = src.kind + '|' + src.src;
    ps.p = p;
    if (key !== ps.key) { ps.key = key; build(box, ps, src, p); }
    const kind = ps.kind, video = box.querySelector('video.ivp__video'), frame = box.querySelector('iframe.ivp__frame'), cover = box.querySelector('.ivp__cover');
    const poster = posterOf(p), posterChanged = poster !== ps.poster;
    ps.poster = poster;
    cls(box, 'ivp--contain', p.fit === 'contain');
    for (const style of ['circle', 'outline', 'none']) cls(box, 'ivp--play-' + style, p.play === style);
    if (cover) {
      const show = kind !== 'file' && !!poster;
      if (show && (posterChanged || !cover.getAttribute('src'))) { cover.removeAttribute('srcset'); cover.src = poster; }
      hide(cover, !show); attr(cover, 'alt', p.label || ''); attr(cover, 'loading', p.lazy ? 'lazy' : null);
    }
    hide(box.querySelector('.ivp__ph'), kind !== 'none' || !!poster);
    hide(box.querySelector('[data-iv-play]'), !(kind === 'file' && p.play !== 'none' && !p.controls));
    hide(box.querySelector('[data-iv-mute]'), !(p.muteBtn && kind === 'file'));
    if (video) {
      if (video.loop !== !!p.loop) video.loop = !!p.loop;
      if (video.controls !== !!p.controls) video.controls = !!p.controls;
      const preload = p.lazy ? 'none' : 'metadata'; if (video.getAttribute('preload') !== preload) video.preload = preload;
      if (posterChanged || (poster && !video.getAttribute('poster'))) { if (poster) video.poster = poster; else video.removeAttribute('poster'); }
      attr(video, 'aria-label', p.label || null); attr(video, 'title', p.title || null);
      const mute = (p.autoplay ? 'a' : '') + (p.muted ? 'm' : '');
      if (ps.mute !== null && mute !== ps.mute) { video.muted = !!(p.autoplay || p.muted); ps.userSound = false; }
      ps.mute = mute;
      if (ps.autoplay !== null && ps.autoplay !== !!p.autoplay) {
        if (p.autoplay) { ps.userPaused = false; ps.autoTried = false; }
        else if (!ps.userPlayed && !video.paused) video.pause();
      }
      ps.autoplay = !!p.autoplay;
      ps.sync();
    }
    if (frame) {
      const want = frameSrc(kind, frame.dataset.id || src.src, p);
      if (ps.seen && frame.getAttribute('src') !== want) frame.src = want;
      attr(frame, 'title', p.title || p.label || 'Video');
    }
    playback(ps);
  }
  function playback(ps) {
    const v = ps.box.querySelector('video.ivp__video');
    if (!v || !ps.p) return;
    const active = ps.visible && !document.hidden;
    if (!active) { if (!v.paused) { ps.resume = true; v.pause(); } return; }
    if (ps.resume) { ps.resume = false; if (!(reduced.matches && !ps.userPlayed)) v.play()?.catch(() => {}); return; }
    if (reduced.matches) { if (!ps.userPlayed && !v.paused) v.pause(); return; }
    if (ps.p.autoplay && !ps.userPaused && !ps.autoTried && v.paused && !v.ended) { ps.autoTried = true; if (!ps.userSound) v.muted = true; v.play()?.catch(() => {}); }
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const ps = players.get(e.target); if (!ps) continue;
      ps.visible = e.isIntersecting; if (e.isIntersecting && !ps.seen) { ps.seen = true; const root = ps.box.closest('[data-iv]'); roots.get(root)?.schedule(); }
      playback(ps);
    }
  }, {threshold: 0.15});


  /* The player's options, as each section's own paint passes them. */
  const params = {
    'image-section'(s) {
      const useVideo = bool(s.use_video) && !!String(s.video_url || '').trim(), alt = s.image_alt || (s.background_image && typeof s.background_image === 'object' ? s.background_image.alt : '') || '';
      return {video: '', url: useVideo ? s.video_url : '', poster: s.background_image, autoplay: true, loop: true, controls: false, muted: true, label: alt, title: '', play: 'circle', muteBtn: false, lazy: false, fit: 'cover'};
    },
    'video-2'(s) {
      return {video: s.video, url: s.video_url, poster: s.poster, autoplay: bool(s.autoplay), loop: bool(s.loop), controls: bool(s.show_controls), muted: bool(s.muted), label: s.video_alt || '', title: '', play: s.play_button_style || 'circle', muteBtn: bool(s.show_mute_btn), lazy: false, fit: 'cover'};
    },
    video(s) {
      const useUrl = bool(s.enable_custom_url_video) && String(s.custom_video_url || '').trim();
      return {video: useUrl ? '' : s.video, url: useUrl ? s.custom_video_url : '', poster: s.video_poster, autoplay: bool(s.video_autoplay), loop: bool(s.video_loop), controls: bool(s.video_controls), muted: bool(s.video_muted), label: s.video_alt || '', title: s.video_metadata || '', play: bool(s.big_play_pause_button) ? s.play_button_style || 'circle' : 'none', muteBtn: false, lazy: bool(s.enable_lazy_loading), fit: s.video_fit || 'cover'};
    },
  };
  function paint(root, state) {
    const box = root.dataset.iv === 'image-section' ? root.querySelector('.iv-img__video [data-iv-player]') : root.querySelector('[data-iv-player]');
    if (box) player(box, params[root.dataset.iv](state.s));
  }
  function cleanup() {
    for (const [root, s] of roots) if (!root.isConnected) { cancelAnimationFrame(s.frame); roots.delete(root); }
    for (const [box, ps] of players) if (!box.isConnected) { io.unobserve(box); for (const off of ps.off) off(); const v = box.querySelector('video'); if (v) v.pause(); players.delete(box); }
  }
  function scan() {
    cleanup();
    for (const root of document.querySelectorAll('[data-iv]')) {
      if (!params[root.dataset.iv]) continue;
      if (roots.has(root)) { roots.get(root).schedule(); continue; }
      const state = {s: {...parse(root.dataset.ivDefaults), ...parse(root.dataset.ivSettings)}, frame: 0};
      state.schedule = () => { if (!state.frame) state.frame = requestAnimationFrame(() => { state.frame = 0; if (root.isConnected) paint(root, state); }); };
      roots.set(root, state);
      paint(root, state);
    }
  }
  for (const name of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(name, scan);
  document.addEventListener('visibilitychange', () => { for (const ps of players.values()) playback(ps); });
  reduced.addEventListener('change', () => { for (const state of roots.values()) state.schedule(); });
  let queued = 0;
  new MutationObserver(records => {
    if (queued) return;
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches('[data-iv],[data-iv-player]') || n.querySelector('[data-iv],[data-iv-player]'))))) queued = requestAnimationFrame(() => { queued = 0; scan(); });
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaMediaImageVideoRuntime = {scan, stats: () => ({roots: roots.size, players: players.size, ...stats})};
  scan();
})();
