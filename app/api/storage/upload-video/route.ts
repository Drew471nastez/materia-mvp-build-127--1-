import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET_NAME = "store-builder-images"

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { filename, contentType, folder = "" } = body

    if (!filename || !contentType) {
      return NextResponse.json({ error: "Missing filename or contentType" }, { status: 400 })
    }

    // Validate content type is a video
    if (!contentType.startsWith("video/")) {
      return NextResponse.json({ error: "Only video files are allowed" }, { status: 400 })
    }

    // Generate unique path with user folder
    const timestamp = Date.now()
    const ext = filename.split(".").pop() || "mp4"
    const safeName = `${timestamp}.${ext}`
    const filePath = folder ? `${user.id}/${folder}/${safeName}` : `${user.id}/${safeName}`

    // Ensure bucket exists and has proper config
    const { data: buckets } = await adminSupabase.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME)

    if (!bucketExists) {
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
          "video/mp4",
          "video/webm",
          "video/quicktime",
          "video/mov",
          "video/mpeg",
          "video/x-m4v",
        ],
      })

      if (createError) {
        console.error("Error creating bucket:", createError)
      }
    }

    // Create a signed upload URL (valid for 1 hour)
    const { data: signedData, error: signedError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath)

    if (signedError) {
      console.error("Error creating signed URL:", signedError)
      return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 })
    }

    // Get the public URL for after upload
    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

    return NextResponse.json({
      success: true,
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: signedData.path,
      publicUrl: urlData.publicUrl,
    })
  } catch (error) {
    console.error("Upload video error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
