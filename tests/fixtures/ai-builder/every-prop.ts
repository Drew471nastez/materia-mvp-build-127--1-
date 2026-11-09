/**
 * An AI component that uses every editable prop kind (round L, L5), and a
 * template that reads every setting the way a component does. Shared by
 * tests/ai-builder-editor.test.ts and the sidebar screenshot harness.
 */
import { manifestToSchema } from "@/lib/ai-builder/manifest"
import type { ComponentManifest } from "@/lib/ai-builder/types"

/* ── a component that uses every prop kind ───────────────────────────── */

export const EVERY: ComponentManifest = {
  type: "ai_studio_hero",
  name: "Studio hero",
  description: "Every prop kind the editor draws.",
  category: "hero",
  runtime: "storelib",
  props: [
    { kind: "text", id: "eyebrow", label: "Eyebrow", default: "Pilates in Leeds", placeholder: "A short line", group: "Content" },
    { kind: "text", id: "heading", label: "Heading", default: "Move better, every week" },
    { kind: "textarea", id: "note", label: "Note", default: "Small classes." },
    { kind: "richtext", id: "intro", label: "Intro", default: "<p>Six people a class.</p>" },
    { kind: "richtext", id: "tagline", label: "Tagline", default: "Book <em>today</em>", inline: true },
    { kind: "image", id: "photo", label: "Photo", focalPoint: true },
    { kind: "video", id: "clip", label: "Clip", source: "url" },
    { kind: "video", id: "upload", label: "Upload", source: "upload" },
    { kind: "link", id: "cta_url", label: "Button link", default: "/contact" },
    { kind: "icon", id: "cta_icon", label: "Button icon", default: "arrow-right" },
    { kind: "boolean", id: "show_badge", label: "Show the badge", default: true },
    { kind: "visibility", id: "badge_on", label: "Badge shows on", default: "desktop", visibleIf: "{{ section.settings.show_badge }}" },
    { kind: "color", id: "accent", label: "Accent", default: "#c2410c", group: "Style" },
    { kind: "color_scheme", id: "color_scheme", label: "Colour scheme", default: "white" },
    { kind: "font", id: "heading_font", label: "Heading font", default: "Inter" },
    { kind: "background", id: "band", label: "Band background", default: "#f4efe9" },
    { kind: "select", id: "layout", label: "Layout", default: "split", options: [{ label: "Split", value: "split" }, { label: "Stacked", value: "stacked" }] },
    { kind: "select", id: "align_mode", label: "Mode", default: "a", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], style: "radio" },
    { kind: "alignment", id: "text_align", label: "Text alignment", default: "left", responsive: true },
    { kind: "number", id: "columns", label: "Columns", min: 1, max: 4, step: 1, default: 2, slider: true, responsive: true },
    { kind: "number", id: "max_items", label: "Most items", min: 1, max: 12, default: 6 },
    { kind: "number", id: "photo_px", label: "Photo size", min: 120, max: 800, step: 10, unit: "px", default: 420, slider: true },
    { kind: "radius", id: "card_radius", label: "Card corners", default: 12 },
    { kind: "shadow", id: "card_shadow", label: "Card shadow", default: "md" },
    { kind: "border", id: "card_border", label: "Card border", default: 1, colorDefault: "#e7e5e4" },
    { kind: "size", id: "media_width", label: "Media width", min: 30, max: 70, unit: "%", default: 50, responsive: true },
    { kind: "spacing", id: "padding_top", label: "Padding top", min: 0, max: 160, default: 80, group: "Spacing", responsive: true },
    { kind: "spacing", id: "padding_bottom", label: "Padding bottom", min: 0, max: 160, default: 80 },
    { kind: "animation", id: "animation", label: "Animation", default: "rise", timing: true, group: "Motion" },
    { kind: "binding", id: "program", label: "Program", binding: "product", group: "Data" },
    { kind: "binding", id: "plans", label: "Plans", binding: "products", limit: 3 },
    { kind: "binding", id: "range", label: "Range", binding: "collection" },
    { kind: "binding", id: "ranges", label: "Ranges", binding: "collections", limit: 4 },
    { kind: "binding", id: "club", label: "Club", binding: "community" },
    { kind: "binding", id: "about", label: "About page", binding: "page" },
    { kind: "binding", id: "menu", label: "Menu", binding: "menu" },
  ],
  items: [
    {
      type: "result",
      name: "Client result",
      limit: 6,
      props: [
        { kind: "text", id: "name", label: "Name", default: "Sam" },
        { kind: "textarea", id: "quote", label: "Quote", default: "Down two sizes." },
        { kind: "image", id: "portrait", label: "Portrait" },
        { kind: "visibility", id: "shows_on", label: "Shows on" },
        { kind: "border", id: "edge", label: "Edge" },
      ],
    },
  ],
  maxItems: 6,
  placement: { groups: ["body"] },
  capabilities: ["embed"],
  tokens: ["radius-md", "shadow-md"],
}

