/**
 * TEMPLATE g, "Orbit": a software product on a near-black ground. Signature
 * moves: a 3D object hero (P3's 3d-object island; a slow CSS turn of the
 * product render without it) sitting in front of a giant wordmark, a giant
 * marquee of the product's verbs, a scroll-scrubbed product walk-through and
 * sideways pinned use cases. Acid lime is the one accent, used for the
 * primary action and one detail per screen. No logo wall, no invented
 * numbers: plans come from the store's real products.
 */
import {
  BOX, cartPanel, check, chromeVars, chromeWords, defineSection, image, menu, motion, panelCss, prefs, productList, range, revealCss, richtext, scheme, searchPanel, select, spacing, text, textarea, url, vars,
} from "../kit-b"

const H = "font-family: var(--theme-font-heading), sans-serif; color: var(--s-heading);"
const MONO = "font-family: var(--t-font-mono, ui-monospace), monospace;"

/* ── header: split bar, mega panels, bottom sheet menu, full search, right cart ── */
export const header = defineSection({
  type: "ai_sw_header",
  name: "Header",
  kind: "header",
  summary: "Split header: wordmark, the main menu with mega panels, search, language and currency, account and cart; a bottom sheet menu on phones.",
  template: `
<header class="swn" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <div class="swn__bar">
    <a class="swn__logo" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" width="{{ settings.logo_width }}" height="32">{% else %}{{ shop.name | default: settings.brand }}{% endif %}</a>
    <nav class="swn__nav" aria-label="{{ settings.nav_label }}">
      <ul class="swn__links">
        {% for link in settings.menu.links %}
          <li>
            {% if link.links.size > 0 %}
              <button class="swn__top" type="button" popovertarget="swn-m-{{ section.id }}-{{ forloop.index }}">{{ link.title }}</button>
              <div class="swn__mega" id="swn-m-{{ section.id }}-{{ forloop.index }}" popover>
                <a class="swn__mega-all" href="{{ link.url }}">{{ link.title }}</a>
                <ul class="swn__mega-list">{% for child in link.links %}<li><a class="swn__mega-link" href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>
                {% if settings.mega_note %}<p class="swn__mega-note">{{ settings.mega_note }}</p>{% endif %}
              </div>
            {% else %}
              <a class="swn__top" href="{{ link.url }}">{{ link.title }}</a>
            {% endif %}
          </li>
        {% endfor %}
      </ul>
    </nav>
    <div class="swn__tools">
      <button class="swn__tool swn__wide" type="button" popovertarget="swn-p-{{ section.id }}">{{ settings.region_label }}</button>
      <button class="swn__tool" type="button" data-storelib-search>{{ settings.search_label }}</button>
      <a class="swn__tool swn__wide" href="{{ routes.account_url }}">{{ settings.account_label }}</a>
      <button class="swn__tool swn__cartbtn" type="button" data-storelib-cart>{{ settings.cart_label }} <span class="swn__count" data-storelib-cart-count></span></button>
      {% if settings.cta_label %}<a class="swn__cta" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>{% endif %}
      <button class="swn__tool swn__burger" type="button" popovertarget="swn-d-{{ section.id }}">{{ settings.menu_label }}</button>
    </div>
  </div>

  <div class="swn__region" id="swn-p-{{ section.id }}" popover>
    ${prefs("swn")}
  </div>

  <div class="swn__sheet" id="swn-d-{{ section.id }}" popover>
    <div class="swn__sheet-head"><span class="swn__grab" aria-hidden="true"></span><button class="swn-x" type="button" popovertarget="swn-d-{{ section.id }}" popovertargetaction="hide">{{ settings.close_label }}</button></div>
    <nav aria-label="{{ settings.nav_label }}">
      <ul class="swn__mlist">
        {% for link in settings.menu.links %}
          <li><a class="swn__mlink" href="{{ link.url }}">{{ link.title }}</a>
            {% if link.links.size > 0 %}<ul class="swn__msub">{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>{% endif %}
          </li>
        {% endfor %}
      </ul>
    </nav>
    <a class="swn__macct" href="{{ routes.account_url }}">{{ settings.account_label }}</a>
    <ul class="swn__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{% if block.settings.url %}<a href="{{ block.settings.url | url }}">{{ block.settings.text }}</a>{% else %}{{ block.settings.text }}{% endif %}</li>{% endfor %}</ul>
    ${prefs("swn")}
  </div>

  ${searchPanel("swn")}
  ${cartPanel("swn")}
</header>`,
  style: `
.swn__notes { display: grid; gap: 4px; margin: 0 0 16px; padding: 0; list-style: none; font-size: 0.875rem; }
.swn__notes a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; }
.swn { position: sticky; top: 0; z-index: 30; background: var(--s-bg); color: var(--s-text); border-bottom: 1px solid var(--s-border); }
.swn__bar { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 0 var(--theme-padding-x, 20px); }
.swn__logo { margin-right: auto; ${H} font-size: 1.25rem; font-weight: 800; letter-spacing: -0.04em; text-decoration: none; }
.swn__logo img { display: block; max-height: 32px; width: auto; height: auto; }
.swn__nav { display: none; }
.swn__links { display: flex; gap: 2px; margin: 0; padding: 0; list-style: none; }
.swn__top, .swn__tool { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border: 0; background: none; color: inherit; font: inherit; font-size: 0.9375rem; text-decoration: none; cursor: pointer; }
.swn__top:hover, .swn__tool:hover { color: var(--s-heading); text-decoration: underline; text-underline-offset: 6px; }
.swn__wide { display: none; }
.swn__count { min-width: 1.6em; padding: 1px 5px; background: var(--s-accent); color: var(--s-bg); text-align: center; font-variant-numeric: tabular-nums; font-size: 0.75rem; }
.swn__count[data-count="0"], .swn__count:empty { display: none; }
.swn__cta { display: none; align-items: center; min-height: 40px; padding: 0 16px; background: var(--s-btn); color: var(--s-btn-text); text-decoration: none; font-weight: 600; }
.swn__mega { position: fixed; inset: 64px 0 auto; width: 100%; max-width: none; margin: 0; padding: 36px var(--theme-padding-x, 20px) 44px; border: 0; border-bottom: 1px solid var(--s-border); background: var(--s-bg); color: var(--s-text); }
.swn__mega-all { display: inline-block; margin-bottom: 18px; ${H} font-size: clamp(1.75rem, 1.2rem + 2vw, 3rem); font-weight: 800; letter-spacing: -0.04em; text-decoration: none; }
.swn__mega-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 4px 28px; margin: 0; padding: 0; list-style: none; }
.swn__mega-link { display: block; padding: 10px 0; border-top: 1px solid var(--s-border); color: inherit; text-decoration: none; }
.swn__mega-note { max-width: 40ch; margin: 22px 0 0; ${MONO} font-size: 0.8125rem; opacity: 0.7; }
.swn__region { margin: 0; inset: 64px var(--theme-padding-x, 20px) auto auto; width: min(360px, calc(100% - 32px)); padding: 18px; border: 1px solid var(--s-border); background: var(--s-bg); color: var(--s-text); }
.swn__sheet { inset: auto 0 0 0; width: 100%; max-width: none; max-height: 88svh; margin: 0; padding: 10px var(--theme-padding-x, 20px) 28px; border: 0; border-top: 1px solid var(--s-border); background: var(--s-bg); color: var(--s-text); overflow-y: auto; }
.swn__sheet-head { display: flex; align-items: center; justify-content: space-between; }
.swn__grab { width: 44px; height: 4px; background: var(--s-border); }
.swn__mlist { margin: 18px 0; padding: 0; list-style: none; }
.swn__mlink { display: block; padding: 10px 0; ${H} font-size: clamp(2rem, 1.4rem + 4vw, 3.25rem); font-weight: 800; letter-spacing: -0.045em; line-height: 1; text-decoration: none; }
.swn__msub { margin: 0 0 10px; padding: 0; list-style: none; }
.swn__msub a { display: block; padding: 8px 0; color: inherit; }
.swn__macct { display: inline-flex; min-height: 44px; align-items: center; margin-bottom: 14px; color: inherit; }
.swn :focus-visible { outline: 2px solid var(--s-accent); outline-offset: 2px; }
${panelCss("swn", { cartFrom: "right", searchFrom: "full" })}
.swn-search { border-bottom: 1px solid var(--s-border); }
.swn-search__input { ${H} font-weight: 700; letter-spacing: -0.03em; }
.swn-cart { border-left: 1px solid var(--s-border); }
@media (min-width: 960px) {
  .swn__nav { display: block; }
  .swn__burger { display: none; }
  .swn__wide { display: inline-flex; }
  .swn__cta { display: inline-flex; }
}
@media (prefers-reduced-motion: no-preference) {
  .swn__sheet { transition: transform var(--t-motion-duration, 650ms) var(--t-motion-ease, ease), opacity var(--t-motion-hover, 200ms) ease, display var(--t-motion-duration, 650ms) allow-discrete, overlay var(--t-motion-duration, 650ms) allow-discrete; transform: translateY(100%); opacity: 0; }
  .swn__sheet:popover-open { transform: none; opacity: 1; }
  @starting-style { .swn__sheet:popover-open { transform: translateY(100%); opacity: 0; } }
}`,
  settings: [
    menu(),
    text("brand", "Name when there is no logo", "Orbit"),
    range("logo_width", "Logo width", 60, 220, 4, 110, "px"),
    text("account_label", "Account link", "Sign in"),
    text("region_label", "Language and currency button", "Region"),
    text("cta_label", "Button", "Get the app"),
    url("cta_url", "Button goes to", "/products"),
    text("mega_note", "Line under the big menu", "Every plan runs on Mac, Windows and Linux."),
    ...chromeWords({ cart_label: "Cart", search_placeholder: "Search plans, guides and updates" }),
    scheme("site"),
  ],
  blocks: [{ type: "note", name: "Line in the menu", settings: [text("text", "Words", "Changelog for this week"), url("url", "Link (optional)", "")] }],
  presetBlocks: [
    { type: "note", settings: { text: "Changelog for this week", url: "/products" } },
    { type: "note", settings: { text: "Talk to the team", url: "/contact" } },
  ],
  maxBlocks: 4,
})

