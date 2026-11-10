/**
 * TEMPLATE h, "Halden": luxury real estate and hospitality. Cinematic
 * full-bleed photography carries it; the serif (Spectral, upright, light)
 * is there because a house or a hotel sells on calm and craft, set big over
 * the photograph, never italic, never on cream, with no mono captions.
 * Scroll storytelling: chapters whose photograph stays while the words
 * pass, a slow parallax photo break, a sideways interior gallery. The
 * residences or suites are the store's real products.
 */
import {
  BOX, cartPanel, check, chromeVars, chromeWords, defineSection, image, menu, motion, panelCss, prefs, productList, range, revealCss, richtext, scheme, searchPanel, select, spacing, text, textarea, url, vars,
} from "../kit-b"

const SERIF = "font-family: var(--theme-font-heading), serif; font-weight: 300; color: var(--s-heading);"
const SMALL = "font-size: 0.8125rem; letter-spacing: 0.04em;"

/* ── header: centered name over the hero, full screen menu with a photograph ── */
export const header = defineSection({
  type: "ai_es_header",
  name: "Header",
  kind: "header",
  summary: "Centered name with Menu on the left and Enquire, search and cart on the right; floats over the first photograph when asked; the menu opens full screen beside a photograph, with language and currency.",
  template: `
<header class="esn{% if settings.overlay %} esn--over{% endif %}" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <div class="esn__bar">
    <button class="esn__tool esn__menu" type="button" popovertarget="esn-d-{{ section.id }}">{{ settings.menu_label }}</button>
    <a class="esn__logo" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" width="{{ settings.logo_width }}" height="36">{% else %}{{ shop.name | default: settings.brand }}{% endif %}</a>
    <div class="esn__tools">
      {% if settings.enquire_label %}<a class="esn__tool esn__wide" href="{{ settings.enquire_url | url }}">{{ settings.enquire_label }}</a>{% endif %}
      <button class="esn__tool esn__wide" type="button" data-storelib-search>{{ settings.search_label }}</button>
      <button class="esn__tool" type="button" data-storelib-cart>{{ settings.cart_label }} <span class="esn__count" data-storelib-cart-count></span></button>
    </div>
  </div>

  <div class="esn__drawer" id="esn-d-{{ section.id }}" popover>
    <div class="esn__drawer-in">
      <div class="esn__drawer-nav">
        <button class="esn-x" type="button" popovertarget="esn-d-{{ section.id }}" popovertargetaction="hide">{{ settings.close_label }}</button>
        <nav aria-label="{{ settings.nav_label }}">
          <ol class="esn__list">
            {% for link in settings.menu.links %}
              <li><a class="esn__link" href="{{ link.url }}">{{ link.title }}</a>
                {% if link.links.size > 0 %}<ul class="esn__sub">{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>{% endif %}
              </li>
            {% endfor %}
          </ol>
        </nav>
        <p class="esn__row"><button class="esn__tool" type="button" data-storelib-search>{{ settings.search_label }}</button><a class="esn__acct" href="{{ routes.account_url }}">{{ settings.account_label }}</a></p>
        ${prefs("esn")}
      </div>
      {% if settings.drawer_photo %}<img class="esn__photo" src="{{ settings.drawer_photo | asset }}" alt="{{ settings.drawer_photo_alt }}" width="1200" height="1500">{% endif %}
    </div>
  </div>

  ${searchPanel("esn")}
  ${cartPanel("esn")}
</header>`,
  style: `
.esn { position: relative; z-index: 30; background: var(--s-bg); color: var(--s-text); }
.esn--over { position: absolute; inset: 0 0 auto; background: none; color: #fff; }
.esn__bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: 76px; padding: 0 var(--theme-padding-x, 20px); }
.esn__logo { ${SERIF} color: inherit; max-width: 46vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: clamp(1.25rem, 1rem + 1vw, 1.75rem); letter-spacing: 0.02em; text-decoration: none; text-align: center; }
.esn__logo img { display: block; max-height: 36px; width: auto; height: auto; margin: 0 auto; }
.esn__tools { display: flex; justify-content: flex-end; gap: 2px; }
.esn__tool { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 10px; border: 0; background: none; color: inherit; font: inherit; ${SMALL} text-decoration: none; cursor: pointer; }
.esn__menu { justify-self: start; padding-left: 0; }
.esn__tool:hover { text-decoration: underline; text-underline-offset: 5px; }
.esn__wide { display: none; }
.esn__count:empty, .esn__count[data-count="0"] { display: none; }
.esn__drawer { inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: var(--s-bg); color: var(--s-text); overflow-y: auto; }
.esn__drawer-in { display: grid; min-height: 100%; }
.esn__drawer-nav { display: grid; align-content: start; gap: 24px; padding: 20px var(--theme-padding-x, 20px) 40px; }
.esn__list { margin: 12px 0 0; padding: 0; list-style: none; counter-reset: esn; }
.esn__list > li { counter-increment: esn; border-bottom: 1px solid var(--s-border); }
.esn__link { display: flex; align-items: baseline; gap: 16px; padding: 14px 0; ${SERIF} font-size: clamp(2.25rem, 1.6rem + 3.5vw, 4rem); line-height: 1; letter-spacing: -0.02em; text-decoration: none; }
.esn__link::before { content: counter(esn, decimal-leading-zero); font-family: var(--theme-font-body), sans-serif; font-size: 0.75rem; color: var(--s-accent); }
.esn__sub { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0 0 14px; padding: 0; list-style: none; }
.esn__sub a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; }
.esn__row { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0; }
.esn__row .esn__tool { padding-left: 0; }
.esn__acct { color: inherit; min-height: 44px; display: inline-flex; align-items: center; }
.esn__photo { display: none; width: 100%; height: 100%; object-fit: cover; }
.esn :focus-visible { outline: 2px solid var(--s-accent); outline-offset: 3px; }
${panelCss("esn", { cartFrom: "right", searchFrom: "top" })}
.esn-search, .esn-cart { color: var(--s-text); }
.esn-cart__title { font-weight: 300; }
@media (min-width: 900px) {
  .esn__wide { display: inline-flex; }
  .esn__drawer-in { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .esn__photo { display: block; }
  .esn__drawer-nav { padding: 28px 48px 48px; }
}
@media (prefers-reduced-motion: no-preference) {
  .esn__drawer { transition: opacity var(--t-motion-duration, 650ms) var(--t-motion-ease, ease), display var(--t-motion-duration, 650ms) allow-discrete, overlay var(--t-motion-duration, 650ms) allow-discrete; opacity: 0; }
  .esn__drawer:popover-open { opacity: 1; }
  @starting-style { .esn__drawer:popover-open { opacity: 0; } }
}`,
  settings: [
    menu(),
    text("brand", "Name when there is no logo", "Halden"),
    range("logo_width", "Logo width", 60, 220, 4, 120, "px"),
    check("overlay", "Float over the first photograph", true),
    text("enquire_label", "Enquire link", "Enquire"),
    url("enquire_url", "Enquire goes to", "/contact"),
    text("account_label", "Account link", "Your account"),
    image("drawer_photo", "Photograph in the menu"),
    text("drawer_photo_alt", "Photograph description", "A quiet stone hallway with morning light"),
    ...chromeWords({ cart_label: "Reservations", empty_text: "Nothing reserved yet.", checkout_label: "Continue", search_placeholder: "Search residences and journal" }),
    scheme("site"),
  ],
})

