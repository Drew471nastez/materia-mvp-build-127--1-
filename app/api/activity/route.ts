import { NextResponse, type NextRequest } from "next/server"

import { readerForRequest } from "@/lib/auth/route-user"
import { MAX_BODY_BYTES } from "@/lib/activity/creator-activity"
import { ingestBatch } from "@/lib/activity/creator-activity-server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  POST /api/activity: ONE MINUTE OF A CREATOR'S /app, IN ONE SMALL BODY
 * ===========================================================================
 * Sent by components/app/activity-beacon.tsx with navigator.sendBeacon or
 * fetch keepalive: pages opened (ids replaced by `:id`) and named actions,
 * at most once a minute while the tab is visible and once when it hides.
 * Nothing typed is in it, and the route keeps nothing it was not built to
 * keep (lib/activity/creator-activity parseBatch drops the rest).
 *
 * WHO. The signed in person's own token, checked here by its signature
 * (lib/auth/route-user readerForRequest). Events are written under that
 * person and nobody else, with the service role, because the tables are
 * closed to signed in users (part 430): a creator cannot read or write
 * anyone's activity, their own included.
 *
 * THE ANSWER IS ALWAYS 204, quickly: the tracker does nothing with it, and a
 * person who is signed out or sending too fast learns nothing from it.
 */
const NO_CONTENT = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })

export async function POST(request: NextRequest) {
  let body: unknown = null
  try {
    const text = await request.text()
    if (!text || text.length > MAX_BODY_BYTES) return NO_CONTENT()
    body = JSON.parse(text)
  } catch {
    return NO_CONTENT()
  }

  const current = await readerForRequest()
  if (!current.user) return NO_CONTENT()

  await ingestBatch(createAdminClient(), { userId: current.user.id, body, headers: request.headers, now: Date.now() })
  return NO_CONTENT()
}
