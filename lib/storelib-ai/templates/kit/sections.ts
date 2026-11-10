/**
 * ===========================================================================
 *  THE TEMPLATE KIT'S WORKING SECTIONS
 * ===========================================================================
 * The sections every whole site needs and that must WORK, not only look
 * right: the product page (pictures, price, options, add to cart, buy now,
 * offers, description, details), the collection, shop and search lists
 * (the store's own products), contact with the creator's real form, a
 * product rail from the creator's chosen products, questions, a running
 * band, a page opening, a closing call, a sticky method, a photo collage
 * and a statement. Each takes the template's words, filled blocks and CSS
 * skin, so the same working structure wears six different designs.
 *
 * Motion is the round O5 kind (CSS first, transform and opacity, a view
 * timeline in @supports, still under prefers-reduced-motion), and every
 * moving element also carries the round P3 island's data attribute
 * (data-storelib-motion="reveal-stagger|marquee|parallax-depth|...") so the
 * trusted runtime can take it further where it is loaded.
 *
 * Pure. Browser safe.
 */
import { BOX, DISPLAY, INNER, LABEL, motion, rootAttrs, s, spacing, type ComponentDef, type PresetBlock } from "./schema"
import { formPolishCss, icon } from "./chrome-parts"

/** A reveal on a view timeline, in @supports and only for visitors who welcome motion. The still state is the default. */
export function reveal(root: string, target: string, name: string): string {
  return `
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    ${root}:not([data-motion="off"]) ${target} { animation: ${name} linear both; animation-timeline: view(); animation-range: entry 0% entry 55%; }
    @keyframes ${name} { from { opacity: 0; transform: translateY(calc(var(--t-motion-distance, 24px) * var(--m-k, 1))); } }
  }
}`
}

/** One product card: the store's own (a `products` entry or a product_list entry, both block shaped). */
export function productCard(cls: string, v: string, opts: { add?: boolean; addLabel?: string; kind?: boolean } = {}): string {
  return `<li class="${cls}">
        <a class="${cls}-link" href="{{ ${v}.settings.url | url }}">
          <span class="${cls}-media">{% if ${v}.settings.image %}<img src="{{ ${v}.settings.image }}" alt="{{ ${v}.settings.title }}" width="900" height="1125" loading="lazy">{% else %}<span class="${cls}-stand" aria-hidden="true">{{ ${v}.settings.title }}</span>{% endif %}</span>
          <span class="${cls}-name">{{ ${v}.settings.title }}</span>
          <span class="${cls}-price">{{ ${v}.settings.price }}{% if ${v}.settings.compare_price %} <s>{{ ${v}.settings.compare_price }}</s>{% endif %}</span>
        </a>${opts.add ? `
        <button class="${cls}-add" type="button" data-storelib-add-to-cart="{{ ${v}.id }}" data-title="{{ ${v}.settings.title }}" data-price="{{ ${v}.settings.price }}" data-image="{{ ${v}.settings.image }}" data-url="{{ ${v}.settings.url }}">{{ settings.add_label }}</button>` : ""}
      </li>`
}

/* ── the product page ──────────────────────────────────────────────────── */

export interface ProductMainOptions {
  type: string
  scheme?: string
  words: { kicker: string; add: string; buy: string; options: string }
  details: { title: string; text: string }[]
  skin?: string
}

