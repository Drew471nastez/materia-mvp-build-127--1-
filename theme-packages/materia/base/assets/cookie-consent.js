/* Materia Themes. Cookies and consent: <cookie-consent> in snippets/content-bottom.
   The choice is kept in localStorage ("materia:consent": accepted, when, and
   when it expires) and announced as a `materia:consent` event on document
   with detail { accepted }. Other scripts can also read
   window.materiaConsent.get() (null until a choice is made). In the builder it
   shows only with "Show in the builder" on, and follows setting changes live. */
(() => {
  if (window.customElements?.get('cookie-consent')) return;
  const KEY = 'materia:consent';
  const CLOSED = 'materia:consent-closed';
  const DAY = 864e5;
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const read = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || typeof value.accepted !== 'boolean' || !(Number(value.expires) > Date.now())) {
        localStorage.removeItem(KEY);
        return null;
      }
      return value;
    } catch (_) { return null; }
  };
  const CATS = ['analytics', 'marketing', 'preferences'];
  /* true / false for all, or { analytics, marketing, preferences } */
  const prefsOf = choice => {
    const out = {};
    CATS.forEach(k => { out[k] = typeof choice === 'boolean' ? choice : Boolean(choice && choice[k]); });
    return out;
  };
  const write = (choice, days) => {
    const now = Date.now();
    const prefs = prefsOf(choice);
    const accepted = CATS.every(k => prefs[k]);
    const value = { accepted, prefs, at: now, expires: now + Math.max(1, Number(days) || 180) * DAY };
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (_) {}
    return value;
  };
  const closedThisVisit = () => { try { return sessionStorage.getItem(CLOSED) === '1'; } catch (_) { return false; } };
  const rememberClosed = () => { try { sessionStorage.setItem(CLOSED, '1'); } catch (_) {} };
  const announce = (accepted, stored, prefs) => {
    document.dispatchEvent(new CustomEvent('materia:consent', { detail: { accepted, stored: Boolean(stored), prefs: prefs || prefsOf(accepted) } }));
  };

  /* the platform's Customer Privacy API (window.Shopify.customerPrivacy), loaded
     on demand. cb(api or null); never waits more than `wait` ms. */
  const withPrivacy = (cb, wait = 2500) => {
    const S = window.Shopify;
    let done = false;
    const finish = api => { if (done) return; done = true; cb(api || null); };
    if (!S || S.designMode) return finish(null);
    if (S.customerPrivacy) return finish(S.customerPrivacy);
    if (typeof S.loadFeatures !== 'function') return finish(null);
    setTimeout(() => finish(null), wait);
    try { S.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], error => finish(error ? null : S.customerPrivacy)); } catch (_) { finish(null); }
  };
  /* Does this visitor still need to be asked? Not where the platform says the
     region needs no banner, nor when a choice is already on record there. */
  const needsBanner = (el, cb) => {
    if (el.dataset.region === 'false') return cb(true);
    withPrivacy(api => {
      if (!api) return cb(true);
      try {
        if (typeof api.shouldShowBanner === 'function' && !api.shouldShowBanner()) return cb(false);
        const current = typeof api.currentVisitorConsent === 'function' ? api.currentVisitorConsent() : null;
        if (current && CATS.some(k => current[k] === 'yes' || current[k] === 'no')) return cb(false);
      } catch (_) {}
      cb(true);
    });
  };

  window.materiaConsent = window.materiaConsent || {
    get: read,
    reset() {
      try { localStorage.removeItem(KEY); sessionStorage.removeItem(CLOSED); } catch (_) {}
    },
    open() { document.querySelector('cookie-consent')?.show(true); },
  };

  const colour = value => {
    if (value == null) return '';
    if (typeof value === 'object') value = value.hex || value.value || value.color || '';
    const text = String(value).trim();
    if (!text || text === 'transparent' || /^rgba\([^)]*,\s*0(\.0+)?\s*\)$/i.test(text) || /^#[0-9a-f]{6}00$/i.test(text)) return '';
    return text;
  };
  const yes = value => value === true || value === 'true';
  const LEGACY = { full: 'bottom_bar', 'card-left': 'bottom_left', 'card-right': 'bottom_right', top: 'top_bar' };
  /* The builder's canvas: Liquid's request.design_mode, or the editor flags. */
  const inBuilder = el => el.dataset.design === 'true' || Boolean(window.Shopify && window.Shopify.designMode) || document.documentElement.classList.contains('shopify-design-mode');
  /* Open cart drawer, search, phone menu or another drawer: the banner steps
     behind it and comes back when it closes. */
  const COVER_HTML = ['open-drawer', 'open-minicart', 'open-search', 'nav-open', 'open-sidebar', 'open-popup'];
  /* (#minicart_wrapper always carries the class open_drawer, open or not: the
     html class open-minicart says when it is open.) */
  const COVERS = '.tingle-modal--visible, .mcp-backdrop.open, .loc-sheet-backdrop.open, cart-drawer[open], .drawer.active, menu-drawer[open], details[open] > .menu-drawer, [data-storelib-drawer][open]';
  const covered = () => {
    const html = document.documentElement;
    if (COVER_HTML.some(name => html.classList.contains(name) || document.body?.classList.contains(name))) return true;
    try { return Boolean(document.querySelector(COVERS)); } catch (_) { return false; }
  };
  const pageAllowed = (pages, page) => pages === 'home' ? page === 'home' : pages === 'not_cart' ? page !== 'cart' : true;

  class CookieConsent extends HTMLElement {
    connectedCallback() {
      if (this._ready) return;
      this._ready = true;
      this.panel = this.querySelector('[data-consent-panel]');
      this.design = inBuilder(this);
      this.closeWanted = !this.querySelector('[data-consent="close"]')?.hidden;
      this.onKey = this.onKey.bind(this);
      this.place = this.place.bind(this);
      this.syncCover = this.syncCover.bind(this);
      this.addEventListener('click', event => {
        const action = event.target.closest?.('[data-consent]')?.dataset.consent;
        if (action === 'accept') this.choose(true);
        else if (action === 'decline') this.choose(false);
        else if (action === 'close') this.dismiss();
        else if (action === 'prefs') this.togglePrefs();
        else if (event.target.closest?.('[data-consent-backdrop]')) this.dismiss();
        else if (action === 'save') this.choose(this.readPrefs());
      });
      if (this.design) return this.startPreview();
      const stored = read();
      if (stored) { announce(stored.accepted, true, stored.prefs); return; }
      if (this.dataset.enabled !== 'true' || this.dataset.pageOk === 'false') return;
      if (this.dataset.frequency === 'session' && closedThisVisit()) return;
      const delay = Math.max(0, Number(this.dataset.delay) || 0) * 1000;
      const started = Date.now();
      needsBanner(this, need => {
        if (!need || !this.isConnected) return;
        this.timer = setTimeout(() => this.show(), Math.max(0, delay - (Date.now() - started)));
      });
    }

    disconnectedCallback() {
      clearTimeout(this.timer);
      if (this.isOpen) this.lock(false);
      document.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('resize', this.place);
      this.watchCover(false);
    }

    /* Hide while a drawer, search or menu is open; back when it closes. */
    syncCover() {
      const on = this.isOpen && covered();
      if (on === this.hasAttribute('data-covered')) return;
      this.toggleAttribute('data-covered', on);
      if (on && this.contains(document.activeElement)) {
        try { document.activeElement.blur(); } catch (_) {}
      }
    }
    watchCover(on) {
      if (!on) { this.coverWatch?.disconnect(); this.coverWatch = null; this.removeAttribute('data-covered'); return; }
      if (this.coverWatch) return;
      let frame = 0;
      this.coverWatch = new MutationObserver(() => {
        if (frame) return;
        frame = requestAnimationFrame(() => { frame = 0; this.syncCover(); });
      });
      this.coverWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) this.coverWatch.observe(document.body, { attributes: true, attributeFilter: ['class', 'open'], subtree: true });
      this.syncCover();
    }

    /* will-change only while the panel moves in or out */
    will() {
      const els = [this.panel, this.querySelector('[data-consent-backdrop]')].filter(Boolean);
      els.forEach(el => { el.style.willChange = 'transform, opacity'; });
      clearTimeout(this.willTimer);
      this.willTimer = setTimeout(() => els.forEach(el => el.style.removeProperty('will-change')), 380);
    }
    get modal() { return this.dataset.position === 'modal'; }
    /* A modal or a dimmed banner holds focus and the page until it is answered or closed. */
    get blocking() { return this.modal || this.dataset.backdrop === 'true'; }
    get required() { return this.dataset.require === 'true'; }
    /* Page scroll held with listeners, not styles (a style change on <html>
       re-styled the whole page in the opening frame). Inside the panel it scrolls. */
    lock(on) {
      const html = document.documentElement;
      if (!this.stopScroll) {
        const inside = (t, dy) => {
          for (let el = t; el && el.nodeType === 1 && this.panel.contains(el); el = el.parentElement) {
            if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return true;
          }
          return false;
        };
        let y0 = 0;
        this.stopScroll = {
          wheel: e => { if (!inside(e.target, e.deltaY)) e.preventDefault(); },
          touchstart: e => { y0 = e.touches[0] ? e.touches[0].clientY : 0; },
          touchmove: e => { const y = e.touches[0] ? e.touches[0].clientY : y0; if (!inside(e.target, y0 - y)) e.preventDefault(); },
          keydown: e => { if (/^( |PageUp|PageDown|Home|End|ArrowUp|ArrowDown)$/.test(e.key) && !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target.tagName || '') && !inside(e.target, /Up|Home/.test(e.key) ? -1 : 1)) e.preventDefault(); }
        };
      }
      const want = Boolean(on && this.blocking && !this.design);
      if (want === Boolean(this.scrollHeld)) return;
      this.scrollHeld = want;
      for (const [type, fn] of Object.entries(this.stopScroll)) {
        if (want) document.addEventListener(type, fn, { passive: type === 'touchstart', capture: true });
        else document.removeEventListener(type, fn, { capture: true });
      }
      html.toggleAttribute('data-cookie-lock', want);
    }

    /* Lift a bottom banner above the mobile navigation bar while that bar shows. */
    place() {
      let offset = 0;
      if (this.dataset.aboveNav !== 'false' && this.dataset.position !== 'top_bar') {
        const nav = document.querySelector('mobile-navigation-bar');
        if (nav && nav.getClientRects().length && getComputedStyle(nav).display !== 'none' && getComputedStyle(nav).visibility !== 'hidden') {
          const rect = nav.getBoundingClientRect();
          if (rect.height > 0 && rect.top < window.innerHeight && rect.bottom >= window.innerHeight - 4) offset = Math.round(window.innerHeight - rect.top);
        }
      }
      this.style.setProperty('--cookie-nav-offset', offset + 'px');
    }

    show(force) {
      if (this.isOpen) return;
      // In the builder it shows only with "Show in the builder" on, even when asked to open.
      if (this.design && this.dataset.preview !== 'true') return;
      if (!force && this.design && this.dataset.pageOk === 'false') return;
      clearTimeout(this.timer);
      clearTimeout(this.hideTimer);
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.syncRole();
      this.hidden = false;
      this.place();
      window.addEventListener('resize', this.place, { passive: true });
      document.addEventListener('keydown', this.onKey, true);
      this.watchCover(true);
      // One frame hidden-to-shown, so the entrance runs from its start.
      void this.offsetWidth;
      requestAnimationFrame(() => {
        this.will();
        this.setAttribute('data-open', '');
        /* once the entrance has finished, what sits low on the screen measures it again */
        clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => { if (this.isOpen) this.setAttribute('data-settled', ''); }, 360);
        /* focus goes to the banner itself (no choice pre-selected); Tab then reaches its buttons */
        if (this.blocking && !this.hasAttribute('data-covered') && !this.design) this.panel.focus({ preventScroll: true });
      });
      this.lock(true);
    }

    hide() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.will();
      this.removeAttribute('data-open');
      clearTimeout(this.settleTimer); this.removeAttribute('data-settled');
      this.lock(false);
      if (this.dataset.view) this.togglePrefs(false);
      document.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('resize', this.place);
      this.watchCover(false);
      const hadFocus = this.contains(document.activeElement);
      const done = () => { if (!this.isOpen) this.hidden = true; };
      if (this.dataset.animation === 'none' || reduced()) done();
      else this.hideTimer = setTimeout(done, 240);
      if (hadFocus && this.lastFocus?.isConnected && this.lastFocus !== document.body) {
        try { this.lastFocus.focus({ preventScroll: true }); } catch (_) {}
      }
    }

    choose(choice) {
      const prefs = prefsOf(choice);
      const accepted = CATS.every(k => prefs[k]);
      if (!this.design) write(prefs, this.dataset.expiry);
      announce(accepted, false, prefs);
      this.hide();
    }

    /* Preferences: the category switches under the message, and Save. */
    togglePrefs(open) {
      const box = this.querySelector('[data-consent-prefs]');
      if (!box) return;
      const on = typeof open === 'boolean' ? open : box.hidden;
      box.hidden = !on;
      if (on) this.dataset.view = 'prefs'; else delete this.dataset.view;
      const btn = this.querySelector('[data-consent="prefs"]');
      const save = this.querySelector('[data-consent="save"]');
      if (btn) btn.setAttribute('aria-expanded', String(on));
      if (save) save.hidden = !on;
      if (on) {
        const stored = read();
        this.querySelectorAll('[data-consent-pref]').forEach(input => { input.checked = Boolean(stored && stored.prefs && stored.prefs[input.dataset.consentPref]); });
        requestAnimationFrame(() => this.querySelector('[data-consent-pref]')?.focus({ preventScroll: true }));
      }
      this.place();
    }
    readPrefs() {
      const prefs = {};
      this.querySelectorAll('[data-consent-pref]').forEach(input => { prefs[input.dataset.consentPref] = input.checked; });
      return prefs;
    }

    dismiss() {
      if (this.required) return;
      if (!this.design && this.dataset.frequency === 'session') rememberClosed();
      this.hide();
    }

    buttons() {
      return [...this.panel.querySelectorAll('a[href]:not([hidden]), button:not([hidden]):not(:disabled), input:not(:disabled)')].filter(el => el.getClientRects().length);
    }
    firstButton() {
      return this.panel.querySelector('.cookie-consent__actions button:not([hidden])') || this.buttons()[0];
    }

    onKey(event) {
      // Behind an open drawer or menu, keys belong to that drawer.
      if (!this.isOpen || this.hasAttribute('data-covered')) return;
      if (event.key === 'Escape') {
        if (this.required) { event.preventDefault(); return; }
        /* A plain banner answers Escape when it shows a close button or holds focus, and nothing else is open over the page. */
        const other = [...document.querySelectorAll('dialog[open]')].some(d => !this.contains(d));
        if (this.blocking || this.contains(document.activeElement) || (this.closeWanted && !other)) { event.preventDefault(); this.dismiss(); }
        return;
      }
      if (event.key !== 'Tab' || !this.blocking) return;
      const items = this.buttons();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (!this.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (document.activeElement === this.panel) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    syncRole() {
      if (this.blocking) { this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true'); }
      else { this.panel.setAttribute('role', 'region'); this.panel.removeAttribute('aria-modal'); }
      // A modal that needs a choice has no close button.
      const close = this.querySelector('[data-consent="close"]');
      if (close) close.hidden = !this.closeWanted || this.required;
    }

    /* Builder: the values it starts from, then every change to a cookie setting. */
    startPreview() {
      try { this.state = JSON.parse(document.querySelector('script[data-consent-settings]')?.textContent || '{}'); } catch (_) { this.state = {}; }
      if ('cookie_show_close' in this.state) this.closeWanted = yes(this.state.cookie_show_close);
      if (this.state.cookie_pages && this.dataset.page) this.dataset.pageOk = String(pageAllowed(this.state.cookie_pages, this.dataset.page));
      if (this.dataset.preview === 'true' && this.dataset.enabled === 'true' && this.dataset.pageOk !== 'false') this.show();
      document.addEventListener('storelib:settings-change', event => {
        const changed = event.detail?.settings || event.detail || {};
        const keys = Object.keys(changed).filter(key => /^(enable_cookies|cookie_|heading_cookies|content_cookies|label_allow|label_refuse|label_preferences|label_save)/.test(key));
        if (!keys.length) return;
        keys.forEach(key => { this.state[key] = changed[key]; });
        this.applyPreview(changed);
        if ('cookie_pages' in changed && this.dataset.page) this.dataset.pageOk = String(pageAllowed(String(changed.cookie_pages || 'all'), this.dataset.page));
        const on = yes(this.state.enable_cookies) && yes(this.state.cookie_show_in_builder);
        this.dataset.preview = String(on);
        if (on && this.dataset.pageOk !== 'false') { if (this.isOpen) this.syncRole(); else this.show(); }
        else this.hide();
      });
    }

    applyPreview(s) {
      const has = key => Object.prototype.hasOwnProperty.call(s, key);
      const data = (key, attr, map) => { if (has(key) && s[key] != null) this.dataset[attr] = map ? map(s[key]) : String(s[key]); };
      if (has('enable_cookies')) this.dataset.enabled = String(yes(s.enable_cookies));
      if (has('cookie_position') || has('cookie_style') || has('cookie_look')) {
        const legacy = String(this.state.cookie_style || 'bar-center');
        let position = String(this.state.cookie_position || 'bottom_center');
        if (LEGACY[legacy] && position === 'bottom_center') position = LEGACY[legacy];
        this.dataset.position = position;
        this.dataset.look = String(this.state.cookie_look || 'standard');
      }
      if (has('cookie_radius')) this.style.setProperty('--cookie-radius', (Number(s.cookie_radius) || 0) + 'px');
      if (has('cookie_max_width')) this.style.setProperty('--cookie-width', (Number(s.cookie_max_width) || 720) + 'px');
      data('cookie_animation', 'animation');
      data('cookie_mobile_layout', 'mobile');
      data('cookie_modal_backdrop', 'backdrop', v => String(yes(v)));
      data('cookie_require_choice', 'require', v => String(yes(v)));
      data('cookie_above_mobile_nav', 'aboveNav', v => String(yes(v)));
      if (this.isOpen) this.place();
      const heading = this.querySelector('[data-consent-heading]');
      if (has('heading_cookies') && heading) { heading.textContent = s.heading_cookies || 'Cookies'; heading.hidden = !s.heading_cookies; }
      const message = this.querySelector('[data-consent-message]');
      if (has('content_cookies') && message) message.innerHTML = s.content_cookies || '';
      const accept = this.querySelector('[data-consent="accept"]');
      const decline = this.querySelector('[data-consent="decline"]');
      if (has('label_allow') && accept) accept.textContent = s.label_allow || 'Accept';
      if (has('label_refuse') && decline) decline.textContent = s.label_refuse || 'Decline';
      if (has('cookie_show_decline') && decline) decline.hidden = !yes(s.cookie_show_decline);
      const prefsBtn = this.querySelector('[data-consent="prefs"]');
      if (has('cookie_show_preferences') && prefsBtn) { prefsBtn.hidden = !yes(s.cookie_show_preferences); if (prefsBtn.hidden) this.togglePrefs(false); }
      this.querySelectorAll('[data-consent-label]').forEach(el => { const k = el.dataset.consentLabel; if (has(k) && s[k]) el.textContent = s[k]; });
      if (has('cookie_show_close')) this.closeWanted = yes(s.cookie_show_close);
      this.syncRole();
      const link = this.querySelector('[data-consent-link]');
      if (link && (has('cookie_link_label') || has('cookie_link_url'))) {
        const url = this.state.cookie_link_url;
        const href = typeof url === 'object' && url ? (url.url || url.href || '') : (url || '');
        link.textContent = this.state.cookie_link_label || '';
        link.setAttribute('href', href || '#');
        link.hidden = !href || !this.state.cookie_link_label;
      }
      if (has('cookie_color_scheme')) {
        const scheme = s.cookie_color_scheme;
        const id = typeof scheme === 'object' && scheme ? scheme.id : scheme;
        [...this.classList].filter(name => name.startsWith('color-')).forEach(name => this.classList.remove(name));
        if (id) this.classList.add('color-' + id);
      }
      if (Object.keys(s).some(key => /^cookie_(custom_styling|bg_color|text_color|heading_color|btn_bg|btn_text|btn2_text|btn_radius)$/.test(key))) this.paintCustom();
      if (Object.keys(s).some(key => /^cookie_(custom_text_sizes|heading_size|text_size|button_text_size)$/.test(key))) this.paintSizes();
    }

    /* Custom text sizes: used only while the toggle is on. */
    paintSizes() {
      const s = this.state;
      const on = yes(s.cookie_custom_text_sizes);
      this.dataset.textSizes = on ? 'custom' : 'theme';
      const px = value => (value === '' || value == null || !isFinite(Number(value))) ? '' : Number(value) + 'px';
      [['--cookie-heading-size', s.cookie_heading_size], ['--cookie-text-size', s.cookie_text_size], ['--cookie-btn-size', s.cookie_button_text_size]].forEach(([name, value]) => {
        const v = on ? px(value) : '';
        if (v) this.style.setProperty(name, v); else this.style.removeProperty(name);
      });
    }

    paintCustom() {
      const s = this.state;
      const on = yes(s.cookie_custom_styling);
      const set = (el, name, value) => { if (!el) return; if (on && value) el.style.setProperty(name, value); else el.style.removeProperty(name); };
      set(this, '--cookie-bg', colour(s.cookie_bg_color));
      set(this, '--cookie-text', colour(s.cookie_text_color));
      set(this, '--cookie-heading', colour(s.cookie_heading_color));
      const accept = this.querySelector('[data-consent="accept"]');
      const decline = this.querySelector('[data-consent="decline"]');
      const radius = s.cookie_btn_radius != null && s.cookie_btn_radius !== '' ? Number(s.cookie_btn_radius) + 'px' : '';
      set(accept, '--mb-bg', colour(s.cookie_btn_bg));
      set(accept, '--mb-border', colour(s.cookie_btn_bg));
      set(accept, '--mb-text', colour(s.cookie_btn_text));
      set(decline, '--mb-text', colour(s.cookie_btn2_text));
      set(accept, '--mb-radius', radius);
      set(decline, '--mb-radius', radius);
    }
  }

  customElements.define('cookie-consent', CookieConsent);

  /* The platform: the visitor's choice is also given to the platform's Customer Privacy
     API, so the platform analytics, pixels and apps follow it. */
  const shopifyConsent = prefs => {
    const S = window.Shopify;
    if (!S || S.designMode || !prefs) return;
    withPrivacy(api => {
      try {
        api?.setTrackingConsent?.({ analytics: prefs.analytics, marketing: prefs.marketing, preferences: prefs.preferences, sale_of_data: prefs.marketing }, () => {});
      } catch (_) {}
    }, 10000);
  };
  document.addEventListener('materia:consent', event => { if (!event.detail?.stored) shopifyConsent(event.detail?.prefs); });
})();
