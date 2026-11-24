import { NextResponse, type NextRequest } from "next/server"

import { readerForRequest } from "@/lib/auth/route-user"
import { LIVE_MAX_BODY_BYTES } from "@/lib/live/live"
import { ingestLive } from "@/lib/live/live-server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  POST /api/live: ONE MINUTE OF ONE TAB, ANYWHERE ON STORELIB
 * ===========================================================================
 * Sent by components/platform/live-beacon.tsx with fetch keepalive or
 * navigator.sendBeacon: the pages the tab opened (ids as `:id`) and the named
 * actions, at most once a minute while it is shown and once as it hides.
 * lib/live/live-server.ts decides everything: robots, consent, the account,
 * the one database call (part 477), with the service role because the tables
 * are closed to everyone else.
 *
 * THE ANSWER IS ALWAYS 204: the beacon does nothing with it, and a robot or a
 * flood learns nothing from it. No cookie is set.
 */
const NO_CONTENT = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })

export async function POST(request: NextRequest) {
  let body: unknown = null
  try {
    const text = await request.text()
    if (!text || text.length > LIVE_MAX_BODY_BYTES) return NO_CONTENT()
    body = JSON.parse(text)
  } catch {
    return NO_CONTENT()
  }
  await ingestLive(createAdminClient(), {
    body,
    headers: request.headers,
    cookie: (name) => request.cookies.get(name)?.value,
    cookieNames: request.cookies.getAll().map((c) => c.name),
    now: Date.now(),
    mainDomain: getMainDomain(),
    account: async () => (await readerForRequest()).user?.id ?? null,
  })
  return NO_CONTENT()
}
