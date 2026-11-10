/**
 * CALIBRE: a luxury product (a watch or jewellery house).
 *
 * Near black, a champagne accent and high contrast Bodoni capitals at
 * poster size. The first screen cuts the type with the product: a huge word,
 * the watch laid over it, and the lower half of the word drawn again on top,
 * so the piece sits threaded through the letters; on scroll the letters part.
 * Then the story told in chapters while the picture stays (scroll
 * storytelling), an annotated macro photograph, a specification sheet,
 * the collection from the shop and a private viewing booked on the real form.
 * Original work for Storelib (round P, P2a).
 */
import { assemble } from "../kit/build"
import { footer, header } from "../kit/chrome"
import { BOX, DISPLAY, INNER, motion, place, rootAttrs, s, spacing, type ComponentDef } from "../kit/schema"
import { collage, collectionGrid, contact, cta, faq, marquee, pageIntro, productMain, productRail, reveal, statement } from "../kit/sections"
import type { SiteTemplate } from "../types"

const P = "ai_lx_"
const CAPS = "text-transform: uppercase; letter-spacing: 0.01em; font-weight: 500;"
const LABEL = "font-size: 0.75rem; letter-spacing: 0.22em; text-transform: uppercase;"

/** A watch drawn in CSS: the designed stand-in until the real photograph is there. */
const DIAL = (cls: string) => `
.${cls} { position: relative; display: block; width: 100%; aspect-ratio: 1; border-radius: 50%; border: 2px solid var(--s-accent); background: radial-gradient(circle at 50% 50%, var(--s-surface) 0 58%, transparent 58.5%), repeating-conic-gradient(var(--s-accent) 0 0.6deg, transparent 0.6deg 30deg); box-shadow: inset 0 0 0 10px var(--s-bg); }
.${cls}::before, .${cls}::after { content: ""; position: absolute; left: 50%; bottom: 50%; width: 2px; background: var(--s-text); transform-origin: 50% 100%; }
.${cls}::before { height: 30%; transform: translateX(-50%) rotate(-58deg); }
.${cls}::after { height: 40%; width: 1px; background: var(--s-accent); transform: translateX(-50%) rotate(72deg); }`

