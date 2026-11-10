/**
 * PRESSURE: a personal trainer or performance coach.
 *
 * Night gym energy: near black ground, one acid accent, huge condensed caps
 * stacked in the first screen over hard lit training photography, session
 * facts as a stat strip in condensed numerals, "who it is for and who it is
 * not for" as two honest lists, the method as a sticky story, session
 * formats as an index whose photo follows the hovered row, coaching from
 * the store's own products, a booking section on the creator's booking
 * form. Original work for Storelib (round P, P2a).
 */
import { assemble } from "../kit/build"
import { footer, header } from "../kit/chrome"
import { BOX, DISPLAY, INNER, motion, place, rootAttrs, s, spacing, type ComponentDef } from "../kit/schema"
import { collage, collectionGrid, contact, cta, faq, marquee, pageIntro, productMain, productRail, reveal, statement, stickySteps } from "../kit/sections"
import type { SiteTemplate } from "../types"

const P = "ai_pc_"

const SKIN = `
.hd { --hd-h: 68px; }
.hd__logo { font-weight: 800; text-transform: uppercase; letter-spacing: 0.01em; font-size: 1.625rem; }
.hd__top, .hd__tool { text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.8125rem; font-weight: 600; }
.hd__mlink, .hd__msum { text-transform: uppercase; font-weight: 800; }
.hd__count { color: var(--s-bg); }
`

