/**
 * A Shopify Online Store 2.0 theme, imported whole into Storelib's compatible
 * profile (lib/storelib-theme/shopify/convert.ts) and drawn by Storelib's own
 * engine (lib/storelib-theme/compat).
 *
 * The theme here is built in memory and small, but has every kind of thing
 * a real one has: a schema with locale keys, a stylesheet and a script, the
 * Liquid tags Storelib does not have (unless, case, assign, render,
 * increment, comment, raw), filters it does not have, shopify_attributes,
 * a setting type it does not have, a section that cannot be converted, a
 * theme block, templates, theme settings, locales and a picture. It is
 * imported as the import route imports it, and its home page drawn.
 */
import JSZip from "jszip"

import { convertShopifyTheme, isShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { isCompatSource, splitCompatFile } from "../lib/storelib-theme/compat/theme"
import { drawPage, themeOfInstall } from "../lib/storelib-theme/compat/page"
import { exportShopifyTheme } from "../lib/storelib-theme/compat/export"
import { schemaFromStorelib, themeBlockSchema } from "../lib/website-builder/storelib-schemas"
import { LIMITS } from "../lib/storelib-theme/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}

/* A 1×1 PNG. */
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"))

const FEATURE = `{%- liquid
  assign heading = section.settings.heading
-%}
{{ 'section-feature.css' | asset_url | stylesheet_tag }}
{%- style -%}
  .feature-{{ section.id }} { padding-top: {{ section.settings.padding-top }}px; }
{%- endstyle -%}
<div class="feature feature-{{ section.id }}" {{ section.shopify_attributes }}>
  <h2>{{ heading | upcase }}</h2>
  {%- comment -%} secret note for the theme's developers {%- endcomment -%}
  {% unless section.settings.show_note %}<p class="note">{{ 'general.note' | t }}</p>{% endunless %}
  {% case section.settings.layout %}
    {% when 'grid' %}<span>Grid</span>
    {% when 'list', 'rows' %}<span>List</span>
    {% else %}<span>Other</span>
  {% endcase %}
  {% render 'badge', label: section.settings.heading %}
  {% render 'missing-snippet' %}
  <div class="rte">{{ section.settings.text }}</div>
  <img src="{{ 'logo.png' | asset_url }}" alt="Logo">
  {{ section.settings.image | image_url: width: 800 | image_tag }}
  {{ 'hero-apparel-1' | placeholder_svg_tag: 'hero__media' }}
  <ul>
  {%- for block in section.blocks -%}
    <li {{ block.shopify_attributes }}><a href="{{ block.settings.link }}">{{ block.settings.title | money }}</a></li>
  {%- endfor -%}
  </ul>
  <button onclick="buy()">Buy</button>
  <script>window.spy = 1</script>
  {% increment visits %}
  <span class="count">{{ cart.item_count }}</span>
  {% if request.design_mode %}EDITOR ONLY{% endif %}
  {% if settings.show_badges %}<em>badges on</em>{% endif %}
  {% raw %}{{ shown as text }}{% endraw %}
</div>

{% stylesheet %}
.feature { display: grid; gap: 12px; }
{% endstylesheet %}

{% javascript %}
document.querySelector(".feature").classList.add("ready")
{% endjavascript %}

{% schema %}
{
  "name": "t:sections.feature.name",
  "tag": "section",
  "enabled_on": { "templates": ["index"] },
  "settings": [
    { "type": "header", "content": "t:sections.feature.content" },
    { "type": "text", "id": "heading", "label": "t:sections.feature.heading", "default": "Why us" },
    { "type": "richtext", "id": "text", "label": "Text" },
    { "type": "checkbox", "id": "show_note", "label": "Hide the note", "default": false },
    { "type": "select", "id": "layout", "label": "Layout", "default": "grid", "options": [{ "value": "grid", "label": "Grid" }, { "value": "list", "label": "List" }, { "value": "rows", "label": "Rows" }] },
    { "type": "range", "id": "padding-top", "label": "Top padding", "min": 0, "max": 100, "step": 4, "unit": "px", "default": 36 },
    { "type": "image_picker", "id": "image", "label": "Image" },
    { "type": "blog", "id": "blog", "label": "Blog" },
    { "type": "metaobject", "id": "thing", "label": "Thing", "metaobject_type": "x" }
  ],
  "blocks": [
    { "type": "item", "name": "Item", "settings": [
      { "type": "text", "id": "title", "label": "Title", "default": "Item" },
      { "type": "url", "id": "link", "label": "Link" }
    ] },
    { "type": "@app" }
  ],
  "presets": [{ "name": "t:sections.feature.name", "blocks": [{ "type": "item" }, { "type": "item" }] }]
}
{% endschema %}
`

const BLOG_ONLY = `<section>
  {% for article in section.settings.blog.articles %}<h3>{{ article.title }}</h3>{% endfor %}
  <p>{{ section.settings.note }}</p>
</section>
{% schema %}
{ "name": "Blog posts", "settings": [
  { "type": "blog", "id": "blog", "label": "Blog" },
  { "type": "text", "id": "note", "label": "Note", "default": "From the blog" }
], "presets": [{ "name": "Blog posts" }] }
{% endschema %}
`

const QUOTES = `<div class="quotes">{% content_for 'blocks' %}</div>
{% schema %}
{ "name": "Quotes", "blocks": [{ "type": "@theme" }], "presets": [{ "name": "Quotes", "blocks": [{ "type": "_quote" }] }] }
{% endschema %}
`

const TEXT_SNIPPET = `{% liquid
  assign block_settings = block.settings
  assign plain_text = block_settings.text | strip_newlines | strip
  assign element = 'div'
  if block_settings.type_preset == 'rte'
    assign element = 'rte-formatter'
  endif
%}
{% capture attrs %}class="text-block {{ element }}"{% endcapture %}
{% if plain_text != blank %}
  <{{ element }} {{ attrs | strip }}>{{ block.settings.text }}</{{ element }}>
{% endif %}
`

const TEXT_BLOCK = `{% render 'text', block: block %}
{% schema %}
{ "name": "Text", "tag": null, "settings": [
  { "type": "richtext", "id": "text", "label": "Text" },
  { "type": "select", "id": "type_preset", "label": "Preset", "default": "rte", "options": [{ "value": "rte", "label": "Rich" }, { "value": "h2", "label": "H2" }] }
] }
{% endschema %}
`

const RESOURCE_LIST = `{% liquid
  assign settings = settings | default: empty
  unless settings != empty
    echo '<!-- Error: settings parameter required for resource-list snippet -->'
    break
  endunless
  echo settings.layout_type
%}
<div class="resource-list"></div>
`

const SPOTLIGHT = `<div class="spot">{% content_for 'block', type: '_quote', id: 'static-quote' %}</div>
{% schema %}
{ "name": "Spotlight", "settings": [], "presets": [{ "name": "Spotlight", "blocks": {
  "static-quote": { "type": "_quote", "static": true, "settings": { "text": "t:general.note" } }
} }] }
{% endschema %}
`

const PRODUCT_LIST = `<div class="section-resource-list">
  {% render 'resource-list', settings: section.settings, content_type: 'products' %}
</div>
{% schema %}
{ "name": "Featured collection", "settings": [
  { "type": "select", "id": "layout_type", "label": "Layout", "default": "grid", "options": [{ "value": "grid", "label": "Grid" }] }
], "presets": [{ "name": "Featured collection" }] }
{% endschema %}
`

const QUOTE_BLOCK = `<blockquote class="quote" {{ block.shopify_attributes }}>{{ block.settings.text }}</blockquote>
{% schema %}
{ "name": "Quote", "tag": null, "settings": [{ "type": "inline_richtext", "id": "text", "label": "Text", "default": "Great shop" }] }
{% endschema %}
`

async function shopifyZip(): Promise<JSZip> {
  const zip = new JSZip()
  zip.file("layout/theme.liquid", "<html><body>{{ content_for_layout }}</body></html>")
  zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Test Shop Theme", theme_version: "2.1.0", theme_author: "Ada" }, { name: "Colors", settings: [{ type: "color_scheme_group", id: "color_schemes", definition: [{ type: "color", id: "background", label: "Background", default: "#FFFFFF" }, { type: "header", content: "Buttons" }] }, { type: "color_palette", id: "color_palette", default: { background: "#ffffff" } }] }]))
  zip.file("config/settings_data.json", JSON.stringify({ current: { show_badges: true, page_width: 1200, color_schemes: { "scheme-1": { settings: { background: "#FAFAFA" } } }, color_palette: { background: "#ffffff", color1: "#333333" }, logo: "shopify://shop_images/logo.png" } }))
  zip.file("locales/en.default.json", JSON.stringify({ general: { note: "Free returns within 30 days" } }))
  zip.file("locales/en.default.schema.json", JSON.stringify({ sections: { feature: { name: "Feature list", heading: "Heading", content: "Content" } } }))
  zip.file("sections/feature-list.liquid", FEATURE)
  zip.file("sections/blog-only.liquid", BLOG_ONLY)
  zip.file("sections/quotes.liquid", QUOTES)
  zip.file("sections/broken.liquid", `<div>{{ section.settings.title }}</div>`)
  zip.file("sections/bad-json.liquid", `<div></div>{% schema %}{ "name": "Bad", }{% endschema %}`)
  zip.file("sections/header.liquid", `<header>{{ shop.name }}</header>{% schema %}{ "name": "Header", "settings": [] }{% endschema %}`)
  zip.file("sections/header-group.json", JSON.stringify({ type: "header", name: "Header group", sections: {}, order: [] }))
  zip.file("blocks/_quote.liquid", QUOTE_BLOCK)
  zip.file("snippets/badge.liquid", `<span class="badge">{{ label }}</span>`)
  zip.file("snippets/resource-list.liquid", RESOURCE_LIST)
  zip.file("snippets/text.liquid", TEXT_SNIPPET)
  zip.file("blocks/text.liquid", TEXT_BLOCK)
  zip.file("sections/product-list.liquid", PRODUCT_LIST)
  zip.file("sections/spotlight.liquid", SPOTLIGHT)
  zip.file("assets/logo.png", PNG)
  zip.file("assets/section-feature.css", `.feature h2 { font-size: 28px; }`)
  zip.file("assets/theme.js", `console.log("never read")`)
  zip.file("templates/index.json", JSON.stringify({
    sections: {
      main: {
        type: "feature-list",
        settings: { heading: "Hello", "padding-top": 48, blog: "news", image: "shopify://shop_images/a.jpg" },
        blocks: { b1: { type: "item", settings: { title: "One", link: "/about" } }, b2: { type: "item", settings: { title: "{{ product.title }}" } }, b3: { type: "missing" } },
        block_order: ["b1", "b2", "b3"],
      },
      gone: { type: "broken", settings: {} },
      q: { type: "quotes", blocks: { q1: { type: "_quote", settings: { text: "Lovely" } } }, block_order: ["q1"] },
    },
    order: ["main", "gone", "q"],
  }))
  zip.file("templates/collection.json", JSON.stringify({ sections: { m: { type: "feature-list" } }, order: ["m"] }))
  return zip
}

;(async () => {
  console.log("\nRecognising a Shopify theme\n")
  const zip = await shopifyZip()
  check("a ZIP with sections/*.liquid and config/settings_schema.json is a Shopify theme", isShopifyTheme(zip))
  const pkgZip = new JSZip()
  pkgZip.file("theme.json", "{}")
  pkgZip.file("sections/a.liquid", "")
  pkgZip.file("layout/theme.liquid", "")
  check("one with a theme.json is a Storelib package, not a Shopify theme", !isShopifyTheme(pkgZip))
  const nested = new JSZip()
  for (const [p, f] of Object.entries(zip.files)) if (!f.dir) nested.file(`dawn-main/${p}`, await f.async("uint8array"))
  check("a GitHub download, one folder down, is recognised too", isShopifyTheme(nested))

  console.log("\nImporting it whole\n")
  const r = await convertShopifyTheme(zip)
  check("it imports", r.ok === true, r.ok === false ? r.error : undefined)
  if (r.ok === false) {
    console.log(`\n${passed} passed, ${failed} failed\n`)
    process.exit(1)
  }
  const { theme, report } = r
  const files = theme.files
  check("the theme's name, version and author", theme.name === "Test Shop Theme" && theme.version === "2.1.0" && theme.author === "Ada")
  check("every section is kept, in the compatible profile", ["feature-list", "blog-only", "quotes", "broken", "bad-json", "product-list", "spotlight"].every((t) => isCompatSource(files[`sections/${t}.storelib`])))
  check("Shopify's header is kept under a name of its own, as the site's header", !files["sections/header.storelib"] && /"kind": "header"/.test(files["sections/theme-header.storelib"] ?? "") && theme.settings.compat.renamed?.header === "theme-header")
  check("theme blocks, snippets and the layout are kept", isCompatSource(files["blocks/_quote.storelib"]) && isCompatSource(files["blocks/text.storelib"]) && isCompatSource(files["snippets/badge.storelib"]) && isCompatSource(files["layout/theme.storelib"]))
  check("the markup is the theme's own, every tag in it", (files["sections/feature-list.storelib"] ?? "").includes("{% unless section.settings.show_note %}") && (files["sections/feature-list.storelib"] ?? "").includes("{% increment visits %}"))
  const feature = splitCompatFile(files["sections/feature-list.storelib"]).schema as Record<string, unknown>
  const panel = (feature.settings as { id: string }[]).map((s) => s.id)
  check("the panel's schema is the builder's: padding-top is padding_top", panel.includes("padding_top") && panel.includes("heading"))
  check("a setting the builder has no control for is not in the panel, and is in the theme's schema", !panel.includes("thing") && ((feature.shopify as { settings: { id: string }[] }).settings.some((s) => s.id === "thing")))
  check("  and the report says so", report.notes.some((n) => n.file === "sections/feature-list.liquid" && /"thing"/.test(n.message)))
  check("words written as t: keys are the words", feature.name === "Feature list")
  check("the panel's schema validates as the builder reads it", schemaFromStorelib(files["sections/feature-list.storelib"], "sections/feature-list.storelib").ok === true)
  const quoteBlock = themeBlockSchema(files["blocks/_quote.storelib"], "blocks/_quote.storelib")
  check("a theme block's panel schema reads too", quoteBlock?.fields.some((f) => f.id === "text") === true)
  check("a section with no schema is kept and drawn, and the report says it has nothing to change", report.notes.some((n) => n.file === "sections/broken.liquid" && /no \{% schema %\}/.test(n.message)))
  check("a schema that is not JSON is kept and drawn too, and said", report.notes.some((n) => n.file === "sections/bad-json.liquid" && /not a JSON object/.test(n.message)))
  check("the stylesheets and scripts are kept as the theme's files", files["shopify/assets/section-feature.css"]?.includes("font-size: 28px") && files["shopify/assets/theme.js"]?.includes("never read"))
  check("the picture is stored as media", theme.binaries.some((b) => b.name === "logo.png"))
  check("templates, config and locales are kept at their own paths", !!files["shopify/templates/index.json"] && !!files["shopify/config/settings_schema.json"] && !!files["shopify/locales/en.default.json"])

  console.log("\nIts pages\n")
  const home = theme.pages.find((p) => p.page_key === "home")
  check("index is the home page, collection the collection page", !!home && theme.pages.some((p) => p.page_key === "collection"))
  const main = home?.sections.find((s) => s.id === "main")
  check("a section's values are under the builder's ids", main?.settings.padding_top === 48 && main?.settings.heading === "Hello")
  check("a dynamic source is kept, to be read where it is drawn", main?.blocks?.find((b) => b.id === "b2")?.settings.title === "{{ product.title }}")
  check("blocks keep their order", main?.blocks?.map((b) => b.id).join() === "b1,b2,b3")
  check("a picture from the Shopify store's Files is named in the report", report.notes.some((n) => /shop_images|store's Files/.test(n.message)))
  const settings = theme.settings
  check("the install says it is an imported theme", settings.compat.kind === "shopify" && settings.compat.theme === "Test Shop Theme")
  check("the theme's settings are carried whole, objects included", settings.shopify.show_badges === true && settings.shopify.page_width === 1200 && typeof settings.shopify.color_schemes === "object")
  const panelGroups = JSON.parse(files["shopify/config/settings_panel.json"] ?? "[]") as { name: string }[]
  check("the theme settings panel is the theme's own groups", panelGroups.every((g) => g.name !== "theme_info"))
  const colours = ((panelGroups as { name: string; settings: { id: string; type: string; label?: string }[] }[]).find((g) => g.name === "Colors")?.settings ?? [])
  check("each colour scheme's colours are in the panel, under the scheme's name", colours.some((c) => c.type === "header" && c.label === "Scheme 1") && colours.some((c) => c.id === "color_schemes::scheme-1::settings::background" && c.type === "color"))
  check("each colour of the palette is in the panel", colours.some((c) => c.id === "color_palette::background") && colours.some((c) => c.id === "color_palette::color1" && c.label === "Colour 1"))

  console.log("\nDrawn\n")
  const drawn = themeOfInstall(files, settings, { assetUrl: (n) => `/a/${n}`, assetText: (n) => files[`shopify/assets/${n}`] ?? null })
  const page = drawPage(drawn, { template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" } }, (home?.sections ?? []) as never, { scripts: false })
  check("the home page draws its heading through the theme's own Liquid", page.html.includes("<h2>HELLO</h2>"))
  check("case, unless and the locale's words", page.html.includes("<span>Grid</span>") && page.html.includes("Free returns within 30 days"))
  check("a snippet with what it was handed", page.html.includes('<span class="badge">Hello</span>'))
  check("a block's attributes are the builder's selection marks", page.html.includes('data-block-id="b1"'))
  check("raw stays text", page.html.includes("{{ shown as text }}"))
  check("the theme's settings reach the page", page.html.includes("<em>badges on</em>"))
  check("the section's {% stylesheet %} is in the page", page.html.includes(".feature { display: grid; gap: 12px; }"))
  check("a page for the builder carries no script of the theme's when asked for none", !page.html.includes('classList.add("ready")'))

  console.log("\nExported, and imported again\n")
  {
    const out = exportShopifyTheme(files, settings, Object.fromEntries(theme.pages.map((p) => [p.page_key, p.sections])) as never)
    check("it exports as a Shopify theme, under the theme's own names", typeof out.files["sections/header.liquid"] === "string" && typeof out.files["layout/theme.liquid"] === "string" && !Object.keys(out.files).some((p) => p.endsWith(".storelib") || p.startsWith("shopify/")))
    check("a section's {% schema %} is the theme's own again", String(out.files["sections/feature-list.liquid"]).includes('"id": "padding-top"'))
    check("a page's values are under the theme's ids again", JSON.parse(String(out.files["templates/index.json"])).sections.main.settings["padding-top"] === 48)
    const again = new JSZip()
    for (const [path, body] of Object.entries(out.files)) again.file(path, body)
    const r2 = await convertShopifyTheme(again)
    check("and imports again", r2.ok === true, r2.ok === false ? r2.error : undefined)
    if (r2.ok === true) {
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
      const home2 = r2.theme.pages.find((p) => p.page_key === "home")
      check("to the same home page", same(home2?.sections, home?.sections), { before: home?.sections.map((x) => x.id), after: home2?.sections.map((x) => x.id) })
      const differ = Object.keys(files).filter((p) => /^sections\/.*\.storelib$/.test(p)).filter((p) => r2.theme.files[p] !== files[p])
      check("with the same section files", differ.length === 0, differ.map((p) => [p, (files[p] ?? "").length, (r2.theme.files[p] ?? "").length, [...(files[p] ?? "")].findIndex((ch, i) => ch !== (r2.theme.files[p] ?? "")[i])]))
      check("and the same theme settings", same(r2.theme.settings.shopify, settings.shopify))
    }
  }

  console.log("\nLimits\n")
  const huge = new JSZip()
  huge.file("config/settings_schema.json", "[]")
  huge.file("layout/theme.liquid", "")
  huge.file("sections/a.liquid", "")
  for (let i = 0; i < LIMITS.filesPerPackage * 2 + 1; i++) huge.file(`snippets/s${i}.liquid`, "")
  const tooMany = await convertShopifyTheme(huge)
  check("a ZIP with far too many files is refused early, with the number", tooMany.ok === false && /files; the most Storelib reads is/.test(tooMany.error))
  const shell = new JSZip()
  shell.file("config/settings_schema.json", "[]")
  shell.file("sections/a.liquid", "<div></div>")
  const noLayout = await convertShopifyTheme(shell)
  check("a theme with no layout/theme.liquid is refused, saying so", noLayout.ok === false && /layout\/theme\.liquid/.test(noLayout.error))
  const stray = await shopifyZip()
  stray.file("README.md", "hello")
  const withStray = await convertShopifyTheme(stray)
  check("a file outside a theme's folders is named in the report, never dropped without a word", withStray.ok === true && withStray.report.skipped.some((s) => s.file === "README.md"))

console.log("\nA real Shopify download is let in at upload, and nothing else gets in with it\n")
{
  const { checkZipDirectory, shopifyThemeRoot, shopifyScriptEntry, THEME_BLOCKED_INSIDE } = await import("@/lib/security/uploads/zip")
  const { ARCHIVE_LIMITS } = await import("@/lib/security/uploads/policy")
  const dirOf = (names: string[]) => ({ declaredEntries: names.length, entries: names.map((name, i) => ({ name, isDirectory: false, encrypted: false, uncompressedSize: 10, compressedSize: 10, localOffset: i * 100 })) }) as never
  const verdict = (names: string[]) => {
    const root = shopifyThemeRoot(names)
    return checkZipDirectory(dirOf(names), 1000, ARCHIVE_LIMITS.theme, THEME_BLOCKED_INSIDE, root !== null ? shopifyScriptEntry(root) : undefined)
  }
  const dawn = ["sections/header.liquid", "sections/main-product.liquid", "config/settings_schema.json", "layout/theme.liquid", "assets/global.js", "assets/cart.js", "assets/base.css"]
  check("Dawn's assets/*.js no longer refuse the whole theme", verdict(dawn).refusal === null, verdict(dawn).refusal)
  check("  and the admin log says the theme's scripts were let in", verdict(dawn).notes.some((n) => n.code === "zip_shopify_scripts_ignored"))
  check("  in a theme zipped inside its own folder too", verdict(dawn.map((n) => `dawn-main/${n}`)).refusal === null)
  check("a .js anywhere else in a Shopify theme is still refused", verdict([...dawn, "snippets/evil.js"]).refusal?.code === "zip_blocked_entry")
  check("a .js deeper inside assets is still refused", verdict([...dawn, "assets/vendor/x.js"]).refusal?.code === "zip_blocked_entry")
  check("any other blocked type in a Shopify theme is still refused", verdict([...dawn, "assets/run.exe"]).refusal?.code === "zip_blocked_entry")
  check("a .js in a zip that is not a Shopify theme is still refused", verdict(["theme.json", "sections/a.storelib", "assets/a.js"]).refusal?.code === "zip_blocked_entry")
  check("a zip that only pretends (sections but no Shopify shell) gets no exemption", verdict(["sections/a.liquid", "assets/a.js"]).refusal?.code === "zip_blocked_entry")
  /* Shopify's Skeleton and an older theme like Timber have no sections folder at all. */
  const skeleton = ["layout/theme.liquid", "templates/index.liquid", "blocks/header.liquid", "config/settings_schema.json", "assets/liquid-tips.js"]
  check("a theme with no sections (Skeleton, Timber) is let in at upload, its assets/*.js too", verdict(skeleton).refusal === null, verdict(skeleton).refusal)
  check("  but a layout alone, with no home page, gets no exemption", verdict(["layout/theme.liquid", "assets/a.js"]).refusal?.code === "zip_blocked_entry")
}

console.log("\nA theme with no sections: its layout and templates are the theme\n")
{
  const zip = new JSZip()
  zip.file("layout/theme.liquid", `<html><head>{{ content_for_header }}</head><body>{% block 'header', tag: 'nav' %}{% endblock %}<main>{{ content_for_layout }}</main></body></html>`)
  zip.file("blocks/header.liquid", `<{{ tag | default: 'header' }} class="hdr">{{ block.settings.title }} {{ content }}</{{ tag | default: 'header' }}>{% schema %}{"name":"Header","settings":[{"type":"text","id":"title","default":"Shop name"}]}{% endschema %}`)
  zip.file("blocks/tips.liquid", `<ul>{% for t in tips %}<li>{{ t }}</li>{% endfor %}</ul>{{ content }}{% schema %}{"name":"Tips","settings":[]}{% endschema %}`)
  zip.file("templates/index.liquid", `{% block 'tips', tips: ['one', 'two'] %}<p>inside</p>{% endblock %}{% partial 'note' %}<em>fresh</em>{% endpartial %}`)
  zip.file("templates/cart.drawer.liquid", `{% layout none %}<div class="d">{{ cart.item_count }}</div>`)
  zip.file("config/settings_schema.json", "[]")
  check("a theme with a layout and a home page but no sections is a Shopify theme", isShopifyTheme(zip))
  const r = await convertShopifyTheme(zip)
  check("  and it imports", r.ok === true, r.ok === false ? r.error : "")
  if (r.ok) {
    const theme = themeOfInstall(r.theme.files, r.theme.settings, { assetUrl: (n) => `/a/${n}` })
    const home = r.theme.pages.find((p) => p.page_key === "home")
    const html = drawPage(theme, { template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "S" } }, home?.sections ?? [], { scripts: true }).html
    check("{% block 'header', tag: 'nav' %} in the layout draws blocks/header with its defaults, so the header shows", html.includes('<nav class="hdr">Shop name'), html.match(/<body>[\s\S]{0,160}/)?.[0])
    check("a list written out (tips: ['one', 'two']) reaches the block, and what stood between the tags is its content", html.includes("<li>one</li><li>two</li></ul><p>inside</p>"))
    check("{% partial %} draws its content, marked so a script can draw it again", html.includes('<div data-shopify-partial="note" style="display:contents"><em>fresh</em></div>'))
    check("the page can import @shopify/partial-rendering by name", /<script type="importmap">[^<]*@shopify\/partial-rendering/.test(html))
  }
}

console.log("\nAn older theme's SCSS is compiled, as Shopify compiled it\n")
{
  const { compileScss } = await import("../lib/storelib-theme/compat/scss")
  check("nesting and variables come out as plain CSS", compileScss("$c: #123456; .a { .b { color: $c; } }") === ".a .b{color:#123456}")
  check("a stylesheet that does not compile is served as written, with the reason", /^\/\* This stylesheet could not be compiled/.test(compileScss(".a { color: ")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})()