/* ── hero: the 3D object in front of a giant wordmark ── */
export const hero = defineSection({
  type: "ai_sw_hero",
  name: "Hero with 3D object",
  summary: "Opening: a short, specific headline and one action beside the product as a turning 3D object, over a giant wordmark it cuts through.",
  template: `
<section class="swh" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="swh__grid">
    <div class="swh__copy" data-storelib-motion="reveal-stagger" data-motion-effect="rise">
      <h1 class="swh__h">{{ settings.heading }}</h1>
      <div class="swh__intro">{{ settings.intro | raw }}</div>
      <div class="swh__actions">
        <a class="swh__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
        {% if settings.second_label %}<a class="swh__link" href="{{ settings.second_url | url }}">{{ settings.second_label }}</a>{% endif %}
      </div>
      <ul class="swh__points">
        {% for block in section.blocks %}<li class="swh__point" data-block-id="{{ block.id }}"><span class="swh__key">{{ block.settings.key }}</span> {{ block.settings.text }}</li>{% endfor %}
      </ul>
    </div>
    <div class="swh__stage" data-storelib-motion="3d-object" data-motion-shape="{{ settings.object_shape }}" data-motion-speed="{{ settings.object_speed }}" data-motion-rotate="both" data-motion-finish="satin" data-motion-color="accent">
      {% if settings.image %}<img class="swh__obj" data-motion-fallback src="{{ settings.image | asset }}" alt="{{ settings.image_alt }}" width="1200" height="1200" fetchpriority="high">{% else %}<div class="swh__rings" aria-hidden="true"><span></span><span></span><span></span></div>{% endif %}
    </div>
  </div>
  <p class="swh__giant" aria-hidden="true" data-storelib-motion="parallax-depth" data-motion-intensity="40" data-motion-pointer="false"><span class="swh__giant-in" data-motion-depth="0.25">{{ settings.giant | default: shop.name }}</span></p>
</section>`,
  style: `
.swh { ${BOX} position: relative; overflow: hidden; }
.swh__grid { position: relative; z-index: 2; display: grid; gap: 28px; }
.swh__h { margin: 0; ${H} font-size: clamp(2.75rem, 1.4rem + 7cqi, 7.25rem); font-weight: 800; line-height: 0.9; letter-spacing: -0.055em; max-width: 12ch; }
.swh__intro { max-width: 46ch; margin-top: 20px; font-size: clamp(1.0625rem, 1rem + 0.4cqi, 1.25rem); line-height: 1.5; opacity: 0.86; }
.swh__intro p { margin: 0; }
.swh__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; margin-top: 30px; }
.swh__btn { display: inline-flex; align-items: center; min-height: 54px; padding: 0 26px; background: var(--s-btn); color: var(--s-btn-text); font-weight: 700; text-decoration: none; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.swh__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.swh__btn:active { transform: translateY(2px); }
.swh__link { display: inline-flex; align-items: center; min-height: 44px; color: inherit; text-underline-offset: 6px; }
.swh__points { display: grid; gap: 8px; margin: 34px 0 0; padding: 18px 0 0; list-style: none; border-top: 1px solid var(--s-border); font-size: 0.9375rem; }
.swh__key { ${MONO} color: var(--s-accent); }
.swh__stage { position: relative; display: grid; place-items: center; aspect-ratio: 1; max-width: 560px; width: 100%; margin: 0 auto; perspective: 1200px; }
.swh__obj { width: 100%; height: 100%; object-fit: contain; }
.swh__rings { position: relative; width: 78%; aspect-ratio: 1; }
.swh__rings span { position: absolute; inset: 0; border: 1px solid var(--s-border); border-radius: 50%; }
.swh__rings span:nth-child(2) { inset: 14%; border-color: var(--s-accent); transform: rotateX(64deg); }
.swh__rings span:nth-child(3) { inset: 30%; transform: rotateY(64deg); }
.swh__giant-in { display: inline-block; }
.swh__giant { position: relative; z-index: 1; margin: 4px 0 0; ${H} font-size: 31cqi; font-weight: 900; line-height: 0.78; letter-spacing: -0.07em; white-space: nowrap; overflow: hidden; color: var(--s-heading); text-transform: lowercase; }
@container (min-width: 900px) {
  .swh__grid { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); align-items: center; }
  .swh__stage { margin: 0 0 -10cqi; }
}
@media (prefers-reduced-motion: no-preference) {
  .swh:not([data-motion="off"]) .swh__obj, .swh:not([data-motion="off"]) .swh__rings { animation: swh-turn calc(var(--t-motion-duration, 650ms) * 40) linear infinite; }
  .swh:not([data-motion="off"]) .swh__copy > * { animation: swh-rise var(--t-motion-duration, 650ms) var(--t-motion-ease, ease) both; }
  .swh:not([data-motion="off"]) .swh__copy > :nth-child(2) { animation-delay: var(--t-motion-stagger, 65ms); }
  .swh:not([data-motion="off"]) .swh__copy > :nth-child(3) { animation-delay: calc(var(--t-motion-stagger, 65ms) * 2); }
  .swh:not([data-motion="off"]) .swh__copy > :nth-child(4) { animation-delay: calc(var(--t-motion-stagger, 65ms) * 3); }
}
@keyframes swh-turn { from { transform: rotateY(0deg) rotateX(6deg); } 50% { transform: rotateY(18deg) rotateX(-4deg); } to { transform: rotateY(0deg) rotateX(6deg); } }
@keyframes swh-rise { from { opacity: 0; transform: translateY(calc(var(--t-motion-distance, 24px) * var(--m-k, 1))); } }`,
  settings: [
    text("heading", "Heading", "Ship the release notes before the release"),
    richtext("intro", "Intro", "<p>Orbit drafts changelogs, docs and in-app notes from your merged work, so the people using your product hear about it the day it lands.</p>"),
    text("cta_label", "Button", "Start free"),
    url("cta_url", "Button goes to", "/products"),
    text("second_label", "Second link", "See how it works"),
    url("second_url", "Second link goes to", "#section-walk"),
    image("image", "Product render (transparent background works best)"),
    text("image_alt", "Product render description", "The Orbit app window floating at an angle"),
    select("object_shape", "3D object", "card", [["card", "Product card"], ["coin", "Coin"], ["sphere", "Sphere"], ["torus", "Ring"], ["blob", "Blob"]]),
    range("object_speed", "Turn speed", 0, 2, 0.1, 0.6, "x"),
    text("giant", "Giant word behind (empty uses the shop name)", "orbit"),
    ...motion(),
    scheme("site"),
    ...spacing(56, 0),
  ],
  blocks: [{ type: "point", name: "Point", settings: [text("key", "Short key", "01"), text("text", "Point", "Reads your merged pull requests")] }],
  presetBlocks: [
    { type: "point", settings: { key: "01", text: "Reads what you merged, not what you planned" } },
    { type: "point", settings: { key: "02", text: "Writes in your voice, you approve every line" } },
    { type: "point", settings: { key: "03", text: "Publishes to docs, email and in-app at once" } },
  ],
  maxBlocks: 4,
})

