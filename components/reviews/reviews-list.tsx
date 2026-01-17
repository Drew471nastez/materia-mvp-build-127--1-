"use client"

import { useState, useEffect } from "react"
import { ReviewCard } from "./review-card"
import { ReviewsRatingBreakdown } from "./reviews-rating-breakdown"
import { Button } from "@/components/ui/button"
import { Star, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Review {
  id: string
  rating: number
  content: string
  created_at: string
  buyer?: {
    id: string
    display_name?: string | null
    avatar_url?: string | null
  } | null
}

interface ReviewsListProps {
  productId: string
  initialReviews?: Review[]
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
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [total, setTotal] = useState(initialTotal)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialReviews.length < initialTotal)
  const [starBreakdown, setStarBreakdown] = useState<{ 5: number; 4: number; 3: number; 2: number; 1: number }>({
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0,
  })

  // Update reviews when initialReviews prop changes
  useEffect(() => {
    setReviews(initialReviews)
    setTotal(initialTotal)
    setHasMore(initialReviews.length < initialTotal)
  }, [initialReviews, initialTotal])

  // Fetch star breakdown
  useEffect(() => {
    if (!productId || isPreview) return

    const fetchBreakdown = async () => {
      try {
        const res = await fetch(`/api/reviews/breakdown?productId=${productId}`)
        const data = await res.json()
        if (data.breakdown) {
          setStarBreakdown(data.breakdown)
        }
      } catch (err) {
        console.error("Failed to fetch reviews breakdown:", err)
      }
    }

    fetchBreakdown()
  }, [productId, isPreview])

  const loadMore = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/reviews?productId=${productId}&limit=10&offset=${reviews.length}`)
      const data = await res.json()

      if (data.reviews) {
        setReviews((prev) => [...prev, ...data.reviews])
        setHasMore(data.hasMore)
        setTotal(data.total)
      }
    } catch (err) {
      console.error("Failed to load more reviews:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // Preview mode: show placeholder or actual data
  if (isPreview) {
    // If there are actual reviews, show them
    if (reviews.length > 0 || reviewsCount > 0) {
      const previewBreakdown = reviewsCount > 0 ? {
        5: Math.round(reviewsCount * 0.8),
        4: Math.round(reviewsCount * 0.15),
        3: Math.round(reviewsCount * 0.05),
        2: 0,
        1: 0,
      } : starBreakdown

      return (
        <div className={cn("space-y-4", isMobile ? "space-y-4" : "space-y-6")}>
          <ReviewsRatingBreakdown
            reviewsCount={reviewsCount || reviews.length}
            reviewsAverage={reviewsAverage || 5.0}
            starBreakdown={previewBreakdown}
            isMobile={isMobile}
            accentColor={accentColor}
            textColor={textColor}
            starColor={starColor}
          />

          {showHeader && (
            <div
              className={cn(
                "flex items-center justify-between border-t",
                isMobile ? "pt-4" : "pt-6"
              )}
              style={{ borderColor: cardBorderColor || undefined }}
            >
              <h3
                className={cn(
                  "font-semibold",
                  isMobile ? "text-base" : "text-lg"
                )}
                style={{ color: textColor || "#111827" }}
              >
                Customer Reviews
              </h3>
            </div>
          )}

          {reviews.length > 0 && (
            <div
              className="divide-y"
              style={{ borderColor: cardBorderColor || "rgb(243, 244, 246)" }}
            >
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
            </div>
          )}
        </div>
      )
    }

    // No reviews in preview mode - show placeholder with 0 reviews
    return (
      <div className={cn("space-y-4", isMobile ? "space-y-4" : "space-y-6")}>
        <ReviewsRatingBreakdown
          reviewsCount={0}
          reviewsAverage={0}
          starBreakdown={{
            5: 0,
            4: 0,
            3: 0,
            2: 0,
            1: 0,
          }}
          isMobile={isMobile}
          accentColor={accentColor}
          textColor={textColor}
          starColor={starColor}
        />
        <div
          className={cn(
            "rounded-xl border border-dashed text-center",
            isMobile ? "p-6" : "p-8"
          )}
          style={{
            borderColor: cardBorderColor || "rgb(209, 213, 219)",
            backgroundColor: cardBackgroundColor ? `${cardBackgroundColor}80` : "rgba(249, 250, 251, 0.5)",
          }}
        >
          <Star
            className={cn("mx-auto mb-3", isMobile ? "h-8 w-8" : "h-10 w-10")}
            style={{ color: starColor ? `${starColor}50` : "rgb(209, 213, 219)" }}
          />
          <p
            className={cn("font-medium", isMobile ? "text-sm" : "text-base")}
            style={{ color: textColor ? `${textColor}cc` : "rgb(107, 114, 128)" }}
          >
            No reviews yet
          </p>
          <p
            className={cn("mt-1", isMobile ? "text-xs" : "text-sm")}
            style={{ color: textColor ? `${textColor}99` : "rgb(156, 163, 175)" }}
          >
            Reviews will appear here once customers leave feedback.
          </p>
        </div>
      </div>
    )
  }

  // Live mode: don't render anything if no reviews
  if (!isPreview && reviews.length === 0 && reviewsCount === 0) {
    return null
  }

  return (
    <div className={cn("space-y-4", isMobile ? "space-y-4" : "space-y-6")}>
      {/* Rating Breakdown */}
      {reviewsCount > 0 && (
        <ReviewsRatingBreakdown
          reviewsCount={reviewsCount}
          reviewsAverage={reviewsAverage}
          starBreakdown={starBreakdown}
          isMobile={isMobile}
          accentColor={accentColor}
          textColor={textColor}
          starColor={starColor}
        />
      )}

      {/* Reviews Header */}
      {showHeader && reviewsCount > 0 && (
        <div
          className={cn(
            "flex items-center justify-between border-t",
            isMobile ? "pt-4" : "pt-6"
          )}
          style={{ borderColor: cardBorderColor || undefined }}
        >
          <h3
            className={cn(
              "font-semibold",
              isMobile ? "text-base" : "text-lg"
            )}
            style={{ color: textColor || "#111827" }}
          >
            Customer Reviews
          </h3>
        </div>
      )}

      {/* Individual Reviews */}
      {reviews.length > 0 && (
        <div
          className="divide-y"
          style={{ borderColor: cardBorderColor || "rgb(243, 244, 246)" }}
        >
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
        </div>
      )}

      {hasMore && (
        <div className="pt-2">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={isLoading}
            className={cn("w-full bg-transparent", isMobile ? "h-10 text-sm" : "")}
            style={{
              borderColor: cardBorderColor || undefined,
              color: textColor || undefined,
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              `Show more reviews (${total - reviews.length} remaining)`
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
