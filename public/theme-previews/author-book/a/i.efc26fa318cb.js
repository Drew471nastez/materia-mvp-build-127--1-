
(function () {
  if (window.StorelibWaveMatch) { window.StorelibWaveMatch.run(); return; }
  var alpha = function (c) { var m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return 0; var p = m[1].split(/[ ,\/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
  var shown = function (el) { if (!el || el.nodeType !== 1) return false; var cs = getComputedStyle(el); return cs.display !== 'none' && el.getBoundingClientRect().height > 0; };
  var pageColor = function () { var b = getComputedStyle(document.body).backgroundColor; return alpha(b) > 0.98 ? b : getComputedStyle(document.documentElement).backgroundColor; };
  var edge = function (sec, bottom) {
    var R = sec.getBoundingClientRect(), color = pageColor(), image = false;
    var walk = function (el, depth) {
      var r = el.getBoundingClientRect();
      if (r.height < 1 || r.width < R.width * 0.9) return;
      if (bottom ? Math.abs(r.bottom - R.bottom) > 2 : Math.abs(r.top - R.top) > 2) return;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (/^(IMG|VIDEO|PICTURE|CANVAS|IFRAME)$/.test(el.tagName)) { image = true; return; }
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) image = true;
      else if (alpha(cs.backgroundColor) > 0.98) { color = cs.backgroundColor; image = false; }
      if (depth < 8) for (var i = 0; i < el.children.length; i++) walk(el.children[i], depth + 1);
    };
    walk(sec, 0);
    return image ? null : color;
  };
  var near = function (sec, dir) {
    var el = sec;
    do { el = dir < 0 ? el.previousElementSibling : el.nextElementSibling; } while (el && (!shown(el) || el.tagName === 'SCRIPT' || el.tagName === 'STYLE'));
    return el;
  };
  var match = function (wrap) {
    var sec = wrap.closest('.shopify-section, [id^="shopify-section-"]');
    var set = function (name, value) { if (value) wrap.style.setProperty(name, value); else wrap.style.removeProperty(name); };
    if (!sec || wrap.getAttribute('data-wd-match') === 'false') {
      set('--wd-match-wave', ''); set('--wd-match-wave-2', ''); set('--wd-match-bg', '');
      wrap.removeAttribute('data-wd-matched'); if (sec) { sec.removeAttribute('data-wd-matched'); sec.style.removeProperty('--wd-match-bg'); }
      return;
    }
    var above = near(sec, -1), below = near(sec, 1);
    var top = above ? edge(above, true) : pageColor();
    var bottom = below ? edge(below, false) : pageColor();
    var flip = wrap.getAttribute('data-wd-flip') === 'true';
    var wave = flip ? top : bottom, bg = flip ? bottom : top;
    set('--wd-match-wave', wave);
    set('--wd-match-wave-2', wrap.getAttribute('data-wd-second') === 'true' ? '' : wave);
    set('--wd-match-bg', bg);
    wrap.toggleAttribute('data-wd-matched', !!bg);
    sec.toggleAttribute('data-wd-matched', !!bg);
    if (bg) sec.style.setProperty('--wd-match-bg', bg); else sec.style.removeProperty('--wd-match-bg');
  };
  var run = function () { document.querySelectorAll('[data-sd-waves][data-wd-match]').forEach(match); };
  var frame = 0;
  var soon = function () { if (!frame) frame = requestAnimationFrame(function () { frame = 0; run(); }); };
  window.StorelibWaveMatch = {run: soon, match: match};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once: true}); else soon();
  addEventListener('load', soon, {once: true});
  ['shopify:section:load', 'shopify:section:unload', 'shopify:section:reorder', 'storelib:section-load', 'storelib:settings-change'].forEach(function (n) { document.addEventListener(n, function () { setTimeout(soon, 60); }); });
})();
