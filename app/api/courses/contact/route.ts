import { NextResponse } from "next/server"
import { sellerNumberAndRef } from "@/lib/orders/order-number-server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendSellerMessageEmail } from "@/lib/email"
import { loginEmailFrom, sellerInbox } from "@/lib/seller-inbox"
import { LIMITS, addressSubject, callerAddress, rateLimit } from "@/lib/api/rate-limit"
import { CONTACT_MAX_CHARS, cleanMessage } from "@/lib/receipts/contact"
import { isUuid } from "@/lib/courses/access"
import { PRIVATE, sessionUserId } from "@/lib/courses/route-auth"
import { productAccess } from "@/lib/courses/server"

export const runtime = "nodejs"

const MAX_PER_DAY = 5

/**
 * POST /api/courses/contact { productId, message, lessonTitle? }
 *
 * A question to the course's creator, from inside the course. The same
 * message the receipt's Contact seller sends (lib/receipts/contact.ts), to
 * the same inbox (lib/seller-inbox: the creator's support address, else
 * their login's), with Reply-To the buyer's own account address, so the
 * creator's answer goes straight to them. Only a buyer of the course may
 * write; five a day per course, and the shared limit on email forms.
 */
export async function POST(request: Request) {
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "Sign in to write to the creator." }, { status: 401, headers: PRIVATE })

  let body: { productId?: unknown; message?: unknown; lessonTitle?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: PRIVATE })
  }
  if (!isUuid(body.productId)) return NextResponse.json({ error: "Course not found" }, { status: 404, headers: PRIVATE })
  const message = cleanMessage(body.message)
  if (message.length < 2) return NextResponse.json({ error: "Write a message first." }, { status: 400, headers: PRIVATE })
  if (message.length > CONTACT_MAX_CHARS) {
    return NextResponse.json({ error: `Keep it under ${CONTACT_MAX_CHARS.toLocaleString("en-US")} characters.` }, { status: 400, headers: PRIVATE })
  }

  const limited = await rateLimit({
    bucket: "course-contact",
    subjects: [addressSubject(request), `user:${userId}`],
    windows: LIMITS.email,
    message: "Your message was just sent. Give the creator a little time, then try again.",
  })
  if (limited) return limited

  try {
    const admin = createAdminClient()
    const { level, product } = await productAccess(admin, userId, body.productId)
    if (!product?.creator_id || level !== "owner") return NextResponse.json({ error: "Course not found" }, { status: 404, headers: PRIVATE })

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "course_creator_contacted")
      .contains("metadata", { user_id: userId })
      .gte("created_at", since)
    if ((count ?? 0) >= MAX_PER_DAY) {
      return NextResponse.json({ error: "You have written 5 times today. The creator will reply by email." }, { status: 429, headers: PRIVATE })
    }

    const [{ data: profile }, { data: order }] = await Promise.all([
      admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      admin.from("orders").select("id").eq("buyer_id", userId).eq("product_id", product.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    const p = (profile ?? {}) as { email?: string | null; display_name?: string | null; first_name?: string | null }
    const buyerEmail = String(p.email ?? "").trim().toLowerCase()
    if (!buyerEmail.includes("@")) return NextResponse.json({ error: "Your account has no email address to reply to." }, { status: 409, headers: PRIVATE })

    const inbox = await sellerInbox(admin, product.creator_id, loginEmailFrom(admin))
    if (!inbox) return NextResponse.json({ error: "This creator has no email address to write to yet, so the message was not sent." }, { status: 409, headers: PRIVATE })

    const lesson = typeof body.lessonTitle === "string" ? body.lessonTitle.replace(/\s+/g, " ").trim().slice(0, 120) : ""
    const baseUrl = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://storelib.com").replace(/\/+$/, "")
    const orderId = (order as { id?: string } | null)?.id ?? null
    const result = await sendSellerMessageEmail(admin, {
      to: inbox.to,
      message: {
        buyerName: (p.first_name || p.display_name || "").trim() || null,
        buyerEmail,
        ...(orderId ? await sellerNumberAndRef(admin, product.creator_id, orderId) : { orderNumber: "Course" }),
        items: [lesson ? `${product.title || "Course"}, ${lesson}` : product.title || "Course"],
        message,
        orderLink: orderId ? `${baseUrl}/app/orders/${orderId}` : `${baseUrl}/app/products/${product.id}`,
      },
    })

    await admin.from("security_events").insert({
      event_type: "course_creator_contacted",
      ip: callerAddress(request) || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
      metadata: { user_id: userId, success: result.success, length: message.length, product_id: product.id, via: inbox.via },
    })

    if (!result.success) return NextResponse.json({ error: "The message did not go out. Try again in a minute." }, { status: 502, headers: PRIVATE })
    return NextResponse.json({ success: true }, { headers: PRIVATE })
  } catch (error) {
    console.error("[courses/contact] failed:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "The message did not go out. Try again in a minute." }, { status: 500, headers: PRIVATE })
  }
}