const hero: ComponentDef = {
  type: `${P}hero`,
  name: "Opening, photo and stacked headline",
  category: "hero",
  template: `
<section class="ph" ${rootAttrs({ motion: true })}>
  <div class="ph__media" data-storelib-motion="parallax-depth" data-motion-strength="{{ settings.motion_strength }}">
    {% if settings.image %}
    <picture>
      {% if settings.image_mobile %}<source media="(max-width: 699px)" srcset="{{ settings.image_mobile | asset }}">{% endif %}
      <img class="ph__img" src="{{ settings.image | asset }}" alt="{{ settings.image_alt }}" width="2000" height="1250" fetchpriority="high" style="object-position: {{ settings.focus }};">
    </picture>
    {% else %}
    <span class="ph__field" aria-hidden="true"></span>
    {% endif %}
  </div>
  <div class="ph__in">
    <h1 class="ph__h" data-storelib-motion="reveal-stagger">
      {% for block in section.blocks %}{% if block.type == "line" %}<span class="ph__line{% if block.settings.accent %} ph__line--accent{% endif %}" {{ block.shopify_attributes }}><span class="ph__word">{{ block.settings.text }}</span></span>{% endif %}{% endfor %}
    </h1>
    <div class="ph__foot">
      <div class="ph__copy">{{ settings.text | raw }}</div>
      <div class="ph__actions">
        <a class="ph__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
        {% if settings.cta2_label %}<a class="ph__link" href="{{ settings.cta2_url | url }}">{{ settings.cta2_label }}</a>{% endif %}
      </div>
      <dl class="ph__facts">
        {% for block in section.blocks %}{% if block.type == "fact" %}<div class="ph__fact" {{ block.shopify_attributes }}><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endif %}{% endfor %}
      </dl>
    </div>
  </div>
</section>`,
  style: `
.ph { position: relative; isolation: isolate; display: grid; min-height: min(calc(100svh - 104px), 860px); padding: calc(var(--s-pt) * var(--theme-spacing-scale, 1)) var(--theme-padding-x, 20px) calc(var(--s-pb) * var(--theme-spacing-scale, 1)); background: var(--s-bg); color: var(--s-text); overflow: hidden; container-type: inline-size; }
.ph__media { position: absolute; inset: 0; z-index: -1; }
.ph__media picture, .ph__img { display: block; width: 100%; height: 100%; }
.ph__img { object-fit: cover; filter: grayscale(0.35) contrast(1.1); }
.ph__media::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, var(--s-bg) 8%, transparent 62%), linear-gradient(to right, var(--s-bg), transparent 70%); opacity: 0.92; }
.ph__field { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), var(--s-border) calc(25% - 1px) 25%); }
.ph__field::before { content: ""; position: absolute; right: -10%; top: 12%; width: 70%; height: 46%; background: var(--s-accent); transform: skewY(-8deg); opacity: 0.9; }
.ph__in { align-self: end; display: grid; gap: clamp(20px, 4vw, 40px); width: 100%; ${INNER} }
.ph__h { margin: 0; ${DISPLAY} font-size: clamp(4.25rem, 21cqi, 15rem); line-height: 0.8; letter-spacing: -0.01em; text-transform: uppercase; font-weight: 800; }
.ph__line { display: block; overflow: hidden; padding-top: 0.04em; }
.ph__word { display: inline-block; }
.ph__line--accent { color: var(--s-accent); }
.ph__foot { display: grid; gap: 20px; }
.ph__copy { max-width: 34rem; font-size: 1.125rem; line-height: 1.55; }
.ph__copy p { margin: 0; }
.ph__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; }
.ph__btn { display: inline-flex; align-items: center; min-height: 56px; padding: 0 28px; background: var(--s-btn); color: var(--s-btn-text); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; text-decoration: none; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease), background-color var(--t-motion-hover, 200ms) ease; }
.ph__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.ph__btn:active { transform: translateY(1px); }
.ph__link { display: inline-flex; align-items: center; min-height: 44px; color: inherit; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; text-underline-offset: 6px; }
.ph__facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 8px 0 0; border-top: 1px solid var(--s-border); }
.ph__fact { padding: 14px 12px 0 0; }
.ph__fact dt { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--s-muted); }
.ph__fact dd { margin: 4px 0 0; ${DISPLAY} font-size: clamp(1.25rem, 4.5cqi, 2.25rem); line-height: 1; text-transform: uppercase; font-weight: 700; font-variant-numeric: tabular-nums; }
@container (min-width: 900px) {
  .ph__foot { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: end; column-gap: 48px; }
  .ph__facts { grid-column: 2; grid-row: 1 / span 2; }
}
@media (prefers-reduced-motion: no-preference) {
  .ph:not([data-motion="off"]) .ph__word { animation: ai_pc_hero_rise var(--t-motion-duration, 650ms) var(--t-motion-ease, cubic-bezier(0.2, 0.7, 0.1, 1)) both; }
  .ph:not([data-motion="off"]) .ph__line:nth-child(2) .ph__word { animation-delay: calc(var(--t-motion-stagger, 65ms) * 1); }
  .ph:not([data-motion="off"]) .ph__line:nth-child(3) .ph__word { animation-delay: calc(var(--t-motion-stagger, 65ms) * 2); }
  .ph:not([data-motion="off"]) .ph__line:nth-child(4) .ph__word { animation-delay: calc(var(--t-motion-stagger, 65ms) * 3); }
  @keyframes ai_pc_hero_rise { from { transform: translateY(calc(105% * var(--m-k, 1))); } }
}
@supports (animation-timeline: scroll()) {
  @media (prefers-reduced-motion: no-preference) {
    .ph:not([data-motion="off"]) .ph__img { animation: ai_pc_hero_drift linear both; animation-timeline: view(); animation-range: exit 0% exit 100%; }
    @keyframes ai_pc_hero_drift { to { transform: scale(calc(1 + (var(--t-motion-scale, 1.06) - 1) * var(--m-k, 1))) translateY(calc(var(--t-motion-parallax, 6%) * var(--m-k, 1))); } }
  }
}`,
  settings: [
    s.rich("text", "Text", "<p>One to one strength coaching for people with full weeks. A plan written for you, sessions that count, and a check in every Friday.</p>"),
    s.text("cta_label", "Button", "Book a consultation"),
    s.url("cta_url", "Button link", "/contact"),
    s.text("cta2_label", "Second link", "See the coaching"),
    s.url("cta2_url", "Second link goes to", "/products"),
    s.header("hdr_photo", "Photo"),
    s.image("image", "Photo"),
    s.image("image_mobile", "Photo on phones (taller crop)"),
    s.text("image_alt", "Photo description", ""),
    s.select("focus", "Photo focus", "center", [
      ["center", "Centre"],
      ["left center", "Left"],
      ["right center", "Right"],
      ["center top", "Top"],
    ]),
    s.scheme("site"),
    ...motion(),
    ...spacing(120, 48),
  ],
  blocks: [
    { type: "line", name: "Headline line", limit: 4, settings: [s.text("text", "Words", "Lift"), s.check("accent", "In the accent colour", false)] },
    { type: "fact", name: "Session fact", limit: 3, settings: [s.text("label", "Label", "Session"), s.text("value", "Value", "60 minutes")] },
  ],
  maxBlocks: 7,
  preset: [
    { type: "line", settings: { text: "Lift", accent: false } },
    { type: "line", settings: { text: "with", accent: false } },
    { type: "line", settings: { text: "intent", accent: true } },
    { type: "fact", settings: { label: "Session", value: "60 minutes" } },
    { type: "fact", settings: { label: "Where", value: "Gym or online" } },
    { type: "fact", settings: { label: "Start", value: "Any Monday" } },
  ],
}

