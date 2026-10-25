/**
 * AN IMPORTED THEME'S CART: THE DISCOUNT BOX, ESTIMATE SHIPPING, THE ORDER NOTE
 *
 * "In imported themes the cart drawer's discount code field cannot apply a
 * code, Estimate shipping doesn't work, Add order note doesn't persist."
 *
 * Every request here goes through the site's own `answer` (lib/storelib-
 * theme/compat/site.ts), with the cart priced by the website checkout's own
 * physical pricing (lib/checkout/site-quote-server shippedQuote) on a fake
 * database, through lib/storelib-theme/compat/cart-pricing-server.ts:
 *
 *   CODES     /cart/update.js `discount`: a valid code, an unknown one, an
 *             expired one, one under its minimum order, one for some products,
 *             two at once, taken off again; the totals, the drawer drawn
 *             again, /cart.js and the page; /discount/<code>; on to checkout
 *   SHIPPING  /cart/shipping_rates.json, prepare_ and async_: a zone with a
 *             rate, a zone without, no zone, a state, a free shipping code
 *   NOTE      /cart/update.js `note` and `attributes`: kept, drawn again, on
 *             to checkout and onto the order the seller sees
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/compat-cart-discount.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, readCartCookie, writeCartCookie, type CartEntry, type SiteData, type SiteRequest, type SiteResponse } from "../lib/storelib-theme/compat/site"
import { compatCartPricing } from "../lib/storelib-theme/compat/cart-pricing-server"
import { shippedQuote } from "../lib/checkout/site-quote-server"
import { readSiteCheckoutParams } from "../lib/checkout/site-checkout"
import { parseCartExtras } from "../lib/website-builder/cart-extras"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))

const SHOP = "5b1c0000-0000-4000-8000-000000000001"
const SLEEVE = "5b1c0000-0000-4000-8000-0000000000a1"
const MUG = "5b1c0000-0000-4000-8000-0000000000a2"
const M = "5b1c0000-0000-4000-8000-0000000000b1"
const S = "5b1c0000-0000-4000-8000-0000000000b2"
const MUGV = "5b1c0000-0000-4000-8000-0000000000b3"
const STUDIO = "5b1c0000-0000-4000-8000-0000000000c1"

const coupon = (c: Record<string, unknown>) => ({ creator_id: SHOP, discount_type: "percentage", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, min_purchase_cents: null, ...c })

function db() {
  const rate = (r: Record<string, unknown>) => ({ creator_id: SHOP, active: true, position: 0, tiers: [], min_value: null, max_value: null, free_over_cents: null, min_days: 2, max_days: 4, ...r })
  const variant = (v: Record<string, unknown>) => ({ weight_grams: 200, track_inventory: true, inventory_policy: "deny", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null, position: 0, ...v })
  const product = (p: Record<string, unknown>) => ({ creator_id: SHOP, type: "physical", status: "published", thumbnail_url: null, requires_shipping: true, weight_grams: 200, taxable: true, track_inventory: true, continue_selling: false, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: null, max_per_order: null, ...p })
  return fakeDb({
    products: [product({ id: SLEEVE, title: "Black Sleeve", slug: "black-sleeve", price_cents: 3500 }), product({ id: MUG, title: "Mug", slug: "mug", price_cents: 2000 })],
    product_variants: [variant({ id: M, product_id: SLEEVE, name: "M", option1: "M", price_cents: 3500 }), variant({ id: S, product_id: SLEEVE, name: "S", option1: "S", price_cents: 3500, position: 1 }), variant({ id: MUGV, product_id: MUG, name: "Default", price_cents: 2000 })],
    product_options: [{ product_id: SLEEVE, position: 1, name: "Size", values: ["M", "S"] }],
    commerce_settings: [{ creator_id: SHOP, default_location_id: STUDIO, unit_system: "metric", returns_enabled: true, return_window_days: 30, tax_mode: "none", low_stock_default: 5, low_stock_alerts: true }],
    inventory_locations: [{ id: STUDIO, creator_id: SHOP, name: "Studio", kind: "home", country: "RO", city: "Cluj", address_line1: "Str. Lunga 1", postal_code: "400001", active: true, fulfills_orders: true, holds_inventory: true, priority: 0, forwarding: "none", pickup_enabled: false }],
    inventory_levels: [
      { variant_id: M, location_id: STUDIO, creator_id: SHOP, available: 20 },
      { variant_id: S, location_id: STUDIO, creator_id: SHOP, available: 20 },
      { variant_id: MUGV, location_id: STUDIO, creator_id: SHOP, available: 20 },
    ],
    shipping_profiles: [{ id: "general", creator_id: SHOP, name: "General", is_default: true, created_at: "2026-01-01" }],
    shipping_zones: [
      { id: "z-ro", creator_id: SHOP, profile_id: "general", name: "Romania", countries: ["RO"], regions: [], rest_of_world: false },
      { id: "z-fr", creator_id: SHOP, profile_id: "general", name: "France (no rate)", countries: ["FR"], regions: [], rest_of_world: false },
      { id: "z-ca", creator_id: SHOP, profile_id: "general", name: "California", countries: [], regions: ["US-CA"], rest_of_world: false },
    ],
    shipping_rates: [
      rate({ id: "r-ro", zone_id: "z-ro", name: "Standard", kind: "flat", price_cents: 1500 }),
      rate({ id: "r-ro2", zone_id: "z-ro", name: "Express", kind: "flat", price_cents: 2500, position: 1 }),
      rate({ id: "r-ca", zone_id: "z-ca", name: "California post", kind: "flat", price_cents: 900 }),
    ],
    shipping_packages: [],
    store_settings: [{ creator_id: SHOP, currency: "USD", default_country: "RO" }],
    coupons: [
      coupon({ id: "c1", code: "SAVE10" }),
      coupon({ id: "c2", code: "FIVE", discount_type: "fixed", discount_value: 5 }),
      coupon({ id: "c3", code: "OLD", expires_at: "2020-01-01T00:00:00Z" }),
      coupon({ id: "c4", code: "BIG", min_purchase_cents: 50000 }),
      coupon({ id: "c5", code: "SLEEVES", discount_value: 20, product_ids: [SLEEVE] }),
      coupon({ id: "c6", code: "SHIPFREE", discount_value: 0, free_shipping: true }),
      coupon({ id: "c7", code: "GONE", usage_limit: 3, usage_count: 3 }),
    ],
  })
}

const card = (id: string, title: string, price: string, variants: { id: string; name: string }[]) => ({
  id,
  settings: { title, price, image: "", url: `/products/${title.toLowerCase().replace(/ /g, "-")}`, slug: title.toLowerCase().replace(/ /g, "-"), kind: "physical", available: true, variants: variants.map((v) => ({ ...v, price: "", available: true })), options: variants.length > 1 ? [{ name: "Size", values: variants.map((v) => v.name) }] : [] },
})
const sectionFile = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
/* A drawer written the way Horizon and Dawn write theirs: each line's own discounts, the order's, the total, the note. */
const DRAWER = `<div class="drawer">{% for item in cart.items %}<p class="line">{{ item.title }} {{ item.final_line_price | money }}{% for a in item.line_level_discount_allocations %} <span class="alloc">{{ a.discount_application.title }} -{{ a.amount | money }}</span>{% endfor %}</p>{% endfor %}{% for d in cart.cart_level_discount_applications %}<p class="cart-disc">{{ d.title }} -{{ d.total_allocated_amount | money }}</p>{% endfor %}<p class="total">{{ cart.total_price | money }}</p><p class="note">{{ cart.note }}</p><p class="gift">{{ cart.attributes['Gift message'] }}</p></div>`
const files: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body>{% section 'drawer' %}<main>{{ content_for_layout }}</main></body></html>`),
  "sections/drawer.storelib": sectionFile("drawer", DRAWER),
  "sections/main-cart.storelib": sectionFile("main-cart", `<div class="cart-page">{{ cart.item_count }} items, {{ cart.total_price | money }}</div>`),
  "templates/cart.json": JSON.stringify({ sections: { main: { type: "main-cart" } }, order: ["main"] }),
}
const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })

function site(withPricing = true): SiteData {
  const base: SiteData = {
    creatorId: SHOP,
    theme,
    pages: { cart: [{ id: "main", type: "main-cart" }] as never },
    products: [card(SLEEVE, "Black Sleeve", "$35.00", [{ id: M, name: "M" }, { id: S, name: "S" }]), card(MUG, "Mug", "$20.00", [])] as never,
    collections: [],
    menus: {},
    shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" },
    host: "shop.test",
  }
  if (!withPricing) return base
  const fake = db()
  return { ...base, pricing: compatCartPricing({ creatorId: SHOP, storeCurrency: "USD", market: null, db: fake, quote: (d, id, body) => shippedQuote(d, id, body, null) }) }
}

/* One visitor's cart, carried from answer to answer as the cookie carries it. */
class Visitor {
  cart: CartEntry[] = []
  note = ""
  attributes: Record<string, string> = {}
  discountCode = ""
  constructor(public site: SiteData) {}
  async ask(method: string, url: string, body: Record<string, unknown> | null = null, ajax = true): Promise<SiteResponse> {
    const u = new URL(url, "https://shop.test")
    const req: SiteRequest = { method, path: u.pathname, query: u.searchParams, body, cart: this.cart, note: this.note, attributes: this.attributes, discountCode: this.discountCode, ajax, referer: "/" }
    const out = await answer(this.site, req)
    if (out.cart) {
      /* Through the cookie and back, exactly as the route writes it. */
      const kept = readCartCookie(writeCartCookie(out.cart, out.note ?? "", out.attributes ?? this.attributes, out.discountCode ?? this.discountCode))
      this.cart = kept.cart
      this.note = kept.note
      this.attributes = kept.attributes
      this.discountCode = kept.discount
    }
    return out
  }
  async json(method: string, url: string, body: Record<string, unknown> | null = null) {
    const out = await this.ask(method, url, body)
    return { status: out.status, body: JSON.parse(String(out.body)) }
  }
}

async function main() {
  section("CODES: /cart/update.js `discount`, priced by the checkout's own rules")
  {
    const v = new Visitor(site())
    await v.json("POST", "/cart/add.js", { id: M, quantity: 2 })
    const plain = await v.json("GET", "/cart.js")
    check("a cart of two sleeves: $70.00, nothing off", plain.body.total_price === 7000 && plain.body.total_discount === 0 && JSON.stringify(plain.body.discount_codes) === "[]", plain.body)

    const applied = await v.json("POST", "/cart/update.js", { discount: "save10", sections: "drawer" })
    check("a valid code applies, as the shop writes it", applied.status === 200 && JSON.stringify(applied.body.discount_codes) === '[{"code":"SAVE10","applicable":true}]', applied.body.discount_codes)
    check("  the totals take it off: $7.00 of $70.00", applied.body.total_price === 6300 && applied.body.total_discount === 700 && applied.body.original_total_price === 7000, applied.body)
    const app = applied.body.cart_level_discount_applications?.[0]
    check("  a code for the whole order is a cart level application, Shopify's shape", app?.type === "discount_code" && app?.title === "SAVE10" && app?.value === "10.0" && app?.value_type === "percentage" && app?.target_selection === "all" && app?.total_allocated_amount === 700, app)
    check("  each line says what came off it", applied.body.items[0].total_discount === 700 && applied.body.items[0].discounts[0]?.title === "SAVE10" && applied.body.items[0].final_line_price === 7000, applied.body.items[0])
    check("  the drawer is drawn again with it (the sections API)", /class="cart-disc">SAVE10 -\$7\.00/.test(applied.body.sections?.drawer ?? "") && /class="total">\$63\.00/.test(applied.body.sections?.drawer ?? ""), applied.body.sections)
    check("  the cart holds it (the cookie)", v.discountCode === "SAVE10")
    const again = await v.json("GET", "/cart.js")
    check("/cart.js says it again on the next request", again.body.total_price === 6300 && again.body.discount_codes[0]?.applicable === true, again.body)
    const page = await v.ask("GET", "/cart", null, false)
    check("the cart page and its drawer, drawn on a reload, show it", /class="cart-disc">SAVE10 -\$7\.00/.test(String(page.body)) && /2 items, \$63\.00/.test(String(page.body)), String(page.body).slice(0, 400))
    const changed = await v.json("POST", "/cart/change.js", { line: 1, quantity: 3 })
    check("a quantity changed is priced again with the code ($10.50 of $105.00)", changed.body.total_discount === 1050 && changed.body.total_price === 9450, changed.body)

    const onward = await v.ask("POST", "/cart", { "updates[]": ["3"], checkout: "" }, false)
    const loc = onward.headers?.Location ?? ""
    check("Check out carries the code on to the website's checkout", onward.status === 303 && readSiteCheckoutParams(new URL(loc, "https://shop.test").searchParams).couponCode === "SAVE10", loc)
    const direct = await v.ask("GET", "/checkout", null, false)
    check("  and so does the theme's /checkout", readSiteCheckoutParams(new URL(direct.headers?.Location ?? "", "https://shop.test").searchParams).couponCode === "SAVE10", direct.headers)

    const removed = await v.json("POST", "/cart/update.js", { discount: "" })
    check("taking it off (`discount: \"\"`) puts the price back", removed.body.total_price === 10500 && removed.body.total_discount === 0 && JSON.stringify(removed.body.discount_codes) === "[]" && v.discountCode === "", removed.body)
  }

  section("CODES THAT DO NOT APPLY: the theme's own error, nothing taken off")
  {
    const v = new Visitor(site())
    await v.json("POST", "/cart/add.js", { id: M, quantity: 1 })
    for (const [typed, why] of [["NOPE", "an unknown code"], ["OLD", "an expired code"], ["BIG", "a code under its minimum order"], ["GONE", "a code used up"]] as const) {
      const r = await v.json("POST", "/cart/update.js", { discount: typed })
      check(`${why} is applicable: false (what Horizon reads to show its error), the total unchanged`, r.status === 200 && r.body.discount_codes.length === 1 && r.body.discount_codes[0].applicable === false && r.body.total_price === 3500 && r.body.total_discount === 0 && v.discountCode === "", r.body)
    }
    const pricing = site().pricing!
    const cart = [{ k: M, p: SLEEVE, v: M, q: 1 }]
    const old = await pricing.discount(cart, "OLD", { [M]: 3500 })
    const big = await pricing.discount(cart, "BIG", { [M]: 3500 })
    check("  the reason is the checkout's: expired, and the minimum named", old.applicable === false && /expired/.test(old.error ?? "") && big.applicable === false && /at least \$500\.00/.test(big.error ?? ""), { old, big })

    const two = await v.json("POST", "/cart/update.js", { discount: "SAVE10,FIVE" })
    check("two codes at once: the first that applies is the cart's, the other does not combine", two.body.discount_codes[0]?.code === "SAVE10" && two.body.discount_codes[0]?.applicable === true && two.body.discount_codes[1]?.code === "FIVE" && two.body.discount_codes[1]?.applicable === false && two.body.total_discount === 350, two.body.discount_codes)
    const fixed = await v.json("POST", "/cart/update.js", { discount: "FIVE" })
    const fapp = fixed.body.cart_level_discount_applications?.[0]
    check("a fixed code takes its amount off: $5.00", fixed.body.total_price === 3000 && fapp?.value_type === "fixed_amount" && fapp?.value === "5.00", fixed.body)
  }

  section("A CODE FOR SOME PRODUCTS: on those lines, not the others")
  {
    const v = new Visitor(site())
    await v.json("POST", "/cart/add.js", { items: [{ id: M, quantity: 1 }, { id: MUG, quantity: 1 }] })
    const r = await v.json("POST", "/cart/update.js", { discount: "SLEEVES", sections: "drawer" })
    const sleeve = r.body.items.find((i: { product_id: string }) => i.product_id === SLEEVE)
    const mug = r.body.items.find((i: { product_id: string }) => i.product_id === MUG)
    check("20% off the sleeve alone, as a line level allocation", sleeve?.line_level_discount_allocations?.[0]?.amount === 700 && sleeve?.final_line_price === 2800 && mug?.total_discount === 0 && mug?.final_line_price === 2000, r.body.items)
    check("  the cart's totals: $48.00 of $55.00, no cart level application", r.body.total_price === 4800 && r.body.items_subtotal_price === 4800 && r.body.cart_level_discount_applications.length === 0, r.body)
    check("  the drawer shows it on the sleeve's line", /Black Sleeve - M \$28\.00 <span class="alloc">SLEEVES -\$7\.00/.test(r.body.sections?.drawer ?? ""), r.body.sections)
  }

  section("A DISCOUNT LINK: /discount/<code>")
  {
    const v = new Visitor(site())
    await v.json("POST", "/cart/add.js", { id: M, quantity: 1 })
    const r = await v.ask("GET", "/discount/SAVE10?redirect=/collections/all", null, false)
    check("holds the code and lands where the link says", r.status === 303 && r.headers?.Location === "/collections/all" && v.discountCode === "SAVE10", r.headers)
    const off = await v.ask("GET", "/discount/SAVE10?redirect=https://evil.example", null, false)
    check("  never on another site", off.headers?.Location === "/", off.headers)
    const cart = await v.json("GET", "/cart.js")
    check("  and the cart takes it off", cart.body.total_price === 3150, cart.body)
  }

  section("WITHOUT A CHECKOUT TO PRICE IT (the builder's canvas): held, nothing taken off")
  {
    const v = new Visitor(site(false))
    await v.json("POST", "/cart/add.js", { id: M, quantity: 1 })
    const r = await v.json("POST", "/cart/update.js", { discount: "SAVE10" })
    check("no code applies, and no price changes", r.body.total_price === 3500 && r.body.discount_codes[0]?.applicable === false, r.body)
  }

  section("ESTIMATE SHIPPING: Settings › Shipping's rates, Shopify's JSON")
  {
    const v = new Visitor(site())
    await v.json("POST", "/cart/add.js", { id: M, quantity: 1 })
    const ro = await v.json("GET", "/cart/shipping_rates.json?shipping_address[country]=Romania&shipping_address[zip]=400001")
    check("a zone with rates: each rate, its price a decimal string in the cart's currency", ro.status === 200 && JSON.stringify(ro.body.shipping_rates.map((r: { name: string; price: string; currency: string }) => `${r.name}:${r.price}:${r.currency}`)) === '["Standard:15.00:USD","Express:25.00:USD"]', ro.body)
    check("  with the fields a theme reads", ro.body.shipping_rates[0].presentment_name === "Standard" && Array.isArray(ro.body.shipping_rates[0].delivery_days), ro.body.shipping_rates[0])
    const fr = await v.json("GET", "/cart/shipping_rates.json?shipping_address[country]=France")
    check("a zone with no rate turned on: 422, the country not supported", fr.status === 422 && JSON.stringify(fr.body) === '{"country":["is not supported"]}', fr)
    const de = await v.json("GET", "/cart/shipping_rates.json?shipping_address[country]=DE")
    check("a country in no zone: the same", de.status === 422 && de.body.country?.[0] === "is not supported", de)
    const blank = await v.json("GET", "/cart/shipping_rates.json")
    const nowhere = await v.json("GET", "/cart/shipping_rates.json?shipping_address[country]=Atlantis")
    check("no country, and one that is not a country", blank.status === 422 && blank.body.country?.[0] === "can't be blank" && nowhere.status === 422, { blank, nowhere })
    const ca = await v.json("GET", "/cart/shipping_rates.json?shipping_address[country]=United%20States&shipping_address[province]=California")
    check("a zone of states: the state chosen by its name", ca.status === 200 && ca.body.shipping_rates[0]?.name === "California post" && ca.body.shipping_rates[0]?.price === "9.00", ca)
    const nostate = await v.json("GET", "/cart/shipping_rates.json?shipping_address[country]=US")
    check("  without a state: 422 on the province", nostate.status === 422 && Array.isArray(nostate.body.province), nostate)
    const prep = await v.ask("POST", "/cart/prepare_shipping_rates.json?shipping_address[country]=Romania")
    const asynced = await v.json("GET", "/cart/async_shipping_rates.json?shipping_address[country]=Romania")
    check("prepare_shipping_rates answers 202, async_shipping_rates the rates", prep.status === 202 && asynced.status === 200 && asynced.body.shipping_rates.length === 2, { prep: prep.status, asynced })
    const posted = await v.json("POST", "/cart/shipping_rates.json", { shipping_address: { country: "RO", zip: "400001" } })
    check("an address posted as JSON is read the same", posted.status === 200 && posted.body.shipping_rates.length === 2, posted)
    await v.json("POST", "/cart/update.js", { discount: "SHIPFREE" })
    check("a free shipping code is held", v.discountCode === "SHIPFREE")
    const free = await v.json("GET", "/cart/shipping_rates.json?shipping_address[country]=Romania")
    check("  and the rates it covers are free", free.body.shipping_rates.every((r: { price: string }) => r.price === "0.00"), free.body)
    const empty = new Visitor(site())
    const none = await empty.json("GET", "/cart/shipping_rates.json?shipping_address[country]=Romania")
    check("an empty cart has no rates to show", none.status === 200 && none.body.shipping_rates.length === 0, none)
  }

  section("THE ORDER NOTE AND THE CART'S ATTRIBUTES: kept, drawn again, on to the order")
  {
    const v = new Visitor(site())
    await v.json("POST", "/cart/add.js", { id: M, quantity: 1 })
    const r = await v.json("POST", "/cart/update.js", { note: "Leave it at the door", attributes: { "Gift message": "Happy birthday" } })
    check("/cart/update.js keeps the note and the attributes", r.body.note === "Leave it at the door" && r.body.attributes["Gift message"] === "Happy birthday", r.body)
    const reload = await v.ask("GET", "/cart", null, false)
    check("  a reload draws them again (cart.note, cart.attributes)", /class="note">Leave it at the door</.test(String(reload.body)) && /class="gift">Happy birthday</.test(String(reload.body)))
    const form = await v.json("POST", "/cart/update.js", { "attributes[Delivery date]": "Friday" })
    check("  a form's attributes[...] adds to them, the note stays", form.body.attributes["Delivery date"] === "Friday" && form.body.attributes["Gift message"] === "Happy birthday" && form.body.note === "Leave it at the door", form.body)
    const out = await v.ask("GET", "/checkout", null, false)
    const params = readSiteCheckoutParams(new URL(out.headers?.Location ?? "", "https://shop.test").searchParams)
    check("Check out carries the note and the attributes to the website's checkout", params.note === "Leave it at the door" && params.attributes?.["Gift message"] === "Happy birthday" && params.attributes?.["Delivery date"] === "Friday", params)
    check("the cookie keeps the note, the attributes and the code together", (() => { const c = readCartCookie(writeCartCookie(v.cart, v.note, v.attributes, "SAVE10")); return c.note === v.note && c.attributes["Gift message"] === "Happy birthday" && c.discount === "SAVE10" })())

    const page = code("app/checkout/site/page.tsx")
    check("the checkout opened from the cookie takes its note, attributes and code", /params\.note = params\.note \?\? \(theme\.note/.test(page) && /params\.couponCode = params\.couponCode \?\? \(theme\.discount/.test(page))
    const checkout = code("app/checkout/site/site-checkout.tsx")
    check("  its note for the shop starts with the cart's note and is sent with the order", /React\.useState\(initialNote \?\? ""\)/.test(checkout) && /buyerNote/.test(checkout) && /cartAttributes/.test(checkout))
    const route = code("app/api/checkout/site/route.ts")
    check("  the route hands both to the order", (route.match(/buyerNote: body\.buyerNote/g) ?? []).length >= 2 && (route.match(/cartAttributes: body\.cartAttributes/g) ?? []).length >= 2)
    /* Changed on purpose (round AF): the codes a `discount` asked for are kept too. */
    check("  and the checkout changing the order keeps the cart's attributes and code in the cookie", !/writeCartCookie\(kept, theme\.note\)/.test(route) && (route.match(/writeCartCookie\(kept, theme\.note, theme\.attributes, theme\.discount, theme\.codes\)/g) ?? []).length === 2)
    /* Changed on purpose (round BC): the note keeps its line breaks (orderNote); clean() ran every space together. */
    check("the order keeps the note (buyer_note) and the attributes", /buyer_note: orderNote\(input\.buyerNote\)/.test(code("lib/physical/checkout-server.ts")) && /cart_attributes: attributes/.test(code("lib/physical/checkout-server.ts")))
    check("  the seller's order view, the order emails and the seller's notice read them", /buyerNote: co\.buyer_note/.test(code("lib/physical/orders-server.ts")) && /buyer_note/.test(code("lib/email.tsx")) && /note: str\(co\.buyer_note/.test(code("lib/notify/seller-commerce.ts")))
  }

  section("ONE OPTION ON TWO LINES (an engraving on one): the code split between them to the cent")
  {
    const v = new Visitor(site())
    await v.json("POST", "/cart/add.js", { id: M, quantity: 1, properties: { Engraving: "A" } })
    await v.json("POST", "/cart/add.js", { id: M, quantity: 2 })
    const r = await v.json("POST", "/cart/update.js", { discount: "FIVE" })
    const parts = r.body.items.map((i: { total_discount: number }) => i.total_discount)
    check("$5.00 over both lines, adding up exactly", v.cart.length === 2 && parts.reduce((n: number, x: number) => n + x, 0) === 500 && parts.every((x: number) => x > 0) && r.body.total_price === 10000, { parts, total: r.body.total_price })
  }

  section("STORELIB'S OWN THEMES: the cart page's code and note kept, the drawer's Check out carries them")
  {
    check("what is kept is read back, held to what the checkout takes", JSON.stringify(parseCartExtras(JSON.stringify({ code: " SAVE10 ", note: "x".repeat(2000) }))) === JSON.stringify({ code: "SAVE10", note: "x".repeat(1000) }) && JSON.stringify(parseCartExtras("{not json")) === '{"code":"","note":""}')
    const page = code("components/website-builder/cart-page-body.tsx")
    check("the cart page restores them after a reload and keeps what is applied", /const kept = readCartExtras\(shopId\)/.test(page) && /writeCartExtras\(shopId, \{ code: applied\?\.code \?\? "", note \}\)/.test(page))
    const drawer = code("lib/website-builder/cart-checkout.ts")
    check("the drawer's Check out sends the code and the note on", /couponCode: extras\.code \|\| null, note: extras\.note \|\| null/.test(drawer) && /couponCode: extras\.code/.test(drawer))
    const cart = code("components/website-builder/site-cart.tsx")
    check("an emptied or paid cart keeps no code or note for the next one", (cart.match(/removeItem\(cartExtrasKey\(shopId\)\)/g) ?? []).length === 2)
  }

  section("THE ROUTE: the cookie, the pricing, the code checks counted")
  {
    const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    /* Changed on purpose (round AF): and the codes asked for beside it. */
    check("reads the code from the cart cookie and writes it back", /const \{ cart, note, attributes, discount, codes \} = readCartCookie/.test(route) && /out\.discountCode \?\? discount, out\.discountCodes \?\? codes/.test(route))
    check("prices with the website's checkout, never on a preview", /compatCartPricing\(\{ creatorId: shopId, storeCurrency, market \}\)/.test(route) && /token \|\| stranger \? found\.site/.test(route))
    check("a code tried from the cart is counted with the checkout's own code checks", /bucket: "coupon"/.test(route) && /typeof fields\?\.discount === "string"/.test(route))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
