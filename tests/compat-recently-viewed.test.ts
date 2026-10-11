/**
 * RECENTLY VIEWED, IN AN IMPORTED THEME, AS SHOPIFY THEMES WRITE IT.
 *
 * A Shopify theme keeps the products a visitor looked at in the browser
 * (localStorage: ids or handles) and asks the store for their cards in one
 * of a few ways. Each is answered here, by the live site's own handler
 * (lib/storelib-theme/compat/site.ts), from a theme put through the import
 * (lib/storelib-theme/shopify/convert.ts):
 *
 *   /search?view=<alt>&type=product&q=id:1 OR id:2      an alternate search
 *                                                       template, layout none
 *   /search?q=…&section_id=<file name>                  a section file, drawn
 *                                                       about the results
 *   /search?q=…&section_id=<the section's own id>       a section of ANOTHER
 *                                                       page (the product
 *                                                       page's), by its id
 *   /products/<handle>?view=<alt>                       one card per product
 *   /products/<handle>?sections=<file name>             the same, as JSON
 *   /products/<handle>.js                               cards built in JS
 *   /recommendations/products?…&section_id=             related products
 *
 * The browser half (each one on a page, live and in the canvas) is
 * scripts/check-shopify-theme.ts CHECKS=recent.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/compat-recently-viewed.test.ts
 */
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { answerInCanvas, canvasPages } from "../lib/storelib-theme/compat/canvas-cart"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}

const schema = (name: string, extra = "") => `{% schema %}{"name":"${name}","settings":[${extra}]}{% endschema %}`
const CARD = `<div class="card" data-handle="{{ product.handle }}"><a href="{{ product.url }}">{{ product.title }}</a><img src="{{ product.featured_media | image_url: width: 400 }}" width="400" height="{{ 400 | divided_by: product.featured_media.aspect_ratio | round }}" alt="{{ product.featured_media.alt | escape }}"><span class="price">{{ product.price | money }}</span></div>`
const FILES: Record<string, string> = {
  "layout/theme.liquid": `<!doctype html><html><head>{{ content_for_header }}</head><body>{% sections 'header-group' %}<main id="MainContent">{{ content_for_layout }}</main>{% sections 'footer-group' %}</body></html>`,
  "sections/header.liquid": `<header class="hdr">Shop</header>${schema("Header")}`,
  "sections/header-group.json": `{"type":"header","name":"Header","sections":{"header":{"type":"header"}},"order":["header"]}`,
  "sections/footer-group.json": `{"type":"footer","name":"Footer","sections":{},"order":[]}`,
  "snippets/card.liquid": CARD,
  "templates/search.recently-viewed.liquid": `{% layout none %}{% for item in search.results %}{% render 'card', product: item %}{% endfor %}`,
  "templates/product.card.liquid": `{% layout none %}{% render 'card', product: product %}`,
  "templates/product.json": `{"sections":{"main":{"type":"main-product"},"rv":{"type":"recently-viewed","settings":{"heading":"Recently viewed"}},"off":{"type":"recently-viewed","disabled":true}},"order":["main","rv","off"]}`,
  "templates/index.json": `{"sections":{"home-rv":{"type":"recently-viewed"}},"order":["home-rv"]}`,
  "templates/search.json": `{"sections":{"main":{"type":"main-search"}},"order":["main"]}`,
  "sections/main-product.liquid": `<div class="product">{{ product.title }}</div>${schema("Product")}`,
  "sections/main-search.liquid": `<div class="results">{% for item in search.results %}{% render 'card', product: item %}{% endfor %}</div>${schema("Search")}`,
  "sections/recently-viewed.liquid": `<recently-viewed data-section="{{ section.id }}"><h2>{{ section.settings.heading }}</h2>{% if search.performed %}{% for item in search.results %}{% render 'card', product: item %}{% endfor %}{% endif %}</recently-viewed>${schema("Recently viewed", `{"type":"text","id":"heading","default":"You looked at"}`)}`,
  "sections/product-card.liquid": `{% render 'card', product: product %}${schema("Card")}`,
  "sections/product-recommendations.liquid": `<div class="recs">{% for item in recommendations.products %}{% render 'card', product: item %}{% endfor %}</div>${schema("Recommendations")}`,
  "config/settings_schema.json": `[]`,
  "config/settings_data.json": `{"current":{}}`,
}
const ID = (i: number) => `00000000-0000-4000-8000-00000000000${i}`
const products = Array.from({ length: 4 }, (_, i) => ({ id: ID(i), settings: { title: `Shirt ${i}`, price: `$${10 + i}.00`, image: `https://img.test/p${i}.png`, images: [`https://img.test/p${i}.png`], url: `/products/shirt-${i}`, slug: `shirt-${i}`, available: true, kind: "physical" } }))
const handles = (html: string) => [...html.matchAll(/class="card" data-handle="([^"]+)"/g)].map((m) => m[1]).sort()