const hero: ComponentDef = {
  type: `${P}hero`,
  name: "Opening, the piece through the type",
  category: "hero",
  template: `
<section class="cx" ${rootAttrs({ motion: true })}>
  <div class="cx__stage" data-storelib-motion="scroll-scrub" data-motion-strength="{{ settings.motion_strength }}">
    <p class="cx__word cx__word--back" aria-hidden="true">{{ settings.word }}</p>
    <div class="cx__object">
      {% if settings.image %}<img class="cx__img" src="{{ settings.image | asset }}" alt="{{ settings.image_alt }}" width="1200" height="1200" fetchpriority="high">{% else %}<span class="cx__dial" aria-hidden="true"></span>{% endif %}
    </div>
    <p class="cx__word cx__word--front" aria-hidden="true">{{ settings.word }}</p>
  </div>
  <div class="cx__copy">
    <h1 class="cx__h">{{ settings.heading | raw }}</h1>
    <div class="cx__text">{{ settings.text | raw }}</div>
    <div class="cx__actions">
      <a class="cx__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
      {% if settings.cta2_label %}<a class="cx__link" href="{{ settings.cta2_url | url }}">{{ settings.cta2_label }}</a>{% endif %}
    </div>
    <dl class="cx__facts">{% for block in section.blocks %}<div class="cx__fact" {{ block.shopify_attributes }}><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}</dl>
  </div>
</section>`,
  style: `
.cx { ${BOX} overflow: hidden; }
.cx__stage { position: relative; display: grid; place-items: center; min-height: clamp(320px, 62cqi, 760px); ${INNER} }
.cx__word { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; ${DISPLAY} ${CAPS} font-size: min(27cqi, 26rem); line-height: 0.8; white-space: nowrap; pointer-events: none; }
.cx__word--front { clip-path: inset(56% 0 0 0); z-index: 2; }
.cx__object { position: relative; z-index: 1; width: clamp(180px, 40cqi, 520px); }
.cx__img { display: block; width: 100%; height: auto; aspect-ratio: 1; object-fit: contain; filter: drop-shadow(0 30px 40px rgb(0 0 0 / 0.55)); }
${DIAL("cx__dial")}
.cx__copy { display: grid; gap: 18px; margin-top: clamp(24px, 4vw, 56px); text-align: center; justify-items: center; ${INNER} }
.cx__h { margin: 0; max-width: 22ch; ${DISPLAY} font-size: clamp(1.75rem, 1.1rem + 2.6cqi, 3.25rem); line-height: 1.05; font-weight: 400; }
.cx__text { max-width: 34rem; color: var(--s-muted); line-height: 1.7; }
.cx__text p { margin: 0; }
.cx__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 24px; align-items: center; }
.cx__btn { display: inline-flex; align-items: center; min-height: 54px; padding: 0 32px; border: 1px solid var(--s-accent); background: var(--s-btn); color: var(--s-btn-text); ${LABEL} text-decoration: none; transition: background-color var(--t-motion-hover, 240ms) ease, color var(--t-motion-hover, 240ms) ease; }
.cx__btn:hover { background: transparent; color: var(--s-accent); }
.cx__link { display: inline-flex; align-items: center; min-height: 44px; color: inherit; ${LABEL} text-underline-offset: 6px; }
.cx__facts { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 40px; margin: 12px 0 0; padding-top: 18px; border-top: 1px solid var(--s-border); }
.cx__fact dt { ${LABEL} color: var(--s-muted); }
.cx__fact dd { margin: 6px 0 0; ${DISPLAY} font-size: 1.375rem; }
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .cx:not([data-motion="off"]) .cx__word--back { animation: ai_lx_hero_part linear both; animation-timeline: view(); animation-range: exit 0% exit 90%; }
    .cx:not([data-motion="off"]) .cx__word--front { animation: ai_lx_hero_part linear both; animation-timeline: view(); animation-range: exit 0% exit 90%; }
    .cx:not([data-motion="off"]) .cx__object { animation: ai_lx_hero_turn linear both; animation-timeline: view(); animation-range: exit 0% exit 100%; }
    @keyframes ai_lx_hero_part { to { transform: scale(calc(1 + 0.12 * var(--m-k, 1))); opacity: 0.35; } }
    @keyframes ai_lx_hero_turn { to { transform: translateY(calc(-8% * var(--m-k, 1))) rotate(calc(-14deg * var(--m-k, 1))); } }
  }
}
@media (prefers-reduced-motion: no-preference) {
  .cx:not([data-motion="off"]) .cx__copy { animation: ai_lx_hero_in calc(var(--t-motion-duration, 850ms) * 1.4) var(--t-motion-ease, ease) both; }
  @keyframes ai_lx_hero_in { from { opacity: 0; transform: translateY(var(--t-motion-distance, 24px)); } }
}`,
  settings: [
    s.text("word", "Word behind the piece", "Hours"),
    s.inline("heading", "Heading", "Mechanical watches, assembled and finished by hand"),
    s.rich("text", "Text", "<p>A small number of pieces each year, each one regulated, tested and signed off by the person who built it.</p>"),
    s.text("cta_label", "Button", "See the collection"),
    s.url("cta_url", "Button link", "/products"),
    s.text("cta2_label", "Second link", "Book a private viewing"),
    s.url("cta2_url", "Second link goes to", "/contact"),
    s.header("hdr_piece", "The piece"),
    s.image("image", "Photo of the piece, on a plain or clear ground"),
    s.text("image_alt", "Photo description", ""),
    s.scheme("site"),
    ...motion(),
    ...spacing(56, 96),
  ],
  blocks: [{ type: "fact", name: "Fact", limit: 4, settings: [s.text("label", "Label", "Case"), s.text("value", "Value", "Steel")] }],
  maxBlocks: 4,
  preset: [
    { type: "fact", settings: { label: "Case", value: "Steel" } },
    { type: "fact", settings: { label: "Movement", value: "Hand wound" } },
    { type: "fact", settings: { label: "Made", value: "In small numbers" } },
  ],
}

