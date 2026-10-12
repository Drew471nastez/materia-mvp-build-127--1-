/**
 * Round 24, L24: ShipStation, Shippo and EasyPost are real integrations.
 *
 *   connect     each key is put to the provider's API before it is kept;
 *               refused or unreachable is never saved as connected; sealed,
 *               last four only; ShipStation's SHIP_NOTIFY webhook is
 *               subscribed and removed on disconnect
 *   labels      Buy a label: packages and weight, live rates with the
 *               address checked, the rate read back from the provider and
 *               checked against the order, one label per quoted shipment,
 *               the items shipped with the carrier and tracking number, the
 *               cost kept as the seller's, void for an unused label
 *   shipstation paid orders out (only what the seller ships), cancellations
 *               and new addresses follow, shipments back from the API (never
 *               from the webhook body), voided ones undone
 *   checkout    Carrier calculated rates priced live, in time or left out,
 *               the zone's other rates offered either way
 *
 * Every provider is a stub of its documented API: `fetch` is replaced and
 * any address that is not one of the three APIs fails the suite. Test keys
 * (shippo_test_, EZTK) as the providers issue them.
 *
 *   node scripts/run-push-tests.mjs   (this suite is in SUITES)
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { PROVIDERS, providerInfo } from "@/lib/physical/providers"
import { INTEGRATIONS, integrationById } from "@/lib/integrations/catalog"
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import { loadIntegrations, saveIntegration } from "@/lib/physical/integrations-server"
import { readWebhookToken } from "@/lib/integrations/fulfilment/forward-server"
import { externalIdOf } from "@/lib/integrations/fulfilment/http"
import { shipStationNotifyUrl } from "@/lib/integrations/shipping/connect-server"
import { buyLabel, labelOptions, parcelOf, quoteLabel, voidLabel, type LabelDeps, type LabelOrder } from "@/lib/integrations/shipping/labels-server"
import { applyShipments, handleShipNotify, pushToShipStation, queueShipStation, shipStationOrderFor, syncShipStation, type ShipStationDeps, type ShipStationSourceOrder } from "@/lib/integrations/shipping/shipstation-server"
import { carrierFromCode, isShipStationResource, readShipment } from "@/lib/integrations/shipping/shipstation"
import { CARRIER_TIMEOUT_MS, forgetCarrierQuotes, liveCarrierQuotes, pickCarrierRate } from "@/lib/integrations/shipping/checkout-rates-server"
import { formatMinor, toMinor } from "@/lib/integrations/shipping/money"
import { quoteDelivery } from "@/lib/physical/rates"
import type { ShippingProfile } from "@/lib/physical/types"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-shipping-apps-0123456789"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── the three APIs, stubbed ─────────────────────────────────────────── */

type Call = { method: string; url: string; headers: Record<string, string>; body: any }
let calls: Call[] = []
type Route = (c: Call) => { status: number; body?: unknown; headers?: Record<string, string>; delayMs?: number } | null
let routes: Route[] = []
let strayHost: string | null = null
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
  const c: Call = { method: init.method ?? "GET", url, headers, body: init.body ? JSON.parse(init.body) : null }
  calls.push(c)
  if (!/^https:\/\/(api\.goshippo\.com|api\.easypost\.com|ssapi\.shipstation\.com)\//.test(url)) {
    strayHost = url
    throw new Error(`a real address was called: ${url}`)
  }
  for (const r of routes) {
    const out = r(c)
    if (out) {
      if (out.delayMs) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, out.delayMs)
          init.signal?.addEventListener?.("abort", () => {
            clearTimeout(t)
            reject(new Error("aborted"))
          })
        })
      }
      return new Response(out.body === undefined ? "" : JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json", ...(out.headers ?? {}) } })
    }
  }
  return new Response(JSON.stringify({ message: "not stubbed" }), { status: 404 })
}) as typeof fetch
const reset = (r: Route[]) => {
  calls = []
  routes = r
}
const hit = (method: string, re: RegExp, status: number, body?: unknown, extra: { delayMs?: number } = {}): Route => (c) => (c.method === method && re.test(c.url) ? { status, body, ...extra } : null)

/* ── a store ─────────────────────────────────────────────────────────── */

const CREATOR = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const CHECKOUT = "33333333-3333-4333-8333-333333333333"
const LINE_A = "44444444-4444-4444-8444-444444444444"
const LINE_POD = "55555555-5555-4555-8555-555555555555"
const LOC = "66666666-6666-4666-8666-666666666666"
const PKG = "77777777-7777-4777-8777-777777777777"
const SHIPPO_KEY = "shippo_test_5f3b2c1d0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c"
const EASYPOST_KEY = "EZTK1234567890abcdef1234567890abcd"

