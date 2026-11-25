/* Materia Themes. Announcement Bar Pro 3 (sections/top-bar) on the
   storefront: the message rotator <announcement-rotator-v2> (arrows, swipe,
   autoplay paused off screen, in a hidden tab, on hover and focus, and under
   reduced motion). The theme editor loads live-header.js instead, which
   defines the same element and also applies live setting edits. */
(() => {
  if (window.MateriaLiveHeader || window.MateriaHeaderRuntime) return;
  window.MateriaHeaderRuntime = true;
  /* ---------- 1. rotator ---------- */
  if (!customElements.get('announcement-rotator-v2')) customElements.define('announcement-rotator-v2', class extends HTMLElement {
    connectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected || this.cleanup) return;
        const slides = [...this.querySelectorAll('.topbar-message')];
        const controls = this.parentElement;
        if (!slides.length) return;
        let index = Math.max(0, slides.findIndex(s => s.classList.contains('is-active'))), target = index, dir = 1, timer, visible = true, hovered = false, running = null, disposed = false;
        const motion = matchMedia('(prefers-reduced-motion: reduce)');
        const EASE = 'cubic-bezier(.22,.61,.36,1)';
        const stop = () => clearTimeout(timer);
        const focused = () => !!controls.querySelector(':focus-visible');
        const schedule = () => {
          stop();
          if (disposed || running || slides.length < 2 || motion.matches || !visible || document.hidden || hovered || focused()) return;
          timer = setTimeout(() => show(target + 1, 1), Math.max(1, Number(this.dataset.delay) || 5) * 1000);
        };
        const apply = next => {
          index = next;
          slides.forEach((slide, i) => {
            slide.classList.toggle('is-active', i === index);
            slide.setAttribute('aria-hidden', String(i !== index));
            slide.inert = i !== index;
          });
        };
        const finishNow = () => { if (running) running.forEach(a => { try { a.finish(); } catch (_) {} }); };
        /* Slide (default): the outgoing message leaves and the next one enters
           together, next to the left and previous to the right. Fade: a quick
           cross-fade. Both messages share one grid cell, so the height never
           changes. Clicks during a change queue: the change in flight ends,
           then the bar goes straight to the last message asked for. */
        const run = async () => {
          if (running || disposed) return;
          if (target === index) { schedule(); return; }
          const from = slides[index], to = slides[target];
          const fade = this.dataset.transition === 'fade';
          const rtl = getComputedStyle(this).direction === 'rtl' ? -1 : 1, d = dir * rtl;
          const options = {duration: fade ? 200 : Math.min(1500, Math.max(150, Number(this.dataset.duration) || 380)), easing: fade ? 'ease' : EASE};
          stop();
          from.classList.add('is-leaving');
          apply(target);
          this.dataset.transitioning = 'true';
          running = [
            from.animate(fade ? [{opacity: 1}, {opacity: 0}] : [{transform: 'translate3d(0,0,0)'}, {transform: 'translate3d(' + (-100 * d) + '%,0,0)'}], options),
            to.animate(fade ? [{opacity: 0}, {opacity: 1}] : [{transform: 'translate3d(' + (100 * d) + '%,0,0)'}, {transform: 'translate3d(0,0,0)'}], options),
          ];
          try { await Promise.all(running.map(a => a.finished)); } catch (_) {}
          from.classList.remove('is-leaving');
          running.forEach(a => a.cancel());
          running = null;
          this.dataset.transitioning = 'false';
          if (!disposed) run();
        };
        const show = (next, direction) => {
          target = (next + slides.length) % slides.length;
          dir = direction < 0 ? -1 : 1;
          this.dataset.activeIndex = target;
          stop();
          if (motion.matches || typeof this.animate !== 'function') { finishNow(); apply(target); schedule(); return; }
          run();
        };
        const motionChange = () => { if (motion.matches) { finishNow(); apply(target); } schedule(); };
        let swiped = false;
        const click = event => {
          if (swiped) { swiped = false; if (this.contains(event.target)) { event.preventDefault(); event.stopPropagation(); return; } }
          const button = event.target.closest('.topbar-slider-arrow');
          if (!button || !controls.contains(button)) return;
          event.preventDefault();
          const back = button.classList.contains('topbar-slider-arrow--prev');
          show(target + (back ? -1 : 1), back ? -1 : 1);
        };
        const enter = event => { if (event.pointerType === 'mouse') { hovered = true; stop(); } };
        const leave = event => { if (event.pointerType === 'mouse') { hovered = false; schedule(); } };
        const focusIn = () => { if (focused()) stop(); };
        const focusOut = () => queueMicrotask(schedule);
        /* Swipe: the messages follow the finger (transform in rAF, no
           transition while dragging); the neighbour on the side being pulled
           in is drawn next to it, so both ends wrap with no gap. Release goes
           on when dragged past 20% of the width or flicked faster than
           0.3px/ms, else springs back; both settle in 300ms. A vertical move
           is left to the page (touch-action: pan-y). A tap still follows a link. */
        const SETTLE = 300, EASE_SETTLE = 'cubic-bezier(.22,.61,.36,1)';
        let drag = null, frame = 0;
        const rtlSign = () => getComputedStyle(this).direction === 'rtl' ? -1 : 1;
        const peekOf = dx => {
          if (!dx) return null;
          const step = (dx < 0 ? 1 : -1) * rtlSign();
          return slides[(index + step + slides.length) % slides.length];
        };
        const paint = () => {
          frame = 0;
          if (!drag) return;
          const {dx, w} = drag, cur = slides[index], peek = peekOf(dx);
          if (drag.peek && drag.peek !== peek) { drag.peek.classList.remove('is-leaving'); drag.peek.style.transform = ''; }
          drag.peek = peek && peek !== cur ? peek : null;
          cur.style.transform = 'translate3d(' + dx + 'px,0,0)';
          if (drag.peek) { drag.peek.classList.add('is-leaving'); drag.peek.style.transform = 'translate3d(' + (dx + (dx < 0 ? w : -w)) + 'px,0,0)'; }
        };
        const down = event => {
          if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || slides.length < 2 || event.target.closest('.topbar-slider-arrow')) return;
          swiped = false;
          drag = {id: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, w: this.clientWidth || 1, active: false, peek: null, samples: [[event.timeStamp, event.clientX]]};
        };
        const move = event => {
          if (!drag || event.pointerId !== drag.id) return;
          const dx = event.clientX - drag.x0, dy = event.clientY - drag.y0;
          if (!drag.active) {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
            if (Math.abs(dy) >= Math.abs(dx)) { drag = null; return; } /* vertical: the page scrolls */
            finishNow();
            if (running) return; /* a change still ending: try again on the next move */
            drag.active = true;
            drag.x0 = event.clientX; /* no jump from the 6px slop */
            stop();
            this.dataset.dragging = 'true';
            this.dataset.transitioning = 'true';
            try { this.setPointerCapture(event.pointerId); } catch (_) {}
          }
          drag.dx = event.clientX - drag.x0;
          drag.samples.push([event.timeStamp, event.clientX]);
          while (drag.samples.length > 2 && event.timeStamp - drag.samples[0][0] > 100) drag.samples.shift();
          if (event.cancelable) event.preventDefault();
          if (!frame) frame = requestAnimationFrame(paint);
        };
        const release = (event, cancelled) => {
          if (!drag || (event && event.pointerId !== drag.id)) return;
          const d = drag;
          drag = null;
          if (!d.active) return;
          cancelAnimationFrame(frame); frame = 0;
          try { this.releasePointerCapture(d.id); } catch (_) {}
          swiped = true; setTimeout(() => { swiped = false; }, 400);
          const first = d.samples[0], last = d.samples[d.samples.length - 1];
          const v = last[0] > first[0] ? (last[1] - first[1]) / (last[0] - first[0]) : 0;
          const dx = d.dx, cur = slides[index], peek = peekOf(dx) !== cur ? peekOf(dx) : null;
          if (d.peek && d.peek !== peek) { d.peek.classList.remove('is-leaving'); d.peek.style.transform = ''; }
          const go = !cancelled && peek && dx !== 0 && (Math.abs(dx) > d.w * 0.2 || (Math.abs(v) > 0.3 && Math.sign(v) === Math.sign(dx)));
          const sgn = dx < 0 ? -1 : 1, w = d.w;
          const curEnd = go ? sgn * w : 0, peekStart = dx - sgn * w, peekEnd = go ? 0 : -sgn * w;
          const options = {duration: motion.matches ? 0 : SETTLE, easing: EASE_SETTLE, fill: 'forwards'};
          const t = x => 'translate3d(' + x + 'px,0,0)';
          if (peek) peek.classList.add('is-leaving');
          running = [cur.animate([{transform: t(dx)}, {transform: t(curEnd)}], options)];
          if (peek) running.push(peek.animate([{transform: t(peekStart)}, {transform: t(peekEnd)}], options));
          cur.style.transform = ''; if (peek) peek.style.transform = '';
          delete this.dataset.dragging;
          const anims = running;
          Promise.all(anims.map(a => a.finished)).catch(() => {}).then(() => {
            if (go) { cur.classList.add('is-leaving'); apply(slides.indexOf(peek)); target = index; this.dataset.activeIndex = String(index); }
            cur.classList.remove('is-leaving'); if (peek) peek.classList.remove('is-leaving');
            anims.forEach(a => a.cancel());
            if (running === anims) running = null;
            this.dataset.transitioning = 'false';
            if (!disposed) { if (target !== index) run(); else schedule(); }
          });
        };
        const up = event => release(event, false);
        const cancel = event => release(event, true);
        /* only our own capture ending counts: a touch's implicit capture on the
           text moving to the rotator also fires (and bubbles) lostpointercapture */
        const lost = event => { if (event.target === this) release(event, true); };
        const noDrag = event => { if (this.contains(event.target)) event.preventDefault(); };
        controls.addEventListener('click', click, true);
        controls.addEventListener('pointerenter', enter);
        controls.addEventListener('pointerleave', leave);
        controls.addEventListener('focusin', focusIn);
        controls.addEventListener('focusout', focusOut);
        this.addEventListener('pointerdown', down);
        this.addEventListener('pointermove', move);
        this.addEventListener('pointerup', up);
        this.addEventListener('pointercancel', cancel);
        this.addEventListener('lostpointercapture', lost);
        this.addEventListener('dragstart', noDrag);
        document.addEventListener('visibilitychange', schedule);
        motion.addEventListener('change', motionChange);
        const observer = new IntersectionObserver(entries => {
          visible = entries[0].isIntersecting;
          schedule();
        });
        observer.observe(this);
        controls.querySelectorAll('.topbar-slider-arrow').forEach(button => { button.disabled = slides.length < 2; });
        /* Time per message changed in the builder: the next turn uses it. */
        const delayWatch = new MutationObserver(schedule);
        delayWatch.observe(this, {attributes: true, attributeFilter: ['data-delay']});
        this.cleanup = () => {
          disposed = true;
          stop(); finishNow(); observer.disconnect(); delayWatch.disconnect();
          controls.removeEventListener('click', click, true);
          controls.removeEventListener('pointerenter', enter);
          controls.removeEventListener('pointerleave', leave);
          controls.removeEventListener('focusin', focusIn);
          controls.removeEventListener('focusout', focusOut);
          this.removeEventListener('pointerdown', down);
          this.removeEventListener('pointermove', move);
          this.removeEventListener('pointerup', up);
          this.removeEventListener('pointercancel', cancel);
          this.removeEventListener('lostpointercapture', lost);
          this.removeEventListener('dragstart', noDrag);
          cancelAnimationFrame(frame);
          document.removeEventListener('visibilitychange', schedule);
          motion.removeEventListener('change', motionChange);
        };
        apply(index);
        this.dataset.activeIndex = String(index);
        this.dataset.transitioning = 'false';
        schedule();
      });
    }
    disconnectedCallback() { this.cleanup?.(); this.cleanup = null; }
  });
})();
