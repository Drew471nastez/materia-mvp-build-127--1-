import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { BLOCKED_STATUSES, UNRESOLVED_STATUSES, resolveAsset } from "@/lib/security/uploads/pipeline"
import { UPLOAD_HEADERS } from "@/lib/storage/upload-guard"

export const runtime = "nodejs"
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/v2/upload/scan   { assetId }
 *
 * A file's verdict, for its own creator. Every upload now gets its verdict
 * when it completes (/api/v2/upload/complete, lib/security/uploads), so this
 * only answers from the row, giving a file from before the checks its
 * verdict first. Kept because a product editor opened before this change
 * still calls it after an upload; nothing waits on it.
 *
 * Answers { success, assetId, status: "clean" | "blocked" }. No threat
 * name, no engine: a creator's page shows a file as ready, or one plain
 * sentence when it was not accepted.
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
      message: "That is a lot of requests in a short time. Wait a minute and try again.",
    })
    if (limited) return limited

    const body = (await request.json().catch(() => null)) as { assetId?: unknown } | null
    if (typeof body?.assetId !== "string" || !UUID.test(body.assetId)) {
      return NextResponse.json({ error: "Provide assetId" }, { status: 400, headers: UPLOAD_HEADERS })
    }

    const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).single()
    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403, headers: UPLOAD_HEADERS })
    }

    const { data: asset } = await admin
      .from("digital_assets")
      .select("id, file_path, file_name, file_size, mime_type, storage_bucket, scan_status, scan_result, uploaded_by, product:products!inner(creator_id)")
      .eq("id", body.assetId)
      .eq("product.creator_id", creator.id)
      .maybeSingle()
    if (!asset) {
      return NextResponse.json({ error: "File not found" }, { status: 404, headers: UPLOAD_HEADERS })
    }

    let status = String(asset.scan_status ?? "")
    if (UNRESOLVED_STATUSES.has(status)) {
      const now = await resolveAsset(admin, asset, { budgetMs: 5_000 }).catch(() => "unread" as const)
      status = now === "blocked" ? "blocked" : "clean"
    }
    return NextResponse.json(
      { success: true, assetId: asset.id, status: BLOCKED_STATUSES.has(status) ? "blocked" : "clean" },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("[scan] Error:", error)
    return NextResponse.json({ error: "Try again in a minute." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
