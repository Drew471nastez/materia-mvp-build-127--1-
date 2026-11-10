/**
 * TEMPLATE j, "Floor": an online course with a coach behind it (the sample
 * is a six week public speaking course). Built to convert without lying:
 * outcomes in plain words, the full curriculum, the coach, real reviews
 * from Storelib Reviews only (nothing when there are none), prices from the
 * real course products with Buy now links. A characterful grotesk, a bright
 * green for the one action, a deep green band for contrast.
 */
import {
  BOX, cartPanel, chromeVars, chromeWords, defineSection, image, menu, motion, panelCss, prefs, productList, range, revealCss, richtext, scheme, searchPanel, spacing, text, textarea, url, vars,
} from "../kit-b"

const D = "font-family: var(--theme-font-heading), sans-serif; color: var(--s-heading); font-weight: 700;"
const SMALL = "font-size: 0.875rem;"

export const header = defineSection({
  type: "ai_cc_header",
  name: "Header",
  kind: "header",
  summary: "A thin line with the next start date above a header with the course name, the menu, search, cart and an Enrol button; the menu opens as a side sheet with language and currency.",
  template: `
<header class="ccn" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  {% if settings.notice %}<p class="ccn__notice">{% if settings.notice_url %}<a href="{{ settings.notice_url | url }}">{{ settings.notice }}</a>{% else %}{{ settings.notice }}{% endif %}</p>{% endif %}
  <div class="ccn__bar">
    <a class="ccn__logo" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" width="{{ settings.logo_width }}" height="32">{% else %}{{ shop.name | default: settings.brand }}{% endif %}</a>
    <nav class="ccn__nav" aria-label="{{ settings.nav_label }}">{% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}</nav>
    <div class="ccn__tools">
      <button class="ccn__tool" type="button" data-storelib-search aria-label="{{ settings.search_label }}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2"/></svg></button>
      <button class="ccn__tool" type="button" data-storelib-cart>{{ settings.cart_label }} <span class="ccn__count" data-storelib-cart-count></span></button>
      <a class="ccn__cta" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
      <button class="ccn__tool ccn__burger" type="button" popovertarget="ccn-d-{{ section.id }}">{{ settings.menu_label }}</button>
    </div>
  </div>
  <div class="ccn__sheet" id="ccn-d-{{ section.id }}" popover>
    <button class="ccn-x" type="button" popovertarget="ccn-d-{{ section.id }}" popovertargetaction="hide">{{ settings.close_label }}</button>
    <nav aria-label="{{ settings.nav_label }}"><ul class="ccn__list">{% for link in settings.menu.links %}<li><a class="ccn__link" href="{{ link.url }}">{{ link.title }}</a>{% if link.links.size > 0 %}<ul class="ccn__sub">{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>{% endif %}</li>{% endfor %}</ul></nav>
    <a class="ccn__cta ccn__cta--wide" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
    <a class="ccn__acct" href="{{ routes.account_url }}">{{ settings.account_label }}</a>
    <ul class="ccn__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{% if block.settings.url %}<a href="{{ block.settings.url | url }}">{{ block.settings.text }}</a>{% else %}{{ block.settings.text }}{% endif %}</li>{% endfor %}</ul>
    ${prefs("ccn")}
  </div>
  ${searchPanel("ccn")}
  ${cartPanel("ccn")}
</header>`,
  style: `
.ccn__notes { display: grid; gap: 4px; margin: 0 0 16px; padding: 0; list-style: none; font-size: 0.875rem; }
.ccn__notes a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; }
.ccn { position: sticky; top: 0; z-index: 30; background: var(--s-bg); color: var(--s-text); border-bottom: 1px solid var(--s-border); }
.ccn__notice { margin: 0; padding: 8px var(--theme-padding-x, 20px); background: var(--s-text); color: var(--s-bg); ${SMALL} text-align: center; }
.ccn__notice a { color: inherit; }
.ccn__bar { display: flex; align-items: center; gap: 16px; min-height: 64px; padding: 0 var(--theme-padding-x, 20px); }
.ccn__logo { margin-right: auto; ${D} font-size: 1.375rem; letter-spacing: -0.035em; text-decoration: none; }
.ccn__logo img { display: block; max-height: 32px; width: auto; height: auto; }
.ccn__nav { display: none; gap: 24px; }
.ccn__nav a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; text-decoration: none; }
.ccn__nav a:hover { text-decoration: underline; text-underline-offset: 6px; }
.ccn__tools { display: flex; align-items: center; gap: 4px; }
.ccn__tool { display: inline-flex; align-items: center; gap: 6px; min-width: 44px; min-height: 44px; justify-content: center; padding: 0 8px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.ccn__count:empty, .ccn__count[data-count="0"] { display: none; }
.ccn__count { min-width: 1.5em; padding: 0 5px; background: var(--s-accent); color: var(--s-text); text-align: center; font-size: 0.75rem; font-weight: 700; }
.ccn__cta { display: none; align-items: center; min-height: 44px; padding: 0 18px; background: var(--s-btn); color: var(--s-btn-text); font-weight: 700; text-decoration: none; }
.ccn__cta--wide { display: flex; justify-content: center; min-height: 54px; margin: 8px 0 14px; }
.ccn__sheet { inset: 0 0 0 auto; width: min(420px, 100%); height: 100%; max-height: none; margin: 0; padding: 18px 22px 28px; border: 0; background: var(--s-bg); color: var(--s-text); overflow-y: auto; }
.ccn__list { margin: 24px 0 12px; padding: 0; list-style: none; }
.ccn__link { display: block; padding: 10px 0; ${D} font-size: 2rem; letter-spacing: -0.035em; text-decoration: none; border-bottom: 1px solid var(--s-border); }
.ccn__sub { margin: 6px 0; padding: 0; list-style: none; }
.ccn__sub a { display: inline-flex; min-height: 40px; align-items: center; color: inherit; }
.ccn__acct { display: inline-flex; min-height: 44px; align-items: center; margin-bottom: 12px; color: inherit; }
.ccn :focus-visible { outline: 3px solid var(--s-accent); outline-offset: 2px; }
${panelCss("ccn", { cartFrom: "right", searchFrom: "top" })}
.ccn-search { box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08); }
@media (min-width: 960px) { .ccn__nav { display: flex; } .ccn__burger { display: none; } .ccn__cta { display: inline-flex; } }
@media (prefers-reduced-motion: no-preference) {
  .ccn__sheet { transition: transform var(--t-motion-duration, 650ms) var(--t-motion-ease, ease), display var(--t-motion-duration, 650ms) allow-discrete, overlay var(--t-motion-duration, 650ms) allow-discrete; transform: translateX(100%); }
  .ccn__sheet:popover-open { transform: none; }
  @starting-style { .ccn__sheet:popover-open { transform: translateX(100%); } }
}`,
  settings: [
    menu(),
    text("brand", "Name when there is no logo", "Floor"),
    range("logo_width", "Logo width", 60, 220, 4, 100, "px"),
    text("notice", "Line above the header (empty hides it)", "Next cohort starts Monday 2 March, 24 places"),
    url("notice_url", "Line goes to", "/products"),
    text("cta_label", "Button", "Enrol"),
    url("cta_url", "Button goes to", "/products"),
    text("account_label", "Account link", "Your lessons"),
    ...chromeWords({ search_placeholder: "Search lessons and questions" }),
    scheme("site"),
  ],
  blocks: [{ type: "note", name: "Line in the menu", settings: [text("text", "Words", "Next cohort: Monday 2 March"), url("url", "Link (optional)", "")] }],
  presetBlocks: [
    { type: "note", settings: { text: "Next cohort: Monday 2 March", url: "/products" } },
    { type: "note", settings: { text: "Ask Ana a question", url: "/contact" } },
  ],
  maxBlocks: 4,
})

