import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { eventDetailsOpen, icsFields, readEvent } from "@/lib/communities/server/events"
import { eventIcs } from "@/components/community/events/model"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/community/<id>/events/<eventId>/ics
 *
 * The event as a calendar file for Apple Calendar, Outlook and the rest.
 * For active members only. It holds the event page's address, never the
 * meeting link (that opens on the page 15 minutes before the start).
 *
 * A PAID EVENT'S FILE IS FOR ITS TICKET HOLDERS. The same gate the page
 * applies is applied here (eventDetailsOpen), so a member who has not
 * bought a seat cannot read the time, the address or the words out of the
 * calendar file instead.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ communityId: string; eventId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, eventId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const event = gate.community.events_enabled ? await readEvent(db, gate.community.id, eventId) : null
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
  if (!(await eventDetailsOpen(db, event, gate.viewer))) return NextResponse.json({ error: "ticket_needed" }, { status: 403, headers: { "Cache-Control": "private, no-store" } })
  const name = event.title.replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 60).replace(/\s+/g, "-") || "event"
  return new NextResponse(eventIcs(icsFields(gate.community, event)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.ics"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
