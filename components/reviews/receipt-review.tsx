"use client"

import { useEffect, useState } from "react"
import type { ReceiptItem, ReceiptViewer } from "@/lib/receipts/view"
import { ReviewForm, type OwnReview } from "./review-form"

/**
 * ===========================================================================
 *  THE REVIEW CARD ON THE RECEIPT
 * ===========================================================================
 * For a one-product order, under the files. It asks the server whether this
 * person may review and already has (/api/reviews/check), with the line's
 * receipt token: the token proves the purchase, so a guest who bought
 * without an account reviews from here and never has to sign in, which is
 * where the review request email (lib/notify, REVIEW_REQUEST) lands them.
 *
 * `?rate=4` in the address (a star pressed in that email) chooses the stars
 * before the form is drawn; the words are still theirs to write.
 *
 * Shows nothing until the answer is in, and nothing at all when the server
 * would refuse: the seller themself, or a refunded order.
 */
export function ReceiptReview({
  item,
  viewer,
  receiptPath,
  buyerFirstName,
  sellerName,
  loginHref,
  signupHref,
}: {
  item: ReceiptItem
  viewer: ReceiptViewer
  receiptPath: string
  buyerFirstName: string | null
  sellerName?: string | null
  loginHref: string
  signupHref: string
}) {
  const [status, setStatus] = useState<{
    isLoggedIn?: boolean
    hasPurchased?: boolean
    hasReviewed?: boolean
    existingReview?: OwnReview | null
    blockedReason?: string
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

  useEffect(() => {
    let live = true
    const q = new URLSearchParams({ productId: item.productId })
    if (item.token) q.set("receiptToken", item.token)
    fetch(`/api/reviews/check?${q}`, { cache: "no-store" })
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
  }, [item.productId, item.token])

  if (!ready) return null
  const signedIn = status?.isLoggedIn ?? viewer.signedIn
  /* The review route would say no (the seller themself, a refunded order): offer nothing it refuses. */
  if (status && !status.hasPurchased && !status.hasReviewed) return null

  return (
    <ReviewForm
      productId={item.productId}
      productTitle={item.title}
      orderId={item.orderId}
      receiptToken={item.token}
      isLoggedIn={signedIn}
      hasPurchased
      hasReviewed={!!status?.hasReviewed}
      existingReview={status?.existingReview}
      initialRating={rate}
      redirectUrl={receiptPath}
      reviewerName={viewer.name || buyerFirstName}
      reviewerAvatarUrl={signedIn ? viewer.avatarUrl ?? null : null}
      sellerName={sellerName}
      loginHref={loginHref}
      signupHref={signupHref}
    />
  )
}
