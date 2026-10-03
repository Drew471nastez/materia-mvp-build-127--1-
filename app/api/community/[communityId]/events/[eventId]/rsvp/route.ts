import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { answerEvent } from "@/lib/communities/server/events"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/** Answers per member: plenty for changing your mind, not enough to flood the waitlist. */
const RSVP_WINDOWS = [{ limit: 30, seconds: 600 }] as const

/**
 * POST /api/community/<id>/events/<eventId>/rsvp  { going: boolean }
 *   -> { status: "going" | "waitlist" | "cancelled", goingCount, capacity }
 *
 * Through public.community_rsvp, which holds capacity and the waitlist. The
 * event must be this community's and open to the member; a cancelled or
 * finished event takes no new "going".
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string; eventId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, eventId } = await params
  const userId = await sessionUserId()
  const db = admin()
  const gate = await requireMember(db, communityId, userId, "view")
  if (gate instanceof NextResponse) return gate
  if (!gate.community.events_enabled) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  if (gate.community.status === "archived" || gate.community.archived_at) return NextResponse.json({ error: "archived" }, { status: 403, headers: noStore })

  const limited = await rateLimit({ bucket: "community-rsvp", subjects: [`user:${userId}`], windows: RSVP_WINDOWS, message: "That is a lot of answers in a short time. Wait a few minutes." })
  if (limited) return limited

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })
  }
  if (typeof body.going !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })

  const outcome = await answerEvent(db, gate.community, gate.viewer, eventId, body.going)
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, message: outcome.message }, { status: outcome.status, headers: noStore })
  return NextResponse.json({ status: outcome.status, goingCount: outcome.goingCount, capacity: outcome.capacity }, { headers: noStore })
}
