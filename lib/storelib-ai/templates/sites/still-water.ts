/**
 * STILL WATER: a med spa, skin clinic or wellness practice.
 *
 * Cool mist ground, deep teal and sea glass, a calm geometric sans at
 * medium weight. The first screen is a soft photograph in a tall rounded
 * frame with the headline overlapping it and the treatments as chips, the
 * treatment menu opens row by row with its picture, a first visit told step
 * by step, the care and safety notes said plainly, gift cards and packages
 * from the shop, and booking on the real booking form. Quiet motion.
 * Original work for Storelib (round P, P2a).
 */
import { assemble } from "../kit/build"
import { footer, header } from "../kit/chrome"
import { BOX, DISPLAY, INNER, motion, place, rootAttrs, s, spacing, type ComponentDef } from "../kit/schema"
import { collage, collectionGrid, contact, cta, faq, marquee, pageIntro, productMain, productRail, reveal, statement, stickySteps } from "../kit/sections"
import type { SiteTemplate } from "../types"

const P = "ai_ms_"
const SOFT = `.cl__fig, .pr__card-media, .pr__tile-link, .cg__card-media, .pd__shot, .pd__stand, .pi__media, .sp__img { border-radius: 10px; } .cc__btn, .pr__card-add, .ct__send, .pd__add, .pd__buy, .cg__card-add, .ct__field input, .ct__field textarea { border-radius: 10px; } .ct__field textarea { border-radius: 10px; }`

