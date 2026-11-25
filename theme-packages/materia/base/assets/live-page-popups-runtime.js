/* Materia Themes. Page popups on the storefront: each popup's own script
   registers it with materia-popups.js (triggers, how often, one at a time,
   focus); this file puts that popup in the native <dialog> the section draws
   round it (snippets/page-popup-dialog) and opens it with showModal(), so the
   page behind is inert, and Escape closes it through the manager. The theme
   editor loads live-page-popups.js instead (the same plus live edits). */
(() => {
  if (window.MateriaPagePopups) return;
  const design = () => !!(window.Shopify && window.Shopify.designMode) || document.documentElement.classList.contains('shopify-design-mode') || !!(window.MateriaPopups && window.MateriaPopups.design);
  const opened = new Map();
  const sidOf = v => {
    if (v == null) return '';
    if (typeof v === 'object') v = v.id != null ? v.id : v.sectionId;
    return String(v == null ? '' : v).replace(/^shopify-section-/, '');
  };
  const dialogFor = id => {
    const popup = document.querySelector('[data-popup-root="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!popup) return null;
    return popup.closest('dialog[data-pg-dialog]') || popup.querySelector('dialog[data-pg-dialog]');
  };

  /* ---------- the dialog follows the manager ---------- */
  function openDialog(id) {
    const dlg = dialogFor(id);
    if (!dlg) return;
    const prev = opened.get(id);
    if (prev && prev !== dlg && prev.open) prev.close();
    opened.set(id, dlg);
    /* Drawn over the page with the open attribute, never showModal(): making
       the whole page inert restyled every element of it in the opening frame
       (about 100ms on a phone) and twice again on closing. The manager keeps
       focus inside (Tab), closes it on Escape and locks the page scroll;
       aria-modal tells assistive tech; on the live site the transparent
       dialog box takes the clicks around the card (a click there closes it). */
    if (dlg.open && !dlg.matches(':modal')) return;
    if (dlg.open) dlg.close();
    dlg.setAttribute('aria-modal', 'true');
    if (!design()) dlg.setAttribute('data-pg-live', ''); else dlg.removeAttribute('data-pg-live');
    dlg.setAttribute('open', '');
  }
  function closeDialog(id) {
    const dlg = opened.get(id);
    opened.delete(id);
    if (dlg && dlg.open) { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }
  }
  document.addEventListener('materia:popup-open', e => { const id = sidOf(e.detail); if (id) openDialog(id); });
  document.addEventListener('materia:popup-close', e => { const id = sidOf(e.detail); if (id) closeDialog(id); });
  /* a click on the dialog box itself (around the card) closes it, like a backdrop */
  document.addEventListener('click', e => {
    const dlg = e.target;
    if (!dlg || !dlg.matches || !dlg.matches('dialog[data-pg-dialog][data-pg-live][open]')) return;
    const popup = dlg.querySelector('[data-popup-root]') || dlg.closest('[data-popup-root]');
    const id = popup && popup.getAttribute('data-popup-root');
    const P = window.MateriaPopups;
    if (P && id && P.current() === id) P.close(id);
  });
  /* Escape: the manager closes it (remembered, focus given back) */
  document.addEventListener('cancel', e => {
    const dlg = e.target;
    if (!dlg || !dlg.matches || !dlg.matches('dialog[data-pg-dialog]')) return;
    e.preventDefault();
    const popup = dlg.matches('[data-popup-root]') ? dlg : dlg.querySelector('[data-popup-root]') || dlg.closest('[data-popup-root]');
    const id = popup && popup.getAttribute('data-popup-root');
    const P = window.MateriaPopups;
    if (P && id && P.current() === id) P.close(id); else if (dlg.open) dlg.close();
  }, true);
  /* a dialog closed by the browser (not by the manager) tells the manager */
  document.addEventListener('close', e => {
    const dlg = e.target;
    if (!dlg || !dlg.matches || !dlg.matches('dialog[data-pg-dialog]')) return;
    for (const [id, d] of opened) if (d === dlg) { opened.delete(id); const P = window.MateriaPopups; if (P && P.current() === id) P.close(id); }
  }, true);
  window.MateriaPagePopups = {runtime: true, dialogFor, design};
})();
