/**
 * The Storelib theme engine, tested without the editor, the renderers or a
 * database — which is possible because it imports none of them, and is the
 * point of that rule.
 *
 *   npx tsx tests/storelib-theme.test.ts
 */
import { themeSourcesModule } from "../scripts/emit-theme-sources"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  CONTROLS,
  CONTROL_TYPES,
  buildLibrary,
  checkScript,
  compileSection,
  compileTemplate,
  controlsAsJson,
  controlsAsMarkdown,
  createCompileCache,
  fillResponsive,
  parseStorelib,
  renderSection,
  renderTemplate,
  resolveSettings,
  scopeCss,
  stripDefaults,
  templatesUsing,
  validateSectionSchema,
  type RenderContext,
  type SectionSchema,
  type Template,
} from "../lib/storelib-theme"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++
  else { failed++; failures.push(name) }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : detail ? `\n        ${detail}` : ""}`)
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  settings: {},
  blocks: [],
  theme: { colors: { primary: "#6366f1" } },
  page: { template: "home" },
  section: { id: "s1", type: "t" },
  scheme: {},
  assets: {},
  ...over,
})
const render = (src: string, c: Partial<RenderContext> = {}) => {
  const t = compileTemplate(src)
  if (t.ok === false) throw new Error(t.errors.map((e) => e.message).join("; "))
  return renderTemplate(t.value, ctx(c))
}

// ═══════════════════════════════════════════════════════════════════════════
section("The control registry is one source of truth")
// ═══════════════════════════════════════════════════════════════════════════
check("every listed type has a definition, and nothing is defined that is not listed", CONTROL_TYPES.every((t) => CONTROLS[t]?.type === t) && Object.keys(CONTROLS).length === CONTROL_TYPES.length)
check("every type names exactly one component", CONTROL_TYPES.every((t) => /^[A-Z][A-Za-z]+$/.test(CONTROLS[t].component)))
check("every example validates against its own type", CONTROL_TYPES.every((t) => validateSectionSchema({ type: "x", name: "X", settings: [CONTROLS[t].example] }).ok))
{
  let onDisk: unknown = null
  try { onDisk = JSON.parse(read("lib/storelib-theme/controls/storelib-controls.json")) } catch { /* not emitted yet */ }
  check(
    "storelib-controls.json on disk is what the registry would emit (run scripts/emit-controls.ts)",
    JSON.stringify(onDisk) === JSON.stringify(controlsAsJson()),
  )
  let doc = ""
  try { doc = read("docs/theme/05-controls-reference.md") } catch { /* not emitted yet */ }
  check("05-controls-reference.md on disk is what the registry would write (rule 39: docs from source)", doc === controlsAsMarkdown())
  check("the reference names every control and only the controls", CONTROL_TYPES.every((t) => doc.includes(`\n## ${t}\n`)) && (doc.match(/\n## /g) ?? []).length === CONTROL_TYPES.length + 1)
}

