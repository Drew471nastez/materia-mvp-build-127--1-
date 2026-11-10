/**
 * DIAL IN: a coffee shop, bakery or small restaurant.
 *
 * Bottle green ground and a yolk yellow accent, a characterful grotesk set
 * big and friendly, photo cards scattered like a pin board in the first
 * screen with a round "open from" sticker, the menu as a board with dotted
 * leaders, beans to take home from the shop, the room in a collage, hours
 * and the address set large. Original work for Storelib (round P, P2a).
 */
import { assemble } from "../kit/build"
import { footer, header } from "../kit/chrome"
import { BOX, DISPLAY, INNER, motion, place, rootAttrs, s, spacing, type ComponentDef } from "../kit/schema"
import { collage, collectionGrid, contact, cta, faq, marquee, pageIntro, productMain, productRail, reveal, statement, stickySteps } from "../kit/sections"
import type { SiteTemplate } from "../types"

const P = "ai_cf_"
const ROUND = `.cl__fig, .pr__card-media, .pr__tile-link, .cg__card-media, .pd__shot, .pd__stand, .pi__media { border-radius: 18px; } .cc__btn, .pr__card-add, .ct__send, .pd__add, .pd__buy, .cg__card-add { border-radius: 999px; }`

const hero: ComponentDef = {
  type: `${P}hero`,
  name: "Opening, a pin board of photos",
  category: "hero",
  template: `
<section class="ch" ${rootAttrs({ motion: true })}>
  <div class="ch__in">
    <div class="ch__words">
      <h1 class="ch__h">{{ settings.heading | raw }}</h1>
      <div class="ch__text">{{ settings.text | raw }}</div>
      <div class="ch__actions">
        <a class="ch__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
        {% if settings.cta2_label %}<a class="ch__btn ch__btn--line" href="{{ settings.cta2_url | url }}">{{ settings.cta2_label }}</a>{% endif %}
      </div>
    </div>
    <ul class="ch__board" data-storelib-motion="3d-tilt">
      {% for block in section.blocks %}
      <li class="ch__card ch__card--{{ forloop.index }}" style="--tilt: {{ block.settings.tilt }}deg;" {{ block.shopify_attributes }}>
        <figure class="ch__fig">
          {% if block.settings.image %}<img src="{{ block.settings.image | asset }}" alt="{{ block.settings.image_alt }}" width="800" height="1000" {% if forloop.first %}fetchpriority="high"{% else %}loading="lazy"{% endif %}>{% else %}<span class="ch__stand" aria-hidden="true">{{ block.settings.caption }}</span>{% endif %}
          <figcaption class="ch__cap">{{ block.settings.caption }}</figcaption>
        </figure>
      </li>
      {% endfor %}
    </ul>
    {% if settings.sticker %}<p class="ch__sticker" data-storelib-motion="marquee">{{ settings.sticker }}</p>{% endif %}
  </div>
</section>`,
  style: `
.ch { ${BOX} overflow: hidden; }
.ch__in { position: relative; display: grid; gap: clamp(32px, 6vw, 72px); ${INNER} }
.ch__h { margin: 0; ${DISPLAY} font-size: clamp(3.25rem, 1.4rem + 10cqi, 10rem); line-height: 0.86; letter-spacing: -0.045em; font-weight: 800; }
.ch__h em { font-style: normal; color: var(--s-accent); }
.ch__text { max-width: 30rem; margin-top: 20px; font-size: 1.1875rem; line-height: 1.5; }
.ch__text p { margin: 0; }
.ch__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
.ch__btn { display: inline-flex; align-items: center; min-height: 54px; padding: 0 26px; border: 2px solid var(--s-btn); border-radius: 999px; background: var(--s-btn); color: var(--s-btn-text); font-weight: 700; text-decoration: none; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.ch__btn--line { background: none; color: var(--s-text); border-color: currentColor; }
@media (hover: hover) and (pointer: fine) { .ch__btn:hover { transform: rotate(-2deg) translateY(calc(-1 * var(--t-motion-lift, 3px))); } }
.ch__board { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); margin: 0; padding: 0 0 24px; list-style: none; }
.ch__card { position: relative; transform: rotate(var(--tilt, 0deg)); transition: transform var(--t-motion-duration, 450ms) var(--t-motion-ease, ease); }
.ch__card { width: 64%; }
.ch__card--1 { justify-self: start; z-index: 1; }
.ch__card--2 { justify-self: end; z-index: 2; margin-top: -42%; }
.ch__card--3 { justify-self: start; z-index: 3; width: 54%; margin: -30% 0 0 14%; }
.ch__fig { margin: 0; padding: 10px 10px 14px; background: var(--s-text); color: var(--s-bg); border-radius: 6px; box-shadow: 0 18px 40px rgb(0 0 0 / 0.28); }
.ch__fig img, .ch__stand { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 3px; }
.ch__stand { display: flex; align-items: flex-end; padding: 16px; background: var(--s-accent); ${DISPLAY} color: var(--s-bg); font-size: clamp(1.25rem, 5cqi, 2.5rem); line-height: 1; }
.ch__cap { margin-top: 10px; font-weight: 700; font-size: 0.9375rem; }
.ch__sticker { position: absolute; right: 2%; top: 46%; z-index: 4; display: grid; place-items: center; width: clamp(96px, 22cqi, 160px); aspect-ratio: 1; margin: 0; padding: 14px; border-radius: 50%; background: var(--s-accent); color: var(--s-bg); font-weight: 800; font-size: clamp(0.875rem, 2.6cqi, 1.125rem); line-height: 1.1; transform: rotate(12deg); }
@container (min-width: 960px) {
  .ch__in { grid-template-columns: minmax(0, 6fr) minmax(0, 5fr); align-items: center; }
  .ch__sticker { right: 40%; top: auto; bottom: 4%; }
}
@media (hover: hover) and (pointer: fine) { .ch__card:hover { transform: rotate(0deg) translateY(calc(-1 * var(--t-motion-lift, 4px) * 2)); z-index: 5; } }
@media (prefers-reduced-motion: no-preference) {
  .ch:not([data-motion="off"]) .ch__card { animation: ai_cf_hero_drop var(--t-motion-duration, 650ms) var(--t-motion-ease, cubic-bezier(0.2, 0.7, 0.1, 1)) both; }
  .ch:not([data-motion="off"]) .ch__card--2 { animation-delay: calc(var(--t-motion-stagger, 65ms) * 2); }
  .ch:not([data-motion="off"]) .ch__card--3 { animation-delay: calc(var(--t-motion-stagger, 65ms) * 4); }
  @keyframes ai_cf_hero_drop { from { opacity: 0; transform: translateY(calc(var(--t-motion-distance, 24px) * 2 * var(--m-k, 1))) rotate(0deg); } }
}
@media (prefers-reduced-motion: reduce) { .ch__card { transition: none; } }`,
  settings: [
    s.inline("heading", "Heading", "Good coffee, <em>early</em>, on the corner"),
    s.rich("text", "Text", "<p>Espresso and filter from beans we pick by the season, pastries out of the oven by seven, and a long table by the window.</p>"),
    s.text("cta_label", "Button", "See the menu"),
    s.url("cta_url", "Button link", "/#menu"),
    s.text("cta2_label", "Second button", "Find us"),
    s.url("cta2_url", "Second button link", "/contact"),
    s.text("sticker", "Round sticker", "Open from seven"),
    s.scheme("site"),
    ...motion(),
    ...spacing(72, 96),
  ],
  blocks: [{ type: "card", name: "Photo card", limit: 3, settings: [s.image("image", "Photo"), s.text("image_alt", "Photo description", ""), s.text("caption", "Caption", "Flat white"), s.range("tilt", "Tilt", -12, 12, 1, "deg", -4)] }],
  maxBlocks: 3,
  preset: [
    { type: "card", settings: { image: "", image_alt: "", caption: "The first pour", tilt: -5 } },
    { type: "card", settings: { image: "", image_alt: "", caption: "Out of the oven", tilt: 4 } },
    { type: "card", settings: { image: "", image_alt: "", caption: "The window seat", tilt: -2 } },
  ],
}

