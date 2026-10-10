import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, sessionUserId } from "@/lib/communities/server/feed"
import { myPostsPage } from "@/lib/communities/server/member-profile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/account/posts?cursor=<c>: the next page of the Posts pill on your
 * account page ({ posts, next }), my own posts in every community I am an
 * active member of, read by the same loader as round 15's profile place
 * (lib/communities/server/member-profile.ts myPostsPage), so the two can
 * never disagree about which posts are mine to see, edit or delete. Only the
 * signed in person's own, from the session: nothing in the request names a
 * person. Off with the communities switch, like every community route.
 */
export async function GET(request: Request) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE })
  const raw = new URL(request.url).searchParams.get("cursor")
  const page = await myPostsPage(admin(), userId, raw && raw.length <= 400 ? raw : null)
  return NextResponse.json(page, { headers: NO_STORE })
}
