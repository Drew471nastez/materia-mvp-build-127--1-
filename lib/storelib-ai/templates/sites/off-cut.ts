/**
 * OFF CUT: a clothing brand or streetwear store.
 *
 * Cool concrete grey, black rules and one hot pink, a heavy tight grotesk
 * with mono specs. The first screen hangs the pieces on a line with pegs
 * (they sway once, then settle), the drop comes from the shop, a lookbook
 * scrolls sideways with each look linked to its product, categories are a
 * wall of huge words whose photo follows the pointer, and fit notes say how
 * the clothes really wear. Original work for Storelib (round P, P2a).
 */
import { assemble } from "../kit/build"
import { footer, header } from "../kit/chrome"
import { BOX, DISPLAY, INNER, motion, place, rootAttrs, s, spacing, type ComponentDef } from "../kit/schema"
import { collage, collectionGrid, contact, cta, faq, marquee, pageIntro, productMain, productRail, reveal, statement } from "../kit/sections"
import type { SiteTemplate } from "../types"

const P = "ai_oc_"
const MONO = "font-family: var(--theme-font-accent, var(--theme-font-body)), monospace;"
const HEAVY = "font-weight: 800; letter-spacing: -0.05em; text-transform: uppercase;"

const hero: ComponentDef = {
  type: `${P}hero`,
  name: "Opening, the pieces on a line",
  category: "hero",
  template: `
<section class="lh" ${rootAttrs({ motion: true })}>
  <div class="lh__in">
    <h1 class="lh__h">{{ settings.heading | raw }}</h1>
    <div class="lh__foot">
      <div class="lh__text">{{ settings.text | raw }}</div>
      <a class="lh__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
    </div>
    <div class="lh__line" aria-hidden="true"></div>
    <ul class="lh__rack" data-storelib-motion="reveal-stagger">
      {% for block in section.blocks %}
      <li class="lh__piece lh__piece--{{ forloop.index }}" {{ block.shopify_attributes }}>
        <a class="lh__link" href="{{ block.settings.url | url }}">
          <span class="lh__peg" aria-hidden="true"></span>
          <span class="lh__media">{% if block.settings.image %}<img src="{{ block.settings.image | asset }}" alt="{{ block.settings.image_alt }}" width="700" height="900" {% if forloop.first %}fetchpriority="high"{% else %}loading="lazy"{% endif %}>{% else %}<span class="lh__stand">{{ block.settings.label }}</span>{% endif %}</span>
          <span class="lh__tag">{{ block.settings.label }}</span>
        </a>
      </li>
      {% endfor %}
    </ul>
  </div>
</section>`,
  style: `
.lh { ${BOX} overflow: hidden; }
.lh__in { position: relative; ${INNER} }
.lh__h { margin: 0; ${DISPLAY} ${HEAVY} font-size: clamp(3.5rem, 17cqi, 15rem); line-height: 0.8; }
.lh__h em { font-style: normal; color: var(--s-accent); }
.lh__line { height: 2px; margin: clamp(20px, 3vw, 40px) calc(-1 * var(--theme-padding-x, 20px)) 0; background: var(--s-text); }
.lh__rack { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(46%, 1fr); gap: 12px; margin: 0; padding: 0 0 16px; list-style: none; overflow-x: auto; scroll-snap-type: x mandatory; }
.lh__piece { position: relative; padding-top: 22px; scroll-snap-align: start; transform-origin: 50% 0; }
.lh__piece:nth-child(even) { margin-top: 18px; }
.lh__link { display: grid; gap: 8px; color: inherit; text-decoration: none; }
.lh__peg { position: absolute; top: -6px; left: 50%; width: 12px; height: 30px; margin-left: -6px; background: var(--s-accent); border: 2px solid var(--s-text); }
.lh__media { display: block; aspect-ratio: 7 / 9; overflow: hidden; background: var(--s-surface); border: 2px solid var(--s-text); }
.lh__media img { width: 100%; height: 100%; object-fit: cover; }
.lh__stand { display: flex; align-items: flex-end; width: 100%; height: 100%; padding: 12px; ${DISPLAY} ${HEAVY} font-size: clamp(1.5rem, 7cqi, 3rem); line-height: 0.85; overflow-wrap: anywhere; }
.lh__tag { justify-self: start; padding: 4px 8px; background: var(--s-text); color: var(--s-bg); ${MONO} font-size: 0.75rem; letter-spacing: 0.04em; }
.lh__foot { display: grid; gap: 20px; margin-top: clamp(18px, 3vw, 32px); }
.lh__text { max-width: 32rem; font-size: 1.125rem; line-height: 1.5; }
.lh__text p { margin: 0; }
.lh__btn { justify-self: start; display: inline-flex; align-items: center; min-height: 56px; padding: 0 28px; background: var(--s-btn); color: var(--s-btn-text); border: 2px solid var(--s-text); font-weight: 800; text-transform: uppercase; text-decoration: none; box-shadow: 5px 5px 0 var(--s-text); transition: transform var(--t-motion-hover, 160ms) var(--t-motion-ease-ui, ease), box-shadow var(--t-motion-hover, 160ms) ease; }
.lh__btn:hover { transform: translate(3px, 3px); box-shadow: 2px 2px 0 var(--s-text); }
@container (min-width: 760px) { .lh__rack { grid-auto-columns: minmax(23%, 1fr); overflow: visible; } }
@container (min-width: 900px) { .lh__foot { grid-template-columns: minmax(0, 1fr) auto; align-items: end; } }
@media (prefers-reduced-motion: no-preference) {
  .lh:not([data-motion="off"]) .lh__piece { animation: ai_oc_hero_sway calc(var(--t-motion-duration, 650ms) * 2.4) var(--t-motion-ease, ease) both; }
  .lh:not([data-motion="off"]) .lh__piece:nth-child(2) { animation-delay: calc(var(--t-motion-stagger, 65ms) * 2); }
  .lh:not([data-motion="off"]) .lh__piece:nth-child(3) { animation-delay: calc(var(--t-motion-stagger, 65ms) * 4); }
  .lh:not([data-motion="off"]) .lh__piece:nth-child(4) { animation-delay: calc(var(--t-motion-stagger, 65ms) * 6); }
  @keyframes ai_oc_hero_sway { 0% { transform: rotate(calc(9deg * var(--m-k, 1))); } 35% { transform: rotate(calc(-5deg * var(--m-k, 1))); } 65% { transform: rotate(calc(2deg * var(--m-k, 1))); } 100% { transform: rotate(0deg); } }
}
@media (hover: hover) and (pointer: fine) { .lh__link:hover .lh__media { border-color: var(--s-accent); } }`,
  settings: [
    s.inline("heading", "Heading", "Cut in <em>small</em> runs"),
    s.rich("text", "Text", "<p>Heavy cotton, boxy fits and a few pieces each season. When a run is gone it is gone.</p>"),
    s.text("cta_label", "Button", "Shop the drop"),
    s.url("cta_url", "Button link", "/products"),
    s.scheme("site"),
    ...motion(),
    ...spacing(48, 72),
  ],
  blocks: [{ type: "piece", name: "Piece on the line", limit: 4, settings: [s.image("image", "Photo"), s.text("image_alt", "Photo description", ""), s.text("label", "Tag", "Hoodie"), s.url("url", "Link", "/products")] }],
  maxBlocks: 4,
  preset: [
    { type: "piece", settings: { image: "", image_alt: "", label: "Hoodie", url: "/products" } },
    { type: "piece", settings: { image: "", image_alt: "", label: "Heavy tee", url: "/products" } },
    { type: "piece", settings: { image: "", image_alt: "", label: "Work jacket", url: "/products" } },
    { type: "piece", settings: { image: "", image_alt: "", label: "Cap", url: "/products" } },
  ],
}

