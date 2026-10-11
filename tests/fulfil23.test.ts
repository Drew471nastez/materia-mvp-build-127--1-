/**
 * ROUND 23, FULFILMENT: EVERY SHIPPING, LOCATION, RETURN AND TRACKING
 * SETTING TAKES EFFECT WHERE IT SAYS IT DOES
 *
 *   fulfilment type   the store's answer moves every product that follows it,
 *                     each location says who ships from it, the seller's next
 *                     step is worded by it, the order page's actions follow it
 *   units             metric or imperial changes the words, never a stored
 *                     weight or a rate's price
 *   rates             the checkout server prices the cart from the shop's
 *                     rates (flat, weight with the default package, price
 *                     steps, free over, custom profiles), local delivery by
 *                     postal code, local pickup with its hours; a product
 *                     with no rate can't be bought for delivery, and the
 *                     buyer is told which one and why
 *   settings UI       the "Reload" that showed after "Custom shipping profile"
 *                     is gone; local delivery and pickup hours are on the
 *                     location form
 *   product page      the delivery line from the same rates
 *   locations         saved with pickup hours and local delivery, and still
 *                     saved on a database without part 154
 *   low stock         one email a day at most, listing what sold down
 *   returns           the window counts from delivery (or from shipping with
 *                     no tracking), the return button follows Accept
 *                     returns, reasons kept on the return, a refund counted
 *                     on the return it was for, restock on receipt
 *   tracking          statuses move forward only, a delivery problem can be
 *                     reported and recovered from, emails at each step
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/fulfil23.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { storeFulfilment, MODEL_METHOD } from "@/lib/physical/fulfilment-default"
import { followNewDefault } from "@/lib/physical/fulfilment-default-server"
import { sellerNextStep } from "@/lib/physical/fulfillment"
import { MODEL_LOCATION, readLocation, saveLocationExtra, saveSettings, locationFromRow } from "@/lib/physical/config-server"
import { fromGrams, toGrams } from "@/lib/physical/units"
import { ratePrice, unshippableMessage } from "@/lib/physical/rates"
import { priceCheckout, quoteCheckout } from "@/lib/physical/checkout-pricing-server"
import { deliversTo, isLocalOptionId, localDeliveryFromRow, localDeliveryOptions, localDeliveryPrice, postalKey, readLocalDelivery, readPostalCodes } from "@/lib/physical/local-delivery"
import { deliveryPromise, deliveryPromiseLines } from "@/lib/physical/delivery-promise"
import { canMoveShipment, returnWindow, shipmentLabel } from "@/lib/physical/status"
import { lowStockKey, mergeLowItems, queueLowStockAlerts } from "@/lib/physical/jobs-server"
import { moveReturn, noteRefund, openReturn, returnForRefund, updateShipment } from "@/lib/physical/orders-server"
import { emailIdForJob } from "@/lib/emails/customer-custom"
import { returnFactsHtml } from "@/lib/website-builder/site-commerce"
import { lowStockLine } from "@/lib/physical/storefront-stock"
import type { Location, ShippingProfile, ShippingRate } from "@/lib/physical/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SHOP = "5b1c0000-0000-4000-8000-000000000001"
const HOODIE = "5b1c0000-0000-4000-8000-0000000000a1"
const HOODIE_V = "5b1c0000-0000-4000-8000-0000000000b1"
const POSTER = "5b1c0000-0000-4000-8000-0000000000a2"
const POSTER_V = "5b1c0000-0000-4000-8000-0000000000b2"
const STUDIO = "5b1c0000-0000-4000-8000-0000000000c1"
const PRINTER = "5b1c0000-0000-4000-8000-0000000000c2"

const loc = (l: Partial<Location> & { id: string; name: string }): Location => ({
  kind: "home",
  country: "RO",
  city: "Cluj",
  addressLine1: "Str. Lunga 1",
  addressLine2: null,
  region: null,
  postalCode: "400001",
  phone: null,
  email: null,
  active: true,
  fulfillsOrders: true,
  holdsInventory: true,
  priority: 0,
  forwarding: "none",
  pickupEnabled: false,
  pickupInstructions: null,
  pickupReady: "24h",
  ...l,
})

/** A shop as the database holds it: two products, a general profile with four zones, a custom profile, a studio with stock, local delivery and pickup. */
function shop(over: { rates?: Record<string, any>[]; studio?: Record<string, any>; levels?: number; packageGrams?: number; noProfiles?: boolean } = {}) {
  const rate = (r: Record<string, any>) => ({ creator_id: SHOP, active: true, position: 0, tiers: [], min_value: null, max_value: null, free_over_cents: null, min_days: null, max_days: null, ...r })
  return fakeDb({
    products: [
      { id: HOODIE, creator_id: SHOP, title: "Hoodie", slug: "hoodie", type: "physical", status: "published", price_cents: 2500, thumbnail_url: null, requires_shipping: true, weight_grams: 400, taxable: true, track_inventory: true, continue_selling: false, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: null },
      { id: POSTER, creator_id: SHOP, title: "Poster", slug: "poster", type: "physical", status: "published", price_cents: 1000, thumbnail_url: null, requires_shipping: true, weight_grams: 100, taxable: true, track_inventory: false, continue_selling: false, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: "heavy" },
    ],
    product_variants: [
      { id: HOODIE_V, product_id: HOODIE, name: "Default", price_cents: 2500, weight_grams: 400, track_inventory: true, inventory_policy: "deny", requires_shipping: true, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null },
      { id: POSTER_V, product_id: POSTER, name: "Default", price_cents: 1000, weight_grams: 100, track_inventory: false, inventory_policy: "deny", requires_shipping: true, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null },
    ],
    commerce_settings: [{ creator_id: SHOP, default_location_id: STUDIO, unit_system: "metric", returns_enabled: true, return_window_days: 30, tax_mode: "none", low_stock_default: 5, low_stock_alerts: true }],
    inventory_locations: [
      {
        id: STUDIO, creator_id: SHOP, name: "Studio", kind: "home", country: "RO", city: "Cluj", address_line1: "Str. Lunga 1", postal_code: "400001", active: true, fulfills_orders: true, holds_inventory: true, priority: 0, forwarding: "none",
        pickup_enabled: true, pickup_instructions: "Side door", pickup_ready: "2h", pickup_hours: "Mon to Fri 9:00 to 17:00",
        local_delivery_enabled: true, local_delivery_codes: ["400", "401"], local_delivery_price_cents: 500, local_delivery_min_cents: 2000, local_delivery_free_over_cents: 8000, local_delivery_note: "Tuesdays and Fridays, 17:00 to 20:00",
        ...over.studio,
      },
    ],
    inventory_levels: [{ variant_id: HOODIE_V, location_id: STUDIO, creator_id: SHOP, available: over.levels ?? 10 }],
    shipping_profiles: over.noProfiles ? [] : [{ id: "general", creator_id: SHOP, name: "General", is_default: true, created_at: "2026-01-01" }, { id: "heavy", creator_id: SHOP, name: "Posters", is_default: false, created_at: "2026-01-02" }],
    shipping_zones: over.noProfiles
      ? []
      : [
          { id: "z-ro", creator_id: SHOP, profile_id: "general", name: "Romania", countries: ["RO"], regions: [], rest_of_world: false },
          { id: "z-us", creator_id: SHOP, profile_id: "general", name: "United States", countries: ["US"], regions: [], rest_of_world: false },
          { id: "z-de", creator_id: SHOP, profile_id: "general", name: "Germany", countries: ["DE"], regions: [], rest_of_world: false },
          { id: "z-fr", creator_id: SHOP, profile_id: "general", name: "France", countries: ["FR"], regions: [], rest_of_world: false },
          { id: "zh-ro", creator_id: SHOP, profile_id: "heavy", name: "Romania", countries: ["RO"], regions: [], rest_of_world: false },
        ],
    shipping_rates: over.rates ?? [
      rate({ id: "r-ro", zone_id: "z-ro", name: "Standard", kind: "flat", price_cents: 1500, free_over_cents: 10000, min_days: 2, max_days: 4 }),
      rate({ id: "r-us", zone_id: "z-us", name: "Standard", kind: "weight", price_cents: 500, tiers: [{ from: 0, priceCents: 500 }, { from: 1000, priceCents: 900 }] }),
      rate({ id: "r-de", zone_id: "z-de", name: "Standard", kind: "price", price_cents: 800, tiers: [{ from: 0, priceCents: 800 }, { from: 5000, priceCents: 0 }] }),
      /* France: a zone with no rate yet. */
      rate({ id: "rh-ro", zone_id: "zh-ro", name: "Standard", kind: "flat", price_cents: 3000 }),
    ],
    shipping_packages: [{ id: "box", creator_id: SHOP, name: "Box", kind: "box", length_mm: 300, width_mm: 200, height_mm: 100, weight_grams: over.packageGrams ?? 250, is_default: true }],
  })
}

