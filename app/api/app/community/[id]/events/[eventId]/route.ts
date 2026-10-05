import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { can } from "@/lib/communities/permissions"
import { manageLimit, setEventCancelled, updateEvent } from "@/lib/communities/server/creator"
import { refundEveryTicket } from "@/lib/communities/server/event-refunds"
import { checkEvent, checkEventTickets, isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PATCH /api/app/community/<id>/events/<eventId>
 *   { status: "cancelled" | "scheduled" } cancels it or puts it back. With
 *   { status: "cancelled", refundAll: true } every live ticket is refunded
 *   through Stripe first (needs refund_tickets) and the answer says how many
 *   went back: -> { ok, refunded, failed, refundedCents }.
 *   Otherwise the whole event as POST takes it, plus `replay`: a Storelib
 *   video id (or a link with one in it) of the creator's own, or "" for none,
 *   and the Tickets card's fields, which need price_events (round 14).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, eventId } = await params
  if (!isUuid(eventId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_events")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  if (body.status === "cancelled" || body.status === "scheduled") {
    /* GIVING EVERYBODY THEIR MONEY BACK IS ITS OWN PERMISSION, and it happens before the event is called off. */
    let refund: { refunded: number; failed: number; totalCents: number } | null = null
    if (body.status === "cancelled" && body.refundAll === true) {
      if (!can(gate.role, "refund_tickets", gate.viewer.perms)) return NextResponse.json({ error: "not_allowed" }, { status: 403, headers: noStore })
      refund = await refundEveryTicket(gate.ctx.admin, { community: gate.community, eventId, actorId: gate.ctx.userId, reason: "The event was cancelled." })
    }
    const done = await setEventCancelled(gate.ctx.admin, { communityId: gate.community.id, eventId, actorId: gate.ctx.userId, cancelled: body.status === "cancelled" })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ ok: true, refunded: refund?.refunded ?? 0, failed: refund?.failed ?? 0, refundedCents: refund?.totalCents ?? 0 }, { headers: noStore })
  }
  const checked = checkEvent(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: noStore })
  let tickets = null
  if (body.priceMode !== undefined) {
    if (!can(gate.role, "price_events", gate.viewer.perms)) return NextResponse.json({ error: "not_allowed", field: "price" }, { status: 403, headers: noStore })
    const price = checkEventTickets(body, { startsAt: checked.value.startsAt, timezone: checked.value.timezone })
    if (!price.ok) return NextResponse.json({ error: price.error, field: price.field }, { status: 400, headers: noStore })
    tickets = price.value
  }
  const done = await updateEvent(gate.ctx.admin, { community: gate.community, creatorId: gate.ctx.creatorId, eventId, actorId: gate.ctx.userId, input: checked.value, replay: body.replay, tickets })
  if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ event: done.event }, { headers: noStore })
}