const story: ComponentDef = {
  type: `${P}story`,
  name: "The story in chapters",
  category: "text",
  template: `
<section class="lc" ${rootAttrs({ motion: true })}>
  <div class="lc__in">
    <h2 class="lc__h">{{ settings.heading | raw }}</h2>
    <div class="lc__grid">
      <div class="lc__media" aria-hidden="true" data-storelib-motion="scroll-scrub">
        {% for block in section.blocks %}{% if block.settings.image %}<img class="lc__pic" style="animation-timeline: --lc{{ forloop.index }};" src="{{ block.settings.image | asset }}" alt="" width="1200" height="1500" loading="lazy">{% endif %}{% endfor %}
        <span class="lc__dial"></span>
      </div>
      <ol class="lc__chapters">
        {% for block in section.blocks %}
        <li class="lc__chapter" style="view-timeline-name: --lc{{ forloop.index }};" {{ block.shopify_attributes }}>
          <p class="lc__n">{{ block.settings.label }}</p>
          <h3 class="lc__title">{{ block.settings.title }}</h3>
          <div class="lc__text">{{ block.settings.text | raw }}</div>
          {% if block.settings.image %}<img class="lc__inline" src="{{ block.settings.image | asset }}" alt="{{ block.settings.image_alt }}" width="1200" height="1500" loading="lazy">{% endif %}
        </li>
        {% endfor %}
      </ol>
    </div>
  </div>
</section>`,
  style: `
.lc { ${BOX} }
.lc__in { ${INNER} }
.lc__h { margin: 0 0 clamp(32px, 6vw, 80px); max-width: 16ch; ${DISPLAY} ${CAPS} font-size: clamp(2.25rem, 1rem + 6cqi, 6rem); line-height: 0.92; }
.lc__media { display: none; }
.lc__chapters { display: grid; gap: clamp(48px, 9vw, 96px); margin: 0; padding: 0; list-style: none; }
.lc__n { margin: 0 0 10px; ${LABEL} color: var(--s-accent); }
.lc__title { margin: 0 0 14px; ${DISPLAY} font-size: clamp(1.75rem, 1.1rem + 2.4cqi, 3rem); line-height: 1.02; font-weight: 400; }
.lc__text { max-width: 30rem; color: var(--s-muted); line-height: 1.75; }
.lc__text p { margin: 0 0 10px; }
.lc__inline { display: block; width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; margin-top: 22px; }
@supports (animation-timeline: view()) and (timeline-scope: none) {
  @media (prefers-reduced-motion: no-preference) {
    @container (min-width: 900px) {
      .lc:not([data-motion="off"]) .lc__in { timeline-scope: --lc1, --lc2, --lc3, --lc4; }
      .lc:not([data-motion="off"]) .lc__grid { display: grid; grid-template-columns: minmax(0, 6fr) minmax(0, 5fr); gap: clamp(40px, 6vw, 112px); align-items: start; }
      .lc:not([data-motion="off"]) .lc__media { display: block; position: sticky; top: 10svh; height: 80svh; overflow: hidden; background: var(--s-surface); }
      .lc:not([data-motion="off"]) .lc__pic { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; object-fit: cover; opacity: 0; animation: ai_lx_story_show linear both; animation-range: cover 20% cover 80%; }
      .lc:not([data-motion="off"]) .lc__dial { position: absolute; left: 50%; top: 50%; width: 46%; aspect-ratio: 1; transform: translate(-50%, -50%); }
      .lc:not([data-motion="off"]) .lc__inline { display: none; }
      .lc:not([data-motion="off"]) .lc__chapter { min-height: 80svh; display: flex; flex-direction: column; justify-content: center; }
      @keyframes ai_lx_story_show { 0% { opacity: 0; transform: scale(calc(1 + (var(--t-motion-scale, 1.06) - 1) * 0.6)); } 22%, 78% { opacity: 1; transform: none; } 100% { opacity: 0; } }
    }
  }
}
${DIAL("lc__dial")}`,
  settings: [s.inline("heading", "Heading", "How one is made"), s.scheme("site"), ...motion(), ...spacing(120, 120)],
  blocks: [{ type: "chapter", name: "Chapter", limit: 4, settings: [s.text("label", "Small label", "Chapter one"), s.text("title", "Title", "The case"), s.rich("text", "Text", "<p>Turned from a solid bar and finished by hand.</p>"), s.image("image", "Picture"), s.text("image_alt", "Picture description", "")] }],
  maxBlocks: 4,
  preset: [
    { type: "chapter", settings: { label: "The case", title: "Turned from a solid bar", text: "<p>Each case starts as a bar of steel and is turned, brushed and polished by hand, so no two finish quite the same.</p>", image: "", image_alt: "" } },
    { type: "chapter", settings: { label: "The movement", title: "Assembled at one bench", text: "<p>One watchmaker builds a movement from start to finish, then regulates it over several days in different positions.</p>", image: "", image_alt: "" } },
    { type: "chapter", settings: { label: "The dial", title: "Printed, then checked by eye", text: "<p>Indices are applied one at a time. A dial with a mark you can see under a loupe goes back.</p>", image: "", image_alt: "" } },
    { type: "chapter", settings: { label: "The strap", title: "Cut to sit close", text: "<p>Leather cut and stitched to wear in, not to look worn.</p>", image: "", image_alt: "" } },
  ],
}