function freshDb() {
  const db = new FakeSupabase()
  let n = 0
  const id = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`
  db.table("commerce_integrations", { unique: [["creator_id", "provider"]], defaults: () => ({ id: id(), config: {}, status: "disconnected" }) })
  db.table("inventory_locations", {}, [
    { id: LOC, creator_id: CREATOR, name: "Studio", address_line1: "100 Main St", address_line2: null, city: "Austin", region: "TX", postal_code: "78701", country: "US", phone: "5125550100", email: "ship@example.com", active: true, fulfills_orders: true, priority: 0, integration_id: null },
  ])
  db.table("shipping_packages", {}, [
    { id: "pkg-small", creator_id: CREATOR, name: "Mailer", kind: "envelope", length_mm: 300, width_mm: 200, height_mm: 0, weight_grams: 20, is_default: false, created_at: "2026-01-01T00:00:00Z" },
    { id: PKG, creator_id: CREATOR, name: "Small box", kind: "box", length_mm: 250, width_mm: 200, height_mm: 100, weight_grams: 150, is_default: true, created_at: "2026-01-02T00:00:00Z" },
  ])
  db.table("commerce_settings", {}, [{ creator_id: CREATOR, default_package_id: PKG, unit_system: "metric" }])
  db.table("orders", {}, [
    { id: LINE_A, checkout_id: CHECKOUT, variant_id: "v1", product_snapshot: { weight_grams: 400 } },
    { id: LINE_POD, checkout_id: CHECKOUT, variant_id: "v2", product_snapshot: { weight_grams: 300 } },
  ])
  db.table("product_variants", {}, [])
  db.table("shipping_labels", { unique: [["provider", "provider_shipment_id"]], defaults: () => ({ id: id(), status: "buying", created_at: new Date().toISOString(), fulfillment_id: null }) })
  db.table("commerce_order_events", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n }) })
  db.table("commerce_jobs", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n, status: "queued", attempts: 0 }) })
  db.table("commerce_checkouts", {}, [{ id: CHECKOUT, creator_id: CREATOR }])
  return db
}

function connect(db: FakeSupabase, provider: string, key: string, config: Record<string, unknown> = {}) {
  db.tables.commerce_integrations.push({ id: `int-${provider}`, creator_id: CREATOR, provider, category: "shipping", status: "connected", config, secret_ciphertext: sealSecret(key) })
}

/* ── the order engine, watched ───────────────────────────────────────── */

function makeOrder(): LabelOrder & ShipStationSourceOrder {
  return {
    id: CHECKOUT,
    status: "paid",
    currency: "USD",
    cancelledAt: null,
    deliveryMethod: "ship",
    buyerName: "Ada Buyer",
    buyerEmail: "ada@example.com",
    buyerPhone: "5125550199",
    address: { name: "Ada Buyer", line1: "1 Elm St", line2: "Apt 2", city: "Brooklyn", region: "New York", postalCode: "11201", country: "us" },
    shippingCents: 800,
    taxCents: 120,
    totalCents: 4920,
    buyerNote: "Leave at the door",
    createdAt: "2026-10-10T10:00:00.000Z",
    paidAt: "2026-10-10T10:01:00.000Z",
    delivery: { name: "Standard" },
    lines: [
      { orderId: LINE_A, title: "Mug", variantName: "Blue", sku: "MUG-BLUE", imageUrl: "https://cdn.example.com/mug.png", quantity: 2, unitCents: 2000, discountCents: 0, fulfilled: 0, requiresShipping: true, locationId: LOC, fulfillmentMethod: "self" },
      { orderId: LINE_POD, title: "Poster", variantName: null, sku: "POD-1", imageUrl: null, quantity: 1, unitCents: 1000, discountCents: 0, fulfilled: 0, requiresShipping: true, locationId: "pod-loc", fulfillmentMethod: "print_on_demand" },
    ],
    shipments: [],
  }
}

function engine() {
  const order = makeOrder()
  const log = { fulfil: [] as any[], update: [] as any[], events: [] as any[], jobs: [] as any[] }
  let nextShipment = 0
  const base = {
    loadOrder: async (_db: any, where: { creatorId: string; checkoutId: string }) => (where.creatorId === CREATOR && where.checkoutId === CHECKOUT ? structuredClone(order) : null),
    fulfilItems: async (_db: any, _c: string, _co: string, input: any) => {
      log.fulfil.push(input)
      for (const i of input.items) {
        const l = order.lines.find((x) => x.orderId === i.orderId)!
        if (i.quantity > l.quantity - l.fulfilled) return { ok: false as const, error: "Only 0 left to fulfil on that item." }
        l.fulfilled += i.quantity
      }
      order.shipments.push({ id: `ship-${++nextShipment}`, status: "shipped", trackingNumber: input.trackingNumber ?? null })
      return { ok: true as const, order: structuredClone(order) }
    },
    updateShipment: async (_db: any, _c: string, id: string, input: any) => {
      log.update.push({ id, ...input })
      const s = order.shipments.find((x) => x.id === id)!
      s.status = input.status
      return { ok: true as const, order: structuredClone(order) }
    },
    addOrderEvent: async (db: any, e: any) => {
      log.events.push(e)
      await db.from("commerce_order_events").insert({ checkout_id: e.checkoutId, creator_id: e.creatorId, kind: e.kind, message: e.message, detail: e.detail ?? null, idempotency_key: e.key ?? null })
    },
  }
  const label: LabelDeps = base
  const station: ShipStationDeps = {
    ...base,
    enqueue: async (db: any, j: any) => {
      log.jobs.push(j)
      await db.from("commerce_jobs").insert({ creator_id: j.creatorId, kind: j.kind, payload: j.payload, idempotency_key: j.key, run_after: j.runAfter?.toISOString?.() ?? null })
    },
    now: () => Date.parse("2026-10-12T12:00:00Z"),
  }
  return { order, log, label, station }
}

/* ── Shippo's and EasyPost's documented answers ──────────────────────── */

const shippoShipment = (reference: string) => ({
  object_id: "shp_7f3a",
  status: "SUCCESS",
  metadata: reference,
  messages: [],
  rates: [
    { object_id: "rate_ups_ground", shipment: "shp_7f3a", amount: "11.20", currency: "USD", provider: "UPS", servicelevel: { name: "Ground", token: "ups_ground" }, estimated_days: 4 },
    { object_id: "rate_usps_priority", shipment: "shp_7f3a", amount: "7.58", currency: "USD", provider: "USPS", servicelevel: { name: "Priority Mail", token: "usps_priority" }, estimated_days: 2 },
  ],
})
const shippoTransaction = { object_id: "txn_91c", status: "SUCCESS", tracking_number: "9400111899223197428490", tracking_url_provider: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490", label_url: "https://shippo-delivery-east.s3.amazonaws.com/label_91c.pdf", rate: "rate_usps_priority", messages: [] }
const shippoRoutes = (reference = `storelib:${CHECKOUT}`, address: { is_valid: boolean; messages: { text: string }[] } = { is_valid: true, messages: [] }): Route[] => [
  hit("POST", /goshippo\.com\/addresses\/$/, 201, { object_id: "adr_1", validation_results: address }),
  hit("POST", /goshippo\.com\/shipments\/$/, 201, shippoShipment(reference)),
  hit("GET", /goshippo\.com\/shipments\/shp_7f3a$/, 200, shippoShipment(reference)),
  hit("POST", /goshippo\.com\/transactions\/$/, 201, shippoTransaction),
  hit("POST", /goshippo\.com\/refunds\/$/, 201, { object_id: "rf_1", status: "QUEUED", transaction: "txn_91c" }),
]

/* ════════════════════════════════════════════════════════════════════ */

console.log("\nNot Coming soon any more\n")
{
  for (const id of ["shippo", "easypost", "shipstation"] as const) {
    const p = providerInfo(id)!
    check(`${p.name} connects (availability connect), with no "Not connected to Storelib yet"`, p.availability === "connect" && !/not connected to storelib yet/i.test(p.description))
    const i = integrationById(id)!
    check(`  its directory page is not Coming soon and says what flows`, i.comingSoon !== true && i.data.length >= 3 && i.about.length >= 3 && i.data.some((d) => /never sent back to your browser/.test(d)))
  }
  check("ShipStation asks for a key and a secret", providerInfo("shipstation")!.fields.join(",") === "api_key,api_secret" && /An API key, An API secret/.test(JSON.stringify(integrationById("shipstation")!.glance)))
  check("every other provider still Coming soon keeps saying so", PROVIDERS.filter((p) => p.availability === "needs_setup").every((p) => /Not connected to Storelib yet/.test(p.description)))
  check("the catalog lists each once", INTEGRATIONS.filter((i) => ["shippo", "easypost", "shipstation"].includes(i.id)).length === 3)
}

console.log("\nConnecting: checked with the provider, sealed, last four only\n")
{
  const db = freshDb()
  reset([hit("GET", /goshippo\.com\/carrier_accounts\//, 401, { detail: "Invalid token" })])
  const refused = await saveIntegration(db, CREATOR, "shippo", { apiKey: "shippo_live_badbadbadbad" })
  check("a key Shippo refuses is not saved", refused.ok === false && /did not accept/.test((refused as any).error) && db.rows("commerce_integrations").length === 0)

  reset([hit("GET", /goshippo\.com\/carrier_accounts\//, 503, {})])
  const down = await saveIntegration(db, CREATOR, "shippo", { apiKey: SHIPPO_KEY })
  check("a Shippo that is down is not saved as connected", down.ok === false && db.rows("commerce_integrations").length === 0)

  reset([hit("GET", /goshippo\.com\/carrier_accounts\/\?results=1$/, 200, { results: [] })])
  const ok = await saveIntegration(db, CREATOR, "shippo", { apiKey: SHIPPO_KEY })
  const row = db.rows("commerce_integrations")[0]
  check("an accepted key: connected, test mode, ShippoToken auth", ok.ok === true && row?.status === "connected" && row.config.mode === "test" && calls[0]?.headers.authorization === `ShippoToken ${SHIPPO_KEY}`)
  check("  sealed, never stored as typed", typeof row.secret_ciphertext === "string" && !row.secret_ciphertext.includes(SHIPPO_KEY) && openSecret(row.secret_ciphertext) === SHIPPO_KEY)
  const views = await loadIntegrations(db, CREATOR)
  const v = views.find((x) => x.provider === "shippo")!
  check("  the card gets the last four, never the key", v.keyHint === SHIPPO_KEY.slice(-4) && !JSON.stringify(views).includes(SHIPPO_KEY) && v.mode === "test" && v.labelsBought === 0)

  reset([hit("GET", /easypost\.com\/v2\/addresses\?page_size=1$/, 200, { addresses: [] })])
  const ep = await saveIntegration(db, CREATOR, "easypost", { apiKey: EASYPOST_KEY })
  check("EasyPost: Basic auth with the key, a test key said as one", ep.ok === true && calls[0]?.headers.authorization === `Basic ${Buffer.from(`${EASYPOST_KEY}:`).toString("base64")}` && db.rows("commerce_integrations").find((r) => r.provider === "easypost")?.config.mode === "test")

  reset([])
  const half = await saveIntegration(db, CREATOR, "shipstation", { apiKey: "ss_key_0123456789" })
  check("ShipStation without its secret is refused, nothing called", half.ok === false && /API secret/.test((half as any).error) && calls.length === 0)

  reset([hit("GET", /ssapi\.shipstation\.com\/stores/, 200, [{ storeId: 1, storeName: "Manual Orders" }]), hit("POST", /ssapi\.shipstation\.com\/webhooks\/subscribe$/, 201, { id: 72190 })])
  const ss = await saveIntegration(db, CREATOR, "shipstation", { apiKey: "ss_key_0123456789", apiSecret: "ss_secret_9876543210" })
  const ssRow = db.rows("commerce_integrations").find((r) => r.provider === "shipstation")!
  const sub = calls.find((c) => /webhooks\/subscribe/.test(c.url))
  check("ShipStation: Basic key:secret, connected with its stores counted", ss.ok === true && calls[0]?.headers.authorization === `Basic ${Buffer.from("ss_key_0123456789:ss_secret_9876543210").toString("base64")}` && ssRow.status === "connected" && ssRow.account_label === "1 store in ShipStation")
  check("  SHIP_NOTIFY subscribed to Storelib's own address for this store", sub?.body.event === "SHIP_NOTIFY" && sub?.body.target_url === shipStationNotifyUrl(CREATOR) && ssRow.config.webhooks === "on" && ssRow.config.webhook_id === "72190")
  const token = shipStationNotifyUrl(CREATOR).split("/").pop()!
  check("  the address's token is Storelib's alone, for ShipStation alone", readWebhookToken("shipstation", token) === CREATOR && readWebhookToken("printify", token) === null && readWebhookToken("shipstation", `${CREATOR}.forged`) === null)
  check("  the hint is the secret's last four, the pair never leaves", (await loadIntegrations(db, CREATOR)).find((x) => x.provider === "shipstation")!.keyHint === "3210")

  reset([hit("DELETE", /ssapi\.shipstation\.com\/webhooks\/72190$/, 200, {})])
  const off = await saveIntegration(db, CREATOR, "shipstation", { disconnect: true })
  check("disconnecting removes the webhook at ShipStation, then the row", off.ok === true && calls.some((c) => c.method === "DELETE" && /webhooks\/72190$/.test(c.url)) && !db.rows("commerce_integrations").some((r) => r.provider === "shipstation"))

  reset([hit("GET", /ssapi\.shipstation\.com\/stores/, 200, []), hit("POST", /webhooks\/subscribe$/, 400, { Message: "target_url must be public" })])
  await saveIntegration(db, CREATOR, "shipstation", { apiKey: "ss_key_0123456789", apiSecret: "ss_secret_9876543210" })
  const noHook = db.rows("commerce_integrations").find((r) => r.provider === "shipstation")!
  check("a webhook ShipStation won't take: still connected, polling said on the card", noHook.status === "connected" && noHook.config.webhooks === "off" && /every few hours/.test(noHook.config.webhook_note))
}

console.log("\nBuy a label with Shippo\n")
{
  const db = freshDb()
  connect(db, "shippo", SHIPPO_KEY)
  const e = engine()
  reset([])
  const opts = await labelOptions(db, CREATOR, CHECKOUT, { locationId: LOC, storeName: "Mara's Mugs" }, e.label)
  const o = opts as any
  check("the dialog's read: Shippo (test), the default box first, the items' weight as sold", o.apps?.[0]?.id === "shippo" && o.apps[0].test === true && o.packages[0].id === PKG && o.defaultPackageId === PKG && o.itemsGrams === 800 && calls.length === 0)
  check("  from the location's own address, to the order's", /100 Main St/.test(o.from.line) && o.from.address !== null && o.to.complete === true && /1 Elm St/.test(o.to.line))

  reset(shippoRoutes(`storelib:${CHECKOUT}`, { is_valid: false, messages: [{ text: "Apartment number missing or invalid" }] }))
  const q = (await quoteLabel(db, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "Mara's Mugs" }, e.label)) as any
  const ship = calls.find((c) => /shipments\/$/.test(c.url))!
  check("rates for this parcel: the box's size in cm, items plus box in grams", ship.body.parcels[0].length === "25" && ship.body.parcels[0].width === "20" && ship.body.parcels[0].height === "10" && ship.body.parcels[0].weight === "950" && ship.body.parcels[0].mass_unit === "g")
  check("  from the location, to the buyer (state as its code), tagged with the order", ship.body.address_from.street1 === "100 Main St" && ship.body.address_from.state === "TX" && ship.body.address_to.state === "NY" && ship.body.address_to.country === "US" && ship.body.metadata === `storelib:${CHECKOUT}`)
  check("  cheapest first, priced in cents", q.rates?.[0]?.id === "rate_usps_priority" && q.rates[0].cents === 758 && q.rates[0].price === "$7.58" && q.rates[1].cents === 1120)
  check("  the address checked first: Shippo's warning shown above the rates", q.addressOk === false && q.warnings.includes("Apartment number missing or invalid") && calls.some((c) => /addresses\/$/.test(c.url) && c.body.validate === true))

  reset(shippoRoutes(`storelib:${OTHER}`))
  const wrong = await buyLabel(db, CREATOR, CHECKOUT, { provider: "shippo", shipmentId: "shp_7f3a", rateId: "rate_usps_priority", locationId: LOC }, e.label)
  check("a rate quoted for another order is never bought", wrong.ok === false && (wrong as any).status === 409 && !calls.some((c) => /transactions/.test(c.url)) && db.rows("shipping_labels").length === 0)

  reset(shippoRoutes())
  const bought = (await buyLabel(db, CREATOR, CHECKOUT, { provider: "shippo", shipmentId: "shp_7f3a", rateId: "rate_usps_priority", locationId: LOC, notifyBuyer: true }, e.label)) as any
  const txn = calls.find((c) => /transactions\/$/.test(c.url))
  check("the rate is read back from Shippo, then bought as a PDF", calls.some((c) => c.method === "GET" && /shipments\/shp_7f3a$/.test(c.url)) && txn?.body.rate === "rate_usps_priority" && txn?.body.label_file_type === "PDF_4x6")
  check("the label: USPS Priority Mail, its tracking number and PDF, $7.58 kept as the seller's cost", bought.ok === true && bought.label.carrier === "USPS" && bought.label.trackingNumber === "9400111899223197428490" && bought.label.labelUrl === shippoTransaction.label_url && bought.label.cents === 758 && bought.label.status === "purchased" && bought.label.testMode === true)
  const f = e.log.fulfil[0]
  check("the items ship with that carrier and number, the buyer emailed", f?.carrier === "USPS" && f.trackingNumber === "9400111899223197428490" && f.notifyBuyer === true && f.items.length === 1 && f.items[0].orderId === LINE_A && f.items[0].quantity === 2 && f.locationId === LOC)
  check("  the carrier's own tracking link is used (none passed, so USPS's is made)", f.trackingUrl === null)
  check("  the label is tied to the shipment it made", db.rows("shipping_labels")[0].fulfillment_id === "ship-1" && bought.label.fulfillmentId === "ship-1")
  const ev = e.log.events.find((x) => x.kind === "label.purchased")
  check("the timeline says it, with the cost as the seller's, not the buyer's", /\$7\.58/.test(ev?.message) && /not charged to the buyer/.test(ev?.message) && ev?.detail.cost_cents === 758)
  check("the card counts it and notes the time", db.rows("commerce_integrations")[0].config.labels_bought === 1 && !!db.rows("commerce_integrations")[0].last_sync_at)

  reset(shippoRoutes())
  const again = (await buyLabel(db, CREATOR, CHECKOUT, { provider: "shippo", shipmentId: "shp_7f3a", rateId: "rate_usps_priority", locationId: LOC }, e.label)) as any
  check("pressing Buy again buys nothing: the same label comes back", again.ok === true && again.label.id === bought.label.id && !calls.some((c) => /transactions/.test(c.url)) && db.rows("shipping_labels").length === 1)

  /* Void: unused, so refunded and its shipment cancelled. */
  reset(shippoRoutes())
  const voided = (await voidLabel(db, CREATOR, bought.label.id, e.label)) as any
  check("void: Shippo is asked to refund that transaction", calls.some((c) => /refunds\/$/.test(c.url) && c.body.transaction === "txn_91c"))
  check("  the label waits on the carrier (QUEUED), its shipment cancelled without an email", voided.ok === true && voided.label.status === "void_pending" && e.log.update[0]?.status === "cancelled" && e.log.update[0]?.notifyBuyer === false)
  check("  and the timeline says the refund comes once the carrier confirms", e.log.events.some((x) => x.kind === "label.voided" && /refunds \$7\.58/.test(x.message)))
}

console.log("\nA label is not voided once the parcel moved\n")
{
  const db = freshDb()
  connect(db, "shippo", SHIPPO_KEY)
  const e = engine()
  reset(shippoRoutes())
  const b = (await buyLabel(db, CREATOR, CHECKOUT, { provider: "shippo", shipmentId: "shp_7f3a", rateId: "rate_usps_priority", locationId: LOC }, e.label)) as any
  e.order.shipments[0].status = "in_transit"
  reset(shippoRoutes())
  const r = await voidLabel(db, CREATOR, b.label.id, e.label)
  check("in transit: refused, nothing asked of Shippo", r.ok === false && /already with the carrier/.test((r as any).error) && calls.length === 0)
  const other = await voidLabel(db, OTHER, b.label.id, e.label)
  check("another store's label is not found", other.ok === false && (other as any).status === 404)
}

console.log("\nShippo says no, and a missing table\n")
{
  const db = freshDb()
  connect(db, "shippo", SHIPPO_KEY)
  const e = engine()
  reset([...shippoRoutes().filter((_, i) => i !== 3), hit("POST", /transactions\/$/, 201, { object_id: "txn_x", status: "ERROR", messages: [{ text: "Insufficient postage balance" }] })])
  const r = await buyLabel(db, CREATOR, CHECKOUT, { provider: "shippo", shipmentId: "shp_7f3a", rateId: "rate_usps_priority", locationId: LOC }, e.label)
  check("a failed purchase says Shippo's words, ships nothing, keeps no row", r.ok === false && /Insufficient postage balance/.test((r as any).error) && e.log.fulfil.length === 0 && db.rows("shipping_labels").length === 0)
  check("  and the card shows the error", /Insufficient postage balance/.test(db.rows("commerce_integrations")[0].last_error))

  const noTable = freshDb()
  delete (noTable as any).tables.shipping_labels
  connect(noTable, "shippo", SHIPPO_KEY)
  reset([])
  const opts = (await labelOptions(noTable, CREATOR, CHECKOUT, { locationId: LOC, storeName: "S" }, engine().label)) as any
  check("before SQL part 163 the dialog says so and buys nothing", opts.ready === false && opts.labels?.length === 0)

  const none = freshDb()
  reset([])
  const q = await quoteLabel(none, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "S" }, engine().label)
  check("not connected: asks to connect, calls nothing", "error" in q && /Connect Shippo/.test(q.error) && calls.length === 0)

  const pickup = engine()
  ;(pickup.order as any).deliveryMethod = "pickup"
  connect(none, "shippo", SHIPPO_KEY)
  const pq = await quoteLabel(none, CREATOR, CHECKOUT, { provider: "shippo", locationId: LOC, packageId: PKG, storeName: "S" }, pickup.label)
  check("a pickup order needs no label", "error" in pq && /picked up/.test(pq.error))
}

console.log("\nBuy a label with EasyPost\n")
{
  const db = freshDb()
  connect(db, "easypost", EASYPOST_KEY)
  const e = engine()
  const shipment = { id: "shp_ep1", reference: `storelib:${CHECKOUT}`, messages: [], rates: [{ id: "rate_ep_pri", shipment_id: "shp_ep1", carrier: "USPS", service: "Priority", rate: "8.10", currency: "USD", delivery_days: 2 }] }
  reset([
    hit("POST", /easypost\.com\/v2\/addresses$/, 200, { id: "adr_1", verifications: { delivery: { success: true, errors: [] } } }),
    hit("POST", /easypost\.com\/v2\/shipments$/, 200, shipment),
    hit("GET", /easypost\.com\/v2\/shipments\/shp_ep1$/, 200, shipment),
    hit("POST", /easypost\.com\/v2\/shipments\/shp_ep1\/buy$/, 200, { id: "shp_ep1", tracking_code: "9405500000000000000001", selected_rate: { id: "rate_ep_pri", carrier: "USPS", service: "Priority", rate: "8.10", currency: "USD" }, postage_label: { label_url: "https://easypost-files.s3.amazonaws.com/label.png", label_pdf_url: "https://easypost-files.s3.amazonaws.com/label.pdf" }, tracker: { public_url: "https://track.easypost.com/abc" } }),
    hit("POST", /easypost\.com\/v2\/shipments\/shp_ep1\/refund$/, 200, { id: "shp_ep1", refund_status: "refunded" }),
  ])
  const q = (await quoteLabel(db, CREATOR, CHECKOUT, { provider: "easypost", locationId: LOC, packageId: null, custom: { lengthCm: 30, widthCm: 20, heightCm: 10 }, grams: 1000, storeName: "S" }, e.label)) as any
  const made = calls.find((c) => /v2\/shipments$/.test(c.url))!
  check("a custom size and weight, in inches and ounces as EasyPost takes them, a PDF asked for", made.body.shipment.parcel.length === 11.8 && made.body.shipment.parcel.width === 7.9 && made.body.shipment.parcel.height === 3.9 && made.body.shipment.parcel.weight === 35.3 && made.body.shipment.options.label_format === "PDF" && made.body.shipment.reference === `storelib:${CHECKOUT}`)
  check("  the address verified for delivery, and fine", calls.some((c) => /v2\/addresses$/.test(c.url) && c.body.verify[0] === "delivery") && q.addressOk === true && q.warnings.length === 0)
  const b = (await buyLabel(db, CREATOR, CHECKOUT, { provider: "easypost", shipmentId: q.shipmentId, rateId: q.rates[0].id, locationId: LOC }, e.label)) as any
  check("bought: the PDF label, EasyPost's tracking code, $8.10", b.ok === true && b.label.labelUrl === "https://easypost-files.s3.amazonaws.com/label.pdf" && b.label.trackingNumber === "9405500000000000000001" && b.label.cents === 810 && calls.some((c) => /\/buy$/.test(c.url) && c.body.rate.id === "rate_ep_pri"))
  const v = (await voidLabel(db, CREATOR, b.label.id, e.label)) as any
  check("voided at once when EasyPost says refunded", v.ok === true && v.label.status === "voided")
}

console.log("\nShipStation: orders out\n")
{
  const db = freshDb()
  connect(db, "shipstation", "ss_key_0123456789:ss_secret_9876543210", { webhooks: "on", webhook_id: "1" })
  const e = engine()
  const body = shipStationOrderFor(e.order, new Map([[LINE_A, 400]]))!
  check("the order as createorder takes it: its key, number, status and buyer", body.orderKey === externalIdOf(CHECKOUT) && /^\d+$/.test(body.orderNumber) && body.orderStatus === "awaiting_shipment" && body.customerEmail === "ada@example.com" && body.shipTo.state === "NY" && body.shipTo.country === "US" && body.shipTo.street2 === "Apt 2")
  check("  only what the seller ships: the print on demand poster stays out", body.items.length === 1 && body.items[0].sku === "MUG-BLUE" && body.items[0].lineItemKey === externalIdOf(LINE_A) && body.items[0].quantity === 2 && body.items[0].unitPrice === 20 && body.items[0].weight?.value === 400)
  check("  totals in dollars, the delivery chosen, the buyer's note", body.amountPaid === 49.2 && body.shippingAmount === 8 && body.taxAmount === 1.2 && body.requestedShippingService === "Standard" && body.customerNotes === "Leave at the door" && body.weight?.value === 800)

  await queueShipStation(db, CHECKOUT, CREATOR, "paid", e.station)
  check("a paid order is queued when ShipStation is connected", e.log.jobs[0]?.kind === "shipstation_push" && e.log.jobs[0].payload.reason === "paid")
  const unconnected = freshDb()
  const e2 = engine()
  await queueShipStation(unconnected, CHECKOUT, CREATOR, "paid", e2.station)
  check("  and nothing is queued when it is not", e2.log.jobs.length === 0)

  reset([hit("POST", /ssapi\.shipstation\.com\/orders\/createorder$/, 200, { orderId: 94113592, orderKey: externalIdOf(CHECKOUT) })])
  await pushToShipStation(db, { checkoutId: CHECKOUT, creatorId: CREATOR, reason: "address" }, e.station)
  check("a change to an order ShipStation never had sends nothing", calls.length === 0)
  await pushToShipStation(db, { checkoutId: CHECKOUT, creatorId: CREATOR, reason: "paid" }, e.station)
  const sent = calls.find((c) => /createorder/.test(c.url))
  check("paid: created in ShipStation, said on the timeline, counted on the card", !!sent && sent.body.orderKey === externalIdOf(CHECKOUT) && e.log.events.some((x) => x.kind === "fulfillment.forwarded" && /ShipStation/.test(x.message)) && db.rows("commerce_integrations")[0].config.orders_sent === 1)
  check("  a check on its shipments is booked as a backstop", e.log.jobs.some((j) => j.kind === "shipstation_sync" && j.payload.orderId === "94113592" && j.runAfter))
  reset([hit("POST", /createorder$/, 200, { orderId: 94113592 })])
  await pushToShipStation(db, { checkoutId: CHECKOUT, creatorId: CREATOR, reason: "paid" }, e.station)
  check("  sent once: a second paid job sends nothing", calls.length === 0)

  e.order.address = { ...e.order.address, line1: "9 New Rd" }
  reset([hit("POST", /createorder$/, 200, { orderId: 94113592 })])
  await pushToShipStation(db, { checkoutId: CHECKOUT, creatorId: CREATOR, reason: "address" }, e.station)
  check("a new address updates the same ShipStation order", calls[0]?.body.shipTo.street1 === "9 New Rd" && calls[0]?.body.orderKey === externalIdOf(CHECKOUT))
  e.order.cancelledAt = "2026-10-12T09:00:00Z"
  reset([hit("POST", /createorder$/, 200, { orderId: 94113592 })])
  await pushToShipStation(db, { checkoutId: CHECKOUT, creatorId: CREATOR, reason: "cancelled" }, e.station)
  check("a cancellation is sent as cancelled", calls[0]?.body.orderStatus === "cancelled" && e.log.events.some((x) => /Cancelled in ShipStation/.test(x.message)))

  const e3 = engine()
  const db3 = freshDb()
  connect(db3, "shipstation", "ss_key_0123456789:ss_secret_9876543210")
  reset([hit("POST", /createorder$/, 429, { Message: "Too many requests" })])
  let threw = false
  try {
    await pushToShipStation(db3, { checkoutId: CHECKOUT, creatorId: CREATOR, reason: "paid" }, e3.station)
  } catch {
    threw = true
  }
  check("ShipStation busy (429): the job is tried again later", threw && !e3.log.events.some((x) => x.kind === "fulfillment.forwarded"))
  reset([hit("POST", /createorder$/, 400, { Message: "Invalid country code" })])
  await pushToShipStation(db3, { checkoutId: CHECKOUT, creatorId: CREATOR, reason: "paid" }, e3.station)
  check("ShipStation says no: the order says so and the card shows it", e3.log.events.some((x) => x.kind === "fulfillment.manual_needed" && /Invalid country code/.test(x.message)) && /Invalid country code/.test(db3.rows("commerce_integrations")[0].last_error))
}

console.log("\nShipStation: tracking back\n")
{
  const db = freshDb()
  connect(db, "shipstation", "ss_key_0123456789:ss_secret_9876543210", { webhooks: "on" })
  const e = engine()
  const shipment = { shipmentId: 33974374, orderId: 94113592, orderKey: externalIdOf(CHECKOUT), trackingNumber: "1Z999AA10123456784", carrierCode: "ups_walleted", serviceCode: "ups_ground", voided: false, shipmentCost: 9.4, shipmentItems: [{ lineItemKey: externalIdOf(LINE_A), quantity: 1 }] }
  check("ShipStation's carrier codes as the buyer reads them", carrierFromCode("stamps_com") === "USPS" && carrierFromCode("ups_walleted") === "UPS" && carrierFromCode("fedex") === "FedEx" && carrierFromCode("dhl_express_worldwide") === "DHL Express")
  check("only ssapi.shipstation.com is ever read with the key", isShipStationResource("https://ssapi.shipstation.com/shipments?batchId=1") && !isShipStationResource("https://evil.example.com/shipments") && !isShipStationResource("http://ssapi.shipstation.com/x") && !isShipStationResource("https://user:pw@ssapi.shipstation.com/x"))

  reset([])
  const foreign = await handleShipNotify(db, { creatorId: CREATOR, raw: JSON.stringify({ resource_type: "SHIP_NOTIFY", resource_url: "https://evil.example.com/shipments" }) }, e.station)
  check("a webhook naming another host: nothing read, nothing shipped", foreign.status === 200 && calls.length === 0 && e.log.fulfil.length === 0)

  reset([hit("GET", /ssapi\.shipstation\.com\/shipments\?/, 200, { shipments: [shipment], total: 1, page: 1, pages: 1 })])
  const r = await handleShipNotify(db, { creatorId: CREATOR, raw: JSON.stringify({ resource_type: "SHIP_NOTIFY", resource_url: "https://ssapi.shipstation.com/shipments?batchId=12345&includeShipmentItems=False" }) }, e.station)
  check("SHIP_NOTIFY: the shipments read from ShipStation with the key, items included", r.status === 200 && /includeShipmentItems=True/.test(calls[0]?.url) && /^Basic /.test(calls[0]?.headers.authorization ?? ""))
  const f = e.log.fulfil[0]
  check("  the box's items ship with UPS and its number, the buyer emailed, said as ShipStation", f?.carrier === "UPS" && f.trackingNumber === "1Z999AA10123456784" && f.items.length === 1 && f.items[0].quantity === 1 && f.notifyBuyer === true && f.partner?.name === "ShipStation" && (r.body as any).shipped === 1)
  const again = await handleShipNotify(db, { creatorId: CREATOR, raw: JSON.stringify({ resource_type: "SHIP_NOTIFY", resource_url: "https://ssapi.shipstation.com/shipments?batchId=12345" }) }, e.station)
  check("  told twice, shipped once", (again.body as any).shipped === 0 && e.log.fulfil.length === 1)

  reset([hit("GET", /shipments\?/, 200, { shipments: [{ ...shipment, voided: true }] })])
  await handleShipNotify(db, { creatorId: CREATOR, raw: JSON.stringify({ resource_type: "SHIP_NOTIFY", resource_url: "https://ssapi.shipstation.com/shipments?batchId=12346" }) }, e.station)
  check("a label voided in ShipStation cancels the shipment it made, quietly", e.log.update[0]?.status === "cancelled" && e.log.update[0]?.notifyBuyer === false)

  const other = engine()
  reset([hit("GET", /shipments\?/, 200, { shipments: [{ ...shipment, orderKey: externalIdOf("99999999-9999-4999-8999-999999999999") }] })])
  await handleShipNotify(db, { creatorId: CREATOR, raw: JSON.stringify({ resource_type: "SHIP_NOTIFY", resource_url: "https://ssapi.shipstation.com/shipments?batchId=9" }) }, other.station)
  check("a shipment for an order that isn't this store's is ignored", other.log.fulfil.length === 0)

  reset([hit("GET", /shipments\?/, 503, {})])
  const busy = await handleShipNotify(db, { creatorId: CREATOR, raw: JSON.stringify({ resource_type: "SHIP_NOTIFY", resource_url: "https://ssapi.shipstation.com/shipments?batchId=10" }) }, engine().station)
  check("ShipStation down: 503, so it sends the webhook again", busy.status === 503)
  const gone = await handleShipNotify(freshDb(), { creatorId: CREATOR, raw: "{}" }, engine().station)
  check("not connected: 410", gone.status === 410)

  const p = engine()
  reset([hit("GET", /ssapi\.shipstation\.com\/shipments\?orderId=94113592&includeShipmentItems=true$/, 200, { shipments: [{ ...shipment, shipmentItems: [] }] })])
  await syncShipStation(db, { creatorId: CREATOR, checkoutId: CHECKOUT, orderId: "94113592", round: 1 }, p.station)
  check("polling: a shipment with no item list ships the seller's open items", p.log.fulfil[0]?.items.length === 1 && p.log.fulfil[0].items[0].orderId === LINE_A && p.log.fulfil[0].items[0].quantity === 2)
  check("  and stops once everything it ships has shipped", !p.log.jobs.some((j) => j.kind === "shipstation_sync"))
  const pending = engine()
  reset([hit("GET", /shipments\?orderId/, 200, { shipments: [] })])
  await syncShipStation(db, { creatorId: CREATOR, checkoutId: CHECKOUT, orderId: "94113592", round: 2 }, pending.station)
  check("  nothing shipped yet: the next look is booked", pending.log.jobs.some((j) => j.kind === "shipstation_sync" && j.payload.round === 3))
  const s = readShipment({ shipmentId: 1, trackingNumber: " 123 ", carrierCode: "stamps_com", shipmentCost: 4.25 })
  check("a shipment read: trimmed number, USPS, cost in cents", s?.trackingNumber === "123" && s.carrier === "USPS" && s.costCents === 425)
  void applyShipments
}

console.log("\nCarrier calculated rates at checkout\n")
{
  const profile: ShippingProfile = {
    id: "p1",
    name: "General",
    isDefault: true,
    zones: [
      {
        id: "z1",
        profileId: "p1",
        name: "US",
        countries: ["US"],
        regions: [],
        restOfWorld: false,
        rates: [
          { id: "flat", zoneId: "z1", name: "Standard", kind: "flat", priceCents: 900, minValue: null, maxValue: null, tiers: [], freeOverCents: null, minDays: 3, maxDays: 5, active: true, position: 0 },
          { id: "live", zoneId: "z1", name: "USPS Priority", kind: "carrier", priceCents: 0, minValue: null, maxValue: null, tiers: [], freeOverCents: null, minDays: 1, maxDays: 3, active: true, position: 1, carrier: "shippo", serviceCode: "usps_priority" },
        ],
      },
    ],
  }
  const lines = [{ shippingProfileId: null, quantity: 2, lineCents: 4000, weightGrams: 400, requiresShipping: true }]
  const offered = [
    { id: "a", shipmentId: "s", carrier: "UPS", service: "Ground", serviceCode: "ups_ground", cents: 1120, currency: "USD", days: 4 },
    { id: "b", shipmentId: "s", carrier: "USPS", service: "Priority Mail", serviceCode: "usps_priority", cents: 758, currency: "USD", days: 2 },
  ]
  check("the service named on the rate, else the cheapest, in the checkout's currency only", pickCarrierRate({ serviceCode: "usps_priority" }, offered, "usd")?.cents === 758 && pickCarrierRate({ serviceCode: null }, offered, "USD")?.cents === 758 && pickCarrierRate({ serviceCode: "ups_ground" }, offered, "USD")?.cents === 1120 && pickCarrierRate({ serviceCode: null }, offered, "RON") === null)

  const db = freshDb()
  connect(db, "shippo", SHIPPO_KEY)
  forgetCarrierQuotes()
  reset([hit("POST", /goshippo\.com\/shipments\/$/, 201, shippoShipment("storelib:checkout"))])
  const quotes = await liveCarrierQuotes(db, { creatorId: CREATOR, profiles: [profile], destination: { country: "US", region: "NY", postalCode: "11201" }, grams: 800, currency: "usd" })
  const asked = calls[0]
  check("priced live: the default box and the cart's weight, from the location, to the buyer's postal code", quotes.get("live") === 758 && asked?.body.parcels[0].weight === "950" && asked.body.address_to.zip === "11201" && asked.body.address_from.street1 === "100 Main St")
  const q = quoteDelivery([profile], lines, { country: "US" }, quotes)
  check("  the checkout offers it beside the zone's flat rate", q.ok && q.required && q.options.some((o) => o.name === "USPS Priority" && o.priceCents === 758) && q.options.some((o) => o.name === "Standard"))
  reset([])
  const kept = await liveCarrierQuotes(db, { creatorId: CREATOR, profiles: [profile], destination: { country: "US", region: "NY", postalCode: "11201" }, grams: 800, currency: "usd" })
  check("  asked again (the re-quote when paying): the same price, Shippo not asked twice", kept.get("live") === 758 && calls.length === 0)

  forgetCarrierQuotes()
  reset([hit("POST", /goshippo\.com\/shipments\/$/, 201, shippoShipment("x"), { delayMs: CARRIER_TIMEOUT_MS + 2000 })])
  const started = Date.now()
  const slow = await liveCarrierQuotes(db, { creatorId: CREATOR, profiles: [profile], destination: { country: "US", postalCode: "11201" }, grams: 800, currency: "usd" })
  const took = Date.now() - started
  const fallback = quoteDelivery([profile], lines, { country: "US" }, slow)
  check(`Shippo too slow: given up after ${CARRIER_TIMEOUT_MS}ms, the live rate left out, Standard still offered`, slow.size === 0 && took < CARRIER_TIMEOUT_MS + 1500 && fallback.ok && fallback.required && fallback.options.length === 1 && fallback.options[0].name === "Standard", { took })

  forgetCarrierQuotes()
  reset([hit("POST", /goshippo\.com\/shipments\/$/, 500, {})])
  const down = await liveCarrierQuotes(db, { creatorId: CREATOR, profiles: [profile], destination: { country: "US", postalCode: "11201" }, grams: 800, currency: "usd" })
  check("Shippo down: left out, never guessed", down.size === 0)

  reset([])
  const flatOnly = { ...profile, zones: [{ ...profile.zones[0], rates: [profile.zones[0].rates[0]] }] }
  const noCall = await liveCarrierQuotes(db, { creatorId: CREATOR, profiles: [flatOnly], destination: { country: "US", postalCode: "11201" }, grams: 800, currency: "usd" })
  check("a zone with no carrier rate: no call at all", noCall.size === 0 && calls.length === 0)
  const elsewhere = await liveCarrierQuotes(db, { creatorId: CREATOR, profiles: [profile], destination: { country: "FR", postalCode: "75001" }, grams: 800, currency: "usd" })
  check("an address outside the zone: no call at all", elsewhere.size === 0 && calls.length === 0)
}

console.log("\nPieces\n")
{
  check("money: minor units, zero decimal currencies, formatted", toMinor("7.58", "USD") === 758 && toMinor("1200", "JPY") === 1200 && toMinor("-1", "USD") === null && formatMinor(758, "USD") === "$7.58")
  check("a parcel: an envelope gets a little height, nothing without weight", parcelOf({ lengthMm: 300, widthMm: 200, heightMm: 0 }, null, 100)?.heightCm === 0.5 && parcelOf({ lengthMm: 300, widthMm: 200, heightMm: 10 }, null, 0) === null && parcelOf(null, { lengthCm: 0, widthCm: 1, heightCm: 1 }, 100) === null)
}

console.log("\nWired where it says\n")
{
  const panel = read("components/physical/order-panel.tsx")
  const buy = read("components/physical/buy-label.tsx")
  check("Fulfill items has Add tracking or Buy a label", /<ShipModeSwitch flow=\{flow\} \/>/.test(panel) && /"Add tracking" : "Buy a label"/.test(buy) && /<LabelFields flow=\{flow\} \/>/.test(panel))
  check("  Get rates, then Buy label at the rate's price; Print label after", /"Get rates"/.test(buy) && /Buy label · \$\{rate\.price\}/.test(buy) && /Print label/.test(buy) && /window\.open\(r\.data\.label\.labelUrl/.test(buy))
  check("  each shipment with a label can print it and void it", /label: "Print label"/.test(panel) && /label: "Void label"/.test(panel) && /data-shipment-label/.test(panel))
  check("the label route is the seller's own, rate limited", existsSync("app/api/physical/orders/[id]/label/route.ts") && /physicalCaller\("orders"\)/.test(read("app/api/physical/orders/[id]/label/route.ts")) && /bucket: "physical-label"/.test(read("app/api/physical/orders/[id]/label/route.ts")))
  const hook = read("app/api/integrations/shipstation/[token]/route.ts")
  check("SHIP_NOTIFY route: token checked, rate limited, body size capped", /readWebhookToken\("shipstation", token\)/.test(hook) && /rateLimit\(/.test(hook) && /16_000/.test(hook))
  const jobs = read("lib/physical/jobs-server.ts")
  check("the job queue runs ShipStation's two jobs", /case "shipstation_push":/.test(jobs) && /case "shipstation_sync":/.test(jobs))
  check("paid orders, cancellations and new addresses reach ShipStation", /queueShipStation\(db, co\.id, co\.creator_id, "paid"/.test(read("lib/physical/checkout-server.ts")) && /e\.kind === "order\.cancelled" \|\| e\.kind === "order\.address_changed"/.test(read("lib/physical/events-server.ts")))
  check("checkout prices carrier calculated rates live", /liveCarrierQuotes\(db,/.test(read("lib/physical/checkout-pricing-server.ts")) && /carrierQuotes,\n/.test(read("lib/physical/checkout-pricing-server.ts")))
  check("Settings offers Carrier calculated with Shippo or EasyPost", /"item_weight", "carrier"\]/.test(read("components/physical/shipping-settings.tsx")) && /data-rate-carrier/.test(read("components/physical/shipping-settings.tsx")))
  const market = read("components/physical/integrations-marketplace.tsx")
  check("the card: a secret field for ShipStation, facts for each app", /data-integration-secret/.test(market) && /<ShippingAppFacts/.test(market) && /Labels bought/.test(read("components/physical/shipping-app-facts.tsx")) && /Orders sent/.test(read("components/physical/shipping-app-facts.tsx")))
  const sql = read("supabase/sql/run-now/163_shipping_labels_and_shipstation.sql")
  check("SQL part 163: the labels table, one label per shipment, server only, job kinds let in", /CREATE TABLE IF NOT EXISTS public\.shipping_labels/.test(sql) && /shipping_labels_shipment_key ON public\.shipping_labels \(provider, provider_shipment_id\)/.test(sql) && /REVOKE ALL ON public\.shipping_labels FROM anon, authenticated/.test(sql) && /commerce_jobs_kind_check CHECK \(kind ~/.test(sql) && /notify pgrst, 'reload schema';\n?$/.test(sql))
  check("  one statement a line, in the README, checked after", sql.trim().split("\n").every((l) => l.startsWith("/*") || /;$/.test(l)) && /163_shipping_labels_and_shipstation\.sql/.test(read("supabase/sql/run-now/README.md")) && /p163_shipping_labels_and_shipstation/.test(read("supabase/sql/run-now/99_check_after.sql")) && existsSync("supabase/migrations/20270112_shipping_labels_and_shipstation.sql"))
  const mine = ["lib/integrations/shipping/types.ts", "lib/integrations/shipping/shippo.ts", "lib/integrations/shipping/easypost.ts", "lib/integrations/shipping/shipstation.ts", "lib/integrations/shipping/labels-server.ts", "lib/integrations/shipping/shipstation-server.ts", "lib/integrations/shipping/connect-server.ts", "lib/integrations/shipping/checkout-rates-server.ts", "lib/integrations/shipping/money.ts", "components/physical/buy-label.tsx", "components/physical/shipping-app-facts.tsx", "app/api/physical/orders/[id]/label/route.ts", "app/api/integrations/shipstation/[token]/route.ts", "supabase/sql/run-now/163_shipping_labels_and_shipstation.sql"]
  const banned = /—|\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform)\b/i
  const bad = mine.filter((f) => banned.test(read(f)))
  check("no em dash and none of the banned words in this work", bad.length === 0, bad)
  check("server files say server-only", mine.filter((f) => /-server\.ts$/.test(f)).every((f) => read(f).startsWith('import "server-only"')))
}

check("no address outside the three APIs was ever called", strayHost === null, strayHost)
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
