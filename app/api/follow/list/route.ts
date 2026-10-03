/**
 * A person's followers, or the people they follow, newest follow first.
 *
 * GET ?userId=<uuid>&list=followers|following&cursor=<from the last page>
 * -> { people: [{ id, name, username, avatarUrl, href, followedByViewer,
 * isViewer }], next }. The follow graph is public (its own read policy), so
 * anybody may ask; what comes back is a name, a photo and an address,
 * never an email. Keyset paged (lib/profile/follows.ts), at most 30 a page.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { isUuid, listFollows } from "@/lib/profile/follows"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: Request) {
  const url = new URL(request.url)
  const userId = url.searchParams.get("userId")
  const list = url.searchParams.get("list")
  if (!isUuid(userId) || (list !== "followers" && list !== "following")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE })
  }
  const limited = await rateLimit({ bucket: "follow-list", subjects: [addressSubject(request)], windows: [{ limit: 120, seconds: 60 }] })
  if (limited) return limited
  const { user } = await currentUserForRequest()
  const page = await listFollows(createAdminClient(), { userId, list, cursor: url.searchParams.get("cursor"), viewerId: user?.id ?? null })
  return NextResponse.json(page, { headers: NO_STORE })
}