/* ── hero: one cinematic photograph, the serif over it ── */
export const hero = defineSection({
  type: "ai_es_hero",
  name: "Cinematic hero",
  summary: "A full-bleed photograph that fills the screen and settles slowly as you scroll (P3 parallax-depth), a quiet serif line over it, where it is, and one action.",
  template: `
<section class="esh" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars("--esh-dim: {{ settings.dim }};")}">
  <div class="esh__media" data-storelib-motion="parallax-depth" data-motion-depth="{{ settings.depth }}" data-motion-scale="1.08">
    {% if settings.photo %}<img class="esh__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="2400" height="1500" fetchpriority="high">{% endif %}
    {% if settings.photo_mobile %}<img class="esh__img esh__img--m" src="{{ settings.photo_mobile | asset }}" alt="{{ settings.photo_alt }}" width="1080" height="1600">{% endif %}
  </div>
  <div class="esh__copy">
    <ul class="esh__facts">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.fact }}</li>{% endfor %}</ul>
    <h1 class="esh__h">{{ settings.heading }}</h1>
    <a class="esh__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
  </div>
</section>`,
  style: `
.esh { position: relative; display: grid; align-items: end; min-height: 100svh; overflow: hidden; background: var(--s-bg); color: #fff; container-type: inline-size; }
.esh__media { position: absolute; inset: 0; }
.esh__img { width: 100%; height: 100%; object-fit: cover; }
.esh__img--m { display: none; }
.esh__media::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0, 0, 0, calc(var(--esh-dim, 0.5) + 0.2)) 0%, rgba(0, 0, 0, var(--esh-dim, 0.5)) 35%, transparent 75%); }
.esh__copy { position: relative; display: grid; gap: 22px; justify-items: start; padding: 120px var(--theme-padding-x, 20px) calc(var(--s-pb) * var(--theme-spacing-scale, 1)); }
.esh__facts { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; padding: 0; list-style: none; ${SMALL} }
.esh__h { margin: 0; max-width: 16ch; font-family: var(--theme-font-heading), serif; font-weight: 300; color: #fff; font-size: clamp(2.75rem, 1.6rem + 6cqi, 7.5rem); line-height: 0.98; letter-spacing: -0.025em; }
.esh__btn { display: inline-flex; align-items: center; min-height: 52px; padding: 0 26px; border: 1px solid rgba(255, 255, 255, 0.7); color: #fff; ${SMALL} text-decoration: none; transition: background-color var(--t-motion-hover, 200ms) ease, color var(--t-motion-hover, 200ms) ease; }
.esh__btn:hover { background: #fff; color: #111; }
@media (max-width: 640px) { .esh__img--m { display: block; position: absolute; inset: 0; } }
@media (prefers-reduced-motion: no-preference) {
  .esh:not([data-motion="off"]) .esh__img { animation: esh-settle calc(var(--t-motion-duration, 650ms) * 3) var(--t-motion-ease, ease) both; }
  .esh:not([data-motion="off"]) .esh__copy > * { animation: esh-rise var(--t-motion-duration, 650ms) var(--t-motion-ease, ease) both; animation-delay: calc(var(--t-motion-stagger, 65ms) * 3); }
}
@keyframes esh-settle { from { transform: scale(var(--t-motion-scale, 1.06)); } }
@keyframes esh-rise { from { opacity: 0; transform: translateY(calc(var(--t-motion-distance, 24px) * var(--m-k, 1))); } }`,
  settings: [
    text("heading", "Heading", "Six rooms above the water, one long table"),
    text("cta_label", "Button", "See the residences"),
    url("cta_url", "Button goes to", "/products"),
    image("photo", "Photograph"),
    image("photo_mobile", "Photograph for phones (tall)"),
    text("photo_alt", "Photograph description", "A stone house on a lake shore at dusk, warm light in every window"),
    range("dim", "Darken the photograph", 0, 0.8, 0.05, 0.35),
    range("depth", "Parallax depth", 0, 0.6, 0.05, 0.2),
    ...motion(),
    scheme("site"),
    ...spacing(0, 64),
  ],
  blocks: [{ type: "fact", name: "Fact", settings: [text("fact", "Fact", "Lake Halden")] }],
  presetBlocks: ["Lake Halden, north shore", "Restored 2024", "Open all year"].map((fact) => ({ type: "fact", settings: { fact } })),
  maxBlocks: 4,
})

/* ── intro: a long serif paragraph and the plain facts ── */
export const intro = defineSection({
  type: "ai_es_intro",
  name: "Opening words",
  summary: "One long serif paragraph that introduces the place, lines rising as they enter, beside two or three plain facts.",
  template: `
<section class="esi" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esi__grid">
    <h2 class="esi__h">{{ settings.heading }}</h2>
    <div class="esi__body" data-storelib-motion="reveal-stagger" data-motion-split="lines">{{ settings.body | raw }}</div>
    <dl class="esi__facts">
      {% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}
    </dl>
  </div>
</section>`,
  style: `
.esi { ${BOX} }
.esi__grid { display: grid; gap: 28px; }
.esi__h { margin: 0; ${SMALL} font-weight: 400; color: var(--s-accent); }
.esi__body { ${SERIF} font-size: clamp(1.5rem, 1.1rem + 2.2cqi, 3rem); line-height: 1.22; letter-spacing: -0.01em; max-width: 30ch; }
.esi__body p { margin: 0 0 0.6em; }
.esi__facts { display: grid; gap: 16px; margin: 0; }
.esi__facts div { padding-top: 12px; border-top: 1px solid var(--s-border); }
.esi__facts dt { ${SMALL} opacity: 0.7; }
.esi__facts dd { margin: 4px 0 0; font-size: 1.0625rem; }
@container (min-width: 900px) { .esi__grid { grid-template-columns: 12rem minmax(0, 1fr) 16rem; align-items: start; } }
${revealCss("esi", ".esi__body p, .esi__facts div", "esi-rise")}`,
  settings: [
    text("heading", "Small heading", "The house"),
    richtext("body", "Words", "<p>Halden was a boatbuilder's house for ninety years. We kept the timber, the stone and the light, and made six rooms where you hear the lake before you see it.</p>"),
    ...motion(),
    scheme("site"),
    ...spacing(120, 120),
  ],
  blocks: [{ type: "fact", name: "Fact", settings: [text("label", "Label", "Rooms"), text("value", "Value", "Six, each facing the water")] }],
  presetBlocks: [
    { type: "fact", settings: { label: "Rooms", value: "Six, each facing the water" } },
    { type: "fact", settings: { label: "Table", value: "Dinner for guests, four nights a week" } },
    { type: "fact", settings: { label: "Arriving", value: "Ninety minutes from the city by train" } },
  ],
  maxBlocks: 5,
})

