/**
 * ROUND 51: COMMERCE, BY WHAT THE OWNER ASKED
 *
 *   checkout     the shop's name beside its logo, fetched on the server; the
 *                creator picks logo and name, logo or name in Settings ›
 *                Checkout (store_settings.checkout.brandShows, no SQL: the
 *                column is the checkout's own JSON, part 109)
 *   fulfilment   "From my own warehouse" is the seller shipping (it was the
 *                3PL method); "A mix of these" moves no product; an own
 *                place that takes no orders is never "send it to them"
 *                (the journey is tests/fulfilment-modes-r51.test.ts)
 *   packing slip the store's details under its name (website, email,
 *                phone) on the page and the PDF, the pile of slips with the
 *                return address too; on a computer the phone's notice
 *                (printProgress); scripts/check-commerce-r51.mjs measures it
 *   receipts     the buyer's order page says what it was paid with
 *   pixels       run in a sandbox with the visitor's cookie: Clarity is told
 *                the banner's answers (consentv2), Klaviyo and Omnisend load
 *                only on a marketing yes, Tag Manager alone gets consent
 *                mode's defaults before its container
 *
 * Run: node scripts/run-push-tests.mjs
 */
import * as vm from "node:vm"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readCode } from "./_source"
import { formatMessage } from "@/lib/i18n/text"
import { DEFAULT_CHECKOUT, checkoutConfig, mergeCheckout } from "@/lib/store/checkout-config"
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { ShopBar } from "@/app/checkout/parts/shop-bar"
import { MODEL_METHOD, storeFulfilment } from "@/lib/physical/fulfilment-default"
import { followNewDefault } from "@/lib/physical/fulfilment-default-server"
import { packingSlipHtml, slipContact, slipLines, type SlipOrder } from "@/lib/physical/packing-slip"
import { renderPackingSlipPdf } from "@/lib/physical/packing-slip-pdf"
import { paidWithOf } from "@/lib/physical/orders-server"
import { paidWithText } from "@/app/checkout/physical/order/[token]/order-status-view"
import { trackingTags } from "@/lib/store/tracking"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const tt = (source: string, vars?: Record<string, string | number>) => formatMessage(source, vars ?? {}, "en")

