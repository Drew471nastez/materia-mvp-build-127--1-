import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"
const MAX_DIGITAL_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
const BUCKET_FILE_SIZE_LIMIT = 5368709120 // 5GB exact

/**
 * Auto-fix bucket configuration via direct Supabase REST API.
 * Creates the bucket if missing, or updates its size limit if too low.
 */
async function ensureBucketReady(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return

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

    if (updateRes.ok) return

    // If update failed (bucket doesn't exist), try create
    if (updateRes.status === 404 || updateRes.status === 400) {
      const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers,
        body: JSON.stringify(bucketConfig),
      })
      // 409 = already exists, also fine
      if (createRes.ok || createRes.status === 409) return
    }
  } catch (err) {
    console.warn("[signed-upload] Bucket auto-fix failed:", err)
  }
}

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

    // Auto-fix bucket configuration before proceeding
    await ensureBucketReady()

    // Validate live bucket configuration
    try {
      const { data: buckets, error: bucketsError } = await adminSupabase.storage.listBuckets()
      if (bucketsError) {
        console.warn("[signed-upload] listBuckets failed, continuing:", bucketsError.message)
      } else {
        const bucket = buckets?.find((b) => b.id === BUCKET_NAME || b.name === BUCKET_NAME) as
          | { file_size_limit?: number | null }
          | undefined
        if (!bucket) {
          return NextResponse.json(
            { error: `Upload bucket '${BUCKET_NAME}' was not found. Please contact support.` },
            { status: 500 },
          )
        }
        const liveLimit = typeof bucket.file_size_limit === "number" ? bucket.file_size_limit : null

        if (liveLimit !== null && liveLimit > 0 && liveLimit < fileSize) {
          return NextResponse.json(
            {
              error: `Current bucket limit is ${liveLimit} bytes but file is ${fileSize} bytes. Please contact support.`,
            },
            { status: 500 },
          )
        }
      }
    } catch (bucketErr) {
      console.warn("[signed-upload] Bucket validation error, continuing:", bucketErr)
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
      return NextResponse.json(
        { error: `Failed to create upload URL: ${signedError?.message || "Unknown error"}` },
        { status: 500 },
      )
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
