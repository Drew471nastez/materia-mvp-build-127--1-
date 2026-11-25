
(function(){
  var SID = "back_to_top_pro";
  function setup(){
    var btn = document.querySelector('[data-back-to-top="' + SID + '"]');
    if (!btn || btn.__btt) return;
    btn.__btt = true;
    // A redraw sets up the new button: the old one's listeners go with it.
    if (window['__bttStop_' + SID]) window['__bttStop_' + SID]();
    var path = btn.querySelector('.progress-path-' + SID);
    var showAfter = parseInt(btn.getAttribute('data-show-after'), 10) || 0;
    var frame = 0, shown = null, pageH = 0;
    // The page's height comes from a ResizeObserver (reported after layout),
    // not from scrollHeight on each scroll frame: reading it while the page
    // still had layout to do forced that layout inside the frame (80-100ms).
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function(es){ pageH = es[es.length - 1].contentRect.height; queue(); });
      ro.observe(document.body);
    }
    // One read per frame: how far down the page is, as the ring and the reveal.
    function update(){
      frame = 0;
      var y = window.scrollY;
      var max = (pageH || document.documentElement.scrollHeight) - window.innerHeight;
      var on = y > showAfter;
      if (on !== shown) { shown = on; btn.classList.toggle('is-visible', on); }
      if (path) path.style.strokeDashoffset = String(100 - (max > 0 ? Math.min(1, y / max) : 0) * 100);
    }
    function queue(){ if (!frame) frame = requestAnimationFrame(update); }
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue, { passive: true });
    btn.addEventListener('click', function(){
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      // Keyboard users continue from the top of the page.
      var start = document.querySelector('#MainContent, main, [role="main"]');
      if (start) {
        if (!start.hasAttribute('tabindex')) start.setAttribute('tabindex', '-1');
        try { start.focus({ preventScroll: true }); } catch (e) {}
      }
    });
    // First read in the next frame, not at DOMContentLoaded: the page height
    // read here forced the page's first layout inside this script.
    queue();
    window['__bttStop_' + SID] = function(){ if (ro) ro.disconnect(); window.removeEventListener('scroll', queue); window.removeEventListener('resize', queue); cancelAnimationFrame(frame); frame = 0; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true }); else setup();
  function reload(e){ if (e.detail && String(e.detail.sectionId) === SID) setup(); }
  document.addEventListener('storelib:section-load', reload);
  document.addEventListener('shopify:section:load', reload);
})();
