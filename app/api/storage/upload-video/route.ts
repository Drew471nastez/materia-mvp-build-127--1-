import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { safeExtension, uploadFolderOf, videoBucketOf } from "@/lib/storage/upload-location"
import { isPublicVideo } from "@/lib/storage/file-signature"
import { UPLOAD_HEADERS, uploadRateLimit } from "@/lib/storage/upload-guard"

// The bucket is always product-videos (lib/storage/upload-location.ts), never the caller's.

// Allowed video MIME types
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

/**
 * The bucket is made by supabase/migrations/20260929_upload_safety.sql, public,
 * with a size limit and these types. This only creates it when a storage call
 * has just said it does not exist, instead of listing every bucket and
 * rewriting this one's settings on every upload as it used to.
 */
async function createBucketIfMissing(adminSupabase: ReturnType<typeof createAdminClient>, bucketName: string, message: string) {
  if (!/not found|does not exist/i.test(message)) return false
  const { error } = await adminSupabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: 2000000000, // ~2GB, must fit int4 for older Supabase projects
    allowedMimeTypes: [...ALLOWED_VIDEO_TYPES, "image/jpeg", "image/png", "image/gif", "image/webp"],
  })
  return !error || /already exists/i.test(error.message)
}

/** A key nobody can guess or collide with. */
function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "")
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

    const limited = await uploadRateLimit(user.id)
    if (limited) return limited

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

    // One of the video types the bucket takes
    if (!ALLOWED_VIDEO_TYPES.includes(contentType.toLowerCase())) {
      return NextResponse.json({ error: "Only video files are allowed" }, { status: 400 })
    }

    const targetBucket = bucket

    // Generate unique path with user folder
    const timestamp = Date.now()
    const ext = safeExtension(filename, "mp4")
    const safeName = `${timestamp}_${randomId()}.${ext}`
    const filePath = folder ? `${user.id}/${folder}/${safeName}` : `${user.id}/${safeName}`

    // Create a signed upload URL
    let { data: signedData, error: signedError } = await adminSupabase.storage
      .from(targetBucket)
      .createSignedUploadUrl(filePath)
    if (signedError && (await createBucketIfMissing(adminSupabase, targetBucket, signedError.message))) {
      ;({ data: signedData, error: signedError } = await adminSupabase.storage.from(targetBucket).createSignedUploadUrl(filePath))
    }

    if (signedError || !signedData) {
      console.error("Error creating signed URL:", signedError)
      return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500 })
    }

    // Get the public URL for after upload
    const { data: urlData } = adminSupabase.storage.from(targetBucket).getPublicUrl(filePath)

    return NextResponse.json(
      {
        success: true,
        signedUrl: signedData.signedUrl,
        token: signedData.token,
        path: signedData.path,
        publicUrl: urlData.publicUrl,
        bucket: targetBucket,
      },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("Upload video error:", error)
    return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500 })
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

    const limited = await uploadRateLimit(user.id)
    if (limited) return limited

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

    // The declared type, and then the bytes: a page labelled video/mp4 is not a video
    if (!file.type.startsWith("video/")) {
      return NextResponse.json({ error: "Only video files are allowed" }, { status: 400 })
    }
    const arrayBuffer = await file.arrayBuffer()
    const kind = isPublicVideo(new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 4096)))
    if (!kind) {
      return NextResponse.json({ error: "That file is not a video. Use MP4, MOV or WebM." }, { status: 415 })
    }

    // Generate unique path
    const timestamp = Date.now()
    const ext = safeExtension(file.name, "mp4")
    const safeName = `${timestamp}_${randomId()}.${ext}`
    const filePath = folder ? `${user.id}/${folder}/${safeName}` : `${user.id}/${safeName}`

    // A new random name every time, so nothing is overwritten and the URL
    // can be cached for a year.
    const upload = () =>
      adminSupabase.storage.from(bucket).upload(filePath, arrayBuffer, {
        contentType: kind.mime ?? file.type,
        cacheControl: "31536000",
        upsert: false,
      })
    let { error: uploadError } = await upload()
    if (uploadError && (await createBucketIfMissing(adminSupabase, bucket, uploadError.message))) {
      ;({ error: uploadError } = await upload())
    }

    if (uploadError) {
      console.error("Direct upload error:", uploadError)
      return NextResponse.json({ error: "The upload failed. Try again." }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = adminSupabase.storage.from(bucket).getPublicUrl(filePath)

    return NextResponse.json(
      {
        success: true,
        publicUrl: urlData.publicUrl,
        path: filePath,
        bucket,
      },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("Direct upload error:", error)
    return NextResponse.json({ error: "The upload failed. Try again." }, { status: 500 })
  }
}
