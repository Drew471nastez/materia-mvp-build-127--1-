import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { sendReceiptCopyEmail, resolveSellerEmail } from "@/lib/email"
import { rateLimit, addressSubject, emailSubject, callerAddress, LIMITS } from "@/lib/api/rate-limit"
import { isPlausibleToken, isUuid } from "@/lib/receipts/rules"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"

/**
 * "Send a copy to another email" on the receipt of an order that is on an
 * account: one copy of the receipt to an address the buyer types, the way
 * Gumroad and Shopify let a customer forward a receipt to their work inbox.
 *
 * It changes nothing. The order keeps its address, the account keeps its
 * email, and the order's delivery status is not touched
 * (lib/email sendReceiptCopyEmail). Changing where receipts go for good is
 * the account's email, in settings, with a code to each address.
 *
 * Who may ask: the signed-in account the order is on, holding the order id
 * AND its token. A guest order has "Wrong address?" instead
 * (app/api/receipt/update-email); a copy from a token alone would let a
 * forwarded link mail a Storelib receipt anywhere.
 *
 * How often: the rate limiter, by caller, by target address and by order;
 * and the resend route's five a day per order, which a copy counts towards.
 */

const MAX_PER_DAY = 5
const EMAIL_SHAPE = /^[^\s@<>"'`(),;:\\[\]]+@[^\s@<>"'`(),;:\\[\]]+\.[^\s@<>"'`(),;:\\[\]]{2,}$/

export async function POST(request: NextRequest) {
  let body: { receiptToken?: unknown; orderId?: unknown; email?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const { receiptToken, orderId } = body
  const to = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

  if (!isPlausibleToken(receiptToken) || !isUuid(orderId)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }
  if (!EMAIL_SHAPE.test(to) || to.length > 254) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 })
  }

  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Sign in to send a copy." }, { status: 401 })

  const limited = await rateLimit({
    bucket: "receipt-copy",
    subjects: [addressSubject(request), emailSubject(to), `order:${orderId}`, `user:${user.id}`],
    windows: LIMITS.email,
    message: "A copy was just sent. Try again in a few minutes.",
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
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })
    if (!order.buyer_id || order.buyer_id !== user.id) {
      return NextResponse.json({ error: "Only the account this order is on can send a copy." }, { status: 403 })
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("event_type", "receipt_resent")
      .gte("created_at", since)
    if ((count ?? 0) >= MAX_PER_DAY) {
      return NextResponse.json({ error: "This receipt has been sent 5 times today. Try again tomorrow.", limitReached: true }, { status: 429 })
    }

    const product: any = Array.isArray(order.product) ? order.product[0] : order.product
    const creatorId: string = product?.creator_id ?? ""
    const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://storelib.com"
    const result = await sendReceiptCopyEmail(admin, {
      orderId: order.id,
      creatorId,
      buyerEmail: to,
      buyerFirstName: order.buyer_first_name || "",
      productTitle: product?.title || "Your purchase",
      receiptToken: receiptToken as string,
      sellerReplyTo: creatorId ? await resolveSellerEmail(admin, creatorId) : undefined,
      baseUrl,
      variantName: order.variant_name ?? null,
      amountCents: order.amount_cents ?? null,
    })

    /* Counted with the resends. No token, no address. */
    await admin.from("security_events").insert({
      order_id: order.id,
      event_type: "receipt_resent",
      ip: callerAddress(request) || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
      metadata: { resend_type: "buyer", to: "copy", buyer_success: result.success },
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: "The copy did not go out. Try again in a minute." }, { status: 502 })
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[receipt/send-copy] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "The copy did not go out. Try again in a minute." }, { status: 500 })
  }
}