/* ── chapters: sticky photographs, words that pass ── */
export const chapters = defineSection({
  type: "ai_es_chapters",
  name: "Chapters",
  summary: "Scroll storytelling: each chapter's photograph holds the screen while its words pass (P3 scroll-scrub crossfades them); on phones each chapter is its photograph then its words.",
  template: `
<section class="esc" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="esc__h">{{ settings.heading }}</h2>
  <div class="esc__wrap" data-storelib-motion="scroll-scrub" data-motion-target=".esc__frame" data-motion-steps="{{ section.blocks.size }}">
    <div class="esc__frames" aria-hidden="true">
      {% for block in section.blocks %}<figure class="esc__frame">{% if block.settings.photo %}<img src="{{ block.settings.photo | asset }}" alt="" width="1600" height="2000">{% endif %}</figure>{% endfor %}
    </div>
    <ol class="esc__list">
      {% for block in section.blocks %}
        <li class="esc__chapter" data-block-id="{{ block.id }}">
          {% if block.settings.photo %}<img class="esc__inline" src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="1600" height="2000">{% endif %}
          <p class="esc__n">{{ block.settings.label }}</p>
          <h3 class="esc__title">{{ block.settings.title }}</h3>
          <p class="esc__text">{{ block.settings.text }}</p>
        </li>
      {% endfor %}
    </ol>
  </div>
</section>`,
  style: `
.esc { ${BOX} }
.esc__h { margin: 0 0 40px; ${SERIF} font-size: clamp(2rem, 1.4rem + 3cqi, 4rem); letter-spacing: -0.02em; line-height: 1.02; max-width: 18ch; }
.esc__frames { display: none; }
.esc__list { display: grid; gap: 56px; margin: 0; padding: 0; list-style: none; }
.esc__inline { width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; margin-bottom: 18px; }
.esc__n { margin: 0; ${SMALL} color: var(--s-accent); }
.esc__title { margin: 8px 0 0; ${SERIF} font-size: clamp(1.75rem, 1.3rem + 2cqi, 3rem); letter-spacing: -0.02em; line-height: 1.05; }
.esc__text { max-width: 40ch; margin: 14px 0 0; line-height: 1.7; opacity: 0.86; }
@container (min-width: 900px) {
  .esc__wrap { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); gap: 56px; }
  .esc__frames { display: grid; position: sticky; top: 0; height: 100svh; overflow: hidden; }
  .esc__frame { grid-area: 1 / 1; margin: 0; overflow: hidden; }
  .esc__frame img { width: 100%; height: 100%; object-fit: cover; }
  .esc__frame:not(:first-child) { opacity: 0; }
  .esc__inline { display: none; }
  .esc__list { gap: 0; }
  .esc__chapter { display: grid; align-content: center; min-height: 100svh; }
}
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    @container (min-width: 900px) {
      .esc:not([data-motion="off"]) .esc__wrap { timeline-scope: --esc-2, --esc-3, --esc-4; }
      .esc:not([data-motion="off"]) .esc__chapter:nth-child(2) { view-timeline-name: --esc-2; }
      .esc:not([data-motion="off"]) .esc__chapter:nth-child(3) { view-timeline-name: --esc-3; }
      .esc:not([data-motion="off"]) .esc__chapter:nth-child(4) { view-timeline-name: --esc-4; }
      .esc:not([data-motion="off"]) .esc__frame:nth-child(2) { animation: esc-in linear both; animation-timeline: --esc-2; animation-range: entry 30% cover 45%; }
      .esc:not([data-motion="off"]) .esc__frame:nth-child(3) { animation: esc-in linear both; animation-timeline: --esc-3; animation-range: entry 30% cover 45%; }
      .esc:not([data-motion="off"]) .esc__frame:nth-child(4) { animation: esc-in linear both; animation-timeline: --esc-4; animation-range: entry 30% cover 45%; }
    }
  }
}
@media (prefers-reduced-motion: reduce) { @container (min-width: 900px) { .esc__wrap { display: block; } .esc__frames { display: none; } .esc__inline { display: block; max-width: 640px; } .esc__list { gap: 56px; } .esc__chapter { min-height: 0; } } }
.esc[data-motion="off"] .esc__wrap { display: block; }
.esc[data-motion="off"] .esc__frames { display: none; }
.esc[data-motion="off"] .esc__inline { display: block; max-width: 640px; }
.esc[data-motion="off"] .esc__chapter { min-height: 0; }
.esc[data-motion="off"] .esc__list { gap: 56px; }
@keyframes esc-in { from { opacity: 0; transform: scale(var(--t-motion-scale, 1.06)); } to { opacity: 1; transform: none; } }`,
  settings: [text("heading", "Heading", "A day at Halden"), ...motion(), scheme("site"), ...spacing(120, 120)],
  blocks: [{ type: "chapter", name: "Chapter", settings: [text("label", "Small label", "Morning"), text("title", "Title", "Coffee on the jetty"), textarea("text", "Words", ""), image("photo", "Photograph"), text("alt", "Photograph description", "")] }],
  presetBlocks: [
    { type: "chapter", settings: { label: "Morning", title: "Coffee on the jetty", text: "Mist on the water until nine. Breakfast is bread from the oven next door and whatever the garden has.", alt: "Two cups of coffee on a wooden jetty over a misty lake" } },
    { type: "chapter", settings: { label: "Afternoon", title: "The boathouse library", text: "Two thousand books, a stove and a window seat for every guest who wants one.", alt: "A library inside an old boathouse with a reading chair by the window" } },
    { type: "chapter", settings: { label: "Evening", title: "One long table", text: "Dinner is set for everyone staying, at eight, with whatever came out of the lake that day.", alt: "A long candlelit dinner table in a timber room" } },
  ],
  maxBlocks: 4,
})

