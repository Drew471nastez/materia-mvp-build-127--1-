/**
 * Round 12, the website builder (scripts/check-wb-ux-r12.mjs measures the same in a browser):
 *
 *   Add a block between two blocks, in the canvas (lib/website-builder/block-gaps.ts)
 *   A menu link marked "Open in a new tab" opens one on the live site (lib/website-builder/new-tab.ts)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { blockGaps, gapAt, insertIndexFor, sameGap, type BlockBox } from "../lib/website-builder/block-gaps"
import { newTabLink, withNewTabAnchors } from "../lib/website-builder/new-tab"
import { linkObject } from "../lib/storelib-theme/compat/objects"
import { headerMenuBlocks } from "../lib/website-builder/header-settings"
import { cleanMenus } from "../lib/storelib-theme/values"
import { fakeDb } from "./_fake-db"
import { shopCatalogue, toCard } from "../lib/website-builder/shop-products"
import { catalogPage, moneyCents, parseCatalogQuery } from "../lib/products/catalog-filters"
import { facet } from "../lib/storelib-theme/compat/facets"
import { productObject } from "../lib/storelib-theme/compat/objects"
import { descriptionMarkup, productDescriptions, withDescriptions } from "../lib/website-builder/product-descriptions"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, got?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const box = (id: string, top: number, bottom: number, left = 0, right = 600, parent: string[] = []): BlockBox => ({ id, parent, top, bottom, left, right })

console.log("\nAdd a block between two blocks")
{
  const stacked = [box("a", 0, 40), box("b", 60, 100), box("c", 120, 160)]
  const gaps = blockGaps(stacked)
  check("two places between three stacked blocks", gaps.length === 2, gaps)
  check("each in the middle of the space between", gaps[0].y === 50 && gaps[1].y === 110)
  check("a new block goes in before the one below the line", gaps[0].before === "b" && gaps[0].after === "a")
  const row = [box("a", 0, 40, 0, 290), box("b", 0, 40, 310, 600)]
  check("blocks side by side have no line between them", blockGaps(row).length === 0)
  const wrapped = [box("p1", 0, 100, 0, 290), box("p2", 0, 100, 310, 600), box("p3", 120, 220, 0, 290)]
  const w = blockGaps(wrapped)
  check("a grid that wraps: one place between its rows, across both", w.length === 1 && w[0].before === "p3" && w[0].left === 0 && w[0].width === 600, w)
  const nested = [box("g", 0, 300), box("x", 10, 40, 0, 600, ["g"]), box("y", 60, 90, 0, 600, ["g"]), box("h", 320, 360)]
  const n = blockGaps(nested)
  check("blocks inside a block are a level of their own", n.some((g) => g.parent.join("/") === "g" && g.before === "y") && n.some((g) => g.parent.length === 0 && g.before === "h"), n)
  check("a block that draws nothing is not a neighbour", blockGaps([box("a", 0, 40), box("hidden", 40, 40), box("b", 60, 100)]).map((g) => `${g.after}>${g.before}`).join() === "a>b")
  check("the pointer within 8px of the line finds it", gapAt(gaps, 300, 56)?.before === "b")
  check("further away it does not", gapAt(gaps, 300, 62) === null)
  check("outside the band's width it does not", gapAt(gaps, 700, 50) === null)
  check("the place shown holds a little further, so it never blinks", gapAt(gaps, 300, 61, 8, gaps[0])?.before === "b")
  check("two places are the same by their neighbours", sameGap(gaps[0], { ...gaps[0], y: 51 }) && !sameGap(gaps[0], gaps[1]))
  const sibs = [{ id: "s1" }, { id: "a" }, { id: "b" }, { id: "c" }]
  check("its index among the stored blocks is the block below's", insertIndexFor(sibs, { before: "b", after: "a" }) === 2)
  check("after the block above when the one below is not stored", insertIndexFor(sibs, { before: "virtual", after: "c" }) === 4)
  check("nowhere when neither is", insertIndexFor(sibs, { before: "x", after: "y" }) === null)
}

console.log("\nThe canvas and the imported theme's frame offer it")
{
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  const strip = read("components/website-builder/editor/canvas-block-insert.tsx")
  const bridge = read("lib/storelib-theme/compat/canvas-bridge.ts")
  const compat = read("components/website-builder/compat/compat-canvas.tsx")
  check("the editor mounts the strip over a Storelib canvas", /<CanvasBlockInserter rootId="wb-preview-root"/.test(page))
  check("it opens the block library through the editor's provider", /<BlockPickerHandle handle=\{blockPickerRef\} \/>/.test(page) && /blockPickerRef\.current\(\{ anchor, options: level\.options, choices, section, parent: place\.parent, index, reasonFor, onAdd \}\)/.test(page))
  check("only where the section takes another block (max_blocks)", /owner\.max_blocks && siblings\.filter\(\(b\) => !b\.static\)\.length >= owner\.max_blocks\) return null/.test(page))
  check("the header's links are not a place", /section\.type === "header" \|\| parent\.length >= MAX_BLOCK_DEPTH\) return null/.test(page))
  check("a mouse only", /e\.pointerType !== "mouse"/.test(strip))
  check("it moves with opacity, scale and rotate, named", /transition-\[opacity,rotate,scale\]/.test(strip) && /transition-\[opacity,scale\]/.test(strip))
  check("not a .group (the touch rule turns a group's transitions off)", !/className=\{`group /.test(strip))
  check("a real button, with a name", /type="button"\s+aria-label=\{tt\("Add a block here"\)\}/.test(strip))
  check("the frame finds the places between blocks", /var blockGapAt = function \(x, y\)/.test(bridge) && /type: "add-block"/.test(bridge))
  check("and is told which levels take a block", /if \("levels" in m\)/.test(bridge) && /levels: props\.blockLevels \?\? null/.test(compat))
  check("the editor hears the frame's press", /m\.type === "add-block" && inspecting\.current && isFront/.test(compat) && /onAddBlockAt=\{addBlockFromFrame\}/.test(page))
}

console.log("\nA menu link that opens in a new tab")
{
  check("a marked link: the address without the mark, and a target", JSON.stringify(newTabLink("/about#_blank")) === JSON.stringify({ href: "/about", target: "_blank", rel: "noopener noreferrer" }))
  check("a link's own switch, without the mark", newTabLink("https://x.com", true).target === "_blank")
  check("an unmarked link is left alone", JSON.stringify(newTabLink("/shop")) === JSON.stringify({ href: "/shop" }))
  const html = `<nav><a class="a" href="/about#_blank">About</a><a href='https://x.com/y#_blank' data-x>X</a><a href="/shop">Shop</a><a href="/c#_blank" target="_self">C</a></nav>`
  const out = withNewTabAnchors(html)
  const tag = (text: string) => out.match(new RegExp(`<a[^>]*>${text}</a>`))?.[0] ?? ""
  const isNewTab = (t: string, href: string) => t.includes(`href="${href}"`) || t.includes(`href='${href}'`) ? /target="_blank"/.test(t) && /rel="[^"]*noopener[^"]*noreferrer[^"]*"/.test(t) && !t.includes("#_blank") : false
  check("an imported theme's page: every marked <a> opens a new tab, safely", isNewTab(tag("About"), "/about") && isNewTab(tag("X"), "https://x.com/y"), out)
  check("an unmarked link is untouched; the switch wins over a target the theme wrote", tag("Shop") === `<a href="/shop">` + "Shop</a>" && isNewTab(tag("C"), "/c") && !/_self/.test(tag("C")), out)
  check("markup with no mark is returned as it was", withNewTabAnchors("<a href=\"/x\">x</a>") === "<a href=\"/x\">x</a>")
  check("a mark in the text is not a link", withNewTabAnchors("<p>#_blank</p>") === "<p>#_blank</p>")

  const menus = cleanMenus({ "main-menu": { title: "Main", links: [{ title: "Blog", url: "https://blog.example.com#_blank", links: [{ title: "Help", url: "/help#_blank" }] }] } })
  check("the store's menus keep the mark when saved", menus["main-menu"].links[0].url === "https://blog.example.com#_blank" && menus["main-menu"].links[0].links?.[0].url === "/help#_blank")
  const blocks = headerMenuBlocks("main-menu", menus) ?? []
  check("the header is handed the menu's links, each set to open in a new tab, the address without the mark", blocks.length === 2 && blocks[1].settings.url === "/help" && blocks[1].settings.open_in_new_tab === true && blocks[0].settings.open_in_new_tab === true)
  const linked = linkObject({ title: "Help", url: "/help#_blank" }, "/help")
  check("an imported theme's link keeps the mark in url (drawn as a target) and is still the page it names", linked.url === "/help#_blank" && linked.active === true, linked)

  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  check("the header draws a marked menu link with its target, in the row, the dropdown and the phone menu", /const opensInNew = \(block/.test(header) && /const openInNew = opensInNew\(block\)/.test(header) && /const childOpenInNew = opensInNew\(child\)/.test(header) && /openInNew: opensInNew\(b\)/.test(header) && /openInNew: opensInNew\(c\)/.test(header))
  check("and without the mark in its address", /return withoutNewTab\(url\) \|\| "#"/.test(header))
  check("the phone menu leaves a new tab link to the browser instead of opening the page here", /handleLinkClick = \(href: string, openInNew = false\)/.test(header) && /openInNew \|\| e\.metaKey/.test(header) && /handleLinkClick\(item\.href, item\.openInNew\)/.test(header) && /handleLinkClick\(child\.href, child\.openInNew\)/.test(header))
  check("the header's buttons (the phone menu's and the bar's), the footer's links", /\{\.\.\.newTabLink\(cta\.url\)\}/.test(header) && /\{\.\.\.newTabLink\(str\(s\.cta_url, "#"\)\)\}/.test(header) && (read("components/website-builder/sections/renderers/FooterSection.tsx").match(/\{\.\.\.newTabLink\(/g) ?? []).length >= 2)
  check("an imported theme's page is drawn with them, live and in the canvas", (read("lib/storelib-theme/compat/page.ts").match(/withNewTabAnchors\(withoutVendorTraces/g) ?? []).length >= 2)
}

/* ── The shop's filters, from a real shop's rows ─────────────────────────── */

