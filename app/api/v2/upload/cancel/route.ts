import { type NextRequest, NextResponse } from "next/server"
import { productCreator } from "@/lib/team/uploads"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DIGITAL_BUCKETS, STORAGE_BUCKET, updateCreatorStorageUsed } from "@/lib/storage"
import { UPLOAD_HEADERS } from "@/lib/storage/upload-guard"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A cancel can reach a file the server finished a moment before; not one from last week. */
const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * POST /api/v2/upload/cancel   body: { assetId }
 *
 * The uploader (lib/storage/chunked-upload.ts) calls this when a person
 * cancels. It removes the record and the bytes of THEIR upload: one they
 * started (uploaded_by), still pending or failed, or completed in the last
 * day, which is the case of a cancel pressed while the file was being
 * completed. A file a variant already lists is left alone.
 *
 * Idempotent: a record that is already gone is a success.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: UPLOAD_HEADERS })

    const body = (await request.json().catch(() => null)) as { assetId?: unknown } | null
    const assetId = typeof body?.assetId === "string" && UUID.test(body.assetId) ? body.assetId : null
    if (!assetId) return NextResponse.json({ error: "Which upload?" }, { status: 400, headers: UPLOAD_HEADERS })

    const admin = createAdminClient()
    const { data: asset } = await admin
      .from("digital_assets")
      .select("id, file_path, storage_bucket, upload_status, created_at, product_id")
      .eq("id", assetId)
      .eq("uploaded_by", user.id)
      .maybeSingle()

    if (!asset) return NextResponse.json({ success: true, removed: false }, { headers: UPLOAD_HEADERS })

    const fresh = Date.now() - new Date(asset.created_at).getTime() < CANCEL_WINDOW_MS
    const cancellable = asset.upload_status === "pending" || asset.upload_status === "failed" || (asset.upload_status === "completed" && fresh)
    if (!cancellable) {
      return NextResponse.json({ error: "That file is already part of the product. Remove it from the product instead." }, { status: 409, headers: UPLOAD_HEADERS })
    }

    const { count: mapped } = await admin
      .from("product_variant_files")
      .select("digital_asset_id", { count: "exact", head: true })
      .eq("digital_asset_id", asset.id)
    if ((mapped ?? 0) > 0) {
      return NextResponse.json({ error: "That file is already part of the product. Remove it from the product instead." }, { status: 409, headers: UPLOAD_HEADERS })
    }

    const bucket = asset.storage_bucket && (DIGITAL_BUCKETS as readonly string[]).includes(asset.storage_bucket) ? asset.storage_bucket : STORAGE_BUCKET
    if (asset.file_path && !asset.file_path.split("/").includes("..")) {
      await admin.storage.from(bucket).remove([asset.file_path]).then(
        () => undefined,
        () => undefined,
      )
    }
    await admin.from("digital_assets").delete().eq("id", asset.id).eq("uploaded_by", user.id)

    /* Round 41: the store a team member with Products works in, or the owner's own (lib/team/uploads productCreator). */
    const creator = (await productCreator(admin, user.id, "id")) as { id: string } | null
    if (creator) await updateCreatorStorageUsed(admin, creator.id).catch(() => undefined)

    return NextResponse.json({ success: true, removed: true }, { headers: UPLOAD_HEADERS })
  } catch (error) {
    console.error("[v2/upload/cancel]", error)
    return NextResponse.json({ error: "Could not cancel the upload." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
