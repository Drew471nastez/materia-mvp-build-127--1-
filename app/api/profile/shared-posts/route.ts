/**
 * GET /api/profile/shared-posts?userId=<person>&communityId=<community>&cursor=<page>
 * -> { posts, next }: the next six of that person's posts in a community
 * the signed in viewer is also in, only from spaces the viewer may read
 * (lib/profile/shared-posts.ts). 404 communities_off while the switch is
 * off, 401 signed out, 404 when the viewer may not look.
 */
import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { sharedPostsPage } from "@/lib/profile/shared-posts"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: Request) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewerId = user?.id ?? null
  if (!viewerId) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE })
  const params = new URL(request.url).searchParams
  const page = await sharedPostsPage(createAdminClient(), {
    communityId: params.get("communityId") || "",
    targetId: params.get("userId") || "",
    viewerId,
    cursor: params.get("cursor"),
  })
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  return NextResponse.json(page, { headers: NO_STORE })
}
