/**
 * ONE LEI STORE, BOUGHT FROM END TO END, WITH THE MARKETPLACE IN DOLLARS FOR IT ALONE
 *
 * The rollout's first step, rehearsed over the journey harness (tests/_journey:
 * in-memory PostgREST, a Stripe world whose webhooks are signed and delivered
 * to the real webhook route). MARKETPLACE_USD is set here, in this test's own
 * process, to this one store's id: nothing in production is switched on.
 *
 *   switch off       a marketplace link still charges the store's lei
 *   switch on        the website / OnePage / shared link charges lei, as before;
 *                    Explore's link charges dollars at the day's ECB rate,
 *                    recorded on the order (context, list price, rate)
 *   another store    not in the switch: its own currency everywhere
 *   stale or no rate refused before Stripe is asked for anything
 *   afterwards       receipt and sale emails, the order rows, a refund on the
 *                    dollar charge and its email, the seller's ledger, the
 *                    revenue chart in lei, and Payouts in the store's lei
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
const today = new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
/* Per euro, as the ECB publishes them: 49.00 lei is 49 / 4.97 * 1.08 = 10.648... dollars, 10.65 to the cent. */
const RATES = { USD: 1.08, RON: 4.97, EUR: 1 }
const LEI = 4900
const DOLLARS = Math.round((LEI / RATES.RON) * RATES.USD)

