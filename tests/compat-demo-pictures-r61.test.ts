/**
 * SHOW DEMO PICTURES (round 61), and the blog's categories.
 *
 * A template's own photos are stored in its settings as
 * `shopify://shop_images/<name>`. Theme settings › Starter content ›
 * "Show demo pictures" (`show_demo_pictures`) decides whether a section
 * draws them:
 *
 *   an old theme (no such setting in its schema) draws every picture, even
 *   with a stray `show_demo_pictures: false` in its values
 *   a theme with the setting, never changed (missing) or on: every picture,
 *   exactly as before
 *   turned off: a section's or block's template picture reads as not
 *   chosen (the section draws its placeholder); a picture the creator
 *   picked (an address) still draws; the header and footer groups and the
 *   theme's own logo keep theirs
 *
 * And blogObject's `storelib.categories`: each category with its address,
 * its count and whether the page is it, under a key no Shopify theme reads.
 *
 *   npx tsx tests/compat-demo-pictures-r61.test.ts
 */
import JSZip from "jszip"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { blogObject } from "../lib/storelib-theme/compat/objects"
import type { PublicPostCard, SiteBlogSettings } from "../lib/site-blog/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}

const schema = (name: string, extra = "", blocks = "") => `{% schema %}{"name":"${name}","settings":[${extra}]${blocks ? `,"blocks":[${blocks}]` : ""}}{% endschema %}`
const PIC = `{"type":"image_picker","id":"image","label":"Image"}`
const SETTING = `[{"name":"Starter content","settings":[{"type":"checkbox","id":"show_demo_pictures","label":"Show demo pictures","default":true}]},{"name":"Logo","settings":[{"type":"image_picker","id":"logo","label":"Logo"}]}]`
const OLD_SCHEMA = `[{"name":"Logo","settings":[{"type":"image_picker","id":"logo","label":"Logo"}]}]`

function files(settingsSchema: string, values: Record<string, unknown>): Record<string, string> {
  return {
    "layout/theme.liquid": `<!doctype html><html><head>{{ content_for_header }}</head><body>{% if settings.logo %}<img class="logo" src="{{ settings.logo | image_url: width: 200 }}">{% else %}<span class="logo-none"></span>{% endif %}{% sections 'header-group' %}<main>{{ content_for_layout }}</main></body></html>`,
    "sections/header.liquid": `<header>{% if section.settings.image %}<img class="hdr-pic" src="{{ section.settings.image | image_url: width: 300 }}">{% else %}<span class="hdr-none"></span>{% endif %}</header>${schema("Header", PIC)}`,
    "sections/header-group.json": `{"type":"header","name":"Header","sections":{"header":{"type":"header","settings":{"image":"shopify://shop_images/wall.webp"}}},"order":["header"]}`,
    "sections/hero.liquid": `<div class="hero">{% if section.settings.image %}<img class="hero-pic" src="{{ section.settings.image | image_url: width: 800 }}">{% else %}<svg class="placeholder"></svg>{% endif %}{% for b in section.blocks %}{% if b.settings.image %}<img class="block-pic" src="{{ b.settings.image | image_url: width: 400 }}">{% else %}<svg class="block-placeholder"></svg>{% endif %}{% endfor %}</div>${schema("Hero", PIC, `{"type":"tile","name":"Tile","settings":[${PIC}]}`)}`,
    "templates/index.json": JSON.stringify({ sections: { demo: { type: "hero", settings: { image: "shopify://shop_images/hero.webp" }, blocks: { t1: { type: "tile", settings: { image: "shopify://shop_images/tile.webp" } } }, block_order: ["t1"] }, own: { type: "hero", settings: { image: "https://cdn.example/creator.jpg" } } }, order: ["demo", "own"] }),
    "config/settings_schema.json": settingsSchema,
    "config/settings_data.json": JSON.stringify({ current: values }),
    "assets/hero.webp": "x",
    "assets/tile.webp": "x",
    "assets/wall.webp": "x",
    "assets/logo.webp": "x",
  }
}