const coach: ComponentDef = {
  type: `${P}coach`,
  name: "The coach",
  category: "text",
  template: `
<section class="co" ${rootAttrs({ motion: true })}>
  <div class="co__in">
    <figure class="co__photo" data-storelib-motion="3d-tilt">
      {% if settings.image %}<img src="{{ settings.image | asset }}" alt="{{ settings.image_alt }}" width="1000" height="1250" loading="lazy">{% else %}<span class="co__stand" aria-hidden="true">{{ settings.name }}</span>{% endif %}
      {% if settings.name %}<figcaption class="co__name">{{ settings.name }}</figcaption>{% endif %}
    </figure>
    <div class="co__words">
      <h2 class="co__h">{{ settings.heading | raw }}</h2>
      <div class="co__story">{{ settings.story | raw }}</div>
      <ul class="co__list">
        {% for block in section.blocks %}<li class="co__item" {{ block.shopify_attributes }}><span class="co__item-title">{{ block.settings.title }}</span><span class="co__item-text">{{ block.settings.text }}</span></li>{% endfor %}
      </ul>
      {% if settings.link_label %}<a class="co__link" href="{{ settings.link_url | url }}">{{ settings.link_label }}</a>{% endif %}
    </div>
  </div>
</section>`,
  style: `
.co { ${BOX} }
.co__in { display: grid; gap: clamp(28px, 5vw, 80px); ${INNER} }
.co__photo { position: relative; margin: 0; overflow: hidden; background: var(--s-surface); }
.co__photo img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; filter: grayscale(0.2); }
.co__stand { display: flex; align-items: flex-end; aspect-ratio: 4 / 5; padding: 24px; ${DISPLAY} font-size: clamp(3rem, 14cqi, 8rem); line-height: 0.82; text-transform: uppercase; font-weight: 800; color: var(--s-bg); background: var(--s-accent); overflow-wrap: anywhere; }
.co__name { position: absolute; left: 0; bottom: 0; padding: 10px 14px; background: var(--s-accent); color: var(--s-bg); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.8125rem; }
.co__h { margin: 0 0 20px; ${DISPLAY} font-size: clamp(2.5rem, 1.2rem + 6cqi, 6rem); line-height: 0.86; text-transform: uppercase; font-weight: 800; }
.co__story { max-width: 36rem; font-size: 1.125rem; line-height: 1.6; }
.co__story p { margin: 0 0 12px; }
.co__list { display: grid; margin: 28px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.co__item { display: grid; gap: 4px; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.co__item-title { ${DISPLAY} font-size: 1.5rem; line-height: 1; text-transform: uppercase; font-weight: 700; }
.co__item-text { color: var(--s-muted); line-height: 1.5; }
.co__link { display: inline-flex; align-items: center; min-height: 44px; margin-top: 20px; color: var(--s-accent); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; text-underline-offset: 6px; }
@container (min-width: 900px) {
  .co__in { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); align-items: center; }
  .co__item { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); align-items: baseline; }
}
${reveal(".co", ".co__item", "ai_pc_coach_in")}`,
  settings: [
    s.inline("heading", "Heading", "Coached by someone who still trains"),
    s.rich("story", "Story", "<p>I started coaching after years of training on my own and getting it wrong. Every client gets the plan I wish I had then: simple lifts, honest numbers, and someone who notices when your week falls apart.</p>"),
    s.text("name", "Name on the photo", ""),
    s.image("image", "Portrait"),
    s.text("image_alt", "Portrait description", ""),
    s.text("link_label", "Link", "The full story"),
    s.url("link_url", "Link goes to", "/about"),
    s.scheme("site"),
    ...motion(),
    ...spacing(120, 120),
  ],
  blocks: [{ type: "principle", name: "Principle", limit: 5, settings: [s.text("title", "Title", "Form before load"), s.text("text", "Text", "We add weight once the movement is right.")] }],
  maxBlocks: 5,
  preset: [
    { type: "principle", settings: { title: "Form before load", text: "Weight goes on the bar once the movement is right, never before." } },
    { type: "principle", settings: { title: "Plans for real weeks", text: "Three sessions or two, written around your work and your family." } },
    { type: "principle", settings: { title: "Numbers you can see", text: "Every lift logged, so progress is a fact and not a feeling." } },
  ],
}

