import { NextResponse, type NextRequest } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import {
  eicarTestBytes,
  readScannerSetup,
  scanBytes,
  scannerHealth,
  scannerMaxBytes,
  scanSource,
  scanStoredObject,
  type FileScanResult,
} from "@/lib/security/file-scanner"
import { recentScans, recordScan } from "@/lib/security/scan-log"
import { sweepPendingScans } from "@/lib/storage/scan-gate"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  /api/admin/scanner: THE MALWARE SCANNER, FOR THE OWNER TO TEST
 * ===========================================================================
 * Read by /admin/scanner. Admin session only, checked first in every handler.
 *
 *   GET                  whether the scanner is set up, its /health (ClamAV
 *                        version, signature date), what is waiting, and the
 *                        latest scans from the log.
 *   POST ?mode=eicar     scans the EICAR test string (harmless; every
 *                        antivirus reports it). Expect "infected".
 *   POST ?mode=upload    scans the request body as a file. Nothing is
 *                        stored: the body streams to the scanner and is gone.
 *                        Vercel caps a request at about 4.5 MB.
 *   POST ?mode=object    { bucket, path }: scans a file already in storage,
 *                        streamed from a short signed URL. Changes nothing.
 *   POST ?mode=sweep     gives a few paid files that are waiting another try
 *                        now, as the ten minute cron would.
 *
 * A scan from here is written to the scan log as "admin_test", never over a
 * product file's own status.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const NO_STORE = { "Cache-Control": "no-store" }
/** Just under Vercel's request body limit. */
const UPLOAD_TEST_MAX_BYTES = 4 * 1024 * 1024
const BUCKET = /^[a-z0-9][a-z0-9._-]{0,62}$/

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const admin = createAdminClient()
    const setup = readScannerSetup()
    const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
      const { count: n, error } = await build(base())
      return error ? null : (n ?? 0)
    }
    function base() {
      return admin.from("digital_assets").select("id", { count: "exact", head: true })
    }
    const [health, recent, waiting, blocked, headerOnly] = await Promise.all([
      scannerHealth(),
      recentScans(admin, 30),
      count((q) => q.in("scan_status", ["pending_scan", "scanning"]).eq("upload_status", "completed")),
      count((q) => q.in("scan_status", ["infected", "quarantined"])),
      count((q) => q.eq("scan_status", "clean").eq("scan_result->>engine", "heuristic")),
    ])
    return NextResponse.json(
      {
        setup: {
          configured: setup.configured,
          missing: setup.missing,
          invalidUrl: (setup as { invalidUrl?: boolean }).invalidUrl === true,
          secretSet: Boolean((process.env.CLAMAV_SERVICE_SECRET ?? "").trim()),
          maxBytes: scannerMaxBytes(),
          uploadTestMaxBytes: UPLOAD_TEST_MAX_BYTES,
        },
        health,
        files: { waiting, blocked, headerOnly },
        recent: recent.rows,
        recentUnavailable: recent.unavailable ?? null,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    return adminFailure("scanner", error, "The scanner page could not be read.")
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const mode = request.nextUrl.searchParams.get("mode")
  try {
    const admin = createAdminClient()
    let result: FileScanResult
    let bucket: string | null = null
    let path: string | null = null

    if (mode === "eicar") {
      result = await scanBytes(eicarTestBytes(), { ref: "admin:eicar", deadlineMs: 20_000, retries: 0 })
      path = "eicar-test.txt"
    } else if (mode === "upload") {
      const size = Number(request.headers.get("content-length"))
      if (!request.body || !Number.isFinite(size) || size <= 0) {
        return NextResponse.json({ error: "Choose a file to scan." }, { status: 400, headers: NO_STORE })
      }
      if (size > UPLOAD_TEST_MAX_BYTES) {
        return NextResponse.json(
          { error: "Files over 4 MB cannot pass through Vercel here. Upload it to storage and scan it by bucket and path." },
          { status: 413, headers: NO_STORE },
        )
      }
      const name = (request.headers.get("x-file-name") ?? "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 120)
      path = `admin-test/${name}`
      const body = request.body
      /* One attempt: a request body can be read only once. */
      result = await scanSource(async () => ({ body, size }), { size, ref: "admin:upload", deadlineMs: 45_000, retries: 0 })
    } else if (mode === "object") {
      const input = (await request.json().catch(() => null)) as { bucket?: unknown; path?: unknown } | null
      bucket = typeof input?.bucket === "string" ? input.bucket.trim() : ""
      path = typeof input?.path === "string" ? input.path.trim().replace(/^\/+/, "") : ""
      if (!BUCKET.test(bucket) || !path || path.length > 512 || path.split("/").some((p) => p === ".." || p === "")) {
        return NextResponse.json({ error: "Give a bucket name and the file's path inside it." }, { status: 400, headers: NO_STORE })
      }
      result = await scanStoredObject(admin, bucket, path, { ref: "admin:object", deadlineMs: 55_000, retries: 1 })
    } else if (mode === "sweep") {
      const summary = await sweepPendingScans(admin, { budgetMs: 50_000, limit: 5, backfill: 0 })
      return NextResponse.json({ summary }, { headers: NO_STORE })
    } else {
      return NextResponse.json({ error: "Unknown test." }, { status: 400, headers: NO_STORE })
    }

    await recordScan(admin, { source: "admin_test", result, bucket, path, action: "none" })
    return NextResponse.json({ result }, { headers: NO_STORE })
  } catch (error) {
    return adminFailure("scanner test", error, "The test could not run.")
  }
}
