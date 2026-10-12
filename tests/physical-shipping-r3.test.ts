/**
 * Round R3: physical commerce settings, end to end.
 *
 *   The quoting matrix      flat, free, price steps, weight steps with the
 *                           package, item weight, free over, limits, several
 *                           profiles, as the checkout quotes them
 *   States and provinces    every way a zone can name part of a country
 *   Units                   typed, stored and read back exactly
 *   Inventory               stock left, the low stock line, restock on a
 *                           full refund before shipping
 *   The website             stock, free shipping and returns as a website
 *                           shows them, native and imported themes
 *   The wiring              settings UI to API to database to checkout
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/physical-shipping-r3.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { freeShippingFrom, partOfCountry, pickOption, quoteDelivery, ratePrice, zoneFor, type QuoteLine } from "@/lib/physical/rates"
import { regionCode, regionKey } from "@/lib/physical/regions"
import { dimensionUnitFor, formatSize, fromGrams, fromMm, smallWeightUnitFor, toGrams, toMm, weightUnitFor } from "@/lib/physical/units"
import { lowStockLine, physicalStock, variantStock } from "@/lib/physical/storefront-stock"
import { refundReleasesStock } from "@/lib/physical/status"
import { readZonePlaces, zoneClash } from "@/lib/physical/config-server"
import { lowStock, lowStockThreshold } from "@/lib/products/product-page-model"
import { DEFAULT_LOW_STOCK_TEXT, freeShippingLine, returnFactsHtml, returnsLine, siteCommerce } from "@/lib/website-builder/site-commerce"
import type { ShippingProfile, ShippingRate, ShippingZone } from "@/lib/physical/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

let n = 0
const rate = (r: Partial<ShippingRate>): ShippingRate => ({ id: `r${++n}`, zoneId: "z", name: "Standard", kind: "flat", priceCents: 500, minValue: null, maxValue: null, tiers: [], freeOverCents: null, minDays: null, maxDays: null, active: true, position: n, ...r })
const zone = (z: Partial<ShippingZone>): ShippingZone => ({ id: `z${++n}`, profileId: "p", name: "Zone", countries: [], regions: [], restOfWorld: false, rates: [rate({})], ...z })
const profile = (zones: ShippingZone[], p: Partial<ShippingProfile> = {}): ShippingProfile => ({ id: "p", name: "General", isDefault: true, zones, ...p })
const line = (l: Partial<QuoteLine>): QuoteLine => ({ shippingProfileId: null, quantity: 1, lineCents: 2000, weightGrams: 500, requiresShipping: true, ...l })
type Ok = { ok: true; required: true; options: { id: string; name: string; priceCents: number }[] }
const prices = (q: ReturnType<typeof quoteDelivery>) => (q.ok && q.required ? (q as Ok).options.map((o) => o.priceCents) : null)

async function main() {
  console.log("\nThe quoting matrix\n")
  {
    const t = (cents: number, grams: number, items?: { grams: number; quantity: number }[]) => ({ units: 1, cents, grams, items: items ?? [{ grams, quantity: 1 }] })
    check("flat: its price, whatever the order", ratePrice(rate({ priceCents: 700 }), t(100, 10)) === 700 && ratePrice(rate({ priceCents: 700 }), t(100000, 90000)) === 700)
    check("flat at $0 is free", ratePrice(rate({ priceCents: 0 }), t(100, 10)) === 0)
    check("free: always, or only from its order value", ratePrice(rate({ kind: "free", priceCents: 0 }), t(1, 1)) === 0 && ratePrice(rate({ kind: "free", priceCents: 0, minValue: 5000 }), t(4999, 1)) === null && ratePrice(rate({ kind: "free", priceCents: 0, minValue: 5000 }), t(5000, 1)) === 0)
    const byPrice = rate({ kind: "price", tiers: [{ from: 0, priceCents: 800 }, { from: 5000, priceCents: 400 }, { from: 10000, priceCents: 0 }] })
    check("price steps: the last step the order reaches", ratePrice(byPrice, t(4999, 0)) === 800 && ratePrice(byPrice, t(5000, 0)) === 400 && ratePrice(byPrice, t(25000, 0)) === 0)
    const byWeight = rate({ kind: "weight", tiers: [{ from: 0, priceCents: 500 }, { from: 1000, priceCents: 900 }, { from: 5000, priceCents: 2000 }], maxValue: 20000 })
    check("weight steps: by total weight, and not offered over its limit", ratePrice(byWeight, t(0, 999)) === 500 && ratePrice(byWeight, t(0, 1000)) === 900 && ratePrice(byWeight, t(0, 5000)) === 2000 && ratePrice(byWeight, t(0, 20001)) === null)
    const each = rate({ kind: "item_weight", tiers: [{ from: 0, priceCents: 300 }, { from: 1000, priceCents: 700 }], maxValue: 3000 })
    check("item weight: each item priced by its own weight, added up", ratePrice(each, t(0, 0, [{ grams: 500, quantity: 2 }, { grams: 1500, quantity: 1 }])) === 300 * 2 + 700)
    check("  and none of it when one item is over the limit", ratePrice(each, t(0, 0, [{ grams: 500, quantity: 1 }, { grams: 3001, quantity: 1 }])) === null)
    check("free over X on a flat rate", ratePrice(rate({ priceCents: 600, freeOverCents: 7500 }), t(7499, 0)) === 600 && ratePrice(rate({ priceCents: 600, freeOverCents: 7500 }), t(7500, 0)) === 0)
    check("free over X on weight steps too", ratePrice({ ...byWeight, freeOverCents: 10000 }, t(10000, 4000)) === 0 && ratePrice({ ...byWeight, freeOverCents: 10000 }, t(9999, 4000)) === 900)
    check("a rate switched off is never offered", ratePrice(rate({ active: false }), t(1, 1)) === null)
    check("a carrier rate with no live quote is left out, never guessed", ratePrice(rate({ kind: "carrier" }), t(1, 1)) === null)

    const general = profile([zone({ countries: ["US"], rates: [rate({ id: "std", name: "Standard", priceCents: 500 }), rate({ id: "exp", name: "Express", priceCents: 1500, minDays: 1, maxDays: 2 }), rate({ id: "off", name: "Old", priceCents: 100, active: false })] })])
    const q = quoteDelivery([general], [line({ quantity: 2 })], "US")
    check("the checkout gets every rate that applies, cheapest first, none switched off", JSON.stringify(prices(q)) === "[500,1500]")
    check("the option the buyer picked is found again when they pay; a made up one is not", pickOption(q, "exp")?.priceCents === 1500 && pickOption(q, "nope") === null && pickOption(q, 42) === null)

    const weighted = profile([zone({ countries: ["US"], rates: [rate({ kind: "weight", tiers: [{ from: 0, priceCents: 500 }, { from: 1000, priceCents: 900 }] })] })])
    check("weight rates count the default package once per parcel: 800 g plus a 250 g box is the 1 kg step", JSON.stringify(prices(quoteDelivery([weighted], [line({ weightGrams: 400, quantity: 2 })], "US", undefined, { packageGrams: 250 }))) === "[900]" && JSON.stringify(prices(quoteDelivery([weighted], [line({ weightGrams: 400, quantity: 2 })], "US"))) === "[500]")
    check("free over counts what the buyer pays after their code", JSON.stringify(prices(quoteDelivery([profile([zone({ countries: ["US"], rates: [rate({ priceCents: 600, freeOverCents: 5000 })] })])], [line({ lineCents: 4999 })], "US"))) === "[600]")

    const heavy = profile([zone({ countries: ["US"], rates: [rate({ id: "hs", name: "Standard", priceCents: 2000 }), rate({ id: "hf", name: "Freight", priceCents: 4000 })] })], { id: "heavy", name: "Heavy", isDefault: false })
    const both = quoteDelivery([general, heavy], [line({}), line({ shippingProfileId: "heavy" })], "US")
    check("two profiles in one cart: a name both offer is one option at the sum", both.ok && both.required && (both as Ok).options.length === 1 && (both as Ok).options[0].name === "Standard" && (both as Ok).options[0].priceCents === 2500)
    const odd = profile([zone({ countries: ["US"], rates: [rate({ name: "Freight", priceCents: 4000 })] })], { id: "odd", isDefault: false })
    const none = quoteDelivery([general, odd], [line({}), line({ shippingProfileId: "odd" })], "US")
    check("  no shared name: the cheapest of each, together, as Standard shipping", none.ok && none.required && (none as Ok).options[0].name === "Standard shipping" && (none as Ok).options[0].priceCents === 4500)
    check("a product whose profile no longer exists ships on the general rates", JSON.stringify(prices(quoteDelivery([general], [line({ shippingProfileId: "gone" })], "US"))) === "[500,1500]")
    check("nothing that ships: no delivery asked for", (() => { const x = quoteDelivery([general], [line({ requiresShipping: false })], "US"); return x.ok && !x.required })())
  }

  console.log("\nStates and provinces, every combination\n")
  {
    const usWhole = zone({ id: "us", name: "United States", countries: ["US"], rates: [rate({ priceCents: 500 })] })
    const akhi = zone({ id: "akhi", name: "Alaska and Hawaii", regions: ["US-AK", "US-HI"], rates: [rate({ priceCents: 2500 })] })
    const row = zone({ id: "row", name: "Rest of world", restOfWorld: true, rates: [rate({ priceCents: 4000 })] })
    const at = (p: ShippingProfile, country: string, region: string | null) => zoneFor(p, { country, region })?.id ?? null

    const a = profile([usWhole, akhi, row])
    check("whole country plus some states: the state zone wins for its states, the country zone for the rest", at(a, "US", "AK") === "akhi" && at(a, "US", "HI") === "akhi" && at(a, "US", "CA") === "us" && at(a, "US", null) === "us" && at(a, "FR", null) === "row")

    const lower48 = zone({ id: "l48", name: "Lower 48", regions: ["US-CA", "US-NY", "US-TX"], rates: [rate({ priceCents: 600 })] })
    const b = profile([lower48])
    check("only some states: those are shipped to", at(b, "US", "CA") === "l48" && at(b, "US", "New York") === "l48")
    check("  the others are not", at(b, "US", "AK") === null)
    const c = profile([lower48, row])
    check("only some states plus Rest of world: Rest of world never picks up the states left out", at(c, "US", "AK") === null && at(c, "US", null) === null && at(c, "DE", null) === "row" && at(c, "CA", "ON") === "row")
    check("  and the profile knows it ships to part of the country only", partOfCountry(c, "us") && !partOfCountry(c, "DE") && !partOfCountry(a, "US"))

    const twoCountries = zone({ id: "na", name: "Near", regions: ["US-WA", "CA-BC"], rates: [rate({ priceCents: 700 })] })
    const d = profile([twoCountries, zone({ id: "ca", countries: ["CA"], rates: [rate({ priceCents: 1200 })] }), row])
    check("states of two countries in one zone; a whole country beside it", at(d, "US", "WA") === "na" && at(d, "CA", "BC") === "na" && at(d, "CA", "QC") === "ca" && at(d, "US", "OR") === null && at(d, "MX", null) === "row")

    check("a state is read by code, name, any case, ISO form or without accents", regionCode("US", "ca") === "CA" && regionCode("US", "California") === "CA" && regionCode("US", "US-CA") === "CA" && regionCode("CA", "Québec") === "QC" && regionCode("CA", "quebec") === "QC" && regionKey("AU", "new south wales") === "AU-NSW" && regionCode("US", "Atlantis") === null && regionCode("FR", "Paris") === null)
    check("  so a quote follows a state however the address spells it", JSON.stringify(prices(quoteDelivery([a], [line({})], { country: "US", region: "US-HI" }))) === "[2500]" && JSON.stringify(prices(quoteDelivery([a], [line({})], { country: "us", region: "hawaii" }))) === "[2500]")

    const noState = quoteDelivery([c], [line({})], { country: "US", region: "" })
    check("no state yet where only some are shipped to: the buyer is asked for it", noState.ok === false && noState.needsRegion === true && /state or province/.test(noState.error))
    const leftOut = quoteDelivery([c], [line({})], { country: "US", region: "AK" })
    check("a state left out: shipping isn't available there, and no state is asked for", leftOut.ok === false && !leftOut.needsRegion && /isn't available/.test(leftOut.error))
    const heavyWhole = profile([zone({ countries: ["US"], rates: [rate({ priceCents: 3000 })] })], { id: "heavy", isDefault: false })
    const mixed = quoteDelivery([c, heavyWhole], [line({}), line({ shippingProfileId: "heavy" })], { country: "US", region: "AK" })
    check("two profiles, one shipping to some states only: the cart can't ship to the others, and says which profile", mixed.ok === false && mixed.unshippableProfileIds.join() === "p")
    check("  and to a listed state both quote and add up", JSON.stringify(prices(quoteDelivery([c, heavyWhole], [line({}), line({ shippingProfileId: "heavy" })], { country: "US", region: "TX" }))) === "[3600]")

    check("a country chosen whole and some of its states is the whole country", (() => { const r = readZonePlaces({ countries: ["us", "DE"], regions: ["US-AK", "CA-ON", "US-ZZ"] }); return r.ok && r.countries.join() === "US,DE" && r.regions.join() === "CA-ON" })())
    check("  and nothing chosen is refused", readZonePlaces({ countries: [], regions: [] }).ok === false)
    const zones = [{ id: "z1", name: "Europe", countries: ["DE", "FR"], regions: [], restOfWorld: false }, { id: "z2", name: "Alaska", countries: [], regions: ["US-AK"], restOfWorld: false }, { id: "z3", name: "Rest of world", countries: [], regions: [], restOfWorld: true }]
    check("one country or state in one zone of a profile: a second zone naming it is refused, by name", /Germany is already in the Europe zone/.test(zoneClash(zones, ["DE"], []) ?? "") && /Alaska is already in the Alaska zone/.test(zoneClash(zones, [], ["US-AK"]) ?? ""))
    check("  editing a zone doesn't clash with itself, and a new state of a whole country is allowed", zoneClash(zones, ["DE"], [], "z1") === null && zoneClash(zones, [], ["US-HI"]) === null && zoneClash(zones, ["US"], []) === null)
  }

  console.log("\nUnits\n")
  {
    check("the shop's units: kg and cm, lb and in, and grams or ounces for a box", weightUnitFor("metric") === "kg" && weightUnitFor("imperial") === "lb" && dimensionUnitFor("metric") === "cm" && dimensionUnitFor("imperial") === "in" && smallWeightUnitFor("metric") === "g" && smallWeightUnitFor("imperial") === "oz")
    check("typed, stored in grams, read back as typed: 1 lb is 454 g and reads 1, not 1.001", toGrams("1", "lb") === 454 && fromGrams(454, "lb") === 1 && fromGrams(toGrams("2.5", "lb"), "lb") === 2.5 && fromGrams(toGrams("0.75", "lb"), "lb") === 0.75)
    check("  ounces and kilos too", fromGrams(toGrams("8", "oz"), "oz") === 8 && fromGrams(toGrams("1.234", "kg"), "kg") === 1.234 && fromGrams(1500, "kg") === 1.5 && fromGrams(200, "g") === 200)
    check("  a comma is a decimal point, and nonsense is nothing", toGrams("1,5", "kg") === 1500 && toGrams("abc", "kg") === null && toGrams("-1", "kg") === null && fromGrams(null, "kg") === null)
    check("lengths the same way: 12 in is 305 mm and reads 12", toMm("12", "in") === 305 && fromMm(305, "in") === 12 && fromMm(toMm("12.5", "in"), "in") === 12.5 && fromMm(300, "cm") === 30)
    check("a box's size in the shop's system", formatSize(300, 200, 100, "metric") === "30 × 20 × 10 cm" && formatSize(305, 203, 102, "imperial") === "12 × 8 × 4 in")
    let all = true
    for (const unit of ["kg", "lb", "oz", "g"] as const) for (const typed of ["0.1", "0.5", "1", "1.25", "3", "10", "22.5"]) {
      const g = toGrams(typed, unit)
      if (g === null || toGrams(String(fromGrams(g, unit)), unit) !== g) all = false
    }
    check("every value read back and saved again is the same stored weight (no drift on each save)", all)
    const settings = read("components/physical/shipping-settings.tsx")
    check("rates, packages and their sizes are typed in the shop's units, never a fixed cm or g", /weightUnitFor\(system\)/.test(settings) && /dimensionUnitFor\(system\)/.test(settings) && /smallWeightUnitFor\(system\)/.test(settings) && !/suffix="cm"/.test(settings) && !/suffix="g"/.test(settings) && /formatSize\(p\.lengthMm, p\.widthMm, p\.heightMm, system\)/.test(settings))
  }

  console.log("\nInventory\n")
  {
    check("the low stock line: the product's own, else the shop's, else 5", lowStockLine(3, 8) === 3 && lowStockLine(null, 8) === 8 && lowStockLine(undefined, undefined) === 5 && lowStockLine(0, 8) === 1)
    const s = (available: number, o: Partial<{ tracked: boolean; keepSelling: boolean; lowAt: number }> = {}) => variantStock(available, { tracked: true, keepSelling: false, lowAt: 5, ...o })
    check("tracked: sold out at none, the number when few, quantity capped at what's left", s(0).soldOut && s(0).maxQuantity === 0 && s(3).left === 3 && s(3).maxQuantity === 3 && !s(3).soldOut)
    check("  plenty is said as nothing", s(50).left === null && s(50).maxQuantity === 50)
    check("  a shop line above ten still says the number up to it", s(14, { lowAt: 15 }).left === 14 && s(16, { lowAt: 15 }).left === null)
    check("untracked or keep selling: never sold out, no number", !s(0, { tracked: false }).soldOut && s(0, { tracked: false }).maxQuantity === 999 && !s(0, { keepSelling: true }).soldOut && s(2, { keepSelling: true }).left === null)
    check("the product page's low stock block: its own number when set, else the product's line", lowStockThreshold(3, 8) === 3 && lowStockThreshold(0, 8) === 8 && lowStockThreshold("", 7) === 7 && lowStockThreshold(undefined, null) === 5 && lowStock(8, lowStockThreshold(0, 8)) && !lowStock(9, lowStockThreshold(0, 8)))

    /* A database that answers what physicalStock asks, and nothing else. */
    const rows: Record<string, unknown> = {
      commerce_settings: { low_stock_default: 7 },
      inventory_locations: [{ id: "L1" }, { id: "L2" }],
      inventory_levels: [{ variant_id: "v1", available: 4 }, { variant_id: "v1", available: 2 }, { variant_id: "v2", available: 30 }, { variant_id: "v3", available: -2 }],
    }
    const db = {
      from(table: string) {
        const q = {
          select: () => q,
          eq: () => q,
          in: () => q,
          maybeSingle: async () => ({ data: rows[table] ?? null }),
          then: (res: (v: { data: unknown }) => unknown) => Promise.resolve({ data: rows[table] ?? [] }).then(res),
        }
        return q
      },
    }
    const stock = await physicalStock(db, { creator_id: "c", track_inventory: true, continue_selling: false, low_stock_threshold: null }, [{ id: "v1", name: "S" }, { id: "v2", name: "M" }, { id: "v3", name: "L" }, { id: "v4", name: "Archived XL" }])
    check("stock is added up across the locations that ship, and says the shop's line", stock.get("v1")?.left === 6 && stock.get("v1")?.lowAt === 7 && stock.get("v2")?.left === null && stock.get("v3")?.soldOut === true && !stock.has("v4"))
    const own = await physicalStock(db, { creator_id: "c", low_stock_threshold: 2 }, [{ id: "v1", name: "S" }])
    check("  a product's own line beats the shop's", own.get("v1")?.lowAt === 2)

    const order = (o: Partial<Parameters<typeof refundReleasesStock>[0]>) => refundReleasesStock({ totalCents: 5000, refundedCents: 5000, cancelledAt: null, shipments: [], lines: [{ type: "physical" }], ...o })
    check("refunded in full before shipping: the stock goes back", order({}))
    check("  not for a partial refund, after shipping, twice, or with nothing physical", !order({ refundedCents: 4999 }) && !order({ shipments: [{ status: "shipped" }] }) && !order({ cancelledAt: "2026-01-01" }) && !order({ lines: [{ type: "digital" }] }))
    check("  a cancelled shipment doesn't count as shipped", order({ shipments: [{ status: "cancelled" }] }))
    const orders = read("lib/physical/orders-server.ts")
    check("both refund paths release it: the Refund button and a refund made in Stripe", (orders.match(/await releaseRefundedStock\(db, creatorId, updated, "(creator|webhook)"\)/g) ?? []).length === 2 && /physical_cancel_unfulfilled", \{ p_checkout: order\.id \}/.test(orders) && /key: `refund_release:\$\{order\.id\}`/.test(orders))
    const pricing = read("lib/physical/checkout-pricing-server.ts")
    check("out of stock at checkout: refused with how many are left, never oversold", /tracked && policy === "deny" && available < item\.quantity/.test(pricing) && /stockIssues\.push/.test(pricing))
    const stockFile = read("lib/physical/storefront-stock.ts")
    check("the storefront reads the shop's low stock line", /from\("commerce_settings"\)\.select\("low_stock_default"\)/.test(stockFile) && /lowStockLine\(product\.low_stock_threshold, shopLine\)/.test(stockFile))
    check("  and the product page hands the product's own line to it", /low_stock_threshold: row\.low_stock_threshold \?\? null/.test(read("lib/products/product-section-data.ts")))
  }

  console.log("\nThe website: stock, free shipping, returns\n")
  {
    const d = siteCommerce({})
    check("defaults: stock shown with Storelib's words, no banner, no returns line", d.showStockLeft && d.lowStockText === DEFAULT_LOW_STOCK_TEXT && !d.freeShippingBar && d.freeShippingAmount === null && !d.cartReturnsNote)
    const s = siteCommerce({ show_stock_left: false, low_stock_text: " <b>Hurry</b>, {count} to go ", free_shipping_bar: true, free_shipping_threshold: 75, cart_returns_note: true })
    check("each control is read, and the words are cleaned", !s.showStockLeft && s.lowStockText === "bHurry/b, {count} to go" && s.freeShippingBar && s.freeShippingAmount === 75 && s.cartReturnsNote)
    check("an empty or 0 amount means: from the shipping rates", siteCommerce({ free_shipping_threshold: 0 }).freeShippingAmount === null && siteCommerce({ free_shipping_threshold: "" }).freeShippingAmount === null)
    check("the banner counts down, then says it's earned", freeShippingLine(2500, 7500)?.text === "Spend $50.00 more for free shipping" && freeShippingLine(2500, 7500)?.progress === 1 / 3 && freeShippingLine(8000, 7500)?.text === "You have earned free shipping" && freeShippingLine(0, 0)?.text === "Free shipping on every order" && freeShippingLine(100, null) === null)

    const home = profile([
      zone({ countries: ["US"], rates: [rate({ kind: "flat", priceCents: 600, freeOverCents: 7500 }), rate({ kind: "free", priceCents: 0, minValue: 12000, name: "Free" })] }),
      zone({ restOfWorld: true, rates: [rate({ kind: "price", tiers: [{ from: 0, priceCents: 2000 }, { from: 20000, priceCents: 0 }] })] }),
    ])
    check("free shipping from the rates: the lowest order value any rate at home is free", freeShippingFrom(home, "US") === 7500 && freeShippingFrom(home, "DE") === 20000)
    check("  none when no rate is ever free, 0 when one always is", freeShippingFrom(profile([zone({ countries: ["US"] })]), "US") === null && freeShippingFrom(profile([zone({ countries: ["US"], rates: [rate({ kind: "free", priceCents: 0 })] })]), "US") === 0 && freeShippingFrom(null, "US") === null)

    check("the cart's returns line and the policy paragraph say the store's window", returnsLine({ enabled: true, windowDays: 30 }) === "Returns accepted within 30 days of delivery." && returnsLine({ enabled: false, windowDays: 30 }) === null && returnsLine(null) === null && /within 14 days of delivery/.test(returnFactsHtml({ enabled: true, windowDays: 14 })) && /don't accept returns/.test(returnFactsHtml({ enabled: false, windowDays: 14 })) && returnFactsHtml(null) === "")

    const page = read("components/website-builder/theme/ThemePage.tsx")
    check("ThemePage hands the website's choices to every section, and the banner uses the rates when no amount is typed", /commerce: siteCommerce\(theme as Record<string, unknown>\)/.test(page) && /useShopCommerce\(c\.freeShippingBar && c\.freeShippingAmount === null\)/.test(page) && /storefront\?\.pageKey === "refund-policy"/.test(page))
    const blocks = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("the product page's low stock block obeys Show how many are left and the site's words", /commerce\?\.showStockLeft === false/.test(blocks) && /commerce\?\.lowStockText/.test(blocks) && /lowStockThreshold\(s\.threshold, ctx\.product\.low_stock_at\)/.test(blocks))
    const schema = JSON.parse(read("themes/default/sections/product.json")) as { blocks: { type: string; fields: { id: string; default?: unknown; min?: number }[] }[] }
    const threshold = schema.blocks.find((b) => b.type === "low_stock")?.fields.find((f) => f.id === "threshold")
    check("  a new low stock block follows each product's line (0)", threshold?.default === 0 && threshold?.min === 0)
    check("the returns line sits under Check out in the cart drawer and on the cart page", /<CartReturnsNote/.test(read("components/website-builder/sections/renderers/HeaderSection.tsx")) && /<CartReturnsNote/.test(read("components/website-builder/cart-page-body.tsx")))
    check("the live site tells the page which page it is", /* Changed on purpose (round AB): the website in another language. */ /pageKey(, language)?(, words: localizer\?\.words, display: localizer\?\.display)? \}\}/.test(read("app/(site)/w/[username]/render-site.tsx")))
    const shop = read("app/api/physical/storefront/shop/route.ts")
    check("the website reads only returns and the free shipping amount, public, cached, behind the physical switch", /physicalApiGate\(\)/.test(shop) && /shopFacts\(createAdminClient\(\), creatorId\)/.test(shop) && /freeShippingFrom\(general, country\)/.test(read("lib/physical/storefront-facts.ts")) && /s-maxage=60/.test(shop) && !/price_cents|address_line/.test(shop))
    const ws = read("components/website-builder/website-settings/commerce.tsx")
    check("Website settings › Commerce › On this website: four controls, written through the editor", ["show_stock_left", "low_stock_text", "free_shipping_bar", "free_shipping_threshold", "cart_returns_note"].every((k) => ws.includes(`ctx.onSettingChange("${k}"`)) && /\{physical \? <OnThisWebsite ctx=\{ctx\} \/> : null\}/.test(ws))
    const compat = read("lib/website-builder/compat-site.ts")
    const objects = read("lib/storelib-theme/compat/objects.ts")
    /* Round 25: read once for the page (lib/storelib-theme/compat/product-facts*.ts), a count said at or under the store's low stock line (tests/variants25.test.ts drives it). */
    const facts = read("lib/storelib-theme/compat/product-facts.ts")
    check("imported themes: real stock as Shopify's inventory fields, hidden when the website hides it", /pageFactsFor\(admin, creator\.creatorId, card\.id, siteCommerce\(settings as Record<string, unknown>\)\.showStockLeft\)/.test(compat) && /if \(facts\.showLeft\) out\.left = f\.left/.test(facts) && /management: !available \? "shopify" : few !== null \? "shopify" : null/.test(objects) && /inventory_quantity: stock\.quantity/.test(objects))
    check("  and the refund policy (shop.refund_policy, /policies/refund-policy) ends with the store's returns", /handle === "refund-policy" && returnFacts \? `\$\{body\}\$\{returnFacts\}` : body/.test(compat))
  }

  console.log("\nThe wiring: settings, API, database, checkout\n")
  {
    const ui = read("components/physical/ui.tsx")
    check("country search shows each country's flag from the local sprite, no CDN", /<CountryFlag code=\{c\.code\}/.test(ui) && /from "@\/components\/app\/settings\/country-picker"/.test(ui) && !/flagcdn|flagsapi|unpkg|jsdelivr/.test(ui))
    check("  Select all and Clear, over the list as filtered; countries in another zone can't be picked", /data-select-all=""/.test(ui) && /data-clear-all=""/.test(ui) && /disabled=\{blocked\}/.test(ui) && /const free = list\.filter\(\(c\) => !elsewhere\.has\(c\.code\)\)/.test(ui))
    const ship = read("components/physical/shipping-settings.tsx")
    check("states: Select all per country, a whole country's own states dropped, flags on the country chips", /allStatesOn \? "Clear" : "Select all"/.test(ship) && /setRegions\(\(prev\) => prev\.filter\(\(r\) => !next\.includes\(r\.split\("-"\)\[0\]\)\)\)/.test(ship))
    check("adding and editing a zone go to their routes and show the server's reason when refused", /api<\{ profiles: ShippingProfile\[\] \}>\("\/api\/physical\/shipping\/zones", \{ body: \{ profileId: profile\.id, \.\.\.zone \} \}\)/.test(ship) && /\/api\/physical\/shipping\/zones\/\$\{zone\.id\}`, \{ method: "PATCH"/.test(ship) && /if \(!r\.ok\) return r\.error/.test(ship))
    check("a first zone is one tap from the store's country, and a new zone opens its first rate", /Start with \{countryName\(home\)\}/.test(ship) && /fresh && zone\.rates\.length === 0 \? "new" : null/.test(ship) && /first \? "Standard" : "Express"/.test(ship))
    check("custom profiles: rename, pick products, delete", /ProfileProducts/.test(ship) && /addProductIds: add, removeProductIds: remove/.test(ship) && /aria-label=\{`Rename \$\{profile\.name\}`\}/.test(ship))
    const profileRoute = read("app/api/physical/shipping/profiles/[id]/route.ts")
    const config = read("lib/physical/config-server.ts")
    check("  and the server moves only the caller's own physical products", /assignProfileProducts\(c\.db, c\.creatorId, id, body\.addProductIds, body\.removeProductIds\)/.test(profileRoute) && /\.eq\("creator_id", creatorId\)\.eq\("type", "physical"\)\.in\("id", adding\)/.test(config) && /!profile\.is_default/.test(profileRoute))
    check("  which the checkout prices by (products.shipping_profile_id)", /shippingProfileId: p\.shipping_profile_id \?\? null/.test(read("lib/physical/checkout-pricing-server.ts")))
    check("zones can't overlap: both zone routes refuse a clash", /zoneClash\(await profileZones/.test(read("app/api/physical/shipping/zones/route.ts")) && /zoneClash\(await profileZones/.test(read("app/api/physical/shipping/zones/[id]/route.ts")))
    const pkg = read("app/api/physical/packages/[id]/route.ts")
    check("packages: one default, in both places checkout reads it, and the next takes over when it's deleted", /default_package_id: id/.test(pkg) && /left\.length && !left\.some\(\(p\) => p\.isDefault\)/.test(pkg) && /packages\.find\(\(p\) => p\.isDefault\) \?\? packages\.find\(\(p\) => p\.id === s\?\.default_package_id\)/.test(config))
    check("  and the quote adds its weight", /defaultPackageGrams\(db, priced\.creatorId\)/.test(read("lib/physical/checkout-pricing-server.ts")) && /\{ packageGrams \}/.test(read("lib/physical/checkout-pricing-server.ts")))
    check("the checkout is told when a state is needed", /needsRegion: q\.quote\.needsRegion === true/.test(read("app/api/physical/checkout/quote/route.ts")))
    check("a location saves back to the list: drawn from what the server kept, scrolled to, marked Saved", /onSaved\(r\.data\.location, r\.data\.message \?\? null\)/.test(ship) && /scrollIntoView\(\{ block: "nearest"/.test(ship) && /savedId === l\.id/.test(ship))
    check("Who ships the orders: no option that can't work is offered on a new location", /\{initial\?\.forwarding === "provider" \? <option value="provider">/.test(ship))
    const jobs = read("lib/physical/jobs-server.ts")
    check("  and the answer routes the order: emailed to the partner, or sent to the webhook", /loc\.forwarding === "email" && loc\.email/.test(jobs) && /kind: "supplier_email"/.test(jobs) && /kind: "webhook_delivery"/.test(jobs))
    check("the settings read lists the products for the profile cards", /loadShippingProducts\(c\.db, c\.creatorId\)/.test(read("app/api/physical/settings/route.ts")))
  }

  console.log("\nRound AE: the checkout says what the quote means")
  {
    const phys = read("app/checkout/physical/physical-checkout.tsx")
    const site = read("app/checkout/site/site-checkout.tsx")
    check("a shop that ships by state asks for the state, never says it can't ship there", /quote\.delivery\.needsRegion \? \(/.test(phys) && /data-needs-region=""/.test(phys) && /needsRegion\?: boolean/.test(phys))
    check("  and the totals say so too, on both checkouts", /quote\.delivery\.needsRegion \? `Choose your/.test(phys) && /quote\.delivery\.needsRegion && !address\.region\.trim\(\) \? `Choose your/.test(site))
    check("a free shipping code shows every method free, the old price struck through, on both checkouts", /quote\.coupon\?\.freeShipping && o\.priceCents > 0/.test(phys) && /quote\.coupon\?\.freeShipping && o\.priceCents > 0/.test(site))
    check("the total never names its currency twice (RON 51.84)", /money\(t\.totalCents\)\.includes\(CHECKOUT_CURRENCY\.toUpperCase\(\)\) \? null/.test(phys))
    const pricing = read("lib/physical/checkout-pricing-server.ts")
    check("the page and the payment quote the same way (one quoteCheckout)", /export async function quoteCheckout/.test(pricing) && /quoteCheckout\(db, priced, address, input\.deliveryOptionId\)/.test(read("lib/physical/checkout-server.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