export function productMain(o: ProductMainOptions): ComponentDef {
  return {
    type: o.type,
    name: "Product",
    category: "product",
    template: `
<section class="pd" ${rootAttrs({ motion: true })}>
  <div class="pd__in">
    <div class="pd__media">
      {% for image in product.images %}
      <figure class="pd__shot" data-storelib-motion="reveal-stagger"><img src="{{ image }}" alt="{{ product.title }}" width="1200" height="1500" {% if forloop.first %}fetchpriority="high"{% else %}loading="lazy"{% endif %}></figure>
      {% else %}
      <div class="pd__stand" aria-hidden="true"><span class="pd__stand-word">{{ product.title }}</span></div>
      {% endfor %}
    </div>
    <div class="pd__info">
      <div class="pd__sticky">
        {% if settings.kicker %}<p class="pd__kicker">{{ settings.kicker }}</p>{% endif %}
        <h1 class="pd__title">{{ product.title }}</h1>
        <p class="pd__price">{{ product.price }}{% if product.compare_price %} <s class="pd__was">{{ product.compare_price }}</s>{% endif %}</p>
        {% if page.product.settings.variants.size > 0 %}
        <div class="pd__options" role="group" aria-label="{{ settings.options_label }}">
          {% for v in page.product.settings.variants %}
          <button class="pd__option" type="button" data-storelib-add-to-cart="{{ product.id }}" data-variant-id="{{ v.id }}" data-title="{{ product.title }}" data-price="{{ v.price }}" data-url="{{ product.url }}">{{ v.name }} <span class="pd__option-price">{{ v.price }}</span></button>
          {% endfor %}
        </div>
        {% else %}
        <div class="pd__buy-row">
          <button class="pd__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.title }}" data-price="{{ product.price }}" data-url="{{ product.url }}">{{ settings.add_label }}</button>
          {% if page.product.settings.checkout_url %}<a class="pd__buy" href="{{ page.product.settings.checkout_url | url }}">{{ settings.buy_label }}</a>{% endif %}
        </div>
        {% endif %}
        <div data-storelib-island data-storelib-offers="{{ product.id }}" data-title="{{ product.title }}" data-url="{{ product.url }}" data-layout="open"></div>
        {% if product.description_html %}<div class="pd__desc">{{ product.description_html | raw }}</div>{% endif %}
        <div class="pd__details">
          {% for block in section.blocks %}
          <details class="pd__detail" {{ block.shopify_attributes }}><summary class="pd__detail-q">{{ block.settings.title }}</summary><div class="pd__detail-a">{{ block.settings.text | raw }}</div></details>
          {% endfor %}
        </div>
      </div>
    </div>
  </div>
</section>`,
    style: `
.pd { ${BOX} }
.pd__in { display: grid; gap: clamp(24px, 4vw, 56px); ${INNER} }
.pd__media { display: grid; gap: 8px; }
.pd__shot { margin: 0; overflow: hidden; background: var(--s-surface); }
.pd__shot img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; }
.pd__stand { display: grid; place-items: end start; aspect-ratio: 4 / 5; padding: clamp(20px, 4vw, 40px); background: var(--s-surface); border: 1px solid var(--s-border); overflow: hidden; }
.pd__stand-word { ${DISPLAY} font-size: clamp(2.5rem, 12cqi, 7rem); line-height: 0.9; letter-spacing: -0.03em; overflow-wrap: anywhere; }
.pd__kicker { margin: 0 0 12px; font-size: 0.875rem; color: var(--s-muted); }
.pd__title { margin: 0; ${DISPLAY} font-size: clamp(2.25rem, 1.4rem + 4cqi, 4.5rem); line-height: 0.95; letter-spacing: -0.025em; overflow-wrap: anywhere; }
.pd__price { margin: 16px 0 24px; font-size: 1.375rem; font-variant-numeric: tabular-nums; }
.pd__was { color: var(--s-muted); }
.pd__options { display: grid; gap: 8px; }
.pd__option { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 56px; padding: 0 18px; border: 1px solid var(--s-border); border-radius: var(--theme-button-radius, 0); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: border-color var(--t-motion-hover, 200ms) ease, background-color var(--t-motion-hover, 200ms) ease; }
.pd__option:hover { border-color: var(--s-accent); }
.pd__option-price { font-variant-numeric: tabular-nums; }
.pd__buy-row { display: grid; gap: 8px; }
.pd__add, .pd__buy { display: inline-flex; align-items: center; justify-content: center; min-height: 56px; padding: 0 24px; border: 1px solid var(--s-btn); border-radius: var(--theme-button-radius, 0); font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; transition: background-color var(--t-motion-hover, 200ms) ease, color var(--t-motion-hover, 200ms) ease; }
.pd__add { background: var(--s-btn); color: var(--s-btn-text); }
.pd__add:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.pd__buy { background: none; color: var(--s-text); border-color: var(--s-border); }
.pd__buy:hover { border-color: var(--s-text); }
.pd__desc { margin-top: 28px; max-width: 40rem; line-height: 1.65; }
.pd__details { margin-top: 28px; border-top: 1px solid var(--s-border); }
.pd__detail { border-bottom: 1px solid var(--s-border); }
.pd__detail-q { display: flex; align-items: center; justify-content: space-between; min-height: 56px; cursor: pointer; font-weight: 600; list-style: none; }
.pd__detail-q::-webkit-details-marker { display: none; }
.pd__detail-q::after { content: "+"; font-weight: 400; }
.pd__detail[open] .pd__detail-q::after { content: "\\2212"; }
.pd__detail-a { padding-bottom: 18px; line-height: 1.65; color: var(--s-muted); }
.pd__detail-a p { margin: 0 0 8px; }
@container (min-width: 900px) {
  .pd__in { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: start; }
  .pd__sticky { position: sticky; top: calc(var(--hd-h, 72px) + 24px); }
  .pd__buy-row { grid-template-columns: 1fr 1fr; }
}
${reveal(".pd", ".pd__shot:not(:first-child)", `${o.type}_in`)}
${o.skin ?? ""}`,
    settings: [s.text("kicker", "Small line above the name", o.words.kicker), s.text("add_label", "Add to bag button", o.words.add), s.text("buy_label", "Buy now button", o.words.buy), s.text("options_label", "Options (read aloud)", o.words.options), s.scheme(o.scheme ?? "site"), ...motion(), ...spacing(48, 96)],
    blocks: [{ type: "detail", name: "Detail", limit: 6, settings: [s.text("title", "Title", "Delivery"), s.rich("text", "Text", "<p>Packed and sent within two working days.</p>")] }],
    maxBlocks: 6,
    preset: o.details.map((d) => ({ type: "detail", settings: { title: d.title, text: d.text } })),
  }
}

/* ── the collection, the shop and search ───────────────────────────────── */

export interface CollectionOptions {
  type: string
  scheme?: string
  words: { heading: string; intro: string; results: string; empty: string; add: string }
  notes: string[]
  columns?: number
  skin?: string
}