const hero: ComponentDef = {
  type: `${P}hero`,
  name: "Opening, soft photo and treatments",
  category: "hero",
  template: `
<section class="sh" ${rootAttrs({ motion: true })}>
  <div class="sh__in">
    <div class="sh__words">
      <h1 class="sh__h">{{ settings.heading | raw }}</h1>
      <div class="sh__text">{{ settings.text | raw }}</div>
      <ul class="sh__chips">{% for block in section.blocks %}<li {{ block.shopify_attributes }}><a class="sh__chip" href="{{ block.settings.url | url }}">{{ block.settings.label }}</a></li>{% endfor %}</ul>
      <div class="sh__actions">
        <a class="sh__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
        {% if settings.cta2_label %}<a class="sh__link" href="{{ settings.cta2_url | url }}">{{ settings.cta2_label }}</a>{% endif %}
      </div>
    </div>
    <figure class="sh__frame" data-storelib-motion="parallax-depth" data-motion-intensity="40" data-motion-pointer="false">
      {% if settings.image %}<img class="sh__img" src="{{ settings.image | asset }}" alt="{{ settings.image_alt }}" width="1100" height="1400" fetchpriority="high" data-motion-depth="0.3">{% else %}<span class="sh__still" aria-hidden="true"></span>{% endif %}
      {% if settings.note %}<figcaption class="sh__note">{{ settings.note }}</figcaption>{% endif %}
    </figure>
  </div>
</section>`,
  style: `
.sh { ${BOX} overflow: hidden; }
.sh__in { display: grid; gap: clamp(28px, 5vw, 64px); ${INNER} }
.sh__words { position: relative; z-index: 2; }
.sh__h { margin: 0; ${DISPLAY} font-size: clamp(2.75rem, 1.2rem + 7cqi, 7.25rem); line-height: 0.96; letter-spacing: -0.035em; font-weight: 500; }
.sh__h em { font-style: normal; color: var(--s-accent); }
.sh__text { max-width: 30rem; margin-top: 20px; font-size: 1.125rem; line-height: 1.6; color: var(--s-muted); }
.sh__text p { margin: 0; }
.sh__chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 0; padding: 0; list-style: none; }
.sh__chip { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border: 1px solid var(--s-border); border-radius: 10px; background: var(--s-surface); color: var(--s-text); text-decoration: none; transition: border-color var(--t-motion-hover, 160ms) ease, background-color var(--t-motion-hover, 160ms) ease; }
.sh__chip:hover { border-color: var(--s-accent); }
.sh__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; margin-top: 28px; }
.sh__btn { display: inline-flex; align-items: center; min-height: 54px; padding: 0 28px; border-radius: 10px; background: var(--s-btn); color: var(--s-btn-text); font-weight: 500; text-decoration: none; transition: background-color var(--t-motion-hover, 160ms) ease; }
.sh__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.sh__link { display: inline-flex; align-items: center; min-height: 44px; color: inherit; text-underline-offset: 5px; }
.sh__frame { position: relative; margin: 0; overflow: hidden; border-radius: 160px 160px 14px 14px; background: var(--s-surface); aspect-ratio: 4 / 5; }
.sh__img { width: 100%; height: 100%; object-fit: cover; }
.sh__still { position: absolute; inset: 0; background: radial-gradient(circle at 50% 52%, var(--s-accent) 0 17%, transparent 17.5%), linear-gradient(to bottom, transparent 0 64%, var(--s-border) 64% 65%, var(--s-bg) 65% 100%), var(--s-surface); }
.sh__note { position: absolute; left: 16px; right: 16px; bottom: 16px; padding: 12px 16px; border-radius: 16px; background: var(--s-bg); color: var(--s-text); font-size: 0.9375rem; line-height: 1.4; }
@container (min-width: 960px) {
  .sh__in { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: center; }
  .sh__words { margin-right: -12%; }
}
@media (prefers-reduced-motion: no-preference) {
  .sh:not([data-motion="off"]) .sh__frame { animation: ai_ms_hero_in calc(var(--t-motion-duration, 450ms) * 1.8) var(--t-motion-ease, ease) both; }
  @keyframes ai_ms_hero_in { from { opacity: 0; transform: scale(calc(1 + (var(--t-motion-scale, 1.03) - 1) * var(--m-k, 1))); } }
}`,
  settings: [
    s.inline("heading", "Heading", "Skin care that starts with <em>listening</em>"),
    s.rich("text", "Text", "<p>Facials, peels and massage in a quiet clinic, each one planned after a conversation about your skin and what you want from it.</p>"),
    s.text("cta_label", "Button", "Book a consultation"),
    s.url("cta_url", "Button link", "/contact"),
    s.text("cta2_label", "Second link", "See treatments"),
    s.url("cta2_url", "Second link goes to", "/#treatments"),
    s.image("image", "Photo"),
    s.text("image_alt", "Photo description", ""),
    s.text("note", "Note on the photo", "Every first visit begins with a consultation"),
    s.scheme("site"),
    ...motion(),
    ...spacing(64, 96),
  ],
  blocks: [{ type: "treatment", name: "Treatment chip", limit: 6, settings: [s.text("label", "Treatment", "Facials"), s.url("url", "Link", "/#treatments")] }],
  maxBlocks: 6,
  preset: [
    { type: "treatment", settings: { label: "Facials", url: "/#treatments" } },
    { type: "treatment", settings: { label: "Peels", url: "/#treatments" } },
    { type: "treatment", settings: { label: "Massage", url: "/#treatments" } },
    { type: "treatment", settings: { label: "Brows and lashes", url: "/#treatments" } },
  ],
}

