
(() => {
  if (!window.StorelibStickyStack) {
    let frame, top = 0;
    const html = document.documentElement;
    const sectionOf = el => el.closest('.shopify-section, [id^="shopify-section-"]');
    const observed = new Set();
    const heights = new WeakMap();
    const written = new WeakMap();
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const box = entry.borderBoxSize && entry.borderBoxSize[0];
        heights.set(entry.target, box ? box.blockSize : entry.target.getBoundingClientRect().height);
      }
      update();
    });
    const attributes = new MutationObserver(schedule);
    function update() {
      if (frame != null) { cancelAnimationFrame(frame); frame = null; }
      const header = document.querySelector('header.header[data-sticky]');
      const bars = [...document.querySelectorAll('[data-sticky-announcement]')];
      const current = new Set(bars.flatMap(bar => [bar, sectionOf(bar)]).filter(Boolean));
      let changed = false;
      for (const el of observed) if (!current.has(el)) { observer.unobserve(el); observed.delete(el); changed = true; }
      for (const el of current) if (!observed.has(el)) { observed.add(el); observer.observe(el); changed = true; }
      if (changed) {
        attributes.disconnect();
        attributes.observe(html, {attributes: true, attributeFilter: ['class']});
        for (const el of observed) attributes.observe(el, {attributes: true, attributeFilter: ['data-sticky-announcement', 'hidden', 'class']});
      }
      let offset = 0;
      const tops = new Map();
      for (const bar of bars) {
        const root = sectionOf(bar);
        if (!root) continue;
        tops.set(root, offset);
        if (bar.dataset.stickyAnnouncement !== 'true') continue;
        if (header && !(bar.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        const height = heights.get(root) || 0;
        if (!height) continue;
        if (!heights.get(bar) && !bar.getClientRects().length) continue;
        const style = getComputedStyle(bar);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        offset += height;
      }
      for (const [root, value] of tops) {
        if (written.get(root) === value) continue;
        written.set(root, value);
        root.style.setProperty('--storelib-announcement-top', value + 'px');
      }
      const px = Math.max(0, offset) + 'px';
      if (written.get(html) !== px) {
        written.set(html, px);
        top = Math.max(0, offset);
        window.StorelibHeaderSticky?.refresh();
      }
    }
    function schedule() { if (frame == null) frame = requestAnimationFrame(update); }
    const watch = () => new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
          (node.matches?.('[data-sticky-announcement], header.header') || node.querySelector?.('[data-sticky-announcement], header.header'))))) schedule();
    }).observe(html, {subtree: true, childList: true});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { watch(); schedule(); }, {once: true});
    else watch();
    addEventListener('resize', schedule, {passive:true});
    document.addEventListener('shopify:section:load', schedule);
    document.addEventListener('shopify:section:unload', schedule);
    window.StorelibStickyStack = {refresh: schedule, get top() { return top; }};
  }
  window.StorelibStickyStack.refresh();
})();
(() => {
  if (!window.StorelibHeaderSticky) {
    let state, frame, maxScroll = Infinity;
    let measured = document.readyState === 'complete';
    const html = document.documentElement;
    const wide = matchMedia('(min-width: 1025px)');
    const legacy = ['animate', 'scr-pass-header', 'sl-hdr-hidden', 'sl-header-snap'];
    const findHeader = () => document.querySelector('header.header[data-sticky]');
    const setVar = (el, name, value) => { if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value); };
    const teardown = () => {
      state?.resize?.disconnect();
      state?.attributes?.disconnect();
      state?.marker?.remove();
    };
    const setup = header => {
      teardown();
      const section = header.closest('.section-header, .shopify-section, [id^="shopify-section-"]');
      if (!section) return null;
      const own = {header, section, mode: null, hidden: false, height: 0, lastY: 0, turnY: 0, dir: 0};
      own.resize = new ResizeObserver(entries => {
        if (state !== own) return;
        const box = entries[entries.length - 1].borderBoxSize?.[0];
        const height = Math.round(box ? box.blockSize : header.offsetHeight);
        if (height && height !== own.height && height < innerHeight * 0.7) { own.height = height; schedule(); }
      });
      own.resize.observe(header);
      own.attributes = new MutationObserver(schedule);
      own.attributes.observe(header, {attributes: true, attributeFilter: ['data-sticky', 'data-sticky-mobile', 'class']});
      releaseGroup(section);
      own.marker = document.createElement('span');
      own.marker.dataset.headerAnchor = '';
      own.marker.setAttribute('aria-hidden', 'true');
      section.before(own.marker);
      return own;
    };
    const releaseGroup = section => {
      const group = section.parentElement;
      if (!group || group === document.body || group.tagName === 'MAIN' || group.querySelector('main')) return;
      const holdsBars = [...group.children].some(el => el !== section && el.nodeType === 1 && (el.matches('.shopify-section, [id^="shopify-section-"]') || el.dataset.headerAnchor != null));
      if (!holdsBars) return;
      if (group.style.getPropertyValue('display') !== 'contents') {
        group.style.setProperty('display', 'contents', 'important');
        if (state) state.markerDoc = null;
      }
    };
    const update = () => {
      frame = null;
      const header = findHeader();
      if (!header) { teardown(); state = null; return; }
      if (!state || state.header !== header || !state.section.isConnected) {
        state = setup(header);
        if (!state) return;
      }
      if (!state.marker.isConnected) state.section.before(state.marker);
      releaseGroup(state.section);
      const s = state, {section} = s;
      let mode = header.dataset.sticky;
      if (!['always', 'on-scroll-up'].includes(mode) || (!wide.matches && header.dataset.stickyMobile === 'false')) mode = 'none';
      const pill = header.classList.contains('is-pill');
      const stickyHeight=Math.max(0,window.StorelibStickyStack?.top||0);
      let top=stickyHeight;
      if(pill&&getComputedStyle(section).position==='fixed'){
        document.querySelectorAll('[data-sticky-announcement]').forEach(bar=>{
          if(!(bar.compareDocumentPosition(header)&Node.DOCUMENT_POSITION_FOLLOWING))return;
          const r=bar.getBoundingClientRect();if(r.height&&getComputedStyle(bar).visibility!=='hidden')top=Math.max(top,r.bottom);
        });
      }
      setVar(html,'--height-bar',stickyHeight+'px');
      if (scrollY > maxScroll) maxScroll = Math.max(0, html.scrollHeight - innerHeight);
      const y = measured ? Math.min(Math.max(0, scrollY), maxScroll) : 0;
      if (!s.height && y > 0) s.height = Math.round(header.getBoundingClientRect().height);
      const height = s.height;
      if (s.stackTop !== top || s.markerDoc == null) {
        s.stackTop = top;
        if (s.marker.isConnected) s.markerDoc = s.marker.getBoundingClientRect().top + scrollY;
      }
      const slot = y > 0 && s.markerDoc != null ? s.markerDoc - y : Infinity;
      if (s.fresh) { s.fresh = false; s.lastY = s.turnY = y; s.dir = 0; s.hidden = false; }
      {
        if (mode === 'on-scroll-up' && !pill) {
          const delta = y - s.lastY;
          const dir = delta > 0 ? 1 : delta < 0 ? -1 : s.dir;
          if (dir !== s.dir) { s.dir = dir; s.turnY = s.lastY; }
          const away = slot + height <= top + 1;
          const held = header.matches(':hover') && !!header.querySelector('.menu-parent.visible');
          if (s.reveal) { s.reveal = false; s.hidden = false; s.turnY = y; }
          if (!away || held || y <= 0) s.hidden = false;
          else if (dir > 0 && y - s.turnY > 12) s.hidden = true;
          else if (dir < 0 && s.turnY - y > 8) s.hidden = false;
        } else {
          s.hidden = false;
        }
        s.lastY = y;
      }
      const overlay = (header.classList.contains('transparent') && wide.matches) ||
        (header.classList.contains('transparent-mobile') && !wide.matches);
      if (mode !== s.mode) {
        s.mode = mode;
        section.classList.remove(...legacy);
        s.hidden = false;
      }
      if (section.dataset.storelibSticky !== mode) section.dataset.storelibSticky = mode;
      section.toggleAttribute('data-sticky-always', mode === 'always');
      section.classList.toggle('scroll-up', mode === 'on-scroll-up');
      const scrolled = mode !== 'none' && y > 8;
      section.classList.toggle('shopify-section-header-sticky', scrolled);
      section.classList.toggle('header-sticky', scrolled && slot <= top + 1);
      section.classList.toggle('shopify-section-header-hidden', s.hidden);
      const root = document.documentElement;
      if (root.hasAttribute('data-header-stuck') !== scrolled) root.toggleAttribute('data-header-stuck', scrolled);
      if (root.hasAttribute('data-header-hidden') !== !!s.hidden) root.toggleAttribute('data-header-hidden', !!s.hidden);
      const layout2 = section.classList.contains('layout-2');
      if (root.hasAttribute('data-header-layout-2') !== layout2) root.toggleAttribute('data-header-layout-2', layout2);
      const margin = overlay && height ? -height + 'px' : '';
      if (s.margin !== margin) {
        s.margin = margin;
        if (margin) section.style.setProperty('margin-bottom', margin, 'important');
        else section.style.removeProperty('margin-bottom');
      }
      const px = top + 'px';
      setVar(html, '--storelib-header-top', px);
      setVar(html, '--sl-header-offset', px);
      const pinned = mode !== 'none' && !s.hidden ? height : 0;
      const stickyTop = Math.round(top + pinned) + 'px';
      setVar(html, '--sticky-top', stickyTop);
      setVar(html, '--product-sticky-top', stickyTop);
    };
    function schedule() { if (frame == null) frame = requestAnimationFrame(update); }
    const watch = () => new MutationObserver(records => {
      for (const r of records) for (const n of [...r.addedNodes, ...r.removedNodes]) {
        if (n.nodeType === 1 && (n.matches('header.header[data-sticky], .shopify-section-group-header-group') || n.querySelector?.('header.header[data-sticky]'))) {
          if (state) state.markerDoc = null;
          return schedule();
        }
      }
    }).observe(html, {subtree: true, childList: true});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { watch(); schedule(); }, {once: true});
    else watch();
    new MutationObserver(schedule).observe(html, {attributes: true, attributeFilter: ['class']});
    const seen = () => { measured = true; };
    addEventListener('scroll', seen, {passive: true, once: true});
    addEventListener('scroll', schedule, {passive: true});
    addEventListener('resize', () => {
      maxScroll = Math.max(0, html.scrollHeight - innerHeight);
      if (state) state.markerDoc = null;
      schedule();
    }, {passive: true});
    addEventListener('pageshow', () => { seen(); schedule(); });
    addEventListener('load', () => { seen(); schedule(); }, {once: true});
    wide.addEventListener?.('change', () => {
      if (state) { state.fresh = true; state.height = 0; }
      schedule();
    });
    const editorRedraw = () => {
      measured = true;
      maxScroll = Infinity;
      if (state) { state.markerDoc = null; state.stackTop = null; }
      schedule();
    };
    document.addEventListener('storelib:settings-change', editorRedraw);
    let tabbing = false;
    document.addEventListener('keydown', e => { tabbing = e.key === 'Tab'; }, true);
    document.addEventListener('pointerdown', () => { tabbing = false; }, true);
    document.addEventListener('focusin', e => {
      if (tabbing && state?.header.contains(e.target)) { state.reveal = true; schedule(); }
    });
    ['storelib:section-load', 'shopify:section:load', 'shopify:section:unload'].forEach(n => document.addEventListener(n, editorRedraw));
    window.StorelibHeaderSticky = {register: schedule, refresh: schedule};
  }
  window.StorelibHeaderSticky.refresh();
})();
