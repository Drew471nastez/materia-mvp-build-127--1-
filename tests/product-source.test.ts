/**
 * ===========================================================================
 *  PRODUCTS ARE READ FROM THE SHOP, ON THE CANVAS AS ON THE SITE
 * ===========================================================================
 * The owner: "when I tell it to code a products section it never fetches the
 * real products, it codes placeholders and text inputs for the product's
 * name and price", and "when I change a setting the product cards lose their
 * pictures". Driven here with the real code:
 *
 *   GATE      a section an agent writes with product cards typed by hand (a
 *             block holding a name and a price), one about products that
 *             reads none of the shop's, or a price typed into its markup or
 *             presets, is refused with what to write instead. A pricing table
 *             or a menu of dishes is priced by hand on purpose and left alone.
 *             A grid that reads the shop passes.
 *   LOOPS     {% for block in products limit: settings.product_count %}, as a
 *             shop theme writes it: limit, offset and reversed, each a number
 *             or a declared setting.
 *   TOLD      a request about products retrieves the rule and the pattern; the
 *             built-in product section an agent reads as its example has no
 *             hand-filled branch and passes the agent's own checks.
 *   CARDS     a product a section picked is the same card the shop's own list
 *             draws: its gallery, its kind and its options, not six columns.
 *   CANVAS    the builder draws the cards the live site draws, from the same
 *             functions; a section's markup applied again keeps its pictures'
 *             loaded mark, and its hooks write onto the markup on the page.
 *             scripts/check-canvas-stability.mjs drives that in Chromium.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { checkSectionIntegration } from "@/lib/storelib-ai/integration"
import { validateSection } from "@/lib/storelib-ai/validate"
import { knowledgeBlock } from "@/lib/storelib-ai/knowledge"
import { REFERENCE_SECTIONS, withoutHandFilled } from "@/lib/storelib-ai/reference"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { toCard } from "@/lib/website-builder/shop-products"
import { pickedProducts } from "@/lib/website-builder/storefront-data-server"
import { PAGE_OWNED_ATTRIBUTES } from "@/lib/website-builder/morph-html"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`) }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const errorsOf = (src: string) => checkSectionIntegration(src).filter((f) => f.severity === "error").map((f) => f.id)

const grid = read("scripts/fixtures/ai-product-grid.storelib")
const typedGrid = `<template>
<section class="s" data-scheme="{{ settings.color_scheme }}">
  <h2>{{ settings.heading }}</h2>
  {% for block in blocks %}<div data-block-id="{{ block.id }}"><img src="{{ block.settings.image | asset }}" alt="{{ block.settings.title }}" width="400" height="400"><h3>{{ block.settings.title }}</h3><p>{{ block.settings.price }}</p></div>{% endfor %}
</section>
</template>
<style>.s{container-type:inline-size}</style>
<schema>
{ "type": "best_sellers", "name": "Best sellers", "category": "products", "settings": [ { "type": "text", "id": "heading", "label": "Heading", "default": "Best sellers" }, { "type": "color_scheme", "id": "color_scheme", "label": "Scheme", "default": "white" } ],
  "blocks": [ { "type": "product", "name": "Product", "settings": [ { "type": "image_picker", "id": "image", "label": "Photo" }, { "type": "text", "id": "title", "label": "Name" }, { "type": "text", "id": "price", "label": "Price", "default": "$48" } ] } ],
  "presets": [ { "name": "Best sellers", "blocks": [ { "type": "product", "settings": { "title": "Tote", "price": "$48" } } ] } ] }
</schema>`

// ═══════════════════════════════════════════════════════════════════════════
section("GATE: a product typed by hand is refused, the shop read is not")
// ═══════════════════════════════════════════════════════════════════════════
{
  check("a grid that reads the shop, a collection and chosen products passes the agent's checks", errorsOf(grid).length === 0, errorsOf(grid))
  const v = validateSection(grid, { strict: true })
  check("and saves", v.ok === true, v.ok === false ? v.feedback.slice(0, 300) : "")
  const typed = errorsOf(typedGrid)
  check("product blocks holding a typed name and price are refused", typed.includes("integration-product-typed"), typed)
  const feedback = validateSection(typedGrid, { strict: true })
  check("and the refusal says what to write: products, a source select, a collection, a product list", feedback.ok === false && /for block in products/.test(feedback.feedback) && /collection_picker/.test(feedback.feedback) && /product_list/.test(feedback.feedback))
  const readsNothing = typedGrid
    .replace(/,\n  "blocks": \[[\s\S]*?\] \} \],\n  "presets": \[[\s\S]*?\] \} \] \}/, `,\n  "presets": [ { "name": "Best sellers" } ] }`)
    .replace(/\{% for block in blocks %\}[\s\S]*?\{% endfor %\}/, "")
  check("a section about products that reads none of the shop's is refused", errorsOf(readsNothing).includes("integration-products"), errorsOf(readsNothing))
  const plans = typedGrid.replace("best_sellers", "pricing_plans").replace(/Best sellers/g, "Plans").replace(`"category": "products"`, `"category": "pricing"`).replace(/"type": "product"/g, `"type": "plan"`).replace(`"name": "Product"`, `"name": "Plan"`)
  check("a pricing table's plans are priced by hand on purpose and pass", !errorsOf(plans).some((id) => id.startsWith("integration-product")), errorsOf(plans))
  const money = grid.replace(`<h3 class="pg__t">{{ block.settings.title }}</h3>`, `<h3 class="pg__t">{{ block.settings.title }}</h3><span>$48.00</span>`)
  check("a price typed into the markup is refused", errorsOf(money).includes("integration-products"), errorsOf(money))
  const single = `<template>
<section class="s" data-scheme="{{ settings.color_scheme }}">{% if settings.product.title %}<h2>{{ settings.product.title }}</h2><p>{{ settings.product.price }}</p><a href="{{ settings.product.checkout_url | url }}">{{ settings.button_text }}</a>{% elsif page.in_editor %}<p>Choose the product in the sidebar</p>{% endif %}</section>
</template>
<style>.s{container-type:inline-size}</style>
<schema>
{ "type": "product_hero_own", "name": "Featured product", "category": "products", "settings": [ { "type": "product_picker", "id": "product", "label": "Product" }, { "type": "text", "id": "button_text", "label": "Button", "default": "Buy it" }, { "type": "color_scheme", "id": "color_scheme", "label": "Scheme", "default": "white" } ], "presets": [ { "name": "Featured product" } ] }
</schema>`
  const withPicker = (print: string) => typedGrid
    .replace(`<p>{{ block.settings.price }}</p>`, `<p>${print}</p>`)
    .replace(`{ "type": "image_picker", "id": "image", "label": "Photo" }`, `{ "type": "product_picker", "id": "product", "label": "Product" }, { "type": "image_picker", "id": "image", "label": "Photo" }`)
    .replace(`"default": "$48" }`, `"default": "" }`)
    .replace(`, "price": "$48" }`, ` }`)
  check("a price setting kept only as the fallback for a chosen product, printed after it, passes", !errorsOf(withPicker("{{ block.settings.product.price | default: block.settings.price }}")).includes("integration-product-typed"), errorsOf(withPicker("{{ block.settings.product.price | default: block.settings.price }}")))
  check("the same setting printed over the product's price is refused", errorsOf(withPicker("{{ block.settings.price | default: block.settings.product.price }}")).includes("integration-product-typed"))
  check("one product read through a product_picker passes", !errorsOf(single).some((id) => id.startsWith("integration-product")), errorsOf(single))
}

// ═══════════════════════════════════════════════════════════════════════════
section("LOOPS: limit, offset and reversed, as a shop theme writes them")
// ═══════════════════════════════════════════════════════════════════════════
{
  const cards = Array.from({ length: 8 }, (_, i) => toCard({ id: `00000000-0000-4000-8000-00000000000${i}`, title: `Real ${i}`, slug: `real-${i}`, price_cents: 1000 + i, compare_at_cents: null, thumbnail_url: `https://cdn.example/p${i}.png`, status: "published" }))
  const draw = (settings: Record<string, unknown>) => {
    const r = renderStorelibSection({ id: "s1", type: "ai_product_grid", name: "g", settings, blocks: [] } as never, {} as never, { template: "index", in_editor: true }, { "sections/ai_product_grid.storelib": grid }, cards as never, { catalog: cards } as never)
    return r.ok ? [...r.html.matchAll(/class="pg__t">([^<]*)</g)].map((m) => m[1]) : ["did not render"]
  }
  check("limit: settings.limit draws that many, newest first", JSON.stringify(draw({ limit: 3 })) === JSON.stringify(["Real 0", "Real 1", "Real 2"]), draw({ limit: 3 }))
  check("the chosen products, in the creator's order", JSON.stringify(draw({ source: "chosen", chosen: [cards[5].id, cards[2].id] })) === JSON.stringify(["Real 5", "Real 2"]))
  const loop = (body: string) => compileSection(`<template>\n<div>${body}</div>\n</template>\n<schema>\n{ "type": "t", "name": "T", "settings": [ { "type": "range", "id": "n", "label": "N", "min": 1, "max": 12, "step": 1, "default": 2 } ] }\n</schema>`, { file: "sections/t.storelib" })
  const r1 = loop(`{% for block in products limit: settings.n offset: 1 reversed %}<i>{{ block.id }}</i>{% endfor %}`)
  check("limit, offset and reversed compile together", r1.ok === true, r1.ok === false ? r1.errors : "")
  const r2 = loop(`{% for block in products limit: settings.count %}<i>{{ block.id }}</i>{% endfor %}`)
  check("a limit naming a setting that is not declared is a compile error, like any other name", r2.ok === false)
  if (r1.ok) {
    const out = renderStorelibSection({ id: "t1", type: "t", name: "t", settings: { n: 3 }, blocks: [] } as never, {} as never, { template: "index" }, { "sections/t.storelib": `<template>\n<div>{% for block in products limit: settings.n offset: 1 reversed %}<i>{{ block.settings.title }}</i>{% endfor %}</div>\n</template>\n<schema>\n{ "type": "t", "name": "T", "settings": [ { "type": "range", "id": "n", "label": "N", "min": 1, "max": 12, "step": 1, "default": 2 } ] }\n</schema>` }, cards as never)
    const got = out.ok ? [...out.html.matchAll(/<i>([^<]*)<\/i>/g)].map((m) => m[1]) : []
    check("offset first, then the limit, then the order turned round", JSON.stringify(got) === JSON.stringify(["Real 3", "Real 2", "Real 1"]), got)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
section("TOLD: the rule reaches the model, and its example follows it")
// ═══════════════════════════════════════════════════════════════════════════
{
  for (const ask of ["code me a product grid like a shopify theme", "make a best sellers section", "build a featured collection with 4 items", "add a section with my new arrivals"]) {
    const k = knowledgeBlock(ask)
    check(`"${ask}" retrieves the products rule`, /PRODUCTS COME FROM THE STORE, NEVER FROM TYPING/.test(k) && /product_list/.test(k) && /collection_picker/.test(k))
  }
  check("and a request about an FAQ does not", !/PRODUCTS COME FROM THE STORE/.test(knowledgeBlock("make the faq accordion nicer")))
  const shown = REFERENCE_SECTIONS.split("sections/product_featured.storelib, for")[1] ?? ""
  const src = shown.slice(shown.indexOf("<template>"))
  check("the product example an agent reads has no hand-filled branch", src.length > 0 && !/HAND-FILLED|"picked"|for block in blocks/.test(src))
  const v = validateSection(src, { strict: true })
  check("and passes the checks an agent's own section is held to", v.ok === true, v.ok === false ? v.feedback.slice(0, 300) : "")
  const original = DEFAULT_THEME_SOURCES["sections/product_featured.storelib"]
  check("while the built-in keeps it, so a section saved with typed cards draws them", /HAND-FILLED/.test(original) && /"picked"/.test(original))
  check("and a file with nothing to take out is left exactly as it was", withoutHandFilled(grid) === grid)
}

// ═══════════════════════════════════════════════════════════════════════════
section("CARDS: a picked product is the same card the shop's list draws")
// ═══════════════════════════════════════════════════════════════════════════
await (async () => {
  const asked: string[] = []
  const row = { id: "3f2a9c1e-0000-4000-8000-000000000001", title: "Linen shirt", slug: "linen-shirt", price_cents: 4800, compare_at_cents: 6000, thumbnail_url: "https://cdn.example/a.jpg", gallery_urls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"], status: "published", type: "physical", pay_what_you_want: false, pwyw_min_price_cents: null, category: "Shirts" }
  const fake = {
    from: (table: string) => ({
      select: (cols: string) => {
        if (table === "products") asked.push(cols)
        const q = {
          eq: () => q,
          in: () => q,
          order: () => Promise.resolve({ data: table === "product_variants" ? [{ id: "v1", product_id: row.id, name: "Large", price_cents: 5200, position: 0 }] : [], error: null }),
          limit: () => Promise.resolve({ data: table === "products" ? [row] : [], error: null }),
        }
        return q
      },
    }),
  }
  const got = await pickedProducts(fake as never, "creator-1", { ids: [row.id], slugs: [] })
  const card = got[0]?.settings
  check("a picked product is read with its gallery, kind and category", /gallery_urls/.test(asked[0] ?? "") && /type/.test(asked[0] ?? ""), asked[0])
  check("and comes back with both pictures, its kind and its options", !!card && card.images.length === 2 && card.kind === "physical" && card.variants.length === 1 && card.variants[0].name === "Large", card)
})()

// ═══════════════════════════════════════════════════════════════════════════
section("CANVAS: the builder draws the live cards, and keeps what an edit did not change")
// ═══════════════════════════════════════════════════════════════════════════
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const route = read("app/api/website-builder/products/route.ts")
  check("the products route hands the canvas the live site's own cards", /cards"\) === "1"/.test(route) && /shopProducts\(admin, creator\.id\)/.test(route) && /catalogCards\(admin, creator\.id\)/.test(route))
  check("the editor reads them, and reads them again when its tab comes back", /\/api\/website-builder\/products\?cards=1/.test(editor) && /visibilitychange", again/.test(editor))
  check("a picker on the canvas resolves against every published product, as on the site", /* Changed on purpose (round AE): the same cards, in the language previewed. */ (/catalog: catalogCardsForCanvas/.test(editor) || (/catalog: catalogCardsShown/.test(editor) && /localizeCards\(catalogCardsForCanvas, previewMap/.test(editor))))
  check("a section's markup applied again keeps the mark that its pictures have loaded", PAGE_OWNED_ATTRIBUTES.has("data-sl-loaded"))
  const fade = read("lib/website-builder/media-fade.ts")
  check("and a picture whose mark is taken off while it is loaded is marked again at once", /attributeFilter: \["src", "srcset", "data-sl-loaded"\]/.test(fade))
  const sectionSrc = read("components/website-builder/sections/StorelibSection.tsx")
  check("the cart and wishlist hooks write onto the markup on the page, not the markup before it", /html=\{onPage\}/.test(sectionSrc) && /* Changed on purpose (round BA): the canvas's sample cards on the Wishlist page add sampleMode. */ /\[scriptRoot, onPage, savedIds, savedReady(, sampleMode)?\]/.test(sectionSrc))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
