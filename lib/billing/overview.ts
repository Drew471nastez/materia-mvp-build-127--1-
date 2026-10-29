import "server-only"

/**
 * ===========================================================================
 *  WHAT THE BILLING PANEL NEEDS TO DRAW ITSELF
 * ===========================================================================
 * This was the body of a page component, which is why billing WAS a page:
 * it talks to Stripe — the customer, the subscription, the invoices, the
 * card — and that is a real network round trip, so it had a route of its own
 * with a route-level skeleton in front of it.
 *
 * Lifted out here, the same work can be done for a tab instead. The tab
 * switches the instant it is pressed, and the panel fills in when Stripe
 * answers, rather than the whole screen being replaced by a spinner while a
 * navigation happens.
 */
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { FREE_STANDARD_RATE, ratePercentLabel } from "@/lib/payments/fees/config"
import { readPlanOverride } from "@/lib/billing/plan-override"
import { readSubscriptionRow, subscriptionReader } from "@/lib/billing/subscription-reader"
import { resolveSubscriptionView, STRIPE_READ_TIMEOUT_MS, type SubscriptionsRead } from "@/lib/billing/subscription-state"

const FREE_PLAN = {
  id: "free",
  name: "Free",
  price_cents: 0,
  billing_period: null,
  fee_percent: FREE_STANDARD_RATE,
  fee_fixed_cents: 25,
  features: [`${ratePercentLabel(FREE_STANDARD_RATE)} + $0.25 per transaction`, "Basic analytics", "Standard support"],
  is_active: true,
}

const GROWTH_PLAN = {
  id: "growth",
  // Sold as "Pro". The id stays "growth": it is the $29 Stripe price.
  name: "Pro",
  price_cents: 2900,
  billing_period: "month",
  fee_percent: 0.03,
  fee_fixed_cents: 25,
  features: ["3% + $0.25 per transaction", "Advanced analytics & reports", "Priority email support", "Custom domain support"],
  is_active: true,
}

const PRO_PLAN = {
  id: "pro",
  // The earlier $99 plan. No longer offered; kept so its subscribers still resolve.
  name: "Pro",
  price_cents: 9900,
  billing_period: "month",
  fee_percent: 0.015,
  fee_fixed_cents: 25,
  features: ["1.5% + $0.25 per transaction", "Premium analytics & reports", "Dedicated support", "White-label options", "API access"],
  is_active: true,
}

const FALLBACK_PLANS = [FREE_PLAN, GROWTH_PLAN, PRO_PLAN]
function safeTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === "string") return ts
  if (typeof ts === "number" && !isNaN(ts)) {
    // Stripe timestamps are Unix seconds; detect if already in ms
    const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  return new Date().toISOString()
}

export interface BillingOverview {
  plans: unknown[]
  subscription: unknown
  currentPlan: unknown
  invoices: unknown[]
  paymentMethod: unknown
  /** A plan set from /admin over what they pay for, or null. */
  override?: string | null
  /** Stripe could not be asked just now: the plan shown is the last one known (Stripe's last answer, or the stored plan). */
  stale?: boolean
}

