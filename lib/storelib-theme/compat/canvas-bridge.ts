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
  css.textContent = "[data-sl-box]{position:fixed;pointer-events:none;box-sizing:border-box;z-index:2147483646;display:none;transition:opacity .2s cubic-bezier(.4,0,.2,1)}" +
    "@media (prefers-reduced-motion:reduce){[data-sl-box]{transition:none}}" +
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
  /*
    ONLY WHAT CAN BE SEEN IS OUTLINED. The boxes sit above everything, so a
    menu drawer, a cart drawer or a pop-up the theme opened over the selected
    section had the blue ring drawn straight across it (a header selected,
    then its phone menu opened: the ring stayed over the menu). Each box is
    now cut to the part of its element that is actually on top at that spot,
    read with elementsFromPoint down the element: a drawer, a backdrop or a
    sticky bar over it hides or shortens the ring, and it comes back when
    they go. Something of the theme's own that is fixed inside the section
    (its drawer, a modal) counts as covering it; a see-through layer that
    paints nothing does not.
  */
  var styleCache = null, fadeCache = null;
  var styleOf = function (n) {
    if (!styleCache) styleCache = new Map();
    var cs = styleCache.get(n);
    if (!cs) { cs = getComputedStyle(n); styleCache.set(n, cs); }
    return cs;
  };
  var opacityOf = function (n) {
    if (!fadeCache) fadeCache = new Map();
    if (!n || n.nodeType !== 1) return 1;
    var v = fadeCache.get(n);
    if (v === undefined) { v = parseFloat(styleOf(n).opacity || "1") * opacityOf(n.parentElement); fadeCache.set(n, v); }
    return v;
  };
  var clearBg = function (bg) {
    if (!bg || bg === "transparent") return true;
    var m = /rgba?\\(([^)]*)\\)/.exec(bg);
    if (!m) return false;
    var parts = m[1].split(m[1].indexOf(",") >= 0 ? "," : "/");
    return parts.length > 3 && parseFloat(parts[3]) === 0;
  };
  /* Whether an element draws anything where it is: a see-through wrapper the size of the screen does not cover what is under it. */
  var paints = function (n) {
    if (opacityOf(n) < 0.05) return false;
    if (/^(IMG|VIDEO|CANVAS|IFRAME|INPUT|TEXTAREA|SELECT|BUTTON|PICTURE|svg|SVG)$/.test(n.tagName)) return true;
    var cs = styleOf(n);
    if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
    if (!clearBg(cs.backgroundColor)) return true;
    if (cs.backdropFilter && cs.backdropFilter !== "none") return true;
    for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.data.trim()) return true;
    return false;
  };
  var fixedBetween = function (n, el) {
    for (; n && n !== el; n = n.parentElement) {
      if (n.tagName === "DIALOG" && n.open) return true;
      if (styleOf(n).position === "fixed") return true;
    }
    return false;
  };
  /* Is the element itself what is seen at this point? \`loose\`: its own content is fixed (a phone tab bar), so that is it, not something over it. */
  var owns = function (el, x, y, loose) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var c = stack[i];
      if (c.hasAttribute && c.hasAttribute("data-sl-box")) continue;
      var inside = c === el || el.contains(c);
      if (inside && (loose || !fixedBetween(c, el))) return true;
      if (c === document.body || c === document.documentElement) return false;
      if (paints(c)) return false;
    }
    return false;
  };
  /* An element with no box of its own (its content is all fixed, like a tab bar): the box of what it holds. */
  var contentBox = function (el) {
    var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    var walk = function (n, depth) {
      for (var c = n.firstElementChild; c; c = c.nextElementSibling) {
        if (c.tagName === "SCRIPT" || c.tagName === "STYLE") continue;
        var q = c.getBoundingClientRect();
        if (q.width >= 1 && q.height >= 1) { l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
        else if (depth < 3) walk(c, depth + 1);
      }
    };
    walk(el, 0);
    return r > l && b > t ? { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t } : null;
  };
  var leaving = false;
  /* The part of an element on top and on screen, or null when none of it is. */
  var visibleRect = function (el, inset) {
    if (!el || !el.isConnected || leaving) return null;
    var r = el.getBoundingClientRect(), loose = false;
    if (r.width < 1 || r.height < 1) { r = contentBox(el); loose = true; if (!r) return null; }
    /* A block as wide as the screen is outlined just inside it: two pixels out, its sides were off the page and only a line under it showed. */
    var left = Math.max(r.left + inset, 0), right = Math.min(r.right - inset, document.documentElement.clientWidth || innerWidth);
    var top = Math.max(r.top + inset, 0), bottom = Math.min(r.bottom - inset, innerHeight);
    if (right - left < 1 || bottom - top < 1) return null;
    var xs = [left + (right - left) * 0.15, (left + right) / 2, left + (right - left) * 0.85];
    var seen = function (y) {
      for (var i = 0; i < xs.length; i++) if (owns(el, Math.min(Math.max(xs[i], 0.5), innerWidth - 0.5), y, loose)) return true;
      return false;
    };
    var rows = Math.max(3, Math.min(6, Math.round((bottom - top) / 80)));
    var step = (bottom - top) / rows, first = -1, last = -1;
    for (var i = 0; i < rows; i++) if (seen(top + step * (i + 0.5))) { if (first < 0) first = i; last = i; }
    if (first < 0) return null;
    var lo, hi, k;
    var from = top, to = bottom;
    /* A whole pixel in from each edge: a hit test reads whole pixels, and half a pixel past the foot is the next section. */
    if (!seen(top + 1)) {
      lo = top + 1; hi = top + step * (first + 0.5);
      for (k = 0; k < 7; k++) { var m1 = (lo + hi) / 2; if (seen(m1)) hi = m1; else lo = m1; }
      from = Math.round(hi);
    }
    if (!seen(bottom - 1)) {
      lo = top + step * (last + 0.5); hi = bottom - 1;
      for (k = 0; k < 7; k++) { var m2 = (lo + hi) / 2; if (seen(m2)) lo = m2; else hi = m2; }
      to = Math.round(lo);
    }
    if (to - from < 2) return null;
    return { left: left, width: right - left, top: from, bottom: to, cutTop: from > r.top + inset + 0.5, cutBottom: to < r.bottom - inset - 0.5 };
  };
  var place = function (box, el, inset) {
    var v = visibleRect(el, inset);
    if (!v) { box.style.display = "none"; return null; }
    box.style.display = "block";
    box.style.width = v.width + "px";
    box.style.height = (v.bottom - v.top) + "px";
    /* Cut by the edge of the screen or by something over it: no line there. */
    box.style.borderTopWidth = v.cutTop ? "0" : "";
    box.style.borderBottomWidth = v.cutBottom ? "0" : "";
    /*
      FIXED IS NOT ALWAYS THE SCREEN. A theme that moves <html> or <body> (a translate), a filter
      or \`contain\` on them (a page fade, a drawer that slides the
      page) makes that element the box's frame, and every outline sat off by
      its offset. Where the box lands is read back and the difference taken
      out, so it is always on the element.
    */
    var dx = box.__dx || 0, dy = box.__dy || 0;
    box.style.left = (v.left - dx) + "px";
    box.style.top = (v.top - dy) + "px";
    var got = box.getBoundingClientRect();
    var ex = got.left - v.left, ey = got.top - v.top;
    if (Math.abs(ex) > 0.5 || Math.abs(ey) > 0.5) {
      box.__dx = dx + ex; box.__dy = dy + ey;
      box.style.left = (v.left - box.__dx) + "px";
      box.style.top = (v.top - box.__dy) + "px";
    }
    return v;
  };
  var drawFrame = 0;
  /*
    \`withReport\`: the toolbar's box is sent from the same reading. The two
    were read apart, each with its own run of hit tests down the section, in
    the same frame; a box report waiting for the next frame is sent from this
    one instead.
  */
  var drawBoxes = function (withReport) {
    drawFrame = 0;
    styleCache = null;
    fadeCache = null;
    if (!boxes) boxes = { hover: boxOf("hover"), section: boxOf("section"), block: boxOf("block") };
    var hov = document.querySelector("[data-sl-hover]");
    var sec = document.querySelector("[data-sl-selected]");
    var blk = document.querySelector("[data-sl-selected-block]");
    place(boxes.hover, hov && hov !== sec ? hov : null, 0);
    /* ONE SELECTION AT A TIME: a block that is selected is the outline; its section's own ring round it was a second box, wider than the block and off to one side of it while either moved. */
    var b = place(boxes.block, blk, -2);
    var seen = place(boxes.section, b ? null : sec, 0);
    if (withReport === true || boxFrame) {
      if (boxFrame) cancelAnimationFrame(boxFrame);
      /* The section's reading, when it was read: with a block selected it was not, and the report reads it itself. */
      report(b ? null : { el: sec, v: seen });
    }
  };
  var redraw = function () { if (!drawFrame) drawFrame = requestAnimationFrame(drawBoxes); };
  addEventListener("scroll", redraw, { passive: true, capture: true });
  addEventListener("resize", redraw);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(redraw).observe(document.documentElement);
  /*
    THE INSPECTOR, ON OR OFF. Off, this page is the website: nothing under
    the pointer is outlined, a click selects nothing, and links still open
    their pages in the builder. Known before the first paint (the builder
    writes window.__slInspect into the page it draws) and told again with
    every selection, so a page drawn while it was switched cannot show the
    old state.
  */
  var inspect = window.__slInspect !== false;
  var sectionOf = function (el) { return el && el.closest ? el.closest(".shopify-section") : null; };
  var idOf = function (s) { return s ? s.getAttribute("data-section-id") || s.id.replace(/^shopify-section-/, "") : null; };
  var blockOf = function (el, section) {
    var b = el && el.closest ? el.closest("[data-block-id]") : null;
    return b && section && section.contains(b) ? b : null;
  };
  var hovered = null;
  /* What the pointer is over, kept while the inspector is off too, so switching it on outlines that section without waiting for the pointer to move. */
  var pointerAt = null;
  var hover = function (s) {
    if (s === hovered) return;
    if (hovered) hovered.removeAttribute("data-sl-hover");
    hovered = s;
    if (s && !s.hasAttribute("data-sl-selected")) s.setAttribute("data-sl-hover", "");
    redraw();
  };
  /*
    A MOUSE ONLY. A finger has no hover, but a tap sends the mouse events a
    page expects after it, so a tapped section was outlined twice, hovered
    and selected, and the hover stayed after the finger had gone. What the
    last pointer was is known from its own events.
  */
  var touching = false;
  document.addEventListener("pointerdown", function (e) {
    touching = e.pointerType !== "mouse";
    if (touching && hovered) { hovered.removeAttribute("data-sl-hover"); hovered = null; redraw(); }
  }, true);
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType !== "mouse") return;
    touching = false;
    pointerAt = e.target;
    if (inspect) hover(sectionOf(e.target));
  }, true);
  document.addEventListener("mouseleave", function () { pointerAt = null; if (hovered) hovered.removeAttribute("data-sl-hover"); hovered = null; redraw(); });
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
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType !== "mouse") return;
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
  /*
    WHERE THE POINTER IS GOING. A link the mouse rests on, or a finger lands
    on, is told to the builder before the click, so it can ask for that
    page's sections ahead (the editor's prefetchPageSections): a page switch
    then starts with what it needs. Once per link until another is touched.
  */
  var intended = null;
  var intent = function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || a === intended) return;
    intended = a;
    var h = a.getAttribute("data-sl-href") || a.getAttribute("href") || "";
    if (h.charAt(0) === "/" && h.charAt(1) !== "/") post({ type: "intent", href: h });
  };
  document.addEventListener("pointerover", function (e) { if (e.pointerType === "mouse") intent(e); }, true);
  document.addEventListener("pointerdown", intent, true);
  /*
    A LINK THE THEME TAKES IS THE THEME'S. The header's cart is a link to
    /cart that the theme's own script turns into "open the drawer" (it calls
    preventDefault). Opened as a page here as well, the drawer slid in and
    the canvas went to the cart page under it. So the builder hears about a
    link only once every listener of the theme's has had the click, at the
    window, last: a click the theme prevented is left to the theme. The frame
    itself never follows a link either way. A theme that stops the click
    going further (stopPropagation) is asked the same thing as soon as that
    listener returns.
  */
  var taken = null;
  /* A theme that takes every link to play its own exit and then opens the page itself (location.href): the page it opened, as the builder would. */
  addEventListener("pagehide", function () {
    if (taken && Date.now() - taken.at < 3000) post({ type: "navigate", href: taken.href, chrome: taken.chrome });
    else if (pressedCard && Date.now() - pressedCard.at < 3000) post({ type: "navigate", href: pressedCard.href, chrome: pressedCard.chrome });
  });
  /*
    A CARD THAT IS ITS OWN LINK. A product card pressed anywhere but on its
    link (Horizon's, a picture or the space around the name) opens the
    product with location.href, which a frame with no origin cannot report.
    The press is remembered: the card is the nearest box around it whose
    links all go to one page, and that page is what opened.
  */
  var pressedCard = null;
  var oneLinkAround = function (el) {
    for (var at = el, depth = 0; at && at !== document.body && depth < 8; at = at.parentElement, depth++) {
      if (!at.querySelectorAll || (at.classList && at.classList.contains("shopify-section"))) return null;
      var hrefs = {};
      var n = 0;
      Array.prototype.forEach.call(at.querySelectorAll("a[href]"), function (a) { var h = a.getAttribute("href") || ""; if (/^\\//.test(h) && !/^\\/\\//.test(h) && !hrefs[h]) { hrefs[h] = 1; n++; } });
      if (n > 1) return null;
      if (n === 1) return Object.keys(hrefs)[0];
    }
    return null;
  };
  document.addEventListener("click", function (e) {
    var t = e.target;
    pressedCard = null;
    if (!t || !t.closest || t.closest("a[href], button, input, select, textarea, label, form, [role=button], summary")) return;
    var href = oneLinkAround(t);
    if (href) pressedCard = { href: href, at: Date.now(), chrome: !!t.closest("[class*='shopify-section-group-'], header, footer, nav") };
  }, true);
  var follow = function (e, link) {
    var themeTook = false;
    var settled = false;
    var own = e.preventDefault;
    e.preventDefault = function () { themeTook = true; return own.call(e); };
    var decide = function () {
      if (settled) return;
      settled = true;
      removeEventListener("click", last);
      if (!e.defaultPrevented) own.call(e);
      /*
        The builder decides whether a link opens its page: the header's, the
        footer's and the Overlay group's (a phone tab bar, a menu drawer)
        always do, as the site's own navigation.
      */
      var chrome = !!link.closest("[class*='shopify-section-group-'], header, footer, nav, mobile-navigation-bar, [class*='mobile-nav'], [class*='bottom-nav'], [class*='drawer']");
      var href = link.getAttribute("href") || "";
      if (themeTook) { taken = { href: href, chrome: chrome, at: Date.now() }; return; }
      taken = null;
      post({ type: "navigate", href: href, chrome: chrome });
      /* Off to another page: nothing of this one stays outlined while it goes. Back after a moment if the builder kept this page. */
      if (/^(\\/|https?:)/i.test(href) && !/^\\/?#/.test(href)) {
        leaving = true;
        drawBoxes(true);
        setTimeout(function () { leaving = false; redraw(); reportSoon(); }, 1500);
      }
    };
    var last = function (ev) { if (ev === e) decide(); };
    addEventListener("click", last);
    ["stopPropagation", "stopImmediatePropagation"].forEach(function (n) {
      var stop = e[n];
      e[n] = function () {
        stop.call(e);
        /* Not now: the same listener may prevent it on its next line. Still inside the click, before the browser would follow it. */
        if (!settled) { own.call(e); Promise.resolve().then(decide); }
      };
    });
  };
  document.addEventListener("click", function (e) {
    giveBack();
    var s = sectionOf(e.target);
    var link = e.target.closest && e.target.closest("a[href]");
    if (link && !e.defaultPrevented) follow(e, link);
    if (!s || !inspect) return;
    /* The block and every block around it, outermost first: the path the sidebar's tree reads. */
    var path = [];
    var at = blockOf(e.target, s);
    while (at) { path.unshift(at.getAttribute("data-block-id")); at = blockOf(at.parentElement, s); }
    var id = idOf(s);
    /*
      A TAP ON WHAT IS SELECTED GOES UP A LEVEL. A finger is wider than a
      heading inside a slide inside a slideshow, and the first tap takes the
      innermost block under it. Tapped again in the same place, the block
      around it is selected, then the section, and then the innermost again
      (with the section selected, a tap is a first tap). A mouse, which can
      point at the section's own edge, picks exactly.
    */
    var where = touching && !link && selected.section === id && selected.block ? path.indexOf(selected.block) : -1;
    if (where >= 0) path = path.slice(0, where);
    post({ type: "pick", sectionId: id, blockPath: path });
  }, true);
  var fire = function (el, name, detail) { try { el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail })); } catch (e) {} };
  var selected = { section: null, block: null };
  /* Where the selected section is on screen, for the builder's toolbar over the canvas. */
  var boxFrame = 0;
  /* The part of it that can be seen, as the outline has it: covered by a drawer, there is nothing for the toolbar to point at. Sent only when it changed. */
  var lastBox = "";
  var report = function (read) {
    boxFrame = 0;
    var el = inspect && selected.section ? document.getElementById("shopify-section-" + selected.section) : null;
    var v = el ? (read && read.el === el ? read.v : visibleRect(el, 0)) : null;
    var m = v ? { type: "box", id: selected.section, top: Math.round(v.top), left: Math.round(v.left), width: Math.round(v.width), height: Math.round(v.bottom - v.top) } : { type: "box", id: null };
    var key = JSON.stringify(m);
    if (key === lastBox) return;
    lastBox = key;
    post(m);
  };
  var reportSoon = function () { if (!boxFrame) boxFrame = requestAnimationFrame(report); if (typeof redraw === "function") redraw(); };
  addEventListener("scroll", reportSoon, { passive: true });
  addEventListener("resize", reportSoon);
  /*
    SOMETHING OPENED, CLOSED OR MOVED. A drawer is a class or a style changed
    and a transition after it, with no scroll to say so: for the next 700ms
    after any change on the page the outlines and the toolbar's box are read
    again, every 80ms rather than every frame (a theme's carousel changes
    the page all the time, and this runs in the editor's own process), and
    once more when a transition or an animation ends.
  */
  var burstEnd = 0, bursting = false;
  var burst = function () {
    if (!selected.section && !hovered) return;
    burstEnd = Date.now() + 700;
    if (bursting) return;
    bursting = true;
    var tick = function () {
      drawBoxes(true);
      if (Date.now() < burstEnd) setTimeout(function () { requestAnimationFrame(tick); }, 80); else bursting = false;
    };
    requestAnimationFrame(tick);
  };
  var watcher = null;
  if (typeof MutationObserver !== "undefined") {
    watcher = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var t = records[i].target;
        if (t && t.nodeType === 1 && t.hasAttribute("data-sl-box")) continue;
        burst();
        return;
      }
    });
    watcher.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "open", "hidden", "aria-hidden", "aria-expanded"] });
  }
  var settled = function () { if (selected.section || hovered) { redraw(); reportSoon(); } };
  addEventListener("transitionend", settled, true);
  addEventListener("animationend", settled, true);
  /* Every selection outline off the page; what is selected, for the theme, is unchanged. */
  var unmark = function () {
    document.querySelectorAll("[data-sl-selected],[data-sl-selected-block]").forEach(function (el) { el.removeAttribute("data-sl-selected"); el.removeAttribute("data-sl-selected-block"); });
  };
  /*
    \`quiet\`: outlined again, not selected again. The inspector coming back on
    marks what was already selected without telling the theme a second time:
    a theme that scrolls to a section it is told was selected, or opens its
    first slide, moved the page under somebody who only flipped a switch.
    While the inspector is off nothing is outlined, though the theme still
    hears what the builder selects.
  */
  var mark = function (sectionId, blockId, scroll, quiet) {
    unmark();
    var s = sectionId ? document.getElementById("shopify-section-" + sectionId) : null;
    if (quiet) {
      if (s && inspect) { s.setAttribute("data-sl-selected", ""); s.removeAttribute("data-sl-hover"); }
      var qb = s && blockId ? s.querySelector('[data-block-id="' + CSS.escape(blockId) + '"]') : null;
      if (qb && inspect) qb.setAttribute("data-sl-selected-block", "");
      reportSoon();
      redraw();
      return;
    }
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
    if (inspect) { s.setAttribute("data-sl-selected", ""); s.removeAttribute("data-sl-hover"); }
    fire(s, "shopify:section:select", { sectionId: sectionId, load: false });
    var b = blockId ? s.querySelector('[data-block-id="' + CSS.escape(blockId) + '"]') : null;
    if (b) {
      if (inspect) b.setAttribute("data-sl-selected-block", "");
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
      drawn[id] = html;
      fire(next, "shopify:section:load", { sectionId: id, load: true });
      if (selected.section === id) mark(selected.section, selected.block, false);
      reportSoon();
    });
  };
  /*
    ═══════════════════════════════════════════════════════════════════════
     A VALUE CHANGED IS CHANGED WHERE IT IS, NOT DRAWN AGAIN
    ═══════════════════════════════════════════════════════════════════════
    A slider dragged in the sidebar sends the section a dozen times a
    second, and each one was a swap: a new element in the old one's place,
    so every picture in it decoded again, every entrance animation the theme
    has played again, its carousel went back to the first slide and its
    reveal-on-scroll pieces started hidden. The section flashed on every
    step ("it glitches and refreshes every time while dragging").

    Most edits change values, not shape: a padding in the section's own
    <style>, a number in a class, a heading's words. So the markup the
    section was last drawn from is compared with the markup it should be
    now, and only what differs between those two is written into the page:
    an attribute, a class, a style property, a text. What the theme's own
    scripts did to the page since (a class it added, a slide it moved to) is
    left alone, because it is the same in both and so never touched. When
    the shape differs (a block added, a picture taken away), or the page no
    longer matches what was drawn, it is swapped as before.

    A change to something a script reads once (a data- attribute, a custom
    element's attribute, a script's JSON) is drawn in place too, and the
    section is swapped once, quietly, when the changes stop, so the theme's
    script starts again with the new value.
  */
  var drawn = {};
  var settleTimers = {};
  var skipNode = function (n) {
    if (n.nodeType === 8) return true;
    if (n.nodeType !== 1) return false;
    if (n.tagName === "LINK" && (n.getAttribute("rel") || "").toLowerCase() === "stylesheet") return true;
    return n.hasAttribute("data-sl-box");
  };
  var childrenOf = function (n) {
    var out = [];
    for (var c = n.firstChild; c; c = c.nextSibling) if (!skipNode(c)) out.push(c);
    return out;
  };
  var declarations = function (s) {
    var o = {};
    (s || "").split(";").forEach(function (d) {
      var i = d.indexOf(":");
      if (i <= 0) return;
      var k = d.slice(0, i).trim();
      if (!k) return;
      if (k.indexOf("--") !== 0) k = k.toLowerCase();
      o[k] = d.slice(i + 1).trim();
    });
    return o;
  };
  var words = function (s) { return (s || "").split(/\\s+/).filter(Boolean); };
  var plan = function (live, a, b, ops) {
    if (a.nodeType !== b.nodeType || live.nodeType !== a.nodeType) return false;
    if (a.nodeType === 3) {
      if (a.data !== b.data) ops.push(function () { live.data = b.data; });
      return true;
    }
    if (a.nodeType !== 1) return true;
    if (a.tagName !== b.tagName || live.tagName !== a.tagName) return false;
    var tag = a.tagName, names = {}, i;
    for (i = 0; i < a.attributes.length; i++) names[a.attributes[i].name] = 1;
    for (i = 0; i < b.attributes.length; i++) names[b.attributes[i].name] = 1;
    Object.keys(names).forEach(function (n) {
      var va = a.getAttribute(n), vb = b.getAttribute(n);
      if (va === vb) return;
      if (n.indexOf("data-") === 0 || tag.indexOf("-") > 0) ops.restart = true;
      if (n === "class") {
        var wa = words(va), wb = words(vb);
        var gone = wa.filter(function (w) { return wb.indexOf(w) < 0; }), added = wb.filter(function (w) { return wa.indexOf(w) < 0; });
        ops.push(function () { gone.forEach(function (w) { live.classList.remove(w); }); added.forEach(function (w) { live.classList.add(w); }); });
      } else if (n === "style" && va !== null && vb !== null) {
        var da = declarations(va), db = declarations(vb);
        ops.push(function () {
          Object.keys(da).forEach(function (k) { if (!(k in db)) live.style.removeProperty(k); });
          Object.keys(db).forEach(function (k) {
            if (da[k] === db[k]) return;
            var v = db[k], important = /!important$/i.test(v);
            live.style.setProperty(k, important ? v.replace(/\\s*!important$/i, "") : v, important ? "important" : "");
          });
        });
      } else if (vb === null) {
        ops.push(function () { live.removeAttribute(n); });
      } else {
        ops.push(function () { live.setAttribute(n, vb); });
      }
    });
    if (tag === "SCRIPT") { if (a.textContent !== b.textContent) ops.restart = true; return true; }
    if (tag === "STYLE" || tag === "TEXTAREA" || tag === "TITLE") {
      if (a.textContent !== b.textContent) ops.push(function () { live.textContent = b.textContent; });
      return true;
    }
    if (tag === "TEMPLATE") {
      if (a.innerHTML !== b.innerHTML) { ops.restart = true; ops.push(function () { live.innerHTML = b.innerHTML; }); }
      return true;
    }
    var ka = childrenOf(a), kb = childrenOf(b), kl = childrenOf(live);
    if (ka.length !== kb.length || kl.length !== ka.length) return false;
    for (i = 0; i < ka.length; i++) if (!plan(kl[i], ka[i], kb[i], ops)) return false;
    return true;
  };
  var morph = function (id, html, prev) {
    var el = document.getElementById("shopify-section-" + id);
    var before = drawn[id] || prev;
    if (!el || typeof before !== "string" || typeof html !== "string") return false;
    if (before === html) return true;
    var ta = document.createElement("template"), tb = document.createElement("template");
    ta.innerHTML = before;
    tb.innerHTML = html;
    var a = ta.content.firstElementChild, b = tb.content.firstElementChild;
    if (!a || !b) return false;
    var ops = [];
    if (!plan(el, a, b, ops)) return false;
    Array.prototype.forEach.call(b.querySelectorAll('link[rel="stylesheet"][href]'), function (l) { keep(l.getAttribute("href")); });
    var y = scrollY;
    ops.forEach(function (op) { op(); });
    /*
      WHAT THIS WROTE IS NOT THE PAGE MOVING. The watcher above reads every
      change as something of the theme's that opened or moved, and redrew
      the outlines every 80ms for 700ms after it: on a slider dragged in the
      sidebar that was all the time, a run of hit tests down the section
      every few frames in the builder's own process. The changes made here
      are taken back off its list; the outline is read again once, below,
      and a transition they start is caught when it ends.
    */
    if (watcher) watcher.takeRecords();
    if (scrollY !== y) scrollTo(0, y);
    drawn[id] = html;
    clearTimeout(settleTimers[id]);
    if (ops.restart) {
      settleTimers[id] = setTimeout(function () {
        queue = queue.then(function () { if (drawn[id] === html) return swap(id, html); }).catch(function () {});
      }, 700);
    }
    if (selected.section === id) mark(selected.section, selected.block, false, true);
    reportSoon();
    return true;
  };
  /* The newest change asked for each section: one waiting behind a newer one is skipped. */
  var asked = {};
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
      delete drawn[id];
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
        drawn[it.id] = it.html;
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
  /*
    SWITCHED OFF, every mark goes: the hover and the selection fade where they
    are (200ms, the builder's own rings) and are then taken off the page, so
    nothing is left behind. Switched on, the selection the builder sends is
    marked again and fades up.
  */
  var letGo = 0;
  var fadeBoxes = function (on) { if (boxes) Object.keys(boxes).forEach(function (k) { boxes[k].style.opacity = on ? "" : "0"; }); };
  var setInspect = function (on) {
    on = on !== false;
    if (on === inspect) return;
    inspect = on;
    clearTimeout(letGo);
    if (on) {
      if (selected.section) mark(selected.section, selected.block, false, true);
      hover(pointerAt && pointerAt.isConnected ? sectionOf(pointerAt) : null);
      redraw();
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (inspect) fadeBoxes(true); }); });
      return;
    }
    if (hovered) { hovered.removeAttribute("data-sl-hover"); hovered = null; }
    fadeBoxes(false);
    var still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    letGo = setTimeout(function () { if (!inspect) { unmark(); redraw(); reportSoon(); } }, still ? 0 : 200);
  };
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.storelib !== 1) return;
    if (m.type === "patch") {
      /* After the section swaps already asked for, in order. */
      queue = queue.then(function () { patch(m); }).catch(function (err) { reload(String(err)); });
    } else if (m.type === "section") {
      /* In order: a swap that waits for a stylesheet holds the ones after it. Changed in place when it can be (morph); only the newest of a burst is drawn. */
      var n = (asked[m.id] = (asked[m.id] || 0) + 1);
      queue = queue.then(function () {
        if (asked[m.id] !== n) return;
        var done = false;
        try { done = morph(m.id, m.html, m.prev); } catch (err) { done = false; }
        if (!done) return swap(m.id, m.html);
      }).catch(function () {});
    } else if (m.type === "select") {
      leaving = false;
      if ("inspect" in m) setInspect(m.inspect);
      /* Off, nothing is outlined whatever was asked (setInspect takes the marks off after their fade); on, the same selection again is only outlined. */
      if (inspect) mark(m.sectionId || null, m.blockId || null, m.scroll !== false, (m.sectionId || null) === selected.section && (m.blockId || null) === selected.block);
    } else if (m.type === "inspect") {
      setInspect(m.on);
    } else if (m.type === "scroll") {
      /* A page behind, about to come forward: put where it should stand, and said once that is drawn (two frames), so it comes forward there and not a frame before. */
      if (m.settle) {
        /* Already there (another page, at its top): drawn there too, so said at once. */
        if (Math.abs(scrollY - (m.top || 0)) < 1) { post({ type: "settled", scrollY: scrollY }); return; }
        scrollTo({ top: m.top || 0, behavior: "instant" });
        requestAnimationFrame(function () { requestAnimationFrame(function () { post({ type: "settled", scrollY: scrollY }); }); });
      } else scrollTo({ top: m.top || 0 });
    } else if (m.type === "hello") {
      /* The builder heard the frame load but not this page say so: said again, whatever order the two happened in. */
      ready();
    }
  });
  var saidReady = false;
  var ready = function () { saidReady = true; post({ type: "ready", scrollY: scrollY }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
  /* Every section is in the page by the time this runs, at its foot. A deferred script of the theme's that stalls holds DOMContentLoaded back for good, and the canvas with it: ready is said anyway after a moment. */
  setTimeout(function () { if (!saidReady) ready(); }, 2500);
  /*
    "loaded" (its first screen drawn, pictures in, entrance done) is said by
    canvas-network.ts, CANVAS_SHOWN, at the head of the page. It was said here
    as well, at the window's load, which is whenever the slowest file of the
    page arrived (an app's script, a picture far down): the page behind came
    forward at whichever was first, drawn or not.
  */
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
    /* A Request made beforehand carries its own body. */
    var body = isReq && init.body === undefined && method !== "GET" && method !== "HEAD" ? input.clone().text() : Promise.resolve(init.body);
    return body.then(function (b) { return ask(method, path, fields(b, type), ajax); }).then(function (r) {
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
  /*
    SIGNING IN IS THE LIVE SITE'S. The account pages draw here, in the
    theme, so they can be seen and styled; sending one of their forms (sign
    in, Create account, a code, a password reset) says that works on the
    live site, and nothing is sent. A newsletter form posted to /account is
    the newsletter, and is left alone.
  */
  var accountPost = function (path, data) {
    if (path === null) return false;
    var p = String(path).split(/[?#]/)[0].replace(/\\/+$/, "");
    if (/^\\/api\\/site-account\\//.test(p)) return true;
    if (/^\\/account\\/(login|register|recover|reset|activate)(\\/|$)/.test(p)) return true;
    return p === "/account" && !(data && data.form_type === "customer");
  };
  var postForm = function (method, action, data) {
    var path = routed(action || pagePath) || pagePath;
    if (method === "POST" && accountPost(path, data)) { liveOnly("account"); return; }
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
    if (String(form.getAttribute("method") || "GET").toUpperCase() === "POST" && accountPost(routed(form.getAttribute("action") || pagePath), data)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      liveOnly("account");
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
