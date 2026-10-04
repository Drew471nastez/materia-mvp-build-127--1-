import { NextResponse, after } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { createComment, listComments } from "@/lib/communities/server/comments"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { announceComment } from "@/lib/communities/server/realtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; postId: string }> }

/** GET ?cursor=: { comments, nextCursor }, top level comments oldest first, each with its replies. */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, postId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const result = await listComments(db, gate.community, gate.viewer, postId, new URL(request.url).searchParams.get("cursor"))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 404, headers: NO_STORE })
  return NextResponse.json(result.value, { headers: NO_STORE })
}

/**
 * POST { body, parentId? }: { comment }. A reply to a reply is kept under its top level comment.
 * Once answered, whoever has the post open hears of it by id (lib/communities/server/realtime.ts).
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, postId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "comment")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: rateBucket("comment"),
    subjects: [memberSubject(String(gate.viewer.userId))],
    windows: RATE_LIMITS.comment,
    message: "That is a lot of comments in a short time. Try again in a few minutes.",
  })
  if (limited) return limited
  const result = await createComment({ db, community: gate.community, viewer: gate.viewer }, postId, await readJson(request))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  const comment = result.value
  after(() => announceComment(communityId, { id: comment.id, postId, parentId: comment.parentId ?? null, authorId: comment.author?.id ?? null }))
  return NextResponse.json({ comment }, { status: 201, headers: NO_STORE })
}
