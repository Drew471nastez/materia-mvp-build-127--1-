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
import { cleanCustomFields, fieldKey } from "@/lib/products/custom-fields"
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
  /* Round 21: placeholder product cards (a typed name and an uploaded picture) are refused, wherever the section is filed. */
  const looks = wrap(`<section>{% for block in blocks %}<img src="{{ block.settings.image }}"><p>{{ block.settings.title }}</p>{% endfor %}</section>`, {
    type: "best_sellers", name: "Best sellers", category: "featured", settings: [],
    blocks: [{ type: "card", name: "Card", settings: [{ type: "image_picker", id: "image", label: "Image" }, { type: "text", id: "title", label: "Title" }] }],
  })
  check("a section named for products whose cards are typed names and pictures is refused", productFindings(looks).some((f) => /never reads the store/.test(f.message)), productFindings(looks))
  const handBlock = wrap(`<section>{% for block in blocks %}<p>{{ block.settings.name }}</p>{% endfor %}</section>`, {
    type: "highlights", name: "Highlights", category: "content", settings: [],
    blocks: [{ type: "product", name: "Product", settings: [{ type: "text", id: "name", label: "Product name" }, { type: "image_picker", id: "photo", label: "Photo" }] }],
  })
  check("a product block with a typed name and no product_picker is refused", productFindings(handBlock).some((f) => /placeholder/.test(f.message)), productFindings(handBlock))
  const picked = wrap(`<section>{% for block in blocks %}<a href="{{ block.settings.product.checkout_url | url }}">{{ block.settings.product.title }}</a>{% endfor %}</section>`, {
    type: "highlights", name: "Highlights", category: "content", settings: [],
    blocks: [{ type: "product", name: "Product", settings: [{ type: "product_picker", id: "product", label: "Product" }, { type: "text", id: "title", label: "Name (optional)" }] }],
  })
  check("a product block that holds a product_picker (with an optional name over it) passes", productFindings(picked).length === 0, productFindings(picked))
  const locator = wrap(`<section>{% for block in blocks %}<img src="{{ block.settings.image }}"><p>{{ block.settings.title }}</p>{% endfor %}</section>`, {
    type: "store_locator", name: "Store locator", category: "content", settings: [],
    blocks: [{ type: "place", name: "Place", settings: [{ type: "image_picker", id: "image", label: "Image" }, { type: "text", id: "title", label: "Title" }] }],
  })
  check("a store locator's place cards are not products, and pass", productFindings(locator).length === 0, productFindings(locator))
  const team = wrap(`<section>{% for block in blocks %}<img src="{{ block.settings.image }}"><p>{{ block.settings.name }}</p>{% endfor %}</section>`, {
    type: "team", name: "Our team", category: "content", settings: [],
    blocks: [{ type: "member", name: "Member", settings: [{ type: "image_picker", id: "image", label: "Photo" }, { type: "text", id: "name", label: "Name" }] }],
  })
  check("a team section's people cards pass", productFindings(team).length === 0, productFindings(team))
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
    /* A card's own words win; its price never does: checkout charges the product's, so the card shows the product's (tests/product-source.test.ts). */
    check(`${type}: a name typed on the card overrides the product's, its price does not`, html.includes("My own name") && !html.includes("$40"))
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
      { id: "tote", title: "Tote", slug: "tote", price_cents: 4800, compare_at_cents: null, thumbnail_url: null, status: "published", type: "physical", creator_id: "c1", inventory_count: null, track_inventory: true, continue_selling: false, created_at: "2026-10-01", custom_fields: { material: "Waxed canvas" } },
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
  check("a shop card carries the product's custom fields", tote?.settings.fields?.material === "Waxed canvas" && JSON.stringify(cap?.settings.fields) === "{}", tote?.settings.fields)
  check("a product sold out in every option is Sold out, with no checkout", cap?.settings.available === false && cap?.settings.tag === "Sold out" && cap?.settings.checkout_url === "", cap?.settings)
})()

console.log("\nCustom fields, by name, on every surface\n")
{
  check("a label becomes the name a template reads", fieldKey("Care instructions") === "care_instructions" && fieldKey("  Länge ") === "lange")
  const clean = cleanCustomFields([{ key: "Material", value: " Waxed  cotton " }, { key: "material", value: "dup" }, { key: "Empty", value: "" }, { key: "constructor", value: "x" }, { key: "Note", value: "<b>bold</b>" }])
  check("cleaned: first of each name kept, empty and unsafe names dropped", JSON.stringify(clean) === JSON.stringify({ material: "Waxed cotton", note: "<b>bold</b>" }), clean)
  check("at most twenty", Object.keys(cleanCustomFields(Array.from({ length: 30 }, (_, i) => ({ key: `f${i}`, value: "v" })))).length === 20)
  const src = `<template>\n<section>{% for block in products %}<p class="m">{{ block.settings.fields.material }}</p>{% endfor %}</section>\n</template>\n<schema>\n{"type":"fields_probe","name":"Probe","settings":[]}\n</schema>\n`
  const r = renderStorelibSection({ id: "s", type: "fields_probe", name: "p", settings: {}, blocks: [] } as unknown as SectionInstance, {} as ThemeSettingsValues, { template: "index" }, { "sections/fields_probe.storelib": src } as never, [{ id: "a", type: "product", settings: { title: "A", fields: { material: "<b>Linen</b>" } } }] as never, {} as never)
  const html = r.ok === true ? r.html : JSON.stringify(r)
  check("a section prints a product's field, escaped", /<p class="m">&lt;b&gt;Linen&lt;\/b&gt;<\/p>/.test(html), html.slice(0, 300))
}

