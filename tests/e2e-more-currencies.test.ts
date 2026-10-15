/**
 * MORE CURRENCIES, FROM END TO END
 *
 * A store in lei (Settings › Languages & Currency) with one more currency:
 * euros for Germany and France, at the day's rate, rounded to .99. A visitor
 * from Germany is walked through the real routes over the journey harness
 * (tests/_journey: in-memory PostgREST, a Stripe world whose webhooks are
 * signed and delivered to the real webhook route):
 *
 *   the product card, the product page and the cart in euros; the website's
 *   currency selector to lei and back; the checkout's quote, a card payment
 *   and a cash on delivery order; and what Stripe charged, the order, the
 *   confirmation email and the seller's order all saying the same amounts.
 *
 * Then a zloty market for Poland, a currency Storelib cannot charge: shown
 * for reference, charged in lei, and said so. And the builder's canvas: the
 * store's currency until the theme's selector picks another.
 *
 * Every amount the visitor is shown is worked out by the functions the pages
 * draw with (lib/markets/live.ts, pricing.ts, the storefront's cart money),
 * so "the checkout charges what the page showed" is a measurement.
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
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ")
const NBSP = " "
/* A day's rates as the ECB writes them, per euro. */
const RON_PER_EUR = 4.9775
const PLN_PER_EUR = 4.25

