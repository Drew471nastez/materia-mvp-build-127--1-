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
 *   4. kept under the store's folder with a random name in the PRIVATE
 *      review-uploads bucket, tied (review_uploads) to the link or the form
 *      it came from, and the malware scan runs after the answer, removing
 *      it if it finds anything
 *
 * Nothing waits in public. A review claims its uploads once (claimUploads:
 * the same owner, unclaimed, under a day old), so a link cannot take a
 * photo another review already has, or one somebody else uploaded. A photo
 * is moved to the public review-photos bucket only while the store's
 * website shows its review and the store has not removed it
 * (syncReviewPhotos); otherwise it is kept in the private bucket. Unclaimed
 * uploads are swept after a day, and a website review nobody confirmed
 * after seven (sweepReviewUploads, from the email cron).
 */
import { randomBytes } from "node:crypto"
import { preparePublicImage } from "@/lib/storage/public-image"
import { screenInBackground } from "@/lib/storage/upload-guard"
import { VIDEO_MAX_BYTES, isVideoPath, readPhotos, websiteStatus, type ReviewPhoto } from "./app-settings"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Public: the photos a website shows. */
export const REVIEW_PHOTO_BUCKET = "review-photos"
/** Private: uploads not claimed yet, and the photos of a review the website does not show. */
export const REVIEW_UPLOAD_BUCKET = "review-uploads"

export const REVIEW_PHOTO_MAX_BYTES = 8 * 1024 * 1024
export const UPLOAD_TTL_MS = 86_400_000
export const DRAFT_TTL_MS = 7 * 86_400_000
const PREVIEW_SECONDS = 3600

/** Who an upload belongs to until a review claims it: "request:<id>", "site:<creatorId>" or "draft:<id>". */
export type UploadOwner = string

export type StoredPhoto = { ok: true; path: string; url: string | null } | { ok: false; status: number; error: string }

export async function storeReviewPhoto(db: Db, creatorId: string, bytes: ArrayBuffer | Uint8Array, owner: UploadOwner): Promise<StoredPhoto> {
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
  const later = "Photos turn on after the store's database update."
  const { error } = await db.storage.from(REVIEW_UPLOAD_BUCKET).upload(path, picture.bytes, { contentType: picture.mime, cacheControl: "31536000", upsert: false })
  if (error) {
    console.error("[reviews] photo not stored:", String(error.message ?? "").slice(0, 120))
    return { ok: false, status: 500, error: /not found|does not exist/i.test(error.message ?? "") ? later : "The upload didn't finish. Try again." }
  }
  const { error: rowError } = await db.from("review_uploads").insert({ path, creator_id: creatorId, owner: owner.slice(0, 80) })
  if (rowError) {
    await db.storage.from(REVIEW_UPLOAD_BUCKET).remove([path]).catch(() => undefined)
    return { ok: false, status: 503, error: later }
  }
  screenInBackground(db, { bytes: picture.bytes, bucket: REVIEW_UPLOAD_BUCKET, path, context: "public_image" })
  return { ok: true, path, url: await signedUrl(db, path) }
}

async function signedUrl(db: Db, path: string): Promise<string | null> {
  try {
    const { data } = await db.storage.from(REVIEW_UPLOAD_BUCKET).createSignedUrl(path, PREVIEW_SECONDS)
    return typeof data?.signedUrl === "string" ? data.signedUrl : null
  } catch {
    return null
  }
}

/**
 * The uploads a review may take: the ones this owner made for this store,
 * not claimed yet and under a day old. Each is claimed once (a conditional
 * update), for `claimAs` when it moves on (a confirmed website review takes
 * its draft's photos). Anything else asked for is left out.
 */
export async function claimUploads(db: Db, a: { creatorId: string; owner: UploadOwner; paths: string[]; claimAs?: UploadOwner; now?: number }): Promise<string[]> {
  const asked = [...new Set(a.paths)].slice(0, 8)
  if (!asked.length) return []
  const since = new Date((a.now ?? Date.now()) - UPLOAD_TTL_MS).toISOString()
  const { data, error } = await db.from("review_uploads").select("path").in("path", asked).eq("creator_id", a.creatorId).eq("owner", a.owner).is("claimed_at", null).gte("created_at", since)
  if (error) return []
  const found = new Set(((data ?? []) as { path: string }[]).map((r) => r.path))
  const out: string[] = []
  for (const path of asked) {
    if (!found.has(path)) continue
    const { data: claimed } = await db
      .from("review_uploads")
      .update({ claimed_at: new Date(a.now ?? Date.now()).toISOString(), owner: (a.claimAs ?? a.owner).slice(0, 80) })
      .eq("path", path)
      .eq("owner", a.owner)
      .is("claimed_at", null)
      .select("path")
    if ((claimed ?? []).length) out.push(path)
  }
  return out
}

/**
 * A video goes straight from the buyer's browser to the private bucket
 * (app/api/reviews/video signs the upload), so the review that names it
 * checks it is really there, a video, and under VIDEO_MAX_BYTES. Paths that
 * are not videos pass through unchanged; a video that fails is left out and
 * its file removed.
 */
