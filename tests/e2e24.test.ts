/**
 * ROUND 24, V24: THE WHOLE COMMERCE FLOW, AS ONE JOURNEY
 *
 * A creator signs up and sells physical things at 100%, through the real
 * route handlers and server modules, over the journey harness
 * (tests/_journey: an in-memory PostgREST with the SQL's keys and the
 * commerce functions ported, a GoTrue, a Mailgun mailbox, a Stripe world
 * whose webhooks are signed and delivered to the real webhook route).
 *
 * Every step checks what people see: the seller's order page data, the
 * buyer's order page data, the emails' subjects and words, counted.
 *
 * Run: node scripts/run-push-tests.mjs (in SUITES)
 */
import "./_journey/env"
import { Journey, type Person } from "./_journey/harness"
import type { StripeWorld } from "./_journey/stripe-fake"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"

let passed = 0
let failed = 0
const table: { step: string; ok: boolean; detail?: string }[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  table.push({ step: name, ok, detail: ok ? undefined : JSON.stringify(detail)?.slice(0, 400) })
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

async function main() {
  const j = await Journey.start()

  section("1. A creator signs up and sets up the store")
  const seller = await j.signUp("maker@example.com", { name: "Ana Maker" })
  const fin = await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "ana-ceramics" } })
  check("signup as a creator answers ok and writes the creator row", fin.status === 200 && fin.json?.ok === true && j.rows("creators").length === 1, fin.json)
  const creator = j.rows("creators")[0]

  const store = await j.call("PUT /api/store/settings", {
    as: seller,
    body: { storeName: "Ana Ceramics", supportEmail: "hello@anaceramics.example", defaultCountry: "RO", phone: "+40 722 123 456", phoneCountry: "RO" },
  })
  check("Store details save (name, contact email, country, phone)", store.status === 200 && store.json?.settings?.storeName === "Ana Ceramics", store.json)
  const legal = await j.call("PUT /api/store/settings", {
    as: seller,
    body: { legal: { company: "Ana Ceramics SRL", line1: "Str. Lunga 1", city: "Cluj-Napoca", postalCode: "400001", country: "RO", taxId: "RO12345678" } },
  })
  check("Business details save (legal name, address, tax id)", legal.status === 200, legal.json)

  section("2. Payments connected (Stripe Connect, stubbed)")
  const pay = await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "RO", businessName: "Ana Ceramics SRL" } })
  const acct = j.rows("creators")[0].stripe_account_id as string | null
  check("Set up payments makes a connected account and answers its onboarding", pay.status === 200 && typeof acct === "string" && acct.startsWith("acct_"), { status: pay.status, body: pay.json, acct })
  if (acct) j.world.activate(acct)
  const upd = acct ? await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct }) : null
  const ready = j.rows("creators")[0]
  check("account.updated (Stripe finished onboarding) marks the store ready to take payments", upd?.status === 200 && ready.charges_enabled === true && ready.stripe_onboarding_status === "connected", { status: upd?.status, body: upd?.json, row: { charges_enabled: ready.charges_enabled, payouts_enabled: ready.payouts_enabled, status: ready.stripe_onboarding_status } })

  section("3. Shipping, locations, pickup, local delivery, packages")
  const onb = await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  check("fulfilment type: I ship myself, a first location and the General profile made", onb.status === 200 && j.rows("inventory_locations").length === 1 && j.rows("shipping_profiles").length === 1, onb.json)
  const studioId = j.rows("inventory_locations")[0].id as string
  const loc = await j.call(`PATCH /api/physical/locations/${studioId}`, {
    as: seller,
    body: {
      name: "Studio",
      kind: "home",
      addressLine1: "Str. Lunga 1",
      city: "Cluj-Napoca",
      postalCode: "400001",
      country: "RO",
      pickupEnabled: true,
      pickupReady: "24h",
      pickupInstructions: "Ring the bell at the blue door.",
      pickupHours: "Mon to Fri, 10:00 to 18:00",
      localDelivery: { enabled: true, codes: "400001, 400002, 400003", priceCents: 1000, freeOverCents: 20000, note: "We bring it by bike." },
    },
  })
  const studio = j.rows("inventory_locations").find((l) => l.id === studioId)!
  check("the location saves its address, pickup (with hours) and local delivery", loc.status === 200 && studio.pickup_enabled === true && studio.pickup_hours === "Mon to Fri, 10:00 to 18:00" && studio.local_delivery_enabled === true && (studio.local_delivery_codes ?? []).length === 3, { status: loc.status, body: loc.json, studio })
  const pkg = await j.call("POST /api/physical/packages", { as: seller, body: { name: "Mug box", kind: "box", lengthMm: 200, widthMm: 150, heightMm: 150, weightGrams: 250 } })
  const pkgId = j.rows("shipping_packages")[0]?.id as string | undefined
  const set = await j.call("PUT /api/physical/settings", { as: seller, body: { defaultPackageId: pkgId, returnsEnabled: true, returnWindowDays: 30, lowStockAlerts: true, lowStockDefault: 2, unitSystem: "metric" } })
  check("a package saves and becomes the default; returns 30 days, low stock at 2", pkg.status === 200 && set.status === 200 && j.rows("commerce_settings")[0]?.default_package_id === pkgId && j.rows("commerce_settings")[0]?.return_window_days === 30, { pkg: pkg.json, set: set.json })
  const profileId = j.rows("shipping_profiles")[0].id as string
  const zRo = await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["RO"], name: "Romania" } })
  const zWorld = await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, restOfWorld: true } })
  const roZone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("RO"))
  const worldZone = j.rows("shipping_zones").find((z) => z.rest_of_world)
  const r1 = await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: roZone?.id, kind: "flat", name: "Standard", priceCents: 1500, minDays: 2, maxDays: 4 } })
  const r2 = await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: roZone?.id, kind: "flat", name: "Express", priceCents: 3000, minDays: 1, maxDays: 1 } })
  const r3 = await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: worldZone?.id, kind: "flat", name: "International", priceCents: 4500, minDays: 5, maxDays: 10 } })
  check("zones (Romania, rest of world) and rates (Standard, Express, International) save", [zRo, zWorld, r1, r2, r3].every((r) => r.status === 200 || r.status === 201) && j.rows("shipping_rates").length === 3, [zRo, zWorld, r1, r2, r3].map((r) => [r.status, r.json]))

  section("4. Taxes and checkout settings")
  const tx = await j.call("PUT /api/store/taxes", { as: seller, body: { enabled: true, included: false, onShipping: true, digital: false } })
  const vat = await j.call("POST /api/store/taxes/regions", { as: seller, body: { country: "RO", rate: 19, name: "VAT" } })
  check("taxes on, added at checkout, on shipping; Romania VAT 19%", tx.status === 200 && vat.status === 200 && j.rows("commerce_tax_rates").some((r) => r.country === "RO" && r.rate_bps === 1900), { tx: tx.json, vat: vat.json, rates: j.rows("commerce_tax_rates") })
  const co = await j.call("PUT /api/store/settings", { as: seller, body: { checkout: { abandonedRecovery: true, marketingOptIn: true, phone: "optional", buyerCancel: true } } })
  check("checkout settings save (abandoned reminder, news box, phone optional, buyer cancel)", co.status === 200 && co.json?.settings?.checkout?.abandonedRecovery === true, co.json)

  section("5. Products: a mug with colours and stock, a download")
  const mugId = await newProduct(j, creator.id, { type: "physical", title: "Stoneware Mug", priceCents: 4500 })
  const mugSave = await j.call(`PUT /api/physical/products/${mugId}`, {
    as: seller,
    body: {
      options: [{ name: "Colour", values: ["Blue", "Green", "Sand"] }],
      variants: [
        { options: ["Blue"], priceCents: 4500, sku: "MUG-BLU", weightGrams: 400, stock: { [studioId]: 30 } },
        { options: ["Green"], priceCents: 4500, sku: "MUG-GRN", weightGrams: 400, stock: { [studioId]: 2 } },
        { options: ["Sand"], priceCents: 4800, sku: "MUG-SND", weightGrams: 400, stock: { [studioId]: 0 } },
      ],
      requiresShipping: true,
      weightGrams: 400,
      taxable: true,
      trackInventory: true,
      fulfillmentLocationId: studioId,
      maxPerOrder: 3,
    },
  })
  const variants = j.rows("product_variants").filter((v) => v.product_id === mugId)
  const vId = (name: string) => variants.find((v) => v.name === name)?.id as string
  const level = (name: string) => j.rows("inventory_levels").find((l) => l.variant_id === vId(name) && l.location_id === studioId) ?? { on_hand: 0, committed: 0 }
  check("the mug saves 3 variants with stock 30 / 2 / 0 and a limit of 3 per order", mugSave.status === 200 && variants.length === 3 && level("Blue").on_hand === 30 && level("Green").on_hand === 2 && level("Sand").on_hand === 0 && j.rows("products").find((p) => p.id === mugId)?.max_per_order === 3, { status: mugSave.status, body: mugSave.json, variants: variants.map((v) => v.name) })
  const pdfId = await newProduct(j, creator.id, { type: "digital", title: "Glaze Recipes (PDF)", priceCents: 1200 })

  section("6. Sales channels")
  const ch = await j.call(`GET /api/store/channels/product?productId=${mugId}`, { as: seller })
  check("the store's channels list, the mug on all of them", ch.status === 200 && Array.isArray(ch.json?.channels) && (ch.json?.off ?? []).length === 0, ch.json)

  
  section("7. The buyer visits the store")
  const sp = await j.call(`GET /api/physical/storefront/product?productId=${mugId}&country=RO`)
  const spv = (n: string) => (sp.json?.variants ?? []).find((v: any) => v.name === n)
  check("product page: three colours, Sand sold out, Green shows only 2 left, at most 3 per order", sp.status === 200 && spv("Sand")?.soldOut === true && spv("Blue")?.soldOut === false && spv("Green")?.left === 2 && spv("Blue")?.maxQuantity === 3, sp.json?.variants)
  check("product page: the delivery promise reads from the Romania rates, and pickup at the Studio", !!sp.json?.delivery && JSON.stringify(sp.json.delivery).includes("15") && JSON.stringify(spv("Blue")?.pickup ?? []).includes("Studio"), { delivery: sp.json?.delivery, pickup: spv("Blue")?.pickup })

  const buyer = { email: "ioana@example.com", name: "Ioana Pop" }
  const address = { name: "Ioana Pop", line1: "Str. Florilor 10", city: "Cluj-Napoca", postalCode: "400100", country: "RO", phone: "+40 744 000 111" }
  const cart = [
    { productId: mugId, variantId: vId("Blue"), quantity: 2 },
    { productId: pdfId, variantId: null, quantity: 1 },
  ]
  const q = await j.call("POST /api/physical/checkout/quote", { body: { items: cart, shopId: creator.id, couponCode: "", country: "RO", postalCode: "400100" } })
  const std = (q.json?.delivery?.options ?? []).find((o: any) => o.name === "Standard")
  check("checkout quote: Standard 15.00 and Express 30.00 to Cluj, the cheapest chosen; pickup offered", q.status === 200 && std?.priceCents === 1500 && (q.json?.delivery?.options ?? []).some((o: any) => o.name === "Express" && o.priceCents === 3000) && q.json?.delivery?.selectedId === std?.id && (q.json?.pickups ?? []).length === 1, q.json?.delivery)
  /* 2 x 45.00 + 12.00; VAT 19% on the mugs and the delivery, not on the download (digital tax off). */
  check("checkout quote totals: 102.00 items, 15.00 delivery, VAT 19% 199.50 * ... = 19.95, total 136.95", q.json?.totals?.itemsSubtotalCents === 10200 && q.json?.totals?.shippingCents === 1500 && q.json?.totals?.taxCents === 1995 && q.json?.totals?.totalCents === 13695 && /VAT 19%/.test(q.json?.totals?.taxLabel ?? ""), q.json?.totals)

  const coupon = await j.call("POST /api/coupons", { as: seller, body: { code: "WELCOME10", discount_type: "percentage", discount_value: 10 } })
  const qc = await j.call("POST /api/physical/checkout/quote", { body: { items: cart, shopId: creator.id, couponCode: "welcome10", country: "RO", postalCode: "400100", deliveryOptionId: std?.id } })
  /* 10% off both lines: 9.00 + 1.20; VAT on (81.00 + 15.00) = 18.24. */
  check("a 10% code: 10.20 off, VAT on what is left, total 125.04", coupon.status === 201 && qc.json?.coupon?.code === "WELCOME10" && qc.json?.totals?.discountCents === 1020 && qc.json?.totals?.taxCents === 1824 && qc.json?.totals?.totalCents === 12504, { coupon: coupon.json, quote: qc.json?.totals, err: qc.json?.couponError })

  section("8. The buyer pays (Stripe Checkout), webhooks in Stripe's order and again")
  const startA = await j.call("POST /api/physical/checkout", {
    body: { shopId: creator.id, items: cart, couponCode: "WELCOME10", email: buyer.email, name: buyer.name, phone: address.phone, address, deliveryOptionId: std?.id, buyerNote: "Please wrap them as a gift.", clientKey: "client-key-A-123456", emailOptIn: true },
  })
  const coA = j.rows("commerce_checkouts").find((c) => c.client_key === "client-key-A-123456")
  check("Pay opens Stripe's page for exactly the quoted total", startA.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(startA.json?.url ?? "") && coA?.total_cents === 12504, { status: startA.status, body: startA.json, total: coA?.total_cents })
  const sessionA = j.world.sessions.get(coA?.stripe_session_id)
  check("Stripe's page: two mugs at 40.50, the download, VAT as its own line, Standard delivery at 15.00, the fee and the shop's account", !!sessionA && sessionA.amount_total === 12504 && sessionA.__params.payment_intent_data?.transfer_data?.destination === acct && sessionA.__params.line_items.some((l: any) => l.price_data.product_data.name === "VAT 19%" && l.price_data.unit_amount === 1824), sessionA?.__params?.line_items)
  check("the stock is held for the checkout: Blue 30 on hand, 2 committed", level("Blue").on_hand === 30 && level("Blue").committed === 2, level("Blue"))
  const sameAgain = await j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items: cart, couponCode: "WELCOME10", email: buyer.email, name: buyer.name, address, deliveryOptionId: std?.id, buyerNote: "Please wrap them as a gift.", clientKey: "client-key-A-123456" } })
  check("a double click opens the same Stripe page and holds nothing twice", sameAgain.status === 200 && sameAgain.json?.url === startA.json?.url && level("Blue").committed === 2, { again: sameAgain.json, level: level("Blue") })

  const paidA = j.world.pay(coA!.stripe_session_id)
  /* Stripe sends charge.succeeded and payment_intent.succeeded before checkout.session.completed, and may send any of them twice. */
  const e1 = await j.webhook("charge.succeeded", paidA.charge!)
  const e2 = await j.webhook("payment_intent.succeeded", paidA.intent)
  const e3 = await j.webhook("checkout.session.completed", j.world.expand(paidA.session)!)
  const e3again = await j.webhook("checkout.session.completed", j.world.expand(paidA.session)!, { id: e3.eventId })
  const e3dup = await j.webhook("checkout.session.completed", j.world.expand(paidA.session)!)
  const back = await j.call(`GET /api/physical/checkout/complete?session_id=${coA!.stripe_session_id}`)
  check("every webhook answers 200 (a repeated event id is answered as a duplicate)", [e1, e2, e3, e3again, e3dup].every((e) => e.status === 200) && e3again.json?.duplicate === true, [e1, e2, e3, e3again, e3dup].map((e) => [e.status, e.json]))
  const ordersA = j.rows("orders").filter((o) => o.checkout_id === coA!.id)
  const coA2 = j.rows("commerce_checkouts").find((c) => c.id === coA!.id)!
  check("one order: two lines (mug x2, download), paid once, whatever came first", coA2.status === "paid" && ordersA.length === 2 && ordersA.every((o) => o.status === "completed"), { status: coA2.status, lines: ordersA.map((o) => [o.product_snapshot?.title, o.quantity, o.amount_cents]) })
  const pdfRow = ordersA.find((o) => o.product_id === pdfId)
  check("each line holds its own tax: the download (not taxed) is its price less the code, 10.80, with no VAT on its receipt line", pdfRow?.amount_cents === 1080 && (pdfRow?.product_snapshot?.tax_cents ?? 0) === 0, pdfRow && { amount: pdfRow.amount_cents, tax: pdfRow.product_snapshot?.tax_cents })
  check("the lines add up to what Stripe took", ordersA.reduce((n, o) => n + o.amount_cents, 0) === paidA.charge!.amount, { lines: ordersA.map((o) => o.amount_cents), charged: paidA.charge!.amount })
  check("the buyer comes back from Stripe to their order page", back.status === 307 && (back.location ?? "").includes(`/checkout/physical/order/${coA2.receipt_token}`), { status: back.status, location: back.location })
  check("stock: still 30 on hand, 2 committed (sold, waiting to ship); reservation marked sold", level("Blue").on_hand === 30 && level("Blue").committed === 2 && j.rows("inventory_reservations").filter((r) => r.checkout_id === coA!.id).every((r) => r.status === "sold"), { level: level("Blue"), res: j.rows("inventory_reservations").filter((r) => r.checkout_id === coA!.id) })
  check("the code counted once", j.rows("coupons").find((c) => c.code === "WELCOME10")?.usage_count === 1, j.rows("coupons").find((c) => c.code === "WELCOME10"))
  check("the download is the buyer's entitlement only if signed in; sales counted per product once", j.rows("products").find((p) => p.id === mugId)?.sales_count === 1 && j.rows("products").find((p) => p.id === pdfId)?.sales_count === 1, j.rows("products").map((p) => [p.title, p.sales_count]))

  await j.cron()
  const toBuyer = j.net.to(buyer.email)
  const confirmations = toBuyer.filter((m) => /order|confirm/i.test(m.subject) && !/ship|refund|return|cancel/i.test(m.subject))
  console.log("  emails so far:", JSON.stringify(j.net.mails.map((m) => [m.to.join(","), m.subject])))
  check("the buyer gets exactly one order confirmation", confirmations.length === 1, toBuyer.map((m) => m.subject))
  const conf = confirmations[0]
  const confText = conf ? `${conf.subject}\n${conf.text}\n${conf.html.replace(/<[^>]+>/g, " ")}` : ""
  check("the confirmation names the shop, both items, the code, delivery, VAT and the total 125.04", /Ana Ceramics/.test(confText) && /Stoneware Mug/.test(confText) && /Glaze Recipes/.test(confText) && /125\.04/.test(confText) && /VAT 19%/.test(confText) && /Standard/.test(confText), confText.replace(/\s+/g, " ").slice(0, 1500))
  check("the confirmation carries the business details (legal name, tax id) and the order page link", /Ana Ceramics SRL/.test(confText) && /RO12345678/.test(confText) && conf?.html.includes(coA2.receipt_token), confText.replace(/\s+/g, " ").slice(-800))
  const toSeller = j.net.to("hello@anaceramics.example").concat(j.net.to("maker@example.com"))
  const sales = toSeller.filter((m) => /order|sale|sold/i.test(m.subject))
  check("the seller gets exactly one new order email", sales.length === 1, toSeller.map((m) => [m.to, m.subject]))

  section("9. The seller sees the order; the buyer's page")
  const sellerView = await j.call(`GET /api/physical/orders/${coA!.id}`, { as: seller })
  const so = sellerView.json?.order
  check("the seller's order page: buyer, address, the note, both lines, Standard, the code and every total", sellerView.status === 200 && so?.buyerEmail === buyer.email && so?.address?.city === "Cluj-Napoca" && so?.buyerNote === "Please wrap them as a gift." && so?.lines?.length === 2 && so?.delivery?.name === "Standard" && so?.couponCode === "WELCOME10" && so?.totalCents === 12504 && so?.taxCents === 1824 && so?.taxLabel === "VAT 19%", so && { email: so.buyerEmail, note: so.buyerNote, delivery: so.delivery, code: so.couponCode, total: so.totalCents, tax: so.taxCents, label: so.taxLabel })
  const list = await j.call("GET /api/physical/orders", { as: seller })
  check("the order is in the seller's list as paid and unfulfilled", list.status === 200 && JSON.stringify(list.json).includes(coA!.id) && JSON.stringify(list.json).includes("unfulfilled"), JSON.stringify(list.json).slice(0, 600))
  const buyerPage = await renderBuyerPage(coA2.receipt_token)
  check("the buyer's order page shows the items, the note-free total 125.04, VAT and Standard delivery", /Stoneware Mug/.test(buyerPage) && /125\.04/.test(buyerPage) && /VAT 19%/.test(buyerPage) && /Standard/.test(buyerPage), buyerPage.slice(0, 800))

  section("10. Fulfilment: one mug, then the second in another package, to delivered")
  const mugLine = so?.lines?.find((l: any) => l.title === "Stoneware Mug")
  const f1 = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: mugLine?.orderId, quantity: 1 }], carrier: "DHL", trackingNumber: "JD014600006281234567", key: "f1" } })
  const f1again = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: mugLine?.orderId, quantity: 1 }], carrier: "DHL", trackingNumber: "JD014600006281234567", key: "f1" } })
  const shipped1 = j.rows("fulfillments").filter((f) => f.checkout_id === coA!.id)
  check("a partial shipment with DHL tracking: partially fulfilled, a tracking link, one shipment even when pressed twice", f1.status === 200 && f1again.status === 200 && shipped1.length === 1 && f1.json?.order?.fulfillmentStatus === "partially_fulfilled" && /dhl/i.test(shipped1[0]?.tracking_url ?? ""), { f1: f1.json?.order?.fulfillmentStatus ?? f1.json, n: shipped1.length, url: shipped1[0]?.tracking_url })
  check("stock: the shipped mug leaves the shelf (29 on hand, 1 still committed)", level("Blue").on_hand === 29 && level("Blue").committed === 1, level("Blue"))
  const f2 = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: mugLine?.orderId, quantity: 1 }], carrier: "Fan Courier", trackingNumber: "2345678901", key: "f2" } })
  check("the second package: fulfilled, stock 28 on hand and nothing committed", f2.status === 200 && f2.json?.order?.fulfillmentStatus === "fulfilled" && level("Blue").on_hand === 28 && level("Blue").committed === 0, { f2: f2.json?.order?.fulfillmentStatus ?? f2.json, level: level("Blue") })
  const [ship1, ship2] = j.rows("fulfillments").filter((f) => f.checkout_id === coA!.id)
  for (const st of ["in_transit", "out_for_delivery", "delivered"]) await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "shipment", fulfillmentId: ship1.id, status: st } })
  const back1 = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "shipment", fulfillmentId: ship1.id, status: "in_transit" } })
  check("a delivered shipment can't go back to in transit", back1.status === 400, back1.json)
  const d2 = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "shipment", fulfillmentId: ship2.id, status: "delivered" } })
  check("both delivered: the order reads delivered", d2.status === 200 && d2.json?.order?.fulfillmentStatus === "delivered", d2.json?.order?.fulfillmentStatus ?? d2.json)
  await j.cron()
  const shipMails = j.net.to(buyer.email).filter((m) => !/confirmed/i.test(m.subject))
  console.log("  buyer emails:", JSON.stringify(j.net.to(buyer.email).map((m) => m.subject)))
  const subjects = shipMails.map((m) => m.subject)
  check("buyer emails: shipped twice (one per package), out for delivery once, delivered twice (one per package), nothing else", subjects.filter((x) => /shipped|on its way|on the way/i.test(x)).length === 2 && subjects.filter((x) => /out for delivery/i.test(x)).length === 1 && subjects.filter((x) => /delivered/i.test(x)).length === 2 && subjects.length === 5, subjects)
  const firstShip = shipMails.find((m) => /shipped|on its way|on the way/i.test(m.subject))
  check("the shipped email carries the carrier, the tracking number and its link", !!firstShip && /JD014600006281234567/.test(firstShip.html) && /DHL/.test(firstShip.html), firstShip?.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600))
  const buyerPage2 = await renderBuyerPage(coA2.receipt_token)
  check("the buyer's page lists both packages with their tracking", buyerPage2.includes("JD014600006281234567") && buyerPage2.includes("2345678901") && /Delivered/i.test(buyerPage2), buyerPage2.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1200))

  section("11. The buyer asks to return one mug; approved, received, refunded, restocked")
  const ret = await j.call(`POST /api/physical/order-status/${coA2.receipt_token}/return`, { body: { items: [{ orderId: mugLine?.orderId, quantity: 1 }], reason: "damaged", note: "One arrived chipped." } })
  const retRow = j.rows("commerce_returns").find((r) => r.checkout_id === coA!.id)
  check("the return request is saved as requested, with the reason and the buyer's note", ret.status === 200 && retRow?.status === "requested" && retRow?.reason === "damaged" && retRow?.customer_note === "One arrived chipped.", { ret: ret.json, retRow })
  const appr = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "return_move", returnId: retRow?.id, status: "approved" } })
  const recv = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "return_move", returnId: retRow?.id, status: "received" } })
  check("approved, then received: the mug is back on the shelf (29 on hand)", appr.status === 200 && recv.status === 200 && level("Blue").on_hand === 29, { appr: appr.json?.error, recv: recv.json?.error, level: level("Blue") })
  const mugOrderRow = j.rows("orders").find((o) => o.id === mugLine?.orderId)!
  /* One mug and its share of VAT: 40.50 + 7.70. */
  const refund = await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: mugLine?.orderId, amount: 48.2, reason: "damaged" } })
  const noted = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "refunded", returnId: retRow?.id } })
  const charge = j.world.charges.get(paidA.charge!.id)!
  const refundedEvt = await j.webhook("charge.refunded", charge)
  const refundedEvtDup = await j.webhook("charge.refunded", charge)
  const coA3 = j.rows("commerce_checkouts").find((c) => c.id === coA!.id)!
  check("the refund goes to Stripe once (48.20, the seller's transfer reversed) and the order reads partly refunded", refund.status === 200 && charge.amount_refunded === 4820 && j.world.calls.filter((c) => c.method === "refunds.create").length === 1 && (j.world.calls.find((c) => c.method === "refunds.create")?.args[0] as any)?.reverse_transfer === true && coA3.status === "partially_refunded" && coA3.refunded_cents === 4820, { refund: refund.json, noted: noted.json?.error, charge: charge.amount_refunded, status: coA3.status, refunded: coA3.refunded_cents })
  check("the webhook for the same refund changes nothing twice", refundedEvt.status === 200 && refundedEvtDup.status === 200 && j.rows("commerce_checkouts").find((c) => c.id === coA!.id)!.refunded_cents === 4820, j.rows("commerce_checkouts").find((c) => c.id === coA!.id)!.refunded_cents)
  check("the refund is counted on the return", j.rows("commerce_returns").find((r) => r.id === retRow?.id)?.refunded_cents === 4820, j.rows("commerce_returns").find((r) => r.id === retRow?.id))
  const done = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "return_move", returnId: retRow?.id, status: "completed" } })
  check("the return closes", done.status === 200 && j.rows("commerce_returns").find((r) => r.id === retRow?.id)?.status === "completed", done.json)
  check("stock after the restock and the refund: 29 on hand (the refund did not put it back twice)", level("Blue").on_hand === 29 && level("Blue").committed === 0, level("Blue"))
  await j.cron()
  const after11 = j.net.to(buyer.email).map((m) => m.subject)
  console.log("  buyer emails:", JSON.stringify(after11))
  const refundMails = after11.filter((x) => /refund/i.test(x))
  check("the buyer gets exactly one refund email", refundMails.length === 1, after11)
  const refundMail = j.net.to(buyer.email).find((m) => /refund/i.test(m.subject))
  const orderNo = (conf?.subject.match(/#([A-Z0-9]+)/) ?? [])[1] ?? "?"
  check("the refund email: the order's own currency and the order number the buyer knows", !!refundMail && /\$48\.20/.test(refundMail.html) && refundMail.html.includes(orderNo), { subject: refundMail?.subject, orderNo, text: refundMail?.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600) })
  check("return emails: requested, approved, received, completed, each once", ["request", "approved", "received", "complete|closed"].every((w) => after11.filter((x) => /return/i.test(x) && new RegExp(w, "i").test(x)).length === 1), after11.filter((x) => /return/i.test(x)))
  console.log("  mug order row:", JSON.stringify({ status: mugOrderRow.status, refund: mugOrderRow.refund_amount_cents, amount: mugOrderRow.amount_cents }))

  section("12. Money: ledger, payouts, analytics")
  const ledger = j.rows("seller_ledger").find((l) => l.creator_id === creator.id)
  const events = j.rows("ledger_events").filter((e) => e.creator_id === creator.id)
  console.log("  ledger:", JSON.stringify(ledger), JSON.stringify(events.map((e) => [e.event_type, e.amount_cents, e.net_seller_cents, e.pending_delta, e.idempotency_key])))
  const fee = coA3.platform_fee_cents
  check("one sale on the ledger for the order: what the buyer paid less Storelib's fee", events.filter((e) => e.event_type === "sale").length === 1 && events.find((e) => e.event_type === "sale")?.net_seller_cents === 12504 - fee, { fee, events: events.map((e) => [e.event_type, e.net_seller_cents]) })
  const transfer = j.world.transfers.get(paidA.charge!.transfer)!
  const reversed = transfer.amount_reversed as number
  const refundEvents = events.filter((e) => e.event_type === "refund")
  check("one refund on the ledger, for exactly what Stripe took back from the seller's transfer", refundEvents.length === 1 && refundEvents[0].net_seller_cents === reversed, { reversed, refunds: refundEvents.map((e) => [e.amount_cents, e.net_seller_cents, e.fee_cents]) })
  check("the seller's balance: the sale less the refund, as Stripe has it (transfer less reversal)", ledger?.pending_amount === transfer.amount - reversed, { ledger: ledger?.pending_amount, stripe: transfer.amount - reversed })
  const bal = await j.call("GET /api/stripe/seller-balance", { as: seller })
  check("Payouts reads the same balance", bal.status === 200 && bal.json?.ledger?.pending_amount === transfer.amount - reversed, bal.json?.ledger)
  const an = await j.call("GET /api/physical/analytics?days=30", { as: seller })
  console.log("  analytics:", JSON.stringify(an.json?.analytics))
  check("analytics: 1 order, 2 units shipped, revenue 125.04, shipping 15.00, VAT 18.24, 1 return", an.status === 200 && an.json?.analytics?.orders === 1 && an.json?.analytics?.revenueCents === 12504 && an.json?.analytics?.shippingCents === 1500 && an.json?.analytics?.taxCents === 1824 && an.json?.analytics?.returns === 1, an.json?.analytics)

  await moreJourneys(j, { seller, creatorId: creator.id, mugId, pdfId, studioId, vId, level, address, std, acct: acct! })

  await website(j, { seller, creatorId: creator.id, mugId, pdfId, studioId, vId, level, address, std, acct: acct! })
  await edges(j, { seller, creatorId: creator.id, mugId, pdfId, studioId, vId, level, address, std, acct: acct! })
  await round24(j, { seller, creatorId: creator.id, mugId, pdfId, studioId, vId, level, address, std, acct: acct! })

  section("23. Every email, counted")
  await j.cron()
  const paid = j.rows("commerce_checkouts").filter((x) => ["paid", "partially_refunded", "refunded"].includes(x.status))
  const confirmCounts = paid.map((x) => j.net.to(x.buyer_email).filter((m) => /confirmed/i.test(m.subject) && m.subject.includes(String(x.id).replace(/-/g, "").slice(0, 8).toUpperCase())).length)
  check(`each of the ${paid.length} paid orders sent its buyer exactly one confirmation`, confirmCounts.every((n) => n === 1), paid.map((x, i) => [x.buyer_email, confirmCounts[i]]))
  const sellerMail = j.net.mails.filter((m) => m.to.some((t) => /anaceramics|maker@/.test(t)))
  const saleMails = sellerMail.filter((m) => /^(New order|Pickup order|Your first sale|You sold)/.test(m.subject))
  check(`the seller got one new order email per paid order (${paid.length})`, saleMails.length === paid.length, { got: saleMails.length, subjects: saleMails.map((m) => m.subject), paid: paid.map((x) => [x.buyer_email, x.status]) })
  const dupes = new Map<string, number>()
  for (const m of j.net.mails) dupes.set(`${m.to.join()}|${m.subject}`, (dupes.get(`${m.to.join()}|${m.subject}`) ?? 0) + 1)
  const twice = [...dupes].filter(([k, n]) => n > 1 && !/was delivered|is on the way/.test(k))
  check("no email went twice to the same person with the same subject (a package's own delivered and shipped emails aside)", twice.length === 0, twice)
  console.log("  all mail:", JSON.stringify(j.net.mails.map((m) => [m.to.join(","), m.subject])))

  report(j)
}

