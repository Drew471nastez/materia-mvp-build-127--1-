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
  /*
    COPY AND PASTE FROM INSIDE THE PAGE. A click in the canvas puts the
    keyboard in this frame, so Cmd/Ctrl+C and V never reached the builder,
    which copies and pastes sections. Outside a field and with no text
    selected, the keys are handed to the builder; anything else is the page's.
  */
  document.addEventListener("keydown", function (e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    var k = (e.key || "").toLowerCase();
    if (k !== "c" && k !== "v") return;
    var t = e.target;
    if (t && t.closest && t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
    var sel = window.getSelection && window.getSelection();
    if (k === "c" && sel && !sel.isCollapsed && String(sel).trim() !== "") return;
    e.preventDefault();
    post({ type: "clip-key", key: k === "c" ? "copy" : "paste" });
  }, true);
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
    "[data-sl-box=hover]{border:2px solid rgba(59,130,246,.5)}" +
    "[data-sl-box=section]{border:2px solid #3b82f6}" +
    "[data-sl-box=block]{border:2px solid #3b82f6;box-shadow:0 0 0 1px rgba(255,255,255,.9)}";
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
  /* Something fixed or sticky that is not the element nor around it (a header, a tab bar) is what is seen at this point. */
  var barAt = function (el, x, y) {
    if (y < 0 || y >= innerHeight) return false;
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var c = stack[i];
      if (c.hasAttribute && c.hasAttribute("data-sl-box")) continue;
      if (c === el || c.contains(el) || el.contains(c)) return false;
      for (var n = c; n && n !== document.body; n = n.parentElement) {
        if (n.contains(el)) break;
        var p = styleOf(n).position;
        if (p === "fixed" || p === "sticky") return true;
      }
      return false;
    }
    return false;
  };
  /*
    The part of an element on top and on screen, or null when none of it is.
    \`inset\` moves the outline in (or out, below zero) from the element's own
    edges, AFTER the hit tests: they are always read inside the element.
    Read 2px outside it (the selected block's outline), the point above its
    top and the one under its foot were the section around it, so both
    edges were taken as covered and dropped, and a block was outlined by its
    two sides only. An edge is left off only where the element itself is
    cut there: off the screen, or under a sticky header or a drawer.
  */
  /*
    THE HEADER STUCK TO THE TOP, AS A LINE NOTHING CROSSES (round AH). The hit
    tests below read what paints; a header with see-through gaps (a
    transparent bar over the hero, a menu drawn on a pseudo element) let a
    section's sides run up through it. A sticky or fixed header at the top
    of the screen is measured, and no outline of anything outside it is
    drawn above its foot.
  */
  var HEADER_TOPS = ".shopify-section-group-header-group, .shopify-section-group-header-group > *, .shopify-section-group-header-group sticky-header, header, [data-sl-header]";
  var headerCover = function (el) {
    var cover = 0, tops = document.querySelectorAll(HEADER_TOPS);
    for (var i = 0; i < tops.length; i++) {
      var h = tops[i];
      if (h === el || h.contains(el) || el.contains(h)) continue;
      var p = styleOf(h).position;
      if (p !== "sticky" && p !== "fixed") continue;
      var q = h.getBoundingClientRect();
      if (q.top <= 1 && q.bottom > 0 && q.height < innerHeight * 0.6 && q.width > innerWidth * 0.5) cover = Math.max(cover, q.bottom);
    }
    return cover;
  };
  var visibleRect = function (el, inset) {
    if (!el || !el.isConnected || leaving) return null;
    var r = el.getBoundingClientRect(), loose = false;
    if (r.width < 1 || r.height < 1) { r = contentBox(el); loose = true; if (!r) return null; }
    var vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
    var left = Math.max(r.left, 0), right = Math.min(r.right, vw);
    var top = Math.max(r.top, 0, headerCover(el)), bottom = Math.min(r.bottom, vh);
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
    var cutTop = from > r.top + 0.5, cutBottom = to < r.bottom - 0.5;
    /* A block as wide as the screen is outlined just inside it: two pixels out, its sides were off the page and only a line under it showed. */
    var L = Math.max(r.left + inset, 0), R = Math.min(r.right - inset, vw);
    var T = cutTop ? from : Math.max(r.top + inset, 0), B = cutBottom ? to : Math.min(r.bottom - inset, vh);
    /* Drawn out from a block that sits right under a sticky header (or right over a tab bar): the line goes on the block's own edge, not 2px into the bar. */
    if (inset < 0 && !cutTop && T < r.top && barAt(el, (left + right) / 2, T + 0.5)) T = r.top;
    if (inset < 0 && !cutBottom && B > r.bottom && barAt(el, (left + right) / 2, B - 0.5)) B = r.bottom;
    if (R - L < 1 || B - T < 2) return null;
    return { left: L, width: R - L, top: T, bottom: B, cutTop: cutTop, cutBottom: cutBottom };
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
    place(boxes.hover, hov && hov !== blk && !(hov === sec && !blk) ? hov : null, 0);
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
  /*
    THE HOVER IS WHAT A CLICK WOULD PICK: the innermost block under the
    pointer, or its section where there is none. A section outlined while a
    click then picked the title inside it said one thing and did another.
  */
  var targetOf = function (el) { var s = sectionOf(el); return s ? blockOf(el, s) || s : null; };
  var hovered = null;
  /* What the pointer is over, kept while the inspector is off too, so switching it on outlines that section without waiting for the pointer to move. */
  var pointerAt = null;
  var hover = function (s) {
    if (s === hovered) return;
    if (hovered) hovered.removeAttribute("data-sl-hover");
    hovered = s;
    /* Not over its own outline: the block selected, or the section selected with no block of it. A section whose block is selected is still a section a click would pick. */
    if (s && !s.hasAttribute("data-sl-selected-block") && !(s.hasAttribute("data-sl-selected") && !s.querySelector("[data-sl-selected-block]"))) s.setAttribute("data-sl-hover", "");
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
    if (inspect) hover(targetOf(e.target));
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
  /*
    A SECTION PUT IN BELOW THE SCREEN STILL ARRIVES AS IT DOES LIVE. Told
    shopify:section:load, a Dawn family theme (animations.js) marks every
    .scroll-trigger in the section scroll-trigger--design-mode, which
    turns its reveal off for good: in the canvas, nothing below the screen
    rose or faded in once the section had been edited. The mark is the theme
    editor's, so it stays on what is on screen or above (nothing there hides
    or plays again under an edit); one wholly below the screen goes back to
    waiting off screen (scroll-trigger--offscreen, as the theme's own
    observer leaves it on the website) and comes in when it is scrolled to,
    exactly as the theme's onIntersection does it. Never under reduced
    motion, where the theme shows everything as it is.

    The canvas now tells the theme it is on the website (Shopify.designMode
    false, theme.ts themeDesignMode), so Dawn no longer marks anything; this
    stays for a theme that marks its sections still by some other sign.
  */
  var waking = null;
  var wake = function (scope) {
    if (!scope || !scope.querySelectorAll || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var marked = Array.prototype.slice.call(scope.querySelectorAll(".scroll-trigger--design-mode"));
    if (!marked.length) return;
    if (!waking) waking = new (window.__slIO || IntersectionObserver)(function (entries) {
      entries.filter(function (e) { return e.isIntersecting; }).forEach(function (e, i) {
        var el = e.target;
        waking.unobserve(el);
        if (!el.classList.contains("scroll-trigger--offscreen")) return;
        el.classList.remove("scroll-trigger--offscreen");
        if (el.hasAttribute("data-cascade")) el.style.setProperty("--animation-order", String(i));
      });
    }, { rootMargin: "0px 0px -50px 0px" });
    marked.forEach(function (el) {
      if (el.getBoundingClientRect().top < innerHeight) return;
      el.classList.remove("scroll-trigger--design-mode");
      el.classList.add("scroll-trigger--offscreen");
      waking.observe(el);
    });
  };
  /*
    ═══════════════════════════════════════════════════════════════════════
     A SECTION DRAWN AGAIN KEEPS WHAT THE THEME'S SCRIPTS DID TO IT
    ═══════════════════════════════════════════════════════════════════════
    A section swapped in (swap, below) is new markup, as the theme's Liquid
    draws it: none of what the theme's scripts did to the one it replaces.
    A theme that brings its sections in as they are scrolled to watches
    them from the start (an IntersectionObserver made as the page opens)
    and adds a class when each arrives, so the new markup was nobody's to
    bring in: measured on the fixture (scripts/check-canvas-scroll-motion.ts)
    a section on screen went from shown to opacity 0 at the swap and stayed
    there, and one below the screen never arrived. Shopify's theme editor
    hides this by telling the theme it is in the editor, where most themes
    show everything still; the canvas tells it the website's value, so the
    theme moves as it does there, and this keeps a swap honest instead:

      WHAT WAS WATCHED IS WATCHED. The theme's own observers (CANVAS_HEAD
      notes which element each one watches) watch the new element in place
      of the one it replaces, and a block new to the section is watched by
      whatever watches its look-alikes (the same tag and classes). The
      theme's own code then brings it in when it is scrolled to, as on the
      website. Not an observer whose root is an element of the page (a
      carousel watching its own slides): that root is gone with the section.

      WHAT WAS SHOWN STAYS SHOWN. An element that was showing before the
      swap and is hidden after it gets back what the theme's scripts had
      changed on it (its classes, its inline style, its data- attributes),
      unless a look-alike beside it is showing (one slide of a slideshow
      among others, hidden on purpose); and an entrance that starts on it at
      the swap is put where it ends. Nothing fades or rises again under an
      edit, wherever it stands on the page.
  */
  var watch = window.__slWatch || null;
  var shownNow = function (el) {
    var cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) >= 0.5;
  };
  var sigOf = function (el) { return el.tagName + "." + words(el.getAttribute("class")).sort().join("."); };
  var elementsOf = function (n) {
    return childrenOf(n).filter(function (c) { return c.nodeType === 1 && c.tagName !== "SCRIPT" && c.tagName !== "STYLE" && c.tagName !== "TEMPLATE"; });
  };
  /* The element on the page, the markup it was drawn from, and the new element, side by side wherever the three agree. Read before the swap. */
  var pairsOf = function (live, a, b, out) {
    if (!live || !a || !b || live.tagName !== a.tagName || b.tagName !== a.tagName || sigOf(a) !== sigOf(b)) return out;
    out.push({ live: live, a: a, b: b, shown: shownNow(live) });
    var kl = elementsOf(live), ka = elementsOf(a), kb = elementsOf(b);
    if (kl.length !== ka.length) return out;
    for (var i = 0; i < ka.length && i < kb.length; i++) pairsOf(kl[i], ka[i], kb[i], out);
    return out;
  };
  /* What the theme's scripts changed on the old element (live against the markup), written on the new one. */
  var carry = function (p) {
    var names = {}, i;
    for (i = 0; i < p.a.attributes.length; i++) names[p.a.attributes[i].name] = 1;
    for (i = 0; i < p.live.attributes.length; i++) names[p.live.attributes[i].name] = 1;
    Object.keys(names).forEach(function (n) {
      if (n !== "class" && n !== "style" && (n.indexOf("data-") !== 0 || n.indexOf("data-sl") === 0)) return;
      var va = p.a.getAttribute(n), vl = p.live.getAttribute(n);
      if (va === vl) return;
      if (n === "class") {
        var wa = words(va), wl = words(vl);
        wl.forEach(function (w) { if (wa.indexOf(w) < 0) p.b.classList.add(w); });
        wa.forEach(function (w) { if (wl.indexOf(w) < 0) p.b.classList.remove(w); });
      } else if (n === "style") {
        var da = declarations(va), dl = declarations(vl);
        Object.keys(da).forEach(function (k) { if (!(k in dl)) p.b.style.removeProperty(k); });
        Object.keys(dl).forEach(function (k) {
          if (da[k] === dl[k]) return;
          var v = dl[k], important = /!important$/i.test(v);
          p.b.style.setProperty(k, important ? v.replace(/\\s*!important$/i, "") : v, important ? "important" : "");
        });
      } else if (vl === null) p.b.removeAttribute(n);
      else p.b.setAttribute(n, vl);
    });
  };
  var usable = function (io) { return !watch || watch.usable(io); };
  /* WHAT WAS WATCHED IS WATCHED: \`pairs\` from a swap (none for a section added), \`root\` the new section. */
  var rewatch = function (pairs, root) {
    if (!watch) return;
    var paired = new Set();
    pairs.forEach(function (p) {
      paired.add(p.b);
      var by = watch.watching.get(p.live);
      if (by) by.forEach(function (io) { if (usable(io)) { try { io.observe(p.b); } catch (e) {} } });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[class]"), function (el) {
      if (paired.has(el)) return;
      var by = watch.bySig.get(sigOf(el));
      if (by) by.forEach(function (io) { if (usable(io)) { try { io.observe(el); } catch (e) {} } });
    });
  };
  /* WHAT WAS SHOWN STAYS SHOWN. Each is decided first, against the page as the swap left it, then written. */
  var keepShown = function (pairs) {
    var hidden = pairs.filter(function (p) { return p.shown && p.b.isConnected && !shownNow(p.b); });
    /* A look-alike: the same tag and a class in common (a slide's own state class aside, "slide" and "slide is-active" are the same kind). */
    var alike = function (x, y) { var wy = words(y.getAttribute("class")); return x.tagName === y.tagName && words(x.getAttribute("class")).some(function (w) { return wy.indexOf(w) >= 0; }); };
    var lonely = hidden.filter(function (p) {
      var parent = p.b.parentElement;
      return !parent || !elementsOf(parent).some(function (c) { return c !== p.b && alike(c, p.b) && shownNow(c); });
    });
    lonely.forEach(carry);
    pairs.forEach(function (p) {
      if (!p.shown || !p.b.isConnected || !p.b.getAnimations) return;
      try {
        p.b.getAnimations().forEach(function (x) { var t = x.effect && x.effect.getComputedTiming(); if (t && isFinite(t.endTime)) x.finish(); });
      } catch (e) {}
    });
  };
  /*
    A SELECTED BLOCK IN A ROW THAT SCROLLS SIDEWAYS (a slideshow, a carousel
    of cards) is brought into that row, as Dawn's theme-editor.js did when
    the theme was told it was in the editor (the canvas no longer loads it:
    it is drawn only under request.design_mode). Only a row the visitor can
    scroll; a slider that moves by transform is the theme's to move.
  */
  var showAcross = function (el) {
    for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (n.scrollWidth <= n.clientWidth + 1) continue;
      var ox = getComputedStyle(n).overflowX;
      if (ox !== "auto" && ox !== "scroll") continue;
      var nr = n.getBoundingClientRect(), er = el.getBoundingClientRect();
      if (er.left >= nr.left - 1 && er.right <= nr.right + 1) return;
      var still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      n.scrollTo({ left: n.scrollLeft + er.left - nr.left, behavior: still ? "auto" : "smooth" });
      return;
    }
  };
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
      if (qb && inspect) { qb.setAttribute("data-sl-selected-block", ""); qb.removeAttribute("data-sl-hover"); }
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
      if (inspect) { b.setAttribute("data-sl-selected-block", ""); b.removeAttribute("data-sl-hover"); }
      fire(b, "shopify:block:select", { blockId: blockId, sectionId: sectionId, load: false });
      showAcross(b);
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
  var swap = function (id, html, prev) {
    var tpl = document.createElement("template");
    tpl.innerHTML = html;
    var next = tpl.content.firstElementChild;
    if (!next) return;
    var links = Array.prototype.slice.call(next.querySelectorAll('link[rel="stylesheet"][href]'));
    return Promise.all(links.map(function (l) { return keep(l.href); })).then(function () {
      links.forEach(function (l) { l.remove(); });
      var el = document.getElementById("shopify-section-" + id);
      if (!el) { post({ type: "missing", id: id }); return; }
      /* What the theme's scripts did to it, read before it goes (KEEPS WHAT THE THEME'S SCRIPTS DID TO IT). */
      var from = drawn[id] || prev, pairs = [];
      if (typeof from === "string") {
        var tf = document.createElement("template");
        tf.innerHTML = from;
        try { pairs = pairsOf(el, tf.content.firstElementChild, next, []); } catch (e) { pairs = []; }
      }
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
      wake(next);
      rewatch(pairs, next);
      keepShown(pairs);
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
      wake(el);
      rewatch([], el);
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
      hover(pointerAt && pointerAt.isConnected ? targetOf(pointerAt) : null);
      redraw();
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (inspect) fadeBoxes(true); }); });
      return;
    }
    if (hovered) { hovered.removeAttribute("data-sl-hover"); hovered = null; }
    fadeBoxes(false);
    var still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    letGo = setTimeout(function () { if (!inspect) { unmark(); redraw(); reportSoon(); } }, still ? 0 : 200);
  };
  var revealSection = function (id) {
    if (!id) return;
    var tries = 0;
    var go = function () {
      var el = document.getElementById("shopify-section-" + id) || document.querySelector('[data-section-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (!el) { if (++tries < 10) setTimeout(go, 120); return; }
      var cover = 0;
      var tops = document.querySelectorAll(".shopify-section-group-header-group, .shopify-section-group-header-group > *, header");
      for (var i = 0; i < tops.length; i++) {
        var cs = getComputedStyle(tops[i]);
        if (cs.position === "sticky" || cs.position === "fixed") { var r = tops[i].getBoundingClientRect(); if (r.top <= 1) cover = Math.max(cover, r.bottom); }
      }
      var top = Math.max(0, el.getBoundingClientRect().top + scrollY - cover - 16);
      var still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (Math.abs(scrollY - top) > 4) scrollTo({ top: top, behavior: still ? "auto" : "smooth" });
    };
    requestAnimationFrame(function () { requestAnimationFrame(go); });
  };
  /*
    THE EDITOR'S SIZE SWITCH, FROM IN HERE. The builder resizes this frame
    with its canvas (desktop, phone, full screen), and the page reflows at
    every frame like a window being resized. Two things went wrong in it,
    filmed on Dawn (scripts/check-view-switch-frames.mjs): the place being
    read was lost (scrolled to the middle, going to the desktop landed 548px
    away, on another section), and pieces that waited off screen to rise in
    came into view as the page got shorter and faded in, a white gap until
    they did. While the builder says hold-view: the element under the eye
    (a quarter of the way down, at most 120px) is kept where it was, after
    each layout and before it is drawn, and anything waiting to rise in that
    the resize brings into view is simply there. A wheel or a touch is the
    person scrolling, and ends it; so does the builder, or two seconds.
  */
  var holding = null;
  var holdView = function (on) {
    if (holding) { holding.stop(); holding = null; }
    /* The theme's own scripts through the switch, and a moment after it (canvas-bridge.ts, CANVAS_SWITCH). */
    if (window.__slSwitch) window.__slSwitch(!!on);
    if (!on || typeof ResizeObserver === "undefined") return;
    var se = document.scrollingElement || document.documentElement;
    var eye = document.elementFromPoint(innerWidth / 2, Math.min(120, innerHeight / 4));
    var at = eye ? eye.getBoundingClientRect().top : 0;
    var anchor = se.style.overflowAnchor;
    se.style.overflowAnchor = "none";
    var began = document.timeline ? document.timeline.currentTime : null;
    var inView = function (el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
    var show = function () {
      var waiting = document.querySelectorAll(".scroll-trigger--offscreen");
      for (var i = 0; i < waiting.length; i++) {
        if (!inView(waiting[i])) continue;
        /*
          Its entrance started and taken to its end at once, not switched off:
          a theme can keep the piece faint at rest and rely on the entrance
          (filled forwards) to show it, so "animation: none" left it invisible.
        */
        waiting[i].classList.remove("scroll-trigger--offscreen");
        void getComputedStyle(waiting[i]).opacity;
        if (waiting[i].getAnimations) waiting[i].getAnimations().forEach(function (a) {
          var tm = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
          if (tm && isFinite(tm.endTime)) { try { a.finish(); } catch (e) {} }
        });
      }
      if (!document.getAnimations || began === null) return;
      document.getAnimations().forEach(function (a) {
        var t = a.effect && a.effect.target;
        if (!t || !t.getBoundingClientRect || a.startTime === null || a.startTime < began) return;
        var timing = a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
        if (!timing || !isFinite(timing.endTime)) return;
        var fades = a.transitionProperty === "opacity" || (a.effect.getKeyframes && a.effect.getKeyframes().some(function (k) { return "opacity" in k; }));
        if (fades && inView(t)) { try { a.finish(); } catch (e) {} }
      });
    };
    var keep = function () {
      show();
      if (!eye || !eye.isConnected) return;
      var moved = eye.getBoundingClientRect().top - at;
      if (Math.abs(moved) >= 0.5) scrollTo({ top: scrollY + moved, behavior: "instant" });
    };
    var ro = new ResizeObserver(keep);
    ro.observe(document.documentElement);
    addEventListener("resize", keep);
    /*
      Those scrolls are not the person's: the theme's own scripts are not told
      of them (a sticky header that hides on the way down slid away as the
      page was held in place). Said once, where it ended, when the hold ends.
    */
    var quiet = function (e) { if (e.target === document || e.target === window) e.stopImmediatePropagation(); };
    addEventListener("scroll", quiet, true);
    var mine = function () { holdView(false); };
    addEventListener("wheel", mine, { passive: true });
    addEventListener("touchstart", mine, { passive: true });
    var t = setTimeout(mine, 2000);
    holding = { stop: function () {
      if (window.__slSwitch) window.__slSwitch(false);
      ro.disconnect();
      clearTimeout(t);
      removeEventListener("resize", keep);
      removeEventListener("scroll", quiet, true);
      removeEventListener("wheel", mine);
      removeEventListener("touchstart", mine);
      se.style.overflowAnchor = anchor;
      post({ type: "scrolled", scrollY: scrollY });
    } };
  };
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.storelib !== 1) return;
    if (m.type === "hold-view") { holdView(!!m.on); return; }
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
        if (!done) return swap(m.id, m.html, m.prev);
      }).catch(function () {});
    } else if (m.type === "select") {
      leaving = false;
      if ("inspect" in m) setInspect(m.inspect);
      /* Off, nothing is outlined whatever was asked (setInspect takes the marks off after their fade); on, the same selection again is only outlined. */
      if (inspect) mark(m.sectionId || null, m.blockId || null, m.scroll !== false, (m.sectionId || null) === selected.section && (m.blockId || null) === selected.block);
    } else if (m.type === "reveal") {
      /* Round AH: a section just added, pasted or written by the AI, brought smoothly to the top, below a sticky header, once it is drawn. */
      queue = queue.then(function () { revealSection(String(m.id || "")); }).catch(function () {});
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
 * ===========================================================================
 *  THE EDITOR'S SIZE SWITCH, AS THE THEME LIVES THROUGH IT
 * ===========================================================================
 * The owner's storefront (an imported theme: an announcement bar and a
 * slideshow hero, each a slider) filmed going from the phone to the desktop:
 * the headline at the desktop's size wrapped a syllable a line in a strip as
 * narrow as the phone, the picture went grey, the desktop hero stood without
 * its headline and stars, and they faded in. Reproduced on
 * tests/fixtures/shopify-materia (scripts/check-view-switch-frames.mjs), it
 * is the theme's own scripts reacting to the frame being resized, which a
 * window being resized does too, only here every one of them is seen:
 *
 *   a slider that sizes its slides in pixels measures them again only once
 *   the resize has gone quiet (a debounce), so for the whole move its slides
 *   kept the phone's width under the desktop's styles;
 *   crossing the breakpoint builds the slider again: new pictures, the
 *   desktop's not loaded yet (lazy, and hidden on the phone), each fading in
 *   once it is, and the current slide made current again, so its entrance
 *   played again.
 *
 * So, while the builder says a switch is under way (hold-view) and a moment
 * after it lands:
 *
 *   the work a theme puts off from its resize listeners (a timer started
 *   there) is done in the next frame, before it is drawn, so a slider sized
 *   in pixels follows the frame's width at every frame, as one measured by
 *   the browser does;
 *   nothing eases: transitions take no time, and an entrance that starts on
 *   something on screen is taken to its end before the frame is drawn
 *   (checked after each layout, a ResizeObserver on a mark of our own), so
 *   what was shown stays shown and nothing fades;
 *   the pictures near the top of the page, for both widths, are in the
 *   browser's cache before they are needed (fetched once the page is idle),
 *   so a picture shown for the other width is drawn at once, never grey.
 *
 * On the live site none of this is there: it is the canvas's head only.
 */
