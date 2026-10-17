import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { reportError } from "@/lib/observability/report"
import { recordCheckoutContactAndWelcome } from "@/lib/contacts/checkout-welcome"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { methodsFrom } from "@/lib/checkout/payment-methods"
import { buyerCustomer, buyerMessageFor, createSubscription, ensurePrice, intentOf, membershipFee, refusalReason } from "@/lib/memberships/billing"
import { syncSubscription } from "@/lib/memberships/sync"
import { grantsAccess, type BillingInterval } from "@/lib/memberships/state"
import { MEMBERSHIP_COLUMNS, NOT_SET_UP, PLAN_COLUMNS, UUID, ownerFilter, tableMissing, type MembershipRow, type PlanRow } from "@/lib/memberships/server"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import { BUYER_UNAVAILABLE } from "@/lib/payments/stripe/readiness"

export const runtime = "nodejs"

/**
 * POST /api/memberships/checkout
 *
 * Starts a membership when the buyer presses Join: the subscription in
 * Stripe, waiting for its first payment (or, with a free trial, for the card
 * to save), and the membership row that follows it. The page then confirms
 * with Stripe.js, or the app sends a PaymentMethod and /confirm confirms it.
 *
 * Body: { productId, interval: "month" | "year", firstName, lastName, email,
 *         emailOptIn?, agreedToTerms, paymentMethodId? }
 * Answers { membershipId, subscriptionId, type: "payment" | "setup",
 *           clientSecret, amountCents, trialDays }.
 *
 * Checked as the one time checkout checks (app/api/checkout/stripe-session):
 * the price from the database, the seller able to take payments, the rate
 * limit for payment routes. And three things of its own: a signed in buyer
 * who is already a member is sent to their library instead of paying twice
 * (a guest is never told, by email, who is a member: a second membership is
 * cancelled and refunded after payment, lib/memberships/duplicates); a
 * second press after a declined card continues the same subscription
 * rather than making another; and a free trial is for a first membership of
 * this product only.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Something was missing. Refresh the page and try again." }, { status: 400 })
  }
  const productId = typeof body.productId === "string" && UUID.test(body.productId) ? body.productId : ""
  const interval: BillingInterval = body.interval === "year" ? "year" : "month"
  const firstName = clean(body.firstName, 60)
  const lastName = clean(body.lastName, 60)
  const email = clean(body.email, 254).toLowerCase()
  const paymentMethodId = typeof body.paymentMethodId === "string" && /^pm_[A-Za-z0-9]+$/.test(body.paymentMethodId) ? body.paymentMethodId : null
  if (!productId) return NextResponse.json({ error: "This membership is not available." }, { status: 404 })
  if (!firstName) return NextResponse.json({ error: "Enter your name." }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  if (body.agreedToTerms !== true) return NextResponse.json({ error: "Agree to the Terms and Conditions to continue." }, { status: 400 })

  const limited = await rateLimit({
    bucket: "payment",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: LIMITS.payment,
    message: "Too many payment attempts just now. Wait a few minutes and try again.",
  })
  if (limited) return limited

  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [productRead, planRead] = await Promise.all([
    admin.from("products").select("id, title, status, type, creator_id").eq("id", productId).maybeSingle(),
    admin.from("membership_plans").select(`${PLAN_COLUMNS}, stripe_product_id, stripe_monthly_price_id, stripe_monthly_price_cents, stripe_yearly_price_id, stripe_yearly_price_cents`).eq("product_id", productId).maybeSingle(),
  ])
  if (tableMissing(planRead.error)) {
    await reportError({ source: "payments", where: "memberships checkout", error: new Error("membership tables missing: run supabase/sql/run-now/75_memberships.sql"), context: { productId } })
    return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
  }
  const product = productRead.data as { id: string; title: string | null; status: string; type: string; creator_id: string } | null
  const plan = planRead.data as PlanRow | null
  if (!product || product.status !== "published" || product.type !== "membership" || !plan) {
    return NextResponse.json({ error: "This membership is not available." }, { status: 404 })
  }
  /* A membership that sells a community tier: signed in, approved first when the community asks, never a second one (lib/communities/server/join.ts). */
  const { checkoutGate } = await import("@/lib/communities/server/join")
  const gate = await checkoutGate({ id: product.id }, user?.id ?? null, admin)
  if (gate.refusal) return NextResponse.json({ error: gate.refusal.error, code: gate.refusal.code, url: gate.refusal.url }, { status: gate.refusal.status })
  const amount = interval === "year" ? plan.yearly_price_cents : plan.monthly_price_cents
  if (!amount) return NextResponse.json({ error: `This membership has no ${interval === "year" ? "yearly" : "monthly"} price. Choose the other one.` }, { status: 400 })

  const { data: creator } = await admin
    .from("creators")
    .select("id, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled")
    .eq("id", product.creator_id)
    .maybeSingle()
  const account = creator?.stripe_account_id as string | null | undefined
  /*
   * Storelib's one readiness rule (lib/payments/stripe/readiness), read from
   * what the last sync worked out. This used to accept charges_enabled
   * "not false", so a creator Stripe had not answered for yet got through.
   * The buyer is told nothing about the creator's verification.
   */
  if (!creator || !account || !account.startsWith("acct_") || !(await checkoutReadyForCreator(creator.id as string))) {
    return NextResponse.json({ error: BUYER_UNAVAILABLE, code: "seller_unavailable" }, { status: 409 })
  }

  /*
    WHAT THIS BUYER ALREADY HAS, ASKED ONLY OF SOMEBODY PROVEN. A signed in
    account: its own memberships of this product (its id, or the address the
    account confirmed; lib/memberships/server ownerFilter), never a typed
    email. A guest is not looked up by the email they type: answering "you
    are already a member" to whatever address is typed told anybody who is a
    member of what. A guest's second membership is settled after payment
    instead (lib/memberships/duplicates: cancelled, refunded, told by email).
  */
  const rows: MembershipRow[] = []
  if (user) {
    const owner = ownerFilter({ id: user.id, email: (user.email ?? "").toLowerCase() || null, emailConfirmed: !!user.email_confirmed_at })
    const { data: history } = await admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("product_id", productId).or(owner).order("created_at", { ascending: false }).limit(20)
    rows.push(...((history as MembershipRow[] | null) ?? []))
  } else if (typeof body.previousMembershipId === "string" && UUID.test(body.previousMembershipId)) {
    /* A guest's own last try, named by the page that made it (a declined card): only that row, only for the same email. */
    const { data: own } = await admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("id", body.previousMembershipId).eq("product_id", productId).maybeSingle()
    const mine = own as MembershipRow | null
    if (mine && mine.buyer_email === email && mine.status === "incomplete") rows.push(mine)
  }
  if (rows.some((m) => grantsAccess(m))) {
    return NextResponse.json({ error: "You are already a member. It is in your library under Memberships.", code: "already_member" }, { status: 409 })
  }

  /* A second press after a declined card: the same subscription, its payment tried again. */
  const pending = rows.find((m) => m.status === "incomplete" && m.billing_interval === interval && m.buyer_email === email && Date.now() - Date.parse(m.created_at) < 22 * 3600_000)
  if (pending && !paymentMethodId) {
    try {
      const sub = await stripe.subscriptions.retrieve(pending.stripe_subscription_id, { expand: ["latest_invoice.confirmation_secret", "pending_setup_intent"] })
      const intent = sub.status === "incomplete" || sub.status === "trialing" ? intentOf(sub) : null
      if (intent) {
        return NextResponse.json({ membershipId: pending.id, subscriptionId: sub.id, type: intent.type, clientSecret: intent.clientSecret, amountCents: amount, trialDays: intent.type === "setup" ? plan.trial_days : 0 })
      }
    } catch {
      /* gone or unreadable: a new one below */
    }
  }

  /* A free trial is for a first membership of this product. Known for a signed in account; a guest's email is not asked (it would say whether that address was ever a member). */
  /*
    AND ONE PER COMMUNITY (round AF). A community sells each plan through its own product, so a person could take Standard's
    trial and then Premium's. Any membership of any of the community's plans ends it (lib/communities/server/plan-checkout.ts).
    A community's checkout is always signed in (checkoutGate above).
  */
  const communityTrial = async () => {
    if (!(plan.trial_days > 0 && gate.community && user)) return false
    const { communityTrialUsed } = await import("@/lib/communities/server/plan-checkout")
    return communityTrialUsed(admin as never, gate.community.id, { id: user.id, email: (user.email ?? "").toLowerCase() || null, emailConfirmed: !!user.email_confirmed_at })
  }
  const hadTrial = rows.some((m) => m.status !== "incomplete") || (await communityTrial())
  const trialDays = !hadTrial && plan.trial_days > 0 ? plan.trial_days : 0
  const name = `${firstName} ${lastName}`.trim()

  try {
    const price = await ensurePrice(admin, plan, product, interval)
    /* The fee in the currency the subscription's Stripe price is in (plan.currency,
       Storelib's for every community and membership: lib/pricing/surface-currency),
       so the fee rules and the charge cannot be in two different currencies. */
    const fee = await membershipFee(admin, creator.id, price.amountCents, plan.currency)
    const customerId = await buyerCustomer(admin, { email, name, userId: user?.id ?? null })
    if (paymentMethodId) await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
    const created = await createSubscription({
      customerId,
      priceId: price.priceId,
      trialDays,
      destination: account,
      feePercent: fee.percent,
      paymentMethodId,
      paymentMethodTypes: paymentMethodId ? ["card"] : methodsFrom(body.paymentMethods),
      idempotencyKey: `membership:${productId}:${email}:${interval}:${Date.now()}`,
      metadata: {
        kind: "membership",
        product_id: product.id,
        creator_id: creator.id,
        buyer_id: user?.id ?? "",
        buyer_email: email,
        buyer_name: name.slice(0, 120),
        title: String(product.title || "Membership").slice(0, 200),
        interval,
        fee_cents: String(fee.cents),
        plan_used: fee.planId,
        email_opt_in: body.emailOptIn === true ? "true" : "false",
        /* A community's checkout asked for the EU withdrawal waiver inside the consent (round 13): the record of it. */
        ...(body.withdrawalWaiver === true ? { withdrawal_waiver: "accepted" } : {}),
      },
    })
    const { row } = await syncSubscription(admin, created.subscription.id, { subscription: created.subscription })
    if (!created.intent || !row) throw new Error(`subscription ${created.subscription.id} has nothing to confirm (status ${created.subscription.status})`)

    if (body.emailOptIn === true) {
      after(async () => {
        await recordCheckoutContactAndWelcome(admin, { creatorId: creator.id, email, name, basis: "ticked", bought: false, source: contactSourceOfOrder(null, product.id) })
      })
    }
    return NextResponse.json({
      membershipId: row.id,
      subscriptionId: created.subscription.id,
      type: created.intent.type,
      clientSecret: created.intent.clientSecret,
      amountCents: price.amountCents,
      trialDays,
    })
  } catch (error) {
    const reason = refusalReason(error)
    /* The owner sees why in the admin's Health view: Stripe's own code and words, never the buyer. */
    await reportError({ source: "payments", where: "memberships checkout", error, context: { productId, interval, reason } })
    return NextResponse.json({ error: buyerMessageFor(error) }, { status: (error as { type?: string })?.type === "StripeCardError" ? 402 : 502 })
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max) : ""
}
