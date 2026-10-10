/**
 * The Add a section library for an imported Shopify theme.
 *
 * Its cards are drawn by the theme's own engine, not Storelib's native
 * renderer (which has none of the theme's sections and drew blank boxes).
 * A section added with nothing set shows the words of its schema's
 * defaults, which Shopify themes write as `t:` keys into
 * locales/en.default.schema.json: those keys must come out as words, on the
 * live site, in the canvas and in the library. And the card's frame runs no
 * script, so what a theme only reveals with a script must be shown anyway.
 */
import JSZip from "jszip"
import { readFileSync } from "node:fs"

import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { drawPage, themeOfInstall } from "../lib/storelib-theme/compat/page"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}

const HELLO = `<div class="hello scroll-trigger animate--slide-in"><h2>{{ section.settings.title }}</h2>{% for block in section.blocks %}<p {{ block.shopify_attributes }}>{{ block.settings.text }}</p>{% endfor %}</div>
{% schema %}
{
  "name": "t:sections.hello.name",
  "settings": [{ "type": "text", "id": "title", "label": "t:sections.hello.title.label", "default": "t:sections.hello.title.default" }],
  "blocks": [{ "type": "line", "name": "Line", "settings": [{ "type": "text", "id": "text", "label": "Text", "default": "t:sections.hello.blocks.line.text" }] }],
  "presets": [{ "name": "t:sections.hello.name", "blocks": [{ "type": "line" }] }]
}
{% endschema %}`

;(async () => {
  const zip = new JSZip()
  zip.file("layout/theme.liquid", "<html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>")
  zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Preview Theme", theme_version: "1.0.0" }]))
  zip.file("config/settings_data.json", JSON.stringify({ current: {} }))
  zip.file("locales/en.default.json", JSON.stringify({ general: { hi: "Hi" } }))
  zip.file("locales/en.default.schema.json", JSON.stringify({ sections: { hello: { name: "Hello", title: { label: "Title", default: "Welcome to our store" }, blocks: { line: { text: "Share something about your brand" } } } } }))
  zip.file("sections/hello.liquid", HELLO)
  zip.file("templates/index.json", JSON.stringify({ sections: {}, order: [] }))
  const r = await convertShopifyTheme(zip)
  if (!r.ok) { console.log(`  FAIL  converts: ${(r as { error: string }).error}`); process.exit(1) }
  const files = r.theme.files as Record<string, string>

  console.log("\nA schema's t: defaults are words\n")
  const theme = themeOfInstall(files, r.theme.settings, { assetUrl: (n) => `/a/${n}`, assetText: () => null })
  const page = { template: "index", path: "/", designMode: true, products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" } }
  const placed = [{ id: "s1", type: "hello", settings: {}, blocks: [{ id: "b1", type: "line", settings: {} }] }]
  const { html } = drawPage(theme, page as never, placed as never, { scripts: false })
  check("a section's default heading is the locale's words", html.includes("<h2>Welcome to our store</h2>"), html.match(/<h2>[^<]*<\/h2>/)?.[0])
  check("a block's default is the locale's words", html.includes("Share something about your brand"))
  check("no t: key is printed", !/t:sections\./.test(html))

  console.log("\nThe library card\n")
  const preview = readFileSync("components/website-builder/compat/compat-section-preview.tsx", "utf8")
  const previewCode = preview.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const library = readFileSync("components/website-builder/editor/section-library.tsx", "utf8")
  check("the library draws an imported theme's cards with its own engine", /compat=\{!!compatInstallId\}/.test(library) && /<CompatGridWrap/.test(library))
  check("the native preview queue is not asked for an imported theme's sections", /if \(!compatInstallId\) requestPreviews\(jobs, true\)/.test(library) && /if \(!compatInstallId\) requestPreviews\(jobs\)/.test(library))
  check("the card's frame runs no script", /sandbox="allow-same-origin"/.test(preview) && !/allow-scripts/.test(previewCode) && /scripts: false/.test(preview))
  check("what a theme reveals on scroll is shown in the card", /\.scroll-trigger/.test(preview) && /opacity:1!important/.test(preview))
  check("the frame's scale survives the touch rule that flattens transforms", /data-keep-transform/.test(preview))
  check("the card is measured by the body, not the frame it sits in", /body\.getBoundingClientRect\(\)\.height/.test(preview))
  check("a section with nothing to show is named, not blank", /setBlank\(!shows\)/.test(preview))
  const route = readFileSync("app/api/website-builder/themes/[installId]/files/route.ts", "utf8")
  check("the editor is sent the schema words as well as the words", route.includes(String.raw`\.default(\.schema)?\.json$`))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})()
