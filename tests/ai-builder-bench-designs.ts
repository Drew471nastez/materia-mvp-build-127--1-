/**
 * The scripted designs tests/ai-builder-benchmarks.test.ts builds (scenarios
 * A to D from Andrew's list, plus the components the other scenarios add).
 * Each component is an original .storelib file of the shape a careful model
 * writes: every visible word a setting, colours from the scheme, spacing from
 * settings. They are HAND WRITTEN: a benchmark built on them measures the
 * pipeline, never a real model's taste.
 */
import { ABOUT, CONCEPT, FOOTER, HEADER, HERO, PROGRAMS } from "./ai-builder-agent-fixtures"

const ROOT = `--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-heading: {{ scheme.heading }}; --s-accent: {{ scheme.accent }}; --s-btn: {{ scheme.primary_btn_bg }}; --s-btn-text: {{ scheme.primary_btn_text }}; --s-border: {{ scheme.border }}; --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px;`
const SPACING = [
  { type: "header", id: "hdr_spacing", label: "Spacing" },
  { type: "range", id: "padding_top", label: "Top padding", min: 0, max: 160, step: 4, unit: "px", default: 64 },
  { type: "range", id: "padding_bottom", label: "Bottom padding", min: 0, max: 160, step: 4, unit: "px", default: 64 },
]
const SCHEME = (d = "site") => ({ type: "color_scheme", id: "color_scheme", label: "Colour scheme", default: d })

/** One .storelib component: `{{ROOT}}` in the template becomes the scheme and spacing variables. */
export function component(o: { type: string; name: string; kind?: "header" | "footer"; category?: string; template: string; style: string; settings: Record<string, unknown>[]; blocks?: Record<string, unknown>[]; maxBlocks?: number; spacing?: boolean; scheme?: string }): string {
  const settings = [...o.settings, SCHEME(o.scheme), ...(o.spacing === false || o.kind ? [] : SPACING)]
  const schema: Record<string, unknown> = { schema_version: 1, type: o.type, name: o.name, ...(o.kind ? { kind: o.kind, enabled_on: { groups: [o.kind] } } : { category: o.category ?? "text" }), settings, ...(o.blocks ? { blocks: o.blocks, max_blocks: o.maxBlocks ?? 12 } : {}) }
  return `<template>\n${o.template.replace("{{ROOT}}", ROOT).trim()}\n</template>\n\n<style scoped>\n${o.style.trim()}\n</style>\n\n<schema>\n${JSON.stringify(schema, null, 2)}\n</schema>\n`
}

export interface Design {
  label: string
  prompt: string
  category?: string
  concept: Record<string, unknown>
  tokens: Record<string, unknown>
  files: Record<string, string>
  pages: { key: string; title: string }[]
  /** page key → the sections placed (set_page_sections). */
  compose: Record<string, Record<string, unknown>[]>
}

/* ── A: premium fitness coach, three pages ─────────────────────────────── */

export const A: Design = {
  label: "A premium fitness coach, multi page",
  prompt: "A premium site for my strength coaching: small group classes, an 8 week program people can buy, and who I am.",
  category: "fitness_coach",
  concept: CONCEPT,
  tokens: { colors: { background: "#f4efe6", surface: "#ebe4d8", text: "#1d1b18", muted: "#5c564d", accent: "#c2410c", accentText: "#ffffff", border: "#d6cdbd", inverse: { background: "#1d1b18", text: "#f4efe6", accent: "#fb923c" } }, fonts: { heading: "Oswald", body: "Inter" }, radius: { small: 2, medium: 4, large: 0 } },
  files: { "sections/ai_coach_header.storelib": HEADER, "sections/ai_coach_hero.storelib": HERO, "sections/ai_program_list.storelib": PROGRAMS, "sections/ai_coach_footer.storelib": FOOTER, "sections/ai_coach_story.storelib": ABOUT },
  pages: [{ key: "programs", title: "Programs" }, { key: "about", title: "About" }],
  compose: {
    home: [{ type: "ai_coach_header", group: "header" }, { type: "ai_coach_hero", settings: { heading: "Lift with a plan", cta_url: "/programs" } }, { type: "ai_program_list", blocks: [{ type: "program", settings: { name: "Small group strength", when: "Mon Wed Fri 7am" } }] }, { type: "ai_coach_footer", group: "footer" }],
    programs: [{ type: "ai_program_list", settings: { heading: "All programs" } }],
    about: [{ type: "ai_coach_story" }],
  },
}

