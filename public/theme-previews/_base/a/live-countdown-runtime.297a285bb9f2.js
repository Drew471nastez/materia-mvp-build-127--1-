/* Materia Themes. The countdown sections on the storefront: one timer per
   root [data-cd-root] on the visitor's clock, ticking at most once a second,
   on the second, only while on screen and the tab is visible; expired and
   unset states (data-cd-state); Pro 1's per-visitor loop (localStorage), Pro
   2's restart period, Pro 3's end from its timer block; and the Pro sections'
   reveal on scroll. The end dates are read from the settings each root
   prints. The theme editor loads live-countdown.js instead (the same plus
   live setting edits). */
(() => {
  if (window.MateriaCountdown) return;
  const SEL = '[data-cd-root]';
  const roots = new Map();
  const parse = v => { try { return JSON.parse(v || '{}') || {}; } catch (_) { return {}; } };
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const str = (v, d = '') => v == null || v === '' ? d : String(v);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function calendarOk(s){var m=/^\s*(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s||''));if(!m)return true;var y=+m[1],mo=+m[2],d=+m[3];return mo>=1&&mo<=12&&d>=1&&d<=new Date(Date.UTC(y,mo,0)).getUTCDate();}
  const iso = v => { v = str(v).trim(); return v && calendarOk(v) ? Date.parse(v) : NaN; };
  /* Pro 2: a date (YYYY-MM-DD) and a time (HH:MM) on the visitor's clock */
  const local = (date, time) => { date = str(date).trim(); time = str(time, '00:00').trim() || '00:00'; if (!date) return NaN; const dt = date + 'T' + time; return calendarOk(dt) ? Date.parse(dt) : NaN; };
  /* Pro 3: MM-DD-YYYY and a time such as 11:30pm, on the visitor's clock */
  function mdy(date, time) {
    const p = str(date).trim().split('-'); if (p.length !== 3) return NaN;
    const [mo, d, y] = p.map(Number); if (!(y > 0) || !(mo >= 1 && mo <= 12) || !(d >= 1 && d <= new Date(y, mo, 0).getDate())) return NaN;
    const m = /(\d+)(?::(\d+))?\s*(am|pm)/i.exec(str(time)); let hh = 0, mm = 0;
    if (m) { hh = +m[1] % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0); mm = +(m[2] || 0); }
    return new Date(y, mo - 1, d, hh, mm, 0).getTime();
  }
  const pad = n => String(Math.max(0, Math.floor(n))).padStart(2, '0');
  const timerBlock = st => { const el = [...st.root.querySelectorAll('[data-cd-block][data-cd-type="timer"]')].find(x => x.closest(SEL) === st.root); return el ? parse(el.dataset.cdSettings) : null; };
  const TYPES = {
    'countdown-flip': {clock: s => ({end: iso(s.end_iso)})},
    'countdown-inline': {clock: s => ({end: iso(s.end_iso)})},
    'countdown-timer1': {clock: s => { const h = num(s.start_hours), m = num(s.start_minutes), x = num(s.start_seconds); return {total: (h * 3600 + m * 60 + x) * 1000, version: [h, m, x].join(':')}; }},
    'countdown-timer3': {clock: (s, st) => { const b = timerBlock(st); return b ? {end: mdy(b.end_date, b.end_time)} : {none: true}; }},
    'countdown-timer2': {clock: s => ({end: local(s.end_date, s.end_time), restart: str(s.restart_period, 'none')})},
  };
  /* ---------- the timer ---------- */
  const store = (() => {
    const mem = {};
    try { const t = '__cd__'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return localStorage; } catch (_) { return {getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }}; }
  })();
  /* Pro 1: a fixed time per visitor; the end is kept per section until the time setting changes, then starts again */
  function loopEnd(st, now) {
    const c = st.clock, key = 'loudecomzCountdownTarget_' + st.id, ver = 'loudecomzCountdownVersion_' + st.id;
    let end = parseInt(store.getItem(key), 10);
    if (!Number.isFinite(end) || store.getItem(ver) !== c.version || end - now > c.total) { end = now + c.total; store.setItem(key, String(end)); store.setItem(ver, c.version); }
    if (end <= now) { end = now + c.total - ((now - end) % Math.max(1000, c.total)); store.setItem(key, String(end)); }
    return end;
  }
  function advance(end, period) {
    if (period === 'daily') return end + 86400000;
    if (period === 'weekly') return end + 7 * 86400000;
    if (period === 'monthly') { const d = new Date(end); d.setMonth(d.getMonth() + 1); return d.getTime(); }
    return NaN;
  }
  function tick(st) {
    clearTimeout(st.timer); st.timer = 0;
    const root = st.root; if (!root.isConnected) return;
    if (st.clockDirty || !st.clock) { st.clock = st.type.clock(st.s, st); st.clockDirty = false; }
    const c = st.clock, now = Date.now();
    let state, left = 0, end = c.end;
    if (c.none) state = 'static';
    else if (c.total != null) {
      if (!(c.total > 0)) state = 'expired';
      else { end = loopEnd(st, now); left = Math.ceil((end - now) / 1000); state = 'running'; }
    } else if (!Number.isFinite(end)) state = 'unset';
    else {
      if (c.restart && c.restart !== 'none' && end <= now) {
        const step = c.restart === 'daily' ? 86400000 : c.restart === 'weekly' ? 7 * 86400000 : 0;
        if (step) end += Math.floor((now - end) / step + 1) * step;
        else { let guard = 0; while (end <= now && guard++ < 100000) end = advance(end, c.restart); }
        c.end = end;
      }
      left = Math.max(0, Math.floor((end - now) / 1000));
      state = left > 0 ? 'running' : 'expired';
    }
    const parts = c.total != null ? {d: 0, h: Math.floor(left / 3600), m: Math.floor(left % 3600 / 60), s: left % 60} : {d: Math.floor(left / 86400), h: Math.floor(left % 86400 / 3600), m: Math.floor(left % 3600 / 60), s: left % 60};
    for (const el of st.digits) {
      const t = pad(parts[el.dataset.cdUnit]);
      if (el.textContent !== t) {
        el.textContent = t;
        if (el.dataset.cdUnit === 's' && el.hasAttribute('data-cd-pulse') && !reduced.matches) { el.classList.remove('is-tick'); requestAnimationFrame(() => el.classList.add('is-tick')); }
      }
    }
    if (root.dataset.cdState !== state) root.dataset.cdState = state;
    st.ticks++;
    if (state === 'running' && st.visible && !document.hidden) st.timer = setTimeout(() => tick(st), 1000 - (Date.now() % 1000) + 8);
  }
  const running = st => { if (st.visible && !document.hidden) { if (!st.timer) tick(st); } else { clearTimeout(st.timer); st.timer = 0; } };

  /* ---------- reveal on scroll (Pro 1, 2, 3): once, on a visitor's page, never in the builder or under reduced motion ---------- */
  function reveal(st) {
    const el = st.root.matches('[data-cd-reveal]') ? st.root : st.root.querySelector('[data-cd-reveal]');
    if (!el || el.classList.contains('is-revealed')) return;
    if (st.redraw === undefined) st.redraw = !!window.mtIsRedraw?.(st.root);
    if (reduced.matches || st.redraw) { el.classList.add('is-revealed'); return; }
    // First report: on screen (or above) it simply shows; further down it is
    // armed (hidden, CSS) and reveals once when scrolled to.
    if (st.armed === undefined) {
      if (st.firstTop === undefined && !st.visible) return; // before the observer's first report
      if (st.visible || (st.firstTop != null && st.firstTop < innerHeight)) { el.classList.add('is-revealed'); return; }
      st.armed = true; el.setAttribute('data-cd-armed', ''); return;
    }
    if (st.visible) { el.classList.add('is-revealed'); setTimeout(() => el.removeAttribute('data-cd-armed'), 1100); }
  }

  function add(root) {
    const type = TYPES[root.dataset.cdRoot]; if (!type) return;
    const st = {root, type, id: root.dataset.cdSection || '', s: parse(root.dataset.cdSettings), visible: false, timer: 0, ticks: 0, clock: null};
    roots.set(root, st);
    st.digits = [...root.querySelectorAll('[data-cd-unit]')];
    if ('IntersectionObserver' in window) {
      st.io = new IntersectionObserver(es => { for (const e of es) { st.visible = e.isIntersecting; if (st.firstTop === undefined) st.firstTop = e.boundingClientRect.bottom <= 0 ? -1 : e.boundingClientRect.top; } root.toggleAttribute('data-cd-paused', !st.visible); reveal(st); running(st); });
      st.io.observe(root);
    } else { st.visible = true; }
    tick(st);
    reveal(st);
    root.dataset.cdReady = '';
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) { clearTimeout(st.timer); if (st.io) st.io.disconnect(); roots.delete(root); }
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) add(root);
  }
  document.addEventListener('visibilitychange', () => { for (const st of roots.values()) running(st); });
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaCountdown = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
