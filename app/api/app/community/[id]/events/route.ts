import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { createEvent, loadEvents, manageLimit } from "@/lib/communities/server/creator"
import { checkEvent } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET  /api/app/community/<id>/events -> { upcoming, past }
 * POST /api/app/community/<id>/events { title, description, kind, startDate, startTime, endDate?, endTime?,
 *      timezone (IANA), location?, meetingUrl?, livestreamUrl?, capacity?, coverUrl?, access? } -> { event }
 *      The date and time are the event's own zone; they are stored as instants.
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
  const checked = checkEvent(await readJson(request))
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: noStore })
  const made = await createEvent(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId, input: checked.value })
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status, headers: noStore })
  return NextResponse.json({ event: made.event }, { status: 201, headers: noStore })
}
