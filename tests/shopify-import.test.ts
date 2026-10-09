/**
 * A Shopify Online Store 2.0 theme, imported by converting its Liquid to
 * .storelib files (lib/storelib-theme/shopify/convert.ts).
 *
 * The theme here is built in memory and small, but has every kind of thing
 * a real one has: a schema with locale keys, a stylesheet and a script, the
 * Liquid tags Storelib does not have (unless, case, assign, render,
 * increment, comment, raw), filters it does not have, shopify_attributes,
 * a setting type it does not have, a section that cannot be converted, a
 * theme block, templates, theme settings, locales and a picture. It is
 * converted, built into a package and read back through readPackage, the
 * same door the import route uses.
 */
import JSZip from "jszip"

import { buildPackage, readPackage } from "../lib/storelib-theme/package"
import { compileBlock, compileSection } from "../lib/storelib-theme/storelib/compile"
import { conversionSummary, convertShopifyTheme, isShopifyTheme, SHOPIFY_LICENSE_NOTICE } from "../lib/storelib-theme/shopify/convert"
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
  <ul>
  {%- for block in section.blocks -%}
    <li {{ block.shopify_attributes }}><a href="{{ block.settings.link }}">{{ block.settings.title | money }}{{ block.settings.title | payment_terms }}</a></li>
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

const QUOTE_BLOCK = `<blockquote class="quote" {{ block.shopify_attributes }}>{{ block.settings.text }}</blockquote>
{% schema %}
{ "name": "Quote", "tag": null, "settings": [{ "type": "inline_richtext", "id": "text", "label": "Text", "default": "Great shop" }] }
{% endschema %}
`

