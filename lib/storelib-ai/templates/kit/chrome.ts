/**
 * ===========================================================================
 *  A TEMPLATE'S OWN FRAME: HEADER (MENU DRAWER, MEGA PANELS, SEARCH, CART,
 *  LANGUAGE AND CURRENCY) AND FOOTER
 * ===========================================================================
 * A free site draws its whole frame itself (round N); Storelib only fills
 * the hooks (lib/ai-builder/runtime-contract.ts HEADLESS_HOOK_GUIDE). These
 * builders make a template's header and footer from one well tested
 * structure, each template giving them its own layout, drawer, words and
 * CSS skin, so six templates do not share one look:
 *
 *   header   layouts split | center | minimal; transparent over the hero;
 *            sticky; a running notice line (blocks); mega panels for menu
 *            links with sub links, holding featured cards (blocks); a menu
 *            drawer (full screen, side or bottom sheet) through the popover
 *            API (works without script: Escape and light dismiss come free);
 *            the site's own search window and cart drawer on the hooks;
 *            language and currency as a dropdown and in the drawer, shown
 *            only when the site has more than one
 *   footer   layouts wordmark | newsletter | columns; menu columns and a
 *            text column (blocks); a subscribe form; the switches inline
 *
 * Pure. Browser safe.
 */
import { BOX, INNER, s, rootAttrs, type ComponentDef, type PresetBlock, type Setting } from "./schema"

export interface HeaderOptions {
  type: string
  name?: string
  layout: "split" | "center" | "minimal"
  drawer: "full" | "side" | "sheet"
  cart: "side" | "sheet"
  overlay?: boolean
  sticky?: boolean
  scheme?: string
  /** Words, as the template speaks. */
  words?: Partial<Record<"brand" | "menu" | "close" | "search" | "searchHint" | "account" | "cart" | "empty" | "checkout" | "subtotal" | "region" | "noResults" | "loading", string>>
  notices: string[]
  features: { title: string; text: string; url: string; image?: string }[]
  /** CSS appended after the structure: the template's skin. */
  skin?: string
}