export function collectionGrid(o: CollectionOptions): ComponentDef {
  return {
    type: o.type,
    name: "Product list",
    category: "collection",
    template: `
<section class="cg" ${rootAttrs({ motion: true })}>
  <div class="cg__in">
    <div class="cg__head">
      <h1 class="cg__h">{% if page.query %}{{ settings.results_label }} {{ page.query }}{% elsif collection.title %}{{ collection.title }}{% else %}{{ settings.heading }}{% endif %}</h1>
      {% if collection.description %}<div class="cg__intro">{{ collection.description }}</div>{% else %}<div class="cg__intro">{{ settings.intro | raw }}</div>{% endif %}
      <ul class="cg__notes">{% for block in section.blocks %}<li class="cg__note" {{ block.shopify_attributes }}>{{ block.settings.text }}</li>{% endfor %}</ul>
    </div>
    <ul class="cg__grid" data-storelib-motion="reveal-stagger" style="--cg-cols: {{ settings.columns }};">
      {% for product in products %}
      ${productCard("cg__card", "product", { add: true })}
      {% else %}
      <li class="cg__none">{{ settings.empty_text }}</li>
      {% endfor %}
    </ul>
  </div>
</section>`,
    style: `
.cg { ${BOX} }
.cg__in { ${INNER} }
.cg__head { display: grid; gap: 14px; margin-bottom: clamp(28px, 5vw, 56px); }
.cg__h { margin: 0; ${DISPLAY} font-size: clamp(2.5rem, 1.4rem + 6cqi, 6.5rem); line-height: 0.9; letter-spacing: -0.03em; overflow-wrap: anywhere; }
.cg__intro { max-width: 40rem; color: var(--s-muted); line-height: 1.6; }
.cg__intro p { margin: 0; }
.cg__notes { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0; padding: 0; list-style: none; font-size: 0.875rem; }
.cg__note { display: inline-flex; align-items: center; gap: 8px; }
.cg__note::before { content: ""; width: 6px; height: 6px; background: var(--s-accent); }
.cg__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 12px; margin: 0; padding: 0; list-style: none; }
.cg__card { display: grid; gap: 10px; align-content: start; min-width: 0; }
.cg__card-link { display: grid; gap: 8px; color: inherit; text-decoration: none; }
.cg__card-media { display: block; aspect-ratio: 4 / 5; overflow: hidden; background: var(--s-surface); }
.cg__card-media img { width: 100%; height: 100%; object-fit: cover; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.cg__card-stand { display: flex; align-items: flex-end; width: 100%; height: 100%; padding: 14px; ${DISPLAY} font-size: clamp(1.25rem, 5cqi, 2.25rem); line-height: 0.95; overflow-wrap: anywhere; border: 1px solid var(--s-border); }
.cg__card-name { font-weight: 600; overflow-wrap: anywhere; }
.cg__card-price { font-variant-numeric: tabular-nums; color: var(--s-muted); }
.cg__card-add { justify-self: start; min-height: 44px; padding: 0 16px; border: 1px solid var(--s-border); border-radius: var(--theme-button-radius, 0); background: none; color: inherit; font: inherit; cursor: pointer; }
.cg__card-add:hover { border-color: var(--s-accent); color: var(--s-accent); }
.cg__none { grid-column: 1 / -1; padding: 48px 0; color: var(--s-muted); }
@media (hover: hover) and (pointer: fine) { .cg__card-link:hover .cg__card-media img { transform: scale(calc(1 + 0.04 * var(--m-k, 1))); } }
@container (min-width: 900px) { .cg__grid { grid-template-columns: repeat(var(--cg-cols, 3), minmax(0, 1fr)); gap: 48px 20px; } }
${reveal(".cg", ".cg__card", `${o.type}_in`)}
${o.skin ?? ""}`,
    settings: [
      s.text("heading", "Heading when there is no collection", o.words.heading),
      s.rich("intro", "Text when the collection has none", o.words.intro),
      s.text("results_label", "Search results, before the words searched", o.words.results),
      s.text("empty_text", "When there is nothing to show", o.words.empty),
      s.text("add_label", "Add to bag button", o.words.add),
      s.range("columns", "Columns on a computer", 2, 5, 1, "", o.columns ?? 3),
      s.scheme(o.scheme ?? "site"),
      ...motion(),
      ...spacing(64, 112),
    ],
    blocks: [{ type: "note", name: "Short note", limit: 4, settings: [s.text("text", "Text", "Sent in two working days")] }],
    maxBlocks: 4,
    preset: o.notes.map((text) => ({ type: "note", settings: { text } })),
  }
}

/* ── a rail of the creator's chosen products ───────────────────────────── */

export interface RailOptions {
  type: string
  name?: string
  scheme?: string
  words: { heading: string; text: string; add: string }
  tiles: { title: string; text: string; label: string; url: string }[]
  count?: number
  skin?: string
}

export function productRail(o: RailOptions): ComponentDef {
  return {
    type: o.type,
    name: o.name ?? "Chosen products",
    category: "product",
    template: `
<section class="pr" ${rootAttrs({ motion: true })}>
  <div class="pr__in">
    <div class="pr__head"><h2 class="pr__h">{{ settings.heading | raw }}</h2><div class="pr__text">{{ settings.text | raw }}</div></div>
    <ul class="pr__list" data-storelib-motion="reveal-stagger" data-motion-effect="rise">
      {% for p in settings.products %}
      ${productCard("pr__card", "p", { add: true })}
      {% else %}
      {% for p in products limit: settings.count %}
      ${productCard("pr__card", "p", { add: true })}
      {% endfor %}
      {% endfor %}
      {% for block in section.blocks %}
      <li class="pr__tile" {{ block.shopify_attributes }}><a class="pr__tile-link" href="{{ block.settings.url | url }}"><span class="pr__tile-title">{{ block.settings.title }}</span><span class="pr__tile-text">{{ block.settings.text }}</span><span class="pr__tile-cta">{{ block.settings.label }}</span></a></li>
      {% endfor %}
    </ul>
  </div>
</section>`,
    style: `
.pr { ${BOX} overflow: hidden; }
.pr__in { ${INNER} }
.pr__head { display: grid; gap: 12px; margin-bottom: clamp(24px, 4vw, 48px); }
.pr__h { margin: 0; ${DISPLAY} font-size: clamp(2rem, 1.2rem + 4cqi, 4.5rem); line-height: 0.95; letter-spacing: -0.025em; max-width: 16ch; }
.pr__text { max-width: 36rem; color: var(--s-muted); line-height: 1.6; }
.pr__text p { margin: 0; }
.pr__list { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(72%, 1fr); gap: 14px; margin: 0; padding: 0 0 8px; list-style: none; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: thin; }
.pr__card, .pr__tile { scroll-snap-align: start; min-width: 0; display: grid; gap: 10px; align-content: start; }
.pr__card-link { display: grid; gap: 8px; color: inherit; text-decoration: none; }
.pr__card-media { display: block; aspect-ratio: 4 / 5; overflow: hidden; background: var(--s-surface); }
.pr__card-media img { width: 100%; height: 100%; object-fit: cover; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.pr__card-stand { display: flex; align-items: flex-end; width: 100%; height: 100%; padding: 16px; ${DISPLAY} font-size: clamp(1.5rem, 6cqi, 2.5rem); line-height: 0.95; overflow-wrap: anywhere; border: 1px solid var(--s-border); }
.pr__card-name { font-weight: 600; }
.pr__card-price { font-variant-numeric: tabular-nums; color: var(--s-muted); }
.pr__card-add { justify-self: start; min-height: 44px; padding: 0 16px; border: 0; border-radius: var(--theme-button-radius, 0); background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 600; cursor: pointer; }
.pr__card-add:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.pr__tile-link { display: grid; align-content: space-between; gap: 24px; min-height: 100%; aspect-ratio: 4 / 5; padding: clamp(18px, 3vw, 28px); background: var(--s-accent); color: var(--s-bg); text-decoration: none; }
.pr__tile-title { ${DISPLAY} color: inherit; font-size: clamp(1.75rem, 5cqi, 2.75rem); line-height: 0.95; }
.pr__tile-text { line-height: 1.5; }
.pr__tile-cta { font-weight: 600; text-decoration: underline; text-underline-offset: 4px; }
@media (hover: hover) and (pointer: fine) { .pr__card-link:hover .pr__card-media img { transform: scale(calc(1 + 0.05 * var(--m-k, 1))); } }
@container (min-width: 760px) { .pr__list { grid-auto-columns: minmax(36%, 1fr); } }
@container (min-width: 1100px) { .pr__list { grid-auto-columns: minmax(23%, 1fr); gap: 20px; } }
${o.skin ?? ""}`,
    settings: [s.inline("heading", "Heading", o.words.heading), s.rich("text", "Text", o.words.text), s.products("products", "Products to show", 12), s.range("count", "How many when none are chosen", 2, 12, 1, "", o.count ?? 6), s.text("add_label", "Add to bag button", o.words.add), s.scheme(o.scheme ?? "site"), ...motion(), ...spacing(96, 96)],
    blocks: [{ type: "tile", name: "Link tile", limit: 2, settings: [s.text("title", "Title", "Everything in the shop"), s.text("text", "Text", "Every product, newest first."), s.text("label", "Link words", "Go to the shop"), s.url("url", "Link", "/products")] }],
    maxBlocks: 2,
    preset: o.tiles.map((t) => ({ type: "tile", settings: { ...t } })),
  }
}

