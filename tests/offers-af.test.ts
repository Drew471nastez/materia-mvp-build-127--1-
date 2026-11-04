/**
 * Round AF: quantity breaks, Buy X get Y free and bundles on imported themes,
 * charged at checkout exactly as the theme showed them (lib/offers/pricing.ts,
 * lib/offers/offers.ts applyOffers, SQL part 304).
 *
 *   FORMULA     the theme's numbers (tierTotals) and the checkout's
 *               (applyOffers) to the cent: every tier, every variant price,
 *               percent rounding, an amount never below 0, yen and lei
 *   SPEC        3 units of "2 + 1 free" at $36.00 charge $72.00; 5 units on
 *               2+1 and 3+2 charge $108.00; the leftover rule; a bundle and
 *               a quantity break on the same unit apply once (the larger);
 *               tampered properties change nothing; a cart line's
 *               properties reach the order line; /cart/update.js `discount`
 *               reaches checkout
 *   CHECKOUT    the website checkout's quote on a database: the saving
 *               lines named by the tier, lines split by properties, the
 *               shown-total check passing on the formula and refusing a
 *               browser that lies
 *   READS       GET /api/offers and /quantity-breaks: on now, published,
 *               nothing of the store's own; a collection's offer
 *   ADMIN       tiers validation, saving one, part 304 not run, the Sold
 *               count, the export's columns
 *   THEME       product.metafields.storelib.offers, cart.items[].properties,
 *               line_item.properties; /cart.js discount_codes
 *   EMAILS      each saving its own row, "_" properties hidden from the buyer
 *
 *   npx tsx --conditions=react-server tests/offers-af.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { applyOffers, readOffer, stackWithCode, type Offer, type OfferLine } from "../lib/offers/offers"
import { breakSavings, percentUnit, readTiers, tierBlocks, tierLabel, tierTotals, type Tier } from "../lib/offers/pricing"
import { decodeItems, encodeItems, lineProperties, propertiesKey, buyerProperties } from "../lib/physical/cart-link"
import { differsFromShown, shownTotalOf } from "../lib/checkout/shown-total"
import { sameLine, themeCartAfter, readSiteCheckoutParams } from "../lib/checkout/site-checkout"
import { summaryRows } from "../lib/checkout/summary-rows"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sum = (a: number[]) => a.reduce((n, x) => n + x, 0)

const SHOP = "af000000-0000-4000-8000-000000000001"
const TEE = "af000000-0000-4000-8000-0000000000a1"
const MUG = "af000000-0000-4000-8000-0000000000a2"
const CAP = "af000000-0000-4000-8000-0000000000a3"
const TEE_S = "af000000-0000-4000-8000-0000000000b1"
const TEE_L = "af000000-0000-4000-8000-0000000000b2"
const MUGV = "af000000-0000-4000-8000-0000000000b3"
const CAPV = "af000000-0000-4000-8000-0000000000b4"
const STUDIO = "af000000-0000-4000-8000-0000000000c1"
const COLL = "af000000-0000-4000-8000-0000000000d1"
const QB = "af000000-0000-4000-8000-0000000000e1"
const BUNDLE = "af000000-0000-4000-8000-0000000000e2"
const NOW = new Date("2026-10-25T12:00:00Z")

const tier = (quantity: number, freeQuantity = 0, discountType: Tier["discountType"] = "none", discountValue = 0, label = "", badge = ""): Tier => ({ quantity, freeQuantity, discountType, discountValue, label: label || tierLabel({ quantity, freeQuantity, discountType, discountValue }), badge })
const breakOffer = (tiers: Tier[], o: Partial<Offer> = {}): Offer => ({ id: QB, kind: "quantity_break", title: "Buy more, save more", productIds: [TEE], triggerIds: [], discountType: "none", discountValue: 0, active: true, tiers, ...o })
const bundleOffer = (o: Partial<Offer> = {}): Offer => ({ id: BUNDLE, kind: "bundle", title: "Tee and mug", productIds: [TEE, MUG], triggerIds: [], discountType: "percent", discountValue: 50, active: true, ...o })
const ln = (productId: string, unitCents: number, quantity: number, extra: Partial<OfferLine> = {}): OfferLine => ({ productId, unitCents, quantity, ...extra })

/** A database row of store_offers, as part 304 writes it. */
const offerRow = (o: Offer, position = 0) => ({ id: o.id, creator_id: SHOP, kind: o.kind, title: o.title, product_ids: o.productIds, trigger_product_ids: o.triggerIds, discount_type: o.discountType, discount_value: o.discountValue, active: o.active, position, created_at: `2026-10-0${position + 1}T00:00:00Z`, trigger_collection_ids: o.triggerCollectionIds ?? [], placements: ["product", "cart", ...(o.kind === "checkout" ? ["checkout"] : [])], starts_at: null, ends_at: null, combines_with_codes: true, max_per_order: null, min_subtotal_cents: null, tiers: o.tiers ?? [] })

function shopDb(opts: { offers?: Offer[]; currency?: string; teeCents?: number; teeLCents?: number; mugCents?: number; collections?: boolean; extra?: Record<string, Record<string, unknown>[]>; draft?: string[] } = {}) {
  const tee = opts.teeCents ?? 3600
  const variant = (v: Record<string, unknown>) => ({ weight_grams: 200, track_inventory: false, inventory_policy: "continue", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null, position: 0, compare_at_price_cents: null, ...v })
  const product = (p: Record<string, unknown>) => ({ creator_id: SHOP, type: "physical", status: "published", thumbnail_url: null, requires_shipping: true, weight_grams: 200, taxable: true, track_inventory: false, continue_selling: true, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: null, max_per_order: null, compare_at_cents: null, ...p })
  const rate = (r: Record<string, unknown>) => ({ creator_id: SHOP, active: true, position: 0, tiers: [], min_value: null, max_value: null, free_over_cents: null, min_days: 2, max_days: 4, ...r })
  return fakeDb({
    products: [product({ id: TEE, title: "Tee", slug: "tee", price_cents: tee }), product({ id: MUG, title: "Mug", slug: "mug", price_cents: opts.mugCents ?? 2000 }), product({ id: CAP, title: "Cap", slug: "cap", price_cents: 1500 })].map((p) => (opts.draft?.includes((p as { id?: string }).id ?? "") ? { ...p, status: "draft" } : p)),
    product_variants: [
      variant({ id: TEE_S, product_id: TEE, name: "S", option1: "S", price_cents: tee }),
      variant({ id: TEE_L, product_id: TEE, name: "L", option1: "L", price_cents: opts.teeLCents ?? tee, position: 1 }),
      variant({ id: MUGV, product_id: MUG, name: "Default", price_cents: opts.mugCents ?? 2000 }),
      variant({ id: CAPV, product_id: CAP, name: "Default", price_cents: 1500 }),
    ],
    product_options: [{ product_id: TEE, position: 1, name: "Size", values: ["S", "L"] }],
    commerce_settings: [{ creator_id: SHOP, default_location_id: STUDIO, unit_system: "metric", returns_enabled: true, return_window_days: 30, tax_mode: "none", low_stock_default: 5, low_stock_alerts: true }],
    inventory_locations: [{ id: STUDIO, creator_id: SHOP, name: "Studio", kind: "home", country: "RO", city: "Cluj", address_line1: "Str. Lunga 1", postal_code: "400001", active: true, fulfills_orders: true, holds_inventory: true, priority: 0, forwarding: "none", pickup_enabled: false }],
    inventory_levels: [],
    shipping_profiles: [{ id: "general", creator_id: SHOP, name: "General", is_default: true, created_at: "2026-01-01" }],
    shipping_zones: [{ id: "z-ro", creator_id: SHOP, profile_id: "general", name: "Romania", countries: ["RO"], regions: [], rest_of_world: false }],
    shipping_rates: [rate({ id: "r-ro", zone_id: "z-ro", name: "Standard", kind: "flat", price_cents: 0 })],
    shipping_packages: [],
    store_settings: [{ creator_id: SHOP, currency: opts.currency ?? "USD", default_country: "RO" }],
    coupons: [{ id: "c1", code: "SAVE10", creator_id: SHOP, discount_type: "percentage", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, min_purchase_cents: null }],
    store_offers: (opts.offers ?? []).map((o, i) => offerRow(o, i)),
    product_collections: opts.collections ? [{ id: COLL, creator_id: SHOP, title: "Tees", kind: "manual", rules: [], match: "all" }] : [],
    product_collection_items: opts.collections ? [{ collection_id: COLL, product_id: TEE }] : [],
    creators: [{ id: SHOP, display_name: "Shop", stripe_account_id: null, charges_enabled: false }],
    ...(opts.extra ?? {}),
  })
}