const treatments: ComponentDef = {
  type: `${P}treatments`,
  name: "Treatment menu",
  category: "text",
  template: `
<section class="tm" id="{{ settings.anchor }}" ${rootAttrs({ motion: true })}>
  <div class="tm__in">
    <div class="tm__head"><h2 class="tm__h">{{ settings.heading | raw }}</h2><div class="tm__text">{{ settings.text | raw }}</div></div>
    <div class="tm__list">
      {% for block in section.blocks %}
      <details class="tm__item" {{ block.shopify_attributes }}{% if forloop.first %} open{% endif %}>
        <summary class="tm__sum"><span class="tm__name">{{ block.settings.name }}</span><span class="tm__meta">{{ block.settings.duration }}{% if block.settings.price %} · {{ block.settings.price }}{% endif %}</span></summary>
        <div class="tm__body">
          <div class="tm__detail">{{ block.settings.detail | raw }}</div>
          {% if block.settings.image %}<img class="tm__img" src="{{ block.settings.image | asset }}" alt="{{ block.settings.image_alt }}" width="800" height="600" loading="lazy">{% endif %}
        </div>
      </details>
      {% endfor %}
    </div>
    <a class="tm__book" href="{{ settings.book_url | url }}">{{ settings.book_label }}</a>
  </div>
</section>`,
  style: `
.tm { ${BOX} }
.tm__in { ${INNER} }
.tm__head { display: grid; gap: 12px; margin-bottom: clamp(24px, 4vw, 48px); }
.tm__h { margin: 0; ${DISPLAY} font-size: clamp(2.25rem, 1.2rem + 4.6cqi, 5rem); line-height: 1; letter-spacing: -0.03em; font-weight: 500; }
.tm__text { max-width: 34rem; color: var(--s-muted); line-height: 1.6; }
.tm__text p { margin: 0; }
.tm__list { display: grid; gap: 10px; }
.tm__item { border-radius: 10px; background: var(--s-surface); }
.tm__sum { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 16px; min-height: 64px; padding: 18px 22px; cursor: pointer; list-style: none; }
.tm__sum::-webkit-details-marker { display: none; }
.tm__name { ${DISPLAY} font-size: clamp(1.25rem, 1rem + 1.2cqi, 1.75rem); font-weight: 500; letter-spacing: -0.02em; }
.tm__meta { color: var(--s-muted); font-variant-numeric: tabular-nums; }
.tm__body { display: grid; gap: 16px; padding: 0 22px 22px; }
.tm__detail { max-width: 40rem; line-height: 1.65; }
.tm__detail p { margin: 0 0 8px; }
.tm__img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; }
.tm__book { display: inline-flex; align-items: center; min-height: 54px; margin-top: 28px; padding: 0 28px; border-radius: 10px; background: var(--s-btn); color: var(--s-btn-text); text-decoration: none; }
.tm__book:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
@container (min-width: 900px) { .tm__body { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; } }
${reveal(".tm", ".tm__item", "ai_ms_treatments_in")}`,
  settings: [
    s.inline("heading", "Heading", "Treatments"),
    s.text("anchor", "Anchor name, for links like /#treatments", "treatments"),
    s.rich("text", "Text", "<p>Times include the consultation at the start. Open any treatment to read what happens.</p>"),
    s.text("book_label", "Button", "Book a consultation"),
    s.url("book_url", "Button link", "/contact"),
    s.scheme("site"),
    ...motion(),
    ...spacing(96, 96),
  ],
  blocks: [
    {
      type: "treatment",
      name: "Treatment",
      limit: 12,
      settings: [s.text("name", "Name", "Signature facial"), s.text("duration", "Length", "60 minutes"), s.text("price", "Price", ""), s.rich("detail", "What happens", "<p>Cleanse, exfoliation, massage and a mask chosen for your skin.</p>"), s.image("image", "Photo"), s.text("image_alt", "Photo description", "")],
    },
  ],
  maxBlocks: 12,
  preset: [
    { type: "treatment", settings: { name: "Signature facial", duration: "60 minutes", price: "", detail: "<p>A cleanse, gentle exfoliation, face and shoulder massage and a mask chosen for your skin on the day.</p>", image: "", image_alt: "" } },
    { type: "treatment", settings: { name: "Light peel", duration: "45 minutes", price: "", detail: "<p>A mild acid peel for dull or uneven skin. We patch test first and talk you through the days after.</p>", image: "", image_alt: "" } },
    { type: "treatment", settings: { name: "Deep tissue massage", duration: "60 or 90 minutes", price: "", detail: "<p>Slow, firm work on the back, neck and shoulders. Tell us what to avoid.</p>", image: "", image_alt: "" } },
    { type: "treatment", settings: { name: "Brow shape and tint", duration: "30 minutes", price: "", detail: "<p>Shaped to your face, tinted to your hair. Patch test 48 hours before.</p>", image: "", image_alt: "" } },
  ],
}

