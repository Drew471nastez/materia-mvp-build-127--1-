/**
 * Fixtures for tests/ai-builder-agent.test.ts: the components a scripted
 * "model" writes for a fitness coach, and a scripted provider that plays a
 * list of turns. Every component is original (no theme section copied) and
 * passes the same checks a real model's files are held to.
 */
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"

const ROOT_VARS = `--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-heading: {{ scheme.heading }}; --s-accent: {{ scheme.accent }}; --s-btn: {{ scheme.primary_btn_bg }}; --s-btn-text: {{ scheme.primary_btn_text }}; --s-btn-hover: {{ scheme.primary_btn_hover_bg }}; --s-btn-hover-text: {{ scheme.primary_btn_hover_text }}; --s-border: {{ scheme.border }}; --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px;`

const SPACING = `
    { "type": "header", "id": "hdr_spacing", "label": "Spacing" },
    { "type": "range", "id": "padding_top", "label": "Top padding", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 72 },
    { "type": "range", "id": "padding_bottom", "label": "Bottom padding", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 72 }`

export const HEADER = `<template>
<header class="ch" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-accent: {{ scheme.accent }};">
  <a class="ch__brand" href="{{ settings.home_url | default: '/' | url }}">{{ settings.brand }}</a>
  <nav class="ch__nav" aria-label="{{ settings.nav_label }}">
    {% for link in settings.menu.links %}
      <a class="ch__link" href="{{ link.url | url }}">{{ link.title }}</a>
      {% for child in link.links %}<a class="ch__sub" href="{{ child.url | url }}">{{ child.title }}</a>{% endfor %}
    {% endfor %}
  </nav>
  <button class="ch__menu" type="button" data-storelib-menu="{{ settings.menu.handle }}">{{ settings.menu_label }}</button>
</header>
</template>

<style scoped>
.ch { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px var(--theme-padding-x, 24px); background: var(--s-bg); color: var(--s-text); }
.ch__brand { font-family: var(--theme-font-heading, {{ theme.typography.heading }}), serif; font-size: 20px; letter-spacing: 0.04em; text-transform: uppercase; color: inherit; text-decoration: none; }
.ch__nav { display: none; gap: 22px; }
.ch__link, .ch__sub { color: inherit; text-decoration: none; font-size: 14px; }
.ch__link:hover { color: var(--s-accent); }
.ch__menu { border: 0; background: none; color: inherit; font: inherit; }
@container (min-width: 760px) { .ch__nav { display: flex; } .ch__menu { display: none; } }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_header",
  "name": "Coach header",
  "kind": "header",
  "enabled_on": { "groups": ["header"] },
  "settings": [
    { "type": "text", "id": "brand", "label": "Name", "default": "Iron & Chalk" },
    { "type": "url", "id": "home_url", "label": "Name links to", "default": "/" },
    { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" },
    { "type": "text", "id": "nav_label", "label": "Menu description", "default": "Main" },
    { "type": "text", "id": "menu_label", "label": "Menu button", "default": "Menu" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "site" }
  ]
}
</schema>
`

export const HERO = `<template>
<section class="hx hx--{{ settings.layout }}" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <div class="hx__copy">
    {% if settings.kicker %}<p class="hx__kicker">{{ settings.kicker }}</p>{% endif %}
    <h1 class="hx__h">{{ settings.heading }}</h1>
    {% if settings.intro %}<div class="hx__intro">{{ settings.intro }}</div>{% endif %}
    {% if settings.cta_label %}<a class="hx__cta" href="{{ settings.cta_url | default: '#' | url }}">{{ settings.cta_label }}</a>{% endif %}
  </div>
  {% if settings.photo %}<img class="hx__photo" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="900" height="1100">{% endif %}
</section>
</template>

<style scoped>
.hx { display: grid; gap: 32px; padding: calc(var(--s-pt) * var(--theme-spacing-scale, 1)) var(--theme-padding-x, 24px) calc(var(--s-pb) * var(--theme-spacing-scale, 1)); background: var(--s-bg); color: var(--s-text); container-type: inline-size; }
.hx__kicker { margin: 0 0 10px; font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--s-accent); }
.hx__h { margin: 0; font-family: var(--theme-font-heading, {{ theme.typography.heading }}), serif; font-size: clamp(40px, 9cqi, 112px); line-height: 0.92; color: var(--s-heading); }
.hx__intro { max-width: 34rem; margin-top: 18px; font-size: 18px; line-height: 1.55; }
.hx__cta { display: inline-block; margin-top: 28px; padding: 14px 22px; background: var(--s-btn); color: var(--s-btn-text); text-decoration: none; border-radius: var(--t-radius, 2px); }
.hx__cta:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.hx__photo { width: 100%; height: auto; object-fit: cover; }
@container (min-width: 820px) { .hx--split { grid-template-columns: 1.2fr 1fr; align-items: end; } }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_hero",
  "name": "Coach hero",
  "category": "hero",
  "settings": [
    { "type": "text", "id": "kicker", "label": "Small line above", "default": "Strength coaching, small groups" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Lift with a plan" },
    { "type": "richtext", "id": "intro", "label": "Intro", "default": "<p>Tell people who you coach and how a first week looks.</p>" },
    { "type": "text", "id": "cta_label", "label": "Button", "default": "See the programs" },
    { "type": "url", "id": "cta_url", "label": "Button link", "default": "/programs" },
    { "type": "image_picker", "id": "photo", "label": "Photo" },
    { "type": "text", "id": "photo_alt", "label": "Photo description", "default": "" },
    { "type": "select", "id": "layout", "label": "Layout", "default": "split", "options": [{ "label": "Split", "value": "split" }, { "label": "Stacked", "value": "stacked" }] },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "site" },${SPACING}
  ]
}
</schema>
`

