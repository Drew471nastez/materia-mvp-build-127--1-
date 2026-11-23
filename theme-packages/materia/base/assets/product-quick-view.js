/* Materia Themes. Quick view for product cards.

   A card carries its product as JSON (snippets/product-quick-view-data).
   Pressing its quick view button, or the quick add of a product that has
   options, opens one window built here: a modal beside the page on a wide
   screen, a sheet from the bottom on a phone. It holds the pictures, the
   title and price, a choice for each option, quantity, Add to cart and a
   link to the whole page. Add to cart is the theme's own <product-form>, so
   the cart drawer opens and the count updates as from the product page.

   Escape, the close button and the backdrop close it; focus moves in, stays
   in (Tab) and goes back to the button that opened it; the page does not
   scroll under it. Loaded as a module: however many cards ask, it runs once. */
const ROOT_ID = 'product-quick-view';
let root = null;
let lastFocus = null;
let scrollY = 0;
let state = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const colourWord = (name) => /^(colou?r|cor|couleur|farbe)$/i.test(String(name).trim());
const cssColour = (v) => { const c = String(v).trim().toLowerCase().replace(/\s+/g, ''); try { return CSS.supports('color', c) ? c : ''; } catch (e) { return ''; } };

function build() {
  root = document.createElement('div');
  root.id = ROOT_ID;
  root.className = 'sqv';
  root.hidden = true;
  root.innerHTML = '<div class="sqv__backdrop" data-sqv-close></div>' +
    '<div class="sqv__panel color-default" role="dialog" aria-modal="true" aria-labelledby="sqv-title" tabindex="-1">' +
    '<button type="button" class="sqv__close" data-sqv-close aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' +
    '<div class="sqv__body"></div></div>';
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target.closest('[data-sqv-close]')) close(); });
  root.addEventListener('keydown', onKey);
  try {
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      // The product form published its line: the drawer takes over.
      subscribe(PUB_SUB_EVENTS.cartUpdate, (e) => { const id = root.querySelector('.sqv__form [name="id"]')?.value; if (state && e && e.source === 'product-form' && id && String(e.productVariantId) === String(id)) close(true); });
    }
  } catch (e) {}
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (e.key !== 'Tab') return;
  const items = [...root.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === root.querySelector('.sqv__panel'))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function lock() {
  scrollY = window.scrollY;
  const bar = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.classList.add('sqv-open');
  if (bar > 0) document.documentElement.style.setProperty('--sqv-bar', bar + 'px');
}
function unlock() {
  document.documentElement.classList.remove('sqv-open');
  document.documentElement.style.removeProperty('--sqv-bar');
}

function variantFor(values) {
  return state.data.variants.find((v) => v.options.every((o, i) => o === values[i])) || null;
}

