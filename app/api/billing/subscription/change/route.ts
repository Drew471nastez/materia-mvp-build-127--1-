import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

const PLAN_ORDER: Record<string, number> = { free: 0, growth: 1, pro: 2 }

// LIVE Stripe Price IDs
const PRICE_GROWTH = process.env.PRICE_GROWTH_MONTHLY || "price_1SzBWaBYevnBVyznNCTOXDoS"
const PRICE_PRO = process.env.PRICE_PRO_MONTHLY || "price_1SzBXSBYevnBVyznYjXfOOXX"

function getStripePriceId(planId: string): string | null {
  if (planId === "growth") return PRICE_GROWTH
  if (planId === "pro") return PRICE_PRO
  return null
}

function getPlanIdFromPriceId(priceId: string | undefined): "growth" | "pro" | "free" {
  if (!priceId) return "free"
  if (priceId === PRICE_GROWTH) return "growth"
  if (priceId === PRICE_PRO) return "pro"
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return "free"
}

function isUpgrade(currentPlanId: string, newPlanId: string): boolean {
  return (PLAN_ORDER[newPlanId] ?? 0) > (PLAN_ORDER[currentPlanId] ?? 0)
}

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

// Extract period dates from subscription (SDK v20: current_period_start/end removed)
function getSubscriptionPeriod(sub: any): { periodStart: number; periodEnd: number } {
  // Try legacy fields first (may still be on the raw API response)
  if (sub.current_period_start && sub.current_period_end) {
    return { periodStart: sub.current_period_start, periodEnd: sub.current_period_end }
  }
  // Try new current_period object
  if (sub.current_period?.start_date && sub.current_period?.end_date) {
    return {
      periodStart: Math.floor(new Date(sub.current_period.start_date).getTime() / 1000),
      periodEnd: Math.floor(new Date(sub.current_period.end_date).getTime() / 1000),
    }
  }
  // Fallback: derive from latest_invoice
  const invoice = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null
  if (invoice?.period_start && invoice?.period_end) {
    return { periodStart: invoice.period_start, periodEnd: invoice.period_end }
  }
  // Last resort: start_date + 30 days
  const start = sub.start_date || Math.floor(Date.now() / 1000)
  return { periodStart: start, periodEnd: start + 30 * 24 * 60 * 60 }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { newPlanId, previewOnly } = await request.json()

    if (!newPlanId) {
      return NextResponse.json({ error: "Plan ID is required" }, { status: 400 })
    }

    if (newPlanId === "free") {
      return NextResponse.json({ error: "To downgrade to Free, please cancel your subscription" }, { status: 400 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id, subscription_plan_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const stripePriceId = getStripePriceId(newPlanId)
    if (!stripePriceId) {
      return NextResponse.json({ error: "No Stripe price configured for this plan" }, { status: 400 })
    }

    const { data: subscriptionRecord } = await supabase
      .from("subscriptions")
      .select("id, stripe_subscription_id")
      .eq("creator_id", creator.id)
      .maybeSingle()

    if (!subscriptionRecord?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found. Please create a new subscription instead." },
        { status: 400 },
      )
    }

    // Expand latest_invoice to get period dates (SDK v20 removed current_period_start/end)
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscriptionRecord.stripe_subscription_id,
      { expand: ["latest_invoice"] }
    ) as any
    const subItem = stripeSubscription.items.data[0]
    if (!subItem) {
      return NextResponse.json({ error: "Subscription item not found" }, { status: 400 })
    }

    const currentPlanId = getPlanIdFromPriceId(subItem.price.id) || creator.subscription_plan_id || "free"
    const upgrading = isUpgrade(currentPlanId, newPlanId)

    const { periodStart, periodEnd } = getSubscriptionPeriod(stripeSubscription)

    // Stripe SDK v20: use createPreview instead of retrieveUpcoming
    const upcomingInvoice = await stripe.invoices.createPreview({
      subscription: stripeSubscription.id,
      subscription_details: {
        items: [{ id: subItem.id, price: stripePriceId }],
        proration_behavior: upgrading ? "create_prorations" : "none",
      },
    })

    const amountDueNowCents = upgrading ? Math.max(0, upcomingInvoice.amount_due || 0) : 0

    const nextBillingDate = safeTimestamp(periodEnd)
    const nextAmountCents = subItem.price.id === stripePriceId
      ? subItem.price.unit_amount || 0
      : upcomingInvoice.lines.data
          .find((line: any) => line.price?.id === stripePriceId && !line.proration)
          ?.amount || 0

    if (previewOnly) {
      return NextResponse.json({
        success: true,
        type: upgrading ? "upgrade" : "downgrade",
        amountDueTodayCents: upgrading ? Math.max(0, upcomingInvoice.amount_due || 0) : 0,
        nextBillingDate,
        nextAmountCents: Math.abs(nextAmountCents),
      })
    }

    if (upgrading) {
      const updatedSubscription = await stripe.subscriptions.update(subscriptionRecord.stripe_subscription_id, {
        items: [{ id: subItem.id, price: stripePriceId }],
        proration_behavior: "create_prorations",
        metadata: {
          creator_id: creator.id,
          plan_id: newPlanId,
        },
      })

      // Get updated period from the updated subscription
      const updatedPeriod = getSubscriptionPeriod(updatedSubscription as any)

      await supabase
        .from("subscriptions")
        .update({
          plan_id: newPlanId,
          status: updatedSubscription.status,
          current_period_start: safeTimestamp(updatedPeriod.periodStart),
          current_period_end: safeTimestamp(updatedPeriod.periodEnd),
          pending_plan_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionRecord.id)

      await supabase
        .from("creators")
        .update({ subscription_plan_id: newPlanId, subscription_status: updatedSubscription.status })
        .eq("id", creator.id)

      return NextResponse.json({
        success: true,
        type: "upgrade",
        message: "Upgrade applied immediately with Stripe proration.",
        amountDueTodayCents: Math.max(0, upcomingInvoice.amount_due || 0),
        nextBillingDate,
        nextAmountCents: Math.abs(nextAmountCents),
      })
    }

    // Downgrade: schedule for end of current period
    let schedule = null as any
    if (stripeSubscription.schedule) {
      schedule = await stripe.subscriptionSchedules.retrieve(
        typeof stripeSubscription.schedule === "string" ? stripeSubscription.schedule : stripeSubscription.schedule.id,
      )
    } else {
      schedule = await stripe.subscriptionSchedules.create({ from_subscription: stripeSubscription.id })
    }

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: subItem.price.id, quantity: 1 }],
          start_date: periodStart,
          end_date: periodEnd,
          proration_behavior: "none",
        },
        {
          items: [{ price: stripePriceId, quantity: 1 }],
          start_date: periodEnd,
          proration_behavior: "none",
        },
      ],
    })

    await stripe.subscriptions.update(subscriptionRecord.stripe_subscription_id, {
      metadata: { ...stripeSubscription.metadata, pending_plan_id: newPlanId },
    })

    await supabase
      .from("subscriptions")
      .update({
        pending_plan_id: newPlanId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionRecord.id)

    return NextResponse.json({
      success: true,
      type: "downgrade",
      message: "Downgrade scheduled for end of cycle.",
      effectiveDate: safeTimestamp(periodEnd),
      nextBillingDate,
      nextAmountCents: Math.abs(nextAmountCents),
      amountDueTodayCents: amountDueNowCents,
    })
  } catch (error: any) {
    console.error("Error in POST /api/billing/subscription/change:", error)
    return NextResponse.json({ error: error.message || "Failed to change subscription" }, { status: 500 })
  }
}