/* ── giant marquee of verbs ── */
export const marquee = defineSection({
  type: "ai_sw_marquee",
  name: "Giant running type",
  summary: "Giant running words across the full width, the product's verbs; pauses on hover, still and wrapped for reduced motion.",
  template: `
<section class="swq" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars("--swq-speed: {{ settings.speed }}s;")}" aria-label="{{ settings.label }}">
  <div class="swq__track" data-storelib-motion="marquee" data-motion-reactive="40" data-motion-direction="{{ settings.direction }}">
    <ul class="swq__run" data-motion-track>{% for block in section.blocks %}<li class="swq__item" data-block-id="{{ block.id }}">{{ block.settings.word }}</li>{% endfor %}</ul>
    <ul class="swq__run" aria-hidden="true">{% for block in section.blocks %}<li class="swq__item">{{ block.settings.word }}</li>{% endfor %}</ul>
  </div>
</section>`,
  style: `
.swq { ${BOX} overflow: hidden; border-block: 1px solid var(--s-border); }
.swq__track { display: flex; width: max-content; }
.swq__run { display: flex; flex: none; margin: 0; padding: 0; list-style: none; }
.swq__item { ${H} font-size: clamp(3.5rem, 2rem + 11cqi, 12rem); font-weight: 900; line-height: 0.95; letter-spacing: -0.06em; white-space: nowrap; }
.swq__item::after { content: "/"; margin-inline: 0.25em; color: var(--s-accent); }
@media (prefers-reduced-motion: reduce) { .swq__track { width: auto; flex-wrap: wrap; } .swq__run[aria-hidden="true"] { display: none; } .swq__run { flex-wrap: wrap; } .swq__item { white-space: normal; } }
@media (prefers-reduced-motion: no-preference) {
  .swq:not([data-motion="off"]) .swq__track { animation: swq-run var(--swq-speed, 40s) linear infinite; }
  .swq[data-motion="off"] .swq__run[aria-hidden="true"] { display: none; }
  .swq[data-motion="off"] .swq__track { width: auto; }
  .swq:hover .swq__track, .swq:focus-within .swq__track { animation-play-state: paused; }
}
.swq__track[data-motion-ready] { animation: none !important; }
.swq__track[data-motion-ready] .swq__run[aria-hidden="true"] { display: none; }
@keyframes swq-run { to { transform: translateX(-50%); } }`,
  settings: [
    text("label", "What it lists (read aloud)", "What Orbit does"),
    range("speed", "Seconds per loop", 15, 90, 5, 36, "s"),
    select("direction", "Direction", "left", [["left", "Left"], ["right", "Right"]]),
    ...motion(),
    scheme("site"),
    ...spacing(28, 28),
  ],
  blocks: [{ type: "word", name: "Word", settings: [text("word", "Word", "Draft")] }],
  presetBlocks: ["Draft", "Review", "Publish", "Announce"].map((w) => ({ type: "word", settings: { word: w } })),
  maxBlocks: 8,
})

/* ── scroll-scrubbed walkthrough ── */
export const walkthrough = defineSection({
  type: "ai_sw_walkthrough",
  name: "Scroll walkthrough",
  summary: "How the product works: a pinned screen that changes as three or four steps scroll past (P3 scroll-scrub); plain steps with their own screens on phones.",
  template: `
<section class="swk" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="swk__h">{{ settings.heading }}</h2>
  <div class="swk__wrap">
    <div class="swk__steps">
      {% for block in section.blocks %}
        <article class="swk__step" data-block-id="{{ block.id }}">
          <p class="swk__n">{{ forloop.index }}</p>
          <h3 class="swk__title">{{ block.settings.title }}</h3>
          <p class="swk__text">{{ block.settings.text }}</p>
          {% if block.settings.screen %}<img class="swk__inline" src="{{ block.settings.screen | asset }}" alt="{{ block.settings.alt }}" width="1440" height="900">{% endif %}
        </article>
      {% endfor %}
    </div>
    <div class="swk__pin">
      {% for block in section.blocks %}
        <figure class="swk__screen" style="--i: {{ forloop.index }};">{% if block.settings.screen %}<img src="{{ block.settings.screen | asset }}" alt="" width="1440" height="900">{% else %}<span class="swk__blank">{{ block.settings.title }}</span>{% endif %}</figure>
      {% endfor %}
    </div>
  </div>
</section>`,
  style: `
.swk { ${BOX} }
.swk__h { max-width: 18ch; margin: 0 0 36px; ${H} font-size: clamp(2.25rem, 1.4rem + 4cqi, 4.5rem); font-weight: 800; line-height: 0.95; letter-spacing: -0.05em; }
.swk__wrap { display: grid; gap: 28px; }
.swk__steps { display: grid; gap: 40px; }
.swk__step { padding-top: 18px; border-top: 1px solid var(--s-border); }
.swk__n { margin: 0; ${MONO} font-size: 0.8125rem; color: var(--s-accent); }
.swk__title { margin: 8px 0 0; ${H} font-size: clamp(1.5rem, 1.2rem + 1.4cqi, 2.25rem); font-weight: 700; letter-spacing: -0.035em; }
.swk__text { max-width: 44ch; margin: 10px 0 0; line-height: 1.55; opacity: 0.86; }
.swk__inline { width: 100%; height: auto; margin-top: 18px; border: 1px solid var(--s-border); }
.swk__pin { display: none; }
.swk__screen { margin: 0; }
.swk__screen img { display: block; width: 100%; height: auto; }
.swk__blank { display: grid; place-items: center; aspect-ratio: 16 / 10; padding: 24px; border: 1px solid var(--s-border); ${H} font-size: 2rem; font-weight: 800; letter-spacing: -0.04em; text-align: center; }
@container (min-width: 900px) {
  .swk__wrap { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); align-items: start; }
  .swk__steps { gap: 0; }
  .swk__step { min-height: 70vh; }
  .swk__inline { display: none; }
  .swk__pin { display: grid; position: sticky; top: 96px; }
  .swk__screen { grid-area: 1 / 1; border: 1px solid var(--s-border); background: var(--s-bg); }
  .swk__screen:not(:first-child) { opacity: 0; }
}
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    @container (min-width: 900px) {
      .swk:not([data-motion="off"]) .swk__wrap { timeline-scope: --swk-2, --swk-3, --swk-4; }
      .swk:not([data-motion="off"]) .swk__step:nth-child(2) { view-timeline-name: --swk-2; }
      .swk:not([data-motion="off"]) .swk__step:nth-child(3) { view-timeline-name: --swk-3; }
      .swk:not([data-motion="off"]) .swk__step:nth-child(4) { view-timeline-name: --swk-4; }
      .swk:not([data-motion="off"]) .swk__screen:nth-child(2) { animation: swk-in linear both; animation-timeline: --swk-2; animation-range: entry 40% cover 40%; }
      .swk:not([data-motion="off"]) .swk__screen:nth-child(3) { animation: swk-in linear both; animation-timeline: --swk-3; animation-range: entry 40% cover 40%; }
      .swk:not([data-motion="off"]) .swk__screen:nth-child(4) { animation: swk-in linear both; animation-timeline: --swk-4; animation-range: entry 40% cover 40%; }
    }
  }
}
@media (prefers-reduced-motion: reduce) { @container (min-width: 900px) { .swk__wrap { grid-template-columns: minmax(0, 1fr); } .swk__pin { display: none; } .swk__inline { display: block; } .swk__step { min-height: 0; padding-bottom: 40px; } } }
.swk[data-motion="off"] .swk__pin { display: none; }
.swk[data-motion="off"] .swk__inline { display: block; }
.swk[data-motion="off"] .swk__step { min-height: 0; padding-bottom: 40px; }
.swk[data-motion="off"] .swk__wrap { grid-template-columns: minmax(0, 1fr); }
@keyframes swk-in { from { opacity: 0; transform: translateY(calc(var(--t-motion-distance, 24px) * var(--m-k, 1))) scale(0.98); } to { opacity: 1; transform: none; } }`,
  settings: [
    text("heading", "Heading", "From merged to announced in one pass"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "step", name: "Step", settings: [text("title", "Step", "Connect your repo"), textarea("text", "What happens", "Orbit reads merged pull requests and their labels."), image("screen", "Screen"), text("alt", "Screen description", "The Orbit release draft view")] }],
  presetBlocks: [
    { type: "step", settings: { title: "Connect the repository", text: "Orbit reads merged pull requests, their labels and the issues they close. Nothing is published yet.", alt: "Orbit's list of merged pull requests grouped by label" } },
    { type: "step", settings: { title: "Read the draft", text: "Each change becomes a plain sentence for the people who use it, grouped by what they will notice first.", alt: "A release draft with grouped changes and edit marks" } },
    { type: "step", settings: { title: "Approve and send", text: "Approve the lines you like. Orbit publishes the changelog, updates the docs page and queues the in-app note.", alt: "The approve and publish panel with three destinations ticked" } },
  ],
  maxBlocks: 4,
})

