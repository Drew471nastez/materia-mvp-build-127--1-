/**
 * TEMPLATE l, "Sable": a local barber or beauty salon, booking first. The
 * header carries today's hours and a Book button that stays on screen on a
 * phone; the services read like the price board on the wall; booking is the
 * store's real service products with their own checkout; hours, address and
 * directions are never more than a scroll away. Sturdy slab headings, bottle
 * green and brass.
 */
import {
  BOX, cartPanel, chromeVars, chromeWords, defineSection, image, menu, motion, panelCss, prefs, productList, range, revealCss, richtext, scheme, searchPanel, spacing, text, textarea, url, vars,
} from "../kit-b"

const D = "font-family: var(--theme-font-heading), serif; color: var(--s-heading); font-weight: 700;"
const SMALL = "font-size: 0.875rem;"

export const header = defineSection({
  type: "ai_sb_header",
  name: "Header",
  kind: "header",
  summary: "Booking-led header: a line with today's hours and the address, then the name, the menu, search, cart and a Book button; on phones the Book button stays fixed at the bottom of the screen and Menu opens a bottom sheet with language and currency.",
  template: `
<header class="sbn" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <div class="sbn__util"><span>{{ settings.hours_line }}</span>{% if settings.address %}<a href="{{ settings.map_url | url }}">{{ settings.address }}</a>{% endif %}{% if settings.phone %}<a href="{{ settings.phone_url | url }}">{{ settings.phone }}</a>{% endif %}</div>
  <div class="sbn__bar">
    <a class="sbn__logo" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" width="{{ settings.logo_width }}" height="40">{% else %}{{ shop.name | default: settings.brand }}{% endif %}</a>
    <nav class="sbn__nav" aria-label="{{ settings.nav_label }}">{% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}</nav>
    <div class="sbn__tools">
      <button class="sbn__tool sbn__wide" type="button" data-storelib-search>{{ settings.search_label }}</button>
      <button class="sbn__tool" type="button" data-storelib-cart>{{ settings.cart_label }} <span class="sbn__count" data-storelib-cart-count></span></button>
      <button class="sbn__tool sbn__burger" type="button" popovertarget="sbn-d-{{ section.id }}">{{ settings.menu_label }}</button>
      <a class="sbn__book" href="{{ settings.book_url | url }}">{{ settings.book_label }}</a>
    </div>
  </div>
  <div class="sbn__sheet" id="sbn-d-{{ section.id }}" popover>
    <div class="sbn__sheet-head"><p class="sbn__sheet-title">{{ shop.name | default: settings.brand }}</p><button class="sbn-x" type="button" popovertarget="sbn-d-{{ section.id }}" popovertargetaction="hide">{{ settings.close_label }}</button></div>
    <nav aria-label="{{ settings.nav_label }}"><ul class="sbn__list">{% for link in settings.menu.links %}<li><a class="sbn__link" href="{{ link.url }}">{{ link.title }}</a>{% if link.links.size > 0 %}<ul class="sbn__sub">{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>{% endif %}</li>{% endfor %}</ul></nav>
    <p class="sbn__row"><button class="sbn__tool" type="button" data-storelib-search>{{ settings.search_label }}</button><a class="sbn__acct" href="{{ routes.account_url }}">{{ settings.account_label }}</a></p>
    <ul class="sbn__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{% if block.settings.url %}<a href="{{ block.settings.url | url }}">{{ block.settings.text }}</a>{% else %}{{ block.settings.text }}{% endif %}</li>{% endfor %}</ul>
    ${prefs("sbn")}
  </div>
  ${searchPanel("sbn")}
  ${cartPanel("sbn")}
</header>`,
  style: `
.sbn__notes { display: grid; gap: 4px; margin: 0 0 16px; padding: 0; list-style: none; font-size: 0.875rem; }
.sbn__notes a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; }
.sbn { position: relative; z-index: 30; background: var(--s-bg); color: var(--s-text); border-bottom: 2px solid var(--s-text); }
.sbn__util { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 18px; padding: 8px var(--theme-padding-x, 20px); background: var(--s-text); color: var(--s-bg); ${SMALL} }
.sbn__util a { color: inherit; }
.sbn__bar { display: flex; align-items: center; gap: 14px; min-height: 68px; padding: 0 var(--theme-padding-x, 20px); }
.sbn__logo { margin-right: auto; ${D} font-size: 1.625rem; letter-spacing: -0.02em; text-decoration: none; }
.sbn__logo img { display: block; max-height: 40px; width: auto; height: auto; }
.sbn__nav { display: none; gap: 22px; }
.sbn__nav a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; font-weight: 600; text-decoration: none; }
.sbn__nav a:hover { text-decoration: underline; text-decoration-color: var(--s-accent); text-decoration-thickness: 3px; text-underline-offset: 6px; }
.sbn__tools { display: flex; align-items: center; gap: 2px; }
.sbn__tool { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 10px; border: 0; background: none; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
.sbn__wide { display: none; }
.sbn__count:empty, .sbn__count[data-count="0"] { display: none; }
.sbn__count { min-width: 1.5em; padding: 0 5px; background: var(--s-accent); color: var(--s-text); text-align: center; font-size: 0.75rem; }
.sbn__book { position: fixed; z-index: 35; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); display: flex; align-items: center; justify-content: center; min-height: 56px; background: var(--s-accent); color: var(--s-text); ${D} font-size: 1.125rem; text-decoration: none; box-shadow: 0 2px 0 var(--s-text); }
.sbn__sheet { inset: auto 0 0 0; width: 100%; max-width: none; max-height: 90svh; margin: 0; padding: 16px var(--theme-padding-x, 20px) 28px; border: 0; border-top: 2px solid var(--s-text); background: var(--s-bg); color: var(--s-text); overflow-y: auto; }
.sbn__sheet-head { display: flex; align-items: center; justify-content: space-between; }
.sbn__sheet-title { margin: 0; ${D} font-size: 1.25rem; }
.sbn__list { margin: 16px 0; padding: 0; list-style: none; }
.sbn__link { display: block; padding: 10px 0; ${D} font-size: 2rem; letter-spacing: -0.02em; text-decoration: none; border-bottom: 1px solid var(--s-border); }
.sbn__sub { margin: 4px 0 8px; padding: 0; list-style: none; }
.sbn__sub a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; }
.sbn__row { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0 0 12px; }
.sbn__row .sbn__tool { padding-left: 0; }
.sbn__acct { display: inline-flex; min-height: 44px; align-items: center; color: inherit; font-weight: 600; }
.sbn :focus-visible { outline: 3px solid var(--s-accent); outline-offset: 2px; }
${panelCss("sbn", { cartFrom: "bottom", searchFrom: "top" })}
.sbn-cart { border-top: 2px solid var(--s-text); }
.sbn-cart__go { background: var(--s-accent); color: var(--s-text); }
@media (min-width: 960px) {
  .sbn__nav { display: flex; }
  .sbn__wide { display: inline-flex; }
  .sbn__burger { display: none; }
  .sbn__book { position: static; min-height: 46px; padding: 0 22px; box-shadow: none; font-size: 1rem; }
  .sbn-cart { inset: 0 0 0 auto; width: min(440px, 100%); max-height: none; transform: translateX(100%); border-top: 0; border-left: 2px solid var(--s-text); }
}
@media (prefers-reduced-motion: no-preference) {
  .sbn__sheet { transition: transform var(--t-motion-duration, 650ms) var(--t-motion-ease, ease), display var(--t-motion-duration, 650ms) allow-discrete, overlay var(--t-motion-duration, 650ms) allow-discrete; transform: translateY(100%); }
  .sbn__sheet:popover-open { transform: none; }
  @starting-style { .sbn__sheet:popover-open { transform: translateY(100%); } }
}`,
  settings: [
    menu(),
    text("brand", "Name when there is no logo", "Sable"),
    range("logo_width", "Logo width", 60, 220, 4, 120, "px"),
    text("hours_line", "Hours line", "Open today 9:00 to 19:00, walk-ins until 17:00"),
    text("address", "Address", "41 Mill Lane, Leith"),
    url("map_url", "Address goes to (a maps link)", "https://maps.google.com/?q=41+Mill+Lane+Leith"),
    text("phone", "Phone", "0131 555 0142"),
    url("phone_url", "Phone link", "tel:+441315550142"),
    text("book_label", "Book button", "Book a chair"),
    url("book_url", "Book button goes to", "/products"),
    text("account_label", "Account link", "Your bookings"),
    ...chromeWords({ cart_label: "Basket", search_placeholder: "Search services and products" }),
    scheme("site"),
  ],
  blocks: [{ type: "note", name: "Line in the menu", settings: [text("text", "Words", "Walk-ins until five today"), url("url", "Link (optional)", "")] }],
  presetBlocks: [
    { type: "note", settings: { text: "Walk-ins until five today", url: "/contact" } },
    { type: "note", settings: { text: "Gift vouchers", url: "/products" } },
  ],
  maxBlocks: 4,
})

