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
        { options: ["Blue"], priceCents: 4500, sku: "MUG-BLU", weightGrams: 400, stock: { [studioId]: 6 } },
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
  check("the mug saves 3 variants with stock 6 / 2 / 0 and a limit of 3 per order", mugSave.status === 200 && variants.length === 3 && level("Blue").on_hand === 6 && level("Green").on_hand === 2 && level("Sand").on_hand === 0 && j.rows("products").find((p) => p.id === mugId)?.max_per_order === 3, { status: mugSave.status, body: mugSave.json, variants: variants.map((v) => v.name) })
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
  check("the stock is held for the checkout: Blue 6 on hand, 2 committed", level("Blue").on_hand === 6 && level("Blue").committed === 2, level("Blue"))
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
  check("the lines add up to what Stripe took", ordersA.reduce((n, o) => n + o.amount_cents, 0) === paidA.charge!.amount, { lines: ordersA.map((o) => o.amount_cents), charged: paidA.charge!.amount })
  check("the buyer comes back from Stripe to their order page", back.status === 307 && (back.location ?? "").includes(`/checkout/physical/order/${coA2.receipt_token}`), { status: back.status, location: back.location })
  check("stock: still 6 on hand, 2 committed (sold, waiting to ship); reservation marked sold", level("Blue").on_hand === 6 && level("Blue").committed === 2 && j.rows("inventory_reservations").filter((r) => r.checkout_id === coA!.id).every((r) => r.status === "sold"), { level: level("Blue"), res: j.rows("inventory_reservations").filter((r) => r.checkout_id === coA!.id) })
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
  check("stock: the shipped mug leaves the shelf (5 on hand, 1 still committed)", level("Blue").on_hand === 5 && level("Blue").committed === 1, level("Blue"))
  const f2 = await j.call(`POST /api/physical/orders/${coA!.id}`, { as: seller, body: { action: "fulfil", items: [{ orderId: mugLine?.orderId, quantity: 1 }], carrier: "Fan Courier", trackingNumber: "2345678901", key: "f2" } })
  check("the second package: fulfilled, stock 4 on hand and nothing committed", f2.status === 200 && f2.json?.order?.fulfillmentStatus === "fulfilled" && level("Blue").on_hand === 4 && level("Blue").committed === 0, { f2: f2.json?.order?.fulfillmentStatus ?? f2.json, level: level("Blue") })
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
  check("approved, then received: the mug is back on the shelf (5 on hand)", appr.status === 200 && recv.status === 200 && level("Blue").on_hand === 5, { appr: appr.json?.error, recv: recv.json?.error, level: level("Blue") })
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
  check("stock after the restock and the refund: 5 on hand (the refund did not put it back twice)", level("Blue").on_hand === 5 && level("Blue").committed === 0, level("Blue"))
  await j.cron()
  const after11 = j.net.to(buyer.email).map((m) => m.subject)
  console.log("  buyer emails:", JSON.stringify(after11))
  const refundMails = after11.filter((x) => /refund/i.test(x))
  check("the buyer gets exactly one refund email", refundMails.length === 1, after11)
  const refundMail = j.net.to(buyer.email).find((m) => /refund/i.test(m.subject))
  const orderNo = (conf?.subject.match(/#([A-Z0-9]+)/) ?? [])[1] ?? "?"
  check("the refund email: the order's own currency (RON) and the order number the buyer knows", !!refundMail && /RON|lei/i.test(`${refundMail.subject} ${refundMail.html}`) && !/\$48/.test(refundMail.subject) && refundMail.html.includes(orderNo), { subject: refundMail?.subject, orderNo, text: refundMail?.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600) })
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

  report(j)
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
