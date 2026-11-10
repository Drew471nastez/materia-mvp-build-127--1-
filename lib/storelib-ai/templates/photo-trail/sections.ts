/**
 * TEMPLATE k, "Vera Hollis": a photographer's or artist's portfolio. The
 * pictures lead: the opening is the name with the work trailing behind the
 * pointer (P3 image-trail; a still scattered collage without it), a full
 * bleed series, a gallery whose pictures open large in place, a series
 * index, a sideways film strip and prints from the real shop. White wall,
 * black type, one red used once or twice like a gallery dot.
 */
import {
  BOX, cartPanel, chromeVars, chromeWords, defineSection, image, menu, motion, panelCss, prefs, productList, range, revealCss, richtext, scheme, searchPanel, select, spacing, text, textarea, url, vars,
} from "../kit-b"

const D = "font-family: var(--theme-font-heading), sans-serif; color: var(--s-heading); font-weight: 500;"
const SMALL = "font-size: 0.8125rem; letter-spacing: 0.01em;"

export const header = defineSection({
  type: "ai_pf_header",
  name: "Header",
  kind: "header",
  summary: "Quiet header: the name, the menu inline on wide screens, search and cart; on phones Menu drops a top sheet with the whole menu, language and currency.",
  template: `
<header class="pfn" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <div class="pfn__bar">
    <a class="pfn__logo" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" width="{{ settings.logo_width }}" height="28">{% else %}{{ shop.name | default: settings.brand }}{% endif %}</a>
    <nav class="pfn__nav" aria-label="{{ settings.nav_label }}">{% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}</nav>
    <div class="pfn__tools">
      <button class="pfn__tool" type="button" popovertarget="pfn-p-{{ section.id }}">{{ settings.region_label }}</button>
      <button class="pfn__tool" type="button" data-storelib-search>{{ settings.search_label }}</button>
      <button class="pfn__tool" type="button" data-storelib-cart>{{ settings.cart_label }} <span class="pfn__count" data-storelib-cart-count></span></button>
      <button class="pfn__tool pfn__burger" type="button" popovertarget="pfn-d-{{ section.id }}">{{ settings.menu_label }}</button>
    </div>
  </div>
  <div class="pfn__drop" id="pfn-p-{{ section.id }}" popover>${prefs("pfn")}</div>
  <div class="pfn__sheet" id="pfn-d-{{ section.id }}" popover>
    <button class="pfn-x" type="button" popovertarget="pfn-d-{{ section.id }}" popovertargetaction="hide">{{ settings.close_label }}</button>
    <nav aria-label="{{ settings.nav_label }}"><ul class="pfn__list">{% for link in settings.menu.links %}<li><a class="pfn__link" href="{{ link.url }}">{{ link.title }}</a>{% if link.links.size > 0 %}<ul class="pfn__sub">{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>{% endif %}</li>{% endfor %}</ul></nav>
    <a class="pfn__acct" href="{{ routes.account_url }}">{{ settings.account_label }}</a>
    ${prefs("pfn")}
  </div>
  ${searchPanel("pfn")}
  ${cartPanel("pfn")}
</header>`,
  style: `
.pfn { position: relative; z-index: 30; background: var(--s-bg); color: var(--s-text); }
.pfn__bar { display: flex; align-items: center; gap: 20px; min-height: 64px; padding: 0 var(--theme-padding-x, 20px); }
.pfn__logo { margin-right: auto; ${D} font-size: 1.0625rem; letter-spacing: -0.01em; text-decoration: none; }
.pfn__logo img { display: block; max-height: 28px; width: auto; height: auto; }
.pfn__nav { display: none; gap: 22px; }
.pfn__nav a, .pfn__tool { display: inline-flex; align-items: center; min-height: 44px; padding: 0; border: 0; background: none; color: inherit; font: inherit; ${SMALL} text-decoration: none; cursor: pointer; }
.pfn__nav a:hover, .pfn__tool:hover { text-decoration: underline; text-underline-offset: 5px; }
.pfn__tools { display: flex; gap: 16px; }
.pfn__tools .pfn__tool:first-child { display: none; }
.pfn__count:empty, .pfn__count[data-count="0"] { display: none; }
.pfn__count::before { content: "("; }
.pfn__count::after { content: ")"; }
.pfn__drop { inset: 64px var(--theme-padding-x, 20px) auto auto; width: min(320px, calc(100% - 32px)); margin: 0; padding: 16px; border: 1px solid var(--s-border); background: var(--s-bg); color: var(--s-text); }
.pfn__sheet { inset: 0 0 auto 0; width: 100%; max-width: none; margin: 0; padding: 18px var(--theme-padding-x, 20px) 28px; border: 0; border-bottom: 1px solid var(--s-border); background: var(--s-bg); color: var(--s-text); }
.pfn__list { margin: 20px 0; padding: 0; list-style: none; }
.pfn__link { display: block; padding: 6px 0; ${D} font-size: clamp(2rem, 1.4rem + 4vw, 3rem); letter-spacing: -0.03em; text-decoration: none; }
.pfn__sub { margin: 0 0 10px; padding: 0; list-style: none; }
.pfn__sub a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; }
.pfn__acct { display: inline-flex; min-height: 44px; align-items: center; margin-bottom: 12px; color: inherit; }
.pfn :focus-visible { outline: 1px solid var(--s-text); outline-offset: 3px; }
${panelCss("pfn", { cartFrom: "right", searchFrom: "full" })}
@media (min-width: 900px) { .pfn__nav { display: flex; } .pfn__burger { display: none; } .pfn__tools .pfn__tool:first-child { display: inline-flex; } }
@media (prefers-reduced-motion: no-preference) {
  .pfn__sheet { transition: transform var(--t-motion-duration, 650ms) var(--t-motion-ease, ease), display var(--t-motion-duration, 650ms) allow-discrete, overlay var(--t-motion-duration, 650ms) allow-discrete; transform: translateY(-100%); }
  .pfn__sheet:popover-open { transform: none; }
  @starting-style { .pfn__sheet:popover-open { transform: translateY(-100%); } }
}`,
  settings: [
    menu(),
    text("brand", "Name when there is no logo", "Vera Hollis"),
    range("logo_width", "Logo width", 60, 220, 4, 120, "px"),
    text("region_label", "Language and currency button", "Region"),
    text("account_label", "Account link", "Orders"),
    ...chromeWords({ search_placeholder: "Search series and prints" }),
    scheme("site"),
  ],
})

