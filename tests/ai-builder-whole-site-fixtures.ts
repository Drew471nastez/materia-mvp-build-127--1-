/**
 * Round N (N3): what a scripted "model" writes to make a WHOLE site, shared by
 * tests/ai-builder-whole-site-n3.test.ts, the agent engine tests, the journey
 * and the benchmarks. Ten of its own sections on home (eight here plus the
 * hero and the program list of tests/ai-builder-agent-fixtures.ts), six on
 * every other page, a product template that reads the product it is drawn
 * with and a collection template that lists the real products. Every file
 * passes the same checks a real model's files are held to (compile, the
 * agent integration rules, the render check, the anti slop review).
 *
 * SCRIPTED, SAID PLAINLY: these prove the plumbing and the rules, nothing
 * about what a real model would design.
 */
const ROOT_VARS = `--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-heading: {{ scheme.heading }}; --s-accent: {{ scheme.accent }}; --s-btn: {{ scheme.primary_btn_bg }}; --s-btn-text: {{ scheme.primary_btn_text }}; --s-btn-hover: {{ scheme.primary_btn_hover_bg }}; --s-btn-hover-text: {{ scheme.primary_btn_hover_text }}; --s-border: {{ scheme.border }}; --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px;`

const SPACING = `
    { "type": "header", "id": "hdr_spacing", "label": "Spacing" },
    { "type": "range", "id": "padding_top", "label": "Top padding", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 64 },
    { "type": "range", "id": "padding_bottom", "label": "Bottom padding", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 64 }`

const SCHEME = `{ "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "site" },`

const BOX = `padding: calc(var(--s-pt) * var(--theme-spacing-scale, 1)) var(--theme-padding-x, 24px) calc(var(--s-pb) * var(--theme-spacing-scale, 1)); background: var(--s-bg); color: var(--s-text);`
const HEAD = `font-family: var(--theme-font-heading, {{ theme.typography.heading }}), serif; color: var(--s-heading);`

/** How a first week goes: numbered steps, one per block. */
export const STEPS = `<template>
<section class="st" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <h2 class="st__h">{{ settings.heading }}</h2>
  <ol class="st__list">
    {% for block in section.blocks %}
      <li class="st__step" {{ block.shopify_attributes }}><span class="st__name">{{ block.settings.name }}</span><p class="st__text">{{ block.settings.text }}</p></li>
    {% endfor %}
  </ol>
</section>
</template>

<style scoped>
.st { ${BOX} }
.st__h { margin: 0 0 20px; ${HEAD} font-size: clamp(28px, 6cqi, 44px); }
.st__list { margin: 0; padding-left: 1.4em; display: grid; gap: 18px; }
.st__name { font-weight: 600; }
.st__text { margin: 4px 0 0; line-height: 1.55; }
@container (min-width: 760px) { .st__list { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_steps",
  "name": "First week steps",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Your first week" },
    ${SCHEME}${SPACING}
  ],
  "blocks": [
    { "type": "step", "name": "Step", "settings": [
      { "type": "text", "id": "name", "label": "Step", "default": "Book a first session" },
      { "type": "textarea", "id": "text", "label": "What happens", "default": "Say what happens in this step, in your own words." }
    ] }
  ],
  "max_blocks": 6
}
</schema>
`

/** Plain facts as a definition list: no invented numbers, the creator fills them. */
export const FACTS = `<template>
<section class="fx" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <h2 class="fx__h">{{ settings.heading }}</h2>
  <dl class="fx__list">
    {% for block in section.blocks %}
      <div class="fx__row" {{ block.shopify_attributes }}><dt class="fx__term">{{ block.settings.term }}</dt><dd class="fx__def">{{ block.settings.detail }}</dd></div>
    {% endfor %}
  </dl>
</section>
</template>

<style scoped>
.fx { ${BOX} }
.fx__h { margin: 0 0 16px; ${HEAD} font-size: 32px; }
.fx__list { margin: 0; border-top: 1px solid var(--s-border); }
.fx__row { display: grid; gap: 4px; padding: 14px 0; border-bottom: 1px solid var(--s-border); }
.fx__term { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--s-accent); }
.fx__def { margin: 0; }
@container (min-width: 700px) { .fx__row { grid-template-columns: 14rem 1fr; } }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_facts",
  "name": "Good to know",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Good to know" },
    ${SCHEME}${SPACING}
  ],
  "blocks": [
    { "type": "fact", "name": "Fact", "settings": [
      { "type": "text", "id": "term", "label": "Label", "default": "What to bring" },
      { "type": "text", "id": "detail", "label": "Detail", "default": "Write what people need to bring." }
    ] }
  ],
  "max_blocks": 8
}
</schema>
`

