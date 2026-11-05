/**
 * Offers, one number everywhere (lib/offers): what the product page's block,
 * the cart drawer, the cart page and the checkout say an offer saves is what
 * the checkout charges and the order keeps, in the store's currency and in a
 * market's that rounds its prices, and in the page's language.
 *
 *   SUMMARY     the website checkout's saving rows in a market's currency
 *               are each line's offers converted with the line's discount
 *               (offersInMarket), as the order keeps them; the code's row
 *               is the code's part and nothing of the offers' rounding
 *   CART        the drawer and the cart page convert the offers' discount
 *               line by line, as checkout does, and each saving row too
 *   PWYW        a pay what you want product in a bundle or as an upsell is
 *               never shown discounted, since the checkout never discounts it
 *   ONE EACH    a quantity break on something that doesn't ship shows only
 *               tiers a one-per-order cart can reach, and the editor says so
 *   WORDS       the offers' own words are Shop words and checkout sentences
 *
 *   node scripts/run-push-tests.mjs (listed there)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { applyOffers, bundlePrice, offerUnitPrice, type Offer } from "../lib/offers/offers"
import { tierLabel, type Tier } from "../lib/offers/pricing"
import { offerWarnings, DRAFT_ID } from "../lib/offers/try-cart"
import { convertOrder, marketCharge, offersInMarket } from "../lib/markets/checkout-charge"
import { pricingFor, type MarketPrice, type StorefrontDisplay } from "../lib/markets/pricing"
import type { FxRates } from "../lib/markets/money"
import { cartAmounts, offerSavingsShown, offerRowKey } from "../lib/markets/cart-money"
import { offerRowsInMarket, quoteInMarket } from "../lib/checkout/site-quote-market"
import { summaryRows, rowsSum } from "../lib/checkout/summary-rows"
import { UI_WORDS } from "../lib/markets/ui-words"
import { CHECKOUT_SENTENCES } from "../lib/markets/checkout-words.generated"
import type { SiteQuote } from "../lib/checkout/site-quote-server"
import { readdirSync, statSync } from "node:fs"
import JSZip from "jszip"
import { defaultTierWording, fillWords, tierNameIn, TIER_WORDS } from "../lib/offers/pricing"
import { minorUnits } from "../lib/markets/money"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SHOP = "a1000000-0000-4000-8000-000000000001"
const TEE = "a1000000-0000-4000-8000-0000000000a1"
const MUG = "a1000000-0000-4000-8000-0000000000a2"
const EBOOK = "a1000000-0000-4000-8000-0000000000a3"
const TEEV = "a1000000-0000-4000-8000-0000000000b1"
const MUGV = "a1000000-0000-4000-8000-0000000000b2"
const NOW = new Date("2026-10-25T12:00:00Z")
const today = new Date().toISOString().slice(0, 10)

/* A lei store with a euro market that rounds to .99, at 5 lei a euro: 29 lei is €5.80 at the rate, €5.99 on its card. */
const fx: FxRates = { asOf: today, rates: { RON: 5 } }
const eur99: MarketPrice = { id: "eu", name: "Europe", currency: "EUR", rounding: "nine_nine", adjustBps: 0 }
const pricing = pricingFor(eur99, "RON", fx)!
const charge = marketCharge(pricing)
const display: StorefrontDisplay = { market: eur99, base: "RON", fx, locale: "en", note: null }

const tier = (quantity: number, freeQuantity = 0, discountType: Tier["discountType"] = "none", discountValue = 0): Tier => ({ quantity, freeQuantity, discountType, discountValue, label: tierLabel({ quantity, freeQuantity, discountType, discountValue }), badge: "" })
const breakOffer = (o: Partial<Offer> = {}): Offer => ({ id: "qb", kind: "quantity_break", title: "Buy more", productIds: [TEE], triggerIds: [], discountType: "none", discountValue: 0, active: true, tiers: [tier(2, 1)], ...o })
const bundle = (o: Partial<Offer> = {}): Offer => ({ id: "bd", kind: "bundle", title: "Tee and mug", productIds: [TEE, MUG], triggerIds: [], discountType: "percent", discountValue: 20, active: true, ...o })

