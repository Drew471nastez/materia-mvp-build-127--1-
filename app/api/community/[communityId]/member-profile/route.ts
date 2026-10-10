import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, sessionUserId } from "@/lib/communities/server/feed"
import { memberProfilePostsPage } from "@/lib/communities/server/member-profile"
import { profileRefOf } from "@/lib/communities/member-profile-view"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET /api/community/<id>/member-profile?ref=<handle|me>&cursor=<c>: the next
 * page of a profile place's posts ({ posts, next }), read by the same loader
 * as the place's first page (lib/communities/server/member-profile.ts): my
 * own posts in every community I am in for "me", somebody's posts in this
 * community, as I may read them here, for anybody else. Members only, the
 * gate first; 404 when the ref names nobody who is a member here.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const url = new URL(request.url)
  const ref = profileRefOf(url.searchParams.get("ref"))
  if (!ref) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const cursor = url.searchParams.get("cursor")
  const page = await memberProfilePostsPage(db, gate.community, gate.viewer, ref, cursor && cursor.length <= 400 ? cursor : null)
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  return NextResponse.json(page, { headers: NO_STORE })
}
