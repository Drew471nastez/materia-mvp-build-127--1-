import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

/**
 * POST /api/billing/subscription/resume
 *
 * Undoes a cancel at the period's end (app/api/billing/subscription/cancel):
 * the same subscription carries on and renews on its usual day, nothing is
 * charged now. Only a subscription that is still running and set to cancel
 * can be resumed; one that has already ended needs a new checkout.
 *
 * Stripe is the source of truth, so the subscription is read from Stripe and
 * the answer is what Stripe says after the update. The webhook
 * (customer.subscription.updated) writes the same thing to the database
 * again; this writes it now so the page is right without waiting for it.
 */
const RUNNING = new Set(["active", "trialing", "past_due"])

function iso(ts: unknown): string | null {
  if (typeof ts === "number" && Number.isFinite(ts)) return new Date((ts > 1e12 ? ts : ts * 1000)).toISOString()
  if (typeof ts === "string" && !Number.isNaN(Date.parse(ts))) return new Date(ts).toISOString()
  return null
}

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("id, stripe_subscription_id")
      .eq("creator_id", creator.id)
      .maybeSingle()
    if (subscriptionError) return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 })
    if (!subscription?.stripe_subscription_id) {
      return NextResponse.json({ error: "No subscription to resume" }, { status: 400 })
    }

    const live = (await stripe.subscriptions.retrieve(subscription.stripe_subscription_id)) as any
    if (!RUNNING.has(live.status)) {
      return NextResponse.json({ error: "This plan has already ended. Choose Pro again to start a new one." }, { status: 409 })
    }

    /* Cancelled here (or in Stripe's portal) it is cancel_at_period_end; newer Stripe versions may set cancel_at instead. */
    const resumed = live.cancel_at_period_end
      ? ((await stripe.subscriptions.update(live.id, { cancel_at_period_end: false })) as any)
      : live.cancel_at
        ? ((await stripe.subscriptions.update(live.id, { cancel_at: "" })) as any)
        : live

    const renewsAt =
      iso(resumed.current_period_end) ?? iso(resumed.items?.data?.[0]?.current_period_end) ?? iso(resumed.current_period?.end_date)

    const admin = createAdminClient()
    await admin
      .from("subscriptions")
      .update({ cancel_at_period_end: false, canceled_at: null, updated_at: new Date().toISOString() })
      .eq("id", subscription.id)

    /* The reason given stays; the row says the cancellation was undone. Before SQL part 128 there is no table, and that is fine. */
    const { error: markError } = await admin
      .from("plan_cancellations")
      .update({ resumed_at: new Date().toISOString() })
      .eq("creator_id", creator.id)
      .eq("stripe_subscription_id", live.id)
      .is("resumed_at", null)
    if (markError) console.warn("[Resume] plan_cancellations not updated:", markError.message)

    return NextResponse.json({ success: true, cancelAtPeriodEnd: false, renewsAt })
  } catch (error: any) {
    console.error("Error in POST /api/billing/subscription/resume:", error)
    return NextResponse.json({ error: error?.message || "Failed to resume subscription" }, { status: 500 })
  }
}
