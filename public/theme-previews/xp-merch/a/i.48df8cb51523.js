
  (function () {
    var root = document.getElementById('shopify-section-main');
    if (!root || root.__mpStickyBound) return;
    root.__mpStickyBound = true;
    (function () {
      var ALWAYS = "header.header[data-sticky='always']", watched = [];
      var attrs = window.MutationObserver ? new MutationObserver(check) : null;
      function check() {
        if (!root.isConnected) { if (attrs) attrs.disconnect(); if (tree) tree.disconnect(); return; }
        var on = !!(document.body && document.body.querySelector(ALWAYS));
        if (root.hasAttribute('data-mp-header-always') !== on) root.toggleAttribute('data-mp-header-always', on);
        if (!attrs) return;
        var headers = document.getElementsByTagName('header');
        var same = headers.length === watched.length;
        for (var i = 0; same && i < headers.length; i++) same = headers[i] === watched[i];
        if (same) return;
        attrs.disconnect();
        watched = Array.prototype.slice.call(headers);
        for (var j = 0; j < watched.length; j++) attrs.observe(watched[j], {attributes: true, attributeFilter: ['class', 'data-sticky']});
      }
      var tree = null;
      check();
      function arrived() {
        check();
        if (!window.MutationObserver) return;
        tree = new MutationObserver(function (records) {
          for (var i = 0; i < records.length; i++) {
            var nodes = [records[i].addedNodes, records[i].removedNodes];
            for (var k = 0; k < 2; k++) for (var n = 0; n < nodes[k].length; n++) {
              var el = nodes[k][n];
              if (el.nodeType === 1 && (el.localName === 'header' || el.getElementsByTagName('header').length)) return check();
            }
          }
        });
        tree.observe(document.documentElement, {childList: true, subtree: true});
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrived, {once: true});
      else arrived();
    })();
    var stickyOn = true;
    if (!stickyOn) root.classList.add('mp-sticky-off');
    var desk = window.matchMedia('(min-width: 1025px)');
    var HEADERS = '.section-header, .shopify-section-header-sticky, [id^="shopify-section-announcement"], [id^="shopify-section-top_bar"], [id^="shopify-section-top-bar"]';
    var raf = 0, last = -1, lastVh = -1, stuck = [], still = 0, gap = 0;
    var heights = new WeakMap(), pinnedCache = null;
    var ro = window.ResizeObserver ? new ResizeObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i], box = e.borderBoxSize && (e.borderBoxSize[0] || e.borderBoxSize);
        if (box && box.blockSize != null) heights.set(e.target, Math.round(box.blockSize));
        else heights.delete(e.target);
      }
      follow();
    }) : null;
    var headerAttrs = window.MutationObserver ? new MutationObserver(function () { pinnedCache = null; follow(); }) : null;
    function pinned(el) {
      var p = getComputedStyle(el).position;
      return p === 'fixed' || p === 'sticky';
    }
    function pinnedTargets() {
      if (pinnedCache) return pinnedCache;
      pinnedCache = [];
      var nodes = document.querySelectorAll(HEADERS);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (root.contains(el)) continue;
        var target = pinned(el) ? el : (el.firstElementChild && pinned(el.firstElementChild) ? el.firstElementChild : null);
        if (target) pinnedCache.push(target);
      }
      return pinnedCache;
    }
    function headerLine() {
      var line = 0, targets = pinnedTargets();
      for (var i = 0; i < targets.length; i++) {
        if (!targets[i].isConnected) { pinnedCache = null; return headerLine(); }
        var r = targets[i].getBoundingClientRect();
        if (r.height === 0 || r.top > 80) continue;
        if (r.bottom > line) line = r.bottom;
      }
      return Math.max(0, Math.round(line));
    }
    function tag() {
      stuck = [];
      var nodes = root.querySelectorAll('[class*="sticky"], [class*="media"], [class*="info"], [class*="content"], [data-sticky]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var cls = el.className && el.className.baseVal === undefined ? el.className : '';
        if (/atc|add-to-cart|cart|button|btn/.test(cls)) continue;
        if (el.classList.contains('mp-is-sticky') || getComputedStyle(el).position === 'sticky') stuck.push(el);
      }
      // Marked after the loop: a class added inside it made the next
      // getComputedStyle() recompute the page's style each time.
      for (var k = 0; k < stuck.length; k++) if (!stuck[k].classList.contains('mp-is-sticky')) stuck[k].classList.add('mp-is-sticky');
    }
    // Returns true when anything was written.
    function write(force) {
      if (!desk.matches) return false;
      // Every read first, then every write.
      var v = headerLine();
      var vh = window.innerHeight;
      var hs = [];
      for (var j = 0; j < stuck.length; j++) {
        var h = heights.get(stuck[j]);
        if (h == null) { h = stuck[j].offsetHeight; heights.set(stuck[j], h); }
        hs.push(h);
      }
      var changed = false;
      if (force || v !== last || vh !== lastVh) {
        last = v;
        lastVh = vh;
        root.style.setProperty('--mp-header-live', v + 'px');
        changed = true;
      }
      for (var i = 0; i < stuck.length; i++) {
        var el = stuck[i];
        var top = v + gap;
        var home = starts.get(el);
        if (home != null && top > home) top = home;
        if (hs[i] + top + gap > vh) top = Math.min(top, vh - hs[i] - gap);
        var t = Math.round(top) + 'px';
        if (el.__mpTop !== t) {
          el.__mpTop = t;
          el.style.setProperty('--mp-el-top', t);
          changed = true;
        }
      }
      return changed;
    }
    function observe() {
      if (ro) {
        ro.disconnect();
        for (var i = 0; i < stuck.length; i++) ro.observe(stuck[i]);
      }
      if (headerAttrs) {
        headerAttrs.disconnect();
        var hs = document.querySelectorAll(HEADERS);
        for (var j = 0; j < hs.length; j++) {
          if (root.contains(hs[j])) continue;
          headerAttrs.observe(hs[j], {attributes: true, attributeFilter: ['class', 'style', 'data-sticky']});
          if (hs[j].firstElementChild) headerAttrs.observe(hs[j].firstElementChild, {attributes: true, attributeFilter: ['class', 'style', 'data-sticky']});
        }
      }
    }
    // One read/write per frame while the header line or a column moves; the
    // loop ends after 4 frames with nothing to change (a header sliding in or
    // out keeps it running for as long as it moves).
    function loop() {
      raf = 0;
      if (write()) still = 0; else still++;
      if (still < 4) raf = requestAnimationFrame(loop);
    }
    function follow() {
      still = 0;
      if (!raf && stickyOn) raf = requestAnimationFrame(loop);
    }
    var starts = new WeakMap();
    function measureStarts() {
      var y = window.pageYOffset || 0;
      for (var i = 0; i < stuck.length; i++) {
        var parent = stuck[i].parentElement;
        if (!parent) continue;
        var pr = parent.getBoundingClientRect();
        var pad = parseFloat(getComputedStyle(parent).paddingTop) || 0;
        starts.set(stuck[i], Math.max(0, Math.round(pr.top + y + pad)));
      }
    }
    function refresh() {
      if (!stickyOn) return;
      tag();
      measureStarts();
      pinnedCache = null;
      gap = parseFloat(getComputedStyle(root).getPropertyValue('--mp-sticky-gap')) || 0;
      last = -1;
      write(true);
      observe();
      follow();
      if (!root.classList.contains('mp-sticky-ready')) {
        requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('mp-sticky-ready'); }); });
      }
    }
    window.addEventListener('scroll', function () { follow(); }, { passive: true });
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('load', refresh, { once: true });
    document.addEventListener('shopify:section:load', refresh);
    document.addEventListener('storelib:section-load', refresh);
    refresh();
  })();