function render() {
  const { data, values, qty } = state;
  const v = variantFor(values);
  const opts = data.options || [];
  const one = opts.length === 1;
  const gallery = (data.images || []).map((src, i) => '<li class="sqv__slide"><img src="' + esc(src) + '" alt="' + esc((data.alts || [])[i] || data.title) + '" loading="' + (i ? 'lazy' : 'eager') + '" decoding="async"></li>').join('');
  const pickers = opts.map((o, i) => {
    const colour = colourWord(o.name);
    const buttons = o.values.map((val) => {
      const trial = values.slice(); trial[i] = val;
      const any = state.data.variants.some((x) => x.options[i] === val && x.available && x.options.every((ov, k) => k === i || one || ov === trial[k]));
      const dot = colour && cssColour(val) ? '<span class="sqv__dot" style="background:' + esc(cssColour(val)) + '"></span>' : '';
      return '<button type="button" class="sqv__value' + (any ? '' : ' is-out') + '" data-sqv-option="' + i + '" data-value="' + esc(val) + '" aria-pressed="' + (values[i] === val) + '">' + dot + '<span>' + esc(val) + '</span></button>';
    }).join('');
    return '<fieldset class="sqv__option"><legend>' + esc(o.name) + ': <strong>' + esc(values[i]) + '</strong></legend><div class="sqv__values">' + buttons + '</div></fieldset>';
  }).join('');
  const price = v ? v.price : '';
  const compare = v && v.compare ? '<s class="sqv__compare">' + esc(v.compare) + '</s>' : '';
  const can = !!(v && v.available);
  const label = !v ? 'Unavailable' : can ? data.strings.add : data.strings.soldOut;
  const body = root.querySelector('.sqv__body');
  body.innerHTML =
    '<div class="sqv__media"><ul class="sqv__track" tabindex="0" aria-label="Pictures">' + gallery + '</ul>' +
    ((data.images || []).length > 1 ? '<div class="sqv__dots" aria-hidden="true">' + data.images.map((_, i) => '<span data-i="' + i + '"></span>').join('') + '</div>' : '') + '</div>' +
    '<div class="sqv__info">' +
    '<h2 id="sqv-title" class="sqv__title heading">' + esc(data.title) + '</h2>' +
    '<div class="sqv__price"><span>' + esc(price) + '</span>' + compare + '</div>' +
    (data.description ? '<p class="sqv__desc">' + esc(data.description) + '</p>' : '') +
    pickers +
    '<product-form class="sqv__form" data-hide-errors="false"><form method="post" action="/cart/add" accept-charset="UTF-8" class="form" novalidate data-type="add-to-cart-form">' +
    '<input type="hidden" name="id" value="' + esc(v ? v.id : '') + '">' +
    '<div class="sqv__buy">' +
    '<div class="sqv__qty"><button type="button" data-sqv-step="-1" aria-label="Decrease quantity">&minus;</button><input type="number" name="quantity" min="1" value="' + qty + '" aria-label="Quantity" inputmode="numeric"><button type="button" data-sqv-step="1" aria-label="Increase quantity">+</button></div>' +
    '<button type="submit" name="add" class="btn btn-primary product-form__submit sqv__add" data-sl-button data-button-role="primary" data-theme-button="primary"' + (can ? '' : ' disabled') + '><span>' + esc(label) + '</span></button>' +
    '</div><div class="product-form__error-message-wrapper hidden" role="alert"><span class="product-form__error-message"></span></div></form></product-form>' +
    '<a class="sqv__more" href="' + esc(data.url) + '">View full details</a>' +
    '</div>';
  body.querySelectorAll('[data-sqv-option]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.sqvOption; state.values[i] = b.dataset.value;
    const keep = document.activeElement === b ? [i, b.dataset.value] : null;
    state.qty = +body.querySelector('input[name=quantity]').value || 1;
    render();
    const nv = variantFor(state.values);
    if (nv && nv.image) showImage(nv.image);
    if (keep) root.querySelector('[data-sqv-option="' + keep[0] + '"][data-value="' + CSS.escape(keep[1]) + '"]')?.focus();
  }));
  body.querySelectorAll('[data-sqv-step]').forEach((b) => b.addEventListener('click', () => {
    const input = body.querySelector('input[name=quantity]');
    input.value = Math.max(1, (+input.value || 1) + +b.dataset.sqvStep); state.qty = +input.value;
  }));
  const track = body.querySelector('.sqv__track');
  const dots = [...body.querySelectorAll('.sqv__dots span')];
  const paint = () => { const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); dots.forEach((d, k) => d.classList.toggle('is-on', k === i)); };
  track.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true });
  paint();
  if (state.slide) { track.scrollLeft = state.slide * track.clientWidth; }
  track.addEventListener('scroll', () => { state.slide = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); }, { passive: true });
}

function showImage(src) {
  const i = (state.data.images || []).indexOf(src);
  const track = root.querySelector('.sqv__track');
  if (i < 0 || !track) return;
  state.slide = i;
  track.scrollTo({ left: i * track.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
}

function open(data, opener, chosenId) {
  if (!root) build();
  const start = data.variants.find((v) => String(v.id) === String(chosenId)) || data.variants.find((v) => String(v.id) === String(data.selected)) || data.variants.find((v) => v.available) || data.variants[0];
  state = { data, values: start ? start.options.slice() : [], qty: 1, slide: 0 };
  lastFocus = opener || document.activeElement;
  render();
  if (start && start.image) { const i = data.images.indexOf(start.image); if (i > 0) state.slide = i; }
  lock();
  root.hidden = false;
  if (state.slide) { const t = root.querySelector('.sqv__track'); t.scrollLeft = state.slide * t.clientWidth; }
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
  root.querySelector('.sqv__panel').focus({ preventScroll: true });
}

function close(keepFocus) {
  if (!root || root.hidden) return;
  root.classList.remove('is-open');
  const done = () => {
    root.hidden = true; root.querySelector('.sqv__body').innerHTML = ''; state = null; unlock();
    if (!keepFocus && lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  };
  if (reduced()) done(); else setTimeout(done, 280);
}

document.addEventListener('click', (e) => {
  const button = e.target.closest && e.target.closest('[data-quick-view-open]');
  if (!button) return;
  const card = button.closest('.product-item');
  const json = card && card.querySelector('script[data-quick-view-data]');
  if (!json) return;
  let data; try { data = JSON.parse(json.textContent); } catch (err) { return; }
  if (!data || !Array.isArray(data.variants) || !data.variants.length) return;
  e.preventDefault();
  e.stopPropagation();
  // A swatch picked on the card chose a variant: open on it.
  const chosen = card.querySelector('form [name="id"]')?.value;
  open(data, button, chosen);
});

window.MateriaQuickView = { open, close };