interface Ctx {
  seller: Person
  creatorId: string
  mugId: string
  pdfId: string
  studioId: string
  vId: (name: string) => string
  level: (name: string) => Record<string, any>
  address: Record<string, string>
  std: { id: string } | undefined
  acct: string
}

let keys = 0
/** One guest checkout through Stripe's page, paid, its webhook delivered; the checkout row and the session. */
async function buy(j: Journey, c: Ctx, o: { email: string; items: unknown[]; address?: Record<string, string> | null; option?: string; code?: string; note?: string; pay?: boolean; name?: string; optIn?: boolean }) {
  const clientKey = `journey-key-${++keys}-abcdef`
  /* Each buyer from their own address, as real buyers are: the payment limit counts per address. */
  const headers = { "x-forwarded-for": `198.51.100.${keys}` }
  let option = o.option
  if (!option) {
    const q = await j.call("POST /api/physical/checkout/quote", { headers, body: { items: o.items, shopId: c.creatorId, couponCode: o.code ?? "", country: o.address?.country ?? "RO", postalCode: o.address?.postalCode ?? "" } })
    option = q.json?.delivery?.selectedId ?? undefined
  }
  const start = await j.call("POST /api/physical/checkout", { headers, body: { shopId: c.creatorId, items: o.items, couponCode: o.code, email: o.email, name: o.name ?? o.address?.name ?? "Guest Buyer", address: o.address === null ? undefined : o.address ?? c.address, deliveryOptionId: option, buyerNote: o.note, clientKey, emailOptIn: o.optIn === true } })
  const co = j.rows("commerce_checkouts").find((x) => x.client_key === clientKey)
  if (start.status !== 200 || !co || o.pay === false) return { start, co, paid: null as null | ReturnType<StripeWorld["pay"]> }
  const paid = j.world.pay(co.stripe_session_id)
  await j.webhook("checkout.session.completed", j.world.expand(paid.session)!)
  return { start, co: j.rows("commerce_checkouts").find((x) => x.id === co.id)!, paid }
}

