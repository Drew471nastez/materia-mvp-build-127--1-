import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { updateCreatorStorageUsed } from "@/lib/storage"

export const runtime = "nodejs"

/**
 * POST /api/v2/upload/complete
 *
 * Called after the client has successfully uploaded a file to the signed URL.
 * Marks the digital asset as completed and updates storage quota.
 *
 * Request body:
 *   { assetId, path, bucket, fileSize? }
 *
 * Response:
 *   { success, asset }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // Authenticate
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { assetId, path, bucket, fileSize } = body as {
      assetId?: string
      path: string
      bucket: string
      fileSize?: number
    }

    if (!path || !bucket) {
      return NextResponse.json({ error: "Missing required fields: path, bucket" }, { status: 400 })
    }

    // Get creator
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403 })
    }

    // Verify the file actually exists in storage
    const { data: fileInfo, error: fileError } = await admin.storage
      .from(bucket)
      .list(path.substring(0, path.lastIndexOf("/")), {
        search: path.substring(path.lastIndexOf("/") + 1),
      })

    const fileExists = fileInfo && fileInfo.length > 0
    if (!fileExists && fileError) {
      console.warn("[v2/upload/complete] Could not verify file in storage:", fileError)
    }

    // If assetId is provided, mark the asset as completed
    if (assetId) {
      const { data: asset, error: updateError } = await admin
        .from("digital_assets")
        .update({
          upload_status: "completed",
          file_size: fileSize || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assetId)
        .eq("uploaded_by", user.id)
        .select("id, file_name, file_path, file_size, mime_type, file_category")
        .single()

      if (updateError) {
        console.error("[v2/upload/complete] Asset update error:", updateError)
        return NextResponse.json({ error: "Failed to complete upload" }, { status: 500 })
      }

      // Update creator's storage usage counter
      await updateCreatorStorageUsed(admin, creator.id)

      return NextResponse.json({
        success: true,
        asset: {
          id: asset.id,
          fileName: asset.file_name,
          filePath: asset.file_path,
          fileSize: asset.file_size,
          mimeType: asset.mime_type,
          category: asset.file_category,
        },
      })
    }

    // No assetId — this was a non-digital upload (image/thumbnail)
    // Just update storage counter
    await updateCreatorStorageUsed(admin, creator.id)

    // Get the public URL
    const { data: urlData } = admin.storage.from(bucket).getPublicUrl(path)

    return NextResponse.json({
      success: true,
      publicUrl: urlData.publicUrl,
      path,
      bucket,
    })
  } catch (error) {
    console.error("[v2/upload/complete] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