/* ── features as a spec sheet ── */
export const specs = defineSection({
  type: "ai_sw_specs",
  name: "Spec sheet",
  summary: "What it does as a ruled spec sheet: a mono key, a short title and one sentence per row, the rows rising in as they scroll in.",
  template: `
<section class="sws" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="sws__head">
    <h2 class="sws__h">{{ settings.heading }}</h2>
    <div class="sws__intro">{{ settings.intro | raw }}</div>
  </div>
  <dl class="sws__list" data-storelib-motion="reveal-stagger">
    {% for block in section.blocks %}
      <div class="sws__row" data-block-id="{{ block.id }}"><dt class="sws__key">{{ block.settings.key }}</dt><dd class="sws__body"><span class="sws__title">{{ block.settings.title }}</span><span class="sws__text">{{ block.settings.text }}</span></dd></div>
    {% endfor %}
  </dl>
</section>`,
  style: `
.sws { ${BOX} }
.sws__head { display: grid; gap: 16px; margin-bottom: 36px; }
.sws__h { margin: 0; ${H} font-size: clamp(2rem, 1.3rem + 3.6cqi, 4rem); font-weight: 800; line-height: 0.95; letter-spacing: -0.05em; max-width: 16ch; }
.sws__intro { max-width: 52ch; line-height: 1.55; opacity: 0.86; }
.sws__intro p { margin: 0; }
.sws__list { margin: 0; border-top: 1px solid var(--s-border); }
.sws__row { display: grid; gap: 6px; padding: 20px 0; border-bottom: 1px solid var(--s-border); }
.sws__key { ${MONO} font-size: 0.8125rem; color: var(--s-accent); }
.sws__body { display: grid; gap: 6px; margin: 0; }
.sws__title { ${H} font-size: clamp(1.25rem, 1.1rem + 0.8cqi, 1.75rem); font-weight: 700; letter-spacing: -0.03em; }
.sws__text { max-width: 56ch; line-height: 1.55; opacity: 0.82; }
@container (min-width: 820px) {
  .sws__head { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: end; }
  .sws__row { grid-template-columns: 10rem minmax(0, 1fr); }
  .sws__body { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 24px; }
}
${revealCss("sws", ".sws__row", "sws-rise")}`,
  settings: [
    text("heading", "Heading", "Small on purpose"),
    richtext("intro", "Intro", "<p>Orbit does one job: it turns shipped work into words people read. Everything below serves that.</p>"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "spec", name: "Spec", settings: [text("key", "Key", "voice"), text("title", "Title", "Your voice, learned"), textarea("text", "Sentence", "Orbit learns from the notes you already wrote.")] }],
  presetBlocks: [
    { type: "spec", settings: { key: "voice", title: "Your voice, learned", text: "Point Orbit at the notes you already published and new drafts read like you wrote them." } },
    { type: "spec", settings: { key: "review", title: "Nothing ships unseen", text: "Every line waits for a person to approve it. Edits you make teach the next draft." } },
    { type: "spec", settings: { key: "targets", title: "One draft, every place", text: "Changelog page, docs, email digest and the in-app panel stay in step from one approval." } },
    { type: "spec", settings: { key: "private", title: "Code stays yours", text: "Orbit reads titles, labels and descriptions. It never stores your source." } },
  ],
  maxBlocks: 8,
})

/* ── pinned horizontal use cases ── */
export const usecases = defineSection({
  type: "ai_sw_usecases",
  name: "Sideways use cases",
  summary: "Who it is for, as wide panels that move sideways while the section is pinned (P3 pin-horizontal); a native swipe row with snap points on phones.",
  template: `
<section class="swu" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="swu__h">{{ settings.heading }}</h2>
  <div class="swu__pin" data-storelib-motion="pin-horizontal" data-motion-speed="1" data-motion-mobile="swipe"><div class="swu__stage" data-motion-stage><div class="swu__rail" data-motion-track tabindex="0" aria-label="{{ settings.heading }}">
    {% for block in section.blocks %}
      <article class="swu__panel" data-block-id="{{ block.id }}">
        {% if block.settings.photo %}<img class="swu__img" src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="1200" height="800">{% endif %}
        <div class="swu__copy">
          <p class="swu__who">{{ block.settings.who }}</p>
          <h3 class="swu__title">{{ block.settings.title }}</h3>
          <p class="swu__text">{{ block.settings.text }}</p>
        </div>
      </article>
    {% endfor %}
  </div>
</section></div></div>`,
  style: `
.swu { ${BOX} overflow: hidden; }
.swu__h { margin: 0 0 28px; ${H} font-size: clamp(2rem, 1.3rem + 3.6cqi, 4rem); font-weight: 800; letter-spacing: -0.05em; line-height: 0.95; }
.swu__rail { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; padding-bottom: 12px; }
.swu__panel { flex: none; width: 86cqi; scroll-snap-align: start; display: grid; align-content: end; min-height: 420px; position: relative; overflow: hidden; border: 1px solid var(--s-border); background: var(--s-bg); }
.swu__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
.swu__copy { position: relative; padding: 22px; }
.swu__who { margin: 0; ${MONO} font-size: 0.8125rem; color: var(--s-accent); }
.swu__title { margin: 8px 0 0; ${H} font-size: clamp(1.75rem, 1.3rem + 2cqi, 3rem); font-weight: 800; letter-spacing: -0.045em; line-height: 0.95; }
.swu__text { max-width: 40ch; margin: 12px 0 0; line-height: 1.5; }
@container (min-width: 900px) { .swu__panel { width: 44cqi; min-height: 560px; } }
@media (prefers-reduced-motion: reduce) { .swu__rail { scroll-snap-type: none; } }`,
  settings: [
    text("heading", "Heading", "Who reads what you ship"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "panel", name: "Use case", settings: [text("who", "Who", "Product teams"), text("title", "Title", "Fewer release meetings"), textarea("text", "Sentence", "The draft is the meeting."), image("photo", "Photo"), text("alt", "Photo description", "")] }],
  presetBlocks: [
    { type: "panel", settings: { who: "Product teams", title: "The draft is the meeting", text: "Everyone reviews the same release draft instead of a slide about it.", alt: "A product team around one laptop reviewing a draft" } },
    { type: "panel", settings: { who: "Support", title: "Answers before the tickets", text: "Support sees what changed the morning it ships and links the note in replies.", alt: "A support lead with headphones reading release notes" } },
    { type: "panel", settings: { who: "Customers", title: "News they actually open", text: "A short digest of what got better for them, not a list of ticket numbers.", alt: "A phone showing a short product update email" } },
  ],
  maxBlocks: 6,
})

