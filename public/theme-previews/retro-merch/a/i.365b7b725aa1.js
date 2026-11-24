
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
    var raf = 0, until = 0, last = -1, lastVh = -1, stuck = [];
    var ro = window.ResizeObserver ? new ResizeObserver(function () { follow(200); }) : null;
    function pinned(el) {
      var p = getComputedStyle(el).position;
      return p === 'fixed' || p === 'sticky';
    }
    function headerLine() {
      var line = 0;
      var nodes = document.querySelectorAll(HEADERS);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (root.contains(el)) continue;
        var target = pinned(el) ? el : (el.firstElementChild && pinned(el.firstElementChild) ? el.firstElementChild : null);
        if (!target) continue;
        var r = target.getBoundingClientRect();
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
        if (el.classList.contains('mp-is-sticky') || getComputedStyle(el).position === 'sticky') {
          el.classList.add('mp-is-sticky');
          stuck.push(el);
        }
      }
    }
    function write(force) {
      if (!desk.matches) return;
      var v = headerLine();
      var vh = window.innerHeight;
      if (force || v !== last || vh !== lastVh) {
        last = v;
        lastVh = vh;
        root.style.setProperty('--mp-header-live', v + 'px');
      }
      var gap = parseFloat(getComputedStyle(root).getPropertyValue('--mp-sticky-gap')) || 0;
      for (var i = 0; i < stuck.length; i++) {
        var el = stuck[i];
        var h = el.offsetHeight;
        var top = v + gap;
        if (h + top + gap > vh) top = Math.min(top, vh - h - gap);
        var t = Math.round(top) + 'px';
        if (el.__mpTop !== t) {
          el.__mpTop = t;
          el.style.setProperty('--mp-el-top', t);
        }
      }
    }
    function observe() {
      if (!ro) return;
      ro.disconnect();
      for (var i = 0; i < stuck.length; i++) ro.observe(stuck[i]);
      var hs = document.querySelectorAll(HEADERS);
      for (var j = 0; j < hs.length; j++) { if (!root.contains(hs[j])) ro.observe(hs[j]); }
    }
    function loop() {
      write();
      if (performance.now() < until) raf = requestAnimationFrame(loop);
      else raf = 0;
    }
    function follow(ms) {
      until = Math.max(until, performance.now() + (ms || 700));
      if (!raf) raf = requestAnimationFrame(loop);
    }
    function refresh() {
      if (!stickyOn) return;
      tag();
      last = -1;
      write(true);
      observe();
      follow(700);
      if (!root.classList.contains('mp-sticky-ready')) {
        requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('mp-sticky-ready'); }); });
      }
    }
    window.addEventListener('scroll', function () { follow(700); }, { passive: true });
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('load', refresh, { once: true });
    document.addEventListener('shopify:section:load', refresh);
    document.addEventListener('storelib:section-load', refresh);
    refresh();
  })();
