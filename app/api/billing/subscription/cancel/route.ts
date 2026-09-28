import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

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

export async function POST() {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator record
    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Get current subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("creator_id", creator.id)
      .maybeSingle()

    if (subscriptionError) {
      console.error("Error fetching subscription:", subscriptionError)
      return NextResponse.json(
        { error: "Failed to fetch subscription" },
        { status: 500 }
      )
    }

    if (!subscription || !subscription.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      )
    }

    // Release any existing subscription schedule first (e.g. from a pending downgrade)
    const stripeSub = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    ) as any

    const existingScheduleId = stripeSub.schedule
      ? (typeof stripeSub.schedule === "string" ? stripeSub.schedule : stripeSub.schedule.id)
      : null

    if (existingScheduleId) {
      console.log("[Cancel] Releasing existing schedule:", existingScheduleId)
      try {
        await stripe.subscriptionSchedules.release(existingScheduleId)
      } catch (releaseErr: any) {
        console.warn("[Cancel] Could not release schedule:", releaseErr.message)
        try {
          await stripe.subscriptionSchedules.cancel(existingScheduleId)
        } catch (cancelErr: any) {
          console.warn("[Cancel] Could not cancel schedule either:", cancelErr.message)
        }
      }
    }

    // Now safe to cancel subscription at period end in Stripe
    const canceledSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        cancel_at_period_end: true,
        metadata: { ...stripeSub.metadata, pending_plan_id: "" },
      }
    )

    // Update subscription in database
    await createAdminClient()
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id)

    // Get the period end from the canceled subscription with robust fallbacks
    const cancelSub = canceledSubscription as any
    let cancelPeriodEnd: any = cancelSub.current_period_end || cancelSub.current_period?.end_date || null
    if (!cancelPeriodEnd) {
      // Try cancel_at field (Stripe sets this on cancel_at_period_end)
      cancelPeriodEnd = cancelSub.cancel_at || null
    }
    if (!cancelPeriodEnd) {
      // Compute from billing_cycle_anchor
      const anchor = cancelSub.billing_cycle_anchor || cancelSub.start_date
      if (anchor) {
        const anchorMs = typeof anchor === "number" ? (anchor > 1e12 ? anchor : anchor * 1000) : new Date(anchor).getTime()
        const anchorDate = new Date(anchorMs)
        const now = new Date()
        while (anchorDate <= now) anchorDate.setMonth(anchorDate.getMonth() + 1)
        cancelPeriodEnd = anchorDate.toISOString()
      }
    }

    return NextResponse.json({
      success: true,
      message: "Subscription will be canceled at the end of the current billing period",
      cancelAt: safeTimestamp(cancelPeriodEnd),
    })
  } catch (error: any) {
    console.error("Error in POST /api/billing/subscription/cancel:", error)
    return NextResponse.json(
      { error: error.message || "Failed to cancel subscription" },
      { status: 500 }
    )
  }
}