/** Questions and answers, each a native disclosure. */
export const FAQ = `<template>
<section class="fq" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <h2 class="fq__h">{{ settings.heading }}</h2>
  {% for block in section.blocks %}
    <details class="fq__item" {{ block.shopify_attributes }}><summary class="fq__q">{{ block.settings.question }}</summary><div class="fq__a">{{ block.settings.answer }}</div></details>
  {% endfor %}
</section>
</template>

<style scoped>
.fq { ${BOX} max-width: 52rem; }
.fq__h { margin: 0 0 18px; ${HEAD} font-size: 30px; }
.fq__item { border-top: 1px solid var(--s-border); padding: 14px 0; }
.fq__q { cursor: pointer; font-weight: 600; min-height: 44px; }
.fq__a { margin-top: 8px; line-height: 1.6; }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_faq",
  "name": "Questions",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Questions people ask" },
    ${SCHEME}${SPACING}
  ],
  "blocks": [
    { "type": "question", "name": "Question", "settings": [
      { "type": "text", "id": "question", "label": "Question", "default": "Do I need to be fit already?" },
      { "type": "richtext", "id": "answer", "label": "Answer", "default": "<p>Write your answer here.</p>" }
    ] }
  ],
  "max_blocks": 10
}
</schema>
`

/** A full width band with one line and one link. */
export const BAND = `<template>
<section class="bd bd--{{ settings.align }}" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <p class="bd__line">{{ settings.line }}</p>
  {% if settings.link_label and settings.link_url %}<a class="bd__link" href="{{ settings.link_url | url }}">{{ settings.link_label }}</a>{% endif %}
</section>
</template>

<style scoped>
.bd { ${BOX} display: grid; gap: 18px; }
.bd--center { text-align: center; justify-items: center; }
.bd__line { margin: 0; ${HEAD} font-size: clamp(30px, 7cqi, 72px); line-height: 1; text-transform: uppercase; }
.bd__link { justify-self: start; padding: 14px 22px; min-height: 44px; background: var(--s-btn); color: var(--s-btn-text); text-decoration: none; }
.bd--center .bd__link { justify-self: center; }
.bd__link:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_band",
  "name": "Call out band",
  "settings": [
    { "type": "text", "id": "line", "label": "Line", "default": "Strong is a skill" },
    { "type": "text", "id": "link_label", "label": "Link", "default": "See the programs" },
    { "type": "url", "id": "link_url", "label": "Link goes to", "default": "/programs" },
    { "type": "select", "id": "align", "label": "Text sits", "default": "left", "options": [{ "label": "Left", "value": "left" }, { "label": "Centre", "value": "center" }] },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "site_inverse" },${SPACING}
  ]
}
</schema>
`

/** Photos from the gym, each a picture with its description. */
export const GALLERY = `<template>
<section class="gl" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <h2 class="gl__h">{{ settings.heading }}</h2>
  <div class="gl__grid">
    {% for block in section.blocks %}
      <figure class="gl__fig" {{ block.shopify_attributes }}>
        {% if block.settings.photo %}<img class="gl__img" src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="800" height="1000">{% endif %}
        {% if block.settings.caption %}<figcaption class="gl__cap">{{ block.settings.caption }}</figcaption>{% endif %}
      </figure>
    {% endfor %}
  </div>
</section>
</template>

<style scoped>
.gl { ${BOX} }
.gl__h { margin: 0 0 18px; ${HEAD} font-size: 30px; }
.gl__grid { display: grid; gap: 12px; }
.gl__fig { margin: 0; }
.gl__img { width: 100%; height: auto; object-fit: cover; }
.gl__cap { margin-top: 6px; font-size: 14px; }
@container (min-width: 720px) { .gl__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_gallery",
  "name": "Photo strip",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Inside the gym" },
    ${SCHEME}${SPACING}
  ],
  "blocks": [
    { "type": "photo", "name": "Photo", "settings": [
      { "type": "image_picker", "id": "photo", "label": "Photo" },
      { "type": "text", "id": "alt", "label": "Photo description", "default": "" },
      { "type": "text", "id": "caption", "label": "Caption", "default": "" }
    ] }
  ],
  "max_blocks": 9
}
</schema>
`

