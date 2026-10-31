/**
 * ===========================================================================
 *  A CRASH IN SOMEBODY'S BROWSER, WRITTEN DOWN
 * ===========================================================================
 * The reason "Application error: a client-side exception has occurred" was so
 * expensive is that it is INVISIBLE from here. It happens in a browser, so
 * the server never sees it, the deploy is READY, every runtime log is green,
 * and the only evidence is a person saying the site went blank. There is
 * nothing to search and nothing to compare against a deploy.
 *
 * So the boundaries say so, and it lands in the server log, where Vercel's
 * own error grouping can see it.
 *
 * ---------------------------------------------------------------------------
 *  WHAT THIS IS NOT ALLOWED TO CARRY
 * ---------------------------------------------------------------------------
 * A crash report is not a reason to collect anything about a person. No
 * cookies, no headers, no session, no user id, no query string, no form
 * values, no stack from the client. The body is four fields, every one of
 * them is validated here rather than trusted, and anything else in it is
 * dropped rather than logged. The path has its query removed before it is
 * written, because a query is where an email address or a token ends up.
 *
 * It is also NOT AUTHENTICATED, because a crash that stops somebody signing
 * in is exactly the one worth hearing about. That makes it a public endpoint
 * that writes to a log, so it is rate limited by IP and the body is capped.
 */

import { NextResponse } from "next/server"
import { reportError } from "@/lib/observability/report"
import { requestIdFrom } from "@/lib/net/request-id"

export const runtime = "nodejs"

/** Small enough that an oversized body is refused rather than parsed. */
const MAX_BYTES = 2_000

/**
 * IN MEMORY ON PURPOSE, AND ONLY FOR THIS.
 *
 * Serverless instances do not share memory, so this is not a rate limit that
 * can be relied on for anything that matters. It does not need to be: the
 * worst case is a few extra lines in a log. Anything that required a real
 * limit would need a shared store, and a crash reporter is not worth one.
 */
const seen = new Map<string, { count: number; since: number }>()
const WINDOW_MS = 60_000
const PER_WINDOW = 20

function tooMany(key: string): boolean {
  const now = Date.now()
  const entry = seen.get(key)
  if (!entry || now - entry.since > WINDOW_MS) {
    seen.set(key, { count: 1, since: now })
    if (seen.size > 500) {
      for (const [k, v] of seen) if (now - v.since > WINDOW_MS) seen.delete(k)
    }
    return false
  }
  entry.count += 1
  return entry.count > PER_WINDOW
}

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\r\n]+/g, " ").slice(0, max) : ""

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (tooMany(ip)) return new NextResponse(null, { status: 204 })

  const raw = await request.text().catch(() => "")
  if (!raw || raw.length > MAX_BYTES) return new NextResponse(null, { status: 204 })

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  const message = clean(body.message, 300)
  const digest = clean(body.digest, 64)
  /** The path only, never the query: a query is where a token ends up. */
  const path = clean(body.path, 200).split("?")[0]
  const stale = body.stale === true

  if (!message) return new NextResponse(null, { status: 204 })

  /**
   * A stale chunk is not a fault, it is a tab that predates a deploy, and it
   * has already healed itself by reloading. Logged at a lower level so it
   * does not drown the ones that are real.
   */
  if (stale) {
    console.warn(`[client-error] stale code on ${path}: ${message}`)
  } else {
    /* Counted with every other error and told to the owner once (lib/observability/report). */
    await reportError({ source: "client", where: path || "unknown page", error: new Error(message), context: { digest: digest || null }, requestId: requestIdFrom(request.headers) })
  }

  /** Nothing to say back. A reporter that returns a body invites a retry. */
  return new NextResponse(null, { status: 204 })
}
