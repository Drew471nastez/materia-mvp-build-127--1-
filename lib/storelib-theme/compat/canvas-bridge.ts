/**
 * ===========================================================================
 *  THE BUILDER'S HAND INSIDE AN IMPORTED THEME'S PAGE
 * ===========================================================================
 * The canvas draws an imported theme's page in a sandboxed frame with no
 * origin of its own (components/website-builder/compat/compat-canvas.tsx):
 * the theme's scripts run there exactly as on the website, and can reach
 * nothing of the builder, the person signed in or their session. This script
 * is the one thing the builder adds to that page. It talks to the builder by
 * postMessage only, and does what Shopify's own theme editor does:
 *
 *   a click selects the section and the block under it, and a link or a form
 *   does not leave the page
 *   a section the builder changed is swapped in place, with the theme's
 *   `shopify:section:unload` and `shopify:section:load` around it
 *   the selected section and block get `shopify:section:select` and
 *   `shopify:block:select`, so a theme opens the slide or the tab that was
 *   picked, and are outlined
 */
export const CANVAS_BRIDGE = `
(function () {
  var post = function (m) { m.storelib = 1; try { parent.postMessage(m, "*"); } catch (e) {} };
  var css = document.createElement("style");
  css.textContent = "[data-sl-hover]{outline:1px dashed rgba(139,92,246,.7)!important;outline-offset:-1px!important}" +
    "[data-sl-selected]{outline:2px solid #8b5cf6!important;outline-offset:-2px!important}" +
    "[data-sl-selected-block]{outline:2px solid #8b5cf6!important;outline-offset:2px!important}";
  document.head.appendChild(css);
  var sectionOf = function (el) { return el && el.closest ? el.closest(".shopify-section") : null; };
  var idOf = function (s) { return s ? s.getAttribute("data-section-id") || s.id.replace(/^shopify-section-/, "") : null; };
  var blockOf = function (el, section) {
    var b = el && el.closest ? el.closest("[data-block-id]") : null;
    return b && section && section.contains(b) ? b : null;
  };
  var hovered = null;
  document.addEventListener("mouseover", function (e) {
    var s = sectionOf(e.target);
    if (s === hovered) return;
    if (hovered) hovered.removeAttribute("data-sl-hover");
    hovered = s;
    if (s && !s.hasAttribute("data-sl-selected")) s.setAttribute("data-sl-hover", "");
  }, true);
  document.addEventListener("click", function (e) {
    var s = sectionOf(e.target);
    var link = e.target.closest && e.target.closest("a[href]");
    if (link) e.preventDefault();
    if (!s) return;
    /* The block and every block around it, outermost first: the path the sidebar's tree reads. */
    var path = [];
    var at = blockOf(e.target, s);
    while (at) { path.unshift(at.getAttribute("data-block-id")); at = blockOf(at.parentElement, s); }
    post({ type: "pick", sectionId: idOf(s), blockPath: path });
  }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);
  var fire = function (el, name, detail) { try { el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail })); } catch (e) {} };
  var selected = { section: null, block: null };
  var mark = function (sectionId, blockId, scroll) {
    document.querySelectorAll("[data-sl-selected],[data-sl-selected-block]").forEach(function (el) { el.removeAttribute("data-sl-selected"); el.removeAttribute("data-sl-selected-block"); });
    var s = sectionId ? document.getElementById("shopify-section-" + sectionId) : null;
    if (selected.section && selected.section !== sectionId) {
      var old = document.getElementById("shopify-section-" + selected.section);
      if (old) fire(old, "shopify:section:deselect", { sectionId: selected.section, load: false });
    }
    if (selected.block && selected.block !== blockId) {
      var oldB = document.querySelector('[data-block-id="' + CSS.escape(selected.block) + '"]');
      if (oldB) fire(oldB, "shopify:block:deselect", { blockId: selected.block, sectionId: selected.section, load: false });
    }
    selected = { section: sectionId, block: blockId };
    if (!s) return;
    s.setAttribute("data-sl-selected", "");
    s.removeAttribute("data-sl-hover");
    fire(s, "shopify:section:select", { sectionId: sectionId, load: false });
    var b = blockId ? s.querySelector('[data-block-id="' + CSS.escape(blockId) + '"]') : null;
    if (b) {
      b.setAttribute("data-sl-selected-block", "");
      fire(b, "shopify:block:select", { blockId: blockId, sectionId: sectionId, load: false });
    }
    if (scroll) {
      var r = (b || s).getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) (b || s).scrollIntoView({ block: r.height > innerHeight ? "start" : "center", behavior: "smooth" });
    }
  };
  /*
    A SECTION'S OWN STYLESHEETS STAY ON THE PAGE. Dawn's sections carry their
    <link rel="stylesheet">; drawn again, the old link went with the old
    markup and the new one loaded a moment later, so for a frame the section
    had no styles, a banner had no height, and the page under it jumped to
    the top. Each such stylesheet is kept once in the head instead, loaded
    before the first swap that needs it, and the section's own copy is left
    out of what is swapped in.
  */
  var queue = Promise.resolve();
  var kept = {};
  var keep = function (href) {
    if (kept[href]) return kept[href];
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    kept[href] = new Promise(function (done) { l.onload = done; l.onerror = done; setTimeout(done, 2000); });
    document.head.appendChild(l);
    return kept[href];
  };
  var swap = function (id, html) {
    var tpl = document.createElement("template");
    tpl.innerHTML = html;
    var next = tpl.content.firstElementChild;
    if (!next) return;
    var links = Array.prototype.slice.call(next.querySelectorAll('link[rel="stylesheet"][href]'));
    return Promise.all(links.map(function (l) { return keep(l.href); })).then(function () {
      links.forEach(function (l) { l.remove(); });
      var el = document.getElementById("shopify-section-" + id);
      if (!el) { post({ type: "missing", id: id }); return; }
      fire(el, "shopify:section:unload", { sectionId: id, load: true });
      /* Held at its height until its pictures are in: a new <img> has no size until it decodes. */
      var y = scrollY;
      var held = el.getBoundingClientRect().height;
      /* Its scripts are not run again: they ran with the page, and the custom elements they defined take the new markup as it connects. */
      el.replaceWith(next);
      next.style.minHeight = held + "px";
      var pending = Array.prototype.filter.call(next.querySelectorAll("img"), function (i) { return !i.complete; });
      var release = function () { next.style.minHeight = ""; };
      if (!pending.length) requestAnimationFrame(release);
      else {
        var left = pending.length;
        pending.forEach(function (i) { var done = function () { if (--left === 0) release(); }; i.addEventListener("load", done, { once: true }); i.addEventListener("error", done, { once: true }); });
        setTimeout(release, 3000);
      }
      if (scrollY !== y) scrollTo(0, y);
      fire(next, "shopify:section:load", { sectionId: id, load: true });
      if (selected.section === id) mark(selected.section, selected.block, false);
    });
  };
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.storelib !== 1) return;
    if (m.type === "section") {
      /* In order: a swap that waits for a stylesheet holds the ones after it. */
      queue = queue.then(function () { return swap(m.id, m.html); }).catch(function () {});
    } else if (m.type === "select") {
      mark(m.sectionId || null, m.blockId || null, m.scroll !== false);
    } else if (m.type === "scroll") {
      scrollTo({ top: m.top || 0 });
    }
  });
  var ready = function () { post({ type: "ready", scrollY: scrollY }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
  addEventListener("scroll", function () { post({ type: "scrolled", scrollY: scrollY }); }, { passive: true });
})();
`.trim()

/**
 * FIRST IN THE CANVAS PAGE'S HEAD. A frame with no origin of its own has no
 * storage: `localStorage` and `sessionStorage` throw, and a theme that keeps
 * its recently viewed products there stops on its first line. Each gets a
 * store in memory for the frame's life, and `document.cookie` reads empty.
 */
export const CANVAS_HEAD = `<script>(function(){function S(){var m=new Map();return{get length(){return m.size},key:function(i){return Array.from(m.keys())[i]??null},getItem:function(k){return m.has(String(k))?m.get(String(k)):null},setItem:function(k,v){m.set(String(k),String(v))},removeItem:function(k){m.delete(String(k))},clear:function(){m.clear()}}}
["localStorage","sessionStorage"].forEach(function(n){var ok=false;try{ok=!!window[n]}catch(e){ok=false}if(!ok){try{Object.defineProperty(window,n,{value:S(),configurable:true})}catch(e){}}});
try{document.cookie}catch(e){try{Object.defineProperty(document,"cookie",{get:function(){return ""},set:function(){},configurable:true})}catch(e2){}}})();</script>`
