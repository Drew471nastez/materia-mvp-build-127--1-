(function () {
  /*
    What section packs' sliders do (the shapes this fixture copies, not any
    one theme's code): each slide is given its width in pixels, measured from
    the slider, and the track is moved in pixels. On resize the widths are
    measured again after the resize has gone quiet (debounced). Crossing the
    phone breakpoint builds the slider again from its markup: new slides, new
    pictures (which fade in once loaded), and the current slide made current
    again on the next frame, so its entrance plays.
  */
  var phone = window.matchMedia("(max-width: 749px)");
  var loaded = function (scope) {
    scope.querySelectorAll("img").forEach(function (img) {
      var on = function () { requestAnimationFrame(function () { img.classList.add("is-loaded"); }); };
      if (img.complete && img.naturalWidth) on();
      else img.addEventListener("load", on, { once: true });
    });
  };
  function Slider(el) {
    var viewport = el.querySelector("[data-viewport]");
    var markup = el.querySelector("[data-track]").innerHTML;
    var index = 0;
    var track, slides;
    var measure = function () {
      var w = viewport.clientWidth;
      slides.forEach(function (s) { s.style.width = w + "px"; });
      track.style.width = w * slides.length + "px";
      track.style.transform = "translate3d(" + -w * index + "px,0,0)";
    };
    var build = function () {
      track = el.querySelector("[data-track]");
      slides = Array.prototype.slice.call(track.querySelectorAll("[data-slide]"));
      slides.forEach(function (s) { s.classList.remove("is-active"); });
      measure();
      loaded(track);
      requestAnimationFrame(function () { if (slides[index]) slides[index].classList.add("is-active"); });
    };
    var go = function (i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle("is-active", k === index); });
      measure();
    };
    build();
    var t = 0;
    var wait = Number(el.getAttribute("data-slider-debounce") || 200);
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(measure, wait); });
    phone.addEventListener("change", function () {
      el.querySelector("[data-track]").innerHTML = markup;
      build();
    });
    var prev = el.querySelector("[data-prev]"), next = el.querySelector("[data-next]");
    if (prev) prev.addEventListener("click", function () { go(index - 1); });
    if (next) next.addEventListener("click", function () { go(index + 1); });
    var section = el.closest(".shopify-section");
    if (section) section.addEventListener("shopify:block:select", function (e) {
      var i = slides.findIndex(function (s) { return s.contains(e.target); });
      if (i >= 0) go(i);
    });
  }
  document.querySelectorAll("[data-slider]").forEach(function (el) { new Slider(el); });
  loaded(document);
  /* Rise and fade in as it is scrolled to. */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
  }, { threshold: 0.05 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
})();
