import "server-only"

import { NextResponse, after, type NextRequest } from "next/server"

import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { getMainDomain } from "@/lib/url-helpers"
import { collect, type CollectKind, type CollectOutcome } from "./collect"
import { MARKER_TTL_MS, OWN_MARKER_COOKIE, marksOwner } from "./own-marker"
import { isOwnVisit } from "./own-visit"

/**
 * The three tracking routes' shared door onto lib/analytics/collect: the
 * body read as text (navigator.sendBeacon sends text/plain, fetch sends
 * JSON, and both are the same JSON), the request's headers and cookies, the
 * owner check and the rate limit. The database client is the route's own
 * (the service role, since a visitor has no session to write with), so each
 * route that holds that key says so in its own source
 * (tests/admin-key-routes.test.ts).
 */

/** A beacon is a few hundred bytes; anything past this is not one. */
const MAX_BODY = 8_000

export async function readBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text()
    if (!text || text.length > MAX_BODY) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

type Db = Parameters<typeof collect>[1]["db"]

export async function collectFrom(req: NextRequest, kind: CollectKind, body: unknown, db: Db): Promise<CollectOutcome> {
  const outcome = await collect(
    {
      kind,
      body,
      headers: req.headers,
      cookie: (name) => req.cookies.get(name)?.value,
      cookieNames: req.cookies.getAll().map((c) => c.name),
    },
    {
      db,
      now: Date.now,
      mainDomain: getMainDomain(),
      isOwnVisit,
      marksOwner,
      limited: async (subject) => (await rateLimit({ bucket: "track", subjects: [subject], windows: LIMITS.track })) !== null,
    },
  )
  /* A recorded page view, on to the store's own analytics tools when it has any and the visitor's consent allows (lib/analytics/destinations), after the response. */
  if (kind === "view" && outcome.recorded && outcome.row) {
    const row = outcome.row
    const visitor = { headers: req.headers, cookie: (name: string) => req.cookies.get(name)?.value }
    const forward = async () => {
      try {
        const { forwardPageView } = await import("./destinations/forward-server")
        await forwardPageView(db, row, visitor)
      } catch {
        /* the view is recorded; the tools miss one */
      }
    }
    try {
      after(forward)
    } catch {
      void forward()
    }
  }
  return outcome
}

/**
 * THE ANSWER IS ALWAYS 204. Recorded, a repeat, a robot or refused: the
 * page does nothing with the answer, and a robot learns nothing from it.
 * The one thing it carries is the visitor cookie a page view sets or clears.
 */
export function trackResponse(outcome: CollectOutcome | null): NextResponse {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Cache-Control", "no-store")
  const cookie = outcome?.visitorCookie
  if (cookie && "set" in cookie) {
    res.cookies.set("visitor_id", cookie.set, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: "lax", secure: true, path: "/" })
  } else if (cookie && "clear" in cookie) {
    res.cookies.set("visitor_id", "", { maxAge: 0, path: "/" })
  }
  /* The creator's own browser, marked on this host as /api/analytics/own marks it: host-only, unreadable by a page. */
  if (outcome?.ownMarker) res.cookies.set(OWN_MARKER_COOKIE, outcome.ownMarker, { maxAge: Math.floor(MARKER_TTL_MS / 1000), httpOnly: true, sameSite: "lax", secure: true, path: "/" })
  return res
}