const macro: ComponentDef = {
  type: `${P}macro`,
  name: "Annotated close up",
  category: "image",
  template: `
<section class="mc" ${rootAttrs({ motion: true })}>
  <div class="mc__in">
    <h2 class="mc__h">{{ settings.heading | raw }}</h2>
    <figure class="mc__fig" data-storelib-motion="parallax-depth" data-motion-strength="{{ settings.motion_strength }}">
      {% if settings.image %}<img class="mc__img" src="{{ settings.image | asset }}" alt="{{ settings.image_alt }}" width="2000" height="1125" loading="lazy">{% else %}<span class="mc__dial" aria-hidden="true"></span>{% endif %}
      <ul class="mc__points">
        {% for block in section.blocks %}<li class="mc__point" style="--x: {{ block.settings.x }}%; --y: {{ block.settings.y }}%;" {{ block.shopify_attributes }}><span class="mc__dot" aria-hidden="true"></span><span class="mc__label">{{ block.settings.label }}</span></li>{% endfor %}
      </ul>
    </figure>
  </div>
</section>`,
  style: `
.mc { ${BOX} }
.mc__in { ${INNER} }
.mc__h { margin: 0 0 clamp(20px, 3vw, 40px); ${DISPLAY} font-size: clamp(1.75rem, 1rem + 3cqi, 3.25rem); font-weight: 400; line-height: 1.05; max-width: 20ch; }
.mc__fig { position: relative; margin: 0; overflow: hidden; background: var(--s-surface); aspect-ratio: 16 / 9; display: grid; place-items: center; }
.mc__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.mc__dial { width: min(56%, 420px); }
${DIAL("mc__dial")}
.mc__points { position: absolute; inset: 0; margin: 0; padding: 0; list-style: none; }
.mc__point { position: absolute; left: var(--x); top: var(--y); display: flex; align-items: center; gap: 10px; max-width: 46%; }
.mc__dot { flex: none; width: 12px; height: 12px; border-radius: 50%; background: var(--s-accent); box-shadow: 0 0 0 6px rgb(0 0 0 / 0.35); }
.mc__label { padding: 6px 10px; background: var(--s-bg); color: var(--s-text); ${LABEL} letter-spacing: 0.14em; }
@container (max-width: 640px) {
  .mc__fig { aspect-ratio: 4 / 5; }
  .mc__points { position: static; display: grid; gap: 8px; padding: 14px; background: var(--s-bg); }
  .mc__fig { display: block; }
  .mc__dial { margin: 24px auto; }
  .mc__point { position: static; max-width: none; }
}
${reveal(".mc", ".mc__point", "ai_lx_macro_in")}`,
  settings: [s.inline("heading", "Heading", "Closer than the shop window"), s.image("image", "Close up photo"), s.text("image_alt", "Photo description", ""), s.scheme("site"), ...motion(), ...spacing(96, 96)],
  blocks: [{ type: "point", name: "Pointer", limit: 5, settings: [s.text("label", "Label", "Hand polished bevels"), s.range("x", "Across", 0, 90, 1, "%", 20), s.range("y", "Down", 0, 90, 1, "%", 30)] }],
  maxBlocks: 5,
  preset: [
    { type: "point", settings: { label: "Polished by hand", x: 12, y: 22 } },
    { type: "point", settings: { label: "Applied indices", x: 58, y: 16 } },
    { type: "point", settings: { label: "Domed crystal", x: 62, y: 70 } },
  ],
}