export const trail = defineSection({
  type: "ai_pf_trail",
  name: "Name with image trail",
  summary: "The opening: the name set large in the middle, and the work trailing behind the pointer as it moves (P3 image-trail). Without the island, or on phones, the same pictures sit scattered around the name, still.",
  template: `
<section class="pft" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="pft__stage" data-storelib-motion="image-trail" data-motion-items=".pft__pic" data-motion-spacing="{{ settings.trail_spacing }}" data-motion-life="{{ settings.trail_life }}">
    <h1 class="pft__h">{{ settings.heading | default: shop.name }}</h1>
    <p class="pft__line">{{ settings.line }}</p>
    {% for block in section.blocks %}{% if block.settings.photo %}<img class="pft__pic pft__pic--{{ forloop.index }}" src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="800" height="1000" data-block-id="{{ block.id }}">{% endif %}{% endfor %}
  </div>
  <p class="pft__hint">{{ settings.hint }}</p>
</section>`,
  style: `
.pft { ${BOX} overflow: hidden; }
.pft__stage { position: relative; display: grid; place-content: center; justify-items: center; gap: 14px; min-height: clamp(520px, 86svh, 980px); text-align: center; }
.pft__h { position: relative; z-index: 3; margin: 0; ${D} font-size: clamp(3rem, 1rem + 10cqi, 11rem); letter-spacing: -0.045em; line-height: 0.9; mix-blend-mode: difference; color: #fff; }
.pft__line { position: relative; z-index: 3; margin: 0; padding: 4px 8px; background: var(--s-bg); ${SMALL} }
.pft__pic { position: absolute; z-index: 1; width: clamp(88px, 15cqi, 230px); height: auto; aspect-ratio: 4 / 5; object-fit: cover; }
.pft__pic--1 { left: 2%; top: 4%; transform: rotate(-4deg); }
.pft__pic--2 { right: 3%; top: 10%; transform: rotate(3deg); }
.pft__pic--3 { left: 7%; bottom: 6%; transform: rotate(2deg); }
.pft__pic--4 { right: 9%; bottom: 3%; transform: rotate(-3deg); }
.pft__pic--5 { left: 27%; top: 0; transform: rotate(-1deg); }
.pft__pic--6 { right: 28%; bottom: 0; transform: rotate(4deg); }
.pft__hint { margin: 0; ${SMALL} text-align: center; opacity: 0.6; }
@media (hover: none) { .pft__hint { visibility: hidden; } }
@container (max-width: 600px) { .pft__stage { min-height: 600px; } .pft__pic { width: 30cqi; } }
@media (prefers-reduced-motion: no-preference) {
  .pft:not([data-motion="off"]) .pft__pic { animation: pft-in calc(var(--t-motion-duration, 650ms) * 1.2) var(--t-motion-ease, ease) both; }
  .pft:not([data-motion="off"]) .pft__pic--2 { animation-delay: var(--t-motion-stagger, 65ms); }
  .pft:not([data-motion="off"]) .pft__pic--3 { animation-delay: calc(var(--t-motion-stagger, 65ms) * 2); }
  .pft:not([data-motion="off"]) .pft__pic--4 { animation-delay: calc(var(--t-motion-stagger, 65ms) * 3); }
  .pft:not([data-motion="off"]) .pft__pic--5 { animation-delay: calc(var(--t-motion-stagger, 65ms) * 4); }
  .pft:not([data-motion="off"]) .pft__pic--6 { animation-delay: calc(var(--t-motion-stagger, 65ms) * 5); }
}
@keyframes pft-in { from { opacity: 0; clip-path: inset(100% 0 0 0); } to { opacity: 1; clip-path: inset(0 0 0 0); } }`,
  settings: [
    text("heading", "Name (empty uses the shop name)", "Vera Hollis"),
    text("line", "Line under the name", "Photographs of coasts, kitchens and the people in them"),
    text("hint", "Small line at the bottom", "Move across the page"),
    range("trail_spacing", "Trail spacing", 40, 240, 10, 110, "px"),
    range("trail_life", "How long each picture stays", 300, 2000, 100, 900, "ms"),
    ...motion(),
    scheme("site"),
    ...spacing(16, 24),
  ],
  blocks: [{ type: "photo", name: "Picture", settings: [image("photo", "Picture"), text("alt", "Picture description", "")] }],
  presetBlocks: [
    { type: "photo", settings: { alt: "A fisherman mending a net on a grey harbour wall" } },
    { type: "photo", settings: { alt: "Steam rising from a pot in a dark restaurant kitchen" } },
    { type: "photo", settings: { alt: "Two swimmers walking into a cold sea at dawn" } },
    { type: "photo", settings: { alt: "A baker's floury hands shaping dough" } },
    { type: "photo", settings: { alt: "Red boats pulled up on a pebble beach" } },
    { type: "photo", settings: { alt: "An old woman laughing at a market stall" } },
  ],
  maxBlocks: 12,
})

export const series = defineSection({
  type: "ai_pf_series",
  name: "Featured series",
  summary: "One series at full bleed: the picture drifting slower than the page (P3 parallax-depth), its title, place and year, and a link into it.",
  template: `
<section class="pfs" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="pfs__frame" data-storelib-motion="parallax-depth" data-motion-depth="{{ settings.depth }}">{% if settings.photo %}<img class="pfs__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="2400" height="1600">{% endif %}</div>
  <div class="pfs__cap">
    <h2 class="pfs__h">{{ settings.heading }}</h2>
    <dl class="pfs__meta">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}</dl>
    <a class="pfs__link" href="{{ settings.link_url | url }}">{{ settings.link_label }}</a>
  </div>
</section>`,
  style: `
.pfs { ${BOX} padding-inline: 0; }
.pfs__frame { height: clamp(380px, 82svh, 1000px); overflow: hidden; }
@container (max-width: 600px) { .pfs__frame { height: 70svh; } }
.pfs__img { width: 100%; height: 112%; object-fit: cover; }
.pfs__cap { display: grid; gap: 10px; padding: 16px var(--theme-padding-x, 20px) 0; }
.pfs__h { margin: 0; ${D} font-size: clamp(1.75rem, 1.2rem + 2.4cqi, 3rem); letter-spacing: -0.03em; }
.pfs__meta { display: flex; flex-wrap: wrap; gap: 4px 24px; margin: 0; ${SMALL} }
.pfs__meta div { display: flex; gap: 6px; }
.pfs__meta dt { opacity: 0.6; }
.pfs__meta dd { margin: 0; }
.pfs__link { justify-self: start; display: inline-flex; min-height: 44px; align-items: center; color: inherit; ${SMALL} text-underline-offset: 5px; }
@container (min-width: 900px) { .pfs__cap { grid-template-columns: minmax(0, 1fr) auto auto; align-items: baseline; gap: 24px; } }
@media (prefers-reduced-motion: no-preference) { @supports (animation-timeline: view()) { .pfs:not([data-motion="off"]) .pfs__img { animation: pfs-drift linear both; animation-timeline: view(); } } }
@keyframes pfs-drift { from { transform: translateY(calc(var(--t-motion-parallax, 6%) * -1 * var(--m-k, 1))); } to { transform: translateY(calc(var(--t-motion-parallax, 6%) * var(--m-k, 1))); } }`,
  settings: [
    text("heading", "Series title", "Low Tide, Northumberland"),
    image("photo", "Picture"),
    text("photo_alt", "Picture description", "A wide flat beach at low tide with one figure walking a dog far away"),
    text("link_label", "Link", "See the series"),
    url("link_url", "Link goes to", "/collections"),
    range("depth", "Parallax depth", 0, 0.6, 0.05, 0.25),
    ...motion(),
    scheme("site"),
    ...spacing(24, 96),
  ],
  blocks: [{ type: "meta", name: "Detail", settings: [text("label", "Label", "Year"), text("value", "Value", "2025")] }],
  presetBlocks: [
    { type: "meta", settings: { label: "Year", value: "2025" } },
    { type: "meta", settings: { label: "Pictures", value: "Twenty two" } },
    { type: "meta", settings: { label: "Camera", value: "Medium format film" } },
  ],
  maxBlocks: 4,
})