/* ── B: editorial fashion, its own masthead and colophon ───────────────── */

const MASTHEAD = component({
  type: "ai_masthead",
  name: "Masthead",
  kind: "header",
  template: `<header class="mh" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-border: {{ scheme.border }};">
  <p class="mh__issue">{{ settings.issue_line }}</p>
  <a class="mh__name" href="/">{{ settings.brand }}</a>
  <nav class="mh__nav" aria-label="{{ settings.nav_label }}">
    {% for link in settings.menu.links %}<a class="mh__link" href="{{ link.url | url }}">{{ link.title }}</a>{% endfor %}
  </nav>
</header>`,
  style: `.mh { display: grid; justify-items: center; gap: 10px; padding: 28px var(--theme-padding-x, 24px) 14px; background: var(--s-bg); color: var(--s-text); border-bottom: 1px solid var(--s-border); }
.mh__issue { margin: 0; font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; }
.mh__name { font-family: var(--theme-font-heading, serif); font-size: clamp(44px, 10vw, 120px); line-height: 0.9; color: inherit; text-decoration: none; font-style: italic; }
.mh__nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 28px; }
.mh__link { color: inherit; text-decoration: none; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; }`,
  settings: [
    { type: "text", id: "brand", label: "Title", default: "Maison Vale" },
    { type: "text", id: "issue_line", label: "Line above the title", default: "Autumn edit" },
    { type: "link_list", id: "menu", label: "Menu", default: "main-menu" },
    { type: "text", id: "nav_label", label: "Menu description", default: "Sections" },
  ],
})

const ISSUE_COVER = component({
  type: "ai_issue_cover",
  name: "Issue cover",
  category: "hero",
  template: `<section class="cv" data-scheme="{{ settings.color_scheme }}" style="{{ROOT}}">
  <p class="cv__label">{{ settings.label }}</p>
  <h1 class="cv__h">{{ settings.heading }}</h1>
  <div class="cv__dek">{{ settings.dek }}</div>
  {% if settings.link_label %}<a class="cv__more" href="{{ settings.link_url | default: '/journal' | url }}">{{ settings.link_label }}</a>{% endif %}
</section>`,
  style: `.cv { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; padding: calc(var(--s-pt) * 1.4) var(--theme-padding-x, 24px) var(--s-pb); background: var(--s-bg); color: var(--s-text); }
.cv__label { margin: 0; font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--s-accent); }
.cv__h { margin: 0; max-width: 14ch; font-family: var(--theme-font-heading, serif); font-weight: 400; font-size: clamp(48px, 8vw, 104px); line-height: 0.95; color: var(--s-heading); }
.cv__dek { max-width: 40rem; font-size: 19px; line-height: 1.5; }
.cv__more { justify-self: start; color: inherit; border-bottom: 1px solid currentColor; text-decoration: none; }
@container (min-width: 900px) { .cv { grid-template-columns: 2fr 1fr; align-items: end; } }`,
  settings: [
    { type: "text", id: "label", label: "Label", default: "The autumn edit" },
    { type: "text", id: "heading", label: "Heading", default: "Wool, cut close" },
    { type: "richtext", id: "dek", label: "Standfirst", default: "<p>Say in two lines what this collection is and who made it.</p>" },
    { type: "text", id: "link_label", label: "Link", default: "Read the journal" },
    { type: "url", id: "link_url", label: "Link goes to", default: "/journal" },
  ],
})

const ESSAY = component({
  type: "ai_essay_columns",
  name: "Essay in columns",
  template: `<section class="es" data-scheme="{{ settings.color_scheme }}" style="{{ROOT}}">
  <h2 class="es__h">{{ settings.heading }}</h2>
  <div class="es__body">{{ settings.body }}</div>
  <p class="es__by">{{ settings.byline }}</p>
</section>`,
  style: `.es { padding: var(--s-pt) var(--theme-padding-x, 24px) var(--s-pb); background: var(--s-bg); color: var(--s-text); }
.es__h { margin: 0 0 20px; font-family: var(--theme-font-heading, serif); font-weight: 400; font-size: 34px; color: var(--s-heading); }
.es__body { columns: 1; column-gap: 40px; line-height: 1.7; }
.es__by { margin-top: 18px; font-size: 13px; font-style: italic; }
@container (min-width: 760px) { .es__body { columns: 2; } }`,
  settings: [
    { type: "text", id: "heading", label: "Heading", default: "On making less" },
    { type: "richtext", id: "body", label: "Text", default: "<p>Write the story of the collection here: the cloth, the mill, the hands.</p>" },
    { type: "text", id: "byline", label: "Byline", default: "Words by the studio" },
  ],
})