const lookbook: ComponentDef = {
  type: `${P}looks`,
  name: "Lookbook, shop the look",
  category: "image",
  template: `
<section class="lb" ${rootAttrs({ motion: true })}>
  <div class="lb__in">
    <div class="lb__head"><h2 class="lb__h">{{ settings.heading | raw }}</h2><div class="lb__text">{{ settings.text | raw }}</div></div>
    <ol class="lb__track" data-storelib-motion="pin-horizontal" tabindex="0" aria-label="{{ settings.track_label }}">
      {% for block in section.blocks %}
      <li class="lb__look" {{ block.shopify_attributes }}>
        <figure class="lb__fig">
          {% if block.settings.image %}<img src="{{ block.settings.image | asset }}" alt="{{ block.settings.image_alt }}" width="1000" height="1333" loading="lazy">{% else %}<span class="lb__stand" aria-hidden="true">{{ block.settings.caption }}</span>{% endif %}
          <figcaption class="lb__cap"><span>{{ block.settings.caption }}</span>{% if block.settings.product.title %}<a class="lb__shop" href="{{ block.settings.product.url | url }}">{{ block.settings.product.title }} {{ block.settings.product.price }}</a>{% endif %}</figcaption>
        </figure>
      </li>
      {% endfor %}
    </ol>
  </div>
</section>`,
  style: `
.lb { ${BOX} overflow: hidden; }
.lb__in { ${INNER} }
.lb__head { display: grid; gap: 10px; margin-bottom: clamp(20px, 4vw, 40px); }
.lb__h { margin: 0; ${DISPLAY} ${HEAVY} font-size: clamp(2.5rem, 1rem + 8cqi, 8rem); line-height: 0.82; }
.lb__text { max-width: 30rem; ${MONO} font-size: 0.875rem; line-height: 1.6; color: var(--s-muted); }
.lb__text p { margin: 0; }
.lb__track { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(78%, 1fr); gap: 12px; margin: 0 calc(-1 * var(--theme-padding-x, 20px)); padding: 0 var(--theme-padding-x, 20px) 12px; list-style: none; overflow-x: auto; scroll-snap-type: x mandatory; }
.lb__look { scroll-snap-align: start; min-width: 0; }
.lb__fig { position: relative; margin: 0; border: 2px solid var(--s-text); background: var(--s-surface); }
.lb__fig img, .lb__stand { display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; }
.lb__stand { display: flex; align-items: flex-end; padding: 16px; ${DISPLAY} ${HEAVY} font-size: clamp(2rem, 8cqi, 4rem); line-height: 0.85; background: var(--s-accent); color: var(--s-bg); }
.lb__cap { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; padding: 10px 12px; border-top: 2px solid var(--s-text); ${MONO} font-size: 0.8125rem; }
.lb__shop { color: inherit; font-weight: 700; text-underline-offset: 4px; }
.lb__track:focus-visible { outline: 2px solid var(--s-accent); outline-offset: 4px; }
@container (min-width: 760px) { .lb__track { grid-auto-columns: minmax(40%, 1fr); } }
@container (min-width: 1100px) { .lb__track { grid-auto-columns: minmax(30%, 1fr); gap: 16px; } }
${reveal(".lb", ".lb__look", "ai_oc_looks_in")}`,
  settings: [
    s.inline("heading", "Heading", "Worn in"),
    s.rich("text", "Text", "<p>Shot on the street, on people who wear it. Tap a look for the piece.</p>"),
    s.text("track_label", "Lookbook name (read aloud)", "Looks"),
    s.scheme("site_inverse"),
    ...motion(),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "look", name: "Look", limit: 8, settings: [s.image("image", "Photo"), s.text("image_alt", "Photo description", ""), s.text("caption", "Caption", "Look one"), s.product("product", "The piece in it")] }],
  maxBlocks: 8,
  preset: [
    { type: "look", settings: { image: "", image_alt: "", caption: "Early, by the canal", product: "" } },
    { type: "look", settings: { image: "", image_alt: "", caption: "Corner shop run", product: "" } },
    { type: "look", settings: { image: "", image_alt: "", caption: "Last train home", product: "" } },
    { type: "look", settings: { image: "", image_alt: "", caption: "Sunday, nowhere to be", product: "" } },
  ],
}

