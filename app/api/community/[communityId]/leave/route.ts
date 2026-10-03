import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { joinRateLimit, leaveCommunity } from "@/lib/communities/server/join"
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
 */
export async function POST(_request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "sign_in", message: "Sign in first." }, { status: 401, headers: noStore })
  const limited = await joinRateLimit(user.id)
  if (limited) return limited
  const answer = await leaveCommunity(admin(), communityId, user.id)
  if (!answer.ok) return NextResponse.json({ error: answer.error, message: answer.message, ...(answer.url ? { url: answer.url } : {}) }, { status: answer.status, headers: noStore })
  return NextResponse.json({ state: answer.state }, { headers: noStore })
}