/* ── a text-scramble statement ── */
export const statement = defineSection({
  type: "ai_sw_statement",
  name: "Statement",
  summary: "One big statement whose key words resolve from scrambled characters as it enters (P3 text-scramble); plain words without it.",
  template: `
<section class="swt" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <p class="swt__line" data-storelib-motion="text-scramble" data-motion-duration="{{ settings.scramble_ms }}">{{ settings.line }}</p>
  <ul class="swt__notes">
    {% for block in section.blocks %}<li class="swt__note" data-block-id="{{ block.id }}">{{ block.settings.note }}</li>{% endfor %}
  </ul>
</section>`,
  style: `
.swt { ${BOX} }
.swt__line { max-width: 22ch; margin: 0; ${H} font-size: clamp(2rem, 1.2rem + 4.4cqi, 5rem); font-weight: 800; line-height: 1; letter-spacing: -0.05em; }
.swt__notes { display: grid; gap: 10px; margin: 36px 0 0; padding: 0; list-style: none; }
.swt__note { ${MONO} font-size: 0.875rem; opacity: 0.8; }
.swt__note::before { content: "+ "; color: var(--s-accent); }
@container (min-width: 820px) { .swt__notes { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
${revealCss("swt", ".swt__line", "swt-rise")}`,
  settings: [
    textarea("line", "Statement", "Release notes are the last mile of every feature. Most teams skip it. Orbit makes it the easy part."),
    range("scramble_ms", "Scramble length", 300, 3000, 100, 900, "ms"),
    ...motion(),
    scheme("site_inverse"),
    ...spacing(120, 120),
  ],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Drafts in under a minute")] }],
  presetBlocks: [
    { type: "note", settings: { note: "Works with GitHub and GitLab" } },
    { type: "note", settings: { note: "Approve from your phone" } },
    { type: "note", settings: { note: "Export everything as Markdown" } },
  ],
  maxBlocks: 6,
})

/* ── plans from the store's real products ── */
export const plans = defineSection({
  type: "ai_sw_plans",
  name: "Plans",
  summary: "Plans drawn from the store's real products (chosen, or the newest): name, price, the product's own options, add to cart; one shared list of what every plan includes.",
  template: `
<section class="swp" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="swp__head"><h2 class="swp__h">{{ settings.heading }}</h2><div class="swp__intro">{{ settings.intro | raw }}</div></div>
  {% if settings.products.size > 0 %}
  <ul class="swp__list">
    {% for product in settings.products limit: 4 %}
      <li class="swp__plan">
        <h3 class="swp__name"><a href="{{ product.settings.url | url }}">{{ product.settings.title }}</a></h3>
        <p class="swp__price">{{ product.settings.price }}</p>
        <button class="swp__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-image="{{ product.settings.image }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button>
      </li>
    {% endfor %}
  </ul>
  {% else %}
  <ul class="swp__list">
    {% for product in products limit: 4 %}
      <li class="swp__plan">
        <h3 class="swp__name"><a href="{{ product.settings.url | url }}">{{ product.settings.title }}</a></h3>
        <p class="swp__price">{{ product.settings.price }}</p>
        <button class="swp__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-image="{{ product.settings.image }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button>
      </li>
    {% endfor %}
  </ul>
  {% endif %}
  <div class="swp__all">
    <p class="swp__all-h">{{ settings.includes_heading }}</p>
    <ul class="swp__inc">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.line }}</li>{% endfor %}</ul>
  </div>
</section>`,
  style: `
.swp { ${BOX} }
.swp__head { display: grid; gap: 14px; margin-bottom: 32px; }
.swp__h { margin: 0; ${H} font-size: clamp(2rem, 1.3rem + 3.6cqi, 4rem); font-weight: 800; letter-spacing: -0.05em; line-height: 0.95; }
.swp__intro { max-width: 50ch; opacity: 0.86; line-height: 1.55; }
.swp__intro p { margin: 0; }
.swp__list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.swp__plan { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px 20px; padding: 22px 0; border-bottom: 1px solid var(--s-border); }
.swp__name { margin: 0; ${H} font-size: clamp(1.5rem, 1.2rem + 1.4cqi, 2.5rem); font-weight: 800; letter-spacing: -0.04em; }
.swp__name a { color: inherit; text-decoration: none; }
.swp__price { margin: 0; ${MONO} font-size: 1.125rem; font-variant-numeric: tabular-nums; }
.swp__add { grid-column: 1 / -1; justify-self: start; min-height: 48px; padding: 0 22px; border: 1px solid var(--s-text); background: none; color: inherit; font: inherit; font-weight: 600; cursor: pointer; transition: background-color var(--t-motion-hover, 200ms) ease, color var(--t-motion-hover, 200ms) ease; }
.swp__add:hover { background: var(--s-btn); border-color: var(--s-btn); color: var(--s-btn-text); }
.swp__all { margin-top: 36px; }
.swp__all-h { margin: 0 0 12px; font-weight: 700; }
.swp__inc { display: grid; gap: 8px; margin: 0; padding: 0 0 0 1.1em; }
@container (min-width: 820px) {
  .swp__head { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: end; }
  .swp__plan { grid-template-columns: minmax(0, 1fr) 10rem auto; }
  .swp__add { grid-column: auto; }
  .swp__inc { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}`,
  settings: [
    text("heading", "Heading", "Pick a plan, change it any time"),
    richtext("intro", "Intro", "<p>Every plan is a real product in the shop, so prices, taxes and receipts stay right.</p>"),
    productList(),
    text("add_label", "Add button", "Add to cart"),
    text("includes_heading", "Every plan includes", "Every plan includes"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "include", name: "Included", settings: [text("line", "Line", "Unlimited drafts")] }],
  presetBlocks: ["Unlimited drafts and edits", "Changelog page on your domain", "Email digest and in-app panel", "Export to Markdown at any time"].map((line) => ({ type: "include", settings: { line } })),
  maxBlocks: 10,
})

/* ── before and after, as a plain table ── */
export const compare = defineSection({
  type: "ai_sw_compare",
  name: "Before and after",
  summary: "How a release goes today against how it goes with the product, row by row in a real table.",
  template: `
<section class="swc" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="swc__h">{{ settings.heading }}</h2>
  <div class="swc__scroll">
    <table class="swc__table">
      <thead><tr><th scope="col">{{ settings.col_task }}</th><th scope="col">{{ settings.col_before }}</th><th scope="col" class="swc__now">{{ settings.col_after }}</th></tr></thead>
      <tbody>
        {% for block in section.blocks %}<tr data-block-id="{{ block.id }}"><th scope="row">{{ block.settings.task }}</th><td>{{ block.settings.before }}</td><td class="swc__now">{{ block.settings.after }}</td></tr>{% endfor %}
      </tbody>
    </table>
  </div>
</section>`,
  style: `
.swc { ${BOX} }
.swc__h { margin: 0 0 28px; ${H} font-size: clamp(2rem, 1.3rem + 3.6cqi, 4rem); font-weight: 800; letter-spacing: -0.05em; line-height: 0.95; max-width: 16ch; }
.swc__scroll { overflow-x: auto; }
.swc__table { width: 100%; min-width: 0; border-collapse: collapse; font-size: 0.9375rem; }
.swc__table th, .swc__table td { padding: 14px 12px 14px 0; border-bottom: 1px solid var(--s-border); text-align: left; vertical-align: top; font-weight: 400; }
.swc__table thead th { ${MONO} font-size: 0.75rem; opacity: 0.75; }
.swc__table tbody th { font-weight: 600; }
.swc__now { color: var(--s-heading); }
.swc__table thead .swc__now { color: var(--s-accent); opacity: 1; }`,
  settings: [
    text("heading", "Heading", "A release, before and after"),
    text("col_task", "First column", "Task"),
    text("col_before", "Second column", "Today"),
    text("col_after", "Third column", "With Orbit"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "row", name: "Row", settings: [text("task", "Task", "Changelog"), text("before", "Today", "Written the night before"), text("after", "With the product", "Drafted as you merge")] }],
  presetBlocks: [
    { type: "row", settings: { task: "Changelog", before: "Written the night before, if at all", after: "Drafted as you merge" } },
    { type: "row", settings: { task: "Docs", before: "Updated weeks later", after: "Updated in the same approval" } },
    { type: "row", settings: { task: "Customer email", before: "Copy pasted from the changelog", after: "Its own short version, ready to send" } },
    { type: "row", settings: { task: "Support", before: "Hears about it from customers", after: "Sees it the morning it ships" } },
  ],
  maxBlocks: 10,
})

