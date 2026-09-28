"use client"

import { useEffect, useState } from "react"
import { ReviewForm, type OwnReview } from "./review-form"

/**
 * ===========================================================================
 *  THE REVIEW CARD ON A PRODUCT IN THE LIBRARY
 * ===========================================================================
 * The other place a buyer finds their purchase, and the one they come back
 * to: /library/products/<id>. Same card as the receipt's, at any time after
 * the purchase, as Gumroad's library and Etsy's Purchases have it. Their
 * review, once written, is shown here with Edit and Delete.
 *
 * Signed in is a given on this page. The check also hands back their newest
 * order's receipt token, so a review they wrote as a guest (from the receipt
 * link, before they had an account) can be changed from here too.
 *
 * `?rate=4#review` (a star pressed in the library's list, components/
 * library/rate-stars.tsx) chooses the stars before the card is drawn and
 * brings the card into view; the words are still theirs to write.
 */
export function LibraryReview({
  productId,
  productTitle,
  reviewerName,
  reviewerAvatarUrl,
  sellerName,
}: {
  productId: string
  productTitle: string
  reviewerName: string | null
  reviewerAvatarUrl: string | null
  sellerName: string | null
}) {
  const [status, setStatus] = useState<{
    hasPurchased?: boolean
    hasReviewed?: boolean
    existingReview?: OwnReview | null
    receiptToken?: string | null
  } | null>(null)
  const [ready, setReady] = useState(false)
  const [rate, setRate] = useState<number | null>(null)

  useEffect(() => {
    try {
      const n = Number(new URLSearchParams(window.location.search).get("rate"))
      if (Number.isInteger(n) && n >= 1 && n <= 5) setRate(n)
    } catch {
      /* no address to read */
    }
  }, [])

  /* Arrived for the review: once the card is drawn, bring it into view. */
  useEffect(() => {
    if (!ready || typeof window === "undefined" || window.location.hash !== "#review") return
    document.getElementById("review")?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [ready])

  useEffect(() => {
    let live = true
    fetch(`/api/reviews/check?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (live) setStatus(data)
      })
      .catch(() => {})
      .finally(() => {
        if (live) setReady(true)
      })
    return () => {
      live = false
    }
  }, [productId])

  if (!ready || !status) return null
  /* The seller's own copy, a refund, a grant with nothing bought: no card. */
  if (!status.hasPurchased && !status.hasReviewed) return null

  return (
    <section id="review" aria-label="Your review" className="scroll-mt-20">
      <ReviewForm
        productId={productId}
        productTitle={productTitle}
        receiptToken={status.hasReviewed ? status.receiptToken ?? null : null}
        isLoggedIn
        hasPurchased
        hasReviewed={!!status.hasReviewed}
        existingReview={status.existingReview}
        initialRating={status.hasReviewed ? null : rate}
        reviewerName={reviewerName}
        reviewerAvatarUrl={reviewerAvatarUrl}
        sellerName={sellerName}
      />
    </section>
  )
}
