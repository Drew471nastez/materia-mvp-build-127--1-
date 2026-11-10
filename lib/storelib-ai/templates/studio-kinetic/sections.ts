/**
 * TEMPLATE i, "Fieldwork": a creative agency or studio. Experimental type
 * is the move: a hero stacked from lines the creator sets one by one (solid,
 * outlined, pushed right), one word resolving from scrambled letters, case
 * studies pinned and moving sideways, a project index whose picture follows
 * the pointer. Grey-green paper, black ink, one signal yellow.
 */
import {
  BOX, cartPanel, chromeVars, chromeWords, defineSection, image, menu, motion, panelCss, prefs, productList, range, revealCss, richtext, scheme, searchPanel, select, spacing, text, textarea, url, vars,
} from "../kit-b"

const D = "font-family: var(--theme-font-heading), sans-serif; color: var(--s-heading); font-weight: 800;"
const SMALL = "font-size: 0.8125rem; letter-spacing: 0.01em;"

export const header = defineSection({
  type: "ai_ag_header",
  name: "Header",
  kind: "header",
  summary: "Minimal header: the studio's name, three inline links on wide screens, search, cart and an Index button that slides a side drawer in with the whole menu, language and currency.",
  template: `
<header class="agn" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <div class="agn__bar">
    <a class="agn__logo" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" width="{{ settings.logo_width }}" height="28">{% else %}{{ shop.name | default: settings.brand }}{% endif %}</a>
    <nav class="agn__inline" aria-label="{{ settings.nav_label }}">
      {% for link in settings.menu.links limit: 3 %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}
    </nav>
    <div class="agn__tools">
      <button class="agn__tool" type="button" data-storelib-search>{{ settings.search_label }}</button>
      <button class="agn__tool" type="button" data-storelib-cart>{{ settings.cart_label }}<span class="agn__count" data-storelib-cart-count></span></button>
      <button class="agn__tool agn__index" type="button" popovertarget="agn-d-{{ section.id }}">{{ settings.menu_label }}</button>
    </div>
  </div>
  <div class="agn__drawer" id="agn-d-{{ section.id }}" popover>
    <button class="agn-x" type="button" popovertarget="agn-d-{{ section.id }}" popovertargetaction="hide">{{ settings.close_label }}</button>
    <nav aria-label="{{ settings.nav_label }}">
      <ul class="agn__list">
        {% for link in settings.menu.links %}<li><a class="agn__link" href="{{ link.url }}">{{ link.title }}</a>{% if link.links.size > 0 %}<ul class="agn__sub">{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>{% endif %}</li>{% endfor %}
      </ul>
    </nav>
    <p class="agn__note">{{ settings.drawer_note }}</p>
    <a class="agn__acct" href="{{ routes.account_url }}">{{ settings.account_label }}</a>
    ${prefs("agn")}
  </div>
  ${searchPanel("agn")}
  ${cartPanel("agn")}
</header>`,
  style: `
.agn { position: sticky; top: 0; z-index: 30; background: var(--s-bg); color: var(--s-text); }
.agn__bar { display: flex; align-items: center; gap: 16px; min-height: 60px; padding: 0 var(--theme-padding-x, 20px); border-bottom: 2px solid var(--s-text); }
.agn__logo { margin-right: auto; ${D} font-size: 1.375rem; letter-spacing: -0.05em; text-decoration: none; }
.agn__logo img { display: block; max-height: 28px; width: auto; height: auto; }
.agn__inline { display: none; gap: 22px; }
.agn__inline a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; text-decoration: none; }
.agn__inline a:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.agn__tools { display: flex; gap: 2px; }
.agn__tool { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 10px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.agn__index { background: var(--s-text); color: var(--s-bg); }
.agn__count:empty, .agn__count[data-count="0"] { display: none; }
.agn__count::before { content: "("; }
.agn__count::after { content: ")"; }
.agn__drawer { inset: 0 0 0 auto; width: min(560px, 100%); height: 100%; max-height: none; margin: 0; padding: 18px 24px 32px; border: 0; border-left: 2px solid var(--s-text); background: var(--s-bg); color: var(--s-text); overflow-y: auto; }
.agn__list { margin: 28px 0; padding: 0; list-style: none; }
.agn__link { display: block; padding: 4px 0; ${D} font-size: clamp(2.75rem, 2rem + 4vw, 4.75rem); line-height: 0.95; letter-spacing: -0.055em; text-decoration: none; }
.agn__link:hover { background: var(--s-accent); }
.agn__sub { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 4px 0 14px; padding: 0; list-style: none; }
.agn__sub a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; }
.agn__note { max-width: 36ch; margin: 0 0 12px; line-height: 1.5; }
.agn__acct { display: inline-flex; min-height: 44px; align-items: center; margin-bottom: 12px; color: inherit; }
.agn :focus-visible { outline: 2px solid var(--s-text); outline-offset: 2px; background: var(--s-accent); }
${panelCss("agn", { cartFrom: "left", searchFrom: "full" })}
.agn-cart { border-right: 2px solid var(--s-text); }
.agn-search__input { ${D} letter-spacing: -0.04em; }
.agn-cart__go { background: var(--s-text); color: var(--s-bg); }
@media (min-width: 900px) { .agn__inline { display: flex; } }
@media (prefers-reduced-motion: no-preference) {
  .agn__drawer { transition: transform var(--t-motion-duration, 650ms) var(--t-motion-ease, ease), display var(--t-motion-duration, 650ms) allow-discrete, overlay var(--t-motion-duration, 650ms) allow-discrete; transform: translateX(100%); }
  .agn__drawer:popover-open { transform: none; }
  @starting-style { .agn__drawer:popover-open { transform: translateX(100%); } }
}`,
  settings: [
    menu(),
    text("brand", "Name when there is no logo", "Fieldwork"),
    range("logo_width", "Logo width", 60, 220, 4, 120, "px"),
    text("drawer_note", "Line in the menu", "Booking projects from September. Small team, one project at a time."),
    text("account_label", "Account link", "Account"),
    ...chromeWords({ menu_label: "Index", cart_label: "Bag", search_placeholder: "Search work, editions and notes" }),
    scheme("site"),
  ],
})

