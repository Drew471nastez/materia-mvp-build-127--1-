/* Materia Themes. Recently Viewed and Product Duo on the storefront: the
   visitor's recently viewed list (localStorage, cards asked for once from
   /search with section_id=recently-viewed) and the native scroll rows'
   arrows, keys and progress line. The builder loads live-r7-products.js
   instead (the same plus live edits), so this file stands down there. */
(() => {
  if (window.MateriaR7ProductsRuntime || window.MateriaR7Products || (window.Shopify && window.Shopify.designMode)) return;
  const SEL = '[data-r7k-root]';
  const KEY = 'materia__recently-viewed-products', MAX = 25;
  const NAMES = ['recently-viewed', 'product-duo'];
  const roots = new Map();
  const cache = new Map();
  const desktop = matchMedia('(min-width: 768px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  function write(el, key, v) {
    if (key.startsWith('--')) { if (v == null || v === '') el.style.removeProperty(key); else el.style.setProperty(key, String(v)); }
    else if (key[0] === '@') { const n = key.slice(1); if (v == null || v === false) el.removeAttribute(n); else el.setAttribute(n, v === true ? '' : String(v)); }
  }
  function counts(c, count, cols, colsM) {
    const {root, put} = c, overD = count > cols, overM = count > colsM;
    put(root, '@data-over-d', overD ? 'true' : 'false');
    put(root, '@data-over-m', overM ? 'true' : 'false');
    put(root, '--rv-f-d', String(overD ? cols / count : 1));
    put(root, '--rv-f-m', String(overM ? (colsM + 0.15) / count : 1));
  }

  /* ---------- the rows ---------- */
  const trackOf = root => { const t = root.querySelector('[data-r7k-track]'); return t && t.closest(SEL) === root ? t : null; };
  const rtl = el => getComputedStyle(el).direction === 'rtl';
  function scrolls(root, st) {
    if (st.name === 'recently-viewed') return root.dataset[desktop.matches ? 'overD' : 'overM'] === 'true';
    const grid = trackOf(root);
    return !desktop.matches && root.dataset.mobile === 'swipe' && !!grid && grid.dataset.count !== '1';
  }
  /* One card and its gap, and how many fit: read only on an arrow, a key or a block pick. */
  function stride(track) {
    const item = [...track.children].find(el => !el.hidden && el.offsetWidth && !el.matches('.r7duo__or'));
    if (!item) return {one: track.clientWidth, page: track.clientWidth};
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0, one = item.offsetWidth + gap;
    return {one, page: Math.max(1, Math.floor((track.clientWidth + gap) / one)) * one};
  }
  function move(track, by, to) {
    const behavior = reduced.matches ? 'auto' : 'smooth', sign = rtl(track) ? -1 : 1;
    if (to != null) track.scrollTo({left: to * sign, behavior}); else track.scrollBy({left: by * sign, behavior});
  }
  /* The scroll position: the progress line and which arrow is at its end. Reads, then writes only what changed. */
  function measure(root, st) {
    st.frame = 0;
    const track = trackOf(root); if (!track || !track.isConnected) return;
    const max = track.scrollWidth - track.clientWidth, at = Math.abs(track.scrollLeft);
    const p = max > 1 ? Math.min(1, Math.max(0, at / max)) : 0;
    const key = Math.round(p * 1000) / 1000;
    if (st.p !== key) {
      st.p = key;
      const bar = root.querySelector('[data-r7k-progress]');
      if (bar) { if (key) bar.style.setProperty('--rv-p', String(key)); else bar.style.removeProperty('--rv-p'); }
    }
    const prev = root.querySelector('[data-r7k-prev]'), next = root.querySelector('[data-r7k-next]');
    const start = at <= 1, end = max <= 1 || at >= max - 1;
    if (prev && prev.disabled !== start) prev.disabled = start;
    if (next && next.disabled !== end) next.disabled = end;
  }
  const queue = (root, st) => { if (!st.frame) st.frame = requestAnimationFrame(() => measure(root, st)); };
  /* A row that does not scroll at this width is not a tab stop. */
  function focusable(root, st) {
    const track = trackOf(root); if (!track) return;
    const on = scrolls(root, st);
    if (on && !track.hasAttribute('tabindex')) track.setAttribute('tabindex', '0');
    else if (!on && track.hasAttribute('tabindex')) track.removeAttribute('tabindex');
    if (st.name === 'product-duo') {
      if (on && !track.hasAttribute('role')) { track.setAttribute('role', 'group'); const h = root.querySelector('.r7k-heading:not([hidden])'); if (h && h.id) track.setAttribute('aria-labelledby', h.id); }
      else if (!on && track.getAttribute('role') === 'group') { track.removeAttribute('role'); track.removeAttribute('aria-labelledby'); }
    }
  }
  function bindTrack(root, st) {
    const track = trackOf(root); if (!track) return;
    track.addEventListener('scroll', () => queue(root, st), {passive: true, signal: st.ac.signal});
    if (window.ResizeObserver) { st.ro = new ResizeObserver(() => queue(root, st)); st.ro.observe(track); }
    focusable(root, st);
  }

  /* ---------- Recently Viewed: the visitor's list ---------- */
  const okId = id => /^[\w-]{1,64}$/.test(id);
  function readIds() {
    try { const v = JSON.parse(window.localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.map(String).filter(okId) : []; } catch (_) { return []; }
  }
  function record(id) {
    id = String(id || ''); if (!okId(id)) return;
    try {
      const ids = readIds();
      if (ids[0] === id) return;
      window.localStorage.setItem(KEY, JSON.stringify([id, ...ids.filter(x => x !== id)].slice(0, MAX)));
    } catch (_) {}
  }
  /* One request for a list of ids, kept for the page (a second section, a redraw and the back button reuse it). */
  function cards(url, ids) {
    const q = ids.map(id => 'id:' + id).join(' OR ');
    const href = url + (url.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(q) + '&type=product&options%5Bunavailable_products%5D=last&section_id=recently-viewed';
    if (!cache.has(href)) {
      cache.set(href, fetch(href, {credentials: 'same-origin', headers: {Accept: 'text/html'}})
        .then(r => { if (!r.ok) throw new Error('recently viewed ' + r.status); return r.text(); })
        .then(html => {
          const doc = new DOMParser().parseFromString(html, 'text/html'), found = new Map();
          for (const card of doc.querySelectorAll('[data-rv-card][data-rv-id]')) if (!found.has(card.dataset.rvId)) found.set(card.dataset.rvId, card);
          const from = doc.querySelector('[data-r7k-root="recently-viewed"]');
          return {found, sid: from ? from.dataset.r7kSection || '' : ''};
        })
        .catch(e => { cache.delete(href); throw e; }));
    }
    return cache.get(href);
  }
  /* The answer's cards carry the answer's section id in their form ids: give them this section's, so two rows never share an id. */
  const IDREFS = ['id', 'for', 'form', 'aria-controls', 'aria-labelledby', 'aria-describedby'];
  function adopt(card, from, to) {
    const node = document.importNode(card, true);
    if (from && to && from !== to) for (const el of node.querySelectorAll('[' + IDREFS.join('],[') + ']')) for (const a of IDREFS) { const v = el.getAttribute(a); if (v && v.includes(from)) el.setAttribute(a, v.split(from).join(to)); }
    return node;
  }
  function setCount(root, st, count) {
    const out = [], put = (el, key, v) => out.push([el, key, v]);
    counts({root, put}, count, num(root.dataset.rvCols, 5), num(root.dataset.rvColsM, 2));
    for (const [el, key, v] of out) write(el, key, v);
    focusable(root, st);
  }
  function hide(root, st) {
    const track = trackOf(root);
    if (track) { track.replaceChildren(); track.removeAttribute('aria-busy'); }
    root.hidden = true;
  }
  function load(root, st) {
    const track = trackOf(root); if (!track) return;
    const current = root.dataset.rvCurrent || '', limit = Math.max(1, num(root.dataset.rvLimit, 8));
    /* Every id the visitor has (at most MAX), not only the first `limit`: a product since taken down or never this shop's is not answered, and the next one viewed takes its place. */
    const ids = readIds().filter(id => id !== current), key = ids.join(',') + '|' + limit;
    if (st.listKey === key) return;
    st.listKey = key;
    if (!ids.length) { hide(root, st); return; }
    /* Hold the row's place while the cards are on their way. */
    if (!track.querySelector('[data-rv-card]')) {
      const ghosts = ids.slice(0, limit).map(() => { const li = document.createElement('li'); li.className = 'r7rv__item r7rv__ghost'; li.setAttribute('aria-hidden', 'true'); return li; });
      track.replaceChildren(...ghosts);
    }
    track.setAttribute('aria-busy', 'true');
    setCount(root, st, Math.min(limit, ids.length));
    root.hidden = false;
    cards(root.dataset.rvUrl || '/search', ids).then(({found, sid}) => {
      if (st.listKey !== key || !root.isConnected) return;
      const mine = root.dataset.r7kSection || '', list = [];
      for (const id of ids) if (found.has(id) && list.length < limit) list.push(adopt(found.get(id), sid, mine));
      if (!list.length) { hide(root, st); return; }
      track.replaceChildren(...list);
      track.removeAttribute('aria-busy');
      track.scrollLeft = 0;
      setCount(root, st, list.length);
      queue(root, st);
      if (!reduced.matches && typeof track.animate === 'function') track.animate([{opacity: 0}, {opacity: 1}], {duration: 260, easing: 'ease-out'});
      /* The theme's own card set-up: lazy pictures and the wishlist hearts. */
      for (const fn of [() => window.initLazyloadItem && window.initLazyloadItem(), () => window.BlsLazyloadImg && window.BlsLazyloadImg.init && window.BlsLazyloadImg.init(), () => window.MateriaWishlist && window.MateriaWishlist.sync && window.MateriaWishlist.sync(root)]) { try { fn(); } catch (_) {} }
    }).catch(error => {
      if (st.listKey !== key || !root.isConnected) return;
      console.warn('[recently viewed] could not load the products', error);
      hide(root, st);
      st.listKey = null;
      /* The list is still there: draw it when the connection is back. */
      window.addEventListener('online', () => { if (roots.get(root) === st) load(root, st); }, {once: true, signal: st.ac.signal});
    });
  }
  const waiting = root => root.dataset.r7kRoot === 'recently-viewed' && root.dataset.rvState === 'wait';
  const reload = () => { for (const [root, st] of roots) if (waiting(root)) load(root, st); };

  function init(root) {
    const name = root.dataset.r7kRoot; if (!NAMES.includes(name)) return;
    const st = {name, root, ac: new AbortController(), frame: 0, p: 0};
    roots.set(root, st);
    bindTrack(root, st);
    if (waiting(root)) { record(root.dataset.rvCurrent); load(root, st); }
  }
  function drop(root, st) {
    st.ac.abort();
    if (st.ro) st.ro.disconnect();
    if (st.frame) cancelAnimationFrame(st.frame);
    roots.delete(root);
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) init(root);
  }
  document.addEventListener('click', e => {
    const btn = e.target && e.target.closest && e.target.closest('[data-r7k-prev],[data-r7k-next]'); if (!btn || btn.disabled) return;
    const root = btn.closest(SEL), track = root && roots.has(root) ? trackOf(root) : null; if (!track) return;
    move(track, stride(track).page * (btn.matches('[data-r7k-next]') ? 1 : -1));
  });
  /* The arrow keys move a focused row by one card; Home and End go to its ends. */
  document.addEventListener('keydown', e => {
    const track = e.target; if (!track || !track.matches || !track.matches('[data-r7k-track]') || e.altKey || e.ctrlKey || e.metaKey) return;
    const root = track.closest(SEL), st = roots.get(root); if (!st || !scrolls(root, st)) return;
    const flip = rtl(track) ? -1 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); move(track, stride(track).one * (e.key === 'ArrowRight' ? 1 : -1) * flip); }
    else if (e.key === 'Home') { e.preventDefault(); move(track, 0, 0); }
    else if (e.key === 'End') { e.preventDefault(); move(track, 0, track.scrollWidth); }
  });
  /* The builder picked a block: bring its card into view in a row that scrolls. */
  const onWidth = () => { for (const [root, st] of roots) { focusable(root, st); queue(root, st); } };
  if (desktop.addEventListener) desktop.addEventListener('change', onWidth); else if (desktop.addListener) desktop.addListener(onWidth);
  /* The list changed in another tab, or the page came back from the back/forward cache. */
  window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) reload(); });
  /* Back to a product page from the back/forward cache: it is the newest viewed again. */
  window.addEventListener('pageshow', e => { if (!e.persisted) return; for (const [root] of roots) if (waiting(root)) record(root.dataset.rvCurrent); reload(); });
  for (const name of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(name, scan);
  const watched = n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL));
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(watched))) scan();
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaR7ProductsRuntime = {scan, roots, readIds, record, reload, key: KEY};
  scan();
})();