/* ── questions ── */
export const faq = defineSection({
  type: "ai_sw_faq",
  name: "Questions",
  summary: "Questions as native disclosures in two columns on wide screens.",
  template: `
<section class="swf" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="swf__h">{{ settings.heading }}</h2>
  <div class="swf__list">
    {% for block in section.blocks %}
      <details class="swf__item" data-block-id="{{ block.id }}"><summary class="swf__q">{{ block.settings.question }}</summary><div class="swf__a">{{ block.settings.answer | raw }}</div></details>
    {% endfor %}
  </div>
</section>`,
  style: `
.swf { ${BOX} }
.swf__h { margin: 0 0 24px; ${H} font-size: clamp(2rem, 1.3rem + 3.6cqi, 4rem); font-weight: 800; letter-spacing: -0.05em; line-height: 0.95; }
.swf__list { display: grid; column-gap: 40px; border-top: 1px solid var(--s-border); }
.swf__item { border-bottom: 1px solid var(--s-border); }
.swf__q { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 60px; cursor: pointer; font-weight: 600; list-style: none; }
.swf__q::-webkit-details-marker { display: none; }
.swf__q::after { content: "+"; ${MONO} color: var(--s-accent); transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.swf__item[open] .swf__q::after { transform: rotate(45deg); }
.swf__a { max-width: 60ch; padding-bottom: 18px; line-height: 1.6; opacity: 0.86; }
.swf__a p { margin: 0; }
@container (min-width: 900px) { .swf__list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .swf__q::after { transition: none; } }`,
  settings: [text("heading", "Heading", "Questions"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "question", name: "Question", settings: [text("question", "Question", "Does Orbit read my code?"), richtext("answer", "Answer", "<p>No. It reads titles, labels and descriptions.</p>")] }],
  presetBlocks: [
    { type: "question", settings: { question: "Does Orbit read my code?", answer: "<p>No. It reads pull request titles, labels, descriptions and linked issues. Source never leaves your host.</p>" } },
    { type: "question", settings: { question: "Can I edit a draft before it goes out?", answer: "<p>Always. Nothing publishes until a person approves it, and your edits shape the next draft.</p>" } },
    { type: "question", settings: { question: "Where do the notes appear?", answer: "<p>On a changelog page, in your docs, in an email digest and in a small in-app panel. Turn any of them off.</p>" } },
    { type: "question", settings: { question: "Can I leave and take my notes?", answer: "<p>Yes. Export every release as Markdown from settings at any time.</p>" } },
  ],
  maxBlocks: 12,
})

/* ── closing call with a tilted card over a live gradient field ── */
export const closing = defineSection({
  type: "ai_sw_closing",
  name: "Closing call",
  summary: "The last ask: a huge line and one button on a slow moving colour field (P3 webgl-gradient; a flat colour without it), the button tilting toward the pointer (3d-tilt).",
  template: `
<section class="swz" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="swz__field" aria-hidden="true" data-storelib-motion="webgl-gradient" data-motion-palette="{{ settings.field_colors }}" data-motion-speed="{{ settings.field_speed }}" data-motion-grain="12"></div>
  <div class="swz__in">
    <h2 class="swz__h">{{ settings.heading }}</h2>
    <div class="swz__text">{{ settings.text | raw }}</div>
    <a class="swz__btn" href="{{ settings.cta_url | url }}" data-storelib-motion="3d-tilt" data-motion-intensity="8">{{ settings.cta_label }}</a>
    <ul class="swz__facts">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.fact }}</li>{% endfor %}</ul>
  </div>
</section>`,
  style: `
.swz { ${BOX} position: relative; overflow: hidden; }
.swz__field { position: absolute; inset: 0; background: var(--s-accent); opacity: 0.12; }
.swz__in { position: relative; display: grid; justify-items: start; gap: 20px; max-width: 1100px; }
.swz__h { margin: 0; ${H} font-size: clamp(2.75rem, 1.4rem + 7cqi, 8rem); font-weight: 900; line-height: 0.88; letter-spacing: -0.06em; }
.swz__text { max-width: 46ch; line-height: 1.55; }
.swz__text p { margin: 0; }
.swz__btn { display: inline-flex; align-items: center; min-height: 58px; padding: 0 30px; background: var(--s-btn); color: var(--s-btn-text); font-weight: 700; font-size: 1.0625rem; text-decoration: none; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.swz__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.swz__btn:active { transform: translateY(2px); }
.swz__facts { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 8px 0 0; padding: 0; list-style: none; ${MONO} font-size: 0.8125rem; opacity: 0.8; }
${revealCss("swz", ".swz__h", "swz-rise")}`,
  settings: [
    text("heading", "Heading", "Ship it. Say it."),
    richtext("text", "Text", "<p>Connect a repository and read your first draft before your coffee is cold.</p>"),
    text("cta_label", "Button", "Start free"),
    url("cta_url", "Button goes to", "/products"),
    text("field_colors", "Colour field (scheme, accent, mono, or up to five #hex colours)", "#c8f031, #0a0c0b, #1d2a12"),
    range("field_speed", "Colour field speed", 0, 2, 0.1, 0.4, "x"),
    ...motion(),
    scheme("site"),
    ...spacing(140, 140),
  ],
  blocks: [{ type: "fact", name: "Fact", settings: [text("fact", "Fact", "No card to start")] }],
  presetBlocks: ["No card to start", "Cancel from settings", "Export any time"].map((fact) => ({ type: "fact", settings: { fact } })),
  maxBlocks: 4,
})

/* ── footer: huge wordmark, newsletter, columns from the menu ── */
export const footer = defineSection({
  type: "ai_sw_footer",
  name: "Footer",
  kind: "footer",
  summary: "Footer led by a newsletter line and a giant wordmark, the footer menu as columns, language and currency, the small print.",
  template: `
<footer class="swo" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <div class="swo__top">
    <form class="swo__form" data-storelib-form="subscribe">
      <label class="swo__label" for="swo-e-{{ section.id }}">{{ settings.newsletter_heading }}</label>
      <div class="swo__row"><input class="swo__input" id="swo-e-{{ section.id }}" type="email" name="email" autocomplete="email" required placeholder="{{ settings.email_placeholder }}"><button class="swo__go" type="submit">{{ settings.button_label }}</button></div>
    </form>
    <nav class="swo__cols" aria-label="{{ settings.nav_label }}">
      {% for link in settings.menu.links %}
        <div class="swo__col">
          <a class="swo__col-h" href="{{ link.url }}">{{ link.title }}</a>
          {% if link.links.size > 0 %}<ul>{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>{% endif %}
        </div>
      {% endfor %}
    </nav>
  </div>
  <p class="swo__mark" aria-hidden="true">{{ settings.wordmark | default: shop.name }}</p>
  <div class="swo__base">
    <ul class="swo__links">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><a href="{{ block.settings.url | url }}">{{ block.settings.label }}</a></li>{% endfor %}</ul>
    ${prefs("swo")}
    <p class="swo__small">{{ settings.small_print }}</p>
  </div>
</footer>`,
  style: `
.swo__links { display: flex; flex-wrap: wrap; gap: 0 18px; margin: 0; padding: 0; list-style: none; }
.swo__links a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; }
.swo { padding: 64px var(--theme-padding-x, 20px) 24px; background: var(--s-bg); color: var(--s-text); border-top: 1px solid var(--s-border); container-type: inline-size; overflow: hidden; }
.swo__top { display: grid; gap: 40px; }
.swo__label { display: block; margin-bottom: 14px; font-family: var(--theme-font-heading), sans-serif; color: var(--s-heading); font-size: clamp(1.5rem, 1.2rem + 1.6cqi, 2.5rem); font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
.swo__row { display: flex; flex-wrap: wrap; gap: 8px; }
.swo__input { flex: 1 1 220px; min-width: 0; min-height: 52px; padding: 0 14px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; }
.swo__go { min-height: 52px; padding: 0 22px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 700; cursor: pointer; }
.swo__cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.swo__col-h { display: inline-flex; min-height: 44px; align-items: center; font-weight: 700; color: inherit; text-decoration: none; }
.swo__col ul { margin: 0; padding: 0; list-style: none; }
.swo__col li a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; opacity: 0.8; text-decoration: none; }
.swo__col li a:hover { opacity: 1; text-decoration: underline; }
.swo__mark { margin: 48px 0 20px; font-family: var(--theme-font-heading), sans-serif; font-size: 22cqi; font-weight: 900; line-height: 0.8; letter-spacing: -0.07em; color: var(--s-heading); white-space: nowrap; overflow: hidden; text-transform: lowercase; }
.swo__base { display: grid; gap: 16px; padding-top: 18px; border-top: 1px solid var(--s-border); }
.swo__small { margin: 0; font-size: 0.8125rem; opacity: 0.7; }
${panelCss("swo")}
@container (min-width: 900px) {
  .swo__top { grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); }
  .swo__cols { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .swo__base { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
}`,
  settings: [
    menu("menu", "Footer menu", "footer"),
    text("newsletter_heading", "Newsletter line", "One email when something ships"),
    text("email_placeholder", "Email hint", "you@company.com"),
    text("button_label", "Subscribe button", "Subscribe"),
    text("wordmark", "Giant word (empty uses the shop name)", "orbit"),
    text("small_print", "Small print", "Made for teams who ship every week."),
    text("nav_label", "Menu name (read aloud)", "Footer"),
    text("language_label", "Language", "Language"),
    text("currency_label", "Currency", "Currency"),
    scheme("site"),
  ],
  blocks: [{ type: "link", name: "Link", settings: [text("label", "Label", "Instagram"), url("url", "Goes to", "https://www.instagram.com/")] }],
  presetBlocks: [
    { type: "link", settings: { label: "GitHub", url: "https://github.com/" } },
    { type: "link", settings: { label: "LinkedIn", url: "https://www.linkedin.com/" } },
  ],
  maxBlocks: 6,
})