/* ── contact, with the creator's real form ─────────────────────────────── */

export interface ContactOptions {
  type: string
  name?: string
  scheme?: string
  words: { heading: string; text: string; name: string; email: string; message: string; send: string }
  details: { label: string; value: string; url: string }[]
  skin?: string
}

export function contact(o: ContactOptions): ComponentDef {
  return {
    type: o.type,
    name: o.name ?? "Contact",
    category: "form",
    template: `
<section class="ct" ${rootAttrs({ motion: true })}>
  <div class="ct__in">
    <div class="ct__intro">
      <h2 class="ct__h">{{ settings.heading | raw }}</h2>
      <div class="ct__text">{{ settings.text | raw }}</div>
      <dl class="ct__details">
        {% for block in section.blocks %}
        <div class="ct__row" {{ block.shopify_attributes }}><dt class="ct__label">{{ block.settings.label }}</dt><dd class="ct__value">{% if block.settings.url %}<a href="{{ block.settings.url | url }}">{{ block.settings.value }}</a>{% else %}{{ block.settings.value }}{% endif %}</dd></div>
        {% endfor %}
      </dl>
    </div>
    <div class="ct__form-wrap" data-storelib-motion="reveal-stagger">
      {% if settings.form.id %}
      <div data-storelib-native-form="{{ settings.form.id }}" data-presentation="inline"></div>
      {% else %}
      <form class="ct__form" data-storelib-form="contact">
        <label class="ct__field"><span>{{ settings.name_label }}</span><input type="text" name="name" autocomplete="name" required placeholder="{{ settings.name_hint }}"></label>
        <label class="ct__field"><span>{{ settings.email_label }}</span><input type="email" name="email" autocomplete="email" required placeholder="{{ settings.email_hint }}"></label>
        <label class="ct__field"><span>{{ settings.message_label }}</span><textarea name="message" rows="5" required placeholder="{{ settings.message_hint }}"></textarea></label>
        <button class="ct__send" type="submit">{{ settings.send_label }}</button>
      <p data-storelib-success hidden role="status">${icon("check", "", 18)}<span>{{ settings.thanks_text }}</span></p>
      </form>
      {% endif %}
    </div>
  </div>
</section>`,
    style: `
.ct { ${BOX} }
.ct a { color: inherit; }
.ct__in { display: grid; gap: clamp(28px, 5vw, 72px); ${INNER} }
.ct__h { margin: 0 0 16px; ${DISPLAY} font-size: clamp(2.25rem, 1.3rem + 5cqi, 5rem); line-height: 0.92; letter-spacing: -0.03em; }
.ct__text { max-width: 34rem; line-height: 1.6; color: var(--s-muted); }
.ct__text p { margin: 0 0 10px; }
.ct__details { margin: 28px 0 0; border-top: 1px solid var(--s-border); }
.ct__row { display: grid; gap: 2px; padding: 14px 0; border-bottom: 1px solid var(--s-border); }
.ct__label { font-size: 0.8125rem; color: var(--s-muted); }
.ct__value { margin: 0; font-size: 1.125rem; overflow-wrap: anywhere; }
.ct__form { display: grid; gap: 16px; }
.ct__field { display: grid; gap: 6px; font-size: 0.875rem; }
.ct__field input, .ct__field textarea { min-width: 0; min-height: 52px; padding: 12px 14px; border: 1px solid var(--s-border); border-radius: var(--theme-input-radius, 0); background: var(--s-surface); color: var(--s-text); font: inherit; font-size: 1rem; }
.ct__field input:focus, .ct__field textarea:focus { outline: 2px solid var(--s-accent); outline-offset: 1px; }
.ct__send { justify-self: start; min-height: 56px; padding: 0 28px; border: 0; border-radius: var(--theme-button-radius, 0); background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 600; cursor: pointer; }
.ct__send:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
@container (min-width: 900px) { .ct__in { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); align-items: start; } .ct__row { grid-template-columns: 9rem minmax(0, 1fr); align-items: baseline; } }
${reveal(".ct", ".ct__form-wrap", `${o.type}_in`)}
${o.skin ?? ""}
${formPolishCss("ct")}`,
    settings: [
      s.inline("heading", "Heading", o.words.heading),
      s.rich("text", "Text", o.words.text),
      s.form("form", "Form or booking form"),
      s.header("hdr_fields", "When no form is chosen"),
      s.text("name_label", "Name field", o.words.name),
      s.text("email_label", "Email field", o.words.email),
      s.text("message_label", "Message field", o.words.message),
      s.text("name_hint", "Name hint", "Your name"),
      s.text("email_hint", "Email hint", "name@example.com"),
      s.text("message_hint", "Message hint", "A few lines are plenty"),
      s.text("thanks_text", "After sending", "Thank you. We will write back soon."),
      s.text("send_label", "Send button", o.words.send),
      s.scheme(o.scheme ?? "site"),
      ...motion(),
      ...spacing(96, 96),
    ],
    blocks: [{ type: "detail", name: "Contact detail", limit: 6, settings: [s.text("label", "Label", "Email"), s.text("value", "Value", "Write to us"), s.url("url", "Link (mailto:, tel: or a page)", "")] }],
    maxBlocks: 6,
    preset: o.details.map((d) => ({ type: "detail", settings: { ...d } })),
  }
}

