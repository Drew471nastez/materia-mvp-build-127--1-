import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

export const runtime = "nodejs"

function tryCreateAdminClient() {
  try {
    const { createAdminClient } = require("@/lib/supabase/admin")
    return createAdminClient()
  } catch {
    return null
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const dbClient = tryCreateAdminClient() || supabase

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await dbClient
      .from("creators")
      .select("id, stripe_account_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    // Get all products for this creator
    const { data: products } = await dbClient
      .from("products")
      .select("id")
      .eq("creator_id", creator.id)

    if (!products || products.length === 0) {
      return NextResponse.json({ synced: 0, message: "No products found" })
    }

    const productIds = products.map((p: any) => p.id)

    // Get all completed orders that have a stripe_payment_intent_id
    const { data: orders } = await dbClient
      .from("orders")
      .select("id, stripe_payment_intent_id, status, amount_cents")
      .in("product_id", productIds)
      .eq("status", "completed")
      .not("stripe_payment_intent_id", "is", null)

    if (!orders || orders.length === 0) {
      return NextResponse.json({ synced: 0, message: "No orders to sync" })
    }

    let synced = 0
    const errors: string[] = []

    // Check each order's payment intent against Stripe for refunds
    for (const order of orders) {
      try {
        if (!order.stripe_payment_intent_id) continue

        // Retrieve the payment intent with charge and refund data expanded
        const stripeOpts = creator.stripe_account_id
          ? { stripeAccount: creator.stripe_account_id }
          : undefined

        const paymentIntent = await stripe.paymentIntents.retrieve(
          order.stripe_payment_intent_id,
          { expand: ["latest_charge"] },
          stripeOpts
        )

        // Check if charge was refunded
        const charge = paymentIntent.latest_charge as any
        if (charge && (charge.refunded === true || (charge.amount_refunded && charge.amount_refunded > 0))) {
          // First update just the status (this column definitely exists)
          const { error: statusError } = await dbClient
            .from("orders")
            .update({ status: "refunded" })
            .eq("id", order.id)

          if (statusError) {
            errors.push(`Failed to update status for order ${order.id}: ${statusError.message}`)
            continue
          }

          // Try to update the extra refund columns (may not exist yet)
          try {
            const refundAmountCents = charge.amount_refunded || order.amount_cents
            await dbClient
              .from("orders")
              .update({
                refund_amount_cents: refundAmountCents,
                refunded_at: new Date().toISOString(),
                refund_reason: "synced_from_stripe",
              })
              .eq("id", order.id)
          } catch {
            // Extra columns may not exist — that's OK, status is already updated
          }

          synced++
        }
      } catch (err: any) {
        errors.push(`Order ${order.id}: ${err.message}`)
      }
    }

    return NextResponse.json({
      synced,
      total: orders.length,
      message: `Synced ${synced} refund(s) from Stripe`,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error("[Sync Refunds Error]", error)
    return NextResponse.json({ error: error.message || "Failed to sync refunds" }, { status: 500 })
  }
}
