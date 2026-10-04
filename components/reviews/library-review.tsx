"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ChevronRight } from "lucide-react"
import { Stars } from "./stars"
import type { OwnReview } from "./review-form"

/**
 * ===========================================================================
 *  THE REVIEW LINE ON A PRODUCT IN THE LIBRARY
 * ===========================================================================
 * /library/products/<id> used to carry the whole review card, stars and
 * words and Edit and Delete, a second place to do what the Reviews tab
 * does. The owner asked for rating and reviewing to happen in one place, the
 * Reviews tab, so this is one line that goes there: their stars and Edit
 * once they have reviewed it, or Write a review. Both open that purchase on
 * /library/reviews with its composer ready (components/library/
 * library-reviews.tsx, ?product=<id>).
 *
 * It asks /api/reviews/check whether a review would be taken, and shows
 * nothing for the seller's own copy or a refund, which the route refuses.
 * The props it no longer uses are kept so the page reads the same.
 */
export function LibraryReview({
  productId,
}: {
  productId: string
  productTitle?: string
  reviewerName?: string | null
  reviewerAvatarUrl?: string | null
  sellerName?: string | null
}) {
  const [status, setStatus] = useState<{ hasPurchased?: boolean; hasReviewed?: boolean; existingReview?: OwnReview | null } | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/reviews/check?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (live) setStatus(data)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [productId])

  if (!status) return null
  if (!status.hasPurchased && !status.hasReviewed) return null
  const rating = status.hasReviewed ? Number(status.existingReview?.rating) || 0 : 0
  const href = `/account/library/reviews?product=${encodeURIComponent(productId)}`

  return (
    <Link
      id="review"
      href={href}
      data-product-review={status.hasReviewed ? "reviewed" : "open"}
      className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-[#e4e7ec]/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)] transition-colors hover:bg-[#fcfcfd] sm:px-5"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-[#1a1a2e]">{status.hasReviewed ? "Your review" : "Review this purchase"}</span>
        {status.hasReviewed && rating > 0 ? (
          <Stars rating={rating} size={14} className="mt-1" />
        ) : (
          <span className="block text-[12.5px] text-[#6b7280]">A few words help the next buyer.</span>
        )}
      </span>
      <span className="shrink-0 text-[13px] font-medium text-[#4b5563]">{status.hasReviewed ? "Edit" : "Write a review"}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
    </Link>
  )
}
