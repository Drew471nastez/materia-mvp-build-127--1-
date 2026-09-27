import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { preparePublicImage } from "@/lib/storage/public-image"
import { FLAGGED_UPLOAD, UPLOAD_HEADERS, screenPublicBytes, uploadRateLimit } from "@/lib/storage/upload-guard"

const BUCKET_NAME = "email-images"

/** A picture in an email is read on a phone; nothing bigger is needed. */
const MAX_EMAIL_IMAGE_BYTES = 5 * 1024 * 1024

// POST - Upload an image for email campaigns
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

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400, headers: UPLOAD_HEADERS })
    }

    if (file.size > MAX_EMAIL_IMAGE_BYTES) {
      return NextResponse.json({ error: "File size must be less than 5MB" }, { status: 400, headers: UPLOAD_HEADERS })
    }

    /* A picture by its bytes, never an SVG, without its location metadata:
       an email goes to a whole list, and so does whatever is in its images. */
    const picture = preparePublicImage(await file.arrayBuffer(), MAX_EMAIL_IMAGE_BYTES)
    if (!picture.ok) {
      return NextResponse.json({ error: picture.error }, { status: picture.status, headers: UPLOAD_HEADERS })
    }

    const fileName = `${creator.id}/${Date.now()}-${crypto.randomUUID().replace(/-/g, "")}.${picture.ext}`
    const screened = await screenPublicBytes(adminSupabase, picture.bytes, { source: "public_image", bucket: BUCKET_NAME, path: fileName })
    if (screened.blocked) {
      return NextResponse.json({ error: FLAGGED_UPLOAD }, { status: 400, headers: UPLOAD_HEADERS })
    }
    const upload = () =>
      adminSupabase.storage.from(BUCKET_NAME).upload(fileName, picture.bytes, {
        contentType: picture.mime,
        cacheControl: "31536000", // Cache for 1 year: the name is never reused
        upsert: false,
      })

    let { data: uploadData, error: uploadError } = await upload()

    /* The bucket is made by migration. Only when storage says it is missing
       is it created here, rather than listing every bucket on every upload. */
    if (uploadError && /not found|does not exist/i.test(uploadError.message)) {
      await adminSupabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_EMAIL_IMAGE_BYTES,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"],
      })
      ;({ data: uploadData, error: uploadError } = await upload())
    }

    if (uploadError || !uploadData) {
      console.error("Upload error:", uploadError)
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500, headers: UPLOAD_HEADERS })
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
      },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("Upload image error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
