import "server-only"

/**
 * ===========================================================================
 *  A MEMBERSHIP IN STRIPE: PRICES, THE FEE, THE BUYER, THE SUBSCRIPTION
 * ===========================================================================
 * The subscription equivalent of the one time checkout
 * (app/api/checkout/stripe-session), made the same way that one is:
 *
 *   ON THE PLATFORM, PAID TO THE CREATOR. A one time payment is a
 *   destination charge: the PaymentIntent is Storelib's, with
 *   transfer_data.destination the creator's Connect account and an
 *   application fee. A subscription here is the same shape through Stripe
 *   Billing: the customer, the product, the price and the subscription live
 *   on Storelib's account, every invoice's payment is transferred to the
 *   creator (`transfer_data.destination`), and Storelib keeps its fee
 *   (`application_fee_percent`). So a creator needs nothing more than the
 *   Connect account they already sell with, the buyer's card is saved once
 *   on Storelib, and the webhook that already receives Storelib's events
 *   receives these.
 *
 *   THE SAME FEE. lib/billing/fee-calculator decides it for the price (the
 *   creator's plan's percent, plus 25 cents from $3), and that is sent as a
 *   percent of the price, which is the only form a subscription takes
 *   (lib/memberships/state.ts feePercentFor). Each renewal is then set to the
 *   exact figure while its invoice is still a draft (./webhook.ts).
 *
 *   PRICES ARE MADE WHEN THEY ARE NEEDED. A Stripe product per membership
 *   and a price per amount and interval, made at the first checkout for
 *   them and kept on the plan row. A creator who changes the price gets a
 *   new Stripe price for new members; existing members keep what they
 *   joined at, as on Patreon and Gumroad.
 *
 * When Stripe refuses (Billing not available on the platform account, a
 * restricted account), the checkout says so plainly and the reason is
 * written to the admin's Health view (lib/observability/report).
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { calculatePlatformFee } from "@/lib/billing/fee-calculator"
import { feePercentFor, type BillingInterval } from "./state"
import type { Db, PlanRow } from "./server"

/** The Stripe price for this plan's amount and interval: the kept one while the amount is unchanged, else a new one. */
export async function ensurePrice(admin: Db, plan: PlanRow, product: { id: string; title: string | null }, interval: BillingInterval): Promise<{ priceId: string; amountCents: number }> {
  const amount = interval === "year" ? plan.yearly_price_cents : plan.monthly_price_cents
  if (!amount) throw new Error(`no ${interval} price`)
  const keptId = interval === "year" ? plan.stripe_yearly_price_id : plan.stripe_monthly_price_id
  const keptAmount = interval === "year" ? plan.stripe_yearly_price_cents : plan.stripe_monthly_price_cents
  if (keptId && keptAmount === amount) return { priceId: keptId, amountCents: amount }

  let stripeProductId = plan.stripe_product_id || null
  if (!stripeProductId) {
    const made = await stripe.products.create(
      {
        name: (product.title || "Membership").slice(0, 250),
        metadata: { kind: "membership", product_id: product.id, creator_id: plan.creator_id },
      },
      { idempotencyKey: `membership-product:${product.id}` },
    )
    stripeProductId = made.id
  }
  const price = await stripe.prices.create(
    {
      product: stripeProductId,
      currency: plan.currency || "usd",
      unit_amount: amount,
      recurring: { interval },
      metadata: { kind: "membership", product_id: product.id },
    },
    { idempotencyKey: `membership-price:${product.id}:${interval}:${amount}` },
  )
  const kept =
    interval === "year"
      ? { stripe_product_id: stripeProductId, stripe_yearly_price_id: price.id, stripe_yearly_price_cents: amount }
      : { stripe_product_id: stripeProductId, stripe_monthly_price_id: price.id, stripe_monthly_price_cents: amount }
  await admin.from("membership_plans").update(kept).eq("product_id", product.id)
  return { priceId: price.id, amountCents: amount }
}

/** The platform fee for one payment of this amount, as the one time checkout computes it, and as the percent Stripe takes. */
export async function membershipFee(admin: Db, creatorId: string, amountCents: number): Promise<{ cents: number; percent: number; planId: string }> {
  const fee = await calculatePlatformFee(amountCents, creatorId, admin)
  return { cents: fee.platformFeeCents, percent: feePercentFor(amountCents, fee.platformFeeCents), planId: fee.planId }
}

/**
 * The buyer as a Stripe customer on the platform: the one an earlier
 * membership of theirs already made (any creator's), else a new one. One
 * customer per address keeps one saved card and one billing history.
 */