export const gallery = defineSection({
  type: "ai_pf_gallery",
  name: "Gallery",
  summary: "Pictures in uneven columns like a wall hang; each opens large in place (a popover, no script) with its caption.",
  template: `
<section class="pfg" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="pfg__head"><h2 class="pfg__h">{{ settings.heading }}</h2><p class="pfg__note">{{ settings.note }}</p></div>
  <ul class="pfg__wall" data-storelib-motion="reveal-stagger">
    {% for block in section.blocks %}
      <li class="pfg__item" data-block-id="{{ block.id }}">
        {% if block.settings.photo %}
        <button class="pfg__open" type="button" popovertarget="pfg-{{ section.id }}-{{ forloop.index }}" aria-label="{{ settings.open_label }}: {{ block.settings.caption }}"><img class="pfg__img" src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="1200" height="1500"></button>
        <div class="pfg__box" id="pfg-{{ section.id }}-{{ forloop.index }}" popover><img src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="1600" height="2000"><p class="pfg__boxcap">{{ block.settings.caption }}</p><button class="pfg__close" type="button" popovertarget="pfg-{{ section.id }}-{{ forloop.index }}" popovertargetaction="hide">{{ settings.close_label }}</button></div>
        {% endif %}
        <p class="pfg__cap">{{ block.settings.caption }}</p>
      </li>
    {% endfor %}
  </ul>
</section>`,
  style: `
.pfg { ${BOX} }
.pfg__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; margin-bottom: 24px; }
.pfg__h { margin: 0; ${D} font-size: clamp(1.75rem, 1.2rem + 2.4cqi, 3rem); letter-spacing: -0.03em; }
.pfg__note { margin: 0; ${SMALL} opacity: 0.6; }
.pfg__wall { margin: 0; padding: 0; list-style: none; columns: 2; column-gap: 12px; }
.pfg__item { break-inside: avoid; margin-bottom: 22px; }
.pfg__open { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }
.pfg__img { display: block; width: 100%; height: auto; }
.pfg__item:nth-child(3n + 1) .pfg__img { aspect-ratio: 4 / 5; object-fit: cover; }
.pfg__item:nth-child(3n + 2) .pfg__img { aspect-ratio: 3 / 2; object-fit: cover; }
.pfg__item:nth-child(3n) .pfg__img { aspect-ratio: 1; object-fit: cover; }
.pfg__cap { margin: 8px 0 0; ${SMALL} }
.pfg__box { inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 20px; border: 0; background: var(--s-bg); color: var(--s-text); display: none; }
.pfg__box:popover-open { display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 12px; place-items: center; }
.pfg__box img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
.pfg__boxcap { margin: 0; ${SMALL} }
.pfg__close { position: absolute; top: 12px; right: 12px; min-height: 44px; padding: 0 14px; border: 1px solid var(--s-border); background: var(--s-bg); color: inherit; font: inherit; cursor: pointer; }
@container (min-width: 900px) { .pfg__wall { columns: 3; column-gap: 20px; } .pfg__item:nth-child(2) { margin-top: 80px; } }
${revealCss("pfg", ".pfg__item", "pfg-rise")}`,
  settings: [text("heading", "Heading", "Recent"), text("note", "Small line", "Select any picture to see it large"), text("open_label", "Open (read aloud)", "Open"), text("close_label", "Close button", "Close"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "photo", name: "Picture", settings: [image("photo", "Picture"), text("alt", "Picture description", ""), text("caption", "Caption", "Porto, 2025")] }],
  presetBlocks: [
    { type: "photo", settings: { caption: "Sardine season, Porto, 2025", alt: "A cook grilling sardines over coals on a street" } },
    { type: "photo", settings: { caption: "Morning swim, Margate, 2024", alt: "Swimmers in bright caps in a grey sea pool" } },
    { type: "photo", settings: { caption: "Pass, Lyon, 2025", alt: "Plates lined up on a steel pass under heat lamps" } },
    { type: "photo", settings: { caption: "Nets, Whitby, 2024", alt: "Coils of green fishing net on a quay" } },
    { type: "photo", settings: { caption: "Family lunch, Puglia, 2023", alt: "A long outdoor table with a family passing bowls" } },
    { type: "photo", settings: { caption: "Last ferry, Skye, 2024", alt: "A small ferry leaving a jetty at dusk" } },
  ],
  maxBlocks: 24,
})

