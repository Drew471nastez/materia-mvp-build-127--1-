import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CRON_JOBS } from "@/lib/admin/schema-expectations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/health
 *
 * What an outside monitor asks every few minutes
 * (.github/workflows/uptime.yml, or any uptime service): can the site reach
 * its database, and has every scheduled job run recently and worked
 * (public.cron_runs, run-now part 68).
 *
 *   200 { status: "ok" }        everything answered
 *   503 { status: "degraded" }  the database answers, a job is late or its last run failed
 *   503 { status: "down" }      the database does not answer
 *
 * Public by design: it names jobs and ages, never data, keys or people.
 * Before part 68 there is no record of job runs, and jobs are "unknown",
 * which is not a failure.
 */
function lateAfterMinutes(schedule: string): number {
  if (schedule.startsWith("*/")) return Math.max(30, Number(schedule.slice(2).split(" ")[0]) * 6)
  const [minute, hour] = schedule.split(" ")
  if (hour === "*" && /^\d+$/.test(minute)) return 3 * 60
  return 30 * 60
}

export async function GET() {
  const headers = { "Cache-Control": "no-store" }
  const admin = createAdminClient()
  const started = Date.now()

  const ping = await admin.from("creators").select("id", { count: "exact", head: true }).limit(1)
  if (ping.error) {
    return NextResponse.json({ status: "down", database: false, reason: "The database did not answer." }, { status: 503, headers })
  }
  const databaseMs = Date.now() - started

  const { data: runs, error } = await admin
    .from("cron_runs")
    .select("job, started_at, finished_at, ok")
    .order("started_at", { ascending: false })
    .limit(500)
  const recorded = !error
  const jobs = CRON_JOBS.map((j) => {
    const last = (runs ?? []).find((r: { job: string }) => r.job === j.path) as { started_at: string; finished_at: string | null; ok: boolean | null } | undefined
    if (!recorded || !last) return { job: j.path, state: "unknown" as const, lastRun: null }
    const ageMin = (Date.now() - Date.parse(last.started_at)) / 60000
    const state = last.ok === false ? ("failed" as const) : ageMin > lateAfterMinutes(j.schedule) ? ("late" as const) : ("ok" as const)
    return { job: j.path, state, lastRun: last.started_at }
  })
  const bad = jobs.filter((j) => j.state === "failed" || j.state === "late")
  return NextResponse.json(
    { status: bad.length ? "degraded" : "ok", database: true, databaseMs, jobs },
    { status: bad.length ? 503 : 200, headers },
  )
}
