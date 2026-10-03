import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit, setEventCancelled, updateEvent } from "@/lib/communities/server/creator"
import { checkEvent, isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PATCH /api/app/community/<id>/events/<eventId>
 *   { status: "cancelled" | "scheduled" } cancels it or puts it back;
 *   otherwise the whole event as POST takes it, plus `replay`: a Storelib
 *   video id (or a link with one in it) of the creator's own, or "" for none.
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
    const done = await setEventCancelled(gate.ctx.admin, { communityId: gate.community.id, eventId, actorId: gate.ctx.userId, cancelled: body.status === "cancelled" })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ ok: true }, { headers: noStore })
  }
  const checked = checkEvent(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: noStore })
  const done = await updateEvent(gate.ctx.admin, { community: gate.community, creatorId: gate.ctx.creatorId, eventId, actorId: gate.ctx.userId, input: checked.value, replay: body.replay })
  if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ event: done.event }, { headers: noStore })
}
