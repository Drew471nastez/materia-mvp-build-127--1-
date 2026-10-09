/**
 * Products come from the store: the section checker refuses typed products,
 * prices and product arrays, and the built-in product sections read the
 * catalogue through products, product_picker, product_list and collections.
 */
import { checkSectionIntegration } from "@/lib/storelib-ai/integration"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { catalogPage } from "@/lib/products/catalog-filters"
import { shopProducts } from "@/lib/website-builder/shop-products"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`)
  }
}
const productFindings = (src: string) => checkSectionIntegration(src).filter((x) => x.id === "integration-products")

console.log("\nEvery built-in section passes the products check\n")
{
  const refused = Object.entries(DEFAULT_THEME_SOURCES as Record<string, string>)
    .filter(([p]) => p.endsWith(".storelib"))
    .map(([p, src]) => [p, productFindings(src).map((f) => f.message.slice(0, 80))] as const)
    .filter(([, f]) => f.length > 0)
  check("no built-in section is refused for its products", refused.length === 0, refused)
}

console.log("\nA section that types its products in is sent back\n")
{
  const wrap = (template: string, schema: Record<string, unknown>, script = "") =>
    `<template>\n${template}\n</template>\n${script ? `<script>\n${script}\n</script>\n` : ""}<schema>\n${JSON.stringify(schema)}\n</schema>\n`
  const base = { type: "shop_row", name: "Shop row", category: "products", settings: [{ type: "text", id: "heading", label: "Heading", default: "Shop" }] }
  const blind = wrap(`<section><h2>{{ settings.heading }}</h2></section>`, base)
  check("a products section that never reads the store is refused", productFindings(blind).some((f) => /never reads the store/.test(f.message)))
  const typed = wrap(`<section>{% for block in products %}<p>{{ block.settings.title }}</p>{% endfor %}<p>$29</p></section>`, base)
  check("a price typed into the markup is refused", productFindings(typed).some((f) => /\$29/.test(f.message)))
  const fake = wrap(`<section>{% for block in blocks %}<p>{{ block.settings.title }}</p>{% endfor %}</section>`, {
    ...base,
    blocks: [{ type: "product", name: "Product", settings: [{ type: "product_picker", id: "product", label: "Product" }, { type: "text", id: "price", label: "Price", default: "$48" }] }],
    presets: [{ name: "Shop row", blocks: [{ type: "product", settings: { title: "Tote", price: "$48" } }] }],
  })
  check("an invented price as a block default is refused", productFindings(fake).some((f) => /defaults to "\$48"/.test(f.message)))
  check("a preset of invented products is refused", productFindings(fake).some((f) => /preset fills/.test(f.message)))
  const scripted = wrap(`<section>{% for block in products %}<p>{{ block.settings.title }}</p>{% endfor %}</section>`, base, `const items = [{ title: "A", price: 10 }, { title: "B", price: 12 }]`)
  check("a product array in the script is refused", productFindings(scripted).some((f) => /list of products of its own/.test(f.message)))
  const good = wrap(`<section>{% for block in products %}<a href="{{ block.settings.checkout_url | url }}">{{ block.settings.title }} {{ block.settings.price }}</a>{% endfor %}</section>`, base)
  check("a section that loops the store's products passes", productFindings(good).length === 0, productFindings(good))
  const plans = wrap(`<section>{% for block in blocks %}<p>{{ block.settings.price }}</p>{% endfor %}</section>`, { type: "plans", name: "Plans", category: "pricing", settings: [], blocks: [{ type: "tier", name: "Tier", settings: [{ type: "text", id: "price", label: "Price", default: "$19" }] }] })
  check("a pricing table's typed tiers are the creator's own, and pass", productFindings(plans).length === 0, productFindings(plans))
}

console.log("\nCards read the product they are set to\n")
{
  const catalog = [{ id: "p1", type: "product", settings: { url: "/products/tote", title: "Waxed tote", price: "$52.00", compare_price: "$60.00", image: "https://cdn.example/tote.jpg", checkout_url: "/checkout?productId=p1" } }]
  for (const type of ["product_grid", "product_featured"]) {
    const r = renderStorelibSection(
      { id: "s", type, name: type, settings: { source: "picked", show_price: true }, blocks: [{ id: "b1", type: "product", settings: { url: "/products/tote" } }, { id: "b2", type: "product", settings: { url: "/products/tote", title: "My own name", price: "$40" } }] } as unknown as SectionInstance,
      {} as ThemeSettingsValues,
      { template: "index" },
      undefined,
      [],
      { catalog } as never,
    )
    const html = r.ok === true ? r.html : ""
    check(`${type}: a card shows the chosen product's name, price, old price and photo`, html.includes("Waxed tote") && html.includes("$52.00") && html.includes("$60.00") && html.includes("cdn.example/tote.jpg"), html.slice(0, 400))
    check(`${type}: a name and price typed on the card override the product's`, html.includes("My own name") && html.includes("$40"))
    check(`${type}: no invented product is drawn`, !/Everyday tote|Linen apron|Product name/.test(html))
    const src = (DEFAULT_THEME_SOURCES as Record<string, string>)[`sections/${type}.storelib`]
    check(`${type}: new sections start from the shop, with no typed products`, /"source": "shop"/.test(src.slice(src.indexOf('"presets"'))) && !/Everyday tote/.test(src))
  }
}
console.log("\nA picker can mean this page's product or collection, and reads a Shopify handle\n")
{
  const catalog = [{ id: "p1", type: "product", settings: { url: "/products/waxed-tote", slug: "waxed-tote", title: "Waxed tote", price: "$52.00", checkout_url: "/checkout?productId=p1" } }]
  const summer = { id: "c1", title: "Summer", handle: "summer", description: "", image: "", url: "/collections/summer", products_count: 1, products: catalog }
  const draw = (type: string, settings: Record<string, unknown>, data: Record<string, unknown>, template = "index") => {
    const r = renderStorelibSection({ id: "s", type, name: type, settings, blocks: [] } as unknown as SectionInstance, {} as ThemeSettingsValues, { template }, undefined, [], data as never)
    return r.ok === true ? r.html : ""
  }
  const onProduct = draw("hero_product", { button_url: "@current", button_text: "Buy" }, { catalog, product: { id: "p1", title: "Waxed tote", url: "/products/waxed-tote" } }, "product")
  check("on a product page, a product picker set to the current product draws it, with its checkout", onProduct.includes("Waxed tote") && onProduct.includes("$52.00") && /checkout\?productId=p1/.test(onProduct), onProduct.slice(0, 300))
  const elsewhere = draw("hero_product", { button_url: "@current", button_text: "Buy" }, { catalog })
  check("on a page with no product, the current product is empty, never another product", !elsewhere.includes("Waxed tote"))
  const byHandle = draw("hero_product", { button_url: "waxed-tote", button_text: "Buy" }, { catalog })
  check("a bare handle, as an imported Shopify theme stores it, names the product", byHandle.includes("Waxed tote") && /checkout\?productId=p1/.test(byHandle))
  const grid = (DEFAULT_THEME_SOURCES as Record<string, string>)["sections/product_grid.storelib"]
  check("product_grid can show a collection", /settings\.source == 'collection'/.test(grid))
  const col = draw("product_grid", { source: "collection", collection: "summer", show_price: true }, { catalog, collections: { c1: summer } })
  check("a collection picker reads a handle as well as an id", col.includes("Waxed tote"), col.slice(0, 300))
  const cur = draw("product_grid", { source: "collection", collection: "@current", show_price: true }, { catalog, collections: { c1: summer }, collection: summer }, "collection")
  check("on a collection page, a collection picker set to the current collection draws it", cur.includes("Waxed tote"), cur.slice(0, 300))
}