/* ── residences: the store's real products ── */
export const residences = defineSection({
  type: "ai_es_residences",
  name: "Residences",
  summary: "The residences or suites, from the store's real products (chosen, or the newest): photograph, name, price, a link to each; the photographs ease up on hover.",
  template: `
<section class="esr" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esr__head"><h2 class="esr__h">{{ settings.heading }}</h2><a class="esr__all" href="{{ settings.all_url | url }}">{{ settings.all_label }}</a></div>
  <ul class="esr__list">
    {% if settings.products.size > 0 %}
      {% for product in settings.products limit: 6 %}<li class="esr__item"><a class="esr__link" href="{{ product.settings.url | url }}">{% if product.settings.image %}<span class="esr__frame"><img class="esr__img" src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="1200" height="1500"></span>{% endif %}<span class="esr__name">{{ product.settings.title }}</span><span class="esr__price">{{ settings.from_label }} {{ product.settings.price }}</span></a></li>{% endfor %}
    {% else %}
      {% for product in products limit: 6 %}<li class="esr__item"><a class="esr__link" href="{{ product.settings.url | url }}">{% if product.settings.image %}<span class="esr__frame"><img class="esr__img" src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="1200" height="1500"></span>{% endif %}<span class="esr__name">{{ product.settings.title }}</span><span class="esr__price">{{ settings.from_label }} {{ product.settings.price }}</span></a></li>{% endfor %}
    {% endif %}
  </ul>
  <ul class="esr__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.note }}</li>{% endfor %}</ul>
</section>`,
  style: `
.esr { ${BOX} }
.esr__head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px 24px; margin-bottom: 32px; }
.esr__h { margin: 0; ${SERIF} font-size: clamp(2rem, 1.4rem + 3cqi, 4rem); letter-spacing: -0.02em; line-height: 1.02; }
.esr__all { display: inline-flex; min-height: 44px; align-items: center; color: inherit; ${SMALL} text-underline-offset: 5px; }
.esr__list { display: grid; gap: 36px 20px; margin: 0; padding: 0; list-style: none; }
.esr__link { display: grid; gap: 8px; color: inherit; text-decoration: none; }
.esr__frame { display: block; overflow: hidden; aspect-ratio: 4 / 5; }
.esr__img { width: 100%; height: 100%; object-fit: cover; transition: transform calc(var(--t-motion-duration, 650ms) * 1.2) var(--t-motion-ease, ease); }
.esr__name { ${SERIF} font-size: 1.625rem; letter-spacing: -0.01em; }
.esr__price { ${SMALL} opacity: 0.75; }
.esr__notes { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 40px 0 0; padding: 16px 0 0; border-top: 1px solid var(--s-border); list-style: none; ${SMALL} opacity: 0.8; }
@media (hover: hover) and (pointer: fine) { .esr:not([data-motion="off"]) .esr__link:hover .esr__img { transform: scale(var(--t-motion-scale, 1.06)); } }
@container (min-width: 760px) { .esr__list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .esr__item:nth-child(3n + 2) { margin-top: 64px; } }
@container (min-width: 1100px) { .esr__list { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .esr__img { transition: none; } }`,
  settings: [
    text("heading", "Heading", "The residences"),
    productList("products", "Residences (empty shows the newest)"),
    text("from_label", "Before the price", "From"),
    text("all_label", "Link to all", "Every residence"),
    url("all_url", "Link goes to", "/products"),
    ...motion(),
    scheme("site"),
    ...spacing(120, 120),
  ],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Breakfast included")] }],
  presetBlocks: ["Breakfast at the long table included", "Two nights at least on weekends", "Dogs welcome in the garden rooms"].map((note) => ({ type: "note", settings: { note } })),
  maxBlocks: 4,
})

/* ── a full-bleed photo break ── */
export const photoBreak = defineSection({
  type: "ai_es_break",
  name: "Photo break",
  summary: "A full-bleed photograph between chapters that drifts slower than the page (P3 parallax-depth), with one line set small in a corner.",
  template: `
<section class="esb" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esb__frame" data-storelib-motion="parallax-depth" data-motion-depth="{{ settings.depth }}">
    {% if settings.photo %}<img class="esb__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="2400" height="1350">{% endif %}
  </div>
  <ul class="esb__lines">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.line }}</li>{% endfor %}</ul>
</section>`,
  style: `
.esb { position: relative; overflow: hidden; background: var(--s-bg); color: #fff; container-type: inline-size; }
.esb__frame { height: clamp(420px, 80svh, 900px); overflow: hidden; }
.esb__img { width: 100%; height: 118%; object-fit: cover; }
.esb__lines { position: absolute; left: var(--theme-padding-x, 20px); bottom: 24px; display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; ${SMALL} text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5); }
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .esb:not([data-motion="off"]) .esb__img { animation: esb-drift linear both; animation-timeline: view(); }
  }
}
@keyframes esb-drift { from { transform: translateY(calc(var(--t-motion-parallax, 6%) * -1 * var(--m-k, 1))); } to { transform: translateY(calc(var(--t-motion-parallax, 6%) * var(--m-k, 1))); } }`,
  settings: [image("photo", "Photograph"), text("photo_alt", "Photograph description", "Lake and pine forest seen from the upper terrace at first light"), range("depth", "Parallax depth", 0, 0.6, 0.05, 0.3), ...motion(), scheme("site"), ...spacing(0, 0)],
  blocks: [{ type: "line", name: "Line", settings: [text("line", "Line", "The upper terrace, 6:40")] }],
  presetBlocks: [{ type: "line", settings: { line: "The upper terrace, 6:40 in May" } }],
  maxBlocks: 2,
})

/* ── amenities as a two column ruled list ── */
export const amenities = defineSection({
  type: "ai_es_amenities",
  name: "In the house",
  summary: "What the house has, as a ruled two column list: the thing and a short detail.",
  template: `
<section class="esa" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esa__grid">
    <h2 class="esa__h">{{ settings.heading }}</h2>
    <dl class="esa__list" data-storelib-motion="reveal-stagger">
      {% for block in section.blocks %}<div class="esa__row" data-block-id="{{ block.id }}"><dt>{{ block.settings.name }}</dt><dd>{{ block.settings.detail }}</dd></div>{% endfor %}
    </dl>
  </div>
</section>`,
  style: `
.esa { ${BOX} }
.esa__grid { display: grid; gap: 28px; }
.esa__h { margin: 0; ${SERIF} font-size: clamp(2rem, 1.4rem + 3cqi, 4rem); letter-spacing: -0.02em; line-height: 1.02; }
.esa__list { display: grid; margin: 0; border-top: 1px solid var(--s-border); }
.esa__row { display: grid; gap: 4px; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.esa__row dt { ${SERIF} font-size: 1.375rem; }
.esa__row dd { margin: 0; opacity: 0.78; line-height: 1.55; }
@container (min-width: 900px) { .esa__grid { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); } .esa__list { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 32px; } }
${revealCss("esa", ".esa__row", "esa-rise")}`,
  settings: [text("heading", "Heading", "In the house"), ...motion(), scheme("site"), ...spacing(120, 120)],
  blocks: [{ type: "item", name: "Item", settings: [text("name", "Thing", "Sauna"), text("detail", "Detail", "Wood fired, by the water")] }],
  presetBlocks: [
    { type: "item", settings: { name: "Sauna", detail: "Wood fired, at the end of the jetty" } },
    { type: "item", settings: { name: "Boats", detail: "Two rowing boats and a canoe, free for guests" } },
    { type: "item", settings: { name: "Library", detail: "In the old boathouse, open all night" } },
    { type: "item", settings: { name: "Kitchen garden", detail: "Help yourself to herbs for the room" } },
    { type: "item", settings: { name: "Bicycles", detail: "Six, with baskets, for the shore road" } },
    { type: "item", settings: { name: "Quiet", detail: "No televisions, a radio in every room" } },
  ],
  maxBlocks: 12,
})

