import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateFile } from "@/lib/storage"
import { storageExtension } from "@/lib/storage/validation"
import { UPLOAD_HEADERS, uploadRateLimit } from "@/lib/storage/upload-guard"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"

/*
 * A file on a link page is public: whoever gets the link downloads it. That
 * is what a lead magnet is, and it is also what makes a public bucket a free
 * file host for anybody with an account. So there is a ceiling well above a
 * real ebook or template pack: 1 GB (lib/security/uploads/policy.ts).
 */

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST - A signed upload URL for a file on a link page.
 *
 * The bucket and the path are this route's: `${creatorId}/product-images/…`
 * for a picture, `${creatorId}/digital-products/…` for a file, a random name
 * and a cleaned extension. `folder` only picks between the two.
 *
 * It no longer touches the bucket. It used to remove the bucket's size limit
 * and call ensure_storage_rls on every request, and that RPC gave every
 * signed in user read, write and delete on the whole bucket, their own files
 * and everybody else's. Bucket settings and policies are set once, by
 * supabase/migrations/20260929_upload_safety.sql.
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

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, subscription_plan_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404, headers: UPLOAD_HEADERS })
    }

    const limited = await uploadRateLimit(user.id, creator.subscription_plan_id)
    if (limited) return limited

    const body = (await request.json().catch(() => null)) as {
      fileName?: unknown
      contentType?: unknown
      fileSize?: unknown
      folder?: unknown
    } | null
    const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 255) : ""
    const contentType = typeof body?.contentType === "string" ? body.contentType : "application/octet-stream"
    const fileSize = Number(body?.fileSize)
    const isDigital = body?.folder === "digital"

    if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: UPLOAD_HEADERS })
    }

    /* The central check (lib/security/uploads): size, name and declared
       type. A link page's file is public, so never a web page or an SVG;
       anything else is a picture. The bytes are checked at /complete. */
    const fileValidation = validateFile(fileName, contentType, fileSize, null, isDigital ? "link_page_file" : "public_image")
    if (!fileValidation.valid) {
      const status = fileValidation.code === "too_large" ? 413 : fileValidation.code === "empty" ? 400 : 415
      return NextResponse.json({ error: fileValidation.reason }, { status, headers: UPLOAD_HEADERS })
    }

    const subfolder = isDigital ? "digital-products" : "product-images"
    const filePath = `${creator.id}/${subfolder}/${Date.now()}-${crypto.randomUUID().replace(/-/g, "")}.${storageExtension(fileName)}`

    const { data: signedData, error: signedError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath)

    if (signedError || !signedData) {
      console.error("Signed URL error:", signedError)
      return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
    }

    const { data: urlData } = adminSupabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

    return NextResponse.json(
      {
        signedUrl: signedData.signedUrl,
        token: signedData.token,
        path: filePath,
        publicUrl: urlData.publicUrl,
        bucket: BUCKET_NAME,
        /* The browser client's own upload into this path is allowed by the
           owner-prefix policy, so the page's second strategy still works. */
        tusReady: true,
      },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("Signed upload URL error:", error)
    return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