const index: ComponentDef = {
  type: `${P}index`,
  name: "Categories as a wall of words",
  category: "text",
  template: `
<section class="wi" ${rootAttrs({ motion: true })}>
  <div class="wi__in">
    <h2 class="wi__label">{{ settings.heading }}</h2>
    <ul class="wi__list" data-storelib-motion="cursor-follow">
      {% for block in section.blocks %}
      <li class="wi__item" {{ block.shopify_attributes }}>
        <a class="wi__link" href="{{ block.settings.url | url }}"><span class="wi__word">{{ block.settings.label }}</span>{% if block.settings.image %}<img class="wi__img" src="{{ block.settings.image | asset }}" alt="" width="400" height="500" loading="lazy">{% endif %}</a>
      </li>
      {% endfor %}
    </ul>
  </div>
</section>`,
  style: `
.wi { ${BOX} }
.wi__in { ${INNER} }
.wi__label { margin: 0 0 18px; ${MONO} font-size: 0.8125rem; font-weight: 400; color: var(--s-muted); }
.wi__list { display: flex; flex-wrap: wrap; gap: 0 clamp(12px, 2vw, 28px); margin: 0; padding: 0; list-style: none; }
.wi__link { position: relative; display: inline-flex; color: inherit; text-decoration: none; }
.wi__word { ${DISPLAY} ${HEAVY} font-size: clamp(2.75rem, 12cqi, 11rem); line-height: 0.86; transition: color var(--t-motion-hover, 160ms) ease; }
.wi__img { position: absolute; left: 60%; top: 10%; z-index: 2; width: clamp(120px, 16cqi, 220px); height: auto; aspect-ratio: 4 / 5; object-fit: cover; border: 2px solid var(--s-text); opacity: 0; pointer-events: none; transform: rotate(6deg) scale(0.9); transition: opacity var(--t-motion-hover, 160ms) ease, transform var(--t-motion-duration, 450ms) var(--t-motion-ease, ease); }
@media (hover: hover) and (pointer: fine) {
  .wi__link:hover .wi__word { color: var(--s-accent); }
  .wi__link:hover .wi__img, .wi__link:focus-visible .wi__img { opacity: 1; transform: rotate(6deg); }
}
.wi__item:nth-child(3n + 2) .wi__word { color: var(--s-muted); }
@media (prefers-reduced-motion: reduce) { .wi__img, .wi__word { transition: none; } }`,
  settings: [s.text("heading", "Small heading", "Shop by piece"), s.scheme("site"), ...motion(), ...spacing(96, 96)],
  blocks: [{ type: "category", name: "Category", limit: 8, settings: [s.text("label", "Word", "Hoodies"), s.url("url", "Link", "/products"), s.image("image", "Photo on hover")] }],
  maxBlocks: 8,
  preset: [
    { type: "category", settings: { label: "Hoodies", url: "/products", image: "" } },
    { type: "category", settings: { label: "Tees", url: "/products", image: "" } },
    { type: "category", settings: { label: "Outerwear", url: "/products", image: "" } },
    { type: "category", settings: { label: "Caps", url: "/products", image: "" } },
    { type: "category", settings: { label: "Everything", url: "/products", image: "" } },
  ],
}

