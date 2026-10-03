import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { eventDetail } from "@/lib/communities/server/events"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * GET /api/community/<id>/events/<eventId>  -> { event: EventDetailView }
 *
 * The event page asks again here when the join window opens: meetingUrl is
 * filled in only for a member the event's rule lets in, from 15 minutes
 * before the start until the end. An event of another community is a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ communityId: string; eventId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, eventId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  if (!gate.community.events_enabled) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const event = await eventDetail(db, gate.community, gate.viewer, eventId)
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  return NextResponse.json({ event }, { headers: noStore })
}
