/* Materia Themes. Storefront behaviour of two products-a sections: Product
   Info Box's expandable rows and Product information tabs (click, arrow
   keys, Home and End), each root on its own. Featured product needs no script
   here. The theme editor loads live-products-a.js instead (the same plus live
   setting edits). */
(() => {
  if (window.MateriaProductsA) return;
  const SEL = '[data-pa-root]';
  const seen = new WeakSet();
  function boxRuntime(root) {
    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-pib-toggle]');
      if (!btn || btn.closest(SEL) !== root) return;
      const row = btn.closest('[data-pib-coll]'); if (!row) return;
      const open = row.getAttribute('data-open') !== '1';
      if (open) row.setAttribute('data-open', '1'); else row.removeAttribute('data-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  function selectTab(root, tab, focus) {
    const tabs = [...root.querySelectorAll('a[role="tab"]')].filter(t => t.closest(SEL) === root);
    for (const t of tabs) {
      const sel = t === tab, li = t.closest('.data.item'), panel = root.querySelector('#' + CSS.escape(t.getAttribute('aria-controls') || ''));
      t.setAttribute('aria-selected', sel ? 'true' : 'false');
      t.tabIndex = sel ? 0 : -1;
      if (li) li.classList.toggle('active', sel);
      if (panel) {
        panel.classList.toggle('active', sel);
        panel.hidden = !sel;
        const inner = panel.querySelector(':scope > .tab-panel'); if (inner) inner.style.display = sel ? 'block' : 'none';
      }
    }
    if (focus) { tab.focus({preventScroll: true}); tab.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }
  }
  function tabsRuntime(root) {
    const tabs = () => [...root.querySelectorAll('a[role="tab"]')].filter(t => t.closest(SEL) === root);
    root.addEventListener('click', e => {
      const tab = e.target.closest('a[role="tab"]');
      if (!tab || tab.closest(SEL) !== root) return;
      e.preventDefault();
      if (tab.getAttribute('aria-selected') !== 'true') selectTab(root, tab, false);
    });
    root.addEventListener('keydown', e => {
      const tab = e.target.closest && e.target.closest('a[role="tab"]');
      if (!tab || tab.closest(SEL) !== root) return;
      const list = tabs(), i = list.indexOf(tab);
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = list[(i + 1) % list.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length];
      else if (e.key === 'Home') next = list[0];
      else if (e.key === 'End') next = list[list.length - 1];
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); selectTab(root, tab, false); return; }
      if (!next) return;
      e.preventDefault();
      selectTab(root, next, true);
    });
  }
  function scan() {
    for (const root of document.querySelectorAll(SEL)) {
      if (seen.has(root)) continue;
      seen.add(root);
      if (root.dataset.paRoot === 'product-info-box') boxRuntime(root);
      if (root.dataset.paRoot === 'product-information-tab') tabsRuntime(root);
      root.dataset.paReady = '';
    }
  }
  document.addEventListener('shopify:section:load', scan);
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches(SEL) || n.querySelector(SEL))))) scan(); })
    .observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaProductsA = {scan, runtime: true, selectTab};
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