const COLOPHON = component({
  type: "ai_colophon",
  name: "Colophon",
  kind: "footer",
  scheme: "site_inverse",
  template: `<footer class="cp" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }};">
  <p class="cp__name">{{ settings.brand }}</p>
  <ul class="cp__links">{% for link in settings.menu.links %}<li><a href="{{ link.url | url }}">{{ link.title }}</a></li>{% endfor %}</ul>
  <p class="cp__note">{{ settings.note }}</p>
</footer>`,
  style: `.cp { display: grid; gap: 14px; padding: 40px var(--theme-padding-x, 24px); background: var(--s-bg); color: var(--s-text); }
.cp__name { margin: 0; font-family: var(--theme-font-heading, serif); font-size: 28px; font-style: italic; }
.cp__links { display: flex; flex-wrap: wrap; gap: 18px; margin: 0; padding: 0; list-style: none; }
.cp__links a { color: inherit; }
.cp__note { margin: 0; font-size: 12px; }`,
  settings: [
    { type: "text", id: "brand", label: "Name", default: "Maison Vale" },
    { type: "link_list", id: "menu", label: "Links", default: "main-menu" },
    { type: "text", id: "note", label: "Small print", default: "Write where the studio is here." },
  ],
})

export const B: Design = {
  label: "B editorial fashion, its own header and footer",
  prompt: "An editorial site for my small fashion label: a cover story, a journal page, quiet and typographic.",
  concept: { ...CONCEPT, name: "Quiet issue", mood: ["quiet", "literary", "precise"], styles: ["editorial"], typeSystem: { display: "Cormorant Garamond", body: "Inter", scaleRatio: 1.5, rule: "Italic display, small caps labels" }, palette: { mode: "light", background: "#f7f5f0", text: "#141414", accent: "#7a5c3e", muted: "#6b6660", accentUse: "Labels only" }, layout: { principles: ["Centred masthead", "Text columns"], density: "airy", radius: 0 }, signatureMoves: ["A masthead like a magazine's"] },
  tokens: { colors: { background: "#f7f5f0", surface: "#efebe3", text: "#141414", muted: "#6b6660", accent: "#7a5c3e", accentText: "#ffffff", border: "#d9d3c7", inverse: { background: "#141414", text: "#f7f5f0", accent: "#c9a27e" } }, fonts: { heading: "Cormorant Garamond", body: "Inter" }, radius: { small: 0, medium: 0, large: 0 } },
  files: { "sections/ai_masthead.storelib": MASTHEAD, "sections/ai_issue_cover.storelib": ISSUE_COVER, "sections/ai_essay_columns.storelib": ESSAY, "sections/ai_colophon.storelib": COLOPHON },
  pages: [{ key: "journal", title: "Journal" }],
  compose: {
    home: [{ type: "ai_masthead", group: "header" }, { type: "ai_issue_cover" }, { type: "ai_essay_columns" }, { type: "ai_colophon", group: "footer" }],
    journal: [{ type: "ai_essay_columns", settings: { heading: "Journal" } }],
  },
}

/* ── C: music producer, bound to the store's products ──────────────────── */

