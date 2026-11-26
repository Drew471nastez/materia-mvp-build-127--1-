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
  var post = function (m) { m.storelib = 1; try { parent.postMessage(m, window.__slTo || "*"); } catch (e) {} };
  /* The layout's own <style>s in the body, around the sections, as drawn (compat-canvas.tsx docShape bodyStyles): marked now, before the theme's deferred scripts can add one. */
  try { Array.prototype.forEach.call(document.body.querySelectorAll("style"), function (x) { if (!x.closest(".shopify-section") && !x.hasAttribute("data-sl")) x.__slDrawn = true; }); } catch (e) {}
  /*
    EVERYTHING OF THE LAYOUT AS DRAWN, marked now for the same reason: the
    head's scripts, and every node around the sections in the body. What a
    theme's script adds later carries no mark, and is left where it is when
    the layout is changed in place (relayout, below).
  */
  try {
    Array.prototype.forEach.call(document.head.children, function (x) { if (x.tagName === "SCRIPT") x.__slDrawn = true; });
    var markTree = function (c) {
      c.__slDrawn = true;
      if (c.nodeType === 1 && !(c.classList && c.classList.contains("shopify-section")) && !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(c.tagName)) for (var k = c.firstChild; k; k = k.nextSibling) markTree(k);
    };
    for (var c0 = document.body.firstChild; c0; c0 = c0.nextSibling) markTree(c0);
    /* What the page draws after this script (its own last lines) is marked once the page has been read, before any deferred script of the theme's runs. */
    var me = document.currentScript;
    if (document.readyState === "loading") document.addEventListener("readystatechange", function after() {
      document.removeEventListener("readystatechange", after);
      for (var c1 = me ? me.nextSibling : null; c1; c1 = c1.nextSibling) markTree(c1);
    });
  } catch (e) {}
  /*
    COPY AND PASTE FROM INSIDE THE PAGE. A click in the canvas puts the
    keyboard in this frame, so Cmd/Ctrl+C and V never reached the builder,
    which copies and pastes sections. Outside a field and with no text
    selected, the keys are handed to the builder; anything else is the page's.
  */
  document.addEventListener("keydown", function (e) {
    /* Round BC: Escape with the keyboard in the page closes what the builder has open over it, as it would anywhere else in the builder. */
    if (e.key === "Escape") { post({ type: "escape" }); return; }
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
    "[data-sl-box=block]{border:2px solid #3b82f6;box-shadow:0 0 0 1px rgba(255,255,255,.9)}" +
    /* Round BC: the section being dragged in the sidebar (preview-order, below). */
    "[data-sl-order-lifted]{outline:2px solid rgba(59,130,246,.6);outline-offset:-2px;position:relative;z-index:2}";
  document.head.appendChild(css);
  /*
    THE BUILDER'S OWN LAYER, OUT OF THE THEME'S SIGHT (round 14). The boxes,
    the Add section strip and the layout mark (afterLayout) are written to
    every frame the page moves, and the theme's stylesheets can see anything
    in its document: the owner's Materia theme has :has() rules that read
    [style] (".review_sold:has(.jdgm-widget[style=...])"), so every write to
    a box's style restyled the page from <body> down, 400 elements, 18ms a
    write at 1x (measured in the canvas: 0.02ms the same write in a shadow
    root). They live in a shadow root now, whose inside no rule of the page
    can match, behind one host that never changes after it is put in. The
    host is a [data-sl-box] (every hit test and watcher here already passes
    over those), drawn as its contents, its rule's display:none and pointer
    rule overridden on itself.
  */
  var layerHost = null, layerRoot = null;
  var layer = function () {
    if (layerRoot && layerHost.isConnected) return layerRoot;
    layerHost = document.createElement("div");
    layerHost.setAttribute("data-sl-box", "layer");
    layerHost.style.cssText = "display:contents;pointer-events:auto";
    layerRoot = layerHost;
    try {
      if (layerHost.attachShadow) {
        layerRoot = layerHost.attachShadow({ mode: "open" });
        var own = document.createElement("style");
        own.textContent = css.textContent + (addCss ? addCss.textContent : "");
        layerRoot.appendChild(own);
      }
    } catch (e) { layerRoot = layerHost; }
    (document.body || document.documentElement).appendChild(layerHost);
    return layerRoot;
  };
  var boxOf = function (kind) {
    var b = document.createElement("div");
    b.setAttribute("data-sl-box", kind);
    b.setAttribute("aria-hidden", "true");
    layer().appendChild(b);
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
    /*
      THE TOP OF THE STACK FIRST (round 23, the owner: "when a push from GitHub or any AI coding lands ... a little
      freeze and stutter"). elementsFromPoint lists every element under the point, and on a deep store page some sixty
      of them a reading came to 50 to 70ms in one task after a push redrew the page (scripts/check-wb-stability-r13.mjs
      PROFILE=1). The loop below almost always decides on its first element, so that element alone is asked first
      (elementFromPoint stops at the first hit) and decided the same way; the whole stack is read only when the top
      one is an outline of ours or says nothing either way.
    */
    var top = document.elementFromPoint(x, y);
    if (top && !(top.hasAttribute && (top.hasAttribute("data-sl-box") || top.hasAttribute("data-sl-add")))) {
      if ((top === el || el.contains(top)) && (loose || !fixedBetween(top, el))) return true;
      if (top === document.body || top === document.documentElement) return false;
      if (paints(top)) return false;
    }
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var c = stack[i];
      if (c.hasAttribute && (c.hasAttribute("data-sl-box") || c.hasAttribute("data-sl-add"))) continue;
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
    /* The top of the stack decides unless it is an outline of ours (as owns, above). */
    var head = document.elementFromPoint(x, y);
    var stack = head && !(head.hasAttribute && (head.hasAttribute("data-sl-box") || head.hasAttribute("data-sl-add"))) ? [head] : document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var c = stack[i];
      if (c.hasAttribute && (c.hasAttribute("data-sl-box") || c.hasAttribute("data-sl-add"))) continue;
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
  /*
    Looked up again only when the page's elements changed (round BC): a page
    with a large header has thousands of elements to match, and they were
    matched for every reading, several a frame while a slider moved or the
    theme's script changed the page (scripts/check-compat-live-edit.ts
    PROFILE). Any element added or taken away anywhere (the watcher below),
    or one of these gone from the page (a section swapped), and they are
    looked up again.
  */
  var topsCache = null;
  var topsHere = function () {
    for (var i = 0; i < topsCache.length; i++) if (!topsCache[i].isConnected) return false;
    return true;
  };
  var headerCover = function (el) {
    if (!topsCache || !topsHere()) topsCache = document.querySelectorAll(HEADER_TOPS);
    var cover = 0, tops = topsCache;
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
  /*
    WHILE VALUES STREAM IN (a slider under a finger, round 35), the outline
    follows the section's box as it is and nothing more: the hit tests below
    (some sixty a reading, each one a layout of the page if anything moved)
    ran for every value and were the larger part of a value's cost in the
    frame. A moment after the last value the outline is read in full again.
  */
  /*
    STILL ONLY ONCE TWO FRAMES HAVE GONE BY WITH NOTHING NEW (round 14). On a
    heavy theme at a slow machine's pace a frame takes longer than 250ms, so
    the page counted as still between two frames of one scroll and every
    frame read the outlines in full (scripts/check-wb-scroll-r14.mjs, 4x: a
    second of hit tests in a scroll). The full reading waits for 260ms and
    then two frames with no scroll and no value in them.
  */
  var streamingUntil = 0, streamTimer = 0, afterScroll = null, streamingOn = false, scrollMoving = false, pageScrollTimer = 0;
  var streaming = function () {
    streamingOn = true;
    streamingUntil = performance.now() + 250;
    clearTimeout(streamTimer);
    streamTimer = setTimeout(function () {
      var at = streamingUntil;
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        if (streamingUntil !== at) return;
        streamingOn = false; streamingUntil = 0; reportSoon(); if (afterScroll) afterScroll();
      }); });
    }, 260);
  };
  /*
    A VALUE FROM THE BUILDER IS SHOWN, NOT EASED TOWARDS (round 1022). A
    theme that eases its buttons (\`transition: all .25s\`, common in store
    themes) eased every value of a slider from wherever the last one had got
    to: the corner radius under a finger arrived a second after the finger
    stopped (scripts/check-editor-live.mjs, imported theme radius: 1 value
    of 61 drawn as itself). So for a moment after the builder changes the
    page, an ease that starts is taken to its end before the frame is drawn.
    Only eases that start then: a hover already under way keeps its own,
    and so does motion (opacity, a transform, visibility): that is a section
    revealed as it is scrolled to, which plays as on the website, never a
    value from the sidebar. Never a rule over the whole page, which restyles
    all of it.
  */
  var stillUntil = 0, stillFrame = 0, stillFrom = 0;
  var MOTION = /^(opacity|transform|translate|scale|rotate|visibility|filter|clip-path)$/;
  var finishOne = function (a) {
    if (typeof a.transitionProperty !== "string" || MOTION.test(a.transitionProperty)) return;
    if (a.startTime !== null && a.startTime < stillFrom) return;
    try { a.finish(); } catch (e) {}
  };
  var finishEased = function () {
    stillFrame = 0;
    if (document.getAnimations) document.getAnimations().forEach(finishOne);
  };
  /*
    An ease that starts later in the moment (a section swapped in after the
    change, the theme's script reacting to it) is ended as it starts, by its
    own transitionrun, rather than every animation of the page being listed
    on every frame for 300ms (round BC: that list, and the style pass it
    forces, ran on each frame of a slider's drag, scripts/check-compat-
    live-edit.ts PROFILE).
  */
  document.addEventListener("transitionrun", function (e) {
    if (!stillUntil || performance.now() > stillUntil) { stillUntil = 0; return; }
    var t = e.target;
    if (!t || !t.getAnimations) return;
    try { t.getAnimations().forEach(function (a) { if (a.transitionProperty === e.propertyName) finishOne(a); }); } catch (err) {}
  }, true);
  /* \`now\`: the change was just made, so its eases are ended here, in its own task, and the frame that follows draws the value. */
  var holdStill = function (now) {
    if (!stillUntil) stillFrom = document.timeline && typeof document.timeline.currentTime === "number" ? document.timeline.currentTime : performance.now();
    stillUntil = performance.now() + 300;
    if (now === true) { if (stillFrame) cancelAnimationFrame(stillFrame); finishEased(); return; }
    if (!stillFrame) stillFrame = requestAnimationFrame(finishEased);
  };
  var stillNow = function () { holdStill(true); };
  var visibleRect = function (el, inset) {
    if (!el || !el.isConnected || leaving) return null;
    var r = el.getBoundingClientRect(), loose = false;
    if (r.width < 1 || r.height < 1) { r = contentBox(el); loose = true; if (!r) return null; }
    var vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
    var left = Math.max(r.left, 0), right = Math.min(r.right, vw);
    var top = Math.max(r.top, 0, headerCover(el)), bottom = Math.min(r.bottom, vh);
    if (right - left < 1 || bottom - top < 1) return null;
    if (streamingOn) {
      var sl = Math.max(r.left + inset, 0), sr = Math.min(r.right - inset, vw);
      var st = top > r.top + 0.5 ? top : Math.max(r.top + inset, 0), sb = bottom < r.bottom - 0.5 ? bottom : Math.min(r.bottom - inset, vh);
      /* A block right under a sticky header (or over a tab bar) keeps its line on its own edge, as below: two hit tests, not sixty. */
      if (inset < 0 && !(top > r.top + 0.5) && st < r.top && barAt(el, (left + right) / 2, st + 0.5)) st = r.top;
      if (inset < 0 && !(bottom < r.bottom - 0.5) && sb > r.bottom && barAt(el, (left + right) / 2, sb - 0.5)) sb = r.bottom;
      if (sr - sl < 1 || sb - st < 2) return null;
      return { left: sl, width: sr - sl, top: st, bottom: sb, cutTop: top > r.top + 0.5, cutBottom: bottom < r.bottom - 0.5 };
    }
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
  /*
    READ EVERYTHING, THEN WRITE (round 14). Each box was measured, written and
    read back in turn, so the second box's measure and every read-back laid
    the whole page out again inside the frame: with the owner's Materia theme
    (its scroll effects dirty the page every frame) that was 1.5s of forced
    layouts in a 12s scroll at 1x, the largest single cost of scrolling the
    canvas (scripts/check-wb-scroll-r14.mjs ATTR=1). Now drawBoxes measures
    the three elements first and writes the three boxes after.
  */
  var place = function (box, v) {
    if (!v) { if (box.style.display !== "none") box.style.display = "none"; return null; }
    box.style.display = "block";
    box.style.width = v.width + "px";
    box.style.height = (v.bottom - v.top) + "px";
    /* Cut by the edge of the screen or by something over it: no line there. */
    box.style.borderTopWidth = v.cutTop ? "0" : "";
    box.style.borderBottomWidth = v.cutBottom ? "0" : "";
    box.style.left = (v.left - boxDx) + "px";
    box.style.top = (v.top - boxDy) + "px";
    return v;
  };
  /*
    FIXED IS NOT ALWAYS THE SCREEN. A theme that moves <html> or <body> (a translate), a filter
    or \`contain\` on them (a page fade, a drawer that slides the
    page) makes that element the boxes' frame, and every outline sat off by
    its offset. Where a box lands is read back and the difference taken
    out, so it is always on the element. The boxes share one frame (all are
    the body's), so one is read back, and only once the page is still: while
    it scrolls the offset found last stands (a frame does not move in a scroll).
  */
  var boxDx = 0, boxDy = 0;
  var landed = function (pairs) {
    for (var i = 0; i < pairs.length; i++) {
      var box = pairs[i][0], v = pairs[i][1];
      if (!v) continue;
      var got = box.getBoundingClientRect();
      var ex = got.left - v.left, ey = got.top - v.top;
      if (Math.abs(ex) > 0.5 || Math.abs(ey) > 0.5) {
        boxDx += ex; boxDy += ey;
        for (var j = 0; j < pairs.length; j++) if (pairs[j][1]) { pairs[j][0].style.left = (pairs[j][1].left - boxDx) + "px"; pairs[j][0].style.top = (pairs[j][1].top - boxDy) + "px"; }
      }
      return;
    }
  };
  /*
    READ ONCE THE FRAME IS LAID OUT (round 14). The outlines were read in an
    animation frame, before the browser lays the frame out, so reading them
    laid out a page the theme's own frame callbacks then changed again, and
    the frame was laid out twice: on the owner's Materia theme (its scroll
    effects restyle the page every frame) 1.4s of a 12s scroll at 1x, a
    quarter of the dropped frames (scripts/check-wb-scroll-r14.mjs ATTR=1).
    A ResizeObserver's callback comes after the frame's layout, before it is
    painted: read there, the boxes cost what reading a laid out page costs,
    and what is written there (three fixed boxes) is laid out alone. A mark
    of our own, a pixel off the screen, is resized to ask for one.
  */
  var lateFns = [], lateEl = null, lateWide = false;
  var afterLayout = function (fn) {
    if (typeof ResizeObserver === "undefined") { requestAnimationFrame(function () { fn(); }); return; }
    if (!lateEl || !lateEl.isConnected) {
      lateEl = document.createElement("div");
      lateEl.setAttribute("data-sl-late", "");
      lateEl.setAttribute("aria-hidden", "true");
      lateEl.style.cssText = "position:fixed;left:-10px;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none;contain:strict";
      layer().appendChild(lateEl);
      new ResizeObserver(function () { var list = lateFns; lateFns = []; for (var i = 0; i < list.length; i++) { try { list[i](); } catch (e) {} } }).observe(lateEl);
      lateFns.push(fn);
      return;
    }
    /* One resize a frame, however many readings are asked for in it: resized twice it is back where it was, and nothing is said. */
    if (!lateFns.length) { lateWide = !lateWide; lateEl.style.width = lateWide ? "2px" : "1px"; }
    lateFns.push(fn);
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
    if (!boxes || !boxes.section.isConnected) boxes = { hover: boxOf("hover"), section: boxOf("section"), block: boxOf("block") };
    /* The marked elements from what marked them, not a search of the page for the marks: a large header is thousands of elements, searched three times a frame while a slider moves. */
    var hov = hovered && hovered.isConnected && hovered.hasAttribute("data-sl-hover") ? hovered : null;
    var secEl = selected.section ? document.getElementById("shopify-section-" + selected.section) : null;
    var sec = secEl && secEl.hasAttribute("data-sl-selected") ? secEl : null;
    var blkEl = secEl && selected.block ? secEl.querySelector('[data-block-id="' + CSS.escape(selected.block) + '"]') : null;
    var blk = blkEl && blkEl.hasAttribute("data-sl-selected-block") ? blkEl : null;
    var hv = hov && hov !== blk && !(hov === sec && !blk) ? visibleRect(hov, 0) : null;
    /* ONE SELECTION AT A TIME: a block that is selected is the outline; its section's own ring round it was a second box, wider than the block and off to one side of it while either moved. */
    var b = visibleRect(blk, -2);
    var seen = b ? null : visibleRect(sec, 0);
    /* The toolbar's box from the same readings, before anything is written: read after the boxes moved, the page was laid out again for it. */
    var told = withReport === true || boxFrame;
    var repEl = told && inspect && selected.section ? secEl : null;
    var repV = repEl ? (repEl === sec && !b ? seen : visibleRect(repEl, 0)) : null;
    place(boxes.hover, hv);
    place(boxes.block, b);
    place(boxes.section, seen);
    if (!streamingOn) landed([[boxes.hover, hv], [boxes.block, b], [boxes.section, seen]]);
    if (told) {
      boxFrame = 0;
      report({ el: repEl, v: repV });
    }
  };
  var redraw = function () { if (!drawFrame) { drawFrame = 1; afterLayout(drawBoxes); } };
  /*
    WHILE THE PAGE SCROLLS (round BC), the outlines follow the boxes as they
    are, as they do while a slider's values stream in: the hit tests that
    find what covers them (some sixty a box, and the toolbar's box read the
    same way) ran on every frame of a scroll, a third of the frame's own
    script at 4x on Dawn (scripts/check-compat-canvas-perf.mjs). A moment
    after the scroll stops the outlines are read in full again.
  */
  /* The page itself scrolling (not a row of cards inside it, which a slider may scroll all the time): the toolbar's section is moving, until two frames go by with no scroll (report). */
  addEventListener("scroll", function (e) {
    if (e.target !== document && e.target !== document.documentElement && e.target !== document.body) return;
    scrollMoving = true;
    clearTimeout(pageScrollTimer);
    pageScrollTimer = setTimeout(function () {
      requestAnimationFrame(function () { requestAnimationFrame(function () { scrollMoving = false; reportSoon(); }); });
    }, 260);
  }, { passive: true, capture: true });
  addEventListener("scroll", streaming, { passive: true, capture: true });
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
    /* Round BC: a press in the page is a press outside whatever the builder has open over it (the Publish panel): told, since it never reaches the builder's document. */
    post({ type: "press" });
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
  /* The press gives it back first of all (CANVAS_HEAD's listener, before any of the theme's): a theme reading its own link at pointerdown or click (Materia's section links) reads what it wrote, not the borrowed address. */
  window.__slGiveBack = giveBack;
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
  /*
    RESTS, NOT PASSES (round BC). Said on the pointer's way over a link, the
    builder drew that page and loaded it out of sight for every menu link a
    mouse crossed: a whole page of the theme, its scripts run, in this
    process (a 790ms task at 4x on Dawn, scripts/check-compat-canvas-perf.mjs
    hover). A mouse says so once it has stayed on the link a moment; a
    finger, at once.
  */
  var restTimer = 0;
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType !== "mouse") return;
    clearTimeout(restTimer);
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || a === intended) return;
    restTimer = setTimeout(function () { if (a.matches(":hover")) intent(e); }, 180);
  }, true);
  document.addEventListener("pointerdown", function (e) { clearTimeout(restTimer); intent(e); }, true);
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
    if (href) { pressedCard = { href: href, at: Date.now(), chrome: !!t.closest("[class*='shopify-section-group-'], header, footer, nav") }; post({ type: "taken", href: href, chrome: pressedCard.chrome }); }
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
      /* Said now, while this page can still be heard: what it says as it unloads comes from a window the builder no longer knows (compat-canvas.tsx, A PAGE THAT LEFT THE CANVAS). */
      if (themeTook) { taken = { href: href, chrome: chrome, at: Date.now() }; post({ type: "taken", href: href, chrome: chrome }); return; }
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
  /*
    ═══════════════════════════════════════════════════════════════════════
     ADD A SECTION HERE, BETWEEN TWO SECTIONS (round 1023)
    ═══════════════════════════════════════════════════════════════════════
    A Storelib theme's canvas has a strip between every two sections that
    adds one right there (the editor's CanvasInsertStrip); an imported
    theme's had none. The same here, drawn by this page: with the pointer
    within a few pixels of the line between two sections of the page's own
    content (or of one group, the header's or the footer's), a grey line
    grows out from the middle and a round button turns into place, on the
    same 200ms ease the editor's strip uses. Nothing is added to the page's
    flow: the strip is fixed over the line, so the theme lays out exactly
    as on the website, and it costs the page no height. Pressed, the
    builder opens Add section at that place (compat-canvas.tsx,
    add-section). Not under a sticky header, not while the inspector is
    off, not for a finger (there is no hover to find it with).
  */
  var addCss = document.createElement("style");
  addCss.setAttribute("data-sl", "");
  addCss.textContent = "[data-sl-add]{position:fixed;z-index:2147483645;height:12px;display:none;align-items:center;justify-content:center;cursor:pointer;-webkit-user-select:none;user-select:none}" +
    "[data-sl-add] i{position:absolute;left:0;right:0;top:5px;height:2px;background:#d4d7dd;transform:scaleX(0);opacity:0;transition:transform .2s ease-out,opacity .2s ease-out}" +
    "[data-sl-add] b{position:relative;display:flex;width:24px;height:24px;border-radius:999px;align-items:center;justify-content:center;background:#1a1a2e;color:#fff;box-shadow:0 2px 10px -4px rgba(15,23,42,.7);transform:rotate(-90deg) scale(.75);opacity:0;transition:transform .2s ease-out,opacity .2s ease-out}" +
    "[data-sl-add][data-on] i{transform:scaleX(1);opacity:1}[data-sl-add][data-on] b{transform:none;opacity:1}" +
    "@media (prefers-reduced-motion:reduce){[data-sl-add] i,[data-sl-add] b{transition:none}}";
  document.head.appendChild(addCss);
  var adder = null, gapShown = null, addFade = 0;
  var adderEl = function () {
    if (adder && adder.isConnected) return adder;
    adder = document.createElement("div");
    adder.setAttribute("data-sl-add", "");
    adder.setAttribute("role", "button");
    adder.setAttribute("aria-label", typeof window.__slAddLabel === "string" ? window.__slAddLabel : "Add a section here");
    adder.innerHTML = '<i></i><b><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></b>';
    adder.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!gapShown) return;
      if (gapShown.kind === "block") {
        var ab = adder.getBoundingClientRect();
        post({ type: "add-block", sectionId: gapShown.sectionId, parent: gapShown.parent, before: gapShown.before, after: gapShown.after, top: ab.top, left: ab.left, width: ab.width, height: ab.height });
      } else post({ type: "add-section", before: gapShown.before, after: gapShown.after });
      showGap(null);
    });
    layer().appendChild(adder);
    return adder;
  };
  /* The page's sections, top level only, as laid out now, by group: the places between them. */
  var gapsNow = function () {
    var all = Array.prototype.filter.call(document.querySelectorAll(".shopify-section"), function (s) {
      return !(s.parentElement && s.parentElement.closest(".shopify-section"));
    });
    var rows = all.map(function (s) { var r = s.getBoundingClientRect(); return { id: idOf(s), group: groupOf(s), r: r }; }).filter(function (x) { return x.r.height >= 1 && x.r.width >= 1 && x.id; });
    var gaps = [];
    var groups = {};
    rows.forEach(function (x) { (groups[x.group] = groups[x.group] || []).push(x); });
    Object.keys(groups).forEach(function (g) {
      var list = groups[g];
      /* The page's own content: a place above every section and below the last. A group (header, footer): between its own sections only. An overlay group is not a place. */
      var body = g === "";
      if (!body && !/header|footer/i.test(g)) return;
      for (var i = body ? 0 : 1; i <= list.length - (body ? 0 : 1); i++) {
        var prev = list[i - 1] || null, next = list[i] || null;
        var box = next ? next.r : prev.r;
        gaps.push({ y: next ? next.r.top : prev.r.bottom, left: box.left, width: box.width, before: next ? next.id : null, after: prev ? prev.id : null });
      }
    });
    return gaps;
  };
  var showGap = function (g) {
    var el = adderEl();
    if (!g) {
      if (!gapShown && el.style.display === "none") return;
      gapShown = null;
      el.removeAttribute("data-on");
      clearTimeout(addFade);
      addFade = setTimeout(function () { if (!gapShown) el.style.display = "none"; }, 200);
      return;
    }
    clearTimeout(addFade);
    gapShown = g;
    el.setAttribute("aria-label", g.kind === "block" ? (typeof window.__slAddBlockLabel === "string" ? window.__slAddBlockLabel : "Add a block here") : (typeof window.__slAddLabel === "string" ? window.__slAddLabel : "Add a section here"));
    var vw = document.documentElement.clientWidth || innerWidth;
    var left = Math.max(0, g.left), right = Math.min(vw, g.left + g.width);
    el.style.left = left + "px";
    el.style.width = Math.max(0, right - left) + "px";
    el.style.top = (g.y - 6) + "px";
    if (el.style.display !== "flex") {
      el.style.display = "flex";
      /* Laid out at rest first, so the line and the button grow in rather than appear. */
      void el.offsetWidth;
    }
    if (!el.hasAttribute("data-on")) el.setAttribute("data-on", "");
  };
  /*
    ═══════════════════════════════════════════════════════════════════════
     ADD A BLOCK HERE, BETWEEN TWO BLOCKS (round 12)
    ═══════════════════════════════════════════════════════════════════════
    The same strip between two blocks of one section, where the section
    takes another block there: the builder says which levels of which
    sections do (blockLevels, sent with every selection: the schema's
    blocks, its limits). The blocks are the page's [data-block-id] elements
    ({{ block.shopify_attributes }}), grouped by the block they sit in, and
    a place is the middle of the space between two of one group stacked one
    under the other (lib/website-builder/block-gaps.ts says the same rules
    for Storelib's canvas). The line between two sections stays Add
    section's: a block place is never within 10px of its section's edge.
    Pressed, the builder opens the block library for that place.
  */
  var blockLevels = null;
  var blockGapAt = function (x, y) {
    if (!blockLevels) return null;
    var hit = document.elementFromPoint(x, y), sec = null;
    if (hit && adder && (adder.contains(hit) || hit === layerHost)) sec = gapShown && gapShown.kind === "block" ? document.getElementById("shopify-section-" + gapShown.sectionId) : null;
    else sec = hit ? sectionOf(hit) : null;
    var id = idOf(sec);
    var levels = id ? blockLevels[id] : null;
    if (!levels || !levels.length) return null;
    var sr = sec.getBoundingClientRect();
    if (y < sr.top + 10 || y > sr.bottom - 10) return null;
    var lists = {}, els = sec.querySelectorAll("[data-block-id]");
    for (var i = 0; i < els.length; i++) {
      var p = [], up = els[i].parentElement ? els[i].parentElement.closest("[data-block-id]") : null;
      while (up && sec.contains(up)) { p.unshift(up.getAttribute("data-block-id")); up = up.parentElement ? up.parentElement.closest("[data-block-id]") : null; }
      var key = p.join("/");
      if (levels.indexOf(key) < 0) continue;
      var r = els[i].getBoundingClientRect();
      if (r.height < 1 || r.width < 1) continue;
      (lists[key] = lists[key] || []).push({ id: els[i].getAttribute("data-block-id"), parent: p, r: r });
    }
    var best = null, bestD = Infinity;
    Object.keys(lists).forEach(function (k) {
      var list = lists[k];
      for (var j = 1; j < list.length; j++) {
        var a = list[j - 1], b = list[j];
        if (a.id === b.id || b.r.top < a.r.bottom - 4) continue;
        var left = Math.min(a.r.left, b.r.left), right = Math.max(a.r.right, b.r.right);
        if (x < left || x > right) continue;
        var gy = (a.r.bottom + b.r.top) / 2, d = Math.abs(y - gy);
        var same = gapShown && gapShown.kind === "block" && gapShown.before === b.id && gapShown.after === a.id;
        if (d > (same ? 12 : 8) || d > bestD) continue;
        bestD = d;
        best = { kind: "block", sectionId: id, parent: a.parent, before: b.id, after: a.id, y: gy, left: left, width: right - left };
      }
    });
    return best;
  };
  var addAt = null;
  var findGap = function () {
    if (!addAt || !inspect || leaving || touching) return null;
    var x = addAt.x, y = addAt.y;
    var gaps = gapsNow(), best = null;
    for (var i = 0; i < gaps.length; i++) {
      var g = gaps[i];
      var d = Math.abs(y - g.y);
      if (d > 8 || x < g.left || x > g.left + g.width) continue;
      if (!best || d < best.d) best = { g: g, d: d };
    }
    var g0 = best ? best.g : blockGapAt(x, y);
    if (!g0) return null;
    /* Under a sticky header, or off the screen: not a place anybody can see. */
    var cover = 0;
    styleCache = null;
    var tops = document.querySelectorAll(HEADER_TOPS);
    for (var k = 0; k < tops.length; k++) {
      var p = styleOf(tops[k]).position;
      if (p !== "sticky" && p !== "fixed") continue;
      var q = tops[k].getBoundingClientRect();
      if (q.top <= 1 && q.bottom > 0 && q.height < innerHeight * 0.6) cover = Math.max(cover, q.bottom);
    }
    /* The line at the header's own foot is a place (the top of the page's content); one hidden under it is not. */
    if (g0.y < cover - 1 || g0.y > innerHeight - 6) return null;
    return g0;
  };
  var addFrame = 0;
  var placeAdder = function () { addFrame = 0; showGap(findGap()); };
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    addAt = { x: e.clientX, y: e.clientY };
    if (!addFrame) addFrame = requestAnimationFrame(placeAdder);
  }, { passive: true, capture: true });
  /*
    NOT WHILE THE PAGE SCROLLS (round 14). Every frame of a scroll with the
    pointer resting on the canvas measured every section of the page (gapsNow)
    and the header to find a place under the pointer: a layout of the page a
    frame, on the owner's Materia theme a fifth of the bridge's scroll cost.
    The strip goes while the page moves, and the place under the pointer is
    found again once it has stopped (streaming's timer, above), or when the
    pointer moves.
  */
  addEventListener("scroll", function () { if (addFrame) { cancelAnimationFrame(addFrame); addFrame = 0; } if (gapShown) showGap(null); }, { passive: true });
  afterScroll = function () { if (addAt && !addFrame) addFrame = requestAnimationFrame(placeAdder); };
  document.addEventListener("mouseleave", function () { addAt = null; showGap(null); });
  var fire = function (el, name, detail) { try { el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail })); } catch (e) {} };
  /*
    STORELIB'S OWN EVENTS (round 1022, content/developers/imported-shopify-themes.md).
    storelib:section-load on a section once the builder has drawn it again,
    whether it was swapped (after shopify:section:load) or changed in place
    (no Shopify event, the element is the same); storelib:settings-change on
    the document when a theme setting changes, with the ids and values that
    changed, while a finger is on a control too (detail.live).
  */
  var sectionLoaded = function (id) { topsCache = null; var el = document.getElementById("shopify-section-" + id); if (el) { fire(el, "storelib:section-load", { sectionId: id }); farWatch(el); } };
  /*
    ═══════════════════════════════════════════════════════════════════════
     A SECTION FAR FROM THE SCREEN RESTS (round 14)
    ═══════════════════════════════════════════════════════════════════════
    The owner's Materia theme restyles the whole page for almost any change
    in it (132 :has() rules: one class changed by a scroll effect restyled
    some 2,000 elements, 4.5s of a 13s scroll at 1x, live and in the canvas
    alike: scripts/check-wb-scroll-r14.mjs ATTR=1). A section more than a
    screen and a half away is not drawn in the canvas (content-visibility:
    hidden, at the size it had, so nothing moves and the scrollbar is the
    same): the browser leaves its insides out of that work until it comes
    near, and then it is drawn as before, before it reaches the screen.
    Measured on the live page: a third fewer dropped frames.
    Never a section of a group (header, footer, overlays), nor one with
    anything fixed or sticky in it (a bar pinned to the screen, a drawer):
    those are seen from far away. Marked by attribute, not by style: an
    inline style changed restyles this theme's page (THE BUILDER'S OWN LAYER).
  */
  var farIO = null, farSeen = typeof WeakSet === "function" ? new WeakSet() : null, farOn = {};
  /*
    A MARGIN THAT LEAVES THE SECTION (round 25). Resting is containment, and a
    box with containment keeps its children's margins inside it: a heading's
    top margin that collapsed out through the section (a plain block with
    no padding or border between them) is suddenly inside it, and the page
    is longer or shorter by it as the section rests or wakes. A section link
    scrolling smoothly toward a section below then landed short of it, under
    the header (scripts/check-materia-section-links.mjs: 40px of the page
    gone mid scroll). Such a section never rests; nothing of it moves.
  */
  var marginEscapes = function (s) {
    var ends = [["firstElementChild", "nextElementSibling", "Top"], ["lastElementChild", "previousElementSibling", "Bottom"]];
    for (var e = 0; e < 2; e++) {
      var box = s;
      for (var depth = 0; depth < 8 && box; depth++) {
        var bs = getComputedStyle(box);
        if (bs.display !== "block" || bs.overflow !== "visible" || parseFloat(bs["padding" + ends[e][2]]) || parseFloat(bs["border" + ends[e][2] + "Width"]) || bs.contain !== "none") break;
        var child = box[ends[e][0]];
        while (child) { var cp = getComputedStyle(child); if (cp.display !== "none" && cp.position !== "absolute" && cp.position !== "fixed" && cp.cssFloat === "none") break; child = child[ends[e][1]]; }
        if (!child) break;
        if (parseFloat(getComputedStyle(child)["margin" + ends[e][2]])) return true;
        box = child;
      }
    }
    return false;
  };
  var farOk = function (s) {
    if (!s.isConnected || !s.parentElement || s.parentElement.closest(".shopify-section")) return false;
    if (/(^|\s)shopify-section-group-/.test(s.className)) return false;
    if (marginEscapes(s)) return false;
    var all = s.getElementsByTagName("*");
    if (all.length > 8000) return false;
    for (var i = 0; i < all.length; i++) { var p = getComputedStyle(all[i]).position; if (p === "fixed" || p === "sticky") return false; }
    return true;
  };
  var farWatch = function (s) {
    if (!farIO || !s || !farSeen || farSeen.has(s)) return;
    farSeen.add(s);
    var id = idOf(s);
    if (id && farOn[id] && farOn[id] !== s) { farIO.unobserve(farOn[id]); delete farOn[id]; }
    if (!farOk(s)) return;
    s.setAttribute("data-sl-rest", "");
    if (id) farOn[id] = s;
    farIO.observe(s);
  };
  var farStart = function () {
    if (farIO || window.__slNoRest || !(window.CSS && CSS.supports && CSS.supports("content-visibility", "hidden"))) return;
    var IO = window.__slIO || window.IntersectionObserver;
    if (typeof IO !== "function") return;
    var st = document.createElement("style");
    st.setAttribute("data-sl", "");
    /* The size it had is remembered while it is drawn (auto), and held while it rests. */
    st.textContent = "[data-sl-rest]{contain-intrinsic-size:auto none}[data-sl-rest][data-sl-far]{content-visibility:hidden}";
    document.head.appendChild(st);
    farIO = new IO(function (es) {
      for (var i = 0; i < es.length; i++) {
        var t = es[i].target;
        if (es[i].isIntersecting || !t.isConnected) { if (t.hasAttribute("data-sl-far")) t.removeAttribute("data-sl-far"); }
        else if (!t.hasAttribute("data-sl-far")) t.setAttribute("data-sl-far", "");
      }
    /* root: document. With no root, inside the canvas frame the observer measures against the editor's own window and drops rootMargin, so a resting section in view stayed hidden until a zoom measured again. */
    }, { root: document, rootMargin: "150% 0px 150% 0px" });
    /* A section at a time, when the page has a moment: each is read for anything fixed or sticky in it. */
    var list = Array.prototype.slice.call(document.querySelectorAll(".shopify-section"));
    var next = function () {
      var s = list.shift();
      if (!s) return;
      farWatch(s);
      if (typeof requestIdleCallback === "function") requestIdleCallback(next, { timeout: 1000 }); else setTimeout(next, 16);
    };
    next();
  };
  /* Once the theme's scripts have set the page up (sliders measured, reveals placed), and the first look at a held page is done. */
  var farLater = function () { setTimeout(function () { if (typeof requestIdleCallback === "function") requestIdleCallback(farStart, { timeout: 2000 }); else farStart(); }, 1500); };
  if (document.readyState === "complete") farLater(); else addEventListener("load", farLater, { once: true });
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
    }, { root: document, rootMargin: "0px 0px -50px 0px" });
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
    /*
      WHILE THE PAGE SCROLLS, SAID ONCE (round 14): the section is moving, and
      the builder's toolbar steps aside until it stands still, when its box is
      said again. Its box every frame of the scroll was a message a frame, and
      the editor's toolbar measured again a frame, on the thread the scroll
      runs on (a short page keeps the selected section on screen all along).
    */
    var m = v ? (scrollMoving ? { type: "box", id: selected.section, moving: true } : { type: "box", id: selected.section, top: Math.round(v.top), left: Math.round(v.left), width: Math.round(v.width), height: Math.round(v.bottom - v.top) }) : { type: "box", id: null };
    var key = JSON.stringify(m);
    if (key === lastBox) return;
    lastBox = key;
    post(m);
  };
  var reportSoon = function () { if (!boxFrame) { boxFrame = 1; afterLayout(function () { if (boxFrame) report(); }); } if (typeof redraw === "function") redraw(); };
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
    /* Read once the frame is laid out (afterLayout): a carousel turning under a selected section was a layout of the page every 80ms. */
    var tick = function () {
      drawBoxes(true);
      if (Date.now() < burstEnd) setTimeout(function () { afterLayout(tick); }, 80); else bursting = false;
    };
    afterLayout(tick);
  };
  var watcher = null;
  if (typeof MutationObserver !== "undefined") {
    /* Nodes of our own coming and going (a picture preloaded in the head, CANVAS_SWITCH warm; the boxes; the strip) are not the page changing. */
    var mine = function (list) {
      for (var k = 0; k < list.length; k++) { var n = list[k]; if (!(n.nodeType === 1 && (n.hasAttribute("data-sl-warm") || n.hasAttribute("data-sl-box") || n.hasAttribute("data-sl-add") || n.hasAttribute("data-sl-late")))) return false; }
      return true;
    };
    watcher = new MutationObserver(function (records) {
      records = Array.prototype.filter.call(records, function (r) { return !(r.type === "childList" && mine(r.addedNodes) && mine(r.removedNodes)); });
      for (var j = 0; j < records.length; j++) if (records[j].type === "childList") { topsCache = null; break; }
      for (var i = 0; i < records.length; i++) {
        var t = records[i].target;
        if (t && t.nodeType === 1 && (t.hasAttribute("data-sl-box") || t.hasAttribute("data-sl-add") || t.hasAttribute("data-sl-late") || (t.parentElement && t.parentElement.hasAttribute("data-sl-add")))) continue;
        burst();
        return;
      }
    });
    watcher.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "open", "hidden", "aria-hidden", "aria-expanded"] });
  }
  /*
    ═══════════════════════════════════════════════════════════════════════
     A PAGE HELD STILL WITH NOTHING OPEN IS LET GO (round 1023)
    ═══════════════════════════════════════════════════════════════════════
    The owner: "the canvas sometimes freezes: it stops scrolling and the
    scrollbar on the right goes; only a reload brings it back". A theme
    holds its page still while a drawer, a pop-up or a page transition is
    open, with a class or a style on <html> or <body> (overflow: hidden),
    and lets go when that closes. In the canvas the close can never come:
    the section holding the pop-up is drawn again or taken off by the
    builder while it is open (scripts/check-canvas-freeze.mjs: a pop-up
    open, its section hidden), or a transition waits for an overlay that
    never finishes. The page then has room to scroll and takes no wheel,
    and there is no scrollbar, because overflow: hidden draws none.

    So the lock is checked against the page: held, with room to scroll,
    and nothing on screen that holds it (an open <dialog>, or something
    fixed over a quarter of the view and painted, read with
    elementsFromPoint at five places), a moment after the last change to
    <html> or <body>, it is lifted by a rule of the canvas's own on <html>
    (data-sl-unlock), never by taking the theme's class away. The theme's
    next lock is the theme's: anything that opens takes the rule off again.
    A wheel that moves nothing over a held page asks the same at once.
  */
  var unlockCss = document.createElement("style");
  unlockCss.setAttribute("data-sl", "");
  unlockCss.textContent = "html[data-sl-unlock]{overflow-y:auto!important}html[data-sl-unlock] body{overflow-y:visible!important}html[data-sl-unlock=fixed] body{position:static!important;top:auto!important}";
  document.head.appendChild(unlockCss);
  var lockedNow = function () {
    /* Only where a page is drawn: a script run without one (a test's sandbox) holds nothing. */
    if (typeof getComputedStyle !== "function") return null;
    var se = document.scrollingElement || document.documentElement;
    var hs = getComputedStyle(document.documentElement), bs = document.body ? getComputedStyle(document.body) : null;
    var clip = function (v) { return v === "hidden" || v === "clip"; };
    var fixed = !!bs && bs.position === "fixed";
    var held = clip(hs.overflowY) || (!!bs && clip(bs.overflowY) && hs.overflowY === "visible") || fixed;
    if (!held) return null;
    /* A theme whose <body> is the page's scroller (html held on purpose, body scrolling): that is its layout, not a hold. */
    if (bs && (bs.overflowY === "auto" || bs.overflowY === "scroll") && document.body.scrollHeight > document.body.clientHeight + 2) return null;
    /* Room to scroll, as the page would have it: a body taken out of the flow (fixed) is measured by its own height. */
    var tall = Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (tall - innerHeight <= 2) return null;
    return fixed ? "fixed" : "1";
  };
  /*
    WHAT HOLDS A PAGE IS OVER IT, AND THE SHAPE OF A DRAWER OR A POP-UP
    (round 1023, part 2). Anything fixed, painted and a quarter of the screen
    counted as open, so the page stayed held for good under things that hold
    nothing: a cookie banner along the foot of a short canvas ("Allow
    Cookies", a third of its height), a sticky bar, a picture fixed behind
    the whole page (a grain, a parallax hero). Now a layer holds the page
    only when it is above the page's own content at that point (nothing of
    the page's flow over it in elementsFromPoint) and at least half the
    screen tall, as a drawer or a pop-up's backdrop is; a bar across the
    foot or a picture under the page does not.
  */
  var openOnScreen = function () {
    var dialogs = document.querySelectorAll("dialog[open]");
    for (var d = 0; d < dialogs.length; d++) { var dr = dialogs[d].getBoundingClientRect(); if (dr.width > 1 && dr.height > 1 && getComputedStyle(dialogs[d]).visibility !== "hidden") return true; }
    var vw = innerWidth, vh = innerHeight, area = vw * vh;
    var points = [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.25], [0.5, 0.8]];
    styleCache = null; fadeCache = null;
    for (var i = 0; i < points.length; i++) {
      var stack = document.elementsFromPoint(vw * points[i][0], vh * points[i][1]);
      var underPage = false;
      for (var k = 0; k < stack.length; k++) {
        var c = stack[k];
        if (c === document.body || c === document.documentElement) break;
        if (c.hasAttribute("data-sl-box") || c.hasAttribute("data-sl-add") || c.hasAttribute("data-sl-stalled")) continue;
        var layer = null;
        for (var n = c; n && n !== document.body; n = n.parentElement) if (styleOf(n).position === "fixed") layer = n;
        if (layer) {
          var r = layer.getBoundingClientRect();
          var seen = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
          var tall = Math.min(r.bottom, vh) - Math.max(r.top, 0) >= vh * 0.5;
          if (!underPage && tall && seen >= area * 0.25 && opacityOf(layer) >= 0.05) return true;
        } else underPage = true;
        if (paints(c)) break;
      }
    }
    return false;
  };
  /*
    A PRELOADER THAT NEVER GOES (round 1023, part 2). CANVAS_HEAD hides the
    preloaders it knows by name. One of the theme's own naming (a
    .loader-overlay) waits for its own chain of events to fade, and in the
    canvas the chain can stop short: the page sat under a white sheet, held.
    Once the page has loaded and had a moment, a layer still over the whole
    screen, fixed, painted, named as a loader is (load, preload, spinner,
    splash, intro, curtain) and holding no dialog or field, is hidden the
    way CANVAS_HEAD hides the known ones: unseen, taking no pointer, never
    taken out (a script may still be waiting on it).
  */
  var LOADER_NAME = /(^|[^a-z])(pre-?loader|loader|loading|load-screen|spinner|splash|intro|curtain|page-transition)([^a-z]|$)/i;
  var stalledCss = document.createElement("style");
  stalledCss.setAttribute("data-sl", "");
  stalledCss.textContent = "[data-sl-stalled],[data-sl-stalled] *{visibility:hidden!important;pointer-events:none!important;transition-duration:1ms!important;animation-duration:1ms!important}";
  document.head.appendChild(stalledCss);
  var stalledLoaders = function () {
    /* Only where a page is drawn (as lockedNow). */
    if (typeof innerWidth !== "number" || typeof document.elementsFromPoint !== "function") return;
    var vw = innerWidth, vh = innerHeight, hit = false;
    var seen = [];
    [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]].forEach(function (p) {
      document.elementsFromPoint(vw * p[0], vh * p[1]).forEach(function (c) {
        for (var n = c; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
          if (seen.indexOf(n) >= 0 || n.hasAttribute("data-sl-stalled")) continue;
          seen.push(n);
          var cs = getComputedStyle(n);
          if (cs.position !== "fixed" || cs.visibility === "hidden" || parseFloat(cs.opacity || "1") < 0.05) continue;
          var r = n.getBoundingClientRect();
          if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
          var name = (typeof n.className === "string" ? n.className : "") + " " + (n.id || "") + " " + n.tagName;
          if (!LOADER_NAME.test(name)) continue;
          if (n.querySelector("dialog, [role=dialog], [aria-modal=true], input, select, textarea, form")) continue;
          styleCache = null; fadeCache = null;
          if (!paints(n)) continue;
          n.setAttribute("data-sl-stalled", "");
          hit = true;
        }
      });
    });
    if (hit) checkLock();
  };
  var unlocked = false, lockTimer = 0, lockWatch = null, lockSeen = null, lockDirty = true;
  var setUnlock = function (v) {
    if (v) document.documentElement.setAttribute("data-sl-unlock", v);
    else document.documentElement.removeAttribute("data-sl-unlock");
    unlocked = !!v;
    /* Our own change to <html> is not the theme's. */
    if (lockWatch) lockWatch.takeRecords();
  };
  var checkLock = function () {
    lockTimer = 0;
    /* Read as the theme has the page: the rule off for the reading (one task, nothing is drawn between). */
    if (unlocked) setUnlock(null);
    var held = lockedNow();
    if (!held || openOnScreen()) return;
    setUnlock(held);
    post({ type: "unfrozen" });
    reportSoon();
  };
  var lockSoon = function (ms) { clearTimeout(lockTimer); lockTimer = setTimeout(checkLock, typeof ms === "number" ? ms : 700); };
  if (typeof MutationObserver !== "undefined") {
    lockWatch = new MutationObserver(function () {
      lockDirty = true;
      /* The theme changed <html> or <body>: a lock with something open is the theme's at once; the rest is looked at again once things settle. */
      if (unlocked && openOnScreen()) setUnlock(null);
      lockSoon();
    });
    lockWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    if (document.body) lockWatch.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
  }
  /*
    THE FIRST WHEEL IS NEVER LOST (round 1023, part 2). The owner: "when
    the editor opens the canvas does not scroll and has no scrollbar until
    I select a section". A page held from its first paint (a cookie banner's
    consent hold, a cart drawer that opens itself in a frame, a preloader's
    class) was looked at once, 1.5s in, and a wheel only asked again 120ms
    after it had already moved nothing (scripts/check-canvas-landing.mjs).
    Now the hold is looked at in the wheel's own task, before the browser
    scrolls; and a wheel that still moved nothing over a page with room,
    nothing open on screen and no scroller of its own under the pointer to
    take it (a theme's smooth scroll that is stopped and takes every wheel,
    Lenis's shape) is scrolled here, by the wheel's own distance.
  */
  var takesWheel = function (t, dy) {
    for (var n = t && t.nodeType === 1 ? t : t && t.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && n.scrollHeight > n.clientHeight + 1 && (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0)) return true;
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 1) return true;
    }
    return false;
  };
  var lastScrollAt = 0;
  addEventListener("scroll", function () { lastScrollAt = Date.now(); }, { passive: true, capture: true });
  addEventListener("wheel", function (e) {
    if (Math.abs(e.deltaY) < 1 || e.ctrlKey) return;
    var y = scrollY, at = Date.now();
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    /*
      Held: let go in this task, so the browser's own scroll for this wheel finds the page free.
      Looked at again only when <html> or <body> changed since (lockWatch) or a second has gone
      (round 14): the computed styles it reads restyled the page for every notch of a wheel.
    */
    var t0 = performance.now();
    if (!unlocked && (lockSeen === null || lockDirty || t0 - lockSeen > 1000)) {
      lockDirty = false; lockSeen = t0;
      if (lockedNow()) { clearTimeout(lockTimer); checkLock(); }
    }
    /* Only a wheel the theme's script took (preventDefault) and that then moved nothing: a wheel the browser scrolls is the browser's. Its own scroller under the pointer is looked for only then (each step up the page read its computed style and sizes). */
    setTimeout(function () {
      if (!e.defaultPrevented || takesWheel(e.target, dy)) return;
      setTimeout(function () {
        if (scrollY !== y || lastScrollAt >= at) return;
        if (!unlocked && lockedNow()) { checkLock(); if (!unlocked) return; }
        var se = document.scrollingElement || document.documentElement;
        var room = Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0) - innerHeight;
        if (room <= 2 || (dy > 0 ? y >= room - 1 : y <= 0)) return;
        if (openOnScreen()) return;
        scrollTo({ top: Math.max(0, Math.min(room, y + dy)), left: scrollX, behavior: "instant" });
      }, 120);
    }, 0);
  }, { passive: true, capture: true });
  /*
    AND THE FIRST SWIPE, AS THE FIRST WHEEL (round 1026). A phone has no
    wheel, and the hold was looked at for one only: a page held with nothing
    open waited out lockSoon's 700ms, or the next change to <html>, and a
    swipe inside that wait moved nothing ("the canvas does not scroll when I
    swipe"). Now the hold is looked at in the touchstart's own task, before
    the browser decides whether it can pan, exactly as for a wheel.

    And a theme that cancels the moves themselves: a body-scroll-lock left
    listening after the drawer that asked for it is gone (its section drawn
    again or hidden by the builder), cancelling every touchmove on the page.
    No style says so, so lockedNow cannot see it. A move that something else
    cancelled, up or down more than sideways, over a page with room, with
    nothing open on screen and no scroller of its own under the finger to
    take it, is scrolled here by the finger's own distance. Decided once per
    gesture (openOnScreen reads the page at five points).
  */
  var touchAtY = null, touchAtX = 0, touchHand = null;
  addEventListener("touchstart", function (e) {
    if (!e.touches || e.touches.length !== 1) { touchAtY = null; return; }
    touchAtY = e.touches[0].clientY; touchAtX = e.touches[0].clientX; touchHand = null;
    var t0 = performance.now();
    if (!unlocked && (lockSeen === null || lockDirty || t0 - lockSeen > 1000)) {
      lockDirty = false; lockSeen = t0;
      if (lockedNow()) { clearTimeout(lockTimer); checkLock(); }
    }
  }, { passive: true, capture: true });
  addEventListener("touchmove", function (e) {
    if (touchAtY === null || !e.touches || e.touches.length !== 1) return;
    var y = e.touches[0].clientY, x = e.touches[0].clientX;
    var dy = touchAtY - y, dx = touchAtX - x;
    touchAtY = y; touchAtX = x;
    /* After every other listener has had the move: only then is it known whether one of them cancelled it. */
    setTimeout(function () {
      if (!e.defaultPrevented || touchHand === false || Math.abs(dy) < 1 || Math.abs(dy) < Math.abs(dx)) return;
      if (touchHand === null) {
        var se0 = document.scrollingElement || document.documentElement;
        var room0 = Math.max(se0.scrollHeight, document.body ? document.body.scrollHeight : 0) - innerHeight;
        touchHand = room0 > 2 && !takesWheel(e.target, dy) && !openOnScreen();
        if (!touchHand) return;
      }
      var se = document.scrollingElement || document.documentElement;
      var room = Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0) - innerHeight;
      scrollTo({ top: Math.max(0, Math.min(room, scrollY + dy)), left: scrollX, behavior: "instant" });
    }, 0);
  }, { passive: true, capture: true });
  var touchGone = function () { touchAtY = null; touchHand = null; };
  addEventListener("touchend", touchGone, { passive: true, capture: true });
  addEventListener("touchcancel", touchGone, { passive: true, capture: true });
  /*
    ALREADY HELD WHEN THE PAGE OPENS, looked at from the first paint: as the
    bridge starts, at the page's load, and again as its scripts settle. And
    a preloader still up a moment after the load is hidden (stalledLoaders).
  */
  var firstLook = function () { if (!lockTimer) checkLock(); };
  [0, 400, 1500, 4000].forEach(function (ms) { setTimeout(firstLook, ms); });
  var afterLoad = function () { setTimeout(firstLook, 50); setTimeout(stalledLoaders, 1200); };
  if (document.readyState === "complete") afterLoad(); else addEventListener("load", afterLoad, { once: true });
  setTimeout(stalledLoaders, 4000);
  var settled = function () { if (selected.section || hovered) { redraw(); reportSoon(); } if (unlocked) lockSoon(150); };
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
  /*
    EACH SWAP IN A TASK OF ITS OWN (round 14). The queue is a chain of
    promises, and a chain runs to its end in one task: a burst of changes
    from Storelib AI, an agent or a push swapped five or six sections back
    to back, each one laid out against the whole page and started again by
    the theme's scripts, in one task of 500 to 850ms on the owner's Materia
    (scripts/check-wb-incoming-r14.mjs). A swap now waits for the next
    turn of the event loop, so a key pressed or a wheel turned in between
    is answered between two swaps, never after all of them.
  */
  var nextTurn = function () { return new Promise(function (done) { setTimeout(done, 0); }); };
  /*
    NO CHANGE HOLDS THE ONES AFTER IT FOR GOOD. Every change waits its turn
    in the queue, so one whose wait never ended (a stylesheet, a load, a
    promise of a theme's that never settles) held every later change: a
    section added, the page drawn again, all listed in the editor and none
    on the page. A change gets STEP_MS; past that the next goes on, and the
    builder is told ("slow-step") so the error log hears of it.
  */
  var STEP_MS = 4000;
  var bounded = function (p, what) {
    if (!p || typeof p.then !== "function") return p;
    return new Promise(function (done, fail) {
      var over = false;
      var t = setTimeout(function () { over = true; post({ type: "slow-step", what: what }); done(); }, STEP_MS);
      p.then(function () { if (!over) { clearTimeout(t); done(); } }, function (e) { if (!over) { clearTimeout(t); fail(e); } });
    });
  };
  var kept = {}, keptLink = {};
  /* The same file at another version (?v=, its text changed: a push) takes the old one's place once it has loaded, never both (round 13). */
  var fileOf = function (href) { return String(href).replace(/[?&]v=[^&#]*/, ""); };
  /*
    text: the stylesheet's own text, when the builder has it (a section new
    to the page: compat-canvas.tsx, preview-styles.ts linkedSheets). Written
    as a <style> in this task, so it applies before the section is put in,
    with no request to wait for; a link otherwise, waited for (2s at most).
  */
  var keep = function (href, text) {
    if (kept[href]) return kept[href];
    var inline = typeof text === "string";
    var l = document.createElement(inline ? "style" : "link");
    if (inline) l.textContent = text;
    else { l.rel = "stylesheet"; l.href = href; }
    l.__slHref = href;
    l.setAttribute("data-sl", "");
    var old = keptLink[fileOf(href)];
    keptLink[fileOf(href)] = l;
    kept[href] = inline ? Promise.resolve() : new Promise(function (done) { l.onload = done; l.onerror = done; setTimeout(done, 2000); });
    if (old) kept[href].then(function () { var was = old.__slHref || old.href; if (was && kept[was]) delete kept[was]; old.remove(); });
    document.head.appendChild(l);
    return kept[href];
  };
  /*
    ═══════════════════════════════════════════════════════════════════════
     A SLIDER DRAWN AGAIN STAYS ON THE SLIDE IT WAS ON
    ═══════════════════════════════════════════════════════════════════════
    A section drawn again whole (swap) is new markup, and the theme's script
    builds its sliders from the start: measured on Materia (scripts/
    check-materia-editor.ts), an edit to the slideshow put it back from its
    second slide on its first, and one to the content tabs threw their track
    from 278px back to 0. Somebody looking at the third picture of a gallery
    while changing a setting lost their place on every change.

    So what the visitor had moved to is read before the swap and put back
    after it: the scroll of every element scrolled inside the section (a
    scroll-snap track, a list of thumbnails) and the slide of every Swiper
    (the slider most Shopify themes ship, Materia's included). Each is found
    again by its id, or by its tag and its own classes and which of those it
    is in the section. A slider is put back as soon as the theme has built
    it, before that frame is painted, without an animation; one not built
    again within a second is left as the theme drew it.
  */
  var ownClasses = function (n) {
    return Array.prototype.filter.call(n.classList, function (c) { return !/^(swiper-|is-|js-|active$|lazy|aos)/.test(c); }).slice(0, 3);
  };
  var placeKey = function (root, n) {
    if (n.id) return { id: n.id };
    var sel = n.tagName.toLowerCase() + ownClasses(n).map(function (c) { return "." + CSS.escape(c); }).join("");
    return { sel: sel, at: Array.prototype.indexOf.call(root.querySelectorAll(sel), n) };
  };
  var placeOf = function (root, k) {
    if (k.id) { try { return root.querySelector("#" + CSS.escape(k.id)); } catch (e) { return null; } }
    try { return root.querySelectorAll(k.sel)[k.at] || null; } catch (e) { return null; }
  };
  var placesIn = function (el) {
    var out = [];
    Array.prototype.forEach.call(el.querySelectorAll("*"), function (n) {
      var sw = n.swiper, slide = sw && !sw.destroyed && typeof sw.realIndex === "number" ? sw.realIndex : 0;
      if (n.scrollLeft || n.scrollTop || slide > 0) out.push({ key: placeKey(el, n), left: n.scrollLeft, top: n.scrollTop, slide: slide });
    });
    return out;
  };
  var putPlacesBack = function (next, places) {
    if (!places.length) return;
    var until = performance.now() + 1000;
    var step = function () {
      if (!next.isConnected) return;
      var left = 0;
      places.forEach(function (p) {
        if (p.done) return;
        var n = placeOf(next, p.key);
        if (!n) { left++; return; }
        if (p.slide > 0) {
          var sw = n.swiper;
          if (!sw || sw.destroyed) { left++; return; }
          if (!p.slid) {
            try { if (sw.params && sw.params.loop && sw.slideToLoop) sw.slideToLoop(p.slide, 0, false); else sw.slideTo(p.slide, 0, false); } catch (e) {}
            p.slid = true;
          }
        }
        if (p.left || p.top) {
          if (Math.abs(n.scrollLeft - p.left) > 1 || Math.abs(n.scrollTop - p.top) > 1) n.scrollTo({ left: p.left, top: p.top, behavior: "instant" });
          /* Short of it: the pictures that make the track that wide are not in yet. */
          if (Math.abs(n.scrollLeft - p.left) > 1 || Math.abs(n.scrollTop - p.top) > 1) { left++; return; }
        }
        p.done = true;
      });
      /* Before every frame, so a slider the theme builds in a later task is moved before it is ever painted on its first slide. */
      if (left && performance.now() < until) requestAnimationFrame(step);
    };
    step();
  };
  var swap = function (id, html, prev) {
    var tpl = document.createElement("template");
    tpl.innerHTML = html;
    var next = tpl.content.firstElementChild;
    if (!next) return;
    var links = Array.prototype.slice.call(next.querySelectorAll('link[rel="stylesheet"][href]'));
    return Promise.all(links.map(function (l) { return keep(l.href); })).then(nextTurn).then(function () {
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
      var places = placesIn(el);
      fire(el, "shopify:section:unload", { sectionId: id, load: true });
      /* Held at its height until its pictures are in: a new <img> has no size until it decodes. */
      var y = scrollY;
      var held = el.getBoundingClientRect().height;
      /*
        Its scripts are not run again: they ran with the page, and the custom
        elements they defined take the new markup as it connects. One whose
        text is new (a setting printed in it, round BC) is run, as Shopify's
        editor runs a section drawn again: the theme's script reads the value
        there, once, as it starts.
      */
      el.replaceWith(next);
      runScripts(next, true);
      next.style.minHeight = held + "px";
      var pending = Array.prototype.filter.call(next.querySelectorAll("img"), function (i) { return !i.complete; });
      var release = function () { next.style.minHeight = ""; };
      /* Never held for good (round 66): a frame or an event that never comes left the section at its old height after a setting was put back. */
      setTimeout(release, 3000);
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
      putPlacesBack(next, places);
      rewatch(pairs, next);
      keepShown(pairs);
      if (selected.section === id) mark(selected.section, selected.block, false);
      reportSoon();
      /* A drawer or a pop-up that was open in the section is gone with it, and its hold on the page may not be (A PAGE HELD STILL). */
      lockSoon();
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
  /* How long a section whose script reads a changed value waits to start again: 700ms for a run of values, none for one choice (the builder's "now", compat-canvas ONE CHOICE, SHOWN AT ONCE). */
  var restartIn = 700;
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
      if (n.indexOf("data-") === 0 || tag.indexOf("-") > 0) { ops.restart = true; (ops.restartAt || (ops.restartAt = [])).push(live); }
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
    if (tag === "SCRIPT") { if (a.textContent !== b.textContent) { ops.restart = true; ops.restartAll = true; } return true; }
    if (tag === "STYLE" || tag === "TEXTAREA" || tag === "TITLE") {
      if (a.textContent !== b.textContent) ops.push(function () { live.__slText = undefined; live.textContent = b.textContent; });
      return true;
    }
    if (tag === "TEMPLATE") {
      if (a.innerHTML !== b.innerHTML) { ops.restart = true; ops.restartAll = true; ops.push(function () { live.innerHTML = b.innerHTML; }); }
      return true;
    }
    var ka = childrenOf(a), kb = childrenOf(b), kl = childrenOf(live);
    if (ka.length !== kb.length || kl.length !== ka.length) return false;
    for (i = 0; i < ka.length; i++) if (!plan(kl[i], ka[i], kb[i], ops)) return false;
    return true;
  };
  /*
    A VALUE A SCRIPT READS ONCE, STARTED AGAIN WHERE IT IS READ. A countdown
    block's end date is a data- attribute (or an attribute of its own custom
    element) that its script reads as it starts, so the section was swapped
    whole once the changes stopped: on a product page that is the gallery,
    every picture decoded again and the slider back on its first slide, for
    a date. When every value that changed sits inside a custom element with
    no pictures or video in it (the countdown's own <countdown-timer>), that
    element alone is put back fresh from the new markup, and it starts again
    as it connects. Anything else (a script's text, a data- attribute
    outside such an element, an element holding media) swaps the section as
    before.
  */
  var RESTART_MEDIA = "img,picture,video,iframe,model-viewer,canvas";
  var restartRoot = function (sec, n) {
    for (var x = n; x && x !== sec; x = x.parentElement) {
      if (x.tagName.indexOf("-") > 0) return x.querySelector(RESTART_MEDIA) ? null : x;
    }
    return null;
  };
  var drawnCounterpart = function (sec, x, drawnRoot) {
    var id = x.getAttribute("id");
    if (id) { var byId = drawnRoot.querySelector("#" + CSS.escape(id)); return byId && byId.tagName === x.tagName ? byId : null; }
    var cands = drawnRoot.getElementsByTagName(x.tagName);
    for (var i = 0; i < cands.length; i++) {
      var k = kindOf(cands[i]), mine = ofKind(drawnRoot, k), theirs = ofKind(sec, k);
      if (mine.length === theirs.length && theirs[mine.indexOf(cands[i])] === x) return cands[i];
    }
    return null;
  };
  var restartInPlace = function (id, html, els) {
    var sec = document.getElementById("shopify-section-" + id);
    if (!sec || !els || !els.length) return false;
    var roots = [], i;
    for (i = 0; i < els.length; i++) {
      if (!els[i].isConnected || !sec.contains(els[i])) return false;
      var r = restartRoot(sec, els[i]);
      if (!r) return false;
      if (roots.indexOf(r) < 0) roots.push(r);
    }
    roots = roots.filter(function (r) { return !roots.some(function (o) { return o !== r && o.contains(r); }); });
    var t = document.createElement("template");
    t.innerHTML = html;
    var drawnRoot = t.content.firstElementChild;
    if (!drawnRoot) return false;
    var pairs = [];
    for (i = 0; i < roots.length; i++) {
      var c = drawnCounterpart(sec, roots[i], drawnRoot);
      if (!c) return false;
      pairs.push([roots[i], c]);
    }
    var y = scrollY;
    pairs.forEach(function (p) {
      var fresh = document.importNode(p[1], true);
      p[0].replaceWith(fresh);
      if (fresh.querySelector("script")) runScripts(fresh, true);
    });
    if (watcher) watcher.takeRecords();
    if (scrollY !== y) scrollTo(0, y);
    if (selected.section === id) mark(selected.section, selected.block, false, true);
    reportSoon();
    return true;
  };
  /* els: the elements whose read-once values changed, or null for the whole section. */
  var restartLater = function (id, html, els) {
    clearTimeout(settleTimers[id]);
    settleTimers[id] = setTimeout(function () {
      queue = queue.then(function () {
        if (drawn[id] !== html) return;
        var inPlace = false;
        try { inPlace = restartInPlace(id, html, els); } catch (e) { inPlace = false; }
        if (!inPlace) return bounded(swap(id, html), "restart");
      }).catch(function () {});
    }, restartIn);
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
    if (ops.restart) restartLater(id, html, ops.restartAll ? null : ops.restartAt || null);
    if (selected.section === id) mark(selected.section, selected.block, false, true);
    reportSoon();
    return true;
  };
  /*
    ═══════════════════════════════════════════════════════════════════════
     A STYLE THAT CHANGED IS WRITTEN WHERE IT IS, WHATEVER THE THEME MOVED
    ═══════════════════════════════════════════════════════════════════════
    The owner, round 35: the header's height dragged in the sidebar, and the
    header in the canvas moved in about three steps a second. A theme's
    header is the section its scripts change most: Dawn's moves its menu
    drawer and adds its sticky state, a custom header builds its mega menu
    and its icons. The page no longer matched the markup it was drawn from
    child for child, so morph above gave up and every value was a swap: the
    whole header taken out and put back, its custom elements connected
    again, every element compared for what the theme had done to it. 200 to
    650ms of the main thread per value on Dawn at full speed, two seconds
    with the CPU slowed 4x (scripts/check-compat-live-edit.ts).

    Most values a slider or a colour moves change a style and nothing else:
    a number in the section's own <style>, a declaration in a style
    attribute. So the two markups are compared with each other first, never
    with the page. When the only differences are those (and words, and plain
    attributes), each is found on the page by what it was drawn as, and
    written there: the <style> whose text was the old text, the element of
    that tag and those classes at the same place among its kind. The rest of
    the page, and everything the theme's scripts did to it, is not looked at.
    Anything that cannot be found that way goes to morph, then to a swap.
  */
  var parsedAt = {};
  var parsed = function (id, html) {
    var hit = parsedAt[id];
    if (hit && hit.html === html) return hit.el;
    var t = document.createElement("template");
    t.innerHTML = html;
    var el = t.content.firstElementChild;
    parsedAt[id] = { html: html, el: el };
    return el;
  };
  var ownStyles = function (root) { return Array.prototype.filter.call(root.querySelectorAll("style"), function (s) { return !s.hasAttribute("data-sl"); }); };
  /*
    A <STYLE>'S NEW TEXT, WRITTEN INTO ITS RULES. Its text replaced, the
    browser reads the sheet again and rebuilds the page's rules from every
    stylesheet the theme has: 7ms at full speed for a header's one number,
    30ms slowed 4x, whatever the number changed (a trace of the frame,
    scripts/check-compat-live-edit.ts TRACE). So the old and the new text are
    read into sheets of their own, rule for rule, and only the declarations
    that differ are set on the rule on the page. The text a rule-written
    <style> stands for is kept on it (__slText), for the next change to be
    matched against. A sheet whose rules differ in any other way (a rule
    added, a selector changed, a keyframe) takes the text.
  */
  var textOf = function (s) { return s.__slText !== undefined ? s.__slText : s.textContent; };
  var scratch = function (text) {
    try { var sh = new CSSStyleSheet(); sh.replaceSync(text); return sh; } catch (e) { return null; }
  };
  var ruleOps = function (live, a, b, ops) {
    if (live.length !== a.length || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      var ra = a[i], rb = b[i], rl = live[i];
      if (ra.cssText === rb.cssText) continue;
      if (ra.constructor !== rb.constructor || rl.constructor !== ra.constructor) return false;
      /* A style rule (which may hold nested rules of its own, CSS nesting): its declarations, then what it holds. */
      if (ra.style && rb.style && rl.style) {
        if (ra.selectorText !== rb.selectorText || rl.selectorText !== ra.selectorText) return false;
        var sa = ra.style, sb = rb.style, k, p;
        for (k = 0; k < sa.length; k++) { p = sa[k]; if (!sb.getPropertyValue(p)) ops.push((function (st, q) { return function () { st.removeProperty(q); }; })(rl.style, p)); }
        for (k = 0; k < sb.length; k++) {
          p = sb[k];
          if (sa.getPropertyValue(p) === sb.getPropertyValue(p) && sa.getPropertyPriority(p) === sb.getPropertyPriority(p)) continue;
          ops.push((function (st, q, v, pr) { return function () { st.setProperty(q, v, pr); }; })(rl.style, p, sb.getPropertyValue(p), sb.getPropertyPriority(p)));
        }
        var na = ra.cssRules ? ra.cssRules.length : 0, nb = rb.cssRules ? rb.cssRules.length : 0;
        if ((na || nb) && !(rl.cssRules && ruleOps(rl.cssRules, ra.cssRules, rb.cssRules, ops))) return false;
        continue;
      }
      /* A rule that holds rules (@media, @supports, @layer, @container) under the same condition. */
      if (ra.cssRules && rb.cssRules && rl.cssRules && (ra.conditionText || "") === (rb.conditionText || "") && (rl.conditionText || "") === (ra.conditionText || "")) {
        if (!ruleOps(rl.cssRules, ra.cssRules, rb.cssRules, ops)) return false;
        continue;
      }
      return false;
    }
    return true;
  };
  var setText = function (s, to) {
    var from = textOf(s), sheet = s.sheet, a = sheet ? scratch(from) : null, b = a ? scratch(to) : null, ops = [];
    var ruled = false;
    try { ruled = !!(a && b && ruleOps(sheet.cssRules, a.cssRules, b.cssRules, ops)); } catch (e) { ruled = false; }
    if (ruled) { ops.forEach(function (op) { op(); }); s.__slText = to; return; }
    s.__slText = undefined;
    s.textContent = to;
  };
  /* The two markups, child for child: false when their shape differs, else every difference that can be written in place. */
  var differences = function (a, b, out) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType === 3) { if (a.data !== b.data) out.push({ text: a, to: b.data }); return true; }
    if (a.nodeType !== 1) return true;
    if (a.tagName !== b.tagName) return false;
    var names = {}, i;
    for (i = 0; i < a.attributes.length; i++) names[a.attributes[i].name] = 1;
    for (i = 0; i < b.attributes.length; i++) names[b.attributes[i].name] = 1;
    for (var n in names) {
      var va = a.getAttribute(n), vb = b.getAttribute(n);
      if (va !== vb) out.push({ el: a, name: n, from: va, to: vb });
    }
    if (a.tagName === "STYLE") { if (a.textContent !== b.textContent) out.push({ style: a, to: b.textContent }); return true; }
    /* A script's or a template's text is read once by the theme: a change there is a swap. */
    if (a.tagName === "SCRIPT" || a.tagName === "TEMPLATE" || a.tagName === "TEXTAREA" || a.tagName === "TITLE") return a.textContent === b.textContent;
    var ka = childrenOf(a), kb = childrenOf(b);
    if (ka.length !== kb.length) return false;
    for (i = 0; i < ka.length; i++) if (!differences(ka[i], kb[i], out)) return false;
    return true;
  };
  /* An element as drawn, on the page: the one of its tag carrying its classes, at the same place among those. */
  var kindOf = function (x) { var c = words(x.getAttribute("class")); return { tag: x.tagName, words: c }; };
  var ofKind = function (root, k) {
    var out = root.tagName === k.tag && k.words.every(function (w) { return root.classList.contains(w); }) ? [root] : [];
    Array.prototype.forEach.call(root.getElementsByTagName(k.tag), function (c) { if (k.words.every(function (w) { return c.classList.contains(w); })) out.push(c); });
    return out;
  };
  var onPage = function (x, drawnRoot, live) {
    if (x === drawnRoot) return live;
    var id = x.getAttribute("id");
    if (id) { var byId = live.querySelector("#" + CSS.escape(id)); return byId && byId.tagName === x.tagName ? byId : null; }
    var k = kindOf(x);
    var mine = ofKind(drawnRoot, k), theirs = ofKind(live, k);
    if (mine.length !== theirs.length) return null;
    return theirs[mine.indexOf(x)] || null;
  };
  /* An attribute as drawn, written as it is drawn now: a style declaration by declaration, a class word by word. */
  var writeAttr = function (t, name, from, to) {
    if (name === "style" && from !== null && to !== null) {
      var da = declarations(from), db = declarations(to);
      return function () {
        Object.keys(da).forEach(function (p) { if (!(p in db)) t.style.removeProperty(p); });
        Object.keys(db).forEach(function (p) {
          if (da[p] === db[p]) return;
          var v = db[p], important = /!important$/i.test(v);
          t.style.setProperty(p, important ? v.replace(/\s*!important$/i, "") : v, important ? "important" : "");
        });
      };
    }
    if (name === "class") {
      var wa = words(from), wb = words(to);
      return function () {
        wa.forEach(function (w) { if (wb.indexOf(w) < 0) t.classList.remove(w); });
        wb.forEach(function (w) { if (wa.indexOf(w) < 0) t.classList.add(w); });
      };
    }
    if (to === null) return function () { t.removeAttribute(name); };
    return function () { t.setAttribute(name, to); };
  };
  /* What was written is the section as drawn now; a value a script reads once starts it again when the changes stop (as morph). */
  var written = function (id, html, ops, restart, restartAt) {
    /* Nothing added or taken away, so the scroll is not read back: reading it was a layout of the page for every value. */
    ops.forEach(function (op) { op(); });
    if (watcher) watcher.takeRecords();
    streaming();
    drawn[id] = html;
    clearTimeout(settleTimers[id]);
    if (restart) restartLater(id, html, restartAt || null);
    /* The same elements, changed: the selection's marks are still on them, so only where they are is read again (mark took them all off and put them back, a style pass of its own for every value). */
    var sel = selected.section === id ? document.getElementById("shopify-section-" + id) : null;
    if (sel && inspect && !sel.hasAttribute("data-sl-selected") && !sel.querySelector("[data-sl-selected-block]")) mark(selected.section, selected.block, false, true);
    reportSoon();
    return true;
  };
  var restartsFor = function (name, tag) { return name.indexOf("data-") === 0 || tag.indexOf("-") > 0; };
  var restyle = function (id, html, prev) {
    var el = document.getElementById("shopify-section-" + id);
    var before = drawn[id] || prev;
    if (!el || typeof before !== "string" || typeof html !== "string") return false;
    if (before === html) return true;
    var a = parsed(id, before), b = document.createElement("template");
    b.innerHTML = html;
    b = b.content.firstElementChild;
    if (!a || !b) return false;
    var diffs = [];
    if (!differences(a, b, diffs)) return false;
    var styles = null, liveStyles = null, ops = [], restart = false, restartAt = [];
    for (var i = 0; i < diffs.length; i++) {
      var d = diffs[i];
      if (d.style) {
        if (!styles) { styles = ownStyles(a); liveStyles = ownStyles(el); }
        var k = styles.indexOf(d.style);
        var same = liveStyles.length === styles.length ? liveStyles[k] : null;
        /* Where the theme added a stylesheet of its own: the one whose text is what was drawn. */
        if (!same || textOf(same) !== d.style.textContent) {
          var hits = liveStyles.filter(function (s) { return textOf(s) === d.style.textContent; });
          same = hits.length === 1 ? hits[0] : null;
        }
        /* Already written while a finger was down (a theme value, "edits" below): nothing to do. */
        if (!same && liveStyles.some(function (s) { return textOf(s) === d.to; })) continue;
        if (!same) return false;
        ops.push((function (s, to) { return function () { setText(s, to); }; })(same, d.to));
      } else if (d.text) {
        var parent = d.text.parentNode && d.text.parentNode.nodeType === 1 ? onPage(d.text.parentNode, a, el) : null;
        if (!parent) return false;
        var node = null;
        for (var c = parent.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.data === d.text.data) { node = c; break; }
        if (!node) return false;
        ops.push((function (t, to) { return function () { t.data = to; }; })(node, d.to));
      } else {
        if (d.name === "id") return false;
        var live = onPage(d.el, a, el);
        if (!live) return false;
        if (restartsFor(d.name, d.el.tagName)) { restart = true; restartAt.push(live); }
        ops.push(writeAttr(live, d.name, d.from, d.to));
      }
    }
    Array.prototype.forEach.call(b.querySelectorAll('link[rel="stylesheet"][href]'), function (l) { keep(l.getAttribute("href")); });
    parsedAt[id] = { html: html, el: b };
    return written(id, html, ops, restart, restartAt);
  };
  /*
    THE ONE CHANGE, NAMED BY THE BUILDER. While a finger is on a slider the
    builder compares what it drew with what it drew before and, when the
    change is inside one <style> or one tag, sends that alone
    (lib/storelib-theme/compat/live-draw.ts editBetween). It is written
    without parsing or comparing the section: the <style> whose text was the
    old text, or the one element of that tag and classes whose attributes
    were the old ones. Found nowhere, or twice, it is left to restyle.
  */
  var edit = function (id, e, html) {
    var el = document.getElementById("shopify-section-" + id);
    if (!el || !e || typeof html !== "string") return false;
    if (e.style) {
      var mine = ownStyles(el);
      var hits = mine.filter(function (s) { return textOf(s) === e.from; });
      if (!hits.length && mine.some(function (s) { return textOf(s) === e.to; })) return written(id, html, [], false);
      if (hits.length !== 1) return false;
      return written(id, html, [(function (s) { return function () { setText(s, e.to); }; })(hits[0])], false);
    }
    if (!e.tag) return false;
    var ta = document.createElement("template"), tb = document.createElement("template");
    ta.innerHTML = e.from;
    tb.innerHTML = e.to;
    var a = ta.content.firstElementChild, b = tb.content.firstElementChild;
    if (!a || !b || a.tagName !== b.tagName) return false;
    var names = {}, changed = [], i;
    for (i = 0; i < a.attributes.length; i++) names[a.attributes[i].name] = 1;
    for (i = 0; i < b.attributes.length; i++) names[b.attributes[i].name] = 1;
    for (var n in names) if (a.getAttribute(n) !== b.getAttribute(n)) changed.push({ name: n, from: a.getAttribute(n), to: b.getAttribute(n) });
    if (!changed.length || changed.some(function (d) { return d.name === "id"; })) return false;
    var found = ofKind(el, kindOf(a)).filter(function (c) { return changed.every(function (d) { return c.getAttribute(d.name) === d.from; }); });
    if (found.length !== 1) return false;
    var restart = changed.some(function (d) { return restartsFor(d.name, a.tagName); });
    return written(id, html, changed.map(function (d) { return writeAttr(found[0], d.name, d.from, d.to); }), restart, [found[0]]);
  };
  /* A named change anywhere in the page: every place holding what it was is written; a page already showing it needs nothing. */
  var editAnywhere = function (e) {
    /* One stylesheet named by the builder (Storelib's Hover and focus): written whatever it holds now. */
    if (e.style && e.sel) {
      var named = document.querySelector(e.sel);
      if (!named) return false;
      if (textOf(named) !== e.to) setText(named, e.to);
      return true;
    }
    if (e.style) {
      var all = ownStyles(document.documentElement);
      var hits = all.filter(function (x) { return textOf(x) === e.from; });
      if (!hits.length) return all.some(function (x) { return textOf(x) === e.to; });
      hits.forEach(function (x) { setText(x, e.to); });
      return true;
    }
    if (!e.tag) return false;
    var ta = document.createElement("template"), tb = document.createElement("template");
    ta.innerHTML = e.from;
    tb.innerHTML = e.to;
    var a = ta.content.firstElementChild, b = tb.content.firstElementChild;
    if (!a || !b || a.tagName !== b.tagName) return false;
    var names = {}, changed = [], i;
    for (i = 0; i < a.attributes.length; i++) names[a.attributes[i].name] = 1;
    for (i = 0; i < b.attributes.length; i++) names[b.attributes[i].name] = 1;
    for (var n in names) if (a.getAttribute(n) !== b.getAttribute(n)) changed.push({ name: n, from: a.getAttribute(n), to: b.getAttribute(n) });
    if (changed.some(function (d) { return d.name === "id" || d.name === "class"; })) return false;
    var kind = ofKind(document.documentElement, kindOf(a));
    var found = kind.filter(function (c) { return changed.every(function (d) { return c.getAttribute(d.name) === d.from; }); });
    if (!found.length) return kind.some(function (c) { return changed.every(function (d) { return c.getAttribute(d.name) === d.to; }); });
    found.forEach(function (t) { changed.forEach(function (d) { writeAttr(t, d.name, d.from, d.to)(); }); });
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
  /*
    An element's attributes from what they were drawn as to what they are
    drawn as now, written on the element as it stands: a class word by
    word, a style declaration by declaration, any other attribute as a
    whole; what the theme's script set and the drawing did not change is
    left. (<body class="… overflow-hidden"> drawn again with another
    layout class kept the theme's own js and loaded classes: round 1023,
    part 2.)
  */
  var attrsBetween = function (el, from, to) {
    var names = {};
    Object.keys(from).forEach(function (k) { names[k] = 1; });
    Object.keys(to).forEach(function (k) { names[k] = 1; });
    Object.keys(names).forEach(function (n) {
      var va = Object.prototype.hasOwnProperty.call(from, n) ? from[n] : null, vb = Object.prototype.hasOwnProperty.call(to, n) ? to[n] : null;
      if (va === vb) return;
      if (n === "class") {
        var wa = words(va), wb = words(vb);
        wa.forEach(function (w) { if (wb.indexOf(w) < 0) el.classList.remove(w); });
        wb.forEach(function (w) { if (wa.indexOf(w) < 0) el.classList.add(w); });
        if (vb === null && !el.classList.length) el.removeAttribute("class");
      } else if (n === "style" && va !== null && vb !== null) {
        var da = declarations(va), db = declarations(vb);
        Object.keys(da).forEach(function (k) { if (!(k in db)) el.style.removeProperty(k); });
        Object.keys(db).forEach(function (k) {
          if (da[k] === db[k]) return;
          var v = db[k], important = /!important$/i.test(v);
          el.style.setProperty(k, important ? v.replace(/\\s*!important$/i, "") : v, important ? "important" : "");
        });
      } else if (vb === null) el.removeAttribute(n);
      else el.setAttribute(n, vb);
    });
  };
  var attrMap = function (el) { var o = {}; for (var i = 0; i < el.attributes.length; i++) o[el.attributes[i].name] = el.attributes[i].value; return o; };
  /* \`from\`: what <html> or <body> was drawn with. Without it (an older message), every attribute is the drawing's. */
  var setAttrs = function (el, attrs, from) {
    if (!attrs) return;
    if (from) { attrsBetween(el, from, attrs); return; }
    Array.prototype.slice.call(el.attributes).forEach(function (a) { if (!(a.name in attrs) && a.name.indexOf("data-sl") !== 0) el.removeAttribute(a.name); });
    Object.keys(attrs).forEach(function (k) { if (el.getAttribute(k) !== attrs[k]) el.setAttribute(k, attrs[k]); });
  };
  /*
    ═══════════════════════════════════════════════════════════════════════
     THE LAYOUT AROUND THE SECTIONS, CHANGED WHERE IT STANDS (round 1023, part 2)
    ═══════════════════════════════════════════════════════════════════════
    A theme setting the layout prints outside every section (a cookie
    banner's words or its switch, a back to top button, a <style> only while
    a switch is on, a script or a tag in the head) loaded the whole page
    again: the canvas flashed, came back, and the hold of whatever the
    theme had open came back with it. Now the builder sends the layout as
    it was drawn and as it is drawn now (compat-canvas.tsx planPatch,
    \`layout\`), with each section, script and noscript as a mark, and this
    compares the two node by node and writes the difference into the page:
    a text, an attribute, a class word, a node added or taken away. The
    sections stay where they are, a script that ran is never run again (a
    script newly in the head is started), and what the theme's own scripts
    added since (nothing markDrawn marked) is left alone. A page that no
    longer matches what was drawn says so, and is drawn again behind as
    before.
  */
  var isMark = function (n) { return n.nodeType === 1 && n.tagName === "TEMPLATE" && (n.hasAttribute("data-sl-sec") || n.hasAttribute("data-sl-js") || n.hasAttribute("data-sl-ns")); };
  var meaningful = function (n) { return n.nodeType === 1 || (n.nodeType === 3 && n.data.trim() !== ""); };
  var drawnKids = function (n) { var out = []; for (var c = n.firstChild; c; c = c.nextSibling) if (meaningful(c)) out.push(c); return out; };
  var isSection = function (n) { return n.nodeType === 1 && !!n.classList && n.classList.contains("shopify-section"); };
  var liveKids = function (n) {
    var out = [];
    for (var c = n.firstChild; c; c = c.nextSibling) {
      if (!meaningful(c)) continue;
      if (isSection(c)) { out.push(c); continue; }
      if (c.__slDrawn !== true) continue;
      if (c.nodeType === 1 && (c.hasAttribute("data-sl-box") || c.hasAttribute("data-sl-add"))) continue;
      out.push(c);
    }
    return out;
  };
  var keyOf = function (n) { return n.nodeType === 3 ? "#" + n.data : n.outerHTML; };
  /* Why the last layout could not be matched, said with the reload. */
  var layoutWhy = "";
  var nameOf = function (n) { return n.nodeType === 3 ? "text" : n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (typeof n.className === "string" && n.className ? "." + n.className.split(" ")[0] : ""); };
  var sameKind = function (a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    if (a.tagName !== b.tagName || isMark(a) !== isMark(b)) return false;
    return !isMark(a) || (a.getAttribute("data-sl-sec") === b.getAttribute("data-sl-sec") && a.hasAttribute("data-sl-js") === b.hasAttribute("data-sl-js"));
  };
  /* The node of the page each drawn node stands as, in order; null when the page no longer matches the drawing. */
  var counterparts = function (drawnList, live) {
    var out = [], p = 0;
    for (var i = 0; i < drawnList.length; i++) {
      var d = drawnList[i];
      if (isMark(d) && d.hasAttribute("data-sl-sec")) {
        var sec = document.getElementById("shopify-section-" + d.getAttribute("data-sl-sec"));
        var at = sec ? live.indexOf(sec) : -1;
        out.push(at >= 0 ? sec : null);
        if (at >= p) p = at + 1;
        continue;
      }
      while (p < live.length && isSection(live[p])) p++;
      var c = live[p];
      var fits = !!c && (isMark(d) ? c.nodeType === 1 && c.tagName === (d.hasAttribute("data-sl-js") ? "SCRIPT" : "NOSCRIPT") : d.nodeType === c.nodeType && (d.nodeType !== 1 || c.tagName === d.tagName));
      if (!fits) { layoutWhy = "drawn " + nameOf(d) + " is " + (c ? nameOf(c) : "missing"); return null; }
      out.push(c);
      p++;
    }
    return out;
  };
  /* The two drawings' nodes paired: the same (unchanged), changed in place (the same kind where they differ), taken away, or added. */
  var alignLists = function (A, B) {
    var n = A.length, m = B.length, i, j;
    if (n * m > 60000) return null;
    var ka = A.map(keyOf), kb = B.map(keyOf), L = [];
    for (i = 0; i <= n; i++) { L.push([]); for (j = 0; j <= m; j++) L[i].push(0); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var ops = [], gapA = [], gapB = [];
    var flush = function () {
      var k = 0;
      while (k < gapA.length && k < gapB.length && sameKind(A[gapA[k]], B[gapB[k]])) { ops.push({ a: gapA[k], b: gapB[k], same: false }); k++; }
      for (var x = k; x < gapA.length; x++) ops.push({ a: gapA[x], b: -1 });
      for (var y = k; y < gapB.length; y++) ops.push({ a: -1, b: gapB[y] });
      gapA = []; gapB = [];
    };
    i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && ka[i] === kb[j]) { flush(); ops.push({ a: i, b: j, same: true }); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { gapB.push(j); j++; }
      else { gapA.push(i); i++; }
    }
    flush();
    return ops;
  };
  var markAll = function (x) { x.__slDrawn = true; for (var c = x.firstChild; c; c = c.nextSibling) markAll(c); };
  /* A node the new drawing adds, as the page will hold it: a section's or a noscript's mark adds nothing, a script's mark with an address is that script, started. */
  var laidNew = function (b) {
    if (isMark(b)) {
      var src = b.getAttribute("data-sl-js");
      if (!src) return null;
      var s = document.createElement("script");
      s.src = src;
      if (ran.has(src) || ran.has(s.src)) return null;
      ran.add(s.src);
      s.__slDrawn = true;
      return s;
    }
    var n = document.importNode(b, true);
    markAll(n);
    return n;
  };
  var relayoutNode = function (live, a, b) {
    if (a.nodeType === 3) { if (live.data !== b.data) live.data = b.data; return true; }
    if (isMark(a)) return true;
    var tag = a.tagName;
    /* A stylesheet's new address: the old one is let go once the new has loaded, so nothing shows unstyled (a font changed). */
    if (tag === "LINK" && /stylesheet/i.test(b.getAttribute("rel") || "") && a.getAttribute("href") !== b.getAttribute("href")) {
      var nl = document.importNode(b, false);
      nl.__slDrawn = true;
      live.removeAttribute("data-sl-d");
      live.__slDrawn = false;
      var gone = function () { live.remove(); };
      nl.addEventListener("load", gone, { once: true });
      nl.addEventListener("error", gone, { once: true });
      setTimeout(gone, 3000);
      live.after(nl);
      return true;
    }
    attrsBetween(live, attrMap(a), attrMap(b));
    if (tag === "STYLE" || tag === "TITLE" || tag === "TEXTAREA") {
      if (a.textContent !== b.textContent) { live.__slText = undefined; live.textContent = b.textContent; }
      return true;
    }
    return relayoutIn(live, drawnKids(a), drawnKids(b), liveKids(live));
  };
  var relayoutIn = function (parent, A, B, live) {
    var map = counterparts(A, live);
    if (!map) return false;
    var ops = alignLists(A, B);
    if (!ops) { layoutWhy = "too long"; return false; }
    var cursor = null, later = [];
    for (var k = 0; k < ops.length; k++) {
      var o = ops[k];
      if (o.a >= 0 && o.b >= 0) {
        var l = map[o.a];
        if (l && !o.same && !relayoutNode(l, A[o.a], B[o.b])) return false;
        if (l) cursor = l;
      } else if (o.a >= 0) {
        var g = map[o.a];
        if (g && !isMark(A[o.a])) later.push(g.remove.bind(g));
      } else {
        var n = laidNew(B[o.b]);
        if (!n) continue;
        later.push((function (n, after) { return function () { if (after && after.parentNode === parent) after.after(n); else parent.insertBefore(n, parent.firstChild); }; })(n, cursor));
        cursor = n;
      }
    }
    later.forEach(function (f) { f(); });
    return true;
  };
  var relayout = function (lay) {
    var parse = function (html) { var t = document.createElement("template"); t.innerHTML = html; return drawnKids(t.content); };
    if (lay.head) {
      var liveHead = Array.prototype.filter.call(document.head.children, function (x) { return x.tagName === "SCRIPT" ? x.__slDrawn === true : x.hasAttribute("data-sl-d"); });
      if (!relayoutIn(document.head, parse(lay.head[0].join("")), parse(lay.head[1].join("")), liveHead)) return false;
    }
    if (lay.body && !relayoutIn(document.body, parse(lay.body[0]), parse(lay.body[1]), liveKids(document.body))) return false;
    /* For a theme's code that binds what the layout holds once, at its start: the layout changed under it. */
    try { document.dispatchEvent(new CustomEvent("storelib:layout-change", { detail: { head: !!lay.head, body: !!lay.body } })); } catch (e) {}
    return true;
  };
  var groupOf = function (el) { var m = /shopify-section-group-([a-z0-9_-]+)/i.exec(el.className || ""); return m ? m[1] : ""; };
  var fresh = function (html, sheets) {
    var tpl = document.createElement("template");
    tpl.innerHTML = html;
    var el = tpl.content.firstElementChild;
    if (!el) return null;
    Array.prototype.slice.call(el.querySelectorAll('link[rel="stylesheet"][href]')).forEach(function (l) { keep(l.href, sheets ? sheets[l.getAttribute("href")] : undefined); l.remove(); });
    return el;
  };
  /*
    ═══════════════════════════════════════════════════════════════════════
     A SECTION ADDED ARRIVES WITH ITS STYLES, AND THE PAGE MAKES ROOM
    ═══════════════════════════════════════════════════════════════════════
    The owner: "After I click it, it goes into the canvas with no delay, no
    bump, no glitch, no flash." Measured (scripts/check-section-insert-
    smooth.mjs) on a theme whose sections link their own stylesheet, as
    Dawn's do: the section went in before its stylesheet had loaded and was
    on screen unstyled for up to 27 frames, then grew by 900px when the file
    came; every section under it was pushed down by its height in one frame
    (a layout shift of 0.3 to 1.2); and the glide to it went to the wrong
    place (A STICKY HEADER, below).

    Now a section new to the page waits for its stylesheets before it goes
    in: the builder hands over the text of the ones in the theme's files
    (keep, above), so that wait is nothing, and only a stylesheet from
    elsewhere is waited for. And a section the builder says is arriving
    (added from the library: "reveal" with arrival) is played in as a
    Storelib theme's canvas plays it (lib/website-builder/section-arrival.ts,
    the same times and curve): the sections below it start where they were
    and slide to their new place by transform, it fades up underneath them,
    and the page scrolls, once and smoothly, only when its top is not on
    screen already. Transform and opacity only; nothing moves with reduced
    motion, and a scroll there is instant.
  */
  var ARRIVE_MS = 460, ARRIVE_SCROLL_MS = 320, ARRIVE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  var arriving = {};
  var sheetsReady = function (m) {
    var waits = [];
    (m.order || []).forEach(function (it) {
      if (!it.html || document.getElementById("shopify-section-" + it.id)) return;
      var tp = document.createElement("template");
      tp.innerHTML = it.html;
      Array.prototype.forEach.call(tp.content.querySelectorAll('link[rel="stylesheet"][href]'), function (l) { waits.push(keep(l.href, m.sheets ? m.sheets[l.getAttribute("href")] : undefined)); });
    });
    return waits.length ? Promise.all(waits) : null;
  };
  var pageTops = function () {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll(".shopify-section"), function (x) { if (x.id) out[x.id] = x.getBoundingClientRect().top + scrollY; });
    return out;
  };
  var arrive = function (el, before) {
    var still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cover = coverBottom();
    var r = el.getBoundingClientRect();
    var scrolls = false;
    /* Its top on screen, below a sticky header, with room to see that something is there: the page stays where it is. */
    if (!(r.top >= cover && r.top <= innerHeight - Math.min(140, (innerHeight - cover) * 0.25))) {
      var top = Math.max(0, Math.round(r.top + scrollY - cover - 16));
      if (Math.abs(scrollY - top) > 4) { scrollTo({ top: top, behavior: still ? "auto" : "smooth" }); scrolls = true; }
    }
    if (still || !el.animate) return;
    var delay = scrolls ? ARRIVE_SCROLL_MS : 0;
    var all = Array.prototype.slice.call(document.querySelectorAll(".shopify-section"));
    var reach = scrollY + innerHeight * 2;
    all.slice(all.indexOf(el) + 1).forEach(function (f) {
      var was = before[f.id];
      /* An overlay group's section (a pop-up, a bar fixed to the foot) is not in the page's flow: a transform would carry what it fixes. */
      if (was === undefined || /shopify-section-group-overlay/.test(f.className || "")) return;
      var now = f.getBoundingClientRect().top + scrollY;
      var d = was - now;
      if (Math.abs(d) < 1 || Math.min(was, now) > reach) return;
      var cs = getComputedStyle(f);
      if (cs.position === "fixed" || cs.position === "sticky") return;
      f.animate([{ transform: "translate3d(0, " + d + "px, 0)" }, { transform: "translate3d(0, 0, 0)" }], { duration: ARRIVE_MS, delay: delay, easing: ARRIVE_EASE, fill: "backwards" });
    });
    el.setAttribute("data-sl-arrival", "playing");
    var a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ARRIVE_MS, delay: delay, easing: ARRIVE_EASE, fill: "backwards" });
    a.finished.then(function () { el.setAttribute("data-sl-arrival", "done"); }, function () { el.setAttribute("data-sl-arrival", "done"); });
  };
  /* Said before the section is drawn; kept until the patch that puts it in. Not drawn here in time (a page drawn again behind this one), it is glided to as before. */
  var expectArrival = function (id) {
    if (!id) return;
    if (document.getElementById("shopify-section-" + id)) { queue = queue.then(function () { revealSection(id); }).catch(function () {}); return; }
    clearTimeout(arriving[id]);
    arriving[id] = setTimeout(function () { delete arriving[id]; revealSection(id); }, 4000);
  };
  /*
    A section new to the page runs its own scripts once, as it would have had
    the page been drawn with it. Once: a script that already ran (the page's
    own, or a section's brought back by undo) is not run again, since a
    theme's top level const would be declared twice.
  */
  var ran = new Set();
  document.querySelectorAll("script").forEach(function (x) { ran.add(x.src || x.textContent); });
  /*
    A SECTION DRAWN AGAIN RUNS ITS OWN INLINE SCRIPTS AGAIN (round 66), as
    Shopify's editor does. Night shop's sky reads its settings from data-
    attributes in a script whose text never changes, and moves its layer out
    of the section to the back of the page. Drawn again, the new layer stayed
    in the section, never drawn, over every section below the announcement
    bar, because a script whose text had run once was never run again. Now
    an inline script of the section is run again (again = true): inside a
    block, so a top level const is not declared twice, and caught, so a
    custom element defined twice says nothing. What its last run added to
    window and document (listeners, intervals; CANVAS_SCRIPT_OWN) is taken
    off first, so nothing answers twice. A script with an address still
    runs once.
  */
  var JS_TYPE = /^(|text\\/javascript|application\\/javascript|module)$/i;
  var runScripts = function (el, again) {
    el.querySelectorAll("script").forEach(function (old) {
      var key = old.src || old.textContent;
      var type = (old.getAttribute("type") || "").trim();
      var rerun = !!again && !old.src && JS_TYPE.test(type) && /\\S/.test(key) && ran.has(key);
      if (ran.has(key) && !rerun) return;
      ran.add(key);
      var s = document.createElement("script");
      Array.prototype.slice.call(old.attributes).forEach(function (a) { s.setAttribute(a.name, a.value); });
      if (rerun) {
        var own = window.__slOwn, mine = own && own.get(key);
        if (mine) {
          own.delete(key);
          mine.forEach(function (r) { try { if (r[0] === null) clearInterval(r[1]); else r[0].removeEventListener(r[1], r[2], r[3]); } catch (e) {} });
        }
        s.__slKey = key;
        s.textContent = /^module$/i.test(type) ? key : "{try{" + key + "\\n}catch(e){}}";
      } else s.textContent = old.textContent;
      old.replaceWith(s);
    });
  };
  /* A section new to the page goes in with its stylesheets applied (A SECTION ADDED ARRIVES): waited for here, the whole patch at once after. */
  var patch = function (m) {
    var ready = sheetsReady(m);
    return ready ? ready.then(function () { return patchNow(m); }) : patchNow(m);
  };
  var patchNow = function (m) {
    /* The layout around the sections first (THE LAYOUT AROUND THE SECTIONS): a page that no longer matches its drawing is drawn again. */
    if (m.layout) {
      var laidOut = false;
      try { laidOut = relayout(m.layout); } catch (err) { laidOut = false; }
      if (!laidOut) return reload("layout: " + layoutWhy);
      if (watcher) watcher.takeRecords();
      lockSoon();
    }
    if (m.styles) {
      /* The page's own stylesheets as drawn (compat-canvas.tsx markDrawnStyles), not one a script added since. */
      var mine = Array.prototype.slice.call(document.head.querySelectorAll("style[data-sl-d]"));
      if (mine.length !== m.styles.length) return reload("styles");
      /* A style already showing the text (written into its rules while a finger was down) is left as it is. */
      mine.forEach(function (x, i) { if (textOf(x) !== m.styles[i]) { x.__slText = undefined; x.textContent = m.styles[i]; } });
    }
    /* The head's meta and links as drawn (a theme's colour in its theme-color, a font's preload), changed where they are. A stylesheet's link is let go of once the new one has loaded, so nothing shows unstyled. */
    if (m.headNodes) {
      var nodes = Array.prototype.filter.call(document.head.children, function (x) { return x.hasAttribute("data-sl-d") && x.tagName !== "STYLE" && x.tagName !== "SCRIPT" && !x.hasAttribute("data-storelib-font"); });
      if (nodes.length !== m.headNodes.length) return reload("head");
      nodes.forEach(function (x, i) {
        if (x.outerHTML === m.headNodes[i]) return;
        var tp = document.createElement("template");
        tp.innerHTML = m.headNodes[i];
        var y = tp.content.firstElementChild;
        if (!y) return;
        if (x.tagName === "LINK" && y.tagName === "LINK" && /stylesheet/i.test(x.getAttribute("rel") || "")) {
          x.removeAttribute("data-sl-d");
          var gone = function () { x.remove(); };
          y.addEventListener("load", gone, { once: true });
          y.addEventListener("error", gone, { once: true });
          x.after(y);
        } else x.replaceWith(y);
      });
    }
    /* The layout's own <style>s in the body, around the sections: as drawn, not one a script added since. */
    if (m.bodyStyles) {
      var inBody = Array.prototype.filter.call(document.body.querySelectorAll("style"), function (x) { return x.__slDrawn === true; });
      if (inBody.length !== m.bodyStyles.length) return reload("body styles");
      inBody.forEach(function (x, i) { if (textOf(x) !== m.bodyStyles[i]) { x.__slText = undefined; x.textContent = m.bodyStyles[i]; } });
    }
    if (m.fonts) {
      /* Where the drawn ones stand, marked as drawn, so the head still reads as drawn for a layout change after it (relayout); the old let go once the new has loaded. */
      var have = Array.prototype.slice.call(document.querySelectorAll("link[data-storelib-font]"));
      var fontAt = have[0] || null, newFonts = [];
      m.fonts.forEach(function (href) {
        if (have.some(function (l) { return l.getAttribute("href") === href; })) return;
        var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.setAttribute("data-sl-d", ""); l.setAttribute("data-storelib-font", "");
        if (fontAt) fontAt.before(l); else document.head.appendChild(l);
        newFonts.push(l);
      });
      var stale = have.filter(function (l) { return m.fonts.indexOf(l.getAttribute("href")) === -1; });
      /* On their way out: no longer what was drawn. */
      stale.forEach(function (l) { l.removeAttribute("data-sl-d"); });
      var letGoFonts = function () { stale.forEach(function (l) { l.remove(); }); };
      if (!newFonts.length) letGoFonts();
      else { var left = newFonts.length; newFonts.forEach(function (l) { var one = function () { if (--left === 0) letGoFonts(); }; l.addEventListener("load", one, { once: true }); l.addEventListener("error", one, { once: true }); }); setTimeout(letGoFonts, 3000); }
    }
    setAttrs(document.documentElement, m.htmlAttrs, m.htmlFrom);
    setAttrs(document.body, m.bodyAttrs, m.bodyFrom);
    (m.remove || []).forEach(function (id) {
      var el = document.getElementById("shopify-section-" + id);
      if (!el) return;
      fire(el, "shopify:section:unload", { sectionId: id, load: true });
      el.remove();
      delete drawn[id];
      lockSoon();
    });
    /* A selected section taken off keeps its selection: shown again, it is outlined again and the toolbar comes back to it. */
    reportSoon();
    if (!m.order) { orderSettled(); return; }
    var y = scrollY;
    var byId = function (id) { return document.getElementById("shopify-section-" + id); };
    var added = [];
    /* Where everything was, for a section arriving (A SECTION ADDED ARRIVES): read before anything moves. */
    var tops = m.order.some(function (x) { return arriving[x.id] && !byId(x.id); }) ? pageTops() : null;
    for (var i = 0; i < m.order.length; i++) {
      var it = m.order[i];
      var el = byId(it.id);
      if (!el) {
        if (!it.html) return reload("missing " + it.id);
        el = fresh(it.html, m.sheets);
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
      runScripts(el, true);
      fire(el, "shopify:section:load", { sectionId: id, load: true });
      fire(el, "storelib:section-load", { sectionId: id });
      wake(el);
      rewatch([], el);
    });
    if (scrollY !== y) scrollTo(0, y);
    if (tops) added.forEach(function (el) {
      var id = el.getAttribute("data-section-id") || el.id.slice(16);
      if (!arriving[id]) return;
      clearTimeout(arriving[id]);
      delete arriving[id];
      arrive(el, tops);
    });
    /* The drag's slides, if any, against the page as it is now (THE PATCH IS WHAT THE PAGE IS). */
    orderSettled();
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
    showGap(null);
    fadeBoxes(false);
    var still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    letGo = setTimeout(function () { if (!inspect) { unmark(); redraw(); reportSoon(); } }, still ? 0 : 200);
  };
  /* When the person last moved the page themselves (a wheel, a finger, a key): Date.now(), as the builder's clock reads it. */
  var personScrolledAt = 0;
  var personScrolls = function () { personScrolledAt = Date.now(); };
  addEventListener("wheel", personScrolls, { passive: true, capture: true });
  addEventListener("touchmove", personScrolls, { passive: true, capture: true });
  addEventListener("keydown", function (e) { if (/^(Arrow(Up|Down)|Page(Up|Down)|Home|End| )$/.test(e.key)) personScrolls(); }, true);
  /*
    A STICKY HEADER: how much of the top of the page it covers. Only a bar
    that is painted counts: the header group's children include the menu
    drawer and the search overlay, fixed to the whole window and hidden until
    opened, and those were taken for a header as tall as the window, so a
    section added was glided to 850px above itself, off screen (scripts/
    check-section-insert-smooth.mjs, Materia's drawer).
  */
  var coverBottom = function () {
    var cover = 0;
    var tops = document.querySelectorAll(".shopify-section-group-header-group, .shopify-section-group-header-group > *, header");
    for (var i = 0; i < tops.length; i++) {
      var cs = getComputedStyle(tops[i]);
      if (cs.position !== "sticky" && cs.position !== "fixed") continue;
      if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
      var r = tops[i].getBoundingClientRect();
      if (r.top > 1 || r.bottom <= 0 || r.height === 0 || r.height > innerHeight * 0.4) continue;
      cover = Math.max(cover, r.bottom);
    }
    return cover;
  };
  var revealSection = function (id) {
    if (!id) return;
    var tries = 0;
    var go = function () {
      var el = document.getElementById("shopify-section-" + id) || document.querySelector('[data-section-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (!el) { if (++tries < 10) setTimeout(go, 120); return; }
      var top = Math.max(0, el.getBoundingClientRect().top + scrollY - coverBottom() - 16);
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
  /*
    ROUND BC: A SECTION DRAGGED IN THE BUILDER'S SIDEBAR, SHOWN WHERE IT WOULD
    GO while the finger is down (lib/website-builder/live-order.ts, the same
    thing for Storelib's own canvas). Each section's box slides by transform
    to the order asked for, nothing is moved in the page and no script of the
    theme's hears anything; the one being moved wears a quiet ring. Let go,
    the boxes stay put until the builder's patch has the sections in that
    order (its "order", above), and are let go in that moment; put back, they
    slide home.
  */
  var ordered = { held: {}, ids: null, lifted: null, live: false, mo: null, t: 0, home: [] };
  var orderEl = function (id) { return document.getElementById("shopify-section-" + id); };
  var orderLetGo = function (h) {
    if (h.style === null) h.el.removeAttribute("style"); else h.el.setAttribute("style", h.style);
    h.el.removeAttribute("data-sl-order-lifted");
  };
  var orderStop = function () { if (ordered.mo) ordered.mo.disconnect(); ordered.mo = null; clearTimeout(ordered.t); };
  var orderRelease = function () { orderStop(); for (var k in ordered.held) orderLetGo(ordered.held[k]); ordered.held = {}; };
  var orderInPlace = function (ids) {
    var prev = null;
    for (var i = 0; i < ids.length; i++) {
      var el = orderEl(ids[i]);
      if (!el) continue;
      if (prev && !(prev.compareDocumentPosition(el) & 4)) return false;
      prev = el;
    }
    return true;
  };
  var previewOrder = function (m) {
    var still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var slide = "transform 220ms cubic-bezier(0.2, 0, 0, 1)";
    ordered.live = !!m.ids;
    if (!m.ids) {
      var ids = ordered.ids;
      if (m.end === "commit" && ids) {
        for (var k0 in ordered.held) ordered.held[k0].el.removeAttribute("data-sl-order-lifted");
        if (orderInPlace(ids)) { orderRelease(); return; }
        var first = null;
        for (var k1 in ordered.held) { first = ordered.held[k1].el; break; }
        if (!first || !first.parentElement || typeof MutationObserver === "undefined") { orderRelease(); return; }
        orderStop();
        ordered.mo = new MutationObserver(function () { if (orderInPlace(ids)) orderRelease(); });
        ordered.mo.observe(first.parentElement, { childList: true });
        /* A patch that never comes (the page drawn again instead): let go anyway. */
        ordered.t = setTimeout(orderRelease, 4000);
        return;
      }
      var home = [];
      for (var k2 in ordered.held) { var h0 = ordered.held[k2]; home.push(h0); h0.el.removeAttribute("data-sl-order-lifted"); h0.el.style.transition = still ? "none" : slide; h0.el.style.transform = "translate3d(0, 0, 0)"; }
      ordered.held = {};
      ordered.home = home;
      setTimeout(function () { if (ordered.home !== home) return; home.forEach(orderLetGo); ordered.home = []; }, still ? 0 : 240);
      return;
    }
    ordered.home.forEach(orderLetGo);
    ordered.home = [];
    orderStop();
    ordered.ids = m.ids;
    ordered.lifted = m.lifted || null;
    var els = [];
    for (var i = 0; i < m.ids.length; i++) { var el = orderEl(m.ids[i]); if (el) els.push(el); }
    if (els.length < 2) return;
    var parent = els[0].offsetParent;
    for (var j = 0; j < els.length; j++) if (els[j].offsetParent !== parent) return;
    /* Each takes the room it has now: its height and the space after it (live-order.ts orderShifts). */
    var rows = els.map(function (x) { return { id: x.getAttribute("data-section-id") || x.id.slice(16), el: x, top: x.offsetTop, h: x.offsetHeight }; });
    rows.sort(function (a, b) { return a.top - b.top; });
    var gap = {}, byId = {};
    rows.forEach(function (r, n) { var nx = rows[n + 1]; gap[r.id] = nx ? Math.max(0, nx.top - (r.top + r.h)) : (n > 0 ? gap[rows[n - 1].id] : 0); byId[r.id] = r; });
    var y = rows[0].top, liftedEl = null, liftedMove = 0;
    for (var q = 0; q < m.ids.length; q++) {
      var r = byId[m.ids[q]];
      if (!r) continue;
      var dy = y - r.top;
      y += r.h + gap[r.id];
      var held = ordered.held[r.id];
      if (!held) { held = ordered.held[r.id] = { el: r.el, style: r.el.getAttribute("style"), shift: 0 }; r.el.style.willChange = "transform"; }
      if (r.id === m.lifted) { liftedEl = r.el; liftedMove = dy - held.shift; }
      held.shift = dy;
      r.el.style.transition = still ? "none" : slide;
      r.el.style.transform = "translate3d(0, " + dy + "px, 0)";
      if (r.id === m.lifted) r.el.setAttribute("data-sl-order-lifted", ""); else r.el.removeAttribute("data-sl-order-lifted");
    }
    /* Its new place in sight, moving the page only as far as it needs. */
    /* Not for the same order worked out again under a patch (orderSettled): the section has not moved on screen. */
    if (liftedEl && liftedMove && !m.relaid) {
      var b = liftedEl.getBoundingClientRect();
      var top = b.top + liftedMove;
      var bottom = top + Math.min(b.height, innerHeight * 0.6);
      var by = top < 0 ? top - 24 : bottom > innerHeight ? bottom - innerHeight + 24 : 0;
      if (by) scrollBy({ top: by, left: 0, behavior: still ? "auto" : "smooth" });
    }
  };
  /*
    THE PATCH IS WHAT THE PAGE IS (rel2). The slides above lean on the
    builder's two messages arriving in a given order, the drop and then the
    patch, and on the drop arriving at all. A patch first moved the sections
    under slides still worked out for where they were: the page showed an
    order nobody asked for until the drop came. A drop never heard (the
    builder's frame between its refs as the canvas drew again) left them
    there for good, the canvas wrong until a reload. And a second drag, its
    slides worked out before the first drag's patch, was shown scrambled
    once that patch moved the sections under it.

    So once a patch has put its sections in place: when they are in the
    order the slides show, the slides have nothing left to show and are let
    go, in the same task as the move; while a finger still holds a section
    in another order, the slides are worked out again from where the
    sections are now. A drop on its way still finds the page in order.
  */
  var orderSettled = function () {
    if (!ordered.ids) return;
    var any = false;
    for (var k in ordered.held) { any = true; break; }
    if (!any) return;
    if (orderInPlace(ordered.ids)) { orderRelease(); return; }
    if (ordered.live) { try { previewOrder({ ids: ordered.ids, lifted: ordered.lifted, relaid: true }); } catch (err) { orderRelease(); } }
  };
  window.addEventListener("message", function (e) {
    if (window.__slFrom && e.origin !== window.__slFrom) return;
    var m = e.data;
    if (!m || m.storelib !== 1) return;
    if (m.type === "hold-view") { holdView(!!m.on); return; }
    /*
      THE THEME'S SETTINGS THAT CHANGED, SAID ONCE THE PAGE IS SEEN (round
      27). A theme setting draws the page again behind itself, where it was
      scrolled to, and what is on screen there is shown at once (canvas-
      network.ts, instant). So a change to how sections arrive (Animations)
      could never be seen without scrolling away and back. The canvas tells
      the page in front which settings changed once it is in front and
      still, as storelib:theme-change, after the page's own settling is over;
      a theme that wants to show such a change (Materia plays the reveals on
      screen again) does, and a theme that does not listen is untouched.
    */
    if (m.type === "theme-changed") {
      var changedSettings = m.settings && typeof m.settings === "object" ? m.settings : {};
      requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(function () {
        try { document.dispatchEvent(new CustomEvent("storelib:theme-change", { detail: { settings: changedSettings } })); } catch (err) {}
      }, 120); }); });
      return;
    }
    /* After whatever was asked before it is on the page: a listener reads the page as it now is. */
    if (m.type === "settings") {
      /* A value under a finger, which the theme's script may write itself: the outlines follow it as they follow the builder's own (streaming). */
      if (m.live) streaming();
      queue = queue.then(function () {
        /*
          Cancelable (round BC): a theme's listener that has written a
          section's value itself calls preventDefault(), and the builder
          stops drawing that section for each value while the finger moves
          (compat-canvas.tsx, APPLIED BY THE THEME).
        */
        try {
          var ev = new CustomEvent("storelib:settings-change", { cancelable: true, detail: m.section ? { settings: m.settings || {}, live: !!m.live, section: String(m.section) } : { settings: m.settings || {}, live: !!m.live } });
          document.dispatchEvent(ev);
          if (ev.defaultPrevented && m.section) post({ type: "settings-applied", section: String(m.section), keys: Object.keys(m.settings || {}) });
        } catch (err) {}
      }).catch(function () {});
      return;
    }
    if (m.type === "patch" || m.type === "edits" || m.type === "section") holdStill();
    if (m.type === "patch") {
      /* After the section swaps already asked for, in order. */
      queue = queue.then(function () { return bounded(Promise.resolve(patch(m)), "patch").then(function () { holdStill(true); }); }).catch(function (err) { reload(String(err)); });
    } else if (m.type === "edits") {
      /* A theme value under a finger, written in every place the page prints it (live-draw.ts placeEdits); a place not found asks for the page to be drawn. */
      queue = queue.then(function () {
        var ok = (m.edits || []).every(function (e) { try { return editAnywhere(e); } catch (err) { return false; } });
        holdStill(true);
        if (watcher) watcher.takeRecords();
        streaming();
        reportSoon();
        if (!ok) post({ type: "edits-failed", key: m.key });
      }).catch(function () {});
    } else if (m.type === "section" && m.cut) {
      /*
        A CUT, NOT THE MARKUP (live-draw.ts cutBetween): the section's new
        drawing is made from the one held here. Every cut is made, in order,
        each one costing next to nothing; one that does not fit what is held
        asks for the section whole.
      */
      queue = queue.then(function () {
        var before = drawn[m.id];
        var c = m.cut;
        if (typeof before !== "string" || before.length !== c.len) { post({ type: "resend", id: m.id }); return; }
        var html = before.slice(0, c.at) + c.put + before.slice(c.at + c.cut);
        var done = false;
        if (m.edit) { try { done = edit(m.id, m.edit, html); } catch (err) { done = false; } }
        if (!done) { try { done = restyle(m.id, html, before); } catch (err) { done = false; } }
        if (!done) { try { done = morph(m.id, html, before); } catch (err) { done = false; } }
        if (!done) return bounded(Promise.resolve(swap(m.id, html, before)), "section").then(function () { sectionLoaded(m.id); });
        sectionLoaded(m.id);
      }).then(stillNow).catch(function () {});
    } else if (m.type === "section") {
      /* In order: a swap that waits for a stylesheet holds the ones after it. Changed in place when it can be (morph); only the newest of a burst is drawn (a cut after it is made from it, so it is never the one skipped). */
      var n = (asked[m.id] = (asked[m.id] || 0) + 1);
      queue = queue.then(function () {
        if (asked[m.id] !== n) return;
        var done = false;
        restartIn = m.now ? 0 : 700;
        try { done = restyle(m.id, m.html, m.prev); } catch (err) { done = false; }
        if (!done) try { done = morph(m.id, m.html, m.prev); } catch (err) { done = false; }
        restartIn = 700;
        if (!done) return bounded(Promise.resolve(swap(m.id, m.html, m.prev)), "section").then(function () { sectionLoaded(m.id); });
        sectionLoaded(m.id);
      }).then(stillNow).catch(function () {});
    } else if (m.type === "preview-order") {
      try { previewOrder(m); } catch (err) { orderRelease(); }
    } else if (m.type === "select") {
      leaving = false;
      if ("inspect" in m) setInspect(m.inspect);
      /* Which levels of which sections take a block, for Add block between two blocks (round 12). */
      if ("levels" in m) blockLevels = m.levels && typeof m.levels === "object" ? m.levels : null;
      /* Off, nothing is outlined whatever was asked (setInspect takes the marks off after their fade); on, the same selection again is only outlined. */
      if (inspect) mark(m.sectionId || null, m.blockId || null, m.scroll !== false, (m.sectionId || null) === selected.section && (m.blockId || null) === selected.block);
    } else if (m.type === "reveal") {
      /* Round AH: a section just added, pasted or written by the AI, brought smoothly to the top, below a sticky header, once it is drawn. */
      /* Not when it comes at the end of a run the person scrolled away during (round 14): the page is where they took it. */
      if (typeof m.since === "number" && personScrolledAt >= m.since) return;
      /* Added from the library: played in by the patch that draws it, with the page making room (A SECTION ADDED ARRIVES). */
      if (m.arrival) { expectArrival(String(m.id || "")); return; }
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
    } else if (m.type === "scroll-by") {
      /* A wheel over the builder's toolbar, which stands over this page: the page scrolls as if the wheel were here. */
      if (typeof m.top === "number" && isFinite(m.top)) scrollBy({ top: m.top, left: 0 });
    } else if (m.type === "heal") {
      /* The builder brought this page to the front (its first paint, a page drawn again behind): a hold with nothing open is let go now (A PAGE HELD STILL). */
      checkLock();
      stalledLoaders();
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
  /*
    WHERE THE PAGE STANDS, ONCE IT STANDS (round 14): said 100ms after the
    last scroll event, with a bounded heartbeat during the gesture. Sending
    every frame made the editor process a stream of messages on its own
    thread (51 in a wheel down the owner's home page). The heartbeat now
    carries the known offset without measuring any boxes.
  */
  /* Keep the parent gesture alive between messages (SCROLL_REST_MS is 120ms).
     Half-second heartbeats left gaps that let a push redraw under a moving finger.
     Only the known offset is sent; no layout is measured here. */
  var scrolledTimer = 0, scrollingSaid = 0;
  addEventListener("scroll", function () {
    var t = Date.now();
    if (t - scrollingSaid > 60) { scrollingSaid = t; post({ type: "scrolling", scrollY: scrollY }); }
    clearTimeout(scrolledTimer);
    scrolledTimer = setTimeout(function () { post({ type: "scrolled", scrollY: scrollY }); }, 100);
  }, { passive: true });
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
  var post = function (m) { m.storelib = 1; try { parent.postMessage(m, window.__slTo || "*"); } catch (e) {} };
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
    try { url = new NativeURL(raw, baseUrl); } catch (e) { return null; }
    if (url.protocol === "about:") return pagePath + url.search;
    var home;
    try { home = new NativeURL(baseUrl); } catch (e) { return null; }
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

    AND AN ADDRESS OF THIS WEBSITE IS ON THIS PAGE'S ORIGIN (round 51). A
    theme that checks a form posts to its own site before sending it
    (Materia's newsletter: new URL(form.action).origin !== location.origin)
    met the builder's origin on one side and "null" on the other, refused
    to send, and said "That did not go through. Check your connection" in
    the editor on every press. An address on the builder's origin is this
    page's own address here, so its origin reads as this page's, "null".
    The bridge's own routing reads the real one (NativeURL, above).
  */
  var NativeURL = window.URL;
  var fixBase = function (b) { var s = String(b); return s === "null" || s.indexOf("about:") === 0 ? baseUrl : b; };
  var homeOrigin = null;
  try { homeOrigin = new NativeURL(baseUrl).origin; } catch (e) {}
  var pageOrigin = "";
  try { pageOrigin = String(location.origin); } catch (e) {}
  try {
    window.URL = class extends NativeURL {
      constructor(u, b) { if (arguments.length > 1 && b !== undefined) super(u, fixBase(b)); else super(u); }
      get origin() { var o = super.origin; return pageOrigin === "null" && homeOrigin && o === homeOrigin ? "null" : o; }
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
    NOTHING A SCRIPT OPENS LEAVES THE CANVAS (round 66). "storelib.com
    refused to connect" was this frame gone to an address of the builder's
    own host or of the live website, both of which refuse to be framed. Two
    ways a theme's script opens a page are taken here and opened as the
    builder opens a link: window.open into this same frame (_self, _parent,
    _top), and a link the script makes and clicks without putting it in the
    page, whose click no listener of the document hears. A new tab is left
    to the browser. location.href cannot be taken from inside a frame with no
    origin; the builder hides the frame as it goes (unloading, below) and
    draws the page again.
  */
  var openNative = window.open;
  window.open = function (u, target) {
    var t = String(target === undefined || target === null ? "" : target).toLowerCase();
    if ((t === "_self" || t === "_parent" || t === "_top") && u !== undefined && u !== null && String(u) !== "") {
      var href = String(u);
      var path = routed(href);
      post({ type: "navigate", href: path !== null ? path : href, chrome: false });
      return null;
    }
    return openNative.apply(window, arguments);
  };
  var clickNative = typeof HTMLAnchorElement !== "undefined" ? HTMLAnchorElement.prototype.click : null;
  if (clickNative) HTMLAnchorElement.prototype.click = function () {
    var raw = this.getAttribute("href");
    if (!this.isConnected && raw && !this.hasAttribute("download") && !/^(blob|data|javascript|mailto|tel):/i.test(raw) && raw.charAt(0) !== "#") {
      var tg = String(this.getAttribute("target") || "").toLowerCase();
      if (tg !== "_blank") {
        var path = routed(raw);
        post({ type: "navigate", href: path !== null ? path : this.href, chrome: false });
        return;
      }
    }
    return clickNative.apply(this, arguments);
  };
  /* Said before the page goes, while this window is still the frame's (pagehide is heard from a window the builder no longer knows): the builder hides the frame at once, so whatever answers in its place is never seen. */
  addEventListener("beforeunload", function () { post({ type: "unloading" }); });
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
    if (window.__slFrom && e.origin !== window.__slFrom) return;
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
 *   nothing eases: a transition or an entrance that starts on something on
 *   screen is taken to its end before the frame is drawn (checked after
 *   each layout, a ResizeObserver on a mark of our own; not a rule over the
 *   whole page, which restyled all of Dawn at the press), so what was shown
 *   stays shown and nothing fades;
 *   the pictures near the top of the page, for both widths, are preloaded by
 *   the page itself before they are needed (once the page is idle),
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
  var began = null, quieted = false, mark = null, ro = null, flip = 0, looping = false, afterFrames = 0;
  var inView = function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  var finishNew = function () {
    if (began === null || !document.getAnimations) return;
    document.getAnimations().forEach(function (a) {
      var t = a.effect && a.effect.target;
      if (!t || !t.getBoundingClientRect || (t.closest && t.closest("[data-sl-box]")) || (t.getRootNode && t.getRootNode() !== document)) return;
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
    var vh = innerHeight || 800, take = [];
    // Measure the whole set before changing content-visibility. Interleaving
    // these reads and writes laid out a long theme once for every section.
    document.querySelectorAll(".shopify-section").forEach(function (s) {
      if (s.parentElement && s.parentElement.closest(".shopify-section")) return;
      var r = s.getBoundingClientRect();
      if (r.top < vh * 2 || r.height < 2 || s.style.contentVisibility) return;
      var first = s.firstElementChild;
      if (first && /fixed|sticky/.test(getComputedStyle(first).position)) return;
      take.push({ section: s, height: r.height });
    });
    take.forEach(function (item) {
      var s = item.section;
      s.style.containIntrinsicHeight = Math.round(item.height) + "px";
      s.style.contentVisibility = "hidden";
      held.push(s);
    });
  };
  var releaseNear = function (all) {
    var vh = innerHeight || 800, release = [];
    held = held.filter(function (s) {
      if (!all && s.isConnected && s.getBoundingClientRect().top > vh * 1.5) return true;
      release.push(s);
      return false;
    });
    // Removing containment changes layout too: finish all measurements first.
    release.forEach(function (s) {
      s.style.removeProperty("content-visibility");
      s.style.removeProperty("contain-intrinsic-height");
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
    if (yes && !quieted) {
      quieted = true;
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
    } else if (!yes && quieted) {
      lifted.forEach(function (img) { img.style.removeProperty("opacity"); });
      lifted = [];
      shown.clear();
      quieted = false;
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
  /*
    NOT WHILE THE PAGE IS SCROLLED (round 14). Every 2.5s the warm measured
    every section and put up to 40 preloads in the head, and a page busy
    scrolling a heavy theme has no idle time, so the 800ms timeout ran it in
    the middle of the scroll (scripts/check-wb-scroll-r14.mjs, 4x: 0.3s of
    forced layouts). A page scrolled in the last second and a half waits for
    the next round.
  */
  var scrolledAt = 0;
  add.call(W, "scroll", function () { scrolledAt = now(); }, { passive: true, capture: true });
  var stillPage = function () { return now() - scrolledAt > 1500; };
  var idle = function () {
    if (typeof W.requestIdleCallback === "function") W.requestIdleCallback(function () { if (stillPage()) warm(false, true); }, { timeout: 800 });
    else st.call(W, function () { if (stillPage()) warm(false, true); }, 300);
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
  A PRELOADER IS UNSEEN, NOT TAKEN OUT (round 1023). The theme's preloader
  and page transition overlay were display: none here, so the page did not
  wait behind them. But display: none also means no animation and no
  transition runs on them, so no animationend or transitionend ever comes,
  and a theme that holds the page still until its overlay has played
  (body.is-leaving { overflow: hidden }, the next page opened on
  animationend) held it for good: a link pressed in the canvas froze it
  (scripts/check-canvas-freeze.mjs, a page transition link pressed). They
  are hidden and their motion takes a millisecond, so every wait on them
  ends, at once.
*/
/*
  A CHOICE IN THE CANVAS WRITES NO ADDRESS. The page is a sandboxed frame
  with no origin of its own, where history.replaceState to
  "/products/x?variant=…" throws a SecurityError; Dawn writes the address
  before it updates the form, the price and the label, so in the canvas a
  chosen M stayed with S's price, id and label. pushState and replaceState
  keep the state and leave the address as it is when the browser refuses it.
*/
/*
  THE THEME IS NOT TOLD IT IS IN AN EDITOR BY ITS OWN GUESS (round 27). The
  canvas tells the theme it is on the website (theme.ts, themeDesignMode),
  yet a theme can still decide for itself that it is in an editor because it
  sits in a frame: Materia's editor-live-images before round 26 put
  shopify-design-mode on <html> whenever window.self !== window.top, and its
  animation.js then marked every reveal done at load, and its animation.css
  turned every reveal off under html.shopify-design-mode. Installed themes
  are the creators' own copies, so those sites kept that code: in the canvas
  nothing rose or faded in as it was scrolled to, while the website played
  all of it (scripts/check-canvas-reveal-r27.ts, an install from round 21).
  So, in the canvas only and only while the page has not been edited, the
  class a script puts on <html> by itself is taken off again (a page the
  server drew in design mode, a section preview, has it from the start and
  keeps it). From the first edit (storelib:settings-change or
  storelib:section-load, which a theme may answer by marking itself in an
  editor on purpose) the class stays as the theme puts it, exactly as before.
*/
export const CANVAS_DESIGN_GUARD = `<script>(function(){var de=document.documentElement;if(!de||de.classList.contains("shopify-design-mode")||typeof MutationObserver!=="function")return;var edited=false;var keep=function(){if(!edited&&de.classList.contains("shopify-design-mode"))de.classList.remove("shopify-design-mode")};new MutationObserver(keep).observe(de,{attributes:true,attributeFilter:["class"]});["storelib:settings-change","storelib:section-load"].forEach(function(n){document.addEventListener(n,function(){edited=true},true)})})();</script>`

/**
 * WHAT A SECTION'S OWN SCRIPT ADDED TO THE PAGE (round 66). While an inline
 * script inside a section runs, the listeners it adds to window and document
 * and the intervals it starts are noted under its text, so running it again
 * for a section drawn again (runScripts, A SECTION DRAWN AGAIN) first takes
 * its earlier ones away. Only what the script does as it runs is seen: what
 * a callback adds later is the theme's own business, as on the website.
 */
export const CANVAS_SCRIPT_OWN = `<script>(function(){var own=new Map();window.__slOwn=own;var cur=function(){var s=document.currentScript;if(!s||s.src||!s.closest||!s.closest(".shopify-section"))return null;return s.__slKey||s.textContent};var note=function(r){var k=cur();if(k===null)return;var l=own.get(k);if(!l)own.set(k,l=[]);l.push(r)};var P=EventTarget.prototype,add=P.addEventListener;P.addEventListener=function(t,f,o){var me=this==null?window:this;if((me===window||me===document)&&f)note([me,t,f,o]);return add.apply(me,arguments)};var si=window.setInterval;window.setInterval=function(){var id=si.apply(window,arguments);note([null,id]);return id}})()</script>`

export const CANVAS_HEAD = `${CANVAS_DESIGN_GUARD}<script>addEventListener("pointerdown",function(){var g=window.__slGiveBack;if(g)g()},true);addEventListener("keydown",function(){var g=window.__slGiveBack;if(g)g()},true);</script><style data-sl-canvas>preload-page,.preload-page,website-intro,.website-intro,#preloader,.site-preloader,.page-loader,.page-loading-overlay{position:fixed!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;animation-duration:1ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:1ms!important;transition-delay:0s!important}preload-page *,.preload-page *,website-intro *,.website-intro *,#preloader *,.site-preloader *,.page-loader *,.page-loading-overlay *{visibility:hidden!important;animation-duration:1ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:1ms!important;transition-delay:0s!important}</style><script>(function(){var seed=window.__slSeed||{};function S(n){var m=new Map();var held=seed[n];if(held&&typeof held==="object")Object.keys(held).forEach(function(k){if(typeof held[k]==="string")m.set(k,held[k])});var t=0;var tell=function(){if(t)return;t=setTimeout(function(){t=0;var o={};m.forEach(function(v,k){o[k]=v});try{parent.postMessage({storelib:1,type:"storage",area:n,items:o},window.__slTo||"*")}catch(e){}},0)};return{get length(){return m.size},key:function(i){return Array.from(m.keys())[i]??null},getItem:function(k){return m.has(String(k))?m.get(String(k)):null},setItem:function(k,v){m.set(String(k),String(v));tell()},removeItem:function(k){m.delete(String(k));tell()},clear:function(){m.clear();tell()}}}
["localStorage","sessionStorage"].forEach(function(n){var ok=false;try{ok=!!window[n]}catch(e){ok=false}if(!ok){try{Object.defineProperty(window,n,{value:S(n),configurable:true})}catch(e){}}});
try{document.cookie}catch(e){var jar=S("cookie");try{Object.defineProperty(document,"cookie",{get:function(){var o=[];for(var i=0;i<jar.length;i++){var k=jar.key(i);o.push(k+"="+jar.getItem(k))}return o.join("; ")},set:function(v){var parts=String(v).split(";"),first=parts.shift()||"",at=first.indexOf("=");if(at<1)return;var k=first.slice(0,at).trim(),val=first.slice(at+1).trim(),gone=false;parts.forEach(function(p){var q=p.split("="),n=(q[0]||"").trim().toLowerCase(),x=q.slice(1).join("=").trim();if(n==="max-age"&&Number(x)<=0)gone=true;if(n==="expires"){var t=Date.parse(x);if(!isNaN(t)&&t<=Date.now())gone=true}});if(gone)jar.removeItem(k);else jar.setItem(k,val)},configurable:true})}catch(e2){}}
if(typeof IntersectionObserver==="function"){var IO=IntersectionObserver,watching=new WeakMap(),bySig=new Map(),gone=new WeakSet();var sig=function(el){return el.tagName+"."+String(el.getAttribute("class")||"").split(/\\s+/).filter(Boolean).sort().join(".")};var W=class extends IO{observe(t){try{gone.delete(this);if(t&&t.nodeType===1&&t.closest&&t.closest(".shopify-section")){var by=watching.get(t);if(!by)watching.set(t,by=new Set());by.add(this);if(String(t.getAttribute("class")||"").trim()){var k=sig(t),set=bySig.get(k);if(!set)bySig.set(k,set=new Set());set.add(this)}}}catch(e){}return super.observe(t)}unobserve(t){try{var by=watching.get(t);if(by)by.delete(this)}catch(e){}return super.unobserve(t)}disconnect(){gone.add(this);var me=this;bySig.forEach(function(set){set.delete(me)});return super.disconnect()}};window.IntersectionObserver=W;window.__slIO=IO;window.__slWatch={watching:watching,bySig:bySig,usable:function(io){var r=io.root;return !gone.has(io)&&(!r||r.nodeType===9)}}}
["pushState","replaceState"].forEach(function(k){var f=history[k];if(typeof f!=="function")return;history[k]=function(s,t){try{return f.apply(this,arguments)}catch(e){try{return f.call(this,s,t)}catch(e2){}}}});})();</script>${CANVAS_SCRIPT_OWN}<script>${CANVAS_REQUESTS}</script><script>${CANVAS_SWITCH}</script>`
