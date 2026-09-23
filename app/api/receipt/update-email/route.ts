import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSmtpConfigured } from "@/lib/mail"
import { resolveSellerEmail, sendBuyerDownloadEmail } from "@/lib/email"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const { receiptToken, orderId, newEmail } = await request.json()

    if (!receiptToken || !orderId || !newEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    if (!isSmtpConfigured()) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
    }

    const admin = createAdminClient()

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("*, product:products(*, creator:creators!inner(id, user_id))")
      .eq("receipt_token", receiptToken)
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const { data: emailChangeEvents } = await admin
      .from("security_events")
      .select("id")
      .eq("order_id", orderId)
      .eq("event_type", "email_updated")

    if (emailChangeEvents && emailChangeEvents.length > 0) {
      return NextResponse.json(
        {
          error: "Email was already changed once. Contact support if you need further assistance.",
          alreadyChanged: true,
        },
        { status: 403 },
      )
    }

    const { error: updateError } = await admin.from("orders").update({ buyer_email: newEmail }).eq("id", orderId)

    if (updateError) {
      console.error("[receipt/update-email] update failed:", updateError.message)
      return NextResponse.json({ error: "Failed to update email" }, { status: 500 })
    }

    await admin.from("security_events").insert({
      order_id: orderId,
      event_type: "email_updated",
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
      metadata: { old_email: order.buyer_email, new_email: newEmail },
    })

    /*
      The buyer's usual access email, from lib/email.tsx, rather than a second
      copy of it written here: the same template checkout sends, and the send
      is recorded on the order (buyer_notified_at, buyer_email_last_error), so
      the creator's timeline shows it arrived. The last send's log is cleared
      first, or the sender would see "already sent" and skip it.
    */
    const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"
    const sellerReplyTo = await resolveSellerEmail(admin, order.product.creator.id)

    await admin.from("orders").update({ buyer_notified_at: null, buyer_email_last_error: null }).eq("id", orderId)
    await admin.from("email_logs").delete().eq("order_id", orderId).eq("email_type", "buyer_download")

    const result = await sendBuyerDownloadEmail(admin, {
      orderId: order.id,
      creatorId: order.product.creator.id,
      buyerEmail: newEmail,
      buyerFirstName: order.buyer_first_name || "",
      productTitle: order.product.title || "Your purchase",
      receiptToken,
      sellerReplyTo,
      baseUrl,
      variantName: order.variant_name ?? null,
    })

    if (!result.success) {
      console.error("[receipt/update-email] send failed for order:", orderId, result.error || "")
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[receipt/update-email] error:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
