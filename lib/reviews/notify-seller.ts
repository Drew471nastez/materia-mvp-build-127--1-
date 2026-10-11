import "server-only"

/**
 * ===========================================================================
 *  TELLING THE STORE ABOUT A NEW REVIEW (Storelib Reviews)
 * ===========================================================================
 * A review written from a review request link or on the website: the bell
 * (seller_notifications, type new_review) and the new review email, both
 * pointing at the review in Reviews. A review waiting for approval says so,
 * and links to the Pending list. The same two the receipt's review sends
 * (app/api/reviews/route.ts). Never fails the review.
 */
import { after } from "next/server"
import { resolveSellerEmail, sendReviewNotificationEmail } from "@/lib/email"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function notifySellerOfReview(
  db: Db,
  input: {
    product: { id: string; title: string | null; slug: string | null; creator_id: string; creatorUserId: string | null }
    reviewId: string
    reviewerName: string
    rating: number
    content: string
    pending: boolean
  },
): Promise<void> {
  const { product, reviewId, reviewerName, rating, content, pending } = input
  if (!product.creatorUserId) return
  try {
    const title = product.title || "your product"
    const preview = content.trim().replace(/\s+/g, " ").slice(0, 120)
    const { error } = await db.from("seller_notifications").insert({
      creator_id: product.creator_id,
      user_id: product.creatorUserId,
      type: "new_review",
      title: pending ? `New ${rating} star review on ${title}, waiting for approval` : `New ${rating} star review on ${title}`,
      message: `${reviewerName}: “${preview}”`,
      action_url: pending ? `/app/reviews?status=pending&review=${reviewId}` : `/app/reviews?review=${reviewId}`,
      product_id: product.id,
      review_id: reviewId,
      metadata: { reviewer_name: reviewerName, rating, content_preview: content.trim().slice(0, 100), pending },
    })
    if (error) {
      console.error("[reviews] notification not written:", error.message)
    } else {
      const creatorId = product.creator_id
      try {
        after(async () => (await import("@/lib/notifications/events")).noteReview(creatorId))
      } catch {
        /* Outside a request: the milestone is noted by the hourly rules instead. */
      }
    }
    const sellerEmail = await resolveSellerEmail(db, product.creator_id)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"
    await sendReviewNotificationEmail(db, {
      sellerEmail,
      creatorId: product.creator_id,
      productTitle: title,
      productSlug: product.slug ?? "",
      reviewerName,
      reviewRating: rating,
      reviewContent: content.trim(),
      baseUrl,
      reviewId,
    })
      .then((result: { success: boolean; error?: string }) => {
        const update = result.success ? { email_sent_at: new Date().toISOString() } : { email_error: result.error }
        return db.from("seller_notifications").update(update).eq("review_id", reviewId)
      })
      .catch((err: unknown) => console.error("[reviews] email not sent:", err instanceof Error ? err.message : "unknown"))
  } catch (e) {
    console.error("[reviews] seller not told:", e instanceof Error ? e.message : "unknown")
  }
}
