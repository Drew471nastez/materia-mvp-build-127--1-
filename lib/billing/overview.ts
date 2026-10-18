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
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"
import { FREE_STANDARD_RATE, ratePercentLabel } from "@/lib/payments/fees/config"
import { readPlanOverride, recordPaidPlan } from "@/lib/billing/plan-override"

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
const SUBSCRIBED_STATUSES = new Set(["active", "trialing", "past_due"])

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

// LIVE Stripe Price IDs
const PRICE_GROWTH = process.env.PRICE_GROWTH_MONTHLY || "price_1SzBWaBYevnBVyznNCTOXDoS"
const PRICE_PRO = process.env.PRICE_PRO_MONTHLY || "price_1SzBXSBYevnBVyznYjXfOOXX"

function getPlanIdFromPriceId(priceId: string | undefined): "growth" | "pro" | "free" {
  if (!priceId) return "free"
  if (priceId === PRICE_GROWTH) return "growth"
  if (priceId === PRICE_PRO) return "pro"
  // Also check by partial match (in case of price ID variants)
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return "free"
}


export interface BillingOverview {
  plans: unknown[]
  subscription: unknown
  currentPlan: unknown
  invoices: unknown[]
  paymentMethod: unknown
  /** A plan set from /admin over what they pay for, or null. */
  override?: string | null
}

