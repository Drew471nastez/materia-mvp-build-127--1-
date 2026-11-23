
    (function () {
      if (window.StorelibFormModal) { window.StorelibFormModal.scan(); return; }
      var reduce = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
      var design = !!(window.SlTheme && window.SlTheme.designMode);
      var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
      var current = null, opener = null, lock = null;
      function find(key) {
        if (!key) return null;
        key = String(key).toLowerCase();
        var all = document.querySelectorAll('dialog[data-form-modal]');
        for (var i = 0; i < all.length; i++) {
          var d = all[i];
          if (d.getAttribute('data-form-modal') === key || 'section-' + d.getAttribute('data-section') === key || 'shopify-section-' + d.getAttribute('data-section') === key) return d;
        }
        return null;
      }
      function keyOf(href) {
        if (!href) return null;
        var i = href.indexOf('#');
        if (i < 0) return null;
        var path = href.slice(0, i), hash = decodeURIComponent(href.slice(i + 1));
        if (path) {
          /* Another page's form opens when that page arrives (scan reads the hash), so only this page's links are caught. */
          try { var u = new URL(path, location.href); if (u.origin !== location.origin || u.pathname.replace(/\/$/, '') !== location.pathname.replace(/\/$/, '')) return null; } catch (e) { return null; }
        }
        if (/^open-form-/.test(hash)) return hash.slice(10);
        return find(hash) ? hash : null;
      }
      function lockScroll() {
        var de = document.documentElement, gap = innerWidth - de.clientWidth;
        /* A page that keeps its scrollbar's room (scrollbar-gutter: stable) does not move when the bar goes. */
        if (/stable/.test(getComputedStyle(de).scrollbarGutter || '')) gap = 0;
        lock = { o: de.style.overflow, p: document.body.style.paddingRight };
        de.style.overflow = 'hidden';
        if (gap > 0) document.body.style.paddingRight = gap + 'px';
      }
      function unlockScroll() {
        if (!lock) return;
        document.documentElement.style.overflow = lock.o;
        document.body.style.paddingRight = lock.p;
        lock = null;
      }
      function focusables(d) {
        return [].filter.call(d.querySelectorAll(FOCUSABLE), function (n) { return n.getClientRects().length && !n.closest('[hidden]'); });
      }
      function open(d, from) {
        if (!d || d.open) return;
        if (current && current !== d) close(current, true);
        opener = from || document.activeElement;
        current = d;
        d.removeAttribute('data-state');
        try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
        lockScroll();
        var panel = d.querySelector('[data-fm-panel]');
        panel.scrollTop = 0;
        requestAnimationFrame(function () { requestAnimationFrame(function () { d.setAttribute('data-state', 'open'); }); });
        /* A computer: straight into the first field. A phone: the sheet, so the keyboard does not cover it on arrival. */
        var fine = innerWidth > 640;
        var first = d.hasAttribute('data-sent') ? d.querySelector('[data-fm-done]') : d.querySelector('.fm__input');
        (fine && first ? first : panel).focus({ preventScroll: true });
        try { document.dispatchEvent(new CustomEvent('storelib:form-modal-open', { detail: { key: d.getAttribute('data-form-modal') } })); } catch (e) {}
      }
      function close(d, now) {
        if (!d || !d.open || d.hasAttribute('data-closing')) return;
        var finish = function () {
          d.removeAttribute('data-closing');
          d.style.removeProperty('--fm-drag');
          try { d.close(); } catch (e) { d.removeAttribute('open'); }
          if (current === d) current = null;
          unlockScroll();
          if (!now && opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
          opener = null;
        };
        d.removeAttribute('data-state');
        if (now || reduce()) { finish(); return; }
        d.setAttribute('data-closing', '');
        var panel = d.querySelector('[data-fm-panel]'), done = false;
        var end = function (e) { if (e && e.target !== panel) return; if (done) return; done = true; panel.removeEventListener('transitionend', end); finish(); };
        panel.addEventListener('transitionend', end);
        setTimeout(end, 420);
      }
      function sendBody(d, f) {
        var body = f.querySelector('[data-fm-body]');
        if (!body) return;
        var parts = [], msg = f.querySelector('[name="contact[message]"]');
        if (msg && msg.value.trim()) parts.push(msg.value.trim());
        [].forEach.call(f.querySelectorAll('[data-fm-extra]'), function (i) { if (i.value.trim()) parts.push(i.getAttribute('data-fm-extra') + ': ' + i.value.trim()); });
        if (!msg || !msg.value.trim()) parts.unshift('Sent from the form "' + (d.getAttribute('data-topic') || 'Form') + '".');
        body.value = parts.join('\n\n');
      }
      function sent(d) {
        var f = d.querySelector('form');
        if (f) f.reset();
        d.setAttribute('data-sent', '');
        var done = d.querySelector('[data-fm-done]');
        if (done && d.contains(document.activeElement)) done.focus({ preventScroll: true });
        try { document.dispatchEvent(new CustomEvent('storelib:form-modal-sent', { detail: { key: d.getAttribute('data-form-modal') } })); } catch (x) {}
      }
      /* The theme's form script (materia-forms.js) sends a form marked data-mt-inline-* itself, from the
         window's capture phase, and says how it went in the form's data-state; without it, this sends. */
      function watchState(d, f) {
        if (!window.MutationObserver) return;
        new MutationObserver(function () {
          var s = f.getAttribute('data-state');
          if (s === 'done' && !d.hasAttribute('data-sent')) sent(d);
        }).observe(f, { attributes: true, attributeFilter: ['data-state'] });
      }
      function submit(e) {
        var f = e.target;
        var d = f && f.closest && f.closest('dialog[data-form-modal]');
        if (!d || !f.matches('form')) return;
        if (d.getAttribute('data-kind') === 'contact') sendBody(d, f);
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (f.getAttribute('data-state') === 'sending') return;
        var err = f.querySelector('[data-fm-error]');
        if (err) err.textContent = '';
        var trap = f.querySelector('[name="company"]');
        if (trap && trap.value) { sent(d); return; }
        var data = new FormData(f);
        f.setAttribute('data-state', 'sending');
        var bad = function (m) { f.setAttribute('data-state', 'error'); if (err) err.textContent = m || f.getAttribute('data-error-message') || 'That did not send. Try again in a moment.'; };
        if (design) { f.setAttribute('data-state', 'done'); sent(d); return; }
        fetch('/contact', { method: 'POST', body: data, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } })
          .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
          .then(function (x) { if (x && x.ok) { f.setAttribute('data-state', 'done'); sent(d); } else bad(x && x.message); })
          .catch(function () { bad(); });
      }
      function drag(d) {
        var panel = d.querySelector('[data-fm-panel]'), handle = d.querySelector('[data-fm-handle]');
        if (!handle || handle.__fm) return;
        handle.__fm = 1;
        var y0 = null, dy = 0;
        handle.addEventListener('pointerdown', function (e) { y0 = e.clientY; dy = 0; panel.setAttribute('data-dragging', ''); try { handle.setPointerCapture(e.pointerId); } catch (x) {} });
        handle.addEventListener('pointermove', function (e) { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); d.style.setProperty('--fm-drag', dy + 'px'); });
        var up = function () { if (y0 === null) return; y0 = null; panel.removeAttribute('data-dragging'); if (dy > Math.min(140, panel.offsetHeight * .25)) close(d); else d.style.removeProperty('--fm-drag'); };
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      }
      function wire(d) {
        if (d.__fm) return;
        d.__fm = 1;
        d.addEventListener('cancel', function (e) { e.preventDefault(); close(d); });
        d.addEventListener('click', function (e) { if (e.target.closest('[data-fm-close]')) { e.preventDefault(); close(d); } });
        d.addEventListener('keydown', function (e) {
          if (e.key !== 'Tab') return;
          var list = focusables(d);
          if (!list.length) return;
          var a = list[0], z = list[list.length - 1];
          if (e.shiftKey && (document.activeElement === a || !d.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
          else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        });
        d.addEventListener('submit', submit);
        var f = d.querySelector('form');
        if (f) {
          var pg = f.querySelector('[data-fm-page]');
          if (pg) pg.value = location.pathname;
          watchState(d, f);
          /* The message is written as it is typed, and again on the button's click (Enter in a field clicks it too),
             because the theme's script reads the form before this section's submit listener runs. */
          if (d.getAttribute('data-kind') === 'contact') {
            var sync = function () { sendBody(d, f); };
            sync();
            f.addEventListener('input', sync);
            f.addEventListener('change', sync);
            f.addEventListener('click', sync, true);
          }
        }
        drag(d);
        if (d.querySelector('[data-fm-posted]')) { d.setAttribute('data-sent', ''); open(d); }
      }
      function scan() {
        [].forEach.call(document.querySelectorAll('dialog[data-form-modal]'), wire);
        var k = keyOf(location.hash);
        if (k && !current) open(find(k));
      }
      document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button) return;
        var t = e.target && e.target.closest && e.target.closest('[data-open-form], a[href*="#"]');
        if (!t) return;
        var k = t.hasAttribute('data-open-form') ? t.getAttribute('data-open-form') : keyOf(t.getAttribute('href'));
        var d = find(k);
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        if (d.hasAttribute('data-sent') && !d.querySelector('[data-fm-posted]')) d.removeAttribute('data-sent');
        open(d, t);
      }, true);
      addEventListener('hashchange', function () { var k = keyOf(location.hash); if (k) open(find(k)); });
      document.addEventListener('shopify:section:load', scan);
      window.StorelibFormModal = { open: function (k) { open(find(k)); }, close: function () { close(current); }, scan: scan };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
    })();
  