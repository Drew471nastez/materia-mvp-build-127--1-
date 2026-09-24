import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { VIDEO_BUCKET, safeExtension, uploadFolderOf, videoBucketOf } from "@/lib/storage/upload-location"

// Default bucket for product videos - can also use product-images with video support
const BUCKET_NAME = VIDEO_BUCKET

// Allowed video MIME types - be more permissive
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/mov",
  "video/mpeg",
  "video/x-m4v",
  "video/x-matroska",
  "video/ogg",
  "video/avi",
  "video/3gpp",
]

// Helper to ensure bucket exists with proper configuration. The bucket is
// always BUCKET_NAME (lib/storage/upload-location.ts), never the caller's.
async function ensureBucketExists(adminSupabase: ReturnType<typeof createAdminClient>, bucketName: string) {
  try {
    const { data: buckets } = await adminSupabase.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === bucketName)

    if (!bucketExists) {
      // Create bucket with public access and high file size limit
      const { error: createError } = await adminSupabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 2000000000, // ~2GB — must fit int4 for older Supabase projects
        allowedMimeTypes: [...ALLOWED_VIDEO_TYPES, 'image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      })

      if (createError && !createError.message.includes("already exists")) {
        console.error(`Error creating bucket ${bucketName}:`, createError)
      }
    } else {
      // Try to update bucket settings
      try {
        await adminSupabase.storage.updateBucket(bucketName, {
          public: true,
          fileSizeLimit: 2000000000, // ~2GB — must fit int4 for older Supabase projects
          allowedMimeTypes: [...ALLOWED_VIDEO_TYPES, 'image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        })
      } catch (updateErr) {
        // Ignore update errors - bucket config might be fine
        console.log(`Bucket ${bucketName} update skipped:`, updateErr)
      }
    }
    return true
  } catch (err) {
    console.error("Error ensuring bucket exists:", err)
    return false
  }
}

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
    const { filename, contentType } = body
    const bucket = videoBucketOf(body.bucket)
    const folder = uploadFolderOf(body.folder)
    if (!bucket || folder === null) {
      return NextResponse.json({ error: "Invalid upload location" }, { status: 400 })
    }

    if (typeof filename !== "string" || typeof contentType !== "string" || !filename || !contentType) {
      return NextResponse.json({ error: "Missing filename or contentType" }, { status: 400 })
    }

    // Validate content type is a video (be more permissive)
    if (!contentType.startsWith("video/")) {
      return NextResponse.json({ error: "Only video files are allowed" }, { status: 400 })
    }

    const targetBucket = bucket

    // Generate unique path with user folder
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).slice(2, 10)
    const ext = safeExtension(filename, "mp4")
    const safeName = `${timestamp}_${randomId}.${ext}`
    const filePath = folder ? `${user.id}/${folder}/${safeName}` : `${user.id}/${safeName}`

    // Ensure bucket exists
    await ensureBucketExists(adminSupabase, targetBucket)

    // Create a signed upload URL (valid for 1 hour)
    const { data: signedData, error: signedError } = await adminSupabase.storage
      .from(targetBucket)
      .createSignedUploadUrl(filePath)

    if (signedError) {
      console.error("Error creating signed URL:", signedError)
      return NextResponse.json({ error: `Failed to create upload URL: ${signedError.message}` }, { status: 500 })
    }

    // Get the public URL for after upload
    const { data: urlData } = adminSupabase.storage.from(targetBucket).getPublicUrl(filePath)

    return NextResponse.json({
      success: true,
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: signedData.path,
      publicUrl: urlData.publicUrl,
      bucket: targetBucket,
    })
  } catch (error) {
    console.error("Upload video error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PUT - Direct upload using admin client (for larger files that fail with signed URLs)
export async function PUT(request: NextRequest) {
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

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folder = uploadFolderOf(formData.get("folder"))
    const bucket = videoBucketOf(formData.get("bucket"))
    if (!bucket || folder === null) {
      return NextResponse.json({ error: "Invalid upload location" }, { status: 400 })
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate content type (be more permissive)
    if (!file.type.startsWith("video/")) {
      return NextResponse.json({ error: "Only video files are allowed" }, { status: 400 })
    }

    // Ensure bucket exists before upload
    await ensureBucketExists(adminSupabase, bucket)

    // Generate unique path
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).slice(2, 10)
    const ext = safeExtension(file.name, "mp4")
    const safeName = `${timestamp}_${randomId}.${ext}`
    const filePath = folder ? `${user.id}/${folder}/${safeName}` : `${user.id}/${safeName}`

    // Upload directly using admin client (bypasses RLS)
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await adminSupabase.storage
      .from(bucket)
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: true,
      })

    if (uploadError) {
      console.error("Direct upload error:", uploadError)
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = adminSupabase.storage.from(bucket).getPublicUrl(filePath)

    return NextResponse.json({
      success: true,
      publicUrl: urlData.publicUrl,
      path: filePath,
      bucket,
    })
  } catch (error) {
    console.error("Direct upload error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