const headerStyle = `
.hd { position: relative; z-index: 40; background: var(--s-bg); color: var(--s-text); container-type: inline-size; }
.hd--sticky { position: sticky; top: 0; }
.hd--overlay { margin-bottom: calc(-1 * var(--hd-h, 72px)); background: transparent; }
.hd--overlay .hd__notes { background: var(--s-bg); }
.hd a { color: inherit; }
.hd__notes { overflow: hidden; border-bottom: 1px solid var(--s-border); font-size: 0.8125rem; }
.hd__track { display: flex; gap: 48px; width: max-content; padding: 9px 0; }
.hd__note { margin: 0; white-space: nowrap; }
.hd__note a { text-decoration: underline; text-underline-offset: 3px; }
.hd__bar { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: var(--hd-h, 72px); padding: 0 var(--theme-padding-x, 20px); max-width: var(--theme-page-width, 1440px); margin: 0 auto; }
.hd__logo { justify-self: start; display: inline-flex; align-items: center; min-height: 44px; font-family: var(--theme-font-heading), sans-serif; font-size: 1.375rem; line-height: 1; letter-spacing: -0.02em; color: var(--s-heading); text-decoration: none; overflow-wrap: anywhere; }
.hd__logo img { display: block; height: auto; max-height: 44px; width: auto; max-width: 100%; }
.hd__nav { display: none; }
.hd__links { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; margin: 0; padding: 0; list-style: none; }
.hd__top { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; border: 0; background: none; color: inherit; font: inherit; font-size: 0.9375rem; text-decoration: none; cursor: pointer; }
.hd__top:hover, .hd__top:focus-visible { color: var(--s-accent); }
.hd__tools { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
.hd__tool, .hd__burger { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; min-width: 44px; padding: 0 10px; border: 0; background: none; color: inherit; font: inherit; font-size: 0.875rem; text-decoration: none; cursor: pointer; }
.hd__tool:hover, .hd__burger:hover { color: var(--s-accent); }
.hd__account, .hd__search-word { display: none; }
.hd__count { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; background: var(--s-accent); color: var(--s-bg); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.hd__count:empty, .hd__count[data-count="0"] { display: none; }
.hd__lines { position: relative; display: block; width: 22px; height: 2px; background: currentColor; }
.hd__lines::before, .hd__lines::after { content: ""; position: absolute; left: 0; width: 22px; height: 2px; background: currentColor; }
.hd__lines::before { top: -7px; }
.hd__lines::after { top: 7px; }
.hd__burger-word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.hd__region:not(:has([data-storelib-locale-list]:not([hidden]) [data-storelib-locale-option]:not([hidden]), [data-storelib-currency-list]:not([hidden]) [data-storelib-currency-option]:not([hidden]))) { display: none; }
.hd__region-panel { margin: 0; inset: var(--hd-h, 72px) var(--theme-padding-x, 20px) auto auto; width: min(320px, calc(100vw - 32px)); padding: 20px; border: 1px solid var(--s-border); background: var(--s-bg); color: var(--s-text); }
.hd__pref { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 12px; }
.hd__pref-label { width: 100%; margin: 0 0 2px; font-size: 0.8125rem; color: var(--s-muted); }
.hd__opt { min-height: 44px; padding: 0 12px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; }
.hd__opt[aria-current="true"] { border-color: currentColor; background: var(--s-text); color: var(--s-bg); }
.hd__mega { margin: 0; inset: var(--hd-h, 72px) 0 auto; width: 100%; max-width: none; max-height: calc(100svh - var(--hd-h, 72px)); overflow-y: auto; padding: 32px var(--theme-padding-x, 20px) 40px; border: 0; border-bottom: 1px solid var(--s-border); background: var(--s-bg); color: var(--s-text); }
.hd__mega-in { display: grid; gap: 28px; ${INNER} }
.hd__mega-all { font-family: var(--theme-font-heading), sans-serif; font-size: clamp(1.75rem, 1rem + 2.4vw, 3rem); line-height: 1; letter-spacing: -0.02em; color: var(--s-heading); text-decoration: none; }
.hd__mega-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.hd__mega-list a { display: inline-flex; align-items: center; min-height: 40px; font-size: 1.0625rem; text-decoration: none; }
.hd__mega-list a:hover { color: var(--s-accent); }
.hd__feats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 16px; }
.hd__feat { display: grid; gap: 8px; align-content: start; text-decoration: none; }
.hd__feat-media { display: block; aspect-ratio: 4 / 3; overflow: hidden; background: var(--s-surface); }
.hd__feat-media img { width: 100%; height: 100%; object-fit: cover; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.hd__feat-media--empty { background: var(--s-accent); }
.hd__feat-title { font-family: var(--theme-font-heading), sans-serif; font-size: 1.125rem; color: var(--s-heading); }
.hd__feat-text { font-size: 0.875rem; color: var(--s-muted); }
@media (hover: hover) and (pointer: fine) { .hd__feat:hover .hd__feat-media img { transform: scale(1.04); } }
.hd__drawer { margin: 0; padding: 20px var(--theme-padding-x, 20px) 32px; border: 0; background: var(--s-bg); color: var(--s-text); overflow-y: auto; max-width: none; max-height: none; }
.hd__drawer--full { inset: 0; width: 100%; height: 100%; }
.hd__drawer--side { inset: 0 auto 0 0; width: min(440px, 100%); height: 100%; border-right: 1px solid var(--s-border); }
.hd__drawer--sheet { inset: auto 0 0; width: 100%; max-height: 88svh; border-top: 1px solid var(--s-border); }
.hd__drawer::backdrop { background: rgb(0 0 0 / 0.45); }
.hd__drawer-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.hd__close { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; }
.hd__mlist { margin: 28px 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.hd__mlist > li { border-bottom: 1px solid var(--s-border); }
.hd__mlink, .hd__msum { display: flex; align-items: center; justify-content: space-between; min-height: 56px; padding: 6px 0; font-family: var(--theme-font-heading), sans-serif; font-size: clamp(1.5rem, 1rem + 4vw, 2.75rem); line-height: 1; letter-spacing: -0.02em; color: var(--s-heading); text-decoration: none; cursor: pointer; list-style: none; }
.hd__msum::-webkit-details-marker { display: none; }
.hd__msum::after { content: "+"; font-family: var(--theme-font-body), sans-serif; font-size: 1.5rem; }
details[open] > .hd__msum::after { content: "\\2212"; }
.hd__msub { margin: 0 0 16px; padding: 0; list-style: none; }
.hd__msub a { display: flex; align-items: center; min-height: 44px; font-size: 1.0625rem; text-decoration: none; }
.hd__drawer .hd__feats { margin: 8px 0 28px; }
.hd__drawer-foot { display: grid; gap: 16px; }
.hd__search-panel, .hd__cart { position: fixed; z-index: 60; background: var(--s-bg); color: var(--s-text); visibility: hidden; opacity: 0; transition: opacity var(--t-motion-hover, 200ms) ease, transform var(--t-motion-duration, 450ms) var(--t-motion-ease, cubic-bezier(0.2, 0.7, 0.1, 1)), visibility 0s linear var(--t-motion-duration, 450ms); }
.hd__search-panel { inset: 0 0 auto; max-height: 100svh; overflow-y: auto; padding: 20px var(--theme-padding-x, 20px) 36px; border-bottom: 1px solid var(--s-border); transform: translateY(-24px); }
.hd__search-in { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; ${INNER} }
.hd__input { min-width: 0; min-height: 56px; padding: 0 2px; border: 0; border-bottom: 2px solid currentColor; border-radius: 0; background: none; color: inherit; font: inherit; font-family: var(--theme-font-heading), sans-serif; font-size: clamp(1.375rem, 1rem + 2vw, 2.5rem); }
.hd__input:focus { outline: none; border-bottom-color: var(--s-accent); }
.hd__state { grid-column: 1 / -1; margin: 0; color: var(--s-muted); }
.hd__results { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 4px 24px; margin: 0; padding: 0; list-style: none; }
.hd__result a { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 14px; min-height: 72px; padding: 8px 0; border-bottom: 1px solid var(--s-border); text-decoration: none; }
.hd__result img { width: 56px; height: 56px; object-fit: cover; background: var(--s-surface); }
.hd__result-price { font-variant-numeric: tabular-nums; color: var(--s-muted); }
.hd__cart { display: flex; flex-direction: column; padding: 20px; }
.hd__cart--side { inset: 0 0 0 auto; width: min(440px, 100%); border-left: 1px solid var(--s-border); transform: translateX(24px); }
.hd__cart--sheet { inset: auto 0 0; max-height: 86svh; border-top: 1px solid var(--s-border); transform: translateY(32px); }
.hd__cart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--s-border); }
.hd__cart-title { margin: 0; font-family: var(--theme-font-heading), sans-serif; font-size: 1.5rem; color: var(--s-heading); }
.hd__lines-list { flex: 1; margin: 0; padding: 0; list-style: none; overflow-y: auto; }
.hd__line { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.hd__line img { width: 72px; height: 88px; object-fit: cover; background: var(--s-surface); }
.hd__line-title { color: var(--s-heading); text-decoration: none; }
.hd__line-var { display: block; font-size: 0.8125rem; color: var(--s-muted); }
.hd__qty { display: flex; align-items: center; gap: 4px; margin-top: 10px; }
.hd__qty button { min-width: 44px; min-height: 44px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; }
.hd__qty .hd__remove { min-width: 0; padding: 0 8px; border: 0; text-decoration: underline; }
.hd__line-price { font-variant-numeric: tabular-nums; }
.hd__cart-empty { margin: 24px 0; color: var(--s-muted); }
.hd__cart-foot { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--s-border); }
.hd__sub { display: flex; justify-content: space-between; margin: 0; font-variant-numeric: tabular-nums; }
.hd__checkout { min-height: 56px; border: 0; border-radius: var(--theme-button-radius, 0); background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 600; cursor: pointer; }
.hd__checkout:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.hd__search-panel[data-open="true"], .hd__cart[data-open="true"] { visibility: visible; opacity: 1; transform: none; transition-delay: 0s; }
.hd :focus-visible { outline: 2px solid var(--s-accent); outline-offset: 2px; }
@container (min-width: 960px) {
  .hd__nav { display: block; }
  .hd__account, .hd__search-word { display: inline; }
  .hd__search-mark { display: none; }
  .hd--split .hd__burger, .hd--center .hd__burger { display: none; }
  .hd--center .hd__bar { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); }
  .hd--center .hd__nav { order: -1; }
  .hd--center .hd__links { justify-content: flex-start; }
  .hd--center .hd__logo { justify-self: center; }
  .hd--minimal .hd__nav { display: none; }
  .hd__mega-in { grid-template-columns: minmax(0, 4fr) minmax(0, 3fr) minmax(0, 6fr); align-items: start; }
}
@media (prefers-reduced-motion: no-preference) {
  .hd__notes[data-run="true"] .hd__track { animation: hd-run calc(var(--hd-speed, 40) * 1s) linear infinite; }
  .hd__notes:hover .hd__track, .hd__notes:focus-within .hd__track { animation-play-state: paused; }
  @keyframes hd-run { to { transform: translateX(-50%); } }
}
@media (prefers-reduced-motion: reduce) { .hd__search-panel, .hd__cart { transition: none; } .hd__track { animation: none; } }
`

