import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { runJobs } from "@/lib/physical/jobs-server"

/**
 * GET /api/cron/physical
 *
 * Every ten minutes (vercel.json): stock held by checkouts nobody paid is
 * given back (physical_expire_holds), and queued physical commerce jobs
 * (buyer emails, supplier emails, webhooks) are sent or retried with
 * backoff (lib/physical/jobs-server.ts). Both are keyed, so two runs at
 * once change nothing twice. With physical commerce switched off in /admin
 * it does nothing. Before supabase/sql/run-now/78_physical_commerce.sql it
 * answers { available: false }. Protected by CRON_SECRET.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  if (!(await isPhysicalCommerceEnabled())) return NextResponse.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } })
  const started = Date.now()
  const db = createAdminClient()
  const { data: expired, error } = await db.rpc("physical_expire_holds", { p_limit: 200 })
  if (error && (error.code === "PGRST202" || error.code === "42883")) return NextResponse.json({ available: false }, { headers: { "Cache-Control": "no-store" } })
  let jobs = { done: 0, failed: 0 }
  for (let round = 0; round < 5 && Date.now() - started < 40_000; round++) {
    const ran = await runJobs(db, 25)
    jobs = { done: jobs.done + ran.done, failed: jobs.failed + ran.failed }
    if (ran.done + ran.failed < 25) break
  }
  const ms = Date.now() - started
  console.log(`[cron/physical] ${Number(expired ?? 0)} holds expired, jobs ${jobs.done} done ${jobs.failed} failed, ${ms}ms`)
  return NextResponse.json({ expired: Number(expired ?? 0), jobs, ms }, { headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/physical", request, () => runJob(request))
}
