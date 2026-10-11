import "server-only"

/**
 * ===========================================================================
 *  A REVIEW PHOTO, CHECKED AND KEPT (Storelib Reviews)
 * ===========================================================================
 * The one way a photo reaches the review-photos bucket, for the upload route
 * (the review page) and for the website's review form, which posts its
 * photos with the review:
 *
 *   1. the same gate as every public picture (lib/storage/public-image): a
 *      raster image by its bytes, never an SVG or a page named .jpg, at most
 *      8 MB and 50 megapixels, its location and camera data removed
 *   2. JPG, PNG, WebP, GIF or AVIF, what the bucket takes
 *   3. the picture reader (lib/security/images/classify): adult, or one it
 *      would hold, is refused; a review photo has nobody to hold it for
 *   4. kept under the store's folder with a random name, and the malware
 *      scan runs after the answer, removing it if it finds anything
 */
import { randomBytes } from "node:crypto"
import { preparePublicImage } from "@/lib/storage/public-image"
import { screenInBackground } from "@/lib/storage/upload-guard"
import { REVIEW_PHOTO_BUCKET } from "./write-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const REVIEW_PHOTO_MAX_BYTES = 8 * 1024 * 1024

export type StoredPhoto = { ok: true; path: string; url: string | null } | { ok: false; status: number; error: string }

export async function storeReviewPhoto(db: Db, creatorId: string, bytes: ArrayBuffer | Uint8Array): Promise<StoredPhoto> {
  const size = bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength
  if (size > REVIEW_PHOTO_MAX_BYTES) return { ok: false, status: 413, error: "That photo is too large. Use one under 8 MB." }
  const picture = preparePublicImage(bytes, REVIEW_PHOTO_MAX_BYTES)
  if (!picture.ok) return { ok: false, status: picture.status, error: picture.error }
  if (!["jpg", "png", "webp", "gif", "avif"].includes(picture.ext)) return { ok: false, status: 415, error: "Use a JPG, PNG or WebP photo." }
  try {
    const { imageClassifier, judgePicture, readPicture } = await import("@/lib/security/images/classify")
    const classifier = await imageClassifier().catch(() => null)
    const reading = await readPicture(picture.bytes, classifier).catch(() => null)
    const verdict = judgePicture(reading, { fresh: true, team: false, classifierOn: !!classifier })
    if (verdict.action !== "ok") return { ok: false, status: 422, error: "This photo can't be posted with a review. Try another one." }
  } catch {
    /* The reader is not there: the checks above still hold. */
  }
  const path = `${creatorId}/${randomBytes(16).toString("hex")}.${picture.ext}`
  const { error } = await db.storage.from(REVIEW_PHOTO_BUCKET).upload(path, picture.bytes, { contentType: picture.mime, cacheControl: "31536000", upsert: false })
  if (error) {
    console.error("[reviews] photo not stored:", String(error.message ?? "").slice(0, 120))
    return { ok: false, status: 500, error: /not found|does not exist/i.test(error.message ?? "") ? "Photos turn on after the store's database update." : "The upload didn't finish. Try again." }
  }
  screenInBackground(db, { bytes: picture.bytes, bucket: REVIEW_PHOTO_BUCKET, path, context: "public_image" })
  const { data } = db.storage.from(REVIEW_PHOTO_BUCKET).getPublicUrl(path)
  return { ok: true, path, url: data?.publicUrl ?? null }
}