export const hero = defineSection({
  type: "ai_cc_hero",
  name: "Course hero",
  summary: "What you will be able to do, in one line, the coach's photograph rising slower than the page (P3 parallax-depth), the next start date, the price and one Enrol action.",
  template: `
<section class="cch" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="cch__grid">
    <div class="cch__copy">
      <h1 class="cch__h">{{ settings.heading }}</h1>
      <div class="cch__intro">{{ settings.intro | raw }}</div>
      <div class="cch__actions"><a class="cch__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a><a class="cch__link" href="{{ settings.second_url | url }}">{{ settings.second_label }}</a></div>
      <dl class="cch__facts">{% for block in section.blocks %}<div data-block-id="{{ block.id }}"><dt>{{ block.settings.label }}</dt><dd>{{ block.settings.value }}</dd></div>{% endfor %}</dl>
    </div>
    {% if settings.photo %}<figure class="cch__fig" data-storelib-motion="parallax-depth" data-motion-intensity="30" data-motion-pointer="false">
      {% if settings.photo %}<img class="cch__img" data-motion-depth="0.2" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1200" height="1500" fetchpriority="high">{% endif %}
      {% if settings.caption %}<figcaption class="cch__cap">{{ settings.caption }}</figcaption>{% endif %}
    </figure>{% endif %}
  </div>
</section>`,
  style: `
.cch { ${BOX} }
.cch__grid { display: grid; gap: 32px; }
.cch__h { margin: 0; ${D} font-weight: 800; font-size: clamp(2.75rem, 1.4rem + 6cqi, 6.5rem); line-height: 0.92; letter-spacing: -0.045em; max-width: 13ch; }
.cch__intro { max-width: 44ch; margin-top: 20px; font-size: 1.1875rem; line-height: 1.5; }
.cch__intro p { margin: 0; }
.cch__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 22px; margin-top: 28px; }
.cch__btn { display: inline-flex; align-items: center; min-height: 56px; padding: 0 30px; background: var(--s-btn); color: var(--s-btn-text); font-weight: 700; font-size: 1.0625rem; text-decoration: none; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.cch__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); transform: translateY(calc(var(--t-motion-lift, 4px) * -1)); }
.cch__btn:active { transform: translateY(1px); }
.cch__link { display: inline-flex; min-height: 44px; align-items: center; color: inherit; font-weight: 600; text-underline-offset: 6px; }
.cch__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; margin: 34px 0 0; padding-top: 18px; border-top: 1px solid var(--s-border); }
.cch__facts dt { ${SMALL} opacity: 0.7; }
.cch__facts dd { margin: 2px 0 0; ${D} font-size: 1.25rem; letter-spacing: -0.02em; }
.cch__fig { position: relative; margin: 0; }
.cch__img { width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; }
.cch__cap { position: absolute; left: 12px; bottom: 12px; padding: 6px 10px; background: var(--s-bg); ${SMALL} }
@container (min-width: 900px) { .cch__grid { grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); align-items: center; gap: 56px; } .cch__facts { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: no-preference) {
  .cch:not([data-motion="off"]) .cch__copy > * { animation: cch-rise var(--t-motion-duration, 650ms) var(--t-motion-ease, ease) both; }
  .cch:not([data-motion="off"]) .cch__copy > :nth-child(2) { animation-delay: var(--t-motion-stagger, 65ms); }
  .cch:not([data-motion="off"]) .cch__copy > :nth-child(3) { animation-delay: calc(var(--t-motion-stagger, 65ms) * 2); }
  .cch:not([data-motion="off"]) .cch__img { animation: cch-open calc(var(--t-motion-duration, 650ms) * 1.4) var(--t-motion-ease, ease) both; }
}
@keyframes cch-rise { from { opacity: 0; transform: translateY(calc(var(--t-motion-distance, 24px) * var(--m-k, 1))); } }
@keyframes cch-open { from { clip-path: inset(100% 0 0 0); } to { clip-path: inset(0 0 0 0); } }`,
  settings: [
    text("heading", "Heading", "Say it out loud without your voice shaking"),
    richtext("intro", "Intro", "<p>Six weeks, twelve short lessons and four live practice rooms with a coach who used to be terrified too.</p>"),
    text("cta_label", "Button", "Enrol for March"),
    url("cta_url", "Button goes to", "/products"),
    text("second_label", "Second link", "See every lesson"),
    url("second_url", "Second link goes to", "#section-lessons"),
    image("photo", "Coach photograph"),
    text("photo_alt", "Photograph description", "The coach speaking to a small room, mid sentence, hands open"),
    text("caption", "Caption on the photograph", "Ana Ruiz, your coach"),
    ...motion(),
    scheme("site"),
    ...spacing(56, 96),
  ],
  blocks: [{ type: "fact", name: "Fact", settings: [text("label", "Label", "Starts"), text("value", "Value", "2 March")] }],
  presetBlocks: [
    { type: "fact", settings: { label: "Starts", value: "Monday 2 March" } },
    { type: "fact", settings: { label: "Length", value: "6 weeks" } },
    { type: "fact", settings: { label: "Each week", value: "About 2 hours" } },
    { type: "fact", settings: { label: "Places", value: "24 per cohort" } },
  ],
  maxBlocks: 4,
})

export const strip = defineSection({
  type: "ai_cc_strip",
  name: "Running line",
  summary: "A running line of short facts on the deep band (P3 marquee), pausing on hover; still and wrapped for reduced motion.",
  template: `
<section class="ccq" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars("--ccq-speed: {{ settings.speed }}s;")}" aria-label="{{ settings.label }}">
  <div class="ccq__track" data-storelib-motion="marquee" data-motion-reactive="40">
    <ul class="ccq__run" data-motion-track>{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.text }}</li>{% endfor %}</ul>
    <ul class="ccq__run" aria-hidden="true">{% for block in section.blocks %}<li>{{ block.settings.text }}</li>{% endfor %}</ul>
  </div>
</section>`,
  style: `
.ccq { ${BOX} overflow: hidden; }
.ccq__track { display: flex; width: max-content; }
.ccq__run { display: flex; flex: none; gap: 0; margin: 0; padding: 0; list-style: none; }
.ccq__run li { ${D} font-size: clamp(1.5rem, 1rem + 2.4cqi, 3rem); letter-spacing: -0.03em; white-space: nowrap; }
.ccq__run li::after { content: "+"; margin: 0 0.6em; color: var(--s-accent); }
@media (prefers-reduced-motion: reduce) { .ccq__track { width: auto; } .ccq__run { flex-wrap: wrap; } .ccq__run[aria-hidden="true"] { display: none; } .ccq__run li { white-space: normal; } }
@media (prefers-reduced-motion: no-preference) { .ccq:not([data-motion="off"]) .ccq__track { animation: ccq-run var(--ccq-speed, 40s) linear infinite; } .ccq:hover .ccq__track { animation-play-state: paused; } .ccq[data-motion="off"] .ccq__run[aria-hidden="true"] { display: none; } }
.ccq__track[data-motion-ready] { animation: none !important; }
.ccq__track[data-motion-ready] .ccq__run[aria-hidden="true"] { display: none; }
@keyframes ccq-run { to { transform: translateX(-50%); } }`,
  settings: [text("label", "What it lists (read aloud)", "About the course"), range("speed", "Seconds per loop", 15, 90, 5, 40, "s"), ...motion(), scheme("site_inverse"), ...spacing(22, 22)],
  blocks: [{ type: "item", name: "Item", settings: [text("text", "Words", "Live practice rooms")] }],
  presetBlocks: ["Live practice rooms", "Recordings you keep", "Feedback on every talk", "Small cohorts"].map((t) => ({ type: "item", settings: { text: t } })),
  maxBlocks: 8,
})