const board: ComponentDef = {
  type: `${P}menu`,
  name: "Menu board",
  category: "text",
  template: `
<section class="mb" id="{{ settings.anchor }}" ${rootAttrs({ motion: true })}>
  <div class="mb__in">
    <div class="mb__head"><h2 class="mb__h">{{ settings.heading | raw }}</h2><div class="mb__text">{{ settings.text | raw }}</div></div>
    <div class="mb__cols">
      <div class="mb__col">
        <h3 class="mb__group">{{ settings.group_one }}</h3>
        <ul class="mb__list">{% for block in section.blocks %}{% if block.settings.group == "one" %}<li class="mb__row" {{ block.shopify_attributes }}><span class="mb__name">{{ block.settings.name }}</span><span class="mb__dots" aria-hidden="true"></span><span class="mb__price">{{ block.settings.price }}</span>{% if block.settings.note %}<span class="mb__note">{{ block.settings.note }}</span>{% endif %}</li>{% endif %}{% endfor %}</ul>
      </div>
      <div class="mb__col">
        <h3 class="mb__group">{{ settings.group_two }}</h3>
        <ul class="mb__list">{% for block in section.blocks %}{% if block.settings.group == "two" %}<li class="mb__row" {{ block.shopify_attributes }}><span class="mb__name">{{ block.settings.name }}</span><span class="mb__dots" aria-hidden="true"></span><span class="mb__price">{{ block.settings.price }}</span>{% if block.settings.note %}<span class="mb__note">{{ block.settings.note }}</span>{% endif %}</li>{% endif %}{% endfor %}</ul>
      </div>
    </div>
    {% if settings.footnote %}<div class="mb__foot">{{ settings.footnote | raw }}</div>{% endif %}
  </div>
</section>`,
  style: `
.mb { ${BOX} }
.mb__in { ${INNER} }
.mb__head { display: grid; gap: 12px; margin-bottom: clamp(28px, 5vw, 56px); }
.mb__h { margin: 0; ${DISPLAY} font-size: clamp(2.5rem, 1.3rem + 6cqi, 6rem); line-height: 0.9; letter-spacing: -0.04em; font-weight: 800; }
.mb__text { max-width: 32rem; color: var(--s-muted); line-height: 1.6; }
.mb__text p { margin: 0; }
.mb__cols { display: grid; gap: 36px; }
.mb__group { margin: 0 0 14px; display: inline-block; padding: 6px 14px; border-radius: 999px; background: var(--s-accent); color: var(--s-bg); font-size: 0.9375rem; font-weight: 800; }
.mb__list { margin: 0; padding: 0; list-style: none; }
.mb__row { display: grid; grid-template-columns: auto minmax(16px, 1fr) auto; align-items: baseline; gap: 4px 10px; padding: 12px 0; border-bottom: 1px solid var(--s-border); }
.mb__name { ${DISPLAY} font-size: clamp(1.25rem, 1rem + 1.2cqi, 1.75rem); font-weight: 700; letter-spacing: -0.02em; }
.mb__dots { border-bottom: 2px dotted var(--s-border); transform: translateY(-5px); }
.mb__price { font-variant-numeric: tabular-nums; font-weight: 700; }
.mb__note { grid-column: 1 / -1; color: var(--s-muted); font-size: 0.9375rem; }
.mb__foot { margin-top: 28px; color: var(--s-muted); font-size: 0.9375rem; }
.mb__foot p { margin: 0; }
@container (min-width: 860px) { .mb__cols { grid-template-columns: 1fr 1fr; gap: 64px; } }
${reveal(".mb", ".mb__row", "ai_cf_menu_in")}`,
  settings: [
    s.inline("heading", "Heading", "On the board today"),
    s.text("anchor", "Anchor name, for links like /#menu", "menu"),
    s.rich("text", "Text", "<p>Milk is whole or oat at the same price. Ask what is on filter, it changes with the beans.</p>"),
    s.text("group_one", "First column", "Coffee"),
    s.text("group_two", "Second column", "From the oven"),
    s.rich("footnote", "Under the menu", "<p>Allergens are on the card at the counter. Ask and we will check anything for you.</p>"),
    s.scheme("site_inverse"),
    ...motion(),
    ...spacing(112, 112),
  ],
  blocks: [
    {
      type: "dish",
      name: "Menu line",
      limit: 24,
      settings: [
        s.text("name", "Name", "Flat white"),
        s.text("price", "Price", "3.40"),
        s.text("note", "Note", ""),
        s.select("group", "Column", "one", [
          ["one", "First column"],
          ["two", "Second column"],
        ]),
      ],
    },
  ],
  maxBlocks: 24,
  preset: [
    { type: "dish", settings: { name: "Espresso", price: "2.60", note: "", group: "one" } },
    { type: "dish", settings: { name: "Flat white", price: "3.40", note: "", group: "one" } },
    { type: "dish", settings: { name: "Filter, by the cup", price: "3.20", note: "This week's beans, brewed one cup at a time", group: "one" } },
    { type: "dish", settings: { name: "Iced latte", price: "3.80", note: "", group: "one" } },
    { type: "dish", settings: { name: "Cardamom bun", price: "3.20", note: "", group: "two" } },
    { type: "dish", settings: { name: "Sourdough toast", price: "4.50", note: "Butter and jam, or tomato and olive oil", group: "two" } },
    { type: "dish", settings: { name: "Seasonal tart", price: "4.20", note: "", group: "two" } },
    { type: "dish", settings: { name: "Cheese scone", price: "3.00", note: "", group: "two" } },
  ],
}

