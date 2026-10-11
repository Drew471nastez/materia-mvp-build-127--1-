import "server-only"

import { cronChecks } from "@/lib/admin/views/system"
import { Reader } from "@/lib/admin/platform-metrics"

import { CLIENT_SAMPLE_RATE, SERVER_SAMPLE_RATE } from "./config"
import { supabaseInfo, vercelInfo } from "./infra"
import { OPTIMIZATIONS } from "./optimizations"
import { rankProblems, type ErrorGroupRow } from "./problems"
import { WINDOWS, type PerfReport, type ScoreDay, type SlowQueries, type WindowId } from "./report"
import { SLOW_STATEMENT_CALLS, SLOW_STATEMENT_MS, healthIndex, type Aggregate, type Extras } from "./scoring"

/**
 * ===========================================================================
 *  EVERYTHING /admin/performance SHOWS, READ IN ONE GO
 * ===========================================================================
 * All reads run together and each fails on its own: a figure that could not
 * be read is null, and the rest of the page still stands. Nothing here ever
 * makes a number up. Before run-now part 126 has run, `ready` is false and
 * every telemetry figure is empty, which the page shows as insufficient
 * data; orders, scheduled jobs and the token-gated platforms are still read.
 */

type WindowRow = { area: string; device: string; route: string; metric: string; samples: number | string; p50: number | null; p75: number | null; p95: number | null; bad: number | string }

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export function toAggregates(rows: WindowRow[]): Aggregate[] {
  return rows.map((r) => ({
    area: String(r.area),
    device: String(r.device),
    route: String(r.route),
    metric: String(r.metric),
    samples: Number(r.samples) || 0,
    p50: num(r.p50),
    p75: num(r.p75),
    p95: num(r.p95),
    bad: Number(r.bad) || 0,
  }))
}

function missingFunction(error: { code?: string | null; message?: string | null } | null): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || /could not find the function|does not exist/i.test(error.message ?? ""))
}

/** Orders made since `since`: failed payments against completed ones. */
export async function paymentsSince(r: Reader, since: string, until?: string): Promise<{ failed: number; completed: number } | null> {
  const shape = (status: string) => (q: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let x = q.eq("status", status).gte("created_at", since)
    if (until) x = x.lt("created_at", until)
    return x
  }
  const [failed, completed] = await Promise.all([r.count("failed payments", "orders", shape("failed")), r.count("completed payments", "orders", shape("completed"))])
  return failed === null || completed === null ? null : { failed, completed }
}

export async function slowQueries(r: Reader): Promise<SlowQueries | null> {
  try {
    const { data, error } = await r.db.rpc("perf_slow_queries", { p_limit: 15, p_slow_ms: SLOW_STATEMENT_MS, p_min_calls: SLOW_STATEMENT_CALLS })
    if (error) return missingFunction(error) ? { available: false, reason: "Waiting for database part 126" } : null
    const body = data as { available?: boolean; reason?: string; rows?: unknown; slow?: unknown } | null
    if (!body?.available) return { available: false, reason: body?.reason ?? "pg_stat_statements is not enabled" }
    const rows = (Array.isArray(body.rows) ? body.rows : []).map((q: Record<string, unknown>) => ({
      query: String(q.query ?? ""),
      calls: Number(q.calls) || 0,
      mean_ms: Number(q.mean_ms) || 0,
      total_ms: Number(q.total_ms) || 0,
      rows: Number(q.rows) || 0,
    }))
    return { available: true, rows, slow: Number(body.slow) || 0 }
  } catch {
    return null
  }
}

export async function jobsState(r: Reader): Promise<{ late: number; known: number } | null> {
  try {
    const jobs = await cronChecks(r)
    const known = jobs.filter((j) => j.state === "ok" || j.state === "late")
    return { late: known.filter((j) => j.state === "late").length, known: known.length }
  } catch {
    return null
  }
}

