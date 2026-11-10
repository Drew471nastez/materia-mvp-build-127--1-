/**
 * LOW END: a music producer's sample pack and drum kit store.
 *
 * Studio dark, one mint signal colour, wide display capitals with specs in
 * mono, a meter that moves in the first screen beside the featured pack
 * with its audio preview and buy button. Packs are rows you can listen to
 * (native players on the creator's own preview files, each row bound to a
 * real product), what is inside is a file tree, and buying is add to bag or
 * Buy now on the product's own checkout. Original work for Storelib
 * (round P, P2a), for producers selling sounds the way Loudlib's creators do.
 */
import { assemble } from "../kit/build"
import { footer, header } from "../kit/chrome"
import { BOX, DISPLAY, INNER, motion, place, rootAttrs, s, spacing, type ComponentDef } from "../kit/schema"
import { collage, collectionGrid, contact, cta, faq, marquee, pageIntro, productMain, productRail, reveal, statement, stickySteps } from "../kit/sections"
import type { SiteTemplate } from "../types"

const P = "ai_le_"
const MONO = "font-family: var(--theme-font-accent, var(--theme-font-body)), monospace;"
const WIDE = "text-transform: uppercase; font-weight: 700; letter-spacing: -0.02em;"

const meterCss = (cls: string, name: string) => `
.${cls} { display: flex; align-items: flex-end; gap: 3px; height: 100%; }
.${cls} span { flex: 1; min-width: 2px; height: var(--h, 50%); background: var(--s-accent); transform-origin: 50% 100%; }
.${cls} span:nth-child(3n) { --h: 82%; } .${cls} span:nth-child(3n + 1) { --h: 46%; } .${cls} span:nth-child(4n) { --h: 64%; } .${cls} span:nth-child(5n) { --h: 28%; } .${cls} span:nth-child(7n) { --h: 92%; }
@media (prefers-reduced-motion: no-preference) {
  [data-motion="site"] .${cls} span { animation: ${name} calc(var(--t-motion-duration, 850ms) * 1.1) ease-in-out infinite alternate; }
  [data-motion="site"] .${cls} span:nth-child(2n) { animation-delay: -0.3s; }
  [data-motion="site"] .${cls} span:nth-child(3n) { animation-delay: -0.55s; }
  [data-motion="site"] .${cls} span:nth-child(5n) { animation-delay: -0.8s; }
  @keyframes ${name} { from { transform: scaleY(0.25); } to { transform: scaleY(1); } }
}
@media (prefers-reduced-motion: reduce) { .${cls} span { animation: none; } }`
const BARS = Array.from({ length: 28 }, () => "<span></span>").join("")