export const outcomes = defineSection({
  type: "ai_cc_outcomes",
  name: "Outcomes",
  summary: "What a student can do by the end, as large numbered statements rising in one after another (P3 reveal-stagger).",
  template: `
<section class="cco" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="cco__h">{{ settings.heading }}</h2>
  <ol class="cco__list" data-storelib-motion="reveal-stagger">
    {% for block in section.blocks %}<li class="cco__item" data-block-id="{{ block.id }}"><span class="cco__n">{{ forloop.index }}</span><p class="cco__line">{{ block.settings.outcome }}</p><p class="cco__how">{{ block.settings.how }}</p></li>{% endfor %}
  </ol>
</section>`,
  style: `
.cco { ${BOX} }
.cco__h { margin: 0 0 28px; ${D} font-size: clamp(2rem, 1.3rem + 3cqi, 3.75rem); letter-spacing: -0.04em; line-height: 0.98; max-width: 18ch; }
.cco__list { display: grid; margin: 0; padding: 0; list-style: none; border-top: 2px solid var(--s-text); }
.cco__item { display: grid; grid-template-columns: 3rem minmax(0, 1fr); gap: 6px 12px; padding: 20px 0; border-bottom: 1px solid var(--s-border); }
.cco__n { grid-row: span 2; ${D} font-size: 2rem; color: var(--s-accent); line-height: 1; }
.cco__line { margin: 0; ${D} font-size: clamp(1.375rem, 1.1rem + 1.4cqi, 2.25rem); letter-spacing: -0.03em; line-height: 1.1; }
.cco__how { margin: 0; max-width: 56ch; line-height: 1.55; opacity: 0.8; }
@container (min-width: 900px) { .cco__item { grid-template-columns: 5rem minmax(0, 1.2fr) minmax(0, 0.8fr); align-items: baseline; } .cco__n { grid-row: auto; } }
${revealCss("cco", ".cco__item", "cco-rise")}`,
  settings: [text("heading", "Heading", "By the end of week six you will"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "outcome", name: "Outcome", settings: [text("outcome", "Outcome", "Open a talk without notes"), textarea("how", "How the course gets you there", "")] }],
  presetBlocks: [
    { type: "outcome", settings: { outcome: "Open any talk without notes", how: "A three line opening you rehearse until it is boring, in week one." } },
    { type: "outcome", settings: { outcome: "Breathe through the first minute", how: "The breathing drill from lesson three, practised live every week." } },
    { type: "outcome", settings: { outcome: "Answer questions you did not expect", how: "Two practice rooms where the group only asks hard questions." } },
    { type: "outcome", settings: { outcome: "Give a five minute talk on camera", how: "Your final talk, recorded, with written notes from the coach." } },
  ],
  maxBlocks: 6,
})

export const curriculum = defineSection({
  type: "ai_cc_curriculum",
  name: "Curriculum",
  summary: "Every week and its lessons as disclosures; a progress line fills as the visitor scrolls through the weeks (P3 scroll-scrub).",
  template: `
<section class="ccc" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="ccc__grid">
    <div class="ccc__side">
      <h2 class="ccc__h">{{ settings.heading }}</h2>
      <div class="ccc__intro">{{ settings.intro | raw }}</div>
    </div>
    <div class="ccc__weeks" data-storelib-motion="reveal-stagger" data-motion-effect="slide-right" data-motion-stagger="60">
      <span class="ccc__bar" aria-hidden="true"></span>
      {% for block in section.blocks %}
        <details class="ccc__week" data-motion-item data-block-id="{{ block.id }}"{% if forloop.first %} open{% endif %}>
          <summary class="ccc__sum"><span class="ccc__wk">{{ block.settings.week }}</span><span class="ccc__title">{{ block.settings.title }}</span><span class="ccc__len">{{ block.settings.length }}</span></summary>
          <ul class="ccc__lessons">{% for lesson in block.settings.lessons | lines %}<li>{{ lesson }}</li>{% endfor %}</ul>
        </details>
      {% endfor %}
    </div>
  </div>
</section>`,
  style: `
.ccc { ${BOX} }
.ccc__grid { display: grid; gap: 28px; }
.ccc__h { margin: 0; ${D} font-size: clamp(2rem, 1.3rem + 3cqi, 3.75rem); letter-spacing: -0.04em; line-height: 0.98; }
.ccc__intro { max-width: 40ch; margin-top: 14px; line-height: 1.55; }
.ccc__intro p { margin: 0; }
.ccc__weeks { position: relative; padding-left: 18px; }
.ccc__weeks::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--s-border); }
.ccc__bar { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--s-accent); transform-origin: top; }
.ccc__week { border-bottom: 1px solid var(--s-border); }
.ccc__sum { display: grid; grid-template-columns: 5rem minmax(0, 1fr); gap: 2px 12px; padding: 16px 0; cursor: pointer; list-style: none; }
.ccc__sum::-webkit-details-marker { display: none; }
.ccc__wk { ${SMALL} font-weight: 700; }
.ccc__title { ${D} font-size: 1.375rem; letter-spacing: -0.025em; }
.ccc__len { grid-column: 2; ${SMALL} opacity: 0.7; }
.ccc__lessons { display: grid; gap: 8px; margin: 0 0 18px 5rem; padding: 0 0 0 1.1em; line-height: 1.45; }
@container (min-width: 900px) { .ccc__grid { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 56px; } .ccc__side { position: sticky; top: 120px; align-self: start; } .ccc__sum { grid-template-columns: 6rem minmax(0, 1fr) auto; } .ccc__len { grid-column: 3; grid-row: 1; } .ccc__lessons { margin-left: 6rem; } }
@media (prefers-reduced-motion: no-preference) { @supports (animation-timeline: view()) { .ccc:not([data-motion="off"]) .ccc__bar { animation: ccc-fill linear both; animation-timeline: view(); animation-range: cover 20% cover 80%; } } }
@keyframes ccc-fill { from { transform: scaleY(0); } to { transform: scaleY(1); } }`,
  settings: [
    text("heading", "Heading", "Every lesson, week by week"),
    richtext("intro", "Intro", "<p>Lessons open every Monday. Each one is a short video and one thing to practise before the live room on Thursday.</p>"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "week", name: "Week", settings: [text("week", "Week", "Week 1"), text("title", "Title", "The first minute"), text("length", "Length", "2 lessons, 1 live room"), textarea("lessons", "Lessons (one per line)", "Why the first minute is the hardest\nA three line opening")] }],
  presetBlocks: [
    { type: "week", settings: { week: "Week 1", title: "The first minute", length: "2 lessons, 1 live room", lessons: "Why the first minute is the hardest\nWriting a three line opening\nLive room: everyone opens, nobody finishes" } },
    { type: "week", settings: { week: "Week 2", title: "Breath and voice", length: "2 lessons", lessons: "The breathing drill\nSlowing down without sounding slow" } },
    { type: "week", settings: { week: "Week 3", title: "Structure you can remember", length: "2 lessons, 1 live room", lessons: "Three points, always three\nTalking from a single card\nLive room: five minutes, one card" } },
    { type: "week", settings: { week: "Week 4", title: "Questions", length: "2 lessons, 1 live room", lessons: "Buying time honestly\nWhen you do not know the answer\nLive room: only hard questions" } },
    { type: "week", settings: { week: "Week 5", title: "On camera", length: "2 lessons", lessons: "Eyes, light and sound at home\nRecording without retakes" } },
    { type: "week", settings: { week: "Week 6", title: "Your talk", length: "2 lessons, 1 live room", lessons: "Rehearsing the last time\nLive room: final talks, recorded" } },
  ],
  maxBlocks: 12,
})