const care: ComponentDef = {
  type: `${P}care`,
  name: "Care and safety",
  category: "text",
  template: `
<section class="ca" ${rootAttrs({ motion: true })}>
  <div class="ca__in">
    <h2 class="ca__h">{{ settings.heading | raw }}</h2>
    <ul class="ca__list">
      {% for block in section.blocks %}<li class="ca__item" {{ block.shopify_attributes }}><h3 class="ca__title">{{ block.settings.title }}</h3><div class="ca__text">{{ block.settings.text | raw }}</div></li>{% endfor %}
    </ul>
  </div>
</section>`,
  style: `
.ca { ${BOX} }
.ca__in { ${INNER} }
.ca__h { margin: 0 0 clamp(24px, 4vw, 48px); max-width: 18ch; ${DISPLAY} font-size: clamp(2rem, 1.2rem + 3.8cqi, 4.25rem); line-height: 1.02; letter-spacing: -0.03em; font-weight: 500; }
.ca__list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.ca__item { display: grid; gap: 6px; padding: 22px 0; border-bottom: 1px solid var(--s-border); }
.ca__title { margin: 0; ${DISPLAY} font-size: 1.375rem; font-weight: 500; }
.ca__text { color: var(--s-muted); line-height: 1.6; max-width: 40rem; }
.ca__text p { margin: 0; }
@container (min-width: 860px) { .ca__item { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 32px; } }
${reveal(".ca", ".ca__item", "ai_ms_care_in")}`,
  settings: [s.inline("heading", "Heading", "How we look after you"), s.scheme("site_inverse"), ...motion(), ...spacing(112, 112)],
  blocks: [{ type: "point", name: "Point", limit: 6, settings: [s.text("title", "Title", "A consultation first"), s.rich("text", "Text", "<p>We ask about your health and your skin before anything else.</p>")] }],
  maxBlocks: 6,
  preset: [
    { type: "point", settings: { title: "A consultation first", text: "<p>Every first visit starts with questions about your health, your skin and what you want. Some treatments wait until we know more.</p>" } },
    { type: "point", settings: { title: "Patch tests", text: "<p>For peels, tints and anything new to you, 48 hours before.</p>" } },
    { type: "point", settings: { title: "Honest advice", text: "<p>If a treatment is not right for you, we say so, and suggest who to see instead.</p>" } },
    { type: "point", settings: { title: "Aftercare in writing", text: "<p>You leave with what to do and avoid for the next few days.</p>" } },
  ],
}