/** A Supabase query builder over fixed rows: eq filters, maybeSingle, and every call kept. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const asked: string[] = []
  const from = (table: string) => {
    const filters: [string, unknown][] = []
    let cols = "*"
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
    const pick = (r: Record<string, unknown>) => (cols === "*" ? r : Object.fromEntries(cols.split(",").map((c) => c.trim().split(" ")[0]).filter((c) => c in r).map((c) => [c, r[c]])))
    const q: any = {
      select: (c: string) => ((cols = c), asked.push(`${table}:${c}`), q),
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      limit: () => q,
      order: () => q,
      maybeSingle: async () => ({ data: rows()[0] ? pick(rows()[0]) : null, error: null }),
      then: (ok: (v: unknown) => unknown) => ok({ data: rows().map(pick), error: null }),
    }
    return q
  }
  return { from, asked, auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@example.com" } } }) } } }
}

async function main() {
  section("1. Checkout: the shop's name beside its logo, as the creator chooses")
  check("a store that never chose shows the logo and the name", DEFAULT_CHECKOUT.brandShows === "both" && checkoutConfig(null).brandShows === "both" && checkoutConfig({ brandShows: "nonsense" }).brandShows === "both")
  check("  logo or name alone are kept, and merged as Settings saves them", checkoutConfig({ brandShows: "logo" }).brandShows === "logo" && mergeCheckout({ phone: "required" }, { brandShows: "name" }).brandShows === "name" && mergeCheckout({ brandShows: "name" }, { phone: "off" }).brandShows === "name")
  const CREATOR = "c-1"
  const db = fakeDb({
    store_settings: [{ creator_id: CREATOR, store_name: "Mona Modes", logo_url: "https://cdn.mona.test/logo.png", checkout: { brandShows: "logo", phone: "optional" } }],
    creators: [{ id: CREATOR, display_name: "Mona", username: "mona", avatar_url: null, user_id: "u-1" }],
    profiles: [{ id: "u-1", display_name: "Mona M", username: "mona", avatar_url: null }],
    store_theme_installs: [],
  })
  const brand = await checkoutBrand(db, CREATOR)
  check("the server reads the store's name, its logo and the choice (never the link)", brand.name === "Mona Modes" && brand.kind === "logo" && brand.imageUrl === "https://cdn.mona.test/logo.png" && brand.shows === "logo", brand)
  const none = await checkoutBrand(fakeDb({ store_settings: [{ creator_id: CREATOR, store_name: "Mona Modes", logo_url: null }], creators: [{ id: CREATOR, display_name: "Mona", username: "mona", avatar_url: null, user_id: null }], store_theme_installs: [] }), CREATOR)
  check("  no choice saved (or no part 109): both", none.shows === "both", none)
  const bar = (b: Parameters<typeof ShopBar>[0]["brand"]) => renderToStaticMarkup(React.createElement(ShopBar, { brand: b, backTo: "https://mona.example/cart", shopUrl: "https://mona.example/" }))
  const both = bar({ name: "Mona Modes", imageUrl: "https://cdn.mona.test/logo.png", kind: "logo", shows: "both" })
  check("Logo and name: the logo, then the name", /data-shows="both"/.test(both) && /<img[^>]+src="https:\/\/cdn\.mona\.test\/logo\.png"/.test(both) && /data-shop-name="">Mona Modes</.test(both) && both.indexOf("<img") < both.indexOf("data-shop-name"), both)
  check("  the logo's alt is empty beside the name, so a screen reader says it once", /<img[^>]+alt=""/.test(both))
  const logo = bar({ name: "Mona Modes", imageUrl: "https://cdn.mona.test/logo.png", kind: "logo", shows: "logo" })
  check("Logo: the logo alone, named by its alt", /<img[^>]+alt="Mona Modes"/.test(logo) && !/data-shop-name/.test(logo))
  const name = bar({ name: "Mona Modes", imageUrl: "https://cdn.mona.test/logo.png", kind: "logo", shows: "name" })
  check("Name: the name alone", !/<img/.test(name) && /data-shop-name="">Mona Modes</.test(name))
  const noLogo = bar({ name: "Mona Modes", imageUrl: null, kind: null, shows: "logo" })
  check("Logo with no logo yet: the photo (initials) and the name, never an empty bar", /data-shop-name="">Mona Modes</.test(noLogo))
  const old = bar({ name: "Mona Modes", imageUrl: "https://cdn.mona.test/logo.png", kind: "logo" })
  check("  a brand with no choice on it: both", /data-shows="both"/.test(old) && /data-shop-name/.test(old))
  const panel = readCode("components/app/settings/checkout-panel.tsx")
  check("Settings › Checkout › Top of checkout saves it as the other checkout settings are", /data-brand-shows-setting/.test(panel) && /change\(\{ brandShows: v \}\)/.test(panel) && /options=\{BRAND_OPTIONS\}/.test(panel))
  check("every website checkout draws its bar from the server's brand (one ShopBar)", ["app/checkout/site/site-checkout.tsx", "app/checkout/physical/physical-checkout.tsx", "app/checkout/physical/page.tsx"].every((f) => /<ShopBar brand=\{/.test(readCode(f))))

  section("2. Fulfilment: own warehouse, a mix")
  const locs = [
    { id: "home", kind: "home" as const, active: true },
    { id: "wh", kind: "warehouse" as const, active: true },
    { id: "3pl", kind: "third_party_logistics" as const, active: true },
  ]
  const own = storeFulfilment("warehouse", "wh", locs)
  check("From my own warehouse: the seller ships, never the fulfillment center beside it", MODEL_METHOD.warehouse === "self" && own.method === "self" && own.locationId === null, own)
  check("  a fulfillment center is still a partner", storeFulfilment("third_party_logistics", null, locs).method === "warehouse" && storeFulfilment("third_party_logistics", null, locs).locationId === "3pl")
  let writes = 0
  const counting = { from: () => ({ update: () => ((writes++), { eq: () => ({ eq: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [{ id: "p" }] }) }), eq: () => ({ select: async () => ({ data: [{ id: "p" }] }) }) }) }) }) }) }) }
  const moved = await followNewDefault(counting as never, CREATOR, { method: "print_on_demand", locationId: "pfy" }, { method: "self", locationId: null, mix: true })
  check("A mix of these moves no product: a Printify product stays with Printify", moved === 0 && writes === 0, { moved, writes })
  const settingsRoute = readCode("app/api/physical/settings/route.ts")
  const defaults = readCode("lib/physical/fulfilment-default-server.ts")
  check("  the settings save reads the store's answer with the mix on it", /followNewDefault\(c\.db, c\.creatorId, before, await storeFulfilmentFor/.test(settingsRoute) && /mix: settings\.fulfillmentModel === "hybrid"/.test(defaults))
  const jobs = readCode("lib/physical/jobs-server.ts")
  check("an own place that takes no orders is the seller's to pack, not a partner to send to", /select\("id, name, kind, forwarding, email, integration_id"\)/.test(jobs) && /OWN_PLACE_KINDS\.has\(loc\.kind\)\) continue/.test(jobs))

  section("3. Packing slip: the store's details, every time")
  check("the store's website without https, its email and its phone", JSON.stringify(slipContact({ websiteUrl: "https://www.mona.example/", email: "hello@mona.example", phone: "+49 30 1234567" })) === JSON.stringify(["mona.example", "hello@mona.example", "+49 30 1234567"]))
  check("  a Storelib address keeps its path; nothing missing is printed", JSON.stringify(slipContact({ websiteUrl: "https://storelib.com/mona", email: null, phone: "" })) === JSON.stringify(["storelib.com/mona"]) && slipContact(null).length === 0)
  const order: SlipOrder = {
    id: "b0000000-0000-4000-8000-000000000001",
    createdAt: "2026-11-01T09:00:00Z",
    paidAt: "2026-11-01T09:00:00Z",
    address: { name: "Bea Buyer", line1: "Gartenweg 2", line2: "Flat 3", city: "Berlin", postalCode: "10117", country: "DE", phone: "+49 30 7654321" },
    delivery: { name: "Standard" },
    deliveryMethod: "ship",
    pickup: null,
    buyerName: "Bea Buyer",
    buyerNote: "Ring twice",
    cartAttributes: { "Gift message": "Happy birthday" },
    lines: [
      { orderId: "o1", title: "Desk Lamp", variantName: "Brass", sku: "LAMP-B", imageUrl: null, quantity: 2, fulfilled: 0, requiresShipping: true, locationId: null, properties: { Engraving: "B.B." } },
      { orderId: "o2", title: "Ebook", variantName: null, sku: null, imageUrl: null, quantity: 1, fulfilled: 0, requiresShipping: false, locationId: null },
    ],
    shipments: [],
  }
  const store = { name: "Mona Modes", logoUrl: "https://cdn.mona.test/logo.png", returnAddress: ["Mona Modes", "Hauptstr. 1", "10115 Berlin", "Germany"], contact: ["mona.example", "hello@mona.example", "+49 30 1234567"] }
  const html = packingSlipHtml(order, slipLines(order), store, { tt, lang: "en", back: "/app/orders" })
  const has = (s: string) => html.includes(s)
  check("the order, its date, the store's name, logo and details", has("Order #B0000000") && has("November 1, 2026") && has("<b>Mona Modes</b>") && has('src="https://cdn.mona.test/logo.png"') && ["mona.example", "hello@mona.example", "+49 30 1234567"].every((c) => has(`<span class="contact" data-slip-contact>${c}</span>`)))
  check("  where it ships, with the second line and the buyer's phone, and how", ["Bea Buyer", "Gartenweg 2", "Flat 3", "Berlin, 10117", "Germany", "+49 30 7654321", "Standard"].every(has))
  check("  each item that ships, its option, SKU, the buyer's words and how many; not the download", has("Desk Lamp") && has("Brass · SKU LAMP-B") && has("Engraving: B.B.") && /<td class="qty">2<\/td>/.test(html) && !has("Ebook"))
  check("  the buyer's note, the cart's gift message and where a return goes", has("Ring twice") && has("Happy birthday") && has("Hauptstr. 1"))
  const trace: string[] = []
  await renderPackingSlipPdf(order, slipLines(order), { ...store, logoUrl: null }, { tt, lang: "en" }, trace)
  check("the PDF the phone shares carries the same store details", ["Mona Modes", "mona.example", "hello@mona.example", "+49 30 1234567", "Gartenweg 2", "Brass · SKU LAMP-B", "Engraving: B.B.", "Ring twice", "Gift message: Happy birthday", "Hauptstr. 1"].every((s) => trace.some((t) => t.includes(s))), trace)
  const one = readCode("app/api/physical/orders/[id]/packing-slip/route.ts")
  const pile = readCode("app/api/physical/orders/packing-slips/route.ts")
  check("one slip reads the store's whole identity (its email and website, not the logo alone)", /storeIdentity\(c\.db, c\.creatorId\)\.catch/.test(one) && (one.match(/contact: slipContact\(store\)/g) ?? []).length === 2)
  check("  the pile of slips has the same details and the return address", /storeIdentity\(c\.db, c\.creatorId\)\.catch/.test(pile) && /returnAddressOf\(c\.db, c\.creatorId\)/.test(pile) && /returnAddress, contact: slipContact\(store\)/.test(pile))
  const panelCode = readCode("components/physical/order-panel.tsx")
  const bulk = readCode("app/app/orders/bulk-actions.tsx")
  const share = readCode("components/physical/slip-share.tsx")
  check("on a computer the icon shows the phone's notice: ring while made, check once in, gone after the print", /const progress = printProgress\(\)/.test(panelCode) && /progress\.made\(\)/.test(panelCode) && /progress\.done\(\)/.test(panelCode) && /export function printProgress/.test(share))
  check("  and the list's Packing slips too", /printProgress\(slipsWords\(\)\)/.test(bulk) && /progress\.made\(\)/.test(bulk))
  const css = readCode("app/globals.css")
  check("  its check grows by scale, not a transition on transform", /transition: scale 260ms/.test(css) && !/\.slip-disc \{[^}]*transition: transform/.test(css))

  section("4. Receipts: what it was paid with")
  check("Visa ending 4242, PayPal, Link, as the download receipt says it", paidWithText({ method: "card", brand: "visa", last4: "4242" }, tt) === "Visa ending 4242" && paidWithText({ method: "paypal", brand: null, last4: null }, tt) === "PayPal" && paidWithText({ method: "card", brand: "amex", last4: "0005" }, tt) === "American Express ending 0005" && paidWithText(null, tt) === null)
  check("  read from the order's lines, a bad last four dropped", JSON.stringify(paidWithOf([{ payment_method: null }, { payment_method: "card", card_brand: "mastercard", card_last4: "5555" }])) === JSON.stringify({ method: "card", brand: "mastercard", last4: "5555" }) && paidWithOf([{ payment_method: "card", card_last4: "12ab" }])?.last4 === null && paidWithOf([]) === null)
  const page = readCode("app/checkout/physical/order/[token]/page.tsx")
  const view = readCode("app/checkout/physical/order/[token]/order-status-view.tsx")
  check("  the buyer's order page shows it under the totals for a card order", /paidWith: order\.payment === "card" && order\.totalCents > 0/.test(page) && /ct\("Paid with \{method\}"/.test(view) && /data-order-paid-with/.test(view))

  section("5. Pixels: each service's own snippet, told the visitor's answer")
  const run = (stored: Record<string, string>, cookie: string | null, opts: { asks?: boolean; zone?: string } = {}) => {
    const inserted: string[] = []
    const listeners: Record<string, (() => void)[]> = {}
    const script = () => ({ async: false, src: "", type: "" })
    const document: any = {
      cookie: cookie ?? "",
      readyState: "complete",
      createElement: script,
      getElementsByTagName: () => [{ parentNode: { insertBefore: (s: { src: string }) => inserted.push(s.src) } }],
    }
    /* The page's global is its window, as in a browser: window.x and a bare x are one. */
    const window: any = vm.createContext({ document, location: { href: "https://mona.example/" }, addEventListener: (t: string, f: () => void) => (listeners[t] ??= []).push(f), Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: opts.zone ?? "Europe/Berlin" }) }) }, setTimeout })
    vm.runInContext("window = this; self = this; top = this;", window)
    const ctx = window
    for (const t of trackingTags(stored, { creatorId: "c-1", asks: opts.asks ?? true })) if (t.inline) vm.runInContext(t.inline, ctx)
    const g = ctx as any
    return { inserted, g, fire: () => (listeners["storelib:consent-changed"] ?? []).forEach((f) => f()), setCookie: (c: string) => (document.cookie = c) }
  }
  const NO = "storelib_consent=2.p1.a0.m0"
  const YES = "storelib_consent=2.p1.a1.m1"
  const clarityCalls = (g: any) => (g.clarity?.q ?? []).map((a: unknown[]) => Array.from(a))
  const c1 = run({ clarity: "k3x9q2w7ab" }, NO)
  check("Clarity: its own tag, then consentv2 with the banner's No for analytics and ads", c1.inserted.includes("https://www.clarity.ms/tag/k3x9q2w7ab") && JSON.stringify(clarityCalls(c1.g).at(-1)) === JSON.stringify(["consentv2", { ad_Storage: "denied", analytics_Storage: "denied" }]), clarityCalls(c1.g))
  c1.setCookie(YES)
  c1.fire()
  check("  a Yes on the banner is passed on at once", JSON.stringify(clarityCalls(c1.g).at(-1)) === JSON.stringify(["consentv2", { ad_Storage: "granted", analytics_Storage: "granted" }]), clarityCalls(c1.g))
  const c2 = run({ clarity: "k3x9q2w7ab" }, null, { zone: "America/New_York" })
  check("  no answer yet outside Europe: granted, as Google's consent mode does", JSON.stringify(clarityCalls(c2.g).at(-1)?.[1]) === JSON.stringify({ ad_Storage: "granted", analytics_Storage: "granted" }))
  const kNo = run({ klaviyo: "AbC123", omnisend: "5f8a1b2c3d4e5f6a7b8c9d0e" }, NO)
  check("Klaviyo and Omnisend: nothing loads on a marketing No", kNo.inserted.length === 0 && !kNo.g.omnisend, kNo.inserted)
  kNo.setCookie(YES)
  kNo.fire()
  check("  a Yes loads Klaviyo's onsite script and Omnisend's launcher, once, with the page view", kNo.inserted.join() === "https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=AbC123,https://omnisnippet1.com/inshop/launcher-v2.js" && JSON.stringify(kNo.g.omnisend) === JSON.stringify([["brandID", "5f8a1b2c3d4e5f6a7b8c9d0e"], ["track", "$pageViewed"]]), { inserted: kNo.inserted, om: kNo.g.omnisend })
  kNo.fire()
  check("  a second change loads nothing twice", kNo.inserted.length === 2)
  const kEu = run({ klaviyo: "AbC123" }, null, { asks: true, zone: "Europe/Paris" })
  const kUs = run({ klaviyo: "AbC123" }, null, { asks: true, zone: "America/Chicago" })
  check("  no answer yet: Europe waits for the banner, elsewhere it loads, as the ad pixels do", kEu.inserted.length === 0 && kUs.inserted.length === 1)
  const gtm = run({ gtm: "GTM-ABC1234" }, NO)
  const dl = (gtm.g.dataLayer ?? []).map((e: any) => (e && typeof e === "object" && "length" in e ? Array.from(e) : e))
  const firstConsent = dl.findIndex((e: any) => Array.isArray(e) && e[0] === "consent" && e[1] === "default")
  const start = dl.findIndex((e: any) => e && e.event === "gtm.js")
  const update = dl.find((e: any) => Array.isArray(e) && e[0] === "consent" && e[1] === "update")
  check("Tag Manager alone: consent mode's defaults before the container, and the visitor's No as an update", firstConsent >= 0 && start > firstConsent && update?.[2]?.analytics_storage === "denied" && update?.[2]?.ad_storage === "denied" && gtm.inserted.some((s) => s.startsWith("https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234")), dl)
  const gaGtm = run({ ga4: "G-ABCD1234", gtm: "GTM-ABC1234" }, NO)
  const defaultsOnce = (gaGtm.g.dataLayer ?? []).filter((e: any) => e && "length" in e && e[0] === "consent" && e[1] === "default").length
  check("  with Analytics too, the defaults are set once, by the gtag block", defaultsOnce === 2 /* the regions' denied, then everyone's granted: lib/store/ga.ts gaConsentJs */, defaultsOnce)
  const meta = run({ meta_pixel: "1234567890123456" }, NO)
  const fbq = (meta.g.fbq?.queue ?? []).map((a: unknown[]) => Array.from(a))
  check("Meta (unchanged): consent revoked on a No before init, then PageView", JSON.stringify(fbq.slice(0, 3)) === JSON.stringify([["consent", "revoke"], ["init", "1234567890123456"], ["track", "PageView"]]), fbq)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
