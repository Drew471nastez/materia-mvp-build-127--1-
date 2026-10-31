/**
 * COMMERCE RELIABILITY: MONEY PATHS UNDER A FAILING STRIPE OR DATABASE
 *
 * Over the journey harness (tests/_journey: the real route handlers, an
 * in-memory PostgREST, a Stripe world). Nothing here reaches Stripe: each
 * failure is the fake's, installed for one call and taken off again.
 *
 *   1  a confirm that failed is not "nothing was charged" (HIGH-1): the
 *      intent is read again, its real status answered, "unknown" when Stripe
 *      still cannot say, and the same intent confirmed again charges once
 *   2  a payout's wallet step that failed answers 500 and leaves the event
 *      open, so Stripe sends it again, and the replay posts once (HIGH-2)
 *   3  a library entry whose write failed is a failed follow-up, and the
 *      sweep writes it once (MEDIUM-3)
 *   4  a webhook's database error answers 500 rather than "nothing to do",
 *      and an invoice that arrives before its subscription row is kept for
 *      the creator its customer names (MEDIUM-6)
 *   5  a Connect PermissionError releases nobody unless the platform key
 *      itself passes a bounded check (MEDIUM-7)
 *   6  the payouts page: one read for both lists, kept half a minute per
 *      person, and a part Stripe did not give is "unavailable", never an
 *      empty list (MEDIUM-4/5)
 *   7  the plan sync reads every page of a customer's subscriptions (LOW-10)
 *   8  a database call that never answers ends at the shared client's
 *      deadline, so it cannot hold a Stripe webhook (database audit F1)
 *   9  the Orders page's missed-refund check runs once per creator per six
 *      hours and applies refunds through refund-sync (database audit F8)
 *  10  the draft earnings summary reads every order of the year, a page at
 *      a time
 *  11  the payouts page and route read their sales list and figures past
 *      1,000 orders
 */
import "./_journey/env"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import Stripe from "stripe"
import { Journey } from "./_journey/harness"
import { instantOrderBody } from "../lib/onepage/product-block"
import { CHECKING_MESSAGE, rereadIntent, settledFrom } from "../lib/checkout/confirm-outcome"
import { confirmOutcomeUnknown, intentKey, nextPress, paidIntentInError, stripeJsOutcomeUnknown } from "../lib/checkout/pay-retry"
import { accountGoneFromPlatform, resetPlatformKeyCheck } from "../lib/payments/stripe/connect"
import { forgetPayoutsRead, payoutsReadKey, readPayoutsKept } from "../lib/payments/payouts-read-cache"
import { planCreatorSync, stripeListForSync, SYNC_MAX_PAGES } from "../lib/billing/subscription-sync"
import { SUPABASE_DEADLINE_MS } from "../lib/net/deadline"
import { REFUND_CHECK_EVERY_MS, refundCheckDue } from "../lib/orders/refund-check"
import { allPages, PAGE_ROWS } from "../lib/payments/paged-read"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
const NOTHING = /nothing was charged/i
/* The payment routes are rate limited per address: each call here comes from its own (documentation range) address. */
let ipSeq = 0
const fromNewAddress = () => ({ "x-forwarded-for": `198.51.100.${++ipSeq}` })

type Obj = Record<string, any>

