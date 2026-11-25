/* Materia Themes. The FAQ sections on the storefront: FAQ 1 to 6 and FAQ
   Tabs ([data-faq-root]). A click on a question opens or closes it (one at a
   time per list or tab unless the section allows several, data-multiple); a
   closed answer with a link in it is inert; the section's reveal plays once.
   The theme editor loads live-faq.js instead, which does the same and also
   applies live setting edits and opens the question picked in the editor. */
(() => {
  if (window.MateriaFaq) return;
  const SEL = '[data-faq-root]';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet();
  const itemsOf = root => [...root.querySelectorAll('[data-faq-item]')].filter(el => el.closest(SEL) === root);
  const groupOf = item => item.closest('[data-fqt-panel]') || item.closest(SEL);
  const multiple = root => {
    if (root.dataset.faqRoot === 'faq-floating') return true;
    const list = [...root.querySelectorAll('[data-faq-list]')].find(el => el.closest(SEL) === root);
    return !!list && list.dataset.multiple === 'true';
  };
  function setOpen(item, on) {
    item.toggleAttribute('open', on);
    const t = item.querySelector('[data-faq-trigger]'); if (t) t.setAttribute('aria-expanded', on ? 'true' : 'false');
    const panel = item.querySelector('[data-faq-panel]'); if (panel) { const lock = !on && !!panel.querySelector('a[href], button, input, select, textarea, [tabindex]'); if (panel.inert !== lock) panel.inert = lock; }
  }
  function toggle(root, item, force) {
    const on = force == null ? !item.hasAttribute('open') : force;
    if (on && !multiple(root)) for (const other of itemsOf(root)) if (other !== item && other.hasAttribute('open') && groupOf(other) === groupOf(item)) setOpen(other, false);
    setOpen(item, on);
  }
  function reveal(root) {
    if (!root.matches('[data-faq-reveal], [data-faq7-reveal]') || root.classList.contains('is-revealed')) return;
    if (reduced.matches || window.mtIsRedraw?.(root) || !('IntersectionObserver' in window)) { root.classList.add('is-revealed'); return; }
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { root.classList.add('is-revealed'); io.disconnect(); } }, {threshold: 0.12});
    io.observe(root);
  }
  function add(root) {
    if (seen.has(root)) return; seen.add(root);
    for (const it of itemsOf(root)) setOpen(it, it.hasAttribute('open'));
    reveal(root);
    root.dataset.faqReady = '';
  }
  const scan = () => { for (const root of document.querySelectorAll(SEL)) add(root); };
  document.addEventListener('click', e => {
    const t = e.target && e.target.closest && e.target.closest('[data-faq-trigger]'); if (!t) return;
    const root = t.closest(SEL), item = t.closest('[data-faq-item]');
    if (!root || !seen.has(root) || !item || item.closest(SEL) !== root) return;
    toggle(root, item);
  });
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaFaq = {scan, runtime: true, toggle};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