export const coach = defineSection({
  type: "ai_cc_coach",
  name: "The coach",
  summary: "Who teaches it: a photograph, the coach's story in their own words, and plain facts about their background the coach supplies.",
  template: `
<section class="cck" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="cck__grid">
    {% if settings.photo %}<span class="pdw" style="display: block; overflow: hidden;" data-storelib-motion="parallax-depth" data-motion-intensity="30" data-motion-pointer="false"><img class="cck__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1200" height="1400" data-motion-depth="0.1"></span>{% endif %}
    <div class="cck__copy">
      <h2 class="cck__h">{{ settings.heading }}</h2>
      <div class="cck__bio">{{ settings.bio | raw }}</div>
      <ul class="cck__facts">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.fact }}</li>{% endfor %}</ul>
    </div>
  </div>
</section>`,
  style: `
.cck { ${BOX} }
.cck__grid { display: grid; gap: 28px; }
.cck__img { width: 100%; height: auto; aspect-ratio: 6 / 7; object-fit: cover; }
.cck__h { margin: 0; ${D} font-size: clamp(2rem, 1.3rem + 3cqi, 3.75rem); letter-spacing: -0.04em; line-height: 0.98; }
.cck__bio { margin-top: 16px; max-width: 52ch; font-size: 1.125rem; line-height: 1.6; }
.cck__facts { display: grid; gap: 0; margin: 24px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.cck__facts li { padding: 12px 0; border-bottom: 1px solid var(--s-border); }
@container (min-width: 900px) { .cck__grid { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: center; gap: 64px; } }`,
  settings: [
    text("heading", "Heading", "Hi, I'm Ana. I used to read my slides out loud."),
    richtext("bio", "Story", "<p>I spent eight years presenting the morning show on local radio, and I still get nervous before a room of twelve. This course is everything that works for me, in the order I wish I had learned it.</p>"),
    image("photo", "Photograph"),
    text("photo_alt", "Photograph description", "Ana Ruiz laughing at a microphone in a small studio"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "fact", name: "Background", settings: [text("fact", "Fact", "Eight years on morning radio")] }],
  presetBlocks: ["Eight years presenting morning radio", "Speaking coach since 2019", "Teaches in English and Spanish"].map((fact) => ({ type: "fact", settings: { fact } })),
  maxBlocks: 6,
})

export const format = defineSection({
  type: "ai_cc_format",
  name: "How it works",
  summary: "How the course runs, as a timeline of one week: what happens on which day.",
  template: `
<section class="ccf" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="ccf__h">{{ settings.heading }}</h2>
  <ol class="ccf__list">
    {% for block in section.blocks %}<li class="ccf__day" data-block-id="{{ block.id }}">{% if block.settings.photo %}<img class="ccf__img" src="{{ block.settings.photo | asset }}" alt="{{ block.settings.alt }}" width="800" height="600">{% endif %}<p class="ccf__when">{{ block.settings.when }}</p><h3 class="ccf__what">{{ block.settings.what }}</h3><p class="ccf__text">{{ block.settings.text }}</p></li>{% endfor %}
  </ol>
</section>`,
  style: `
.ccf { ${BOX} }
.ccf__h { margin: 0 0 28px; ${D} font-size: clamp(2rem, 1.3rem + 3cqi, 3.75rem); letter-spacing: -0.04em; line-height: 0.98; }
.ccf__list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.ccf__day { display: grid; gap: 4px; padding: 18px 0 18px 20px; border-left: 3px solid var(--s-accent); }
.ccf__img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; margin-bottom: 12px; }
.ccf__when { margin: 0; ${SMALL} font-weight: 700; }
.ccf__what { margin: 0; ${D} font-size: 1.5rem; letter-spacing: -0.03em; }
.ccf__text { margin: 0; max-width: 44ch; line-height: 1.55; opacity: 0.85; }
@container (min-width: 900px) { .ccf__list { grid-template-columns: repeat(4, minmax(0, 1fr)); } .ccf__day { border-left: 0; border-top: 3px solid var(--s-accent); padding: 16px 20px 0 0; } }
${revealCss("ccf", ".ccf__day", "ccf-rise")}`,
  settings: [text("heading", "Heading", "One week of the course"), ...motion(), scheme("site_inverse"), ...spacing(96, 96)],
  blocks: [{ type: "day", name: "Day", settings: [text("when", "When", "Monday"), text("what", "What", "Lessons open"), textarea("text", "Words", ""), image("photo", "Photograph"), text("alt", "Photograph description", "")] }],
  presetBlocks: [
    { type: "day", settings: { when: "Monday", what: "Two lessons open", text: "Short videos, twenty minutes in all, with one exercise.", alt: "A laptop on a kitchen table playing a short lesson video" } },
    { type: "day", settings: { when: "Any day", what: "You practise", text: "Record a minute on your phone and post it to the group.", alt: "A man recording himself speaking on a phone propped on books" } },
    { type: "day", settings: { when: "Thursday, 7pm", what: "Live practice room", text: "Ninety minutes on video, eight people a room, everyone speaks.", alt: "A video call grid of eight people listening to one speaker" } },
    { type: "day", settings: { when: "Within 48 hours", what: "Notes from Ana", text: "Written notes on what to keep and one thing to change.", alt: "The coach writing notes in a notebook beside a laptop" } },
  ],
  maxBlocks: 6,
})