export const PROGRAMS = `<template>
<section class="pg" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <h2 class="pg__h">{{ settings.heading }}</h2>
  <ol class="pg__list">
    {% for block in section.blocks %}
      <li class="pg__item" {{ block.shopify_attributes }}>
        <span class="pg__name">{{ block.settings.name }}</span>
        <span class="pg__when">{{ block.settings.when }}</span>
        <p class="pg__detail">{{ block.settings.detail }}</p>
      </li>
    {% endfor %}
  </ol>
  {% if settings.product %}<a class="pg__buy" href="{{ settings.product | url }}" data-storelib-add-to-cart="{{ settings.product.id }}">{{ settings.buy_label }}</a>{% endif %}
</section>
</template>

<style scoped>
.pg { padding: calc(var(--s-pt) * var(--theme-spacing-scale, 1)) var(--theme-padding-x, 24px) calc(var(--s-pb) * var(--theme-spacing-scale, 1)); background: var(--s-bg); color: var(--s-text); }
.pg__h { margin: 0 0 24px; font-family: var(--theme-font-heading, {{ theme.typography.heading }}), serif; font-size: 40px; color: var(--s-heading); }
.pg__list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--s-border); }
.pg__item { display: grid; gap: 6px; padding: 18px 0; border-bottom: 1px solid var(--s-border); }
.pg__name { font-size: 22px; }
.pg__when { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--s-accent); }
.pg__detail { margin: 0; }
.pg__buy { display: inline-block; margin-top: 24px; padding: 12px 20px; background: var(--s-btn); color: var(--s-btn-text); text-decoration: none; }
.pg__buy:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_program_list",
  "name": "Program list",
  "category": "text",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Programs" },
    { "type": "product_picker", "id": "product", "label": "Program to buy" },
    { "type": "text", "id": "buy_label", "label": "Buy button", "default": "Join" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "site" },${SPACING}
  ],
  "blocks": [
    { "type": "program", "name": "Program", "settings": [
      { "type": "text", "id": "name", "label": "Name", "default": "Your program name" },
      { "type": "text", "id": "when", "label": "When", "default": "Your class times go here" },
      { "type": "textarea", "id": "detail", "label": "What it is", "default": "Describe who it is for and what a session looks like." }
    ] }
  ],
  "max_blocks": 8
}
</schema>
`

export const FOOTER = `<template>
<footer class="cf" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }};">
  <p class="cf__line">{{ settings.line }}</p>
  <a class="cf__mail" href="{{ settings.contact_url | default: '#' | url }}">{{ settings.contact_label }}</a>
</footer>
</template>

<style scoped>
.cf { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 28px var(--theme-padding-x, 24px); background: var(--s-bg); color: var(--s-text); font-size: 14px; }
.cf__mail { color: inherit; }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_footer",
  "name": "Coach footer",
  "kind": "footer",
  "enabled_on": { "groups": ["footer"] },
  "settings": [
    { "type": "text", "id": "line", "label": "Line", "default": "Your studio address goes here" },
    { "type": "text", "id": "contact_label", "label": "Contact link", "default": "Get in touch" },
    { "type": "url", "id": "contact_url", "label": "Contact link goes to", "default": "/about" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "site_inverse" }
  ]
}
</schema>
`