const hero: ComponentDef = {
  type: `${P}hero`,
  name: "Opening, the featured pack",
  category: "hero",
  template: `
<section class="lo" ${rootAttrs({ motion: true })}>
  <div class="lo__in">
    <h1 class="lo__h">{{ settings.heading | raw }}</h1>
    <div class="lo__grid">
      <div class="lo__cover" data-storelib-motion="3d-tilt">
        {% if settings.image %}<img src="{{ settings.image | asset }}" alt="{{ settings.image_alt }}" width="1000" height="1000" fetchpriority="high">{% else %}<div class="lo__meter" aria-hidden="true">${BARS}</div>{% endif %}
      </div>
      <div class="lo__side">
        <div class="lo__text">{{ settings.text | raw }}</div>
        {% if settings.product.title %}
        <p class="lo__pack">{{ settings.product.title }} <span class="lo__price">{{ settings.product.price }}</span></p>
        {% else %}{% for p in products limit: 1 %}<p class="lo__pack">{{ p.settings.title }} <span class="lo__price">{{ p.settings.price }}</span></p>{% endfor %}
        {% endif %}
        {% if settings.preview %}<audio class="lo__audio" controls preload="none" src="{{ settings.preview | asset }}"></audio>{% endif %}
        <div class="lo__actions">
          {% if settings.product.id %}<button class="lo__btn" type="button" data-storelib-add-to-cart="{{ settings.product.id }}" data-title="{{ settings.product.title }}" data-price="{{ settings.product.price }}" data-url="{{ settings.product.url }}">{{ settings.add_label }}</button>{% else %}{% for p in products limit: 1 %}<button class="lo__btn" type="button" data-storelib-add-to-cart="{{ p.id }}" data-title="{{ p.settings.title }}" data-price="{{ p.settings.price }}" data-url="{{ p.settings.url }}">{{ settings.add_label }}</button>{% endfor %}{% endif %}
          <a class="lo__link" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
        </div>
        <dl class="lo__specs">{% for block in section.blocks %}<div class="lo__spec" {{ block.shopify_attributes }}><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}</dl>
      </div>
    </div>
  </div>
</section>`,
  style: `
.lo { ${BOX} overflow: hidden; }
.lo__in { ${INNER} }
.lo__h { margin: 0 0 clamp(24px, 4vw, 56px); ${DISPLAY} ${WIDE} font-size: clamp(2.5rem, 0.8rem + 9.5cqi, 9.5rem); line-height: 0.86; overflow-wrap: anywhere; }
.lo__h em { font-style: normal; color: var(--s-accent); }
.lo__grid { display: grid; gap: clamp(20px, 4vw, 48px); }
.lo__cover { position: relative; aspect-ratio: 1; overflow: hidden; background: var(--s-surface); border: 1px solid var(--s-border); }
.lo__cover img { width: 100%; height: 100%; object-fit: cover; }
.lo__meter { padding: 18% 10% 10%; }
${meterCss("lo__meter", "ai_le_hero_meter")}
.lo__side { display: grid; gap: 18px; align-content: end; }
.lo__text { max-width: 30rem; font-size: 1.125rem; line-height: 1.55; color: var(--s-muted); }
.lo__text p { margin: 0; }
.lo__pack { margin: 0; ${DISPLAY} ${WIDE} font-size: clamp(1.25rem, 1rem + 1.4cqi, 2rem); }
.lo__price { ${MONO} color: var(--s-accent); font-size: 0.75em; }
.lo__audio { width: 100%; max-width: 460px; height: 44px; }
.lo__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 20px; }
.lo__btn { min-height: 56px; padding: 0 28px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; ${WIDE} font-size: 0.9375rem; cursor: pointer; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.lo__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.lo__btn:active { transform: scale(0.98); }
.lo__link { display: inline-flex; align-items: center; min-height: 44px; color: inherit; ${MONO} font-size: 0.875rem; text-underline-offset: 5px; }
.lo__specs { display: flex; flex-wrap: wrap; gap: 1px; margin: 0; background: var(--s-border); border: 1px solid var(--s-border); }
.lo__spec { flex: 1 1 110px; padding: 12px; background: var(--s-bg); }
.lo__spec dt { ${MONO} font-size: 0.6875rem; color: var(--s-muted); text-transform: uppercase; }
.lo__spec dd { margin: 4px 0 0; ${MONO} font-size: 1rem; }
@container (min-width: 900px) { .lo__grid { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); align-items: stretch; } }`,
  settings: [
    s.inline("heading", "Heading", "Drums that <em>hit</em> before the mix"),
    s.rich("text", "Text", "<p>Sample packs and drum kits made in a small studio, processed and named so you can find a sound in seconds.</p>"),
    s.product("product", "Featured pack (empty: the newest product)"),
    s.file("preview", "Audio preview", ["audio"]),
    s.text("add_label", "Add to bag button", "Add to bag"),
    s.text("cta_label", "Link", "Hear every pack"),
    s.url("cta_url", "Link goes to", "/products"),
    s.image("image", "Pack cover"),
    s.text("image_alt", "Cover description", ""),
    s.scheme("site"),
    ...motion(),
    ...spacing(56, 96),
  ],
  blocks: [{ type: "spec", name: "Spec", limit: 3, settings: [s.text("label", "Label", "Format"), s.text("value", "Value", "WAV")] }],
  maxBlocks: 3,
  preset: [
    { type: "spec", settings: { label: "Format", value: "24 bit WAV" } },
    { type: "spec", settings: { label: "Tempo", value: "Labelled" } },
    { type: "spec", settings: { label: "Key", value: "Labelled" } },
  ],
}

