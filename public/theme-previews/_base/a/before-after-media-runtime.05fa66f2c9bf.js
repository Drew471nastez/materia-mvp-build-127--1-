/* Materia Themes. The comparison slider of Before and After Slider and
   Before/After Slider 2 on the storefront: drag the handle with a pointer or
   touch, click the picture, or use the arrow keys, Page Up/Down, Home and
   End on the focusable role="slider". The section prints the start position
   (--bam-pos on [data-bam-compare]). Before/After Images needs no script.
   The builder loads media-live-before-after.js instead (the same plus live
   edits), so this file stands down there. */
(() => {
  if (window.MateriaBeforeAfterRuntime || window.MateriaBeforeAfterMedia || (window.SlTheme && window.SlTheme.designMode)) return;
  const roots = new Map();
  const clamp = v => Math.min(100, Math.max(0, v));
  const attr = (el, key, value) => { if (!el) return; if (value == null) { if (el.hasAttribute(key)) el.removeAttribute(key); } else if (el.getAttribute(key) !== String(value)) el.setAttribute(key, String(value)); };
  function position(state, now) {
    const apply = () => {
      state.posFrame = 0;
      const box = state.box, handle = state.handle;
      if (!box) return;
      const value = state.pos + '%';
      if (box.style.getPropertyValue('--bam-pos') !== value) box.style.setProperty('--bam-pos', value);
      attr(handle, 'aria-valuenow', Math.round(state.pos)); attr(handle, 'aria-valuetext', Math.round(state.pos) + '%');
    };
    if (now) { cancelAnimationFrame(state.posFrame); apply(); } else if (!state.posFrame) state.posFrame = requestAnimationFrame(apply);
  }
  function move(state, pos, now) {
    state.pos = Math.round(clamp(pos) * 10) / 10;
    position(state, now);
  }
  function wire(root, state) {
    const box = state.box = root.querySelector('[data-bam-compare]'), handle = state.handle = box?.querySelector('[data-bam-handle]');
    if (!box || !handle) return;
    const signal = state.abort.signal, on = (el, name, fn, opts) => { el.addEventListener(name, fn, {...opts, signal}); state.listeners++; };
    let rect = null, pointer = null;
    const at = x => rect && rect.width ? (x - rect.left) / rect.width * 100 : state.pos;
    on(box, 'pointerdown', e => {
      if (e.button > 0 || pointer != null) return;
      rect = box.getBoundingClientRect();
      pointer = e.pointerId;
      try { box.setPointerCapture(pointer); } catch (_) {}
      box.classList.add('is-dragging');
      if (e.pointerType === 'mouse') e.preventDefault();
      if (document.activeElement !== handle) handle.focus({preventScroll: true});
      move(state, at(e.clientX));
    });
    on(box, 'pointermove', e => { if (e.pointerId === pointer) move(state, at(e.clientX)); });
    const end = e => { if (e.pointerId !== pointer) return; pointer = null; box.classList.remove('is-dragging'); try { box.releasePointerCapture(e.pointerId); } catch (_) {} };
    on(box, 'pointerup', end); on(box, 'pointercancel', end); on(box, 'lostpointercapture', end);
    on(box, 'dragstart', e => e.preventDefault());
    on(handle, 'keydown', e => {
      const step = e.shiftKey ? 10 : 1, rtl = getComputedStyle(box).direction === 'rtl' ? -1 : 1;
      const by = {ArrowLeft: -step * rtl, ArrowDown: -step, ArrowRight: step * rtl, ArrowUp: step, PageDown: -10, PageUp: 10}[e.key];
      let next;
      if (by != null) next = state.pos + by; else if (e.key === 'Home') next = 0; else if (e.key === 'End') next = 100; else return;
      e.preventDefault();
      move(state, next, true);
    });
  }
  function init(root) {
    const state = {abort: new AbortController(), listeners: 0, posFrame: 0, pos: 50};
    roots.set(root, state);
    wire(root, state);
    if (state.box) { const p = parseFloat(state.box.style.getPropertyValue('--bam-pos')); state.pos = Number.isFinite(p) ? clamp(p) : 50; }
  }
  function scan() {
    for (const [root, state] of roots) if (!root.isConnected) { state.abort.abort(); cancelAnimationFrame(state.posFrame); roots.delete(root); }
    for (const root of document.querySelectorAll('[data-bam-root]')) if (!roots.has(root)) init(root);
  }
  for (const name of ['DOMContentLoaded', 'shopify:section:load']) document.addEventListener(name, scan);
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches('[data-bam-root]') || n.querySelector('[data-bam-root]'))))) scan();
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.MateriaBeforeAfterRuntime = {scan, roots: () => [...roots.values()].map(s => ({listeners: s.listeners, pos: s.pos}))};
  scan();
})();