/** The week's sessions set like a departures board. */
export const SCHEDULE = `<template>
<section class="sb" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <h2 class="sb__h">{{ settings.heading }}</h2>
  <table class="sb__table">
    <caption class="sb__cap">{{ settings.caption }}</caption>
    <tbody>
      {% for block in section.blocks %}
        <tr class="sb__row" {{ block.shopify_attributes }}><th class="sb__day" scope="row">{{ block.settings.day }}</th><td class="sb__time">{{ block.settings.time }}</td><td class="sb__what">{{ block.settings.what }}</td></tr>
      {% endfor %}
    </tbody>
  </table>
</section>
</template>

<style scoped>
.sb { ${BOX} }
.sb__h { margin: 0 0 12px; ${HEAD} font-size: 30px; }
.sb__table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.sb__cap { text-align: left; font-size: 14px; padding-bottom: 8px; }
.sb__row { border-top: 1px solid var(--s-border); }
.sb__day, .sb__time, .sb__what { text-align: left; padding: 12px 8px 12px 0; font-weight: 400; }
.sb__time { color: var(--s-accent); letter-spacing: 0.08em; }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_schedule",
  "name": "Session board",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "This week" },
    { "type": "text", "id": "caption", "label": "Note under the heading", "default": "Your class times go here." },
    ${SCHEME}${SPACING}
  ],
  "blocks": [
    { "type": "session", "name": "Session", "settings": [
      { "type": "text", "id": "day", "label": "Day", "default": "Monday" },
      { "type": "text", "id": "time", "label": "Time", "default": "Your time" },
      { "type": "text", "id": "what", "label": "Session", "default": "Small group strength" }
    ] }
  ],
  "max_blocks": 14
}
</schema>
`

/** A short note in the coach's own words: theirs to write, not a testimonial. */
export const NOTE = `<template>
<section class="nt" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <p class="nt__kicker">{{ settings.kicker }}</p>
  <div class="nt__body">{{ settings.body }}</div>
  <p class="nt__sign">{{ settings.signature }}</p>
</section>
</template>

<style scoped>
.nt { ${BOX} max-width: 46rem; }
.nt__kicker { margin: 0 0 12px; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--s-accent); }
.nt__body { font-size: clamp(20px, 3.4cqi, 28px); line-height: 1.4; }
.nt__sign { margin-top: 16px; }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_note",
  "name": "A note from the coach",
  "settings": [
    { "type": "text", "id": "kicker", "label": "Small line above", "default": "From the coach" },
    { "type": "richtext", "id": "body", "label": "Note", "default": "<p>Write a few lines about how you coach, in your own words.</p>" },
    { "type": "text", "id": "signature", "label": "Signed", "default": "Your name" },
    ${SCHEME}${SPACING}
  ]
}
</schema>
`

/** Where to find the gym: address and directions, written by the creator. */
export const PLACE = `<template>
<section class="pl" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <h2 class="pl__h">{{ settings.heading }}</h2>
  <p class="pl__addr">{{ settings.address }}</p>
  <div class="pl__how">{{ settings.directions }}</div>
  {% if settings.link_label and settings.link_url %}<a class="pl__link" href="{{ settings.link_url | url }}">{{ settings.link_label }}</a>{% endif %}
</section>
</template>

<style scoped>
.pl { ${BOX} display: grid; gap: 10px; }
.pl__h { margin: 0; ${HEAD} font-size: 30px; }
.pl__addr { margin: 0; font-size: 18px; }
.pl__how { line-height: 1.6; }
.pl__link { color: inherit; min-height: 44px; display: inline-flex; align-items: center; }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_place",
  "name": "Where to find us",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Where to find us" },
    { "type": "text", "id": "address", "label": "Address", "default": "Your address goes here" },
    { "type": "richtext", "id": "directions", "label": "Getting here", "default": "<p>Say how people get there and where to park.</p>" },
    { "type": "text", "id": "link_label", "label": "Link", "default": "About the coach" },
    { "type": "url", "id": "link_url", "label": "Link goes to", "default": "/about" },
    ${SCHEME}${SPACING}
  ]
}
</schema>
`