/* ── questions ─────────────────────────────────────────────────────────── */

export interface FaqOptions {
  type: string
  scheme?: string
  words: { heading: string; text: string }
  items: { q: string; a: string }[]
  skin?: string
}

export function faq(o: FaqOptions): ComponentDef {
  return {
    type: o.type,
    name: "Questions",
    category: "text",
    template: `
<section class="fq" ${rootAttrs()}>
  <div class="fq__in">
    <div class="fq__head"><h2 class="fq__h">{{ settings.heading | raw }}</h2><div class="fq__text">{{ settings.text | raw }}</div></div>
    <div class="fq__list">
      {% for block in section.blocks %}
      <details class="fq__item" {{ block.shopify_attributes }}><summary class="fq__q">{{ block.settings.question }}</summary><div class="fq__a">{{ block.settings.answer | raw }}</div></details>
      {% endfor %}
    </div>
  </div>
</section>`,
    style: `
.fq { ${BOX} }
.fq__in { display: grid; gap: clamp(24px, 4vw, 64px); ${INNER} }
.fq__h { margin: 0 0 12px; ${DISPLAY} font-size: clamp(2rem, 1.2rem + 3.6cqi, 4rem); line-height: 0.95; letter-spacing: -0.025em; }
.fq__text { color: var(--s-muted); line-height: 1.6; max-width: 30rem; }
.fq__text p { margin: 0; }
.fq__list { border-top: 1px solid var(--s-border); }
.fq__item { border-bottom: 1px solid var(--s-border); }
.fq__q { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 64px; padding: 10px 0; font-size: 1.125rem; font-weight: 600; cursor: pointer; list-style: none; }
.fq__q::-webkit-details-marker { display: none; }
.fq__q::after { content: "+"; flex: none; font-weight: 400; font-size: 1.5rem; color: var(--s-accent); transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.fq__item[open] .fq__q::after { transform: rotate(45deg); }
.fq__a { padding: 0 0 20px; max-width: 46rem; line-height: 1.65; color: var(--s-muted); }
.fq__a p { margin: 0 0 8px; }
@container (min-width: 900px) { .fq__in { grid-template-columns: minmax(0, 4fr) minmax(0, 7fr); align-items: start; } }
${o.skin ?? ""}`,
    settings: [s.inline("heading", "Heading", o.words.heading), s.rich("text", "Text", o.words.text), s.scheme(o.scheme ?? "site"), ...spacing(96, 96)],
    blocks: [{ type: "question", name: "Question", limit: 12, settings: [s.text("question", "Question", "How long does delivery take?"), s.rich("answer", "Answer", "<p>Two to four working days.</p>")] }],
    maxBlocks: 12,
    preset: o.items.map((i) => ({ type: "question", settings: { question: i.q, answer: i.a } })),
  }
}

/* ── a running band ────────────────────────────────────────────────────── */

export interface MarqueeOptions {
  type: string
  scheme?: string
  items: string[]
  /** Seconds per loop, as a template thinks of it; stored as pixels per second (marqueePx). */
  speed?: number
  skin?: string
}

/**
 * The band's speed in pixels per second, what the P3 marquee island reads (data-motion-speed) and
 * what the CSS loop is timed from (3000px a loop). A template gives it as seconds per loop (o.speed,
 * the old unit); 3000 / seconds is the same pace, rounded to the setting's step of 10.
 */
function marqueePx(seconds?: number): number {
  const px = Math.round(3000 / (seconds ?? 36) / 10) * 10
  return Math.max(20, Math.min(300, px))
}

export function marquee(o: MarqueeOptions): ComponentDef {
  const item = `{% for block in section.blocks %}<li class="mq__item" {{ block.shopify_attributes }}>{{ block.settings.text }}</li>{% endfor %}`
  return {
    type: o.type,
    name: "Running band",
    category: "text",
    template: `
<section class="mq" ${rootAttrs({ motion: true })} aria-label="{{ settings.label }}">
  <div class="mq__window" data-storelib-motion="marquee" data-motion-speed="{{ settings.speed }}" data-motion-direction="left" style="--mq-speed: {{ settings.speed }};">
    <ul class="mq__track" data-motion-track>${item}</ul>
    <ul class="mq__track mq__track--copy" aria-hidden="true">${item}</ul>
  </div>
</section>`,
    style: `
.mq { ${BOX} overflow: hidden; }
.mq__window { display: flex; width: max-content; }
.mq__track { display: flex; flex-wrap: wrap; gap: 0 clamp(24px, 4vw, 56px); margin: 0; padding: 0 clamp(12px, 2vw, 28px) 0 0; list-style: none; }
.mq__track--copy { display: none; }
.mq__item { ${DISPLAY} font-size: clamp(2rem, 1.2rem + 5cqi, 6rem); line-height: 1.05; letter-spacing: -0.02em; white-space: nowrap; }
.mq__item:nth-child(even) { color: var(--s-accent); }
@media (prefers-reduced-motion: no-preference) {
  .mq:not([data-motion="off"]) .mq__track { flex-wrap: nowrap; }
  .mq:not([data-motion="off"]) .mq__track--copy { display: flex; }
  .mq:not([data-motion="off"]) .mq__window { animation: ${o.type}_run calc(3000s / var(--mq-speed, 80) / max(var(--m-k, 1), 0.2)) linear infinite; }
  .mq__window[data-motion-ready] { animation: none !important; }
  .mq__window[data-motion-ready] .mq__track--copy { display: none !important; }
  .mq:hover .mq__window, .mq:focus-within .mq__window { animation-play-state: paused; }
  @keyframes ${o.type}_run { to { transform: translateX(-50%); } }
}
@media (prefers-reduced-motion: reduce) { .mq__window { animation: none; } }
@container (max-width: 599px) { .mq__item { white-space: normal; } .mq__window { width: auto; } }
${o.skin ?? ""}`,
    settings: [s.text("label", "Band name (read aloud)", "Running notes"), s.range("speed", "Speed", 20, 300, 10, "px/s", marqueePx(o.speed)), s.scheme(o.scheme ?? "site_inverse"), ...motion(), ...spacing(28, 28)],
    blocks: [{ type: "item", name: "Words", limit: 10, settings: [s.text("text", "Text", "Open early")] }],
    maxBlocks: 10,
    preset: o.items.map((text) => ({ type: "item", settings: { text } })),
  }
}

