
(function() {
  function init() {
    var sec = (document.getElementById("MainProduct-main") || document.getElementById("shopify-section-main"));
    if (!sec) return;
    /* Find the media column regardless of desktop layout. */
    var mediaCol =
      sec.querySelector('.product-detail__media') ||
      sec.querySelector('.product__media') ||
      sec.querySelector('.product__media-wrapper') ||
      sec.querySelector('.product-detail__media-wrapper') ||
      sec.querySelector('[class*="media"]') ||
      sec;
    /* Try to find a swiper instance first (Thumbnail layouts use it). */
    var allSwipers = mediaCol.querySelectorAll('slide-section, .swiper');
    var swiperEl = null;
    for (var k = 0; k < allSwipers.length; k++) {
      var sw = allSwipers[k];
      if (sw.closest('.thumbnail-slide')) continue;
      if (sw.classList.contains('thumbnail-slide')) continue;
      swiperEl = sw; break;
    }
    /* Stack/Grid layouts may not have a swiper at all — fall back to
       scroll-snap tracking of the actual image elements in the column. */
    if (!swiperEl) {
      initScrollMode(sec, mediaCol);
      return;
    }
    var allSlides = swiperEl.querySelectorAll('.swiper-slide');
    /* Filter out duplicate slides from loop mode + thumbnail slides. */
    var realSlides = [];
    allSlides.forEach(function(s) {
      if (s.classList.contains('swiper-slide-duplicate')) return;
      if (s.closest('.thumbnail-slide')) return;
      realSlides.push(s);
    });
    var n = realSlides.length;
    if (n < 2) return;
    if (sec.querySelector('.nav-dots-row')) return;
    var row = document.createElement('div');
    row.className = 'nav-dots-row';
    for (var i = 0; i < n; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-dot' + (i === 0 ? ' is-active' : '');
      b.setAttribute('aria-label', 'Go to image ' + (i + 1));
      b.dataset.index = String(i);
      row.appendChild(b);
    }
    /* Insert AFTER the swiper, below the product image. */
    if (swiperEl.parentNode) swiperEl.parentNode.insertBefore(row, swiperEl.nextSibling);
    else mediaCol.appendChild(row);
    var getSwiper = function() {
      return swiperEl.swiper || swiperEl.globalSlide || null;
    };
    var setActive = function(idx) {
      row.querySelectorAll('.nav-dot').forEach(function(d, i) { d.classList.toggle('is-active', i === idx); });
    };
    row.addEventListener('click', function(e) {
      var t = e.target.closest('.nav-dot'); if (!t) return;
      var idx = parseInt(t.dataset.index, 10) || 0;
      setActive(idx);
      var sw = getSwiper();
      if (sw && typeof sw.slideTo === 'function') sw.slideTo(idx);
    });
    /* Try to attach a slideChange listener (preferred path). */
    var attach = function(sw) {
      if (sw && sw.on) {
        sw.on('slideChange', function() {
          var idx = (sw.realIndex !== undefined ? sw.realIndex : sw.activeIndex) || 0;
          setActive(idx);
        });
      }
    };
    var attached = false;
    var attachPoll = setInterval(function() {
      var sw = getSwiper();
      if (sw && !attached) { attached = true; clearInterval(attachPoll); attach(sw); }
    }, 200);
    setTimeout(function() { clearInterval(attachPoll); }, 10000);

    /* Index polling fallback — guarantees the dots stay in sync even when
       slideChange doesn't fire (e.g. swipes on some swiper versions, or when
       slide transitions are interrupted). Cheap operation, runs every 250ms. */
    var lastIdx = 0;
    /* Stops once the dots are gone (the theme editor redraws the section and
       runs this script again for the new markup): one poll per gallery. */
    var syncPoll = setInterval(function() {
      if (!row.isConnected) { clearInterval(syncPoll); clearInterval(attachPoll); return; }
      var sw = getSwiper(); if (!sw) return;
      var idx = (sw.realIndex !== undefined ? sw.realIndex : sw.activeIndex) || 0;
      if (idx !== lastIdx) { lastIdx = idx; setActive(idx); }
    }, 250);
  }
  /* Scroll-mode fallback for Stack / Grid layouts that don't use a swiper.
     Tracks which product image is currently in view and updates the active
     dot. Clicking a dot scrolls the image into view smoothly. */
  function initScrollMode(sec, mediaCol) {
    if (sec.querySelector('.nav-dots-row')) return;
    /* Find all "real" product images — broad selector that excludes
       thumbnails / nested swatches / loading placeholders. */
    var rawImages = mediaCol.querySelectorAll('img');
    var seen = []; var seenSrc = {};
    for (var i = 0; i < rawImages.length; i++) {
      var img = rawImages[i];
      if (img.closest('.thumbnail-slide')) continue;
      if (img.closest('.product__color-swatch')) continue;
      if (img.closest('button-wishlist')) continue;
      if (img.closest('[data-thumbnail]')) continue;
      if (img.closest('.cart-item')) continue;
      if (img.closest('.product-form__quantity')) continue;
      /* Skip tiny icon-sized images (less than 100px wide intrinsic) */
      if (img.naturalWidth && img.naturalWidth < 100) continue;
      var key = img.currentSrc || img.src || ('idx' + i);
      if (seenSrc[key]) continue;
      seenSrc[key] = true; seen.push(img);
    }
    if (seen.length < 2) return;
    var row = document.createElement('div');
    row.className = 'nav-dots-row';
    for (var j = 0; j < seen.length; j++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-dot' + (j === 0 ? ' is-active' : '');
      b.setAttribute('aria-label', 'Go to image ' + (j + 1));
      b.dataset.index = String(j);
      row.appendChild(b);
    }
    /* Place the dots BELOW the media column. */
    if (mediaCol.parentNode) {
      mediaCol.appendChild(row);
    }
    var setActive = function(idx) {
      row.querySelectorAll('.nav-dot').forEach(function(d, i) { d.classList.toggle('is-active', i === idx); });
    };
    row.addEventListener('click', function(e) {
      var t = e.target.closest('.nav-dot'); if (!t) return;
      var idx = parseInt(t.dataset.index, 10) || 0;
      setActive(idx);
      var target = seen[idx];
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function(entries) {
        if (!row.isConnected) { io.disconnect(); return; }
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          var idx = seen.indexOf(entry.target);
          if (idx >= 0) setActive(idx);
        });
      }, { threshold: 0.55 });
      seen.forEach(function(img) { io.observe(img); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 400);
  setTimeout(init, 1000);
})();
