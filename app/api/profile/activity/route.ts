/**
 * The next page of a person's public activity: GET ?userId=<uuid>&cursor=
 * -> { items, next, hidden }. Public things only (lib/profile/activity.ts),
 * nothing at all when the person hid their activity and the viewer is not
 * them. Read with the service role after those checks.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/profile/follows"
import { activityFor } from "@/lib/profile/activity-page"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const userId = url.searchParams.get("userId")
  if (!isUuid(userId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const limited = await rateLimit({ bucket: "profile-activity", subjects: [addressSubject(request)], windows: [{ limit: 120, seconds: 60 }] })
  if (limited) return limited
  const { user } = await currentUserForRequest()
  const answer = await activityFor(createAdminClient(), { userId, viewerId: user?.id ?? null, cursor: url.searchParams.get("cursor") })
  return NextResponse.json(answer, { headers: { "Cache-Control": "no-store" } })
}