const specs: ComponentDef = {
  type: `${P}specs`,
  name: "Specification sheet",
  category: "text",
  template: `
<section class="sx" ${rootAttrs({ motion: true })}>
  <div class="sx__in">
    <div class="sx__head"><h2 class="sx__h">{{ settings.heading | raw }}</h2><div class="sx__text">{{ settings.text | raw }}</div></div>
    <dl class="sx__table">
      {% for block in section.blocks %}<div class="sx__row" {{ block.shopify_attributes }}><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}
    </dl>
  </div>
</section>`,
  style: `
.sx { ${BOX} }
.sx__in { display: grid; gap: clamp(28px, 5vw, 80px); ${INNER} }
.sx__h { margin: 0 0 14px; ${DISPLAY} ${CAPS} font-size: clamp(2rem, 1rem + 4cqi, 4.5rem); line-height: 0.95; }
.sx__text { max-width: 28rem; color: var(--s-muted); line-height: 1.7; }
.sx__text p { margin: 0; }
.sx__table { margin: 0; border-top: 1px solid var(--s-accent); }
.sx__row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.sx__row dt { ${LABEL} color: var(--s-muted); padding-top: 4px; }
.sx__row dd { margin: 0; font-size: 1.0625rem; font-variant-numeric: tabular-nums; }
@container (min-width: 900px) { .sx__in { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); } }
${reveal(".sx", ".sx__row", "ai_lx_specs_in")}`,
  settings: [s.inline("heading", "Heading", "The detail"), s.rich("text", "Text", "<p>Every piece leaves with its own sheet, signed by the watchmaker who built it.</p>"), s.scheme("site_inverse"), ...motion(), ...spacing(112, 112)],
  blocks: [{ type: "spec", name: "Line", limit: 12, settings: [s.text("label", "Label", "Case"), s.text("value", "Value", "Steel, brushed and polished")] }],
  maxBlocks: 12,
  preset: [
    { type: "spec", settings: { label: "Case", value: "Steel, brushed and polished" } },
    { type: "spec", settings: { label: "Movement", value: "Hand wound mechanical" } },
    { type: "spec", settings: { label: "Crystal", value: "Domed sapphire" } },
    { type: "spec", settings: { label: "Dial", value: "Applied indices" } },
    { type: "spec", settings: { label: "Strap", value: "Leather, quick release" } },
    { type: "spec", settings: { label: "Service", value: "At the workshop" } },
  ],
}

const head = header({
  type: `${P}header`,
  layout: "center",
  drawer: "full",
  cart: "side",
  overlay: false,
  sticky: false,
  words: { brand: "Atelier", cart: "Bag", menu: "Menu", searchHint: "Search the collection", empty: "Nothing in your bag yet." },
  notices: ["Private viewings by appointment"],
  features: [
    { title: "The collection", text: "Every piece in the shop", url: "/products" },
    { title: "How one is made", text: "The workshop", url: "/about" },
  ],
  skin: `.hd__logo { text-transform: uppercase; letter-spacing: 0.18em; font-size: 1.125rem; } .hd__top, .hd__tool { ${LABEL} } .hd__mlink, .hd__msum, .hd__mega-all { text-transform: uppercase; font-weight: 400; letter-spacing: 0.02em; } .hd__notes { text-align: center; ${LABEL} } .hd__track { margin: 0 auto; }`,
})

const foot = footer({
  type: `${P}footer`,
  layout: "columns",
  scheme: "site",
  words: { brand: "Atelier", newsHeading: "Letters from the workshop", newsText: "<p>A few times a year: a new piece, a visit, how something is made.</p>", legal: "Made by hand, in small numbers.", subscribe: "Subscribe" },
  columns: [
    { heading: "The house", menu: "main-menu" },
    { heading: "Client care", menu: "footer" },
  ],
  notes: [{ heading: "Visits", text: "<p>The workshop is open by appointment. Write and we will find a time.</p>" }],
  skin: `.ft { border-top: 1px solid var(--s-border); } .ft__h { text-transform: uppercase; font-weight: 400; } .ft__col-h { ${LABEL} font-weight: 400; }`,
})

