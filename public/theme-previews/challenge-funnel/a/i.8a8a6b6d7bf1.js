
(function(){
  const root = document.getElementById('PA-bump');
  if(!root) return;

  /* Ticking adds the add-on to the cart, unticking takes it out, and a new
     option swaps the line. Variant ids stay strings (Storelib ids are not
     numbers). The tick alone adds it, so the product form does not add it
     a second time. */
  const checkbox = root.querySelector('[data-addon-check]');
  const card     = root.querySelector('[data-card]');
  const selectEl = root.querySelector('[data-variant]');
  const variantId  = "00000000-0000-4000-8000-000000000011";
  let addedId = null;

  function getVariantId(){
    if (selectEl && selectEl.value) return String(selectEl.value);
    return variantId == null ? null : String(variantId);
  }

  async function ajax(url, payload){
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest'},
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error((data && (data.description || data.message)) || 'HTTP ' + res.status);
    return data;
  }

  function refreshed(){
    dispatchEvent(new CustomEvent('cart:refresh', {bubbles:true}));
    document.dispatchEvent(new CustomEvent('cart:updated', {detail: {source: 'product-addon'}}));
  }

  async function addAddon(){
    const vid = getVariantId();
    if(!vid) return;
    card.classList.add('is-active');
    checkbox.setAttribute('aria-busy','true');
    try {
      await ajax('/cart/add.js', { items: [{ id: vid, quantity: 1, properties: { _sl_offer: 'addon', _sl_block: "bump", _sl_source: "00000000-0000-4000-8000-000000000010" } }] });
      addedId = vid;
    } catch (_) { checkbox.checked = false; card.classList.remove('is-active'); }
    checkbox.removeAttribute('aria-busy');
    refreshed();
  }

  async function removeAddon(){
    const vid = addedId || getVariantId();
    if(!vid) return;
    card.classList.remove('is-active');
    checkbox.setAttribute('aria-busy','true');
    try { await ajax('/cart/change.js', { id: vid, quantity: 0 }); addedId = null; } catch (_) {}
    checkbox.removeAttribute('aria-busy');
    refreshed();
  }

  async function onVariantChange(){
    if(!checkbox.checked) return;
    await removeAddon();
    await addAddon();
  }

  checkbox.addEventListener('change', (e)=>{
    if(e.target.checked){ addAddon(); }
    else { removeAddon(); }
  });

  if(selectEl){
    selectEl.addEventListener('change', onVariantChange);
  }
})();
