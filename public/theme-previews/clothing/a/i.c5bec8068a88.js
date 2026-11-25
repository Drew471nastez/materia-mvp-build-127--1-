
(function(){
  var SID = "coupon_promotion_newsletter_popup";
  var I18N_COPIED = "Copied!";
  var SUB_KEY = 'cpnb_subscribed_' + SID;

  function setup(P){
    var root = document.querySelector('[data-popup-root="' + SID + '"]');
    if (!root || root.__cpnb) return;
    root.__cpnb = true;
    var CFG = JSON.parse(root.getAttribute('data-popup-config') || '{}');
    var card = root.querySelector('.cpnb-card-' + SID);
    var overlay = root.querySelector('.cpnb-overlay-' + SID);
    var form = root.querySelector('.cpnb-formel-' + SID);
    var replayTimer = 0;

    var api = P.register({
      id: SID, root: root, dialog: card, backdrop: overlay,
      design: CFG.design, preview: CFG.preview,
      trigger: Object.assign({ selector: '[data-cpnb-trigger="' + SID + '"]' }, CFG.trigger),
      frequency: { mode: CFG.frequency.mode === 'every_visit' ? 'always' : CFG.frequency.mode, days: CFG.frequency.days },
      open: function(){ root.classList.add('cpnb-open'); },
      close: function(){ root.classList.remove('cpnb-open'); clearTimeout(replayTimer); }
    });

    // Coupon copy: every code button in the popup (before and after signup).
    root.querySelectorAll('.cpnb-code-' + SID).forEach(function(btn){
      btn.addEventListener('click', function(){
        var code = (btn.dataset.code || '').trim();
        if (!code) return;
        P.copy(code).catch(function(){}).then(function(){
          btn.classList.add('is-copied');
          btn.textContent = I18N_COPIED;
          setTimeout(function(){ btn.classList.remove('is-copied'); btn.textContent = btn.dataset.code || ''; }, 2200);
        });
      });
    });

    // Signup: Storelib sends the form to Subscribers and marks it
    // data-state="done"; then the code is revealed and the popup is not
    // offered again. In the builder nothing is sent; the code shows for a while.
    function subscribed(){
      root.classList.add('cpnb-subscribed');
      var code = root.querySelector('.cpnb-postpane-' + SID + ' .cpnb-code-' + SID);
      if (code) { try { code.focus({ preventScroll: true }); } catch(_){} }
      if (CFG.design) {
        clearTimeout(replayTimer);
        replayTimer = setTimeout(function(){ root.classList.remove('cpnb-subscribed'); }, (CFG.replay || 15) * 1000);
        return;
      }
      P.store.set(SUB_KEY, '1');
      if (api) api.done();
    }
    if (form) {
      new MutationObserver(function(){
        if (form.getAttribute('data-state') === 'done') subscribed();
      }).observe(form, { attributes: true, attributeFilter: ['data-state'] });
      if (CFG.design) form.addEventListener('submit', function(e){ e.preventDefault(); subscribed(); });
      // The form is posted the ordinary way (the platform's CAPTCHA needs it): the page comes back
      // on this form's #id with the result, and the popup reopens on it (the code, or the error).
      var back = CFG.design || !P.posted ? '' : P.posted(form);
      if (back === 'ok') { if (api) api.show(); subscribed(); }
      else if (back === 'error' && api) api.show();
    }

    window['CPNB_open_' + SID] = function(){ api && api.show(); };
    window['CPNB_close_' + SID] = function(){ api && api.hide(); };
    window['CPNB_reset_' + SID] = function(){ P.store.rm(SUB_KEY); api && api.reset(); root.classList.remove('cpnb-subscribed'); };
  }

  function boot(){ (window.MateriaPopupsQueue = window.MateriaPopupsQueue || []).push(setup); }
  boot();
  function reload(e){ if (e.detail && String(e.detail.sectionId) === SID) boot(); }
  document.addEventListener('storelib:section-load', reload);
  document.addEventListener('shopify:section:load', reload);
})();
