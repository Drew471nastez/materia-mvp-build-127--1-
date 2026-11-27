/* Storelib theme reveals (round 27): initialize once and keep editor updates visible.
   One shared IntersectionObserver; nothing is measured on scroll. The styles of
   every type are in animation.css (SCROLL REVEAL). */
const SCROLL_ANIMATION_TRIGGER_CLASSNAME = '.scroll-trigger';
const SCROLL_ANIMATION_OFFSCREEN_CLASSNAME = 'scroll-trigger--offscreen';
const SCROLL_ANIMATION_DONE_ATTR = 'data-animation-done';
const REVEAL_MAX_STAGGER = 6;
// Types whose section stays put while its parts arrive one after another.
const PART_TYPES = ['stagger_up', 'mask_reveal', 'split_text', 'editorial'];
const MAX_PARTS = 14;
// Sections whose own settings pick a reveal style play it themselves
// (collection tabs, FAQ 4, countdown, scrolling text, marquee, logos).
const OWN_REVEAL = '[data-ct-reveal], [data-faq7-reveal], [data-cd-reveal], .stm[data-lt-reveal], [data-own-reveal="true"], .lg[data-reveal="true"]';
const revealInitialized = new WeakSet();
const zoomInitialized = new WeakSet();
const visibleZoom = new Set();
// Browsers with scroll-driven animations zoom .animate--zoom-in in CSS alone.
const zoomInCss = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'));
const zoomObserver = !zoomInCss && 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(({target, isIntersecting}) => isIntersecting ? visibleZoom.add(target) : visibleZoom.delete(target));
}) : null;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function initializeScrollZoomAnimationTrigger(root = document) {
  if (reducedMotion() || !zoomObserver) return;
  const elements = [...root.querySelectorAll('.animate--zoom-in')];
  if (root.matches?.('.animate--zoom-in')) elements.unshift(root);
  elements.forEach(el => {
    if (zoomInitialized.has(el)) return;
    zoomInitialized.add(el);
    zoomObserver.observe(el);
  });
}
let zoomFrame = 0;
if (zoomObserver) window.addEventListener('scroll', () => {
  if (zoomFrame || !visibleZoom.size || reducedMotion()) return;
  zoomFrame = requestAnimationFrame(() => {
    zoomFrame = 0;
    // Read every box first, then write: one layout per frame, not one per image.
    const height = window.innerHeight;
    const reads = [];
    visibleZoom.forEach(el => {
      if (!el.isConnected) { visibleZoom.delete(el); zoomObserver.unobserve(el); return; }
      reads.push([el, el.getBoundingClientRect()]);
    });
    reads.forEach(([el, rect]) => {
      const progress = Math.max(0, Math.min(1, (height - rect.top) / (height + rect.height)));
      el.style.setProperty('--zoom-in-ratio', (1 + 0.2 * progress).toFixed(4));
    });
  });
}, {passive: true});

/* ── Parts: what of a section arrives one after another ─────────────────── */
const PART_SELECTOR = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', '.h0', '.h1', '.h2', '.h3', '.h4', '.h5', '.h6', 'p', '.rte', 'blockquote',
  '.btn', '.button', '[data-sl-button]', 'form', 'picture', 'video', 'img', 'svg.placeholder-svg', '.placeholder-image',
  '.product-item', '.collection-item', '.card', '.grid-custom-item', 'figure', '.list-social',
  '[class*="__heading"]', '[class*="__title"]', '[class*="__subheading"]', '[class*="__subtitle"]', '[class*="__text"]',
  '[class*="__button"]', '[class*="__media"]', '[class*="__image"]', '[class*="__item"]'
].join(',');
const MEDIA_PART = 'picture, video, img, svg.placeholder-svg, .placeholder-image, [class*="__media"], [class*="__image"]';
const HEADING_PART = 'h1, h2, h3, .h0, .h1, .h2, .h3, [class*="__heading"], [class*="__title"]';
const INLINE_TAGS = /^(BR|EM|STRONG|B|I|A|SPAN|U|SMALL|MARK|SUP|SUB|S)$/;

function typeOf(el) {
  const list = el.classList;
  for (const t of PART_TYPES) if (list.contains(t)) return t;
  return '';
}