const fit: ComponentDef = {
  type: `${P}fit`,
  name: "Who it is for, and who it is not for",
  category: "text",
  template: `
<section class="fi" ${rootAttrs({ motion: true })}>
  <div class="fi__in">
    <h2 class="fi__h">{{ settings.heading | raw }}</h2>
    <div class="fi__cols">
      <div class="fi__col fi__col--yes">
        <h3 class="fi__sub">{{ settings.yes_heading }}</h3>
        <ul class="fi__list">{% for block in section.blocks %}{% if block.type == "yes" %}<li class="fi__item" {{ block.shopify_attributes }}>{{ block.settings.text }}</li>{% endif %}{% endfor %}</ul>
      </div>
      <div class="fi__col fi__col--no">
        <h3 class="fi__sub">{{ settings.no_heading }}</h3>
        <ul class="fi__list">{% for block in section.blocks %}{% if block.type == "no" %}<li class="fi__item" {{ block.shopify_attributes }}>{{ block.settings.text }}</li>{% endif %}{% endfor %}</ul>
      </div>
    </div>
  </div>
</section>`,
  style: `
.fi { ${BOX} }
.fi__in { ${INNER} }
.fi__h { margin: 0 0 clamp(28px, 5vw, 64px); max-width: 14ch; ${DISPLAY} font-size: clamp(2.5rem, 1.2rem + 6cqi, 6.5rem); line-height: 0.86; text-transform: uppercase; font-weight: 800; }
.fi__cols { display: grid; gap: 12px; }
.fi__col { padding: clamp(20px, 3vw, 36px); border: 1px solid var(--s-border); }
.fi__col--yes { background: var(--s-accent); color: var(--s-bg); border-color: var(--s-accent); }
.fi__sub { margin: 0 0 16px; ${DISPLAY} color: inherit; font-size: 1.75rem; line-height: 1; text-transform: uppercase; font-weight: 800; }
.fi__list { margin: 0; padding: 0; list-style: none; }
.fi__item { padding: 12px 0; border-top: 1px solid currentColor; font-size: 1.0625rem; line-height: 1.45; }
.fi__col--no .fi__item { color: var(--s-muted); border-color: var(--s-border); }
@container (min-width: 860px) { .fi__cols { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); } }
${reveal(".fi", ".fi__item", "ai_pc_fit_in")}`,
  settings: [s.inline("heading", "Heading", "Who this is for"), s.text("yes_heading", "For you if", "For you if"), s.text("no_heading", "Not for you if", "Not for you if"), s.scheme("site"), ...motion(), ...spacing(112, 112)],
  blocks: [
    { type: "yes", name: "For you if", limit: 6, settings: [s.text("text", "Text", "You want to get strong and stay that way")] },
    { type: "no", name: "Not for you if", limit: 6, settings: [s.text("text", "Text", "You want a crash plan for a holiday")] },
  ],
  maxBlocks: 12,
  preset: [
    { type: "yes", settings: { text: "You want to get strong and stay that way, not for one summer" } },
    { type: "yes", settings: { text: "You have tried apps and classes and lost the thread" } },
    { type: "yes", settings: { text: "You are coming back after an injury or a long break" } },
    { type: "yes", settings: { text: "You can give it two or three hours a week" } },
    { type: "no", settings: { text: "You want a six week crash plan" } },
    { type: "no", settings: { text: "You would rather not log what you lift" } },
    { type: "no", settings: { text: "You need medical rehab: see a physio first and bring their notes" } },
  ],
}

const formats: ComponentDef = {
  type: `${P}formats`,
  name: "Ways to train, as an index",
  category: "text",
  template: `
<section class="fm" ${rootAttrs({ motion: true })}>
  <div class="fm__in">
    <div class="fm__head"><h2 class="fm__h">{{ settings.heading | raw }}</h2><div class="fm__text">{{ settings.text | raw }}</div></div>
    <ul class="fm__list" data-storelib-motion="cursor-follow">
      {% for block in section.blocks %}
      <li class="fm__row" {{ block.shopify_attributes }}>
        <a class="fm__link" href="{{ block.settings.url | url }}">
          <span class="fm__name">{{ block.settings.name }}</span>
          <span class="fm__meta">{{ block.settings.meta }}</span>
          <span class="fm__detail">{{ block.settings.detail }}</span>
          {% if block.settings.image %}<img class="fm__img" src="{{ block.settings.image | asset }}" alt="{{ block.settings.image_alt }}" width="640" height="800" loading="lazy">{% endif %}
        </a>
      </li>
      {% endfor %}
    </ul>
  </div>
</section>`,
  style: `
.fm { ${BOX} }
.fm__in { ${INNER} }
.fm__head { display: grid; gap: 12px; margin-bottom: clamp(24px, 4vw, 48px); }
.fm__h { margin: 0; ${DISPLAY} font-size: clamp(2.25rem, 1.2rem + 5cqi, 5.5rem); line-height: 0.88; text-transform: uppercase; font-weight: 800; }
.fm__text { max-width: 34rem; color: var(--s-muted); line-height: 1.6; }
.fm__text p { margin: 0; }
.fm__list { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.fm__row { border-bottom: 1px solid var(--s-border); }
.fm__link { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 16px; padding: clamp(18px, 3vw, 28px) 0; color: inherit; text-decoration: none; }
.fm__name { ${DISPLAY} font-size: clamp(2rem, 8cqi, 5.5rem); line-height: 0.9; text-transform: uppercase; font-weight: 800; transition: color var(--t-motion-hover, 200ms) ease, transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.fm__meta { align-self: center; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--s-accent); text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.875rem; }
.fm__detail { grid-column: 1 / -1; max-width: 40rem; color: var(--s-muted); line-height: 1.5; }
.fm__img { grid-column: 1 / -1; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; margin-top: 10px; }
@container (min-width: 960px) {
  .fm__link { grid-template-columns: minmax(0, 6fr) minmax(0, 2fr) minmax(0, 4fr); align-items: center; }
  .fm__detail { grid-column: auto; }
  .fm__img { position: absolute; right: 4%; top: 50%; z-index: 2; width: 220px; aspect-ratio: 4 / 5; margin: 0; opacity: 0; pointer-events: none; transform: translateY(-50%) rotate(-3deg) scale(0.92); transition: opacity var(--t-motion-hover, 200ms) ease, transform var(--t-motion-duration, 450ms) var(--t-motion-ease, ease); }
}
@media (hover: hover) and (pointer: fine) {
  .fm__link:hover .fm__name, .fm__link:focus-visible .fm__name { color: var(--s-accent); transform: translateX(calc(12px * var(--m-k, 1))); }
  .fm__link:hover .fm__img, .fm__link:focus-visible .fm__img { opacity: 1; transform: translateY(-50%) rotate(-3deg); }
}
@media (prefers-reduced-motion: reduce) { .fm__name, .fm__img { transition: none; } }`,
  settings: [s.inline("heading", "Heading", "Three ways to train"), s.rich("text", "Text", "<p>Same plan, same standards. Pick the one that fits your week and your budget.</p>"), s.scheme("site"), ...motion(), ...spacing(112, 112)],
  blocks: [
    {
      type: "format",
      name: "Way to train",
      limit: 5,
      settings: [s.text("name", "Name", "One to one"), s.text("meta", "Short fact", "60 min"), s.text("detail", "Detail", "Every session coached, every rep watched."), s.url("url", "Link", "/products"), s.image("image", "Photo on hover"), s.text("image_alt", "Photo description", "")],
    },
  ],
  maxBlocks: 5,
  preset: [
    { type: "format", settings: { name: "One to one", meta: "60 min", detail: "Every session coached, every rep watched, the plan adjusted on the floor.", url: "/products", image: "", image_alt: "" } },
    { type: "format", settings: { name: "Pairs", meta: "60 min", detail: "Train with a partner or a friend and split the cost. Same plan, written for two.", url: "/products", image: "", image_alt: "" } },
    { type: "format", settings: { name: "Online", meta: "Weekly", detail: "Your plan in an app, video checks on your top sets, and a call every Friday.", url: "/products", image: "", image_alt: "" } },
  ],
}