const sourcing: ComponentDef = {
  type: `${P}sources`,
  name: "Where it comes from",
  category: "text",
  template: `
<section class="so" ${rootAttrs({ motion: true })}>
  <div class="so__in">
    <h2 class="so__h">{{ settings.heading | raw }}</h2>
    <dl class="so__list">
      {% for block in section.blocks %}
      <div class="so__item" {{ block.shopify_attributes }}><dt class="so__what">{{ block.settings.what }}</dt><dd class="so__from">{{ block.settings.from }}</dd></div>
      {% endfor %}
    </dl>
  </div>
</section>`,
  style: `
.so { ${BOX} }
.so__in { display: grid; gap: clamp(24px, 4vw, 64px); ${INNER} }
.so__h { margin: 0; ${DISPLAY} font-size: clamp(2.25rem, 1.2rem + 5cqi, 5rem); line-height: 0.92; letter-spacing: -0.04em; font-weight: 800; max-width: 12ch; }
.so__list { display: grid; gap: 10px; margin: 0; }
.so__item { display: grid; gap: 4px; padding: 18px 20px; border-radius: 18px; background: var(--s-surface); }
.so__what { font-weight: 800; font-size: 1.125rem; color: var(--s-heading); }
.so__from { margin: 0; color: var(--s-muted); line-height: 1.5; }
@container (min-width: 900px) { .so__in { grid-template-columns: minmax(0, 4fr) minmax(0, 7fr); } .so__list { grid-template-columns: 1fr 1fr; } }
${reveal(".so", ".so__item", "ai_cf_sources_in")}`,
  settings: [s.inline("heading", "Heading", "Who we buy from"), s.scheme("site"), ...motion(), ...spacing(96, 96)],
  blocks: [{ type: "source", name: "Source", limit: 8, settings: [s.text("what", "What", "Coffee"), s.text("from", "From", "Roasted a few streets away, every week")] }],
  maxBlocks: 8,
  preset: [
    { type: "source", settings: { what: "Coffee", from: "Roasted in small batches nearby and rested a week before it reaches the grinder." } },
    { type: "source", settings: { what: "Milk", from: "Whole milk from one dairy, delivered three times a week." } },
    { type: "source", settings: { what: "Flour", from: "Stoneground, for the sourdough and the buns we bake each morning." } },
    { type: "source", settings: { what: "Fruit", from: "Whatever is in season at the market, which is why the tart changes." } },
  ],
}