function headerTemplate(): string {
  const feature = `{% for block in section.blocks %}{% if block.type == "feature" %}<a class="hd__feat" href="{{ block.settings.url | url }}" {{ block.shopify_attributes }}>{% if block.settings.image %}<span class="hd__feat-media"><img src="{{ block.settings.image | asset }}" alt="{{ block.settings.title }}" width="480" height="360" loading="lazy"></span>{% else %}<span class="hd__feat-media hd__feat-media--empty" aria-hidden="true"></span>{% endif %}<span class="hd__feat-title">{{ block.settings.title }}</span>{% if block.settings.text %}<span class="hd__feat-text">{{ block.settings.text }}</span>{% endif %}</a>{% endif %}{% endfor %}`
  const prefs = (cls: string) => `<div class="hd__pref ${cls}" data-storelib-locale-list><p class="hd__pref-label">{{ settings.language_label }}</p><button class="hd__opt" type="button" data-storelib-locale-option hidden><span data-option-label></span></button></div>
      <div class="hd__pref ${cls}" data-storelib-currency-list><p class="hd__pref-label">{{ settings.currency_label }}</p><button class="hd__opt" type="button" data-storelib-currency-option hidden><span data-option-label></span></button></div>`
  return `
<header class="hd hd--{{ settings.layout }}{% if settings.overlay %} hd--overlay{% endif %}{% if settings.sticky %} hd--sticky{% endif %}" ${rootAttrs({ spacing: false })}>
  {% if settings.show_notices %}
  <div class="hd__notes" data-run="{{ settings.run_notices }}" data-storelib-motion="marquee" data-motion-speed="{{ settings.notice_speed }}" style="--hd-speed: {{ settings.notice_speed }};">
    <div class="hd__track">
      {% for block in section.blocks %}{% if block.type == "notice" %}<p class="hd__note" {{ block.shopify_attributes }}>{% if block.settings.url %}<a href="{{ block.settings.url | url }}">{{ block.settings.text }}</a>{% else %}{{ block.settings.text }}{% endif %}</p>{% endif %}{% endfor %}
      {% if settings.run_notices %}{% for block in section.blocks %}{% if block.type == "notice" %}<p class="hd__note" aria-hidden="true">{{ block.settings.text }}</p>{% endif %}{% endfor %}{% endif %}
    </div>
  </div>
  {% endif %}
  <div class="hd__bar">
    <button class="hd__burger" type="button" popovertarget="hd-menu-{{ section.id }}"><span class="hd__lines" aria-hidden="true"></span><span class="hd__burger-word">{{ settings.menu_label }}</span></button>
    <a class="hd__logo" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" width="{{ settings.logo_width }}" height="44">{% else %}{{ shop.name | default: settings.brand }}{% endif %}</a>
    <nav class="hd__nav" aria-label="{{ settings.nav_label }}">
      <ul class="hd__links">
        {% for link in settings.menu.links %}
        <li>
          {% if link.links.size > 0 %}
          <button class="hd__top" type="button" popovertarget="hd-mega-{{ section.id }}-{{ forloop.index }}">{{ link.title }}</button>
          <div class="hd__mega" id="hd-mega-{{ section.id }}-{{ forloop.index }}" popover>
            <div class="hd__mega-in">
              <a class="hd__mega-all" href="{{ link.url }}">{{ link.title }}</a>
              <ul class="hd__mega-list">{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>
              <div class="hd__feats">${feature}</div>
            </div>
          </div>
          {% else %}
          <a class="hd__top" href="{{ link.url }}">{{ link.title }}</a>
          {% endif %}
        </li>
        {% endfor %}
      </ul>
    </nav>
    <div class="hd__tools">
      <div class="hd__region">
        <button class="hd__tool" type="button" popovertarget="hd-region-{{ section.id }}"><span data-storelib-currency-current></span><span data-storelib-locale-current></span></button>
        <div class="hd__region-panel" id="hd-region-{{ section.id }}" popover>
          ${prefs("")}
        </div>
      </div>
      <a class="hd__tool" href="{{ routes.search_url }}" data-storelib-search><span class="hd__search-word">{{ settings.search_label }}</span><span class="hd__search-mark" aria-label="{{ settings.search_label }}">{{ settings.search_short }}</span></a>
      <a class="hd__tool hd__account" href="{{ routes.account_url }}">{{ settings.account_label }}</a>
      <a class="hd__tool" href="{{ routes.cart_url }}" data-storelib-cart>{{ settings.cart_label }} <span class="hd__count" data-storelib-cart-count></span></a>
    </div>
  </div>

  <div class="hd__drawer hd__drawer--{{ settings.drawer }}" id="hd-menu-{{ section.id }}" popover>
    <div class="hd__drawer-head">
      <a class="hd__logo" href="{{ routes.root_url }}">{{ shop.name | default: settings.brand }}</a>
      <button class="hd__close" type="button" popovertarget="hd-menu-{{ section.id }}" popovertargetaction="hide">{{ settings.close_label }}</button>
    </div>
    <nav aria-label="{{ settings.nav_label }}">
      <ul class="hd__mlist">
        {% for link in settings.menu.links %}
        <li>
          {% if link.links.size > 0 %}
          <details><summary class="hd__msum">{{ link.title }}</summary>
            <ul class="hd__msub"><li><a href="{{ link.url }}">{{ link.title }}</a></li>{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>
          </details>
          {% else %}
          <a class="hd__mlink" href="{{ link.url }}">{{ link.title }}</a>
          {% endif %}
        </li>
        {% endfor %}
      </ul>
    </nav>
    <div class="hd__feats">${feature}</div>
    <div class="hd__drawer-foot">
      <a class="hd__tool" href="{{ routes.account_url }}">{{ settings.account_label }}</a>
      ${prefs("hd__pref--drawer")}
    </div>
  </div>

  <div class="hd__search-panel" data-storelib-search-panel role="dialog" aria-label="{{ settings.search_label }}">
    <div class="hd__search-in">
      <input class="hd__input" type="search" data-storelib-search-input placeholder="{{ settings.search_placeholder }}" aria-label="{{ settings.search_label }}">
      <button class="hd__close" type="button" data-storelib-search-close>{{ settings.close_label }}</button>
      <p class="hd__state" data-storelib-search-loading hidden>{{ settings.loading_text }}</p>
      <p class="hd__state" data-storelib-search-empty hidden>{{ settings.no_results_text }}</p>
      <ul class="hd__results" data-storelib-search-results>
        <li class="hd__result" data-storelib-search-result hidden><a data-result-url><img data-result-image alt="" width="56" height="56"><span data-result-title></span><span class="hd__result-price" data-result-price></span></a></li>
      </ul>
    </div>
  </div>

  <aside class="hd__cart hd__cart--{{ settings.cart_style }}" data-storelib-cart-panel aria-label="{{ settings.cart_label }}">
    <div class="hd__cart-head"><p class="hd__cart-title">{{ settings.cart_label }}</p><button class="hd__close" type="button" data-storelib-cart-close>{{ settings.close_label }}</button></div>
    <p class="hd__cart-empty" data-storelib-cart-empty>{{ settings.empty_text }}</p>
    <ul class="hd__lines-list" data-storelib-cart-lines>
      <li class="hd__line" data-storelib-cart-line hidden>
        <img data-line-image alt="" width="72" height="88">
        <div><a class="hd__line-title" data-line-url><span data-line-title></span></a><span class="hd__line-var" data-line-variant></span>
          <div class="hd__qty"><button type="button" data-line-dec aria-label="{{ settings.less_label }}">-</button><span data-line-qty></span><button type="button" data-line-inc aria-label="{{ settings.more_label }}">+</button><button class="hd__remove" type="button" data-line-remove>{{ settings.remove_label }}</button></div>
        </div>
        <span class="hd__line-price" data-line-price></span>
      </li>
    </ul>
    <div class="hd__cart-foot" data-storelib-cart-filled>
      <p class="hd__sub"><span>{{ settings.subtotal_label }}</span><span data-storelib-cart-subtotal></span></p>
      <button class="hd__checkout" type="button" data-storelib-checkout>{{ settings.checkout_label }}</button>
    </div>
  </aside>
</header>`
}

