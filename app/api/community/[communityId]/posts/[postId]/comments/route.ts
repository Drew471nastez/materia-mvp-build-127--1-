import { NextResponse, after } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { createComment, listComments } from "@/lib/communities/server/comments"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { announceComment } from "@/lib/communities/server/realtime"
import { HELD_MESSAGE, isHeld } from "@/lib/communities/server/safety"
import { timed } from "@/lib/perf/server-timing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; postId: string }> }

/** GET ?cursor=: { comments, nextCursor }, top level comments oldest first, each with its replies. */
async function handleGET(request: Request, { params }: Params) {
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
 * POST { body, parentId?, media? }: { comment }. A reply to a reply is kept under its top level comment.
 * `media` (round 12): pictures the member uploaded for this community, one GIF and one video by link
 * (YouTube, Vimeo, Loom), checked like a post's and then as theirs and still there; a file is refused
 * (lib/communities/server/comments.ts checkCommentMedia).
 * Once answered, whoever has the post open hears of it by id (lib/communities/server/realtime.ts).
 */
async function handlePOST(request: Request, { params }: Params) {
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
  if (isHeld(result)) return NextResponse.json({ comment, held: true, message: HELD_MESSAGE }, { status: 202, headers: NO_STORE })
  after(() => announceComment(communityId, { id: comment.id, postId, parentId: comment.parentId ?? null, authorId: comment.author?.id ?? null }))
  return NextResponse.json({ comment }, { status: 201, headers: NO_STORE })
}

/* Timed for /admin/performance, one request in five (lib/perf/server-timing.ts). */
export const GET = timed("community", "/api/community/:id/posts/:id/comments", handleGET)
export const POST = timed("community", "/api/community/:id/posts/:id/comments", handlePOST)