const hours: ComponentDef = {
  type: `${P}hours`,
  name: "Hours and where to find us",
  category: "text",
  template: `
<section class="hr" ${rootAttrs({ motion: true })}>
  <div class="hr__in">
    <div class="hr__where">
      <h2 class="hr__h">{{ settings.heading | raw }}</h2>
      <p class="hr__address">{{ settings.address }}</p>
      <div class="hr__how">{{ settings.directions | raw }}</div>
      {% if settings.map_label %}<a class="hr__map" href="{{ settings.map_url | url }}">{{ settings.map_label }}</a>{% endif %}
    </div>
    <dl class="hr__times">
      {% for block in section.blocks %}<div class="hr__row" {{ block.shopify_attributes }}><dt>{{ block.settings.days }}</dt><dd>{{ block.settings.hours }}</dd></div>{% endfor %}
    </dl>
  </div>
</section>`,
  style: `
.hr { ${BOX} }
.hr__in { display: grid; gap: clamp(28px, 5vw, 72px); ${INNER} }
.hr__h { margin: 0 0 18px; ${DISPLAY} font-size: clamp(2.5rem, 1.2rem + 6cqi, 6rem); line-height: 0.88; letter-spacing: -0.04em; font-weight: 800; }
.hr__address { margin: 0; ${DISPLAY} font-size: clamp(1.375rem, 1rem + 1.6cqi, 2rem); line-height: 1.15; font-weight: 700; }
.hr__how { margin-top: 12px; max-width: 30rem; color: var(--s-muted); line-height: 1.6; }
.hr__how p { margin: 0; }
.hr__map { display: inline-flex; align-items: center; min-height: 48px; margin-top: 16px; padding: 0 20px; border: 2px solid currentColor; border-radius: 999px; color: inherit; font-weight: 700; text-decoration: none; }
.hr__times { margin: 0; border-top: 2px solid var(--s-text); }
.hr__row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 16px; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.hr__row dt { font-weight: 700; }
.hr__row dd { margin: 0; font-variant-numeric: tabular-nums; }
@container (min-width: 900px) { .hr__in { grid-template-columns: 1fr 1fr; align-items: end; } }
${reveal(".hr", ".hr__row", "ai_cf_hours_in")}`,
  settings: [
    s.inline("heading", "Heading", "Come by"),
    s.text("address", "Address", "On the corner of the high street"),
    s.rich("directions", "Getting here", "<p>Two minutes from the station. Bikes lock up by the front window, and the step is ramped.</p>"),
    s.text("map_label", "Map link", "Open in maps"),
    s.url("map_url", "Map link goes to", "/contact"),
    s.scheme("site"),
    ...motion(),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "day", name: "Opening hours", limit: 7, settings: [s.text("days", "Days", "Monday to Friday"), s.text("hours", "Hours", "7:00 to 16:00")] }],
  maxBlocks: 7,
  preset: [
    { type: "day", settings: { days: "Monday to Friday", hours: "7:00 to 16:00" } },
    { type: "day", settings: { days: "Saturday", hours: "8:00 to 17:00" } },
    { type: "day", settings: { days: "Sunday", hours: "9:00 to 15:00" } },
  ],
}

