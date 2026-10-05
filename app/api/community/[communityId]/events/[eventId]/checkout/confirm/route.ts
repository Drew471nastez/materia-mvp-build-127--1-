import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { confirmEventCheckout } from "@/lib/communities/server/event-checkout"
import { isUuid } from "@/lib/courses/access"
import { sessionUserId } from "@/lib/courses/route-auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * POST /api/community/<communityId>/events/<eventId>/checkout/confirm { sessionId }
 *   -> { ok: true, created } | 409 { error: "not_paid" } while Stripe is still settling it
 *
 * Asked by the ticket sheet right after Stripe's onComplete. The session is
 * read from Stripe again and must be this member's, paid, and for this
 * event; then the ticket is theirs. The webhook makes the same ticket,
 * whichever comes first, once: one payment is exactly one ticket.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string; eventId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, eventId } = await params
  if (!isUuid(eventId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const userId = gate.viewer.userId as string
  const limited = await rateLimit({ bucket: rateBucket("ticket"), subjects: [`user:${userId}`], windows: RATE_LIMITS.ticket, message: "Too many tries. Wait a minute." })
  if (limited) return limited
  const body = await readJson(request)
  const { stripe } = await import("@/lib/stripe")
  const done = await confirmEventCheckout(db, stripe, { sessionId: body.sessionId, userId })
  if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  if (done.eventId !== eventId) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  return NextResponse.json({ ok: true, created: done.created }, { headers: noStore })
}