const packs: ComponentDef = {
  type: `${P}packs`,
  name: "Packs you can listen to",
  category: "product",
  template: `
<section class="pk" ${rootAttrs({ motion: true })}>
  <div class="pk__in">
    <div class="pk__head"><h2 class="pk__h">{{ settings.heading | raw }}</h2><div class="pk__text">{{ settings.text | raw }}</div></div>
    <ol class="pk__list" data-storelib-motion="reveal-stagger">
      {% for block in section.blocks %}
      <li class="pk__row" {{ block.shopify_attributes }}>
        <span class="pk__cover">{% if block.settings.product.image %}<img src="{{ block.settings.product.image }}" alt="{{ block.settings.product.title }}" width="160" height="160" loading="lazy">{% else %}<span class="pk__meter" aria-hidden="true">${BARS.slice(0, 13 * 13)}</span>{% endif %}</span>
        <span class="pk__main">
          <span class="pk__name">{{ block.settings.product.title | default: block.settings.name }}</span>
          <span class="pk__meta">{{ block.settings.genre }}</span>
        </span>
        <span class="pk__play">{% if block.settings.preview %}<audio controls preload="none" src="{{ block.settings.preview | asset }}" aria-label="{{ settings.preview_label }} {{ block.settings.product.title | default: block.settings.name }}"></audio>{% endif %}</span>
        <span class="pk__buy">
          {% if block.settings.product.id %}
          <span class="pk__price">{{ block.settings.product.price }}</span>
          <button class="pk__add" type="button" data-storelib-add-to-cart="{{ block.settings.product.id }}" data-title="{{ block.settings.product.title }}" data-price="{{ block.settings.product.price }}" data-url="{{ block.settings.product.url }}">{{ settings.add_label }}</button>
          {% else %}
          <a class="pk__more" href="{{ settings.shop_url | url }}">{{ settings.shop_label }}</a>
          {% endif %}
        </span>
      </li>
      {% endfor %}
    </ol>
  </div>
</section>`,
  style: `
.pk { ${BOX} }
.pk__in { ${INNER} }
.pk__head { display: grid; gap: 12px; margin-bottom: clamp(24px, 4vw, 48px); }
.pk__h { margin: 0; ${DISPLAY} ${WIDE} font-size: clamp(2rem, 1rem + 5cqi, 5.5rem); line-height: 0.9; }
.pk__text { max-width: 34rem; color: var(--s-muted); line-height: 1.6; }
.pk__text p { margin: 0; }
.pk__list { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.pk__row { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px 16px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--s-border); transition: background-color var(--t-motion-hover, 200ms) ease; }
.pk__cover { width: 64px; height: 64px; overflow: hidden; background: var(--s-surface); }
.pk__cover img { width: 100%; height: 100%; object-fit: cover; }
.pk__meter { padding: 12px 8px 8px; }
${meterCss("pk__meter", "ai_le_packs_meter")}
.pk__main { display: grid; gap: 2px; min-width: 0; }
.pk__name { ${DISPLAY} ${WIDE} font-size: clamp(1.125rem, 1rem + 1cqi, 1.625rem); overflow-wrap: anywhere; }
.pk__meta { ${MONO} font-size: 0.8125rem; color: var(--s-muted); }
.pk__play { grid-column: 1 / -1; }
.pk__play audio { width: 100%; height: 40px; }
.pk__buy { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pk__price { ${MONO} color: var(--s-accent); }
.pk__add, .pk__more { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border: 1px solid var(--s-accent); background: none; color: var(--s-text); font: inherit; ${MONO} font-size: 0.8125rem; text-decoration: none; cursor: pointer; }
.pk__add:hover, .pk__more:hover { background: var(--s-accent); color: var(--s-bg); }
@media (hover: hover) and (pointer: fine) { .pk__row:hover { background: var(--s-surface); } }
@container (min-width: 900px) {
  .pk__row { grid-template-columns: 72px minmax(0, 3fr) minmax(0, 3fr) auto; padding: 12px 12px 12px 0; }
  .pk__cover { width: 72px; height: 72px; }
  .pk__play, .pk__buy { grid-column: auto; }
  .pk__buy { justify-content: flex-end; }
}`,
  settings: [
    s.inline("heading", "Heading", "Every pack, with a preview"),
    s.rich("text", "Text", "<p>Press play on any row. Every sound is named with its tempo and key so it drops straight into a session.</p>"),
    s.text("add_label", "Add to bag button", "Add to bag"),
    s.text("preview_label", "Preview (read aloud)", "Preview of"),
    s.text("shop_label", "Link when no product is chosen", "In the shop"),
    s.url("shop_url", "That link goes to", "/products"),
    s.scheme("site"),
    ...motion(),
    ...spacing(96, 96),
  ],
  blocks: [
    {
      type: "pack",
      name: "Pack",
      limit: 12,
      settings: [s.product("product", "Product"), s.text("name", "Name until a product is chosen", "Drum kit"), s.text("genre", "Genre and tempo", "Trap, 130 to 160 BPM"), s.file("preview", "Audio preview", ["audio"])],
    },
  ],
  maxBlocks: 12,
  preset: [
    { type: "pack", settings: { product: "", name: "Night drums", genre: "Trap and drill, 130 to 160 BPM", preview: "" } },
    { type: "pack", settings: { product: "", name: "Warehouse kit", genre: "House and garage, 120 to 132 BPM", preview: "" } },
    { type: "pack", settings: { product: "", name: "Dust loops", genre: "Lo-fi and boom bap, 80 to 95 BPM", preview: "" } },
    { type: "pack", settings: { product: "", name: "Low end one shots", genre: "808s and sub bass, every key", preview: "" } },
  ],
}

