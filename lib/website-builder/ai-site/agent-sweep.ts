/**
 * ===========================================================================
 *  THE FIVE MINUTE NET UNDER START WITH AI (round L, L2)
 * ===========================================================================
 * Every job, classic or agent, hands itself to the next request at the end
 * of each turn (runner.ts kickJob). An open editor re-drives a job whose
 * runner is gone when it polls. This covers the rest: the tab is closed and
 * the hand over was lost. It reads live jobs (queued or running) whose lease
 * is empty or ran out, oldest first, on the partial index
 * idx_ai_site_jobs_live (SQL part 401), skips the ones touched in the last
 * minute and a half (a hand over may be on its way) and the ones nothing
 * has touched for six hours, and asks each for its
 * next turn. The runner itself decides what that turn does: carry on, end
 * a cancelled job, give up on one that stalled (agent-runner.ts).
 *
 * Old progress events go too, once an hour: ai_site_job_events older than
 * EVENT_RETENTION_DAYS, by their created_at index.
 */
import { EVENTS_TABLE, JOBS_TABLE } from "./agent-view"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Jobs re-driven per run at most. */
export const SWEEP_LIMIT = 20
/** A job touched more recently than this is left alone: its own hand over may still be arriving. */
export const SWEEP_QUIET_MS = 90_000
export const EVENT_RETENTION_DAYS = 30
/** A job nothing has touched for this long is not woken again (a classic job whose runner keeps failing before it saves). */
export const SWEEP_GIVE_UP_MS = 6 * 60 * 60_000

export interface SweepResult {
  stalled: number
  kicked: number
  pruned: boolean
}

export async function sweepAiJobs(admin: Db, opts: { now: number; kick: (jobId: string) => Promise<boolean>; prune?: boolean }): Promise<SweepResult> {
  const now = new Date(opts.now).toISOString()
  const quiet = new Date(opts.now - SWEEP_QUIET_MS).toISOString()
  const { data, error } = await admin
    .from(JOBS_TABLE)
    .select("id")
    .in("status", ["queued", "running"])
    .or(`lease_until.is.null,lease_until.lt.${now}`)
    .lt("updated_at", quiet)
    .gt("updated_at", new Date(opts.now - SWEEP_GIVE_UP_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(SWEEP_LIMIT)
  const ids = !error && Array.isArray(data) ? (data as { id: string }[]).map((r) => r.id) : []
  const kicks = await Promise.all(ids.map((id) => opts.kick(id).catch(() => false)))
  /* Once an hour (the first run past the hour), or when asked. */
  const prune = opts.prune ?? new Date(opts.now).getUTCMinutes() < 5
  if (prune) {
    const cutoff = new Date(opts.now - EVENT_RETENTION_DAYS * 86_400_000).toISOString()
    const { error: pruneError } = await admin.from(EVENTS_TABLE).delete().lt("created_at", cutoff)
    if (pruneError && pruneError.code !== "42P01" && pruneError.code !== "PGRST205") console.error("[ai-jobs] could not prune events", { code: pruneError.code })
  }
  return { stalled: ids.length, kicked: kicks.filter(Boolean).length, pruned: prune }
}
