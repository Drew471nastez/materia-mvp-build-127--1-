/**
 * Round AG: offers and bundles end to end, everywhere a buyer or a creator
 * sees a number (lib/offers, SQL part 306).
 *
 *   DOWNLOADS     a cart of downloads (the Stripe basket, the website's own
 *                 checkout) keeps each line's offers and properties through
 *                 the payment's metadata onto its order line, as a cart that
 *                 ships does; the receipt, the invoice, the thank you page and
 *                 the admin name each offer, never by the code
 *   CURRENCY      a store's currency change converts a quantity break's
 *                 amount off at the prices' rate and rounding, and Undo puts
 *                 it back (part 306, on a real Postgres when OFFERS_PG_HOST is
 *                 set)
 *   CART.JS       an imported theme's /cart.js, /cart/add.js, /cart/change.js,
 *                 /cart/update.js and the Liquid cart carry the offers as
 *                 Shopify's automatic discounts, to the cent of what checkout
 *                 charges: variants at different prices, a bundle, a 2+1 and
 *                 3+2 break, an upsell, a code, lei and yen, stock, sold out,
 *                 free shipping over an amount on the discounted subtotal
 *   CANVAS        the builder's canvas prices its cart the same way and gets
 *                 product.metafields.storelib.offers
 *   NATIVE        Storelib's own product section draws the tiers by the
 *                 checkout's formula
 *   CREATOR       a cart tried from the offer's editor through applyOffers,
 *                 and what to watch for before saving
 *
 *   npx tsx --conditions=react-server tests/offers-ag.test.ts
 */
import { readFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { applyOffers, type Offer } from "../lib/offers/offers"
import { tierLabel, tierTotals, type Tier } from "../lib/offers/pricing"
import { packExtras, packItems, unpackItems, type PackedItem } from "../lib/checkout/cart-items"
import { convertOrder, offersInMarket, type MarketCharge } from "../lib/markets/checkout-charge"
import { splitSavings, withDiscount } from "../lib/receipts/discount"
import { offersOfSnapshot, savingsOfLines } from "../lib/offers/snapshot"
import { DRAFT_ID, offerWarnings, tryCart } from "../lib/offers/try-cart"
import { ordersCsv } from "../lib/orders/export-csv"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 1200)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sum = (a: number[]) => a.reduce((n, x) => n + x, 0)

const SHOP = "a6000000-0000-4000-8000-000000000001"
const TEE = "a6000000-0000-4000-8000-0000000000a1"
const MUG = "a6000000-0000-4000-8000-0000000000a2"
const CAP = "a6000000-0000-4000-8000-0000000000a3"
const EBOOK = "a6000000-0000-4000-8000-0000000000a4"
const GUIDE = "a6000000-0000-4000-8000-0000000000a5"
const DRAFTP = "a6000000-0000-4000-8000-0000000000a6"
const TEE_S = "a6000000-0000-4000-8000-0000000000b1"
const TEE_L = "a6000000-0000-4000-8000-0000000000b2"
const MUGV = "a6000000-0000-4000-8000-0000000000b3"
const CAPV = "a6000000-0000-4000-8000-0000000000b4"
const STUDIO = "a6000000-0000-4000-8000-0000000000c1"
const QB = "a6000000-0000-4000-8000-0000000000e1"
const BUNDLE = "a6000000-0000-4000-8000-0000000000e2"
const UPSELL = "a6000000-0000-4000-8000-0000000000e3"
const EBUNDLE = "a6000000-0000-4000-8000-0000000000e5"
const NOW = new Date("2026-10-25T12:00:00Z")

const tier = (quantity: number, freeQuantity = 0, discountType: Tier["discountType"] = "none", discountValue = 0, label = "", badge = ""): Tier => ({ quantity, freeQuantity, discountType, discountValue, label: label || tierLabel({ quantity, freeQuantity, discountType, discountValue }), badge })
/* The store of the brief: a quantity break with 2+1 and 3+2 tiers, a bundle, a checkout offer and a code. */
const BREAK = (o: Partial<Offer> = {}): Offer => ({ id: QB, kind: "quantity_break", title: "Buy more, save more", productIds: [TEE], triggerIds: [], discountType: "none", discountValue: 0, active: true, tiers: [tier(2, 1, "none", 0, "Buy 2 get 1 free", "Most popular"), tier(3, 2, "none", 0, "Buy 3 get 2 free")], ...o })
const SET = (o: Partial<Offer> = {}): Offer => ({ id: BUNDLE, kind: "bundle", title: "Mug and cap", productIds: [MUG, CAP], triggerIds: [], discountType: "percent", discountValue: 20, active: true, ...o })
const ADDON = (o: Partial<Offer> = {}): Offer => ({ id: UPSELL, kind: "checkout", title: "Add a cap", productIds: [CAP], triggerIds: [TEE], discountType: "fixed", discountValue: 300, active: true, ...o })

const offerRow = (o: Offer, position = 0) => ({ id: o.id, creator_id: SHOP, kind: o.kind, title: o.title, product_ids: o.productIds, trigger_product_ids: o.triggerIds, discount_type: o.discountType, discount_value: o.discountValue, active: o.active, position, created_at: `2026-10-0${position + 1}T00:00:00Z`, trigger_collection_ids: o.triggerCollectionIds ?? [], placements: ["product", "cart", ...(o.kind === "checkout" ? ["checkout"] : [])], starts_at: o.startsAt ?? null, ends_at: o.endsAt ?? null, combines_with_codes: o.combinesWithCodes !== false, max_per_order: o.maxPerOrder ?? null, min_subtotal_cents: o.minSubtotalCents ?? null, tiers: o.tiers ?? [] })

