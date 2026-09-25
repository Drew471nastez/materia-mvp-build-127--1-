import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { scanAsset } from "@/lib/storage/scan-gate"
import { UPLOAD_HEADERS } from "@/lib/storage/upload-guard"

export const runtime = "nodejs"
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/v2/upload/scan
 *
 * Asks for a scan of the caller's own digital files (lib/storage/scan-gate.ts).
 *
 * Modes:
 * 1. Scan a specific asset: { assetId: string }
 * 2. Scan the caller's pending assets: { scanPending: true, limit?: number }
 *
 * The product editor calls this after an upload. The hourly storage cron
 * (/api/cron/storage-cleanup) scans whatever is still pending, for everybody,
 * so a file is never left unscanned because a tab closed.
 *
 * "Scan all pending" used to fetch the oldest pending assets of EVERY creator
 * and then refuse the ones that were not the caller's, one by one, so a
 * creator's own files could wait behind the whole platform's. It now reads
 * only the caller's.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: UPLOAD_HEADERS })
    }

    const limited = await rateLimit({
      bucket: "upload-scan",
      subjects: [`user:${user.id}`],
      windows: [{ limit: 60, seconds: 60 }, { limit: 600, seconds: 3600 }],
      message: "That is a lot of scans in a short time. Wait a minute and try again.",
    })
    if (limited) return limited

    const body = (await request.json().catch(() => null)) as { assetId?: unknown; scanPending?: unknown; limit?: unknown } | null

    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403, headers: UPLOAD_HEADERS })
    }

    const columns = "id, file_path, file_name, file_size, mime_type, storage_bucket, scan_status, product:products!inner(creator_id)"

    if (typeof body?.assetId === "string" && UUID.test(body.assetId)) {
      const { data: asset } = await admin
        .from("digital_assets")
        .select(columns)
        .eq("id", body.assetId)
        .eq("product.creator_id", creator.id)
        .maybeSingle()
      if (!asset) {
        return NextResponse.json({ error: "Asset not found or access denied" }, { status: 404, headers: UPLOAD_HEADERS })
      }
      const status = await scanAsset(admin, asset)
      return NextResponse.json(
        {
          success: true,
          assetId: asset.id,
          status,
          ...(status === "infected" ? { action: "File has been quarantined and removed." } : {}),
        },
        { headers: UPLOAD_HEADERS },
      )
    }

    if (body?.scanPending === true) {
      const limit = Math.max(1, Math.min(Number(body.limit) || 10, 25))
      const { data: pending } = await admin
        .from("digital_assets")
        .select(columns)
        .eq("product.creator_id", creator.id)
        .eq("scan_status", "pending_scan")
        .eq("upload_status", "completed")
        .order("created_at", { ascending: true })
        .limit(limit)
      const scanned = []
      for (const asset of pending ?? []) {
        scanned.push({ assetId: asset.id, status: await scanAsset(admin, asset) })
      }
      return NextResponse.json({ success: true, scanned }, { headers: UPLOAD_HEADERS })
    }

    return NextResponse.json({ error: "Provide assetId or scanPending:true" }, { status: 400, headers: UPLOAD_HEADERS })
  } catch (error) {
    console.error("[scan] Error:", error)
    return NextResponse.json({ error: "The scan could not run. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
