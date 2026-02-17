import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

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

    // Get all completed orders with stripe_payment_intent_id
    const { data: products } = await dbClient
      .from("products")
      .select("id")
      .eq("creator_id", creator.id)

    if (!products || products.length === 0) {
      return NextResponse.json({ synced: 0, message: "No products found" })
    }

    const productIds = products.map((p: any) => p.id)

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

    // Check each order's payment intent for refunds
    for (const order of orders) {
      try {
        if (!order.stripe_payment_intent_id) continue

        const paymentIntent = await stripe.paymentIntents.retrieve(
          order.stripe_payment_intent_id,
          { expand: ["latest_charge.refunds"] },
          creator.stripe_account_id ? { stripeAccount: creator.stripe_account_id } : undefined
        )

        // Check if the charge was refunded
        const charge = paymentIntent.latest_charge as any
        if (charge && (charge.refunded || charge.amount_refunded > 0)) {
          const refund = charge.refunds?.data?.[0]
          const refundAmountCents = charge.amount_refunded || order.amount_cents

          await dbClient
            .from("orders")
            .update({
              status: "refunded",
              refunded_at: refund?.created ? new Date(refund.created * 1000).toISOString() : new Date().toISOString(),
              refund_reason: refund?.reason || "requested_by_customer",
              refund_amount_cents: refundAmountCents,
              stripe_refund_id: refund?.id || null,
            })
            .eq("id", order.id)

          synced++
        }
      } catch (err) {
        // Skip individual failures — Stripe may rate limit or PI may be invalid
        console.error(`[Sync] Failed to check order ${order.id}:`, err)
      }
    }

    return NextResponse.json({ synced, total: orders.length, message: `Synced ${synced} refund(s)` })
  } catch (error: any) {
    console.error("[Sync Refunds Error]", error)
    return NextResponse.json({ error: error.message || "Failed to sync refunds" }, { status: 500 })
  }
}
