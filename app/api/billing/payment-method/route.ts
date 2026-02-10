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

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Get the default payment method
    const { data: paymentMethod } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("creator_id", creator.id)
      .eq("is_default", true)
      .maybeSingle()

    if (!paymentMethod) {
      return NextResponse.json({ error: "No payment method found" }, { status: 404 })
    }

    // Detach from Stripe
    if (paymentMethod.stripe_payment_method_id) {
      try {
        await stripe.paymentMethods.detach(paymentMethod.stripe_payment_method_id)
      } catch (err) {
        console.error("Error detaching payment method from Stripe:", err)
      }
    }

    // Remove default payment method from Stripe customer
    if (creator.stripe_customer_id) {
      try {
        await stripe.customers.update(creator.stripe_customer_id, {
          invoice_settings: { default_payment_method: "" },
        })
      } catch (err) {
        console.error("Error updating customer default payment method:", err)
      }
    }

    // Delete from database
    await supabase
      .from("payment_methods")
      .delete()
      .eq("id", paymentMethod.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/billing/payment-method:", error)
    return NextResponse.json(
      { error: error.message || "Failed to remove payment method" },
      { status: 500 }
    )
  }
}
