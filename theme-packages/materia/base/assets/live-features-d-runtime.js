/* Materia Themes. Storefront behaviour of the features-d sections: Progress
   Benefits, Progress Circles, Stat Counter and Stat Counter Pro fill their
   rings and count their numbers up once, the first time a root drawn with
   data-fd-reveal="pending" is a quarter in view (final values at once under
   reduced motion); Product Benefits 4 pauses its animations off screen
   (data-fd-offscreen; its lines and slider are product-benefits-4.js). The
   theme editor loads live-features-d.js instead (the same plus live edits). */
(() => {
  if (window.MateriaFeaturesD) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const num = (v, d = 0) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
  const text = (el, v) => { if (el && el.textContent !== String(v ?? '')) el.textContent = String(v ?? ''); };
  const countable = raw => { const v = String(raw ?? '').replace(/[,\s]/g, ''); return /^-?\d+(\.\d+)?$/.test(v) ? +v : null; };
  const format = (n, decimals, grouped) => { const v = decimals > 0 ? n.toFixed(decimals) : String(Math.round(n)); return grouped ? Number(v).toLocaleString('en-US', {minimumFractionDigits: Math.max(0, decimals), maximumFractionDigits: Math.max(0, decimals)}) : v; };
  const finalText = el => el.dataset.final ?? (el.dataset.to ?? '') + (el.dataset.suffix || '');
  function count(el, st, ms) {
    const to = countable(el.dataset.to), dec = Math.max(0, Math.round(num(el.dataset.decimals))), grouped = /,/.test(el.dataset.final || '');
    if (to === null || ms <= 0) { text(el, finalText(el)); return; }
    const t0 = performance.now(), w = el.getBoundingClientRect().width;
    if (w) el.style.minWidth = Math.ceil(w) + 'px';
    const job = {el, frame: 0};
    const step = now => {
      if (!el.isConnected) return;
      const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      if (p < 1) { text(el, format(to * e, dec, grouped) + (el.dataset.suffix || '')); job.frame = requestAnimationFrame(step); }
      else { text(el, finalText(el)); el.style.removeProperty('min-width'); st.counting.delete(job); }
    };
    st.counting.add(job);
    text(el, format(0, dec, grouped) + (el.dataset.suffix || ''));
    job.frame = requestAnimationFrame(step);
  }
  const settle = st => { for (const j of st.counting) { cancelAnimationFrame(j.frame); j.el.style.removeProperty('min-width'); text(j.el, finalText(j.el)); } st.counting.clear(); };
  function reveal(root, duration) {
    if (root.dataset.fdReveal !== 'pending') return;
    const st = {counting: new Set()};
    const done = () => {
      if (root.dataset.fdReveal !== 'pending') return;
      io.disconnect(); root.dataset.fdReveal = 'done';
      const ms = reduce.matches ? 0 : duration;
      for (const el of root.querySelectorAll('[data-fd-count]')) count(el, st, ms);
    };
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) done(); }, {threshold: 0.25});
    if (reduce.matches) done(); else io.observe(root);
    reduce.addEventListener('change', () => { if (reduce.matches) settle(st); });
  }
  const TYPES = {
    pgc: root => reveal(root, 1400),
    pgr: root => reveal(root, 1400),
    counter: root => reveal(root, num(root.dataset.fdDuration, 1800)),
    pro: root => reveal(root, num(root.dataset.fdDuration, 1800)),
    pb4: root => new IntersectionObserver(es => { const e = es[es.length - 1]; root.toggleAttribute('data-fd-offscreen', !e.isIntersecting); }, {threshold: 0}).observe(root),
  };
  const seen = new WeakSet();
  function scan() {
    for (const root of document.querySelectorAll('[data-fd]')) {
      const init = TYPES[root.dataset.fd];
      if (!init || seen.has(root)) continue;
      seen.add(root);
      try { init(root); } catch (e) { console.warn(e); }
    }
  }
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('[data-fd]') || n.querySelector('[data-fd]'))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaFeaturesD = {scan, runtime: true};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
