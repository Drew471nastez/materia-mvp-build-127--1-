/**
 * Products come from the store: the section checker refuses typed products,
 * prices and product arrays, and the built-in product sections read the
 * catalogue through products, product_picker, product_list and collections.
 */
import { checkSectionIntegration } from "@/lib/storelib-ai/integration"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