export const reviews = defineSection({
  type: "ai_cc_reviews",
  name: "What students said",
  summary: "Real reviews from Storelib Reviews only: the newest published ones with their stars and names. With no reviews it draws nothing on the live site (a labelled empty state in the editor).",
  template: `
{% if reviews.enabled and reviews.all.items.size > 0 %}
<section class="ccr" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="ccr__head"><h2 class="ccr__h">{{ settings.heading }}</h2>{% if reviews.all.summary.count > 0 %}<p class="ccr__sum">{{ settings.average_label }} {{ reviews.all.summary.average_label }}, {{ reviews.all.summary.count }} {{ settings.count_label }}</p>{% endif %}</div>
  <ul class="ccr__list">
    {% for r in reviews.all.items limit: settings.count %}
      <li class="ccr__item" data-review-id="{{ r.id }}"><span class="ccr__stars" style="--rv: {{ r.rating | times: 20 }}%;" role="img" aria-label="{{ r.rating }} {{ settings.stars_label }}"></span>{% if r.title %}<p class="ccr__title">{{ r.title }}</p>{% endif %}<p class="ccr__body">{{ r.body }}</p><p class="ccr__by">{{ r.author }}{% if r.date %}, {{ r.date }}{% endif %}</p></li>
    {% endfor %}
  </ul>
  <ul class="ccr__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{% if block.settings.link %}<a href="{{ block.settings.link | url }}">{{ block.settings.note }}</a>{% else %}{{ block.settings.note }}{% endif %}</li>{% endfor %}</ul>
</section>
{% elsif page.in_editor %}
<section class="ccr ccr--empty" data-scheme="{{ settings.color_scheme }}" style="${vars()}"><p class="ccr__sum">Real reviews from Storelib Reviews show here once students leave them. Nothing shows on the live site until then.</p></section>
{% endif %}`,
  style: `
.ccr { ${BOX} }
.ccr__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; margin-bottom: 24px; }
.ccr__h { margin: 0; ${D} font-size: clamp(2rem, 1.3rem + 3cqi, 3.75rem); letter-spacing: -0.04em; line-height: 0.98; }
.ccr__sum { margin: 0; ${SMALL} }
.ccr__list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-top: 2px solid var(--s-text); }
.ccr__item { display: grid; gap: 8px; padding: 22px 0; border-bottom: 1px solid var(--s-border); }
.ccr__stars { position: relative; display: inline-block; width: max-content; font-size: 1rem; letter-spacing: 2px; color: var(--s-border); }
.ccr__stars::before { content: "\\2605\\2605\\2605\\2605\\2605"; }
.ccr__stars::after { content: "\\2605\\2605\\2605\\2605\\2605"; position: absolute; left: 0; top: 0; width: var(--rv, 100%); overflow: hidden; color: var(--s-heading); }
.ccr__title { margin: 0; ${D} font-size: 1.25rem; }
.ccr__body { margin: 0; max-width: 60ch; font-size: 1.125rem; line-height: 1.55; }
.ccr__by { margin: 0; ${SMALL} opacity: 0.75; }
.ccr__notes { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 20px 0 0; padding: 0; list-style: none; ${SMALL} }
.ccr__notes a { color: inherit; }
@container (min-width: 900px) { .ccr__list { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 40px; } }`,
  settings: [text("heading", "Heading", "What students said"), text("average_label", "Before the average", "Average rating"), text("count_label", "After the count", "reviews"), text("stars_label", "After a rating (read aloud)", "of five"), range("count", "How many", 2, 12, 1, 4), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Every review is from someone who took the course"), url("link", "Link (optional)", "")] }],
  presetBlocks: [
    { type: "note", settings: { note: "Reviews are written by people who bought the course", link: "" } },
    { type: "note", settings: { note: "Ask Ana anything before you join", link: "/contact" } },
  ],
  maxBlocks: 3,
})

export const pricing = defineSection({
  type: "ai_cc_pricing",
  name: "Join",
  summary: "Ways to join from the store's real products (chosen, or the newest): name, price, Buy now straight to checkout and add to cart, then what every place includes.",
  template: `
<section class="ccp" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="ccp__h">{{ settings.heading }}</h2>
  <ul class="ccp__list">
    {% if settings.products.size > 0 %}
      {% for product in settings.products limit: 3 %}<li class="ccp__opt"><h3 class="ccp__name">{{ product.settings.title }}</h3><p class="ccp__price">{{ product.settings.price }}</p>{% if product.settings.checkout_url %}<a class="ccp__buy" href="{{ product.settings.checkout_url | url }}">{{ settings.buy_label }}</a>{% endif %}<button class="ccp__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button><a class="ccp__more" href="{{ product.settings.url | url }}">{{ settings.details_label }}</a></li>{% endfor %}
    {% else %}
      {% for product in products limit: 3 %}<li class="ccp__opt"><h3 class="ccp__name">{{ product.settings.title }}</h3><p class="ccp__price">{{ product.settings.price }}</p>{% if product.settings.checkout_url %}<a class="ccp__buy" href="{{ product.settings.checkout_url | url }}">{{ settings.buy_label }}</a>{% endif %}<button class="ccp__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button><a class="ccp__more" href="{{ product.settings.url | url }}">{{ settings.details_label }}</a></li>{% endfor %}
    {% endif %}
  </ul>
  <div class="ccp__inc"><p class="ccp__inc-h">{{ settings.includes_heading }}</p><ul>{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.line }}</li>{% endfor %}</ul></div>
</section>`,
  style: `
.ccp { ${BOX} }
.ccp__h { margin: 0 0 28px; ${D} font-size: clamp(2rem, 1.3rem + 3cqi, 3.75rem); letter-spacing: -0.04em; line-height: 0.98; }
.ccp__list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-top: 2px solid var(--s-text); }
.ccp__opt { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px 16px; align-items: center; padding: 22px 0; border-bottom: 1px solid var(--s-border); }
.ccp__name { margin: 0; ${D} font-size: clamp(1.5rem, 1.2rem + 1.4cqi, 2.25rem); letter-spacing: -0.03em; }
.ccp__price { margin: 0; ${D} font-size: 1.5rem; font-variant-numeric: tabular-nums; }
.ccp__buy { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 24px; background: var(--s-btn); color: var(--s-btn-text); font-weight: 700; text-decoration: none; }
.ccp__buy:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.ccp__add { min-height: 52px; padding: 0 20px; border: 1px solid var(--s-text); background: none; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
.ccp__more { grid-column: 1 / -1; color: inherit; ${SMALL} }
.ccp__inc { margin-top: 28px; }
.ccp__inc-h { margin: 0 0 10px; font-weight: 700; }
.ccp__inc ul { display: grid; gap: 8px; margin: 0; padding: 0 0 0 1.1em; }
@container (min-width: 900px) { .ccp__opt { grid-template-columns: minmax(0, 1fr) 9rem auto auto; } .ccp__more { grid-column: auto; } .ccp__inc ul { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`,
  settings: [
    text("heading", "Heading", "Join the March cohort"),
    productList("products", "Ways to join (empty shows the newest)"),
    text("buy_label", "Buy now button", "Buy now"),
    text("add_label", "Add button", "Add to cart"),
    text("details_label", "Details link", "What is in it"),
    text("includes_heading", "Every place includes", "Every place includes"),
    ...motion(),
    scheme("site"),
    ...spacing(96, 96),
  ],
  blocks: [{ type: "include", name: "Included", settings: [text("line", "Line", "All twelve lessons, yours to keep")] }],
  presetBlocks: ["All twelve lessons, yours to keep", "Four live practice rooms", "Written notes on your final talk", "A full refund until the end of week one"].map((line) => ({ type: "include", settings: { line } })),
  maxBlocks: 8,
})

export const dates = defineSection({
  type: "ai_cc_dates",
  name: "Dates",
  summary: "Upcoming cohorts as a timetable: when it starts, the live room time, places left as the creator types them.",
  template: `
<section class="ccd" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="ccd__h">{{ settings.heading }}</h2>
  <table class="ccd__table">
    <thead><tr><th scope="col">{{ settings.col_start }}</th><th scope="col">{{ settings.col_live }}</th><th scope="col">{{ settings.col_status }}</th></tr></thead>
    <tbody>{% for block in section.blocks %}<tr data-block-id="{{ block.id }}"><th scope="row">{{ block.settings.start }}</th><td>{{ block.settings.live }}</td><td>{{ block.settings.status }}</td></tr>{% endfor %}</tbody>
  </table>
</section>`,
  style: `
.ccd { ${BOX} }
.ccd__h { margin: 0 0 24px; ${D} font-size: clamp(2rem, 1.3rem + 3cqi, 3.75rem); letter-spacing: -0.04em; line-height: 0.98; }
.ccd__table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.ccd__table th, .ccd__table td { padding: 14px 10px 14px 0; border-bottom: 1px solid var(--s-border); text-align: left; vertical-align: top; }
.ccd__table thead th { ${SMALL} font-weight: 400; opacity: 0.7; }
.ccd__table tbody th { ${D} font-size: 1.125rem; }`,
  settings: [text("heading", "Heading", "Cohorts"), text("col_start", "First column", "Starts"), text("col_live", "Second column", "Live rooms"), text("col_status", "Third column", "Places"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "cohort", name: "Cohort", settings: [text("start", "Starts", "Monday 2 March"), text("live", "Live rooms", "Thursdays 7pm CET"), text("status", "Places", "Open")] }],
  presetBlocks: [
    { type: "cohort", settings: { start: "Monday 2 March", live: "Thursdays, 7pm CET", status: "Open" } },
    { type: "cohort", settings: { start: "Monday 4 May", live: "Tuesdays, 12pm CET", status: "Open" } },
    { type: "cohort", settings: { start: "Monday 7 September", live: "Thursdays, 7pm CET", status: "Waiting list" } },
  ],
  maxBlocks: 8,
})

export const faq = defineSection({
  type: "ai_cc_faq",
  name: "Questions",
  summary: "Questions people ask before they enrol, as native disclosures.",
  template: `
<section class="ccx" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="ccx__grid">
    <h2 class="ccx__h">{{ settings.heading }}</h2>
    <div class="ccx__list">{% for block in section.blocks %}<details class="ccx__item" data-block-id="{{ block.id }}"><summary class="ccx__q">{{ block.settings.question }}</summary><div class="ccx__a">{{ block.settings.answer | raw }}</div></details>{% endfor %}</div>
  </div>
</section>`,
  style: `
.ccx { ${BOX} }
.ccx__grid { display: grid; gap: 24px; }
.ccx__h { margin: 0; ${D} font-size: clamp(2rem, 1.3rem + 3cqi, 3.75rem); letter-spacing: -0.04em; line-height: 0.98; }
.ccx__list { border-top: 2px solid var(--s-text); }
.ccx__item { border-bottom: 1px solid var(--s-border); }
.ccx__q { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 60px; cursor: pointer; font-weight: 700; font-size: 1.125rem; list-style: none; }
.ccx__q::-webkit-details-marker { display: none; }
.ccx__q::after { content: "+"; font-size: 1.5rem; color: var(--s-accent); transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.ccx__item[open] .ccx__q::after { transform: rotate(45deg); }
.ccx__a { max-width: 60ch; padding-bottom: 18px; line-height: 1.6; }
.ccx__a p { margin: 0; }
@container (min-width: 900px) { .ccx__grid { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); } }
@media (prefers-reduced-motion: reduce) { .ccx__q::after { transition: none; } }`,
  settings: [text("heading", "Heading", "Questions"), ...motion(), scheme("site"), ...spacing(96, 96)],
  blocks: [{ type: "question", name: "Question", settings: [text("question", "Question", "What if I miss a live room?"), richtext("answer", "Answer", "<p>Every room is recorded.</p>")] }],
  presetBlocks: [
    { type: "question", settings: { question: "What if I miss a live room?", answer: "<p>Join another cohort's room that week, or watch the recording and send Ana your one minute for notes.</p>" } },
    { type: "question", settings: { question: "Do I have to turn my camera on?", answer: "<p>In the live rooms, yes. That is the practice. In week one you can start with audio only.</p>" } },
    { type: "question", settings: { question: "Can my employer pay?", answer: "<p>Yes. Checkout gives a proper invoice with your company's details.</p>" } },
    { type: "question", settings: { question: "What if it is not for me?", answer: "<p>Ask for a full refund any time before the end of week one.</p>" } },
  ],
  maxBlocks: 12,
})

export const closing = defineSection({
  type: "ai_cc_closing",
  name: "Last call",
  summary: "The last ask on the deep band: one big line, the start date and the Enrol button.",
  template: `
<section class="ccz" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h2 class="ccz__h">{{ settings.heading }}</h2>
  <ul class="ccz__facts">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.fact }}</li>{% endfor %}</ul>
  <a class="ccz__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
</section>`,
  style: `
.ccz { ${BOX} display: grid; justify-items: start; gap: 24px; }
.ccz__h { margin: 0; ${D} font-weight: 800; font-size: clamp(2.5rem, 1.2rem + 6cqi, 6.5rem); letter-spacing: -0.05em; line-height: 0.92; max-width: 16ch; }
.ccz__facts { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 0; padding: 0; list-style: none; }
.ccz__btn { display: inline-flex; align-items: center; min-height: 58px; padding: 0 32px; background: var(--s-accent); color: var(--s-bg); font-weight: 700; font-size: 1.125rem; text-decoration: none; transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease); }
.ccz__btn:active { transform: translateY(2px); }
${revealCss("ccz", ".ccz__h", "ccz-rise")}`,
  settings: [text("heading", "Heading", "Your next talk can be the calm one"), text("cta_label", "Button", "Enrol for March"), url("cta_url", "Button goes to", "/products"), ...motion(), scheme("site_inverse"), ...spacing(120, 120)],
  blocks: [{ type: "fact", name: "Fact", settings: [text("fact", "Fact", "Starts 2 March")] }],
  presetBlocks: ["Starts Monday 2 March", "24 places", "Refund until the end of week one"].map((fact) => ({ type: "fact", settings: { fact } })),
  maxBlocks: 4,
})

export const footer = defineSection({
  type: "ai_cc_footer",
  name: "Footer",
  kind: "footer",
  summary: "Newsletter-led footer: a big sign-up line with one free lesson, the footer menu, language and currency.",
  template: `
<footer class="cco2" data-scheme="{{ settings.color_scheme }}" style="${chromeVars()}">
  <form class="cco2__form" data-storelib-form="subscribe">
    <label class="cco2__label" for="cco2-e-{{ section.id }}">{{ settings.newsletter_heading }}</label>
    <p class="cco2__sub">{{ settings.newsletter_text }}</p>
    <div class="cco2__row"><input id="cco2-e-{{ section.id }}" type="email" name="email" autocomplete="email" required placeholder="{{ settings.email_placeholder }}"><button type="submit">{{ settings.button_label }}</button></div>
  </form>
  <div class="cco2__base">
    <nav class="cco2__nav" aria-label="{{ settings.nav_label }}">{% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}</nav>
    <ul class="cco2__links">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><a href="{{ block.settings.url | url }}">{{ block.settings.label }}</a></li>{% endfor %}</ul>
    ${prefs("cco2")}
    <p class="cco2__small">{{ settings.small_print }}</p>
  </div>
</footer>`,
  style: `
.cco2__links { display: flex; flex-wrap: wrap; gap: 0 18px; margin: 0; padding: 0; list-style: none; }
.cco2__links a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; }
.cco2 { padding: 72px var(--theme-padding-x, 20px) 28px; background: var(--s-bg); color: var(--s-text); border-top: 1px solid var(--s-border); container-type: inline-size; }
.cco2__label { display: block; font-family: var(--theme-font-heading), sans-serif; color: var(--s-heading); font-weight: 800; font-size: clamp(2rem, 1.2rem + 4cqi, 4.5rem); letter-spacing: -0.045em; line-height: 0.95; max-width: 16ch; }
.cco2__sub { max-width: 46ch; margin: 14px 0 20px; line-height: 1.55; }
.cco2__row { display: flex; flex-wrap: wrap; gap: 8px; max-width: 560px; }
.cco2__row input { flex: 1 1 220px; min-width: 0; min-height: 54px; padding: 0 14px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; }
.cco2__row button { min-height: 54px; padding: 0 24px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 700; cursor: pointer; }
.cco2__base { display: grid; gap: 18px; margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--s-border); }
.cco2__nav { display: flex; flex-wrap: wrap; gap: 0 22px; }
.cco2__nav a { display: inline-flex; min-height: 44px; align-items: center; color: inherit; text-decoration: none; }
.cco2__small { margin: 0; font-size: 0.8125rem; opacity: 0.75; }
${panelCss("cco2")}
@container (min-width: 900px) { .cco2__base { grid-template-columns: minmax(0, 1fr) auto; align-items: center; } .cco2__small { grid-column: 1 / -1; } }`,
  settings: [
    menu("menu", "Footer menu", "footer"),
    text("newsletter_heading", "Newsletter heading", "Get lesson one free"),
    text("newsletter_text", "Newsletter words", "The breathing drill from week two, by email, with one short note a month after that."),
    text("email_placeholder", "Email hint", "Your email"),
    text("button_label", "Subscribe button", "Send it"),
    text("small_print", "Small print", "Floor is a course by Ana Ruiz, Madrid."),
    text("nav_label", "Menu name (read aloud)", "Footer"),
    text("language_label", "Language", "Language"),
    text("currency_label", "Currency", "Currency"),
    scheme("site"),
  ],
  blocks: [{ type: "link", name: "Link", settings: [text("label", "Label", "Instagram"), url("url", "Goes to", "https://www.instagram.com/")] }],
  presetBlocks: [
    { type: "link", settings: { label: "Instagram", url: "https://www.instagram.com/" } },
    { type: "link", settings: { label: "YouTube", url: "https://www.youtube.com/" } },
  ],
  maxBlocks: 6,
})

export const product = defineSection({
  type: "ai_cc_product",
  name: "Course",
  summary: "The course or coaching product: its picture, name, price, Buy now and add to cart, its options, offers, description, what is included from the product, and the course's promises.",
  template: `
<section class="ccpd" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="ccpd__grid">
    <div class="ccpd__media">{% for img in product.images limit: 3 %}<img src="{{ img }}" alt="{{ product.title }}" width="1200" height="900">{% endfor %}</div>
    <div class="ccpd__info">
      <h1 class="ccpd__title">{{ product.title }}</h1>
      <p class="ccpd__price">{{ product.price }}{% if product.compare_price %} <s>{{ product.compare_price }}</s>{% endif %}</p>
      {% if page.product.settings.variants.size > 0 %}<div class="ccpd__opts" role="group" aria-label="{{ settings.options_label }}">{% for v in page.product.settings.variants %}<button class="ccpd__opt" type="button" data-storelib-add-to-cart="{{ product.id }}" data-variant-id="{{ v.id }}" data-title="{{ product.title }}" data-price="{{ v.price }}">{{ v.name }} <span>{{ v.price }}</span></button>{% endfor %}</div>{% else %}<button class="ccpd__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.title }}" data-price="{{ product.price }}" data-url="{{ product.url }}">{{ settings.add_label }}</button>{% endif %}
      <div data-storelib-island data-storelib-offers="{{ product.id }}" data-title="{{ product.title }}" data-url="{{ product.url }}" data-layout="open"></div>
      {% if product.description_html %}<div class="ccpd__desc">{{ product.description_html | raw }}</div>{% endif %}
      {% if product.includes.size > 0 %}<ul class="ccpd__inc">{% for line in product.includes %}<li>{{ line }}</li>{% endfor %}</ul>{% endif %}
      <ul class="ccpd__promise">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.line }}</li>{% endfor %}</ul>
    </div>
  </div>
</section>`,
  style: `
.ccpd { ${BOX} }
.ccpd__grid { display: grid; gap: 28px; }
.ccpd__media { display: grid; gap: 10px; }
.ccpd__media img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; }
.ccpd__title { margin: 0; ${D} font-weight: 800; font-size: clamp(2.25rem, 1.3rem + 4cqi, 4.5rem); letter-spacing: -0.045em; line-height: 0.95; }
.ccpd__price { margin: 14px 0 22px; ${D} font-size: 1.75rem; }
.ccpd__opts { display: grid; gap: 8px; }
.ccpd__opt, .ccpd__add { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 0 20px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
.ccpd__add { justify-content: center; border: 0; background: var(--s-btn); color: var(--s-btn-text); font-weight: 700; }
.ccpd__desc { margin-top: 22px; line-height: 1.6; max-width: 58ch; }
.ccpd__inc, .ccpd__promise { display: grid; gap: 8px; margin: 22px 0 0; padding: 16px 0 0 1.1em; border-top: 1px solid var(--s-border); }
@container (min-width: 900px) { .ccpd__grid { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); align-items: start; gap: 56px; } .ccpd__info { position: sticky; top: 120px; } }`,
  settings: [text("add_label", "Add button", "Enrol"), text("options_label", "Options (read aloud)", "Choose a cohort"), ...motion(), scheme("site"), ...spacing(56, 96)],
  blocks: [{ type: "promise", name: "Promise", settings: [text("line", "Line", "Full refund until the end of week one")] }],
  presetBlocks: ["Full refund until the end of week one", "Lessons stay yours after the course", "Invoices for employers at checkout"].map((line) => ({ type: "promise", settings: { line } })),
  maxBlocks: 6,
})

export const collection = defineSection({
  type: "ai_cc_collection",
  name: "Collection",
  summary: "A collection's real products (courses, coaching, workbooks) as a clear list with price and Enrol.",
  template: `
<section class="ccl" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <h1 class="ccl__h">{% if collection.title %}{{ collection.title }}{% else %}{{ settings.heading }}{% endif %}</h1>
  {% if collection.description %}<p class="ccl__intro">{{ collection.description }}</p>{% endif %}
  {% if page.query %}<p class="ccl__intro">{{ settings.query_label }} {{ page.query }}</p>{% endif %}
  <ul class="ccl__list">
    {% for product in products %}<li class="ccl__item">{% if product.settings.image %}<img src="{{ product.settings.image }}" alt="{{ product.settings.title }}" width="800" height="600">{% endif %}<a class="ccl__name" href="{{ product.settings.url | url }}">{{ product.settings.title }}</a><span class="ccl__price">{{ product.settings.price }}</span><button class="ccl__add" type="button" data-storelib-add-to-cart="{{ product.id }}" data-title="{{ product.settings.title }}" data-price="{{ product.settings.price }}" data-url="{{ product.settings.url }}">{{ settings.add_label }}</button></li>{% endfor %}
  </ul>
  <ul class="ccl__notes">{% for block in section.blocks %}<li data-block-id="{{ block.id }}">{{ block.settings.note }}</li>{% endfor %}</ul>
</section>`,
  style: `
.ccl { ${BOX} }
.ccl__h { margin: 0; ${D} font-weight: 800; font-size: clamp(2.5rem, 1.3rem + 5cqi, 5.5rem); letter-spacing: -0.05em; line-height: 0.92; }
.ccl__intro { max-width: 52ch; margin: 16px 0 0; line-height: 1.55; }
.ccl__list { display: grid; gap: 0; margin: 36px 0 0; padding: 0; list-style: none; border-top: 2px solid var(--s-text); }
.ccl__item { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; grid-template-rows: auto auto; gap: 4px 16px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.ccl__item img { grid-row: span 2; width: 96px; height: 72px; object-fit: cover; }
.ccl__name { ${D} font-size: 1.375rem; letter-spacing: -0.03em; color: inherit; text-decoration: none; }
.ccl__price { grid-column: 2; font-weight: 600; }
.ccl__add { grid-column: 3; grid-row: 1 / span 2; min-height: 48px; padding: 0 18px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 700; cursor: pointer; }
.ccl__notes { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 28px 0 0; padding: 0; list-style: none; ${SMALL} }`,
  settings: [text("heading", "Heading when there is no collection", "Courses and coaching"), text("query_label", "Before the search words", "Results for"), text("add_label", "Add button", "Enrol"), ...motion(), scheme("site"), ...spacing(56, 96)],
  blocks: [{ type: "note", name: "Note", settings: [text("note", "Note", "Refund until the end of week one")] }],
  presetBlocks: ["Refund until the end of week one", "Invoices for employers"].map((note) => ({ type: "note", settings: { note } })),
  maxBlocks: 4,
})

export const about = defineSection({
  type: "ai_cc_about",
  name: "About the course",
  summary: "Why the course exists, in the coach's words, with a photograph and the principles it is built on.",
  template: `
<section class="cca" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="cca__grid">
    <div><h1 class="cca__h">{{ settings.heading }}</h1><div class="cca__story">{{ settings.story | raw }}</div></div>
    {% if settings.photo %}<span class="pdw" style="display: block; overflow: hidden;" data-storelib-motion="parallax-depth" data-motion-intensity="30" data-motion-pointer="false"><img class="cca__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="1200" height="1400" data-motion-depth="0.12"></span>{% endif %}
  </div>
  <ol class="cca__list">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><h2 class="cca__t">{{ block.settings.title }}</h2><p>{{ block.settings.text }}</p></li>{% endfor %}</ol>
</section>`,
  style: `
.cca { ${BOX} }
.cca__grid { display: grid; gap: 28px; }
.cca__h { margin: 0; ${D} font-weight: 800; font-size: clamp(2.5rem, 1.3rem + 5cqi, 5.5rem); letter-spacing: -0.05em; line-height: 0.92; max-width: 14ch; }
.cca__story { margin-top: 18px; max-width: 54ch; font-size: 1.125rem; line-height: 1.6; }
.cca__img { width: 100%; height: auto; aspect-ratio: 6 / 7; object-fit: cover; }
.cca__list { display: grid; gap: 0; margin: 56px 0 0; padding: 0; list-style: none; border-top: 2px solid var(--s-text); }
.cca__list li { display: grid; gap: 6px; padding: 18px 0; border-bottom: 1px solid var(--s-border); }
.cca__t { margin: 0; ${D} font-size: 1.5rem; letter-spacing: -0.03em; }
.cca__list p { margin: 0; max-width: 56ch; line-height: 1.55; }
@container (min-width: 900px) { .cca__grid { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); align-items: end; gap: 56px; } .cca__list li { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); } }
${revealCss("cca", ".cca__list li", "cca-rise")}`,
  settings: [
    text("heading", "Heading", "Built for people who dread the microphone"),
    richtext("story", "Story", "<p>Most speaking advice is written by people who love being on stage. Floor is for everyone else: practical, a little each week, and always in a small room first.</p>"),
    image("photo", "Photograph"),
    text("photo_alt", "Photograph description", "A small group in a bright room listening to one person speak"),
    ...motion(),
    scheme("site"),
    ...spacing(56, 96),
  ],
  blocks: [{ type: "principle", name: "Principle", settings: [text("title", "Principle", "Small rooms first"), textarea("text", "What it means", "")] }],
  presetBlocks: [
    { type: "principle", settings: { title: "Small rooms first", text: "You speak to eight people before you speak to eighty." } },
    { type: "principle", settings: { title: "Practice beats theory", text: "Every lesson ends with one thing to say out loud that day." } },
    { type: "principle", settings: { title: "Kind, specific notes", text: "Feedback names one thing to keep and one thing to change. Never ten." } },
  ],
  maxBlocks: 6,
})

export const contact = defineSection({
  type: "ai_cc_contact",
  name: "Contact",
  summary: "Contact page: ask a question before enrolling, with the ways to reach the coach.",
  template: `
<section class="ccm" data-scheme="{{ settings.color_scheme }}" data-motion="{{ settings.motion }}" style="${vars()}">
  <div class="ccm__grid">
    <div><h1 class="ccm__h">{{ settings.heading }}</h1><div class="ccm__text">{{ settings.text | raw }}</div><ul class="ccm__ways">{% for block in section.blocks %}<li data-block-id="{{ block.id }}"><span>{{ block.settings.label }}</span>{% if block.settings.link %}<a href="{{ block.settings.link | url }}">{{ block.settings.value }}</a>{% else %}{{ block.settings.value }}{% endif %}</li>{% endfor %}</ul></div>
    <form class="ccm__form" data-storelib-form="contact">
      <label><span>{{ settings.name_label }}</span><input name="name" type="text" autocomplete="name" maxlength="120" required></label>
      <label><span>{{ settings.email_label }}</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <label><span>{{ settings.message_label }}</span><textarea name="message" rows="5" maxlength="5000" required></textarea></label>
      <button type="submit">{{ settings.send_label }}</button>
    </form>
  </div>
</section>`,
  style: `
.ccm { ${BOX} }
.ccm__grid { display: grid; gap: 40px; }
.ccm__h { margin: 0; ${D} font-weight: 800; font-size: clamp(2.5rem, 1.3rem + 5cqi, 5.5rem); letter-spacing: -0.05em; line-height: 0.92; }
.ccm__text { max-width: 44ch; margin-top: 16px; line-height: 1.6; }
.ccm__ways { display: grid; gap: 0; margin: 24px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--s-border); }
.ccm__ways li { display: grid; gap: 2px; padding: 12px 0; border-bottom: 1px solid var(--s-border); }
.ccm__ways span { ${SMALL} opacity: 0.7; }
.ccm__ways a { color: inherit; font-weight: 600; }
.ccm__form { display: grid; gap: 14px; align-content: start; }
.ccm__form label { display: grid; gap: 6px; font-weight: 600; }
.ccm__form input, .ccm__form textarea { min-height: 54px; padding: 12px 14px; border: 2px solid var(--s-text); background: none; color: inherit; font: inherit; font-weight: 400; }
.ccm__form button { justify-self: start; min-height: 56px; padding: 0 30px; border: 0; background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 700; cursor: pointer; }
@container (min-width: 900px) { .ccm__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 64px; } }`,
  settings: [
    text("heading", "Heading", "Ask before you enrol"),
    richtext("text", "Words", "<p>Not sure it fits? Write a line about where you speak and what goes wrong. Ana answers herself, usually the same day.</p>"),
    text("name_label", "Name field", "Name"),
    text("email_label", "Email field", "Email"),
    text("message_label", "Message field", "Your question"),
    text("send_label", "Send button", "Send"),
    ...motion(),
    scheme("site"),
    ...spacing(56, 96),
  ],
  blocks: [{ type: "way", name: "Way to reach", settings: [text("label", "Label", "Email"), text("value", "Shown as", "ana@floor.school"), url("link", "Link", "mailto:ana@floor.school")] }],
  presetBlocks: [
    { type: "way", settings: { label: "Email", value: "ana@floor.school", link: "mailto:ana@floor.school" } },
    { type: "way", settings: { label: "For teams", value: "Courses for teams", link: "/products" } },
  ],
  maxBlocks: 4,
})

export const ALL = [header, hero, strip, outcomes, curriculum, coach, format, reviews, pricing, dates, faq, closing, footer, product, collection, about, contact]
