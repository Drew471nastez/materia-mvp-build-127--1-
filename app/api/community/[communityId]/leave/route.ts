import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { joinRateLimit, leaveCommunity } from "@/lib/communities/server/join"
import { saveLeaveReason } from "@/lib/communities/server/leave-reasons"
import { parseLeaveReason } from "@/lib/communities/leave-reasons"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store" }

/**
 * POST /api/community/<communityId>/leave
 *
 * An active member leaves, or a pending request is withdrawn: { state:
 * "left" | "withdrawn" }. The row stays (cancelled), so their posts and
 * points stay theirs and joining again starts from it. The owner cannot
 * leave (409 owner). A member who pays by subscription is answered 409
 * manage_billing with the membership's address: cancelling there keeps
 * their access until the paid period ends, leaving here would not stop the
 * charges.
 *
 * WHY (round 12, part 98): the body may say { reason, note } (one of the six
 * in lib/communities/leave-reasons.ts, a note of at most 500 characters).
 * Kept for the community's owner and admins only once the member has really
 * left; a body that says nothing, an unknown reason, or a database without
 * part 98 leaves exactly as before.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "sign_in", message: "Sign in first." }, { status: 401, headers: noStore })
  const limited = await joinRateLimit(user.id)
  if (limited) return limited
  const why = parseLeaveReason(await request.json().catch(() => null))
  const answer = await leaveCommunity(admin(), communityId, user.id)
  if (!answer.ok) return NextResponse.json({ error: answer.error, message: answer.message, ...(answer.url ? { url: answer.url } : {}) }, { status: answer.status, headers: noStore })
  if (why && answer.state === "left") await saveLeaveReason(admin(), communityId, user.id, why)
  return NextResponse.json({ state: answer.state }, { headers: noStore })
}
