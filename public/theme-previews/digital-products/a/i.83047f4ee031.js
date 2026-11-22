
(function () {
  if ("subtle_rise" === 'none' || false) return;
  if (window.SlTheme && window.SlTheme.designMode) { return; }
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }

  var root = document.documentElement;
  root.classList.add('js-media-fade');

  var seen = ('WeakSet' in window) ? new WeakSet() : null;
  var SKIP = /(?:^|\s)(secondary-image|opacity-0|product-image|first-image|bls-loading-image|bls-loaded-image)(?:\s|$)/;

  function eligible(el) {
    if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') { return false; }
    if (el.getAttribute('fetchpriority') === 'high') { return false; }
    var cn = (typeof el.className === 'string') ? el.className : '';
    if (cn && SKIP.test(cn)) { return false; }     // never touch hover/secondary media
    return true;
  }

  // One fade per picture. A picture inside a section that is still to
  // reveal, or revealing now, is shown by that reveal: fading it as well
  // made it appear twice (the section came in, then the picture again). One
  // that arrives off screen is simply there when it is scrolled to.
  function shows(el) {
    if (el.closest && el.closest('.scroll-trigger--armed')) { return false; }
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function prep(el) {
    if (!eligible(el)) { return; }
    if (seen) { if (seen.has(el)) { return; } seen.add(el); }
    var ready = el.tagName === 'IMG' ? (el.complete && el.naturalWidth > 0) : (el.readyState >= 2);
    if (ready) { return; }                          // already painted — leave it, no flash
    var ev = el.tagName === 'IMG' ? 'load' : 'loadeddata';
    el.addEventListener(ev, function () { if (shows(el)) { el.classList.add('media-fade-run'); } }, { once: true });
  }

  function scan(ctx) {
    var nodes = (ctx || document).querySelectorAll('img, video');
    for (var i = 0; i < nodes.length; i++) { prep(nodes[i]); }
  }

  // First read: everything already in the first screen (or above it) is left
  // alone. An IntersectionObserver says which those are from the browser's
  // own first layout; measuring every picture here at DOMContentLoaded
  // forced that layout inside this script (50-100ms) before the page could
  // show.
  function sort(el, inView) {
    if (inView) { if (seen) { seen.add(el); } return; }
    prep(el);
  }
  function firstScan() {
    var nodes = document.querySelectorAll('img, video');
    if (!('IntersectionObserver' in window)) {
      for (var k = 0; k < nodes.length; k++) { sort(nodes[k], false); }
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        io.unobserve(entries[i].target);
        sort(entries[i].target, entries[i].isIntersecting);
      }
    });
    for (var j = 0; j < nodes.length; j++) {
      if (eligible(nodes[j])) { io.observe(nodes[j]); }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', firstScan);
  } else {
    firstScan();
  }

  if ('MutationObserver' in window) {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) { continue; }
          if (node.tagName === 'IMG' || node.tagName === 'VIDEO') { prep(node); }
          else if (node.querySelectorAll) { scan(node); }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
