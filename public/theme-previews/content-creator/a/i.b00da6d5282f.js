
  (function () {
    if (window.__pixReady) { window.__pixScan && window.__pixScan(); return; }
    window.__pixReady = true;
    var lang = document.documentElement.lang || undefined;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    function addDays(d, n, skip) {
      var x = new Date(d.getTime());
      while (n > 0) { x.setDate(x.getDate() + 1); if (!skip || (x.getDay() !== 0 && x.getDay() !== 6)) n--; }
      return x;
    }
    function fmt(d) {
      try { return new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(d); } catch (e) { return d.toDateString().slice(0, 10); }
    }
    function delivery(el) {
      var c = JSON.parse(el.getAttribute('data-pix-delivery') || '{}');
      var now = new Date(), start = now, skip = !!c.skip;
      var cut = +c.cutoff || 0;
      if (skip && (now.getDay() === 0 || now.getDay() === 6)) cut = 0;
      var past = cut && now.getHours() >= cut;
      if (past || (skip && (now.getDay() === 0 || now.getDay() === 6))) start = addDays(now, 1, skip);
      var a = addDays(start, Math.max(0, +c.min || 0), skip), z = addDays(start, Math.max(+c.min || 0, +c.max || 0), skip);
      var when = a.toDateString() === z.toDateString() ? fmt(a) : (c.between || '[start] to [end]').replace('[start]', fmt(a)).replace('[end]', fmt(z));
      var w = el.querySelector('[data-pix-when]');
      if (w) w.textContent = when;
      var line = el.querySelector('[data-pix-cutoff]');
      if (!line) return;
      var tick = function () {
        var n = new Date(), end = new Date(n); end.setHours(cut, 0, 0, 0);
        var ms = end - n;
        if (!cut || ms <= 0 || (skip && (n.getDay() === 0 || n.getDay() === 6))) { line.hidden = true; return; }
        var h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4);
        var t = line.querySelector('[data-pix-left]');
        if (t) t.textContent = (h ? h + 'h ' : '') + m + 'm';
        line.hidden = false;
      };
      tick();
      setInterval(tick, 30000);
    }
    function timer(el) {
      var end = Date.parse(el.getAttribute('data-pix-timer'));
      if (isNaN(end)) return;
      var units = el.querySelectorAll('[data-pix-u]');
      var tick = function () {
        var ms = end - Date.now();
        if (ms <= 0) { el.hidden = true; clearInterval(iv); return; }
        var v = { d: Math.floor(ms / 864e5), h: Math.floor(ms % 864e5 / 36e5), m: Math.floor(ms % 36e5 / 6e4), s: Math.floor(ms % 6e4 / 1e3) };
        for (var i = 0; i < units.length; i++) { var k = units[i].getAttribute('data-pix-u'); var t = k === 'd' ? String(v.d) : pad(v[k]); if (units[i].textContent !== t) units[i].textContent = t; }
        el.hidden = false;
      };
      var iv = setInterval(tick, 1000);
      tick();
    }
    function stock(el) {
      var map = {};
      try { map = JSON.parse(el.querySelector('script[type="application/json"]').textContent); } catch (e) { return; }
      var form = document.getElementById(el.getAttribute('data-pix-form'));
      var show = function (id) {
        var v = map[id];
        if (!v) return;
        var level = !v[0] ? 'out' : (v[1] && v[2] <= +el.getAttribute('data-pix-at') ? 'low' : 'in');
        var words = el.getAttribute('data-pix-' + level) || '';
        if (level === 'in' && el.hasAttribute('data-pix-hide-in')) { el.hidden = true; return; }
        el.hidden = false;
        el.setAttribute('data-level', level);
        var pill = el.querySelector('.pix-stock');
        if (pill) pill.setAttribute('data-level', level);
        var t = el.querySelector('[data-pix-text]');
        if (t) t.textContent = words.replace('[count]', v[2]);
        var bar = el.querySelector('.pix-stock__bar');
        if (bar) { bar.hidden = level !== 'low'; bar.style.setProperty('--pix-fill', Math.max(.08, Math.min(1, v[2] / Math.max(1, +el.getAttribute('data-pix-at') * 2)))); }
      };
      var read = function () { var i = form && form.querySelector('[name="id"]'); if (i && i.value) show(i.value); };
      document.addEventListener('change', function () { setTimeout(read, 0); });
      document.addEventListener('variant:change', function (e) { if (e.detail && e.detail.variant) show(String(e.detail.variant.id)); });
      if (typeof window.subscribe === 'function' && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.variantChange) {
        window.subscribe(window.PUB_SUB_EVENTS.variantChange, function (e) { var v = e && e.data && e.data.variant; if (v) show(String(v.id)); });
      }
      if (form && window.MutationObserver) { var i = form.querySelector('[name="id"]'); if (i) new MutationObserver(read).observe(i, { attributes: true, attributeFilter: ['value'] }); }
    }
    function scan() {
      var all = document.querySelectorAll('[data-pix-delivery]:not([data-pix-on]), [data-pix-timer]:not([data-pix-on]), [data-pix-stock]:not([data-pix-on])');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        el.setAttribute('data-pix-on', '');
        try {
          if (el.hasAttribute('data-pix-delivery')) delivery(el);
          else if (el.hasAttribute('data-pix-timer')) timer(el);
          else stock(el);
        } catch (e) {}
      }
    }
    window.__pixScan = scan;
    document.addEventListener('shopify:section:load', scan);
    document.addEventListener('shopify:block:select', scan);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  })();
