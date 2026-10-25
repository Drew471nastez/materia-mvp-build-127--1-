/**
 * ===========================================================================
 *  ROUND BC: THE CART AND THE WEBSITE'S CHECKOUT, WHAT THE BUYER ENTERED
 *  REACHES THE ORDER, BACK GOES WHERE THEY CAME FROM, AND IT OPENS SOONER
 * ===========================================================================
 *
 *   NOTES     a cart note ("Add order note") or the checkout's note keeps its
 *             line breaks on the order; a basket of downloads carries it on
 *             the payment (two parts within Stripe's 500 characters) onto
 *             every order line, the order page and the seller's email; the
 *             column may not be there yet
 *   CODES     the checkout's own pricing of a code: percentage, fixed, for
 *             some products, free shipping; expired, used up, under its
 *             minimum, unknown said, and the cart priced without it
 *   SHIPPING  the rates to an address, none where the shop does not ship;
 *             the cart says delivery and tax come at checkout; an imported
 *             theme's cart.taxes_included is the store's own setting
 *   TAX       EU VAT included in the price and added on top, on delivery
 *             too, after a code, to the cent
 *   LINES     each line's option and the buyer's words for it are shown;
 *             stock short of the quantity blocks Pay with a plain reason
 *   BACK      Back goes to the page the buyer was on: a theme's Buy it now
 *             and its cart drawer, a native Buy now and drawer, a plain
 *             /checkout link (the Referer), never the checkout or sign in
 *   SPEED     a cart that ships is priced by the physical checkout from the
 *             first read, not after the basket's pricing; Buy it now and a
 *             cart form's Check out do not read the stock on the way; the
 *             checkout is fetched ahead on intent, with its cart in the
 *             address only
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/round-bc-checkout.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, readCartCookie, writeCartCookie, type CartEntry, type SiteData, type SiteRequest, type SiteResponse } from "../lib/storelib-theme/compat/site"
import { cartObject } from "../lib/storelib-theme/compat/objects"
import { shippedQuote, siteQuote } from "../lib/checkout/site-quote-server"
import { CART_NOTE_MAX, NOTE_METADATA_KEYS, cartNote, noteFromMetadata, noteToMetadata, orderNote, readSiteCheckoutParams, siteCheckoutBack, siteCheckoutHref } from "../lib/checkout/site-checkout"
import { checkCouponLines, type CouponRow } from "../lib/checkout/coupons"
import { physicalTotals, type TaxSettings } from "../lib/physical/totals"
import { prefetchableCheckout } from "../lib/website-builder/checkout-prefetch"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const section = (t: string) => console.log(`\n${t}\n`)
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SHOP = "5b1c0000-0000-4000-8000-000000000001"
const SLEEVE = "5b1c0000-0000-4000-8000-0000000000a1"
const MUG = "5b1c0000-0000-4000-8000-0000000000a2"
const M = "5b1c0000-0000-4000-8000-0000000000b1"
const S = "5b1c0000-0000-4000-8000-0000000000b2"
const MUGV = "5b1c0000-0000-4000-8000-0000000000b3"
const STUDIO = "5b1c0000-0000-4000-8000-0000000000c1"

const coupon = (c: Record<string, unknown>) => ({ creator_id: SHOP, discount_type: "percentage", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, min_purchase_cents: null, ...c })

/** A shop in Romania that ships a sleeve ($35, sizes M and S) and a mug ($20); `tax` sets Settings › Taxes, `stockS` what is left of size S. */
function db(opts: { tax?: { included: boolean; onShipping: boolean } | null; stockS?: number } = {}) {
  const rate = (r: Record<string, unknown>) => ({ creator_id: SHOP, active: true, position: 0, tiers: [], min_value: null, max_value: null, free_over_cents: null, min_days: 2, max_days: 4, ...r })
  const variant = (v: Record<string, unknown>) => ({ weight_grams: 200, track_inventory: true, inventory_policy: "deny", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null, position: 0, ...v })
  const product = (p: Record<string, unknown>) => ({ creator_id: SHOP, type: "physical", status: "published", thumbnail_url: null, requires_shipping: true, weight_grams: 200, taxable: true, track_inventory: true, continue_selling: false, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: null, max_per_order: null, ...p })
  const tax = opts.tax ?? null
  return fakeDb({
    products: [product({ id: SLEEVE, title: "Black Sleeve", slug: "black-sleeve", price_cents: 3500 }), product({ id: MUG, title: "Mug", slug: "mug", price_cents: 2000 })],
    product_variants: [variant({ id: M, product_id: SLEEVE, name: "M", option1: "M", price_cents: 3500 }), variant({ id: S, product_id: SLEEVE, name: "S", option1: "S", price_cents: 3500, position: 1 }), variant({ id: MUGV, product_id: MUG, name: "Default", price_cents: 2000 })],
    product_options: [{ product_id: SLEEVE, position: 1, name: "Size", values: ["M", "S"] }],
    commerce_settings: [{ creator_id: SHOP, default_location_id: STUDIO, unit_system: "metric", returns_enabled: true, return_window_days: 30, tax_mode: tax ? "manual" : "none", prices_include_tax: tax?.included ?? false, tax_on_shipping: tax?.onShipping ?? false, low_stock_default: 5, low_stock_alerts: true }],
    commerce_tax_rates: tax ? [{ id: "t-ro", creator_id: SHOP, country: "RO", region: null, name: "VAT", rate_bps: 1900 }] : [],
    inventory_locations: [{ id: STUDIO, creator_id: SHOP, name: "Studio", kind: "home", country: "RO", city: "Cluj", address_line1: "Str. Lunga 1", postal_code: "400001", active: true, fulfills_orders: true, holds_inventory: true, priority: 0, forwarding: "none", pickup_enabled: false }],
    inventory_levels: [
      { variant_id: M, location_id: STUDIO, creator_id: SHOP, available: 20 },
      { variant_id: S, location_id: STUDIO, creator_id: SHOP, available: opts.stockS ?? 20 },
      { variant_id: MUGV, location_id: STUDIO, creator_id: SHOP, available: 20 },
    ],
    shipping_profiles: [{ id: "general", creator_id: SHOP, name: "General", is_default: true, created_at: "2026-01-01" }],
    shipping_zones: [
      { id: "z-ro", creator_id: SHOP, profile_id: "general", name: "Romania", countries: ["RO"], regions: [], rest_of_world: false },
      { id: "z-fr", creator_id: SHOP, profile_id: "general", name: "France (no rate)", countries: ["FR"], regions: [], rest_of_world: false },
    ],
    shipping_rates: [
      rate({ id: "r-ro", zone_id: "z-ro", name: "Standard", kind: "flat", price_cents: 1500 }),
      rate({ id: "r-ro2", zone_id: "z-ro", name: "Express", kind: "flat", price_cents: 2500, position: 1 }),
    ],
    shipping_packages: [],
    store_settings: [{ creator_id: SHOP, currency: "EUR", default_country: "RO" }],
    coupons: [
      coupon({ id: "c1", code: "SAVE10" }),
      coupon({ id: "c2", code: "FIVE", discount_type: "fixed", discount_value: 5 }),
      coupon({ id: "c3", code: "OLD", expires_at: "2020-01-01T00:00:00Z" }),
      coupon({ id: "c4", code: "BIG", min_purchase_cents: 50000 }),
      coupon({ id: "c5", code: "SLEEVES", discount_value: 20, product_ids: [SLEEVE] }),
      coupon({ id: "c6", code: "SHIPFREE", discount_value: 0, free_shipping: true }),
      coupon({ id: "c7", code: "GONE", usage_limit: 3, usage_count: 3 }),
      coupon({ id: "c8", code: "SOON", starts_at: "2099-01-01T00:00:00Z" }),
    ],
  })
}