export const hero = defineSection({
  type: "ai_ag_hero",
  name: "Kinetic type hero",
  summary: "A statement set as stacked lines the creator controls one by one (solid, outlined, pushed right), one line resolving from scrambled letters (P3 text-scramble), the studio's availability and one link.",
  template: `
<section class="agh" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h1 class="agh__h" aria-label="{{ settings.label }}">
    {% for block in section.blocks %}<span class="agh__line agh__line--{{ block.settings.style }}" data-block-id="{{ block.id }}"{% if block.settings.scramble %} data-storelib-motion="text-scramble" data-motion-duration="{{ settings.scramble_ms }}"{% endif %} aria-hidden="true">{{ block.settings.text }}</span>{% endfor %}
  </h1>
  <div class="agh__foot">
    <p class="agh__now"><span class="agh__dot" aria-hidden="true"></span>{{ settings.availability }}</p>
    <div class="agh__intro">{{ settings.intro | raw }}</div>
    <a class="agh__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
  </div>
</section>`,
  style: `
.agh { ${BOX} overflow: hidden; }
.agh__h { display: grid; margin: 0; ${D} font-size: clamp(3.25rem, 1rem + 13cqi, 14rem); line-height: 0.84; letter-spacing: -0.065em; }
.agh__line { display: block; white-space: nowrap; overflow: hidden; }
.agh__line--outline { color: transparent; -webkit-text-stroke: 2px var(--s-heading); }
.agh__line--right { justify-self: end; }
.agh__line--mark { justify-self: start; background: var(--s-accent); padding: 0 0.08em; }
.agh__foot { display: grid; gap: 20px; margin-top: 44px; padding-top: 18px; border-top: 2px solid var(--s-text); }
.agh__now { display: flex; align-items: center; gap: 10px; margin: 0; ${SMALL} }
.agh__dot { width: 10px; height: 10px; border-radius: 50%; background: var(--s-text); }
.agh__intro { max-width: 46ch; font-size: 1.125rem; line-height: 1.5; }
.agh__intro p { margin: 0; }
.agh__btn { justify-self: start; display: inline-flex; align-items: center; min-height: 52px; padding: 0 24px; background: var(--s-text); color: var(--s-bg); font-weight: 700; text-decoration: none; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.agh__btn:hover { background: var(--s-accent); color: var(--s-text); }
.agh__btn:active { transform: translateY(2px); }
@container (min-width: 900px) { .agh__foot { grid-template-columns: 14rem minmax(0, 1fr) auto; align-items: start; } }
@media (prefers-reduced-motion: no-preference) {
  .agh:not([data-motion="off"]) .agh__line { animation: agh-in var(--t-motion-duration, 650ms) var(--t-motion-ease, ease) both; }
  .agh:not([data-motion="off"]) .agh__line:nth-child(2) { animation-delay: var(--t-motion-stagger, 65ms); }
  .agh:not([data-motion="off"]) .agh__line:nth-child(3) { animation-delay: calc(var(--t-motion-stagger, 65ms) * 2); }
  .agh:not([data-motion="off"]) .agh__line:nth-child(4) { animation-delay: calc(var(--t-motion-stagger, 65ms) * 3); }
  .agh:not([data-motion="off"]) .agh__dot { animation: agh-pulse 2.4s ease-in-out 3; }
}
@keyframes agh-in { from { opacity: 0; transform: translateY(calc(0.4em * var(--m-k, 1))); } }
@keyframes agh-pulse { 50% { opacity: 0.25; } }`,
  settings: [
    text("label", "Heading as read aloud", "Fieldwork makes identities, sites and type for cultural clients"),
    richtext("intro", "Intro", "<p>A four person studio in Rotterdam. Identities, websites and typefaces for museums, festivals and the odd brewery.</p>"),
    text("availability", "Availability line", "Booking from September"),
    text("cta_label", "Link", "See the work"),
    url("cta_url", "Link goes to", "#section-work"),
    range("scramble_ms", "Scramble length", 200, 2000, 100, 1100, "ms"),
    ...motion(),
    scheme("site"),
    ...spacing(40, 80),
  ],
  blocks: [{ type: "line", name: "Line", settings: [text("text", "Words", "Identities"), select("style", "Style", "solid", [["solid", "Solid"], ["outline", "Outlined"], ["right", "Pushed right"], ["mark", "Highlighted"]]), { type: "checkbox", id: "scramble", label: "Scramble in", default: false }] }],
  presetBlocks: [
    { type: "line", settings: { text: "Identities,", style: "solid", scramble: false } },
    { type: "line", settings: { text: "websites", style: "right", scramble: true } },
    { type: "line", settings: { text: "and type", style: "outline", scramble: false } },
    { type: "line", settings: { text: "for culture", style: "mark", scramble: false } },
  ],
  maxBlocks: 6,
})

export const marquee = defineSection({
  type: "ai_ag_marquee",
  name: "Running disciplines",
  summary: "Two running lines in opposite directions, one solid and one outlined (P3 marquee); still and wrapped for reduced motion.",
  template: `
<section class="agq" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars("--agq-speed: {{ settings.speed }}s;")}" aria-label="{{ settings.label }}">
  <div class="agq__row" data-storelib-motion="marquee" data-motion-speed="{{ settings.speed }}">
    <ul class="agq__run">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.word }}</li>{% endfor %}</ul>
    <ul class="agq__run" aria-hidden="true">{% for block in section.blocks %}<li>{{ block.settings.word }}</li>{% endfor %}</ul>
  </div>
  <div class="agq__row agq__row--back" aria-hidden="true" data-storelib-motion="marquee" data-motion-speed="{{ settings.speed }}" data-motion-direction="right">
    <ul class="agq__run">{% for block in section.blocks %}<li>{{ block.settings.word }}</li>{% endfor %}</ul>
    <ul class="agq__run">{% for block in section.blocks %}<li>{{ block.settings.word }}</li>{% endfor %}</ul>
  </div>
</section>`,
  style: `
.agq { ${BOX} overflow: hidden; border-block: 2px solid var(--s-text); }
.agq__row { display: flex; width: max-content; }
.agq__run { display: flex; flex: none; margin: 0; padding: 0; list-style: none; }
.agq__run li { ${D} font-size: clamp(2.5rem, 1.4rem + 7cqi, 8rem); line-height: 1; letter-spacing: -0.055em; white-space: nowrap; padding-right: 0.4em; }
.agq__row--back .agq__run li { color: transparent; -webkit-text-stroke: 1.5px var(--s-heading); }
@media (prefers-reduced-motion: reduce) { .agq__row { width: auto; } .agq__run { flex-wrap: wrap; } .agq__run[aria-hidden="true"], .agq__row--back { display: none; } .agq__run li { white-space: normal; } }
@media (prefers-reduced-motion: no-preference) {
  .agq:not([data-motion="off"]) .agq__row { animation: agq-l var(--agq-speed, 40s) linear infinite; }
  .agq:not([data-motion="off"]) .agq__row--back { animation-name: agq-r; }
  .agq[data-motion="off"] .agq__row--back { display: none; }
  .agq:hover .agq__row { animation-play-state: paused; }
}
@keyframes agq-l { to { transform: translateX(-50%); } }
@keyframes agq-r { from { transform: translateX(-50%); } to { transform: translateX(0); } }`,
  settings: [text("label", "What it lists (read aloud)", "What the studio does"), range("speed", "Seconds per loop", 15, 90, 5, 44, "s"), ...motion(), scheme("site"), ...spacing(20, 20)],
  blocks: [{ type: "word", name: "Word", settings: [text("word", "Word", "Identity")] }],
  presetBlocks: ["Identity", "Type design", "Websites", "Exhibitions", "Print"].map((word) => ({ type: "word", settings: { word } })),
  maxBlocks: 8,
})

