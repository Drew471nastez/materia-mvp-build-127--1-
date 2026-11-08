/**
 * ===========================================================================
 *  ROUND 27 (B27): THE BUYER'S PHYSICAL ORDER PAGES
 * ===========================================================================
 *   1. Cancel order really cancels: every paid line refunded in full, the
 *      stock released, the buyer's Order cancelled and refund emails, the
 *      seller told; once only; asked of the shop instead when that is safer
 *      (sent to a partner, a download inside, a refund refused), refused
 *      once the shop started on it or turned it off.
 *   2. The page follows the order by itself: a fingerprint that moves with
 *      what the page shows, and only with that.
 *   3. Romanian and the other buyer languages: the delivery line is two
 *      lines and reads right ("3–5 zile", never "3 la 5 2 zile"), the step is
 *      "În pregătire", every new sentence has its Romanian.
 *   4. Email the shop opens a letter naming the order; Visit store is the
 *      live website (never the creator page); the shop's logo; the carrier's
 *      mark; the return window from the seller's own setting; several
 *      products, options and quantities read right; the return stepper.
 *
 * No network: every fetch fails the suite.
 *
 *   npx tsx tests/buyer27.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { fakeDb } from "./_fake-db"
import { CANCEL_REQUESTED, FORWARDED, buyerCancelState, cancelMode } from "../lib/physical/buyer-cancel"
import { buyerCancelOrder, type LineToRefund } from "../lib/physical/buyer-cancel-server"
import { orderStamp } from "../lib/physical/order-stamp-server"
import { mailAddress, sellerMailto } from "../lib/physical/seller-mailto"
import { checkoutSentences, checkoutT, checkoutWordsIn, emailSentences } from "../lib/markets/checkout-words"
import ro from "../lib/checkout-text/dict/ro"
import { CORE_DICTIONARIES } from "../lib/checkout-text/dict/core"
import { CheckoutWords, estimateText } from "@/components/checkout/parts/words"
import { OrderStatusView } from "../app/(storelib)/checkout/physical/order/[token]/order-status-view"
import { CarrierLogo } from "../components/physical/carrier-logo"
import { ThanksView } from "../app/(storelib)/checkout/site/thanks/[token]/thanks-view"
import { returnWindow } from "../lib/physical/status"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

globalThis.fetch = (async (input: RequestInfo | URL) => {
  failed++
  console.log(`  FAIL  a real host was called: ${String(input instanceof Request ? input.url : input)}`)
  throw new Error("no network in tests")
}) as typeof fetch

const CREATOR = "11111111-1111-4111-8111-111111111111"
const CO = "27272727-2727-4727-8727-272727272727"
const TOKEN = "tok_b27abcdefghijklmnopqr"
const LINE_A = "a2727272-2727-4727-8727-272727272701"
const LINE_B = "a2727272-2727-4727-8727-272727272702"

/* A paid card order of two products: two of a T-shirt in S, one mug in Blue; each line carries its share of the delivery. */
function world(over: { checkout?: Record<string, unknown>; lines?: Record<string, unknown>[]; events?: Record<string, unknown>[]; fulfillments?: Record<string, unknown>[] } = {}) {
  const checkout = { id: CO, creator_id: CREATOR, receipt_token: TOKEN, status: "paid", provider: "stripe", total_cents: 13000, items_subtotal_cents: 12000, discount_cents: 0, shipping_cents: 1000, shipping_discount_cents: 0, tax_cents: 0, refunded_cents: 0, currency: "ron", fulfillment_status: "unfulfilled", return_status: "none", buyer_name: "Andrei Radu", buyer_email: "andrei@example.com", shipping_rate: { name: "Standard", min_days: 3, max_days: 5 }, delivery_method: "ship", lines: [], cancelled_at: null, processing_at: null, paid_at: "2026-10-17T09:00:00Z", created_at: "2026-10-17T08:59:00Z", ...over.checkout }
  const lines = over.lines ?? [
    { id: LINE_A, checkout_id: CO, product_id: "p-shirt", variant_id: "v-s", status: "completed", provider: "stripe", stripe_payment_intent_id: "pi_b27", amount_cents: 8667, quantity: 2, unit_price_cents: 4000, requires_shipping: true, currency: "ron", product_snapshot: { title: "T-shirt", variant_name: "S", unit_cents: 4000, discount_cents: 0, type: "physical" }, created_at: "2026-10-17T09:00:00Z" },
    { id: LINE_B, checkout_id: CO, product_id: "p-mug", variant_id: "v-blue", status: "completed", provider: "stripe", stripe_payment_intent_id: "pi_b27", amount_cents: 4333, quantity: 1, unit_price_cents: 4000, requires_shipping: true, currency: "ron", product_snapshot: { title: "Mug", variant_name: "Blue", unit_cents: 4000, discount_cents: 0, type: "physical" }, created_at: "2026-10-17T09:00:01Z" },
  ]
  const db = fakeDb(
    { commerce_checkouts: [checkout], orders: lines, fulfillments: over.fulfillments ?? [], fulfillment_items: [], fulfillment_events: [], commerce_returns: [], commerce_return_items: [], commerce_order_events: over.events ?? [], commerce_jobs: [], commerce_settings: [], store_settings: [] },
    { unique: { commerce_order_events: [["idempotency_key"]], commerce_jobs: [["idempotency_key"]] } },
  )
  /* What the database is asked to run: physical_cancel_unfulfilled is what puts the stock back (part 78). */
  const rpcs: { fn: string; args: Record<string, unknown> }[] = []
  ;(db as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> }).rpc = async (fn, args) => {
    rpcs.push({ fn, args })
    return { data: 1, error: null }
  }
  return { db, rpcs }
}