/* ── a page's opening (about, contact, any page) ───────────────────────── */

export interface PageIntroOptions {
  type: string
  scheme?: string
  words: { heading: string; text: string }
  facts: { label: string; value: string }[]
  skin?: string
}

export function pageIntro(o: PageIntroOptions): ComponentDef {
  return {
    type: o.type,
    name: "Page opening",
    category: "hero",
    template: `
<section class="pi pi--{{ settings.align }}" ${rootAttrs({ motion: true })}>
  <div class="pi__in">
    <div class="pi__words">
      <h1 class="pi__h" data-storelib-motion="text-scramble">{{ settings.heading | raw }}</h1>
      <div class="pi__text">{{ settings.text | raw }}</div>
      <dl class="pi__facts">
        {% for block in section.blocks %}<div class="pi__fact" {{ block.shopify_attributes }}><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}
      </dl>
    </div>
    {% if settings.image %}<figure class="pi__media" data-storelib-motion="parallax-depth" data-motion-intensity="30" data-motion-pointer="false">
      <img src="{{ settings.image | asset }}" alt="{{ settings.image_alt }}" width="1400" height="1050" fetchpriority="high" data-motion-depth="0.25">
    </figure>{% endif %}
  </div>
</section>`,
    style: `
.pi { ${BOX} }
.pi__in { display: grid; gap: clamp(24px, 4vw, 56px); ${INNER} }
.pi__h { margin: 0; ${DISPLAY} font-size: clamp(2.75rem, 1.4rem + 8cqi, 8.5rem); line-height: 0.88; letter-spacing: -0.035em; overflow-wrap: anywhere; }
.pi__text { margin-top: 20px; max-width: 38rem; font-size: 1.125rem; line-height: 1.6; color: var(--s-muted); }
.pi__text p { margin: 0 0 10px; }
.pi__facts { display: flex; flex-wrap: wrap; gap: 16px 40px; margin: 28px 0 0; }
.pi__fact dt { font-size: 0.8125rem; color: var(--s-muted); }
.pi__fact dd { margin: 2px 0 0; font-size: 1.125rem; color: var(--s-heading); }
.pi__media { margin: 0; overflow: hidden; background: var(--s-surface); }
.pi__media img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; }
.pi__media--none { display: none; }
.pi--center .pi__words { text-align: center; justify-items: center; display: grid; }
.pi--center .pi__facts { justify-content: center; }
@container (min-width: 960px) { .pi--split .pi__in { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: end; } }
${reveal(".pi", ".pi__media img", `${o.type}_in`)}
${o.skin ?? ""}`,
    settings: [
      s.inline("heading", "Heading", o.words.heading),
      s.rich("text", "Text", o.words.text),
      s.image("image", "Picture"),
      s.text("image_alt", "Picture description", ""),
      s.select("align", "Layout", "split", [
        ["split", "Words and picture side by side"],
        ["center", "Centred words"],
      ]),
      s.scheme(o.scheme ?? "site"),
      ...motion(),
      ...spacing(96, 72),
    ],
    blocks: [{ type: "fact", name: "Fact", limit: 4, settings: [s.text("label", "Label", "Open"), s.text("value", "Value", "Every day")] }],
    maxBlocks: 4,
    preset: o.facts.map((f) => ({ type: "fact", settings: { ...f } })),
  }
}

/* ── the closing call ──────────────────────────────────────────────────── */

export interface CtaOptions {
  type: string
  scheme?: string
  words: { heading: string; text: string }
  actions: { label: string; url: string; style: "solid" | "line" }[]
  skin?: string
}

