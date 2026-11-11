import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { sendBuyerDownloadEmail, sendSellerNotificationEmail, resolveSellerEmail } from "@/lib/email"
import { rateLimit, addressSubject, callerAddress, LIMITS } from "@/lib/api/rate-limit"
import { isPlausibleToken, isUuid } from "@/lib/receipts/rules"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"

/**
 * Sends a receipt again. Called by the buyer from the receipt page and by the
 * seller from Orders and Payouts, always with the order id AND its receipt
 * token: the pair must match one row or nothing is sent. The email goes to
 * the address on the order, never to one named in the request.
 *
 * With `to: "account"` it goes to the signed-in buyer's account email
 * instead: an order on an account belongs to that account, and the account's
 * address is the one Storelib has verified (a change there needs a code to
 * each address, app/api/auth/change-email). Only the account the order is on
 * may ask; the order's own address is left as it was.
 *
 * A basket is one email: sendBuyerDownloadEmail reads every line of the
 * payment through lib/receipts/load and lists them together.
 */

const MAX_PER_DAY = 5

async function resendsToday(admin: any, orderId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await admin
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("event_type", "receipt_resent")
    .gte("created_at", since)
  if (error) return 0
  return count ?? 0
}

export async function POST(request: NextRequest) {
  let body: { receiptToken?: unknown; orderId?: unknown; resendType?: unknown; to?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const { receiptToken, orderId } = body
  const resendType = body.resendType === "seller" || body.resendType === "both" || body.resendType === "all" ? body.resendType : "buyer"

  if (!isPlausibleToken(receiptToken) || !isUuid(orderId)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }

  /* The token is the credential, so this is not open to everyone; it is
     still a button that sends mail, and a held button sends a lot of it. */
  const limited = await rateLimit({
    bucket: "receipt-resend",
    subjects: [addressSubject(request), `order:${String(orderId)}`],
    windows: LIMITS.email,
    message: "That receipt was just sent. Check your inbox, then try again shortly.",
  })
  if (limited) return limited

  try {
    const admin = createAdminClient()

    const count = await resendsToday(admin, orderId)
    if (count >= MAX_PER_DAY) {
      return NextResponse.json(
        { error: "This receipt has been sent 5 times today. Try again tomorrow.", limitReached: true, count },
        { status: 429 },
      )
    }

    const { data: order } = await admin
      .from("orders")
      /* Every column: variant_name arrived in a later migration, and naming
         a missing column fails the read, which answered "Order not found". */
      .select("*, product:products(title, creator_id)")
      .eq("receipt_token", receiptToken)
      .eq("id", orderId)
      .maybeSingle()

    if (!order || !order.buyer_email) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const product: any = Array.isArray(order.product) ? order.product[0] : order.product
    const creatorId: string = product?.creator_id ?? ""
    const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://storelib.com"
    const sellerReplyTo = creatorId ? await resolveSellerEmail(admin, creatorId) : "support@storelib.com"

    /* Where the buyer's copy goes: the order's address, or the account's. */
    let recipient: string = order.buyer_email
    const toAccount = body.to === "account" && resendType === "buyer"
    if (toAccount) {
      const supabase = await createClient()
      const who = await routeUser()
      if (who.kind === "unavailable") return authUnavailableResponse()
      const user = who.kind === "user" ? who.user : null
      if (!user) return NextResponse.json({ error: "Sign in again to send it to your account email." }, { status: 401 })
      if (!order.buyer_id || order.buyer_id !== user.id || !user.email) {
        return NextResponse.json({ error: "This order is on another account." }, { status: 403 })
      }
      recipient = user.email.trim().toLowerCase()
    }

    /*
      THE SELLER'S "YOU MADE A SALE" EMAIL IS THE SELLER'S TO ASK FOR. The
      receipt token is the buyer's credential; with it alone a buyer could
      send the seller that email five times a day, carrying whatever the
      buyer had put in their name and address. Only the signed-in owner of
      the product may resend it.
    */
    if (resendType !== "buyer") {
      const supabase = await createClient()
      const who = await routeUser()
      if (who.kind === "unavailable") return authUnavailableResponse()
      const user = who.kind === "user" ? who.user : null
      const { data: owner } = user && creatorId
        ? await admin.from("creators").select("id").eq("id", creatorId).eq("user_id", user.id).maybeSingle()
        : { data: null }
      if (!owner) return NextResponse.json({ error: "Only the seller can resend the sale notice." }, { status: 403 })
    }

    let buyerResult: { success: boolean; error?: string } = { success: true }
    let sellerResult: { success: boolean; error?: string } = { success: true }

    if (resendType === "buyer" || resendType === "both" || resendType === "all") {
      /* Clear the "already sent" marker so the sender does not skip it. */
      await admin.from("orders").update({ buyer_email_last_error: null }).eq("id", order.id)
      await admin.from("email_logs").delete().eq("order_id", order.id).eq("email_type", "buyer_download")

      buyerResult = await sendBuyerDownloadEmail(admin, {
        orderId: order.id,
        creatorId,
        buyerEmail: recipient,
        buyerFirstName: order.buyer_first_name || "",
        productTitle: product?.title || "Your purchase",
        receiptToken,
        sellerReplyTo,
        baseUrl,
        variantName: order.variant_name ?? null,
        amountCents: order.amount_cents ?? null,
      })
    }

    if (resendType === "seller" || resendType === "both" || resendType === "all") {
      await admin.from("orders").update({ seller_email_last_error: null }).eq("id", order.id)
      await admin.from("email_logs").delete().eq("order_id", order.id).eq("email_type", "seller_notification")

      sellerResult = await sendSellerNotificationEmail(admin, {
        orderId: order.id,
        creatorId,
        sellerEmail: sellerReplyTo,
        productTitle: product?.title || "Your purchase",
        buyerFirstName: order.buyer_first_name || "",
        buyerLastName: order.buyer_last_name || "",
        buyerEmail: order.buyer_email,
        amountCents: order.amount_cents || 0,
        feeCents: order.fee_cents || 0,
        baseUrl,
      })
    }

    /* Recorded for the daily cap and for support. No token, no addresses. */
    await admin.from("security_events").insert({
      order_id: order.id,
      event_type: "receipt_resent",
      ip: callerAddress(request) || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
      metadata: { resend_type: resendType, to: toAccount ? "account" : "order", buyer_success: buyerResult.success, seller_success: sellerResult.success },
    })

    const ok = buyerResult.success && sellerResult.success
    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          error: "The email did not go out. Try again in a minute.",
          buyerSuccess: buyerResult.success,
          sellerSuccess: sellerResult.success,
          remainingAttempts: Math.max(0, MAX_PER_DAY - count - 1),
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      buyerSuccess: buyerResult.success,
      sellerSuccess: sellerResult.success,
      remainingAttempts: Math.max(0, MAX_PER_DAY - count - 1),
    })
  } catch (error: unknown) {
    console.error("[receipt/resend] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "The email did not go out. Try again in a minute." }, { status: 500 })
  }
}
