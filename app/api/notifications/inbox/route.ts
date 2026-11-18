import { NextResponse } from "next/server"

import { rateLimit } from "@/lib/api/rate-limit"
import { communitiesEnabled } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { sessionUserId } from "@/lib/communities/server/feed"
import { listInbox, unreadCount } from "@/lib/notifications/user-inbox"
import { isInboxFilter } from "@/lib/notifications/user-inbox-shared"
import { signedOutOrRetry } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * GET /api/notifications/inbox?filter=all|communities|following|purchases&cursor=
 * GET /api/notifications/inbox?summary=1   { unread } only, for the badge
 *
 * The signed in person's bell (components/notifications/notification-bell.tsx):
 * their community notifications and their own inbox (user_notifications)
 * merged newest first, a page at a time on one cursor, with each actor's
 * name and photo and the unread count over both
 * (lib/notifications/user-inbox.ts listInbox). Answers
 * { items, unread, nextCursor, available }.
 *
 * Not /api/notifications itself: that is the creator's /app bell
 * (seller_notifications) and stays as it is. The person comes from the
 * session only; rows are read by the server for that person and nobody
 * else. Community rows are left out while communities are switched off.
 */
export async function GET(request: Request) {
  const userId = await sessionUserId()
  if (!userId) return signedOutOrRetry(NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE }))
  const limited = await rateLimit({ bucket: "notifications-inbox", subjects: [`user:${userId}`], windows: [{ limit: 120, seconds: 60 }, { limit: 2000, seconds: 3600 }], message: "Too many refreshes just now. Try again in a minute." })
  if (limited) return limited
  const params = new URL(request.url).searchParams
  if (params.get("summary") === "1") return NextResponse.json({ unread: await unreadCount(admin(), userId, await communitiesEnabled()) }, { headers: NO_STORE })
  const filter = params.get("filter")
  const page = await listInbox(admin(), {
    userId,
    filter: isInboxFilter(filter) ? filter : "all",
    cursor: params.get("cursor"),
    communitiesOn: await communitiesEnabled(),
  })
  return NextResponse.json(page, { headers: NO_STORE })
}
