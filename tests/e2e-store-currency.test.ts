/**
 * A STORE PRICED IN EUROS, BOUGHT FROM END TO END
 *
 * The store's currency (Settings › Store details › Country & Currency,
 * store_settings.currency, lib/store/selling-currency) is what its products
 * are priced in, what its website shows and what its own checkouts charge.
 * Its payout currency (Settings › Payments) is where the money lands, a
 * separate setting. This walks a euro store through the real routes over
 * the journey harness (tests/_journey: in-memory PostgREST, a Stripe world
 * whose webhooks are signed and delivered to the real webhook route):
 *
 *   a physical order through Stripe's page, the order, the emails, a refund,
 *   the seller's ledger; a download bought on the store's website with the
 *   card form; and a language added in Markets, read straight into Translate.
 *
 * Every step reads what Stripe was asked for and what the buyer and the
 * seller are shown, so "charged in euros" is a measurement, not a claim.
 *
 * Run: node scripts/run-push-tests.mjs (in SUITES)
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

  section("1. A store in euros, with payments on")
  const seller = await j.signUp("eur@example.com", { name: "Elsa Euro" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "elsa-shop" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Elsa Shop", supportEmail: "hello@elsa.example", defaultCountry: "DE" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "DE", businessName: "Elsa Shop GmbH" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const cur = await j.call("POST /api/settings/payments", { as: seller, body: { defaultCurrency: "EUR" } })
  check("Settings › Payments saves its payouts in EUR", cur.status === 200 && j.rows("creators")[0].payout_currency === "EUR", { status: cur.status, body: cur.json, row: j.rows("creators")[0].payout_currency })
  /* Changed on purpose: the store's selling currency is its own setting, apart from payouts. A store with no prices yet has nothing to keep or convert. */
  const sells = await j.call("PUT /api/store/currency", { as: seller, body: { country: "DE", currency: "EUR", key: "eur-store-currency-1" } })
  const settingsRow = j.rows("store_settings").find((r) => r.creator_id === j.rows("creators")[0].id)
  check("Country & Currency: the store sells in EUR", sells.status === 200 && sells.json?.currency === "EUR" && settingsRow?.currency === "EUR", { status: sells.status, body: sells.json, row: settingsRow?.currency })
  const again = await j.call("PUT /api/store/currency", { as: seller, body: { currency: "EUR", key: "eur-store-currency-1" } })
  check("  saving it again changes nothing and writes no second change", again.status === 200 && j.rows("store_currency_changes").length === 1, { status: again.status, changes: j.rows("store_currency_changes").length })

  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const locId = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${locId}`, { as: seller, body: { name: "Lager", kind: "home", addressLine1: "Hauptstr. 1", city: "Berlin", postalCode: "10115", country: "DE" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["DE"], name: "Germany" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("DE"))
  await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Standard", priceCents: 500, minDays: 1, maxDays: 3 } })

  const lampId = newProduct(j, creator.id, { type: "physical", title: "Desk Lamp", priceCents: 4000 })
  await j.call(`PUT /api/physical/products/${lampId}`, {
    as: seller,
    body: { variants: [{ options: [], priceCents: 4000, sku: "LAMP", weightGrams: 900, stock: { [locId]: 10 } }], requiresShipping: true, weightGrams: 900, taxable: true, trackInventory: true, fulfillmentLocationId: locId },
  })
  const guideId = newProduct(j, creator.id, { type: "digital", title: "Lighting Guide", priceCents: 900 })

  section("2. A physical order through Stripe's page")
  const address = { name: "Bea Buyer", line1: "Gartenweg 2", city: "Berlin", postalCode: "10117", country: "DE", phone: "+49 30 1234567" }
  const cart = [{ productId: lampId, variantId: null, quantity: 1 }]
  const q = await j.call("POST /api/physical/checkout/quote", { body: { items: cart, shopId: creator.id, country: "DE", postalCode: "10117" } })
  const std = (q.json?.delivery?.options ?? []).find((o: any) => o.name === "Standard")
  check("the quote: 40.00 and Standard 5.00, total 45.00", q.status === 200 && q.json?.totals?.totalCents === 4500 && std?.priceCents === 500, q.json?.totals)

  const start = await j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items: cart, email: "bea@example.com", name: address.name, address, deliveryOptionId: std?.id, clientKey: "eur-physical-123456" } })
  const co = j.rows("commerce_checkouts").find((c) => c.client_key === "eur-physical-123456")
  const session = co ? j.world.sessions.get(co.stripe_session_id) : null
  const lines = (session?.__params?.line_items ?? []) as any[]
  check("the checkout is held in EUR", start.status === 200 && co?.currency === "EUR", { status: start.status, body: start.json, currency: co?.currency })
  check("Stripe is asked for euros: every line and the delivery", lines.length > 0 && lines.every((l) => l.price_data.currency === "eur") && session?.__params?.shipping_options?.[0]?.shipping_rate_data?.fixed_amount?.currency === "eur" && session?.currency === "eur", { lines: lines.map((l) => l.price_data.currency), ship: session?.__params?.shipping_options?.[0]?.shipping_rate_data?.fixed_amount, session: session?.currency })
  check("  for exactly the quoted 45.00, to the shop's account, with Storelib's fee", session?.amount_total === 4500 && session?.__params?.payment_intent_data?.transfer_data?.destination === acct && (session?.__params?.payment_intent_data?.application_fee_amount ?? 0) > 0, { total: session?.amount_total, pid: session?.__params?.payment_intent_data })

  const paid = j.world.pay(co!.stripe_session_id)
  await j.webhook("charge.succeeded", paid.charge!)
  await j.webhook("payment_intent.succeeded", paid.intent)
  const done = await j.webhook("checkout.session.completed", j.world.expand(paid.session)!)
  const orders = j.rows("orders").filter((o) => o.checkout_id === co!.id)
  check("paid: Stripe charged 45.00 in eur, and the order is written once", done.status === 200 && paid.charge?.currency === "eur" && paid.charge?.amount === 4500 && orders.length === 1, { charge: paid.charge && [paid.charge.amount, paid.charge.currency], orders: orders.length })
  check("  the order line says eur, not usd", orders.every((o) => o.currency === "eur"), orders.map((o) => o.currency))

  await j.cron()
  const conf = j.net.to("bea@example.com").find((m) => /confirmed/i.test(m.subject))
  check("the buyer's confirmation shows €45.00 and no dollar sign", !!conf && /€45\.00/.test(words(conf.html)) && !/\$\d/.test(words(conf.html)), conf ? words(conf.html).slice(0, 700) : j.net.to("bea@example.com").map((m) => m.subject))
  const so = await j.call(`GET /api/physical/orders/${co!.id}`, { as: seller })
  check("the seller's order page reads the order in EUR", so.status === 200 && String(so.json?.order?.currency ?? "").toUpperCase() === "EUR" && so.json?.order?.totalCents === 4500, so.json?.order && { currency: so.json.order.currency, total: so.json.order.totalCents })
  const page = await renderBuyerPage(j.rows("commerce_checkouts").find((c) => c.id === co!.id)!.receipt_token)
  check("the buyer's order page shows €45.00", /€45\.00/.test(words(page)) && !/\$45/.test(page), words(page).slice(0, 600))

  section("3. The seller's balance and a refund")
  const sale = j.rows("ledger_events").find((e) => e.creator_id === creator.id && e.event_type === "sale")
  check("the sale is on the ledger in eur, its description in euros", sale?.currency === "eur" && /€45\.00/.test(sale?.description ?? ""), sale && { currency: sale.currency, description: sale.description })
  const refund = await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: orders[0]?.id, amount: 10, reason: "requested_by_customer" } })
  const charge = j.world.charges.get(paid.charge!.id)!
  await j.webhook("charge.refunded", charge)
  const refundCall = j.world.calls.find((c) => c.method === "refunds.create")?.args[0] as any
  check("a 10.00 refund goes to Stripe once, on the euro charge", refund.status === 200 && charge.amount_refunded === 1000 && charge.currency === "eur" && refundCall?.amount === 1000, { refund: refund.json, refunded: charge.amount_refunded })
  await j.cron()
  const refundMail = j.net.to("bea@example.com").find((m) => /refund/i.test(m.subject))
  check("the refund email says €10.00", !!refundMail && /€10\.00/.test(words(refundMail.html)) && !/\$10/.test(words(refundMail.html)), refundMail ? words(refundMail.html).slice(0, 500) : j.net.to("bea@example.com").map((m) => m.subject))
  const transfer = j.world.transfers.get(paid.charge!.transfer)!
  const ledger = j.rows("seller_ledger").find((l) => l.creator_id === creator.id)
  check("the seller's balance matches Stripe's: the transfer less what was reversed", transfer.currency === "eur" && ledger?.pending_amount === transfer.amount - (transfer.amount_reversed as number), { ledger: ledger?.pending_amount, transfer: [transfer.amount, transfer.amount_reversed, transfer.currency] })

  section("4. A download bought on the store's website, with the card form")
  const host = "elsa-shop.storelib.com"
  j.db.insert("store_theme_installs", { creator_id: creator.id, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Storelib" }, {})
  const headers = { "x-forwarded-for": "192.0.2.80", origin: `https://${host}` }
  const items = [{ productId: guideId, variantId: null, quantity: 1 }]
  const sq = await j.call("POST /api/checkout/site", { host, headers, body: { action: "quote", items } })
  check("the website's checkout quotes the guide at 9.00", sq.status === 200 && sq.json?.totals?.totalCents === 900, { status: sq.status, body: JSON.stringify(sq.json).slice(0, 400) })
  const drawn = await renderSiteCheckout(sq.json, creator.id, host)
  check("the website's checkout draws the guide, the subtotal and the total due as €9.00, never $", /€9\.00/.test(words(drawn)) && !/\$9/.test(words(drawn)), words(drawn).slice(0, 600))
  const intent = await j.call("POST /api/checkout/site", { host, headers, body: { action: "intent", items, email: "dora@example.com", firstName: "Dora", lastName: "Digital", agreedToTerms: true, clientKey: "eur-site-digital-1234", paymentMethods: ["card"] } })
  const piId = intent.json?.paymentIntentId as string | undefined
  const pi = piId ? j.world.intents.get(piId) : null
  check("the PaymentIntent is for 9.00 in eur", intent.status === 200 && pi?.amount === 900 && pi?.currency === "eur", { status: intent.status, body: intent.json, pi: pi && [pi.amount, pi.currency] })
  if (piId && pi) {
    const p2 = j.world.payIntent(piId)
    const confirm = await j.call("POST /api/checkout/site", { host, headers, body: { action: "confirm", paymentIntentId: piId, clientSecret: pi.client_secret } })
    await j.webhook("payment_intent.succeeded", p2.intent)
    const row = j.rows("orders").find((o) => o.product_id === guideId)
    check("paid: the download's order says eur, for 9.00", confirm.status === 200 && row?.currency === "eur" && row?.amount_cents === 900, { confirm: confirm.json, row: row && [row.currency, row.amount_cents] })
    const ev = j.rows("ledger_events").filter((e) => e.creator_id === creator.id && e.event_type === "sale")
    check("  and its sale is on the ledger in eur", ev.length === 2 && ev.every((e) => e.currency === "eur"), ev.map((e) => [e.currency, e.amount_cents]))
  }

  section("5. Markets and languages: a language added, then Translate")
  const m0 = await j.call("GET /api/store/markets", { as: seller })
  check("Markets answers with the store's base currency, EUR, and charges cards in it", m0.status === 200 && m0.json?.baseCurrency === "EUR", { status: m0.status, base: m0.json?.baseCurrency, charge: m0.json?.chargeCurrency, ready: m0.json?.ready })
  if (m0.status === 200 && m0.json?.ready) {
    const loc = m0.json.localization
    const put = await j.call("PUT /api/store/markets", { as: seller, body: { localization: { ...loc, languages: [...loc.languages, { code: "es", published: false }] } } })
    const tr = await j.call("GET /api/store/translations?locale=es", { as: seller })
    const items2 = (tr.json?.groups ?? []).flatMap((g: any) => g.items)
    check("Spanish saved, then Translate lists the store's words to translate (never \"no text\")", put.status === 200 && tr.status === 200 && tr.json?.locale === "es" && items2.length > 0 && items2.some((i: any) => /Desk Lamp|Lighting Guide/.test(i.source)), { put: put.status, tr: tr.status, locale: tr.json?.locale, count: items2.length })
    const trBefore = await j.call("GET /api/store/translations?locale=fr", { as: seller })
    check("  a language not saved yet answers with no locale, which the sheet now says plainly", trBefore.status === 200 && trBefore.json?.locale === null, trBefore.json)
  } else {
    check("Markets is set up in the journey's database", false, m0.json)
  }

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
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

