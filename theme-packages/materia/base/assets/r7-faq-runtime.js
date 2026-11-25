/* Materia Themes. FAQ Search and FAQ With Contact Card on the storefront:
   the search as the visitor types (the questions themselves are <details>,
   opened by the browser). The builder loads live-r7-faq.js instead (the same
   plus live edits), so this file stands down there. */
(() => {
  if (window.MateriaR7FaqRuntime || window.MateriaR7Faq || (window.Shopify && window.Shopify.designMode)) return;
  const SEL = '[data-r7f]';
  const roots = new Map();
  const itemsOf = root => [...root.querySelectorAll('[data-r7f-item]')].filter(el => el.closest(SEL) === root);

  /* ---------- search ---------- */
  const fold = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const texts = new WeakMap();
  function textOf(item) {
    const q = item.querySelector('[data-r7f-question]'), a = item.querySelector('[data-r7f-answer]');
    const raw = (q ? q.textContent : '') + ' ' + (a ? a.textContent : '') + ' ' + (item.dataset.r7fKeys || '');
    let t = texts.get(item);
    if (!t || t.raw !== raw) texts.set(item, t = {raw, folded: fold(raw)});
    return t.folded;
  }
  /* the folded text of one text node, and for each of its characters where it starts in the node */
  function foldMap(text) {
    let out = '', i = 0; const at = [];
    for (const ch of text) { const f = fold(ch); for (let k = 0; k < f.length; k++) at.push(i); out += f; i += ch.length; }
    at.push(i);
    return [out, at];
  }
  const HL = window.Highlight && window.CSS && CSS.highlights ? new Highlight() : null;
  if (HL) CSS.highlights.set('r7f-match', HL);
  const ranges = new WeakMap(), timers = new WeakMap();
  function unmark(root) { if (HL) for (const r of ranges.get(root) || []) HL.delete(r); ranges.delete(root); }
  function mark(root, words, items) {
    if (!HL) return;
    unmark(root);
    if (!words.length) return;
    const out = [];
    for (const it of items) {
      if (it.hidden) continue;
      for (const part of it.querySelectorAll('[data-r7f-question], [data-r7f-answer]')) {
        const walk = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const [f, at] = foldMap(n.data);
          for (const w of words) for (let i = f.indexOf(w); i >= 0; i = f.indexOf(w, i + 1)) {
            const r = new Range(); r.setStart(n, at[i]); r.setEnd(n, at[i + w.length]);
            out.push(r); HL.add(r);
          }
        }
      }
    }
    ranges.set(root, out);
  }
  function search(root, announce) {
    const input = root.querySelector('[data-r7f-input]'), status = root.querySelector('[data-r7f-status]');
    if (!input || !status) return;
    const words = fold(input.value).split(/\s+/).filter(Boolean), items = itemsOf(root);
    let left = 0;
    for (const it of items) {
      const text = textOf(it), hit = words.every(w => text.includes(w));
      if (it.hidden === hit) it.hidden = !hit;
      if (hit) left++;
    }
    const state = !words.length ? '' : left ? 'count' : 'empty';
    const msg = state === 'count' ? (status.dataset.count || '').replace(/\[count\]/g, left).replace(/\[total\]/g, items.length) : state === 'empty' ? status.dataset.empty || '' : '';
    if (status.textContent !== msg) status.textContent = msg;
    if ((status.dataset.state || '') !== state) { if (state) status.dataset.state = state; else delete status.dataset.state; }
    const list = root.querySelector('[data-r7f-list]'), clear = root.querySelector('[data-r7f-clear]');
    if (list && list.hidden !== (state === 'empty')) list.hidden = state === 'empty';
    if (clear && clear.hidden !== !input.value) clear.hidden = !input.value;
    mark(root, words, items);
    const live = root.querySelector('[data-r7f-live]');
    if (live && announce) { clearTimeout(timers.get(root)); timers.set(root, setTimeout(() => { if (live.isConnected && live.textContent !== msg) live.textContent = msg; }, 400)); }
  }
  function empty(root, focus) {
    const input = root.querySelector('[data-r7f-input]'); if (!input) return;
    if (input.value) { input.value = ''; search(root, true); }
    if (focus) input.focus();
  }
  document.addEventListener('input', e => {
    const input = e.target && e.target.closest && e.target.closest('[data-r7f-input]'); if (!input) return;
    const root = input.closest(SEL); if (root) search(root, true);
  });
  document.addEventListener('keydown', e => {
    const input = e.target && e.target.closest && e.target.closest('[data-r7f-input]'); if (!input) return;
    const root = input.closest(SEL); if (!root) return;
    if (e.key === 'Escape' && input.value) { e.preventDefault(); empty(root, true); }
    else if (e.key === 'Enter') { e.preventDefault(); const first = itemsOf(root).find(it => !it.hidden); if (first) first.querySelector('summary').focus(); }
  });
  document.addEventListener('click', e => {
    const clear = e.target && e.target.closest && e.target.closest('[data-r7f-clear]'); if (!clear) return;
    const root = clear.closest(SEL); if (root) empty(root, true);
  });
  /* The builder picked a question block: show it (clear a search that hides it) and open it. */

  function drop(root) {
    clearTimeout(timers.get(root)); unmark(root); roots.delete(root);
  }
  function add(root) {
    roots.set(root, true);
    /* a field the browser refilled after a reload */
    const input = root.querySelector('[data-r7f-input]'); if (input && input.value) search(root, false);
    root.dataset.r7fReady = '';
  }
  function scan() {
    for (const root of [...roots.keys()]) if (!root.isConnected) drop(root);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) add(root);
  }
  for (const name of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(name, scan);
  const watched = n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL));
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(watched))) scan();
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaR7FaqRuntime = {scan, roots, search, fold};
  scan();
})();