const BEAT_HEADER = component({
  type: "ai_beat_header",
  name: "Studio bar",
  kind: "header",
  template: `<header class="sb" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-accent: {{ scheme.accent }};">
  <a class="sb__name" href="{{ settings.home_url | default: '/' | url }}">{{ settings.brand }}</a>
  <nav class="sb__nav" aria-label="{{ settings.nav_label }}">
    {% for link in settings.menu.links %}<a class="sb__shop" href="{{ link.url | url }}">{{ link.title }}</a>{% for child in link.links %}<a class="sb__shop" href="{{ child.url | url }}">{{ child.title }}</a>{% endfor %}{% endfor %}
  </nav>
  <button class="sb__cart" type="button" data-storelib-cart>{{ settings.cart_label }}</button>
</header>`,
  style: `.sb { display: flex; align-items: center; gap: 20px; padding: 12px var(--theme-padding-x, 20px); background: var(--s-bg); color: var(--s-text); font-family: var(--theme-font-body, monospace); }
.sb__name { margin-right: auto; color: inherit; text-decoration: none; font-weight: 700; letter-spacing: 0.08em; }
.sb__shop { color: var(--s-accent); text-decoration: none; }
.sb__cart { border: 1px solid currentColor; background: none; color: inherit; padding: 6px 12px; font: inherit; }`,
  settings: [
    { type: "text", id: "brand", label: "Name", default: "LOWEND" },
    { type: "url", id: "home_url", label: "Name links to", default: "/" },
    { type: "link_list", id: "menu", label: "Menu", default: "main-menu" },
    { type: "text", id: "nav_label", label: "Menu description", default: "Main" },
    { type: "text", id: "cart_label", label: "Cart button", default: "Cart" },
  ],
})

const BEAT_STORE = component({
  type: "ai_beat_store",
  name: "Beat store",
  category: "product",
  template: `<section class="bs" data-scheme="{{ settings.color_scheme }}" style="{{ROOT}}">
  <h2 class="bs__h">{{ settings.heading }}</h2>
  <ol class="bs__list">
    {% for item in settings.beats %}
      <li class="bs__row">
        <a class="bs__title" href="{{ item.settings.url | url }}">{{ item.settings.title }}</a>
        <button class="bs__add" type="button" data-storelib-add-to-cart="{{ item.id }}">{{ settings.add_label }}</button>
      </li>
    {% endfor %}
  </ol>
</section>`,
  style: `.bs { padding: var(--s-pt) var(--theme-padding-x, 20px) var(--s-pb); background: var(--s-bg); color: var(--s-text); }
.bs__h { margin: 0 0 16px; font-size: 22px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--s-heading); }
.bs__list { margin: 0; padding: 0; list-style: decimal-leading-zero inside; }
.bs__row { display: flex; align-items: baseline; gap: 16px; padding: 10px 0; border-bottom: 1px dashed var(--s-border); }
.bs__title { margin-right: auto; color: inherit; text-decoration: none; }
.bs__add { background: var(--s-btn); color: var(--s-btn-text); border: 0; padding: 6px 12px; font: inherit; }`,
  settings: [
    { type: "text", id: "heading", label: "Heading", default: "Beats for lease" },
    { type: "product_list", id: "beats", label: "Beats", limit: 12 },
    { type: "text", id: "add_label", label: "Add button", default: "Lease" },
  ],
})

const TRACKS = component({
  type: "ai_track_sheet",
  name: "Track sheet",
  template: `<section class="ts" data-scheme="{{ settings.color_scheme }}" style="{{ROOT}}">
  <h2 class="ts__h">{{ settings.heading }}</h2>
  <ul class="ts__list">
    {% for block in section.blocks %}<li class="ts__row" {{ block.shopify_attributes }}><span>{{ block.settings.name }}</span><span>{{ block.settings.bpm }}</span><span>{{ block.settings.key }}</span></li>{% endfor %}
  </ul>
</section>`,
  style: `.ts { padding: var(--s-pt) var(--theme-padding-x, 20px) var(--s-pb); background: var(--s-bg); color: var(--s-text); font-family: var(--theme-font-body, monospace); }
.ts__h { margin: 0 0 12px; font-size: 18px; color: var(--s-heading); }
.ts__list { margin: 0; padding: 0; list-style: none; }
.ts__row { display: grid; gap: 4px; padding: 8px 0; border-top: 1px solid var(--s-border); }
@container (min-width: 600px) { .ts__row { grid-template-columns: 1fr 80px 60px; } }`,
  settings: [{ type: "text", id: "heading", label: "Heading", default: "This month in the studio" }],
  blocks: [{ type: "track", name: "Track", settings: [{ type: "text", id: "name", label: "Name", default: "Track name" }, { type: "text", id: "bpm", label: "Tempo", default: "90 bpm" }, { type: "text", id: "key", label: "Key", default: "F minor" }] }],
})