const card = (id: string, title: string, price: string, variants: { id: string; name: string }[]) => ({
  id,
  settings: { title, price, image: "", url: `/products/${title.toLowerCase().replace(/ /g, "-")}`, slug: title.toLowerCase().replace(/ /g, "-"), kind: "physical", available: true, variants: variants.map((v) => ({ ...v, price: "", available: true })), options: variants.length > 1 ? [{ name: "Size", values: variants.map((v) => v.name) }] : [] },
})
const sectionFile = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
/* Dawn's cart footer line, as it words the tax by cart.taxes_included. */
const FOOTER = `<p class="tax">{% if cart.taxes_included %}Taxes included. Shipping calculated at checkout.{% else %}Taxes and shipping calculated at checkout{% endif %}</p>`
const files: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body><main>{{ content_for_layout }}</main></body></html>`),
  "sections/main-cart.storelib": sectionFile("main-cart", `<div class="cart-page">{{ cart.item_count }} items, {{ cart.total_price | money }}</div>${FOOTER}`),
  "templates/cart.json": JSON.stringify({ sections: { main: { type: "main-cart" } }, order: ["main"] }),
}
const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })

/** The theme's site; `stock` answers what a cart may hold (and counts how often it was asked). */
function site(opts: { taxesIncluded?: boolean; stock?: { asked: number } } = {}): SiteData {
  return {
    creatorId: SHOP,
    theme,
    pages: { cart: [{ id: "main", type: "main-cart" }] as never },
    products: [card(SLEEVE, "Black Sleeve", "$35.00", [{ id: M, name: "M" }, { id: S, name: "S" }]), card(MUG, "Mug", "$20.00", [])] as never,
    collections: [],
    menus: {},
    shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}", ...(opts.taxesIncluded ? { taxesIncluded: true } : {}) },
    host: "shop.test",
    ...(opts.stock
      ? {
          stock: async () => {
            opts.stock!.asked++
            return { variants: { [M]: 2, [S]: 2 }, perOrder: null }
          },
        }
      : {}),
  }
}

/* One visitor's cart, carried from answer to answer as the cookie carries it; `referer` is the page the request came from. */
class Visitor {
  cart: CartEntry[] = []
  note = ""
  attributes: Record<string, string> = {}
  discountCode = ""
  constructor(public site: SiteData) {}
  async ask(method: string, url: string, body: Record<string, unknown> | null = null, ajax = true, referer?: string): Promise<SiteResponse> {
    const u = new URL(url, "https://shop.test")
    const req: SiteRequest = { method, path: u.pathname, query: u.searchParams, body, cart: this.cart, note: this.note, attributes: this.attributes, discountCode: this.discountCode, ajax, referer }
    const out = await answer(this.site, req)
    if (out.cart) {
      const kept = readCartCookie(writeCartCookie(out.cart, out.note ?? "", out.attributes ?? this.attributes, out.discountCode ?? this.discountCode))
      this.cart = kept.cart
      this.note = kept.note
      this.attributes = kept.attributes
      this.discountCode = kept.discount
    }
    return out
  }
}
const paramsOf = (location: string | undefined) => readSiteCheckoutParams(new URL(location ?? "/", "https://shop.test").searchParams)
const backOfLink = (location: string | undefined, referer: string | null = null) => siteCheckoutBack(new URL(location ?? "/", "https://shop.test").searchParams, "shop.test", referer)

async function main() {
  /* ── NOTES ───────────────────────────────────────────────────────── */
  section("NOTES: what the buyer wrote reaches the order as they wrote it")
  {
    const two = "Please gift wrap it.\nRing twice,   the bell is quiet."
    check("a two line note keeps its line break on the order (orderNote)", orderNote(two) === "Please gift wrap it.\nRing twice, the bell is quiet.", orderNote(two))
    check("  Windows line ends, control characters and angle brackets go; the words stay", orderNote("a\r\nb\u0007 <b>c</b>") === "a\nb bc/b", orderNote("a\r\nb\u0007 <b>c</b>"))
    check("  blank lines run together to one, the ends trimmed, nothing at all is null", orderNote("\n\na\n\n\n\nb  \n") === "a\n\nb" && orderNote("  \n ") === null && orderNote(42) === null)
    check("  at most the checkout's own 1000 characters", orderNote("x".repeat(1500))!.length === CART_NOTE_MAX && cartNote("y".repeat(1500))!.length === CART_NOTE_MAX)

    const short = noteToMetadata(two)
    check("a short note rides on the payment as one key", Object.keys(short).join() === "buyer_note" && noteFromMetadata(short) === orderNote(two), short)
    const long = "Line one of a long gift message.\n" + "word ".repeat(180)
    const parts = noteToMetadata(long)
    check("a long note is two keys, each within Stripe's 500 characters", Object.keys(parts).join() === NOTE_METADATA_KEYS.join() && parts.buyer_note.length <= 500 && parts.buyer_note_2.length <= 500, { a: parts.buyer_note?.length, b: parts.buyer_note_2?.length })
    check("  and comes back from them exactly", noteFromMetadata(parts) === orderNote(long))
    const emoji = "a".repeat(499) + "😀" + "b".repeat(20)
    const cut = noteToMetadata(emoji)
    check("  a character is never cut in half at the 500th place (a lone surrogate would break the payment)", !/[\ud800-\udbff]$/.test(cut.buyer_note) && !/^[\udc00-\udfff]/.test(cut.buyer_note_2 ?? "") && noteFromMetadata(cut) === emoji, { a: cut.buyer_note.length, b: cut.buyer_note_2 })
    check("  nothing written is no key at all", JSON.stringify(noteToMetadata("   ")) === "{}" && noteFromMetadata({}) === null && noteFromMetadata(null) === null)

    /* An imported theme's cart note, through the cookie and the checkout link. */
    const v = new Visitor(site())
    await v.ask("POST", "/cart/add.js", { id: M, quantity: 1 })
    await v.ask("POST", "/cart/update.js", { note: "Leave it\nat the door" })
    check("a theme's /cart/update.js note is kept in the cart, line break and all", v.note === "Leave it\nat the door", v.note)
    const out = await v.ask("POST", "/cart", { checkout: "" }, false, "/cart")
    check("  Check out carries it to the checkout as it was written", paramsOf(out.headers?.Location).note === "Leave it\nat the door", out.headers?.Location)

    const server = code("lib/physical/checkout-server.ts")
    check("a cart that ships keeps the note with its line breaks on its checkout (orderNote, not clean)", /buyer_note: orderNote\(input\.buyerNote\)/.test(server) && !/buyer_note: clean\(/.test(server))
    const route = code("app/api/checkout/site/route.ts")
    /* Changed on purpose (round AG): the lines' offers and properties (packExtras) take the room after the note and before the visit's touches. */
    check("a basket of downloads puts the note on its payment, after the record's own keys, before the visit's touches", /const noteKeys = noteToMetadata\(body\.buyerNote\)[\s\S]{0,200}<= STRIPE_METADATA_LIMIT\) Object\.assign\(metadata, noteKeys\)\s*\n[\s\S]{0,300}Object\.assign\(metadata, packExtras\([^\n]+\n\s*Object\.assign\(metadata, attributionToMetadata/.test(route))
    check("  a free basket of downloads takes it too", /fulfilFreeCart\(admin, \{[\s\S]*?buyerNote: orderNote\(body\.buyerNote\)/.test(route))
    const fulfil = code("lib/checkout/fulfil-cart-session.ts")
    check("the payment's note is read back when its order is written (page or webhook)", /buyerNote: noteFromMetadata\(metadata\)/.test(fulfil))
    check("  kept on every line of the order, a database without the column refusing that write alone", /update\(\{ buyer_note: buyerNote \}\)\.in\("id", s\.created\.map\(\(l\) => l\.orderId\)\)/.test(fulfil) && /isMissingColumn\(error, "buyer_note"\)/.test(fulfil))
    check("  and handed to the seller's email whether the column is there or not", /sale: \{ couponCode: s\.couponCode, lines: saleLines, buyerNote: s\.buyerNote \?\? null \}/.test(fulfil))
    const activity = code("app/api/app/orders/[id]/activity/route.ts")
    check("the order page reads the note with the order's activity, null where the column is missing", /select\("buyer_note"\)/.test(activity) && /if \(error\) return null/.test(activity) && /json\(\{ activity, note \}/.test(activity))
    const detail = code("app/app/orders/order-detail.tsx")
    check("  and an order that ships nothing shows it under Notes, From the buyer, its line breaks kept", /<BuyerNoteCard order=\{parcel\} \/> : <DigitalNoteCard orderId=\{order\.id\} \/>/.test(detail) && /function DigitalNoteCard[\s\S]*?tt\("From the buyer"\)[\s\S]*?whitespace-pre-wrap/.test(detail))
    const checkout = code("app/checkout/site/site-checkout.tsx")
    check("the checkout shows a download cart's note when its cart brought one, so it is never dropped unseen", /\{ships \|\| initialNote \? \(\s*<details/.test(checkout) && /buyerNote: note,/.test(checkout))
    const migration = raw("supabase/migrations/20270215_order_buyer_note.sql")
    check("the column is added by a migration that can run twice (not run here)", /ADD COLUMN IF NOT EXISTS buyer_note text/.test(migration) && /length\(buyer_note\) <= 1000/.test(migration))

    const { renderEmail } = await import("../lib/notify/templates")
    const ctx = { baseUrl: "https://storelib.com" }
    const digital = renderEmail("NEW_SALE", { orderId: "o1", productTitle: "Presets", amountCents: 900, currency: "eur", customerName: "Ana Pop", lines: [{ title: "Presets", amountCents: 900 }], buyerNote: "For my sister, happy birthday" }, ctx)
    check("the seller's sale email lists the note of an order with nothing to ship", /Buyer&#39;s note|Buyer's note/.test(digital.html) && /happy birthday/.test(digital.html) && /happy birthday/.test(digital.text), digital.text.slice(0, 600))
    const shipped = renderEmail("NEW_SALE", { orderId: "o2", productTitle: "Sleeve", amountCents: 3500, currency: "eur", lines: [{ title: "Sleeve", amountCents: 3500 }], buyerNote: "Ring twice", fulfil: { kind: "ship", shipTo: ["Ana Pop", "Str. Lunga 1"], note: "Ring twice" } }, ctx)
    check("  an order that ships says it once, with its delivery", (shipped.text.match(/Ring twice/g) ?? []).length === 1, shipped.text.slice(0, 800))
    const longNote = renderEmail("NEW_SALE", { orderId: "o3", productTitle: "Sleeve", amountCents: 3500, currency: "eur", lines: [{ title: "Sleeve", amountCents: 3500 }], fulfil: { kind: "ship", shipTo: ["A"], note: `${"n".repeat(700)}END` } }, ctx)
    check("  a long note is not cut at 500 characters any more", /nEND/.test(longNote.text))
    check("  the email data names the key (lib/email.tsx saleEmailData)", /buyerNote: safeNote\(first\?\.buyer_note\) \|\| safeNote\(sale\.buyerNote\)/.test(code("lib/email.tsx")))
  }

  /* ── CODES ───────────────────────────────────────────────────────── */
  section("CODES: the checkout prices them, with delivery, to the cent")
  {
    const items = [{ productId: SLEEVE, variantId: M, quantity: 2 }, { productId: MUG, variantId: MUGV, quantity: 1 }]
    const ro = { country: "RO", deliveryOptionId: "r-ro" }
    const plain = await shippedQuote(db(), SHOP, { items, ...ro }, null)
    const t0 = plain.ok ? plain.quote.totals : null
    check("no code: 2 x 35.00 + 20.00 = 90.00, Standard 15.00, total 105.00", !!t0 && t0.itemsSubtotalCents === 9000 && t0.discountCents === 0 && t0.shippingCents === 1500 && t0.totalCents === 10500, t0)
    const pct = await shippedQuote(db(), SHOP, { items, couponCode: "save10", ...ro }, null)
    const t1 = pct.ok ? pct.quote.totals : null
    check("10% (typed in small letters): 9.00 off the items, never the delivery: 96.00", !!t1 && pct.ok && pct.quote.coupon?.code === "SAVE10" && t1.discountCents === 900 && t1.shippingCents === 1500 && t1.totalCents === 9600, t1)
    const fixed = await shippedQuote(db(), SHOP, { items, couponCode: "FIVE", ...ro }, null)
    const t2 = fixed.ok ? fixed.quote.totals : null
    const lineOff = fixed.ok ? fixed.quote.lines.reduce((n, l) => n + l.discountCents, 0) : -1
    check("5.00 fixed: 100.00 to pay, and the lines' parts add up to the 5.00 exactly", !!t2 && t2.discountCents === 500 && t2.totalCents === 10000 && lineOff === 500, { t2, lineOff })
    const some = await shippedQuote(db(), SHOP, { items, couponCode: "SLEEVES", ...ro }, null)
    const t3 = some.ok ? some.quote.totals : null
    const mugOff = some.ok ? some.quote.lines.find((l) => l.productId === MUG)?.discountCents : -1
    check("20% on sleeves only: 14.00 off the sleeves, the mug at its price: 91.00", !!t3 && t3.discountCents === 1400 && mugOff === 0 && t3.totalCents === 9100, { t3, mugOff })
    const ship = await shippedQuote(db(), SHOP, { items, couponCode: "SHIPFREE", ...ro }, null)
    const t4 = ship.ok ? ship.quote.totals : null
    check("free shipping: the delivery shown and taken off, 90.00", !!t4 && ship.ok && ship.quote.coupon?.freeShipping === true && t4.shippingCents === 1500 && t4.shippingDiscountCents === 1500 && t4.totalCents === 9000, t4)
    for (const [typed, said] of [["OLD", /expired/], ["GONE", /used up/], ["BIG", /at least/], ["NOPE", /not valid/], ["SOON", /not active yet/]] as const) {
      const r = await shippedQuote(db(), SHOP, { items, couponCode: typed, ...ro }, null)
      check(`${typed}: said (${said}), and the order priced without it at 105.00`, r.ok && said.test(r.quote.couponError ?? "") && r.quote.coupon === null && r.quote.totals.totalCents === 10500, r.ok ? { e: r.quote.couponError, t: r.quote.totals.totalCents } : r)
    }
    const minimum = await shippedQuote(db(), SHOP, { items, couponCode: "BIG", ...ro }, null)
    check("  the minimum is named in the store's currency", minimum.ok && /€500\.00|500\.00/.test(minimum.quote.couponError ?? ""), minimum.ok ? minimum.quote.couponError : minimum)

    const link = code("app/(site)/w/[username]/discount/[code]/page.tsx")
    const keep = code("app/(site)/w/[username]/discount/[code]/keep.tsx")
    check("a Shopify discount link on a Storelib theme (/discount/CODE?redirect=) keeps the code with the cart and lands where it says", /found\.kind !== "site"\) notFound\(\)/.test(link) && /const to = sitePath\(asked\) \?\? "\/"/.test(link) && /writeCartExtras\(shopId, \{ code, note: readCartExtras\(shopId\)\.note \}\)/.test(keep) && /window\.location\.replace\(to\)/.test(keep))
    check("  the cart page applies a kept code as it opens, and the drawer's Check out takes it on", /const first = fromLink \|\| kept\.code/.test(code("components/website-builder/cart-page-body.tsx")) && /couponCode: extras\.code \|\| null/.test(code("lib/website-builder/cart-checkout.ts")))

    const c = (x: Partial<CouponRow>): CouponRow => ({ id: "x", code: "X", creator_id: SHOP, discount_type: "fixed", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, ...x })
    const split = checkCouponLines(c({ discount_value: 10 }), [{ productId: "a", creatorId: SHOP, cents: 333 }, { productId: "b", creatorId: SHOP, cents: 333 }, { productId: "c", creatorId: SHOP, cents: 334 }])
    check("a fixed code over three lines splits to the cent and adds up (largest remainder)", split.ok && split.discounts.reduce((n, d) => n + d, 0) === 1000 && split.discounts.every((d) => d >= 333 && d <= 334), split)
    const over = checkCouponLines(c({ discount_value: 50 }), [{ productId: "a", creatorId: SHOP, cents: 1200 }])
    check("  never more than the lines cost", over.ok && over.discountCents === 1200, over)
    const other = checkCouponLines(c({}), [{ productId: "a", creatorId: "someone-else", cents: 1200 }])
    check("  another shop's code takes nothing off this one's lines", other.ok === false && /does not apply/.test(other.error), other)
  }

  /* ── SHIPPING ────────────────────────────────────────────────────── */
  section("SHIPPING: the rates to the address; the cart says what comes at checkout")
  {
    const items = [{ productId: SLEEVE, variantId: M, quantity: 1 }]
    const ro = await shippedQuote(db(), SHOP, { items, country: "RO" }, null)
    const options = ro.ok ? ro.quote.delivery.options.map((o) => `${o.name}:${o.priceCents}`) : []
    check("Romania: the shop's two rates, Standard chosen first", ro.ok && options.join() === "Standard:1500,Express:2500" && ro.quote.delivery.selectedId === "r-ro" && ro.quote.totals.totalCents === 5000, { options, t: ro.ok ? ro.quote.totals : ro })
    const express = await shippedQuote(db(), SHOP, { items, country: "RO", deliveryOptionId: "r-ro2" }, null)
    check("  Express chosen: 25.00 in the total", express.ok && express.quote.totals.shippingCents === 2500 && express.quote.totals.totalCents === 6000, express.ok ? express.quote.totals : express)
    const fr = await shippedQuote(db(), SHOP, { items, country: "FR" }, null)
    check("France, a zone with no rate: no delivery offered, the reason said", fr.ok && fr.quote.delivery.ok === false && !!fr.quote.delivery.error && fr.quote.delivery.options.length === 0, fr.ok ? fr.quote.delivery : fr)
    const noCountry = await shippedQuote(db(), SHOP, { items }, null)
    check("  no country yet: it is asked, nothing guessed", noCountry.ok && noCountry.quote.delivery.needsCountry === true, noCountry.ok ? noCountry.quote.delivery : noCountry)

    const drawer = code("components/website-builder/sections/renderers/HeaderSection.tsx")
    const page = code("components/website-builder/cart-page-body.tsx")
    check("the native cart drawer says delivery and tax come at checkout, for a cart with something to post", /lines\.some\(\(l\) => l\.physical\) \? <p data-cart-shipping-note="" [^>]*>\{w\("taxes_at_checkout"\)\}<\/p>/.test(drawer))
    check("  so does the cart page", /lines\.some\(\(l\) => l\.physical\) \? \(\s*<p data-cart-shipping-note=""[^>]*>\s*\{w\("taxes_at_checkout"\)\}/.test(page))

    const lines = [{ key: "k", productId: SLEEVE, variantId: M, quantity: 1, product: card(SLEEVE, "Black Sleeve", "$35.00", [{ id: M, name: "M" }]) }] as never
    check("an imported theme's cart.taxes_included is the store's own setting (off: false)", cartObject(lines, "EUR").taxes_included === false && cartObject(lines, "EUR", "", {}, null, true).taxes_included === true)
    const exclusive = new Visitor(site())
    await exclusive.ask("POST", "/cart/add.js", { id: M, quantity: 1 })
    const pageEx = String((await exclusive.ask("GET", "/cart", null, false)).body)
    const inclusive = new Visitor(site({ taxesIncluded: true }))
    await inclusive.ask("POST", "/cart/add.js", { id: M, quantity: 1 })
    const pageIn = String((await inclusive.ask("GET", "/cart", null, false)).body)
    check("  Dawn's cart footer: 'Taxes and shipping calculated at checkout', or 'Taxes included' where prices include tax", /class="tax">Taxes and shipping calculated at checkout/.test(pageEx) && /class="tax">Taxes included\. Shipping calculated at checkout\./.test(pageIn), { pageEx: pageEx.slice(-200), pageIn: pageIn.slice(-200) })
    const compat = code("lib/website-builder/compat-site.ts")
    check("  read from Settings › Taxes (a tax mode on, prices include tax), held a minute like the shop's other facts", /select\("tax_mode, prices_include_tax"\)/.test(compat) && /\(row\.tax_mode \?\? "none"\) !== "none" && row\.prices_include_tax === true/.test(compat) && /"compat-taxes-included"/.test(compat))
  }

  /* ── TAX ─────────────────────────────────────────────────────────── */
  section("TAX: EU VAT included or added, by Settings › Taxes, to the cent")
  {
    const items = [{ productId: SLEEVE, variantId: M, quantity: 2 }]
    const ro = { country: "RO", deliveryOptionId: "r-ro" }
    const inc = await shippedQuote(db({ tax: { included: true, onShipping: false } }), SHOP, { items, ...ro }, null)
    const ti = inc.ok ? inc.quote.totals : null
    /* 70.00 includes 19%: 70.00 - 70.00 / 1.19 = 11.1765 -> 11.18. */
    check("prices include 19% VAT: 11.18 of the 70.00 is VAT, the total does not move (85.00)", !!ti && ti.taxIncluded === true && ti.taxCents === 1118 && ti.totalCents === 8500 && /VAT 19%/.test(ti.taxLabel ?? ""), ti)
    const exc = await shippedQuote(db({ tax: { included: false, onShipping: false } }), SHOP, { items, ...ro }, null)
    const te = exc.ok ? exc.quote.totals : null
    check("prices before VAT: 19% of 70.00 = 13.30 added, 98.30", !!te && te.taxIncluded === false && te.taxCents === 1330 && te.totalCents === 9830, te)
    const excShip = await shippedQuote(db({ tax: { included: false, onShipping: true } }), SHOP, { items, ...ro }, null)
    const ts = excShip.ok ? excShip.quote.totals : null
    check("  VAT on delivery too: 13.30 + 2.85 = 16.15, 101.15", !!ts && ts.taxCents === 1615 && ts.totalCents === 10115, ts)
    const incShipCode = await shippedQuote(db({ tax: { included: true, onShipping: true } }), SHOP, { items, couponCode: "SAVE10", ...ro }, null)
    const tc = incShipCode.ok ? incShipCode.quote.totals : null
    /* 63.00 after the code includes 10.06 (63 - 63/1.19 = 10.0588); 15.00 delivery includes 2.39 (2.3950): 12.45 in all; total 78.00. */
    check("  included, on delivery, after a 10% code: VAT on what is paid (63.00 and 15.00): 10.06 + 2.39 = 12.45, total 78.00", !!tc && tc.discountCents === 700 && tc.taxCents === 1245 && tc.totalCents === 7800, tc)
    const elsewhere = await shippedQuote(db({ tax: { included: false, onShipping: true } }), SHOP, { items: [{ productId: SLEEVE, variantId: M, quantity: 1 }], country: "FR" }, null)
    check("  no rate for the country: no VAT invented", elsewhere.ok && elsewhere.quote.totals.taxCents === 0, elsewhere.ok ? elsewhere.quote.totals : elsewhere)

    const tax = (included: boolean, onShipping: boolean): TaxSettings => ({ mode: "manual", pricesIncludeTax: included, taxOnShipping: onShipping, rates: [{ country: "DE", region: null, rateBps: 1900, name: "MwSt" }] })
    const odd = physicalTotals([{ unitCents: 999, quantity: 3, discountCents: 1, taxable: true }], { shippingCents: 499, tax: tax(false, true), country: "DE" })
    /* 2996 * 0.19 = 569.24 -> 569; 499 * 0.19 = 94.81 -> 95. */
    check("odd cents round per piece, and the total is the sum of what is shown", odd.taxCents === 569 + 95 && odd.totalCents === 2996 + 499 + 664, odd)
    const untaxed = physicalTotals([{ unitCents: 1000, quantity: 1, discountCents: 0, taxable: false }, { unitCents: 1000, quantity: 1, discountCents: 0, taxable: true, digital: true }], { shippingCents: 0, tax: tax(false, false), country: "DE" })
    check("  a line not taxable, and a download when the store does not tax them, carry no VAT", untaxed.taxCents === 0 && untaxed.totalCents === 2000, untaxed)
  }

  /* ── LINES ───────────────────────────────────────────────────────── */
  section("LINES: each line's option, the buyer's words for it, and the stock")
  {
    const q = await shippedQuote(db(), SHOP, { items: [{ productId: SLEEVE, variantId: S, quantity: 1 }], country: "RO" }, null)
    check("a line says its option (size S)", q.ok && q.quote.lines[0]?.variantName === "S", q.ok ? q.quote.lines : q)
    const short = await shippedQuote(db({ stockS: 1 }), SHOP, { items: [{ productId: SLEEVE, variantId: S, quantity: 3 }], country: "RO" }, null)
    check("3 of a size with 1 left: a stock issue (Pay waits), the line kept with 'Only 1 left'", short.ok && short.quote.stockIssues.length === 1 && short.quote.stockIssues[0].available === 1 && short.quote.short?.[0]?.available === 1, short.ok ? { s: short.quote.stockIssues, sh: short.quote.short } : short)
    const sold = await shippedQuote(db({ stockS: 0 }), SHOP, { items: [{ productId: SLEEVE, variantId: S, quantity: 1 }], country: "RO" }, null)
    check("  sold out: the same, with nothing left", sold.ok && sold.quote.stockIssues[0]?.available === 0, sold.ok ? sold.quote.stockIssues : sold)
    const checkout = code("app/checkout/site/site-checkout.tsx")
    check("  the page refuses Pay with a reason to act on", /if \(quote\.stockIssues\.length\) return ct\("Some items don't have enough stock\. Lower the quantity or remove them to continue\."\)/.test(checkout) && /is sold out\. Remove it to continue\./.test(checkout))
    check("the buyer's words for a line (a theme's properties[Engraving]) are shown under it, the theme's own hidden", /<LineProperties items=\{items\} line=\{l\} \/>/.test(checkout) && /function LineProperties[\s\S]*?visibleAttributes\(i\.properties\)/.test(checkout))
    const v = new Visitor(site())
    await v.ask("POST", "/cart/add.js", { id: M, quantity: 1, properties: { Engraving: "A + B", _theme: "x" } })
    const out = await v.ask("POST", "/cart", { checkout: "" }, false, "/cart")
    const link = paramsOf(out.headers?.Location)
    check("  and reach the checkout with the line", link.items[0]?.properties?.Engraving === "A + B", link.items)
  }

  /* ── BACK ────────────────────────────────────────────────────────── */
  section("BACK: to exactly where the buyer came from")
  {
    const stock = { asked: 0 }
    const v = new Visitor(site({ stock }))
    const buy = await v.ask("POST", "/cart/add", { id: S, quantity: 1, checkout: "" }, false, "/fr/products/black-sleeve?variant=S")
    check("a theme's Buy it now on a product page: Back is that product page, its language and its option", backOfLink(buy.headers?.Location) === "/fr/products/black-sleeve?variant=S" && paramsOf(buy.headers?.Location).wholeCart === false, buy.headers?.Location)
    await v.ask("POST", "/cart/add.js", { id: M, quantity: 1 }, true, "/collections/all")
    const drawer = await v.ask("POST", "/cart", { checkout: "" }, false, "/collections/all")
    check("  a cart drawer's Check out on a collection page: Back is that page", backOfLink(drawer.headers?.Location) === "/collections/all", drawer.headers?.Location)
    const cartPage = await v.ask("POST", "/cart", { checkout: "" }, false, "/cart")
    check("  the cart page's: the cart", backOfLink(cartPage.headers?.Location) === "/cart")
    const none = await v.ask("POST", "/cart", { checkout: "" }, false, undefined)
    check("  nothing known (another site's page, none): the cart, as before", backOfLink(none.headers?.Location) === "/cart")
    const fromCheckout = await v.ask("GET", "/checkout", null, false, "/checkout?items=x")
    const fromLogin = await v.ask("GET", "/cart/checkout", null, false, "/account/login?return=%2Fcheckout")
    check("  never the checkout itself or the sign in page", backOfLink(fromCheckout.headers?.Location) === "/cart" && backOfLink(fromLogin.headers?.Location) === "/cart", [fromCheckout.headers?.Location, fromLogin.headers?.Location])
    const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("  the route gives a page of this site only: another host's Referer is no page here", /if \(host && u\.host\.toLowerCase\(\) !== host\) return undefined/.test(route) && /refererPath\(req\.headers\.get\("referer"\), host\)/.test(route))

    const q = (s: string) => new URL(`https://shop.test/checkout?${s}`).searchParams
    check("a native Buy now names its full page (cancel): that page, with its language and query, over its bare product path (from)", siteCheckoutBack(q("productId=p&from=%2Fproducts%2Fx&cancel=https%3A%2F%2Fshop.test%2Fde%2Fproducts%2Fx%3Fcolor%3Dred"), "shop.test", null) === "/de/products/x?color=red")
    check("  a page on another host is not this site's: its own path instead", siteCheckoutBack(q("from=%2Fproducts%2Fx&cancel=https%3A%2F%2Fevil.test%2Fphish"), "shop.test", null) === "/products/x")
    check("  a cart's link names its return path", siteCheckoutBack(q("items=x&return=%2Fcart"), "shop.test", "https://shop.test/products/y") === "/cart")
    check("  a plain /checkout link: the page of this site the browser came from (Referer)", siteCheckoutBack(q(""), "shop.test", "https://shop.test/products/y?size=m") === "/products/y?size=m")
    check("  another site's Referer, or the checkout's own pages, are never Back", siteCheckoutBack(q(""), "shop.test", "https://other.test/a") === null && siteCheckoutBack(q(""), "shop.test", "https://shop.test/checkout?items=1") === null && siteCheckoutBack(q(""), "shop.test", "https://shop.test/en/account/login") === null && siteCheckoutBack(q(""), "shop.test", "https://shop.test/password") === null)
    const page = code("app/checkout/site/page.tsx")
    check("the checkout page uses it with the request's Referer, and in the Back link", /const back = siteCheckoutBack\(q, site\.host, h\.get\("referer"\)\)/.test(page) && /const backTo = `\$\{site\.origin\}\$\{back \?\? \(wholeCart \? "\/cart" : "\/"\)\}`/.test(page))

    const drawerSrc = code("lib/website-builder/cart-checkout.ts")
    check("the native cart drawer's Check out comes back to the page the drawer was open on", /back: drawerBackPath\(cartPath\)/.test(drawerSrc) && /returnPath: drawerBackPath\(cartPath\)/.test(drawerSrc) && /sitePath\(`\$\{window\.location\.pathname\}\$\{window\.location\.search\}`\) \?\? cartPath/.test(drawerSrc))
    const product = code("components/website-builder/sections/renderers/ProductSection.tsx")
    /* Changed on purpose (round 13): the line carries the Personalization blocks' properties and the product's own answers together (withAnswers). */
    check("a native Buy now on something that ships goes straight to the website's checkout, Back to this very page", /window\.location\.href = siteBuyHref\(\) \?\? physicalCheckoutHref\(/.test(product) && /siteCheckoutHref\(\{ items: \[\{ productId: product\.id, variantId: variant\?\.id \?\? null, quantity: qty, \.\.\.\(properties \? \{ properties \} : \{\}\) \}\], back: sitePath\(`\$\{window\.location\.pathname\}\$\{window\.location\.search\}`\) \}\)/.test(product))
  }

  /* ── SPEED ───────────────────────────────────────────────────────── */
  section("SPEED: no reads in a row that could be one, the checkout fetched ahead")
  {
    /*
      Physical commerce is read through Next's cache, which a test cannot
      reach, so here it reads as off. The ships path itself was checked with
      it stubbed on (the round's report): the same quote as shippedQuote's,
      to the cent, for a plain cart, a code, a code refused and a short line.
    */
    const items = [{ productId: SLEEVE, variantId: M, quantity: 1 }]
    const fake = db()
    const off = await siteQuote(fake, SHOP, { items, country: "RO" })
    const probe = fake.log.find((e) => e.table === "products" && e.filters.some(([op, c, v]) => op === "eq" && c === "type" && v === "physical"))
    check("one small read asks whether anything in the cart ships (this shop's, published)", !!probe && probe.filters.some(([op, c, v]) => op === "eq" && c === "creator_id" && v === SHOP) && probe.filters.some(([op, c, v]) => op === "eq" && c === "status" && v === "published"), fake.log.map((e) => [e.table, e.filters]).slice(0, 4))
    check("  with physical commerce off nothing is priced ahead (no delivery read), and the answer is the decision's, as before", off.ok === false && !fake.log.some((e) => e.table === "shipping_rates" || e.table === "inventory_locations"), { off, tables: fake.log.map((e) => e.table) })
    const src = code("lib/checkout/site-quote-server.ts")
    check("  the decision still decides: a cart it does not send there lets the early quote go, unheard", /void mayShip\(db, creatorId, body\)\.then\(\(yes\) => \(yes \? void shippedNow\(\) : undefined\), \(\) => undefined\)/.test(src) && /shipped\.catch\(\(\) => undefined\)/.test(src) && /if \(decision\.kind === "ships"\) return shippedNow\(\)/.test(src))
    check("  the short lines' pictures and the offers are read beside the delivery, not after it", /const \[q, profiles, choices, shortImages, suggestions\] = await Promise\.all\(\[/.test(src) && !/suggestions: await/.test(src))
    const digital = await siteQuote(fakeDb({ products: [{ id: MUG, creator_id: SHOP, type: "digital", status: "published", title: "Ebook", price_cents: 900, thumbnail_url: null }], store_settings: [{ creator_id: SHOP, currency: "EUR" }] }), SHOP, { items: [{ productId: MUG }] })
    check("  a cart of downloads is priced as before", digital.ok && digital.quote.kind === "digital" && digital.quote.totals.totalCents === 900, digital)

    const stock = { asked: 0 }
    const v = new Visitor(site({ stock }))
    await v.ask("POST", "/cart/add", { id: S, quantity: 5, checkout: "" }, false, "/products/black-sleeve")
    check("a theme's Buy it now goes on without reading the stock (the checkout counts it and says it on the line)", stock.asked === 0)
    await v.ask("POST", "/cart/add.js", { id: M, quantity: 1 })
    const asked = stock.asked
    check("  an add to cart still reads it, and refuses more than is left", asked === 1 && (await v.ask("POST", "/cart/add.js", { id: M, quantity: 5 })).status === 422)
    const before = stock.asked
    await v.ask("POST", "/cart", { updates: ["9"], checkout: "" }, false, "/cart")
    check("  a cart form's Check out goes on without reading it", stock.asked === before)
    await v.ask("POST", "/cart/update.js", { updates: [9] })
    check("  an update that stays in the cart still holds the line to what is left", stock.asked === before + 1 && v.cart[0]?.q === 2, v.cart)
    const compat = code("lib/website-builder/compat-site.ts")
    check("the stock's product and options are read together", /const \[\{ data: product \}, \{ data: variants \}\] = await Promise\.all\(\[/.test(compat))

    check("only a checkout with its cart in the address is fetched ahead", prefetchableCheckout(siteCheckoutHref({ items: [{ productId: SLEEVE, variantId: M, quantity: 1 }] })) && !prefetchableCheckout("/checkout") && !prefetchableCheckout("/checkout?cart=1") && !prefetchableCheckout("https://evil.test/checkout?items=1") && !prefetchableCheckout("/cart?items=1"))
    const prefetch = code("lib/website-builder/checkout-prefetch.ts")
    check("  as a prefetch, never a prerender, one at a time", /prefetch: \[\{ source: "list", urls: \[href\], eagerness: "immediate" \}\]/.test(prefetch) && !/prerender:/.test(prefetch) && /was\?\.remove\(\)/.test(prefetch))
    const header = code("components/website-builder/sections/renderers/HeaderSection.tsx")
    const page = code("components/website-builder/cart-page-body.tsx")
    const blocks = code("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("  on the drawer's Check out, the cart page's, and Buy now, never in the editor", /\.\.\.\(onEditorNavigate \? \{\} : checkoutIntent\(\(\) => drawerCheckoutHref\(lines, shopId, cartPath\)\)\)/.test(header) && /\.\.\.\(showDetails \? \{\} : checkoutIntent\(siteHref\)\)/.test(page) && /\.\.\.\(buy\.href && !disabled \? checkoutIntent\(buy\.href\) : \{\}\)/.test(blocks))
    const rules = code("lib/website-builder/prefetch-rules.ts")
    check("  the site's general link rules still leave the checkout out", /"\/checkout", "\/checkout\/\*"/.test(rules))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