export const cases = defineSection({
  type: "ai_ag_cases",
  name: "Case studies",
  summary: "Selected work pinned and moving sideways as you scroll (P3 pin-horizontal), each case a big picture, the client, what was made and a link; a swipe row with snap points on phones.",
  template: `
<section class="agc" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="agc__head"><h2 class="agc__h">{{ settings.heading }}</h2><p class="agc__count">{{ section.blocks.size }} {{ settings.count_label }}</p></div>
  <ol class="agc__rail" data-storelib-motion="pin-horizontal" data-motion-distance="{{ section.blocks.size }}" tabindex="0" aria-label="{{ settings.heading }}">
    {% for block in section.blocks %}
      <li class="agc__case" data-block-id="{{ block.id }}">
        <a class="agc__link" href="{{ block.settings.link | url }}">
          <span class="agc__frame" data-storelib-motion="3d-tilt" data-motion-max="4">{% if block.settings.photo %}<img src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="1600" height="1100">{% else %}<span class="agc__type">{{ block.settings.client }}</span>{% endif %}</span>
          <span class="agc__meta"><span class="agc__n">{{ forloop.index }}</span><span class="agc__client">{{ block.settings.client }}</span><span class="agc__what">{{ block.settings.what }}</span><span class="agc__year">{{ block.settings.year }}</span></span>
        </a>
      </li>
    {% endfor %}
  </ol>
</section>`,
  style: `
.agc { ${BOX} overflow: hidden; }
.agc__head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.agc__h { margin: 0; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 5rem); letter-spacing: -0.055em; line-height: 0.9; }
.agc__count { margin: 0; ${SMALL} }
.agc__rail { display: grid; grid-auto-flow: column; grid-auto-columns: 88%; gap: 16px; margin: 0; padding: 0 0 14px; list-style: none; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; }
.agc__case { scroll-snap-align: start; }
.agc__link { display: grid; gap: 12px; color: inherit; text-decoration: none; }
.agc__frame { display: grid; place-items: center; aspect-ratio: 16 / 11; overflow: hidden; background: var(--s-text); color: var(--s-bg); }
.agc__frame img { width: 100%; height: 100%; object-fit: cover; transition: transform calc(var(--t-motion-duration, 650ms) * 1.2) var(--t-motion-ease, ease); }
.agc__type { padding: 16px; ${D} color: var(--s-bg); font-size: clamp(2rem, 1rem + 5cqi, 5rem); letter-spacing: -0.05em; text-align: center; }
.agc__meta { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; gap: 2px 10px; padding-top: 10px; border-top: 2px solid var(--s-text); }
.agc__n { ${SMALL} }
.agc__client { ${D} font-size: 1.5rem; letter-spacing: -0.04em; }
.agc__what { grid-column: 2; ${SMALL} }
.agc__year { grid-column: 3; grid-row: 1; ${SMALL} }
@media (hover: hover) and (pointer: fine) { .agc:not([data-motion="off"]) .agc__link:hover img { transform: scale(var(--t-motion-scale, 1.06)); } .agc__link:hover .agc__client { background: var(--s-accent); } }
@container (min-width: 900px) { .agc__rail { grid-auto-columns: 62%; } }
@media (prefers-reduced-motion: reduce) { .agc__rail { scroll-snap-type: none; } .agc__frame img { transition: none; } }`,
  settings: [text("heading", "Heading", "Selected work"), text("count_label", "After the number", "projects"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "case", name: "Case", settings: [text("client", "Client", "Kunsthal Noord"), text("what", "What was made", "Identity and website"), text("year", "Year", "2026"), image("photo", "Picture"), text("alt", "Picture description", ""), url("link", "Goes to", "/about")] }],
  presetBlocks: [
    { type: "case", settings: { client: "Kunsthal Noord", what: "Identity, signage and website", year: "2026", alt: "Exhibition posters for an art hall on a construction fence", link: "/about" } },
    { type: "case", settings: { client: "Lowlands Film Days", what: "Festival identity and titles", year: "2025", alt: "Festival tote bags and printed programme on a table", link: "/about" } },
    { type: "case", settings: { client: "Brouwerij Kade", what: "Labels and a custom typeface", year: "2025", alt: "A row of beer bottles with bold typographic labels", link: "/about" } },
    { type: "case", settings: { client: "Haven Archive", what: "Digital collection website", year: "2024", alt: "A laptop showing an archive website on a desk with printed proofs", link: "/about" } },
  ],
  maxBlocks: 8,
})

