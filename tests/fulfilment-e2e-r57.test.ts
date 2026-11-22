/**
 * ROUND 57 (E2): EVERYTHING AFTER AN ORDER IS PAID, ONE ORDER AT A TIME
 *
 * Over the journey harness (tests/_journey: an in-memory PostgREST with the
 * database functions ported, a Stripe world whose webhooks are signed, the
 * real routes, the cron, Mailgun's mailbox), with Printful stubbed at its
 * documented API (developers.printful.com, v1), Supabase Storage's signer and
 * a 3PL's own https endpoint stubbed at the socket. Every outbound request
 * and the rows each step writes are asserted.
 *
 *   connect      Printful: a key it refuses is not saved; one it takes is
 *                sealed, never sent back, its webhook address registered
 *   one order    a lamp the seller ships, a tee and a hoodie Printful prints,
 *                an ebook: Printful gets the two prints once with the address,
 *                the ebook opens by its own receipt link only, 5 minutes
 *   two parcels  Printful ships the tee, then the hoodie: each parcel ships
 *                only its own items with its own number (it used to ship
 *                both with the first number and drop the second); replayed,
 *                nothing moves twice
 *   the seller   ships the lamp with a DHL link; delivered; the buyer's page,
 *                the order list and the order agree
 *   failures     Printful down: retried, one order; Printful's refusal on the
 *                order and on Settings, then Send again
 *   refunds      partial: nothing about fulfilment moves; the rest: the order
 *                cancelled, the stock released, Printful's order cancelled
 *   own system   a 3PL by signed webhook: the body is checked against its
 *                signature; its tracking without location_id ships its own
 *                item only (it used to ship the seller's lamp as well)
 *   disconnect   Printful's webhook removed there, the key gone, a later
 *                delivery refused, the next order said to send by hand
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES)
 */
import "./_journey/env"
import { createHmac } from "node:crypto"
import { EventEmitter } from "node:events"
import https from "node:https"
import { createAdminClient } from "@/lib/supabase/admin"
import { Journey, type Person } from "./_journey/harness"
import { openSecret } from "@/lib/physical/secrets"
import { loadOrder } from "@/lib/physical/orders-server"
import { readPrintfulOrder } from "@/lib/integrations/fulfilment/printful"
import { readGelatoOrder } from "@/lib/integrations/fulfilment/gelato"
import { parcelItems } from "@/lib/physical/partner-server"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")

const PF_KEY = "printful-r57-token-0001"
const hex = (id: string) => id.replace(/-/g, "")

type PfOrder = { id: number; external_id: string; status: string; body: any; items: { id: number; external_id: string; quantity: number; sync_variant_id: number }[]; shipments: any[] }

