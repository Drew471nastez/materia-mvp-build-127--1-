/* Storelib theme reveals: initialize once and keep editor updates visible.
   One shared IntersectionObserver; nothing is measured on scroll. */
const SCROLL_ANIMATION_TRIGGER_CLASSNAME = '.scroll-trigger';
const SCROLL_ANIMATION_OFFSCREEN_CLASSNAME = 'scroll-trigger--offscreen';
const SCROLL_ANIMATION_DONE_ATTR = 'data-animation-done';
const REVEAL_MAX_STAGGER = 6;
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

function markDone(el) {
  el.setAttribute(SCROLL_ANIMATION_DONE_ATTR, '');
  el.setAttribute('animation-end', '');
  el.classList.remove('scroll-trigger--offscreen', 'scroll-trigger--armed');
  el.style.removeProperty('--reveal-order');
}

const msOf = value => value.trim().endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;

// The first report of an element just set up says where it sits at load.
// Content in the first screen (or above it) shows at once; only what is below
// the fold is armed and waits to reveal on scroll (its next report).
const revealArming = new WeakSet();
// The observer's root ends 6% above the bottom edge (so reveals start a little
// into the screen); at load, a top edge already showing in that strip counts
// as on screen, so it is never hidden after it was seen.
const REVEAL_ROOT_SHRINK = 0.94;
function inFirstScreen(entry) {
  const root = entry.rootBounds;
  return !!root && entry.boundingClientRect.top < root.top + (root.bottom - root.top) / REVEAL_ROOT_SHRINK;
}
function armReveal(entries) {
  const fold = window.innerHeight;
  return entries.filter(entry => {
    const el = entry.target;
    if (!revealArming.has(el)) return true;
    revealArming.delete(el);
    if (!el.isConnected || el.hasAttribute(SCROLL_ANIMATION_DONE_ATTR)) { revealObserver.unobserve(el); return false; }
    // In view now (the browser's report, right inside the editor's frame too), or
    // already scrolled past: shown at once. Further down: armed for its reveal.
    if (entry.isIntersecting || entry.boundingClientRect.bottom <= 0 || inFirstScreen(entry)) { revealObserver.unobserve(el); markDone(el); return false; }
    // A motion element that gave way to this reveal pinned itself visible.
    if (el.tagName === 'MOTION-ELEMENT') el.style.removeProperty('opacity');
    el.classList.add('scroll-trigger--offscreen', 'scroll-trigger--armed');
    // Just under the fold but inside the observer's margin: no later report
    // would come for it, so it plays now, from its armed state.
    return entry.isIntersecting;
  });
}

// A section comes in with its pictures. On a slow connection it faded in
// empty and each picture then faded in again on its own as it arrived: the
// pictures seemed to load twice. The pictures in view that are still on their
// way are waited for, PICTURE_WAIT_MS at most, so the section fades in once,
// pictures included; one later than that simply appears (smooth-media-load).
// It waits in its armed state (never blank, see animation.css), and briefly.
const PICTURE_WAIT_MS = 250;
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
  targets.forEach(follow);
}
// Finished on animationend; a timer is the safety net for an animation that
// never ran. Its length comes from the theme's timing, read once, never from
// the element itself: reading an element's styles right after its class
// changed made the browser work out the page's styles there and then.
function follow(target, index = 0) {
  // Only the reveal's own end counts: another animation on the same element
  // (an image fade, a hover, a 0s helper) ending first used to mark the
  // reveal done in its first frame, so in a frame (the editor's canvas, the
  // template previews) nothing was ever seen to move.
  const end = event => {
    if (event.target !== target || !/^reveal/i.test(event.animationName || '')) return;
    target.removeEventListener('animationend', end);
    markDone(target);
  };
  target.addEventListener('animationend', end);
  const t = revealTiming();
  setTimeout(() => { target.removeEventListener('animationend', end); markDone(target); }, t.duration + t.delay + Math.min(index, REVEAL_MAX_STAGGER) * t.stagger + 150);
}

