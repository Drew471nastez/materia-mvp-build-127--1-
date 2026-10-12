import { NextResponse } from "next/server"
import { sellerNumberAndRef } from "@/lib/orders/order-number-server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendSellerMessageEmail } from "@/lib/email"
import { loginEmailFrom, sellerInbox } from "@/lib/seller-inbox"
import { rateLimit, LIMITS } from "@/lib/api/rate-limit"
import { CONTACT_MAX_CHARS, cleanMessage } from "@/lib/receipts/contact"
import { orderNumberOf } from "@/lib/receipts/rules"
import { viewerMembership } from "@/lib/memberships/access"
import { requestViewer } from "@/lib/memberships/viewer"
import { NOT_SET_UP, siteUrl } from "@/lib/memberships/server"

export const runtime = "nodejs"

/**
 * POST /api/memberships/<id>/contact  { message }
 *
 * A member writing to the creator, the way a buyer does from a receipt
 * (app/api/receipt/contact): to the creator's own inbox (lib/seller-inbox),
 * with Reply-To the member's address, so the creator answers with Reply.
 * The creator's address is never shown to the member. Rate limited per
 * member and per membership.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await requestViewer()
  if (!viewer) return NextResponse.json({ error: "Sign in to write to the creator." }, { status: 401 })
  let body: { message?: unknown }
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const message = cleanMessage(body.message)
  if (message.length < 2) return NextResponse.json({ error: "Write a message first." }, { status: 400 })
  if (message.length > CONTACT_MAX_CHARS) return NextResponse.json({ error: `Keep it under ${CONTACT_MAX_CHARS.toLocaleString("en-US")} characters.` }, { status: 400 })

  const limited = await rateLimit({
    bucket: "membership-contact",
    subjects: [`user:${viewer.id}`, `membership:${id}`],
    windows: LIMITS.email,
    message: "Your message was just sent. Give the creator a little time, then try again.",
  })
  if (limited) return limited

  const admin = createAdminClient()
  const read = await viewerMembership(admin, viewer, id)
  if (!read.ok) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
  const row = read.value
  if (!row?.creator_id) return NextResponse.json({ error: "That membership could not be found." }, { status: 404 })

  const inbox = await sellerInbox(admin, row.creator_id, loginEmailFrom(admin))
  if (!inbox) return NextResponse.json({ error: "This creator has no email address to write to yet, so the message was not sent." }, { status: 409 })

  /* The member's latest payment names the order, as a receipt's message does; a trial has none yet, so the membership does. */
  const { data: last } = await admin.from("membership_invoices").select("order_id").eq("membership_id", row.id).not("order_id", "is", null).order("created_at", { ascending: false }).limit(1)
  const orderId = (last as { order_id: string }[] | null)?.[0]?.order_id ?? null
  const sent = await sendSellerMessageEmail(admin, {
    to: inbox.to,
    message: {
      buyerName: (row.buyer_name || "").trim().split(/\s+/)[0] || null,
      buyerEmail: viewer.email || row.buyer_email,
      ...(orderId ? await sellerNumberAndRef(admin, row.creator_id, orderId) : { orderNumber: orderNumberOf(row.id) }),
      items: [`${row.title || "Membership"} (membership)`],
      message,
      orderLink: siteUrl(row.product_id ? `/app/memberships/${row.product_id}?tab=members` : "/app/memberships"),
    },
  })
  if (!sent.success) return NextResponse.json({ error: "The message could not be sent. Try again in a moment." }, { status: 502 })
  return NextResponse.json({ success: true })
}