export function extrasFrom(parts: {
  payments: { failed: number; completed: number } | null
  slow: SlowQueries | null
  jobs: { late: number; known: number } | null
  supabase: Awaited<ReturnType<typeof supabaseInfo>>
  vercel: Awaited<ReturnType<typeof vercelInfo>>
}): Extras {
  return {
    payments: parts.payments,
    slowStatements: parts.slow?.available ? parts.slow.slow : null,
    jobs: parts.jobs,
    supabaseDown: parts.supabase.configured && parts.supabase.ok ? parts.supabase.down : null,
    deployments: parts.vercel.configured && parts.vercel.ok ? { failed: parts.vercel.failed, total: parts.vercel.total } : null,
  }
}

export async function readScoreHistory(r: Reader, days = 30): Promise<ScoreDay[] | null> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const rows = await r.rows<{ day: string; score: number | null; subs: unknown; provisional: unknown }>("score history", "perf_scores", "day, score, subs, provisional:inputs->provisional", (q) => q.gte("day", since).order("day", { ascending: true }).limit(days + 1))
  if (!rows) return null
  return rows.map((row) => {
    const p = row.provisional as { score?: unknown; confidence?: unknown } | null
    const confidence = p && (p.confidence === "high" || p.confidence === "medium" || p.confidence === "low") ? p.confidence : null
    return {
      day: String(row.day).slice(0, 10),
      score: row.score === null ? null : Number(row.score),
      subs: (Array.isArray(row.subs) ? row.subs : []).map((s: { id?: unknown; score?: unknown }) => ({ id: String(s.id ?? ""), score: s.score === null || s.score === undefined ? null : Number(s.score) })),
      provisional: p && confidence && Number.isFinite(Number(p.score)) ? { score: Number(p.score), confidence } : null,
    }
  })
}

export async function readPerfReport(window: WindowId, now = Date.now()): Promise<PerfReport> {
  const r = new Reader()
  const hours = WINDOWS.find((w) => w.id === window)?.hours ?? 24 * 7
  const since = new Date(now - hours * 3_600_000).toISOString()

  const windowRead = (async () => {
    try {
      const { data, error } = await r.db.rpc("perf_window", { p_since: since })
      if (error) return { aggs: [] as Aggregate[], ready: false, reason: missingFunction(error) ? "Waiting for database part 126 (supabase/sql/run-now/126_perf_health.sql)." : "The measurements could not be read." }
      return { aggs: toAggregates((data ?? []) as WindowRow[]), ready: true, reason: null }
    } catch {
      return { aggs: [] as Aggregate[], ready: false, reason: "The database could not be reached." }
    }
  })()
  const errorsRead = (async (): Promise<ErrorGroupRow[] | null> => {
    try {
      const { data, error } = await r.db.rpc("perf_errors", { p_since: since, p_limit: 30 })
      if (error) return null
      return ((data ?? []) as Array<{ detail: string; area: string; route: string; n: number | string; last_at: string | null }>).map((e) => ({ detail: e.detail, area: e.area, route: e.route, n: Number(e.n) || 0, lastAt: e.last_at }))
    } catch {
      return null
    }
  })()

  const [win, errors, slow, payments, jobs, supabase, vercel, history] = await Promise.all([
    windowRead,
    errorsRead,
    slowQueries(r),
    paymentsSince(r, since),
    jobsState(r),
    supabaseInfo(),
    vercelInfo(now),
    readScoreHistory(r),
  ])

  const extras = extrasFrom({ payments, slow, jobs, supabase, vercel })
  return {
    generatedAt: new Date(now).toISOString(),
    window,
    ready: win.ready,
    readyReason: win.reason,
    sampling: { client: CLIENT_SAMPLE_RATE, server: SERVER_SAMPLE_RATE },
    health: healthIndex(win.aggs, extras),
    aggs: win.aggs,
    history,
    errors,
    slow,
    payments,
    jobs,
    supabase,
    vercel,
    problems: rankProblems(win.aggs, errors),
    optimizations: OPTIMIZATIONS,
  }
}