async function home(settingsSchema: string, values: Record<string, unknown>): Promise<string> {
  const zip = new JSZip()
  for (const [k, v] of Object.entries(files(settingsSchema, values))) zip.file(k, v)
  const r = await convertShopifyTheme(zip, { fallbackName: "demo" })
  if (r.ok !== true) throw new Error("error" in r ? String(r.error) : "not converted")
  const media: Record<string, string> = { "hero.webp": "/m/hero.webp", "tile.webp": "/m/tile.webp", "wall.webp": "/m/wall.webp", "logo.webp": "/m/logo.webp" }
  const theme = themeOfInstall(r.theme.files, r.theme.settings, {
    assetUrl: (n) => `/a/${n}`,
    assetText: () => null,
    imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : media[v.replace(/^shopify:\/\/shop_images\//, "")] ?? ""),
  })
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  const site: SiteData = { creatorId: "c", theme, pages, products: [], collections: [], menus: {}, shop: { name: "S", currency: "USD", moneyFormat: "${{amount}}" }, host: "x" }
  const o = await answer(site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })
  return String(o.body)
}

const count = (html: string, cls: string) => (html.match(new RegExp(`class="${cls}"`, "g")) ?? []).length

async function main() {
  const logo = { logo: "shopify://shop_images/logo.webp" }

  console.log("\nA theme without the setting draws as it always did\n")
  {
    const a = await home(OLD_SCHEMA, { ...logo })
    check("its template picture, its block picture, the creator's and the header's all draw", count(a, "hero-pic") === 2 && count(a, "block-pic") === 1 && count(a, "hdr-pic") === 1 && count(a, "logo") === 1, a.slice(0, 600))
    const b = await home(OLD_SCHEMA, { ...logo, show_demo_pictures: false })
    check("a stray show_demo_pictures: false in an old theme's values changes nothing", b === a || (count(b, "hero-pic") === 2 && count(b, "block-pic") === 1 && count(b, "placeholder") === 0))
  }

  console.log("\nA theme with the setting\n")
  {
    const missing = await home(SETTING, { ...logo })
    check("never touched (missing): every picture, as before", count(missing, "hero-pic") === 2 && count(missing, "block-pic") === 1 && count(missing, "placeholder") === 0)
    const on = await home(SETTING, { ...logo, show_demo_pictures: true })
    check("on: the same", count(on, "hero-pic") === 2 && count(on, "block-pic") === 1)
    const off = await home(SETTING, { ...logo, show_demo_pictures: false })
    check("off: the section's template picture is a placeholder", count(off, "placeholder") === 1 && !off.includes("/m/hero.webp"), off.slice(0, 800))
    check("  and so is the block's", count(off, "block-placeholder") === 1 && count(off, "block-pic") === 0)
    check("  the picture the creator chose still draws", off.includes("https://cdn.example/creator.jpg") && count(off, "hero-pic") === 1)
    check("  the header group keeps its picture", count(off, "hdr-pic") === 1 && count(off, "hdr-none") === 0)
    check("  and the theme's logo stays", count(off, "logo") === 1 && count(off, "logo-none") === 0)
  }

  console.log("\nStorelib's base theme declares it, on by default\n")
  {
    const schemaJson = JSON.parse(readFileSync(join(process.cwd(), "theme-packages/materia/base/config/settings_schema.json"), "utf8")) as { settings?: { id?: string; default?: unknown }[] }[]
    const s = schemaJson.flatMap((g) => g.settings ?? []).find((x) => x.id === "show_demo_pictures")
    check("show_demo_pictures, default true", !!s && s.default === true, s)
    const data = readFileSync(join(process.cwd(), "theme-packages/materia/base/config/settings_data.json"), "utf8")
    check("the base's values say true, and the old unused setting is gone", /"show_demo_pictures": true/.test(data) && !/enable_demo_images/.test(data))
  }

  console.log("\nThe blog's categories\n")
  {
    const settings = { handle: "news", title: "News", description: "" } as SiteBlogSettings
    const card = (i: number, cat: { slug: string; name: string } | null): PublicPostCard => ({ id: `p${i}`, slug: `p${i}`, path: `/blogs/news/p${i}`, title: `Post ${i}`, excerpt: "", summaryHtml: "", coverImageUrl: "", coverAlt: "", category: cat ? { ...cat, path: `/blogs/news/category/${cat.slug}` } : null, tags: [], author: null, publishedAt: "2026-01-01T00:00:00Z", updatedAt: "", readingMinutes: 1, featured: false })
    const cards = [card(1, { slug: "style", name: "Style" }), card(2, { slug: "care", name: "Care" }), card(3, { slug: "style", name: "Style" }), card(4, null)]
    const b = blogObject(settings, cards, { categorySlug: "care" }) as { storelib: { categories: { title: string; url: string; count: number; current: boolean }[] }; articles: unknown[] }
    check("each category once, by name, with its address and count", JSON.stringify(b.storelib.categories.map((c) => [c.title, c.url, c.count])) === JSON.stringify([["Care", "/blogs/news/category/care", 1], ["Style", "/blogs/news/category/style", 2]]), b.storelib.categories)
    check("  the page's own category is marked current", b.storelib.categories.find((c) => c.title === "Care")?.current === true && b.storelib.categories.find((c) => c.title === "Style")?.current === false)
    check("  and the posts listed are unchanged (the category page's)", b.articles.length === 1)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
