import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { finishOnboarding, joinRateLimit } from "@/lib/communities/server/join"
import { createClient } from "@/lib/supabase/server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store" }

/**
 * POST /api/community/<communityId>/onboarding
 *
 * The member has been through the welcome (the community's onboarding:
 * welcome, rules, intro prompt). Sets onboarded_at once and answers
 * { onboardedAt }; a second call answers the same time. Active members only
 * (requireMember "view"), so nobody marks somebody else's.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  const db = admin()
  const gate = await requireMember(db, communityId, user?.id ?? null, "view")
  if (gate instanceof NextResponse) return gate
  const limited = await joinRateLimit(gate.viewer.userId as string)
  if (limited) return limited
  const done = await finishOnboarding(db, gate.community.id, gate.viewer.userId as string)
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ onboardedAt: done.onboardedAt }, { headers: noStore })
}