async function main() {
  const { shippedQuote } = await import("../lib/checkout/site-quote-server")
  const { priceCheckout, readItems } = await import("../lib/physical/checkout-pricing-server")
  const quote = async (db: ReturnType<typeof shopDb>, items: unknown[], extra: Record<string, unknown> = {}) => {
    const a = await shippedQuote(db, SHOP, { items, country: "RO", ...extra }, null)
    if (a.ok === false) throw new Error((a as { error: string }).error)
    return (a as { quote: Awaited<ReturnType<typeof shippedQuote>> extends infer R ? R extends { quote: infer Q } ? Q : never : never }).quote
  }
  const goods = (q: { totals: { itemsSubtotalCents: number; discountCents: number } }) => q.totals.itemsSubtotalCents - q.totals.discountCents

  section("THE FORMULA: what the theme shows (tierTotals) is what the checkout charges (applyOffers), to the cent")
  {
    const t21 = tier(2, 1)
    const t = tierTotals(3600, t21)
    check("2 + 1 free at $36.00: total $72.00, compare $108.00, $24.00 a unit, saving $36.00", t.totalCents === 7200 && t.compareCents === 10800 && t.unitPriceCents === 2400 && t.savingCents === 3600, t)
    check("percent: round(price * (100 - percent) / 100) * paid, half up (3650 at 15% is 3102.5, so 3103 a unit)", percentUnit(3650, 15) === 3103 && tierTotals(3650, tier(3, 0, "percent", 15)).totalCents === 3103 * 3)
    check("amount: per block, never below 0", tierTotals(1000, tier(2, 0, "amount", 500)).totalCents === 1500 && tierTotals(1000, tier(2, 0, "amount", 99_999)).totalCents === 0)
    check("compare: price * (paid + free); a plain tier with a compare at price: compare_at * paid", tierTotals(3600, tier(2, 1)).compareCents === 10800 && tierTotals(3600, tier(2), 4500).compareCents === 9000 && tierTotals(3600, tier(2, 0, "percent", 10), 4500).compareCents === 7200)

    /* Every tier, every variant price: a cart of exactly one block costs what the theme said. */
    const tiers = [tier(1), tier(2, 1), tier(3, 0, "percent", 15), tier(4, 1, "percent", 10), tier(5, 0, "amount", 777), tier(6, 2, "amount", 1234)]
    const prices = [3600, 4000, 3650, 1, 999, 4999, 125_000]
    const mismatches: unknown[] = []
    for (const price of prices) {
      for (const [i, tr] of tiers.entries()) {
        if (i === 0) continue
        /* Only this tier and none bigger, so the block is this tier's. */
        const offer = breakOffer([tr])
        const units = tr.quantity + tr.freeQuantity
        const r = applyOffers([ln(TEE, price, units)], [offer], { now: NOW })
        const charged = price * units - r.discounts[0]
        const shown = tierTotals(price, tr)
        if (charged !== shown.totalCents) mismatches.push({ price, tier: tr, charged, shown: shown.totalCents })
      }
    }
    check(`the read endpoint's numbers and the checkout's agree for ${prices.length} prices × ${tiers.length - 1} tiers`, mismatches.length === 0, mismatches.slice(0, 3))
    check("  yen (no minor units): ¥3600, 2 + 1 free, charges ¥7200 like any other currency", 3600 * 3 - applyOffers([ln(TEE, 3600, 3)], [breakOffer([tier(2, 1)])], { now: NOW }).discounts[0] === 7200)
    const lei = applyOffers([ln(TEE, 4999, 3)], [breakOffer([tier(3, 0, "percent", 15)])], { now: NOW })
    check("  lei: 49.99 lei, 3 at 15% off: round(4999 * 85 / 100) = 4249 a unit, 127.47 lei for three", 4999 * 3 - lei.discounts[0] === 12747 && tierTotals(4999, tier(3, 0, "percent", 15)).totalCents === 12747, lei)
  }

  section("THE SPEC'S CARTS")
  {
    const r3 = applyOffers([ln(TEE, 3600, 3)], [breakOffer([tier(2, 1)])], { now: NOW })
    check("3 units of a product whose offer is 2 + 1 free at $36.00 charge $72.00", 10800 - r3.discounts[0] === 7200, r3)
    const r5 = applyOffers([ln(TEE, 3600, 5)], [breakOffer([tier(2, 1), tier(3, 2)])], { now: NOW })
    check("5 units with tiers 2+1 and 3+2 charge $108.00", 18000 - r5.discounts[0] === 10800, r5)
    check("  one saving line, named by the tier", r5.applied.length === 1 && r5.applied[0].title === "Buy 3 get 2 free" && r5.applied[0].savedCents === 7200 && r5.applied[0].tier === 1, r5.applied)

    section("THE LEFTOVER RULE: the largest tier that fits, again and again, then the next one down; the rest at full price")
    const tiers = [tier(2, 1), tier(3, 2)]
    check("8 units: 3+2 then 2+1", JSON.stringify(tierBlocks(8, tiers)) === "[1,0]")
    check("7 units: 3+2, and 2 at full price", JSON.stringify(tierBlocks(7, tiers)) === "[1]" && 7 * 3600 - applyOffers([ln(TEE, 3600, 7)], [breakOffer(tiers)], { now: NOW }).discounts[0] === 3 * 3600 + 2 * 3600)
    check("10 units: 3+2 twice", JSON.stringify(tierBlocks(10, tiers)) === "[1,1]")
    check("2 units: no tier fits, full price", tierBlocks(2, tiers).length === 0 && applyOffers([ln(TEE, 3600, 2)], [breakOffer(tiers)], { now: NOW }).discounts[0] === 0)
    const mixed = applyOffers([ln(TEE, 2000, 4), ln(TEE, 3000, 2)], [breakOffer([tier(2, 1)])], { now: NOW })
    const mixedTiers = [tier(2, 1)]
    check("every unit of the product counts, over variants and lines: 6 units are two 2 + 1 blocks", tierBlocks(6, mixedTiers).length === 2 && sum(mixed.discounts) === 4000, mixed)
    check("  the free units are the cheapest ones (two at $20.00, not $30.00)", mixed.discounts[0] === 4000 && mixed.discounts[1] === 0, mixed.discounts)
    const free = breakSavings([{ line: 0, cents: 4000 }, { line: 0, cents: 4000 }, { line: 1, cents: 3000 }], mixedTiers)
    check("  a $40, $40, $30 cart on 2 + 1: the $30 is free, $80.00 to pay", free[2].saving === 3000 && free[0].saving === 0 && free[1].saving === 0)
  }

  section("ONE OFFER PER UNIT: a bundle and a quantity break on the same unit apply once, the larger")
  {
    /* A quantity break of 2 at 10% off ($3.60 a tee) and a bundle of tee and mug at 50% ($18.00 off a tee). */
    const qb = breakOffer([tier(2, 0, "percent", 10)])
    const big = applyOffers([ln(TEE, 3600, 2), ln(MUG, 2000, 1)], [bundleOffer(), qb], { now: NOW })
    check("the bundle saves more on the tee it takes: that tee gets the bundle only ($18.00, not $18.00 + $3.60)", big.discounts[0] === 1800 + 360 && big.discounts[1] === 1000, big)
    check("  each saving its own line: the bundle and the tier", big.applied.length === 2 && big.applied.find((a) => a.kind === "bundle")?.savedCents === 2800 && big.applied.find((a) => a.kind === "quantity_break")?.savedCents === 360, big.applied)
    check("  the order keeps which offer saved what on each line", JSON.stringify(big.lineOffers[0].map((o) => [o.kind, o.savedCents])) === JSON.stringify([["bundle", 1800], ["quantity_break", 360]]), big.lineOffers)
    const small = applyOffers([ln(TEE, 3600, 2), ln(MUG, 2000, 1)], [bundleOffer({ discountValue: 5 }), qb], { now: NOW })
    check("a 5% bundle saves less on the tee than the break: both tees keep the break, the bundle keeps the mug", small.discounts[0] === 720 && small.discounts[1] === 100, small)
    const free = applyOffers([ln(TEE, 3600, 3), ln(MUG, 2000, 1)], [bundleOffer({ discountValue: 15 }), breakOffer([tier(2, 1)])], { now: NOW })
    check("2 + 1 free and a bundle: the bundle takes a tee the break leaves at full price, the free tee stays free", free.discounts[0] === 3600 + 540 && free.discounts[1] === 300, free)
    const units = (r: ReturnType<typeof applyOffers>, i: number) => r.lineOffers[i].reduce((n, o) => n + o.savedCents, 0)
    check("  never more off a line than the line", units(free, 0) === free.discounts[0] && free.discounts[0] <= 3 * 3600)
    const withCode = stackWithCode([ln(TEE, 3600, 3)], [breakOffer([tier(2, 1)])], (left) => ({ discounts: left.map((c) => Math.round(c / 10)) }), { now: NOW })
    check("a code comes off what is left after the break: 10% of $72.00", withCode.discounts[0] === 3600 && withCode.codeDiscounts[0] === 720, withCode)
    const off = applyOffers([ln(TEE, 3600, 3)], [breakOffer([tier(2, 1)], { active: false })], { now: NOW })
    const later = applyOffers([ln(TEE, 3600, 3)], [breakOffer([tier(2, 1)], { startsAt: "2026-11-01T00:00:00Z" })], { now: NOW })
    check("an offer switched off, or not started, takes nothing", off.discounts[0] === 0 && later.discounts[0] === 0)
    const pwyw = applyOffers([ln(TEE, 3600, 3, { payWhatYouWant: true })], [breakOffer([tier(2, 1)])], { now: NOW })
    check("a pay what you want amount is never discounted", pwyw.discounts[0] === 0)
  }

  section("A COLLECTION'S QUANTITY BREAK: each of its products on its own; others untouched")
  {
    const coll = breakOffer([tier(2, 1)], { productIds: [], triggerCollectionIds: [COLL] })
    const r = applyOffers([ln(TEE, 3600, 3, { collectionIds: [COLL] }), ln(MUG, 2000, 3, { collectionIds: [] })], [coll], { now: NOW })
    check("3 tees in the collection: one free; 3 mugs outside it: nothing", r.discounts[0] === 3600 && r.discounts[1] === 0, r)
    const two = applyOffers([ln(TEE, 3600, 2, { collectionIds: [COLL] }), ln(CAP, 1500, 1, { collectionIds: [COLL] })], [coll], { now: NOW })
    check("  units are counted per product: 2 tees and 1 cap are no block", sum(two.discounts) === 0, two)
    const db = shopDb({ offers: [coll], collections: true })
    const q = await quote(db, [{ productId: TEE, variantId: TEE_S, quantity: 3 }, { productId: MUG, variantId: MUGV, quantity: 3 }])
    check("  at the website's checkout, the collection is read from the database", goods(q) === 7200 + 6000, q.totals)
  }

  section("TIERS: what the admin may save (lib/offers/pricing readTiers, lib/offers readOffer)")
  {
    const bad = (raw: unknown, why: RegExp, name: string) => {
      const r = readTiers(raw)
      check(name, r.ok === false && why.test((r as { error: string }).error), r)
    }
    bad([{ quantity: 0 }], /buy 1 to 99/, "quantity at least 1")
    bad([{ quantity: 2, freeQuantity: 11 }], /free is 0 to 10/, "free 0 to 10")
    bad([{ quantity: 2, discountType: "percent", discountValue: 91 }], /0 to 90/, "percent 0 to 90")
    bad([{ quantity: 2, discountType: "amount", discountValue: -1 }], /amount/, "amount in cents, 0 or more")
    bad([{ quantity: 2, freeQuantity: 1 }, { quantity: 2, freeQuantity: 1 }], /bigger than tier 1/, "tiers strictly increasing")
    bad([{ quantity: 3, freeQuantity: 0, discountType: "percent", discountValue: 10 }, { quantity: 2, freeQuantity: 2 }], /bigger than tier 1/, "  never fewer paid units than the tier before")
    bad(Array.from({ length: 7 }, (_, i) => ({ quantity: i + 1, discountType: "percent", discountValue: 5 })), /up to 6/, "up to six tiers")
    bad([{ quantity: 2 }], /discount or free/, "at least one tier takes something off")
    bad([], /at least one tier/, "at least one tier")
    const ok = readTiers([{ quantity: 2, freeQuantity: 1, label: "  ", badge: "Most popular" }, { quantity: 3, freeQuantity: 2, discountType: "none", label: "Best <b>value</b>" }])
    const tiers = ok.ok === true ? (ok as { tiers: Tier[] }).tiers : []
    check("a valid list: a blank label gets the tier's own words, markup is dropped", tiers.length === 2 && tiers[0].label === "Buy 2 get 1 free" && tiers[0].badge === "Most popular" && tiers[1].label === "Best bvalue/b", tiers)
    const none = readOffer({ kind: "quantity_break", title: "More", tiers: [{ quantity: 2, freeQuantity: 1 }] })
    check("a quantity break needs its product or its collection", none.ok === false && /product or the collection/.test((none as { error: string }).error), none)
    const good = readOffer({ kind: "quantity_break", title: "More", productIds: [TEE, MUG], triggerCollectionIds: [COLL], tiers: [{ quantity: 2, freeQuantity: 1 }], discountType: "percent", discountValue: 50, maxPerOrder: 3 })
    const g = good.ok === true ? (good as { offer: Omit<Offer, "id"> }).offer : null
    check("  one product (a collection only without one), no discount of its own, no limit", !!g && g.productIds.length === 1 && g.triggerCollectionIds?.length === 0 && g.discountType === "none" && g.discountValue === 0 && g.maxPerOrder === null && g.tiers?.length === 1, g)
  }

  section("THE WEBSITE'S CHECKOUT ON A DATABASE: the saving lines, properties, codes and the shown total")
  {
    const offers = [breakOffer([tier(2, 1, "none", 0, "Buy 2 get 1 free", "Most popular"), tier(3, 2)])]
    const db = shopDb({ offers })
    const q3 = await quote(db, [{ productId: TEE, variantId: TEE_S, quantity: 2 }, { productId: TEE, variantId: TEE_L, quantity: 1 }])
    check("3 tees (two sizes) at $36.00: $72.00 at checkout", q3.totals.itemsSubtotalCents === 10800 && goods(q3) === 7200 && q3.totals.totalCents === 7200, q3.totals)
    check("  the summary shows the saving as its own line, named by the tier", JSON.stringify(q3.offers) === JSON.stringify([{ title: "Buy 2 get 1 free", savedCents: 3600 }]) && JSON.stringify(summaryRows(q3).offers) === JSON.stringify([{ title: "Buy 2 get 1 free", cents: 3600 }]) && summaryRows(q3).discount === 0, { offers: q3.offers, rows: summaryRows(q3) })
    const q5 = await quote(db, [{ productId: TEE, variantId: TEE_S, quantity: 5 }])
    check("5 tees: $108.00", goods(q5) === 10800, q5.totals)

    /* What a theme sends on every line an offer adds; the page claimed 90% off. */
    const lies = { _sl_offer: "quantity_break", _sl_offer_id: QB, _sl_group: "g1", _sl_tier: "1", _sl_paid_qty: "1", _sl_free_qty: "2", _sl_discount: "percent:90" }
    const tampered = await quote(db, [{ productId: TEE, variantId: TEE_S, quantity: 3, properties: lies }])
    check("tampered properties (_sl_discount percent:90, 1 paid 2 free) change nothing: still $72.00", goods(tampered) === 7200 && tampered.totals.totalCents === q3.totals.totalCents, tampered.totals)
    const fakeQb = await quote(shopDb(), [{ productId: TEE, variantId: TEE_S, quantity: 3, properties: lies }])
    check("  and a store with no offer at all charges the full $108.00 whatever the line says", goods(fakeQb) === 10800, fakeQb.totals)

    const split = await quote(db, [{ productId: TEE, variantId: TEE_S, quantity: 2, properties: { Engraving: "Ana" } }, { productId: TEE, variantId: TEE_S, quantity: 1, properties: { Engraving: "Bo" } }])
    check("one option with different properties is two lines, each with its own", split.lines.length === 2 && split.lines[0].properties?.Engraving === "Ana" && split.lines[1].properties?.Engraving === "Bo" && split.lines[0].propertiesKey !== split.lines[1].propertiesKey, split.lines)
    check("  and both still count toward the break: $72.00", goods(split) === 7200, split.totals)
    const same = readItems([{ productId: TEE, variantId: TEE_S, quantity: 1, properties: { b: "2", a: "1" } }, { productId: TEE, variantId: TEE_S, quantity: 2, properties: { a: "1", b: "2" } }])
    check("  the same properties in another order are the same line", same.length === 1 && same[0].quantity === 3, same)
    const items = [{ productId: TEE, variantId: TEE_S, quantity: 2, properties: { Engraving: "Ana" } }, { productId: TEE, variantId: TEE_S, quantity: 1, properties: { Engraving: "Bo" } }]
    check("  the page matches each line to its own item", sameLine(items[0], split.lines[0]) && !sameLine(items[1], split.lines[0]) && sameLine(items[1], split.lines[1]))
    const cookie = themeCartAfter([{ k: "a", p: TEE, v: TEE_S, q: 2, props: { Engraving: "Ana" } }, { k: "b", p: TEE, v: TEE_S, q: 1, props: { Engraving: "Bo" } }], [items[0]])
    check("  removing one of them at checkout keeps the other in the theme's cart", cookie.length === 1 && cookie[0].props?.Engraving === "Ana", cookie)

    const coded = await quote(db, [{ productId: TEE, variantId: TEE_S, quantity: 3 }], { couponCode: "SAVE10" })
    check("a code after the break: $72.00 less 10%, $64.80; the code's row is its part only", goods(coded) === 6480 && summaryRows(coded).discount === 720 && summaryRows(coded).offers[0]?.cents === 3600, { totals: coded.totals, rows: summaryRows(coded) })

    /* The theme drew the formula's numbers; the page sends the total it showed. */
    const shown = tierTotals(3600, offers[0].tiers![0]).totalCents
    check("the shown-total check passes when the theme shows the formula's numbers", shown === q3.totals.totalCents && !differsFromShown(shownTotalOf({ cents: shown, currency: "USD" }), q3.totals.totalCents, "USD"))
    check("  and refuses when the browser lies about the price (90% off, $10.80)", differsFromShown(shownTotalOf({ cents: 1080, currency: "USD" }), q3.totals.totalCents, "USD"))

    const priced = await priceCheckout(db, { items: readItems([{ productId: TEE, variantId: TEE_S, quantity: 3, properties: { Engraving: "Ana", _sl_offer_id: QB } }]), shopId: SHOP })
    const line = priced.ok === true ? (priced as { lines: { properties?: Record<string, string>; offers?: { title: string; savedCents: number }[] }[] }).lines[0] : null
    check("a priced line carries its properties and which offer saved what, for the order", line?.properties?.Engraving === "Ana" && line?.offers?.[0]?.title === "Buy 2 get 1 free" && line?.offers?.[0]?.savedCents === 3600, line)

    const lei = await quote(shopDb({ offers: [breakOffer([tier(3, 0, "percent", 15)])], currency: "RON", teeCents: 4999 }), [{ productId: TEE, variantId: TEE_S, quantity: 3 }])
    check("a store in lei: 3 at 15% off 49.99 lei is 127.47 lei at checkout, as the formula says", goods(lei) === 12747 && tierTotals(4999, tier(3, 0, "percent", 15)).totalCents === 12747, lei.totals)
    const yen = await quote(shopDb({ offers: [breakOffer([tier(2, 1)])], currency: "JPY", teeCents: 3600 }), [{ productId: TEE, variantId: TEE_S, quantity: 3 }])
    check("a store in yen: ¥3600, 2 + 1 free, ¥7200", goods(yen) === 7200, yen.totals)
  }

  section("A CART LINE WITH PROPERTIES REACHES THE ORDER LINE")
  {
    const { startCheckout } = await import("../lib/physical/checkout-server")
    const { DEFAULT_CHECKOUT } = await import("../lib/store/checkout-config")
    const db = shopDb({ offers: [breakOffer([tier(2, 1)])] })
    let answer: unknown = null
    try {
      answer = await startCheckout(db as never, {
        shopId: SHOP,
        items: [{ productId: TEE, variantId: TEE_S, quantity: 3, properties: { Engraving: "Ana", _sl_offer_id: QB, _sl_group: "g7" } }],
        couponCode: null,
        email: "ana@example.com",
        name: "Ana Pop",
        phone: "+40722000000",
        address: { name: "Ana Pop", line1: "Str. Lunga 2", city: "Cluj", postalCode: "400001", country: "RO", phone: "+40722000000" },
        deliveryOptionId: undefined,
        clientKey: "af-test-client-key-1",
        origin: null,
        attribution: null,
        buyerId: null,
        platformOrigin: "https://storelib.test",
        backUrl: "https://shop.test/cart",
        config: { ...DEFAULT_CHECKOUT, cashOnDelivery: true, codFeeCents: 0 },
        cashOnDelivery: true,
      })
    } catch (e) {
      answer = { threw: String(e) }
    }
    const inserted = db.log.filter((l) => l.op === "insert")
    const co = inserted.find((l) => l.table === "commerce_checkouts")?.payload as { lines?: { properties?: Record<string, string>; offers?: { title: string; saved_cents: number; offer_id: string }[]; discount_cents: number }[]; total_cents?: number } | undefined
    check("the checkout keeps the line with its properties and the offer that saved on it", co?.lines?.[0]?.properties?.Engraving === "Ana" && co?.lines?.[0]?.properties?._sl_group === "g7" && co?.lines?.[0]?.offers?.[0]?.title === "Buy 2 get 1 free" && co?.lines?.[0]?.offers?.[0]?.saved_cents === 3600 && co?.total_cents === 7200, { co, answer })
    const order = inserted.find((l) => l.table === "orders")?.payload as { product_snapshot?: { properties?: Record<string, string>; offers?: unknown[] } } | undefined
    check("  the order line (orders.product_snapshot) has them too", order?.product_snapshot?.properties?.Engraving === "Ana" && Array.isArray(order?.product_snapshot?.offers), { order, answer, tables: inserted.map((l) => l.table) })
  }

  section("ALL OF IT OR NONE OF IT (round 25): a cart that lost a line since is refused, never charged for the rest")
  {
    const { startCheckout } = await import("../lib/physical/checkout-server")
    const { DEFAULT_CHECKOUT } = await import("../lib/store/checkout-config")
    const start = async (db: ReturnType<typeof shopDb>, items: unknown[], key: string) => {
      try {
        return await startCheckout(db as never, {
          shopId: SHOP, items, couponCode: null, email: "ana@example.com", name: "Ana Pop", phone: "+40722000000",
          address: { name: "Ana Pop", line1: "Str. Lunga 2", city: "Cluj", postalCode: "400001", country: "RO", phone: "+40722000000" },
          deliveryOptionId: undefined, clientKey: key, origin: null, attribution: null, buyerId: null, platformOrigin: "https://storelib.test",
          backUrl: "https://shop.test/cart", config: { ...DEFAULT_CHECKOUT, cashOnDelivery: true, codFeeCents: 0 }, cashOnDelivery: true,
        })
      } catch (e) {
        return { threw: String(e) }
      }
    }
    /* A bundle of the tee and the mug, the mug unpublished since the cart was made. */
    const gone = shopDb({ offers: [bundleOffer()], draft: [MUG] })
    const r = (await start(gone, [{ productId: TEE, variantId: TEE_S, quantity: 1 }, { productId: MUG, variantId: MUGV, quantity: 1 }], "af-partial-1")) as { ok?: boolean; status?: number; error?: string }
    const wrote = gone.log.filter((l) => l.op === "insert" && (l.table === "commerce_checkouts" || l.table === "orders")).length
    /* Named as pricing names it: an unpublished product's own title is not said (it may be a draft's). */
    check("a bundle whose mug was unpublished: refused, nothing written, the buyer told to remove it", r.ok === false && r.status === 409 && /no longer on sale can't be bought right now\. Remove it/.test(r.error ?? "") && wrote === 0, { r, wrote })
    /* An option that is no longer sold. */
    const db2 = shopDb({ offers: [] })
    const r2 = (await start(db2, [{ productId: TEE, variantId: TEE_S, quantity: 1 }, { productId: CAP, variantId: "00000000-0000-4000-8000-00000000dead", quantity: 1 }], "af-partial-2")) as { ok?: boolean; status?: number; error?: string }
    check("a line whose option is no longer sold: refused too, the rest not charged", r2.ok === false && r2.status === 409 && /Cap/.test(r2.error ?? ""), r2)
    /* The same bundle whole is taken. */
    const whole = shopDb({ offers: [bundleOffer()] })
    const r3 = (await start(whole, [{ productId: TEE, variantId: TEE_S, quantity: 1 }, { productId: MUG, variantId: MUGV, quantity: 1 }], "af-partial-3")) as { ok?: boolean }
    check("  and the whole bundle goes through", r3.ok === true && whole.log.some((l) => l.op === "insert" && l.table === "commerce_checkouts"), r3)
    const site = readFileSync(join(process.cwd(), "app/api/checkout/site/route.ts"), "utf8")
    check("a payment with no total shown is asked to price again, so nothing is charged unseen", /if \(!shownTotalOf\(body\.shownTotal\)\) return json\(\{ error: "Refresh the page and try again\.", code: TOTAL_CHANGED \}, 409\)/.test(site))
  }

  section("THE CHECKOUT'S ITEMS: [productId, variantId, quantity, properties?], old links read as before")
  {
    const enc = (rows: unknown[]) => Buffer.from(JSON.stringify(rows)).toString("base64url")
    const old = decodeItems(enc([[TEE, TEE_S, 2]]))
    check("the three element form", old.length === 1 && old[0].quantity === 2 && old[0].properties === undefined && old[0].customPriceCents === undefined, old)
    const four = decodeItems(enc([[TEE, TEE_S, 1, { Engraving: "Ana" }]]))
    check("the four element form: properties fourth", four[0]?.properties?.Engraving === "Ana" && four[0]?.customPriceCents === undefined, four)
    const before = decodeItems(enc([[TEE, "", 1, "", { Size: "XL" }]]))
    check("the form written before this: an empty amount, then properties", before[0]?.properties?.Size === "XL" && before[0]?.customPriceCents === undefined, before)
    const pwyw = decodeItems(enc([[TEE, "", 1, 700, { Size: "XL" }]]))
    check("an amount and properties together", pwyw[0]?.customPriceCents === 700 && pwyw[0]?.properties?.Size === "XL")
    const round = JSON.parse(Buffer.from(encodeItems([{ productId: TEE, variantId: TEE_S, quantity: 1, properties: { a: "1" } }]), "base64url").toString())
    check("written as the four element form", Array.isArray(round[0]) && round[0].length === 4 && round[0][3].a === "1", round)
    const props = lineProperties(Object.fromEntries([...Array.from({ length: 25 }, (_, i) => [`k${i}`, "v"]), ["n".repeat(80), "x".repeat(900)]]))
    check("properties are held: 20 names, a name to 64, a value to 500, strings only", Object.keys(props ?? {}).length === 20 && Object.keys(lineProperties({ ["n".repeat(80)]: "x".repeat(900) }) ?? {})[0].length === 64 && Object.values(lineProperties({ a: "x".repeat(900) }) ?? {})[0].length === 500 && lineProperties({ a: { b: 1 } }) === undefined && lineProperties({ a: "" }) === undefined)
    check("  the buyer never sees a name starting with _", JSON.stringify(buyerProperties({ Engraving: "Ana", _sl_offer_id: "x" })) === '[["Engraving","Ana"]]')
    check("  one key for the same properties in any order", propertiesKey({ a: "1", b: "2" }) === propertiesKey({ b: "2", a: "1" }) && propertiesKey(undefined) === "")
  }

  section("GET /api/offers AND /api/offers/quantity-breaks")
  {
    const { productOffers } = await import("../lib/offers/offers-public")
    const offers = [breakOffer([tier(2, 1, "none", 0, "Buy 2 get 1 free", "Most popular"), tier(4, 0, "percent", 15), tier(6, 1, "amount", 999)]), bundleOffer({ discountValue: 15 })]
    check("tiers that do not grow are not stored as tiers at all (a 2+1 then a 3)", readTiers([tier(2, 1), tier(3)]).ok === false)
    const db = shopDb({ offers, teeLCents: 4000 })
    const all = await productOffers(db, TEE, { now: NOW })
    const qb = all.quantityBreaks[0]
    check("one call: bundles, quantity breaks and checkout offers", all.bundles.length === 1 && all.quantityBreaks.length === 1 && Array.isArray(all.checkoutOffers), all)
    check("  the spec's shape, priced at the default variant ($36.00)", qb?.offerId === QB && qb?.productId === TEE && qb?.tiers[0].label === "Buy 2 get 1 free" && qb?.tiers[0].badge === "Most popular" && qb?.tiers[0].unitPriceCents === 2400 && qb?.tiers[0].totalCents === 7200 && qb?.tiers[0].compareCents === 10800, qb)
    check("  nothing of the store's own: no limits, minimums, triggers, placements or store id", !/creator_id|creatorId|max_per_order|maxPerOrder|minSubtotal|triggerIds|placements|combinesWithCodes/.test(JSON.stringify(all)))
    /* The theme works another variant's numbers out with the same formula; the checkout charges them. */
    for (const [t, i] of qb.tiers.map((t, i) => [t, i] as const)) {
      const units = t.quantity + t.freeQuantity
      const q = await quote(shopDb({ offers: [breakOffer([offers[0].tiers![i]])], teeLCents: 4000 }), [{ productId: TEE, variantId: TEE_L, quantity: units }])
      check(`  tier ${i + 1} on the $40.00 variant: the theme's ${tierTotals(4000, t).totalCents} is the checkout's ${goods(q)}`, tierTotals(4000, t).totalCents === goods(q), q.totals)
    }
    const offDb = shopDb({ offers: [breakOffer([tier(2, 1)], { active: false })] })
    check("an offer switched off is not listed", (await productOffers(offDb, TEE, { now: NOW })).quantityBreaks.length === 0)
    const draft = shopDb({ offers })
    ;(draft.tables.products as Record<string, unknown>[]).forEach((p) => (p.status = "draft"))
    check("a product that is not published lists nothing", JSON.stringify(await productOffers(draft, TEE, { now: NOW })) === JSON.stringify({ bundles: [], quantityBreaks: [], checkoutOffers: [] }))
    check("  a product id that is not an id lists nothing, without a read", JSON.stringify(await productOffers(db, "../../etc", { now: NOW })) === JSON.stringify({ bundles: [], quantityBreaks: [], checkoutOffers: [] }))
    const coll = await productOffers(shopDb({ offers: [breakOffer([tier(2, 1)], { productIds: [], triggerCollectionIds: [COLL] })], collections: true }), TEE, { now: NOW })
    const collMug = await productOffers(shopDb({ offers: [breakOffer([tier(2, 1)], { productIds: [], triggerCollectionIds: [COLL] })], collections: true }), MUG, { now: NOW })
    check("a collection's quantity break is listed for a product in it, not for one outside", coll.quantityBreaks.length === 1 && collMug.quantityBreaks.length === 0)
    const routes = read("app/api/offers/route.ts") + read("app/api/offers/quantity-breaks/route.ts") + read("app/api/offers/bundles/route.ts")
    check("the three routes read the one module and are cached a minute, like the bundles endpoint", (routes.match(/productOffers\(/g) ?? []).length === 3 && (routes.match(/headers: OFFERS_CACHE/g) ?? []).length === 3 && /max-age=60/.test(read("lib/offers/offers-public.ts")))
  }

  section("THE ADMIN: saving one, part 304, the Sold count, the export")
  {
    const { saveOffer, soldThrough } = await import("../lib/offers/offers-server")
    const read304 = readOffer({ kind: "quantity_break", title: "More", productIds: [TEE], tiers: [{ quantity: 2, freeQuantity: 1 }] })
    const offer = (read304 as { offer: Omit<Offer, "id"> }).offer
    const db = shopDb()
    const saved = await saveOffer(db, SHOP, null, offer)
    const row = db.log.find((l) => l.table === "store_offers" && l.op === "insert")?.payload as Record<string, unknown> | undefined
    check("a quantity break is saved with its tiers, for the store's own product", saved.ok === true && row?.kind === "quantity_break" && Array.isArray(row?.tiers) && (row?.tiers as unknown[]).length === 1 && row?.creator_id === SHOP, { saved, row })
    const notMine = await saveOffer(shopDb(), SHOP, null, { ...offer, productIds: ["af000000-0000-4000-8000-0000000000ff"] })
    check("  never another store's product", notMine.ok === false && /isn't in your store/.test((notMine as { error: string }).error))
    /* A database before part 304: the tiers column is not there. */
    const before = shopDb()
    const from = before.from.bind(before)
    ;(before as { from: unknown }).from = (table: string) => {
      const q = from(table)
      if (table !== "store_offers") return q
      const select = q.select.bind(q)
      ;(q as { select: unknown }).select = (cols: string, ...rest: unknown[]) => (/\btiers\b/.test(cols) ? { eq: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: "42703", message: "column store_offers.tiers does not exist" } }) }) }) }) } : select(cols, ...(rest as [])))
      return q
    }
    const refused = await saveOffer(before, SHOP, null, offer)
    check("  before part 304 has run: a plain message naming the part, nothing written", refused.ok === false && /SQL part 304/.test((refused as { error: string }).error) && !before.log.some((l) => l.op === "insert"), refused)
    const bundleBefore = await saveOffer(before, SHOP, null, { ...(readOffer({ kind: "bundle", title: "Set", productIds: [TEE, MUG], discountType: "percent", discountValue: 10 }) as { offer: Omit<Offer, "id"> }).offer })
    check("  and a bundle still saves there, as before", bundleBefore.ok === true, bundleBefore)

    const orders = shopDb({ extra: { orders: [
      { id: "o1", creator_id: SHOP, status: "completed", quantity: 3, created_at: "2026-10-20T00:00:00Z", product_snapshot: { offers: [{ offer_id: QB, title: "Buy 2 get 1 free", saved_cents: 3600 }], properties: { _sl_offer_id: QB } } },
      { id: "o2", creator_id: SHOP, status: "completed", quantity: 2, created_at: "2026-10-21T00:00:00Z", product_snapshot: { properties: { _sl_offer_id: BUNDLE, _sl_group: "g1" } } },
      { id: "o3", creator_id: SHOP, status: "refunded", quantity: 5, created_at: "2026-10-21T00:00:00Z", product_snapshot: { properties: { _sl_offer_id: QB } } },
      { id: "o4", creator_id: "someone-else", status: "completed", quantity: 9, created_at: "2026-10-21T00:00:00Z", product_snapshot: { properties: { _sl_offer_id: QB } } },
    ] } })
    const sold = await soldThrough(orders, SHOP, [QB, BUNDLE])
    check("Sold: units of paid lines an offer saved on or a theme added through it, each line once, the store's own only", sold[QB] === 3 && sold[BUNDLE] === 2, sold)
    const area = read("app/app/offers/offers-client.tsx")
    check("  the list shows it beside each offer", /data-offer-sold=/.test(area) && /\{n\} sold/.test(area))
    const exp = read("app/api/physical/orders/export/route.ts")
    check("the orders export ends with each line's properties and offers", /"Buyer reference", "Properties", "Offers"\]/.test(exp) && /propertiesText\(l\.properties\), offersText\(l\.offers\)\]/.test(exp))
    check("the store's edits stay the owner's (or their team's): shopCaller on every write", /const c = await shopCaller\("marketing"(?:, \{ read: true \})?\)/.test(read("app/api/store/offers/route.ts")) /* Round 40: a team member reaches offers with Marketing. */)
    const draft = read("app/app/offers/offer-draft.ts")
    check("the editor checks each tier where it is typed, with the server's limits", /export function tierProblems/.test(draft) && /MAX_TIER_QUANTITY/.test(draft) && /MAX_FREE_QUANTITY/.test(draft))
  }

  section("THE THEME: offers in Liquid, properties, discount codes from the cart")
  {
    const { productObject, cartObject } = await import("../lib/storelib-theme/compat/objects")
    const { Ctx, renderString } = await import("../lib/storelib-theme/compat/runtime")
    const { compatFilter } = await import("../lib/storelib-theme/compat/filters")
    const { themeCustomer } = await import("../lib/storelib-theme/compat/account")
    const { productOffers } = await import("../lib/offers/offers-public")
    const json = await productOffers(shopDb({ offers: [breakOffer([tier(2, 1, "none", 0, "Buy 2 get 1 free", "Most popular")])] }), TEE, { now: NOW })
    const product = productObject({ id: TEE, settings: { title: "Tee", slug: "tee", url: "/products/tee", price: "$36.00", available: true, variants: [], storelib_offers: json } })
    const env = { snippet: () => null, filter: (n: string) => compatFilter(n) }
    const liquid = (src: string, g: Record<string, unknown>) => renderString(src, new Ctx(g, env), { lax: true })
    check("product.metafields.storelib.offers.value is the same JSON as GET /api/offers", JSON.stringify((((product.metafields as Record<string, Record<string, Record<string, unknown>>>).storelib.offers) ?? {}).value) === JSON.stringify(json))
    const drawn = liquid("{% assign o = product.metafields.storelib.offers.value %}{% for b in o.quantityBreaks %}{% for t in b.tiers %}[{{ t.label }}|{{ t.badge }}|{{ t.totalCents | money }}]{% endfor %}{% endfor %}", { product, shop: { money_format: "${{amount}}" } })
    check("  a theme draws the tiers server side", /\[Buy 2 get 1 free\|Most popular\|\$72\.00\]/.test(drawn), drawn)
    const cart = cartObject([{ key: "k1", productId: TEE, variantId: null, quantity: 2, product, properties: { Engraving: "Ana", _sl_group: "g1" } }], "USD")
    const items = liquid("{% for item in cart.items %}{% for p in item.properties %}{% unless p.first contains '_' %}<{{ p.first }}={{ p.last }}>{% endunless %}{% endfor %}{% endfor %}", { cart })
    check("cart.items[].properties, Shopify's shape", items === "<Engraving=Ana>", items)
    const customer = themeCustomer({ name: "Ana Pop", first_name: "Ana", email: "a@x.test", orders_count: 1, orders: [{ id: "o1", number: "1", date: "Oct 25, 2026", status: "Confirmed", state: "open", total: "$72.00", items: [{ title: "Tee", image: "", url: "/products/tee", variant: "S", properties: { Engraving: "Ana" } }], item_count: 1, action_label: "View order", action_url: "/x" }] })
    const lineItem = liquid("{% for o in customer.orders %}{% for li in o.line_items %}{% for p in li.properties %}{{ p.first }}: {{ p.last }}{% endfor %}{% endfor %}{% endfor %}", { customer })
    check("line_item.properties on the account's orders", lineItem === "Engraving: Ana", lineItem)
    check("  the account reads them from the order line", /product_snapshot"/.test(read("lib/site-accounts/account-data.ts").match(/const ORDER_COLUMNS = "[^"]+"/)?.[0] ?? "") && /properties: propsOf\(r\)/.test(read("lib/site-accounts/account-data.ts")))
    check("the live product page reads the offers beside its facts, never failing the page", /productOffers\(admin, card\.id\)\)\.catch\(\(\) => null\)/.test(read("lib/website-builder/compat-site.ts")) && /storelib_offers: offers/.test(read("lib/website-builder/compat-site.ts")))

    /* /cart/update.js `discount`, kept on the cart and carried to checkout. */
    const { answer, readCartCookie, writeCartCookie, heldCodes } = await import("../lib/storelib-theme/compat/site")
    const { CompatTheme, wrapCompatTemplate } = await import("../lib/storelib-theme/compat/theme")
    const { compatCartPricing } = await import("../lib/storelib-theme/compat/cart-pricing-server")
    const sectionFile = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
    const theme = new CompatTheme({ "layout/theme.storelib": wrapCompatTemplate("<html><body>{{ content_for_layout }}</body></html>"), "sections/main-cart.storelib": sectionFile("main-cart", "<p>{{ cart.total_price | money }}</p>"), "templates/cart.json": JSON.stringify({ sections: { main: { type: "main-cart" } }, order: ["main"] }) }, {}, { assetUrl: (n) => `/a/${n}` })
    const db = shopDb({ offers: [breakOffer([tier(2, 1)])] })
    const site = {
      creatorId: SHOP,
      theme,
      pages: { cart: [{ id: "main", type: "main-cart" }] },
      products: [{ id: TEE, settings: { title: "Tee", price: "$36.00", image: "", url: "/products/tee", slug: "tee", kind: "physical", available: true, variants: [{ id: TEE_S, name: "S", price: "", available: true }, { id: TEE_L, name: "L", price: "", available: true }], options: [{ name: "Size", values: ["S", "L"] }] } }],
      collections: [],
      menus: {},
      shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" },
      host: "shop.test",
      pricing: compatCartPricing({ creatorId: SHOP, storeCurrency: "USD", market: null, db, quote: (d, id, body) => shippedQuote(d, id, body, null) }),
    } as never
    const state = { cart: [] as never[], note: "", attributes: {} as Record<string, string>, discount: "", codes: [] as string[] }
    const ask = async (method: string, url: string, body: Record<string, unknown> | null = null, ajax = true) => {
      const u = new URL(url, "https://shop.test")
      const out = await answer(site, { method, path: u.pathname, query: u.searchParams, body, cart: state.cart, note: state.note, attributes: state.attributes, discountCode: state.discount, discountCodes: state.codes, ajax, referer: "/" })
      if (out.cart) {
        /* Through the cookie and back, as the route writes it. */
        const kept = readCartCookie(writeCartCookie(out.cart, out.note ?? "", out.attributes ?? state.attributes, out.discountCode ?? state.discount, out.discountCodes ?? state.codes))
        Object.assign(state, { cart: kept.cart, note: kept.note, attributes: kept.attributes, discount: kept.discount, codes: kept.codes })
      }
      return out
    }
    await ask("POST", "/cart/add.js", { id: TEE_S, quantity: 3, properties: { _sl_offer: "quantity_break", _sl_offer_id: QB, _sl_discount: "percent:90" } })
    const js0 = JSON.parse(String((await ask("GET", "/cart.js")).body))
    check("/cart.js returns the line's properties", js0.items[0]?.properties?._sl_offer_id === QB, js0.items?.[0]?.properties)
    const upd = JSON.parse(String((await ask("POST", "/cart/update.js", { discount: "save10,NOPE" })).body))
    check("/cart/update.js `discount` (comma separated): each code with whether it applies, an unknown one false and no error", JSON.stringify(upd.discount_codes) === JSON.stringify([{ code: "SAVE10", applicable: true }, { code: "NOPE", applicable: false }]), upd.discount_codes)
    const js = JSON.parse(String((await ask("GET", "/cart.js")).body))
    check("  kept on the cart: a later /cart.js says both again", JSON.stringify(js.discount_codes) === JSON.stringify([{ code: "SAVE10", applicable: true }, { code: "NOPE", applicable: false }]) && state.discount === "SAVE10", { codes: js.discount_codes, state })
    const unknown = { ...state }
    const only = JSON.parse(String((await answer(site, { method: "POST", path: "/cart/update.js", query: new URLSearchParams(), body: { discount: "NOPE" }, cart: unknown.cart, note: "", attributes: {}, discountCode: "", discountCodes: [], ajax: true, referer: "/" })).body))
    /* Changed on purpose (round AG): /cart.js takes the store's offers off as checkout will (here the 2 + 1 break, $36.00), so "nothing taken off" is the code's part: no code allocation at all. */
    check("  only an unknown code: applicable false, the code takes nothing off (the break's $36.00 is the offer's)", JSON.stringify(only.discount_codes) === '[{"code":"NOPE","applicable":false}]' && only.total_discount === 3600 && only.cart_level_discount_applications.length === 0 && only.items[0].line_level_discount_allocations.every((a: { discount_application: { type: string } }) => a.discount_application.type === "automatic"), only)
    check("  heldCodes says the cart's own code applies and the rest do not", JSON.stringify(heldCodes(["A", "b"], { code: "B", applicable: true } as never)) === '[{"code":"A","applicable":false},{"code":"B","applicable":true}]')
    const go = await ask("GET", "/checkout", null, false)
    const params = readSiteCheckoutParams(new URL(go.headers?.Location ?? "", "https://shop.test").searchParams)
    check("/cart/update.js with discount reaches checkout: the code arrives filled in", params.couponCode === "SAVE10" && params.items[0]?.properties?._sl_offer_id === QB, { loc: go.headers?.Location, params })
    const charged = await quote(db, params.items, { couponCode: params.couponCode })
    check("  and checkout applies it after the break: $64.80, the theme's 90% note ignored", goods(charged) === 6480 && charged.coupon?.code === "SAVE10", charged.totals)
    check("the cart cookie keeps the asked codes (and leaves them out when it is just the cart's own)", readCartCookie(writeCartCookie([], "", {}, "SAVE10", ["SAVE10", "NOPE"])).codes.join() === "SAVE10,NOPE" && !/"c"/.test(decodeURIComponent(writeCartCookie([], "", {}, "SAVE10", ["SAVE10"]))))
    const many = Array.from({ length: 30 }, (_, i) => ({ k: `k${i}`, p: TEE, v: TEE_S, q: 1, props: { Engraving: "x".repeat(400) } }))
    const long = await answer(site, { method: "GET", path: "/checkout", query: new URLSearchParams(), body: null, cart: many as never, note: "", attributes: {}, discountCode: "SAVE10", ajax: false, referer: "/" })
    const longParams = readSiteCheckoutParams(new URL(long.headers?.Location ?? "", "https://shop.test").searchParams)
    check("a whole cart too long for an address goes to checkout without items, which reads the cookie, code kept", long.status === 303 && longParams.items.length === 0 && longParams.wholeCart && longParams.couponCode === "SAVE10" && (long.headers?.Location ?? "").length < 2000, long.headers?.Location?.slice(0, 200))
    check("  and the checkout page reads the cart from its cookie when the address has none", /if \(items\.length === 0\) \{\n\s+const theme = readCartCookie/.test(read("app/checkout/site/page.tsx")))
  }

  section("EMAILS AND THE ORDER PAGES: each saving its own row; the buyer never sees a theme's notes")
  {
    const { orderConfirmationEmail } = await import("../lib/physical/email-templates")
    const { savingsOf } = await import("../lib/physical/jobs-server")
    const lines = [{ title: "Tee", variant_name: "S", quantity: 3, unit_cents: 3600, discount_cents: 4320, image_url: null, properties: { Engraving: "Ana", _sl_offer_id: QB }, offers: [{ offer_id: QB, title: "Buy 2 get 1 free", saved_cents: 3600 }] }]
    const savings = savingsOf(lines)
    check("the order's lines give each offer's saving by its name", JSON.stringify(savings) === '[{"label":"Buy 2 get 1 free","cents":3600}]', savings)
    const mail = orderConfirmationEmail({ shopName: "Shop", orderNumber: "#1001", buyerFirstName: "Ana", lines: [{ title: "Tee", variantName: "S", quantity: 3, cents: 6480, imageUrl: null, properties: buyerProperties(lines[0].properties) }], totals: { subtotal: 10800, discount: 4320, shipping: 0, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 6480, currency: "USD", savings }, address: null, deliveryName: null, deliveryEstimate: null, statusUrl: "https://shop.test/o", hasDownloads: false })
    check("the confirmation lists the saving on its own row, then the code's part as Discount", /Buy 2 get 1 free/.test(mail.html) && /-\$36\.00/.test(mail.html) && /Discount/.test(mail.html) && /-\$7\.20/.test(mail.html) && /Buy 2 get 1 free: -\$36\.00/.test(mail.text), mail.text)
    check("  the buyer's own words are on the line, a name starting with _ never is", /Engraving: Ana/.test(mail.html) && !/_sl_offer_id/.test(mail.html + mail.text))
    check("the store's order page lists every property and each line's offers", /data-order-line-properties/.test(read("components/physical/order-panel.tsx")) && /data-line-offer=/.test(read("components/physical/order-panel.tsx")) && /offers: offersOfSnapshot\(s\.offers\)/.test(read("lib/physical/orders-server.ts")))
    check("the buyer's order page shows their own words only", /properties: buyerProperties\(l\.properties\)/.test(read("app/checkout/physical/order/[token]/page.tsx")))
    check("the checkout shows each saving on its own row", /data-offer-saving=""/.test(read("app/checkout/site/site-checkout.tsx")))
  }

  section("SQL PART 304")
  {
    const part = read("supabase/sql/run-now/304_store_offers_quantity_breaks.sql")
    check("the migration is the same part", part === read("supabase/migrations/20270201_af1_store_offers_quantity_breaks.sql"))
    check("safe to run again, nothing dropped but checks it replaces", /ADD COLUMN IF NOT EXISTS tiers jsonb NOT NULL DEFAULT '\[\]'::jsonb/.test(part) && /DROP CONSTRAINT IF EXISTS store_offers_shape/.test(part) && !/DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/i.test(part.replace(/REVOKE[^;]+;/g, "")))
    check("the kind and the shapes: quantity_break, one product at most, one to six tiers", /kind IN \('bundle', 'checkout', 'quantity_break'\)/.test(part) && /kind = 'quantity_break' AND cardinality\(product_ids\) <= 1/.test(part) && /jsonb_array_length\(tiers\) <= 6/.test(part))
    check("owner reads, only the server writes, row level security on", /ENABLE ROW LEVEL SECURITY/.test(part) && /c\.user_id = auth\.uid\(\)/.test(part) && /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.store_offers FROM PUBLIC, anon, authenticated/.test(part))
    /* Changed on purpose (round 13): part 305 follows it, so p304 is no longer the last column. */
    check("listed in the README and the check after", /304_store_offers_quantity_breaks\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p304_store_offers_quantity_breaks[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
