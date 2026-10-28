/**
 * Storelib's own Featured products and Product spotlight sections show the
 * featured product's offers (quantity break tiers, bundles with Add all to
 * cart, upsells), drawn by the product page block's own pieces with the
 * product page block's own figures, so what a card says is what the cart and
 * the checkout charge, in the store's currency and in a market's.
 *
 *   MARKS     each card, and the spotlight, leaves a mark for its product's
 *             offers; Show bundles and upsells (on by default) takes it away
 *   PRICE     GET /api/offers says what the tiers are priced at (the default
 *             option), and a tier's total there is the checkout's
 *   MARKET    a tier and a set drawn in a market's currency by the section say
 *             what the imported theme's block and the checkout say
 *   CHOOSE    a product that asks a required answer, or this product with
 *             options to pick, opens its page (Choose options) instead of
 *             going in from a card; the checkout refuses a line without the
 *             answer whatever a page lets through
 *   MONEY     card prices follow Show currency codes, as the product block's
 *   WIRING    the marks are drawn into on the live page and on the canvas,
 *             and an edit in the sidebar leaves what is drawn in them
 *
 *   node scripts/run-push-tests.mjs (listed there)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { renderStorelibSection } from "../lib/website-builder/storelib-runtime"
import type { SectionInstance, ThemeSettingsValues } from "../lib/website-builder/types"
import { applyOffers } from "../lib/offers/offers"
import { tierLabel, tierTotals, type Tier } from "../lib/offers/pricing"
import { pricingFor, type MarketPrice, type StorefrontDisplay } from "../lib/markets/pricing"
import { marketCharge } from "../lib/markets/checkout-charge"
import { chargedInMarket } from "../lib/markets/cart-money"
import { formatMinor, type FxRates } from "../lib/markets/money"
import { tierShown } from "../components/offers/quantity-breaks"
import { offersShown } from "../lib/storelib-theme/compat/offers-app-block"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const SHOP = "a1000000-0000-4000-8000-000000000001"
const TEE = "a1000000-0000-4000-8000-0000000000a1"
const MUG = "a1000000-0000-4000-8000-0000000000a2"
const TEEV = "a1000000-0000-4000-8000-0000000000b1"
const TEEV2 = "a1000000-0000-4000-8000-0000000000b3"
const MUGV = "a1000000-0000-4000-8000-0000000000b2"
const NOW = new Date("2026-10-25T12:00:00Z")
const today = new Date().toISOString().slice(0, 10)
const tier = (quantity: number, freeQuantity = 0, discountType: Tier["discountType"] = "none", discountValue = 0): Tier => ({ quantity, freeQuantity, discountType, discountValue, label: tierLabel({ quantity, freeQuantity, discountType, discountValue }), badge: "" })

const card = (id: string, title: string, slug: string) => ({ id, type: "product", settings: { title, slug, kind: "physical", pay_what_you_want: false, url: `/products/${slug}`, price: "29 lei", image: "https://cdn.example/x.jpg", checkout_url: `/checkout?productId=${id}&src=website`, variants: [] } })
const CATALOG = [card(TEE, "Tee", "tee"), card(MUG, "Mug", "mug")]
function draw(type: string, settings: Record<string, unknown>, blocks: unknown[] = []): string {
  const r = renderStorelibSection({ id: "s", type, name: type, settings, blocks } as unknown as SectionInstance, {} as ThemeSettingsValues, { template: "index" }, undefined, CATALOG as never, { catalog: CATALOG } as never)
  return r.ok === true ? r.html : ""
}
const marks = (html: string) => [...html.matchAll(/<div[^>]*data-storelib-offers="([^"]*)"[^>]*>/g)].map((m) => ({ id: m[1], tag: m[0] }))
function schemaOf(type: string): { settings: { id?: string; default?: unknown; type?: string }[] } {
  const src = DEFAULT_THEME_SOURCES[`sections/${type}.storelib`]
  return JSON.parse(src.slice(src.indexOf("<schema>") + 8, src.indexOf("</schema>")))
}

async function main() {
  console.log("\nMARKS: Storelib's own sections leave a place for the featured product's offers")
  {
    for (const [name, settings, blocks] of [
      ["the shop's products", { source: "shop", product_count: 2 }, []],
      ["products chosen in the sidebar", { source: "chosen", chosen: [MUG, TEE] }, []],
      ["cards picked one by one", { source: "picked" }, [{ id: "b1", type: "product", settings: { url: "/products/tee" } }, { id: "b2", type: "product", settings: { url: "/products/mug", title: "My mug" } }]],
    ] as const) {
      const found = marks(draw("product_featured", settings, blocks as unknown as unknown[]))
      check(`Featured products, ${name}: one mark per card, each its product's`, found.length === 2 && found.every((m) => (m.id === TEE || m.id === MUG) && /data-layout="card"/.test(m.tag) && /data-storelib-island=""/.test(m.tag) && /data-kind="physical"/.test(m.tag)), found)
    }
    check("  a card typed with no product leaves none", marks(draw("product_featured", { source: "picked" }, [{ id: "b1", type: "product", settings: { title: "Typed", price: "$4" } }])).length === 0)
    check("  Show bundles and upsells off leaves none", marks(draw("product_featured", { source: "shop", show_offers: false })).length === 0)
    const spot = marks(draw("product_spotlight", { button_url: "/products/tee", button_text: "Buy it" }))
    check("Product spotlight: one mark for its product, laid out on the section", spot.length === 1 && spot[0].id === TEE && /data-layout="open"/.test(spot[0].tag) && /data-slug="tee"/.test(spot[0].tag), spot)
    check("  none with no product chosen, none with it off", marks(draw("product_spotlight", { button_text: "Buy it" })).length === 0 && marks(draw("product_spotlight", { button_url: "/products/tee", button_text: "Buy it", show_offers: false })).length === 0)
    const hero = marks(draw("hero_product", { button_url: "/products/tee", button_text: "Buy it" }))
    check("Product hero: one mark for its product, laid out on the section, with its page's address", hero.length === 1 && hero[0].id === TEE && /data-layout="open"/.test(hero[0].tag) && /data-url="\/products\/tee"/.test(hero[0].tag), hero)
    check("  none with it off", marks(draw("hero_product", { button_url: "/products/tee", button_text: "Buy it", show_offers: false })).length === 0)
    check("  every card's mark carries its page's address", marks(draw("product_featured", { source: "shop", product_count: 2 })).every((m) => /data-url="\/products\/(tee|mug)"/.test(m.tag)))
    for (const type of ["product_featured", "product_spotlight", "hero_product"]) {
      const f = schemaOf(type).settings.find((s) => s.id === "show_offers")
      check(`  ${type}: Show bundles and upsells is a toggle, on by default (a section saved before it shows offers)`, f?.type === "toggle" && f.default === true, f)
    }
    const { offerIslandsIn } = await import("../components/website-builder/sections/offer-islands")
    const attrs: Record<string, string> = { "data-storelib-offers": TEE, "data-title": "Tee", "data-slug": "tee", "data-kind": "physical", "data-image": "", "data-pwyw": "", "data-layout": "card", "data-radius": "0" }
    const root = { querySelectorAll: () => [{ getAttribute: (n: string) => attrs[n] ?? null }] } as unknown as ParentNode
    const read1 = offerIslandsIn(root)[0]
    check("  a mark is read as the product, its kind, its layout and the theme's radius (0 stays 0)", read1?.productId === TEE && read1.kind === "physical" && read1.layout === "card" && read1.radius === 0 && read1.image === null && read1.payWhatYouWant === false, read1)
  }

  console.log("\nPRICE: the tiers are priced at the default option, and that is what checkout charges")
  {
    const { productOffers } = await import("../lib/offers/offers-public")
    const tiers = [tier(1), tier(2, 1), tier(4, 0, "percent", 30)]
    const db = fakeDb({
      products: [{ id: TEE, creator_id: SHOP, title: "Tee", slug: "tee", type: "physical", status: "published", price_cents: 2900, thumbnail_url: null, pay_what_you_want: false, track_inventory: false, continue_selling: true, compare_at_cents: null }],
      product_variants: [
        { id: TEEV2, product_id: TEE, name: "Large", price_cents: 3300, active: true, track_inventory: false, inventory_policy: "continue", position: 1, compare_at_price_cents: null },
        { id: TEEV, product_id: TEE, name: "Small", price_cents: 2900, active: true, track_inventory: false, inventory_policy: "continue", position: 0, compare_at_price_cents: 3500 },
      ],
      inventory_levels: [],
      store_settings: [{ creator_id: SHOP, currency: "RON", default_country: "RO" }],
      store_offers: [{ id: "c0000000-0000-4000-8000-000000000001", creator_id: SHOP, kind: "quantity_break", title: "Buy more", product_ids: [TEE], trigger_product_ids: [], discount_type: "none", discount_value: 0, active: true, position: 0, created_at: "2026-10-01", trigger_collection_ids: [], placements: ["product", "cart"], starts_at: null, ends_at: null, combines_with_codes: true, max_per_order: null, min_subtotal_cents: null, tiers }],
    })
    const b = (await productOffers(db, TEE, { now: NOW })).quantityBreaks[0]
    check("the break says it is priced at the first option in the editor's order, with its compare at price", b?.priceCents === 2900 && b.compareAtCents === 3500 && b.variantId === TEEV && b.variantName === "Small", b && { priceCents: b.priceCents, compareAtCents: b.compareAtCents, variantId: b.variantId, variantName: b.variantName })
    const allMatch = (b?.tiers ?? []).every((t, i) => {
      const units = t.quantity + t.freeQuantity
      const charged = units * 2900 - applyOffers([{ productId: TEE, unitCents: 2900, quantity: units }], [{ id: "q", kind: "quantity_break", title: "", productIds: [TEE], triggerIds: [], discountType: "none", discountValue: 0, active: true, tiers }], { now: NOW }).discounts[0]
      const shown = tierShown(b!.priceCents!, b!.tiers, i, b!.compareAtCents ?? null, (c) => String(c), null)
      return t.totalCents === charged && shown.totalCents === charged && shown.total === String(charged) && t.totalCents === tierTotals(2900, t, 3500).totalCents
    })
    check("  every tier the section shows at it is the checkout's total for that many units", allMatch, b?.tiers)
  }

  console.log("\nMARKET: in a market's currency the section says what the imported theme's block and the checkout say")
  {
    const fx: FxRates = { asOf: today, rates: { RON: 5 } }
    const eur99: MarketPrice = { id: "eu", name: "Europe", currency: "EUR", rounding: "nine_nine", adjustBps: 0 }
    const display: StorefrontDisplay = { market: eur99, base: "RON", fx, locale: "en", note: null }
    const pricing = pricingFor(eur99, "RON", fx)!
    const charge = marketCharge(pricing)
    const tiers = [tier(1), tier(2, 1), tier(4, 0, "percent", 30)]
    const money = (c: number) => pricing.format(c, "en") ?? ""
    const theirs = offersShown({ quantityBreaks: [{ offerId: "q", title: "Buy more", tiers }], bundles: [{ offerId: "b", title: "Tee and mug", label: null, discountType: "percent", discountValue: 20, items: [{ id: TEE, title: "Tee", imageUrl: null, priceCents: 2900, variants: [{ id: TEEV, name: "Default", priceCents: 2900 }] }, { id: MUG, title: "Mug", imageUrl: null, priceCents: 1000, variants: [{ id: MUGV, name: "Default", priceCents: 1000 }] }] }] }, TEE, [{ id: TEEV, minor: 2900 }], { charge, currency: "EUR", locale: "en" })
    const same = tiers.every((_, i) => tierShown(2900, tiers, i, null, money, display).total === theirs.breaks[0].tiers[i].at[TEEV].total)
    check("each tier's total is the imported theme block's (the checkout's conversion)", same, tiers.map((_, i) => [tierShown(2900, tiers, i, null, money, display).total, theirs.breaks[0].tiers[i].at[TEEV].total]))
    const set = applyOffers([{ productId: "0", unitCents: 2900, quantity: 1 }, { productId: "1", unitCents: 1000, quantity: 1 }], [{ id: "b", kind: "bundle", title: "", productIds: ["0", "1"], triggerIds: [], discountType: "percent", discountValue: 20, active: true }])
    const m = chargedInMarket([{ unitCents: 2900, quantity: 1, discountCents: set.discounts[0] }, { unitCents: 1000, quantity: 1, discountCents: set.discounts[1] }], display)
    check("  and the set's price is too", !!m && m.write(m.totalMinor) === theirs.bundles[0].at[TEEV].price && m.write(m.totalMinor) === formatMinor(m.totalMinor, "EUR", "en"), [m && m.write(m.totalMinor), theirs.bundles[0].at[TEEV].price])
  }

  console.log("\nCHOOSE: what needs an answer or an option goes to its page, and checkout refuses it without")
  {
    const { productOffers } = await import("../lib/offers/offers-public")
    const engrave = [{ id: "f1", label: "Name to engrave", type: "text", required: true, maxLength: 20, placeholder: "", help: "" }]
    const bundleRow = { id: "b0000000-0000-4000-8000-000000000001", creator_id: SHOP, kind: "bundle", title: "Tee and mug", product_ids: [TEE, MUG], trigger_product_ids: [], discount_type: "percent", discount_value: 20, active: true, position: 0, created_at: "2026-10-01", trigger_collection_ids: [], placements: ["product", "cart"], starts_at: null, ends_at: null, combines_with_codes: true, max_per_order: null, min_subtotal_cents: null, tiers: [] }
    const dbOf = (mugFields: unknown[], teeVariants: number) => fakeDb({
      products: [
        { id: TEE, creator_id: SHOP, title: "Tee", slug: "tee", type: "physical", status: "published", price_cents: 2900, thumbnail_url: null, pay_what_you_want: false, track_inventory: false, continue_selling: true, compare_at_cents: null, personalization: [] },
        { id: MUG, creator_id: SHOP, title: "Mug", slug: "mug", type: "physical", status: "published", price_cents: 1000, thumbnail_url: null, pay_what_you_want: false, track_inventory: false, continue_selling: true, compare_at_cents: null, personalization: mugFields },
      ],
      product_variants: [
        ...Array.from({ length: teeVariants }, (_, i) => ({ id: i === 0 ? TEEV : TEEV2, product_id: TEE, name: i === 0 ? "Small" : "Large", price_cents: 2900, active: true, track_inventory: false, inventory_policy: "continue", position: i })),
        { id: MUGV, product_id: MUG, name: "Default", price_cents: 1000, active: true, track_inventory: false, inventory_policy: "continue", position: 0 },
      ],
      inventory_levels: [],
      store_settings: [{ creator_id: SHOP, currency: "RON", default_country: "RO" }],
      store_offers: [bundleRow],
    })
    const plain = await productOffers(dbOf([], 1), TEE, { now: NOW })
    check("a product with one option and no required answer can be added from a card", plain.product?.personalized === false && plain.product.options === 1 && plain.bundles[0]?.items.every((i) => !i.personalized), plain.product)
    const asks = await productOffers(dbOf(engrave, 2), TEE, { now: NOW })
    check("  one with two options says so, and a set's item with a required answer is flagged", asks.product?.options === 2 && asks.bundles[0]?.items.find((i) => i.id === MUG)?.personalized === true, { product: asks.product, items: asks.bundles[0]?.items })
    const mugPage = await productOffers(dbOf(engrave, 1), MUG, { now: NOW })
    check("  and the product's own required answer is said for its own page", mugPage.product?.personalized === true, mugPage.product)
    const featured = strip(read("components/offers/featured-offers.tsx"))
    const bundleSrc = strip(read("components/offers/bundle-offers.tsx"))
    check("the card's tiers open the product's page, Choose options, when it asks an answer or has options", /const selfChoose = !!data\.product && \(data\.product\.personalized \|\| data\.product\.options > 1\)/.test(featured) && /selfChoose && ownPage \? \(\s*<a href=\{ownPage\}[\s\S]*?\{w\("offer_choose"\)\}/.test(featured))
    check("  a set or an upsell with such an item opens that item's page instead of adding it", /i\.personalized && i\.slug \? `\/products\/\$\{encodeURIComponent\(i\.slug\)\}`/.test(featured) && /pageFor=\{pageFor\}/.test(featured) && /setPage \? \(\s*<a href=\{setPage\}/.test(bundleSrc) && /upPage \? \(\s*<a href=\{upPage\}/.test(bundleSrc))
    check("  Choose options is a Shop word", (await import("../lib/markets/ui-words")).UI_WORDS.offer_choose === "Choose options")
    check("  on the canvas the link doesn't leave the editor", /if \(storefront\.inEditor && \(e\.target as HTMLElement\)\.closest\("a"\)\) e\.preventDefault\(\)/.test(featured))
    const { checkLines } = await import("../lib/products/personalization-server")
    const fieldsOf = new Map([[MUG, engrave as never]])
    const refused = checkLines([{ productId: MUG, title: "Mug", properties: {} }], fieldsOf)
    const taken = checkLines([{ productId: MUG, title: "Mug", properties: { "Name to engrave": "Ana" } }], fieldsOf)
    check("the checkout refuses a line missing a required answer, and takes it with one", refused.ok === false && /Mug: /.test(refused.ok === false ? refused.error : "") && taken.ok === true, { refused, taken })
    const start = read("lib/physical/checkout-server.ts")
    check("  every checkout of things that ship holds its lines to that before payment", /const personalized = await personalizedLines\(db, priced\.lines\)\s*\n\s*if \(personalized\.ok === false\) return \{ ok: false, status: 400/.test(start) && /startCheckout\(admin, \{/.test(read("app/api/checkout/site/route.ts")))
    check("  and only a product that ships can ask for one", /personalization: productType === "physical" \? storedPersonalization\(personalization\) : \[\]/.test(read("app/app/products/new/product-editor.tsx")))
  }

  console.log("\nMONEY: card prices follow Show currency codes, as the product page block's")
  {
    const featured = strip(read("components/offers/featured-offers.tsx"))
    check("the store's price with its code when the theme asks, the market's when the page shows one", /productMoney\(cents, \{ code: codes, currency: storefront\.currency \}\)/.test(featured) && /pricing\.format\(cents, storefront\.display\?\.locale\)/.test(featured))
    check("  the theme's setting reaches every mark", /codes=\{theme\.currency_code_enabled === true\}/.test(read("components/website-builder/sections/StorelibSection.tsx")) && /codes=\{codes\}/.test(read("components/website-builder/sections/offer-islands.tsx")))
    const { money } = await import("../lib/products/product-page-model")
    check("  written as the product block writes it", money(2900, { code: true, currency: "USD" }) === "$29.00 USD" && money(2900, { code: false, currency: "USD" }) === "$29.00", [money(2900, { code: true, currency: "USD" })])
  }

  console.log("\nWIRING: drawn into on the live page and on the canvas, by the product page block's pieces")
  {
    const featured = strip(read("components/offers/featured-offers.tsx"))
    check("the section's offers are read from GET /api/offers, as the product page block's", /useProductOffers\(productId\)/.test(featured))
    check("  the tiers by QuantityBreaks at the price the server priced them at, in the page's market", /<QuantityBreaks[\s\S]*priceCents=\{brk\.priceCents\}[\s\S]*display=\{display\}/.test(featured) && /storefront\.display \?\? null/.test(featured))
    check("  the set and the upsell by BundleOffers, in the page's market", /<BundleOffers[\s\S]*display=\{display\}/.test(featured))
    check("  a tier's name and price each in the page's words", /tierNameIn\(t\.label/.test(featured) && /fillWords\(w\("offer_each"\)/.test(featured) && /w\("add_to_cart"\)/.test(featured))
    check("  a tier sets how many Add to cart puts in the website's cart, at the option the tiers are priced at", /onPick=\{setQuantity\}/.test(featured) && /lineOf\(units, brk\.priceCents, brk\.variantId/.test(featured) && /cart\.addAll\(lines\)/.test(featured))
    check("  nothing is pressed on the canvas with the inspector on, or off a live cart", /const canAdd = !inert && cart\.live/.test(featured))
    check("  in a card it draws no box of its own (no card in a card)", /bare=\{card\}/.test(featured) && /bare \? undefined : "border p-4"/.test(read("components/offers/quantity-breaks.tsx")) && /bare \? \{ className: "border-t pt-4"/.test(read("components/offers/bundle-offers.tsx")))
    const section = read("components/website-builder/sections/StorelibSection.tsx")
    check("every .storelib section draws its marks, published and in the editor (one component for both)", /<OfferIslands root=\{scriptRoot\} html=\{onPage\} inert=\{isEditing === true\} codes=/.test(section))
    check("  the offers' code loads only where there is a mark", /lazy\(\(\) => import\("@\/components\/offers\/featured-offers"\)\)/.test(read("components/website-builder/sections/offer-islands.tsx")))
    check("  an edit in the sidebar leaves what is drawn in a mark", /if \(eh\.hasAttribute\("data-storelib-island"\)\) return\s*\n\s*morphChildren\(eh, ew\)/.test(read("lib/website-builder/morph-html.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
