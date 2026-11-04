/**
 * ROUND 51: EVERY ANSWER TO "HOW YOU FULFIL ORDERS", FROM CHECKOUT TO DELIVERED
 *
 * The owner: "fulfilment must work end to end for every mode in Settings >
 * Shipping and delivery". One store over the journey harness (tests/_journey:
 * in-memory PostgREST with the database functions, a Stripe world, the real
 * routes, the cron and Mailgun's mailbox), answering each mode in turn and
 * selling a product that follows the answer, as the product editor saves it
 * (components/physical/product-cards: the store's pair, storeFulfilment):
 *
 *   self             the seller packs it: nothing is sent anywhere, Fulfill
 *                    with tracking emails the buyer, Delivered emails again
 *   own warehouse    "From my own warehouse: stock in a place you run" is
 *                    the seller shipping too. It used to be read as a 3PL
 *                    (MODEL_METHOD warehouse -> "warehouse"): every order
 *                    said "Stockroom fulfils part of this order but doesn't
 *                    receive orders automatically. Send it to them", and the
 *                    products that followed "I ship orders myself" moved
 *                    to it as a partner
 *   print on demand  Printify, connected: the order goes to POST
 *                    /v1/shops/{shop}/orders.json by SKU with the address;
 *                    its signed order:shipment:created webhook makes the
 *                    shipment with tracking and emails the buyer;
 *                    order:shipment:delivered marks it delivered and emails
 *   dropshipping,    the partner location is emailed the order with a link
 *   supplier, 3PL    to its own page; the tracking it types there ships the
 *                    order and emails the buyer; Delivered emails again
 *   a mix            "A mix of these" moves no product (it moved every
 *                    follower to the seller's own shipping, Printify's
 *                    too); a cart with a self shipped lamp and a Printify
 *                    mug: Printify is sent the mug only, the lamp waits for
 *                    the seller, both ship
 *
 * And Shipping and delivery's rates at checkout: a zone, a flat rate, Free
 * shipping from an order value, and a country outside every zone.
 *
 * Run: node scripts/run-push-tests.mjs
 */
import "./_journey/env"
import { createHmac } from "node:crypto"
import { Journey, type Person } from "./_journey/harness"
import { storeFulfilment } from "@/lib/physical/fulfilment-default"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#8364;|&euro;/g, "€").replace(/\s+/g, " ")

const PFY_KEY = "printify-journey-token-0001"
const PFY_SHOP = 8812345

