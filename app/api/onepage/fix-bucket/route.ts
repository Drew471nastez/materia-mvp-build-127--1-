import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = "lead-form-files"
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

/**
 * POST - Fix the lead-form-files bucket configuration.
 * Resets file_size_limit to 500MB (safe int32 value) and allows all MIME types.
 * This fixes issues caused by the previous 4GB value overflowing int32 in PostgreSQL.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Try to update the bucket via Storage API
    const { error: updateErr } = await adminSupabase.storage.updateBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: null,
    })

    if (updateErr) {
      console.error("[fix-bucket] Storage API update failed:", updateErr)

      // Fallback: try creating the bucket if it doesn't exist
      const { error: createErr } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: null,
      })

      if (createErr && !createErr.message?.includes('already exists')) {
        return NextResponse.json({
          error: `Failed to fix bucket: ${updateErr.message}`,
          sql: `UPDATE storage.buckets SET file_size_limit = ${MAX_FILE_SIZE}, allowed_mime_types = NULL WHERE id = '${BUCKET_NAME}';`,
        }, { status: 500 })
      }
    }

    // Verify the bucket config
    const { data: buckets } = await adminSupabase.storage.listBuckets()
    const bucket = buckets?.find((b) => b.name === BUCKET_NAME)

    return NextResponse.json({
      success: true,
      message: "Bucket configuration fixed successfully",
      bucket: {
        name: bucket?.name,
        public: bucket?.public,
        fileSizeLimit: (bucket as any)?.file_size_limit,
      },
    })
  } catch (error) {
    console.error("[fix-bucket] Error:", error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Internal server error",
      sql: `UPDATE storage.buckets SET file_size_limit = ${MAX_FILE_SIZE}, allowed_mime_types = NULL WHERE id = '${BUCKET_NAME}';`,
    }, { status: 500 })
  }
}