export const ABOUT = `<template>
<section class="ab ab--{{ settings.align }}" data-scheme="{{ settings.color_scheme }}" style="${ROOT_VARS}">
  <h2 class="ab__h">{{ settings.heading }}</h2>
  <div class="ab__body">{{ settings.body }}</div>
  {% if settings.show_note %}<p class="ab__note">{{ settings.note }}</p>{% endif %}
</section>
</template>

<style scoped>
.ab { padding: calc(var(--s-pt) * var(--theme-spacing-scale, 1)) var(--theme-padding-x, 24px) calc(var(--s-pb) * var(--theme-spacing-scale, 1)); background: var(--s-bg); color: var(--s-text); }
.ab--center { text-align: center; }
.ab__h { margin: 0; font-family: var(--theme-font-heading, {{ theme.typography.heading }}), serif; font-size: 36px; color: var(--s-heading); }
.ab__body { max-width: 38rem; margin-top: 16px; line-height: 1.6; }
.ab--center .ab__body { margin-inline: auto; }
.ab__note { margin-top: 20px; font-size: 13px; color: var(--s-accent); }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_story",
  "name": "Coach story",
  "category": "text",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Who coaches you" },
    { "type": "richtext", "id": "body", "label": "Story", "default": "<p>Your story goes here: how you started coaching and who you work with.</p>" },
    { "type": "checkbox", "id": "show_note", "label": "Show the note", "default": true },
    { "type": "text", "id": "note", "label": "Note", "default": "Write your qualifications here." },
    { "type": "select", "id": "align", "label": "Text sits", "default": "left", "options": [{ "label": "Left", "value": "left" }, { "label": "Centre", "value": "center" }] },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "site" },${SPACING}
  ]
}
</schema>
`

/** The hero with a template mistake: an unclosed {% if %}. */
export const BROKEN_HERO = HERO.replace("{{ settings.intro }}</div>{% endif %}", "{{ settings.intro }}</div>")

export const CAPS: RuntimeCapabilities = {
  store: { name: "Iron & Chalk", currency: "GBP", brandImage: null, tagline: null },
  products: [{ id: "prod_8week", title: "8 week strength block", kind: "service", price: "£120", url: "/products/8-week-strength-block" }],
  collections: [],
  communities: [],
  forms: [],
  pages: [],
  menus: [],
  blog: { posts: 0 },
  reviews: { count: 0, average: null },
  features: ["shop"],
}

export const CONCEPT = {
  name: "Chalk and Iron",
  mood: ["blunt", "warm", "exact"],
  styles: ["industrial", "editorial"],
  typeSystem: { display: "Oswald", body: "Inter", scaleRatio: 1.333, rule: "Display in capitals, tracked wide" },
  palette: { mode: "light", background: "#f4efe6", text: "#1d1b18", accent: "#c2410c", muted: "#5c564d", accentUse: "Buttons and session times only" },
  layout: { principles: ["Big left aligned display type", "Ruled lists instead of cards"], density: "balanced", radius: 2 },
  motion: { stance: "subtle", moves: ["Headings rise once"] },
  imagery: { direction: "Grainy daylight gym photos, chalk dust", avoid: ["stock smiles"] },
  signatureMoves: ["Session times set like a train board"],
}

/* ── the scripted provider ─────────────────────────────────────────────── */

export type PlainStep = { text?: string; calls?: [string, Record<string, unknown>][]; stop?: ProviderTurn["stop"]; throws?: string; usage?: { input: number; output: number } }
export type Step = PlainStep | ((req: ProviderRequest) => PlainStep)

/** Plays the steps in order, one per call; records every request. After the last step it keeps calling finish. */
export function scripted(steps: Step[], opts: { id?: string } = {}): AgentProvider & { requests: ProviderRequest[]; calls: number } {
  let i = 0
  const self = {
    id: opts.id ?? "fake",
    requests: [] as ProviderRequest[],
    calls: 0,
    async complete(req: ProviderRequest): Promise<ProviderTurn> {
      self.requests.push({ ...req, turns: [...req.turns] })
      self.calls++
      const next: Step = steps[i++] ?? { calls: [["finish", { summary: "Done." }]] }
      const step: PlainStep = typeof next === "function" ? next(req) : next
      if (step.throws) throw new Error(step.throws)
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], n) => ({ id: `call_${self.calls}_${n}`, name, argumentsJson: JSON.stringify(args) }))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [{ type: "text", text: step.text ?? "" }, ...toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: JSON.parse(c.argumentsJson) }))],
        usage: { inputTokens: step.usage?.input ?? 4_000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: step.usage?.output ?? 800 },
        stop: step.stop ?? (toolCalls.length ? "tool_calls" : "done"),
      }
    },
  }
  return self
}