function shopDb(opts: { offers?: Offer[]; currency?: string; teeCents?: number; teeLCents?: number; stock?: number | null; freeOver?: number | null; teeStatus?: string; extra?: Record<string, Record<string, unknown>[]> } = {}) {
  const tee = opts.teeCents ?? 3600
  const tracked = typeof opts.stock === "number"
  const variant = (v: Record<string, unknown>) => ({ weight_grams: 200, track_inventory: tracked, inventory_policy: tracked ? "deny" : "continue", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null, position: 0, compare_at_price_cents: null, ...v })
  const product = (p: Record<string, unknown>) => ({ creator_id: SHOP, type: "physical", status: "published", thumbnail_url: null, requires_shipping: true, weight_grams: 200, taxable: true, track_inventory: tracked, continue_selling: !tracked, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: null, max_per_order: null, compare_at_cents: null, ...p })
  const rate = (r: Record<string, unknown>) => ({ creator_id: SHOP, active: true, position: 0, tiers: [], min_value: null, max_value: null, free_over_cents: null, min_days: 2, max_days: 4, ...r })
  return fakeDb({
    products: [
      product({ id: TEE, title: "Tee", slug: "tee", price_cents: tee, status: opts.teeStatus ?? "published" }),
      product({ id: MUG, title: "Mug", slug: "mug", price_cents: 2000 }),
      product({ id: CAP, title: "Cap", slug: "cap", price_cents: 1500 }),
      product({ id: EBOOK, title: "Ebook", slug: "ebook", type: "digital", price_cents: 1200, requires_shipping: false }),
      product({ id: GUIDE, title: "Guide", slug: "guide", type: "digital", price_cents: 800, requires_shipping: false }),
      product({ id: DRAFTP, title: "Hoodie", slug: "hoodie", price_cents: 5000, status: "draft" }),
    ],
    product_variants: [
      variant({ id: TEE_S, product_id: TEE, name: "S", option1: "S", price_cents: tee }),
      variant({ id: TEE_L, product_id: TEE, name: "L", option1: "L", price_cents: opts.teeLCents ?? tee, position: 1 }),
      variant({ id: MUGV, product_id: MUG, name: "Default", price_cents: 2000 }),
      variant({ id: CAPV, product_id: CAP, name: "Default", price_cents: 1500 }),
    ],
    product_options: [{ product_id: TEE, position: 1, name: "Size", values: ["S", "L"] }],
    commerce_settings: [{ creator_id: SHOP, default_location_id: STUDIO, unit_system: "metric", returns_enabled: true, return_window_days: 30, tax_mode: "none", low_stock_default: 5, low_stock_alerts: true }],
    inventory_locations: [{ id: STUDIO, creator_id: SHOP, name: "Studio", kind: "home", country: "RO", city: "Cluj", address_line1: "Str. Lunga 1", postal_code: "400001", active: true, fulfills_orders: true, holds_inventory: true, priority: 0, forwarding: "none", pickup_enabled: false }],
    inventory_levels: tracked ? [{ variant_id: TEE_S, location_id: STUDIO, available: opts.stock, on_hand: opts.stock }, { variant_id: TEE_L, location_id: STUDIO, available: 0, on_hand: 0 }, { variant_id: MUGV, location_id: STUDIO, available: 50, on_hand: 50 }, { variant_id: CAPV, location_id: STUDIO, available: 50, on_hand: 50 }] : [],
    shipping_profiles: [{ id: "general", creator_id: SHOP, name: "General", is_default: true, created_at: "2026-01-01" }],
    shipping_zones: [{ id: "z-ro", creator_id: SHOP, profile_id: "general", name: "Romania", countries: ["RO"], regions: [], rest_of_world: false }],
    shipping_rates: [rate({ id: "r-ro", zone_id: "z-ro", name: "Standard", kind: "flat", price_cents: 1500, free_over_cents: opts.freeOver ?? null })],
    shipping_packages: [],
    store_settings: [{ creator_id: SHOP, currency: opts.currency ?? "USD", default_country: "RO" }],
    coupons: [{ id: "c1", code: "SAVE10", creator_id: SHOP, discount_type: "percentage", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, min_purchase_cents: null }],
    store_offers: (opts.offers ?? []).map((o, i) => offerRow(o, i)),
    product_collections: [],
    product_collection_items: [],
    creators: [{ id: SHOP, display_name: "Shop", stripe_account_id: null, charges_enabled: false }],
    orders: [],
    entitlements: [],
    ...(opts.extra ?? {}),
  })
}

