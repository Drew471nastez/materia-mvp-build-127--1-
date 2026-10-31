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

/**
 * WHEN THE COUNT CANNOT BE READ, NO AI RUN STARTS.
 *
 * A count that failed used to read as zero, so exactly when the database was
 * slow (and runs were slow and retried) every per-creator limit on Storelib
 * AI disappeared, and model spend had no bound. A run refused for a moment
 * costs the creator a retry; a run let through costs tokens nobody limited.
 * The routes answer this with 503 and these words. Publishing (no model) is
 * still let through on a failed count.
 */
export const AI_LIMIT_UNREADABLE = "Storelib AI could not check your usage just now, so nothing was started. Try again in a moment."

/** The status a limit's message is answered with: 503 when the count could not be read, 429 when it was over. */
export function limitStatus(message: string): 429 | 503 {
  return message === AI_LIMIT_UNREADABLE ? 503 : 429
}

class CountUnreadable extends Error {}

async function countSince(
  table: "site_agent_runs" | "site_deployments",
  column: string,
  value: string,
  seconds: number,
): Promise<number> {
  const since = new Date(Date.now() - seconds * 1000).toISOString()
  const { count, error } = await createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", since)
  /* A failed count is not zero. */
  if (error) throw new CountUnreadable(error.message || error.code || "count failed")
  return count ?? 0
}

/** Null when the request may proceed, otherwise what to tell the person. */
export async function agentRateLimit(creatorId: string): Promise<string | null> {
  try {
    for (const window of AGENT_LIMITS) {
      if ((await countSince("site_agent_runs", "creator_id", creatorId, window.seconds)) >= window.limit) {
        return window.message
      }
    }
  } catch (e) {
    console.warn("[ai limits] count unreadable, run refused", { why: e instanceof Error ? e.message : String(e) })
    return AI_LIMIT_UNREADABLE
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
  try {
    for (const window of PUBLISH_LIMITS) {
      if ((await countSince("site_deployments", "site_id", siteId, window.seconds)) >= window.limit) {
        return window.message
      }
    }
  } catch {
    /* No model is reached by a publish: a count that cannot be read lets it go, as it always has. */
  }
  return null
}

/*
 * ===========================================================================
 *  THE WEBSITE BUILDER'S STORELIB AI, COUNTED FROM ITS OWN ROWS
 * ===========================================================================
 * The theme agent (app/api/website-builder/themes/[installId]/agent) called
 * agentRateLimit, which counts site_agent_runs: the CODE agent's table. The
 * theme agent never writes there, so its limit counted nothing, and one
 * creator (a script, a stuck retry, five tabs) could hold any number of 300
 * second runs at once on Storelib's AI key and the shared function pool.
 *
 * Every theme agent run, and every Code a section run, writes its question
 * to theme_chat_messages before the model is reached and its answer when it
 * is over (lib/website-builder/agent/chat.ts). So the count is over rows that
 * already exist, by the (install_id, created_at) index they already have:
 *
 *   per minute and per hour   questions asked, as for the code agent
 *   at once                   questions in the last run's length without an
 *                             answer yet. A run that died without answering
 *                             stops counting when its 300 seconds are up.
 *
 * A count that cannot be read refuses the run with AI_LIMIT_UNREADABLE (a
 * 503, Try again): see above. Changed on purpose (round rel-sites); it used
 * to let the run go, which left model spend unbounded during an incident.
 */
export const THEME_AGENT_LIMITS: RateWindow[] = [
  { limit: 8, seconds: 60, message: "You are sending edits faster than they can run. Wait a moment." },
  { limit: 120, seconds: 3600, message: "That is a lot of edits in an hour. Try again shortly." },
]
/** Runs one creator may have going at the same time, across all their websites. */
export const THEME_AGENT_AT_ONCE = 3
/** How long a run can be going: the route's maxDuration. */
export const THEME_AGENT_RUN_SECONDS = 300
export const THEME_AGENT_BUSY = `Storelib AI is already making ${THEME_AGENT_AT_ONCE} changes for you. Wait for one to finish.`

/** The verdict from the last hour's rows, newest first or in any order. Pure, so it has a test. */
export function themeAgentVerdict(rows: { role: string; created_at: string }[], now: number = Date.now()): string | null {
  const age = (r: { created_at: string }) => (now - Date.parse(r.created_at)) / 1000
  const asked = rows.filter((r) => r.role === "user")
  for (const window of THEME_AGENT_LIMITS) {
    if (asked.filter((r) => age(r) <= window.seconds).length >= window.limit) return window.message
  }
  const recent = (role: string) => rows.filter((r) => r.role === role && age(r) <= THEME_AGENT_RUN_SECONDS).length
  if (recent("user") - recent("assistant") >= THEME_AGENT_AT_ONCE) return THEME_AGENT_BUSY
  return null
}

type LimitDb = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Null when the run may start, otherwise what to tell the creator. */
export async function themeAgentLimit(creatorId: string, db?: LimitDb): Promise<string | null> {
  try {
    const admin = db ?? (createAdminClient() as unknown as LimitDb)
    const { data: installs, error } = await admin.from("store_theme_installs").select("id").eq("creator_id", creatorId).limit(200)
    if (error || !Array.isArray(installs)) return AI_LIMIT_UNREADABLE
    if (installs.length === 0) return null
    const since = new Date(Date.now() - 3600_000).toISOString()
    const { data: rows, error: readError } = await admin
      .from("theme_chat_messages")
      .select("role, created_at")
      .in("install_id", (installs as { id: string }[]).map((i) => i.id))
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500)
    if (readError || !Array.isArray(rows)) return AI_LIMIT_UNREADABLE
    return themeAgentVerdict(rows as { role: string; created_at: string }[])
  } catch {
    return AI_LIMIT_UNREADABLE
  }
}