export const hero = defineSection({
  type: "ai_sb_hero",
  name: "Booking hero",
  summary: "A big photograph from the chair beside a short promise, the Book action and the plain facts that decide a booking: price from, time, walk-ins.",
  template: `
<section class="sbh" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="sbh__grid">
    {% if settings.photo %}<div class="sbh__media" data-storelib-motion="parallax-depth" data-motion-intensity="30" data-motion-pointer="false">{% if settings.photo %}<img class="sbh__img" data-motion-depth="0.2" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1400" height="1600" fetchpriority="high">{% endif %}</div>{% endif %}
    <div class="sbh__copy">
      <h1 class="sbh__h">{{ settings.heading }}</h1>
      <div class="sbh__intro">{{ settings.intro | raw }}</div>
      <div class="sbh__actions"><a class="sbh__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a><a class="sbh__link" href="{{ settings.second_url | url }}">{{ settings.second_label }}</a></div>
      <dl class="sbh__facts">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}</dl>
    </div>
  </div>
</section>`,
  style: `
.sbh { ${BOX} }
.sbh__grid { display: grid; gap: 24px; }
.sbh__media { overflow: hidden; }
.sbh__img { width: 100%; height: auto; aspect-ratio: 7 / 8; object-fit: cover; }
.sbh__h { margin: 0; ${D} font-size: clamp(2.75rem, 1.4rem + 6cqi, 6.5rem); line-height: 0.92; letter-spacing: -0.03em; max-width: 12ch; }
.sbh__intro { max-width: 42ch; margin-top: 18px; font-size: 1.1875rem; line-height: 1.5; }
.sbh__intro p { margin: 0; }
.sbh__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 22px; margin-top: 26px; }
.sbh__btn { display: inline-flex; align-items: center; min-height: 58px; padding: 0 30px; background: var(--s-accent); color: var(--s-text); ${D} font-size: 1.25rem; text-decoration: none; box-shadow: 0 3px 0 var(--s-text); transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.sbh__btn:active { transform: translateY(3px); box-shadow: none; }
.sbh__link { display: inline-flex; min-height: 44px; align-items: center; color: inherit; font-weight: 600; text-underline-offset: 6px; }
.sbh__facts { display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 30px 0 0; padding-top: 16px; border-top: 2px solid var(--s-text); }
.sbh__facts dt { ${SMALL} }
.sbh__facts dd { margin: 2px 0 0; ${D} font-size: 1.375rem; }
@container (min-width: 900px) { .sbh__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 56px; } }
@media (prefers-reduced-motion: no-preference) {
  .sbh:not([data-motion="off"]) .sbh__copy > * { animation: sbh-rise var(--t-motion-duration, 650ms) var(--t-motion-ease, ease) both; }
  .sbh:not([data-motion="off"]) .sbh__copy > :nth-child(2) { animation-delay: var(--t-motion-stagger, 65ms); }
  .sbh:not([data-motion="off"]) .sbh__copy > :nth-child(3) { animation-delay: calc(var(--t-motion-stagger, 65ms) * 2); }
}
@keyframes sbh-rise { from { opacity: 0; transform: translateY(calc(var(--t-motion-distance, 24px) * var(--m-k, 1))); } }`,
  settings: [
    text("heading", "Heading", "Good cuts, no rush, Leith since 2016"),
    richtext("intro", "Intro", "<p>Barbering and colour on Mill Lane. Book a chair online in a minute, or walk in before five.</p>"),
    text("cta_label", "Button", "Book a chair"),
    url("cta_url", "Button goes to", "/products"),
    text("second_label", "Second link", "See prices"),
    url("second_url", "Second link goes to", "#section-prices"),
    image("photo", "Photograph"),
    text("photo_alt", "Photograph description", "A barber finishing a fade with clippers in a warm lit shop"),
    ...motion(),
    scheme("site"),
    ...spacing(32, 96),
  ],
  blocks: [{ type: "fact", name: "Fact", settings: [text("label", "Label", "Cuts from"), text("value", "Value", "£24")] }],
  presetBlocks: [
    { type: "fact", settings: { label: "Cuts from", value: "£24" } },
    { type: "fact", settings: { label: "A cut takes", value: "40 minutes" } },
    { type: "fact", settings: { label: "Walk-ins", value: "Until 17:00" } },
  ],
  maxBlocks: 3,
})

