import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = "store-builder-images"

// Allowed video MIME types
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-m4v",
  "video/mpeg",
  "video/ogg",
  "video/3gpp",
  "video/x-ms-wmv",
]

// POST - Get a signed upload URL for video files
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      console.error("[upload-video] Unauthorized: No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { filename, contentType, folder = "" } = body

    if (!filename || !contentType) {
      console.error("[upload-video] Missing required fields:", { filename, contentType })
      return NextResponse.json({ error: "Missing filename or contentType" }, { status: 400 })
    }

    // Validate content type is a video
    if (!contentType.startsWith("video/")) {
      console.error("[upload-video] Invalid content type:", contentType)
      return NextResponse.json({ error: "Only video files are allowed" }, { status: 400 })
    }

    // Generate unique path with user folder
    const timestamp = Date.now()
    const ext = filename.split(".").pop()?.toLowerCase() || "mp4"
    const safeName = `${timestamp}.${ext}`
    const filePath = folder ? `${user.id}/${folder}/${safeName}` : `${user.id}/${safeName}`

    console.log("[upload-video] Creating signed URL for:", { filePath, contentType, userId: user.id })

    // Ensure bucket exists and has proper config
    try {
      const { data: buckets, error: listError } = await adminSupabase.storage.listBuckets()

      if (listError) {
        console.error("[upload-video] Error listing buckets:", listError)
      }

      const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME)

      if (!bucketExists) {
        console.log("[upload-video] Creating bucket:", BUCKET_NAME)
        // Create bucket with public access and high file size limit
        const { error: createError } = await adminSupabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: 5368709120, // 5GB
          allowedMimeTypes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/svg+xml",
            ...ALLOWED_VIDEO_TYPES,
          ],
        })

        if (createError) {
          console.error("[upload-video] Error creating bucket:", createError)
          // Continue anyway - bucket might exist but we couldn't list it
        }
      }
    } catch (bucketError) {
      console.error("[upload-video] Error checking/creating bucket:", bucketError)
      // Continue anyway - we'll try to create the signed URL
    }

    // Create a signed upload URL (valid for 1 hour)
    const { data: signedData, error: signedError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath)

    if (signedError) {
      console.error("[upload-video] Error creating signed URL:", signedError)
      return NextResponse.json({
        error: "Failed to create upload URL",
        details: signedError.message
      }, { status: 500 })
    }

    if (!signedData?.signedUrl || !signedData?.token) {
      console.error("[upload-video] Invalid signed URL response:", signedData)
      return NextResponse.json({ error: "Failed to create upload URL - invalid response" }, { status: 500 })
    }

    // Get the public URL for after upload
    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

    console.log("[upload-video] Signed URL created successfully for:", filePath)

    return NextResponse.json({
      success: true,
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: signedData.path,
      publicUrl: urlData.publicUrl,
    })
  } catch (error) {
    console.error("[upload-video] Unexpected error:", error)
    return NextResponse.json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}