/** A template that reads every setting the way a component does. */
export const TEMPLATE = `<template>
<section class="sh sh--{{ settings.layout }} sh--{{ settings.align_mode }}" data-scheme="{{ settings.color_scheme }}" style="--sh-accent: {{ settings.accent }}; --sh-band: {{ settings.band }}; --sh-font: {{ settings.heading_font }}; --sh-pt: {{ settings.padding_top.desktop }}px; --sh-pt-m: {{ settings.padding_top.mobile }}px; --sh-pb: {{ settings.padding_bottom }}px; --sh-r: {{ settings.card_radius }}px; --sh-shadow: var(--t-shadow-{{ settings.card_shadow }}, none); --sh-bw: {{ settings.card_border }}px; --sh-bc: {{ settings.card_border_color | default: 'var(--scheme-border)' }}; --sh-mw: {{ settings.media_width.desktop }}%; --sh-cols: {{ settings.columns.desktop }}; --sh-photo: {{ settings.photo_px }}px;">
  <p class="sh__eyebrow" style="text-align: {{ settings.text_align.desktop }}">{{ settings.eyebrow }}</p>
  <h1 class="sh__h">{{ settings.heading }}</h1>
  <p class="sh__note">{{ settings.note }}</p>
  <div class="sh__intro">{{ settings.intro | raw }}</div>
  <p class="sh__tag">{{ settings.tagline | raw }}</p>
  {% if settings.show_badge %}<span class="sh__badge" data-show-on="{{ settings.badge_on }}">New</span>{% endif %}
  {% if settings.photo %}<img src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" style="object-position: {{ settings.photo_focus }}" width="800" height="1000">{% endif %}
  {% if settings.clip %}<iframe class="sh__clip" src="{{ settings.clip | embed }}" title="Clip"></iframe>{% endif %}
  {% if settings.upload %}<video src="{{ settings.upload | asset }}"></video>{% endif %}
  <a class="sh__cta" href="{{ settings.cta_url | default: '#' | url }}" data-icon="{{ settings.cta_icon }}">Book</a>
  <p class="sh__max">{{ settings.max_items }}</p>
  {% if settings.program %}<a href="{{ settings.program | url }}">{{ settings.program.title }}</a>{% endif %}
  {% for p in settings.plans %}<i>{{ p.settings.title }}</i>{% endfor %}
  {% if settings.range %}<a href="{{ settings.range | url }}">{{ settings.range.title }}</a>{% endif %}
  {% for c in settings.ranges %}<i>{{ c.settings.title }}</i>{% endfor %}
  {% if settings.club %}<a href="{{ settings.club | url }}">{{ settings.club.name }}</a>{% endif %}
  {% if settings.about %}<a href="{{ settings.about | url }}">About</a>{% endif %}
  {% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}
  {% for block in section.blocks %}<blockquote class="sh__q" data-show-on="{{ block.settings.shows_on }}" style="border: {{ block.settings.edge }}px solid {{ block.settings.edge_color | default: 'currentColor' }}" {{ block.shopify_attributes }}>{{ block.settings.quote }} <cite>{{ block.settings.name }}</cite>{% if block.settings.portrait %}<img src="{{ block.settings.portrait | asset }}" alt="{{ block.settings.portrait_alt }}" width="80" height="80">{% endif %}</blockquote>{% endfor %}
</section>
</template>

<style scoped>
.sh { padding: var(--sh-pt) 0 var(--sh-pb); background: var(--sh-band); }
.sh__cta { color: var(--sh-accent); border-radius: var(--t-radius-md, 8px); box-shadow: var(--sh-shadow); }
.sh__q { border-radius: var(--sh-r); }
</style>

<script>
// kept byte for byte
const x = 1
</script>
`


/** The whole .storelib file. */
export function everyPropSource(m: ComponentManifest = EVERY): string {
  return `${TEMPLATE}\n<schema>\n${JSON.stringify(manifestToSchema(m), null, 2)}\n</schema>\n`
}