const BEAT_FOOTER = component({
  type: "ai_beat_footer",
  name: "Studio footer",
  kind: "footer",
  template: `<footer class="sf" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }};"><p class="sf__line">{{ settings.line }}</p></footer>`,
  style: `.sf { padding: 18px var(--theme-padding-x, 20px); background: var(--s-bg); color: var(--s-text); font-size: 12px; }
.sf__line { margin: 0; }`,
  settings: [{ type: "text", id: "line", label: "Line", default: "Write your licence terms here." }],
})

export const C: Design = {
  label: "C music producer with product bindings",
  prompt: "A site for my beats: a list of beats people can lease, what I'm working on, dark and technical.",
  concept: { ...CONCEPT, name: "Patch bay", mood: ["dark", "technical", "dry"], styles: ["brutalist"], typeSystem: { display: "JetBrains Mono", body: "JetBrains Mono", scaleRatio: 1.2, rule: "Monospace everywhere" }, palette: { mode: "dark", background: "#0e0f0c", text: "#e6e8e3", accent: "#c6f432", muted: "#8a8f86", accentUse: "Buttons and the shop link" }, layout: { principles: ["Lists like a track sheet"], density: "dense", radius: 0 }, signatureMoves: ["Numbered rows like a sampler"] },
  tokens: { colors: { background: "#0e0f0c", surface: "#181a15", text: "#e6e8e3", muted: "#8a8f86", accent: "#c6f432", accentText: "#0e0f0c", border: "#2c2f28", inverse: { background: "#e6e8e3", text: "#0e0f0c", accent: "#3f5200" } }, fonts: { heading: "JetBrains Mono", body: "JetBrains Mono" }, radius: { small: 0, medium: 0, large: 0 } },
  files: { "sections/ai_beat_header.storelib": BEAT_HEADER, "sections/ai_beat_store.storelib": BEAT_STORE, "sections/ai_track_sheet.storelib": TRACKS, "sections/ai_beat_footer.storelib": BEAT_FOOTER },
  pages: [{ key: "beats", title: "Beats" }],
  compose: {
    home: [{ type: "ai_beat_header", group: "header" }, { type: "ai_track_sheet", blocks: [{ type: "track", settings: { name: "Night bus", bpm: "84 bpm", key: "D minor" } }, { type: "track", settings: { name: "Tape hiss", bpm: "92 bpm", key: "G minor" } }] }, { type: "ai_beat_store" }, { type: "ai_beat_footer", group: "footer" }],
    beats: [{ type: "ai_beat_store", settings: { heading: "Every beat" } }],
  },
}

/* ── D: minimal portfolio, one page, no header or footer ───────────────── */

const WORK_INDEX = component({
  type: "ai_work_index",
  name: "Work index",
  category: "hero",
  template: `<section class="wi" data-scheme="{{ settings.color_scheme }}" style="{{ROOT}}">
  <h1 class="wi__name">{{ settings.name }}</h1>
  <p class="wi__role">{{ settings.role }}</p>
  <table class="wi__table">
    {% for block in section.blocks %}<tr {{ block.shopify_attributes }}><td>{{ block.settings.year }}</td><td>{{ block.settings.title }}</td><td>{{ block.settings.client }}</td></tr>{% endfor %}
  </table>
  <a class="wi__contact" href="{{ settings.contact_url | default: '/contact' | url }}">{{ settings.contact_label }}</a>
</section>`,
  style: `.wi { max-width: 900px; padding: var(--s-pt) var(--theme-padding-x, 24px) var(--s-pb); background: var(--s-bg); color: var(--s-text); }
.wi__name { margin: 0; font-size: 20px; font-weight: 500; color: var(--s-heading); }
.wi__role { margin: 4px 0 40px; color: var(--s-accent); }
.wi__table { width: 100%; border-collapse: collapse; font-size: 15px; }
.wi__table td { padding: 6px 0; border-top: 1px solid var(--s-border); }
.wi__contact { display: inline-block; margin-top: 32px; color: inherit; }`,
  settings: [
    { type: "text", id: "name", label: "Name", default: "Ana Ruiz" },
    { type: "text", id: "role", label: "What you do", default: "Type designer" },
    { type: "text", id: "contact_label", label: "Contact link", default: "Write to me" },
    { type: "url", id: "contact_url", label: "Contact link goes to", default: "/contact" },
  ],
  blocks: [{ type: "work", name: "Project", settings: [{ type: "text", id: "year", label: "Year", default: "2026" }, { type: "text", id: "title", label: "Project", default: "Project name" }, { type: "text", id: "client", label: "For", default: "Client" }] }],
})