const band = marquee({ type: `${P}band`, scheme: "site", items: ["Steel", "Hand wound", "Domed sapphire", "Leather", "Signed by the maker"], speed: 60, skin: `.mq { border-top: 1px solid var(--s-border); border-bottom: 1px solid var(--s-border); } .mq__item { text-transform: uppercase; font-weight: 400; font-size: clamp(1.5rem, 1rem + 3cqi, 3.5rem); } .mq__item:nth-child(even) { color: var(--s-muted); }` })
const rail = productRail({
  type: `${P}collection`,
  name: "The collection, from the shop",
  words: { heading: "The collection", text: "<p>What is available now. Each piece is shown with its own references and price from the shop.</p>", add: "Add to bag" },
  tiles: [{ title: "See one in person", text: "Book a private viewing at the workshop.", label: "Book a viewing", url: "/contact" }],
  count: 4,
  skin: `.pr__h, .pr__tile-title { text-transform: uppercase; font-weight: 400; } .pr__card-name { font-weight: 400; } .pr__card-add { ${LABEL} } .pr__tile-link { background: var(--s-surface); color: var(--s-text); border: 1px solid var(--s-accent); } .pr__tile-cta { color: var(--s-accent); }`,
})
const creed = statement({
  type: `${P}creed`,
  name: "The idea",
  scheme: "site",
  lines: [
    { text: "Made slowly.", accent: false },
    { text: "Worn for decades.", accent: true },
  ],
  note: "<p>A watch should outlast the person who bought it. Everything we do follows from that.</p>",
  skin: `.st__lines { text-transform: uppercase; font-weight: 400; letter-spacing: 0; } .st__in { text-align: center; } .st__note { margin-inline: auto; }`,
})
const workshop = collage({
  type: `${P}workshop`,
  name: "The workshop",
  words: { heading: "At the bench", text: "<p>Where every piece is assembled, regulated and checked.</p>" },
  photos: [
    { caption: "Assembly", size: "tall" },
    { caption: "Regulation", size: "square" },
    { caption: "Finishing", size: "square" },
    { caption: "The bench", size: "wide" },
  ],
  skin: `.cl__h { text-transform: uppercase; font-weight: 400; } .cl__cap { ${LABEL} }`,
})
const care = faq({
  type: `${P}care`,
  words: { heading: "Client care", text: "<p>Owning a mechanical watch, plainly explained.</p>" },
  items: [
    { q: "How often should it be serviced?", a: "<p>Every five to seven years, depending on how it is worn. We service our own pieces at the workshop.</p>" },
    { q: "How do I wind it?", a: "<p>Once a day, at the same time, until you feel the crown resist. Never force it.</p>" },
    { q: "Can I see a piece before buying?", a: "<p>Yes. Book a private viewing and we will have it ready.</p>" },
    { q: "How is it delivered?", a: "<p>Insured, signed for, in its box with its sheet.</p>" },
  ],
  skin: `.fq__h { text-transform: uppercase; font-weight: 400; } .fq__q { font-weight: 400; }`,
})
const viewing = contact({
  type: `${P}viewing`,
  name: "Book a private viewing",
  words: { heading: "Book a private viewing", text: "<p>An hour at the workshop with the piece you choose and the person who made it. Tell us which and when suits you.</p>", name: "Name", email: "Email", message: "Which piece, and when suits you", send: "Request a viewing" },
  details: [
    { label: "Where", value: "At the workshop", url: "" },
    { label: "How long", value: "About an hour", url: "" },
  ],
  skin: `.ct__h { text-transform: uppercase; font-weight: 400; } .ct__send { ${LABEL} } .ct__label { ${LABEL} }`,
})
const close = cta({
  type: `${P}close`,
  scheme: "site_inverse",
  words: { heading: "Wear one before you choose", text: "<p>Pieces are best judged on the wrist. The workshop is open by appointment.</p>" },
  actions: [
    { label: "Book a viewing", url: "/contact", style: "solid" },
    { label: "The collection", url: "/products", style: "line" },
  ],
  skin: `.cc__h { text-transform: uppercase; font-weight: 400; } .cc__btn { ${LABEL} }`,
})
const intro = pageIntro({
  type: `${P}intro`,
  words: { heading: "The workshop", text: "<p>A small house making mechanical watches by hand, a few at a time.</p>" },
  facts: [
    { label: "Visits", value: "By appointment" },
    { label: "Service", value: "At the workshop" },
  ],
  skin: `.pi__h { text-transform: uppercase; font-weight: 400; } .pi__fact dt { ${LABEL} }`,
})
const product = productMain({
  type: `${P}product`,
  words: { kicker: "The collection", add: "Add to bag", buy: "Buy now", options: "Choose a strap" },
  details: [
    { title: "Specification", text: "<p>The full sheet comes with the piece, signed by its maker.</p>" },
    { title: "Delivery", text: "<p>Insured and signed for, in its box.</p>" },
    { title: "Service", text: "<p>Serviced at the workshop every five to seven years.</p>" },
  ],
  skin: `.pd__title, .pd__stand-word { text-transform: uppercase; font-weight: 400; } .pd__add, .pd__buy { ${LABEL} } .pd__kicker { ${LABEL} }`,
})
const list = collectionGrid({
  type: `${P}list`,
  words: { heading: "The collection", intro: "<p>Every piece available now.</p>", results: "Results for", empty: "Nothing here at the moment. Write to ask about the next pieces.", add: "Add to bag" },
  notes: ["Insured delivery", "Viewings by appointment"],
  columns: 3,
  skin: `.cg__h, .cg__card-stand { text-transform: uppercase; font-weight: 400; } .cg__card-name { font-weight: 400; } .cg__card-add { ${LABEL} }`,
})

const components = [head, foot, hero, band, story, macro, specs, rail, creed, workshop, care, viewing, close, intro, product, list]
const H = place(head, "lx-header", { group: "header" })
const F = place(foot, "lx-footer", { group: "footer" })