const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries = armReveal(entries);
  // Things that come into view together play in reading order, a short
  // stagger apart; the order comes from the observer's own boxes.
  const entering = entries.filter(entry => entry.isIntersecting)
    .sort((a, b) => (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left));
  const now = [];
  entering.forEach(({target}, index) => {
    revealObserver.unobserve(target);
    if (index) target.style.setProperty('--reveal-order', String(Math.min(index, REVEAL_MAX_STAGGER)));
    const waiting = picturesReady(target);
    if (waiting) waiting.then(() => requestAnimationFrame(() => reveal([target])));
    else now.push(target);
  });
  if (now.length) reveal(now);
// It starts just before it comes into view (5% of the screen below it), so
// what scrolls in is already on its way, never waiting in view.
}, {threshold: 0, rootMargin: '0px 0px 5% 0px'}) : null;

// The theme's reveal timing (Animations > duration and delay), read once from
// the root; the slowest type (cinematic) plays 1.25x the duration.
let revealTimingCache = null;
function revealTiming() {
  if (revealTimingCache) return revealTimingCache;
  const css = getComputedStyle(document.documentElement);
  const num = (name, fallback) => { const v = css.getPropertyValue(name); return v ? msOf(v) || fallback : fallback; };
  return revealTimingCache = {
    duration: num('--animation-duration', 700) * 1.25,
    delay: num('--animation-delay-base', 0),
    stagger: num('--reveal-stagger', 70)
  };
}

function initializeScrollAnimationTrigger(root = document, editorEvent = false) {
  initializeScrollZoomAnimationTrigger(root);
  const elements = [...root.querySelectorAll(SCROLL_ANIMATION_TRIGGER_CLASSNAME)];
  if (root.matches?.(SCROLL_ANIMATION_TRIGGER_CLASSNAME)) elements.unshift(root);
  // In the theme editor, a page load plays its reveals like the storefront;
  // a section the editor redraws in place shows at once (editorEvent).
  // A section the editor drew again shows at once only while it is on screen;
  // below the fold it keeps its reveal for when it is scrolled to.
  // A redrawn section goes through the same first report: on screen it shows
  // at once, further down it keeps its reveal. Selecting or reordering in the
  // editor shows the section at once.
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
    if (essentialProductContent || container || ownReveal || editor || reducedMotion() || !revealObserver || el.hasAttribute(SCROLL_ANIMATION_DONE_ATTR)) {
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
  // after the page's own layout (see armReveal): reading boxes here forced a
  // layout of the whole page while its scripts still ran. Nothing is hidden
  // until then.
  fresh.forEach(el => { revealArming.add(el); revealObserver.observe(el); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initializeScrollAnimationTrigger(), {once: true});
else initializeScrollAnimationTrigger();

// storelib:section-load is the builder redrawing a section in place: it shows
// at once, never replays its entrance.
// Selecting or reordering a section in the editor's sidebar does not change
// it: the editor scrolls there and the section reveals as it comes into view,
// exactly like scrolling on the storefront (forcing it visible here was why
// reveals never seemed to play in the editor).
['shopify:section:load', 'storelib:section-load'].forEach(name => {
  document.addEventListener(name, event => initializeScrollAnimationTrigger(event.target, 'load'));
});
document.addEventListener('shopify:section:unload', event => {
  [event.target, ...event.target.querySelectorAll(SCROLL_ANIMATION_TRIGGER_CLASSNAME)].forEach(el => { revealObserver?.unobserve(el); revealArming.delete(el); });
  [event.target, ...event.target.querySelectorAll('.animate--zoom-in')].forEach(el => { zoomObserver?.unobserve(el); visibleZoom.delete(el); });
});
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
        if (node.classList.contains('scroll-trigger') || node.getElementsByClassName('scroll-trigger').length) added.push(node);
      }
    }
    if (added.length && !addedFrame) addedFrame = requestAnimationFrame(flushAdded);
  }).observe(document.documentElement, {childList: true, subtree: true});
}
