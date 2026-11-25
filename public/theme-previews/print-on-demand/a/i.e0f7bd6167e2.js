
        (function () {
          /* Slide change: keep the slider on its slide or fade mode and the drawn change in step, also after a live edit. */
          (function () {
            var r = document.getElementById('hero');
            if (!r || r.__ssCh) return;
            r.__ssCh = true;
            var slideModes = { slide: 1, slide_push: 1, coverflow: 1 };
            var busy = false;
            function apply() {
              /* a redrawn section is a new root with its own script: this one stops touching the slider */
              if (busy || !r.isConnected) return;
              var ch = r.getAttribute('data-ss-change') || 'slide';
              var mode = slideModes[ch] ? 'slide' : 'fade';
              var speed = slideModes[ch] ? 750 : (ch === 'fade' ? 800 : 900);
              busy = true;
              if (r.getAttribute('data-ss-change') !== ch) r.setAttribute('data-ss-change', ch);
              r.style.setProperty('--ss-ch-dur', speed + 'ms');
              var slider = document.getElementById('swiper-hero');
              if (slider && (slider.getAttribute('data-effect') !== mode || slider.getAttribute('data-speed') !== String(speed))) {
                slider.setAttribute('data-effect', mode);
                slider.setAttribute('data-speed', String(speed));
                /* a slider already in this mode only takes the new timing; another script writing the
                   setting's own value onto data-effect is put right without a restart */
                var sw = slider.swiper;
                if (sw && !sw.destroyed && sw.params.effect === mode) { if (sw.params.speed) sw.params.speed = speed; }
                else if (sw && typeof slider.refreshSlideshow === 'function') { sw.destroy(true, true); slider.refreshSlideshow(); }
              }
              busy = false;
              guard(slider);
            }
            /* In fade mode the drawn change holds each slide's opacity, so a change that ends where it began
               (a short drag springing back) has no transition to end on: finish it once its time is up,
               so the slider never stays "moving" and autoplay goes on. */
            function guard(slider) {
              var sw = slider && slider.swiper;
              if (!sw || sw.destroyed || sw.__ssChGuard || typeof sw.on !== 'function') return;
              sw.__ssChGuard = true;
              var t = 0;
              sw.on('transitionStart', function () {
                clearTimeout(t);
                if (sw.params.effect !== 'fade') return;
                t = setTimeout(function () {
                  if (sw.destroyed || !sw.animating) return;
                  var el = sw.slides[sw.activeIndex] || sw.slides[0];
                  if (el) el.dispatchEvent(new Event('transitionend'));
                }, (parseFloat(sw.params.speed) || 800) + 150);
              });
              sw.on('transitionEnd', function () { clearTimeout(t); });
            }
            apply();
            if (window.MutationObserver) {
              /* A new data-slideshow-settings brings its slide change in; a live edit sets data-ss-change itself. */
              new MutationObserver(function (list) {
                for (var i = 0; i < list.length; i++) if (list[i].attributeName === 'data-slideshow-settings') {
                  try { var s = JSON.parse(r.getAttribute('data-slideshow-settings') || '{}'); if (s.slide_effect && r.getAttribute('data-ss-change') !== s.slide_effect) { r.setAttribute('data-ss-change', s.slide_effect); return; } } catch (e) {}
                }
                apply();
              }).observe(r, { attributes: true, attributeFilter: ['data-slideshow-settings', 'data-ss-change'] });
              var sl = document.getElementById('swiper-hero');
              if (sl) new MutationObserver(apply).observe(sl, { attributes: true, attributeFilter: ['data-effect', 'data-speed', 'class'] });
            }
          })();
          /* Image effects: which slide is on, scroll parallax, pointer tracking, pause off screen. */
          var root = document.getElementById('hero');
          if (!root || root.__ssFx) return;
          root.__ssFx = true;
          var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
          function reduced() { return !!(mq && mq.matches); }
          function fx() { return root.getAttribute('data-ss-fx') || 'none'; }
          function fxi() { var v = parseFloat(getComputedStyle(root).getPropertyValue('--fxi')); return isNaN(v) ? 5 : Math.max(1, Math.min(10, v)); }
          function adopt() {
            var legacy = root.getAttribute('data-slideshow-pointer');
            if (legacy !== null) { root.removeAttribute('data-slideshow-pointer'); if (legacy) root.setAttribute('data-ss-fx', legacy); }
          }
          function adoptSettings() {
            try {
              var s = JSON.parse(root.getAttribute('data-slideshow-settings') || '{}');
              if (s.image_effect) root.setAttribute('data-ss-fx', s.image_effect);
              if (s.image_effect_intensity) root.style.setProperty('--fxi', s.image_effect_intensity);
            } catch (e) {}
          }
          adopt();

          var syncQueued = false;
          function sync() {
            syncQueued = false;
            var active = root.querySelector('.swiper-slide-active') || root.querySelector('[data-first-slide]');
            var slides = root.querySelectorAll('.swiper-slide');
            for (var i = 0; i < slides.length; i++) {
              var on = slides[i] === active;
              if (slides[i].classList.contains('ss-fx-on') !== on) slides[i].classList.toggle('ss-fx-on', on);
            }
          }
          function queueSync() { if (!syncQueued) { syncQueued = true; requestAnimationFrame(sync); } }
          sync();

          var onScreen = true, pQueued = false;
          function parallax() {
            pQueued = false;
            if (!root.isConnected) { window.removeEventListener('scroll', queueParallax); window.removeEventListener('resize', queueParallax); return; }
            if (fx() !== 'parallax' || reduced()) { root.style.removeProperty('--fx-py'); return; }
            var r = root.getBoundingClientRect(), vh = window.innerHeight || 1;
            var media = root.querySelector('.ss-fx-on .banner__media') || root.querySelector('.banner__media');
            var h = media ? media.offsetHeight : r.height;
            var p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
            p = Math.max(-1, Math.min(1, p));
            var max = h * (fxi() * 0.03) / 2 * 0.92;
            root.style.setProperty('--fx-py', (-p * max).toFixed(2) + 'px');
          }
          function queueParallax() { if (!pQueued && onScreen) { pQueued = true; requestAnimationFrame(parallax); } }
          window.addEventListener('scroll', queueParallax, { passive: true });
          window.addEventListener('resize', queueParallax, { passive: true });
          parallax();

          var tx = 0, ty = 0, cx = 0, cy = 0, mRaf = 0;
          function mStep() {
            mRaf = 0;
            cx += (tx - cx) * 0.09; cy += (ty - cy) * 0.09;
            if (Math.abs(tx - cx) < 0.0005 && Math.abs(ty - cy) < 0.0005) { cx = tx; cy = ty; } else { mRaf = requestAnimationFrame(mStep); }
            root.style.setProperty('--fx-mx', cx.toFixed(4));
            root.style.setProperty('--fx-my', cy.toFixed(4));
          }
          function mGo() { if (!mRaf) mRaf = requestAnimationFrame(mStep); }
          root.addEventListener('pointermove', function (e) {
            if (e.pointerType === 'touch' || fx() !== 'mouse_track' || reduced()) return;
            var r = root.getBoundingClientRect();
            tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
            ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
            mGo();
          }, { passive: true });
          /* back to rest: the pointer leaves, the effect changes or motion is reduced */
          function rest() { tx = 0; ty = 0; mGo(); }
          root.addEventListener('pointerleave', rest);
          root.addEventListener('mouseleave', rest);
          if (mq) { var onMq = function () { rest(); queueParallax(); }; if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }

          if (window.IntersectionObserver) {
            new IntersectionObserver(function (entries) {
              onScreen = entries[0].isIntersecting;
              if (onScreen) { root.removeAttribute('data-ss-fx-off'); queueParallax(); } else { root.setAttribute('data-ss-fx-off', ''); }
            }, { rootMargin: '100px 0px' }).observe(root);
          }
          if (window.MutationObserver) {
            var wrapper = root.querySelector('.swiper-wrapper');
            if (wrapper) new MutationObserver(queueSync).observe(wrapper, { subtree: true, attributes: true, attributeFilter: ['class'] });
            new MutationObserver(function (list) {
              for (var i = 0; i < list.length; i++) {
                if (list[i].attributeName === 'data-slideshow-pointer') adopt();
                if (list[i].attributeName === 'data-slideshow-settings') adoptSettings();
              }
              if (fx() !== 'mouse_track') rest();
              queueSync(); queueParallax();
            }).observe(root, { attributes: true, attributeFilter: ['data-slideshow-pointer', 'data-slideshow-settings', 'data-ss-fx'] });
          }
        })();
      