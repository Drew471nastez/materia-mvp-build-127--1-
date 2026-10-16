import { NextResponse, after } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, deletePost, getPostView, memberSubject, readJson, sessionUserId, updatePost } from "@/lib/communities/server/feed"
import { announcePostChange } from "@/lib/communities/server/realtime"
import { blurPostVideos } from "@/lib/communities/server/video-posters"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; postId: string }> }

/** GET /api/community/<id>/posts/<postId>: { post }, when it is in this community and the member may see its space. */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, postId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const post = await getPostView(db, gate.community, gate.viewer, postId)
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  return NextResponse.json({ post }, { headers: NO_STORE })
}

/**
 * PATCH { title?, body?, media?, spaceId?, poll? }: the author edits their own post (round 13: the same
 * composer as a new post, so its space and its poll too). Moderators use /moderation/act. Once saved,
 * whoever has the community open hears the post's id ("edit") and reads it again through the gate.
 */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, postId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "post")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("post"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.post, message: "That is a lot of changes in a short time. Try again a little later." })
  if (limited) return limited
  const result = await updatePost({ db, community: gate.community, viewer: gate.viewer }, postId, await readJson(request))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  const post = result.value
  after(() => announcePostChange(communityId, { id: post.id, spaceId: post.space?.id ?? null, change: "edit" }))
  /* Round 33: an edit's media comes back through checkMedia without the 16px copies; they are made again (video-posters.ts). */
  if (post.media.some((m) => m.type === "video")) after(() => blurPostVideos(db, communityId, post.id))
  return NextResponse.json({ post }, { headers: NO_STORE })
}

/** DELETE: the author deletes their own post (kept as status deleted); whoever has the community open sees it go (realtime "delete"). */
export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, postId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("post"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.post })
  if (limited) return limited
  const result = await deletePost({ db, community: gate.community, viewer: gate.viewer }, postId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  after(() => announcePostChange(communityId, { id: postId, change: "delete" }))
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