interface Fixture { creatorId: string; tables: Record<string, Record<string, any>[]> }
const fixture = JSON.parse(read("tests/fixtures/storelib-shop-r12.json")) as Fixture

/**
 * What a filter should leave, worked out from the rows themselves, without
 * the code under test: published, the creator's, on the Online store; a
 * variant in stock when its count at a location that ships orders is above
 * zero, or it keeps selling, or it is not counted; a product with options
 * passes when one of its live options passes the price, the stock and every
 * option ticked at once.
 */
function expected(q: { min?: number; max?: number; available?: boolean; size?: string[]; type?: string[]; vendor?: string[]; tag?: string[]; category?: string[] }): string[] {
  const t = fixture.tables
  const off = new Set(t.product_channel_listings.filter((l) => l.listed === false && l["sales_channels.kind"] === "storefront").map((l) => l.product_id))
  const ships = new Set(t.inventory_locations.filter((l) => l.active && l.fulfills_orders && l.creator_id === fixture.creatorId).map((l) => l.id))
  const held = (vid: string) => t.inventory_levels.filter((l) => l.variant_id === vid && ships.has(l.location_id)).reduce((n, l) => n + Math.max(0, l.available), 0)
  const out: string[] = []
  for (const p of t.products) {
    if (p.creator_id !== fixture.creatorId || p.status !== "published" || off.has(p.id)) continue
    if (q.type?.length && !q.type.includes(p.type)) continue
    if (q.vendor?.length && !q.vendor.includes(p.vendor)) continue
    if (q.category?.length && !q.category.includes(p.category)) continue
    if (q.tag?.length && !(p.tags ?? []).some((x: string) => q.tag!.includes(x))) continue
    const live = t.product_variants.filter((v) => v.product_id === p.id && v.active !== false && !/^Archived /.test(v.name))
    const sizeAt = t.product_options.filter((o) => o.product_id === p.id).sort((a, b) => a.position - b.position).findIndex((o) => o.name === "Size")
    const priceOk = (c: number) => (q.min === undefined || c >= q.min * 100) && (q.max === undefined || c <= q.max * 100)
    if (live.length) {
      const ok = live.some((v) => {
        const inStock = p.type !== "physical" || !v.track_inventory || v.inventory_policy === "continue" || held(v.id) > 0
        const size = sizeAt >= 0 ? [v.option1, v.option2, v.option3][sizeAt] : null
        return priceOk(v.price_cents) && (!q.available || inStock) && (!q.size?.length || (size !== null && q.size.includes(size)))
      })
      if (ok) out.push(p.id)
    } else {
      const inStock = !(p.track_inventory !== false && typeof p.inventory_count === "number" && p.inventory_count <= 0)
      if (!priceOk(p.price_cents) || (q.available && !inStock) || q.size?.length) continue
      out.push(p.id)
    }
  }
  return out.sort()
}

