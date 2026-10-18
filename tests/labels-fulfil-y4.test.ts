/**
 * ===========================================================================
 *  SHIPPING LABELS ACROSS EVERY WAY AN ORDER IS FULFILLED (ROUND Y4)
 * ===========================================================================
 * lib/integrations/shipping/labels-server.ts, run against Shippo's documented
 * answers (fetch stubbed) and a watched order engine, for the gaps found in
 * the audit:
 *
 *   weight      the parcel is priced for the items chosen (a partial
 *               shipment), not every open item at the location
 *   other order a label bought on one order is never handed back on another
 *   kept        a label bought whose items could not be marked shipped is
 *               kept, listed, and a retried Buy ships them without buying again
 *   no number   a label with no tracking number is still tied to its shipment
 *   ship again  a label whose shipment was cancelled ships again with Mark as
 *               shipped, under its own key, without emailing the buyer twice
 *   void        only from the order the label belongs to
 *   local       an order the seller delivers is never sold a carrier label
 *   stuck       a purchase that never finished says where to look
 *   bounded     a stale dialog can't ship more than is left on a line
 *
 * And, read from the source, the order page's side: the label card for a
 * label with no live shipment, and labels kept off local delivery and
 * partner fulfilled items.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { sealSecret } from "@/lib/physical/secrets"
import { buyLabel, canShip, labelOptions, listLabels, quoteLabel, shipLabel, voidLabel, type LabelDeps, type LabelOrder } from "@/lib/integrations/shipping/labels-server"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-labels-y4-0123456789abcdef"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── Shippo, stubbed ─────────────────────────────────────────────────── */

type Call = { method: string; url: string; body: any }
let calls: Call[] = []
let txn: Record<string, unknown> = {}
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const c: Call = { method: init.method ?? "GET", url, body: init.body ? JSON.parse(init.body) : null }
  calls.push(c)
  if (!/^https:\/\/api\.goshippo\.com\//.test(url)) throw new Error(`a real address was called: ${url}`)
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (c.method === "POST" && /\/addresses\/$/.test(url)) return json(201, { object_id: "adr_1", validation_results: { is_valid: true, messages: [] } })
  if (/\/shipments\/(shp_[a-z0-9]+)?$/.test(url)) {
    const id = url.match(/shipments\/(shp_[a-z0-9]+)$/)?.[1] ?? "shp_main"
    return json(c.method === "POST" ? 201 : 200, shipment(id))
  }
  if (c.method === "POST" && /\/transactions\/$/.test(url)) return json(201, txn)
  if (c.method === "POST" && /\/refunds\/$/.test(url)) return json(201, { object_id: "rf_1", status: "SUCCESS" })
  return json(404, { detail: "not stubbed" })
}) as typeof fetch

const CREATOR = "11111111-1111-4111-8111-111111111111"
const CHECKOUT = "33333333-3333-4333-8333-333333333333"
const OTHER_CHECKOUT = "88888888-8888-4888-8888-888888888888"
const LINE_A = "44444444-4444-4444-8444-444444444444"
const LINE_B = "55555555-5555-4555-8555-555555555555"
const LOC = "66666666-6666-4666-8666-666666666666"
const PKG = "77777777-7777-4777-8777-777777777777"
const KEY = "shippo_test_5f3b2c1d0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c"

