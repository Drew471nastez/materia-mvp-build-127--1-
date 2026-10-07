import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"
import { FREE_STANDARD_RATE, ratePercentLabel } from "@/lib/payments/fees/config"

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
  features: ["3% + $0.25 per sale", "Advanced analytics & reports", "Priority email support", "Custom domain support"],
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
  features: ["1.5% + $0.25 per sale", "Premium analytics & reports", "Dedicated support", "White-label options", "API access"],
  is_active: true,
}

const SUBSCRIBED_STATUSES = new Set(["active", "trialing", "past_due"])

function safeTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === "string") return ts
  if (typeof ts === "number" && !isNaN(ts)) {
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
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return "free"
}

function getPlanObject(planId: string) {
  if (planId === "growth") return GROWTH_PLAN
  if (planId === "pro") return PRO_PLAN
  return FREE_PLAN
}

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator, error: creatorError } = await createAdminClient()
      .from("creators")
      .select("id, subscription_plan_id, subscription_status, stripe_customer_id, slug, username")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Fetch directly from Stripe (source of truth)
    let stripeCustomerId: string | null = null
    try {
      stripeCustomerId = await getOrCreateStripeCustomer({
        creatorId: creator.id,
        existingCustomerId: creator.stripe_customer_id,
        email: user.email,
        userId: user.id,
        username: creator.username || creator.slug || "creator",
      })
    } catch (err) {
      console.error("[Subscription API] Error getting Stripe customer:", err)
    }

    if (!stripeCustomerId) {
      return NextResponse.json({
        subscription: null,
        currentPlan: FREE_PLAN,
        status: "inactive",
      })
    }

    try {
      // Expand latest_invoice to get period dates (SDK v20 removed current_period_start/end)
      const stripeSubs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        limit: 10,
        expand: ["data.latest_invoice"],
      })
      const preferredSubscription = stripeSubs.data.find((s) => SUBSCRIBED_STATUSES.has(s.status)) ?? stripeSubs.data[0]

      if (preferredSubscription && SUBSCRIBED_STATUSES.has(preferredSubscription.status)) {
        const sub = preferredSubscription as any
        const currentPriceId = sub.items?.data?.[0]?.price?.id
        const livePlanId = getPlanIdFromPriceId(currentPriceId)
        const currentPlan = getPlanObject(livePlanId)

        // Robust period extraction with multiple fallbacks (SDK v20 removed current_period_start/end)
        let periodStart: any = null
        let periodEnd: any = null

        // Priority 1: Legacy top-level fields
        if (sub.current_period_start) periodStart = sub.current_period_start
        if (sub.current_period_end) periodEnd = sub.current_period_end

        // Priority 2: SDK v20 current_period object
        if (!periodStart && sub.current_period?.start_date) periodStart = sub.current_period.start_date
        if (!periodEnd && sub.current_period?.end_date) periodEnd = sub.current_period.end_date

        // Priority 3: latest_invoice period fields (try ALL possible field names)
        const inv = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice : null
        if (inv) {
          if (!periodStart && inv.period_start) periodStart = inv.period_start
          if (!periodEnd && inv.period_end) periodEnd = inv.period_end
          // Try new object format: invoice.period.start_date / end_date
          if (!periodStart && inv.period?.start_date) periodStart = inv.period.start_date
          if (!periodEnd && inv.period?.end_date) periodEnd = inv.period.end_date
          // Try: invoice.period.start / end
          if (!periodStart && inv.period?.start) periodStart = inv.period.start
          if (!periodEnd && inv.period?.end) periodEnd = inv.period.end

          // Priority 4: invoice line items period
          if (!periodStart || !periodEnd) {
            const lineItem = inv.lines?.data?.[0]
            if (lineItem?.period) {
              if (!periodStart && lineItem.period.start) periodStart = lineItem.period.start
              if (!periodEnd && lineItem.period.end) periodEnd = lineItem.period.end
            }
          }
        }

        // Priority 5: Compute from billing_cycle_anchor (use DATE-ONLY comparison)
        if (!periodEnd || (periodStart && periodEnd && String(periodStart) === String(periodEnd))) {
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
            periodEnd = anchorDate.toISOString()
            if (!periodStart) {
              const startDate = new Date(anchorDate)
              startDate.setMonth(startDate.getMonth() - 1)
              periodStart = startDate.toISOString()
            }
          }
        }

        console.log("[Subscription API] Period extraction:", { periodStart, periodEnd, hasInvoice: !!inv })

        const subscription = {
          id: sub.id,
          stripe_subscription_id: sub.id,
          plan_id: livePlanId,
          pending_plan_id: (sub.metadata?.pending_plan_id as string) || null,
          status: sub.status,
          current_period_start: safeTimestamp(periodStart),
          current_period_end: safeTimestamp(periodEnd),
          cancel_at_period_end: sub.cancel_at_period_end,
          subscription_plans: currentPlan,
        }

        // Sync to DB (non-blocking)
        try {
          await createAdminClient()
            .from("creators")
            .update({
              stripe_customer_id: stripeCustomerId,
              subscription_plan_id: livePlanId,
              subscription_status: sub.status,
            })
            .eq("id", creator.id)

          await createAdminClient()
            .from("subscriptions")
            .upsert({
              creator_id: creator.id,
              stripe_subscription_id: sub.id,
              stripe_customer_id: stripeCustomerId,
              plan_id: livePlanId,
              pending_plan_id: null,
              status: sub.status,
              current_period_start: safeTimestamp(periodStart),
              current_period_end: safeTimestamp(periodEnd),
              cancel_at_period_end: sub.cancel_at_period_end,
              updated_at: new Date().toISOString(),
            }, { onConflict: "creator_id" })
        } catch (syncError) {
          console.error("[Subscription API] DB sync error:", syncError)
        }

        return NextResponse.json({
          subscription,
          currentPlan,
          status: sub.status,
        })
      }

      // No active subscription — check for a recently canceled one so the UI can show the notice
      const canceledSub = stripeSubs.data.find((s: any) => s.status === "canceled")
      if (canceledSub) {
        const canceledPriceId = canceledSub.items?.data?.[0]?.price?.id
        const canceledPlanId = getPlanIdFromPriceId(canceledPriceId)
        const canceledSubscription = {
          id: canceledSub.id,
          stripe_subscription_id: canceledSub.id,
          plan_id: canceledPlanId,
          status: "canceled" as const,
          canceled_at: (canceledSub as any).canceled_at
            ? safeTimestamp((canceledSub as any).canceled_at)
            : null,
          cancel_at_period_end: false,
          current_period_end: (canceledSub as any).ended_at
            ? safeTimestamp((canceledSub as any).ended_at)
            : null,
        }

        return NextResponse.json({
          subscription: canceledSubscription,
          currentPlan: FREE_PLAN,
          status: "canceled",
        })
      }
    } catch (err) {
      console.error("[Subscription API] Stripe fetch error:", err)
    }

    // No active subscription found — sync DB back to free plan
    // This fixes stale plan data if a webhook was missed or failed
    if (creator.subscription_plan_id !== "free" || creator.subscription_status !== "active") {
      console.log("[Subscription API] No active Stripe subscription, resetting creator to free plan:", {
        creatorId: creator.id,
        stalePlan: creator.subscription_plan_id,
        staleStatus: creator.subscription_status,
      })
      try {
        await createAdminClient()
          .from("creators")
          .update({
            subscription_plan_id: "free",
            subscription_status: "active",
            stripe_customer_id: stripeCustomerId,
          })
          .eq("id", creator.id)
      } catch (syncError) {
        console.error("[Subscription API] Failed to reset creator to free:", syncError)
      }
    }

    return NextResponse.json({
      subscription: null,
      currentPlan: FREE_PLAN,
      status: "inactive",
    })
  } catch (error) {
    console.error("Error in GET /api/billing/subscription:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
