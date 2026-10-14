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
import { applyAdjusted, fieldPlan, missingField, sameLine, setLineQuantity, setLineVariant, shipsToCountries, themeCartAfter } from "@/lib/checkout/site-checkout"
import { variantChoices } from "@/lib/checkout/variant-choices-server"
import { pickByValue } from "@/app/checkout/parts/variant-edit"
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

const L = "5b1c0000-0000-4000-8000-0000000000b3"

function shop(over: { maxPerOrder?: number | null; levelM?: number; requiresShipping?: boolean; sizes?: boolean; priceS?: number } = {}) {
  const rate = (r: Record<string, unknown>) => ({ creator_id: SHOP, active: true, position: 0, tiers: [], min_value: null, max_value: null, free_over_cents: null, min_days: 2, max_days: 4, ...r })
  return fakeDb({
    products: [
      { id: SLEEVE, creator_id: SHOP, title: "Black Sleeve", slug: "black-sleeve", type: "physical", status: "published", price_cents: 3500, thumbnail_url: null, requires_shipping: over.requiresShipping ?? true, weight_grams: 200, taxable: true, track_inventory: true, continue_selling: false, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: null, max_per_order: over.maxPerOrder ?? null },
    ],
    product_variants: [
      { id: M, product_id: SLEEVE, name: "M", price_cents: 3500, weight_grams: 200, track_inventory: true, inventory_policy: "deny", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null },
      { id: S, product_id: SLEEVE, name: "S", price_cents: over.priceS ?? 3500, weight_grams: 200, track_inventory: true, inventory_policy: "deny", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null },
      ...(over.sizes ? [{ id: L, product_id: SLEEVE, name: "L", price_cents: 3900, weight_grams: 220, track_inventory: true, inventory_policy: "deny", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null }] : []),
    ].map((v, n) => ({ ...v, option1: v.name, position: n })),
    product_options: over.sizes ? [{ product_id: SLEEVE, position: 1, name: "Size", values: ["S", "M", "L"] }] : [],
    commerce_settings: [{ creator_id: SHOP, default_location_id: STUDIO, unit_system: "metric", returns_enabled: true, return_window_days: 30, tax_mode: "none", low_stock_default: 5, low_stock_alerts: true }],
    inventory_locations: [{ id: STUDIO, creator_id: SHOP, name: "Studio", kind: "home", country: "RO", city: "Cluj", address_line1: "Str. Lunga 1", postal_code: "400001", active: true, fulfills_orders: true, holds_inventory: true, priority: 0, forwarding: "none", pickup_enabled: true, pickup_instructions: "Side door", pickup_ready: "2h", pickup_hours: "Mon to Fri 9:00 to 17:00" }],
    inventory_levels: [
      { variant_id: M, location_id: STUDIO, creator_id: SHOP, available: over.levelM ?? 3 },
      { variant_id: S, location_id: STUDIO, creator_id: SHOP, available: 10 },
      ...(over.sizes ? [{ variant_id: L, location_id: STUDIO, creator_id: SHOP, available: 0 }] : []),
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

  /* The owner: "let customers correct their selections without having to go back to the product page." */
  section("CHANGE THE OPTION IN CHECKOUT: a size, an edition, without leaving")
  {
    const items = [{ productId: SLEEVE, variantId: M, quantity: 2 }]
    const moved = setLineVariant(items, { productId: SLEEVE, variantId: M }, S)
    check("a line changes to another option, keeping its quantity", moved.length === 1 && moved[0].variantId === S && moved[0].quantity === 2, moved)
    const merged = setLineVariant([{ productId: SLEEVE, variantId: M, quantity: 2 }, { productId: SLEEVE, variantId: S, quantity: 1 }], { productId: SLEEVE, variantId: M }, S)
    check("  onto an option already in the cart: one line, the two quantities together", merged.length === 1 && merged[0].variantId === S && merged[0].quantity === 3, merged)
    check("  the same option, or none, changes nothing", setLineVariant(items, { productId: SLEEVE, variantId: M }, M) === items && setLineVariant(items, { productId: SLEEVE, variantId: M }, "") === items)
    const theme = themeCartAfter([{ k: "a", p: SLEEVE, v: M, q: 2, props: { Gift: "yes" } }], [{ productId: SLEEVE, variantId: S, quantity: 2 }])
    check("  an imported theme's cart cookie follows the change, with the line's properties", theme.length === 1 && theme[0].v === S && theme[0].k === "a" && theme[0].props.Gift === "yes", theme)

    const choices = await variantChoices(shop({ sizes: true }) as never, [SLEEVE])
    const c = choices[SLEEVE]
    check("the quote's choices: the options, each value, and every option with its price", !!c && c.options[0]?.name === "Size" && JSON.stringify(c.options[0].values) === '["S","M","L"]' && c.variants.length === 3 && c.variants.find((v) => v.id === L)?.priceCents === 3900, c)
    check("  sold out by the product page's own rule (L has none left)", c?.variants.find((v) => v.id === L)?.available === false && c?.variants.find((v) => v.id === S)?.available === true, c?.variants)
    check("  a product with one option has nothing to change", Object.keys(await variantChoices(fakeDb({ products: [{ id: SLEEVE, creator_id: SHOP, type: "physical", status: "published" }], product_variants: [{ id: M, product_id: SLEEVE, name: "M", price_cents: 100, active: true }], product_options: [] }) as never, [SLEEVE])).length === 0)
    check("  a read that fails is a checkout with nothing to change, never an error", JSON.stringify(await variantChoices({ from: () => { throw new Error("down") } } as never, [SLEEVE])) === "{}")
    const EBOOK = "5b1c0000-0000-4000-8000-0000000000d1"
    const digital = await variantChoices(fakeDb({
      products: [{ id: EBOOK, creator_id: SHOP, type: "digital", status: "published" }],
      product_variants: [
        { id: "5b1c0000-0000-4000-8000-0000000000d2", product_id: EBOOK, name: "Standard", price_cents: 1500, active: true, position: 0 },
        { id: "5b1c0000-0000-4000-8000-0000000000d3", product_id: EBOOK, name: "Deluxe", price_cents: 2900, active: true, position: 1 },
        { id: "5b1c0000-0000-4000-8000-0000000000d4", product_id: EBOOK, name: "Name your price", price_cents: 500, active: true, position: 2, pay_what_you_want: true },
      ],
      product_options: [],
    }) as never, [EBOOK])
    check("a download with editions: one list of its options by name, each on sale, pay what you want left out", JSON.stringify(digital[EBOOK]?.options) === "[]" && JSON.stringify(digital[EBOOK]?.variants.map((v) => `${v.name}:${v.priceCents}:${v.available}`)) === '["Standard:1500:true","Deluxe:2900:true"]', digital)
    if (c) {
      check("the picker takes the value chosen when that option is on sale", pickByValue(c, M, 0, "S") === S)
      check("  and never a sold out one: nothing is changed", pickByValue(c, M, 0, "L") === null)
    }
    const q = await shippedQuote(shop({ sizes: true }) as never, SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 1 }], country: "RO" }, null)
    check("the website checkout's quote carries them", q.ok === true && q.quote.choices?.[SLEEVE]?.variants.length === 3, q.ok ? q.quote.choices : q)
    const after = await shippedQuote(shop({ sizes: true }) as never, SHOP, { items: [{ productId: SLEEVE, variantId: L, quantity: 1 }], country: "RO" }, null)
    check("  and the order changed to another option is priced again from the database (L at its own price; sold out, so short)", after.ok === true && after.quote.short?.[0]?.variantId === L && after.quote.stockIssues.length === 1, after.ok ? after.quote.short : after)
    const page = code("app/checkout/site/site-checkout.tsx")
    check("the page: Edit on each line and on a short line, the change through the same path as - / +", /<VariantEdit\s+choices=\{quote\.choices\?\.\[l\.productId\]\}/.test(page) && /commitItems\(setLineVariant\(items, line, variantId\)/.test(page) && /A size that sold out is changed to one in stock right here/.test(readFileSync(join(process.cwd(), "app/checkout/site/site-checkout.tsx"), "utf8")))
    check("  this browser's cart follows the new option rather than losing the line", /swap && was\.productId === swap\.productId/.test(page))
    const other = code("app/checkout/physical/physical-checkout.tsx")
    check("the storelib.com cart checkout has the same picker, from its own quote", /<VariantEdit/.test(other) && /variantChoices\(db,/.test(code("app/api/physical/checkout/quote/route.ts")))
  }

  /* The owner: "when I set up a price for a variant I want to set it to 0, and it tells me to set up a price for S." */
  section("$0 IS A PRICE: a free option ships like any other")
  {
    const free = await shippedQuote(shop({ priceS: 0 }) as never, SHOP, { items: [{ productId: SLEEVE, variantId: S, quantity: 1 }], country: "RO" }, null)
    check("a $0 option stays in the order at $0, with its shipping", free.ok === true && free.quote.lines.length === 1 && free.quote.lines[0].unitCents === 0 && free.quote.totals.shippingCents === 1500 && free.quote.dropped.length === 0, free.ok ? { lines: free.quote.lines, totals: free.quote.totals, dropped: free.quote.dropped } : free)
    const cards = code("components/physical/product-cards.tsx")
    check("the editor takes $0, asks for a price only when there is none, and refuses only between nothing and $0.50", /if \(p === null\) return multi \? tt\("Set a price for \{name\}"/.test(cards) && /if \(p > 0 && p < 50\)/.test(cards) && !/p === null \|\| p < 50/.test(cards))
    const editor = code("app/app/products/new/product-editor.tsx")
    check("every card's change turns Save on, a saved product too (justSaved cleared with it)", /const markDirty = useCallback\(\(\) => \{\s*setHasUnsavedChanges\(true\)\s*setJustSaved\(false\)\s*\}, \[\]\)/.test(editor) && /const markPhysicalDirty = markDirty/.test(editor) && /onChange=\{markDirty\}/.test(editor) && !/setHasUnsavedChanges\(true\), \[\]\)/.test(editor))
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

  /* Changed on purpose (the owner: "customers can reach payment without entering a shipping address... prevent this from ever happening again"): a row that says not shipped is shipped all the same. */
  section("NEVER WITHOUT AN ADDRESS: a row that says not shipped, or was written without it")
  {
    const hand = await shippedQuote(shop({ requiresShipping: false }) as never, SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 1 }] }, null)
    check("the address and the delivery are asked all the same, with - / +", hand.ok === true && hand.quote.requiresShipping === true && hand.quote.lines[0].requiresShipping === true && hand.quote.lines[0].maxQuantity === 3, hand)
    const ro = await shippedQuote(shop({ requiresShipping: false }) as never, SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 1 }], country: "RO" }, null)
    check("  and priced with its shipping", ro.ok === true && ro.quote.delivery.options.length > 0 && ro.quote.totals.shippingCents >= 0, ro.ok ? ro.quote.delivery : ro)
    const sql = readFileSync(join(process.cwd(), "supabase/sql/run-now/161_physical_products_ship_by_default.sql"), "utf8")
    check("part 161: a physical product ships by default", /ALTER TABLE public\.products ALTER COLUMN requires_shipping SET DEFAULT true;/.test(sql) && sql.trim().split("\n").every((l) => l.trim().endsWith(";") || l.trim().endsWith("*/")))
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
    check("the page lists only the shop's countries and says when it doesn't ship there", /shipsTo\.includes\(c\.code\) \|\| c\.code === address\.country/.test(page) && /* Changed on purpose: in the visitor's language, the country named in it too. */ /ct\("We don't ship to \{country\}\.", \{ country: countryName\(address\.country\) \}\)/.test(page))
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
