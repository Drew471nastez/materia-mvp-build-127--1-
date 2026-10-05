import { NextResponse, after } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { deleteComment, getCommentView, updateComment } from "@/lib/communities/server/comments"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { announceCommentChange } from "@/lib/communities/server/realtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; commentId: string }> }

/**
 * GET: { comment } for a member who may see its post, or 404. What a post
 * open on screen reads when the live channel says a comment arrived
 * (components/community/member/live.ts): ids travel, words come from here.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, commentId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const comment = await getCommentView(db, gate.community, gate.viewer, commentId)
  if (!comment) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  return NextResponse.json({ comment }, { headers: NO_STORE })
}

/** PATCH { body }: the author edits their comment; whoever has its post open reads it again (realtime "edit"). */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, commentId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "comment")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("comment"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.comment })
  if (limited) return limited
  const result = await updateComment({ db, community: gate.community, viewer: gate.viewer }, commentId, await readJson(request))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  const comment = result.value
  after(() => announceCommentChange(communityId, { id: comment.id, postId: comment.postId, change: "edit" }))
  return NextResponse.json({ comment }, { headers: NO_STORE })
}

/** DELETE: the author deletes their comment; its replies stay under "Deleted"; whoever has its post open sees it go. */
export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, commentId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("comment"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.comment })
  if (limited) return limited
  const result = await deleteComment({ db, community: gate.community, viewer: gate.viewer }, commentId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  const { postId } = result.value
  after(() => announceCommentChange(communityId, { id: commentId, postId, change: "delete" }))
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
