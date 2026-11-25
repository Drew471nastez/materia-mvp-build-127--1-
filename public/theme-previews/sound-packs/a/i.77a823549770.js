
  /* The sample players (samples-audio-tracks, samples-pack-cards, samples-release-hero): one copy runs, whichever section loads first. */
  (function () {
    var V = 5;
    if (window.__ssp && window.__ssp.v >= V) { window.__ssp.scan(); return; }
    var current = null, N = 120, PITCH = 4, KEY = 'ssp-peaks:', reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    function fmt(t) { if (!isFinite(t) || t < 0) t = 0; var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }
    function remember(k, v) { try { localStorage.setItem(KEY + k, v); } catch (e) {} }
    function recall(k) { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } }
    function pathOf(list) { var d = ''; for (var i = 0; i < list.length; i++) { var h = Math.max(1.4, list[i] * 0.46); d += 'M' + (i + 0.5) + ' ' + (50 - h).toFixed(1) + 'V' + (50 + h).toFixed(1); } return d; }
    /* As many bars as the width holds at an even pitch, each the loudest of the peaks it covers: a narrow card draws fewer, clearer bars. */
    function fit(list, count) {
      if (count >= list.length) return list;
      var out = [], step = list.length / count;
      for (var i = 0; i < count; i++) { var a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step)), m = 0; for (var j = a; j < b; j++) if (list[j] > m) m = list[j]; out.push(m); }
      return out;
    }
    function shape(el) {
      var wave = el.querySelector('[data-ssp-wave]'), path = el.querySelector('.ssp__svg path'), list = el.__peaks;
      if (!wave || !path) return;
      var w = wave.clientWidth; if (!w) return;
      var bars = list && list.length ? fit(list, Math.max(16, Math.floor(w / PITCH))) : null, n = bars ? bars.length : N;
      if (bars && n !== el.__bars) {
        el.__bars = n; path.setAttribute('d', pathOf(bars));
        el.querySelectorAll('.ssp__svg').forEach(function (s) { s.setAttribute('viewBox', '0 0 ' + n + ' 100'); });
      }
      el.style.setProperty('--ssp-sw', Math.max(1, Math.min(3.2, (w / n) * 0.58)).toFixed(2) + 'px');
    }
    function draw(el, list) {
      if (!list.length) return;
      el.__peaks = list; el.__bars = 0; el.classList.remove('ssp--flat'); shape(el);
      if (!reduce) el.classList.add('ssp--drawn');
    }
    /* A track saved without its peaks: read them from the file after it starts playing, when the browser has it anyway, and keep them for the next visit. */
    function measure(el) {
      var src = el.getAttribute('data-src'), AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!src || el.__measured || !AC || !window.fetch || !el.classList.contains('ssp--flat')) return;
      el.__measured = true;
      (window.requestIdleCallback || function (f) { return setTimeout(f, 400); })(function () {
        fetch(src, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('fetch'); return r.arrayBuffer(); }).then(function (buf) {
          var ctx = new AC(1, 1, 22050);
          return new Promise(function (res, rej) { var p = ctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
        }).then(function (ab) {
          var ch = ab.getChannelData(0), step = Math.max(1, Math.floor(ch.length / N)), out = [], max = 0;
          for (var i = 0; i < N; i++) { var m = 0, end = Math.min(ch.length, (i + 1) * step); for (var j = i * step; j < end; j += 4) { var v = ch[j] < 0 ? -ch[j] : ch[j]; if (v > m) m = v; } out.push(m); if (m > max) max = m; }
          out = out.map(function (v) { return max ? Math.round(Math.pow(v / max, 0.8) * 100) : 0; });
          remember(src, out.join(','));
          document.querySelectorAll('[data-ssp].ssp--flat').forEach(function (o) { if (o.getAttribute('data-src') === src) draw(o, out); });
        }).catch(function () {});
      });
    }
    function setup(el) {
      if (el.__ssp) return; el.__ssp = true;
      var src = el.getAttribute('data-src'), btn = el.querySelector('[data-ssp-btn]'), wave = el.querySelector('[data-ssp-wave]'), time = el.querySelector('[data-ssp-time]'), tip = el.querySelector('[data-ssp-tip]');
      var given = (el.getAttribute('data-peaks') || '').split(',').map(Number).filter(function (v) { return isFinite(v); });
      if (given.length >= 16) el.__peaks = given;
      if (wave && window.ResizeObserver) new ResizeObserver(function () { shape(el); }).observe(wave); else shape(el);
      if (!src || !btn || !wave) return;
      if (el.classList.contains('ssp--flat')) { var kept = recall(src); if (kept) draw(el, kept.split(',').map(Number)); }
      var audio = null, raf = 0, shown = -1, dragging = false, pending = -1, title = el.getAttribute('data-title') || '', len = parseFloat(el.getAttribute('data-len')) || 0;
      function total() { return audio && audio.duration > 0 && isFinite(audio.duration) ? audio.duration : len; }
      function pct() { return audio && audio.duration > 0 ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0; }
      function paint(force) {
        var d = total(), t = audio ? audio.currentTime : 0, started = el.classList.contains('is-started');
        el.style.setProperty('--ssp-p', pct().toFixed(3) + '%');
        var sec = started ? Math.floor(t) : -2;
        if (force || sec !== shown) {
          shown = sec;
          time.textContent = started ? fmt(t) : fmt(d);
          wave.setAttribute('aria-valuenow', Math.round(pct()));
          wave.setAttribute('aria-valuetext', fmt(t) + (d > 0 ? ' of ' + fmt(d) : ''));
        }
      }
      function loop() { paint(); if (audio && !audio.paused) raf = requestAnimationFrame(loop); }
      function make() {
        if (audio) return audio;
        audio = new Audio(); audio.preload = 'auto'; audio.src = src; el.__audio = audio;
        audio.addEventListener('play', function () {
          if (current && current !== audio) current.pause();
          current = audio; el.classList.add('is-playing', 'is-started'); btn.setAttribute('aria-label', 'Pause ' + title);
          if ('mediaSession' in navigator && window.MediaMetadata) try { navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: document.title }); } catch (e) {}
          cancelAnimationFrame(raf); loop();
        });
        audio.addEventListener('waiting', function () { el.classList.add('is-loading'); });
        audio.addEventListener('playing', function () { el.classList.remove('is-loading'); measure(el); });
        audio.addEventListener('pause', function () { el.classList.remove('is-playing', 'is-loading'); btn.setAttribute('aria-label', 'Play ' + title); cancelAnimationFrame(raf); paint(true); });
        audio.addEventListener('ended', function () { el.classList.remove('is-started'); audio.currentTime = 0; paint(true); });
        audio.addEventListener('loadedmetadata', function () { if (pending >= 0) { audio.currentTime = pending * audio.duration; pending = -1; } el.classList.add('has-len'); paint(true); });
        audio.addEventListener('error', function () { el.classList.remove('is-playing', 'is-loading', 'is-started'); el.classList.add('ssp--off'); time.textContent = 'Could not play'; btn.disabled = true; });
        return audio;
      }
      function play(at) {
        make(); el.classList.add('is-loading');
        if (at >= 0) { el.classList.add('is-started'); el.style.setProperty('--ssp-p', (at * 100).toFixed(3) + '%'); if (audio.readyState >= 1 && audio.duration) audio.currentTime = at * audio.duration; else pending = at; }
        var p = audio.play(); if (p && p.catch) p.catch(function () { el.classList.remove('is-loading'); });
      }
      btn.addEventListener('click', function () { if (!audio || audio.paused) play(-1); else audio.pause(); });
      function at(x) { var r = wave.getBoundingClientRect(); return r.width ? Math.max(0, Math.min(1, (x - r.left) / r.width)) : 0; }
      function seekable() { var r = audio.seekable; return r && r.length > 0 && r.end(r.length - 1) > 0; }
      /* A server that does not answer range requests gives a file the browser cannot seek in: fetch it whole once (a preview is small) and play it from memory. */
      function rescue(f) {
        pending = f; el.style.setProperty('--ssp-p', (f * 100).toFixed(3) + '%');
        if (el.__rescued || !window.fetch || !window.URL) return; el.__rescued = true;
        var going = !audio.paused; el.classList.add('is-loading');
        fetch(src, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('fetch'); return r.blob(); }).then(function (blob) {
          audio.src = URL.createObjectURL(blob); audio.load(); if (going) audio.play().catch(function () {});
        }).catch(function () { el.classList.remove('is-loading'); });
      }
      function seek(f) {
        if (!audio || audio.readyState < 1 || !audio.duration) { play(f); return; }
        el.classList.add('is-started');
        if (!seekable()) { rescue(f); return; }
        audio.currentTime = f * audio.duration; paint(true);
      }
      wave.addEventListener('pointerdown', function (e) { if (e.button > 0) return; dragging = true; try { wave.setPointerCapture(e.pointerId); } catch (x) {} seek(at(e.clientX)); });
      wave.addEventListener('pointermove', function (e) {
        var f = at(e.clientX);
        if (e.pointerType === 'mouse') { el.style.setProperty('--ssp-h', (f * 100).toFixed(2) + '%'); if (tip) { var d = total(); if (d > 0) tip.textContent = fmt(f * d); } }
        if (dragging && audio && audio.duration) { if (seekable()) { audio.currentTime = f * audio.duration; paint(); } else rescue(f); }
      });
      function stop() { dragging = false; }
      wave.addEventListener('pointerup', stop); wave.addEventListener('pointercancel', stop); wave.addEventListener('lostpointercapture', stop);
      wave.addEventListener('keydown', function (e) {
        var k = e.key;
        if (k === ' ' || k === 'Enter') { e.preventDefault(); btn.click(); return; }
        if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].indexOf(k) < 0) return;
        e.preventDefault();
        var f = pct() / 100, step = k === 'PageUp' || k === 'PageDown' ? 0.2 : 0.05;
        if (k === 'ArrowRight' || k === 'ArrowUp' || k === 'PageUp') f += step; else if (k === 'ArrowLeft' || k === 'ArrowDown' || k === 'PageDown') f -= step; else if (k === 'Home') f = 0; else f = 0.999;
        seek(Math.max(0, Math.min(0.999, f)));
      });
    }
    function scan(root) { (root && root.querySelectorAll ? root : document).querySelectorAll('[data-ssp]').forEach(setup); }
    window.__ssp = { v: V, scan: scan, pauseIn: function (root) { root.querySelectorAll('[data-ssp]').forEach(function (el) { if (el.__audio) el.__audio.pause(); }); } };
    document.addEventListener('shopify:section:load', function (e) { scan(e.target); });
    document.addEventListener('shopify:section:unload', function (e) { window.__ssp.pauseIn(e.target); });
    scan(); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(); });
  })();
