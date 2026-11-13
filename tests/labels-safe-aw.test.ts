/**
 * ===========================================================================
 *  ROUND AW: A LABEL IS NEVER LOST, NEVER BOUGHT TWICE, AND CROSSES CUSTOMS
 * ===========================================================================
 * lib/integrations/shipping, run against Shippo's and EasyPost's documented
 * answers (fetch stubbed, any other address fails the suite) and a watched
 * order engine.
 *
 *   no answer    a purchase that times out, drops, or comes back "still
 *                making it" is not a no. The provider is asked what became
 *                of the shipment: a label that exists comes onto the order
 *                (once), a purchase in flight keeps its claim, and only a
 *                shipment the provider says has no label is bought again
 *   refused      a real no (no postage balance) still frees the shipment
 *   not mine     a list Shippo did not filter never hands back another
 *                order's label
 *   customs      a parcel for another country carries a declaration made
 *                from the order: value paid, weight as sold, the product's
 *                origin and HS code. What is missing is said, never filled
 *                in. Inside one country and inside the EU there is none
 *   print        Print label asks the provider each time (Shippo's address
 *                expires); the kept address is the fallback in an outage
 *   money        a carrier's price in a currency with no decimals, or with
 *                three, lands in the same minor units the checkout uses
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { sealSecret } from "@/lib/physical/secrets"
import { buyLabel, labelDocument, labelView, quoteLabel, type LabelDeps, type LabelOrder } from "@/lib/integrations/shipping/labels-server"
import { crossesCustoms, customsFor, type CustomsSource } from "@/lib/integrations/shipping/customs"
import { fromMinor, toMinor, formatMinor } from "@/lib/integrations/shipping/money"
import { minorUnits } from "@/lib/markets/money"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-labels-aw-0123456789abcdef"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 700)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── the two APIs, stubbed ───────────────────────────────────────────── */

type Call = { method: string; url: string; body: any }
type Answer = { status: number; body?: unknown } | "drop"
type Route = (c: Call) => Answer | null
let calls: Call[] = []
let routes: Route[] = []
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const c: Call = { method: init.method ?? "GET", url, body: init.body ? JSON.parse(init.body) : null }
  calls.push(c)
  if (!/^https:\/\/(api\.goshippo\.com|api\.easypost\.com)\//.test(url)) throw new Error(`a real address was called: ${url}`)
  for (const r of routes) {
    const out = r(c)
    if (out === "drop") throw new TypeError("fetch failed")
    if (out) return new Response(out.body === undefined ? "" : JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json" } })
  }
  return new Response(JSON.stringify({ detail: "not stubbed" }), { status: 404 })
}) as typeof fetch
const reset = (r: Route[]) => {
  calls = []
  routes = r
}
const hit = (method: string, re: RegExp, answer: Answer): Route => (c) => (c.method === method && re.test(c.url) ? answer : null)
const posted = (re: RegExp) => calls.filter((c) => c.method === "POST" && re.test(c.url))

const CREATOR = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const CHECKOUT = "33333333-3333-4333-8333-333333333333"
const OTHER_CHECKOUT = "99999999-9999-4999-8999-999999999999"
const LINE_A = "44444444-4444-4444-8444-444444444444"
const LINE_B = "55555555-5555-4555-8555-555555555555"
const LOC = "66666666-6666-4666-8666-666666666666"
const PKG = "77777777-7777-4777-8777-777777777777"
const P_MUG = "aaaa0000-0000-4000-8000-00000000000a"
const P_BOWL = "aaaa0000-0000-4000-8000-00000000000b"
const SHIPPO_KEY = "shippo_test_5f3b2c1d0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c"
const EASYPOST_KEY = "EZTK1234567890abcdef1234567890abcd"