export const CANVAS_SWITCH = `
(function () {
  var W = window;
  if (typeof W.setTimeout !== "function" || typeof W.addEventListener !== "function") return;
  var add = W.addEventListener, rm = W.removeEventListener, st = W.setTimeout, ct = W.clearTimeout;
  var nativeRaf = W.requestAnimationFrame, nativeCaf = W.cancelAnimationFrame;
  var raf = typeof nativeRaf === "function" ? function (f) { return nativeRaf.call(W, f); } : function (f) { return st.call(W, f, 16); };
  var now = function () { return W.performance && performance.now ? performance.now() : Date.now(); };
  /*
    WORK: what a theme does because the page changed width (its resize and
    breakpoint listeners, and what they put off). A timer or an animation
    frame asked for from there while a switch is under way is also done in
    this frame, before it is drawn: a slider built again marks its current
    slide on the next frame, and that frame drew the slide without it.
  */
  var on = false, stopAt = 0, work = 0, pending = new Map(), framesAsked = new Map(), wraps = new WeakMap();
  W.addEventListener = function (type, fn, opts) {
    if (type === "resize" && typeof fn === "function") {
      var w = wraps.get(fn);
      if (!w) { w = function () { work++; try { return fn.apply(this, arguments); } finally { work--; } }; wraps.set(fn, w); }
      return add.call(this || W, type, w, opts);
    }
    return add.apply(this || W, arguments);
  };
  W.removeEventListener = function (type, fn, opts) {
    if (type === "resize" && typeof fn === "function" && wraps.has(fn)) return rm.call(this || W, type, wraps.get(fn), opts);
    return rm.apply(this || W, arguments);
  };
  W.setTimeout = function (fn, ms) {
    if (!(on && work && typeof fn === "function" && !(Number(ms) > 1000))) return st.apply(W, arguments);
    var args = Array.prototype.slice.call(arguments, 2);
    var id = st.call(W, function () { pending.delete(id); fn.apply(W, args); }, ms);
    pending.set(id, { fn: fn, args: args });
    return id;
  };
  W.clearTimeout = function (id) { pending.delete(id); return ct.apply(W, arguments); };
  if (typeof nativeRaf === "function") {
    W.requestAnimationFrame = function (fn) {
      if (!(on && work && typeof fn === "function")) return nativeRaf.call(W, fn);
      var id = nativeRaf.call(W, function (t) { framesAsked.delete(id); fn.call(W, t); });
      framesAsked.set(id, fn);
      return id;
    };
    W.cancelAnimationFrame = function (id) { framesAsked.delete(id); return nativeCaf.call(W, id); };
  }
  /*
    A breakpoint's change event, said in the frame the page is laid out at
    the new width rather than the frame after (when the browser says it), and
    said once to each listener: the browser's own, when it comes, finds the
    listener already told and is not passed on.
  */
  var watched = [];
  var mm = W.matchMedia;
  if (typeof mm === "function") W.matchMedia = function () {
    var m = mm.apply(W, arguments);
    try {
      if (m.__sl) return m;
      m.__sl = { seen: m.matches };
      var wraps2 = new WeakMap(), ael = m.addEventListener, rel = m.removeEventListener, al = m.addListener, rl = m.removeListener;
      var wrap = function (fn) {
        var w = wraps2.get(fn);
        if (!w) {
          var last = m.matches;
          w = function (e) {
            var now2 = e && typeof e.matches === "boolean" ? e.matches : m.matches;
            if (now2 === last) return;
            last = now2;
            return typeof fn === "function" ? fn.call(this, e) : fn.handleEvent(e);
          };
          wraps2.set(fn, w);
          if (watched.indexOf(m) < 0) watched.push(m);
        }
        return w;
      };
      if (ael) m.addEventListener = function (t, fn, o) { return ael.call(m, t, t === "change" && fn ? wrap(fn) : fn, o); };
      if (rel) m.removeEventListener = function (t, fn, o) { return rel.call(m, t, (t === "change" && fn && wraps2.get(fn)) || fn, o); };
      if (al) m.addListener = function (fn) { return al.call(m, fn ? wrap(fn) : fn); };
      if (rl) m.removeListener = function (fn) { return rl.call(m, (fn && wraps2.get(fn)) || fn); };
    } catch (e) {}
    return m;
  };
  var tellBreakpoints = function () {
    work++;
    try {
      watched.forEach(function (m) {
        if (m.matches === m.__sl.seen) return;
        m.__sl.seen = m.matches;
        try { m.dispatchEvent(typeof MediaQueryListEvent === "function" ? new MediaQueryListEvent("change", { matches: m.matches, media: m.media }) : new Event("change")); } catch (e) {}
      });
    } finally { work--; }
  };
  /* At most three rounds: a theme's own loop of frames goes back to the browser's frames after that. */
  var flush = function () {
    for (var round = 0; round < 3 && (pending.size || framesAsked.size); round++) {
      var timers = Array.from(pending.entries()), asked = Array.from(framesAsked.entries());
      pending.clear();
      framesAsked.clear();
      work++;
      try {
        timers.forEach(function (e) {
          ct.call(W, e[0]);
          try { e[1].fn.apply(W, e[1].args); } catch (err) { st.call(W, function () { throw err; }, 0); }
        });
        var t = now();
        asked.forEach(function (e) {
          nativeCaf.call(W, e[0]);
          try { e[1].call(W, t); } catch (err) { st.call(W, function () { throw err; }, 0); }
        });
      } finally { work--; }
    }
  };
  var began = null, still = null, mark = null, ro = null, flip = 0, looping = false, afterFrames = 0;
  var inView = function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  var finishNew = function () {
    if (began === null || !document.getAnimations) return;
    document.getAnimations().forEach(function (a) {
      var t = a.effect && a.effect.target;
      if (!t || !t.getBoundingClientRect || (t.closest && t.closest("[data-sl-box]"))) return;
      if (a.startTime !== null && a.startTime < began) return;
      var tm = a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
      if (!tm || !isFinite(tm.endTime) || !inView(t)) return;
      try { a.finish(); } catch (e) {}
    });
  };
  /*
    The frame laid out at a new width: the theme's resize listeners and its
    breakpoint listeners are told now, after this layout and before it is
    drawn, and what they put off is done at once. The browser's own resize
    event, a frame later, finds nothing left to do.
  */
  /*
    ONLY WHAT CAN BE SEEN IS LAID OUT AT EVERY FRAME. The sections well
    below the view wait at their height until the switch is over (as the
    builder's own sections do, canvas-switch.ts holdOffscreenSections), so a
    frame of the move costs the sections on screen, not the whole page. One
    that the page brings near the view as it reflows is handed back before
    that frame is drawn. Only below: a section above the view changing height
    would move what is on screen. Not one that holds a fixed bar (nothing of
    its own in the page's flow), which would vanish.
  */
  var held = [];
  var holdBelow = function () {
    var vh = innerHeight || 800;
    document.querySelectorAll(".shopify-section").forEach(function (s) {
      if (s.parentElement && s.parentElement.closest(".shopify-section")) return;
      var r = s.getBoundingClientRect();
      if (r.top < vh * 2 || r.height < 2 || s.style.contentVisibility) return;
      var first = s.firstElementChild;
      if (first && /fixed|sticky/.test(getComputedStyle(first).position)) return;
      s.style.containIntrinsicHeight = Math.round(r.height) + "px";
      s.style.contentVisibility = "hidden";
      held.push(s);
    });
  };
  var releaseNear = function (all) {
    var vh = innerHeight || 800;
    held = held.filter(function (s) {
      if (!all && s.isConnected && s.getBoundingClientRect().top > vh * 1.5) return true;
      s.style.removeProperty("content-visibility");
      s.style.removeProperty("contain-intrinsic-height");
      return false;
    });
  };
  var lastW = 0;
  var laidOut = function () {
    if (!on) return;
    if (held.length) releaseNear(false);
    if (innerWidth !== lastW) {
      lastW = innerWidth;
      try { W.dispatchEvent(new Event("resize")); } catch (e) {}
      tellBreakpoints();
      flush();
    }
    finishNew();
  };
  /* A picture put in during the switch, or one waiting for the screen, is asked for now: from the cache it is there before the frame is drawn. */
  var eager = function (scope) {
    if (!scope || !scope.querySelectorAll) return;
    if (scope.tagName === "IMG" && scope.getAttribute("loading") === "lazy") scope.setAttribute("loading", "eager");
    scope.querySelectorAll('img[loading="lazy"]').forEach(function (img) { img.setAttribute("loading", "eager"); });
  };
  /*
    A PICTURE ALREADY SHOWN STAYS SHOWN. A slider built again puts a new
    <img> in for the same picture, and many themes keep a new picture at
    nothing until a script marks it loaded, a frame or two after it is
    (the owner's hero, faint and then there). One for a picture that was
    drawn in full when the switch began is drawn in full at once, and handed
    back to the theme's own style when the switch is over.
  */
  var shown = new Set(), lifted = [];
  var lift = function (n) {
    var list = n.tagName === "IMG" ? [n] : n.querySelectorAll ? n.querySelectorAll("img") : [];
    Array.prototype.forEach.call(list, function (img) {
      if (!shown.has(img.src)) return;
      img.style.setProperty("opacity", "1", "important");
      lifted.push(img);
    });
  };
  var mo = null;
  var quiet = function (yes) {
    if (yes && !still) {
      still = document.createElement("style");
      still.setAttribute("data-sl-switch", "");
      still.textContent = "*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important}";
      (document.head || document.documentElement).appendChild(still);
      lastW = innerWidth;
      if (typeof ResizeObserver === "function") {
        mark = document.createElement("div");
        mark.setAttribute("aria-hidden", "true");
        mark.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none";
        document.documentElement.appendChild(mark);
        ro = new ResizeObserver(laidOut);
        ro.observe(mark);
        ro.observe(document.documentElement);
      }
      shown.clear();
      if (typeof MutationObserver === "function") {
        mo = new MutationObserver(function (list) { list.forEach(function (r) { r.addedNodes.forEach(function (n) { if (n.nodeType === 1) { eager(n); lift(n); } }); }); });
        mo.observe(document.documentElement, { childList: true, subtree: true });
      }
    } else if (!yes && still) {
      lifted.forEach(function (img) { img.style.removeProperty("opacity"); });
      lifted = [];
      shown.clear();
      still.remove(); still = null;
      if (ro) { ro.disconnect(); ro = null; }
      if (mo) { mo.disconnect(); mo = null; }
      if (mark) { mark.remove(); mark = null; }
    }
  };
  var frame = function () {
    /* Over once both the time and a few frames have passed since it landed: on a slow machine a frame can outlast the time, and what the landing brings into view is said a frame or two later. */
    if (on && stopAt && ++afterFrames >= 6 && now() >= stopAt) { on = false; stopAt = 0; flush(); releaseNear(true); quiet(false); began = null; idle(); }
    if (!on) { looping = false; return; }
    flush();
    if (!ro) finishNew();
    if (mark) mark.style.width = (flip ^= 1) + "px";
    raf(frame);
  };
  /*
    HELD BY THIS PAGE, NOT BY THE BROWSER'S SHARED CACHE. The canvas keeps
    more than one frame of the theme (the page behind, pages kept for going
    back), each with an origin of its own, and the browser keeps one copy of
    a picture for all of them: the last frame to fetch it owns it, and a new
    <img> in any other frame fetches it again (measured: a slider built again
    in the front page went to the network for pictures it had drawn a moment
    before). A preload belongs to its own page and is used by the next <img>
    for that address there, whoever fetched it since. Used once, so asked for
    again after each switch and every few seconds while the page sits still:
    one not used yet answers the new ask itself, and only one used, or taken
    by another frame, goes to the network.
  */
  var links = new Map();
  var want = function (url, again) {
    if (!url || /^data:/.test(url)) return;
    var old = links.get(url);
    if (old && !again) return;
    if (!old && links.size >= 40) return;
    var l = document.createElement("link");
    l.rel = "preload";
    l.as = "image";
    l.href = url;
    l.setAttribute("data-sl-warm", "");
    var done = function () { if (old) old.remove(); };
    l.addEventListener("load", done);
    l.addEventListener("error", done);
    (document.head || document.documentElement).appendChild(l);
    links.set(url, l);
  };
  var pick = function (set, px) {
    var best = null, top = null;
    set.split(",").forEach(function (part) {
      var bits = part.trim().split(/\\s+/), w = parseFloat(bits[1]);
      if (!bits[0] || !/w$/.test(bits[1] || "") || !(w > 0)) return;
      if (!top || w > top.w) top = { u: bits[0], w: w };
      if (w >= px && (!best || w < best.w)) best = { u: bits[0], w: w };
    });
    return (best || top || { u: null }).u;
  };
  /*
    Every picture of the sections near the view, for the phone's width and
    the computer's, preloaded by this page: one already drawn is found again
    by a slider built again, one waiting (lazy, or hidden at this width) is
    fetched now. At the switch those that will be on screen are asked for at
    once (eager).
  */
  var warm = function (now3, again) {
    try {
      var vh = innerHeight || 800, dpr = W.devicePixelRatio || 1;
      var widths = [390, Math.max(innerWidth || 0, (W.screen && screen.width) || 0, 1280)];
      document.querySelectorAll(".shopify-section").forEach(function (s) {
        var r = s.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) return;
        if (now3 && r.bottom > -100 && r.top < vh * 1.25) {
          eager(s);
          s.querySelectorAll("img").forEach(function (img) {
            if (img.complete && img.naturalWidth && img.src && getComputedStyle(img).opacity === "1") shown.add(img.src);
          });
        }
        s.querySelectorAll("img, picture source").forEach(function (el) {
          var set = el.getAttribute("srcset") || el.getAttribute("data-srcset");
          var src = el.getAttribute("data-src") || (el.tagName === "IMG" ? el.getAttribute("src") : null);
          if (set && /\\dw(\\s|,|$)/.test(set)) widths.forEach(function (w) { want(pick(set, w * dpr), again); });
          else if (set) want(set.trim().split(/\\s+/)[0], again);
          if (src) want(src, again);
        });
      });
    } catch (e) {}
  };
  var idle = function () {
    if (typeof W.requestIdleCallback === "function") W.requestIdleCallback(function () { warm(false, true); }, { timeout: 800 });
    else st.call(W, function () { warm(false, true); }, 300);
  };
  add.call(W, "load", function () {
    idle();
    var again = function () {
      if (!on && document.visibilityState !== "hidden") idle();
      st.call(W, again, 2500);
    };
    st.call(W, again, 2500);
  });
  W.__slSwitch = function (yes) {
    if (yes) {
      on = true;
      stopAt = 0;
      if (began === null) began = document.timeline ? document.timeline.currentTime : now();
      quiet(true);
      warm(true);
      holdBelow();
      if (!looping) { looping = true; raf(frame); }
    } else if (on && !stopAt) { stopAt = now() + 900; afterFrames = 0; }
  };
})();
`.trim()

