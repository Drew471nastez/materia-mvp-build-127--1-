import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendBuyerDownloadEmail, sendSellerNotificationEmail, resolveSellerEmail } from "@/lib/email"

const MAX_RETRIES = 3
const RETRY_DELAYS = [5000, 15000, 30000] // 5s, 15s, 30s

export async function POST(request: Request) {
  try {
    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 })
    }

    const admin = createAdminClient()
  const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://materiabuilder.store"

    // Get order details
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("*, product:products(title, creator_id)")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      console.error("[email/retry] Order not found:", orderId)
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Check what needs to be retried
    const needsBuyerEmail = !order.buyer_notified_at
    const needsSellerEmail = !order.seller_notified_at

    if (!needsBuyerEmail && !needsSellerEmail) {
      console.log("[email/retry] All emails already sent for order:", orderId)
      return NextResponse.json({ success: true, message: "All emails already sent" })
    }

    // Get current attempt counts
    const buyerAttempts = order.buyer_email_attempt_count || 1
    const sellerAttempts = order.seller_email_attempt_count || 1

    const results: { buyer?: boolean; seller?: boolean } = {}

    // Retry buyer email if needed
    if (needsBuyerEmail && buyerAttempts < MAX_RETRIES) {
      const delay = RETRY_DELAYS[buyerAttempts - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1]

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay))

      // Update attempt count
      await admin
        .from("orders")
        .update({ buyer_email_attempt_count: buyerAttempts + 1 })
        .eq("id", orderId)

      const sellerEmail = await resolveSellerEmail(admin, order.product?.creator_id)

      const result = await sendBuyerDownloadEmail(
        admin,
        {
          orderId,
          buyerEmail: order.buyer_email,
          buyerFirstName: order.buyer_first_name || "",
          productTitle: order.product?.title || "Your purchase",
          receiptToken: order.receipt_token,
          sellerReplyTo: sellerEmail,
          baseUrl,
        },
        buyerAttempts + 1,
      )

      results.buyer = result.success
      console.log("[email/retry] Buyer email retry attempt", buyerAttempts + 1, "result:", result.success)
    }

    // Retry seller email if needed
    if (needsSellerEmail && sellerAttempts < MAX_RETRIES) {
      const delay = RETRY_DELAYS[sellerAttempts - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1]

      // Wait before retry (only if we didn't already wait for buyer)
      if (!needsBuyerEmail) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      // Update attempt count
      await admin
        .from("orders")
        .update({ seller_email_attempt_count: sellerAttempts + 1 })
        .eq("id", orderId)

      const sellerEmail = await resolveSellerEmail(admin, order.product?.creator_id)

      const result = await sendSellerNotificationEmail(
        admin,
        {
          orderId,
          sellerEmail,
          productTitle: order.product?.title || "Product",
          buyerFirstName: order.buyer_first_name || "",
          buyerLastName: order.buyer_last_name || "",
          buyerEmail: order.buyer_email,
          amountCents: order.amount_cents || 0,
          feeCents: order.fee_cents || 0,
          baseUrl,
        },
        sellerAttempts + 1,
      )

      results.seller = result.success
      console.log("[email/retry] Seller email retry attempt", sellerAttempts + 1, "result:", result.success)
    }

    // Schedule another retry if still needed
    const stillNeedsBuyer = needsBuyerEmail && !results.buyer && buyerAttempts + 1 < MAX_RETRIES
    const stillNeedsSeller = needsSellerEmail && !results.seller && sellerAttempts + 1 < MAX_RETRIES

    if (stillNeedsBuyer || stillNeedsSeller) {
      // Trigger another retry (fire and forget)
      setTimeout(() => {
        fetch(`${baseUrl}/api/email/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        }).catch(() => {})
      }, 1000)
    }

    return NextResponse.json({
      success: true,
      results,
      retriesRemaining: {
        buyer: needsBuyerEmail ? MAX_RETRIES - buyerAttempts - 1 : 0,
        seller: needsSellerEmail ? MAX_RETRIES - sellerAttempts - 1 : 0,
      },
    })
  } catch (error) {
    console.error("[email/retry] Error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Retry failed" }, { status: 500 })
  }
}