type Priced = Extract<Awaited<ReturnType<typeof priceCheckout>>, { ok: true }>
async function quote(db: ReturnType<typeof shop>, items: { productId: string; variantId: string | null; quantity: number }[], address: { country: string; region?: string | null; postalCode?: string | null } | null, optionId?: string) {
  const priced = await priceCheckout(db as never, { items, shopId: SHOP })
  if (priced.ok === false) throw new Error(`priced: ${priced.error}`)
  return { priced: priced as Priced, q: await quoteCheckout(db as never, priced as Priced, address ? { country: address.country, region: address.region ?? null, postalCode: address.postalCode ?? null } : null, optionId) }
}
const optionsOf = (q: Awaited<ReturnType<typeof quote>>["q"]) => (q.quote.ok && q.quote.required ? q.quote.options : [])

async function main() {
  section("Fulfilment type: what the store's answer changes")
  {
    const locations = [
      { id: STUDIO, kind: "home" as const, active: true },
      { id: PRINTER, kind: "print_on_demand" as const, active: true },
      { id: "wh", kind: "third_party_logistics" as const, active: true },
      { id: "sup", kind: "supplier" as const, active: true },
    ]
    const want: Record<string, [string, string | null]> = {
      self: ["self", null],
      warehouse: ["warehouse", "wh"],
      print_on_demand: ["print_on_demand", PRINTER],
      dropshipping: ["dropship", "sup"],
      supplier: ["dropship", "sup"],
      third_party_logistics: ["warehouse", "wh"],
      hybrid: ["self", null],
    }
    for (const [model, [method, at]] of Object.entries(want)) {
      const f = storeFulfilment(model as never, null, locations)
      check(`"${model}": products follow it as ${method}${at ? ", from that partner" : ", shipped by the seller"}`, f.method === method && f.locationId === at && MODEL_METHOD[model as keyof typeof MODEL_METHOD] === method, f)
    }
    check("onboarding makes a first location of the answer's kind", MODEL_LOCATION.print_on_demand === "print_on_demand" && MODEL_LOCATION.self === "home" && MODEL_LOCATION.third_party_logistics === "third_party_logistics")
    const db = fakeDb({
      products: [
        { id: "p1", creator_id: SHOP, type: "physical", fulfillment_method: "self", fulfillment_location_id: null },
        { id: "p2", creator_id: SHOP, type: "physical", fulfillment_method: "dropship", fulfillment_location_id: "sup" },
        { id: "p3", creator_id: "other", type: "physical", fulfillment_method: "self", fulfillment_location_id: null },
      ],
    })
    const moved = await followNewDefault(db as never, SHOP, { method: "self", locationId: null }, { method: "print_on_demand", locationId: PRINTER })
    const rows = db.tables.products
    check("switching to print on demand moves the products that followed the store, not one with its own answer, not another shop's", moved === 1 && rows[0].fulfillment_method === "print_on_demand" && rows[0].fulfillment_location_id === PRINTER && rows[1].fulfillment_method === "dropship" && rows[2].fulfillment_method === "self", rows)

    check("next step, the seller ships: pack, Fulfill items, tracking", /Pack it at Studio and ship it, then press Fulfill items/.test(sellerNextStep({ groups: [{ method: "self", locationName: "Studio", forwarding: "none" }] })))
    check("next step, a print partner by email: they were emailed, add their tracking", /^Printful was emailed this order/.test(sellerNextStep({ groups: [{ method: "print_on_demand", locationName: "Printful", forwarding: "email" }] })))
    check("next step, a supplier not connected: send it yourself", /isn't connected to Storelib yet: send them this order yourself/.test(sellerNextStep({ groups: [{ method: "dropship", locationName: "Acme", forwarding: "provider" }] })))
    check("next step, a mix says both parts", (() => { const t = sellerNextStep({ groups: [{ method: "self", locationName: "Studio", forwarding: "none" }, { method: "print_on_demand", locationName: "Gelato", forwarding: "webhook" }] }); return /Pack it at Studio/.test(t) && /sent to your own system for Gelato/.test(t) })())
    check("next step, pickup and local delivery", /collects it at Studio/.test(sellerNextStep({ pickup: true, pickupAt: "Studio", groups: [] })) && /deliver this order yourself/.test(sellerNextStep({ local: true, groups: [] })))
    const ui = read("components/physical/shipping-settings.tsx")
    check("each location says who ships from it, and a partner kind defaults to emailing them", /Who ships the orders\?/.test(ui) && /if \(partner && !wasPartner\) return \{ \.\.\.x, kind, forwarding: x\.forwarding === "none" \? "email"/.test(ui))
    const panel = read("components/physical/order-panel.tsx")
    check("the order page groups what to send by who sends it, with that method's next step", /data-ship-group=\{g\.method\}/.test(panel) && /METHODS\[g\.method\]\.afterSale/.test(panel))
    check("the order page's own words match its button (Fulfill items, not Mark as shipped)", !/press Mark as shipped/.test(read("lib/physical/fulfillment.ts")))
  }

  section("Units: words change, stored weights and rates don't")
  {
    check("1.5 kg and 3.3 lb are kept in grams", toGrams("1.5", "kg") === 1500 && toGrams("3.3", "lb") === 1497 && fromGrams(1500, "kg") === 1.5)
    const r: ShippingRate = { id: "r", zoneId: "z", name: "Standard", kind: "weight", priceCents: 500, minValue: null, maxValue: null, tiers: [{ from: 0, priceCents: 500 }, { from: 1000, priceCents: 900 }], freeOverCents: null, minDays: null, maxDays: null, active: true, position: 0 }
    const before = ratePrice(r, { units: 1, cents: 0, grams: 1050 })
    const db = fakeDb({ commerce_settings: [{ creator_id: SHOP, unit_system: "metric" }] })
    const saved = await saveSettings(db as never, SHOP, { unitSystem: "imperial" })
    const after = ratePrice(r, { units: 1, cents: 0, grams: 1050 })
    check("switching to imperial saves the unit and touches no rate, package or product", saved.ok && db.log.some((l) => l.table === "commerce_settings" && l.op === "insert" && (l.payload as { unit_system?: string }).unit_system === "imperial") && !db.log.some((l) => l.op !== "select" && /shipping_rates|shipping_packages|products|product_variants/.test(l.table)), db.log.map((l) => `${l.op} ${l.table}`))
    check("  so a 1.05 kg order costs the same before and after", before === 900 && after === 900)
  }

  section("Checkout server: the shop's rates, applied exactly")
  {
    const hoodie = (quantity: number) => [{ productId: HOODIE, variantId: HOODIE_V, quantity }]
    let r = await quote(shop(), hoodie(1), { country: "RO", postalCode: "500100" })
    check("flat rate with its estimate: Romania, one hoodie, $15", JSON.stringify(optionsOf(r.q).map((o) => [o.name, o.priceCents, o.minDays, o.maxDays])) === '[["Standard",1500,2,4]]' && r.q.totals.shippingCents === 1500, optionsOf(r.q))
    r = await quote(shop(), hoodie(4), { country: "RO", postalCode: "500100" })
    check("free over $100: four hoodies ship free", optionsOf(r.q)[0]?.priceCents === 0 && r.q.totals.shippingCents === 0)
    r = await quote(shop(), hoodie(2), { country: "US", region: "CA" })
    check("weight steps count the default package: 2 x 400 g + 250 g box = the 1 kg step", optionsOf(r.q)[0]?.priceCents === 900, optionsOf(r.q))
    r = await quote(shop({ packageGrams: 0 }), hoodie(2), { country: "US", region: "CA" })
    check("  and without a package, 800 g stays on the first step", optionsOf(r.q)[0]?.priceCents === 500)
    r = await quote(shop(), hoodie(1), { country: "DE" })
    const de1 = optionsOf(r.q)[0]?.priceCents
    r = await quote(shop(), hoodie(2), { country: "DE" })
    check("price steps: $25 pays $8, $50 reaches the free step", de1 === 800 && optionsOf(r.q)[0]?.priceCents === 0)
    r = await quote(shop(), [...hoodie(1), { productId: POSTER, variantId: POSTER_V, quantity: 1 }], { country: "RO", postalCode: "500100" })
    check("a custom profile's product adds its own rate: one option, $15 + $30", optionsOf(r.q).length === 1 && optionsOf(r.q)[0].priceCents === 4500, optionsOf(r.q))
    r = await quote(shop(), hoodie(1), { country: "FR" })
    check("no rate for France: the buyer is told which item and where", r.q.quote.ok === false && (r.q.quote as { error: string }).error === "Hoodie can't be shipped to France yet. Choose pickup instead, or remove it from your order.", r.q.quote)
    r = await quote(shop(), [{ productId: POSTER, variantId: POSTER_V, quantity: 1 }], { country: "US" })
    check("a custom profile with no zone there: only that item is named", r.q.quote.ok === false && /^Poster can't be shipped to United States yet/.test((r.q.quote as { error: string }).error), r.q.quote)
    r = await quote(shop({ noProfiles: true, studio: { pickup_enabled: false, local_delivery_enabled: false } }), hoodie(1), { country: "RO", postalCode: "500100" })
    check("a shop with no rates at all: nothing to pick, and why", r.q.quote.ok === false && (r.q.quote as { error: string }).error === "Hoodie can't be shipped yet. Remove it from your order to check out." && r.q.option === null, r.q.quote)
    check("unshippableMessage names two items and more", unshippableMessage(["A", "B"], "Spain") === "A and B can't be shipped to Spain yet. Remove them from your order to check out." && /^A, B and 1 more/.test(unshippableMessage(["A", "B", "C"], null)))
    const server = read("lib/physical/checkout-server.ts")
    check("Pay refuses without an option the server can find again (the same quote)", /if \(q\.quote\.ok === false\) return \{ ok: false, status: 400, error: q\.quote\.error/.test(server) && /Delivery prices changed/.test(server))
  }

  section("Local delivery: by postal code, from a location, priced on the server")
  {
    check("postal codes are read the way buyers type them", postalKey(" 400 123 ") === "400123" && postalKey("sw1a-1aa") === "SW1A1AA" && JSON.stringify(readPostalCodes("400, 401\n400; sw1a")) === '["400","401","SW1A"]')
    check("a code covers every postal code that starts with it", deliversTo(["400"], "400123") && deliversTo(["SW1A"], "SW1A 1AA") && !deliversTo(["400"], "500123") && !deliversTo(["400"], ""))
    const d = { enabled: true, codes: ["400"], priceCents: 500, minOrderCents: 2000, freeOverCents: 8000, note: null }
    check("its price: under the minimum not offered, free from free over", localDeliveryPrice(d, 1999) === null && localDeliveryPrice(d, 2000) === 500 && localDeliveryPrice(d, 8000) === 0 && localDeliveryPrice({ ...d, enabled: false }, 5000) === null)
    let r = await quote(shop(), [{ productId: HOODIE, variantId: HOODIE_V, quantity: 1 }], { country: "RO", postalCode: "400 123" })
    const local = optionsOf(r.q).find((o) => o.kind === "local")
    check("Cluj 400123: Local delivery $5 offered beside Standard shipping", !!local && local.priceCents === 500 && local.name === "Local delivery" && isLocalOptionId(local.id) && optionsOf(r.q).some((o) => o.name === "Standard"), optionsOf(r.q))
    r = await quote(shop(), [{ productId: HOODIE, variantId: HOODIE_V, quantity: 1 }], { country: "RO", postalCode: "500123" })
    check("Brasov 500123: no local delivery", !optionsOf(r.q).some((o) => o.kind === "local"))
    r = await quote(shop(), [{ productId: HOODIE, variantId: HOODIE_V, quantity: 1 }], { country: "HU", postalCode: "4001" })
    check("same digits in another country: no local delivery", r.q.quote.ok === false || !optionsOf(r.q).some((o) => o.kind === "local"))
    r = await quote(shop({ levels: 0 }), [{ productId: HOODIE, variantId: HOODIE_V, quantity: 1 }], { country: "RO", postalCode: "400123" })
    check("not in stock at that location: not offered", !optionsOf(r.q).some((o) => o.kind === "local"))
    r = await quote(shop({ rates: [] }), [{ productId: HOODIE, variantId: HOODIE_V, quantity: 1 }], { country: "RO", postalCode: "400123" }, `local:${STUDIO}`)
    check("a shop with no shipping rate there can still deliver locally, and it is the option chosen", r.q.quote.ok && r.q.option?.kind === "local" && r.q.totals.shippingCents === 500, r.q)
    check("  and the stock is held at the location that delivers it", r.q.lines.every((l) => l.locationId === STUDIO))
    r = await quote(shop(), [{ productId: HOODIE, variantId: HOODIE_V, quantity: 4 }], { country: "RO", postalCode: "400123" }, `local:${STUDIO}`)
    check("free over $80 on local delivery", r.q.option?.kind === "local" && r.q.totals.shippingCents === 0)
    r = await quote(shop(), [{ productId: HOODIE, variantId: HOODIE_V, quantity: 1 }], { country: "RO", postalCode: "400123" }, "local:5b1c0000-0000-4000-8000-0000000000ff")
    check("a made up local option is never charged: the server picks its own", r.q.option?.id !== "local:5b1c0000-0000-4000-8000-0000000000ff")
    const studio = locationFromRow(shop().tables.inventory_locations[0])
    check("a location reads its local delivery and hours back", studio.localDelivery?.enabled === true && studio.localDelivery.codes.join() === "400,401" && studio.pickupHours === "Mon to Fri 9:00 to 17:00")
    check("a database before part 154 reads as no local delivery", localDeliveryFromRow({ id: "x" }) === null)
    check("two locations that deliver say which", localDeliveryOptions([loc({ id: "a0000000-0000-4000-8000-000000000001", name: "Cluj", localDelivery: { ...d, minOrderCents: null } }), loc({ id: "a0000000-0000-4000-8000-000000000002", name: "Floresti", localDelivery: { ...d, minOrderCents: null } })], [{ variantId: null, quantity: 1, requiresShipping: true, trackInventory: false, inventoryPolicy: "deny", fulfillmentMethod: "self" }], () => 0, { country: "RO", postalCode: "400100" }, 3000).map((o) => o.name).join("|") === "Local delivery from Cluj|Local delivery from Floresti")
    check("a printed on demand item is never delivered locally", localDeliveryOptions([loc({ id: "a0000000-0000-4000-8000-000000000001", name: "Cluj", localDelivery: d })], [{ variantId: null, quantity: 1, requiresShipping: true, trackInventory: false, inventoryPolicy: "deny", fulfillmentMethod: "print_on_demand" }], () => 0, { country: "RO", postalCode: "400100" }, 3000).length === 0)
    const site = read("lib/checkout/site-quote-server.ts")
    const physicalRoute = read("app/api/physical/checkout/quote/route.ts")
    check("both quote routes (Storelib checkout, website and imported theme checkout) pass the postal code to the same server quote", /postalCode/.test(site) && /quoteCheckout\(db, priced, country \? \{ country, region, postalCode \}/.test(site) && /quoteCheckout\(db, priced, country \? \{ country, region, postalCode \}/.test(physicalRoute))
    check("both checkout pages send it", /postalCode: postalForQuote/.test(read("app/checkout/site/site-checkout.tsx")) && /postalCode: postalForQuote/.test(read("app/checkout/physical/physical-checkout.tsx")))
    check("imported Shopify themes check out through the website checkout (lib/storelib-theme/compat/site.ts)", /siteCheckoutHref/.test(read("lib/storelib-theme/compat/site.ts")))
    check("the order keeps it: kind local and its note on the checkout", /local_location_id: option\.local\.locationId, local_note: option\.local\.note/.test(read("lib/physical/checkout-server.ts")))
  }

  section("Local pickup, with its hours")
  {
    const r = await quote(shop(), [{ productId: HOODIE, variantId: HOODIE_V, quantity: 1 }], null)
    const p = r.q.pickups[0]
    check("the studio is offered for pickup with its ready time and hours", r.q.pickups.length === 1 && p.pickup?.name === "Studio" && p.pickup.ready === "2h" && p.pickup.hours === "Mon to Fri 9:00 to 17:00" && p.priceCents === 0, p)
    const pick = await quote(shop(), [{ productId: HOODIE, variantId: HOODIE_V, quantity: 1 }], null, `pickup:${STUDIO}`)
    check("picking it up is free and holds the stock there", pick.q.option?.kind === "pickup" && pick.q.totals.shippingCents === 0 && pick.q.lines.every((l) => l.locationId === STUDIO))
    check("the order keeps the hours, the buyer's page and the pickup email show them", /hours: pickup\.hours \?\? null/.test(read("lib/physical/checkout-server.ts")) && /data-pickup-hours/.test(read("app/checkout/physical/order/[token]/order-status-view.tsx")) && /Open \$\{co\.pickup\.hours\}|hours: typeof co\.pickup\.hours === "string"/.test(read("lib/physical/jobs-server.ts")))
  }

  section("Settings: Shipping and delivery, Locations")
  {
    const ui = read("components/physical/shipping-settings.tsx")
    check('"Custom shipping profile Reload": the hidden Reload button beside it is gone', !/>\s*Reload\s*</.test(ui) && !/className="sr-only" onClick=\{reload\}/.test(ui))
    check("the location form has local delivery (codes, price, minimum, free over, note) and pickup hours", /label="Local delivery"/.test(ui) && /label="Postal codes"/.test(ui) && /label="Minimum order"/.test(ui) && /label="Opening hours"/.test(ui) && /localDelivery/.test(ui))
    check("the empty shipping warning says buyers can't check out without a rate", /Buyers can't check out a physical product until it has a rate for their address/.test(ui))
    const ok = readLocation({ name: "Studio", kind: "home", country: "RO", pickupHours: "Mon to Fri 9 to 5", localDelivery: { enabled: true, codes: "400, 401", priceCents: 500, minOrderCents: 2000, freeOverCents: null, note: "Evenings" } })
    check("a location's local delivery and hours are read apart from the location", ok.ok && ok.extra.local_delivery_enabled === true && JSON.stringify(ok.extra.local_delivery_codes) === '["400","401"]' && ok.extra.pickup_hours === "Mon to Fri 9 to 5" && !("local_delivery_enabled" in ok.row))
    const noCodes = readLocation({ name: "Studio", kind: "home", country: "RO", localDelivery: { enabled: true, codes: "" } })
    check("local delivery on with no postal code is refused", noCodes.ok === false && /postal codes/.test(noCodes.error))
    check("a bad price is refused", readLocalDelivery({ enabled: true, codes: "400", priceCents: -5 }).ok === false)
    const old = {
      from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: "PGRST204", message: "column not found" } }) }) }) }) }) }),
    }
    const kept = await saveLocationExtra(old as never, SHOP, STUDIO, ok.ok ? ok.extra : {})
    check("before part 154 the location still saves, and the seller is told what waits for the update", kept.row === null && /SQL part 154/.test(kept.notice ?? ""))
    const quiet = await saveLocationExtra(old as never, SHOP, STUDIO, { local_delivery_enabled: false, pickup_hours: null })
    check("  and nothing is said when nothing new was asked for", quiet.notice === null)
    const routes = read("app/api/physical/locations/route.ts") + read("app/api/physical/locations/[id]/route.ts")
    check("both location routes write the extras after the location", (routes.match(/saveLocationExtra\(c\.db, c\.creatorId/g) ?? []).length === 2)
  }

  section("Product page: delivery from the same rates")
  {
    const profiles: ShippingProfile[] = [{ id: "general", name: "General", isDefault: true, zones: [{ id: "z", profileId: "general", name: "Romania", countries: ["RO"], regions: [], restOfWorld: false, rates: [{ id: "r", zoneId: "z", name: "Standard", kind: "flat", priceCents: 1500, minValue: null, maxValue: null, tiers: [], freeOverCents: 10000, minDays: 2, maxDays: 4, active: true, position: 0 }] }] }]
    const studio = loc({ id: STUDIO, name: "Studio", pickupEnabled: true, pickupReady: "2h", localDelivery: { enabled: true, codes: ["400"], priceCents: 500, minOrderCents: null, freeOverCents: null, note: null } })
    const p = deliveryPromise({ profiles, profileId: null, country: "RO", priceCents: 2500, weightGrams: 400, locations: [studio], shipsItself: true })
    check("Romania: price, estimate, free over, local delivery, pickup", JSON.stringify(deliveryPromiseLines(p)) === JSON.stringify(["Delivery $15.00 to Romania, 2 to 4 business days", "Free delivery on orders over $100.00", "Local delivery available near the shop", "Free pickup at Studio. Usually ready in 2 hours"]), deliveryPromiseLines(p))
    const fr = deliveryPromise({ profiles, profileId: null, country: "FR", priceCents: 2500, weightGrams: 400, locations: [studio], shipsItself: true })
    check("France, no rate: says it doesn't ship there yet, promises nothing", JSON.stringify(deliveryPromiseLines(fr)) === '["Doesn\'t ship to France yet"]', deliveryPromiseLines(fr))
    const pod = deliveryPromise({ profiles, profileId: null, country: "RO", priceCents: 2500, weightGrams: 400, locations: [studio], shipsItself: false })
    check("a printed on demand product offers no pickup or local delivery", pod.pickups.length === 0 && !pod.localDelivery)
    check("the product route sends it and the buy box draws it", /delivery: promise \? \{ \.\.\.promise, lines: deliveryPromiseLines\(promise\) \}/.test(read("app/api/physical/storefront/product/route.ts")) && /data-delivery-promise/.test(read("components/physical/buy-box.tsx")))
  }

  section("Stock per location and the low stock line")
  {
    check("the line is the product's own, else the shop's (Settings > Locations, Low stock)", lowStockLine(3, 8) === 3 && lowStockLine(null, 8) === 8)
    check("Inventory's Low filter reads the same line per product", /lowStockThreshold: p\.low_stock_threshold \?\? lowStockDefault/.test(read("lib/physical/inventory-server.ts")) && /view === "low"\) return r\.trackInventory && l\.available > 0 && l\.available <= r\.lowStockThreshold/.test(read("app/app/inventory/inventory-client.tsx")))
    check("Only N left on the product page comes from the same line", /lowStockLine\(product\.low_stock_threshold, shopLine\)/.test(read("lib/physical/storefront-stock.ts")) && /Only \{variant\.left\} left/.test(read("components/physical/buy-box.tsx")))
    check("the checkout only sells a location's own stock, and holds it there", /levelOf\.get\(`\$\{v\.id\}:\$\{locationId\}`\)/.test(read("lib/physical/checkout-pricing-server.ts")) && /physical_reserve/.test(read("lib/physical/checkout-server.ts")))
  }

  section("Low stock: one email a day at most, listing what sold down")
  {
    const db = fakeDb({
      commerce_settings: [{ creator_id: SHOP, low_stock_alerts: true, low_stock_default: 5 }],
      product_variants: [
        { id: "v-a", name: "M", product_id: "pa", track_inventory: true, products: { title: "Tee", creator_id: SHOP, low_stock_threshold: null, track_inventory: true, type: "physical" } },
        { id: "v-b", name: "Default", product_id: "pb", track_inventory: true, products: { title: "Mug", creator_id: SHOP, low_stock_threshold: 2, track_inventory: true, type: "physical" } },
        { id: "v-c", name: "Default", product_id: "pc", track_inventory: true, products: { title: "Cap", creator_id: SHOP, low_stock_threshold: 1, track_inventory: true, type: "physical" } },
      ],
      inventory_levels: [
        { variant_id: "v-a", creator_id: SHOP, available: 3 },
        { variant_id: "v-b", creator_id: SHOP, available: 2 },
        { variant_id: "v-c", creator_id: SHOP, available: 4 },
      ],
      commerce_jobs: [],
    })
    await queueLowStockAlerts(db as never, SHOP, ["v-a", "v-c"])
    await queueLowStockAlerts(db as never, SHOP, ["v-b"])
    const today = new Date().toISOString().slice(0, 10)
    const jobs = db.tables.commerce_jobs
    check("two sales in a day: one email waiting, listing both that sold down (the shop's line 5, the product's own line 2)", jobs.length === 1 && jobs[0].idempotency_key === lowStockKey(SHOP, today) && jobs[0].payload.items.map((i: { variantId: string }) => i.variantId).sort().join() === "v-a,v-b", jobs)
    check("  a product above its own line (Cap, 4 over 1) is not listed", !jobs[0].payload.items.some((i: { variantId: string }) => i.variantId === "v-c"))
    jobs[0].status = "done"
    db.tables.inventory_levels[2].available = 1
    await queueLowStockAlerts(db as never, SHOP, ["v-c"])
    const next = db.tables.commerce_jobs.find((j) => j.idempotency_key !== lowStockKey(SHOP, today))
    check("once today's went, the next waits for tomorrow, never a second today", db.tables.commerce_jobs.length === 2 && !!next && next.run_after > new Date().toISOString() && next.run_after.endsWith("T00:00:00.000Z") && next.payload.items[0].variantId === "v-c", db.tables.commerce_jobs)
    db.tables.commerce_settings[0].low_stock_alerts = false
    await queueLowStockAlerts(db as never, SHOP, ["v-a"])
    check("emails off: nothing queued", db.tables.commerce_jobs.length === 2)
    check("merging keeps one per variant, the newest count", JSON.stringify(mergeLowItems([{ variantId: "a", title: "A", variantName: null, available: 3, threshold: 5 }], [{ variantId: "a", title: "A", variantName: null, available: 1, threshold: 5 }])) === JSON.stringify([{ variantId: "a", title: "A", variantName: null, available: 1, threshold: 5 }]))
    check("the email is sent by the existing send function, to Inventory filtered to Low", /lowStockEmail\(\{ shopName/.test(read("lib/physical/jobs-server.ts")) && /\/app\/inventory\?filter=low/.test(read("lib/physical/jobs-server.ts")))
  }

  section("Returns: the window, the button, reasons, refunds, restock")
  {
    const day = 86_400_000
    const now = Date.parse("2026-10-11T12:00:00Z")
    const ago = (n: number) => new Date(now - n * day).toISOString()
    const lines = [{ requiresShipping: true }]
    const w = (shipments: { status: string; trackingNumber: string | null; shippedAt: string | null; deliveredAt: string | null }[], days = 30) => returnWindow({ lines, shipments, paidAt: ago(100) }, days, now)
    check("tracked and delivered 10 days ago, 30 day window: open, ends 20 days on", (() => { const x = w([{ status: "delivered", trackingNumber: "1Z", shippedAt: ago(15), deliveredAt: ago(10) }]); return x.open && x.endsAt === new Date(now + 20 * day).toISOString() })())
    check("delivered 31 days ago: closed", !w([{ status: "delivered", trackingNumber: "1Z", shippedAt: ago(35), deliveredAt: ago(31) }]).open)
    check("tracked, shipped 40 days ago, still in transit: the window hasn't started", (() => { const x = w([{ status: "in_transit", trackingNumber: "1Z", shippedAt: ago(40), deliveredAt: null }]); return x.open && !x.started })())
    check("no tracking: counted from shipping (shipped 31 days ago: closed)", !w([{ status: "shipped", trackingNumber: null, shippedAt: ago(31), deliveredAt: null }]).open && w([{ status: "shipped", trackingNumber: null, shippedAt: ago(29), deliveredAt: null }]).open)
    check("a cancelled shipment doesn't count", w([{ status: "cancelled", trackingNumber: null, shippedAt: ago(90), deliveredAt: null }, { status: "delivered", trackingNumber: "1Z", shippedAt: ago(5), deliveredAt: ago(2) }]).open)
    check("nothing to ship: from payment", !returnWindow({ lines: [{ requiresShipping: false }], shipments: [], paidAt: ago(31) }, 30, now).open)
    const page = read("app/checkout/physical/order/[token]/page.tsx")
    const route = read("app/api/physical/order-status/[token]/return/route.ts")
    check("the order page and the return route use the same window", /returnWindow\(/.test(page) && /returnWindow\(/.test(route) && !/fulfilled_at \?\? co\.paid_at/.test(route))
    check("Accept returns off: no return button, and the route refuses", /const windowOpen = settings\.returnsEnabled && window\.open/.test(page) && /if \(!settings\.returnsEnabled\) return physicalJson/.test(route))
    check("the refund policy page says the same window, from delivery", /within 30 days of delivery/.test(returnFactsHtml({ enabled: true, windowDays: 30 })) && /don't accept returns/.test(returnFactsHtml({ enabled: false, windowDays: 30 })))
    const view = read("app/checkout/physical/order/[token]/order-status-view.tsx")
    check("the buyer sees until when, the reasons list labelled, and the reason on their return", /Until \{day\(until\)\}/.test(view) && /Why are you returning this\?/.test(view) && !/className="sr-only">\s*Why are you returning/.test(view) && /Reason: \{r\.reason\}/.test(view))

    /* The whole flow on the real server code: request, approve with instructions, receive (restock), refund, close. */
    const CO = "5b1c0000-0000-4000-8000-0000000000d1"
    const LINE = "5b1c0000-0000-4000-8000-0000000000e1"
    const F = "5b1c0000-0000-4000-8000-0000000000f1"
    const db = fakeDb({
      commerce_checkouts: [{ id: CO, creator_id: SHOP, status: "paid", fulfillment_status: "fulfilled", return_status: "none", currency: "USD", buyer_email: "b@example.com", buyer_name: "Ana Pop", items_subtotal_cents: 5000, discount_cents: 0, shipping_cents: 0, shipping_discount_cents: 0, tax_cents: 0, total_cents: 5000, refunded_cents: 0, receipt_token: "tok_aaaaaaaaaaaaaaaaaaaaaaaa", delivery_method: "ship", shipping_rate: { name: "Standard" }, lines: [{ title: "Hoodie", type: "physical" }], paid_at: ago(5), created_at: ago(5) }],
      orders: [{ id: LINE, checkout_id: CO, product_id: HOODIE, variant_id: HOODIE_V, quantity: 2, amount_cents: 5000, refund_amount_cents: 0, requires_shipping: true, fulfillment_location_id: STUDIO, product_snapshot: { title: "Hoodie", type: "physical" }, created_at: ago(5) }],
      fulfillments: [{ id: F, checkout_id: CO, creator_id: SHOP, status: "delivered", provider: "manual", carrier: "UPS", tracking_number: "1Z999", shipped_at: ago(4), delivered_at: ago(2), created_at: ago(4), notify_buyer: true }],
      fulfillment_items: [{ fulfillment_id: F, order_id: LINE, quantity: 2 }],
      commerce_returns: [],
      commerce_return_items: [],
      commerce_order_events: [],
      commerce_jobs: [],
      store_reasons: [],
    })
    const asked = await openReturn(db as never, CO, { creatorId: SHOP, by: "buyer", items: [{ orderId: LINE, quantity: 1 }], reason: "size", note: "Too small" })
    const ret = db.tables.commerce_returns[0]
    check("the buyer asks: a return waiting for the shop, with their reason and note", asked.ok && ret?.status === "requested" && ret.reason === "size" && ret.customer_note === "Too small" && db.tables.commerce_order_events.some((e) => e.kind === "return.requested"), { asked, ret })
    check("  a reason not on the store's list is kept as other", (await openReturn(db as never, CO, { creatorId: SHOP, by: "buyer", items: [{ orderId: LINE, quantity: 1 }], reason: "made-up" })).ok && db.tables.commerce_returns[1]?.reason === "other")
    await moveReturn(db as never, SHOP, db.tables.commerce_returns[1].id, { status: "cancelled" })
    const approved = await moveReturn(db as never, SHOP, ret.id, { status: "approved", note: "Post it to the studio with the order number inside." })
    check("approved with instructions: kept on the return, the approval email queued", approved.ok && ret.status === "approved" && ret.merchant_note === "Post it to the studio with the order number inside." && db.tables.commerce_jobs.some((j) => j.idempotency_key === `email:return:${ret.id}:approved`))
    check("  a return can't skip back", (await moveReturn(db as never, SHOP, ret.id, { status: "requested" })).ok === false)
    const applied: unknown[] = []
    ;(db as unknown as { rpc: (n: string, a: unknown) => Promise<unknown> }).rpc = async (name: string, args: unknown) => (applied.push([name, args]), { data: [{ ok: true }], error: null })
    const received = await moveReturn(db as never, SHOP, ret.id, { status: "received" })
    check("received: back in stock at the location it shipped from, once, and the buyer told", received.ok && ret.status === "received" && applied.length === 1 && JSON.stringify(applied[0]).includes(STUDIO) && db.tables.commerce_jobs.some((j) => j.idempotency_key === `email:return:${ret.id}:received`), applied)
    /* The Refund button refunded $25 of the line (the refund route writes the line), then the order catches up. */
    db.tables.orders[0].refund_amount_cents = 2500
    const refunded = await noteRefund(db as never, SHOP, CO, null)
    check("a refund lands on the return waiting for it, so Return complete says the amount", refunded.ok && ret.refunded_cents === 2500, ret)
    await noteRefund(db as never, SHOP, CO, null)
    check("  and the same refund seen again (the webhook, a second press) is not counted twice", ret.refunded_cents === 2500)
    const closed = await moveReturn(db as never, SHOP, ret.id, { status: "completed" })
    check("closed: the return complete email queued", closed.ok && ret.status === "completed" && db.tables.commerce_jobs.some((j) => j.idempotency_key === `email:return:${ret.id}:completed`))
    check("each step has its customer email", emailIdForJob("return", null, "approved") === "return_approved" && emailIdForJob("return", null, "received") === "return_received" && emailIdForJob("return", null, "completed") === "return_completed")
    check("which return a refund is for: the received one, else the only one waiting", returnForRefund([{ id: "a", status: "completed" }, { id: "b", status: "received" }], null) === "b" && returnForRefund([{ id: "a", status: "approved" }, { id: "b", status: "approved" }], null) === null && returnForRefund([{ id: "a", status: "approved" }], "zzz") === null)
    const panel = read("components/physical/order-panel.tsx")
    check("the seller's return card: Approve asks for instructions, Received offers Refund, then Close", /Instructions for the buyer/.test(panel) && /data-return-refund/.test(panel) && /Close without refund/.test(panel) && /onRefund=\{refundable\.length > 0 \? \(\) => setDialog\("refund"\) : null\}/.test(read("app/app/orders/order-detail.tsx")))
    check("refund reasons are kept on the refund and shown on the timeline", /refund_reason: reason \|\| "requested_by_customer"/.test(read("app/api/stripe/refund/route.ts")) && /detail: line\.refund_reason \? reasonLabel\(line\.refund_reason, "refund"\)/.test(read("lib/orders/timeline.ts")))
  }

  section("Tracking: statuses, a delivery problem, a new number, emails")
  {
    check("statuses only move forward; a problem can come from anywhere before delivered", canMoveShipment("shipped", "in_transit") && canMoveShipment("in_transit", "out_for_delivery") && canMoveShipment("out_for_delivery", "delivered") && !canMoveShipment("delivered", "in_transit") && canMoveShipment("in_transit", "failed") && canMoveShipment("failed", "out_for_delivery") && !canMoveShipment("out_for_delivery", "shipped"))
    check("labels the buyer reads", shipmentLabel("failed").label === "Delivery problem" && shipmentLabel("out_for_delivery").label === "Out for delivery" && shipmentLabel("shipped", true).label === "Ready for pickup")
    const F = "5b1c0000-0000-4000-8000-0000000000f2"
    const CO = "5b1c0000-0000-4000-8000-0000000000d2"
    const db = fakeDb({
      fulfillments: [{ id: F, checkout_id: CO, creator_id: SHOP, status: "shipped", provider: "manual", carrier: "UPS", tracking_number: "1Z999AA10123456784", tracking_url: null, notify_buyer: true }],
      fulfillment_items: [],
      fulfillment_events: [],
      commerce_checkouts: [{ id: CO, creator_id: SHOP, status: "paid", total_cents: 1000, lines: [], currency: "USD" }],
      orders: [],
      commerce_order_events: [],
      commerce_jobs: [],
    })
    const keys = () => db.tables.commerce_jobs.map((j) => j.idempotency_key).join()
    await updateShipment(db as never, SHOP, F, { status: "in_transit" })
    check("in transit: on the timeline and the buyer's page, no email", db.tables.fulfillment_events.some((e) => e.status === "in_transit") && keys() === "")
    await updateShipment(db as never, SHOP, F, { status: "failed" })
    check("a delivery problem: recorded for the buyer's page", db.tables.fulfillments[0].status === "failed" && db.tables.fulfillment_events.some((e) => e.status === "failed"))
    await updateShipment(db as never, SHOP, F, { status: "out_for_delivery" })
    check("out for delivery after the problem: emailed", db.tables.fulfillments[0].status === "out_for_delivery" && keys().includes(`email:out_for_delivery:${F}`))
    await updateShipment(db as never, SHOP, F, { trackingNumber: "1Z999AA10123456785" })
    check("a changed tracking number: a new link and the Tracking number changed email", /1Z999AA10123456785/.test(db.tables.fulfillments[0].tracking_url ?? "") && keys().includes("email:tracking:"))
    await updateShipment(db as never, SHOP, F, { status: "delivered" })
    check("delivered: dated and emailed", !!db.tables.fulfillments[0].delivered_at && keys().includes(`email:delivered:${F}`))
    check("going back from delivered is refused", (await updateShipment(db as never, SHOP, F, { status: "in_transit" })).ok === false)
    const panel = read("components/physical/order-panel.tsx")
    check("the seller can set each status by hand (no carrier integration reports them yet)", /Mark as in transit/.test(panel) && /Mark as out for delivery/.test(panel) && /Report a delivery problem/.test(panel) && /Mark as delivered/.test(panel))
    const view = read("app/checkout/physical/order/[token]/order-status-view.tsx")
    check("the buyer's page shows each package's updates with dates, the problem plainly, and Track package", /data-shipment-updates/.test(view) && /The carrier reported a problem delivering this package/.test(view) && /Track package/.test(view))
    check("partners report status through the signed webhook (the only carrier feed there is)", /"shipped" \| "in_transit" \| "out_for_delivery" \| "delivered" \| "failed"/.test(read("app/api/physical/partner-tracking/route.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
