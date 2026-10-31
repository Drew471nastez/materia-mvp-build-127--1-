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
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"
import { createAdminClient } from "../lib/supabase/admin"
import { runMembershipJobs } from "../lib/memberships/reminders"
import { abandonedCheckout } from "../lib/memberships/state"

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

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with an unexpected server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