async function main() {
  const j = await Journey.start()
  const { siteLanguages, siteLocalizer, languageChoice, marketOfCountry } = await import("@/lib/markets/live")
  const { checkoutVisitorCountry, deliveryCountryGuess } = await import("@/lib/markets/checkout-market-server")
  const { pricingFor } = await import("@/lib/markets/pricing")
  const { cartAmounts } = await import("@/lib/markets/cart-money")
  const { shopProducts } = await import("@/lib/website-builder/shop-products")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  /* The store's product cards as its website's pages read them, in its own currency. */
  const listCards = (creatorId: string) => shopProducts(createAdminClient() as unknown as Parameters<typeof shopProducts>[0], creatorId)

  section("1. A store in lei, payments on, cash on delivery in Germany")
  const seller = await j.signUp("lei@example.com", { name: "Lia Lei" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "lia-shop" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Lia Shop", supportEmail: "hello@lia.example", defaultCountry: "RO" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "RO", businessName: "Lia Shop SRL" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const sells = await j.call("PUT /api/store/currency", { as: seller, body: { country: "RO", currency: "RON", key: "lia-store-currency-1" } })
  check("the store sells in RON", sells.status === 200 && sells.json?.currency === "RON", { status: sells.status, body: sells.json })
  const cod = await j.call("PUT /api/store/settings", { as: seller, body: { checkout: { cashOnDelivery: true, codCountries: ["RO", "DE"], codFeeCents: 1000 } } })
  check("cash on delivery in Romania and Germany, a 10 lei fee", cod.status === 200 && cod.json?.settings?.checkout?.codFeeCents === 1000, cod.json)

  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const locId = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${locId}`, { as: seller, body: { name: "Depozit", kind: "home", addressLine1: "Strada Lipscani 12", city: "Bucuresti", postalCode: "030031", country: "RO" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["RO", "DE", "FR", "PL"], name: "Europe" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("DE"))
  await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Curier", priceCents: 2500, minDays: 2, maxDays: 4 } })

  const [mugRow] = j.db.insert("products", { creator_id: creator.id, type: "physical", title: "Cana", slug: "cana", description: "<p>Cana</p>", status: "published", price_cents: 9900, thumbnail_url: "https://cdn.example.com/c.jpg", pay_what_you_want: false }, {})
  const mugId = mugRow.id as string
  const saved = await j.call(`PUT /api/physical/products/${mugId}`, {
    as: seller,
    body: {
      options: [{ name: "Size", values: ["Mica", "Mare"] }],
      variants: [
        { options: ["Mica"], priceCents: 9900, sku: "CANA-S", weightGrams: 400, stock: { [locId]: 20 } },
        { options: ["Mare"], priceCents: 12900, sku: "CANA-L", weightGrams: 600, stock: { [locId]: 20 } },
      ],
      requiresShipping: true,
      weightGrams: 400,
      taxable: true,
      trackInventory: true,
      fulfillmentLocationId: locId,
    },
  })
  const small = j.rows("product_variants").find((v) => v.product_id === mugId && v.option1 === "Mica")
  const large = j.rows("product_variants").find((v) => v.product_id === mugId && v.option1 === "Mare")
  check("a mug in two sizes, 99 lei and 129 lei", saved.status === 200 && small?.price_cents === 9900 && large?.price_cents === 12900, { status: saved.status, body: saved.json, small: small?.price_cents, large: large?.price_cents })
  const coupon = await j.call("POST /api/coupons", { as: seller, body: { code: "VARA10", discount_type: "percentage", discount_value: 10 } })
  const minCode = await j.call("POST /api/coupons", { as: seller, body: { code: "MIN150", discount_type: "percentage", discount_value: 10, min_purchase_cents: 15000 } })
  const fixCode = await j.call("POST /api/coupons", { as: seller, body: { code: "FIX5", discount_type: "fixed", discount_value: 5 } })
  check("a 10% code, one for orders of 150 lei and more, and 5 lei off", [coupon, minCode, fixCode].every((c) => c.status === 200 || c.status === 201), [coupon.json, minCode.json, fixCode.json])

  section("2. More currencies: euros for Germany and France, rounded to .99")
  const today = new Date().toISOString().slice(0, 10)
  j.db.insert("fx_rates", { as_of: today, base: "EUR", rates: { RON: RON_PER_EUR, PLN: PLN_PER_EUR, USD: 1.08, GBP: 0.85 }, source: "ecb", fetched_at: new Date().toISOString() }, {})
  const m0 = await j.call("GET /api/store/markets", { as: seller })
  check("Languages & Currency reads RON as the store's currency", m0.status === 200 && m0.json?.baseCurrency === "RON" && m0.json?.ready === true, { status: m0.status, base: m0.json?.baseCurrency, ready: m0.json?.ready })
  const loc = m0.json?.localization
  const home = (loc?.markets ?? []).find((m: any) => m.primary)
  const put = await j.call("PUT /api/store/markets", {
    as: seller,
    body: {
      localization: {
        ...loc,
        markets: [
          { ...home, countries: ["RO"] },
          { id: "eu", name: "Europe", countries: ["DE", "FR"], currency: "EUR", language: null, active: true, primary: false, rounding: "nine_nine", adjustBps: 0 },
          { id: "pl", name: "Poland", countries: ["PL"], currency: "PLN", language: null, active: true, primary: false, rounding: "none", adjustBps: 0 },
        ],
      },
    },
  })
  check("saved: Europe in EUR (DE, FR) and Poland in PLN", put.status === 200 && put.json?.localization?.markets?.length === 3, put.json)

  const host = "lia-shop.storelib.com"
  j.db.insert("store_theme_installs", { creator_id: creator.id, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Storelib" }, {})
  const langs = await siteLanguages(creator.id)
  /* The proxy's visitorMarket: the visitor's choice (sl_country), else where they are. */
  const marketFor = (cookie: string | null, ip: string) => marketOfCountry(langs, checkoutVisitorCountry(cookie, ip))?.id ?? null

  section("3. A visitor from Germany: euros on the card, the product page and the cart")
  check("a visitor in Germany is in the Europe market", marketFor(null, "DE") === "eu" && marketFor(null, "RO") === null && marketFor(null, "US") === null)
  const page = await siteLocalizer(creator.id, null, "eu")
  const cards = page ? page.cards(await listCards(creator.id)) : []
  const mugCard = cards.find((c) => c.id === mugId)
  /* 99 lei at 4.9775 lei a euro is 19.89 €, rounded to .99: 19.99 €. 129 lei: 25.92 €, 25.99 €. 25 lei shipping at the rate: 5.02 €. */
  check("the card says €19.99, from 99 lei", mugCard?.settings.price === "€19.99" && mugCard?.settings.currency === "EUR", mugCard?.settings)
  check("  its large size €25.99", (mugCard?.settings.variants ?? []).some((v) => v.price === "€25.99"), mugCard?.settings.variants)
  const display = page?.display
  const productPage = display ? pricingFor(display.market, display.base, display.fx) : null
  check("the product page converts in the browser to the same €19.99 (ProductSection's display)", productPage?.format(9900, display?.locale) === "€19.99" && productPage?.format(12900, display?.locale) === "€25.99", [productPage?.format(9900, display?.locale), productPage?.format(12900, display?.locale)])
  check("  and no note: euros are what the card is charged", display?.note === null, display?.note)

  const cartLines = [
    { priceCents: 9900, quantity: 2 },
    { priceCents: 12900, quantity: 1 },
  ]
  const cart = cartAmounts(cartLines, display ?? null, "RON")
  /* Each unit as its card says, times the quantity: 2 × 19.99 + 25.99 = 65.97. */
  check("the cart: 2 × €19.99 is €39.98, the large €25.99, subtotal €65.97", cart.lines[0] === "€39.98" && cart.lines[1] === "€25.99" && cart.subtotal === "€65.97", cart)
  const withCode = cartAmounts(cartLines, display ?? null, "RON", { subtotalCents: 32700, discountCents: 3270 })
  check("  with VARA10: the discount is 10% of the euros, not a price rounded to .99", withCode.discount === "€6.60" && withCode.total === "€59.37", withCode)

  section("4. The website's currency selector")
  const choiceDe = await languageChoice(creator.id, null, "eu")
  const opts = choiceDe?.currency?.options ?? []
  check("it offers lei, euros and zloty, euros picked", opts.length === 3 && choiceDe?.currency?.current === "eu" && opts.some((o) => o.id === "home") && opts.some((o) => o.id === "pl"), choiceDe?.currency)
  check("  each says its mark: \"RON lei\", \"Europe (EUR €)\", \"Poland (PLN zł)\"", opts.map((o) => o.label).join("|") === "RON lei|Europe (EUR €)|Poland (PLN zł)", opts.map((o) => o.label))
  const homePick = opts.find((o) => o.id === "home")!
  check("picking lei: the page is in lei, the card 99.00 lei", marketFor(homePick.country, "DE") === null && (await listCards(creator.id)).find((c) => c.id === mugId)?.settings.price === `99.00${NBSP}lei`)
  const homeQuote = await j.call("POST /api/checkout/site", { host, headers: { "x-vercel-ip-country": "DE", origin: `https://${host}` }, cookies: { sl_country: homePick.country }, body: { action: "quote", items: [{ productId: mugId, variantId: small?.id, quantity: 2 }], country: "DE" } })
  check("  and the checkout too: 2 × 99 lei and 25 lei delivery, in RON", homeQuote.status === 200 && !homeQuote.json?.currency && homeQuote.json?.totals?.itemsSubtotalCents === 19800 && homeQuote.json?.totals?.shippingCents === 2500, { status: homeQuote.status, cur: homeQuote.json?.currency, totals: homeQuote.json?.totals })
  const euPick = opts.find((o) => o.id === "eu")!
  check("picking euros again: the visitor's own Germany, the Europe market", marketFor(euPick.country, "DE") === "eu", euPick)
  check("  a visitor in France who picks euros starts checkout in France, not the market's first country", deliveryCountryGuess(langs.markets, euPick.country, "FR") === "FR" && deliveryCountryGuess(langs.markets, homePick.country, "DE") === "DE" && deliveryCountryGuess(langs.markets, "PL", "DE") === "PL", [deliveryCountryGuess(langs.markets, euPick.country, "FR"), deliveryCountryGuess(langs.markets, homePick.country, "DE")])

  section("5. Checkout in euros: the quote is what the pages showed")
  const visitor = { "x-vercel-ip-country": "DE", origin: `https://${host}`, "x-forwarded-for": "192.0.2.44" }
  const cookies = { sl_country: euPick.country }
  const items = [
    { productId: mugId, variantId: small?.id, quantity: 2 },
    { productId: mugId, variantId: large?.id, quantity: 1 },
  ]
  const q = await j.call("POST /api/checkout/site", { host, headers: visitor, cookies, body: { action: "quote", items, country: "DE", postalCode: "10117" } })
  const t = q.json?.totals ?? {}
  check("the quote is in EUR", q.status === 200 && q.json?.currency === "EUR", { status: q.status, body: JSON.stringify(q.json).slice(0, 400) })
  check("  lines €19.99 and €25.99, as the cards said; subtotal €65.97 as the cart said", q.json?.lines?.[0]?.unitCents === 1999 && q.json?.lines?.[1]?.unitCents === 2599 && t.itemsSubtotalCents === 6597, { lines: q.json?.lines?.map((l: any) => l.unitCents), t })
  const curier = (q.json?.delivery?.options ?? []).find((o: any) => o.name === "Curier")
  check("  delivery 25 lei at the rate, €5.02, and the total €70.99", curier?.priceCents === 502 && t.shippingCents === 502 && t.totalCents === 6597 + 502, { curier, t })
  const choices = q.json?.choices?.[mugId]?.variants ?? []
  check("  the size picker's prices are in euros too (€19.99, €25.99), not lei amounts in euros", choices.length === 2 && choices.some((v: any) => v.priceCents === 1999) && choices.some((v: any) => v.priceCents === 2599), choices)
  const qc = await j.call("POST /api/checkout/site", { host, headers: visitor, cookies, body: { action: "quote", items, country: "DE", couponCode: "VARA10" } })
  check("with VARA10: €6.60 off, as the cart said, total €64.39", qc.status === 200 && qc.json?.totals?.discountCents === 660 && qc.json?.totals?.totalCents === 6597 - 660 + 502, qc.json?.totals)
  const qmin = await j.call("POST /api/checkout/site", { host, headers: visitor, cookies, body: { action: "quote", items: [{ productId: mugId, variantId: small?.id, quantity: 1 }], country: "DE", couponCode: "MIN150" } })
  check("a code with a 150 lei minimum says it in euros on this checkout (€30.14), not lei", qmin.status === 200 && qmin.json?.couponError === "That code needs an order of at least €30.14.", { status: qmin.status, error: qmin.json?.couponError })
  const qfix = await j.call("POST /api/checkout/site", { host, headers: visitor, cookies, body: { action: "quote", items: [{ productId: mugId, variantId: small?.id, quantity: 1 }], country: "DE", couponCode: "FIX5" } })
  /* The discount is the same share of the card's rounded price (19.99 for 19.89), so a fixed code takes a cent more than its rate: €1.01. */
  check("  a 5 lei code reads €1.00, never lei, and takes its share of the card's price, €1.01", qfix.status === 200 && qfix.json?.coupon?.label === "€1.00" && qfix.json?.totals?.discountCents === 101, { label: qfix.json?.coupon?.label, t: qfix.json?.totals })
  const qcod = await j.call("POST /api/checkout/site", { host, headers: visitor, cookies, body: { action: "quote", items, country: "DE", deliveryOptionId: curier?.id, cashOnDelivery: true } })
  check("in cash: the 10 lei fee is €2.01", qcod.status === 200 && qcod.json?.totals?.codFeeCents === 201 && qcod.json?.totals?.totalCents === 6597 + 502 + 201, qcod.json?.totals)
  const config = await checkoutConfigShown(creator.id, "DE", "eu")
  check("  and the page says the fee in euros before it is chosen (€2.01, not €10.00)", config.codFeeCents === 201, config)

  section("6. Paid by card in euros")
  const address = { line1: "Gartenweg 2", city: "Berlin", postalCode: "10117", country: "DE" }
  const intent = await j.call("POST /api/checkout/site", {
    host,
    headers: visitor,
    cookies,
    body: { action: "intent", items, couponCode: "VARA10", email: "bea@example.com", firstName: "Bea", lastName: "Buyer", phone: "+49 30 1234567", address, deliveryOptionId: curier?.id, agreedToTerms: true, clientKey: "eur-card-order-1", paymentMethods: ["card"] },
  })
  const piId = intent.json?.paymentIntentId as string | undefined
  const pi = piId ? j.world.intents.get(piId) : null
  check("Stripe is asked for €64.39 in eur, the quote's total", intent.status === 200 && pi?.amount === qc.json?.totals?.totalCents && pi?.currency === "eur", { status: intent.status, body: intent.json, pi: pi && [pi.amount, pi.currency] })
  const co = j.rows("commerce_checkouts").find((c) => c.client_key === "eur-card-order-1")
  check("  the checkout is held in EUR with the quote's parts", co?.currency === "EUR" && co?.items_subtotal_cents === 6597 && co?.discount_cents === 660 && co?.shipping_cents === 502 && co?.total_cents === 6439, co && { currency: co.currency, sub: co.items_subtotal_cents, disc: co.discount_cents, ship: co.shipping_cents, total: co.total_cents })
  if (piId && pi) {
    const paid = j.world.payIntent(piId)
    const confirm = await j.call("POST /api/checkout/site", { host, headers: visitor, cookies, body: { action: "confirm", paymentIntentId: piId, clientSecret: pi.client_secret } })
    await j.webhook("charge.succeeded", paid.charge!)
    await j.webhook("payment_intent.succeeded", paid.intent)
    const orders = j.rows("orders").filter((o) => o.checkout_id === co?.id)
    check("paid: €64.39 charged in eur, the order lines in eur adding up to it", confirm.status === 200 && paid.charge?.amount === 6439 && paid.charge?.currency === "eur" && orders.length === 2 && orders.every((o) => o.currency === "eur") && orders.reduce((n, o) => n + Number(o.amount_cents), 0) === 6439, { confirm: confirm.json, charge: paid.charge && [paid.charge.amount, paid.charge.currency], orders: orders.map((o) => [o.currency, o.amount_cents]) })
    await j.cron()
    const conf = j.net.to("bea@example.com").find((m) => /confirmed/i.test(m.subject))
    const text = conf ? words(conf.html) : ""
    check("the confirmation email: €64.39, subtotal €65.97, the lines after the code (€35.98, €23.39), delivery €5.02, no lei", !!conf && /Total €64\.39/.test(text) && /Subtotal €65\.97/.test(text) && /Discount -€6\.60/.test(text) && /€35\.98/.test(text) && /€23\.39/.test(text) && /Shipping €5\.02/.test(text) && !/lei|RON/.test(text), conf ? text.replace(/(&#\d+;\s*)+/g, " ").slice(0, 1500) : j.net.to("bea@example.com").map((m) => m.subject))
    const so = await j.call(`GET /api/physical/orders/${co!.id}`, { as: seller })
    check("the order in /app: EUR, €64.39", so.status === 200 && String(so.json?.order?.currency ?? "").toUpperCase() === "EUR" && so.json?.order?.totalCents === 6439, so.json?.order && { currency: so.json.order.currency, total: so.json.order.totalCents })
    const sellerMail = j.net.to("hello@lia.example").find((m) => /Cana/.test(m.subject))
    const sellerText = sellerMail ? words(sellerMail.html) : ""
    check("  the seller's email says the euros the buyer paid", !!sellerMail && /€64\.39/.test(sellerText) && !/64\.39\s*lei/.test(sellerText), sellerMail ? sellerText.slice(0, 700) : j.net.mails.map((m) => [m.to, m.subject]))
  }

  section("7. Cash on delivery in euros")
  const placed = await j.call("POST /api/checkout/site", {
    host,
    headers: visitor,
    cookies,
    body: { action: "cod", items: [{ productId: mugId, variantId: small?.id, quantity: 1 }], email: "carl@example.com", firstName: "Carl", lastName: "Cash", phone: "+49 30 7654321", address, deliveryOptionId: curier?.id, agreedToTerms: true, clientKey: "eur-cod-order-1" },
  })
  const cco = j.rows("commerce_checkouts").find((c) => c.client_key === "eur-cod-order-1:cod")
  /* 19.99 + 5.02 + 2.01 = 27.02 */
  check("placed: €27.02 to pay in cash, in EUR", placed.status === 200 && cco?.provider === "cod" && cco?.currency === "EUR" && cco?.total_cents === 2702 && cco?.shipping_rate?.cod_fee_cents === 201, { status: placed.status, body: placed.json, co: cco && { cur: cco.currency, total: cco.total_cents, rate: cco.shipping_rate } })
  await j.cron()
  const codMail = j.net.to("carl@example.com").find((m) => /confirmed/i.test(m.subject))
  const codText = codMail ? words(codMail.html) : ""
  check("  the email says pay €27.02 in cash, fee €2.01", !!codMail && /€27\.02/.test(codText) && /€2\.01/.test(codText) && !/lei|RON/.test(codText), codMail ? codText.slice(0, 900) : j.net.to("carl@example.com").map((m) => m.subject))

  section("8. A download in euros")
  const [guideRow] = j.db.insert("products", { creator_id: creator.id, type: "digital", title: "Ghid", slug: "ghid", description: "<p>Ghid</p>", status: "published", price_cents: 4900, thumbnail_url: "https://cdn.example.com/g.jpg", pay_what_you_want: false }, {})
  const guideId = guideRow.id as string
  const guideCard = page?.cards(await listCards(creator.id)).find((c) => c.id === guideId)
  const dq = await j.call("POST /api/checkout/site", { host, headers: visitor, cookies, body: { action: "quote", items: [{ productId: guideId, variantId: null, quantity: 1 }] } })
  check("49 lei is €9.99 on its card and at checkout", guideCard?.settings.price === "€9.99" && dq.status === 200 && dq.json?.currency === "EUR" && dq.json?.totals?.totalCents === 999, { card: guideCard?.settings.price, q: dq.json?.totals })
  const di = await j.call("POST /api/checkout/site", { host, headers: visitor, cookies, body: { action: "intent", items: [{ productId: guideId, variantId: null, quantity: 1 }], email: "dora@example.com", firstName: "Dora", lastName: "Digital", agreedToTerms: true, clientKey: "eur-download-1234", paymentMethods: ["card"] } })
  const dpi = di.json?.paymentIntentId ? j.world.intents.get(di.json.paymentIntentId) : null
  check("  Stripe is asked for €9.99 in eur", di.status === 200 && dpi?.amount === 999 && dpi?.currency === "eur", { status: di.status, body: di.json, pi: dpi && [dpi.amount, dpi.currency] })
  if (dpi) {
    const p2 = j.world.payIntent(dpi.id)
    const dc = await j.call("POST /api/checkout/site", { host, headers: visitor, cookies, body: { action: "confirm", paymentIntentId: dpi.id, clientSecret: dpi.client_secret } })
    await j.webhook("payment_intent.succeeded", p2.intent)
    const row = j.rows("orders").find((o) => o.product_id === guideId)
    check("  paid: its order says eur, 9.99", dc.status === 200 && row?.currency === "eur" && row?.amount_cents === 999, { confirm: dc.json, row: row && [row.currency, row.amount_cents] })
    await j.cron()
    const dm = j.net.to("dora@example.com").find((m) => /Ghid|receipt|order|purchase/i.test(m.subject))
    const dt = dm ? words(dm.html).replace(/(&#\d+;\s*)+/g, " ") : ""
    check("  its email says €9.99, no lei", !!dm && /€9\.99/.test(dt) && !/lei|RON/.test(dt), dm ? dt.slice(0, 700) : j.net.to("dora@example.com").map((m) => m.subject))
  }

  section("9. Zloty for Poland: shown for reference, charged in lei")
  const plPage = await siteLocalizer(creator.id, null, "pl")
  const plCard = plPage?.cards(await listCards(creator.id)).find((c) => c.id === mugId)
  /* 99 lei = 19.8895 € = 84.53 zł */
  check("the card says 84.53 zł", plCard?.settings.price === `84.53${NBSP}zł`, plCard?.settings.price)
  check("  the cart says what checkout charges in", /You'll pay in RON/.test(plPage?.display?.note ?? ""), plPage?.display?.note)
  const plQ = await j.call("POST /api/checkout/site", { host, headers: { ...visitor, "x-vercel-ip-country": "PL" }, cookies: {}, body: { action: "quote", items: [{ productId: mugId, variantId: small?.id, quantity: 1 }], country: "PL" } })
  check("  the checkout is in lei: 99 lei and 25 lei delivery", plQ.status === 200 && !plQ.json?.currency && plQ.json?.totals?.totalCents === 12400, { status: plQ.status, cur: plQ.json?.currency, t: plQ.json?.totals })
  const plIntent = await j.call("POST /api/checkout/site", {
    host,
    headers: { ...visitor, "x-vercel-ip-country": "PL" },
    body: { action: "intent", items: [{ productId: mugId, variantId: small?.id, quantity: 1 }], email: "pola@example.com", firstName: "Pola", lastName: "Nowak", phone: "+48 22 1234567", address: { line1: "Marszalkowska 1", city: "Warszawa", postalCode: "00-001", country: "PL" }, deliveryOptionId: plQ.json?.delivery?.options?.[0]?.id, agreedToTerms: true, clientKey: "pln-card-order-1", paymentMethods: ["card"] },
  })
  const plPi = plIntent.json?.paymentIntentId ? j.world.intents.get(plIntent.json.paymentIntentId) : null
  check("  and charged in ron, 124.00 lei, never zloty", plIntent.status === 200 && plPi?.currency === "ron" && plPi?.amount === 12400, { status: plIntent.status, body: plIntent.json, pi: plPi && [plPi.amount, plPi.currency] })

  section("10. The builder's canvas")
  const pv = await j.call("GET /api/store/markets?preview=1", { as: seller })
  check("the canvas opens in the store's currency, lei", pv.status === 200 && pv.json?.base === "RON" && pv.json?.saved === true, pv.json)
  const eu = (pv.json?.markets ?? []).find((m: any) => m.id === "eu")
  const canvasEu = eu ? pricingFor(eu, pv.json.base, pv.json.fx) : null
  check("  and the theme's selector previews euros with the live site's numbers", canvasEu?.format(9900) === "€19.99", canvasEu?.format(9900))

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

/** The checkout settings as app/checkout/site/page.tsx hands them to the page, for a visitor in `country`. */
async function checkoutConfigShown(creatorId: string, country: string, _market: string): Promise<{ codFeeCents: number }> {
  const { loadCheckoutConfig } = await import("@/lib/store/settings-server")
  const { checkoutMarket } = await import("@/lib/markets/checkout-market-server")
  const { checkoutConfigInMarket } = await import("@/lib/markets/checkout-charge")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient()
  const [config, market] = await Promise.all([loadCheckoutConfig(admin, creatorId), checkoutMarket(creatorId, country, admin)])
  return checkoutConfigInMarket(config, market.charge)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
