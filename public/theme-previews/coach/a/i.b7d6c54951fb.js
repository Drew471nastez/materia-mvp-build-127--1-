
        (function() {
          // The section picker's preview (one section, mt-preview) shows everything at once;
          // a full page in the editor is never treated as a preview.
          var html = document.documentElement;
          if (html.classList.contains('mt-preview')) document.addEventListener('DOMContentLoaded', function () {
            var main = document.getElementById('MainContent') || document.querySelector('main');
            if (main && main.querySelectorAll(':scope > .shopify-section').length > 1) html.classList.remove('mt-preview');
          });
          var anim = "slide_side";
          if (!anim || anim === 'none') return;

          // Runs in the theme editor too, so sections reveal there as on the storefront.

          // Skip these — chrome/utility sections that should never animate-in.
          var SKIP_PATTERN = /(header|footer|announcement|top[-_]?bar|popup|cookie|gdpr|consent|back[-_]?to[-_]?top|mobile[-_]?navigation|mobile[-_]?nav[-_]?bar|password|age[-_]?verifier|preloader|search[-_]?popup|social[-_]?floating|overlay[-_]?group|header[-_]?group|footer[-_]?group)/i;

          function shouldSkip(s) {
            if (!s) return true;
            if (s.dataset.noReveal === '1') return true;
            if (s.dataset.tiRevealInit === '1') return true;
            if (s.classList.contains('scroll-trigger')) return true;
            if (s.querySelector('[data-ti-no-reveal]')) return true;
            var hay = (s.id || '') + ' ' + (s.className || '');

            // also catch theme-template chrome (e.g. main-* are fine, but the wrappers above are not).
            if (SKIP_PATTERN.test(hay)) return true;
            var main = document.getElementById('MainContent') || document.querySelector('main');
            var first = main && main.querySelector(':scope > .shopify-section');
            if (first && s === first) return true;
            return false;
          }

          function applyReveal(root) {
            root = root || document;
            var sections = Array.from(root.querySelectorAll('.shopify-section'));
            if (root.matches && root.matches('.shopify-section')) sections.unshift(root);
            sections.forEach(function(s) {
              if (shouldSkip(s)) return;
              s.classList.add('scroll-trigger', 'ti-section-reveal', anim);
              s.dataset.tiRevealInit = '1';
            });
            if (typeof initializeScrollAnimationTrigger === 'function') initializeScrollAnimationTrigger(root);
          }

          function boot() {
            applyReveal(document);

            // Observe future section insertions (theme editor, AJAX, etc.).
            if ('MutationObserver' in window) {
              var mo = new MutationObserver(function(muts) {
                var hit = false;
                for (var i = 0; i < muts.length; i++) {
                  var added = muts[i].addedNodes;
                  for (var j = 0; j < added.length; j++) {
                    var n = added[j];
                    if (n && n.nodeType === 1 && (n.classList && n.classList.contains('shopify-section') || (n.querySelector && n.querySelector('.shopify-section')))) {
                      hit = true; break;
                    }
                  }
                  if (hit) break;
                }
                if (hit) applyReveal(document);
              });
              mo.observe(document.body, { childList: true, subtree: true });
            }

            // Theme editor: re-apply on section load/reorder/select.
            if (window.SlTheme && window.SlTheme.designMode) {
              document.addEventListener('shopify:section:load', function(e) {
                applyReveal(e.target.parentNode || document);
              });
              document.addEventListener('shopify:section:reorder', function() {
                applyReveal(document);
              });
            }
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', boot);
          } else {
            boot();
          }
        })();
      