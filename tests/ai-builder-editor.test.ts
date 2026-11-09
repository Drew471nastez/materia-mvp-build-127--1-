/**
 * Round L, L5: AI-written components are fully editable in the editor.
 *
 *   1. Every prop kind round-trips: manifest -> <schema> -> the real
 *      compiler and the editor's schema reader -> a control the sidebar
 *      draws -> a value the editor's sanitiser keeps -> the engine renders
 *      it -> schemaToManifest reads the same manifest back.
 *   2. withManifest never flattens a file: template, style, script, presets
 *      and settings no prop kind describes survive.
 *   3. Design tokens: tokensToThemeSettings and back, `--t-*` from Theme
 *      settings (one source of truth), custom tokens cleaned, a site
 *      without tokens unchanged, a component's own value over the token.
 *   4. Merge safety: version checked saves (sha256 of the draft), a
 *      conflict carries the draft and who wrote it, history by author.
 *   5. The editor wiring is in place (source checks): form_picker drawn,
 *      animation control, timing on the page, Edit with AI, tokens panel.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-builder-editor.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { controlFor } from "@/lib/storelib-theme/controls/registry"
import { renderSection } from "@/lib/storelib-theme/render"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { ownSectionFields, sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { visibleFields } from "@/lib/storelib-theme/visible-if"
import { SECTION_ANIMATIONS } from "@/lib/website-builder/section-anchors"
import { themeVars } from "@/lib/website-builder/theme-css"
import { CONTROLS } from "@/lib/storelib-theme/controls/registry"
import {
  BINDING_CONTROL,
  PROP_CONTROL,
  RESPONSIVE_CONTROLS,
  REDUCED_MOTION_NOTE,
  manifestToSchema,
  normalizeManifest,
  propsToSettings,
  schemaJsonOf,
  schemaToManifest,
  sectionAnimationValue,
  withManifest,
} from "@/lib/ai-builder/manifest"
import { cleanTokenValue, customTokens, hasTokens, themeSettingsToTokens, tokenUsage, tokenVars, tokensToThemeSettings } from "@/lib/ai-builder/tokens"
import { SECTION_ANIMATION_VALUES, type ComponentManifest, type DesignTokens, type EditablePropKind } from "@/lib/ai-builder/types"
import { fileVersion } from "@/lib/ai-builder/file-version"
import { versionAuthorLabel, conflictChoiceLabels } from "@/lib/ai-builder/version-labels"
import { componentEditPrompt } from "@/lib/ai-builder/edit-request"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* ── a component that uses every prop kind ───────────────────────────── */

