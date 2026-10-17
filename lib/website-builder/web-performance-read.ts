import "server-only"

/**
 * ===========================================================================
 *  WEBSITE SETTINGS › PERFORMANCE, READ FOR ONE SITE
 * ===========================================================================
 * The caller (app/api/website-builder/themes/[installId]/performance) has
 * already proved the install is the signed in creator's. Everything here is
 * then read with the USER'S client, so the tables' own policies decide what
 * comes back (part 210): even a wrong install id reads nothing of anybody
 * else's. The one write, rolling up a finished day nobody rolled up yet, is
 * made with the service role for this install only.
 *
 * WHERE EACH NUMBER COMES FROM:
 *   24 hours       the raw page views of the last 48 hours (this window and
 *                  the one before), one chart point per hour;
 *   7, 30, 90 days finished UTC days from the daily rows, summed in the
 *                  database (site_rum_window), plus today so far from the raw
 *                  page views; one chart point per day.
 * A finished day inside the raw retention that the nightly job has not
 * rolled up yet is rolled up here first (at most a few per read); one that
 * could not be is reported as `partial`, never filled in.
 *
 * Remembered for a few minutes per server instance, and the page says when
 * the numbers were read ("Updated 14:05"), never that they are live.
 */

import {
  RAW_DAYS,
  RUM_METRICS,
  addUtcDays,
  aggFromDb,
  aggToDb,
  buildReport,
  mergeAggs,
  rangeFrom,
  rollupEvents,
  utcDay,
  windowFor,
  type AggRow,
  type DbAggRow,
  type PerfDevice,
  type PerfMetric,
  type PerfRange,
  type PerfReport,
  type LabEvidence,
  type RumEvent,
} from "./web-performance"
import { labEvidence, type LabResult, type LabStrategy } from "./pagespeed"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }

export interface StoredLab {
  strategy: LabStrategy
  url: string
  ranAt: string
  result: LabResult
}

export type PerformanceAnswer =
  /** Part 210 has not been run. */
  | { available: false }
  | { available: true; report: PerfReport; lab: Record<LabStrategy, StoredLab | null> }

const EVENT_COLUMNS = "at, path, page_type, device, browser, country, lcp_ms, inp_ms, cls, fcp_ms, ttfb_ms, nav_ms, weight"
const DAILY_COLUMNS = ["day", "device", "dim", "key", "views", "samples", ...RUM_METRICS.flatMap((m) => [`${m}_h`, `${m}_n`])].join(", ")
const PAGE = 1000
/** Raw rows one read takes at most. Sampling keeps a busy site's day near 11,000; two days of the busiest fit. */
const EVENT_CEILING = 30_000
/** Finished days one read rolls up itself, at most. */
const ROLLUPS_PER_READ = 6
const CACHE_MS = 3 * 60_000

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return /42P01|42883|PGRST202|PGRST205|does not exist|Could not find the (table|function)/i.test(`${error.code ?? ""} ${error.message ?? ""}`)
}