const inside: ComponentDef = {
  type: `${P}inside`,
  name: "What is inside, as a file tree",
  category: "text",
  template: `
<section class="in" ${rootAttrs({ motion: true })}>
  <div class="in__in">
    <div class="in__head"><h2 class="in__h">{{ settings.heading | raw }}</h2><div class="in__text">{{ settings.text | raw }}</div></div>
    <div class="in__tree" role="list">
      <p class="in__root">{{ settings.root }}</p>
      {% for block in section.blocks %}
      <div class="in__folder" role="listitem" {{ block.shopify_attributes }}><span class="in__name">{{ block.settings.name }}</span><span class="in__detail">{{ block.settings.detail }}</span></div>
      {% endfor %}
    </div>
  </div>
</section>`,
  style: `
.in { ${BOX} }
.in__in { display: grid; gap: clamp(24px, 4vw, 64px); ${INNER} }
.in__h { margin: 0 0 12px; ${DISPLAY} ${WIDE} font-size: clamp(2rem, 1rem + 4.5cqi, 5rem); line-height: 0.9; }
.in__text { max-width: 30rem; color: var(--s-muted); line-height: 1.6; }
.in__text p { margin: 0; }
.in__tree { padding: clamp(16px, 3vw, 28px); background: var(--s-surface); border: 1px solid var(--s-border); ${MONO} font-size: 0.875rem; overflow-x: auto; }
.in__root { margin: 0 0 8px; color: var(--s-accent); }
.in__folder { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; padding: 8px 0 8px 22px; border-left: 1px solid var(--s-border); position: relative; }
.in__folder::before { content: ""; position: absolute; left: 0; top: 1.15em; width: 14px; border-top: 1px solid var(--s-border); }
.in__name { color: var(--s-text); }
.in__detail { color: var(--s-muted); }
@container (min-width: 900px) { .in__in { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); align-items: start; } .in__folder { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); } }
${reveal(".in", ".in__folder", "ai_le_inside_in")}`,
  settings: [s.inline("heading", "Heading", "What is in the folder"), s.rich("text", "Text", "<p>Every pack unzips into the same tidy tree, so you always know where the kicks are.</p>"), s.text("root", "Top folder name", "Pack name / "), s.scheme("site"), ...motion(), ...spacing(96, 96)],
  blocks: [{ type: "folder", name: "Folder", limit: 10, settings: [s.text("name", "Folder", "Kicks /"), s.text("detail", "What is in it", "Tuned, named with their key")] }],
  maxBlocks: 10,
  preset: [
    { type: "folder", settings: { name: "Kicks /", detail: "Tuned and named with their key" } },
    { type: "folder", settings: { name: "Snares and claps /", detail: "Dry and with room" } },
    { type: "folder", settings: { name: "Hats and percs /", detail: "One shots and short loops" } },
    { type: "folder", settings: { name: "808s /", detail: "Long tails, clean starts" } },
    { type: "folder", settings: { name: "Loops /", detail: "Tempo and key in every file name" } },
    { type: "folder", settings: { name: "MIDI /", detail: "The melodies behind the loops" } },
  ],
}

