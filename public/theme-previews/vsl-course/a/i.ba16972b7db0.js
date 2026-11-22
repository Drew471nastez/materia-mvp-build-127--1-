
  (function(){
    var cfg = window.flashingBrowseTab || {};
    var origTitle = document.title;
    var origFavicon = (document.querySelector("link[rel*='icon']") || {}).href || '';
    var faviconEl = document.querySelector("link[rel*='icon']");
    var rotateTimer = null;
    var idleTimer = null;
    var lastIdleAt = Date.now();
    var msgs = [];
    if (cfg.firstNotification) msgs.push(cfg.firstNotification);
    if (cfg.secondaryNotification) msgs.push(cfg.secondaryNotification);

    // Cart-aware initial title
    if (cfg.enableCartTabMessage && cfg.cartCount > 0) {
      document.title = cfg.cartTabTemplate
        .replace('{count}', cfg.cartCount)
        .replace('{title}', origTitle);
      origTitle = document.title;
    }

    function startRotation(){
      if (!cfg.enable || msgs.length === 0) return;
      var i = 0;
      var intervalSec = Math.max(1, parseInt(cfg.interval || 2, 10));
      rotateTimer = setInterval(function(){
        document.title = msgs[i % msgs.length];
        i++;
      }, intervalSec * 1000);
    }
    function stopRotation(){
      if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
      document.title = origTitle;
    }
    function swapFavicon(toAway){
      if (!cfg.enableAwayFavicon || !cfg.awayFavicon || !faviconEl) return;
      faviconEl.href = toAway ? cfg.awayFavicon : origFavicon;
    }
    function startIdleWatch(){
      if (!cfg.enableIdle) return;
      var threshold = Math.max(15, parseInt(cfg.idleThreshold || 120, 10)) * 1000;
      var resetIdle = function(){
        lastIdleAt = Date.now();
        if (idleTimer) { clearTimeout(idleTimer); }
        idleTimer = setTimeout(function(){
          if (cfg.enable) msgs.push(cfg.idleMessage);
          else document.title = cfg.idleMessage;
        }, threshold);
      };
      ['mousemove','keydown','scroll','touchstart','click'].forEach(function(ev){
        window.addEventListener(ev, resetIdle, { passive: true });
      });
      resetIdle();
    }

    document.addEventListener('visibilitychange', function(){
      if (document.hidden) {
        startRotation();
        swapFavicon(true);
      } else {
        stopRotation();
        swapFavicon(false);
      }
    });

    startIdleWatch();

    // Live cart count update — watch for cart drawer DOM changes
    document.addEventListener('cart:refresh', function(e){
      if (!cfg.enableCartTabMessage) return;
      var newCount = (e && e.detail && e.detail.data && e.detail.data.item_count) || cfg.cartCount;
      cfg.cartCount = newCount;
      if (newCount > 0) {
        origTitle = cfg.cartTabTemplate
          .replace('{count}', newCount)
          .replace('{title}', document.title);
      }
    });
  })();
