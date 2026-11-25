/* Materia Themes. Storefront behaviour of Promotion popup and Order
   notification (fake-order): the popup's trigger, memory, copy button and
   native <dialog> (showModal: Escape, the close button and a click on the
   backdrop close it, focus goes back); the notification's timers (first one
   after a delay, shown, then hidden for the gap, paused in a hidden tab).
   Custom HTML and Custom code need no script. The theme editor loads
   live-popups-code.js instead (the same plus live edits and previews). */
(() => {
  if (window.MateriaPopupsCode) return;
  const SEL = '[data-pc-root]';
  const roots = new Map();
  const parse = v => { try { return JSON.parse(v || '{}') || {}; } catch (_) { return {}; } };
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const design = () => false;
  const store = {
    get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (_) { return null; } },
    set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (_) { /* private mode */ } },
  };
  const TYPES = {'fake-order': {init: foInit}, 'promotion-popup': {init: ppInit}};
  /* ---------- dialogs ---------- */
  let lastOpener = null;
  const openDialogs = new Set();
  function dialogOpen(st, dlg, opener) {
    if (!dlg || dlg.open) return;
    lastOpener = opener || (document.activeElement !== document.body ? document.activeElement : null);
    st.opener = lastOpener;
    if (design() || typeof dlg.showModal !== 'function') { dlg.show ? dlg.show() : dlg.setAttribute('open', ''); }
    else { try { dlg.showModal(); } catch (_) { dlg.show(); } document.documentElement.classList.add('pc-lock'); }
    openDialogs.add(dlg);
    const t = st.root.querySelector('[data-scs-open]'); if (t) t.setAttribute('aria-expanded', 'true');
    if (!design()) { const x = dlg.querySelector('[data-pp-close], [data-scs-close]'); if (x) requestAnimationFrame(() => { try { x.focus({preventScroll: true}); } catch (_) { /* gone */ } }); }
  }
  function dialogClose(st, dlg) {
    if (!dlg) return;
    if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
    openDialogs.delete(dlg);
    if (![...openDialogs].some(d => d.open && d.matches(':modal'))) document.documentElement.classList.remove('pc-lock');
    const t = st.root.querySelector('[data-scs-open]'); if (t) t.setAttribute('aria-expanded', 'false');
    const back = st.opener; st.opener = null;
    if (back && back.isConnected && !design()) { try { back.focus({preventScroll: true}); } catch (_) { /* gone */ } }
  }
  function wireDialog(st, dlg, closeSel) {
    if (!dlg) return;
    const on = (el, type, fn) => { el.addEventListener(type, fn); st.cleanup.push(() => el.removeEventListener(type, fn)); };
    on(dlg, 'click', e => {
      if (e.target.closest(closeSel)) { e.preventDefault(); dialogClose(st, dlg); return; }
      /* a click on the backdrop lands on the dialog itself, outside its card */
      if (e.target === dlg && dlg.matches(':modal')) { const r = dlg.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom || !dlg.firstElementChild.contains(document.elementFromPoint(e.clientX, e.clientY))) dialogClose(st, dlg); }
    });
    on(dlg, 'cancel', e => { e.preventDefault(); dialogClose(st, dlg); });
    on(dlg, 'close', () => { openDialogs.delete(dlg); if (![...openDialogs].some(d => d.open && d.matches(':modal'))) document.documentElement.classList.remove('pc-lock'); const t = st.root.querySelector('[data-scs-open]'); if (t) t.setAttribute('aria-expanded', 'false'); });
  }
  /* Escape also closes a dialog drawn in the page (not modal), the builder's preview */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    const list = [...openDialogs].filter(d => d.open && !d.matches(':modal'));
    const dlg = list.pop();
    if (dlg) { const root = dlg.closest(SEL), st = roots.get(root); if (st) { e.preventDefault(); dialogClose(st, dlg); return; } }
    for (const st of roots.values()) if (st.type === TYPES['fake-order'] && st.root.dataset.foState === 'shown' && st.root.contains(document.activeElement)) foClose(st);
  });

  /* Promotion popup: the live site's trigger and memory */
  const ppKey = st => 'materia:pp:' + st.root.dataset.pcSection;
  function ppInit(st) {
    const root = st.root, dlg = root.querySelector('[data-pp-dialog]');
    wireDialog(st, dlg, '[data-pp-close]');
    const on = (el, type, fn) => { el.addEventListener(type, fn); st.cleanup.push(() => el.removeEventListener(type, fn)); };
    on(root, 'click', e => {
      const copy = e.target.closest('[data-pp-copy]');
      if (copy && root.contains(copy)) { e.preventDefault(); ppCopy(st, copy); return; }
      const dismiss = e.target.closest('[data-pp-dismiss]');
      if (dismiss && root.contains(dismiss)) { e.preventDefault(); ppRemember(st); dialogClose(st, dlg); }
    });
    on(dlg, 'close', () => { if (!design()) store.set(ppKey(st) + ':seen', '1', true); });
    ppArm(st);
  }
  function ppArm(st) {
    const root = st.root, dlg = root.querySelector('[data-pp-dialog]');
    clearTimeout(st.timer);
    if (root.dataset.ppShow === 'hidden' || dlg.open) return;
    const until = +store.get(ppKey(st)) || 0;
    if (until > Date.now() || store.get(ppKey(st) + ':seen', true)) return;
    if (root.dataset.ppMobile !== 'true' && !matchMedia('(min-width: 768px)').matches) return;
    const fire = () => {
      if (!root.isConnected) return;
      /* one popup at a time: wait while another modal or the cookie banner is open */
      if (document.querySelector('dialog[open]:modal, html[data-popup-open], cookie-consent[data-open]') || (window.MateriaPopups && window.MateriaPopups.covered && window.MateriaPopups.covered())) { st.timer = setTimeout(fire, 4000); return; }
      dialogOpen(st, dlg);
    };
    st.timer = setTimeout(fire, num(root.dataset.ppDelay, 15) * 1000);
  }
  function ppRemember(st) { if (!design()) store.set(ppKey(st), String(Date.now() + num(st.root.dataset.ppDays, 1) * 864e5)); }
  function ppCopy(st, btn) {
    const code = btn.dataset.code || '';
    if (!code) return;
    const done = () => {
      btn.setAttribute('data-copied', '');
      const status = btn.parentElement.querySelector('[data-pp-status]'), t = btn.querySelector('[data-pp-code-done]');
      if (status) status.textContent = t ? t.textContent : '';
      clearTimeout(st.copied); st.copied = setTimeout(() => { btn.removeAttribute('data-copied'); if (status) status.textContent = ''; }, 1500);
      ppRemember(st);
    };
    const fallback = () => { try { const ta = document.createElement('textarea'); ta.value = code; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; btn.after(ta); ta.select(); document.execCommand && document.execCommand('copy'); ta.remove(); } catch (_) { /* copy refused */ } done(); };
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) navigator.clipboard.writeText(code).then(done, fallback); else fallback();
  }
  /* Order notification: a small toast that cycles through the products.
     First after "First one after", each shown for "Each shows for" (the
     progress bar fills), then hidden for "Gap between". Hover or focus pauses
     it (the bar too); the close button hides it for the rest of the visit. It
     moves up above the back-to-top button and an open cookie banner on its
     side. In the builder it cycles the same way while its section is selected
     (or always with "Show in the builder"), with a short gap. */
  const foSelected = new Set();
  function foBuyer(v) {
    const t = String(v == null ? '' : v).trim(), m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(t);
    return m ? {name: m[1].trim() || t, place: m[2].trim()} : {name: t, place: ''};
  }
  function foItems(st) { const el = st.root.querySelector('[data-fo-items]'); try { return JSON.parse(el ? el.textContent : '[]') || []; } catch (_) { return []; } }
  const foKey = st => 'materia:fo-closed:' + st.root.dataset.pcSection;
  function foSetup(st) {
    const root = st.root;
    if (!st.users) {
      const pb = [...root.querySelectorAll('[data-pc-block][data-pc-type="products"]')].find(el => el.closest(SEL) === root), P = pb ? parse(pb.dataset.pcSettings) : null;
      st.users = String(P && P.fake_user || '').trim().split('|').map(x => x.trim()).filter(Boolean);
      st.fallback = P && P.buyer_fallback || 'Someone';
      st.joiner = P && P.place_joiner != null ? String(P.place_joiner) : 'in';
    }
    if (st.timeLine == null) { const el = root.querySelector('[data-fo-time-template]'); try { st.timeLine = String(JSON.parse(el ? el.textContent : '""') || '').trim(); } catch (_) { st.timeLine = ''; } }
  }
  const foWanted = st => st.root.dataset.foEnabled !== 'false' && (!design() || foSelected.has(st.root.dataset.pcSection) || st.root.dataset.foBuilder === 'true');
  function foInit(st) {
    const root = st.root;
    const on = (el, type, fn) => { el.addEventListener(type, fn); st.cleanup.push(() => el.removeEventListener(type, fn)); };
    on(root, 'click', e => { if (e.target.closest('[data-fo-close]')) { e.preventDefault(); foClose(st, true); } });
    on(root, 'mouseenter', () => foPause(st));
    on(root, 'mouseleave', () => foResume(st));
    on(root, 'focusin', () => foPause(st));
    on(root, 'focusout', e => { if (!root.contains(e.relatedTarget)) foResume(st); });
    const place = () => { if (root.dataset.foState === 'shown') foPlace(st); };
    // The bar and what it must clear (back to top, the cookie panel) are fixed:
    // scrolling never moves them, only showing or hiding one does. So it is
    // placed again when one of them changes, once a frame at most, never on
    // every scroll frame (each placement read boxes and styles, and on a page
    // still laying out that cost up to ~170ms in one frame).
    let pf = 0, settle = 0;
    const placeSoon = () => { if (!pf) pf = requestAnimationFrame(() => { pf = 0; place(); }); clearTimeout(settle); settle = setTimeout(place, 450); };
    if ('MutationObserver' in window) {
      const mo = new MutationObserver(placeSoon);
      const watchOthers = () => { for (const el of document.querySelectorAll('[data-back-to-top], cookie-consent')) if (!root.contains(el)) mo.observe(el, {attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-open', 'data-covered']}); };
      watchOthers();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchOthers, {once: true});
      st.cleanup.push(() => mo.disconnect());
    }
    on(window, 'resize', place);
    on(document, 'materia:bottom-inset', () => { place(); setTimeout(place, 450); });
    on(document, 'materia:consent', () => setTimeout(place, 400));
    foSetup(st);
    st.items = foItems(st);
    st.next = 0; st.nextUser = Math.floor(Math.random() * Math.max(1, st.users.length));
    on(document, 'visibilitychange', () => { if (document.hidden) foStop(st); else if (!st.closed && !st.timer && foWanted(st) && st.items.length) foLater(st, 1000, foShow); });
    if (design()) { foSync(st); return; }
    if (root.dataset.foEnabled === 'false' || store.get(foKey(st), true) || !st.items.length) return;
    foLater(st, num(parseInt(root.dataset.timeDelay, 10), 5000), foShow);
  }
  /* builder: cycling while selected, or always with "Show in the builder" */
  function foSync(st) {
    if (!design()) return;
    const root = st.root;
    if (foWanted(st)) {
      root.setAttribute('data-fo-preview', '');
      st.closed = false;
      if (root.dataset.foState !== 'shown') { clearTimeout(st.timer); st.timer = 0; st.left = null; foShow(st); }
    } else {
      clearTimeout(st.timer); st.timer = 0; st.left = null;
      root.dataset.foState = 'hidden'; root.removeAttribute('data-fo-preview'); root.removeAttribute('data-fo-paused');
    }
  }
  /* will-change only around a slide in or out */
  function foWill(st) { const r = st.root; r.style.willChange = 'transform, opacity'; clearTimeout(st.willT); st.willT = setTimeout(() => r.style.removeProperty('will-change'), 400); }
  function foLater(st, ms, fn) {
    clearTimeout(st.timer);
    st.fn = fn; st.due = Date.now() + Math.max(0, ms);
    st.timer = setTimeout(() => { st.timer = 0; st.fn = null; if (st.root.isConnected) fn(st); }, Math.max(0, ms));
  }
  function foPause(st) {
    if (st.root.dataset.foState !== 'shown' || !st.timer || st.left != null) return;
    clearTimeout(st.timer); st.timer = 0; st.left = Math.max(0, st.due - Date.now());
    st.root.setAttribute('data-fo-paused', '');
  }
  function foResume(st) {
    if (st.left == null) return;
    const left = st.left, fn = st.fn; st.left = null;
    st.root.removeAttribute('data-fo-paused');
    if (fn && !st.closed) foLater(st, left, fn);
  }
  function foStop(st) { clearTimeout(st.timer); st.timer = 0; st.left = null; st.root.removeAttribute('data-fo-paused'); if (st.root.dataset.foState === 'shown') st.root.dataset.foState = 'hidden'; }
  /* lift the card above what else sits low on its side of the screen */
  function foPlace(st) {
    const root = st.root;
    const lift = parseFloat(root.style.getPropertyValue('--fo-lift')) || 0;
    const r = root.getBoundingClientRect();
    if (!r.width) return;
    const base = r.bottom + lift, h = window.innerHeight;
    let need = 0;
    for (const el of document.querySelectorAll('[data-back-to-top], cookie-consent[data-open]:not([data-covered]) [data-consent-panel]')) {
      if (root.contains(el) || !el.getClientRects().length) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.05) continue;
      const b = el.getBoundingClientRect();
      if (!b.height || b.right <= r.left || b.left >= r.right || b.bottom <= h * 0.4) continue;
      if (b.top < base) need = Math.max(need, base - b.top + 10);
    }
    need = Math.round(need);
    if (need !== Math.round(lift)) { if (need) root.style.setProperty('--fo-lift', need + 'px'); else root.style.removeProperty('--fo-lift'); }
  }
  function foFill(st, it, user) {
    const root = st.root, title = root.querySelector('[data-title-fake]'), img = root.querySelector('[data-img]'), ph = root.querySelector('[data-fo-ph]');
    if (title && it.title) title.textContent = it.title;
    for (const a of root.querySelectorAll('[data-url]')) if (it.url) a.href = it.url;
    if (img) { if (it.img) { if (img.getAttribute('src') !== it.img) img.src = it.img; img.hidden = false; if (ph) ph.hidden = true; } else if (it.title) { img.hidden = true; if (ph) ph.hidden = false; } }
    const b = foBuyer(user), u = root.querySelector('[data-user]'), place = root.querySelector('[data-fo-place]'), wrap = root.querySelector('[data-fo-place-wrap]'), j = root.querySelector('[data-fo-joiner]');
    if (u) u.textContent = b.name;
    if (place) place.textContent = b.place;
    if (wrap) wrap.hidden = !b.place;
    if (j) j.textContent = st.joiner || 'in';
    const time = root.querySelector('[data-fo-time-text]'), tw = root.querySelector('[data-fo-time]');
    if (time && st.timeLine) time.textContent = st.timeLine.split('[minutes]').join(String(2 + Math.floor(Math.random() * 57)));
    if (tw) tw.hidden = !st.timeLine;
  }
  function foShow(st) {
    const root = st.root;
    if (st.closed || !foWanted(st)) return;
    const items = st.items || [], users = st.users || [];
    if (!items.length) { if (design()) root.dataset.foState = 'shown'; return; }
    const it = items[st.next % items.length] || {};
    st.next = (st.next + 1) % items.length;
    const user = users.length ? users[st.nextUser++ % users.length] : st.fallback || 'Someone';
    st.running = true;
    foFill(st, it, user);
    root.removeAttribute('data-fo-paused');
    foWill(st);
    root.dataset.foState = 'shown';
    foPlace(st);
    foLater(st, Math.max(1000, num(root.dataset.animDuration, 15000)), () => {
      foWill(st);
      root.dataset.foState = 'hidden';
      const gap = Math.max(1, num(root.dataset.showGap, 10)) * 1000;
      foLater(st, design() ? Math.min(gap, 1500) : gap, foShow);
    });
  }
  function foClose(st, remember) {
    st.closed = true; clearTimeout(st.timer); st.timer = 0; st.left = null;
    st.root.dataset.foState = 'hidden'; st.root.removeAttribute('data-fo-paused');
    if (remember && !design()) store.set(foKey(st), '1', true);
  }
  function drop(root, st) {
    clearTimeout(st.timer); clearTimeout(st.copied);
    for (const fn of st.cleanup.splice(0)) try { fn(); } catch (_) { /* gone */ }
    for (const d of root.querySelectorAll('dialog')) openDialogs.delete(d);
    if (![...openDialogs].some(d => d.open && d.matches(':modal'))) document.documentElement.classList.remove('pc-lock');
    roots.delete(root);
  }
  function add(root) {
    const type = TYPES[root.dataset.pcRoot]; if (!type) return;
    const st = {root, type, cleanup: []};
    roots.set(root, st);
    type.init(st);
    root.dataset.pcReady = '';
  }
  function scan() {
    for (const [root, st] of roots) if (!root.isConnected) drop(root, st);
    for (const root of document.querySelectorAll(SEL)) if (!roots.has(root)) add(root);
  }
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaPopupsCode = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