/* ── sideways interior gallery ── */
export const gallery = defineSection({
  type: "ai_es_gallery",
  name: "Interiors",
  summary: "Interiors moving sideways while the section is pinned (P3 pin-horizontal), mixed widths like a contact sheet; a native swipe row on phones.",
  template: `
<section class="esg" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esg__head"><h2 class="esg__h">{{ settings.heading }}</h2><p class="esg__hint">{{ settings.hint }}</p></div>
  <ul class="esg__rail" data-storelib-motion="pin-horizontal" data-motion-distance="{{ section.blocks.size }}" tabindex="0" aria-label="{{ settings.heading }}">
    {% for block in section.blocks %}
      <li class="esg__item esg__item--{{ block.settings.width }}" data-block-id="{{ block.id }}">
        <figure class="esg__fig">{% if block.settings.photo %}<img src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="1600" height="1200">{% endif %}<figcaption>{{ block.settings.caption }}</figcaption></figure>
      </li>
    {% endfor %}
  </ul>
</section>`,
  style: `
.esg { ${BOX} overflow: hidden; }
.esg__head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 8px 24px; margin-bottom: 28px; }
.esg__h { margin: 0; ${SERIF} font-size: clamp(2rem, 1.4rem + 3cqi, 4rem); letter-spacing: -0.02em; line-height: 1.02; }
.esg__hint { margin: 0; ${SMALL} opacity: 0.7; }
.esg__rail { display: flex; gap: 14px; margin: 0; padding: 0 0 12px; list-style: none; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; }
.esg__item { flex: 0 0 82%; scroll-snap-align: start; }
.esg__fig { margin: 0; }
.esg__fig img { display: block; width: 100%; height: clamp(320px, 62svh, 720px); object-fit: cover; }
.esg__fig figcaption { margin-top: 10px; ${SMALL} opacity: 0.8; }
@container (min-width: 900px) { .esg__item { flex-basis: 38%; } .esg__item--wide { flex-basis: 58%; } }
@media (prefers-reduced-motion: reduce) { .esg__rail { scroll-snap-type: none; } }`,
  settings: [text("heading", "Heading", "Rooms and rooms between"), text("hint", "Small line", "Swipe or scroll"), ...motion(), scheme("site"), ...spacing(120, 120)],
  blocks: [{ type: "photo", name: "Photograph", settings: [image("photo", "Photograph"), text("alt", "Photograph description", ""), text("caption", "Caption", "Room four"), select("width", "Width", "normal", [["normal", "Normal"], ["wide", "Wide"]])] }],
  presetBlocks: [
    { type: "photo", settings: { caption: "Room one, the corner over the water", alt: "A bedroom with linen sheets and a wide window onto the lake", width: "wide" } },
    { type: "photo", settings: { caption: "The stair", alt: "An old timber staircase lit from a high window", width: "normal" } },
    { type: "photo", settings: { caption: "Room four, under the roof", alt: "An attic bedroom with exposed beams and a reading lamp", width: "normal" } },
    { type: "photo", settings: { caption: "The bath in room six", alt: "A freestanding stone bath beside a window with a view of pines", width: "wide" } },
  ],
  maxBlocks: 10,
})

/* ── the neighbourhood: distances, plainly ── */
export const location = defineSection({
  type: "ai_es_location",
  name: "Getting here",
  summary: "Where it is: a photograph of the approach, the address, and distances to the places people ask about, with a directions link.",
  template: `
<section class="esl" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esl__grid">
    {% if settings.photo %}<img class="esl__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1400" height="1750">{% endif %}
    <div class="esl__copy">
      <h2 class="esl__h">{{ settings.heading }}</h2>
      <p class="esl__addr">{{ settings.address }}</p>
      <dl class="esl__list">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.place }}</dt><dd>{{ block.settings.time }}</dd></div>{% endfor %}</dl>
      {% if settings.directions_url %}<a class="esl__link" href="{{ settings.directions_url | url }}">{{ settings.directions_label }}</a>{% endif %}
    </div>
  </div>
</section>`,
  style: `
.esl { ${BOX} }
.esl__grid { display: grid; gap: 32px; }
.esl__img { width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; }
.esl__h { margin: 0; ${SERIF} font-size: clamp(2rem, 1.4rem + 3cqi, 4rem); letter-spacing: -0.02em; line-height: 1.02; }
.esl__addr { margin: 14px 0 28px; line-height: 1.6; }
.esl__list { margin: 0; border-top: 1px solid var(--s-border); }
.esl__list div { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--s-border); }
.esl__list dd { margin: 0; font-variant-numeric: tabular-nums; opacity: 0.8; }
.esl__link { display: inline-flex; min-height: 48px; align-items: center; margin-top: 22px; color: inherit; ${SMALL} text-underline-offset: 5px; }
@container (min-width: 900px) { .esl__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 72px; } }`,
  settings: [
    text("heading", "Heading", "Getting here"),
    text("address", "Address", "Strandvägen 4, Halden north shore"),
    image("photo", "Photograph"),
    text("photo_alt", "Photograph description", "A gravel lane through birch trees leading to the house"),
    text("directions_label", "Directions link", "Directions"),
    url("directions_url", "Directions go to (a maps link)", "https://maps.google.com/?q=Halden"),
    ...motion(),
    scheme("site"),
    ...spacing(120, 120),
  ],
  blocks: [{ type: "distance", name: "Distance", settings: [text("place", "Place", "Train station"), text("time", "How far", "12 minutes by car")] }],
  presetBlocks: [
    { type: "distance", settings: { place: "Train station", time: "12 minutes by car" } },
    { type: "distance", settings: { place: "Old town", time: "25 minutes by bicycle" } },
    { type: "distance", settings: { place: "Airport", time: "1 hour 40" } },
  ],
  maxBlocks: 6,
})

/* ── questions ── */
export const faq = defineSection({
  type: "ai_es_faq",
  name: "Questions",
  summary: "What guests ask before they book, as native disclosures with a serif question.",
  template: `
<section class="esq" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esq__grid">
    <h2 class="esq__h">{{ settings.heading }}</h2>
    <div class="esq__list">
      {% for block in section.blocks %}<details class="esq__item" data-block-id="{{ block.id }}"><summary class="esq__q">{{ block.settings.question }}</summary><div class="esq__a">{{ block.settings.answer | raw }}</div></details>{% endfor %}
    </div>
  </div>
</section>`,
  style: `
.esq { ${BOX} }
.esq__grid { display: grid; gap: 28px; }
.esq__h { margin: 0; ${SERIF} font-size: clamp(2rem, 1.4rem + 3cqi, 4rem); letter-spacing: -0.02em; line-height: 1.02; }
.esq__list { border-top: 1px solid var(--s-border); }
.esq__item { border-bottom: 1px solid var(--s-border); }
.esq__q { display: flex; align-items: center; min-height: 64px; cursor: pointer; ${SERIF} font-size: 1.375rem; list-style: none; }
.esq__q::-webkit-details-marker { display: none; }
.esq__a { max-width: 58ch; padding-bottom: 20px; line-height: 1.7; opacity: 0.86; }
.esq__a p { margin: 0; }
@container (min-width: 900px) { .esq__grid { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); } }`,
  settings: [text("heading", "Heading", "Before you come"), ...motion(), scheme("site"), ...spacing(120, 120)],
  blocks: [{ type: "question", name: "Question", settings: [text("question", "Question", "Can we arrive late?"), richtext("answer", "Answer", "<p>Yes. Tell us your train and the door code comes by message.</p>")] }],
  presetBlocks: [
    { type: "question", settings: { question: "Can we arrive late?", answer: "<p>Yes. Tell us your train and the door code comes by message the afternoon you arrive.</p>" } },
    { type: "question", settings: { question: "Is dinner every night?", answer: "<p>Thursday to Sunday at eight, for guests only. On other nights we book you a table in town.</p>" } },
    { type: "question", settings: { question: "Can we take the whole house?", answer: "<p>From November to March, yes. Write to us with your dates.</p>" } },
  ],
  maxBlocks: 10,
})