export function cta(o: CtaOptions): ComponentDef {
  return {
    type: o.type,
    name: "Closing call",
    category: "cta",
    template: `
<section class="cc" ${rootAttrs({ motion: true })}>
  <div class="cc__in">
    <h2 class="cc__h" data-storelib-motion="reveal-stagger">{{ settings.heading | raw }}</h2>
    <div class="cc__side">
      <div class="cc__text">{{ settings.text | raw }}</div>
      <div class="cc__actions">
        {% for block in section.blocks %}<a class="cc__btn cc__btn--{{ block.settings.style }}" href="{{ block.settings.url | url }}" {{ block.shopify_attributes }}>{{ block.settings.label }}</a>{% endfor %}
      </div>
    </div>
  </div>
</section>`,
    style: `
.cc { ${BOX} }
.cc__in { display: grid; gap: clamp(20px, 4vw, 48px); ${INNER} }
.cc__h { margin: 0; ${DISPLAY} font-size: clamp(2.75rem, 1.2rem + 9cqi, 9rem); line-height: 0.86; letter-spacing: -0.04em; overflow-wrap: anywhere; }
.cc__text { max-width: 30rem; font-size: 1.125rem; line-height: 1.6; }
.cc__text p { margin: 0; }
.cc__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.cc__btn { display: inline-flex; align-items: center; min-height: 56px; padding: 0 28px; border: 1px solid var(--s-btn); border-radius: var(--theme-button-radius, 0); font-weight: 600; text-decoration: none; transition: background-color var(--t-motion-hover, 200ms) ease, color var(--t-motion-hover, 200ms) ease, transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.cc__btn--solid { background: var(--s-btn); color: var(--s-btn-text); }
.cc__btn--solid:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.cc__btn--line { background: none; color: var(--s-text); border-color: currentColor; }
.cc__btn:active { transform: translateY(1px); }
@container (min-width: 900px) { .cc__in { grid-template-columns: minmax(0, 8fr) minmax(0, 4fr); align-items: end; } }
${reveal(".cc", ".cc__h", `${o.type}_in`)}
${o.skin ?? ""}`,
    settings: [s.inline("heading", "Heading", o.words.heading), s.rich("text", "Text", o.words.text), s.scheme(o.scheme ?? "site_inverse"), ...motion(), ...spacing(120, 120)],
    blocks: [
      {
        type: "action",
        name: "Button",
        limit: 2,
        settings: [
          s.text("label", "Words", "Get in touch"),
          s.url("url", "Link", "/contact"),
          s.select("style", "Style", "solid", [
            ["solid", "Filled"],
            ["line", "Outline"],
          ]),
        ],
      },
    ],
    maxBlocks: 2,
    preset: o.actions.map((a) => ({ type: "action", settings: { ...a } })),
  }
}

/* ── a method told in steps: the picture stays while the steps pass ────── */

export interface StepsOptions {
  type: string
  name?: string
  scheme?: string
  words: { heading: string; text: string }
  steps: { title: string; text: string }[]
  skin?: string
}

export function stickySteps(o: StepsOptions): ComponentDef {
  return {
    type: o.type,
    name: o.name ?? "Steps",
    category: "text",
    template: `
<section class="sp" ${rootAttrs({ motion: true })}>
  <div class="sp__in">
    <div class="sp__head">
      <h2 class="sp__h">{{ settings.heading | raw }}</h2>
      <div class="sp__text">{{ settings.text | raw }}</div>
    </div>
    <ol class="sp__list" data-storelib-motion="reveal-stagger" data-motion-effect="rise">
      {% for block in section.blocks %}
      <li class="sp__step" {{ block.shopify_attributes }}>
        <span class="sp__n" aria-hidden="true">{{ forloop.index }}</span>
        <div class="sp__body">
          <h3 class="sp__title">{{ block.settings.title }}</h3>
          <div class="sp__copy">{{ block.settings.text | raw }}</div>
        </div>
        {% if block.settings.image %}<img class="sp__img" src="{{ block.settings.image | asset }}" alt="{{ block.settings.image_alt }}" width="1000" height="1250" loading="lazy">{% endif %}
      </li>
      {% endfor %}
    </ol>
  </div>
</section>`,
    style: `
.sp { ${BOX} }
.sp__in { display: grid; gap: clamp(28px, 5vw, 72px); ${INNER} }
.sp__h { margin: 0 0 14px; ${DISPLAY} font-size: clamp(2.25rem, 1.3rem + 5cqi, 5.5rem); line-height: 0.9; letter-spacing: -0.03em; }
.sp__text { max-width: 30rem; color: var(--s-muted); line-height: 1.6; }
.sp__text p { margin: 0; }
.sp__list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; counter-reset: sp; }
.sp__step { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 20px; padding: clamp(20px, 3vw, 32px) 0; border-top: 1px solid var(--s-border); }
.sp__n { ${DISPLAY} color: var(--s-accent); font-size: clamp(2.5rem, 7cqi, 5rem); line-height: 0.85; font-variant-numeric: tabular-nums; }
.sp__title { margin: 0 0 8px; ${DISPLAY} font-size: clamp(1.375rem, 1rem + 1.6cqi, 2.25rem); line-height: 1.05; }
.sp__copy { line-height: 1.6; color: var(--s-muted); max-width: 36rem; }
.sp__copy p { margin: 0; }
.sp__img { grid-column: 1 / -1; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; margin-top: 12px; }
@container (min-width: 960px) {
  .sp__in { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: start; }
  .sp__head { position: sticky; top: calc(var(--hd-h, 72px) + 32px); }
  .sp__step { grid-template-columns: 7rem minmax(0, 1fr) minmax(0, 14rem); align-items: start; }
  .sp__img { grid-column: 3; grid-row: 1; margin: 0; aspect-ratio: 4 / 5; }
}
${reveal(".sp", ".sp__step", `${o.type}_in`)}
${o.skin ?? ""}`,
    settings: [s.inline("heading", "Heading", o.words.heading), s.rich("text", "Text", o.words.text), s.scheme(o.scheme ?? "site"), ...motion(), ...spacing(112, 112)],
    blocks: [{ type: "step", name: "Step", limit: 6, settings: [s.text("title", "Title", "First visit"), s.rich("text", "Text", "<p>We meet and agree what comes first.</p>"), s.image("image", "Picture"), s.text("image_alt", "Picture description", "")] }],
    maxBlocks: 6,
    preset: o.steps.map((x) => ({ type: "step", settings: { title: x.title, text: x.text, image: "", image_alt: "" } })),
  }
}

/* ── a photo collage ───────────────────────────────────────────────────── */

export interface CollageOptions {
  type: string
  name?: string
  scheme?: string
  words: { heading: string; text: string }
  photos: { caption: string; size: "tall" | "wide" | "square" }[]
  skin?: string
}

