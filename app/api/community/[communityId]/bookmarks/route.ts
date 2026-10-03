import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, listSaved, memberSubject, readJson, sessionUserId, setBookmark } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET ?cursor=: the member's saved posts here, newest saved first: { posts, nextCursor }. */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const page = await listSaved(db, gate.community, gate.viewer, new URL(request.url).searchParams.get("cursor"))
  return NextResponse.json(page, { headers: NO_STORE })
}

/** POST { postId, on }: saves or unsaves a post. Answers { on }. Counted with reactions. */
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
  if (typeof body.postId !== "string" || !UUID.test(body.postId)) return NextResponse.json({ error: "That post is gone." }, { status: 404, headers: NO_STORE })
  const result = await setBookmark({ db, community: gate.community, viewer: gate.viewer }, body.postId, body.on !== false)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json({ on: result.value }, { headers: NO_STORE })
}