const titleOf = (id: string) => fixture.tables.products.find((p) => p.id === id)?.title
const names = (ids: string[]) => ids.map(titleOf).sort()

async function filters() {
  console.log("\nThe shop's filters, from a real shop's rows (tests/fixtures/storelib-shop-r12.json)")
  const db = fakeDb(JSON.parse(JSON.stringify(fixture.tables)))
  const cards = await shopCatalogue(db as never, fixture.creatorId)
  check("only the creator's published products on the Online store are listed", JSON.stringify(names(cards.map((c) => c.id))) === JSON.stringify(names(expected({}))), names(cards.map((c) => c.id)))
  check("each card carries its price in the store's currency, tags and brand", cards.every((c) => typeof c.price_cents === "number") && cards.find((c) => c.settings.slug === "linen-shirt")?.settings.vendor === "Atelier Nord" && (cards.find((c) => c.settings.slug === "wool-socks")?.settings.tags ?? []).includes("winter"))
  check("prices are in euros, as the store sells", cards.every((c) => c.settings.currency === "EUR") && /€/.test(String(cards.find((c) => c.settings.slug === "shirt-pattern")?.settings.price)))

  const cases: [string, string, Parameters<typeof expected>[0]][] = [
    ["nothing ticked: every product", "", {}],
    ["in stock: a sold out tote and a sold out belt go, preorders and uncounted socks stay", "available=1", { available: true }],
    ["size M: every product that has an M", "opt.size=M", { size: ["M"] }],
    ["size M and in stock: only where M itself is in stock (or keeps selling)", "opt.size=M&available=1", { size: ["M"], available: true }],
    ["50 to 80 euros: by the price of each option (the shirt's L is 54)", "price_min=50&price_max=80", { min: 50, max: 80 }],
    ["up to 10 euros: the 9,99 pattern only", "price_max=10", { max: 10 }],
    ["brand Atelier Nord", "vendor=Atelier%20Nord", { vendor: ["Atelier Nord"] }],
    ["tag winter", "tag=winter", { tag: ["winter"] }],
    ["category Shirts", "category=Shirts", { category: ["Shirts"] }],
    ["digital downloads", "type=digital", { type: ["digital"] }],
    ["brand Bergen & Co, in stock", "vendor=Bergen%20%26%20Co&available=1", { vendor: ["Bergen & Co"], available: true }],
    ["shirts in L, in stock, 50 to 60 euros", "category=Shirts&opt.size=L&available=1&price_min=50&price_max=60", { category: ["Shirts"], size: ["L"], available: true, min: 50, max: 60 }],
  ]
  for (const [label, qs, q] of cases) {
    const { listed, filters } = catalogPage(cards, new URLSearchParams(qs), "/products")
    const got = listed.map((c) => c.id).sort()
    const want = expected(q)
    check(`${label} (${want.length})`, JSON.stringify(got) === JSON.stringify(want) && filters.count === want.length, { got: names(got), want: names(want) })
  }

  /* Every count beside a value is what ticking it would leave. */
  const asked = new URLSearchParams("available=1")
  const page = catalogPage(cards, asked, "/products")
  let wrong: unknown[] = []
  for (const g of page.filters.groups) {
    for (const v of g.values) {
      const qs = new URLSearchParams(asked)
      if (g.param !== "available") qs.append(g.param, v.value)
      const left = catalogPage(cards, qs, "/products").filters.count
      if (left !== v.count) wrong.push({ group: g.param, value: v.value, count: v.count, left })
    }
  }
  check("with In stock ticked, every value's count is what ticking it leaves", wrong.length === 0 && page.filters.groups.length >= 5, wrong)
  const sizes = page.filters.groups.find((g) => g.param === "opt.size")
  check("Size M counts the products whose own M is in stock (2 of 4 that have one, plus the preorder)", sizes?.values.find((v) => v.value === "M")?.count === 3, sizes?.values)
  const groups = page.filters.groups.map((g) => g.param)
  check("the filters offered: in stock, type, category, brand, tags, size, colour", ["available", "type", "category", "vendor", "tag", "opt.size", "opt.colour"].every((p) => groups.includes(p)), groups)
  check("the price range runs from the cheapest option to the dearest, in whole euros", page.filters.price.min === "9" && page.filters.price.max === "199", page.filters.price)
  const chips = catalogPage(cards, new URLSearchParams("vendor=Atelier%20Nord&tag=linen"), "/products").filters.chips
  check("a ticked brand and tag are chips that untick them", chips.some((c) => c.label === "Atelier Nord" && c.url === "/products?tag=linen") && chips.some((c) => c.label === "linen" && c.url === "/products?vendor=Atelier+Nord"), chips)
  check("the address round trips", parseCatalogQuery(new URLSearchParams("category=Shirts&vendor=A&tag=b&tag=c")).tags.join() === "b,c")

  /* The money any store prints. */
  check("money read back in any currency's way of writing it", moneyCents("$48.00") === 4800 && moneyCents("€0.89") === 89 && moneyCents("48,00 €") === 4800 && moneyCents("1.234,56 kr") === 123456 && moneyCents("¥1,200") === 120000 && moneyCents("$9.00/month") === 900 && moneyCents("CHF 1'250.50") === 125050 && moneyCents("") === 0)

  /* An imported theme's filters, from the same cards. */
  const faceted = facet(cards as never, new URLSearchParams("filter.v.price.gte=50&filter.v.price.lte=80&filter.p.vendor=Atelier%20Nord"), "/collections/all")
  check("an imported theme's price range in euros and its brand filter", JSON.stringify(faceted.products.map((p) => p.id).sort()) === JSON.stringify(expected({ min: 50, max: 80, vendor: ["Atelier Nord"] })), names(faceted.products.map((p) => p.id)))
  const facetParams = faceted.filters.map((f) => f.param_name)
  check("and its Vendor and Tags lists", facetParams.includes("filter.p.vendor") && facetParams.includes("filter.p.tag"), facetParams)
}