/* Every shipment is tagged with the order it was quoted for: shp_other for the other order, the rest for CHECKOUT. */
const shipment = (id: string) => ({
  object_id: id,
  status: "SUCCESS",
  metadata: `storelib:${id === "shp_other" ? OTHER_CHECKOUT : CHECKOUT}`,
  messages: [],
  rates: [{ object_id: `rate_${id}`, shipment: id, amount: "8.12", currency: "USD", provider: "USPS", servicelevel: { name: "Ground Advantage", token: "usps_ground_advantage" }, estimated_days: 5 }],
})
const goodTxn = (n: string, tracking: string | null = "9400111899223197428490") => ({ object_id: `txn_${n}`, status: "SUCCESS", tracking_number: tracking, tracking_url_provider: tracking ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}` : null, label_url: `https://shippo-delivery-east.s3.amazonaws.com/label_${n}.pdf`, messages: [] })

function freshDb() {
  const db = new FakeSupabase()
  let n = 0
  const id = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`
  db.table("commerce_integrations", { unique: [["creator_id", "provider"]] }, [{ id: "int-shippo", creator_id: CREATOR, provider: "shippo", category: "shipping", status: "connected", config: {}, secret_ciphertext: sealSecret(KEY) }])
  db.table("inventory_locations", {}, [{ id: LOC, creator_id: CREATOR, name: "Studio", address_line1: "100 Main St", address_line2: null, city: "Austin", region: "TX", postal_code: "78701", country: "US", phone: null, email: null, active: true, fulfills_orders: true, priority: 0 }])
  db.table("shipping_packages", {}, [{ id: PKG, creator_id: CREATOR, name: "Small box", kind: "box", length_mm: 250, width_mm: 200, height_mm: 100, weight_grams: 150, is_default: true, created_at: "2026-01-02T00:00:00Z" }])
  db.table("commerce_settings", {}, [{ creator_id: CREATOR, default_package_id: PKG, unit_system: "metric" }])
  db.table("orders", {}, [
    { id: LINE_A, checkout_id: CHECKOUT, variant_id: "v1", product_snapshot: { weight_grams: 400 } },
    { id: LINE_B, checkout_id: CHECKOUT, variant_id: "v2", product_snapshot: null },
  ])
  db.table("product_variants", {}, [{ id: "v2", weight_grams: 250 }])
  db.table("shipping_labels", { unique: [["provider", "provider_shipment_id"]], defaults: () => ({ id: id(), status: "buying", created_at: new Date().toISOString(), fulfillment_id: null }) })
  db.table("commerce_order_events", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n }) })
  return db
}

/* The order engine, watched: fulfilItems keyed like orders-server (one shipment per key), shipments cancelled like updateShipment. */
function engine(opts: { tracking?: boolean; failFulfil?: boolean; local?: boolean } = {}) {
  const order: LabelOrder = {
    id: CHECKOUT,
    status: "paid",
    cancelledAt: null,
    deliveryMethod: "ship",
    delivery: opts.local ? { kind: "local" } : { kind: "ship" },
    buyerName: "Ada Buyer",
    buyerEmail: "ada@example.com",
    buyerPhone: null,
    address: { name: "Ada Buyer", line1: "1 Elm St", city: "Brooklyn", region: "NY", postalCode: "11201", country: "US" },
    lines: [
      { orderId: LINE_A, title: "Mug", quantity: 2, fulfilled: 0, requiresShipping: true, locationId: LOC },
      { orderId: LINE_B, title: "Bowl", quantity: 1, fulfilled: 0, requiresShipping: true, locationId: LOC },
    ],
    shipments: [],
  }
  const log = { fulfil: [] as any[], update: [] as any[] }
  const keys = new Map<string, string>()
  const items = new Map<string, { orderId: string; quantity: number }[]>()
  let next = 0
  let fail = !!opts.failFulfil
  const deps: LabelDeps = {
    loadOrder: async (_db, where) => (where.creatorId === CREATOR && where.checkoutId === CHECKOUT ? structuredClone(order) : null),
    fulfilItems: async (_db, _c, _co, input) => {
      log.fulfil.push(input)
      if (fail) return { ok: false as const, error: "The fulfillment could not be saved." }
      const key = String(input.key ?? "")
      if (key && keys.has(key)) return { ok: true as const, order: structuredClone(order) }
      for (const i of input.items) {
        const l = order.lines.find((x) => x.orderId === i.orderId)!
        if (i.quantity > l.quantity - l.fulfilled) return { ok: false as const, error: "Only 0 left to fulfil on that item." }
      }
      for (const i of input.items) order.lines.find((x) => x.orderId === i.orderId)!.fulfilled += i.quantity
      const sid = `ship-${++next}`
      order.shipments.push({ id: sid, status: "shipped", trackingNumber: (input.trackingNumber as string | null) ?? null })
      items.set(sid, input.items)
      if (key) keys.set(key, sid)
      return { ok: true as const, order: structuredClone(order) }
    },
    updateShipment: async (_db, _c, sid, input) => {
      log.update.push({ id: sid, ...input })
      const s = order.shipments.find((x) => x.id === sid)!
      if (input.status === "cancelled" && s.status !== "cancelled") for (const i of items.get(sid) ?? []) order.lines.find((x) => x.orderId === i.orderId)!.fulfilled -= i.quantity
      s.status = String(input.status)
      return { ok: true as const, order: structuredClone(order) }
    },
    addOrderEvent: async (db, e) => {
      await db.from("commerce_order_events").insert({ checkout_id: e.checkoutId, creator_id: e.creatorId, kind: e.kind, message: e.message, idempotency_key: e.key ?? null })
    },
  }
  return { order, log, deps, setFail: (v: boolean) => (fail = v) }
}

const buy = (db: FakeSupabase, deps: LabelDeps, shipmentId = "shp_main", extra: Record<string, unknown> = {}) =>
  buyLabel(db, CREATOR, CHECKOUT, { provider: "shippo", shipmentId, rateId: `rate_${shipmentId}`, locationId: LOC, notifyBuyer: true, ...extra }, deps)
const bought = () => calls.filter((c) => /transactions\/$/.test(c.url)).length

/* ════════════════════════════════════════════════════════════════════ */

async function main() {
console.log("\nThe parcel is weighed for the items chosen\n")
{
  const db = freshDb()
  const e = engine()
  const o = (await labelOptions(db, CREATOR, CHECKOUT, { locationId: LOC, storeName: "Mara's Mugs" }, e.deps)) as any
  check("the dialog gets each line's own weight: the snapshot's, else the variant's", o.lineGrams?.[LINE_A] === 400 && o.lineGrams?.[LINE_B] === 250, o.lineGrams)
  check("  and the open items' total as before (2 × 400 + 250)", o.itemsGrams === 1050, o.itemsGrams)
  calls = []
  const q = (await quoteLabel(db, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "S", items: [{ orderId: LINE_A, quantity: 1 }] }, e.deps)) as any
  const sent = calls.find((c) => c.method === "POST" && /shipments\/$/.test(c.url))
  check("one mug of the three items: priced at 400 g plus the 150 g box, not 1200 g", sent?.body.parcels[0].weight === "550", sent?.body.parcels?.[0])
  check("  and rates come back", q.rates?.length === 1, q)
  calls = []
  await quoteLabel(db, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "S", items: [{ orderId: LINE_A, quantity: 9 }] }, e.deps)
  const capped = calls.find((c) => c.method === "POST" && /shipments\/$/.test(c.url))
  check("more than is left is weighed as what is left (2 mugs)", capped?.body.parcels[0].weight === "950", capped?.body.parcels?.[0])
}

console.log("\nA partial shipment ships what was chosen, never more than is left\n")
{
  const db = freshDb()
  const e = engine()
  txn = goodTxn("p1")
  calls = []
  const r = (await buy(db, e.deps, "shp_main", { items: [{ orderId: LINE_A, quantity: 5 }] })) as any
  check("asked for 5 mugs with 2 left: 2 ship, the bowl stays", r.ok === true && e.log.fulfil[0]?.items.length === 1 && e.log.fulfil[0].items[0].quantity === 2, e.log.fulfil[0])
  const row = db.rows("shipping_labels")[0]
  check("the label keeps what it was bought for: the place and the items", row.package?.locationId === LOC && row.package?.items?.[0]?.orderId === LINE_A && row.package.items[0].quantity === 2, row.package)
  check("  and is tied to the shipment it made", row.fulfillment_id === "ship-1" && r.label.fulfillmentId === "ship-1")
}

console.log("\nA label of one order is never handed back on another\n")
{
  const db = freshDb()
  const e = engine()
  txn = goodTxn("x1")
  await buy(db, e.deps)
  calls = []
  const other = await buyLabel(db, CREATOR, OTHER_CHECKOUT, { provider: "shippo", shipmentId: "shp_main", rateId: "rate_shp_main", locationId: LOC }, e.deps)
  check("the same shipment id from another order: refused, nothing bought, no label in the answer", other.ok === false && (other as any).status === 409 && !(other as any).label && bought() === 0, other)
  const v = await voidLabel(db, CREATOR, db.rows("shipping_labels")[0].id, e.deps, { checkoutId: OTHER_CHECKOUT })
  check("voiding it from the other order's address: not found, nothing refunded", v.ok === false && (v as any).status === 404 && !calls.some((c) => /refunds/.test(c.url)))
  const s = await shipLabel(db, CREATOR, OTHER_CHECKOUT, db.rows("shipping_labels")[0].id, {}, e.deps)
  check("shipping with it from the other order: not found", s.ok === false && (s as any).status === 404)
}

console.log("\nBought, but the items could not be marked shipped\n")
{
  const db = freshDb()
  const e = engine({ failFulfil: true })
  txn = goodTxn("k1")
  calls = []
  const first = (await buy(db, e.deps)) as any
  check("the purchase is kept and said, with the label in the answer", first.ok === false && /label was bought/.test(first.error) && first.label?.status === "purchased" && bought() === 1, first)
  const listed = await listLabels(db, CREATOR, CHECKOUT)
  check("  the order lists it, with no shipment, so it can be printed, shipped or voided", listed.labels.length === 1 && listed.labels[0].fulfillmentId === null && !!listed.labels[0].labelUrl)
  e.setFail(false)
  calls = []
  const again = (await buy(db, e.deps)) as any
  check("pressing Buy again buys nothing and ships the items with that label", again.ok === true && bought() === 0 && e.order.shipments.length === 1 && e.log.fulfil.at(-1)?.trackingNumber === "9400111899223197428490", { again, calls: calls.map((c) => c.url) })
  check("  under the label's own key, so a third press ships nothing more", e.log.fulfil.at(-1)?.key === `label:${db.rows("shipping_labels")[0].id}`)
  check("  and the label is now tied to that shipment", db.rows("shipping_labels")[0].fulfillment_id === "ship-1" && again.label.fulfillmentId === "ship-1")
  const third = (await buy(db, e.deps)) as any
  check("a third press: the same label, the same one shipment", third.ok === true && e.order.shipments.length === 1 && bought() === 0)
}

console.log("\nA label with no tracking number is still tied to its shipment\n")
{
  const db = freshDb()
  const e = engine()
  txn = goodTxn("n1", null)
  const r = (await buy(db, e.deps)) as any
  check("no number from the carrier: the new shipment is found by being new", r.ok === true && db.rows("shipping_labels")[0].fulfillment_id === "ship-1" && r.label.fulfillmentId === "ship-1", { row: db.rows("shipping_labels")[0], r })
}

console.log("\nIts shipment cancelled: the label ships again, or is voided\n")
{
  const db = freshDb()
  const e = engine()
  txn = goodTxn("c1")
  const r = (await buy(db, e.deps)) as any
  const labelId = r.label.id
  await e.deps.updateShipment(db, CREATOR, "ship-1", { status: "cancelled", notifyBuyer: false })
  check("cancelled: the items are back to unfulfilled, the label still bought", e.order.lines.every((l) => l.fulfilled === 0) && db.rows("shipping_labels")[0].status === "purchased")
  calls = []
  const s = (await shipLabel(db, CREATOR, CHECKOUT, labelId, { notifyBuyer: false }, e.deps)) as any
  const f = e.log.fulfil.at(-1)
  check("Ship with this label: the same items ship again with the label's carrier and number", s.ok === true && f?.carrier === "USPS" && f.trackingNumber === "9400111899223197428490" && f.items.length === 2 && f.items.find((i: any) => i.orderId === LINE_A)?.quantity === 2 && f.items.find((i: any) => i.orderId === LINE_B)?.quantity === 1 && bought() === 0, f)
  check("  under a key of its own (the first one is spent), the buyer not emailed again", f?.key === `label:${labelId}:after:ship-1` && f.notifyBuyer === false)
  check("  and the label moves to the new shipment", db.rows("shipping_labels")[0].fulfillment_id === "ship-2" && s.label.fulfillmentId === "ship-2")
  const twice = (await shipLabel(db, CREATOR, CHECKOUT, labelId, {}, e.deps)) as any
  check("pressed twice: nothing more ships", twice.ok === true && e.order.shipments.filter((x) => x.status !== "cancelled").length === 1)
  const v = (await voidLabel(db, CREATOR, labelId, e.deps, { checkoutId: CHECKOUT })) as any
  check("void from its own order: refunded, its live shipment cancelled without an email", v.ok === true && v.label.status === "voided" && e.log.update.at(-1)?.id === "ship-2" && e.log.update.at(-1)?.notifyBuyer === false)
  const after = await shipLabel(db, CREATOR, CHECKOUT, labelId, {}, e.deps)
  check("a voided label ships nothing", after.ok === false && /voided/.test((after as any).error))
}

console.log("\nLocal delivery and pickup are never sold a carrier label\n")
{
  const db = freshDb()
  const e = engine({ local: true })
  calls = []
  const q = await quoteLabel(db, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "S" }, e.deps)
  check("quote: refused in plain words, nothing asked of Shippo", "error" in q && /deliver this order yourself/.test(q.error) && calls.length === 0, q)
  const b = await buy(db, e.deps)
  check("buy: refused, nothing bought", b.ok === false && /deliver this order yourself/.test((b as any).error) && bought() === 0)
  check("an order with nothing to post is refused too", canShip({ ...e.order, delivery: null, deliveryMethod: "none" } as LabelOrder) === "Nothing on this order is shipped.")
  check("a shipped order is fine", canShip({ ...e.order, delivery: { kind: "ship" } } as LabelOrder) === null)
}

console.log("\nA purchase that never finished\n")
{
  const db = freshDb()
  const e = engine()
  const old = new Date(Date.now() - 30 * 60_000).toISOString()
  db.tables.shipping_labels.push({ id: "bbbbbbbb-0000-4000-8000-000000000001", creator_id: CREATOR, checkout_id: CHECKOUT, provider: "shippo", provider_shipment_id: "shp_stuck", provider_label_id: "pending:shp_stuck", status: "buying", created_at: old, updated_at: old, fulfillment_id: null })
  calls = []
  const r = await buy(db, e.deps, "shp_stuck")
  check("30 minutes old: says to check Shippo before buying again, buys nothing", r.ok === false && /did not finish/.test((r as any).error) && /Shippo account/.test((r as any).error) && bought() === 0, r)
  db.tables.shipping_labels[0].updated_at = new Date().toISOString()
  const fresh = await buy(db, e.deps, "shp_stuck")
  check("a moment old: wait, it is being bought", fresh.ok === false && /already being bought/.test((fresh as any).error))
}

console.log("\nThe order page's side (source)\n")
{
  const panel = read("components/physical/order-panel.tsx")
  const flow = read("components/physical/buy-label.tsx")
  const route = read("app/api/physical/orders/[id]/label/route.ts")
  check("a label with no live shipment gets its own card: Void, Print, Ship with this label", /labelsWithoutShipment\(labels, order\.shipments\)/.test(panel) && /data-label-loose-void/.test(panel) && /data-label-loose-print/.test(panel) && /data-label-loose-ship/.test(panel))
  check("the labels are read on an order with no shipment yet (the key is never empty)", /useOrderLabels\(order\?\.id \?\? null, order \? \["order", \.\.\.order\.shipments/.test(panel))
  check("  Ship with this label emails the buyer only when the label never had a shipment", /shipLabelRequest\(order\.id, l\.id, !l\.fulfillmentId\)/.test(panel))
  check("labels are kept off local delivery and partner fulfilled items", /labelsFit = !pickup && order\.delivery\?\.kind !== "local" && open\.every\(\(l\) => \(l\.fulfillmentMethod \?\? "self"\) === "self"\)/.test(panel))
  check("Cancel fulfillment on a shipment with a label says the label stays to ship again or void", /The \{providerName\} label stays on the order/.test(panel))
  check("the dialog's weight follows the items chosen, until typed", /chosenGrams\(options, items\)/.test(flow) && /setWeighed\(true\)/.test(flow) && /items: items\.filter\(\(i\) => i\.quantity > 0\) \} \}\)/.test(flow))
  check("a label kept after a failed shipping step reaches the order's list", /onKept\?\.\(kept\)/.test(flow) && /onLabelKept=\{\(label\) => setLabels/.test(panel))
  check("the route: ship is its own action, void names the order", /body\.action === "ship"/.test(route) && /voidLabel\(c\.db, c\.creatorId, body\.labelId, realLabelDeps, \{ checkoutId \}\)/.test(route) && /physicalCaller\("orders"\)/.test(route))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
