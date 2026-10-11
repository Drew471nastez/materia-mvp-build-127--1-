/**
 * AN IMPORTED THEME'S HEADER MENUS AND PRODUCT CARDS, AS ON SHOPIFY.
 *
 *   LINK OBJECTS     a menu link's `object` is the collection or product it
 *                    opens (a mega menu draws its picture or its products
 *                    from it), and its `type` is Shopify's: catalog_link for
 *                    /collections/all, collection_link, product_link...
 *                    It was always nil, and Horizon's featured collections
 *                    and products menus drew empty columns.
 *   SECTION INDEX    a section drawn alone for the Section Rendering API
 *                    has no `section.index`, as on Shopify. Horizon's header
 *                    asks for itself that way once the page has loaded and
 *                    fills its mega menu and drawer only when the index is
 *                    blank; with one, the menu stayed empty on the website.
 *   A CARD PRESSED   in the builder's canvas, a product card that opens its
 *                    product with location.href (pressed on its picture,
 *                    not on its link) tells the builder which product, as a
 *                    link does (lib/storelib-theme/compat/canvas-bridge.ts).
 *
 * The browser half: scripts/check-shopify-theme.ts CHECKS=header,cards.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/compat-header-cards.test.ts
 */
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { CANVAS_BRIDGE } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const section = (type: string, markup: string, settings: unknown[] = []) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings })}\n</schema>\n`

const products = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, settings: { title: `Shirt ${i}`, slug: `shirt-${i}`, url: `/products/shirt-${i}`, price: "$40.00", image: `https://img.test/p${i}.png`, available: true } }))
const collections = [{ id: "c1", title: "Summer", handle: "summer", description: "", image: "https://img.test/c1.png", url: "/collections/summer", products: products.slice(0, 2), products_count: 2 }]
const menus = { "main-menu": { title: "Main", links: [{ title: "Home", url: "/" }, { title: "Shop", url: "/collections/all", links: [{ title: "Summer", url: "/collections/summer" }, { title: "Shirt 2", url: "/products/shirt-2" }] }, { title: "About", url: "/pages/about" }, { title: "Search", url: "/search" }] } }