export async function verifyVideos(db: Db, paths: string[]): Promise<string[]> {
  const out: string[] = []
  for (const path of paths) {
    if (!isVideoPath(path)) {
      out.push(path)
      continue
    }
    const slash = path.lastIndexOf("/")
    try {
      const { data } = await db.storage.from(REVIEW_UPLOAD_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 })
      const file = ((data ?? []) as { name?: string; metadata?: { size?: number; mimetype?: string } | null }[]).find((f) => f.name === path.slice(slash + 1))
      const size = Number(file?.metadata?.size)
      const type = String(file?.metadata?.mimetype ?? "")
      if (file && Number.isFinite(size) && size > 0 && size <= VIDEO_MAX_BYTES && /^video\//.test(type)) out.push(path)
      else await removeReviewPhotos(db, [path])
    } catch {
      /* Storage did not answer: the video is left off rather than the review refused. */
    }
  }
  return out
}

/** Whether a photo's file belongs in the public bucket: the store's website shows the review, and the store has not removed the photo. */
export function photoIsPublic(review: { status?: unknown; site_status?: unknown }, photo: Pick<ReviewPhoto, "status">): boolean {
  return photo.status === "approved" && websiteStatus(review) === "published"
}

/** Moves each photo's file to where it belongs (photoIsPublic). A move that finds nothing (already there) is fine. Never throws. */
export async function syncReviewPhotos(db: Db, review: { status?: unknown; site_status?: unknown; photos?: unknown }): Promise<void> {
  for (const p of readPhotos(review.photos)) {
    const toPublic = photoIsPublic(review, p)
    try {
      const from = toPublic ? REVIEW_UPLOAD_BUCKET : REVIEW_PHOTO_BUCKET
      await db.storage.from(from).move(p.path, p.path, { destinationBucket: toPublic ? REVIEW_PHOTO_BUCKET : REVIEW_UPLOAD_BUCKET })
    } catch {
      /* Left where it is: the website reads only photos it shows, and the sweep never removes a claimed one. */
    }
  }
}

/** Where the reviewer's own page shows a photo: its public address when it is public, a short signed one otherwise. */
export async function photoViewUrl(db: Db, review: { status?: unknown; site_status?: unknown }, photo: ReviewPhoto): Promise<string | null> {
  return photoIsPublic(review, photo) ? photo.url : signedUrl(db, photo.path)
}

/**
 * Where the store's own list shows each photo and video of these reviews:
 * the public address when the website shows it, else a signed one from the
 * private bucket (a review waiting for approval, a photo the store took off,
 * a video it has not let through yet). One signing call for the lot.
 */
export async function withViewUrls<T extends { status?: unknown; site_status?: unknown; photos: ReviewPhoto[] }>(db: Db, reviews: T[]): Promise<(T & { photos: (ReviewPhoto & { view: string })[] })[]> {
  const privatePaths = [...new Set(reviews.flatMap((r) => r.photos.filter((p) => !photoIsPublic(r, p)).map((p) => p.path)))]
  const signed = new Map<string, string>()
  if (privatePaths.length) {
    try {
      const bucket = db.storage.from(REVIEW_UPLOAD_BUCKET)
      if (typeof bucket.createSignedUrls === "function") {
        const { data } = await bucket.createSignedUrls(privatePaths, PREVIEW_SECONDS)
        for (const s of (data ?? []) as { path?: string; signedUrl?: string }[]) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
      } else {
        for (const path of privatePaths) {
          const url = await signedUrl(db, path)
          if (url) signed.set(path, url)
        }
      }
    } catch {
      /* Unsigned: the list shows the public address, which works for what is public. */
    }
  }
  return reviews.map((r) => ({ ...r, photos: r.photos.map((p) => ({ ...p, view: signed.get(p.path) ?? p.url })) }))
}

/** A review's files, gone from both buckets. */
export async function removeReviewPhotos(db: Db, paths: string[]): Promise<void> {
  if (!paths.length) return
  for (const bucket of [REVIEW_PHOTO_BUCKET, REVIEW_UPLOAD_BUCKET]) {
    try {
      await db.storage.from(bucket).remove(paths)
    } catch {
      /* The review is gone; a file left behind is only a file. */
    }
  }
}

/**
 * The email cron's sweep: uploads no review claimed within a day, and
 * website reviews nobody confirmed within seven days (their address and
 * words with them), and drafts already dealt with after thirty. Never
 * throws.
 */
export async function sweepReviewUploads(db: Db, now = Date.now()): Promise<{ uploads: number; drafts: number }> {
  const out = { uploads: 0, drafts: 0 }
  try {
    const { data: stale } = await db.from("review_uploads").select("path").is("claimed_at", null).lt("created_at", new Date(now - UPLOAD_TTL_MS).toISOString()).limit(200)
    const paths = ((stale ?? []) as { path: string }[]).map((r) => r.path)
    if (paths.length) {
      await removeReviewPhotos(db, paths)
      await db.from("review_uploads").delete().in("path", paths)
      out.uploads = paths.length
    }
    const { data: drafts } = await db.from("review_drafts").select("id, status, photos, created_at").lt("created_at", new Date(now - DRAFT_TTL_MS).toISOString()).limit(200)
    const old = ((drafts ?? []) as { id: string; status: string; photos: unknown; created_at: string }[]).filter((d) => d.status === "waiting" || Date.parse(d.created_at) < now - 30 * 86_400_000)
    for (const d of old) {
      if (d.status === "waiting") {
        const files = Array.isArray(d.photos) ? (d.photos as unknown[]).filter((x): x is string => typeof x === "string") : []
        await removeReviewPhotos(db, files)
        if (files.length) await db.from("review_uploads").delete().in("path", files)
      }
      await db.from("review_drafts").delete().eq("id", d.id)
      out.drafts++
    }
  } catch (e) {
    console.warn("[reviews] upload sweep stopped:", e instanceof Error ? e.message.slice(0, 120) : "unknown")
  }
  return out
}