const head = header({
  type: `${P}header`,
  layout: "split",
  drawer: "full",
  cart: "side",
  sticky: true,
  scheme: "site",
  words: { brand: "Coach", cart: "Bag", search: "Search", menu: "Menu" },
  notices: ["Book a consultation before your first session", "Training in the gym, outdoors or online"],
  features: [
    { title: "One to one coaching", text: "Every session coached", url: "/products" },
    { title: "How the first month runs", text: "From the consultation on", url: "/about" },
  ],
  skin: SKIN,
})

const foot = footer({
  type: `${P}footer`,
  layout: "wordmark",
  scheme: "site_inverse",
  words: { brand: "Coach", newsHeading: "One training note a week", newsText: "<p>A lift, a meal, a habit. Short, and only when it is useful.</p>", legal: "Coaching in person and online.", subscribe: "Sign up" },
  columns: [
    { heading: "Coaching", menu: "main-menu" },
    { heading: "Site", menu: "footer" },
  ],
  notes: [{ heading: "Sessions", text: "<p>Mornings and evenings, Monday to Saturday. Online clients anywhere.</p>" }],
  skin: `.ft__mark { text-transform: uppercase; font-weight: 800; letter-spacing: -0.01em; } .ft__h { text-transform: uppercase; font-weight: 800; }`,
})

const band = marquee({ type: `${P}band`, scheme: "site_inverse", items: ["Strength", "Conditioning", "Mobility", "Back after injury", "Online coaching"], speed: 30, skin: `.mq__item { text-transform: uppercase; font-weight: 800; } .mq__item:nth-child(even) { color: var(--s-accent); }` })

const method = stickySteps({
  type: `${P}method`,
  name: "The method",
  words: { heading: "How the first twelve weeks run", text: "<p>Nothing clever. A test, a plan, the work, and a weekly look at the numbers.</p>" },
  steps: [
    { title: "The consultation", text: "<p>An hour together: how you move, what hurts, what the next three months are for.</p>" },
    { title: "A plan for your week", text: "<p>Written for the days and the kit you really have, in your phone by Sunday night.</p>" },
    { title: "Sessions that count", text: "<p>Coached lifts, conditioning that fits, nothing done for the sake of looking busy.</p>" },
    { title: "Friday check in", text: "<p>Your top sets on video, a short call, next week's numbers.</p>" },
  ],
  skin: `.sp__h, .sp__title { text-transform: uppercase; font-weight: 800; } .sp__n { font-weight: 800; }`,
})