export function header(o: HeaderOptions): ComponentDef {
  const w = { brand: "Studio", menu: "Menu", close: "Close", search: "Search", searchHint: "Search the shop", account: "Account", cart: "Bag", empty: "Nothing in your bag yet.", checkout: "Check out", subtotal: "Subtotal", region: "Region", noResults: "Nothing matches that. Try another word.", loading: "Looking...", ...o.words }
  const settings: Setting[] = [
    s.menu("menu", "Menu", "main-menu"),
    s.text("brand", "Name when there is no logo or shop name", w.brand),
    s.range("logo_width", "Logo width", 60, 260, 4, "px", 132),
    s.select("layout", "Layout", o.layout, [
      ["split", "Logo left, menu in the middle"],
      ["center", "Menu left, logo in the middle"],
      ["minimal", "Logo and a menu button"],
    ]),
    s.select("drawer", "Menu drawer", o.drawer, [
      ["full", "Full screen"],
      ["side", "From the side"],
      ["sheet", "From the bottom"],
    ]),
    s.select("cart_style", "Cart drawer", o.cart, [
      ["side", "From the side"],
      ["sheet", "From the bottom"],
    ]),
    s.check("overlay", "See-through over the first section", !!o.overlay),
    s.check("sticky", "Stays at the top while scrolling", !!o.sticky),
    s.header("hdr_notices", "Notice line"),
    s.check("show_notices", "Show the notice line", o.notices.length > 0),
    s.check("run_notices", "Notices run sideways", o.notices.length > 1),
    s.range("notice_speed", "Seconds per loop", 10, 90, 5, "s", 40),
    s.header("hdr_words", "Words"),
    s.text("nav_label", "Menu name (read aloud)", "Main"),
    s.text("menu_label", "Menu button", w.menu),
    s.text("close_label", "Close button", w.close),
    s.text("search_label", "Search", w.search),
    s.text("search_short", "Search on phones", w.search),
    s.text("search_placeholder", "Search hint", w.searchHint),
    s.text("loading_text", "While searching", w.loading),
    s.text("no_results_text", "No results", w.noResults),
    s.text("account_label", "Account", w.account),
    s.text("cart_label", "Cart", w.cart),
    s.text("empty_text", "Empty cart", w.empty),
    s.text("subtotal_label", "Subtotal", w.subtotal),
    s.text("checkout_label", "Checkout button", w.checkout),
    s.text("remove_label", "Remove", "Remove"),
    s.text("less_label", "One less (read aloud)", "One less"),
    s.text("more_label", "One more (read aloud)", "One more"),
    s.text("language_label", "Language", "Language"),
    s.text("currency_label", "Currency", "Currency"),
    s.scheme(o.scheme ?? "site"),
  ]
  const preset: PresetBlock[] = [
    ...o.notices.map((text) => ({ type: "notice", settings: { text, url: "" } })),
    ...o.features.map((f) => ({ type: "feature", settings: { title: f.title, text: f.text, url: f.url, image: f.image ?? "" } })),
  ]
  return {
    type: o.type,
    name: o.name ?? "Site header",
    kind: "header",
    template: headerTemplate(),
    style: headerStyle + (o.skin ?? ""),
    settings,
    blocks: [
      { type: "notice", name: "Notice", limit: 4, settings: [s.text("text", "Text", "Orders packed every weekday"), s.url("url", "Link", "")] },
      { type: "feature", name: "Featured card", limit: 3, settings: [s.text("title", "Title", "New this month"), s.text("text", "Line under it", "See what just arrived"), s.url("url", "Link", "/products"), s.image("image", "Picture")] },
    ],
    maxBlocks: 7,
    preset,
  }
}