async function descriptions() {
  console.log("\nA product's description wherever a section shows the product")
  const db = fakeDb(JSON.parse(JSON.stringify(fixture.tables)))
  const cards = await shopCatalogue(db as never, fixture.creatorId)
  const byKey = await productDescriptions(db as never, fixture.creatorId, { ids: cards.map((c) => c.id), slugs: ["linen-shirt"] })
  const described = withDescriptions(cards, byKey)
  check("each card gets its product's description from Products", described.find((c) => c.settings.slug === "oxford-shirt")?.settings.description_html === "<p>Oxford shirt description.</p>", described.find((c) => c.settings.slug === "oxford-shirt")?.settings)
  check("a draft product's description is never read", !Object.values(byKey).some((h) => /Unreleased/.test(h)))
  check("an edit in Products is what is read next", await (async () => {
    fixture.tables.products.find((p) => p.slug === "oxford-shirt")!.description = "<p>Now <strong>brushed</strong> cotton.</p><script>alert(1)</script>"
    const again = await productDescriptions(fakeDb(JSON.parse(JSON.stringify(fixture.tables))) as never, fixture.creatorId, { slugs: ["oxford-shirt"] })
    const html = Object.values(again)[0] ?? ""
    return /brushed/.test(html) && !/script/i.test(html)
  })())
  check("plain words become paragraphs, markup is cleaned", descriptionMarkup("One\n\nTwo") === "<p>One</p><p>Two</p>" && !/onerror/.test(descriptionMarkup('<p>Hi</p><img src="x" onerror="alert(1)">')), descriptionMarkup("One\n\nTwo"))
  const card = described.find((c) => c.settings.slug === "linen-shirt")!
  check("an imported theme's product.description is that description", productObject(card as never).description === "<p>Linen shirt description.</p>")
  const spot = read("themes/default/sections/product_spotlight.storelib")
  const hero = read("themes/default/sections/hero_product.storelib")
  check("Product spotlight and Product hero show it unless words were typed", /\{% elsif settings\.button_url\.description_html %\}/.test(spot) && /\{% elsif settings\.button_url\.description_html %\}/.test(hero) && /"default": ""/.test(spot.slice(spot.indexOf('"id": "subheading"'), spot.indexOf('"id": "subheading"') + 300)))
  check("and say so under the field", /Leave empty to show the product's description from Products/.test(spot) && /Leave empty to show the product's description from Products/.test(hero))
  check("the product page's Description block says where its words come from", /"from_products"/.test(read("themes/default/sections/product.json")))
  check("a published page reads the picked products' descriptions with the shop", /withDescriptions\(mergeCatalog\(products, picked\), descriptions\)/.test(read("lib/website-builder/published-site.ts")) && /cardsWithDescriptions/.test(read("lib/website-builder/compat-site.ts")))
  void toCard
}

async function main() {
  await filters()
  await descriptions()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
void main()