const offers = productRail({
  type: `${P}offers`,
  name: "Coaching from the shop",
  words: { heading: "Pick how you want to start", text: "<p>Every option starts with the consultation. Prices and what is included come from the shop.</p>", add: "Add to bag" },
  tiles: [{ title: "Not sure which?", text: "Book the consultation and decide after.", label: "Book a consultation", url: "/contact" }],
  count: 4,
  skin: `.pr__h, .pr__tile-title { text-transform: uppercase; font-weight: 800; } .pr__card-add { text-transform: uppercase; letter-spacing: 0.06em; }`,
})

const creed = statement({
  type: `${P}creed`,
  name: "What training here means",
  scheme: "site_inverse",
  lines: [
    { text: "Show up.", accent: false },
    { text: "Lift well.", accent: false },
    { text: "Write it down.", accent: false },
    { text: "Repeat.", accent: false },
  ],
  note: "<p>Strength is a skill you practise. Most weeks are ordinary, and ordinary weeks are where it is built.</p>",
  skin: `.st__lines { text-transform: uppercase; font-weight: 800; font-size: clamp(3rem, 1rem + 11cqi, 11rem); line-height: 0.82; }`,
})

const day = collage({
  type: `${P}day`,
  name: "A training day",
  words: { heading: "A day on the floor", text: "<p>Early sessions, chalk on everything, and a lot of writing things down.</p>" },
  photos: [
    { caption: "Warm up", size: "tall" },
    { caption: "Top set", size: "square" },
    { caption: "Notes", size: "square" },
    { caption: "Conditioning", size: "wide" },
    { caption: "Cool down", size: "square" },
  ],
  skin: `.cl__h { text-transform: uppercase; font-weight: 800; } .cl__cap { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; background: var(--s-accent); color: var(--s-bg); }`,
})

const questions = faq({
  type: `${P}faq`,
  words: { heading: "Before you book", text: "<p>The questions people ask in the first call.</p>" },
  items: [
    { q: "Do I need to be fit already?", a: "<p>No. The consultation finds where you are today and the plan starts there.</p>" },
    { q: "What should I bring?", a: "<p>Clothes you can move in, flat shoes, water. Everything else is in the gym.</p>" },
    { q: "I have an old injury. Can I still train?", a: "<p>Usually, yes. Tell me in the consultation and bring any notes from your physio.</p>" },
    { q: "Can I cancel a session?", a: "<p>Move it with a day's notice and it costs nothing. Later than that, the session counts.</p>" },
    { q: "Do you write meal plans?", a: "<p>No meal plans. We set a few simple food habits and check them on Fridays.</p>" },
  ],
  skin: `.fq__h { text-transform: uppercase; font-weight: 800; }`,
})

const book = contact({
  type: `${P}book`,
  name: "Book the consultation",
  scheme: "site",
  words: { heading: "Book the consultation", text: "<p>Pick a time, tell me what you are training for, and I will reply within a working day with what happens next.</p>", name: "Your name", email: "Your email", message: "What are you training for?", send: "Send" },
  details: [
    { label: "Where", value: "In the gym, outdoors or online", url: "" },
    { label: "When", value: "Mornings and evenings, Monday to Saturday", url: "" },
    { label: "Reply", value: "Within one working day", url: "" },
  ],
  skin: `.ct__h { text-transform: uppercase; font-weight: 800; } .ct__send { text-transform: uppercase; letter-spacing: 0.06em; }`,
})

const close = cta({
  type: `${P}close`,
  scheme: "site_inverse",
  words: { heading: "Start on Monday", text: "<p>The consultation is an hour. You leave with a plan either way.</p>" },
  actions: [
    { label: "Book a consultation", url: "/contact", style: "solid" },
    { label: "See the coaching", url: "/products", style: "line" },
  ],
  skin: `.cc__h { text-transform: uppercase; font-weight: 800; } .cc__btn { text-transform: uppercase; letter-spacing: 0.06em; }`,
})

const intro = pageIntro({
  type: `${P}intro`,
  words: { heading: "About the coach", text: "<p>Strength coaching for people who have a lot going on and still want to train properly.</p>" },
  facts: [
    { label: "Coaching", value: "One to one, pairs, online" },
    { label: "Sessions", value: "Monday to Saturday" },
  ],
  skin: `.pi__h { text-transform: uppercase; font-weight: 800; }`,
})

const product = productMain({
  type: `${P}product`,
  words: { kicker: "Coaching", add: "Add to bag", buy: "Buy now", options: "Choose an option" },
  details: [
    { title: "What happens after you buy", text: "<p>You get an email to book the consultation. The first session follows within a week.</p>" },
    { title: "Where we train", text: "<p>In the gym, outdoors, or online with video checks.</p>" },
    { title: "Changing your mind", text: "<p>Unused sessions can be moved or refunded. Write and say which.</p>" },
  ],
  skin: `.pd__title, .pd__stand-word { text-transform: uppercase; font-weight: 800; } .pd__add, .pd__buy { text-transform: uppercase; letter-spacing: 0.06em; }`,
})