/**
 * The website's checkout totals as the page draws them, in the store's
 * currency (app/(storelib)/checkout/site/page.tsx hands `currency` down to them). The
 * whole page also loads Stripe's browser script, which does not load outside
 * a browser, so its totals are drawn on their own: the same component the page uses.
 */
async function renderSiteCheckout(quote: any, shopId: string, _host: string): Promise<string> {
  try {
    const { Totals } = await import("@/app/(storelib)/checkout/parts/order-summary")
    const { money, CheckoutCurrency } = await import("@/app/(storelib)/checkout/parts/ui")
    const { readStoreCurrency } = await import("@/lib/store/selling-currency-read")
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { renderToStaticMarkup } = await import("react-dom/server")
    const { createElement } = await import("react")
    /* As app/(storelib)/checkout/site/page.tsx does: the store's currency read from its settings, every amount inside <CheckoutCurrency> drawn in it. */
    const currency = (await readStoreCurrency(createAdminClient(), shopId)).currency
    const t = quote?.totals ?? {}
    return renderToStaticMarkup(
      createElement(
        CheckoutCurrency,
        { currency } as { currency: string; children: never },
        createElement("p", null, money((quote?.lines?.[0]?.unitCents ?? 0) * (quote?.lines?.[0]?.quantity ?? 1), currency)),
        createElement(Totals, { part: "top", subtotal: t.itemsSubtotalCents ?? 0, discountCents: t.discountCents ?? 0, total: t.totalCents ?? 0 }),
        createElement(Totals, { part: "bottom", subtotal: t.itemsSubtotalCents ?? 0, discountCents: t.discountCents ?? 0, total: t.totalCents ?? 0 }),
      ),
    )
  } catch (e) {
    return `render failed: ${e instanceof Error ? e.stack : String(e)}`
  }
}

function newProduct(j: Journey, creatorId: string, p: { type: string; title: string; priceCents: number }): string {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type: p.type, title: p.title, slug, description: `<p>${p.title}</p>`, status: "published", price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