const head = header({
  type: `${P}header`,
  layout: "center",
  drawer: "sheet",
  cart: "side",
  sticky: true,
  words: { brand: "Cafe", cart: "Bag", menu: "Menu", searchHint: "Search beans and gifts" },
  notices: ["Beans roasted this week are on the shelf", "Ask about bringing your own cup"],
  features: [
    { title: "Beans to take home", text: "Roasted this week", url: "/products" },
    { title: "Visit", text: "Hours and the address", url: "/contact" },
  ],
  skin: `.hd__logo { font-weight: 800; letter-spacing: -0.04em; font-size: 1.75rem; } .hd__top { font-weight: 600; } .hd__count { border-radius: 999px; } .hd__drawer--sheet { border-radius: 22px 22px 0 0; } .hd__checkout { border-radius: 999px; }`,
})

const foot = footer({
  type: `${P}footer`,
  layout: "newsletter",
  scheme: "site_inverse",
  words: { brand: "Cafe", newsHeading: "New beans, first", newsText: "<p>A short note when a new coffee lands on the shelf. That is all we send.</p>", legal: "Coffee, bread and a long table.", subscribe: "Sign up" },
  columns: [
    { heading: "Visit", menu: "main-menu" },
    { heading: "Shop", menu: "footer" },
  ],
  notes: [{ heading: "Hours", text: "<p>Weekdays 7 to 4, Saturday 8 to 5, Sunday 9 to 3.</p>" }],
  skin: `.ft__h { font-weight: 800; letter-spacing: -0.04em; } .ft__row { border-radius: 999px; overflow: hidden; }`,
})

