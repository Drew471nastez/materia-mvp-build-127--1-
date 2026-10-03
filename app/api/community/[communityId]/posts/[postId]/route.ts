import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, deletePost, getPostView, memberSubject, readJson, sessionUserId, updatePost } from "@/lib/communities/server/feed"

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

/** PATCH { title?, body?, media? }: the author edits their own post. Moderators use /moderation/act. */
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
  return NextResponse.json({ post: result.value }, { headers: NO_STORE })
}

/** DELETE: the author deletes their own post (kept as status deleted). */
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
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
