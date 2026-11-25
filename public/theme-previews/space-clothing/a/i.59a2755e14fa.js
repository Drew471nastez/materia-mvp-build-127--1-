window.mtIsRedraw = function (el) { return !!(el && el.closest && el.closest('[data-mt-redrawn]')); };
      (function () {
        var seen = window.mtSeen = new WeakMap();
        var secVis = window.mtSectionVisible = {};
        if (!('IntersectionObserver' in window)) { window.mtInView = function () { return true; }; return; }
        var io = new IntersectionObserver(function (es) {
          for (var i = 0; i < es.length; i++) {
            var t = es[i].target; seen.set(t, es[i].isIntersecting);
            if (t.id && t.classList.contains('shopify-section')) secVis[t.id] = es[i].isIntersecting;
          }
        });
        window.mtWatch = function (el) { if (el && !seen.has(el) && el.nodeType === 1) { seen.set(el, undefined); io.observe(el); } };
        window.mtInView = function (el) { window.mtWatch(el); return seen.get(el) === true; };
        function watchSections(root) { var l = (root || document).querySelectorAll('.shopify-section'); for (var i = 0; i < l.length; i++) window.mtWatch(l[i]); }
        document.addEventListener('DOMContentLoaded', function () {
          watchSections(document);
          new MutationObserver(function (records) {
            for (var r = 0; r < records.length; r++) {
              var added = records[r].addedNodes;
              for (var n = 0; n < added.length; n++) {
                var node = added[n];
                if (node.nodeType !== 1) continue;
                if (node.classList && node.classList.contains('shopify-section')) window.mtWatch(node);
                else if (node.firstElementChild && node.querySelector('.shopify-section')) watchSections(node);
              }
            }
          }).observe(document.body, { childList: true, subtree: true });
        }, { once: true });
      })();
    