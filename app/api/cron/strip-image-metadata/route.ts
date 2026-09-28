import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { sweepDirectUploads, sweepImageMetadata } from "@/lib/storage/metadata-sweep"
import { createAdminClient } from "@/lib/supabase/admin"
import { recordCronRun } from "@/lib/observability/report"

/**
 * GET /api/cron/strip-image-metadata
 *
 * Rewrites recent public pictures that still carry EXIF, GPS or XMP without
 * it, at the same URL, and checks everything else that landed in those
 * buckets from a small read of its start and its end
 * (lib/storage/metadata-sweep.ts). The net under every upload that goes
 * straight from a browser to storage.
 *
 * ?minutes=10080 looks further back, for a first run by hand.
 *
 * Protected by CRON_SECRET, like every other job here.
 * Schedule: hourly at :10 (vercel.json).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied

  const minutes = Number(new URL(request.url).searchParams.get("minutes"))
  try {
    const since = Number.isFinite(minutes) && minutes > 0 ? minutes : undefined
    const admin = createAdminClient()
    const summary = await sweepImageMetadata(admin, { sinceMinutes: since })
    /* And everything else that landed in those buckets: a lead magnet, a
       video, anything the pass above does not read. Two small Range reads
       each, never a download (lib/storage/metadata-sweep.ts). */
    const direct = await sweepDirectUploads(admin, { sinceMinutes: since, budgetMs: 120_000 })
    const errors = [...summary.errors, ...direct.errors]
    if (errors.length > 0) console.error("[strip-image-metadata]", errors.slice(0, 20).join("; "))
    return NextResponse.json({ ...summary, direct }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[strip-image-metadata]", error)
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 })
  }
}

/* Every run written down, and a failure reported (lib/observability/report, run-now part 68). */
export async function GET(request: Request) {
  return recordCronRun("/api/cron/strip-image-metadata", request, () => runJob(request))
}
