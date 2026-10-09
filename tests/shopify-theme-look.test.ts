/**
 * An imported Shopify theme keeps its look: the stylesheet its layout builds
 * from its settings, worked out once at import (lib/storelib-theme/shopify/
 * static-liquid.ts), compiled to the page root (lib/storelib-theme/
 * theme-stylesheet.ts) and drawn on every page. And the Liquid a modern
 * theme writes inside its sections: capture, ranges, loop limits, break,
 * inlined icons, tags inside a {% style %}.
 *
 * The theme here is made up and small. No file from a real theme is in it.
 */
import JSZip from "jszip"

import { readPackage, buildPackage } from "../lib/storelib-theme/package"
import { compileSection } from "../lib/storelib-theme/storelib/compile"
import { scopeCss } from "../lib/storelib-theme/storelib/css"
import { cleanSvg, convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { LiquidColor, StaticLiquid, liquidSettings, parseColor, parseFont, resolveSettingReferences } from "../lib/storelib-theme/shopify/static-liquid"
import { compileThemeStylesheet } from "../lib/storelib-theme/theme-stylesheet"
import { sanitizeThemeSettings } from "../lib/website-builder/sanitize-sections"
import { themeImportedCss, themeRootClasses } from "../lib/website-builder/theme-css"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const squash = (s: string) => s.replace(/\s+/g, " ").trim()

const S = "[data-storelib-theme]"

console.log("\nThe theme's stylesheet, compiled to the page root\n")
{
  const css = compileThemeStylesheet(`
    :root { --gap: 8px; display: grid; }
    body { color: red; min-height: 100vh; overflow: hidden; font-family: serif; }
    html body .page { margin: 0 }
    .card { padding: 1rem; & .title { font-weight: 700 } }
    @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
    .card { animation: fade 1s; }
    @import url("https://evil.example/x.css");
    @font-face { font-family: X; src: url(x.woff2); }
    .a { background: url(javascript:alert(1)); color: blue; }
    .b { background: url(http://insecure.example/x.png); }
    .c { background: url("https://cdn.example/x.png"); }
    .d { background: url(asset://${"a".repeat(64)}); }
    .e { content: "</style><script>alert(1)</script>"; }
    @media screen and (min-width: 750px) { :root { --gap: 16px } .grid { display: grid } }
    @media (prefers-reduced-motion: reduce) { .card { animation: none } }
    .hero { height: 100vh; }
    dialog:modal { inset: 0 }
  `)
  const out = squash(css.css)
  check("it reads", !css.failed)
  check("a plain rule answers to the page root", out.includes(`${S} .card { padding: 1rem;`))
  check(":root is the page root, and keeps its variables", out.includes(`${S} { --gap: 8px; }`))
  check("but not page layout: display on :root is left out", !/--gap: 8px; display/.test(out))
  check("body keeps colour and type, not its height or overflow", out.includes(`${S} { color: red; font-family: serif; }`) && !out.includes("overflow: hidden"))
  check("html body .x is the root, then .x", out.includes(`${S} .page { margin: 0 }`))
  check("a nested rule is left to its parent's scope", out.includes("& .title { font-weight: 700 }") && !out.includes(`${S} & .title`))
  check("keyframe names stay as the theme wrote them", out.includes("@keyframes fade") && out.includes("animation: fade 1s"))
  check("@import and @font-face are left out", !out.includes("@import") && !out.includes("@font-face"))
  check("a javascript: address is left out, the rest of the rule stays", !out.includes("javascript") && out.includes(`${S} .a { color: blue; }`))
  check("an http address is left out", !out.includes("insecure.example"))
  check("an https address and a package asset stay", out.includes("https://cdn.example/x.png") && out.includes(`asset://${"a".repeat(64)}`))
  check("nothing can close the <style> it is drawn in", !css.css.includes("<"))
  check("a width query is a container query, so the phone preview is the phone", out.includes("@container (min-width: 750px)") && out.includes(`${S} .grid { display: grid }`))
  check(":root inside a width query is set on its children, which answer it", out.includes(`${S} > * { --gap: 16px }`))
  check("a query about anything else stays a media query", out.includes("@media (prefers-reduced-motion: reduce)"))
  check("viewport units answer to the canvas", out.includes("calc(100 * var(--sl-vh, 1vh))"))
  check(":modal opens in the canvas too", out.includes(":is(:modal, [data-sl-open])"))
  const again = compileThemeStylesheet(css.css)
  check("compiling twice gives the same text", again.css === css.css, squash(again.css).slice(0, 400))
  check("what was left out is counted", css.dropped.atRules >= 2 && css.dropped.declarations >= 3, css.dropped)
  check("CSS that does not read is nothing, not an error", compileThemeStylesheet(".a { color: red").css === "" && compileThemeStylesheet(".a { color: red").failed)
  check("a value that is not a string is nothing", compileThemeStylesheet(42).css === "")
}

console.log("\nKept honest wherever it is stored\n")
{
  const stored = sanitizeThemeSettings({ theme_stylesheet: "body { color: red } .x { color: blue }", theme_root_class: "page-width-narrow bad\"class <x> ok-2", other: 1 })
  check("a save compiles the stylesheet to the page root", squash(String(stored.theme_stylesheet)).includes(`${S} .x { color: blue }`))
  check("the body classes are plain class names", stored.theme_root_class === "page-width-narrow ok-2", stored.theme_root_class)
  check("other settings are untouched", stored.other === 1)
  check("a stylesheet that is not CSS is not stored", !("theme_stylesheet" in sanitizeThemeSettings({ theme_stylesheet: ".a { color: red" })))
  check("the page draws a compiled stylesheet", themeImportedCss({ theme_stylesheet: `${S} .x{color:red}` } as never) === `${S} .x{color:red}`)
  check("and refuses one that holds <", themeImportedCss({ theme_stylesheet: "</style><script>" } as never) === "")
  check("themeRootClasses keeps a dozen at most", themeRootClasses(Array.from({ length: 20 }, (_, i) => `c${i}`).join(" ")).split(" ").length === 12)
}

console.log("\nLiquid worked out once, against the theme's settings\n")
{
  const c = parseColor("#336699")
  check("a colour is an object with its parts", c instanceof LiquidColor && c.red === 51 && c.green === 102 && c.blue === 153)
  const f = parseFont("work_sans_n6")
  check("a font handle is a family, weight and style", f?.family === "Work Sans" && f.weight === 600 && f.style === "normal", f)
  const types = new Map([["accent", "color"], ["heading_font", "font_picker"], ["palette", "color_palette"]])
  const settings = liquidSettings({ accent: "#ff0000", heading_font: "inter_n7", palette: { one: "#000000", two: "#ffffff" }, ref: "{{ settings.palette.two }}", radius: 6, color_schemes: { "scheme-1": { settings: { background: "#fafafa" } } } }, types)
  resolveSettingReferences(settings, () => null)
  const engine = new StaticLiquid({
    settings,
    snippet: (n) => (n === "vars" ? `--r: {{ radius }}px;` : null),
    stylesheet: (n) => (n === "base.css" ? ".base { margin: 0 }" : null),
    asset: (n) => (n === "bg.png" ? `asset://${"b".repeat(64)}` : null),
  })
  const run = (src: string) => engine.render(src)
  check("a colour prints as the theme wrote it", run("{{ settings.accent }}") === "#ff0000")
  check("its parts print as numbers", run("{{ settings.accent.red }} {{ settings.accent.rgb }}") === "255 255 0 0")
  check("color_modify on alpha", run("{{ settings.accent | color_modify: 'alpha', 0.5 }}") === "rgba(255, 0, 0, 0.5)", run("{{ settings.accent | color_modify: 'alpha', 0.5 }}"))
  check("a font's family and weight", run("{{ settings.heading_font.family }} {{ settings.heading_font.weight }}") === "Inter 700")
  check("font_modify", run("{% assign b = settings.heading_font | font_modify: 'weight', 'bolder' %}{{ b.weight }}") === "900")
  check("a palette reference is the colour it names", run("{{ settings.ref }}") === "#ffffff", run("{{ settings.ref }}"))
  check("colour schemes loop as a list", run("{% for s in settings.color_schemes %}{{ s.id }}:{{ s.settings.background }}{% endfor %}") === "scheme-1:#fafafa", run("{% for s in settings.color_schemes %}{{ s.id }}:{{ s.settings.background }}{% endfor %}"))
  check("render passes its parameters", run("{% render 'vars', radius: settings.radius %}") === "--r: 6px;")
  check("capture, case and unless", run("{% capture x %}a{{ 1 | plus: 1 }}{% endcapture %}{% case x %}{% when 'a2' %}yes{% else %}no{% endcase %}{% unless false %}!{% endunless %}") === "yes!")
  check("for with limit, offset, reversed and break", run("{% for i in (1..9) limit: 4 offset: 1 reversed %}{% if i == 2 %}{% break %}{% endif %}{{ i }}{% endfor %}") === "543", run("{% for i in (1..9) limit: 4 offset: 1 reversed %}{% if i == 2 %}{% break %}{% endif %}{{ i }}{% endfor %}"))
  check("a linked stylesheet is written in", run("{{ 'base.css' | asset_url | stylesheet_tag }}") === "<style>.base { margin: 0 }</style>")
  check("a picture in assets/ is the package's copy of it", run("{{ 'bg.png' | asset_url }}") === `asset://${"b".repeat(64)}`)
  check("font_face is nothing: fonts load through Typography", run("{{ settings.heading_font | font_face }}") === "")
  check("{% javascript %} and {% schema %} print nothing", run("{% javascript %}x(){% endjavascript %}{% schema %}{}{% endschema %}ok") === "ok")
  check("a loop that never ends stops", typeof run("{% for i in (1..200) %}{% for j in (1..200) %}{% for k in (1..200) %}x{% endfor %}{% endfor %}{% endfor %}") === "string")
}

console.log("\nTags inside a section's {% style %}\n")
{
  const r = scopeCss("{% if settings.round %}.a { border-radius: 9px }{% endif %}\n.b { color: {{ settings.c }} }", { type: "t" })
  check("a tag between rules is not a CSS error", r.ok === true, r.ok === false ? r.errors : undefined)
  check("and is kept where it was", r.ok === true && r.value.includes("{% if settings.round %}") && r.value.includes("{% endif %}") && r.value.includes("{{ settings.c }}"))
}

console.log("\nInlined icons\n")
{
  check("an SVG keeps what draws", cleanSvg(`<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>`) === `<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>`)
  const bad = cleanSvg(`<?xml version="1.0"?><svg onload="x()"><script>alert(1)</script><a href="https://evil.example"><path/></a><use href="#i"/></svg>`) ?? ""
  check("and loses scripts, handlers and outside links", !/script|onload|evil/.test(bad) && bad.includes(`href="#i"`), bad)
  check("anything that is not an <svg> is refused", cleanSvg("<html></html>") === null)
}

/* ── A made-up theme, end to end ─────────────────────────────────────────── */

const LAYOUT = `<!doctype html>
<html>
<head>
  {%- render 'theme-styles-variables' -%}
  {{ 'base.css' | asset_url | stylesheet_tag }}
  {{ content_for_header }}
</head>
<body class="page-width-wide {{ settings.card_hover }}">
  {{ content_for_layout }}
</body>
</html>`

const VARS = `{% style %}
  :root {
    --color-accent: {{ settings.accent }};
    --color-accent-rgb: {{ settings.accent.red }} {{ settings.accent.green }} {{ settings.accent.blue }};
    --font-heading--family: {{ settings.type_heading_font.family }}, {{ settings.type_heading_font.fallback_families }};
    --font-heading--weight: {{ settings.type_heading_font.weight }};
    --radius: {{ settings.radius }}px;
  }
  {% for scheme in settings.color_schemes %}
  .color-{{ scheme.id }} { --color-background: {{ scheme.settings.background }}; }
  {% endfor %}
{% endstyle %}`

const SECTION = `{% capture title %}<em>{{ section.settings.heading }}</em>{% endcapture %}
<div class="tiles">
  {{ title }}
  {{ 'icon-arrow.svg' | inline_asset_content }}
  {% for i in (1..3) %}<span class="dot">{{ i }}</span>{% endfor %}
  {% for block in section.blocks limit: 2 %}<p {{ block.shopify_attributes }}>{{ block.settings.text }}</p>{% endfor %}
</div>
{% schema %}
{ "name": "Tiles", "settings": [{ "type": "text", "id": "heading", "label": "Heading", "default": "Hi" }],
  "blocks": [{ "type": "tile", "name": "Tile", "settings": [{ "type": "text", "id": "text", "label": "Text", "default": "x" }] }],
  "presets": [{ "name": "Tiles" }] }
{% endschema %}`

async function theme(): Promise<JSZip> {
  const z = new JSZip()
  z.file("layout/theme.liquid", LAYOUT)
  z.file("snippets/theme-styles-variables.liquid", VARS)
  z.file("assets/base.css", ".button { border-radius: var(--radius); background: rgb(var(--color-accent-rgb)); color: #fff; }\n@media screen and (min-width: 750px) { .tiles { display: grid } }")
  z.file("assets/icon-arrow.svg", `<svg viewBox="0 0 10 10" onclick="x()"><path d="M0 0L10 5"/></svg>`)
  z.file("sections/tiles.liquid", SECTION)
  z.file("config/settings_schema.json", JSON.stringify([
    { name: "theme_info", theme_name: "Made Up", theme_version: "1.0.0", theme_author: "Test" },
    { name: "Colors", settings: [{ type: "color", id: "accent", label: "Accent", default: "#112233" }, { type: "color_scheme_group", id: "color_schemes", label: "Schemes" }] },
    { name: "Type", settings: [{ type: "font_picker", id: "type_heading_font", label: "Heading", default: "work_sans_n6" }, { type: "range", id: "radius", label: "Radius", min: 0, max: 20, default: 4 }, { type: "select", id: "card_hover", label: "Hover", default: "card-hover-lift", options: [{ value: "card-hover-lift", label: "Lift" }] }] },
  ]))
  z.file("config/settings_data.json", JSON.stringify({ current: { accent: "#ff8800", radius: 10, color_schemes: { "scheme-1": { settings: { background: "#fefefe" } } } } }))
  z.file("templates/index.json", JSON.stringify({ sections: { a: { type: "tiles", blocks: { b1: { type: "tile", settings: { text: "One" } } }, block_order: ["b1"] } }, order: ["a"] }))
  return z
}

;(async () => {
  console.log("\nA theme imported end to end\n")
  const r = await convertShopifyTheme(await theme())
  check("it converts", r.ok === true, r.ok === false ? r.error : undefined)
  if (r.ok === false) { console.log(`\n${passed} passed, ${failed} failed\n`); process.exit(1) }
  const settings = JSON.parse(r.pkg.files["config/settings.json"] ?? "{}") as Record<string, unknown>
  const css = squash(String(settings.theme_stylesheet ?? ""))
  check("the layout's styles are kept as the theme's stylesheet", css.length > 0)
  check("worked out from the saved settings, not the defaults", css.includes("--color-accent: #ff8800") && css.includes("--color-accent-rgb: 255 136 0") && css.includes("--radius: 10px"), css.slice(0, 300))
  check("fonts are their family and weight", css.includes("--font-heading--family: Work Sans, sans-serif") && css.includes("--font-heading--weight: 600"))
  check("colour schemes loop", css.includes(`${S} .color-scheme-1 { --color-background: #fefefe; }`))
  check("the linked stylesheet is in it, at the page root", css.includes(`${S} .button {`))
  check("its width query is a container query", css.includes("@container (min-width: 750px)"))
  check("no Liquid is left in it", !/\{\{|\{%/.test(css))
  check("the body's classes are the page root's", settings.theme_root_class === "page-width-wide card-hover-lift", settings.theme_root_class)
  check("the heading font is Typography's", settings.font_heading === "Work Sans")
  check("a stored stylesheet is already what a save would make it", sanitizeThemeSettings({ theme_stylesheet: settings.theme_stylesheet }).theme_stylesheet === settings.theme_stylesheet)

  const src = r.pkg.files["sections/tiles.storelib"] ?? ""
  check("the section compiles", compileSection(src, { file: "sections/tiles.storelib" }).ok === true, compileSection(src, { file: "sections/tiles.storelib" }))
  check("a capture is written where it is printed", src.includes("<em>{{ settings.heading }}</em>"), src.slice(0, 500))
  check("an inlined icon is its cleaned markup", src.includes(`<path d="M0 0L10 5"/>`) && !src.includes("onclick"))
  check("a number range loop stays a loop", /\{% for i in \(1\.\.3\) %\}/.test(src))
  check("a loop limit is kept", /for block in blocks limit: 2/.test(src), src.match(/\{% for block[^%]*%\}/)?.[0])

  const built = await buildPackage(r.pkg)
  const read = await readPackage(built)
  check("the package reads back through the import door", read.ok === true, read.ok === false ? read.errors.slice(0, 2) : undefined)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
})()