// A heading whose words can be wrapped for the reveal: short, plain text and
// inline marks only, and not painted through its text (a gradient title).
function splittable(el) {
  const text = el.textContent || '';
  if (!text.trim() || text.length > 220) return false;
  for (const child of el.querySelectorAll('*')) if (!INLINE_TAGS.test(child.tagName)) return false;
  const css = getComputedStyle(el);
  return css.webkitBackgroundClip !== 'text' && css.backgroundClip !== 'text' && css.webkitTextFillColor !== 'transparent';
}
function splitWords(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
  const words = [];
  nodes.forEach(node => {
    const frag = document.createDocumentFragment();
    node.nodeValue.split(/(\s+)/).forEach(piece => {
      if (!piece) return;
      if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(piece)); return; }
      const span = document.createElement('span');
      span.className = 'mt-word';
      span.textContent = piece;
      span.style.setProperty('--word', String(Math.min(words.length, 24)));
      words.push(span);
      frag.appendChild(span);
    });
    node.parentNode.replaceChild(frag, node);
  });
  el.__mtWords = words;
}
// The words go back to the plain text they were, so nothing of the reveal stays in the page.
function unsplitWords(el) {
  const words = el.__mtWords;
  if (!words) return;
  el.__mtWords = null;
  words.forEach(span => { if (span.parentNode) span.parentNode.replaceChild(document.createTextNode(span.textContent), span); });
  el.normalize();
}

// A picture zooms only inside a frame that clips it, so it never spills over its card.
function clipped(el) {
  for (let p = el.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) {
    const o = getComputedStyle(p);
    if (o.overflow !== 'visible' || o.overflowX !== 'visible' || o.clipPath !== 'none') return true;
  }
  return false;
}
function markZoom(el, skip) {
  if (document.body?.dataset.zoomImage !== 'true') return;
  const list = el.tagName === 'IMG' ? [el] : [...el.querySelectorAll('img')].slice(0, 8);
  list.forEach(img => {
    if (skip && skip(img)) return;
    if (img.classList.contains('secondary-image') || img.style.transform) return;
    const r = img.getBoundingClientRect();
    if (r.width < 120 || r.height < 90 || !clipped(img)) return;
    img.setAttribute('data-reveal-zoom', '');
  });
}

