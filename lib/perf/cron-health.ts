/**
 * Each scheduled job, from its own run records (public.cron_runs, run-now
 * part 68): when it last ran, whether that run worked, and how many of the
 * last day's runs failed. /api/health asks the same question for an outside
 * monitor; /admin/performance shows the answer job by job.
 *
 * Pure, so the tests drive it without a database. The read is in
 * lib/perf/read.ts (cronRunsRead): two days of rows, three columns, capped.
 */

export interface CronJobSpec {
  path: string
  schedule: string
}

export interface CronRunRow {
  job: string
  started_at: string
  ok: boolean | null
}

export type CronJobState = "ok" | "failed" | "late" | "never"

export interface CronJobHealth {
  job: string
  schedule: string
  state: CronJobState
  lastRun: string | null
  lastOk: boolean | null
  runs24h: number
  failed24h: number
}

/**
 * How long after its last run a job counts as late: six of its intervals for
 * an every-N-minutes job (at least half an hour), three hours for an hourly
 * one, thirty hours for anything daily or weekly.
 */
export function lateAfterMinutes(schedule: string): number {
  if (schedule.startsWith("*/")) return Math.max(30, Number(schedule.slice(2).split(" ")[0]) * 6)
  const [minute, hour] = schedule.split(" ")
  if (hour === "*" && /^[\d,]+$/.test(minute)) return 3 * 60
  return 30 * 60
}

/** The rows, newest first or in any order; every job in `jobs` gets one answer. */
export function cronHealth(jobs: readonly CronJobSpec[], rows: CronRunRow[], now = Date.now()): CronJobHealth[] {
  const dayAgo = now - 86_400_000
  return jobs.map((j) => {
    const mine = rows.filter((r) => r.job === j.path)
    const last = mine.reduce<CronRunRow | null>((best, r) => (!best || Date.parse(r.started_at) > Date.parse(best.started_at) ? r : best), null)
    const recent = mine.filter((r) => Date.parse(r.started_at) >= dayAgo)
    const failed24h = recent.filter((r) => r.ok === false).length
    let state: CronJobState
    if (!last) state = "never"
    else if (last.ok === false) state = "failed"
    else if ((now - Date.parse(last.started_at)) / 60_000 > lateAfterMinutes(j.schedule)) state = "late"
    else state = "ok"
    return { job: j.path, schedule: j.schedule, state, lastRun: last?.started_at ?? null, lastOk: last?.ok ?? null, runs24h: recent.length, failed24h }
  })
}