const list = collectionGrid({
  type: `${P}list`,
  words: { heading: "Coaching", intro: "<p>Every way to train, from a single session to a twelve week block.</p>", results: "Results for", empty: "Nothing here yet. Try the whole shop.", add: "Add to bag" },
  notes: ["Starts with a consultation", "Gym or online", "Move a session with a day's notice"],
  columns: 3,
  skin: `.cg__h, .cg__card-stand { text-transform: uppercase; font-weight: 800; }`,
})

const components = [head, foot, hero, band, coach, fit, method, offers, creed, day, formats, questions, book, close, intro, product, list]

const H = place(head, "pc-header", { group: "header" })
const F = place(foot, "pc-footer", { group: "footer" })

export const pressure: SiteTemplate = assemble({
  id: "pressure-coaching",
  name: "Pressure",
  summary: "Personal trainer or performance coach: night gym energy, stacked condensed caps over training photography, honest fit lists, a sticky method and booking on the real form.",
  industries: ["fitness", "outdoor"],
  stories: ["fitness-coach"],
  styles: ["fitness", "industrial", "typography-led"],
  directionIds: ["bold-performance", "training-ground"],
  keywords: ["personal trainer", "coach", "strength", "gym", "performance", "athlete", "boxing", "running coach", "online coaching"],
  motion: "expressive",
  prefix: "pc",
  components,
  header: H,
  footer: F,
  tokens: {
    colors: { background: "#0b0c0c", surface: "#161818", text: "#f2f3ef", muted: "#a5a9a2", accent: "#c8ff2e", accentText: "#0b0c0c", border: "#2b2e2c", inverse: { background: "#c8ff2e", text: "#0b0c0c", accent: "#0b0c0c" } },
    fonts: { heading: "Saira Condensed", body: "Barlow", accent: "Saira Condensed" },
    typeScale: { base: 17, ratio: 1.5 },
    radius: { small: 0, medium: 0, large: 0 },
    spacing: { scale: 1, sectionY: 112, pageWidth: 1440, gutter: 20 },
    motion: { level: "expressive", tier: "expressive" },
    shadow: "none",
  },
  menus: {
    "main-menu": {
      title: "Main menu",
      links: [
        { title: "Coaching", url: "/products", links: [{ title: "All coaching", url: "/products" }, { title: "How it works", url: "/about" }, { title: "Book a consultation", url: "/contact" }] },
        { title: "About", url: "/about" },
        { title: "Contact", url: "/contact" },
      ],
    },
    footer: { title: "Footer", links: [{ title: "Shop", url: "/products" }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Search", url: "/search" }] },
  },
  pages: [
    {
      key: "home",
      title: "Home",
      sections: [
        place(hero, "pc-hero"),
        place(band, "pc-band"),
        place(coach, "pc-coach"),
        place(fit, "pc-fit"),
        place(method, "pc-method"),
        place(offers, "pc-offers"),
        place(creed, "pc-creed"),
        place(formats, "pc-formats"),
        place(day, "pc-day"),
        place(questions, "pc-faq"),
        place(book, "pc-book"),
        place(close, "pc-close"),
      ],
    },
    {
      key: "about",
      title: "About",
      seo: { title: "About the coach", description: "Who coaches you, how the first twelve weeks run and what training here is like." },
      sections: [
        place(intro, "pc-about-intro"),
        place(coach, "pc-about-coach", { settings: { heading: "Why I coach", link_label: "" } }),
        place(creed, "pc-about-creed"),
        place(method, "pc-about-method"),
        place(fit, "pc-about-fit"),
        place(close, "pc-about-close"),
      ],
    },
    {
      key: "contact",
      title: "Contact",
      seo: { title: "Book a consultation", description: "Book the first hour: how you move, what you are training for, and a plan either way." },
      sections: [place(intro, "pc-contact-intro", { settings: { heading: "Book the first hour", align: "center" }, blocks: [{ type: "fact", settings: { label: "Reply", value: "Within one working day" } }] }), place(book, "pc-contact-book", { settings: { heading: "Send a message" } }), place(questions, "pc-contact-faq"), place(close, "pc-contact-close")],
    },
    { key: "product", title: "Product", sections: [place(product, "pc-product"), place(fit, "pc-product-fit"), place(offers, "pc-product-more", { settings: { heading: "Other ways to start" } })] },
    { key: "collection", title: "Collection", sections: [place(list, "pc-collection"), place(close, "pc-collection-close")] },
    { key: "products", title: "Shop", sections: [place(list, "pc-shop", { settings: { heading: "All coaching" } }), place(questions, "pc-shop-faq")] },
    { key: "search", title: "Search", sections: [place(list, "pc-search", { settings: { heading: "Search" } })] },
  ],
  imageSlots: [
    { key: "hero", style: "photo", aspect: "16:9", prompt: "A personal trainer coaching a client through a heavy barbell squat in a dim industrial gym, hard side light, chalk dust in the air, documentary photograph, real people, no logos, no text", alt: "A coach spotting a client's barbell squat in a dark gym", targets: [{ page: "home", section: "pc-hero", setting: "image" }] },
    { key: "hero-mobile", style: "photo", aspect: "4:5", prompt: "The same gym scene framed tall for a phone: the client mid squat, the coach beside them, hard side light, documentary photograph, no text", alt: "A client mid squat with the coach beside them", targets: [{ page: "home", section: "pc-hero", setting: "image_mobile" }] },
    { key: "coach", style: "portrait", aspect: "4:5", prompt: "Portrait of a personal trainer standing in their gym between sessions, arms relaxed, natural expression, side light from a roller door, documentary portrait, no logos", alt: "Portrait of the coach in the gym", targets: [{ page: "home", section: "pc-coach", setting: "image" }, { page: "about", section: "pc-about-coach", setting: "image" }] },
    { key: "format-1", style: "photo", aspect: "4:5", prompt: "One to one coaching: a trainer correcting a client's deadlift setup, close crop on hands and bar, gym light", alt: "A coach adjusting a client's grip on the bar", targets: [{ page: "home", section: "pc-formats", block: "pc-formats-1", setting: "image" }] },
    { key: "format-2", style: "photo", aspect: "4:5", prompt: "Two friends training together with kettlebells under a coach's eye, candid, gym light", alt: "Two people training together with kettlebells", targets: [{ page: "home", section: "pc-formats", block: "pc-formats-2", setting: "image" }] },
    { key: "format-3", style: "photo", aspect: "4:5", prompt: "A person training at home with a phone propped up recording their set, natural window light, candid", alt: "Someone filming a set at home for an online check in", targets: [{ page: "home", section: "pc-formats", block: "pc-formats-3", setting: "image" }] },
    { key: "day-1", style: "photo", aspect: "3:4", prompt: "Early morning gym warm up, a client on a rower, low sun through a high window, documentary", alt: "A warm up on the rower in early light", targets: [{ page: "home", section: "pc-day", block: "pc-day-1", setting: "image" }] },
    { key: "day-2", style: "photo", aspect: "1:1", prompt: "Close up of chalked hands gripping a loaded barbell, shallow depth of field", alt: "Chalked hands on a barbell", targets: [{ page: "home", section: "pc-day", block: "pc-day-2", setting: "image" }] },
    { key: "day-3", style: "photo", aspect: "1:1", prompt: "A training notebook with handwritten sets and reps on a gym bench next to a water bottle", alt: "A notebook of sets and reps on a bench", targets: [{ page: "home", section: "pc-day", block: "pc-day-3", setting: "image" }] },
    { key: "day-4", style: "photo", aspect: "16:9", prompt: "Wide shot of sled pushes on gym turf, motion blur on the athlete, industrial gym", alt: "A sled push across the gym floor", targets: [{ page: "home", section: "pc-day", block: "pc-day-4", setting: "image" }] },
    { key: "day-5", style: "photo", aspect: "1:1", prompt: "A client stretching on a mat after a session, calm, soft side light", alt: "Stretching on a mat after a session", targets: [{ page: "home", section: "pc-day", block: "pc-day-5", setting: "image" }] },
    { key: "about", style: "photo", aspect: "4:3", prompt: "The empty gym at night, racks and plates, one light on, moody documentary photograph", alt: "The gym at night with one light on", targets: [{ page: "about", section: "pc-about-intro", setting: "image" }] },
  ],
  bindings: [
    { page: "home", section: "pc-offers", setting: "products", kind: "products", why: "The coaching packages from the shop, the recommended one first. Empty shows the newest products." },
    { page: "home", section: "pc-book", setting: "form", kind: "form", why: "The creator's booking form (a form with booking). Without one the section sends a contact message." },
    { page: "contact", section: "pc-contact-book", setting: "form", kind: "form", why: "The booking or contact form." },
    { page: "home", section: "pc-header", setting: "menu", kind: "menu", why: "The main menu: every page is linked from it or the footer." },
  ],
  design: {
    thesis: "Near black ground, stacked condensed capitals three lines tall over a hard lit training photo, one acid accent, the booking button always in reach.",
    layout: ["The headline stacks one or two words a line and fills the width", "Session facts as a stat strip in condensed numerals", "Who it is for and who it is not as two unequal panels", "Ways to train as an index whose photo follows the hovered row", "Inverse bands (the running band, the statement, the closing call) change the tempo"],
    imagery: "Real training in a real gym: hard side light, chalk, effort, tight crops; no stock smiles, no renders, no before and after photos.",
    motion: "Headline lines rise out of a mask once; the hero photo drifts as you scroll away; the index photo follows the row; buttons snap.",
    signature: ["stacked condensed headline", "stat strip", "for you / not for you panels", "hover index with photo", "outlined running band"],
    avoid: ["italic display serif", "cream background", "transformation photos", "invented client counts or testimonials"],
  },
})
