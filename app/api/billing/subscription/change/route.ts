import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

const PLAN_ORDER: Record<string, number> = { free: 0, growth: 1, pro: 2 }

function getStripePriceId(planId: string): string | null {
  if (planId === "growth") return process.env.PRICE_GROWTH_MONTHLY || null
  if (planId === "pro") return process.env.PRICE_PRO_MONTHLY || null
  return null
}

function getPlanIdFromPriceId(priceId: string | undefined): "growth" | "pro" | "free" {
  if (!priceId) return "free"
  if (priceId === process.env.PRICE_GROWTH_MONTHLY) return "growth"
  if (priceId === process.env.PRICE_PRO_MONTHLY) return "pro"
  return "free"
}

function isUpgrade(currentPlanId: string, newPlanId: string): boolean {
  return (PLAN_ORDER[newPlanId] ?? 0) > (PLAN_ORDER[currentPlanId] ?? 0)
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

    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionRecord.stripe_subscription_id)
    const subItem = stripeSubscription.items.data[0]
    if (!subItem) {
      return NextResponse.json({ error: "Subscription item not found" }, { status: 400 })
    }

    const currentPlanId = getPlanIdFromPriceId(subItem.price.id) || creator.subscription_plan_id || "free"
    const upgrading = isUpgrade(currentPlanId, newPlanId)

    const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
      subscription: stripeSubscription.id,
      subscription_items: [{ id: subItem.id, price: stripePriceId }],
      subscription_proration_behavior: upgrading ? "create_prorations" : "none",
    })

    const amountDueNowCents = upgrading ? Math.max(0, upcomingInvoice.amount_due || 0) : 0

    const nextBillingDate = new Date(stripeSubscription.current_period_end * 1000).toISOString()
    const nextAmountCents = subItem.price.id === stripePriceId
      ? subItem.price.unit_amount || 0
      : upcomingInvoice.lines.data
          .find((line) => line.price?.id === stripePriceId && !line.proration)
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

      await supabase
        .from("subscriptions")
        .update({
          plan_id: newPlanId,
          status: updatedSubscription.status,
          current_period_start: new Date(updatedSubscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(updatedSubscription.current_period_end * 1000).toISOString(),
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
          start_date: stripeSubscription.current_period_start,
          end_date: stripeSubscription.current_period_end,
          proration_behavior: "none",
        },
        {
          items: [{ price: stripePriceId, quantity: 1 }],
          start_date: stripeSubscription.current_period_end,
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
      effectiveDate: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      nextBillingDate,
      nextAmountCents: Math.abs(nextAmountCents),
      amountDueTodayCents: amountDueNowCents,
    })
  } catch (error: any) {
    console.error("Error in POST /api/billing/subscription/change:", error)
    return NextResponse.json({ error: error.message || "Failed to change subscription" }, { status: 500 })
  }
}