/* ── enquiry band ── */
export const enquire = defineSection({
  type: "ai_es_enquire",
  name: "Enquiry",
  summary: "The last ask: a big serif line over a dimmed photograph, one action, and the ways to reach a person.",
  template: `
<section class="ese" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  {% if settings.photo %}<img class="ese__bg" src="{{ settings.photo | asset }}" alt="" width="2400" height="1350">{% endif %}
  <div class="ese__in">
    <h2 class="ese__h">{{ settings.heading }}</h2>
    <a class="ese__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
    <ul class="ese__ways">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><span>{{ block.settings.label }}</span> {% if block.settings.link %}<a href="{{ block.settings.link | url }}">{{ block.settings.value }}</a>{% else %}{{ block.settings.value }}{% endif %}</li>{% endfor %}</ul>
  </div>
</section>`,
  style: `
.ese { ${BOX} position: relative; overflow: hidden; }
.ese__bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.32; }
.ese__in { position: relative; display: grid; justify-items: start; gap: 26px; }
.ese__h { margin: 0; max-width: 18ch; ${SERIF} font-size: clamp(2.5rem, 1.6rem + 5cqi, 6.5rem); letter-spacing: -0.025em; line-height: 1; }
.ese__btn { display: inline-flex; align-items: center; min-height: 54px; padding: 0 28px; background: var(--s-btn); color: var(--s-btn-text); ${SMALL} text-decoration: none; transition: background-color var(--t-motion-hover, 200ms) ease; }
.ese__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.ese__ways { display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 0; padding: 0; list-style: none; }
.ese__ways span { ${SMALL} opacity: 0.7; }
.ese__ways a { color: inherit; }
${revealCss("ese", ".ese__h", "ese-rise")}`,
  settings: [
    text("heading", "Heading", "Write to us about your dates"),
    text("cta_label", "Button", "Make an enquiry"),
    url("cta_url", "Button goes to", "/contact"),
    image("photo", "Photograph behind"),
    ...motion(),
    scheme("site"),
    ...spacing(140, 140),
  ],
  blocks: [{ type: "way", name: "Way to reach", settings: [text("label", "Label", "Telephone"), text("value", "Shown as", "+46 522 100 40"), url("link", "Link (tel:, mailto:)", "tel:+4652210040")] }],
  presetBlocks: [
    { type: "way", settings: { label: "Telephone", value: "+46 522 100 40", link: "tel:+4652210040" } },
    { type: "way", settings: { label: "Email", value: "stay@halden.house", link: "mailto:stay@halden.house" } },
  ],
  maxBlocks: 4,
})

/* ── footer: the name set big, columns, newsletter, preferences ── */
export const footer = defineSection({
  type: "ai_es_footer",
  name: "Footer",
  kind: "footer",
  summary: "Multi-column footer: the footer menu, the address, a newsletter line, language and currency, and the name set across the width.",
  template: `
<footer class="eso" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <div class="eso__grid">
    <div class="eso__col"><p class="eso__k">{{ settings.address_label }}</p><p class="eso__v">{{ settings.address }}</p></div>
    <nav class="eso__nav" aria-label="{{ settings.nav_label }}">
      {% for link in settings.menu.links %}<div class="eso__col"><a class="eso__k" href="{{ link.url }}">{{ link.title }}</a>{% if link.links.size > 0 %}<ul>{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>{% endif %}</div>{% endfor %}
    </nav>
    <form class="eso__form" data-storelib-form="subscribe">
      <label class="eso__k" for="eso-e-{{ section.id }}">{{ settings.newsletter_label }}</label>
      <div class="eso__row"><input id="eso-e-{{ section.id }}" type="email" name="email" autocomplete="email" required placeholder="{{ settings.email_placeholder }}"><button type="submit">{{ settings.button_label }}</button></div>
    </form>
  </div>
  <p class="eso__name" aria-hidden="true">{{ settings.wordmark | default: shop.name }}</p>
  <div class="eso__base">${prefs("eso")}<p class="eso__small">{{ settings.small_print }}</p></div>
</footer>`,
  style: `
.eso { padding: 80px var(--theme-padding-x, 20px) 28px; background: var(--s-bg); color: var(--s-text); border-top: 1px solid var(--s-border); container-type: inline-size; overflow: hidden; }
.eso__grid { display: grid; gap: 36px; }
.eso__nav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.eso__k { display: inline-flex; min-height: 32px; align-items: center; margin: 0 0 6px; font-size: 0.8125rem; letter-spacing: 0.04em; color: var(--s-accent); text-decoration: none; }
.eso__v { margin: 0; line-height: 1.6; }
.eso__col ul { margin: 0; padding: 0; list-style: none; }
.eso__col li a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; text-decoration: none; }
.eso__row { display: flex; gap: 0; border-bottom: 1px solid var(--s-text); }
.eso__row input { flex: 1; min-width: 0; min-height: 48px; border: 0; background: none; color: inherit; font: inherit; }
.eso__row button { min-height: 48px; padding: 0 4px 0 14px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.eso__name { margin: 64px 0 24px; font-family: var(--theme-font-heading), serif; font-weight: 300; color: var(--s-heading); font-size: 21cqi; line-height: 0.85; letter-spacing: -0.03em; white-space: nowrap; overflow: hidden; }
.eso__base { display: grid; gap: 14px; padding-top: 18px; border-top: 1px solid var(--s-border); }
.eso__small { margin: 0; font-size: 0.8125rem; opacity: 0.7; }
${panelCss("eso")}
@container (min-width: 900px) { .eso__grid { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.4fr) minmax(0, 1fr); } .eso__nav { grid-template-columns: repeat(3, minmax(0, 1fr)); } .eso__base { grid-template-columns: minmax(0, 1fr) auto; align-items: center; } }`,
  settings: [
    menu("menu", "Footer menu", "footer"),
    text("address_label", "Address label", "Halden"),
    textarea("address", "Address", "Strandvägen 4, north shore. Reception 8 to 22."),
    text("newsletter_label", "Newsletter line", "Letters from the lake, four a year"),
    text("email_placeholder", "Email hint", "Email address"),
    text("button_label", "Subscribe button", "Sign up"),
    text("wordmark", "Name across the bottom (empty uses the shop name)", "Halden"),
    text("small_print", "Small print", "A guest house on the north shore since 2024."),
    text("nav_label", "Menu name (read aloud)", "Footer"),
    text("language_label", "Language", "Language"),
    text("currency_label", "Currency", "Currency"),
    scheme("site"),
  ],
})