export const index = defineSection({
  type: "ai_pf_index",
  name: "Series index",
  summary: "Every series as a line with place, year and number of pictures; its cover follows the pointer over the line (P3 cursor-follow) and sits beside it on touch screens.",
  template: `
<section class="pfi" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="pfi__h">{{ settings.heading }}</h2>
  <ul class="pfi__list" data-storelib-motion="cursor-follow" data-motion-target=".pfi__cover">
    {% for block in section.blocks %}<li class="pfi__row" data-block-id="{{ block.id }}"><a class="pfi__link" href="{{ block.settings.link | url }}"><span class="pfi__name">{{ block.settings.name }}</span><span class="pfi__place">{{ block.settings.place }}</span><span class="pfi__year">{{ block.settings.year }}</span>{% if block.settings.cover %}<img class="pfi__cover" src="{{ block.settings.cover | asset }}" alt="{{ block.settings.alt }}" width="600" height="750">{% endif %}</a></li>{% endfor %}
  </ul>
</section>`,
  style: `
.pfi { ${BOX} }
.pfi__h { margin: 0 0 20px; ${D} font-size: clamp(1.75rem, 1.2rem + 2.4cqi, 3rem); letter-spacing: -0.03em; }
.pfi__list { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.pfi__row { border-bottom: 1px solid var(--s-border); }
.pfi__link { position: relative; display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; grid-template-rows: auto auto; gap: 2px 14px; align-items: center; padding: 12px 0; color: inherit; text-decoration: none; }
.pfi__cover { grid-row: 1 / span 2; grid-column: 1; width: 64px; height: 80px; object-fit: cover; }
.pfi__name { grid-column: 2; ${D} font-size: clamp(1.25rem, 1rem + 1.4cqi, 2.25rem); letter-spacing: -0.025em; }
.pfi__place { grid-column: 2; ${SMALL} opacity: 0.65; }
.pfi__year { grid-column: 3; grid-row: 1; ${SMALL} }
@container (min-width: 900px) {
  .pfi__link { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 6rem; grid-template-rows: auto; padding: 18px 0; }
  .pfi__name, .pfi__place, .pfi__year { grid-column: auto; grid-row: auto; }
  .pfi__cover { position: absolute; z-index: 2; right: 22%; top: 50%; width: 220px; height: auto; aspect-ratio: 4 / 5; opacity: 0; transform: translateY(-50%) scale(0.92); pointer-events: none; transition: opacity var(--t-motion-hover, 200ms) ease, transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
}
@media (hover: hover) and (pointer: fine) { .pfi__link:hover .pfi__cover { opacity: 1; transform: translateY(-50%); } .pfi__link:hover .pfi__name { color: var(--s-accent); } }
@media (prefers-reduced-motion: reduce) { .pfi__cover { transition: none; } }`,
  settings: [text("heading", "Heading", "Series"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "series", name: "Series", settings: [text("name", "Series", "Low Tide"), text("place", "Place", "Northumberland"), text("year", "Year", "2025"), image("cover", "Cover"), text("alt", "Cover description", ""), url("link", "Goes to", "/collections")] }],
  presetBlocks: [
    { type: "series", settings: { name: "Low Tide", place: "Northumberland", year: "2025", alt: "A wide beach at low tide", link: "/collections" } },
    { type: "series", settings: { name: "The Pass", place: "Restaurant kitchens, Lyon and London", year: "2025", alt: "A chef plating under heat lamps", link: "/collections" } },
    { type: "series", settings: { name: "Cold Water", place: "Sea pools of the south coast", year: "2024", alt: "Swimmers in a sea pool in winter", link: "/collections" } },
    { type: "series", settings: { name: "Table", place: "Family lunches, Puglia", year: "2023", alt: "A family lunch outdoors", link: "/collections" } },
  ],
  maxBlocks: 20,
})

export const strip = defineSection({
  type: "ai_pf_strip",
  name: "Film strip",
  summary: "A sequence moving sideways while the section is pinned (P3 pin-horizontal), frame numbers under each picture like a contact sheet; a swipe row with snap points on phones.",
  template: `
<section class="pfr" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="pfr__h">{{ settings.heading }}</h2>
  <ol class="pfr__rail" data-storelib-motion="pin-horizontal" data-motion-distance="{{ section.blocks.size }}" tabindex="0" aria-label="{{ settings.heading }}">
    {% for block in section.blocks %}<li class="pfr__frame" data-block-id="{{ block.id }}">{% if block.settings.photo %}<img src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="1500" height="1000">{% endif %}<p class="pfr__n">{{ settings.frame_label }} {{ forloop.index }}, {{ block.settings.caption }}</p></li>{% endfor %}
  </ol>
</section>`,
  style: `
.pfr { ${BOX} overflow: hidden; }
.pfr__h { margin: 0 0 20px; ${D} font-size: clamp(1.75rem, 1.2rem + 2.4cqi, 3rem); letter-spacing: -0.03em; }
.pfr__rail { display: flex; gap: 10px; margin: 0; padding: 0 0 12px; list-style: none; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; }
.pfr__frame { flex: 0 0 86%; scroll-snap-align: start; }
.pfr__frame img { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; object-fit: cover; }
.pfr__n { margin: 8px 0 0; ${SMALL} font-variant-numeric: tabular-nums; }
@container (min-width: 900px) { .pfr__frame { flex-basis: 48%; } }
@media (prefers-reduced-motion: reduce) { .pfr__rail { scroll-snap-type: none; } }`,
  settings: [text("heading", "Heading", "One morning at the harbour"), text("frame_label", "Before each number", "Frame"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "frame", name: "Frame", settings: [image("photo", "Picture"), text("alt", "Picture description", ""), text("caption", "Caption", "5:40")] }],
  presetBlocks: [
    { type: "frame", settings: { caption: "5:40, boats in", alt: "Fishing boats entering a harbour in blue dawn light" } },
    { type: "frame", settings: { caption: "6:05, ice", alt: "A man shovelling ice into crates of fish" } },
    { type: "frame", settings: { caption: "6:30, the market", alt: "Buyers inspecting fish at an indoor market" } },
    { type: "frame", settings: { caption: "7:10, breakfast", alt: "Two fishermen eating breakfast in a café window" } },
  ],
  maxBlocks: 12,
})

export const places = defineSection({
  type: "ai_pf_places",
  name: "Places running",
  summary: "Where the work was made, as a slow running line (P3 marquee), paused on hover, still and wrapped for reduced motion.",
  template: `
<section class="pfq" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars("--pfq-speed: {{ settings.speed }}s;")}" aria-label="{{ settings.label }}">
  <div class="pfq__track" data-storelib-motion="marquee" data-motion-speed="{{ settings.speed }}">
    <ul class="pfq__run">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.place }}</li>{% endfor %}</ul>
    <ul class="pfq__run" aria-hidden="true">{% for block in section.blocks %}<li>{{ block.settings.place }}</li>{% endfor %}</ul>
  </div>
</section>`,
  style: `
.pfq { ${BOX} overflow: hidden; border-block: 1px solid var(--s-border); }
.pfq__track { display: flex; width: max-content; }
.pfq__run { display: flex; flex: none; margin: 0; padding: 0; list-style: none; }
.pfq__run li { ${D} font-size: clamp(2rem, 1.2rem + 4cqi, 5rem); letter-spacing: -0.035em; white-space: nowrap; padding-right: 0.8em; }
.pfq__run li:nth-child(odd) { opacity: 0.35; }
@media (prefers-reduced-motion: reduce) { .pfq__track { width: auto; } .pfq__run { flex-wrap: wrap; } .pfq__run[aria-hidden="true"] { display: none; } .pfq__run li { white-space: normal; } }
@media (prefers-reduced-motion: no-preference) { .pfq:not([data-motion="off"]) .pfq__track { animation: pfq-run var(--pfq-speed, 60s) linear infinite; } .pfq:hover .pfq__track { animation-play-state: paused; } .pfq[data-motion="off"] .pfq__run[aria-hidden="true"] { display: none; } }
@keyframes pfq-run { to { transform: translateX(-50%); } }`,
  settings: [text("label", "What it lists (read aloud)", "Where the work was made"), range("speed", "Seconds per loop", 20, 120, 5, 60, "s"), ...motion(), scheme("site"), ...spacing(24, 24)],
  blocks: [{ type: "place", name: "Place", settings: [text("place", "Place", "Porto")] }],
  presetBlocks: ["Northumberland", "Porto", "Lyon", "Margate", "Puglia", "Skye"].map((place) => ({ type: "place", settings: { place } })),
  maxBlocks: 12,
})