const head = header({
  type: `${P}header`,
  layout: "pill",
  drawer: "side",
  cart: "sheet",
  scroll: "sticky",
  cta: { label: "Book", url: "/contact" },
  words: { brand: "Clinic", cart: "Bag", menu: "Menu", searchHint: "Search treatments and gift cards", empty: "Nothing in your bag yet." },
  notices: ["Gift cards for any treatment, sent by email"],
  features: [
    { title: "Treatments", text: "Facials, peels and massage", url: "/#treatments" },
    { title: "Gift cards", text: "For any treatment", url: "/products" },
  ],
  skin: `.hd__logo { font-weight: 500; letter-spacing: -0.02em; } .hd__drawer--side { border-radius: 0 28px 28px 0; } .hd__cart--sheet { border-radius: 28px 28px 0 0; } .hd__checkout { border-radius: 999px; } .hd__feat-media { border-radius: 18px; }`,
})
const foot = footer({
  type: `${P}footer`,
  layout: "newsletter",
  scheme: "site_inverse",
  words: { brand: "Clinic", newsHeading: "Seasonal notes on skin", newsText: "<p>Four short letters a year: what changes in your skin with the season, and what we do about it.</p>", legal: "Skin care and massage.", subscribe: "Subscribe" },
  columns: [
    { heading: "Visit", menu: "main-menu" },
    { heading: "Clinic", menu: "footer" },
  ],
  notes: [{ heading: "Hours", text: "<p>Tuesday to Saturday, by appointment.</p>" }],
  skin: `.ft__h { font-weight: 500; letter-spacing: -0.03em; } .ft-field__input, .ft-news__go { border-radius: 999px; }`,
})
const band = marquee({ type: `${P}band`, scheme: "site", items: ["Facials", "Peels", "Massage", "Brows", "Lashes", "Gift cards"], speed: 70, skin: `.mq { border-top: 1px solid var(--s-border); border-bottom: 1px solid var(--s-border); } .mq__item { font-weight: 400; font-size: clamp(1.5rem, 1rem + 3cqi, 3.5rem); } .mq__item:nth-child(even) { color: var(--s-muted); }` })
const visit = stickySteps({
  type: `${P}visit`,
  name: "Your first visit",
  words: { heading: "Your first visit, step by step", text: "<p>Nothing is rushed and nothing is sold to you on the table.</p>" },
  steps: [
    { title: "Book a consultation", text: "<p>Online, at a time that suits you. Tell us anything we should know.</p>" },
    { title: "Talk it through", text: "<p>We look at your skin together and agree a plan, with costs, before starting.</p>" },
    { title: "The treatment", text: "<p>In a warm, quiet room. You can stop at any point.</p>" },
    { title: "Aftercare", text: "<p>Written notes to take home, and a message a few days later to see how you are.</p>" },
  ],
  skin: `.sp__h, .sp__title { font-weight: 500; letter-spacing: -0.03em; } .sp__n { font-weight: 300; } ${SOFT}`,
})
const gifts = productRail({
  type: `${P}gifts`,
  name: "Gift cards and packages",
  words: { heading: "Gift cards and packages", text: "<p>From the shop, with prices and what is included.</p>", add: "Add to bag" },
  tiles: [{ title: "Not sure what to give?", text: "A gift card works for any treatment.", label: "See gift cards", url: "/products" }],
  count: 4,
  skin: `.pr__h, .pr__tile-title { font-weight: 500; letter-spacing: -0.03em; } ${SOFT}`,
})
const rooms = collage({
  type: `${P}rooms`,
  name: "The clinic",
  words: { heading: "A quiet place", text: "<p>Warm rooms, soft light, and nobody in a hurry.</p>" },
  photos: [
    { caption: "Treatment room", size: "tall" },
    { caption: "Reception", size: "square" },
    { caption: "Products we use", size: "square" },
    { caption: "The garden window", size: "wide" },
  ],
  skin: `.cl__h { font-weight: 500; letter-spacing: -0.03em; } .cl__cap { border-radius: 10px; } ${SOFT}`,
})
const creed = statement({
  type: `${P}creed`,
  name: "What we believe",
  scheme: "site",
  lines: [
    { text: "Less, but right.", accent: false },
    { text: "Your skin, your pace.", accent: true },
  ],
  note: "<p>We would rather do one treatment that suits you than five that do not.</p>",
  skin: `.st__lines { font-weight: 400; letter-spacing: -0.04em; font-size: clamp(2.25rem, 1rem + 6cqi, 6.5rem); line-height: 1; }`,
})
const questions = faq({
  type: `${P}faq`,
  words: { heading: "Questions", text: "<p>If yours is not here, ask when you book.</p>" },
  items: [
    { q: "Do I need a consultation first?", a: "<p>Yes, for a first visit. It is part of your first appointment.</p>" },
    { q: "Can I have treatments while pregnant?", a: "<p>Some, not all. Tell us when you book and we will plan around it.</p>" },
    { q: "What if I need to cancel?", a: "<p>Move or cancel with 24 hours' notice at no cost.</p>" },
    { q: "How do gift cards work?", a: "<p>They arrive by email and can be used for any treatment.</p>" },
  ],
  skin: `.fq__h { font-weight: 500; letter-spacing: -0.03em; } .fq__item { border-radius: 0; }`,
})
const book = contact({
  type: `${P}book`,
  name: "Book a consultation",
  words: { heading: "Book a consultation", text: "<p>Choose a time and tell us a little about your skin. We confirm within a working day.</p>", name: "Name", email: "Email", message: "What would you like help with?", send: "Request a time" },
  details: [
    { label: "Hours", value: "Tuesday to Saturday, by appointment", url: "" },
    { label: "Cancel", value: "Free with 24 hours' notice", url: "" },
  ],
  skin: `.ct__h { font-weight: 500; letter-spacing: -0.03em; } ${SOFT}`,
})
const close = cta({
  type: `${P}close`,
  scheme: "site_inverse",
  words: { heading: "Start with a conversation", text: "<p>Your first visit begins with a consultation, so nothing is decided for you.</p>" },
  actions: [
    { label: "Book a consultation", url: "/contact", style: "solid" },
    { label: "Gift cards", url: "/products", style: "line" },
  ],
  skin: `.cc__h { font-weight: 500; letter-spacing: -0.04em; } ${SOFT}`,
})
const intro = pageIntro({
  type: `${P}intro`,
  words: { heading: "A small clinic for skin and rest", text: "<p>Facials, peels and massage, planned around one conversation about your skin.</p>" },
  facts: [
    { label: "Open", value: "Tuesday to Saturday" },
    { label: "First visit", value: "Starts with a consultation" },
  ],
  skin: `.pi__h { font-weight: 500; letter-spacing: -0.045em; } ${SOFT}`,
})
const product = productMain({
  type: `${P}product`,
  words: { kicker: "Gift cards and packages", add: "Add to bag", buy: "Buy now", options: "Choose an amount" },
  details: [
    { title: "How it arrives", text: "<p>By email, ready to forward or print.</p>" },
    { title: "Using it", text: "<p>Book any treatment and mention the card. It covers the consultation too.</p>" },
    { title: "Questions", text: "<p>Write to us from the contact page.</p>" },
  ],
  skin: `.pd__title, .pd__stand-word { font-weight: 500; letter-spacing: -0.035em; } .pd__option { border-radius: 10px; } ${SOFT}`,
})
const list = collectionGrid({
  type: `${P}list`,
  words: { heading: "Gift cards and packages", intro: "<p>Everything in the shop.</p>", results: "Results for", empty: "Nothing here yet.", add: "Add to bag" },
  notes: ["Sent by email", "Any treatment"],
  columns: 3,
  skin: `.cg__h, .cg__card-stand { font-weight: 500; letter-spacing: -0.04em; } .cg__note::before { border-radius: 50%; } ${SOFT}`,
})

