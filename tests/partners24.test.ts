/**
 * Round 24: Gelato and CJ Dropshipping take paid orders and send tracking
 * back, built the way Printful and Printify are (lib/integrations/fulfilment).
 * Every call to Gelato and CJ is answered by a stub of their documented APIs:
 * Gelato's Order API v4, product and shipment APIs, and CJ's API 2.0. Any
 * other address called fails the suite; nothing real is ever reached.
 *
 *   node scripts/run-push-tests.mjs   (this suite is in SUITES)
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { INTEGRATIONS, integrationById } from "@/lib/integrations/catalog"
import { PROVIDERS } from "@/lib/physical/providers"
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import { loadIntegrations, saveIntegration } from "@/lib/physical/integrations-server"
import { CONNECTORS, forwardToProvider, handleProviderWebhook, providerOrderFor, providerOrderIdOf, syncProviderTracking, webhookUrl, type ForwardDeps } from "@/lib/integrations/fulfilment/forward-server"
import { ProviderError, externalIdOf } from "@/lib/integrations/fulfilment/http"
import { gelatoShipmentMethods, readGelatoOrder } from "@/lib/integrations/fulfilment/gelato"
import { cjToken, readCjOrder, setCjSpacing } from "@/lib/integrations/fulfilment/cj"
import { loadLinkRows, saveLink, setStockSync, syncCjStock, type StockDeps } from "@/lib/integrations/fulfilment/links-server"
import { helpArticle } from "@/lib/help/articles"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-partners-0123456789"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
setCjSpacing(0)

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── stubs of Gelato's and CJ's APIs ───────────────────────────────────── */

type Call = { method: string; url: string; headers: Record<string, string>; body: any }
let calls: Call[] = []
type Route = (c: Call) => { status: number; body?: unknown; headers?: Record<string, string> } | null
let routes: Route[] = []
const REAL_HOST = /^https:\/\/(order\.gelatoapis\.com|product\.gelatoapis\.com|shipment\.gelatoapis\.com|developers\.cjdropshipping\.com)\//
let strayHosts: string[] = []
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
  const c: Call = { method: init.method ?? "GET", url, headers, body: init.body ? JSON.parse(init.body) : null }
  calls.push(c)
  if (!REAL_HOST.test(url)) {
    strayHosts.push(url)
    throw new Error(`a real address was called: ${url}`)
  }
  for (const r of routes) {
    const out = r(c)
    if (out) return new Response(out.body === undefined ? "" : JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json", ...(out.headers ?? {}) } })
  }
  return new Response(JSON.stringify({ message: "not stubbed" }), { status: 404 })
}) as typeof fetch
const reset = (r: Route[]) => {
  calls = []
  routes = r
}

const G = "https://order.gelatoapis.com/v4"
const CJ = "https://developers.cjdropshipping.com/api2.0/v1"
const cjOk = (data: unknown) => ({ status: 200, body: { code: 200, result: true, message: "Success", data, requestId: "r1" } })
const cjNo = (code: number, message: string) => ({ status: 200, body: { code, result: false, message, data: null, requestId: "r2" } })

/* Gelato: a catalogue read for the key, product UIDs it knows, shipment methods. */
const gelatoKey: Route = (c) => (c.method === "GET" && c.url === "https://product.gelatoapis.com/v3/catalogs" ? (c.headers["x-api-key"] === "gelato-good-key-0001" ? { status: 200, body: { data: [{ catalogUid: "cards" }] } } : { status: 401, body: { message: "Unauthorized" } }) : null)
const UID = "apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_classic_gsi_m_gco_white_gpr_4-0"
const gelatoProduct: Route = (c) => (c.method === "GET" && c.url.startsWith("https://product.gelatoapis.com/v3/products/") ? (decodeURIComponent(c.url.split("/products/")[1]) === UID ? { status: 200, body: { productUid: UID } } : { status: 404, body: { message: "Product not found" } }) : null)

/* CJ: a token for the key (documented body { apiKey }), refresh, and CJ's own envelope. */
const CJ_KEY = "CJ1234567@api@0f9e8d7c6b5a49382716abcdef012345"
let tokenIssued = 0
const cjAuth: Route = (c) => {
  if (c.method === "POST" && c.url === `${CJ}/authentication/getAccessToken`) {
    if (c.body?.apiKey !== CJ_KEY) return cjNo(1600001, "Invalid API key")
    tokenIssued++
    /* Changed on purpose: the token's ends are counted from today (CJ's 15 and 180 days), not fixed dates, which passed on 2026-10-26 and made every connect refresh at once. */
    return cjOk({ openId: 1234567, accessToken: `at-${tokenIssued}`, accessTokenExpiryDate: new Date(Date.now() + 15 * 86_400_000).toISOString(), refreshToken: `rt-${tokenIssued}`, refreshTokenExpiryDate: new Date(Date.now() + 180 * 86_400_000).toISOString(), createDate: "2026-10-11T12:00:00+08:00" })
  }
  return null
}
const cjHooks: Route = (c) => (c.method === "POST" && c.url === `${CJ}/webhook/set` ? cjOk(true) : null)

/* ── a database ────────────────────────────────────────────────────────── */