/* ── footer ────────────────────────────────────────────────────────────── */

export interface FooterOptions {
  type: string
  name?: string
  layout: "wordmark" | "newsletter" | "columns"
  scheme?: string
  words: { brand: string; newsHeading: string; newsText: string; legal: string; subscribe?: string; email?: string; thanks?: string }
  columns: { heading: string; menu: string }[]
  notes: { heading: string; text: string }[]
  skin?: string
}

const footerStyle = `
.ft { ${BOX} }
.ft a { color: inherit; }
.ft__in { display: grid; gap: clamp(36px, 6vw, 72px); ${INNER} }
.ft__news { display: grid; gap: 16px; max-width: 40rem; }
.ft__h { margin: 0; font-family: var(--theme-font-heading), sans-serif; font-size: clamp(1.75rem, 1.1rem + 3vw, 3.5rem); line-height: 0.98; letter-spacing: -0.02em; color: var(--s-heading); }
.ft__text { margin: 0; color: var(--s-muted); line-height: 1.6; }
.ft__text p { margin: 0; }
.ft__form { display: grid; gap: 8px; }
.ft__label { font-size: 0.875rem; }
.ft__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; border: 1px solid var(--s-border); border-radius: var(--theme-input-radius, 0); }
.ft__row input { min-width: 0; min-height: 52px; padding: 0 14px; border: 0; background: none; color: inherit; font: inherit; }
.ft__row button { min-height: 52px; padding: 0 20px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 600; cursor: pointer; }
.ft__row button:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.ft__cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 28px 24px; }
.ft__col-h { margin: 0 0 12px; font-size: 0.875rem; font-weight: 600; color: var(--s-heading); }
.ft__col ul { margin: 0; padding: 0; list-style: none; }
.ft__col li a { display: inline-flex; align-items: center; min-height: 36px; text-decoration: none; }
.ft__col li a:hover { color: var(--s-accent); }
.ft__col-text { margin: 0; color: var(--s-muted); line-height: 1.6; }
.ft__col-text p { margin: 0 0 8px; }
.ft__prefs { display: flex; flex-wrap: wrap; gap: 20px; }
.ft__pref { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ft__pref-label { margin: 0 6px 0 0; font-size: 0.8125rem; color: var(--s-muted); }
.ft__opt { min-height: 44px; padding: 0 12px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; }
.ft__opt[aria-current="true"] { border-color: currentColor; }
.ft__mark { margin: clamp(40px, 8vw, 96px) 0 0; font-family: var(--theme-font-heading), sans-serif; font-size: min(19cqi, 300px); line-height: 0.8; letter-spacing: -0.04em; color: var(--s-heading); overflow-wrap: anywhere; ${INNER} }
.ft__base { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--s-border); font-size: 0.8125rem; color: var(--s-muted); ${INNER} }
.ft__base p { margin: 0; }
@container (min-width: 900px) {
  .ft--newsletter .ft__in, .ft--wordmark .ft__in { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: start; }
  .ft--columns .ft__news { max-width: none; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: end; }
}
`