export const D: Design = {
  label: "D minimal portfolio, single page",
  prompt: "One page. My name, what I do, a plain list of projects by year. Nothing else.",
  concept: { ...CONCEPT, name: "Index card", mood: ["plain", "exact"], styles: ["minimal"], typeSystem: { display: "Inter", body: "Inter", scaleRatio: 1.125, rule: "One size, one weight" }, palette: { mode: "light", background: "#ffffff", text: "#111111", accent: "#555555", muted: "#6b6b6b", accentUse: "The role line" }, layout: { principles: ["A table, nothing else"], density: "airy", radius: 0 }, motion: { stance: "none", moves: [] }, signatureMoves: ["A table of contents for a life's work"] },
  tokens: { colors: { background: "#ffffff", surface: "#ffffff", text: "#111111", muted: "#6b6b6b", accent: "#555555", accentText: "#ffffff", border: "#e5e5e5", inverse: { background: "#111111", text: "#ffffff", accent: "#bbbbbb" } }, fonts: { heading: "Inter", body: "Inter" }, radius: { small: 0, medium: 0, large: 0 } },
  files: { "sections/ai_work_index.storelib": WORK_INDEX },
  pages: [],
  compose: { home: [{ type: "ai_work_index", blocks: [{ type: "work", settings: { year: "2026", title: "Vale Sans", client: "Maison Vale" } }, { type: "work", settings: { year: "2025", title: "Signage", client: "Leeds Library" } }] }] },
}

/* ── components the other scenarios write ─────────────────────────────── */

export const BANNER = component({
  type: "ai_offer_band",
  name: "Offer band",
  template: `<section class="ob" data-scheme="{{ settings.color_scheme }}" style="{{ROOT}}"><h2 class="ob__h">{{ settings.heading }}</h2><p class="ob__p">{{ settings.text }}</p></section>`,
  style: `.ob { padding: var(--s-pt) var(--theme-padding-x, 24px) var(--s-pb); background: var(--s-bg); color: var(--s-text); }
.ob__h { margin: 0; font-size: 28px; color: var(--s-heading); }
.ob__p { margin: 8px 0 0; }`,
  settings: [{ type: "text", id: "heading", label: "Heading", default: "New this month" }, { type: "text", id: "text", label: "Text", default: "Say what is new." }],
})

/** Every control kind scenario I edits through the editor: text, picture, colour, a layout select, a toggle, a range. */
export const KITCHEN = component({
  type: "ai_feature_panel",
  name: "Feature panel",
  template: `<section class="fp fp--{{ settings.layout }}" data-scheme="{{ settings.color_scheme }}" style="{{ROOT}} --fp-line: {{ settings.line_color }}; --fp-gap: {{ settings.gap }}px;">
  <h2 class="fp__h">{{ settings.heading }}</h2>
  {% if settings.photo %}<img class="fp__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="800" height="600">{% endif %}
  {% if settings.show_note %}<p class="fp__note">{{ settings.note }}</p>{% endif %}
</section>`,
  style: `.fp { display: grid; gap: var(--fp-gap); padding: var(--s-pt) var(--theme-padding-x, 24px) var(--s-pb); background: var(--s-bg); color: var(--s-text); border-top: 4px solid var(--fp-line); }
@container (min-width: 720px) { .fp--row { grid-template-columns: 1fr 1fr; } }
.fp__h { margin: 0; color: var(--s-heading); }
.fp__img { width: 100%; height: auto; }`,
  settings: [
    { type: "text", id: "heading", label: "Heading", default: "What you get" },
    { type: "image_picker", id: "photo", label: "Photo" },
    { type: "text", id: "photo_alt", label: "Photo description", default: "" },
    { type: "color", id: "line_color", label: "Line colour", default: "#c2410c" },
    { type: "select", id: "layout", label: "Layout", default: "stack", options: [{ label: "Stacked", value: "stack" }, { label: "Side by side", value: "row" }] },
    { type: "checkbox", id: "show_note", label: "Show the note", default: false },
    { type: "text", id: "note", label: "Note", default: "A note." },
    { type: "range", id: "gap", label: "Gap", min: 0, max: 64, step: 4, unit: "px", default: 16 },
  ],
})