/* Stripe, as the refund sync leaves the line: refunded, with the running total (lib/stripe/refund-sync markRow). */
function refunder(db: ReturnType<typeof fakeDb>, opts: { refuse?: string[]; pending?: boolean } = {}) {
  const calls: LineToRefund[] = []
  const refund = async (_db: unknown, l: LineToRefund) => {
    calls.push(l)
    if (opts.refuse?.includes(l.orderId)) return { ok: false as const, error: "refund failed" }
    if (!opts.pending) {
      const row = db.tables.orders.find((r) => r.id === l.orderId)!
      row.status = "refunded"
      row.refund_amount_cents = l.alreadyRefundedCents + (l.amountCents - l.alreadyRefundedCents)
    }
    return { ok: true as const, refundId: `re_${l.orderId.slice(-2)}`, pending: !!opts.pending }
  }
  return { calls, refund }
}

async function main() {
  /* ── 1. Cancel order ─────────────────────────────────────────────────── */
  section("1. The buyer's Cancel order cancels and refunds, once")
  const fresh = { lines: [{ requiresShipping: true }, { requiresShipping: true }], events: [] as { kind: string }[] }
  check("an order that only ships, not sent anywhere: cancelled on the spot", cancelMode(fresh) === "now")
  check("  sent to a print partner or an app already: the shop is asked", cancelMode({ ...fresh, events: [{ kind: FORWARDED }] }) === "ask")
  check("  a download inside, which the buyer already has: the shop is asked", cancelMode({ ...fresh, lines: [{ requiresShipping: true }, { requiresShipping: false }] }) === "ask")

  {
    const { db, rpcs } = world()
    const stripe = refunder(db)
    const r = await buyerCancelOrder(db as never, TOKEN, { reason: "Ordered the wrong size", enabled: true }, { refund: stripe.refund })
    const co = db.tables.commerce_checkouts[0]
    check("cancelled, says so", r.ok && r.done === "cancelled" && !!co.cancelled_at, r)
    check("  each paid line refunded in full: 2 × T-shirt S and the mug, delivery share included", stripe.calls.length === 2 && stripe.calls.find((c) => c.orderId === LINE_A)?.amountCents === 8667 && stripe.calls.find((c) => c.orderId === LINE_B)?.amountCents === 4333 && r.ok && r.refundedCents === 13000, stripe.calls)
    check("  the stock goes back on sale (physical_cancel_unfulfilled on this order)", rpcs.some((c) => c.fn === "physical_cancel_unfulfilled" && c.args.p_checkout === CO), rpcs)
    check("  the order reads cancelled, not to be sent, with the buyer's reason", co.fulfillment_status === "cancelled" && co.cancel_reason === "Ordered the wrong size")
    const ev = db.tables.commerce_order_events
    check("  the timeline says the buyer did it", ev.some((e) => e.kind === "order.cancelled" && e.actor === "buyer" && /The buyer cancelled this order: Ordered the wrong size/.test(String(e.message))), ev)
    const jobs = db.tables.commerce_jobs
    check("  the buyer gets Order cancelled", jobs.some((j) => j.idempotency_key === `email:cancelled:${CO}`))
    check("  and the refund email, for the whole amount", jobs.some((j) => j.idempotency_key === `email:refund:${CO}:13000` && (j.payload as { amountCents?: number }).amountCents === 13000), jobs.map((j) => j.idempotency_key))
    check("  the seller is emailed that the buyer cancelled", jobs.some((j) => (j.payload as { event?: string }).event === "order.cancelled"), jobs.map((j) => j.payload))
    const again = await buyerCancelOrder(db as never, TOKEN, { reason: null, enabled: true }, { refund: stripe.refund })
    check("a second press: already cancelled, no second refund, no second email", again.ok && again.done === "cancelled" && stripe.calls.length === 2 && db.tables.commerce_jobs.filter((j) => String(j.idempotency_key).startsWith("email:cancelled:")).length === 1)
  }
  {
    const { db } = world()
    const stripe = refunder(db, { pending: true })
    const r = await buyerCancelOrder(db as never, TOKEN, { reason: null, enabled: true }, { refund: stripe.refund })
    check("a refund Stripe is still confirming: cancelled, said pending, the refund email left to its webhook", r.ok && r.done === "cancelled" && r.pending && !db.tables.commerce_jobs.some((j) => String(j.idempotency_key).startsWith("email:refund:")))
    check("  with the shop's default reason when the buyer gave none", db.tables.commerce_checkouts[0].cancel_reason === "Cancelled by the buyer")
  }
  {
    const { db, rpcs } = world()
    const stripe = refunder(db, { refuse: [LINE_A] })
    const r = await buyerCancelOrder(db as never, TOKEN, { reason: "Changed my mind", enabled: true }, { refund: stripe.refund })
    check("the first refund refused: nothing cancelled, nothing released, the shop asked instead", r.ok && r.done === "requested" && !db.tables.commerce_checkouts[0].cancelled_at && rpcs.length === 0 && db.tables.commerce_order_events.some((e) => e.kind === CANCEL_REQUESTED && e.actor === "buyer"), r)
  }
  {
    const { db, rpcs } = world()
    const stripe = refunder(db, { refuse: [LINE_B] })
    const r = await buyerCancelOrder(db as never, TOKEN, { reason: null, enabled: true }, { refund: stripe.refund })
    check("a later refund refused: cancelled, the seller told to refund the rest", r.ok && r.done === "cancelled" && !!db.tables.commerce_checkouts[0].cancelled_at && rpcs.length === 1 && db.tables.commerce_order_events.some((e) => e.kind === "payment.refund_incomplete"))
  }
  {
    const { db } = world({ events: [{ id: 1, checkout_id: CO, creator_id: CREATOR, kind: FORWARDED, message: "Order sent to your webhook", actor: "system", created_at: "2026-10-17T09:01:00Z" }] })
    const stripe = refunder(db)
    const r = await buyerCancelOrder(db as never, TOKEN, { reason: null, enabled: true }, { refund: stripe.refund })
    check("sent to a partner already: asked of the shop, nothing refunded", r.ok && r.done === "requested" && stripe.calls.length === 0 && !db.tables.commerce_checkouts[0].cancelled_at)
  }
  {
    const { db } = world({ checkout: { processing_at: "2026-10-17T10:00:00Z" } })
    const stripe = refunder(db)
    const r = await buyerCancelOrder(db as never, TOKEN, { reason: null, enabled: true }, { refund: stripe.refund })
    check("the shop started on it: refused, nothing written or refunded", !r.ok && stripe.calls.length === 0 && db.tables.commerce_order_events.length === 0)
  }
  {
    const { db } = world({ fulfillments: [{ id: "f1", checkout_id: CO, status: "shipped", carrier: "DPD", tracking_number: "1234", shipped_at: "2026-10-17T11:00:00Z", created_at: "2026-10-17T11:00:00Z" }] })
    const stripe = refunder(db)
    const r = await buyerCancelOrder(db as never, TOKEN, { reason: null, enabled: true }, { refund: stripe.refund })
    check("a parcel out: refused", !r.ok && stripe.calls.length === 0 && !db.tables.commerce_checkouts[0].cancelled_at)
  }
  {
    const { db } = world()
    const stripe = refunder(db)
    const r = await buyerCancelOrder(db as never, TOKEN, { reason: null, enabled: false }, { refund: stripe.refund })
    check("the shop turned it off: refused", !r.ok && stripe.calls.length === 0)
    const other = await buyerCancelOrder(db as never, "tok_somebodyelsesorder00", { reason: null, enabled: true }, { refund: stripe.refund })
    check("another token finds nothing", !other.ok && "status" in other && other.status === 404)
  }
  {
    const cod = (id: string, amount: number) => ({ id, checkout_id: CO, product_id: "p", status: "completed", provider: "cod", payment_method: "cash_on_delivery", amount_cents: amount, quantity: 1, requires_shipping: true, product_snapshot: { title: "Mug", unit_cents: amount, type: "physical" }, created_at: "2026-10-17T09:00:00Z" })
    const { db, rpcs } = world({ checkout: { provider: "cod", total_cents: 5000 }, lines: [cod(LINE_A, 5000)] })
    const stripe = refunder(db)
    const r = await buyerCancelOrder(db as never, TOKEN, { reason: null, enabled: true }, { refund: stripe.refund })
    check("cash on delivery, not paid yet: cancelled with nothing to refund, the sale voided", r.ok && r.done === "cancelled" && stripe.calls.length === 0 && rpcs.length === 1 && db.tables.orders[0].status === "failed")
  }
  {
    const route = read("app/api/physical/order-status/[token]/cancel/route.ts")
    check("the route cancels through it, answers what happened, and is still limited per address and per order", /buyerCancelOrder\(db, token, \{ reason: body\.reason, enabled: config\.buyerCancel \}\)/.test(route) && /done: result\.done/.test(route) && /addressSubject\(request\), `order:\$\{token\}`/.test(route))
    const server = read("lib/physical/buyer-cancel-server.ts")
    check("money is given back the way the Orders page does: the seller's transfer reversed, one refund per line whatever retries", /reverse_transfer: true/.test(server) && /idempotencyKey: `storelib-buyer-cancel:\$\{l\.orderId\}:\$\{l\.alreadyRefundedCents\}:\$\{amount\}`/.test(server) && /syncChargeRefund\(/.test(server) && !/refundAirwallexOrder\(/.test(server))
    const panel = read("components/app/settings/checkout-panel.tsx")
    check("Settings › Checkout says what the switch now does", /tt\("Let buyers cancel"\)/.test(panel) && /cancelled and refunded in full at once/.test(panel))
  }

  /* ── 2. Live status ──────────────────────────────────────────────────── */
  section("2. The page follows the order")
  {
    const { db } = world()
    const a = await orderStamp(db as never, TOKEN)
    const b = await orderStamp(db as never, TOKEN)
    check("the same order, the same fingerprint", !!a && a === b)
    db.tables.commerce_checkouts[0].processing_at = "2026-10-17T12:00:00Z"
    const c = await orderStamp(db as never, TOKEN)
    check("marked in progress: it moves", c !== b)
    db.tables.fulfillments.push({ id: "f1", checkout_id: CO, status: "shipped", carrier: "FAN Courier", tracking_number: "2100", shipped_at: "2026-10-17T13:00:00Z", tracking_checked_at: "2026-10-17T13:00:00Z" })
    const d = await orderStamp(db as never, TOKEN)
    check("a parcel sent: it moves", d !== c)
    db.tables.fulfillments[0].tracking_checked_at = "2026-10-17T14:00:00Z"
    check("the carrier only looked again: it does not", (await orderStamp(db as never, TOKEN)) === d)
    db.tables.fulfillment_events.push({ id: 9, fulfillment_id: "f1", status: "in_transit", external_id: "trk:1", occurred_at: "2026-10-17T15:00:00Z" })
    const e = await orderStamp(db as never, TOKEN)
    check("a new carrier scan: it moves", e !== d)
    db.tables.orders[0].refund_amount_cents = 100
    check("a refund: it moves", (await orderStamp(db as never, TOKEN)) !== e)
    check("another token: none", (await orderStamp(db as never, "tok_nothinghere0000000000")) === null)
    const live = read("app/(storelib)/checkout/physical/order/[token]/live-status.tsx")
    check("the page asks while in view, backs off up to two minutes, at once on return, and redraws from the server", /document\.visibilityState !== "visible"/.test(live) && /MAX_MS = 120_000/.test(live) && /visibilitychange/.test(live) && /router\.refresh\(\)/.test(live))
    check("  and is on the page", /<LiveStatus token=\{token\}/.test(read("app/(storelib)/checkout/physical/order/[token]/order-status-view.tsx")))
  }

  /* ── 3. Words ────────────────────────────────────────────────────────── */
  section("3. Romanian and the other buyer languages")
  {
    const t = checkoutT("ro", checkoutWordsIn("ro", null))
    const line = t("Usually arrives {estimate} after it ships.", { estimate: estimateText(t, "3 to 5 business days") })
    check("the estimate reads Romanian: Ajunge de obicei în 3–5 zile lucrătoare de la expediere.", line === "Ajunge de obicei în 3–5 zile lucrătoare de la expediere.", line)
    check("  one day, two days", t("Usually arrives {estimate} after it ships.", { estimate: estimateText(t, "2 business days") }) === "Ajunge de obicei în 2 zile lucrătoare de la expediere.")
    check("the second step: În pregătire (being prepared), not the pay button's Se procesează", t("Being prepared") === "În pregătire")
    check("the return window from the seller's days, Romanian plurals", t("Within {count, plural, one {# day} other {# days}} of delivery", { count: 30 }) === "În 30 de zile de la livrare" && t("Within {count, plural, one {# day} other {# days}} of delivery", { count: 14 }) === "În 14 zile de la livrare" && t("Within {count, plural, one {# day} other {# days}} of delivery", { count: 1 }) === "În 1 zi de la livrare")
    const all = [...checkoutSentences(), ...emailSentences()]
    check("every sentence the pages say has its Romanian", all.every((s) => !!ro[s]), all.filter((s) => !ro[s]).slice(0, 6))
    const words = Object.values(ro).join("\n")
    check("a return's Other is Alt motiv (another reason), never the tip's Altă sumă (another amount)", t("Other reason") === "Alt motiv" && /ct\("Other reason"\)/.test(read("app/(storelib)/checkout/physical/order/[token]/order-status-view.tsx")) && !/\["other", checkoutMsg\("Other"\)\]/.test(read("app/(storelib)/checkout/physical/order/[token]/order-status-view.tsx")))
    check("never elaborare, never glued", !/elaborare/i.test(words) && !/Deobicei/.test(words))
    const ourLangs = Object.keys(CORE_DICTIONARIES)
    const order = ["Being prepared", "Usually arrives {estimate} after it ships.", "Cancel order", "Return items", "Track package", "Your order is on the way", "Question about order {number}"]
    const gaps = ourLangs.flatMap((l) => order.filter((s) => !CORE_DICTIONARIES[l][s]).map((s) => `${l}: ${s}`))
    check(`the order page's own words are curated in ${ourLangs.join(", ")} too`, gaps.length === 0, gaps.slice(0, 8))
    const view = read("app/(storelib)/checkout/physical/order/[token]/order-status-view.tsx")
    check("the method on its own line, the estimate on the next (never one run of text)", /<p className="font-medium text-\[#1a1a2e\]">\{ct\(order\.delivery\.name\)\}<\/p>\s*\{estimate \? <p/.test(view) && !/\{method\}, usually \{estimate\}/.test(view))
  }

  /* ── 4. The page ─────────────────────────────────────────────────────── */
  section("4. Email the shop, Visit store, logo, carrier, returns, several products")
  {
    const href = sellerMailto("shop@andrewrullz.ro", { subject: "Întrebare despre comanda #27272727", lines: ["Bună, AndrewRullz,", "", "Îți scriu despre comanda mea #27272727."] })!
    check("a mailto to the shop with the subject and the letter, encoded for every mail app", href.startsWith("mailto:shop@andrewrullz.ro?subject=") && decodeURIComponent(href.split("subject=")[1].split("&")[0]) === "Întrebare despre comanda #27272727" && decodeURIComponent(href.split("body=")[1]).split("\r\n").length === 3)
    check("  never for something that is not an address", sellerMailto("not an address", { subject: "x", lines: [] }) === null && mailAddress("a@b.co?cc=x@y.z") === null)

    const page = read("app/(storelib)/checkout/physical/order/[token]/page.tsx")
    check("Visit store is the live website the order came from (lib/physical/store-link.ts), never the creator page", /orderStoreUrl\(\{ creator_id: order\.creatorId, origin \}, \{ db \}\)/.test(page) && /websiteUrl: storeUrl \|\| null/.test(page) && !/websiteUrl: store\.websiteUrl/.test(page))
    check("the shop's logo as its website draws it (checkoutBrand), its photo otherwise", /checkoutBrand\(db, order\.creatorId\)/.test(page) && /avatarKind: brand\.imageUrl \? brand\.kind/.test(page))

    const base = {
      token: TOKEN,
      justPaid: false,
      shop: { name: "AndrewRullz", avatar: "https://cdn.example.com/logo.png", avatarKind: "logo" as const, email: "shop@andrewrullz.ro", phone: null, websiteUrl: "https://andrewrullz.storelib.com", legal: null },
      orderUrl: `https://andrewrullz.storelib.com/checkout/physical/order/${TOKEN}`,
      help: null,
      reasons: [],
      canReturn: true,
      cancel: "closed" as const,
      order: {
        id: CO, status: "paid", fulfillmentStatus: "partially_fulfilled", cancelled: false, createdAt: "2026-10-17T09:00:00Z", email: "andrei@example.com", name: "Andrei Radu",
        address: { name: "Andrei Radu", line1: "Str. Exemplu 6", city: "București", postalCode: "010101", country: "RO" },
        delivery: { name: "Standard", priceCents: 1000, minDays: 3, maxDays: 5, kind: "ship" as const },
        coupon: "TOAMNA", pickup: null, processing: true,
        totals: { subtotal: 12000, discount: 1000, shipping: 1000, tax: 0, taxIncluded: false, total: 12000, refunded: 0, currency: "RON" },
        lines: [
          { orderId: LINE_A, title: "T-shirt", variantName: "S", imageUrl: null, quantity: 2, unitCents: 4000, cents: 8000, type: "physical", receiptToken: null, returnable: 1, shipped: 1, returned: 0 },
          { orderId: LINE_B, title: "T-shirt", variantName: "M", imageUrl: null, quantity: 1, unitCents: 4000, cents: 3000, type: "physical", receiptToken: null, returnable: 0, shipped: 0, returned: 0 },
        ],
        shipments: [{ id: "f1", status: "in_transit", carrier: "FAN Courier", trackingNumber: "2100", trackingUrl: "https://www.fancourier.ro/awb-tracking/?tracking=2100", shippedAt: "2026-10-17T13:00:00Z", deliveredAt: null, items: [{ orderId: LINE_A, quantity: 1 }] }],
        returns: [],
        returnPolicy: { days: 30, endsAt: "2026-12-05T00:00:00Z", open: true, started: false, assumed: true },
      },
    }
    const html = renderToStaticMarkup(React.createElement(CheckoutWords, { lang: "ro", words: checkoutWordsIn("ro", null), children: React.createElement(OrderStatusView, base) })).replace(/\u00a0/g, " ")
    check("the header draws the shop's logo and Visit store goes to its website", /data-shop-logo="" src="https:\/\/cdn\.example\.com\/logo\.png"|src="https:\/\/cdn\.example\.com\/logo\.png"[^>]*data-shop-logo/.test(html) && /href="https:\/\/andrewrullz\.storelib\.com"[^>]*data-visit-store/.test(html) && /Vizitează magazinul/.test(html))
    check("the carrier's mark on its parcel", /data-carrier-logo="fan-courier"/.test(html))
    check("Email the shop opens the letter: subject, the order, the link back", (() => {
      const m = html.match(/href="(mailto:[^"]+)"[^>]*data-email-shop/)
      if (!m) return false
      const h = m[1].replace(/&amp;/g, "&")
      const body = decodeURIComponent(h.split("body=")[1])
      return decodeURIComponent(h.split("subject=")[1].split("&")[0]) === "Întrebare despre comanda #27272727" && /Bună, AndrewRullz,/.test(body) && /Îți scriu despre comanda mea #27272727, plasată pe 17 oct\. 2026\./.test(body) && body.includes(`Pagina comenzii: https://andrewrullz.storelib.com/checkout/physical/order/${TOKEN}`) && /Mulțumesc,\r\nAndrei Radu$/.test(body)
    })(), html.match(/href="(mailto:[^"]+)"/)?.[1])
    check("not delivered yet: the seller's 30 days from delivery, no date guessed from shipping", /Poți returna produse în 30 de zile de la livrare\./.test(html) && !/5 dec\. 2026/.test(html))
    check("each line its own option and quantity; two of one at what each; a discount struck through", /T-shirt<\/p><p[^>]*>S · Cant\. 2/.test(html) && /T-shirt<\/p><p[^>]*>M · Cant\. 1/.test(html) && /2 × 40,00 lei/.test(html) && /line-through">40,00 lei/.test(html))
    check("a line partly sent says how much, and the parcel says what is in it", /1 din 2 expediate/.test(html) && /data-shipment-items=""/.test(html) && /1 ×<\/span> T-shirt/.test(html))
    check("the discount names its code; money is written the Romanian way", /Reducere \(TOAMNA\)/.test(html) && /120,00 lei/.test(html))
    check("the step reads În pregătire", /În pregătire/.test(html) && !/Se procesează/.test(html))

    const delivered = { ...base, order: { ...base.order, fulfillmentStatus: "fulfilled", processing: true, shipments: [{ ...base.order.shipments[0], status: "delivered", deliveredAt: "2026-10-20T10:00:00Z" }], returnPolicy: { days: 14, endsAt: "2026-11-03T10:00:00Z", open: true, started: true, assumed: false } } }
    const html2 = renderToStaticMarkup(React.createElement(CheckoutWords, { lang: "ro", words: checkoutWordsIn("ro", null), children: React.createElement(OrderStatusView, delivered) })).replace(/\u00a0/g, " ")
    check("delivered: the last day, counted from delivery with the seller's 14 days", /Până pe 3 nov\. 2026/.test(html2) && !/data-return-assumed/.test(html2))
    const now = Date.parse("2026-10-21T00:00:00Z")
    const w = returnWindow({ lines: [{ requiresShipping: true }], shipments: [{ status: "delivered", trackingNumber: "2100", shippedAt: "2026-10-17T13:00:00Z", deliveredAt: "2026-10-20T10:00:00Z" }], paidAt: null }, 14, now)
    check("  the same window the return route enforces (lib/physical/status returnWindow)", w.open && w.started && w.endsAt === "2026-11-03T10:00:00.000Z", w)

    const known = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: "fan courier", size: 40 }))
    const unknown = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: "Curier Local SRL", size: 40 }))
    check("a carrier as the seller wrote it is still its mark; one we don't know gets a plain parcel mark, never a remote image", /data-carrier-logo="fan-courier"/.test(known) && /url\(\/carriers\/fan-courier\.webp\)/.test(known) /* pin moved on purpose: the tile is a background over its letters (carrier picker), still the local file */ && /data-carrier-logo="other"/.test(unknown) && !/<img/.test(unknown) && !/src="https?:/.test(known + unknown))

    const view = read("app/(storelib)/checkout/physical/order/[token]/order-status-view.tsx")
    check("the return stepper: minus, the number, plus, never past what can go back, big enough to press", /function Stepper/.test(view) && /disabled=\{value >= max\}/.test(view) && /disabled=\{value <= 0\}/.test(view) && /h-10 w-10/.test(view) && !/<select value=\{qty/.test(view))
    check("cancel: right away with its amount, or asked of the shop; the page redraws itself cancelled", /It's cancelled right away and \{amount\} goes back/.test(view) && /data\.done === "cancelled"/.test(view))
    check("no em dashes and none of the banned words in what changed", [view, read("lib/physical/buyer-cancel-server.ts"), read("app/(storelib)/checkout/physical/order/[token]/live-status.tsx"), read("lib/physical/seller-mailto.ts"), read("components/physical/carrier-logo.tsx")].every((s) => !/—/.test(s) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(s)))
  }

  /* ── 5. Thanks page ──────────────────────────────────────────────────── */
  section("5. The thank you page after a physical order")
  {
    const page = read("app/(storelib)/checkout/site/thanks/[token]/page.tsx")
    const thanks = read("app/(storelib)/checkout/site/thanks/[token]/thanks-view.tsx")
    check("the page reads, ThanksView draws", /<ThanksView order=\{order\} shopUrl=\{onePage \?\? shopUrl\} lang=\{language\.lang\}/.test(page) && /number: orderNumber\(String\(co\.id\)\)/.test(page) && /coupon: typeof co\.coupon_code === "string"/.test(page))
    check("order number and day, subtotal, discount with its code, the full address, the method and its estimate apart", /ct\("Order \{number\}", \{ number: order\.shipped\.number \}\)/.test(thanks) && /ct\("Subtotal"\)/.test(thanks) && /ct\("Discount \(\{code\}\)", \{ code: order\.shipped\.coupon \}\)/.test(thanks) && /addressLines\(order\.shipped\.address/.test(thanks) && /ct\("Usually arrives \{estimate\} after it ships\."/.test(thanks))
    check("  money in the page's language, as the checkout wrote it", /formatMinor\(cents, orderCurrency \?\? PLATFORM_CURRENCY\.toUpperCase\(\), locale\)/.test(thanks))
    /* Changed on purpose (round 51): the checkout's shared ui, words and Stripe loader moved to components/checkout/parts, so a website's stylesheet is built from website code only (tests/site-root-r52). */
    check("  never a client module's helper called on the server (estimateText from lib/checkout, not the client words module)", /from "@\/lib\/checkout\/estimate-text"/.test(thanks) && !/from "\.\.\/\.\.\/\.\.\/parts\/(words|ui)"/.test(thanks) && /export \{ estimateText \} from "@\/lib\/checkout\/estimate-text"/.test(read("components/checkout/parts/words.tsx")))
    const html = renderToStaticMarkup(React.createElement(ThanksView, { shopUrl: "https://andrewrullz.storelib.com/", lang: "ro", words: checkoutWordsIn("ro", null), map: null, order: { email: "andrei@example.com", firstName: "Andrei", totalCents: 12000, shippingCents: 1000, taxCents: 0, shipTo: null, receipt: `/checkout/physical/order/${TOKEN}`, ga: { id: CO, items: [], currency: "RON" }, lines: [{ title: "T-shirt", variantName: "S", imageUrl: null, quantity: 2, unitCents: 4000, cents: 8000 }, { title: "Mug", variantName: "Blue", imageUrl: null, quantity: 1, unitCents: 4000, cents: 3000 }], shipped: { number: "#27272727", placedAt: "2026-10-17T09:00:00Z", subtotalCents: 12000, discountCents: 1000, coupon: "TOAMNA", address: { name: "Andrei Radu", line1: "Str. Exemplu 6", city: "București", postalCode: "010101", country: "RO" }, method: { name: "Standard", minDays: 3, maxDays: 5, local: false, note: null } } } })).replace(/\u00a0/g, " ")
    check("drawn in Romanian: the number and day, two of the T-shirt at what each, the code, the address, Standard then its estimate", /Comanda #27272727 · 17 oct\. 2026/.test(html) && /2 × 40,00 lei/.test(html) && /Reducere \(TOAMNA\)/.test(html) && /Str\. Exemplu 6/.test(html) && /<p class="mt-1 text-\[#4b5563\]">Standard<\/p><p[^>]*>Ajunge de obicei în 3–5 zile lucrătoare de la expediere\.<\/p>/.test(html), html.slice(html.indexOf("data-thanks-delivery"), html.indexOf("data-thanks-delivery") + 600))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
