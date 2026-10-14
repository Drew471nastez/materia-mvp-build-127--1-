(function () {
  /*
    A theme's reveal that is off in Shopify's theme editor, the way an AOS
    theme leaves it with AOS.init({ disable: Shopify.designMode }): the
    attribute is taken off and everything is shown as it stands.
  */
  var els = Array.prototype.slice.call(document.querySelectorAll('[data-aos]'));
  if (window.Shopify && Shopify.designMode) {
    els.forEach(function (el) { el.removeAttribute('data-aos'); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('aos-animate'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -60px 0px' });
    els.forEach(function (el) { el.classList.add('aos-init'); io.observe(el); });
  }
  /* A reveal whose class the section only draws outside the theme editor ({% unless request.design_mode %}). */
  var io2 = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-visible'); io2.unobserve(e.target); } });
  });
  document.querySelectorAll('.js-reveal').forEach(function (el) { io2.observe(el); });
})();
