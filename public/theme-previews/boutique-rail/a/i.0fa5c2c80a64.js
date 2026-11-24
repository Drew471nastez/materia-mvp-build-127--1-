
(function(){

  var SID = "products";
  function fixFadedCards(){
    var sec = document.getElementById('shopify-section-' + SID);
    if (!sec) return;
    var items = sec.querySelectorAll('#product-grid .grid__item');
    items.forEach(function(card){
      // Clear inline style only on the OUTER card + its direct motion-element child
      card.style.opacity = '';
      card.style.visibility = '';
      card.style.transform = '';
      var directWrappers = card.querySelectorAll(
        ':scope > motion-element, ' +
        ':scope > .product-item, ' +
        ':scope > .product-card, ' +
        ':scope > .card-wrapper, ' +
        ':scope > .scroll-trigger'
      );
      directWrappers.forEach(function(w){
        w.style.opacity = '';
        w.style.visibility = '';
        w.style.transform = '';
      });
      // Strip pre-reveal class ONLY from the outer card and direct wrappers
      ['scroll-trigger','fade-in-up','fade-in','slide-in'].forEach(function(cls){
        if (card.classList.contains(cls) && card.style.opacity !== '0') {
          // leave the class but clear inline opacity (above)
        }
      });
    });
  }

  // Fire ONLY on the platform editor section reload event
  document.addEventListener('shopify:section:load', function(e){
    if (e.detail && e.detail.sectionId === SID) {
      // Small delay so theme's own init runs first, then we clean up
      setTimeout(fixFadedCards, 50);
      setTimeout(fixFadedCards, 300);
    }
  });

  // Also fire ONCE on initial DOMContentLoaded — for the case where the editor
  // navigates between sections and the scroll-trigger observer never inits
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixFadedCards);
  } else {
    setTimeout(fixFadedCards, 100);
  }
})();
