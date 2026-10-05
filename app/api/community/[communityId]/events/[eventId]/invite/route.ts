import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { inviteToEvent } from "@/lib/communities/server/jobs/event_ticket_invite"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/** Free seats given out: a handful of sheets at a time, and a day's worth in all. */
const INVITE_WINDOWS = [{ limit: 10, seconds: 600 }, ...RATE_LIMITS.invite] as const

/**
 * POST /api/community/<communityId>/events/<eventId>/invite
 *   { userIds?: string[]; emails?: string[]; message? }
 *   -> { invited, failed: [{ who, reason }], notMembers: string[] }
 *
 * Free tickets for a paid event, for staff with `price_events`. A member is
 * given the ticket at once and hears about it; an address that is nobody
 * here yet is sent the community's own invite link carrying this event, so
 * joining books the seat. The same person twice is one ticket.
 *
 * Refuses with { error, message }: 403 forbidden (no `price_events`), 404
 * not_found (no such event in this community), 400 free_event (nothing to
 * give) or nobody (an empty list), 409 not_set_up (run-now part 105 has not
 * run).
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string; eventId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, eventId } = await params
  const userId = await sessionUserId()
  const db = admin()
  const gate = await requireMember(db, communityId, userId, "price_events")
  if (gate instanceof NextResponse) return gate
  if (!gate.community.events_enabled) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  if (gate.community.status === "archived" || gate.community.archived_at) return NextResponse.json({ error: "archived" }, { status: 403, headers: noStore })

  const limited = await rateLimit({
    bucket: rateBucket("invite"),
    subjects: [`user:${userId}`, `community:${gate.community.id}`],
    windows: INVITE_WINDOWS,
    message: "That is a lot of invites at once. Try again in a few minutes.",
  })
  if (limited) return limited

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })
  }

  /* The switch was the first thing asked, so the emails do not read it again. */
  const result = await inviteToEvent(db, { community: gate.community, eventId, actorId: gate.viewer.userId as string, input: body, enabled: true })
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status, headers: noStore })
  return NextResponse.json(result.answer, { headers: noStore })
}
