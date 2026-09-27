import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { pruneScanLog } from "@/lib/security/scan-log"
import { sweepPendingScans } from "@/lib/storage/scan-gate"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/cron/scan-files
 *
 * Gives every paid file still waiting for its malware scan another try, and
 * scans a few files from before the scanner was on (lib/storage/scan-gate.ts,
 * sweepPendingScans). With CLAMAV_SERVICE_URL or CLAMAV_SERVICE_SECRET unset
 * it does nothing and says so. Also drops clean rows older than ninety days
 * from the scan log.
 *
 * Protected by CRON_SECRET, like every other job here.
 * Schedule: every ten minutes (vercel.json).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied

  try {
    const admin = createAdminClient()
    const summary = await sweepPendingScans(admin, { budgetMs: 250_000 })
    if (summary.configured) await pruneScanLog(admin)
    if (summary.errors.length > 0) console.error("[scan-files]", summary.errors.slice(0, 20).join("; "))
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[scan-files]", error)
    return NextResponse.json({ error: "Scan sweep failed" }, { status: 500 })
  }
}
