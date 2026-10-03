import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { listEvents, monthEvents } from "@/lib/communities/server/events"
import { parseMonth } from "@/components/community/events/model"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * GET /api/community/<id>/events
 *   ?when=upcoming|past&cursor=<opaque>   -> { events: EventCardView[], nextCursor }
 *   ?month=YYYY-MM                         -> { events: EventCardView[] } for the calendar grid
 *
 * For active members. Each event carries the viewer's own answer and, when
 * its access rule leaves them out, the reason in words. No meeting links
 * here: those are only on the event itself, in its join window.
 */
export async function GET(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  if (!gate.community.events_enabled) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const url = new URL(request.url)
  const monthParam = url.searchParams.get("month")
  if (monthParam !== null) {
    const month = parseMonth(monthParam)
    if (!month) return NextResponse.json({ error: "bad_month" }, { status: 400, headers: noStore })
    return NextResponse.json({ events: await monthEvents(db, gate.community, gate.viewer, month.year, month.month) }, { headers: noStore })
  }
  const when = url.searchParams.get("when") === "past" ? "past" : "upcoming"
  const page = await listEvents(db, gate.community, gate.viewer, { when, cursor: url.searchParams.get("cursor") })
  return NextResponse.json(page, { headers: noStore })
}