/* ── product: one residence ── */
export const product = defineSection({
  type: "ai_es_product",
  name: "Residence",
  summary: "One residence or suite: its photographs stacked large, the serif name, the price, its options to reserve, offers, the description, and what every stay includes.",
  template: `
<section class="esp" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esp__grid">
    <div class="esp__media">{% for img in product.images limit: 5 %}<img class="esp__img" src="{{ img }}" alt="{{ product.title }}" width="1600" height="1100">{% endfor %}</div>
    <div class="esp__info">
      <h1 class="esp__title">{{ product.title }}</h1>
      <p class="esp__price">{{ settings.from_label }} {{ product.price }}</p>
      {% if page.product.settings.variants.size > 0 %}
        <div class="esp__opts" role="group" aria-label="{{ settings.options_label }}">{% for v in page.product.settings.variants %}<button class="esp__opt" type="button" data-storelib-add-to-cart="{{ product.id }}" data-variant-id="{{ v.id }}" data-title="{{ product.title }}" data-price="{{ v.price }}">{{ v.name }} <span>{{ v.price }}</span></button>{% endfor %}</div>
      {% else %}
        <button class="esp__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.title }}" data-price="{{ product.price }}" data-url="{{ product.url }}">{{ settings.add_label }}</button>
      {% endif %}
      <div data-storelib-island data-storelib-offers="{{ product.id }}" data-title="{{ product.title }}" data-url="{{ product.url }}" data-layout="open"></div>
      {% if product.description_html %}<div class="esp__desc">{{ product.description_html | raw }}</div>{% endif %}
      <p class="esp__inc-h">{{ settings.includes_heading }}</p>
      <ul class="esp__inc">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.line }}</li>{% endfor %}</ul>
    </div>
  </div>
</section>`,
  style: `
.esp { ${BOX} }
.esp__grid { display: grid; gap: 32px; }
.esp__media { display: grid; gap: 8px; }
.esp__img { width: 100%; height: auto; aspect-ratio: 16 / 11; object-fit: cover; }
.esp__title { margin: 0; ${SERIF} font-size: clamp(2.5rem, 1.6rem + 4cqi, 5rem); letter-spacing: -0.025em; line-height: 1; }
.esp__price { margin: 14px 0 24px; ${SMALL} }
.esp__opts { display: grid; gap: 8px; }
.esp__opt, .esp__add { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 54px; padding: 0 20px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; }
.esp__add { justify-content: center; border: 0; background: var(--s-btn); color: var(--s-btn-text); }
.esp__desc { margin-top: 26px; line-height: 1.75; max-width: 58ch; }
.esp__inc-h { margin: 28px 0 8px; ${SMALL} color: var(--s-accent); }
.esp__inc { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.esp__inc li { padding: 12px 0; border-bottom: 1px solid var(--s-border); }
@container (min-width: 900px) { .esp__grid { grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.9fr); align-items: start; gap: 56px; } .esp__info { position: sticky; top: 96px; } }`,
  settings: [
    text("from_label", "Before the price", "From"),
    text("add_label", "Reserve button", "Reserve"),
    text("options_label", "Options (read aloud)", "Choose your dates"),
    text("includes_heading", "Every stay includes", "Every stay includes"),
    ...motion(),
    scheme("site"),
    ...spacing(110, 110),
  ],
  blocks: [{ type: "include", name: "Included", settings: [text("line", "Line", "Breakfast at the long table")] }],
  presetBlocks: ["Breakfast at the long table", "The sauna and the boats", "Late checkout on Sundays"].map((line) => ({ type: "include", settings: { line } })),
  maxBlocks: 8,
})

/* ── collection ── */
export const collection = defineSection({
  type: "ai_es_collection",
  name: "Collection",
  summary: "A collection of residences as a staggered two and three column list: photograph, serif name, price, reserve.",
  template: `
<section class="esk" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h1 class="esk__h">{% if collection.title %}{{ collection.title }}{% else %}{{ settings.heading }}{% endif %}</h1>
  {% if collection.description %}<p class="esk__intro">{{ collection.description }}</p>{% endif %}
  {% if page.query %}<p class="esk__intro">{{ settings.query_label }} {{ page.query }}</p>{% endif %}
  <ul class="esk__list">
    {% for product in products %}
      <li class="esk__item"><a class="esk__link" href="{{ product.settings.url | url }}">{% if product.settings.image %}<img class="esk__img" src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="1200" height="1500">{% endif %}<span class="esk__name">{{ product.settings.title }}</span><span class="esk__price">{{ settings.from_label }} {{ product.settings.price }}</span></a>
      <button class="esk__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button></li>
    {% endfor %}
  </ul>
  <ul class="esk__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.note }}</li>{% endfor %}</ul>
</section>`,
  style: `
.esk { ${BOX} }
.esk__h { margin: 0; ${SERIF} font-size: clamp(2.75rem, 1.6rem + 5cqi, 6rem); letter-spacing: -0.025em; line-height: 1; }
.esk__intro { max-width: 52ch; margin: 16px 0 0; line-height: 1.7; opacity: 0.86; }
.esk__list { display: grid; gap: 40px 20px; margin: 48px 0 0; padding: 0; list-style: none; }
.esk__link { display: grid; gap: 8px; color: inherit; text-decoration: none; }
.esk__img { width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; }
.esk__name { ${SERIF} font-size: 1.625rem; }
.esk__price { ${SMALL} opacity: 0.75; }
.esk__add { margin-top: 10px; min-height: 46px; padding: 0 18px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; ${SMALL} cursor: pointer; }
.esk__notes { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 48px 0 0; padding: 16px 0 0; border-top: 1px solid var(--s-border); list-style: none; ${SMALL} opacity: 0.8; }
@container (min-width: 760px) { .esk__list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .esk__item:nth-child(even) { margin-top: 80px; } }
@container (min-width: 1100px) { .esk__list { grid-template-columns: repeat(3, minmax(0, 1fr)); } .esk__item:nth-child(even) { margin-top: 0; } .esk__item:nth-child(3n + 2) { margin-top: 80px; } }`,
  settings: [text("heading", "Heading when there is no collection", "Residences"), text("query_label", "Before the search words", "Results for"), text("from_label", "Before the price", "From"), text("add_label", "Reserve button", "Reserve"), ...motion(), scheme("site"), ...spacing(120, 120)],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Prices per night for two")] }],
  presetBlocks: ["Prices per night for two", "Breakfast included", "Free cancellation up to 14 days before"].map((note) => ({ type: "note", settings: { note } })),
  maxBlocks: 4,
})