export const statement = defineSection({
  type: "ai_pf_statement",
  name: "Statement",
  summary: "A short statement about the work, large, beside the photographer's details.",
  template: `
<section class="pfa" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="pfa__grid">
    <div class="pfa__body" data-storelib-motion="reveal-stagger">{{ settings.body | raw }}</div>
    <dl class="pfa__meta">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}</dl>
  </div>
</section>`,
  style: `
.pfa { ${BOX} }
.pfa__grid { display: grid; gap: 28px; }
.pfa__body { ${D} font-size: clamp(1.5rem, 1.1rem + 2cqi, 2.75rem); letter-spacing: -0.025em; line-height: 1.18; max-width: 28ch; }
.pfa__body p { margin: 0 0 0.6em; }
.pfa__meta { margin: 0; ${SMALL} }
.pfa__meta div { display: grid; grid-template-columns: 7rem minmax(0, 1fr); padding: 10px 0; border-top: 1px solid var(--s-border); }
.pfa__meta dt { opacity: 0.6; }
.pfa__meta dd { margin: 0; }
@container (min-width: 900px) { .pfa__grid { grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.6fr); align-items: end; } }
${revealCss("pfa", ".pfa__body p", "pfa-rise")}`,
  settings: [
    richtext("body", "Statement", "<p>I photograph places where people feed each other: harbours, kitchens, long tables. Mostly on film, mostly early in the morning, always with permission.</p>"),
    ...motion(),
    scheme("site"),
    ...spacing(120, 120),
  ],
  blocks: [{ type: "meta", name: "Detail", settings: [text("label", "Label", "Based in"), text("value", "Value", "Newcastle")] }],
  presetBlocks: [
    { type: "meta", settings: { label: "Based in", value: "Newcastle upon Tyne" } },
    { type: "meta", settings: { label: "Works", value: "Editorial, food, documentary" } },
    { type: "meta", settings: { label: "Travels", value: "Anywhere with a harbour" } },
  ],
  maxBlocks: 5,
})

