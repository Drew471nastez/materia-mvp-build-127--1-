/**
 * MANY PARCELS, MANY ORDERS, A TRACKING CSV
 *
 * Over the journey harness (tests/_journey: in-memory PostgREST with the
 * database functions ported, a Stripe world, the real cron and emails),
 * through the real routes:
 *
 *   one order shipped in two parcels in one press: two rows, each with its
 *   own tracking, stock taken once per unit, the same press again writes
 *   nothing, one email naming both parcels, the buyer's page with both
 *   tracking links; a split that adds up to too much, or with one bad
 *   parcel, writes nothing at all;
 *
 *   Mark as fulfilled on several orders from the Orders list: the ones that
 *   can be are, the ones that can't (cancelled, already fulfilled, a return,
 *   a pickup, a download, an unknown id) say why and are left untouched;
 *
 *   a tracking CSV: the preview writes nothing and names every row's
 *   problem, a formula in a cell is refused with its row, a file too big is
 *   refused, Import ships exactly what the preview showed, one email per
 *   order.
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

  section("1. A store that ships lamps and shades from its workshop")
  const seller = await j.signUp("bulk@example.com", { name: "Bo Bulk" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "bo-shop" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Bo Shop", supportEmail: "hello@bo.example", defaultCountry: "DE" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "DE", businessName: "Bo Shop GmbH" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  await j.call("POST /api/settings/payments", { as: seller, body: { defaultCurrency: "EUR" } })
  await j.call("PUT /api/store/currency", { as: seller, body: { country: "DE", currency: "EUR", key: "bo-eur-1" } })
  await j.call("PUT /api/physical/settings", { as: seller, body: { returnsEnabled: true, returnWindowDays: 30 } })
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const workshop = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${workshop}`, { as: seller, body: { name: "Workshop", kind: "home", addressLine1: "Hauptstr. 1", city: "Berlin", postalCode: "10115", country: "DE", pickupEnabled: true, pickupInstructions: "Ring the bell." } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["DE"], name: "Germany" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("DE"))
  await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Standard", priceCents: 500, minDays: 1, maxDays: 3 } })
  const lampId = newProduct(j, creator.id, "Desk Lamp", 4000)
  await j.call(`PUT /api/physical/products/${lampId}`, { as: seller, body: { variants: [{ options: [], priceCents: 4000, sku: "LAMP", weightGrams: 900, stock: { [workshop]: 40 } }], requiresShipping: true, weightGrams: 900, trackInventory: true, fulfillmentLocationId: workshop } })
  const shadeId = newProduct(j, creator.id, "Linen Shade", 1500)
  await j.call(`PUT /api/physical/products/${shadeId}`, { as: seller, body: { variants: [{ options: [], priceCents: 1500, sku: "SHADE", weightGrams: 300, stock: { [workshop]: 20 } }], requiresShipping: true, weightGrams: 300, trackInventory: true, fulfillmentLocationId: workshop } })
  const lampV = j.rows("product_variants").find((v) => v.product_id === lampId)?.id as string
  const shadeV = j.rows("product_variants").find((v) => v.product_id === shadeId)?.id as string
  const level = (variant: string) => {
    const l = j.rows("inventory_levels").find((x) => x.variant_id === variant && x.location_id === workshop)
    return { onHand: Number(l?.on_hand ?? 0), committed: Number(l?.committed ?? 0) }
  }
  check("40 lamps and 20 shades on the shelf", level(lampV).onHand === 40 && level(shadeV).onHand === 20, { lamp: level(lampV), shade: level(shadeV) })
  const bea = { name: "Bea Buyer", line1: "Gartenweg 2", city: "Berlin", postalCode: "10117", country: "DE", phone: "+49 30 1234567" }
  const parcelsOf = (checkoutId: string) => j.rows("fulfillments").filter((f) => f.checkout_id === checkoutId)

  section("2. One order, two parcels, one press")
  const co = await buyByCard(j, creator.id, [{ productId: lampId, variantId: null, quantity: 3 }, { productId: shadeId, variantId: null, quantity: 1 }], "bea@example.com", bea, "bulk-order-1")
  const lampLine = j.rows("orders").find((o) => o.checkout_id === co!.id && o.product_id === lampId)!
  const shadeLine = j.rows("orders").find((o) => o.checkout_id === co!.id && o.product_id === shadeId)!
  await j.cron()
  const startLamp = level(lampV)
  const startShade = level(shadeV)
  check("paid: 3 lamps and a shade held", !!co && startLamp.committed === 3 && startShade.committed === 1, { lamp: startLamp, shade: startShade })

  const tooMuch = await act(j, seller, co!.id, { action: "fulfil", key: "split-x", parcels: [{ items: [{ orderId: lampLine.id, quantity: 2 }] }, { items: [{ orderId: lampLine.id, quantity: 2 }] }] })
  check("two parcels of 2 lamps, of 3, are refused and nothing is written", tooMuch.status === 400 && /add up to more than the 3 left/.test(tooMuch.json?.error ?? "") && parcelsOf(co!.id).length === 0, { status: tooMuch.status, error: tooMuch.json?.error, rows: parcelsOf(co!.id).length })
  const oneBad = await act(j, seller, co!.id, { action: "fulfil", key: "split-y", parcels: [{ items: [{ orderId: lampLine.id, quantity: 2 }], carrier: "DHL", trackingNumber: "00340434161234567890" }, { items: [{ orderId: shadeLine.id, quantity: 1 }], carrier: "DPD", trackingNumber: "no way!" }] })
  check("a bad tracking number on parcel 2 refuses both: all or nothing", oneBad.status === 400 && /^Parcel 2:/.test(oneBad.json?.error ?? "") && parcelsOf(co!.id).length === 0 && eq(level(lampV), startLamp), { status: oneBad.status, error: oneBad.json?.error, rows: parcelsOf(co!.id).length })
  const noNum = await act(j, seller, co!.id, { action: "fulfil", key: "split-w", parcels: [{ items: [{ orderId: lampLine.id, quantity: 3 }], carrier: "DHL", trackingNumber: "00340434161234567890" }, { items: [{ orderId: shadeLine.id, quantity: 1 }], carrier: "DPD" }] })
  check("a parcel with a carrier and no number is refused by the tracking rule, nothing written", noNum.status === 400 && /^Parcel 2: Add the tracking number/.test(noNum.json?.error ?? "") && parcelsOf(co!.id).length === 0, noNum.json)
  const emptyParcel = await act(j, seller, co!.id, { action: "fulfil", key: "split-z", parcels: [{ items: [{ orderId: lampLine.id, quantity: 3 }] }, { items: [] }] })
  check("an empty parcel is refused", emptyParcel.status === 400 && /Parcel 2 has no items/.test(emptyParcel.json?.error ?? "") && parcelsOf(co!.id).length === 0, emptyParcel.json)

  const split = { action: "fulfil", key: "split-1", notifyBuyer: true, parcels: [
    { items: [{ orderId: lampLine.id, quantity: 2 }], carrier: "DHL", trackingNumber: "00340434161234567890" },
    { items: [{ orderId: lampLine.id, quantity: 1 }, { orderId: shadeLine.id, quantity: 1 }], carrier: "DPD", trackingNumber: "01234567890123" },
  ] }
  const two = await act(j, seller, co!.id, split)
  const o2 = two.json?.order
  check("saved: two parcels, the order Fulfilled", two.status === 200 && parcelsOf(co!.id).length === 2 && o2?.fulfillmentStatus === "fulfilled" && o2?.shipments?.length === 2, { status: two.status, error: two.json?.error, rows: parcelsOf(co!.id).length, f: o2?.fulfillmentStatus })
  const dhl = o2?.shipments?.find((s: any) => s.trackingNumber === "00340434161234567890")
  const dpd = o2?.shipments?.find((s: any) => s.trackingNumber === "01234567890123")
  check("  each parcel its own carrier, number, link and items", dhl?.carrier === "DHL" && dpd?.carrier === "DPD" && /00340434161234567890/.test(dhl?.trackingUrl ?? "") && /01234567890123/.test(dpd?.trackingUrl ?? "") && dhl?.items?.[0]?.quantity === 2 && dpd?.items?.length === 2, { dhl, dpd })
  check("  each keyed from the press and its place in it", parcelsOf(co!.id).map((f) => f.idempotency_key).sort().join() === [`fulfil:${co!.id}:split-1:1`, `fulfil:${co!.id}:split-1:2`].join(), parcelsOf(co!.id).map((f) => f.idempotency_key))
  check("  stock taken once per unit: 3 lamps and 1 shade off the shelf", eq(level(lampV), { onHand: startLamp.onHand - 3, committed: startLamp.committed - 3 }) && eq(level(shadeV), { onHand: startShade.onHand - 1, committed: startShade.committed - 1 }), { lamp: level(lampV), shade: level(shadeV) })
  const movements = j.rows("inventory_movements").filter((m) => m.reason === "sale_fulfilled" && parcelsOf(co!.id).some((f) => f.id === m.ref_id))
  check("  three stock movements: one per parcel and line", movements.length === 3 && movements.reduce((n, m) => n + Number(m.delta_on_hand), 0) === -4, movements.map((m) => m.delta_on_hand))

  const replay = await act(j, seller, co!.id, split)
  check("the same press again writes nothing new", replay.status === 200 && parcelsOf(co!.id).length === 2 && eq(level(lampV), { onHand: startLamp.onHand - 3, committed: startLamp.committed - 3 }), { status: replay.status, rows: parcelsOf(co!.id).length, lamp: level(lampV) })

  await j.cron()
  const shipMails = j.net.to("bea@example.com").filter((m) => /on the way/i.test(m.subject))
  check("one shipment email for the batch, not two", shipMails.length === 1, j.net.to("bea@example.com").map((m) => m.subject))
  const mail = shipMails[0]
  check("  naming both parcels with a link each", !!mail && /Package 1 of 2/.test(words(mail.html)) && /Package 2 of 2/.test(words(mail.html)) && /00340434161234567890/.test(mail.html) && /01234567890123/.test(mail.html) && /shipped in 2 packages/.test(words(mail.html)), mail && words(mail.html).slice(0, 700))
  check("  and in its plain text", !!mail && /Package 1 of 2: DHL 00340434161234567890/.test(mail.text ?? "") && /Package 2 of 2: DPD 01234567890123/.test(mail.text ?? ""), mail?.text?.slice(0, 600))
  const page = await renderBuyerPage(co!.receipt_token)
  const links = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  check("the buyer's page shows both parcels, each with its own tracking link", (page.match(/data-shipment-status="/g) ?? []).length === 2 && links.some((h) => /00340434161234567890/.test(h)) && links.some((h) => /01234567890123/.test(h)) && /Package 2 of 2/.test(words(page)), words(page).slice(0, 600))

  section("3. One parcel is still the single fulfilment it was")
  const coS = await buyByCard(j, creator.id, [{ productId: lampId, variantId: null, quantity: 1 }], "sol@example.com", { ...bea, name: "Sol Single" }, "bulk-order-s")
  const lineS = j.rows("orders").find((o) => o.checkout_id === coS!.id)!
  const single = await act(j, seller, coS!.id, { action: "fulfil", items: [{ orderId: lineS.id, quantity: 1 }], carrier: "DHL", trackingNumber: "00340434160000000077", key: "one-1" })
  check("keyed fulfil:<checkout>:<key> as before", single.status === 200 && parcelsOf(coS!.id).length === 1 && parcelsOf(coS!.id)[0].idempotency_key === `fulfil:${coS!.id}:one-1`, parcelsOf(coS!.id).map((f) => f.idempotency_key))

  section("4. Mark as fulfilled on several orders from the Orders list")
  const mk = async (email: string, key: string, qty = 1, product = lampId) => {
    const c = await buyByCard(j, creator.id, [{ productId: product, variantId: null, quantity: qty }], email, { ...bea, name: email.split("@")[0] }, key)
    return { co: c!, line: j.rows("orders").find((o) => o.checkout_id === c!.id)! }
  }
  const okA = await mk("ada@example.com", "bulk-order-a", 2)
  const okB = await mk("ben@example.com", "bulk-order-b", 1, shadeId)
  const noNumber = await mk("fay@example.com", "bulk-order-f", 1)
  const cancelled = await mk("cid@example.com", "bulk-order-c")
  await act(j, seller, cancelled.co.id, { action: "cancel", reason: "Out of stock" })
  const done = await mk("dot@example.com", "bulk-order-d")
  await act(j, seller, done.co.id, { action: "fulfil", items: [{ orderId: done.line.id, quantity: 1 }], key: "d-1", notifyBuyer: false })
  const returning = await mk("eli@example.com", "bulk-order-e", 2)
  await act(j, seller, returning.co.id, { action: "fulfil", items: [{ orderId: returning.line.id, quantity: 1 }], key: "e-1", notifyBuyer: false })
  const ret = await act(j, seller, returning.co.id, { action: "return", items: [{ orderId: returning.line.id, quantity: 1, restock: true }], reason: "damaged" })
  check("an order with a return open, one lamp still to ship", ret.status === 200 && ret.json?.order?.returnStatus !== "none", ret.json?.error ?? ret.json?.order?.returnStatus)
  const quote = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: lampId, variantId: null, quantity: 1 }], shopId: creator.id, country: "DE", postalCode: "10117" } })
  const pickupOpt = (quote.json?.pickups ?? []).find((o: any) => o.name === "Workshop")
  const pick = await buyByCard(j, creator.id, [{ productId: lampId, variantId: null, quantity: 1 }], "pia@example.com", { ...bea, name: "Pia" }, "bulk-order-p", pickupOpt?.id)
  const ebookId = newProduct(j, creator.id, "Lamp Manual", 500, "digital")
  const [download] = j.db.insert("orders", { product_id: ebookId, creator_id: creator.id, buyer_email: "dee@example.com", amount_cents: 500, status: "completed", requires_shipping: false }, {})
  const downloadBefore = JSON.stringify(j.rows("orders").find((o) => o.id === download.id))
  const ghost = crypto.randomUUID()
  await j.cron()
  const mailsBefore = j.net.mails.length

  const loaded = await j.call("POST /api/physical/orders/bulk", { as: seller, body: { action: "load", ids: [okA.line.id, okB.co.id, cancelled.line.id, done.line.id, returning.line.id, pick!.id, download.id, ghost] } })
  const view = (id: string) => (loaded.json?.orders ?? []).find((o: any) => o.id === id)
  check("load: each order with what it has left, or why not", loaded.status === 200 && view(okA.line.id)?.refused === null && view(okA.line.id)?.lines?.[0]?.open === 2 && view(okB.co.id)?.refused === null, loaded.json)
  check("  refusals named: cancelled, fulfilled, return, pickup, download, unknown", /cancelled/.test(view(cancelled.line.id)?.refused ?? "") && /Already fulfilled/.test(view(done.line.id)?.refused ?? "") && /return/.test(view(returning.line.id)?.refused ?? "") && /pickup/i.test(view(pick!.id)?.refused ?? "") && !!view(download.id)?.refused && !!view(ghost)?.refused, (loaded.json?.orders ?? []).map((o: any) => [o.number, o.refused]))
  check("  with the Orders page's number", /^#\d+$/.test(view(okA.line.id)?.number ?? ""), view(okA.line.id)?.number)

  const lampBefore = level(lampV)
  const shadeBefore = level(shadeV)
  const bulkBody = { action: "fulfil", key: "bulk-press-1", notifyBuyer: true, orders: [
    { id: okA.line.id, carrier: "DHL", trackingNumber: "00340434160000000101" },
    { id: okB.co.id, carrier: null, trackingNumber: "" },
    { id: noNumber.co.id, carrier: "DHL", trackingNumber: "" },
    { id: cancelled.line.id, carrier: "DHL" },
    { id: done.line.id, carrier: "DHL" },
    { id: returning.line.id, carrier: "DHL" },
    { id: pick!.id, carrier: "DHL" },
    { id: download.id, carrier: "DHL" },
    { id: ghost, carrier: "DHL" },
  ] }
  const bulk = await j.call("POST /api/physical/orders/bulk", { as: seller, body: bulkBody })
  const res = (id: string) => (bulk.json?.results ?? []).find((r: any) => r.id === id)
  check("the two that can be are fulfilled", bulk.status === 200 && res(okA.line.id)?.ok === true && res(okA.line.id)?.units === 2 && res(okB.co.id)?.ok === true, bulk.json)
  check("  each of the others says why, order by order", [cancelled.line.id, done.line.id, returning.line.id, pick!.id, download.id, ghost].every((id) => res(id)?.ok === false && typeof res(id)?.error === "string"), (bulk.json?.results ?? []).map((r: any) => [r.number, r.ok, r.error]))
  check("  a carrier named without its number is refused by the tracking rule, the order untouched", res(noNumber.co.id)?.ok === false && /Add the tracking number/.test(res(noNumber.co.id)?.error ?? "") && parcelsOf(noNumber.co.id).length === 0, res(noNumber.co.id))
  check("  A shipped with its DHL number, B shipped without one", parcelsOf(okA.co.id).length === 1 && parcelsOf(okA.co.id)[0].tracking_number === "00340434160000000101" && parcelsOf(okA.co.id)[0].carrier === "DHL" && parcelsOf(okB.co.id).length === 1 && !parcelsOf(okB.co.id)[0].tracking_number, { a: parcelsOf(okA.co.id), b: parcelsOf(okB.co.id) })
  check("  stock taken for 2 lamps and 1 shade, nothing else", eq(level(lampV), { onHand: lampBefore.onHand - 2, committed: lampBefore.committed - 2 }) && eq(level(shadeV), { onHand: shadeBefore.onHand - 1, committed: shadeBefore.committed - 1 }), { lamp: level(lampV), shade: level(shadeV) })
  check("  the refused orders are untouched", parcelsOf(cancelled.co.id).length === 0 && parcelsOf(done.co.id).length === 1 && parcelsOf(returning.co.id).length === 1 && parcelsOf(pick!.id).length === 0 && JSON.stringify(j.rows("orders").find((o) => o.id === download.id)) === downloadBefore)
  check("  nothing marked delivered", [okA.co.id, okB.co.id].every((id) => parcelsOf(id).every((f) => f.status === "shipped") && !j.rows("commerce_checkouts").find((c) => c.id === id)?.delivered_at))
  const again = await j.call("POST /api/physical/orders/bulk", { as: seller, body: bulkBody })
  check("the same bulk press again ships nothing twice", again.status === 200 && parcelsOf(okA.co.id).length === 1 && parcelsOf(okB.co.id).length === 1 && eq(level(lampV), { onHand: lampBefore.onHand - 2, committed: lampBefore.committed - 2 }), (again.json?.results ?? []).map((r: any) => [r.number, r.ok, r.error]))
  await j.cron()
  check("  one email each to Ada and Ben, none to the others", j.net.to("ada@example.com").filter((m) => /on the way/i.test(m.subject)).length === 1 && j.net.to("ben@example.com").filter((m) => /on the way/i.test(m.subject)).length === 1 && j.net.mails.slice(mailsBefore).every((m) => ["ada@example.com", "ben@example.com"].includes(String(m.to)) || !/on the way/i.test(m.subject)), j.net.mails.slice(mailsBefore).map((m) => [m.to, m.subject]))
  const tooMany = await j.call("POST /api/physical/orders/bulk", { as: seller, body: { action: "fulfil", key: "no-orders", orders: [] } })
  check("no orders chosen is refused", tooMany.status === 400)
  const stranger = await j.signUp("stranger@example.com", { name: "Stranger" })
  const theirs = await j.call("POST /api/physical/orders/bulk", { as: stranger, body: { action: "fulfil", key: "stranger-1", orders: [{ id: okA.co.id }] } })
  check("someone without a store gets nothing", theirs.status >= 400 && theirs.status < 500, { status: theirs.status })

  section("5. A tracking CSV: preview, then import")
  const h = await mk("hal@example.com", "bulk-order-h", 2)
  const i = await mk("ivy@example.com", "bulk-order-i", 1, shadeId)
  const k = await mk("kai@example.com", "bulk-order-k", 1)
  const numbers = await j.call("POST /api/physical/orders/bulk", { as: seller, body: { action: "load", ids: [h.co.id, i.co.id, k.co.id, okA.co.id] } })
  const num = (id: string) => (numbers.json?.orders ?? []).find((o: any) => o.id === id)?.number as string
  await j.cron()
  const rowsBefore = j.rows("fulfillments").length
  const jobsBefore = j.rows("commerce_jobs").length
  const sentBefore = j.net.mails.length
  const csv = [
    "Order,Carrier,Tracking number,SKU,Quantity",
    `${num(h.co.id)},DHL,00340434160000000201,LAMP,1`,
    `${num(h.co.id)},DPD,01234567890201,LAMP,1`,
    `${num(i.co.id)},"=HYPERLINK(""https://evil.example"",""x"")",01234567890202,,`,
    `#99999,DHL,00340434160000000203,,`,
    `${num(k.co.id)},@SUM(1+1),00340434160000000204,,`,
    `${num(okA.co.id)},DHL,00340434160000000205,,`,
    `${num(k.co.id)},DHL,,,`,
  ].join("\n")
  const preview = await j.call("POST /api/physical/orders/bulk", { as: seller, body: { action: "preview", csv } })
  const p = preview.json?.preview
  const row = (line: number) => (p?.rows ?? []).find((r: any) => r.line === line)
  check("the preview writes nothing: no parcel, no job, no email", preview.status === 200 && j.rows("fulfillments").length === rowsBefore && j.rows("commerce_jobs").length === jobsBefore && j.net.mails.length === sentBefore, { status: preview.status, error: preview.json?.error })
  check("  H in two parcels, 1 lamp each", row(2)?.error === null && row(3)?.error === null && p?.orders?.find((o: any) => o.checkoutId === h.co.id)?.parcels?.length === 2, p?.rows)
  check("  the formula cells are refused with their rows", /formula/.test(row(4)?.error ?? "") && /formula/.test(row(6)?.error ?? ""), [row(4), row(6)])
  check("  a carrier without a number is refused by the tracking rule", /Add the tracking number/.test(row(8)?.error ?? ""), row(8))
  check("  an unknown order and a fulfilled one say so", /couldn't find/.test(row(5)?.error ?? "") && /Already fulfilled/.test(row(7)?.error ?? ""), [row(5), row(7)])
  check("  the count: 1 order, 2 parcels, 2 units; 5 rows with errors", p?.counts?.orders === 1 && p?.counts?.parcels === 2 && p?.counts?.units === 2 && p?.counts?.errors === 5, p?.counts)
  const imported = await j.call("POST /api/physical/orders/bulk", { as: seller, body: { action: "import", csv, key: "import-1", notifyBuyer: true } })
  check("import: H shipped in its two parcels, nothing else", imported.status === 200 && (imported.json?.results ?? []).length === 1 && imported.json.results[0].ok === true && parcelsOf(h.co.id).length === 2 && parcelsOf(i.co.id).length === 0 && parcelsOf(k.co.id).length === 0, { status: imported.status, results: imported.json?.results, error: imported.json?.error })
  check("  no formula reached a saved row", !j.rows("fulfillments").some((f) => /^[=@+-]|HYPERLINK|SUM\(/i.test(String(f.carrier ?? ""))))
  const reimport = await j.call("POST /api/physical/orders/bulk", { as: seller, body: { action: "import", csv, key: "import-1", notifyBuyer: true } })
  check("  importing the same file again ships nothing twice", reimport.status === 200 && parcelsOf(h.co.id).length === 2, { results: reimport.json?.results })
  await j.cron()
  check("  Hal gets one email naming both parcels", j.net.to("hal@example.com").filter((m) => /on the way/i.test(m.subject)).length === 1 && /Package 2 of 2/.test(words(j.net.to("hal@example.com").find((m) => /on the way/i.test(m.subject))?.html ?? "")), j.net.to("hal@example.com").map((m) => m.subject))
  const big = await j.call("POST /api/physical/orders/bulk", { as: seller, body: { action: "preview", csv: "Order,Carrier,Tracking number\n" + `#1001,DHL,00340434160000000999\n`.repeat(30000) } })
  check("a file over 512 KB is refused", big.status === 413 || (big.status === 400 && /512 KB/.test(big.json?.error ?? big.json?.preview?.error ?? "")), { status: big.status, error: big.json?.error })
  const noOrder = await j.call("POST /api/physical/orders/bulk", { as: seller, body: { action: "preview", csv: "Carrier,Tracking number\nDHL,00340434160000000999" } })
  check("a file without an Order column says so", noOrder.status === 400 && /Order column/.test(noOrder.json?.preview?.error ?? ""), noOrder.json)

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

let buyers = 0

/** A cart bought through Stripe's page, the webhooks delivered as Stripe sends them; the checkout row after. */
async function buyByCard(j: Journey, shopId: string, items: { productId: string; variantId: null; quantity: number }[], email: string, address: Record<string, string>, clientKey: string, deliveryOptionId?: string) {
  let option = deliveryOptionId
  if (!option) {
    const q = await j.call("POST /api/physical/checkout/quote", { body: { items, shopId, country: address.country, postalCode: address.postalCode } })
    option = (q.json?.delivery?.options ?? []).find((o: any) => o.name === "Standard")?.id
  }
  /* Each buyer from their own address: the checkout is limited per address, and this store has many buyers. */
  const start = await j.call("POST /api/physical/checkout", { body: { shopId, items, email, name: address.name, address, deliveryOptionId: option, clientKey }, headers: { "x-forwarded-for": `198.51.100.${++buyers}` } })
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
    const { default: Page } = await import("@/app/(storelib)/checkout/physical/order/[token]/page")
    const { renderToStaticMarkup } = await import("react-dom/server")
    const tree = await Page({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) })
    return renderToStaticMarkup(tree)
  } catch (e) {
    return `render failed: ${e instanceof Error ? e.stack : String(e)}`
  }
}

function newProduct(j: Journey, creatorId: string, title: string, priceCents: number, type = "physical"): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type, title, slug, description: `<p>${title}</p>`, status: "published", price_cents: priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