const band = marquee({ type: `${P}band`, scheme: "site_inverse", items: ["Espresso", "Batch brew", "Out of the oven", "Beans to take home", "Long table by the window"], speed: 40, skin: `.mq__item { font-weight: 800; letter-spacing: -0.04em; }` })
const process = stickySteps({
  type: `${P}process`,
  name: "From bean to cup",
  words: { heading: "How a cup gets made here", text: "<p>The slow part happens before we open.</p>" },
  steps: [
    { title: "Pick the beans", text: "<p>We cup a few coffees each season and keep the one that tastes like itself.</p>" },
    { title: "Rest them", text: "<p>Roasted coffee rests a week before it is ground, so the shots stay steady.</p>" },
    { title: "Dial in", text: "<p>Every morning we taste and adjust the grind until the first shot is right.</p>" },
    { title: "Pour", text: "<p>Then it is just milk, a steady hand and a short chat at the counter.</p>" },
  ],
  skin: `.sp__h, .sp__title { font-weight: 800; letter-spacing: -0.035em; } .sp__step { border-top-width: 2px; }`,
})
const beans = productRail({
  type: `${P}beans`,
  name: "Beans and things to take home",
  words: { heading: "Take some home", text: "<p>The coffee we pour, in bags to brew yourself. Straight from the shop.</p>", add: "Add to bag" },
  tiles: [{ title: "Everything on the shelf", text: "Beans, gift cards and a few things for brewing.", label: "Open the shop", url: "/products" }],
  count: 4,
  skin: `.pr__h { font-weight: 800; letter-spacing: -0.04em; } ${ROUND}`,
})
const room = collage({
  type: `${P}room`,
  name: "The room",
  words: { heading: "A room to stay a while", text: "<p>Plugs along the long table, the good chairs by the window, no music before nine.</p>" },
  photos: [
    { caption: "Morning light", size: "tall" },
    { caption: "The bar", size: "square" },
    { caption: "Today's bake", size: "square" },
    { caption: "The long table", size: "wide" },
  ],
  skin: `.cl__h { font-weight: 800; letter-spacing: -0.04em; } .cl__cap { border-radius: 999px; font-weight: 700; } ${ROUND}`,
})
const creed = statement({
  type: `${P}creed`,
  name: "What we care about",
  scheme: "site",
  lines: [
    { text: "Good coffee.", accent: false },
    { text: "Warm bread.", accent: true },
    { text: "No fuss.", accent: false },
  ],
  note: "<p>That is the whole plan. The rest is turning up early and doing it again tomorrow.</p>",
  skin: `.st__lines { font-weight: 800; letter-spacing: -0.05em; }`,
})
const questions = faq({
  type: `${P}faq`,
  words: { heading: "Good to know", text: "<p>The things people ask at the counter.</p>" },
  items: [
    { q: "Can I bring my laptop?", a: "<p>Yes, at the long table. On busy weekend mornings we ask laptops to share.</p>" },
    { q: "Do you have plant milk?", a: "<p>Oat, at no extra cost.</p>" },
    { q: "Are dogs welcome?", a: "<p>Yes. There is a water bowl by the door.</p>" },
    { q: "Can you cater an office breakfast?", a: "<p>Often, with a few days' notice. Write to us with the date and how many people.</p>" },
  ],
  skin: `.fq__h { font-weight: 800; letter-spacing: -0.04em; }`,
})
const close = cta({
  type: `${P}close`,
  scheme: "site_inverse",
  words: { heading: "See you in the morning", text: "<p>Or take the beans home and make it yourself.</p>" },
  actions: [
    { label: "Find us", url: "/contact", style: "solid" },
    { label: "Shop beans", url: "/products", style: "line" },
  ],
  skin: `.cc__h { font-weight: 800; letter-spacing: -0.05em; } ${ROUND}`,
})
const intro = pageIntro({
  type: `${P}intro`,
  words: { heading: "A small cafe that bakes its own", text: "<p>Coffee from people we know, bread made before sunrise, and a room built for staying a while.</p>" },
  facts: [
    { label: "Open", value: "Every day" },
    { label: "Baking", value: "From five each morning" },
  ],
  skin: `.pi__h { font-weight: 800; letter-spacing: -0.05em; } ${ROUND}`,
})
const write = contact({
  type: `${P}write`,
  name: "Write to the cafe",
  words: { heading: "Write to us", text: "<p>Catering, events, wholesale or a lost scarf. We reply within a day.</p>", name: "Your name", email: "Your email", message: "Your message", send: "Send" },
  details: [
    { label: "Address", value: "On the corner of the high street", url: "" },
    { label: "Catering", value: "A few days' notice, please", url: "" },
  ],
  skin: `.ct__h { font-weight: 800; letter-spacing: -0.045em; } ${ROUND} .ct__field input, .ct__field textarea { border-radius: 14px; }`,
})
const product = productMain({
  type: `${P}product`,
  words: { kicker: "From the shelf", add: "Add to bag", buy: "Buy now", options: "Choose a size or grind" },
  details: [
    { title: "Brewing", text: "<p>For filter, start with 60 grams to a litre. For espresso, ask us at the counter.</p>" },
    { title: "Freshness", text: "<p>Best within six weeks of the roast date on the bag.</p>" },
    { title: "Delivery", text: "<p>Posted twice a week, or collect from the cafe.</p>" },
  ],
  skin: `.pd__title, .pd__stand-word { font-weight: 800; letter-spacing: -0.045em; } ${ROUND} .pd__option { border-radius: 14px; }`,
})
const list = collectionGrid({
  type: `${P}list`,
  words: { heading: "The shop", intro: "<p>Beans, gift cards and a few things for brewing at home.</p>", results: "Results for", empty: "Nothing on the shelf here yet.", add: "Add to bag" },
  notes: ["Roasted this week", "Collect from the cafe", "Posted twice a week"],
  columns: 4,
  skin: `.cg__h, .cg__card-stand { font-weight: 800; letter-spacing: -0.045em; } ${ROUND} .cg__note::before { border-radius: 50%; }`,
})

