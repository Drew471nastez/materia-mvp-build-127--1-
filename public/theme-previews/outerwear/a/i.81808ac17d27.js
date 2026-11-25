
  (function(){
    // Wire every phone-field instance on this page. Runs at parse time;
    // safe because each snippet emits its own scoped script block.
    document.querySelectorAll('[data-cpnb-phone]').forEach(function(root){
      if (root.__cpnbPhoneWired) return;
      root.__cpnbPhoneWired = true;
      var cc = root.querySelector('[data-cpnb-phone-cc]');
      var local = root.querySelector('[data-cpnb-phone-local]');
      var combined = root.querySelector('[data-cpnb-phone-combined]');
      if (!cc || !local || !combined) return;

      function update(){
        var localValue = (local.value || '').replace(/\D+/g,'').replace(/^0+/,'');
        if (localValue.length === 0) {
          // Don't submit empty phone — clear the name so the platform ignores it
          combined.removeAttribute('name');
          combined.value = '';
        } else {
          combined.setAttribute('name', 'contact[phone]');
          combined.value = cc.value + localValue;
        }
      }

      cc.addEventListener('change', update);
      local.addEventListener('input', update);

      // On form submit, ensure latest value is set (covers paste / autofill cases)
      var form = root.closest('form');
      if (form) form.addEventListener('submit', update, true);
    });
  })();
