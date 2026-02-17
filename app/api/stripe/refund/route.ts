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

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const dbClient = tryCreateAdminClient() || supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await dbClient.from("creators").select("*").eq("user_id", user.id).single()
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const body = await request.json()
    const { orderId, reason, amount } = body

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 })
    }

    // Fetch the order
    const { data: order, error: orderError } = await dbClient
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Verify this order belongs to the creator's product
    const { data: product } = await dbClient
      .from("products")
      .select("id, creator_id, title")
      .eq("id", order.product_id)
      .single()

    if (!product || product.creator_id !== creator.id) {
      return NextResponse.json({ error: "Unauthorized - order does not belong to you" }, { status: 403 })
    }

    if (order.status === "refunded") {
      return NextResponse.json({ error: "Order has already been refunded" }, { status: 400 })
    }

    if (!order.stripe_payment_intent_id) {
      return NextResponse.json({ error: "No payment intent found for this order" }, { status: 400 })
    }

    // Validate refund amount
    const maxRefundCents = order.amount_cents || 0
    const refundAmountCents = amount ? Math.round(amount * 100) : maxRefundCents

    if (refundAmountCents <= 0) {
      return NextResponse.json({ error: "Refund amount must be positive" }, { status: 400 })
    }

    if (refundAmountCents > maxRefundCents) {
      return NextResponse.json({
        error: `Refund amount cannot exceed the order total of $${(maxRefundCents / 100).toFixed(2)}`,
      }, { status: 400 })
    }

    // Create Stripe refund
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount: refundAmountCents,
      reason: reason === "duplicate" ? "duplicate" : reason === "fraudulent" ? "fraudulent" : "requested_by_customer",
      metadata: {
        order_id: orderId,
        creator_id: creator.id,
        product_id: order.product_id,
        refund_reason: reason || "requested_by_customer",
      },
    })

    // Update order status in database
    await dbClient
      .from("orders")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        refund_reason: reason || "requested_by_customer",
        refund_amount_cents: refundAmountCents,
        stripe_refund_id: refund.id,
      })
      .eq("id", orderId)

    // Send refund notification emails
    try {
      const { sendRefundEmails } = await import("@/lib/email")
      await sendRefundEmails({
        buyerEmail: order.customer_email || order.buyer_email,
        sellerEmail: user.email,
        productTitle: product.title,
        refundAmount: refundAmountCents,
        currency: creator.default_currency || "USD",
        orderId,
        reason: reason || "Requested by seller",
        storeName: creator.username || "Store",
      })
    } catch (emailErr) {
      console.error("[Refund] Email notification failed:", emailErr)
      // Don't fail the refund if email fails
    }

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      status: refund.status,
      amount: refundAmountCents,
    })
  } catch (error: any) {
    console.error("[Stripe Refund Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to process refund" },
      { status: 500 }
    )
  }
}
