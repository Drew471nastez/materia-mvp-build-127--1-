import { type NextRequest, NextResponse } from "next/server"
import { sellerNumberAndRef } from "@/lib/orders/order-number-server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendSellerMessageEmail } from "@/lib/email"
import { loginEmailFrom, sellerInbox } from "@/lib/seller-inbox"
import { rateLimit, addressSubject, callerAddress, LIMITS } from "@/lib/api/rate-limit"
import { isPlausibleToken, isUuid } from "@/lib/receipts/rules"
import { CONTACT_MAX_CHARS, cleanMessage } from "@/lib/receipts/contact"

export const runtime = "nodejs"

/**
 * Contact seller, from the receipt, for a seller with no support address
 * (why a form and not the messages table: lib/receipts/contact.ts).
 *
 * The receipt token is the credential, as it is for every other button on
 * the page, so a guest can write too. The message goes to the seller's own
 * inbox (lib/seller-inbox: their support address, else their login's
 * address as it is now, the owner's for a second business; never shown to
 * the buyer) with Reply-To the address on the order, never one named in the
 * request: the seller's reply lands with the person who paid. A seller with
 * no address at all is said to be so; the message is never sent to
 * Storelib's support inbox in their place.
 *
 * How often: the rate limiter by caller and by order, and five a day per
 * order, recorded in security_events without the message or an address.
 * Every send is a row in email_logs (seller_message), as the receipt and the
 * sale email are, once supabase/sql/run-now part "email_logs_seller_message"
 * has run; before it the row is refused and the message goes all the same.
 */

const MAX_PER_DAY = 5

export async function POST(request: NextRequest) {
  let body: { receiptToken?: unknown; orderId?: unknown; message?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const { receiptToken, orderId } = body
  if (!isPlausibleToken(receiptToken) || !isUuid(orderId)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }
  const message = cleanMessage(body.message)
  if (message.length < 2) return NextResponse.json({ error: "Write a message first." }, { status: 400 })
  if (message.length > CONTACT_MAX_CHARS) {
    return NextResponse.json({ error: `Keep it under ${CONTACT_MAX_CHARS.toLocaleString("en-US")} characters.` }, { status: 400 })
  }

  const limited = await rateLimit({
    bucket: "receipt-contact",
    subjects: [addressSubject(request), `order:${orderId}`],
    windows: LIMITS.email,
    message: "Your message was just sent. Give the seller a little time, then try again.",
  })
  if (limited) return limited

  try {
    const admin = createAdminClient()
    const { data: order } = await admin
      .from("orders")
      .select("*, product:products(title, creator_id)")
      .eq("receipt_token", receiptToken)
      .eq("id", orderId)
      .maybeSingle()
    if (!order || !order.buyer_email) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const product: any = Array.isArray(order.product) ? order.product[0] : order.product
    const creatorId: string = product?.creator_id ?? ""
    if (!creatorId) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("event_type", "seller_contacted")
      .gte("created_at", since)
    if ((count ?? 0) >= MAX_PER_DAY) {
      return NextResponse.json({ error: "You have written 5 times today. The seller will reply by email.", limitReached: true }, { status: 429 })
    }

    /* Every line of the same payment, so the seller sees the whole order. */
    let titles: string[] = [product?.title || "Your purchase"]
    if (order.stripe_session_id) {
      const { data: lines } = await admin
        .from("orders")
        .select("id, product:products(title)")
        .eq("stripe_session_id", order.stripe_session_id)
        .eq("buyer_email", order.buyer_email)
        .limit(50)
      const more = ((lines ?? []) as any[])
        .map((l) => (Array.isArray(l.product) ? l.product[0] : l.product)?.title)
        .filter((t): t is string => typeof t === "string" && t.length > 0)
      if (more.length > 0) titles = more
    }

    const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://storelib.com"
    const inbox = await sellerInbox(admin, creatorId, loginEmailFrom(admin))
    if (!inbox) {
      console.warn("[receipt/contact] the seller has no address to write to; order", order.id)
      return NextResponse.json(
        { success: false, error: "This seller has no email address to write to yet, so the message was not sent." },
        { status: 409 },
      )
    }
    const to = inbox.to
    const result = await sendSellerMessageEmail(admin, {
      to,
      message: {
        buyerName: ((order.buyer_first_name as string) || "").trim() || null,
        buyerEmail: String(order.buyer_email).trim().toLowerCase(),
        /* The Orders page's number for the seller, the buyer's reference beside it (lib/orders/order-number-server.ts). */
        ...(await sellerNumberAndRef(admin, creatorId, order.id)),
        items: titles,
        message,
        orderLink: `${baseUrl.replace(/\/+$/, "")}/app/orders/${order.id}`,
      },
    })

    await admin.from("security_events").insert({
      order_id: order.id,
      event_type: "seller_contacted",
      ip: callerAddress(request) || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
      metadata: { success: result.success, length: message.length, via: inbox.via },
    })
    /* The same record every order email has. The address is a column, never a log line. */
    const { error: logError } = await admin.from("email_logs").insert({
      order_id: order.id,
      email_type: "seller_message",
      recipient_email: to,
      status: result.success ? "sent" : "failed",
      attempt: 1,
      error_message: result.success ? null : String(result.error || "Failed to send").slice(0, 500),
      provider: "mailgun",
    })
    if (logError) console.warn("[receipt/contact] email_logs row not written:", logError.code || "unknown")

    if (!result.success) {
      return NextResponse.json({ success: false, error: "The message did not go out. Try again in a minute." }, { status: 502 })
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[receipt/contact] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "The message did not go out. Try again in a minute." }, { status: 500 })
  }
}
