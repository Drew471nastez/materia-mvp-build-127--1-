import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { sendBuyerDownloadEmail, resolveSellerEmail } from "@/lib/email"
import { rateLimit, addressSubject, emailSubject, callerAddress, LIMITS } from "@/lib/api/rate-limit"
import { isPlausibleToken, isUuid } from "@/lib/receipts/rules"

export const runtime = "nodejs"

/**
 * Moves an order's receipt to a different email address, then sends it there.
 *
 * Two people use this. The SELLER, from Orders, when a buyer writes in with a
 * typo; they are signed in and own the product. The BUYER, from the receipt
 * page, to fix their own typo; they hold the receipt token.
 *
 * The buyer's door is narrower on purpose. A forwarded receipt link must not
 * be a way to take somebody's order: the address is what a guest's order is
 * later matched to an account by. So from a token alone it only works within
 * CHANGE_WINDOW_DAYS of the purchase and only while the order is a guest
 * order, and for either person only once per order (the seller can ask
 * support after that).
 */

const CHANGE_WINDOW_DAYS = 7
/* No brackets, quotes or separators: an address that carried markup would
   travel into the seller's sale email. None of these appear in a real one. */
const EMAIL_SHAPE = /^[^\s@<>"'`(),;:\\[\]]+@[^\s@<>"'`(),;:\\[\]]+\.[^\s@<>"'`(),;:\\[\]]{2,}$/

export async function POST(request: NextRequest) {
  let body: { receiptToken?: unknown; orderId?: unknown; newEmail?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const { receiptToken, orderId } = body
  const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : ""

  if (!isPlausibleToken(receiptToken) || !isUuid(orderId)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }
  if (!EMAIL_SHAPE.test(newEmail) || newEmail.length > 254) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 })
  }

  const limited = await rateLimit({
    bucket: "receipt-email",
    subjects: [addressSubject(request), emailSubject(newEmail), `order:${orderId}`],
    windows: LIMITS.email,
    message: "Too many changes just now. Try again in a few minutes.",
  })
  if (limited) return limited

  try {
    const admin = createAdminClient()

    const { data: order } = await admin
      .from("orders")
      /* Every column: variant_name arrived in a later migration, and naming
         a missing column fails the read, which answered "Order not found". */
      .select("*, product:products(title, creator_id)")
      .eq("receipt_token", receiptToken)
      .eq("id", orderId)
      .maybeSingle()

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }
    const product: any = Array.isArray(order.product) ? order.product[0] : order.product
    const creatorId: string = product?.creator_id ?? ""

    /* Is the caller the seller? Then the buyer-side limits do not apply. */
    let isSeller = false
    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user && creatorId) {
        const { data: creator } = await admin.from("creators").select("id").eq("id", creatorId).eq("user_id", user.id).maybeSingle()
        isSeller = !!creator
      }
    } catch {
      /* A buyer with no session. */
    }

    if (!isSeller) {
      /* An account's order goes where the account says: its owner resends
         to the account email or sends a copy elsewhere (app/api/receipt/resend
         with to: "account", app/api/receipt/send-copy), both signed in. The
         order's own address is what the order is matched by, so it stays. */
      if (order.buyer_id) {
        return NextResponse.json(
          { error: "This order is on an account. Sign in to that account to send a copy somewhere else." },
          { status: 403 },
        )
      }
      const age = Date.now() - new Date(order.created_at).getTime()
      if (!Number.isFinite(age) || age > CHANGE_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
        return NextResponse.json(
          { error: "The address can only be changed in the first week. Reply to your receipt email and the seller can help." },
          { status: 403 },
        )
      }
    }

    /* Asking twice for the same address is not an error: the seller's
       Orders page asks once per line of a basket, and the first ask already
       moved every line. */
    if ((order.buyer_email ?? "").toLowerCase() === newEmail) {
      return NextResponse.json({ success: true, unchanged: true })
    }

    const { count: changes } = await admin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("event_type", "email_updated")
    if ((changes ?? 0) > 0) {
      return NextResponse.json(
        { error: "The address was already changed once for this order. Contact support to change it again.", alreadyChanged: true },
        { status: 403 },
      )
    }

    /* Every line of the same payment moves together, or a basket's receipt
       would split in two (lib/receipts/load groups lines by session AND
       address). */
    let ids: string[] = [order.id]
    if (order.stripe_session_id && order.buyer_email) {
      const { data: lines } = await admin
        .from("orders")
        .select("id")
        .eq("stripe_session_id", order.stripe_session_id)
        .eq("buyer_email", order.buyer_email)
        .limit(50)
      ids = [...new Set([order.id, ...((lines ?? []) as any[]).map((l) => l.id as string)])]
    }

    const { error: updateError } = await admin.from("orders").update({ buyer_email: newEmail }).in("id", ids)
    if (updateError) {
      console.error("[receipt/update-email] update failed for order", order.id)
      return NextResponse.json({ error: "The address was not changed. Try again." }, { status: 500 })
    }

    /* The event is the once-only marker. Addresses are kept here, where
       support can see what changed, and never written to a log. */
    await admin.from("security_events").insert(
      ids.map((id) => ({
        order_id: id,
        event_type: "email_updated",
        ip: callerAddress(request) || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
        metadata: { old_email: order.buyer_email, new_email: newEmail, by: isSeller ? "seller" : "buyer" },
      })),
    )

    await admin.from("email_logs").delete().eq("order_id", order.id).eq("email_type", "buyer_download")
    const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://storelib.com"
    const result = await sendBuyerDownloadEmail(admin, {
      orderId: order.id,
      creatorId,
      buyerEmail: newEmail,
      buyerFirstName: order.buyer_first_name || "",
      productTitle: product?.title || "Your purchase",
      receiptToken,
      sellerReplyTo: creatorId ? await resolveSellerEmail(admin, creatorId) : undefined,
      baseUrl,
      variantName: order.variant_name ?? null,
      amountCents: order.amount_cents ?? null,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: "The address was changed, but the email did not go out. Use Resend in a minute." },
        { status: 502 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[receipt/update-email] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "The address was not changed. Try again." }, { status: 500 })
  }
}
