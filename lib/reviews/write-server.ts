import "server-only"

/**
 * ===========================================================================
 *  STORELIB REVIEWS: WRITING ONE
 * ===========================================================================
 * The two ways a review arrives through the app, both server only (nobody
 * writes reviews from the browser: part 52 took that away):
 *
 *   from a request link   /api/reviews/request: the link names one order
 *                         line, so the review is that order's, verified,
 *                         and on the buyer's account when the order is
 *   on the website        /api/reviews/site, when the store lets anyone
 *                         write: never verified (a buyer's address is sent
 *                         their own link instead)
 *
 * The store's rule (initialStatus) decides where the review starts on the
 * store's website. A verified buyer's review is published for Storelib
 * either way and waits, when it waits, on the website only (site_status);
 * an unverified one waits everywhere (app-settings startingStatus). The
 * ratings are counted again (published only), the
 * store is told, and its photos are the uploads the caller claimed
 * (photos-server claimUploads), moved to the public bucket only while the
 * website shows the review (syncReviewPhotos).
 */
import { canDeliver } from "@/lib/receipts/rules"
import { refreshReviewStats } from "./store"
import { isVideoPath, spamHold, startingStatus, type ReviewPhoto, type ReviewsAppSettings } from "./app-settings"
import { notifySellerOfReview } from "./notify-seller"
import { REVIEW_PHOTO_BUCKET, syncReviewPhotos } from "./photos-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export { REVIEW_PHOTO_BUCKET }

/** Each photo path as the review stores it: its address in the public bucket, approved. A video is held until the store looks at it (app-settings ReviewPhoto). */
export function photoEntries(db: Db, paths: string[]): ReviewPhoto[] {
  const out: ReviewPhoto[] = []
  for (const path of paths) {
    try {
      const url = db.storage?.from(REVIEW_PHOTO_BUCKET).getPublicUrl(path)?.data?.publicUrl
      if (typeof url === "string" && /^https:\/\//.test(url)) out.push(isVideoPath(path) ? { path, url, status: "held", kind: "video" } : { path, url, status: "approved" })
    } catch {
      /* A storage client that cannot say: the photo is left off rather than the review refused. */
    }
  }
  return out
}

export interface NewAppReview {
  creatorId: string
  product: { id: string; title: string | null; slug: string | null; creator_id: string }
  creatorUserId: string | null
  settings: ReviewsAppSettings
  rating: number
  title: string
  content: string
  /** "Jane D.", or null. */
  name: string | null
  photoPaths: string[]
  buyerId: string | null
  orderId: string | null
  verified: boolean
  source: "request" | "site"
  /** A website review: the store hears about it in the bell now and in one email for several (lib/reviews/digest-server), not an email each. */
  digest?: boolean
  /** A visitor's address and network hash, kept apart from the public row (review_authors). */
  author?: { email: string | null; ipHash: string | null } | null
}

/** `status` is the store's website's: "pending" while the store has not approved it there. */
export type WriteResult = { ok: true; review: Record<string, unknown>; status: "published" | "pending" } | { ok: false; status: number; error: string; alreadyReviewed?: boolean }

export async function insertAppReview(db: Db, r: NewAppReview): Promise<WriteResult> {
  /* A link or one of the store's own words: it waits for the store whatever the publish rule says (app-settings spamHold). */
  const held = spamHold(r.settings, { title: r.title, content: r.content, name: r.name })
  const start = startingStatus(held ? { publish: "manual", minStars: 5 } : r.settings, r.rating, r.verified)
  const status: "published" | "pending" = start.site_status === "pending" || start.status === "pending" ? "pending" : "published"
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    product_id: r.product.id,
    creator_id: r.creatorId,
    buyer_id: r.buyerId,
    order_id: r.orderId,
    rating: r.rating,
    title: r.title || null,
    content: r.content,
    reviewer_name: r.name,
    status: start.status,
    site_status: start.site_status,
    verified: r.verified,
    source: r.source,
    photos: photoEntries(db, r.photoPaths),
    published_at: start.status === "published" ? now : null,
  }
  const { data: review, error } = await db.from("reviews").insert(row).select("*").single()
  if (error || !review) {
    if ((error as { code?: string } | null)?.code === "23505") return { ok: false, status: 409, error: "You already reviewed this product.", alreadyReviewed: true }
    const code = String((error as { code?: string } | null)?.code ?? "")
    if (code === "42703" || code === "PGRST204" || code === "23514") return { ok: false, status: 409, error: "Reviews are being updated on this store. Try again later." }
    console.error("[reviews] app review not saved:", code || "unknown")
    return { ok: false, status: 500, error: "The review did not save. Try again." }
  }
  if (r.author && (r.author.email || r.author.ipHash)) {
    await db
      .from("review_authors")
      .insert({ review_id: review.id, creator_id: r.creatorId, product_id: r.product.id, email: r.author.email, ip_hash: r.author.ipHash })
      .then(
        () => undefined,
        () => undefined,
      )
  }
  await syncReviewPhotos(db, review)
  await refreshReviewStats(db, { productId: r.product.id, creatorId: r.creatorId, productSlug: r.product.slug })
  await notifySellerOfReview(db, {
    product: { ...r.product, creatorUserId: r.creatorUserId },
    reviewId: review.id,
    reviewerName: r.name || (r.verified ? "A verified buyer" : "A customer"),
    rating: r.rating,
    content: r.content,
    pending: status === "pending",
    digest: r.digest === true,
  })
  return { ok: true, review, status }
}

/**
 * The order of this product an address bought and still has, for a
 * visitor's review: the one that makes it verified. Null when none.
 */
export async function purchaseByAddress(db: Db, productId: string, email: string): Promise<{ id: string; buyer_id: string | null } | null> {
  const { data } = await db.from("orders").select("id, buyer_id, status, amount_cents, refund_amount_cents").eq("buyer_email", email).eq("product_id", productId).limit(20)
  const open = ((data ?? []) as { id: string; buyer_id: string | null }[]).find((o) => canDeliver(o as never))
  return open ?? null
}

/** Whether an address (or the order it bought with) already reviewed this product. */
export async function addressReviewed(db: Db, creatorId: string, productId: string, email: string, orderId: string | null, buyerId: string | null): Promise<boolean> {
  const [byAuthor, byOrder, byBuyer] = await Promise.all([
    db.from("review_authors").select("review_id").eq("creator_id", creatorId).eq("email", email).eq("product_id", productId).limit(1),
    orderId ? db.from("reviews").select("id").eq("order_id", orderId).limit(1) : Promise.resolve({ data: [] }),
    buyerId ? db.from("reviews").select("id").eq("buyer_id", buyerId).eq("product_id", productId).limit(1) : Promise.resolve({ data: [] }),
  ])
  return [byAuthor, byOrder, byBuyer].some((r: { data?: unknown[] | null }) => (r.data ?? []).length > 0)
}
