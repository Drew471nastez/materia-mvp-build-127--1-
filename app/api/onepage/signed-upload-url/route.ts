import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = "lead-form-files"
const MAX_DIGITAL_FILE_SIZE = 4 * 1024 * 1024 * 1024 // 4GB

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
      return NextResponse.json({ error: "File too large (max 4GB)" }, { status: 400 })
    }

    // Ensure bucket exists with proper configuration (4GB, all MIME types, public)
    try {
      const { data: buckets } = await adminSupabase.storage.listBuckets()
      const existingBucket = buckets?.find((b) => b.name === BUCKET_NAME)
      if (!existingBucket) {
        const { error: createErr } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: MAX_DIGITAL_FILE_SIZE,
          allowedMimeTypes: null, // null = allow ALL file types
        })
        if (createErr && !createErr.message?.includes('already exists')) {
          console.error("Bucket creation error:", createErr)
        }
      } else {
        // Always update bucket to ensure correct settings (public, 4GB limit, no MIME restrictions)
        await adminSupabase.storage.updateBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: MAX_DIGITAL_FILE_SIZE,
          allowedMimeTypes: null, // null = allow ALL file types (undefined gets stripped from JSON!)
        })
      }
    } catch (bucketErr) {
      console.error("Bucket setup error (continuing):", bucketErr)
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
    })
  } catch (error) {
    console.error("Signed upload URL error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
