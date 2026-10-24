/**
 * ROUND AE3: HOLDS, SEND AGAIN, AND A CANCEL THAT REACHES THE PARTNER
 *
 * Over the journey harness (tests/_journey: in-memory PostgREST with the
 * database functions ported, a Stripe world, the real cron and routes), with
 * a stub of Printful's documented API (developers.printful.com, v1):
 *
 *   hold        an order held (Shopify's Hold fulfillment) refuses Fulfill
 *               and the bulk Fulfill until it is released, then ships
 *   send again  Printful refuses the first send (no product with that SKU):
 *               the order says so on the Printful card with the location,
 *               Send again after the SKU is fixed sends it once, with what
 *               Printful charges kept on the order
 *   held back   a send that failed (Printful down) is retried by the cron
 *               while the order is on hold: held back, nothing sent; the
 *               release sends it
 *   cancel      the shop cancels: Printful's order is cancelled too
 *               (DELETE /orders/{id}); one Printful refuses (in production)
 *               is said on the order, to cancel there
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES)
 */
import "./_journey/env"
import { Journey, type Person } from "./_journey/harness"
import { bulkRefusal } from "@/lib/physical/bulk-fulfil-server"
import { holdOf, partnerSendState } from "@/lib/physical/fulfilment-state"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

const PF_KEY = "printful-journey-token-0001"

