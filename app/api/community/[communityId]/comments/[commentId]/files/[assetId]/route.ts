import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { withCommentColumns } from "@/lib/communities/server/comments"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, sessionUserId, visiblePostRow } from "@/lib/communities/server/feed"
import { signCommunityFile } from "@/lib/communities/server/post-files"
import type { CommentRow } from "@/lib/communities/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; commentId: string; assetId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })

/**
 * GET /api/community/<id>/comments/<commentId>/files/<assetId>
 * A file under a comment (round 11), for an active member who may see the
 * comment's post: the comment must be this community's and still there, its
 * post one the member may see, and the file named in the comment's media as
 * the commenter's own (`store: "community"`, checked where it landed before
 * it could be sent, lib/communities/server/post-files.ts). Then a five
 * minute signed address from the commenter's folder only, saved under its
 * name, never opened inline; the same as a post's file.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, commentId, assetId } = await params
  if (!UUID.test(commentId) || !UUID.test(assetId)) return notFound()
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const { data } = await withCommentColumns((columns) => db.from("community_feed_comments").select(columns).eq("id", commentId).eq("community_id", gate.community.id).maybeSingle())
  const row = (data as CommentRow | null) ?? null
  if (!row || row.status !== "published") return notFound()
  const found = await visiblePostRow(db, gate.community, gate.viewer, row.post_id)
  if (!found || found.row.status !== "published") return notFound()
  const named = (Array.isArray(row.media) ? row.media : []).find((m) => m.type === "file" && m.assetId === assetId.toLowerCase())
  if (!named || named.type !== "file" || named.store !== "community") return notFound()
  const url = await signCommunityFile(db, gate.community, row.author_id, { assetId: named.assetId, name: named.name || "File" })
  if (!url) return NextResponse.json({ error: "The file could not be opened. Try again in a moment." }, { status: 502, headers: NO_STORE })
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE })
}