export const index = defineSection({
  type: "ai_ag_index",
  name: "Project index",
  summary: "Every project as a row of the index; the picture follows the pointer over the row (P3 cursor-follow), and sits small beside each row on touch screens.",
  template: `
<section class="agi" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="agi__h">{{ settings.heading }}</h2>
  <ul class="agi__list" data-storelib-motion="cursor-follow" data-motion-target=".agi__pic">
    {% for block in section.blocks %}
      <li class="agi__row" data-block-id="{{ block.id }}">
        <span class="agi__name">{{ block.settings.name }}</span><span class="agi__kind">{{ block.settings.kind }}</span><span class="agi__year">{{ block.settings.year }}</span>
        {% if block.settings.photo %}<img class="agi__pic" src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="640" height="480">{% endif %}
      </li>
    {% endfor %}
  </ul>
</section>`,
  style: `
.agi { ${BOX} }
.agi__h { margin: 0 0 20px; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 5rem); letter-spacing: -0.055em; line-height: 0.9; }
.agi__list { margin: 0; padding: 0; list-style: none; border-top: 2px solid var(--s-text); }
.agi__row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 4rem; gap: 2px 12px; padding: 14px 0; border-bottom: 1px solid var(--s-text); }
.agi__name { ${D} font-size: clamp(1.375rem, 1.1rem + 1.6cqi, 2.5rem); letter-spacing: -0.045em; line-height: 1; }
.agi__kind { grid-column: 1; ${SMALL} }
.agi__year { grid-column: 2; grid-row: 1; justify-self: end; ${SMALL} }
.agi__pic { grid-column: 1 / -1; width: 40%; height: auto; margin-top: 8px; }
@container (min-width: 900px) {
  .agi__row { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 6rem; align-items: baseline; }
  .agi__kind { grid-column: 2; grid-row: 1; }
  .agi__year { grid-column: 3; }
  .agi__pic { position: absolute; z-index: 2; right: 18%; top: 50%; width: 260px; margin: 0; opacity: 0; transform: translateY(-50%) rotate(-3deg) scale(0.9); pointer-events: none; transition: opacity var(--t-motion-hover, 200ms) ease, transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
}
@media (hover: hover) and (pointer: fine) { .agi__row:hover { background: var(--s-accent); } .agi__row:hover .agi__pic { opacity: 1; transform: translateY(-50%) rotate(-3deg); } }
@media (prefers-reduced-motion: reduce) { .agi__pic { transition: none; } }`,
  settings: [text("heading", "Heading", "Index"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "project", name: "Project", settings: [text("name", "Project", "Haven Archive"), text("kind", "Kind", "Website"), text("year", "Year", "2024"), image("photo", "Picture"), text("alt", "Picture description", "")] }],
  presetBlocks: [
    { type: "project", settings: { name: "Kunsthal Noord", kind: "Identity, signage", year: "2026", alt: "Art hall signage in black and yellow" } },
    { type: "project", settings: { name: "Grotesk Kade", kind: "Typeface", year: "2025", alt: "Specimen sheet of a heavy grotesk typeface" } },
    { type: "project", settings: { name: "Lowlands Film Days", kind: "Festival identity", year: "2025", alt: "Festival badges on lanyards" } },
    { type: "project", settings: { name: "Haven Archive", kind: "Website", year: "2024", alt: "An archive website on a phone" } },
    { type: "project", settings: { name: "Stadsdrukkerij", kind: "Book design", year: "2023", alt: "Open book spread with large typography" } },
  ],
  maxBlocks: 30,
})

export const services = defineSection({
  type: "ai_ag_services",
  name: "Disciplines",
  summary: "What the studio does, one discipline per row set huge, each opening to what it includes.",
  template: `
<section class="ags" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="ags__h">{{ settings.heading }}</h2>
  <div class="ags__list">
    {% for block in section.blocks %}
      <details class="ags__item" data-block-id="{{ block.id }}"><summary class="ags__name"><span class="ags__n">{{ forloop.index }}</span>{{ block.settings.name }}</summary><div class="ags__body"><p>{{ block.settings.text }}</p><p class="ags__inc">{{ block.settings.includes }}</p></div></details>
    {% endfor %}
  </div>
</section>`,
  style: `
.ags { ${BOX} }
.ags__h { margin: 0 0 20px; ${SMALL} font-weight: 400; }
.ags__list { border-top: 2px solid var(--s-text); }
.ags__item { border-bottom: 2px solid var(--s-text); }
.ags__name { display: flex; align-items: baseline; gap: 14px; min-height: 64px; padding: 10px 0; cursor: pointer; list-style: none; ${D} font-size: clamp(2.25rem, 1rem + 7cqi, 7.5rem); letter-spacing: -0.06em; line-height: 0.9; }
.ags__name::-webkit-details-marker { display: none; }
.ags__n { ${SMALL} font-weight: 400; letter-spacing: 0; }
.ags__item[open] .ags__name { background: var(--s-accent); }
.ags__body { display: grid; gap: 10px; max-width: 60ch; padding: 6px 0 22px; line-height: 1.55; }
.ags__body p { margin: 0; }
.ags__inc { ${SMALL} }
@container (min-width: 900px) { .ags__body { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); max-width: none; padding-left: 2.5rem; } }`,
  settings: [text("heading", "Small heading", "What we do"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "discipline", name: "Discipline", settings: [text("name", "Discipline", "Identity"), textarea("text", "What it is", ""), text("includes", "What it includes", "")] }],
  presetBlocks: [
    { type: "discipline", settings: { name: "Identity", text: "A name's whole visual system, from the logo to the way a ticket prints at the door.", includes: "Logo, type, colour, templates, guidelines" } },
    { type: "discipline", settings: { name: "Websites", text: "Sites we design and build ourselves, fast, accessible and easy for your team to edit.", includes: "Design, build, content model, training" } },
    { type: "discipline", settings: { name: "Typefaces", text: "Custom and retail type, from one display weight to a full family with italics.", includes: "Drawing, spacing, mastering, licences" } },
    { type: "discipline", settings: { name: "Exhibitions", text: "Wall text, wayfinding and printed matter for shows that change every season.", includes: "Graphics, signage, catalogues" } },
  ],
  maxBlocks: 8,
})