console.log("\nA custom product section keeps every photo through a layout change (round 21)\n")
{
  /*
    The owner: "when the builder draws a section again after a sidebar change, product cards must keep their images; a
    layout-only change must never give back cards with a title and a price but no picture". A section written the way
    Storelib AI writes one (a source select, a collection picker, a product list, columns), drawn before and after a
    layout-only change, from each source: every card has its product's photo, name and price both times.
  */
  const cards = [1, 2, 3].map((n) => ({
    id: `p${n}`,
    type: "product",
    settings: { url: `/products/item-${n}`, slug: `item-${n}`, title: `Item ${n}`, price: `$${n}0.00`, image: `https://cdn.example/item-${n}.jpg`, images: [`https://cdn.example/item-${n}.jpg`], checkout_url: `/checkout?productId=p${n}`, available: true },
  }))
  const summer = { id: "c1", title: "Summer", handle: "summer", description: "", image: "", url: "/collections/summer", products_count: 3, products: cards }
  const source = `<template>
<section class="ai-grid" style="--cols: {{ settings.columns }}; --gap: {{ settings.gap }}px">
  {% if section.settings.source == 'collection' %}{% for block in settings.collection.products limit: settings.product_count %}<a class="card" data-card="{{ block.settings.title }}" href="{{ block.settings.url | url }}"><img src="{{ block.settings.image | asset }}" alt="{{ block.settings.title }}" width="600" height="600"><span class="t">{{ block.settings.title }}</span><span class="p">{{ block.settings.price }}</span></a>{% endfor %}
  {% elsif section.settings.source == 'chosen' %}{% for block in settings.chosen limit: settings.product_count %}<a class="card" data-card="{{ block.settings.title }}" href="{{ block.settings.url | url }}"><img src="{{ block.settings.image | asset }}" alt="{{ block.settings.title }}" width="600" height="600"><span class="t">{{ block.settings.title }}</span><span class="p">{{ block.settings.price }}</span></a>{% endfor %}
  {% else %}{% for block in products limit: settings.product_count %}<a class="card" data-card="{{ block.settings.title }}" href="{{ block.settings.url | url }}"><img src="{{ block.settings.image | asset }}" alt="{{ block.settings.title }}" width="600" height="600"><span class="t">{{ block.settings.title }}</span><span class="p">{{ block.settings.price }}</span></a>{% endfor %}{% endif %}
</section>
</template>
<style>.ai-grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: var(--gap) }</style>
<schema>
${JSON.stringify({
  type: "ai_shop_grid", name: "Shop grid", category: "products",
  settings: [
    { type: "select", id: "source", label: "Products", default: "shop", options: [{ value: "shop", label: "Shop" }, { value: "collection", label: "Collection" }, { value: "chosen", label: "Chosen" }] },
    { type: "collection_picker", id: "collection", label: "Collection", visible_if: "{{ section.settings.source == 'collection' }}" },
    { type: "product_list", id: "chosen", label: "Products", limit: 12, visible_if: "{{ section.settings.source == 'chosen' }}" },
    { type: "range", id: "product_count", label: "Count", min: 1, max: 12, default: 6 },
    { type: "range", id: "columns", label: "Columns", min: 1, max: 5, default: 3 },
    { type: "range", id: "gap", label: "Gap", min: 0, max: 40, default: 16 },
  ],
  presets: [{ name: "Shop grid", settings: { source: "shop" } }],
})}
</schema>
`
  check("the section passes the products check", productFindings(source).length === 0, productFindings(source))
  const overrides = { "sections/ai_shop_grid.storelib": source }
  const draw = (settings: Record<string, unknown>) => {
    const r = renderStorelibSection(
      { id: "s1", type: "ai_shop_grid", name: "Shop grid", settings, blocks: [] } as unknown as SectionInstance,
      {} as ThemeSettingsValues,
      { template: "index", in_editor: true },
      overrides,
      cards as never,
      { catalog: cards, collections: { c1: summer } } as never,
    )
    return r.ok === true ? r.html : `ERROR ${JSON.stringify(r).slice(0, 300)}`
  }
  const cardsIn = (html: string) =>
    [...html.matchAll(/<a class="card" data-card="([^"]*)"[^>]*>\s*<img src="([^"]*)"[\s\S]*?<span class="t">([^<]*)<\/span><span class="p">([^<]*)<\/span>/g)].map((m) => ({ title: m[3], image: m[2], price: m[4] }))
  const whole = (list: ReturnType<typeof cardsIn>) => list.length === 3 && list.every((c, i) => c.image.includes(`item-${i + 1}.jpg`) && c.title === `Item ${i + 1}` && c.price === `$${i + 1}0.00`)
  for (const [label, base] of [
    ["the shop", { source: "shop", product_count: 6 }],
    ["a collection", { source: "collection", collection: "summer", product_count: 6 }],
    ["chosen products", { source: "chosen", chosen: ["/products/item-1", "/products/item-2", "/products/item-3"], product_count: 6 }],
  ] as const) {
    const before = cardsIn(draw({ ...base, columns: 3, gap: 16 }))
    const after = cardsIn(draw({ ...base, columns: 4, gap: 24 }))
    check(`from ${label}: every card has its photo, name and price`, whole(before), before.length ? before : draw({ ...base, columns: 3, gap: 16 }).slice(0, 900))
    check(`from ${label}: and still does after a layout-only change`, whole(after) && JSON.stringify(after) === JSON.stringify(before), after)
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