async function main() {
  console.log("\nSUMMARY: the checkout's saving rows in a market's currency are the order's own")
  {
    /* Three tees at 29 lei with one free, a mug at 10 lei with 20% off in a set... plus a 10% code on what is left. */
    const r = applyOffers([{ productId: TEE, unitCents: 2900, quantity: 3 }, { productId: MUG, unitCents: 1000, quantity: 1 }], [breakOffer(), bundle()], { now: NOW })
    const code = [Math.round((2900 * 3 - r.discounts[0]) * 0.1), Math.round((1000 - r.discounts[1]) * 0.1)]
    const lines = [
      { productId: TEE, variantId: TEEV, title: "Tee", variantName: null, imageUrl: null, type: "physical", quantity: 3, unitCents: 2900, discountCents: r.discounts[0] + code[0], requiresShipping: true, maxQuantity: 9, offers: r.lineOffers[0] },
      { productId: MUG, variantId: MUGV, title: "Mug", variantName: null, imageUrl: null, type: "physical", quantity: 1, unitCents: 1000, discountCents: r.discounts[1] + code[1], requiresShipping: true, maxQuantity: 9, offers: r.lineOffers[1] },
    ]
    const discountCents = lines.reduce((n, l) => n + l.discountCents, 0)
    const subtotal = 2900 * 3 + 1000
    const quote = {
      kind: "ships", creatorId: SHOP, lines, dropped: [], stockIssues: [], requiresShipping: true, coupon: { code: "SAVE10", label: "10% off", freeShipping: false }, couponError: null,
      delivery: { ok: true, options: [], selectedId: null, needsCountry: false }, pickups: [],
      totals: { itemsSubtotalCents: subtotal, discountCents, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: subtotal - discountCents },
      offers: r.applied.filter((a) => a.savedCents > 0).map((a) => ({ title: a.title, savedCents: a.savedCents })),
    } as unknown as SiteQuote
    const q = quoteInMarket(quote, charge)
    /* What the order keeps (app/api/checkout/site, lib/physical/checkout-server): each line's offers by offersInMarket. */
    const converted = convertOrder(lines, quote.totals, charge)
    const kept = new Map<string, number>()
    lines.forEach((l, i) => offersInMarket(l.offers, l.discountCents, converted.lines[i].discountCents)!.forEach((o) => kept.set(o.title, (kept.get(o.title) ?? 0) + o.savedCents)))
    const shown = new Map((q.offers ?? []).map((o) => [o.title, o.savedCents]))
    check("each saving row is what the order records for that offer", [...kept].every(([t, c]) => shown.get(t) === c) && shown.size === kept.size, { kept: [...kept], shown: [...shown] })
    const atRate = (quote.offers ?? []).map((o) => charge.amount(o.savedCents))
    check("  (the rate alone read less than the card was charged off: why this was wrong)", atRate[0] < (shown.get(quote.offers![0].title) ?? 0), { atRate, shown: [...shown] })
    const rows = summaryRows(q)
    const offerSum = rows.offers.reduce((n, o) => n + o.cents, 0)
    const codeConverted = converted.totals.discountCents - [...kept.values()].reduce((n, c) => n + c, 0)
    check("  the code's row is the code's part, none of the offers' rounding", rows.discount === codeConverted, { rows, codeConverted })
    check("  and the rows add up to the total", rowsSum(rows) === q.totals.totalCents && offerSum + rows.discount === q.totals.discountCents, rows)
    check("a row two offers share a name with, or no line names, is converted at the rate", offerRowsInMarket({ lines: [], offers: [{ title: "X", savedCents: 1000 }] }, [], charge)[0].savedCents === charge.amount(1000))
    check("no market: the quote is never converted (quoteInMarket only runs with a charge)", /if \(market\.charge\) answer\.quote = quoteInMarket/.test(read("app/api/checkout/site/route.ts")))
  }

  console.log("\nCART: the drawer and the cart page add the offers up as checkout does")
  {
    const r = applyOffers([{ productId: TEE, unitCents: 2900, quantity: 3 }, { productId: MUG, unitCents: 1000, quantity: 1 }], [breakOffer()], { now: NOW })
    const cart = [{ priceCents: 2900, quantity: 3 }, { priceCents: 1000, quantity: 1 }]
    const subtotal = 9700
    const offerCents = r.discounts.reduce((n, d) => n + d, 0)
    /* What checkout charges: convertOrder line by line. */
    const checkout = convertOrder(cart.map((l, i) => ({ unitCents: l.priceCents, quantity: l.quantity, discountCents: r.discounts[i] })), { itemsSubtotalCents: subtotal, discountCents: offerCents, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: subtotal - offerCents }, charge)
    const lineByLine = cartAmounts(cart, display, "RON", { subtotalCents: subtotal, discountCents: offerCents, lineDiscounts: r.discounts })
    const whole = cartAmounts(cart, display, "RON", { subtotalCents: subtotal, discountCents: offerCents })
    const expectTotal = checkout.totals.itemsSubtotalCents - checkout.totals.discountCents
    check("the cart's total is checkout's total, to the cent", lineByLine.total.includes((expectTotal / 100).toFixed(2)), { total: lineByLine.total, expectTotal })
    check("  (a share of the whole subtotal missed it in a market that rounds)", !whole.total.includes((expectTotal / 100).toFixed(2)), whole.total)
    check("  without a market the line parts change nothing", cartAmounts(cart, null, "RON", { subtotalCents: subtotal, discountCents: offerCents, lineDiscounts: r.discounts }).total === cartAmounts(cart, null, "RON", { subtotalCents: subtotal, discountCents: offerCents }).total)
    const answerLines = cart.map((l, i) => ({ unitCents: l.priceCents, quantity: l.quantity, discountCents: r.discounts[i], offers: r.lineOffers[i] }))
    const rows = offerSavingsShown(answerLines, r.applied, display)!
    const kept = offersInMarket(r.lineOffers[0], r.discounts[0], checkout.lines[0].discountCents)!
    check("each saving row is the order's record of it", rows.get(offerRowKey(r.applied[0])) === kept[0].savedCents && kept[0].savedCents === checkout.lines[0].discountCents, { rows: [...rows], kept })
    check("  the store's own prices: written as they are (null)", offerSavingsShown(answerLines, r.applied, null) === null)
    check("  an older server's answer with no line prices: as before (null)", offerSavingsShown([{ discountCents: 2900 }], r.applied, display) === null)
    const route = read("app/api/offers/cart/route.ts")
    check("the cart route answers each line's price, quantity and offers", /unitCents: l\.unitCents,\s*quantity: l\.quantity,/.test(route) && /got\.lineOffers\[i\]/.test(route))
    check("  a thing that ships is priced as checkout prices it: its option's price, the product's when the option has none, never with no option chosen", /if \(p\.type === "physical"\) \{\s*if \(!v\) return \[\]\s*const raw = Math\.round\(Number\(v\.price_cents \?\? p\.price_cents\)\)/.test(route))
    const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
    const page = read("components/website-builder/cart-page-body.tsx")
    check("the drawer and the cart page pass each line's part", /cartMoney\(lines, offerDiscount\(lines, offers\)\)/.test(header) && /offerDiscount\(lines, offers\)\)/.test(page))
    check("the saving rows read the page's market", /offerSavingsShown\(data\?\.lines \?\? \[\], saving, display\)/.test(read("components/offers/cart-offers.tsx")))
  }

  console.log("\nPAGE: the product page's tiers, set and upsell in a market's currency are what checkout charges")
  {
    const { tierShown } = await import("../components/offers/quantity-breaks")
    const { chargedInMarket } = await import("../lib/markets/cart-money")
    const tiers = [tier(1), tier(2, 1), tier(3, 0, "percent", 15)]
    const roundedAsOne = (cents: number) => pricing.format(cents, "en")!
    for (const i of [1, 2]) {
      const units = tiers[i].quantity + tiers[i].freeQuantity
      const r = applyOffers([{ productId: TEE, unitCents: 2900, quantity: units }], [breakOffer({ tiers })], { now: NOW })
      const c = convertOrder([{ unitCents: 2900, quantity: units, discountCents: r.discounts[0] }], { itemsSubtotalCents: 2900 * units, discountCents: r.discounts[0], shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: 0 }, charge)
      const charged = c.totals.itemsSubtotalCents - c.totals.discountCents
      const shown = tierShown(2900, tiers, i, null, roundedAsOne, display)
      check(`tier "${tiers[i].label}": the page's ${shown.total} is checkout's ${(charged / 100).toFixed(2)}`, shown.total.includes((charged / 100).toFixed(2)), shown)
    }
    check("  (the tier's total converted as one price read otherwise)", !roundedAsOne(5800).includes("11.98"), roundedAsOne(5800))
    check("  the store's own prices: tierTotals as before", tierShown(2900, tiers, 1, null, (c) => String(c), null).total === "5800")
    const set = applyOffers([{ productId: TEE, unitCents: 2900, quantity: 1 }, { productId: MUG, unitCents: 1000, quantity: 1 }], [bundle()], { now: NOW })
    const m = chargedInMarket([{ unitCents: 2900, quantity: 1, discountCents: set.discounts[0] }, { unitCents: 1000, quantity: 1, discountCents: set.discounts[1] }], display)!
    const c = convertOrder([{ unitCents: 2900, quantity: 1, discountCents: set.discounts[0] }, { unitCents: 1000, quantity: 1, discountCents: set.discounts[1] }], { itemsSubtotalCents: 3900, discountCents: 780, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: 0 }, charge)
    check("a bundle's Together is checkout's two lines", m.totalMinor === c.totals.itemsSubtotalCents - c.totals.discountCents && m.fullMinor === charge.price(2900) + charge.price(1000), { m, c: c.totals })
    const src = read("components/offers/bundle-offers.tsx")
    check("  the block hands its market to the tiers and the cards", (read("components/website-builder/sections/renderers/product/offers-block.tsx").match(/display=\{ctx\.sample \|\| ctx\.product\.pay_what_you_want \? null : \(ctx\.product\.display \?\? null\)\}/g) ?? []).length === 2 && /chargedInMarket\(units\.map/.test(src) && /upMarket\.write\(upMarket\.totalMinor\)/.test(src))
  }

  console.log("\nPWYW: a pay what you want product is shown as the checkout charges it")
  {
    const lines = [{ productId: TEE, unitCents: 3000, quantity: 1 }, { productId: EBOOK, unitCents: 1000, quantity: 1, payWhatYouWant: true }]
    for (const o of [bundle({ productIds: [TEE, EBOOK] }), bundle({ productIds: [TEE, EBOOK], discountType: "fixed", discountValue: 2000 }), bundle({ productIds: [TEE, EBOOK], discountType: "fixed", discountValue: 9000 })]) {
      const r = applyOffers(lines, [o], { now: NOW })
      const shown = bundlePrice(o, [3000, 1000], [false, true])
      check(`a ${o.discountType} ${o.discountValue} bundle: the page's ${shown.priceCents} is the checkout's ${4000 - r.discounts[0] - r.discounts[1]}`, shown.priceCents === 4000 - r.discounts[0] - r.discounts[1], { shown, r: r.discounts })
    }
    check("  with no pay what you want item the price is as before", bundlePrice(bundle(), [3000, 1000]).priceCents === 3200)
    const up: Offer = { id: "up", kind: "checkout", title: "Add it", productIds: [EBOOK], triggerIds: [], discountType: "percent", discountValue: 50, active: true }
    const r = applyOffers([{ productId: TEE, unitCents: 3000, quantity: 1 }, { productId: EBOOK, unitCents: 1000, quantity: 1, payWhatYouWant: true }], [up], { now: NOW })
    check("an upsell of a pay what you want product adds at its own price, as charged", offerUnitPrice(up, 1000, true) === 1000 && r.discounts[1] === 0 && offerUnitPrice(up, 1000) === 500)

    const { productOffers } = await import("../lib/offers/offers-public")
    const db = fakeDb({
      products: [
        { id: TEE, creator_id: SHOP, title: "Tee", slug: "tee", type: "physical", status: "published", price_cents: 3000, thumbnail_url: null, pay_what_you_want: false, track_inventory: false, continue_selling: true, compare_at_cents: null },
        { id: EBOOK, creator_id: SHOP, title: "Ebook", slug: "ebook", type: "digital", status: "published", price_cents: 0, thumbnail_url: null, pay_what_you_want: true, pwyw_min_price_cents: 1000, compare_at_cents: null },
      ],
      product_variants: [{ id: TEEV, product_id: TEE, name: "Default", price_cents: 3000, active: true, track_inventory: false, inventory_policy: "continue", position: 0 }],
      inventory_levels: [],
      store_settings: [{ creator_id: SHOP, currency: "RON", default_country: "RO" }],
      store_offers: [bundle({ productIds: [TEE, EBOOK] })].map((o, position) => ({ id: "b0000000-0000-4000-8000-000000000001", creator_id: SHOP, kind: o.kind, title: o.title, product_ids: o.productIds, trigger_product_ids: [], discount_type: o.discountType, discount_value: o.discountValue, active: true, position, created_at: "2026-10-01", trigger_collection_ids: [], placements: ["product", "cart"], starts_at: null, ends_at: null, combines_with_codes: true, max_per_order: null, min_subtotal_cents: null, tiers: [] })),
    })
    const found = await productOffers(db, TEE, { now: NOW })
    const b = found.bundles[0]
    check("the product page's bundle: the ebook is flagged and the set priced as charged (30 lei less 20%, the ebook in full)", b?.items.find((i) => i.id === EBOOK)?.payWhatYouWant === true && b?.priceCents === 2400 + 1000, b)
  }

  console.log("\nONE EACH: a quantity break on something that doesn't ship")
  {
    const { productOffers, singleUnitTiers, oneEach } = await import("../lib/offers/offers-public")
    check("only a block of one that takes something off is reachable", singleUnitTiers([tier(2, 1), tier(3, 0, "percent", 10)]).length === 0 && singleUnitTiers([tier(1, 0, "percent", 10), tier(2, 1)]).length === 1 && singleUnitTiers([tier(1), tier(2, 1)]).length === 0)
    check("  physical and unknown types keep every tier", !oneEach("physical") && !oneEach(undefined) && oneEach("digital") && oneEach("course"))
    const row = (tiers: Tier[]) => ({ id: "c0000000-0000-4000-8000-000000000001", creator_id: SHOP, kind: "quantity_break", title: "Buy more", product_ids: [EBOOK], trigger_product_ids: [], discount_type: "none", discount_value: 0, active: true, position: 0, created_at: "2026-10-01", trigger_collection_ids: [], placements: ["product", "cart"], starts_at: null, ends_at: null, combines_with_codes: true, max_per_order: null, min_subtotal_cents: null, tiers })
    const dbOf = (tiers: Tier[]) => fakeDb({ products: [{ id: EBOOK, creator_id: SHOP, title: "Ebook", slug: "ebook", type: "digital", status: "published", price_cents: 1500, thumbnail_url: null, compare_at_cents: null }], product_variants: [], store_settings: [{ creator_id: SHOP, currency: "RON" }], store_offers: [row(tiers)] })
    check("a download's 2+1 break is not shown (a cart holds one of it)", (await productOffers(dbOf([tier(2, 1)]), EBOOK, { now: NOW })).quantityBreaks.length === 0)
    const one = (await productOffers(dbOf([tier(1, 0, "percent", 10), tier(3, 0, "percent", 20)]), EBOOK, { now: NOW })).quantityBreaks[0]
    check("  its 1 at 10% off is, alone, priced as charged", one?.tiers.length === 1 && one.tiers[0].totalCents === 1350 && applyOffers([{ productId: EBOOK, unitCents: 1500, quantity: 1 }], [breakOffer({ productIds: [EBOOK], tiers: [tier(1, 0, "percent", 10), tier(3, 0, "percent", 20)] })], { now: NOW }).discounts[0] === 150, one)
    const draft = breakOffer({ id: DRAFT_ID, productIds: [EBOOK], tiers: [tier(2, 1)] })
    const w = offerWarnings(draft, [], [{ id: EBOOK, title: "Ebook", published: true, priceCents: 1500, type: "digital" }], NOW)
    check("the editor says so before saving", w.some((s) => /Ebook is one per order/.test(s)), w)
    check("  not for a product that ships", !offerWarnings(breakOffer({ id: DRAFT_ID }), [], [{ id: TEE, title: "Tee", published: true, priceCents: 1500, type: "physical" }], NOW).some((s) => /one per order/.test(s)))
  }

  console.log("\nWORDS: the offers' own words in the page's language")
  {
    const words = ["offer_this_item", "offer_together", "offer_add_all", "offer_choose_options", "offer_add", "offer_added", "offer_each", "offer_save_on_set", "offer_suggestions", "bundles_and_offers", "discount"] as const
    check("each is a Shop word, translated in Translate › Shop words", words.every((k) => typeof (UI_WORDS as Record<string, string>)[k] === "string"))
    const bundleSrc = read("components/offers/bundle-offers.tsx").replace(/\/\*[\s\S]*?\*\//g, "")
    check("the bundle and upsell cards draw no English of their own", !/>\s*Together\s*</.test(bundleSrc) && !/"Choose your options above"/.test(bundleSrc) && !/"Added to cart"/.test(bundleSrc) && /w\("offer_together"\)/.test(bundleSrc))
    check("  the tiers' price each, handed in by the block (the tiers keep no hooks)", /\{each\(shown\.each\)\}/.test(read("components/offers/quantity-breaks.tsx")) && /each=\{\(price\) => fillWords\(w\("offer_each"\), \{ price \}\)\}/.test(read("components/website-builder/sections/renderers/product/offers-block.tsx")))
    check("  the cart's suggestions and Add", /w\("offer_add"\)/.test(read("components/offers/cart-offers.tsx")) && !/`Save \$\{money/.test(read("components/offers/cart-offers.tsx")))
    check("  the block's default labels are left to the Shop words; the store's own wins", /addAll: own\(s\.add_all_label, "Add all to cart"\)/.test(read("components/website-builder/sections/renderers/product/offers-block.tsx")))
    check("  the cart page's Bundles and offers and Discount rows", /w\("bundles_and_offers"\)/.test(read("components/website-builder/cart-page-body.tsx")) && /w\("discount"\)/.test(read("components/website-builder/cart-page-body.tsx")))
    check("the checkout's Add to your order and Add are checkout sentences", ["Add to your order", "Add", "{title} option"].every((s) => (CHECKOUT_SENTENCES as readonly string[]).includes(s)) && /ct\("Add"\)/.test(read("components/offers/checkout-suggestions.tsx")))
  }

  console.log("\nTIER NAMES: a tier with no name of its own, in the page's language")
  {
    check("the default names read back as what they say", JSON.stringify(defaultTierWording("Buy 2 get 1 free")) === JSON.stringify({ kind: "free", quantity: 2, free: 1 }) && defaultTierWording("Buy 3, save 15%")?.kind === "percent" && defaultTierWording("Buy 2, save $5.00")?.kind === "amount" && defaultTierWording("Buy 1")?.kind === "plain")
    check("  a name the store typed is kept", defaultTierWording("Most popular pack") === null && defaultTierWording("Buy 2, save big") === null && tierNameIn("Family pack", () => "x") === "Family pack")
    const fr = { free: "{quantity} achetés, {free} offert", percent: "{quantity} achetés, -{percent} %", amount: "{quantity} achetés, -{amount}", plain: "{quantity} acheté" }
    const sayFr = (k: keyof typeof TIER_WORDS, v: Record<string, string>) => fillWords(fr[k], v)
    check("  said in French", tierNameIn("Buy 2 get 1 free", sayFr) === "2 achetés, 1 offert" && tierNameIn("Buy 3, save 15%", sayFr) === "3 achetés, -15 %")
    check("  an amount saved as dollars in a lei store reads in lei when the tier is known", tierNameIn("Buy 2, save $5.00", sayFr, { discountType: "amount", discountValue: 500 }, (m) => `${(m / 100).toFixed(2)} lei`) === "2 achetés, -5.00 lei")
    check("the patterns are Shop words and checkout sentences", (UI_WORDS as Record<string, string>).offer_tier_free === TIER_WORDS.free && Object.values(TIER_WORDS).every((t) => (CHECKOUT_SENTENCES as readonly string[]).includes(t)))
    check("the product block, the cart rows and the website checkout's rows say them so", /name=\{\(t\) => tierNameIn\(t\.label/.test(read("components/website-builder/sections/renderers/product/offers-block.tsx")) && /tierNameIn\(o\.title/.test(read("components/offers/cart-offers.tsx")) && /\{offerTitle\(o\.title\)\}/.test(read("app/(storelib)/checkout/site/site-checkout.tsx")))
  }

  console.log("\nIMPORTED THEMES: the Bundles and upsells app block, on a main product and a Featured product")
  {
    const { offersShown, offersBlockHtml, cardOptions, withOffersShown, OFFERS_APP_BLOCK } = await import("../lib/storelib-theme/compat/offers-app-block")
    const { drawPage, themeOfInstall } = await import("../lib/storelib-theme/compat/page")
    const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert")
    const { compatPrices } = await import("../lib/markets/compat-prices")
    const tiers = [tier(1), tier(2, 1), tier(3, 0, "percent", 15), tier(4, 0, "amount", 500)]
    const offersJson = {
      quantityBreaks: [{ offerId: "qb", productId: TEE, title: "Buy more, save more", tiers }],
      bundles: [{ offerId: "bd", title: "Tee and mug", label: "20% off", discountType: "percent" as const, discountValue: 20, items: [{ id: TEE, title: "Tee", slug: "tee", imageUrl: null, type: "physical", priceCents: 2900, variants: [{ id: TEEV, name: "S", priceCents: 2900 }, { id: "tee-l", name: "L", priceCents: 3300 }] }, { id: MUG, title: "Mug", slug: "mug", imageUrl: null, type: "physical", priceCents: 1000, variants: [{ id: MUGV, name: "Default", priceCents: 1000 }] }] }],
      checkoutOffers: [{ offerId: "up", title: "Add a mug", label: "50% off", discountType: "percent" as const, discountValue: 50, product: { id: MUG, title: "Mug", slug: "mug", imageUrl: null, type: "physical", priceCents: 1000, variants: [{ id: MUGV, name: "Default", priceCents: 1000 }] } }],
    }
    const card = { id: TEE, settings: { title: "Tee", slug: "tee", url: "/products/tee", price: "29.00", kind: "physical", available: true, options: [{ name: "Size", values: ["S", "L"] }], variants: [{ id: TEEV, name: "S", options: ["S"], price: "29.00", available: true }, { id: "tee-l", name: "L", options: ["L"], price: "33.00", available: true }], storelib_offers: offersJson } as Record<string, unknown> }
    const own = cardOptions(card, "RON", minorUnits)
    check("each option of the card at the store's price, in its minor units (yen has none)", JSON.stringify(own) === JSON.stringify([{ id: TEEV, minor: 2900 }, { id: "tee-l", minor: 3300 }]) && cardOptions({ id: "x", settings: { price: "1200.00" } }, "JPY", minorUnits)[0].minor === 1200)
    const home = offersShown(offersJson, TEE, own, { charge: null, currency: "RON", locale: "en" })
    const lineTotal = (unit: number, units: number) => unit * units - applyOffers([{ productId: TEE, unitCents: unit, quantity: units }], [breakOffer({ tiers })], { now: NOW }).discounts[0]
    const ron = (m: number) => cartAmounts([{ priceCents: m, quantity: 1 }], null, "RON").subtotal
    check("store's prices: every tier, at every option, is checkout's total", home.breaks[0].tiers.every((t) => own.every((o) => t.at[o.id].total === ron(lineTotal(o.minor, t.units)))), home.breaks[0].tiers.map((t) => t.at))
    const setL = applyOffers([{ productId: TEE, unitCents: 3300, quantity: 1 }, { productId: MUG, unitCents: 1000, quantity: 1 }], [bundle()], { now: NOW })
    check("  the set at the option picked (L): checkout's", home.bundles[0].at["tee-l"].price === ron(4300 - setL.discounts[0] - setL.discounts[1]) && home.bundles[0].at["tee-l"].full === ron(4300))
    check("  the upsell at its offer price", home.upsells[0].price === ron(500) && home.upsells[0].was === ron(1000))
    /* In the euro market that rounds to .99: worked out again by compatPrices, each through the checkout's conversion. */
    const inMarket = compatPrices(card.settings, pricing, "en", TEE).storelib_offers_shown as ReturnType<typeof offersShown>
    const t21 = inMarket.breaks[0].tiers[1].at[TEEV]
    const conv = convertOrder([{ unitCents: 2900, quantity: 3, discountCents: 2900 }], { itemsSubtotalCents: 8700, discountCents: 2900, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: 5800 }, charge)
    check("a market's page: the 2 + 1 tier is checkout's euros, not 58 lei converted as one price", t21.total.includes(((conv.totals.itemsSubtotalCents - conv.totals.discountCents) / 100).toFixed(2)) && t21.total.includes("€"), t21)
    check("  the amount off tier's default name in the market's money", /€/.test(inMarket.breaks[0].tiers[3].amount), inMarket.breaks[0].tiers[3])
    const fr = { offer_tier_free: "{quantity} achetés, {free} offert", offer_together: "Ensemble", offer_add_all: "Tout ajouter au panier", offer_each: "{price} pièce" }
    const html = offersBlockHtml({ shown: home, selectedId: TEEV, settings: {}, words: fr, inEditor: false })
    check("the block draws each tier's name in the page's words, the set and the upsell with their buttons", html.includes("2 achetés, 1 offert") && html.includes("Ensemble") && html.includes("Tout ajouter au panier") && html.includes('data-units="3"') && (html.match(/data-add=/g) ?? []).length === 2 && html.includes("pièce"), html.slice(0, 600))
    check("  the set's lines go to /cart/add.js with the offer named on each, this product at the option picked", html.includes("/cart/add.js") && html.includes("&quot;mine&quot;:true") && html.includes("_sl_offer_id") && html.includes(`&quot;id&quot;:&quot;${MUGV}&quot;`))
    check("  every option's figures for the picker to swap", (() => { const at = JSON.parse((html.match(/data-at="([^"]*)"/)?.[1] ?? "{}").replace(/&quot;/g, '"').replace(/&amp;/g, "&")); return at["tee-l"]?.s0?.price === home.bundles[0].at["tee-l"].price && /pièce/.test(at[TEEV]?.b0t1?.each ?? "") })())
    check("  nothing for a product with no offer; a quiet line in the builder", offersBlockHtml({ shown: null, selectedId: null, settings: {}, words: {}, inEditor: false }) === "" && /set up in Offers show here/.test(offersBlockHtml({ shown: null, selectedId: null, settings: {}, words: {}, inEditor: true })))
    check("  the store can switch each part off", !offersBlockHtml({ shown: home, selectedId: TEEV, settings: { show_bundles: false, show_upsells: false }, words: {}, inEditor: false }).includes("data-add="))

    /* Drawn by an imported theme (the Materia fixture with Dawn's product sections), as a main product's and a Featured product's app block. */
    const zip = new JSZip()
    const walk = (dir: string, rel: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n)
        if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`)
        else zip.file(`${rel}${n}`, readFileSync(p))
      }
    }
    walk(join(process.cwd(), "tests/fixtures/shopify-materia"), "")
    walk(join(process.cwd(), "tests/fixtures/shopify-reviews"), "")
    walk(join(process.cwd(), "tests/fixtures/shopify-product-blocks"), "")
    const r = await convertShopifyTheme(zip)
    if (!r.ok) check("the fixture converts", false, r)
    else {
      const theme = themeOfInstall(r.theme.files as Record<string, string>, r.theme.settings, { assetUrl: (n: string) => `/a/${n}`, assetText: () => null })
      const shop = { name: "Shop", currency: "RON", moneyFormat: "{{amount}} lei" }
      const shownCard = { ...card, settings: withOffersShown(card, own, { charge: null, currency: "RON", locale: "en" }) }
      const draw = (p: Record<string, unknown>, sections: unknown[]) => drawPage(theme, p as never, sections as never, { scripts: false }).html
      const main = draw({ designMode: false, host: "shop.test", products: [shownCard], collections: [], menus: {}, shop, template: "product", path: "/products/tee", product: shownCard }, [{ id: "main", type: "main-product", settings: {}, blocks: [{ id: "title", type: "title", settings: {} }, { id: "offers", type: OFFERS_APP_BLOCK, settings: {} }, { id: "buy", type: "buy_buttons", settings: {} }] }])
      check("Dawn's main product draws the block where it was placed", main.includes('data-sl-offers=""') && main.includes(home.breaks[0].tiers[1].at[TEEV].total), main.slice(main.indexOf("data-sl-offers") - 200, main.indexOf("data-sl-offers") + 300))
      const featured = draw({ designMode: false, host: "shop.test", products: [shownCard], collections: [], menus: {}, shop, template: "index", path: "/" }, [{ id: "fp", type: "featured-product", settings: { product: TEE }, blocks: [{ id: "t", type: "title", settings: {} }, { id: "o", type: OFFERS_APP_BLOCK, settings: {} }] }])
      check("  and a Featured product on the home page, for the product it features", featured.includes('data-sl-offers=""') && featured.includes("Tee and mug"), featured.length)
      const { productAppBlockSchema } = await import("../lib/storelib-theme/compat/product-app-blocks")
      check("  listed with Storelib's app blocks for Add block (a theme's @app sections)", productAppBlockSchema(OFFERS_APP_BLOCK)?.name === "Bundles and upsells")
    }
    const site = read("lib/website-builder/compat-site.ts")
    check("the live site gives each product's page and each Featured product its offers and figures", /m\.withOffersShown\(\{ id: card\.id, settings: own \}/.test(site) && /catalogOffers\(admin, creator\.creatorId, cards\.map/.test(site))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