async function moreJourneys(j: Journey, c: Ctx) {
  const { seller } = c
  const subjects = (email: string) => j.net.to(email).map((m) => m.subject)

  section("13. Cancellation before shipping: the buyer asks, the shop cancels and refunds")
  const b1 = "cancel@example.com"
  const before = { ...c.level("Green") }
  const o1 = await buy(j, c, { email: b1, items: [{ productId: c.mugId, variantId: c.vId("Green"), quantity: 1 }] })
  check("a Green mug bought: 1 of 2 committed", o1.co?.status === "paid" && c.level("Green").committed === before.committed + 1, { co: o1.co?.status, level: c.level("Green"), start: o1.start.json })
  const ask = await j.call(`POST /api/physical/order-status/${o1.co!.receipt_token}/cancel`, { body: { reason: "Ordered the wrong colour" } })
  await j.cron()
  check("the buyer's cancel request reaches the seller, once", ask.status === 200 && j.net.mails.filter((m) => m.to.some((t) => /anaceramics|maker@/.test(t)) && /cancel/i.test(m.subject)).length === 1, { ask: ask.json, seller: j.net.mails.filter((m) => m.to.some((t) => /anaceramics|maker@/.test(t))).map((m) => m.subject) })
  const line1 = j.rows("orders").find((o) => o.checkout_id === o1.co!.id)!
  /* As the order page's Cancel and refund does it (components/physical/order-panel.tsx, app/app/orders/order-detail.tsx refundAll): cancel, then refund each line, then the order catches up. */
  const cx1 = await j.call(`POST /api/physical/orders/${o1.co!.id}`, { as: seller, body: { action: "cancel", reason: "Cancelled at the buyer's request" } })
  const rf1 = await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: line1.id, reason: "cancelled" } })
  const nr1 = await j.call(`POST /api/physical/orders/${o1.co!.id}`, { as: seller, body: { action: "refunded" } })
  await j.webhook("charge.refunded", j.world.charges.get(o1.paid!.charge!.id)!)
  await j.cron()
  const co1 = j.rows("commerce_checkouts").find((x) => x.id === o1.co!.id)!
  check("refunded in full and cancelled: the Green mug's stock is free again", rf1.status === 200 && nr1.status === 200 && cx1.status === 200 && co1.status === "refunded" && !!co1.cancelled_at && c.level("Green").committed === before.committed && c.level("Green").on_hand === before.on_hand, { rf1: rf1.json, nr1: nr1.json?.error, cx1: cx1.json?.error, status: co1.status, cancelled: co1.cancelled_at, level: c.level("Green") })
  const s1 = subjects(b1)
  check("the buyer gets: the confirmation, one refund email and one cancellation email", s1.filter((x) => /confirmed/i.test(x)).length === 1 && s1.filter((x) => /refund/i.test(x)).length === 1 && s1.filter((x) => /cancel/i.test(x)).length === 1 && s1.length === 3, s1)

  section("14. A refund without a return (a goodwill partial refund)")
  const b2 = "goodwill@example.com"
  const o2 = await buy(j, c, { email: b2, items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }] })
  const line2 = j.rows("orders").find((o) => o.checkout_id === o2.co!.id)!
  const rf2 = await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: line2.id, amount: 10 } })
  await j.call(`POST /api/physical/orders/${o2.co!.id}`, { as: seller, body: { action: "refunded" } })
  await j.webhook("charge.refunded", j.world.charges.get(o2.paid!.charge!.id)!)
  await j.cron()
  const co2 = j.rows("commerce_checkouts").find((x) => x.id === o2.co!.id)!
  check("10.00 back, the order partly refunded, still to ship (stock stays committed)", rf2.status === 200 && co2.status === "partially_refunded" && co2.refunded_cents === 1000 && !co2.cancelled_at, { rf2: rf2.json, co2: [co2.status, co2.refunded_cents, co2.cancelled_at] })
  check("one refund email, saying 10.00", subjects(b2).filter((x) => /refund/i.test(x)).length === 1 && j.net.to(b2).some((m) => /refund/i.test(m.subject) && /10\.00/.test(m.html)), subjects(b2))

  section("15. Local pickup")
  const b3 = "pickup@example.com"
  const qp = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], shopId: c.creatorId } })
  const pickupId = qp.json?.pickups?.[0]?.id
  const o3 = await buy(j, c, { email: b3, items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], address: null, option: pickupId, name: "Pia Pickup" })
  check("a pickup order: no address, no delivery charge, tax from the Studio's country", o3.co?.delivery_method === "pickup" && o3.co?.shipping_cents === 0 && o3.co?.tax_cents === Math.round(4500 * 0.19) && !o3.co?.shipping_address, { start: o3.start.json, co: o3.co && [o3.co.delivery_method, o3.co.shipping_cents, o3.co.tax_cents] })
  await j.cron()
  const pickConf = j.net.to(b3).find((m) => /confirmed/i.test(m.subject))
  check("the confirmation says where and when to pick up (Studio, hours, instructions)", !!pickConf && /Studio/.test(pickConf.html) && /Mon to Fri, 10:00 to 18:00/.test(pickConf.html) && /blue door/.test(pickConf.html), pickConf?.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 900))
  const line3 = j.rows("orders").find((o) => o.checkout_id === o3.co!.id)!
  const ready = await j.call(`POST /api/physical/orders/${o3.co!.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: line3.id, quantity: 1 }] } })
  const f3 = j.rows("fulfillments").find((f) => f.checkout_id === o3.co!.id)!
  const picked = await j.call(`POST /api/physical/orders/${o3.co!.id}`, { as: seller, body: { action: "shipment", fulfillmentId: f3?.id, status: "delivered" } })
  await j.cron()
  const s3 = subjects(b3)
  check("ready for pickup, then picked up: one email each, no carrier", ready.status === 200 && picked.status === 200 && s3.filter((x) => /ready/i.test(x)).length === 1 && s3.filter((x) => /picked up|collected/i.test(x)).length === 1 && !j.net.to(b3).some((m) => /tracking number/i.test(m.html)), s3)

  section("16. Local delivery by postal code")
  const b4 = "local@example.com"
  const near = { ...c.address, postalCode: "400002", line1: "Str. Aproape 2" }
  const ql = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], shopId: c.creatorId, country: "RO", postalCode: "400002" } })
  const local = (ql.json?.delivery?.options ?? []).find((o: any) => /local|deliver/i.test(o.name) && o.priceCents === 1000)
  check("a postal code the Studio delivers to is offered local delivery at 10.00 beside the couriers", !!local && (ql.json?.delivery?.options ?? []).length === 3, ql.json?.delivery)
  const o4 = await buy(j, c, { email: b4, items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], address: near, option: local?.id })
  await j.cron()
  const localConf = j.net.to(b4).find((m) => /confirmed/i.test(m.subject))
  check("a local delivery order: 10.00 delivery, the shop's note on the confirmation", o4.co?.shipping_cents === 1000 && o4.co?.shipping_rate?.kind === "local" && !!localConf && /by bike/.test(localConf.html), { co: o4.co && [o4.co.shipping_cents, o4.co.shipping_rate], start: o4.start.json })
  const qfar = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], shopId: c.creatorId, country: "RO", postalCode: "500001" } })
  check("a postal code outside the list gets no local delivery", !(qfar.json?.delivery?.options ?? []).some((o: any) => o.priceCents === 1000), qfar.json?.delivery)

  section("17. Sold out, the last ones, the most per order")
  const sand = await j.call("POST /api/physical/checkout", { body: { shopId: c.creatorId, items: [{ productId: c.mugId, variantId: c.vId("Sand"), quantity: 1 }], email: "sand@example.com", name: "S B", address: c.address, deliveryOptionId: c.std?.id, clientKey: "journey-sand-1234" } })
  check("the sold out colour can't be bought: refused before Stripe, nothing held", sand.status === 409 && /Sand/.test(sand.json?.error ?? "") && !j.rows("commerce_checkouts").some((x) => x.client_key === "journey-sand-1234" && x.status === "pending"), sand.json)
  const four = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 4 }], shopId: c.creatorId, country: "RO" } })
  check("four mugs in one order is refused (at most 3)", four.status === 400 && /3/.test(four.json?.error ?? ""), four.json)
  const greenLeft = c.level("Green").on_hand - c.level("Green").committed
  const g1 = await j.call("POST /api/physical/checkout", { body: { shopId: c.creatorId, items: [{ productId: c.mugId, variantId: c.vId("Green"), quantity: greenLeft }], email: "first@example.com", name: "F B", address: c.address, deliveryOptionId: c.std?.id, clientKey: "journey-green-first" } })
  const g2 = await j.call("POST /api/physical/checkout", { body: { shopId: c.creatorId, items: [{ productId: c.mugId, variantId: c.vId("Green"), quantity: 1 }], email: "second@example.com", name: "S B", address: c.address, deliveryOptionId: c.std?.id, clientKey: "journey-green-second" } })
  check("the last Green mugs: the first checkout holds them, the second is told none are left", g1.status === 200 && g2.status === 409 && /Green/.test(g2.json?.error ?? ""), { g1: g1.status, g2: g2.json, level: c.level("Green") })
  const gco = j.rows("commerce_checkouts").find((x) => x.client_key === "journey-green-first")!
  const expired = await j.webhook("checkout.session.expired", { ...j.world.expand(j.world.sessions.get(gco.stripe_session_id)!)!, status: "expired" })
  check("Stripe's page expires unpaid: the held mugs go back", expired.status === 200 && j.rows("commerce_checkouts").find((x) => x.id === gco.id)?.status === "expired" && c.level("Green").on_hand - c.level("Green").committed === greenLeft, { status: j.rows("commerce_checkouts").find((x) => x.id === gco.id)?.status, level: c.level("Green") })
  const sp = await j.call(`GET /api/physical/storefront/product?productId=${c.mugId}&country=RO`)
  check("the product page agrees: Sand sold out, Green available again", (sp.json?.variants ?? []).find((v: any) => v.name === "Sand")?.soldOut === true && (sp.json?.variants ?? []).find((v: any) => v.name === "Green")?.soldOut === false, sp.json?.variants)

  section("18. Limit sales on a download (1 copy)")
  const zine = await newProduct(j, c.creatorId, { type: "digital", title: "Studio Zine", priceCents: 900, salesLimit: 1 })
  const z1 = await buy(j, c, { email: "zine1@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }, { productId: zine, variantId: null, quantity: 1 }] })
  const z2 = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }, { productId: zine, variantId: null, quantity: 1 }], shopId: c.creatorId, country: "RO" } })
  check("the one copy sells; the next cart has it left out as sold out", z1.co?.status === "paid" && (z2.json?.dropped ?? []).some((t: string) => /Zine/.test(t)) && !(z2.json?.lines ?? []).some((l: any) => l.productId === zine), { z1: z1.co?.status, z2: z2.json?.dropped })

  section("19. A free shipping code")
  const fs = await j.call("POST /api/coupons", { as: seller, body: { code: "FREESHIP", discount_type: "fixed", discount_value: 0, free_shipping: true } })
  const fsId = fs.json?.coupon?.id
  const fsOpts = await j.call(`PUT /api/physical/coupons/${fsId}`, { as: seller, body: { freeShipping: true } })
  const qf = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], shopId: c.creatorId, couponCode: "FREESHIP", country: "RO", postalCode: "400100" } })
  check("FREESHIP: delivery free, no VAT on the delivery, items untouched (45.00 + 8.55 VAT)", fs.status === 201 && fsOpts.status === 200 && qf.json?.coupon?.freeShipping === true && qf.json?.totals?.shippingDiscountCents === qf.json?.totals?.shippingCents && qf.json?.totals?.totalCents === 4500 + 855, { fs: fs.json, opts: fsOpts.json, totals: qf.json?.totals, err: qf.json?.couponError })
  const o5 = await buy(j, c, { email: "freeship@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], code: "FREESHIP" })
  const session5 = o5.co ? j.world.sessions.get(o5.co.stripe_session_id) : null
  check("Stripe's page shows the delivery at 0 named as free with the code", !!session5 && session5.__params.shipping_options?.[0]?.shipping_rate_data?.fixed_amount?.amount === 0 && /FREESHIP/.test(session5.__params.shipping_options?.[0]?.shipping_rate_data?.display_name ?? ""), session5?.__params.shipping_options ?? o5.start.json)

  section("20. Prices include VAT")
  await j.call("PUT /api/store/taxes", { as: seller, body: { included: true } })
  const qi = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], shopId: c.creatorId, country: "RO", postalCode: "400100" } })
  /* 45.00 + 15.00 delivery, VAT inside each: 7.18 + 2.39 = 9.57. */
  check("tax included: the total is the prices (60.00), VAT 9.57 shown as included", qi.json?.totals?.totalCents === 6000 && qi.json?.totals?.taxIncluded === true && qi.json?.totals?.taxCents === 957, qi.json?.totals)
  const o6 = await buy(j, c, { email: "included@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }] })
  await j.cron()
  const incl = j.net.to("included@example.com").find((m) => /confirmed/i.test(m.subject))
  const inclRow = j.rows("orders").find((o) => o.checkout_id === o6.co?.id)
  check("charged 60.00 with no VAT line added; the confirmation and the order line say VAT 19% is included", o6.paid?.charge?.amount === 6000 && !j.world.sessions.get(o6.co!.stripe_session_id)!.__params.line_items.some((l: any) => /VAT/.test(l.price_data.product_data.name)) && !!incl && /includ/i.test(incl.html) && inclRow?.product_snapshot?.tax_included === true && inclRow?.product_snapshot?.tax_cents === 957, { charged: o6.paid?.charge?.amount, snap: inclRow?.product_snapshot, html: incl?.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 500) })
  await j.call("PUT /api/store/taxes", { as: seller, body: { included: false } })

  section("21. A declined card, then the abandoned checkout reminder")
  const b7 = "declined@example.com"
  const o7 = await buy(j, c, { email: b7, items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], pay: false })
  const declined = j.world.pay(o7.co!.stripe_session_id, { fail: true })
  const pf = await j.webhook("payment_intent.payment_failed", declined.intent)
  check("payment_intent.payment_failed answers 200 and queues one email for later", pf.status === 200 && j.rows("commerce_jobs").filter((x) => x.idempotency_key === `email:payment_failed:${o7.co!.id}`).length === 1, { pf: pf.json, jobs: j.rows("commerce_jobs").filter((x) => String(x.idempotency_key).includes("payment_failed")) })
  await j.cron()
  check("nothing is sent before half an hour", subjects(b7).length === 0, subjects(b7))
  for (const job of j.rows("commerce_jobs").filter((x) => String(x.idempotency_key).includes("payment_failed"))) job.run_after = new Date(Date.now() - 1000).toISOString()
  await j.cron()
  await j.cron()
  const s7 = subjects(b7)
  check("half an hour later, still unpaid: one 'payment didn't go through' email", s7.length === 1 && /payment|card|complete/i.test(s7[0] ?? ""), s7)
  const starts = j.rows("checkout_starts").filter((x) => x.email === b7)
  for (const st of starts) st.created_at = new Date(Date.now() - 2 * 3600_000).toISOString()
  const sweep = await j.call("GET /api/cron/process-scheduled-emails", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  await j.call("GET /api/cron/process-scheduled-emails", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  console.log("  sweep:", JSON.stringify(sweep.json).slice(0, 600))
  const s7b = subjects(b7)
  check("the abandoned checkout: the start was recorded, and the buyer already told about the card is not reminded again", starts.length === 1 && s7b.length === 1, { starts: starts.length, subjects: s7b })
  const b8 = "abandoned@example.com"
  /* Ticked "Email me with news and offers": the reminder is only for buyers who said yes (lib/automations/abandoned). */
  const o8 = await buy(j, c, { email: b8, items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], pay: false, optIn: true })
  const starts8 = j.rows("checkout_starts").filter((x) => x.email === b8)
  for (const st of starts8) st.created_at = new Date(Date.now() - 2 * 3600_000).toISOString()
  await j.call("GET /api/cron/process-scheduled-emails", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  await j.call("GET /api/cron/process-scheduled-emails", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  const s8 = j.net.to(b8)
  check("a cart left at Stripe's page an hour ago: exactly one reminder, linking back to this checkout", o8.co?.status === "pending" && starts8.length === 1 && s8.length === 1 && s8[0].html.includes("checkout"), { starts: starts8.length, mails: s8.map((m) => m.subject), link: s8[0]?.html.match(/href="([^"]*checkout[^"]*)"/)?.[1] })

  section("22. A dispute")
  const o9 = await buy(j, c, { email: "dispute@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }] })
  const dp = j.world.dispute(o9.paid!.charge!.id)
  const dpEvt = await j.webhook("charge.dispute.created", dp)
  const dpAgain = await j.webhook("charge.dispute.created", dp)
  const ledgerD = j.rows("ledger_events").filter((e) => e.stripe_dispute_id === dp.id)
  console.log("  dispute ledger:", JSON.stringify(ledgerD.map((e) => [e.event_type, e.amount_cents, e.net_seller_cents, e.pending_delta, e.available_delta])))
  const disputedRow = j.rows("orders").find((o) => o.checkout_id === o9.co!.id)
  check("charge.dispute.created: answered 200, written once on the ledger, the order marked disputed", dpEvt.status === 200 && dpAgain.status === 200 && ledgerD.filter((e) => e.event_type === "dispute_created").length === 1 && /disput/i.test(JSON.stringify(disputedRow)), { dp: dpEvt.json, again: dpAgain.json, row: disputedRow && { status: disputedRow.status, disputed: disputedRow.disputed_at ?? disputedRow.dispute_status } })
  const sellerD = j.net.mails.filter((m) => m.to.some((t) => /anaceramics|maker@/.test(t)) && /disput|chargeback/i.test(m.subject))
  check("the seller is told about the dispute once", sellerD.length === 1, j.net.mails.filter((m) => m.to.some((t) => /anaceramics|maker@/.test(t))).map((m) => m.subject).slice(-6))
}

/* An imported Shopify theme's product and cart sections, written as Dawn writes them (tests/storefront23.test.ts has the same two). */
const PRODUCT_SECTION = `<div class="main-product product-info">
  <h1 class="product__title">{{ product.title }}</h1>
  {%- assign v = product.selected_or_first_available_variant -%}
  <div class="price"><span class="price__current">{{ v.price | money }}</span></div>
  <select class="variant-select" name="id">{%- for variant in product.variants -%}<option value="{{ variant.id }}"{% if variant.id == v.id %} selected{% endif %}{% unless variant.available %} disabled{% endunless %}>{{ variant.title }}{% unless variant.available %} - Sold out{% endunless %}</option>{%- endfor -%}</select>
  {%- for variant in product.variants -%}{%- if variant.inventory_management == 'shopify' and variant.inventory_quantity <= 10 and variant.inventory_quantity > 0 -%}<p class="product__inventory" data-v="{{ variant.title }}">Low stock: {{ variant.inventory_quantity }} left</p>{%- endif -%}{%- endfor -%}
  <form action="/cart/add" method="post" class="product-form"><input type="hidden" name="id" value="{{ v.id }}"><input class="quantity__input" type="number" name="quantity" value="1"{% if v.quantity_rule.max != null %} max="{{ v.quantity_rule.max }}"{% endif %}><button type="submit" name="add">Add to cart</button></form>
  {%- assign pick = v.store_availabilities | where: 'available', true -%}{%- if pick.size > 0 -%}<div class="pickup-availability"><p>Pickup available at <span class="pickup__place">{{ pick[0].location.name }}</span></p></div>{%- endif -%}
</div>
{% schema %}
{ "name": "Product information", "settings": [] }
{% endschema %}`
const CART_SECTION = `<div class="page-width main-cart">
  {%- if cart.item_count == 0 -%}<p class="cart__empty">Your cart is empty</p>{%- else -%}
  <form action="/cart" method="post" id="cart">
  {%- for item in cart.items -%}<div class="cart-item"><span class="cart-item__name">{{ item.product.title }}</span><span class="cart-item__price">{{ item.final_line_price | money }}</span><input type="number" name="updates[]" value="{{ item.quantity }}"></div>{%- endfor -%}
  <textarea name="note" class="cart__note">{{ cart.note }}</textarea>
  <button type="submit" name="checkout" class="cart__checkout">Check out</button>
  </form>{%- endif -%}
</div>
{% schema %}
{ "name": "Main cart", "settings": [] }
{% endschema %}`

async function importedTheme(): Promise<{ files: Record<string, string>; settings: Record<string, unknown>; pages: { page_key: string; sections: unknown }[] }> {
  const { convertShopifyTheme } = await import("@/lib/storelib-theme/shopify/convert")
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  zip.file("sections/main-product-info.liquid", PRODUCT_SECTION)
  zip.file("sections/main-cart.liquid", CART_SECTION)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  return r.theme as never
}

/**
 * THE BUYER ON THE STORE'S OWN WEBSITE. An imported theme published as the
 * live site (its files, settings and pages in the database, read by the live
 * site's own loader, lib/website-builder/compat-site.ts), its product page,
 * its cart with a note, Check out to the website's checkout on this host,
 * then Storelib's card form (app/api/checkout/site, a PaymentIntent),
 * paid, with the webhook and the page's own confirm both arriving.
 */
async function website(j: Journey, c: Ctx) {
  section("24. The store's website: an imported theme, its cart, the website's own checkout")
  const host = "ana-ceramics.storelib.com"
  const t = await importedTheme()
  const [install] = j.db.insert("store_theme_installs", { creator_id: c.creatorId, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Posture" }, {})
  j.db.insert("store_theme_settings", { install_id: install.id, settings: t.settings }, {})
  j.db.insert("store_theme_custom_files", Object.entries(t.files).map(([path, content]) => ({ install_id: install.id, path, content })), {})
  j.db.insert("store_theme_pages", t.pages.map((p) => ({ install_id: install.id, page_key: p.page_key, sections: p.sections })), {})
  const { compatSiteByName } = await import("@/lib/website-builder/compat-site")
  const { answer } = await import("@/lib/storelib-theme/compat/site")
  const found = await compatSiteByName("ana-ceramics", host)
  check("the live site loads the published imported theme from the database", found.kind === "site", found)
  if (found.kind !== "site") return
  const site = found.site
  const state: { cart: any[]; note: string } = { cart: [], note: "" }
  const ask = async (method: string, path: string, body: Record<string, unknown> | null = null, ajax = false) => {
    const [p, q] = path.split("?")
    const r = await answer(site, { method, path: p, query: new URLSearchParams(q ?? ""), body, cart: state.cart as never, note: state.note, ajax })
    if (r.cart) state.cart = r.cart as never
    if (typeof r.note === "string") state.note = r.note
    return r
  }
  const page = await ask("GET", "/products/stoneware-mug")
  const html = String(page.body)
  check("the theme's product page: the mug, Sand sold out, Green low stock (2 left), pickup at the Studio", page.status === 200 && /Stoneware Mug/.test(html) && /Sand - Sold out/.test(html) && /data-v="Green">Low stock: 2 left/.test(html) && /pickup__place">Studio/.test(html), html.replace(/\s+/g, " ").slice(html.indexOf("main-product"), html.indexOf("main-product") + 1500))
  check("the theme's price reads as the checkout charges it ($45.00, the live build's USD)", /price__current">\$45\.00/.test(html), html.match(/price__current">[^<]*/)?.[0])
  const listed = (found.site.products as { id: string }[]).map((p) => p.id)
  const offWeb = await j.call("PUT /api/store/channels/product", { as: c.seller, body: { productId: c.pdfId, off: ["storefront"] } })
  const again = await compatSiteByName("ana-ceramics", host)
  const listedAfter = again.kind === "site" ? (again.site.products as { id: string }[]).map((p) => p.id) : []
  check("Sales channels: the download taken off the Online store leaves the website's lists, the mug stays", listed.includes(c.pdfId) && offWeb.status === 200 && !listedAfter.includes(c.pdfId) && listedAfter.includes(c.mugId), { before: listed.length, after: listedAfter.length, put: offWeb.json })
  const add = await ask("POST", "/cart/add.js", { id: c.vId("Blue"), quantity: 2 }, true)
  const tooMany = await ask("POST", "/cart/add.js", { id: c.vId("Blue"), quantity: 2 }, true)
  const sold = await ask("POST", "/cart/add.js", { id: c.vId("Sand"), quantity: 1 }, true)
  check("cart/add: two Blue mugs in; two more refused (3 per order); Sand refused", add.status === 200 && tooMany.status === 422 && sold.status === 422 && state.cart.reduce((n: number, l: any) => n + l.q, 0) === 2, { add: add.status, tooMany: [tooMany.status, String(tooMany.body).slice(0, 200)], sold: sold.status, cart: state.cart })
  const go = await ask("POST", "/cart", { "updates[]": "2", note: "Leave it with the neighbour, please", "attributes[Gift message]": "Happy birthday, Ana", checkout: "" })
  const to = new URL(go.headers?.Location ?? "/", `https://${host}`)
  const { readSiteCheckoutParams } = await import("@/lib/checkout/site-checkout")
  const params = readSiteCheckoutParams(to.searchParams)
  check("Check out goes to the website's own checkout on this host, with the two mugs and the note", go.status === 303 && to.host === host && to.pathname === "/checkout" && params.note === "Leave it with the neighbour, please" && params.items.length === 1 && params.items[0].quantity === 2, { status: go.status, to: to.toString(), params })

  const buyerHeaders = { "x-forwarded-for": "192.0.2.77", origin: `https://${host}` }
  const items = params.items.map((i: any) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity }))
  const quote = await j.call("POST /api/checkout/site", { host, headers: buyerHeaders, body: { action: "quote", items, country: "RO", postalCode: "400100" } })
  console.log("  site quote:", JSON.stringify(quote.json).slice(0, 900))
  const option = quote.json?.delivery?.selectedId ?? quote.json?.delivery?.options?.[0]?.id
  check("the website's checkout quotes the cart: 90.00, delivery options, VAT", quote.status === 200 && JSON.stringify(quote.json).includes("9000") && !!option, quote.json)
  const intent = await j.call("POST /api/checkout/site", {
    host,
    headers: buyerHeaders,
    body: { action: "intent", items, cartAttributes: params.attributes, email: "web@example.com", firstName: "Wanda", lastName: "Web", address: { line1: "Str. Web 5", city: "Cluj-Napoca", postalCode: "400100", country: "RO", phone: "+40 744 999 000" }, phone: "+40 744 999 000", agreedToTerms: true, deliveryOptionId: option, buyerNote: params.note, clientKey: "site-key-web-123456", paymentMethods: ["card"] },
  })
  const pi = intent.json?.paymentIntentId as string | undefined
  const siteCo = j.rows("commerce_checkouts").find((x) => x.client_key === "site-key-web-123456")
  check("Pay in the card form: a held checkout and a PaymentIntent for its total, with the note", intent.status === 200 && !!pi && !!siteCo && siteCo.buyer_note === "Leave it with the neighbour, please" && j.world.intents.get(pi!)?.amount === siteCo.total_cents, { status: intent.status, body: intent.json, co: siteCo && [siteCo.total_cents, siteCo.buyer_note] })
  if (!pi || !siteCo) return
  const paid = j.world.payIntent(pi)
  /* The page's confirm and the webhook race; Stripe repeats the webhook. */
  const confirm = await j.call("POST /api/checkout/site", { host, headers: buyerHeaders, body: { action: "confirm", paymentIntentId: pi, clientSecret: j.world.intents.get(pi)!.client_secret, wholeCart: true } })
  const wh1 = await j.webhook("payment_intent.succeeded", paid.intent)
  const wh2 = await j.webhook("payment_intent.succeeded", paid.intent)
  const webOrders = j.rows("orders").filter((o) => o.checkout_id === siteCo.id)
  check("paid: one order with the two mugs, whichever of the page and the webhook came first", confirm.status === 200 && wh1.status === 200 && wh2.status === 200 && webOrders.length === 1 && webOrders[0].quantity === 2 && j.rows("commerce_checkouts").find((x) => x.id === siteCo.id)?.status === "paid", { confirm: confirm.json, wh: [wh1.json, wh2.json], orders: webOrders.length })
  check("the thanks page and the order link stay on the website's own host", typeof confirm.json?.thanks === "string" && !/storelib\.com\/checkout\/physical/.test(confirm.json.thanks), confirm.json)
  check("the theme's cart is emptied once it is an order", String(confirm.headers.get("set-cookie") ?? "").includes("sl_theme_cart=;"), confirm.headers.get("set-cookie"))
  check("the order says where it was placed (this website)", JSON.stringify(j.rows("commerce_checkouts").find((x) => x.id === siteCo.id)?.origin ?? {}).includes(host), j.rows("commerce_checkouts").find((x) => x.id === siteCo.id)?.origin)
  await j.cron()
  const mail = j.net.to("web@example.com")
  check("the buyer gets one confirmation, whose order link opens on the website", mail.filter((m) => /confirmed/i.test(m.subject)).length === 1 && mail.some((m) => m.html.includes(`https://${host}/`)), { subjects: mail.map((m) => m.subject), links: mail[0]?.html.match(/href="https:\/\/[^"]+"/g)?.slice(0, 6) })
  const so = await j.call(`GET /api/physical/orders/${siteCo.id}`, { as: c.seller })
  check("the seller's order page shows the cart note from the website", so.json?.order?.buyerNote === "Leave it with the neighbour, please", so.json?.order?.buyerNote)
  const sellerNew = j.net.mails.find((m) => m.to.some((x) => /anaceramics|maker@/.test(x)) && /New order/.test(m.subject) && m.html.includes("Leave it with the neighbour"))
  check("the theme cart's attribute (Gift message) rides the checkout link, is kept on the order, shown on the seller's order page and in the new order email", params.attributes?.["Gift message"] === "Happy birthday, Ana" && j.rows("commerce_checkouts").find((x) => x.id === siteCo.id)?.cart_attributes?.["Gift message"] === "Happy birthday, Ana" && so.json?.order?.cartAttributes?.["Gift message"] === "Happy birthday, Ana" && !!sellerNew && sellerNew.html.includes("Happy birthday, Ana"), { params: params.attributes, kept: j.rows("commerce_checkouts").find((x) => x.id === siteCo.id)?.cart_attributes, page: so.json?.order?.cartAttributes, mail: !!sellerNew })
}

/** The edges: the Storelib theme's own product block, a download in a shipped order, a payment after the hold expired, an address change, a shipment cancelled, a refund made in Stripe's dashboard, a dispute won. */
async function edges(j: Journey, c: Ctx) {
  const { seller } = c
  section("25. A Storelib theme's product block")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { productSectionData } = await import("@/lib/products/product-section-data")
  const row = j.rows("products").find((p) => p.id === c.mugId)!
  const data = (await productSectionData(createAdminClient(), { ...row } as never)) as any
  const v = (n: string) => (data.variants ?? []).find((x: any) => x.name === n)
  check("the native product section: Sand not available, Green 2 left, at most 3, delivery from the rates, pickup at the Studio", v("Sand")?.available === false && v("Blue")?.available === true && v("Blue")?.max_quantity === 3 && !!data.delivery && JSON.stringify(data.delivery).includes("Studio"), { variants: (data.variants ?? []).map((x: any) => [x.name, x.available, x.left, x.max_quantity]), delivery: data.delivery })

  const { saveCollection, productsInCollection } = await import("@/lib/physical/collections-server")
  const smart = await saveCollection(createAdminClient(), c.creatorId, null, { title: "Mugs", kind: "smart", rules: [{ field: "type", op: "equals", value: "physical" }] })
  const inSmart = await productsInCollection(createAdminClient(), c.creatorId, "mugs")
  check("a smart collection (type is physical) holds the mug on the storefront, not the download", smart.ok && !!inSmart && inSmart.productIds.includes(c.mugId) && !inSmart.productIds.includes(c.pdfId), { smart, inSmart })

  section("26. A download in a shipped order")
  const signed = await j.signUp("reader@example.com")
  const startD = await j.call("POST /api/physical/checkout", { as: signed, headers: { "x-forwarded-for": "198.51.100.200" }, body: { shopId: c.creatorId, items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }, { productId: c.pdfId, variantId: null, quantity: 1 }], email: signed.email, name: "Rea Der", address: c.address, deliveryOptionId: c.std?.id, clientKey: "journey-download-1234" } })
  const coD = j.rows("commerce_checkouts").find((x) => x.client_key === "journey-download-1234")
  if (coD?.stripe_session_id) await j.webhook("checkout.session.completed", j.world.expand(j.world.pay(coD.stripe_session_id).session)!)
  await j.cron()
  const confD = j.net.to(signed.email).find((m) => /confirmed/i.test(m.subject))
  const pdfLine = j.rows("orders").find((o) => o.checkout_id === coD?.id && o.product_id === c.pdfId)
  check("a signed in buyer owns the download at once (in their library)", startD.status === 200 && j.rows("entitlements").some((e) => e.buyer_id === signed.id && e.product_id === c.pdfId), { start: startD.json, ent: j.rows("entitlements").length })
  check("the confirmation leads to the download (its receipt link)", !!confD && !!pdfLine && (confD.html.includes(pdfLine.receipt_token) || /download/i.test(confD.html)), confD?.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 700))

  section("27. Paid after the stock hold expired")
  const h = await buy(j, c, { email: "late@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], pay: false })
  const before = { ...c.level("Blue") }
  for (const r of j.rows("inventory_reservations").filter((r) => r.checkout_id === h.co!.id)) r.expires_at = new Date(Date.now() - 60_000).toISOString()
  await j.cron()
  const expiredCo = j.rows("commerce_checkouts").find((x) => x.id === h.co!.id)!
  check("the cron gives back a hold nobody paid for", expiredCo.status === "expired" && c.level("Blue").committed === before.committed - 1, { status: expiredCo.status, level: c.level("Blue") })
  const late = j.world.pay(h.co!.stripe_session_id)
  await j.webhook("checkout.session.completed", j.world.expand(late.session)!)
  const lateCo = j.rows("commerce_checkouts").find((x) => x.id === h.co!.id)!
  check("a payment that lands after: the order is still made, the stock taken again and the seller told on the timeline", lateCo.status === "paid" && c.level("Blue").committed === before.committed && j.rows("commerce_order_events").some((e) => e.checkout_id === lateCo.id && e.kind === "inventory.recommitted"), { status: lateCo.status, level: c.level("Blue") })

  section("28. The seller changes the address, then cancels a shipment")
  const addr = await j.call(`POST /api/physical/orders/${lateCo.id}`, { as: seller, body: { action: "address", address: { ...c.address, line1: "Str. Noua 7" } } })
  const addrAgain = await j.call(`POST /api/physical/orders/${lateCo.id}`, { as: seller, body: { action: "address", address: { ...c.address, line1: "Str. Noua 7" } } })
  await j.cron()
  check("the new address is kept and the buyer is told once", addr.status === 200 && addrAgain.status === 200 && addr.json?.order?.address?.line1 === "Str. Noua 7" && j.net.to("late@example.com").filter((m) => /updated|address|changed/i.test(m.subject)).length === 1, { addr: addr.json?.error, subjects: j.net.to("late@example.com").map((m) => m.subject) })
  const lateLine = j.rows("orders").find((o) => o.checkout_id === lateCo.id)!
  await j.call(`POST /api/physical/orders/${lateCo.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: lateLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: "JD014600000000000001" } })
  const onShelf = c.level("Blue").on_hand
  const fl = j.rows("fulfillments").find((f) => f.checkout_id === lateCo.id)!
  /* A parcel the carrier lost: Delivery problem, then cancelled to send it again (a shipped parcel is never cancelled straight away). */
  const lost = await j.call(`POST /api/physical/orders/${lateCo.id}`, { as: seller, body: { action: "shipment", fulfillmentId: fl.id, status: "failed" } })
  const cx = await j.call(`POST /api/physical/orders/${lateCo.id}`, { as: seller, body: { action: "shipment", fulfillmentId: fl.id, status: "cancelled" } })
  await j.cron()
  check("a delivery problem tells the buyer once", lost.status === 200 && j.net.to("late@example.com").filter((m) => /problem|issue|delay/i.test(m.subject)).length === 1, j.net.to("late@example.com").map((m) => m.subject))
  check("a cancelled shipment: the item is to ship again, back on the shelf and committed", cx.status === 200 && cx.json?.order?.fulfillmentStatus === "unfulfilled" && c.level("Blue").on_hand === onShelf + 1, { status: cx.json?.order?.fulfillmentStatus ?? cx.json, level: c.level("Blue") })

  section("29. A refund made in Stripe's dashboard")
  const dash = await buy(j, c, { email: "dashboard@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }] })
  const r = j.world.refund({ payment_intent: dash.paid!.intent.id, amount: 2000 })
  await j.webhook("refund.updated", r)
  await j.webhook("charge.refunded", j.world.charges.get(dash.paid!.charge!.id)!)
  await j.webhook("charge.refunded", j.world.charges.get(dash.paid!.charge!.id)!)
  await j.cron()
  const dashCo = j.rows("commerce_checkouts").find((x) => x.id === dash.co!.id)!
  check("the order catches up (partly refunded, 20.00) and the buyer gets one refund email", dashCo.status === "partially_refunded" && dashCo.refunded_cents === 2000 && j.net.to("dashboard@example.com").filter((m) => /refund/i.test(m.subject)).length === 1, { status: dashCo.status, refunded: dashCo.refunded_cents, subjects: j.net.to("dashboard@example.com").map((m) => m.subject) })

  section("30. A dispute won")
  const won = await buy(j, c, { email: "won@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 2 }] })
  const dp = j.world.dispute(won.paid!.charge!.id)
  await j.webhook("charge.dispute.created", dp)
  const ledgerOpen = { ...j.rows("seller_ledger").find((l) => l.creator_id === c.creatorId)! }
  dp.status = "won"
  const closed = await j.webhook("charge.dispute.closed", dp)
  await j.webhook("charge.dispute.closed", dp)
  const ledgerWon = j.rows("seller_ledger").find((l) => l.creator_id === c.creatorId)!
  const restored = j.rows("ledger_events").filter((e) => e.stripe_dispute_id === dp.id && e.event_type === "dispute_closed")
  check("won: the money taken back is returned to the seller once", closed.status === 200 && restored.length === 1 && ledgerWon.pending_amount + ledgerWon.available_amount - ledgerWon.negative_balance > ledgerOpen.pending_amount + ledgerOpen.available_amount - ledgerOpen.negative_balance, { restored: restored.map((e) => [e.amount_cents, e.pending_delta, e.available_delta]), before: ledgerOpen, after: ledgerWon })
}

/**
 * ROUND 24 ON TOP OF THE JOURNEY: courier tracking, the shipping apps, the
 * print and dropship partners, the marketing tools, the buyer's contact with
 * the shop, a theme cart's attributes, one order number for the seller, and
 * the 60 day pass over parcels nobody saw delivered.
 */
async function round24(j: Journey, c: Ctx) {
  const { seller } = c
  const P = j.providers

  section("31. Courier tracking (AfterShip): registered, pushed, polled, emails once, the return window from the carrier's delivery")
  const t = await buy(j, c, { email: "tracked@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }] })
  const tLine = j.rows("orders").find((o) => o.checkout_id === t.co!.id)!
  const number = "JD014600009999990001"
  await j.call(`POST /api/physical/orders/${t.co!.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: tLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: number } })
  await j.cron()
  const ship = () => j.rows("fulfillments").find((f) => f.checkout_id === t.co!.id)!
  check("the cron registers the parcel with AfterShip once, with the order's reference and DHL's slug", P.to("api.aftership.com", /\/trackings$/).filter((x) => x.method === "POST").length === 1 && P.aftership.get(number)?.slug === "dhl" && ship().tracking_provider === "aftership" && !!ship().tracking_ref, { calls: P.calls.map((x) => `${x.method} ${x.path}`), ship: { p: ship().tracking_provider, ref: ship().tracking_ref, st: ship().tracking_status } })
  const { trackingWebhookToken } = await import("@/lib/physical/tracking/provider")
  const hook = `/api/tracking/webhooks/aftership/${trackingWebhookToken("aftership", "platform")}`
  P.scan(number, "OutForDelivery", "Out for delivery with the courier", new Date(Date.now() - 3600_000).toISOString())
  const w1 = P.aftershipWebhook(number)
  const r1 = await j.call(`POST ${hook}`, { raw: w1.raw, headers: w1.headers })
  const r1again = await j.call(`POST ${hook}`, { raw: w1.raw, headers: w1.headers })
  const forged = await j.call(`POST ${hook}`, { raw: w1.raw, headers: { ...w1.headers, "aftership-hmac-sha256": "bm9wZQ==" } })
  await j.cron()
  check("AfterShip's webhook (signed, read back from the API) moves the shipment to out for delivery; again changes nothing; a forged one is refused", r1.status === 200 && r1again.status === 200 && forged.status === 401 && ship().status === "out_for_delivery", { r1: r1.json, again: r1again.json, forged: forged.status, status: ship().status })
  const deliveredAt = new Date(Date.now() - 2 * 86_400_000).toISOString()
  P.scan(number, "Delivered", "Delivered, signed for by POP", deliveredAt)
  ship().tracking_next_check_at = new Date(Date.now() - 1000).toISOString()
  await j.cron()
  await j.cron()
  const tracked = j.net.to("tracked@example.com").map((m) => m.subject)
  check("the next poll reads Delivered: delivered at the carrier's own time; buyer emails out for delivery and delivered, each once", ship().status === "delivered" && ship().delivered_at === deliveredAt && tracked.filter((x) => /out for delivery/i.test(x)).length === 1 && tracked.filter((x) => /delivered/i.test(x)).length === 1, { status: ship().status, at: ship().delivered_at, want: deliveredAt, tracked })
  const page = await renderBuyerPage(t.co!.receipt_token)
  const { returnWindow } = await import("@/lib/physical/status")
  const { loadOrder } = await import("@/lib/physical/orders-server")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const lo = await loadOrder(createAdminClient(), { creatorId: c.creatorId, checkoutId: t.co!.id })
  const win = returnWindow({ ...lo!, pickup: false }, 30)
  check("the return window counts 30 days from the carrier's delivery, two days ago", !!win.endsAt && Math.abs(Date.parse(win.endsAt) - (Date.parse(deliveredAt) + 30 * 86_400_000)) < 86_400_000 && /Out for delivery|Delivered/i.test(page), { win, deliveredAt })

  section("33. The buyer contacts the shop; the seller answers; Storelib after three days")
  const help = await j.call("POST /api/order-help", { headers: { "x-forwarded-for": "198.51.100.231" }, body: { kind: "physical", token: t.co!.receipt_token, reason: "question", message: "Can you send it in a gift box, please?" } })
  const caseId = help.json?.id as string | undefined
  const k = help.json?.link ? new URL(help.json.link).searchParams.get("k") ?? "" : ""
  await j.cron()
  const toShop = j.net.mails.filter((m) => m.to.some((x) => /anaceramics|maker@/.test(x)) && /gift box|message|question/i.test(`${m.subject} ${m.html}`) && m.html.includes("gift box"))
  check("Contact the shop from the order page: a case opened, the seller emailed once with the message and the order's #100x", help.status === 200 && !!caseId && toShop.length === 1 && /#10\d\d/.test(`${toShop[0]?.subject} ${toShop[0]?.html}`), { help: help.json, mails: toShop.map((m) => m.subject) })
  const cases = await j.call("GET /api/store/cases", { as: seller })
  const reply = caseId ? await j.call(`POST /api/store/cases/${caseId}`, { as: seller, body: { action: "reply", body: "Of course, it will go in a gift box." } }) : null
  await j.cron()
  const toBuyer = j.net.to("tracked@example.com").filter((m) => m.html.includes("gift box"))
  check("the seller sees the case in their list and answers it; the buyer is emailed the answer once, with their own reference only", cases.status === 200 && JSON.stringify(cases.json).includes(String(caseId)) && reply?.status === 200 && toBuyer.length === 1 && !/#10\d\d/.test(`${toBuyer[0]?.subject} ${toBuyer[0]?.text}`), { cases: cases.status, reply: reply?.json?.error, buyer: toBuyer.map((m) => m.subject) })
  const thread = caseId ? await j.call(`GET /api/order-help/${caseId}?k=${encodeURIComponent(k)}`) : null
  check("the buyer's case page shows both messages and offers no Storelib escalation for a question", thread?.status === 200 && (thread?.json?.messages ?? []).length === 2 && thread?.json?.escalation?.can === false, thread?.json)
  const lost = await j.call("POST /api/order-help", { headers: { "x-forwarded-for": "198.51.100.232" }, body: { kind: "physical", token: t.co!.receipt_token, reason: "damaged", message: "The handle arrived broken off the mug." } })
  const lostId = lost.json?.id as string
  const lk = lost.json?.link ? new URL(lost.json.link).searchParams.get("k") ?? "" : ""
  const early = await j.call(`POST /api/order-help/${lostId}`, { body: { action: "escalate", k: lk } })
  for (const m of j.rows("order_case_messages").filter((x) => x.case_id === lostId)) m.created_at = new Date(Date.now() - 4 * 86_400_000).toISOString()
  const esc = await j.call(`POST /api/order-help/${lostId}`, { body: { action: "escalate", k: lk, body: "No answer for four days." } })
  await j.cron()
  const storelib = j.net.mails.filter((m) => m.to.some((x) => /support@storelib\.com/.test(x)) && /asked Storelib to step in/.test(m.subject))
  check("a damaged item unanswered: the buyer can't ask Storelib in at once, can after three days; Storelib support is emailed once and the case reads with Storelib", early.status === 409 && esc.status === 200 && esc.json?.case?.status === "storelib" && storelib.length === 1, { early: early.json, esc: esc.json?.case ?? esc.json, storelib: storelib.map((m) => [m.to, m.subject]), row: j.rows("order_cases").find((x) => x.id === lostId), msgs: j.rows("order_case_messages").filter((x) => x.case_id === lostId) })

  section("34. Sixty days on, a tracked parcel nobody saw delivered")
  const u = await buy(j, c, { email: "unconfirmed@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }] })
  const uLine = j.rows("orders").find((o) => o.checkout_id === u.co!.id)!
  await j.call(`POST /api/physical/orders/${u.co!.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: uLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: "JD014600009999990002" } })
  const uf = j.rows("fulfillments").find((f) => f.checkout_id === u.co!.id)!
  uf.shipped_at = new Date(Date.now() - 61 * 86_400_000).toISOString()
  uf.tracking_last_event_at = new Date(Date.now() - 50 * 86_400_000).toISOString()
  uf.tracking_status = "in_transit"
  const { closeUnconfirmedDeliveries } = await import("@/lib/physical/unconfirmed-delivery-server")
  await j.cron()
  const again60 = await closeUnconfirmedDeliveries(createAdminClient())
  const lo60 = await loadOrder(createAdminClient(), { creatorId: c.creatorId, checkoutId: u.co!.id })
  const win60 = returnWindow({ ...lo60!, pickup: false }, 30)
  const ret60 = await j.call(`POST /api/physical/order-status/${u.co!.receipt_token}/return`, { headers: { "x-forwarded-for": "198.51.100.233" }, body: { items: [{ orderId: uLine.id, quantity: 1 }], reason: "other" } })
  check("the 60 day pass marks it delivery not confirmed (once, on the timeline), the seller is told, and the return window has ended", !!uf.delivery_unconfirmed_at && again60.closed === 0 && j.rows("commerce_order_events").filter((e) => e.checkout_id === u.co!.id && /unconfirmed/.test(e.kind)).length === 1 && win60.open === false && ret60.status === 400, { at: uf.delivery_unconfirmed_at, again: again60, win60, ret: ret60.json, events: j.rows("commerce_order_events").filter((e) => e.checkout_id === u.co!.id).map((e) => e.kind) })
  const p1 = await buy(j, c, { email: "moving@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }] })
  const pLine = j.rows("orders").find((o) => o.checkout_id === p1.co!.id)!
  await j.call(`POST /api/physical/orders/${p1.co!.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: pLine.id, quantity: 1 }], carrier: "DHL", trackingNumber: "JD014600009999990003" } })
  const pf2 = j.rows("fulfillments").find((f) => f.checkout_id === p1.co!.id)!
  pf2.shipped_at = new Date(Date.now() - 61 * 86_400_000).toISOString()
  pf2.tracking_last_event_at = new Date(Date.now() - 2 * 86_400_000).toISOString()
  pf2.tracking_status = "in_transit"
  await closeUnconfirmedDeliveries(createAdminClient())
  check("a parcel tracking saw move two days ago is left alone", !pf2.delivery_unconfirmed_at, { at: pf2.delivery_unconfirmed_at })

  section("35. Klaviyo and Omnisend: a consented buyer subscribed, a buyer who did not ask only a customer")
  const KKEY = "pk_journey0123456789abcdef0123456789"
  const OKEY = "omni-journey-key-0123456789"
  P.on("a.klaviyo.com", (x) => {
    const ok = x.headers.get("authorization") === `Klaviyo-API-Key ${KKEY}`
    if (!ok) return new Response(JSON.stringify({ errors: [{ detail: "Incorrect authentication credentials." }] }), { status: 401, headers: { "content-type": "application/json" } })
    const j2 = (b: unknown, st = 200) => new Response(b === undefined ? "" : JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } })
    if (x.path === "/api/accounts") return j2({ data: [{ type: "account", id: "PUBJ", attributes: { contact_information: { organization_name: "Ana Ceramics" } } }] })
    if (x.path === "/api/lists") return j2({ data: [{ type: "list", id: "LISTJ", attributes: { name: "Newsletter" } }], links: { next: null } })
    if (x.method === "POST" && ["/api/profile-subscription-bulk-create-jobs", "/api/profile-subscription-bulk-delete-jobs", "/api/profile-bulk-import-jobs", "/api/events"].includes(x.path)) return j2(undefined, 202)
    if (x.path === "/api/profiles") return j2({ data: [], links: { next: null } })
    return null
  })
  P.on("api.omnisend.com", (x) => {
    const j2 = (b: unknown, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } })
    if (x.headers.get("authorization") !== `Omnisend-API-Key ${OKEY}`) return j2({ title: "Unauthorized", status: 401 }, 401)
    if (x.path === "/api/brands/current") return j2({ brandID: "bj", name: "Ana Omni", currency: "USD" })
    if (x.method === "POST" && ["/api/contacts", "/api/batches", "/api/events"].includes(x.path)) return j2(x.path === "/api/batches" ? { batchID: "b1", totalCount: x.body?.items?.length ?? 0 } : {}, x.path === "/api/events" ? 202 : 200)
    if (x.method === "GET" && x.path === "/api/contacts") return j2({ contacts: [], paging: { hasMore: false, cursors: { after: null } } })
    return null
  })
  const kc = await j.call("POST /api/store/integrations/marketing", { as: seller, body: { provider: "klaviyo", step: "connect", apiKey: KKEY, listId: "LISTJ", backfill: false } })
  const oc = await j.call("POST /api/store/integrations/marketing", { as: seller, body: { provider: "omnisend", step: "connect", apiKey: OKEY, backfill: false } })
  const kRow = j.rows("commerce_integrations").find((x) => x.provider === "klaviyo")
  check("Klaviyo and Omnisend connect with keys the providers accept; the key is sealed, only the last four shown", kc.status === 200 && oc.status === 200 && kRow?.status === "connected" && !JSON.stringify(kRow).includes(KKEY) && !JSON.stringify(kc.json).includes(KKEY), { kc: kc.json, oc: oc.json })
  const yes = await buy(j, c, { email: "yes-news@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], optIn: true, name: "Yara News" })
  const no = await buy(j, c, { email: "no-news@example.com", items: [{ productId: c.mugId, variantId: c.vId("Blue"), quantity: 1 }], name: "Noel Quiet" })
  for (const job of j.rows("commerce_jobs").filter((x) => x.kind === "marketing_sync")) job.run_after = new Date(Date.now() - 1000).toISOString()
  await j.cron()
  await j.cron()
  const kcalls = P.to("a.klaviyo.com")
  const bodyOf = (path: string) => JSON.stringify(kcalls.filter((x) => x.path === path).map((x) => x.body))
  const subs = bodyOf("/api/profile-subscription-bulk-create-jobs")
  const imports = bodyOf("/api/profile-bulk-import-jobs")
  const events = kcalls.filter((x) => x.path === "/api/events").map((x) => x.body)
  const evFor = (email: string, metric: RegExp) => events.filter((e) => JSON.stringify(e).includes(email) && metric.test(JSON.stringify(e))).length
  console.log("  klaviyo:", JSON.stringify(kcalls.map((x) => `${x.method} ${x.path}`)), JSON.stringify(j.rows("commerce_jobs").filter((x) => x.kind === "marketing_sync").map((x) => [x.status, x.last_error, x.payload?.op, x.payload?.event])).slice(0, 1500))
  check("Klaviyo: the buyer who ticked the box is subscribed to the list, with marketing consent", subs.includes("yes-news@example.com") && subs.includes("SUBSCRIBED") && subs.includes("LISTJ"), { subs: subs.slice(0, 600) })
  check("Klaviyo: the buyer who did not tick it is never subscribed, only a customer profile", !subs.includes("no-news@example.com") && (imports.includes("no-news@example.com") || evFor("no-news@example.com", /Placed Order/) === 1), { subs: subs.slice(0, 300), imports: imports.slice(0, 400) })
  check("Klaviyo: one Placed Order event per order; Started Checkout only for the buyer who said yes", evFor("yes-news@example.com", /Placed Order/) === 1 && evFor("no-news@example.com", /Placed Order/) === 1 && evFor("no-news@example.com", /Started Checkout/) === 0, { yes: evFor("yes-news@example.com", /Placed Order/), no: evFor("no-news@example.com", /Placed Order/), startedNo: evFor("no-news@example.com", /Started Checkout/), events: events.map((e) => JSON.stringify(e).slice(0, 160)) })
  const ocalls = P.to("api.omnisend.com")
  const omni = JSON.stringify(ocalls.filter((x) => x.method === "POST").map((x) => x.body))
  check("Omnisend: the consented buyer a subscribed contact, the other no subscription; placed order events for both", /yes-news@example\.com[^}]*subscribed|subscribed[^}]*yes-news@example\.com/.test(omni) && !/no-news@example\.com[^}]*"subscribed"/.test(omni) && ocalls.filter((x) => x.path === "/api/events").length >= 2, { calls: ocalls.map((x) => `${x.method} ${x.path}`), omni: omni.slice(0, 900) })
  void yes
  void no

  section("32. One order number for the seller, the reference for the buyer")
  const sellerMail = j.net.mails.filter((m) => m.to.some((x) => /anaceramics|maker@/.test(x)))
  const aboutOrders = sellerMail.filter((m) => /order/i.test(m.subject) && !/your first sale/i.test(m.subject))
  const hex = aboutOrders.filter((m) => /#[0-9A-F]{8}\b/.test(m.subject) && !/#10\d\d/.test(m.subject))
  check("every seller email about an order names it #100x, as the Orders page does", aboutOrders.length > 5 && hex.length === 0, { hex: hex.map((m) => m.subject), all: aboutOrders.map((m) => m.subject).slice(0, 12) })
  const buyerMail = j.net.mails.filter((m) => !m.to.some((x) => /anaceramics|maker@|support@storelib\.com/.test(x)))
  const seq = buyerMail.filter((m) => /#10\d\d\b/.test(`${m.subject} ${m.text}`))
  check("buyers only ever see their reference (#XXXXXXXX), never the seller's #100x", seq.length === 0, seq.map((m) => [m.to, m.subject]))
}

/** The buyer's order page (app/checkout/physical/order/[token]), rendered as the server renders it. */
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

/** A product as the product editor writes it (app/app/products/new/product-editor.tsx), through the same database. */
async function newProduct(j: Journey, creatorId: string, p: { type: string; title: string; priceCents: number; salesLimit?: number | null }): Promise<string> {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert(
    "products",
    {
      creator_id: creatorId,
      type: p.type,
      title: p.title,
      slug,
      description: `<p>${p.title}</p>`,
      status: "published",
      price_cents: p.priceCents,
      compare_at_cents: null,
      thumbnail_url: "https://cdn.example.com/p.jpg",
      gallery_urls: null,
      video_url: null,
      show_sales_badge: false,
      refund_policy_enabled: false,
      refund_policy_type: null,
      seo_title: null,
      seo_description: null,
      call_to_action: null,
      whats_included: null,
      faqs: null,
      category: null,
      pay_what_you_want: false,
      pwyw_min_price_cents: null,
      pwyw_suggested_price_cents: null,
    },
    {},
  )
  if (p.salesLimit !== undefined) j.db.update("products", { sales_limit: p.salesLimit }, [{ path: "id", op: "eq", value: row.id, not: false }])
  return row.id as string
}

function report(j: Journey) {
  section("Harness")
  const issues = [...new Map(j.db.schemaIssues.map((i) => [`${i.kind}:${i.table}.${i.column ?? ""}:${i.op}`, i])).values()]
  console.log("  schema issues:", JSON.stringify(issues))
  console.log("  missing rpcs:", JSON.stringify([...new Set(j.db.missingRpcs)]))
  console.log("  refused network:", JSON.stringify([...new Set(j.net.refused)]))
  console.log("  server errors:", JSON.stringify(j.serverErrors).slice(0, 2000))
  console.log("  check violations:", JSON.stringify(j.db.checkViolations).slice(0, 2000))
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
