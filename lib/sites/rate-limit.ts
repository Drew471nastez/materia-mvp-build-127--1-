import "server-only"

/**
 * Per-creator limits on the expensive endpoints.
 *
 * The monthly AI quota was the only control, and a monthly quota with no rate
 * limit is a monthly quota that can be spent in one minute — by a script, or
 * by a stuck retry loop in somebody's browser. Publishing had nothing at all,
 * and each publish is a build plus an upload of every file.
 *
 * ---------------------------------------------------------------------------
 *  COUNTED IN POSTGRES, NOT IN MEMORY
 * ---------------------------------------------------------------------------
 * An in-process counter is worthless here: serverless functions scale
 * horizontally, so ten concurrent invocations each see an empty map and let
 * ten requests through. The rows already exist — `site_agent_runs` and
 * `site_deployments` both record every attempt with a timestamp — so the limit
 * is a COUNT over a time window on data we are already keeping. No Redis, no
 * new service, no new failure mode.
 *
 * The trade is honest: a burst that arrives inside the same few milliseconds
 * can slip past, because the count is read before the row is written. That is
 * a handful of extra runs, not an unbounded loop, and closing it properly
 * means a transaction around work that takes minutes.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export interface RateWindow {
  /** How many are allowed in the window. */
  limit: number
  /** How long the window is, in seconds. */
  seconds: number
  /** What to tell the person. Never "rate limited". */
  message: string
}

/**
 * Chosen against what a person actually does, not against a round number.
 *
 * A creator iterating hard sends a prompt every 20–30 seconds; six a minute is
 * already faster than anyone reads a result. Publishing twice a minute is
 * more than anybody needs and still bounds the cost of a stuck button.
 */
export const AGENT_LIMITS: RateWindow[] = [
  { limit: 6, seconds: 60, message: "You are sending edits faster than they can run. Wait a moment." },
  { limit: 40, seconds: 3600, message: "That is a lot of edits in an hour. Try again shortly." },
]

export const PUBLISH_LIMITS: RateWindow[] = [
  { limit: 2, seconds: 60, message: "Publishing is already running. Give it a minute." },
  { limit: 20, seconds: 3600, message: "That is a lot of publishes in an hour. Try again shortly." },
]

async function countSince(
  table: "site_agent_runs" | "site_deployments",
  column: string,
  value: string,
  seconds: number,
): Promise<number> {
  const since = new Date(Date.now() - seconds * 1000).toISOString()
  const { count } = await createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", since)
  return count ?? 0
}

/** Null when the request may proceed, otherwise what to tell the person. */
export async function agentRateLimit(creatorId: string): Promise<string | null> {
  for (const window of AGENT_LIMITS) {
    if ((await countSince("site_agent_runs", "creator_id", creatorId, window.seconds)) >= window.limit) {
      return window.message
    }
  }
  return null
}

/**
 * Keyed on the SITE, not the creator.
 *
 * Publishing is per-site work, and a creator with three sites publishing each
 * of them once is doing something completely reasonable that a creator-wide
 * limit would refuse.
 */
export async function publishRateLimit(siteId: string): Promise<string | null> {
  for (const window of PUBLISH_LIMITS) {
    if ((await countSince("site_deployments", "site_id", siteId, window.seconds)) >= window.limit) {
      return window.message
    }
  }
  return null
}
