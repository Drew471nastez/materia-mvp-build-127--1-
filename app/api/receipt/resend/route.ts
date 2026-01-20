import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendBuyerDownloadEmail, sendSellerNotificationEmail, resolveSellerEmail } from "@/lib/email"

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
    const { receiptToken, orderId, resendType = "buyer" } = await request.json()

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
    const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://storelib.com"

    // Get seller email for reply-to and seller notification
    const sellerReplyTo = creatorId ? await resolveSellerEmail(admin, creatorId) : "support@storelib.com"

    let buyerResult: { success: boolean; error?: string } = { success: true }
    let sellerResult: { success: boolean; error?: string } = { success: true }

    // Send buyer email (always, or if resendType is "buyer" or "both")
    if (resendType === "buyer" || resendType === "both" || resendType === "all") {
      // Clear previous error status and email logs before resending
      await admin.from("orders").update({
        buyer_email_last_error: null,
        buyer_notified_at: null,
      }).eq("id", orderId)

      // Clear previous email_logs to allow resend (they check for "sent" status)
      await admin.from("email_logs")
        .delete()
        .eq("order_id", orderId)
        .eq("email_type", "buyer_download")

      console.log("[receipt/resend] Sending buyer email to:", order.buyer_email)

      buyerResult = await sendBuyerDownloadEmail(admin, {
        orderId: order.id,
        creatorId,
        buyerEmail: order.buyer_email,
        buyerFirstName: order.buyer_first_name || "",
        productTitle: order.product?.title || "Your purchase",
        receiptToken,
        sellerReplyTo,
        baseUrl,
      })

      console.log("[receipt/resend] Buyer email result:", buyerResult.success ? "success" : "failed", buyerResult.error || "")
    }

    // Send seller notification if requested or if it previously failed
    if (resendType === "seller" || resendType === "both" || resendType === "all") {
      // Clear previous error status and email logs before resending
      await admin.from("orders").update({
        seller_email_last_error: null,
        seller_notified_at: null,
      }).eq("id", orderId)

      // Clear previous email_logs to allow resend (they check for "sent" status)
      await admin.from("email_logs")
        .delete()
        .eq("order_id", orderId)
        .eq("email_type", "seller_notification")

      console.log("[receipt/resend] Sending seller email to:", sellerReplyTo)

      sellerResult = await sendSellerNotificationEmail(admin, {
        orderId: order.id,
        creatorId,
        sellerEmail: sellerReplyTo,
        productTitle: order.product?.title || "Your purchase",
        buyerFirstName: order.buyer_first_name || "",
        buyerLastName: order.buyer_last_name || "",
        buyerEmail: order.buyer_email,
        amountCents: order.amount_cents || 0,
        feeCents: order.fee_cents || 0,
        baseUrl,
      })

      console.log("[receipt/resend] Seller email result:", sellerResult.success ? "success" : "failed", sellerResult.error || "")
    }

    // Log the resend event
    await admin.from("security_events").insert({
      order_id: orderId,
      event_type: "receipt_resent",
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
      metadata: {
        receipt_token: receiptToken,
        reply_to: sellerReplyTo,
        resend_type: resendType,
        buyer_success: buyerResult.success,
        seller_success: sellerResult.success,
      },
    })

    // Determine overall success
    const overallSuccess = (resendType === "buyer" ? buyerResult.success : true) &&
                          (resendType === "seller" ? sellerResult.success : true) &&
                          (resendType === "both" || resendType === "all" ? buyerResult.success && sellerResult.success : true)

    if (!overallSuccess) {
      const errors: string[] = []
      if (!buyerResult.success && buyerResult.error) errors.push(`Buyer: ${buyerResult.error}`)
      if (!sellerResult.success && sellerResult.error) errors.push(`Seller: ${sellerResult.error}`)

      return NextResponse.json({
        success: false,
        error: "Some emails failed to send",
        details: errors.join("; "),
        buyerSuccess: buyerResult.success,
        sellerSuccess: sellerResult.success,
        remainingAttempts: 5 - count - 1,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      buyerSuccess: buyerResult.success,
      sellerSuccess: sellerResult.success,
      remainingAttempts: 5 - count - 1,
    })
  } catch (error: unknown) {
    console.error("[receipt/resend] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