async function main() {
  const { shippedQuote } = await import("../lib/checkout/site-quote-server")
  type Quote = Extract<Awaited<ReturnType<typeof shippedQuote>>, { ok: true }>["quote"]
  const quote = async (db: ReturnType<typeof shopDb>, items: unknown[], extra: Record<string, unknown> = {}): Promise<Quote> => {
    const a = await shippedQuote(db, SHOP, { items, country: "RO", ...extra }, null)
    if (a.ok === false) throw new Error((a as { error: string }).error)
    return (a as { quote: Quote }).quote
  }
  const goods = (q: { totals: { itemsSubtotalCents: number; discountCents: number } }) => q.totals.itemsSubtotalCents - q.totals.discountCents

  section("DOWNLOADS: a basket's offers and properties travel with the payment (lib/checkout/cart-items packExtras)")
  {
    const items: PackedItem[] = [
      { productId: EBOOK, variantId: null, quantity: 1, priceCents: 1200, discountCents: 600, offers: [{ offerId: EBUNDLE, title: "Read both", kind: "bundle", savedCents: 600 }], properties: { Name: "Ana", _sl_offer_id: EBUNDLE, _sl_group: "g1" } },
      { productId: GUIDE, variantId: null, quantity: 1, priceCents: 800, discountCents: 500, offers: [{ offerId: EBUNDLE, title: "Read both", kind: "bundle", savedCents: 400 }] },
    ]
    const meta = { ...packItems(items), ...packExtras(items, 10) }
    const back = unpackItems(meta)
    check("each line's offers come back with their names and parts", back[0].offers?.[0]?.title === "Read both" && back[0].offers?.[0]?.savedCents === 600 && back[1].offers?.[0]?.savedCents === 400, back)
    check("  and its properties, the theme's own notes too", back[0].properties?.Name === "Ana" && back[0].properties?._sl_offer_id === EBUNDLE && back[1].properties === undefined, back[0].properties)
    check("  an offer's part never more than the line's discount (the money is the record)", unpackItems({ ...packItems([{ ...items[0], discountCents: 100 }]), ...packExtras([{ ...items[0], discountCents: 100 }], 5) })[0].offers?.[0]?.savedCents === 100)
    check("  every value within Stripe's 500 characters, ASCII only", Object.entries(packExtras([{ ...items[0], properties: { Name: "Zoë ".repeat(120) } }], 10)).every(([, v]) => v.length <= 500 && /^[\x20-\x7e]*$/.test(v)))
    const long = { ...items[0], properties: { Engraving: "x".repeat(480), _sl_group: "y".repeat(480), _sl_block: "z".repeat(480) }, offers: [{ ...items[0].offers![0], title: "T".repeat(120) }] }
    const tight = packExtras([long], 2)
    const tightBack = unpackItems({ ...packItems([long]), ...tight })[0]
    check("no room for everything: the names go first, then the theme's notes; the parts stay", Object.keys(tight).length <= 2 && tightBack.offers?.[0]?.savedCents === 600 && tightBack.offers?.[0]?.title === "" && tightBack.properties?.Engraving?.length === 480 && tightBack.properties?._sl_group === undefined, { keys: Object.keys(tight), tightBack })
    check("no room at all: nothing added, the payment is never refused for it", JSON.stringify(packExtras(items, 0)) === "{}")
    check("a broken or forged record reads as nothing", unpackItems({ ...packItems(items), cart_x0: "{nope" })[0].offers === undefined && unpackItems({ ...packItems(items), cart_x0: JSON.stringify({ o: [[0, "not-an-id", 600, -1, "bundle"]], p: [[0, { "<b>": "" }]] }) })[0].offers === undefined)

    const { lineSnapshot } = await import("../lib/checkout/fulfil-cart-item")
    const snap = lineSnapshot(back[0])
    check("the order line's snapshot has them in a shipped line's shape", JSON.stringify(snap) === JSON.stringify({ properties: { Name: "Ana", _sl_offer_id: EBUNDLE, _sl_group: "g1" }, offers: [{ offer_id: EBUNDLE, title: "Read both", kind: "bundle", saved_cents: 600 }] }), snap)
    check("  and read back by every surface the same way (lib/offers/snapshot)", offersOfSnapshot(snap?.offers)?.[0]?.savedCents === 600 && JSON.stringify(savingsOfLines([{ offers: snap?.offers }, { offers: [{ title: "Read both", saved_cents: 400 }] }])) === '[{"label":"Read both","cents":1000}]')
    check("  a line with neither keeps no snapshot", lineSnapshot({ discountCents: 0 }) === null)

    /* The basket's own pricing, from the database: the bundle of two downloads, a code on top, properties kept. */
    const { priceCart } = await import("../lib/checkout/pricing")
    const db = shopDb({ offers: [{ id: EBUNDLE, kind: "bundle", title: "Read both", productIds: [EBOOK, GUIDE], triggerIds: [], discountType: "percent", discountValue: 50, active: true }] })
    const priced = await priceCart(db, { items: [{ productId: EBOOK, quantity: 1, properties: { Name: "Ana", _sl_offer_id: EBUNDLE } }, { productId: GUIDE, quantity: 1 }], handOff: false })
    const lines = priced.ok === true ? (priced as { lines: { item: PackedItem }[] }).lines : []
    check("priceCart: each download line carries the offer that saved on it and its properties", lines[0]?.item.discountCents === 600 && lines[0]?.item.offers?.[0]?.title === "Read both" && lines[1]?.item.offers?.[0]?.savedCents === 400 && lines[0]?.item.properties?.Name === "Ana", lines.map((l) => l.item))
    const coded = await priceCart(db, { items: [{ productId: EBOOK, quantity: 1 }, { productId: GUIDE, quantity: 1 }], couponCode: "SAVE10", handOff: false })
    const cl = coded.ok === true ? (coded as { lines: { item: PackedItem }[]; offerCents: number; discountCents: number }) : null
    check("  with a code: the offers' parts stay the offers', the code takes 10% of what is left", cl?.offerCents === 1000 && cl?.discountCents === 1100 && cl?.lines[0].item.offers?.[0]?.savedCents === 600, cl)

    /* The order line, written by the fulfilment. */
    const { fulfilCartLine } = await import("../lib/checkout/fulfil-cart-item")
    const odb = fakeDb({ orders: [], products: [] })
    const ctx = { admin: odb, sessionId: "pi_ag1", paymentIntentId: "pi_ag1", creatorId: SHOP, buyerId: null, buyerEmail: "ana@example.com", buyerFirstName: "Ana", buyerLastName: null, receiptTokenFor: (i: number) => `tok-ag1-${i}-abcdefghijklmnop`, sessionFingerprint: null, paymentMethod: "card", cardBrand: null, cardLast4: null, device: { country: null, countryCode: null, deviceType: null, os: null, browser: null }, currency: "usd" }
    const out = await fulfilCartLine(ctx as never, back[0], 0, 0)
    const row = (odb.tables.orders ?? [])[0] as { product_snapshot?: { offers?: { title: string; saved_cents: number }[]; properties?: Record<string, string> }; amount_cents?: number } | undefined
    check("fulfilCartLine writes the order line with its offers and properties (product_snapshot)", out.status === "created" && row?.amount_cents === 600 && row?.product_snapshot?.offers?.[0]?.title === "Read both" && row?.product_snapshot?.offers?.[0]?.saved_cents === 600 && row?.product_snapshot?.properties?.Name === "Ana", row)

    const { nameOffers } = await import("../lib/checkout/fulfil-cart-session")
    const unnamed: PackedItem[] = [{ productId: TEE, variantId: null, quantity: 3, priceCents: 3600, discountCents: 3600, offers: [{ offerId: QB, title: "", kind: "quantity_break", savedCents: 3600, tier: 0 }] }]
    await nameOffers(shopDb({ offers: [BREAK()] }), SHOP, unnamed)
    check("a payment that had no room for the names: read from the store's own offer, by the tier's label", unnamed[0].offers?.[0]?.title === "Buy 2 get 1 free", unnamed[0].offers)

    check("the website checkout packs them into the payment, in the room left, the code's part on its own", /packExtras\(priced\.lines\.map\(\(l\) => l\.item\), STRIPE_METADATA_LIMIT - Object\.keys\(metadata\)\.length\)/.test(read("app/api/checkout/site/route.ts")) && /offersInMarket\(priced\.lines\[i\]\.item\.offers/.test(read("app/api/checkout/site/route.ts")))
    check("  and so does the Stripe basket (app/api/checkout/cart)", /packExtras\(lines\.map\(\(l\) => l\.item\), 50 - Object\.keys\(params\.metadata!\)\.length\)/.test(read("app/api/checkout/cart/route.ts")))
    check("  both fulfilments name what a payment could not", (read("lib/checkout/fulfil-cart-session.ts").match(/await nameOffers\(admin, creatorId, items\)/g) ?? []).length === 2)
  }

  section("DOWNLOADS: the receipt, the invoice, the thank you page and the admin name each offer, never by the code")
  {
    const split = splitSavings(1100, [{ label: "Read both", cents: 600 }, { label: "Read both", cents: 400 }])
    check("the discount as rows: the offer by its name, the rest as the code's", JSON.stringify(split) === '{"rows":[{"label":"Read both","cents":1000}],"rest":100}', split)
    check("  offers never more than the whole discount", JSON.stringify(splitSavings(500, [{ label: "A", cents: 400 }, { label: "B", cents: 400 }])) === '{"rows":[{"label":"A","cents":400},{"label":"B","cents":100}],"rest":0}')
    const view = withDiscount({ subtotalCents: 900, items: [{ subtotalCents: 600 }, { subtotalCents: 300 }] } as never, { discountCents: 1100, discountCode: "SAVE10", lines: [{ amountCents: 1200 }, { amountCents: 800 }], savings: [{ label: "Read both", cents: 1000 }] })
    check("the receipt page gets the savings beside the code's part", (view as { savings?: { label: string; cents: number }[] }).savings?.[0]?.cents === 1000 && (view as { discountCents?: number }).discountCents === 1100, view)
    const receipt = read("app/receipt/[token]/receipt-view.tsx")
    check("  and draws each offer, then Discount (code) for the rest only", /saved\.rows\.map/.test(receipt) && /value=\{`−\$\{money\(saved\.rest\)\}`\}/.test(receipt) && /data-receipt-offers/.test(receipt) && /data-receipt-properties/.test(receipt))
    const inv = read("lib/checkout/invoice.ts")
    check("the invoice PDF: each offer by its name, the code's row its part only", /for \(const s of split\.rows\) row\(s\.label/.test(inv) && /if \(split\.rest > 0\) row\(inv\.discountCode/.test(inv) && /offersOfSnapshot\(r\.product_snapshot\?\.offers\)/.test(inv))
    const thanks = read("app/checkout/site/thanks/[token]/thanks-view.tsx")
    check("the thank you page: a shipped order's savings by name (it said Discount (CODE) for the offers too), a basket's lines with theirs", /saved\?\.rows\.map/.test(thanks) && /saved\.rest > 0/.test(thanks) && /data-line-offers/.test(thanks) && /savings: savingsOfLines\(lines\)/.test(read("app/checkout/site/thanks/[token]/page.tsx")))
    check("the receipt email lists each line's properties and offers under it", /\.\.\.\(i\.offers \?\? \[\]\)\.map\(\(o\) => `\$\{o\.title\} −/.test(read("lib/email.tsx")))
    check("the admin's order: each download line's properties and offers", /data-order-line-properties/.test(read("app/app/orders/order-detail.tsx")) && /offers: offersOfSnapshot\(order\.product_snapshot\?\.offers\)/.test(read("lib/orders/load-rows.ts")))
    const csv = ordersCsv([{ id: "o", number: 1, createdAt: "2026-10-25T10:00:00Z", lines: [{ product: { title: "Tee" }, offers: [{ title: "Buy 2 get 1 free", savedCents: 3600 }] }, { product: { title: "Tee" }, offers: [{ title: "Buy 2 get 1 free", savedCents: 3600 }] }], customerName: "", customerEmail: "", source: null, totalCents: 14400, refundedCents: 0, itemCount: 6, payment: "paid", fulfillment: "fulfilled", delivery: null, currency: "USD" } as never], "UTC", "plain").split("\n")
    check("the orders export: an Offers column, each offer once with what it saved", /"Delivery status","Offers"$/.test(csv[0]) && /"Buy 2 get 1 free 72\.00"$/.test(csv[1]), csv.slice(0, 2))
  }

  section("CART.JS: an imported theme's cart says what checkout charges, Shopify's way")
  {
    const { answer, readCartCookie, writeCartCookie } = await import("../lib/storelib-theme/compat/site")
    const { CompatTheme, wrapCompatTemplate } = await import("../lib/storelib-theme/compat/theme")
    const { compatCartPricing } = await import("../lib/storelib-theme/compat/cart-pricing-server")
    const sectionFile = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
    /* A cart drawer and a cart page the way Dawn draws them: each line's discounts under it, then the totals. */
    const drawer = "{% for item in cart.items %}<li data-k='{{ item.key }}'>{{ item.original_line_price | money }}|{{ item.final_line_price | money }}{% for a in item.line_level_discount_allocations %}<i>{{ a.discount_application.title }} -{{ a.amount | money }}</i>{% endfor %}</li>{% endfor %}<p id=t>{{ cart.total_price | money }}</p><p id=o>{{ cart.original_total_price | money }}</p><p id=d>{{ cart.total_discount | money }}</p>{% for d in cart.cart_level_discount_applications %}<b>{{ d.title }} -{{ d.total_allocated_amount | money }}</b>{% endfor %}"
    const theme = new CompatTheme({ "layout/theme.storelib": wrapCompatTemplate("<html><body>{{ content_for_layout }}</body></html>"), "sections/main-cart.storelib": sectionFile("main-cart", drawer), "templates/cart.json": JSON.stringify({ sections: { main: { type: "main-cart" } }, order: ["main"] }) }, {}, { assetUrl: (n) => `/a/${n}` })
    const card = (id: string, title: string, price: string, variants: { id: string; name: string; price: string; available: boolean }[]) => ({ id, settings: { title, price, image: "", url: `/products/${title.toLowerCase()}`, slug: title.toLowerCase(), kind: "physical", available: true, variants, options: variants.length > 1 ? [{ name: "Size", values: variants.map((v) => v.name) }] : [] } })
    const siteFor = (db: ReturnType<typeof shopDb>, currency = "USD", money = "${{amount}}", prices: { tee?: string; teeL?: string } = {}) =>
      ({
        creatorId: SHOP,
        theme,
        pages: { cart: [{ id: "main", type: "main-cart" }] },
        products: [
          card(TEE, "Tee", prices.tee ?? "$36.00", [{ id: TEE_S, name: "S", price: prices.tee ?? "$36.00", available: true }, { id: TEE_L, name: "L", price: prices.teeL ?? prices.tee ?? "$36.00", available: true }]),
          card(MUG, "Mug", "$20.00", [{ id: MUGV, name: "Default", price: "$20.00", available: true }]),
          card(CAP, "Cap", "$15.00", [{ id: CAPV, name: "Default", price: "$15.00", available: true }]),
        ],
        collections: [],
        menus: {},
        shop: { name: "Shop", currency, moneyFormat: money },
        host: "shop.test",
        pricing: compatCartPricing({ creatorId: SHOP, storeCurrency: currency, market: null, db, quote: (d, id, body) => shippedQuote(d, id, body, null) }),
      }) as never
    const session = (site: unknown) => {
      const state = { cart: [] as never[], note: "", attributes: {} as Record<string, string>, discount: "", codes: [] as string[] }
      const ask = async (method: string, url: string, body: Record<string, unknown> | null = null, ajax = true) => {
        const u = new URL(url, "https://shop.test")
        const out = await answer(site as never, { method, path: u.pathname, query: u.searchParams, body, cart: state.cart, note: state.note, attributes: state.attributes, discountCode: state.discount, discountCodes: state.codes, ajax, referer: "/" })
        if (out.cart) {
          const kept = readCartCookie(writeCartCookie(out.cart, out.note ?? "", out.attributes ?? state.attributes, out.discountCode ?? state.discount, out.discountCodes ?? state.codes))
          Object.assign(state, { cart: kept.cart, note: kept.note, attributes: kept.attributes, discount: kept.discount, codes: kept.codes })
        }
        return out
      }
      const cartJs = async () => JSON.parse(String((await ask("GET", "/cart.js")).body))
      return { state, ask, cartJs }
    }
    const items = (state: { cart: { p: string; v: string | null; q: number; props?: Record<string, string> }[] }) => state.cart.map((e) => ({ productId: e.p, variantId: e.v, quantity: e.q, ...(e.props ? { properties: e.props } : {}) }))
    const offers = [BREAK(), SET(), ADDON()]

    /* 5 tees: one 3+2 block, $108.00. */
    {
      const db = shopDb({ offers })
      const s = session(siteFor(db))
      const added = JSON.parse(String((await s.ask("POST", "/cart/add.js", { id: TEE_S, quantity: 5, properties: { _sl_offer: "quantity_break", _sl_offer_id: QB, _sl_discount: "percent:90" } })).body))
      const q = await quote(db, items(s.state))
      const js = await s.cartJs()
      const line = js.items[0]
      check("/cart.js: 5 tees on 2+1 and 3+2 at $36.00 total $108.00, what checkout charges", js.total_price === goods(q) && js.total_price === 10800 && js.original_total_price === 18000 && js.total_discount === 7200, { js: { total: js.total_price, orig: js.original_total_price, disc: js.total_discount }, q: q.totals })
      check("  the line: original_price, final_price, final_line_price, line_level_total_discount", line.original_price === 3600 && line.final_line_price === 10800 && line.final_price === 2160 && line.original_line_price === 18000 && line.line_level_total_discount === 7200, line)
      check("  line_level_discount_allocations: the tier's label, its amount, an automatic discount application", line.line_level_discount_allocations.length === 1 && line.line_level_discount_allocations[0].amount === 7200 && line.line_level_discount_allocations[0].discount_application.title === "Buy 3 get 2 free" && line.line_level_discount_allocations[0].discount_application.type === "automatic" && line.line_level_discount_allocations[0].discount_application.offer_id === QB, line.line_level_discount_allocations)
      check("  cart.discount_applications lists it; no cart level application without a code", js.discount_applications?.[0]?.title === "Buy 3 get 2 free" && js.discount_applications?.[0]?.total_allocated_amount === 7200 && js.cart_level_discount_applications.length === 0, js.discount_applications)
      check("  the theme's _sl_discount percent:90 changed nothing", js.total_price === 10800)
      check("/cart/add.js answers the line priced the same way", added.final_line_price === 10800 && added.line_level_discount_allocations?.[0]?.amount === 7200, added)
      const changed = JSON.parse(String((await s.ask("POST", "/cart/change.js", { line: 1, quantity: 3 })).body))
      const q3 = await quote(db, items(s.state))
      check("/cart/change.js to 3: Buy 2 get 1 free, $72.00 as checkout", changed.total_price === 7200 && changed.total_price === goods(q3) && changed.items[0].line_level_discount_allocations[0].discount_application.title === "Buy 2 get 1 free", { total: changed.total_price, q3: q3.totals })
      const updated = JSON.parse(String((await s.ask("POST", "/cart/update.js", { updates: [8] })).body))
      const q8 = await quote(db, items(s.state))
      check("/cart/update.js to 8: 3+2 and 2+1, $180.00 as checkout (the leftover rule)", updated.total_price === goods(q8) && updated.total_price === 18000 && updated.items[0].line_level_discount_allocations.length === 2, { total: updated.total_price, q8: q8.totals, al: updated.items[0].line_level_discount_allocations })
      const coded = JSON.parse(String((await s.ask("POST", "/cart/update.js", { updates: [5], discount: "SAVE10" })).body))
      const qc = await quote(db, items(s.state), { couponCode: "SAVE10" })
      check("a code on top: the break, then 10% of what is left, $97.20, what checkout charges", coded.total_price === goods(qc) && coded.total_price === 9720 && coded.discount_codes[0].applicable === true && coded.cart_level_discount_applications[0]?.total_allocated_amount === 1080, { total: coded.total_price, qc: qc.totals, cl: coded.cart_level_discount_applications })
      const page = String((await s.ask("GET", "/cart", null, false)).body)
      check("the Liquid cart (a cart page or drawer with no script of its own) draws the same numbers", /\$180\.00\|\$108\.00<i>Buy 3 get 2 free -\$72\.00<\/i>/.test(page) && /<p id=t>\$97\.20<\/p>/.test(page) && /<b>SAVE10 -\$10\.80<\/b>/.test(page), page.slice(0, 800))
    }

    /* Lines split by their properties (an engraving, an uploaded picture's reference): the break still counts every unit of the product. */
    {
      const db = shopDb({ offers })
      const s = session(siteFor(db))
      await s.ask("POST", "/cart/add.js", { items: [{ id: TEE_S, quantity: 2, properties: { Engraving: "Ana" } }, { id: TEE_S, quantity: 1, properties: { Engraving: "Bo" } }] })
      const js = await s.cartJs()
      const q = await quote(db, items(s.state))
      check("one option on two lines by their properties: 2 + 1 counted across them, $72.00 as checkout, each line its own part", js.items.length === 2 && js.total_price === 7200 && goods(q) === 7200 && js.items.map((i: { final_line_price: number }) => i.final_line_price).join() === q.lines.map((l) => l.unitCents * l.quantity - l.discountCents).join(), { lines: js.items.map((i: { final_line_price: number; properties: unknown }) => [i.final_line_price, i.properties]), q: q.lines.map((l) => [l.quantity, l.discountCents]) })
      const coded = JSON.parse(String((await s.ask("POST", "/cart/update.js", { discount: "SAVE10" })).body))
      const qc = await quote(db, items(s.state), { couponCode: "SAVE10" })
      check("  a code on those lines too: $64.80, as checkout", coded.total_price === goods(qc) && coded.total_price === 6480, { total: coded.total_price, qc: qc.totals })
    }

    /* Variants at different prices: the cheapest units are the free ones. */
    {
      const db = shopDb({ offers, teeLCents: 4000 })
      const s = session(siteFor(db, "USD", "${{amount}}", { tee: "$36.00", teeL: "$40.00" }))
      await s.ask("POST", "/cart/add.js", { items: [{ id: TEE_S, quantity: 1 }, { id: TEE_L, quantity: 2 }] })
      const js = await s.cartJs()
      const q = await quote(db, items(s.state))
      check("two sizes, $36.00 and $40.00 x2: the $36.00 one free, $80.00, line by line as checkout", js.total_price === goods(q) && js.total_price === 8000 && js.items.map((i: { final_line_price: number }) => i.final_line_price).join() === q.lines.map((l) => l.unitCents * l.quantity - l.discountCents).join(), { js: js.items.map((i: { final_line_price: number }) => i.final_line_price), q: q.lines })
    }

    /* The bundle and the upsell together with the break. */
    {
      const db = shopDb({ offers })
      const s = session(siteFor(db))
      await s.ask("POST", "/cart/add.js", { items: [{ id: TEE_S, quantity: 3 }, { id: MUGV, quantity: 1 }, { id: CAPV, quantity: 1 }] })
      const js = await s.cartJs()
      const q = await quote(db, items(s.state))
      const titles = js.items.flatMap((i: { line_level_discount_allocations: { discount_application: { title: string } }[] }) => i.line_level_discount_allocations.map((a) => a.discount_application.title))
      check("a break, a bundle and an upsell in one cart: /cart.js total is checkout's", js.total_price === goods(q) && sum(q.lines.map((l) => l.discountCents)) === js.total_discount, { js: js.total_price, q: q.totals, lines: q.lines })
      check("  each line names its own offer; the cap gets one offer only, the one that saves more (20% of $15.00 against $3.00 off: the same, the bundle first)", titles.includes("Buy 2 get 1 free") && titles.includes("Mug and cap") && titles.filter((t: string) => t === "Mug and cap" || t === "Add a cap").length === 2, titles)
    }

    /* Offers that are off or not started yet, and a product no longer on sale. */
    {
      const db = shopDb({ offers: [BREAK({ active: false }), SET({ startsAt: "2099-01-01T00:00:00Z" })] })
      const s = session(siteFor(db))
      await s.ask("POST", "/cart/add.js", { items: [{ id: TEE_S, quantity: 3 }, { id: MUGV, quantity: 1 }, { id: CAPV, quantity: 1 }] })
      const js = await s.cartJs()
      check("an offer switched off, one scheduled for later: nothing off in the cart, nothing at checkout", js.total_discount === 0 && js.total_price === 3 * 3600 + 2000 + 1500 && goods(await quote(db, items(s.state))) === js.total_price, js.total_price)
    }

    /* Stock: the free units are units, and come out of stock. */
    {
      const db = shopDb({ offers, stock: 4 })
      /* As the live site reads them (lib/website-builder/compat-site.ts cartStock): 4 of S left, L sold out. */
      const stocked = { ...(siteFor(db) as object), stock: async (pid: string) => (pid === TEE ? { variants: { [TEE_S]: 4, [TEE_L]: 0 }, perOrder: null } : null) } as unknown as { products: { id: string; settings: { variants: { id: string; available: boolean }[] } }[] }
      stocked.products[0].settings.variants[1].available = false
      const s = session(stocked)
      const refused = await s.ask("POST", "/cart/add.js", { id: TEE_S, quantity: 5 })
      check("4 left: an add of 5 (3 paid, 2 free) is refused, the free units count", refused.status === 422, { status: refused.status, body: String(refused.body).slice(0, 200) })
      const q = await quote(db, [{ productId: TEE, variantId: TEE_S, quantity: 5 }])
      check("  and checkout says only 4 are left", q.stockIssues.some((x) => x.available === 4), q.stockIssues)
      const sold = await s.ask("POST", "/cart/add.js", { id: TEE_L, quantity: 1 })
      check("  a sold out option stays out of the cart", sold.status === 422)
    }

    /* Free shipping over an amount counts the cart after its offers. */
    {
      const db = shopDb({ offers, freeOver: 15000 })
      const q = await quote(db, [{ productId: TEE, variantId: TEE_S, quantity: 5 }])
      check("free shipping over $150.00: 5 tees list at $180.00 but cost $108.00, so shipping is charged, as Shopify counts it", q.totals.shippingCents === 1500 && goods(q) === 10800, q.totals)
      const q8 = await quote(db, [{ productId: TEE, variantId: TEE_S, quantity: 8 }])
      check("  8 tees cost $180.00 after the offers: shipping free", q8.totals.shippingCents - q8.totals.shippingDiscountCents === 0 || q8.totals.shippingCents === 0, q8.totals)
      check("  the website's free shipping banner counts the cart after its offers and code too", /cartObject\(cartLines\(site, req\.cart\), site\.shop\.currency \?\? "USD", "", \{\}, req\.cartDiscount \?\? null, false, req\.cartOffers \?\? null\)\.total_price/.test(read("lib/storelib-theme/compat/site.ts")))
    }

    /* Other currencies: lei as dollars; yen in Shopify's hundredths. */
    {
      const lei = shopDb({ offers: [BREAK({ tiers: [tier(3, 0, "percent", 15)] })], currency: "RON", teeCents: 4999 })
      const s = session(siteFor(lei, "RON", "{{amount}} lei", { tee: "49.99 lei" }))
      await s.ask("POST", "/cart/add.js", { id: TEE_S, quantity: 3 })
      const js = await s.cartJs()
      check("lei: 3 at 15% off 49.99 lei is 127.47 lei in the cart and at checkout", js.total_price === 12747 && goods(await quote(lei, items(s.state))) === 12747, js.total_price)
      const yen = shopDb({ offers: [BREAK()], currency: "JPY", teeCents: 3600 })
      const y = session(siteFor(yen, "JPY", "¥{{amount_no_decimals}}", { tee: "¥3,600" }))
      await y.ask("POST", "/cart/add.js", { id: TEE_S, quantity: 3 })
      const jy = await y.cartJs()
      check("yen: ¥3600, 2 + 1 free, ¥7200 (the page's hundredths, 720000, as Shopify writes yen)", jy.total_price === 720000 && goods(await quote(yen, items(y.state))) === 7200, jy.total_price)
    }

    /* Markets: the checkout charges each line converted as its card was, its discount the same share of it. The cart's offers follow that rule. */
    {
      const eur: MarketCharge = { currency: "EUR", base: "USD", price: (c) => (c > 0 ? Math.round((c * 0.92) / 100) * 100 - 1 : 0), amount: (c) => Math.round(c * 0.92) }
      const lines = [{ unitCents: 3600, quantity: 3, discountCents: 3600 }]
      const conv = convertOrder(lines, { itemsSubtotalCents: 10800, discountCents: 3600, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: 7200 }, eur)
      check("a market: Buy 2 get 1 free at €32.99 shown charges €65.98, two of the price shown (the free unit is one whole shown unit)", conv.lines[0].unitCents === 3299 && conv.totals.totalCents === 6598, conv)
      const pct = convertOrder([{ unitCents: 4999, quantity: 3, discountCents: 3 * 4999 - 12747 }], { itemsSubtotalCents: 14997, discountCents: 2250, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: 12747 }, eur)
      const formula = tierTotals(eur.price(4999), tier(3, 0, "percent", 15)).totalCents
      check("  a percent tier in a market: the share rule and the formula on the shown price agree within a cent", Math.abs(pct.totals.totalCents - formula) <= 1, { charged: pct.totals.totalCents, formula })
      check("  each offer's part converted the same share, never more than the line's discount", JSON.stringify(offersInMarket([{ savedCents: 2000 }, { savedCents: 1600 }], 3600, 3299)) === '[{"savedCents":1833},{"savedCents":1466}]')
      check("  the cart applies the share the checkout's conversion gives (round(shown * part / line))", /Math\.round\(\(page \* mineStore\) \/ \(l\.unitCents \* e\.q\)\)/.test(read("lib/storelib-theme/compat/cart-pricing-server.ts")) && /Math\.round\(\(page \* l\.discountCents\) \/ lineStore\) - Math\.round\(\(page \* beforeCode\[i\]\) \/ lineStore\)/.test(read("lib/storelib-theme/compat/cart-pricing-server.ts")))
    }

    /* An unpublished product shows no offers; a bundle with a product no longer on sale is neither shown nor applied. */
    {
      const { productOffers } = await import("../lib/offers/offers-public")
      const hidden = await productOffers(shopDb({ offers, teeStatus: "draft" }), TEE, { now: NOW })
      check("an unpublished product: no offers on its page", hidden.quantityBreaks.length === 0 && hidden.bundles.length === 0 && hidden.checkoutOffers.length === 0, hidden)
      const gone = shopDb({ offers: [SET({ productIds: [MUG, DRAFTP] })] })
      const shown = await productOffers(gone, MUG, { now: NOW })
      const q = await quote(gone, [{ productId: MUG, variantId: MUGV, quantity: 1 }, { productId: DRAFTP, variantId: null, quantity: 1 }])
      check("  a bundle with a product taken off sale: not shown, and the mug pays in full", shown.bundles.length === 0 && goods(q) === 2000, { shown, q: q.totals })
    }

    /* A store with no offer on: the cart asks the checkout nothing more. */
    {
      const db = shopDb({ offers: [] })
      const s = session(siteFor(db))
      await s.ask("POST", "/cart/add.js", { id: TEE_S, quantity: 3 })
      const before = db.log.filter((l) => l.table === "products").length
      const js = await s.cartJs()
      check("no offers: /cart.js prices nothing more (one small read of the offers, held)", js.total_price === 10800 && db.log.filter((l) => l.table === "products").length === before, { reads: db.log.filter((l) => l.table === "products").length - before })
    }
  }

  section("CANVAS: the builder shows the live site's offers")
  {
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("the canvas cart is priced by the checkout's quote (app/api/website-builder/cart-offers)", /function canvasPricing\(installId: string\): CartPricing/.test(canvas) && /pricing: canvasPricing\(installId\)/.test(canvas) && /cartOffers: \(canvasCarts\.get\(installId\)\?\.cart\.length \?\? 0\) > 0/.test(canvas))
    check("  the product page gets product.metafields.storelib.offers, as the live page", /storelib_offers: stock\.offers/.test(canvas) && /m\.productOffers\(admin, productId\)/.test(read("app/api/website-builder/products/route.ts")))
    const route = read("app/api/website-builder/cart-offers/route.ts")
    check("  the canvas's pricing is the signed in creator's own store, never one the request names", /editorUser\(supabase\)/.test(route) && /\.eq\("user_id", user\.id\)/.test(route) && /creatorId: creator\.id/.test(route) && !/body\.creatorId|body\.shopId/.test(route))
    const { answerInCanvas } = await import("../lib/storelib-theme/compat/canvas-cart")
    const { CompatTheme, wrapCompatTemplate } = await import("../lib/storelib-theme/compat/theme")
    const theme = new CompatTheme({ "layout/theme.storelib": wrapCompatTemplate("<html><body>{{ content_for_layout }}</body></html>") }, {}, { assetUrl: (n) => `/a/${n}` })
    const site = { creatorId: "", theme, pages: {}, products: [{ id: TEE, settings: { title: "Tee", price: "$36.00", image: "", url: "/products/tee", slug: "tee", kind: "physical", available: true, variants: [{ id: TEE_S, name: "S", price: "$36.00", available: true }] } }], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, host: "", designMode: true, pricing: { discount: async () => ({ code: "", applicable: false, valueType: "percentage", value: 0, scope: "cart", lines: {}, total: 0, freeShipping: false }), shipping: async () => ({ ok: true, rates: [] }), offers: async (cart: { k: string }[]) => ({ lines: { [cart[0].k]: [{ offerId: QB, title: "Buy 2 get 1 free", kind: "quantity_break", tier: 0, amount: 3600 }] } }) } }
    const added = await answerInCanvas(site as never, { cart: [], note: "" }, { method: "POST", url: "/cart/add.js", body: { id: TEE_S, quantity: 3 }, ajax: true }, "/")
    const after = await answerInCanvas(site as never, added.state, { method: "GET", url: "/cart.js", body: null, ajax: true }, "/")
    const js = JSON.parse(after.answer.body)
    check("  the canvas's /cart.js takes the offers off, as the live site's", js.total_price === 7200 && js.items[0].line_level_discount_allocations[0].discount_application.title === "Buy 2 get 1 free", js)
  }

  section("NATIVE: Storelib's own product section draws the tiers by the checkout's formula")
  {
    const { QuantityBreaks } = await import("../components/offers/quantity-breaks")
    /* Its elements walked as React returns them (no hooks in it, so it is called as a function): what each tier says. */
    type El = { props?: Record<string, unknown> & { children?: unknown } }
    const walk = (n: unknown, out: El[] = []): El[] => {
      if (Array.isArray(n)) n.forEach((x) => walk(x, out))
      else if (n && typeof n === "object" && "props" in (n as El)) {
        out.push(n as El)
        walk((n as El).props?.children, out)
      }
      return out
    }
    const text = (n: unknown): string => (Array.isArray(n) ? n.map(text).join("") : typeof n === "string" || typeof n === "number" ? String(n) : n && typeof n === "object" && "props" in (n as El) ? text((n as El).props?.children) : "")
    const tree = QuantityBreaks({ breaks: [{ offerId: QB, productId: TEE, title: "Buy more, save more", tiers: [tier(1), ...BREAK().tiers!] }], priceCents: 3600, quantity: 3, onPick: () => {}, money: (c: number) => `$${(c / 100).toFixed(2)}` })
    const els = walk(tree)
    const rows = els.filter((e) => e.props && "data-tier-total" in e.props)
    const totals = rows.map((e) => Number(e.props!["data-tier-total"]))
    check("1, 2+1 and 3+2 at $36.00: $36.00, $72.00, $108.00, what checkout charges", totals.join() === "3600,7200,10800" && totals[2] === 18000 - sum(applyOffers([{ productId: TEE, unitCents: 3600, quantity: 5 }], [BREAK()], { now: NOW }).discounts), totals)
    check("  the buy box's quantity picks the tier; what it would cost without struck through", rows[1]?.props?.["aria-checked"] === true && rows[0]?.props?.["aria-checked"] === false && /\$108\.00/.test(text(rows[2])) && /\$180\.00/.test(text(rows[2])) && /Most popular/.test(text(rows[1])), rows.map((r) => text(r)))
    const block = read("components/website-builder/sections/renderers/product/offers-block.tsx")
    check("  in the Bundles and upsells block, its own toggle, setting the buy box's quantity", /on\(s\.show_breaks, true\)/.test(block) && /ctx\.setQuantity/.test(block) && /"id": "show_breaks"/.test(read("themes/default/sections/product.json")))
    check("  one read for the three kinds (GET /api/offers)", /fetch\(`\/api\/offers\?product=/.test(read("components/offers/bundle-offers.tsx")))
  }

  section("CREATOR: try a cart, and what to watch for before saving")
  {
    const draft = BREAK({ id: DRAFT_ID })
    const tried = tryCart([{ productId: TEE, title: "Tee", unitCents: 3600, quantity: 5 }, { productId: MUG, title: "Mug", unitCents: 2000, quantity: 1 }, { productId: CAP, title: "Cap", unitCents: 1500, quantity: 1 }], [SET(), ADDON()], draft, NOW)
    check("a sample cart through the checkout's own applyOffers: 5 tees and the set, $108.00 + $28.00", tried.totalCents === 10800 + 2800 && tried.lines[0].offers[0]?.title === "Buy 3 get 2 free" && tried.lines[1].offers[0]?.title === "Mug and cap", tried)
    const off = tryCart([{ productId: TEE, title: "Tee", unitCents: 3600, quantity: 3 }], [], BREAK({ active: false, startsAt: "2099-01-01T00:00:00Z" }), NOW)
    check("  an offer switched off or scheduled is tried as if on now", off.totalCents === 7200)
    const products = [{ id: TEE, title: "Tee", published: true, priceCents: 3600 }, { id: DRAFTP, title: "Hoodie", published: false, priceCents: 5000 }, { id: MUG, title: "Mug", published: true, priceCents: 2000 }]
    const w1 = offerWarnings(BREAK({ productIds: [DRAFTP] }), [], products, NOW)
    check("a draft product: buyers see it once it's published", w1.some((w) => /Hoodie is a draft/.test(w)), w1)
    const w2 = offerWarnings(BREAK({ tiers: [tier(2, 0, "percent", 20), tier(3, 0, "percent", 10)] }), [], products, NOW)
    check("a tier that costs more per item than the one before", w2.some((w) => /Tier 2 costs more per item than tier 1/.test(w)), w2)
    const w3 = offerWarnings(BREAK({ id: DRAFT_ID }), [BREAK(), SET({ productIds: [TEE, MUG] })], products, NOW)
    check("another offer on the same product, and which one wins", w3.some((w) => /Only one applies to it: the one that saves more on the whole cart/.test(w)) && w3.some((w) => /Each item gets one offer: the one that saves more on it/.test(w)), w3)
    check("  an offer that is off or ended competes with nothing", offerWarnings(BREAK({ id: DRAFT_ID }), [BREAK({ active: false }), BREAK({ id: "x", endsAt: "2020-01-01T00:00:00Z" })], products, NOW).length === 0)
    const editor = read("app/app/offers/offer-editor.tsx")
    check("the editor: a line under the kind picker, the warnings, Try it in a cart", /data-kind-hint/.test(editor) && /data-offer-warnings/.test(editor) && /data-try-cart/.test(editor) && /\/api\/store\/offers\/try/.test(editor))
    const tryRoute = read("app/api/store/offers/try/route.ts")
    check("  the try route: the caller's own store (team roles too), products read under it, nothing saved", /const c = await shopCaller\(\)/.test(tryRoute) && /\.eq\("creator_id", c\.creatorId\)/.test(tryRoute) && !/saveOffer|\.insert\(|\.update\(/.test(tryRoute))
    check("  the kind explanations name what each does, no sales words", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(editor.match(/const KIND_HINT[\s\S]*?\n\}/)?.[0] ?? "x"))
  }

  section("CURRENCY: a store's currency change converts quantity breaks (SQL part 306)")
  {
    const part = read("supabase/sql/run-now/306_store_currency_quantity_breaks.sql")
    check("the migration is the same part", part === read("supabase/migrations/20270201_ag1_store_currency_quantity_breaks.sql"))
    check("replaces, never drops: CREATE OR REPLACE, nothing deleted", /CREATE OR REPLACE FUNCTION public\.store_change_currency\(/.test(part) && /CREATE OR REPLACE FUNCTION public\.store_currency_targets\(\)/.test(part) && !/DROP |DELETE FROM|TRUNCATE/i.test(part))
    check("  tiers are a money column of store_offers, snapshotted for Undo", /\('store_offers', 'id', 'creator_id = \$1', ARRAY\['min_subtotal_cents', 'tiers'\]\)/.test(part))
    check("  an amount tier at the prices' rate and rounding: round(amount * rate)", /x->>''discountType'' = ''amount''/.test(part) && /round\(\(x->>''discountValue''\)::numeric \* \$2\)/.test(part))
    const p258 = read("supabase/sql/run-now/258_store_currency_plans_offers_collections.sql")
    const body = (s: string) => s.split("\n").find((l) => l.startsWith("CREATE OR REPLACE FUNCTION public.store_change_currency(")) ?? ""
    check("  everything else part 258 did, kept word for word", body(part).replace(/, CASE WHEN 'tiers' = ANY \(v_cols\) THEN [\s\S]*?ELSE tiers END' END\)/, ")") === body(p258), { d: body(part).length - body(p258).length })
    check("  part 258's Undo already restores a snapshot's tiers as they were", /WHEN 'tiers' THEN 'tiers = s\.before->''tiers'''/.test(p258))
    /* After part 305, in number order (part 308 came before it on the coordinator branch and is checked last). */
    check("listed in the README and checked after part 305", /306_store_currency_quantity_breaks\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p305_translation_providers, exists \(select 1 from pg_proc where proname = 'store_change_currency' and prosrc like '%discountValue%'\) as p306_store_currency_quantity_breaks[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))

    const PSQL = ["/usr/bin/psql", "/usr/lib/postgresql/16/bin/psql"].find((p) => existsSync(p))
    const HOST = process.env.OFFERS_PG_HOST
    if (!PSQL || !HOST) {
      console.log(`  skipped  the Postgres run: ${!PSQL ? "no psql here" : "OFFERS_PG_HOST is not set"}`)
    } else {
      const args = ["-h", HOST, "-p", process.env.OFFERS_PG_PORT || "5432", "-U", process.env.OFFERS_PG_USER || "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q"]
      const psql = (db: string, more: string[]) => execFileSync(PSQL, [...args, "-d", db, ...more], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      const db = `offers_ag_${process.pid}`
      psql("postgres", ["-c", `drop database if exists ${db}`, "-c", `create database ${db}`])
      try {
        for (const f of ["tests/fixtures/store-currency-offers.sql", "supabase/sql/run-now/176_store_currency.sql", "supabase/sql/run-now/258_store_currency_plans_offers_collections.sql", "supabase/sql/run-now/306_store_currency_quantity_breaks.sql", "supabase/sql/run-now/306_store_currency_quantity_breaks.sql"]) psql(db, ["-f", join(process.cwd(), f)])
        const q = (sql: string) => psql(db, ["-tA", "-c", sql]).trim()
        const tiers = (id: string) => JSON.parse(q(`select tiers from store_offers where id = '${id}'`)) as { discountType: string; discountValue: number; label: string }[]
        const before = tiers(QB)
        const change = JSON.parse(q(`select public.store_change_currency('${SHOP}', 'USD', 'RON', 'convert', 4.5512, '2026-10-25', 'ag1-change-0001', null)`)) as { id: string; counts: Record<string, number> }
        const after = tiers(QB)
        const rate = 4.5512
        check("Postgres: USD to RON at 4.5512, the $5.00 off tier is 22.76 lei off (round(500 * 4.5512) = 2276)", after[2].discountValue === Math.round(500 * rate) && after[2].discountValue === 2276, after)
        check("  the 2+1 and the 15% tiers do not move, labels kept", after[0].discountValue === 0 && after[1].discountValue === 15 && after[1].discountType === "percent" && after[2].label === before[2].label)
        check("  the prices at the same rate and rounding (3600 to 16384)", q(`select price_cents from products where id = '${TEE}'`) === String(Math.round(3600 * rate)))
        check("  a bundle's fixed amount and an upsell's minimum as part 258 did", q(`select discount_value from store_offers where id = '${BUNDLE}'`) === String(Math.round(700 * rate)) && q(`select min_subtotal_cents from store_offers where id = '${UPSELL}'`) === String(Math.round(3000 * rate)))
        check("  another store's quantity break untouched", tiers("a6000000-0000-4000-8000-0000000000e4")[0].discountValue === 500)
        check("  the pricing reads the converted tiers as valid tiers", (await import("../lib/offers/pricing")).storedTiers(after).length === 3)
        const again = JSON.parse(q(`select public.store_change_currency('${SHOP}', 'USD', 'RON', 'convert', 4.5512, '2026-10-25', 'ag1-change-0001', null)`)) as { repeat: boolean }
        check("  the same request again changes nothing", again.repeat === true && tiers(QB)[2].discountValue === 2276)
        q(`select public.store_currency_restore('${SHOP}', '${change.id}')`)
        check("Undo: the tiers exactly as they were, the prices too", JSON.stringify(tiers(QB)) === JSON.stringify(before) && q(`select price_cents from products where id = '${TEE}'`) === "3600" && q(`select currency from store_settings where creator_id = '${SHOP}'`) === "", { now: tiers(QB), before })
        const jpy = JSON.parse(q(`select public.store_change_currency('${SHOP}', 'USD', 'JPY', 'convert', 1.5, '2026-10-25', 'ag1-change-0002', null)`)) as { ok: boolean }
        check("  to yen (rate per minor unit, as the route sends it): $5.00 off is ¥750 off", jpy.ok === true && tiers(QB)[2].discountValue === 750)
        check("the check after reads part 306 as run", q(read("supabase/sql/run-now/99_check_after.sql").match(/exists \(select 1 from pg_proc where proname = 'store_change_currency' and prosrc like '%discountValue%'\)/)![0].replace(/^/, "select ")) === "t")
      } finally {
        psql("postgres", ["-c", `drop database if exists ${db}`])
      }
    }
    const route = read("app/api/store/currency/route.ts")
    check("the route still converts through store_change_currency (the one function, with Undo)", /rpc\("store_change_currency"/.test(route))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