const fit: ComponentDef = {
  type: `${P}fit`,
  name: "How it fits",
  category: "text",
  template: `
<section class="ft2" ${rootAttrs({ motion: true })}>
  <div class="ft2__in">
    <div class="ft2__head"><h2 class="ft2__h">{{ settings.heading | raw }}</h2><div class="ft2__text">{{ settings.text | raw }}</div></div>
    <dl class="ft2__grid">
      {% for block in section.blocks %}<div class="ft2__cell" {{ block.shopify_attributes }}><dt class="ft2__term">{{ block.settings.label }}</dt><dd class="ft2__def">{{ block.settings.text }}</dd></div>{% endfor %}
    </dl>
  </div>
</section>`,
  style: `
.ft2 { ${BOX} }
.ft2__in { display: grid; gap: clamp(24px, 4vw, 56px); ${INNER} }
.ft2__h { margin: 0 0 12px; ${DISPLAY} ${HEAVY} font-size: clamp(2.25rem, 1rem + 6cqi, 6rem); line-height: 0.84; }
.ft2__text { max-width: 30rem; line-height: 1.6; }
.ft2__text p { margin: 0; }
.ft2__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border-top: 2px solid var(--s-text); border-left: 2px solid var(--s-text); }
.ft2__cell { padding: 16px; border-right: 2px solid var(--s-text); border-bottom: 2px solid var(--s-text); }
.ft2__term { ${MONO} font-size: 0.75rem; color: var(--s-muted); }
.ft2__def { margin: 6px 0 0; font-weight: 700; font-size: clamp(1rem, 0.9rem + 0.6cqi, 1.25rem); line-height: 1.25; }
@container (min-width: 900px) { .ft2__in { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); } .ft2__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
${reveal(".ft2", ".ft2__cell", "ai_oc_fit_in")}`,
  settings: [s.inline("heading", "Heading", "How it wears"), s.rich("text", "Text", "<p>Most people take their usual size. Size down for a closer fit.</p>"), s.scheme("site"), ...motion(), ...spacing(96, 96)],
  blocks: [{ type: "note", name: "Fit note", limit: 9, settings: [s.text("label", "Label", "Body"), s.text("text", "Note", "Boxy and a little cropped")] }],
  maxBlocks: 9,
  preset: [
    { type: "note", settings: { label: "Body", text: "Boxy, a little cropped" } },
    { type: "note", settings: { label: "Shoulder", text: "Dropped" } },
    { type: "note", settings: { label: "Cotton", text: "Heavyweight, brushed inside" } },
    { type: "note", settings: { label: "Wash", text: "Cold, inside out" } },
    { type: "note", settings: { label: "Shrink", text: "Washed before cutting" } },
    { type: "note", settings: { label: "Sizing", text: "True to size" } },
  ],
}