/** Null when there is nobody signed in, or no creator to bill. */
export async function loadBillingOverview(): Promise<BillingOverview | null> {

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

  const { data: creator } = await createAdminClient().from("creators").select("*").eq("user_id", user.id).maybeSingle()

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

  let stripeCustomerId: string | null = null

  // Step 1: Get or create Stripe customer
  try {
    stripeCustomerId = await getOrCreateStripeCustomer({
      creatorId: creator.id,
      existingCustomerId: creator.stripe_customer_id,
      email: user.email,
      userId: user.id,
      username: creator.username || creator.slug || "creator",
    })
  } catch (error) {
    console.error("[Billing] Error getting Stripe customer:", error)
  }

  if (stripeCustomerId) {
    /**
     * =========================================================================
     *  FOUR STRIPE REQUESTS, ONE ROUND TRIP OF LATENCY
     * =========================================================================
     *
     * These used to run one after another -- subscriptions, then the customer,
     * then payment methods, then invoices -- each one waiting for the last. The
     * comments beside them already said "independent of subscription" and
     * "independent of subscription and payment methods", so the sequencing was
     * never deliberate; it was just how await reads. On a server component that
     * blocks the FIRST BYTE of the response, so the page could not begin
     * streaming until four consecutive Stripe round trips had finished. That is
     * the billing page taking seconds and sitting on a skeleton to do it.
     *
     * They are issued together now and the page waits once for the slowest
     * rather than for the sum.
     *
     * allSettled, not all: one Stripe endpoint failing must not take the other
     * three down with it. Each result is unwrapped INSIDE the try/catch that
     * already existed for it, so a rejection is still logged by the same handler
     * and still leaves the rest of the page renderable -- the failure behaviour
     * is unchanged, only the waiting is.
     */
    const [subsSettled, customerSettled, paymentMethodsSettled, invoicesSettled] =
      await Promise.allSettled([
        stripe.subscriptions.list({
          customer: stripeCustomerId,
          limit: 10,
          expand: ["data.latest_invoice"],
        }),
        stripe.customers.retrieve(stripeCustomerId),
        stripe.paymentMethods.list({ customer: stripeCustomerId, type: "card", limit: 10 }),
        stripe.invoices.list({ customer: stripeCustomerId, limit: 20 }),
      ])

    /** Hand the rejection to the caller's own catch, so logging stays where it was. */
    const settled = <T,>(r: PromiseSettledResult<T>): T => {
      if (r.status === "rejected") throw r.reason
      return r.value
    }

    // Step 2: subscription
    try {
      const stripeSubs = settled(subsSettled)
      const preferredSubscription = stripeSubs.data.find((s) => SUBSCRIBED_STATUSES.has(s.status)) ?? stripeSubs.data[0]

      if (preferredSubscription && SUBSCRIBED_STATUSES.has(preferredSubscription.status)) {
        const currentPriceId = preferredSubscription.items.data[0]?.price?.id
        const livePlanId = getPlanIdFromPriceId(currentPriceId)
        currentPlan = plans.find((p: any) => p.id === livePlanId) ?? FREE_PLAN

        // Extract period dates with robust fallback chain (SDK v20 removed current_period_start/end)
        const sub = preferredSubscription as any
        let periodStartTs: any = null
        let periodEndTs: any = null

        // Priority 1: Legacy top-level fields (older API versions still send these)
        if (sub.current_period_start) periodStartTs = sub.current_period_start
        if (sub.current_period_end) periodEndTs = sub.current_period_end

        // Priority 2: SDK v20 current_period object
        if (!periodStartTs && sub.current_period?.start_date) periodStartTs = sub.current_period.start_date
        if (!periodEndTs && sub.current_period?.end_date) periodEndTs = sub.current_period.end_date

        // Priority 3: latest_invoice period fields (try ALL possible field names)
        const inv = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice : null
        if (inv) {
          if (!periodStartTs && inv.period_start) periodStartTs = inv.period_start
          if (!periodEndTs && inv.period_end) periodEndTs = inv.period_end
          // Try new object format: invoice.period.start_date / end_date
          if (!periodStartTs && inv.period?.start_date) periodStartTs = inv.period.start_date
          if (!periodEndTs && inv.period?.end_date) periodEndTs = inv.period.end_date
          // Try: invoice.period.start / end
          if (!periodStartTs && inv.period?.start) periodStartTs = inv.period.start
          if (!periodEndTs && inv.period?.end) periodEndTs = inv.period.end

          // Priority 4: invoice line items period
          if (!periodStartTs || !periodEndTs) {
            const lineItem = inv.lines?.data?.[0]
            if (lineItem?.period) {
              if (!periodStartTs && lineItem.period.start) periodStartTs = lineItem.period.start
              if (!periodEndTs && lineItem.period.end) periodEndTs = lineItem.period.end
            }
          }
        }

        // Priority 5: Compute from billing_cycle_anchor (use DATE-ONLY comparison)
        if (!periodEndTs || (periodStartTs && periodEndTs && String(periodStartTs) === String(periodEndTs))) {
          const anchor = sub.billing_cycle_anchor || sub.start_date
          if (anchor) {
            const anchorMs = typeof anchor === "number" ? (anchor > 1e12 ? anchor : anchor * 1000) : new Date(anchor).getTime()
            const anchorDate = new Date(anchorMs)
            const now = new Date()
            // Compare by date only (ignore time) so same-day billing anchor advances correctly
            const anchorDay = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())
            const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            while (anchorDay <= todayDay) {
              anchorDate.setMonth(anchorDate.getMonth() + 1)
              anchorDay.setMonth(anchorDay.getMonth() + 1)
            }
            periodEndTs = anchorDate.toISOString()
            if (!periodStartTs) {
              const startDate = new Date(anchorDate)
              startDate.setMonth(startDate.getMonth() - 1)
              periodStartTs = startDate.toISOString()
            }
          }
        }

        console.log("[Billing] Period extraction:", { periodStartTs, periodEndTs, hasInvoice: !!inv })

        subscription = {
          id: preferredSubscription.id,
          stripe_subscription_id: preferredSubscription.id,
          plan_id: livePlanId,
          pending_plan_id: (preferredSubscription.metadata?.pending_plan_id as string) || null,
          status: preferredSubscription.status,
          current_period_start: safeTimestamp(periodStartTs),
          current_period_end: safeTimestamp(periodEndTs),
          cancel_at_period_end: preferredSubscription.cancel_at_period_end,
          subscription_plans: currentPlan,
        }

        // Sync to DB (non-blocking, don't let DB errors break billing page)
        try {
          await createAdminClient()
            .from("creators")
            .update({
              stripe_customer_id: stripeCustomerId,
              subscription_plan_id: livePlanId,
              subscription_status: preferredSubscription.status,
            })
            .eq("id", creator.id)

          await createAdminClient()
            .from("subscriptions")
            .upsert({
              creator_id: creator.id,
              stripe_subscription_id: preferredSubscription.id,
              stripe_customer_id: stripeCustomerId,
              plan_id: livePlanId,
              pending_plan_id: null,
              status: preferredSubscription.status,
              current_period_start: safeTimestamp(periodStartTs),
              current_period_end: safeTimestamp(periodEndTs),
              cancel_at_period_end: preferredSubscription.cancel_at_period_end,
              updated_at: new Date().toISOString(),
            }, { onConflict: "creator_id" })
        } catch (syncError) {
          console.error("[Billing] Error syncing subscription to DB:", syncError)
        }
        /* An admin's plan over this one keeps it as the plan clearing returns to (lib/billing/plan-override.ts). */
        await recordPaidPlan(createAdminClient(), creator.id, livePlanId, preferredSubscription.status)
      }

      // If no active subscription found, check for a recently canceled one so the UI can show the notice
      if (!subscription) {
        const canceledSub = stripeSubs.data.find((s: any) => s.status === "canceled")
        if (canceledSub) {
          const canceledPriceId = canceledSub.items.data[0]?.price?.id
          subscription = {
            id: canceledSub.id,
            stripe_subscription_id: canceledSub.id,
            plan_id: getPlanIdFromPriceId(canceledPriceId),
            status: "canceled",
            canceled_at: (canceledSub as any).canceled_at
              ? safeTimestamp((canceledSub as any).canceled_at)
              : null,
            cancel_at_period_end: false,
            current_period_end: (canceledSub as any).ended_at
              ? safeTimestamp((canceledSub as any).ended_at)
              : null,
          }
        }
      }
    } catch (error) {
      console.error("[Billing] Error fetching subscriptions from Stripe:", error)
    }

    // Step 3: Fetch payment methods from Stripe (independent of subscription)
    try {
      const customer = settled(customerSettled)
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

    // Step 4: Fetch invoices from Stripe (independent of subscription and payment methods)
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

    // Step 5: If no subscription found, sync free plan to DB
    if (!subscription) {
      currentPlan = FREE_PLAN
      await recordPaidPlan(createAdminClient(), creator.id, "free", "active")
      try {
        await createAdminClient()
          .from("creators")
          .update({ subscription_plan_id: "free", subscription_status: "active" })
          .eq("id", creator.id)
      } catch (error) {
        console.error("[Billing] Error syncing free plan to DB:", error)
      }
    }
  }


  /*
    A PLAN SET FROM /admin IS THE PLAN. Every check reads it from the
    creator's columns already; this page asks Stripe instead, so it asks for
    the override too and shows the same plan. The subscription, card and
    invoices stay Stripe's, untouched.
  */
  const override = await readPlanOverride(createAdminClient(), creator.id)
  if (override) {
    currentPlan = (plans as { id?: string }[]).find((p) => p?.id === override.planId) ?? FALLBACK_PLANS.find((p) => p.id === override.planId) ?? currentPlan
  }

  return { plans, subscription, currentPlan, invoices, paymentMethod, override: override?.planId ?? null }
}