export const prices = defineSection({
  type: "ai_sb_prices",
  name: "Price board",
  summary: "The services like the board on the wall: name, a short note, how long it takes and the price, grouped under small headings, with one Book link.",
  template: `
<section class="sbp" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="sbp__head"><h2 class="sbp__h">{{ settings.heading }}</h2><a class="sbp__book" href="{{ settings.book_url | url }}">{{ settings.book_label }}</a></div>
  <ul class="sbp__list" data-storelib-motion="reveal-stagger">
    {% for block in section.blocks %}
      {% if block.type == "group" %}<li class="sbp__group" data-block-id="{{ block.id }}"><h3 class="sbp__gh">{{ block.settings.title }}</h3></li>{% else %}
      <li class="sbp__item" data-block-id="{{ block.id }}"><span class="sbp__name">{{ block.settings.name }}</span><span class="sbp__dots" aria-hidden="true"></span><span class="sbp__price">{{ block.settings.price }}</span><span class="sbp__note">{{ block.settings.note }}{% if block.settings.time %} · {{ block.settings.time }}{% endif %}</span></li>{% endif %}
    {% endfor %}
  </ul>
  <p class="sbp__small">{{ settings.small_print }}</p>
</section>`,
  style: `
.sbp { ${BOX} }
.sbp__head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px 24px; margin-bottom: 20px; }
.sbp__h { margin: 0; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 4.5rem); letter-spacing: -0.025em; line-height: 0.95; }
.sbp__book { display: inline-flex; align-items: center; min-height: 48px; padding: 0 20px; border: 2px solid var(--s-text); color: inherit; font-weight: 700; text-decoration: none; }
.sbp__book:hover { background: var(--s-accent); }
.sbp__list { display: grid; margin: 0; padding: 0; list-style: none; column-gap: 56px; }
.sbp__group { padding: 22px 0 6px; }
.sbp__gh { display: inline-block; margin: 0; ${D} font-size: 1.125rem; letter-spacing: 0.02em; border-bottom: 3px solid var(--s-accent); }
.sbp__item { display: grid; grid-template-columns: auto minmax(12px, 1fr) auto; align-items: baseline; gap: 2px 10px; padding: 12px 0; border-bottom: 1px solid var(--s-border); }
.sbp__name { ${D} font-size: 1.25rem; }
.sbp__dots { border-bottom: 2px dotted var(--s-border); transform: translateY(-4px); }
.sbp__price { ${D} font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.sbp__note { grid-column: 1 / -1; ${SMALL} opacity: 0.75; }
.sbp__small { margin: 20px 0 0; ${SMALL} opacity: 0.75; }
@container (min-width: 900px) { .sbp__list { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: row; } .sbp__group { grid-column: 1 / -1; } }
${revealCss("sbp", ".sbp__item", "sbp-rise")}`,
  settings: [
    text("heading", "Heading", "Prices"),
    text("book_label", "Book link", "Book online"),
    url("book_url", "Book link goes to", "/products"),
    text("small_print", "Small print", "Card or cash. Under 12s half price on weekdays."),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [
    { type: "group", name: "Group heading", settings: [text("title", "Heading", "Hair")] },
    { type: "service", name: "Service", settings: [text("name", "Service", "Cut"), text("price", "Price", "£24"), text("time", "Time", "40 min"), text("note", "Note", "")] },
  ],
  presetBlocks: [
    { type: "group", settings: { title: "Hair" } },
    { type: "service", settings: { name: "Cut", price: "£24", time: "40 min", note: "Scissors or clippers, wash and style" } },
    { type: "service", settings: { name: "Skin fade", price: "£27", time: "45 min", note: "Foil finish, line up included" } },
    { type: "service", settings: { name: "Long hair", price: "£34", time: "60 min", note: "Below the shoulder, dry cut" } },
    { type: "group", settings: { title: "Beard and shave" } },
    { type: "service", settings: { name: "Beard trim", price: "£14", time: "20 min", note: "Shape, line and hot towel" } },
    { type: "service", settings: { name: "Hot towel shave", price: "£28", time: "40 min", note: "Straight razor, two towels" } },
    { type: "group", settings: { title: "Colour" } },
    { type: "service", settings: { name: "Grey blend", price: "£22", time: "30 min", note: "With a cut, from" } },
  ],
  maxBlocks: 30,
})

export const ticker = defineSection({
  type: "ai_sb_ticker",
  name: "Running line",
  summary: "A running line of shop facts on the dark band (P3 marquee), paused on hover; still and wrapped for reduced motion.",
  template: `
<section class="sbq" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars("--sbq-speed: {{ settings.speed }};")}" aria-label="{{ settings.label }}">
  <div class="sbq__track" data-storelib-motion="marquee" data-motion-speed="{{ settings.speed }}" data-motion-reactive="40">
    <ul class="sbq__run" data-motion-track>{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.text }}</li>{% endfor %}</ul>
    <ul class="sbq__run" aria-hidden="true">{% for block in section.blocks %}<li>{{ block.settings.text }}</li>{% endfor %}</ul>
  </div>
</section>`,
  style: `
.sbq { ${BOX} overflow: hidden; }
.sbq__track { display: flex; width: max-content; }
.sbq__run { display: flex; flex: none; margin: 0; padding: 0; list-style: none; }
.sbq__run li { ${D} font-size: clamp(1.75rem, 1rem + 3.6cqi, 4rem); white-space: nowrap; }
.sbq__run li::after { content: "\\2726"; margin: 0 0.6em; color: var(--s-accent); font-size: 0.6em; vertical-align: middle; }
@media (prefers-reduced-motion: reduce) { .sbq__track { width: auto; } .sbq__run { flex-wrap: wrap; } .sbq__run[aria-hidden="true"] { display: none; } .sbq__run li { white-space: normal; } }
@media (prefers-reduced-motion: no-preference) { .sbq:not([data-motion="off"]) .sbq__track { animation: sbq-run calc(3000s / var(--sbq-speed, 80)) linear infinite; } .sbq:hover .sbq__track { animation-play-state: paused; } .sbq[data-motion="off"] .sbq__run[aria-hidden="true"] { display: none; } }
.sbq__track[data-motion-ready] { animation: none !important; }
.sbq__track[data-motion-ready] .sbq__run[aria-hidden="true"] { display: none; }
@keyframes sbq-run { to { transform: translateX(-50%); } }`,
  settings: [text("label", "What it lists (read aloud)", "About the shop"), range("speed", "Speed", 20, 300, 10, 80, "px/s"), ...motion(), scheme("site_inverse"), ...spacing(20, 20)],
  blocks: [{ type: "item", name: "Item", settings: [text("text", "Words", "Walk-ins welcome")] }],
  presetBlocks: ["Walk-ins until five", "Hot towel shaves", "Kids on weekdays", "Late on Thursdays"].map((t) => ({ type: "item", settings: { text: t } })),
  maxBlocks: 8,
})

export const chairs = defineSection({
  type: "ai_sb_chairs",
  name: "The chairs",
  summary: "Who cuts: a photograph of each barber or stylist that tilts toward the pointer (P3 3d-tilt), what they are best at and the days they work.",
  template: `
<section class="sbc" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="sbc__h">{{ settings.heading }}</h2>
  <ul class="sbc__list">
    {% for block in section.blocks %}<li class="sbc__item" data-block-id="{{ block.id }}"><span class="sbc__frame" data-storelib-motion="3d-tilt" data-motion-intensity="6">{% if block.settings.photo %}<img src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="900" height="1100">{% endif %}</span><h3 class="sbc__name">{{ block.settings.name }}</h3><p class="sbc__best">{{ block.settings.best }}</p><p class="sbc__days">{{ block.settings.days }}</p></li>{% endfor %}
  </ul>
</section>`,
  style: `
.sbc { ${BOX} }
.sbc__h { margin: 0 0 24px; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 4.5rem); letter-spacing: -0.025em; line-height: 0.95; }
.sbc__list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 14px; margin: 0; padding: 0; list-style: none; }
.sbc__item:nth-child(even) { margin-top: 36px; }
.sbc__frame { display: block; overflow: hidden; border: 2px solid var(--s-text); }
.sbc__frame img { display: block; width: 100%; height: auto; aspect-ratio: 9 / 11; object-fit: cover; }
.sbc__name { margin: 10px 0 0; ${D} font-size: 1.375rem; }
.sbc__best { margin: 2px 0 0; line-height: 1.4; }
.sbc__days { margin: 4px 0 0; ${SMALL} opacity: 0.75; }
@container (min-width: 900px) { .sbc__list { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; } }`,
  settings: [text("heading", "Heading", "The chairs"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "person", name: "Barber or stylist", settings: [text("name", "Name", "Callum"), text("best", "Best at", "Skin fades"), text("days", "Days", "Tue to Sat"), image("photo", "Photograph"), text("alt", "Photograph description", "")] }],
  presetBlocks: [
    { type: "person", settings: { name: "Callum", best: "Skin fades and sharp line ups", days: "Tuesday to Saturday", alt: "A barber with tattooed forearms holding clippers" } },
    { type: "person", settings: { name: "Nadia", best: "Long hair and colour", days: "Wednesday to Sunday", alt: "A stylist smiling with scissors in hand" } },
    { type: "person", settings: { name: "Ross", best: "Hot towel shaves", days: "Monday to Friday", alt: "A barber stropping a straight razor" } },
    { type: "person", settings: { name: "Mei", best: "Textured crops and kids", days: "Thursday to Monday", alt: "A barber cutting a child's hair, both laughing" } },
  ],
  maxBlocks: 8,
})

export const booking = defineSection({
  type: "ai_sb_booking",
  name: "Book online",
  summary: "Booking from the store's real service products (chosen, or the newest): each with its price and a Book button straight to its own checkout, plus the shop's booking rules.",
  template: `
<section class="sbk" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="sbk__grid">
    <div><h2 class="sbk__h">{{ settings.heading }}</h2><div class="sbk__intro">{{ settings.intro | raw }}</div><ul class="sbk__rules">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.rule }}</li>{% endfor %}</ul></div>
    <ul class="sbk__list">
      {% if settings.products.size > 0 %}
        {% for product in settings.products limit: 8 %}<li class="sbk__item"><a class="sbk__name" href="{{ product.settings.url | url }}">{{ product.settings.title }}</a><span class="sbk__price">{{ product.settings.price }}</span>{% if product.settings.checkout_url %}<a class="sbk__go" href="{{ product.settings.checkout_url | url }}">{{ settings.book_label }}</a>{% else %}<button class="sbk__go" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.book_label }}</button>{% endif %}</li>{% endfor %}
      {% else %}
        {% for product in products limit: 8 %}<li class="sbk__item"><a class="sbk__name" href="{{ product.settings.url | url }}">{{ product.settings.title }}</a><span class="sbk__price">{{ product.settings.price }}</span>{% if product.settings.checkout_url %}<a class="sbk__go" href="{{ product.settings.checkout_url | url }}">{{ settings.book_label }}</a>{% else %}<button class="sbk__go" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.book_label }}</button>{% endif %}</li>{% endfor %}
      {% endif %}
    </ul>
  </div>
</section>`,
  style: `
.sbk { ${BOX} }
.sbk__grid { display: grid; gap: 28px; }
.sbk__h { margin: 0; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 4.5rem); letter-spacing: -0.025em; line-height: 0.95; }
.sbk__intro { max-width: 42ch; margin-top: 14px; line-height: 1.55; }
.sbk__intro p { margin: 0; }
.sbk__rules { display: grid; gap: 6px; margin: 18px 0 0; padding: 0 0 0 1.1em; ${SMALL} }
.sbk__list { margin: 0; padding: 0; list-style: none; border-top: 2px solid var(--s-text); }
.sbk__item { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto; gap: 4px 14px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.sbk__name { ${D} font-size: 1.375rem; color: inherit; text-decoration: none; }
.sbk__price { grid-column: 1; font-variant-numeric: tabular-nums; }
.sbk__go { grid-column: 2; grid-row: 1 / span 2; display: inline-flex; align-items: center; min-height: 50px; padding: 0 22px; border: 0; background: var(--s-accent); color: var(--s-text); font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; box-shadow: 0 2px 0 var(--s-text); }
.sbk__go:active { transform: translateY(2px); box-shadow: none; }
@container (min-width: 900px) { .sbk__grid { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 56px; } }`,
  settings: [
    text("heading", "Heading", "Book online"),
    richtext("intro", "Intro", "<p>Pick a service, pick a time at checkout, done. You get a text the evening before.</p>"),
    productList("products", "Services (empty shows the newest)"),
    text("book_label", "Book button", "Book"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "rule", name: "Booking rule", settings: [text("rule", "Rule", "Free to move up to 24 hours before")] }],
  presetBlocks: ["Free to move up to 24 hours before", "Ten minutes late and we may need to rebook", "Paying in the shop is fine too"].map((rule) => ({ type: "rule", settings: { rule } })),
  maxBlocks: 6,
})

export const cuts = defineSection({
  type: "ai_sb_cuts",
  name: "Recent cuts",
  summary: "Recent work moving sideways while the section is pinned (P3 pin-horizontal), each with the cut's name and who did it; a swipe row with snap points on phones.",
  template: `
<section class="sbg" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="sbg__h">{{ settings.heading }}</h2>
  <div class="sbg__pin" data-storelib-motion="pin-horizontal" data-motion-speed="1" data-motion-mobile="swipe"><div class="sbg__stage" data-motion-stage><ul class="sbg__rail" data-motion-track tabindex="0" aria-label="{{ settings.heading }}">
    {% for block in section.blocks %}<li class="sbg__item" data-block-id="{{ block.id }}">{% if block.settings.photo %}<img src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="900" height="1125">{% endif %}<p class="sbg__cap"><span>{{ block.settings.cut }}</span> {{ block.settings.by }}</p></li>{% endfor %}
  </ul></div></div>
</section>`,
  style: `
.sbg { ${BOX} overflow: hidden; }
.sbg__h { margin: 0 0 22px; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 4.5rem); letter-spacing: -0.025em; line-height: 0.95; }
.sbg__rail { display: flex; gap: 12px; margin: 0; padding: 0 0 12px; list-style: none; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; }
.sbg__item { flex: none; width: 72cqi; scroll-snap-align: start; }
.sbg__item img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; }
.sbg__cap { margin: 8px 0 0; ${SMALL} }
.sbg__cap span { ${D} font-size: 1.0625rem; }
@container (min-width: 900px) { .sbg__item { width: 27cqi; } }
@media (prefers-reduced-motion: reduce) { .sbg__rail { scroll-snap-type: none; } }`,
  settings: [text("heading", "Heading", "This week in the chair"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "cut", name: "Cut", settings: [image("photo", "Photograph"), text("alt", "Photograph description", ""), text("cut", "Cut", "Mid fade"), text("by", "By", "by Callum")] }],
  presetBlocks: [
    { type: "cut", settings: { cut: "Mid fade, textured top", by: "by Callum", alt: "Side view of a fresh mid fade with a textured top" } },
    { type: "cut", settings: { cut: "Long layers", by: "by Nadia", alt: "Long wavy hair with soft layers from behind" } },
    { type: "cut", settings: { cut: "Full beard shape", by: "by Ross", alt: "A neatly shaped full beard in profile" } },
    { type: "cut", settings: { cut: "Crop and line up", by: "by Mei", alt: "A short textured crop with a sharp line up" } },
    { type: "cut", settings: { cut: "Grey blend", by: "by Nadia", alt: "Short hair with natural looking blended grey" } },
  ],
  maxBlocks: 12,
})

export const visit = defineSection({
  type: "ai_sb_visit",
  name: "Hours and finding us",
  summary: "Opening hours as a table with today marked by the creator's order, the address with a directions link, the phone, and a photograph of the shop front.",
  template: `
<section class="sbv" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="sbv__grid">
    <div>
      <h2 class="sbv__h">{{ settings.heading }}</h2>
      <table class="sbv__hours"><caption class="sbv__cap">{{ settings.hours_caption }}</caption><tbody>{% for block in section.blocks %}<tr data-block-id="{{ block.id }}"><th scope="row">{{ block.settings.day }}</th><td>{{ block.settings.hours }}</td></tr>{% endfor %}</tbody></table>
      <p class="sbv__addr">{{ settings.address }}</p>
      <p class="sbv__links"><a href="{{ settings.map_url | url }}">{{ settings.map_label }}</a><a href="{{ settings.phone_url | url }}">{{ settings.phone }}</a></p>
    </div>
    {% if settings.photo %}<span class="pdw" style="display: block; overflow: hidden;" data-storelib-motion="parallax-depth" data-motion-intensity="30" data-motion-pointer="false"><img class="sbv__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1400" height="1050" data-motion-depth="0.1"></span>{% endif %}
  </div>
</section>`,
  style: `
.sbv { ${BOX} }
.sbv__grid { display: grid; gap: 28px; }
.sbv__h { margin: 0 0 18px; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 4.5rem); letter-spacing: -0.025em; line-height: 0.95; }
.sbv__hours { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.sbv__cap { text-align: left; padding-bottom: 8px; ${SMALL} }
.sbv__hours th, .sbv__hours td { padding: 10px 0; border-bottom: 1px solid var(--s-border); text-align: left; }
.sbv__hours th { font-weight: 600; }
.sbv__hours td { text-align: right; }
.sbv__addr { margin: 20px 0 6px; ${D} font-size: 1.375rem; }
.sbv__links { display: flex; flex-wrap: wrap; gap: 4px 22px; margin: 0; }
.sbv__links a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; font-weight: 600; }
.sbv__img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border: 2px solid var(--s-text); }
@container (min-width: 900px) { .sbv__grid { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: center; gap: 64px; } }`,
  settings: [
    text("heading", "Heading", "Hours and finding us"),
    text("hours_caption", "Line above the hours", "Last booking 30 minutes before close"),
    text("address", "Address", "41 Mill Lane, Leith, Edinburgh EH6 6TJ"),
    text("map_label", "Directions link", "Directions"),
    url("map_url", "Directions go to", "https://maps.google.com/?q=41+Mill+Lane+Leith"),
    text("phone", "Phone", "0131 555 0142"),
    url("phone_url", "Phone link", "tel:+441315550142"),
    image("photo", "Shop front photograph"),
    text("photo_alt", "Photograph description", "The shop front on a cobbled lane with a striped pole and green door"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "day", name: "Day", settings: [text("day", "Day", "Monday"), text("hours", "Hours", "9:00 to 18:00")] }],
  presetBlocks: [
    { type: "day", settings: { day: "Monday", hours: "9:00 to 18:00" } },
    { type: "day", settings: { day: "Tuesday", hours: "9:00 to 18:00" } },
    { type: "day", settings: { day: "Wednesday", hours: "9:00 to 18:00" } },
    { type: "day", settings: { day: "Thursday", hours: "9:00 to 20:00" } },
    { type: "day", settings: { day: "Friday", hours: "9:00 to 19:00" } },
    { type: "day", settings: { day: "Saturday", hours: "8:30 to 17:00" } },
    { type: "day", settings: { day: "Sunday", hours: "11:00 to 16:00" } },
  ],
  maxBlocks: 7,
})

export const visitSteps = defineSection({
  type: "ai_sb_expect",
  name: "Your visit",
  summary: "What happens when you come in, in four short steps that rise in one after another (P3 reveal-stagger).",
  template: `
<section class="sbe" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="sbe__h">{{ settings.heading }}</h2>
  <ol class="sbe__list" data-storelib-motion="reveal-stagger">{% for block in section.blocks %}<li class="sbe__step" data-block-id="{{ block.id }}"><span class="sbe__n">{{ forloop.index }}</span><h3 class="sbe__t">{{ block.settings.title }}</h3><p class="sbe__x">{{ block.settings.text }}</p></li>{% endfor %}</ol>
</section>`,
  style: `
.sbe { ${BOX} }
.sbe__h { margin: 0 0 24px; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 4.5rem); letter-spacing: -0.025em; line-height: 0.95; }
.sbe__list { display: grid; gap: 18px; margin: 0; padding: 0; list-style: none; }
.sbe__step { display: grid; grid-template-columns: 3rem minmax(0, 1fr); gap: 2px 12px; }
.sbe__n { grid-row: span 2; display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border: 2px solid var(--s-heading); border-radius: 50%; ${D} }
.sbe__t { margin: 0; ${D} font-size: 1.375rem; }
.sbe__x { margin: 0; line-height: 1.55; }
@container (min-width: 900px) { .sbe__list { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; } .sbe__step { grid-template-columns: 1fr; } .sbe__n { grid-row: auto; } }
${revealCss("sbe", ".sbe__step", "sbe-rise")}`,
  settings: [text("heading", "Heading", "Your visit"), ...motion(), scheme("site_inverse"), ...spacing(96, 96)],
  blocks: [{ type: "step", name: "Step", settings: [text("title", "Step", "Coffee first"), textarea("text", "What happens", "")] }],
  presetBlocks: [
    { type: "step", settings: { title: "Coffee first", text: "Grab a coffee or a glass of water while we finish up." } },
    { type: "step", settings: { title: "Two minutes of talk", text: "Show a picture or describe it. We say honestly what will work." } },
    { type: "step", settings: { title: "The cut", text: "Forty minutes, no rush, phone face down if you like." } },
    { type: "step", settings: { title: "Hot towel and out", text: "A warm towel, a look in the mirror, pay by card or cash." } },
  ],
  maxBlocks: 4,
})

export const faq = defineSection({
  type: "ai_sb_faq",
  name: "Questions",
  summary: "Questions people ring about, as native disclosures.",
  template: `
<section class="sbf" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="sbf__grid">
    <h2 class="sbf__h">{{ settings.heading }}</h2>
    <div class="sbf__list">{% for block in section.blocks %}<details class="sbf__item" data-block-id="{{ block.id }}"><summary class="sbf__q">{{ block.settings.question }}</summary><div class="sbf__a">{{ block.settings.answer | raw }}</div></details>{% endfor %}</div>
  </div>
</section>`,
  style: `
.sbf { ${BOX} }
.sbf__grid { display: grid; gap: 24px; }
.sbf__h { margin: 0; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 4.5rem); letter-spacing: -0.025em; line-height: 0.95; }
.sbf__list { border-top: 2px solid var(--s-text); }
.sbf__item { border-bottom: 1px solid var(--s-border); }
.sbf__q { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 60px; cursor: pointer; ${D} font-size: 1.1875rem; list-style: none; }
.sbf__q::-webkit-details-marker { display: none; }
.sbf__q::after { content: "+"; color: var(--s-accent); font-size: 1.5rem; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.sbf__item[open] .sbf__q::after { transform: rotate(45deg); }
.sbf__a { max-width: 60ch; padding-bottom: 16px; line-height: 1.6; }
.sbf__a p { margin: 0; }
@container (min-width: 900px) { .sbf__grid { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); } }
@media (prefers-reduced-motion: reduce) { .sbf__q::after { transition: none; } }`,
  settings: [text("heading", "Heading", "Questions"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "question", name: "Question", settings: [text("question", "Question", "Do you take walk-ins?"), richtext("answer", "Answer", "<p>Yes, until five.</p>")] }],
  presetBlocks: [
    { type: "question", settings: { question: "Do you take walk-ins?", answer: "<p>Yes, every day until five. Saturdays get busy, so booking is safer.</p>" } },
    { type: "question", settings: { question: "Do you cut children's hair?", answer: "<p>Yes, on weekdays at half price for under 12s. Mei is the one to ask for.</p>" } },
    { type: "question", settings: { question: "Can I change my booking?", answer: "<p>Move it from the link in your confirmation up to 24 hours before, free.</p>" } },
    { type: "question", settings: { question: "Is there parking?", answer: "<p>Two hour street parking on Mill Lane, free after six and on Sundays.</p>" } },
  ],
  maxBlocks: 12,
})

export const callBand = defineSection({
  type: "ai_sb_call",
  name: "Chair free?",
  summary: "The last ask on the dark band: one line, Book and Call side by side, and the address.",
  template: `
<section class="sbz" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="sbz__h">{{ settings.heading }}</h2>
  <div class="sbz__actions"><a class="sbz__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a><a class="sbz__call" href="{{ settings.phone_url | url }}">{{ settings.phone_label }}</a></div>
  <ul class="sbz__facts">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.fact }}</li>{% endfor %}</ul>
</section>`,
  style: `
.sbz { ${BOX} display: grid; justify-items: start; gap: 22px; }
.sbz__h { margin: 0; ${D} font-size: clamp(2.5rem, 1.2rem + 6cqi, 6.5rem); letter-spacing: -0.03em; line-height: 0.92; max-width: 14ch; }
.sbz__actions { display: flex; flex-wrap: wrap; gap: 12px; }
.sbz__btn, .sbz__call { display: inline-flex; align-items: center; min-height: 58px; padding: 0 28px; ${D} font-size: 1.25rem; text-decoration: none; }
.sbz__btn { background: var(--s-accent); color: var(--s-bg); }
.sbz__call { border: 2px solid currentColor; color: inherit; }
.sbz__facts { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 0; padding: 0; list-style: none; ${SMALL} }
${revealCss("sbz", ".sbz__h", "sbz-rise")}`,
  settings: [
    text("heading", "Heading", "Chair free this afternoon?"),
    text("cta_label", "Book button", "Book a chair"),
    url("cta_url", "Book goes to", "/products"),
    text("phone_label", "Call button", "Call the shop"),
    url("phone_url", "Call link", "tel:+441315550142"),
    ...motion(),
    scheme("site_inverse"),
    ...spacing(120, 140),
  ],
  blocks: [{ type: "fact", name: "Fact", settings: [text("fact", "Fact", "41 Mill Lane, Leith")] }],
  presetBlocks: ["41 Mill Lane, Leith", "Walk-ins until five", "Late on Thursdays"].map((fact) => ({ type: "fact", settings: { fact } })),
  maxBlocks: 4,
})

export const footer = defineSection({
  type: "ai_sb_footer",
  name: "Footer",
  kind: "footer",
  summary: "Local footer: hours and address first, the footer menu, a newsletter line, language and currency, space at the bottom for the phone's Book button.",
  template: `
<footer class="sbo" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <div class="sbo__grid">
    <div><p class="sbo__name">{{ shop.name | default: settings.brand }}</p><p class="sbo__v">{{ settings.address }}</p><p class="sbo__v">{{ settings.hours }}</p></div>
    <nav class="sbo__nav" aria-label="{{ settings.nav_label }}">{% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}</nav>
    <form class="sbo__form" data-storelib-form="subscribe"><label for="sbo-e-{{ section.id }}">{{ settings.newsletter_label }}</label><div class="sbo__row"><input id="sbo-e-{{ section.id }}" type="email" name="email" autocomplete="email" required placeholder="{{ settings.email_placeholder }}"><button type="submit">{{ settings.button_label }}</button></div></form>
  </div>
  <div class="sbo__base"><ul class="sbo__links">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><a href="{{ block.settings.url | url }}">{{ block.settings.label }}</a></li>{% endfor %}</ul>
    ${prefs("sbo")}<p class="sbo__small">{{ settings.small_print }}</p></div>
</footer>`,
  style: `
.sbo__links { display: flex; flex-wrap: wrap; gap: 0 18px; margin: 0; padding: 0; list-style: none; }
.sbo__links a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; }
.sbo { padding: 56px var(--theme-padding-x, 20px) calc(96px + env(safe-area-inset-bottom)); background: var(--s-bg); color: var(--s-text); border-top: 2px solid var(--s-text); container-type: inline-size; }
.sbo__grid { display: grid; gap: 28px; }
.sbo__name { margin: 0 0 8px; font-family: var(--theme-font-heading), serif; color: var(--s-heading); font-weight: 700; font-size: 2rem; }
.sbo__v { margin: 0 0 4px; line-height: 1.5; }
.sbo__nav { display: grid; align-content: start; }
.sbo__nav a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; font-weight: 600; text-decoration: none; }
.sbo__nav a:hover { text-decoration: underline; }
.sbo__form label { display: block; margin-bottom: 8px; font-weight: 600; }
.sbo__row { display: flex; flex-wrap: wrap; gap: 8px; }
.sbo__row input { flex: 1 1 200px; min-width: 0; min-height: 50px; padding: 0 12px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; }
.sbo__row button { min-height: 50px; padding: 0 20px; border: 0; background: var(--s-text); color: var(--s-bg); font: inherit; font-weight: 700; cursor: pointer; }
.sbo__base { display: grid; gap: 14px; margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--s-border); }
.sbo__small { margin: 0; font-size: 0.8125rem; opacity: 0.75; }
${panelCss("sbo")}
@container (min-width: 900px) { .sbo { padding-bottom: 28px; } .sbo__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 0.6fr) minmax(0, 1fr); } .sbo__base { grid-template-columns: minmax(0, 1fr) auto; align-items: center; } }`,
  settings: [
    menu("menu", "Footer menu", "footer"),
    text("brand", "Name when there is no shop name", "Sable"),
    text("address", "Address", "41 Mill Lane, Leith, Edinburgh EH6 6TJ"),
    text("hours", "Hours", "Mon to Sat 9 to 6, Thu until 8, Sun 11 to 4"),
    text("newsletter_label", "Newsletter line", "Late openings and new chairs, once a month"),
    text("email_placeholder", "Email hint", "Email"),
    text("button_label", "Subscribe button", "Sign up"),
    text("small_print", "Small print", "Sable Barbers Ltd, Leith."),
    text("nav_label", "Menu name (read aloud)", "Footer"),
    text("language_label", "Language", "Language"),
    text("currency_label", "Currency", "Currency"),
    scheme("site"),
  ],
  blocks: [{ type: "link", name: "Link", settings: [text("label", "Label", "Instagram"), url("url", "Goes to", "https://www.instagram.com/")] }],
  presetBlocks: [
    { type: "link", settings: { label: "Instagram", url: "https://www.instagram.com/" } },
    { type: "link", settings: { label: "Directions", url: "https://maps.google.com/?q=41+Mill+Lane+Leith" } },
  ],
  maxBlocks: 6,
})

export const product = defineSection({
  type: "ai_sb_product",
  name: "Service or product",
  summary: "A service or a product from the shop: picture, name, price, Book or add to basket, options, offers, description, and what to know before you come.",
  template: `
<section class="sbpd" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="sbpd__grid">
    <div class="sbpd__media">{% for img in product.images limit: 3 %}<img src="{{ img }}" alt="{{ product.title }}" width="1200" height="1200">{% endfor %}</div>
    <div class="sbpd__info">
      <h1 class="sbpd__title">{{ product.title }}</h1>
      <p class="sbpd__price">{{ product.price }}</p>
      {% if page.product.settings.variants.size > 0 %}<div class="sbpd__opts" role="group" aria-label="{{ settings.options_label }}">{% for v in page.product.settings.variants %}<button class="sbpd__opt" type="button" data-storelib-add-to-cart="{{ product.id }}" data-variant-id="{{ v.id }}" data-title="{{ product.title }}" data-price="{{ v.price }}">{{ v.name }} <span>{{ v.price }}</span></button>{% endfor %}</div>{% else %}<button class="sbpd__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.title }}" data-price="{{ product.price }}" data-url="{{ product.url }}">{{ settings.add_label }}</button>{% endif %}
      <div data-storelib-island data-storelib-offers="{{ product.id }}" data-title="{{ product.title }}" data-url="{{ product.url }}" data-layout="open"></div>
      {% if product.description_html %}<div class="sbpd__desc">{{ product.description_html | raw }}</div>{% endif %}
      <ul class="sbpd__know">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.line }}</li>{% endfor %}</ul>
    </div>
  </div>
</section>`,
  style: `
.sbpd { ${BOX} }
.sbpd__grid { display: grid; gap: 28px; }
.sbpd__media { display: grid; gap: 10px; }
.sbpd__media img { width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; border: 2px solid var(--s-text); }
.sbpd__title { margin: 0; ${D} font-size: clamp(2.25rem, 1.3rem + 4cqi, 4.5rem); letter-spacing: -0.03em; line-height: 0.95; }
.sbpd__price { margin: 12px 0 20px; ${D} font-size: 1.5rem; }
.sbpd__opts { display: grid; gap: 8px; }
.sbpd__opt, .sbpd__add { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 56px; padding: 0 20px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
.sbpd__add { justify-content: center; background: var(--s-accent); box-shadow: 0 3px 0 var(--s-text); }
.sbpd__desc { margin-top: 20px; line-height: 1.6; max-width: 56ch; }
.sbpd__know { display: grid; gap: 8px; margin: 22px 0 0; padding: 16px 0 0 1.1em; border-top: 2px solid var(--s-text); }
@container (min-width: 900px) { .sbpd__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 56px; } }`,
  settings: [text("add_label", "Book or add button", "Book"), text("options_label", "Options (read aloud)", "Choose an option"), ...motion(), scheme("site"), ...spacing(48, 96)],
  blocks: [{ type: "know", name: "Good to know", settings: [text("line", "Line", "Come with dry hair")] }],
  presetBlocks: ["Arrive five minutes early", "Free to move up to 24 hours before", "Card or cash in the shop"].map((line) => ({ type: "know", settings: { line } })),
  maxBlocks: 6,
})

export const collection = defineSection({
  type: "ai_sb_collection",
  name: "Collection",
  summary: "A collection (services, or products on the shelf) from the store's real products, with price and Book or add to basket.",
  template: `
<section class="sbl" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h1 class="sbl__h">{% if collection.title %}{{ collection.title }}{% else %}{{ settings.heading }}{% endif %}</h1>
  {% if collection.description %}<p class="sbl__intro">{{ collection.description }}</p>{% endif %}
  {% if page.query %}<p class="sbl__intro">{{ settings.query_label }} {{ page.query }}</p>{% endif %}
  <ul class="sbl__list">{% for product in products %}<li class="sbl__item"><a class="sbl__link" href="{{ product.settings.url | url }}">{% if product.settings.image %}<img src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="800" height="800">{% endif %}<span class="sbl__name">{{ product.settings.title }}</span><span class="sbl__price">{{ product.settings.price }}</span></a><button class="sbl__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button></li>{% endfor %}</ul>
  <ul class="sbl__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.note }}</li>{% endfor %}</ul>
</section>`,
  style: `
.sbl { ${BOX} }
.sbl__h { margin: 0; ${D} font-size: clamp(2.5rem, 1.3rem + 5cqi, 5.5rem); letter-spacing: -0.03em; line-height: 0.92; }
.sbl__intro { max-width: 52ch; margin: 14px 0 0; line-height: 1.55; }
.sbl__list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 12px; margin: 32px 0 0; padding: 0; list-style: none; }
.sbl__link { display: grid; gap: 6px; color: inherit; text-decoration: none; }
.sbl__link img { width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; border: 2px solid var(--s-text); }
.sbl__name { ${D} font-size: 1.1875rem; }
.sbl__add { margin-top: 8px; min-height: 46px; padding: 0 14px; border: 0; background: var(--s-accent); color: var(--s-text); font: inherit; font-weight: 700; cursor: pointer; }
.sbl__notes { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 32px 0 0; padding: 14px 0 0; border-top: 2px solid var(--s-text); list-style: none; ${SMALL} }
@container (min-width: 900px) { .sbl__list { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 32px 20px; } }`,
  settings: [text("heading", "Heading when there is no collection", "Services and shelf"), text("query_label", "Before the search words", "Results for"), text("add_label", "Add button", "Book"), ...motion(), scheme("site"), ...spacing(48, 96)],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Collect in the shop")] }],
  presetBlocks: ["Products can be collected in the shop", "Bookings move free up to 24 hours before"].map((note) => ({ type: "note", settings: { note } })),
  maxBlocks: 4,
})

export const about = defineSection({
  type: "ai_sb_about",
  name: "About the shop",
  summary: "The shop's story with a photograph of the room, then what the shop stands by, in a ruled list.",
  template: `
<section class="sba" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="sba__grid">
    <div><h1 class="sba__h">{{ settings.heading }}</h1><div class="sba__story">{{ settings.story | raw }}</div></div>
    {% if settings.photo %}<span class="pdw" style="display: block; overflow: hidden;" data-storelib-motion="parallax-depth" data-motion-intensity="30" data-motion-pointer="false"><img class="sba__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1400" height="1050" data-motion-depth="0.1"></span>{% endif %}
  </div>
  <ul class="sba__list">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><h2 class="sba__t">{{ block.settings.title }}</h2><p>{{ block.settings.text }}</p></li>{% endfor %}</ul>
</section>`,
  style: `
.sba { ${BOX} }
.sba__grid { display: grid; gap: 28px; }
.sba__h { margin: 0; ${D} font-size: clamp(2.5rem, 1.3rem + 5cqi, 5.5rem); letter-spacing: -0.03em; line-height: 0.92; max-width: 14ch; }
.sba__story { margin-top: 16px; max-width: 54ch; line-height: 1.65; font-size: 1.0625rem; }
.sba__img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border: 2px solid var(--s-text); }
.sba__list { display: grid; margin: 48px 0 0; padding: 0; list-style: none; border-top: 2px solid var(--s-text); }
.sba__list li { display: grid; gap: 4px; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.sba__t { margin: 0; ${D} font-size: 1.5rem; }
.sba__list p { margin: 0; max-width: 56ch; line-height: 1.55; }
@container (min-width: 900px) { .sba__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 56px; } .sba__list li { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); } }
${revealCss("sba", ".sba__list li", "sba-rise")}`,
  settings: [
    text("heading", "Heading", "Four chairs on Mill Lane"),
    richtext("story", "Story", "<p>Callum opened Sable in an old ironmonger's in 2016 with one chair and a borrowed mirror. There are four chairs now, the same mirror, and most of the first customers still come in.</p>"),
    image("photo", "Photograph"),
    text("photo_alt", "Photograph description", "Inside the shop: four leather chairs, a long mirror and green tiles"),
    ...motion(),
    scheme("site"),
    ...spacing(48, 96),
  ],
  blocks: [{ type: "value", name: "What we stand by", settings: [text("title", "Title", "Honest advice"), textarea("text", "What it means", "")] }],
  presetBlocks: [
    { type: "value", settings: { title: "Honest advice", text: "If a cut will not work with your hair, we say so before we start." } },
    { type: "value", settings: { title: "On time", text: "Your booking starts when it says. If we run late, you pay less." } },
    { type: "value", settings: { title: "Everyone welcome", text: "Any hair, any age, any style. Ask for what you want." } },
  ],
  maxBlocks: 6,
})

export const contact = defineSection({
  type: "ai_sb_contact",
  name: "Contact",
  summary: "Contact page: phone first, the address with directions, and a message form for anything that is not a booking.",
  template: `
<section class="sbx" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="sbx__grid">
    <div><h1 class="sbx__h">{{ settings.heading }}</h1><div class="sbx__text">{{ settings.text | raw }}</div><ul class="sbx__ways">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><span>{{ block.settings.label }}</span>{% if block.settings.link %}<a href="{{ block.settings.link | url }}">{{ block.settings.value }}</a>{% else %}{{ block.settings.value }}{% endif %}</li>{% endfor %}</ul></div>
    <form class="sbx__form" data-storelib-form="contact">
      <label><span>{{ settings.name_label }}</span><input name="name" type="text" autocomplete="name" maxlength="120" required></label>
      <label><span>{{ settings.email_label }}</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <label><span>{{ settings.message_label }}</span><textarea name="message" rows="5" maxlength="5000" required></textarea></label>
      <button type="submit">{{ settings.send_label }}</button>
    </form>
  </div>
</section>`,
  style: `
.sbx { ${BOX} }
.sbx__grid { display: grid; gap: 36px; }
.sbx__h { margin: 0; ${D} font-size: clamp(2.5rem, 1.3rem + 5cqi, 5.5rem); letter-spacing: -0.03em; line-height: 0.92; }
.sbx__text { max-width: 44ch; margin-top: 14px; line-height: 1.6; }
.sbx__ways { margin: 22px 0 0; padding: 0; list-style: none; border-top: 2px solid var(--s-text); }
.sbx__ways li { display: grid; gap: 2px; padding: 12px 0; border-bottom: 1px solid var(--s-border); }
.sbx__ways span { ${SMALL} opacity: 0.75; }
.sbx__ways a { ${D} font-size: 1.375rem; color: inherit; }
.sbx__form { display: grid; gap: 14px; align-content: start; }
.sbx__form label { display: grid; gap: 6px; font-weight: 600; }
.sbx__form input, .sbx__form textarea { min-height: 52px; padding: 10px 12px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; font-weight: 400; }
.sbx__form button { justify-self: start; min-height: 54px; padding: 0 26px; border: 0; background: var(--s-text); color: var(--s-bg); font: inherit; font-weight: 700; cursor: pointer; }
@container (min-width: 900px) { .sbx__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 64px; } }`,
  settings: [
    text("heading", "Heading", "Ring, call in or write"),
    richtext("text", "Words", "<p>For bookings the quickest way is online or a phone call. For anything else, write and we answer the same day.</p>"),
    text("name_label", "Name field", "Name"),
    text("email_label", "Email field", "Email"),
    text("message_label", "Message field", "Message"),
    text("send_label", "Send button", "Send"),
    ...motion(),
    scheme("site"),
    ...spacing(48, 96),
  ],
  blocks: [{ type: "way", name: "Way to reach", settings: [text("label", "Label", "Phone"), text("value", "Shown as", "0131 555 0142"), url("link", "Link", "tel:+441315550142")] }],
  presetBlocks: [
    { type: "way", settings: { label: "Phone", value: "0131 555 0142", link: "tel:+441315550142" } },
    { type: "way", settings: { label: "Address", value: "41 Mill Lane, Leith", link: "https://maps.google.com/?q=41+Mill+Lane+Leith" } },
    { type: "way", settings: { label: "Email", value: "chairs@sable.shop", link: "mailto:chairs@sable.shop" } },
  ],
  maxBlocks: 5,
})

export const ALL = [header, hero, prices, ticker, chairs, booking, cuts, visit, visitSteps, faq, callBand, footer, product, collection, about, contact]