const head = header({
  type: `${P}header`,
  layout: "split",
  drawer: "side",
  cart: "side",
  sticky: true,
  words: { brand: "Label", cart: "Bag", menu: "Menu", searchHint: "Search hoodies, tees, caps", empty: "Your bag is empty. The drop is not." },
  notices: ["New pieces drop on Fridays", "Sign up below to hear first"],
  features: [
    { title: "The drop", text: "This season's pieces", url: "/products" },
    { title: "How it wears", text: "Fit notes for every piece", url: "/about" },
    { title: "Lookbook", text: "Shot on the street", url: "/about" },
  ],
  skin: `.hd { border-bottom: 2px solid var(--s-text); } .hd__logo { font-weight: 800; text-transform: uppercase; letter-spacing: -0.05em; font-size: 1.75rem; } .hd__top, .hd__tool { ${MONO} font-size: 0.75rem; letter-spacing: 0.02em; } .hd__mlink, .hd__msum, .hd__mega-all { text-transform: uppercase; font-weight: 800; letter-spacing: -0.05em; } .hd__checkout { border: 2px solid var(--s-text); text-transform: uppercase; } .hd__count { color: var(--s-text); }`,
})

const foot = footer({
  type: `${P}footer`,
  layout: "wordmark",
  scheme: "site_inverse",
  words: { brand: "Label", newsHeading: "Hear about the drop first", newsText: "<p>One email the day before new pieces go up. Nothing else.</p>", legal: "Cut in small runs.", subscribe: "Sign up" },
  columns: [
    { heading: "Shop", menu: "main-menu" },
    { heading: "Help", menu: "footer" },
  ],
  notes: [{ heading: "Returns", text: "<p>Unworn pieces back within 30 days. Write to us and we will send a label.</p>" }],
  skin: `.ft__mark { text-transform: uppercase; font-weight: 800; letter-spacing: -0.06em; } .ft__h { text-transform: uppercase; font-weight: 800; letter-spacing: -0.04em; }`,
})