export function collage(o: CollageOptions): ComponentDef {
  return {
    type: o.type,
    name: o.name ?? "Photo collage",
    category: "image",
    template: `
<section class="cl" ${rootAttrs({ motion: true })}>
  <div class="cl__in">
    <div class="cl__head"><h2 class="cl__h">{{ settings.heading | raw }}</h2><div class="cl__text">{{ settings.text | raw }}</div></div>
    <ul class="cl__grid" data-storelib-motion="parallax-depth" data-motion-intensity="40" data-motion-pointer="false">
      {% for block in section.blocks %}
      <li class="cl__item cl__item--{{ block.settings.size }}" {{ block.shopify_attributes }}>
        <figure class="cl__fig">
          {% if block.settings.image %}<img src="{{ block.settings.image | asset }}" alt="{{ block.settings.image_alt }}" width="1000" height="1250" loading="lazy" data-motion-depth="{% if forloop.index == 2 or forloop.index == 4 %}0.4{% else %}0.15{% endif %}">{% endif %}
          {% if block.settings.caption %}<figcaption class="cl__cap">{{ block.settings.caption }}</figcaption>{% endif %}
        </figure>
      </li>
      {% endfor %}
    </ul>
  </div>
</section>`,
    style: `
.cl { ${BOX} }
.cl__in { ${INNER} }
.cl__head { display: grid; gap: 12px; margin-bottom: clamp(24px, 4vw, 56px); }
.cl__h { margin: 0; ${DISPLAY} font-size: clamp(2rem, 1.2rem + 4cqi, 4.5rem); line-height: 0.95; letter-spacing: -0.025em; max-width: 18ch; }
.cl__text { max-width: 34rem; color: var(--s-muted); line-height: 1.6; }
.cl__text p { margin: 0; }
.cl__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: dense; gap: 10px; margin: 0; padding: 0; list-style: none; }
.cl__item { min-width: 0; }
.cl__item--wide { grid-column: span 2; }
.cl__fig { position: relative; margin: 0; height: 100%; overflow: hidden; background: var(--s-surface); }
.cl__fig img { display: block; width: 100%; height: 100%; object-fit: cover; aspect-ratio: 4 / 5; }
.cl__item--wide .cl__fig img, .cl__item--wide .cl__stand { aspect-ratio: 16 / 9; }
.cl__item--square .cl__fig img, .cl__item--square .cl__stand { aspect-ratio: 1; }
.cl__stand { display: block; width: 100%; aspect-ratio: 4 / 5; background: var(--s-accent); opacity: 0.85; }
.cl__item:nth-child(3n) .cl__stand { background: var(--s-text); opacity: 0.9; }
.cl__cap { position: absolute; left: 10px; bottom: 10px; max-width: calc(100% - 20px); padding: 6px 10px; background: var(--s-bg); color: var(--s-text); font-size: 0.8125rem; line-height: 1.3; }
@container (min-width: 900px) {
  .cl__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
  .cl__item--tall { grid-row: span 2; }
  .cl__item--tall .cl__fig img, .cl__item--tall .cl__stand { aspect-ratio: auto; height: 100%; min-height: 100%; }
}
${reveal(".cl", ".cl__item", `${o.type}_in`)}
${o.skin ?? ""}`,
    settings: [s.inline("heading", "Heading", o.words.heading), s.rich("text", "Text", o.words.text), s.scheme(o.scheme ?? "site"), ...motion(), ...spacing(96, 96)],
    blocks: [
      {
        type: "photo",
        name: "Photo",
        limit: 8,
        settings: [
          s.image("image", "Picture"),
          s.text("image_alt", "Picture description", ""),
          s.text("caption", "Caption", ""),
          s.select("size", "Size", "square", [
            ["square", "Square"],
            ["tall", "Tall"],
            ["wide", "Wide"],
          ]),
        ],
      },
    ],
    maxBlocks: 8,
    preset: o.photos.map((p) => ({ type: "photo", settings: { image: "", image_alt: "", caption: p.caption, size: p.size } })),
  }
}

/* ── a statement in lines ──────────────────────────────────────────────── */

export interface StatementOptions {
  type: string
  name?: string
  scheme?: string
  lines: { text: string; accent: boolean }[]
  note: string
  skin?: string
}

export function statement(o: StatementOptions): ComponentDef {
  return {
    type: o.type,
    name: o.name ?? "Statement",
    category: "text",
    template: `
<section class="st" ${rootAttrs({ motion: true })}>
  <div class="st__in">
    <h2 class="st__lines" data-storelib-motion="reveal-stagger">
      {% for block in section.blocks %}<span class="st__line{% if block.settings.accent %} st__line--accent{% endif %}" {{ block.shopify_attributes }}><span class="st__mask">{{ block.settings.text }}</span></span>{% endfor %}
    </h2>
    {% if settings.note %}<div class="st__note">{{ settings.note | raw }}</div>{% endif %}
  </div>
</section>`,
    style: `
.st { ${BOX} }
.st__in { ${INNER} }
.st__lines { margin: 0; ${DISPLAY} font-size: clamp(2.25rem, 1rem + 7.4cqi, 8rem); line-height: 0.92; letter-spacing: -0.035em; }
.st__line { display: block; overflow: hidden; padding-bottom: 0.04em; }
.st__mask { display: inline-block; }
.st__line--accent { color: var(--s-accent); }
.st__note { margin-top: clamp(20px, 3vw, 40px); max-width: 34rem; line-height: 1.6; color: var(--s-muted); }
.st__note p { margin: 0; }
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .st:not([data-motion="off"]) .st__mask { animation: ${o.type}_rise linear both; animation-timeline: view(); animation-range: entry 10% entry 70%; }
    @keyframes ${o.type}_rise { from { transform: translateY(calc(100% * var(--m-k, 1))); } }
  }
}
${o.skin ?? ""}`,
    settings: [s.rich("note", "Text under the lines", o.note), s.scheme(o.scheme ?? "site"), ...motion(), ...spacing(120, 120)],
    blocks: [{ type: "line", name: "Line", limit: 6, settings: [s.text("text", "Words", "Made close to home"), s.check("accent", "In the accent colour", false)] }],
    maxBlocks: 6,
    preset: o.lines.map((l) => ({ type: "line", settings: { text: l.text, accent: l.accent } })),
  }
}

export type { PresetBlock }
export { LABEL }