async function main() {
  const zip = new JSZip()
  for (const [k, v] of Object.entries(FILES)) zip.file(k, v)
  const r = await convertShopifyTheme(zip, { fallbackName: "rv" })
  if (!r.ok) throw new Error(r.error)
  const files = r.theme.files
  const theme = themeOfInstall(files, r.theme.settings, { assetUrl: (n) => `/a/${n}`, assetText: () => null })
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  const site: SiteData = { creatorId: "c", theme, pages, products: products as never, collections: [], menus: {}, shop: { name: "S", currency: "USD", moneyFormat: "${{amount}}" }, host: "x" }
  const get = async (path: string, q: string) => {
    const o = await answer(site, { method: "GET", path, query: new URLSearchParams(q), body: null, cart: [] })
    return { status: o.status, body: String(o.body) }
  }
  const ids = encodeURIComponent(`id:${ID(2)} OR id:${ID(0)}`)

  console.log("\nAsked for by search\n")
  {
    const a = await get("/search", `view=recently-viewed&type=product&q=${ids}`)
    check("an alternate search template, ids joined with OR: those cards alone, no header", a.status === 200 && handles(a.body).join() === "shirt-0,shirt-2" && !/class="hdr"/.test(a.body), a)
    check("  each with its name, price and picture", /<img src="https:\/\/img\.test\/p2\.png" width="400" height="400" alt="Shirt 2">/.test(a.body) && a.body.includes("$12.00"), a.body.slice(0, 300))
    const b = await get("/search", `type=product&q=${encodeURIComponent(`handle:"shirt-1" OR handle:"shirt-3"`)}&view=recently-viewed`)
    check("asked for by handle, quoted", handles(b.body).join() === "shirt-1,shirt-3", b)
    const c = await get("/search", `type=product&q=${encodeURIComponent(`(id:${ID(1)})`)}&view=recently-viewed`)
    check("one id in brackets", handles(c.body).join() === "shirt-1", c)
    const d = await get("/search", `section_id=recently-viewed&type=product&q=${ids}`)
    check("by the section file's name: drawn about the results", d.status === 200 && /id="shopify-section-recently-viewed"/.test(d.body) && handles(d.body).join() === "shirt-0,shirt-2", d)
    const e = await get("/search", `section_id=rv&type=product&q=${ids}`)
    check("by the product page's own id for it: that section, with its own settings, about the results", e.status === 200 && /id="shopify-section-rv"/.test(e.body) && /<h2>Recently viewed<\/h2>/.test(e.body) && handles(e.body).join() === "shirt-0,shirt-2", e)
    const f = await get("/search", `section_id=home-rv&type=product&q=${ids}`)
    check("  the home page's too", f.status === 200 && handles(f.body).join() === "shirt-0,shirt-2", f)
    const off = await get("/search", `section_id=off&type=product&q=${ids}`)
    check("  but not one switched off", off.status === 404, off)
    const none = await get("/search", `section_id=no-such-thing&q=${ids}`)
    check("  and nothing for an id no page has", none.status === 404, none)
  }

  console.log("\nAsked for one product at a time\n")
  {
    const a = await get("/products/shirt-1", "view=card")
    check("an alternate product template: the card alone", a.status === 200 && handles(a.body).join() === "shirt-1" && !/class="hdr"/.test(a.body), a)
    const b = await get("/products/shirt-3", "sections=product-card")
    const json = JSON.parse(b.body) as Record<string, string>
    check("a section by its file's name, as JSON: the card about that product", handles(json["product-card"] ?? "").join() === "shirt-3", b)
    const c = await get("/products/shirt-2.js", "")
    const p = JSON.parse(c.body) as { id: string; handle: string; url: string; title: string; price: number; featured_image: string; images: string[] }
    check("the product as data: its id, handle, address, name, price in cents and picture", p.id === ID(2) && p.handle === "shirt-2" && p.url === "/products/shirt-2" && p.title === "Shirt 2" && p.price === 1200 && p.featured_image === "https://img.test/p2.png" && p.images[0] === p.featured_image, p)
    const d = await get("/recommendations/products", `product_id=${ID(1)}&section_id=product-recommendations&limit=2&intent=related`)
    check("related products, by section", d.status === 200 && handles(d.body).length === 2 && !handles(d.body).includes("shirt-1"), d)
  }

  console.log("\nIn the builder's canvas\n")
  {
    const canvasSite: SiteData = { ...site, designMode: true, pages: canvasPages(theme, "product", pages.product ?? []) }
    const ask = async (url: string) => (await answerInCanvas(canvasSite, { cart: [], note: "" }, { method: "GET", url, body: null, ajax: false }, "/products/shirt-1")).answer
    const a = await ask(`/search?view=recently-viewed&type=product&q=${ids}`)
    check("the search view answers in the canvas as on the website", a.status === 200 && handles(a.body).join() === "shirt-0,shirt-2", a)
    const b = await ask(`/search?type=product&q=${ids}&section_id=rv`)
    check("  and the product page's section by its own id", b.status === 200 && handles(b.body).join() === "shirt-0,shirt-2", b)
    const c = await ask("/products/shirt-3?view=card")
    check("  and a card per product", handles(c.body).join() === "shirt-3", c)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
