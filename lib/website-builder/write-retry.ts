import { NextResponse } from "next/server"
import { classifyServiceError } from "@/lib/net/service-error"

/**
 * ===========================================================================
 *  A DATABASE THAT BLINKED IS A 503, AND A SAVE SENT TWICE IS ONE SAVE
 * ===========================================================================
 * Round 50. The editor's routes answered 500 for every database error. The
 * editor sends a save again by itself on a 502, 503 or 504 (lib/website-
 * builder/save-request.ts) and reads again on any 5xx, so a 500 for a
 * timeout or a dropped connection skipped the quiet retry and went straight
 * to the banner. A failure that may pass (timeout, network, a 5xx or 429
 * from Supabase) is a 503 with Retry-After now; a query that is wrong is
 * still a 500, which a retry will not change. The words are the route's
 * own, never the database's.
 */
/** Codes that name a database that was away, not a query that was wrong: PostgREST's schema cache and pool, a cancelled statement, and media-url's gateway page and cut short answer. */
const AWAY_CODES = new Set(["PGRST000", "PGRST001", "PGRST002", "PGRST003", "57014", "57P01", "53300", "SLGW1", "SLGW2"])

export function isTransientDbError(error: unknown, status?: number | null): boolean {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === "string" && AWAY_CODES.has(code)) return true
  return classifyServiceError(error, status) !== "query"
}

export function dbFailure(error: unknown, words: string, status?: number | null): NextResponse {
  const transient = isTransientDbError(error, status)
  return NextResponse.json(
    { error: words },
    { status: transient ? 503 : 500, headers: transient ? { "Retry-After": "2", "Cache-Control": "no-store" } : { "Cache-Control": "no-store" } },
  )
}

/** Postgres unique_violation: the row a first try made is already there. */
export function isDuplicate(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "23505"
}