async function shopifyZip(): Promise<JSZip> {
  const zip = new JSZip()
  zip.file("layout/theme.liquid", "<html><body>{{ content_for_layout }}</body></html>")
  zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Test Shop Theme", theme_version: "2.1.0", theme_author: "Ada" }, { name: "Colors", settings: [] }]))
  zip.file("config/settings_data.json", JSON.stringify({ current: { show_badges: true, page_width: 1200, color_schemes: { "scheme-1": {} }, logo: "shopify://shop_images/logo.png" } }))
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

  console.log("\nConverting it\n")
  const r = await convertShopifyTheme(zip)
  check("it converts", r.ok === true, r.ok === false ? r.error : undefined)
  if (r.ok === false) {
    console.log(`\n${passed} passed, ${failed} failed\n`)
    process.exit(1)
  }
  const { pkg, report } = r
  const src = pkg.files["sections/feature-list.storelib"] ?? ""
  check("theme.json takes the name, version and author from theme_info", pkg.theme.name === "Test Shop Theme" && pkg.theme.version === "2.1.0" && pkg.theme.author === "Ada")
  check("and says it was converted from Shopify", /Converted from the Shopify theme/.test(String(pkg.theme.description)))
  check("the converted sections are listed", ["sections/feature-list.liquid", "sections/blog-only.liquid", "sections/quotes.liquid", "blocks/_quote.liquid", "templates/index.json"].every((f) => report.converted.includes(f)), report.converted)

  const compiled = compileSection(src, { file: "sections/feature-list.storelib", expectType: "feature-list" })
  check("the main section compiles as a Storelib section", compiled.ok === true, compiled.ok === false ? compiled.errors.slice(0, 3) : undefined)
  for (const path of Object.keys(pkg.files).filter((p) => p.endsWith(".storelib"))) {
    const c = path.startsWith("blocks/") ? compileBlock(pkg.files[path], { file: path, type: path.slice(7, -9) }) : compileSection(pkg.files[path], { file: path })
    check(`${path} compiles`, c.ok === true, c.ok === false ? c.errors[0] : undefined)
  }

  console.log("\nWhat the Liquid became\n")
  check("section.settings.x is settings.x, and an assign is read as what it was assigned", src.includes("<h2>{{ settings.heading | upcase }}</h2>"))
  check("unless is if not (…)", src.includes("{% if not (settings.show_note) %}"))
  check("the t filter is the words from locales/en.default.json", src.includes(`<p class="note">Free returns within 30 days</p>`))
  check("case/when is an if/elsif chain, a when with two values is an or", src.includes(`{% if settings.layout == "grid" %}`) && src.includes(`{% elsif settings.layout == "list" or settings.layout == "rows" %}`) && src.includes("{% else %}<span>Other</span>"))
  check("a rendered snippet is written in place, its parameter read as what was passed", src.includes(`<span class="badge">{{ settings.heading }}</span>`))
  check("for block in section.blocks is for block in blocks", src.includes("{% for block in blocks %}"))
  check("richtext prints with raw, as Shopify printed it", src.includes("{{ settings.text | raw }}"))
  check("image_url | image_tag is an <img> of the setting", src.includes(`<img src="{{ settings.image }}" alt="" loading="lazy">`))
  check("a hyphenated setting id is the same name with _", src.includes(`"id": "padding_top"`) && src.includes("{{ settings.padding_top }}px"))
  check("Shopify's own settings.x is the theme's, under theme.settings.shopify", src.includes("{% if theme.settings.shopify.show_badges %}"))
  check("{% stylesheet %}, {% style %} and a stylesheet_tag'd asset all reach the <style> block", (() => {
    const style = src.split("<style>")[1] ?? ""
    return style.includes(".feature { display: grid") && style.includes(".feature h2 { font-size: 28px; }") && style.includes("padding-top: {{ settings.padding_top }}px")
  })())
  const asset = Object.entries(pkg.assets).find(([, a]) => a.filename === "logo.png")
  check("the picture a section points at is a package asset, referenced by hash", !!asset && src.includes(`{{ "asset://${asset[0]}" | asset }}`))
  check("a script nobody points at is not an asset", !Object.values(pkg.assets).some((a) => a.filename.endsWith(".js")))
  const block = pkg.files["blocks/_quote.storelib"] ?? ""
  check("a theme block prints block.storelib_attributes and is not wrapped", block.includes("{{ block.storelib_attributes }}") && /"tag": null/.test(block))
  check("a section holding theme blocks keeps content_for", (pkg.files["sections/quotes.storelib"] ?? "").includes(`{% content_for "blocks" %}`))

  console.log("\nNo Liquid survives, and nothing ran\n")
  const all = Object.values(pkg.files).join("\n")
  for (const tag of ["render", "assign", "unless", "case", "when", "liquid", "increment", "comment", "raw", "schema", "javascript", "stylesheet", "style", "include", "capture"]) {
    check(`no {% ${tag} %} in any converted file`, !new RegExp(`\\{%-?\\s*${tag}\\b`).test(all))
  }
  check("no shopify_attributes, no {{- or -%}", !/shopify_attributes|\{\{-|-%\}|\{%-/.test(all))
  check("no section.settings outside a visible_if", !all.split("\n").some((l) => l.includes("section.settings") && !l.includes("visible_if")))
  check("the <script> and the onclick are gone", !/<script|onclick/.test(src.split("<style>")[0]))
  check("{% increment %} is text that was removed, not a counter: nothing counts", !/visits/.test(src))
  check("names Storelib cannot read are read as nothing", !/cart|request|design_mode/.test(src.split("<style>")[0]) && src.includes("{% if null %}EDITOR ONLY{% endif %}"))
  check("a comment does not reach the page", !src.includes("secret note"))
  check("raw's body is text, so its braces start nothing", src.includes("&#123;{ shown as text }}"))
  check("{% javascript %} that reaches for document is left out", !src.includes("<script>"))

  console.log("\nWhat was left out is said\n")
  const said = (file: string, re: RegExp) => report.notes.some((n) => n.file === file && re.test(n.message))
  const F = "sections/feature-list.liquid"
  check("a blog setting dropped, with the reason", said(F, /Setting "blog" \(blog\) was dropped\. A Storelib website has no blog/))
  check("a metaobject setting dropped, with the reason", said(F, /Setting "thing" \(metaobject\) was dropped/))
  check("app blocks dropped", said(F, /App blocks were dropped/))
  check("a snippet that is not there", said(F, /\{% render 'missing-snippet' %\} was removed: snippets\/missing-snippet\.liquid is not in the theme/))
  check("a filter Storelib has, money, is kept", src.includes("{{ block.settings.title | money }}"))
  check("a filter Storelib lacks", said(F, /"payment_terms"/), report.notes.filter((n) => n.file === F).map((n) => n.message))
  check("the <script> tag", said(F, /A <script> in the markup was removed/))
  check("the onclick", said(F, /on…= attributes were removed/))
  check("increment", said(F, /\{% increment %\} was removed/))
  check("the section's {% javascript %}", said(F, /\{% javascript %\} was left out/))
  check("the section with a dropped setting still converts", report.converted.includes("sections/blog-only.liquid") && said("sections/blog-only.liquid", /Setting "blog" \(blog\) was dropped/))
  const skipped = (file: string, re: RegExp) => report.skipped.some((s) => s.file === file && re.test(s.reason))
  check("a section without a schema is left out, and why", skipped("sections/broken.liquid", /no \{% schema %\}/))
  check("a section whose schema is not JSON is left out, and why", skipped("sections/bad-json.liquid", /not a JSON object/))
  check("the header is left out: the site has its own", skipped("sections/header.liquid", /draws its own header/))
  check("the header group is left out", skipped("sections/header-group.json", /groups are not imported/))
  check("a collection template has no Storelib page", skipped("templates/collection.json", /no collection template/))
  check("the layout is not used", skipped("layout/theme.liquid", /page shell/))
  check("the theme's scripts are left out", skipped("assets/", /1 script was left out/))
  check("the summary line counts sections", conversionSummary(report) === "Converted 3 of 6 sections and 1 of 1 blocks from Shopify. 3 were left out.", conversionSummary(report))
  check("the license reminder says the importer is responsible", /right to use/.test(SHOPIFY_LICENSE_NOTICE) && !/—/.test(SHOPIFY_LICENSE_NOTICE))
  check("no report line uses an em dash", ![...report.notes.map((n) => n.message), ...report.skipped.map((s) => s.reason)].some((m) => m.includes("—")))

  console.log("\nTemplates and settings\n")
  const home = JSON.parse(pkg.files["templates/home.json"] ?? "{}")
  check("index is the home page", !!home.sections && Array.isArray(home.order))
  check("a section that did not convert is left off the page", home.order.join(",") === "main,q" && !home.sections.gone)
  check("and the page says so", said("templates/index.json", /did not convert were left off this page: broken/))
  const main = home.sections.main ?? {}
  check("saved values are kept for settings that survived, under their Storelib id", main.settings?.heading === "Hello" && main.settings?.padding_top === 48)
  check("values for dropped settings and shopify:// addresses are not", !("blog" in (main.settings ?? {})) && !("image" in (main.settings ?? {})))
  check("blocks of a type the section declares are kept, in order", JSON.stringify(main.block_order) === JSON.stringify(["b1", "b2"]) && main.blocks?.b1?.settings?.title === "One")
  check("a dynamic source value is not kept as text", !("title" in (main.blocks?.b2?.settings ?? {})))
  check("theme blocks in a section keep their values", home.sections.q?.blocks?.q1?.settings?.text === "Lovely")
  check("no collection page was made", !pkg.files["templates/collection.json"])
  const settings = JSON.parse(pkg.files["config/settings.json"] ?? "{}")
  check("plain theme settings are carried under shopify", settings.shopify?.show_badges === true && settings.shopify?.page_width === 1200)
  check("objects and shopify:// values are not", !("color_schemes" in settings.shopify) && !("logo" in settings.shopify))

  console.log("\nThrough the package reader\n")
  const bytes = await buildPackage(pkg)
  const read = await readPackage(bytes, { knownTypes: [] })
  check("buildPackage + readPackage accept it, every check included", read.ok === true, read.ok === false ? read.errors.slice(0, 3) : undefined)
  if (read.ok === true) {
    check("every converted file comes back", Object.keys(pkg.files).every((p) => read.value.files[p] === pkg.files[p]))
    check("the picture comes back as an asset", !!asset && !!read.value.assets[asset[0]])
  }
  const reserved = await convertShopifyTheme(await shopifyZip(), { reservedTypes: ["quotes"] })
  check("a name the account already draws itself is renamed, not replaced", reserved.ok === true && !!reserved.pkg.files["sections/quotes-shopify.storelib"] && !reserved.pkg.files["sections/quotes.storelib"] && JSON.parse(reserved.pkg.files["templates/home.json"]).sections.q.type === "quotes-shopify")

  console.log("\nLimits\n")
  const huge = new JSZip()
  huge.file("config/settings_schema.json", "[]")
  huge.file("sections/a.liquid", "")
  for (let i = 0; i < LIMITS.filesPerPackage * 2 + 1; i++) huge.file(`snippets/s${i}.liquid`, "")
  const tooMany = await convertShopifyTheme(huge)
  check("a ZIP with far too many files is refused early, with the number", tooMany.ok === false && /files; the most Storelib reads is/.test(tooMany.error))
  const none = new JSZip()
  none.file("config/settings_schema.json", "[]")
  none.file("sections/a.liquid", "<div></div>")
  const nothing = await convertShopifyTheme(none)
  check("a theme where no section converts is refused, with the first reason", nothing.ok === false && /No section of this Shopify theme could be converted\. sections\/a\.liquid/.test(nothing.error))

  
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
  check("  and the admin log says scripts were let in and never kept", verdict(dawn).notes.some((n) => n.code === "zip_shopify_scripts_ignored"))
  check("  in a theme zipped inside its own folder too", verdict(dawn.map((n) => `dawn-main/${n}`)).refusal === null)
  check("a .js anywhere else in a Shopify theme is still refused", verdict([...dawn, "snippets/evil.js"]).refusal?.code === "zip_blocked_entry")
  check("a .js deeper inside assets is still refused", verdict([...dawn, "assets/vendor/x.js"]).refusal?.code === "zip_blocked_entry")
  check("any other blocked type in a Shopify theme is still refused", verdict([...dawn, "assets/run.exe"]).refusal?.code === "zip_blocked_entry")
  check("a .js in a zip that is not a Shopify theme is still refused", verdict(["theme.json", "sections/a.storelib", "assets/a.js"]).refusal?.code === "zip_blocked_entry")
  check("a zip that only pretends (sections but no Shopify shell) gets no exemption", verdict(["sections/a.liquid", "assets/a.js"]).refusal?.code === "zip_blocked_entry")
}

console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})()
