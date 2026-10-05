import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { readPricedEvent, readTicketRow, refundPolicyFor } from "@/lib/communities/server/event-tickets"
import { refundTicket } from "@/lib/communities/server/event-refunds"
import { isUuid } from "@/lib/courses/access"
import { sessionUserId } from "@/lib/courses/route-auth"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * DELETE /api/community/<communityId>/events/<eventId>/ticket { reason? }
 *   -> { ok: true, refundedCents }
 *   -> 409 { error: "refund_closed", refundPolicy } outside the event's window
 *
 * The holder giving up their own seat. A paid ticket inside the refund
 * window the event set is refunded through Stripe (reverse_transfer, so the
 * money comes back from the creator's balance) and the seat goes back;
 * outside the window there is no refund, and the event's own refund policy
 * words are answered instead of a button. An invited seat has no money and
 * is simply given back.
 *
 * The ticket is read from the event in the URL for the session's user: a
 * body cannot name another person's ticket, another event's, or an amount.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ communityId: string; eventId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, eventId } = await params
  if (!isUuid(eventId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const db = admin()
  const member = await requireMember(db, communityId, await sessionUserId(), "view")
  if (member instanceof NextResponse) return member
  const userId = member.viewer.userId as string
  const limited = await rateLimit({
    bucket: rateBucket("ticket"),
    subjects: [addressSubject(request), `user:${userId}`],
    windows: RATE_LIMITS.ticket,
    message: "Too many tries just now. Wait a few minutes and try again.",
  })
  if (limited) return limited
  const ticket = await readTicketRow(db, eventId, userId)
  if (!ticket || ticket.status !== "paid") return NextResponse.json({ error: "no_ticket" }, { status: 404, headers: noStore })
  const body = await readJson(request)
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null
  const done = await refundTicket(db, { community: member.community, ticketId: ticket.id, actorId: userId, reason, byHolder: true })
  if (done.ok === false) {
    if (done.error === "refund_closed") {
      const event = await readPricedEvent(db, communityId, eventId)
      const refundPolicy = event ? await refundPolicyFor(db, communityId, event) : null
      return NextResponse.json({ error: "refund_closed", refundPolicy }, { status: 409, headers: noStore })
    }
    return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  }
  return NextResponse.json({ ok: true, refundedCents: done.amountCents }, { headers: noStore })
}
