import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { can } from "@/lib/communities/permissions"
import { manageLimit } from "@/lib/communities/server/creator"
import { loadEventTicketPanel, markTicketAttended, refundOneTicket, searchMembersToInvite } from "@/lib/communities/server/event-admin"
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
    const members = await searchMembersToInvite(gate.ctx.admin, { communityId: gate.community.id, eventId, q: find, withEmail, role: gate.role, perms: gate.viewer.perms })
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
  const done = await markTicketAttended(gate.ctx.admin, {
    community: gate.community,
    role: gate.role,
    perms: gate.viewer.perms,
    eventId,
    ticketId: typeof body.ticketId === "string" ? body.ticketId : "",
    came: body.attended !== false,
  })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
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
  const done = await refundOneTicket(gate.ctx.admin, {
    community: gate.community,
    role: gate.role,
    perms: gate.viewer.perms,
    eventId,
    ticketId: typeof body.ticketId === "string" ? body.ticketId : "",
    actorId: gate.ctx.userId,
    reason: typeof body.reason === "string" ? body.reason : null,
  })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true, refundedCents: done.refundedCents }, { headers: noStore })
}