async function main() {
  delete process.env.MARKETPLACE_USD
  const j = await Journey.start()

  section("1. A store in lei, with payments on")
  const seller = await j.signUp("lei@example.com", { name: "Andrei Lei" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "andrei-samples" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Andrei Samples", supportEmail: "hello@andrei.example", defaultCountry: "RO" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "RO" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const sells = await j.call("PUT /api/store/currency", { as: seller, body: { country: "RO", currency: "RON", key: "lei-store-currency-1" } })
  check("the store sells in RON", sells.status === 200 && sells.json?.currency === "RON", { status: sells.status, body: sells.json })
  const packId = newProduct(j, creator.id, { type: "digital", title: "Drum Sample Pack", priceCents: LEI })
  j.db.insert("fx_rates", { as_of: today, rates: RATES }, {})

  const buy = (email: string, pricing?: Record<string, unknown>) =>
    j.call("POST /api/checkout/stripe-session", { body: { productId: packId, email, firstName: "Bea", lastName: "Buyer", agreedToTerms: true, paymentMethods: ["card"], ...(pricing ? { pricing } : {}) } })
  const intentOf = (r: { json?: any }) => {
    const id = (r.json?.paymentIntentId ?? r.json?.intentId ?? (typeof r.json?.clientSecret === "string" ? r.json.clientSecret.split("_secret")[0] : undefined)) as string | undefined
    return id ? j.world.intents.get(id) ?? null : null
  }
  const pay = async (pi: any) => {
    const paid = j.world.payIntent(pi.id)
    if (paid.charge) await j.webhook("charge.succeeded", paid.charge)
    await j.webhook("payment_intent.succeeded", paid.intent)
    await j.cron()
    return paid
  }

  section("2. The switch is off: nothing changes")
  const off = await buy("off@example.com", { context: "mp", fxAsOf: today })
  const offPi = intentOf(off)
  check("a marketplace link with the switch off charges the store's 49.00 lei", off.status === 200 && offPi?.currency === "ron" && offPi?.amount === LEI, { status: off.status, body: off.json, pi: offPi && [offPi.amount, offPi.currency] })
  check("  and writes no marketplace record on the payment", !offPi?.metadata?.pricing, offPi?.metadata?.pricing)

  process.env.MARKETPLACE_USD = creator.id as string

  section("3. Switch on for this store: the website, OnePage and a shared link keep lei")
  const site = await buy("site@example.com")
  const sitePi = intentOf(site)
  check("charged 49.00 in ron, as before", site.status === 200 && sitePi?.currency === "ron" && sitePi?.amount === LEI, { status: site.status, body: site.json, pi: sitePi && [sitePi.amount, sitePi.currency] })
  check("  under Stripe's 50 metadata keys", sitePi ? Object.keys(sitePi.metadata ?? {}).length <= 50 : false, sitePi && Object.keys(sitePi.metadata ?? {}).length)
  if (sitePi) await pay(sitePi)
  const siteOrder = j.rows("orders").find((o) => o.buyer_email === "site@example.com")
  check("the order is in ron, 49.00", siteOrder?.currency === "ron" && siteOrder?.amount_cents === LEI, siteOrder && [siteOrder.currency, siteOrder.amount_cents])
  const siteMail = j.net.to("site@example.com").find((m) => /receipt/i.test(m.subject))
  check("the buyer's receipt says 49.00 in lei, never $", !!siteMail && /49\.00/.test(words(siteMail.html)) && /RON|lei/.test(words(siteMail.html)) && !/\$\s?\d/.test(words(siteMail.html)), siteMail ? words(siteMail.html).slice(0, 500) : j.net.to("site@example.com").map((m) => m.subject))

  section("4. Bought from Explore: dollars at the day's rate")
  const mp = await buy("mp@example.com", { context: "mp", fxAsOf: today })
  const mpPi = intentOf(mp)
  check(`charged ${(DOLLARS / 100).toFixed(2)} in usd (49.00 lei at ${today}'s ECB rate, to the cent)`, mp.status === 200 && mpPi?.currency === "usd" && mpPi?.amount === DOLLARS, { status: mp.status, body: mp.json, pi: mpPi && [mpPi.amount, mpPi.currency] })
  check("  to the store's account, with Storelib's fee", mpPi?.transfer_data?.destination === acct && (mpPi?.application_fee_amount ?? 0) > 0, mpPi && { dest: mpPi.transfer_data, fee: mpPi.application_fee_amount })
  check("  the payment carries how the price was made, in one key", typeof mpPi?.metadata?.pricing === "string" && new RegExp(`^marketplace\\|ron\\|${LEI}\\|converted\\|${today}\\|`).test(mpPi.metadata.pricing) && Object.keys(mpPi.metadata).length <= 50, mpPi?.metadata?.pricing)
  if (mpPi) await pay(mpPi)
  const mpOrder = j.rows("orders").find((o) => o.buyer_email === "mp@example.com")
  check("the order is in usd, for exactly what was charged", mpOrder?.currency === "usd" && mpOrder?.amount_cents === DOLLARS, mpOrder && [mpOrder.currency, mpOrder.amount_cents])
  check("  and records the store's own price, the source and the rate day", mpOrder?.pricing_context === "marketplace" && mpOrder?.list_currency === "ron" && mpOrder?.list_amount_cents === LEI && mpOrder?.price_source === "converted" && String(mpOrder?.fx_as_of ?? "").slice(0, 10) === today && Number(mpOrder?.fx_rate) > 0, mpOrder && { ctx: mpOrder.pricing_context, list: [mpOrder.list_currency, mpOrder.list_amount_cents], src: mpOrder.price_source, day: mpOrder.fx_as_of, rate: mpOrder.fx_rate })
  const usd = `$${(DOLLARS / 100).toFixed(2)}`
  const mpMail = j.net.to("mp@example.com").find((m) => /receipt/i.test(m.subject))
  check(`the buyer's receipt says ${usd}`, !!mpMail && words(mpMail.html).includes(usd) && !/lei|RON/.test(words(mpMail.html)), mpMail ? words(mpMail.html).slice(0, 500) : j.net.to("mp@example.com").map((m) => m.subject))
  /* Sent to the store's own email (Settings › Store details), where sale emails go. */
  const saleMail = j.net.to("hello@andrei.example").filter((m) => /sold|sale/i.test(m.subject))
  check(`the seller's sale emails: 49.00 lei for the website sale, ${usd} for the Explore one`, saleMail.some((m) => /RON 49\.00|49\.00 lei/.test(m.subject) && !/\$/.test(m.subject)) && saleMail.some((m) => m.subject.includes(usd)), saleMail.map((m) => m.subject))
  const sales = j.rows("ledger_events").filter((e) => e.creator_id === creator.id && e.event_type === "sale")
  const siteSale = sales.find((e) => e.order_id === siteOrder?.id)
  const mpSale = sales.find((e) => e.order_id === mpOrder?.id)
  /* The wallet keeps one currency, the platform's (lib/payments/ledger-currency): the journey's is usd, as production's. */
  check(`the ledger: the lei sale turned into the wallet's dollars at the day's rate, saying it came from 49.00 lei`, siteSale?.currency === "usd" && Math.abs((siteSale?.amount_cents ?? 0) - DOLLARS) <= 1 && /from 49\.00[\s\u00a0]lei/.test(siteSale?.description ?? ""), sales.map((e) => [e.currency, e.amount_cents, e.description]))
  check(`  the dollar sale as paid, ${usd}, nothing converted`, mpSale?.currency === "usd" && mpSale?.amount_cents === DOLLARS && !/from/.test(mpSale?.description ?? ""), mpSale && [mpSale.currency, mpSale.amount_cents, mpSale.description])

  section("4b. The seller's numbers before any refund, in lei")
  const chart = await j.call("GET /api/stripe/revenue-chart?timeframe=last_7&tz=UTC", { as: seller })
  const back = Math.round((DOLLARS / RATES.USD) * RATES.RON)
  check("the revenue chart is in ron, with nothing left unconverted", chart.status === 200 && chart.json?.currency === "ron" && (chart.json?.unconverted ?? 0) === 0, chart.json && { currency: chart.json.currency, total: chart.json.total, gross: chart.json.totalGross, unconverted: chart.json.unconverted })
  check(`  the dollar sale counted back in lei at its day's rate (49.00 + ${(back / 100).toFixed(2)})`, Math.abs((chart.json?.totalGross ?? 0) - (LEI + back)) <= 2, { gross: chart.json?.totalGross, expected: LEI + back })
  const payouts = await j.call("GET /api/stripe/payouts", { as: seller })
  check(`Payouts answers, its yearly card total in dollars for the tax form: both sales, 2 x ${usd}`, payouts.status === 200 && Math.abs((payouts.json?.taxData?.currentYear?.grossCents ?? 0) - 2 * DOLLARS) <= 2, payouts.json && { status: payouts.status, tax: payouts.json.taxData?.currentYear })

  section("5. Never a guessed price")
  const before = j.world.intents.size
  const stale = await buy("stale@example.com", { context: "mp", fxAsOf: daysAgo(9) })
  check("a page priced at a rate that went stale is asked to refresh (409), and Stripe is not called", stale.status === 409 && stale.json?.code === "price_changed" && j.world.intents.size === before, { status: stale.status, body: stale.json })
  j.db.delete("fx_rates", [{ path: "as_of", op: "eq", value: today, not: false } as any])
  const none = await buy("none@example.com", { context: "mp", fxAsOf: today })
  check("with no fresh rate the purchase pauses (503), never charged in lei instead", none.status === 503 && none.json?.code === "rates_paused" && j.world.intents.size === before, { status: none.status, body: none.json })
  const lei = await buy("still-lei@example.com")
  check("  while the website's own checkout still sells in lei", lei.status === 200 && intentOf(lei)?.currency === "ron", { status: lei.status, pi: intentOf(lei) && [intentOf(lei)!.amount, intentOf(lei)!.currency] })
  j.db.insert("fx_rates", { as_of: today, rates: RATES }, {})

  section("6. Another store, not in the switch")
  const other = await j.signUp("other@example.com", { name: "Olga Other" })
  await j.call("POST /api/onboarding/finalize", { as: other, body: { role: "creator", creatorSlug: "olga-shop" } })
  const otherCreator = j.rows("creators").find((c) => c.slug === "olga-shop")!
  await j.call("POST /api/payments/start", { as: other, body: { agree: true, kind: "individual", country: "RO" } })
  const acct2 = j.rows("creators").find((c) => c.id === otherCreator.id)!.stripe_account_id as string
  j.world.activate(acct2)
  await j.webhook("account.updated", j.world.account(acct2), { connect: true, account: acct2 })
  await j.call("PUT /api/store/currency", { as: other, body: { country: "RO", currency: "RON", key: "olga-currency-1" } })
  const otherPack = newProduct(j, otherCreator.id as string, { type: "digital", title: "Olga Pack", priceCents: 2500 })
  const o = await j.call("POST /api/checkout/stripe-session", { body: { productId: otherPack, email: "o@example.com", firstName: "O", lastName: "B", agreedToTerms: true, paymentMethods: ["card"], pricing: { context: "mp", fxAsOf: today } } })
  check("its Explore link still charges its own 25.00 lei", o.status === 200 && intentOf(o)?.currency === "ron" && intentOf(o)?.amount === 2500, { status: o.status, body: o.json, pi: intentOf(o) && [intentOf(o)!.amount, intentOf(o)!.currency] })

  section("7. A refund on the dollar charge")
  const charge = [...j.world.charges.values()].find((c: any) => c.payment_intent === mpPi?.id) as any
  const refund = await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: mpOrder?.id, amount: 5, reason: "requested_by_customer" } })
  if (charge) await j.webhook("charge.refunded", j.world.charges.get(charge.id)!)
  const refundCall = j.world.calls.filter((c) => c.method === "refunds.create").pop()?.args[0] as any
  check("5.00 goes back to Stripe on the usd charge, once", refund.status === 200 && refundCall?.amount === 500 && charge?.currency === "usd", { refund: refund.json, call: refundCall, currency: charge?.currency })
  await j.cron()
  const refundMail = j.net.to("mp@example.com").find((m) => /refund/i.test(m.subject))
  check("the refund email says $5.00, never lei", !!refundMail && /\$5\.00/.test(words(refundMail.html)) && !/lei|RON/.test(words(refundMail.html)), refundMail ? words(refundMail.html).slice(0, 400) : j.net.to("mp@example.com").map((m) => m.subject))
  const after = j.rows("orders").find((o) => o.id === mpOrder?.id)
  check("the order keeps usd and notes 5.00 refunded", after?.currency === "usd" && after?.refund_amount_cents === 500, after && [after.currency, after.refund_amount_cents, after.status])

  section("8. After the refund, in lei")
  const chart2 = await j.call("GET /api/stripe/revenue-chart?timeframe=last_7&tz=UTC", { as: seller })
  const refundLei = Math.round((500 / RATES.USD) * RATES.RON)
  check(`the $5.00 refund is counted in lei at its day's rate (${(refundLei / 100).toFixed(2)})`, chart2.status === 200 && chart2.json?.currency === "ron" && Math.abs((chart2.json?.totalRefunds ?? 0) - refundLei) <= 2, chart2.json && { refunds: chart2.json.totalRefunds, expected: refundLei })
  /* A part refund leaves the sale standing: its gross still counts, only the refunded part comes off (lineMoney). The chart used to drop the sale. */
  check("  the partly refunded sale still counts in gross: 49.00 + its lei, never dropped", Math.abs((chart2.json?.totalGross ?? 0) - (LEI + back)) <= 2, { gross: chart2.json?.totalGross, expected: LEI + back })
  check("  and the seller's net falls only by the refunded share of what they were paid", (chart2.json?.total ?? 0) > 0 && (chart2.json?.total ?? 0) < (chart.json?.total ?? 0) && (chart.json?.total ?? 0) - (chart2.json?.total ?? 0) < refundLei, { before: chart.json?.total, after: chart2.json?.total, refundLei })
  const refundLedger = j.rows("ledger_events").find((e) => e.event_type === "refund" && e.order_id === mpOrder?.id)
  check("the refund is on the ledger as paid back: $5.00", refundLedger?.currency === "usd" && refundLedger?.amount_cents === 500, refundLedger && [refundLedger.currency, refundLedger.amount_cents, refundLedger.description])

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  /* The one 503 asked for on purpose: the purchase paused with no fresh rate. */
  const unexpected = j.serverErrors.filter((e: any) => !(e.status === 503 && e.body?.code === "rates_paused"))
  check("no route answered with a server error (the paused purchase's 503 aside)", unexpected.length === 0, unexpected)
  delete process.env.MARKETPLACE_USD

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
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