function footerTemplate(): string {
  return `
<footer class="ft ft--{{ settings.layout }}" ${rootAttrs()}>
  <div class="ft__in">
    {% if settings.show_newsletter %}
    <div class="ft__news">
      <div><h2 class="ft__h">{{ settings.news_heading | raw }}</h2><div class="ft__text">{{ settings.news_text | raw }}</div></div>
      <form class="ft__form" data-storelib-form="subscribe">
        <label class="ft__label" for="ft-email-{{ section.id }}">{{ settings.email_label }}</label>
        <div class="ft__row"><input id="ft-email-{{ section.id }}" type="email" name="email" required autocomplete="email"><button type="submit">{{ settings.subscribe_label }}</button></div>
      </form>
    </div>
    {% endif %}
    <div class="ft__cols">
      {% for block in section.blocks %}
        {% if block.type == "column" %}
        <div class="ft__col" {{ block.shopify_attributes }}><h3 class="ft__col-h">{{ block.settings.heading }}</h3><ul>{% for link in block.settings.menu.links %}<li><a href="{{ link.url }}">{{ link.title }}</a></li>{% endfor %}</ul></div>
        {% elsif block.type == "note" %}
        <div class="ft__col" {{ block.shopify_attributes }}><h3 class="ft__col-h">{{ block.settings.heading }}</h3><div class="ft__col-text">{{ block.settings.text | raw }}</div></div>
        {% endif %}
      {% endfor %}
    </div>
  </div>
  {% if settings.layout == "wordmark" %}<p class="ft__mark" aria-hidden="true">{{ shop.name | default: settings.brand }}</p>{% endif %}
  <div class="ft__base">
    <p>{{ shop.name | default: settings.brand }} {{ settings.legal }}</p>
    <div class="ft__prefs">
      <div class="ft__pref" data-storelib-locale-list><p class="ft__pref-label">{{ settings.language_label }}</p><button class="ft__opt" type="button" data-storelib-locale-option hidden><span data-option-label></span></button></div>
      <div class="ft__pref" data-storelib-currency-list><p class="ft__pref-label">{{ settings.currency_label }}</p><button class="ft__opt" type="button" data-storelib-currency-option hidden><span data-option-label></span></button></div>
    </div>
  </div>
</footer>`
}

