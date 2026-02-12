import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Runtime must be nodejs for file handling
export const runtime = "nodejs"
// Allow up to 300 seconds for upload processing
export const maxDuration = 300

const BUCKET_NAME = "lead-form-files"
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
const BUCKET_FILE_SIZE_LIMIT = 5 * 1024 * 1024 * 1024 // 5GB

// Ensure bucket exists with correct settings using direct REST API
async function ensureBucket() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Direct REST API call to enforce explicit 5GB object limit
    const updateRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: BUCKET_NAME,
        name: BUCKET_NAME,
        public: true,
        file_size_limit: BUCKET_FILE_SIZE_LIMIT,
        allowed_mime_types: null,
      }),
    })

    if (!updateRes.ok) {
      const body = await updateRes.json().catch(() => null)
      console.error("[upload-file] Direct bucket update failed:", updateRes.status, body)

      if (updateRes.status === 404 || updateRes.status === 400) {
        const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: BUCKET_NAME,
            name: BUCKET_NAME,
            public: true,
            file_size_limit: BUCKET_FILE_SIZE_LIMIT,
            allowed_mime_types: null,
          }),
        })
        if (!createRes.ok) {
          const createBody = await createRes.json().catch(() => null)
          console.error("[upload-file] Bucket creation failed:", createRes.status, createBody)
          return false
        }
      } else {
        return false
      }
    }

    const verifyRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
    })

    if (!verifyRes.ok) {
      return false
    }

    const verifyBody = await verifyRes.json().catch(() => null) as { file_size_limit?: number | null } | null
    const liveLimit = typeof verifyBody?.file_size_limit === 'number' ? verifyBody.file_size_limit : null
    if (liveLimit !== null && liveLimit > 0 && liveLimit < BUCKET_FILE_SIZE_LIMIT) {
      console.error("[upload-file] Bucket size limit is still too low:", liveLimit)
      return false
    }

    return true
  } catch (err) {
    console.error("[upload-file] Bucket setup error:", err)
    return false
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
      return NextResponse.json({ error: "File size must be less than 5GB" }, { status: 400 })
    }

    // Ensure bucket exists with correct file_size_limit
    const bucketReady = await ensureBucket()
    if (!bucketReady) {
      return NextResponse.json({
        error: "Upload bucket is not configured for large files. Run the provided SQL migration or /api/onepage/fix-bucket.",
      }, { status: 500 })
    }

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