console.log("\nA long shop comes in pages\n")
{
  const cards = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, type: "product", settings: { title: `Item ${i + 1}`, price: "$10.00", price_cents: 1000, url: `/products/item-${i + 1}`, available: true, kind: "physical", options: [] } }))
  const first = catalogPage(cards as never, {}, "/products")
  check("the first page is 24 products, of 3 pages", first.listed.length === 24 && first.pagination.pages === 3 && first.pagination.page === 1, first.pagination)
  check("  with a next page and no previous", first.pagination.next_url === "/products?page=2" && first.pagination.prev_url === "")
  const last = catalogPage(cards as never, { page: "3", sort: "title-asc" }, "/products")
  check("the last page holds the rest, and its links keep the sort", last.listed.length === 12 && /sort=title-asc/.test(last.pagination.prev_url) && last.pagination.next_url === "", last.pagination)
  check("a page past the end is the last page, never an empty one", catalogPage(cards as never, { page: "99" }, "/products").pagination.page === 3)
  check("nonsense is page 1", catalogPage(cards as never, { page: "x" }, "/products").pagination.page === 1)
  check("a shop that fits is one page", catalogPage(cards.slice(0, 5) as never, {}, "/products").pagination.pages === 1)
  const r = renderStorelibSection({ id: "s", type: "product_grid", name: "g", settings: { source: "shop" }, blocks: [] } as unknown as SectionInstance, {} as ThemeSettingsValues, { template: "page.products", pagination: first.pagination } as never, undefined, first.listed as never, {} as never)
  const html = r.ok === true ? r.html : ""
  check("the shop's grid draws the page links", /class="pager"/.test(html) && /href="\/products\?page=2"/.test(html) && /aria-current="page">1</.test(html), html.slice(-600))
  const one = renderStorelibSection({ id: "s", type: "product_grid", name: "g", settings: { source: "shop" }, blocks: [] } as unknown as SectionInstance, {} as ThemeSettingsValues, { template: "index" } as never, undefined, first.listed.slice(0, 4) as never, {} as never)
  check("  and none on a page that is not paged", one.ok === true && !/class="pager"/.test(one.html))
}

