/**
 * An imported Shopify theme, exported again as a Shopify theme: what comes out
 * has to upload to Shopify without an error and be the theme the creator left.
 *
 * Measured against Shopify's own Theme Check on Dawn and Horizon (0 errors,
 * the same warnings as the stock themes, every file the same as data when
 * nothing was changed). This suite keeps the shapes that measurement found:
 * preset settings under the theme's own ids, Storelib's own sections and
 * blocks written so Shopify accepts the template, a section's Custom CSS, an
 * uploaded picture, a picked product, names, and settings_data's presets.
 */
import JSZip from "jszip"

import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { exportShopifyTheme, cssRules, shopImageNameFor, keepShape, newsletterForShopify } from "../lib/storelib-theme/compat/export"
import { NEWSLETTER_SECTION_TYPE, REVIEWS_SECTION_TYPE } from "../lib/storelib-theme/compat/native-sections"
import { REVIEW_STARS_BLOCK } from "../lib/storelib-theme/compat/review-app-blocks"
import { SECTION_CSS_KEY } from "../lib/storelib-theme/compat/theme"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}

const HERO = `<div class="hero">{{ section.settings.heading }}{% if section.settings.image %}{{ section.settings.image | image_url: width: 1200 | image_tag }}{% endif %}
{% for block in section.blocks %}<p {{ block.shopify_attributes }}>{{ block.settings.text }}</p>{% endfor %}</div>
{% schema %}
{
  "name": "t:names.hero",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Hello" },
    { "type": "range", "id": "padding-top", "label": "Top", "min": 0, "max": 80, "step": 4, "default": 24 },
    { "type": "image_picker", "id": "image", "label": "Picture" }
  ],
  "blocks": [{ "type": "line", "name": "Line", "settings": [{ "type": "text", "id": "text", "label": "Text" }] }],
  "presets": [{ "name": "t:names.hero", "settings": { "padding-top": 32 }, "blocks": [{ "type": "line", "settings": { "text": "One" } }] }]
}
{% endschema %}
`

const PRODUCT = `<div class="pick">{{ section.settings.product.title }}</div>
{% for block in section.blocks %}<div {{ block.shopify_attributes }}>{{ block.type }}</div>{% endfor %}
{% schema %}
{
  "name": "Featured product",
  "settings": [{ "type": "product", "id": "product", "label": "Product" }],
  "blocks": [{ "type": "@app" }, { "type": "title", "name": "Title", "settings": [] }],
  "presets": [{ "name": "Featured product" }]
}
{% endschema %}
`

const SCHEMA_LOCALE = `/*
 * Shopify's comment header.
 */
{
  // a line comment, as Horizon writes them
  "names": { "hero": "Hero", "heading": "Heading" }
}
`

function theme(): JSZip {
  const z = new JSZip()
  z.file("layout/theme.liquid", "<!doctype html><html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>\n")
  z.file("sections/hero.liquid", HERO)
  z.file("sections/featured-product.liquid", PRODUCT)
  z.file("config/settings_schema.json", JSON.stringify([
    { name: "theme_info", theme_name: "Test", theme_version: "1.0.0" },
    { name: "Logo", settings: [{ type: "image_picker", id: "logo", label: "Logo" }, { type: "color", id: "accent", label: "Accent", default: "#111111" }] },
  ]))
  z.file("config/settings_data.json", JSON.stringify({ current: "Calm", presets: { Calm: { accent: "#222222" }, Bold: { accent: "#ff0000" } } }))
  z.file("locales/en.default.json", JSON.stringify({ general: { hi: "Hi" } }))
  z.file("locales/en.default.schema.json", SCHEMA_LOCALE)
  z.file("templates/index.json", JSON.stringify({
    sections: {
      hero_a: { type: "hero", name: "t:names.hero", settings: { heading: "Spring", "padding-top": 40 }, blocks: { line_1: { type: "line", name: "t:names.heading", settings: { text: "Hi" }, blocks: {} } }, block_order: ["line_1"] },
      plain: { type: "hero" },
    },
    order: ["hero_a", "plain"],
  }))
  z.file("templates/product.json", JSON.stringify({ sections: { pick: { type: "featured-product", settings: {}, blocks: { t: { type: "title", settings: {} } }, block_order: ["t"] } }, order: ["pick"] }))
  return z
}

