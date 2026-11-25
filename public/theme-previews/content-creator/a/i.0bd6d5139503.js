
    (function () {
      var root = document.documentElement;
      addEventListener('pagereveal', function (e) {
        var t = e.viewTransition;
        if (!t) return;
        root.setAttribute('data-mt-wait-pictures', '');
        var done = false;
        function go() { if (done) return; done = true; root.removeAttribute('data-mt-wait-pictures'); }
        setTimeout(go, 900);
        t.finished.then(go, go);
        ['pointerdown', 'keydown'].forEach(function (n) { document.addEventListener(n, go, { once: true, capture: true }); });
        function wait() {
          var fold = innerHeight, list = document.querySelectorAll('img'), waiting = [];
          for (var i = 0; i < list.length && waiting.length < 12; i++) {
            var img = list[i];
            if (img.complete && img.naturalWidth > 0) continue;
            var r = img.getBoundingClientRect();
            if (r.width > 0 && r.top < fold && r.bottom > 0) waiting.push(img);
          }
          if (!waiting.length) return go();
          var left = waiting.length;
          waiting.forEach(function (img) { var one = function () { if (--left <= 0) requestAnimationFrame(go); }; img.addEventListener('load', one, { once: true }); img.addEventListener('error', one, { once: true }); });
          setTimeout(go, 450);
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(wait, 0); }, { once: true });
        else wait();
      });
    })();
  