const components = [head, foot, hero, band, treatments, visit, care, gifts, rooms, creed, questions, book, close, intro, product, list]
const H = place(head, "ms-header", { group: "header" })
const F = place(foot, "ms-footer", { group: "footer" })

export const stillWater: SiteTemplate = assemble({
  id: "still-water-spa",
  name: "Still Water",
  summary: "Med spa, skin clinic or wellness practice: a soft photo in a tall rounded frame with treatment chips, a treatment menu that opens row by row, a first visit step by step, care and safety said plainly, booking on the real form.",
  industries: ["wellness", "beauty"],
  stories: ["wellness-studio"],
  styles: ["wellness", "minimalism"],
  directionIds: ["modern-wellness", "one-page-conversion", "japanese-minimal"],
  keywords: ["med spa", "medspa", "spa", "skin clinic", "facials", "aesthetics", "massage", "skincare", "wellness", "beauty clinic", "peels"],
  motion: "quiet",
  prefix: "ms",
  components,
  header: H,
  footer: F,
  tokens: {
    colors: { background: "#eef2f0", surface: "#e0e8e4", text: "#13211e", muted: "#4c5c57", accent: "#1f5c55", accentText: "#ffffff", border: "#c6d2cd", inverse: { background: "#1d3833", text: "#eef2f0", accent: "#9fd6c9" } },
    fonts: { heading: "Outfit", body: "Albert Sans" },
    typeScale: { base: 17, ratio: 1.333 },
    radius: { small: 10, medium: 12, large: 16 },
    spacing: { scale: 1.15, sectionY: 112, pageWidth: 1280, gutter: 24 },
    motion: { level: "subtle", tier: "quiet" },
    shadow: "none",
  },
  menus: {
    "main-menu": {
      title: "Main menu",
      links: [
        { title: "Treatments", url: "/#treatments" },
        { title: "Gift cards", url: "/products", links: [{ title: "All gift cards and packages", url: "/products" }, { title: "Search", url: "/search" }] },
        { title: "About", url: "/about" },
        { title: "Book", url: "/contact" },
      ],
    },
    footer: { title: "Footer", links: [{ title: "Gift cards", url: "/products" }, { title: "About the clinic", url: "/about" }, { title: "Book and contact", url: "/contact" }, { title: "Search", url: "/search" }] },
  },
  pages: [
    {
      key: "home",
      title: "Home",
      sections: [place(hero, "ms-hero"), place(band, "ms-band"), place(treatments, "ms-treatments"), place(visit, "ms-visit"), place(care, "ms-care"), place(gifts, "ms-gifts"), place(rooms, "ms-rooms"), place(creed, "ms-creed"), place(questions, "ms-faq"), place(book, "ms-book"), place(close, "ms-close")],
    },
    {
      key: "about",
      title: "About",
      seo: { title: "About the clinic", description: "How we work, how we look after you and the rooms you are treated in." },
      sections: [place(intro, "ms-about-intro"), place(creed, "ms-about-creed"), place(care, "ms-about-care"), place(visit, "ms-about-visit"), place(rooms, "ms-about-rooms"), place(close, "ms-about-close")],
    },
    {
      key: "contact",
      title: "Book",
      seo: { title: "Book a consultation", description: "Choose a time for your first visit, or ask us anything." },
      sections: [place(book, "ms-contact-book"), place(questions, "ms-contact-faq"), place(close, "ms-contact-close", { settings: { heading: "Or call in during opening hours" } })],
    },
    { key: "product", title: "Product", sections: [place(product, "ms-product"), place(care, "ms-product-care"), place(gifts, "ms-product-more", { settings: { heading: "Also in the shop" } })] },
    { key: "collection", title: "Collection", sections: [place(list, "ms-collection"), place(close, "ms-collection-close")] },
    { key: "products", title: "Shop", sections: [place(list, "ms-shop"), place(questions, "ms-shop-faq")] },
    { key: "search", title: "Search", sections: [place(list, "ms-search", { settings: { heading: "Search" } })] },
  ],
  imageSlots: [
    { key: "hero", style: "photo", aspect: "4:5", prompt: "A calm skin clinic treatment: a client lying relaxed while a therapist applies a face mask, soft daylight, muted sage tones, natural skin, editorial wellness photograph", alt: "A client relaxing during a facial", targets: [{ page: "home", section: "ms-hero", setting: "image" }] },
    { key: "treatment-1", style: "photo", aspect: "4:3", prompt: "Close up of hands performing a gentle facial massage, soft light, natural skin texture", alt: "A facial massage", targets: [{ page: "home", section: "ms-treatments", block: "ms-treatments-1", setting: "image" }] },
    { key: "treatment-2", style: "photo", aspect: "4:3", prompt: "A therapist applying a light peel with a fan brush to a client's cheek, clinical but warm, soft light", alt: "A peel applied with a brush", targets: [{ page: "home", section: "ms-treatments", block: "ms-treatments-2", setting: "image" }] },
    { key: "treatment-3", style: "photo", aspect: "4:3", prompt: "A back and shoulder massage in a dim, warm treatment room, towels, calm", alt: "A shoulder massage", targets: [{ page: "home", section: "ms-treatments", block: "ms-treatments-3", setting: "image" }] },
    { key: "treatment-4", style: "photo", aspect: "4:3", prompt: "Brow shaping with tweezers, close up, soft daylight, natural", alt: "Brows being shaped", targets: [{ page: "home", section: "ms-treatments", block: "ms-treatments-4", setting: "image" }] },
    { key: "room-1", style: "photo", aspect: "3:4", prompt: "An empty treatment room with a made up treatment bed, linen, a plant and soft window light, minimal, sage and white", alt: "A treatment room", targets: [{ page: "home", section: "ms-rooms", block: "ms-rooms-1", setting: "image" }, { page: "about", section: "ms-about-rooms", block: "ms-about-rooms-1", setting: "image" }] },
    { key: "room-2", style: "photo", aspect: "1:1", prompt: "A quiet clinic reception with a stone counter and a vase of branches, soft light", alt: "The reception", targets: [{ page: "home", section: "ms-rooms", block: "ms-rooms-2", setting: "image" }, { page: "about", section: "ms-about-rooms", block: "ms-about-rooms-2", setting: "image" }] },
    { key: "room-3", style: "photo", aspect: "1:1", prompt: "Unbranded skincare bottles on a tray in soft light, minimal still life", alt: "Skincare on a tray", targets: [{ page: "home", section: "ms-rooms", block: "ms-rooms-3", setting: "image" }, { page: "about", section: "ms-about-rooms", block: "ms-about-rooms-3", setting: "image" }] },
    { key: "room-4", style: "photo", aspect: "16:9", prompt: "A window looking onto a small green garden from inside a calm clinic, linen curtain, morning light", alt: "The garden window", targets: [{ page: "home", section: "ms-rooms", block: "ms-rooms-4", setting: "image" }, { page: "about", section: "ms-about-rooms", block: "ms-about-rooms-4", setting: "image" }] },
    { key: "about", style: "photo", aspect: "4:3", prompt: "A practitioner preparing a treatment room, folding towels, soft light, documentary", alt: "Preparing the treatment room", targets: [{ page: "about", section: "ms-about-intro", setting: "image" }] },
  ],
  bindings: [
    { page: "home", section: "ms-book", setting: "form", kind: "form", why: "The creator's booking form (a form with booking). Without one the section sends a contact message." },
    { page: "home", section: "ms-gifts", setting: "products", kind: "products", why: "Gift cards and packages from the shop." },
    { page: "home", section: "ms-header", setting: "menu", kind: "menu", why: "The main menu." },
  ],
  design: {
    thesis: "A cool mist ground, a calm medium weight headline overlapping a soft treatment photograph in a tall arched frame, treatments as chips under it, the booking button beside them.",
    layout: ["The hero headline overlaps the photo frame on wide screens", "Treatments as rows that open, each with its own picture", "Care and safety on a deep teal inverse band", "Generous space, soft corners, one accent"],
    imagery: "Real treatments and real rooms in daylight: hands, skin, linen, plants. Never retouched glass skin, never before and after photos.",
    motion: "Quiet: the photo settles in once, rows open, lists fade up; nothing loops fast.",
    signature: ["arched photo frame", "treatment chips", "treatment rows that open", "care and safety band"],
    avoid: ["before and after photos", "invented results or reviews", "purple gradients", "medical claims"],
  },
})
