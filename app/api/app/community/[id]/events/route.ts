import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { can } from "@/lib/communities/permissions"
import { createEvent, loadEvents, manageLimit } from "@/lib/communities/server/creator"
import { checkEvent, checkEventTickets } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET  /api/app/community/<id>/events -> { upcoming, past, tickets }
 * POST /api/app/community/<id>/events { title, description, kind, startDate, startTime, endDate?, endTime?,
 *      timezone (IANA), location?, meetingUrl?, livestreamUrl?, capacity?, coverUrl?, access? } -> { event }
 *      The date and time are the event's own zone; they are stored as instants.
 *      With priceMode: "paid" it also takes price, salesCloseDate, salesCloseTime,
 *      refundWindow and refundPolicy, which need the price_events permission
 *      (round 14); "free" clears all of them.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_events")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json(await loadEvents(gate.ctx.admin, gate.community.id), { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_events")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const checked = checkEvent(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: noStore })
  /* A PRICE IS ITS OWN PERMISSION: the card is hidden without it, and the route refuses it too. */
  let tickets = null
  if (body.priceMode !== undefined) {
    if (!can(gate.role, "price_events", gate.viewer.perms)) return NextResponse.json({ error: "not_allowed", field: "price" }, { status: 403, headers: noStore })
    const price = checkEventTickets(body, { startsAt: checked.value.startsAt, timezone: checked.value.timezone })
    if (!price.ok) return NextResponse.json({ error: price.error, field: price.field }, { status: 400, headers: noStore })
    tickets = price.value
  }
  const made = await createEvent(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId, input: checked.value, tickets })
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status, headers: noStore })
  return NextResponse.json({ event: made.event }, { status: 201, headers: noStore })
}
