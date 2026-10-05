import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { can } from "@/lib/communities/permissions"
import { loadEventTicketPanel, manageLimit, searchMembersToInvite, ticketInCommunity } from "@/lib/communities/server/creator"
import { markAttended } from "@/lib/communities/server/event-tickets"
import { refundTicket } from "@/lib/communities/server/event-refunds"
import { isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; eventId: string }> }

/**
 * THE TICKETS OF ONE EVENT, for the creator's panel
 * (components/community/creator/event-tickets.tsx).
 *
 * GET    ?cursor=&q=        -> { panel }: the money, the seats and 25 holders
 *                              at a time, newest first. `q` searches by name,
 *                              or by email for whoever may see emails.
 * GET    ?find=<name>       -> { members }: members to invite free, at most 20.
 * PATCH  { ticketId, attended } -> { ok }: they turned up, or they did not.
 * DELETE { ticketId, reason? }  -> { ok, refundedCents }: the money goes back
 *                              and the seat with it.
 *
 * Reading needs manage_events, inviting needs price_events, and a refund
 * needs refund_tickets: checked here with can(), never only by hiding the
 * button. A ticket is only ever acted on when it belongs to this event in
 * this community.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, eventId } = await params
  if (!isUuid(eventId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_events")
  if (gate instanceof NextResponse) return gate
  const url = new URL(request.url)
  const withEmail = can(gate.role, "manage_members", gate.viewer.perms)
  const find = url.searchParams.get("find")
  if (find !== null) {
    if (!can(gate.role, "price_events", gate.viewer.perms)) return NextResponse.json({ error: "not_allowed" }, { status: 403, headers: noStore })
    const members = await searchMembersToInvite(gate.ctx.admin, { communityId: gate.community.id, eventId, q: find, withEmail })
    return NextResponse.json({ members }, { headers: noStore })
  }
  const done = await loadEventTicketPanel(gate.ctx.admin, { communityId: gate.community.id, eventId, cursor: url.searchParams.get("cursor"), q: url.searchParams.get("q") ?? "", withEmail })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ panel: done.panel }, { headers: noStore })
}

export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, eventId } = await params
  if (!isUuid(eventId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_events")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const ticketId = typeof body.ticketId === "string" ? body.ticketId : ""
  const owns = await ticketInCommunity(gate.ctx.admin, gate.community.id, eventId, ticketId)
  if (!owns.ok) return NextResponse.json({ error: owns.error }, { status: owns.status, headers: noStore })
  const done = await markAttended(gate.ctx.admin, { ticketId, at: body.attended === false ? null : undefined })
  if (!done) return NextResponse.json({ error: "failed" }, { status: 500, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function DELETE(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, eventId } = await params
  if (!isUuid(eventId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_events")
  if (gate instanceof NextResponse) return gate
  if (!can(gate.role, "refund_tickets", gate.viewer.perms)) return NextResponse.json({ error: "not_allowed" }, { status: 403, headers: noStore })
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const ticketId = typeof body.ticketId === "string" ? body.ticketId : ""
  const owns = await ticketInCommunity(gate.ctx.admin, gate.community.id, eventId, ticketId)
  if (!owns.ok) return NextResponse.json({ error: owns.error }, { status: owns.status, headers: noStore })
  const done = await refundTicket(gate.ctx.admin, { community: gate.community, ticketId, actorId: gate.ctx.userId, reason: typeof body.reason === "string" ? body.reason : null })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true, refundedCents: done.amountCents }, { headers: noStore })
}