export const calibre: SiteTemplate = assemble({
  id: "calibre-watches",
  name: "Calibre",
  summary: "Luxury watch or jewellery house on a dark ground: a huge word cut by the piece in the first screen, the making told in chapters while the picture stays, an annotated close up, a signed specification sheet and private viewings.",
  industries: ["jewellery", "fashion"],
  stories: ["product-brand"],
  styles: ["luxury", "dark-cinematic"],
  directionIds: ["luxury-editorial", "cinematic", "product-led"],
  keywords: ["watch", "watches", "watchmaker", "jewellery", "jewelry", "luxury", "rings", "fine jewellery", "horology", "atelier"],
  motion: "balanced",
  prefix: "lx",
  components,
  header: H,
  footer: F,
  tokens: {
    colors: { background: "#0d0e10", surface: "#17191c", text: "#eceae6", muted: "#a29e95", accent: "#c9b27c", accentText: "#0d0e10", border: "#2b2d31", inverse: { background: "#e4e6e9", text: "#0d0e10", accent: "#5b4b22" } },
    fonts: { heading: "Bodoni Moda", body: "Jost" },
    typeScale: { base: 16, ratio: 1.618 },
    radius: { small: 0, medium: 0, large: 0 },
    spacing: { scale: 1.2, sectionY: 128, pageWidth: 1320, gutter: 24 },
    motion: { level: "subtle", tier: "balanced" },
    shadow: "none",
  },
  menus: {
    "main-menu": {
      title: "Main menu",
      links: [
        { title: "Collection", url: "/products", links: [{ title: "Every piece", url: "/products" }, { title: "Search", url: "/search" }] },
        { title: "Workshop", url: "/about" },
        { title: "Viewings", url: "/contact" },
      ],
    },
    footer: { title: "Footer", links: [{ title: "Collection", url: "/products" }, { title: "The workshop", url: "/about" }, { title: "Book a viewing", url: "/contact" }, { title: "Search", url: "/search" }] },
  },
  pages: [
    {
      key: "home",
      title: "Home",
      sections: [place(hero, "lx-hero"), place(band, "lx-band"), place(story, "lx-story"), place(macro, "lx-macro"), place(rail, "lx-collection"), place(creed, "lx-creed"), place(specs, "lx-specs"), place(workshop, "lx-workshop"), place(care, "lx-care"), place(viewing, "lx-viewing"), place(close, "lx-close")],
    },
    {
      key: "about",
      title: "Workshop",
      seo: { title: "The workshop", description: "Where every piece is assembled, regulated and finished by hand." },
      sections: [place(intro, "lx-about-intro"), place(story, "lx-about-story"), place(workshop, "lx-about-workshop"), place(creed, "lx-about-creed"), place(care, "lx-about-care"), place(close, "lx-about-close")],
    },
    {
      key: "contact",
      title: "Viewings",
      seo: { title: "Book a private viewing", description: "An hour at the workshop with the piece you choose." },
      sections: [place(viewing, "lx-contact-viewing"), place(care, "lx-contact-care"), place(close, "lx-contact-close", { settings: { heading: "Or write to the workshop" } })],
    },
    { key: "product", title: "Product", sections: [place(product, "lx-product"), place(specs, "lx-product-specs"), place(rail, "lx-product-more", { settings: { heading: "Also in the collection" } })] },
    { key: "collection", title: "Collection", sections: [place(list, "lx-list"), place(close, "lx-list-close")] },
    { key: "products", title: "Shop", sections: [place(list, "lx-shop"), place(care, "lx-shop-care")] },
    { key: "search", title: "Search", sections: [place(list, "lx-search", { settings: { heading: "Search" } })] },
  ],
  imageSlots: [
    { key: "hero-piece", style: "product", aspect: "1:1", prompt: "A mechanical wristwatch with a steel case and leather strap photographed straight on, floating, on a plain pure black background, dramatic rim light, ultra sharp product photograph, no brand name on the dial", alt: "The watch, straight on", targets: [{ page: "home", section: "lx-hero", setting: "image" }] },
    { key: "chapter-1", style: "photo", aspect: "4:5", prompt: "A steel watch case being polished on a lathe in a dark workshop, sparks of light, macro, cinematic", alt: "A case being polished", targets: [{ page: "home", section: "lx-story", block: "lx-story-1", setting: "image" }, { page: "about", section: "lx-about-story", block: "lx-about-story-1", setting: "image" }] },
    { key: "chapter-2", style: "photo", aspect: "4:5", prompt: "A watchmaker's hands with tweezers assembling a mechanical movement under a loupe, warm lamp light, macro", alt: "Hands assembling a movement", targets: [{ page: "home", section: "lx-story", block: "lx-story-2", setting: "image" }, { page: "about", section: "lx-about-story", block: "lx-about-story-2", setting: "image" }] },
    { key: "chapter-3", style: "photo", aspect: "4:5", prompt: "Extreme close up of a watch dial with applied indices catching light, dark background, macro", alt: "Close up of the dial's indices", targets: [{ page: "home", section: "lx-story", block: "lx-story-3", setting: "image" }, { page: "about", section: "lx-about-story", block: "lx-about-story-3", setting: "image" }] },
    { key: "chapter-4", style: "photo", aspect: "4:5", prompt: "A leather watch strap being hand stitched on a workbench, dark, warm side light, macro", alt: "A strap being stitched by hand", targets: [{ page: "home", section: "lx-story", block: "lx-story-4", setting: "image" }, { page: "about", section: "lx-about-story", block: "lx-about-story-4", setting: "image" }] },
    { key: "macro", style: "photo", aspect: "16:9", prompt: "Wide macro photograph of a watch case and dial at an angle, polished bevels and domed crystal catching a soft highlight, black background", alt: "The case, dial and crystal up close", targets: [{ page: "home", section: "lx-macro", setting: "image" }] },
    { key: "bench-1", style: "photo", aspect: "3:4", prompt: "A watchmaker at a wooden bench by a window, tools laid out, quiet, documentary", alt: "The watchmaker at the bench", targets: [{ page: "home", section: "lx-workshop", block: "lx-workshop-1", setting: "image" }, { page: "about", section: "lx-about-workshop", block: "lx-about-workshop-1", setting: "image" }] },
    { key: "bench-2", style: "photo", aspect: "1:1", prompt: "A movement on a timing machine in a workshop, close, dark, precise", alt: "A movement on the timing machine", targets: [{ page: "home", section: "lx-workshop", block: "lx-workshop-2", setting: "image" }, { page: "about", section: "lx-about-workshop", block: "lx-about-workshop-2", setting: "image" }] },
    { key: "bench-3", style: "photo", aspect: "1:1", prompt: "Hands finishing a small steel part with a file, macro, warm light", alt: "Finishing a part by hand", targets: [{ page: "home", section: "lx-workshop", block: "lx-workshop-3", setting: "image" }, { page: "about", section: "lx-about-workshop", block: "lx-about-workshop-3", setting: "image" }] },
    { key: "bench-4", style: "photo", aspect: "16:9", prompt: "A long workbench in a small watch workshop at dusk, lamps on, tools and loupes, wide, cinematic", alt: "The workshop at dusk", targets: [{ page: "home", section: "lx-workshop", block: "lx-workshop-4", setting: "image" }, { page: "about", section: "lx-about-workshop", block: "lx-about-workshop-4", setting: "image" }] },
    { key: "about", style: "photo", aspect: "4:3", prompt: "The door of a small watch workshop on a quiet street at night, warm light inside, cinematic", alt: "The workshop door at night", targets: [{ page: "about", section: "lx-about-intro", setting: "image" }] },
  ],
  bindings: [
    { page: "home", section: "lx-collection", setting: "products", kind: "products", why: "The pieces from the shop. Empty shows the newest products." },
    { page: "home", section: "lx-viewing", setting: "form", kind: "form", why: "The creator's booking form for viewings; otherwise a contact message." },
    { page: "home", section: "lx-header", setting: "menu", kind: "menu", why: "The main menu." },
  ],
  design: {
    thesis: "A near black first screen with one huge word in high contrast capitals and the watch threaded through it: the piece sits over the top of the letters and under their lower half.",
    layout: ["Type cut by the product in the first screen", "The making told in chapters while the picture stays", "An annotated close up with pointers", "A signed specification sheet on a light inverse band", "Generous space, one thing at a time"],
    imagery: "The piece cut out on black for the opening; dark, warm macro photography of making; never lifestyle stock of a wrist on a yacht.",
    motion: "As you scroll on, the word grows and fades and the piece turns a few degrees; chapter pictures crossfade while the words pass.",
    signature: ["type cut by the product", "chapters with a picture that stays", "annotated close up", "signed specification sheet"],
    avoid: ["cream background", "italic serif with mono caps", "gold gradients", "invented heritage dates or awards"],
  },
})