const head = header({
  type: `${P}header`,
  layout: "minimal",
  drawer: "full",
  cart: "side",
  scroll: "hide",
  phoneBar: true,
  words: { brand: "Studio", cart: "Bag", menu: "Menu", searchHint: "Search packs, kits, genres", empty: "No sounds in your bag yet." },
  notices: ["Instant download after checkout", "Every file named with tempo and key"],
  features: [
    { title: "All packs", text: "Drum kits, loops and one shots", url: "/products" },
    { title: "How downloads work", text: "Straight after checkout", url: "/about" },
  ],
  skin: `.hd__logo { ${WIDE} font-size: 1.25rem; } .hd__top { ${MONO} font-size: 0.8125rem; } .hd__mlink, .hd__msum, .hd__mega-all { ${WIDE} }`,
})
const foot = footer({
  type: `${P}footer`,
  layout: "wordmark",
  scheme: "site",
  words: { brand: "Studio", newsHeading: "Free sounds, now and then", newsText: "<p>When a new pack lands, the list hears first, sometimes with a few free one shots.</p>", legal: "Sounds made in a small studio.", subscribe: "Sign up" },
  columns: [
    { heading: "Sounds", menu: "main-menu" },
    { heading: "Help", menu: "footer" },
  ],
  notes: [{ heading: "Downloads", text: "<p>Links arrive by email straight after checkout and stay in your account.</p>" }],
  skin: `.ft { border-top: 1px solid var(--s-border); } .ft__mark { ${WIDE} color: var(--s-accent); } .ft__h { ${WIDE} }`,
})
const band = marquee({ type: `${P}band`, scheme: "site_inverse", items: ["Trap", "House", "Drill", "Lo-fi", "Garage", "Afro"], speed: 22, skin: `.mq__item { ${WIDE} } .mq__item:nth-child(even) { color: inherit; opacity: 0.55; }` })
const rail = productRail({
  type: `${P}shop`,
  name: "From the shop",
  words: { heading: "New in the shop", text: "<p>The newest packs and kits, straight from the store.</p>", add: "Add to bag" },
  tiles: [{ title: "Every pack", text: "Search by genre, tempo or name.", label: "Open the shop", url: "/products" }],
  count: 6,
  skin: `.pr__h, .pr__tile-title, .pr__card-stand { ${WIDE} } .pr__card-price { ${MONO} color: var(--s-accent); } .pr__card-add { ${MONO} font-weight: 400; }`,
})
const steps = stickySteps({
  type: `${P}steps`,
  name: "From checkout to your session",
  words: { heading: "From checkout to your session", text: "<p>No waiting, no account needed to start.</p>" },
  steps: [
    { title: "Pick a pack", text: "<p>Listen to the preview, add it to your bag.</p>" },
    { title: "Check out", text: "<p>The download link arrives by email straight away.</p>" },
    { title: "Unzip", text: "<p>The same tidy folders every time, files named with tempo and key.</p>" },
    { title: "Drop it in", text: "<p>Drag into any DAW and start.</p>" },
  ],
  skin: `.sp__h, .sp__title { ${WIDE} } .sp__n { ${MONO} font-weight: 400; }`,
})
const creed = statement({
  type: `${P}creed`,
  name: "The idea",
  scheme: "site",
  lines: [
    { text: "Less digging.", accent: false },
    { text: "More making.", accent: true },
  ],
  note: "<p>Every sound is processed, tuned and named so you spend the session writing, not scrolling folders.</p>",
  skin: `.st__lines { ${WIDE} font-size: clamp(2.5rem, 0.8rem + 10cqi, 10rem); line-height: 0.86; }`,
})
const studio = collage({
  type: `${P}studio`,
  name: "In the studio",
  words: { heading: "Where it gets made", text: "<p>Drum machines, a lot of cables, and late nights.</p>" },
  photos: [
    { caption: "The desk", size: "wide" },
    { caption: "Drum machine", size: "tall" },
    { caption: "Tape", size: "square" },
    { caption: "Late session", size: "square" },
  ],
  skin: `.cl__h { ${WIDE} } .cl__cap { ${MONO} font-size: 0.75rem; }`,
})
const questions = faq({
  type: `${P}faq`,
  words: { heading: "Before you buy", text: "<p>Licence, formats and downloads.</p>" },
  items: [
    { q: "Can I use the sounds in released music?", a: "<p>The licence that comes in every download says exactly what you can do. Read it in the pack, or ask before you buy.</p>" },
    { q: "Which formats?", a: "<p>24 bit WAV for audio, MIDI files for melodies where the pack has them.</p>" },
    { q: "Do they work in my DAW?", a: "<p>Yes. WAV and MIDI open in every DAW.</p>" },
    { q: "I lost my download link.", a: "<p>Sign in to your account and download it again, or write to us with your order email.</p>" },
  ],
  skin: `.fq__h { ${WIDE} }`,
})
const close = cta({
  type: `${P}close`,
  scheme: "site_inverse",
  words: { heading: "Make something tonight", text: "<p>Pick a pack, and it is in your session in a minute.</p>" },
  actions: [
    { label: "Shop all packs", url: "/products", style: "solid" },
    { label: "Get free sounds", url: "/contact", style: "line" },
  ],
  skin: `.cc__h { ${WIDE} } .cc__btn { ${MONO} }`,
})
const intro = pageIntro({
  type: `${P}intro`,
  words: { heading: "Made in a small studio", text: "<p>One producer, a room of drum machines, and sounds made to be used, not admired.</p>" },
  facts: [
    { label: "Formats", value: "WAV and MIDI" },
    { label: "Delivery", value: "Instant download" },
  ],
  skin: `.pi__h { ${WIDE} } .pi__fact dd { ${MONO} }`,
})
const write = contact({
  type: `${P}write`,
  name: "Write to the studio",
  words: { heading: "Get in touch", text: "<p>Download trouble, custom kits or a collaboration. Replies within two working days.</p>", name: "Name", email: "Email", message: "Message", send: "Send" },
  details: [
    { label: "Downloads", value: "Include your order email", url: "" },
    { label: "Custom kits", value: "Tell us the sound you are after", url: "" },
  ],
  skin: `.ct__h { ${WIDE} } .ct__send { ${MONO} }`,
})
const product = productMain({
  type: `${P}product`,
  words: { kicker: "Sample pack", add: "Add to bag", buy: "Buy now", options: "Choose a version" },
  details: [
    { title: "What is inside", text: "<p>The full list is in the description above. Every file is named with its tempo and key.</p>" },
    { title: "Download", text: "<p>Straight after checkout, by email and in your account.</p>" },
    { title: "Licence", text: "<p>Included in the download. It says exactly how you can use the sounds.</p>" },
  ],
  skin: `.pd__title, .pd__stand-word { ${WIDE} } .pd__price { ${MONO} color: var(--s-accent); } .pd__option { ${MONO} }`,
})
const list = collectionGrid({
  type: `${P}list`,
  words: { heading: "All packs", intro: "<p>Drum kits, loops and one shots, newest first.</p>", results: "Results for", empty: "Nothing here yet. Try another word.", add: "Add to bag" },
  notes: ["Instant download", "WAV and MIDI", "Named with tempo and key"],
  columns: 4,
  skin: `.cg__h, .cg__card-stand { ${WIDE} } .cg__card-price, .cg__notes { ${MONO} } .cg__card-price { color: var(--s-accent); }`,
})

