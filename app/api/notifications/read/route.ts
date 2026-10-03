import { NextResponse } from "next/server"

import { rateLimit } from "@/lib/api/rate-limit"
import { communitiesEnabled } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { readJson, sessionUserId } from "@/lib/communities/server/feed"
import { markRead, markSeen, unreadCount } from "@/lib/notifications/user-inbox"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * POST /api/notifications/read
 *   { ids: string[] }   these rows read (either table, at most 100)
 *   { all: true }       every row read, in both tables
 *   { seen: true }      the bell was opened (profiles.notifications_seen_at)
 *
 * Only the signed in person's own rows are touched, whatever ids are sent.
 * Answers { ok, unread } with the count over both tables after the change.
 */
export async function POST(request: Request) {
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE })
  const limited = await rateLimit({ bucket: "notifications-read", subjects: [`user:${userId}`], windows: [{ limit: 60, seconds: 60 }, { limit: 600, seconds: 3600 }], message: "Too many at once. Try again in a minute." })
  if (limited) return limited
  const body = await readJson(request)
  const all = body.all === true
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 100) : null
  const seen = body.seen === true
  if (!all && !ids?.length && !seen) return NextResponse.json({ error: "Nothing to mark." }, { status: 400, headers: NO_STORE })
  const db = admin()
  const communitiesOn = await communitiesEnabled()
  if (seen) await markSeen(db, userId)
  const unread = all || ids?.length ? await markRead(db, { userId, ids, all, communitiesOn }) : await unreadCount(db, userId, communitiesOn)
  return NextResponse.json({ ok: true, unread }, { headers: NO_STORE })
}
