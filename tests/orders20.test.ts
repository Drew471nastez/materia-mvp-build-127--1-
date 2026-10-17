/**
 * Round 20: the Orders page for things that ship. Where a physical order is
 * in the list and its filter, the order laid out as Shopify's (to fulfil per
 * place, a card per shipment with tracking, the address and the method, the
 * timeline with the parcel's history and the shop's notes), and the route
 * behind it: owner only, rate limited, nothing taken on trust.
 *
 *   npx tsx tests/orders20.test.ts
 *   node scripts/check-orders20.mjs   (the same, in Chromium, at 390 and 1440)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_QUERY, filterOrders, groupOrders, inView, paramsFromQuery, queryFromParams, shipStageOf, type OrderRow } from "@/lib/orders/order-view"
import { orderEvents, physicalEvents, type PhysicalHistory } from "@/lib/orders/timeline"
import { guessCarrier, trackingUrl } from "@/lib/physical/status"
import { NOTE_MAX, cleanNote } from "@/lib/physical/notes"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const base = (id: string, over: Partial<OrderRow> = {}): OrderRow => ({
  id,
  product_id: "p",
  amount_cents: 1000,
  status: "completed",
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
  stripe_session_id: null,
  product: { id: "p", title: "Preset pack", type: "digital" },
  ...over,
})
const shirt = { id: "s", title: "Shirt", type: "physical" }

console.log("\nWhere a parcel is, in one word\n")
{
  check("the stages from the checkout's statuses", shipStageOf("unfulfilled") === "unfulfilled" && shipStageOf("processing") === "unfulfilled" && shipStageOf("partially_fulfilled") === "partially_fulfilled" && shipStageOf("fulfilled") === "fulfilled" && shipStageOf("delivered") === "delivered")
  check("  a return outranks delivery; nothing to ship is no stage", shipStageOf("delivered", "returned") === "returned" && shipStageOf("delivered", "partially_returned") === "partially_returned" && shipStageOf("not_required") === null && shipStageOf(null) === null && shipStageOf("cancelled", "returned") === "cancelled")
  const orders = groupOrders([
    base("d"),
    base("u1", { product: shirt, checkout_id: "c1", stripe_session_id: "cs1", quantity: 2, amount_cents: 9500, shipping_cents: 500, physical_fulfillment: "unfulfilled", physical_return: "none", physical_method: "Standard" }),
    base("u2", { checkout_id: "c1", stripe_session_id: "cs1" }),
    base("v", { product: shirt, checkout_id: "c2", stripe_session_id: "cs2", physical_fulfillment: "delivered", physical_return: "partially_returned", physical_pickup: true }),
  ])
  const d = orders.find((o) => o.id === "d")!
  const u = orders.find((o) => o.id === "u1")!
  const v = orders.find((o) => o.id === "v")!
  check("a download has no shipping and keeps its two words", d.shipping === null && d.fulfillment === "fulfilled" && d.shippingCents === 0)
  check("a mixed order is one order with its parcel's stage and method", u.lines.length === 2 && u.shipping?.stage === "unfulfilled" && u.shipping.method === "Standard" && !u.shipping.pickup)
  check("  delivery is its own row: out of the subtotal, in the total", u.shippingCents === 500 && u.subtotalCents === 10000 && u.totalCents === 10500, { sub: u.subtotalCents, ship: u.shippingCents })
  check("  a pickup says so", v.shipping?.pickup === true && v.shipping.stage === "partially_returned")
  check("the Unfulfilled view: only parcels still to send", inView(u, "unfulfilled") && !inView(v, "unfulfilled") && !inView(d, "unfulfilled"))
  const by = (f: string) => filterOrders(orders, { ...DEFAULT_QUERY, fulfillment: f as never }).map((o) => o.id)
  check("the Fulfillment filter: Unfulfilled, Returned (whole or part), Any", by("unfulfilled").join() === "u1" && by("returned").join() === "v" && by("delivered").length === 0 && by("any").length === 3)
  const q = queryFromParams(new URLSearchParams("fulfillment=delivered&view=unfulfilled"))
  check("  both live in the address, and a wrong value reads as Any", q.fulfillment === "delivered" && q.view === "unfulfilled" && (queryFromParams(new URLSearchParams("fulfillment=lost")).fulfillment ?? "any") === "any" && paramsFromQuery(q).get("fulfillment") === "delivered" && !paramsFromQuery(DEFAULT_QUERY).has("fulfillment"))
  check("  a query without it (older callers) still filters", filterOrders(orders, { view: "all", q: "", source: "any", product: "", sort: "newest", page: 1 }).length === 3)
  const access = orderEvents(u).find((e) => e.id === "access")
  check("the timeline gives access to the downloads only, never to a parcel", access?.text === "Access given to 1 item" && !orderEvents(groupOrders([base("p", { product: shirt, checkout_id: "c", physical_fulfillment: "fulfilled" })])[0]).some((e) => e.id === "access"))
}

console.log("\nThe parcel's history on the order's timeline\n")
{
  const h: PhysicalHistory = {
    pickup: false,
    shipments: [
      { id: "f1", status: "delivered", carrier: "UPS", trackingNumber: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784", shippedAt: "2026-10-01T10:00:00Z", deliveredAt: "2026-10-03T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", items: [{ quantity: 2 }] },
      { id: "f2", status: "shipped", carrier: null, trackingNumber: null, trackingUrl: null, shippedAt: "2026-10-02T10:00:00Z", deliveredAt: null, createdAt: "2026-10-02T10:00:00Z", items: [{ quantity: 1 }] },
    ],
    events: [
      { id: 1, kind: "payment.paid", message: "Payment received", actor: "webhook", createdAt: "2026-10-01T09:00:00Z" },
      { id: 2, kind: "fulfillment.created", message: "2 items shipped", actor: "creator", createdAt: "2026-10-01T10:00:00Z" },
      { id: 3, kind: "payment.refunded", message: "Refunded", actor: "creator", createdAt: "2026-10-04T10:00:00Z" },
      { id: 4, kind: "note", message: "Called the buyer", actor: "creator", createdAt: "2026-10-02T11:00:00Z", detail: { text: "Called the buyer\nships Monday" } },
      { id: 5, kind: "order.cancelled", message: "Order cancelled", actor: "creator", createdAt: "2026-10-05T10:00:00Z" },
      { id: 6, kind: "email.sent", message: "Shipping email sent to the buyer", actor: "system", createdAt: "2026-10-01T10:01:00Z" },
    ],
  }
  const e = physicalEvents(h)
  const shipped = e.find((x) => x.id === "ship-f1")
  check("shipped, with carrier, number and a Track link", shipped?.text === "2 items shipped" && shipped.detail === "UPS 1Z999AA10123456784" && shipped.link?.href.startsWith("https://www.ups.com/") === true && shipped.glyph === "shipped")
  check("  one without a number says so, with no link", e.find((x) => x.id === "ship-f2")?.detail === "No tracking number" && !e.find((x) => x.id === "ship-f2")?.link)
  check("delivered at its own time", e.find((x) => x.id === "delivered-f1")?.at === "2026-10-03T10:00:00Z" && !e.some((x) => x.id === "delivered-f2"))
  check("what the rows or the shipment already say is not said twice", !e.some((x) => x.text === "Payment received" || x.text === "Refunded" || x.id === "event-2"))
  const note = e.find((x) => x.note)
  check("a note is the whole note, line breaks kept", note?.text === "Called the buyer\nships Monday" && note.glyph === "note")
  check("cancelled reads critical, an email neutral", e.find((x) => x.id === "event-5")?.tone === "critical" && e.find((x) => x.id === "event-6")?.glyph === "mail")
  const pick = physicalEvents({ ...h, pickup: true })
  check("a pickup: ready and picked up, no tracking", pick.find((x) => x.id === "ship-f1")?.text === "2 items ready for pickup" && !pick.find((x) => x.id === "ship-f1")?.link && pick.find((x) => x.id === "delivered-f1")?.text === "2 items picked up")
}

console.log("\nTracking and notes\n")
{
  check("the carrier from the number's shape", guessCarrier("1Z999AA10123456784") === "UPS" && guessCarrier("9400 1118 9922 3197 4284 90") === "USPS" && guessCarrier("RR123456785GB") === "Royal Mail" && guessCarrier("123456789012") === "FedEx" && guessCarrier("1234567890") === "DHL Express" && guessCarrier("ABC") === null && guessCarrier("") === null)
  check("  and every guess has a tracking link", ["UPS", "USPS", "Royal Mail", "FedEx", "DHL Express", "Canada Post", "Australia Post"].every((c) => trackingUrl(c, "1Z999AA10123456784") !== null))
  check("a note keeps its lines, loses control characters, is cut to size", cleanNote("  a\r\nb\n\n\n\nc\u0007 ") === "a\nb\n\nc" && cleanNote("   ") === null && cleanNote(42) === null && (cleanNote("x".repeat(5000)) ?? "").length === NOTE_MAX)
  const wide = cleanNote("😀".repeat(1500)) ?? ""
  check("  and fits the timeline entry's 4 KB detail in any script", new TextEncoder().encode(JSON.stringify({ text: wide })).length <= 3800 && wide.length > 0)
}

console.log("\nThe route: owner only, rate limited, nothing taken on trust\n")
{
  const route = read("app/api/physical/orders/[id]/route.ts")
  check("every call is the signed in owner's (physicalCaller) and ids are checked", /* Changed on purpose (round AA, Team): the store's, for its owner or a member whose role has orders. */ /const c = await physicalCaller\("orders"\)/.test(route) && /if \(!isUuid\(id\)\)/.test(route))
  check("every write is rate limited per shop, notes more tightly", /bucket: "physical-order-write", subjects: \[`creator:\$\{c\.creatorId\}`\]/.test(route) && /bucket: "physical-order-note"/.test(route) && route.indexOf("physical-order-write") < route.indexOf("switch (body.action)"))
  check("a note is an action of its own, with the composer's key", /case "comment":\s+result = await addNote\(c\.db, c\.creatorId, id, body\.text, body\.key\)/.test(route))
  const server = read("lib/physical/orders-server.ts")
  check("  written only to an order of this shop, as the shop", /select\("id"\)\.eq\("id", checkoutId\)\.eq\("creator_id", creatorId\)/.test(server) && /kind: "note"[\s\S]{0,200}actor: "creator"/.test(server))
  check("the place a parcel ships from is one of its own lines', never the request's", /ownLocations\.has\((?:input|p)\.locationId\)/.test(server) && !/typeof input\.locationId === "string" \? input\.locationId :/.test(server))
  check("a timeline entry fits its column (300), it was cut at 500 and lost", /e\.message\.length > 300/.test(read("lib/physical/events-server.ts")))
  check("the shop's activity log names the note", /"order\.note": "Added a note to order \{s\}"/.test(read("lib/activity/actions.ts")))
}

