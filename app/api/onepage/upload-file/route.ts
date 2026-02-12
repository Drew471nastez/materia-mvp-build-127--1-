import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Runtime must be nodejs for file handling
export const runtime = "nodejs"
// Allow up to 300 seconds for upload processing
export const maxDuration = 300

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
const BUCKET_FILE_SIZE_LIMIT = 5368709120 // 5GB exact

/**
 * Ensure the storage bucket exists with correct configuration.
 * Auto-creates or fixes the bucket via direct REST API if needed.
 */
async function ensureBucket(): Promise<boolean> {
  try {
    const adminSupabase = createAdminClient()
    const { data: buckets, error } = await adminSupabase.storage.listBuckets()

    if (error) {
      console.warn("[upload-file] listBuckets failed, attempting REST fix:", error.message)
      return await fixBucketViaRest()
    }

    const bucket = buckets?.find((b) => b.id === BUCKET_NAME || b.name === BUCKET_NAME) as
      | { file_size_limit?: number | null }
      | undefined

    if (!bucket) {
      console.warn("[upload-file] Bucket not found, creating via REST:", BUCKET_NAME)
      return await fixBucketViaRest()
    }

    const liveLimit = typeof bucket.file_size_limit === "number" ? bucket.file_size_limit : null
    if (liveLimit !== null && liveLimit > 0 && liveLimit < BUCKET_FILE_SIZE_LIMIT) {
      console.warn("[upload-file] Bucket size limit too low:", liveLimit, "- fixing via REST")
      return await fixBucketViaRest()
    }

    return true
  } catch (err) {
    console.error("[upload-file] Bucket check error:", err)
    return await fixBucketViaRest()
  }
}

/**
 * Fix or create bucket using direct Supabase REST API.
 * This bypasses the JS client which may have issues with certain configurations.
 */
async function fixBucketViaRest(): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[upload-file] Missing SUPABASE_URL or SERVICE_ROLE_KEY for bucket fix")
    return true // Optimistically continue - the upload itself will fail if bucket is bad
  }

  const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  }

  const bucketConfig = {
    id: BUCKET_NAME,
    name: BUCKET_NAME,
    public: true,
    file_size_limit: BUCKET_FILE_SIZE_LIMIT,
    allowed_mime_types: null,
  }

  try {
    // Try update first
    const updateRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(bucketConfig),
    })

    if (updateRes.ok) return true

    // If update failed (404 = doesn't exist), try create
    if (updateRes.status === 404 || updateRes.status === 400) {
      const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers,
        body: JSON.stringify(bucketConfig),
      })

      if (createRes.ok) return true

      // Check if it's "already exists" (409) which is fine
      if (createRes.status === 409) return true

      console.error("[upload-file] Failed to create bucket:", createRes.status)
    }

    return true // Optimistically continue
  } catch (err) {
    console.error("[upload-file] REST bucket fix error:", err)
    return true // Optimistically continue
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
      return NextResponse.json(
        {
          error:
            "Failed to parse upload data. File may be too large for direct upload - try the signed URL upload instead.",
        },
        { status: 413 },
      )
    }

    const file = formData.get("file") as File
    const fileType = formData.get("type") as string // 'image' or 'digital'

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size must be less than 5GB" }, { status: 400 })
    }

    // Ensure bucket exists with correct file_size_limit (auto-fix if needed)
    await ensureBucket()

    // Generate unique filename
    const fileExt = file.name.split(".").pop() || "bin"
    const subfolder = fileType === "digital" ? "digital-products" : "product-images"
    const fileName = `${creator.id}/${subfolder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    // Convert File to buffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = new Uint8Array(arrayBuffer)

    // Upload using admin client (bypasses RLS)
    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType: file.type || "application/octet-stream",
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
