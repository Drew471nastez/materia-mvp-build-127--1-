/* Materia Themes. FAQ (sections/faq-pro.storelib).
   Opens and closes the questions (one at a time unless the list allows
   several) and plays the section's own reveal. Sets up every FAQ on the
   page, once each, and again for a section the builder draws again.
   live-faq.js (loaded on every page by the layout) runs the questions when
   it is there, with live settings and the builder's block selection; this
   file then only plays the reveal. */
(function () {
  if (window.MateriaFaqPro) return;

  function setup(root) {
    var list = root.querySelector('[data-faq7-list]');
    if (!list || list.__faq7Init) return;
    list.__faq7Init = true;
    var multiple = list.dataset.multiple === 'true';
    list.addEventListener('click', function (e) {
      if (window.MateriaFaq) return;
      var trig = e.target.closest('[data-faq7-trigger]');
      if (!trig) return;
      var item = trig.closest('[data-faq7-item]');
      if (!item) return;
      var isOpen = item.hasAttribute('open');
      if (!multiple) {
        list.querySelectorAll('[data-faq7-item][open]').forEach(function (it) {
          if (it !== item) {
            it.removeAttribute('open');
            var btn = it.querySelector('[data-faq7-trigger]');
            if (btn) btn.setAttribute('aria-expanded', 'false');
          }
        });
      }
      if (isOpen) { item.removeAttribute('open'); trig.setAttribute('aria-expanded', 'false'); }
      else { item.setAttribute('open', ''); trig.setAttribute('aria-expanded', 'true'); }
    });
    var animation = root.getAttribute('data-faq7-anim');
    var revealEl = root;
    if (window.mtIsRedraw?.(root)) {
      revealEl.classList.add('is-revealed');
    } else if (animation && animation !== 'none' && revealEl.hasAttribute('data-faq7-reveal')) {
      // First report: in (or above) the first screen it simply shows; further
      // down it is armed (hidden, CSS) and reveals once when scrolled to.
      var first = true;
      var io = new IntersectionObserver(function (entries, obs) {
        var e = entries[entries.length - 1];
        if (first) {
          first = false;
          var rb = e.rootBounds, shown = !!rb && e.boundingClientRect.top < rb.top + (rb.bottom - rb.top) / 0.94;
          if (e.isIntersecting || shown || e.boundingClientRect.bottom <= 0) { revealEl.classList.add('is-revealed'); obs.unobserve(revealEl); return; }
          revealEl.setAttribute('data-faq7-armed', '');
          return;
        }
        if (!e.isIntersecting) return;
        obs.unobserve(revealEl);
        revealEl.classList.add('is-revealed');
        setTimeout(function () { revealEl.removeAttribute('data-faq7-armed'); }, 1000);
      }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
      io.observe(revealEl);
    } else {
      revealEl.classList.add('is-revealed');
    }
  }

  function init(scope) {
    var s = scope && scope.querySelectorAll ? scope : document;
    if (s.matches && s.matches('[data-faq7-root]')) setup(s);
    s.querySelectorAll('[data-faq7-root]').forEach(setup);
  }

  window.MateriaFaqPro = { init: init };
  init(document);
  ['storelib:section-load', 'shopify:section:load'].forEach(function (name) { document.addEventListener(name, function (e) { init(e.target); }); });
})();
