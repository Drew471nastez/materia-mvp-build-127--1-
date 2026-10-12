/**
 * THE WEBSITE'S CHECKOUT, FOR THINGS THAT SHIP (round H1)
 *
 * "When it's a physical product, in the checkout I cannot change quantity
 * or remove items, and on the right side there are none of the inputs that
 * are required and controlled from the settings for physical e-commerce."
 *
 *   LINES      - / + and Remove on each line, held to stock and the per order
 *              limit the server names (maxQuantity), the cart kept in step
 *   LIMIT      a cart over "up to N per order" is lowered and named, not refused
 *   SHORT      a line short of stock stays in the order to be lowered there
 *   ZONES      the country list is the shop's shipping countries; a country it
 *              doesn't ship to is said
 *   FIELDS     Settings › Checkout, page and server alike: the phone for every
 *              physical order (a thing handed over too); company and apartment
 *              with the address, checked with it
 *   SERVER     every quantity priced again from the database
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/site-checkout-physical.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import { applyAdjusted, fieldPlan, missingField, sameLine, setLineQuantity, shipsToCountries, themeCartAfter } from "@/lib/checkout/site-checkout"
import { clampToLimits, shippedQuote } from "@/lib/checkout/site-quote-server"
import { DEFAULT_CHECKOUT } from "@/lib/store/checkout-config"
import type { ShippingProfile } from "@/lib/physical/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))

const SHOP = "5b1c0000-0000-4000-8000-000000000001"
const SLEEVE = "5b1c0000-0000-4000-8000-0000000000a1"
const M = "5b1c0000-0000-4000-8000-0000000000b1"
const S = "5b1c0000-0000-4000-8000-0000000000b2"
const STUDIO = "5b1c0000-0000-4000-8000-0000000000c1"

function shop(over: { maxPerOrder?: number | null; levelM?: number; requiresShipping?: boolean } = {}) {
  const rate = (r: Record<string, unknown>) => ({ creator_id: SHOP, active: true, position: 0, tiers: [], min_value: null, max_value: null, free_over_cents: null, min_days: 2, max_days: 4, ...r })
  return fakeDb({
    products: [
      { id: SLEEVE, creator_id: SHOP, title: "Black Sleeve", slug: "black-sleeve", type: "physical", status: "published", price_cents: 3500, thumbnail_url: null, requires_shipping: over.requiresShipping ?? true, weight_grams: 200, taxable: true, track_inventory: true, continue_selling: false, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: null, max_per_order: over.maxPerOrder ?? null },
    ],
    product_variants: [
      { id: M, product_id: SLEEVE, name: "M", price_cents: 3500, weight_grams: 200, track_inventory: true, inventory_policy: "deny", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null },
      { id: S, product_id: SLEEVE, name: "S", price_cents: 3500, weight_grams: 200, track_inventory: true, inventory_policy: "deny", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null },
    ],
    commerce_settings: [{ creator_id: SHOP, default_location_id: STUDIO, unit_system: "metric", returns_enabled: true, return_window_days: 30, tax_mode: "none", low_stock_default: 5, low_stock_alerts: true }],
    inventory_locations: [{ id: STUDIO, creator_id: SHOP, name: "Studio", kind: "home", country: "RO", city: "Cluj", address_line1: "Str. Lunga 1", postal_code: "400001", active: true, fulfills_orders: true, holds_inventory: true, priority: 0, forwarding: "none", pickup_enabled: true, pickup_instructions: "Side door", pickup_ready: "2h", pickup_hours: "Mon to Fri 9:00 to 17:00" }],
    inventory_levels: [
      { variant_id: M, location_id: STUDIO, creator_id: SHOP, available: over.levelM ?? 3 },
      { variant_id: S, location_id: STUDIO, creator_id: SHOP, available: 10 },
    ],
    shipping_profiles: [{ id: "general", creator_id: SHOP, name: "General", is_default: true, created_at: "2026-01-01" }],
    shipping_zones: [
      { id: "z-ro", creator_id: SHOP, profile_id: "general", name: "Romania", countries: ["RO"], regions: [], rest_of_world: false },
      { id: "z-gb", creator_id: SHOP, profile_id: "general", name: "UK", countries: ["GB"], regions: [], rest_of_world: false },
      { id: "z-fr", creator_id: SHOP, profile_id: "general", name: "France (no rate)", countries: ["FR"], regions: [], rest_of_world: false },
    ],
    shipping_rates: [rate({ id: "r-ro", zone_id: "z-ro", name: "Standard", kind: "flat", price_cents: 1500 }), rate({ id: "r-gb", zone_id: "z-gb", name: "Standard", kind: "flat", price_cents: 2500 })],
    shipping_packages: [],
  })
}

async function main() {
  /* The website checkout hands a cart with something physical to shippedQuote (siteQuote, basketDecision "ships"); called directly, as the flag is read through Next's cache. */
  section("LINES: - / + and Remove change only ids and quantities")
  {
    const items = [{ productId: SLEEVE, variantId: M, quantity: 1 }, { productId: SLEEVE, variantId: S, quantity: 1 }]
    check("+ raises one line", JSON.stringify(setLineQuantity(items, { productId: SLEEVE, variantId: M }, 2).map((i) => i.quantity)) === "[2,1]")
    check("held to the line's max", setLineQuantity(items, { productId: SLEEVE, variantId: M }, 9, 3)[0].quantity === 3)
    check("Remove (0) takes the line out, the other stays", JSON.stringify(setLineQuantity(items, { productId: SLEEVE, variantId: M }, 0)) === JSON.stringify([items[1]]))
    check("removing the last line leaves an empty cart", setLineQuantity([items[0]], { productId: SLEEVE, variantId: M }, 0).length === 0)
    check("a line sent with no option is the product's only option the server named", sameLine({ productId: SLEEVE, variantId: null }, { productId: SLEEVE, variantId: M }) && !sameLine({ productId: SLEEVE, variantId: S }, { productId: SLEEVE, variantId: M }))
    check("the same line twice (a theme's properties) becomes one", setLineQuantity([items[0], { ...items[0] }, items[1]], { productId: SLEEVE, variantId: M }, 2).length === 2)
    check("the server's lowered quantities replace what was asked", applyAdjusted(items, [{ productId: SLEEVE, variantId: S, quantity: 0 }]).length === 1)
    const theme = [{ k: "a", p: SLEEVE, v: M, q: 1 }, { k: "b", p: SLEEVE, v: S, q: 4 }, { k: "c", p: "other", v: null, q: 1 }]
    const after = themeCartAfter(theme, [{ productId: SLEEVE, variantId: M, quantity: 3 }])
    check("an imported theme's cart cookie follows: changed, removed, nothing added", after.length === 1 && after[0].k === "a" && after[0].q === 3, after)
  }

  section("SERVER: priced again from the database, with how far each line may go")
  {
    const q = await shippedQuote(shop() as never, SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 1, unitCents: 1 }, { productId: SLEEVE, variantId: S, quantity: 2 }], country: "RO" }, null)
    check("a physical cart is a cart that ships, with the address and delivery asked", q.ok === true && q.quote.kind === "ships" && q.quote.requiresShipping && q.quote.physical === true, q)
    if (q.ok) {
      const m = q.quote.lines.find((l) => l.variantId === M)!
      const s = q.quote.lines.find((l) => l.variantId === S)!
      check("prices are the database's, a sent price never read", m.unitCents === 3500 && q.quote.totals.itemsSubtotalCents === 10500, q.quote.totals)
      check("+ stops at stock: M has 3 at the studio, S 10", m.maxQuantity === 3 && s.maxQuantity === 10, { m: m.maxQuantity, s: s.maxQuantity })
      check("shipping for Romania in the total", q.quote.delivery.options[0]?.priceCents === 1500 && q.quote.totals.totalCents === 12000, q.quote.totals)
      check("the country list is the zones with a rate (France has none yet)", JSON.stringify(q.quote.shipsTo) === JSON.stringify(["GB", "RO"]), q.quote.shipsTo)
      check("pickup is offered, with its hours", q.quote.pickups.length === 1 && q.quote.pickups[0].hours === "Mon to Fri 9:00 to 17:00", q.quote.pickups)
    }
    const more = await shippedQuote(shop() as never, SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 2 }, { productId: SLEEVE, variantId: S, quantity: 2 }], country: "RO" }, null)
    check("a quantity change is priced again", more.ok === true && more.quote.totals.itemsSubtotalCents === 14000)
    const fr = await shippedQuote(shop() as never, SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 1 }], country: "FR" }, null)
    check("a country the shop doesn't ship to: no options, the reason given", fr.ok === true && fr.quote.delivery.ok === false && !!fr.quote.delivery.error && fr.quote.delivery.options.length === 0, fr.ok ? fr.quote.delivery : fr)
  }

  section("NOT SHIPPED: \"This product is shipped\" off, or a row written without it")
  {
    const hand = await shippedQuote(shop({ requiresShipping: false }) as never, SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 1 }] }, null)
    check("no address is asked, and it is still a physical order with - / +", hand.ok === true && !hand.quote.requiresShipping && hand.quote.physical === true && hand.quote.lines[0].maxQuantity === 3, hand)
    const sql = readFileSync(join(process.cwd(), "supabase/sql/run-now/161_physical_products_ship_by_default.sql"), "utf8")
    check("part 161: a physical product ships by default, as every reader already assumes; no rows changed", /ALTER TABLE public\.products ALTER COLUMN requires_shipping SET DEFAULT true;/.test(sql) && !/^UPDATE/im.test(sql) && sql.trim().split("\n").every((l) => l.trim().endsWith(";") || l.trim().endsWith("*/")))
  }

  section("LIMIT and SHORT")
  {
    check("clampToLimits lowers the last lines of a product first", JSON.stringify(clampToLimits([{ productId: "p", variantId: "a", quantity: 2 }, { productId: "p", variantId: "b", quantity: 2 }], new Map([["p", 3]])).items.map((i) => i.quantity)) === "[2,1]")
    const lim = await shippedQuote(shop({ maxPerOrder: 2 }) as never, SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 1 }, { productId: SLEEVE, variantId: S, quantity: 3 }], country: "RO" }, null)
    check("over the per order limit: lowered and named, the page not refused", lim.ok === true && lim.quote.adjusted?.length === 1 && lim.quote.adjusted[0].limit === 2 && lim.quote.lines.reduce((n, l) => n + l.quantity, 0) === 2, lim)
    if (lim.ok) check("and + stops where the limit is reached, options counted together", lim.quote.lines.every((l) => l.maxQuantity === l.quantity), lim.quote.lines)
    const short = await shippedQuote(shop({ levelM: 2 }) as never, SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 5 }, { productId: SLEEVE, variantId: S, quantity: 1 }], country: "RO" }, null)
    check("short of stock: the line stays in the order with what is left", short.ok === true && short.quote.short?.length === 1 && short.quote.short[0].quantity === 5 && short.quote.short[0].available === 2 && short.quote.stockIssues.length === 1, short)
  }

  section("ZONES: the countries a cart can go to")
  {
    const rate = { id: "r", zoneId: "z", name: "Std", kind: "flat", priceCents: 100, tiers: [], minValue: null, maxValue: null, freeOverCents: null, minDays: null, maxDays: null, active: true, position: 0 } as unknown as ShippingProfile["zones"][number]["rates"][number]
    const zone = (countries: string[], extra: Partial<ShippingProfile["zones"][number]> = {}) => ({ id: countries.join(), profileId: "p", name: "z", countries, regions: [], restOfWorld: false, rates: [rate], ...extra })
    const a: ShippingProfile = { id: "a", name: "A", isDefault: true, zones: [zone(["RO", "GB"]), zone(["US"], { regions: [], rates: [{ ...rate, active: false }] })] }
    const b: ShippingProfile = { id: "b", name: "B", isDefault: false, zones: [zone(["RO"]), zone([], { regions: ["CA-ON"] })] }
    const world: ShippingProfile = { id: "w", name: "W", isDefault: false, zones: [zone([], { restOfWorld: true })] }
    check("a zone with no rate on doesn't count", JSON.stringify(shipsToCountries([a], [null])) === JSON.stringify(["GB", "RO"]))
    check("two profiles in one cart: what both reach", JSON.stringify(shipsToCountries([a, b], ["a", "b"])) === JSON.stringify(["RO"]))
    check("a zone of states counts for its country", (shipsToCountries([b], ["b"]) ?? []).includes("CA"))
    check("Rest of world is anywhere", shipsToCountries([world], ["w"]) === null)
    check("a location's local delivery country is added", (shipsToCountries([a], [null], ["DE"]) ?? []).includes("DE"))
    check("no shipping set up: only local delivery countries, else none", JSON.stringify(shipsToCountries([], [null], [])) === "[]")
  }

  section("FIELDS: Settings › Checkout, on the page and the server")
  {
    const strict = { ...DEFAULT_CHECKOUT, phone: "required" as const, company: "required" as const, address2: "required" as const }
    check("a physical product handed over in person still asks the phone", fieldPlan(strict, { ships: false, physical: true }).phone === "required" && fieldPlan(strict, { ships: false, physical: true }).company === "off")
    check("a download never does", fieldPlan(strict, { ships: false }).phone === "off")
    check("a shipped order asks company, phone and apartment as set", JSON.stringify(Object.values(fieldPlan(strict, { ships: true })).slice(1, 4)) === JSON.stringify(["required", "required", "required"]))
    check("the phone required is refused when missing", missingField(fieldPlan(strict, { ships: false, physical: true }), { email: "a@b.co", first: "Ana", last: "" }) === "phone")
    const route = code("app/api/checkout/site/route.ts")
    check("the server checks the phone for any physical order, and leaves company and apartment to the address check", /fieldPlan\(config, \{ ships: false, physical: order\.ships \}\)/.test(route) && /phone: clean\(body\.phone, 40\) \|\| clean\(address\.phone, 40\)/.test(route))
    check("the held checkout reads the address with the same settings", /readAddress\(input\.address, config\)/.test(code("lib/physical/checkout-server.ts")))
    const page = code("app/checkout/site/site-checkout.tsx")
    check("the page draws the phone for a physical order that ships nothing", /!ships && physical && plan\.phone !== "off"/.test(page))
    check("the page lists only the shop's countries and says when it doesn't ship there", /shipsTo\.includes\(c\.code\) \|\| c\.code === address\.country/.test(page) && /We don't ship to \$\{countryName\(address\.country\)\}/.test(page))
    check("each line has - / + and Remove, + held to the server's max", /data-qty-plus="" disabled=\{atMax\}/.test(page) && /data-line-remove=""/.test(page) && /max=\{l\.maxQuantity \?\? l\.quantity\}/.test(page))
    check("a change keeps the address bar, the site's cart and the theme's cookie in step", /url\.searchParams\.set\("items", encodeItems\(next\)\)/.test(page) && /window\.localStorage\.setItem\(key, serializeCart\(kept\)\)/.test(page) && /call\(\{ action: "cart", items: next \}\)/.test(page))
    check("the order can't change once paying has started", /const editable = !busy && !paid && !settled && !arriving/.test(page))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
