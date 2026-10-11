(function () {
  /* A slider that slides by translateX, as most themes' do, and opens the slide the editor selects. */
  document.querySelectorAll("[data-slideshow]").forEach(function (el) {
    var track = el.querySelector(".slideshow__track");
    var slides = Array.prototype.slice.call(el.querySelectorAll(".slideshow__slide"));
    var go = function (i) { track.style.transform = "translateX(" + (-100 * i) + "%)"; };
    el.closest(".shopify-section").addEventListener("shopify:block:select", function (e) {
      var i = slides.findIndex(function (s) { return s.getAttribute("data-block-id") === e.detail.blockId || s.contains(e.target); });
      if (i >= 0) go(i);
    });
  });
  /* Reveal on scroll: rises 48px and fades in, as Posturex's sections do. */
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }); }, { threshold: 0.05 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  /* The menu drawer. */
  document.addEventListener("click", function (e) {
    var open = e.target.closest && e.target.closest("[data-drawer-open]");
    var close = e.target.closest && e.target.closest("[data-drawer-close]");
    var d = document.querySelector("[data-drawer]");
    if (open && d) d.hidden = false;
    if (close && d) d.hidden = true;
  });
})();
