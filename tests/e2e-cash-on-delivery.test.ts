/**
 * CASH ON DELIVERY, FROM END TO END
 *
 * A store in lei that takes cash on delivery in Romania, with a 10 lei fee
 * and a note for the buyer, walked through the real routes over the journey
 * harness (tests/_journey: in-memory PostgREST with the database functions
 * ported, a Stripe world, the real cron and its emails):
 *
 *   the quote with and without cash; an address outside the list refused;
 *   a cash order placed with no Stripe call, its stock held, no ledger line;
 *   Place order pressed twice is one order; the buyer's and the seller's
 *   emails; Mark as paid; and a second order refused at the door, shipped
 *   back as a return and put back on the shelf, with nothing refunded.
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES)
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")

async function main() {
  const j = await Journey.start()

  section("1. A store in lei that takes cash on delivery in Romania")
  const seller = await j.signUp("cod@example.com", { name: "Radu Ramburs" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "radu-shop" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Radu Shop", supportEmail: "hello@radu.example", defaultCountry: "RO" } })
  const sells = await j.call("PUT /api/store/currency", { as: seller, body: { country: "RO", currency: "RON", key: "ron-store-currency-1" } })
  check("Country & Currency: the store sells in RON", sells.status === 200 && sells.json?.currency === "RON", { status: sells.status, body: sells.json })
  const cod = await j.call("PUT /api/store/settings", { as: seller, body: { checkout: { cashOnDelivery: true, codCountries: ["RO"], codFeeCents: 1000, codInstructions: "Have the exact amount ready." } } })
  const kept = cod.json?.settings?.checkout ?? {}
  check("Settings › Checkout keeps cash on delivery with its country, fee and note", cod.status === 200 && kept.cashOnDelivery === true && kept.codCountries?.join() === "RO" && kept.codFeeCents === 1000 && kept.codInstructions === "Have the exact amount ready.", { status: cod.status, kept })

  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const locId = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${locId}`, { as: seller, body: { name: "Depozit", kind: "home", addressLine1: "Strada Lipscani 12", city: "Bucuresti", postalCode: "030031", country: "RO" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["RO", "MD"], name: "Romania and Moldova" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("RO"))
  await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Curier", priceCents: 1500, minDays: 1, maxDays: 2 } })
  const [product] = j.db.insert("products", { creator_id: creator.id, type: "physical", title: "Cana ceramica", slug: "cana-ceramica", description: "<p>Cana</p>", status: "published", price_cents: 4000, thumbnail_url: "https://cdn.example.com/c.jpg", pay_what_you_want: false }, {})
  const productId = product.id as string
  await j.call(`PUT /api/physical/products/${productId}`, {
    as: seller,
    body: { variants: [{ options: [], priceCents: 4000, sku: "CANA", weightGrams: 400, stock: { [locId]: 5 } }], requiresShipping: true, weightGrams: 400, taxable: true, trackInventory: true, fulfillmentLocationId: locId },
  })
  const variantId = j.rows("product_variants").find((v) => v.product_id === productId)?.id as string
  const level = () => j.rows("inventory_levels").find((l) => l.variant_id === variantId && l.location_id === locId) ?? { on_hand: 0, committed: 0 }

  section("2. The quote: the fee is in the total only when cash is chosen")
  const cart = [{ productId, variantId: null, quantity: 1 }]
  const card = await j.call("POST /api/physical/checkout/quote", { body: { items: cart, shopId: creator.id, country: "RO", postalCode: "030031" } })
  const curier = (card.json?.delivery?.options ?? []).find((o: any) => o.name === "Curier")
  check("by card: 40 lei and 15 lei delivery, 55 lei, no fee", card.status === 200 && card.json?.totals?.totalCents === 5500 && (card.json?.totals?.codFeeCents ?? 0) === 0, card.json?.totals)
  const cash = await j.call("POST /api/physical/checkout/quote", { body: { items: cart, shopId: creator.id, country: "RO", postalCode: "030031", deliveryOptionId: curier?.id, cashOnDelivery: true } })
  check("in cash: the 10 lei fee is in the server's total, 65 lei", cash.status === 200 && cash.json?.totals?.totalCents === 6500 && cash.json?.totals?.codFeeCents === 1000, cash.json?.totals)
  const md = await j.call("POST /api/physical/checkout/quote", { body: { items: cart, shopId: creator.id, country: "MD", deliveryOptionId: curier?.id, cashOnDelivery: true } })
  check("to Moldova, not on the cash list, the quote has no fee", md.status === 200 && (md.json?.totals?.codFeeCents ?? 0) === 0, md.json?.totals)

  section("3. An address outside the list is refused, before anything is held")
  const mdAddress = { name: "Ion Popa", line1: "Strada Stefan cel Mare 1", city: "Chisinau", postalCode: "2001", country: "MD", phone: "+373 22 123456" }
  const refused = await j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items: cart, email: "ion@example.com", name: mdAddress.name, address: mdAddress, deliveryOptionId: curier?.id, clientKey: "cod-md-1234567", cashOnDelivery: true } })
  check("Moldova is told cash isn't available for this address", refused.status === 409 && /isn't available for this address/.test(refused.json?.error ?? ""), { status: refused.status, body: refused.json })
  check("  and no stock was held for it", Number(level().committed) === 0, level())

  section("4. A cash order: placed at once, no Stripe, stock held, nothing on the ledger")
  const address = { name: "Ana Pop", line1: "Strada Florilor 3", city: "Bucuresti", postalCode: "030031", country: "RO", phone: "+40 712 345 678" }
  const sessionsBefore = j.world.sessions.size
  const place = await j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items: cart, email: "ana@example.com", name: address.name, address, deliveryOptionId: curier?.id, clientKey: "cod-ro-order-1", cashOnDelivery: true } })
  const co = j.rows("commerce_checkouts").find((c) => c.client_key === "cod-ro-order-1:cod")
  check("placed: a cash checkout, paid in the books as to collect, 65 lei", place.status === 200 && co?.provider === "cod" && co?.status === "paid" && co?.total_cents === 6500 && co?.currency === "RON", { status: place.status, body: place.json, co: co && { provider: co.provider, status: co.status, total: co.total_cents, currency: co.currency } })
  check("  the fee is kept with the delivery and named", co?.shipping_cents === 2500 && co?.shipping_rate?.cod_fee_cents === 1000, co && { shipping: co.shipping_cents, rate: co.shipping_rate })
  check("  Stripe was never asked", j.world.sessions.size === sessionsBefore && !co?.stripe_payment_intent_id && !co?.stripe_session_id)
  const lines = j.rows("orders").filter((o) => o.checkout_id === co?.id)
  check("  one order line, paid in cash on delivery, no Storelib fee", lines.length === 1 && lines[0].payment_method === "cash_on_delivery" && lines[0].provider === "cod" && (lines[0].fee_cents ?? 0) === 0 && lines[0].amount_cents === 6500, lines.map((l) => [l.payment_method, l.provider, l.fee_cents, l.amount_cents]))
  check("  its stock is held for it: 5 on the shelf, 1 committed, 4 left to sell", Number(level().on_hand) === 5 && Number(level().committed) === 1, level())
  check("  nothing goes on the seller's balance", !j.rows("ledger_events").some((e) => e.creator_id === creator.id && e.event_type === "sale"))
  const twice = await j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items: cart, email: "ana@example.com", name: address.name, address, deliveryOptionId: curier?.id, clientKey: "cod-ro-order-1", cashOnDelivery: true } })
  check("Place order pressed again is the same order", twice.status === 200 && twice.json?.receiptToken === place.json?.receiptToken && j.rows("commerce_checkouts").filter((c) => c.client_key === "cod-ro-order-1:cod").length === 1, { status: twice.status, body: twice.json })

  section("5. The emails")
  await j.cron()
  const conf = j.net.to("ana@example.com").find((m) => /confirmed/i.test(m.subject))
  const confText = conf ? words(conf.html) : ""
  check("the buyer is told what to pay in cash, and the shop's note", !!conf && /Pay 65[.,]00\s*(lei|RON)|Pay RON\s*65[.,]00/i.test(confText) && /in cash when it's delivered/.test(confText) && /Have the exact amount ready\./.test(confText), conf ? confText.slice(0, 800) : j.net.to("ana@example.com").map((m) => m.subject))
  check("  with the fee on its own row and the delivery without it", /Cash on delivery fee/.test(confText) && /Shipping\s*(lei|RON)?\s*15[.,]00|Shipping\s*15[.,]00/i.test(confText), confText.slice(0, 900))
  const sellerMail = j.net.to("hello@radu.example").find((m) => /sale|order/i.test(m.subject) && /Cana/.test(m.subject))
  const sellerText = sellerMail ? words(sellerMail.html) : ""
  check("the seller is told to collect the cash, not that money is on its way", !!sellerMail && /collect/i.test(sellerText) && !/goes to your balance/.test(sellerText), sellerMail ? sellerText.slice(0, 800) : j.net.mails.map((m) => [m.to, m.subject]))

  section("6. Mark as paid")
  const paidRes = await j.call(`POST /api/physical/orders/${co!.id}`, { as: seller, body: { action: "cash_collected" } })
  check("the order reads paid in cash", paidRes.status === 200 && paidRes.json?.order?.payment === "cod_collected" && !!j.rows("commerce_checkouts").find((c) => c.id === co!.id)?.cod_collected_at, { status: paidRes.status, payment: paidRes.json?.order?.payment })
  const paidAgain = await j.call(`POST /api/physical/orders/${co!.id}`, { as: seller, body: { action: "cash_collected" } })
  const paidEvents = j.rows("commerce_order_events").filter((e) => e.checkout_id === co!.id && /cod_collected|Cash on delivery received/.test(`${e.idempotency_key ?? ""} ${e.message ?? ""}`))
  check("  pressing it again changes nothing", paidAgain.status === 200 && paidEvents.length === 1, j.rows("commerce_order_events").filter((e) => e.checkout_id === co!.id).map((e) => [e.kind, e.message, e.idempotency_key ?? e.key]))
  check("  still nothing on the seller's Storelib balance: the cash is in their hand", !j.rows("ledger_events").some((e) => e.creator_id === creator.id && e.event_type === "sale"))

  section("7. A second order refused at the door: back as a return, back on the shelf")
  const place2 = await j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items: cart, email: "maria@example.com", name: "Maria Ionescu", address: { ...address, name: "Maria Ionescu" }, deliveryOptionId: curier?.id, clientKey: "cod-ro-order-2", cashOnDelivery: true } })
  const co2 = j.rows("commerce_checkouts").find((c) => c.client_key === "cod-ro-order-2:cod")
  const line2 = j.rows("orders").find((o) => o.checkout_id === co2?.id)
  check("placed", place2.status === 200 && !!co2 && !!line2, place2.json)
  const shelfBefore = Number(level().on_hand)
  const shipped = await j.call(`POST /api/physical/orders/${co2!.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: line2?.id, quantity: 1 }], carrier: "Fan Courier", trackingNumber: "2345678901", key: "cod-ship-2" } })
  check("shipped", shipped.status === 200, shipped.json)
  const shelfShipped = Number(level().on_hand)
  const refusedAtDoor = await j.call(`POST /api/physical/orders/${co2!.id}`, { as: seller, body: { action: "cash_refused" } })
  const back = j.rows("commerce_returns").find((r) => r.checkout_id === co2!.id)
  check("Refused on delivery: cancelled with the reason, nothing refunded", refusedAtDoor.status === 200 && j.rows("commerce_checkouts").find((c) => c.id === co2!.id)?.cancel_reason === "Refused on delivery" && !(Number(refusedAtDoor.json?.order?.refundedCents) > 0), { status: refusedAtDoor.status, body: refusedAtDoor.json?.error, order: refusedAtDoor.json?.order && { payment: refusedAtDoor.json.order.payment, refunded: refusedAtDoor.json.order.refundedCents } })
  check("  its line stops being a sale", j.rows("orders").find((o) => o.id === line2?.id)?.status === "failed")
  check("  what was sent comes back as a return the shop opened", !!back && back.status === "approved" && back.requested_by === "creator", back && { status: back.status, by: back.requested_by })
  const again2 = await j.call(`POST /api/physical/orders/${co2!.id}`, { as: seller, body: { action: "cash_refused" } })
  check("  pressing it again opens no second return", again2.status === 200 && j.rows("commerce_returns").filter((r) => r.checkout_id === co2!.id).length === 1)
  const recv = await j.call(`POST /api/physical/orders/${co2!.id}`, { as: seller, body: { action: "return_move", returnId: back?.id, status: "received" } })
  check("received: the mug is back on the shelf", recv.status === 200 && Number(level().on_hand) === shelfShipped + 1, { status: recv.status, before: shelfBefore, shipped: shelfShipped, now: level() })
  await j.cron()
  const cancelled = j.net.to("maria@example.com").find((m) => /cancel/i.test(m.subject))
  check("the buyer hears the order was cancelled", !!cancelled, j.net.to("maria@example.com").map((m) => m.subject))
  check("nothing went to Stripe for either order", j.world.sessions.size === sessionsBefore)

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
