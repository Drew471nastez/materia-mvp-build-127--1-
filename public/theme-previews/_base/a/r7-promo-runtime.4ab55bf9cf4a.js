/* Materia Themes. Announcement Code Bar and Product Drop Countdown on the
   storefront: the code bar's copy button and the drop timer (ticks once a
   second only while on screen and the tab is visible; writes data-state on
   the root, the section's CSS does the rest). The builder loads
   live-r7-promo.js instead (the same plus live paint), so this file stands
   down there. */
(() => {
  if (window.MateriaR7PromoRuntime || window.MateriaLiveR7Promo || (window.SlTheme && window.SlTheme.designMode)) return;
  const SEL = '[data-r7p]';
  const roots = new Map();
  const text = (el, v) => { if (el && el.textContent !== String(v ?? '')) el.textContent = v ?? ''; };
  const attr = (el, name, v) => { if (el && el.getAttribute(name) !== String(v)) el.setAttribute(name, v); };
  const pad = n => (n < 10 ? '0' : '') + n;

  /* ------------------------------------------------------------ the moment */
  /* 2026-12-31, 2026-12-31T18:00 or 2026-12-31T18:00:00, optionally with its own offset (Z, +02:00).
     Without one, the picked offset; with "visitor", the visitor's own clock. Impossible dates are no date. */
  function moment(raw, tz) {
    let v = String(raw ?? '').trim().replace(' ', 'T');
    if (v.length === 10) v += 'T00:00:00'; else if (v.length === 16) v += ':00';
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:?\d{2})?$/.exec(v);
    if (!m) return NaN;
    const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate() || h > 23 || mi > 59 || s > 59) return NaN;
    let off = m[7] || (tz && tz !== 'visitor' ? tz : '');
    if (!off) return new Date(y, mo - 1, d, h, mi, s).getTime();
    if (off === 'Z') off = '+00:00';
    const o = /^([+-])(\d{2}):?(\d{2})$/.exec(off);
    if (!o) return NaN;
    return Date.UTC(y, mo - 1, d, h, mi, s) - (o[1] === '-' ? -1 : 1) * (+o[2] * 60 + +o[3]) * 60000;
  }

  /* ------------------------------------------------------------ the timer */
  function tick(state) {
    clearTimeout(state.timer); state.timer = 0;
    const root = state.root;
    if (!root.isConnected) return;
    const now = Date.now(), end = state.end;
    let left = 0, phase = 'unset';
    if (Number.isFinite(end)) { left = Math.max(0, Math.floor((end - now) / 1000)); phase = left > 0 ? 'running' : 'ended'; }
    const parts = {d: Math.floor(left / 86400), h: Math.floor(left % 86400 / 3600), m: Math.floor(left % 3600 / 60), s: left % 60};
    for (const el of root.querySelectorAll('[data-r7p-unit]')) if (el.closest(SEL) === root) text(el, pad(parts[el.dataset.r7pUnit]));
    attr(root, 'data-state', phase);
    state.ticks++;
    if (phase === 'running' && state.visible && !document.hidden) state.timer = setTimeout(() => tick(state), 1000 - (Date.now() % 1000) + 8);
  }
  const running = state => { if (state.visible && !document.hidden) { if (!state.timer) tick(state); } else { clearTimeout(state.timer); state.timer = 0; } };
  function clock(root, state) {
    const key = (root.dataset.end || '') + '|' + (root.dataset.tz || '');
    if (state.clockKey === key) return;
    state.clockKey = key;
    state.end = moment(root.dataset.end, root.dataset.tz);
    tick(state);
  }

  /* ------------------------------------------------------------ copying a code */
  function copyText(value) {
    if (navigator.clipboard?.writeText && window.isSecureContext !== false) return navigator.clipboard.writeText(value).catch(() => fallback(value));
    return fallback(value);
  }
  function fallback(value) {
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = value; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.append(area); area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      area.remove();
      if (ok) resolve(); else reject(new Error('copy'));
    });
  }
  function copier(root, state) {
    root.addEventListener('click', event => {
      const btn = event.target.closest('[data-r7p-copy]');
      if (!btn || btn.closest(SEL) !== root) return;
      const code = btn.dataset.code;
      if (!code) return;
      const status = btn.parentElement.querySelector('[data-r7p-status]'), done = btn.querySelector('[data-r7p-done]');
      copyText(code).then(() => {
        btn.setAttribute('data-copied', '');
        text(status, (done?.textContent.trim() || 'Copied') + ': ' + code);
        clearTimeout(state.copied.get(btn));
        state.copied.set(btn, setTimeout(() => { btn.removeAttribute('data-copied'); text(status, ''); state.copied.delete(btn); }, 2000));
      }, () => {
        /* Nothing was copied: select the code so it can be copied by hand. */
        const value = btn.querySelector('[data-r7p-code]'), range = document.createRange(), selection = getSelection();
        if (!value || !selection) return;
        range.selectNodeContents(value); selection.removeAllRanges(); selection.addRange(range);
      });
    }, {signal: state.abort.signal});
  }


  const TYPES = ['announcement-code-bar', 'countdown-product-drop'];
  function drop(root, state) {
    state.abort.abort(); state.io?.disconnect(); clearTimeout(state.timer);
    for (const t of state.copied.values()) clearTimeout(t);
    roots.delete(root);
  }
  function add(root) {
    const type = root.dataset.r7p;
    if (!TYPES.includes(type)) return;
    const state = {root, timer: 0, ticks: 0, visible: false, copied: new Map(), abort: new AbortController()};
    roots.set(root, state);
    if (type === 'announcement-code-bar') copier(root, state);
    if (type === 'countdown-product-drop') {
      if ('IntersectionObserver' in window) {
        state.io = new IntersectionObserver(entries => { for (const e of entries) state.visible = e.isIntersecting; running(state); });
        state.io.observe(root);
      } else state.visible = true;
      clock(root, state);
    }
  }
  function scan() {
    for (const [root, state] of roots) if (!root.isConnected) drop(root, state);
    document.querySelectorAll(SEL).forEach(root => { if (!roots.has(root)) add(root); });
  }
  document.addEventListener('visibilitychange', () => { for (const state of roots.values()) if (state.root.dataset.r7p === 'countdown-product-drop') running(state); });
  document.addEventListener('DOMContentLoaded', scan);
  document.addEventListener('shopify:section:load', scan);
  window.MateriaR7PromoRuntime = {scan, moment, count: () => roots.size};
  scan();
})();