const components = [head, foot, hero, band, packs, inside, rail, steps, creed, studio, questions, close, intro, write, product, list]
const H = place(head, "le-header", { group: "header" })
const F = place(foot, "le-footer", { group: "footer" })

export const lowEnd: SiteTemplate = assemble({
  id: "low-end-samples",
  name: "Low End",
  summary: "Music producer's sample pack and drum kit store: studio dark with a moving meter, the featured pack with its audio preview and buy button, packs as rows you can listen to, the folder tree of what is inside.",
  industries: ["music-producer", "music-artist", "creator"],
  stories: ["sample-pack-store"],
  styles: ["dark-cinematic", "industrial", "y2k"],
  directionIds: ["dark-immersive", "technical-industrial", "y2k", "product-led"],
  keywords: ["sample pack", "sample packs", "drum kit", "drum kits", "producer", "beats", "loops", "presets", "one shots", "808", "beatmaker"],
  motion: "expressive",
  prefix: "le",
  components,
  header: H,
  footer: F,
  tokens: {
    colors: { background: "#09090b", surface: "#141418", text: "#f1f1f3", muted: "#9d9da8", accent: "#3df2c9", accentText: "#09090b", border: "#27272e", inverse: { background: "#3df2c9", text: "#09090b", accent: "#09090b" } },
    fonts: { heading: "Unbounded", body: "Work Sans", accent: "Space Mono" },
    typeScale: { base: 16, ratio: 1.5 },
    radius: { small: 0, medium: 0, large: 0 },
    spacing: { scale: 1, sectionY: 96, pageWidth: 1400, gutter: 20 },
    motion: { level: "expressive", tier: "expressive" },
    shadow: "none",
  },
  menus: {
    "main-menu": {
      title: "Main menu",
      links: [
        { title: "Packs", url: "/products", links: [{ title: "All packs", url: "/products" }, { title: "Search sounds", url: "/search" }] },
        { title: "About", url: "/about" },
        { title: "Contact", url: "/contact" },
      ],
    },
    footer: { title: "Footer", links: [{ title: "All packs", url: "/products" }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Search", url: "/search" }] },
  },
  pages: [
    {
      key: "home",
      title: "Home",
      sections: [place(hero, "le-hero"), place(band, "le-band"), place(packs, "le-packs"), place(inside, "le-inside"), place(rail, "le-shop"), place(steps, "le-steps"), place(creed, "le-creed"), place(studio, "le-studio"), place(questions, "le-faq"), place(close, "le-close")],
    },
    {
      key: "about",
      title: "About",
      seo: { title: "About the studio", description: "Who makes the sounds, how they are made and how downloads work." },
      sections: [place(intro, "le-about-intro"), place(creed, "le-about-creed"), place(studio, "le-about-studio"), place(inside, "le-about-inside"), place(steps, "le-about-steps"), place(close, "le-about-close")],
    },
    {
      key: "contact",
      title: "Contact",
      seo: { title: "Contact the studio", description: "Download help, custom kits and collaborations." },
      sections: [place(write, "le-contact-write"), place(questions, "le-contact-faq"), place(close, "le-contact-close")],
    },
    { key: "product", title: "Product", sections: [place(product, "le-product"), place(inside, "le-product-inside"), place(rail, "le-product-more", { settings: { heading: "More packs" } })] },
    { key: "collection", title: "Collection", sections: [place(list, "le-collection"), place(close, "le-collection-close")] },
    { key: "products", title: "Shop", sections: [place(list, "le-all"), place(questions, "le-all-faq")] },
    { key: "search", title: "Search", sections: [place(list, "le-search", { settings: { heading: "Search" } })] },
  ],
  imageSlots: [
    { key: "cover", style: "product", aspect: "1:1", prompt: "Square album style cover art for a drum kit sample pack: an analog drum machine photographed from above under hard coloured light on black, graphic, no text", alt: "Cover of the featured pack", targets: [{ page: "home", section: "le-hero", setting: "image" }] },
    { key: "studio-1", style: "photo", aspect: "16:9", prompt: "A small home music studio desk at night with a laptop running a DAW, a MIDI keyboard and monitors, cinematic, dark with one cool light", alt: "The studio desk at night", targets: [{ page: "home", section: "le-studio", block: "le-studio-1", setting: "image" }, { page: "about", section: "le-about-studio", block: "le-about-studio-1", setting: "image" }] },
    { key: "studio-2", style: "photo", aspect: "3:4", prompt: "Close up of hands playing pads on a drum machine, motion, dark studio, coloured pad lights", alt: "Hands on the drum machine pads", targets: [{ page: "home", section: "le-studio", block: "le-studio-2", setting: "image" }, { page: "about", section: "le-about-studio", block: "le-about-studio-2", setting: "image" }] },
    { key: "studio-3", style: "photo", aspect: "1:1", prompt: "A reel to reel tape machine with tape running, macro, moody", alt: "Tape running on a reel to reel", targets: [{ page: "home", section: "le-studio", block: "le-studio-3", setting: "image" }, { page: "about", section: "le-about-studio", block: "le-about-studio-3", setting: "image" }] },
    { key: "studio-4", style: "photo", aspect: "1:1", prompt: "A producer wearing headphones late at night in a dark room lit by a screen, candid", alt: "A late session in headphones", targets: [{ page: "home", section: "le-studio", block: "le-studio-4", setting: "image" }, { page: "about", section: "le-about-studio", block: "le-about-studio-4", setting: "image" }] },
    { key: "about", style: "photo", aspect: "4:3", prompt: "A wall of synthesizers and drum machines with patch cables in a small studio, dark, cinematic", alt: "Synths and drum machines on the wall", targets: [{ page: "about", section: "le-about-intro", setting: "image" }] },
  ],
  bindings: [
    { page: "home", section: "le-hero", setting: "product", kind: "product", why: "The featured pack: title, price and the add to bag button. Add its audio preview in the same section." },
    { page: "home", section: "le-shop", setting: "products", kind: "products", why: "The newest packs from the shop." },
    { page: "home", section: "le-header", setting: "menu", kind: "menu", why: "The main menu." },
  ],
  design: {
    thesis: "Studio dark, a wide display headline across the top, the featured pack's cover beside a meter that moves, its audio preview and the buy button in the first screen.",
    layout: ["Packs as listenable rows: cover, name, genre and tempo, a native player, price and add to bag", "What is inside as a folder tree in mono", "One mint signal colour for prices and actions", "Specs as a hairline grid in mono"],
    imagery: "Real gear and real sessions in low light: drum machines, tape, a desk at night; pack covers as graphic photographs, never stock DJ crowds.",
    motion: "The meter moves gently until the visitor asked for less motion; rows light up on hover; the genre band runs fast.",
    signature: ["moving meter", "listenable pack rows", "folder tree", "mono specs"],
    avoid: ["purple neon gradients", "fake play counts", "invented artist endorsements"],
  },
})
