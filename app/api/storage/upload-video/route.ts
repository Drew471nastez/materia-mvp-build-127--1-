import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { safeExtension, uploadFolderOf, videoBucketOf } from "@/lib/storage/upload-location"
import { UPLOAD_HEADERS, screenInBackground, uploadRateLimit } from "@/lib/storage/upload-guard"
import { inspectHead, precheckUpload } from "@/lib/security/uploads/inspect"
import { logUploadVerdict } from "@/lib/security/uploads/audit"
import { runAfterResponse } from "@/lib/security/uploads/pipeline"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

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
    const who = await routeUser()
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
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

    // One of the video types the bucket takes, and the central check on the name and size
    if (!ALLOWED_VIDEO_TYPES.includes(contentType.toLowerCase())) {
      return NextResponse.json({ error: "This file type isn't supported. Use MP4, MOV or WebM." }, { status: 415 })
    }
    const pre = precheckUpload({ fileName: filename, size: Number(body.fileSize) || 1, declaredMime: contentType, context: "video" })
    if (!pre.ok) return NextResponse.json({ error: pre.userMessage }, { status: pre.code === "too_large" ? 413 : 415 })

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
    const who = await routeUser()
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
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

    // The central check: the declared type, and then the bytes. A page labelled video/mp4 is not a video
    const arrayBuffer = await file.arrayBuffer()
    const verdict = inspectHead({
      fileName: file.name,
      declaredMime: file.type,
      size: arrayBuffer.byteLength,
      head: new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 8192)),
      context: "video",
    })
    if (!verdict.ok) {
      runAfterResponse(() => logUploadVerdict(adminSupabase, verdict, { context: "video", userId: user.id, bucket, bytes: arrayBuffer.byteLength }))
      return NextResponse.json({ error: verdict.userMessage }, { status: verdict.code === "too_large" ? 413 : 415 })
    }
    const kind = { mime: verdict.detectedType }

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

    screenInBackground(adminSupabase, { bytes: new Uint8Array(arrayBuffer), bucket, path: filePath, context: "video", userId: user.id })
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
