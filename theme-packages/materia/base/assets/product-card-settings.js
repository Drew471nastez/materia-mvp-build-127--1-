/* Card overrides are opt-in. Retain picker values when disabled, and batch
   live editor changes into one frame without replacing product/cart nodes. */
(() => {
  const source = document.querySelector('[data-card-style-settings]');
  if (!source) return;
  let settings;
  try { settings = JSON.parse(source.textContent); } catch (_) { return; }
  const sheet = document.createElement('style');
  sheet.dataset.cardStyleLive = '';
  document.head.append(sheet);
  window.materiaCardSettings = settings;
  let frame = 0;
  let syncRoles = true;
  const colours = new Map();
  const colourContext = document.createElement('canvas').getContext('2d');
  const usableColour = value => {
    if (colours.has(value)) return colours.get(value);
    let result = '';
    if (typeof value === 'string' && CSS.supports('color',value)) {
      // Clearing a picker to alpha zero means inherit, not invisible text.
      if (colourContext) {
        colourContext.fillStyle = '#000';
        colourContext.fillStyle = value;
      }
      const normalized = colourContext?.fillStyle || value;
      if (value !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)$/.test(normalized) && !/^#[\da-f]{6}00$/i.test(normalized)) result = value;
    }
    colours.set(value,result);
    return result;
  };
  const apply = () => {
    frame = 0;
    const enabled = settings.enable_custom_card_actions === true;
    document.documentElement.dataset.cardCustom = String(enabled);
    const rules = [];
    const rule = (selector, declarations) => {
      const entries = Object.entries(declarations).filter(([, value]) => value);
      if (entries.length) rules.push(`${selector}{${entries.map(([key, value]) => `${key}:${value}`).join(';')}}`);
    };
    const color = key => usableColour(settings[key]);
    const paint = (selector, bg, fg, border) => {
      const important = value => value ? value + ' !important' : '';
      rule(selector, {background:important(color(bg)), color:important(color(fg)), 'border-color':important(color(border))});
      rule(selector + ' :is(svg,path,use)', {color:important(color(fg)), stroke:important(color(fg))});
    };
    if (enabled) {
      const atc = '.product-item :is(button[name="add"],.product__add-cart,.product-item__button-submit)';
      rule(atc, {'--mb-bg':color('card_atc_bg'), '--mb-border':color('card_atc_bg'), '--mb-text':color('card_atc_color'), '--mb-hover-bg':color('card_atc_hover_bg'), '--mb-hover-border':color('card_atc_hover_bg'), '--mb-hover-text':color('card_atc_hover_color')});
      rule('.product-item button.pc-atc:is(.pc-atc--below,.pc-atc--list)', {'--mb-border':color('card_atc_color')});
      rule('.cart-recommend ' + atc, Object.fromEntries(['bg','border','text','hover-bg','hover-border','hover-text'].map(key => ['--mb-' + key,'initial'])));
      const wish = '.product-item .product-item__button-wishlist';
      paint(wish, 'card_wish_bg','card_wish_color','card_wish_border');
      paint(wish + '.active','card_wish_active_bg','card_wish_active_color',color('card_wish_active_border') ? 'card_wish_active_border' : 'card_wish_active_bg');
      if (color('card_wish_active_color')) rule(wish + '.active :is(svg,path,use)', {fill:color('card_wish_active_color') + ' !important'});
      const hover = rules.length;
      paint(wish + ':hover','card_wish_hover_bg','card_wish_hover_color');
      const hoverRules = rules.splice(hover);
      const remove = wish + '.absolute[data-wishlist-remove][data-product-id]';
      paint(remove,'card_close_bg','card_close_color','card_close_bg');
      const removeHover = rules.length;
      paint(remove + ':hover','card_close_hover_bg','card_close_hover_color','card_close_hover_bg');
      hoverRules.push(...rules.splice(removeHover));
      rules.push('@media (hover:hover) and (pointer:fine){' + hoverRules.join('') + '}');
      for (const [selector, key] of [['.product-item .product-item__name','product_size'],['.product-item .product-item__price','price_size']]) {
        if (+settings[key] >= 12 && +settings[key] <= 18) rule(selector, {'font-size':settings[key] + 'px'});
      }
      if (['unset','capitalize','uppercase'].includes(settings.product_name_text_transform)) rule('.product-item .product-item__name', {'text-transform':settings.product_name_text_transform + ' !important'});
    }
    sheet.textContent = rules.join('\n');
    document.querySelectorAll('style[data-pc-custom-actions]').forEach(el => { el.media = 'not all'; });
    if (syncRoles) document.dispatchEvent(new CustomEvent('materia:card-settings-applied'));
    syncRoles = false;
  };
  document.addEventListener('storelib:settings-change', event => {
    if (event.detail?.section) return;
    let changed = false;
    Object.entries(event.detail?.settings || {}).forEach(([key,value]) => {
      if (Object.hasOwn(settings,key)) {
        settings[key] = value; changed = true;
        if (key === 'enable_custom_card_actions' || key === 'card_atc_button') syncRoles = true;
      }
    });
    if (changed && !frame) frame = requestAnimationFrame(apply);
  });
  apply();
})();