async function main() {
  const j = await Journey.start()

  section("1. A euro store that ships some things itself and prints the rest with Printful")
  const seller = await j.signUp("hold@example.com", { name: "Hana Hold" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "hana-shop" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Hana Shop", supportEmail: "hello@hana.example", defaultCountry: "DE" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "DE", businessName: "Hana Shop GmbH" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  await j.call("POST /api/settings/payments", { as: seller, body: { defaultCurrency: "EUR" } })
  await j.call("PUT /api/store/currency", { as: seller, body: { country: "DE", currency: "EUR", key: "hana-eur-1" } })
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const workshop = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${workshop}`, { as: seller, body: { name: "Workshop", kind: "home", addressLine1: "Hauptstr. 1", city: "Berlin", postalCode: "10115", country: "DE" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["DE"], name: "Germany" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("DE"))
  await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Standard", priceCents: 500, minDays: 1, maxDays: 3 } })

  /* Printful, as its API answers: one store, its products by SKU, orders made and read back, cancelled while not started. */
  let skuThere = false
  let downOnce = 0
  const pfOrders = new Map<number, { id: number; external_id: string; status: string; body: any }>()
  const deletes: number[] = []
  const pj = (b: unknown, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } })
  j.providers.on("api.printful.com", (x) => {
    if (x.headers.get("authorization") !== `Bearer ${PF_KEY}`) return pj({ code: 401, result: "Unauthorized", error: { reason: "Unauthorized", message: "Invalid token" } }, 401)
    if (x.method === "GET" && x.path === "/stores") return pj({ code: 200, result: [{ id: 4321, name: "Hana Prints", type: "native" }] })
    if (x.path === "/webhooks") return x.method === "GET" ? pj({ code: 200, result: { url: null, types: [] } }) : pj({ code: 200, result: { url: x.body?.url, types: x.body?.types ?? [] } })
    if (x.method === "GET" && x.path === "/store/products") return pj({ code: 200, result: [{ id: 77, name: "Tee" }], paging: { total: 1, offset: 0, limit: 100 } })
    if (x.method === "GET" && x.path === "/store/products/77") return pj({ code: 200, result: { sync_product: { id: 77 }, sync_variants: [{ id: 5501, sku: skuThere ? "TEE-M" : "TEE-MEDIUM" }] } })
    if (x.method === "POST" && x.path === "/orders") {
      if (downOnce > 0) {
        downOnce--
        return pj({ code: 503, result: "Service unavailable" }, 503)
      }
      const had = [...pfOrders.values()].find((o) => o.external_id === x.body?.external_id)
      const id = had?.id ?? 9000 + pfOrders.size + 1
      pfOrders.set(id, { id, external_id: x.body?.external_id, status: x.query.get("confirm") === "true" ? "pending" : "draft", body: x.body })
      return pj({ code: 200, result: { id, external_id: x.body?.external_id, status: pfOrders.get(id)!.status, costs: { currency: "USD", subtotal: "11.25", shipping: "4.39", tax: "0.00", total: "15.64" } } })
    }
    const one = /^\/orders\/(\d+)$/.exec(x.path)
    if (one) {
      const o = pfOrders.get(Number(one[1]))
      if (!o) return pj({ code: 404, result: "Not found", error: { message: "Order not found" } }, 404)
      if (x.method === "DELETE") {
        if (o.status === "inprocess") return pj({ code: 400, result: "Order can not be canceled", error: { message: "Order is already being fulfilled and can't be canceled" } }, 400)
        deletes.push(o.id)
        o.status = "canceled"
        return pj({ code: 200, result: { id: o.id, status: "canceled" } })
      }
      return pj({ code: 200, result: { id: o.id, external_id: o.external_id, status: o.status, shipments: [] } })
    }
    return null
  })

  const connected = await j.call("PUT /api/physical/integrations/printful", { as: seller, body: { apiKey: PF_KEY } })
  const pfRow = j.rows("commerce_integrations").find((x) => x.provider === "printful")
  const pfLoc = j.rows("inventory_locations").find((l) => l.integration_id === pfRow?.id)?.id as string
  check("Printful connects with its token and makes its own location", connected.status === 200 && pfRow?.status === "connected" && !!pfLoc, { status: connected.status, json: connected.json, row: pfRow?.status })

  const lampId = newProduct(j, creator.id, "Desk Lamp", 4000)
  await j.call(`PUT /api/physical/products/${lampId}`, { as: seller, body: { variants: [{ options: [], priceCents: 4000, sku: "LAMP", weightGrams: 900, stock: { [workshop]: 10 } }], requiresShipping: true, weightGrams: 900, taxable: true, trackInventory: true, fulfillmentLocationId: workshop } })
  const teeId = newProduct(j, creator.id, "Studio Tee", 2500)
  const teeSaved = await j.call(`PUT /api/physical/products/${teeId}`, { as: seller, body: { variants: [{ options: [], priceCents: 2500, sku: "TEE-M", weightGrams: 200, stock: {} }], requiresShipping: true, weightGrams: 200, taxable: true, fulfillmentLocationId: pfLoc, fulfillmentMethod: "print_on_demand" } })
  check("the tee is printed by Printful", teeSaved.status === 200, teeSaved.json)
  const bea = { name: "Bea Buyer", line1: "Gartenweg 2", city: "Berlin", postalCode: "10117", country: "DE", phone: "+49 30 1234567" }

  section("2. Hold fulfillment on an order the shop ships")
  const a = await buyByCard(j, creator.id, [{ productId: lampId, variantId: null, quantity: 1 }], "bea@example.com", bea, "hold-order-a")
  const lampLine = j.rows("orders").find((o) => o.checkout_id === a!.id)!
  const held = await act(j, seller, a!.id, { action: "hold", reason: "address", note: "Check the flat number" })
  check("held, with the reason and the note on its timeline", held.status === 200 && holdOf(held.json?.order?.events ?? [])?.reason === "address" && holdOf(held.json?.order?.events ?? [])?.note === "Check the flat number", held.json?.order?.events?.slice?.(0, 3) ?? held.json)
  const refused = await act(j, seller, a!.id, { action: "fulfil", items: [{ orderId: lampLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434161234567890", key: "hold-try" })
  check("Fulfill is refused while it holds, and nothing ships", refused.status === 409 && /on hold \(Address to check\)/.test(refused.json?.error ?? "") && j.rows("fulfillments").filter((f) => f.checkout_id === a!.id).length === 0, refused.json)
  check("the bulk Fulfill leaves it, saying why", /^On hold \(Address to check\)/.test(bulkRefusal(held.json?.order) ?? ""), bulkRefusal(held.json?.order))
  const twice = await act(j, seller, a!.id, { action: "hold", reason: "fraud" })
  check("holding it again changes nothing", twice.status === 200 && holdOf(twice.json?.order?.events ?? [])?.reason === "address")
  const released = await act(j, seller, a!.id, { action: "release_hold" })
  check("released: no hold any more", released.status === 200 && holdOf(released.json?.order?.events ?? []) === null)
  const shipped = await act(j, seller, a!.id, { action: "fulfil", items: [{ orderId: lampLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434161234567890", key: "hold-after" })
  check("then it ships as always", shipped.status === 200 && shipped.json?.order?.fulfillmentStatus === "fulfilled", shipped.json?.order?.fulfillmentStatus ?? shipped.json)

  section("3. Printful refuses the first send: Send again, once the SKU is right")
  const b = await buyByCard(j, creator.id, [{ productId: teeId, variantId: null, quantity: 2 }], "cat@example.com", { ...bea, name: "Cat Buyer" }, "printful-order-b")
  await runJobs(j)
  let order = (await j.call(`GET /api/physical/orders/${b!.id}`, { as: seller })).json?.order
  let state = partnerSendState(order?.events ?? [], pfLoc)
  check("not sent: the Printful card says why, by its location", state?.state === "failed" && /no product with SKU TEE-M/.test((state as { message: string }).message) && pfOrders.size === 0, { state, events: (order?.events ?? []).map((e: any) => [e.kind, e.message]).slice(0, 5) })
  const early = await act(j, seller, b!.id, { action: "resend", locationId: workshop })
  check("Send again for a place that doesn't take orders is refused", early.status === 400, early.json)
  skuThere = true
  const again = await act(j, seller, b!.id, { action: "resend", locationId: pfLoc })
  await runJobs(j)
  order = (await j.call(`GET /api/physical/orders/${b!.id}`, { as: seller })).json?.order
  state = partnerSendState(order?.events ?? [], pfLoc)
  const made = [...pfOrders.values()][0]
  check("Send again: sent once, with the quantity and the buyer's address", again.status === 200 && pfOrders.size === 1 && made?.body?.items?.[0]?.sync_variant_id === 5501 && made?.body?.items?.[0]?.quantity === 2 && made?.body?.recipient?.city === "Berlin", { status: again.status, json: again.json, n: pfOrders.size, body: made?.body })
  check("  the card says it was sent, and what Printful charges", state?.state === "sent" && (state as { cost: { cents: number; currency: string } | null }).cost?.cents === 1564 && (state as { cost: { currency: string } | null }).cost?.currency === "USD", state)
  const third = await act(j, seller, b!.id, { action: "resend", locationId: pfLoc })
  check("  Send again once Printful has it is refused: never a second order", third.status === 400 && /already has this order/.test(third.json?.error ?? "") && pfOrders.size === 1, third.json)

  section("4. The shop cancels: Printful's order is cancelled too")
  const cancelled = await act(j, seller, b!.id, { action: "cancel", reason: "Buyer changed their mind" })
  await runJobs(j)
  order = (await j.call(`GET /api/physical/orders/${b!.id}`, { as: seller })).json?.order
  check("cancelled in Storelib, and DELETE /orders/{id} in Printful", cancelled.status === 200 && deletes.includes(made.id) && pfOrders.get(made.id)?.status === "canceled", { status: cancelled.status, deletes })
  check("  the timeline says so", (order?.events ?? []).some((e: any) => e.kind === "fulfillment.partner_cancelled" && /Cancelled in Printful too/.test(e.message)), (order?.events ?? []).map((e: any) => e.kind))

  section("5. Printful is down, the order is held meanwhile: the send waits for the release")
  downOnce = 1
  const c = await buyByCard(j, creator.id, [{ productId: teeId, variantId: null, quantity: 1 }], "dan@example.com", { ...bea, name: "Dan Buyer" }, "printful-order-c")
  /* The send runs straight after the payment (next/server after): Printful answers 503 once. */
  if (downOnce > 0) await j.cron()
  check("the first try failed (503): nothing in Printful, the job waits to try again", downOnce === 0 && ![...pfOrders.values()].some((o) => o.external_id === c!.id.replace(/-/g, "")) && j.rows("commerce_jobs").some((x) => x.kind === "forward_fulfillment" && x.payload?.checkoutId === c!.id && x.status === "failed"), j.rows("commerce_jobs").filter((x) => x.payload?.checkoutId === c!.id).map((x) => [x.kind, x.status, x.last_error]))
  await act(j, seller, c!.id, { action: "hold", reason: "out_of_stock" })
  await runJobs(j)
  order = (await j.call(`GET /api/physical/orders/${c!.id}`, { as: seller })).json?.order
  check("its retry, on hold: held back, still nothing in Printful", partnerSendState(order?.events ?? [], pfLoc)?.state === "held" && ![...pfOrders.values()].some((o) => o.external_id === c!.id.replace(/-/g, "")), { state: partnerSendState(order?.events ?? [], pfLoc), jobs: j.rows("commerce_jobs").filter((x) => x.payload?.checkoutId === c!.id).map((x) => [x.kind, x.status]) })
  const resendHeld = await act(j, seller, c!.id, { action: "resend", locationId: pfLoc })
  check("  Send again waits for the hold too", resendHeld.status === 400 && /on hold/.test(resendHeld.json?.error ?? ""), resendHeld.json)
  await act(j, seller, c!.id, { action: "release_hold" })
  await runJobs(j)
  await runJobs(j)
  const cOrder = [...pfOrders.values()].find((o) => o.external_id === c!.id.replace(/-/g, ""))
  check("released: sent to Printful once", !!cOrder && [...pfOrders.values()].filter((o) => o.external_id === c!.id.replace(/-/g, "")).length === 1, [...pfOrders.values()].map((o) => o.external_id))

  section("6. A Printful order already in production can't be cancelled there: said on the order")
  if (cOrder) cOrder.status = "inprocess"
  await act(j, seller, c!.id, { action: "cancel", reason: "Out of stock" })
  await runJobs(j)
  order = (await j.call(`GET /api/physical/orders/${c!.id}`, { as: seller })).json?.order
  check("the order says Printful did not cancel it, in Printful's words, and to cancel it there", (order?.events ?? []).some((e: any) => e.kind === "fulfillment.manual_needed" && /Printful did not cancel its order \(Order is already being fulfilled/.test(e.message) && /Cancel it in Printful yourself/.test(e.message)), (order?.events ?? []).map((e: any) => [e.kind, e.message]).slice(0, 4))

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
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

function newProduct(j: Journey, creatorId: string, title: string, priceCents: number): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type: "physical", title, slug, description: `<p>${title}</p>`, status: "published", price_cents: priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
