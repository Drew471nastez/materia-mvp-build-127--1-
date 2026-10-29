import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { runStorageCleanup } from "@/lib/storage/cleanup"
import { createAdminClient } from "@/lib/supabase/admin"
import { recordCronRun } from "@/lib/observability/report"
import { sweepCommunityOrphans } from "@/lib/communities/server/orphans"

/**
 * GET /api/cron/storage-cleanup
 *
 * Removes files nothing refers to any more (lib/storage/cleanup.ts): abandoned
 * theme packages, unfinished uploads, description pictures and product photos
 * that were taken out, stale download ZIPs, and community pictures and files
 * taken out of drafts two weeks ago (lib/communities/server/orphans.ts), and buyers' cart pictures no
 * paid order took after 14 days (lib/cart-uploads/store.ts). Then gives older product files
 * their first check and a SHA-256, a few a run, and trims the security log.
 *
 * Query, for a person running it by hand with the secret:
 *   ?dry=1        say what would go, remove nothing
 *   ?days=365     also look at product photos up to this many days old (the
 *                 daily run looks at a two day slice, 30 to 32 days back)
 *   ?limit=500    at most this many files this run (default 300)
 *
 * Protected by CRON_SECRET, like every other job here.
 * Schedule: daily at 03:40 UTC (vercel.json).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied

  const url = new URL(request.url)
  const days = Number(url.searchParams.get("days"))
  const limit = Number(url.searchParams.get("limit"))

  try {
    const summary = await runStorageCleanup(createAdminClient(), {
      dryRun: url.searchParams.get("dry") === "1",
      imageFromDays: Number.isFinite(days) && days > 0 ? days : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    })
    if (summary.errors.length > 0) console.error("[storage-cleanup]", summary.errors.join("; "))
    /* Copies of deleted rows older than 90 days (run-now part 66, docs/operations/backups.md). Missing before part 66: nothing to forget. */
    let deletedRowsForgotten = 0
    if (url.searchParams.get("dry") !== "1") {
      const { data, error } = await createAdminClient().rpc("storelib_purge_deleted_rows", {})
      if (error && error.code !== "PGRST202") console.error("[storage-cleanup] deleted rows not purged:", error.message)
      deletedRowsForgotten = typeof data === "number" ? data : 0
      /* Scheduled job runs after 30 days, errors unseen for 90 (run-now part 68). */
      const ops = await createAdminClient().rpc("storelib_purge_ops_logs", {})
      if (ops.error && ops.error.code !== "PGRST202") console.error("[storage-cleanup] job and error logs not purged:", ops.error.message)
    }
    /* Community pictures and files taken out of drafts and never posted (lib/communities/server/orphans.ts). */
    const communityOrphans = await sweepCommunityOrphans(createAdminClient(), { dryRun: url.searchParams.get("dry") === "1" })
    if (communityOrphans.errors.length > 0) console.error("[storage-cleanup] community uploads:", communityOrphans.errors.join("; "))
    /* Buyers' cart pictures no paid order took, after 14 days; a paid order's picture never copied is copied now (lib/cart-uploads/store.ts). */
    const { sweepCartUploads } = await import("@/lib/cart-uploads/store")
    const cartUploads = await sweepCartUploads(createAdminClient(), { dryRun: url.searchParams.get("dry") === "1" })
    if (cartUploads.errors.length > 0) console.error("[storage-cleanup] cart uploads:", cartUploads.errors.join("; "))
    return NextResponse.json({ ...summary, deletedRowsForgotten, communityOrphans, cartUploads }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[storage-cleanup]", error)
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
  }
}

/* Every run written down, and a failure reported (lib/observability/report, run-now part 68). */
export async function GET(request: Request) {
  return recordCronRun("/api/cron/storage-cleanup", request, () => runJob(request), { maxDurationS: maxDuration })
}