export const process = defineSection({
  type: "ai_ag_process",
  name: "How a project runs",
  summary: "The steps of a project with giant numbers that rise in one after another (P3 reveal-stagger).",
  template: `
<section class="agp" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="agp__h">{{ settings.heading }}</h2>
  <ol class="agp__list" data-storelib-motion="reveal-stagger">
    {% for block in section.blocks %}<li class="agp__step" data-block-id="{{ block.id }}"><span class="agp__n">{{ forloop.index }}</span><h3 class="agp__title">{{ block.settings.title }}</h3><p class="agp__text">{{ block.settings.text }}</p><p class="agp__time">{{ block.settings.time }}</p></li>{% endfor %}
  </ol>
</section>`,
  style: `
.agp { ${BOX} }
.agp__h { margin: 0 0 28px; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 5rem); letter-spacing: -0.055em; line-height: 0.9; }
.agp__list { display: grid; gap: 28px; margin: 0; padding: 0; list-style: none; }
.agp__step { display: grid; gap: 8px; padding-top: 12px; border-top: 2px solid var(--s-text); }
.agp__n { ${D} font-size: clamp(4rem, 2rem + 10cqi, 9rem); line-height: 0.8; letter-spacing: -0.07em; color: transparent; -webkit-text-stroke: 2px var(--s-heading); }
.agp__title { margin: 0; ${D} font-size: 1.5rem; letter-spacing: -0.04em; }
.agp__text { margin: 0; line-height: 1.55; }
.agp__time { margin: 0; ${SMALL} }
@container (min-width: 900px) { .agp__list { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; } }
${revealCss("agp", ".agp__step", "agp-rise")}`,
  settings: [text("heading", "Heading", "How a project runs"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "step", name: "Step", settings: [text("title", "Step", "Listen"), textarea("text", "What happens", ""), text("time", "How long", "Two weeks")] }],
  presetBlocks: [
    { type: "step", settings: { title: "Listen", text: "Two workshops with the people who will live with the work, not only the people who sign it off.", time: "Two weeks" } },
    { type: "step", settings: { title: "Draw", text: "Three directions, shown on real things: a poster, a ticket, a homepage.", time: "Three weeks" } },
    { type: "step", settings: { title: "Make", text: "One direction, built out fully, tested in the building and on phones.", time: "Six to ten weeks" } },
    { type: "step", settings: { title: "Hand over", text: "Files, templates and a morning of training so your team can keep going.", time: "One week" } },
  ],
  maxBlocks: 6,
})

export const manifesto = defineSection({
  type: "ai_ag_manifesto",
  name: "Statement",
  summary: "One opinion set very large on the signal colour, its key word resolving from scrambled letters (P3 text-scramble).",
  template: `
<section class="agm" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <p class="agm__line">{{ settings.before }} <span class="agm__key" data-storelib-motion="text-scramble" data-motion-duration="{{ settings.scramble_ms }}">{{ settings.key }}</span> {{ settings.after }}</p>
  <ul class="agm__sig">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.line }}</li>{% endfor %}</ul>
</section>`,
  style: `
.agm { ${BOX} background: var(--s-accent); color: var(--s-text); }
.agm__line { margin: 0; ${D} font-size: clamp(2.25rem, 1rem + 6cqi, 7rem); line-height: 0.95; letter-spacing: -0.055em; max-width: 18ch; }
.agm__key { text-decoration: underline; text-decoration-thickness: 0.08em; text-underline-offset: 0.08em; }
.agm__sig { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 32px 0 0; padding: 0; list-style: none; ${SMALL} }
${revealCss("agm", ".agm__line", "agm-rise")}`,
  settings: [
    text("before", "Words before", "Good design is mostly"),
    text("key", "The word that scrambles", "listening,"),
    text("after", "Words after", "the rest is kerning."),
    range("scramble_ms", "Scramble length", 200, 2000, 100, 900, "ms"),
    ...motion(),
    scheme("site"),
    ...spacing(120, 120),
  ],
  blocks: [{ type: "line", name: "Signature line", settings: [text("line", "Line", "Fieldwork, since 2017")] }],
  presetBlocks: [{ type: "line", settings: { line: "Fieldwork, Rotterdam" } }, { type: "line", settings: { line: "Four people, one project at a time" } }],
  maxBlocks: 3,
})

