import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"
const MAX_DIGITAL_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
const BUCKET_FILE_SIZE_LIMIT = 5 * 1024 * 1024 * 1024 // 5GB

/**
 * POST - Generate a signed upload URL for direct-to-storage uploads.
 * This avoids FUNCTION_PAYLOAD_TOO_LARGE by never sending file bytes through the API route.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const body = await request.json()
    const { fileName, contentType, fileSize, folder } = body as {
      fileName: string
      contentType: string
      fileSize: number
      folder: string // 'digital' or 'images'
    }

    if (!fileName || !contentType || !fileSize) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (fileSize > MAX_DIGITAL_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 5GB)" }, { status: 400 })
    }

    // Validate live bucket configuration using admin API only.
    // Avoid REST bucket update/create calls here because some projects return non-fatal 400s,
    // which previously caused false upload failures.
    const bucketFixSql = `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('${BUCKET_NAME}', '${BUCKET_NAME}', true, ${BUCKET_FILE_SIZE_LIMIT}, NULL) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;`

    try {
      const { data: buckets, error: bucketsError } = await adminSupabase.storage.listBuckets()
      if (bucketsError) {
        console.warn("[signed-upload] listBuckets failed, continuing:", bucketsError.message)
      } else {
        const bucket = buckets?.find((b) => b.id === BUCKET_NAME || b.name === BUCKET_NAME) as { file_size_limit?: number | null } | undefined
        if (!bucket) {
          throw new Error(`Upload bucket '${BUCKET_NAME}' was not found. Run SQL: ${bucketFixSql}`)
        }
        let liveLimit = typeof bucket.file_size_limit === "number" ? bucket.file_size_limit : null

        // Self-heal: if bucket limit is too low, try to raise it with admin API.
        if (liveLimit !== null && liveLimit > 0 && liveLimit < BUCKET_FILE_SIZE_LIMIT) {
          const { error: updateError } = await adminSupabase.storage.updateBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
            allowedMimeTypes: null,
          })
          if (updateError) {
            console.error("[signed-upload] updateBucket failed:", updateError)
          } else {
            const { data: refreshedBuckets } = await adminSupabase.storage.listBuckets()
            const refreshed = refreshedBuckets?.find((b) => b.id === BUCKET_NAME || b.name === BUCKET_NAME) as { file_size_limit?: number | null } | undefined
            liveLimit = typeof refreshed?.file_size_limit === "number" ? refreshed.file_size_limit : liveLimit
          }
        }

        if (liveLimit !== null && liveLimit > 0 && liveLimit < fileSize) {
          throw new Error(`Current bucket limit is ${liveLimit} bytes, file is ${fileSize} bytes. Run SQL: ${bucketFixSql}`)
        }
      }
    } catch (bucketErr) {
      console.error("[signed-upload] Bucket setup error:", bucketErr)
      const message = bucketErr instanceof Error ? bucketErr.message : "Failed to verify upload bucket"
      return NextResponse.json({ error: message }, { status: 500 })
    }

    // Generate unique path
    const ext = fileName.split(".").pop() || "bin"
    const subfolder = folder === "digital" ? "digital-products" : "product-images"
    const filePath = `${creator.id}/${subfolder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    // Create a signed upload URL using admin client (valid for 10 minutes)
    const { data: signedData, error: signedError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath)

    if (signedError || !signedData) {
      console.error("Signed URL error:", signedError)
      return NextResponse.json({ error: `Failed to create upload URL: ${signedError?.message || 'Unknown error'}` }, { status: 500 })
    }

    // Get the public URL for after upload
    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

    return NextResponse.json({
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: filePath,
      publicUrl: urlData.publicUrl,
      bucket: BUCKET_NAME,
    })
  } catch (error) {
    console.error("Signed upload URL error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