async function run() {
  const r = await convertShopifyTheme(theme())
  check("the theme imports", r.ok === true, r.ok === false ? r.error : undefined)
  if (r.ok !== true) return
  const files: Record<string, string> = { ...r.theme.files }
  const settings = r.theme.settings as Record<string, unknown>
  const pagesOf = () => Object.fromEntries(r.theme.pages.map((p) => [p.page_key, structuredClone(p.sections)])) as Record<string, any[]>

  console.log("\nNothing changed\n")
  {
    const out = exportShopifyTheme(files, settings, pagesOf() as never)
    const index = JSON.parse(String(out.files["templates/index.json"]))
    check("a section keeps the name the theme gave it, a translation key", index.sections.hero_a.name === "t:names.hero", index.sections.hero_a)
    check("a block keeps its name too", index.sections.hero_a.blocks.line_1.name === "t:names.heading", index.sections.hero_a.blocks.line_1)
    check("an empty blocks the theme wrote stays", JSON.stringify(index.sections.hero_a.blocks.line_1.blocks) === "{}")
    check("a section the theme wrote with no settings gets none", !("settings" in index.sections.plain) && !("name" in index.sections.plain), index.sections.plain)
    const hero = String(out.files["sections/hero.liquid"])
    const schema = JSON.parse(hero.slice(hero.indexOf("{% schema %}") + 12, hero.indexOf("{% endschema %}")))
    check("a preset's settings are under the theme's own ids again", schema.presets?.[0]?.settings?.["padding-top"] === 32, schema.presets?.[0])
    check("the section's markup is byte for byte the theme's", hero.slice(0, hero.indexOf("{% schema %}")) === HERO.slice(0, HERO.indexOf("{% schema %}")))
    const data = JSON.parse(String(out.files["config/settings_data.json"]))
    check("settings_data keeps the theme's presets", data.presets?.Calm?.accent === "#222222" && data.presets?.Bold?.accent === "#ff0000", data.presets)
    check("and names the preset in use the way the theme did", data.current === "Calm", data.current)
    check("nothing Storelib's is in the theme", !Object.keys(out.files).some((p) => p.startsWith("shopify/") || p.endsWith(".storelib") || p.includes("storelib-")))
    check("and no notes", out.notes.length === 0, out.notes)
  }

  console.log("\nChanged in the builder\n")
  {
    const pages = pagesOf()
    const home = pages.home
    const hero = home.find((s) => s.id === "hero_a")
    hero.settings.image = "https://xyz.supabase.co/storage/v1/object/public/uploads/u1/spring%20hero.jpg"
    hero.settings[SECTION_CSS_KEY] = "h2 { color: red; }\n@media (min-width: 750px) { h2 { font-size: 40px; } }"
    hero.name = "Spring hero"
    home.push({ id: "news_1", type: NEWSLETTER_SECTION_TYPE, name: "Newsletter", settings: { heading: "Join" } })
    const product = pages.product
    product.push({ id: "rev_1", type: REVIEWS_SECTION_TYPE, name: "Storelib Reviews", settings: {} })
    const pick = product.find((s) => s.type === "featured-product")
    pick.settings.product = "0d5f2c1e-7a4b-4c3d-9e8f-1a2b3c4d5e6f"
    pick.blocks.push({ id: "stars", type: REVIEW_STARS_BLOCK, settings: {} })

    const out = exportShopifyTheme(files, settings, pages as never, { productHandles: { "0d5f2c1e-7a4b-4c3d-9e8f-1a2b3c4d5e6f": "linen-tote" } })
    const index = JSON.parse(String(out.files["templates/index.json"]))
    const h = index.sections.hero_a
    check("a renamed section carries the new name", h.name === "Spring hero", h.name)
    const picture = shopImageNameFor(hero.settings.image)
    check("an uploaded picture points at Shopify's files", h.settings.image === `shopify://shop_images/${picture}`, h.settings.image)
    check("and comes with the theme to upload", out.media[picture] === hero.settings.image, out.media)
    check("Custom CSS is where Shopify keeps it, one rule each", Array.isArray(h.custom_css) && h.custom_css.length === 2 && h.custom_css[0] === "h2 { color: red; }", h.custom_css)
    check("Storelib's newsletter is a section file in the theme", typeof out.files[`sections/${NEWSLETTER_SECTION_TYPE}.liquid`] === "string" && index.sections.news_1?.type === NEWSLETTER_SECTION_TYPE)
    const productT = JSON.parse(String(out.files["templates/product.json"]))
    check("Storelib Reviews are left out, so the template names no missing section", !productT.sections.rev_1 && !productT.order.includes("rev_1"), productT.order)
    check("a Storelib app block is left out", !productT.sections.pick.blocks.stars && !productT.sections.pick.block_order.includes("stars"))
    check("a picked product is written by its handle", productT.sections.pick.settings.product === "linen-tote", productT.sections.pick.settings)
    check("and each thing left out is said", out.notes.some((n) => /Reviews are left out/.test(n)) && out.notes.some((n) => /blocks .* are left out/.test(n)) && out.notes.some((n) => /Content › Files/.test(n)), out.notes)

    const again = new JSZip()
    for (const [path, body] of Object.entries(out.files)) again.file(path, body)
    const r2 = await convertShopifyTheme(again)
    check("the exported theme imports again", r2.ok === true, r2.ok === false ? r2.error : undefined)
  }

  console.log("\nThe newsletter section as Shopify reads it\n")
  {
    const src = newsletterForShopify()
    const schema = JSON.parse(src.slice(src.indexOf("{% schema %}") + 12, src.indexOf("{% endschema %}")))
    const headers = (schema.settings ?? []).filter((s: any) => s.type === "header")
    check("a heading setting is type and content only", headers.length > 0 && headers.every((s: any) => Object.keys(s).sort().join() === "content,type"), headers)
    check("the builder's canvas is Shopify's theme editor", !/storelib_in_builder/.test(src) && /request\.design_mode/.test(src))
    const imgs = src.match(/<img class="slnl__bg"[^>]*>/g) ?? []
    check("each background picture has a width and a height", imgs.length > 0 && imgs.every((t) => /\bwidth="/.test(t) && /\bheight="/.test(t)), imgs)
  }

  console.log("\nThe helpers\n")
  check("cssRules splits top-level rules and keeps @media whole", JSON.stringify(cssRules("a{b:c} @media (x){d{e:f}}")) === JSON.stringify(["a{b:c}", "@media (x){d{e:f}}"]), cssRules("a{b:c} @media (x){d{e:f}}"))
  check("shopImageNameFor is stable and Shopify-safe", shopImageNameFor("https://x/a%20b.png") === shopImageNameFor("https://x/a%20b.png") && /^storelib-[0-9a-f]{8}-[a-z0-9._-]+$/i.test(shopImageNameFor("https://x/a%20b.png")), shopImageNameFor("https://x/a%20b.png"))
  const shaped = keepShape({ type: "x", settings: {}, blocks: { b: { type: "y", settings: {} } }, block_order: [] }, { type: "x", blocks: { b: { type: "y", name: "Mine" } } })
  check("keepShape gives back the theme's own shape", JSON.stringify(shaped) === JSON.stringify({ type: "x", blocks: { b: { type: "y", name: "Mine" } } }), shaped)
  const other = keepShape({ type: "x", settings: {} }, { type: "z", name: "Other" })
  check("but not across a changed type", JSON.stringify(other) === JSON.stringify({ type: "x", settings: {} }), other)
}

run().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