const EVERY: ComponentManifest = {
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
const TEMPLATE = `<template>
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
.sh__cta { color: var(--sh-accent); border-radius: var(--sh-r, var(--t-radius-md, 8px)); box-shadow: var(--sh-shadow); }
</style>

<script>
// kept byte for byte
const x = 1
</script>
`

function sourceFor(m: ComponentManifest, extra?: (schema: Record<string, unknown>) => void): string {
  const schema = manifestToSchema(m)
  extra?.(schema)
  return `${TEMPLATE}\n<schema>\n${JSON.stringify(schema, null, 2)}\n</schema>\n`
}

/* form_picker is L4's control type (the registry and the resolver): until it lands the compiler does not know it, so the form binding is checked on its own. */
const withoutForm = (m: ComponentManifest): ComponentManifest => ({ ...m, props: m.props.filter((p) => !(p.kind === "binding" && p.binding === "form")) })
const registeredByEditor = new Set(read("components/website-builder/editor/controls/index.tsx").match(/export const REGISTERED_CONTROLS = \[([\s\S]*?)\]/)?.[1].match(/"([a-z_]+)"/g)?.map((s) => s.slice(1, -1)) ?? [])
/* The types FieldControl in the editor page draws itself, after the registered ones. */
const editorPage = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
const drawnByEditor = (t: string) => registeredByEditor.has(t) || new RegExp(`kind === "${t}"`).test(editorPage)

function main() {
  console.log("\n1. every prop kind, schema to control to value to render, and back")
  const kinds = new Set<EditablePropKind>(EVERY.props.map((p) => p.kind))
  const allKinds = [...Object.keys(PROP_CONTROL), "binding"] as EditablePropKind[]
  check("the test component uses every prop kind", allKinds.every((k) => kinds.has(k)), allKinds.filter((k) => !kinds.has(k)))
  check("responsive controls are the registry's", [...RESPONSIVE_CONTROLS].every((t) => controlFor(t)?.responsive === true) && Object.values(CONTROLS).filter((c) => c.responsive).every((c) => RESPONSIVE_CONTROLS.has(c.type as never)))
  check("animation values are the ones the page plays", SECTION_ANIMATION_VALUES.join(",") === SECTION_ANIMATIONS.join(","))
  check("older animation names are read as the page's", sectionAnimationValue("fade-up") === "fade_up" && sectionAnimationValue("zoom-in") === "zoom" && sectionAnimationValue("nope") === "theme")

  const source = sourceFor(EVERY)
  const compiled = compileSection(source, { file: "sections/ai_studio_hero.storelib", expectType: "ai_studio_hero" })
  check("the real compiler accepts every kind", compiled.ok, compiled.ok ? undefined : (compiled as { errors: unknown[] }).errors.slice(0, 5))
  const warnings = compiled.ok ? ((compiled.value as unknown as { warnings?: { message: string }[] }).warnings ?? []).map((w) => w.message) : []
  check("and has nothing to say about settings the page reads (animation timing)", !warnings.some((w) => /animation_(duration|delay)/.test(w)), warnings)

  const schema = schemasFromSources({ "sections/ai_studio_hero.storelib": source })["ai_studio_hero"]
  const fields = schema?.fields ?? []
  const settings = propsToSettings(EVERY.props)
  check("the editor's schema reader sees every setting", settings.every((s) => fields.some((f) => f.id === s.id)), settings.filter((s) => !fields.some((f) => f.id === s.id)).map((s) => s.id))
  const undrawn = [...new Set(fields.map((f) => String(f.type)).filter((t) => t !== "header" && !drawnByEditor(t)))]
  check("every field is drawn by a control the sidebar has", undrawn.length === 0, undrawn)
  check("form bindings are drawn by the form picker", BINDING_CONTROL.form === "form_picker" && registeredByEditor.has("form_picker"))
  check("responsive survives where the control takes it", ["columns", "padding_top", "media_width", "text_align"].every((id) => fields.find((f) => f.id === id)?.responsive === true))
  check("and is dropped where it would fail the schema", !settings.some((s) => s.responsive && !RESPONSIVE_CONTROLS.has(s.type)))
  const anim = fields.find((f) => f.id === "animation")
  check("animation is the page's own setting, with the reduced motion note", !!anim && anim.type === "select" && anim.default === "rise" && anim.info === REDUCED_MOTION_NOTE && (anim.options ?? []).map((o) => o.value).join(",") === SECTION_ANIMATIONS.join(","))
  check("its duration and delay show while it plays", visibleFields(fields, { animation: "none" }).every((f) => !/^animation_(duration|delay)$/.test(f.id)) && visibleFields(fields, { animation: "fade" }).filter((f) => /^animation_(duration|delay)$/.test(f.id)).length === 2)
  check("a border's colour shows once it has a width", !visibleFields(fields, { card_border: 0 }).some((f) => f.id === "card_border_color") && visibleFields(fields, { card_border: 2 }).some((f) => f.id === "card_border_color"))
  const blockBorder = schema?.blocks?.find((b) => b.type === "result")?.fields.find((f) => f.id === "edge_color")
  check("an item's conditions read the item", !!blockBorder && /block\.settings\.edge/.test(String(blockBorder.visible_if)))

  /* A value per kind, as a person sets it in the sidebar. */
  const values: Record<string, unknown> = {
    eyebrow: "EYEBROW_X", heading: "HEADING_X", note: "NOTE_X", intro: "<p>INTRO_X</p>", tagline: "TAG_<strong>X</strong>", photo: "https://cdn.example.com/p.jpg", photo_alt: "ALT_X", photo_focus: "30% 70%",
    clip: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", upload: "https://cdn.example.com/v.mp4", cta_url: "/pages/book", cta_icon: "calendar", show_badge: true, badge_on: "mobile",
    accent: "#0f766e", color_scheme: "dark", heading_font: "Lora", band: "linear-gradient(90deg, #fff 0%, #eee 100%)", layout: "stacked", align_mode: "b",
    text_align: { desktop: "center", mobile: "left" }, columns: { desktop: 3, mobile: 1 }, max_items: 9, photo_px: 500, card_radius: 20, card_shadow: "lg", card_border: 2, card_border_color: "#123456",
    media_width: { desktop: 60, mobile: 100 }, padding_top: { desktop: 120, mobile: 48 }, padding_bottom: 40, animation: "zoom", animation_duration: 900, animation_delay: 200,
  }
  const instance = { id: "ai_studio_hero-1", type: "ai_studio_hero", settings: values, blocks: [{ id: "b1", type: "result", settings: { name: "NAME_X", quote: "QUOTE_X", shows_on: "desktop", edge: 3, edge_color: "#abcdef" } }] }
  const kept = sanitizeSections([instance as never], ownSectionFields([{ path: "sections/ai_studio_hero.storelib", content: source, draft_content: null }] as never))[0] as unknown as typeof instance
  const lost = Object.keys(values).filter((k) => JSON.stringify(kept.settings[k]) !== JSON.stringify(values[k]) && k !== "intro" && k !== "tagline")
  check("the editor's save keeps every value as set", lost.length === 0, lost.map((k) => [k, kept.settings[k]]))
  check("rich text is kept, cleaned", /INTRO_X/.test(String(kept.settings.intro)) && /<strong>X<\/strong>/.test(String(kept.settings.tagline)))

  if (compiled.ok) {
    const r = renderSection({ compiled: compiled.value, id: instance.id, instance: kept as never, theme: {}, page: { template: "index" } } as never)
    const html = r.html
    const expectIn: [string, RegExp][] = [
      ["text", /EYEBROW_X/], ["textarea", /NOTE_X/], ["richtext", /<p>INTRO_X<\/p>/], ["inline richtext", /TAG_<strong>X<\/strong>/], ["image", /p\.jpg/], ["image alt", /alt="ALT_X"/], ["focal point", /object-position: 30% 70%/],
      ["video url", /youtube(-nocookie)?\.com\/embed\/dQw4w9WgXcQ/], ["video upload", /v\.mp4/], ["link", /href="\/pages\/book"/], ["icon", /data-icon="calendar"/], ["boolean + visibility", /data-show-on="mobile"/], ["color", /--sh-accent: #0f766e/],
      ["color scheme", /data-scheme="dark"/], ["font", /--sh-font: Lora/], ["background", /--sh-band: linear-gradient/], ["select", /sh--stacked/], ["radio", /sh--b/], ["alignment (responsive)", /text-align: center/],
      ["number slider (responsive)", /--sh-cols: 3/], ["number", /sh__max">9</], ["number px", /--sh-photo: 500px/], ["radius", /--sh-r: 20px/], ["shadow", /var\(--t-shadow-lg, none\)/], ["border", /--sh-bw: 2px/], ["border colour", /--sh-bc: #123456/],
      ["size (responsive)", /--sh-mw: 60%/], ["spacing (responsive, desktop)", /--sh-pt: 120px/], ["spacing (responsive, phone)", /--sh-pt-m: 48px/], ["spacing", /--sh-pb: 40px/], ["items", /QUOTE_X.*NAME_X/s], ["item visibility", /data-show-on="desktop"/], ["item border", /border: 3px solid #abcdef/],
    ]
    const missing = expectIn.filter(([, re]) => !re.test(html)).map(([k]) => k)
    check("the engine renders every value", missing.length === 0, { missing, html: html.slice(html.indexOf("<section"), html.indexOf("<section") + 1400) })
  }

  const back = schemaToManifest(source)
  const want = normalizeManifest(withoutForm(EVERY))
  check("schemaToManifest reads the same manifest back", !!back && canon(back.manifest) === canon(want), back ? diff(want, back.manifest) : "no schema")
  check("nothing it could not read", !!back && back.unmapped.length === 0, back?.unmapped)
  const formOnly: ComponentManifest = { ...EVERY, props: [{ kind: "binding", id: "signup", label: "Sign up form", binding: "form" }], items: undefined, maxItems: undefined }
  const formBack = schemaToManifest(manifestToSchema(formOnly))
  check("a form binding round-trips through the schema", canon(formBack?.manifest.props) === canon(formOnly.props), formBack?.manifest.props)

  console.log("\n2. a file is never flattened")
  const hand = source.replace('"settings": [', '"settings": [\n    { "type": "html", "id": "embed", "label": "Embed" },').replace('"schema_version": 1,', '"schema_version": 1,\n  "presets": [{ "name": "Studio hero" }],')
  const handRead = schemaToManifest(hand)
  check("a setting no prop kind describes is reported, not dropped", !!handRead && handRead.unmapped.some((u) => u.setting.id === "embed"))
  const renamed = { ...handRead!.manifest, props: handRead!.manifest.props.map((p) => (p.id === "heading" ? { ...p, label: "Main heading" } : p)) }
  const written = withManifest(hand, renamed)!
  const writtenSchema = schemaJsonOf(written)!
  check("withManifest changes the label", (writtenSchema.settings as { id: string; label: string }[]).some((s) => s.id === "heading" && s.label === "Main heading"))
  check("and keeps the html setting and the presets", (writtenSchema.settings as { id: string }[]).some((s) => s.id === "embed") && Array.isArray(writtenSchema.presets))
  check("and the template, style and script byte for byte", written.startsWith(TEMPLATE) && written.includes("// kept byte for byte"))
  check("and the result still compiles", compileSection(written, { file: "sections/ai_studio_hero.storelib" }).ok)
  check("a file with no schema is left alone", withManifest("<template>x</template>", EVERY) === null && schemaToManifest("<template>x</template>") === null)

  console.log("\n3. design tokens")
  const tokens: DesignTokens = {
    colors: { background: "#fbf8f3", surface: "#f1ebe2", text: "#1c1917", muted: "#78716c", accent: "#9a3412", accentText: "#ffffff", border: "#e7e5e4", inverse: { background: "#1c1917", text: "#fafaf9", accent: "#fdba74" } },
    fonts: { heading: "Fraunces", body: "Inter" },
    typeScale: { base: 17, ratio: 1.25 },
    shadow: "sm",
    radius: { small: 4, medium: 10, large: 20 },
    spacing: { scale: 1.2, sectionY: 112, pageWidth: 1240, gutter: 28 },
    motion: { level: "subtle", durationMs: 450 },
    custom: { "brand-stripe": "#9a3412", "bad-one": "url(javascript:alert(1))", "BadName": "1px", "radius-md": "99px" },
  }
  const ts = tokensToThemeSettings(tokens, {})
  check("colours become the schemes sections already use", (ts.color_schemes as Record<string, { background: string }>).white.background === "#fbf8f3" && (ts.color_schemes as Record<string, { background: string }>).black.background === "#1c1917" && ts.default_color_scheme === "white")
  check("fonts, radii, width, gutter and motion become Theme settings", ts.font_heading === "Fraunces" && ts.border_radius === 10 && ts.input_radius === 4 && ts.popup_radius === 20 && ts.page_width === 1240 && ts.content_padding_x === 28 && ts.animations_enabled === true && ts.animation_duration === 450)
  check("the type scale becomes the text styles", (ts.typography_styles as Record<string, { size: { desktop: number } }>).body.size.desktop === 17 && (ts.typography_styles as Record<string, { size: { desktop: number } }>).h4.size.desktop === 21)
  check("custom tokens are cleaned: no url(), no bad names, no scale names", JSON.stringify(ts.custom_tokens) === JSON.stringify({ "brand-stripe": "#9a3412" }), ts.custom_tokens)
  check("value cleaning refuses what could leave a style", cleanTokenValue("red;}body{") === null && cleanTokenValue("calc(1px + 2px)") === "calc(1px + 2px)" && cleanTokenValue("expression(1)") === null && cleanTokenValue("a)b(") === null)
  const site = { ...ts }
  const vars = themeVars(site as never) as Record<string, string>
  check("--t-* come out beside the theme's own", vars["--t-radius-md"] === "10px" && vars["--t-shadow"] !== "none" && vars["--t-brand-stripe"] === "#9a3412" && vars["--t-page-width"] === "1240px")
  const moved = themeVars({ ...site, border_radius: 2 } as never) as Record<string, string>
  check("a global change flows: Layout's card radius moves --t-radius-md", moved["--t-radius-md"] === "2px")
  check("a site without tokens is exactly what it was", !hasTokens({ border_radius: 4 }) && Object.keys(themeVars({} as never)).every((k) => !k.startsWith("--t-")))
  const back2 = themeSettingsToTokens(site)
  check("and the tokens read back", back2.colors.accent === "#9a3412" && back2.radius.medium === 10 && back2.spacing.sectionY === 112 && back2.typeScale?.base === 17 && back2.motion.level === "subtle" && back2.custom?.["brand-stripe"] === "#9a3412" && back2.colors.inverse?.background === "#1c1917")
  check("custom tokens are capped and cleaned on the way out too", Object.keys(customTokens({ custom_tokens: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`t${i}`, "1px"])) })).length === 60)
  check("which component reads which token", JSON.stringify(tokenUsage({ "sections/ai_a.storelib": "x var(--t-radius-md) var(--t-radius-md, 8px) var(--t-brand-stripe)", "sections/ai_b.storelib": "var(--theme-bg)" })) === JSON.stringify({ "radius-md": ["sections/ai_a.storelib"], "brand-stripe": ["sections/ai_a.storelib"] }))
  if (compiled.ok) {
    const r = renderSection({ compiled: compiled.value, id: "x", instance: { type: "ai_studio_hero", settings: { card_border: 1, card_border_color: "" }, blocks: [] } as never, theme: site, page: { template: "index" } } as never)
    check("an empty component setting falls back to the token", /--sh-bc: var\(--scheme-border\)/.test(r.html) && /var\(--t-radius-md, 8px\)/.test(r.css))
  }
  check("tokenVars on its own matches", JSON.stringify(tokenVars(site)) === JSON.stringify(Object.fromEntries(Object.entries(vars).filter(([k]) => k.startsWith("--t-")))))

  console.log("\n4. merge safety")
  check("a file's version is the sha256 of its draft text", fileVersion("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  check("history names who wrote each version", versionAuthorLabel("ai") === "AI" && versionAuthorLabel("creator") === "You" && versionAuthorLabel("import") === "GitHub" && versionAuthorLabel(null) === "Saved")
  check("the conflict offers Keep mine and Use AI's when the AI wrote it", JSON.stringify(conflictChoiceLabels("ai")) === JSON.stringify({ mine: "Keep mine", theirs: "Use AI's" }) && conflictChoiceLabels("creator").theirs === "Use theirs")
  const save = read("lib/website-builder/save-theme-file.ts")
  check("a save takes expectedVersion and refuses a moved draft", /expectedVersion/.test(save) && /fileVersion\(/.test(save) && /status: 409/.test(save))
  check("the conflict carries the draft, not what is live", /conflict: \{ updated_at: [^}]*content: draftText/.test(save))
  check("the version row records its author", /recordVersion\(db, installId, path, content, "save", \{ author/.test(save))
  const drafts = read("lib/website-builder/theme-file-drafts.ts")
  check("history is read with its author, and still read before part 401", /author, job_id/.test(drafts) && /"id, path, content, kind, created_at"\)/.test(drafts))
  const route = read("app/api/website-builder/themes/[installId]/files/route.ts")
  check("the files route passes expected_version through", /expected_version/.test(route) && /expectedVersion: parsed\.data\.expected_version/.test(route))
  const code = read("app/(storelib)/website-builder/code/[installId]/page.tsx")
  check("the code editor names the author in history and in the conflict", /versionAuthorLabel\(/.test(code) && /conflictChoiceLabels\(/.test(code))

  console.log("\n5. the editor wiring")
  check("form_picker is drawn by the forms picker", /case "form_picker":\s*\n\s*return <FormPickerControl/.test(read("components/website-builder/editor/controls/index.tsx")))
  check("an animation select gets the animation control", /isAnimationField\(/.test(read("components/website-builder/editor/controls/index.tsx")))
  const renderer = read("components/website-builder/sections/SectionRenderer.tsx")
  check("the page reads a section's own timing", /animationTimingAttrs\(props\.section\.settings\)/.test(renderer) && /boxTiming\(box, duration, delay\)/.test(read("lib/website-builder/section-motion.ts")))
  check("Edit with AI is in the section menu for a section with a file", /id: "edit-with-ai"/.test(editorPage) && /componentEditPrompt\(/.test(editorPage))
  check("the edit prompt names the file and the section, and stays scoped", /sections\/ai_studio_hero\.storelib/.test(componentEditPrompt({ path: "sections/ai_studio_hero.storelib", name: "Studio hero", ask: "make it calmer" })) && /Change only this section/.test(componentEditPrompt({ path: "sections/ai_x.storelib", name: "X", ask: "y" })))
  check("Design tokens is in Theme settings for an AI website", /DesignTokensPanel/.test(editorPage) && /data-theme-group-row="design_tokens"|"design_tokens"/.test(editorPage))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

/** JSON with its keys sorted, so two objects with the same content compare equal. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x))
}

/** The first props that differ, for a failing round trip. */
function diff(a: ComponentManifest, b: ComponentManifest): unknown {
  const out: unknown[] = []
  a.props.forEach((p, i) => {
    if (canon(p) !== canon(b.props[i])) out.push({ want: p, got: b.props[i] })
  })
  ;(a.items ?? []).forEach((it, i) => {
    if (canon(it) !== canon(b.items?.[i])) out.push({ wantItem: it, gotItem: b.items?.[i] })
  })
  const rest = (m: ComponentManifest) => canon({ ...m, props: undefined, items: undefined })
  if (rest(a) !== rest(b)) out.push({ want: rest(a), got: rest(b) })
  return out.slice(0, 4)
}

main()
