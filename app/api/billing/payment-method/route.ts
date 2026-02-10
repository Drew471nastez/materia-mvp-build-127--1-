import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

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
      .select("id, stripe_customer_id")
      .eq("user_id", user.id)
      .single()

    if (!creator?.stripe_customer_id) {
      return NextResponse.json({ error: "No payment method found" }, { status: 404 })
    }

    // Validate customer exists on current Stripe keys
    const customerId = creator.stripe_customer_id
    try {
      const cust = await stripe.customers.retrieve(customerId)
      if ((cust as any).deleted) throw new Error("deleted")
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

    // Check if user has an active/trialing/past_due subscription
    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 10 })
    const hasActiveSub = subs.data.some(s => ["active", "trialing", "past_due"].includes(s.status))

    // If active subscription and only one card, block removal
    if (hasActiveSub && paymentMethods.data.length <= 1) {
      return NextResponse.json(
        { error: "Add a new payment method first to keep your subscription active." },
        { status: 400 }
      )
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
        invoice_settings: { default_payment_method: null as any },
      })
    } catch (err) {
      console.error("Error clearing customer default payment method:", err)
    }

    // Also clean up Supabase payment_methods table if records exist
    try {
      await supabase.from("payment_methods").delete().eq("creator_id", creator.id)
    } catch {
      // Table might not exist — fine
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
