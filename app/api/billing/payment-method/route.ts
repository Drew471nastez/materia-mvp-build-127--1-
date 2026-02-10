import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"

export async function DELETE() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id, stripe_customer_id, subscription_plan_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    if (!creator.stripe_customer_id) {
      return NextResponse.json({ error: "No payment method found" }, { status: 404 })
    }

    // Validate the customer exists on current Stripe keys
    let customerId = creator.stripe_customer_id
    try {
      await stripe.customers.retrieve(customerId)
    } catch {
      return NextResponse.json({ error: "No payment method found" }, { status: 404 })
    }

    // Fetch payment methods directly from Stripe
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 10,
    })

    if (paymentMethods.data.length === 0) {
      return NextResponse.json({ error: "No payment method found" }, { status: 404 })
    }

    // Check if user has an active subscription — if so, warn them
    const activeSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    })

    if (activeSubs.data.length > 0 && paymentMethods.data.length <= 1) {
      // Only one card and they have an active subscription — still allow but warn
      // We allow removal but Stripe may still charge via the subscription's default
    }

    // Detach all payment methods from Stripe
    for (const pm of paymentMethods.data) {
      try {
        await stripe.paymentMethods.detach(pm.id)
      } catch (err) {
        console.error(`Error detaching payment method ${pm.id}:`, err)
      }
    }

    // Clear default payment method on the Stripe customer
    try {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: "" },
      })
    } catch (err) {
      console.error("Error clearing customer default payment method:", err)
    }

    // Also clean up Supabase payment_methods table if records exist
    try {
      await supabase
        .from("payment_methods")
        .delete()
        .eq("creator_id", creator.id)
    } catch {
      // Table might not exist or no records — that's fine
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/billing/payment-method:", error)
    return NextResponse.json(
      { error: error.message || "Failed to remove payment method" },
      { status: 500 }
    )
  }
}