export const editions = defineSection({
  type: "ai_ag_editions",
  name: "Editions",
  summary: "What the studio sells, from the store's real products (prints, type licences, books): picture, name, price, add to bag.",
  template: `
<section class="age" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="age__head"><h2 class="age__h">{{ settings.heading }}</h2><a class="age__all" href="{{ settings.all_url | url }}">{{ settings.all_label }}</a></div>
  <ul class="age__list">
    {% if settings.products.size > 0 %}
      {% for product in settings.products limit: 4 %}<li class="age__item"><a class="age__link" href="{{ product.settings.url | url }}">{% if product.settings.image %}<img src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="900" height="1100">{% endif %}<span class="age__name">{{ product.settings.title }}</span><span class="age__price">{{ product.settings.price }}</span></a><button class="age__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button></li>{% endfor %}
    {% else %}
      {% for product in products limit: 4 %}<li class="age__item"><a class="age__link" href="{{ product.settings.url | url }}">{% if product.settings.image %}<img src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="900" height="1100">{% endif %}<span class="age__name">{{ product.settings.title }}</span><span class="age__price">{{ product.settings.price }}</span></a><button class="age__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button></li>{% endfor %}
    {% endif %}
  </ul>
  <ul class="age__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.note }}</li>{% endfor %}</ul>
</section>`,
  style: `
.age { ${BOX} }
.age__head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 24px; }
.age__h { margin: 0; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 5rem); letter-spacing: -0.055em; line-height: 0.9; }
.age__all { display: inline-flex; min-height: 44px; align-items: center; color: inherit; font-weight: 700; }
.age__list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 12px; margin: 0; padding: 0; list-style: none; }
.age__link { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; color: inherit; text-decoration: none; }
.age__link img { grid-column: 1 / -1; width: 100%; height: auto; aspect-ratio: 9 / 11; object-fit: cover; border: 2px solid var(--s-text); }
.age__name { font-weight: 700; }
.age__price { ${SMALL} }
.age__add { margin-top: 8px; min-height: 44px; padding: 0 14px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
.age__add:hover { background: var(--s-accent); }
.age__notes { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 32px 0 0; padding: 14px 0 0; border-top: 2px solid var(--s-text); list-style: none; ${SMALL} }
@container (min-width: 900px) { .age__list { grid-template-columns: repeat(4, minmax(0, 1fr)); } }`,
  settings: [text("heading", "Heading", "Editions"), productList(), text("add_label", "Add button", "Add to bag"), text("all_label", "Link to all", "All editions"), url("all_url", "Link goes to", "/products"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Printed in Rotterdam")] }],
  presetBlocks: ["Risograph printed in Rotterdam", "Signed and numbered", "Type licences by email the same day"].map((note) => ({ type: "note", settings: { note } })),
  maxBlocks: 4,
})

export const studio = defineSection({
  type: "ai_ag_studio",
  name: "Studio pictures",
  summary: "Pictures from the studio at off sizes, each tilting toward the pointer (P3 3d-tilt), with a caption per picture.",
  template: `
<section class="agt" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="agt__h">{{ settings.heading }}</h2>
  <div class="agt__grid">
    {% for block in section.blocks %}<figure class="agt__fig agt__fig--{{ forloop.index }}" data-block-id="{{ block.id }}" data-storelib-motion="3d-tilt" data-motion-max="6">{% if block.settings.photo %}<img src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="1200" height="900">{% endif %}<figcaption>{{ block.settings.caption }}</figcaption></figure>{% endfor %}
  </div>
</section>`,
  style: `
.agt { ${BOX} }
.agt__h { margin: 0 0 24px; ${D} font-size: clamp(2.25rem, 1.4rem + 4cqi, 5rem); letter-spacing: -0.055em; line-height: 0.9; }
.agt__grid { display: grid; gap: 14px; }
.agt__fig { margin: 0; }
.agt__fig img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; }
.agt__fig figcaption { margin-top: 6px; ${SMALL} }
@container (min-width: 900px) {
  .agt__grid { grid-template-columns: repeat(12, minmax(0, 1fr)); align-items: start; }
  .agt__fig--1 { grid-column: 1 / span 7; }
  .agt__fig--2 { grid-column: 9 / span 4; margin-top: 120px; }
  .agt__fig--3 { grid-column: 3 / span 4; }
  .agt__fig--4 { grid-column: 7 / span 6; margin-top: 60px; }
  .agt__fig--2 img, .agt__fig--3 img { aspect-ratio: 3 / 4; }
}`,
  settings: [text("heading", "Heading", "In the studio"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "photo", name: "Picture", settings: [image("photo", "Picture"), text("alt", "Picture description", ""), text("caption", "Caption", "")] }],
  presetBlocks: [
    { type: "photo", settings: { caption: "Proofs on the wall, Tuesday", alt: "Printed poster proofs pinned on a studio wall" } },
    { type: "photo", settings: { caption: "The riso", alt: "A risograph printer with ink drums on a bench" } },
    { type: "photo", settings: { caption: "Spacing a lowercase g", alt: "A designer's screen showing a typeface glyph being edited" } },
    { type: "photo", settings: { caption: "Friday crit", alt: "Four people around a table covered in printed work" } },
  ],
  maxBlocks: 4,
})

export const hello = defineSection({
  type: "ai_ag_hello",
  name: "Say hello",
  summary: "The last ask: the studio's email set across the width as the link, and two or three plain lines about how to start.",
  template: `
<section class="agz" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="agz__h">{{ settings.heading }}</h2>
  <a class="agz__mail" href="{{ settings.link | url }}">{{ settings.link_label }}</a>
  <ul class="agz__lines">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.line }}</li>{% endfor %}</ul>
</section>`,
  style: `
.agz { ${BOX} overflow: hidden; }
.agz__h { margin: 0; ${SMALL} font-weight: 400; }
.agz__mail { display: block; margin: 10px 0 28px; ${D} font-size: clamp(2rem, 0.8rem + 8.6cqi, 10rem); letter-spacing: -0.06em; line-height: 0.95; color: inherit; text-decoration: none; overflow-wrap: anywhere; }
.agz__mail:hover { background: var(--s-accent); }
.agz__lines { display: grid; gap: 6px; margin: 0; padding: 14px 0 0; border-top: 2px solid var(--s-text); list-style: none; }
@container (min-width: 900px) { .agz__lines { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
${revealCss("agz", ".agz__mail", "agz-rise")}`,
  settings: [
    text("heading", "Small heading", "Start a project"),
    text("link_label", "Shown as", "hello@fieldwork.studio"),
    url("link", "Goes to", "mailto:hello@fieldwork.studio"),
    ...motion(),
    scheme("site"),
    ...spacing(120, 120),
  ],
  blocks: [{ type: "line", name: "Line", settings: [text("line", "Line", "Tell us the deadline first")] }],
  presetBlocks: ["Tell us the deadline first", "Budgets from 15k for an identity", "We answer every email within two days"].map((line) => ({ type: "line", settings: { line } })),
  maxBlocks: 3,
})

export const footer = defineSection({
  type: "ai_ag_footer",
  name: "Footer",
  kind: "footer",
  summary: "Big wordmark footer: the studio's name across the width, the menu in a line, newsletter, language and currency.",
  template: `
<footer class="ago" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <p class="ago__mark" aria-hidden="true">{{ settings.wordmark | default: shop.name }}</p>
  <div class="ago__grid">
    <nav class="ago__nav" aria-label="{{ settings.nav_label }}">{% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}</nav>
    <form class="ago__form" data-storelib-form="subscribe"><label for="ago-e-{{ section.id }}">{{ settings.newsletter_label }}</label><div class="ago__row"><input id="ago-e-{{ section.id }}" type="email" name="email" autocomplete="email" required placeholder="{{ settings.email_placeholder }}"><button type="submit">{{ settings.button_label }}</button></div></form>
    ${prefs("ago")}
    <p class="ago__small">{{ settings.small_print }}</p>
  </div>
</footer>`,
  style: `
.ago { padding: 40px var(--theme-padding-x, 20px) 24px; background: var(--s-text); color: var(--s-bg); container-type: inline-size; overflow: hidden; }
.ago__mark { margin: 0 0 32px; font-family: var(--theme-font-heading), sans-serif; font-weight: 800; font-size: 19cqi; line-height: 0.8; letter-spacing: -0.07em; white-space: nowrap; overflow: hidden; }
.ago__grid { display: grid; gap: 24px; padding-top: 16px; border-top: 2px solid currentColor; }
.ago__nav { display: flex; flex-wrap: wrap; gap: 0 20px; }
.ago__nav a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; font-weight: 700; text-decoration: none; }
.ago__nav a:hover { text-decoration: underline; }
.ago__form label { display: block; margin-bottom: 8px; }
.ago__row { display: flex; border-bottom: 2px solid currentColor; }
.ago__row input { flex: 1; min-width: 0; min-height: 48px; border: 0; background: none; color: inherit; font: inherit; }
.ago__row button { min-height: 48px; padding: 0 0 0 14px; border: 0; background: none; color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
.ago__small { margin: 0; font-size: 0.8125rem; }
${panelCss("ago")}
.ago-pref__opt { border-color: currentColor; }
.ago-pref__opt[aria-current="true"] { background: var(--s-bg); color: var(--s-text); }
@container (min-width: 900px) { .ago__grid { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr); align-items: start; } .ago__small { grid-column: 1 / -1; } }`,
  settings: [
    menu("menu", "Footer menu", "footer"),
    text("wordmark", "Big name (empty uses the shop name)", "Fieldwork"),
    text("newsletter_label", "Newsletter line", "A letter when we finish something, about four a year"),
    text("email_placeholder", "Email hint", "Email"),
    text("button_label", "Subscribe button", "Sign up"),
    text("small_print", "Small print", "Fieldwork studio, Rotterdam. Chamber of Commerce 70119322."),
    text("nav_label", "Menu name (read aloud)", "Footer"),
    text("language_label", "Language", "Language"),
    text("currency_label", "Currency", "Currency"),
    scheme("site"),
  ],
})

export const product = defineSection({
  type: "ai_ag_product",
  name: "Edition",
  summary: "One edition: big pictures with a hard frame, the name set large, price, options as add to bag buttons, offers, description and the edition's notes.",
  template: `
<section class="agpd" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="agpd__grid">
    <div class="agpd__media">{% for img in product.images limit: 4 %}<img src="{{ img }}" alt="{{ product.title }}" width="1200" height="1200">{% endfor %}</div>
    <div class="agpd__info">
      <h1 class="agpd__title">{{ product.title }}</h1>
      <p class="agpd__price">{{ product.price }}{% if product.compare_price %} <s>{{ product.compare_price }}</s>{% endif %}</p>
      {% if page.product.settings.variants.size > 0 %}<div class="agpd__opts" role="group" aria-label="{{ settings.options_label }}">{% for v in page.product.settings.variants %}<button class="agpd__opt" type="button" data-storelib-add-to-cart="{{ product.id }}" data-variant-id="{{ v.id }}" data-title="{{ product.title }}" data-price="{{ v.price }}">{{ v.name }} {{ v.price }}</button>{% endfor %}</div>{% else %}<button class="agpd__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.title }}" data-price="{{ product.price }}" data-url="{{ product.url }}">{{ settings.add_label }}</button>{% endif %}
      <div data-storelib-island data-storelib-offers="{{ product.id }}" data-title="{{ product.title }}" data-url="{{ product.url }}" data-layout="open"></div>
      {% if product.description_html %}<div class="agpd__desc">{{ product.description_html | raw }}</div>{% endif %}
      <dl class="agpd__notes">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}</dl>
    </div>
  </div>
</section>`,
  style: `
.agpd { ${BOX} }
.agpd__grid { display: grid; gap: 28px; }
.agpd__media { display: grid; gap: 12px; }
.agpd__media img { width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; border: 2px solid var(--s-text); }
.agpd__title { margin: 0; ${D} font-size: clamp(2.5rem, 1.4rem + 5cqi, 6rem); letter-spacing: -0.06em; line-height: 0.88; }
.agpd__price { margin: 14px 0 20px; font-size: 1.25rem; font-weight: 700; }
.agpd__opts { display: flex; flex-wrap: wrap; gap: 8px; }
.agpd__opt, .agpd__add { min-height: 52px; padding: 0 20px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
.agpd__add { background: var(--s-text); color: var(--s-bg); }
.agpd__opt:hover, .agpd__add:hover { background: var(--s-accent); color: var(--s-text); }
.agpd__desc { margin-top: 22px; line-height: 1.6; max-width: 56ch; }
.agpd__notes { margin: 24px 0 0; border-top: 2px solid var(--s-text); }
.agpd__notes div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--s-text); }
.agpd__notes dd { margin: 0; }
@container (min-width: 900px) { .agpd__grid { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); align-items: start; } .agpd__info { position: sticky; top: 80px; } }`,
  settings: [text("add_label", "Add button", "Add to bag"), text("options_label", "Options (read aloud)", "Choose an option"), ...motion(), scheme("site"), ...spacing(40, 96)],
  blocks: [{ type: "note", name: "Note", settings: [text("label", "Label", "Printed"), text("value", "Value", "Risograph, two colours")] }],
  presetBlocks: [
    { type: "note", settings: { label: "Printed", value: "Risograph, two colours" } },
    { type: "note", settings: { label: "Paper", value: "Munken Pure 150g" } },
    { type: "note", settings: { label: "Ships", value: "Rolled, within three days" } },
  ],
  maxBlocks: 6,
})

export const collection = defineSection({
  type: "ai_ag_collection",
  name: "Collection",
  summary: "A collection's real products as a hard edged grid with the collection's name set huge.",
  template: `
<section class="agl" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h1 class="agl__h">{% if collection.title %}{{ collection.title }}{% else %}{{ settings.heading }}{% endif %}</h1>
  {% if collection.description %}<p class="agl__intro">{{ collection.description }}</p>{% endif %}
  {% if page.query %}<p class="agl__intro">{{ settings.query_label }} {{ page.query }}</p>{% endif %}
  <ul class="agl__list">
    {% for product in products %}<li class="agl__item"><a class="agl__link" href="{{ product.settings.url | url }}">{% if product.settings.image %}<img src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="900" height="1100">{% endif %}<span class="agl__name">{{ product.settings.title }}</span><span class="agl__price">{{ product.settings.price }}</span></a><button class="agl__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button></li>{% endfor %}
  </ul>
  <ul class="agl__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.note }}</li>{% endfor %}</ul>
</section>`,
  style: `
.agl { ${BOX} }
.agl__h { margin: 0; ${D} font-size: clamp(3rem, 1rem + 11cqi, 12rem); letter-spacing: -0.07em; line-height: 0.84; overflow-wrap: anywhere; }
.agl__intro { max-width: 52ch; margin: 18px 0 0; line-height: 1.55; }
.agl__list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 12px; margin: 36px 0 0; padding: 0; list-style: none; }
.agl__link { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; color: inherit; text-decoration: none; }
.agl__link img { grid-column: 1 / -1; width: 100%; height: auto; aspect-ratio: 9 / 11; object-fit: cover; border: 2px solid var(--s-text); }
.agl__name { font-weight: 700; }
.agl__price { ${SMALL} }
.agl__add { margin-top: 8px; min-height: 44px; padding: 0 14px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
.agl__notes { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 36px 0 0; padding: 14px 0 0; border-top: 2px solid var(--s-text); list-style: none; ${SMALL} }
@container (min-width: 900px) { .agl__list { grid-template-columns: repeat(4, minmax(0, 1fr)); } }`,
  settings: [text("heading", "Heading when there is no collection", "Editions"), text("query_label", "Before the search words", "Results for"), text("add_label", "Add button", "Add to bag"), ...motion(), scheme("site"), ...spacing(40, 96)],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Ships from Rotterdam")] }],
  presetBlocks: ["Ships from Rotterdam in three days", "Returns within 30 days"].map((note) => ({ type: "note", settings: { note } })),
  maxBlocks: 4,
})

export const about = defineSection({
  type: "ai_ag_about",
  name: "The studio",
  summary: "About the studio: a big opening line, the story, a wide picture, and the things the studio believes, numbered.",
  template: `
<section class="aga" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h1 class="aga__h">{{ settings.heading }}</h1>
  <div class="aga__grid">
    <div class="aga__story">{{ settings.story | raw }}</div>
    {% if settings.photo %}<img class="aga__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1600" height="1000" data-storelib-motion="parallax-depth" data-motion-depth="0.1">{% endif %}
  </div>
  <ol class="aga__list">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><h2 class="aga__t">{{ block.settings.title }}</h2><p>{{ block.settings.text }}</p></li>{% endfor %}</ol>
</section>`,
  style: `
.aga { ${BOX} }
.aga__h { margin: 0 0 36px; ${D} font-size: clamp(2.75rem, 1rem + 9cqi, 10rem); letter-spacing: -0.065em; line-height: 0.86; max-width: 12ch; }
.aga__grid { display: grid; gap: 28px; }
.aga__story { max-width: 52ch; font-size: 1.125rem; line-height: 1.6; }
.aga__img { width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; }
.aga__list { display: grid; margin: 56px 0 0; padding: 0; list-style: none; counter-reset: aga; border-top: 2px solid var(--s-text); }
.aga__list li { counter-increment: aga; display: grid; gap: 6px; padding: 18px 0; border-bottom: 1px solid var(--s-text); }
.aga__list li::before { content: counter(aga); ${SMALL} }
.aga__t { margin: 0; ${D} font-size: clamp(1.5rem, 1.1rem + 1.6cqi, 2.5rem); letter-spacing: -0.045em; }
.aga__list p { margin: 0; max-width: 56ch; line-height: 1.55; }
@container (min-width: 900px) { .aga__grid { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); align-items: start; } .aga__list li { grid-template-columns: 3rem minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: baseline; } }
${revealCss("aga", ".aga__list li", "aga-rise")}`,
  settings: [
    text("heading", "Heading", "Four people, one table"),
    richtext("story", "Story", "<p>Fieldwork started in 2017 above a printer in Rotterdam. We still share the building, and most of our work still ends up on paper somewhere.</p><p>We take one large project at a time so the people who pitched it are the people who make it.</p>"),
    image("photo", "Picture"),
    text("photo_alt", "Picture description", "The studio's long table under a window, covered in printed proofs"),
    ...motion(),
    scheme("site"),
    ...spacing(40, 96),
  ],
  blocks: [{ type: "belief", name: "Belief", settings: [text("title", "Belief", "Make it on paper first"), textarea("text", "What it means", "")] }],
  presetBlocks: [
    { type: "belief", settings: { title: "Make it on paper first", text: "If an identity only works on a screen, it does not work yet." } },
    { type: "belief", settings: { title: "The people who pitch, make", text: "No hand-offs to juniors after the meeting. You work with us." } },
    { type: "belief", settings: { title: "Leave the files tidy", text: "Your team should be able to carry on without calling us." } },
  ],
  maxBlocks: 6,
})

export const contact = defineSection({
  type: "ai_ag_contact",
  name: "Contact",
  summary: "Contact page: a project form with a budget field beside the studio's address and email.",
  template: `
<section class="agx" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h1 class="agx__h">{{ settings.heading }}</h1>
  <div class="agx__grid">
    <dl class="agx__ways">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{% if block.settings.link %}<a href="{{ block.settings.link | url }}">{{ block.settings.value }}</a>{% else %}{{ block.settings.value }}{% endif %}</dd></div>{% endfor %}</dl>
    <form class="agx__form" data-storelib-form="contact">
      <label><span>{{ settings.name_label }}</span><input name="name" type="text" autocomplete="name" maxlength="120" required></label>
      <label><span>{{ settings.email_label }}</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <label><span>{{ settings.budget_label }}</span><input name="subject" type="text" maxlength="150"></label>
      <label><span>{{ settings.message_label }}</span><textarea name="message" rows="6" maxlength="5000" required></textarea></label>
      <button type="submit">{{ settings.send_label }}</button>
    </form>
  </div>
</section>`,
  style: `
.agx { ${BOX} }
.agx__h { margin: 0 0 36px; ${D} font-size: clamp(2.75rem, 1rem + 9cqi, 10rem); letter-spacing: -0.065em; line-height: 0.86; }
.agx__grid { display: grid; gap: 36px; }
.agx__ways { margin: 0; border-top: 2px solid var(--s-text); }
.agx__ways div { display: grid; gap: 2px; padding: 12px 0; border-bottom: 1px solid var(--s-text); }
.agx__ways dt { ${SMALL} }
.agx__ways dd { margin: 0; font-weight: 700; }
.agx__ways a { color: inherit; }
.agx__form { display: grid; gap: 14px; }
.agx__form label { display: grid; gap: 6px; ${SMALL} }
.agx__form input, .agx__form textarea { min-height: 50px; padding: 10px 12px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; font-size: 1rem; }
.agx__form input:focus, .agx__form textarea:focus { outline: none; background: var(--s-accent); }
.agx__form button { justify-self: start; min-height: 54px; padding: 0 28px; border: 0; background: var(--s-text); color: var(--s-bg); font: inherit; font-weight: 700; cursor: pointer; }
@container (min-width: 900px) { .agx__grid { grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr); } }`,
  settings: [
    text("heading", "Heading", "Tell us about it"),
    text("name_label", "Name field", "Name"),
    text("email_label", "Email field", "Email"),
    text("budget_label", "Budget field", "Budget and deadline"),
    text("message_label", "Message field", "The project"),
    text("send_label", "Send button", "Send"),
    ...motion(),
    scheme("site"),
    ...spacing(40, 96),
  ],
  blocks: [{ type: "way", name: "Detail", settings: [text("label", "Label", "Email"), text("value", "Shown as", "hello@fieldwork.studio"), url("link", "Link", "mailto:hello@fieldwork.studio")] }],
  presetBlocks: [
    { type: "way", settings: { label: "Email", value: "hello@fieldwork.studio", link: "mailto:hello@fieldwork.studio" } },
    { type: "way", settings: { label: "Studio", value: "Van Vollenhovenstraat 15, Rotterdam", link: "https://maps.google.com/?q=Van+Vollenhovenstraat+15+Rotterdam" } },
    { type: "way", settings: { label: "Hours", value: "Monday to Thursday, 9 to 6", link: "" } },
  ],
  maxBlocks: 6,
})

export const ALL = [header, hero, marquee, cases, index, services, process, manifesto, editions, studio, hello, footer, product, collection, about, contact]