export function footer(o: FooterOptions): ComponentDef {
  return {
    type: o.type,
    name: o.name ?? "Site footer",
    kind: "footer",
    template: footerTemplate(),
    style: footerStyle + (o.skin ?? ""),
    settings: [
      s.select("layout", "Layout", o.layout, [
        ["wordmark", "Big name at the bottom"],
        ["newsletter", "Newsletter first"],
        ["columns", "Columns"],
      ]),
      s.text("brand", "Name when there is no shop name", o.words.brand),
      s.header("hdr_news", "Newsletter"),
      s.check("show_newsletter", "Show the newsletter", true),
      s.inline("news_heading", "Heading", o.words.newsHeading),
      s.rich("news_text", "Text", o.words.newsText),
      s.text("email_label", "Email label", o.words.email ?? "Your email"),
      s.text("subscribe_label", "Button", o.words.subscribe ?? "Sign up"),
      s.header("hdr_base", "Bottom line"),
      s.text("legal", "After the name", o.words.legal),
      s.text("language_label", "Language", "Language"),
      s.text("currency_label", "Currency", "Currency"),
      s.scheme(o.scheme ?? "site_inverse"),
      s.header("hdr_spacing", "Spacing"),
      s.range("padding_top", "Top padding", 0, 200, 8, "px", 96),
      s.range("padding_bottom", "Bottom padding", 0, 200, 8, "px", 32),
    ],
    blocks: [
      { type: "column", name: "Menu column", limit: 4, settings: [s.text("heading", "Heading", "Shop"), s.menu("menu", "Menu", "footer")] },
      { type: "note", name: "Text column", limit: 2, settings: [s.text("heading", "Heading", "Visit"), s.rich("text", "Text", "<p>Open every day.</p>")] },
    ],
    maxBlocks: 6,
    preset: [...o.columns.map((c) => ({ type: "column", settings: { heading: c.heading, menu: c.menu } })), ...o.notes.map((n) => ({ type: "note", settings: { heading: n.heading, text: n.text } }))],
  }
}
