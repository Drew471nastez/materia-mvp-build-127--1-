import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendBuyerDownloadEmail, resolveSellerEmail } from "@/lib/email"

async function checkResendLimit(admin: any, orderId: string): Promise<{ allowed: boolean; count: number }> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: events, error } = await admin
    .from("security_events")
    .select("id")
    .eq("order_id", orderId)
    .eq("event_type", "receipt_resent")
    .gte("created_at", twentyFourHoursAgo)

  if (error) {
    console.error("[receipt/resend] Error checking resend limit:", error)
    return { allowed: true, count: 0 }
  }

  const count = events?.length || 0
  return { allowed: count < 5, count }
}

export async function POST(request: NextRequest) {
  try {
    const { receiptToken, orderId } = await request.json()

    if (!receiptToken || !orderId) {
      return NextResponse.json({ error: "Missing receiptToken or orderId" }, { status: 400 })
    }

    const admin = createAdminClient()

    // Check rate limit
    const { allowed, count } = await checkResendLimit(admin, orderId)
    if (!allowed) {
      return NextResponse.json(
        {
          error: "You've reached the maximum of 5 email resends in 24 hours for this order",
          limitReached: true,
          count,
        },
        { status: 429 },
      )
    }

    // Get order details
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("*, product:products(*, creator:creators!inner(id, user_id))")
      .eq("receipt_token", receiptToken)
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const creatorId = order?.product?.creator?.id
const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://materiabuilder.store"

    // Get seller email for reply-to
    const sellerReplyTo = creatorId ? await resolveSellerEmail(admin, creatorId) : "support@materiabuilder.store"

    const result = await sendBuyerDownloadEmail(admin, {
      orderId: order.id,
      buyerEmail: order.buyer_email,
      buyerFirstName: order.buyer_first_name || "",
      productTitle: order.product?.title || "Your purchase",
      receiptToken,
      sellerReplyTo,
      baseUrl,
    })

    if (!result.success) {
      console.error("[receipt/resend] Email send error:", result.error)
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 })
    }

    // Log the resend event
    await admin.from("security_events").insert({
      order_id: orderId,
      event_type: "receipt_resent",
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
      metadata: { receipt_token: receiptToken, reply_to: sellerReplyTo },
    })

    return NextResponse.json({ success: true, remainingAttempts: 5 - count - 1 })
  } catch (error: unknown) {
    console.error("[receipt/resend] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
