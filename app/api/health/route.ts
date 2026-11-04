import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CRON_JOBS } from "@/lib/admin/schema-expectations"
import { lateAfterMinutes } from "@/lib/perf/cron-health"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* A monitor's request never holds a function: the reads below end well before this. */
export const maxDuration = 10

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
 * which is not a failure. When a job is late: lib/perf/cron-health.ts.
 */
/*
  WITHIN A FEW SECONDS, WHATEVER SUPABASE DOES. A health check that waits as
  long as the database does is down exactly when it should say so: each read
  here has its own short deadline (and every Supabase request one of its own,
  lib/net/deadline.ts), so a database that does not answer is "down" in
  HEALTH_DB_MS, not a function held for 300s.

  And which build answered (`build`): the deploy id the tabs compare against
  (app/api/version), or the commit, so a monitor can tell a rollout from an
  outage. Never anything private: an id, a time, job names.
*/
const HEALTH_DB_MS = 2_500
/*
  THE WHOLE CHECK, NOT EACH READ. Two reads of 2.5s each were up to 5s; the
  job read now gets only what is left of HEALTH_TOTAL_MS, so the answer comes
  in about 4s at worst, whatever the database does (the uptime job waits 20s).
*/
const HEALTH_TOTAL_MS = 4_000

/*
  Per dependency, for a monitor that wants more than one word: each is "ok",
  "down" (database) or "degraded" (jobs), or "unknown" when it could not be
  asked. Names and states only, never an error text from the database.
*/
type Checks = { database: "ok" | "down"; jobs: "ok" | "degraded" | "unknown" }

function buildId(): string | null {
  const built = process.env.NEXT_DEPLOYMENT_ID as unknown
  return (typeof built === "string" && built) || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null
}

export async function GET() {
  const headers = { "Cache-Control": "no-store" }
  const build = buildId()
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    const checks: Checks = { database: "down", jobs: "unknown" }
    return NextResponse.json({ status: "down", database: false, build, checks, reason: "The database is not configured." }, { status: 503, headers })
  }
  const started = Date.now()

  /* A trivial read: one id, no count (count "exact" counted every creator on each check). */
  let ping: { error: unknown }
  try {
    ping = await admin.from("creators").select("id").limit(1).abortSignal(AbortSignal.timeout(HEALTH_DB_MS))
  } catch (e) {
    ping = { error: e }
  }
  if (ping.error) {
    const timedOut = Date.now() - started >= HEALTH_DB_MS - 50
    return NextResponse.json(
      { status: "down", database: false, build, checks: { database: "down", jobs: "unknown" } satisfies Checks, reason: timedOut ? "The database did not answer in time." : "The database did not answer." },
      { status: 503, headers },
    )
  }
  const databaseMs = Date.now() - started

  const left = Math.max(250, Math.min(HEALTH_DB_MS, HEALTH_TOTAL_MS - (Date.now() - started)))
  let runs: { job: string; started_at: string; finished_at: string | null; ok: boolean | null }[] | null = null
  let error: unknown = null
  try {
    ;({ data: runs, error } = await admin
      .from("cron_runs")
      .select("job, started_at, finished_at, ok")
      .order("started_at", { ascending: false })
      .limit(500)
      .abortSignal(AbortSignal.timeout(left)))
  } catch (e) {
    error = e
  }
  const recorded = !error
  const jobs = CRON_JOBS.map((j) => {
    const last = (runs ?? []).find((r: { job: string }) => r.job === j.path) as { started_at: string; finished_at: string | null; ok: boolean | null } | undefined
    if (!recorded || !last) return { job: j.path, state: "unknown" as const, lastRun: null }
    const ageMin = (Date.now() - Date.parse(last.started_at)) / 60000
    const state = last.ok === false ? ("failed" as const) : ageMin > lateAfterMinutes(j.schedule) ? ("late" as const) : ("ok" as const)
    return { job: j.path, state, lastRun: last.started_at }
  })
  const bad = jobs.filter((j) => j.state === "failed" || j.state === "late")
  const checks: Checks = { database: "ok", jobs: !recorded ? "unknown" : bad.length ? "degraded" : "ok" }
  return NextResponse.json(
    { status: bad.length ? "degraded" : "ok", database: true, databaseMs, build, checks, jobs },
    { status: bad.length ? 503 : 200, headers },
  )
}