async function main() {
  const j = await Journey.start()

  section("1. A euro store in Germany, with a zone, a flat rate and free shipping from €60")
  const seller = await j.signUp("modes@example.com", { name: "Mona Modes" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mona-modes" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mona Modes", supportEmail: "hello@mona.example", defaultCountry: "DE" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "DE", businessName: "Mona Modes GmbH" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  await j.call("POST /api/settings/payments", { as: seller, body: { defaultCurrency: "EUR" } })
  await j.call("PUT /api/store/currency", { as: seller, body: { country: "DE", currency: "EUR", key: "mona-eur-1" } })
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const workshop = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${workshop}`, { as: seller, body: { name: "Workshop", kind: "home", addressLine1: "Hauptstr. 1", city: "Berlin", postalCode: "10115", country: "DE" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["DE"], name: "Germany" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("DE"))
  const flat = await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Standard", priceCents: 500, minDays: 1, maxDays: 3 } })
  const free = await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "free", name: "Free shipping", priceCents: 0, minValue: 6000, minDays: 2, maxDays: 5 } })
  check("the zone and both rates are saved", flat.status === 200 && free.status === 200 && j.rows("shipping_rates").length === 2, { flat: flat.json, free: free.json })

  /* What the product editor saves for a product that follows the store (components/physical/product-cards.tsx). */
  const follow = async (title: string, priceCents: number, sku: string, stock: Record<string, number>) => {
    const s = (await j.call("GET /api/physical/settings", { as: seller })).json
    const pair = storeFulfilment(s.settings.fulfillmentModel, s.settings.defaultLocationId, s.locations)
    const id = newProduct(j, creator.id, title, priceCents)
    const saved = await j.call(`PUT /api/physical/products/${id}`, { as: seller, body: { variants: [{ options: [], priceCents, sku, weightGrams: 400, stock }], requiresShipping: true, weightGrams: 400, taxable: true, trackInventory: Object.keys(stock).length > 0, fulfillmentMethod: pair.method, fulfillmentLocationId: pair.locationId } })
    if (saved.status !== 200) console.log("  product not saved:", saved.status, JSON.stringify(saved.json).slice(0, 300))
    return { id, pair }
  }
  const addr = (name: string) => ({ name, line1: "Gartenweg 2", city: "Berlin", postalCode: "10117", country: "DE", phone: "+49 30 1234567" })
  const eventsOf = async (id: string) => ((await j.call(`GET /api/physical/orders/${id}`, { as: seller })).json?.order?.events ?? []) as { kind: string; message: string }[]
  const orderOf = async (id: string) => (await j.call(`GET /api/physical/orders/${id}`, { as: seller })).json?.order
  /* Delivered, as the seller marks it in Orders (or a tracking app reports it), and the buyer told. */
  const deliverAll = async (id: string) => {
    for (const s of (await orderOf(id))?.shipments ?? []) if (s.status !== "cancelled" && s.status !== "delivered") await act(j, seller, id, { action: "shipment", fulfillmentId: s.id, status: "delivered" })
    await runJobs(j)
  }

  const lamp = await follow("Desk Lamp", 4000, "LAMP", { [workshop]: 20 })

  section("2. Rates at checkout")
  const q1 = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: lamp.id, variantId: null, quantity: 1 }], shopId: creator.id, country: "DE", postalCode: "10117" } })
  const names1 = (q1.json?.delivery?.options ?? []).map((o: any) => `${o.name}:${o.priceCents}`)
  check("€40 to Germany: Standard €5 only (free shipping starts at €60)", names1.join(",") === "Standard:500", q1.json?.delivery)
  const q2 = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: lamp.id, variantId: null, quantity: 2 }], shopId: creator.id, country: "DE", postalCode: "10117" } })
  const names2 = (q2.json?.delivery?.options ?? []).map((o: any) => `${o.name}:${o.priceCents}`)
  check("€80 to Germany: Free shipping at €0 is offered beside Standard", names2.includes("Free shipping:0") && names2.includes("Standard:500"), q2.json?.delivery)
  const q3 = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: lamp.id, variantId: null, quantity: 1 }], shopId: creator.id, country: "US", postalCode: "10001" } })
  check("to the US, outside every zone: no delivery option, said", (q3.json?.delivery?.options ?? []).length === 0 && q3.json?.delivery?.ok === false, q3.json?.delivery)

  section("3. I ship orders myself")
  check("the lamp follows the store: the seller ships it", lamp.pair.method === "self" && lamp.pair.locationId === null, lamp.pair)
  const a = await buyByCard(j, creator.id, [{ productId: lamp.id, variantId: null, quantity: 1 }], "ada@example.com", addr("Ada Self"), "mode-self")
  await runJobs(j)
  check("paid, and the buyer has the confirmation", a?.status === "paid" && j.net.to("ada@example.com").some((m) => /confirmed/i.test(m.subject)), j.net.to("ada@example.com").map((m) => m.subject))
  check("  nothing is sent to anyone, and nothing asks the seller to pass it on", !j.rows("commerce_jobs").some((x) => x.payload?.checkoutId === a!.id && ["supplier_email", "webhook_delivery", "forward_fulfillment"].includes(x.kind)) && !(await eventsOf(a!.id)).some((e) => e.kind === "fulfillment.manual_needed"), (await eventsOf(a!.id)).map((e) => e.kind))
  const aLine = j.rows("orders").find((o) => o.checkout_id === a!.id)!
  const aShip = await act(j, seller, a!.id, { action: "fulfil", items: [{ orderId: aLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434161000000001", key: "self-1", locationId: workshop })
  await runJobs(j)
  check("Fulfill with tracking: fulfilled, the buyer emailed the number", aShip.status === 200 && aShip.json?.order?.fulfillmentStatus === "fulfilled" && j.net.to("ada@example.com").some((m) => /on the way/i.test(m.subject) && /00340434161000000001/.test(words(m.html))), j.net.to("ada@example.com").map((m) => m.subject))
  await deliverAll(a!.id)
  check("  delivered, and the buyer told", (await orderOf(a!.id))?.shipments?.[0]?.status === "delivered" && j.net.to("ada@example.com").some((m) => /was delivered/i.test(m.subject)), j.net.to("ada@example.com").map((m) => m.subject))

  section("4. From my own warehouse")
  const made = await j.call("POST /api/physical/locations", { as: seller, body: { name: "Stockroom", kind: "warehouse", addressLine1: "Lagerweg 5", city: "Potsdam", postalCode: "14467", country: "DE" } })
  const stockroom = (made.json?.location?.id ?? j.rows("inventory_locations").find((l) => l.name === "Stockroom")?.id) as string
  const wh = await j.call("PUT /api/physical/settings", { as: seller, body: { fulfillmentModel: "warehouse", defaultLocationId: stockroom } })
  check("saved", wh.status === 200 && wh.json?.settings?.fulfillmentModel === "warehouse", wh.json)
  const lampRow = j.rows("products").find((p) => p.id === lamp.id)
  check("  the lamp that followed \"I ship orders myself\" is still the seller's to ship, not a partner's", lampRow?.fulfillment_method === "self", { method: lampRow?.fulfillment_method, at: lampRow?.fulfillment_location_id })
  const shelf = await follow("Shelf", 3000, "SHELF", { [stockroom]: 10 })
  check("  a new product follows it as the seller's own shipping", shelf.pair.method === "self", shelf.pair)
  const b = await buyByCard(j, creator.id, [{ productId: shelf.id, variantId: null, quantity: 1 }], "ben@example.com", addr("Ben Warehouse"), "mode-warehouse")
  await runJobs(j)
  const bEvents = await eventsOf(b!.id)
  check("paid: nothing says to send it to the Stockroom as if it were someone else", b?.status === "paid" && !bEvents.some((e) => e.kind === "fulfillment.manual_needed"), bEvents.filter((e) => e.kind === "fulfillment.manual_needed").map((e) => e.message))
  const bLine = j.rows("orders").find((o) => o.checkout_id === b!.id)!
  const bShip = await act(j, seller, b!.id, { action: "fulfil", items: [{ orderId: bLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434162000000002", key: "wh-1", locationId: stockroom })
  await runJobs(j)
  check("  shipped from the Stockroom, its stock taken there, the buyer emailed", bShip.status === 200 && bShip.json?.order?.fulfillmentStatus === "fulfilled" && j.net.to("ben@example.com").some((m) => /on the way/i.test(m.subject)), j.net.to("ben@example.com").map((m) => m.subject))
  await deliverAll(b!.id)
  check("  delivered, and the buyer told", j.net.to("ben@example.com").some((m) => /was delivered/i.test(m.subject)), j.net.to("ben@example.com").map((m) => m.subject))

  section("5. Print on demand, with Printify")
  const pfyOrders = new Map<string, { id: string; external_id: string; status: string; body: any; shipments: any[] }>()
  const webhooks: { topic: string; url: string; secret: string }[] = []
  let seq = 0
  const pj = (b: unknown, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } })
  j.providers.on("api.printify.com", (x) => {
    if (x.headers.get("authorization") !== `Bearer ${PFY_KEY}`) return pj({ code: 401, message: "Unauthenticated." }, 401)
    if (x.method === "GET" && x.path === "/v1/shops.json") return pj([{ id: PFY_SHOP, title: "Mona API shop", sales_channel: "disconnected" }])
    if (x.path === `/v1/shops/${PFY_SHOP}/webhooks.json`) {
      if (x.method === "GET") return pj(webhooks.map((w, i) => ({ id: `wh${i}`, ...w })))
      webhooks.push({ topic: x.body?.topic, url: x.body?.url, secret: x.body?.secret })
      return pj({ id: `wh${webhooks.length}`, topic: x.body?.topic, url: x.body?.url, shop_id: PFY_SHOP })
    }
    if (x.method === "GET" && /^\/v1\/shops\/\d+\/products\.json$/.test(x.path)) return pj({ current_page: 1, data: [], last_page: 1, total: 0 })
    if (x.method === "POST" && x.path === `/v1/shops/${PFY_SHOP}/orders.json`) {
      const id = `5a96f649b2439217d070f5${String(++seq).padStart(2, "0")}`
      pfyOrders.set(id, { id, external_id: x.body?.external_id, status: "on-hold", body: x.body, shipments: [] })
      return pj({ id })
    }
    const prod = /^\/v1\/shops\/\d+\/orders\/([A-Za-z0-9]+)\/send_to_production\.json$/.exec(x.path)
    if (prod && x.method === "POST") {
      const o = pfyOrders.get(prod[1])
      if (o) o.status = "in-production"
      return pj({ id: prod[1] })
    }
    const one = /^\/v1\/shops\/\d+\/orders\/([A-Za-z0-9]+)\.json$/.exec(x.path)
    if (one && x.method === "GET") {
      const o = pfyOrders.get(one[1])
      if (!o) return pj({ code: 404, message: "Order not found" }, 404)
      return pj({ id: o.id, external_id: o.external_id, status: o.status, shipments: o.shipments })
    }
    return null
  })
  const connected = await j.call("PUT /api/physical/integrations/printify", { as: seller, body: { apiKey: PFY_KEY, autoConfirm: true } })
  const pfyRow = j.rows("commerce_integrations").find((x) => x.provider === "printify")
  const pfyLoc = j.rows("inventory_locations").find((l) => l.integration_id === pfyRow?.id)?.id as string
  check("Printify connects with its token, makes its own location and registers its three webhooks with a secret", connected.status === 200 && pfyRow?.status === "connected" && !!pfyLoc && webhooks.length === 3 && webhooks.every((w) => w.secret && /\/api\/integrations\/webhooks\/printify\//.test(w.url)), { status: connected.status, json: connected.json, webhooks: webhooks.map((w) => w.topic) })
  await j.call("PUT /api/physical/settings", { as: seller, body: { fulfillmentModel: "print_on_demand", defaultLocationId: pfyLoc } })
  const mug = await follow("Studio Mug", 1800, "MUG-11", {})
  check("  the mug follows the store: printed by Printify", mug.pair.method === "print_on_demand" && mug.pair.locationId === pfyLoc, mug.pair)
  const c = await buyByCard(j, creator.id, [{ productId: mug.id, variantId: null, quantity: 2 }], "cleo@example.com", addr("Cleo Print"), "mode-pod")
  await runJobs(j)
  const sent = [...pfyOrders.values()].find((o) => o.external_id === c!.id.replace(/-/g, ""))
  check("paid: Printify is sent the order by SKU, with the quantity and the buyer's address, and Printify's own email off", !!sent && sent.body?.line_items?.[0]?.sku === "MUG-11" && sent.body?.line_items?.[0]?.quantity === 2 && sent.body?.address_to?.city === "Berlin" && sent.body?.address_to?.country === "DE" && sent.body?.send_shipping_notification === false, sent?.body ?? [...pfyOrders.values()].map((o) => o.external_id))
  check("  sent to production, as the seller chose", sent?.status === "in-production", sent?.status)
  const hook = webhooks.find((w) => w.topic === "order:shipment:created")!
  const say = async (topic: string) => {
    const raw = JSON.stringify({ id: `evt-${topic}`, type: topic, created_at: new Date().toISOString(), resource: { id: sent!.id, type: "order", data: { shop_id: PFY_SHOP } } })
    const sig = `sha256=${createHmac("sha256", hook.secret).update(raw, "utf8").digest("hex")}`
    return j.call(`POST ${new URL(hook.url).pathname}`, { raw, headers: { "content-type": "application/json", "x-pfy-signature": sig } })
  }
  const forged = await j.call(`POST ${new URL(hook.url).pathname}`, { raw: JSON.stringify({ type: "order:shipment:created", resource: { id: sent!.id, type: "order" } }), headers: { "content-type": "application/json", "x-pfy-signature": "sha256=" + "0".repeat(64) } })
  check("  a webhook with a wrong signature is refused", forged.status === 401, forged.json)
  sent!.status = "fulfilled"
  sent!.shipments = [{ carrier: "usps", number: "9400111899223197428490", url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490", delivered_at: null }]
  const shippedHook = await say("order:shipment:created")
  await runJobs(j)
  let cOrder = await orderOf(c!.id)
  check("Printify says it shipped: the order is fulfilled with Printify's tracking", shippedHook.status === 200 && cOrder?.fulfillmentStatus === "fulfilled" && cOrder?.shipments?.[0]?.trackingNumber === "9400111899223197428490", { hook: shippedHook.json, status: cOrder?.fulfillmentStatus, shipments: cOrder?.shipments })
  check("  and the buyer is emailed the number", j.net.to("cleo@example.com").some((m) => /on the way/i.test(m.subject) && /9400111899223197428490/.test(words(m.html))), j.net.to("cleo@example.com").map((m) => m.subject))
  sent!.shipments[0].delivered_at = new Date().toISOString()
  await say("order:shipment:delivered")
  await runJobs(j)
  cOrder = await orderOf(c!.id)
  check("  Printify says delivered: delivered, and the buyer told", cOrder?.shipments?.[0]?.status === "delivered" && j.net.to("cleo@example.com").some((m) => /was delivered/i.test(m.subject)), { shipments: cOrder?.shipments?.map((s: any) => s.status), mails: j.net.to("cleo@example.com").map((m) => m.subject) })

  section("6. A mix of these: the lamp the seller ships, the mug Printify prints, in one cart")
  const mixed0 = await j.call("PUT /api/physical/settings", { as: seller, body: { fulfillmentModel: "hybrid", defaultLocationId: workshop } })
  const mugRow = j.rows("products").find((p) => p.id === mug.id)
  check("the store now answers a mix: the mug keeps Printify (a mix moves no product)", mixed0.status === 200 && mugRow?.fulfillment_method === "print_on_demand" && mugRow?.fulfillment_location_id === pfyLoc, { method: mugRow?.fulfillment_method, at: mugRow?.fulfillment_location_id })
  /* The lamp followed "Print on demand" when the store said so (followNewDefault); in a mix it gets its own answer under Advanced, as the editor saves it. */
  const own = await j.call(`PUT /api/physical/products/${lamp.id}`, { as: seller, body: { variants: [{ options: [], priceCents: 4000, sku: "LAMP", weightGrams: 400, stock: { [workshop]: 19 } }], requiresShipping: true, weightGrams: 400, taxable: true, trackInventory: true, fulfillmentMethod: "self", fulfillmentLocationId: workshop } })
  check("  the lamp's own answer: the seller ships it from the Workshop", own.status === 200 && j.rows("products").find((p) => p.id === lamp.id)?.fulfillment_method === "self", own.json)
  const before = pfyOrders.size
  const m = await buyByCard(j, creator.id, [{ productId: lamp.id, variantId: null, quantity: 1 }, { productId: mug.id, variantId: null, quantity: 1 }], "max@example.com", addr("Max Mix"), "mode-mix")
  await runJobs(j)
  const mixSent = [...pfyOrders.values()].find((o) => o.external_id === m!.id.replace(/-/g, ""))
  check("Printify is sent the mug only", pfyOrders.size === before + 1 && mixSent?.body?.line_items?.length === 1 && mixSent.body.line_items[0].sku === "MUG-11", mixSent?.body?.line_items)
  const mixLamp = j.rows("orders").find((o) => o.checkout_id === m!.id && o.product_id === lamp.id)!
  const mixed = await act(j, seller, m!.id, { action: "fulfil", items: [{ orderId: mixLamp.id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434169000000009", key: "mix-1", locationId: workshop })
  check("  the seller ships the lamp: part fulfilled, the mug still Printify's", mixed.status === 200 && mixed.json?.order?.fulfillmentStatus === "partially_fulfilled", mixed.json?.order?.fulfillmentStatus ?? mixed.json)
  mixSent!.status = "fulfilled"
  mixSent!.shipments = [{ carrier: "dhl", number: "JJD000390007777777", url: null, delivered_at: null }]
  const raw = JSON.stringify({ id: "evt-mix", type: "order:shipment:created", created_at: new Date().toISOString(), resource: { id: mixSent!.id, type: "order" } })
  await j.call(`POST ${new URL(hook.url).pathname}`, { raw, headers: { "content-type": "application/json", "x-pfy-signature": `sha256=${createHmac("sha256", hook.secret).update(raw, "utf8").digest("hex")}` } })
  await runJobs(j)
  const mixOrder = await orderOf(m!.id)
  check("  Printify ships the mug: the whole order fulfilled, two parcels, the buyer emailed for each", mixOrder?.fulfillmentStatus === "fulfilled" && (mixOrder?.shipments ?? []).filter((s: any) => s.status !== "cancelled").length === 2 && j.net.to("max@example.com").filter((m) => /on the way/i.test(m.subject)).length === 2, { f: mixOrder?.fulfillmentStatus, mails: j.net.to("max@example.com").map((m) => m.subject) })

  /* Dropshipping, a supplier or manufacturer, a fulfillment center: each a partner place that is emailed the order. */
  const partnerMode = async (n: string, model: "dropshipping" | "supplier" | "third_party_logistics", kind: "dropshipper" | "supplier" | "third_party_logistics", place: string, email: string, buyer: string, wants: string) => {
    section(n)
    const loc = await j.call("POST /api/physical/locations", { as: seller, body: { name: place, kind, forwarding: "email", email, country: "DE" } })
    const locId = (loc.json?.location?.id ?? j.rows("inventory_locations").find((l) => l.name === place)?.id) as string
    await j.call("PUT /api/physical/settings", { as: seller, body: { fulfillmentModel: model, defaultLocationId: locId } })
    const p = await follow(`${place} Tote`, 2200, `TOTE-${kind}`.toUpperCase(), {})
    check(`the product follows the store: ${wants}`, p.pair.method === wants && p.pair.locationId === locId, p.pair)
    const co = await buyByCard(j, creator.id, [{ productId: p.id, variantId: null, quantity: 1 }], buyer, addr("Partner Buyer"), `mode-${kind}`)
    await runJobs(j)
    const mail = j.net.to(email).find((m) => /order/i.test(m.subject))
    const link = /\/checkout\/physical\/partner\/([A-Za-z0-9._~-]+)/.exec(mail?.html ?? "")?.[1]
    check(`paid: ${place} is emailed the order with the item, the address and a link to add tracking`, !!mail && /Tote/.test(words(mail.html)) && /Gartenweg 2/.test(words(mail.html)) && !!link, { subjects: j.net.to(email).map((m) => m.subject) })
    check("  the order says it was emailed, and nothing asks the seller to send it", (await eventsOf(co!.id)).some((e) => e.kind === "fulfillment.forwarded") && !(await eventsOf(co!.id)).some((e) => e.kind === "fulfillment.manual_needed"), (await eventsOf(co!.id)).map((e) => [e.kind, e.message]))
    const form = new URLSearchParams({ token: decodeURIComponent(link ?? ""), carrier: "DHL", tracking_number: `0034043416${kind.length}00000003` }).toString()
    const posted = await j.call("POST /api/physical/partner-tracking", { raw: form, headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://storelib.com" } })
    await runJobs(j)
    const after = await orderOf(co!.id)
    check(`  ${place} adds its tracking on its page: fulfilled, and the buyer emailed`, posted.status === 303 && /done=1/.test(posted.location ?? "") && after?.fulfillmentStatus === "fulfilled" && j.net.to(buyer).some((m) => /on the way/i.test(m.subject)), { status: posted.status, location: posted.location, f: after?.fulfillmentStatus, mails: j.net.to(buyer).map((m) => m.subject) })
    await deliverAll(co!.id)
    check("  delivered, and the buyer told", j.net.to(buyer).some((m) => /was delivered/i.test(m.subject)), j.net.to(buyer).map((m) => m.subject))
  }
  await partnerMode("7. Dropshipping", "dropshipping", "dropshipper", "Drop Co", "orders@drop.example", "dina@example.com", "dropship")
  await partnerMode("8. A supplier or manufacturer", "supplier", "supplier", "Maker Works", "orders@maker.example", "sam@example.com", "dropship")
  await partnerMode("9. A fulfillment center", "third_party_logistics", "third_party_logistics", "Fast 3PL", "ops@3pl.example", "tom@example.com", "warehouse")

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  check("no after() work threw", j.afterErrors.length === 0, j.afterErrors)
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