/* ── about ── */
export const about = defineSection({
  type: "ai_es_about",
  name: "The story",
  summary: "The story of the place: a tall photograph beside the words, then the people who keep it, each with what they look after.",
  template: `
<section class="esab" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esab__grid">
    <div class="esab__copy">
      <h1 class="esab__h">{{ settings.heading }}</h1>
      <div class="esab__story">{{ settings.story | raw }}</div>
    </div>
    {% if settings.photo %}<img class="esab__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1400" height="1800" data-storelib-motion="parallax-depth" data-motion-depth="0.12">{% endif %}
  </div>
  <ul class="esab__people">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><h2 class="esab__role">{{ block.settings.role }}</h2><p>{{ block.settings.text }}</p></li>{% endfor %}</ul>
</section>`,
  style: `
.esab { ${BOX} }
.esab__grid { display: grid; gap: 36px; }
.esab__h { margin: 0; ${SERIF} font-size: clamp(2.75rem, 1.6rem + 5cqi, 6rem); letter-spacing: -0.025em; line-height: 1; max-width: 14ch; }
.esab__story { margin-top: 24px; max-width: 54ch; line-height: 1.8; font-size: 1.0625rem; }
.esab__img { width: 100%; height: auto; aspect-ratio: 7 / 9; object-fit: cover; }
.esab__people { display: grid; gap: 0; margin: 72px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.esab__people li { display: grid; gap: 6px; padding: 20px 0; border-bottom: 1px solid var(--s-border); }
.esab__role { margin: 0; ${SERIF} font-size: 1.5rem; }
.esab__people p { margin: 0; opacity: 0.82; line-height: 1.6; }
@container (min-width: 900px) { .esab__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr); align-items: end; gap: 72px; } .esab__people li { grid-template-columns: 16rem minmax(0, 1fr); } }
${revealCss("esab", ".esab__people li", "esab-rise")}`,
  settings: [
    text("heading", "Heading", "A boatbuilder's house, kept"),
    richtext("story", "Story", "<p>The house was built in 1931 by a family who built rowing boats in the shed below. When it came up for sale we bought it to stop it becoming flats.</p><p>Two years of slow repair later, it takes six sets of guests at a time.</p>"),
    image("photo", "Photograph"),
    text("photo_alt", "Photograph description", "The timber facade of the house with a rowing boat pulled up on the shore"),
    ...motion(),
    scheme("site"),
    ...spacing(110, 120),
  ],
  blocks: [{ type: "person", name: "Who keeps it", settings: [text("role", "Role", "The kitchen"), textarea("text", "What they look after", "")] }],
  presetBlocks: [
    { type: "person", settings: { role: "The kitchen", text: "Dinner four nights a week from the lake, the garden and two farms up the valley." } },
    { type: "person", settings: { role: "The rooms", text: "Linen dried outside in summer, wool blankets from the mill in town." } },
    { type: "person", settings: { role: "The boats", text: "Varnished every April, lent to any guest who can row." } },
  ],
  maxBlocks: 6,
})

/* ── contact ── */
export const contact = defineSection({
  type: "ai_es_contact",
  name: "Enquiry form",
  summary: "Contact page: a calm enquiry form beside the house's details, each a link.",
  template: `
<section class="esx" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="esx__grid">
    <div>
      <h1 class="esx__h">{{ settings.heading }}</h1>
      <div class="esx__text">{{ settings.text | raw }}</div>
      <dl class="esx__ways">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{% if block.settings.link %}<a href="{{ block.settings.link | url }}">{{ block.settings.value }}</a>{% else %}{{ block.settings.value }}{% endif %}</dd></div>{% endfor %}</dl>
    </div>
    <form class="esx__form" data-storelib-form="contact">
      <label class="esx__f"><span>{{ settings.name_label }}</span><input name="name" type="text" autocomplete="name" maxlength="120" required></label>
      <label class="esx__f"><span>{{ settings.email_label }}</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <label class="esx__f"><span>{{ settings.dates_label }}</span><input name="subject" type="text" maxlength="150"></label>
      <label class="esx__f"><span>{{ settings.message_label }}</span><textarea name="message" rows="5" maxlength="5000" required></textarea></label>
      <button class="esx__send" type="submit">{{ settings.send_label }}</button>
    </form>
  </div>
</section>`,
  style: `
.esx { ${BOX} }
.esx__grid { display: grid; gap: 48px; }
.esx__h { margin: 0; ${SERIF} font-size: clamp(2.75rem, 1.6rem + 5cqi, 6rem); letter-spacing: -0.025em; line-height: 1; }
.esx__text { max-width: 46ch; margin-top: 18px; line-height: 1.75; }
.esx__ways { margin: 32px 0 0; border-top: 1px solid var(--s-border); }
.esx__ways div { display: grid; gap: 2px; padding: 14px 0; border-bottom: 1px solid var(--s-border); }
.esx__ways dt { ${SMALL} color: var(--s-accent); }
.esx__ways dd { margin: 0; }
.esx__ways a { color: inherit; }
.esx__form { display: grid; gap: 18px; align-content: start; }
.esx__f { display: grid; gap: 6px; ${SMALL} }
.esx__f input, .esx__f textarea { min-height: 50px; padding: 10px 0; border: 0; border-bottom: 1px solid var(--s-text); background: none; color: inherit; font: inherit; font-size: 1.0625rem; letter-spacing: 0; }
.esx__send { justify-self: start; min-height: 54px; padding: 0 30px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; ${SMALL} cursor: pointer; }
@container (min-width: 900px) { .esx__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 80px; } }`,
  settings: [
    text("heading", "Heading", "Write to the house"),
    richtext("text", "Words", "<p>Tell us your dates and who is coming. Ingrid or Jonas will answer within a day, usually sooner.</p>"),
    text("name_label", "Name field", "Your name"),
    text("email_label", "Email field", "Email"),
    text("dates_label", "Dates field", "Dates you have in mind"),
    text("message_label", "Message field", "Anything we should know"),
    text("send_label", "Send button", "Send enquiry"),
    ...motion(),
    scheme("site"),
    ...spacing(110, 120),
  ],
  blocks: [{ type: "way", name: "Detail", settings: [text("label", "Label", "Telephone"), text("value", "Shown as", "+46 522 100 40"), url("link", "Link (tel:, mailto:, a maps link)", "tel:+4652210040")] }],
  presetBlocks: [
    { type: "way", settings: { label: "Telephone", value: "+46 522 100 40", link: "tel:+4652210040" } },
    { type: "way", settings: { label: "Email", value: "stay@halden.house", link: "mailto:stay@halden.house" } },
    { type: "way", settings: { label: "Address", value: "Strandvägen 4, Halden north shore", link: "https://maps.google.com/?q=Halden" } },
  ],
  maxBlocks: 6,
})

export const ALL = [header, hero, intro, chapters, residences, photoBreak, amenities, gallery, location, faq, enquire, footer, product, collection, about, contact]
