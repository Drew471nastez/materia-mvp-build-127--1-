(function () {
  if (window.__materiaCardPress) return;
  window.__materiaCardPress = true;
  let active, timer, startX, startY, peeked, suppress;
  const clear = () => { clearTimeout(timer); active?.removeAttribute('data-pc-press'); active = null; };
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !event.isPrimary || event.target.closest('button,button-wishlist,product-form,.pc-corner')) return;
    clear(); peeked = false; suppress = null;
    active = event.target.closest('.product-item__inner.hover-effect');
    if (!active) return;
    startX = event.clientX; startY = event.clientY;
    timer = setTimeout(() => { if(active){ active.setAttribute('data-pc-press',''); peeked = true; } }, 450);
  }, {passive:true});
  document.addEventListener('pointermove', event => { if(active && Math.hypot(event.clientX-startX,event.clientY-startY)>10) clear(); }, {passive:true});
  document.addEventListener('pointerup', () => { if(peeked && active) suppress = active; clear(); }, {passive:true});
  document.addEventListener('pointercancel', clear, {passive:true});
  document.addEventListener('click', event => { if(suppress && suppress.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();} suppress=null; }, true);
  window.addEventListener('pagehide',clear);
})();