/**
 * FIRST IN THE CANVAS PAGE'S HEAD. A frame with no origin of its own has no
 * storage: `localStorage` and `sessionStorage` throw, and a theme that keeps
 * its recently viewed products there stops on its first line. Each gets a
 * store in memory, and so does `document.cookie`. The store outlives the
 * frame: what it held is sent to the builder as it changes and handed to
 * the next page drawn (window.__slSeed), so a heart pressed on one page is
 * still pressed on the next, and the wishlist count agrees, as on the site.
 * The cookies too: the theme is told it is on the website (theme.ts,
 * themeDesignMode), so its newsletter pop-up opens as it does there, and
 * closed once it stays closed on the next page, as on the site, rather than
 * opening again on every page the canvas draws.
 */
/*
  WHAT THE THEME'S OBSERVERS WATCH. IntersectionObserver is the theme's
  own, with one thing noted: which element of a section each observer
  watches, and the look of it (its tag and classes) as it was given. A
  section drawn again in place is new markup, and the bridge has the
  observers watch it in place of the old (canvas-bridge.ts, A SECTION
  DRAWN AGAIN KEEPS WHAT THE THEME'S SCRIPTS DID TO IT). The original is
  window.__slIO, for the bridge's own.
*/
/*
  A CHOICE IN THE CANVAS WRITES NO ADDRESS. The page is a sandboxed frame
  with no origin of its own, where history.replaceState to
  "/products/x?variant=…" throws a SecurityError; Dawn writes the address
  before it updates the form, the price and the label, so in the canvas a
  chosen M stayed with S's price, id and label. pushState and replaceState
  keep the state and leave the address as it is when the browser refuses it.
*/
export const CANVAS_HEAD = `<style data-sl-canvas>preload-page,.preload-page,website-intro,.website-intro,#preloader,.site-preloader,.page-loader,.page-loading-overlay{display:none!important}</style><script>(function(){var seed=window.__slSeed||{};function S(n){var m=new Map();var held=seed[n];if(held&&typeof held==="object")Object.keys(held).forEach(function(k){if(typeof held[k]==="string")m.set(k,held[k])});var t=0;var tell=function(){if(t)return;t=setTimeout(function(){t=0;var o={};m.forEach(function(v,k){o[k]=v});try{parent.postMessage({storelib:1,type:"storage",area:n,items:o},"*")}catch(e){}},0)};return{get length(){return m.size},key:function(i){return Array.from(m.keys())[i]??null},getItem:function(k){return m.has(String(k))?m.get(String(k)):null},setItem:function(k,v){m.set(String(k),String(v));tell()},removeItem:function(k){m.delete(String(k));tell()},clear:function(){m.clear();tell()}}}
["localStorage","sessionStorage"].forEach(function(n){var ok=false;try{ok=!!window[n]}catch(e){ok=false}if(!ok){try{Object.defineProperty(window,n,{value:S(n),configurable:true})}catch(e){}}});
try{document.cookie}catch(e){var jar=S("cookie");try{Object.defineProperty(document,"cookie",{get:function(){var o=[];for(var i=0;i<jar.length;i++){var k=jar.key(i);o.push(k+"="+jar.getItem(k))}return o.join("; ")},set:function(v){var parts=String(v).split(";"),first=parts.shift()||"",at=first.indexOf("=");if(at<1)return;var k=first.slice(0,at).trim(),val=first.slice(at+1).trim(),gone=false;parts.forEach(function(p){var q=p.split("="),n=(q[0]||"").trim().toLowerCase(),x=q.slice(1).join("=").trim();if(n==="max-age"&&Number(x)<=0)gone=true;if(n==="expires"){var t=Date.parse(x);if(!isNaN(t)&&t<=Date.now())gone=true}});if(gone)jar.removeItem(k);else jar.setItem(k,val)},configurable:true})}catch(e2){}}
if(typeof IntersectionObserver==="function"){var IO=IntersectionObserver,watching=new WeakMap(),bySig=new Map(),gone=new WeakSet();var sig=function(el){return el.tagName+"."+String(el.getAttribute("class")||"").split(/\\s+/).filter(Boolean).sort().join(".")};var W=class extends IO{observe(t){try{gone.delete(this);if(t&&t.nodeType===1&&t.closest&&t.closest(".shopify-section")){var by=watching.get(t);if(!by)watching.set(t,by=new Set());by.add(this);if(String(t.getAttribute("class")||"").trim()){var k=sig(t),set=bySig.get(k);if(!set)bySig.set(k,set=new Set());set.add(this)}}}catch(e){}return super.observe(t)}unobserve(t){try{var by=watching.get(t);if(by)by.delete(this)}catch(e){}return super.unobserve(t)}disconnect(){gone.add(this);var me=this;bySig.forEach(function(set){set.delete(me)});return super.disconnect()}};window.IntersectionObserver=W;window.__slIO=IO;window.__slWatch={watching:watching,bySig:bySig,usable:function(io){var r=io.root;return !gone.has(io)&&(!r||r.nodeType===9)}}}
["pushState","replaceState"].forEach(function(k){var f=history[k];if(typeof f!=="function")return;history[k]=function(s,t){try{return f.apply(this,arguments)}catch(e){try{return f.call(this,s,t)}catch(e2){}}}});})();</script><script>${CANVAS_REQUESTS}</script><script>${CANVAS_SWITCH}</script>`