async function readEvents(db: Client, installId: string, fromIso: string, toIso: string): Promise<{ rows: RumEvent[]; truncated: boolean }> {
  const rows: RumEvent[] = []
  for (let from = 0; from < EVENT_CEILING; from += PAGE) {
    const { data, error } = await db
      .from("site_rum_events")
      .select(EVENT_COLUMNS)
      .eq("install_id", installId)
      .gte("at", fromIso)
      .lt("at", toIso)
      .order("at", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    rows.push(...((data ?? []) as RumEvent[]))
    if (!data || data.length < PAGE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

function aggsFromDb(rows: unknown[] | null | undefined): AggRow[] {
  const out: AggRow[] = []
  for (const r of rows ?? []) {
    const a = aggFromDb(r as DbAggRow)
    if (a) out.push(a)
  }
  return out
}

/**
 * ONE FINISHED DAY OF ONE SITE, ROLLED UP: its raw page views read whole,
 * summed (rollupEvents) and written over whatever the day had
 * (site_rum_replace_day). The same day run twice ends the same. The nightly
 * job (app/api/cron/rollup-daily) and a read of the page both use it.
 */
export async function rollupSiteDay(admin: Client, installId: string, day: string): Promise<number | null> {
  const from = `${day}T00:00:00.000Z`
  const to = `${addUtcDays(day, 1)}T00:00:00.000Z`
  const { rows, truncated } = await readEvents(admin, installId, from, to)
  if (truncated) console.warn(`[performance] ${installId} ${day}: more page views than one rollup reads; the day is a floor`)
  const { data, error } = await admin.rpc("site_rum_replace_day", { p_install: installId, p_day: day, p_rows: rollupEvents(rows).map(aggToDb) })
  if (error) {
    console.warn("[performance] day not rolled up:", error.message)
    return null
  }
  return Number(data) || 0
}

/** Finished days, newest first, that have page views and no rollup yet, for every site: what the nightly job works through. */
export async function pendingSiteDays(admin: Client, today: string, limit = 500): Promise<Array<{ installId: string; day: string }>> {
  const { data, error } = await admin
    .from("site_rum_counters")
    .select("install_id, day")
    .is("rolled_at", null)
    .lt("day", today)
    .gte("day", addUtcDays(today, -RAW_DAYS))
    .order("day", { ascending: false })
    .limit(limit)
  if (error) return []
  return ((data ?? []) as Array<{ install_id: string; day: string }>).map((r) => ({ installId: r.install_id, day: String(r.day).slice(0, 10) }))
}

const cache = new Map<string, { answer: PerformanceAnswer; until: number }>()

export function forgetPerformance(installId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${installId}|`)) cache.delete(k)
}

export async function readLabTests(user: Client, installId: string): Promise<Record<LabStrategy, StoredLab | null> | null> {
  const { data, error } = await user.from("site_lab_tests").select("strategy, url, ran_at, result").eq("install_id", installId)
  if (error) return null
  const out: Record<LabStrategy, StoredLab | null> = { mobile: null, desktop: null }
  for (const r of (data ?? []) as Array<{ strategy: LabStrategy; url: string; ran_at: string; result: LabResult }>) {
    if (r.strategy === "mobile" || r.strategy === "desktop") out[r.strategy] = { strategy: r.strategy, url: r.url, ranAt: r.ran_at, result: r.result }
  }
  return out
}

export async function readPerformance(input: {
  user: Client
  admin: Client
  installId: string
  range: PerfRange | string | null
  now?: number
  fresh?: boolean
}): Promise<PerformanceAnswer> {
  const now = input.now ?? Date.now()
  const range = rangeFrom(input.range)
  const key = `${input.installId}|${range}`
  const hit = cache.get(key)
  if (!input.fresh && hit && hit.until > now) return hit.answer
  const answer = await readFresh(input.user, input.admin, input.installId, range, now)
  if (cache.size > 2000) cache.clear()
  if (answer.available) cache.set(key, { answer, until: now + CACHE_MS })
  return answer
}

async function readFresh(user: Client, admin: Client, installId: string, range: PerfRange, now: number): Promise<PerformanceAnswer> {
  const w = windowFor(range, now)
  const today = utcDay(now)

  /* The counters say which days have page views at all, and which are not rolled up. A missing table is part 210 not run. */
  const earliest = range === "24h" ? addUtcDays(today, -2) : w.previousDays[0]
  const counters = await user.from("site_rum_counters").select("day, seen, rolled_at").eq("install_id", installId).gte("day", earliest)
  if (counters.error) {
    if (isMissingRelation(counters.error)) return { available: false }
    throw new Error(counters.error.message)
  }
  const dayRows = (counters.data ?? []) as Array<{ day: string; seen: number; rolled_at: string | null }>

  const lastRead = await user.from("site_rum_events").select("at").eq("install_id", installId).order("at", { ascending: false }).limit(1)
  const lastViewAt = ((lastRead.data ?? []) as Array<{ at: string }>)[0]?.at ?? null

  const lab = (await readLabTests(user, installId)) ?? { mobile: null, desktop: null }
  const evidence: Partial<Record<PerfDevice, Partial<Record<PerfMetric, LabEvidence>>>> = {
    mobile: labEvidence(lab.mobile?.result),
    desktop: labEvidence(lab.desktop?.result),
  }

  let current: AggRow[] = []
  let previous: AggRow[] = []
  const points: Array<{ t: string; rows: AggRow[] }> = []
  let partial = false

  if (range === "24h") {
    const read = await readEvents(user, installId, new Date(w.previousStart).toISOString(), new Date(w.end).toISOString())
    partial = read.truncated
    const inside = (e: RumEvent, a: number, b: number) => {
      const t = Date.parse(e.at)
      return t >= a && t < b
    }
    const now24 = read.rows.filter((e) => inside(e, w.start, w.end))
    current = rollupEvents(now24)
    previous = rollupEvents(read.rows.filter((e) => inside(e, w.previousStart, w.previousEnd)), ["all"])
    for (let t = w.start; t < w.end; t += 3_600_000) {
      points.push({ t: new Date(t).toISOString(), rows: rollupEvents(now24.filter((e) => inside(e, t, t + 3_600_000)), ["all"]) })
    }
  } else {
    /* Finished days with page views and no rollup yet, inside the raw retention: rolled up now, newest first. */
    const rawFloor = addUtcDays(today, -RAW_DAYS)
    const pending = dayRows
      .map((r) => ({ day: String(r.day).slice(0, 10), rolled: !!r.rolled_at, seen: Number(r.seen) || 0 }))
      .filter((r) => r.day < today && !r.rolled && r.seen > 0)
      .sort((a, b) => (a.day < b.day ? 1 : -1))
    let done = 0
    for (const p of pending) {
      if (p.day < rawFloor || done >= ROLLUPS_PER_READ) {
        partial = true
        continue
      }
      const n = await rollupSiteDay(admin, installId, p.day)
      if (n === null) partial = true
      done++
    }

    const yesterday = addUtcDays(today, -1)
    const [win, prev, daily, todayRead] = await Promise.all([
      w.days[0] <= yesterday ? user.rpc("site_rum_window", { p_install: installId, p_from: w.days[0], p_to: yesterday }) : Promise.resolve({ data: [], error: null }),
      user.rpc("site_rum_window", { p_install: installId, p_from: w.previousDays[0], p_to: w.previousDays[w.previousDays.length - 1] }),
      user
        .from("site_rum_daily")
        .select(DAILY_COLUMNS)
        .eq("install_id", installId)
        .eq("dim", "all")
        .gte("day", w.days[0])
        .lte("day", yesterday)
        .order("day", { ascending: true })
        .limit(400),
      readEvents(user, installId, `${today}T00:00:00.000Z`, new Date(w.end).toISOString()),
    ])
    for (const r of [win, prev, daily]) {
      if (r.error) {
        if (isMissingRelation(r.error)) return { available: false }
        throw new Error(r.error.message)
      }
    }
    partial ||= todayRead.truncated
    const todayRows = rollupEvents(todayRead.rows)
    current = mergeAggs(aggsFromDb(win.data), todayRows)
    previous = aggsFromDb(prev.data).filter((r) => r.dim === "all")
    const byDay = new Map<string, AggRow[]>()
    for (const r of (daily.data ?? []) as DbAggRow[]) {
      const a = aggFromDb(r)
      if (!a) continue
      const d = String(r.day).slice(0, 10)
      byDay.set(d, [...(byDay.get(d) ?? []), a])
    }
    for (const d of w.days) {
      points.push({ t: `${d}T00:00:00.000Z`, rows: d === today ? todayRows.filter((r) => r.dim === "all") : byDay.get(d) ?? [] })
    }
  }

  const report = buildReport({ range, now, current, previous, points, lastViewAt, evidence, partial })
  return { available: true, report, lab }
}


/**
 * THE NIGHTLY PART (app/api/cron/rollup-daily): every finished day of every
 * site that has page views and no rollup, newest first, as long as the
 * budget lasts, then the retention sweep (site_rum_cleanup: raw page views
 * past RAW_DAYS once their day is rolled up, daily rows past ROLLUP_DAYS).
 * A day left over is rolled up the next night, or when its page is read.
 */
export async function rollupPendingSiteDays(admin: Client, now: number, budgetMs: number): Promise<{ days: number; rows: number; left: number; cleaned: number | null; error?: string }> {
  const started = Date.now()
  const pending = await pendingSiteDays(admin, utcDay(now))
  let days = 0
  let rows = 0
  for (const p of pending) {
    if (Date.now() - started > budgetMs) break
    const n = await rollupSiteDay(admin, p.installId, p.day)
    if (n !== null) {
      days++
      rows += n
    }
  }
  const sweep = await admin.rpc("site_rum_cleanup", {})
  return { days, rows, left: pending.length - days, cleaned: sweep.error ? null : Number(sweep.data) || 0, ...(sweep.error ? { error: sweep.error.message } : {}) }
}
