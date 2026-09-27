import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateFile } from "@/lib/storage"
import { readBufferHeader, scanFile } from "@/lib/storage/security"
import { storageExtension } from "@/lib/storage/validation"
import { safeStoredContentType } from "@/lib/storage/file-signature"
import { preparePublicImage } from "@/lib/storage/public-image"
import { FLAGGED_UPLOAD, UPLOAD_HEADERS, screenPublicBytes, uploadRateLimit } from "@/lib/storage/upload-guard"

// Runtime must be nodejs for file handling
export const runtime = "nodejs"
export const maxDuration = 60

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"

/** Vercel gives a function 4.5 MB of body; the page only sends small pictures here. */
const MAX_BYTES = 25 * 1024 * 1024

/**
 * POST - A small file for a link page, through the function.
 *
 * form: file, type ("image" or "digital")
 *
 * A picture must be one by its bytes, and loses its location metadata
 * (lib/storage/public-image.ts). A file is checked against the blocklist and
 * by its magic bytes, and stored with a Content-Type a browser will download
 * rather than render. The name is always this route's.
 *
 * It used to reset the bucket's configuration on every request, three
 * storage API calls before the upload, and stored whatever type the browser
 * claimed, so an HTML page could be served from a public URL.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: UPLOAD_HEADERS })
    }

    const { data: creator } = await supabase.from("creators").select("id, subscription_plan_id").eq("user_id", user.id).single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404, headers: UPLOAD_HEADERS })
    }

    const limited = await uploadRateLimit(user.id, creator.subscription_plan_id)
    if (limited) return limited

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: "The file is too large for this upload. Try again." },
        { status: 413, headers: UPLOAD_HEADERS },
      )
    }

    const file = formData.get("file")
    const isDigital = formData.get("type") === "digital"

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400, headers: UPLOAD_HEADERS })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large for this upload." }, { status: 413, headers: UPLOAD_HEADERS })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    let body: Uint8Array
    let contentType: string
    let ext: string

    if (isDigital) {
      const validation = validateFile(file.name, file.type || "application/octet-stream", file.size)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.reason }, { status: 400, headers: UPLOAD_HEADERS })
      }
      const scan = scanFile(file.name, file.type || "application/octet-stream", readBufferHeader(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)))
      if (!scan.safe) {
        return NextResponse.json({ error: scan.reason }, { status: 400, headers: UPLOAD_HEADERS })
      }
      body = bytes
      contentType = safeStoredContentType(file.type, bytes)
      ext = storageExtension(file.name)
    } else {
      const picture = preparePublicImage(bytes)
      if (!picture.ok) {
        return NextResponse.json({ error: picture.error }, { status: picture.status, headers: UPLOAD_HEADERS })
      }
      body = picture.bytes
      contentType = picture.mime
      ext = picture.ext
    }

    const subfolder = isDigital ? "digital-products" : "product-images"
    const fileName = `${creator.id}/${subfolder}/${Date.now()}-${crypto.randomUUID().replace(/-/g, "")}.${ext}`

    /* Public the moment it is stored, so scanned before (lib/storage/upload-guard.ts). */
    const screened = await screenPublicBytes(adminSupabase, body, {
      source: isDigital ? "link_page_file" : "public_image",
      bucket: BUCKET_NAME,
      path: fileName,
    })
    if (screened.blocked) {
      return NextResponse.json({ error: FLAGGED_UPLOAD }, { status: 400, headers: UPLOAD_HEADERS })
    }

    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, body, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      })

    if (uploadError) {
      console.error("[upload-file] Storage upload error:", uploadError)
      return NextResponse.json({ error: "The upload failed. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
    }

    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(fileName)

    if (!urlData?.publicUrl) {
      return NextResponse.json({ error: "Failed to get public URL" }, { status: 500, headers: UPLOAD_HEADERS })
    }

    return NextResponse.json(
      {
        success: true,
        url: urlData.publicUrl,
        path: uploadData.path,
        filename: file.name,
      },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("[upload-file] Fatal error:", error)
    return NextResponse.json({ error: "The upload failed. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
