import "server-only"

/**
 * ===========================================================================
 *  TAKING A BATCH FROM /app, CHEAPLY, AND CLEANING UP AFTER 30 DAYS
 * ===========================================================================
 * The browser sends at most one small request a minute while /app is on
 * screen (lib/activity/creator-activity-client.ts). Each one is ONE database
 * call: part 430's `creator_activity_ingest` inserts the batch's events in
 * one statement and writes the person's presence row only when it is older
 * than 55 seconds. A heartbeat (a batch with no events) from a person whose
 * row this server wrote less than 55 seconds ago is not sent to the database
 * at all.
 *
 * FAILS SOFT, ONCE PER PERIOD. Before part 430 has run, the function is
 * missing: the first batch learns that, and for the next INGEST_MISSING_MS (a minute)
 * (lib/supabase/missing-memory) every batch on this server is answered
 * without asking, so a database without the part sees one failed call every
 * ten minutes per server, not one per creator per minute.
 */
import { loggable } from "@/lib/admin/plain-reason"
import { parseUserAgent } from "@/lib/analytics/user-agent"
import { rememberRung, rememberedRung } from "@/lib/supabase/missing-memory"

import { PRESENCE_EVERY_MS, countryOf, deviceOf, parseBatch, type ParsedEvent } from "./creator-activity"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const INGEST_KEY = "creator_activity_ingest"
const PURGE_KEY = "creator_activity_purge"

/** A missing function or table (PostgREST and Postgres codes). */
export function isMissingActivity(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  return code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205" || /could not find the function/i.test(error.message ?? "")
}

/** After Supabase says part 430 is missing, batches are dropped for this long, then the database is asked again: short, so recording starts within a minute of the part running. */
export const INGEST_MISSING_MS = 60_000

/** Per server: who had their presence written, and when. */
const wroteAt = new Map<string, number>()
/** Per server: requests taken from each person in the current minute. */
const perMinute = new Map<string, { since: number; count: number }>()
/** More than this in a minute from one person is dropped: the tracker sends one, plus one when the tab hides. */
export const PER_MINUTE = 6

export function tooFast(userId: string, now: number): boolean {
  const e = perMinute.get(userId)
  if (!e || now - e.since >= 60_000) {
    if (perMinute.size > 5000) perMinute.clear()
    perMinute.set(userId, { since: now, count: 1 })
    return false
  }
  e.count += 1
  return e.count > PER_MINUTE
}

/** For the tests: forget this server's memory. */
export function forgetIngestMemory(): void {
  wroteAt.clear()
  perMinute.clear()
}

export type IngestOutcome = "written" | "skipped" | "missing" | "refused" | "failed"

export type IngestInput = {
  userId: string
  body: unknown
  headers: { get(name: string): string | null }
  now: number
}

/**
 * One batch in, at most one database call out. Never throws: the answer to
 * the browser is 204 whatever happened.
 */
export async function ingestBatch(db: Db, input: IngestInput): Promise<{ outcome: IngestOutcome; events: ParsedEvent[] }> {
  const events = parseBatch(input.body, input.now)
  if (!events) return { outcome: "refused", events: [] }
  if (tooFast(input.userId, input.now)) return { outcome: "refused", events: [] }
  /* Part 430 missing, remembered: nothing is asked until the period ends. */
  if (rememberedRung(INGEST_KEY, input.now) > 0) return { outcome: "missing", events }
  /* A heartbeat inside the presence window changes nothing in the database. */
  const last = wroteAt.get(input.userId)
  if (!events.length && last !== undefined && input.now - last < PRESENCE_EVERY_MS) return { outcome: "skipped", events }

  const ua = input.headers.get("user-agent")
  const device = deviceOf(ua, parseUserAgent)
  try {
    const { data, error } = await db.rpc(INGEST_KEY, {
      p_user: input.userId,
      p_events: events,
      p_country: countryOf(input.headers),
      p_device: device.device,
      p_os: device.os,
      p_browser: device.browser,
      p_shell: device.shell,
    })
    if (error) {
      if (isMissingActivity(error)) {
        rememberRung(INGEST_KEY, 1, input.now, INGEST_MISSING_MS)
        console.warn("[activity] part 430 is not in the database yet; batches are dropped for a minute")
        return { outcome: "missing", events }
      }
      console.error(`[activity] batch not recorded: ${loggable(error)}`)
      return { outcome: "failed", events }
    }
    if (data && (data as { presence?: boolean }).presence) {
      if (wroteAt.size > 5000) wroteAt.clear()
      wroteAt.set(input.userId, input.now)
    } else if (!wroteAt.has(input.userId)) {
      /* Written by another server inside the window: this one waits the window out too. */
      wroteAt.set(input.userId, input.now)
    }
    return { outcome: "written", events }
  } catch (e) {
    console.error(`[activity] batch not recorded: ${loggable(e)}`)
    return { outcome: "failed", events }
  }
}

/* ── Retention ─────────────────────────────────────────────────────────── */

/** Each call deletes at most this many; the cleanup stops after PURGE_ROUNDS calls or a short batch. */
export const PURGE_BATCH = 5_000
export const PURGE_ROUNDS = 20

/**
 * Events past 30 days, deleted oldest first in batches, by the daily
 * cleanup (app/api/cron/purge-chat-attachments). A backlog drains over
 * several nights rather than one long delete. Missing part 430: nothing to
 * delete, said once per period.
 */
export async function purgeOldActivity(db: Db, now = Date.now()): Promise<{ removed: number; missing: boolean; failed: boolean }> {
  if (rememberedRung(PURGE_KEY, now) > 0) return { removed: 0, missing: true, failed: false }
  let removed = 0
  for (let round = 0; round < PURGE_ROUNDS; round++) {
    try {
      const { data, error } = await db.rpc(PURGE_KEY, { p_limit: PURGE_BATCH })
      if (error) {
        if (isMissingActivity(error)) {
          rememberRung(PURGE_KEY, 1, now)
          return { removed, missing: true, failed: false }
        }
        console.error(`[activity] cleanup stopped: ${loggable(error)}`)
        return { removed, missing: false, failed: true }
      }
      const n = typeof data === "number" ? data : Number(data) || 0
      removed += n
      if (n < PURGE_BATCH) break
    } catch (e) {
      console.error(`[activity] cleanup stopped: ${loggable(e)}`)
      return { removed, missing: false, failed: true }
    }
  }
  return { removed, missing: false, failed: false }
}
