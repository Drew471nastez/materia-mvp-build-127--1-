/**
 * COMMERCE RELIABILITY, WAVE 2
 *
 * Over the journey harness (tests/_journey: the real modules and route
 * handlers, an in-memory PostgREST, a Stripe world). Nothing here reaches
 * Stripe; each Stripe method a section needs is the fake's, put back after.
 *
 *   1  the memberships job never cancels a trial whose buyer saved a card
 *      (on the subscription or the customer), nor one Stripe has as paid;
 *      it cancels only an unpaid first payment or a trial with no card
 *      anywhere (PAY-8)
 *   2  the payment webhook answers once the order, library entry and ledger
 *      are written; the fee read, receipt PDF, emails and notifications run
 *      after the answer, once each under their journal keys, and a step that
 *      failed there is left for the sweep (PAY-12)
 *   3  the legacy checkout.session.completed product path: no checkout made
 *      today reaches it (every session creator is read), and if an old
 *      session does, its payment is read through latest_charge, so the order
 *      keeps its transfer and card (PAY-11)
 *   4  /api/stripe/payout-method: a bank list Stripe did not give is
 *      bankUnknown, never "no bank", and the page says it could not check
 *      instead of asking for a bank (PAY-5 follow-up)
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"
import { createAdminClient } from "../lib/supabase/admin"
import { runMembershipJobs } from "../lib/memberships/reminders"
import { abandonedCheckout } from "../lib/memberships/state"
import { instantOrderBody } from "../lib/onepage/product-block"
import { fulfilPaymentIntent } from "../lib/checkout/fulfil-payment"
import { unfinishedFollowups } from "../lib/checkout/followups"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

type Obj = Record<string, any>

async function main() {
  const j = await Journey.start()
  const s = j.stripe as any

  /* ── 1. PAY-8 ──────────────────────────────────────────────────────── */
  section("1. The memberships job and half started checkouts (PAY-8)")
  {
    const DAY = 86_400
    const now = Math.floor(Date.now() / 1000)
    const pendingSi = { id: "seti_1", status: "requires_payment_method" }
    const base = (id: string, over: Obj = {}): Obj => ({
      id,
      object: "subscription",
      status: "trialing",
      customer: `cus_${id}`,
      metadata: { kind: "membership", buyer_email: `${id}@example.com` },
      default_payment_method: null,
      pending_setup_intent: pendingSi,
      trial_end: now + 6 * DAY,
      cancel_at_period_end: false,
      items: { data: [{ current_period_start: now - DAY - 60, current_period_end: now + 6 * DAY, price: { id: "price_m", unit_amount: 900, currency: "usd", recurring: { interval: "month" } } }] },
      ...over,
    })
    const subs = new Map<string, Obj>()
    const customers = new Map<string, Obj>()
    const cancelled: string[] = []
    let customerReadFails = false
    const real = { subRetrieve: s.subscriptions.retrieve, subCancel: s.subscriptions.cancel, cusRetrieve: s.customers.retrieve }
    s.subscriptions.retrieve = async (id: string) => {
      const sub = subs.get(id)
      if (!sub) throw Object.assign(new Error("No such subscription"), { statusCode: 404 })
      return JSON.parse(JSON.stringify(sub))
    }
    s.subscriptions.cancel = async (id: string) => {
      cancelled.push(id)
      const sub = subs.get(id)!
      Object.assign(sub, { status: "canceled", canceled_at: now, ended_at: now })
      return { ...sub }
    }
    s.customers.retrieve = async (id: string) => {
      if (customerReadFails) throw Object.assign(new Error("An error occurred with our connection to Stripe."), { type: "StripeConnectionError" })
      return customers.get(id) ?? { id, object: "customer", invoice_settings: { default_payment_method: null }, default_source: null }
    }
    const old = new Date(Date.now() - 2 * DAY * 1000).toISOString()
    const row = (subId: string) => j.db.insert("memberships", { stripe_subscription_id: subId, buyer_email: `${subId}@example.com`, status: "incomplete", created_at: old, updated_at: old }, {})[0]
    const rowOf = (subId: string) => j.rows("memberships").find((r) => r.stripe_subscription_id === subId)

    /* The cases, each a day old and "incomplete" in our row. */
    subs.set("sub_cardonsub", base("sub_cardonsub", { default_payment_method: { id: "pm_1", card: { brand: "visa", last4: "4242" } }, pending_setup_intent: null }))
    subs.set("sub_siok", base("sub_siok", { pending_setup_intent: { id: "seti_2", status: "succeeded" } }))
    subs.set("sub_cardoncus", base("sub_cardoncus"))
    customers.set("cus_sub_cardoncus", { id: "cus_sub_cardoncus", object: "customer", invoice_settings: { default_payment_method: "pm_cus" }, default_source: null })
    subs.set("sub_active", base("sub_active", { status: "active", pending_setup_intent: null, default_payment_method: "pm_2" }))
    subs.set("sub_nocard", base("sub_nocard"))
    subs.set("sub_unpaid", base("sub_unpaid", { status: "incomplete", pending_setup_intent: null }))
    subs.set("sub_cusfail", base("sub_cusfail"))
    for (const id of subs.keys()) row(id)

    /* sub_cusfail first, with the customer read failing; the rest are hidden as made a minute ago. */
    const fresh = new Date().toISOString()
    for (const id of subs.keys()) if (id !== "sub_cusfail") rowOf(id)!.created_at = fresh
    customerReadFails = true
    await runMembershipJobs(createAdminClient() as never, { budgetMs: 30_000 })
    customerReadFails = false
    check("a trial whose customer could not be read is not cancelled (left for the next run)", !cancelled.includes("sub_cusfail") && rowOf("sub_cusfail")?.status === "incomplete", { cancelled, row: rowOf("sub_cusfail")?.status })
    for (const id of subs.keys()) rowOf(id)!.created_at = id === "sub_cusfail" ? fresh : old

    const summary = await runMembershipJobs(createAdminClient() as never, { budgetMs: 30_000 })
    check("a trial with a card on the subscription: not cancelled, row synced to trialing", !cancelled.includes("sub_cardonsub") && rowOf("sub_cardonsub")?.status === "trialing", { cancelled, row: rowOf("sub_cardonsub")?.status })
    check("a trial whose setup intent succeeded: not cancelled, row trialing", !cancelled.includes("sub_siok") && rowOf("sub_siok")?.status === "trialing", { row: rowOf("sub_siok")?.status })
    check("a trial whose CUSTOMER has a default card: not cancelled (Stripe charges that one at the trial's end)", !cancelled.includes("sub_cardoncus"), { cancelled })
    check("a subscription Stripe has as active: not cancelled, row synced to active", !cancelled.includes("sub_active") && rowOf("sub_active")?.status === "active", { row: rowOf("sub_active")?.status })
    check("a trial with no card anywhere: cancelled, as the rule intends", cancelled.includes("sub_nocard") && rowOf("sub_nocard")?.status === "expired", { cancelled, row: rowOf("sub_nocard")?.status })
    check("a first payment that never went through (incomplete): cancelled", cancelled.includes("sub_unpaid"))
    check("  the summary counts two closed, four kept", summary.abandoned === 2 && summary.kept === 4, summary)
    const again = await runMembershipJobs(createAdminClient() as never, { budgetMs: 30_000 })
    check("a second run cancels nothing more", cancelled.length === 2 && again.abandoned === 0, { cancelled, again })

    /* The rule on its own. */
    const t = (over: Obj) => base("sub_x", over) as never
    check("rule: trialing with a card on the subscription is kept whatever the customer", !abandonedCheckout(t({ default_payment_method: "pm_1", pending_setup_intent: null }), false))
    check("rule: trialing, no card on the subscription, customer unknown: kept", !abandonedCheckout(t({}), null))
    check("rule: trialing with no setup intent at all: kept", !abandonedCheckout(t({ pending_setup_intent: null }), false))
    check("rule: active, past_due, canceled are never cancelled here", ["active", "past_due", "canceled", "unpaid"].every((status) => !abandonedCheckout(t({ status }), false)))
    check("rule: incomplete and a card-less trial are", abandonedCheckout(t({ status: "incomplete" }), null) && abandonedCheckout(t({}), false))

    s.subscriptions.retrieve = real.subRetrieve
    s.subscriptions.cancel = real.subCancel
    s.customers.retrieve = real.cusRetrieve
  }


  /* ── 2. PAY-12 ─────────────────────────────────────────────────────── */
  section("2. The payment webhook answers before the slow follow-ups (PAY-12)")
  {
    const seller = await j.signUp("maker2@example.com", { name: "Mo Maker" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mo" } })
    const creator = j.rows("creators").find((r) => r.user_id === seller.id)!
    await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mo Sounds", supportEmail: "hello@mo.example", defaultCountry: "US" } })
    await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
    const acct = j.rows("creators").find((r) => r.id === creator.id)!.stripe_account_id as string
    j.world.activate(acct)
    await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
    const [prod] = j.db.insert("products", { creator_id: creator.id, type: "digital", title: "Drum Kit", slug: "drum-kit", description: "<p>Drum Kit</p>", status: "published", archived: false, price_cents: 1500, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})

    /* A slow world: each email takes 400ms at the provider, the processing fee read (the platform's own charge read) 1.5s. */
    const SLOW_FEE_MS = 1_500
    j.net.mailDelayMs = 400
    const realCharge = s.charges.retrieve
    let feeReads = 0
    let failFeeWrite = false
    s.charges.retrieve = async (id: string, params?: Obj, opts?: Obj) => {
      if (!opts?.stripeAccount) {
        feeReads++
        await new Promise((r) => setTimeout(r, SLOW_FEE_MS))
        /* The order's fee write that follows fails once, when a case asks for it. */
        if (failFeeWrite) j.db.failNext("orders", { method: "PATCH" })
      }
      return realCharge(id, params, opts)
    }
    let ipSeq = 0
    const buy = async (email: string) => {
      const started = await j.call("POST /api/checkout/stripe-session", { headers: { "x-forwarded-for": `198.51.100.${200 + ++ipSeq}` }, body: instantOrderBody({ productId: prod.id as string, email, name: "Pat Payer" }, false) })
      const pid = started.json?.paymentIntentId as string
      j.world.payIntent(pid)
      return { pid, secret: started.json?.clientSecret as string }
    }
    const orderOf = (pid: string) => j.rows("orders").find((o) => o.stripe_payment_intent_id === pid)
    const step = (orderId: string, name: string) => j.rows("order_followups").find((r) => r.order_id === orderId && r.step === name)
    const ledgerFor = (orderId: string) => j.rows("ledger_events").filter((e) => e.order_id === orderId).length
    const mailsTo = (email: string) => j.net.to(email).length

    /* BEFORE (the same work in line): the buyer's own page still runs every step before it answers. */
    const inline = await buy("inline@example.com")
    const page = await j.call("POST /api/checkout/confirm-payment", { headers: { "x-forwarded-for": "198.51.100.250" }, body: { paymentIntentId: inline.pid, clientSecret: inline.secret } })
    console.log(`    in line: ${page.ms}ms`)
    check("in line, the slow fee read and the emails are inside the answer (the time the webhook used to take)", page.status === 200 && page.ms >= SLOW_FEE_MS + 400, { status: page.status, ms: page.ms })

    /* AFTER: the webhook. */
    const a = await buy("fast@example.com")
    const hook = await j.webhook("payment_intent.succeeded", j.world.intents.get(a.pid)!, { id: "evt_pay12_a" })
    const o = orderOf(a.pid)
    console.log(`    webhook: ${hook.ms}ms (in line ${page.ms}ms)`)
    check("the webhook answers 200 well before the slow work (under 1s; in line it took the fee read and the emails)", hook.status === 200 && hook.ms < 1_000 && hook.ms < page.ms - SLOW_FEE_MS, { status: hook.status, ms: hook.ms, inline: page.ms })
    check("  the order and its ledger line were written", !!o && ledgerFor(o.id as string) === 1)
    check("  after the answer: the receipt went (once), the fee read ran, every step done", !!o && mailsTo("fast@example.com") === 1 && step(o.id as string, "emails")?.state === "done" && step(o.id as string, "notify")?.state === "done" && step(o.id as string, "stripe processing fee")?.state === "done" && step(o.id as string, "complete")?.state === "done", { mails: mailsTo("fast@example.com"), steps: j.rows("order_followups").filter((r) => r.order_id === o?.id) })
    const fees = feeReads
    const again = await j.webhook("payment_intent.succeeded", j.world.intents.get(a.pid)!, { id: "evt_pay12_a" })
    const other = await j.webhook("payment_intent.succeeded", j.world.intents.get(a.pid)!, { id: "evt_pay12_a2" })
    check("a redelivery (same event, or another event for the same payment) sends nothing twice", again.status < 500 && other.status === 200 && mailsTo("fast@example.com") === 1 && feeReads === fees && ledgerFor(o!.id as string) === 1, { again: again.status, other: other.status, mails: mailsTo("fast@example.com") })

    /* A redelivery that lands while the first delivery's after() work has not run yet. */
    const b = await buy("race@example.com")
    const held: (() => Promise<void>)[] = []
    const defer = (task: () => Promise<void>) => void held.push(task)
    const admin = createAdminClient() as never
    const first = await fulfilPaymentIntent(admin, b.pid, { baseUrl: "https://storelib.com", defer })
    const ob = orderOf(b.pid)
    check("before its after() work: the order and ledger are there, no email yet", first.ok === true && !!ob && ledgerFor(ob.id as string) === 1 && mailsTo("race@example.com") === 0 && held.length === 1, { first, held: held.length })
    const second = await fulfilPaymentIntent(admin, b.pid, { baseUrl: "https://storelib.com", defer })
    check("  a redelivery meanwhile finds the order and leaves the run alone (nothing more deferred)", second.ok === true && second.ok && !second.created && held.length === 1, { second, held: held.length })
    for (const t of held.splice(0)) await t()
    check("  the after() work then sends the receipt once and finishes the order", mailsTo("race@example.com") === 1 && step(ob!.id as string, "complete")?.state === "done", { mails: mailsTo("race@example.com") })

    /* A step that fails after the answer is recorded and finished by the sweep. */
    const c = await buy("sweep@example.com")
    failFeeWrite = true
    const failedHook = await j.webhook("payment_intent.succeeded", j.world.intents.get(c.pid)!, { id: "evt_pay12_c" })
    failFeeWrite = false
    const oc = orderOf(c.pid)!
    check("a fee write that failed after the answer: the webhook still answered 200", failedHook.status === 200 && failedHook.ms < 1_000, { status: failedHook.status, ms: failedHook.ms })
    check("  the step is recorded failed and the order left unfinished; the email went once", step(oc.id as string, "stripe processing fee")?.state === "failed" && step(oc.id as string, "begun")?.state !== "done" && mailsTo("sweep@example.com") === 1, { steps: j.rows("order_followups").filter((r) => r.order_id === oc.id), mails: mailsTo("sweep@example.com") })
    const begun = step(oc.id as string, "begun")!
    begun.updated_at = new Date(Date.now() - 5 * 60_000).toISOString()
    const listed = await unfinishedFollowups(admin, 50)
    check("  the sweep's list has it", listed.some((x) => x.orderId === oc.id))
    await j.cron()
    check("  the sweep wrote the fee and finished the order, and sent no second email", step(oc.id as string, "stripe processing fee")?.state === "done" && step(oc.id as string, "complete")?.state === "done" && mailsTo("sweep@example.com") === 1, { steps: j.rows("order_followups").filter((r) => r.order_id === oc.id), mails: mailsTo("sweep@example.com") })
    check("no after() task threw", j.afterErrors.length === 0, j.afterErrors)

    s.charges.retrieve = realCharge
    j.net.mailDelayMs = 0
  }


  /* ── 3. PAY-11 ─────────────────────────────────────────────────────── */
  section("3. The legacy Checkout Session product path (PAY-11)")
  {
    /* Reachability: every Checkout Session this code makes, and what each puts on the session's own metadata. */
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f.startsWith(".") ? [] : walk(p)) : /\.(ts|tsx)$/.test(f) ? [p] : [] })
    const makers = [...walk(join(process.cwd(), "app")), ...walk(join(process.cwd(), "lib"))].filter((f) => /checkout\.sessions\.create\(/.test(readFileSync(f, "utf8"))).map((f) => f.slice(process.cwd().length + 1)).sort()
    const known = ["app/api/billing/subscription/create/route.ts", "app/api/checkout/cart/route.ts", "app/api/checkout/stripe-session/route.ts", "lib/communities/server/event-checkout.ts", "lib/communities/server/learn-checkout.ts", "lib/communities/server/library-checkout.ts", "lib/communities/server/module-sales.ts", "lib/physical/checkout-server.ts"]
    check("the Checkout Session makers are the eight known ones (a new one must be checked against the legacy path)", JSON.stringify(makers) === JSON.stringify(known), makers)
    const wallet = readFileSync(join(process.cwd(), "app/api/checkout/stripe-session/route.ts"), "utf8")
    const walletParams = wallet.slice(wallet.indexOf("const walletParams"), wallet.indexOf("checkout.sessions.create(walletParams"))
    check("  the wallet session carries the product only on its PaymentIntent (payment_intent_data.metadata), not on the session", /payment_intent_data: \{[\s\S]*metadata,/.test(walletParams) && !/^\s{8}metadata[,:]/m.test(walletParams), walletParams.slice(0, 200))
    const onSession = (f: string) => { const t = readFileSync(join(process.cwd(), f), "utf8"); return /product_id:/.test(t.slice(t.indexOf("metadata"), t.indexOf("metadata") + 600)) }
    check("  the plan and community sessions put no product_id on their session metadata (baskets and physical orders are taken by their own marks above it)", ["app/api/billing/subscription/create/route.ts", "lib/communities/server/event-checkout.ts", "lib/communities/server/learn-checkout.ts", "lib/communities/server/module-sales.ts"].every((f) => !onSession(f)))

    /* An old session reaching the path anyway. Stripe refuses an expand of `charges` (removed in API 2022-11-15), as the fake now does. */
    const seller = await j.signUp("legacy@example.com", { name: "Lee Legacy" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "lee" } })
    await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
    const creator = j.rows("creators").find((r) => r.user_id === seller.id)!
    const acct = creator.stripe_account_id as string
    j.world.activate(acct)
    const [prod] = j.db.insert("products", { creator_id: creator.id, type: "digital", title: "Old Pack", slug: "old-pack", description: "<p>Old</p>", status: "published", archived: false, price_cents: 1000, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
    const pi = await s.paymentIntents.create({ amount: 1000, currency: "usd", application_fee_amount: 150, transfer_data: { destination: acct }, metadata: {} })
    const paid = j.world.payIntent(pi.id, { brand: "mastercard", last4: "5555" })
    const realRetrieve = s.paymentIntents.retrieve
    const asked: string[][] = []
    s.paymentIntents.retrieve = async (id: string, params?: Obj, ...rest: unknown[]) => {
      asked.push(params?.expand ?? [])
      if ((params?.expand ?? []).includes("charges")) throw Object.assign(new Error("This property cannot be expanded (charges)."), { type: "StripeInvalidRequestError", statusCode: 400 })
      return realRetrieve(id, params, ...rest)
    }
    const warned: string[] = []
    const realWarn = console.warn
    console.warn = (...a: unknown[]) => { warned.push(a.map(String).join(" ")); realWarn(...a) }
    const session = { id: "cs_legacy_test1", object: "checkout.session", mode: "payment", payment_status: "paid", status: "complete", payment_intent: pi.id, amount_total: 1000, currency: "usd", customer_details: { email: "oldbuyer@example.com" }, metadata: { product_id: prod.id, creator_id: creator.id, platform_fee_cents: "150", receipt_token: "rt_legacy_test1", buyer_email: "oldbuyer@example.com" } }
    const hook = await j.webhook("checkout.session.completed", session, { id: "evt_legacy1" })
    console.warn = realWarn
    s.paymentIntents.retrieve = realRetrieve
    const order = j.rows("orders").find((o) => o.stripe_session_id === "cs_legacy_test1")
    const transfer = paid.charge?.transfer as string
    check("an old product session is still made into its order (200)", hook.status === 200 && !!order, { status: hook.status, body: hook.json })
    check("  its payment read through latest_charge, never `charges`", asked.length > 0 && asked.every((e) => !e.includes("charges")) && asked.some((e) => e.includes("latest_charge")), asked)
    check("  the order keeps the transfer and the card (they were empty when the expand failed)", order?.transfer_id === transfer && order?.card_brand === "mastercard" && order?.card_last4 === "5555" && order?.application_fee_cents === 150, { transfer_id: order?.transfer_id, transfer, card: order?.card_last4 })
    check("  and the path says it was reached", warned.some((w) => /legacy product Checkout Session reached/.test(w) && w.includes("cs_legacy_test1")), warned)
  }


  /* ── 4. payout-method bankUnknown ──────────────────────────────────── */
  section("4. A bank Stripe could not list is unknown, not missing (PAY-5 follow-up)")
  {
    const seller = await j.signUp("bank@example.com", { name: "Bo Bank" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "bobank" } })
    const none = await j.call("GET /api/stripe/payout-method", { as: seller })
    check("no payments account: no bank, and that is known (bankUnknown false)", none.status === 200 && none.json?.bankAccount === null && none.json?.bankUnknown === false, none.json)
    await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
    const acct = j.rows("creators").find((r) => r.user_id === seller.id)!.stripe_account_id as string
    j.world.activate(acct)
    const ok = await j.call("GET /api/stripe/payout-method", { as: seller })
    check("Stripe answers: the bank, bankUnknown false", ok.status === 200 && ok.json?.bankAccount?.last4 === "6789" && ok.json?.bankUnknown === false, ok.json)
    const realList = s.accounts.listExternalAccounts
    s.accounts.listExternalAccounts = async () => {
      throw Object.assign(new Error("Request rate limit exceeded."), { type: "StripeRateLimitError", statusCode: 429 })
    }
    const embedded = await j.call("GET /api/stripe/payout-method", { as: seller })
    check("the bank list failed but the account carries its bank: that bank, not unknown", embedded.status === 200 && embedded.json?.bankAccount?.last4 === "6789" && embedded.json?.bankUnknown === false, embedded.json)
    const a = j.world.account(acct)
    const keptBanks = a.external_accounts
    a.external_accounts = undefined
    const unknown = await j.call("GET /api/stripe/payout-method", { as: seller })
    check("the bank list failed and nothing else says: bankAccount null WITH bankUnknown true", unknown.status === 200 && unknown.json?.bankAccount === null && unknown.json?.bankUnknown === true, unknown.json)
    a.external_accounts = { object: "list", data: [] }
    s.accounts.listExternalAccounts = realList
    const empty = await j.call("GET /api/stripe/payout-method", { as: seller })
    check("Stripe says there is no bank: bankAccount null, bankUnknown false (Add bank stays)", empty.status === 200 && empty.json?.bankAccount === null && empty.json?.bankUnknown === false, empty.json)
    a.external_accounts = keptBanks

    const ui = readFileSync(join(process.cwd(), "app/(storelib)/app/payouts/payouts-client.tsx"), "utf8")
    const card = ui.slice(ui.indexOf("function PayoutMethodCard("), ui.indexOf("function SwitchAccountPanel("))
    check("the card: unknown is not \"needs a bank\"", /const bankUnknown = !bank && !!data\?\.bankUnknown;/.test(card) && /const needsBank = data && !bank && !bankUnknown;/.test(card))
    check("  it says \"We couldn't check your bank account right now\" instead of \"No bank account yet\"", /bankUnknown \? \([\s\S]{0,160}tt\("We couldn't check your bank account right now"\)/.test(card))
    check("  a failed read (no answer or a 5xx) keeps what was shown, or is unknown; never \"no bank\"", /r\.status >= 500\) throw/.test(card) && /prev \?\? \{ \.\.\.UNKNOWN_PAYOUT_METHOD \}/.test(card) && /bankUnknown: true/.test(ui.slice(ui.indexOf("const UNKNOWN_PAYOUT_METHOD"), ui.indexOf("const UNKNOWN_PAYOUT_METHOD") + 200)))
    const details = ui.slice(ui.indexOf("function BalanceDetails("), ui.indexOf("const footer", ui.indexOf("function BalanceDetails(")))
    check("the details panel: unknown says it could not check, and offers Update bank, not Add a bank account", /bankUnknown \? \([\s\S]{0,120}We couldn't check your bank account right now/.test(details) && /bank \|\| bankUnknown \? tt\("Update bank"\) : tt\("Add a bank account"\)/.test(details))
    for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
      const cat = readFileSync(join(process.cwd(), `lib/i18n/catalog/${lang}.ts`), "utf8")
      check(`  the sentence is translated (${lang})`, /"We couldn't check your bank account right now": "[^"]+"/.test(cat))
    }
  }

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with an unexpected server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
