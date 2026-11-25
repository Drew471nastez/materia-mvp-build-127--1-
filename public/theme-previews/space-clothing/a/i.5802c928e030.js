
/* Register before editor/page scripts, without blocking the parser on an asset.
   Deferred handlers only claim recognized storefront controls or resolved
   same-page section links. Other editor selection events are left alone. */
(() => {
  if (window.__materiaSectionLinkCapture) return;
  window.__materiaSectionLinkCapture = true;
  ['click','pointerdown','pointerup','pointercancel','submit'].forEach(type => {
    window.addEventListener(type, event => {
      if(type==='submit'){
        if(window.materiaForms?.handleSubmit){window.materiaForms.handleSubmit(event);return;}
        /* materia-forms.js loads on first use (snippets/content-bottom): a sign-up or contact
           form sent before it has run waits for it, then is sent again through it. */
        const form=event.target,url=window.__mtFormsUrl;
        if(!url||!window.mtLazy||event.defaultPrevented||!(form instanceof HTMLFormElement)||form.__mtHeld)return;
        if(!form.matches('form[data-storelib-form],form[data-mt-inline-subscribe],form[action*="/contact"]')&&!form.querySelector('input[name="form_type"][value="customer"],input[name="form_type"][value="contact"]'))return;
        event.preventDefault();event.stopImmediatePropagation();
        const by=event.submitter&&event.submitter.form===form?event.submitter:null;
        const again=()=>{form.__mtHeld=true;try{form.requestSubmit(by||undefined);}catch(_){form.submit();}form.__mtHeld=false;};
        window.mtLazy.now(url).then(again,again);
        return;
      }
      if(window.MateriaProductDialogs?.handle(event))return;
      if(window.MateriaHeaderActions?.handle(event))return;
      window.MateriaSectionLinks?.[type]?.(event);
    }, true);
  });
})();
