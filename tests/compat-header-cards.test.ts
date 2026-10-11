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
 *   PICTURES         image_url asks the optimizer for the width the theme
 *                    asked for (Shopify's size), not twice it: a srcset's
 *                    "720w" file was 1920 wide. Storelib's own uploads
 *                    (storelib.com/media) are resized; they went out whole.
 *                    image_tag is not lazy in the page's first three
 *                    sections, as on Shopify: the hero is asked for first.
 *   DRAWN AGAIN      a section changed in the builder is drawn at its own
 *                    place (its section.index among its part's sections),
 *                    as the page drew it, not at its place in the whole
 *                    page: the first section of a page was redrawn as the
 *                    fourth, and a theme that draws its first section
 *                    differently changed shape on every edit.
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
import { drawPage, drawSection, pageContextFor, sectionIndexIn, type StoredSection } from "../lib/storelib-theme/compat/page"
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

  console.log("\nA section drawn again in the builder is the section the page drew\n")
  {
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main>{% sections 'footer-group' %}{% sections 'overlay-group' %}</body></html>`),
      "sections/s.storelib": section("s", `<b>{{ section.index }}/{{ section.location }}</b>{% if section.index == 1 %}<h1>first</h1>{% endif %}`),
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}`, slots: ["overlay-group"] })
    const list: StoredSection[] = [
      { id: "ann", type: "s", group: "header" }, { id: "hdr", type: "s", group: "header" },
      { id: "off", type: "s", hidden: true }, { id: "hero", type: "s" }, { id: "grid", type: "s" },
      { id: "foot", type: "s", group: "footer" },
      { id: "bar", type: "s", group: "overlay", slot: "overlay-group" }, { id: "pop", type: "s", group: "overlay", slot: "overlay-group" },
    ]
    const page = { template: "index", path: "/", designMode: true, products: [], collections: [], menus: {}, shop: { name: "S" } }
    const html = drawPage(theme, page, list, { scripts: false }).html
    const ctx = pageContextFor(theme, page, list)
    const differ: string[] = []
    for (const s of list.filter((x) => !x.hidden)) {
      const onPage = html.match(new RegExp(`<div id="shopify-section-${s.id}"[\\s\\S]*?</div>`))?.[0] ?? ""
      const group = s.group === "header" || s.group === "footer" ? s.group : undefined
      const again = drawSection(theme, ctx, s, sectionIndexIn(list, s), group).html
      if (onPage !== again) differ.push(`${s.id}: ${onPage} | ${again}`)
    }
    check("every section, drawn again for a change, is the markup the page drew", differ.length === 0 && /<h1>first<\/h1>/.test(html), differ)
    check("  the page's first section is section 1 (after two in the header), the header's second is 2, the overlay's second is 2", sectionIndexIn(list, list[3]) === 0 && sectionIndexIn(list, list[1]) === 1 && sectionIndexIn(list, list[7]) === 1)
  }

  console.log("\nPictures\n")
  {
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{{ content_for_layout }}</body></html>`),
      "sections/pic.storelib": section("pic", `<i data-a="{{ section.settings.src | image_url: width: 720 }}" data-b="{{ section.settings.src | image_url: width: 165 }}" data-c="{{ 'https://img.test/x.png' | image_url: width: 400 }}"></i>{{ section.settings.src | image_url: width: 1200 | image_tag: widths: '360, 720' }}{{ section.settings.src | image_tag: loading: 'eager' }}`, [{ type: "text", id: "src" }]),
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
    const ctx = theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "S" } })
    const own = "https://storelib.com/media/product-images/u/shirt.jpg"
    const first = theme.renderSection(ctx, { id: "a", type: "pic", settings: { src: own }, hidden: false, blocks: [] }, 0).html
    const fifth = theme.renderSection(ctx, { id: "b", type: "pic", settings: { src: "https://abc.supabase.co/storage/v1/object/public/x/y.jpg" }, hidden: false, blocks: [] }, 4).html
    const enc = encodeURIComponent(own).replace(/%/g, "%")
    check("Storelib's own upload is resized, at the width asked for (720: the 750 file, not 1920)", first.includes(`data-a="/_next/image?url=${enc}&amp;w=750&amp;q=75"`) || first.includes(`data-a="/_next/image?url=${enc}&w=750&q=75"`), first.slice(0, 400))
    check("  a small one small (165: the 256 file)", /data-b="\/_next\/image\?url=[^"]*?(&amp;|&)w=256(&amp;|&)q=75"/.test(first), first.slice(0, 400))
    check("  a picture from a host the optimizer does not fetch goes as it is", first.includes('data-c="https://img.test/x.png"'))
    check("  a srcset's widths are those widths", /srcset="[^"]*w=384[^"]* 360w, [^"]*w=750[^"]* 720w"/.test(first), first)
    check("image_tag in the page's first section is not lazy", !/<img [^>]*loading="lazy"/.test(first), first)
    check("  in the fifth it is", /<img [^>]*w=1200[^>]*loading="lazy"/.test(fifth), fifth)
    check("  and what the theme says wins", /<img [^>]*loading="eager"/.test(fifth) && !/loading="eager"[^>]*loading="lazy"/.test(fifth), fifth)
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
