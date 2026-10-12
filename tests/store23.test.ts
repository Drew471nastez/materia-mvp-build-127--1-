/**
 * ===========================================================================
 *  ROUND 23, S23: STORE AND CHECKOUT SETTINGS, FOLLOWED TO WHERE THEY ACT
 * ===========================================================================
 * Every setting in Settings › Store details, Checkout, Sales channels and
 * Taxes, run through the real server code it is meant to change (a database
 * in memory, tests/_fake-db.ts and tests/fake-supabase.ts), and the legal
 * content of a receipt drawn for real (the invoice PDF's own text):
 *
 *   setting                       stored in                          proved here by
 *   logo, name, email, phone      store_settings, creators           saveStoreSettings -> storeIdentity, the receipt page's seller
 *   business details (new)        store_settings.legal (part 153)    saved checked, on the receipt, the order page and the PDF
 *   country                       store_settings.default_country     Taxes and new locations start there (source)
 *   require sign in / confirmed   store_settings.checkout            startCheckout refuses, siteGate, every payment route (source)
 *   email news box                store_settings.checkout            only a tick subscribes, with its text, time and source
 *   checkout reminder             store_settings.checkout            the sweep: an hour later, ticked only, once, not after buying
 *   customer information          store_settings.checkout            readAddress and the site checkout's server, off/optional/required
 *   sales channels                sales_channels, listings           new products start where Settings says; lists filter, links stay
 *   taxes                         commerce_settings, tax rates       totals exact, named "VAT 19%" on Stripe, the order and receipts
 *
 *   node scripts/run-push-tests.mjs (or tsx with --conditions=react-server)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { fakeDb } from "./_fake-db"
import { automationDb } from "./fake-supabase"
import { checkoutConfig, mergeCheckout, DEFAULT_CHECKOUT } from "@/lib/store/checkout-config"
import { siteGate, fieldPlan, missingField } from "@/lib/checkout/site-checkout"
import { readAddress } from "@/lib/physical/address"
import { physicalTotals, refundable, type TaxSettings } from "@/lib/physical/totals"
import { basketTax, checkoutTaxFor, digitalTax, includedTaxLabel, taxLabel } from "@/lib/tax/rules"
import { startingChannels, listedOn, withBuiltIns } from "@/lib/store/channels"
import { groupOrders, PAYMENT_LABEL } from "@/lib/orders/order-view"
import { recordCheckoutContact } from "@/lib/contacts/checkout-contact"
import { recordCheckoutStart, sweepAbandoned, ABANDONED_AFTER_MS, type CheckoutStart } from "@/lib/automations/abandoned"
import { supabaseStarts, supabaseStore } from "@/lib/automations/supabase-store"

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder"
process.env.AUTOMATION_LINK_SECRET = process.env.AUTOMATION_LINK_SECRET || "a-test-secret-that-is-long-enough"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const MIN = 60_000

/** tests/_fake-db.ts, with PostgREST's own upsert default: a row that is there is merged (ignoreDuplicates is false unless asked). */
function pgDb(tables: Record<string, Record<string, unknown>[]>, options: Parameters<typeof fakeDb>[1] = {}) {
  const db = fakeDb(tables as never, options)
  const from = db.from
  ;(db as { from: unknown }).from = (table: string) => {
    const b = from(table) as { upsert: (p: unknown, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => unknown }
    const upsert = b.upsert
    b.upsert = (p, o) => upsert(p, { ...(o ?? {}), ignoreDuplicates: o?.ignoreDuplicates ?? false })
    return b
  }
  return db
}

const CREATOR = "c0000000-0000-4000-8000-000000000001"
const USER = "u0000000-0000-4000-8000-000000000001"

async function storeDetails() {
  console.log("\nStore details: saved once, signed on everything a buyer gets\n")
  const { saveStoreSettings, loadStoreSettings } = await import("@/lib/store/settings-server")
  const { storeIdentity } = await import("@/lib/store/identity-server")
  const db = pgDb({
    store_settings: [],
    creators: [{ id: CREATOR, display_name: "Ana Pop", username: "ana", slug: "ana", avatar_url: "https://cdn.example/ana.jpg", support_email: null, user_id: USER }],
    store_theme_installs: [],
    sales_channels: [],
  })
  const saved = await saveStoreSettings(db, CREATOR, { storeName: "  Bread   Studio ", supportEmail: "Hello@Bread.Studio", phone: "+40 721 234 567", phoneCountry: "RO", defaultCountry: "RO" })
  check("name, contact, phone and country save together", saved.ok === true && saved.settings.storeName === "Bread Studio" && saved.settings.phone?.startsWith("+40") === true && saved.settings.defaultCountry === "RO", saved)
  check("  the contact email is the creator's support address, which receipts and reply-to read", db.tables.creators[0].support_email === "hello@bread.studio")
  let id = await storeIdentity(db, CREATOR)
  check("every receipt and order page signs with the store's name, its contact and its phone", id.name === "Bread Studio" && id.email === "hello@bread.studio" && id.phone === (saved.ok ? saved.settings.phone : "x"), id)
  check("  no logo set: the profile photo stands in", id.logoUrl === "https://cdn.example/ana.jpg" && id.logoFrom === "profile")
  await saveStoreSettings(db, CREATOR, { logoUrl: "https://cdn.example/logo.png" })
  id = await storeIdentity(db, CREATOR)
  check("  a logo chosen in Store details goes first", id.logoUrl === "https://cdn.example/logo.png" && id.logoFrom === "store")
  const bad = await saveStoreSettings(db, CREATOR, { logoUrl: "javascript:alert(1)" })
  check("  only a picture from the store's own files is a logo", bad.ok === false)

  console.log("\nBusiness details: the seller a receipt has to name\n")
  const noAddress = await saveStoreSettings(db, CREATOR, { legal: { company: "Bread Studio SRL", country: "RO", taxId: "12345678" } })
  check("a legal name without its address is refused, with the field named", noAddress.ok === false && /street/i.test(noAddress.ok ? "" : noAddress.error), noAddress)
  const badVat = await saveStoreSettings(db, CREATOR, { legal: { company: "Bread Studio SRL", country: "DE", taxId: "12", line1: "Str. Lunga 4", city: "Berlin", postalCode: "10117" } })
  check("a VAT number in the wrong shape for its country is refused", badVat.ok === false && /VAT number/.test(badVat.ok ? "" : badVat.error), badVat)
  const legal = await saveStoreSettings(db, CREATOR, { legal: { company: "Bread Studio SRL", country: "RO", taxId: "ro 12345678", line1: "Strada Lungă 4", city: "Cluj-Napoca", postalCode: "400001", region: "Cluj" } })
  check("a full one saves, the VAT number written the way the tax office writes it", legal.ok === true && legal.settings.legal?.taxId === "RO12345678" && legal.settings.legal?.company === "Bread Studio SRL", legal)
  id = await storeIdentity(db, CREATOR)
  check("  storeIdentity carries it: legal name, envelope lines, VAT number", id.legal?.name === "Bread Studio SRL" && id.legal.lines.join("|") === "Strada Lungă 4|400001 Cluj-Napoca|Cluj|Romania" && id.legal.taxId === "RO12345678" && id.legal.taxIdLabel === "VAT number", id.legal)
  const reloaded = await loadStoreSettings(db, CREATOR)
  check("  and Settings reads it back", reloaded.legal?.city === "Cluj-Napoca")
  const missing = pgDb({ store_settings: [{ creator_id: CREATOR, store_name: "Bread Studio" }], creators: [{ id: CREATOR, display_name: "Ana" }], store_theme_installs: [] }, { failWith: {} })
  check("a database without part 153 still signs with the name (legal is its own read)", (await storeIdentity(missing, CREATOR)).name === "Bread Studio")
  const cleared = await saveStoreSettings(db, CREATOR, { legal: { company: "", line1: "" } })
  check("emptied, it is removed", cleared.ok === true && cleared.settings.legal === null)
  await saveStoreSettings(db, CREATOR, { legal: { company: "Bread Studio SRL", country: "RO", taxId: "RO12345678", line1: "Strada Lungă 4", city: "Cluj-Napoca", postalCode: "400001" } })
  return db
}

async function receipts(db: ReturnType<typeof pgDb>) {
  console.log("\nThe receipt page: store name, logo, the business, the tax by its name\n")
  const { loadReceiptByToken } = await import("@/lib/receipts/load")
  const PRODUCT = "p0000000-0000-4000-8000-000000000001"
  const TOKEN = "rt_" + "a".repeat(40)
  db.tables.products = [{ id: PRODUCT, title: "Sourdough course", slug: "sourdough", thumbnail_url: null, type: "course", creator_id: CREATOR }]
  db.tables.profiles = [{ id: USER, display_name: "Ana Pop", username: "ana", avatar_url: "https://cdn.example/ana.jpg" }]
  db.tables.orders = [{ id: "o0000000-0000-4000-8000-000000000001", receipt_token: TOKEN, product_id: PRODUCT, amount_cents: 5831, tip_cents: 0, tax_cents: 931, tax_included: false, tax_label: "VAT 19%", status: "completed", currency: "usd", created_at: "2026-10-11T10:00:00Z", buyer_email: "maria@example.com", buyer_first_name: "Maria", stripe_payment_intent_id: "pi_1" }]
  db.tables.digital_assets = []
  const r = await loadReceiptByToken(db as never, TOKEN)
  const v = r?.view
  check("the seller is the store: its name and its logo, not the person's", v?.seller.name === "Bread Studio" && v.seller.avatarUrl === "https://cdn.example/logo.png", v?.seller)
  check("  with the business behind it: legal name, address, VAT number", v?.seller.legal?.name === "Bread Studio SRL" && v.seller.legal.taxId === "RO12345678" && v.seller.legal.lines.includes("Romania"), v?.seller.legal)
  check("the tax line is named as charged, and Subtotal + VAT = Total", v?.taxLabel === "VAT 19%" && v.taxCents === 931 && v.subtotalCents === 4900 && v.totalCents === 5831, v && { label: v.taxLabel, tax: v.taxCents, sub: v.subtotalCents, total: v.totalCents })
  check("  number, date and currency are on it", !!v?.number && v.createdAt.startsWith("2026-10-11") && v.currency.toUpperCase() === "USD")
  const view = read("app/receipt/[token]/receipt-view.tsx")
  check("  the page draws the name and the business block", /<Row label=\{receipt\.taxLabel \|\| "Tax"\}/.test(view) && /includedTaxLabel\(receipt\.taxLabel\)/.test(view) && /data-receipt-seller/.test(view) && /receipt\.seller\.legal\.taxIdLabel/.test(view))

  console.log("\nThe invoice PDF: what an accountant files\n")
  const { invoiceForOrder, renderInvoicePdf } = await import("@/lib/checkout/invoice")
  const order = { ...db.tables.orders[0], buyer_last_name: "Ionescu", payment_method: "card", card_brand: "visa", card_last4: "4242", variant_name: null, product: { title: "Sourdough course", creator_id: CREATOR } }
  const inv = await invoiceForOrder(db as never, order as never, { metadata: { tax_cents: "931", tax_rate_bps: "1900", tax_included: "false", tax_label: "VAT 19%", base_price_cents: "4900", discount_cents: "0" }, business: null })
  const trace: string[] = []
  if (inv) await renderInvoicePdf(inv, trace)
  const text = trace.join("\n")
  check("sold by the business, trading as the store, with its address and VAT number", /Sold by/.test(text) && text.includes("Bread Studio SRL") && text.includes("Trading as Bread Studio") && text.includes("400001 Cluj-Napoca") && text.includes("VAT number RO12345678"), trace.slice(0, 40))
  check("its number, date, line, tax by name, total and currency", /Receipt number/.test(text) && /SL-20261011-/.test(text) && text.includes("October 11, 2026") && text.includes("Sourdough course") && text.includes("VAT 19%") && text.includes("$9.31") && text.includes("$58.31 USD"), trace.filter((t) => /VAT|\$|SL-|2026/.test(t)))
  const incl = await invoiceForOrder(db as never, { ...order, amount_cents: 5900, tax_cents: 942 } as never, { metadata: { tax_cents: "942", tax_rate_bps: "1900", tax_included: "true", tax_label: "VAT 19%", base_price_cents: "5900", discount_cents: "0" }, business: null })
  const t2: string[] = []
  if (incl) await renderInvoicePdf(incl, t2)
  check("prices including tax: the total does not move and says Including VAT 19%", t2.includes("Including VAT 19%") && t2.includes("$59.00 USD") && !t2.includes("VAT 19%"), t2.filter((t) => /VAT|\$/.test(t)))
  const plain = pgDb({ store_settings: [{ creator_id: CREATOR, store_name: "Bread Studio" }], creators: db.tables.creators, profiles: db.tables.profiles })
  const inv3 = await invoiceForOrder(plain as never, order as never, { metadata: { tax_cents: "931", tax_rate_bps: "1900", tax_included: "false", base_price_cents: "4900", discount_cents: "0" }, business: null })
  const t3: string[] = []
  if (inv3) await renderInvoicePdf(inv3, t3)
  check("no business details: signed with the store's name, nothing invented, an old order's tax by its rate", t3.includes("Bread Studio") && !t3.some((x) => /Trading as|VAT number/.test(x)) && t3.includes("Tax 19%"), t3.slice(18, 26))

  console.log("\nThe physical order page: the same\n")
  const page = read("app/checkout/physical/order/[token]/page.tsx")
  const osv = read("app/checkout/physical/order/[token]/order-status-view.tsx")
  check("logo, name, email, phone, website and the business, from storeIdentity", /shop=\{\{ name: store\.name, avatar: store\.logoUrl, email: store\.email, phone: store\.phone, websiteUrl: store\.websiteUrl, legal: store\.legal \}\}/.test(page))
  check("  its tax line by name, its currency, its date, and Sold by", /taxLabel: order\.taxLabel/.test(page) && /currency: order\.currency/.test(page) && /order\.totals\.taxLabel \|\| "Tax"/.test(osv) && /\{day\(order\.createdAt\)\}/.test(osv) && /data-order-seller/.test(osv))
  check("  every amount in the currency it was charged in (the platform's RON), never a bare $", /const money = \(c: number\) => moneyIn\(c, order\.totals\.currency\)/.test(osv) && !/`\$\$\{\(c \/ 100\)/.test(osv))
}

async function checkoutGates() {
  console.log("\nRequire sign in, and a confirmed email\n")
  check("a confirmed email turns sign in on with it", checkoutConfig({ requireConfirmedEmail: true }).requireAccount === true && mergeCheckout(DEFAULT_CHECKOUT, { requireConfirmedEmail: true }).requireAccount === true)
  check("off by default: what checkout always did", DEFAULT_CHECKOUT.requireAccount === false && DEFAULT_CHECKOUT.requireConfirmedEmail === false)
  const { startCheckout } = await import("@/lib/physical/checkout-server")
  const base = { shopId: CREATOR, items: [], couponCode: null, email: "a@b.co", address: null, deliveryOptionId: null, clientKey: "k".repeat(12), origin: null, attribution: null, buyerId: null, platformOrigin: "https://storelib.com", backUrl: "https://storelib.com" }
  const nobody = await startCheckout(fakeDb({}) as never, { ...base, config: checkoutConfig({ requireAccount: true }) })
  check("the cart checkout's server refuses a signed out buyer (401) before reading anything", nobody.ok === false && nobody.status === 401 && nobody.field === "account", nobody)
  const unconfirmed = await startCheckout(fakeDb({}) as never, { ...base, buyerId: USER, buyerEmailConfirmed: false, config: checkoutConfig({ requireConfirmedEmail: true }) })
  check("  and a signed in buyer whose email is not confirmed (403)", unconfirmed.ok === false && unconfirmed.status === 403, unconfirmed)
  check("the website's own checkout (custom domains, imported Shopify themes): sign in first, then that account's address", siteGate({ requireAccount: true, requireConfirmedEmail: false }, null).kind === "sign-in" && (() => {
    const g = siteGate({ requireAccount: true, requireConfirmedEmail: false }, { email: "ana@example.com", name: null })
    return g.kind === "open" && g.lockedEmail === "ana@example.com"
  })() && siteGate(DEFAULT_CHECKOUT, null).kind === "open")
  const routes: [string, RegExp[]][] = [
    ["app/api/checkout/stripe-session/route.ts", [/checkoutConfig\.requireAccount && !user\) return NextResponse\.json\(\{ error: "Sign in or create an account to check out\.", code: "account_required" \}, \{ status: 401 \}\)/, /checkoutConfig\.requireConfirmedEmail && !user\?\.email_confirmed_at\)/]],
    ["app/api/checkout/process/route.ts", [/config\.requireAccount && !user\)/, /config\.requireConfirmedEmail && !user\?\.email_confirmed_at\)/]],
    ["app/api/checkout/cart/route.ts", [/if \(\(coupon && totalCents === 0\) \|\| ui\) \{\s*const config = await loadCheckoutConfig\(admin, creatorId\)\s*if \(config\.requireAccount && !user\)/]],
    ["app/api/checkout/quick-free/route.ts", [/checkoutRules\.requireAccount && !user\)/, /checkoutRules\.requireConfirmedEmail && !user\?\.email_confirmed_at\)/]],
    ["app/api/checkout/site/route.ts", [/const gate = siteGate\(config, buyer\)\s*if \(gate\.kind === "sign-in"\) return json/]],
    ["app/api/physical/checkout/route.ts", [/buyerEmailConfirmed: !!user\?\.email_confirmed_at/]],
  ]
  for (const [file, res] of routes) check(`  ${file.replace(/^app\/api\//, "")} refuses on the server, not only on the page`, res.every((re) => re.test(read(file))))
  const shopPage = read("app/(marketing)/p/[slug]/page.tsx")
  check("browsing stays open: the product page never asks for an account", !/requireAccount/.test(shopPage))

  console.log("\nThe email news box: only a tick subscribes, with when and where\n")
  const db = automationDb()
  db.tables.creators.push({ id: CREATOR, slug: "ana", support_email: null, user_id: USER })
  await recordCheckoutContact(db, { creatorId: CREATOR, email: "Tick@Example.com", name: "Tick", basis: "ticked", bought: true, orderId: null, source: { door: "website", site: "bread.studio" } as never })
  await recordCheckoutContact(db, { creatorId: CREATOR, email: "quiet@example.com", name: "Quiet", basis: "none", bought: true, orderId: null })
  const ticked = db.rows("subscribers").find((s) => s.email === "tick@example.com")
  const quiet = db.rows("subscribers").find((s) => s.email === "quiet@example.com")
  check("ticked: a subscriber, the words they agreed to and the moment", ticked?.status === "subscribed" && /Ticked/.test(String(ticked.consent_text)) && !!ticked.consent_timestamp && ticked.source === "checkout", ticked)
  check("not ticked: a customer, never a marketing subscriber, no consent time", quiet?.status === "customer" && !quiet.consent_timestamp, quiet)
  check("every checkout ignores a yes the store's box never showed", [
    ["app/api/checkout/stripe-session/route.ts", /email_opt_in: checkoutConfig\.marketingOptIn && body\.emailOptIn === true \? "true" : "false"/],
    ["app/api/checkout/process/route.ts", /basis: config\.marketingOptIn && body\.emailOptIn === true \? "ticked" : "none"/],
    ["app/api/checkout/site/route.ts", /optedIn: config\.marketingOptIn && body\.emailOptIn === true/],
    ["lib/physical/checkout-server.ts", /if \(config\.marketingOptIn && input\.emailOptIn === true\)/],
  ].every(([f, re]) => (re as RegExp).test(read(f as string))))
  check("  and the box is drawn unticked", /React\.useState\(false\)/.test(read("app/checkout/checkout-client.tsx")) && /const \[emailOptIn, setEmailOptIn\] = React\.useState\(false\)/.test(read("app/checkout/checkout-client.tsx")))

  console.log("\nCustomer information: Don't include, Optional, Required\n")
  const addr = { name: "Ana Pop", line1: "Strada Lungă 4", city: "Cluj", postalCode: "400001", country: "RO" }
  const strict = checkoutConfig({ nameFields: "first_and_last", company: "required", phone: "required", address2: "required" })
  check("required company, phone and line 2 are refused one by one", (() => {
    const a = readAddress(addr, strict)
    const b = readAddress({ ...addr, company: "Bread SRL" }, strict)
    const c = readAddress({ ...addr, company: "Bread SRL", line2: "Ap 3" }, strict)
    const d = readAddress({ ...addr, company: "Bread SRL", line2: "Ap 3", phone: "+40 721 234 567" }, strict)
    return a.ok === false && a.field === "company" && b.ok === false && b.field === "line2" && c.ok === false && c.field === "phone" && d.ok === true
  })())
  check("first and last asks for two names; one field takes one", readAddress({ ...addr, name: "Ana" }, strict).ok === false && readAddress({ ...addr, name: "Ana" }, DEFAULT_CHECKOUT).ok === true)
  check("Don't include drops what was sent anyway", (() => {
    const r = readAddress({ ...addr, company: "X", phone: "+40 721 234 567", line2: "Ap 3" }, checkoutConfig({ company: "off", phone: "off", address2: "off" }))
    return r.ok === true && r.address.phone === null && r.address.line2 === null && !("company" in r.address)
  })())
  const plan = fieldPlan(strict, { ships: true })
  check("the website checkout's page and server share one plan (physical orders only)", plan.company === "required" && fieldPlan(strict, { ships: false }).company === "off" && fieldPlan(strict, { ships: false }).phone === "off" && missingField(plan, { email: "a@b.co", first: "Ana", last: "Pop" }) === "company")
  const site = read("app/api/checkout/site/route.ts")
  check("  and its server answers a missing required field by name", /if \(missing === "company"\) return json/.test(site) && /if \(missing === "phone"\)/.test(site) && /if \(missing === "line2"\)/.test(site))
}

async function reminders() {
  console.log("\nAbandoned checkout reminder: the job\n")
  check("an hour after Pay", ABANDONED_AFTER_MS === 60 * MIN && /"schedule": "0 \* \* \* \*"/.test(read("vercel.json")) && /runAbandonedSweep\(\)/.test(read("app/api/cron/process-scheduled-emails/route.ts")))
  const world = () => {
    const db = automationDb()
    const productId = randomUUID()
    db.tables.creators.push({ id: CREATOR, slug: "ana", headline: null, support_email: "hello@bread.studio", user_id: USER })
    db.tables.profiles.push({ id: USER, display_name: "Ana", username: "ana", email: "ana@example.com", avatar_url: null })
    db.tables.products.push({ id: productId, creator_id: CREATOR, slug: "course", title: "Course", type: "digital", status: "published" })
    return { db, productId }
  }
  const sweep = async (db: ReturnType<typeof automationDb>, on = true, advance = 61 * MIN) => {
    const reminded: CheckoutStart[] = []
    db.clock += advance
    const res = await sweepAbandoned({ store: supabaseStore(db), starts: supabaseStarts(db), now: db.clock, recoveryOn: async () => on, remind: async (s) => (reminded.push(s), true) })
    return { res, reminded }
  }
  {
    const { db, productId } = world()
    await recordCheckoutStart(db, { creatorId: CREATOR, productId, email: "tick@example.com", paymentIntentId: "pi_tick", optedIn: true })
    const early = await sweep(db, true, 30 * MIN)
    check("not before the hour", early.res.looked === 0 && early.reminded.length === 0)
    const late = await sweep(db, true, 31 * MIN)
    check("a ticked buyer, an hour later: one reminder", late.reminded.length === 1 && late.res.outcomes.entered === 1, late.res)
    check("  sent once: the next run finds nothing", (await sweep(db)).reminded.length === 0)
  }
  {
    const { db, productId } = world()
    db.tables.subscribers.push({ id: randomUUID(), creator_id: CREATOR, email: "listed@example.com", name: "L", status: "subscribed", is_active: true, unsubscribe_token: "tok_x", source_detail: null })
    await recordCheckoutStart(db, { creatorId: CREATOR, productId, email: "listed@example.com", paymentIntentId: "pi_listed", optedIn: false })
    const { res, reminded } = await sweep(db)
    check("not ticked: no reminder, even for somebody already on the list", reminded.length === 0 && res.outcomes.no_consent === 1, res.outcomes)
  }
  {
    const { db, productId } = world()
    await recordCheckoutStart(db, { creatorId: CREATOR, productId, email: "paid@example.com", paymentIntentId: "pi_paid", optedIn: true })
    db.tables.orders.push({ id: randomUUID(), product_id: productId, creator_id: CREATOR, buyer_email: "paid@example.com", status: "completed", created_at: new Date(db.clock + 5 * MIN).toISOString() })
    const { res, reminded } = await sweep(db)
    check("bought since: nothing", reminded.length === 0 && res.outcomes.bought === 1, res.outcomes)
  }
  {
    const { db, productId } = world()
    await recordCheckoutStart(db, { creatorId: CREATOR, productId, email: "off@example.com", paymentIntentId: "pi_off", optedIn: true })
    const { reminded } = await sweep(db, false)
    check("the setting turned off: nobody", reminded.length === 0)
  }
  check("every checkout writes its start only while the setting is on", [
    ["app/api/checkout/stripe-session/route.ts", /if \(checkoutConfig\.abandonedRecovery\) await recordCheckoutStart/],
    ["lib/physical/checkout-server.ts", /if \(config\.abandonedRecovery\) \{/],
    ["app/api/checkout/site/route.ts", /if \(contact\.config\.abandonedRecovery\) \{/],
  ].every(([f, re]) => (re as RegExp).test(read(f as string))))
}

async function channels() {
  console.log("\nSales channels\n")
  const all = withBuiltIns([{ id: "c-stall", kind: "custom", name: "Market stall", description: null, enabled: true }])
  check("the three built-ins and a store's own", all.map((c) => c.kind).join() === "storefront,creator_page,marketplace,custom")
  check("List new products on: one channel, else all of them", [...startingChannels(all, "c-stall")].join() === "c-stall" && startingChannels(all, null).size === 4 && startingChannels(all, "gone").size === 4)
  check("a product off a channel leaves that list only", listedOn([{ id: "a" }, { id: "b" }], new Set(["b"])).map((p) => p.id).join() === "a")
  const surfaces: [string, RegExp][] = [
    ["lib/website-builder/shop-products.ts", /listedOn\(rows, await offChannel\(db, creatorId, "storefront"\)\)/],
    ["lib/website-builder/storefront-collections-server.ts", /offChannel\(db, creatorId, "storefront"\)/],
    ["lib/website-builder/storefront-data-server.ts", /offChannel\(db, creatorId, "storefront"\)/],
    ["app/api/website-builder/search/route.ts", /offChannel\(admin, creatorId, "storefront"\)/],
    ["lib/website-builder/site-seo-data.ts", /offChannel\(admin, creatorId, "storefront"\)/],
    ["app/(marketing)/u/[username]/page.tsx", /offChannel\(createAdminClient\(\), creator\.id, "creator_page"\)/],
    ["lib/onepage/live-products.ts", /offChannel\(db, creatorId, "creator_page"\)/],
    ["app/(marketing)/explore/page.tsx", /offChannelAmong\(createAdminClient\(\), products\.map\(\(p\) => p\.id\), "marketplace"\)/],
    ["app/(marketing)/explore/[category]/page.tsx", /"marketplace"\)/],
    ["app/api/v2/search/route.ts", /"marketplace"\)/],
  ]
  for (const [f, re] of surfaces) check(`  filtered on ${f}`, re.test(read(f)))
  check("its link keeps working: the product page and checkout never ask the channels", !/offChannel/.test(read("app/(marketing)/p/[slug]/page.tsx")) && !/offChannel/.test(read("app/api/checkout/stripe-session/route.ts")) && !/offChannel/.test(read("lib/checkout/pricing.ts")))
  const card = read("app/app/products/new/sales-channels-card.tsx")
  check("a new product saved before its card loaded still starts where Settings says", /if \(!loaded && !productId\) \{/.test(card) && /startingChannels\(d\.channels, d\.defaultKey\)/.test(card))
  const { setDefaultChannel, loadChannels, setProductChannels, productOff } = await import("@/lib/store/channels-server")
  const P = "a0000000-0000-4000-8000-0000000000aa"
  const db = pgDb({ sales_channels: [], store_settings: [], product_channel_listings: [], products: [{ id: P, creator_id: CREATOR }] })
  const set = await setDefaultChannel(db, CREATOR, "storefront")
  check("Settings › New products saves the channel (its row made the first time)", set.ok === true && set.setup.defaultKey !== null && db.tables.sales_channels.some((c) => c.kind === "storefront"), set)
  const setup = await loadChannels(db, CREATOR)
  const starting = startingChannels(setup.channels, setup.defaultKey)
  const off = setup.channels.map((c) => c.id ?? c.kind).filter((k) => !starting.has(k))
  const put = await setProductChannels(db, CREATOR, P, off)
  check("  a new product is then off the Creator page and Explore, on the Online store", put.ok === true && (await productOff(db, CREATOR, P)).length === 2 && db.tables.sales_channels.filter((c) => c.kind === "creator_page" || c.kind === "marketplace").length === 2, put)
}

async function taxes() {
  console.log("\nTaxes: exact, and named as set\n")
  const RO = { id: "r-ro", country: "RO", region: null, name: "VAT", rateBps: 1900 }
  const CA = { id: "r-ca", country: "US", region: "CA", name: "Sales tax", rateBps: 725 }
  const US = { id: "r-us", country: "US", region: null, name: "Sales tax", rateBps: 500 }
  const tax = (o: Partial<TaxSettings> = {}): TaxSettings => ({ mode: "manual", pricesIncludeTax: false, taxOnShipping: false, digital: false, rates: [RO, US, CA], overrides: [], ...o })
  const mug = { productId: "mug", unitCents: 2000, quantity: 2, discountCents: 0, taxable: true }
  const ebook = { productId: "ebook", unitCents: 1000, quantity: 1, discountCents: 0, taxable: true, digital: true }
  let t = physicalTotals([mug], { shippingCents: 500, tax: tax(), country: "RO" })
  check("added on top: 19% of 40.00 is 7.60, the total 52.60, named VAT 19%", t.taxCents === 760 && t.totalCents === 5260 && t.taxLabel === "VAT 19%", t)
  t = physicalTotals([mug], { shippingCents: 500, tax: tax({ taxOnShipping: true }), country: "RO" })
  check("tax on shipping: 19% of 45.00", t.taxCents === 855 && t.totalCents === 5355, t)
  t = physicalTotals([mug], { shippingCents: 0, tax: tax({ pricesIncludeTax: true }), country: "RO" })
  check("prices including tax: the total does not move, the tax inside is 6.39", t.totalCents === 4000 && t.taxCents === 639 && t.taxIncluded && includedTaxLabel(t.taxLabel) === "Including VAT 19%", t)
  t = physicalTotals([mug], { shippingCents: 0, tax: tax(), country: "US", region: "California" })
  check("a state's own rate before its country's (California typed out)", t.taxRateBps === 725 && t.taxLabel === "Sales tax 7.25%", t)
  check("  the country's rate for another state", physicalTotals([mug], { shippingCents: 0, tax: tax(), country: "US", region: "NY" }).taxRateBps === 500)
  check("a buyer outside every region pays none", physicalTotals([mug], { shippingCents: 0, tax: tax(), country: "DE" }).taxCents === 0)
  check("tax off charges nothing", physicalTotals([mug], { shippingCents: 0, tax: tax({ mode: "none" }), country: "RO" }).taxCents === 0)
  check("digital lines beside shipped ones: taxed only with Charge tax on digital products", physicalTotals([mug, ebook], { shippingCents: 0, tax: tax(), country: "RO" }).taxCents === 760 && physicalTotals([mug, ebook], { shippingCents: 0, tax: tax({ digital: true }), country: "RO" }).taxCents === 950)
  t = physicalTotals([mug, ebook], { shippingCents: 0, tax: tax({ digital: true, overrides: [{ taxRateId: "r-ro", productId: "ebook", rateBps: 500 }] }), country: "RO" })
  check("a product's own rate: 760 + 50, and the line says VAT without one rate", t.taxCents === 810 && t.taxLabel === "VAT", t)

  const setup = { enabled: true, digital: true, included: false, regions: [RO, US, CA], overrides: [] }
  const d = digitalTax(setup, { taxableCents: 4900, tipCents: 500, productId: "course", country: "RO" })
  check("a digital sale by the buyer's country (EU VAT): tax on the price, never on the tip", d.taxCents === 931 && d.totalCents === 4900 + 500 + 931 && d.label === "VAT 19%", d)
  check("  the checkout page and the server see the region's name", checkoutTaxFor(setup, "course", "RO")?.regions.find((r) => r.country === "RO")?.name === "VAT")
  check("  digital off: nothing", digitalTax({ ...setup, digital: false }, { taxableCents: 4900, tipCents: 0, productId: "c", country: "RO" }).taxCents === 0)
  const b = basketTax(setup, [{ productId: "a", taxableCents: 1000 }, { productId: "b", taxableCents: 2000 }], "RO")
  check("a basket of downloads: each line's share, and one label", b.lineTaxCents.join() === "190,380" && b.label === "VAT 19%", b)
  check("taxLabel: name and rate, plain Tax without a name", taxLabel("GST", 1000) === "GST 10%" && taxLabel(null, 0) === "Tax" && taxLabel("Sales tax", 825) === "Sales tax 8.25%" && includedTaxLabel("Tax 5%") === "Including tax 5%")

  console.log("\nThe same tax reaches Stripe, the order and every receipt\n")
  const phys = read("lib/physical/checkout-server.ts")
  check("the cart checkout's Stripe line is the tax by its name, the order keeps the name", /product_data: \{ name: totals\.taxLabel \|\| "Tax" \}/.test(phys) && /tax_label: totals\.taxLabel[ ,}]/.test(phys))
  check("the single product checkout and the website checkout send it with the payment", /tax_label: tax && tax\.taxCents > 0 \? tax\.label : ""/.test(read("app/api/checkout/stripe-session/route.ts")) && /tax_label: tax\.label \}/.test(read("app/api/checkout/site/route.ts")))
  check("  and the order keeps it (part 153), on its own write", /update\(\{ tax_label: String\(m\.tax_label\)\.slice\(0, 80\) \}\)/.test(read("lib/checkout/fulfil-payment.ts")) && /update\(\{ tax_label: String\(ctx\.tax\.label\)\.slice\(0, 80\) \}\)/.test(read("lib/checkout/fulfil-cart-item.ts")))
  check("every checkout page draws the name", /t\.taxLabel \|\| "Tax"/.test(read("app/checkout/site/site-checkout.tsx")) && /includedTaxLabel\(t\.taxLabel\)/.test(read("app/checkout/physical/physical-checkout.tsx")) && /label: taxNow\?\.label/.test(read("app/checkout/checkout-client.tsx")))
  const sql = read("supabase/sql/run-now/153_store_business_and_tax_names.sql")
  check("SQL part 153: one statement a line, safe again, pgrst last", sql.trim().split("\n").every((l) => l.startsWith("/*") || l.endsWith(";")) && /ADD COLUMN IF NOT EXISTS legal jsonb/.test(sql) && /ADD COLUMN IF NOT EXISTS tax_label text/.test(sql) && sql.trim().endsWith("notify pgrst, 'reload schema';") && /p153_store_business_and_tax_names/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log("\nRefunds and badges\n")
  check("a refund gives back up to what was paid, tax inside it", refundable(5355, 0) === 5355 && refundable(5355, 5000) === 355 && refundable(5355, 9999) === 0)
  const [sale, part, back] = groupOrders([
    { id: "o1", product_id: "p1", amount_cents: 5831, tip_cents: 0, status: "completed", created_at: "2026-10-01T10:00:00Z", tax_cents: 931, tax_included: false, tax_label: "VAT 19%" },
    { id: "o2", product_id: "p1", amount_cents: 5831, tip_cents: 0, status: "refunded", refund_amount_cents: 1000, created_at: "2026-10-02T10:00:00Z" },
    { id: "o3", product_id: "p1", amount_cents: 5831, tip_cents: 0, status: "refunded", refund_amount_cents: 5831, created_at: "2026-10-03T10:00:00Z" },
  ] as never).sort((a, b2) => a.createdAt.localeCompare(b2.createdAt))
  check("badges: Paid, Partially refunded, Refunded", sale.payment === "paid" && part.payment === "partially_refunded" && back.payment === "refunded" && PAYMENT_LABEL.partially_refunded.length > 0, [sale.payment, part.payment, back.payment])
  check("  the creator's order names the tax as charged, Subtotal + VAT = Total", sale.taxLabel === "VAT 19%" && sale.subtotalCents + sale.taxCents === sale.totalCents)
}

async function main() {
  const db = await storeDetails()
  await receipts(db)
  await checkoutGates()
  await reminders()
  await channels()
  await taxes()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
