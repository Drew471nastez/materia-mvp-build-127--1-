
      (function () {
        var S = [
          "/theme-previews/_base/a/hero-pro-scrolling.bf6b55deae4e.js",
          "/theme-previews/_base/a/hero-product-two.d82cfec7455c.js",
          "/theme-previews/_base/a/hero-product-one.eeb25630e984.js",
          "/theme-previews/_base/a/hero-product-three.e62ee1211c55.js",
          "/theme-previews/_base/a/marketing-sections.0416198a8db7.js",
          "/theme-previews/_base/a/before-after-controls.b458ad057d9d.js",
          "/theme-previews/_base/a/media-live-before-after.fc489c4ebeaf.js",
          "/theme-previews/_base/a/media-live-galleries-a.fb88886b4db3.js",
          "/theme-previews/_base/a/media-live-galleries-b.ba8d4e1a1dec.js",
          "/theme-previews/_base/a/media-live-image-video.e3f6297c3d53.js",
          "/theme-previews/_base/a/media-live-benefits.54c0213dbe6a.js",
          "/theme-previews/_base/a/media-live-stats-reels.6298408d785e.js",
          "/theme-previews/_base/a/live-products-a.01bcc92cb2fb.js",
          "/theme-previews/_base/a/live-products-b.d8f9a0d11541.js",
          "/theme-previews/_base/a/live-products-c.969c5dfbfaa9.js",
          "/theme-previews/_base/a/live-products-d.398d5944fcc0.js",
          "/theme-previews/_base/a/live-features-a.c9ff0bba8e4d.js",
          "/theme-previews/_base/a/live-features-b.ce754f526be5.js",
          "/theme-previews/_base/a/live-features-c.905ab0167902.js",
          "/theme-previews/_base/a/live-features-d.8f213fc2ba49.js",
          "/theme-previews/_base/a/live-collections.0b0c379fe471.js",
          "/theme-previews/_base/a/live-testimonials.6e78f70ae7ca.js",
          "/theme-previews/_base/a/live-faq.4e71f93efa76.js",
          "/theme-previews/_base/a/live-logos.d269b3989b95.js",
          "/theme-previews/_base/a/live-countdown.ed2fa745066d.js",
          "/theme-previews/_base/a/live-announcements.025b2e8d971e.js",
          "/theme-previews/_base/a/live-social-dividers.bc4397843a77.js",
          "/theme-previews/_base/a/live-popups-code.5924ef2e6490.js",
          "/theme-previews/_base/a/live-page-popups.314d4c6648e5.js",
          "/theme-previews/_base/a/live-product-extras.07d38ce5d58c.js",
          "/theme-previews/_base/a/live-header.aebc2d8cc364.js",
          "/theme-previews/_base/a/live-blog-slideshow.3b4030457a2e.js",
          "/theme-previews/_base/a/live-cart-search.99d3179c4dd2.js",
          "/theme-previews/_base/a/hero-benefits.0e115e5c353a.js",
          "/theme-previews/_base/a/scroll-text-reveal.29a6674ce799.js",
          "/theme-previews/_base/a/text-section-controls.6f0d0e1ec3cb.js",
          "/theme-previews/_base/a/live-text.6de0dd9c0fb6.js",
          "/theme-previews/_base/a/testimonial-quote.67d766420bd1.js",
          "/theme-previews/_base/a/announcement-pro-4.b7425d959936.js",
          "/theme-previews/_base/a/announcement-three-colors.dc351a0da9b4.js",
          "/theme-previews/_base/a/live-r7-collections.493dbbec3a93.js",
          "/theme-previews/_base/a/live-r7-faq.22c61453f6c9.js",
          "/theme-previews/_base/a/live-r7-text.e581a8267cbb.js",
          "/theme-previews/_base/a/live-r7-media.7789db3a947f.js",
          "/theme-previews/_base/a/live-r7-features.a9729fa12112.js",
          "/theme-previews/_base/a/live-r7-products.f88cd8aa9acc.js",
          "/theme-previews/_base/a/live-r7-testimonials.d281fc630732.js",
          "/theme-previews/_base/a/live-r7-hero.3c8f20db4bb8.js",
          "/theme-previews/_base/a/live-r7-trust.aca1214e1b93.js",
          "/theme-previews/_base/a/live-r7-connect.e9b5b4145e05.js",
          "/theme-previews/_base/a/live-r7-promo.42e88ef39703.js",
          "/theme-previews/_base/a/live-r7-stories.245bbbb1cdb4.js",
          "/theme-previews/_base/a/live-r7-extras.36b293e5c86a.js"
        ];
        var editor = false || !!(window.SlTheme && window.SlTheme.designMode);
        if (!editor) return;
        var ready = null, finished = false;
        function loadAll() {
          if (ready) return ready;
          ready = Promise.all(S.map(function (src) {
            return new Promise(function (done) {
              var el = document.createElement('script');
              el.src = src; el.async = false;
              el.onload = el.onerror = done;
              document.head.appendChild(el);
            });
          })).then(function () { finished = true; });
          return ready;
        }
        var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 600); };
        if (document.readyState === 'complete') idle(loadAll, { timeout: 1500 });
        else window.addEventListener('load', function () { idle(loadAll, { timeout: 1500 }); }, { once: true });
        document.addEventListener('shopify:section:load', function (e) {
          if (finished) return;
          var section = e.target;
          loadAll().then(function () {
            if (section && section.isConnected) section.dispatchEvent(new CustomEvent('storelib:section-load', { bubbles: true, detail: e.detail }));
          });
        });
      })();
    