async function main() {
  console.log("\nA menu link's object and type\n")
  {
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{{ content_for_layout }}</body></html>`),
      "sections/menu.storelib": section("menu", `{%- for link in section.settings.menu.links -%}[{{ link.type }}|{{ link.object.title }}]{%- for c in link.links -%}({{ c.type }}|{{ c.object.title }}|{{ c.object.products.size }}|{{ c.object.featured_image | image_url: width: 100 }}|{{ c.object.price | money }}){%- endfor -%}{%- endfor -%}|{{ linklists.main-menu.links[1].links[0].object.handle }}`, [{ type: "link_list", id: "menu" }]),
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
    const ctx = theme.pageContext({ template: "index", path: "/", designMode: false, products: products as never, collections: collections as never, menus, shop: { name: "S" } })
    const drawn = theme.renderSection(ctx, { id: "m", type: "menu", settings: { menu: "main-menu" }, hidden: false, blocks: [] }).html
    check("types as Shopify's: the home page, the catalog, a page, the search", drawn.includes("[frontpage_link|]") && drawn.includes("[catalog_link|Products]") && drawn.includes("[page_link|]") && drawn.includes("[search_link|]"), drawn)
    check("a collection link's object is the collection, with its products and picture", drawn.includes("(collection_link|Summer|2|"), drawn)
    check("a product link's object is the product, with its picture and price", /\(product_link\|Shirt 2\|\|[^|]*p2\.png[^|]*\|\$40\.00\)/.test(drawn), drawn)
    check("linklists reads the same objects", drawn.endsWith("|summer</div>"), drawn.slice(-80))
  }

  console.log("\nSection rendering has no section.index\n")
  {
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main></body></html>`),
      "sections/hdr.storelib": section("hdr", `<header>{% if section.index == blank %}eager{% else %}light {{ section.index }}{% endif %}</header>`),
      "sections/body.storelib": section("body", `<p>{% if section.index == blank %}alone{% else %}at {{ section.index }}{% endif %}</p>`),
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
    const site: SiteData = { creatorId: "c", theme, pages: { home: [{ id: "h", type: "hdr", group: "header" }, { id: "b", type: "body" }] }, products: [], collections: [], menus: {}, shop: { name: "S", currency: "USD", moneyFormat: "${{amount}}" }, host: "x" }
    const get = async (q: string) => String((await answer(site, { method: "GET", path: "/", query: new URLSearchParams(q), body: null, cart: [] })).body)
    const page = await get("")
    check("on the page, each section has its index", /<header>light 1<\/header>/.test(page) && /<p>at 1<\/p>/.test(page), page.slice(0, 300))
    check("drawn alone (?section_id=), the header's index is blank: Horizon fills its mega menu", /<header>eager<\/header>/.test(await get("section_id=h")))
    check("  and the page's section's too", /<p>alone<\/p>/.test(await get("section_id=b")))
    const many = JSON.parse(await get("sections=h,b")) as Record<string, string>
    check("  and every one of ?sections=", /eager/.test(many.h) && /alone/.test(many.b), many)
  }

  console.log("\nA product card pressed on its picture, in the canvas\n")
  {
    /* The bridge in a page of its own, as compat-storefront-accuracy.test.ts runs it. */
    const posted: { type?: string; href?: string; chrome?: boolean }[] = []
    const winListeners: Record<string, ((e: unknown) => void)[]> = {}
    const docListeners: Record<string, ((e: unknown) => void)[]> = {}
    const add = (t: string, fn: (e: unknown) => void) => { (winListeners[t] ??= []).push(fn) }
    const fakeDoc = { addEventListener: (t: string, fn: (e: unknown) => void) => { (docListeners[t] ??= []).push(fn) }, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } }), createTextNode: () => ({}), elementFromPoint: () => null, documentElement: { scrollHeight: 0 }, readyState: "complete", head: { appendChild() {} }, body: { appendChild() {}, removeChild() {} }, elementsFromPoint: () => [] }
    const env = { window: { addEventListener: add, removeEventListener() {} } as Record<string, unknown>, document: fakeDoc, addEventListener: add, removeEventListener() {}, parent: { postMessage: (m: never) => posted.push(m) }, requestAnimationFrame: () => 0, CSS: { escape: (x: string) => x }, MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} }, innerHeight: 800, scrollY: 0, location: { pathname: "/" } }
    new Function(...Object.keys(env), CANVAS_BRIDGE)(...Object.values(env))
    /* A card: <li class=card><img><a href=/products/shirt-1></a></li>, in a section with links to other products. */
    const link = (href: string) => ({ getAttribute: (n: string) => (n === "href" ? href : null) })
    const sectionEl = { classList: { contains: (c: string) => c === "shopify-section" }, querySelectorAll: () => [link("/products/shirt-1"), link("/products/shirt-2")], parentElement: null }
    const card = { classList: { contains: () => false }, querySelectorAll: () => [link("/products/shirt-1"), link("/products/shirt-1")], parentElement: sectionEl }
    const img = { closest: () => null, classList: { contains: () => false }, querySelectorAll: () => [], parentElement: card }
    const press = (target: unknown) => { for (const fn of docListeners.click ?? []) fn({ target, defaultPrevented: false, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }) }
    const leave = () => { for (const fn of winListeners.pagehide ?? []) fn({}) }
    posted.length = 0
    press(img)
    leave()
    const nav = posted.filter((m) => m.type === "navigate")
    check("the theme opened the product itself: the builder is told which", nav.length === 1 && nav[0].href === "/products/shirt-1" && nav[0].chrome === false, posted)
    posted.length = 0
    press({ ...img, closest: (sel: string) => (/button/.test(sel) ? {} : null) })
    leave()
    check("a press on a button in the card (quick add) is not a press on the card", posted.filter((m) => m.type === "navigate").length === 0, posted)
    posted.length = 0
    press({ closest: () => null, classList: { contains: () => false }, querySelectorAll: () => [], parentElement: sectionEl })
    leave()
    check("nor is a press on a box with links to two products", posted.filter((m) => m.type === "navigate").length === 0, posted)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