/** Null when there is nobody signed in, or no creator to bill. */
export async function loadBillingOverview(store?: { creatorId: string }): Promise<BillingOverview | null> {

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let plans = FALLBACK_PLANS
  let subscription: any = null
  let currentPlan: any = FREE_PLAN
  let invoices: any[] = []
  let paymentMethod: any = null

  /* Round 42: the store the route checked (the owner's own, or the one a team member with Billing works in: lib/team/money), else the signed in account's own. */
  const { data: creator } = store
    ? await createAdminClient().from("creators").select("*").eq("id", store.creatorId).maybeSingle()
    : await createAdminClient().from("creators").select("*").eq("user_id", user.id).maybeSingle()

  if (!creator) return null

  try {
    const { data: dbPlans } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_cents", { ascending: true })

    if (dbPlans?.length) plans = dbPlans
  } catch (error) {
    console.error("[Billing] Error loading plans from DB:", error)
  }

  /*
    A READ: NO CUSTOMER IS CREATED HERE AND NOTHING IS WRITTEN. This used to
    create a Stripe customer, write the plan Stripe answered into creators and
    subscriptions, and, when the subscription list failed, write the creator
    back to Free (Step 5). The plan is the webhook's to write
    (lib/billing/subscription-sync.ts); a customer is made when the creator
    adds a card or checks out. Stripe failing shows the stored plan.
  */
  const stripeCustomerId: string | null = typeof creator.stripe_customer_id === "string" && creator.stripe_customer_id.startsWith("cus_") ? creator.stripe_customer_id : null
  const admin = createAdminClient()
  const row = await readSubscriptionRow(admin, creator.id)
  let subscriptionsRead: SubscriptionsRead | null = null

  if (stripeCustomerId || row?.stripe_customer_id) {
    /**
     * =========================================================================
     *  FOUR STRIPE REQUESTS, ONE ROUND TRIP OF LATENCY
     * =========================================================================
     * Issued together; the page waits once for the slowest rather than for the
     * sum. allSettled, not all: one Stripe endpoint failing must not take the
     * other three down with it. The subscriptions come through the shared
     * reader (lib/billing/subscription-reader.ts), so GET
     * /api/billing/subscription asked at the same moment shares the one call,
     * and each call has a deadline.
     */
    const timeout = { timeout: STRIPE_READ_TIMEOUT_MS }
    const [subsSettled, customerSettled, paymentMethodsSettled, invoicesSettled] =
      await Promise.allSettled([
        subscriptionReader.read([stripeCustomerId, row?.stripe_customer_id]),
        stripeCustomerId ? stripe.customers.retrieve(stripeCustomerId, {}, timeout) : Promise.reject(new Error("no customer")),
        stripeCustomerId ? stripe.paymentMethods.list({ customer: stripeCustomerId, type: "card", limit: 10 }, timeout) : Promise.reject(new Error("no customer")),
        stripeCustomerId ? stripe.invoices.list({ customer: stripeCustomerId, limit: 20 }, timeout) : Promise.reject(new Error("no customer")),
      ])

    /** Hand the rejection to the caller's own catch, so logging stays where it was. */
    const settled = <T,>(r: PromiseSettledResult<T>): T => {
      if (r.status === "rejected") throw r.reason
      return r.value
    }

    // Step 2: subscription (the reader never throws; a failure is an answer of its own)
    subscriptionsRead = subsSettled.status === "fulfilled" ? subsSettled.value : { ok: false, reason: "error", message: String(subsSettled.reason) }
    if (!subscriptionsRead.ok) console.error("[Billing] Stripe subscriptions not read; showing the stored plan:", subscriptionsRead.reason, subscriptionsRead.message)

    // Step 3: payment method (independent of subscription)
    if (stripeCustomerId) {
      try {
        const customer = settled(customerSettled) as unknown as import("stripe").Stripe.Customer
        if (!(customer as any).deleted) {
          const defaultPaymentMethodId = typeof customer.invoice_settings.default_payment_method === "string"
            ? customer.invoice_settings.default_payment_method
            : customer.invoice_settings.default_payment_method?.id || null

          const stripePaymentMethods = settled(paymentMethodsSettled)
          const defaultPaymentMethod = stripePaymentMethods.data.find((pm) => pm.id === defaultPaymentMethodId) || stripePaymentMethods.data[0]

          if (defaultPaymentMethod) {
            paymentMethod = {
              stripe_payment_method_id: defaultPaymentMethod.id,
              card_brand: defaultPaymentMethod.card?.brand || "unknown",
              card_last4: defaultPaymentMethod.card?.last4 || "0000",
              card_exp_month: defaultPaymentMethod.card?.exp_month || 0,
              card_exp_year: defaultPaymentMethod.card?.exp_year || 0,
              is_default: defaultPaymentMethod.id === defaultPaymentMethodId,
            }
          }
        }
      } catch (error) {
        console.error("[Billing] Error fetching payment methods from Stripe:", error)
      }

      // Step 4: invoices (independent of subscription and payment methods)
      try {
        const stripeInvoices = settled(invoicesSettled)
        invoices = stripeInvoices.data.map((inv) => ({
          id: inv.id,
          stripe_invoice_id: inv.id,
          amount_cents: inv.amount_paid || inv.total || 0,
          status: inv.status === "paid" ? "paid" : inv.status === "open" ? "open" : inv.status || "unknown",
          invoice_pdf_url: inv.invoice_pdf || null,
          hosted_invoice_url: inv.hosted_invoice_url || null,
          period_start: inv.period_start ? safeTimestamp(inv.period_start) : null,
          period_end: inv.period_end ? safeTimestamp(inv.period_end) : null,
          created_at: inv.created ? safeTimestamp(inv.created) : new Date().toISOString(),
          description: inv.lines?.data?.[0]?.description || "Subscription",
        }))
      } catch (error) {
        console.error("[Billing] Error fetching invoices from Stripe:", error)
      }
    }
  }

  /* Stripe's answer when there is one, the stored plan when there is not. Never Free because a read failed. */
  const view = resolveSubscriptionView({ planId: creator.subscription_plan_id ?? null, status: creator.subscription_status ?? null, row }, subscriptionsRead)
  currentPlan = (plans as { id?: string }[]).find((p) => p?.id === view.planId) ?? FALLBACK_PLANS.find((p) => p.id === view.planId) ?? FREE_PLAN
  subscription = view.subscription
    ? { ...view.subscription, ...(view.subscription.status === "canceled" ? {} : { subscription_plans: currentPlan }) }
    : null

  /*
    A PLAN SET FROM /admin IS THE PLAN. Every check reads it from the
    creator's columns already; this page asks Stripe instead, so it asks for
    the override too and shows the same plan. The subscription, card and
    invoices stay Stripe's, untouched.
  */
  const override = await readPlanOverride(admin, creator.id)
  if (override) {
    currentPlan = (plans as { id?: string }[]).find((p) => p?.id === override.planId) ?? FALLBACK_PLANS.find((p) => p.id === override.planId) ?? currentPlan
  }

  return { plans, subscription, currentPlan, invoices, paymentMethod, override: override?.planId ?? null, stale: view.stale }
}