console.log("\nA shipped product's cards say which options are sold out\n")
await (async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    products: [
      { id: "tote", title: "Tote", slug: "tote", price_cents: 4800, compare_at_cents: null, thumbnail_url: null, status: "published", type: "physical", creator_id: "c1", inventory_count: null, track_inventory: true, continue_selling: false, created_at: "2026-10-01" },
      { id: "cap", title: "Cap", slug: "cap", price_cents: 2000, compare_at_cents: null, thumbnail_url: null, status: "published", type: "physical", creator_id: "c1", inventory_count: null, track_inventory: true, continue_selling: false, created_at: "2026-09-01" },
    ],
    product_variants: [
      { id: "tote-s", product_id: "tote", name: "Small", price_cents: 4800, position: 1, active: true, track_inventory: true, inventory_policy: "deny" },
      { id: "tote-l", product_id: "tote", name: "Large", price_cents: 4800, position: 2, active: true, track_inventory: true, inventory_policy: "deny" },
      { id: "cap-1", product_id: "cap", name: "One size", price_cents: 2000, position: 1, active: true, track_inventory: true, inventory_policy: "deny" },
    ],
    product_options: [],
    inventory_locations: [{ id: "loc", creator_id: "c1", active: true, fulfills_orders: true }],
    inventory_levels: [
      { variant_id: "tote-s", location_id: "loc", available: 3 },
      { variant_id: "tote-l", location_id: "loc", available: 0 },
      { variant_id: "cap-1", location_id: "loc", available: 0 },
    ],
  }
  const db = {
    from(table: string) {
      const filters: ((r: Record<string, unknown>) => boolean)[] = []
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
        order: () => q,
        limit: () => q,
        then: (res: (v: unknown) => unknown) => res({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
      }
      return q
    },
  }
  const cards = await shopProducts(db as never, "c1")
  const tote = cards.find((c) => c.id === "tote")
  const cap = cards.find((c) => c.id === "cap")
  check("an option with stock can be bought, with its own checkout", tote?.settings.variants.find((v) => v.id === "tote-s")?.available === true && /tote-s/.test(tote?.settings.variants.find((v) => v.id === "tote-s")?.checkout_url ?? ""), tote?.settings.variants)
  check("an option sold out at every location says so, and has no checkout", tote?.settings.variants.find((v) => v.id === "tote-l")?.available === false && tote?.settings.variants.find((v) => v.id === "tote-l")?.checkout_url === "")
  check("a product with one option left is still for sale", tote?.settings.available === true && tote?.settings.tag !== "Sold out")
  check("a product sold out in every option is Sold out, with no checkout", cap?.settings.available === false && cap?.settings.tag === "Sold out" && cap?.settings.checkout_url === "", cap?.settings)
})()

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
