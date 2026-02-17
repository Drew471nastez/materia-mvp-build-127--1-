import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

function tryCreateAdminClient() {
  try {
    const { createAdminClient } = require("@/lib/supabase/admin")
    return createAdminClient()
  } catch {
    return null
  }
}

const MAX_REFUND_RESENDS = 10

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const dbClient = tryCreateAdminClient() || supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await dbClient.from("creators").select("*").eq("user_id", user.id).single()
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 })
    }

    // Fetch order
    const { data: order, error: orderError } = await dbClient
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Verify order belongs to creator
    const { data: product } = await dbClient
      .from("products")
      .select("id, creator_id, title")
      .eq("id", order.product_id)
      .single()

    if (!product || product.creator_id !== creator.id) {
      return NextResponse.json({ error: "Unauthorized - order does not belong to you" }, { status: 403 })
    }

    if (order.status !== "refunded") {
      return NextResponse.json({ error: "Order has not been refunded" }, { status: 400 })
    }

    // Check resend limit via security_events
    const { data: events } = await dbClient
      .from("security_events")
      .select("id")
      .eq("order_id", orderId)
      .eq("event_type", "refund_email_resent")

    const resendCount = events?.length || 0
    if (resendCount >= MAX_REFUND_RESENDS) {
      return NextResponse.json(
        { error: `Maximum refund email resend limit (${MAX_REFUND_RESENDS}) reached for this order`, limitReached: true, count: resendCount },
        { status: 429 }
      )
    }

    // Resolve creator identity for proper name and email
    const { sendRefundEmails, resolveCreatorIdentity } = await import("@/lib/email")

    let storeName = creator.username || "Store"
    let sellerContactEmail = user.email || ""
    let sellerAvatarUrl = ""
    try {
      const identity = await resolveCreatorIdentity(dbClient, creator.id)
      storeName = identity.fromName || storeName
      sellerContactEmail = identity.sellerEmail || sellerContactEmail
    } catch {
      // Use fallbacks
    }

    // Resolve avatar URL
    try {
      const { data: profile } = await dbClient
        .from("profiles")
        .select("avatar_url")
        .eq("id", creator.user_id)
        .single()
      if (profile?.avatar_url) sellerAvatarUrl = profile.avatar_url
    } catch {
      // No avatar
    }
    if (!sellerAvatarUrl && creator.avatar_url) {
      sellerAvatarUrl = creator.avatar_url
    }

    const refundAmountCents = order.refund_amount_cents || order.amount_cents || 0

    await sendRefundEmails({
      buyerEmail: order.customer_email || order.buyer_email,
      sellerEmail: user.email,
      sellerContactEmail,
      productTitle: product.title,
      refundAmount: refundAmountCents,
      currency: creator.default_currency || "USD",
      orderId,
      reason: order.refund_reason || "Requested by seller",
      storeName,
      orderDate: order.created_at || order.order_date,
      sellerAvatarUrl,
    })

    // Log the resend event
    try {
      await dbClient.from("security_events").insert({
        order_id: orderId,
        event_type: "refund_email_resent",
        ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
        metadata: {
          resend_number: resendCount + 1,
          buyer_email: order.customer_email || order.buyer_email,
          seller_email: user.email,
        },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      success: true,
      resendCount: resendCount + 1,
      remainingAttempts: MAX_REFUND_RESENDS - resendCount - 1,
    })
  } catch (error: any) {
    console.error("[Refund Resend Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to resend refund emails" },
      { status: 500 }
    )
  }
}
