import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { listNotifications, markNotificationsRead } from "@/lib/communities/server/mentions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET ?cursor=: the member's notifications in this community, { notifications, unread, nextCursor }. */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const page = await listNotifications(db, gate.community, String(gate.viewer.userId), new URL(request.url).searchParams.get("cursor"))
  return NextResponse.json(page, { headers: NO_STORE })
}

/** POST { read: string[] | "all" }: marks them read. Answers { ok, unread }. */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("reaction"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.reaction })
  if (limited) return limited
  const body = await readJson(request)
  const which = body.read === "all" ? "all" : Array.isArray(body.read) ? body.read.filter((x): x is string => typeof x === "string") : null
  if (!which) return NextResponse.json({ error: "Nothing to mark." }, { status: 400, headers: NO_STORE })
  const unread = await markNotificationsRead(db, gate.community.id, String(gate.viewer.userId), which)
  return NextResponse.json({ ok: true, unread }, { headers: NO_STORE })
}
