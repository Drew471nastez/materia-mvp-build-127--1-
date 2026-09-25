import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateFile } from "@/lib/storage"
import { storageExtension } from "@/lib/storage/validation"
import { declaresPublicImage, isRenderedDocumentType } from "@/lib/storage/file-signature"
import { PUBLIC_IMAGE_MAX_BYTES } from "@/lib/storage/public-image"
import { UPLOAD_HEADERS, uploadRateLimit } from "@/lib/storage/upload-guard"

const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"

/**
 * A file on a link page is public: whoever gets the link downloads it. That
 * is what a lead magnet is, and it is also what makes a public bucket a free
 * file host for anybody with an account. So there is a ceiling well above a
 * real ebook or template pack.
 */
const LINK_PAGE_FILE_MAX_BYTES = 1024 * 1024 * 1024

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

    // Extension blocklist, double extensions, dangerous types
    const fileValidation = validateFile(fileName, contentType, fileSize)
    if (!fileValidation.valid) {
      return NextResponse.json({ error: fileValidation.reason }, { status: 400, headers: UPLOAD_HEADERS })
    }

    if (isDigital) {
      /* Served from a public URL, so nothing a browser would render as a page. */
      if (isRenderedDocumentType(contentType) || /\.(html?|xhtml|svg|xml|js|mjs)$/i.test(fileName)) {
        return NextResponse.json(
          { error: "Web pages and SVG files cannot be shared from a link page. Put them in a ZIP." },
          { status: 415, headers: UPLOAD_HEADERS },
        )
      }
      if (fileSize > LINK_PAGE_FILE_MAX_BYTES) {
        return NextResponse.json({ error: "That file is over 1 GB." }, { status: 413, headers: UPLOAD_HEADERS })
      }
    } else {
      if (!declaresPublicImage(contentType)) {
        return NextResponse.json(
          { error: "That file is not a picture. Use a JPEG, PNG, WebP, GIF or AVIF." },
          { status: 415, headers: UPLOAD_HEADERS },
        )
      }
      if (fileSize > PUBLIC_IMAGE_MAX_BYTES) {
        return NextResponse.json({ error: "That picture is over 25 MB. Choose a smaller one." }, { status: 413, headers: UPLOAD_HEADERS })
      }
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