(() => {
  const source = document.querySelector('[data-badge-style-settings]');
  if (!source) return;
  let enabled = false, frame = 0;
  try { enabled = JSON.parse(source.textContent) === true; } catch (_) {}
  const apply = () => { frame = 0; document.documentElement.dataset.badgeCustom = String(enabled); };
  apply();
  document.addEventListener('storelib:settings-change', event => {
    if (event.detail?.section || !Object.hasOwn(event.detail?.settings || {},'enable_custom_badges')) return;
    enabled = event.detail.settings.enable_custom_badges === true;
    if (!frame) frame = requestAnimationFrame(apply);
  });
})();

/* Card buttons that are custom elements (quick view, compare): Enter and Space press them. */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const button = event.target.closest?.('button-quickview[role="button"], button-compare[role="button"]');
  if (!button || event.target !== button) return;
  event.preventDefault();
  button.click();
});

/* Card image slider: arrows move one picture and hide at either end. */
(() => {
  const slidesOf = (el) => el.closest('.product-item')?.querySelector('[data-pc-slides]');
  const paint = (track) => {
    const card = track.closest('.product-item'); if (!card) return;
    const n = track.children.length, w = Math.max(1, track.clientWidth);
    const rtl = getComputedStyle(track).direction === 'rtl';
    const i = Math.max(0, Math.min(n - 1, Math.round(Math.abs(track.scrollLeft) / w)));
    const prev = card.querySelector('.pc-arrow--prev'), next = card.querySelector('.pc-arrow--next');
    if (prev) prev.disabled = i <= 0;
    if (next) next.disabled = i >= n - 1;
    track.dataset.index = String(i); track.dataset.rtl = rtl ? '1' : '';
  };
  document.addEventListener('click', (event) => {
    const arrow = event.target.closest?.('[data-pc-arrow]'); if (!arrow) return;
    event.preventDefault(); event.stopPropagation();
    const track = slidesOf(arrow); if (!track) return;
    const dir = Number(arrow.dataset.pcArrow) * (getComputedStyle(track).direction === 'rtl' ? -1 : 1);
    track.scrollBy({ left: dir * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  let frame = 0; const pending = new Set();
  document.addEventListener('scroll', (event) => {
    const track = event.target; if (!(track instanceof Element) || !track.matches('[data-pc-slides]')) return;
    pending.add(track);
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; pending.forEach(paint); pending.clear(); });
  }, { capture: true, passive: true });
  // A swipe that moved the pictures must not open the product.
  let downX = null;
  document.addEventListener('pointerdown', (e) => { downX = e.target.closest?.('[data-pc-slides]') ? e.clientX : null; }, true);
  document.addEventListener('click', (e) => { if (downX != null && e.target.closest?.('[data-pc-slides]') && Math.abs(e.clientX - downX) > 8) { e.preventDefault(); } downX = null; }, true);
})();