export async function buyerCustomer(admin: Db, buyer: { email: string; name: string; userId: string | null }): Promise<string> {
  const { data } = await admin
    .from("memberships")
    .select("stripe_customer_id")
    .eq("buyer_email", buyer.email)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
  const known = (data as { stripe_customer_id: string }[] | null)?.[0]?.stripe_customer_id
  if (known) {
    try {
      const c = await stripe.customers.retrieve(known)
      if (!(c as Stripe.DeletedCustomer).deleted) return known
    } catch {
      /* made with other keys, or deleted: a new one below */
    }
  }
  const made = await stripe.customers.create({
    email: buyer.email,
    name: buyer.name || undefined,
    metadata: { kind: "membership_buyer", user_id: buyer.userId || "" },
  })
  return made.id
}

export interface CreatedSubscription {
  subscription: Stripe.Subscription
  /** What the page confirms: the first invoice's payment, or, for a trial, the card to save. */
  intent: { type: "payment" | "setup"; clientSecret: string } | null
}

/** The subscription, waiting for the buyer's first payment or card. Its metadata is how the webhook knows it. */
export async function createSubscription(p: {
  customerId: string
  priceId: string
  trialDays: number
  destination: string
  feePercent: number
  metadata: Record<string, string>
  idempotencyKey: string
  paymentMethodId?: string | null
  /** The ways to pay the page's form loaded with (lib/checkout/payment-methods): the first invoice takes exactly those. */
  paymentMethodTypes?: ("card" | "link")[]
}): Promise<CreatedSubscription> {
  const params: Stripe.SubscriptionCreateParams = {
    customer: p.customerId,
    items: [{ price: p.priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: p.paymentMethodTypes && p.paymentMethodTypes.length ? p.paymentMethodTypes : ["card"] },
    transfer_data: { destination: p.destination },
    application_fee_percent: p.feePercent,
    metadata: p.metadata,
    expand: ["latest_invoice.confirmation_secret", "pending_setup_intent"],
  }
  if (p.trialDays > 0) {
    params.trial_period_days = p.trialDays
    /* A trial whose card never arrives ends instead of running on unpaid. */
    params.trial_settings = { end_behavior: { missing_payment_method: "cancel" } }
  }
  if (p.paymentMethodId) params.default_payment_method = p.paymentMethodId
  const subscription = await stripe.subscriptions.create(params, { idempotencyKey: p.idempotencyKey })
  return { subscription, intent: intentOf(subscription) }
}

export function intentOf(subscription: Stripe.Subscription): CreatedSubscription["intent"] {
  const setup = subscription.pending_setup_intent
  if (setup && typeof setup === "object" && setup.client_secret && setup.status !== "succeeded") {
    return { type: "setup", clientSecret: setup.client_secret }
  }
  const invoice = subscription.latest_invoice
  const secret = invoice && typeof invoice === "object" ? invoice.confirmation_secret?.client_secret : null
  if (secret && invoice && typeof invoice === "object" && invoice.status === "open") return { type: "payment", clientSecret: secret }
  return null
}

/** The PaymentIntent or SetupIntent id inside a client secret ("pi_123_secret_abc"). */
export function intentIdOf(clientSecret: string): string | null {
  const m = /^((?:pi|seti)_[A-Za-z0-9]+)_secret_[A-Za-z0-9]+$/.exec(clientSecret)
  return m ? m[1] : null
}

/**
 * THE CUSTOMER PORTAL, FOR THE CARD. Cancel and resume are Storelib's own
 * buttons (app/api/memberships/[id]/manage), so the portal is only asked to
 * change the card and show past invoices. Its configuration is made once by
 * this code and found again by its metadata, so the owner does not have to
 * save one in the Stripe dashboard first.
 */
let portalConfig: string | null = null
export async function portalConfiguration(): Promise<string> {
  if (portalConfig) return portalConfig
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 })
  const found = list.data.find((c) => c.metadata?.storelib === "memberships")
  if (found) return (portalConfig = found.id)
  const made = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Your membership on Storelib" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: false },
      subscription_cancel: { enabled: false },
    },
    metadata: { storelib: "memberships" },
  })
  return (portalConfig = made.id)
}

/** Stripe's refusal in one line for the admin's Health view: its code and message, no card or person. */
export function refusalReason(error: unknown): string {
  const e = error as { code?: string; type?: string; message?: string; raw?: { message?: string } }
  return [e?.type, e?.code, e?.raw?.message || e?.message].filter(Boolean).join(": ").slice(0, 400)
}

/**
 * What the buyer reads when Stripe would not start the subscription. A card
 * problem is theirs to fix; anything else is Storelib's, and says so.
 */
export function buyerMessageFor(error: unknown): string {
  const e = error as { type?: string; message?: string; raw?: { message?: string } }
  if (e?.type === "StripeCardError") return e.raw?.message || e.message || "The card was declined. Try another card."
  return "Memberships cannot be paid for right now. This is on our side and nothing was charged."
}