/** THE PRODUCT TEMPLATE: the product the visitor opened, its pictures, price, options, add to cart, offers and description. */
export const PRODUCT_PAGE = `<template>
<section class="pp" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <div class="pp__media">
    {% for image in product.images %}<img class="pp__img" src="{{ image }}" alt="{{ product.title }}" width="900" height="900">{% endfor %}
  </div>
  <div class="pp__info">
    {% if settings.kicker %}<p class="pp__kicker">{{ settings.kicker }}</p>{% endif %}
    <h1 class="pp__title">{{ product.title }}</h1>
    <p class="pp__price">{{ product.price }}{% if product.compare_price %} <s class="pp__was">{{ product.compare_price }}</s>{% endif %}</p>
    {% if page.product.settings.variants.size > 0 %}
      <div class="pp__options" role="group" aria-label="{{ settings.options_label }}">
        {% for v in page.product.settings.variants %}
          <button class="pp__option" type="button" data-storelib-add-to-cart="{{ product.id }}" data-variant-id="{{ v.id }}" data-title="{{ product.title }}" data-price="{{ v.price }}">{{ v.name }} {{ v.price }}</button>
        {% endfor %}
      </div>
    {% else %}
      <button class="pp__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.title }}" data-price="{{ product.price }}" data-url="{{ product.url }}">{{ settings.add_label }}</button>
    {% endif %}
    <div data-storelib-island data-storelib-offers="{{ product.id }}" data-title="{{ product.title }}" data-url="{{ product.url }}" data-layout="open"></div>
    {% if product.description_html %}<div class="pp__desc">{{ product.description_html | raw }}</div>{% endif %}
  </div>
</section>
</template>

<style scoped>
.pp { ${BOX} display: grid; gap: 28px; }
.pp__media { display: grid; gap: 8px; }
.pp__img { width: 100%; height: auto; object-fit: cover; }
.pp__kicker { margin: 0 0 8px; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--s-accent); }
.pp__title { margin: 0; ${HEAD} font-size: clamp(34px, 7cqi, 72px); line-height: 0.95; }
.pp__price { margin: 14px 0 20px; font-size: 22px; }
.pp__was { opacity: 0.7; }
.pp__options { display: flex; flex-wrap: wrap; gap: 8px; }
.pp__add, .pp__option { min-height: 48px; padding: 12px 22px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; cursor: pointer; }
.pp__add:hover, .pp__option:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.pp__desc { margin-top: 24px; line-height: 1.6; max-width: 38rem; }
@container (min-width: 860px) { .pp { grid-template-columns: 1.1fr 1fr; align-items: start; } }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_product_page",
  "name": "Product",
  "settings": [
    { "type": "text", "id": "kicker", "label": "Small line above", "default": "Coaching" },
    { "type": "text", "id": "add_label", "label": "Add to cart button", "default": "Add to cart" },
    { "type": "text", "id": "options_label", "label": "Options description", "default": "Choose an option" },
    ${SCHEME}${SPACING}
  ]
}
</schema>
`

/** THE COLLECTION TEMPLATE: the collection's name and its real products. */
export const COLLECTION_PAGE = `<template>
<section class="cl" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <h1 class="cl__h">{% if collection %}{{ collection.title }}{% else %}{{ settings.heading }}{% endif %}</h1>
  {% if collection.description %}<p class="cl__intro">{{ collection.description }}</p>{% endif %}
  <ul class="cl__list">
    {% for product in products %}
      <li class="cl__item">
        <a class="cl__link" href="{{ product.settings.url | url }}">
          {% if product.settings.image %}<img class="cl__img" src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="600" height="750">{% endif %}
          <span class="cl__name">{{ product.settings.title }}</span>
          <span class="cl__price">{{ product.settings.price }}</span>
        </a>
        <button class="cl__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button>
      </li>
    {% endfor %}
  </ul>
</section>
</template>

<style scoped>
.cl { ${BOX} }
.cl__h { margin: 0; ${HEAD} font-size: clamp(32px, 6cqi, 60px); }
.cl__intro { max-width: 38rem; line-height: 1.6; }
.cl__list { list-style: none; margin: 24px 0 0; padding: 0; display: grid; gap: 20px; }
.cl__link { display: grid; gap: 6px; color: inherit; text-decoration: none; }
.cl__img { width: 100%; height: auto; object-fit: cover; }
.cl__price { color: var(--s-accent); }
.cl__add { margin-top: 8px; min-height: 44px; padding: 10px 18px; border: 1px solid var(--s-border); background: transparent; color: inherit; font: inherit; cursor: pointer; }
@container (min-width: 760px) { .cl__list { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_collection_grid",
  "name": "Collection",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading when no collection", "default": "Programs" },
    { "type": "text", "id": "add_label", "label": "Add to cart button", "default": "Add to cart" },
    ${SCHEME}${SPACING}
  ]
}
</schema>
`

