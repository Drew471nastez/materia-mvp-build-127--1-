import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Runtime must be nodejs for file handling
export const runtime = "nodejs"
// Allow up to 300 seconds for upload processing
export const maxDuration = 300

const BUCKET_NAME = "lead-form-files"
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

// Ensure bucket exists with correct settings
async function ensureBucket(adminSupabase: ReturnType<typeof createAdminClient>) {
  try {
    const { data: buckets } = await adminSupabase.storage.listBuckets()
    const existingBucket = buckets?.find((b) => b.name === BUCKET_NAME)

    if (!existingBucket) {
      const { error: createError } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 0, // 0 = no file size limit
        allowedMimeTypes: null, // null = allow ALL file types
      })
      if (createError && !createError.message?.includes('already exists')) {
        console.error("[upload-file] Bucket creation error:", createError)
        return false
      }
    } else {
      // Always update to ensure correct settings
      const { error: updateError } = await adminSupabase.storage.updateBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 0, // 0 = no file size limit
        allowedMimeTypes: null,
      })
      if (updateError) {
        console.error("[upload-file] Bucket update error (non-fatal):", updateError)
      }
    }
    return true
  } catch (err) {
    console.error("[upload-file] Bucket setup error:", err)
    return true // Continue anyway - bucket might already exist
  }
}

// POST - Upload a file for lead form (product images and digital products)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Get form data with the file
    let formData: FormData
    try {
      formData = await request.formData()
    } catch (formError) {
      console.error("[upload-file] FormData parse error:", formError)
      return NextResponse.json({ error: "Failed to parse upload data. File may be too large for direct upload - try the signed URL upload instead." }, { status: 413 })
    }

    const file = formData.get("file") as File
    const fileType = formData.get("type") as string // 'image' or 'digital'

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size must be less than 4GB" }, { status: 400 })
    }

    // Ensure bucket exists
    await ensureBucket(adminSupabase)

    // Generate unique filename
    const fileExt = file.name.split(".").pop() || "bin"
    const subfolder = fileType === 'digital' ? 'digital-products' : 'product-images'
    const fileName = `${creator.id}/${subfolder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    // Convert File to buffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = new Uint8Array(arrayBuffer)

    // Upload using admin client (bypasses RLS)
    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: "31536000",
        upsert: true,
      })

    if (uploadError) {
      console.error("[upload-file] Storage upload error:", uploadError)
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // Get the public URL
    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(fileName)

    if (!urlData?.publicUrl) {
      return NextResponse.json({ error: "Failed to get public URL" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: uploadData.path,
      filename: file.name,
    })
  } catch (error) {
    console.error("[upload-file] Fatal error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
