import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { runJobs } from "@/lib/physical/jobs-server"
import { cancelStaleSitePayments } from "@/lib/checkout/site-payment-sweep"
import { closeUnconfirmedDeliveries } from "@/lib/physical/unconfirmed-delivery-server"
import { noteOrdersWaiting } from "@/lib/physical/orders-waiting-server"
import { runTrackingSweep } from "@/lib/physical/tracking/sync-server"
import { scheduleMarketingSyncs } from "@/lib/integrations/marketing/sync-server"

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
 * answers { available: false }. Then open parcels whose next look is due
 * are read from the tracking aggregator and their shipments moved on
 * (lib/physical/tracking/sync-server.ts); nothing is asked when tracking is
 * not set up. Protected by CRON_SECRET.
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
  /* Klaviyo and Omnisend: a sync per connected store each quarter hour, run by the loop below with the rest (lib/integrations/marketing/sync-server.ts). */
  const marketing = await scheduleMarketingSyncs(db).catch(() => 0)
  let jobs = { done: 0, failed: 0 }
  for (let round = 0; round < 5 && Date.now() - started < 40_000; round++) {
    const ran = await runJobs(db, 25)
    jobs = { done: jobs.done + ran.done, failed: jobs.failed + ran.failed }
    if (ran.done + ran.failed < 25) break
  }
  /* Courier tracking: the parcels due a look, inside what is left of the run. The emails it queues go out on the next run, or now when time allows. */
  const tracking = await runTrackingSweep(db, { limit: 40, budgetMs: Math.max(0, 48_000 - (Date.now() - started)) }).catch((e) => {
    console.error("[cron/physical] tracking:", e instanceof Error ? e.message : e)
    return null
  })
  if (tracking?.moved && Date.now() - started < 50_000) {
    const ran = await runJobs(db, 25)
    jobs = { done: jobs.done + ran.done, failed: jobs.failed + ran.failed }
  }
  /* Tracked parcels never marked delivered 60 days after shipping, and not followed to an end by courier tracking: closed as delivery not confirmed, the seller told once (lib/physical/unconfirmed-delivery-server.ts). */
  const unconfirmed = Date.now() - started < 52_000 ? await closeUnconfirmedDeliveries(db).catch(() => ({ closed: 0 })) : { closed: 0 }
  /* Orders paid and still not shipped past their days: one reminder per store a day, in the one hour it is sent (lib/physical/orders-waiting-server.ts). */
  const waiting = Date.now() - started < 55_000 ? await noteOrdersWaiting(db) : { stores: 0, raised: 0 }
  const ms = Date.now() - started
  console.log(`[cron/physical] ${Number(expired ?? 0)} holds expired, jobs ${jobs.done} done ${jobs.failed} failed, tracking ${tracking ? `${tracking.checked} read ${tracking.moved} moved` : "failed"}, ${unconfirmed.closed} deliveries not confirmed, ${ms}ms`)
  return NextResponse.json({ expired: Number(expired ?? 0), swept, jobs, marketing, tracking, unconfirmed: unconfirmed.closed, waiting, ms }, { headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/physical", request, () => runJob(request))
}
