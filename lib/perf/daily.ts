import "server-only"

import { Reader } from "@/lib/admin/platform-metrics"

import { supabaseInfo, vercelInfo } from "./infra"
import { extrasFrom, jobsState, paymentsSince, slowQueries, toAggregates } from "./read"
import { healthIndex } from "./scoring"

/**
 * ===========================================================================
 *  THE DAY'S OFFICIAL HEALTH INDEX, WRITTEN ONCE A NIGHT
 * ===========================================================================
 * Run by the existing nightly cron (app/api/cron/rollup-daily) for the day
 * it rolls up, after the analytics rollups:
 *
 *   1. perf_rollup_day(day) (run-now part 126) adds the day's raw samples up
 *      into perf_daily, with published websites' Web Vitals, and deletes raw
 *      samples older than eight days;
 *   2. the day's rollup is scored by the same rules as the live page
 *      (lib/perf/scoring.ts), with that day's orders, and with the
 *      statement statistics, scheduled jobs and platform health as they
 *      stand when the job runs (none of those keep a history to read back);
 *   3. perf_scores gets one row for the day: the score (null when there was
 *      not enough data, which is kept as such rather than skipped), each
 *      sub score, and every input, so a score can always be explained.
 *
 * Running a day again replaces its row. Before part 126 runs it does
 * nothing and says so.
 */

export interface DailyPerfResult {
  day: string
  rolledUp: number | null
  score: number | null
  error?: string
}

export async function rollupAndScorePerfDay(day: string): Promise<DailyPerfResult> {
  const r = new Reader()
  const rolled = await r.db.rpc("perf_rollup_day", { p_day: day })
  if (rolled.error) return { day, rolledUp: null, score: null, error: /perf_rollup_day|PGRST202|42883/i.test(`${rolled.error.code} ${rolled.error.message}`) ? "part 126 has not run" : rolled.error.message }

  const { data, error } = await r.db.from("perf_daily").select("area, device, route, metric, samples, p50, p75, p95, bad").eq("day", day).eq("route", "*").limit(2000)
  if (error) return { day, rolledUp: Number(rolled.data) || 0, score: null, error: error.message }

  const start = `${day}T00:00:00Z`
  const end = new Date(Date.parse(start) + 86_400_000).toISOString()
  const [payments, slow, jobs, supabase, vercel] = await Promise.all([paymentsSince(r, start, end), slowQueries(r), jobsState(r), supabaseInfo(), vercelInfo()])
  const extras = extrasFrom({ payments, slow, jobs, supabase, vercel })
  const health = healthIndex(toAggregates((data ?? []) as never), extras)

  const { error: saveError } = await r.db.from("perf_scores").upsert(
    {
      day,
      score: health.score,
      subs: health.subs.map((s) => ({ id: s.id, score: s.score, used: s.used })),
      inputs: { measures: health.subs.flatMap((s) => s.measures.map((m) => ({ key: m.key, value: m.value, base: m.base, score: m.score }))), extras },
      computed_at: new Date().toISOString(),
    },
    { onConflict: "day" },
  )
  return { day, rolledUp: Number(rolled.data) || 0, score: health.score, ...(saveError ? { error: saveError.message } : {}) }
}
