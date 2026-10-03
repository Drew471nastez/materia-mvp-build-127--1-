import { NextResponse } from "next/server"

import { admin } from "@/lib/communities/server/db"
import { sessionUserId } from "@/lib/communities/server/feed"
import { lastCommunityPath } from "@/lib/communities/server/native-start"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/native/start
 *
 * Asked by app/native-start when the phone app opens for somebody without
 * seller access: { to: "/community/<slug>" } for the community they used
 * last, or { to: null } (the library then, as before). See
 * lib/communities/server/native-start.ts for who goes where.
 *
 * Who is asking comes from the session cookie, or, on a cold start before
 * the WebView's cookie is fresh, from the access token the app holds, sent
 * as a bearer and checked with Supabase auth. Never from a parameter.
 */
export async function GET(request: Request) {
  let userId = await sessionUserId()
  const db = admin()
  if (!userId) {
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/)?.[1]
    if (bearer) {
      try {
        const { data } = await db.auth.getUser(bearer)
        userId = data?.user?.id ?? null
      } catch {
        userId = null
      }
    }
  }
  if (!userId || !UUID.test(userId)) return NextResponse.json({ to: null }, { headers: NO_STORE })
  return NextResponse.json({ to: await lastCommunityPath(db, userId) }, { headers: NO_STORE })
}
