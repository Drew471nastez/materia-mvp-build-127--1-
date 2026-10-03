import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { leaderboardRows } from "@/lib/communities/server/directory"
import { NO_STORE, sessionUserId } from "@/lib/communities/server/feed"
import { leaderboard, type LeaderboardPeriod } from "@/lib/communities/server/points"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET ?period=7d|30d|all: { period, entries }. Only while the community has points switched on. */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  if (!gate.community.gamification_enabled) return NextResponse.json({ error: "leaderboard_off" }, { status: 404, headers: NO_STORE })
  const raw = new URL(request.url).searchParams.get("period")
  const period: LeaderboardPeriod = raw === "7d" || raw === "all" ? raw : "30d"
  const entries = await leaderboardRows(db, gate.community.id, await leaderboard(db, gate.community.id, period, 25))
  return NextResponse.json({ period, entries }, { headers: NO_STORE })
}