/** Every whole-site file by path. */
export const WHOLE_SITE_FILES: Record<string, string> = {
  "sections/ai_coach_steps.storelib": STEPS,
  "sections/ai_coach_facts.storelib": FACTS,
  "sections/ai_coach_faq.storelib": FAQ,
  "sections/ai_coach_band.storelib": BAND,
  "sections/ai_coach_gallery.storelib": GALLERY,
  "sections/ai_coach_schedule.storelib": SCHEDULE,
  "sections/ai_coach_note.storelib": NOTE,
  "sections/ai_coach_place.storelib": PLACE,
  "sections/ai_product_page.storelib": PRODUCT_PAGE,
  "sections/ai_collection_grid.storelib": COLLECTION_PAGE,
}

/** The eight home sections besides the hero and program list, in order. */
export const HOME_EXTRAS = ["ai_coach_steps", "ai_coach_schedule", "ai_coach_band", "ai_coach_note", "ai_coach_gallery", "ai_coach_facts", "ai_coach_faq", "ai_coach_place"] as const
/** Five sections that make a page of six with one of its own. */
export const PAGE_EXTRAS = ["ai_coach_steps", "ai_coach_schedule", "ai_coach_faq", "ai_coach_note", "ai_coach_band"] as const

type Call = [string, Record<string, unknown>]

/** The write_file calls for every whole-site file, `per` to a turn. */
export function writeWholeSite(per = 5): Call[][] {
  const calls: Call[] = Object.entries(WHOLE_SITE_FILES).map(([path, content]) => ["write_file", { path, content }])
  const out: Call[][] = []
  for (let i = 0; i < calls.length; i += per) out.push(calls.slice(i, i + per))
  return out
}

/** The site plan (report_progress pages) for home, the given pages, and every template. */
export function sitePlan(pages: string[], opts: { blog?: boolean } = {}): { key: string; sections: string[]; reason?: string }[] {
  const keep = "The platform's working layout in the site's tokens is enough for now."
  return [
    { key: "home", sections: ["ai_coach_hero: the promise", "ai_program_list: the programs", ...HOME_EXTRAS.map((t) => `${t}: its own job`)] },
    ...pages.map((key) => ({ key, sections: ["its own section", ...PAGE_EXTRAS.map((t) => `${t}: supports it`)] })),
    { key: "product", sections: ["ai_product_page: pictures, price, options, add to cart, offers, description"] },
    { key: "collection", sections: ["ai_collection_grid: the collection's products"] },
    { key: "products", sections: [], reason: keep },
    { key: "search", sections: [], reason: keep },
    { key: "cart", sections: [], reason: keep },
    { key: "404", sections: [], reason: keep },
    { key: "contact", sections: [], reason: "The about page carries the contact details for now." },
    ...(opts.blog ? [{ key: "blogs", sections: [], reason: keep }, { key: "article", sections: [], reason: keep }] : []),
  ]
}

/** A placed section: just its type. */
const at = (type: string) => ({ type })

/** set_page_sections for home: header, the given own sections, the eight extras, footer. */
export function homeSections(own: Record<string, unknown>[], chrome: { header?: string; footer?: string } = { header: "ai_coach_header", footer: "ai_coach_footer" }): Record<string, unknown>[] {
  return [...(chrome.header ? [{ type: chrome.header, group: "header" }] : []), ...own, ...HOME_EXTRAS.map(at), ...(chrome.footer ? [{ type: chrome.footer, group: "footer" }] : [])]
}

/** set_page_sections for another page: its own section, then the five extras. */
export function pageSections(own: Record<string, unknown>): Record<string, unknown>[] {
  return [own, ...PAGE_EXTRAS.map(at)]
}

/** The two template placements. */
export function templateCalls(): Call[] {
  return [
    ["set_page_sections", { page: "product", sections: [at("ai_product_page")] }],
    ["set_page_sections", { page: "collection", sections: [at("ai_collection_grid")] }],
  ]
}