const band = marquee({ type: `${P}band`, scheme: "site_inverse", items: ["Hoodies", "Heavy tees", "Work jackets", "Caps", "Small runs"], speed: 24, skin: `.mq__item { text-transform: uppercase; font-weight: 800; letter-spacing: -0.05em; }` })
const drop = productRail({
  type: `${P}drop`,
  name: "The drop, from the shop",
  words: { heading: "This drop", text: "<p>Straight from the shop, newest first. Sizes and stock are live.</p>", add: "Add to bag" },
  tiles: [{ title: "Everything", text: "Every piece still in stock.", label: "See it all", url: "/products" }],
  count: 6,
  skin: `.pr__h, .pr__tile-title, .pr__card-stand { text-transform: uppercase; font-weight: 800; letter-spacing: -0.05em; } .pr__card-media, .pr__tile-link { border: 2px solid var(--s-text); } .pr__card-add { border: 2px solid var(--s-text); text-transform: uppercase; } .pr__card-price { ${MONO} font-size: 0.8125rem; }`,
})
const creed = statement({
  type: `${P}creed`,
  name: "The idea",
  scheme: "site",
  lines: [
    { text: "Wear it", accent: false },
    { text: "until it is", accent: false },
    { text: "yours.", accent: true },
  ],
  note: "<p>Made to be worn hard and washed a lot. It gets better the more you do.</p>",
  skin: `.st__lines { text-transform: uppercase; font-weight: 800; letter-spacing: -0.06em; font-size: clamp(3rem, 1rem + 12cqi, 12rem); line-height: 0.8; }`,
})
const street = collage({
  type: `${P}street`,
  name: "On the street",
  words: { heading: "Out and about", text: "<p>Friends, regulars and the people who make it.</p>" },
  photos: [
    { caption: "Saturday", size: "wide" },
    { caption: "The studio", size: "tall" },
    { caption: "Cutting room", size: "square" },
    { caption: "Late", size: "square" },
  ],
  skin: `.cl__h { text-transform: uppercase; font-weight: 800; letter-spacing: -0.05em; } .cl__fig { border: 2px solid var(--s-text); } .cl__cap { ${MONO} font-size: 0.75rem; }`,
})
const questions = faq({
  type: `${P}faq`,
  words: { heading: "Orders and returns", text: "<p>Still stuck? Write to us from the contact page.</p>" },
  items: [
    { q: "When do new pieces drop?", a: "<p>Fridays, a few times a season. Sign up to hear the day before.</p>" },
    { q: "Will a sold out piece come back?", a: "<p>Sometimes in a new colour, rarely the same. Small runs are the point.</p>" },
    { q: "How long does delivery take?", a: "<p>Orders go out within two working days. You get tracking by email.</p>" },
    { q: "Can I return something?", a: "<p>Unworn pieces within 30 days. Write to us and we send a label.</p>" },
  ],
  skin: `.fq__h { text-transform: uppercase; font-weight: 800; letter-spacing: -0.05em; } .fq__list { border-top: 2px solid var(--s-text); }`,
})
const close = cta({
  type: `${P}close`,
  scheme: "site_inverse",
  words: { heading: "Before it is gone", text: "<p>Small runs sell through. What is in the shop is what there is.</p>" },
  actions: [
    { label: "Shop the drop", url: "/products", style: "solid" },
    { label: "How it wears", url: "/about", style: "line" },
  ],
  skin: `.cc__h { text-transform: uppercase; font-weight: 800; letter-spacing: -0.06em; } .cc__btn { text-transform: uppercase; }`,
})
const intro = pageIntro({
  type: `${P}intro`,
  words: { heading: "Made in small runs", text: "<p>A few pieces each season, cut from heavy cotton and made to be worn until they are yours.</p>" },
  facts: [
    { label: "Runs", value: "Small, never restocked the same" },
    { label: "Cotton", value: "Heavyweight" },
  ],
  skin: `.pi__h { text-transform: uppercase; font-weight: 800; letter-spacing: -0.06em; } .pi__media { border: 2px solid var(--s-text); }`,
})
const write = contact({
  type: `${P}write`,
  name: "Write to the label",
  words: { heading: "Write to us", text: "<p>Orders, sizing, wholesale or a collaboration. We answer within two working days.</p>", name: "Name", email: "Email", message: "Message", send: "Send" },
  details: [
    { label: "Orders", value: "Put your order number in the message", url: "" },
    { label: "Wholesale", value: "Shops and stockists welcome", url: "" },
  ],
  skin: `.ct__h { text-transform: uppercase; font-weight: 800; letter-spacing: -0.05em; } .ct__field input, .ct__field textarea { border: 2px solid var(--s-text); } .ct__send { border: 2px solid var(--s-text); text-transform: uppercase; box-shadow: 4px 4px 0 var(--s-text); }`,
})
const product = productMain({
  type: `${P}product`,
  words: { kicker: "This drop", add: "Add to bag", buy: "Buy now", options: "Choose a size" },
  details: [
    { title: "Fit", text: "<p>Boxy and a little cropped. Take your usual size, or size down for a closer fit.</p>" },
    { title: "Fabric and care", text: "<p>Heavyweight cotton, washed before cutting. Wash cold, inside out.</p>" },
    { title: "Delivery and returns", text: "<p>Sent within two working days. Unworn pieces back within 30 days.</p>" },
  ],
  skin: `.pd__title, .pd__stand-word { text-transform: uppercase; font-weight: 800; letter-spacing: -0.05em; } .pd__shot, .pd__stand { border: 2px solid var(--s-text); } .pd__option { ${MONO} border: 2px solid var(--s-text); } .pd__add { border: 2px solid var(--s-text); text-transform: uppercase; box-shadow: 5px 5px 0 var(--s-text); } .pd__price { ${MONO} }`,
})
const list = collectionGrid({
  type: `${P}list`,
  words: { heading: "Everything", intro: "<p>Every piece still in stock, newest first.</p>", results: "Results for", empty: "Nothing here. The next drop is close.", add: "Add to bag" },
  notes: ["Sent in two working days", "Returns within 30 days", "Small runs"],
  columns: 4,
  skin: `.cg__h, .cg__card-stand { text-transform: uppercase; font-weight: 800; letter-spacing: -0.06em; } .cg__card-media { border: 2px solid var(--s-text); } .cg__card-price, .cg__notes { ${MONO} font-size: 0.8125rem; }`,
})

const components = [head, foot, hero, band, drop, index, lookbook, creed, fit, street, questions, close, intro, write, product, list]
const H = place(head, "oc-header", { group: "header" })
const F = place(foot, "oc-footer", { group: "footer" })