const components = [head, foot, hero, band, board, process, beans, room, creed, sourcing, hours, questions, close, intro, write, product, list]
const H = place(head, "cf-header", { group: "header" })
const F = place(foot, "cf-footer", { group: "footer" })

export const dialIn: SiteTemplate = assemble({
  id: "dial-in-coffee",
  name: "Dial In",
  summary: "Coffee shop, bakery or small restaurant: a pin board of photo cards, the menu as a board with dotted leaders, beans from the shop and the hours set large.",
  industries: ["cafe-bakery", "restaurant"],
  stories: ["food-place"],
  styles: ["playful", "editorial"],
  directionIds: ["hospitality-photo", "retro-analog"],
  keywords: ["coffee", "cafe", "bakery", "roastery", "espresso", "brunch", "restaurant", "bistro", "pastries"],
  motion: "balanced",
  prefix: "cf",
  components,
  header: H,
  footer: F,
  tokens: {
    colors: { background: "#123b2d", surface: "#1b4a3a", text: "#f7f1e1", muted: "#c3c9b8", accent: "#ffc93c", accentText: "#123b2d", border: "#3a6655", inverse: { background: "#ffc93c", text: "#123b2d", accent: "#123b2d" } },
    fonts: { heading: "Bricolage Grotesque", body: "Hanken Grotesk" },
    typeScale: { base: 17, ratio: 1.414 },
    radius: { small: 999, medium: 18, large: 22 },
    spacing: { scale: 1, sectionY: 104, pageWidth: 1360, gutter: 20 },
    motion: { level: "subtle", tier: "balanced" },
    shadow: "md",
  },
  menus: {
    "main-menu": {
      title: "Main menu",
      links: [
        { title: "Menu", url: "/#menu" },
        { title: "Shop", url: "/products", links: [{ title: "All beans and gifts", url: "/products" }, { title: "Search the shop", url: "/search" }] },
        { title: "About", url: "/about" },
        { title: "Visit", url: "/contact" },
      ],
    },
    footer: { title: "Footer", links: [{ title: "Shop", url: "/products" }, { title: "About", url: "/about" }, { title: "Visit and contact", url: "/contact" }, { title: "Search", url: "/search" }] },
  },
  pages: [
    {
      key: "home",
      title: "Home",
      sections: [place(hero, "cf-hero"), place(band, "cf-band"), place(board, "cf-menu"), place(process, "cf-process"), place(beans, "cf-beans"), place(room, "cf-room"), place(creed, "cf-creed"), place(sourcing, "cf-sources"), place(hours, "cf-hours"), place(questions, "cf-faq"), place(close, "cf-close")],
    },
    {
      key: "about",
      title: "About",
      seo: { title: "About the cafe", description: "Who makes the coffee and the bread, where it comes from, and the room you drink it in." },
      sections: [place(intro, "cf-about-intro"), place(sourcing, "cf-about-sources"), place(process, "cf-about-process"), place(room, "cf-about-room"), place(creed, "cf-about-creed"), place(close, "cf-about-close")],
    },
    {
      key: "contact",
      title: "Visit",
      seo: { title: "Visit and contact", description: "Hours, the address, how to get here and how to reach us for catering or events." },
      sections: [place(hours, "cf-contact-hours", { settings: { heading: "Find the cafe" } }), place(write, "cf-contact-write"), place(questions, "cf-contact-faq"), place(close, "cf-contact-close")],
    },
    { key: "product", title: "Product", sections: [place(product, "cf-product"), place(process, "cf-product-process"), place(beans, "cf-product-more", { settings: { heading: "More from the shelf" } })] },
    { key: "collection", title: "Collection", sections: [place(list, "cf-collection"), place(close, "cf-collection-close")] },
    { key: "products", title: "Shop", sections: [place(list, "cf-shop"), place(questions, "cf-shop-faq")] },
    { key: "search", title: "Search", sections: [place(list, "cf-search", { settings: { heading: "Search" } })] },
  ],
  imageSlots: [
    { key: "card-1", style: "photo", aspect: "4:5", prompt: "Close up of a barista pouring latte art into a ceramic cup on a wooden counter, morning window light, film photograph", alt: "Latte art being poured into a cup", targets: [{ page: "home", section: "cf-hero", block: "cf-hero-1", setting: "image" }] },
    { key: "card-2", style: "photo", aspect: "4:5", prompt: "A tray of freshly baked cardamom buns cooling on a bakery rack, warm light, crumbs, documentary food photograph", alt: "Cardamom buns cooling on a rack", targets: [{ page: "home", section: "cf-hero", block: "cf-hero-2", setting: "image" }] },
    { key: "card-3", style: "photo", aspect: "4:5", prompt: "A person reading at a window seat in a small neighbourhood cafe, coffee cup on the sill, soft daylight, candid", alt: "Someone reading by the cafe window", targets: [{ page: "home", section: "cf-hero", block: "cf-hero-3", setting: "image" }] },
    { key: "room-1", style: "photo", aspect: "3:4", prompt: "Early morning light falling across an empty cafe with a long wooden table, chairs tucked in, calm", alt: "Morning light across the long table", targets: [{ page: "home", section: "cf-room", block: "cf-room-1", setting: "image" }, { page: "about", section: "cf-about-room", block: "cf-about-room-1", setting: "image" }] },
    { key: "room-2", style: "photo", aspect: "1:1", prompt: "An espresso machine on a cafe bar with cups stacked on top, steam, shallow depth of field", alt: "The espresso machine on the bar", targets: [{ page: "home", section: "cf-room", block: "cf-room-2", setting: "image" }, { page: "about", section: "cf-about-room", block: "cf-about-room-2", setting: "image" }] },
    { key: "room-3", style: "photo", aspect: "1:1", prompt: "A seasonal fruit tart on a ceramic plate on a marble counter, overhead, natural light", alt: "A fruit tart on the counter", targets: [{ page: "home", section: "cf-room", block: "cf-room-3", setting: "image" }, { page: "about", section: "cf-about-room", block: "cf-about-room-3", setting: "image" }] },
    { key: "room-4", style: "photo", aspect: "16:9", prompt: "Wide shot of a busy small cafe on a weekend morning, people at a long table, plants, warm light, candid", alt: "A busy weekend morning in the cafe", targets: [{ page: "home", section: "cf-room", block: "cf-room-4", setting: "image" }, { page: "about", section: "cf-about-room", block: "cf-about-room-4", setting: "image" }] },
    { key: "about", style: "photo", aspect: "4:3", prompt: "A baker shaping sourdough loaves on a floured bench before sunrise, warm tungsten light, documentary", alt: "Shaping sourdough before sunrise", targets: [{ page: "about", section: "cf-about-intro", setting: "image" }] },
  ],
  bindings: [
    { page: "home", section: "cf-beans", setting: "products", kind: "products", why: "The beans and gifts from the shop. Empty shows the newest products." },
    { page: "contact", section: "cf-contact-write", setting: "form", kind: "form", why: "A catering or contact form if the creator has one; otherwise a contact message." },
    { page: "home", section: "cf-header", setting: "menu", kind: "menu", why: "The main menu." },
  ],
  design: {
    thesis: "Bottle green ground, a big friendly grotesk headline and three photo cards pinned at angles beside it, a round yellow sticker with the opening time.",
    layout: ["Photo cards overlap at small angles, never a straight grid", "The menu as a two column board with dotted leaders", "Hours and the address set as large type, not a footnote", "One yellow inverse band (the menu) changes the tempo"],
    imagery: "Real food and the real room: pours, bakes, window light, people at the table; never stock flat lays or a coffee bean splash.",
    motion: "Cards drop in and settle at their angle; hovering a card straightens it; buttons tip a little; the running band is slow.",
    signature: ["pinned photo cards", "round opening time sticker", "menu board with dotted leaders", "hours set large"],
    avoid: ["cream background with a serif", "coffee bean splash photos", "invented reviews or awards"],
  },
})
