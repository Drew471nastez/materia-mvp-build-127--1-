/**
 * THE SELLER SHIPS IT THEMSELVES, FROM END TO END
 *
 * Manual fulfilment ("I'll ship it myself", lib/physical/fulfillment.ts) of
 * a euro store with two places it ships from, walked through the real
 * routes over the journey harness (tests/_journey: in-memory PostgREST with
 * the database functions ported, a Stripe world, the real cron and emails):
 *
 *   a card order of a lamp (3) and a shade (1), each held at its own
 *   location; the order in Orders; part of it shipped with tracking and the
 *   buyer's email; the number corrected; the first parcel delivered while
 *   the rest waits; the rest shipped from both places; a fulfilment pressed
 *   by mistake undone and shipped again; a return received, restocked and
 *   refunded; an order cancelled after its only parcel was undone, every
 *   unit back on sale; a pickup marked ready, undone, ready again and picked
 *   up; and a cash order refused before it left, cancelled in the list too.
 *
 * Every step reads the stock levels, the buyer's mailbox, the seller's
 * order and the buyer's own order page, so "it works" is a measurement.
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES)
 */
import "./_journey/env"
import { Journey, type Person } from "./_journey/harness"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ")

async function main() {
  const j = await Journey.start()

  section("1. A euro store that ships from a workshop and a stockroom")
  const seller = await j.signUp("maker@example.com", { name: "Mara Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mara-shop" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mara Shop", supportEmail: "hello@mara.example", defaultCountry: "DE" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "DE", businessName: "Mara Shop GmbH" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  await j.call("POST /api/settings/payments", { as: seller, body: { defaultCurrency: "EUR" } })
  const sells = await j.call("PUT /api/store/currency", { as: seller, body: { country: "DE", currency: "EUR", key: "mara-eur-1" } })
  check("the store sells in EUR", sells.status === 200 && sells.json?.currency === "EUR", sells.json)
  /* Returns on, 30 days, so the buyer's page offers them. */
  await j.call("PUT /api/physical/settings", { as: seller, body: { returnsEnabled: true, returnWindowDays: 30 } })

  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const workshop = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${workshop}`, { as: seller, body: { name: "Workshop", kind: "home", addressLine1: "Hauptstr. 1", city: "Berlin", postalCode: "10115", country: "DE", pickupEnabled: true, pickupInstructions: "Ring the bell at the side door." } })
  const made = await j.call("POST /api/physical/locations", { as: seller, body: { name: "Stockroom", kind: "warehouse", addressLine1: "Lagerweg 5", city: "Potsdam", postalCode: "14467", country: "DE" } })
  const stockroom = made.json?.location?.id as string
  check("a second location, the stockroom", made.status === 200 && !!stockroom, made.json)
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["DE"], name: "Germany" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("DE"))
  await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Standard", priceCents: 500, minDays: 1, maxDays: 3 } })

  const lampId = newProduct(j, creator.id, "Desk Lamp", 4000)
  await j.call(`PUT /api/physical/products/${lampId}`, { as: seller, body: { variants: [{ options: [], priceCents: 4000, sku: "LAMP", weightGrams: 900, stock: { [workshop]: 10 } }], requiresShipping: true, weightGrams: 900, taxable: true, trackInventory: true, fulfillmentLocationId: workshop } })
  const shadeId = newProduct(j, creator.id, "Linen Shade", 1500)
  await j.call(`PUT /api/physical/products/${shadeId}`, { as: seller, body: { variants: [{ options: [], priceCents: 1500, sku: "SHADE", weightGrams: 300, stock: { [stockroom]: 4 } }], requiresShipping: true, weightGrams: 300, taxable: true, trackInventory: true, fulfillmentLocationId: stockroom } })
  const lampV = j.rows("product_variants").find((v) => v.product_id === lampId)?.id as string
  const shadeV = j.rows("product_variants").find((v) => v.product_id === shadeId)?.id as string
  const level = (variant: string, loc: string) => {
    const l = j.rows("inventory_levels").find((x) => x.variant_id === variant && x.location_id === loc)
    return { onHand: Number(l?.on_hand ?? 0), committed: Number(l?.committed ?? 0) }
  }
  check("10 lamps in the workshop, 4 shades in the stockroom", level(lampV, workshop).onHand === 10 && level(shadeV, stockroom).onHand === 4, { lamp: level(lampV, workshop), shade: level(shadeV, stockroom) })

  section("2. Bought by card: 3 lamps and a shade")
  const bea = { name: "Bea Buyer", line1: "Gartenweg 2", city: "Berlin", postalCode: "10117", country: "DE", phone: "+49 30 1234567" }
  const cart = [
    { productId: lampId, variantId: null, quantity: 3 },
    { productId: shadeId, variantId: null, quantity: 1 },
  ]
  const co = await buyByCard(j, creator.id, cart, "bea@example.com", bea, "manual-order-1")
  check("paid: one checkout, two order lines, 140.00 in EUR (120.00, 15.00 and 5.00 delivery)", !!co && co.status === "paid" && co.total_cents === 14000 && co.currency === "EUR" && j.rows("orders").filter((o) => o.checkout_id === co.id).length === 2, co && { status: co.status, total: co.total_cents, currency: co.currency })
  const lampLine = j.rows("orders").find((o) => o.checkout_id === co!.id && o.product_id === lampId)!
  const shadeLine = j.rows("orders").find((o) => o.checkout_id === co!.id && o.product_id === shadeId)!
  check("  each line ships from its own place, by the seller", lampLine.fulfillment_location_id === workshop && shadeLine.fulfillment_location_id === stockroom && lampLine.fulfillment_method === "self" && shadeLine.fulfillment_method === "self", [lampLine.fulfillment_location_id, shadeLine.fulfillment_location_id, lampLine.fulfillment_method])
  check("  the stock is held, not taken: 3 lamps and 1 shade committed", eq(level(lampV, workshop), { onHand: 10, committed: 3 }) && eq(level(shadeV, stockroom), { onHand: 4, committed: 1 }), { lamp: level(lampV, workshop), shade: level(shadeV, stockroom) })
  await j.cron()
  check("the buyer's confirmation, in euros", j.net.to("bea@example.com").some((m) => /confirmed/i.test(m.subject) && /€140\.00/.test(words(m.html))), j.net.to("bea@example.com").map((m) => m.subject))

  section("3. In Orders")
  const list = await j.call("GET /api/physical/orders", { as: seller })
  const row = (list.json?.orders ?? []).find((o: any) => o.id === co!.id)
  check("the list has it, Unfulfilled, 4 items, 140.00 EUR", list.status === 200 && row?.fulfillmentStatus === "unfulfilled" && row?.itemCount === 4 && row?.totalCents === 14000 && row?.currency === "EUR", row)
  const unfulfilledOnly = await j.call("GET /api/physical/orders?fulfillment=unfulfilled", { as: seller })
  check("  and the Unfulfilled filter finds it", (unfulfilledOnly.json?.orders ?? []).some((o: any) => o.id === co!.id))
  const byLine = await j.call(`GET /api/physical/orders/${lampLine.id}`, { as: seller })
  check("the order opens from a line's id too, with both locations", byLine.status === 200 && byLine.json?.order?.id === co!.id && (byLine.json?.locations ?? []).length === 2, { status: byLine.status, id: byLine.json?.order?.id })
  const proc = await act(j, seller, co!.id, { action: "processing", on: true })
  check("Mark as in progress: Processing", proc.status === 200 && proc.json?.order?.fulfillmentStatus === "processing", proc.json?.order?.fulfillmentStatus ?? proc.json)
  let page = await renderBuyerPage(co!.receipt_token)
  check("  the buyer's page says it is confirmed, Processing ticked", /Your order is confirmed/.test(words(page)), words(page).slice(0, 400))

  section("4. Two of the three lamps shipped, with tracking")
  const tooMany = await act(j, seller, co!.id, { action: "fulfil", items: [{ orderId: lampLine.id, quantity: 4 }], carrier: "DHL", trackingNumber: "00340434161234567890" })
  check("four lamps of three are refused", tooMany.status === 400 && /Only 3 left/.test(tooMany.json?.error ?? ""), tooMany.json)
  const notOurs = await act(j, seller, co!.id, { action: "fulfil", items: [{ orderId: crypto.randomUUID(), quantity: 1 }] })
  check("a line from another order is refused", notOurs.status === 400, notOurs.json)
  const first = await act(j, seller, co!.id, { action: "fulfil", items: [{ orderId: lampLine.id, quantity: 2 }], carrier: "DHL", trackingNumber: "00340434161234567890", key: "ship-1", locationId: workshop })
  const o1 = first.json?.order
  check("shipped: Partially shipped, one parcel of 2 lamps from the workshop", first.status === 200 && o1?.fulfillmentStatus === "partially_fulfilled" && o1?.shipments?.length === 1 && o1.shipments[0].status === "shipped" && o1.shipments[0].locationId === workshop && o1.shipments[0].items?.[0]?.quantity === 2, o1 && { status: o1.fulfillmentStatus, shipments: o1.shipments })
  check("  with DHL's tracking link made from the number", /dhl/i.test(o1?.shipments?.[0]?.trackingUrl ?? "") && /00340434161234567890/.test(o1?.shipments?.[0]?.trackingUrl ?? ""), o1?.shipments?.[0]?.trackingUrl)
  check("  stock taken for 2: 8 on the shelf, 1 still committed", eq(level(lampV, workshop), { onHand: 8, committed: 1 }), level(lampV, workshop))
  const again = await act(j, seller, co!.id, { action: "fulfil", items: [{ orderId: lampLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434161234567890", key: "ship-1", locationId: workshop })
  check("the same Fulfill pressed twice is one parcel", again.status === 200 && j.rows("fulfillments").filter((f) => f.checkout_id === co!.id).length === 1 && eq(level(lampV, workshop), { onHand: 8, committed: 1 }), { count: j.rows("fulfillments").filter((f) => f.checkout_id === co!.id).length, lamp: level(lampV, workshop) })
  await j.cron()
  const shippedMail = j.net.to("bea@example.com").filter((m) => /on the way/i.test(m.subject))
  check("the buyer is emailed once: part of the order is on the way, with the number", shippedMail.length === 1 && /Part of order/.test(shippedMail[0].subject) && /00340434161234567890/.test(words(shippedMail[0].html)), j.net.to("bea@example.com").map((m) => m.subject))
  page = await renderBuyerPage(co!.receipt_token)
  check("the buyer's page shows the parcel on its way with its number", /Your order is on the way/.test(words(page)) && /00340434161234567890/.test(page), words(page).slice(0, 500))

  section("5. The tracking number corrected")
  const fid1 = o1?.shipments?.[0]?.id as string
  const bad = await act(j, seller, co!.id, { action: "shipment", fulfillmentId: fid1, trackingNumber: "no way!" })
  check("a number with spaces and marks is refused", bad.status === 400, bad.json)
  const fixed = await act(j, seller, co!.id, { action: "shipment", fulfillmentId: fid1, carrier: "DHL", trackingNumber: "00340434169999999999" })
  check("saved, with a new link", fixed.status === 200 && fixed.json?.order?.shipments?.[0]?.trackingNumber === "00340434169999999999" && /00340434169999999999/.test(fixed.json?.order?.shipments?.[0]?.trackingUrl ?? ""), fixed.json?.order?.shipments?.[0])
  await act(j, seller, co!.id, { action: "shipment", fulfillmentId: fid1, carrier: "DHL", trackingNumber: "00340434169999999999" })
  await j.cron()
  const changedMail = j.net.to("bea@example.com").filter((m) => /New tracking number/i.test(m.subject))
  check("the buyer hears of the new number once", changedMail.length === 1 && /00340434169999999999/.test(words(changedMail[0].html)), j.net.to("bea@example.com").map((m) => m.subject))

  section("6. The first parcel arrives while the rest waits")
  const arrived = await act(j, seller, co!.id, { action: "shipment", fulfillmentId: fid1, status: "delivered" })
  check("the seller's order stays Partially shipped", arrived.status === 200 && arrived.json?.order?.fulfillmentStatus === "partially_fulfilled", arrived.json?.order?.fulfillmentStatus ?? arrived.json)
  page = await renderBuyerPage(co!.receipt_token)
  check("the buyer's page does not say the whole order was delivered", !/Your order was delivered/.test(words(page)), words(page).slice(0, 500))
  await j.cron()
  check("  the buyer is told that parcel was delivered", j.net.to("bea@example.com").filter((m) => /was delivered/i.test(m.subject)).length === 1, j.net.to("bea@example.com").map((m) => m.subject))

  section("7. The rest shipped, from both places")
  const lastLamp = await act(j, seller, co!.id, { action: "fulfil", items: [{ orderId: lampLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434161111111111", key: "ship-2", locationId: workshop })
  const shade = await act(j, seller, co!.id, { action: "fulfil", items: [{ orderId: shadeLine.id, quantity: 1 }], carrier: "DPD", trackingNumber: "01234567890123", key: "ship-3", locationId: stockroom })
  const o3 = shade.json?.order
  check("both shipped: the order reads Shipped, three parcels", lastLamp.status === 200 && shade.status === 200 && o3?.fulfillmentStatus === "fulfilled" && o3?.shipments?.length === 3, o3 && { status: o3.fulfillmentStatus, n: o3.shipments?.length })
  check("  the shade left the stockroom, the last lamp the workshop", o3?.shipments?.[2]?.locationId === stockroom && eq(level(shadeV, stockroom), { onHand: 3, committed: 0 }) && eq(level(lampV, workshop), { onHand: 7, committed: 0 }), { shade: level(shadeV, stockroom), lamp: level(lampV, workshop) })
  const fulfilledList = await j.call("GET /api/physical/orders?fulfillment=fulfilled", { as: seller })
  check("  the list files it under Shipped", (fulfilledList.json?.orders ?? []).some((o: any) => o.id === co!.id))

  section("8. A fulfilment pressed by mistake, undone")
  const fShade = o3?.shipments?.[2]?.id as string
  await j.cron()
  const mailsBeforeUndo = j.net.to("bea@example.com").length
  const undo = await act(j, seller, co!.id, { action: "shipment", fulfillmentId: fShade, status: "cancelled", notifyBuyer: false })
  check("Cancel fulfillment works on a parcel marked shipped", undo.status === 200 && undo.json?.order?.shipments?.find((s: any) => s.id === fShade)?.status === "cancelled", undo.json?.error ?? undo.json?.order?.shipments)
  check("  the order is Partially shipped again, the shade to ship", undo.json?.order?.fulfillmentStatus === "partially_fulfilled" && undo.json?.order?.lines?.find((l: any) => l.orderId === shadeLine.id)?.fulfilled === 0, undo.json?.order && { status: undo.json.order.fulfillmentStatus })
  check("  the shade is back on the shelf, held for this order", eq(level(shadeV, stockroom), { onHand: 4, committed: 1 }), level(shadeV, stockroom))
  const inTransit = await act(j, seller, co!.id, { action: "shipment", fulfillmentId: o3?.shipments?.[1]?.id, status: "in_transit" })
  const cantUndo = await act(j, seller, co!.id, { action: "shipment", fulfillmentId: o3?.shipments?.[1]?.id, status: "cancelled" })
  check("a parcel the carrier has (in transit) is not undone by a click", inTransit.status === 200 && cantUndo.status === 400, cantUndo.json)
  const reship = await act(j, seller, co!.id, { action: "fulfil", items: [{ orderId: shadeLine.id, quantity: 1 }], carrier: "DPD", trackingNumber: "01234567890124", key: "ship-4", locationId: stockroom })
  check("shipped again: Shipped, the shade taken once more", reship.status === 200 && reship.json?.order?.fulfillmentStatus === "fulfilled" && eq(level(shadeV, stockroom), { onHand: 3, committed: 0 }), { status: reship.json?.order?.fulfillmentStatus, shade: level(shadeV, stockroom) })
  await j.cron()
  const reshipMails = j.net.to("bea@example.com").slice(mailsBeforeUndo)
  check("  undoing emailed nothing; shipping again emailed the new number once", reshipMails.length === 1 && /01234567890124/.test(words(reshipMails[0].html)), reshipMails.map((m) => m.subject))
  for (const s of reship.json?.order?.shipments ?? []) if (s.status !== "cancelled" && s.status !== "delivered") await act(j, seller, co!.id, { action: "shipment", fulfillmentId: s.id, status: "delivered" })
  const allIn = await j.call(`GET /api/physical/orders/${co!.id}`, { as: seller })
  page = await renderBuyerPage(co!.receipt_token)
  check("every parcel in: Delivered for the seller and the buyer", allIn.json?.order?.fulfillmentStatus === "delivered" && /Your order was delivered/.test(words(page)), { seller: allIn.json?.order?.fulfillmentStatus, buyer: words(page).slice(0, 300) })
  check("  the buyer's page lists three parcels, not the undone one", (page.match(/data-shipment-status="/g) ?? []).length === 3 && !/01234567890123</.test(page))

  section("9. A lamp sent back: received, restocked, refunded")
  const shippedAt = j.rows("commerce_checkouts").find((c) => c.id === co!.id)?.fulfilled_at
  const lastParcel = j.rows("fulfillments").filter((f) => f.checkout_id === co!.id && f.status !== "cancelled").map((f) => f.shipped_at).sort().pop()
  check("the order's shipped time is when its last parcel left", !!shippedAt && shippedAt === lastParcel, { shippedAt, lastParcel })
  const opened = await act(j, seller, co!.id, { action: "return", items: [{ orderId: lampLine.id, quantity: 1, restock: true }], reason: "damaged", note: "Send it to the workshop." })
  const ret = opened.json?.order?.returns?.[0]
  check("a return the shop opens is approved at once", opened.status === 200 && ret?.status === "approved" && opened.json?.order?.returnStatus === "in_progress", opened.json?.order?.returns ?? opened.json)
  const twoMore = await act(j, seller, co!.id, { action: "return", items: [{ orderId: lampLine.id, quantity: 3 }] })
  check("  the same lamps can't be in two returns", twoMore.status === 400, twoMore.json)
  const recv = await act(j, seller, co!.id, { action: "return_move", returnId: ret?.id, status: "received" })
  check("received: the lamp is back on the shelf, Partially returned", recv.status === 200 && eq(level(lampV, workshop), { onHand: 8, committed: 0 }) && recv.json?.order?.returnStatus === "partially_returned", { lamp: level(lampV, workshop), status: recv.json?.order?.returnStatus })
  await act(j, seller, co!.id, { action: "return_move", returnId: ret?.id, status: "received" })
  check("  received twice restocks once", eq(level(lampV, workshop), { onHand: 8, committed: 0 }), level(lampV, workshop))
  const refund = await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: lampLine.id, amount: 40, reason: "requested_by_customer" } })
  const noted = await act(j, seller, co!.id, { action: "refunded", returnId: ret?.id })
  const chargeId = j.world.calls.find((c) => c.method === "refunds.create") ? [...j.world.charges.values()].find((c) => c.amount === 14000)?.id : null
  if (chargeId) await j.webhook("charge.refunded", j.world.charges.get(chargeId)!)
  check("40.00 refunded: Partially refunded, counted on the return", refund.status === 200 && noted.status === 200 && noted.json?.order?.status === "partially_refunded" && noted.json?.order?.refundedCents === 4000 && noted.json?.order?.returns?.[0]?.refundedCents === 4000, { refund: refund.json, status: noted.json?.order?.status, refunded: noted.json?.order?.refundedCents, onReturn: noted.json?.order?.returns?.[0]?.refundedCents })
  const closed = await act(j, seller, co!.id, { action: "return_move", returnId: ret?.id, status: "completed" })
  check("  the return closes", closed.status === 200 && closed.json?.order?.returns?.[0]?.status === "completed")
  check("  and none of it moved the order's shipped time (Analytics' time to ship)", j.rows("commerce_checkouts").find((c) => c.id === co!.id)?.fulfilled_at === shippedAt, { was: shippedAt, now: j.rows("commerce_checkouts").find((c) => c.id === co!.id)?.fulfilled_at })
  await j.cron()
  const refundMails = j.net.to("bea@example.com").filter((m) => /Refund for order/i.test(m.subject))
  check("the buyer gets one refund email, €40.00", refundMails.length === 1 && /€40\.00/.test(words(refundMails[0].html)) && !/\$40/.test(words(refundMails[0].html)), j.net.to("bea@example.com").map((m) => m.subject))
  check("  and the return's approved, received and complete emails, once each", ["Your return was approved", "We received your return", "Your return is complete"].every((s) => j.net.to("bea@example.com").filter((m) => m.subject.startsWith(s)).length === 1), j.net.to("bea@example.com").map((m) => m.subject))

  section("10. An order cancelled after its only parcel was undone")
  const before = level(lampV, workshop)
  const co2 = await buyByCard(j, creator.id, [{ productId: lampId, variantId: null, quantity: 2 }], "cal@example.com", { ...bea, name: "Cal Buyer" }, "manual-order-2")
  const line2 = j.rows("orders").find((o) => o.checkout_id === co2?.id)!
  check("paid, 2 lamps held", !!co2 && eq(level(lampV, workshop), { onHand: before.onHand, committed: before.committed + 2 }), level(lampV, workshop))
  /* "Tell the buyer" unticked: buyer emails go the moment a change is saved (lib/physical/jobs-server enqueueJob runs them after the answer), so an undo can't take one back. */
  const s2 = await act(j, seller, co2!.id, { action: "fulfil", items: [{ orderId: line2.id, quantity: 2 }], key: "c2-ship", notifyBuyer: false })
  const cantCancel = await act(j, seller, co2!.id, { action: "cancel", reason: "Out of stock" })
  check("shipped without tracking; a shipped order can't be cancelled", s2.status === 200 && cantCancel.status === 400, cantCancel.json)
  const undo2 = await act(j, seller, co2!.id, { action: "shipment", fulfillmentId: s2.json?.order?.shipments?.[0]?.id, status: "cancelled", notifyBuyer: false })
  const cancelled = await act(j, seller, co2!.id, { action: "cancel", reason: "Out of stock" })
  check("undone, then cancelled", undo2.status === 200 && cancelled.status === 200 && !!cancelled.json?.order?.cancelledAt, { undo: undo2.json?.error, cancel: cancelled.json?.error })
  check("  every lamp is back on sale: nothing left committed", eq(level(lampV, workshop), before), { before, now: level(lampV, workshop) })
  const list2 = await j.call("GET /api/physical/orders?fulfillment=cancelled", { as: seller })
  check("  the list files it under Cancelled", (list2.json?.orders ?? []).some((o: any) => o.id === co2!.id))
  await j.cron()
  check("  Cal hears it was cancelled, never that it shipped", j.net.to("cal@example.com").some((m) => /cancelled/i.test(m.subject)) && !j.net.to("cal@example.com").some((m) => /on the way/i.test(m.subject)), j.net.to("cal@example.com").map((m) => m.subject))

  section("11. Picked up at the workshop: ready, not ready after all, ready, collected")
  const quote = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: lampId, variantId: null, quantity: 1 }], shopId: creator.id, country: "DE", postalCode: "10117" } })
  const pickupOpt = (quote.json?.pickups ?? []).find((o: any) => o.name === "Workshop")
  check("the quote offers pickup at the workshop", quote.status === 200 && !!pickupOpt, quote.json?.pickups)
  const co3 = await buyByCard(j, creator.id, [{ productId: lampId, variantId: null, quantity: 1 }], "dan@example.com", { ...bea, name: "Dan Buyer" }, "manual-order-3", pickupOpt?.id)
  const line3 = j.rows("orders").find((o) => o.checkout_id === co3?.id)!
  check("paid for pickup", !!co3 && co3.delivery_method === "pickup", co3 && { method: co3.delivery_method })
  const ready = await act(j, seller, co3!.id, { action: "fulfil", items: [{ orderId: line3.id, quantity: 1 }], key: "ready-1" })
  const pf = ready.json?.order?.shipments?.[0]
  check("Mark ready for pickup", ready.status === 200 && pf?.provider === "pickup" && ready.json?.order?.fulfillmentStatus === "fulfilled", ready.json?.error ?? pf)
  const notReady = await act(j, seller, co3!.id, { action: "shipment", fulfillmentId: pf?.id, status: "cancelled", notifyBuyer: false })
  check("Not ready after all: back to Unfulfilled", notReady.status === 200 && notReady.json?.order?.fulfillmentStatus === "unfulfilled", notReady.json?.error ?? notReady.json?.order?.fulfillmentStatus)
  const ready2 = await act(j, seller, co3!.id, { action: "fulfil", items: [{ orderId: line3.id, quantity: 1 }], key: "ready-2" })
  const pf2 = ready2.json?.order?.shipments?.find((s: any) => s.status !== "cancelled")
  await j.cron()
  /* Told at the first press, as it is saved; Not ready after all says nothing; ready again says so again. */
  check("ready again; the buyer is told it's ready at each press, nothing in between", ready2.status === 200 && j.net.to("dan@example.com").filter((m) => /ready to pick up/i.test(m.subject)).length === 2 && !j.net.to("dan@example.com").some((m) => /on the way|cancelled/i.test(m.subject)), j.net.to("dan@example.com").map((m) => m.subject))
  page = await renderBuyerPage(co3!.receipt_token)
  check("  the buyer's page says it's ready, where, and the shop's note", /ready to pick up/i.test(words(page)) && /Ring the bell at the side door\./.test(words(page)), words(page).slice(0, 500))
  const collected = await act(j, seller, co3!.id, { action: "shipment", fulfillmentId: pf2?.id, status: "delivered" })
  await j.cron()
  page = await renderBuyerPage(co3!.receipt_token)
  check("picked up: Delivered, the buyer emailed and their page says so", collected.status === 200 && collected.json?.order?.fulfillmentStatus === "delivered" && j.net.to("dan@example.com").some((m) => /was picked up/i.test(m.subject)) && /Your order was picked up/.test(words(page)), { status: collected.json?.order?.fulfillmentStatus, mail: j.net.to("dan@example.com").map((m) => m.subject) })
  check("  one lamp taken from the workshop for it", eq(level(lampV, workshop), { onHand: before.onHand - 1, committed: 0 }), level(lampV, workshop))

  section("12. A cash order refused before it left")
  await j.call("PUT /api/store/settings", { as: seller, body: { checkout: { cashOnDelivery: true, codCountries: ["DE"] } } })
  const q4 = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: shadeId, variantId: null, quantity: 1 }], shopId: creator.id, country: "DE", postalCode: "10117" } })
  const std4 = (q4.json?.delivery?.options ?? []).find((o: any) => o.name === "Standard")
  const shadeBefore = level(shadeV, stockroom)
  const placed = await j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items: [{ productId: shadeId, variantId: null, quantity: 1 }], email: "eve@example.com", name: "Eve Buyer", address: { ...bea, name: "Eve Buyer" }, deliveryOptionId: std4?.id, clientKey: "manual-cod-1", cashOnDelivery: true } })
  const co4 = j.rows("commerce_checkouts").find((c) => c.client_key === "manual-cod-1:cod")
  check("placed in cash, the shade held", placed.status === 200 && co4?.provider === "cod" && eq(level(shadeV, stockroom), { onHand: shadeBefore.onHand, committed: shadeBefore.committed + 1 }), { status: placed.status, body: placed.json, shade: level(shadeV, stockroom) })
  const refused = await act(j, seller, co4!.id, { action: "cash_refused" })
  check("refused: cancelled, the shade free again", refused.status === 200 && !!refused.json?.order?.cancelledAt && eq(level(shadeV, stockroom), shadeBefore), { error: refused.json?.error, shade: level(shadeV, stockroom) })
  const listed = (await j.call("GET /api/physical/orders", { as: seller })).json?.orders?.find((o: any) => o.id === co4!.id)
  check("  the list reads it Cancelled, not Unfulfilled", listed?.fulfillmentStatus === "cancelled", listed)
  const unf = await j.call("GET /api/physical/orders?fulfillment=unfulfilled", { as: seller })
  check("  so it is not in the Unfulfilled filter", !(unf.json?.orders ?? []).some((o: any) => o.id === co4!.id))

  section("13. A cash parcel refused at the door comes back once")
  const placed5 = await j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items: [{ productId: shadeId, variantId: null, quantity: 1 }], email: "fay@example.com", name: "Fay Buyer", address: { ...bea, name: "Fay Buyer" }, deliveryOptionId: std4?.id, clientKey: "manual-cod-2", cashOnDelivery: true } })
  const co5 = j.rows("commerce_checkouts").find((c) => c.client_key === "manual-cod-2:cod")
  const line5 = j.rows("orders").find((o) => o.checkout_id === co5?.id)!
  const sent5 = await act(j, seller, co5!.id, { action: "fulfil", items: [{ orderId: line5.id, quantity: 1 }], carrier: "DPD", trackingNumber: "01234567890125", key: "cod-2-ship" })
  const shelf5 = level(shadeV, stockroom)
  const refused5 = await act(j, seller, co5!.id, { action: "cash_refused" })
  const back5 = refused5.json?.order?.returns?.[0]
  check("shipped, then refused: a return the shop opened", placed5.status === 200 && sent5.status === 200 && refused5.status === 200 && back5?.status === "approved", { placed: placed5.json?.error, sent: sent5.json?.error, refused: refused5.json?.error })
  const undo5 = await act(j, seller, co5!.id, { action: "shipment", fulfillmentId: sent5.json?.order?.shipments?.[0]?.id, status: "cancelled", notifyBuyer: false })
  check("  its parcel can't also be undone: the return brings it back", undo5.status === 400 && /return/i.test(undo5.json?.error ?? "") && eq(level(shadeV, stockroom), shelf5), { status: undo5.status, error: undo5.json?.error, shade: level(shadeV, stockroom) })
  await act(j, seller, co5!.id, { action: "return_move", returnId: back5?.id, status: "received" })
  check("  received: on the shelf once", eq(level(shadeV, stockroom), { onHand: shelf5.onHand + 1, committed: shelf5.committed }), { before: shelf5, now: level(shadeV, stockroom) })

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  check("nothing scheduled after an answer threw", j.afterErrors.length === 0, j.afterErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

function eq(a: { onHand: number; committed: number }, b: { onHand: number; committed: number }): boolean {
  return a.onHand === b.onHand && a.committed === b.committed
}

function act(j: Journey, seller: Person, checkoutId: string, body: Record<string, unknown>) {
  return j.call(`POST /api/physical/orders/${checkoutId}`, { as: seller, body })
}

/** A cart bought through Stripe's page, the webhooks delivered as Stripe sends them; the checkout row after. */
async function buyByCard(j: Journey, shopId: string, items: { productId: string; variantId: null; quantity: number }[], email: string, address: Record<string, string>, clientKey: string, deliveryOptionId?: string) {
  let option = deliveryOptionId
  if (!option) {
    const q = await j.call("POST /api/physical/checkout/quote", { body: { items, shopId, country: address.country, postalCode: address.postalCode } })
    option = (q.json?.delivery?.options ?? []).find((o: any) => o.name === "Standard")?.id
  }
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

async function renderBuyerPage(token: string): Promise<string> {
  try {
    const { default: Page } = await import("@/app/checkout/physical/order/[token]/page")
    const { renderToStaticMarkup } = await import("react-dom/server")
    const tree = await Page({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) })
    return renderToStaticMarkup(tree)
  } catch (e) {
    return `render failed: ${e instanceof Error ? e.stack : String(e)}`
  }
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