export const offCut: SiteTemplate = assemble({
  id: "off-cut-streetwear",
  name: "Off Cut",
  summary: "Clothing brand or streetwear store: the pieces hung on a line with pegs, the drop from the shop, a sideways lookbook that links each look to its piece, categories as a wall of huge words.",
  industries: ["fashion", "outdoor"],
  stories: ["product-brand"],
  styles: ["fashion-commerce", "neo-brutalism"],
  directionIds: ["fashion-commerce", "neo-brutalist", "monochrome"],
  keywords: ["streetwear", "clothing", "apparel", "hoodies", "tees", "merch", "drop", "menswear", "womenswear", "label"],
  motion: "expressive",
  prefix: "oc",
  components,
  header: H,
  footer: F,
  tokens: {
    colors: { background: "#ebebe8", surface: "#dcdcd8", text: "#0b0b0b", muted: "#4a4a47", accent: "#c40053", accentText: "#ffffff", border: "#0b0b0b", inverse: { background: "#0b0b0b", text: "#ebebe8", accent: "#ff3d8a" } },
    fonts: { heading: "Mona Sans", body: "Mona Sans", accent: "Martian Mono" },
    typeScale: { base: 16, ratio: 1.618 },
    radius: { small: 0, medium: 0, large: 0 },
    spacing: { scale: 0.9, sectionY: 88, pageWidth: 1480, gutter: 16 },
    motion: { level: "expressive", tier: "expressive" },
    shadow: "none",
  },
  menus: {
    "main-menu": {
      title: "Main menu",
      links: [
        { title: "Shop", url: "/products", links: [{ title: "Everything", url: "/products" }, { title: "Search", url: "/search" }] },
        { title: "About", url: "/about" },
        { title: "Contact", url: "/contact" },
      ],
    },
    footer: { title: "Footer", links: [{ title: "Shop", url: "/products" }, { title: "About and fit", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Search", url: "/search" }] },
  },
  pages: [
    {
      key: "home",
      title: "Home",
      sections: [place(hero, "oc-hero"), place(band, "oc-band"), place(drop, "oc-drop"), place(index, "oc-index"), place(lookbook, "oc-looks"), place(creed, "oc-creed"), place(fit, "oc-fit"), place(street, "oc-street"), place(drop, "oc-more", { settings: { heading: "Still in stock", count: 8 }, blocks: [{ type: "tile", settings: { title: "The archive", text: "Older pieces, while they last.", label: "Browse", url: "/products" } }] }), place(questions, "oc-faq"), place(close, "oc-close")],
    },
    {
      key: "about",
      title: "About",
      seo: { title: "About the label", description: "How the clothes are made, how they wear, and the people in them." },
      sections: [place(intro, "oc-about-intro"), place(creed, "oc-about-creed"), place(fit, "oc-about-fit"), place(lookbook, "oc-about-looks"), place(street, "oc-about-street"), place(close, "oc-about-close")],
    },
    {
      key: "contact",
      title: "Contact",
      seo: { title: "Contact", description: "Orders, sizing, wholesale and collaborations." },
      sections: [place(write, "oc-contact-write"), place(questions, "oc-contact-faq"), place(close, "oc-contact-close")],
    },
    { key: "product", title: "Product", sections: [place(product, "oc-product"), place(fit, "oc-product-fit"), place(drop, "oc-product-more", { settings: { heading: "Wear it with" } })] },
    { key: "collection", title: "Collection", sections: [place(list, "oc-collection"), place(close, "oc-collection-close")] },
    { key: "products", title: "Shop", sections: [place(list, "oc-shop"), place(questions, "oc-shop-faq")] },
    { key: "search", title: "Search", sections: [place(list, "oc-search", { settings: { heading: "Search" } })] },
  ],
  imageSlots: [
    { key: "piece-1", style: "product", aspect: "3:4", prompt: "A heavyweight hoodie hanging from a wooden peg on a line against a plain grey wall, studio light, product photograph, no logos", alt: "A hoodie hanging on the line", targets: [{ page: "home", section: "oc-hero", block: "oc-hero-1", setting: "image" }] },
    { key: "piece-2", style: "product", aspect: "3:4", prompt: "A boxy heavyweight t-shirt hanging from a peg on a line against a plain grey wall, studio light, product photograph", alt: "A heavy tee hanging on the line", targets: [{ page: "home", section: "oc-hero", block: "oc-hero-2", setting: "image" }] },
    { key: "piece-3", style: "product", aspect: "3:4", prompt: "A canvas work jacket hanging from a peg on a line against a plain grey wall, studio light, product photograph", alt: "A work jacket hanging on the line", targets: [{ page: "home", section: "oc-hero", block: "oc-hero-3", setting: "image" }] },
    { key: "piece-4", style: "product", aspect: "3:4", prompt: "A six panel cap clipped to a line with a peg against a plain grey wall, studio light, product photograph", alt: "A cap clipped to the line", targets: [{ page: "home", section: "oc-hero", block: "oc-hero-4", setting: "image" }] },
    { key: "look-1", style: "photo", aspect: "3:4", prompt: "Street style photograph of a young person in an oversized hoodie by a canal in early morning light, candid, 35mm film look", alt: "A hoodie worn by the canal", targets: [{ page: "home", section: "oc-looks", block: "oc-looks-1", setting: "image" }, { page: "about", section: "oc-about-looks", block: "oc-about-looks-1", setting: "image" }] },
    { key: "look-2", style: "photo", aspect: "3:4", prompt: "Street style photograph of two friends outside a corner shop at dusk wearing heavyweight tees and caps, candid, flash", alt: "Two friends outside a corner shop", targets: [{ page: "home", section: "oc-looks", block: "oc-looks-2", setting: "image" }, { page: "about", section: "oc-about-looks", block: "oc-about-looks-2", setting: "image" }] },
    { key: "look-3", style: "photo", aspect: "3:4", prompt: "A person in a work jacket on an empty late night train platform, cinematic, cool light, candid", alt: "A work jacket on a late train platform", targets: [{ page: "home", section: "oc-looks", block: "oc-looks-3", setting: "image" }, { page: "about", section: "oc-about-looks", block: "oc-about-looks-3", setting: "image" }] },
    { key: "look-4", style: "photo", aspect: "3:4", prompt: "A relaxed Sunday street portrait, person sitting on a low wall in a boxy tee, soft overcast light", alt: "Sitting on a wall on a Sunday", targets: [{ page: "home", section: "oc-looks", block: "oc-looks-4", setting: "image" }, { page: "about", section: "oc-about-looks", block: "oc-about-looks-4", setting: "image" }] },
    { key: "street-1", style: "photo", aspect: "16:9", prompt: "A group of friends walking across a city street on a Saturday wearing streetwear, wide, candid, golden hour", alt: "Friends crossing the street on a Saturday", targets: [{ page: "home", section: "oc-street", block: "oc-street-1", setting: "image" }, { page: "about", section: "oc-about-street", block: "oc-about-street-1", setting: "image" }] },
    { key: "street-2", style: "photo", aspect: "3:4", prompt: "A small clothing studio with rolls of heavy cotton and garments on a rail, daylight, documentary", alt: "The studio with garments on a rail", targets: [{ page: "home", section: "oc-street", block: "oc-street-2", setting: "image" }, { page: "about", section: "oc-about-street", block: "oc-about-street-2", setting: "image" }] },
    { key: "about", style: "photo", aspect: "4:3", prompt: "Hands cutting heavy cotton fabric with shears on a cutting table, chalk marks, documentary", alt: "Cutting heavy cotton on the table", targets: [{ page: "about", section: "oc-about-intro", setting: "image" }] },
  ],
  bindings: [
    { page: "home", section: "oc-drop", setting: "products", kind: "products", why: "This drop's pieces from the shop. Empty shows the newest products." },
    { page: "contact", section: "oc-contact-write", setting: "form", kind: "form", why: "A contact or wholesale form, if the creator has one." },
    { page: "home", section: "oc-header", setting: "menu", kind: "menu", why: "The main menu." },
  ],
  design: {
    thesis: "Concrete grey ground, a black line across the screen with the pieces hung on it by pink pegs under a huge tight grotesk headline.",
    layout: ["Two pixel black rules everywhere: borders, a table of fit notes, the line itself", "Categories as a wall of huge words, every third one outlined", "The lookbook scrolls sideways and links each look to its piece", "Hard offset shadows on buttons only"],
    imagery: "Product shots hung on a line against a plain wall; street photographs of real people wearing it; never mannequins or 3D renders.",
    motion: "The pieces swing once on the line and settle; category photos follow the pointer; buttons press into their shadow.",
    signature: ["pieces hung on a line with pegs", "wall of huge category words", "shop the look lookbook", "black rule fit table"],
    avoid: ["glassmorphism", "purple gradients", "fake sold out counters", "invented press logos"],
  },
})