export const prints = defineSection({
  type: "ai_pf_prints",
  name: "Prints",
  summary: "Prints for sale from the store's real products (chosen, or the newest), shown like framed pieces on a wall with name, edition note and price.",
  template: `
<section class="pfp" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="pfp__head"><h2 class="pfp__h">{{ settings.heading }}</h2><a class="pfp__all" href="{{ settings.all_url | url }}">{{ settings.all_label }}</a></div>
  <ul class="pfp__list">
    {% if settings.products.size > 0 %}
      {% for product in settings.products limit: 3 %}<li class="pfp__item"><a class="pfp__link" href="{{ product.settings.url | url }}"><span class="pfp__mat">{% if product.settings.image %}<img src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="900" height="1125">{% endif %}</span><span class="pfp__name">{{ product.settings.title }}</span><span class="pfp__price">{{ product.settings.price }}</span></a><button class="pfp__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button></li>{% endfor %}
    {% else %}
      {% for product in products limit: 3 %}<li class="pfp__item"><a class="pfp__link" href="{{ product.settings.url | url }}"><span class="pfp__mat">{% if product.settings.image %}<img src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="900" height="1125">{% endif %}</span><span class="pfp__name">{{ product.settings.title }}</span><span class="pfp__price">{{ product.settings.price }}</span></a><button class="pfp__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button></li>{% endfor %}
    {% endif %}
  </ul>
  <ul class="pfp__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.note }}</li>{% endfor %}</ul>
</section>`,
  style: `
.pfp { ${BOX} }
.pfp__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; margin-bottom: 28px; }
.pfp__h { margin: 0; ${D} font-size: clamp(1.75rem, 1.2rem + 2.4cqi, 3rem); letter-spacing: -0.03em; }
.pfp__all { display: inline-flex; min-height: 44px; align-items: center; color: inherit; ${SMALL} }
.pfp__list { display: grid; gap: 40px 24px; margin: 0; padding: 0; list-style: none; }
.pfp__link { display: grid; gap: 6px; color: inherit; text-decoration: none; }
.pfp__mat { display: block; padding: 9%; background: var(--s-bg); outline: 1px solid var(--s-border); outline-offset: -1px; }
.pfp__mat img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.pfp__name { ${D} font-size: 1.125rem; }
.pfp__price { ${SMALL} opacity: 0.7; }
.pfp__add { justify-self: start; margin-top: 8px; min-height: 44px; padding: 0 16px; border: 1px solid var(--s-text); background: none; color: inherit; font: inherit; ${SMALL} cursor: pointer; }
.pfp__add:hover { background: var(--s-text); color: var(--s-bg); }
.pfp__notes { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 32px 0 0; padding: 14px 0 0; border-top: 1px solid var(--s-border); list-style: none; ${SMALL} opacity: 0.75; }
@media (hover: hover) and (pointer: fine) { .pfp:not([data-motion="off"]) .pfp__link:hover img { transform: scale(0.98); } }
@container (min-width: 760px) { .pfp__list { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .pfp__mat img { transition: none; } }`,
  settings: [text("heading", "Heading", "Prints"), productList(), text("add_label", "Add button", "Add to cart"), text("all_label", "Link to all", "All prints"), url("all_url", "Link goes to", "/products"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Archival pigment on cotton rag")] }],
  presetBlocks: ["Archival pigment on cotton rag", "Editions of 25, signed", "Ships flat in two weeks"].map((note) => ({ type: "note", settings: { note } })),
  maxBlocks: 4,
})

export const commission = defineSection({
  type: "ai_pf_commission",
  name: "Commissions",
  summary: "How to commission the photographer: what they take on, how it works, and the way to ask.",
  template: `
<section class="pfc" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="pfc__grid">
    <div><h2 class="pfc__h">{{ settings.heading }}</h2><div class="pfc__text">{{ settings.text | raw }}</div><a class="pfc__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a></div>
    <ol class="pfc__steps">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><h3 class="pfc__t">{{ block.settings.title }}</h3><p>{{ block.settings.text }}</p></li>{% endfor %}</ol>
  </div>
</section>`,
  style: `
.pfc { ${BOX} }
.pfc__grid { display: grid; gap: 32px; }
.pfc__h { margin: 0; ${D} font-size: clamp(1.75rem, 1.2rem + 2.4cqi, 3rem); letter-spacing: -0.03em; }
.pfc__text { max-width: 46ch; margin: 14px 0 22px; line-height: 1.6; }
.pfc__text p { margin: 0; }
.pfc__btn { display: inline-flex; align-items: center; min-height: 50px; padding: 0 24px; background: var(--s-text); color: var(--s-bg); text-decoration: none; ${SMALL} }
.pfc__steps { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; counter-reset: pfc; border-top: 1px solid var(--s-border); }
.pfc__steps li { counter-increment: pfc; display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); gap: 4px 12px; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.pfc__steps li::before { content: counter(pfc); grid-row: span 2; ${SMALL} color: var(--s-accent); }
.pfc__t { margin: 0; ${D} font-size: 1.25rem; }
.pfc__steps p { margin: 0; line-height: 1.55; opacity: 0.8; }
@container (min-width: 900px) { .pfc__grid { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 64px; } }`,
  settings: [
    text("heading", "Heading", "Commissions"),
    richtext("text", "Words", "<p>Editorial stories, restaurant and food work, and a few family days a year. Booked about two months ahead.</p>"),
    text("cta_label", "Button", "Ask about a date"),
    url("cta_url", "Button goes to", "/contact"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "step", name: "Step", settings: [text("title", "Step", "Write with the date"), textarea("text", "What happens", "")] }],
  presetBlocks: [
    { type: "step", settings: { title: "Write with the date and place", text: "A few lines on what it is for. I reply within two days." } },
    { type: "step", settings: { title: "A short call", text: "Twenty minutes to agree the pictures you need and the light we want." } },
    { type: "step", settings: { title: "The shoot, then the edit", text: "A gallery of finished pictures within ten days, film scans within three weeks." } },
  ],
  maxBlocks: 5,
})

export const contactBand = defineSection({
  type: "ai_pf_hello",
  name: "Say hello",
  summary: "The last line: an email address set large as the link, availability and the social accounts the photographer gives.",
  template: `
<section class="pfz" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <p class="pfz__k">{{ settings.heading }}</p>
  <a class="pfz__mail" href="{{ settings.link | url }}">{{ settings.link_label }}</a>
  <ul class="pfz__links">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{% if block.settings.url %}<a href="{{ block.settings.url | url }}">{{ block.settings.label }}</a>{% else %}{{ block.settings.label }}{% endif %}</li>{% endfor %}</ul>
</section>`,
  style: `
.pfz { ${BOX} }
.pfz__k { margin: 0; ${SMALL} opacity: 0.65; }
.pfz__mail { display: block; margin: 10px 0 24px; ${D} font-size: clamp(1.75rem, 0.8rem + 6cqi, 7rem); letter-spacing: -0.045em; line-height: 1; color: inherit; text-decoration: none; overflow-wrap: anywhere; }
.pfz__mail:hover { color: var(--s-accent); }
.pfz__links { display: flex; flex-wrap: wrap; gap: 4px 22px; margin: 0; padding: 0; list-style: none; ${SMALL} }
.pfz__links a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; }
${revealCss("pfz", ".pfz__mail", "pfz-rise")}`,
  settings: [text("heading", "Small line", "Booking from April"), text("link_label", "Shown as", "studio@verahollis.com"), url("link", "Goes to", "mailto:studio@verahollis.com"), ...motion(), scheme("site"), ...spacing(120, 120)],
  blocks: [{ type: "link", name: "Link", settings: [text("label", "Label", "Instagram"), url("url", "Goes to", "")] }],
  presetBlocks: [
    { type: "link", settings: { label: "Instagram", url: "https://www.instagram.com/" } },
    { type: "link", settings: { label: "Prints", url: "/products" } },
    { type: "link", settings: { label: "About Vera", url: "/about" } },
  ],
  maxBlocks: 6,
})

export const footer = defineSection({
  type: "ai_pf_footer",
  name: "Footer",
  kind: "footer",
  summary: "Minimal footer: the name, the footer menu in one line, a newsletter field, language and currency, the year.",
  template: `
<footer class="pfo" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <div class="pfo__row">
    <p class="pfo__name">{{ shop.name | default: settings.brand }}</p>
    <nav class="pfo__nav" aria-label="{{ settings.nav_label }}">{% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}</nav>
  </div>
  <div class="pfo__row">
    <form class="pfo__form" data-storelib-form="subscribe"><label for="pfo-e-{{ section.id }}">{{ settings.newsletter_label }}</label><input id="pfo-e-{{ section.id }}" type="email" name="email" autocomplete="email" required placeholder="{{ settings.email_placeholder }}"><button type="submit">{{ settings.button_label }}</button></form>
    ${prefs("pfo")}
  </div>
  <p class="pfo__small">{{ settings.small_print }}</p>
</footer>`,
  style: `
.pfo { display: grid; gap: 22px; padding: 40px var(--theme-padding-x, 20px) 24px; background: var(--s-bg); color: var(--s-text); border-top: 1px solid var(--s-border); font-size: 0.8125rem; container-type: inline-size; }
.pfo__row { display: grid; gap: 16px; }
.pfo__name { margin: 0; font-family: var(--theme-font-heading), sans-serif; color: var(--s-heading); font-size: 1rem; }
.pfo__nav { display: flex; flex-wrap: wrap; gap: 0 20px; }
.pfo__nav a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; text-decoration: none; }
.pfo__nav a:hover { text-decoration: underline; }
.pfo__form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.pfo__form input { flex: 1 1 200px; min-width: 0; min-height: 44px; border: 0; border-bottom: 1px solid var(--s-text); background: none; color: inherit; font: inherit; }
.pfo__form button { min-height: 44px; padding: 0 4px; border: 0; background: none; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
.pfo__small { margin: 0; opacity: 0.6; }
${panelCss("pfo")}
@container (min-width: 900px) { .pfo__row { grid-template-columns: minmax(0, 1fr) auto; align-items: center; } }`,
  settings: [
    menu("menu", "Footer menu", "footer"),
    text("brand", "Name when there is no shop name", "Vera Hollis"),
    text("newsletter_label", "Newsletter line", "New series, twice a year"),
    text("email_placeholder", "Email hint", "Email"),
    text("button_label", "Subscribe button", "Sign up"),
    text("small_print", "Small print", "All photographs by Vera Hollis. Please ask before using them."),
    text("nav_label", "Menu name (read aloud)", "Footer"),
    text("language_label", "Language", "Language"),
    text("currency_label", "Currency", "Currency"),
    scheme("site"),
  ],
})

export const product = defineSection({
  type: "ai_pf_product",
  name: "Print",
  summary: "One print: the picture large in a mat, its title, price, sizes as add to cart buttons, offers, description and the print's details.",
  template: `
<section class="pfpd" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="pfpd__grid">
    <div class="pfpd__media">{% for img in product.images limit: 3 %}<span class="pfpd__mat"><img src="{{ img }}" alt="{{ product.title }}" width="1400" height="1750"></span>{% endfor %}</div>
    <div class="pfpd__info">
      <h1 class="pfpd__title">{{ product.title }}</h1>
      <p class="pfpd__price">{{ product.price }}</p>
      {% if page.product.settings.variants.size > 0 %}<div class="pfpd__opts" role="group" aria-label="{{ settings.options_label }}">{% for v in page.product.settings.variants %}<button class="pfpd__opt" type="button" data-storelib-add-to-cart="{{ product.id }}" data-variant-id="{{ v.id }}" data-title="{{ product.title }}" data-price="{{ v.price }}">{{ v.name }} <span>{{ v.price }}</span></button>{% endfor %}</div>{% else %}<button class="pfpd__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.title }}" data-price="{{ product.price }}" data-url="{{ product.url }}">{{ settings.add_label }}</button>{% endif %}
      <div data-storelib-island data-storelib-offers="{{ product.id }}" data-title="{{ product.title }}" data-url="{{ product.url }}" data-layout="open"></div>
      {% if product.description_html %}<div class="pfpd__desc">{{ product.description_html | raw }}</div>{% endif %}
      <dl class="pfpd__spec">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}</dl>
    </div>
  </div>
</section>`,
  style: `
.pfpd { ${BOX} }
.pfpd__grid { display: grid; gap: 28px; }
.pfpd__media { display: grid; gap: 16px; }
.pfpd__mat { display: block; padding: 8%; outline: 1px solid var(--s-border); outline-offset: -1px; }
.pfpd__mat img { display: block; width: 100%; height: auto; }
.pfpd__title { margin: 0; ${D} font-size: clamp(1.75rem, 1.2rem + 2.4cqi, 3rem); letter-spacing: -0.03em; }
.pfpd__price { margin: 8px 0 20px; }
.pfpd__opts { display: grid; gap: 8px; }
.pfpd__opt, .pfpd__add { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 50px; padding: 0 16px; border: 1px solid var(--s-text); background: none; color: inherit; font: inherit; cursor: pointer; }
.pfpd__add { justify-content: center; background: var(--s-text); color: var(--s-bg); }
.pfpd__opt:hover { background: var(--s-text); color: var(--s-bg); }
.pfpd__desc { margin-top: 20px; line-height: 1.65; max-width: 52ch; }
.pfpd__spec { margin: 22px 0 0; ${SMALL} }
.pfpd__spec div { display: grid; grid-template-columns: 7rem minmax(0, 1fr); padding: 10px 0; border-top: 1px solid var(--s-border); }
.pfpd__spec dt { opacity: 0.6; }
.pfpd__spec dd { margin: 0; }
@container (min-width: 900px) { .pfpd__grid { grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr); align-items: start; gap: 56px; } .pfpd__info { position: sticky; top: 40px; } }`,
  settings: [text("add_label", "Add button", "Add to cart"), text("options_label", "Sizes (read aloud)", "Choose a size"), ...motion(), scheme("site"), ...spacing(32, 96)],
  blocks: [{ type: "spec", name: "Detail", settings: [text("label", "Label", "Paper"), text("value", "Value", "Cotton rag, 308g")] }],
  presetBlocks: [
    { type: "spec", settings: { label: "Paper", value: "Hahnemühle Photo Rag, 308g" } },
    { type: "spec", settings: { label: "Edition", value: "25, signed and numbered" } },
    { type: "spec", settings: { label: "Ships", value: "Flat, within two weeks" } },
  ],
  maxBlocks: 6,
})

export const collection = defineSection({
  type: "ai_pf_collection",
  name: "Collection",
  summary: "A series or collection of prints from the store's real products, in a quiet grid with the title large.",
  template: `
<section class="pfl" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h1 class="pfl__h">{% if collection.title %}{{ collection.title }}{% else %}{{ settings.heading }}{% endif %}</h1>
  {% if collection.description %}<p class="pfl__intro">{{ collection.description }}</p>{% endif %}
  {% if page.query %}<p class="pfl__intro">{{ settings.query_label }} {{ page.query }}</p>{% endif %}
  <ul class="pfl__list">{% for product in products %}<li><a class="pfl__link" href="{{ product.settings.url | url }}">{% if product.settings.image %}<img src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="900" height="1125">{% endif %}<span class="pfl__name">{{ product.settings.title }}</span><span class="pfl__price">{{ product.settings.price }}</span></a><button class="pfl__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button></li>{% endfor %}</ul>
  <ul class="pfl__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.note }}</li>{% endfor %}</ul>
</section>`,
  style: `
.pfl { ${BOX} }
.pfl__h { margin: 0; ${D} font-size: clamp(2.25rem, 1.2rem + 5cqi, 6rem); letter-spacing: -0.045em; line-height: 0.95; }
.pfl__intro { max-width: 52ch; margin: 14px 0 0; line-height: 1.6; }
.pfl__list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px 14px; margin: 36px 0 0; padding: 0; list-style: none; }
.pfl__link { display: grid; gap: 6px; color: inherit; text-decoration: none; }
.pfl__link img { width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; }
.pfl__name { ${D} font-size: 1rem; }
.pfl__price { ${SMALL} opacity: 0.7; }
.pfl__add { margin-top: 6px; min-height: 44px; padding: 0 12px; border: 1px solid var(--s-text); background: none; color: inherit; font: inherit; ${SMALL} cursor: pointer; }
.pfl__notes { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 32px 0 0; padding: 14px 0 0; border-top: 1px solid var(--s-border); list-style: none; ${SMALL} opacity: 0.75; }
@container (min-width: 900px) { .pfl__list { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 40px 20px; } }`,
  settings: [text("heading", "Heading when there is no collection", "Prints"), text("query_label", "Before the search words", "Results for"), text("add_label", "Add button", "Add to cart"), ...motion(), scheme("site"), ...spacing(32, 96)],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Editions of 25")] }],
  presetBlocks: ["Editions of 25, signed", "Archival pigment on cotton rag"].map((note) => ({ type: "note", settings: { note } })),
  maxBlocks: 4,
})

export const about = defineSection({
  type: "ai_pf_about",
  name: "About",
  summary: "About the photographer: a portrait, the story in their words, and a plain list of what they do and where.",
  template: `
<section class="pfab" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="pfab__grid">
    {% if settings.photo %}<img class="pfab__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1200" height="1500" data-storelib-motion="parallax-depth" data-motion-depth="0.1">{% endif %}
    <div><h1 class="pfab__h">{{ settings.heading }}</h1><div class="pfab__story">{{ settings.story | raw }}</div>
      <dl class="pfab__list">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}</dl>
    </div>
  </div>
</section>`,
  style: `
.pfab { ${BOX} }
.pfab__grid { display: grid; gap: 28px; }
.pfab__img { width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; }
.pfab__h { margin: 0; ${D} font-size: clamp(2.25rem, 1.2rem + 5cqi, 5rem); letter-spacing: -0.045em; line-height: 0.95; }
.pfab__story { margin-top: 18px; max-width: 54ch; line-height: 1.7; font-size: 1.0625rem; }
.pfab__list { margin: 28px 0 0; ${SMALL} }
.pfab__list div { display: grid; grid-template-columns: 7rem minmax(0, 1fr); padding: 10px 0; border-top: 1px solid var(--s-border); }
.pfab__list dt { opacity: 0.6; }
.pfab__list dd { margin: 0; }
@container (min-width: 900px) { .pfab__grid { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); align-items: end; gap: 64px; } }
${revealCss("pfab", ".pfab__list div", "pfab-rise")}`,
  settings: [
    text("heading", "Heading", "Vera Hollis"),
    richtext("story", "Story", "<p>I grew up above my parents' café in Whitby and started photographing the fishermen who came in for breakfast. Twenty years later I still mostly photograph people at work around food.</p><p>Clients include magazines, restaurants and the occasional family who wants a long lunch remembered properly.</p>"),
    image("photo", "Portrait"),
    text("photo_alt", "Portrait description", "Vera Hollis holding a medium format camera on a harbour wall"),
    ...motion(),
    scheme("site"),
    ...spacing(32, 96),
  ],
  blocks: [{ type: "fact", name: "Detail", settings: [text("label", "Label", "Based in"), text("value", "Value", "Newcastle")] }],
  presetBlocks: [
    { type: "fact", settings: { label: "Based in", value: "Newcastle upon Tyne" } },
    { type: "fact", settings: { label: "Shoots", value: "Film and digital" } },
    { type: "fact", settings: { label: "Languages", value: "English, Italian" } },
  ],
  maxBlocks: 6,
})

export const contact = defineSection({
  type: "ai_pf_contact",
  name: "Contact",
  summary: "Contact page: a booking enquiry form with date and kind of work, beside the ways to reach the photographer.",
  template: `
<section class="pfx" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="pfx__grid">
    <div><h1 class="pfx__h">{{ settings.heading }}</h1><div class="pfx__text">{{ settings.text | raw }}</div><dl class="pfx__ways">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{% if block.settings.link %}<a href="{{ block.settings.link | url }}">{{ block.settings.value }}</a>{% else %}{{ block.settings.value }}{% endif %}</dd></div>{% endfor %}</dl></div>
    <form class="pfx__form" data-storelib-form="contact">
      <label><span>{{ settings.name_label }}</span><input name="name" type="text" autocomplete="name" maxlength="120" required></label>
      <label><span>{{ settings.email_label }}</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <label><span>{{ settings.when_label }}</span><input name="subject" type="text" maxlength="150"></label>
      <label><span>{{ settings.message_label }}</span><textarea name="message" rows="5" maxlength="5000" required></textarea></label>
      <button type="submit">{{ settings.send_label }}</button>
    </form>
  </div>
</section>`,
  style: `
.pfx { ${BOX} }
.pfx__grid { display: grid; gap: 40px; }
.pfx__h { margin: 0; ${D} font-size: clamp(2.25rem, 1.2rem + 5cqi, 5rem); letter-spacing: -0.045em; line-height: 0.95; }
.pfx__text { max-width: 44ch; margin-top: 16px; line-height: 1.65; }
.pfx__ways { margin: 24px 0 0; ${SMALL} }
.pfx__ways div { display: grid; grid-template-columns: 7rem minmax(0, 1fr); padding: 10px 0; border-top: 1px solid var(--s-border); }
.pfx__ways dt { opacity: 0.6; }
.pfx__ways dd { margin: 0; }
.pfx__ways a { color: inherit; }
.pfx__form { display: grid; gap: 16px; align-content: start; }
.pfx__form label { display: grid; gap: 4px; ${SMALL} }
.pfx__form input, .pfx__form textarea { min-height: 46px; padding: 8px 0; border: 0; border-bottom: 1px solid var(--s-text); background: none; color: inherit; font: inherit; font-size: 1rem; }
.pfx__form button { justify-self: start; min-height: 50px; padding: 0 24px; border: 0; background: var(--s-text); color: var(--s-bg); font: inherit; cursor: pointer; }
@container (min-width: 900px) { .pfx__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 64px; } }`,
  settings: [
    text("heading", "Heading", "Ask about a date"),
    richtext("text", "Words", "<p>Tell me the date, the place and what the pictures are for. I answer within two days.</p>"),
    text("name_label", "Name field", "Name"),
    text("email_label", "Email field", "Email"),
    text("when_label", "Date field", "Date and place"),
    text("message_label", "Message field", "What the pictures are for"),
    text("send_label", "Send button", "Send"),
    ...motion(),
    scheme("site"),
    ...spacing(32, 96),
  ],
  blocks: [{ type: "way", name: "Detail", settings: [text("label", "Label", "Email"), text("value", "Shown as", "studio@verahollis.com"), url("link", "Link", "mailto:studio@verahollis.com")] }],
  presetBlocks: [
    { type: "way", settings: { label: "Email", value: "studio@verahollis.com", link: "mailto:studio@verahollis.com" } },
    { type: "way", settings: { label: "Agent", value: "North Light Agency", link: "" } },
    { type: "way", settings: { label: "Based in", value: "Newcastle upon Tyne", link: "" } },
  ],
  maxBlocks: 6,
})

export const ALL = [header, trail, series, gallery, index, strip, places, statement, prints, commission, contactBand, footer, product, collection, about, contact]