const CREATOR = "11111111-1111-4111-8111-111111111111"
const CHECKOUT = "33333333-3333-4333-8333-333333333333"
const PRODUCT = "55555555-5555-4555-8555-555555555551"
const VARIANT_M = "66666666-6666-4666-8666-666666666661"
const VARIANT_L = "66666666-6666-4666-8666-666666666662"
function freshDb() {
  const db = new FakeSupabase()
  let n = 0
  const id = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`
  db.table("commerce_integrations", { unique: [["creator_id", "provider"]], defaults: () => ({ id: id(), config: {}, status: "disconnected" }) })
  db.table("inventory_locations", { unique: [(r) => `${r.creator_id}|${String(r.name).toLowerCase()}`], defaults: () => ({ id: id(), forwarding: "none", integration_id: null, active: true }) })
  db.table("commerce_order_events", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n }) })
  db.table("commerce_jobs", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n, status: "queued", attempts: 0 }) })
  db.table("commerce_checkouts", {}, [])
  db.table("products", {}, [])
  db.table("product_variants", {}, [])
  db.table("fulfilment_variant_links", { unique: [["creator_id", "provider", "variant_id"]], defaults: () => ({ id: id(), stock_sync: false }) })
  db.tables.commerce_checkouts.push({ id: CHECKOUT, creator_id: CREATOR })
  db.tables.products.push({ id: PRODUCT, creator_id: CREATOR, title: "Tee", type: "physical", fulfillment_location_id: null })
  db.tables.product_variants.push({ id: VARIANT_M, product_id: PRODUCT, name: "M", sku: "TEE-M", fulfillment_location_id: null }, { id: VARIANT_L, product_id: PRODUCT, name: "L", sku: "CJTEE-L", fulfillment_location_id: null })
  return db
}

function orderFixture(locationId: string, lines?: any[]): any {
  return {
    id: CHECKOUT,
    creatorId: CREATOR,
    status: "paid",
    cancelledAt: null,
    buyerEmail: "ana@example.com",
    buyerName: "Ana Lima",
    buyerPhone: "+1 555 0100",
    address: { name: "Ana Lima", line1: "1 Main St", line2: "Apt 2", city: "Austin", region: "Texas", postalCode: "73301", country: "US", phone: "+1 555 0100" },
    lines: lines ?? [
      { orderId: "44444444-4444-4444-8444-444444444441", variantId: VARIANT_M, title: "Tee", variantName: "M", sku: "TEE-M", quantity: 2, fulfilled: 0, requiresShipping: true, locationId },
      { orderId: "44444444-4444-4444-8444-444444444442", variantId: null, title: "Mug", variantName: null, sku: "MUG", quantity: 1, fulfilled: 0, requiresShipping: true, locationId: "home-location" },
    ],
    shipments: [],
  }
}

function deps(order: any, shippedLog: any[] = [], events: any[] = [], stock?: StockDeps): ForwardDeps {
  return {
    loadOrder: (async () => order) as any,
    partnerShipped: (async (_db: any, input: any) => {
      shippedLog.push(input)
      return { ok: true, kind: "shipped" }
    }) as any,
    addOrderEvent: (async (db: any, e: any) => {
      events.push(e)
      await db.from("commerce_order_events").insert({ checkout_id: e.checkoutId, creator_id: e.creatorId, kind: e.kind, message: e.message, detail: e.detail ?? null, idempotency_key: e.key ?? null })
    }) as any,
    now: () => Date.parse("2026-10-11T12:00:00Z"),
    stock,
  }
}

function stockDeps(levels: Map<string, number>, moves: any[]): StockDeps {
  return {
    available: async (_db, _c, variantId) => levels.get(variantId) ?? 0,
    adjust: async (_db, a) => {
      moves.push(a)
      levels.set(a.variantId, (levels.get(a.variantId) ?? 0) + a.delta)
      return { ok: true }
    },
    now: () => Date.parse("2026-10-11T12:00:00Z"),
  }
}

async function connectGelato(db: FakeSupabase) {
  reset([gelatoKey])
  const r = await saveIntegration(db, CREATOR, "gelato", { apiKey: "gelato-good-key-0001" })
  return { r, row: db.rows("commerce_integrations").find((x) => x.provider === "gelato")!, loc: db.rows("inventory_locations").find((l) => l.name === "Gelato")! }
}
async function connectCj(db: FakeSupabase) {
  reset([cjAuth, cjHooks])
  const r = await saveIntegration(db, CREATOR, "cj_dropshipping", { apiKey: CJ_KEY })
  return { r, row: db.rows("commerce_integrations").find((x) => x.provider === "cj_dropshipping")!, loc: db.rows("inventory_locations").find((l) => l.name === "CJ Dropshipping")! }
}

async function main() {
  console.log("\nGelato and CJ Dropshipping are no longer Coming soon\n")
  {
    for (const id of ["gelato", "cj_dropshipping"]) {
      const p = PROVIDERS.find((x) => x.id === id)!
      const i = INTEGRATIONS.find((x) => x.kind === "commerce" && x.providerId === id)!
      check(`${p.name}: connects, with a connector that sends its orders`, p.availability === "connect" && !!CONNECTORS[id] && i.comingSoon !== true && i.glance.some((g) => g.value === "Works once connected"))
      check(`  its page says what goes out and what comes back`, i.about.length >= 3 && i.data.some((d) => /never sent back to your browser/.test(d)) && !i.about.some((a) => /Coming soon|Not connected to Storelib yet/.test(a)))
    }
    check("CJ's page names what comes back from CJ: status, tracking, stock", integrationById("cj-dropshipping")!.data.some((d) => /stock in CJ's warehouses/.test(d)))
    check("ShipStation, Shippo and EasyPost are left as they were for their own worker", PROVIDERS.filter((p) => ["shipstation", "shippo", "easypost"].includes(p.id)).every((p) => !CONNECTORS[p.id]))
  }

  console.log("\nGelato: an API key, checked, then sealed\n")
  {
    const db = freshDb()
    reset([gelatoKey])
    const refused = await saveIntegration(db, CREATOR, "gelato", { apiKey: "gelato-bad-key-0002" })
    check("a key Gelato refuses is not saved", refused.ok === false && /did not accept/.test((refused as any).error) && db.rows("commerce_integrations").length === 0, refused)
    const { r, row, loc } = await connectGelato(db)
    check("an accepted key connects", r.ok === true && row?.status === "connected", r)
    check("  sealed on the server, never stored plain", openSecret(row.secret_ciphertext) === "gelato-good-key-0001" && !JSON.stringify(row.config).includes("gelato-good-key"))
    check("  with standard shipping and drafts by default", row.config.shipment_method === "normal" && row.config.auto_confirm === false)
    check("  a Gelato location that prints to order (holds no stock), forwarding to it", loc?.kind === "print_on_demand" && loc?.holds_inventory === false && loc?.forwarding === "provider" && loc?.integration_id === row.id)
    check("  Gelato's webhooks are pasted by the seller: tracking is read on a timer until one arrives", row.config.webhooks === "off" && /Developer › Webhooks/.test(row.config.webhook_note))
    const views = await loadIntegrations(db, CREATOR)
    const v = views.find((x) => x.provider === "gelato")!
    const json = JSON.stringify(views)
    check("the browser gets the last four and the address to paste, never the key", v.keyHint === "0001" && v.webhookAddress === webhookUrl("gelato", CREATOR) && !json.includes("gelato-good-key-0001") && !json.includes("ciphertext"))
    reset([])
    const chose = await saveIntegration(db, CREATOR, "gelato", { shipmentMethod: "express" })
    const bad = await saveIntegration(db, CREATOR, "gelato", { shipmentMethod: "x<y" })
    check("the shipment method is the seller's choice, checked, nothing asked of Gelato", chose.ok === true && bad.ok === false && db.rows("commerce_integrations")[0].config.shipment_method === "express" && calls.length === 0)
    reset([gelatoKey])
    await saveIntegration(db, CREATOR, "gelato", { apiKey: "gelato-good-key-0001" })
    check("replacing the key keeps the seller's shipment method", db.rows("commerce_integrations")[0].config.shipment_method === "express")

    reset([(c) => (c.url.startsWith("https://shipment.gelatoapis.com/v1/shipment-methods") ? { status: 200, body: { shipmentMethods: [{ shipmentMethodUid: "normal", type: "normal", name: "Standard", hasTracking: true, supportedCountries: ["US"] }, { shipmentMethodUid: "ups_ground", type: "normal", name: "UPS Ground", hasTracking: true, supportedCountries: ["US"] }, { shipmentMethodUid: "pallet", type: "pallet", name: "Pallet", hasTracking: false, supportedCountries: ["US"] }] } } : null)])
    const methods = await gelatoShipmentMethods("gelato-good-key-0001", "US")
    check("shipment methods come from Gelato's own list, for a country, with tracking said", methods.length === 3 && methods[1].uid === "ups_ground" && methods[2].hasTracking === false && calls[0].url.endsWith("?country=US") && calls[0].headers["x-api-key"] === "gelato-good-key-0001")
  }

  console.log("\nGelato: a variant is matched to a product UID and print file, checked with Gelato\n")
  let gdb: FakeSupabase
  let gIntegration = ""
  let gLocation = ""
  {
    const db = (gdb = freshDb())
    const { row, loc } = await connectGelato(db)
    gIntegration = row.id
    gLocation = loc.id
    db.tables.products[0].fulfillment_location_id = loc.id
    reset([gelatoProduct])
    const badUid = await saveLink(db, CREATOR, "gelato", { variantId: VARIANT_M, providerVariantId: "Not A UID!", fileUrl: "https://files.example.com/tee.pdf" })
    const unknown = await saveLink(db, CREATOR, "gelato", { variantId: VARIANT_M, providerVariantId: "apparel_product_unknown_thing", fileUrl: "https://files.example.com/tee.pdf" })
    const httpFile = await saveLink(db, CREATOR, "gelato", { variantId: VARIANT_M, providerVariantId: UID, fileUrl: "http://files.example.com/tee.pdf" })
    const privateFile = await saveLink(db, CREATOR, "gelato", { variantId: VARIANT_M, providerVariantId: UID, fileUrl: "https://127.0.0.1/tee.pdf" })
    const notMine = await saveLink(db, CREATOR, "gelato", { variantId: "77777777-7777-4777-8777-777777777777", providerVariantId: UID, fileUrl: "https://files.example.com/tee.pdf" })
    check("a UID that isn't one is refused before asking Gelato", badUid.ok === false && /doesn't look like/.test((badUid as any).error))
    check("a UID Gelato doesn't know is refused, as Gelato said", unknown.ok === false && /no product with that UID/.test((unknown as any).error))
    check("the print file must be a public https address", httpFile.ok === false && privateFile.ok === false)
    check("someone else's variant is refused", notMine.ok === false && /not yours/.test((notMine as any).error))
    check("  nothing saved for any of them", db.rows("fulfilment_variant_links").length === 0)
    const ok = await saveLink(db, CREATOR, "gelato", { variantId: VARIANT_M, providerVariantId: UID, fileUrl: "https://files.example.com/tee.pdf" })
    const link = db.rows("fulfilment_variant_links")[0]
    check("a UID Gelato knows, with an https file, is saved", ok.ok === true && link?.provider_variant_id === UID && link?.file_url === "https://files.example.com/tee.pdf" && link?.product_id === PRODUCT)
    const rows = await loadLinkRows(db, CREATOR, "gelato")
    check("the matching list: every physical variant, the matched one says so, those at the Gelato location first", rows.ok === true && rows.rows.length === 2 && rows.rows.every((r) => r.atPartner) && rows.rows.find((r) => r.variantId === VARIANT_M)?.link?.providerVariantId === UID && rows.rows.find((r) => r.variantId === VARIANT_L)?.link === null)
  }

  console.log("\nGelato: a paid order goes to Gelato's Order API v4\n")
  {
    const db = gdb
    const order = orderFixture(gLocation)
    reset([])
    await saveIntegration(db, CREATOR, "gelato", { shipmentMethod: "express" })
    reset([
      (c) => (c.method === "POST" && c.url === `${G}/orders:search` ? { status: 200, body: { orders: [] } } : null),
      (c) => (c.method === "POST" && c.url === `${G}/orders` ? { status: 200, body: { id: "8f2a1c3e-0b8d-4d55-9a0e-1b2c3d4e5f60", orderType: "draft", fulfillmentStatus: "draft" } } : null),
    ])
    const events: any[] = []
    await forwardToProvider(db, { checkoutId: CHECKOUT, locationId: gLocation, integrationId: gIntegration, creatorId: CREATOR }, deps(order, [], events))
    const search = calls.find((c) => c.url.endsWith("/orders:search"))
    const sent = calls.find((c) => c.method === "POST" && c.url === `${G}/orders`)
    check("first it asks whether Gelato already has this order (a retry never makes a second)", search?.body?.orderReferenceIds?.[0] === externalIdOf(CHECKOUT))
    check("then posts it with the seller's key", !!sent && sent.headers["x-api-key"] === "gelato-good-key-0001")
    check("  a draft, by the Storelib order's reference", sent?.body.orderType === "draft" && sent?.body.orderReferenceId === externalIdOf(CHECKOUT))
    check("  each item by its matched product UID and print file, never by name", sent?.body.items.length === 1 && sent?.body.items[0].productUid === UID && sent?.body.items[0].files[0].url === "https://files.example.com/tee.pdf" && sent?.body.items[0].quantity === 2)
    check("  by the seller's shipment method", sent?.body.shipmentMethodUid === "express")
    check("  to the buyer's address", sent?.body.shippingAddress.addressLine1 === "1 Main St" && sent?.body.shippingAddress.firstName === "Ana" && sent?.body.shippingAddress.lastName === "Lima" && sent?.body.shippingAddress.state === "TX" && sent?.body.shippingAddress.postCode === "73301" && sent?.body.shippingAddress.email === "ana@example.com")
    check("the timeline says it waits in Gelato for approval", events.some((e) => e.kind === "fulfillment.forwarded" && e.detail?.provider === "gelato" && /Approve it there/.test(e.message)))
    check("a tracking check is queued", db.rows("commerce_jobs").some((j) => j.kind === "tracking_sync" && j.payload.providerOrderId === "8f2a1c3e-0b8d-4d55-9a0e-1b2c3d4e5f60"))
    calls = []
    await forwardToProvider(db, { checkoutId: CHECKOUT, locationId: gLocation, integrationId: gIntegration, creatorId: CREATOR }, deps(order))
    check("the same job again sends nothing", calls.length === 0)

    /* A retry after a timeout: Gelato made it, Storelib never heard. */
    const db2 = freshDb()
    const c2 = await connectGelato(db2)
    db2.tables.fulfilment_variant_links.push({ id: "l1", creator_id: CREATOR, provider: "gelato", product_id: PRODUCT, variant_id: VARIANT_M, provider_variant_id: UID, file_url: "https://files.example.com/tee.pdf" })
    await saveIntegration(db2, CREATOR, "gelato", { autoConfirm: true })
    reset([(c) => (c.method === "POST" && c.url === `${G}/orders:search` ? { status: 200, body: { orders: [{ id: "existing-gelato-order-1", orderReferenceId: externalIdOf(CHECKOUT), fulfillmentStatus: "passed", orderType: "order" }] } } : null)])
    const ev2: any[] = []
    await forwardToProvider(db2, { checkoutId: CHECKOUT, locationId: c2.loc.id, integrationId: c2.row.id, creatorId: CREATOR }, deps(orderFixture(c2.loc.id), [], ev2))
    check("a retry finds the order Gelato already has, and posts no second one", !calls.some((c) => c.url === `${G}/orders`) && ev2.some((e) => e.detail?.provider_order_id === "existing-gelato-order-1"))

    const db3 = freshDb()
    const c3 = await connectGelato(db3)
    db3.tables.fulfilment_variant_links.push({ id: "l1", creator_id: CREATOR, provider: "gelato", product_id: PRODUCT, variant_id: VARIANT_M, provider_variant_id: UID, file_url: "https://files.example.com/tee.pdf" })
    await saveIntegration(db3, CREATOR, "gelato", { autoConfirm: true })
    reset([(c) => (c.method === "POST" && c.url === `${G}/orders:search` ? { status: 200, body: { orders: [] } } : null), (c) => (c.method === "POST" && c.url === `${G}/orders` ? { status: 200, body: { id: "new-gelato-order-2", orderType: "order", fulfillmentStatus: "created" } } : null)])
    const ev3: any[] = []
    await forwardToProvider(db3, { checkoutId: CHECKOUT, locationId: c3.loc.id, integrationId: c3.row.id, creatorId: CREATOR }, deps(orderFixture(c3.loc.id), [], ev3))
    check("Send straight to production: orderType order", calls.find((c) => c.url === `${G}/orders`)?.body.orderType === "order" && ev3.some((e) => /for production/.test(e.message)))

    /* Never a guess: an unmatched variant is not sent, even with a SKU. */
    const db4 = freshDb()
    const c4 = await connectGelato(db4)
    reset([])
    const ev4: any[] = []
    await forwardToProvider(db4, { checkoutId: CHECKOUT, locationId: c4.loc.id, integrationId: c4.row.id, creatorId: CREATOR }, deps(orderFixture(c4.loc.id), [], ev4))
    check("an unmatched variant: nothing posted to Gelato, the order says to send it yourself", !calls.some((c) => c.method === "POST") && ev4.some((e) => e.kind === "fulfillment.manual_needed" && /not matched to a Gelato product/.test(e.message) && /Send it yourself/.test(e.message)))
    check("  and the card shows the problem", /not matched/.test(db4.rows("commerce_integrations")[0].last_error ?? ""))

    for (const [status, label] of [[429, "busy (429)"], [503, "down (5xx)"]] as const) {
      const db5 = freshDb()
      const c5 = await connectGelato(db5)
      db5.tables.fulfilment_variant_links.push({ id: "l1", creator_id: CREATOR, provider: "gelato", product_id: PRODUCT, variant_id: VARIANT_M, provider_variant_id: UID, file_url: "https://files.example.com/tee.pdf" })
      reset([(c) => (c.method === "POST" ? { status, body: { message: "slow down" }, headers: { "retry-after": "20" } } : null)])
      let thrown: unknown = null
      try {
        await forwardToProvider(db5, { checkoutId: CHECKOUT, locationId: c5.loc.id, integrationId: c5.row.id, creatorId: CREATOR }, deps(orderFixture(c5.loc.id)))
      } catch (e) {
        thrown = e
      }
      check(`Gelato ${label}: thrown for the queue to retry with backoff, nothing marked by hand`, thrown instanceof ProviderError && thrown.retry === true && db5.rows("commerce_order_events").length === 0)
    }
    {
      const db6 = freshDb()
      const c6 = await connectGelato(db6)
      db6.tables.fulfilment_variant_links.push({ id: "l1", creator_id: CREATOR, provider: "gelato", product_id: PRODUCT, variant_id: VARIANT_M, provider_variant_id: UID, file_url: "https://files.example.com/tee.pdf" })
      reset([(c) => (c.method === "POST" && c.url.endsWith(":search") ? { status: 200, body: { orders: [] } } : null), (c) => (c.method === "POST" ? { status: 400, body: { message: "Shipping address country is not supported" } } : null)])
      const ev6: any[] = []
      await forwardToProvider(db6, { checkoutId: CHECKOUT, locationId: c6.loc.id, integrationId: c6.row.id, creatorId: CREATOR }, deps(orderFixture(c6.loc.id), [], ev6))
      check("Gelato refuses: not retried, the order says why and to send it yourself", ev6.some((e) => e.kind === "fulfillment.manual_needed" && /country is not supported/.test(e.message)))
    }
  }

  console.log("\nGelato: tracking comes back, and its webhook is only a pointer\n")
  {
    const shipped = readGelatoOrder({
      id: "8f2a1c3e-0b8d-4d55-9a0e-1b2c3d4e5f60",
      orderReferenceId: externalIdOf(CHECKOUT),
      fulfillmentStatus: "shipped",
      items: [
        { fulfillmentStatus: "shipped", fulfillments: [{ trackingCode: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784", shipmentMethodName: "UPS Ground" }] },
        { fulfillmentStatus: "shipped", fulfillments: [{ trackingCode: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784", shipmentMethodName: "UPS Ground" }] },
      ],
      shipment: { shipmentMethodName: "UPS Ground", packages: [{ trackingCode: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784" }] },
    })
    check("a shipped order: one parcel for one tracking code, with Gelato's carrier and link", shipped.stage === "shipped" && shipped.shipments.length === 1 && shipped.shipments[0].carrier === "UPS Ground" && shipped.shipments[0].trackingNumber === "1Z999AA10123456784")
    check("delivered, failed and on hold read as Gelato says", readGelatoOrder({ id: "x", fulfillmentStatus: "delivered", items: [{ fulfillmentStatus: "delivered", fulfillments: [{ trackingCode: "T1" }] }] }).stage === "delivered" && readGelatoOrder({ fulfillmentStatus: "failed" }).stage === "problem" && /on hold/.test(readGelatoOrder({ fulfillmentStatus: "on_hold" }).problem ?? "") && readGelatoOrder({ fulfillmentStatus: "canceled" }).stage === "cancelled")

    const db = gdb
    const getOrder: Route = (c) => (c.method === "GET" && c.url === `${G}/orders/8f2a1c3e-0b8d-4d55-9a0e-1b2c3d4e5f60` ? { status: 200, body: { id: "8f2a1c3e-0b8d-4d55-9a0e-1b2c3d4e5f60", orderReferenceId: externalIdOf(CHECKOUT), fulfillmentStatus: "shipped", items: [{ fulfillmentStatus: "shipped", fulfillments: [{ trackingCode: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784", shipmentMethodName: "UPS Ground" }] }] } } : null)
    reset([getOrder])
    const log: any[] = []
    /* The body says delivered with a made up number: none of it is believed. */
    const raw = JSON.stringify({ id: "os_1", event: "order_status_updated", orderId: "8f2a1c3e-0b8d-4d55-9a0e-1b2c3d4e5f60", orderReferenceId: externalIdOf(CHECKOUT), fulfillmentStatus: "delivered", items: [{ fulfillments: [{ trackingCode: "FAKE123" }] }] })
    const out = await handleProviderWebhook(db, { provider: "gelato", creatorId: CREATOR, raw, signature: null }, deps(orderFixture(gLocation), log))
    check("a Gelato webhook: the order is read back from Gelato with the seller's key", out.status === 200 && calls.some((c) => c.headers["x-api-key"] === "gelato-good-key-0001" && c.url.endsWith("/orders/8f2a1c3e-0b8d-4d55-9a0e-1b2c3d4e5f60")))
    check("  and ships with what Gelato says, not what the body said", log.length === 1 && log[0].trackingNumber === "1Z999AA10123456784" && log[0].status === "shipped" && log[0].partner.provider === "gelato" && log[0].locationId === gLocation)
    const row = db.rows("commerce_integrations").find((x) => x.provider === "gelato")!
    check("  the first delivery turns the card's Tracking line to webhooks", row.config.webhooks === "on" && row.config.webhook_note === null)
    reset([(c) => (c.method === "GET" ? { status: 404, body: { message: "Order not found" } } : null)])
    const notOurs = await handleProviderWebhook(db, { provider: "gelato", creatorId: CREATOR, raw: JSON.stringify({ event: "order_status_updated", orderId: "someone-elses-order" }), signature: null }, deps(orderFixture(gLocation)))
    check("an order Gelato doesn't have for this key: answered 200, nothing moves", notOurs.status === 200 && (notOurs.body as any).ignored === true)
    reset([(c) => (c.method === "GET" ? { status: 503, body: {} } : null)])
    const busy = await handleProviderWebhook(db, { provider: "gelato", creatorId: CREATOR, raw: JSON.stringify({ event: "order_item_tracking_code_updated", orderId: "8f2a1c3e-0b8d-4d55-9a0e-1b2c3d4e5f60" }), signature: null }, deps(orderFixture(gLocation)))
    check("Gelato busy while reading it back: 503, so Gelato sends it again", busy.status === 503)

    reset([getOrder])
    const log2: any[] = []
    await syncProviderTracking(db, { creatorId: CREATOR, integrationId: gIntegration, providerOrderId: "8f2a1c3e-0b8d-4d55-9a0e-1b2c3d4e5f60", checkoutId: CHECKOUT, locationId: gLocation, round: 1 }, deps(orderFixture(gLocation), log2))
    check("the timer check ships it too, and keeps checking until delivered", log2[0]?.trackingNumber === "1Z999AA10123456784" && db.rows("commerce_jobs").some((j) => j.kind === "tracking_sync" && j.payload.round === 2))
  }

  console.log("\nCJ: the API key is exchanged for a token, sealed, refreshed\n")
  let cdb: FakeSupabase
  let cIntegration = ""
  let cLocation = ""
  {
    const db = (cdb = freshDb())
    reset([cjAuth])
    const refused = await saveIntegration(db, CREATOR, "cj_dropshipping", { apiKey: "CJ7654321@api@ffffffffffffffffffffffffffffffff" })
    check("a key CJ refuses (its code 1600001 in a 200) is not saved", refused.ok === false && /did not accept/.test((refused as any).error) && db.rows("commerce_integrations").length === 0, refused)
    check("  asked as CJ documents it: POST getAccessToken { apiKey }", calls[0]?.method === "POST" && calls[0]?.url === `${CJ}/authentication/getAccessToken` && calls[0]?.body?.apiKey === "CJ7654321@api@ffffffffffffffffffffffffffffffff")
    const { r, row, loc } = await connectCj(db)
    cIntegration = row.id
    cLocation = loc.id
    check("an accepted key connects", r.ok === true && row?.status === "connected", r)
    check("  the key and both tokens sealed, none stored plain", openSecret(row.secret_ciphertext) === CJ_KEY && openSecret(row.config.cj.at) === "at-1" && openSecret(row.config.cj.rt) === "rt-1" && !JSON.stringify(row.config).includes("at-1") && !JSON.stringify(row.config).includes(CJ_KEY))
    check("  ships from China at the cheapest method by default, unpaid orders", row.config.from_country === "CN" && row.config.logistic === "cheapest" && row.config.auto_confirm === false)
    check("  a CJ Dropshipping location: a dropshipping supplier whose stock can be kept", loc?.kind === "dropshipper" && loc?.holds_inventory === true && loc?.forwarding === "provider")
    const hook = calls.find((c) => c.url === `${CJ}/webhook/set`)
    check("CJ is asked to send order, logistics and stock updates to Storelib's signed address", hook?.body.order.type === "ENABLE" && hook?.body.logistics.callbackUrls[0] === webhookUrl("cj_dropshipping", CREATOR) && hook?.body.stock.type === "ENABLE" && hook?.body.product.type === "CANCEL" && hook?.headers["cj-access-token"] === "at-1")
    check("  and the card says CJ keeps one address a topic", row.config.webhooks === "on" && /replaced/.test(row.config.webhook_note))
    const json = JSON.stringify(await loadIntegrations(db, CREATOR))
    check("the browser never gets the key or a token", !json.includes(CJ_KEY) && !json.includes("at-1") && !json.includes("rt-1") && json.includes('"fromCountry":"CN"'))
    reset([])
    const okChoice = await saveIntegration(db, CREATOR, "cj_dropshipping", { fromCountry: "us", logistic: "CJPacket Ordinary" })
    const badChoice = await saveIntegration(db, CREATOR, "cj_dropshipping", { fromCountry: "USA" })
    check("ships from and the shipping method are the seller's, checked", okChoice.ok === true && badChoice.ok === false && db.rows("commerce_integrations")[0].config.from_country === "US" && db.rows("commerce_integrations")[0].config.logistic === "CJPacket Ordinary")
    await saveIntegration(db, CREATOR, "cj_dropshipping", { fromCountry: "CN", logistic: "cheapest" })

    /* Tokens: a fresh one is used; a stale one is refreshed; a refused refresh goes back to the key. */
    const now = Date.parse("2026-10-11T12:00:00Z")
    const persisted: any[] = []
    const cred = { key: CJ_KEY, config: { cj: { at: sealSecret("at-old"), at_exp: "2026-10-11T12:30:00Z", rt: sealSecret("rt-old"), rt_exp: "2027-01-01T00:00:00Z" } } as Record<string, unknown>, persist: async (p: Record<string, unknown>) => void persisted.push(p) }
    reset([cjAuth, (c) => (c.url === `${CJ}/authentication/refreshAccessToken` ? (c.body?.refreshToken === "rt-old" ? cjOk({ accessToken: "at-refreshed", accessTokenExpiryDate: "2026-10-26T12:00:00Z", refreshToken: "rt-new", refreshTokenExpiryDate: "2027-04-09T12:00:00Z" }) : cjNo(1600003, "Invalid refresh token")) : null)])
    const t1 = await cjToken(cred, false, now)
    check("an access token within an hour of its end is refreshed with the refresh token, and kept on the row", t1 === "at-refreshed" && calls.length === 1 && calls[0].url.endsWith("/refreshAccessToken") && openSecret((persisted[0]?.cj as any)?.at) === "at-refreshed")
    const t2 = await cjToken(cred, false, now)
    check("  then used as it is, nothing asked", t2 === "at-refreshed" && calls.length === 1)
    const cred2 = { key: CJ_KEY, config: { cj: { at: sealSecret("at-old"), at_exp: "2026-10-01T00:00:00Z", rt: sealSecret("rt-revoked"), rt_exp: "2027-01-01T00:00:00Z" } } as Record<string, unknown> }
    calls = []
    const t3 = await cjToken(cred2, false, now)
    check("a refresh CJ refuses: a new token from the key", t3.startsWith("at-") && t3 !== "at-old" && calls.map((c) => c.url.split("/").pop()).join(",") === "refreshAccessToken,getAccessToken")
  }

  console.log("\nCJ: matching a variant, found by SKU or words in CJ's catalogue\n")
  {
    const db = cdb
    db.tables.products[0].fulfillment_location_id = cLocation
    const variantQuery: Route = (c) => {
      if (c.method !== "GET" || !c.url.startsWith(`${CJ}/product/variant/`)) return null
      const u = new URL(c.url)
      if (u.pathname.endsWith("/queryByVid")) return u.searchParams.get("vid") === "1424608152007086080" ? cjOk({ vid: "1424608152007086080", pid: "04A22450-67F0-4617-A132-E7AE7F8963B0", variantSku: "CJNSSYWY01847-White-M", variantNameEn: "Hoody White M", variantSellPrice: 11.85 }) : cjNo(1600100, "variant not found")
      if (u.searchParams.get("variantSku") === "CJTEE-L") return cjOk([{ vid: "1500000000000000002", pid: "P2", variantSku: "CJTEE-L", variantNameEn: "Tee L" }])
      if (u.searchParams.get("variantSku")) return cjOk([{ vid: "1500000000000000009", pid: "P9", variantSku: `${u.searchParams.get("variantSku")}-X`, variantNameEn: "Something close" }])
      if (u.searchParams.get("pid") === "04A22450-67F0-4617-A132-E7AE7F8963B0") return cjOk([{ vid: "1424608152007086080", variantSku: "CJNSSYWY01847-White-M", variantNameEn: "Hoody White M" }, { vid: "1424608152007086081", variantSku: "CJNSSYWY01847-White-L", variantNameEn: "Hoody White L" }])
      return cjOk([])
    }
    const list: Route = (c) => (c.method === "GET" && c.url.startsWith(`${CJ}/product/listV2`) ? cjOk({ pageSize: 20, pageNumber: 1, totalRecords: 1, totalPages: 1, content: [{ productList: [{ id: "04A22450-67F0-4617-A132-E7AE7F8963B0", nameEn: "Cat Ear Hoody", sku: "CJNSSYWY01847", bigImage: "https://cc-west-usa.oss-us-west-1.aliyuncs.com/a.png", sellPrice: "11.85" }] }] }) : null)
    reset([variantQuery, list])
    const { cjSearch, cjVariantsOfProduct } = await import("@/lib/integrations/fulfilment/cj")
    const cred = { key: CJ_KEY, config: db.rows("commerce_integrations").find((x) => x.provider === "cj_dropshipping")!.config }
    const found = await cjSearch(cred, "hoody")
    check("search by words: CJ's products (listV2, data.content[].productList)", found.products.length === 1 && found.products[0].pid === "04A22450-67F0-4617-A132-E7AE7F8963B0" && found.products[0].name === "Cat Ear Hoody" && calls.some((c) => c.url.includes("listV2?keyWord=hoody")))
    const bySku = await cjSearch(cred, "CJTEE-L")
    check("search by SKU: the variant with exactly that SKU first", bySku.variants.length === 1 && bySku.variants[0].vid === "1500000000000000002")
    const near = await cjSearch(cred, "CJTEE")
    check("  a variant whose SKU only starts the same is not offered as exact", near.variants.length === 0)
    const vs = await cjVariantsOfProduct(cred, "04A22450-67F0-4617-A132-E7AE7F8963B0")
    check("a product's variants to choose from", vs.length === 2 && vs[1].sku === "CJNSSYWY01847-White-L")
    const wrong = await saveLink(db, CREATOR, "cj_dropshipping", { variantId: VARIANT_M, providerVariantId: "9999999999999999999" })
    check("a vid CJ doesn't have is refused", wrong.ok === false && /no variant with that id/.test((wrong as any).error))
    const ok = await saveLink(db, CREATOR, "cj_dropshipping", { variantId: VARIANT_M, providerVariantId: "1424608152007086080" })
    const link = db.rows("fulfilment_variant_links").find((l) => l.provider === "cj_dropshipping")
    check("a vid CJ confirms is saved with its SKU and name", ok.ok === true && link?.provider_sku === "CJNSSYWY01847-White-M" && link?.label === "Hoody White M" && link?.provider_product_id === "04A22450-67F0-4617-A132-E7AE7F8963B0")
    check("every CJ call carried the seller's token", calls.filter((c) => !c.url.includes("/authentication/")).every((c) => typeof c.headers["cj-access-token"] === "string" && c.headers["cj-access-token"].startsWith("at-")))
  }

  console.log("\nCJ: a paid order is made in CJ by its variants\n")
  {
    const db = cdb
    const order = orderFixture(cLocation, [
      { orderId: "44444444-4444-4444-8444-444444444441", variantId: VARIANT_M, title: "Tee", variantName: "M", sku: "TEE-M", quantity: 2, fulfilled: 0, requiresShipping: true, locationId: cLocation },
      { orderId: "44444444-4444-4444-8444-444444444443", variantId: VARIANT_L, title: "Tee", variantName: "L", sku: "CJTEE-L", quantity: 1, fulfilled: 0, requiresShipping: true, locationId: cLocation },
    ])
    const input = providerOrderFor(order, cLocation, false, new Map([[VARIANT_M, { providerVariantId: "1424608152007086080", fileUrl: null }]])) as any
    check("the order's lines carry the matched variant, or none", input.lines[0].link?.providerVariantId === "1424608152007086080" && input.lines[1].link === null)
    reset([
      (c) => (c.method === "GET" && c.url === `${CJ}/product/variant/query?variantSku=CJTEE-L` ? cjOk([{ vid: "1500000000000000002", variantSku: "CJTEE-L" }]) : null),
      (c) => (c.method === "POST" && c.url === `${CJ}/logistic/freightCalculate` ? cjOk([{ logisticName: "USPS+", logisticPrice: 9.8, logisticAging: "7-12" }, { logisticName: "CJPacket Ordinary", logisticPrice: 4.25, logisticAging: "10-20" }]) : null),
      (c) => (c.method === "POST" && c.url === `${CJ}/shopping/order/createOrderV2` ? cjOk({ orderId: "210823100016290555", orderStatus: "CREATED" }) : null),
    ])
    const events: any[] = []
    await forwardToProvider(db, { checkoutId: CHECKOUT, locationId: cLocation, integrationId: cIntegration, creatorId: CREATOR }, deps(order, [], events))
    const freight = calls.find((c) => c.url.endsWith("/freightCalculate"))
    const made = calls.find((c) => c.url.endsWith("/createOrderV2"))
    check("an unmatched item goes only by a SKU CJ confirms exactly", calls.some((c) => c.url.endsWith("variantSku=CJTEE-L")))
    check("the cheapest method CJ quotes, from the warehouse country, for these variants", freight?.body.startCountryCode === "CN" && freight?.body.endCountryCode === "US" && freight?.body.products.length === 2 && made?.body.logisticName === "CJPacket Ordinary")
    check("createOrderV2: made only (payType 3), our reference, variants and quantities", made?.body.payType === 3 && made?.body.orderNumber === externalIdOf(CHECKOUT) && made?.body.products[0].vid === "1424608152007086080" && made?.body.products[0].quantity === 2 && made?.body.products[1].vid === "1500000000000000002")
    check("  to the buyer, with the country's name CJ asks for", made?.body.shippingCountryCode === "US" && made?.body.shippingCountry === "United States" && made?.body.shippingProvince === "TX" && made?.body.shippingCity === "Austin" && made?.body.shippingAddress === "1 Main St" && made?.body.shippingCustomerName === "Ana Lima" && made?.body.fromCountryCode === "CN")
    check("  nothing confirmed or paid without the seller's say", !calls.some((c) => /confirmOrder|payBalance/.test(c.url)))
    check("the timeline: sent to CJ, pay it there", events.some((e) => e.kind === "fulfillment.forwarded" && e.detail?.provider_order_id === "210823100016290555" && /Pay it in CJ/.test(e.message)))

    /* Never a guess: a SKU CJ has only something close to. */
    const db2 = freshDb()
    const c2 = await connectCj(db2)
    reset([(c) => (c.method === "GET" && c.url.includes("variantSku=") ? cjOk([{ vid: "1500000000000000009", variantSku: "TEE-M-X" }]) : null)])
    const ev2: any[] = []
    await forwardToProvider(db2, { checkoutId: CHECKOUT, locationId: c2.loc.id, integrationId: c2.row.id, creatorId: CREATOR }, deps(orderFixture(c2.loc.id), [], ev2))
    check("a SKU CJ has no exact variant for: nothing made in CJ, the order says to match it and send it yourself", !calls.some((c) => c.url.endsWith("/createOrderV2")) && ev2.some((e) => e.kind === "fulfillment.manual_needed" && /no variant matched to Tee \(M\) \(SKU TEE-M\)/.test(e.message) && /Send it yourself/.test(e.message)))

    /* Send straight to production: confirmed, then paid from the CJ balance. */
    const db3 = freshDb()
    const c3 = await connectCj(db3)
    db3.tables.fulfilment_variant_links.push({ id: "l1", creator_id: CREATOR, provider: "cj_dropshipping", product_id: PRODUCT, variant_id: VARIANT_M, provider_variant_id: "1424608152007086080" })
    await saveIntegration(db3, CREATOR, "cj_dropshipping", { autoConfirm: true, logistic: "CJPacket Ordinary" })
    const paid: Route[] = [
      (c) => (c.method === "POST" && c.url.endsWith("/createOrderV2") ? cjOk({ orderId: "210823100016290556" }) : null),
      (c) => (c.method === "PATCH" && c.url.endsWith("/confirmOrder") ? cjOk("210823100016290556") : null),
    ]
    reset([...paid, (c) => (c.method === "POST" && c.url.endsWith("/payBalance") ? cjOk(true) : null)])
    const ev3: any[] = []
    await forwardToProvider(db3, { checkoutId: CHECKOUT, locationId: c3.loc.id, integrationId: c3.row.id, creatorId: CREATOR }, deps(orderFixture(c3.loc.id), [], ev3))
    check("on: the seller's named method (no quote asked), then confirmed and paid from the balance", !calls.some((c) => c.url.endsWith("/freightCalculate")) && calls.find((c) => c.url.endsWith("/createOrderV2"))?.body.logisticName === "CJPacket Ordinary" && calls.find((c) => c.url.endsWith("/confirmOrder"))?.body.orderId === "210823100016290556" && calls.find((c) => c.url.endsWith("/payBalance"))?.body.orderId === "210823100016290556" && ev3.some((e) => /for production/.test(e.message)))
    const db4 = freshDb()
    const c4 = await connectCj(db4)
    db4.tables.fulfilment_variant_links.push({ id: "l1", creator_id: CREATOR, provider: "cj_dropshipping", product_id: PRODUCT, variant_id: VARIANT_M, provider_variant_id: "1424608152007086080" })
    await saveIntegration(db4, CREATOR, "cj_dropshipping", { autoConfirm: true, logistic: "CJPacket Ordinary" })
    reset([...paid, (c) => (c.method === "POST" && c.url.endsWith("/payBalance") ? cjNo(1603100, "Insufficient balance") : null)])
    const ev4: any[] = []
    await forwardToProvider(db4, { checkoutId: CHECKOUT, locationId: c4.loc.id, integrationId: c4.row.id, creatorId: CREATOR }, deps(orderFixture(c4.loc.id), [], ev4))
    check("a balance too low: the order is made in CJ once, and says to pay it there (never made twice)", calls.filter((c) => c.url.endsWith("/createOrderV2")).length === 1 && ev4.some((e) => e.kind === "fulfillment.forwarded" && /could not pay it from your CJ balance \(Insufficient balance\)/.test(e.message)))

    /* Busy and refused, as CJ says them in its envelope. */
    const db5 = freshDb()
    const c5 = await connectCj(db5)
    db5.tables.fulfilment_variant_links.push({ id: "l1", creator_id: CREATOR, provider: "cj_dropshipping", product_id: PRODUCT, variant_id: VARIANT_M, provider_variant_id: "1424608152007086080" })
    reset([(c) => (c.url.endsWith("/freightCalculate") ? cjNo(1600200, "Too Many Requests") : null)])
    let thrown: unknown = null
    try {
      await forwardToProvider(db5, { checkoutId: CHECKOUT, locationId: c5.loc.id, integrationId: c5.row.id, creatorId: CREATOR }, deps(orderFixture(c5.loc.id)))
    } catch (e) {
      thrown = e
    }
    check("CJ's too many requests (in a 200): retried by the queue", thrown instanceof ProviderError && thrown.retry === true && thrown.status === 429)
    reset([(c) => (c.url.endsWith("/freightCalculate") ? cjOk([]) : null)])
    const ev5: any[] = []
    await forwardToProvider(db5, { checkoutId: CHECKOUT, locationId: c5.loc.id, integrationId: c5.row.id, creatorId: CREATOR }, deps(orderFixture(c5.loc.id), [], ev5))
    check("no CJ method to that country: not retried, the order says why", ev5.some((e) => e.kind === "fulfillment.manual_needed" && /no shipping method from CN to US/.test(e.message)))
    /* A token CJ stopped taking: one fresh token from the key, then the call again. */
    const db6 = freshDb()
    const c6 = await connectCj(db6)
    db6.tables.fulfilment_variant_links.push({ id: "l1", creator_id: CREATOR, provider: "cj_dropshipping", product_id: PRODUCT, variant_id: VARIANT_M, provider_variant_id: "1424608152007086080" })
    await saveIntegration(db6, CREATOR, "cj_dropshipping", { logistic: "CJPacket Ordinary" })
    const before = tokenIssued
    reset([cjAuth, (c) => (c.url.endsWith("/createOrderV2") ? (c.headers["cj-access-token"] === `at-${before}` ? cjNo(1600001, "Invalid access token") : cjOk({ orderId: "210823100016290557" })) : null)])
    const ev6: any[] = []
    await forwardToProvider(db6, { checkoutId: CHECKOUT, locationId: c6.loc.id, integrationId: c6.row.id, creatorId: CREATOR }, deps(orderFixture(c6.loc.id), [], ev6))
    const saved6 = db6.rows("commerce_integrations").find((x) => x.provider === "cj_dropshipping")!
    check("a token CJ refuses: a new one from the key, the order made once, the new token kept on the row", calls.filter((c) => c.url.endsWith("/createOrderV2")).length === 2 && ev6.some((e) => e.detail?.provider_order_id === "210823100016290557") && openSecret(saved6.config.cj.at) === `at-${before + 1}`)
  }

  console.log("\nCJ: tracking back, by webhook (read again from CJ) or on a timer\n")
  {
    const db = cdb
    const detail = (status: string, track: string | null): Route => (c) => (c.method === "GET" && c.url === `${CJ}/shopping/order/getOrderDetail?orderId=210823100016290555` ? cjOk({ orderId: "210823100016290555", orderNum: externalIdOf(CHECKOUT), orderStatus: status, trackNumber: track, logisticName: "CJPacket Ordinary" }) : null)
    check("CJ's statuses read as stages", readCjOrder({ orderStatus: "CREATED" }).stage === "draft" && readCjOrder({ orderStatus: "UNSHIPPED" }).stage === "in_production" && readCjOrder({ orderStatus: "SHIPPED", trackNumber: "CJPKL7160102171YQ" }).shipments.length === 1 && readCjOrder({ orderStatus: "CANCELLED" }).stage === "cancelled")
    reset([detail("SHIPPED", "CJPKL7160102171YQ"), (c) => (c.url.startsWith(`${CJ}/logistic/trackInfo`) ? cjOk([{ trackingNumber: "CJPKL7160102171YQ", trackingStatus: "In transit" }]) : null)])
    const log: any[] = []
    const raw = JSON.stringify({ messageId: "m1", type: "ORDER", messageType: "UPDATE", params: { cjOrderId: "210823100016290555", orderNumber: externalIdOf(CHECKOUT), orderStatus: "DELIVERED", trackNumber: "FAKE" } })
    const out = await handleProviderWebhook(db, { provider: "cj_dropshipping", creatorId: CREATOR, raw, signature: null }, deps(orderFixture(cLocation, [{ orderId: "44444444-4444-4444-8444-444444444441", variantId: VARIANT_M, title: "Tee", variantName: "M", sku: "TEE-M", quantity: 2, fulfilled: 0, requiresShipping: true, locationId: cLocation }]), log))
    check("an ORDER message: read back from CJ, shipped with CJ's own number, the body's ignored", out.status === 200 && log.length === 1 && log[0].trackingNumber === "CJPKL7160102171YQ" && log[0].status === "shipped" && log[0].carrier === "CJPacket Ordinary")
    check("  CJ's tracking asked whether it was delivered", calls.some((c) => c.url.includes("/logistic/trackInfo?trackNumber=CJPKL7160102171YQ")))
    reset([detail("SHIPPED", "CJPKL7160102171YQ"), (c) => (c.url.startsWith(`${CJ}/logistic/trackInfo`) ? cjOk([{ trackingNumber: "CJPKL7160102171YQ", trackingStatus: "Delivered" }]) : null)])
    const log2: any[] = []
    await handleProviderWebhook(db, { provider: "cj_dropshipping", creatorId: CREATOR, raw: JSON.stringify({ type: "LOGISTIC", messageType: "UPDATE", params: { orderId: "210823100016290555", trackingNumber: "x", trackingStatus: 12 } }), signature: null }, deps(orderFixture(cLocation), log2))
    check("a LOGISTIC message: delivered when CJ's tracking says so", log2[0]?.status === "delivered")
    check("the webhook names the order only by CJ's id", providerOrderIdOf("cj_dropshipping", { type: "ORDER", params: { cjOrderId: "1" } }) === "1" && providerOrderIdOf("cj_dropshipping", { type: "LOGISTIC", params: { orderId: "2" } }) === "2" && providerOrderIdOf("cj_dropshipping", { type: "PRODUCT", params: {} }) === null && providerOrderIdOf("gelato", { orderId: "g1" }) === "g1")
    /* CJ's detail may leave out our number: then only an order whose timeline says it went to CJ as this very order. */
    reset([(c) => (c.method === "GET" && c.url.includes("getOrderDetail") ? cjOk({ orderId: "210823100016290555", orderStatus: "SHIPPED", trackNumber: "CJPKL7160102171YQ", logisticName: "CJPacket Ordinary" }) : null), (c) => (c.url.includes("trackInfo") ? cjOk([]) : null)])
    const log3: any[] = []
    await handleProviderWebhook(db, { provider: "cj_dropshipping", creatorId: CREATOR, raw: JSON.stringify({ type: "ORDER", params: { cjOrderId: "210823100016290555", orderNumber: externalIdOf(CHECKOUT) } }), signature: null }, deps(orderFixture(cLocation), log3))
    check("  matched through the timeline's CJ order id", log3.length === 1)
    const log4: any[] = []
    reset([(c) => (c.method === "GET" && c.url.includes("getOrderDetail") ? cjOk({ orderId: "999999999999", orderStatus: "SHIPPED", trackNumber: "X1", logisticName: "Y" }) : null), (c) => (c.url.includes("trackInfo") ? cjOk([]) : null)])
    const odd = await handleProviderWebhook(db, { provider: "cj_dropshipping", creatorId: CREATOR, raw: JSON.stringify({ type: "ORDER", params: { cjOrderId: "999999999999", orderNumber: externalIdOf(CHECKOUT) } }), signature: null }, deps(orderFixture(cLocation), log4))
    check("  another CJ order claiming our number is ignored", log4.length === 0 && (odd.body as any).ignored === true)
    const gone = await handleProviderWebhook(db, { provider: "cj_dropshipping", creatorId: "22222222-2222-4222-8222-222222222222", raw, signature: null }, deps(orderFixture(cLocation)))
    check("a shop that isn't connected answers 410", gone.status === 410)
  }

  console.log("\nCJ: stock in step for the products that ask, read from CJ\n")
  {
    const db = cdb
    const stockRoute: Route = (c) => (c.method === "GET" && c.url.startsWith(`${CJ}/product/stock/queryByVid`) ? cjOk([{ vid: "1424608152007086080", areaId: "1", areaEn: "China Warehouse", countryCode: "CN", totalInventoryNum: 120, storageNum: 999 }, { vid: "1424608152007086080", areaId: "2", areaEn: "US Warehouse", countryCode: "US", totalInventoryNum: 12 }]) : null)
    const levels = new Map<string, number>([[VARIANT_M, 3]])
    const moves: any[] = []
    reset([stockRoute])
    const off = await syncCjStock(db, CREATOR, stockDeps(levels, moves))
    check("no product asked for it: nothing read, nothing moved", off.ok === true && off.synced === 0 && calls.length === 0 && moves.length === 0)
    const on = await setStockSync(db, CREATOR, PRODUCT, true, stockDeps(levels, moves))
    check("turned on for a product: its matched variant takes CJ's stock in the ships from country (CN: 120)", on.ok === true && on.synced === 1 && moves.length === 1 && moves[0].delta === 117 && levels.get(VARIANT_M) === 120 && moves[0].locationId === cLocation)
    const link = db.rows("fulfilment_variant_links").find((l) => l.variant_id === VARIANT_M && l.provider === "cj_dropshipping")!
    check("  the row shows CJ's number and when", link.stock_level === 120 && link.stock_synced_at === "2026-10-11T12:00:00.000Z" && link.stock_error === null)
    moves.length = 0
    await syncCjStock(db, CREATOR, stockDeps(levels, moves))
    check("the same number again moves nothing", moves.length === 0)
    reset([stockRoute])
    const hook = await handleProviderWebhook(db, { provider: "cj_dropshipping", creatorId: CREATOR, raw: JSON.stringify({ type: "STOCK", messageType: "REDUCE", params: { "1424608152007086080": [{ vid: "1424608152007086080", countryCode: "CN", storageNum: 0 }], "7777777777777777777": [{ storageNum: 5 }] } }), signature: null }, deps(orderFixture(cLocation), [], [], stockDeps(levels, moves)))
    check("a STOCK message: only those variants read again from CJ, the body's 0 not believed", hook.status === 200 && calls.filter((c) => c.url.includes("queryByVid")).length === 1 && levels.get(VARIANT_M) === 120)
    reset([(c) => (c.url.includes("queryByVid") ? { status: 503, body: {} } : null)])
    const busy = await syncCjStock(db, CREATOR, stockDeps(levels, moves))
    check("CJ down: the stock is kept and the row says why", busy.ok === true && busy.failed === 1 && levels.get(VARIANT_M) === 120 && /CJ Dropshipping had a problem/.test(db.rows("fulfilment_variant_links").find((l) => l.variant_id === VARIANT_M && l.provider === "cj_dropshipping")!.stock_error))
    const offAgain = await setStockSync(db, CREATOR, PRODUCT, false, stockDeps(levels, moves))
    check("turned off: the product keeps its stock as it is", offAgain.ok === true && db.rows("fulfilment_variant_links").every((l) => l.provider !== "cj_dropshipping" || l.stock_sync === false))
    const noLinks = await setStockSync(freshDb(), CREATOR, PRODUCT, true, stockDeps(levels, moves))
    check("a product with nothing matched can't turn it on", noLinks.ok === false)
  }

  console.log("\nWhat the seller sees and reads\n")
  {
    const market = read("components/physical/integrations-marketplace.tsx")
    const links = read("components/physical/partner-links.tsx")
    check("the card asks for each key in the provider's own words", /Gelato API key/.test(market) && /CJ API key/.test(market) && /CJ1234567@api@/.test(market))
    check("Gelato's card: a shipment method from Gelato's list and the address to paste in Gelato", /GelatoChoices/.test(market) && /shipment-methods/.test(market) && /Developer › Webhooks/.test(market))
    check("CJ's card: ships from, shipping method, and drafts said as unpaid orders", /CjChoices/.test(market) && /Unpaid, to pay in CJ/.test(market) && /paid from your CJ balance/.test(market))
    check("Match products: CJ search by SKU or words, product variants, Gelato UID and print file", /Search CJ/.test(links) && /search\?pid=/.test(links) && /Gelato product UID/.test(links) && /Print file/.test(links) && /Keep stock in step with CJ/.test(links))
    check("routes: owner only, rate limited, the partner asked with the seller's key", ["links", "search", "shipment-methods"].every((r) => /physicalCaller\(\)/.test(read(`app/api/physical/integrations/[provider]/${r}/route.ts`)) && /rateLimit\(/.test(read(`app/api/physical/integrations/[provider]/${r}/route.ts`))))
    check("the job queue runs CJ's six hourly stock round", /case "inventory_sync":[\s\S]{0,200}runStockSyncJob/.test(read("lib/physical/jobs-server.ts")))
    const art = helpArticle("physical-products", "gelato-and-cj-dropshipping")
    const text = JSON.stringify(art?.body ?? [])
    check("a help article: key, matching, drafts or paid, tracking, stock", !!art && /CJ1234567@api@/.test(text) && /Match products/.test(text) && /product UID/.test(text) && /Keep stock in step with CJ/.test(text) && /Developer, Webhooks/.test(text))
    const integrationsText = JSON.stringify(helpArticle("physical-products", "integrations")?.body ?? [])
    check("  and the integrations article no longer calls them Coming soon", !/Gelato, CJ Dropshipping", "Coming soon/.test(integrationsText) && /match each variant to a CJ variant/.test(integrationsText))
    const docs = read("lib/admin/commerce-docs.ts")
    check("the admin guide documents Gelato and CJ with how to check them", /id: "gelato-cj"/.test(docs) && /fulfilment_variant_links \(SQL part 167\)/.test(docs) && /gelato-and-cj-dropshipping/.test(docs))
  }

  console.log("\nSQL part 167\n")
  {
    const sql = read("supabase/sql/run-now/167_partner_variant_links.sql")
    const lines = sql.trim().split("\n")
    check("one statement per line, a DO block on one line, notify last", lines.length === 3 && lines[0].startsWith("/*") && /^DO \$do\$ BEGIN .* END \$do\$;$/.test(lines[1]) && lines[2] === "notify pgrst, 'reload schema';")
    check("idempotent, server only, its checks", /CREATE TABLE IF NOT EXISTS public\.fulfilment_variant_links/.test(sql) && /CREATE INDEX IF NOT EXISTS/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.fulfilment_variant_links FROM PUBLIC, anon, authenticated/.test(sql) && /UNIQUE \(creator_id, provider, variant_id\)/.test(sql) && /file_url LIKE 'https:\/\/%'/.test(sql))
    check("the migration copy is the same text", existsSync(join(process.cwd(), "supabase/migrations/20270112_partner_variant_links.sql")) && read("supabase/migrations/20270112_partner_variant_links.sql") === sql)
    check("the README lists it with its size, and the check after has its column", read("supabase/sql/run-now/README.md").includes(`| \`167_partner_variant_links.sql\` |`) && read("supabase/sql/run-now/README.md").includes(`| 3 | ${sql.length.toLocaleString("en-US")} |`) && /as p167_partner_variant_links;?/.test(read("supabase/sql/run-now/99_check_after.sql")))
  }

  console.log("\nCopy rules and no real address\n")
  {
    const files = ["lib/integrations/fulfilment/gelato.ts", "lib/integrations/fulfilment/cj.ts", "lib/integrations/fulfilment/links-server.ts", "lib/integrations/fulfilment/stock-deps-server.ts", "components/physical/partner-links.tsx", "app/api/physical/integrations/[provider]/links/route.ts", "app/api/physical/integrations/[provider]/search/route.ts", "app/api/physical/integrations/[provider]/shipment-methods/route.ts", "supabase/sql/run-now/167_partner_variant_links.sql"]
    for (const f of files) {
      const t = read(f)
      check(`${f}: no em dash, none of the banned words`, !t.includes("—") && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(t))
    }
    check("every address the suite saw was a stub of Gelato's or CJ's documented hosts", strayHosts.length === 0, strayHosts)
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
