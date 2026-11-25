/* Materia Themes. Bottom Sheet Popup (popup-bottom-sheet) on the storefront:
   registers the popup with the theme's popup manager (materia-popups.js) and
   opens and closes its native <dialog> (a sheet dragged down to close on a
   phone, a card in a corner on a computer). Divider With Text needs no
   script. The builder loads live-r7-extras.js instead (the same plus live
   edits), so this file stands down there. */
(() => {
  if (window.MateriaR7ExtrasRuntime || window.MateriaR7Extras || (window.Shopify && window.Shopify.designMode)) return;
  const SEL = '[data-r7x="popup-bottom-sheet"]';
  const roots = new Map();
  const parse = v => { try { return JSON.parse(v || '{}') || {}; } catch (_) { return {}; } };
  const num = (v, d = null) => v !== '' && v != null && v !== false && v !== true && Number.isFinite(+v) ? +v : d;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 767.98px)');

  /* A section the builder added runs none of its script tags: fetch the manager once from the address the section names. */
  function ensureManager(st) {
    if (window.MateriaPopups || document.querySelector('script[data-r7x-popups]')) return;
    const own = (st.wrap || st.root).querySelector('script[src*="materia-popups"]') || document.querySelector('script[src*="materia-popups"]');
    if (!own || !own.src) return;
    const s = document.createElement('script');
    s.src = own.src; s.defer = true; s.setAttribute('data-r7x-popups', '');
    document.head.appendChild(s);
  }
  function popup(st) {
    const root = st.root, dlg = root.querySelector('[data-pbs-dialog]'), card = root.querySelector('[data-pbs-card]'), scrim = root.querySelector('[data-pbs-scrim]'), grip = root.querySelector('[data-pbs-grip]');
    if (!dlg || !card) return;
    const id = root.dataset.popupRoot || st.id, sig = {signal: st.ac.signal};
    const design = root.hasAttribute('data-pbs-design') || !!(window.Shopify && window.Shopify.designMode);
    const p = st.pop = {dlg, card, scrim, id, design, timer: 0, drag: null, api: null};
    const clean = () => { clearTimeout(p.timer); p.timer = 0; root.removeAttribute('data-closing'); card.style.removeProperty('transition'); card.style.removeProperty('transform'); card.style.removeProperty('opacity'); if (scrim) scrim.style.removeProperty('opacity'); };
    const modalNow = () => !design && phone.matches;
    const open = () => {
      clean();
      const modal = modalNow();
      if (p.api) p.api.entry.modal = modal;
      if (dlg.open && dlg.matches(':modal') === modal) return;
      if (dlg.open) dlg.close();
      if (modal && typeof dlg.showModal === 'function') { try { dlg.showModal(); } catch (_) { dlg.setAttribute('open', ''); } }
      else if (design || typeof dlg.show !== 'function') dlg.setAttribute('open', '');
      else dlg.show();
    };
    const close = o => {
      if (!dlg.open) { clean(); return; }
      const shut = () => { clean(); if (dlg.open) { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); } };
      if ((o && o.instant) || reduced.matches || design) { shut(); return; }
      const modal = dlg.matches(':modal');
      if (scrim) scrim.style.removeProperty('opacity');
      root.setAttribute('data-closing', '');
      card.style.transition = 'transform .24s cubic-bezier(.4, 0, 1, 1), opacity .2s ease';
      if (modal) card.style.transform = 'translateY(100%)';
      else { card.style.opacity = '0'; card.style.transform = 'translateY(12px)'; }
      clearTimeout(p.timer);
      p.timer = setTimeout(shut, 260);
    };
    const register = P => {
      if (!root.isConnected || roots.get(root) !== st) return;
      const c = parse(root.dataset.pbsConfig), t = c.trigger || {}, f = c.frequency || {};
      p.api = P.register({
        id, root, dialog: card, backdrop: design ? null : scrim, design, preview: design && !!c.preview, modal: modalNow(), gap: 600,
        trigger: {mode: t.mode || 'delay', delay: num(t.delay, 0), scroll: num(t.scroll, 50), views: num(t.views, 1), selector: 'a[href$="#bottom-sheet"]'},
        frequency: {mode: f.mode === 'every_visit' ? 'always' : f.mode || 'after_days', days: num(f.days, 1)},
        open, close,
      });
      /* Redrawn with "Show in the builder" off: open again only while the section is selected. */
      if (design && !c.preview && !p.api.entry.selected && p.api.isOpen()) p.api.hide({reason: 'deselect', instant: true});
    };
    /* Escape on the sheet, and a dialog the browser closed itself: the manager closes it, so it is remembered and the focus goes back. */
    dlg.addEventListener('cancel', e => { e.preventDefault(); if (p.api && p.api.isOpen()) p.api.hide({reason: 'escape'}); else close({instant: true}); }, sig);
    dlg.addEventListener('close', () => { if (p.api && p.api.isOpen()) p.api.hide({reason: 'close'}); }, sig);
    /* The button: not offered again for the chosen days (or ever), then the page it links to. */
    root.addEventListener('click', e => {
      const cta = e.target.closest && e.target.closest('[data-pbs-cta]');
      if (!cta || !root.contains(cta) || !p.api || design) return;
      const f = parse(root.dataset.pbsConfig).frequency || {};
      if (f.mode === 'after_days') p.api.done(num(f.days, 1)); else if (f.mode === 'never') p.api.done();
      p.api.hide({reason: 'cta', instant: true});
    }, sig);
    /* Drag the handle down to close the sheet; a short drag springs back. */
    if (grip) {
      let frame = 0;
      const paint = () => { frame = 0; const d = p.drag; if (!d) return; card.style.transform = 'translateY(' + d.dy + 'px)'; if (scrim) scrim.style.opacity = String(d.o * Math.max(0, 1 - d.dy / d.h)); };
      grip.addEventListener('pointerdown', e => {
        if (!dlg.matches(':modal') || (e.pointerType === 'mouse' && e.button !== 0)) return;
        p.drag = {y0: e.clientY, dy: 0, h: card.offsetHeight || 1, o: scrim ? parseFloat(getComputedStyle(scrim).opacity) || 0 : 0, y: e.clientY, t: e.timeStamp, v: 0, id: e.pointerId};
        card.style.transition = 'none';
        try { grip.setPointerCapture(e.pointerId); } catch (_) { /* no capture */ }
      }, sig);
      grip.addEventListener('pointermove', e => {
        const d = p.drag;
        if (!d || e.pointerId !== d.id) return;
        const dt = e.timeStamp - d.t;
        if (dt > 0) d.v = (e.clientY - d.y) / dt;
        d.y = e.clientY; d.t = e.timeStamp; d.dy = Math.max(0, e.clientY - d.y0);
        if (!frame) frame = requestAnimationFrame(paint);
      }, sig);
      const end = e => {
        const d = p.drag;
        if (!d || e.pointerId !== d.id) return;
        p.drag = null;
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        if (e.type === 'pointerup' && (d.dy > Math.min(120, d.h * 0.3) || (d.dy > 16 && d.v > 0.5))) { if (p.api && p.api.isOpen()) p.api.hide({reason: 'swipe'}); else close(); return; }
        card.style.transition = reduced.matches ? 'none' : 'transform .2s cubic-bezier(.2, .8, .2, 1)';
        card.style.transform = '';
        if (scrim) scrim.style.removeProperty('opacity');
      };
      grip.addEventListener('pointerup', end, sig);
      grip.addEventListener('pointercancel', end, sig);
    }
    (window.MateriaPopupsQueue = window.MateriaPopupsQueue || []).push(register);
    ensureManager(st);
  }

  function setup(root) {
    const wrap = root.closest('.shopify-section') || root.parentElement;
    const st = {root, wrap, id: root.dataset.r7xSection || '', ac: new AbortController()};
    roots.set(root, st);
    popup(st);
  }
  function drop(root) {
    const st = roots.get(root);
    if (!st) return null;
    st.ac.abort();
    if (st.pop) clearTimeout(st.pop.timer);
    roots.delete(root);
    return st.pop ? st.pop.id : null;
  }
  function scan() {
    const gone = [];
    for (const root of [...roots.keys()]) if (!root.isConnected) { const id = drop(root); if (id) gone.push(id); }
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) setup(root);
    /* A popup whose section was redrawn registers again under its id; one whose section is gone is let go. */
    const P = window.MateriaPopups;
    if (P) for (const id of gone) if (![...roots.values()].some(st => st.pop && st.pop.id === id)) P.unregister(id);
  }
  let scanFrame = 0;
  const touches = n => n.nodeType === 1 && (n.matches(SEL) || !!n.querySelector(SEL));
  new MutationObserver(records => {
    if (scanFrame) return;
    if (!records.some(r => [...r.addedNodes].some(touches) || (roots.size > 0 && [...r.removedNodes].some(touches)))) return;
    scanFrame = requestAnimationFrame(() => { scanFrame = 0; scan(); });
  }).observe(document.documentElement, {childList: true, subtree: true});
  for (const n of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(n, scan);
  window.MateriaR7ExtrasRuntime = {scan, roots, count: () => roots.size};
  scan();
})();
