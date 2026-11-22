
  (function () {
    if (window.__samplesAudio) { window.__samplesAudio.scan(); return; }
    var current = null;
    function fmt(t) { if (!isFinite(t) || t < 0) t = 0; var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }
    function seeded(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h += 0x6D2B79F5; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function bars(row) {
      var wave = row.querySelector('[data-sat-wave]'); if (!wave) return;
      var n = Math.max(24, Math.min(96, Math.round(wave.clientWidth / 5))) || 64;
      var rnd = seeded(row.getAttribute('data-seed') || ''), html = '';
      var beat = 4 + Math.floor(rnd() * 3);
      for (var i = 0; i < n; i++) {
        var x = i / n, shape = 0.55 + 0.35 * Math.sin(x * Math.PI * (1.2 + rnd() * 0.2)) + (i % beat === 0 ? 0.25 : 0);
        var h = Math.max(0.12, Math.min(1, shape * (0.45 + rnd() * 0.6)));
        html += '<i style="height:' + Math.round(h * 100) + '%"></i>';
      }
      row.querySelectorAll('.sat__bars').forEach(function (b) { b.innerHTML = html; });
    }
    function setup(row) {
      if (row.__sat) return; row.__sat = true;
      bars(row);
      var audio = row.querySelector('[data-sat-audio]'), btn = row.querySelector('[data-sat-play]'), wave = row.querySelector('[data-sat-wave]'), time = row.querySelector('[data-sat-time]');
      if (!audio || !btn || !wave) return;
      var title = row.querySelector('.sat__title'), name = title ? title.textContent : '';
      var raf = 0, dragging = false;
      function paint() {
        var d = audio.duration, t = audio.currentTime, p = d > 0 ? Math.min(100, (t / d) * 100) : 0;
        wave.style.setProperty('--sat-p', p + '%');
        if (d > 0) { time.textContent = fmt(t) + ' / ' + fmt(d); wave.setAttribute('aria-valuemax', Math.round(d)); }
        wave.setAttribute('aria-valuenow', Math.round(t));
        wave.setAttribute('aria-valuetext', fmt(t) + (d > 0 ? ' of ' + fmt(d) : ''));
      }
      function loop() { paint(); if (!audio.paused) raf = requestAnimationFrame(loop); }
      function play() {
        if (current && current !== audio) current.pause();
        current = audio; row.classList.add('is-started');
        var p = audio.play(); if (p && p.catch) p.catch(function () { row.classList.remove('is-loading'); });
      }
      btn.addEventListener('click', function () { if (audio.paused) play(); else audio.pause(); });
      audio.addEventListener('play', function () { row.classList.add('is-playing', 'is-started'); btn.setAttribute('aria-label', 'Pause ' + name); cancelAnimationFrame(raf); loop(); });
      audio.addEventListener('waiting', function () { row.classList.add('is-loading'); });
      audio.addEventListener('playing', function () { row.classList.remove('is-loading'); });
      audio.addEventListener('pause', function () { row.classList.remove('is-playing', 'is-loading'); btn.setAttribute('aria-label', 'Play ' + name); cancelAnimationFrame(raf); paint(); });
      audio.addEventListener('ended', function () { audio.currentTime = 0; paint(); });
      audio.addEventListener('loadedmetadata', paint);
      audio.addEventListener('error', function () { row.classList.remove('is-playing', 'is-loading'); time.textContent = 'Could not play'; btn.disabled = true; });
      function seekTo(clientX) {
        var r = wave.getBoundingClientRect(), x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
        if (audio.readyState < 1) { audio.addEventListener('loadedmetadata', function once() { audio.removeEventListener('loadedmetadata', once); audio.currentTime = x * audio.duration; paint(); }); play(); return; }
        audio.currentTime = x * (audio.duration || 0); row.classList.add('is-started'); paint();
      }
      wave.addEventListener('pointerdown', function (e) { dragging = true; try { wave.setPointerCapture(e.pointerId); } catch (_) {} seekTo(e.clientX); });
      wave.addEventListener('pointermove', function (e) { if (dragging && audio.readyState >= 1) seekTo(e.clientX); });
      wave.addEventListener('pointerup', function () { dragging = false; });
      wave.addEventListener('pointercancel', function () { dragging = false; });
      wave.addEventListener('keydown', function (e) {
        var d = audio.duration || 0, t = audio.currentTime, step = 5;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') t += step;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') t -= step;
        else if (e.key === 'Home') t = 0;
        else if (e.key === 'End') t = d;
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); btn.click(); return; }
        else return;
        e.preventDefault();
        if (audio.readyState < 1) { play(); return; }
        audio.currentTime = Math.max(0, Math.min(d, t)); row.classList.add('is-started'); paint();
      });
    }
    function scan() { document.querySelectorAll('[data-sat] [data-sat-row]').forEach(setup); }
    window.__samplesAudio = { scan: scan };
    document.addEventListener('play', function (e) { if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-sat-audio') && current && current !== e.target) current.pause(); }, true);
    document.addEventListener('shopify:section:load', scan);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  })();