{
  // The application cannot import a .storelib file, so the default theme's
  // sources reach the bundle through a generated module. It must be what the
  // emitter would write, or the canvas renders a hero the file no longer is.
  let onDisk = ""
  try { onDisk = read("themes/default/sources.generated.ts") } catch { /* not emitted yet */ }
  check("themes/default/sources.generated.ts is what scripts/emit-theme-sources.ts would write", onDisk === themeSourcesModule())
  check("the generated module carries the hero", onDisk.includes('"sections/hero.storelib"'))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Parsing a .storelib file")
// ═══════════════════════════════════════════════════════════════════════════
{
  const src = `<template>\n<div>hi</div>\n</template>\n\n<style scoped>\n.a{}\n</style>\n\n<script>\nroot.x = 1\n</script>\n\n<schema>\n{ "type": "t", "name": "T", "settings": [] }\n</schema>\n`
  const p = parseStorelib(src)
  check("finds all four blocks", p.ok === true && p.value.template.text === "<div>hi</div>" && p.value.style.scoped && p.value.script?.text === "root.x = 1")
  check("records the line each block's content starts on", p.ok === true && p.value.template.line === 2 && p.value.style.line === 6 && p.value.script?.line === 10 && p.value.schema.line === 14)
  const dup = parseStorelib(`<template>a</template>\n<template>b</template>\n<schema>{}</schema>`)
  check("a second <template> is refused, naming the first", dup.ok === false && /second <template>.*line 1/.test(dup.errors[0].message))
  const open = parseStorelib(`<template>\n<div>\n<schema>{}</schema>`)
  check("an unclosed block is refused at its opening line", open.ok === false && open.errors[0].line === 1 && /never closed/.test(open.errors[0].message))
  const noSchema = parseStorelib(`<template>x</template>`)
  check("a missing <schema> is refused", noSchema.ok === false && /needs a <schema>/.test(noSchema.errors[0].message))
  const inner = parseStorelib(`<template>\n<p>see </style> here</p>\n</template>\n<style scoped>\n.a{}\n</style>\n<schema>{}</schema>`)
  check("a closing tag inside a block's text does not end the block", inner.ok === true && inner.value.template.text.includes("</style>"))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Validating a schema")
// ═══════════════════════════════════════════════════════════════════════════
{
  const ok = validateSectionSchema({ type: "t", name: "T", settings: [{ type: "text", id: "heading", default: "Hi" }] })
  check("a good schema passes and gets a schema_version", ok.ok === true && ok.value.schema_version === 1)
  const unknownType = validateSectionSchema({ type: "t", name: "T", settings: [{ type: "wysiwyg", id: "a" }] })
  check("an unregistered control type is refused, listing the real ones", unknownType.ok === false && /not a Storelib control/.test(unknownType.errors[0].message) && unknownType.errors[0].path === "settings[0].type")
  const dupId = validateSectionSchema({ type: "t", name: "T", settings: [{ type: "text", id: "a" }, { type: "text", id: "a" }] })
  check("a duplicate setting id is refused", dupId.ok === false && /used twice/.test(dupId.errors[0].message))
  const badDefault = validateSectionSchema({ type: "t", name: "T", settings: [{ type: "range", id: "n", min: 0, max: 10, default: "big" }] })
  check("a default of the wrong type is refused", badDefault.ok === false && /default "big" is not a range/.test(badDefault.errors[0].message))
  const badOpt = validateSectionSchema({ type: "t", name: "T", settings: [{ type: "select", id: "s", options: [{ label: "A", value: "a" }], default: "z" }] })
  check("a select default outside its options is refused", badOpt.ok === false && /not one of the options/.test(badOpt.errors[0].message))
  const legacy = validateSectionSchema({ type: "t", name: "T", settings: [{ type: "link", id: "u" }, { type: "image", id: "i" }, { type: "icon", id: "ic", default: "zap" }] })
  check("the existing JSON's type names (link, image, icon) still validate through aliases", legacy.ok)
  const preset = validateSectionSchema({ type: "t", name: "T", settings: [{ type: "text", id: "a" }], presets: [{ name: "P", settings: { b: 1 } }] })
  check("a preset that sets a setting the section does not have is refused", preset.ok === false && /preset sets "b"/.test(preset.errors[0].message))
  const keep = validateSectionSchema({ type: "t", name: "T", settings: [{ type: "text", id: "a", future_thing: true }], future_top: 1 })
  check("unknown keys are preserved, not stripped", keep.ok === true && (keep.value as Record<string, unknown>).future_top === 1 && (keep.value.settings[0] as Record<string, unknown>).future_thing === true)
  const resp = validateSectionSchema({ type: "t", name: "T", settings: [{ type: "text", id: "a", responsive: true }] })
  check("responsive is refused on a type that cannot be", resp.ok === false && /cannot be responsive/.test(resp.errors[0].message))
  const newer = validateSectionSchema({ schema_version: 99, type: "t", name: "T", settings: [] })
  check("a schema from a newer engine is refused rather than misread", newer.ok === false && /newer than this engine/.test(newer.errors[0].message))
}

// ═══════════════════════════════════════════════════════════════════════════
section("The template language")
// ═══════════════════════════════════════════════════════════════════════════
check("outputs a setting", render(`<h1>{{ settings.heading }}</h1>`, { settings: { heading: "Hi" } }) === "<h1>Hi</h1>")
check("escapes output, so a setting cannot inject markup", render(`{{ settings.x }}`, { settings: { x: `<img onerror="1">` } }) === "&lt;img onerror=&quot;1&quot;&gt;")
check("the raw filter emits as-is, and only it does", render(`{{ settings.x | raw }}`, { settings: { x: "<b>x</b>" } }) === "<b>x</b>")
check("if / elsif / else", render(`{% if settings.a %}A{% elsif settings.b %}B{% else %}C{% endif %}`, { settings: { b: 1 } }) === "B")
check("for with forloop", render(`{% for b in blocks %}{{ forloop.index }}:{{ b.settings.t }}{% if forloop.last %}.{% endif %}{% endfor %}`, { blocks: [{ id: "1", type: "x", settings: { t: "a" } }, { id: "2", type: "x", settings: { t: "b" } }] }) === "1:a2:b.")
check("for … else on an empty list", render(`{% for b in blocks %}x{% else %}none{% endfor %}`) === "none")
check("comparisons and logic", render(`{% if settings.n > 3 and settings.s == 'ok' or false %}y{% endif %}`, { settings: { n: 5, s: "ok" } }) === "y")
check("filters chain left to right with arguments", render(`{{ settings.t | default: "x" | upcase | append: "!" }}`, { settings: {} }) === "X!")
check("arithmetic filters", render(`{{ settings.o | divided_by: 100 }}|{{ 3 | plus: 4 | times: 2 }}`, { settings: { o: 40 } }) === "0.4|14")
// The dangerous one arrives as a VALUE, which is how it would in life — a
// template that wrote it literally is refused at compile time, tested below.
check("the url filter keeps ours and drops the rest", render(`{{ "/shop" | url }}|{{ "https://a.b" | url }}|{{ settings.bad | url }}`, { settings: { bad: "javascript:x" } }) === "/shop|https://a.b|#")
check("the asset filter resolves references through the context", render(`{{ settings.i | asset }}`, { settings: { i: "asset://abcdef1234567890" }, assets: { "asset://abcdef1234567890": "https://cdn/x.webp" } }) === "https://cdn/x.webp")
check("the alpha filter", render(`{{ "#6366f1" | alpha: 0.5 }}`) === "rgba(99, 102, 241, 0.5)")
check("theme tokens are readable", render(`{{ theme.colors.primary }}`) === "#6366f1")
check("array size / first / last", render(`{{ blocks.size }}{{ blocks.first.id }}`, { blocks: [{ id: "a", type: "x", settings: {} }] }) === "1a")
check("__proto__ and constructor are unreachable", render(`[{{ settings.__proto__ }}][{{ settings.constructor }}][{{ settings.constructor.prototype }}]`, { settings: {} }) === "[][][]")
check("a function in the context is never called or printed", render(`[{{ settings.f }}]`, { settings: { f: () => "boom" } }) === "[]")
{
  const s = compileTemplate(`<div>\n<script>alert(1)</script>\n</div>`, { line: 10 })
  check("<script> in a template is refused at its file line", s.ok === false && s.errors[0].line === 11 && /<script>/.test(s.errors[0].message))
  const h = compileTemplate(`<a onclick="x()">`)
  check("on*= handlers are refused", h.ok === false && /on\*=/.test(h.errors[0].message))
  const js = compileTemplate(`<a href="javascript:void(0)">`)
  check("a literal javascript: URL in a template is refused", js.ok === false && /javascript:/.test(js.errors[0].message))
  const u = compileTemplate(`{% if a %}x`)
  check("an unclosed tag is refused with its line", u.ok === false && /never closed/.test(u.errors[0].message))
  const bad = compileTemplate(`{{ settings.a ++ }}`)
  check("a malformed expression is refused", bad.ok === false)
  const t1 = compileTemplate(`{% for b in blocks %}{{ b.x }}{% endfor %}`)
  const t2 = compileTemplate(`{% for b in blocks %}{{ b.x }}{% endfor %}`)
  check("compiling is deterministic", JSON.stringify(t1) === JSON.stringify(t2))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Scoped CSS")
// ═══════════════════════════════════════════════════════════════════════════
{
  const r = scopeCss(`.a { color: red } h1, .b .c { x: y } body { margin: 0 } html .d { z: 1 }`, { type: "hero" })
  check("every selector is prefixed with the instance scope", r.ok === true && r.value.includes(`[data-section-id="__SECTION_ID__"] .a`) && r.value.includes(`[data-section-id="__SECTION_ID__"] h1`) && r.value.includes(`[data-section-id="__SECTION_ID__"] .b .c`))
  check("body and html become the section root rather than escaping it", r.ok === true && r.value.includes(`[data-section-id="__SECTION_ID__"] { margin: 0 }`) && r.value.includes(`[data-section-id="__SECTION_ID__"] .d`) && !/\bbody\b/.test(r.value))
  const k = scopeCss(`@keyframes fade { from { opacity: 0 } to { opacity: 1 } } .x { animation: fade 1s, other 2s; animation-name: fade }`, { type: "hero" })
  check("keyframes are renamed per section type and their uses rewritten", k.ok === true && k.value.includes("@keyframes sl-hero-fade") && k.value.includes("animation: sl-hero-fade 1s, other 2s") && k.value.includes("animation-name: sl-hero-fade") && !k.value.includes("[data-section-id=\"__SECTION_ID__\"] from"))
  const imp = scopeCss(`@import url(x.css); .a{}`, { type: "t" })
  check("@import is refused", imp.ok === false && /@import/.test(imp.errors[0].message))
  const bad = scopeCss(`.a { color: red `, { type: "t", line: 20 })
  check("a CSS syntax error carries the file line", bad.ok === false && typeof bad.errors[0].line === "number" && bad.errors[0].line >= 20)
}

// ═══════════════════════════════════════════════════════════════════════════
section("Scripts")
// ═══════════════════════════════════════════════════════════════════════════
{
  const ok = checkScript(`root.querySelector(".x").addEventListener("click", () => storelib.analytics.track("hit"))`)
  check("a script that stays inside root and storelib passes and is wrapped over the context", ok.ok === true && /^"use strict";\n\(function \(root, settings, blocks, theme, page, storelib\)/.test(ok.value.bundle))
  const w = checkScript(`const t = window.top\ndocument.title = "x"`, { line: 5 })
  check("window and document are refused at their file lines", w.ok === false && w.errors.length === 2 && w.errors[0].line === 5 && w.errors[1].line === 6)
  const f = checkScript(`fetch("/x")`)
  check("fetch is refused and told where the network is", f.ok === false && /storelib\.\*/.test(f.errors[0].message))
  const ev = checkScript(`eval("1")`)
  check("eval is refused", ev.ok === false)
  const str = checkScript(`const s = "window.document"; // window\n/* document */`)
  check("names inside strings and comments are not names", str.ok)
  const member = checkScript(`const w = storelib.window`)
  check("a property called window is not the global", member.ok)
  const timer = checkScript(`setTimeout(() => 1, 10)`)
  const timerOk = checkScript(`setTimeout(() => 1, 10)`, { capabilities: ["timers"] })
  check("timers need the capability, and the capability grants them", timer.ok === false && timerOk.ok === true && timerOk.value.capabilities.includes("timers"))
  const badCap = checkScript(`1`, { capabilities: ["database"] })
  check("an unknown capability is refused", badCap.ok === false && /not a capability/.test(badCap.errors[0].message))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Resolving settings")
// ═══════════════════════════════════════════════════════════════════════════
{
  const defs: SectionSchema["settings"] = [
    { type: "text", id: "heading", default: "Hi" },
    { type: "range", id: "size", min: 0, max: 100, default: 40, responsive: true },
    { type: "image_picker", id: "img" },
    { type: "header", id: "hdr" },
  ]
  const r = resolveSettings(defs, { heading: "Yo", img: "asset://abcdef1234567890", extra: 7 }, { assets: { "asset://abcdef1234567890": "https://cdn/i.webp" } })
  check("saved wins over the default, the default over the control fallback", r.heading === "Yo")
  check("a responsive setting comes out filled at every breakpoint", JSON.stringify(r.size) === JSON.stringify({ desktop: 40, tablet: 40, mobile: 40 }))
  check("an asset reference comes out as a URL", r.img === "https://cdn/i.webp")
  check("a header holds nothing", !("hdr" in r))
  check("an unknown saved key survives", r.extra === 7)
  check("responsive fills downwards from what was set", JSON.stringify(fillResponsive({ desktop: 64, mobile: 32 }, 0)) === JSON.stringify({ desktop: 64, tablet: 64, mobile: 32 }))
  const stripped = stripDefaults(defs, { heading: "Hi", size: { desktop: 40, tablet: 40, mobile: 40 }, img: "", other: 1 })
  check("stripDefaults drops what equals the default and keeps the rest", JSON.stringify(stripped) === JSON.stringify({ other: 1 }))
  const kept = stripDefaults(defs, { size: { desktop: 64, tablet: 64, mobile: 40 } })
  check("a responsive value that differs is kept per breakpoint", JSON.stringify(kept.size) === JSON.stringify({ desktop: 64, tablet: 64, mobile: 40 }))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Compiling and rendering a whole section")
// ═══════════════════════════════════════════════════════════════════════════
const FIXTURE = `<template>
<div class="card">
  <h2>{{ settings.title }}</h2>
  {% for b in blocks %}<p class="item">{{ b.settings.text }}</p>{% endfor %}
</div>
</template>
<style scoped>
.card { padding: 8px }
</style>
<schema>
{
  "type": "card",
  "name": "Card",
  "settings": [{ "type": "text", "id": "title", "default": "Untitled" }],
  "blocks": [{ "type": "item", "name": "Item", "settings": [{ "type": "text", "id": "text", "default": "…" }] }],
  "presets": [{ "name": "Card", "blocks": [{ "type": "item" }] }]
}
</schema>
`
{
  const c = compileSection(FIXTURE, { file: "sections/card.storelib", expectType: "card" })
  check("a good section compiles", c.ok)
  if (c.ok === true) {
    const out = renderSection({
      compiled: c.value,
      id: "card-9f",
      instance: { type: "card", settings: { title: "A & B" }, blocks: { b1: { type: "item", settings: { text: "one" } }, b2: { type: "item" } }, block_order: ["b2", "b1"] },
      theme: {},
      page: { template: "home" },
    })
    check("the root carries the instance id and type", out.html.startsWith(`<div data-section-id="card-9f" data-section-type="card">`))
    check("settings render escaped, blocks in block_order with their defaults", out.html.includes("<h2>A &amp; B</h2>") && out.html.indexOf(`<p class="item">…</p>`) < out.html.indexOf(`<p class="item">one</p>`))
    check("the CSS is scoped to this instance and no other", out.css.includes(`[data-section-id="card-9f"] .card`) && !out.css.includes("__SECTION_ID__"))
    check("no script, no bundle", out.script === null)
    const again = renderSection({ compiled: c.value, id: "card-9f", instance: { type: "card", settings: { title: "A & B" }, blocks: { b1: { type: "item", settings: { text: "one" } }, b2: { type: "item" } }, block_order: ["b2", "b1"] }, theme: {}, page: { template: "home" } })
    check("rendering is deterministic", again.html === out.html && again.css === out.css)
  }
  const wrongType = compileSection(FIXTURE, { file: "sections/other.storelib", expectType: "other" })
  check("a schema whose type disagrees with its file name is refused", wrongType.ok === false && /file name/.test(wrongType.errors[0].message))
  const badJson = compileSection(FIXTURE.replace(`"name": "Card",`, `"name": "Card"`))
  check("a JSON error in the schema is reported at a line of the .storelib file, not of the JSON", badJson.ok === false && badJson.errors[0].stage === "schema" && (badJson.errors[0].line ?? 0) >= 10)
  const unscoped = compileSection(FIXTURE.replace("<style scoped>", "<style>"))
  check("an unscoped <style> in a section is refused and pointed at the layout", unscoped.ok === false && /layout\/theme\.storelib/.test(unscoped.errors[0].message))
  const cache = createCompileCache()
  cache.compile(FIXTURE, { file: "a" }); cache.compile(FIXTURE, { file: "a" }); cache.compile(FIXTURE + " ", { file: "a" })
  check("the cache is keyed by source hash: same source once, changed source again", cache.size === 2)
  const warn = compileSection(FIXTURE.replace(`"settings": [{ "type": "text", "id": "title", "default": "Untitled" }]`, `"settings": [{ "type": "text", "id": "title" }, { "type": "text", "id": "unused" }]`))
  check("a setting the template never reads is a warning, not an error", warn.ok === true && !!warn.warnings?.some((w) => /never reads settings\.unused/.test(w.message)))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Add Section is derived from the files")
// ═══════════════════════════════════════════════════════════════════════════
{
  // The exact line, not a regex: the preset holds a nested array, and a
  // `[^\]]*` stopped at the inner `]`, leaving broken JSON that failed to
  // compile — which made this test fail for a reason that had nothing to
  // do with presets.
  const noPreset = FIXTURE.replace(`"presets": [{ "name": "Card", "blocks": [{ "type": "item" }] }]`, `"presets": []`).replace(`"type": "card"`, `"type": "plain"`)
  const broken = FIXTURE.replace(`"type": "card"`, `"type": "broken"`).replace("<style scoped>", "<style>")
  const lib = buildLibrary({
    "sections/card.storelib": FIXTURE,
    "sections/plain.storelib": noPreset,
    "sections/broken.storelib": broken,
    "templates/home.json": "{}",
    "README.md": "not a section",
  })
  check("a section with a preset is addable", lib.addable.some((e) => e.type === "card" && e.name === "Card"))
  check("a section without a preset compiles but is not offered", !!lib.sections.plain && !lib.addable.some((e) => e.type === "plain"))
  check("a file that does not compile is reported, and not in the library", lib.errors.some((e) => e.file === "sections/broken.storelib") && !lib.sections.broken)
  check("only sections/*.storelib are considered", Object.keys(lib.sections).length === 2)
  const templates: Record<string, Template> = { home: { sections: { a: { type: "card" } }, order: ["a"] }, product: { sections: {}, order: [] } }
  check("templatesUsing says where a type is used, for the delete warning", JSON.stringify(templatesUsing("card", templates)) === `["home"]` && templatesUsing("plain", templates).length === 0)
}

// ═══════════════════════════════════════════════════════════════════════════
section("Hero, the first real section")
// ═══════════════════════════════════════════════════════════════════════════
{
  const src = read("themes/default/sections/hero.storelib")
  const c = compileSection(src, { file: "sections/hero.storelib", expectType: "hero" })
  check("hero.storelib compiles", c.ok, c.ok === true ? "" : c.errors.map((e) => `${e.line ?? "?"}: ${e.message}`).join(" | "))
  if (c.ok === true) {
    /**
     * THE IDS ARE THE CONTRACT (rule: setting ids are stable forever). This
     * is every setting hero.json declared on the day the hero moved to its
     * .storelib file; a saved hero anywhere stores its content under these
     * keys. Adding one is fine. Removing or renaming one is a migration and
     * has to be written as one — see docs/theme/13-versioning.md.
     */
    const oldIds = [
      "animate_heading", "badge_text", "bg_color", "bg_gradient", "bg_image", "bg_overlay_color", "bg_overlay_opacity",
      "bg_type", "bg_video", "button2_style", "button2_text", "button2_url", "button_border_radius", "button_color",
      "button_style", "button_text", "button_text_color", "button_url", "color_scheme", "eyebrow", "font_size_heading",
      "full_height", "heading", "hero_image", "layout", "max_width", "padding_bottom", "padding_top", "scroll_indicator",
      "subheading", "text_color",
    ].sort()
    const newIds = c.value.schema.settings.filter((s) => s.type !== "header").map((s) => s.id).sort()
    // The scheme the instance chose reaches the markup, and a theme that
    // renames a scheme's background reaches it too — the lookup is the
    // engine's, not the template's.
    {
      const dark = renderSection({ compiled: c.value, id: "hero_dark", instance: { type: "hero", settings: { color_scheme: "dark", bg_type: "color" } }, theme: {}, page: { template: "index" } })
      check("hero: the chosen scheme is on the root", dark.html.includes('data-scheme="dark"'), dark.html.slice(0, 200))
      check("hero: the dark scheme's background fills in for an empty bg_color", dark.html.includes("background: #1f2937"), dark.html.slice(0, 400))
      const own = renderSection({ compiled: c.value, id: "hero_own", instance: { type: "hero", settings: { color_scheme: "dark", bg_type: "color" } }, theme: { color_schemes: { dark: { bg: "#123456" } } }, page: { template: "index" } })
      check("hero: a theme's own scheme colours win over the defaults", own.html.includes("background: #123456"), own.html.slice(0, 400))
      const unknown = renderSection({ compiled: c.value, id: "hero_x", instance: { type: "hero", settings: { color_scheme: "nope", bg_type: "color" } }, theme: {}, page: { template: "index" } })
      check("hero: an unknown scheme falls back to white rather than to nothing", unknown.html.includes("background: #ffffff"), unknown.html.slice(0, 400))
    }
    check("every setting id the hero has ever had, hero.storelib still has: the ids are the contract", oldIds.every((i) => newIds.includes(i)), `missing: ${oldIds.filter((i) => !newIds.includes(i)).join(",")} extra: ${newIds.filter((i) => !oldIds.includes(i)).join(",")}`)
    check("hero has a preset, so it is addable", !!c.value.schema.presets?.length)
    check("no warnings: every setting is read by the template", !c.warnings?.length, (c.warnings ?? []).map((w) => w.path).join(","))
    const out = renderSection({
      compiled: c.value,
      id: "hero-1",
      instance: { type: "hero", settings: { heading: "Welcome <3", button_text: "Go", button_url: "/shop", bg_type: "image", bg_image: "asset://abcdef1234567890" } },
      theme: { primary_color: "#ff0000", font_heading: "Georgia" },
      page: { template: "home" },
      assets: { "asset://abcdef1234567890": "https://cdn/bg.webp" },
    })
    check("renders the heading escaped, in the theme's heading font", out.html.includes(`Welcome &lt;3`) && out.html.includes(`font-family: Georgia`))
    check("the button links where it was told", out.html.includes(`href="/shop"`) && out.html.includes(`>Go</a>`))
    check("the background image resolves from an asset reference", out.html.includes(`src="https://cdn/bg.webp"`) && out.html.includes(`hero__overlay`))
    check("a default the person never touched is applied: 56px heading", out.html.includes(`--hero-heading-size: 56px`))
    check("the CSS is scoped and its keyframes renamed", out.css.includes(`[data-section-id="hero-1"] .hero__heading`) && out.css.includes("@keyframes sl-hero-rise"))
    const empty = renderSection({ compiled: c.value, id: "h", instance: { type: "hero" }, theme: {}, page: { template: "home" } })
    check("an instance with no settings at all renders from defaults without throwing", empty.html.includes(`data-section-id="h"`))
  }
}

{
  /**
   * EVERY EXPRESSION, NOT JUST THE FIRST. The mask that hides `{{ … }}` from
   * postcss was padded with zeros, and the index was read back with `\d+`,
   * which swallowed the padding: expression 1 resolved to `exprs[1000000]`,
   * came back undefined, and was left in the stylesheet as `--sl-x100000000`
   * — a value no browser accepts, so every rule after the first one lost its
   * declaration. Three expressions, because two would have passed by luck.
   */
  const many = scopeCss(".a { color: {{ settings.one }} } .b { background: {{ settings.two }} } .c { border-color: {{ settings.three }} }", { file: "f", line: 1, type: "t" })
  check(
    "every expression in a stylesheet survives scoping, not just the first",
    many.ok === true && ["one", "two", "three"].every((n) => many.value.includes(`{{ settings.${n} }}`)) && !/--sl-x/.test(many.value),
    many.ok === true ? many.value : "",
  )

  // And they arrive, filled, on the instance.
  const src = [
    "<template>", '<div class="box">{{ settings.label }}</div>', "</template>", "",
    "<style scoped>", ".box { color: {{ settings.fg }}; background: {{ settings.bg }}; }", "</style>", "",
    "<schema>",
    JSON.stringify({ type: "box", name: "Box", settings: [
      { type: "text", id: "label", label: "L", default: "hi" },
      { type: "color", id: "fg", label: "F", default: "#111111" },
      { type: "color", id: "bg", label: "B", default: "#eeeeee" },
    ], presets: [{ name: "Box" }] }),
    "</schema>", "",
  ].join("\n")
  const c = compileSection(src, { file: "sections/box.storelib", expectType: "box" })
  check("a style block that reads two settings compiles", c.ok === true, c.ok === false ? c.errors.map((e) => e.message).join(" | ") : "")
  if (c.ok === true) {
    const out = renderSection({ compiled: c.value, id: "b1", instance: { type: "box", settings: {} }, theme: {}, page: { template: "index" } })
    check("and both reach the instance's stylesheet", out.css.includes("color: #111111") && out.css.includes("background: #eeeeee"), out.css)

    /**
     * A setting cannot end its own declaration and start a rule of its own.
     * Braces and angle brackets come out of a value on the way into CSS.
     */
    const nasty = renderSection({
      compiled: c.value,
      id: "b2",
      instance: { type: "box", settings: { fg: "red } body { display: none } .x { color: blue", bg: "#fff; background-image: url(https://elsewhere/pixel)" } },
      theme: {},
      page: { template: "index" },
    })
    const body = nasty.css.slice(nasty.css.indexOf(".box {") + 6, nasty.css.lastIndexOf("}"))
    check(
      "a setting stays inside its own declaration: no braces and no angle brackets reach the stylesheet",
      !/[{}<>]/.test(body),
      nasty.css,
    )
    check(
      "and no semicolon of its own, so the rule still has exactly the two declarations the author wrote",
      (body.match(/;/g) ?? []).length === 2 && !/;\s*background-image/.test(body),
      nasty.css,
    )
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) { console.log("Failed:\n" + failures.map((f) => "  - " + f).join("\n")); process.exit(1) }