/* ── product page ── */
export const product = defineSection({
  type: "ai_sw_product",
  name: "Product",
  summary: "The product page: its pictures in a wide stage, name, price, options as add to cart buttons, offers, description and what is included.",
  template: `
<section class="swpd" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="swpd__grid">
  <div class="swpd__media" data-storelib-motion="3d-tilt" data-motion-intensity="6">
    {% for img in product.images limit: 4 %}<img class="swpd__img" src="{{ img }}" alt="{{ product.title }}" width="1200" height="900">{% endfor %}
  </div>
  <div class="swpd__info">
    <h1 class="swpd__title">{{ product.title }}</h1>
    <p class="swpd__price">{{ product.price }}{% if product.compare_price %} <s>{{ product.compare_price }}</s>{% endif %}</p>
    {% if page.product.settings.variants.size > 0 %}
      <div class="swpd__opts" role="group" aria-label="{{ settings.options_label }}">
        {% for v in page.product.settings.variants %}<button class="swpd__opt" type="button" data-storelib-add-to-cart="{{ product.id }}" data-variant-id="{{ v.id }}" data-title="{{ product.title }}" data-price="{{ v.price }}">{{ v.name }} <span>{{ v.price }}</span></button>{% endfor %}
      </div>
    {% else %}
      <button class="swpd__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.title }}" data-price="{{ product.price }}" data-url="{{ product.url }}">{{ settings.add_label }}</button>
    {% endif %}
    <div data-storelib-island data-storelib-offers="{{ product.id }}" data-title="{{ product.title }}" data-url="{{ product.url }}" data-layout="open"></div>
    {% if product.description_html %}<div class="swpd__desc">{{ product.description_html | raw }}</div>{% endif %}
    {% if product.includes.size > 0 %}<ul class="swpd__inc">{% for line in product.includes %}<li>{{ line }}</li>{% endfor %}</ul>{% endif %}
    <ul class="swpd__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><span>{{ block.settings.key }}</span> {{ block.settings.text }}</li>{% endfor %}</ul>
  </div>
  </div>
</section>`,
  style: `
.swpd { ${BOX} }
.swpd__grid { display: grid; gap: 28px; }
.swpd__media { display: grid; gap: 10px; }
.swpd__img { width: 100%; height: auto; border: 1px solid var(--s-border); }
.swpd__title { margin: 0; ${H} font-size: clamp(2.25rem, 1.3rem + 4.6cqi, 5rem); font-weight: 800; line-height: 0.92; letter-spacing: -0.05em; }
.swpd__price { margin: 14px 0 22px; ${MONO} font-size: 1.25rem; }
.swpd__opts { display: grid; gap: 8px; }
.swpd__opt, .swpd__add { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 54px; padding: 0 20px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.swpd__add { justify-content: center; border: 0; background: var(--s-btn); color: var(--s-btn-text); font-weight: 700; }
.swpd__opt:hover { border-color: var(--s-accent); }
.swpd__desc { margin-top: 24px; max-width: 60ch; line-height: 1.6; }
.swpd__inc, .swpd__notes { display: grid; gap: 8px; margin: 22px 0 0; padding: 18px 0 0; border-top: 1px solid var(--s-border); list-style: none; }
.swpd__notes span { ${MONO} color: var(--s-accent); }
@container (min-width: 900px) { .swpd__grid { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); align-items: start; } .swpd__info { position: sticky; top: 88px; } }`,
  settings: [
    text("add_label", "Add button", "Add to cart"),
    text("options_label", "Options (read aloud)", "Choose a plan"),
    ...motion(),
    scheme("site"),
    ...spacing(48, 96),
  ],
  blocks: [{ type: "note", name: "Note", settings: [text("key", "Key", "setup"), text("text", "Note", "Ready in five minutes")] }],
  presetBlocks: [
    { type: "note", settings: { key: "setup", text: "Connect a repository in about five minutes" } },
    { type: "note", settings: { key: "billing", text: "Monthly, cancel from settings" } },
    { type: "note", settings: { key: "data", text: "Export everything as Markdown" } },
  ],
  maxBlocks: 6,
})

/* ── collection page ── */
export const collection = defineSection({
  type: "ai_sw_collection",
  name: "Collection",
  summary: "A collection's real products as a ruled index: name, price, add to cart; the collection's own title and words.",
  template: `
<section class="swl" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h1 class="swl__h">{% if collection.title %}{{ collection.title }}{% else %}{{ settings.heading }}{% endif %}</h1>
  {% if collection.description %}<p class="swl__intro">{{ collection.description }}</p>{% endif %}
  {% if page.query %}<p class="swl__intro">{{ settings.query_label }} {{ page.query }}</p>{% endif %}
  <ul class="swl__list">
    {% for product in products %}
      <li class="swl__item">
        <a class="swl__link" href="{{ product.settings.url | url }}">
          {% if product.settings.image %}<img class="swl__img" src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="800" height="600">{% endif %}
          <span class="swl__name">{{ product.settings.title }}</span>
          <span class="swl__price">{{ product.settings.price }}</span>
        </a>
        <button class="swl__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button>
      </li>
    {% endfor %}
  </ul>
  <ul class="swl__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.text }}</li>{% endfor %}</ul>
</section>`,
  style: `
.swl { ${BOX} }
.swl__h { margin: 0; ${H} font-size: clamp(2.5rem, 1.4rem + 5.6cqi, 6rem); font-weight: 900; letter-spacing: -0.06em; line-height: 0.9; }
.swl__intro { max-width: 52ch; margin: 16px 0 0; line-height: 1.55; opacity: 0.86; }
.swl__list { display: grid; gap: 28px 18px; margin: 40px 0 0; padding: 0; list-style: none; }
.swl__link { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; color: inherit; text-decoration: none; }
.swl__img { grid-column: 1 / -1; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border: 1px solid var(--s-border); transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.swl__name { ${H} font-size: 1.375rem; font-weight: 700; letter-spacing: -0.03em; }
.swl__price { ${MONO} }
.swl__add { margin-top: 10px; min-height: 46px; padding: 0 18px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; cursor: pointer; }
.swl__add:hover { border-color: var(--s-accent); }
.swl__notes { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 48px 0 0; padding: 18px 0 0; border-top: 1px solid var(--s-border); list-style: none; ${MONO} font-size: 0.8125rem; opacity: 0.8; }
@media (hover: hover) and (pointer: fine) { .swl__link:hover .swl__img { transform: translateY(calc(var(--t-motion-lift, 4px) * -1)); } }
@container (min-width: 760px) { .swl__list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (min-width: 1100px) { .swl__list { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .swl__img { transition: none; } }`,
  settings: [text("heading", "Heading when there is no collection", "Plans and add-ons"), text("query_label", "Before the search words", "Results for"), text("add_label", "Add button", "Add to cart"), ...motion(), scheme("site"), ...spacing(64, 96)],
  blocks: [{ type: "note", name: "Note", settings: [text("text", "Note", "Prices include tax where it applies")] }],
  presetBlocks: ["Prices include tax where it applies", "Change plans any time", "Receipts by email"].map((t) => ({ type: "note", settings: { text: t } })),
  maxBlocks: 4,
})