// The parts of a section, in reading order: headings, text, buttons, cards and
// pictures, the outermost of each, at most MAX_PARTS. Layout is clean here (the
// observer reports after layout), so reading boxes costs nothing extra.
function markParts(section, type) {
  const picked = [];
  const width = window.innerWidth;
  const candidates = section.querySelectorAll(PART_SELECTOR);
  for (let i = 0; i < candidates.length && i < 400 && picked.length < MAX_PARTS; i++) {
    const el = candidates[i];
    if (el.closest(SCROLL_ANIMATION_TRIGGER_CLASSNAME) !== section) continue;
    if (picked.some(p => p.contains(el))) continue;
    if (el.style.transform || el.style.opacity || el.classList.contains('swiper-slide') || el.closest('.secondary-image, [aria-hidden="true"], [hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right <= 0 || r.left >= width) continue;
    picked.push(el);
  }
  if (picked.length < 2) return false;
  picked.forEach((el, i) => {
    let kind = 'text';
    if ((type === 'mask_reveal' || type === 'editorial') && el.matches(MEDIA_PART)) kind = 'media';
    else if (type === 'split_text' && el.matches(HEADING_PART) && splittable(el)) { kind = 'words'; splitWords(el); }
    el.setAttribute('data-reveal-part', kind);
    el.style.setProperty('--part', String(i));
  });
  section.classList.add('reveal-parts');
  section.__mtParts = picked;
  markZoom(section, img => (type === 'mask_reveal' || type === 'editorial') && !!img.closest('[data-reveal-part="media"]'));
  return true;
}
function clearParts(el) {
  const parts = el.__mtParts;
  if (parts) {
    el.__mtParts = null;
    parts.forEach(part => { part.removeAttribute('data-reveal-part'); part.style.removeProperty('--part'); unsplitWords(part); });
  }
  el.classList.remove('reveal-parts');
  if (el.querySelector('[data-reveal-zoom]')) el.querySelectorAll('[data-reveal-zoom]').forEach(img => img.removeAttribute('data-reveal-zoom'));
  else if (el.hasAttribute('data-reveal-zoom')) el.removeAttribute('data-reveal-zoom');
}

// Armed: waits at its first frame. Its parts (a parts type on a section) and
// the pictures that zoom are marked now, once.
function arm(el) {
  // A motion element that gave way to this reveal pinned itself visible.
  if (el.tagName === 'MOTION-ELEMENT') el.style.removeProperty('opacity');
  const type = typeOf(el);
  if (!(type && el.classList.contains('shopify-section') && markParts(el, type))) markZoom(el);
  el.classList.add('scroll-trigger--offscreen', 'scroll-trigger--armed');
}

function markDone(el) {
  el.setAttribute(SCROLL_ANIMATION_DONE_ATTR, '');
  el.setAttribute('animation-end', '');
  el.classList.remove('scroll-trigger--offscreen', 'scroll-trigger--armed');
  el.style.removeProperty('--reveal-order');
  clearParts(el);
}

const msOf = value => value.trim().endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;

// The first report of an element just set up says where it sits at load.
// Content in the first screen (or above it) shows at once; only what is below
// the fold is armed and waits to reveal on scroll (its next report).
const revealArming = new WeakSet();
function inFirstScreen(entry) {
  return entry.boundingClientRect.top < window.innerHeight;
}
function armReveal(entries) {
  return entries.filter(entry => {
    const el = entry.target;
    if (!revealArming.has(el)) return true;
    revealArming.delete(el);
    if (!el.isConnected || el.hasAttribute(SCROLL_ANIMATION_DONE_ATTR)) { revealObserver.unobserve(el); return false; }
    // In view now, or already scrolled past: shown at once. Further down: armed for its reveal.
    // Nothing to see (a section of styles only, an empty one): never waits.
    if (entry.isIntersecting || entry.boundingClientRect.bottom <= 0 || entry.boundingClientRect.height < 2 || inFirstScreen(entry)) { revealObserver.unobserve(el); markDone(el); return false; }
    arm(el);
    return entry.isIntersecting;
  });
}

// A section comes in with its pictures: the pictures in view still on their
// way are waited for, PICTURE_WAIT_MS at most (they are usually there already:
// smooth-media-load fetches pictures well before they are scrolled to). It
// waits at its first frame, never blank.
const PICTURE_WAIT_MS = 160;
function picturesReady(el) {
  const loading = [...el.querySelectorAll('img')].filter(img => !(img.complete && img.naturalWidth > 0));
  if (!loading.length) return null;
  const fold = window.innerHeight * 1.25;
  const inView = loading.filter(img => { const r = img.getBoundingClientRect(); return r.width > 0 && r.top < fold && r.bottom > 0; });
  if (!inView.length) return null;
  return Promise.race([
    Promise.all(inView.map(img => new Promise(done => { img.addEventListener('load', done, {once: true}); img.addEventListener('error', done, {once: true}); }))),
    new Promise(done => setTimeout(done, PICTURE_WAIT_MS))
  ]);
}

// Every class change first, then the styles read in one pass.
function reveal(targets) {
  targets.forEach(target => target.classList.remove('scroll-trigger--offscreen'));
  targets.forEach((target, i) => follow(target, Number(target.style.getPropertyValue('--reveal-order')) || i));
}
// Finished on its own animationend; a timer is the safety net for an
// animation that never ran. Its length comes from the theme's timing, read
// once, never from the element itself. Only the reveal's own end counts:
// going from the armed state (paused, no delay) to playing with a delay
// reports an animationend with elapsedTime 0, which is not the end.
function follow(target, index = 0) {
  const t = revealTiming();
  const parts = target.__mtParts ? target.__mtParts.length : 0;
  const words = parts ? target.__mtParts.reduce((n, p) => Math.max(n, p.__mtWords ? Math.min(p.__mtWords.length, 25) : 0), 0) : 0;
  const end = event => {
    if (parts || event.target !== target || !(event.elapsedTime > 0) || !/^reveal/i.test(event.animationName || '')) return;
    target.removeEventListener('animationend', end);
    markDone(target);
  };
  if (!parts) target.addEventListener('animationend', end);
  // Parts end with the last of them; pictures that settle from a zoom take 1.8x the duration.
  const settles = !!target.querySelector('[data-reveal-zoom], [data-reveal-part="media"]') || target.hasAttribute('data-reveal-zoom');
  const longest = settles ? Math.max(t.duration, t.base * 1.8) : t.duration;
  const total = longest + t.delay + Math.min(index, REVEAL_MAX_STAGGER) * t.stagger + parts * t.stagger + words * 45 + 150;
  target.__mtDone = setTimeout(() => { target.removeEventListener('animationend', end); markDone(target); }, total);
}

function makeObserver(callback, margin) {
  if (!('IntersectionObserver' in window)) return null;
  // Inside a frame (the builder's canvas, a preview) the frame's own screen is
  // the one that counts: with no root the browser measures against the top
  // window there and drops the margin.
  if (window.top !== window) {
    try { return new IntersectionObserver(callback, {root: document, threshold: 0, rootMargin: margin}); } catch (e) {}
  }
  return new IntersectionObserver(callback, {threshold: 0, rootMargin: margin});
}

const revealObserver = makeObserver((entries) => {
  entries = armReveal(entries);
  // Things of one section that come into view together (a row of cards) play
  // in reading order, a short stagger apart; the order comes from the
  // observer's own boxes. Another section never waits for them.
  const entering = entries.filter(entry => entry.isIntersecting)
    .sort((a, b) => (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left));
  const now = [];
  const groups = new Map();
  entering.forEach(({target}) => {
    revealObserver.unobserve(target);
    const group = target.closest('.shopify-section') || document.body;
    const index = groups.get(group) || 0;
    groups.set(group, index + 1);
    if (index) target.style.setProperty('--reveal-order', String(Math.min(index, REVEAL_MAX_STAGGER)));
    const waiting = picturesReady(target);
    if (waiting) waiting.then(() => requestAnimationFrame(() => reveal([target])));
    else now.push(target);
  });
  if (now.length) reveal(now);
// It starts once its top edge is 6% into the screen, so the movement is seen
// rather than spent below the edge.
}, '0px 0px -6% 0px');

// The theme's reveal timing (Animations > duration, delay and stagger), read
// once from the root; the slowest type (cinematic) plays 1.4x the duration.
let revealTimingCache = null;
function revealTiming() {
  if (revealTimingCache) return revealTimingCache;
  const css = getComputedStyle(document.documentElement);
  const num = (name, fallback) => { const v = css.getPropertyValue(name); return v ? msOf(v) || fallback : fallback; };
  const base = num('--animation-duration', 700);
  return revealTimingCache = {
    base,
    duration: base * 1.4,
    delay: num('--animation-delay-base', 0),
    stagger: num('--reveal-stagger', 75)
  };
}

function initializeScrollAnimationTrigger(root = document, editorEvent = false) {
  initializeScrollZoomAnimationTrigger(root);
  const elements = [...root.querySelectorAll(SCROLL_ANIMATION_TRIGGER_CLASSNAME)];
  if (root.matches?.(SCROLL_ANIMATION_TRIGGER_CLASSNAME)) elements.unshift(root);
  // A section drawn again in place goes through the same first report: on
  // screen it shows at once, further down it keeps its reveal.
  const editor = !!editorEvent && editorEvent !== 'load';
  const productInformation = '.product-detail__information, .product-single__information';
  const fresh = [];
  elements.forEach(el => {
    const essentialProductContent = el.closest(productInformation) || el.querySelector(productInformation);
    // A wrapper whose cards reveal themselves does not animate as well: one
    // movement per element, never a fade inside a fade.
    const container = !!el.querySelector(SCROLL_ANIMATION_TRIGGER_CLASSNAME);
    // A section that plays a reveal style of its own (picked in the section)
    // keeps that one: its wrapper and the cards inside it do not move as well.
    const ownReveal = !!(el.closest(OWN_REVEAL) || el.querySelector(OWN_REVEAL));
    // A section the builder drew again after an edit, that was seen or had
    // already revealed (data-mt-redrawn, set by the canvas): shown as it was
    // left, never played again (round 67).
    const redrawn = !!el.closest('[data-mt-redrawn]');
    if (essentialProductContent || container || ownReveal || editor || redrawn || reducedMotion() || !revealObserver || el.hasAttribute(SCROLL_ANIMATION_DONE_ATTR)) {
      revealObserver?.unobserve(el);
      revealArming.delete(el);
      markDone(el);
      return;
    }
    if (revealInitialized.has(el)) return;
    revealInitialized.add(el);
    fresh.push(el);
  });
  // Where each element sits comes from the observer's first report, made
  // after the page's own layout (see armReveal). Nothing is hidden until then.
  fresh.forEach(el => { revealArming.add(el); revealObserver.observe(el); });
}

/*
  PLAYED AGAIN WHERE IT CAN BE SEEN (the builder). When the Animations
  settings change, the builder draws the page again where it was scrolled to
  and tells it which settings changed (storelib:theme-change): what is on
  screen then plays its reveal once, with the new settings, so the change can
  be seen without scrolling away and back. The storefront never sends it.
*/
const REVEAL_SETTINGS = ['scroll_animation', 'animation_duration', 'animation_delay', 'reveal_stagger', 'zoom_image'];
function replayInView() {
  if (reducedMotion() || !revealObserver) return;
  revealTimingCache = null;
  const height = window.innerHeight;
  const list = [...document.querySelectorAll(SCROLL_ANIMATION_TRIGGER_CLASSNAME)].filter(el => {
    if (el.querySelector(SCROLL_ANIMATION_TRIGGER_CLASSNAME) || el.closest(OWN_REVEAL) || el.querySelector(OWN_REVEAL)) return false;
    if (el.closest('.product-detail__information, .product-single__information')) return false;
    if (el.matches('[id*="header"], [id*="announcement"], [id*="footer"]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < height;
  }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  if (!list.length) return;
  list.forEach((el, i) => {
    clearTimeout(el.__mtDone);
    el.removeAttribute(SCROLL_ANIMATION_DONE_ATTR);
    el.removeAttribute('animation-end');
    clearParts(el);
    if (i) el.style.setProperty('--reveal-order', String(Math.min(i, REVEAL_MAX_STAGGER)));
    arm(el);
  });
  // The first frame is drawn before anything moves.
  requestAnimationFrame(() => requestAnimationFrame(() => reveal(list)));
}
document.addEventListener('storelib:theme-change', event => {
  const changed = event.detail && event.detail.settings;
  if (!changed || !REVEAL_SETTINGS.some(key => key in changed)) return;
  replayInView();
});
// The theme's safety net (layout/theme.liquid) plays a reveal that sits in
// view without having started, rather than snapping it to its end.
window.MateriaReveal = {
  replay: replayInView,
  play(el) {
    if (!el.classList.contains('scroll-trigger--armed')) return false;
    revealObserver?.unobserve(el);
    reveal([el]);
    return true;
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initializeScrollAnimationTrigger(), {once: true});
else initializeScrollAnimationTrigger();

// storelib:section-load is the builder redrawing a section in place: on
// screen it shows at once, further down it keeps its reveal. Selecting or
// reordering a section in the editor's sidebar does not change it: the editor
// scrolls there and the section reveals as it comes into view, exactly like
// scrolling on the storefront.
['shopify:section:load', 'storelib:section-load'].forEach(name => {
  document.addEventListener(name, event => initializeScrollAnimationTrigger(event.target, 'load'));
});
document.addEventListener('shopify:section:unload', event => {
  [event.target, ...event.target.querySelectorAll(SCROLL_ANIMATION_TRIGGER_CLASSNAME)].forEach(el => { revealObserver?.unobserve(el); revealArming.delete(el); clearTimeout(el.__mtDone); });
  [event.target, ...event.target.querySelectorAll('.animate--zoom-in')].forEach(el => { zoomObserver?.unobserve(el); visibleZoom.delete(el); });
});
// A timing changed under a finger in the builder is read again.
document.addEventListener('storelib:settings-change', () => { revealTimingCache = null; });
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => initializeScrollAnimationTrigger());

// Cards a section adds later (filters, load more, infinite scroll, a grid
// drawn again) join the same reveal: below the screen they reveal as they are
// scrolled to, in view they simply show. Only added nodes are looked at, once
// a frame.
if ('MutationObserver' in window) {
  let added = [], addedFrame = 0;
  const flushAdded = () => {
    addedFrame = 0;
    const list = added; added = [];
    list.forEach(node => { if (node.isConnected) initializeScrollAnimationTrigger(node); });
  };
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList.contains('mt-word')) continue;
        if (node.classList.contains('scroll-trigger') || node.getElementsByClassName('scroll-trigger').length) added.push(node);
      }
    }
    if (added.length && !addedFrame) addedFrame = requestAnimationFrame(flushAdded);
  }).observe(document.documentElement, {childList: true, subtree: true});
}