console.log("\nThe page\n")
{
  const detail = read("app/app/orders/order-detail.tsx")
  const panel = read("components/physical/order-panel.tsx")
  const list = read("app/app/orders/orders-list.tsx")
  check("a mixed order keeps its downloads' card beside the parcel's", /digitalLines\.length > 0 \? \(\s*<FulfillmentCard order=\{order\} lines=\{digitalLines\}/.test(detail))
  check("the address and method at the side, the buyer's note, the phone", /<ShippingCard order=\{parcel\}/.test(detail) && /<BuyerNoteCard order=\{parcel\}/.test(detail) && /phone=\{parcel\?\.buyerPhone/.test(detail))
  check("one timeline: the parcel's entries and the note box", /physicalEvents\(physical\)/.test(detail) && /<NoteComposer onPost=\{onNote\} \/>/.test(detail) && /action: "comment", text, key/.test(detail))
  check("the bar and the list follow what the server says", /shipStageOf\(parcel\.fulfillmentStatus, parcel\.returnStatus\)/.test(detail) && /onShipping\(parcel\.id/.test(detail) && /physical_fulfillment: fulfillment, physical_return: returnStatus/.test(read("app/app/orders/orders-client.tsx")))
  check("Fulfill items, the carrier guessed, the buyer told; Mark as delivered", /"Fulfill items"/.test(panel) && /guessCarrier\(v\)/.test(panel) && /notifyBuyer: notify/.test(panel) && /"Mark as delivered"/.test(panel))
  check("  the address copies, the tracking number copies", /copyText\(lines\.join\("\\n"\)\)/.test(panel) && /copyText\(s\.trackingNumber!\)/.test(panel))
  check("the list: stage badge, rate name, Fulfillment filter for a shop that ships", /<ShipBadge stage=\{order\.shipping\.stage\}( problem=\{order\.shipping\.problem\})? \/>/.test(list) && /order\.shipping\.method/.test(list) && /label="Fulfillment"/.test(list) && /ships \|\| fulfillment/.test(list))
  check("a row press reads the parcel ahead", /prefetchPhysicalOrder\(line\.id\)/.test(read("app/app/orders/order-prefetch.ts")))
  const copy = [detail, panel, list, read("lib/orders/timeline.ts"), read("lib/orders/order-view.ts")].join("\n").replace("[\u2014\u2013]", "")
  check("no em dashes and none of the banned words", !/\u2014/.test(copy) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(copy))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