/* ── about: the story and the principles ── */
export const about = defineSection({
  type: "ai_sw_about",
  name: "Story and principles",
  summary: "The about page's story beside a photo of the people who make it, then the principles they work by, numbered.",
  template: `
<section class="swa" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="swa__top">
    <h1 class="swa__h">{{ settings.heading }}</h1>
    <div class="swa__story">{{ settings.story | raw }}</div>
  </div>
  {% if settings.photo %}<span class="pdw" style="display: block; overflow: hidden;" data-storelib-motion="parallax-depth" data-motion-intensity="30" data-motion-pointer="false"><img class="swa__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1600" height="900" data-motion-depth="0.15"></span>{% endif %}
  <ol class="swa__list">
    {% for block in section.blocks %}<li class="swa__item" data-block-id="{{ block.id }}"><h2 class="swa__title">{{ block.settings.title }}</h2><p class="swa__text">{{ block.settings.text }}</p></li>{% endfor %}
  </ol>
</section>`,
  style: `
.swa { ${BOX} }
.swa__top { display: grid; gap: 22px; }
.swa__h { margin: 0; ${H} font-size: clamp(2.5rem, 1.4rem + 5.6cqi, 6rem); font-weight: 900; letter-spacing: -0.06em; line-height: 0.9; max-width: 14ch; }
.swa__story { max-width: 58ch; line-height: 1.65; font-size: 1.0625rem; }
.swa__img { width: 100%; height: auto; margin: 48px 0; aspect-ratio: 16 / 9; object-fit: cover; }
.swa__list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; counter-reset: swa; border-top: 1px solid var(--s-border); }
.swa__item { counter-increment: swa; display: grid; gap: 8px; padding: 22px 0; border-bottom: 1px solid var(--s-border); }
.swa__item::before { content: counter(swa, decimal-leading-zero); ${MONO} font-size: 0.8125rem; color: var(--s-accent); }
.swa__title { margin: 0; ${H} font-size: clamp(1.375rem, 1.1rem + 1cqi, 2rem); font-weight: 700; letter-spacing: -0.03em; }
.swa__text { max-width: 56ch; margin: 0; line-height: 1.55; opacity: 0.86; }
@container (min-width: 900px) { .swa__top { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: end; } .swa__item { grid-template-columns: 6rem minmax(0, 0.8fr) minmax(0, 1.2fr); } }
${revealCss("swa", ".swa__item", "swa-rise")}`,
  settings: [
    text("heading", "Heading", "We got tired of writing release notes at midnight"),
    richtext("story", "Story", "<p>Orbit started as a script that turned our own merged work into a draft changelog. Other teams asked for it, so we made it properly.</p><p>We are a small team that ships every week and reads every reply to our updates.</p>"),
    image("photo", "Photo"),
    text("photo_alt", "Photo description", "The Orbit team at a long table with laptops open"),
    ...motion(),
    scheme("site"),
    ...spacing(64, 96),
  ],
  blocks: [{ type: "principle", name: "Principle", settings: [text("title", "Principle", "People approve, always"), textarea("text", "What it means", "Nothing publishes without a person.")] }],
  presetBlocks: [
    { type: "principle", settings: { title: "People approve, always", text: "Orbit drafts. A person decides what goes out, every time." } },
    { type: "principle", settings: { title: "Plain words over feature names", text: "Notes say what got better for the reader, not what the ticket was called." } },
    { type: "principle", settings: { title: "Leave whenever you like", text: "Everything you wrote with Orbit exports as Markdown in one click." } },
  ],
  maxBlocks: 8,
})

/* ── contact ── */
export const contact = defineSection({
  type: "ai_sw_contact",
  name: "Contact",
  summary: "Contact page: a real contact form beside the ways to reach the team, each a link.",
  template: `
<section class="swx" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="swx__grid">
  <div class="swx__side">
    <h1 class="swx__h">{{ settings.heading }}</h1>
    <div class="swx__text">{{ settings.text | raw }}</div>
    <ul class="swx__ways">
      {% for block in section.blocks %}<li data-block-id="{{ block.id }}"><span class="swx__k">{{ block.settings.label }}</span>{% if block.settings.link %}<a href="{{ block.settings.link | url }}">{{ block.settings.value }}</a>{% else %}<span>{{ block.settings.value }}</span>{% endif %}</li>{% endfor %}
    </ul>
  </div>
  <form class="swx__form" data-storelib-form="contact">
    <label class="swx__field"><span>{{ settings.name_label }}</span><input name="name" type="text" autocomplete="name" maxlength="120" required></label>
    <label class="swx__field"><span>{{ settings.email_label }}</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
    <label class="swx__field"><span>{{ settings.message_label }}</span><textarea name="message" rows="6" maxlength="5000" required></textarea></label>
    <button class="swx__send" type="submit">{{ settings.send_label }}</button>
  </form>
  </div>
</section>`,
  style: `
.swx { ${BOX} }
.swx__grid { display: grid; gap: 40px; }
.swx__h { margin: 0; ${H} font-size: clamp(2.5rem, 1.4rem + 5.6cqi, 6rem); font-weight: 900; letter-spacing: -0.06em; line-height: 0.9; }
.swx__text { max-width: 46ch; margin-top: 16px; line-height: 1.6; }
.swx__ways { display: grid; gap: 0; margin: 28px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.swx__ways li { display: grid; gap: 4px; padding: 14px 0; border-bottom: 1px solid var(--s-border); }
.swx__ways a { color: inherit; min-height: 44px; display: inline-flex; align-items: center; }
.swx__k { ${MONO} font-size: 0.75rem; color: var(--s-accent); }
.swx__form { display: grid; gap: 14px; align-content: start; }
.swx__field { display: grid; gap: 6px; font-size: 0.9375rem; }
.swx__field input, .swx__field textarea { min-height: 52px; padding: 12px 14px; border: 1px solid var(--s-border); background: none; color: inherit; font: inherit; }
.swx__send { justify-self: start; min-height: 54px; padding: 0 26px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 700; cursor: pointer; }
@container (min-width: 900px) { .swx__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }`,
  settings: [
    text("heading", "Heading", "Talk to the people who build it"),
    richtext("text", "Text", "<p>Questions about plans, security or a migration. A person from the team answers within a working day.</p>"),
    text("name_label", "Name field", "Name"),
    text("email_label", "Email field", "Work email"),
    text("message_label", "Message field", "What can we help with?"),
    text("send_label", "Send button", "Send"),
    ...motion(),
    scheme("site"),
    ...spacing(64, 96),
  ],
  blocks: [{ type: "way", name: "Way to reach", settings: [text("label", "Label", "Email"), text("value", "Shown as", "hello@orbit.app"), url("link", "Link (mailto:, a page)", "mailto:hello@orbit.app")] }],
  presetBlocks: [
    { type: "way", settings: { label: "Email", value: "hello@orbit.app", link: "mailto:hello@orbit.app" } },
    { type: "way", settings: { label: "Security", value: "security@orbit.app", link: "mailto:security@orbit.app" } },
    { type: "way", settings: { label: "Plans", value: "Compare the plans", link: "/products" } },
  ],
  maxBlocks: 6,
})

export const ALL = [header, hero, marquee, walkthrough, specs, usecases, statement, plans, compare, faq, closing, footer, product, collection, about, contact]
