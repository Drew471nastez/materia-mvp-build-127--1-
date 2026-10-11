import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { runJobs } from "@/lib/physical/jobs-server"
import { cancelStaleSitePayments } from "@/lib/checkout/site-payment-sweep"

/**
 * GET /api/cron/physical
 *
 * Every ten minutes (vercel.json): stock held by checkouts nobody paid is
 * given back (physical_expire_holds), and queued physical commerce jobs
 * (buyer emails, supplier emails, webhooks) are sent or retried with
 * backoff (lib/physical/jobs-server.ts). Both are keyed, so two runs at
 * once change nothing twice. Before either, a website checkout's payments
 * left open past their holds are cancelled (lib/checkout/site-payment-sweep),
 * also while physical commerce is switched off in /admin, when the rest
 * does nothing. Before supabase/sql/run-now/78_physical_commerce.sql it
 * answers { available: false }. Protected by CRON_SECRET.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  /* Website checkouts' payments left open past their holds are closed first, physical commerce on or off (lib/checkout/site-payment-sweep). */
  const db = createAdminClient()
  const swept = await cancelStaleSitePayments(db).catch(() => ({ shipped: 0, baskets: 0 }))
  if (!(await isPhysicalCommerceEnabled())) return NextResponse.json({ enabled: false, swept }, { headers: { "Cache-Control": "no-store" } })
  const started = Date.now()
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
  return NextResponse.json({ expired: Number(expired ?? 0), swept, jobs, ms }, { headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/physical", request, () => runJob(request))
}
