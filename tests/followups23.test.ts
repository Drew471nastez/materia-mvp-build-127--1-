/**
 * ===========================================================================
 *  ROUND 23 FOLLOW-UPS (Z23): WHAT CROSSED FROM ONE AREA INTO ANOTHER
 * ===========================================================================
 *   1. A location Printful or Printify made says Connected to Printful from
 *      its integration's row, not Provider not connected.
 *   2. The product editor says orders go to Printful automatically; print on
 *      demand where no stock is held is never counted, so never sold out.
 *   3. Website settings › Commerce names every pixel from the tracker list.
 *   4. A buyer can ask to cancel an Unfulfilled order from its page: token
 *      scoped, limited, once; the seller is emailed and answers from the order.
 *   5. A delivery problem reads the same to the seller as to the buyer.
 *   6, 7. Help and the admin guide say all of it (tests/help23, admindocs23).
 *   8. Tax inside the prices is kept on an order's lines and shown.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { madeToOrder, partnerPill, partnerSentence } from "../lib/physical/partner"
import { locationsWithPartners, partnerOf } from "../lib/physical/config-server"
import { PURCHASE_TRACKERS, TRACKERS, TRACKER_ORDER, purchaseTags, trackersHint } from "../lib/store/tracking"
import { CANCEL_DECLINED, CANCEL_REQUESTED, buyerCancelState, cleanCancelReason, openCancelRequest, stillUnfulfilled } from "../lib/physical/buyer-cancel"
import { cancelEvents, declineBuyerCancel, requestBuyerCancel } from "../lib/physical/orders-server"
import { sellerEmailFor } from "../lib/physical/events-server"
import { sellerCommerceEmail, sellerKindForEvent } from "../lib/notify/seller-commerce"
import { DEFAULT_CHECKOUT, checkoutConfig } from "../lib/store/checkout-config"
import { groupOrders, showsProblem, type OrderRow } from "../lib/orders/order-view"
import { readCreatorOrders, toOrderRow } from "../lib/orders/load-rows"
import { articleText, helpArticle } from "../lib/help/articles"
import { COMMERCE_DOCS } from "../lib/admin/commerce-docs"
import type { Location } from "../lib/physical/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const CREATOR = "11111111-1111-4111-8111-111111111111"
const INT = "22222222-2222-4222-8222-222222222222"

async function main() {
  /* ── 1. Connected to Printful ─────────────────────────────────────────── */
  console.log("\n1. A print partner's location says whether it is connected")
  const base: Location = { id: "l1", name: "Printful", kind: "print_on_demand", country: null, city: null, addressLine1: null, addressLine2: null, region: null, postalCode: null, phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: false, priority: 0, forwarding: "provider", pickupEnabled: false, pickupInstructions: null, pickupReady: "24h" }
  check("connected: Connected to Printful, in green", JSON.stringify(partnerPill({ ...base, partner: { provider: "printful", name: "Printful", connected: true } })) === JSON.stringify({ label: "Connected to Printful", tone: "green" }))
  check("disconnected since: Printify not connected, in amber", JSON.stringify(partnerPill({ ...base, partner: { provider: "printify", name: "Printify", connected: false } })) === JSON.stringify({ label: "Printify not connected", tone: "amber" }))
  check("no integration row at all: Provider not connected", partnerPill({ ...base, partner: null })?.label === "Provider not connected")
  check("a location that emails orders gets no partner pill", partnerPill({ ...base, forwarding: "email" }) === null)
  check("partnerOf names the provider from the list and reads its status", JSON.stringify(partnerOf({ provider: "printful", status: "connected" })) === JSON.stringify({ provider: "printful", name: "Printful", connected: true }) && partnerOf({ provider: "printify", status: "error" })?.connected === false && partnerOf(null) === null)

  const db = fakeDb({
    commerce_integrations: [{ id: INT, creator_id: CREATOR, provider: "printful", status: "connected" }],
    inventory_locations: [],
  })
  const rows = [
    { id: "a", name: "Studio", kind: "home", forwarding: "none", integration_id: null },
    { id: "b", name: "Printful", kind: "print_on_demand", forwarding: "provider", integration_id: INT, holds_inventory: false },
    { id: "c", name: "Old Printify", kind: "print_on_demand", forwarding: "provider", integration_id: "33333333-3333-4333-8333-333333333333", holds_inventory: false },
  ]
  const locs = await locationsWithPartners(db as never, CREATOR, rows)
  check("the location linked to a connected row reads connected", locs[1].partner?.connected === true && locs[1].partner?.name === "Printful")
  check("a location whose row is gone reads not connected", locs[2].partner === null && partnerPill(locs[2])?.label === "Provider not connected")
  check("a location of the shop's own has no partner", locs[0].partner === undefined)
  check("one read of the integrations, scoped to the shop", db.log.filter((l) => l.table === "commerce_integrations").length === 1 && db.log.find((l) => l.table === "commerce_integrations")!.filters.some(([k, c, v]) => k === "eq" && c === "creator_id" && v === CREATOR))
  const noProvider = fakeDb({})
  await locationsWithPartners(noProvider as never, CREATOR, [rows[0]])
  check("no provider location: integrations not read at all", noProvider.log.length === 0)
  const broken = fakeDb({}, { failWith: { commerce_integrations: { code: "42P01", message: "missing" } } })
  const brokenLocs = await locationsWithPartners(broken as never, CREATOR, rows)
  check("a failed read leaves them unlinked, never an error", brokenLocs.length === 3 && !brokenLocs[1].partner?.connected)
  const shipping = read("components/physical/shipping-settings.tsx")
  check("Locations no longer labels every provider location Provider not connected", !/>Provider not connected</.test(shipping) && /partnerPill\(l\)/.test(shipping))
  check("  and its location form no longer says Storelib can't send orders to providers", !/can't send orders to providers yet/.test(shipping))
  check("a location's save hands back its partner too", /locationsWithPartners\(c\.db, c\.creatorId, \[extra\.row \?\? data\]\)/.test(read("app/api/physical/locations/[id]/route.ts")))

  /* ── 2. The editor and stock ──────────────────────────────────────────── */
  console.log("\n2. The product editor, and print on demand that is never sold out")
  const cards = read("components/physical/product-cards.tsx")
  check("the editor no longer says Orders aren't sent automatically for every partner", !cards.includes("Orders aren't sent automatically. You pass them on.") && /partnerSentence\(chosen\)/.test(cards))
  check("connected: orders go to Printful automatically", partnerSentence({ ...base, partner: { provider: "printful", name: "Printful", connected: true } }) === "Orders go to Printful automatically, and its tracking comes back to your buyer.")
  check("not connected: says so and where to connect it", /isn't connected, so orders aren't sent there\. Connect it in Settings › Integrations/.test(partnerSentence({ ...base, partner: { provider: "printify", name: "Printify", connected: false } })))
  check("email and webhook partners keep their own sentences", partnerSentence({ ...base, forwarding: "email", email: "o@x.example" }) === "Orders are emailed to o@x.example." && partnerSentence({ ...base, forwarding: "webhook" }) === "Orders are sent to your webhook.")
  check("print on demand at the provider's location is made to order", madeToOrder("print_on_demand", { holdsInventory: false, forwarding: "provider" }))
  check("  and at a print partner that holds no stock", madeToOrder("print_on_demand", { holdsInventory: false, forwarding: "email" }))
  check("  but not when the location keeps stock and is no provider", !madeToOrder("print_on_demand", { holdsInventory: true, forwarding: "email" }))
  check("  nor for a product the seller ships", !madeToOrder("self", { holdsInventory: false, forwarding: "provider" }) && !madeToOrder("print_on_demand", null))
  check("the editor saves tracking off for it and shows why", /trackInventory: counted,/.test(cards) && /const counted = trackInventory && !printedAt/.test(cards) && /data-made-to-order/.test(cards))
  check("the server saves it off whatever is sent", /track_inventory: body\.trackInventory !== false && !printedToOrder/.test(read("lib/physical/catalog-server.ts")))
  check("checkout never counts it, even for a product saved before", /const tracked = printed \? false : \(v\.track_inventory \?\? p\.track_inventory \?\? true\)/.test(read("lib/physical/checkout-pricing-server.ts")))

  /* ── 3. Website settings › Commerce ──────────────────────────────────── */
  console.log("\n3. Website settings › Commerce names every pixel")
  const hint = trackersHint()
  check("every tracker in the list is named", TRACKER_ORDER.every((id) => hint.includes(TRACKERS[id].name)), hint)
  check("  Microsoft Clarity, Klaviyo and Omnisend among them", ["Microsoft Clarity", "Klaviyo", "Omnisend"].every((n) => hint.includes(n)))
  check("the ones said to hear about a purchase are the ones purchaseTags tells", TRACKER_ORDER.every((id) => {
    const tags = purchaseTags({ [id]: TRACKERS[id].example }, { id: "ord-1", valueCents: 1000, currency: "USD", quantity: 1 })
    return PURCHASE_TRACKERS.includes(id) ? tags.length === 1 : tags.length === 0
  }))
  check("the Commerce page reads the hint from the list", /hint=\{trackersHint\(\)\}/.test(read("components/website-builder/website-settings/commerce.tsx")) && !/Tag Manager, Meta, TikTok and Pinterest load/.test(read("components/website-builder/website-settings/commerce.tsx")))

  /* ── 4. Buyer cancellation ────────────────────────────────────────────── */
  console.log("\n4. A buyer asks to cancel; the seller answers")
  const fresh = { status: "paid", cancelledAt: null, processingAt: null, refundedCents: 0, lines: [{ requiresShipping: true, fulfilled: 0 }], shipments: [] as { status: string }[], events: [] as { kind: string; createdAt: string; detail?: Record<string, unknown> | null }[] }
  check("Unfulfilled: paid, nothing sent, started or refunded", stillUnfulfilled(fresh))
  check("  in progress is the seller's", !stillUnfulfilled({ ...fresh, processingAt: "2026-10-10T00:00:00Z" }))
  check("  a shipment out is too late", !stillUnfulfilled({ ...fresh, shipments: [{ status: "shipped" }] }) && stillUnfulfilled({ ...fresh, shipments: [{ status: "cancelled" }] }))
  check("  a refund, a cancel or a download only order: no", !stillUnfulfilled({ ...fresh, refundedCents: 100 }) && !stillUnfulfilled({ ...fresh, cancelledAt: "x" }) && !stillUnfulfilled({ ...fresh, lines: [{ requiresShipping: false, fulfilled: 0 }] }))
  check("the page offers Cancel order only while the shop takes requests", buyerCancelState(fresh, true) === "can_request" && buyerCancelState(fresh, false) === "closed")
  const asked = { ...fresh, events: [{ kind: CANCEL_REQUESTED, createdAt: "2026-10-10T10:00:00Z", detail: { reason: "Ordered the wrong size" } }] }
  check("asked: the page says it is waiting", buyerCancelState(asked, true) === "requested" && openCancelRequest(asked)?.reason === "Ordered the wrong size")
  check("kept by the seller: the page says the shop is going ahead, and no second request", buyerCancelState({ ...asked, events: [...asked.events, { kind: CANCEL_DECLINED, createdAt: "2026-10-10T11:00:00Z" }] }, true) === "declined")
  check("sent after all: the request is no longer open", openCancelRequest({ ...asked, shipments: [{ status: "shipped" }] }) === null)
  check("a reason is kept plain and short", cleanCancelReason("  <b>too\nlate</b>  ") === "b too late /b" && (cleanCancelReason("x".repeat(500)) ?? "").length === 300 && cleanCancelReason(42) === null)
  check("the shop's switch defaults on and reads back", DEFAULT_CHECKOUT.buyerCancel === true && checkoutConfig({ buyerCancel: false }).buyerCancel === false && checkoutConfig(null).buyerCancel === true)
  check("  and Settings › Checkout has it", /Let buyers ask to cancel/.test(read("components/app/settings/checkout-panel.tsx")) && /change\(\{ buyerCancel: v \}\)/.test(read("components/app/settings/checkout-panel.tsx")))

  const TOKEN = "tok_abcdefghijklmnopqrstu"
  const CO = "44444444-4444-4444-8444-444444444444"
  const order = (over: Record<string, unknown> = {}) => ({ id: CO, creator_id: CREATOR, receipt_token: TOKEN, status: "paid", total_cents: 5000, currency: "usd", fulfillment_status: "unfulfilled", return_status: "none", buyer_name: "Sam Rivera", buyer_email: "sam@example.com", shipping_rate: { name: "Standard" }, lines: [], cancelled_at: null, processing_at: null, ...over })
  const line = { id: "55555555-5555-4555-8555-555555555555", checkout_id: CO, product_id: "p", amount_cents: 5000, quantity: 1, requires_shipping: true, product_snapshot: { title: "Mug" } }
  const odb = fakeDb({ commerce_checkouts: [order()], orders: [line], fulfillments: [], commerce_returns: [], commerce_order_events: [], commerce_jobs: [] }, { unique: { commerce_order_events: [["idempotency_key"]], commerce_jobs: [["idempotency_key"]] } })
  const r1 = await requestBuyerCancel(odb as never, TOKEN, { reason: "Wrong size", enabled: true })
  const ev = odb.tables.commerce_order_events
  check("the request is one timeline entry, by the buyer, with the reason", r1.ok && ev.length === 1 && ev[0].kind === CANCEL_REQUESTED && ev[0].actor === "buyer" && (ev[0].detail as { reason: string }).reason === "Wrong size")
  check("  nothing is cancelled or refunded by it", odb.tables.commerce_checkouts[0].cancelled_at === null && !odb.log.some((l) => l.table === "orders" && l.op === "update"))
  check("  and the seller is emailed (a Cancel request job)", odb.tables.commerce_jobs.filter((j) => (j.payload as { event?: string }).event === CANCEL_REQUESTED).length === 1)
  const r2 = await requestBuyerCancel(odb as never, TOKEN, { reason: "again", enabled: true })
  check("a second press asks nothing again: still one entry, one email", r2.ok && ev.length === 1 && odb.tables.commerce_jobs.filter((j) => (j.payload as { event?: string }).event === CANCEL_REQUESTED).length === 1)
  check("the buyer's page reads the request apart from the shop's timeline", (await cancelEvents(odb as never, CO)).length === 1)
  const wrong = await requestBuyerCancel(odb as never, "tok_somebodyelsesorder00", { reason: null, enabled: true })
  check("another token finds nothing", wrong.ok === false && wrong.status === 404)
  const kept = await declineBuyerCancel(odb as never, CREATOR, CO, "Already packed")
  check("Keep order writes the seller's answer once", kept.ok && ev.filter((e) => e.kind === CANCEL_DECLINED).length === 1 && ev.find((e) => e.kind === CANCEL_DECLINED)!.actor === "creator")
  const r3 = await requestBuyerCancel(odb as never, TOKEN, { reason: null, enabled: true })
  check("  after which the buyer can't ask again", r3.ok === false && /going ahead/.test(r3.error))
  const started = fakeDb({ commerce_checkouts: [order({ processing_at: "2026-10-10T09:00:00Z" })], orders: [line], fulfillments: [], commerce_returns: [], commerce_order_events: [] })
  const r4 = await requestBuyerCancel(started as never, TOKEN, { reason: null, enabled: true })
  check("once the seller started on it, the request is refused and nothing written", r4.ok === false && started.tables.commerce_order_events.length === 0)
  const off = fakeDb({ commerce_checkouts: [order()], orders: [line], fulfillments: [], commerce_returns: [], commerce_order_events: [] })
  const r5 = await requestBuyerCancel(off as never, TOKEN, { reason: null, enabled: false })
  check("a shop that turned it off takes no request", r5.ok === false && off.tables.commerce_order_events.length === 0)

  check("the seller is emailed for a buyer's request, not for their own answers", sellerEmailFor(CANCEL_REQUESTED, "buyer") && !sellerEmailFor(CANCEL_REQUESTED, "creator") && !sellerEmailFor(CANCEL_DECLINED, "creator"))
  check("  as its own email", sellerKindForEvent(CANCEL_REQUESTED) === "cancel_requested")
  const mail = sellerCommerceEmail("cancel_requested", { orderId: "o1", orderNumber: "1A2B3C4D", buyerName: "Sam", lines: [{ title: "Mug", quantity: 1 }], reason: "Wrong size", totalCents: 5000, currency: "usd" }, { baseUrl: "https://storelib.com" })
  check("  which says what to do and opens the order", /Cancel request for order #1A2B3C4D/.test(mail.subject) && /Don't send it yet/.test(mail.text) && /Wrong size/.test(mail.text) && /Review request/.test(mail.html))
  const route = read("app/api/physical/order-status/[token]/cancel/route.ts")
  check("the route is gated, checks the token's shape, and is limited per address and per order", /physicalApiGate\(\)/.test(route) && /\^\[A-Za-z0-9_-\]\{20,64\}\$/.test(route) && /addressSubject\(request\), `order:\$\{token\}`/.test(route))
  const panel = read("components/physical/order-panel.tsx")
  check("the seller's order shows the request with Cancel and refund and Keep order", /data-cancel-request/.test(panel) && /Cancel and refund/.test(panel) && /Keep order/.test(panel) && /action: "cancel_decline"/.test(panel))
  check("  saying yes uses the order's own Cancel order, then the Orders page's refund", /act\(\{ action: "cancel", reason: CANCELLED_AT_BUYERS_REQUEST \}\)/.test(panel) && /onRefundAll=\{canRefund && refundable\.length > 0 \? refundAll : null\}/.test(read("app/app/orders/order-detail.tsx")) && /kind: "refund", line, amountCents: cents, reason: "cancelled"/.test(read("app/app/orders/order-detail.tsx")))
  check("  so the buyer gets the Order cancelled email from cancelOrder", /queueCancelledEmail\(db, checkoutId, creatorId\)/.test(read("lib/physical/orders-server.ts")))
  const view = read("app/checkout/physical/order/[token]/order-status-view.tsx")
  check("the buyer's page has Cancel order, the waiting line and the no", /data-cancel-button/.test(view) && /data-cancel-state="requested"/.test(view) && /data-cancel-state="declined"/.test(view) && /order-status\/\$\{encodeURIComponent\(token\)\}\/cancel/.test(view))

  /* ── 5. Delivery problem, both sides ─────────────────────────────────── */
  console.log("\n5. A delivery problem reads the same to the seller")
  check("a parcel out with a problem shows it; delivered or cancelled does not", showsProblem("fulfilled", true) && showsProblem("partially_fulfilled", true) && !showsProblem("delivered", true) && !showsProblem("cancelled", true) && !showsProblem("fulfilled", false))
  check("the shipment card says Delivery problem in red with the next step", /<StatusBadge tone="critical">Delivery problem<\/StatusBadge>/.test(panel) && /data-delivery-problem/.test(panel))
  check("the Orders list and the order's bar say it too", /ShipBadge stage=\{order\.shipping\.stage\} problem=\{order\.shipping\.problem\}/.test(read("app/app/orders/orders-list.tsx")) && /problem=\{parcel \? parcel\.shipments\.some\(\(s\) => s\.status === "failed"\)/.test(read("app/app/orders/order-detail.tsx")))
  check("the buyer's page still says it in the same words", /There's a problem with your delivery/.test(view) && /The carrier reported a problem delivering this package/.test(view) && /The carrier reported a problem delivering this package/.test(panel))

  /* ── 8. Tax inside the prices ─────────────────────────────────────────── */
  console.log("\n8. Tax inside the prices, on the creator's order")
  const snapRow = toOrderRow({ id: "o1", product_id: "p", amount_cents: 11900, status: "completed", created_at: "2026-10-10T10:00:00Z", checkout_id: CO, quantity: 1, shipping_cents: 0, product_snapshot: { tax_cents: 1900, tax_included: true, tax_label: "VAT 19%" } }, undefined)
  check("a new order's line keeps its share of the included tax", snapRow.tax_cents === 1900 && snapRow.tax_included === true && snapRow.tax_label === "VAT 19%")
  const g = groupOrders([snapRow as OrderRow])[0]
  check("  so the order has an Includes row, and its subtotal is the price", g.taxCents === 1900 && g.taxIncluded === true && g.subtotalCents === 11900 && g.taxLabel === "VAT 19%")
  const ck = read("lib/physical/checkout-server.ts")
  check("the checkout writes it on each line when prices include tax", /const includedShares = taxIncluded \? (apportionFee|taxSharesOf)\(Math\.max\(0, co\.tax_cents\)/.test(ck) && /tax_cents: taxIncluded \? \(includedShares\[i\] \?\? 0\) : \(taxShares\[i\] \?\? 0\)/.test(ck) && /tax_included: true/.test(ck))
  /* An older order: its lines kept no tax, its checkout still says it was included. */
  const old = fakeDb({
    products: [{ id: "p", creator_id: CREATOR, title: "Mug", type: "physical" }],
    orders: [
      { id: "o-a", creator_id: CREATOR, product_id: "p", amount_cents: 6000, status: "completed", created_at: "2026-10-01T10:00:00Z", checkout_id: CO, stripe_session_id: "cs_1", quantity: 1, product_snapshot: { tax_cents: 0 } },
      { id: "o-b", creator_id: CREATOR, product_id: "p", amount_cents: 5900, status: "completed", created_at: "2026-10-01T10:00:00Z", checkout_id: CO, stripe_session_id: "cs_1", quantity: 1, product_snapshot: { tax_cents: 0 } },
    ],
    commerce_checkouts: [{ id: CO, creator_id: CREATOR, fulfillment_status: "fulfilled", return_status: "none", delivery_method: "ship", tax_cents: 1900, shipping_rate: { name: "Standard", tax_included: true, tax_label: "VAT 19%" } }],
    fulfillments: [{ id: "f1", checkout_id: CO, status: "failed" }],
  })
  const { rows: oldRows } = await readCreatorOrders(old as never, CREATOR)
  const oldOrder = groupOrders(oldRows)[0]
  check("an order paid before reads its included tax from its checkout", oldOrder?.taxCents === 1900 && oldOrder?.taxIncluded === true && oldOrder?.taxLabel === "VAT 19%", oldOrder ? { tax: oldOrder.taxCents, inc: oldOrder.taxIncluded } : null)
  check("  and the list knows its parcel has a delivery problem", oldOrder?.shipping?.problem === true)
  check("an order with tax added on top is left as it was", (() => {
    const r = toOrderRow({ id: "o2", product_id: "p", amount_cents: 11900, status: "completed", created_at: "2026-10-10T10:00:00Z", checkout_id: CO, quantity: 1, product_snapshot: { tax_cents: 1900 } }, undefined)
    const o = groupOrders([r as OrderRow])[0]
    return o.taxIncluded === false && o.subtotalCents === 10000
  })())

  /* ── 6, 7. Help and the admin guide ───────────────────────────────────── */
  console.log("\n6, 7. Help and the admin guide say it")
  const pod = helpArticle("physical-products", "printful-and-printify")
  const podText = pod ? articleText(pod) : ""
  check("a help article for Printful and Printify", !!pod)
  for (const words of ["private token", "API token", "Connected to Printful", "same SKU", "Send orders straight to production", "draft", "tracking number", "Coming soon", "Tell me when it's ready", "never shows as sold out"]) check(`  it says "${words}"`, podText.includes(words))
  check("  and the integrations article says Send a test and points to it", /Send a test/.test(articleText(helpArticle("physical-products", "integrations")!)) && /printful-and-printify/.test(JSON.stringify(helpArticle("physical-products", "integrations"))))
  check("the cancel article covers a buyer's request with the order's own words", ["Cancel requested", "Cancel and refund", "Keep order", "Let buyers ask to cancel"].every((w) => articleText(helpArticle("physical-products", "cancel-a-physical-order")!).includes(w)))
  const docs = JSON.stringify(COMMERCE_DOCS)
  for (const words of ["/api/integrations/webhooks/<printful or printify>/<token>", "COMMERCE_SECRETS_KEY", "SUPABASE_SERVICE_ROLE_KEY", "/api/cron/physical", "order.cancel_requested", "Delivery problem", "pickup_hours", "local_delivery_codes", "store_settings.legal", "Business details", "Send a test"]) check(`the admin guide says ${words}`, docs.includes(words))

  /* ── House rules ──────────────────────────────────────────────────────── */
  console.log("\nCopy")
  const copy = [read("lib/physical/partner.ts"), read("lib/physical/buyer-cancel.ts"), read("app/api/physical/order-status/[token]/cancel/route.ts"), podText, docs, mail.text].join("\n")
  check("no em dash", !copy.includes("—"))
  check("none of the banned words", !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(copy))

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
