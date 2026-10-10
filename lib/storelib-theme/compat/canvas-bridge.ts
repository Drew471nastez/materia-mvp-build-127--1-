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
  css.setAttribute("data-sl", "");
  /*
    THE OUTLINES ARE BOXES OVER THE PAGE, not outlines on the sections. An
    outline is painted with its element, so a carousel, a picture or a
    sticky child inside the section painted over it and the ring had gaps.
    Each box is fixed over the page, above everything, follows its element
    on every scroll, resize and change, and takes no pointer. Storelib's own
    canvas selection (components/website-builder/sections/_shared.tsx):
    solid blue, never a dashed purple.
  */
  css.textContent = "[data-sl-box]{position:fixed;pointer-events:none;box-sizing:border-box;z-index:2147483646;display:none}" +
    "[data-sl-box=hover]{border:1.5px solid rgba(59,130,246,.5)}" +
    "[data-sl-box=section]{border:1.5px solid #3b82f6}" +
    "[data-sl-box=block]{border:1.5px solid #3b82f6;box-shadow:0 0 0 1px rgba(255,255,255,.9)}";
  document.head.appendChild(css);
  var boxOf = function (kind) {
    var b = document.createElement("div");
    b.setAttribute("data-sl-box", kind);
    b.setAttribute("aria-hidden", "true");
    (document.body || document.documentElement).appendChild(b);
    return b;
  };
  var boxes = null;
  var place = function (box, el, inset) {
    if (!el || !el.isConnected) { box.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { box.style.display = "none"; return; }
    var top = Math.max(r.top + inset, 0), bottom = Math.min(r.bottom - inset, innerHeight);
    if (bottom <= top) { box.style.display = "none"; return; }
    box.style.display = "block";
    box.style.left = (r.left + inset) + "px";
    box.style.width = Math.max(0, r.width - inset * 2) + "px";
    box.style.top = top + "px";
    box.style.height = (bottom - top) + "px";
    /* A section running past the top or the foot of the screen has no line there. */
    box.style.borderTopWidth = r.top + inset < 0 ? "0" : "";
    box.style.borderBottomWidth = r.bottom - inset > innerHeight ? "0" : "";
  };
  var drawFrame = 0;
  var drawBoxes = function () {
    drawFrame = 0;
    if (!boxes) boxes = { hover: boxOf("hover"), section: boxOf("section"), block: boxOf("block") };
    var hov = document.querySelector("[data-sl-hover]");
    var sec = document.querySelector("[data-sl-selected]");
    var blk = document.querySelector("[data-sl-selected-block]");
    place(boxes.hover, hov && hov !== sec ? hov : null, 0);
    place(boxes.section, sec, 0);
    place(boxes.block, blk, -2);
  };
  var redraw = function () { if (!drawFrame) drawFrame = requestAnimationFrame(drawBoxes); };
  addEventListener("scroll", redraw, { passive: true, capture: true });
  addEventListener("resize", redraw);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(redraw).observe(document.documentElement);
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
    redraw();
  }, true);
  document.addEventListener("mouseleave", function () { if (hovered) hovered.removeAttribute("data-sl-hover"); hovered = null; redraw(); });
  /*
    THE SITE'S OWN ADDRESS UNDER THE POINTER. The page is drawn on the
    builder's host, so a link's address read as storelib.com/pages/wishlist
    in the browser's status bar. While the pointer is on a link it carries the
    website's address (window.__slSite), and its own back the moment it is
    left or pressed, so nothing of the theme's ever reads the borrowed one.
  */
  var site = typeof window.__slSite === "string" ? window.__slSite : "";
  while (site.charAt(site.length - 1) === "/") site = site.slice(0, -1);
  var lent = null;
  var giveBack = function () {
    if (!lent) return;
    var own = lent.getAttribute("data-sl-href");
    if (own !== null) lent.setAttribute("href", own);
    lent.removeAttribute("data-sl-href");
    lent = null;
  };
  document.addEventListener("mouseover", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (a === lent) return;
    giveBack();
    if (!a || !site) return;
    var h = a.getAttribute("href") || "";
    if (h.charAt(0) !== "/" || h.charAt(1) === "/") return;
    a.setAttribute("data-sl-href", h);
    a.setAttribute("href", site + h);
    lent = a;
  }, true);
  document.addEventListener("mouseleave", giveBack);
  document.addEventListener("click", function (e) {
    giveBack();
    var s = sectionOf(e.target);
    var link = e.target.closest && e.target.closest("a[href]");
    if (link) {
      e.preventDefault();
      /*
        The builder decides whether a link opens its page: the header's, the
        footer's and the Overlay group's (a phone tab bar, a menu drawer)
        always do, as the site's own navigation.
      */
      var chrome = !!link.closest("[class*='shopify-section-group-'], header, footer, nav, mobile-navigation-bar, [class*='mobile-nav'], [class*='bottom-nav'], [class*='drawer']");
      post({ type: "navigate", href: link.getAttribute("href") || "", chrome: chrome });
    }
    if (!s) return;
    /* The block and every block around it, outermost first: the path the sidebar's tree reads. */
    var path = [];
    var at = blockOf(e.target, s);
    while (at) { path.unshift(at.getAttribute("data-block-id")); at = blockOf(at.parentElement, s); }
    post({ type: "pick", sectionId: idOf(s), blockPath: path });
  }, true);
  var fire = function (el, name, detail) { try { el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail })); } catch (e) {} };
  var selected = { section: null, block: null };
  /* Where the selected section is on screen, for the builder's toolbar over the canvas. */
  var boxFrame = 0;
  var report = function () {
    boxFrame = 0;
    var el = selected.section ? document.getElementById("shopify-section-" + selected.section) : null;
    if (!el) { post({ type: "box", id: null }); return; }
    var r = el.getBoundingClientRect();
    post({ type: "box", id: selected.section, top: r.top, left: r.left, width: r.width, height: r.height });
  };
  var reportSoon = function () { if (!boxFrame) boxFrame = requestAnimationFrame(report); if (typeof redraw === "function") redraw(); };
  addEventListener("scroll", reportSoon, { passive: true });
  addEventListener("resize", reportSoon);
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
    reportSoon();
    redraw();
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
    l.setAttribute("data-sl", "");
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
      reportSoon();
    });
  };
  /*
    THE PAGE CHANGED SHAPE OR STYLE, AND IS CHANGED IN PLACE. The builder
    compared the page it would draw now with this one and sends only what
    differs: the theme's inline styles, the attributes on <html> and <body>,
    sections taken away, sections added or moved. A page that cannot take a
    change here (a group with nowhere to put the new section in) asks to be
    drawn again, behind this one.
  */
  var reload = function (why) { post({ type: "reload", why: why }); };
  var setAttrs = function (el, attrs) {
    if (!attrs) return;
    Array.prototype.slice.call(el.attributes).forEach(function (a) { if (!(a.name in attrs) && a.name.indexOf("data-sl") !== 0) el.removeAttribute(a.name); });
    Object.keys(attrs).forEach(function (k) { if (el.getAttribute(k) !== attrs[k]) el.setAttribute(k, attrs[k]); });
  };
  var groupOf = function (el) { var m = /shopify-section-group-([a-z0-9_-]+)/i.exec(el.className || ""); return m ? m[1] : ""; };
  var fresh = function (html) {
    var tpl = document.createElement("template");
    tpl.innerHTML = html;
    var el = tpl.content.firstElementChild;
    if (!el) return null;
    Array.prototype.slice.call(el.querySelectorAll('link[rel="stylesheet"][href]')).forEach(function (l) { keep(l.href); l.remove(); });
    return el;
  };
  /*
    A section new to the page runs its own scripts once, as it would have had
    the page been drawn with it. Once: a script that already ran (the page's
    own, or a section's brought back by undo) is not run again, since a
    theme's top level const would be declared twice.
  */
  var ran = new Set();
  document.querySelectorAll("script").forEach(function (x) { ran.add(x.src || x.textContent); });
  var runScripts = function (el) {
    el.querySelectorAll("script").forEach(function (old) {
      var key = old.src || old.textContent;
      if (ran.has(key)) return;
      ran.add(key);
      var s = document.createElement("script");
      Array.prototype.slice.call(old.attributes).forEach(function (a) { s.setAttribute(a.name, a.value); });
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
  };
  var patch = function (m) {
    if (m.styles) {
      var mine = Array.prototype.filter.call(document.head.querySelectorAll("style"), function (x) { return !x.hasAttribute("data-sl"); });
      if (mine.length !== m.styles.length) return reload("styles");
      mine.forEach(function (x, i) { if (x.textContent !== m.styles[i]) x.textContent = m.styles[i]; });
    }
    if (m.fonts) {
      var have = Array.prototype.slice.call(document.querySelectorAll("link[data-storelib-font]"));
      have.forEach(function (l) { if (m.fonts.indexOf(l.getAttribute("href")) === -1) l.remove(); });
      m.fonts.forEach(function (href) {
        if (have.some(function (l) { return l.getAttribute("href") === href; })) return;
        var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.setAttribute("data-storelib-font", ""); document.head.appendChild(l);
      });
    }
    setAttrs(document.documentElement, m.htmlAttrs);
    setAttrs(document.body, m.bodyAttrs);
    (m.remove || []).forEach(function (id) {
      var el = document.getElementById("shopify-section-" + id);
      if (!el) return;
      fire(el, "shopify:section:unload", { sectionId: id, load: true });
      el.remove();
    });
    /* A selected section taken off keeps its selection: shown again, it is outlined again and the toolbar comes back to it. */
    reportSoon();
    if (!m.order) return;
    var y = scrollY;
    var byId = function (id) { return document.getElementById("shopify-section-" + id); };
    var added = [];
    for (var i = 0; i < m.order.length; i++) {
      var it = m.order[i];
      var el = byId(it.id);
      if (!el) {
        if (!it.html) return reload("missing " + it.id);
        el = fresh(it.html);
        if (!el) continue;
        added.push(el);
      }
      /* Placed after the section before it in its group, or else before the one after it. */
      var prev = null, next = null;
      for (var j = i - 1; j >= 0 && !prev; j--) if (m.order[j].group === it.group) prev = byId(m.order[j].id);
      for (var k = i + 1; k < m.order.length && !next; k++) if (m.order[k].group === it.group && byId(m.order[k].id) && byId(m.order[k].id) !== el) next = byId(m.order[k].id);
      if (prev) { if (prev.nextElementSibling !== el) prev.after(el); }
      else if (next) { if (el.nextElementSibling !== next) next.before(el); }
      else if (!el.isConnected) {
        /* The first of its group on the page: beside a section of the same group, or nowhere this page can know. */
        var kin = it.group ? Array.prototype.find.call(document.querySelectorAll(".shopify-section"), function (x) { return groupOf(x) === it.group; }) : document.querySelector("main .shopify-section, #MainContent .shopify-section");
        var main = !it.group ? document.querySelector("main, #MainContent, [role=main]") : null;
        if (kin) kin.after(el); else if (main) main.appendChild(el); else return reload("no place for " + it.id);
      }
    }
    added.forEach(function (el) {
      var id = el.getAttribute("data-section-id");
      runScripts(el);
      fire(el, "shopify:section:load", { sectionId: id, load: true });
    });
    if (scrollY !== y) scrollTo(0, y);
    if (selected.section) mark(selected.section, selected.block, false);
    reportSoon();
  };
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.storelib !== 1) return;
    if (m.type === "patch") {
      /* After the section swaps already asked for, in order. */
      queue = queue.then(function () { patch(m); }).catch(function (err) { reload(String(err)); });
    } else if (m.type === "section") {
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
  /* Drawn, its pictures in: a page drawn behind the one on screen takes its place at this, not before. */
  var loaded = function () { post({ type: "loaded", scrollY: scrollY }); };
  if (document.readyState === "complete") setTimeout(loaded, 0); else addEventListener("load", loaded);
  addEventListener("scroll", function () { post({ type: "scrolled", scrollY: scrollY }); }, { passive: true });
})();
`.trim()

/**
 * FIRST IN THE CANVAS PAGE, BEFORE THE THEME'S OWN SCRIPTS: the website's
 * addresses answered by the builder, and checkout kept for the live site
 * (./canvas-cart.ts). In the head so a theme script that asks for the cart
 * as it starts, or listens for clicks on the window, comes after it.
 */
export const CANVAS_REQUESTS = `
(function () {
  var post = function (m) { m.storelib = 1; try { parent.postMessage(m, "*"); } catch (e) {} };
  /*
    THE SITE'S ADDRESSES ARE ANSWERED BY THE BUILDER. This page has no origin
    of its own and is drawn on the builder's host, so /cart/add.js,
    ?sections=, /products/<handle>.js went to the builder and failed, and Add
    to cart never finished. Every request for one of the website's own
    addresses, by fetch or by XMLHttpRequest, is asked of the builder instead
    (lib/storelib-theme/compat/canvas-cart.ts), which answers as the website
    would, with a cart of its own. The theme's files and pictures still load
    as they always did.
  */
  var baseUrl = document.baseURI;
  var pagePath = typeof window.__slPath === "string" ? window.__slPath : "/";
  var routed = function (u) {
    if (u === undefined || u === null) return null;
    var raw = String(u);
    if (raw === "" || raw === "about:srcdoc" || raw.indexOf("srcdoc") === 0) return pagePath + (raw.indexOf("?") >= 0 ? raw.slice(raw.indexOf("?")) : "");
    var url;
    try { url = new URL(raw, baseUrl); } catch (e) { return null; }
    if (url.protocol === "about:") return pagePath + url.search;
    var home;
    try { home = new URL(baseUrl); } catch (e) { return null; }
    if (url.origin !== home.origin) return null;
    var p = url.pathname;
    if (/^\\/(api|_next|cdn)\\//.test(p) || /\\.(css|png|jpe?g|gif|webp|avif|svg|woff2?|ttf|otf|mp4|webm|ico)$/i.test(p)) return null;
    /*
      An address written from location.pathname ("srcdoc") lands under the
      builder's own page: it is this page. One written from location.origin
      ("null/cart/add.js") is the website's address after the "null".
    */
    if (/^\\/website-builder\\//.test(p)) { var after = /\\/null(\\/.*)$/.exec(p); p = after ? after[1] : pagePath; }
    return p + url.search;
  };
  /*
    \`location.origin\` IS "null" HERE, and a theme that builds an address on
    it (Horizon: new URL(Theme.routes.search_url, location.origin)) threw
    before it asked for anything. Such a base is read as the builder's page,
    so the address resolves and its request is answered as above.
  */
  var NativeURL = window.URL;
  var fixBase = function (b) { var s = String(b); return s === "null" || s.indexOf("about:") === 0 ? baseUrl : b; };
  try {
    window.URL = class extends NativeURL {
      constructor(u, b) { if (arguments.length > 1 && b !== undefined) super(u, fixBase(b)); else super(u); }
    };
  } catch (e) {}
  var waiting = {};
  var asked = 0;
  var ask = function (method, path, body, ajax) {
    return new Promise(function (resolve) {
      var id = ++asked;
      waiting[id] = resolve;
      post({ type: "request", id: id, method: method, url: path, body: body, ajax: ajax });
      setTimeout(function () { if (waiting[id]) { delete waiting[id]; resolve({ status: 504, contentType: "text/plain", body: "" }); } }, 20000);
    });
  };
  /* A body as the live route reads one (app/api/site-theme/site route.ts, bodyOf): \`updates[]\` a list, \`items[0][id]\` the items. */
  var fromPairs = function (pairs) {
    var out = {};
    pairs.forEach(function (kv) {
      var k = kv[0], v = kv[1];
      if (typeof v !== "string") return;
      var list = /^(\\w+)\\[\\]$/.exec(k);
      if (list) { (out[list[1]] = out[list[1]] || []).push(v); return; }
      var item = /^items\\[(\\d+)\\]\\[(\\w+)\\]$/.exec(k);
      if (item) { out.items = out.items || []; var at = out.items[+item[1]] = out.items[+item[1]] || {}; at[item[2]] = v; return; }
      out[k] = v;
    });
    return out;
  };
  var fields = function (body, type) {
    if (body === undefined || body === null) return null;
    try {
      if (typeof FormData !== "undefined" && body instanceof FormData) return fromPairs(Array.from(body.entries()));
      if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return fromPairs(Array.from(body.entries()));
      if (typeof body === "string") {
        if (/json/i.test(type || "") || /^\\s*[\\[{]/.test(body)) { try { var j = JSON.parse(body); return j && typeof j === "object" ? j : null; } catch (e) {} }
        return fromPairs(Array.from(new URLSearchParams(body).entries()));
      }
    } catch (e) {}
    return null;
  };
  var liveOnly = function (what) { post({ type: "live-only", what: what }); };
  var answered = function (r) {
    if (r.checkout) liveOnly("checkout");
    return r;
  };
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (realFetch) window.fetch = function (input, init) {
    var isReq = typeof Request !== "undefined" && input instanceof Request;
    var path = routed(isReq ? input.url : input);
    if (path === null) return realFetch(input, init);
    init = init || {};
    var method = String(init.method || (isReq ? input.method : "GET")).toUpperCase();
    var h;
    try { h = new Headers(init.headers || (isReq ? input.headers : undefined)); } catch (e) { h = new Headers(); }
    var type = h.get("content-type") || (typeof FormData !== "undefined" && init.body instanceof FormData ? "multipart/form-data" : "");
    var ajax = h.get("x-requested-with") === "XMLHttpRequest" || /json/i.test(type) || /application\\/json/i.test(h.get("accept") || "");
    return ask(method, path, fields(init.body, type), ajax).then(function (r) {
      answered(r);
      var empty = r.status === 204 || r.status === 304 || r.checkout;
      return new Response(empty ? null : r.body, { status: r.checkout ? 200 : r.status < 200 || r.status > 599 ? 200 : r.status, headers: { "Content-Type": r.contentType || "text/plain" } });
    });
  };
  var XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    var xOpen = XHR.prototype.open, xSend = XHR.prototype.send, xHeader = XHR.prototype.setRequestHeader;
    XHR.prototype.open = function (method, url) {
      var path = routed(url);
      this.__sl = path === null ? null : { method: String(method || "GET").toUpperCase(), path: path, headers: {} };
      return xOpen.apply(this, arguments);
    };
    XHR.prototype.setRequestHeader = function (k, v) {
      if (this.__sl) this.__sl.headers[String(k).toLowerCase()] = String(v);
      return xHeader.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      var s = this.__sl;
      if (!s) return xSend.apply(this, arguments);
      var x = this;
      var type = s.headers["content-type"] || (typeof FormData !== "undefined" && body instanceof FormData ? "multipart/form-data" : "");
      var ajax = s.headers["x-requested-with"] === "XMLHttpRequest" || /json/i.test(type) || /application\\/json/i.test(s.headers.accept || "");
      var def = function (k, v) { try { Object.defineProperty(x, k, { value: v, configurable: true }); } catch (e) {} };
      ask(s.method, s.path, fields(body, type), ajax).then(function (r) {
        answered(r);
        var text = r.body || "";
        var rt = x.responseType;
        var res = text;
        if (rt === "json") { try { res = JSON.parse(text); } catch (e) { res = null; } }
        else if (rt === "document") { try { res = new DOMParser().parseFromString(text, "text/html"); } catch (e) { res = null; } }
        def("readyState", 4);
        def("status", r.status);
        def("statusText", r.status < 400 ? "OK" : "Error");
        def("responseURL", baseUrl);
        def("responseText", text);
        def("response", res);
        def("getResponseHeader", function (n) { return /^content-type$/i.test(String(n)) ? r.contentType : null; });
        def("getAllResponseHeaders", function () { return "content-type: " + r.contentType + "\\r\\n"; });
        ["readystatechange", "load", "loadend"].forEach(function (n) { try { x.dispatchEvent(new ProgressEvent(n)); } catch (e) { try { x.dispatchEvent(new Event(n)); } catch (e2) {} } });
      });
    };
  }
  /*
    CHECKOUT IS THE LIVE SITE'S. Check out, Buy it now and a link to
    /checkout are stopped before the theme sees them, and the builder says
    where checkout is (a toast); nothing is added to the cart by Buy it now.
  */
  var checkoutPath = function (path) { return path !== null && (/^\\/checkout(\\/|\\?|$)/.test(path) || /^\\/cart\\/checkout(\\?|$)/.test(path) || /^\\/cart\\/[^/?]+:\\d+/.test(path)); };
  var CHECKOUT = '[data-storelib-buy-now],.shopify-payment-button button,.shopify-payment-button__button,button[name="checkout"],input[name="checkout"],[data-storelib-checkout],button[class*="checkout" i],a[class*="checkout" i],input[type="submit"][class*="checkout" i],[role="button"][class*="checkout" i],button[id*="checkout" i]';
  var SAYS = /^(check ?out|proceed to check ?out|go to check ?out|buy (it )?now)$/i;
  var isCheckout = function (t) {
    if (!t || !t.closest) return false;
    if (t.closest(CHECKOUT)) return true;
    var a = t.closest("a[href]");
    if (a && checkoutPath(routed(a.getAttribute("href")))) return true;
    var b = t.closest("button, a, [role=button], input[type=submit]");
    return !!b && SAYS.test(String(b.innerText || b.value || "").replace(/\s+/g, " ").trim());
  };
  addEventListener("click", function (e) {
    if (!isCheckout(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    liveOnly("checkout");
  }, true);
  /*
    A FORM THE THEME DOES NOT HANDLE ITSELF (a cart page's Update, an older
    theme's product form): posted to the builder, and the page it lands on
    opened, as the website would. One the theme handles (it prevents the
    submit and adds by fetch) is left to it.
  */
  var postForm = function (method, action, data) {
    var path = routed(action || pagePath) || pagePath;
    if (data && data.checkout !== undefined || checkoutPath(path)) { liveOnly("checkout"); return; }
    if (method !== "POST") { post({ type: "navigate", href: path, chrome: false }); return; }
    ask("POST", path, data, false).then(function (r) {
      answered(r);
      if (r.redirectedTo && !r.checkout) post({ type: "navigate", href: r.redirectedTo, chrome: true });
    });
  };
  addEventListener("submit", function (e) {
    var form = e.target;
    var submitter = e.submitter || null;
    var data = null;
    try { data = fromPairs(Array.from(new FormData(form, submitter || undefined).entries())); } catch (err) { try { data = fromPairs(Array.from(new FormData(form).entries())); } catch (err2) { data = {}; } }
    if (data.checkout !== undefined || checkoutPath(routed(form.getAttribute("action") || ""))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      liveOnly("checkout");
      return;
    }
    /* After every other listener: whether the theme took the submit for itself. */
    addEventListener("submit", function last(ev) {
      removeEventListener("submit", last);
      if (ev !== e || ev.defaultPrevented) return;
      ev.preventDefault();
      postForm(String(form.getAttribute("method") || "GET").toUpperCase(), form.getAttribute("action"), data);
    });
  }, true);
  /* A form a script submits (form.submit() fires no submit event): the same, never a page leaving the canvas. */
  var formSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    var form = this;
    var path = routed(form.getAttribute("action") || pagePath);
    if (path === null) return;
    var data = {};
    try { data = fromPairs(Array.from(new FormData(form).entries())); } catch (err) {}
    postForm(String(form.getAttribute("method") || "GET").toUpperCase(), path, data);
  };
  void formSubmit;
  /*
    A PAGE A SCRIPT OPENS (location.href = "/checkout") cannot be stopped from
    in here: a frame with no origin is told of no navigation it starts. The
    builder is told the page is leaving, draws it again in its place, and,
    when what was just pressed reads as checkout, says where checkout is.
  */
  var pressed = { at: 0, checkout: false };
  addEventListener("pointerdown", function (e) { pressed = { at: Date.now(), checkout: isCheckout(e.target) || /check ?out|buy (it )?now/i.test(String((e.target && e.target.closest && (e.target.closest("button, a, [role=button]") || {}).className) || "")) }; }, true);
  addEventListener("pagehide", function () { post({ type: "leaving", checkout: pressed.checkout && Date.now() - pressed.at < 3000 }); });
  addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.storelib !== 1 || m.type !== "response") return;
    var done = waiting[m.id];
    if (done) { delete waiting[m.id]; done(m); }
  });
})();
`.trim()

/**
 * FIRST IN THE CANVAS PAGE'S HEAD. A frame with no origin of its own has no
 * storage: `localStorage` and `sessionStorage` throw, and a theme that keeps
 * its recently viewed products there stops on its first line. Each gets a
 * store in memory, and `document.cookie` reads empty. The store outlives the
 * frame: what it held is sent to the builder as it changes and handed to
 * the next page drawn (window.__slSeed), so a heart pressed on one page is
 * still pressed on the next, and the wishlist count agrees, as on the site.
 */
export const CANVAS_HEAD = `<style data-sl-canvas>preload-page,.preload-page,website-intro,.website-intro,#preloader,.site-preloader,.page-loader,.page-loading-overlay{display:none!important}</style><script>(function(){var seed=window.__slSeed||{};function S(n){var m=new Map();var held=seed[n];if(held&&typeof held==="object")Object.keys(held).forEach(function(k){if(typeof held[k]==="string")m.set(k,held[k])});var t=0;var tell=function(){if(t)return;t=setTimeout(function(){t=0;var o={};m.forEach(function(v,k){o[k]=v});try{parent.postMessage({storelib:1,type:"storage",area:n,items:o},"*")}catch(e){}},0)};return{get length(){return m.size},key:function(i){return Array.from(m.keys())[i]??null},getItem:function(k){return m.has(String(k))?m.get(String(k)):null},setItem:function(k,v){m.set(String(k),String(v));tell()},removeItem:function(k){m.delete(String(k));tell()},clear:function(){m.clear();tell()}}}
["localStorage","sessionStorage"].forEach(function(n){var ok=false;try{ok=!!window[n]}catch(e){ok=false}if(!ok){try{Object.defineProperty(window,n,{value:S(n),configurable:true})}catch(e){}}});
try{document.cookie}catch(e){try{Object.defineProperty(document,"cookie",{get:function(){return ""},set:function(){},configurable:true})}catch(e2){}}})();</script><script>${CANVAS_REQUESTS}</script>`
