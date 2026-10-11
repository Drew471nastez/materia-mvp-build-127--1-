import { randomBytes } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/receipts/rules"
import { preparePublicImage } from "@/lib/storage/public-image"
import { UPLOAD_HEADERS, screenInBackground } from "@/lib/storage/upload-guard"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { verifyRequest } from "@/lib/reviews/request-token"
import { REVIEW_PHOTO_BUCKET } from "@/lib/reviews/write-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A PHOTO FOR A REVIEW (Storelib Reviews)
 * ===========================================================================
 *   POST multipart { file, token }        from a review request link
 *   POST multipart { file, productId }    on a website that lets anyone write
 *
 * Only for a store that takes photos. The picture goes through the same
 * gate as every public picture on Storelib (lib/storage/public-image): a
 * raster image by its bytes (never an SVG or a page called .jpg), at most
 * 8 MB and 50 megapixels, its location and camera data removed. Then the
 * picture reader (lib/security/images/classify): one that reads as adult is
 * refused, and one it would hold is refused too, since a review photo has
 * nobody to hold it for. The malware scan runs after the answer, as for
 * every upload, and removes the file if it finds anything.
 *
 * Stored under the store's folder with a random name; the review form sends
 * the path back, and the review routes accept only paths in that folder.
 */
const MAX_BYTES = 8 * 1024 * 1024
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: UPLOAD_HEADERS })

export async function POST(request: NextRequest) {
  const limited = await rateLimit({ bucket: "review-photo", subjects: [addressSubject(request)], windows: [{ limit: 12, seconds: 600 }, { limit: 40, seconds: 86_400 }], message: "That is a lot of photos at once. Try again later." })
  if (limited) return limited

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: "Bad request" }, 400)
  }
  const file = form.get("file")
  if (!(file instanceof File)) return json({ error: "Choose a photo." }, 400)
  if (file.size > MAX_BYTES) return json({ error: "That photo is too large. Use one under 8 MB." }, 413)

  const db = createAdminClient()
  let creatorId: string | null = null
  const token = form.get("token")
  const productId = form.get("productId")
  if (typeof token === "string" && token) {
    const id = verifyRequest(token)
    if (!id) return json({ error: "This review link does not work." }, 404)
    const { data } = await db.from("review_requests").select("creator_id").eq("id", id).maybeSingle()
    creatorId = (data as { creator_id?: string } | null)?.creator_id ?? null
  } else if (typeof productId === "string" && isUuid(productId)) {
    const { data } = await db.from("products").select("creator_id, status").eq("id", productId).maybeSingle()
    if ((data as { status?: string } | null)?.status === "published") creatorId = (data as { creator_id?: string }).creator_id ?? null
  }
  if (!creatorId) return json({ error: "This product is not available." }, 404)
  const { settings } = await loadReviewsApp(db, creatorId)
  if (!settings.photos || (!token && (!settings.enabled || settings.who !== "anyone"))) return json({ error: "This store does not take photos with reviews." }, 403)

  const picture = preparePublicImage(await file.arrayBuffer(), MAX_BYTES)
  if (!picture.ok) return json({ error: picture.error }, picture.status)
  if (!["jpg", "png", "webp", "gif", "avif"].includes(picture.ext)) return json({ error: "Use a JPG, PNG or WebP photo." }, 415)

  /* What it looks like: a review photo is public the moment its review is. */
  try {
    const { imageClassifier, judgePicture, readPicture } = await import("@/lib/security/images/classify")
    const classifier = await imageClassifier().catch(() => null)
    const reading = await readPicture(picture.bytes, classifier).catch(() => null)
    const verdict = judgePicture(reading, { fresh: true, team: false, classifierOn: !!classifier })
    if (verdict.action !== "ok") return json({ error: "This photo can't be posted with a review. Try another one." }, 422)
  } catch {
    /* The reader is not there (a build without it): the size and type checks above still hold. */
  }

  const path = `${creatorId}/${randomBytes(16).toString("hex")}.${picture.ext}`
  const { error } = await db.storage.from(REVIEW_PHOTO_BUCKET).upload(path, picture.bytes, { contentType: picture.mime, cacheControl: "31536000", upsert: false })
  if (error) {
    console.error("[reviews] photo not stored:", error.message?.slice(0, 120))
    return json({ error: /not found|does not exist/i.test(error.message ?? "") ? "Photos turn on after the store's database update." : "The upload didn't finish. Try again." }, 500)
  }
  screenInBackground(db, { bytes: picture.bytes, bucket: REVIEW_PHOTO_BUCKET, path, context: "public_image" })
  const { data: url } = db.storage.from(REVIEW_PHOTO_BUCKET).getPublicUrl(path)
  return json({ path, url: url?.publicUrl ?? null })
}
