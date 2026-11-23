/**
 * ===========================================================================
 *  A NEW REVIEW, ON THE SELLER'S PHONE (r57)
 * ===========================================================================
 * Only the creator's first review ever reached the Storelib app (the
 * first_review milestone, lib/notifications/rules/milestones.ts); every
 * review after it went to the bell and the inbox. Now each review the
 * seller is told about pushes once, from the call that wrote its bell row
 * (lib/notifications/events.ts noteReview). The first review is the same
 * one push, titled as the milestone, so it is never said twice.
 *
 * The stars and the product, never the reviewer's name or words: those are
 * one tap away. A tap opens the review in Reviews, or the Pending list for
 * one waiting for approval. Pure.
 */
import { PUSH_BODY } from "@/lib/notifications/push"

export interface ReviewPushInput {
  userId: string
  reviewId: string
  rating: number
  productTitle: string | null
  pending: boolean
  /** The bell row's own link, inside /app. */
  url: string
}

export function reviewPush(r: ReviewPushInput, first: boolean) {
  const stars = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)))
  const product = (r.productTitle || "").trim().slice(0, 60)
  const title = first ? "Your first review" : r.pending ? "A review is waiting for approval" : `New ${stars} star review`
  return {
    title,
    body: product ? `${stars} ${stars === 1 ? "star" : "stars"} on ${product}` : PUSH_BODY.other,
    data: { type: "notification" as const, kind: "new_review", url: /^\/app(?:[/?#]|$)/.test(r.url) && !r.url.includes("//") ? r.url : "/app/reviews" },
    collapseKey: `review:${r.reviewId}`.slice(0, 64),
    threadId: "reviews",
  }
}
