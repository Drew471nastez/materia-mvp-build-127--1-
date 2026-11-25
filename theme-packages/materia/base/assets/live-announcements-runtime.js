/* Materia Themes. Storefront behaviour of the Announcements sections:
   marquees paused off screen and in a hidden tab (data-paused), the copies of
   a marquee kept on one clock, the close buttons (remembered), and for
   Announcement Bar Pro 2 the rotator (arrows, keys, autoplay held on hover,
   focus, off screen), its countdowns (one tick a second at most) and the
   marquee filled to the bar's width. Once per root. The theme editor loads
   live-announcements.js instead (the same plus live setting edits). */
(() => {
  if (window.MateriaAnnouncements) return;
  const SEL = '[data-an-root]';
  const roots = new Map();
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const design = () => !!(window.Shopify && window.Shopify.designMode) || document.documentElement.classList.contains('shopify-design-mode');
  /* Silent copies of a marquee group: as many as asked, cloned from the first group, each kept on the
     first group's clock so the loop stays seamless. */
  function copies(track, n, st) {
    const groups = () => [...track.children].filter(g => g.classList.contains('scrolling__marquee-wrapper') || g.hasAttribute('data-an-group') || g.hasAttribute('data-an-copies'));
    const all = groups(), first = all.find(g => g.hasAttribute('data-an-group')) || all[0];
    if (!first) return;
    let have = all.length;
    while (have > Math.max(1, n)) { all[have - 1].remove(); have--; }
    while (have < n) {
      const copy = first.cloneNode(true);
      copy.removeAttribute('data-an-group'); copy.setAttribute('data-an-copies', ''); copy.setAttribute('aria-hidden', 'true');
      for (const el of copy.querySelectorAll('[data-an-block]')) {
        el.setAttribute('data-an-copy', el.dataset.anBlock);
        for (const a of [...el.attributes]) if (/^data-(an-block|an-type|an-settings|shopify)/.test(a.name)) el.removeAttribute(a.name);
      }
      for (const img of copy.querySelectorAll('img')) img.alt = '';
      for (const a of copy.querySelectorAll('a, button')) a.tabIndex = -1;
      track.append(copy); have++;
    }
    syncClock(track);
  }
  function syncClock(track) {
    const anims = [...track.children].map(g => g.getAnimations ? g.getAnimations().find(a => a.effect && a.effect.getTiming().iterations === Infinity) : null);
    const lead = anims[0]; if (!lead || lead.currentTime == null) return;
    /* one start time for every copy (a copy still pending would otherwise start a frame late) */
    for (const a of anims.slice(1)) { if (!a) continue; if (lead.startTime != null && a.playState !== 'paused') { if (a.startTime !== lead.startTime) a.startTime = lead.startTime; } else if (a.currentTime !== lead.currentTime) a.currentTime = lead.currentTime; }
  }
  const copiesOf = (root, id) => [...root.querySelectorAll('[data-an-copy="' + CSS.escape(id) + '"]')];

  /* ---------- marquee pause (all marquee sections) ---------- */
  function pauseWhenAway(root, st) {
    const stop = !st.visible || document.hidden;
    if (stop) root.setAttribute('data-paused', ''); else root.removeAttribute('data-paused');
  }
  /* ---------- close button (Basic, Pro 2) ---------- */
  /* Storefront: hides the bar and remembers it (days > 0 in localStorage until then, 0 for this tab).
     Builder: hides it only until the next edit, so the section can still be edited. */
  function closer(root, st, keys) {
    const store = (kind) => { try { return kind === 'local' ? localStorage : sessionStorage; } catch (_) { return null; } };
    if (!design()) {
      try {
        const until = +(store('local')?.getItem(keys.local) || 0);
        if ((until && Date.now() < until) || store('session')?.getItem(keys.session) === '1' || (keys.legacy && keys.legacy())) root.hidden = true;
      } catch (_) {}
    }
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-an-close]'); if (!b || !root.contains(b)) return;
      e.preventDefault();
      if (design()) { root.setAttribute('data-an-dismissed', ''); return; }
      root.hidden = true;
      const days = num(keys.days ? keys.days() : 0);
      try { if (days > 0) store('local')?.setItem(keys.local, String(Date.now() + days * 864e5)); else store('session')?.setItem(keys.session, '1'); } catch (_) {}
    }, {signal: st.abort.signal});
  }

  /* A countdown end: month-day-year with an optional time (local), or anything Date.parse reads. */
  function deadline(v) {
    v = String(v || '').trim(); if (!v) return NaN;
    const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const [mo, d, y, h, mi, sec] = [m[1], m[2], m[3], m[4] || 0, m[5] || 0, m[6] || 0].map(Number);
      const t = new Date(y, mo - 1, d, h, mi, sec);
      return mo >= 1 && mo <= 12 && t.getMonth() === mo - 1 && t.getDate() === d && h < 24 && mi < 60 && sec < 60 ? t.getTime() : NaN;
    }
    const t = Date.parse(v); return Number.isFinite(t) ? t : NaN;
  }
  /* Every countdown of a bar, one tick a second at most, only while the bar is on screen and the tab is shown. */
  function tick(root, st) {
    clearTimeout(st.tickTimer); st.tickTimer = 0;
    if (!root.isConnected) return;
    const now = Date.now(); let running = false;
    for (const t of root.querySelectorAll('[data-an-timer]')) {
      if (!String(t.dataset.end || '').trim()) continue;
      const end = deadline(t.dataset.end);
      if (!Number.isFinite(end)) { if (!t.hidden) t.hidden = true; t.dataset.invalid = 'true'; continue; }
      if (t.dataset.invalid) { delete t.dataset.invalid; t.hidden = false; }
      const left = Math.max(0, Math.floor((end - now) / 1000));
      const v = {d: Math.floor(left / 86400), h: Math.floor(left % 86400 / 3600), m: Math.floor(left % 3600 / 60), s: left % 60};
      for (const u of t.querySelectorAll('[data-u]')) { const x = String(v[u.dataset.u]).padStart(2, '0'); if (u.textContent !== x) u.textContent = x; }
      const ended = left === 0, e = t.querySelector('[data-an-ended]');
      if (t.dataset.ended !== String(ended)) t.dataset.ended = String(ended);
      if (e) { const show = ended && !!e.textContent.trim(); if (e.hidden === show) e.hidden = !show; }
      if (!ended) running = true;
    }
    if (running && st.visible && !document.hidden) st.tickTimer = setTimeout(() => tick(root, st), 1000 - now % 1000 + 10);
  }
  function rotator(root, st) {
    const box = root.querySelector('[data-an-slides]');
    if (!box || st.slideBox === box) return;
    st.slideBox = box;
    if (st.slideAbort) st.slideAbort.abort();
    const ac = new AbortController(), sig = {signal: ac.signal}; st.slideAbort = ac;
    const all = () => [...box.querySelectorAll('.ab2__slide')];
    const list = () => all().filter(x => !x.hidden);
    let hold = false;
    const multi = () => root.dataset.multi === 'true';
    /* the message going out moves up and away while the next one rises in */
    const leave = x => { x.setAttribute('data-leaving', ''); clearTimeout(x.anLeave); x.anLeave = setTimeout(() => x.removeAttribute('data-leaving'), 420); };
    const paint = active => { for (const x of all()) { if (x !== active && x.hasAttribute('data-active')) leave(x); if (x === active && x.hasAttribute('data-leaving')) { clearTimeout(x.anLeave); x.removeAttribute('data-leaving'); } const on = x === active; if (x.hasAttribute('data-active') !== on) x.toggleAttribute('data-active', on); const hide = multi() && !on; if ((x.getAttribute('aria-hidden') === 'true') !== hide) { if (hide) x.setAttribute('aria-hidden', 'true'); else x.removeAttribute('aria-hidden'); } } };
    const show = i => { const l = list(); if (!l.length) return; i = ((i % l.length) + l.length) % l.length; st.slide = l[i]; paint(l[i]); };
    const index = () => Math.max(0, list().indexOf(st.slide));
    st.slide = all().find(x => x.hasAttribute('data-active')) || list()[0];
    box.addEventListener('click', e => { const b = e.target.closest('[data-an-prev],[data-an-next]'); if (!b) return; show(index() + (b.hasAttribute('data-an-next') ? 1 : -1)); restart(); }, sig);
    box.addEventListener('keydown', e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); show(index() + (e.key === 'ArrowRight' ? 1 : -1)); restart(); }, sig);
    for (const [n, v] of [['pointerenter', true], ['pointerleave', false], ['focusin', true], ['focusout', false]]) box.addEventListener(n, () => { hold = v; }, sig);
    /* the editor shows the selected block's message */
    document.addEventListener('shopify:block:select', e => { const x = e.target && e.target.closest && e.target.closest('.ab2__slide'); if (x && box.contains(x)) { st.editorHold = true; st.slide = x; paint(x); } }, sig);
    document.addEventListener('shopify:block:deselect', () => { st.editorHold = false; }, sig);
    const restart = () => {
      if (st.slideTimer) { clearInterval(st.slideTimer); st.slideTimer = 0; }
      if (root.dataset.mode !== 'slide' || !multi() || design() || reduced.matches || !st.visible || document.hidden) return;
      st.slideTimer = setInterval(() => { if (!hold && !st.editorHold && root.isConnected) show(index() + 1); }, Math.max(2, num(root.dataset.interval, 3)) * 1000);
    };
    st.rotator = {show, restart, sync: () => { const l = list(); if (!l.includes(st.slide)) st.slide = l[0]; paint(st.slide); }};
    restart();
  }
  /* Marquee mode: enough copies of the group to cover the bar plus one, so short messages on a wide screen never leave a gap. */
  function fillMarquee(root, st) {
    const track = root.querySelector('[data-an-track]'), group = track && track.querySelector('[data-an-group]');
    if (!group || root.dataset.mode !== 'marquee' || root.dataset.multi !== 'true') return;
    const w = group.getBoundingClientRect().width; if (!w) return;
    const need = Math.min(24, Math.max(4, Math.ceil(track.clientWidth / w) + 2));
    const have = track.querySelectorAll(':scope > .ab2__group').length;
    if (have < need) { copies(track, need, st); requestAnimationFrame(() => syncClock(track)); }
  }
  const TYPES = {
    'marquee-bar': {
      after(root) { const t = root.querySelector('[data-an-track]'); if (t) syncClock(t); },
      visibility: pauseWhenAway,
    },
    'announcement-bar-basic': {
      init(root, st) {
        const id = root.dataset.anSection;
        closer(root, st, {local: 'announcementBarClosedUntil:' + id, session: 'announcementBarClosed:' + id, days: () => root.dataset.anCloseDays});
      },
    },
    'annoucment-bar-scrolling': {visibility: pauseWhenAway},
    'announcement-bar': {
      init(root, st) {
        rotator(root, st);
        closer(root, st, {local: 'announcement_bar_until:' + root.dataset.anSection, session: 'announcement_bar:' + root.dataset.anSection, days: () => 0});
        tick(root, st);
        fillMarquee(root, st);
        if (window.ResizeObserver) { const ro = new ResizeObserver(() => fillMarquee(root, st)); ro.observe(root); st.abort.signal.addEventListener('abort', () => ro.disconnect()); }
      },
      after(root, st) { rotator(root, st); if (st.rotator) { st.rotator.sync(); st.rotator.restart(); } tick(root, st); fillMarquee(root, st); },
      visibility(root, st) { pauseWhenAway(root, st); if (st.rotator) st.rotator.restart(); tick(root, st); },
      drop(root, st) { clearTimeout(st.tickTimer); if (st.slideTimer) clearInterval(st.slideTimer); if (st.slideAbort) st.slideAbort.abort(); },
    },
  };
  function drop(root, st) {
    st.io.disconnect(); cancelAnimationFrame(st.frame); st.abort.abort();
    const type = TYPES[root.dataset.anRoot]; if (type && type.drop) type.drop(root, st);
    roots.delete(root);
  }
  function add(root) {
    const type = TYPES[root.dataset.anRoot]; if (!type) return;
    const st = {root, visible: true, abort: new AbortController()};
    st.io = new IntersectionObserver(es => { for (const e of es) st.visible = e.isIntersecting; if (type.visibility) type.visibility(root, st); });
    st.io.observe(root);
    roots.set(root, st);
    if (type.init) type.init(root, st);
    if (type.after) st.frame = requestAnimationFrame(() => { st.frame = 0; if (root.isConnected) type.after(root, st); });
    root.dataset.anReady = '';
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) add(root);
  }
  document.addEventListener('visibilitychange', () => { for (const [root, st] of roots) { const t = TYPES[root.dataset.anRoot]; if (t.visibility) t.visibility(root, st); } });
  reduced.addEventListener('change', () => { for (const [root, st] of roots) { const t = TYPES[root.dataset.anRoot]; if (t.after) t.after(root, st); } });
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaAnnouncements = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
