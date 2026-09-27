"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ReviewCard, type ReviewCardData } from "./review-card"
import { ReviewsRatingBreakdown } from "./reviews-rating-breakdown"

/**
 * ===========================================================================
 *  THE REVIEWS ON A PRODUCT PAGE
 * ===========================================================================
 * A heading with the count, then the rating (average, stars, a bar for each
 * number of stars) beside the reviews themselves on a computer and above
 * them on a phone, the way Etsy and Shopify's product reviews lay it out.
 * The first ten come with the page (lib/commerce/product-page-cache, the
 * published ones only); "Show more reviews" reads the next ten from
 * /api/reviews. The bars come from /api/reviews/breakdown.
 *
 * In the builder's preview with no reviews yet, an empty state says where
 * reviews come from. On the live page, no reviews means no section.
 */

type StarCounts = { 5: number; 4: number; 3: number; 2: number; 1: number }
const NONE: StarCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }

interface ReviewsListProps {
  productId: string
  initialReviews?: ReviewCardData[]
  initialTotal?: number
  reviewsCount?: number
  reviewsAverage?: number
  showHeader?: boolean
  isPreview?: boolean
  isMobile?: boolean
  accentColor?: string
  textColor?: string
  starColor?: string
  cardBackgroundColor?: string
  cardBorderColor?: string
}

export function ReviewsList({
  productId,
  initialReviews = [],
  initialTotal = 0,
  reviewsCount = 0,
  reviewsAverage = 0,
  showHeader = true,
  isPreview = false,
  isMobile = false,
  accentColor,
  textColor,
  starColor,
  cardBackgroundColor,
  cardBorderColor,
}: ReviewsListProps) {
  const [reviews, setReviews] = useState<ReviewCardData[]>(initialReviews)
  const [total, setTotal] = useState(initialTotal)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [hasMore, setHasMore] = useState(initialReviews.length < initialTotal)
  const [stars, setStars] = useState<StarCounts>(NONE)

  useEffect(() => {
    setReviews(initialReviews)
    setTotal(initialTotal)
    setHasMore(initialReviews.length < initialTotal)
  }, [initialReviews, initialTotal])

  useEffect(() => {
    if (!productId) return
    let live = true
    fetch(`/api/reviews/breakdown?productId=${encodeURIComponent(productId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.breakdown) setStars(data.breakdown)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [productId])

  const loadMore = async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}&limit=10&offset=${reviews.length}`)
      const data = await res.json()
      if (!res.ok || !Array.isArray(data.reviews)) throw new Error("not read")
      setReviews((prev) => [...prev, ...data.reviews.filter((r: ReviewCardData) => !prev.some((p) => p.id === r.id))])
      setHasMore(Boolean(data.hasMore))
      setTotal(data.total)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }

  const count = reviewsCount || total || reviews.length
  const muted = textColor ? `${textColor}99` : "#6b7280"

  if (count === 0 && reviews.length === 0) {
    if (!isPreview) return null
    return (
      <div className="rounded-2xl border border-dashed px-6 py-10 text-center" style={{ borderColor: cardBorderColor || "#d5d9e0", backgroundColor: cardBackgroundColor || "transparent" }}>
        <p className="text-[15px] font-semibold" style={{ color: textColor || "#1a1a2e" }}>
          No reviews yet
        </p>
        <p className="mt-1 text-[13px]" style={{ color: muted }}>
          Buyers can review this product from their receipt or their library. Their reviews show here.
        </p>
      </div>
    )
  }

  const average = reviewsAverage || (reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0)

  return (
    <div id="reviews" data-reviews-block="" className="scroll-mt-20">
      {showHeader ? (
        <h2 className={cn("font-semibold tracking-[-0.01em]", isMobile ? "text-[18px]" : "text-[20px]")} style={{ color: textColor || "#1a1a2e" }}>
          Reviews <span className="font-normal tabular-nums" style={{ color: muted }}>({count})</span>
        </h2>
      ) : null}

      <div className={cn("mt-4 grid gap-6", !isMobile && "md:mt-5 md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] md:gap-10")}>
        <div className={cn(!isMobile && "md:sticky md:top-24 md:self-start")}>
          <ReviewsRatingBreakdown
            reviewsCount={count}
            reviewsAverage={average}
            starBreakdown={stars}
            isMobile={isMobile}
            accentColor={accentColor}
            textColor={textColor}
            starColor={starColor}
            cardBorderColor={cardBorderColor}
          />
        </div>

        <div className="min-w-0">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              isMobile={isMobile}
              textColor={textColor}
              starColor={starColor}
              cardBackgroundColor={cardBackgroundColor}
              cardBorderColor={cardBorderColor}
            />
          ))}

          {hasMore ? (
            <div className="pt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoading}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border px-4 text-[14px] font-medium transition-colors duration-100 hover:bg-black/[0.03] disabled:opacity-60 sm:w-auto"
                style={{ borderColor: cardBorderColor || "#d5d9e0", color: textColor || "#1a1a2e" }}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isLoading ? "Loading" : "Show more reviews"}
              </button>
              {loadError ? (
                <p role="alert" className="mt-2 text-[13px]" style={{ color: muted }}>
                  More reviews could not be loaded. Try again.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