async function main() {
  const j = await Journey.start()
  const s = j.stripe as any

  section("0. A store with payments on and a download")
  const seller = await j.signUp("maker@example.com", { name: "Mara Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mara" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mara Sounds", supportEmail: "hello@mara.example", defaultCountry: "US" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const pack = newProduct(j, creator.id as string, { type: "digital", title: "Tech House Pack", priceCents: 2000 })

  /* ── 1. HIGH-1 ─────────────────────────────────────────────────────── */
  section("1. A confirm that failed is not \"nothing was charged\" (HIGH-1)")
  const realRetrieve = s.paymentIntents.retrieve
  const connErr = () => new Stripe.errors.StripeConnectionError({ message: "An error occurred with our connection to Stripe. Request was retried 2 times.", type: "api_error" } as any)
  const cardErr = () => new Stripe.errors.StripeCardError({ message: "Your card was declined.", type: "card_error", code: "card_declined" } as any)
  const unexpected = (pi: Obj) =>
    Object.assign(new Stripe.errors.StripeInvalidRequestError({ message: "This PaymentIntent's payment_method could not be updated because it has a status of succeeded.", type: "invalid_request_error", code: "payment_intent_unexpected_state" } as any), { payment_intent: pi })
  /* Stripe's own rule: one PaymentIntent is charged once. A confirm of a paid one is refused with "unexpected state". */
  let confirmMode: "ok" | "charge-then-drop" | "drop" | "decline" = "ok"
  let charges = 0
  s.paymentIntents.confirm = async (pid: string) => {
    const pi = j.world.intents.get(pid)!
    if (pi.status === "succeeded") throw unexpected(pi)
    if (confirmMode === "decline") throw cardErr()
    if (confirmMode === "drop") throw connErr()
    j.world.payIntent(pid)
    charges++
    if (confirmMode === "charge-then-drop") throw connErr()
    return { ...pi }
  }
  const start = async (email: string) => {
    const started = await j.call("POST /api/checkout/stripe-session", { body: instantOrderBody({ productId: pack, email, name: "Bea Buyer" }, false) })
    return { id: started.json?.paymentIntentId as string, secret: started.json?.clientSecret as string, status: started.status }
  }
  const confirmPm = (pi: { id: string; secret: string }) => j.call("POST /api/checkout/confirm-with-pm", { headers: fromNewAddress(), body: { paymentIntentId: pi.id, clientSecret: pi.secret, paymentMethodId: "pm_cardvisa" } })

  const a = await start("ann@example.com")
  check("a checkout PaymentIntent to confirm", a.status === 200 && /^pi_/.test(a.id), a)
  confirmMode = "charge-then-drop"
  const r1 = await confirmPm(a)
  check("Stripe charged, then the connection dropped: answered paid (200 succeeded), read again", r1.status === 200 && r1.json?.status === "succeeded", { status: r1.status, body: r1.json })
  check("  and never \"nothing was charged\"", !NOTHING.test(JSON.stringify(r1.json)), r1.json)

  const b = await start("bob@example.com")
  charges = 0
  confirmMode = "charge-then-drop"
  s.paymentIntents.retrieve = async (pid: string, ...rest: unknown[]) => {
    /* The first read (the secret check) answers; the second look after the failed confirm does not. */
    if (j.world.intents.get(pid)?.status === "succeeded") throw connErr()
    return realRetrieve(pid, ...rest)
  }
  const r2 = await confirmPm(b)
  s.paymentIntents.retrieve = realRetrieve
  check("Stripe charged and could not be asked again: 503 { status: \"unknown\" }", r2.status === 503 && r2.json?.status === "unknown", { status: r2.status, body: r2.json })
  check("  with the checking words, never \"nothing was charged\"", r2.json?.error === CHECKING_MESSAGE && !NOTHING.test(JSON.stringify(r2.json)), r2.json)
  confirmMode = "ok"
  const r2b = await confirmPm(b)
  check("Pay again with the SAME intent (what the page now does): answered paid", r2b.status === 200 && r2b.json?.status === "succeeded", { status: r2b.status, body: r2b.json })
  check("  and the buyer was charged once, not twice", charges === 1, { charges })

  const c = await start("cal@example.com")
  confirmMode = "drop"
  const r3 = await confirmPm(c)
  check("a dropped confirm over an intent still requiring a payment method: unknown, not \"nothing was charged\" (a confirm may still be running)", r3.status === 503 && r3.json?.status === "unknown" && !NOTHING.test(JSON.stringify(r3.json)), { status: r3.status, body: r3.json })

  const d = await start("dee@example.com")
  confirmMode = "decline"
  const r4 = await confirmPm(d)
  check("a declined card keeps the bank's words (400)", r4.status === 400 && r4.json?.error === "Your card was declined.", { status: r4.status, body: r4.json })
  confirmMode = "ok"

  const e1 = await start("eve@example.com")
  const piE = j.world.intents.get(e1.id)!
  s.paymentIntents.confirm = async () => {
    Object.assign(piE, { status: "requires_action", next_action: { type: "redirect_to_url", redirect_to_url: { url: "https://hooks.stripe.com/3ds/x" } } })
    throw new Stripe.errors.StripeAPIError({ message: "Something went wrong on Stripe's end." } as any)
  }
  const r5 = await confirmPm(e1)
  check("a 5xx over an intent that now needs the bank's page: the page is sent there", r5.status === 200 && r5.json?.status === "requires_action" && r5.json?.actionUrl === "https://hooks.stripe.com/3ds/x", { status: r5.status, body: r5.json })

  section("1b. A membership's confirm in the app (HIGH-1)")
  const memberSecret = "pi_member1_secret_abc"
  const memberPi: Obj = { id: "pi_member1", object: "payment_intent", status: "requires_payment_method", client_secret: memberSecret }
  const memberSub = (): Obj => ({ id: "sub_member1", object: "subscription", status: "incomplete", customer: "cus_m", metadata: { kind: "membership" }, pending_setup_intent: null, latest_invoice: { id: "in_m", status: "open", confirmation_secret: { client_secret: memberSecret } } })
  const realSubRetrieve = s.subscriptions.retrieve
  s.subscriptions.retrieve = async () => memberSub()
  s.paymentIntents.retrieve = async (pid: string, ...rest: unknown[]) => (pid === "pi_member1" ? { ...memberPi } : realRetrieve(pid, ...rest))
  s.paymentIntents.confirm = async () => {
    throw connErr()
  }
  const m1 = await j.call("POST /api/memberships/confirm", { headers: fromNewAddress(), body: { subscriptionId: "sub_member1", clientSecret: memberSecret, paymentMethodId: "pm_cardvisa" } })
  check("membership confirm dropped, intent not settled: 503 unknown, never \"nothing was charged\"", m1.status === 503 && m1.json?.status === "unknown" && !NOTHING.test(JSON.stringify(m1.json)), { status: m1.status, body: m1.json })
  s.paymentIntents.confirm = async () => {
    throw cardErr()
  }
  const m2 = await j.call("POST /api/memberships/confirm", { headers: fromNewAddress(), body: { subscriptionId: "sub_member1", clientSecret: memberSecret, paymentMethodId: "pm_cardvisa" } })
  check("membership card declined: 402 with the bank's words", m2.status === 402 && m2.json?.error === "Your card was declined.", { status: m2.status, body: m2.json })
  s.paymentIntents.confirm = async () => {
    Object.assign(memberPi, { status: "requires_action", next_action: { redirect_to_url: { url: "https://hooks.stripe.com/3ds/m" } } })
    throw connErr()
  }
  const m3 = await j.call("POST /api/memberships/confirm", { headers: fromNewAddress(), body: { subscriptionId: "sub_member1", clientSecret: memberSecret, paymentMethodId: "pm_cardvisa" } })
  check("membership confirm dropped over an intent needing the bank: its page", m3.status === 200 && m3.json?.status === "requires_action" && m3.json?.actionUrl === "https://hooks.stripe.com/3ds/m", { status: m3.status, body: m3.json })
  s.subscriptions.retrieve = realSubRetrieve
  s.paymentIntents.retrieve = realRetrieve
  delete s.paymentIntents.confirm
  /* The two 503s above were the point of the test, not faults. */
  j.serverErrors.splice(0, j.serverErrors.length, ...j.serverErrors.filter((x) => !/confirm-with-pm|memberships\/confirm/.test(x.route)))

  section("1c. The pages keep the intent while the answer is not sure (HIGH-1)")
  check("no answer, a 5xx, or \"unknown\" is not a sure answer", confirmOutcomeUnknown(null) && confirmOutcomeUnknown({ ok: false, status: 503, data: {} }) && confirmOutcomeUnknown({ ok: true, status: 200, data: { status: "unknown" } }))
  check("  a decline (4xx) and a success are", !confirmOutcomeUnknown({ ok: false, status: 400, data: { error: "Your card was declined." } }) && !confirmOutcomeUnknown({ ok: true, status: 200, data: { status: "succeeded" } }))
  const k1 = intentKey({ productId: "p", total: 2000, variantId: null })
  check("the same order reuses the held intent, another order checks it first, none held makes one", nextPress({ intent: 1, key: k1 }, k1) === "reuse" && nextPress({ intent: 1, key: k1 }, intentKey({ productId: "p", total: 2500, variantId: null })) === "check" && nextPress(null, k1) === "create")
  check("Stripe.js: connection and Stripe errors are not sure, a card error is", stripeJsOutcomeUnknown({ type: "api_connection_error" }) && stripeJsOutcomeUnknown({ type: "api_error" }) && stripeJsOutcomeUnknown({ type: "invalid_request_error", code: "payment_intent_unexpected_state" }) && !stripeJsOutcomeUnknown({ type: "card_error" }) && !stripeJsOutcomeUnknown({ type: "validation_error" }))
  check("  \"unexpected state\" over a succeeded intent reads as paid", paidIntentInError({ payment_intent: { id: "pi_1", status: "succeeded" } })?.id === "pi_1" && paidIntentInError({ payment_intent: { id: "pi_1", status: "requires_payment_method" } }) === null)
  check("the second look is bounded: a read that never answers is null", (await rereadIntent(() => new Promise(() => {}), 30)) === null)
  check("  only paid, the bank's page and cancelled are sure; anything else is unknown", settledFrom({ status: "requires_payment_method" }).kind === "unknown" && settledFrom({ status: "processing" }).kind === "paid" && settledFrom({ status: "canceled" }).kind === "canceled" && settledFrom(null).kind === "unknown")
  const client = code("app/checkout/checkout-client.tsx")
  const native = client.slice(client.indexOf("const payNative"), client.indexOf("const takeFree"))
  check("the app's Pay confirms a held intent again rather than making a new one", /nextPress\(heldIntent\.current/.test(native) && /press === "reuse" && heldIntent\.current \? heldIntent\.current\.intent : await createIntent\(\)/.test(native), native.slice(0, 300))
  check("  and a 5xx or \"unknown\" keeps the intent (not only a thrown request)", /confirmOutcomeUnknown\(confirmed\)/.test(native) && /heldIntent\.current = \{ intent, key \}/.test(native))
  const pay = code("app/checkout/parts/stripe-pay.tsx")
  check("the web card form and wallets confirm a held intent again", (pay.match(/await intentFor\(/g) ?? []).length === 2 && /settle\(intent, /.test(pay) && /stripeJsOutcomeUnknown\(error\)\) return checkoutMsg\(CHECKING_MESSAGE\)/.test(pay))
  const member = code("app/checkout/membership-checkout.tsx")
  check("the membership's Join in the app confirms a held subscription again", /held && held\.key === key/.test(member) && /unknown\?: boolean \}\)\.unknown\) heldJoin\.current = null/.test(member))
  for (const route of ["app/api/checkout/confirm-with-pm/route.ts", "app/api/memberships/confirm/route.ts"]) {
    const src = code(route)
    const katch = src.slice(src.lastIndexOf("} catch (err) {"))
    check(`${route}: the confirm's catch says "nothing was charged" only for a cancelled intent`, !/Nothing was charged\."/.test(katch.replace(/This payment was cancelled\. Nothing was charged\.[^"]*"/g, "")), katch.slice(0, 400))
  }

  /* ── 2. HIGH-2 ─────────────────────────────────────────────────────── */
  section("2. A payout's wallet step that failed is retried, not closed (HIGH-2)")
  const creatorId = creator.id as string
  const wallet = () => j.rows("seller_ledger").find((r) => r.creator_id === creatorId)
  const resetWallet = (inTransit: number) => {
    const rows = j.rows("seller_ledger")
    const at = rows.findIndex((r) => r.creator_id === creatorId)
    const row = { creator_id: creatorId, pending_amount: 0, available_amount: 0, in_transit_amount: inTransit, negative_balance: 0, lifetime_earnings: 0, lifetime_fees: 0, lifetime_refunds: 0, lifetime_paid_out: 0 }
    if (at >= 0) rows[at] = { ...rows[at], ...row }
    else rows.push(row)
  }
  const cashedOut = (payoutId: string, amount: number) => j.db.insert("ledger_events", { creator_id: creatorId, event_type: "cashout_initiated", amount_cents: amount, net_seller_cents: amount, currency: "usd", stripe_payout_id: payoutId, description: "Cash out" }, {})
  const payoutObj = (id: string, status: string, amount = 5000, currency = "usd") => ({ id, object: "payout", amount, currency, status, arrival_date: Math.floor(Date.now() / 1000), created: Math.floor(Date.now() / 1000), description: null, destination: "ba_test", method: "standard" })
  const eventRow = (id: string) => j.rows("stripe_webhook_events").find((r) => r.event_id === id)
  const ledgerLines = (payoutId: string, type: string) => j.rows("ledger_events").filter((r) => r.stripe_payout_id === payoutId && r.event_type === type).length

  resetWallet(5000)
  cashedOut("po_fail1", 5000)
  j.db.failNext("ledger_post", { method: "POST" })
  const f1 = await j.webhook("payout.failed", payoutObj("po_fail1", "failed"), { connect: true, account: acct, id: "evt_payoutfail1" })
  check("Connect payout.failed whose ledger write failed: 500, so Stripe sends it again", f1.status === 500, { status: f1.status, body: f1.json })
  check("  the event is not closed (no processed_at, its error kept)", !eventRow("evt_payoutfail1")?.processed_at && !!eventRow("evt_payoutfail1")?.last_error, eventRow("evt_payoutfail1"))
  check("  and the money is still in transit (nothing half written)", wallet()?.in_transit_amount === 5000 && wallet()?.available_amount === 0, wallet())
  const f2 = await j.webhook("payout.failed", payoutObj("po_fail1", "failed"), { connect: true, account: acct, id: "evt_payoutfail1" })
  check("Stripe's next delivery: 200, the money back in available", f2.status === 200 && wallet()?.available_amount === 5000 && wallet()?.in_transit_amount === 0, { status: f2.status, wallet: wallet() })
  check("  closed now", !!eventRow("evt_payoutfail1")?.processed_at, eventRow("evt_payoutfail1"))
  const f3 = await j.webhook("payout.failed", payoutObj("po_fail1", "failed"), { connect: true, account: acct, id: "evt_payoutfail2" })
  check("the same payout's failure again (another event id): posted once, never twice", f3.status === 200 && ledgerLines("po_fail1", "cashout_failed") === 1 && wallet()?.available_amount === 5000, { lines: ledgerLines("po_fail1", "cashout_failed"), wallet: wallet() })

  j.db.failNext("seller_ledger", { method: "GET" })
  cashedOut("po_paid1", 2000)
  resetWallet(2000)
  const p1 = await j.webhook("payout.paid", payoutObj("po_paid1", "paid", 2000), { connect: true, account: acct, id: "evt_payoutpaid1" })
  check("Connect payout.paid whose wallet read failed: 500, not skipped as \"no wallet\"", p1.status === 500 && wallet()?.in_transit_amount === 2000, { status: p1.status, wallet: wallet() })
  const p2 = await j.webhook("payout.paid", payoutObj("po_paid1", "paid", 2000), { connect: true, account: acct, id: "evt_payoutpaid1" })
  check("  the next delivery moves it out of transit, once", p2.status === 200 && wallet()?.in_transit_amount === 0 && wallet()?.lifetime_paid_out === 2000 && ledgerLines("po_paid1", "cashout_completed") === 1, { status: p2.status, wallet: wallet() })

  j.db.failNext("creators", { method: "GET" })
  const c1 = await j.webhook("payout.paid", payoutObj("po_paid2", "paid", 100), { connect: true, account: acct, id: "evt_payoutcreator1" })
  check("Connect: a creator read that failed is 500, not \"no creator\"", c1.status === 500 && !eventRow("evt_payoutcreator1")?.processed_at, { status: c1.status })

  /* The platform destination (a Connect destination pointed at /api/stripe/webhook): the same rules. */
  const platformDeliver = (type: string, obj: Obj, id: string) => {
    const signed = j.world.webhook(j.stripe, type, obj, { secret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET!, account: acct, id })
    return j.call("POST /api/stripe/webhook", { raw: signed.body, headers: signed.headers })
  }
  resetWallet(3000)
  cashedOut("po_fail3", 3000)
  j.db.failNext("ledger_post", { method: "POST" })
  const g1 = await platformDeliver("payout.failed", payoutObj("po_fail3", "failed", 3000), "evt_platformfail1")
  check("platform route: payout.failed whose ledger write failed is 500, the event left open", g1.status === 500 && !eventRow("evt_platformfail1")?.processed_at && wallet()?.in_transit_amount === 3000, { status: g1.status, wallet: wallet() })
  const g2 = await platformDeliver("payout.failed", payoutObj("po_fail3", "failed", 3000), "evt_platformfail1")
  check("  its next delivery returns the money once", g2.status === 200 && wallet()?.available_amount === 3000 && ledgerLines("po_fail3", "cashout_failed") === 1, { status: g2.status, wallet: wallet() })
  j.db.failNext("creators", { method: "GET" })
  const g3 = await platformDeliver("payout.paid", payoutObj("po_paid9", "paid", 100), "evt_platformcreator1")
  check("platform route: a creator read that failed is 500", g3.status === 500, { status: g3.status })
  const g4 = await platformDeliver("payout.paid", payoutObj("po_eur1", "paid", 700, "xts"), "evt_platformcurrency1")
  check("platform route: a payout no rate converts is still left alone and closed (200), as before", g4.status === 200 && !!eventRow("evt_platformcurrency1")?.processed_at, { status: g4.status })
  j.serverErrors.splice(0, j.serverErrors.length, ...j.serverErrors.filter((x) => !/\/api\/stripe\/webhook/.test(x.route) || x.status !== 500))

  /* ── 3. MEDIUM-3 ───────────────────────────────────────────────────── */
  section("3. A library entry that could not be written is retried by the sweep (MEDIUM-3)")
  const buyer = await j.signUp("lib@example.com", { name: "Lia Library" })
  const bought = await j.call("POST /api/checkout/stripe-session", { as: buyer, headers: fromNewAddress(), body: instantOrderBody({ productId: pack, email: "lib@example.com", name: "Lia Library" }, false) })
  check("a signed in buyer's PaymentIntent", bought.status === 200 && /^pi_/.test(String(bought.json?.paymentIntentId)), { status: bought.status, body: bought.json })
  j.world.payIntent(bought.json?.paymentIntentId)
  j.db.failNext("entitlements", { method: "POST" })
  const paidPage = await j.call("POST /api/checkout/confirm-payment", { as: buyer, headers: fromNewAddress(), body: { paymentIntentId: bought.json?.paymentIntentId, clientSecret: bought.json?.clientSecret } })
  const libOrder = j.rows("orders").find((o) => o.stripe_payment_intent_id === bought.json?.paymentIntentId)
  const owns = () => j.rows("entitlements").filter((e) => e.buyer_id === buyer.id && e.product_id === pack).length
  const step = (name: string) => j.rows("order_followups").find((r) => r.order_id === libOrder?.id && r.step === name)
  check("paid: the order and its receipt, as always", paidPage.status === 200 && !!libOrder && typeof paidPage.json?.receiptToken === "string", { status: paidPage.status, body: paidPage.json })
  check("  the library entry's write failed: no entry, and the step is recorded failed (not done)", owns() === 0 && step("entitlement")?.state === "failed", step("entitlement"))
  check("  the order is left unfinished for the sweep", step("begun")?.state !== "done", step("begun"))
  /* Past the in-flight window, as the ten minute sweep finds it. */
  const begun = step("begun")
  if (begun) begun.updated_at = new Date(Date.now() - 5 * 60_000).toISOString()
  await j.cron()
  check("the sweep wrote the entry, once, and recorded the step done", owns() === 1 && step("entitlement")?.state === "done", { owns: owns(), step: step("entitlement") })
  await j.cron()
  check("  a later sweep or retry adds no second entry", owns() === 1, { owns: owns() })

  /* ── 4. MEDIUM-6 ───────────────────────────────────────────────────── */
  section("4. Webhook database errors are not \"nothing to do\"; an early invoice is kept (MEDIUM-6)")
  const creatorRow = j.rows("creators").find((r) => r.id === creatorId)!
  creatorRow.stripe_customer_id = "cus_plancreator1"
  const planInvoice = (id: string, sub: string, over: Obj = {}) => ({ id, object: "invoice", customer: "cus_plancreator1", amount_paid: 2900, amount_due: 2900, currency: "usd", status: "paid", billing_reason: "subscription_cycle", invoice_pdf: null, hosted_invoice_url: null, period_start: 1_760_000_000, period_end: 1_762_600_000, attempt_count: 1, parent: { type: "subscription_details", subscription_details: { subscription: sub, metadata: {} } }, lines: { data: [] }, ...over })
  const invoiceRow = (id: string) => j.rows("invoices").find((r) => r.stripe_invoice_id === id)

  j.db.failNext("subscriptions", { method: "GET", times: 3 })
  const i1 = await j.webhook("invoice.paid", planInvoice("in_plan1", "sub_plan1"), { id: "evt_invoice1" })
  check("invoice.paid whose subscriptions read failed: 500 and left open, not \"No subscription found\"", i1.status === 500 && !eventRow("evt_invoice1")?.processed_at && !invoiceRow("in_plan1"), { status: i1.status, body: i1.json })
  j.db.faults.length = 0
  j.db.insert("subscriptions", { creator_id: creatorId, stripe_subscription_id: "sub_plan1", stripe_customer_id: "cus_plancreator1", plan_id: "growth", status: "active" }, {})
  const subRow = j.rows("subscriptions").find((r) => r.stripe_subscription_id === "sub_plan1")
  const i2 = await j.webhook("invoice.paid", planInvoice("in_plan1", "sub_plan1"), { id: "evt_invoice1" })
  check("  Stripe's next delivery writes the invoice against its subscription", i2.status === 200 && invoiceRow("in_plan1")?.creator_id === creatorId && invoiceRow("in_plan1")?.subscription_id === subRow?.id, { status: i2.status, row: invoiceRow("in_plan1") })

  const i3 = await j.webhook("invoice.paid", planInvoice("in_plan2", "sub_plan_new", { billing_reason: "subscription_create" }), { id: "evt_invoice2" })
  check("invoice.paid before the subscription row exists: kept for the creator the customer names (200, no link yet)", i3.status === 200 && invoiceRow("in_plan2")?.creator_id === creatorId && invoiceRow("in_plan2")?.subscription_id == null, { status: i3.status, row: invoiceRow("in_plan2") })
  const i4 = await j.webhook("invoice.paid", planInvoice("in_foreign1", "sub_foreign1", { customer: "cus_nobody" }), { id: "evt_invoice3" })
  check("an invoice no creator owns is still skipped (200, nothing written)", i4.status === 200 && !invoiceRow("in_foreign1"), { status: i4.status, body: i4.json })
  const i4b = await j.webhook("invoice.paid", planInvoice("in_member1", "sub_member9", { parent: { type: "subscription_details", subscription_details: { subscription: "sub_member9", metadata: { kind: "membership_x", creator_id: creatorId } } } }), { id: "evt_invoice4" })
  check("  a membership's invoice naming its seller is never written as the seller's plan invoice", i4b.status === 200 && !invoiceRow("in_member1"), { status: i4b.status, body: i4b.json })

  j.db.failNext("invoices", { method: "POST" })
  const i5 = await j.webhook("invoice.paid", planInvoice("in_plan3", "sub_plan1"), { id: "evt_invoice5" })
  check("an invoice write that failed: 500, so Stripe sends it again", i5.status === 500 && !eventRow("evt_invoice5")?.processed_at, { status: i5.status })
  const i6 = await j.webhook("invoice.paid", planInvoice("in_plan3", "sub_plan1"), { id: "evt_invoice5" })
  check("  and the next delivery writes it once", i6.status === 200 && j.rows("invoices").filter((r) => r.stripe_invoice_id === "in_plan3").length === 1, { status: i6.status })

  j.db.failNext("subscriptions", { method: "GET", times: 3 })
  const i7 = await j.webhook("invoice.payment_failed", planInvoice("in_plan4", "sub_plan1", { status: "open", amount_paid: 0 }), { id: "evt_invoicefail1" })
  j.db.faults.length = 0
  check("invoice.payment_failed whose subscriptions read failed: 500, not \"No subscription found\"", i7.status === 500 && !eventRow("evt_invoicefail1")?.processed_at, { status: i7.status, body: i7.json })

  j.db.failNext("creators", { method: "GET", times: 3 })
  const a1 = await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct, id: "evt_accountupdated1" })
  j.db.faults.length = 0
  check("account.updated whose creator read failed: 500 and left open (Connect flags not left stale)", a1.status === 500 && !eventRow("evt_accountupdated1")?.processed_at, { status: a1.status })
  const a2 = await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct, id: "evt_accountupdated1" })
  check("  the next delivery is handled", a2.status === 200 && !!eventRow("evt_accountupdated1")?.processed_at, { status: a2.status })
  j.serverErrors.splice(0, j.serverErrors.length, ...j.serverErrors.filter((x) => !/\/api\/stripe\/webhook/.test(x.route) || x.status !== 500))

  /* ── 5. MEDIUM-7 ───────────────────────────────────────────────────── */
  section("5. A PermissionError disconnects nobody unless the platform key itself works (MEDIUM-7)")
  const permErr = () => new Stripe.errors.StripePermissionError({ message: "The provided key does not have access to account 'acct_x' (or that account does not exist).", type: "invalid_request_error" } as any)
  let platformOk = false
  let probes = 0
  s.accounts.retrieveCurrent = async () => {
    probes++
    if (!platformOk) throw permErr()
    return { id: "acct_platform", object: "account" }
  }
  s.accounts.list = async () => {
    if (!platformOk) throw permErr()
    return { object: "list", data: [], has_more: false }
  }
  resetPlatformKeyCheck()
  check("platform key failing its own check: a PermissionError is NOT \"account gone\"", (await accountGoneFromPlatform(permErr())) === false)
  resetPlatformKeyCheck()
  platformOk = true
  check("platform key working: a PermissionError on one account is that account gone", (await accountGoneFromPlatform(permErr())) === true)
  const before = probes
  await accountGoneFromPlatform(permErr())
  check("  the platform's verdict is kept a minute (no probe per request)", probes === before, { probes, before })
  const missing = Object.assign(new Stripe.errors.StripeInvalidRequestError({ message: "No such account", type: "invalid_request_error", code: "resource_missing" } as any), { statusCode: 404 })
  resetPlatformKeyCheck()
  platformOk = false
  check("a missing account is still gone, without asking the platform", (await accountGoneFromPlatform(missing)) === true && probes === before)
  check("a timeout is never gone", (await accountGoneFromPlatform(connErr())) === false)
  resetPlatformKeyCheck()
  platformOk = true
  process.env.STRIPE_AUTO_RELEASE = "off"
  check("STRIPE_AUTO_RELEASE=off: a PermissionError releases nobody", (await accountGoneFromPlatform(permErr())) === false)
  delete process.env.STRIPE_AUTO_RELEASE

  /* Through checkout: Stripe refuses the destination, and the account read answers a PermissionError. */
  const realCreate = s.paymentIntents.create
  const realAcctRetrieve = s.accounts.retrieve
  s.paymentIntents.create = async () => {
    throw Object.assign(new Stripe.errors.StripeInvalidRequestError({ message: "No such destination: 'acct_x'", type: "invalid_request_error", param: "transfer_data[destination]" } as any), { param: "transfer_data[destination]" })
  }
  s.accounts.retrieve = async (id?: string, ...rest: unknown[]) => (id === acct ? Promise.reject(permErr()) : realAcctRetrieve(id, ...rest))
  resetPlatformKeyCheck()
  platformOk = false
  const gone1 = await j.call("POST /api/checkout/stripe-session", { headers: fromNewAddress(), body: instantOrderBody({ productId: pack, email: "kim@example.com", name: "Kim" }, false) })
  check("checkout during a platform-wide permission failure: the shop stays connected", j.rows("creators").find((r) => r.id === creatorId)?.stripe_account_id === acct && gone1.status !== 409, { status: gone1.status, body: gone1.json })
  resetPlatformKeyCheck()
  platformOk = true
  const gone2 = await j.call("POST /api/checkout/stripe-session", { headers: fromNewAddress(), body: instantOrderBody({ productId: pack, email: "kim@example.com", name: "Kim" }, false) })
  check("  with the platform key proven to work, that one account is released (409), as before", gone2.status === 409 && !j.rows("creators").find((r) => r.id === creatorId)?.stripe_account_id, { status: gone2.status, body: gone2.json })
  s.paymentIntents.create = realCreate
  s.accounts.retrieve = realAcctRetrieve
  delete s.accounts.retrieveCurrent
  delete s.accounts.list
  j.serverErrors.splice(0, j.serverErrors.length, ...j.serverErrors.filter((x) => !/stripe-session/.test(x.route)))
  const connectSrc = code("lib/payments/stripe/connect.ts")
  check("every automatic release on the payments page goes through the platform check", !/\baccountIsGone\((error|read\.error)\)/.test(connectSrc.replace(/export function accountIsGone[\s\S]*?\n\}/, "").replace(/if \(!accountIsGone\(error\)\) return false/, "")))
  for (const route of ["app/api/checkout/cart/route.ts", "app/api/checkout/site/route.ts", "app/api/checkout/stripe-session/route.ts"]) check(`${route} releases only through accountGoneFromPlatform`, /accountGoneFromPlatform\(/.test(code(route)) && !/accountIsGone\(/.test(code(route)))

  /* ── 6. MEDIUM-4 / MEDIUM-5 ────────────────────────────────────────── */
  section("6. Payouts: one read shared, kept half a minute per person, and \"unavailable\" is not \"nothing\" (MEDIUM-4/5)")
  /* Section 5 let the account go: connected again for the payouts page. */
  Object.assign(j.rows("creators").find((r) => r.id === creatorId)!, { stripe_account_id: acct, charges_enabled: true, payouts_enabled: true })
  forgetPayoutsRead(creatorId)
  const stripeReads = () => j.world.calls.filter((c) => ["payouts.list", "balance.retrieve", "accounts.retrieve", "balanceTransactions.list"].includes(c.method)).length
  const realPayoutsList = s.payouts.list
  s.payouts.list = async (...args: unknown[]) => {
    j.world.calls.push({ method: "payouts.list", args })
    return { object: "list", has_more: false, data: [{ id: "po_shown1", object: "payout", amount: 1200, currency: "usd", status: "paid", arrival_date: 1_761_000_000, created: 1_760_900_000, method: "standard", type: "bank_account", description: null, destination: null }] }
  }
  const r0 = stripeReads()
  const v1 = await j.call("GET /api/stripe/payouts", { as: seller })
  const afterFirst = stripeReads()
  check("the first read asks Stripe (four reads) and answers the list", v1.status === 200 && v1.json?.payouts?.[0]?.id === "po_shown1" && afterFirst - r0 === 4 && !v1.json?.unavailable, { status: v1.status, reads: afterFirst - r0, body: v1.json?.unavailable })
  const v2 = await j.call("GET /api/stripe/payouts", { as: seller })
  check("a second read within half a minute is the kept answer: no Stripe read", v2.status === 200 && v2.json?.cached === true && stripeReads() === afterFirst && v2.json?.payouts?.[0]?.id === "po_shown1", { reads: stripeReads() - afterFirst })
  const v3 = await j.call("GET /api/stripe/payouts?fresh=1", { as: seller })
  check("a user action (?fresh=1) reads Stripe again", v3.status === 200 && !v3.json?.cached && stripeReads() === afterFirst + 4, { reads: stripeReads() - afterFirst })
  const other = await j.signUp("stranger@example.com")
  const v4 = await j.call("GET /api/stripe/payouts", { as: other })
  check("another person is never handed this store's kept answer", v4.status !== 200 || !(v4.json?.payouts ?? []).some((p: Obj) => p.id === "po_shown1"), { status: v4.status, body: v4.json })
  let calls = 0
  const keyA = payoutsReadKey("user-a", "creator-1", "acct_1")
  const keyB = payoutsReadKey("user-b", "creator-1", "acct_1")
  await readPayoutsKept(keyA, async () => ({ who: "a", n: ++calls }))
  const forB = await readPayoutsKept(keyB, async () => ({ who: "b", n: ++calls }))
  check("  the key is per person: two people of one store each get their own read", forB.body.who === "b" && !forB.cached && calls === 2)
  const slow = () => new Promise<Record<string, unknown>>((resolve) => setTimeout(() => resolve({ n: ++calls }), 30))
  forgetPayoutsRead("creator-1")
  const [x1, x2] = await Promise.all([readPayoutsKept(keyA, slow, { fresh: true }), readPayoutsKept(keyA, slow, { fresh: true })])
  check("  two reads at once share one", x1.body.n === x2.body.n && calls === 3, { calls })

  forgetPayoutsRead(creatorId)
  s.payouts.list = async () => {
    throw connErr()
  }
  const u1 = await j.call("GET /api/stripe/payouts", { as: seller })
  check("Stripe's payouts read failed: the answer says unavailable.payouts, not an empty list as fact", u1.status === 200 && u1.json?.unavailable?.payouts === true, { status: u1.status, unavailable: u1.json?.unavailable })
  const beforeU2 = stripeReads()
  await j.call("GET /api/stripe/payouts", { as: seller })
  check("  and such an answer is never kept (the next read asks Stripe again)", stripeReads() > beforeU2)
  s.payouts.list = realPayoutsList
  forgetPayoutsRead(creatorId)

  const payoutsPage = code("app/app/payouts/payouts-client.tsx")
  const list = payoutsPage.slice(payoutsPage.indexOf("function PayoutsHistoryList"), payoutsPage.indexOf("export function PayoutsClient"))
  check("the payouts list no longer fetches on its own (one read for the page)", !/fetch\(/.test(list) && /payouts: StripePayout\[\] \| null/.test(list))
  check("  and no background tick bumps a key that makes it fetch again", !/refreshKey/.test(payoutsPage))
  check("  a part Stripe did not give keeps what was shown", /if \(!missing\.payouts\) \{\s*setPayoutRows/.test(payoutsPage) && /missing\.balance \? null : pickBalance/.test(payoutsPage) && /!missing\.pending\) setUpcoming/.test(payoutsPage))
  check("  a failed refresh never empties the list, and says so quietly", /setRefreshStale\(true\)/.test(payoutsPage) && /tt\("Couldn't refresh just now\. Showing the last list we had\."\)/.test(payoutsPage))
  check("  user actions ask for a fresh read", (payoutsPage.match(/refreshBalances\(\{ fresh: true \}\)/g) ?? []).length >= 3)
  for (const code6 of ["de", "es", "fr", "it", "pl", "pt-BR"]) {
    const cat = readFileSync(join(process.cwd(), `lib/i18n/catalog/${code6}.ts`), "utf8")
    check(`  the new words in ${code6}`, cat.includes(`"Couldn't refresh just now. Showing the last list we had."`) && cat.includes(`"Payouts couldn't be loaded just now. They'll show here in a moment."`))
  }

  /* ── 7. LOW-10 ─────────────────────────────────────────────────────── */
  section("7. The plan sync reads every page of a customer's subscriptions (LOW-10)")
  {
    const GROWTH = "price_1SzBWaBYevnBVyznNCTOXDoS"
    const planSub = (id: string, status: string, created: number) => ({ id, status, customer: "cus_many", created, cancel_at_period_end: false, metadata: { creator_id: "11111111-1111-4111-8111-111111111111", plan_id: "growth" }, items: { data: [{ price: { id: GROWTH }, current_period_start: 1_760_000_000, current_period_end: 1_762_600_000 }] } })
    /* Newest first, as Stripe lists them: 21 cancelled ones, then the one still paying. */
    const all = [...Array.from({ length: 21 }, (_, i) => planSub(`sub_old${String(i).padStart(2, "0")}`, "canceled", 1_760_000_000 - i)), planSub("sub_paying", "active", 1_700_000_000)]
    const asked: Obj[] = []
    const pages = async (params: Obj) => {
      asked.push(params)
      const from = params.starting_after ? all.findIndex((x) => x.id === params.starting_after) + 1 : 0
      const data = all.slice(from, from + params.limit)
      return { data, has_more: from + params.limit < all.length }
    }
    const listed = await stripeListForSync(pages as any, 5_000)("cus_many")
    check("22 subscriptions are read across two pages, the second after the first's last", listed.length === 22 && asked.length === 2 && asked[1].starting_after === "sub_old19", { n: listed.length, asked: asked.map((a) => a.starting_after ?? null) })
    const db = { from: () => ({}) } as any
    const plan = await planCreatorSync({ db, listSubscriptions: stripeListForSync(pages as any, 5_000) }, { id: "11111111-1111-4111-8111-111111111111", stripe_customer_id: "cus_many", subscription_plan_id: "growth", subscription_status: "active", row: null })
    check("  so the one still paying behind 21 cancelled is found: paid, never Free", plan.outcome === "paid" && plan.chosenSubscriptionId === "sub_paying", { outcome: plan.outcome, chosen: plan.chosenSubscriptionId })
    const endless = async (params: Obj) => ({ data: [planSub(`sub_e${params.starting_after ?? ""}x`, "canceled", 1)], has_more: true })
    let threw = false
    try {
      await stripeListForSync(endless as any, 5_000)("cus_many")
    } catch {
      threw = true
    }
    check(`  a list longer than ${SYNC_MAX_PAGES} pages is an error, never a partial answer`, threw)
  }

  /* ── 8. Webhook database deadline (database audit F1/F11) ─────────── */
  section("8. A hung database call cannot hold a Stripe webhook: the shared client's deadline, and a ceiling")
  {
    const readMs = SUPABASE_DEADLINE_MS.read
    SUPABASE_DEADLINE_MS.read = 300
    const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))])
    j.db.failNext("creators", { method: "GET", hang: true, times: 3 })
    let t0 = Date.now()
    const h1 = await within(j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct, id: "evt_hung1" }), 5_000)
    const took1 = Date.now() - t0
    j.db.faults.length = 0
    check("Connect webhook: a creator read that never answers ends at the read deadline with 500 (Stripe retries)", h1 !== "timeout" && h1.status === 500 && took1 < 5_000, { result: h1 === "timeout" ? h1 : h1.status, took1 })
    j.db.failNext("subscriptions", { method: "GET", hang: true, times: 3 })
    t0 = Date.now()
    const h2 = await within(j.webhook("invoice.paid", planInvoice("in_hung1", "sub_plan1"), { id: "evt_hung2" }), 5_000)
    const took2 = Date.now() - t0
    j.db.faults.length = 0
    check("platform webhook: a subscriptions read that never answers ends at the read deadline with 500", h2 !== "timeout" && h2.status === 500 && took2 < 5_000, { result: h2 === "timeout" ? h2 : h2.status, took2 })
    SUPABASE_DEADLINE_MS.read = readMs
    for (const f of ["app/api/stripe/webhook/route.ts", "app/api/stripe/webhook/connect/route.ts", "lib/stripe/connect-webhook.ts"]) {
      const src = code(f)
      check(`${f}: the shared admin client, no raw supabase-js client`, /createAdminClient\(\)/.test(src) && !/from "@supabase\/supabase-js"/.test(src))
    }
    for (const f of ["app/api/stripe/webhook/route.ts", "app/api/stripe/webhook/connect/route.ts"]) check(`${f}: maxDuration 60`, /export const maxDuration = 60\b/.test(code(f)))
    j.serverErrors.splice(0, j.serverErrors.length, ...j.serverErrors.filter((x) => !/\/api\/stripe\/webhook/.test(x.route) || x.status !== 500))
  }

  /* ── 9. Orders page refund check (database audit F8) ───────────────── */
  section("9. The Orders page's missed-refund check: once per creator per six hours, through refund-sync")
  {
    const t = 1_800_000_000_000
    check("the first visit runs it", refundCheckDue("creator-r1", t) === true)
    check("  a refresh a minute later does not (no 60 PaymentIntent reads per visit)", refundCheckDue("creator-r1", t + 60_000) === false)
    check("  another creator's visit is their own", refundCheckDue("creator-r2", t + 60_000) === true)
    check("  six hours later it runs again", refundCheckDue("creator-r1", t + REFUND_CHECK_EVERY_MS) === true)
    const page = code("app/app/orders/sales/page.tsx")
    const sweep = page.slice(page.indexOf("async function catchMissedRefunds"))
    check("a refund found is applied by refund-sync (ledger line, each refund once), never by raw order updates", /if \(!refundCheckDue\(creatorId\)\) return/.test(sweep) && /await syncChargeRefund\(admin, stripe, charge\)/.test(sweep) && !/from\("orders"\)\s*\.update/.test(sweep))
  }

  /* ── 10. Tax summary paged (database audit, payments part) ────────── */
  section("10. The draft earnings summary counts every order of the year, past 1,000")
  {
    const year = new Date().getFullYear() - 1
    const rows = Array.from({ length: 1_005 }, (_, i) => ({ creator_id: creatorId, product_id: pack, status: "completed", amount_cents: 100, fee_cents: 5, currency: "usd", buyer_email: `t${i}@example.com`, receipt_token: `tax-${i}-${Math.random().toString(36).slice(2)}`, created_at: new Date(Date.UTC(year, 2, 1, 0, 0, i % 3600)).toISOString() }))
    for (const r of rows) j.db.insert("orders", r, {})
    j.db.maxRows = 1_000
    const tax = await j.call(`GET /api/stripe/tax-summary?year=${year}`, { as: seller })
    j.db.maxRows = null
    check("1,005 orders in a year: every one counted, not the first 1,000", tax.status === 200 && tax.json?.transactionCount === 1_005 && tax.json?.grossEarnings === 100_500, { status: tax.status, count: tax.json?.transactionCount, gross: tax.json?.grossEarnings, error: tax.json?.error })
    const src = code("app/api/stripe/tax-summary/route.ts")
    check("  read a page at a time by the order's creator, no .in() of every product id", /\.range\(from, from \+ TAX_SUMMARY_PAGE - 1\)/.test(src) && !/\.in\("product_id", productIds\)/.test(src))
  }

  /* ── 11. Payouts page reads past 1,000 orders (database audit, payments part) ── */
  section("11. The payouts page's sales list, tab count and figures read past 1,000 orders")
  {
    const total = 2_345
    const pageOf = (from: number, to: number) => Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ n: from + i })), error: null })
    const all = await allPages(pageOf)
    check("a figure read takes every page: 2,345 rows, not 1,000", all.data?.length === total && all.data?.[total - 1]?.n === total - 1, all.data?.length)
    const list = await allPages(pageOf, 1_500)
    check("  a list stops at its own ceiling", list.data?.length === 1_500)
    const failing = await allPages((from) => Promise.resolve(from === PAGE_ROWS ? { data: null, error: { message: "timeout" } } : { data: Array.from({ length: PAGE_ROWS }, () => ({})), error: null }))
    check("  a figure read whose second page failed is a failed read, never a sum of part of the orders", failing.data === null)
    /* Through the route, with PostgREST's 1,000 row cap: 1,005 of last year's orders (section 10's) are all in the tax year. */
    forgetPayoutsRead(creatorId)
    j.db.maxRows = 1_000
    const pr = await j.call("GET /api/stripe/payouts?fresh=1", { as: seller })
    j.db.maxRows = null
    check("/api/stripe/payouts: last year's 1099-K count is every order (1,005), not 1,000", pr.status === 200 && (pr.json?.taxData?.previousYear?.transactionCount ?? 0) >= 1_005, { status: pr.status, prev: pr.json?.taxData?.previousYear })
    const page = code("app/app/payouts/page.tsx")
    check("the payouts page reads its list, tax year and disputes a page at a time", (page.match(/allPages\(/g) ?? []).length === 3 && /PAYOUTS_LIST_MAX,\s*\)/.test(page) && (page.match(/\.range\(from, to\)/g) ?? []).length === 3)
  }

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with an unexpected server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

function newProduct(j: Journey, creatorId: string, p: { type: string; title: string; priceCents: number; status?: string }): string {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const status = p.status ?? "published"
  const [row] = j.db.insert("products", { creator_id: creatorId, type: p.type, title: p.title, slug, description: `<p>${p.title}</p>`, status, archived: false, price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