async function main() {
  const j = await Journey.start()

  section("1. A euro store that ships a lamp itself and prints with Printful")
  const seller = await j.signUp("r57@example.com", { name: "Rita Fifty" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "rita-r57" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Rita Shop", supportEmail: "hello@rita.example", defaultCountry: "DE" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "DE", businessName: "Rita Shop GmbH" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  await j.call("POST /api/settings/payments", { as: seller, body: { defaultCurrency: "EUR" } })
  await j.call("PUT /api/store/currency", { as: seller, body: { country: "DE", currency: "EUR", key: "rita-eur-1" } })
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "hybrid" } })
  const workshop = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${workshop}`, { as: seller, body: { name: "Workshop", kind: "home", addressLine1: "Hauptstr. 1", city: "Berlin", postalCode: "10115", country: "DE" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["DE"], name: "Germany" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("DE"))
  const rate = await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Standard", priceCents: 500, minDays: 1, maxDays: 3 } })
  check("the store, its workshop, a German zone and a flat rate", rate.status === 200 && !!workshop, rate.json)

  section("2. Printful connects: the key checked, sealed, never sent back, its webhook registered")
  const pfOrders = new Map<number, PfOrder>()
  let hook: { url: string | null; types: string[] } = { url: null, types: [] }
  let down = 0
  const pj = (b: unknown, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } })
  let itemSeq = 700
  j.providers.on("api.printful.com", (x) => {
    if (x.headers.get("authorization") !== `Bearer ${PF_KEY}`) return pj({ code: 401, result: "Unauthorized", error: { reason: "Unauthorized", message: "Invalid token" } }, 401)
    if (x.method === "GET" && x.path === "/stores") return pj({ code: 200, result: [{ id: 4321, name: "Rita Prints", type: "native" }] })
    if (x.path === "/webhooks") {
      if (x.method === "GET") return pj({ code: 200, result: { url: hook.url, types: hook.types } })
      if (x.method === "POST") hook = { url: x.body?.url ?? null, types: x.body?.types ?? [] }
      if (x.method === "DELETE") hook = { url: null, types: [] }
      return pj({ code: 200, result: hook })
    }
    if (x.headers.get("x-pf-store-id") !== "4321") return pj({ code: 400, result: "This API endpoint applies only to a store", error: { message: "No store" } }, 400)
    if (x.method === "GET" && x.path === "/store/products") return pj({ code: 200, result: [{ id: 77, name: "Tee" }], paging: { total: 1, offset: 0, limit: 100 } })
    if (x.method === "GET" && x.path === "/store/products/77") return pj({ code: 200, result: { sync_product: { id: 77 }, sync_variants: [{ id: 5501, sku: "TEE-M" }, { id: 5502, sku: "HOODIE-L" }] } })
    if (x.method === "POST" && x.path === "/orders") {
      if (down > 0) {
        down--
        return pj({ code: 503, result: "Service unavailable" }, 503)
      }
      const had = [...pfOrders.values()].find((o) => o.external_id === x.body?.external_id)
      const id = had?.id ?? 9100 + pfOrders.size + 1
      const items = (x.body?.items ?? []).map((i: any) => ({ id: ++itemSeq, external_id: i.external_id, quantity: i.quantity, sync_variant_id: i.sync_variant_id }))
      pfOrders.set(id, { id, external_id: x.body?.external_id, status: x.query.get("confirm") === "true" ? "pending" : "draft", body: x.body, items, shipments: [] })
      return pj({ code: 200, result: { id, external_id: x.body?.external_id, status: pfOrders.get(id)!.status, costs: { currency: "EUR", total: "21.40" } } })
    }
    const one = /^\/orders\/(\d+)$/.exec(x.path)
    if (one) {
      const o = pfOrders.get(Number(one[1]))
      if (!o) return pj({ code: 404, result: "Not found", error: { message: "Order not found" } }, 404)
      if (x.method === "DELETE") {
        o.status = "canceled"
        return pj({ code: 200, result: { id: o.id, status: "canceled" } })
      }
      return pj({ code: 200, result: { id: o.id, external_id: o.external_id, status: o.status, items: o.items, shipments: o.shipments } })
    }
    return null
  })
  const wrong = await j.call("PUT /api/physical/integrations/printful", { as: seller, body: { apiKey: "not-the-printful-key" } })
  check("a key Printful refuses is not saved", wrong.status === 400 && /did not accept/.test(wrong.json?.error ?? "") && !j.rows("commerce_integrations").some((r) => r.provider === "printful"), wrong.json)
  const connected = await j.call("PUT /api/physical/integrations/printful", { as: seller, body: { apiKey: PF_KEY, autoConfirm: true } })
  const pfRow = j.rows("commerce_integrations").find((x) => x.provider === "printful")!
  const pfLoc = j.rows("inventory_locations").find((l) => l.integration_id === pfRow?.id)?.id as string
  check("Printful connects: its store named, a location of its own", connected.status === 200 && pfRow?.status === "connected" && pfRow?.account_label === "Rita Prints" && !!pfLoc, { status: connected.status, json: connected.json })
  check("  the key is stored sealed (not as typed) and opens to itself", typeof pfRow.secret_ciphertext === "string" && !pfRow.secret_ciphertext.includes(PF_KEY) && openSecret(pfRow.secret_ciphertext) === PF_KEY && !JSON.stringify(pfRow.config ?? {}).includes(PF_KEY), { cipher: String(pfRow.secret_ciphertext).slice(0, 12) })
  const listed = await j.call("GET /api/physical/integrations", { as: seller })
  const pfView = (listed.json?.integrations ?? []).find((i: any) => i.provider === "printful")
  check("  Settings reads it back without the key, only its last four", listed.status === 200 && !JSON.stringify(listed.json).includes(PF_KEY) && /0001$/.test(pfView?.keyHint ?? "") && pfView?.webhooks === "on", pfView)
  const hookPath = hook.url ? new URL(hook.url).pathname : ""
  check("  Printful is given Storelib's address with a token only Storelib can make, for shipped, failed, cancelled and held", new RegExp(`^/api/integrations/webhooks/printful/${creator.id}\\.[A-Za-z0-9_-]{32}$`).test(hookPath) && ["package_shipped", "order_failed", "order_canceled", "order_put_hold"].every((t) => hook.types.includes(t)), hook)

  const lampId = newProduct(j, creator.id, "Desk Lamp", 4000, "physical")
  await j.call(`PUT /api/physical/products/${lampId}`, { as: seller, body: { variants: [{ options: [], priceCents: 4000, sku: "LAMP", weightGrams: 900, stock: { [workshop]: 10 } }], requiresShipping: true, weightGrams: 900, taxable: true, trackInventory: true, fulfillmentMethod: "self", fulfillmentLocationId: workshop } })
  const teeId = newProduct(j, creator.id, "Studio Tee", 2500, "physical")
  await j.call(`PUT /api/physical/products/${teeId}`, { as: seller, body: { variants: [{ options: [], priceCents: 2500, sku: "TEE-M", weightGrams: 200, stock: {} }], requiresShipping: true, weightGrams: 200, taxable: true, fulfillmentLocationId: pfLoc, fulfillmentMethod: "print_on_demand" } })
  const hoodieId = newProduct(j, creator.id, "Studio Hoodie", 4500, "physical")
  await j.call(`PUT /api/physical/products/${hoodieId}`, { as: seller, body: { variants: [{ options: [], priceCents: 4500, sku: "HOODIE-L", weightGrams: 500, stock: {} }], requiresShipping: true, weightGrams: 500, taxable: true, fulfillmentLocationId: pfLoc, fulfillmentMethod: "print_on_demand" } })
  const ebookId = newProduct(j, creator.id, "Lamp Care Guide", 900, "digital")
  const [asset] = j.db.insert("digital_assets", { product_id: ebookId, file_name: "lamp-care.pdf", file_path: `${creator.id}/lamp-care.pdf`, storage_bucket: "digital-products", file_size: 120_000, mime_type: "application/pdf", scan_status: "clean", upload_status: "completed" }, {})
  const signs: { path: string; expiresIn: number }[] = []
  j.net.routes.unshift({
    match: (u) => u.pathname.startsWith("/storage/v1/object/sign/digital-products/"),
    answer: async (req) => {
      const path = decodeURIComponent(new URL(req.url).pathname.replace("/storage/v1/object/sign/digital-products/", ""))
      const body = (await req.json().catch(() => ({}))) as { expiresIn?: number }
      signs.push({ path, expiresIn: Number(body.expiresIn) })
      return new Response(JSON.stringify({ signedURL: `/object/sign/digital-products/${path}?token=signed-${signs.length}` }), { status: 200, headers: { "content-type": "application/json" } })
    },
  })
  const lampLevel = () => j.rows("inventory_levels").find((l) => l.location_id === workshop && j.rows("product_variants").some((v) => v.id === l.variant_id && v.product_id === lampId)) ?? { on_hand: 0, committed: 0 }

  section("3. One order: a lamp the seller ships, a tee and a hoodie Printful prints, an ebook")
  const ada = { name: "Ada Mix", line1: "Gartenweg 2", line2: "3. OG", city: "Berlin", postalCode: "10117", country: "DE", phone: "+49 30 1234567" }
  const a = await buyByCard(j, creator.id, [{ productId: lampId, variantId: null, quantity: 1 }, { productId: teeId, variantId: null, quantity: 2 }, { productId: hoodieId, variantId: null, quantity: 1 }, { productId: ebookId, variantId: null, quantity: 1 }], "ada@example.com", ada, "r57-mix-a")
  await runJobs(j)
  await runJobs(j)
  const aLines = j.rows("orders").filter((o) => o.checkout_id === a?.id)
  const lineOf = (pid: string) => aLines.find((o) => o.product_id === pid)!
  const posts = j.providers.to("api.printful.com", /^\/orders$/).filter((c) => c.method === "POST")
  const sent = posts[0]?.body
  check("paid: four lines, the lamp at the workshop, the prints at Printful's location", a?.status === "paid" && aLines.length === 4 && lineOf(lampId)?.fulfillment_location_id === workshop && lineOf(teeId)?.fulfillment_location_id === pfLoc && lineOf(hoodieId)?.fulfillment_location_id === pfLoc, aLines.map((o) => [o.product_id === lampId ? "lamp" : o.product_id, o.fulfillment_location_id, o.requires_shipping]))
  check("Printful is sent one order, once, after two cron rounds", posts.length === 1 && pfOrders.size === 1, posts.map((p) => p.body?.external_id))
  check(
    "  with exactly the tee (2) and the hoodie (1) by their Printful variants, each with its line's id",
    JSON.stringify((sent?.items ?? []).map((i: any) => [i.sync_variant_id, i.quantity, i.external_id])) === JSON.stringify([[5501, 2, hex(lineOf(teeId).id)], [5502, 1, hex(lineOf(hoodieId).id)]]),
    sent?.items,
  )
  check(
    "  to the buyer's address, as typed, for this order, straight to production as the seller chose",
    sent?.external_id === hex(a!.id) && sent?.recipient?.name === "Ada Mix" && sent?.recipient?.address1 === "Gartenweg 2" && sent?.recipient?.address2 === "3. OG" && sent?.recipient?.city === "Berlin" && sent?.recipient?.zip === "10117" && sent?.recipient?.country_code === "DE" && sent?.recipient?.phone === "+49301234567" && sent?.recipient?.email === "ada@example.com" && posts[0].query.get("confirm") === "true" && posts[0].query.get("update_existing") === "true",
    { body: sent, query: posts[0]?.query.toString() },
  )
  let order = await orderOf(j, seller, a!.id)
  const forwarded = (order?.events ?? []).filter((e: any) => e.kind === "fulfillment.forwarded")
  check("  the timeline says so once, with what Printful charges; nothing asks the seller to send it", forwarded.length === 1 && forwarded[0].detail?.cost_cents === 2140 && !(order?.events ?? []).some((e: any) => e.kind === "fulfillment.manual_needed"), (order?.events ?? []).map((e: any) => [e.kind, e.message]))
  check("  nothing has shipped: unfulfilled (the ebook is not something to ship)", order?.fulfillmentStatus === "unfulfilled" && order?.lines?.find((l: any) => l.productId === ebookId)?.requiresShipping === false, order?.fulfillmentStatus)
  const ebookLine = lineOf(ebookId)
  const dl = await j.call(`GET /api/download/${asset.id}?receipt=${ebookLine.receipt_token}`)
  check("the ebook opens by its receipt link: a signed link made for this request, for 5 minutes", dl.status === 200 && /token=signed-/.test(dl.json?.downloadUrl ?? "") && dl.json?.expiresIn === 300 && signs.length === 1 && signs[0].path === `${creator.id}/lamp-care.pdf` && signs[0].expiresIn === 300 && !JSON.stringify(dl.json).includes("digital-products\""), { status: dl.status, json: dl.json, signs })
  const otherLink = await j.call(`GET /api/download/${asset.id}?receipt=${lineOf(lampId).receipt_token}`)
  const noLink = await j.call(`GET /api/download/${asset.id}`)
  check("  the lamp's receipt link does not open it, nor no link at all", otherLink.status === 403 && noLink.status === 403 && signs.length === 1, { other: otherLink.json, none: noLink.json })

  section("4. Printful ships in two parcels: each ships its own items with its own number")
  const pfA = [...pfOrders.values()][0]
  const teeItem = pfA.items.find((i) => i.sync_variant_id === 5501)!
  const hoodieItem = pfA.items.find((i) => i.sync_variant_id === 5502)!
  const say = (path: string, orderId: number) => j.call(`POST ${path}`, { raw: JSON.stringify({ type: "package_shipped", created: Math.floor(Date.now() / 1000), retries: 0, store: 4321, data: { shipment: { id: 1 }, order: { id: orderId, external_id: pfA.external_id } } }), headers: { "content-type": "application/json" } })
  const readsBefore = j.providers.to("api.printful.com", new RegExp(`^/orders/${pfA.id}$`)).length
  const forged = await say(hookPath.replace(/\.[A-Za-z0-9_-]{32}$/, `.${"A".repeat(32)}`), pfA.id)
  const otherStore = await say(hookPath.replace(creator.id, "00000000-0000-4000-8000-000000000000"), pfA.id)
  check("a delivery to an address Storelib did not make is refused before anything is read", forged.status === 404 && otherStore.status === 404 && j.providers.to("api.printful.com", new RegExp(`^/orders/${pfA.id}$`)).length === readsBefore, { forged: forged.json, other: otherStore.json })
  pfA.status = "partial"
  pfA.shipments = [{ id: 1, carrier: "DHL", service: "DHL Paket", tracking_number: "JJD000390001111111", tracking_url: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=JJD000390001111111", items: [{ item_id: teeItem.id, quantity: 2 }] }]
  const first = await say(hookPath, pfA.id)
  await runJobs(j)
  order = await orderOf(j, seller, a!.id)
  const teeShip = (order?.shipments ?? []).find((s: any) => s.trackingNumber === "JJD000390001111111")
  check("the tee's parcel: the order read back from Printful, the tee shipped, the hoodie still Printful's to ship", first.status === 200 && first.json?.shipped === 1 && JSON.stringify(teeShip?.items) === JSON.stringify([{ orderId: lineOf(teeId).id, quantity: 2 }]) && order?.lines?.find((l: any) => l.productId === hoodieId)?.fulfilled === 0 && order?.fulfillmentStatus === "partially_fulfilled", { hook: first.json, items: teeShip?.items, status: order?.fulfillmentStatus })
  check("  shipped by Printful, with its DHL link", teeShip?.provider === "printful" && teeShip?.carrier === "DHL" && teeShip?.trackingUrl?.startsWith("https://www.dhl.de/"), teeShip)
  const again = await say(hookPath, pfA.id)
  await runJobs(j)
  const onTheWay = () => j.net.to("ada@example.com").filter((m) => /on the way/i.test(m.subject))
  check("  Printful sends it again: nothing moves twice, one email", again.status === 200 && again.json?.shipped === 0 && j.rows("fulfillments").filter((f) => f.checkout_id === a!.id).length === 1 && onTheWay().length === 1 && /JJD000390001111111/.test(words(onTheWay()[0].html)), { again: again.json, mails: j.net.to("ada@example.com").map((m) => m.subject) })
  pfA.status = "fulfilled"
  pfA.shipments.push({ id: 2, carrier: "DHL", service: "DHL Paket", tracking_number: "JJD000390002222222", tracking_url: null, items: [{ item_id: hoodieItem.id, quantity: 1 }] })
  const second = await say(hookPath, pfA.id)
  await runJobs(j)
  order = await orderOf(j, seller, a!.id)
  const hoodieShip = (order?.shipments ?? []).find((s: any) => s.trackingNumber === "JJD000390002222222")
  check("the hoodie's parcel ships the hoodie with its own number (it used to be lost)", second.status === 200 && second.json?.shipped === 1 && JSON.stringify(hoodieShip?.items) === JSON.stringify([{ orderId: lineOf(hoodieId).id, quantity: 1 }]), { hook: second.json, shipments: (order?.shipments ?? []).map((s: any) => [s.trackingNumber, s.items]) })
  check("  and the buyer is emailed that number too", onTheWay().length === 2 && /JJD000390002222222/.test(words(onTheWay()[1].html)), j.net.to("ada@example.com").map((m) => m.subject))
  check("  the lamp is still the seller's: partly fulfilled", order?.fulfillmentStatus === "partially_fulfilled" && order?.lines?.find((l: any) => l.productId === lampId)?.fulfilled === 0, order?.fulfillmentStatus)

  section("5. The seller ships the lamp; delivered; the buyer's page agrees")
  const committedBefore = lampLevel().committed
  const lampShip = await act(j, seller, a!.id, { action: "fulfil", items: [{ orderId: lineOf(lampId).id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434161234567890", key: "r57-lamp", locationId: workshop })
  const lampShipment = (lampShip.json?.order?.shipments ?? []).find((s: any) => s.trackingNumber === "00340434161234567890")
  check("Fulfill with DHL and a number: fulfilled, a working DHL tracking link, stock taken once", lampShip.status === 200 && lampShip.json?.order?.fulfillmentStatus === "fulfilled" && /^https:\/\/[^ ]*dhl[^ ]*00340434161234567890/.test(lampShipment?.trackingUrl ?? "") && lampLevel().committed === committedBefore - 1, { status: lampShip.json?.order?.fulfillmentStatus ?? lampShip.json, url: lampShipment?.trackingUrl, level: lampLevel() })
  const pressedAgain = await act(j, seller, a!.id, { action: "fulfil", items: [{ orderId: lineOf(lampId).id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434161234567890", key: "r57-lamp", locationId: workshop })
  check("  pressed again (same key): one shipment, stock untouched", pressedAgain.status === 200 && j.rows("fulfillments").filter((f) => f.checkout_id === a!.id && f.status !== "cancelled").length === 3 && lampLevel().committed === committedBefore - 1, { status: pressedAgain.status, json: pressedAgain.json?.error, n: j.rows("fulfillments").filter((f) => f.checkout_id === a!.id).length, level: lampLevel() })
  for (const s of lampShip.json?.order?.shipments ?? []) await act(j, seller, a!.id, { action: "shipment", fulfillmentId: s.id, status: "delivered" })
  await runJobs(j)
  order = await orderOf(j, seller, a!.id)
  const buyerView = await loadOrder(createAdminClient() as never, { receiptToken: a!.receipt_token })
  check("all three parcels delivered: delivered", order?.fulfillmentStatus === "delivered" && (order?.shipments ?? []).every((s: any) => s.status === "delivered"), (order?.shipments ?? []).map((s: any) => s.status))
  check(
    "  the buyer's order page reads the same: status, every parcel with its number and status",
    buyerView?.fulfillmentStatus === order?.fulfillmentStatus && JSON.stringify(buyerView?.shipments.map((s) => [s.trackingNumber, s.status]).sort()) === JSON.stringify((order?.shipments ?? []).map((s: any) => [s.trackingNumber, s.status]).sort()),
    { buyer: buyerView?.shipments.map((s) => [s.trackingNumber, s.status]), seller: (order?.shipments ?? []).map((s: any) => [s.trackingNumber, s.status]) },
  )
  const list = await j.call("GET /api/physical/orders", { as: seller })
  const row = (list.json?.orders ?? []).find((o: any) => o.id === a!.id)
  check("  and so does the Orders list", list.status === 200 && row?.fulfillmentStatus === "delivered", row)
  check("  the buyer was told each step once: three on the way, delivered", onTheWay().length === 3 && j.net.to("ada@example.com").filter((m) => /delivered/i.test(m.subject)).length >= 1, j.net.to("ada@example.com").map((m) => m.subject))

  section("6. Failures: Printful down, then Printful refusing, both shown with a way to retry")
  down = 1
  const b = await buyByCard(j, creator.id, [{ productId: teeId, variantId: null, quantity: 1 }], "bo@example.com", { ...ada, name: "Bo Retry" }, "r57-retry-b")
  if (down > 0) await j.cron()
  const bJob = () => j.rows("commerce_jobs").find((x) => x.kind === "forward_fulfillment" && x.payload?.checkoutId === b!.id)
  check("Printful answers 503: nothing made, the job kept to try again with the reason", down === 0 && ![...pfOrders.values()].some((o) => o.external_id === hex(b!.id)) && bJob()?.status === "failed" && /503|unavailable|busy/i.test(String(bJob()?.last_error ?? "")), bJob() && [bJob()!.status, bJob()!.last_error])
  await runJobs(j)
  await runJobs(j)
  check("  the cron tries again: one Printful order", [...pfOrders.values()].filter((o) => o.external_id === hex(b!.id)).length === 1 && bJob()?.status === "done", bJob() && [bJob()!.status, bJob()!.attempts])
  const shirtLess = newProduct(j, creator.id, "Studio Cap", 1800, "physical")
  await j.call(`PUT /api/physical/products/${shirtLess}`, { as: seller, body: { variants: [{ options: [], priceCents: 1800, sku: "CAP-ONE", weightGrams: 100, stock: {} }], requiresShipping: true, weightGrams: 100, taxable: true, fulfillmentLocationId: pfLoc, fulfillmentMethod: "print_on_demand" } })
  const c = await buyByCard(j, creator.id, [{ productId: shirtLess, variantId: null, quantity: 1 }], "cy@example.com", { ...ada, name: "Cy Refused" }, "r57-refused-c")
  await runJobs(j)
  order = await orderOf(j, seller, c!.id)
  const manual = (order?.events ?? []).find((e: any) => e.kind === "fulfillment.manual_needed")
  const pfAfter = ((await j.call("GET /api/physical/integrations", { as: seller })).json?.integrations ?? []).find((i: any) => i.provider === "printful")
  check("Printful has no CAP-ONE: the order says so, by its location, and to send it yourself", /Printful has no product with SKU CAP-ONE/.test(manual?.message ?? "") && manual?.detail?.location_id === pfLoc && ![...pfOrders.values()].some((o) => o.external_id === hex(c!.id)), manual)
  check("  Settings › Integrations shows Printful's last error too", /CAP-ONE/.test(pfAfter?.lastError ?? ""), pfAfter?.lastError)
  const resent = await act(j, seller, c!.id, { action: "resend", locationId: pfLoc })
  await runJobs(j)
  check("  Send again is taken and tried once more (still refused: said again, no order made)", resent.status === 200 && ![...pfOrders.values()].some((o) => o.external_id === hex(c!.id)) && ((await orderOf(j, seller, c!.id))?.events ?? []).filter((e: any) => e.kind === "fulfillment.manual_needed").length === 2, resent.json)

  section("7. Refunds: a part changes nothing about shipping; the rest cancels it everywhere")
  const d = await buyByCard(j, creator.id, [{ productId: lampId, variantId: null, quantity: 1 }, { productId: teeId, variantId: null, quantity: 1 }], "dee@example.com", { ...ada, name: "Dee Refund" }, "r57-refund-d")
  await runJobs(j)
  const dLines = j.rows("orders").filter((o) => o.checkout_id === d!.id)
  const dLamp = dLines.find((o) => o.product_id === lampId)!
  const dTee = dLines.find((o) => o.product_id === teeId)!
  const pfD = [...pfOrders.values()].find((o) => o.external_id === hex(d!.id))
  const levelBefore = { ...lampLevel() }
  const part = await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: dLamp.id, amount: 5, reason: "damaged" } })
  await runJobs(j)
  order = await orderOf(j, seller, d!.id)
  check("5.00 back on the lamp: partly refunded, still to ship, stock still held, Printful's order stands", part.status === 200 && order?.status === "partially_refunded" && order?.fulfillmentStatus === "unfulfilled" && !order?.cancelledAt && lampLevel().committed === levelBefore.committed && pfD?.status === "pending", { part: part.json, status: order?.status, f: order?.fulfillmentStatus, level: lampLevel(), pf: pfD?.status })
  const partShip = await act(j, seller, d!.id, { action: "fulfil", items: [{ orderId: dLamp.id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434169999999999", key: "r57-d-try" })
  check("  a partly refunded order can still be fulfilled", partShip.status === 200, partShip.json)
  const undone = await act(j, seller, d!.id, { action: "shipment", fulfillmentId: (partShip.json?.order?.shipments ?? [])[0]?.id, status: "cancelled" })
  check("  and the parcel undone, the lamp is to ship again", undone.status === 200 && undone.json?.order?.fulfillmentStatus === "unfulfilled", { status: undone.status, json: undone.json?.error ?? undone.json?.order?.shipments })
  const levelUnshipped = { ...lampLevel() }
  await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: dLamp.id } })
  await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: dTee.id } })
  await runJobs(j)
  await runJobs(j)
  order = await orderOf(j, seller, d!.id)
  const deletes = j.providers.to("api.printful.com", new RegExp(`^/orders/${pfD?.id}$`)).filter((x) => x.method === "DELETE")
  check("refunded in full before it shipped: the order is cancelled and says why", order?.status === "refunded" && !!order?.cancelledAt && (order?.events ?? []).some((e: any) => e.kind === "order.cancelled" && /Refunded in full before it shipped/.test(e.message)), { status: order?.status, total: order?.totalCents, refunded: order?.refundedCents, cancelled: order?.cancelledAt })
  check("  the lamp's unit is released from the order", lampLevel().committed === levelUnshipped.committed - 1 && lampLevel().on_hand === levelUnshipped.on_hand, { before: levelUnshipped, after: lampLevel() })
  check("  and Printful's order is cancelled there, once", deletes.length === 1 && pfD?.status === "canceled" && (order?.events ?? []).some((e: any) => e.kind === "fulfillment.partner_cancelled"), { deletes: deletes.length, pf: pfD?.status })

  section("8. A 3PL's own system, by signed webhook")
  const HOOK_SECRET = "whsec-3pl-r57-0123456789"
  const own = await j.call("PUT /api/physical/integrations/custom_webhook", { as: seller, body: { url: "https://ops.fast3pl.example/storelib", webhookSecret: HOOK_SECRET } })
  const ownRow = j.rows("commerce_integrations").find((x) => x.provider === "custom_webhook")
  check("your own system is saved, its secret sealed", own.status === 200 && ownRow?.status === "connected" && !String(ownRow?.webhook_secret_ciphertext ?? "").includes(HOOK_SECRET) && openSecret(ownRow?.webhook_secret_ciphertext) === HOOK_SECRET && !JSON.stringify(own.json).includes(HOOK_SECRET), own.json)
  const placed = await j.call("POST /api/physical/locations", { as: seller, body: { name: "Fast 3PL", kind: "third_party_logistics", forwarding: "webhook", addressLine1: "Lagerweg 5", city: "Potsdam", postalCode: "14467", country: "DE" } })
  const tplLoc = (placed.json?.location?.id ?? j.rows("inventory_locations").find((l) => l.name === "Fast 3PL")?.id) as string
  const mugId = newProduct(j, creator.id, "Stone Mug", 1600, "physical")
  await j.call(`PUT /api/physical/products/${mugId}`, { as: seller, body: { variants: [{ options: [], priceCents: 1600, sku: "MUG-3PL", weightGrams: 400, stock: { [tplLoc]: 30 } }], requiresShipping: true, weightGrams: 400, taxable: true, trackInventory: true, fulfillmentMethod: "warehouse", fulfillmentLocationId: tplLoc } })
  const deliveries = stubHttpsPost(201)
  const e = await buyByCard(j, creator.id, [{ productId: lampId, variantId: null, quantity: 1 }, { productId: mugId, variantId: null, quantity: 2 }], "eve@example.com", { ...ada, name: "Eve Warehouse" }, "r57-3pl-e")
  await runJobs(j)
  const delivered = deliveries.calls.filter((x) => x.headers["x-storelib-event"] === "order.paid")
  const dBody = delivered[0] ? JSON.parse(delivered[0].body) : null
  const ts = delivered[0]?.headers["x-storelib-timestamp"] ?? ""
  check("the order goes to your system once, to its address", delivered.length === 1 && delivered[0].url === "https://ops.fast3pl.example/storelib" && dBody?.order?.id === e!.id, deliveries.calls.map((x) => [x.url, x.headers["x-storelib-event"]]))
  check("  signed: v1 = HMAC-SHA256 of \"<timestamp>.<body>\" with your secret", delivered[0]?.headers["x-storelib-signature"] === `v1=${createHmac("sha256", HOOK_SECRET).update(`${ts}.${delivered[0]?.body}`).digest("hex")}`, delivered[0]?.headers)
  check("  with the mug only (the lamp is the seller's), the address and where to report back", JSON.stringify((dBody?.order?.lines ?? []).map((l: any) => [l.sku, l.quantity])) === JSON.stringify([["MUG-3PL", 2]]) && dBody?.order?.location_id === tplLoc && dBody?.order?.address?.city === "Berlin" && dBody?.order?.tracking_endpoint === "https://storelib.com/api/physical/partner-tracking", dBody?.order)
  const report = (body: Record<string, unknown>, secret = HOOK_SECRET) => {
    const raw = JSON.stringify(body)
    const t = String(Math.floor(Date.now() / 1000))
    return j.call("POST /api/physical/partner-tracking", { raw, headers: { "content-type": "application/json", "x-storelib-timestamp": t, "x-storelib-signature": `v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}` } })
  }
  const badSig = await report({ order_id: e!.id, carrier: "UPS", tracking_number: "1Z999AA10123456784" }, "not-the-secret-at-all")
  check("a report signed with another secret is refused, nothing ships", badSig.status === 401 && j.rows("fulfillments").filter((f) => f.checkout_id === e!.id).length === 0, badSig.json)
  const tracked = await report({ order_id: e!.id, carrier: "UPS", tracking_number: "1Z999AA10123456784" })
  await runJobs(j)
  order = await orderOf(j, seller, e!.id)
  const upsShip = (order?.shipments ?? []).find((s: any) => s.trackingNumber === "1Z999AA10123456784")
  check("its tracking without a location_id ships its own mug only; the lamp still waits for the seller (it shipped the lamp too)", tracked.status === 200 && tracked.json?.result === "shipped" && JSON.stringify(upsShip?.items) === JSON.stringify([{ orderId: j.rows("orders").find((o) => o.checkout_id === e!.id && o.product_id === mugId)!.id, quantity: 2 }]) && order?.fulfillmentStatus === "partially_fulfilled", { r: tracked.json, items: upsShip?.items, f: order?.fulfillmentStatus })
  check("  with UPS's link, and the buyer emailed", /^https:\/\/[^ ]*ups[^ ]*1Z999AA10123456784/i.test(upsShip?.trackingUrl ?? "") && j.net.to("eve@example.com").some((m) => /on the way/i.test(m.subject) && /1Z999AA10123456784/.test(words(m.html))), { url: upsShip?.trackingUrl, mails: j.net.to("eve@example.com").map((m) => m.subject) })
  const deliveredReport = await report({ order_id: e!.id, location_id: tplLoc, carrier: "UPS", tracking_number: "1Z999AA10123456784", status: "delivered" })
  check("  its later delivered moves that parcel on", deliveredReport.status === 200 && deliveredReport.json?.result === "updated" && ((await orderOf(j, seller, e!.id))?.shipments ?? []).find((s: any) => s.trackingNumber === "1Z999AA10123456784")?.status === "delivered", deliveredReport.json)
  deliveries.restore()

  section("9. Printful disconnected")
  const before = j.providers.calls.length
  const off = await j.call("PUT /api/physical/integrations/printful", { as: seller, body: { disconnect: true } })
  const offCalls = j.providers.calls.slice(before).filter((x) => x.host === "api.printful.com").map((x) => `${x.method} ${x.path}`)
  check("Printful is asked to stop sending to Storelib, and the key is gone", off.status === 200 && offCalls.includes("DELETE /webhooks") && hook.url === null && !j.rows("commerce_integrations").some((r) => r.provider === "printful"), { offCalls, row: j.rows("commerce_integrations").map((r) => r.provider) })
  const late = await say(hookPath, pfA.id)
  check("  a delivery to its old address is refused and reads nothing", late.status === 410 && j.providers.calls.length === before + offCalls.length, late.json)
  const f = await buyByCard(j, creator.id, [{ productId: teeId, variantId: null, quantity: 1 }], "fay@example.com", { ...ada, name: "Fay Manual" }, "r57-after-f")
  await runJobs(j)
  order = await orderOf(j, seller, f!.id)
  check("  the next tee is not sent anywhere, and the order says to send it yourself", ![...pfOrders.values()].some((o) => o.external_id === hex(f!.id)) && (order?.events ?? []).some((ev: any) => ev.kind === "fulfillment.manual_needed" && /not connected/.test(ev.message)), (order?.events ?? []).map((ev: any) => [ev.kind, ev.message]))

  section("10. Parcels from the providers' own words")
  const pfState = readPrintfulOrder({ id: 1, external_id: "x", status: "partial", items: [{ id: 11, external_id: "a".repeat(32) }, { id: 12, external_id: "b".repeat(32) }], shipments: [{ carrier: "USPS", tracking_number: "940011", items: [{ item_id: 12, quantity: 1 }] }, { carrier: "USPS", tracking_number: "940012", items: [{ item_id: 99, quantity: 1 }] }] })
  check("Printful: a parcel's items by the line ids sent; one naming an item Storelib did not send ships what is open", JSON.stringify(pfState.shipments.map((s) => s.items)) === JSON.stringify([[{ lineId: "b".repeat(32), quantity: 1 }], null]), pfState.shipments)
  const gState = readGelatoOrder({ id: "g1", orderReferenceId: "x", fulfillmentStatus: "shipped", items: [{ itemReferenceId: "a".repeat(32), quantity: 2, fulfillments: [{ trackingCode: "G-1" }] }, { itemReferenceId: "b".repeat(32), quantity: 1, fulfillments: [{ trackingCode: "G-2" }] }], shipment: { packages: [{ trackingCode: "G-3" }] } })
  check("Gelato: each item's own parcel; a package Gelato names without items ships what is open", JSON.stringify(gState.shipments.map((s) => [s.trackingNumber, s.items])) === JSON.stringify([["G-1", [{ lineId: "a".repeat(32), quantity: 2 }]], ["G-2", [{ lineId: "b".repeat(32), quantity: 1 }]], ["G-3", null]]), gState.shipments)
  const openNow = [{ orderId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", quantity: 2 }, { orderId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", quantity: 1 }]
  check("a parcel ships at most what is open of what it names; naming none ships everything open", JSON.stringify(parcelItems(openNow, [{ lineId: "a".repeat(32), quantity: 5 }])) === JSON.stringify([{ orderId: openNow[0].orderId, quantity: 2 }]) && parcelItems(openNow, null).length === 2 && parcelItems(openNow, [{ lineId: "c".repeat(32), quantity: 1 }]).length === 0)

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  check("no after() work threw", j.afterErrors.length === 0, j.afterErrors)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

/** POSTs made with node:https (the seller's own webhook, lib/physical/jobs-server.ts postJson), answered here at the socket. */
function stubHttpsPost(status: number) {
  const real = https.request
  const calls: { url: string; headers: Record<string, string>; body: string }[] = []
  ;(https as any).request = (u: URL, opts: { headers?: Record<string, string> }, cb: (res: EventEmitter & { statusCode: number; resume: () => void }) => void) => {
    const req = new EventEmitter() as EventEmitter & { setTimeout: () => void; end: (b: string) => void; destroy: () => void }
    req.setTimeout = () => undefined
    req.destroy = () => undefined
    req.end = (body: string) => {
      calls.push({ url: String(u), headers: Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])), body })
      const res = Object.assign(new EventEmitter(), { statusCode: status, resume: () => undefined })
      setImmediate(() => cb(res))
    }
    return req
  }
  return { calls, restore: () => ((https as any).request = real) }
}

async function orderOf(j: Journey, seller: Person, id: string) {
  return (await j.call(`GET /api/physical/orders/${id}`, { as: seller })).json?.order
}

/** Every queued job due now, run by the cron as production runs it (backoff skipped: run_after moved to now). */
async function runJobs(j: Journey) {
  for (const job of j.rows("commerce_jobs")) if (job.status === "queued" || job.status === "failed") job.run_after = new Date(Date.now() - 1000).toISOString()
  await j.cron()
}

function act(j: Journey, seller: Person, checkoutId: string, body: Record<string, unknown>) {
  return j.call(`POST /api/physical/orders/${checkoutId}`, { as: seller, body })
}

/** A cart bought through Stripe's page, the webhooks delivered as Stripe sends them; the checkout row after. */
async function buyByCard(j: Journey, shopId: string, items: { productId: string; variantId: null; quantity: number }[], email: string, address: Record<string, string>, clientKey: string) {
  const q = await j.call("POST /api/physical/checkout/quote", { body: { items, shopId, country: address.country, postalCode: address.postalCode } })
  const option = (q.json?.delivery?.options ?? []).find((o: any) => o.name === "Standard")?.id
  const start = await j.call("POST /api/physical/checkout", { body: { shopId, items, email, name: address.name, address, deliveryOptionId: option, clientKey } })
  const co = j.rows("commerce_checkouts").find((c) => c.client_key === clientKey)
  if (start.status !== 200 || !co?.stripe_session_id) {
    console.log("  checkout did not start:", start.status, JSON.stringify(start.json).slice(0, 400))
    return null
  }
  const paid = j.world.pay(co.stripe_session_id)
  await j.webhook("charge.succeeded", paid.charge!)
  await j.webhook("payment_intent.succeeded", paid.intent)
  await j.webhook("checkout.session.completed", j.world.expand(paid.session)!)
  return j.rows("commerce_checkouts").find((c) => c.id === co.id) ?? null
}

function newProduct(j: Journey, creatorId: string, title: string, priceCents: number, type: "physical" | "digital"): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type, title, slug, description: `<p>${title}</p>`, status: "published", price_cents: priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