const RATE = "rate_usps_priority"
const shipment = (id = "shp_7f3a", reference = `storelib:${CHECKOUT}`) => ({
  object_id: id,
  status: "SUCCESS",
  metadata: reference,
  messages: [],
  rates: [{ object_id: RATE, shipment: id, amount: "7.58", currency: "USD", provider: "USPS", servicelevel: { name: "Priority Mail", token: "usps_priority" }, estimated_days: 2 }],
})
const txn = (over: Record<string, unknown> = {}) => ({ object_id: "txn_91c0aa", status: "SUCCESS", rate: RATE, tracking_number: "9400111899223197428490", tracking_url_provider: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490", label_url: "https://shippo-delivery.s3.amazonaws.com/label_91c.pdf?Expires=1790000000", commercial_invoice_url: null, messages: [], ...over })
const shippoBase = (): Route[] => [
  hit("POST", /goshippo\.com\/addresses\/$/, { status: 201, body: { object_id: "adr_1", validation_results: { is_valid: true, messages: [] } } }),
  hit("POST", /goshippo\.com\/shipments\/$/, { status: 201, body: shipment() }),
  hit("GET", /goshippo\.com\/shipments\/shp_7f3a$/, { status: 200, body: shipment() }),
]

function freshDb(from: { country: string; region: string | null; postal: string; city: string } = { country: "US", region: "TX", postal: "78701", city: "Austin" }) {
  const db = new FakeSupabase()
  let n = 0
  const id = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`
  db.table("commerce_integrations", { unique: [["creator_id", "provider"]] }, [
    { id: "int-shippo", creator_id: CREATOR, provider: "shippo", category: "shipping", status: "connected", config: {}, secret_ciphertext: sealSecret(SHIPPO_KEY) },
    { id: "int-easypost", creator_id: CREATOR, provider: "easypost", category: "shipping", status: "connected", config: {}, secret_ciphertext: sealSecret(EASYPOST_KEY) },
  ])
  db.table("inventory_locations", {}, [{ id: LOC, creator_id: CREATOR, name: "Studio", address_line1: "100 Main St", address_line2: null, city: from.city, region: from.region, postal_code: from.postal, country: from.country, phone: "5125550100", email: "ship@example.com", active: true, fulfills_orders: true, priority: 0 }])
  db.table("shipping_packages", {}, [{ id: PKG, creator_id: CREATOR, name: "Small box", kind: "box", length_mm: 250, width_mm: 200, height_mm: 100, weight_grams: 150, is_default: true, created_at: "2026-01-02T00:00:00Z" }])
  db.table("commerce_settings", {}, [{ creator_id: CREATOR, default_package_id: PKG, unit_system: "metric" }])
  db.table("orders", {}, [
    { id: LINE_A, checkout_id: CHECKOUT, variant_id: "v1", product_snapshot: { weight_grams: 400 } },
    { id: LINE_B, checkout_id: CHECKOUT, variant_id: "v2", product_snapshot: { weight_grams: 250 } },
  ])
  db.table("product_variants", {}, [])
  db.table("products", {}, [
    { id: P_MUG, creator_id: CREATOR, origin_country: "PT", hs_code: "6912.00" },
    { id: P_BOWL, creator_id: CREATOR, origin_country: "CN", hs_code: null },
  ])
  db.table("shipping_labels", { unique: [["provider", "provider_shipment_id"]], defaults: () => ({ id: id(), status: "buying", created_at: new Date().toISOString(), fulfillment_id: null }) })
  db.table("commerce_order_events", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n }) })
  return db
}

function engine(to: Record<string, unknown> = { name: "Ada Buyer", line1: "1 Elm St", city: "Brooklyn", region: "NY", postalCode: "11201", country: "US" }) {
  const order: LabelOrder = {
    id: CHECKOUT,
    status: "paid",
    currency: "USD",
    cancelledAt: null,
    deliveryMethod: "ship",
    delivery: { kind: "ship" },
    buyerName: "Ada Buyer",
    buyerEmail: "ada@example.com",
    buyerPhone: "5125550199",
    address: to,
    lines: [
      { orderId: LINE_A, productId: P_MUG, title: "Mug", variantName: "Blue", sku: "MUG-BLUE", quantity: 2, unitCents: 2000, discountCents: 400, fulfilled: 0, requiresShipping: true, locationId: LOC },
      { orderId: LINE_B, productId: P_BOWL, title: "Bowl", variantName: null, sku: null, quantity: 1, unitCents: 1500, discountCents: 0, fulfilled: 0, requiresShipping: true, locationId: LOC },
    ],
    shipments: [],
  }
  const log = { fulfil: [] as any[], events: [] as any[] }
  let next = 0
  const keys = new Set<string>()
  const deps: LabelDeps = {
    loadOrder: async (_db, where) => (where.creatorId === CREATOR && where.checkoutId === CHECKOUT ? structuredClone(order) : null),
    fulfilItems: async (_db, _c, _co, input) => {
      /* Keyed like orders-server: a repeat with the same key ships nothing more. */
      if (typeof input.key === "string" && keys.has(input.key)) return { ok: true as const, order: structuredClone(order) }
      if (typeof input.key === "string") keys.add(input.key)
      log.fulfil.push(input)
      for (const i of input.items) order.lines.find((l) => l.orderId === i.orderId)!.fulfilled += i.quantity
      order.shipments.push({ id: `ship-${++next}`, status: "shipped", trackingNumber: (input.trackingNumber as string) ?? null })
      return { ok: true as const, order: structuredClone(order) }
    },
    updateShipment: async () => ({ ok: true as const, order: structuredClone(order) }),
    addOrderEvent: async (db, e) => {
      const { error } = await db.from("commerce_order_events").insert({ checkout_id: e.checkoutId, creator_id: e.creatorId, kind: e.kind, message: e.message, detail: e.detail ?? null, idempotency_key: e.key ?? null })
      if (!error) log.events.push(e)
    },
  }
  return { order, log, deps }
}

const buy = (db: FakeSupabase, deps: LabelDeps, provider: "shippo" | "easypost" = "shippo", shipmentId = "shp_7f3a", rateId = RATE) => buyLabel(db, CREATOR, CHECKOUT, { provider, shipmentId, rateId, locationId: LOC, notifyBuyer: true }, deps)
const age = (db: FakeSupabase, minutes: number) => {
  const at = new Date(Date.now() - minutes * 60_000).toISOString()
  for (const r of db.rows("shipping_labels")) Object.assign(r, { created_at: at, updated_at: at })
}

async function main() {
  console.log("\nA purchase with no answer, and the label was bought\n")
  {
    const db = freshDb()
    const e = engine()
    /* The connection drops while Shippo is buying. Shippo did buy: its list for this rate has the transaction. */
    reset([...shippoBase(), hit("POST", /transactions\/$/, "drop"), hit("GET", /transactions\/\?rate=rate_usps_priority/, { status: 200, body: { results: [txn()] } })])
    const r = (await buy(db, e.deps)) as any
    const rows = db.rows("shipping_labels")
    check("the label comes onto the order instead of being lost", r.ok === true && r.label.status === "purchased" && r.label.trackingNumber === "9400111899223197428490", r)
    check("  one label row, with Shippo's own transaction id and what the rate cost", rows.length === 1 && rows[0].provider_label_id === "txn_91c0aa" && rows[0].cost_cents === 758 && rows[0].status === "purchased")
    check("  Shippo was asked to buy once, then asked what became of it", posted(/transactions\/$/).length === 1 && calls.some((c) => c.method === "GET" && /transactions\/\?rate=rate_usps_priority&results=25$/.test(c.url)))
    check("  the items ship once with its tracking, and the timeline says it once", e.log.fulfil.length === 1 && e.log.fulfil[0].trackingNumber === "9400111899223197428490" && e.log.events.filter((x) => x.kind === "label.purchased").length === 1)

    reset([...shippoBase(), hit("POST", /transactions\/$/, { status: 201, body: txn({ object_id: "txn_second" }) })])
    const again = (await buy(db, e.deps)) as any
    check("pressing Buy again buys nothing more", again.ok === true && again.label.id === r.label.id && posted(/transactions\/$/).length === 0 && db.rows("shipping_labels").length === 1 && e.log.fulfil.length === 1)
  }

  console.log("\nA purchase with no answer, and nothing to be seen yet\n")
  {
    const db = freshDb()
    const e = engine()
    reset([...shippoBase(), hit("POST", /transactions\/$/, "drop"), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [] } })])
    const r = (await buy(db, e.deps)) as any
    const claim = db.rows("shipping_labels")[0]
    check("it is not called a failure: the seller is told to press again, nothing shipped", r.ok === false && r.status === 503 && /did not answer/.test(r.error) && /nothing is bought twice/.test(r.error) && e.log.fulfil.length === 0, r)
    check("  the claim stays, with the rate it was quoted at", db.rows("shipping_labels").length === 1 && claim.status === "buying" && claim.package.rateId === RATE)
    check("  and the card shows what went wrong", /could not be reached/.test(db.rows("commerce_integrations")[0].last_error ?? ""))

    reset([...shippoBase(), hit("POST", /transactions\/$/, { status: 201, body: txn() }), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [] } })])
    const soon = (await buy(db, e.deps)) as any
    check("pressed again at once: the first request may still be running, so nothing is bought", soon.ok === false && soon.status === 409 && /already being bought/.test(soon.error) && posted(/transactions\/$/).length === 0, soon)

    /* Shippo is still making it: its list shows the transaction QUEUED. */
    age(db, 5)
    reset([...shippoBase(), hit("POST", /transactions\/$/, { status: 201, body: txn() }), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [txn({ status: "QUEUED", label_url: null, tracking_number: null })] } })])
    const queued = (await buy(db, e.deps)) as any
    check("five minutes on and Shippo says it is still making it: still nothing bought twice", queued.ok === false && /already being bought/.test(queued.error) && posted(/transactions\/$/).length === 0 && db.rows("shipping_labels")[0].status === "buying")

    /* Shippo has nothing for the rate and the claim is old: the first request never reached it. */
    reset([...shippoBase(), hit("POST", /transactions\/$/, { status: 201, body: txn() }), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [] } })])
    const late = (await buy(db, e.deps)) as any
    check("five minutes on and Shippo has no label for it: the claim is released and this press buys", late.ok === true && late.label.status === "purchased" && posted(/transactions\/$/).length === 1 && db.rows("shipping_labels").length === 1 && e.log.fulfil.length === 1, late)
  }

  console.log("\nGetting rates again while an earlier purchase is unsettled\n")
  {
    const db = freshDb()
    const e = engine()
    const quote = () => quoteLabel(db, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "Mara's Mugs" }, e.deps) as Promise<any>
    reset([...shippoBase(), hit("POST", /transactions\/$/, "drop"), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [] } })])
    await buy(db, e.deps)
    check("an unanswered purchase leaves its claim", db.rows("shipping_labels").length === 1 && db.rows("shipping_labels")[0].status === "buying")

    /* The seller closes the dialog and asks for rates again: a new shipment at Shippo would be a second label waiting to happen. */
    reset([...shippoBase(), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [] } })])
    const held = await quote()
    check("rates are not quoted again while the first purchase may still land", /still being bought at Shippo/.test(held.error ?? "") && held.status === 409 && posted(/shipments\/$/).length === 0, held)

    /* A different quoted shipment, pressed Buy on: the same. */
    reset([hit("GET", /goshippo\.com\/shipments\/shp_new1$/, { status: 200, body: shipment("shp_new1") }), hit("POST", /transactions\/$/, { status: 201, body: txn({ object_id: "txn_second" }) }), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [] } })])
    const second = (await buy(db, e.deps, "shippo", "shp_new1")) as any
    check("and a different shipment of the same order is not bought either", second.ok === false && second.status === 409 && /still being bought at Shippo/.test(second.error) && posted(/transactions\/$/).length === 0 && db.rows("shipping_labels").length === 1, second)

    /* Shippo did buy the first one after all. */
    reset([...shippoBase(), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [txn()] } })])
    const came = await quote()
    check("when the first label turns out bought, it comes onto the order and the seller is told to look", /has come through/.test(came.error ?? "") && /USPS 9400111899223197428490/.test(came.error) && db.rows("shipping_labels")[0].status === "purchased" && e.log.fulfil.length === 1 && posted(/shipments\/$/).length === 0, came)

    /* A claim ten minutes old that Shippo knows nothing of is released, and stops nothing. */
    const db2 = freshDb()
    const e2 = engine()
    reset([...shippoBase(), hit("POST", /transactions\/$/, "drop"), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [] } })])
    await buy(db2, e2.deps)
    age(db2, 15)
    reset([...shippoBase(), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [] } })])
    const free = (await quoteLabel(db2, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "Mara's Mugs" }, e2.deps)) as any
    check("an old claim Shippo has no label for is released, and rates are quoted", Array.isArray(free.rates) && free.rates.length === 1 && db2.rows("shipping_labels").length === 0, free)

    /* Shippo unreachable for those fifteen minutes: nothing can be learned, and the order is not locked for ever. */
    const db3 = freshDb()
    const e3 = engine()
    reset([...shippoBase(), hit("POST", /transactions\/$/, "drop"), hit("GET", /transactions\/\?rate=/, { status: 503, body: {} })])
    await buy(db3, e3.deps)
    age(db3, 15)
    reset([...shippoBase(), hit("GET", /transactions\/\?rate=/, { status: 503, body: {} })])
    const on = (await quoteLabel(db3, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "Mara's Mugs" }, e3.deps)) as any
    check("a claim nothing can be learned about after ten minutes stays, and does not block the order", Array.isArray(on.rates) && db3.rows("shipping_labels").length === 1 && db3.rows("shipping_labels")[0].status === "buying", on)
  }

  console.log("\nShippo answers \"still making it\"\n")
  {
    const db = freshDb()
    const e = engine()
    reset([...shippoBase(), hit("POST", /transactions\/$/, { status: 201, body: txn({ status: "QUEUED", label_url: null, tracking_number: null }) }), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [txn({ status: "QUEUED", label_url: null, tracking_number: null })] } })])
    const r = (await buy(db, e.deps)) as any
    check("QUEUED is not read as a refusal: the claim is kept", r.ok === false && r.status === 503 && db.rows("shipping_labels").length === 1 && db.rows("shipping_labels")[0].status === "buying", r)
    reset([...shippoBase(), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [txn()] } })])
    const done = (await buy(db, e.deps)) as any
    check("once Shippo has made it, the next press takes it onto the order without buying", done.ok === true && done.label.status === "purchased" && posted(/transactions\/$/).length === 0 && e.log.fulfil.length === 1, done)
  }

  console.log("\nA real no, and a list Shippo did not filter\n")
  {
    const db = freshDb()
    const e = engine()
    reset([...shippoBase(), hit("POST", /transactions\/$/, { status: 201, body: { object_id: "txn_x", status: "ERROR", rate: RATE, messages: [{ text: "Insufficient postage balance" }] } }), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [{ object_id: "txn_x", status: "ERROR", rate: RATE }] } })])
    const r = (await buy(db, e.deps)) as any
    check("no balance: Shippo's words, no row kept, the shipment can be bought again", r.ok === false && /Insufficient postage balance/.test(r.error) && db.rows("shipping_labels").length === 0 && e.log.fulfil.length === 0, r)

    /* A list that came back unfiltered: another order's bought label is in it. */
    reset([...shippoBase(), hit("POST", /transactions\/$/, "drop"), hit("GET", /transactions\/\?rate=/, { status: 200, body: { results: [txn({ object_id: "txn_someone_elses", rate: "rate_of_another_order" }), txn({ object_id: "txn_obj", rate: { object_id: "rate_of_a_third_order" } })] } })])
    const other = (await buy(db, e.deps)) as any
    check("a transaction for another rate is never taken as this order's label", other.ok === false && other.status === 503 && db.rows("shipping_labels")[0]?.status === "buying" && e.log.fulfil.length === 0, other)
  }

  console.log("\nEasyPost: postage already exists\n")
  {
    const db = freshDb()
    const e = engine()
    const ep = { id: "shp_ep1aaa", reference: `storelib:${CHECKOUT}`, messages: [], rates: [{ id: "rate_ep_pri", shipment_id: "shp_ep1aaa", carrier: "USPS", service: "Priority", rate: "8.10", currency: "USD", delivery_days: 2 }] }
    const bought = { ...ep, tracking_code: "9405500000000000000001", selected_rate: ep.rates[0], postage_label: { label_url: "https://easypost-files.s3.amazonaws.com/label.png", label_pdf_url: "https://easypost-files.s3.amazonaws.com/label.pdf" }, tracker: { public_url: "https://track.easypost.com/abc" }, forms: [{ form_type: "commercial_invoice", form_url: "https://easypost-files.s3.amazonaws.com/invoice.pdf" }] }
    let reads = 0
    reset([
      /* Read back before buying (no label yet), then asked again after the refusal (the label an earlier, unanswered request bought). */
      (c) => (c.method === "GET" && /easypost\.com\/v2\/shipments\/shp_ep1aaa$/.test(c.url) ? { status: 200, body: ++reads === 1 ? ep : bought } : null),
      hit("POST", /shipments\/shp_ep1aaa\/buy$/, { status: 422, body: { error: { code: "SHIPMENT.POSTAGE.EXISTS", message: "Postage already exists for this shipment." } } }),
    ])
    const r = (await buy(db, e.deps, "easypost", "shp_ep1aaa", "rate_ep_pri")) as any
    check("the label EasyPost already holds comes onto the order", r.ok === true && r.label.status === "purchased" && r.label.trackingNumber === "9405500000000000000001" && r.label.cents === 810 && db.rows("shipping_labels").length === 1, r)
    check("  with its commercial invoice to print", /\?print=.+&doc=invoice$/.test(r.label.invoiceUrl ?? "") && db.rows("shipping_labels")[0].package.invoice === true, r.label)
  }

  console.log("\nCustoms: which parcels, and what the declaration says\n")
  {
    check("inside one country: none", crossesCustoms("US", "us") === false && crossesCustoms("RO", "RO") === false)
    check("inside the EU: none", crossesCustoms("RO", "DE") === false && crossesCustoms("fr", "IT") === false)
    check("out of the EU, into it, and between two others: one", crossesCustoms("RO", "GB") && crossesCustoms("US", "DE") && crossesCustoms("US", "CA") && crossesCustoms("GB", "CH"))
    check("an address with no country is not guessed at", crossesCustoms("US", "") === false && crossesCustoms(null, "DE") === false)

    const mug: CustomsSource = { title: "Mug", variantName: "Blue", sku: "MUG-BLUE", quantity: 2, unitCents: 2000, lineDiscountCents: 400, lineQuantity: 2, gramsEach: 400, originCountry: "pt", hsCode: "6912.00" }
    const bowl: CustomsSource = { title: "Bowl", variantName: null, sku: null, quantity: 1, unitCents: 1500, lineDiscountCents: 0, lineQuantity: 1, gramsEach: 250, originCountry: "CN", hsCode: null }
    const base = { from: "US", to: "CA", currency: "usd", signer: "Mara's Mugs", providerName: "Shippo" }
    const out = customsFor({ ...base, lines: [mug, bowl] }) as any
    check("value is what the buyer paid for the line: price less its discount", out.needed === true && out.form.lines[0].cents === 3600 && out.form.lines[1].cents === 1500, out)
    check("weight is the line's total as sold, origin and tariff are the product's", out.form.lines[0].grams === 800 && out.form.lines[0].originCountry === "PT" && out.form.lines[0].hsCode === "691200" && out.form.lines[1].hsCode === null && out.form.lines[0].description === "Mug, Blue" && out.form.lines[0].sku === "MUG-BLUE")
    check("leaving the US under the filing limit: 30.36 to Canada, 30.37(a) elsewhere", out.form.usExemption === "30.36" && (customsFor({ ...base, to: "DE", lines: [mug] }) as any).form.usExemption === "30.37a")
    check("from anywhere else no US exemption is claimed", (customsFor({ ...base, from: "RO", to: "GB", currency: "RON", lines: [mug] }) as any).form.usExemption === null)
    check("a US order paid in another currency claims none either: its dollar value is not known here", (customsFor({ ...base, currency: "EUR", lines: [mug] }) as any).form.usExemption === null)
    const part = customsFor({ ...base, lines: [{ ...mug, quantity: 1 }] }) as any
    check("a partial parcel carries its share of the line's discount", part.form.lines[0].cents === 1800 && part.form.lines[0].grams === 400 && part.form.lines[0].quantity === 1)
    const gift = customsFor({ ...base, lines: [{ ...mug, lineDiscountCents: 4000 }] }) as any
    check("an item given away is declared at its own price, never at zero", gift.form.lines[0].cents === 4000)

    const noOrigin = customsFor({ ...base, lines: [{ ...mug, originCountry: null }, bowl] }) as any
    check("no country of origin: said, naming the product and where to add it", noOrigin.needed === true && /where each item was made/.test(noOrigin.error) && /"Mug"/.test(noOrigin.error) && !/"Bowl"/.test(noOrigin.error) && /Customs info/.test(noOrigin.error), noOrigin)
    const noWeight = customsFor({ ...base, lines: [mug, { ...bowl, gramsEach: 0 }] }) as any
    check("no weight: said, never made up", /each item's weight/.test(noWeight.error) && /"Bowl"/.test(noWeight.error), noWeight)
    const free = customsFor({ ...base, lines: [{ ...bowl, unitCents: 0 }] }) as any
    check("no price at all: sent to the provider, where a value can be typed", /has no price/.test(free.error) && /Buy this label in Shippo/.test(free.error), free)
    const big = customsFor({ ...base, to: "DE", lines: [{ ...mug, unitCents: 150_000, lineDiscountCents: 0 }] }) as any
    check("over $2,500 from the US: an export filing is the seller's, and no exemption is claimed for it", /more than \$2,500/.test(big.error) && /ITN/.test(big.error), big)
    check("  the same parcel from Germany is declared as it is", (customsFor({ ...base, from: "DE", to: "US", lines: [{ ...mug, unitCents: 150_000, lineDiscountCents: 0 }] }) as any).form?.lines[0].cents === 300_000)
    check("nothing chosen: asked for, not declared empty", /Choose the items/.test((customsFor({ ...base, lines: [] }) as any).error))
  }

  console.log("\nCustoms on the wire: Shippo\n")
  {
    const db = freshDb()
    const e = engine({ name: "Ada Buyer", line1: "1 King St W", city: "Toronto", region: "ON", postalCode: "M5H 1A1", country: "CA" })
    reset([...shippoBase(), hit("POST", /goshippo\.com\/customs\/declarations\/$/, { status: 201, body: { object_id: "decl_5d2e9a" } })])
    const q = (await quoteLabel(db, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "Mara's Mugs" }, e.deps)) as any
    const decl = posted(/customs\/declarations\/$/)[0]
    const ship = posted(/shipments\/$/)[0]
    check("the declaration is made first, then the shipment names it", q.customs === true && !!decl && ship?.body.customs_declaration === "decl_5d2e9a" && calls.indexOf(decl) < calls.indexOf(ship), { q, decl: decl?.body })
    check("  merchandise, returned if undeliverable, certified by the store, duties the recipient's (DDU)", decl?.body.contents_type === "MERCHANDISE" && decl.body.non_delivery_option === "RETURN" && decl.body.certify === true && decl.body.certify_signer === "Mara's Mugs" && decl.body.incoterm === "DDU" && decl.body.eel_pfc === "NOEEI_30_36")
    const [a, b] = decl?.body.items ?? []
    check("  each line: what was paid, its weight in grams, origin and tariff number", a?.description === "Mug, Blue" && a.quantity === 2 && a.net_weight === "800" && a.mass_unit === "g" && a.value_amount === "36.00" && a.value_currency === "USD" && a.origin_country === "PT" && a.tariff_number === "691200" && a.sku_code === "MUG-BLUE", a)
    check("  a product with no HS code sends none, rather than one made up", b?.origin_country === "CN" && b.value_amount === "15.00" && !("tariff_number" in b), b)

    const home = engine()
    reset(shippoBase())
    const d = (await quoteLabel(db, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "Mara's Mugs" }, home.deps)) as any
    check("a parcel that stays in the country has no declaration and none is asked for", d.customs === false && posted(/customs/).length === 0 && !("customs_declaration" in (posted(/shipments\/$/)[0]?.body ?? {})), d)

    /* The product's origin was never filled in. */
    db.rows("products")[0].origin_country = null
    reset(shippoBase())
    const stop = (await quoteLabel(db, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "Mara's Mugs" }, e.deps)) as any
    check("a product with no origin stops the quote before Shippo is asked anything", /where each item was made/.test(stop.error ?? "") && /"Mug"/.test(stop.error) && calls.length === 0, stop)

    /* Another store's product row with the same id is never read for this store's declaration. */
    db.rows("products")[0].creator_id = OTHER
    db.rows("products")[0].origin_country = "PT"
    reset(shippoBase())
    const foreign = (await quoteLabel(db, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "Mara's Mugs" }, e.deps)) as any
    check("another store's product is not read: the origin is still missing here", /where each item was made/.test(foreign.error ?? "") && calls.length === 0, foreign)
  }

  console.log("\nCustoms on the wire: EasyPost, and inside the EU\n")
  {
    const db = freshDb({ country: "RO", region: null, postal: "010101", city: "Bucharest" })
    const e = engine({ name: "Ada Buyer", line1: "1 King St", city: "London", region: null, postalCode: "EC4N 7BE", country: "GB" })
    e.order.currency = "RON"
    const ep = { id: "shp_ep2bbb", reference: `storelib:${CHECKOUT}`, messages: [], rates: [{ id: "rate_ep_x", shipment_id: "shp_ep2bbb", carrier: "DHLExpress", service: "ExpressWorldwide", rate: "92.40", currency: "RON", delivery_days: 3 }] }
    reset([
      hit("POST", /easypost\.com\/v2\/addresses$/, { status: 200, body: { id: "adr_1", verifications: { delivery: { success: true, errors: [] } } } }),
      hit("POST", /easypost\.com\/v2\/customs_infos$/, { status: 201, body: { id: "cstinfo_0c1d2e" } }),
      hit("POST", /easypost\.com\/v2\/shipments$/, { status: 200, body: ep }),
    ])
    const q = (await quoteLabel(db, CREATOR, CHECKOUT, { provider: "easypost", locationId: LOC, packageId: PKG, storeName: "Atelier Nord" }, e.deps)) as any
    const info = posted(/customs_infos$/)[0]?.body.customs_info
    const made = posted(/v2\/shipments$/)[0]?.body.shipment
    check("EasyPost: the customs info first, the shipment names it by id", q.customs === true && made?.customs_info?.id === "cstinfo_0c1d2e", { q, made })
    check("  certified by the store, merchandise, returned if undeliverable, no US exemption from Romania", info?.customs_certify === true && info.customs_signer === "Atelier Nord" && info.contents_type === "merchandise" && info.restriction_type === "none" && info.non_delivery_option === "return" && !("eel_pfc" in info), info)
    const item = info?.customs_items?.[0]
    check("  the line's total weight in ounces and its value in lei", item?.quantity === 2 && item.weight === 28.219 && item.value === 36 && item.currency === "RON" && item.origin_country === "PT" && item.hs_tariff_number === "691200" && item.code === "MUG-BLUE", item)

    const eu = engine({ name: "Ada Buyer", line1: "Unter den Linden 1", city: "Berlin", region: null, postalCode: "10117", country: "DE" })
    reset([hit("POST", /easypost\.com\/v2\/addresses$/, { status: 200, body: { id: "adr_1" } }), hit("POST", /easypost\.com\/v2\/shipments$/, { status: 200, body: ep })])
    const inside = (await quoteLabel(db, CREATOR, CHECKOUT, { provider: "easypost", locationId: LOC, packageId: PKG, storeName: "Atelier Nord" }, eu.deps)) as any
    check("Romania to Germany: inside the EU, so no customs info", inside.customs === false && posted(/customs_infos$/).length === 0 && !("customs_info" in (posted(/v2\/shipments$/)[0]?.body.shipment ?? {})), inside)
  }

  console.log("\nPrint label asks the provider\n")
  {
    const db = freshDb()
    const e = engine()
    reset([...shippoBase(), hit("POST", /transactions\/$/, { status: 201, body: txn() })])
    const b = (await buy(db, e.deps)) as any
    const id = b.label.id as string
    check("the label's Print link is the order's own route, not Shippo's expiring address", b.label.printUrl === `/api/physical/orders/${CHECKOUT}/label?print=${id}` && b.label.invoiceUrl === null && b.label.labelUrl === txn().label_url, b.label)

    const fresh = "https://shippo-delivery.s3.amazonaws.com/label_91c.pdf?Expires=1890000000"
    reset([hit("GET", /goshippo\.com\/transactions\/txn_91c0aa$/, { status: 200, body: txn({ label_url: fresh, commercial_invoice_url: "https://shippo-delivery.s3.amazonaws.com/invoice_91c.pdf" }) })])
    const doc = (await labelDocument(db, CREATOR, CHECKOUT, id, "label")) as any
    check("printing reads the transaction again and opens the address Shippo gives now", doc.ok === true && doc.url === fresh && calls.length === 1 && db.rows("shipping_labels")[0].label_url === fresh, doc)
    const inv = (await labelDocument(db, CREATOR, CHECKOUT, id, "invoice")) as any
    check("the commercial invoice comes from the same read", inv.ok === true && /invoice_91c\.pdf$/.test(inv.url), inv)

    reset([hit("GET", /goshippo\.com\/transactions\//, { status: 503, body: {} })])
    const down = (await labelDocument(db, CREATOR, CHECKOUT, id, "label")) as any
    check("Shippo down: the address kept last still opens", down.ok === true && down.url === fresh, down)
    const noInv = (await labelDocument(db, CREATOR, CHECKOUT, id, "invoice")) as any
    check("  and an invoice that can't be read is said, not guessed", noInv.ok === false && noInv.status === 503, noInv)

    reset([hit("GET", /goshippo\.com\/transactions\//, { status: 200, body: txn({ commercial_invoice_url: null }) })])
    const none = (await labelDocument(db, CREATOR, CHECKOUT, id, "invoice")) as any
    check("a label with no invoice says why", none.ok === false && none.status === 404 && /no commercial invoice/.test(none.error), none)

    reset([])
    const theirs = (await labelDocument(db, OTHER, CHECKOUT, id, "label")) as any
    const wrongOrder = (await labelDocument(db, CREATOR, OTHER_CHECKOUT, id, "label")) as any
    check("another store, or another order, finds no label and asks Shippo nothing", theirs.ok === false && theirs.status === 404 && wrongOrder.ok === false && wrongOrder.status === 404 && calls.length === 0)

    db.rows("shipping_labels")[0].status = "voided"
    const voided = (await labelDocument(db, CREATOR, CHECKOUT, id, "label")) as any
    check("a voided label is not printed", voided.ok === false && voided.status === 409 && /voided/.test(voided.error) && labelView(db.rows("shipping_labels")[0]).printUrl === null, voided)
  }

  console.log("\nA carrier's price in the checkout's own minor units\n")
  {
    const same = ["USD", "EUR", "RON", "JPY", "KRW", "TWD", "HUF", "ISK", "XPF", "CLP", "KWD", "BHD", "TND", "VND"].filter((c) => toMinor("1", c) !== 10 ** minorUnits(c))
    check("one unit of every currency is as many minor units as the checkout says", same.length === 0, same)
    check("a Taiwan dollar has cents here as at checkout (it read 100 times too little)", toMinor("120.00", "TWD") === 12000 && fromMinor(12000, "TWD") === "120.00")
    check("a dinar has three decimals (it read ten times too little)", toMinor("1.250", "KWD") === 1250 && fromMinor(1250, "KWD") === "1.250" && formatMinor(1250, "KWD").includes("1.250"))
    check("a CFP franc has none (it read 100 times too much)", toMinor("1200", "XPF") === 1200 && fromMinor(1200, "XPF") === "1200")
    check("dollars, yen and refusals as before", toMinor("7.58", "USD") === 758 && toMinor("1200", "JPY") === 1200 && toMinor("-1", "USD") === null && toMinor("abc", "USD") === null && formatMinor(758, "USD") === "$7.58" && fromMinor(5025, "EUR") === "50.25")
  }

  console.log("\nThe route and the order page (source)\n")
  {
    const route = read("app/api/physical/orders/[id]/label/route.ts")
    const panel = read("components/physical/order-panel.tsx")
    const flow = read("components/physical/buy-label.tsx")
    const server = read("lib/integrations/shipping/labels-server.ts")
    check("the route has its own time limit, longer than a purchase", /export const maxDuration = 60/.test(route) && /BUY_TIMEOUT_MS = 30_000/.test(read("lib/integrations/shipping/shippo.ts")) && /BUY_TIMEOUT_MS = 30_000/.test(read("lib/integrations/shipping/easypost.ts")))
    check("print is a read of this store's order, limited, answered with a redirect that is never cached", /searchParams\.get\("print"\)/.test(route) && /physicalCaller\("orders", \{ read: true \}\)/.test(route) && /labelDocument\(c\.db, c\.creatorId, checkoutId, print/.test(route) && /bucket: "physical-label-print"/.test(route) && /status: 302/.test(route) && /private, no-store/.test(route))
    check("every Print label on the order page goes through it", !/href=\{l(abel)?\.labelUrl\}/.test(panel) && (panel.match(/labelPrintHref\(/g) ?? []).length >= 5 && /labelPrintHref\(label\)/.test(flow))
    check("the customs invoice is offered where the provider made one", /data-shipment-label-invoice/.test(panel) && /data-label-invoice/.test(flow) && /tt\("Print customs invoice"\)/.test(panel))
    check("a failed purchase is settled with the provider before its claim is touched", /api\.findLabel\(cred\.key, \{ shipmentId, rateId, labelId: null \}\)/.test(server) && /settleClaim\(db, creatorId, checkoutId, was, api, cred, deps\)/.test(server) && !/function stuckClaim/.test(server))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
